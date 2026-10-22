import {addCalendarDays} from './date.js';
import type {CalendarDateRange, CalendarDirection} from '../reference.js';

export function gridKeyTarget(date: string, column: number, key: string, dir: CalendarDirection): string | null {
    const offset = key === 'ArrowLeft' ? (dir === 'rtl' ? 1 : -1) : key === 'ArrowRight' ? (dir === 'rtl' ? -1 : 1)
        : key === 'ArrowUp' ? -7 : key === 'ArrowDown' ? 7 : key === 'Home' ? -column : key === 'End' ? 6 - column : null;
    if (offset === null) return null;
    try { return addCalendarDays(date, offset); }
    catch (error) { if (error instanceof RangeError) return null; throw error; }
}
export type RowMetrics = Readonly<{height: number; width: number; header: number; item: number; overflow: number; gap: number}>;
export function rowLaneCapacity(metrics: RowMetrics | undefined) {
    if (!metrics || !Object.values(metrics).every(Number.isFinite) || metrics.height <= 0 || metrics.width <= 0 || metrics.item <= 0
        || metrics.header <= 0 || metrics.overflow <= 0 || metrics.gap < 0) return {withoutOverflow: 0, withOverflow: 0};
    const available = metrics.height - metrics.header - 2 * metrics.gap;
    return {withoutOverflow: Math.max(0, Math.floor((available + metrics.gap) / (metrics.item + metrics.gap))),
        withOverflow: Math.max(0, Math.floor((available - metrics.overflow) / (metrics.item + metrics.gap)))};
}
export function hitDate(x: number, columns: readonly {date: string; left: number; right: number}[], range: CalendarDateRange): string | undefined {
    return columns.find(column => column.date >= range.start && column.date < range.end && x >= column.left && x < column.right)?.date;
}
