import {createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState, useSyncExternalStore, type KeyboardEvent, type ReactNode} from 'react';
import {flushSync} from 'react-dom';
import {FocusScope} from 'react-aria/FocusScope';
import {closeOverlay, liveOwners, outsidePress, parentFallback, pushOverlay, topOverlay, type OverlayEntry, type OverlayStack} from '../core/overlayStack.js';
import type {LocalizedText} from '../core/formatting.js';
import type {ActionsPresentation} from '../core/actions.js';
import type {CalendarItemAction} from '../reference.js';
import {LocalizedText as LocalizedLabel} from '../LocalizedText.js';
import {Button, Icon, IconButton, Menu, MenuItem} from '../primitives/index.js';
import {NonModalPopover} from '../primitives/NonModalPopover.js';
import {ModalSheet} from '../primitives/ModalSheet.js';
import {activeElement, writeLive} from './dom.js';
import {available, containsComposed, focusAvailable, focusReachable, inertComposed, reachable, tabbables} from './focus.js';

const useClientLayoutEffect = typeof document === 'undefined' ? useEffect : useLayoutEffect;
export type LiveEndpoints = {polite: HTMLElement | null; urgent: HTMLElement | null};
type Surface = {element: () => HTMLElement | null; fallback: () => HTMLElement | null};
export type ChildApi = {id: string; close: (restore?: boolean) => void};
type Child = OverlayEntry & {trigger: HTMLElement; order: HTMLElement[]; index: number; render: (api: ChildApi) => ReactNode; surface: HTMLElement | null};
type Recovery = {parent: string; trigger: HTMLElement; order: HTMLElement[]; index: number; surfaces: HTMLElement[]};
type Aside = {id: string; modal: boolean; element: () => HTMLElement | null};

/**
 * Per-Calendar ownership tree of package overlays (§12.2/§12.3). The agenda presentation is the root;
 * children are menus/sheets opened from it. It owns top-down dismissal, the §12.3 step 2 recovery
 * inside a still-open parent and the §12.4 live endpoint of the top-most modal surface.
 */
