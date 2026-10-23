import {StrictMode} from 'react';
import {act, render, screen, within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {Calendar, neutralTheme, type CalendarAgendaItemSlotContext, type CalendarItem, type CalendarMonthItemSlotContext, type CalendarProps,
    type CalendarSource} from '../../../index.js';
import {resetSurfaceWarnings} from '../../surface.js';

// T18: typed content/class slots (§10.4, §5.7), item appearance (§10.3.3) and the passive-content diagnostics through the
// public Calendar. jsdom has no layout: the measured Month boxes are given, so the desktop grid renders lanes.
type Data = {ticket: number};
type SourceData = {team: string};
const bar: CalendarItem<Data> = {id: 'bar', title: 'Sprint', calendarId: 'work', data: {ticket: 1}, interval: {kind: 'allDay', start: '2026-03-04', end: '2026-03-12'}};
const chip: CalendarItem<Data> = {id: 'chip', title: 'Standup', data: {ticket: 2}, interval: {kind: 'timed', start: '2026-03-04T10:00:00Z'}};
const work: CalendarSource<SourceData> = {id: 'work', title: 'Work', color: 'rgb(1, 2, 3)', data: {team: 'core'}};
type Props = CalendarProps<Data, SourceData>;
const input = (overrides: Partial<Props> = {}): Props => ({items: [bar, chip], sources: [work], anchorDate: '2026-03-01', today: '2026-03-04', timeZone: 'UTC',
    locale: 'en-US', layout: 'desktop', onNavigate() {}, ...overrides} as Props);
const cell = (date = '2026-03-04') => screen.getAllByRole('gridcell').find(node => node.dataset.date === date)!;
const segments = (id: string) => [...document.querySelectorAll<HTMLElement>(`.nc-month-item[data-item-id="${id}"]`)];
const row = (id: string) => document.querySelector<HTMLElement>(`li[data-item-id="${id}"]`)!;
const key = (context: CalendarMonthItemSlotContext<Data, SourceData>) => `${context.item.id}:${context.segmentRange.start}/${context.segmentRange.end}`;
async function open(user: ReturnType<typeof userEvent.setup>, date = '2026-03-04') { act(() => cell(date).focus()); await user.keyboard('{Enter}'); }
const sizes: Record<string, Record<string, string>> = {'nc-month-week': {height: '120px', width: '700px'}, 'nc-day-header': {height: '32px'},
    'nc-month-item-probe': {height: '24px', marginBottom: '4px'}, 'nc-month-overflow-probe': {height: '24px'}};
let warn: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
    resetSurfaceWarnings(); warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const original = window.getComputedStyle.bind(window);
    vi.spyOn(window, 'getComputedStyle').mockImplementation((node, pseudo) => {
        const style = original(node, pseudo), size = [...node.classList].map(name => sizes[name]).find(Boolean);
        return new Proxy(style, {get: (target, name) => size && typeof name === 'string' && name in size ? size[name]
            : typeof Reflect.get(target, name) === 'function' ? (Reflect.get(target, name) as (...args: unknown[]) => unknown).bind(target) : Reflect.get(target, name)});
    });
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });
const warnings = () => warn.mock.calls.map(([message]) => String(message));

