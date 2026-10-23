// @vitest-environment node
import {describe, expect, it, vi} from 'vitest';
import type {CalendarItem, CalendarProps, CalendarSortContext} from '../../reference.js';
import {createDateAdapter} from '../date.js';
import {buildCalendarIndex, fitWeekLanes, orderItems} from '../layout.js';
import {createIntervalProjector} from '../projection.js';
import {validateRecords} from '../validation.js';

const dates = createDateAdapter(), projector = createIntervalProjector(dates);
const range = {start: '2026-08-31', end: '2026-10-05'};
const allDay = (id: string, start: string, end: string): CalendarItem => ({id, title: id, data: null, interval: {kind: 'allDay', start, end}});
const timed = (id: string, start: string, end?: string): CalendarItem => ({id, title: id, data: null, interval: {kind: 'timed', start, end}});
const records = (items: readonly CalendarItem[], extra: Partial<CalendarProps> = {}) => validateRecords({items, anchorDate: '2026-09-01', timeZone: 'UTC', onNavigate() {}, ...extra} as CalendarProps, dates, 'Untitled');
const index = (items: readonly CalendarItem[], comparator?: CalendarProps['sortItems']) => buildCalendarIndex(records(items), projector, 'UTC', range, comparator);
const ids = (entries: ReturnType<typeof index>['entries'] | ReturnType<typeof index>['days'][number]['items']) => entries.map(entry => entry.record.item.id);

describe('one global item order', () => {
    it('orders all-day duration, multi-date timed counts and moment start instants before code-unit IDs', () => {
        const items = [
            timed('moment', '2026-09-01T00:00:00Z'), timed('single', '2026-09-01T01:00:00Z', '2026-09-01T23:00:00Z'),
            timed('multi-short', '2026-09-01T12:00:00Z', '2026-09-03T00:00:00Z'), timed('multi-long', '2026-09-01T12:00:00Z', '2026-09-04T00:00:00Z'),
            allDay('all-short', '2026-09-01', '2026-09-02'), allDay('all-long', '2026-09-01', '2026-09-04'), allDay('all-earlier', '2026-08-31', '2026-09-01'),
        ];
        expect(ids(index(items).entries)).toEqual(['all-earlier', 'all-long', 'all-short', 'multi-long', 'multi-short', 'moment', 'single']);
    });
    it('uses full interval membership, even when only one occupied date lies in the current grid', () => {
        const result = index([timed('moment', '2026-10-04T00:00:00Z'), timed('multi', '2026-10-04T22:00:00Z', '2026-10-06T00:00:00Z')]);
        expect(ids(result.agenda('2026-10-04'))).toEqual(['multi', 'moment']);
        expect(result.entries[0].presentation).toBe('bar');
    });
    it('keeps single-day all-day bars and timed chips distinct', () => {
        expect(index([allDay('bar', '2026-09-03', '2026-09-04'), timed('chip', '2026-09-03T00:00:00Z')]).entries.map(e => e.presentation)).toEqual(['bar', 'chip']);
    });
    it('fully replaces default groups with custom order, using only timezone in its context', () => {
        const comparator = vi.fn((a: CalendarItem, b: CalendarItem, context: CalendarSortContext) => {
            expect(context).toEqual({timeZone: 'UTC'});
            return a.id === b.id ? 0 : a.id === 'timed' ? -1 : 1;
        });
        const result = index([allDay('all', '2026-09-03', '2026-09-04'), timed('timed', '2026-09-03T00:00:00Z')], comparator);
        expect(ids(result.entries)).toEqual(['timed', 'all']);
        expect(ids(result.agenda('2026-09-03'))).toEqual(['timed', 'all']);
    });
    it.each([0, NaN, Infinity, -Infinity])('uses Unicode code units for comparator result %j', result => {
        const items = ['\ue000', '2', '10', '\u{10000}', 'ä', 'z'].map(id => timed(id, '2026-09-03T00:00:00Z'));
        const actual = index(items, () => result);
        expect(ids(actual.entries)).toEqual(['10', '2', 'z', 'ä', '\u{10000}', '\ue000']);
        expect(actual.diagnostics.length > 0).toBe(!Number.isFinite(result));
    });
    it('does not mask a consumer comparator exception', () => {
        const failure = new Error('Consumer resolver');
        expect(() => index([allDay('a', '2026-09-01', '2026-09-02'), allDay('b', '2026-09-01', '2026-09-02')], () => { throw failure; })).toThrow(failure);
    });
    it('filters and excludes invalid/duplicate records before comparator, counts and agenda', () => {
        const valid = allDay('valid', '2026-09-01', '2026-09-03');
        const input = records([valid, {...valid, id: 'hidden', calendarId: 'source'}, {...valid, id: 'unknown', calendarId: 'unknown'},
            allDay('duplicate', '2026-09-01', '2026-09-02'), allDay('duplicate', '2026-09-03', '2026-09-04'),
            allDay('invalid', 'bad', '2026-09-04')], {sources: [{id: 'source', title: 'Source'}], visibleSourceIds: [], onVisibleSourceIdsChange() {}});
        const comparator = vi.fn(() => 0);
        const actual = buildCalendarIndex(input, projector, 'UTC', range, comparator);
        expect(ids(actual.agenda('2026-09-01'))).toEqual(['unknown', 'valid']);
        expect(comparator.mock.calls.flat().every(item => ['valid', 'unknown'].includes((item as CalendarItem).id) || (item as {timeZone?: string}).timeZone === 'UTC')).toBe(true);
        expect(actual.days.find(day => day.date === '2026-09-01')?.itemCount).toBe(2);
    });
    it('preserves frozen consumer objects and cyclic data without relying on input order', () => {
        const cycle: {self?: unknown} = {}; cycle.self = cycle;
        const a = Object.freeze({...allDay('a', '2026-09-01', '2026-09-03'), data: cycle});
        const b = Object.freeze(allDay('b', '2026-09-01', '2026-09-03'));
        expect(ids(index(Object.freeze([b, a])).entries)).toEqual(ids(index([a, b]).entries));
        expect(index([a]).entries[0].record.item).toBe(a);
        expect(a.data).toBe(cycle);
    });
});

