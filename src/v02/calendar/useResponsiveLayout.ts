import {useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject} from 'react';
import type {CalendarResolvedLayout} from '../reference.js';
import {defaultMobileBreakpoint, layoutForWidth, resolveLayout, switchFeedback, validWidth, withinFeedbackBand} from '../core/responsive.js';

// The server runs neither effect; on the client the first measurement commits before paint. Only a
// server render inside a DOM-like host (jsdom tests) sees useLayoutEffect, and React 18 then logs its
// dev-only SSR notice; React Aria uses the same switch. Node/Next SSR has no document and stays silent.
const useClientLayoutEffect = typeof document === 'undefined' ? useEffect : useLayoutEffect;
const forced = (value: unknown): value is CalendarResolvedLayout => value === 'desktop' || value === 'mobile';

/**
 * Used content-box width, or NaN when the root has no layout box. Without a box (display:none
 * ancestor, detached, display:contents) getComputedStyle returns the specified value instead
 * ('900px', '100%'), which is not a measurement.
 */
function contentWidth(element: HTMLElement, window: Window) {
    if (element.getClientRects().length === 0) return Number.NaN;
    const style = window.getComputedStyle(element), px = (value: string) => Number.parseFloat(value) || 0;
    if (!style.width.endsWith('px')) return Number.NaN;
    const width = Number.parseFloat(style.width);
    return style.boxSizing === 'border-box' ? width - px(style.paddingLeft) - px(style.paddingRight) - px(style.borderLeftWidth) - px(style.borderRightWidth) : width;
}

/**
 * Render half of the resolver: no DOM, window or matchMedia reads. Server and the first client
 * render of `auto` are mobile; a forced layout is used directly and never needs a measurement.
 * `unmeasured` marks the server and first client render of `auto` with the default breakpoint until the
 * first width decision commits: the stylesheet then sizes that compact month like the desktop one in a view
 * of at least the breakpoint. A render without those conditions ends it for good, as does any decision and
 * `end` (a render that observes no width, such as a contract shell, so that valid props later are not pre-sized).
 */
export function useResolvedLayout(requested: unknown, breakpoint?: unknown) {
    const [measured, setMeasured] = useState<CalendarResolvedLayout | null>(null);
    const [carried, setCarried] = useState<CalendarResolvedLayout | null>(() => forced(requested) ? requested : null);
    const presized = (requested === undefined || requested === 'auto') && (breakpoint === undefined || breakpoint === defaultMobileBreakpoint);
    const [unmeasured, setUnmeasured] = useState(presized);
    // Derived state during render (React's documented pattern): a forced layout drops the auto
    // measurement and is carried over a later runtime forced → auto switch until the commit-time
    // read settles it: a valid width replaces it, an unmeasurable root drops it to mobile (§7).
    if (forced(requested)) {
        if (carried !== requested) setCarried(requested);
        if (measured !== null) setMeasured(null);
    }
    if (unmeasured && !presized) setUnmeasured(false);
    // Every decision ends the unmeasured phase in the same update as the layout it decides, also one that keeps mobile
    // (a narrow or unmeasurable root), which changes no other state.
    const settle = useCallback((layout: CalendarResolvedLayout | null) => {
        setUnmeasured(false);
        if (layout) setMeasured(layout); else setCarried(null);
    }, []);
    // Ends the phase without a decision, keeping a carried layout (settle(null) would drop it).
    const end = useCallback(() => setUnmeasured(false), []);
    return {layout: resolveLayout(forced(requested) ? requested : 'auto', measured, carried), forced: forced(requested), settle, end, unmeasured: unmeasured && presized};
}
/**
 * Commit half: only a valid `auto` configuration observes the root content box, with exactly one
 * ResizeObserver. Invalid (zero, hidden, non-finite) widths are not measurements: the last valid
 * width keeps deciding, also against a changed breakpoint; with none yet the layout is mobile. Like the
 * render half's measured layout, that width is dropped only by a forced layout, not by a contract shell.
 * Loop guard (QA-04): each width-driven switch is measured again in its own commit; a switch that moved the
 * width back across the breakpoint by itself keeps its layout while the width stays within that feedback band
 * (switchFeedback, withinFeedbackBand), so a drag through the band switches once, not on every step.
 */
export function useLayoutObserver(root: RefObject<HTMLElement>, active: boolean, forcedLayout: boolean, breakpoint: number | undefined,
    layout: CalendarResolvedLayout, settle: (layout: CalendarResolvedLayout | null) => void, notify?: () => void) {
    const boundary = breakpoint ?? defaultMobileBreakpoint, last = useRef<number | null>(null), rendered = useRef(layout);
    const pending = useRef<{from: CalendarResolvedLayout; to: CalendarResolvedLayout; width: number} | null>(null), band = useRef<number | null>(null);
    useClientLayoutEffect(() => {
        rendered.current = layout;
        const element = root.current, window = element?.ownerDocument.defaultView, check = pending.current;
        if (!check || check.to !== layout || !element || !window) return;
        pending.current = null;
        const width = contentWidth(element, window);
        if (switchFeedback(check.from, check.to, width, boundary)) band.current = Math.abs(width - check.width);
    }, [layout]);
    useClientLayoutEffect(() => {
        const element = root.current, window = element?.ownerDocument.defaultView;
        pending.current = null; band.current = null;
        if (!active || !element || !window) { if (forcedLayout) last.current = null; return; }
        // The first decision always settles (it replaces a carried layout); later ones only on a change.
        let current = rendered.current, settled = false;
        const decide = (next: CalendarResolvedLayout, width: number) => {
            if (settled && next === current) return;
            if (next !== current) pending.current = {from: current, to: next, width};
            current = next; settled = true; settle(next);
        };
        const apply = (width: number) => {
            if (!validWidth(width)) return;
            last.current = width;
            // Inside a learned feedback band the current layout stays (height-only notifications repeat the width);
            // leaving it forgets the band, so a later crossing measures its own feedback again.
            if (withinFeedbackBand(width, band.current, boundary)) return;
            band.current = null;
            decide(layoutForWidth(width, boundary), width);
        };
        const width = contentWidth(element, window);
        if (validWidth(width)) apply(width);
        else if (last.current === null) settle(null);
        else decide(layoutForWidth(last.current, boundary), last.current);
        if (!window.ResizeObserver) return;
        // Each notification is also a portal-mirror checkpoint of this Calendar (§10.3.4).
        const observer = new window.ResizeObserver(entries => { for (const entry of entries) apply(entry.contentRect.width); notify?.(); });
        observer.observe(element);
        return () => observer.disconnect();
    }, [root, active, forcedLayout, boundary, settle, notify]);
}