export function createOverlayStack(prefix = '') {
    let stack: OverlayStack = [], recovery: Recovery | null = null;
    let root: Surface | null = null, rootToken: object | null = null, rootLive: () => LiveEndpoints = () => ({polite: null, urgent: null});
    // A standalone toolbar overlay (the source selector, §5.6): outside the agenda chain, but part of this Calendar's
    // focus ownership and, while modal, its single live endpoint (§12.4).
    let aside: Aside | null = null;
    const children = new Map<string, Child>(), live = new Map<string, LiveEndpoints>(), listeners = new Set<() => void>();
    // How each open package overlay closes itself (the agenda presentation with its children, the standalone selector), so
    // a command outside them, such as the toolbar Select range, closes them all without focus recovery (#11).
    const dismissals = new Set<() => void>();
    // Surfaces closed but still connected while React unmounts them; a collection may refocus itself there.
    let retired: HTMLElement[] = [];
    // The agenda root just mounted in a stale default target moves to the new one in the next commit (portal.ts).
    let moving = false;
    const emit = () => { for (const listener of [...listeners]) listener(); };
    const surfaceOf = (id: string | null) => id === null ? null : root && stack[0]?.id === id ? root.element() : children.get(id)?.surface ?? null;
    const surfaces = () => [root?.element() ?? null, ...[...children.values()].map(child => child.surface)].filter((node): node is HTMLElement => !!node);
    /** Deepest open entry whose surface contains `node` (composed), or null. */
    const ownerOf = (node: Element | null) => node ? [...stack].reverse().find(entry => { const surface = surfaceOf(entry.id); return !!surface && containsComposed(surface, node); })?.id ?? null : null;
    const remove = (closed: readonly OverlayEntry[]) => {
        for (const entry of closed) {
            const surface = children.get(entry.id)?.surface;
            if (surface) retired.push(surface);
            children.delete(entry.id); live.delete(entry.id);
        }
    };
    const api = {
        entries: () => stack,
        /** DOM id of a child overlay's named element: unique per Calendar (`prefix`) and injective in the overlay ID. */
        domId: (id: string) => `nc-overlay-${prefix}${prefix ? '-' : ''}${id.replace(/[^A-Za-z0-9_]/g, char => `-${char.charCodeAt(0).toString(16)}-`)}`,
        subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
        /** The agenda presentation becomes the root owner; unregistering drops its whole subtree. */
        setRoot(id: string, modal: boolean, surface: Surface, token: object) {
            root = surface; rootToken = token; remove(stack.slice(1).reverse()); stack = [{id, parent: null, modal}]; emit();
            return () => { if (root === surface) { root = null; rootToken = null; remove([...stack].reverse()); stack = []; emit(); } };
        },
        /** A newly mounted root surface renders no child until it is registered: children never migrate. */
        isRoot: (token: object) => rootToken === token,
        setRootLive(endpoints: () => LiveEndpoints) { rootLive = endpoints; },
        child: (id: string) => children.get(id),
        childOf: (parent: string) => [...children.values()].find(child => child.parent === parent),
        top: () => { const entry = topOverlay(stack); return entry && entry.parent !== null ? children.get(entry.id) : undefined; },
        hasModal: () => stack.some(entry => entry.modal) || !!aside?.modal,
        /** Set by the agenda owner each commit: while its surface moves, the owner, not the view, recovers displaced focus. */
        setMoving(value: boolean) { moving = value; },
        moving: () => moving,
        registerDismiss(close: () => void) { dismissals.add(close); return () => { dismissals.delete(close); }; },
        dismissAll() { for (const close of [...dismissals]) close(); },
        /** Registers the open standalone overlay; the cleanup forgets it and its live endpoints. */
        setAside(entry: Aside) {
            aside = entry; emit();
            return () => { if (aside === entry) { aside = null; live.delete(entry.id); emit(); } };
        },
        /** Focus inside any package surface of this Calendar: the agenda chain or the standalone overlay. */
        owns(node: Element | null) {
            const element = aside?.element();
            return api.contains(node) || !!node && !!element && containsComposed(element, node);
        },
        surfaceOf, ownerOf,
        contains: (node: Element | null) => !!node && surfaces().some(surface => containsComposed(surface, node)),
        /** Focus inside a closed surface that is still being unmounted: neither owned nor external. */
        retired(node: Element | null) {
            retired = retired.filter(surface => surface.isConnected);
            return !!node && retired.some(surface => containsComposed(surface, node));
        },
        /**
         * Deepest open entry that owns an event's composed path, or null. The trigger of an open child belongs
         * to that child: pressing or focusing it toggles the child instead of dismissing it as an outside action.
         */
        pathOwner: (path: readonly EventTarget[]) => [...stack].reverse().find(entry => {
            const surface = surfaceOf(entry.id), trigger = children.get(entry.id)?.trigger;
            return !!surface && path.includes(surface) || !!trigger && path.includes(trigger);
        })?.id ?? null,
        /** The trigger inside the root surface that (transitively) owns entry `id`: its logical focus key. */
        rootTrigger(id: string | null) {
            let trigger: HTMLElement | undefined;
            for (let entry = id === null ? undefined : children.get(id); entry; entry = entry.parent === null ? undefined : children.get(entry.parent)) trigger = entry.trigger;
            return trigger;
        },
        open(spec: Omit<Child, 'order' | 'index' | 'surface'>) {
            const parent = surfaceOf(spec.parent);
            const change = pushOverlay(stack, {id: spec.id, parent: spec.parent, modal: spec.modal});
            if (!parent || change.stack === stack) return;
            remove(change.closed);
            const order = tabbables(parent);
            children.set(spec.id, {...spec, order, index: order.indexOf(spec.trigger), surface: null});
            stack = change.stack; emit();
        },
        attach(id: string, element: HTMLElement | null) { const child = children.get(id); if (child) child.surface = element; },
        /**
         * Closes `id` and its descendants top-down. With `restore`, focus that stays inside the closed
         * surfaces (or is displaced to body by their removal) is recovered after the commit by §12.3 step 2.
         */
        close(id: string, restore = false) {
            const closing = children.get(id), change = closeOverlay(stack, id);
            if (!closing || !change.closed.length) return;
            const closed = change.closed.map(entry => children.get(entry.id)?.surface).filter((node): node is HTMLElement => !!node);
            if (restore) recovery = {parent: closing.parent!, trigger: closing.trigger, order: closing.order, index: closing.index, surfaces: closed};
            remove(change.closed); stack = change.stack; emit();
        },
        /** All children of the root, without recovery: the root's own close owns focus. */
        closeChildren() { if (stack.length > 1) { remove(stack.slice(1).reverse()); stack = stack.slice(0, 1); emit(); } },
        /** Non-modal children above the deepest entry in `path` (an outside press or focus move) close. */
        settle(inside: string | null, restore: boolean) {
            const closing = outsidePress(stack, inside).filter(entry => entry.parent !== null);
            if (closing.length) api.close(closing[closing.length - 1].id, restore);
        },
        /** A child closed with recovery whose §12.3 step 2 has not run yet. */
        recovering: () => recovery !== null,
        /** Runs after the commit that removed a child: modal effects of a closed sheet are gone by then. */
        recover() {
            const pending = recovery;
            // A close requested inside a commit (an action set that became empty, R41) recovers only after the commit that
            // removed the closed surfaces: until then a modal one still keeps its parent inert.
            if (!pending || pending.surfaces.some(surface => surface.isConnected)) return;
            recovery = null;
            const parent = surfaceOf(pending.parent), document = pending.trigger.ownerDocument, active = activeElement(document);
            if (!parent?.isConnected) return;
            // Only focus displaced to body by the removal, or still inside a closed surface, is recovered.
            if (active !== document.body && !(active && pending.surfaces.some(surface => surface.isConnected && containsComposed(surface, active)))) return;
            const usable = (node: HTMLElement) => node.isConnected && containsComposed(parent, node) && available(node);
            if (usable(pending.trigger) && focusAvailable(pending.trigger)) return;
            const target = parentFallback(pending.order, pending.index, node => node !== pending.trigger && usable(node));
            if (target && focusAvailable(target)) return;
            focusAvailable(pending.parent === stack[0]?.id ? root?.fallback() : parent);
        },
        registerLive(owner: string, endpoints: LiveEndpoints) {
            // Every lower endpoint (root and parent modal surfaces) is cleared: it is background while this one is active.
            for (const background of [rootLive(), ...[...live].filter(([id]) => id !== owner).map(([, value]) => value)]) {
                writeLive(background.polite, []); writeLive(background.urgent, []);
            }
            live.set(owner, endpoints);
            return () => { if (live.get(owner) === endpoints) live.delete(owner); };
        },
        /** Exactly one endpoint pair per Calendar: the top-most modal surface, else the root channels. */
        liveTarget(): LiveEndpoints {
            // A modal standalone overlay keeps everything else of the Calendar inert: nothing opens above it.
            const standalone = aside?.modal ? live.get(aside.id) : undefined;
            if (standalone?.polite?.isConnected) return standalone;
            for (const owner of liveOwners(stack)) { const endpoints = live.get(owner); if (endpoints?.polite?.isConnected) return endpoints; }
            return rootLive();
        },
        /** The live target is inside an inert or `aria-hidden` background: it stays silent, and owed move results wait. */
        liveInert() {
            const target = api.liveTarget();
            return [target.polite, target.urgent].some(node => !!node && inertComposed(node));
        },
        announce(polite?: readonly LocalizedText[], urgent?: readonly LocalizedText[]) {
            const target = api.liveTarget();
            // §12.4: endpoints inside another Calendar's inert background stay silent, and no stale text outlives it.
            if (api.liveInert()) { writeLive(target.polite, []); writeLive(target.urgent, []); return; }
            if (polite) writeLive(target.polite, polite);
            if (urgent) writeLive(target.urgent, urgent);
        },
    };
    return api;
}
export type OverlayStackController = ReturnType<typeof createOverlayStack>;
/** `refresh` re-resolves the portal target before a child opens (§10.3.4): a closed Calendar does not observe the document. */
type OverlayScope = {stack: OverlayStackController; parent: string; portal: Element | null; refresh?: () => void};
const OverlayContext = createContext<OverlayScope | null>(null);
export const OverlayProvider = OverlayContext.Provider;
function useStackVersion(stack: OverlayStackController | undefined) {
    const [version, update] = useReducer((value: number) => value + 1, 0);
    useEffect(() => stack?.subscribe(update), [stack]);
    return version;
}

