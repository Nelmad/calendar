import type {CalendarItem, ISODate, RFC3339DateTime} from '@nelmad/calendar';

/** The 0.1 event shape. Keep it in the application only while migrating. */
export type LegacyEvent = {
    id: string; start: string; end?: string; title: string;
    variant: 'red' | 'blue' | 'green' | 'grey';
    isOverdue: boolean; isCritical: boolean; isAllDay: boolean;
    taskId: string | null; isClickable: boolean; hasHoverActions: boolean;
};
/** Domain fields move to `data`; the original 0.1 timestamps stay there as well. */
export type LegacyEventData = Omit<LegacyEvent, 'id' | 'title' | 'isAllDay'>;

const strict = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;
const timestamp = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d+))?)?(Z|([+-])(\d{2}):(\d{2}))$/;

/** A real calendar date 0001-01-01…9999-12-31 (no 30 February), as 0.2 requires. */
function isoDate(value: string, field: string): ISODate {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    const [year, month, day] = match ? match.slice(1).map(Number) : [];
    const days = month === 2 ? (year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28) : [4, 6, 9, 11].includes(month) ? 30 : 31;
    if (!match || year < 1 || month < 1 || month > 12 || day < 1 || day > days) throw new RangeError(`${field}: ${value} is not a calendar date`);
    return value;
}
/**
 * An instant with an explicit offset. Offset-less values are resolved by the application first; `-00:00` (offset
 * unknown), hour 24, leap seconds and impossible dates throw like in 0.2 instead of being moved by `Date.parse`.
 */
function instant(value: string, field: string): RFC3339DateTime {
    const match = timestamp.exec(value);
    if (!match || match[6] === '-00:00') throw new RangeError(`${field}: ${value} is not a timestamp with a UTC offset`);
    const [hour, minute, second, offsetHour, offsetMinute] = [match[2], match[3], match[4] ?? '0', match[8] ?? '0', match[9] ?? '0'].map(Number);
    if (hour > 23 || minute > 59 || second > 59 || offsetHour > 23 || offsetMinute > 59) throw new RangeError(`${field}: ${value} has an invalid time or offset`);
    const date = isoDate(match[1], field), time = new Date(0);
    time.setUTCFullYear(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8)));
    time.setUTCHours(hour, minute - (match[7] === '-' ? -1 : 1) * (offsetHour * 60 + offsetMinute), second, Number((match[5] ?? '').slice(0, 3).padEnd(3, '0')));
    if (time.getUTCFullYear() < 1 || time.getUTCFullYear() > 9999) throw new RangeError(`${field}: ${value} is outside 0001…9999`);
    // Same instant; only a non-strict spelling (no seconds, more digits) is rewritten in UTC.
    return strict.test(value) ? value : time.toISOString();
}
/** The calendar date of a 0.1 value in the fixed display offset that 0.1 used, e.g. '+03:00'. */
function dateAt(value: string, field: string, displayOffset: string): ISODate {
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return isoDate(value, field);
    const offset = /^([+-])(\d{2}):(\d{2})$/.exec(displayOffset);
    if (!offset) throw new RangeError(`displayOffset: ${displayOffset} is not ±HH:MM`);
    const minutes = (offset[1] === '-' ? -1 : 1) * (Number(offset[2]) * 60 + Number(offset[3]));
    // A date outside 0001…9999 in that offset (year 0 or +010000) throws like any other invalid date.
    return isoDate(new Date(Date.parse(instant(value, field)) + minutes * 60_000).toISOString().slice(0, 10), field);
}
/** Adds one calendar day to a date-only value, not 24 hours to an instant. 9999-12-31 has no exclusive end in 0.2. */
function nextDay(date: ISODate, field: string): ISODate {
    if (date === '9999-12-31') throw new RangeError(`${field}: ${date} has no exclusive end date in 0001…9999`);
    const value = new Date(`${date}T00:00:00Z`);
    value.setUTCDate(value.getUTCDate() + 1);
    return value.toISOString().slice(0, 10);
}

/**
 * Converts one 0.1 event. All-day: the inclusive 0.1 dates in `displayOffset` become an
 * exclusive date range; a missing end means one day. Timed: instants are kept, a missing
 * end stays missing (a moment). The Calendar time zone is chosen separately.
 */
export function toCalendarItem(event: LegacyEvent, displayOffset: string): CalendarItem<LegacyEventData> {
    const {id, title, isAllDay, ...data} = event;
    if (isAllDay) {
        const start = dateAt(event.start, 'start', displayOffset);
        const last = event.end === undefined ? start : dateAt(event.end, 'end', displayOffset);
        if (last < start) throw new RangeError(`end: ${event.end} is before start`);
        return {id, title, data, interval: {kind: 'allDay', start, end: nextDay(last, event.end === undefined ? 'start' : 'end')}};
    }
    const start = instant(event.start, 'start');
    if (event.end === undefined) return {id, title, data, interval: {kind: 'timed', start}};
    const end = instant(event.end, 'end');
    if (Date.parse(end) < Date.parse(start)) throw new RangeError(`end: ${event.end} is before start`);
    return {id, title, data, interval: {kind: 'timed', start, end}};
}
