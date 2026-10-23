// @vitest-environment node
import {describe, expect, it} from 'vitest';
import {clampToMonth, commitNavigation, reconcileAgenda, requestNavigation, shiftMonth, type NavigationState} from '../controller.js';
import {getCalendarVisibleRange} from '../formatting.js';

const snapshot = (month: string, blocking = false) => ({month, blocking, range: getCalendarVisibleRange({anchorDate: month, timeZone: 'UTC', locale: 'en-US'})});
const january: NavigationState = {month: '2026-01-01', date: '2026-01-31', intent: null};
const grid = {grid: true, calendar: true, initiator: false};
describe('navigation transition kernel', () => {
    it('requests a normalized month while preserving accepted month and focus', () => {
        const result = requestNavigation(january, snapshot(january.month), '2026-02-28', 'grid');
        expect(result).toMatchObject({navigate: '2026-02-01', state: {month: january.month, date: january.date}});
        expect(commitNavigation(result.state, snapshot(january.month), grid).focus).toBeUndefined();
        const accepted = commitNavigation(result.state, snapshot('2026-02-01'), grid);
        expect(accepted).toMatchObject({focus: '2026-02-28', state: {month: '2026-02-01', date: '2026-02-28', intent: null}});
        expect(clampToMonth(accepted.state.date, '2026-03-01')).toBe('2026-03-28');
    });
    it.each(['grid', 'today', 'toolbar'] as const)('blocking wins over simultaneous %s acceptance', source => {
        const requested = requestNavigation(january, snapshot(january.month), '2026-02-28', source).state;
        const blocked = commitNavigation(requested, snapshot('2026-02-01', true), {...grid, initiator: true});
        expect(blocked.state.intent).toBeNull(); expect(blocked.focus).toBeUndefined(); expect(blocked.announce).toBeUndefined();
        expect(commitNavigation(blocked.state, snapshot('2026-02-01'), grid).focus).toBeUndefined();
        expect(commitNavigation(requested, null, grid).state.intent).toBeNull();
    });
    it('replaces requests and treats stale/mismatching acceptance as external navigation', () => {
        const first = requestNavigation(january, snapshot(january.month), '2026-02-14', 'today').state;
        const latest = requestNavigation(first, snapshot(january.month), '2025-12-01', 'toolbar').state;
        const stale = commitNavigation(latest, snapshot('2026-02-01'), {grid: false, calendar: true, initiator: true});
        expect(stale.state.intent).toBeNull(); expect(stale.focus).toBeUndefined(); expect(stale.announce).toBeUndefined();
        expect(commitNavigation(first, snapshot('2026-03-01'), grid).focus).toBe('2026-03-31');
    });
    it('gates Today on the initiator and toolbar announcement on calendar focus', () => {
        const today = requestNavigation(january, snapshot(january.month), '2026-02-14', 'today').state;
        expect(commitNavigation(today, snapshot('2026-02-01'), {grid: false, calendar: true, initiator: true}).focus).toBe('2026-02-14');
        expect(commitNavigation(today, snapshot('2026-02-01'), {grid: false, calendar: true, initiator: false}).focus).toBeUndefined();
        const toolbar = requestNavigation(january, snapshot(january.month), '2026-02-01', 'toolbar').state;
        expect(commitNavigation(toolbar, snapshot('2026-02-01'), {grid: false, calendar: true, initiator: false}).announce).toBe('2026-02-01');
        expect(commitNavigation(toolbar, snapshot('2026-02-01'), grid).announce).toBeUndefined();
        expect(commitNavigation(toolbar, snapshot('2026-02-01'), {grid: false, calendar: false, initiator: false}).announce).toBeUndefined();
    });
    it('focuses adjacent visible dates without a navigation request', () => {
        const result = requestNavigation(january, snapshot(january.month), '2025-12-31', 'grid');
        expect(result).toMatchObject({focus: '2025-12-31', state: {intent: null}}); expect(result).not.toHaveProperty('navigate');
    });
    it.each([
        ['2026-03-01', '2026-03-01', '2026-04-01'],
        ['2026-04-01', '2026-04-30', '2026-03-30'],
    ])('requests a month even when its target is already visible: %s', (month, date, target) => {
        const state = {month, date, intent: null}, current = snapshot(month);
        const request = requestNavigation(state, current, target, 'grid', 'month');
        expect(request).toMatchObject({navigate: target.slice(0, 7) + '-01', state: {date, intent: {source: 'grid', date: target}}});
        expect(request).not.toHaveProperty('focus');
        expect(commitNavigation(request.state, current, grid).focus).toBeUndefined();
        expect(commitNavigation(request.state, snapshot(target.slice(0, 7) + '-01'), grid).focus).toBe(target);
        // Arrow/Today movement still uses the visible cell immediately.
        expect(requestNavigation(state, current, target, 'grid')).toMatchObject({focus: target});
        expect(requestNavigation(state, current, target, 'today')).toMatchObject({focus: target});
    });
    it('disables months beyond the supported anchor domain', () => {
        expect(shiftMonth('0001-02-01', -1)).toBeNull(); expect(shiftMonth('9999-11-01', 1)).toBeNull();
        expect(shiftMonth('0001-02-01', 1)).toBe('0001-03-01'); expect(shiftMonth('9999-11-01', -12)).toBe('9998-11-01');
        expect(requestNavigation(january, snapshot(january.month), '9999-12-01', 'today').blocked).toBe(true);
        const first = snapshot('0001-02-01');
        expect(requestNavigation({month: first.month, date: first.month, intent: null}, first, first.range.start, 'grid'))
            .toMatchObject({focus: first.range.start, blocked: false});
    });
    it('focuses a Today in the grid of the first/last supported Month without a request (§11.3, review 2026-10-09-1)', () => {
        const last = snapshot('9999-11-01'), first = snapshot('0001-02-01'), at = (current: typeof last) => ({month: current.month, date: current.month, intent: null});
        expect(last.range.end > '9999-12-03').toBe(true); expect(first.range.start <= '0001-01-29').toBe(true);
        for (const [current, date] of [[last, '9999-12-03'], [first, '0001-01-29']] as const) {
            const result = requestNavigation(at(current), current, date, 'today');
            expect(result).toMatchObject({focus: date, blocked: false, state: {date, intent: null}}); expect(result).not.toHaveProperty('navigate');
        }
        // A Today beyond the bound and outside the grid stays unavailable; the toolbar never focuses a neighbor date.
        expect(requestNavigation(at(last), last, '9999-12-31', 'today').blocked).toBe(true);
        expect(requestNavigation(at(last), last, '9999-12-03', 'toolbar').blocked).toBe(true);
    });
});
describe('uncontrolled agenda baseline', () => {
    it('updates untouched fallback after hydration, but preserves user viewing', () => {
        const initial = reconcileAgenda(null, '2026-09-01', undefined, null);
        expect(initial.date).toBe('2026-09-01');
        expect(reconcileAgenda(initial, initial.month, undefined, '2026-09-17').date).toBe('2026-09-17');
        expect(reconcileAgenda({...initial, date: '2026-09-03', untouched: false}, initial.month, undefined, '2026-09-17').date).toBe('2026-09-03');
        expect(reconcileAgenda(initial, initial.month, undefined, '2026-10-01').date).toBe('2026-09-01');
    });
    it('preserves controlled dates and seeds uncontrolled mode from the last accepted value', () => {
        const controlled = reconcileAgenda(null, '2026-09-01', '2026-11-10', '2026-09-17');
        const switched = reconcileAgenda(controlled, '2026-09-01', undefined, '2026-09-17');
        expect(switched.date).toBe('2026-11-10');
        expect(reconcileAgenda(switched, '2026-10-01', undefined, '2026-09-17').date).toBe('2026-10-01');
        expect(reconcileAgenda(controlled, '2026-10-01', '2026-11-10', null).date).toBe('2026-11-10');
    });
});