describe('item slots and one appearance per item (§5.7, §10.3.3, R35.2)', () => {
    it('calls renderItem and classNames.item once per exact segment; resolves the appearance once per item for every segment and the agenda row', async () => {
        const user = userEvent.setup();
        const renderItem = vi.fn((context: CalendarMonthItemSlotContext<Data, SourceData>) => <b>{`#${context.item.data.ticket}`}</b>);
        const item = vi.fn(() => 'segment'), agendaItem = vi.fn(() => 'agenda-row');
        const renderAgendaItem = vi.fn((context: CalendarAgendaItemSlotContext<Data, SourceData>) => <i>{`custom ${context.item.title}`}</i>);
        const getItemAppearance = vi.fn((value: CalendarItem<Data>) => value.id === 'bar' ? {backgroundColor: 'rgb(4, 5, 6)'} : undefined);
        const props = input({renderItem, renderAgendaItem, getItemAppearance, classNames: {item, agendaItem}, onItemPress: vi.fn()});
        const view = render(<Calendar {...props}/>);
        expect(segments('bar')).toHaveLength(2); expect(segments('chip')).toHaveLength(1);
        // One render pass: exactly one call per clipped segment range of the week rows.
        renderItem.mockClear(); item.mockClear();
        view.rerender(<Calendar {...props}/>);
        const expected = ['bar:2026-03-04/2026-03-08', 'bar:2026-03-08/2026-03-12', 'chip:2026-03-04/2026-03-05'];
        expect(renderItem.mock.calls.map(([context]) => key(context)).sort()).toEqual(expected);
        expect(item.mock.calls.map(([context]) => key(context as CalendarMonthItemSlotContext<Data, SourceData>)).sort()).toEqual(expected);
        const context = (value: string) => renderItem.mock.calls.map(([argument]) => argument).find(argument => key(argument) === value)!;
        expect(context('bar:2026-03-08/2026-03-12')).toEqual({item: bar, source: work, view: 'month', segmentRange: {start: '2026-03-08', end: '2026-03-12'},
            isSelected: false, isDragging: false, isPending: false, isDisabled: false});
        expect(context('chip:2026-03-04/2026-03-05')).toEqual({item: chip, view: 'month', segmentRange: {start: '2026-03-04', end: '2026-03-05'},
            isSelected: false, isDragging: false, isPending: false, isDisabled: false});
        expect('source' in context('chip:2026-03-04/2026-03-05')).toBe(false);
        for (const node of segments('bar')) {
            expect(node).toHaveClass('nc-month-item', 'segment'); expect(node).toHaveAttribute('data-view', 'month');
            expect(node.querySelector('[data-nc-slot="renderItem"]')).toHaveTextContent('#1');
            expect(node.style.backgroundColor).toBe('rgb(4, 5, 6)'); expect(node.querySelector<HTMLElement>('.nc-item-accent')!.style.color).toBe('rgb(1, 2, 3)');
        }
        expect(segments('chip')[0].style.backgroundColor).toBe(''); expect(segments('chip')[0].querySelector<HTMLElement>('.nc-item-accent')!.style.color).toBe('');
        await open(user);
        renderAgendaItem.mockClear(); agendaItem.mockClear();
        view.rerender(<Calendar {...props}/>);
        // The agenda context: the agenda date and exactly one call per item row of that date.
        expect(renderAgendaItem.mock.calls.map(([argument]) => argument)).toEqual([
            {item: bar, source: work, view: 'agenda', date: '2026-03-04', isSelected: false, isDragging: false, isPending: false, isDisabled: false},
            {item: chip, view: 'agenda', date: '2026-03-04', isSelected: false, isDragging: false, isPending: false, isDisabled: false}]);
        expect(agendaItem).toHaveBeenCalledTimes(2); expect(row('bar')).toHaveClass('nc-agenda-item', 'agenda-row');
        const primary = within(row('bar')).getByRole('button');
        expect(primary.style.backgroundColor).toBe('rgb(4, 5, 6)'); expect(primary.querySelector<HTMLElement>('.nc-item-accent')!.style.color).toBe('rgb(1, 2, 3)');
        // Resolved once per item with its zone and source, never with a segment, date or view.
        expect(getItemAppearance.mock.calls).toEqual([[bar, {timeZone: 'UTC', source: work}], [chip, {timeZone: 'UTC'}]]);
    });
    it('replaces the visible agenda row content only: the accessible name is the default summary followed by the visible custom content', async () => {
        const user = userEvent.setup(), onItemPress = vi.fn();
        const view = render(<StrictMode><Calendar {...input({onItemPress, renderAgendaItem: context => <span>{`Ticket ${context.item.data.ticket}`}</span>})}/></StrictMode>);
        await open(user);
        const primary = within(row('chip')).getByRole('button');
        // WCAG 2.5.3: the visible label (the custom content) is contained in the name, after the base summary.
        expect(primary).toHaveAccessibleName(/^Standup.*Ticket 2$/); expect(primary).toHaveAccessibleDescription('');
        const [summary, content] = primary.getAttribute('aria-labelledby')!.split(' ').map(value => document.getElementById(value)!);
        expect(summary).toHaveClass('nc-visually-hidden'); expect(primary.contains(summary)).toBe(true);
        expect(content).toHaveTextContent('Ticket 2'); expect(content).toHaveAttribute('data-nc-slot', 'renderAgendaItem'); expect(primary.contains(content)).toBe(true);
        expect(within(row('bar')).getByRole('button')).toHaveAccessibleName(/^Sprint.*Work Ticket 1$/);
        await user.click(within(row('chip')).getByText('Ticket 2'));
        expect(onItemPress).toHaveBeenCalledExactlyOnceWith({item: chip, date: '2026-03-04', view: 'agenda'});
        // Without onItemPress the row has no control: its text reads the hidden summary, then the custom content.
        view.unmount(); render(<Calendar {...input({renderAgendaItem: () => 'Passive'})}/>);
        await open(user);
        expect(within(row('chip')).queryByRole('button')).toBeNull(); expect(row('chip').textContent).toMatch(/^Standup.*Passive$/);
        expect(row('chip').querySelector('[data-nc-slot="renderAgendaItem"]')).toHaveTextContent('Passive');
    });
    // Spec v8 §12.1 (decision 4, 2026-10-22): the name of a custom row is the package summary followed by the visible slot
    // content; without the slot it is the summary as before. The same in the popover, the inline agenda and the sheet.
    it.each([['desktop', 'auto'], ['mobile', 'auto'], ['mobile', 'overlay']] as const)('%s/%s: the name is exactly the summary, then the visible slot content; without the slot the summary alone', async (layout, agendaPresentation) => {
        const user = userEvent.setup(), tree = (slot: boolean) => <Calendar {...input({layout, agendaPresentation, onItemPress() {},
            ...(slot ? {renderAgendaItem: context => <span>{`Ticket ${context.item.data.ticket}`}</span>} : {})})}/>;
        const view = render(tree(false));
        if (layout === 'desktop' || agendaPresentation === 'overlay') await open(user);
        /** The computed accessible name of the row's press control. */
        const name = (id: string) => { let found = ''; within(row(id)).getByRole('button', {name: value => { found = value; return true; }}); return found; };
        const plain = {chip: name('chip'), bar: name('bar')};
        expect(plain.chip).toMatch(/^Standup.*10:00 AM$/); expect(plain.bar).toMatch(/^Sprint.*Work$/);
        view.rerender(tree(true));
        expect(within(row('chip')).getByRole('button')).toHaveAccessibleName(`${plain.chip} Ticket 2`);
        expect(within(row('bar')).getByRole('button')).toHaveAccessibleName(`${plain.bar} Ticket 1`);
        expect(within(row('chip')).getByRole('button')).toHaveAccessibleDescription('');
    });
    it('isDisabled: no primary operation in Month; in the agenda, neither press nor a committed action', async () => {
        const user = userEvent.setup(), renderItem = vi.fn(() => 'x'), renderAgendaItem = vi.fn(() => 'y');
        render(<Calendar {...input({renderItem, renderAgendaItem, getItemActions: value => value.id === 'bar' ? [{id: 'open', label: 'Open'}] : [], onItemActionRequest() {}})}/>);
        expect(renderItem.mock.calls.every(([context]) => (context as {isDisabled: boolean}).isDisabled)).toBe(true);
        await open(user);
        expect(renderAgendaItem.mock.calls.map(([context]) => [(context as {item: CalendarItem}).item.id, (context as {isDisabled: boolean}).isDisabled]).slice(-2))
            .toEqual([['bar', false], ['chip', true]]);
    });
    it('renderDayHeader replaces the visible header only; the cell keeps its full accessible name and description', () => {
        const renderDayHeader = vi.fn(state => <span>{`D${state.date.slice(8)}${state.isToday ? '*' : ''}`}</span>);
        render(<Calendar {...input({renderDayHeader})}/>);
        expect(cell()).toHaveAccessibleName('Wednesday, March 4, 2026');
        expect(cell().querySelector('.nc-day-header')).toHaveTextContent('D04*'); expect(cell().querySelector('.nc-day-header')).toHaveAttribute('aria-hidden', 'true');
        expect(renderDayHeader).toHaveBeenCalledWith({date: '2026-03-04', isToday: true, isAgendaDate: true, isSelected: false, isSelectionDraft: false,
            isOutsideMonth: false, isSelectionUnavailable: false, itemCount: 2});
        expect(renderDayHeader).toHaveBeenCalledWith(expect.objectContaining({date: '2026-04-04', isOutsideMonth: true, itemCount: 0}));
    });
    it('renderToolbarContent adds an extension area after the package controls; its own control keeps a normal Tab stop', async () => {
        const user = userEvent.setup(), renderToolbarContent = vi.fn(() => <button type="button">Export</button>);
        render(<Calendar {...input({renderToolbarContent, visibleSourceIds: ['work'], onVisibleSourceIdsChange() {},
            sources: [work, {id: 'home', title: 'Home'}]})}/>);
        expect(renderToolbarContent).toHaveBeenLastCalledWith({kind: 'data', layout: 'desktop', density: 'compact', colorScheme: 'system', dir: 'ltr',
            dataState: {status: 'ready'}, anchorDate: '2026-03-01', visibleRange: {start: '2026-03-01', end: '2026-04-05', timeZone: 'UTC'}});
        const toolbar = screen.getByRole('button', {name: 'Previous month'}).closest('.nc-calendar-toolbar')!;
        expect([...toolbar.querySelectorAll('button')].map(node => node.getAttribute('aria-label') ?? node.textContent)).toEqual(['Previous month', 'Today', 'Next month', 'Calendars', 'Export']);
        expect(screen.getByRole('grid').contains(screen.getByRole('button', {name: 'Export'}))).toBe(false);
        act(() => screen.getByRole('button', {name: 'Calendars'}).focus()); await user.tab();
        expect(screen.getByRole('button', {name: 'Export'})).toHaveFocus(); await user.tab(); expect(cell()).toHaveFocus();
    });
});

