import {useCallback, useEffect, useLayoutEffect, useRef, type MouseEvent, type PointerEvent, type ReactNode} from 'react';
import {Overlay} from 'react-aria/Overlay';
import {openModalLayer} from '../calendar/modality.js';
import {PortalTheme} from './PortalTheme.js';
import {initializeUIRuntime} from './runtime.js';

const useClientLayoutEffect = typeof document === 'undefined' ? useEffect : useLayoutEffect;

/**
 * Modal sheet. Its modal effects (background `inert`, scroll lock, focus containment, Escape with displaced focus)
 * are package-owned and bound to the portal's own document, reference-counted with every other package modal
 * layer there (modality.ts). The documented backdrop press dismisses. The owner keeps initial focus and §12.3
 * recovery: RAC ModalOverlay always restores focus a frame later, which would race a passive presentation switch.
 */
export function ModalSheet({portal, onDismiss, modalRef, children}: {portal: Element; onDismiss: () => void; modalRef?: (node: HTMLDivElement | null) => void; children: ReactNode}) {
    initializeUIRuntime();
    const backdrop = useRef<HTMLDivElement | null>(null), sheet = useRef<HTMLDivElement | null>(null), dismiss = useRef(onDismiss), pressed = useRef(false);
    const attach = useCallback((node: HTMLDivElement | null) => { sheet.current = node; modalRef?.(node); }, [modalRef]);
    useClientLayoutEffect(() => { dismiss.current = onDismiss; });
    // Applied in the commit that mounts the sheet: before the owner's initial focus and announcements. A new portal
    // remounts the portal content, so the layer moves with its new backdrop (a stale default target, portal.ts).
    // Review 2026-10-09-2: a Suspense fallback above the owner destroys these layout effects but leaves portal content shown.
    // A layer removed while its backdrop stays connected (not an unmount, not a StrictMode replay) hides the sheet until
    // the effects reappear: an aria-modal surface is never shown without its modal effects.
    const open = useRef(false);
    useClientLayoutEffect(() => {
        const element = backdrop.current, surface = sheet.current;
        if (!element || !surface) return;
        const suspended = element.hidden;
        element.hidden = false; open.current = true;
        const close = openModalLayer({element, surface, restore: suspended, onEscape: () => dismiss.current(),
            onYield: yielded => { if (yielded) element.setAttribute('data-yielded', ''); else element.removeAttribute('data-yielded'); }});
        return () => {
            open.current = false; close();
            queueMicrotask(() => { if (!open.current && element.isConnected) element.hidden = true; });
        };
    }, [portal]);
    // Only a press that starts and ends on the backdrop itself dismisses: a drag between the sheet (text selection)
    // and the backdrop dispatches its click on the common ancestor, the backdrop, and must not (QA-B-1-02). The
    // backdrop mousedown must not first move focus to a focusable ancestor such as the calendar root. Outside-interaction
    // detection of the owner still sees the whole press.
    const own = (event: MouseEvent | PointerEvent) => event.target === event.currentTarget;
    return <Overlay portalContainer={portal} disableFocusManagement>
        <PortalTheme ref={backdrop} onPointerDown={event => { pressed.current = own(event); }} onPointerUp={event => { pressed.current &&= own(event); }}
            onMouseDown={event => { if (own(event)) event.preventDefault(); }}
            onClick={event => { const started = pressed.current; pressed.current = false; if (started && own(event)) dismiss.current(); }}
            className="nc-backdrop nc-sheet-backdrop">
            <div ref={attach} className="nc-modal nc-sheet">{children}</div>
        </PortalTheme>
    </Overlay>;
}
