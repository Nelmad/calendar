// @vitest-environment node
import {renderToString} from 'react-dom/server';
import {describe, expect, it, vi} from 'vitest';
import {Fixture, fixtureProps} from './fixture.js';
import type {CalendarProps} from '../../reference.js';

describe('controller SSR purity', () => {
    it.each(['layout', 'density', 'colorScheme', 'dataState'])('renders deterministic safe shell for invalid %s', prop => {
        const notification = vi.fn();
        const input = {...fixtureProps(), [prop]: 'invalid', onVisibleRangeChange: notification} as CalendarProps;
        const html = renderToString(<Fixture input={input}/>);
        expect(renderToString(<Fixture input={input}/>)).toBe(html);
        for (const attribute of ['data-theme="classic"', 'data-layout="mobile"', 'data-density="compact"', 'data-color-scheme="system"', 'data-status="error"']) expect(html).toContain(attribute);
        expect(html).not.toContain('data-loading-phase'); expect(html).not.toContain('role="grid"'); expect(html).not.toContain('<button');
        expect(notification).not.toHaveBeenCalled();
    });
    it.each([true, false])('renders without clock reads or callbacks, snapshot=%s', snapshot => {
        const callback = vi.fn(), now = vi.spyOn(Date, 'now').mockImplementation(() => { throw new Error('Clock read during SSR'); });
        try {
            const {today: _today, ...props} = fixtureProps();
            const input = {...props, ...(snapshot ? {today: '2026-01-17'} : {}), onNavigate: callback, onVisibleRangeChange: callback, 'aria-labelledby': 'unvalidated'};
            const html = renderToString(<Fixture input={input}/>);
            expect(renderToString(<Fixture input={input}/>)).toBe(html);
            expect(html).not.toContain('aria-labelledby="unvalidated"'); expect(html).toContain('aria-label="Calendar"');
            expect(html).toContain(snapshot ? '>2026-01-17</span>' : '>unknown</span>');
            expect(callback).not.toHaveBeenCalled(); expect(now).not.toHaveBeenCalled();
        } finally { now.mockRestore(); }
    });
});
