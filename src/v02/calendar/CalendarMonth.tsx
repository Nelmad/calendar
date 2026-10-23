import {useCallback, useContext, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent} from 'react';
import {flushSync} from 'react-dom';
import type {CalendarProps, CalendarResolvedAgendaPresentation} from '../reference.js';
import type {CalendarSurface} from '../surface.js';
import {NonModalPopover} from '../primitives/NonModalPopover.js';
import {ModalSheet} from '../primitives/ModalSheet.js';
import {acceptanceRule, openOverlay, resolveAgendaPresentation, type AgendaOverlay} from '../core/responsive.js';
import {actionsPresentation, findAction} from '../core/actions.js';
import {CalendarShell} from './CalendarShell.js';
import {MonthView, type DateActivation} from './MonthView.js';
import {classes, resolveClass, usePassiveDiagnostics} from './slots.js';
import {DayAgendaBody} from './DayAgendaBody.js';
import {useMessageDiagnostics, type CalendarController} from './useCalendarController.js';
import {activeElement, revealFocused} from './dom.js';
import {available, composedParent, containsComposed, displaced, focusAvailable, logicalExit, tabbables} from './focus.js';
import {ActionsPresentationContext, ItemActionsContext, ModalLiveEndpoints, OverlayChildren, OverlayProvider, type ItemActionsScope} from './overlays.js';
import {SourceSelector} from './SourceSelector.js';
import {usePortalTarget} from './portal.js';
import type {CalendarModel} from './model.js';

const useClientLayoutEffect = typeof document === 'undefined' ? useEffect : useLayoutEffect;
const modifierKeys: ReadonlySet<string> = new Set(['Shift', 'Control', 'Alt', 'AltGraph', 'Meta', 'CapsLock', 'Fn', 'FnLock', 'NumLock', 'ScrollLock', 'Symbol', 'SymbolLock', 'Hyper', 'Super']);

/** Internal Month and DayAgenda composition with the full reference surface. */
export function CalendarMonth<I, S>(props: CalendarProps<I, S>) {
    return <CalendarMonthRoot input={props}/>;
}
/** The public facade passes its prerelease surface; validation then enforces its layouts. */
export function CalendarMonthRoot<I, S>({input, surface}: {input: CalendarProps<I, S>; surface?: CalendarSurface}) {
    return <CalendarShell input={input} surface={surface} renderView={(controller, headingId) => <MonthSurface controller={controller} headingId={headingId}/>}
        renderToolbarControls={controller => <SourceSelector controller={controller}/>}/>;
}
/** `accepted`: the target was accepted with focus still on its origin; the overlay opens next commit. */
type Intent = {date: string; previous: string; origin: Element | null; input: 'pointer' | 'keyboard'; accepted: boolean};
/**
 * Stable logical focus key: item + control, heading, close or the container, plus the date the surface showed.
 * Focus inside a child overlay is keyed by its trigger in the agenda: a switch closes the child (§12.3 step 1).
 */