describe('state slots (§10.4)', () => {
    it('replace only the default body of the named state region; the standard retry shows only without a custom data-error body', () => {
        const onRetryRequest = vi.fn(), renderLoading = vi.fn(() => 'Fetching…'), renderEmpty = vi.fn(() => 'Nothing here');
        const view = render(<Calendar {...input({items: [], dataState: {status: 'loading', phase: 'initial'}, onRetryRequest, renderLoading, renderEmpty})}/>);
        expect(screen.getByRole('region', {name: 'Loading calendar'})).toHaveTextContent('Fetching…');
        expect(renderLoading).toHaveBeenLastCalledWith({state: {status: 'loading', phase: 'initial'}, visibleRange: {start: '2026-03-01', end: '2026-04-05', timeZone: 'UTC'}});
        view.rerender(<Calendar {...input({items: [], onRetryRequest, renderLoading, renderEmpty})}/>);
        expect(screen.getByRole('region', {name: 'No events in this month'})).toHaveTextContent('Nothing here');
        expect(renderEmpty).toHaveBeenLastCalledWith({visibleRange: {start: '2026-03-01', end: '2026-04-05', timeZone: 'UTC'}});
        const error = new Error('down');
        view.rerender(<Calendar {...input({items: [], onRetryRequest, dataState: {status: 'error', phase: 'initial', error}})}/>);
        expect(within(screen.getByRole('region', {name: 'Could not load calendar'})).getByRole('button', {name: 'Retry'})).toBeInTheDocument();
        const renderError = vi.fn(context => <button type="button" onClick={onRetryRequest}>{context.kind === 'data' ? 'Try again' : 'Broken'}</button>);
        view.rerender(<Calendar {...input({items: [], onRetryRequest, renderError, dataState: {status: 'error', phase: 'initial', error}})}/>);
        expect(screen.queryByRole('button', {name: 'Retry'})).toBeNull(); expect(screen.getByRole('button', {name: 'Try again'})).toBeInTheDocument();
        expect(renderError).toHaveBeenLastCalledWith({kind: 'data', state: {status: 'error', phase: 'initial', error}, visibleRange: {start: '2026-03-01', end: '2026-04-05', timeZone: 'UTC'},
            hasStaleItems: false});
        // Contract branch: no range, no retry, the custom body inside the error region.
        view.rerender(<Calendar {...input({items: [], onRetryRequest, renderError, layout: 'tablet' as never})}/>);
        expect(renderError).toHaveBeenLastCalledWith({kind: 'contract', error: expect.any(RangeError), hasStaleItems: false});
        expect(screen.getByRole('region', {name: 'Calendar cannot be displayed: invalid configuration'})).toHaveTextContent('Broken');
        expect(screen.queryByRole('button', {name: 'Retry'})).toBeNull();
    });
});

