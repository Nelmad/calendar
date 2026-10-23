import {useEffect, useLayoutEffect, useRef, type RefObject} from 'react';

const useClientLayoutEffect = typeof document === 'undefined' ? useEffect : useLayoutEffect;
/** The used block size in CSS px of the layout (computed, so a host `zoom` or `transform` does not scale it; QA-18). */
const blockSize = (node: Element) => Math.round(Number.parseFloat(node.ownerDocument.defaultView!.getComputedStyle(node).height) * 64) / 64 || 0;

/**
 * Mirrors the block size of `source` into the custom property `name` on `target` while both exist; the first value is
 * written before paint. The property must not resize an observed box (it only sets `scroll-padding`), so a change is
 * written inside the ResizeObserver callback.
 */
export function useBlockSizeVariable(source: RefObject<Element | null>, target: RefObject<HTMLElement | null>, name: string, revision: unknown) {
    useClientLayoutEffect(() => {
        const node = source.current, element = target.current, window = node?.ownerDocument.defaultView;
        if (!node || !element || !window) return;
        const write = () => { const value = `${blockSize(node)}px`; if (element.style.getPropertyValue(name) !== value) element.style.setProperty(name, value); };
        write();
        const observer = window.ResizeObserver ? new window.ResizeObserver(write) : null;
        observer?.observe(node);
        return () => { observer?.disconnect(); element.style.removeProperty(name); };
    }, [source, target, name, revision]);
}

type ViewSize = {key: string; height: number; weeks: number; row: number};
/**
 * QA-D-1-05: a blocking status keeps the measured height of the view it replaces (same layout and density), adjusted by
 * one measured week row per week of difference. Without a measurement (server, first mount) the stylesheet estimate
 * applies. Only the last size is remembered; it never feeds back into the view.
 */
export function useBlockingReserve(view: RefObject<HTMLElement | null>, status: RefObject<HTMLElement | null>, blocking: boolean, key: string, weeks: number, revision: unknown) {
    const last = useRef<ViewSize | null>(null);
    useClientLayoutEffect(() => {
        const node = view.current, window = node?.ownerDocument.defaultView;
        if (blocking || !node || !window) return;
        const measure = () => {
            const rows = node.querySelector('.nc-month-weeks');
            const height = blockSize(node);
            if (rows && height > 0) last.current = {key, height, weeks, row: blockSize(rows) / weeks};
        };
        measure();
        const observer = window.ResizeObserver ? new window.ResizeObserver(measure) : null;
        observer?.observe(node);
        return () => observer?.disconnect();
    }, [view, blocking, key, weeks]);
    useClientLayoutEffect(() => {
        const element = status.current, size = last.current;
        if (!blocking || !element) return;
        if (size?.key === key) element.style.setProperty('--nc-reserved-block-size', `${Math.max(0, size.height + (weeks - size.weeks) * size.row)}px`);
        return () => { element.style.removeProperty('--nc-reserved-block-size'); };
    }, [status, blocking, key, weeks, revision]);
}
