import {readFileSync} from 'node:fs';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {renderToString} from 'react-dom/server';
import {describe, expect, it} from 'vitest';
import {Calendar} from '../../src/index.js';
import {createDateAdapter} from '../../src/v02/core/date.js';
import {toCalendarItem, type LegacyEvent} from '../../examples/migration/convert.js';

// Checks of the documented consumer-side migration (spec §17.2/§17.3), not a legacy renderer.
const legacy = (patch: Partial<LegacyEvent>): LegacyEvent => ({id: 'event', title: 'Event', start: '2026-09-03T00:00:00+03:00', variant: 'blue',
    isOverdue: false, isCritical: false, isAllDay: false, taskId: 'T-1', isClickable: true, hasHoverActions: false, ...patch});
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');

/** Item count of every date cell, read from the server HTML of the public Calendar. */
function dayCounts(items: ReturnType<typeof toCalendarItem>[]) {
    const container = document.createElement('div');
    container.innerHTML = renderToString(<Calendar items={items} timeZone="Europe/Moscow" anchorDate="2026-09-01" onNavigate={() => {}}
        today="2026-09-01" locale="en-US" layout="desktop"/>);
    return Object.fromEntries([...container.querySelectorAll<HTMLElement>('[role=gridcell]')].map(cell => {
        const description = container.querySelector(`[id="${cell.getAttribute('aria-describedby')}"]`)!.textContent!;
        const count = Number(/: (\d+) events?/.exec(description)![1]);
        expect(cell.hasAttribute('data-has-items')).toBe(count > 0);
        return [cell.dataset.date!, count];
    }));
}