describe('classNames (§10.4, §4.3.2)', () => {
    it('gives every surface its class from its exact typed state; data-only contexts never see the contract branch', async () => {
        const user = userEvent.setup(), seen: Record<string, unknown[]> = {};
        const spy = (name: string) => (state: unknown) => { (seen[name] ??= []).push(state); return `c-${name}`; };
        const names = ['root', 'toolbar', 'sourceSelector', 'grid', 'weekdayHeader', 'day', 'dayHeader', 'item', 'itemActions', 'overflowIndicator', 'agenda', 'agendaItem', 'status'] as const;
        const classNames = Object.fromEntries(names.map(name => [name, spy(name)]));
        const many = Array.from({length: 6}, (_, index) => ({...chip, id: `extra-${index}`, title: `Extra ${index}`}));
        render(<Calendar {...input({classNames, items: [bar, chip, ...many], sources: [work, {id: 'home', title: 'Home'}], visibleSourceIds: ['work', 'home'],
            onVisibleSourceIdsChange() {}, getItemActions: () => [{id: 'open', label: 'Open'}], onItemActionRequest() {}, onItemPress() {},
            dataState: {status: 'loading', phase: 'refresh'}})}/>);
        const root = screen.getByRole('region', {name: 'Calendar'}), data = {kind: 'data', layout: 'desktop', density: 'compact', colorScheme: 'system', dir: 'ltr',
            dataState: {status: 'loading', phase: 'refresh'}};
        expect(root).toHaveClass('nc-calendar', 'c-root'); expect(seen.root.at(-1)).toEqual(data); expect(seen.status.at(-1)).toEqual(data);
        expect(root.querySelector('.nc-calendar-toolbar')).toHaveClass('c-toolbar');
        expect(seen.toolbar.at(-1)).toEqual({...data, anchorDate: '2026-03-01', visibleRange: {start: '2026-03-01', end: '2026-04-05', timeZone: 'UTC'}});
        for (const name of ['sourceSelector', 'grid', 'weekdayHeader'] as const) for (const state of seen[name]) expect(state, name).toEqual(data);
        expect(screen.getByRole('button', {name: 'Calendars'})).toHaveClass('c-sourceSelector'); expect(screen.getByRole('grid')).toHaveClass('c-grid');
        expect(screen.getAllByRole('columnheader').every(node => node.classList.contains('c-weekdayHeader'))).toBe(true);
        expect(cell()).toHaveClass('nc-day', 'c-day'); expect(cell().querySelector('.nc-day-header')).toHaveClass('c-dayHeader');
        expect(seen.day).toContainEqual(expect.objectContaining({date: '2026-03-04', isToday: true, itemCount: 8}));
        expect(cell().querySelector('.nc-overflow')).toHaveClass('c-overflowIndicator');
        expect(seen.overflowIndicator.at(-1)).toMatchObject({date: expect.any(String), hiddenItemCount: expect.any(Number)});
        // Before the first measurement every item counts as hidden; the measured three lanes keep two and the indicator row.
        expect(seen.overflowIndicator.filter(state => (state as {date: string}).date === '2026-03-04').at(-1)).toMatchObject({itemCount: 8, hiddenItemCount: 6});
        expect(segments('bar')[0]).toHaveClass('c-item');
        await open(user);
        const agenda = screen.getByRole('dialog');
        expect(agenda).toHaveClass('nc-day-list', 'c-agenda'); expect(seen.agenda.at(-1)).toEqual({date: '2026-03-04', presentation: 'popover', itemCount: 8});
        expect(row('bar')).toHaveClass('c-agendaItem'); expect(within(row('bar')).getByRole('button', {name: 'Actions for ⁨Sprint⁩'})).toHaveClass('c-itemActions');
        expect(seen.itemActions.at(-1)).toMatchObject({view: 'agenda', date: '2026-03-04'});
        expect(names.filter(name => !seen[name]?.length)).toEqual([]);
    });
    it('classNames.itemActions runs only for a rendered actions trigger: never without the pair or for an empty set', async () => {
        const user = userEvent.setup(), itemActions = vi.fn(() => 'c-itemActions'), agendaItem = vi.fn(() => 'c-agendaItem');
        const view = render(<Calendar {...input({classNames: {itemActions, agendaItem}})}/>);
        await open(user);
        expect(agendaItem).toHaveBeenCalled(); expect(itemActions).not.toHaveBeenCalled();
        view.rerender(<Calendar {...input({classNames: {itemActions, agendaItem}, getItemActions: item => item.id === 'bar' ? [{id: 'open', label: 'Open'}] : [], onItemActionRequest() {}})}/>);
        expect(itemActions.mock.calls.length).toBeGreaterThan(0);
        expect((itemActions.mock.calls as unknown as [CalendarAgendaItemSlotContext<Data, SourceData>][]).every(([context]) => context.item.id === 'bar')).toBe(true);
        expect(within(row('bar')).getByRole('button', {name: 'Actions for ⁨Sprint⁩'})).toHaveClass('c-itemActions');
    });
    it('the safe contract shell resolves only root and status, with the contract state; no other class callback runs', () => {
        const forbidden = vi.fn(() => 'never'), root = vi.fn(() => 'c-root'), status = vi.fn(() => 'c-status');
        render(<Calendar {...input({layout: 'tablet' as never, classNames: {root, status, toolbar: forbidden, grid: forbidden, day: forbidden, item: forbidden, agenda: forbidden}})}/>);
        const contract = {kind: 'contract', layout: 'mobile', density: 'compact', colorScheme: 'system', dir: 'ltr', dataState: {status: 'error', phase: 'initial', error: expect.any(RangeError)}};
        expect(root).toHaveBeenLastCalledWith(contract); expect(status).toHaveBeenLastCalledWith(contract); expect(forbidden).not.toHaveBeenCalled();
        expect(document.querySelector('.nc-calendar')).toHaveClass('c-root'); expect(document.querySelector('.nc-calendar-status')).toHaveClass('c-status');
    });
    it('a callback result that is not a nonempty string adds no class; a field of the wrong type is a contract error', () => {
        const view = render(<Calendar {...input({classNames: {root: () => 5 as never, grid: '  ', day: () => undefined}})}/>);
        expect(document.querySelector('.nc-calendar')!.className).toBe('nc-theme nc-calendar'); expect(screen.getByRole('grid')).toHaveAttribute('class', 'nc-month');
        for (const [classNames, diagnostic] of [[{grid: 5}, 'classNames.grid: Expected a class name string or function'], ['root', 'classNames: Expected an object of class names']] as const) {
            view.rerender(<Calendar {...input({classNames: classNames as never})}/>);
            expect(screen.queryByRole('grid')).toBeNull(); expect(warnings()).toContain(`[@nelmad/calendar] ${diagnostic}`);
        }
    });
});

