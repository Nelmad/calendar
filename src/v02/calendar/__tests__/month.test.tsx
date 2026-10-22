import {StrictMode} from 'react';
import {act, render, screen, within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {describe, expect, it, vi} from 'vitest';
import {Calendar, type CalendarProps} from '../../../index.js';
import {CalendarMonth} from '../CalendarMonth.js';

// Public alpha.1 props; upcoming features (selection, sources, mobile) use the internal CalendarMonth.
const props = (): CalendarProps => ({items: [], anchorDate: '2026-03-01', today: '2026-03-04', timeZone: 'UTC', locale: 'en-US', layout: 'desktop', onNavigate() {}});
const cell = (date: string) => screen.getAllByRole('gridcell').find(node => node.dataset.date === date)!;
const items = (count: number) => Array.from({length: count}, (_, index) => ({id: `item-${index}`, title: `Event ${String(index).padStart(4, '0')}`, data: {index},
    interval: {kind: 'allDay' as const, start: '2026-03-04', end: '2026-03-06'}}));

describe('semantic Month view', () => {
    it.each([['2026-02-01', 4], ['2026-03-01', 5], ['2026-08-01', 6]] as const)('exposes correct rows, columns and one Tab stop for %s', (month, weeks) => {
        render(<Calendar {...props()} anchorDate={month}/>);
        const grid = screen.getByRole('grid');
        expect(grid).toHaveAccessibleName(screen.getByRole('heading', {level: 2}).textContent!);
        expect(grid).toHaveAttribute('aria-rowcount', String(weeks + 1)); expect(grid).toHaveAttribute('aria-colcount', '7');
        expect(within(grid).getAllByRole('row')).toHaveLength(weeks + 1); expect(within(grid).getAllByRole('columnheader')).toHaveLength(7);
        expect(within(grid).getAllByRole('gridcell')).toHaveLength(weeks * 7);
        expect(grid.querySelectorAll('[role=gridcell][tabindex="0"]')).toHaveLength(1);
        expect(grid.querySelectorAll('[role=button],button')).toHaveLength(0);
        within(grid).getAllByRole('row').forEach((row, index) => expect(row).toHaveAttribute('aria-rowindex', String(index + 1)));
        expect(within(grid).getAllByRole('columnheader')[0]).toHaveAccessibleName('Sunday');
    });
    it('exposes accepted selection, today and complete counts while SSR lanes are unknown', () => {
        const input = {...props(), items: items(4), selection: {start: '2026-03-04', end: '2026-03-05'}, onSelectionChange() {}};
        render(<CalendarMonth {...input}/>);
        expect(cell('2026-03-04')).toHaveAttribute('aria-current', 'date'); expect(cell('2026-03-04')).toHaveAttribute('aria-selected', 'true');
        expect(cell('2026-03-05')).toHaveAttribute('aria-selected', 'false'); expect(cell('2026-03-04')).toHaveAttribute('data-has-items', 'true');
        expect(cell('2026-03-04')).toHaveAccessibleName('Wednesday, March 4, 2026');
        expect(cell('2026-03-04').querySelector('.nc-overflow')).toHaveTextContent('+4');
        expect(cell('2026-03-04').querySelector('.nc-overflow')).toHaveAttribute('aria-hidden', 'true');
        expect(screen.queryByText('Event 0000')).toBeNull();
    });
    it('supports RTL arrows, chronological Home/End and controlled page navigation', async () => {
        const user = userEvent.setup(), onNavigate = vi.fn(), input = {...props(), dir: 'rtl' as const, onNavigate};
        const view = render(<Calendar {...input}/>);
        act(() => cell('2026-03-04').focus()); await user.keyboard('{ArrowLeft}'); expect(cell('2026-03-05')).toHaveFocus();
        await user.keyboard('{Home}'); expect(cell('2026-03-01')).toHaveFocus();
        await user.keyboard('{End}'); expect(cell('2026-03-07')).toHaveFocus();
        await user.keyboard('{Home}{PageDown}'); expect(onNavigate).toHaveBeenCalledExactlyOnceWith('2026-04-01'); expect(cell('2026-03-01')).toHaveFocus();
        view.rerender(<Calendar {...input} anchorDate="2026-04-01"/>); expect(cell('2026-04-01')).toHaveFocus();
    });
    it.each([['en-US', 'rtl'], ['ar', undefined]] as const)('R15.2 %s %s: delayed PageDown on 31 January clamps after acceptance; RTL arrows; a late acceptance after Tab-away keeps external focus',
        async (locale, dir) => {
            const user = userEvent.setup(), onNavigate = vi.fn(), input = {...props(), locale, ...(dir ? {dir} : {}), anchorDate: '2026-01-01', onNavigate};
            const tree = (value: CalendarProps) => <StrictMode><Calendar {...value}/><button>After</button></StrictMode>;
            const view = render(tree(input));
            expect(document.querySelector('.nc-calendar')).toHaveAttribute('data-dir', 'rtl');
            act(() => cell('2026-01-30').focus()); await user.keyboard('{ArrowLeft}'); expect(cell('2026-01-31')).toHaveFocus();
            await user.keyboard('{PageDown}');
            expect(onNavigate).toHaveBeenCalledExactlyOnceWith('2026-02-01'); expect(cell('2026-01-31')).toHaveFocus();
            view.rerender(tree({...input, anchorDate: '2026-02-01'})); expect(cell('2026-02-28')).toHaveFocus();
            await user.keyboard('{ArrowRight}'); expect(cell('2026-02-27')).toHaveFocus();
            await user.keyboard('{PageDown}'); expect(onNavigate).toHaveBeenLastCalledWith('2026-03-01');
            await user.tab(); expect(screen.getByRole('button', {name: 'After'})).toHaveFocus();
            view.rerender(tree({...input, anchorDate: '2026-03-01'}));
            expect(screen.getByRole('button', {name: 'After'})).toHaveFocus(); expect(cell('2026-03-27')).toHaveAttribute('tabindex', '0');
        });
    it('opens the complete list via Enter, refocuses it on repeated activation and emits agenda payloads', async () => {
        const user = userEvent.setup(), onItemPress = vi.fn(), input = {...props(), items: items(30), onItemPress};
        render(<StrictMode><Calendar {...input}/></StrictMode>);
        act(() => cell('2026-03-04').focus()); await user.keyboard('{Enter}');
        expect(screen.getByRole('button', {name: 'Close day agenda'})).toHaveFocus(); expect(screen.getAllByRole('listitem')).toHaveLength(30);
        await user.click(screen.getByRole('button', {name: /Event 0029/}));
        expect(onItemPress).toHaveBeenCalledExactlyOnceWith({item: input.items[29], date: '2026-03-04', view: 'agenda'});
        act(() => cell('2026-03-04').focus()); await user.keyboard('{Enter}'); expect(screen.getByRole('button', {name: 'Close day agenda'})).toHaveFocus();
    });
    it('pointer overflow opens the same full list with desktop initial focus', async () => {
        const user = userEvent.setup(); render(<Calendar {...props()} items={items(5)}/>);
        await user.click(cell('2026-03-04').querySelector('.nc-overflow')!);
        expect(screen.getByRole('button', {name: 'Close day agenda'})).toHaveFocus(); expect(screen.getAllByRole('listitem')).toHaveLength(5);
    });
    it('waits for controlled agenda acceptance and cancels delayed focus after leaving the cell', async () => {
        const user = userEvent.setup(), onAgendaDateChange = vi.fn(), input = {...props(), agendaDate: '2026-03-01', onAgendaDateChange, items: items(2)};
        const tree = (value: CalendarProps) => <><button>Outside</button><Calendar {...value}/></>;
        const view = render(tree(input)); act(() => cell('2026-03-04').focus()); await user.keyboard('{Enter}');
        expect(onAgendaDateChange).toHaveBeenCalledExactlyOnceWith('2026-03-04'); expect(screen.queryByRole('list')).toBeNull();
        await user.click(screen.getByRole('button', {name: 'Outside'})); view.rerender(tree({...input, agendaDate: '2026-03-04'}));
        expect(screen.getByRole('button', {name: 'Outside'})).toHaveFocus(); expect(screen.queryByRole('list')).toBeNull();
        act(() => cell('2026-03-04').focus()); await user.keyboard('{Enter}');
        expect(screen.getAllByRole('listitem')).toHaveLength(2); expect(screen.getByRole('button', {name: 'Close day agenda'})).toHaveFocus();
        expect(onAgendaDateChange).toHaveBeenCalledTimes(1);
    });
    it('mobile uses indicators and a single readable inline list', () => {
        render(<CalendarMonth {...props()} layout="mobile" items={items(2)}/>);
        expect(document.querySelector('.nc-overflow')).toBeNull(); expect(document.querySelectorAll('.nc-day-indicator')).toHaveLength(2);
        expect(screen.getAllByRole('listitem')).toHaveLength(2); expect(screen.queryByRole('button', {name: /Event/})).toBeNull();
        expect(cell('2026-03-04')).not.toHaveAttribute('aria-selected');
    });
    it('shows both timed endpoint dates in the calendar timezone and localizes an empty title', () => {
        const input = {...props(), layout: 'mobile' as const, locale: 'ar', timeZone: 'America/Los_Angeles', items: [{id: 'night', title: '', data: {},
            interval: {kind: 'timed' as const, start: '2026-03-04T07:00:00Z', end: '2026-03-05T07:00:00Z'}}]};
        const view = render(<CalendarMonth {...input}/>);
        const title = screen.getByText('Untitled'); expect(title.closest('[lang]')).toHaveAttribute('lang', 'en-US');
        view.rerender(<CalendarMonth {...input} locale="en-US"/>);
        const row = screen.getByRole('listitem'); expect(row).toHaveTextContent('Mar 3, 2026'); expect(row).toHaveTextContent('Mar 4, 2026');
        expect(row).toHaveTextContent('11:00 PM'); expect(within(row).queryByRole('button')).toBeNull();
    });
    it('uses the same accepted source filter and order for cell counts and the complete day list', async () => {
        const user = userEvent.setup(), all = items(3).map((item, index) => ({...item, calendarId: index === 1 ? 'hidden' : 'shown'}));
        render(<CalendarMonth {...props()} items={all} sources={[{id: 'shown', title: 'Shown'}, {id: 'hidden', title: 'Hidden'}]}
            visibleSourceIds={['shown']} onVisibleSourceIdsChange={() => {}} sortItems={(a, b) => b.id.localeCompare(a.id)}/>);
        expect(cell('2026-03-04').querySelector('.nc-overflow')).toHaveTextContent('+2');
        await user.click(cell('2026-03-04'));
        const rows = screen.getAllByRole('listitem'); expect(rows.map(row => row.dataset.itemId)).toEqual(['item-2', 'item-0']);
        expect(rows.every(row => row.textContent?.includes('Shown'))).toBe(true);
        expect(screen.queryByText('Hidden')).toBeNull();
    });
});

describe('Month fixes from QA-2026-10-07', () => {
    it('scrolls a cell into view for keyboard focus, never for the focus of a pointer press (QA-12)', async () => {
        const user = userEvent.setup(), scroll = vi.fn();
        const original = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollIntoView');
        Object.defineProperty(Element.prototype, 'scrollIntoView', {configurable: true, value: scroll});
        try {
            render(<><button>Before</button><Calendar {...props()}/></>);
            const press = async (date: string) => {
                await user.pointer({keys: '[MouseLeft>]', target: cell(date)}); await user.pointer({keys: '[/MouseLeft]', target: screen.getByRole('button', {name: 'Before'})});
            };
            await press('2026-03-18');
            expect(cell('2026-03-18')).toHaveFocus(); expect(scroll).not.toHaveBeenCalled();
            await user.keyboard('{ArrowDown}'); expect(cell('2026-03-25')).toHaveFocus();
            expect(scroll).toHaveBeenCalledTimes(1); expect(scroll.mock.contexts[0]).toBe(cell('2026-03-25'));
            // A press that does not move focus leaves no stale pointer state for the next keyboard focus.
            await press('2026-03-25'); await user.keyboard('{ArrowUp}{ArrowDown}');
            expect(scroll.mock.contexts.slice(1)).toEqual([cell('2026-03-18'), cell('2026-03-25')]);
        } finally {
            if (original) Object.defineProperty(Element.prototype, 'scrollIntoView', original); else delete (Element.prototype as {scrollIntoView?: unknown}).scrollIntoView;
        }
    });
    it('scrolls a cell again when focus returns to it after a press that did not move focus (QA-D-1-06)', async () => {
        const user = userEvent.setup(), scroll = vi.fn();
        const original = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollIntoView');
        Object.defineProperty(Element.prototype, 'scrollIntoView', {configurable: true, value: scroll});
        try {
            render(<Calendar {...props()} items={items(1)}/>);
            await user.click(cell('2026-03-03')); await user.keyboard('{Escape}');
            expect(cell('2026-03-03')).toHaveFocus(); scroll.mockClear();
            // The cell already has focus: this press opens its agenda without a focus event on the cell.
            await user.click(cell('2026-03-03')); expect(screen.getByRole('dialog')).toBeInTheDocument();
            await user.keyboard('{Escape}');
            expect(cell('2026-03-03')).toHaveFocus(); expect(scroll.mock.contexts).toEqual([cell('2026-03-03')]);
        } finally {
            if (original) Object.defineProperty(Element.prototype, 'scrollIntoView', original); else delete (Element.prototype as {scrollIntoView?: unknown}).scrollIntoView;
        }
    });
    it('mirrors the weekday row size and keeps the measured view size for a blocking status (QA-D-1-03, -05)', () => {
        // jsdom has no layout: the computed block sizes of the measured boxes are given here.
        const sizes: Record<string, string> = {'nc-month-weekdays': '34px', 'nc-calendar-view': '500px', 'nc-month-weeks': '400px'};
        const original = window.getComputedStyle.bind(window);
        vi.spyOn(window, 'getComputedStyle').mockImplementation((node, pseudo) => {
            const style = original(node, pseudo), size = [...node.classList].map(name => sizes[name]).find(Boolean);
            return new Proxy(style, {get: (target, key) => key === 'height' && size ? size : typeof Reflect.get(target, key) === 'function'
                ? (Reflect.get(target, key) as (...args: unknown[]) => unknown).bind(target) : Reflect.get(target, key)});
        });
        try {
            const tree = (input: Partial<CalendarProps>) => <StrictMode><CalendarMonth {...props()} anchorDate="2026-01-01" {...input}/></StrictMode>;
            const view = render(tree({dataState: {status: 'error', phase: 'refresh', error: 1}, onRetryRequest() {}}));
            const calendarView = () => document.querySelector<HTMLElement>('.nc-calendar-view')!;
            expect(calendarView().style.getPropertyValue('--nc-weekdays-block-size')).toBe('34px');
            view.rerender(tree({}));
            expect(calendarView().style.getPropertyValue('--nc-weekdays-block-size')).toBe('34px');
            // Five weeks of 80 px in a 500 px view: a blocking status keeps 500 px, and 580 px for a six-week month.
            const reserve = () => document.querySelector<HTMLElement>('.nc-calendar-status')!.style.getPropertyValue('--nc-reserved-block-size');
            view.rerender(tree({dataState: {status: 'loading', phase: 'initial'}})); expect(reserve()).toBe('500px');
            view.rerender(tree({dataState: {status: 'error', phase: 'initial', error: 1}})); expect(reserve()).toBe('500px');
            view.rerender(tree({anchorDate: '2026-08-01', dataState: {status: 'loading', phase: 'initial'}})); expect(reserve()).toBe('580px');
            // A measurement of another density does not apply: the stylesheet estimate does.
            view.rerender(tree({anchorDate: '2026-08-01', density: 'comfortable', dataState: {status: 'loading', phase: 'initial'}})); expect(reserve()).toBe('');
        } finally { vi.restoreAllMocks(); }
    });
    it('keeps the grid instructions outside the grid, which owns only rows (QA-19)', () => {
        render(<Calendar {...props()} items={items(5)}/>);
        const grid = screen.getByRole('grid'), instructions = document.getElementById(grid.getAttribute('aria-describedby')!)!;
        expect(instructions).toHaveTextContent(/arrow/i); expect(grid.contains(instructions)).toBe(false);
        expect([...grid.children].filter(child => child.getAttribute('aria-hidden') !== 'true').map(child => child.getAttribute('role'))).toEqual(['row', 'rowgroup']);
        expect(grid).toHaveAccessibleDescription(instructions.textContent!);
    });
    it('isolates the +N indicator left to right so RTL keeps the sign first (QA-17)', () => {
        render(<Calendar {...props()} locale="ar" items={items(5)}/>);
        const indicator = cell('2026-03-04').querySelector('.nc-overflow')!;
        expect(indicator.firstElementChild).toHaveAttribute('dir', 'ltr'); expect(indicator.firstElementChild?.tagName).toBe('BDI');
        expect(indicator.textContent).toBe('+' + new Intl.NumberFormat('ar').format(5));
    });
});

describe('data states of the Month (QA-D-3)', () => {
    it('marks the grid and an inline agenda busy during a refresh; the root, view, live regions and progress stay outside', () => {
        const tree = (input: Partial<CalendarProps>) => <CalendarMonth {...props()} layout="mobile" {...input}/>;
        const view = render(tree({dataState: {status: 'loading', phase: 'refresh'}}));
        expect(screen.getByRole('grid')).toHaveAttribute('aria-busy', 'true');
        expect(document.querySelector('[data-presentation=inline]')).toHaveAttribute('aria-busy', 'true');
        for (const node of [document.querySelector('.nc-calendar'), document.querySelector('.nc-calendar-view'), screen.getByRole('status'), screen.getByRole('alert'),
            screen.getByRole('progressbar')]) expect(node!.closest('[aria-busy]')).toBeNull();
        // §9: a refresh error keeps the stale content without `aria-busy`.
        view.rerender(tree({dataState: {status: 'error', phase: 'refresh', error: 1}})); expect(document.querySelectorAll('[aria-busy]')).toHaveLength(0);
        view.rerender(tree({})); expect(document.querySelectorAll('[aria-busy]')).toHaveLength(0);
    });
    it('repositions an open popover when a box that holds its anchor changes size, without a scroll (QA-D-3-02)', async () => {
        class FakeObserver {
            static active = new Set<FakeObserver>();
            readonly targets = new Set<Element>();
            constructor(readonly callback: ResizeObserverCallback) { FakeObserver.active.add(this); }
            observe(target: Element) { this.targets.add(target); }
            unobserve(target: Element) { this.targets.delete(target); }
            disconnect() { this.targets.clear(); FakeObserver.active.delete(this); }
        }
        vi.stubGlobal('ResizeObserver', FakeObserver);
        try {
            const user = userEvent.setup();
            render(<Calendar {...props()} items={items(1)}/>);
            const anchor = cell('2026-03-11'); let top = 200;
            vi.spyOn(anchor, 'getBoundingClientRect').mockImplementation(() => ({x: 100, y: top, left: 100, top, right: 200, bottom: top + 100, width: 100, height: 100, toJSON() {}}) as DOMRect);
            await user.click(anchor);
            const positioner = screen.getByRole('dialog').closest<HTMLElement>('.nc-positioned-popover')!, before = positioner.style.top;
            const root = document.querySelector('.nc-calendar')!, watching = [...FakeObserver.active].filter(observer => observer.targets.has(anchor) && observer.targets.has(root));
            expect(watching).toHaveLength(1);
            // A refresh error banner above the grid: the root grows and the anchor moves down by 62 px.
            top = 262;
            act(() => watching[0].callback([{target: root} as unknown as ResizeObserverEntry], watching[0] as unknown as ResizeObserver));
            expect(Number.parseFloat(positioner.style.top) - Number.parseFloat(before)).toBe(62);
        } finally { vi.unstubAllGlobals(); vi.restoreAllMocks(); }
    });
});

// Review 2026-10-09-3: the boundary reason is its own sentence; weekday labels that do not fit use the narrow format (§12.5).
describe('grid description and weekday fit', () => {
    it.each([
        ['en-US', undefined, 'Use arrow keys to navigate dates. Enter opens day events. Page Up and Page Down change the month. Month is outside the supported range'],
        ['en-US', 'Arrows move', 'Arrows move Month is outside the supported range'],
        ['ru-RU', undefined, 'Стрелки — перейти к дате. Enter — открыть события дня. Page Up и Page Down — сменить месяц. Месяц вне поддерживаемого диапазона'],
    ])('%s (%s): the grid description separates the instructions from the boundary reason', (locale, instructions, description) => {
        render(<Calendar {...props()} locale={locale} anchorDate="9999-11-01" today="9999-11-01" messages={instructions ? {gridInstructions: instructions} : undefined}/>);
        expect(screen.getByRole('grid')).toHaveAccessibleDescription(description);
    });
    function widths(label: number, column = 39) {
        const original = window.getComputedStyle.bind(window);
        return vi.spyOn(window, 'getComputedStyle').mockImplementation((element, pseudo) => {
            const style = original(element, pseudo), node = element as HTMLElement;
            const width = node.classList.contains('nc-weekday-label') ? `${label}px` : node.classList.contains('nc-weekday') ? `${column + 4}px` : undefined;
            return width ? new Proxy(style, {get: (target, key) => key === 'width' ? width : key === 'paddingLeft' || key === 'paddingRight' ? '2px' : Reflect.get(target, key)}) : style;
        });
    }
    it('a short label wider than its column switches the header row to narrow labels; names stay complete', () => {
        const spy = widths(47);
        try {
            render(<Calendar {...props()} locale="ar-EG"/>);
            const row = screen.getAllByRole('row')[0], headers = screen.getAllByRole('columnheader');
            expect(row).toHaveAttribute('data-narrow-weekdays');
            expect(headers.map(node => node.dataset.narrowLabel)).toEqual(['س', 'ح', 'ن', 'ث', 'ر', 'خ', 'ج']);
            expect(headers[5]).toHaveAccessibleName('الخميس'); expect(headers[5]).toHaveTextContent('الخميس');
        } finally { spy.mockRestore(); }
    });
    it('labels that fit keep the short format', () => {
        const spy = widths(30);
        try { render(<Calendar {...props()}/>); expect(screen.getAllByRole('row')[0]).not.toHaveAttribute('data-narrow-weekdays'); } finally { spy.mockRestore(); }
    });
});
