// @vitest-environment node
import {describe, expect, it, vi} from 'vitest';
import type {CalendarProps, CalendarTheme} from '../../reference.js';
import {createDateAdapter} from '../date.js';
import {validateActions, validateCalendarInput, validateConfiguration, validateMoveStates, validateRecords} from '../validation.js';

const dates = createDateAdapter(new Set(['UTC', 'Europe/Moscow', 'Europe/Berlin']));
const classic = Object.freeze({name: 'classic'}) as CalendarTheme;
const services = {dates, isTheme: (value: unknown): value is CalendarTheme => value === classic};
const base = {items: [], anchorDate: '2026-09-03', timeZone: 'UTC', onNavigate: vi.fn()};
const interval = {kind: 'timed', start: '2026-09-03T00:00:00Z'} as const;
const item = (id: string, extra: Record<string, unknown> = {}) => ({id, title: id, interval, data: {id}, ...extra});
function accepted(overrides: Record<string, unknown>): CalendarProps {
    const result = validateConfiguration({...base, ...overrides}, services);
    expect(result.kind).toBe('valid');
    if (result.kind !== 'valid') throw result.error;
    return result.props;
}

describe('fatal configuration validation', () => {
    it('accepts the minimal controlled API without inventing defaults or invoking callbacks', () => {
        const result = validateConfiguration(base, services);
        expect(result.kind).toBe('valid');
        if (result.kind === 'valid') expect(result.props).toBe(base);
        expect(base.onNavigate).not.toHaveBeenCalled();
        expect(base).not.toHaveProperty('today');
    });
    it.each([
        ['anchorDate', '0001-01-31'], ['anchorDate', '9999-12-01'], ['anchorDate', '2026-02-29'],
        ['timeZone', 'Etc/UTC'], ['timeZone', 'utc'], ['timeZone', '+03:00'], ['today', null],
        ['today', '2026-09-03T00:00:00Z'], ['locale', 'en_US'], ['locale', ''], ['locale', []],
        ['messagesLocale', ' ru-RU'], ['layout', 'tablet'], ['density', 'dense'], ['colorScheme', 'auto'],
        ['firstDayOfWeek', 1], ['hourCycle', '24'], ['dir', 'auto'], ['agendaPresentation', 'modal'],
        ['mobileBreakpoint', 0], ['mobileBreakpoint', NaN], ['mobileBreakpoint', Infinity], ['mobileBreakpoint', '640'],
        ['items', null], ['sources', {}], ['onNavigate', undefined], ['onRetryRequest', null],
        ['interactionPolicy', null], ['interactionPolicy', {canDropItem: true}], ['theme', {name: 'classic'}],
        ['dataState', {status: 'pending'}], ['dataState', {status: 'loading'}], ['dataState', {status: 'loading', phase: 'later'}],
        ['dataState', {status: 'error', phase: 'refresh'}],
    ])('rejects %s=%j deterministically', (name, value) => {
        const result = validateConfiguration({...base, [name as string]: value}, services);
        expect(result.kind).toBe('contract');
        expect(result.diagnostics.some(d => d.path === name || d.path.startsWith(`${name}.`))).toBe(true);
        if (result.kind === 'contract') expect(result.error).toBeInstanceOf(RangeError);
    });
    it.each([
        {agendaDate: '2026-09-03'}, {onAgendaDateChange: vi.fn()},
        {selection: null}, {onSelectionChange: vi.fn()}, {onCreateRequest: vi.fn()},
        {visibleSourceIds: []}, {sources: [], onVisibleSourceIdsChange: vi.fn()},
        {visibleSourceIds: [], onVisibleSourceIdsChange: vi.fn()}, {showSourceSelector: false},
        {itemMoveStates: []}, {onItemMoveRequest: vi.fn()}, {onItemMoveDraftChange: vi.fn()},
        {getItemActions: vi.fn()}, {onItemActionRequest: vi.fn()},
    ])('rejects half-controlled configuration %j', partial => {
        expect(validateConfiguration({...base, ...partial}, services).kind).toBe('contract');
    });
    it('accepts complete controls, explicit undefined absence, valid locale extensions and opaque presets', () => {
        const callback = vi.fn(() => { throw new Error('Must not be invoked'); });
        expect(validateConfiguration({...base,
            theme: classic, locale: 'ar-EG-u-ca-islamic-nu-arab', messagesLocale: 'fr-FR',
            agendaDate: '9999-12-31', onAgendaDateChange: callback,
            selection: null, onSelectionChange: callback, onCreateRequest: callback,
            sources: [], visibleSourceIds: [], onVisibleSourceIdsChange: callback, showSourceSelector: false,
            itemMoveStates: [], onItemMoveRequest: callback, onItemMoveDraftChange: callback,
            getItemActions: callback, onItemActionRequest: callback,
            interactionPolicy: {canDropItem: callback}, renderItem: callback,
            dataState: {status: 'error', phase: 'refresh', error: undefined},
        }, services).kind).toBe('valid');
        expect(callback).not.toHaveBeenCalled();
        expect(validateConfiguration({...base, selection: undefined, onSelectionChange: undefined}, services).kind).toBe('valid');
        expect(validateConfiguration({...base, selection: {start: '2026-09-03', end: '2026-09-03'}, onSelectionChange: callback}, services).kind).toBe('contract');
    });
    it('does not promote presentation fallbacks into configuration errors', () => {
        expect(validateConfiguration({...base,
            portalContainer: null, tokens: {color: {accent: 12}},
            messages: {invalidConfigurationLabel: ''}, 'aria-labelledby': 'missing-target',
        }, services).kind).toBe('valid');
    });
    it('accepts well-formed tags rejected by Intl so T08 can apply deterministic service fallback', () => {
        for (const locale of ['x-company', 'i-klingon', 'en-GB-oed']) {
            expect(validateConfiguration({...base, locale, messagesLocale: locale}, services).kind).toBe('valid');
        }
    });
    it('does not mask errors thrown by an internal validation service', () => {
        const failure = new Error('Runtime unavailable');
        expect(() => validateConfiguration(base, { ...services, dates: {...dates, validateTimeZone: () => { throw failure; }}})).toThrow(failure);
    });
    it('short-circuits records and callbacks on a contract error, then accepts corrected props', () => {
        const readInterval = vi.fn(() => interval);
        const record = {...item('one'), get interval() { return readInterval(); }};
        const callback = vi.fn();
        const input = {...base, items: [record], timeZone: 'GMT', renderItem: callback, onItemPress: callback};
        expect(validateCalendarInput(input, services, 'Untitled').kind).toBe('contract');
        expect(readInterval).not.toHaveBeenCalled(); expect(callback).not.toHaveBeenCalled();
        const result = validateCalendarInput({...input, timeZone: 'UTC'}, services, 'Untitled');
        expect(result.kind).toBe('data');
        if (result.kind === 'data') expect(result.records.visibleItems[0].item).toBe(record);
        expect(readInterval).toHaveBeenCalledOnce(); expect(callback).not.toHaveBeenCalled();
    });
});

