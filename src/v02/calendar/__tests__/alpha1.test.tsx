import {StrictMode} from 'react';
import {act, render, screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {hydrateRoot} from 'react-dom/client';
import {renderToString} from 'react-dom/server';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {Calendar, getCalendarVisibleRange, type CalendarItem, type CalendarProps} from '../../../index.js';

// T14 alpha.1 acceptance rows through the public facade (ledger R01, R02.1, R05, R06, R07, R16, R59, §5.1).
const base = (): CalendarProps => ({items: [], anchorDate: '2026-09-01', today: '2026-09-03', timeZone: 'Europe/Moscow', locale: 'en-US', layout: 'desktop', onNavigate() {}});
const cell = (date: string) => screen.getAllByRole('gridcell').find(node => node.dataset.date === date)!;
const timed = (id: string, start: string, end?: string): CalendarItem => ({id, title: id, data: null, interval: {kind: 'timed', start, ...(end ? {end} : {})}});
const allDay = (id: string, start: string, end: string): CalendarItem => ({id, title: id, data: null, interval: {kind: 'allDay', start, end}});
const warnings = (spy: ReturnType<typeof vi.spyOn>) => spy.mock.calls.map(([message]) => String(message));
let warn: ReturnType<typeof vi.spyOn>;
beforeEach(() => { warn = vi.spyOn(console, 'warn').mockImplementation(() => {}); });
afterEach(() => { vi.restoreAllMocks(); });

describe('alpha.1 intervals through the public Calendar', () => {
    it('R01: shows a one-day all-day item only on its date and drops an empty interval from counts and agenda', async () => {
        const user = userEvent.setup();
        render(<Calendar {...base()} items={[allDay('one-day', '2026-09-03', '2026-09-04'), allDay('empty', '2026-09-03', '2026-09-03')]}/>);
        expect(cell('2026-09-03')).toHaveAccessibleDescription(/Sep 3, 2026\s?: 1 event/);
        for (const date of ['2026-09-02', '2026-09-04']) expect(cell(date)).toHaveAccessibleDescription(/\s?: 0 events/);
        expect(warnings(warn).some(message => /items\[1\]/.test(message))).toBe(true);
        act(() => cell('2026-09-03').focus()); await user.keyboard('{Enter}');
        expect(screen.getAllByRole('listitem').map(node => node.dataset.itemId)).toEqual(['one-day']);
    });
    it('R02.1: an interval ending at local midnight and a moment at midnight each belong to one date', () => {
        render(<Calendar {...base()} items={[timed('late', '2026-09-03T23:00:00+03:00', '2026-09-04T00:00:00+03:00'), timed('moment', '2026-09-04T00:00:00+03:00')]}/>);
        expect(cell('2026-09-03')).toHaveAccessibleDescription(/Sep 3, 2026\s?: 1 event/);
        expect(cell('2026-09-04')).toHaveAccessibleDescription(/Sep 4, 2026\s?: 1 event/);
        expect(cell('2026-09-05')).toHaveAccessibleDescription(/\s?: 0 events/);
    });
});

describe('alpha.1 navigation through the public Calendar', () => {
    it('§5.1: the anchor day does not select the month and toolbar navigation waits for accepted props', async () => {
        const user = userEvent.setup(), onNavigate = vi.fn(), onVisibleRangeChange = vi.fn();
        const input = {...base(), anchorDate: '2026-09-17', onNavigate, onVisibleRangeChange};
        const view = render(<Calendar {...input}/>);
        expect(screen.getByRole('heading', {level: 2})).toHaveTextContent('September 2026');
        expect(onVisibleRangeChange.mock.calls).toEqual([[{start: '2026-08-30', end: '2026-10-04', timeZone: 'Europe/Moscow'}]]);
        await user.click(screen.getByRole('button', {name: 'Next month'}));
        expect(onNavigate).toHaveBeenCalledExactlyOnceWith('2026-10-01');
        expect(screen.getByRole('heading', {level: 2})).toHaveTextContent('September 2026'); expect(onVisibleRangeChange).toHaveBeenCalledTimes(1);
        view.rerender(<Calendar {...input} anchorDate="2026-10-31"/>);
        expect(screen.getByRole('heading', {level: 2})).toHaveTextContent('October 2026');
        expect(onVisibleRangeChange).toHaveBeenLastCalledWith({start: '2026-09-27', end: '2026-11-01', timeZone: 'Europe/Moscow'});
    });
    it.each([
        ['0001-02-01', 'Previous month', ['{PageUp}', '{Shift>}{PageUp}{/Shift}'], '0001-01-28'],
        ['9999-11-01', 'Next month', ['{PageDown}', '{Shift>}{PageDown}{/Shift}'], '9999-11-30'],
    ])('R05: renders the complete boundary month %s and blocks further navigation', async (anchorDate, button, keys, focus) => {
        const user = userEvent.setup(), onNavigate = vi.fn();
        render(<Calendar {...base()} timeZone="UTC" anchorDate={anchorDate} today={anchorDate} onNavigate={onNavigate}/>);
        const cells = screen.getAllByRole('gridcell');
        expect(cells.length % 7).toBe(0); expect(cells.length).toBeGreaterThanOrEqual(28);
        expect(cells.every(node => /^\d{4}-\d{2}-\d{2}$/.test(node.dataset.date!))).toBe(true);
        expect(screen.getByRole('button', {name: button})).toBeDisabled();
        expect(screen.getByRole('button', {name: button})).toHaveAccessibleDescription('Month is outside the supported range');
        expect(screen.getByRole('grid')).toHaveAccessibleDescription(/Month is outside the supported range/);
        act(() => cell(focus).focus());
        for (const key of keys) await user.keyboard(key);
        expect(onNavigate).not.toHaveBeenCalled(); expect(cell(focus)).toHaveFocus();
    });
    it.each([
        ['9999-11-15', '9999-12-03', '9999-12-31'],
        ['0001-02-15', '0001-01-29', '0001-01-02'],
    ])('§11.3: in the boundary month %s, a Today in the grid (%s) stays available and is focused there; one outside the grid is not', async (anchorDate, today, outside) => {
        const user = userEvent.setup(), onNavigate = vi.fn();
        const view = render(<Calendar {...base()} timeZone="UTC" anchorDate={anchorDate} today={today} onNavigate={onNavigate}/>);
        const button = screen.getByRole('button', {name: 'Today'});
        expect(button).toBeEnabled(); expect(button).not.toHaveAccessibleDescription();
        await user.click(button);
        expect(cell(today)).toHaveFocus(); expect(onNavigate).not.toHaveBeenCalled();
        view.rerender(<Calendar {...base()} timeZone="UTC" anchorDate={anchorDate} today={outside} onNavigate={onNavigate}/>);
        expect(screen.getByRole('button', {name: 'Today'})).toBeDisabled();
        expect(screen.getByRole('button', {name: 'Today'})).toHaveAccessibleDescription('Month is outside the supported range');
    });
    it('R05: rejects an instant past the domain and keeps the representable part of a clipped interval', () => {
        render(<Calendar {...base()} timeZone="America/New_York" anchorDate="0001-02-01" today="0001-02-01"
            items={[timed('overflow', '9999-12-31T23:59:59-23:59'), timed('clipped', '0001-01-01T00:00:00Z', '0001-02-03T00:00:00Z')]}/>);
        expect(warnings(warn).some(message => /items\[0\]/.test(message))).toBe(true);
        expect(warnings(warn).some(message => /items\[1\]/.test(message))).toBe(false);
        for (const date of ['0001-01-28', '0001-02-01', '0001-02-02']) expect(cell(date)).toHaveAccessibleDescription(/\s?: 1 event/);
        expect(cell('0001-02-03')).toHaveAccessibleDescription(/\s?: 0 events/);
    });
    it('R16: Today in StrictMode moves focus once without an announcement; a stale acceptance cancels the intent', async () => {
        const user = userEvent.setup(), onNavigate = vi.fn(), input = {...base(), anchorDate: '2026-03-01', today: '2026-06-15', onNavigate};
        const tree = (props: CalendarProps) => <StrictMode><button>Outside</button><Calendar {...props}/></StrictMode>;
        const view = render(tree(input)), live = screen.getByRole('status');
        await user.click(screen.getByRole('button', {name: 'Today'}));
        expect(onNavigate).toHaveBeenCalledExactlyOnceWith('2026-06-01'); expect(screen.getByRole('button', {name: 'Today'})).toHaveFocus();
        view.rerender(tree({...input, anchorDate: '2026-06-01'}));
        expect(cell('2026-06-15')).toHaveFocus(); expect(live).toBeEmptyDOMElement();
        view.rerender(tree({...input, anchorDate: '2026-03-01'}));
        await user.click(screen.getByRole('button', {name: 'Today'}));
        view.rerender(tree({...input, anchorDate: '2026-05-01'}));
        expect(screen.getByRole('button', {name: 'Today'})).toHaveFocus();
        view.rerender(tree({...input, anchorDate: '2026-06-01'}));
        expect(screen.getByRole('button', {name: 'Today'})).toHaveFocus(); expect(cell('2026-06-15')).not.toHaveFocus();
        expect(live).toBeEmptyDOMElement(); expect(onNavigate).toHaveBeenCalledTimes(2);
    });
});

describe('alpha.1 focus rules through the public Calendar (§5.1.1, R49)', () => {
    it('§5.1.1: arrows inside the grid move focus immediately without navigation or agenda changes', async () => {
        const user = userEvent.setup(), onNavigate = vi.fn(), onAgendaDateChange = vi.fn();
        render(<Calendar {...base()} agendaDate="2026-09-03" onAgendaDateChange={onAgendaDateChange} onNavigate={onNavigate}/>);
        act(() => cell('2026-09-03').focus());
        // The September grid starts on Sunday 30 August: every target stays inside the rendered grid.
        await user.keyboard('{ArrowLeft}{ArrowLeft}{ArrowLeft}{ArrowLeft}');
        expect(cell('2026-08-30')).toHaveFocus();
        await user.keyboard('{ArrowDown}{End}');
        expect(cell('2026-09-12')).toHaveFocus(); expect(cell('2026-09-12')).toHaveAttribute('tabindex', '0');
        expect(onNavigate).not.toHaveBeenCalled(); expect(onAgendaDateChange).not.toHaveBeenCalled();
    });
    it('§5.1.1: focus moved into the new month grid replaces the toolbar announcement', async () => {
        const user = userEvent.setup(), input = base();
        const view = render(<Calendar {...input}/>), live = screen.getByRole('status');
        await user.click(screen.getByRole('button', {name: 'Next month'}));
        act(() => cell('2026-09-30').focus());
        view.rerender(<Calendar {...input} anchorDate="2026-10-01"/>);
        // The focused grid keeps the day number in the accepted month; its cell name reports the new date.
        expect(cell('2026-10-30')).toHaveFocus(); expect(live).toBeEmptyDOMElement();
    });
    it('§5.1.1: an external month change clamps the roving date and leaves focus outside the grid in place', async () => {
        const input = {...base(), anchorDate: '2026-01-01', today: '2026-01-31'};
        const view = render(<Calendar {...input}/>), live = screen.getByRole('status');
        act(() => screen.getByRole('button', {name: 'Next month'}).focus());
        view.rerender(<Calendar {...input} anchorDate="2026-02-01"/>);
        expect(screen.getByRole('button', {name: 'Next month'})).toHaveFocus();
        expect(cell('2026-02-28')).toHaveAttribute('tabindex', '0'); expect(live).toBeEmptyDOMElement();
    });
    it('R49: valid same-root IDs keep their order and priority; invalid ones are dropped with a development warning', () => {
        render(<><span id="second">Release</span><span id="first">Plan</span>
            <Calendar {...base()} aria-label="Fallback" aria-labelledby="first missing second"/></>);
        const root = screen.getByRole('region', {name: 'Plan Release'});
        expect(root).toHaveAttribute('aria-labelledby', 'first second'); expect(root).toHaveAttribute('aria-label', 'Fallback');
        expect(warnings(warn).filter(message => message.includes('aria-labelledby') && message.includes('missing'))).toHaveLength(1);
    });
});

describe('alpha.1 SSR and locales through the public Calendar', () => {
    it.each([[undefined, '2026-08-30'], ['monday', '2026-08-31'], ['saturday', '2026-08-29']] as const)('R06: helper equals the first hydrated callback for firstDayOfWeek=%s', async (firstDayOfWeek, start) => {
        const first = vi.fn(), second = vi.fn();
        const input = {...base(), ...(firstDayOfWeek ? {firstDayOfWeek} : {})};
        const range = getCalendarVisibleRange({anchorDate: input.anchorDate, timeZone: input.timeZone, locale: input.locale, ...(firstDayOfWeek ? {firstDayOfWeek} : {})});
        expect(range.start).toBe(start);
        const container = document.createElement('div'); document.body.append(container);
        container.innerHTML = renderToString(<StrictMode><Calendar {...input} onVisibleRangeChange={first}/></StrictMode>);
        expect(first).not.toHaveBeenCalled();
        // Spied after the server render: jsdom makes isomorphic layout effects warn in renderToString only.
        const error = vi.spyOn(console, 'error').mockImplementation(() => {});
        let root: ReturnType<typeof hydrateRoot> | undefined;
        try {
            await act(async () => { root = hydrateRoot(container, <StrictMode><Calendar {...input} onVisibleRangeChange={first}/></StrictMode>); });
            expect(first.mock.calls).toEqual([[range]]);
            await act(async () => root!.render(<StrictMode><Calendar {...input} onVisibleRangeChange={second}/></StrictMode>));
            expect(second).not.toHaveBeenCalled(); expect(error).not.toHaveBeenCalled();
        } finally { act(() => root?.unmount()); container.remove(); }
    });
    it('R06: the helper throws RangeError synchronously for malformed input', () => {
        for (const options of [{anchorDate: '2026-13-01', timeZone: 'UTC'}, {anchorDate: '2026-09-01', timeZone: 'Mars/Olympus'}, {anchorDate: '2026-09-01', timeZone: 'UTC', locale: 'en_US'}])
            expect(() => getCalendarVisibleRange(options)).toThrow(RangeError);
    });
    it.each(['ar-SA-u-ca-islamic', 'th-TH-u-ca-buddhist'])('R07: %s keeps the Gregorian model and SSR output', locale => {
        const range = vi.fn(), input = {...base(), locale, onVisibleRangeChange: range};
        const html = renderToString(<Calendar {...input}/>);
        expect(renderToString(<Calendar {...input}/>)).toBe(html);
        render(<Calendar {...input}/>);
        expect(range).toHaveBeenCalledExactlyOnceWith(getCalendarVisibleRange({anchorDate: input.anchorDate, timeZone: input.timeZone, locale}));
        const dates = screen.getAllByRole('gridcell').map(node => node.dataset.date!);
        expect(dates).toContain('2026-09-01'); expect(dates).toContain('2026-09-30'); expect(dates.every(date => date.startsWith('2026-'))).toBe(true);
        expect(warnings(warn).some(message => /unsupported/i.test(message))).toBe(false);
    });
    it('R07/R59: a valid unsupported locale resolves to en-US with one development warning', () => {
        render(<Calendar {...base()} locale="zz-ZZ"/>);
        expect(screen.getAllByRole('columnheader')[0]).toHaveAccessibleName('Sunday');
        expect(screen.getByRole('button', {name: 'Today'})).toHaveAttribute('lang', 'en-US');
        expect(warnings(warn).filter(message => message.includes('locale') && /unsupported/i.test(message))).toHaveLength(1);
    });
    it.each([[24, /00:00/], [12, /12:00\sam/i]] as const)('R59: midnight with hourCycle=%i', async (hourCycle, text) => {
        const user = userEvent.setup();
        render(<Calendar {...base()} timeZone="UTC" locale="en-GB" hourCycle={hourCycle} items={[timed('midnight', '2026-09-03T00:00:00Z')]}/>);
        act(() => cell('2026-09-03').focus()); await user.keyboard('{Enter}');
        expect(screen.getByRole('listitem')).toHaveTextContent(text);
        expect(screen.getByRole('listitem')).not.toHaveTextContent(hourCycle === 24 ? '24:00' : '00:00');
    });
    // §11.2 chain without host defaults: valid messagesLocale, then valid locale, otherwise built-in ru-RU.
    it.each([
        ['locale', 'en_US', 'Не удалось показать календарь: неверные настройки'],
        ['messagesLocale', 'ru_RU', 'Calendar cannot be displayed: invalid configuration'],
    ])('R59: malformed %s renders a deterministic contract shell', (prop, value, name) => {
        const callback = vi.fn(), input = {...base(), [prop]: value, onVisibleRangeChange: callback} as CalendarProps;
        const html = renderToString(<Calendar {...input}/>);
        expect(renderToString(<Calendar {...input}/>)).toBe(html);
        expect(html).toContain('data-status="error"'); expect(html).not.toContain('role="grid"');
        render(<Calendar {...input}/>);
        expect(screen.queryByRole('grid')).toBeNull(); expect(screen.getByRole('region', {name})).toBeInTheDocument();
        expect(callback).not.toHaveBeenCalled();
    });
});
