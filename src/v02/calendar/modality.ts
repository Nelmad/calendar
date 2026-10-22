import {activeElement, focusElement} from './dom.js';
import {available, composedParent, containsComposed, tabbables} from './focus.js';
import {modalContainer} from './portal.js';

/**
 * Package-owned modal effects (§12.2, §10.3.4), bound to the document that owns the modal surface, never to the
 * global `document` of another realm (T16-V3-01). Per document, all open package modal layers (agenda sheets,
 * child sheets, any Calendar) form one stack: the top layer owns background `inert` (`aria-hidden` only where
 * `inert` is missing), focus containment and Escape; the scroll lock lasts until the last layer closes. A host
 * dialog layer that opens later above the stack (for example from `onItemPress`) is never made inert: the stack
 * yields to it (no containment, lowered z-index) until it closes (QA-10). Only a modal host layer (a modal `<dialog>` or an
 * `aria-modal="true"` element) yields the stack; a non-modal `role=dialog` is background (QA-B-1-03).
 */
export type ModalLayerOptions = {
    /** The layer's top-level node in its portal container (the backdrop). */
    element: HTMLElement;
    /** The modal surface: focus is contained in its controls. */
    surface: HTMLElement;
    onEscape: () => void;
    /** The layer reappears (a Suspense boundary revealed its owner): focus displaced to body returns into it. */
    restore?: boolean;
    /** Whether the stack yields to a later host layer; called for every layer of the document. */
    onYield: (yielded: boolean) => void;
};
type Layer = ModalLayerOptions & {sequence: number; hosts: Set<Element>; dialogs: Set<Element>; last: HTMLElement | null};
type Hidden = 'inert' | 'aria-hidden';
type Registry = {document: Document; layers: Layer[]; hidden: Map<Element, Hidden>; yielded: Element[]; scopes: Set<ShadowRoot>; observe: () => void; release: () => void;
    /** The last layer closed while a host layer was still open: the background, scroll lock and observer wait for it to close. */
    pending: boolean;
    /** Host layers found by covering the stack (no aria-modal): open while connected and rendered. */
    covering: WeakSet<Element>};

let sequence = 0;
const registries = new WeakMap<Document, Registry>(), floating = new Map<Element, number>();
const hostLayerSelector = 'dialog[open], [aria-modal="true"]';
const unrendered = new Set(['head', 'script', 'style', 'link', 'template', 'meta', 'noscript']);
const dialogSelector = 'dialog, [role="dialog"], [role="alertdialog"]';

/** A package non-modal overlay (popover, child menu); one opened above a modal layer is not its background. */
export function registerFloating(element: Element) {
    floating.set(element, ++sequence);
    return () => { floating.delete(element); };
}
function rendered(element: Element) {
    const view = element.ownerDocument.defaultView;
    for (let current: Element | null = element; current; current = composedParent(current)) {
        if (current.hasAttribute('hidden') || view?.getComputedStyle(current).display === 'none') return false;
    }
    return true;
}
/** Every open ShadowRoot of the document, nested ones included: a host modal may live inside a web component. */
function shadowRoots(document: Document) {
    const roots: ShadowRoot[] = [];
    const visit = (scope: Document | ShadowRoot) => {
        const walker = document.createTreeWalker(scope, 1);
        for (let node = walker.nextNode() as Element | null; node; node = walker.nextNode() as Element | null) {
            if (node.shadowRoot) { roots.push(node.shadowRoot); visit(node.shadowRoot); }
        }
    };
    visit(document);
    return roots;
}
/**
 * Host modal layers (spec v7 §10.3.4, QA-B-1-03): open modal `<dialog>`s and rendered `aria-modal="true"` elements outside
 * package UI, in the document and in its open ShadowRoots. A non-modal `role="dialog"`/`"alertdialog"` shown above the
 * stack is background like any other node. Closed ShadowRoots are not reachable.
 */
function hostLayers(document: Document, roots = shadowRoots(document)) {
    return [document, ...roots].flatMap(scope => [...scope.querySelectorAll(hostLayerSelector)]).filter(element => !element.closest('.nc-theme')
        && modalContainer(element) && (element.localName === 'dialog' || rendered(element)));
}
const hiddenByHost = (element: Element) => (element as HTMLElement).inert === true || element.getAttribute('aria-hidden') === 'true';
/**
 * Review 2026-10-09-2: a host modal that renders neither `aria-modal` nor a modal `<dialog>` (React Aria Components'
 * Modal, most React modal libraries) still makes everything outside it inert or `aria-hidden`, the top package layer
 * included. Such a host covers the stack: its dialog is a host layer above the stack, never background. A non-modal host
 * dialog leaves the layer usable and stays background (QA-B-1-03).
 */