/** Equivalent polite/urgent channels inside a modal surface (§12.4); React owns only the stable hosts. */
export function ModalLiveEndpoints({owner, stack}: {owner: string; stack: OverlayStackController}) {
    const polite = useRef<HTMLDivElement>(null), urgent = useRef<HTMLDivElement>(null);
    useClientLayoutEffect(() => stack.registerLive(owner, {polite: polite.current, urgent: urgent.current}), [owner, stack]);
    return <><div ref={polite} className="nc-visually-hidden" role="status" aria-live="polite" aria-atomic="true"/>
        <div ref={urgent} className="nc-visually-hidden" role="alert" aria-atomic="true"/></>;
}

/**
 * Renders the open child of `parent`. With `root`, it also registers that parent as the stack root
 * for as long as its surface is mounted: a presentation switch or close drops every descendant.
 */
export function OverlayChildren({parent, root}: {parent: string; root?: {modal: boolean} & Surface}) {
    const scope = useContext(OverlayContext)!, {stack} = scope;
    useStackVersion(stack);
    const latest = useRef(root), [token] = useState(() => ({})), modal = root?.modal;
    useClientLayoutEffect(() => { latest.current = root; });
    useClientLayoutEffect(() => {
        if (modal === undefined) return;
        return stack.setRoot(parent, modal, {element: () => latest.current?.element() ?? null, fallback: () => latest.current?.fallback() ?? null}, token);
    }, [stack, parent, modal, token]);
    useEffect(() => { stack.recover(); });
    const child = !root || stack.isRoot(token) ? stack.childOf(parent) : undefined;
    return child ? <ChildSurface key={child.id} child={child} scope={scope}/> : null;
}

