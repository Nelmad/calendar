import {Profiler, Suspense, lazy, type ReactNode} from 'react';
import {hydrateRoot} from 'react-dom/client';
import {renderToString} from 'react-dom/server';
import {act} from '@testing-library/react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {Calendar, type CalendarProps} from '../../../index.js';

// QA-01: a Calendar hydrated inside a separately hydrated Suspense boundary must settle to idle.
const items = [{id: 'a', title: 'Alpha', data: {}, interval: {kind: 'allDay' as const, start: '2026-09-03', end: '2026-09-04'}}];
const input = (): CalendarProps => ({items, timeZone: 'UTC', locale: 'en-US', today: '2026-09-03', anchorDate: '2026-09-01', onNavigate() {}});
const tick = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// jsdom has no layout boxes: a connected root has one, as in a browser.
beforeEach(() => { vi.spyOn(Element.prototype, 'getClientRects').mockImplementation(function (this: Element) { return (this.isConnected ? [{}] : []) as unknown as DOMRectList; }); });
afterEach(() => { vi.restoreAllMocks(); document.body.innerHTML = ''; });
describe('hydration inside a Suspense boundary (QA-01, §11.3)', () => {
    it.each(['auto', 'desktop'] as const)('settles to idle with layout=%s and a suspending sibling', async layout => {
        // The sibling renders on the server but suspends on the client, so the boundary hydrates on its own.
        let resolve!: () => void;
        const ready = new Promise<void>(done => { resolve = done; });
        const Slow = lazy(async () => { await ready; return {default: () => <span>loaded</span>}; });
        let commits = 0;
        const props = {...input(), ...(layout === 'desktop' ? {layout} : {}), style: {width: 900}};
        const app = (sibling: ReactNode) => <Profiler id="calendar" onRender={() => { commits++; }}>
            <Suspense fallback={<p>loading</p>}>{sibling}<Calendar {...props}/></Suspense></Profiler>;
        const errors: unknown[] = [];
        vi.spyOn(console, 'error').mockImplementation(value => { errors.push(value); });
        const container = document.createElement('div');
        container.innerHTML = renderToString(app(<span>loaded</span>)); document.body.append(container);
        // jsdom is a DOM-like server host: React 18 logs its documented useLayoutEffect SSR notice there (V1-06).
        errors.length = 0;
        const root = hydrateRoot(container, app(<Slow/>), {onRecoverableError: value => errors.push(value)});
        try {
            await tick(20); resolve();
            // A looping tree commits continuously and never reaches a quiet window; an idle one settles.
            let quiet = 0;
            for (let spent = 0; spent < 3000 && quiet < 300; spent += 50) {
                const before = commits;
                await tick(50);
                quiet = commits === before ? quiet + 50 : 0;
            }
            expect(quiet).toBe(300);
            expect(errors).toEqual([]);
            expect(container.querySelector('.nc-calendar')).toHaveAttribute('data-layout', 'desktop');
            expect(container.textContent).toContain('loaded');
        } finally {
            await act(async () => root.unmount());
        }
    });
});
