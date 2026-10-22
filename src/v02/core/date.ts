import {parseDate, type CalendarDate} from '@internationalized/date';
import type {CalendarDateRange} from '../reference.js';
import {acceptedTimeZoneIdentifiers} from './timeZones.generated.js';

// Private 0.2 adapter. No host timezone, locale or clock defaults are consulted.
export const MIN_INSTANT = -62_135_596_800_000;
export const MAX_INSTANT = 253_402_300_799_999;
// UTC coordinates and the qualified absolute offset bound, not local day length.
export const UTC_DAY_MS = 86_400_000;
const DATE_PATTERN = /^(?!0000)\d{4}-\d{2}-\d{2}$/;
const INSTANT_PATTERN = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?(Z|([+-])(\d{2}):(\d{2}))$/;

function fail(reason: string): never {
    throw new RangeError(reason);
}
function object(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return fail('Expected an object');
    return value as Record<string, unknown>;
}
export function parseISODate(value: unknown): CalendarDate {
    if (typeof value !== 'string' || value.length !== 10 || !DATE_PATTERN.test(value)) return fail('Expected YYYY-MM-DD in 0001…9999');
    // parseDate rejects nonexistent Gregorian dates instead of constraining them; its own range text is library internals
    // (review 2026-10-09-3), so the reason names the package rule.
    try { return parseDate(value); } catch { return fail(`Expected an existing date; ${value} does not exist`); }
}
export function parseAnchorDate(value: unknown): CalendarDate {
    const date = parseISODate(value);
    if ((date.year === 1 && date.month === 1) || (date.year === 9999 && date.month === 12)) {
        return fail('anchorDate must be between February 0001 and November 9999');
    }
    return date;
}
export function parseDateRange(value: unknown): CalendarDateRange {
    const range = object(value);
    const start = parseISODate(range.start), end = parseISODate(range.end);
    if (end.compare(start) <= 0) return fail('A date range requires end > start');
    return {start: start.toString(), end: end.toString()};
}
export function addCalendarDays(value: string, days: number): string {
    if (!Number.isSafeInteger(days)) return fail('Calendar day shift must be a safe integer');
    const original = parseISODate(value);
    const julian = original.calendar.toJulianDay(original);
    // Bound before library arithmetic, including very large otherwise safe integers.
    if (julian + days < 1_721_426 || julian + days > 5_373_484) return fail('Calendar day shift exceeds the ISO date domain');
    const shifted = original.add({days});
    // CalendarDate constrains out-of-domain arithmetic. Detect that explicitly.
    if (shifted.era !== 'AD' || shifted.calendar.toJulianDay(shifted) - original.calendar.toJulianDay(original) !== days) {
        return fail('Calendar day shift exceeds the ISO date domain');
    }
    return shifted.toString();
}
function utcEpoch(year: number, month: number, day: number, hour: number, minute: number, second: number, millisecond: number): number {
    const date = new Date(0);
    // Date.UTC's 0…99 year remapping must not affect the proleptic Gregorian domain.
    date.setUTCFullYear(year, month - 1, day);
    date.setUTCHours(hour, minute, second, millisecond);
    return date.getTime();
}
function assertInstant(value: number): void {
    if (!Number.isSafeInteger(value) || value < MIN_INSTANT || value > MAX_INSTANT) {
        fail('Instant exceeds 0001-01-01T00:00:00.000Z…9999-12-31T23:59:59.999Z');
    }
}
/**
 * The local date of a timestamp. RFC 3339 allows the year 0000, and §4.1 bounds a timed boundary by its instant after the
 * offset, not by the date-only year range: 0000-12-31T23:30:00-01:00 is 0001-01-01T00:30:00Z (review 2026-10-09-2).
 */
function timestampDate(value: string): {year: number; month: number; day: number} {
    if (!value.startsWith('0000-')) return parseISODate(value);
    const month = Number(value.slice(5, 7)), day = Number(value.slice(8, 10));
    // The proleptic Gregorian year 0 is a leap year.
    const length = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
    if (!length || day < 1 || day > length) return fail('Invalid RFC3339 date');
    return {year: 0, month, day};
}
export function parseRFC3339(value: unknown): number {
    if (typeof value !== 'string') return fail('Timestamp must be a string');
    const match = INSTANT_PATTERN.exec(value);
    if (!match || match[0] !== value || match[6] === '-00:00') return fail('Invalid RFC3339 grammar');
    const date = timestampDate(match[1]);
    const [hour, minute, second] = match.slice(2, 5).map(Number);
    const offsetHour = Number(match[8] ?? 0), offsetMinute = Number(match[9] ?? 0);
    if (hour > 23 || minute > 59 || second > 59 || offsetHour > 23 || offsetMinute > 59) {
        return fail('Invalid timestamp time or offset');
    }
    const millisecond = Number((match[5] ?? '').padEnd(3, '0'));
    const offset = (match[7] === '-' ? -1 : 1) * (offsetHour * 60 + offsetMinute) * 60_000;
    const instant = utcEpoch(date.year, date.month, date.day, hour, minute, second, millisecond) - offset;
    assertInstant(instant);
    return instant;
}

export type CanonicalInterval =
    | Readonly<{kind: 'allDay'; start: string; end: string}>
    | Readonly<{kind: 'timed'; start: number; end: number | undefined; timeZone: string | undefined}>;

export function intervalsEqual(a: CanonicalInterval, b: CanonicalInterval): boolean {
    if (a.kind !== b.kind || a.start !== b.start || a.end !== b.end) return false;
    return a.kind === 'allDay' || (b.kind === 'timed' && a.timeZone === b.timeZone);
}

