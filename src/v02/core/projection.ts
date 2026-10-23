import {MAX_INSTANT, MIN_INSTANT, UTC_DAY_MS, parseISODate, type CanonicalInterval, type createDateAdapter} from './date.js';

export {UTC_DAY_MS} from './date.js';
export const MIN_DAY = MIN_INSTANT / UTC_DAY_MS;
export const MAX_DAY = Math.floor(MAX_INSTANT / UTC_DAY_MS);
// Qualified against pinned tzdb by audit-transitions.mjs. T27 must qualify each
// supported runtime's data. There must be at most one offset change per window.
export const TRANSITION_SCAN_MS = 3 * UTC_DAY_MS;
export type NumberRange = Readonly<{start: number; end: number}>;
export type OffsetSpan = NumberRange & Readonly<{offset: number}>;
export type DateMembership = Readonly<{ranges: readonly NumberRange[]; dayCount: number}>;
/**
 * The local dates of an interval for layout: `first`/`end` are its first date and the day after its last (empty when
 * `first >= end`), `contains` answers one date exactly. Their cost does not grow with the interval's duration.
 */
export type IntervalDates = Readonly<{first: number; end: number; contains: (day: number) => boolean}>;
/** `contains` is not enumerable: equal dates compare equal as data, whichever projector produced them. */
const intervalDatesOf = (first: number, end: number, contains: (day: number) => boolean): IntervalDates =>
    Object.defineProperty({first, end}, 'contains', {value: contains}) as IntervalDates;
/** A timed interval up to this duration is projected whole; a longer one only at its ends and at the dates asked. */
export const BOUNDED_PROJECTION_MS = 32 * UTC_DAY_MS;
type Dates = ReturnType<typeof createDateAdapter>;

export function dateToDay(value: string): number {
    const date = parseISODate(value);
    return date.calendar.toJulianDay(date) - 2_440_588;
}
export function dayToDate(value: number): string {
    if (!Number.isInteger(value) || value < MIN_DAY || value > MAX_DAY) throw new RangeError('Day is outside the ISO domain');
    return new Date(value * UTC_DAY_MS).toISOString().slice(0, 10);
}
function mergeRanges(input: readonly NumberRange[]): NumberRange[] {
    const output: {start: number; end: number}[] = [];
    for (const range of [...input].sort((a, b) => a.start - b.start || a.end - b.end)) {
        if (range.start >= range.end) continue;
        const last = output[output.length - 1];
        if (last && range.start <= last.end) last.end = Math.max(last.end, range.end);
        else output.push({...range});
    }
    return output;
}
export function containsDay(membership: DateMembership, day: number): boolean {
    return membership.ranges.some(range => range.start <= day && day < range.end);
}

/** Exact millisecond boundaries, assuming the qualified minimum transition spacing. */
export function scanOffsetSpans(start: number, end: number, offsetAt: (instant: number) => number): OffsetSpan[] {
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < MIN_INSTANT || end > MAX_INSTANT + 1 || start >= end) {
        throw new RangeError('Invalid instant scan range');
    }
    const read = (instant: number) => {
        const offset = offsetAt(instant);
        if (!Number.isInteger(offset) || Math.abs(offset) >= UTC_DAY_MS) throw new RangeError('Timezone offset exceeds the qualified domain');
        return offset;
    };
    const result: OffsetSpan[] = [];
    let spanStart = start, checked = start, offset = read(start);
    while (checked < end - 1) {
        const next = Math.min(checked + TRANSITION_SCAN_MS, end - 1);
        const nextOffset = read(next);
        if (nextOffset === offset) { checked = next; continue; }
        let low = checked + 1, high = next;
        while (low < high) {
            const middle = low + Math.floor((high - low) / 2);
            if (read(middle) === offset) low = middle + 1;
            else high = middle;
        }
        result.push({start: spanStart, end: low, offset});
        spanStart = checked = low;
        offset = nextOffset;
    }
    result.push({start: spanStart, end, offset});
    return result;
}

/** Union the projected dates of constant-offset spans, retaining holes and folds. */
export function membershipFromSpans(spans: readonly OffsetSpan[]): DateMembership {
    const ranges = mergeRanges(spans.map(span => ({
        start: Math.max(MIN_DAY, Math.floor((span.start + span.offset) / UTC_DAY_MS)),
        end: Math.min(MAX_DAY + 1, Math.floor((span.end - 1 + span.offset) / UTC_DAY_MS) + 1),
    })));
    return {ranges, dayCount: ranges.reduce((count, range) => count + range.end - range.start, 0)};
}

