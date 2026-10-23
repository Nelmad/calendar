// @vitest-environment node
import {describe, expect, it} from 'vitest';
import {gridKeyTarget, hitDate, rowLaneCapacity} from '../month.js';

describe('Month navigation and geometry kernels', () => {
    it.each([
        ['ArrowLeft', 'ltr', '2026-03-03'], ['ArrowRight', 'ltr', '2026-03-05'],
        ['ArrowLeft', 'rtl', '2026-03-05'], ['ArrowRight', 'rtl', '2026-03-03'],
        ['ArrowUp', 'ltr', '2026-02-25'], ['ArrowDown', 'rtl', '2026-03-11'],
        ['Home', 'rtl', '2026-03-01'], ['End', 'rtl', '2026-03-07'],
    ] as const)('%s/%s follows calendar dates', (key, dir, target) => {
        expect(gridKeyTarget('2026-03-04', 3, key, dir)).toBe(target);
    });
    it('bounds arithmetic and ignores unrelated keys', () => {
        expect(gridKeyTarget('0001-01-01', 0, 'ArrowLeft', 'ltr')).toBeNull();
        expect(gridKeyTarget('9999-12-31', 6, 'ArrowDown', 'ltr')).toBeNull();
        expect(gridKeyTarget('2026-03-01', 0, 'Tab', 'ltr')).toBeNull();
    });
    it('fits only whole lanes and reserves overflow chrome', () => {
        const metrics = {height: 120, width: 700, header: 32, item: 24, overflow: 24, gap: 4};
        expect(rowLaneCapacity(metrics)).toEqual({withoutOverflow: 3, withOverflow: 2});
        expect(rowLaneCapacity({...metrics, height: 91.9})).toEqual({withoutOverflow: 1, withOverflow: 0});
        expect(rowLaneCapacity({...metrics, height: 92})).toEqual({withoutOverflow: 2, withOverflow: 1});
        for (const height of [0, -1, NaN, Infinity]) expect(rowLaneCapacity({...metrics, height})).toEqual({withoutOverflow: 0, withOverflow: 0});
        expect(rowLaneCapacity({...metrics, width: 0})).toEqual({withoutOverflow: 0, withOverflow: 0});
        expect(rowLaneCapacity(undefined)).toEqual({withoutOverflow: 0, withOverflow: 0});
    });
    it('hit-tests actual column boxes in either direction and respects clipped segment bounds', () => {
        const columns = [{date: '2026-03-01', left: 200, right: 300}, {date: '2026-03-02', left: 100, right: 200}, {date: '2026-03-03', left: 0, right: 100}];
        const range = {start: '2026-03-01', end: '2026-03-03'};
        expect(hitDate(150, columns, range)).toBe('2026-03-02'); expect(hitDate(200, columns, range)).toBe('2026-03-01');
        expect(hitDate(50, columns, range)).toBeUndefined(); expect(hitDate(300, columns, range)).toBeUndefined();
    });
});
