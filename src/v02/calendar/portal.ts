import {useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject} from 'react';
import {acceptPortal} from '../core/overlayStack.js';
import {composedParent, modalDialog} from './focus.js';

type Requested = Element | DocumentFragment | null | undefined;
const useClientLayoutEffect = typeof document === 'undefined' ? useEffect : useLayoutEffect;
const isShadowRoot = (node: Node | null): node is ShadowRoot => node?.nodeType === 11 && (node as Partial<ShadowRoot>).host?.nodeType === 1;
/**
 * Every ShadowRoot on the composed path of `node`: mutations inside them never reach the document. A
 * JavaScript value that is not a node has none; `host` alone is no test (an anchor has a string `host`).
 */
function shadowScopes(node: unknown) {
    const scopes: ShadowRoot[] = [];
    const start = typeof (node as Partial<Node> | null)?.getRootNode === 'function' ? (node as Node) : null;
    for (let scope = start?.getRootNode() ?? null; isShadowRoot(scope); scope = scope.host.getRootNode()) scopes.push(scope);
    return scopes;
}
export {modalDialog};
/**
 * §10.3.4 (spec v7): an open modal container is a `<dialog>` in the modal state or an element with `aria-modal="true"`
 * (a closed `<dialog>` never is). A plain `role="dialog"`/`"alertdialog"` (a side panel, a toast) or a `<dialog>` opened
 * with `show()` without `aria-modal` is not one.
 */
export const modalContainer = (element: Element) => modalDialog(element)
    || element.getAttribute('aria-modal') === 'true' && (element.localName !== 'dialog' || (element as HTMLDialogElement).open);
/**
 * The nearest open modal container on the composed path from `node` (inclusive). A modal host keeps everything outside
 * it inert, traps focus or blocks pointer events (QA-03), so package overlays of a Calendar inside it stay inside it.
 */
export function dialogContainer(node: Element | null): Element | null {
    for (let current = node; current; current = composedParent(current)) if (modalContainer(current)) return current;
    return null;
}

/**
 * The nearest `role="dialog"`/`"alertdialog"` on the composed path from `node` that is not a modal container. Libraries such as
 * Radix Dialog and React Aria Components Modal/Popover render one without `aria-modal` and trap focus or close on outside focus.
 */
export function unmarkedDialog(node: Element | null): Element | null {
    for (let current = node; current; current = composedParent(current)) if (/^(alert)?dialog$/.test(current.getAttribute('role') ?? '') && !modalContainer(current)) return current;
    return null;
}
const unmarkedReason = (dialog: Element) => `The calendar is inside a role="${dialog.getAttribute('role')}" element without aria-modal="true", so the agenda and menus render in document.body; `
    + 'a dialog or popover library that traps focus or closes on outside focus closes them (or itself) at once. Pass that dialog element as portalContainer, or document.body to keep this default';

/**
 * §10.3.4 portal target, resolved in an effect (never during render or on the server). `undefined`/`null`
 * or an invalid container is the nearest open modal container of the Calendar root (`dialogContainer`, QA-03,
 * spec v7), else the owner document `body`; a ShadowRoot receives one package-owned host. A change of the accepted container's
 * identity, including to/from an explicit container, its removal, or a change of the default target calls `onChange`
 * before the new target is used, so the caller closes its stack and nothing reopens there. Two equivalent absent values
 * (`undefined`, `null`) and a repeated StrictMode effect are no change: the accepted value and the target persist across
 * effect runs. `refresh` re-resolves before a user activation (a host dialog may have opened since mount). The document
 * is observed only while `active()` holds (an overlay of the caller is open), so a closed Calendar keeps no observer
 * (§11.3); it is checked after each render of the caller and on each `subscribe` notification, without rendering.
 * Every start of observation re-resolves first: an overlay may open without an activation (a §11.3 passive switch with
 * owned focus). Nothing of the caller was open before, so a target found stale there only moves the overlay mounted in
 * this commit, before paint; `onChange` is not called. `resolved()` is the target the next commit uses: while it
 * differs from `portal`, the overlay just mounted is about to move and the caller defers its focus work.
 */