export function createIntervalProjector(dates: Dates) {
    // Bounded instance-owned cache; interval source/author timezone cannot change projection.
    const cache = new Map<string, DateMembership>();
    const offsetSpans = (start: number, end: number, timeZone: string): OffsetSpan[] => {
        dates.validateTimeZone(timeZone);
        const offsetAt = (instant: number) => dates.projectInstant(instant, timeZone).offsetMilliseconds;
        if (timeZone === 'UTC' || timeZone.startsWith('Etc/GMT')) return [{start, end, offset: offsetAt(start)}];
        return scanOffsetSpans(start, end, offsetAt);
    };
    const project = (interval: CanonicalInterval, timeZone: string): DateMembership => {
        dates.validateTimeZone(timeZone);
        if (interval.kind === 'allDay') {
            const start = dateToDay(interval.start), end = dateToDay(interval.end);
            return {ranges: [{start, end}], dayCount: end - start};
        }
        // Moments retain their original missing/equal end on the canonical record.
        const end = interval.end === undefined || interval.end === interval.start ? interval.start + 1 : interval.end;
        const key = `${timeZone}:${interval.start}:${end}`;
        let result = cache.get(key);
        if (!result) {
            result = membershipFromSpans(offsetSpans(interval.start, end, timeZone));
            if (cache.size >= 256) cache.delete(cache.keys().next().value!);
            cache.set(key, result);
        }
        return result;
    };
    const instantsOfDay = (day: number, timeZone: string): readonly NumberRange[] => {
        const midnight = day * UTC_DAY_MS;
        // All qualified offsets have magnitude below 24h. Clip only UTC bounds.
        const start = Math.max(MIN_INSTANT, midnight - UTC_DAY_MS);
        const end = Math.min(MAX_INSTANT + 1, midnight + 2 * UTC_DAY_MS);
        const result = offsetSpans(start, end, timeZone).map(span => ({
            start: Math.max(span.start, midnight - span.offset),
            end: Math.min(span.end, midnight + UTC_DAY_MS - span.offset),
        }));
        return mergeRanges(result);
    };
    const dayInstants = (date: string, timeZone: string): readonly NumberRange[] => instantsOfDay(dateToDay(date), timeZone);
    // Bounded per instance like the membership cache: the grid and agenda dates of the zones in use.
    const days = new Map<string, readonly NumberRange[]>();
    const cachedDay = (day: number, timeZone: string) => {
        const key = `${timeZone}:${day}`;
        let result = days.get(key);
        if (!result) {
            result = instantsOfDay(day, timeZone);
            if (days.size >= 512) days.delete(days.keys().next().value!);
            days.set(key, result);
        }
        return result;
    };
    /**
     * Review 2026-10-09-2: a long timed interval is never scanned over its whole duration (an item of decades would block
     * render and SSR for seconds). Its first local date lies in the first 48 h of instants and its last in the final 48 h,
     * because every offset is below 24 h in magnitude; a date in between is covered exactly when one of that date's own
     * instants is inside the interval. Holes (skipped dates, Apia 2011) and folds stay exact.
     */
    const intervalDates = (interval: CanonicalInterval, timeZone: string): IntervalDates => {
        dates.validateTimeZone(timeZone);
        const last = interval.kind === 'allDay' ? 0 : interval.end === undefined || interval.end === interval.start ? interval.start + 1 : interval.end;
        if (interval.kind === 'allDay' || last - interval.start <= BOUNDED_PROJECTION_MS) {
            const membership = project(interval, timeZone), ranges = membership.ranges;
            return ranges.length ? intervalDatesOf(ranges[0].start, ranges[ranges.length - 1].end, day => containsDay(membership, day)) : intervalDatesOf(0, 0, () => false);
        }
        const start = interval.start;
        const head = membershipFromSpans(offsetSpans(start, start + 2 * UTC_DAY_MS, timeZone)).ranges;
        const tail = membershipFromSpans(offsetSpans(last - 2 * UTC_DAY_MS, last, timeZone)).ranges;
        const first = head[0]?.start ?? tail[0]?.start ?? 0, after = tail[tail.length - 1]?.end ?? head[head.length - 1]?.end ?? 0;
        return intervalDatesOf(first, after, day => day >= first && day < after && cachedDay(day, timeZone).some(range => range.start < last && start < range.end));
    };
    return {project, dayInstants, dates: intervalDates};
}