function ChildSurface({child, scope}: {child: Child; scope: OverlayScope}) {
    const {stack, portal} = scope;
    // A removed trigger keeps the menu next to its parent instead of jumping to a detached rectangle.
    const anchor = useMemo(() => ({get current() { return child.trigger.isConnected ? child.trigger : stack.surfaceOf(child.parent); }}), [child, stack]);
    const attach = useCallback((node: HTMLElement | null) => stack.attach(child.id, node), [stack, child.id]);
    const close = useCallback((restore = true) => stack.close(child.id, restore), [stack, child.id]);
    const tab = (event: KeyboardEvent<HTMLElement>) => {
        if (event.key !== 'Tab' || event.altKey || event.ctrlKey || event.metaKey) return;
        // §12.2: the menu sits logically right after its trigger inside the parent.
        const parent = stack.surfaceOf(child.parent), backwards = event.shiftKey;
        if (!parent) return;
        // A sequential move, so an aria-disabled control of the parent is a target too (#11 decision Q1).
        const inOrder = (node: HTMLElement) => node.isConnected && containsComposed(parent, node) && reachable(node);
        const order = tabbables(parent), index = order.indexOf(child.trigger);
        // A removed trigger keeps its former logical position in the order recorded at open.
        const target = index >= 0 ? order[index + (backwards ? -1 : 1)] : backwards
            ? child.order.slice(0, Math.max(child.index, 0)).reverse().find(inOrder) : child.order.slice(child.index + 1).find(inOrder);
        flushSync(() => stack.close(child.id, false));
        if (target) { event.preventDefault(); event.stopPropagation(); focusReachable(target); }
        // No target inside the parent: the parent's own Tab rule continues from the trigger.
        else focusAvailable(child.trigger.isConnected ? child.trigger : null);
    };
    const value = useMemo(() => ({stack, portal, parent: child.id, refresh: scope.refresh}), [stack, portal, child.id, scope.refresh]);
    const content = <OverlayProvider value={value}>{child.render({id: child.id, close})}<OverlayChildren parent={child.id}/></OverlayProvider>;
    if (!portal) return null;
    // A modal child renders its live endpoints inside its own aria-modal element (§12.4, ItemActionsContent).
    if (child.modal) return <ModalSheet portal={portal} onDismiss={() => close()} modalRef={attach}>{content}</ModalSheet>;
    return <NonModalPopover anchor={anchor} portal={portal} kind="menu">
        <FocusScope><div ref={attach} tabIndex={-1} className="nc-child-overlay" onKeyDown={tab}>{content}</div></FocusScope>
    </NonModalPopover>;
}