describe('passive slot content diagnostics (§10.4)', () => {
    it('warns once per slot about an interactive descendant after commit; passive content stays silent', async () => {
        const user = userEvent.setup();
        const props = input({renderItem: () => <a href="#ticket">Ticket</a>, renderDayHeader: state => state.isToday ? <span role="button">Today</span> : <b>{state.date.slice(8)}</b>,
            renderAgendaItem: () => <span><input aria-label="Done" type="checkbox"/></span>});
        const view = render(<StrictMode><Calendar {...props}/></StrictMode>);
        view.rerender(<StrictMode><Calendar {...props}/></StrictMode>);
        await open(user);
        const slots = warnings().filter(message => /^\[@nelmad\/calendar\] render(Item|DayHeader|AgendaItem):/.test(message));
        expect(slots).toEqual([
            '[@nelmad/calendar] renderDayHeader: Interactive content <span role="button"> is not allowed in passive slot content; use onItemPress or getItemActions',
            '[@nelmad/calendar] renderItem: Interactive content <a href> is not allowed in passive slot content; use onItemPress or getItemActions',
            '[@nelmad/calendar] renderAgendaItem: Interactive content <input> is not allowed in passive slot content; use onItemPress or getItemActions']);
        view.unmount(); warn.mockClear();
        render(<Calendar {...input({renderItem: () => <span className="badge" aria-hidden="true">P1</span>, renderAgendaItem: () => <><strong>Blocked</strong> <img alt="" src="data:,"/></>})}/>);
        await open(user);
        expect(warnings().filter(message => message.includes('passive slot'))).toEqual([]);
    });
    it('a production build reports nothing', async () => {
        vi.stubEnv('NODE_ENV', 'production'); vi.resetModules();
        const {Calendar: Production} = await import('../../../index.js');
        render(<Production {...input({renderItem: () => <button type="button">x</button>})}/>);
        expect(warnings().filter(message => message.includes('passive slot'))).toEqual([]);
    });
});

