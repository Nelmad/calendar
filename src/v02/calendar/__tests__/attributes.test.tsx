import {act, render, screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {createRoot, hydrateRoot} from 'react-dom/client';
import {renderToString} from 'react-dom/server';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {Calendar, neutralTheme, type CalendarDataAttribute, type CalendarItem, type CalendarProps} from '../../../index.js';
import {resetSurfaceWarnings} from '../../surface.js';

// §5.7 stable data-* table (R60): each attribute only on its normative element, with its exact literal or boolean presence.
const stable: readonly CalendarDataAttribute[] = ['data-theme', 'data-layout', 'data-density', 'data-color-scheme', 'data-dir', 'data-status', 'data-loading-phase',
    'data-date', 'data-today', 'data-agenda-date', 'data-selected', 'data-selection-draft', 'data-selection-unavailable', 'data-outside-month', 'data-has-items',
    'data-item-id', 'data-view', 'data-dragging', 'data-pending', 'data-presentation'];
type Kind = 'root' | 'portal' | 'cell' | 'item' | 'agenda';
const allowed: Record<Kind, readonly string[]> = {
    root: ['data-theme', 'data-layout', 'data-density', 'data-color-scheme', 'data-dir', 'data-status', 'data-loading-phase'],
    portal: ['data-theme', 'data-density', 'data-color-scheme', 'data-dir'],
    cell: ['data-date', 'data-today', 'data-agenda-date', 'data-selected', 'data-selection-draft', 'data-selection-unavailable', 'data-outside-month', 'data-has-items'],
    item: ['data-selected', 'data-item-id', 'data-view', 'data-dragging', 'data-pending'],
    agenda: ['data-date', 'data-presentation'],
};
const literals: Partial<Record<CalendarDataAttribute, readonly string[]>> = {'data-theme': ['classic', 'neutral'], 'data-layout': ['mobile', 'desktop'],
    'data-density': ['compact', 'comfortable'], 'data-color-scheme': ['system', 'light', 'dark'], 'data-dir': ['ltr', 'rtl'], 'data-status': ['ready', 'loading', 'error'],
    'data-loading-phase': ['initial', 'refresh'], 'data-view': ['month', 'agenda'], 'data-presentation': ['inline', 'popover', 'sheet']};
const booleans = ['data-today', 'data-agenda-date', 'data-selected', 'data-selection-draft', 'data-selection-unavailable', 'data-outside-month', 'data-has-items', 'data-dragging', 'data-pending'];
const kind = (node: Element): Kind | null => node.matches('.nc-calendar') ? 'root' : node.matches('[role=gridcell]') ? 'cell'
    : node.matches('.nc-month-item, li.nc-agenda-item') ? 'item' : node.matches('section.nc-day-list') ? 'agenda' : node.matches('.nc-theme') ? 'portal' : null;
/** Every stable attribute in the document, as `kind:attribute=value`, failing on any element outside the table. */
function audit(scope: ParentNode = document) {
    const found: string[] = [];
    for (const node of scope.querySelectorAll('*')) for (const name of stable) {
        if (!node.hasAttribute(name)) continue;
        const value = node.getAttribute(name)!, where = kind(node);
        expect(where, `${name} on <${node.localName} class="${node.getAttribute('class')}">`).not.toBeNull();
        expect(allowed[where!], `${name} on ${where}`).toContain(name);
        if (booleans.includes(name)) expect(value, name).toBe('true');
        else if (literals[name]) expect(literals[name], name).toContain(value);
        else if (name === 'data-date') expect(value).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        found.push(`${where}:${name}`);
    }
    return new Set(found);
}
const item = (id: string, start: string, end: string): CalendarItem => ({id, title: id, calendarId: 'work', data: {}, interval: {kind: 'allDay', start, end}});
const props = (overrides: Partial<CalendarProps> = {}): CalendarProps => ({items: [item('a', '2026-03-04', '2026-03-06'), item('b', '2026-03-30', '2026-04-02')],
    sources: [{id: 'work', title: 'Work'}, {id: 'home', title: 'Home'}], visibleSourceIds: ['work', 'home'], onVisibleSourceIdsChange() {},
    anchorDate: '2026-03-01', today: '2026-03-04', timeZone: 'UTC', locale: 'en-US', layout: 'desktop', onNavigate() {}, ...overrides} as CalendarProps);
const cell = (date: string, scope: ParentNode = document) => scope.querySelector<HTMLElement>(`[role=gridcell][data-date="${date}"]`)!;
let warn: ReturnType<typeof vi.spyOn>;
beforeEach(() => { resetSurfaceWarnings(); warn = vi.spyOn(console, 'warn').mockImplementation(() => {}); });
afterEach(() => { vi.restoreAllMocks(); });

describe('stable data-* attributes (§5.7, R60)', () => {
    it('appear only on their normative elements with exact literals in a data fixture, its portals and menus', async () => {
        const user = userEvent.setup();
        render(<Calendar {...props({getItemActions: () => [{id: 'open', label: 'Open'}], onItemActionRequest() {}, dataState: {status: 'loading', phase: 'refresh'}})}/>);
        const root = screen.getByRole('region', {name: 'Calendar'});
        expect([root.dataset.theme, root.dataset.layout, root.dataset.density, root.dataset.colorScheme, root.dataset.dir, root.dataset.status, root.dataset.loadingPhase])
            .toEqual(['classic', 'desktop', 'compact', 'system', 'ltr', 'loading', 'refresh']);
        expect(cell('2026-03-04')).toHaveAttribute('data-today', 'true'); expect(cell('2026-03-04')).toHaveAttribute('data-has-items', 'true');
        expect(cell('2026-04-01')).toHaveAttribute('data-outside-month', 'true'); expect(cell('2026-03-10')).not.toHaveAttribute('data-has-items');
        // An uncontrolled agenda date is today until the viewer chooses another date.
        expect(cell('2026-03-04')).toHaveAttribute('data-agenda-date', 'true'); expect(cell('2026-03-05')).not.toHaveAttribute('data-agenda-date');
        act(() => cell('2026-03-05').focus()); await user.keyboard('{Enter}');
        expect(cell('2026-03-05')).toHaveAttribute('data-agenda-date', 'true'); expect(cell('2026-03-04')).not.toHaveAttribute('data-agenda-date');
        const agenda = screen.getByRole('dialog');
        expect([agenda.dataset.date, agenda.dataset.presentation]).toEqual(['2026-03-05', 'popover']);
        const row = agenda.querySelector<HTMLElement>('li[data-item-id="a"]')!;
        expect([row.dataset.view, row.hasAttribute('data-selected'), row.hasAttribute('data-dragging'), row.hasAttribute('data-pending')]).toEqual(['agenda', false, false, false]);
        // A child menu and the source menu mount their own portal theme roots; React Aria's selection attribute is not leaked.
        await user.click(screen.getByRole('button', {name: 'Actions for ⁨a⁩'}));
        expect(screen.getByRole('menu')).toBeInTheDocument();
        let found = audit();
        expect([...found].filter(entry => entry.startsWith('portal:')).sort()).toEqual(['portal:data-color-scheme', 'portal:data-density', 'portal:data-dir', 'portal:data-theme']);
        await user.keyboard('{Escape}{Escape}');
        await user.click(screen.getByRole('button', {name: 'Calendars'}));
        expect(screen.getAllByRole('menuitemcheckbox').every(node => !node.hasAttribute('data-selected') && node.getAttribute('aria-checked') === 'true')).toBe(true);
        found = audit();
        expect(found.has('agenda:data-presentation')).toBe(false); expect(found.has('root:data-loading-phase')).toBe(true);
    });
    it('item wrappers of every Month segment carry the item id and view; mobile sheets and inline agendas keep the table', async () => {
        const user = userEvent.setup();
        // Mobile: the action sheet and the source sheet are not DayAgenda, so they carry no data-presentation.
        const view = render(<Calendar {...props({layout: 'mobile', agendaPresentation: 'overlay', getItemActions: () => [{id: 'open', label: 'Open'}], onItemActionRequest() {}})}/>);
        expect(document.querySelector('.nc-calendar')).toHaveAttribute('data-layout', 'mobile');
        act(() => cell('2026-03-04').focus()); await user.keyboard('{Enter}');
        expect(screen.getByRole('dialog')).toHaveAttribute('data-presentation', 'sheet');
        await user.click(screen.getByRole('button', {name: 'Actions for ⁨a⁩'}));
        expect(document.querySelectorAll('[data-presentation]')).toHaveLength(1); expect(document.querySelector('.nc-action-sheet')).not.toHaveAttribute('data-presentation');
        audit();
        view.unmount();
        render(<Calendar {...props({layout: 'mobile'})}/>);
        await user.click(screen.getByRole('button', {name: 'Calendars'}));
        expect(document.querySelectorAll('.nc-action-sheet')).toHaveLength(1); expect(document.querySelector('.nc-action-sheet')).not.toHaveAttribute('data-presentation');
        expect([...document.querySelectorAll('.nc-checkbox')].every(node => !node.hasAttribute('data-selected'))).toBe(true);
        audit();
        expect(document.querySelector('section.nc-day-list')).toHaveAttribute('data-presentation', 'inline');
    });
    it('two themes and their portals never mix scoped values', async () => {
        const user = userEvent.setup();
        render(<><Calendar {...props({id: 'a', 'aria-label': 'A'})}/>
            <Calendar {...props({id: 'b', 'aria-label': 'B', theme: neutralTheme, dir: 'rtl', density: 'comfortable', colorScheme: 'dark'})}/></>);
        const a = document.getElementById('a')!, b = document.getElementById('b')!;
        // A non-modal popover closes when focus moves to the other calendar: each portal is checked while it is open.
        for (const [root, date, expected] of [[a, '2026-03-04', ['classic', 'ltr', 'compact', 'system']], [b, '2026-03-05', ['neutral', 'rtl', 'comfortable', 'dark']]] as const) {
            act(() => cell(date, root).focus()); await user.keyboard('{Enter}');
            const portals = [...document.querySelectorAll<HTMLElement>('.nc-theme:not(.nc-calendar)')].filter(node => node.querySelector('section.nc-day-list'));
            expect(portals.map(node => [node.querySelector<HTMLElement>('section')!.dataset.date, node.dataset.theme, node.dataset.dir, node.dataset.density, node.dataset.colorScheme]))
                .toEqual([[date, ...expected]]);
            expect(root.contains(portals[0])).toBe(false);
            audit();
        }
    });
    it('the contract shell has the fixed safe-shell values, no data-loading-phase, no portals and no view attributes', () => {
        render(<Calendar {...props({theme: neutralTheme, density: 'comfortable', colorScheme: 'dark', dir: 'rtl', dataState: {status: 'loading'} as never})}/>);
        const root = document.querySelector<HTMLElement>('.nc-calendar')!;
        expect([root.dataset.theme, root.dataset.layout, root.dataset.density, root.dataset.colorScheme, root.dataset.dir, root.dataset.status, root.hasAttribute('data-loading-phase')])
            .toEqual(['classic', 'mobile', 'compact', 'system', 'rtl', 'error', false]);
        expect([...audit()].sort()).toEqual(['root:data-color-scheme', 'root:data-density', 'root:data-dir', 'root:data-layout', 'root:data-status', 'root:data-theme']);
    });
});

describe('SSR stability of consumer styling values (§10.3.2, §10.3.3, R63)', () => {
    it('blank, non-string and invalid tokens, source colors and appearance values render the same server and hydrated DOM, with warnings only', async () => {
        const onNavigate = vi.fn(), onAgendaDateChange = vi.fn(), onVisibleSourceIdsChange = vi.fn();
        const input = (): CalendarProps => props({layout: 'auto', agendaDate: '2026-03-04', onAgendaDateChange, onNavigate, onVisibleSourceIdsChange, onItemPress() {},
            tokens: {color: {surface: ' ', text: 7 as never, accent: 'not-a-color'}, density: {itemHeight: 'calc(1px / 0)'}},
            sources: [{id: 'work', title: 'Work', color: '  '}, {id: 'home', title: 'Home', color: 'definitely-not-a-color'}],
            items: [item('a', '2026-03-04', '2026-03-06'), {...item('b', '2026-03-04', '2026-03-05'), calendarId: 'home'}],
            getItemAppearance: value => (value.id === 'a' ? {backgroundColor: 9, textColor: ' ', accentColor: 'var(--undefined-accent)'} : {backgroundColor: 'not-a-color'}) as never});
        const html = renderToString(<Calendar {...input()}/>);
        expect(renderToString(<Calendar {...input()}/>)).toBe(html);
        const server = document.createElement('div'); server.innerHTML = html;
        // The server shows the compact month with its inline agenda (§11.3); styles are exactly the accepted declarations.
        expect(server.querySelector('.nc-calendar')!.getAttribute('style')).toBe('--nelmad-calendar-color-accent:not-a-color;--nelmad-calendar-density-item-height:calc(1px / 0)');
        const styles = (scope: ParentNode) => [...scope.querySelectorAll('[style]')].map(node => `${node.className}|${node.getAttribute('style')}`);
        // Each accepted value is one declaration of its own channel: a resolver accent on the inner marker span, a resolver
        // background on the row surface, the source accent on the marker; blank and non-string values write nothing.
        expect(styles(server)).toEqual(['nc-theme nc-calendar|--nelmad-calendar-color-accent:not-a-color;--nelmad-calendar-density-item-height:calc(1px / 0)',
            'nc-month|--nc-week-count:5;--nc-minimum-row:64px', '|color:var(--undefined-accent)', 'nc-button|background-color:not-a-color',
            'nc-item-accent|color:definitely-not-a-color']);
        const errors: unknown[] = [];
        const hydrated = document.createElement('div'); hydrated.innerHTML = html; document.body.append(hydrated);
        // Inside act: outside it the hydration is a Scheduler task that a busy frame defers past an empty act (serverStyle.test.tsx).
        let root: ReturnType<typeof hydrateRoot> | undefined;
        await act(async () => { root = hydrateRoot(hydrated, <Calendar {...input()}/>, {onRecoverableError: error => errors.push(error)}); });
        try {
            expect(errors).toEqual([]);
            // The only addition is the post-commit geometry variable of the view (QA-D-1-03), never a consumer value.
            expect(styles(hydrated).filter(entry => !entry.startsWith('nc-calendar-view|'))).toEqual(styles(server));
            expect(hydrated.querySelector('.nc-calendar')).toHaveAttribute('data-status', 'ready');
            expect(onNavigate).not.toHaveBeenCalled(); expect(onAgendaDateChange).not.toHaveBeenCalled(); expect(onVisibleSourceIdsChange).not.toHaveBeenCalled();
            const messages = [...new Set(warn.mock.calls.map(([message]) => String(message)))].filter(message => /tokens\.|sources\(|getItemAppearance\(/.test(message)).sort();
            expect(messages).toEqual([
                '[@nelmad/calendar] getItemAppearance("a").backgroundColor: Expected a nonempty CSS color string; ignored',
                '[@nelmad/calendar] getItemAppearance("a").textColor: Expected a nonempty CSS color string; ignored',
                '[@nelmad/calendar] sources("work").color: Expected a nonempty CSS color string; ignored',
                '[@nelmad/calendar] tokens.color.surface: Expected a nonempty CSS string',
                '[@nelmad/calendar] tokens.color.text: Expected a nonempty CSS string']);
            // A client render writes the same declarations; the UA (here jsdom) rejects the non-colors at assignment.
            const client = document.createElement('div'); document.body.append(client);
            const clientRoot = createRoot(client);
            await act(async () => { clientRoot.render(<Calendar {...input()}/>); });
            const accent = (scope: ParentNode, id: string) => scope.querySelector<HTMLElement>(`li[data-item-id="${id}"] .nc-item-accent`)!;
            for (const scope of [client, hydrated]) expect((accent(scope, 'a').firstElementChild as HTMLElement).style.color).toBe('var(--undefined-accent)');
            expect(client.querySelector<HTMLElement>('li[data-item-id="a"] .nc-button')!.style.length).toBe(0);
            await act(async () => clientRoot.unmount());
        } finally { await act(async () => root!.unmount()); document.body.innerHTML = ''; }
    });
});

describe('portal mirror checkpoints (§10.3.4, R61)', () => {
    it('an owner resize refreshes the open portal mirror also with a forced layout, and the observer ends with the portal', async () => {
        const user = userEvent.setup(), observers: {callback: () => void; targets: Element[]; disconnected: boolean}[] = [];
        vi.stubGlobal('ResizeObserver', class {
            entry: {callback: () => void; targets: Element[]; disconnected: boolean};
            constructor(callback: () => void) { this.entry = {callback, targets: [], disconnected: false}; observers.push(this.entry); }
            observe(target: Element) { this.entry.targets.push(target); }
            unobserve() {}
            disconnect() { this.entry.disconnected = true; }
        });
        let accent = 'rgb(1, 1, 1)';
        const original = window.getComputedStyle.bind(window);
        vi.spyOn(window, 'getComputedStyle').mockImplementation((node, pseudo) => {
            const style = original(node, pseudo);
            if (!node.classList.contains('nc-calendar')) return style;
            return new Proxy(style, {get: (target, name) => name === 'getPropertyValue'
                ? (property: string) => property === '--nelmad-calendar-color-accent' ? accent : target.getPropertyValue(property)
                : typeof Reflect.get(target, name) === 'function' ? (Reflect.get(target, name) as (...args: unknown[]) => unknown).bind(target) : Reflect.get(target, name)});
        });
        try {
            render(<Calendar {...props({layout: 'desktop'})}/>);
            const root = document.querySelector('.nc-calendar')!;
            // A forced layout observes no width for its presentation.
            expect(observers.filter(entry => entry.targets.includes(root))).toHaveLength(0);
            act(() => cell('2026-03-04').focus()); await user.keyboard('{Enter}');
            const portal = screen.getByRole('dialog').closest<HTMLElement>('.nc-theme')!;
            expect(portal.style.getPropertyValue('--nelmad-calendar-color-accent')).toBe('rgb(1, 1, 1)');
            // The popover placement observes the anchor chain up to the root; the mirror observes the owner root alone.
            const watching = observers.filter(entry => entry.targets.length === 1 && entry.targets[0] === root && !entry.disconnected);
            expect(watching).toHaveLength(1);
            accent = 'rgb(2, 2, 2)';
            act(() => { for (const entry of watching) entry.callback(); });
            expect(portal.style.getPropertyValue('--nelmad-calendar-color-accent')).toBe('rgb(2, 2, 2)');
            await user.keyboard('{Escape}');
            expect(screen.queryByRole('dialog')).toBeNull(); expect(watching.every(entry => entry.disconnected)).toBe(true);
        } finally { vi.unstubAllGlobals(); }
    });
});