/** The committed state of one item's consumer actions (§5.5), as the agenda owner resolved it for this render. */
export type ItemActionsEntry = Readonly<{label: LocalizedText; actions: readonly CalendarItemAction[]}>;
export type ItemActionsScope = Readonly<{
    presentation: ActionsPresentation;
    /** The item, if it passed the accepted filter, with its resolved set; undefined once it is no longer shown. */
    resolve: (itemId: string) => ItemActionsEntry | undefined;
    closeLabel: LocalizedText;
    /** One request for the action of the latest committed set; nothing when the item or the action is gone. */
    request: (itemId: string, actionId: string) => void;
}>;
/** Provided by the agenda owner (CalendarMonth); child surfaces read the scope of the latest render. */
export const ItemActionsContext = createContext<ItemActionsScope | null>(null);
/**
 * Private fixture seam (T16 overlay probe and tests): forces the presentation the resolved layout would choose, so a
 * menu inside an inline or sheet agenda stays testable. The public Calendar never provides it.
 */
export const ActionsPresentationContext = createContext<ActionsPresentation | undefined>(undefined);

/** The `…` trigger beside an agenda row's primary surface (§12.1: never nested in it); absent for an empty set. */
export function ItemActionsButton({itemId, className}: {itemId: string; className?: () => string | undefined}) {
    const scope = useContext(ItemActionsContext), overlay = useContext(OverlayContext), entry = scope?.resolve(itemId);
    // Without actions (no pair, an empty or invalid set) a row has no trigger and never subscribes to the stack; its class
    // callback (classNames.itemActions) runs only for a rendered trigger.
    return scope && overlay && entry?.actions.length ? <ItemActionsTrigger itemId={itemId} label={entry.label} modal={scope.presentation === 'sheet'} overlay={overlay} className={className?.()}/> : null;
}
function ItemActionsTrigger({itemId, label, modal, overlay, className}: {itemId: string; label: LocalizedText; modal: boolean; overlay: OverlayScope; className?: string}) {
    const button = useRef<HTMLButtonElement>(null), {stack} = overlay, id = `${overlay.parent}/actions:${itemId}`;
    // Review 2026-10-09-2: each trigger subscribes to its own child entry only, so opening or closing one item's menu
    // re-renders that trigger, not every row of a dense agenda (§15.3).
    const child = useSyncExternalStore(stack.subscribe, () => stack.child(id), () => undefined), open = !!child;
    // IDREF only while both nodes are connected in the same tree scope (§12.2, R42).
    useEffect(() => {
        const trigger = button.current, target = child?.surface?.querySelector(`[id="${stack.domId(id)}"]`);
        if (!trigger || !target?.isConnected || trigger.getRootNode() !== target.getRootNode()) return;
        trigger.setAttribute('aria-controls', target.id);
        return () => trigger.removeAttribute('aria-controls');
    }, [stack, id, child]);
    return <IconButton ref={button} data-agenda-control="actions" className={className} aria-label={label.text} lang={label.lang} aria-haspopup={modal ? 'dialog' : 'menu'} aria-expanded={open}
        onPress={() => {
            if (open) { stack.close(id, true); return; }
            // A host dialog may have opened around an inline agenda since mount (QA-03).
            overlay.refresh?.();
            if (button.current) stack.open({id, parent: overlay.parent, modal, trigger: button.current, render: api => <ItemActionsSurface itemId={itemId} api={api} modal={modal}/>});
        }}><Icon name="more"/></IconButton>;
}
/**
 * The open menu (desktop) or action sheet (mobile) of one item. It renders the set of the latest render. A set that
 * became empty closes the surface with §12.3 recovery (R41). The surface belongs to the stack, not to its row (R37): an
 * item that is no longer shown (for example hidden by the accepted source filter, §5.6) keeps its last set until
 * dismissed, with every action disabled, since none of them is available for it (T17-V1-D1).
 */
