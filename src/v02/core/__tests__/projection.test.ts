// @vitest-environment node
import {describe, expect, it} from 'vitest';
import {createDateAdapter, MAX_INSTANT, MIN_INSTANT, parseRFC3339} from '../date.js';
import {BOUNDED_PROJECTION_MS, containsDay, createIntervalProjector, dateToDay, dayToDate, MAX_DAY, membershipFromSpans, MIN_DAY, scanOffsetSpans, TRANSITION_SCAN_MS, UTC_DAY_MS} from '../projection.js';

const dates = createDateAdapter();
const projector = createIntervalProjector(dates);
const ms = parseRFC3339;
const timed = (start: string, end?: string, zone = 'UTC') => projector.project(dates.parseInterval({kind: 'timed', start, end}), zone);
const list = (membership: ReturnType<typeof timed>) => membership.ranges.flatMap(range => Array.from({length: range.end - range.start}, (_, index) => dayToDate(range.start + index)));
const ranges = (date: string, zone: string) => projector.dayInstants(date, zone).map(range => ({start: new Date(range.start).toISOString(), end: new Date(range.end).toISOString()}));

describe('UTC coordinates and offset spans', () => {
    it('round-trips Gregorian bounds and never depends on native year 0–99 remapping', () => {
        expect(dateToDay('0001-01-01')).toBe(MIN_DAY);
        expect(dateToDay('9999-12-31')).toBe(MAX_DAY);
        for (const date of ['0001-01-01', '0099-12-31', '1900-03-01', '2000-02-29', '9999-12-31']) expect(dayToDate(dateToDay(date))).toBe(date);
        expect(() => dayToDate(MAX_DAY + 1)).toThrow(RangeError);
    });
    it('finds an offset transition to the exact millisecond including the left boundary', () => {
        const change = 123_456_789;
        const spans = scanOffsetSpans(0, 400_000_000, instant => instant < change ? 0 : 3_600_000);
        expect(spans).toEqual([{start: 0, end: change, offset: 0}, {start: change, end: 400_000_000, offset: 3_600_000}]);
        expect(scanOffsetSpans(change, change + 1, () => 3_600_000)).toEqual([{start: change, end: change + 1, offset: 3_600_000}]);
    });
    it('finds successive transitions separated by more than the qualified scan window', () => {
        const a = TRANSITION_SCAN_MS - 1, b = a + TRANSITION_SCAN_MS + 1;
        expect(scanOffsetSpans(0, b + 2, time => time < a ? 0 : time < b ? 1000 : 0)).toEqual([
            {start: 0, end: a, offset: 0}, {start: a, end: b, offset: 1000}, {start: b, end: b + 2, offset: 0},
        ]);
    });
    it('rejects invalid scan bounds or unsupported offset magnitudes', () => {
        expect(() => scanOffsetSpans(1, 1, () => 0)).toThrow(RangeError);
        expect(() => scanOffsetSpans(MIN_INSTANT - 1, 0, () => 0)).toThrow(RangeError);
        expect(() => scanOffsetSpans(0, 2, () => UTC_DAY_MS)).toThrow(RangeError);
    });
});

