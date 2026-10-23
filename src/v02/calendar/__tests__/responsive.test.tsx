import {StrictMode, useState} from 'react';
import {hydrateRoot} from 'react-dom/client';
import {renderToString} from 'react-dom/server';
import {act, fireEvent, render, screen, within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {Calendar, type CalendarProps} from '../../../index.js';
import type {CalendarProps as ReferenceProps} from '../../reference.js';
import {CalendarMonth} from '../CalendarMonth.js';

// T15: container-based auto layout and the single agenda presentation lifecycle (R38, R45, R46, R54, R56).
class FakeObserver {
    static active = new Set<FakeObserver>();
    static created = 0;
    readonly targets = new Set<Element>();
    constructor(readonly callback: ResizeObserverCallback) { FakeObserver.created++; FakeObserver.active.add(this); }
    observe(target: Element) { this.targets.add(target); }
    unobserve(target: Element) { this.targets.delete(target); }
    disconnect() { this.targets.clear(); FakeObserver.active.delete(this); }
}
const items = [{id: 'a', title: 'Alpha', data: {}, interval: {kind: 'allDay' as const, start: '2026-03-01', end: '2026-03-10'}},
    {id: 'b', title: 'Beta', data: {}, interval: {kind: 'timed' as const, start: '2026-03-04T10:00:00Z'}}];
const input = (): CalendarProps => ({items, anchorDate: '2026-03-01', today: '2026-03-04', timeZone: 'UTC', locale: 'en-US', onNavigate() {}, onItemPress() {}});
const root = () => document.querySelector<HTMLElement>('.nc-calendar')!;
// Hidden too: under a modal sheet jsdom (no `inert`) gets React Aria's aria-hidden fallback.
const cell = (date = '2026-03-04') => screen.getAllByRole('gridcell', {hidden: true}).find(node => node.dataset.date === date)!;
const rootObservers = () => [...FakeObserver.active].filter(observer => observer.targets.has(root()));
/** Simulates the browser: the root content box changes, then its observer reports it. */
function resize(width: number) {
    act(() => {
        root().style.width = `${width}px`;
        for (const observer of rootObservers()) observer.callback([{target: root(), contentRect: {width}} as unknown as ResizeObserverEntry], observer as unknown as ResizeObserver);
    });
}
const agendas = () => document.querySelectorAll('[data-presentation]');
// Every polite endpoint, including the sheet's own modal endpoint (§12.4), is empty.
const silent = () => screen.getAllByRole('status', {hidden: true}).every(node => node.textContent === '');
const dialogs = () => screen.queryAllByRole('dialog');
const focused = () => ({item: document.activeElement?.closest<HTMLElement>('[data-item-id]')?.dataset.itemId, date: (document.activeElement as HTMLElement | null)?.dataset.date,
    presentation: document.activeElement?.closest<HTMLElement>('[data-presentation]')?.dataset.presentation, tag: document.activeElement?.tagName});
async function enter(user: ReturnType<typeof userEvent.setup>, date = '2026-03-04') { act(() => cell(date).focus()); await user.keyboard('{Enter}'); }
/** jsdom has no layout: like a browser, only a connected element without a display:none ancestor-or-self has a box. */
function hasBox(element: Element) {
    for (let node: Element | null = element; node; node = node.parentElement) if (node.ownerDocument.defaultView!.getComputedStyle(node).display === 'none') return false;
    return element.isConnected;
}
beforeEach(() => {
    FakeObserver.created = 0; FakeObserver.active.clear(); vi.stubGlobal('ResizeObserver', FakeObserver);
    vi.spyOn(Element.prototype, 'getClientRects').mockImplementation(function (this: Element) { return (hasBox(this) ? [{}] : []) as unknown as DOMRectList; });
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
/** Reports a content box to the root observer without touching the (specified) style, as Chrome does for a hidden root. */
const observe = (width: number) => act(() => { for (const observer of rootObservers()) observer.callback([{target: root(), contentRect: {width}} as unknown as ResizeObserverEntry], observer as unknown as ResizeObserver); });

describe('container-based auto layout (§7, R54)', () => {
    it.each([[639, 'mobile'], [639.5, 'mobile'], [640, 'desktop'], [1024, 'desktop']] as const)('resolves %s px of root content width to %s before paint', (width, layout) => {
        render(<Calendar {...input()} style={{width}}/>);
        expect(root()).toHaveAttribute('data-layout', layout);
        expect(cell().querySelector(layout === 'mobile' ? '.nc-day-indicator' : '.nc-overflow')).not.toBeNull();
    });
    it('uses the content box: padding and border are excluded at the boundary', () => {
        render(<Calendar {...input()} style={{width: 672, padding: 16, boxSizing: 'border-box'}}/>);
        expect(root()).toHaveAttribute('data-layout', 'desktop');
        resize(639.75); expect(root()).toHaveAttribute('data-layout', 'mobile');
    });
    it('honors mobileBreakpoint, including runtime changes, with the same exclusive bound', () => {
        const view = render(<Calendar {...input()} style={{width: 520}} mobileBreakpoint={520}/>);
        expect(root()).toHaveAttribute('data-layout', 'desktop');
        view.rerender(<Calendar {...input()} style={{width: 520}} mobileBreakpoint={521}/>);
        expect(root()).toHaveAttribute('data-layout', 'mobile');
    });
    it('follows observed width across the boundary; zero or unmeasurable widths keep the last valid resolution', () => {
        render(<Calendar {...input()} style={{width: 700}}/>);
        resize(639); expect(root()).toHaveAttribute('data-layout', 'mobile');
        resize(640); expect(root()).toHaveAttribute('data-layout', 'desktop');
        resize(0); expect(root()).toHaveAttribute('data-layout', 'desktop');
        resize(Number.NaN); expect(root()).toHaveAttribute('data-layout', 'desktop');
    });
    it('stays mobile while the root is not measurable yet', () => {
        render(<Calendar {...input()} style={{display: 'none'}}/>);
        expect(root()).toHaveAttribute('data-layout', 'mobile');
        resize(800); expect(root()).toHaveAttribute('data-layout', 'desktop');
    });
    it('forced layouts never observe width; auto owns exactly one root observer, also in StrictMode, and none after unmount', () => {
        const view = render(<StrictMode><Calendar {...input()} layout="desktop" style={{width: 300}}/></StrictMode>);
        expect(root()).toHaveAttribute('data-layout', 'desktop'); expect(rootObservers()).toHaveLength(0);
        view.rerender(<StrictMode><Calendar {...input()} layout="mobile" style={{width: 1200}}/></StrictMode>);
        expect(root()).toHaveAttribute('data-layout', 'mobile'); expect(rootObservers()).toHaveLength(0);
        view.rerender(<StrictMode><Calendar {...input()} style={{width: 1200}}/></StrictMode>);
        expect(root()).toHaveAttribute('data-layout', 'desktop'); expect(rootObservers()).toHaveLength(1);
        view.unmount(); expect(FakeObserver.active.size).toBe(0);
    });
    it('a contract shell observes nothing', () => {
        render(<CalendarMonth {...input()} timeZone="Mars/Olympus_Mons"/>);
        expect(rootObservers()).toHaveLength(0); expect(root()).toHaveAttribute('data-layout', 'mobile');
    });
    // A root without a layout box reports its specified width ('900px', '50em', '100%') through
    // getComputedStyle; that is not a measurement (T15-V1-01).
    it('a display:none ancestor at mount stays mobile despite an explicit root width, until a valid measurement', () => {
        const view = render(<div style={{display: 'none'}}><Calendar {...input()} style={{width: 900}}/></div>);
        expect(root()).toHaveAttribute('data-layout', 'mobile'); expect(root().querySelector('.nc-overflow')).toBeNull();
        observe(0); expect(root()).toHaveAttribute('data-layout', 'mobile');
        view.rerender(<div><Calendar {...input()} style={{width: 900}}/></div>); observe(900);
        expect(root()).toHaveAttribute('data-layout', 'desktop');
    });
    it('a breakpoint change while hidden re-evaluates the last valid width, not the specified one', () => {
        const page = (display: string, mobileBreakpoint?: number) => <div style={{display}}><Calendar {...input()} style={{width: '100%'}} mobileBreakpoint={mobileBreakpoint}/></div>;
        const view = render(page('block')); observe(1000);
        expect(root()).toHaveAttribute('data-layout', 'desktop');
        view.rerender(page('none')); observe(0); expect(root()).toHaveAttribute('data-layout', 'desktop');
        view.rerender(page('none', 700)); expect(root()).toHaveAttribute('data-layout', 'desktop'); expect(agendas()).toHaveLength(0);
        view.rerender(page('none', 1200)); expect(root()).toHaveAttribute('data-layout', 'mobile');
        view.rerender(page('block', 1200)); observe(1000); expect(root()).toHaveAttribute('data-layout', 'mobile');
        view.rerender(page('block', 700)); expect(root()).toHaveAttribute('data-layout', 'desktop');
    });
    it('a contract round trip while hidden keeps the last valid width deciding against the new breakpoint (T15-V2-03)', () => {
        const page = (display: string, mobileBreakpoint?: number) => <div style={{display}}><CalendarMonth {...input()} style={{width: '100%'}} mobileBreakpoint={mobileBreakpoint}/></div>;
        const view = render(page('block')); observe(1000); expect(root()).toHaveAttribute('data-layout', 'desktop');
        view.rerender(page('none')); observe(0);
        view.rerender(page('none', 0)); expect(screen.queryByRole('grid')).toBeNull(); expect(rootObservers()).toHaveLength(0);
        view.rerender(page('none', 1200)); expect(root()).toHaveAttribute('data-layout', 'mobile');
        view.rerender(page('none', 700)); expect(root()).toHaveAttribute('data-layout', 'desktop');
        // A forced layout still drops the width: back to auto while hidden is mobile until measured.
        view.rerender(<div style={{display: 'none'}}><CalendarMonth {...input()} layout="mobile"/></div>);
        view.rerender(page('none', 700)); expect(root()).toHaveAttribute('data-layout', 'mobile');
    });
    it('hydrates a hidden server render of auto with an explicit width as mobile', async () => {
        const props = {...input(), style: {width: 900}};
        const html = renderToString(<Calendar {...props}/>);
        const container = document.createElement('div'); container.style.display = 'none'; container.innerHTML = html; document.body.append(container);
        const errors: unknown[] = [], error = vi.spyOn(console, 'error').mockImplementation(value => { errors.push(value); });
        try {
            await act(async () => { hydrateRoot(container, <Calendar {...props}/>, {onRecoverableError: value => errors.push(value)}); });
            expect(errors).toEqual([]); expect(container.querySelector('.nc-calendar')).toHaveAttribute('data-layout', 'mobile');
        } finally { error.mockRestore(); container.remove(); }
    });
    it('a runtime forced → auto switch of an unmeasurable root drops the carried layout to mobile (T15-V1-03)', () => {
        const page = (display: string, layout?: 'desktop') => <div style={{display}}><Calendar {...input()} layout={layout} style={{width: 900}}/></div>;
        const view = render(page('none', 'desktop')); expect(root()).toHaveAttribute('data-layout', 'desktop');
        view.rerender(page('none')); expect(root()).toHaveAttribute('data-layout', 'mobile');
        view.rerender(page('block')); observe(900); expect(root()).toHaveAttribute('data-layout', 'desktop');
    });
    it('a runtime forced → auto switch keeps the forced presentation until the measurement commits', () => {
        const view = render(<Calendar {...input()} layout="desktop" style={{width: 900}}/>);
        const grid = screen.getByRole('grid');
        view.rerender(<Calendar {...input()} style={{width: 900}}/>);
        expect(root()).toHaveAttribute('data-layout', 'desktop'); expect(screen.getByRole('grid')).toBe(grid);
    });
    it('hydrates a server mobile render of auto without mismatch, then measures the container', async () => {
        const props = {...input(), style: {width: 900}};
        const html = renderToString(<StrictMode><Calendar {...props}/></StrictMode>);
        expect(html).toContain('data-layout="mobile"'); expect(html).not.toContain('nc-overflow');
        const container = document.createElement('div'); container.innerHTML = html; document.body.append(container);
        const errors: unknown[] = [], error = vi.spyOn(console, 'error').mockImplementation(value => { errors.push(value); });
        try {
            await act(async () => { hydrateRoot(container, <StrictMode><Calendar {...props}/></StrictMode>, {onRecoverableError: value => errors.push(value)}); });
            expect(errors).toEqual([]);
            expect(container.querySelector('.nc-calendar')).toHaveAttribute('data-layout', 'desktop');
        } finally { error.mockRestore(); container.remove(); }
    });
    it.each([[320, 'mobile'], [900, 'desktop']] as const)('auto + overlay (spec v7 §11.3): server and first client render have no agenda; at %s px (%s) none opens before activation', async (width, layout) => {
        const props = {...input(), agendaPresentation: 'overlay' as const, style: {width}};
        const html = renderToString(<StrictMode><Calendar {...props}/></StrictMode>);
        expect(html).toContain('data-layout="mobile"'); expect(html).not.toContain('data-presentation='); expect(html).not.toContain('role="dialog"');
        const container = document.createElement('div'); container.innerHTML = html; document.body.append(container);
        const errors: unknown[] = [], error = vi.spyOn(console, 'error').mockImplementation(value => { errors.push(value); });
        let hydrated: ReturnType<typeof hydrateRoot> | undefined;
        try {
            await act(async () => { hydrated = hydrateRoot(container, <StrictMode><Calendar {...props}/></StrictMode>, {onRecoverableError: value => errors.push(value)}); });
            expect(errors).toEqual([]); expect(container.querySelector('.nc-calendar')).toHaveAttribute('data-layout', layout);
            expect(agendas()).toHaveLength(0); expect(dialogs()).toHaveLength(0);
            await userEvent.setup().click(cell());
            expect(container.ownerDocument.querySelector('[data-presentation]')).toHaveAttribute('data-presentation', layout === 'mobile' ? 'sheet' : 'popover');
        } finally { act(() => hydrated?.unmount()); error.mockRestore(); container.remove(); }
    });
});

describe('auto layout loop guard (QA-04)', () => {
    /** A page whose scrollbar exists only while the taller desktop month is shown: content box = viewport − 15 px. */
    function scrollbarPage(viewport: {width: number}) {
        const widthOf = (element: HTMLElement) => viewport.width - (element.dataset.layout === 'desktop' ? 15 : 0);
        const real = window.getComputedStyle.bind(window);
        vi.spyOn(window, 'getComputedStyle').mockImplementation((element, pseudo) => {
            const style = real(element, pseudo);
            if (!(element instanceof HTMLElement) || !element.classList.contains('nc-calendar') || pseudo) return style;
            return new Proxy(style, {get: (target, key) => {
                if (key === 'width') return `${widthOf(element)}px`;
                const value: unknown = Reflect.get(target, key, target);
                return typeof value === 'function' ? value.bind(target) : value;
            }});
        });
        // Every committed data-layout value, including ones replaced within the same act().
        const layouts: string[] = [], mutations = new MutationObserver(() => undefined);
        const sync = () => {
            const records = mutations.takeRecords();
            records.forEach((record, index) => layouts.push(index + 1 < records.length ? records[index + 1].oldValue! : root().dataset.layout!));
        };
        // Like a browser: after each commit the observer reports the content box of the layout now shown.
        const frames = (count: number) => { for (let index = 0; index < count; index++) { observe(widthOf(root())); sync(); } };
        return {layouts, frames, start: () => {
            layouts.push(root().dataset.layout!); mutations.observe(root(), {attributes: true, attributeOldValue: true, attributeFilter: ['data-layout']});
        }, stop: () => mutations.disconnect()};
    }
    it('hydration-time feedback switches once and holds: no mobile/desktop oscillation', () => {
        const viewport = {width: 645}, page = scrollbarPage(viewport);
        render(<Calendar {...input()}/>); page.start();
        page.frames(20);
        expect(page.layouts).toEqual(['desktop']); expect(root()).toHaveAttribute('data-layout', 'desktop');
        page.stop();
    });
    it('a resize into the feedback band switches once; widths outside the band follow the exact boundary', () => {
        const viewport = {width: 900}, page = scrollbarPage(viewport);
        render(<Calendar {...input()}/>); page.start();
        viewport.width = 645; page.frames(20);
        expect(page.layouts).toEqual(['desktop', 'mobile']);
        viewport.width = 900; page.frames(5);
        viewport.width = 654; page.frames(5); // 639 px with the desktop scrollbar: mobile; 654 px without it: desktop again
        expect(page.layouts).toEqual(['desktop', 'mobile', 'desktop', 'mobile']);
        viewport.width = 700; page.frames(5); viewport.width = 600; page.frames(5); viewport.width = 640; page.frames(5);
        expect(page.layouts).toEqual(['desktop', 'mobile', 'desktop', 'mobile', 'desktop', 'mobile', 'desktop']);
        page.stop();
    });
    it('1 px steps through the band switch once per crossing, also when the drag turns back inside it', () => {
        // Band: viewport 640-654 px, where desktop measures 625-639 px and mobile 640-654 px (neither fits its own width).
        const viewport = {width: 670}, page = scrollbarPage(viewport), steps: string[] = [];
        render(<Calendar {...input()}/>); page.start();
        const drag = (from: number, to: number) => {
            for (let width = from; width !== to; width += Math.sign(to - from)) {
                viewport.width = width; page.frames(3);
                const layout = root().dataset.layout!, content = viewport.width - (layout === 'desktop' ? 15 : 0);
                // Outside the band the layout shown fits the exact boundary of the width it produces itself.
                if (width < 640 || width >= 655) expect(layout, `${width}: ${content}`).toBe(content < 640 ? 'mobile' : 'desktop');
                steps.push(`${width}:${layout}`);
            }
        };
        drag(670, 619); expect(page.layouts).toEqual(['desktop', 'mobile']);
        expect(steps).toContain('655:desktop'); expect(steps).toContain('654:mobile'); expect(steps).toContain('640:mobile');
        drag(620, 671); expect(page.layouts).toEqual(['desktop', 'mobile', 'desktop']);
        expect(steps).toContain('639:mobile'); expect(steps).toContain('640:desktop'); expect(steps).toContain('654:desktop');
        drag(670, 644); drag(645, 671); // turns back at 645 inside the band
        expect(page.layouts).toEqual(['desktop', 'mobile', 'desktop', 'mobile', 'desktop']);
        expect(steps.slice(-26, -15)).toEqual(Array.from({length: 11}, (_, index) => `${645 + index}:${index < 10 ? 'mobile' : 'desktop'}`));
        page.frames(20); expect(page.layouts).toHaveLength(5);
        page.stop();
    });
    it('a held layout decides nothing inside its band; a breakpoint change re-evaluates exactly', () => {
        const viewport = {width: 645}, page = scrollbarPage(viewport);
        const view = render(<Calendar {...input()}/>); page.start();
        page.frames(3); expect(root()).toHaveAttribute('data-layout', 'desktop');
        view.rerender(<Calendar {...input()} mobileBreakpoint={500}/>); page.frames(3);
        expect(root()).toHaveAttribute('data-layout', 'desktop');
        view.rerender(<Calendar {...input()} mobileBreakpoint={700}/>); page.frames(3);
        expect(root()).toHaveAttribute('data-layout', 'mobile');
        page.stop();
    });
    // DEC-2-01 (spec v7 §7, decision 1): a change of `layout` or `mobileBreakpoint` forgets the learned band, even when the
    // width is still inside it. Breakpoints 500/700 above never put the width in the band; these cases do.
    it('a layout round trip at a width inside the learned band forgets the band and decides again', () => {
        const viewport = {width: 645}, page = scrollbarPage(viewport);
        const view = render(<Calendar {...input()}/>); page.start();
        page.frames(3); expect(root()).toHaveAttribute('data-layout', 'desktop'); // held: desktop measures 630 px
        view.rerender(<Calendar {...input()} layout="mobile"/>); page.frames(3);
        expect(root()).toHaveAttribute('data-layout', 'mobile');
        // Back to auto: the forced mobile measures 645 px, which is desktop; a stale band would keep the carried mobile.
        view.rerender(<Calendar {...input()} layout="auto"/>); page.frames(3);
        expect(root()).toHaveAttribute('data-layout', 'desktop');
        page.stop();
    });
    it('a breakpoint change whose band would still contain the width decides exactly against the new breakpoint', () => {
        const viewport = {width: 645}, page = scrollbarPage(viewport);
        const view = render(<Calendar {...input()}/>); page.start();
        page.frames(3); expect(root()).toHaveAttribute('data-layout', 'desktop');
        // 630 px is 14 px from 644, inside the old 15 px band: only a forgotten band lets 630 < 644 switch to mobile.
        view.rerender(<Calendar {...input()} mobileBreakpoint={644}/>); page.frames(3);
        expect(root()).toHaveAttribute('data-layout', 'mobile');
        page.stop();
    });
});

describe('passive presentation migration (§11.3, R38)', () => {
    it('focus inside the inline agenda follows a resize into exactly one popover on the same item', async () => {
        const user = userEvent.setup(); render(<Calendar {...input()} style={{width: 400}}/>);
        await user.click(cell()); await user.click(screen.getByRole('button', {name: /Beta/}));
        expect(focused()).toMatchObject({item: 'b', presentation: 'inline'});
        resize(800);
        expect(agendas()).toHaveLength(1); expect(dialogs()).toHaveLength(1); expect(dialogs()[0]).not.toHaveAttribute('aria-modal');
        expect(focused()).toMatchObject({item: 'b', presentation: 'popover'}); expect(cell()).toHaveAttribute('aria-expanded', 'true');
        resize(400);
        expect(dialogs()).toHaveLength(0); expect(focused()).toMatchObject({item: 'b', presentation: 'inline'});
        expect(cell()).not.toHaveAttribute('aria-haspopup');
    });
    it('external focus is never taken: inline → popover mounts no overlay; the grid cell keeps focus (R56)', async () => {
        const user = userEvent.setup(); render(<><Calendar {...input()} style={{width: 400}}/><button>After</button></>);
        await user.click(cell('2026-03-05'));
        resize(800); expect(dialogs()).toHaveLength(0); expect(cell('2026-03-05')).toHaveFocus();
        resize(400); await user.click(screen.getByRole('button', {name: /Alpha/})); await user.click(screen.getByRole('button', {name: 'After'}));
        resize(800); expect(dialogs()).toHaveLength(0); expect(screen.getByRole('button', {name: 'After'})).toHaveFocus();
        expect(agendas()).toHaveLength(0);
    });
    it('a press on a non-focusable area leaves the owning stack: no overlay opens on the next resize', async () => {
        const user = userEvent.setup(); render(<><Calendar {...input()} style={{width: 400}}/><p>Blank</p></>);
        await user.click(cell()); await user.click(screen.getByRole('button', {name: /Alpha/}));
        await user.pointer({keys: '[MouseLeft]', target: screen.getByText('Blank')}); act(() => (document.activeElement as HTMLElement).blur());
        resize(800); expect(dialogs()).toHaveLength(0);
    });
    it('a pointer gesture that does not move focus (touch scroll on the grid) keeps ownership: focus is not lost on resize', async () => {
        const user = userEvent.setup(); render(<Calendar {...input()} style={{width: 400}}/>);
        await user.click(cell()); await user.click(screen.getByRole('button', {name: /Beta/}));
        fireEvent.pointerDown(screen.getByRole('grid')); fireEvent.pointerCancel(screen.getByRole('grid'));
        resize(800);
        expect(dialogs()).toHaveLength(1); expect(focused()).toMatchObject({item: 'b', presentation: 'popover'});
    });
    it('focus on the agenda container itself migrates to the new container', async () => {
        render(<Calendar {...input()} style={{width: 400}}/>);
        act(() => screen.getByRole('region', {name: /Events for Mar 4/}).focus());
        resize(800);
        expect(screen.getByRole('dialog')).toHaveFocus();
        resize(400);
        expect(screen.getByRole('region', {name: /Events for Mar 4/})).toHaveFocus();
    });
    it('desktop auto ↔ overlay keeps the same popover node and focus', async () => {
        const user = userEvent.setup(), props = {...input(), layout: 'desktop' as const};
        const view = render(<CalendarMonth {...props}/>); await enter(user);
        const dialog = screen.getByRole('dialog'), active = document.activeElement;
        view.rerender(<CalendarMonth {...props} agendaPresentation="overlay"/>);
        expect(screen.getByRole('dialog')).toBe(dialog); expect(document.activeElement).toBe(active);
        view.rerender(<CalendarMonth {...props} agendaPresentation="auto"/>);
        expect(screen.getByRole('dialog')).toBe(dialog); expect(document.activeElement).toBe(active);
    });
    it('inline ↔ sheet ↔ popover keep the logical control and the accepted date, with modal effects cleaned up', async () => {
        const user = userEvent.setup(), props: ReferenceProps = {...input(), layout: 'mobile', agendaDate: '2026-03-04', onAgendaDateChange: vi.fn()};
        const view = render(<><CalendarMonth {...props}/><button>After</button></>);
        await user.click(screen.getByRole('button', {name: /Alpha/}));
        view.rerender(<><CalendarMonth {...props} agendaPresentation="overlay"/><button>After</button></>);
        const sheet = screen.getByRole('dialog'); expect(sheet).toHaveAttribute('aria-modal', 'true'); expect(sheet).toHaveAttribute('data-presentation', 'sheet');
        expect(focused()).toMatchObject({item: 'a', presentation: 'sheet'}); expect(screen.getByText('After').closest('[aria-hidden="true"], [inert]')).not.toBeNull();
        view.rerender(<><CalendarMonth {...props} layout="desktop" agendaPresentation="overlay"/><button>After</button></>);
        expect(screen.getByRole('dialog')).toHaveAttribute('data-presentation', 'popover'); expect(focused()).toMatchObject({item: 'a', presentation: 'popover'});
        expect(document.querySelectorAll('[aria-hidden="true"]:not(svg, .nc-overflow, .nc-day-header, .nc-month-probes, .nc-month-segments, .nc-icon-content), [inert]')).toHaveLength(0);
        view.rerender(<><CalendarMonth {...props} agendaPresentation="overlay"/><button>After</button></>);
        expect(focused()).toMatchObject({item: 'a', presentation: 'sheet'});
        view.rerender(<><CalendarMonth {...props}/><button>After</button></>);
        expect(dialogs()).toHaveLength(0); expect(focused()).toMatchObject({item: 'a', presentation: 'inline'});
        expect(screen.getByRole('region', {name: /Events for Mar 4/})).toHaveAttribute('data-date', '2026-03-04');
        expect(document.querySelectorAll('[inert], .nc-backdrop')).toHaveLength(0); expect(props.onAgendaDateChange).not.toHaveBeenCalled();
    });
    it('the heading and a missing control follow §12.3: heading migrates; a close control falls back to the date cell', async () => {
        const user = userEvent.setup(), props = {...input(), layout: 'desktop' as const};
        const view = render(<CalendarMonth {...props}/>); await enter(user);
        expect(screen.getByRole('button', {name: 'Close day agenda'})).toHaveFocus();
        view.rerender(<CalendarMonth {...props} layout="mobile"/>);
        expect(cell()).toHaveFocus(); expect(dialogs()).toHaveLength(0);
        act(() => screen.getByRole('heading', {level: 3}).focus());
        view.rerender(<CalendarMonth {...props} layout="mobile" agendaPresentation="overlay"/>);
        expect(screen.getByRole('heading', {level: 3})).toHaveFocus(); expect(screen.getByRole('dialog')).toHaveAttribute('aria-modal', 'true');
    });
    it('external focus during an overlay switch closes the old surface and mounts none until the next activation', async () => {
        const user = userEvent.setup(), props = {...input(), layout: 'desktop' as const};
        const view = render(<><CalendarMonth {...props}/><input aria-label="Notes"/></>); await enter(user);
        act(() => { window.dispatchEvent(new Event('blur')); });
        // The app moves focus programmatically while the popover is open (no pointer, no Tab).
        const notes = screen.getByRole('textbox', {name: 'Notes'}); act(() => notes.focus());
        view.rerender(<><CalendarMonth {...props} layout="mobile" agendaPresentation="overlay"/><input aria-label="Notes"/></>);
        expect(dialogs()).toHaveLength(0); expect(notes).toHaveFocus();
        await enter(user); expect(screen.getByRole('dialog')).toHaveAttribute('data-presentation', 'sheet');
    });
    it('keeps an out-of-grid accepted date across presentations', async () => {
        const user = userEvent.setup(), props: ReferenceProps = {...input(), layout: 'desktop', agendaDate: '2026-03-04', onAgendaDateChange: vi.fn(), onNavigate: vi.fn()};
        const view = render(<CalendarMonth {...props}/>); await enter(user);
        view.rerender(<CalendarMonth {...props} agendaDate="2026-05-06"/>);
        expect(screen.getByRole('dialog')).toHaveAttribute('data-date', '2026-05-06'); expect(screen.getByRole('button', {name: 'Close day agenda'})).toHaveFocus();
        view.rerender(<CalendarMonth {...props} agendaDate="2026-05-06" layout="mobile" agendaPresentation="overlay"/>);
        expect(screen.getByRole('dialog')).toHaveAttribute('data-presentation', 'sheet'); expect(screen.getByRole('dialog')).toHaveAttribute('data-date', '2026-05-06');
        expect(screen.getByRole('button', {name: 'Close day agenda'})).toHaveFocus();
        // Inline has no close control: §12.3 skips the absent date cell and uses the roving cell.
        view.rerender(<CalendarMonth {...props} agendaDate="2026-05-06" layout="mobile"/>);
        expect(screen.getByRole('region', {name: /May 6/})).toHaveAttribute('data-presentation', 'inline');
        expect(cell('2026-03-04')).toHaveFocus(); expect(document.querySelectorAll('[aria-hidden="true"] [role=grid], [inert]')).toHaveLength(0);
        expect(props.onNavigate).not.toHaveBeenCalled(); expect(props.onAgendaDateChange).not.toHaveBeenCalled();
    });
});

// Review 2026-10-09-2: script focus never scrolls; the inline agenda keeps its place below the grid, often below the fold,
// so the heading that Enter focuses is brought into view (§12.5). Chrome geometry: review2-probe.
describe('revealed inline agenda heading', () => {
    it('Enter on a mobile date scrolls the focused heading into view, once, and only the nearest amount', async () => {
        const reveal = vi.fn(), original = Element.prototype.scrollIntoView;
        Element.prototype.scrollIntoView = reveal;
        try {
            const user = userEvent.setup();
            render(<CalendarMonth {...{items: [], anchorDate: '2026-03-01', today: '2026-03-04', timeZone: 'UTC', locale: 'en-US', onNavigate() {}}} layout="mobile"/>);
            act(() => screen.getAllByRole('gridcell').find(node => node.dataset.date === '2026-03-25')!.focus());
            reveal.mockClear();
            await user.keyboard('{Enter}');
            const heading = screen.getByRole('heading', {level: 3});
            expect(heading).toHaveFocus();
            expect(reveal.mock.contexts.filter(node => node === heading)).toHaveLength(1);
            expect(reveal).toHaveBeenCalledWith({block: 'nearest', inline: 'nearest'});
        } finally { Element.prototype.scrollIntoView = original; }
    });
});

describe('mobile agenda sheet (§12.2)', () => {
    const sheetProps = (): ReferenceProps => ({...input(), layout: 'mobile', agendaPresentation: 'overlay'});
    it.each(['pointer', 'keyboard'] as const)('%s activation opens a named modal dialog with the heading focused; Escape restores the date cell', async kind => {
        const user = userEvent.setup(); render(<StrictMode><CalendarMonth {...sheetProps()}/></StrictMode>);
        expect(cell()).toHaveAttribute('aria-haspopup', 'dialog'); expect(cell()).toHaveAttribute('aria-expanded', 'false'); expect(agendas()).toHaveLength(0);
        if (kind === 'pointer') await user.click(cell()); else await enter(user);
        const sheet = screen.getByRole('dialog', {name: 'Events for Mar 4, 2026'});
        expect(sheet).toHaveAttribute('aria-modal', 'true'); expect(screen.getByRole('heading', {level: 3})).toHaveFocus();
        expect(cell()).toHaveAttribute('aria-expanded', 'true'); expect(within(sheet).getAllByRole('listitem')).toHaveLength(2);
        expect(silent()).toBe(true);
        await user.keyboard('{Escape}');
        expect(dialogs()).toHaveLength(0); expect(cell()).toHaveFocus(); expect(document.querySelectorAll('.nc-backdrop')).toHaveLength(0);
    });
    it('contains Tab inside the sheet and closes from its close control', async () => {
        const user = userEvent.setup(); render(<><CalendarMonth {...sheetProps()}/><button>After</button></>);
        await user.click(cell());
        for (let i = 0; i < 4; i++) { await user.tab(); expect(screen.getByRole('dialog').contains(document.activeElement)).toBe(true); }
        await user.click(screen.getByRole('button', {name: 'Close day agenda'}));
        expect(dialogs()).toHaveLength(0); expect(cell()).toHaveFocus();
    });
    it('a backdrop press dismisses the sheet and restores the date cell', async () => {
        // Where Chrome moves focus on the backdrop mousedown (it must not reach the calendar root) is checked by the
        // responsive Chrome probe in Document and ShadowRoot: jsdom has no PointerEvent, and React Aria stops that
        // mousedown at the document while it detects the outside press.
        const user = userEvent.setup(); render(<CalendarMonth {...sheetProps()}/>);
        await user.click(cell()); await user.pointer({keys: '[MouseLeft]', target: document.querySelector<HTMLElement>('.nc-sheet-backdrop')!});
        expect(dialogs()).toHaveLength(0); expect(cell()).toHaveFocus(); expect(document.querySelectorAll('.nc-backdrop, [aria-hidden="true"] [role=grid]')).toHaveLength(0);
    });
    it('item press reports the agenda payload from the sheet', async () => {
        const user = userEvent.setup(), onItemPress = vi.fn(); render(<CalendarMonth {...sheetProps()} onItemPress={onItemPress}/>);
        await user.click(cell()); await user.click(screen.getByRole('button', {name: /Beta/}));
        expect(onItemPress).toHaveBeenCalledWith({item: items[1], date: '2026-03-04', view: 'agenda'});
    });
    it.each([['removed', (list: typeof items) => [list[0]]], ['re-identified', (list: typeof items) => [list[0], {...list[1], id: 'b2'}]],
        ['moved to another day', (list: typeof items) => [list[0], {...list[1], interval: {kind: 'timed' as const, start: '2026-03-20T10:00:00Z'}}]]] as const)(
        'a focused item %s by a later non-act data update closes the sheet before a frame can refocus it (QA-13)', async (_label, change) => {
            // Chrome order: removing the focused node fires focusout while attached, and React Aria's FocusScope then
            // refocuses its first control on the next frame. Here a frame runs before React's passive effects, as in a
            // slow (development) build, so recovery that waits for a passive effect loses the race.
            const removeChild = Node.prototype.removeChild;
            vi.spyOn(Node.prototype, 'removeChild').mockImplementation(function <T extends Node>(this: Node, child: T): T {
                const active = document.activeElement;
                if (active && active !== document.body && child.contains(active)) active.dispatchEvent(new FocusEvent('focusout', {bubbles: true}));
                return removeChild.call(this, child) as T;
            });
            const cancelled = new Set<number>();
            let frame = 0;
            vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
                const id = ++frame;
                queueMicrotask(() => { if (!cancelled.has(id)) callback(performance.now()); });
                return id;
            });
            vi.stubGlobal('cancelAnimationFrame', (id: number) => { cancelled.add(id); });
            let update!: (next: typeof items) => void;
            function Host() {
                const [list, setList] = useState<typeof items>(items);
                update = setList;
                return <CalendarMonth {...sheetProps()} items={list}/>;
            }
            const user = userEvent.setup(); render(<Host/>);
            await user.click(cell()); act(() => screen.getByRole('button', {name: /Beta/}).focus());
            expect(dialogs()).toHaveLength(1);
            const environment = globalThis as {IS_REACT_ACT_ENVIRONMENT?: boolean};
            environment.IS_REACT_ACT_ENVIRONMENT = false;
            try {
                update(change(items));
                await new Promise(resolve => setTimeout(resolve, 100));
            } finally { environment.IS_REACT_ACT_ENVIRONMENT = true; }
            expect(dialogs()).toHaveLength(0); expect(cell()).toHaveFocus();
            expect(document.querySelectorAll('.nc-backdrop, [inert]')).toHaveLength(0);
        });
    it('removing the focused item closes the sheet and recovers the date cell, not the root (§12.3)', async () => {
        const user = userEvent.setup(), props = sheetProps(); const view = render(<StrictMode><CalendarMonth {...props}/></StrictMode>);
        await user.click(cell()); act(() => screen.getByRole('button', {name: /Beta/}).focus());
        view.rerender(<StrictMode><CalendarMonth {...props} items={[items[0]]}/></StrictMode>);
        expect(dialogs()).toHaveLength(0); expect(cell()).toHaveFocus(); expect(root()).not.toHaveFocus();
        expect(document.querySelectorAll('.nc-backdrop, [inert], [aria-hidden="true"] [role=grid]')).toHaveLength(0);
    });
});

describe('pending controlled acceptance with passive switches (§5.2.1, R45, R46)', () => {
    const controlled = (layout: 'mobile' | 'desktop' = 'mobile'): ReferenceProps => ({...input(), layout, agendaDate: '2026-03-01', onAgendaDateChange: vi.fn()});
    it('acceptance in the same commit as inline → popover opens the new presentation exactly once', async () => {
        const user = userEvent.setup(), props = controlled(); const view = render(<CalendarMonth {...props}/>);
        await enter(user); expect(props.onAgendaDateChange).toHaveBeenCalledTimes(1);
        expect(screen.getByRole('region', {name: /Mar 1/})).toBeInTheDocument();
        view.rerender(<CalendarMonth {...props} agendaDate="2026-03-04" layout="desktop"/>);
        expect(dialogs()).toHaveLength(1); expect(screen.getByRole('button', {name: 'Close day agenda'})).toHaveFocus();
        expect(agendas()).toHaveLength(1); expect(props.onAgendaDateChange).toHaveBeenCalledTimes(1);
    });
    it.each(['pointer', 'keyboard'] as const)('acceptance in the same commit as inline → sheet opens one sheet with heading focus (%s)', async kind => {
        const user = userEvent.setup(), props = controlled(); const view = render(<StrictMode><CalendarMonth {...props}/></StrictMode>);
        if (kind === 'pointer') await user.click(cell()); else await enter(user);
        view.rerender(<StrictMode><CalendarMonth {...props} agendaDate="2026-03-04" agendaPresentation="overlay"/></StrictMode>);
        expect(dialogs()).toHaveLength(1); expect(screen.getByRole('dialog')).toHaveAttribute('data-presentation', 'sheet');
        expect(screen.getByRole('heading', {level: 3, hidden: true})).toHaveFocus(); expect(agendas()).toHaveLength(1);
        expect(silent()).toBe(true); expect(props.onAgendaDateChange).toHaveBeenCalledTimes(1);
    });
    it('acceptance after the switch opens the current presentation: a pointer request in a sheet focuses its heading', async () => {
        const user = userEvent.setup(), props = controlled(); const view = render(<CalendarMonth {...props}/>);
        await user.click(cell());
        view.rerender(<CalendarMonth {...props} agendaPresentation="overlay"/>); expect(dialogs()).toHaveLength(0); expect(cell()).toHaveFocus();
        view.rerender(<CalendarMonth {...props} agendaPresentation="overlay" agendaDate="2026-03-04"/>);
        expect(screen.getByRole('dialog')).toHaveAttribute('data-presentation', 'sheet'); expect(screen.getByRole('heading', {level: 3})).toHaveFocus();
        expect(silent()).toBe(true);
    });
    it('a pointer request that becomes inline keeps focus on the cell and announces once', async () => {
        const user = userEvent.setup(), props = controlled('desktop'); const view = render(<StrictMode><CalendarMonth {...props}/></StrictMode>);
        await user.click(cell());
        view.rerender(<StrictMode><CalendarMonth {...props} layout="mobile" agendaDate="2026-03-04"/></StrictMode>);
        expect(cell()).toHaveFocus(); expect(dialogs()).toHaveLength(0);
        expect(screen.getByRole('status')).toHaveTextContent('Showing Mar 4, 2026, 2 events');
        expect(screen.getByRole('status').childNodes).toHaveLength(1);
    });
    it.each(['toolbar', 'outside', 'unrelated key'])('a request cancelled by %s opens nothing and announces nothing on a later switch + acceptance', async cancellation => {
        const user = userEvent.setup(), props = controlled(), tree = (extra: Partial<ReferenceProps>) => <><CalendarMonth {...props} {...extra}/><button>Outside</button></>;
        const view = render(tree({})); await user.click(cell());
        if (cancellation === 'toolbar') await user.click(screen.getByRole('button', {name: 'Next month'}));
        else if (cancellation === 'outside') await user.click(screen.getByRole('button', {name: 'Outside'}));
        // A pure modifier is not a keyboard activation and keeps the intent (QA-B-1-04); any other key cancels it.
        else await user.keyboard('a');
        const active = document.activeElement;
        view.rerender(tree({agendaPresentation: 'overlay'})); view.rerender(tree({agendaPresentation: 'overlay', agendaDate: '2026-03-04'}));
        expect(dialogs()).toHaveLength(0); expect(document.activeElement).toBe(active);
        view.rerender(tree({layout: 'desktop', agendaDate: '2026-03-04'})); expect(dialogs()).toHaveLength(0);
        expect(silent()).toBe(true);
        expect(props.onAgendaDateChange).toHaveBeenCalledTimes(1);
    });
    it.each(['sheet', 'inline'] as const)('a touch scroll (pointerdown → pointercancel) between the tap and acceptance keeps the intent (%s, §7)', async presentation => {
        const user = userEvent.setup(), props: ReferenceProps = {...controlled(), ...presentation === 'sheet' ? {agendaPresentation: 'overlay'} : {}};
        const view = render(<StrictMode><CalendarMonth {...props}/></StrictMode>);
        await user.click(cell()); fireEvent.pointerDown(screen.getByRole('grid')); fireEvent.pointerCancel(screen.getByRole('grid'));
        expect(cell()).toHaveFocus();
        view.rerender(<StrictMode><CalendarMonth {...props} agendaDate="2026-03-04"/></StrictMode>);
        if (presentation === 'sheet') {
            expect(dialogs()).toHaveLength(1); expect(screen.getByRole('heading', {level: 3})).toHaveFocus();
            expect(silent()).toBe(true);
        } else {
            expect(cell()).toHaveFocus(); expect(screen.getByRole('status')).toHaveTextContent('Showing Mar 4, 2026, 2 events');
            expect(screen.getByRole('status').childNodes).toHaveLength(1);
        }
        expect(props.onAgendaDateChange).toHaveBeenCalledTimes(1);
    });
    it('a completed unrelated pointer press (pointerup) cancels the intent even when focus stays on the cell', async () => {
        const user = userEvent.setup(), props: ReferenceProps = {...controlled(), agendaPresentation: 'overlay'};
        const view = render(<><CalendarMonth {...props}/><p>Blank</p></>);
        await user.click(cell()); fireEvent.pointerDown(screen.getByText('Blank')); fireEvent.pointerUp(screen.getByText('Blank'));
        expect(cell()).toHaveFocus();
        view.rerender(<><CalendarMonth {...props} agendaDate="2026-03-04"/><p>Blank</p></>);
        expect(dialogs()).toHaveLength(0); expect(cell()).toHaveFocus(); expect(screen.getByRole('status')).toHaveTextContent('');
    });
    it('Enter on mobile inline focuses the heading without a duplicate live announcement', async () => {
        const user = userEvent.setup(), props = controlled(); const view = render(<StrictMode><CalendarMonth {...props}/></StrictMode>);
        await enter(user); view.rerender(<StrictMode><CalendarMonth {...props} agendaDate="2026-03-04"/></StrictMode>);
        expect(screen.getByRole('heading', {level: 3})).toHaveFocus(); expect(screen.getByRole('status')).toHaveTextContent('');
    });
    it('an external or stale accepted value never opens or announces', async () => {
        const user = userEvent.setup(), props = controlled(); const view = render(<CalendarMonth {...props} agendaPresentation="overlay"/>);
        view.rerender(<CalendarMonth {...props} agendaPresentation="overlay" agendaDate="2026-03-06"/>); expect(dialogs()).toHaveLength(0);
        await user.click(cell()); view.rerender(<CalendarMonth {...props} agendaPresentation="overlay" agendaDate="2026-03-07"/>);
        view.rerender(<CalendarMonth {...props} agendaPresentation="overlay" agendaDate="2026-03-04"/>);
        expect(dialogs()).toHaveLength(0); expect(cell()).toHaveFocus(); expect(screen.getByRole('status')).toHaveTextContent('');
    });
});

describe('today and layout updates keep the viewed date and focus (§11.3, R56)', () => {
    it('a user-chosen uncontrolled date survives today rollover and a layout switch; the focused cell stays focused', async () => {
        const user = userEvent.setup(); const {today: _today, ...props} = input();
        const view = render(<Calendar {...props} style={{width: 400}}/>);
        expect(screen.getByRole('region', {name: /Mar 1/})).toBeInTheDocument();
        await user.click(cell('2026-03-06'));
        view.rerender(<Calendar {...props} today="2026-03-05" style={{width: 400}}/>);
        expect(screen.getByRole('region', {name: /Mar 6/})).toBeInTheDocument(); expect(cell('2026-03-06')).toHaveFocus();
        resize(900); expect(cell('2026-03-06')).toHaveFocus(); expect(dialogs()).toHaveLength(0);
        resize(400); expect(screen.getByRole('region', {name: /Mar 6/})).toBeInTheDocument(); expect(cell('2026-03-06')).toHaveFocus();
    });
    it.each(['click', 'Enter'] as const)('activating the today fallback itself (%s, mobile inline) records the choice: a today update keeps it', async input_ => {
        const user = userEvent.setup(), props = input(); const view = render(<Calendar {...props} style={{width: 400}}/>);
        expect(screen.getByRole('region', {name: /Mar 4/})).toBeInTheDocument();
        if (input_ === 'click') await user.click(cell()); else await enter(user);
        const owner = document.activeElement;
        view.rerender(<Calendar {...props} today="2026-03-05" style={{width: 400}}/>);
        expect(screen.getByRole('region', {name: /Mar 4/})).toBeInTheDocument(); expect(root().querySelector('[data-presentation]')).toHaveAttribute('data-date', '2026-03-04');
        expect(document.activeElement).toBe(owner); expect(owner).toBe(input_ === 'click' ? cell() : screen.getByRole('heading', {level: 3}));
    });
    it.each(['click', 'Enter'] as const)('activating the today fallback itself (%s, desktop popover) keeps the popover and item focus across a clock rollover', async input_ => {
        const now = vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-03-04T23:59:58Z'));
        const user = userEvent.setup(); const {today: _today, ...props} = input(); render(<Calendar {...props} style={{width: 900}}/>);
        if (input_ === 'click') await user.click(cell()); else await enter(user);
        expect(dialogs()).toHaveLength(1); act(() => screen.getByRole('button', {name: /Beta/}).focus());
        now.mockReturnValue(Date.parse('2026-03-05T00:00:05Z')); act(() => { document.dispatchEvent(new Event('visibilitychange')); });
        expect(cell('2026-03-05')).toHaveAttribute('data-today');
        expect(dialogs()).toHaveLength(1); expect(dialogs()[0]).toHaveAttribute('data-date', '2026-03-04');
        expect(focused()).toMatchObject({item: 'b', presentation: 'popover'});
    });
    it('an untouched fallback moves to a later known today in the month', () => {
        const {today: _today, ...props} = input(); const view = render(<Calendar {...props} style={{width: 400}}/>);
        view.rerender(<Calendar {...props} today="2026-03-05" style={{width: 400}}/>);
        expect(screen.getByRole('region', {name: /Mar 5/})).toBeInTheDocument();
    });
});

// Review 2026-10-09-3: until the user saves a logical date, the roving Tab stop follows §12.1 (agenda date, then today).
describe('initial roving target before a saved logical date (§12.1, §11.3)', () => {
    const roving = () => screen.getAllByRole('gridcell').filter(node => node.tabIndex === 0).map(node => node.dataset.date);
    it.each([400, 900])('follows the untouched agenda fallback to a later known today (%s px)', width => {
        const {today: _today, ...props} = input(); const view = render(<Calendar {...props} style={{width}}/>);
        expect(roving()).toEqual(['2026-03-01']);
        view.rerender(<Calendar {...props} today="2026-03-05" style={{width}}/>); expect(roving()).toEqual(['2026-03-05']);
        view.rerender(<Calendar {...props} today="2026-03-06" style={{width}}/>); expect(roving()).toEqual(['2026-03-06']);
    });
    it('follows a controlled agenda date, and a focused date becomes the saved logical date that today no longer moves', async () => {
        const user = userEvent.setup(), {today: _today, ...props} = input(), change = {agendaDate: '2026-03-03', onAgendaDateChange() {}};
        const view = render(<Calendar {...props} {...change} style={{width: 900}}/>); expect(roving()).toEqual(['2026-03-03']);
        view.rerender(<Calendar {...props} {...change} agendaDate="2026-03-09" style={{width: 900}}/>); expect(roving()).toEqual(['2026-03-09']);
        act(() => cell('2026-03-09').focus()); await user.keyboard('{ArrowRight}'); expect(roving()).toEqual(['2026-03-10']);
        view.rerender(<Calendar {...props} {...change} agendaDate="2026-03-02" today="2026-03-05" style={{width: 900}}/>); expect(roving()).toEqual(['2026-03-10']);
    });
});