function ItemActionsSurface({itemId, api, modal}: {itemId: string; api: ChildApi; modal: boolean}) {
    const scope = useContext(ItemActionsContext)!, entry = scope.resolve(itemId), {close} = api, stack = useContext(OverlayContext)?.stack;
    const domId = stack?.domId(api.id) ?? api.id;
    // The last set of an item still shown (information from earlier renders, kept as state).
    const [last, setLast] = useState(entry);
    if (entry && last && (entry.actions !== last.actions || entry.label.text !== last.label.text)) setLast(entry);
    const shown = entry ?? last!, empty = !!entry && !entry.actions.length, unavailable = !entry;
    useClientLayoutEffect(() => { if (empty) close(true); }, [empty, close]);
    // §12.3: an updated set that removed the focused action keeps focus in the still open surface, on its first control.
    useClientLayoutEffect(() => { if (!empty) refocusDisplaced(stack?.child(api.id)?.surface ?? null); }, [shown.actions, empty, unavailable, stack, api.id]);
    useEffect(() => trackSurfaceFocus(stack?.child(api.id)?.surface ?? null), [stack, api.id]);
    const act = (action: string) => { close(true); scope.request(itemId, action); };
    return <ItemActionsContent domId={domId} modal={modal} label={shown.label} closeLabel={scope.closeLabel} actions={shown.actions} disabled={unavailable}
        onAction={act} onClose={() => close(true)} live={modal && stack ? <ModalLiveEndpoints owner={api.id} stack={stack}/> : undefined}/>;
}
// The control of each open action/source surface that last held focus, with the controls in order at that time.
const lastFocused = new WeakMap<HTMLElement, {node: Element; controls: readonly HTMLElement[]}>();
const controlSelector = '[role^=menuitem], .nc-action-list input, .nc-action-list > button';
const usable = (surface: HTMLElement, node: HTMLElement) => node.isConnected && containsComposed(surface, node) && !(node as HTMLButtonElement).disabled
    && node.getAttribute('aria-disabled') !== 'true';
/**
 * Focus displaced by the removal or disabling of the surface's own focused control (an updated action or source set, an
 * item no longer shown) stays in the still open surface, at the old position (§12.3 step 2): the next usable control
 * after it, else the previous one, else the first usable control. Focus that left the surface (to body by a press
 * elsewhere, or to any other node) is not taken back.
 */
