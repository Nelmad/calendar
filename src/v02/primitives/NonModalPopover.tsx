import {useEffect, useLayoutEffect, useRef, type ReactNode, type RefObject} from 'react';
import {Overlay} from 'react-aria/Overlay';
import {useOverlayPosition} from 'react-aria/useOverlayPosition';
import {activeElement} from '../calendar/dom.js';
import {composedParent, containsComposed} from '../calendar/focus.js';
import {registerFloating} from '../calendar/modality.js';
import {dialogContainer} from '../calendar/portal.js';
import {verticalPlacement} from '../core/placement.js';
import {PortalTheme} from './PortalTheme.js';
import {useThemeScope} from './ThemeRoot.js';

const useClientLayoutEffect = typeof document === 'undefined' ? useEffect : useLayoutEffect;
const padding = 16;
type Area = {top: number; left: number; bottom: number; right: number};
const viewport = (view: Window): Area => ({top: 0, left: 0, bottom: view.innerHeight, right: view.innerWidth});
const outside = (box: DOMRect, area: Area) => box.bottom <= area.top || box.top >= area.bottom || box.right <= area.left || box.left >= area.right;
/** The visible part of the positioning boundary: the viewport, or a dialog container's box within it. */
function visibleArea(boundary: Element): Area {
    const area = viewport(boundary.ownerDocument.defaultView!);
    if (boundary === boundary.ownerDocument.body) return area;
    const box = boundary.getBoundingClientRect();
    return {top: Math.max(box.top, 0), left: Math.max(box.left, 0), bottom: Math.min(box.bottom, area.bottom), right: Math.min(box.right, area.right)};
}
/** The anchor is scrolled out of the viewport, out of a clipping ancestor that does not also clip the overlay, or not rendered. */
function scrolledAway(anchor: Element, overlay: Element) {
    const box = anchor.getBoundingClientRect(), view = anchor.ownerDocument.defaultView!;
    // Without a layout box there is nothing to measure. An anchor the host hid (a `hidden` or display:none ancestor, a
    // Suspense fallback) is away like a scrolled one; a layout-less DOM has no checkVisibility (review 2026-10-09-2).
    if (!box.width && !box.height) return typeof anchor.checkVisibility === 'function' && !anchor.checkVisibility();
    if (outside(box, viewport(view))) return true;
    for (let node = composedParent(anchor); node && node !== anchor.ownerDocument.body && !containsComposed(node, overlay); node = composedParent(node)) {
        const style = view.getComputedStyle(node);
        if (style.overflowX === 'visible' && style.overflowY === 'visible') continue;
        const frame = node.getBoundingClientRect(), top = frame.top + node.clientTop, left = frame.left + node.clientLeft;
        if (outside(box, {top, left, bottom: top + node.clientHeight, right: left + node.clientWidth})) return true;
    }
    return false;
}

/** Moves the `edge` of `node` to the viewport coordinate `target`, whatever its containing block: write, measure, correct. */
function pin(node: HTMLElement, edge: 'top' | 'bottom', target: number) {
    const style = node.style, parsed = Number.parseFloat(style[edge]), value = Number.isFinite(parsed) ? parsed : 0;
    style.removeProperty(edge === 'top' ? 'bottom' : 'top');
    style[edge] = `${value}px`;
    const error = node.getBoundingClientRect()[edge] - target;
    if (Math.abs(error) > 0.5) style[edge] = `${edge === 'top' ? value - error : value + error}px`;
}

/**
 * React Aria mixes container and viewport coordinates for a boundary that is also the overlay's containing block
 * (a host dialog): it can keep the overlay below an anchor near the bottom of the dialog, or flip it and still count the
 * dialog offset twice, which squeezes the overlay (QA-B-1-05). Inside a dialog boundary the block-axis placement is
 * therefore chosen here from viewport geometry (verticalPlacement: the side with more room unless the overlay fits
 * below) and the overlay is fitted to that side of the boundary's visible area. In the body boundary React Aria's
 * placement stands and is only fitted in the direction it grows. An overlay whose anchor is scrolled away is clipped
 * away with it.
 */
function adjust(node: HTMLElement | null, anchor: HTMLElement | null, boundary: Element, offset: number) {
    if (!node) return;
    const area = visibleArea(boundary);
    if (anchor && boundary !== boundary.ownerDocument.body) {
        const target = anchor.getBoundingClientRect(), surface = node.firstElementChild as HTMLElement | null;
        // Natural block size of the popover: its content plus its own borders, independent of the current limit.
        const natural = surface ? surface.scrollHeight + surface.offsetHeight - surface.clientHeight : node.scrollHeight;
        if (target.width || target.height) {
            const {side, maxHeight} = verticalPlacement(target, area, natural, offset, padding);
            node.style.maxHeight = `${maxHeight}px`;
            pin(node, side === 'below' ? 'top' : 'bottom', side === 'below' ? target.bottom + offset : target.top - offset);
        }
    } else {
        const limit = Number.parseFloat(node.style.maxHeight);
        if (Number.isFinite(limit)) {
            const box = node.getBoundingClientRect();
            const available = Math.max(0, node.style.bottom ? box.bottom - area.top - padding : area.bottom - padding - box.top);
            if (available < limit) node.style.maxHeight = `${available}px`;
        }
    }
    if (anchor && scrolledAway(anchor, node)) node.style.clipPath = 'inset(50%)'; else node.style.removeProperty('clip-path');
}

