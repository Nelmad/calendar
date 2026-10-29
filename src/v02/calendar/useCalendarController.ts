import {useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState} from 'react';
import type {CalendarProps} from '../reference.js';
import type {CalendarSurface} from '../surface.js';
import {clampToMonth, commitNavigation, inRange, navigationDate, reconcileAgenda, requestNavigation, sameAgenda, sameNavigation, shiftMonth,
    type AgendaState, type NavigationKind, type NavigationSource, type NavigationState} from '../core/controller.js';
import type {LocalizedText} from '../core/formatting.js';
import {activeElement, focusElement, revealFocused} from './dom.js';
import {createOverlayStack} from './overlays.js';
import {createMirrorHub} from '../primitives/mirror.js';
import {createCalendarModel, createControllerServices, type CalendarModel} from './model.js';
import {useToday} from './useToday.js';
import {useRootName} from './useRootName.js';
import {useLayoutObserver, useResolvedLayout} from './useResponsiveLayout.js';
import {useSelection} from './useSelection.js';
import {useMoveRequests} from './useMoveRequests.js';
import {createMoveRegistry} from '../core/moveRequests.js';

const useClientLayoutEffect = typeof document === 'undefined' ? useEffect : useLayoutEffect;
const joined = (base: readonly LocalizedText[] | undefined, extra: readonly LocalizedText[] | undefined) => extra?.length ? [...base ?? [], ...extra] : base;
/**
 * Diagnostics of render-time message calls (for example a `messages` function returning '') and item colors reach the
 * development console after the commit of any component that rendered them, once each (QA-23).
 */
function useDevelopmentMessageDiagnostics(model: CalendarModel<unknown, unknown>, warn: (path: string, reason: string) => void) {
    useEffect(() => {
        if (model.kind !== 'data') return;
        // Item and source color diagnostics (§10.3.3) are render-time data of the same kind.
        for (const diagnostic of [...model.drainDiagnostics(), ...model.appearance.drain()]) warn(diagnostic.path, diagnostic.reason);
    });
}
/** Production builds report nothing, so they register no effect at all (§11.3); the choice is fixed per build. */
export const useMessageDiagnostics: typeof useDevelopmentMessageDiagnostics = process.env.NODE_ENV === 'production' ? () => undefined : useDevelopmentMessageDiagnostics;

/** The stored roving state while it is a saved logical date or still names the previous month (§5.1.1 clamps that one). */
const storedNavigation = (state: NavigationState | null, snapshot: {month: string} | null, saved: boolean) =>
    state && (saved || !snapshot || state.month !== snapshot.month) ? state : null;

