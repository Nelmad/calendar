import type {CalendarDateRange, CalendarItem, CalendarSortContext} from '../reference.js';
import {parseDateRange} from './date.js';
import {dateToDay, dayToDate, type createIntervalProjector, type IntervalDates} from './projection.js';
import type {ValidatedItem, ValidatedRecords} from './validation.js';

export type LayoutDiagnostic = Readonly<{code: 'invalid-comparator-result'; itemIds: readonly [string, string]; reason: string}>;
export type ProjectedItem<I, S> = Readonly<{record: ValidatedItem<I, S>; membership: IntervalDates; presentation: 'bar' | 'chip'}>;
export type WeekSegment<I, S> = Readonly<{
    entry: ProjectedItem<I, S>; startColumn: number; endColumn: number; lane: number;
    segmentRange: CalendarDateRange; continuesBefore: boolean; continuesAfter: boolean;
}>;
export type WeekLayout<I, S> = Readonly<{dates: readonly string[]; segments: readonly WeekSegment<I, S>[]; laneCount: number}>;
type Comparator<I> = (a: CalendarItem<I>, b: CalendarItem<I>, context: CalendarSortContext) => number;
const codeUnits = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;

/** Two or more local dates: the first and the last date differ. */
const multiDay = (dates: IntervalDates) => dates.end - dates.first > 1;
function defaultOrder<I, S>(a: ProjectedItem<I, S>, b: ProjectedItem<I, S>): number {
    const group = (entry: ProjectedItem<I, S>) => entry.record.interval.kind === 'allDay' ? 0 : multiDay(entry.membership) ? 1 : 2;
    const groupDifference = group(a) - group(b);
    if (groupDifference) return groupDifference;
    const first = a.record.interval, second = b.record.interval;
    // All-day dates are contiguous: the span is the date count.
    if (first.kind === 'allDay' && second.kind === 'allDay') return codeUnits(first.start, second.start) || (b.membership.end - b.membership.first) - (a.membership.end - a.membership.first);
    // With equal start instants the dates of the shorter interval are a prefix of the longer one's, so the later last date
    // is the larger date count (offsets change at most once in 72 h, so no later fold returns to a date it skipped).
    if (first.kind === 'timed' && second.kind === 'timed') return first.start - second.start || (group(a) === 1 ? b.membership.end - a.membership.end : 0);
    return 0;
}

export function orderItems<I, S>(records: ValidatedRecords<I, S>, projector: ReturnType<typeof createIntervalProjector>, timeZone: string, comparator?: Comparator<I>) {
    const entries: ProjectedItem<I, S>[] = records.visibleItems.map(record => {
        const membership = projector.dates(record.interval, timeZone);
        return {record, membership, presentation: record.interval.kind === 'allDay' || multiDay(membership) ? 'bar' : 'chip'};
    });
    const diagnostics: LayoutDiagnostic[] = [];
    const context = Object.freeze({timeZone});
    entries.sort((a, b) => {
        let result = comparator ? comparator(a.record.item, b.record.item, context) : defaultOrder(a, b);
        if (!Number.isFinite(result)) {
            diagnostics.push({code: 'invalid-comparator-result', itemIds: [a.record.item.id, b.record.item.id], reason: 'Non-finite comparator result is treated as zero'});
            result = 0;
        }
        return result || codeUnits(a.record.item.id, b.record.item.id);
    });
    return {entries, diagnostics};
}

function buildWeek<I, S>(entries: readonly ProjectedItem<I, S>[], start: number): WeekLayout<I, S> {
    const dates = Array.from({length: 7}, (_, column) => dayToDate(start + column));
    const segments: WeekSegment<I, S>[] = [];
    const floor = Array<number>(7).fill(-1);
    for (const entry of entries) {
        const membership = entry.membership;
        if (membership.end <= start || membership.first >= start + 7) continue;
        const columns = dates.map((_, column) => membership.contains(start + column));
        if (!columns.some(Boolean)) continue;
        // Preserve the global order in every occupied cell. First-fit occupancy
        // alone could put a later short item above an earlier long bar.
        const lane = 1 + Math.max(...floor.filter((_, column) => columns[column]));
        for (let column = 0; column < 7; column++) if (columns[column]) floor[column] = lane;
        // Continuation is a property of the item: a part next to a skipped local date (Apia) still continues (QA-18).
        // One segment per run of covered columns: the item's date ranges clipped to this week.
        for (let column = 0; column < 7; column++) {
            if (!columns[column] || columns[column - 1]) continue;
            let next = column + 1;
            while (next < 7 && columns[next]) next++;
            const clippedStart = start + column, clippedEnd = start + next;
            segments.push({entry, lane, startColumn: column, endColumn: next,
                segmentRange: {start: dayToDate(clippedStart), end: dayToDate(clippedEnd)},
                continuesBefore: membership.first < clippedStart, continuesAfter: membership.end > clippedEnd,
            });
        }
    }
    return {dates, segments, laneCount: Math.max(...floor) + 1};
}