export function refocusDisplaced(surface: HTMLElement | null) {
    const document = surface?.ownerDocument, active = document && activeElement(document), last = surface && lastFocused.get(surface);
    const displaced = !!last && (!last.node.isConnected || (last.node as HTMLButtonElement).disabled === true);
    if (!surface?.isConnected || !document || !last || !displaced || active && active !== document.body && active !== last.node) return;
    focusAvailable(neighbor(surface, last) ?? firstControl(surface) ?? tabbables(surface).find(available));
}
function neighbor(surface: HTMLElement, last: {node: Element; controls: readonly HTMLElement[]}) {
    const index = last.controls.indexOf(last.node as HTMLElement);
    if (index < 0) return undefined;
    return last.controls.slice(index + 1).find(node => usable(surface, node)) ?? last.controls.slice(0, index).reverse().find(node => usable(surface, node));
}
const firstControl = (surface: HTMLElement) => [...surface.querySelectorAll<HTMLElement>(controlSelector)].find(node => usable(surface, node));
/**
 * Records the focused control of an open surface for refocusDisplaced. React Aria moves focus to the menu element itself
 * when the focused item leaves its collection; a menu keeps it on a usable item instead (§12.2 initial focus rule), so
 * `Enter` and the screen reader stay on an action.
 */
export function trackSurfaceFocus(surface: HTMLElement | null) {
    if (!surface) return;
    const remember = (node: Element) => lastFocused.set(surface, {node, controls: [...surface.querySelectorAll<HTMLElement>(controlSelector)]});
    // Initial focus may already be inside when the listener is attached.
    const active = activeElement(surface.ownerDocument);
    if (active && containsComposed(surface, active)) remember(active);
    const focus = (event: FocusEvent) => {
        const target = event.target as HTMLElement;
        if (target.getAttribute('role') === 'menu' && containsComposed(surface, target)) {
            // React Aria's fallback after the focused item left or was disabled: go to the old position's neighbor.
            const last = lastFocused.get(surface), left = last && !usable(surface, last.node as HTMLElement);
            focusAvailable((left ? neighbor(surface, last) : undefined) ?? firstControl(target)); return;
        }
        remember(target);
    };
    surface.addEventListener('focusin', focus);
    return () => surface.removeEventListener('focusin', focus);
}
/** Content of an item action surface: a named menu, or a named modal sheet that owns its initial focus. */
export function ItemActionsContent({domId, modal, label, closeLabel, actions, disabled = false, onAction, onClose, live}: {
    domId: string; modal: boolean; label: LocalizedText; closeLabel: LocalizedText; actions: readonly CalendarItemAction[]; disabled?: boolean; onAction: (id: string) => void;
    onClose: () => void;
    /** The sheet's live endpoints, rendered inside its aria-modal element (§12.4). */
    live?: ReactNode;
}) {
    const first = useRef<HTMLButtonElement>(null), dismiss = useRef<HTMLButtonElement>(null);
    // §12.2 mobile action sheet: the first enabled action, otherwise close; never the heading.
    useEffect(() => { if (modal && !focusAvailable(first.current)) focusAvailable(dismiss.current); }, [modal]);
    if (!modal) return <Menu id={domId} aria-label={label.text} autoFocus="first" onAction={key => onAction(String(key))} disabledKeys={disabled ? actions.map(action => action.id) : undefined}>
        {actions.map(action => <MenuItem key={action.id} id={action.id} textValue={action.label} tone={action.tone}><bdi dir="auto">{action.label}</bdi></MenuItem>)}
    </Menu>;
    return <div id={domId} role="dialog" aria-modal="true" aria-labelledby={`${domId}-heading`} tabIndex={-1} className="nc-day-list nc-action-sheet">
        {live}<div className="nc-day-list-heading"><h3 id={`${domId}-heading`}><LocalizedLabel value={label}/></h3>
            <IconButton ref={dismiss} aria-label={closeLabel.text} lang={closeLabel.lang} onPress={onClose}><Icon name="close"/></IconButton></div>
        <div className="nc-action-list">{actions.map((action, index) => <Button key={action.id} ref={index ? undefined : first} tone={action.tone} isDisabled={disabled}
            onPress={() => onAction(action.id)}><bdi dir="auto">{action.label}</bdi></Button>)}</div>
    </div>;
}