describe('timed membership is the union of projected instants', () => {
    it('does not include an exclusive midnight, but does include one millisecond after it', () => {
        const start = '2026-09-03T12:00:00Z';
        expect(list(timed(start, '2026-09-03T21:00:00Z', 'Europe/Moscow'))).toEqual(['2026-09-03']);
        expect(list(timed(start, '2026-09-03T21:00:00.001Z', 'Europe/Moscow'))).toEqual(['2026-09-03', '2026-09-04']);
    });
    it.each([undefined, '2026-09-03T21:00:00Z'])('treats missing/equal end %j as a moment', end => {
        expect(list(timed('2026-09-03T21:00:00Z', end, 'Europe/Moscow'))).toEqual(['2026-09-04']);
    });
    it('uses display timezone rather than author timezone or timestamp spelling', () => {
        const interval = dates.parseInterval({kind: 'timed', start: '2026-09-03T21:00:00Z', timeZone: 'America/New_York'});
        expect(list(projector.project(interval, 'Asia/Tokyo'))).toEqual(['2026-09-04']);
        expect(list(projector.project(interval, 'America/New_York'))).toEqual(['2026-09-03']);
    });
    it('retains all-day dates in Apia while timed membership has a hole', () => {
        const allDay = dates.parseInterval({kind: 'allDay', start: '2011-12-29', end: '2012-01-01'});
        expect(list(projector.project(allDay, 'Pacific/Apia'))).toEqual(['2011-12-29', '2011-12-30', '2011-12-31']);
        const result = timed('2011-12-29T10:00:00Z', '2011-12-31T10:00:00Z', 'Pacific/Apia');
        expect(list(result)).toEqual(['2011-12-29', '2011-12-31']);
        expect(result.dayCount).toBe(2);
        expect(projector.dayInstants('2011-12-30', 'Pacific/Apia')).toEqual([]);
    });
    it('includes an intervening date even when both boundary projections are the previous date', () => {
        expect(list(timed('1987-10-25T02:59:00Z', '1987-10-25T03:02:00Z', 'America/Goose_Bay'))).toEqual(['1987-10-24', '1987-10-25']);
        expect(list(timed('1987-10-25T03:00:00Z', '1987-10-25T03:01:00Z', 'America/Goose_Bay'))).toEqual(['1987-10-25']);
    });
    it('returns disjoint preimages of a local date around repeated midnight', () => {
        expect(ranges('1987-10-25', 'America/Goose_Bay')).toEqual([
            {start: '1987-10-25T03:00:00.000Z', end: '1987-10-25T03:01:00.000Z'},
            {start: '1987-10-25T04:00:00.000Z', end: '1987-10-26T04:00:00.000Z'},
        ]);
    });
    it.each([
        ['2026-03-29', 'Europe/Berlin', 23], ['2026-10-25', 'Europe/Berlin', 25],
        ['2026-04-05', 'Australia/Lord_Howe', 24.5], ['2026-10-04', 'Australia/Lord_Howe', 23.5],
    ])('projects %s in %s without fixed 24h arithmetic', (date, zone, hours) => {
        const duration = projector.dayInstants(date, zone).reduce((sum, range) => sum + range.end - range.start, 0);
        expect(duration / 3_600_000).toBe(hours);
    });
    it('keeps historical second offsets when finding local date boundaries', () => {
        expect(ranges('1900-01-01', 'Europe/Paris')).toEqual([{start: '1899-12-31T23:50:39.000Z', end: '1900-01-01T23:50:39.000Z'}]);
    });
    it('clips only out-of-domain local tails and supports a last-instant moment', () => {
        expect(timed('0001-01-01T00:00:00Z', undefined, 'Etc/GMT+12').dayCount).toBe(0);
        expect(list(timed('0001-01-01T00:00:00Z', '0001-01-02T00:00:00Z', 'Etc/GMT+12'))).toEqual(['0001-01-01']);
        expect(list(timed('9999-12-31T00:00:00Z', '9999-12-31T23:59:59.999Z', 'Asia/Tokyo'))).toEqual(['9999-12-31']);
        expect(timed('9999-12-31T23:59:59.999Z', undefined, 'Asia/Tokyo').dayCount).toBe(0);
        expect(list(timed('9999-12-31T23:59:59.999Z'))).toEqual(['9999-12-31']);
        expect(projector.dayInstants('9999-12-31', 'UTC')[0].end).toBe(MAX_INSTANT + 1);
    });
    it('counts very long intervals as ranges without allocating each date', () => {
        const result = timed('0001-01-01T00:00:00Z', '9999-12-31T23:59:59.999Z');
        expect(result.ranges).toEqual([{start: MIN_DAY, end: MAX_DAY + 1}]);
        expect(result.dayCount).toBe(3_652_059);
    });
    it('merges repeated dates without duplicate counts, preserving a genuinely missing day', () => {
        const result = membershipFromSpans([
            {start: 0, end: 2 * UTC_DAY_MS, offset: 0},
            {start: 2 * UTC_DAY_MS, end: 3 * UTC_DAY_MS, offset: -UTC_DAY_MS},
            {start: 4 * UTC_DAY_MS, end: 5 * UTC_DAY_MS, offset: 0},
        ]);
        expect(result).toEqual({ranges: [{start: 0, end: 2}, {start: 4, end: 5}], dayCount: 3});
        expect(containsDay(result, 2)).toBe(false);
    });
    it('agrees with a minute-by-minute projection oracle through a date-reversing transition', () => {
        const start = ms('1987-10-24T00:00:00Z'), end = ms('1987-10-27T00:00:00Z');
        const seen = new Set<string>();
        for (let instant = start; instant < end; instant += 60_000) seen.add(dates.projectInstant(instant, 'America/Goose_Bay').date!);
        expect(list(timed('1987-10-24T00:00:00Z', '1987-10-27T00:00:00Z', 'America/Goose_Bay'))).toEqual([...seen].sort());
    });
});

