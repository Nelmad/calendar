// @vitest-environment node
import {describe, expect, it} from 'vitest';
import {
    addCalendarDays, createDateAdapter, intervalsEqual, MAX_INSTANT, MIN_INSTANT,
    parseAnchorDate, parseDateRange, parseISODate, parseRFC3339,
} from '../date.js';

// Explicit fixture set, not the future package accepted-set or a host-derived list.
const zones = new Set(['UTC', 'Europe/Moscow', 'Europe/Berlin', 'America/New_York', 'Asia/Tokyo', 'Pacific/Apia', 'Europe/Paris', 'Africa/Monrovia', 'America/Goose_Bay', 'Australia/Lord_Howe']);
const adapter = createDateAdapter(zones);

describe('strict Gregorian date domain', () => {
    it.each(['0001-01-01', '9999-12-31', '2000-02-29', '2024-02-29'])('accepts %s', value => {
        expect(parseISODate(value).toString()).toBe(value);
    });
    it.each([null, undefined, 20260903, '', ' 2026-09-03', '2026-09-03 ', '2026-09-03\n', '2026-9-03', '0000-01-01', '10000-01-01', '1900-02-29', '2026-02-29', '2026-04-31', '2026-00-01', '2026-13-01', '2026-01-00'])('rejects %j without correction', value => {
        expect(() => parseISODate(value)).toThrow(RangeError);
    });
    it('limits only month anchors and exclusive ranges, not all item dates', () => {
        expect(() => parseAnchorDate('0001-01-31')).toThrow(RangeError);
        expect(() => parseAnchorDate('9999-12-01')).toThrow(RangeError);
        expect(parseAnchorDate('0001-02-01').toString()).toBe('0001-02-01');
        expect(parseAnchorDate('9999-11-30').toString()).toBe('9999-11-30');
        expect(parseDateRange({start: '9999-12-30', end: '9999-12-31'}).end).toBe('9999-12-31');
        expect(() => parseDateRange({start: '2026-09-03', end: '2026-09-03'})).toThrow(RangeError);
        expect(() => parseDateRange({start: '9999-12-31', end: '10000-01-01'})).toThrow(RangeError);
    });
    it('does not silently constrain date arithmetic or skip Apia civil dates', () => {
        expect(addCalendarDays('2011-12-29', 1)).toBe('2011-12-30');
        expect(addCalendarDays('2024-02-28', 2)).toBe('2024-03-01');
        expect(() => addCalendarDays('9999-12-31', 1)).toThrow(RangeError);
        expect(() => addCalendarDays('0001-01-01', -1)).toThrow(RangeError);
        expect(() => addCalendarDays('2026-09-03', 0.5)).toThrow(RangeError);
        expect(() => addCalendarDays('2026-09-03', Number.MAX_SAFE_INTEGER)).toThrow(RangeError);
        expect(addCalendarDays('0001-01-01', 3_652_058)).toBe('9999-12-31');
    });
});