describe('prerelease surface constraint', () => {
    const surface = {version: '0.2.0-alpha.1', layouts: ['desktop'] as const};
    it.each([
        [undefined, "layout: Required in 0.2.0-alpha.1; expected 'desktop'"], ['mobile', "layout: Unsupported in 0.2.0-alpha.1; expected 'desktop'"],
        ['auto', "layout: Unsupported in 0.2.0-alpha.1; expected 'desktop'"], ['tablet', "layout: Unknown enum value; expected 'desktop'"], [null, "layout: Unknown enum value; expected 'desktop'"],
    ])('requires a prerelease layout for layout=%j with one layout diagnostic', (layout, message) => {
        const result = validateConfiguration({...base, layout}, {...services, surface});
        expect(result.kind).toBe('contract');
        if (result.kind === 'contract') expect(result.error.message).toBe(message);
        expect(result.diagnostics.map(d => d.path)).toEqual(['layout']);
    });
    it('accepts the listed layout and leaves the reference surface unconstrained', () => {
        expect(validateConfiguration({...base, layout: 'desktop'}, {...services, surface}).kind).toBe('valid');
        expect(validateConfiguration(base, services).kind).toBe('valid');
        expect(validateConfiguration({...base, layout: 'mobile'}, services).kind).toBe('valid');
    });
    it('treats a missing layout as the default auto once a prerelease accepts it', () => {
        const alpha2 = {version: '0.2.0-alpha.2', layouts: ['auto', 'desktop', 'mobile'] as const};
        for (const layout of [undefined, 'auto', 'desktop', 'mobile']) expect(validateConfiguration({...base, layout}, {...services, surface: alpha2}).kind).toBe('valid');
        const result = validateConfiguration({...base, layout: 'tablet'}, {...services, surface: alpha2});
        expect(result.kind === 'contract' && result.error.message).toBe("layout: Unknown enum value; expected 'auto' or 'desktop' or 'mobile'");
        expect(result.diagnostics.map(d => d.path)).toEqual(['layout']);
    });
});

