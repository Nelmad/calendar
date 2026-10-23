// @vitest-environment node
import {afterEach, describe, expect, it, vi} from 'vitest';
import type {CalendarTheme} from '../../reference.js';
import {createDateAdapter} from '../date.js';
import {acceptedTimeZoneIdentifiers} from '../timeZones.generated.js';
import {validateCalendarInput} from '../validation.js';

afterEach(() => vi.restoreAllMocks());

describe('package timezone candidate', () => {
    it('accepts the whole frozen package list without any host Intl calls', () => {
        const host = vi.spyOn(Intl, 'DateTimeFormat').mockImplementation(() => { throw new Error('Must not enumerate the host'); });
        const dates = createDateAdapter();
        expect(Object.isFrozen(acceptedTimeZoneIdentifiers)).toBe(true);
        expect(() => (acceptedTimeZoneIdentifiers as string[]).push('Host/Only')).toThrow(TypeError);
        for (const id of acceptedTimeZoneIdentifiers) expect(dates.validateTimeZone(id)).toBe(id);
        expect(host).not.toHaveBeenCalled();
    });
    it.each(['', 'europe/berlin', 'UTC\n', ' UTC', 'Etc/UTC', 'Etc/GMT', 'GMT', 'US/Eastern', 'Europe/Kiev', 'Factory', '+03:00', 'EST5EDT,M3.2.0,M11.1.0', 'Host/Only', null, 1])('rejects %j even if the host could use it', value => {
        expect(() => createDateAdapter().validateTimeZone(value)).toThrow(RangeError);
    });
    it('retains a primary Link verbatim even when Intl resolves it to another name', () => {
        const dates = createDateAdapter();
        expect(dates.validateTimeZone('Europe/Bratislava')).toBe('Europe/Bratislava');
        expect(dates.parseInterval({kind: 'timed', start: '2026-09-08T12:00:00Z', timeZone: 'Europe/Bratislava'})).toMatchObject({timeZone: 'Europe/Bratislava'});
    });
    it('applies the same membership to fatal configuration and recoverable item validation', () => {
        const services = {dates: createDateAdapter(), isTheme: (_value: unknown): _value is CalendarTheme => false};
        const props = {anchorDate: '2026-09-01', timeZone: 'UTC', onNavigate: vi.fn(), items: [
            {id: 'good', title: 'Good', interval: {kind: 'timed', start: '2026-09-08T12:00:00Z', timeZone: 'Europe/Bratislava'}, data: null},
            {id: 'alias', title: 'Alias', interval: {kind: 'timed', start: '2026-09-08T12:00:00Z', timeZone: 'US/Eastern'}, data: null},
        ]};
        expect(validateCalendarInput({...props, timeZone: 'US/Eastern'}, services, 'Untitled').kind).toBe('contract');
        const result = validateCalendarInput(props, services, 'Untitled');
        expect(result.kind).toBe('data');
        if (result.kind === 'data') expect(result.records.visibleItems.map(record => record.item.id)).toEqual(['good']);
        expect(props.onNavigate).not.toHaveBeenCalled();
    });
});