describe('strict timestamps and canonical interval identity', () => {
    it('accepts both instant endpoints and preserves signed sub-hour offsets', () => {
        expect(parseRFC3339('0001-01-01T00:00:00Z')).toBe(MIN_INSTANT);
        expect(parseRFC3339('9999-12-31T23:59:59.999Z')).toBe(MAX_INSTANT);
        expect(parseRFC3339('2026-09-03T00:00:00-00:30')).toBe(Date.UTC(2026, 8, 3, 0, 30));
        expect(parseRFC3339('2026-09-03T00:00:00+00:30')).toBe(Date.UTC(2026, 8, 2, 23, 30));
        expect(parseRFC3339('2026-09-03T00:00:00.1Z')).toBe(parseRFC3339('2026-09-03T00:00:00.100+00:00'));
    });
    it.each([
        '', null, '2026-09-03', '2026-09-03T00:00Z', '2026-09-03T00:00:00',
        '2026-09-03t00:00:00Z', '2026-09-03T00:00:00z', '2026-09-03T24:00:00Z',
        '2026-09-03T00:60:00Z', '2026-09-03T00:00:60Z', '2026-02-29T00:00:00Z',
        '2026-09-03T00:00:00.Z', '2026-09-03T00:00:00.1234Z', '2026-09-03T00:00:00-00:00',
        '2026-09-03T00:00:00+24:00', '2026-09-03T00:00:00+00:60', '2026-09-03T00:00:00Z[UTC]', '2026-09-03T00:00:00Z\n', '2026-09-03T00:00:00Z\r\n',
        '0001-01-01T00:00:00+00:01', '9999-12-31T23:59:59.999-00:01',
        '0000-12-31T23:30:00Z', '0000-12-31T22:59:59.999-01:00', '0000-02-30T23:00:00-23:59', '0000-13-01T00:00:00Z', '0000-00-01T00:00:00Z',
    ])('rejects %j before date math', value => expect(() => parseRFC3339(value)).toThrow(RangeError));
    // Review 2026-10-09-2: the 0001…9999 year range is the date-only rule; a timed boundary is RFC 3339 (year 0000 included)
    // bounded by its instant after the offset, symmetric with the upper bound (§4.1).
    it.each([['0000-12-31T23:30:00-01:00', '0001-01-01T00:30:00.000Z'], ['0000-12-31T23:00:00-01:00', '0001-01-01T00:00:00.000Z'],
        ['0000-12-31T00:01:00.001-23:59', '0001-01-01T00:00:00.001Z']])('accepts %s, the in-domain instant %s', (value, instant) => {
        expect(new Date(parseRFC3339(value)).toISOString()).toBe(instant);
        expect(() => parseRFC3339(value.replace(/^0000-12-31/, '0000-02-29'))).toThrow(/Instant exceeds/);
    });
    it('compares instants while retaining optional end and author zone distinctions', () => {
        const parse = adapter.parseInterval;
        const start = '2026-09-03T00:00:00Z';
        const moment = parse({kind: 'timed', start});
        expect(intervalsEqual(moment, parse({kind: 'timed', start: '2026-09-03T03:00:00.000+03:00', end: undefined, timeZone: undefined}))).toBe(true);
        expect(intervalsEqual(moment, parse({kind: 'timed', start, end: start}))).toBe(false);
        expect(intervalsEqual(moment, parse({kind: 'timed', start, timeZone: 'UTC'}))).toBe(false);
        expect(() => parse({kind: 'timed', start, end: null})).toThrow(RangeError);
        expect(() => parse({kind: 'timed', start, end: '2026-09-03T01:00:00+03:00'})).toThrow(RangeError);
        expect(parse({kind: 'timed', start, end: '2026-09-03T03:00:00+03:00'})).toMatchObject({start: moment.start, end: moment.start});
        expect(intervalsEqual(parse({kind: 'allDay', start: '2011-12-30', end: '2011-12-31'}), parse({kind: 'allDay', start: '2011-12-30', end: '2011-12-31'}))).toBe(true);
    });
    it('takes membership from a snapshot of supplied package data, not Intl aliases', () => {
        const mutable = new Set(['UTC']);
        const local = createDateAdapter(mutable);
        mutable.add('Europe/Berlin');
        for (const value of ['Etc/UTC', 'GMT', 'US/Eastern', 'europe/berlin', 'UTC ', '+03:00', 'Europe/Berlin']) {
            expect(() => local.validateTimeZone(value)).toThrow(RangeError);
        }
        expect(local.validateTimeZone('UTC')).toBe('UTC');
    });
});