function coveringLayers(registry: Registry, top: Layer, roots: readonly ShadowRoot[]) {
    let covered = false;
    for (let current: Element | null = top.element; current && !covered; current = composedParent(current)) covered = hiddenByHost(current) && !registry.hidden.has(current);
    if (!covered) return [];
    // Only a dialog shown after the layer opened is above it: one already open (a page panel, the dialog that holds the
    // Calendar) stays background.
    const candidates = [registry.document.body, ...roots].flatMap(scope => [...scope.querySelectorAll(dialogSelector)]);
    const layers = candidates.filter(element => !top.dialogs.has(element) && !element.closest('.nc-theme') && !containsComposed(element, top.element) && rendered(element)
        // Hidden by the host, not by this stack: still background.
        && ![...ancestors(element)].some(node => hiddenByHost(node) && !registry.hidden.has(node)));
    for (const element of layers) registry.covering.add(element);
    return layers;
}
function* ancestors(element: Element) {
    for (let current: Element | null = element; current; current = composedParent(current)) yield current;
}
/** Hidden by a host (not by this stack), at the node or above it. */
const hostHidden = (registry: Registry, node: Element) => [...ancestors(node)].some(element => hiddenByHost(element) && !registry.hidden.has(element));
/** Inside a dialog outside package UI that was shown after `layer` opened: perhaps a host modal that covers the stack. */
const laterDialog = (layer: Layer, node: Element) => [...ancestors(node)].some(element => element.matches(dialogSelector) && !layer.dialogs.has(element) && !element.closest('.nc-theme'));
function hide(element: Element): Hidden {
    if ('inert' in element) { (element as HTMLElement).inert = true; return 'inert'; }
    element.setAttribute('aria-hidden', 'true');
    return 'aria-hidden';
}
function show(element: Element, kind: Hidden) {
    if (kind === 'inert') (element as HTMLElement).inert = false; else element.removeAttribute('aria-hidden');
}
/** A floating package overlay opened after `layer`, at or inside `node`. */
const floatingAbove = (layer: Layer, node: Element) => [...floating].some(([element, opened]) => opened > layer.sequence && containsComposed(node, element));
function within(layer: Layer, node: Element) {
    for (let current: Element | null = node; current; current = composedParent(current)) if ((floating.get(current) ?? 0) > layer.sequence) return true;
    return false;
}
function lockScroll(document: Document) {
    const root = document.documentElement, window = document.defaultView, style = root.style;
    const previous = {overflow: style.overflow, gutter: style.getPropertyValue('scrollbar-gutter'), padding: style.paddingRight};
    // Review 2026-10-09-3: the <html> box, not `clientWidth`, measures the page scrollbar. For a custom-styled
    // (::-webkit-scrollbar) scrollbar Chrome keeps a stale `clientWidth` after an overflow change in the same task (a lock
    // released and taken again, as in StrictMode) and does not count a stable gutter in it.
    const computed = window?.getComputedStyle(root), px = (value: string | undefined) => Number.parseFloat(value ?? '') || 0;
    const width = window ? root.getBoundingClientRect().width : 0, gutter = window && width > 0 ? window.innerWidth - width - px(computed?.marginLeft) - px(computed?.marginRight) : 0;
    // As React Aria's scroll lock: keep the layout width where the classic scrollbar disappears.
    if (gutter > 0.5 && window?.CSS?.supports?.('scrollbar-gutter', 'stable')) style.setProperty('scrollbar-gutter', 'stable');
    style.overflow = 'hidden';
    // Chrome with overlay scrollbars keeps no stable gutter for a custom-styled classic one under overflow:hidden. The width
    // actually gained is padded, so the lock never widens the content (and a layout="auto" root never crosses its breakpoint
    // because of the package's own sheet). One forced layout per lock.
    const gained = gutter > 0.5 ? root.getBoundingClientRect().width - width : 0;
    if (gained > 0.5) style.paddingRight = `${px(computed?.paddingRight) + gained}px`;
    return () => {
        style.overflow = previous.overflow; style.paddingRight = previous.padding;
        if (previous.gutter) style.setProperty('scrollbar-gutter', previous.gutter); else style.removeProperty('scrollbar-gutter');
    };
}
function restore(layer: Layer) {
    if (layer.last && available(layer.last) && focusElement(layer.last)) return;
    focusElement(tabbables(layer.surface)[0] ?? layer.surface.querySelector<HTMLElement>('[tabindex="-1"]'));
}