// Review 2026-10-09-3: configuration dates that pass the pattern but do not exist.
describe('nonexistent configuration dates', () => {
    it.each(['today', 'agendaDate', 'anchorDate'])('%s: 2026-02-30 is a contract error with the package reason', path => {
        const result = validateConfiguration({...base, onAgendaDateChange() {}, agendaDate: '2026-09-02', [path]: '2026-02-30'}, services);
        expect(result.kind === 'contract' && result.error.message).toBe(`${path}: Expected an existing date; 2026-02-30 does not exist`);
    });
});

describe('record isolation and controlled source filtering', () => {
    it('excludes every duplicate even when one duplicate has an invalid interval', () => {
        const data = accepted({items: [item('dupe'), item('dupe', {interval: {kind: 'bad'}}), item('ok'), item('invalid', {interval: {kind: 'timed', start: '2026-09-03'}})]});
        const result = validateRecords(data, dates, 'Без названия');
        expect(result.items.map(entry => entry.item.id)).toEqual(['ok']);
        expect(result.diagnostics.map(d => d.code)).toEqual(['duplicate-id', 'duplicate-id', 'invalid-record']);
    });
    it('keeps unknown-source items visible after excluding all duplicate sources', () => {
        const result = validateRecords(accepted({
            sources: [{id: 'a', title: 'One'}, {id: 'a', title: ''}, {id: 'b', title: 'Two'}, {id: ' ', title: 'Bad'}],
            visibleSourceIds: [], onVisibleSourceIdsChange: vi.fn(),
            items: [item('unknown', {calendarId: 'a'}), item('hidden', {calendarId: 'b'}), item('unbound')],
        }), dates, 'Untitled');
        expect(result.sources.map(source => source.id)).toEqual(['b']);
        expect(result.visibleItems.map(entry => entry.item.id)).toEqual(['unknown', 'unbound']);
        expect(result.items[0].source).toBeUndefined();
        expect(result.diagnostics.filter(d => d.code === 'duplicate-id')).toHaveLength(2);
        expect(result.diagnostics.some(d => d.code === 'unknown-source')).toBe(true);
    });
    it('aggregates unknown-source diagnostics into one stable entry while every affected item stays visible', () => {
        const unbound = validateRecords(accepted({items: [item('a', {calendarId: 'x'}), item('b', {calendarId: 'y'}), item('c', {calendarId: 'x'}), item('d')]}), dates, 'Untitled');
        expect(unbound.visibleItems.map(entry => entry.item.id)).toEqual(['a', 'b', 'c', 'd']);
        expect(unbound.diagnostics).toEqual([{code: 'unknown-source', path: 'items[].calendarId', reason: 'No sources supplied; affected items remain visible with fallback appearance'}]);
        const fewer = validateRecords(accepted({items: [item('a', {calendarId: 'x'})]}), dates, 'Untitled');
        expect(fewer.diagnostics).toEqual(unbound.diagnostics);
        expect(validateRecords(accepted({sources: [{id: 'z', title: 'Z'}], items: [item('b', {calendarId: 'z'})]}), dates, 'Untitled').diagnostics).toEqual([]);
    });
    it('with sources names every unknown ID once, at the path of its first item, with a stable per-ID key', () => {
        const sources = [{id: 'z', title: 'Z'}];
        const mismatched = validateRecords(accepted({sources, items: [item('a', {calendarId: 'x'}), item('b', {calendarId: 'z'}), item('c', {calendarId: 'x'}), item('d', {calendarId: 'y "q"'})]}), dates, 'Untitled');
        expect(mismatched.visibleItems.map(entry => entry.item.id)).toEqual(['a', 'b', 'c', 'd']);
        expect(mismatched.diagnostics).toEqual([
            {code: 'unknown-source', path: 'items[0].calendarId', key: 'unknown-source:x', reason: 'No source with ID "x"; items with this calendarId remain visible with fallback appearance'},
            {code: 'unknown-source', path: 'items[3].calendarId', key: 'unknown-source:y "q"', reason: 'No source with ID "y \\"q\\""; items with this calendarId remain visible with fallback appearance'},
        ]);
        // A reordered feed moves the path but keeps the key, so a Calendar reports the ID once; a new ID is reported too.
        const later = validateRecords(accepted({sources, items: [item('e', {calendarId: 'w'}), item('a', {calendarId: 'x'})]}), dates, 'Untitled');
        expect(later.diagnostics.map(d => [d.path, d.key])).toEqual([['items[0].calendarId', 'unknown-source:w'], ['items[1].calendarId', 'unknown-source:x']]);
        // An empty sources array is still a sources prop: no aggregate entry.
        expect(validateRecords(accepted({sources: [], items: [item('a', {calendarId: 'x'})]}), dates, 'Untitled').diagnostics.map(d => d.path)).toEqual(['items[0].calendarId']);
    });
    it('normalizes accepted filter IDs in source order without optimistic toggles or notifications', () => {
        const callback = vi.fn();
        const props = accepted({sources: [{id: 'a', title: 'A'}, {id: 'b', title: 'B'}, {id: 'c', title: 'C'}],
            items: [item('a', {calendarId: 'a'}), item('b', {calendarId: 'b'}), item('c', {calendarId: 'c'})],
            visibleSourceIds: ['b', 'unknown', 'a', 'b', null], onVisibleSourceIdsChange: callback, showSourceSelector: false,
        });
        const result = validateRecords(props, dates, 'Untitled');
        expect(result.visibleSourceIds).toEqual(['a', 'b']);
        expect(result.visibleItems.map(entry => entry.item.id)).toEqual(['a', 'b']);
        expect(callback).not.toHaveBeenCalled();
        expect(props.visibleSourceIds).toEqual(['b', 'unknown', 'a', 'b', null]);
        const uncontrolled = validateRecords(accepted({sources: props.sources, items: props.items}), dates, 'Untitled');
        expect(uncontrolled.visibleSourceIds).toBeUndefined();
        expect(uncontrolled.visibleItems).toHaveLength(3);
        const reenabled = validateRecords({...props, visibleSourceIds: ['c']}, dates, 'Untitled');
        expect(reenabled.visibleItems.map(entry => entry.item.id)).toEqual(['c']);
    });
    it('keeps original references, exact IDs, whitespace and cyclic payloads without deep reads or writes', () => {
        const cyclic: {self?: unknown} = {}; cyclic.self = cyclic; Object.freeze(cyclic);
        const original = Object.freeze({...item(' id '), title: '  title  ', data: cyclic, interval: Object.freeze(interval)});
        const blank = Object.freeze({...item('blank'), title: '  '});
        const result = validateRecords(accepted({items: Object.freeze([original, blank, item('id')])}), dates, 'Без названия');
        expect(result.items.map(entry => entry.item.id)).toEqual([' id ', 'blank', 'id']);
        expect(result.items[0].item).toBe(original);
        expect(result.items[0].item.data).toBe(cyclic);
        expect(result.items[0].title).toBe('  title  ');
        expect(result.items[1].title).toBe('Без названия');
        expect(blank.title).toBe('  ');
        expect(result.items[1].item).toBe(blank);
    });
    it('isolates malformed records and author zones without failing the configuration', () => {
        const props = accepted({items: [null, 42, item(''), item('bad-title', {title: 3}), item('bad-zone', {interval: {...interval, timeZone: 'Etc/UTC'}}), item('ok', {interval: {...interval, timeZone: 'Europe/Moscow'}})]});
        const result = validateRecords(props, dates, 'Untitled');
        expect(result.items.map(entry => entry.item.id)).toEqual(['ok']);
        expect(result.diagnostics).toHaveLength(5);
    });
    it('returns identical acceptance and diagnostics in production and development, without logging', () => {
        const props = accepted({items: [item('one'), item('one'), item('ok', {title: ''})]});
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const error = vi.spyOn(console, 'error').mockImplementation(() => {});
        try {
            vi.stubEnv('NODE_ENV', 'development'); const dev = validateRecords(props, dates, 'Untitled');
            vi.stubEnv('NODE_ENV', 'production'); const prod = validateRecords(props, dates, 'Untitled');
            expect(dev).toEqual(prod); expect(warn).not.toHaveBeenCalled(); expect(error).not.toHaveBeenCalled();
        } finally { vi.unstubAllEnvs(); warn.mockRestore(); error.mockRestore(); }
    });
});

