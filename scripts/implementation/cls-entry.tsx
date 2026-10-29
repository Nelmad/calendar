import {Profiler, type ProfilerOnRenderCallback} from 'react';
import {hydrateRoot} from 'react-dom/client';
import {renderToString} from 'react-dom/server';
// The public facade (resolved by the probe's Vite alias: this checkout's src/index.ts, or the dist of a given package).
import {Calendar, classicTheme, type CalendarItem, type CalendarProps} from '@nelmad/calendar';

// CLS probe entry (issue #20): one production module renders the server HTML in Node and hydrates it in Chrome.
export type Options = {
    /** `distributed`: the 1000-item August 2026 workload; `band`: the small March 2026 fixture of the feedback-band check. */
    fixture?: 'distributed' | 'band';
    layout?: 'auto' | 'desktop' | 'mobile';
    density?: 'compact' | 'comfortable';
    agendaPresentation?: 'auto' | 'overlay';
    mobileBreakpoint?: number;
    /** An initial blocking load instead of ready data. */
    blocking?: boolean;
    /** One all-day item with a 70-character title on the viewed date. */
    longTitle?: boolean;
};
export type Callback = {name: string; value: unknown};
export type Commit = {phase: string; at: number; layout?: string; marker?: boolean; content?: number; width?: number};

const iso = (time: number) => new Date(time).toISOString().replace('.000Z', 'Z');
const day = 86_400_000, minute = 60_000, gridStart = Date.UTC(2026, 6, 27);
export const longTitle = 'Quarterly planning review with the regional partners and the data team';
/** Item i is a 30 min timed item on grid day i % 42 from 2026-07-27, at 09:00 UTC + 30 min × (floor(i / 42) % 16). */
export function distributedItems(count = 1000): CalendarItem<number>[] {
    return Array.from({length: count}, (_, i) => {
        const start = gridStart + (i % 42) * day + 9 * 60 * minute + 30 * minute * (Math.floor(i / 42) % 16);
        return {id: `d${i}`, title: `Event ${i}`, data: i, interval: {kind: 'timed', start: iso(start), end: iso(start + 30 * minute)}};
    });
}
// The fixture of the feedback-band hydration check in responsive-probe.mjs.
const bandItems: CalendarItem<number>[] = [
    {id: 'alpha', title: 'Release preparation', data: 0, interval: {kind: 'allDay', start: '2026-03-03', end: '2026-03-06'}},
    {id: 'beta', title: 'Design review', data: 1, interval: {kind: 'timed', start: '2026-03-04T10:30:00Z', end: '2026-03-04T11:30:00Z'}},
    {id: 'gamma', title: 'Team sync', data: 2, interval: {kind: 'timed', start: '2026-03-11T12:00:00Z'}},
];

function fixtureProps(options: Options, callbacks: Callback[]): CalendarProps<number> {
    const record = (name: string) => (value: unknown) => { callbacks.push({name, value}); };
    const shared = {onNavigate: record('onNavigate'), onVisibleRangeChange: record('onVisibleRangeChange'), onItemPress: record('onItemPress'),
        ...(options.layout ? {layout: options.layout} : {}), ...(options.mobileBreakpoint !== undefined ? {mobileBreakpoint: options.mobileBreakpoint} : {}),
        ...(options.agendaPresentation ? {agendaPresentation: options.agendaPresentation} : {}),
        ...(options.blocking ? {dataState: {status: 'loading', phase: 'initial'} as const} : {})};
    if (options.fixture === 'band') return {items: bandItems, anchorDate: '2026-03-01', today: '2026-03-20', timeZone: 'UTC', locale: 'en-US', ...shared};
    const items = distributedItems();
    if (options.longTitle) items.push({id: 'long', title: longTitle, data: -1, interval: {kind: 'allDay', start: '2026-08-19', end: '2026-08-20'}});
    return {items, anchorDate: '2026-08-01', today: '2026-08-19', timeZone: 'UTC', locale: 'en-GB', firstDayOfWeek: 'monday', theme: classicTheme,
        density: options.density ?? 'compact', ...shared};
}
/** The root content box (border-box width minus padding and border), or NaN without a layout box. */
function contentBox(root: HTMLElement) {
    if (!root.getClientRects().length) return Number.NaN;
    const style = getComputedStyle(root), px = (value: string) => Number.parseFloat(value) || 0;
    return px(style.width) - px(style.paddingLeft) - px(style.paddingRight) - px(style.borderLeftWidth) - px(style.borderRightWidth);
}
const tree = (props: CalendarProps<number>, onRender: ProfilerOnRenderCallback) => <Profiler id="calendar" onRender={onRender}><Calendar {...props}/></Profiler>;

export function serverHtml(options: Options = {}) {
    const callbacks: Callback[] = [];
    return {html: renderToString(tree(fixtureProps(options, callbacks), () => undefined)), callbacks};
}
/**
 * Hydrates the server HTML in `container`. Profiler commits come from React's profiling build (the probe aliases react-dom).
 * The hydration commit calls onRender after the Calendar's own layout effects and before the update they schedule, so its
 * root content box is the one the first layout decision read.
 */
export function hydrate(container: Element, options: Options = {}) {
    const callbacks: Callback[] = [], commits: Commit[] = [], errors: string[] = [];
    const onRender: ProfilerOnRenderCallback = (_id, phase) => {
        const root = container.querySelector<HTMLElement>('.nc-calendar');
        commits.push({phase, at: performance.now(), ...(phase === 'mount' && root ? {layout: root.dataset.layout, marker: !!root.querySelector('.nc-calendar-view[data-unmeasured]'),
            content: contentBox(root), width: root.getBoundingClientRect().width} : {})});
    };
    const startedAt = performance.now();
    hydrateRoot(container, tree(fixtureProps(options, callbacks), onRender), {onRecoverableError: error => { errors.push(String(error)); }});
    return {startedAt, callbacks, commits, errors};
}