// Review 2026-10-09-2: layout dates of a long timed interval are bounded by its ends and the dates asked, never by its
// duration (one valid 0001…9999 item blocked SSR for seconds), and agree exactly with the full projection.
describe('bounded interval dates', () => {
    const counted = () => {
        const base = createDateAdapter(), calls = {count: 0};
        const adapter = {...base, projectInstant: (instant: number, zone: string) => { calls.count++; return base.projectInstant(instant, zone); }};
        return {calls, projector: createIntervalProjector(adapter)};
    };
    const cases: [string, string, string, string[]][] = [
        ['Pacific/Apia', '2011-11-01T00:00:00Z', '2012-02-01T00:00:00Z', ['2011-12-29', '2011-12-30', '2011-12-31', '2012-01-01']],
        ['Europe/Berlin', '2025-12-31T23:30:00Z', '2027-01-01T00:30:00Z', ['2026-03-29', '2026-10-25', '2026-12-31', '2027-01-01']],
        ['America/Goose_Bay', '1987-01-01T03:00:00Z', '1987-12-31T00:00:00Z', ['1987-04-05', '1987-10-24', '1987-10-25', '1987-10-26']],
        ['Australia/Lord_Howe', '2020-01-01T00:00:00Z', '2021-06-01T13:29:59.999Z', ['2020-04-05', '2020-10-04', '2021-06-01', '2021-06-02']],
        ['Etc/GMT+12', '0001-01-01T00:00:00Z', '0001-03-01T00:00:00Z', ['0001-01-01', '0001-02-28', '0001-03-01']],
        ['Pacific/Kiritimati', '9999-10-01T00:00:00Z', '9999-12-31T23:59:59.999Z', ['9999-12-30', '9999-12-31']],
    ];
    it.each(cases)('agrees with the full projection in %s for %s…%s', (zone, start, end, probes) => {
        const interval = dates.parseInterval({kind: 'timed', start, end}), exact = projector.project(interval, zone), bounded = projector.dates(interval, zone);
        expect(end > start && ms(end) - ms(start) > BOUNDED_PROJECTION_MS).toBe(true);
        expect([bounded.first, bounded.end]).toEqual([exact.ranges[0].start, exact.ranges[exact.ranges.length - 1].end]);
        const days = [...probes.map(dateToDay), exact.ranges[0].start - 1, exact.ranges[0].start, exact.ranges[exact.ranges.length - 1].end - 1, exact.ranges[exact.ranges.length - 1].end];
        for (const day of days) expect([dayToDate(Math.min(MAX_DAY, Math.max(MIN_DAY, day))), bounded.contains(day)]).toEqual([dayToDate(Math.min(MAX_DAY, Math.max(MIN_DAY, day))), containsDay(exact, day)]);
    });
    it('keeps the Apia hole of a long item exact', () => {
        const bounded = projector.dates(dates.parseInterval({kind: 'timed', start: '2011-06-01T00:00:00Z', end: '2012-06-01T00:00:00Z'}), 'Pacific/Apia');
        expect(['2011-12-29', '2011-12-30', '2011-12-31'].map(date => bounded.contains(dateToDay(date)))).toEqual([true, false, true]);
    });
    it('projects the whole domain in Europe/Berlin with a bounded number of offset reads', () => {
        const {calls, projector: bounded} = counted(), started = performance.now();
        const result = bounded.dates(dates.parseInterval({kind: 'timed', start: '0001-01-01T00:00:00Z', end: '9999-12-31T23:59:59.999Z'}), 'Europe/Berlin');
        expect([result.first, result.end]).toEqual([MIN_DAY, MAX_DAY + 1]);
        for (let day = dateToDay('2026-08-31'); day < dateToDay('2026-10-12'); day++) expect(result.contains(day)).toBe(true);
        expect(calls.count).toBeLessThan(400);
        expect(performance.now() - started).toBeLessThan(500);
    });
    it('reads offsets for a long item independently of its duration', () => {
        const reads = (end: string) => {
            const {calls, projector: bounded} = counted();
            const result = bounded.dates(dates.parseInterval({kind: 'timed', start: '1990-01-01T00:00:00Z', end}), 'Europe/Berlin');
            for (let day = dateToDay('2026-08-31'); day < dateToDay('2026-10-12'); day++) result.contains(day);
            return calls.count;
        };
        expect(reads('9000-01-01T00:00:00Z')).toBe(reads('2030-01-01T00:00:00Z'));
    });
});