describe('action and move-state snapshot isolation', () => {
    it('rejects all duplicate actions and invalid labels without calling an action provider', () => {
        const keep = Object.freeze({id: 'keep', label: ' Keep ', tone: 'danger'} as const);
        const result = validateActions([keep, {id: 'dup', label: 'First'}, {id: 'dup', label: ''}, {id: 'blank', label: ' '}, {id: 'bad', label: 'Bad', tone: 'disabled'}]);
        expect(result.actions).toEqual([keep]); expect(result.actions[0]).toBe(keep);
        expect(result.diagnostics.map(d => d.code)).toEqual(['duplicate-id', 'duplicate-id', 'invalid-record', 'invalid-record']);
        expect(validateActions(null).actions).toEqual([]);
    });
    it('preserves collision pending records with different IDs, isolates duplicates and issuer mismatches', () => {
        const first = Object.freeze({requestId: 'one', itemId: 'item', status: 'pending'} as const);
        const second = Object.freeze({requestId: 'two', itemId: 'item', status: 'pending'} as const);
        const result = validateMoveStates([first, second,
            {requestId: 'dup', itemId: 'item', status: 'pending'}, {requestId: 'dup', itemId: 'item', status: 'wat'},
            {requestId: 'local', itemId: 'other', status: 'succeeded'}, {requestId: 'reject', itemId: 'item', status: 'rejected', reason: ' '},
            {requestId: ' ', itemId: 'item', status: 'pending'},
        ], new Map([['local', 'item']]));
        expect(result.states).toEqual([first, second]); expect(result.states[0]).toBe(first);
        expect(result.diagnostics.filter(d => d.code === 'duplicate-id')).toHaveLength(2);
        expect(result.diagnostics.filter(d => d.code === 'invalid-record')).toHaveLength(3);
        expect(validateMoveStates([{requestId: 'new', itemId: 'item', status: 'rejected', reason: 'Denied'}]).states).toHaveLength(1);
    });
});