function update(registry: Registry) {
    const {document, layers, hidden} = registry, top = layers[layers.length - 1] as Layer | undefined, wasYielded = registry.yielded.length > 0;
    // Open ShadowRoots are observed too, so a host modal that opens inside one is seen like one in the document.
    const roots = top ? shadowRoots(document) : [];
    registry.yielded = top ? [...new Set([...hostLayers(document, roots).filter(element => !top.hosts.has(element) && !containsComposed(element, top.element)),
        ...coveringLayers(registry, top, roots)])] : [];
    const desired = new Set<Element>(), scopes = new Set<ShadowRoot>(roots);
    if (top) {
        const keep = (node: Element) => unrendered.has(node.localName) || node.localName === 'dialog' && !(node as HTMLDialogElement).open
            || node.matches('[data-live-announcer], [data-react-aria-top-layer]') || registry.yielded.some(layer => containsComposed(node, layer)) || floatingAbove(top, node);
        // Siblings along the composed path from the layer up to the owner body; a ShadowRoot continues at its host.
        for (let node: Element = top.element; ;) {
            const parent = node.parentNode;
            // A layer portaled into <html> itself (an explicit portalContainer) hides <body> as its background.
            if (!parent || parent === document || (parent === document.documentElement && node === document.body)) break;
            for (const sibling of parent.children) if (sibling !== node && !keep(sibling) && (hidden.has(sibling) || !hiddenByHost(sibling))) desired.add(sibling);
            if (parent === document.body || parent === document.documentElement) break;
            if (parent.nodeType === 11) scopes.add(parent as ShadowRoot);
            node = parent.nodeType === 11 ? (parent as ShadowRoot).host : parent as Element;
        }
    }
    for (const [element, kind] of hidden) if (!desired.has(element)) { show(element, kind); hidden.delete(element); }
    for (const element of desired) if (!hidden.has(element)) hidden.set(element, hide(element));
    if ([...scopes].some(scope => !registry.scopes.has(scope)) || scopes.size !== registry.scopes.size) { registry.scopes = scopes; registry.observe(); }
    const yielded = registry.yielded.length > 0;
    if (yielded === wasYielded) return;
    for (const layer of layers) layer.onYield(yielded);
    const active = activeElement(document);
    // Focus left in the stack that the host has just covered is stranded there like focus on body (review 2026-10-09-2, round 2).
    if (active && active !== document.body && !(yielded && hostHidden(registry, active))) return;
    // A host dialog shown while its content was background has no focus yet; when it closes, focus returns here.
    if (yielded) {
        const layer = registry.yielded[registry.yielded.length - 1];
        (layer.querySelector<HTMLElement>('[autofocus]') ?? tabbables(layer)[0] ?? layer as HTMLElement).focus({preventScroll: true});
    } else if (top) restore(top);
}