type FocusKey = {node: HTMLElement; item?: string; control?: string; heading: boolean; close: boolean; container: boolean; date: string; child: boolean};
type Recovery = {node: Element | null; date: string | null};
const agendaOwner = 'agenda';
/** The composed ancestor chain of a node, like an event's composed path. */
function composedPath(node: Element) {
    const path: EventTarget[] = [];
    for (let current: Element | null = node; current; current = composedParent(current)) path.push(current);
    return path;
}
function MonthSurface<I, S>({controller, headingId}: {controller: CalendarController<I, S>; headingId: string}) {
    const {model, rootRef, agendaRef, overlays: stack, getDateCell, statusRef} = controller, id = useId(), heading = useRef<HTMLHeadingElement>(null);
    const [mounted, setMounted] = useState<AgendaOverlay | null>(null), [activation, setActivation] = useState(0);
    // The presentation whose owning stack holds focus; displaced focus (body) still counts.
    const [owner, setOwner] = useState<CalendarResolvedAgendaPresentation | null>(null);
    const [anchor, setAnchor] = useState<HTMLElement | null>(null);
    const anchorRef = useRef<HTMLElement | null>(null);
    const intent = useRef<Intent | null>(null), ownedFocus = useRef<FocusKey | null>(null), originDate = useRef<string | null>(null);
    // The overlay an accepted intent asked to mount; a cancellation before its commit closes it again (QA-20).
    const opening = useRef<AgendaOverlay | null>(null);
    const previousPresentation = useRef<CalendarResolvedAgendaPresentation | null>(null), outsideFrame = useRef(0), childFrame = useRef(0);
    // Recovery that must wait for an overlay (and a modal's inert background) to be removed.
    const pendingRecovery = useRef<Recovery | null>(null);
    const date = controller.agendaDate;
    useMessageDiagnostics(model as CalendarModel<unknown, unknown>, controller.warn);
    // §10.4: passive item/day slot content in the grid and the agenda (inline or in its portal), after each commit.
    usePassiveDiagnostics(() => [controller.gridRef.current, agendaRef.current], controller.warn);
    // §5.5: one action set per item for the agenda, its desktop menu and mobile sheet. Requests use the latest committed
    // model, so an action removed, an item filtered out or a replaced resolver after the render sends nothing stale.
    const committed = useRef(model), forcedActions = useContext(ActionsPresentationContext);
    useClientLayoutEffect(() => { committed.current = model; });
    useEffect(() => {
        if (model.kind === 'data') for (const diagnostic of model.actions.drain()) controller.warn(diagnostic.path, diagnostic.reason);
    });
    const actions = useMemo((): ItemActionsScope | null => model.kind !== 'data' ? null : {
        presentation: forcedActions ?? actionsPresentation(model.state.layout),
        resolve: itemId => {
            const record = model.visible.get(itemId);
            return record && {label: model.message('itemActionsLabel', record.item.title), actions: model.actions.resolve(record.item).actions};
        },
        closeLabel: model.message('cancelLabel'),
        request: (itemId, actionId) => {
            const latest = committed.current, record = latest.kind === 'data' ? latest.visible.get(itemId) : undefined;
            const action = latest.kind === 'data' && record ? findAction(latest.actions.resolve(record.item), actionId) : undefined;
            if (latest.kind === 'data' && record && action) latest.props.onItemActionRequest?.({item: record.item, actionId: action.id});
        },
    }, [model, forcedActions]);
    const presentation = resolveAgendaPresentation(model.state.layout, model.kind === 'data' ? model.props.agendaPresentation : undefined);
    // One transactional switch: the old overlay unmounts and the new one mounts in the same commit.
    const overlay = openOverlay({mounted, owner}, presentation);
    const requestedPortal = model.kind === 'data' ? model.props.portalContainer : undefined;
    // Stable across renders (QA-01): effects keyed by them re-run only for real changes.
    const cell = useCallback((target: string | null) => target ? getDateCell(target) : undefined, [getDateCell]);
    // The roving date of the latest commit. It is written before this component's recovery layout effect: the controller's
    // own copy is written in a parent layout effect, after this one, and would still hold the previous month (review 2026-10-09-3).
    const roving = useRef<string | null>(null);
    useClientLayoutEffect(() => { roving.current = controller.focusDate; });
    const recover = useCallback((target = originDate.current) => {
        const root = rootRef.current;
        if (!root) return;
        // A date cell scrolls itself into view on focus; the other targets are revealed here.
        if (focusAvailable(cell(target)) || focusAvailable(cell(roving.current))) return;
        if (focusAvailable(statusRef.current) || [...root.querySelectorAll<HTMLElement>('.nc-calendar-toolbar button')].some(focusAvailable) || focusAvailable(root)) revealFocused(root.ownerDocument);
    }, [rootRef, cell, statusRef]);
    const forget = () => { ownedFocus.current = null; setOwner(null); };
    /** Closes the whole owning stack top-down: child overlays first, then the agenda presentation. */
    const close = (restore = true) => {
        intent.current = null;
        const root = rootRef.current;
        if (restore && root && (stack.contains(activeElement(root.ownerDocument)) || displaced(root.ownerDocument, ownedFocus.current?.node ?? null))) {
            // A modal background stays inert until the sheet is removed: recover after that commit.
            if (overlay === 'sheet') pendingRecovery.current = {node: ownedFocus.current?.node ?? null, date: originDate.current};
            else recover();
        }
        stack.closeChildren();
        forget();
        setMounted(null);
    };
    const closeLatest = useRef(close);
    useClientLayoutEffect(() => { closeLatest.current = close; });
    // §10.3.4/R53: a new accepted container closes the stack top-down with §12.3 recovery, never reopening.
    // The document is observed only while the agenda overlay or a child of the agenda is open (§11.3).
    const {portal, refresh: refreshPortal, resolved: resolvedPortal} = usePortalTarget(requestedPortal, rootRef, controller.warn, () => {
        const child = stack.childOf(agendaOwner);
        if (overlay) close(); else if (child) stack.close(child.id, true);
    }, () => overlay !== null || stack.entries().length > 1, stack.subscribe);
    // Capture cancellations before a new request is installed by its activation handler. A pointer
    // cancels only as a completed activation (pointerup): a touch scroll ends in pointercancel (§7).
    useEffect(() => {
        const root = rootRef.current, document = root?.ownerDocument;
        if (!root || !document) return;
        const cancel = () => { intent.current = null; };
        // A pure modifier press or the auto-repeat of a held key is not a new keyboard activation (§5.2.1, QA-B-1-04).
        const keydown = (event: globalThis.KeyboardEvent) => { if (!event.repeat && !modifierKeys.has(event.key)) cancel(); };
        const onFocus = () => {
            const active = activeElement(document), owned = stack.contains(active);
            if (stack.retired(active)) return;
            if (intent.current && active !== intent.current.origin && !owned) cancel();
            if (overlay === 'popover' && active && !owned && active !== document.body) close(false);
            // Focus that moved to a valid node closes the non-modal children above its owner, without recovery.
            else if (active && active !== document.body) stack.settle(stack.pathOwner(composedPath(active)), false);
            if (!owned) forget();
        };
        // A completed press that moved focus out of the owning stack (also to body, which fires no
        // focusin) leaves it; a gesture that keeps focus, such as a touch scroll, does not.
        const press = () => { if (!stack.contains(activeElement(document))) forget(); };
        // Review 2026-10-09-2: like the sheet backdrop (QA-B-1-02), only a primary press that starts and ends outside the
        // popover dismisses it: a text-selection drag out of it and a secondary-button press do not.
        let started: 'inside' | 'outside' | null = null;
        const down = (event: PointerEvent) => { started = event.button === 0 && stack.pathOwner(event.composedPath()) === null ? 'outside' : 'inside'; };
        const pointer = (event: Event) => {
            cancel();
            const surface = agendaRef.current, path = event.composedPath(), inside = stack.pathOwner(path), window = document.defaultView!;
            const outsidePress = started !== 'inside' && (event as PointerEvent).button === 0;
            started = null;
            // Non-modal children above the pressed entry close once the target had its focus/click turn.
            if (stack.top()) {
                window.cancelAnimationFrame(childFrame.current);
                childFrame.current = window.requestAnimationFrame(() => { childFrame.current = 0; stack.settle(inside, true); });
            }
            if (overlay !== 'popover' || !surface || inside !== null || !outsidePress) return;
            window.cancelAnimationFrame(outsideFrame.current);
            // Allow pointer default focus and the target's click handler to win first.
            outsideFrame.current = window.requestAnimationFrame(() => {
                outsideFrame.current = 0;
                if (agendaRef.current === surface) close();
            });
        };
        const scopes = new Set<EventTarget>([document, root.getRootNode(), ...(portal ? [portal.getRootNode()] : [])]);
        for (const scope of scopes) scope.addEventListener('focusin', onFocus, true);
        document.addEventListener('keydown', keydown, true);
        document.addEventListener('pointerdown', down, true); document.addEventListener('pointerup', pointer, true); document.addEventListener('click', press, true);
        document.defaultView?.addEventListener('blur', cancel);
        return () => {
            for (const scope of scopes) scope.removeEventListener('focusin', onFocus, true);
            document.removeEventListener('keydown', keydown, true);
            document.removeEventListener('pointerdown', down, true); document.removeEventListener('pointerup', pointer, true); document.removeEventListener('click', press, true);
            document.defaultView?.removeEventListener('blur', cancel);
        };
    });
    useEffect(() => {
        const window = rootRef.current?.ownerDocument.defaultView;
        return () => { if (window) { window.cancelAnimationFrame(outsideFrame.current); window.cancelAnimationFrame(childFrame.current); } };
    }, [rootRef]);
    /**
     * §12.3 for focus owned by the agenda stack whose node is gone or left it: the logically same control, else
     * the overlay closes and the date cell recovers once it is removed. Returns whether the stack owned focus.
     */
    const restoreOwned = useCallback((document: Document, surface: HTMLElement | null) => {
        const old = ownedFocus.current, active = activeElement(document);
        const owned = !!old && owner !== null && (active === old.node || displaced(document, old.node));
        if (!old || !owned || (available(old.node) && !!surface && stack.contains(old.node))) return owned;
        // Focus in a child that its stack closed (with its row trigger gone, R41) is the stack's §12.3 step 2 recovery, which
        // runs once the child surface is removed: the parent agenda stays open.
        if (old.child && stack.recovering()) return owned;
        const controls = [...surface?.querySelectorAll<HTMLElement>('[data-agenda-control]') ?? []];
        const replacement = old.item ? controls.find(node => node.closest<HTMLElement>('[data-item-id]')?.dataset.itemId === old.item && node.dataset.agendaControl === old.control)
            : old.heading ? heading.current : old.close ? surface?.querySelector<HTMLElement>('[data-agenda-close]') : old.container ? surface : undefined;
        if (surface && focusAvailable(replacement)) return owned;
        // Missing logical control: §12.3 from the date cell, never a newly opened overlay.
        ownedFocus.current = null;
        if (overlay) { setOwner(null); setMounted(null); pendingRecovery.current = {node: old.node, date: old.date}; }
        else recover(old.date);
        return owned;
    }, [owner, overlay, stack, recover]);
    // QA-13: without a presentation switch, a removed or replaced focused control is resolved in the commit that
    // removed it. The sheet then closes before React Aria's FocusScope can refocus its first control a frame
    // later, so the outcome no longer depends on build speed. Switches stay passive: the new surface's modal
    // effects must precede any focus move (§11.3).
    useClientLayoutEffect(() => {
        const root = rootRef.current;
        if (!root || !ownedFocus.current || previousPresentation.current !== presentation) return;
        restoreOwned(root.ownerDocument, agendaRef.current);
    });
    useEffect(() => {
        const root = rootRef.current;
        // An overlay that a passive switch just mounted in a stale default target moves in the next commit, before paint:
        // its focus migration and initial focus wait for the moved surface (this effect re-runs with the new portal), and
        // the view leaves the displaced focus to it.
        const moving = !!portal && resolvedPortal() !== portal;
        stack.setMoving(moving);
        if (!root || model.kind !== 'data' || !date || moving) return;
        const document = root.ownerDocument, surface = agendaRef.current;
        // Without its date cell the popover anchors to the root's toolbar, at the root's top edge (§12.2, QA-21).
        const target = cell(date) ?? root.querySelector<HTMLElement>('.nc-calendar-toolbar') ?? root;
        // State is written only when it changes: a same-value update still re-renders a hydrating boundary.
        anchorRef.current = target;
        if (anchor !== target) setAnchor(target);
        // The committed overlay is exactly the rendered one; later calls in this effect win.
        if (mounted !== overlay) setMounted(overlay);
        const pending = pendingRecovery.current;
        if (pending && overlay === null) {
            pendingRecovery.current = null;
            if (displaced(document, pending.node)) recover(pending.date);
        }
        // Passive migration: only focus inside the owning stack follows the switch (§11.3).
        const switched = previousPresentation.current !== null && previousPresentation.current !== presentation;
        previousPresentation.current = presentation;
        if (!restoreOwned(document, surface) && switched && owner !== null) setOwner(null);
        const request = intent.current, requested = opening.current;
        opening.current = null;
        // §5.2.1/§8: Escape, another key, a press or a focus move cancelled the intent after its overlay was requested
        // but before it committed. The cancelled intent never leaves an overlay open without its initial focus.
        if (!request && requested && overlay === requested) { closeLatest.current(); return; }
        if (!request) return;
        if (date !== request.date) {
            if (date !== request.previous) intent.current = null;
            return;
        }
        if (!request.accepted && activeElement(document) !== request.origin) { intent.current = null; return; }
        // The presentation resolved now opens exactly once; an old one is never mounted for it.
        const rule = acceptanceRule(presentation, request.input, request.date !== request.previous);
        if (rule.open && (overlay !== rule.open || !surface || !portal || (rule.open === 'popover' && !anchor))) {
            intent.current = {...request, accepted: true}; opening.current = rule.open; setMounted(rule.open); return;
        }
        if (!surface) return;
        intent.current = null;
        if (rule.focus === 'first-control') { if (!focusAvailable(tabbables(surface)[0])) focusAvailable(heading.current); }
        // The inline agenda keeps its place below the grid, often below the fold: its focused heading is revealed (§12.5).
        else if (rule.focus === 'heading' && focusAvailable(heading.current) && presentation === 'inline') revealFocused(document);
        else if (rule.announce && containsComposed(root, activeElement(document))) {
            stack.announce([model.message('agendaUpdatedAnnouncement', date, model.index!.agenda(date).length)]);
        }
    }, [rootRef, model, date, cell, agendaRef, presentation, overlay, mounted, owner, portal, anchor, recover, restoreOwned, stack, activation, resolvedPortal]);
    // IDREFs are written only after both endpoints exist in the same CSS/ARIA tree.
    useEffect(() => {
        const trigger = cell(date), surface = agendaRef.current;
        if (!overlay || !trigger || !surface || trigger.getRootNode() !== surface.getRootNode()) return;
        trigger.setAttribute('aria-controls', id);
        return () => trigger.removeAttribute('aria-controls');
    }, [date, overlay, portal, anchor, id, activation, controller.model, cell, agendaRef]);
    // One scope value per portal: agenda rows and their triggers do not see a new context on every Calendar render.
    const overlayScope = useMemo(() => ({stack, portal, parent: agendaOwner, refresh: refreshPortal}), [stack, portal, refreshPortal]);
    if (model.kind !== 'data' || !model.index || !date) return null;
    const activate: DateActivation = (target, input) => {
        // A host dialog may have opened around the Calendar since the target was resolved (QA-03).
        refreshPortal();
        intent.current = {date: target, previous: date, origin: rootRef.current ? activeElement(rootRef.current.ownerDocument) : null, input, accepted: false};
        originDate.current = target;
        forget();
        // Activation of a date cell dismisses an open overlay and keeps focus on that cell.
        if (overlay) setMounted(null);
        setActivation(value => value + 1);
        // Activating the untouched fallback itself is a user choice too: a later today must not move it (§11.3, R56).
        if (model.props.agendaDate === undefined) controller.setUncontrolledAgendaDate(target);
        else if (target !== date) model.props.onAgendaDateChange(target);
    };
    const keyDown = (event: KeyboardEvent<HTMLElement>) => {
        if (event.nativeEvent.isComposing) return;
        if (event.key === 'Escape') {
            event.preventDefault(); event.stopPropagation();
            // §8/§12.2: Escape closes exactly the top overlay; a child keeps its parent open (R37).
            const top = stack.top();
            if (top) { intent.current = null; stack.close(top.id, true); }
            else if (presentation === 'inline') { intent.current = null; recover(date); } else close();
        } else if (presentation === 'popover' && event.key === 'Tab' && !event.altKey && !event.ctrlKey && !event.metaKey && agendaRef.current) {
            const surface = agendaRef.current, controls = tabbables(surface), active = activeElement(surface.ownerDocument);
            const index = controls.indexOf(active as HTMLElement), next = index + (event.shiftKey ? -1 : 1);
            if (index >= 0 && next >= 0 && next < controls.length) return;
            // Focus on a non-tabbable node of the surface (the container or the heading after a pointer press) continues
            // natively to the next control in its direction; only past the last one does Tab leave (review 2026-10-09-2).
            if (index < 0 && active && surface.contains(active) && controls.some(node => !!(active.compareDocumentPosition(node) & (event.shiftKey ? 2 : 4)))) return;
            const trigger = cell(date) ?? cell(controller.focusDate) ?? rootRef.current!;
            const target = logicalExit(trigger, surface, event.shiftKey);
            // Remove the portal before native sequential navigation. At a document edge,
            // focus on the trigger supplies the browser's starting point, without trapping Tab.
            flushSync(() => close(false));
            // A target that cannot take focus leaves it on the trigger, never on body (§12.3).
            if (target) { event.preventDefault(); if (!focusAvailable(target)) focusAvailable(trigger); }
            else focusAvailable(trigger);
        }
    };
    const body = <section ref={agendaRef} id={id} role={presentation === 'inline' ? 'region' : 'dialog'} aria-modal={presentation === 'sheet' ? true : undefined}
        tabIndex={-1} aria-labelledby={`${id}-heading`} aria-busy={presentation === 'inline' && model.state.dataState.status === 'loading' ? true : undefined}
        data-date={date} data-presentation={presentation} lang={model.lang}
        className={classes('nc-day-list', resolveClass(model.props.classNames?.agenda, {date, presentation, itemCount: model.index.agenda(date).length}))}
        onKeyDown={keyDown} onFocusCapture={event => {
            const node = event.target as HTMLElement;
            // A child surface that is already closed (unmounting) no longer belongs to the owning stack.
            if (!event.currentTarget.contains(node) && !stack.contains(node)) return;
            const logical = stack.rootTrigger(stack.ownerOf(node)) ?? node;
            ownedFocus.current = {child: logical !== node, node, item: logical.closest<HTMLElement>('[data-item-id]')?.dataset.itemId, control: logical.dataset.agendaControl,
                heading: logical === heading.current, close: logical.hasAttribute('data-agenda-close'), container: logical === event.currentTarget, date};
            setOwner(presentation);
            controller.onViewFocus(node);
        }}>
        <OverlayProvider value={overlayScope}><ItemActionsContext.Provider value={actions}>
            {presentation === 'sheet' && <ModalLiveEndpoints owner={agendaOwner} stack={stack}/>}
            <DayAgendaBody model={model} date={date} heading={heading} headingId={`${id}-heading`} onClose={presentation === 'inline' ? undefined : () => close()}/>
            <OverlayChildren parent={agendaOwner} root={{modal: presentation === 'sheet', element: () => agendaRef.current, fallback: () => heading.current ?? agendaRef.current}}/>
        </ItemActionsContext.Provider></OverlayProvider>
    </section>;
    return <>
        <MonthView controller={controller} headingId={headingId} onDateActivate={activate} popup={presentation !== 'inline'} openAgendaDate={overlay ? date : undefined}/>
        {presentation === 'inline' ? body
            : overlay === 'popover' ? portal && anchor && <NonModalPopover anchor={anchorRef} portal={portal}>{body}</NonModalPopover>
                : overlay === 'sheet' && portal && <ModalSheet portal={portal} onDismiss={() => close()}>{body}</ModalSheet>}
    </>;
}
