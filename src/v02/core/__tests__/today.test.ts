// @vitest-environment node
import {describe, expect, it} from 'vitest';
import {todaySnapshot} from '../today.js';
import {parseRFC3339} from '../date.js';

describe('first date-change instant', () => {
    it.each([
        ['UTC', '2026-09-17T12:00:00Z', '2026-09-17', '2026-09-18T00:00:00Z'],
        ['Europe/Berlin', '2026-03-28T23:00:00Z', '2026-03-29', '2026-03-29T22:00:00Z'],
        ['Europe/Berlin', '2026-10-24T22:00:00Z', '2026-10-25', '2026-10-25T23:00:00Z'],
        ['Pacific/Apia', '2011-12-30T09:59:59Z', '2011-12-29', '2011-12-30T10:00:00Z'],
        ['Africa/Monrovia', '1972-01-07T00:44:29Z', '1972-01-06', '1972-01-07T00:44:30Z'],
    ])('%s: %s', (zone, now, date, boundary) => {
        const result = todaySnapshot(parseRFC3339(now), zone);
        expect(result).toEqual({date, nextBoundary: parseRFC3339(boundary)});
        expect(todaySnapshot(result.nextBoundary - 1, zone).date).toBe(date);
        expect(todaySnapshot(result.nextBoundary, zone).date).not.toBe(date);
    });
});