function registryOf(document: Document): Registry {
    const existing = registries.get(document);
    if (existing) return existing;
    const onFocus = (event: FocusEvent) => {
        const top = registry.layers[registry.layers.length - 1] as Layer | undefined, target = event.composedPath()[0] as Element;
        if (!top || target?.nodeType !== 1) return;
        if (containsComposed(top.element, target)) { if (containsComposed(top.surface, target)) top.last = target as HTMLElement; return; }
        if (within(top, target)) return;
        update(registry);
        if (registry.yielded.some(layer => containsComposed(layer, target))) return;
        // Review 2026-10-09-2, round 2: a host modal without aria-modal (React Aria Components) focuses its new dialog in the
        // commit that opens it, before it makes the stack inert. Containment waits for the end of that commit, so the
        // host's effect is classified first; a dialog that stays background (QA-B-1-03) is still contained then.
        if (laterDialog(top, target)) { queueMicrotask(() => contain(top)); return; }
        restore(top);
    };
    const contain = (layer: Layer) => {
        if (registry.layers[registry.layers.length - 1] !== layer || registries.get(document) !== registry) return;
        update(registry);
        const active = activeElement(document);
        if (active && (containsComposed(layer.element, active) || within(layer, active) || registry.yielded.some(host => containsComposed(host, active)))) return;
        restore(layer);
    };
    const onKey = (event: KeyboardEvent) => {
        const top = registry.layers[registry.layers.length - 1] as Layer | undefined;
        if (!top || registry.yielded.length || event.defaultPrevented || event.isComposing) return;
        const target = event.composedPath()[0] as Element;
        if (event.key === 'Escape') {
            // Focus displaced to the body, outside the surface, still dismisses the top layer.
            if (!containsComposed(top.surface, target) && !within(top, target)) { event.preventDefault(); top.onEscape(); }
            return;
        }
        if (event.key !== 'Tab' || event.altKey || event.ctrlKey || event.metaKey || !containsComposed(top.surface, target)) return;
        // Contained composed sequential order: wrap at both edges, from any focused node of the surface.
        const nodes = tabbables(top.surface), active = activeElement(document);
        event.preventDefault();
        if (!active || !nodes.length) return;
        const index = nodes.indexOf(active as HTMLElement), after = (node: HTMLElement) => !!(active.compareDocumentPosition(node) & 4);
        const last = nodes[nodes.length - 1];
        const next = event.shiftKey ? index > 0 ? nodes[index - 1] : index === 0 ? last : [...nodes].reverse().find(node => !after(node)) ?? last
            : index >= 0 ? nodes[(index + 1) % nodes.length] : nodes.find(after) ?? nodes[0];
        if (focusElement(next)) next?.scrollIntoView?.({block: 'nearest', inline: 'nearest'});
    };
    // Child-list changes add background nodes; attribute changes open or close host dialogs.
    // `inert`/`aria-hidden` changes show a host modal that covers the stack, also on a layer's own top-level node.
    const observer = new MutationObserver(records => {
        if (records.every(record => registry.layers.some(layer => layer.element !== record.target && containsComposed(layer.element, record.target as Element)))) return;
        if (registry.pending) { settle(registry); return; }
        update(registry);
    });
    const options = {childList: true, subtree: true, attributes: true, attributeFilter: ['open', 'aria-modal', 'role', 'hidden', 'inert', 'aria-hidden']};
    const unlock = lockScroll(document);
    const registry: Registry = {document, layers: [], hidden: new Map(), yielded: [], scopes: new Set(), pending: false, covering: new WeakSet(),
        observe() { observer.disconnect(); for (const target of [document, ...registry.scopes]) observer.observe(target, options); },
        release() { observer.disconnect(); document.removeEventListener('focusin', onFocus, true); document.removeEventListener('keydown', onKey); unlock(); }};
    registry.observe();
    document.addEventListener('focusin', onFocus, true);
    document.addEventListener('keydown', onKey);
    registries.set(document, registry);
    return registry;
}

/**
 * Review 2026-10-09-2: scroll locks and background hiding restore snapshots or skip nodes that are already hidden. A host
 * modal opened above the stack took its scroll snapshot while the package lock was applied and left the nodes this stack
 * hides to it, so releasing the stack first would expose and unlock the page under the host modal, and the host would
 * later restore `overflow: hidden` for good. The last package layer that closes under an open host layer therefore keeps
 * the background and the lock until every such host layer has closed, then restores the page.
 */
const openHosts = (registry: Registry) => registry.yielded.filter(element => element.isConnected && rendered(element)
    && (registry.covering.has(element) || modalContainer(element)));
function settle(registry: Registry) {
    if (registry.layers.length) return;
    registry.yielded = openHosts(registry);
    if (registry.yielded.length) { registry.pending = true; return; }
    registry.pending = false;
    for (const [element, kind] of registry.hidden) show(element, kind);
    registry.hidden.clear();
    registry.release();
    registries.delete(registry.document);
}
/** Opens a modal layer in its element's own document; the cleanup removes every effect the layer owns. */
export function openModalLayer(options: ModalLayerOptions) {
    const document = options.element.ownerDocument, registry = registryOf(document);
    registry.pending = false;
    const roots = shadowRoots(document);
    const layer: Layer = {...options, sequence: ++sequence, hosts: new Set(hostLayers(document, roots)), last: null,
        dialogs: new Set([document, ...roots].flatMap(scope => [...scope.querySelectorAll(dialogSelector)]))};
    registry.layers.push(layer);
    update(registry);
    const active = activeElement(document);
    if (options.restore && (!active || active === document.body)) restore(layer);
    return () => {
        const index = registry.layers.indexOf(layer);
        if (index < 0) return;
        registry.layers.splice(index, 1);
        if (registry.layers.length) { update(registry); return; }
        // The host layers open at this close decide whether the background and lock outlive the stack.
        settle(registry);
    };
}