/** Input range is the validated complete Month grid; agenda may ask any ISO date. */
export function buildCalendarIndex<I, S>(
    records: ValidatedRecords<I, S>, projector: ReturnType<typeof createIntervalProjector>,
    timeZone: string, range: CalendarDateRange, comparator?: Comparator<I>,
) {
    return indexRange(orderItems(records, projector, timeZone, comparator), range);
}
/** The range part over already ordered entries: navigation does not re-project or re-sort unchanged items. */
export function indexRange<I, S>({entries, diagnostics}: ReturnType<typeof orderItems<I, S>>, range: CalendarDateRange) {
    parseDateRange(range);
    const start = dateToDay(range.start), end = dateToDay(range.end), count = end - start;
    if (![28, 35, 42].includes(count)) throw new RangeError('Month grid must contain four to six complete weeks');
    const agendaCache = new Map<string, readonly ProjectedItem<I, S>[]>();
    const agenda = (date: string): readonly ProjectedItem<I, S>[] => {
        const day = dateToDay(date);
        let result = agendaCache.get(date);
        if (!result) {
            result = entries.filter(entry => entry.membership.contains(day));
            if (agendaCache.size >= 64) agendaCache.delete(agendaCache.keys().next().value!);
            agendaCache.set(date, result);
        }
        return result;
    };
    const weeks = Array.from({length: count / 7}, (_, index) => buildWeek(entries, start + index * 7));
    const days = weeks.flatMap(week => week.dates.map(date => ({date, items: agenda(date), itemCount: agenda(date).length})));
    return {entries, weeks, days, agenda, diagnostics};
}

/**
 * Measurement accounts for the overflow row's own height; core reads no geometry. §6.3 counts `+N` per date: a date
 * whose items all fit keeps every lane, and only a date that would hide items gives one row to its `+N` (QA-18). A
 * bar crossing both kinds of dates is drawn on the dates that show its lane; the cut sides continue.
 */
export function fitWeekLanes<I, S>(week: WeekLayout<I, S>, availableLanes: Readonly<{withoutOverflow: number; withOverflow: number}>) {
    const normalize = (value: number) => Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
    const capacity = normalize(availableLanes.withoutOverflow), reduced = Math.min(capacity, normalize(availableLanes.withOverflow));
    const onColumn = (column: number) => week.segments.filter(segment => segment.startColumn <= column && column < segment.endColumn);
    const limits = week.dates.map((_, column) => onColumn(column).some(segment => segment.lane >= capacity) ? reduced : capacity);
    const visibleSegments: WeekSegment<I, S>[] = [];
    for (const segment of week.segments) {
        let from = -1;
        for (let column = segment.startColumn; column <= segment.endColumn; column++) {
            const shown = column < segment.endColumn && segment.lane < limits[column];
            if (shown && from < 0) from = column;
            if (shown || from < 0) continue;
            visibleSegments.push(from === segment.startColumn && column === segment.endColumn ? segment : {...segment, startColumn: from, endColumn: column,
                segmentRange: {start: week.dates[from], end: column === segment.endColumn ? segment.segmentRange.end : week.dates[column]},
                continuesBefore: segment.continuesBefore || from > segment.startColumn, continuesAfter: segment.continuesAfter || column < segment.endColumn});
            from = -1;
        }
    }
    const days = week.dates.map((date, column) => {
        const total = onColumn(column).length, visible = onColumn(column).filter(segment => segment.lane < limits[column]).length;
        return {date, itemCount: total, visibleCount: visible, hiddenCount: total - visible};
    });
    return {visibleSegments, days};
}