describe('item appearance channels (§10.3.3, R62)', () => {
    it('a source color sets only the accent; each resolver field replaces only its channel; unknown or missing sources keep the base accent', async () => {
        const user = userEvent.setup();
        const day = (id: string, calendarId?: string): CalendarItem<Data> => ({id, title: id, data: {ticket: 0}, ...(calendarId ? {calendarId} : {}),
            interval: {kind: 'allDay', start: '2026-03-04', end: '2026-03-05'}});
        const fields: Record<string, object> = {accent: {accentColor: 'rgb(7, 8, 9)'}, background: {backgroundColor: 'rgb(4, 5, 6)'}, text: {textColor: 'rgb(9, 9, 9)'}};
        render(<Calendar {...input({items: [day('plain', 'work'), day('accent', 'work'), day('background', 'work'), day('text', 'work'), day('none'), day('lost', 'gone')],
            getItemAppearance: value => fields[value.id] as never, onItemPress() {}})}/>);
        await open(user);
        const colors = (id: string) => {
            const surface = within(row(id)).getByRole('button'), marker = surface.querySelector<HTMLElement>('.nc-item-accent')!;
            return {background: surface.style.backgroundColor, text: surface.style.color, source: marker.style.color, accent: marker.querySelector('span')!.style.color};
        };
        expect(colors('plain')).toEqual({background: '', text: '', source: 'rgb(1, 2, 3)', accent: ''});
        expect(colors('accent')).toEqual({background: '', text: '', source: 'rgb(1, 2, 3)', accent: 'rgb(7, 8, 9)'});
        expect(colors('background')).toEqual({background: 'rgb(4, 5, 6)', text: '', source: 'rgb(1, 2, 3)', accent: ''});
        expect(colors('text')).toEqual({background: '', text: 'rgb(9, 9, 9)', source: 'rgb(1, 2, 3)', accent: ''});
        for (const id of ['none', 'lost']) expect(colors(id)).toEqual({background: '', text: '', source: '', accent: ''});
    });
    it('ignores blank, non-string and multi-declaration colors with one development warning each; nothing becomes a contract error or callback', async () => {
        const user = userEvent.setup(), onNavigate = vi.fn(), onAgendaDateChange = vi.fn();
        const sources: CalendarSource<SourceData>[] = [{id: 'work', title: 'Work', color: '  '}, {id: 'home', title: 'Home', color: 5 as never}, {id: 'gym', title: 'Gym', color: 'red;position:fixed'}];
        const items = ['work', 'home', 'gym'].map((calendarId, index) => ({...bar, id: `i${index}`, calendarId}));
        const appearance = (value: CalendarItem<Data>) => ({i0: {backgroundColor: ' '}, i1: {textColor: 3}, i2: {accentColor: 'blue !important', backgroundColor: 'not-a-color'}})[value.id] as never;
        render(<Calendar {...input({items, sources, getItemAppearance: appearance, onNavigate, agendaDate: '2026-03-04', onAgendaDateChange, onItemPress() {}})}/>);
        await open(user);
        expect(screen.getByRole('grid')).toBeInTheDocument(); expect(onNavigate).not.toHaveBeenCalled();
        const surface = within(row('i2')).getByRole('button');
        // A well-formed non-color reaches the engine, which rejects it at assignment: the lower channel stays.
        expect(surface.style.backgroundColor).toBe(''); expect(surface.querySelector<HTMLElement>('.nc-item-accent > span')!.style.color).toBe('');
        expect(warnings().filter(message => /sources\(|getItemAppearance\(/.test(message)).sort()).toEqual([
            '[@nelmad/calendar] getItemAppearance("i0").backgroundColor: Expected a nonempty CSS color string; ignored',
            '[@nelmad/calendar] getItemAppearance("i1").textColor: Expected a nonempty CSS color string; ignored',
            '[@nelmad/calendar] getItemAppearance("i2").accentColor: Expected a single CSS declaration value; ignored',
            '[@nelmad/calendar] sources("gym").color: Expected a single CSS declaration value; ignored',
            '[@nelmad/calendar] sources("home").color: Expected a nonempty CSS color string; ignored',
            '[@nelmad/calendar] sources("work").color: Expected a nonempty CSS color string; ignored']);
    });
    it('marks each source of the selector with its own valid color', async () => {
        const user = userEvent.setup();
        render(<Calendar {...input({sources: [work, {id: 'home', title: 'Home'}], visibleSourceIds: ['work'], onVisibleSourceIdsChange() {}})}/>);
        await user.click(screen.getByRole('button', {name: 'Calendars'}));
        const markers = screen.getAllByRole('menuitemcheckbox').map(node => node.querySelector<HTMLElement>('.nc-source-accent')!.style.color);
        expect(markers).toEqual(['rgb(1, 2, 3)', '']);
    });
});

describe('themes on the root and its portals (§10.2, §10.3.4)', () => {
    it('writes the preset literal on the root and every portal theme root; the contract shell is always classic', async () => {
        const user = userEvent.setup();
        const view = render(<Calendar {...input({theme: neutralTheme, density: 'comfortable', colorScheme: 'dark', dir: 'rtl'})}/>);
        const root = screen.getByRole('region', {name: 'Calendar'});
        expect([root.dataset.theme, root.dataset.density, root.dataset.colorScheme, root.dataset.dir]).toEqual(['neutral', 'comfortable', 'dark', 'rtl']);
        await open(user);
        const portal = screen.getByRole('dialog').closest<HTMLElement>('.nc-theme')!;
        expect(portal).not.toBe(root); expect([portal.dataset.theme, portal.dataset.density, portal.dataset.colorScheme, portal.dataset.dir, portal.lang])
            .toEqual(['neutral', 'comfortable', 'dark', 'rtl', root.lang]);
        view.rerender(<Calendar {...input({theme: neutralTheme, density: 'dense' as never})}/>);
        expect(document.querySelector('.nc-calendar')).toHaveAttribute('data-theme', 'classic');
        view.rerender(<Calendar {...input({theme: {name: 'neutral'} as never})}/>);
        expect(warnings()).toContain('[@nelmad/calendar] theme: Expected a package theme preset');
    });
});