export function usePortalTarget(requested: Requested, rootRef: RefObject<HTMLElement>, warn: (path: string, reason: string) => void, onChange: () => void,
    active: () => boolean, subscribe?: (listener: () => void) => () => void) {
    const [portal, setPortal] = useState<Element | null>(null);
    const accepted = useRef<Requested | undefined>(undefined), target = useRef<Element | null>(null), change = useRef(onChange), resolver = useRef<(() => void) | null>(null);
    const isActive = useRef(active), sync = useRef<(() => void) | null>(null);
    // The package-owned host inside an accepted ShadowRoot; it is reused while that ShadowRoot stays accepted.
    const host = useRef<{scope: Node; element: HTMLElement} | null>(null);
    useClientLayoutEffect(() => { change.current = onChange; isActive.current = active; sync.current?.(); });
    useEffect(() => {
        const root = rootRef.current, document = root?.ownerDocument;
        if (!root || !document) return;
        const fallback = () => dialogContainer(composedParent(root)) ?? document.body;
        const resolve = (opening = false) => {
            const result = acceptPortal(requested, document), next = result.accepted, before = accepted.current, previous = target.current;
            if (result.reason) warn('portalContainer', result.reason);
            accepted.current = next;
            if (next?.nodeType === 11) {
                if (host.current?.scope !== next) { host.current?.element.remove(); host.current = {scope: next, element: document.createElement('div')}; }
                if (host.current.element.parentNode !== next) next.appendChild(host.current.element);
                target.current = host.current.element;
            } else { host.current?.element.remove(); host.current = null; target.current = (next as Element | null) ?? fallback(); }
            // Review 2026-10-09-3: the v7 default for an unmarked host dialog is body; development builds say so once, since
            // focus-trapping libraries then close the overlay silently. An explicit container (document.body too) is a choice.
            const unmarked = process.env.NODE_ENV !== 'production' && next == null && target.current === document.body ? unmarkedDialog(composedParent(root)) : null;
            if (unmarked) warn('portalContainer', unmarkedReason(unmarked));
            if (!opening && before !== undefined && (before !== next || previous !== target.current)) change.current();
            if (previous !== target.current) setPortal(target.current);
        };
        resolve();
        resolver.current = () => resolve();
        // Removal of the active container, a requested one becoming valid, or a new default target re-resolves. A host
        // changes modality by attributes alone (`aria-modal`, the `open` of `showModal()`/`close()`), without a node change.
        const observer = new MutationObserver(() => {
            const current = accepted.current;
            if (current ? !current.isConnected : acceptPortal(requested, document).accepted || fallback() !== target.current) resolve();
        });
        const options = {childList: true, subtree: true, attributes: true, attributeFilter: ['aria-modal', 'open']};
        let observing = false;
        sync.current = () => {
            const next = isActive.current();
            if (next === observing) return;
            observing = next;
            if (!next) { observer.disconnect(); return; }
            resolve(true);
            for (const scope of new Set<Node>([document, ...shadowScopes(requested), ...shadowScopes(root)])) observer.observe(scope, options);
        };
        sync.current();
        const unsubscribe = subscribe?.(() => sync.current?.());
        return () => { unsubscribe?.(); observer.disconnect(); sync.current = null; resolver.current = null; };
    }, [requested, rootRef, warn, subscribe]);
    // The host leaves the ShadowRoot with the Calendar. A StrictMode re-run appends the same host again (no change).
    useEffect(() => () => { host.current?.element.remove(); }, []);
    const refresh = useCallback(() => { resolver.current?.(); }, []);
    const resolved = useCallback(() => target.current, []);
    return {portal, refresh, resolved};
}
