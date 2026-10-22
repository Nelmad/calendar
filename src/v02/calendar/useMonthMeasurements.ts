import {useEffect, useLayoutEffect, useState, type RefObject} from 'react';
import {flushSync} from 'react-dom';
import type {RowMetrics} from '../core/month.js';

const useClientLayoutEffect = typeof document === 'undefined' ? useEffect : useLayoutEffect;
const none: readonly RowMetrics[] = [];
/**
 * Absolute item layers never contribute to row height or ResizeObserver feedback. Metrics are indexed by row, so a
 * navigation keeps the rows' last sizes, and they are read in CSS px of the layout (computed sizes), so a host `zoom`
 * or `transform` around the calendar does not scale them (QA-18). A new revision measures before paint, and a resize
 * commits its lanes inside the ResizeObserver callback, before the frame that shows the new row size.
 */
export function useMonthMeasurements(grid: RefObject<HTMLDivElement>, revision: string, enabled = true) {
    const [rows, setRows] = useState<readonly RowMetrics[]>(none);
    useClientLayoutEffect(() => {
        const element = grid.current, window = element?.ownerDocument.defaultView;
        if (!enabled || !element || !window) return;
        let disposed = false, last = '';
        // Computed sizes are serialized with four decimals; layout uses 1/64 px units, so the exact value is recovered.
        const size = (node: Element, property: 'height' | 'width' | 'marginBottom' | 'borderTopWidth' | 'borderBottomWidth') =>
            Math.round(Number.parseFloat(window.getComputedStyle(node)[property]) * 64) / 64;
        const measure = () => {
            if (disposed) return;
            const item = element.querySelector<HTMLElement>('.nc-month-item-probe');
            const overflow = element.querySelector<HTMLElement>('.nc-month-overflow-probe');
            if (!item || !overflow) return;
            const itemHeight = size(item, 'height'), overflowHeight = size(overflow, 'height'), gap = size(item, 'marginBottom') || 0;
            const next = [...element.querySelectorAll<HTMLElement>('.nc-month-week')].map((row): RowMetrics => ({
                height: size(row, 'height') - (size(row, 'borderTopWidth') || 0) - (size(row, 'borderBottomWidth') || 0), width: size(row, 'width'),
                header: Math.max(0, ...[...row.querySelectorAll<HTMLElement>('.nc-day-header')].map(node => size(node, 'height'))),
                item: itemHeight, overflow: overflowHeight, gap}));
            // Only changed metrics are written (QA-01): an unchanged measurement never queues a render.
            const serialized = JSON.stringify(next);
            if (serialized === last) return;
            last = serialized;
            setRows(previous => JSON.stringify(previous) === serialized ? previous : next);
        };
        const observer = window.ResizeObserver ? new window.ResizeObserver(() => { if (!disposed) flushSync(measure); }) : null;
        for (const node of element.querySelectorAll('.nc-month-week, .nc-day-header, .nc-month-item-probe, .nc-month-overflow-probe')) observer?.observe(node);
        observer?.observe(element);
        let frame = 0;
        const schedule = () => { if (!disposed && !frame) frame = window.requestAnimationFrame(() => { frame = 0; measure(); }); };
        window.addEventListener('resize', schedule);
        const fonts = element.ownerDocument.fonts;
        fonts?.addEventListener('loadingdone', schedule);
        void fonts?.ready.then(schedule);
        measure();
        return () => { disposed = true; observer?.disconnect(); window.cancelAnimationFrame(frame); window.removeEventListener('resize', schedule); fonts?.removeEventListener('loadingdone', schedule); };
    }, [grid, revision, enabled]);
    return rows;
}
/**
 * §12.5 (review 2026-10-09-3): short weekday labels that do not fit their column (long locale names at 320 px, 200% text) switch
 * the whole header row to the narrow format (`data-narrow-weekdays`, CSS). The short label stays laid out but hidden, so the check never
 * depends on its own outcome; its own ResizeObserver entry reports a text-size change. Computed sizes, as above (QA-18).
 * Only the attribute is written, outside React: no render, and the server HTML keeps the short labels.
 */
export function useWeekdayFit(row: RefObject<HTMLDivElement>, revision: string) {
    useClientLayoutEffect(() => {
        const element = row.current, window = element?.ownerDocument.defaultView;
        if (!element || !window) return;
        const px = (node: Element, property: 'width' | 'paddingLeft' | 'paddingRight') => Number.parseFloat(window.getComputedStyle(node)[property]) || 0;
        const fit = () => {
            const narrow = [...element.querySelectorAll<HTMLElement>('.nc-weekday')].some(cell => {
                const label = cell.querySelector('.nc-weekday-label');
                return !!label && px(label, 'width') > px(cell, 'width') - px(cell, 'paddingLeft') - px(cell, 'paddingRight') + 0.5;
            });
            if (element.hasAttribute('data-narrow-weekdays') !== narrow) element.toggleAttribute('data-narrow-weekdays', narrow);
        };
        fit();
        if (!window.ResizeObserver) return;
        const observer = new window.ResizeObserver(fit);
        for (const node of [element, ...element.querySelectorAll('.nc-weekday-label')]) observer.observe(node);
        return () => observer.disconnect();
    }, [row, revision]);
}