describe('migration guide: toCalendarItem', () => {
    it('turns inclusive all-day dates 3–4 September into [2026-09-03, 2026-09-05)', () => {
        const item = toCalendarItem(legacy({isAllDay: true, end: '2026-09-04T23:59:59+03:00'}), '+03:00');
        expect(item.interval).toEqual({kind: 'allDay', start: '2026-09-03', end: '2026-09-05'});
        // Dates are taken in the 0.1 display offset, not UTC or the host zone.
        expect(toCalendarItem(legacy({isAllDay: true, start: '2026-09-02T21:00:00Z', end: '2026-09-04T20:59:59Z'}), '+03:00').interval)
            .toEqual({kind: 'allDay', start: '2026-09-03', end: '2026-09-05'});
        expect(toCalendarItem(legacy({isAllDay: true, start: '2026-09-02T21:00:00Z'}), '+00:00').interval)
            .toEqual({kind: 'allDay', start: '2026-09-02', end: '2026-09-03'});
        expect(toCalendarItem(legacy({isAllDay: true, start: '2026-09-03', end: '2026-09-04'}), '-05:00').interval)
            .toEqual({kind: 'allDay', start: '2026-09-03', end: '2026-09-05'});
    });
    it('treats a missing all-day end as one day and adds a calendar day across month and year ends', () => {
        expect(toCalendarItem(legacy({isAllDay: true}), '+03:00').interval).toEqual({kind: 'allDay', start: '2026-09-03', end: '2026-09-04'});
        expect(toCalendarItem(legacy({isAllDay: true, start: '2026-12-31T12:00:00+03:00'}), '+03:00').interval)
            .toEqual({kind: 'allDay', start: '2026-12-31', end: '2027-01-01'});
        expect(toCalendarItem(legacy({isAllDay: true, start: '2028-02-28', end: '2028-02-29'}), '+03:00').interval)
            .toEqual({kind: 'allDay', start: '2028-02-28', end: '2028-03-01'});
    });
    it('keeps timed instants and a missing end, moving domain fields into data', () => {
        const event = legacy({start: '2026-09-03T10:00:00+03:00', end: '2026-09-03T11:30:00.250+03:00'});
        expect(toCalendarItem(event, '+00:00')).toEqual({id: 'event', title: 'Event', interval: {kind: 'timed', start: event.start, end: event.end},
            data: {start: event.start, end: event.end, variant: 'blue', isOverdue: false, isCritical: false, taskId: 'T-1', isClickable: true, hasHoverActions: false}});
        const moment = toCalendarItem(legacy({start: '2026-09-03T10:00:00Z'}), '+03:00').interval;
        expect(moment).toEqual({kind: 'timed', start: '2026-09-03T10:00:00Z'});
        expect('end' in moment).toBe(false);
        // A non-strict spelling of the same instant is rewritten in UTC, never shifted.
        const loose = toCalendarItem(legacy({start: '2026-09-03T10:00+03:00'}), '+03:00').interval;
        expect(loose).toEqual({kind: 'timed', start: '2026-09-03T07:00:00.000Z'});
        expect(Date.parse(loose.start)).toBe(Date.parse('2026-09-03T10:00:00+03:00'));
    });
    it('rejects offset-less timestamps, malformed offsets and reversed all-day dates instead of guessing', () => {
        expect(() => toCalendarItem(legacy({start: '2026-09-03T10:00:00'}), '+03:00')).toThrow(RangeError);
        expect(() => toCalendarItem(legacy({isAllDay: true, start: '2026-09-03T10:00:00'}), '+03:00')).toThrow(RangeError);
        expect(() => toCalendarItem(legacy({isAllDay: true, start: '2026-09-03T10:00:00Z'}), 'Europe/Moscow')).toThrow(RangeError);
        expect(() => toCalendarItem(legacy({isAllDay: true, start: '2026-09-04', end: '2026-09-03'}), '+03:00')).toThrow(RangeError);
    });
    it('throws for every value 0.2 would exclude and returns only intervals 0.2 accepts (QA-24)', () => {
        const {parseInterval} = createDateAdapter(), accepted = (interval: unknown) => { try { parseInterval(interval); return true; } catch { return false; } };
        const rejected: Partial<LegacyEvent>[] = [
            {start: '2026-09-03T10:00:00-00:00'}, {start: '2026-09-03T10:00:00+03:00', end: '2026-09-03T24:00:00+03:00'}, {start: '2026-02-30T10:00:00Z'},
            {start: '2026-09-03T10:00:60Z'}, {start: '2026-09-03T10:00:00+24:00'}, {start: '2026-09-03T10:61:00Z'}, {start: '0000-12-31T23:00:00Z'},
            {start: '2026-09-03T12:00:00+03:00', end: '2026-09-03T10:00:00+03:00'}, {start: '2026-09-03T10:00:00+03:00', end: '2026-09-03T09:59:59.999+03:00'},
        ];
        for (const patch of rejected) {
            expect(() => toCalendarItem(legacy(patch), '+03:00'), JSON.stringify(patch)).toThrow(RangeError);
            expect(accepted({kind: 'timed', start: patch.start, ...(patch.end ? {end: patch.end} : {})}), JSON.stringify(patch)).toBe(false);
        }
        for (const patch of [{start: '2026-02-30'}, {start: '2026-09-31', end: '2026-10-01'}, {start: '2026-09-03', end: '2026-13-01'}, {start: '2026-09-03T10:00:00-00:00'}]) {
            expect(() => toCalendarItem(legacy({...patch, isAllDay: true}), '+03:00'), JSON.stringify(patch)).toThrow(RangeError);
        }
        // Review 2026-10-09-1: the domain edges. An exclusive end cannot follow 9999-12-31, and a date taken in the display
        // offset can leave 0001…9999; the calendar would exclude each of these intervals, so the function throws.
        for (const [patch, offset] of [[{start: '9999-12-31'}, '+03:00'], [{start: '9999-12-30', end: '9999-12-31'}, '+03:00'],
            [{start: '9999-12-31T22:00:00Z'}, '+03:00'], [{start: '0001-01-01T01:00:00Z'}, '-03:00']] as const) {
            expect(() => toCalendarItem(legacy({...patch, isAllDay: true}), offset), JSON.stringify(patch)).toThrow(RangeError);
        }
        for (const end of ['+010000-01', '+010000-01-01', '0000-12-31']) expect(accepted({kind: 'allDay', start: '9999-12-30', end}), end).toBe(false);
        expect(toCalendarItem(legacy({isAllDay: true, start: '9999-12-30'}), '+03:00').interval).toEqual({kind: 'allDay', start: '9999-12-30', end: '9999-12-31'});
        expect(accepted(toCalendarItem(legacy({isAllDay: true, start: '0001-01-01T00:00:00Z'}), '+00:00').interval)).toBe(true);
        const kept: Partial<LegacyEvent>[] = [{start: '2026-09-03T10:00:00.123456Z'}, {start: '2026-09-03T10:00+03:00'}, {start: '2028-02-29T10:00:00Z'},
            {start: '0001-01-01T03:00:00+03:00'}, {start: '9999-12-31T23:59:59.999Z'}, {start: '2026-09-03T10:00:00Z', end: '2026-09-03T13:00:00+03:00'},
            {start: '2026-09-03T10:00:00+00:00', end: '2026-09-03T11:00:00-01:00'}, {isAllDay: true, start: '2028-02-29', end: '2028-03-01'}];
        for (const patch of kept) expect(accepted(toCalendarItem(legacy(patch), '+03:00').interval), JSON.stringify(patch)).toBe(true);
        expect(toCalendarItem(legacy({start: '2026-09-03T10:00:00.123456Z'}), '+03:00').interval).toEqual({kind: 'timed', start: '2026-09-03T10:00:00.123Z'});
    });
    it('renders the converted items with exclusive ends: a midnight end does not occupy the next day', () => {
        const counts = dayCounts([
            toCalendarItem(legacy({id: 'review', isAllDay: true, end: '2026-09-04T23:59:59+03:00'}), '+03:00'),
            toCalendarItem(legacy({id: 'late', start: '2026-09-14T22:00:00+03:00', end: '2026-09-15T00:00:00+03:00'}), '+03:00'),
            toCalendarItem(legacy({id: 'night', start: '2026-09-16T22:00:00+03:00', end: '2026-09-17T01:00:00+03:00'}), '+03:00'),
        ]);
        expect(counts).toMatchObject({'2026-09-02': 0, '2026-09-03': 1, '2026-09-04': 1, '2026-09-05': 0,
            '2026-09-14': 1, '2026-09-15': 0, '2026-09-16': 1, '2026-09-17': 1, '2026-09-18': 0});
        expect(Object.values(counts).reduce((sum, count) => sum + count, 0)).toBe(5);
    });
    it('is the exact function printed in both migration guides', () => {
        const source = read('examples/migration/convert.ts');
        for (const guide of ['docs/migration-0.1-to-0.2.md', 'docs/migration-0.1-to-0.2.ru.md']) {
            const section = read(guide).split('<a id="conversion"></a>')[1];
            expect(/```ts\n([\s\S]*?)```/.exec(section)?.[1], guide).toBe(source);
        }
    });
});
