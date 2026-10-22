import {readFileSync} from 'node:fs';
import {StrictMode} from 'react';
import {render, screen, within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {Calendar, type CalendarProps} from '../../../index.js';
import type {CalendarProps as ReferenceProps} from '../../reference.js';
import {CalendarMonth} from '../CalendarMonth.js';
import {applySurface, resetSurfaceWarnings, surfaceProps, surfaceVersion} from '../../surface.js';

const base = (): CalendarProps => ({items: [], anchorDate: '2026-03-01', today: '2026-03-04', timeZone: 'UTC', locale: 'en-US', layout: 'desktop', onNavigate() {}});
const items = (count: number, calendarId?: (index: number) => string) => Array.from({length: count}, (_, index) => ({id: `item-${index}`, title: `Event ${index}`, data: {index},
    ...(calendarId ? {calendarId: calendarId(index)} : {}), interval: {kind: 'allDay' as const, start: '2026-03-04', end: '2026-03-05'}}));
const cell = (date: string) => screen.getAllByRole('gridcell').find(node => node.dataset.date === date)!;
// Bypasses the published types on purpose: JavaScript consumers and casts reach the runtime gate.
const Untyped = Calendar as unknown as (props: Record<string, unknown>) => ReturnType<typeof Calendar>;
const unavailable = (warn: ReturnType<typeof vi.spyOn>) => warn.mock.calls.map(([message]) => String(message)).filter(message => message.includes('not available') || message.includes('removed in 0.2') || message.includes('not a Calendar prop'));
let warn: ReturnType<typeof vi.spyOn>;
beforeEach(() => { resetSurfaceWarnings(); warn = vi.spyOn(console, 'warn').mockImplementation(() => {}); });
afterEach(() => { vi.unstubAllEnvs(); warn.mockRestore(); });

describe('alpha.2 public surface gate', () => {
    it('matches the package version and passes the whole working slice through unchanged', () => {
        expect(surfaceVersion).toBe(JSON.parse(readFileSync('package.json', 'utf8')).version);
        const input = Object.fromEntries(surfaceProps.map(name => [name, name]));
        expect(applySurface(input)).toBe(input);
        expect(warn).not.toHaveBeenCalled();
    });
    it('strips selection: no multiselectable grid, no aria-selected days and no selection-driven focus', () => {
        render(<Untyped {...base()} items={items(2)} selection={{start: '2026-03-10', end: '2026-03-12'}} onSelectionChange={vi.fn()} onCreateRequest={vi.fn()}/>);
        const grid = screen.getByRole('grid');
        expect(grid).not.toHaveAttribute('aria-multiselectable');
        expect(grid.querySelectorAll('[aria-selected]')).toHaveLength(0);
        expect(cell('2026-03-04')).toHaveAttribute('tabindex', '0');
        // The internal component keeps the full reference behavior for upcoming milestones.
        const internal: ReferenceProps = {...base(), selection: {start: '2026-03-10', end: '2026-03-12'}, onSelectionChange: vi.fn()};
        render(<CalendarMonth {...internal}/>);
        expect(screen.getAllByRole('grid')[1]).toHaveAttribute('aria-multiselectable', 'true');
    });
    it('accepts sources and the controlled filter in alpha.2: hidden items leave the grid and agenda; unknown sources stay visible with one warning', async () => {
        const user = userEvent.setup(), onVisibleSourceIdsChange = vi.fn();
        const feed = [...items(3, index => index === 1 ? 'hidden' : 'shown'), {...items(1)[0], id: 'orphan', title: 'Orphan', calendarId: 'missing'}];
        render(<Untyped {...base()} items={feed} sources={[{id: 'shown', title: 'Shown'}, {id: 'hidden', title: 'Hidden'}]}
            visibleSourceIds={['shown']} onVisibleSourceIdsChange={onVisibleSourceIdsChange} showSourceSelector/>);
        // Two visible items of the known source and the item with an unknown source; the hidden one is filtered out.
        expect(cell('2026-03-04').querySelector('.nc-overflow')).toHaveTextContent('+3');
        expect(screen.getByRole('button', {name: 'Calendars'})).toHaveAttribute('aria-haspopup', 'menu');
        await user.click(cell('2026-03-04'));
        expect(within(screen.getByRole('dialog')).getAllByRole('listitem').map(node => node.dataset.itemId)).toEqual(['item-0', 'item-2', 'orphan']);
        const sources = warn.mock.calls.map(([message]) => String(message)).filter(message => message.includes('calendarId'));
        expect(sources).toEqual(['[@nelmad/calendar] items[3].calendarId: No source with ID "missing"; items with this calendarId remain visible with fallback appearance']);
        expect(unavailable(warn)).toEqual([]); expect(onVisibleSourceIdsChange).not.toHaveBeenCalled();
    });
    it('without the controlled pair every valid item is visible and no selector exists, even with sources', () => {
        render(<Untyped {...base()} items={items(3, index => index === 1 ? 'hidden' : 'shown')} sources={[{id: 'shown', title: 'Shown'}, {id: 'hidden', title: 'Hidden'}]}/>);
        expect(cell('2026-03-04').querySelector('.nc-overflow')).toHaveTextContent('+3');
        expect(screen.queryByRole('button', {name: 'Calendars'})).toBeNull(); expect(unavailable(warn)).toEqual([]);
    });
    it('accepts portalContainer in alpha.2: the agenda portals into the container, with the default body otherwise', async () => {
        const user = userEvent.setup(), container = document.createElement('div');
        document.body.append(container);
        try {
            const view = render(<Untyped {...base()} items={items(1)} portalContainer={container}/>);
            await user.click(cell('2026-03-04'));
            expect(container.contains(screen.getByRole('dialog'))).toBe(true);
            expect(screen.getByRole('region', {name: 'Calendar'}).contains(screen.getByRole('dialog'))).toBe(false);
            await user.keyboard('{Escape}');
            view.rerender(<Untyped {...base()} items={items(1)} portalContainer={null}/>);
            await user.click(cell('2026-03-04'));
            const dialog = screen.getByRole('dialog');
            expect(container.contains(dialog)).toBe(false); expect(screen.getByRole('region', {name: 'Calendar'}).contains(dialog)).toBe(false);
            expect(dialog.closest('.nc-theme')?.parentElement?.closest('body')).toBe(document.body);
            expect(unavailable(warn)).toEqual([]);
        } finally { container.remove(); }
    });
    // JavaScript consumers reach the runtime with any value; an anchor/area has a string `host` (R53, §10.3.4).
    const nested = () => { const anchor = document.createElement('a'), div = document.createElement('div'); anchor.append(div); return div; };
    it.each([
        ['a selector string', () => 'body', 'Expected an Element or ShadowRoot; using the default container'],
        ['a plain object', () => ({}), 'Expected an Element or ShadowRoot; using the default container'],
        ['a number', () => 5, 'Expected an Element or ShadowRoot; using the default container'],
        ['a detached anchor', () => document.createElement('a'), 'Detached container; using the default container'],
        ['a detached area', () => document.createElement('area'), 'Detached container; using the default container'],
        ['a node inside a detached anchor', nested, 'Detached container; using the default container'],
    ] as const)('portalContainer as %s falls back to the owner body with one development warning, without crashing', async (_, value, reason) => {
        const user = userEvent.setup(), container = value();
        render(<Untyped {...base()} items={items(1)} portalContainer={container}/>);
        expect(screen.getByRole('grid')).toBeInTheDocument();
        await user.click(cell('2026-03-04'));
        const dialog = screen.getByRole('dialog');
        expect(dialog.closest('.nc-theme')?.parentElement?.parentElement).toBe(document.body);
        expect(screen.getByRole('region', {name: 'Calendar'}).contains(dialog)).toBe(false);
        if (container instanceof Node) expect(container.childNodes).toHaveLength(0);
        expect(warn.mock.calls.map(([message]) => String(message)).filter(message => message.includes('portalContainer'))).toEqual([`[@nelmad/calendar] portalContainer: ${reason}`]);
    });
    it('accepts slots, class callbacks and the appearance resolver in alpha.2 (T18) and still strips invalid beta.1 configuration', async () => {
        const user = userEvent.setup(), slot = vi.fn(() => 'Slot'), resolver = vi.fn(() => ({textColor: 'red'})), policy = vi.fn(() => true as const);
        render(<Untyped {...base()} items={items(1)} renderDayHeader={slot} renderAgendaItem={slot} renderToolbarContent={slot} renderItem={slot}
            classNames={{root: 'custom-root', grid: 'custom-grid'}} getItemAppearance={resolver}
            interactionPolicy={{canSelectDate: policy, canMoveItem: 'not a function'}}
            itemMoveStates={[]} onItemMoveRequest={vi.fn()} onItemMoveDraftChange={vi.fn()}/>);
        expect(screen.getByRole('grid')).toHaveClass('custom-grid'); expect(screen.getByRole('region', {name: 'Calendar'})).toHaveClass('custom-root');
        await user.click(cell('2026-03-04'));
        // The move pair is stripped, so no built-in move command joins the (absent) action set either.
        expect(screen.queryByRole('button', {name: /actions/i})).toBeNull();
        expect(slot).toHaveBeenCalledWith(expect.objectContaining({view: 'agenda', date: '2026-03-04'})); expect(screen.getAllByText('Slot').length).toBeGreaterThan(0);
        expect(resolver).toHaveBeenCalledWith(expect.objectContaining({id: 'item-0'}), {timeZone: 'UTC'}); expect(policy).not.toHaveBeenCalled();
        expect(unavailable(warn)).toEqual(['interactionPolicy', 'itemMoveStates', 'onItemMoveRequest', 'onItemMoveDraftChange'].map(name =>
            `[@nelmad/calendar] ${name}: not available in 0.2.0-alpha.2; ignored`));
        // The same invalid value is a contract error on the full reference surface.
        render(<CalendarMonth {...base()} interactionPolicy={{canMoveItem: 'not a function'} as never}/>);
        expect(screen.getAllByRole('region', {name: 'Calendar cannot be displayed: invalid configuration'})).toHaveLength(1);
    });
    it('accepts the item action pair in alpha.2: an agenda row gets its actions trigger, and a lone half of the pair is a contract error', async () => {
        const user = userEvent.setup(), onItemActionRequest = vi.fn();
        const view = render(<Untyped {...base()} items={items(1)} getItemActions={() => [{id: 'open', label: 'Open'}]} onItemActionRequest={onItemActionRequest}/>);
        await user.click(cell('2026-03-04'));
        await user.click(screen.getByRole('button', {name: 'Actions for \u2068Event 0\u2069'}));
        await user.click(screen.getByRole('menuitem', {name: 'Open'}));
        expect(onItemActionRequest).toHaveBeenCalledTimes(1); expect(onItemActionRequest.mock.calls[0][0]).toMatchObject({actionId: 'open', item: {id: 'item-0'}});
        expect(unavailable(warn)).toEqual([]);
        view.rerender(<Untyped {...base()} items={items(1)} getItemActions={() => []}/>);
        expect(screen.queryByRole('grid')).toBeNull();
        expect(warn.mock.calls.map(([message]) => String(message))).toContain('[@nelmad/calendar] getItemActions: Must be supplied together with onItemActionRequest');
    });
    it.each([
        ['mobileBreakpoint', {mobileBreakpoint: -1}, 'mobileBreakpoint: Expected a positive finite number'],
        ['mobileBreakpoint', {mobileBreakpoint: Number.NaN}, 'mobileBreakpoint: Expected a positive finite number'],
        ['agendaPresentation', {agendaPresentation: 'sideways'}, 'agendaPresentation: Unknown enum value'],
    ])('validates the alpha.2 prop %s instead of stripping it', (name, value, diagnostic) => {
        render(<Untyped {...base()} {...value}/>);
        expect(screen.queryByRole('grid')).toBeNull();
        expect(screen.getByRole('region', {name: 'Calendar cannot be displayed: invalid configuration'})).toBeInTheDocument();
        expect(warn.mock.calls.map(([message]) => String(message))).toContain(`[@nelmad/calendar] ${diagnostic}`);
        expect(unavailable(warn).filter(message => message.includes(name))).toEqual([]);
    });
    it('accepts the responsive alpha.2 props: a forced mobile layout with an overlay agenda resolves to a sheet trigger', () => {
        render(<Untyped {...base()} layout="mobile" mobileBreakpoint={500} agendaPresentation="overlay"/>);
        expect(screen.getByRole('region', {name: 'Calendar'})).toHaveAttribute('data-layout', 'mobile');
        expect(cell('2026-03-04')).toHaveAttribute('aria-haspopup', 'dialog');
        expect(unavailable(warn)).toEqual([]);
    });
    it('warns once per stripped prop across rerenders, StrictMode and instances; undefined values stay silent', () => {
        const props = {...base(), selection: null, onSelectionChange: vi.fn(), events: [], sources: undefined};
        const view = render(<StrictMode><Untyped {...props}/><Untyped {...props}/></StrictMode>);
        view.rerender(<StrictMode><Untyped {...props} selection={{start: '2026-03-02', end: '2026-03-03'}}/><Untyped {...props}/></StrictMode>);
        expect(unavailable(warn)).toEqual([
            '[@nelmad/calendar] selection: not available in 0.2.0-alpha.2; ignored',
            '[@nelmad/calendar] onSelectionChange: not available in 0.2.0-alpha.2; ignored',
            // A removed 0.1 prop is not announced as one that a later prerelease adds (QA-23).
            '[@nelmad/calendar] events: removed in 0.2; see the migration guide (docs/migration-0.1-to-0.2.md); ignored',
        ]);
        expect(screen.getAllByRole('grid')).toHaveLength(2);
    });
    it('strips React-reserved names without a warning (a React 19 ref arrives as a prop)', () => {
        const props = base(), ref = {current: null};
        expect(applySurface({...props, key: 'k', ref, children: 'text'})).toEqual(props);
        render(<Untyped {...base()}>children</Untyped>);
        expect(unavailable(warn)).toEqual([]);
        expect(warn.mock.calls.map(([message]) => String(message)).filter(message => /\b(key|ref|children):/.test(message))).toEqual([]);
        expect(screen.getByRole('grid')).toBeInTheDocument();
    });
    it('strips silently in production builds', () => {
        vi.stubEnv('NODE_ENV', 'production');
        render(<Untyped {...base()} selection={{start: '2026-03-04', end: '2026-03-05'}} onSelectionChange={vi.fn()} interactionPolicy={{}} classNames={{root: 'custom'}}/>);
        expect(warn).not.toHaveBeenCalled();
        expect(screen.getByRole('grid')).not.toHaveAttribute('aria-multiselectable');
        // classNames is accepted since T18; production keeps the same accept/strip set as development.
        expect(document.querySelector('.custom')).toBe(screen.getByRole('region', {name: 'Calendar'}));
    });
    it.each([
        ['missing', undefined, 'mobile'], ['auto', 'auto', 'mobile'], ['mobile', 'mobile', 'mobile'], ['desktop', 'desktop', 'desktop'],
    ])('renders a %s layout: the default auto resolves to mobile before any valid width measurement', (_name, layout, resolved) => {
        const {layout: _layout, ...rest} = base(), onVisibleRangeChange = vi.fn();
        render(<Untyped {...rest} {...(layout === undefined ? {} : {layout})} items={items(2)} onVisibleRangeChange={onVisibleRangeChange}/>);
        const root = screen.getByRole('region', {name: 'Calendar'});
        expect(root).toHaveAttribute('data-layout', resolved); expect(screen.getByRole('grid')).toBeInTheDocument();
        expect(cell('2026-03-04').querySelector(resolved === 'mobile' ? '.nc-day-indicator' : '.nc-overflow')).not.toBeNull();
        expect(onVisibleRangeChange).toHaveBeenCalledTimes(1); expect(warn).not.toHaveBeenCalled();
    });
    it('renders the safe contract shell for an unknown layout with a diagnostic naming the alpha.2 layouts', () => {
        const onVisibleRangeChange = vi.fn();
        render(<Untyped {...base()} layout="tablet" items={items(2)} onVisibleRangeChange={onVisibleRangeChange}/>);
        expect(screen.queryByRole('grid')).toBeNull(); expect(screen.queryByRole('button')).toBeNull();
        expect(screen.getByRole('region', {name: 'Calendar cannot be displayed: invalid configuration'})).toBeInTheDocument();
        expect(document.querySelector('.nc-calendar')).toHaveAttribute('data-layout', 'mobile');
        expect(screen.getByRole('alert')).toHaveTextContent('Calendar cannot be displayed: invalid configuration');
        expect(warn.mock.calls.map(([message]) => String(message))).toContain("[@nelmad/calendar] layout: Unknown enum value; expected 'auto' or 'desktop' or 'mobile'");
        expect(onVisibleRangeChange).not.toHaveBeenCalled();
    });
    it('keeps the prerelease diagnostic public-only: the internal component reports the reference enum', () => {
        render(<CalendarMonth {...base()} layout={'tablet' as never}/>);
        expect(screen.queryByRole('grid')).toBeNull();
        expect(warn.mock.calls.map(([message]) => String(message))).toContain('[@nelmad/calendar] layout: Unknown enum value');
    });
});
