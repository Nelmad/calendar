// @vitest-environment node
import {renderToString} from 'react-dom/server';
import {describe, expect, it, vi} from 'vitest';
import {Fixture, fixtureProps} from './fixture.js';
import type {CalendarProps} from '../../reference.js';
import {Calendar, type CalendarProps as PublicProps} from '../../../index.js';

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

// Issue #20: the internal pre-size marker of the view, on the server render of a default `auto` calendar only.
describe('unmeasured auto layout marker on the server', () => {
    const view = (html: string) => /<div class="nc-calendar-view"[^>]*>/.exec(html)?.[0] ?? '';
    const props = {...fixtureProps(), anchorDate: '2026-03-01', items: [{id: 'a', title: 'Alpha', data: {}, interval: {kind: 'allDay' as const, start: '2026-03-04', end: '2026-03-05'}}]};
    const server = (extra: object) => renderToString(<Calendar {...{...props, ...extra} as PublicProps}/>);
    it.each([{}, {layout: 'auto'}, {mobileBreakpoint: 640}, {layout: 'auto', mobileBreakpoint: 640}])('marks the view of auto with the default breakpoint (%o)', extra => {
        const html = server(extra);
        expect(view(html)).toContain('data-unmeasured="true"');
        expect(html.match(/data-unmeasured/g)).toHaveLength(1);
        expect(html).toContain('data-layout="mobile"'); expect(html).toContain('data-presentation="inline"');
        expect(server(extra)).toBe(html);
    });
    it.each([{layout: 'mobile'}, {layout: 'desktop'}, {mobileBreakpoint: 900}, {mobileBreakpoint: 639}, {layout: 'auto', mobileBreakpoint: 641}])('leaves forced layouts and a custom breakpoint unmarked (%o)', extra => {
        const html = server(extra);
        expect(view(html)).not.toBe(''); expect(html).not.toContain('data-unmeasured');
    });
    it('marks no view while a blocking status replaces it, and no contract shell', () => {
        expect(server({dataState: {status: 'loading', phase: 'initial'}})).not.toContain('data-unmeasured');
        expect(server({timeZone: 'Mars/Olympus_Mons'})).not.toContain('data-unmeasured');
    });
});