/**
 * Public React Aria positioning/portal APIs; the owner supplies the non-modal focus lifecycle. The overlay stays
 * within the visible part of the dialog that contains its portal (a host modal, QA-03), else of the viewport.
 * Scrolling outside the overlay, or a size change of a box that holds its anchor, repositions it; its own scrolling never
 * does (QA-02, QA-D-3-02). While its anchor is scrolled
 * out of view, the overlay is clipped away with it instead of hanging over unrelated content (QA-21); it keeps
 * focus, and keyboard focus inside it scrolls the anchor back into view. `className` adds a class to the popover surface.
 */
export function NonModalPopover({anchor, portal, kind = 'agenda', className, children}: {anchor: RefObject<HTMLElement | null>; portal: Element; kind?: 'agenda' | 'menu';
    className?: string; children: ReactNode}) {
    const scope = useThemeScope(), overlay = useRef<HTMLDivElement>(null), scroller = useRef<HTMLDivElement>(null);
    const boundary = dialogContainer(portal) ?? portal.ownerDocument.body;
    const offset = kind === 'menu' ? 4 : 8;
    const {overlayProps, updatePosition} = useOverlayPosition({targetRef: anchor, overlayRef: overlay, scrollRef: scroller, isOpen: true, offset,
        placement: scope.dir === 'rtl' ? 'bottom right' : 'bottom left', containerPadding: padding, boundaryElement: boundary});
    // A new portal remounts the positioned node: it is registered again (a stale default target, portal.ts).
    useClientLayoutEffect(() => overlay.current ? registerFloating(overlay.current) : undefined, [portal]);
    // After every React Aria placement: it re-renders this component with the new position.
    useClientLayoutEffect(() => adjust(overlay.current, anchor.current, boundary, offset));
    // A new anchor (the root toolbar replacing a removed date cell) moves the overlay: once it is positioned, the
    // focused control inside it is brought back into view (QA-21). The first anchor keeps the opening focus rules.
    const target = anchor.current, previous = useRef(target);
    useEffect(() => {
        if (previous.current === target) return;
        previous.current = target;
        const node = overlay.current, window = node?.ownerDocument.defaultView;
        if (!node || !window) return;
        const frame = window.requestAnimationFrame(() => {
            const active = activeElement(node.ownerDocument);
            if (active && node.contains(active)) active.scrollIntoView?.({block: 'nearest', inline: 'nearest'});
        });
        return () => window.cancelAnimationFrame(frame);
    }, [target]);
    useEffect(() => {
        const document = portal.ownerDocument, window = document.defaultView!, node = overlay.current;
        let frame = 0;
        const place = () => { frame = 0; updatePosition(); adjust(node, anchor.current, boundary, offset); };
        const update = (event: Event) => {
            if (node && event.composedPath().includes(node)) return;
            if (!frame) frame = window.requestAnimationFrame(place);
        };
        const reveal = () => { if (node?.style.clipPath) anchor.current?.scrollIntoView?.({block: 'nearest', inline: 'nearest'}); };
        const scopes = new Set<EventTarget>([document, portal.getRootNode(), ...(anchor.current ? [anchor.current.getRootNode()] : [])]);
        for (const scope of scopes) scope.addEventListener('scroll', update, true);
        node?.addEventListener('focusin', reveal);
        // QA-D-3-02: the anchor also moves without a scroll, when its theme root or a box between them changes size (a
        // refresh error banner appearing above the grid, a resized container). Each of them is observed, up to the
        // nearest package theme root. React Aria writes the position directly, so the overlay follows in the same frame,
        // before paint; the overlay itself is outside the observed boxes.
        const observer = window.ResizeObserver ? new window.ResizeObserver(() => { window.cancelAnimationFrame(frame); place(); }) : null;
        for (let box: Element | null = anchor.current; box && observer; box = box.classList.contains('nc-theme') ? null : composedParent(box)) observer.observe(box);
        return () => {
            observer?.disconnect();
            window.cancelAnimationFrame(frame);
            for (const scope of scopes) scope.removeEventListener('scroll', update, true);
            node?.removeEventListener('focusin', reveal);
        };
    }, [anchor, target, portal, boundary, offset, updatePosition]);
    return <Overlay portalContainer={portal} disableFocusManagement>
        <div {...overlayProps} ref={overlay} className={`nc-positioned-popover nc-${kind}-positioner`}>
            <PortalTheme ref={scroller} className={`nc-popover nc-${kind}-popover${className ? ` ${className}` : ''}`}>{children}</PortalTheme>
        </div>
    </Overlay>;
}