describe('week segments, lanes, counts and overflow', () => {
    it('splits at week boundaries with exclusive segmentRange and continuation flags', () => {
        const actual = index([allDay('long', '2026-08-30', '2026-09-09')]);
        expect(actual.weeks[0].segments[0]).toMatchObject({startColumn: 0, endColumn: 7, lane: 0, segmentRange: {start: '2026-08-31', end: '2026-09-07'}, continuesBefore: true, continuesAfter: true});
        expect(actual.weeks[1].segments[0]).toMatchObject({startColumn: 0, endColumn: 2, lane: 0, segmentRange: {start: '2026-09-07', end: '2026-09-09'}, continuesBefore: true, continuesAfter: false});
    });
    it('preserves global order where first-fit occupancy would reverse it', () => {
        const actual = index([allDay('a', '2026-08-31', '2026-09-01'), allDay('b', '2026-08-31', '2026-09-03'), allDay('c', '2026-09-01', '2026-09-02')], (a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
        expect(actual.weeks[0].segments.map(segment => [segment.entry.record.item.id, segment.lane])).toEqual([['a', 0], ['b', 1], ['c', 2]]);
        expect(ids(actual.agenda('2026-09-01'))).toEqual(['b', 'c']);
    });
    it('leaves a hole for Apia and keeps fragments of one item on one lane', () => {
        const items = records([timed('timed', '2011-12-29T10:00:00Z', '2011-12-31T10:00:00Z'), allDay('all', '2011-12-29', '2012-01-01')]);
        const actual = buildCalendarIndex(items, projector, 'Pacific/Apia', {start: '2011-12-26', end: '2012-01-23'});
        const segments = actual.weeks[0].segments.filter(segment => segment.entry.record.item.id === 'timed');
        expect(segments.map(s => [s.segmentRange, s.lane])).toEqual([
            [{start: '2011-12-29', end: '2011-12-30'}, 1], [{start: '2011-12-31', end: '2012-01-01'}, 1],
        ]);
        expect(ids(actual.agenda('2011-12-30'))).toEqual(['all']);
        expect(actual.days.find(day => day.date === '2011-12-31')?.itemCount).toBe(2);
        // QA-18: the parts beside the skipped date still continue the item.
        expect(segments.map(s => [s.continuesBefore, s.continuesAfter])).toEqual([[false, true], [true, false]]);
    });
    it('reserves +N per date: a date whose items fit keeps every lane (QA-18)', () => {
        // Tuesday: a bar Tue-Wed and one chip (2 items); Wednesday: the bar and two more (3 items).
        const week = index([allDay('bar', '2026-09-01', '2026-09-03'), timed('tue', '2026-09-01T10:00:00Z'),
            timed('wed-1', '2026-09-02T10:00:00Z'), timed('wed-2', '2026-09-02T11:00:00Z')]).weeks[0];
        const fit = fitWeekLanes(week, {withoutOverflow: 2, withOverflow: 1});
        expect(fit.days[1]).toEqual({date: '2026-09-01', itemCount: 2, visibleCount: 2, hiddenCount: 0});
        expect(fit.days[2]).toEqual({date: '2026-09-02', itemCount: 3, visibleCount: 1, hiddenCount: 2});
        expect(fit.visibleSegments.map(s => [s.entry.record.item.id, s.segmentRange.start, s.segmentRange.end, s.continuesBefore, s.continuesAfter])).toEqual([
            ['bar', '2026-09-01', '2026-09-03', false, false], ['tue', '2026-09-01', '2026-09-02', false, false]]);
        // Lane 1 of the bar's neighbour row is shown on Tuesday only; the cut side continues.
        const split = index([allDay('first', '2026-09-01', '2026-09-03'), allDay('second', '2026-09-01', '2026-09-03'), timed('wed', '2026-09-02T10:00:00Z')]).weeks[0];
        const parts = fitWeekLanes(split, {withoutOverflow: 2, withOverflow: 1}).visibleSegments.filter(s => s.entry.record.item.id === 'second');
        expect(parts.map(s => [s.startColumn, s.endColumn, s.segmentRange, s.continuesBefore, s.continuesAfter])).toEqual([[1, 2, {start: '2026-09-01', end: '2026-09-02'}, false, true]]);
    });
    it.each([0, 1, 2, 3, NaN, Infinity, -1])('reserves overflow row and counts exact hidden items at capacity %j', capacity => {
        const week = index(['a', 'b', 'c'].map(id => allDay(id, '2026-09-01', '2026-09-02'))).weeks[0];
        const fit = fitWeekLanes(week, {withoutOverflow: capacity, withOverflow: capacity - 1});
        const visible = capacity === 3 ? 3 : capacity === 2 ? 1 : 0;
        expect(fit.days[1]).toEqual({date: '2026-09-01', itemCount: 3, visibleCount: visible, hiddenCount: 3 - visible});
        expect(fit.days[0].hiddenCount).toBe(0);
    });
    it('allows a taller overflow indicator to consume more than one item lane', () => {
        const week = index(['a', 'b', 'c', 'd'].map(id => allDay(id, '2026-09-01', '2026-09-02'))).weeks[0];
        const fit = fitWeekLanes(week, {withoutOverflow: 3, withOverflow: 1});
        expect(fit.days[1]).toEqual({date: '2026-09-01', itemCount: 4, visibleCount: 1, hiddenCount: 3});
    });
    it('uses the same cell order/count in grid, agenda and all lane capacities', () => {
        const actual = index([allDay('one', '2026-09-01', '2026-09-08'), allDay('two', '2026-09-02', '2026-09-05'), timed('three', '2026-09-03T01:00:00Z')]);
        for (const week of actual.weeks) for (let column = 0; column < 7; column++) {
            const segments = week.segments.filter(s => s.startColumn <= column && column < s.endColumn).sort((a, b) => a.lane - b.lane);
            expect(segments.map(s => s.entry.record.item.id)).toEqual(ids(actual.agenda(week.dates[column])));
            for (const capacity of [0, 1, 2, 3]) {
                const day = fitWeekLanes(week, {withoutOverflow: capacity, withOverflow: capacity - 1}).days[column];
                expect(day.visibleCount + day.hiddenCount).toBe(actual.agenda(day.date).length);
            }
        }
    });
    it('can read the final ISO date in agenda while Month segments stay inside exclusive bounds', () => {
        const actual = buildCalendarIndex(records([timed('last', '9999-12-31T23:59:59.999Z')]), projector, 'UTC', {start: '9999-11-01', end: '9999-12-06'});
        expect(ids(actual.agenda('9999-12-31'))).toEqual(['last']);
        expect(actual.weeks.every(week => week.segments.length === 0)).toBe(true);
    });
    it('lays out fresh, structurally equal items identically whatever the input order (§6.1, T19-V1-01)', () => {
        const source = [allDay('long', '2026-08-30', '2026-09-09'), allDay('Zeta', '2026-09-01', '2026-09-02'), allDay('alpha', '2026-09-01', '2026-09-02'),
            timed('night', '2026-09-01T20:00:00Z', '2026-09-02T02:00:00Z'), timed('zero', '2026-09-01T07:00:00Z', '2026-09-01T07:00:00Z'),
            timed('moment', '2026-09-01T08:00:00Z'), timed('chip', '2026-09-01T12:00:00Z', '2026-09-01T13:00:00Z'), timed('tie', '2026-09-01T12:00:00Z', '2026-09-01T13:00:00Z')];
        const fresh = () => source.map(item => ({...item, interval: {...item.interval}}));
        const shape = (result: ReturnType<typeof index>) => result.weeks.map(week => week.segments.map(segment => [segment.entry.record.item.id, segment.lane,
            segment.startColumn, segment.endColumn, segment.continuesBefore, segment.continuesAfter]));
        const first = index(source), copies = [fresh(), fresh().reverse(), [...fresh()].sort((a, b) => a.title.localeCompare(b.title))];
        for (const copy of copies) {
            const next = index(copy);
            expect(next.entries.every((entry, i) => entry.record.item !== first.entries[i].record.item)).toBe(true);
            expect(shape(next)).toEqual(shape(first));
            expect(next.days.map(day => ids(day.items))).toEqual(first.days.map(day => ids(day.items)));
            for (const week of next.weeks) expect(fitWeekLanes(week, {withoutOverflow: 3, withOverflow: 2})).toEqual(fitWeekLanes(first.weeks[next.weeks.indexOf(week)], {withoutOverflow: 3, withOverflow: 2}));
        }
        expect(ids(first.agenda('2026-09-01'))).toEqual(['long', 'Zeta', 'alpha', 'night', 'zero', 'moment', 'chip', 'tie']);
    });
    it('rejects partial weeks and keeps empty layouts empty', () => {
        expect(() => buildCalendarIndex(records([]), projector, 'UTC', {start: '2026-09-01', end: '2026-09-30'})).toThrow(RangeError);
        expect(orderItems(records([]), projector, 'UTC').entries).toEqual([]);
        expect(index([]).weeks[0].laneCount).toBe(0);
    });
});