export type WallTime = Readonly<{
    date: string;
    hour: number;
    minute: number;
    second: number;
    millisecond: number;
}>;
export type GregorianProjection = Readonly<{
    // Astronomical year: 0 means 1 BC. Never clamp an out-of-domain local tail.
    year: number; month: number; day: number;
    hour: number; minute: number; second: number; millisecond: number;
    offsetMilliseconds: number;
    date: string | null;
}>;
const pad = (value: number, width = 2) => String(value).padStart(width, '0');

const packageTimeZones: ReadonlySet<string> = new Set(acceptedTimeZoneIdentifiers);

/** Package data by default; explicit sets are only for private algorithm fixtures/probes. */
export function createDateAdapter(acceptedTimeZones: ReadonlySet<string> = packageTimeZones) {
    const zones = new Set(acceptedTimeZones);
    const formatters = new Map<string, Intl.DateTimeFormat>();
    const validateTimeZone = (value: unknown): string => {
        if (typeof value !== 'string' || !zones.has(value)) return fail('Timezone is outside the package accepted-set');
        return value;
    };
    const formatter = (zone: string): Intl.DateTimeFormat => {
        validateTimeZone(zone);
        let result = formatters.get(zone);
        if (!result) {
            result = new Intl.DateTimeFormat('en-US', {
                timeZone: zone, calendar: 'gregory', numberingSystem: 'latn', hourCycle: 'h23',
                era: 'short', year: 'numeric', month: '2-digit', day: '2-digit',
                hour: '2-digit', minute: '2-digit', second: '2-digit',
            });
            formatters.set(zone, result);
        }
        return result;
    };
    const projectInstant = (instant: number, timeZone: string): GregorianProjection => {
        assertInstant(instant);
        const parts = Object.fromEntries(formatter(timeZone).formatToParts(instant).map(part => [part.type, part.value]));
        const year = parts.era === 'BC' ? 1 - Number(parts.year) : Number(parts.year);
        const month = Number(parts.month), day = Number(parts.day);
        const hour = Number(parts.hour), minute = Number(parts.minute), second = Number(parts.second);
        const millisecond = new Date(instant).getUTCMilliseconds();
        return {
            year, month, day, hour, minute, second, millisecond,
            offsetMilliseconds: utcEpoch(year, month, day, hour, minute, second, millisecond) - instant,
            date: year < 1 || year > 9999 ? null : `${pad(year, 4)}-${pad(month)}-${pad(day)}`,
        };
    };
    const serializeInstant = (instant: number, timeZone: string): string => {
        const fields = projectInstant(instant, timeZone);
        // An RFC3339 numeric offset cannot encode historical seconds or year 10000/0.
        if (fields.date === null || fields.offsetMilliseconds % 60_000 !== 0) return new Date(instant).toISOString();
        const minutes = Math.abs(fields.offsetMilliseconds) / 60_000;
        const offset = `${fields.offsetMilliseconds < 0 ? '-' : '+'}${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
        const fraction = fields.millisecond ? `.${pad(fields.millisecond, 3)}` : '';
        return `${fields.date}T${pad(fields.hour)}:${pad(fields.minute)}:${pad(fields.second)}${fraction}${offset}`;
    };
    const resolveWallTime = (input: WallTime, timeZone: string): number => {
        validateTimeZone(timeZone);
        const date = parseISODate(input.date);
        for (const [value, maximum] of [[input.hour, 23], [input.minute, 59], [input.second, 59], [input.millisecond, 999]]) {
            if (!Number.isInteger(value) || value < 0 || value > maximum) return fail('Invalid wall-clock time');
        }
        const wall = utcEpoch(date.year, date.month, date.day, input.hour, input.minute, input.second, input.millisecond);
        // An offset has magnitude <24h, so every possible instant lies in this
        // clipped 48h UTC window. T07's qualified >72h transition spacing means
        // its endpoints expose every offset in the window, including a fold.
        // Read explicit Intl fields: the library's host-zone fast path rounds
        // historical offsets to minutes (e.g. Monrovia in 1971).
        const probes = [Math.max(MIN_INSTANT, wall - UTC_DAY_MS), Math.min(MAX_INSTANT, wall + UTC_DAY_MS)];
        const offsets = new Set(probes.map(instant => projectInstant(instant, timeZone).offsetMilliseconds));
        const candidates: number[] = [];
        let outsideDomain = false;
        for (const offset of offsets) {
            if (!Number.isInteger(offset) || Math.abs(offset) >= UTC_DAY_MS) return fail('Timezone offset exceeds the qualified domain');
            const instant = wall - offset;
            if (instant < MIN_INSTANT || instant > MAX_INSTANT) { outsideDomain = true; continue; }
            const projected = projectInstant(instant, timeZone);
            if (projected.date === input.date && projected.hour === input.hour && projected.minute === input.minute
                && projected.second === input.second && projected.millisecond === input.millisecond) candidates.push(instant);
        }
        if (!candidates.length) {
            if (outsideDomain) return fail('Local wall time exceeds the supported instant domain');
            return fail('Local wall time is in a timezone gap');
        }
        return Math.min(...candidates);
    };
    const parseInterval = (input: unknown): CanonicalInterval => {
        const interval = object(input);
        if (interval.kind === 'allDay') return {kind: 'allDay', ...parseDateRange(interval)};
        if (interval.kind !== 'timed') return fail('Unknown interval kind');
        const start = parseRFC3339(interval.start);
        const end = interval.end === undefined ? undefined : parseRFC3339(interval.end);
        const timeZone = interval.timeZone === undefined ? undefined : validateTimeZone(interval.timeZone);
        if (end !== undefined && end < start) return fail('Timed end must be >= start');
        return {kind: 'timed', start, end, timeZone};
    };
    return {validateTimeZone, parseInterval, projectInstant, serializeInstant, resolveWallTime};
}