describe('explicit timezone projection, wall time and serialization', () => {
    const wall = (date: string, hour: number, minute = 30) => ({date, hour, minute, second: 0, millisecond: 0});
    it.each([0, 12])('preserves Monrovia seconds at hour %i even when it is the host timezone', hour => {
        const input = {...wall('1971-01-01', hour, 0), millisecond: 123};
        const instant = adapter.resolveWallTime(input, 'Africa/Monrovia');
        expect(instant).toBe(parseRFC3339(`1971-01-01T${String(hour).padStart(2, '0')}:44:30.123Z`));
        expect(adapter.projectInstant(instant, 'Africa/Monrovia')).toMatchObject(input);
    });
    it('rejects the Monrovia gap up to its exact second boundary', () => {
        for (const input of [wall('1972-01-07', 0, 0), {...wall('1972-01-07', 0, 44), second: 29, millisecond: 999}]) {
            expect(() => adapter.resolveWallTime(input, 'Africa/Monrovia')).toThrow(/gap/);
        }
        const input = {...wall('1972-01-07', 0, 44), second: 30};
        expect(adapter.resolveWallTime(input, 'Africa/Monrovia')).toBe(parseRFC3339('1972-01-07T00:44:30Z'));
    });
    it.each([
        ['1987-10-25', 0, 0, 'America/Goose_Bay', '1987-10-25T03:00:00Z'],
        ['2026-04-05', 1, 45, 'Australia/Lord_Howe', '2026-04-04T14:45:00Z'],
    ] as const)('chooses the earlier instant in the %s %s:%s fold of %s', (date, hour, minute, zone, expected) => {
        const input = {...wall(date, hour, minute), millisecond: 123};
        const instant = adapter.resolveWallTime(input, zone);
        expect(instant).toBe(parseRFC3339(expected) + 123);
        expect(adapter.projectInstant(instant, zone)).toMatchObject(input);
    });
    it('resolves the full UTC domain and clips candidate searches without clamping wall times', () => {
        expect(adapter.resolveWallTime(wall('0001-01-01', 0, 0), 'UTC')).toBe(MIN_INSTANT);
        expect(adapter.resolveWallTime({...wall('9999-12-31', 23, 59), second: 59, millisecond: 999}, 'UTC')).toBe(MAX_INSTANT);
        expect(() => adapter.resolveWallTime(wall('0001-01-01', 0, 0), 'Asia/Tokyo')).toThrow(RangeError);
        expect(() => adapter.resolveWallTime(wall('9999-12-31', 23, 59), 'America/New_York')).toThrow(RangeError);
        for (const [instant, zone] of [[MIN_INSTANT, 'Asia/Tokyo'], [MAX_INSTANT, 'America/New_York']] as const) {
            const projected = adapter.projectInstant(instant, zone);
            expect(adapter.resolveWallTime({...projected, date: projected.date!}, zone)).toBe(instant);
        }
    });
    it('rejects gaps, chooses the earlier fold and preserves elapsed duration across DST', () => {
        expect(() => adapter.resolveWallTime(wall('2026-03-29', 2), 'Europe/Berlin')).toThrow(/gap/);
        expect(() => adapter.resolveWallTime(wall('2011-12-30', 10), 'Pacific/Apia')).toThrow(/gap/);
        expect(adapter.resolveWallTime(wall('2026-10-25', 2), 'Europe/Berlin')).toBe(parseRFC3339('2026-10-25T00:30:00Z'));
        const start = adapter.resolveWallTime(wall('2026-03-29', 1), 'Europe/Berlin');
        expect(adapter.serializeInstant(start + 7_200_000, 'Europe/Berlin')).toBe('2026-03-29T04:30:00+02:00');
        expect(() => adapter.resolveWallTime(wall('2026-09-03', 24), 'UTC')).toThrow(RangeError);
    });
    it('does not clamp local tails into unrelated supported dates', () => {
        expect(adapter.projectInstant(MAX_INSTANT, 'Asia/Tokyo')).toMatchObject({year: 10000, month: 1, day: 1, date: null});
        expect(adapter.projectInstant(MIN_INSTANT, 'America/New_York')).toMatchObject({year: 0, month: 12, day: 31, date: null});
        expect(adapter.projectInstant(MIN_INSTANT, 'UTC').date).toBe('0001-01-01');
        expect(adapter.serializeInstant(MAX_INSTANT, 'Asia/Tokyo')).toBe('9999-12-31T23:59:59.999Z');
        expect(adapter.serializeInstant(MIN_INSTANT, 'America/New_York')).toBe('0001-01-01T00:00:00.000Z');
    });
    it('uses Z for historical second offsets without rounding the instant', () => {
        const instant = parseRFC3339('1890-01-01T00:00:00.123Z');
        expect(adapter.projectInstant(instant, 'Europe/Paris').offsetMilliseconds).toBe(561_000);
        expect(adapter.serializeInstant(instant, 'Europe/Paris')).toBe('1890-01-01T00:00:00.123Z');
    });
    it('round-trips supported instants through every fixture zone', () => {
        for (const value of ['0001-01-01T00:00:00Z', '1890-01-01T00:00:00Z', '2011-12-30T10:00:00Z', '2026-10-25T01:30:00.012Z', '9999-12-31T23:59:59.999Z']) {
            const instant = parseRFC3339(value);
            for (const zone of zones) expect(parseRFC3339(adapter.serializeInstant(instant, zone)), `${value}/${zone}`).toBe(instant);
        }
    });
});

// Review 2026-10-09-3: a well-formed but nonexistent date names the package rule, not the date library's range text.
describe('nonexistent dates', () => {
    it.each(['2026-02-30', '2026-02-29', '2026-13-01', '2026-00-10', '2026-04-31'])('rejects %s with a package reason', value => {
        expect(() => parseISODate(value)).toThrow(new RangeError(`Expected an existing date; ${value} does not exist`));
    });
});
