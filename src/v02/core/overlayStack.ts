/**
 * Ownership tree of one Calendar's package overlays (§12.2/§12.3): the agenda presentation is the root
 * owner and child menus/sheets nest under it. A parent has at most one open child, so the open tree is
 * a chain ordered from the root to the top; every close is reported top-down (deepest first).
 */
export type OverlayEntry = Readonly<{id: string; parent: string | null; modal: boolean}>;
export type OverlayStack = readonly OverlayEntry[];
export type OverlayChange = Readonly<{stack: OverlayStack; closed: readonly OverlayEntry[]}>;

/** Opens `entry` above its parent; a sibling subtree of that parent closes first. An orphan is refused. */
export function pushOverlay(stack: OverlayStack, entry: OverlayEntry): OverlayChange {
    const at = entry.parent === null ? -1 : stack.findIndex(item => item.id === entry.parent);
    if (entry.parent !== null && at < 0) return {stack, closed: []};
    return {stack: [...stack.slice(0, at + 1), entry], closed: stack.slice(at + 1).reverse()};
}
/** Closes `id` with its descendants, deepest first; an unknown id changes nothing. */
export function closeOverlay(stack: OverlayStack, id: string): OverlayChange {
    const at = stack.findIndex(item => item.id === id);
    return at < 0 ? {stack, closed: []} : {stack: stack.slice(0, at), closed: stack.slice(at).reverse()};
}
/** Escape acts on exactly this entry (§8): the top of the chain. */
export const topOverlay = (stack: OverlayStack): OverlayEntry | undefined => stack[stack.length - 1];
export const modalDepth = (stack: OverlayStack) => stack.filter(item => item.modal).length;
/**
 * §12.4: modal entries that may own the Calendar's single live endpoint, top-most first. The first one whose
 * endpoint is mounted receives output; with none, the root endpoints do.
 */
export const liveOwners = (stack: OverlayStack): readonly string[] => [...stack].reverse().filter(item => item.modal).map(item => item.id);
/**
 * Entries closed by an outside press whose composed path reaches `inside` (null: none of them). Only
 * non-modal entries above the deepest entry in the path close; a modal entry is dismissed by its backdrop.
 */
export function outsidePress(stack: OverlayStack, inside: string | null): readonly OverlayEntry[] {
    const at = inside === null ? -1 : stack.findIndex(item => item.id === inside);
    const above = stack.slice(at + 1);
    return above.some(item => item.modal) ? [] : above.reverse();
}
/**
 * §12.3 step 2 after a child closed while its parent stays open: the first usable control after the
 * trigger's former logical position, then the last usable one before it. Targets outside the parent
 * are never part of `order`; the caller falls back to the parent's heading or container.
 */
export function parentFallback<T>(order: readonly T[], trigger: number, usable: (node: T) => boolean): T | undefined {
    for (let index = trigger + 1; index < order.length; index++) if (usable(order[index])) return order[index];
    for (let index = Math.min(trigger, order.length) - 1; index >= 0; index--) if (usable(order[index])) return order[index];
    return undefined;
}

/** Structural view of the DOM nodes that `portalContainer` may hold; checked without layout reads. */
type PortalNode = {nodeType?: unknown; isConnected?: unknown; ownerDocument?: unknown; host?: unknown};
export type PortalAcceptance<T> = Readonly<{accepted: T | null; reason?: string}>;
/**
 * §10.3.4: `undefined`/`null` is the default (owner `body`). An explicit container must be a connected
 * Element or ShadowRoot of the same owner document; anything else is ignored in favor of the default.
 */
export function acceptPortal<T>(requested: T | null | undefined, ownerDocument: unknown): PortalAcceptance<T> {
    if (requested === undefined || requested === null) return {accepted: null};
    const node = requested as PortalNode;
    const kind = typeof node === 'object' ? node.nodeType : undefined;
    if (kind !== 1 && !(kind === 11 && !!node.host)) return {accepted: null, reason: 'Expected an Element or ShadowRoot; using the default container'};
    if (node.isConnected !== true) return {accepted: null, reason: 'Detached container; using the default container'};
    if (node.ownerDocument !== ownerDocument) return {accepted: null, reason: "Container belongs to another document; using the calendar's document body"};
    return {accepted: requested};
}