export function useCalendarController<I, S>(input: CalendarProps<I, S>, surface?: CalendarSurface) {
    const [services] = useState(() => createControllerServices(surface));
    // The model is memoized per instance by its real inputs: an unchanged render yields the same model (QA-01).
    const [calendarModel] = useState(() => createCalendarModel(services));
    // This mount's move request registry: it lives until unmount and a new mount starts empty (#10).
    const [moveRegistry] = useState(createMoveRegistry);
    // One overlay ownership tree (and live routing) and one portal-mirror hub per Calendar instance.
    // useId keeps the DOM ids of this Calendar's overlays unique among several Calendars (T17-V1-D3).
    const overlayPrefix = useId(), [overlays] = useState(() => createOverlayStack(overlayPrefix)), [mirror] = useState(createMirrorHub);
    const rootRef = useRef<HTMLDivElement>(null), gridRef = useRef<HTMLDivElement>(null), viewRef = useRef<HTMLDivElement>(null), weekdaysRef = useRef<HTMLDivElement>(null);
    const agendaRef = useRef<HTMLElement>(null);
    const todayRef = useRef<HTMLButtonElement>(null), statusRef = useRef<HTMLDivElement>(null);
    const politeRef = useRef<HTMLDivElement>(null), urgentRef = useRef<HTMLDivElement>(null);
    const cells = useRef(new Map<string, HTMLElement>());
    const [navigation, setNavigation] = useState<NavigationState | null>(null), navRef = useRef<NavigationState | null>(null);
    const [agenda, setAgenda] = useState<AgendaState | null>(null);
    const initiator = useRef<HTMLElement | null>(null);
    const lastFocus = useRef<{node: Element; surface: 'grid' | 'view' | 'other'} | null>(null);
    const lastRange = useRef<string | null>(null), lastStatus = useRef<string | null>(null), completionShown = useRef(false);
    const warnings = useRef(new Set<string>());
    const warn = useCallback((path: string, reason: string, key = `${path}: ${reason}`) => {
        if (process.env.NODE_ENV === 'production') return;
        if (!warnings.current.has(key)) { warnings.current.add(key); console.warn(`[@nelmad/calendar] ${path}: ${reason}`); }
    }, []);
    const responsive = useResolvedLayout(input.layout);
    const model = calendarModel(input, responsive.layout, moveRegistry);
    useLayoutObserver(rootRef, model.kind === 'data' && (model.props.layout ?? 'auto') === 'auto', responsive.forced, model.kind === 'data' ? model.props.mobileBreakpoint : undefined,
        responsive.layout, responsive.settle, mirror.notify);
    useMessageDiagnostics(model as CalendarModel<unknown, unknown>, warn);
    useClientLayoutEffect(() => overlays.setRootLive(() => ({polite: politeRef.current, urgent: urgentRef.current})), [overlays]);
    // Every committed render of this Calendar refreshes its open portal mirrors (§10.3.4).
    useClientLayoutEffect(() => { mirror.notify(); });
    const today = useToday(rootRef, model.kind === 'data' ? input.timeZone : undefined, model.kind === 'data' ? input.today : undefined, services);
    const labelledBy = useRootName(rootRef, typeof input['aria-labelledby'] === 'string' ? input['aria-labelledby'] : undefined, warn);
    const month = model.kind === 'data' ? model.month : null, range = model.kind === 'data' ? model.range : null;
    const snapshot = useMemo(() => month && range ? {month, range, blocking: model.blocking} : null, [month, range, model.blocking]);
    // A reconciliation equal to the stored agenda keeps its identity, so the commit effect settles.
    const currentAgenda = useMemo(() => {
        if (!month) return agenda;
        const next = reconcileAgenda(agenda, month, input.agendaDate, today);
        return agenda && sameAgenda(agenda, next) ? agenda : next;
    }, [agenda, month, input.agendaDate, today]);
    const initialDate = model.kind === 'data' ? [currentAgenda?.date, input.selection?.start, today, model.month]
        .find((date): date is string => !!date && inRange(date, model.range))! : null;
    // §12.1: until a logical date is saved (a focused date, a navigation request, or an external month change, which keeps
    // the day number by §5.1.1), the roving target is derived again on every render, so it follows the agenda date and a
    // later known today; the stored derivation of an earlier render is no saved date (review 2026-10-09-3).
    const [saved, setSaved] = useState(false), savedRef = useRef(false);
    const save = useCallback(() => { if (!savedRef.current) { savedRef.current = true; setSaved(true); } }, []);
    const currentNavigation = useMemo(() => storedNavigation(navigation, snapshot, saved) ?? (snapshot ? {month: snapshot.month, date: initialDate!, intent: null} : null),
        [saved, navigation, snapshot, initialDate]);
    const focusDate = currentNavigation && snapshot ? navigationDate(currentNavigation, snapshot) : null;
    // An equal state is never queued again: inside a hydrating Suspense boundary React cannot bail out of
    // a same-value update early, so a redundant update would re-render (QA-01).
    const updateNavigation = useCallback((next: NavigationState) => {
        if (navRef.current && sameNavigation(navRef.current, next)) return;
        navRef.current = next;
        setNavigation(next);
    }, []);
    const cancelNavigation = useCallback(() => {
        const state = navRef.current;
        if (state?.intent) updateNavigation({...state, intent: null});
        initiator.current = null;
    }, [updateNavigation]);
    const focusDateCell = useCallback((date: string) => focusElement(cells.current.get(date)), []);
    const getDateCell = useCallback((date: string) => cells.current.get(date), []);
    // Its commit effect runs before the one below, which merges the queued selection speech into its own payload.
    const selection = useSelection(model, {overlays, warn, rootRef, gridRef, weekdaysRef, getDateCell, focusDate, agendaDate: currentAgenda?.date ?? null});
    const {take: takeSelection, cancelDraft: cancelSelectionDraft} = selection;
    // Its commit effect also runs before the one below: transitions are applied and results owed before that payload.
    const move = useMoveRequests(model, {registry: moveRegistry, overlays, warn});
    const {take: takeMove, watch: watchMove} = move;

    useEffect(() => {
        const root = rootRef.current, document = root?.ownerDocument;
        if (!root || !document) return;
        const focusScope = root.getRootNode();
        const onFocus = () => {
            const node = activeElement(document), inAgenda = overlays.contains(node);
            if (overlays.retired(node)) return;
            // The standalone source selector is portaled too: focus there is still inside this Calendar.
            const inside = !!node && (root.contains(node) || overlays.owns(node)), inGrid = !!node && !!gridRef.current?.contains(node);
            lastFocus.current = node && inside ? {node, surface: inGrid ? 'grid' : inAgenda || viewRef.current?.contains(node) ? 'view' : 'other'} : null;
            const intent = navRef.current?.intent;
            if (intent && !(intent.source === 'toolbar' ? inside : intent.source === 'grid' ? inGrid : node === initiator.current)) cancelNavigation();
        };
        // A press that moved focus out of the Calendar, also to body (which fires no focusin), means the user left it:
        // a control removed by a later update is not displaced focus, so nothing is recovered (§5.1.1, §12.3).
        // A mouse moves focus at mousedown, before pointerup (which also covers a secondary button, no click). A touch moves
        // it at the compatibility mousedown after pointerup and touchend: the click after it sees the settled focus (review 2026-10-09-2, round 2).
        const press = () => {
            const node = activeElement(document);
            if (!node || !(root.contains(node) || overlays.owns(node))) lastFocus.current = null;
        };
        document.addEventListener('focusin', onFocus, true);
        // Retargeting trims focus events between two nodes inside one ShadowRoot
        // before they reach Document. Observe that scope as well as external focus.
        if (focusScope !== document) focusScope.addEventListener('focusin', onFocus, true);
        document.addEventListener('keydown', cancelNavigation, true);
        document.addEventListener('pointerdown', cancelNavigation, true);
        document.addEventListener('pointerup', press, true);
        document.addEventListener('click', press, true);
        document.defaultView?.addEventListener('blur', cancelNavigation);
        return () => {
            document.removeEventListener('focusin', onFocus, true);
            if (focusScope !== document) focusScope.removeEventListener('focusin', onFocus, true);
            document.removeEventListener('keydown', cancelNavigation, true);
            document.removeEventListener('pointerdown', cancelNavigation, true);
            document.removeEventListener('pointerup', press, true);
            document.removeEventListener('click', press, true);
            document.defaultView?.removeEventListener('blur', cancelNavigation);
        };
    }, [cancelNavigation, overlays]);

    // Only committed props can notify, acknowledge an intent or recover focus.
    useEffect(() => {
        const root = rootRef.current;
        if (!root) return;
        const active = activeElement(root.ownerDocument), old = lastFocus.current;
        const tree = root.getRootNode() as Document | ShadowRoot;
        const unavailable = !!old && (!old.node.isConnected || !!old.node.closest('[hidden], [disabled], [inert], [aria-disabled="true"]'));
        const removed = unavailable && (active === root.ownerDocument.body || ('host' in tree && active === tree.host));
        const inGrid = !!active && !!gridRef.current?.contains(active) || (removed && old.surface === 'grid');
        const inCalendar = !!active && (root.contains(active) || overlays.owns(active)) || removed;
        let recovered = false;
        if (model.blocking && (removed || !!active && !!viewRef.current?.contains(active))) recovered = focusElement(statusRef.current);
        if (recovered) revealFocused(root.ownerDocument);
        const state = storedNavigation(navRef.current, snapshot, savedRef.current) ?? currentNavigation;
        const result = state ? commitNavigation(state, snapshot, {grid: inGrid, calendar: inCalendar, initiator: active === initiator.current}) : null;
        let navigationFocused = false;
        if (result) {
            if (result.external) cancelSelectionDraft();
            if (result.state.month !== state!.month) save();
            updateNavigation(result.state);
            if (result.focus) navigationFocused = focusDateCell(result.focus);
            if (!result.state.intent) initiator.current = null;
        }
        // A status region (or its retry control) can disappear when content returns.
        // Recover only displaced owned focus; an external active element wins. While the view's
        // modal surface is mounted its background is inert: the view recovers after removing it.
        const modal = overlays.hasModal();
        if (!model.blocking && removed && !navigationFocused && !modal && !overlays.moving()) {
            const date = result?.state.date;
            if (!date || !focusDateCell(date)) {
                const toolbarControls = root.querySelectorAll<HTMLElement>('.nc-calendar-toolbar button');
                if ([...toolbarControls].some(focusElement) || focusElement(root)) revealFocused(root.ownerDocument);
            }
        }
        if (currentAgenda && currentAgenda !== agenda) setAgenda(currentAgenda);

        const dataState = model.state.dataState;
        const status = `${model.kind}/${dataState.status}/${dataState.status === 'ready' ? '' : dataState.phase}`;
        const changedStatus = lastStatus.current !== status;
        const previousStatus = lastStatus.current; lastStatus.current = status;
        const polite: LocalizedText[] = [], urgent: LocalizedText[] = [];
        if (result?.announce && model.kind === 'data') polite.push(model.message('monthChangedAnnouncement', result.announce));
        // QA-D-3 (lead decision on QA-08): the start of a refresh is not written to a live region. §12.4 defines only
        // `refreshCompletedAnnouncement` for it; the visible progress and `aria-busy` convey the busy state. So a month
        // announcement is never replaced by a refresh the host starts for that month, and the polite host keeps it.
        const refreshStart = changedStatus && status === 'data/loading/refresh';
        if (changedStatus && !recovered) {
            if (model.kind === 'contract') urgent.push(model.messages.invalidConfigurationLabel);
            else if (dataState.status === 'loading' && dataState.phase === 'initial') polite.push(model.message('loadingLabel'));
            else if (dataState.status === 'error') urgent.push(model.message('errorLabel'));
            else if (dataState.status === 'ready' && previousStatus === 'data/loading/refresh') polite.push(model.message('refreshCompletedAnnouncement'));
        }
        const completed = polite.length === 1 && !result?.announce && dataState.status === 'ready' && changedStatus;
        // Routed to exactly one endpoint pair: the top-most modal surface of this Calendar, else the root (§12.4). A status
        // change clears the stale text of the other channel. A silent refresh start clears a stale error and a stale
        // completion, so the next completion is a new payload, not the same text again (QA-D-4-02); a month stays.
        const politePayload = urgent.length ? [] : refreshStart && !polite.length ? completionShown.current ? [] : undefined : polite;
        if (changedStatus || polite.length || urgent.length) {
            // One DOM mutation per channel: selection and move speech queued for this commit joins this payload instead of
            // replacing it, after the status fragments (#10 decision Q8). Only the status fragments above empty polite or
            // decide `completed`, so a result never drops a month change or a completion, and an error keeps the results.
            const own = takeSelection(), moved = takeMove();
            overlays.announce(joined(joined(politePayload, own.polite), moved.polite), joined(joined(urgent, own.urgent), moved.urgent));
            if (politePayload) completionShown.current = completed;
        }
        for (const diagnostic of model.diagnostics) warn(diagnostic.path, diagnostic.reason, diagnostic.key);
        if (model.kind === 'data') {
            const key = `${model.range.start}/${model.range.end}/${model.range.timeZone}`;
            if (key !== lastRange.current) { lastRange.current = key; input.onVisibleRangeChange?.({...model.range}); }
        }
    }, [model, currentNavigation, snapshot, currentAgenda, agenda, updateNavigation, focusDateCell, warn, input, overlays, save, takeSelection, takeMove, cancelSelectionDraft]);
    // Selection and move speech that no controller payload took in this commit, as one write per channel; then results still
    // owed to inert endpoints are watched until they can be written.
    useEffect(() => {
        const own = takeSelection(), moved = takeMove(), polite = joined(own.polite, moved.polite), urgent = joined(own.urgent, moved.urgent);
        if (polite || urgent) overlays.announce(polite, urgent);
        watchMove();
    });

    const navigate = (date: string, source: NavigationSource, sourceElement?: HTMLElement, kind: NavigationKind = 'date') => {
        const state = navRef.current;
        if (!snapshot || !state || model.kind !== 'data') return;
        const result = requestNavigation(state, snapshot, date, source, kind);
        if (result.blocked) return;
        initiator.current = sourceElement ?? null;
        save();
        updateNavigation(result.state);
        if ('focus' in result && result.focus) focusDateCell(result.focus);
        if ('navigate' in result && result.navigate) input.onNavigate(result.navigate);
    };
    const registerCell = useCallback((date: string, node: HTMLElement | null) => {
        if (node) cells.current.set(date, node); else cells.current.delete(date);
    }, []);
    const onDateFocus = (date: string) => {
        const state = navRef.current;
        if (state && snapshot) { save(); updateNavigation({...state, month: snapshot.month, date}); }
    };
    return {model, today, agendaDate: currentAgenda?.date ?? null, focusDate, labelledBy, overlays, mirror, warn, selection, move,
        rootRef, gridRef, viewRef, weekdaysRef, agendaRef, todayRef, statusRef, politeRef, urgentRef, registerCell, onDateFocus, navigate, cancelNavigation,
        onViewFocus: (node: Element) => { lastFocus.current = {node, surface: 'view'}; },
        getDateCell,
        navigateMonth: (amount: number) => { if (model.kind === 'data') { const target = shiftMonth(model.month, amount); if (target) navigate(target, 'toolbar'); } },
        navigateGridMonth: (amount: number) => {
            const state = navRef.current;
            if (model.kind !== 'data' || !state) return;
            const target = shiftMonth(model.month, amount);
            if (target) navigate(clampToMonth(state.date, target), 'grid', undefined, 'month');
        },
        navigateToday: () => { if (today) navigate(today, 'today', todayRef.current ?? undefined); },
        // The agenda owner (CalendarMonth) handles controlled agenda requests and open acknowledgement; this is only its uncontrolled storage.
        setUncontrolledAgendaDate: (date: string) => {
            if (currentAgenda && !currentAgenda.controlled && !model.blocking && (currentAgenda.date !== date || currentAgenda.untouched)) setAgenda({...currentAgenda, date, untouched: false});
        },
    };
}
export type CalendarController<I, S> = ReturnType<typeof useCalendarController<I, S>>;
