import {StrictMode} from 'react';
import {act, render, screen, waitFor, within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {describe, expect, it, vi} from 'vitest';
import {Calendar, type CalendarProps} from '../../../index.js';
import {CalendarMonth} from '../CalendarMonth.js';

const items = [{id: 'a', title: 'Alpha', data: {}, interval: {kind: 'allDay' as const, start: '2026-03-01', end: '2026-03-10'}},
    {id: 'b', title: 'Beta', data: {}, interval: {kind: 'timed' as const, start: '2026-03-04T10:00:00Z'}}];
const input = (): CalendarProps => ({items, anchorDate: '2026-03-01', today: '2026-03-04', timeZone: 'UTC', locale: 'en-US', layout: 'desktop', onNavigate() {}, onItemPress() {}});
const cell = (date = '2026-03-04') => screen.getAllByRole('gridcell').find(node => node.dataset.date === date)!;
const closeButton = () => screen.getByRole('button', {name: 'Close day agenda'});
async function open(user: ReturnType<typeof userEvent.setup>, date = '2026-03-04') { act(() => cell(date).focus()); await user.keyboard('{Enter}'); }

// Review 2026-10-09-2: pointer presses on the desktop popover (§8, §12.2).
describe('desktop popover after pointer presses', () => {
    const page = (props: CalendarProps) => <><p>Blank page area</p><CalendarMonth {...props}/></>;
    it.each(['count line', 'heading'])('Tab after a press on the %s moves to the first control and keeps the popover open', async target => {
        const user = userEvent.setup(); render(page(input())); await open(user);
        const dialog = screen.getByRole('dialog'), node = target === 'heading' ? within(dialog).getByRole('heading') : dialog.querySelector<HTMLElement>('.nc-day-list-count')!;
        await user.click(node);
        expect(dialog.contains(document.activeElement)).toBe(true); expect(document.activeElement).not.toBe(closeButton());
        await user.tab();
        expect(closeButton()).toHaveFocus(); expect(screen.getByRole('dialog')).toBe(dialog);
    });
    it('a drag that starts inside and is released outside, or a secondary-button press outside, keeps it open', async () => {
        const user = userEvent.setup(); render(page(input())); await open(user);
        const dialog = screen.getByRole('dialog'), blank = screen.getByText('Blank page area');
        await user.pointer([{keys: '[MouseLeft>]', target: within(dialog).getByRole('heading')}, {target: blank}, {keys: '[/MouseLeft]', target: blank}]);
        await act(() => new Promise(requestAnimationFrame));
        expect(screen.getByRole('dialog')).toBe(dialog);
        await user.pointer({keys: '[MouseRight]', target: blank});
        await act(() => new Promise(requestAnimationFrame));
        expect(screen.getByRole('dialog')).toBe(dialog);
        await user.pointer({keys: '[MouseLeft]', target: blank});
        await act(() => new Promise(requestAnimationFrame));
        expect(screen.queryByRole('dialog')).toBeNull();
    });
});

describe('DayAgenda presentation and ownership', () => {
    it('opens a named non-modal dialog, links the connected trigger and restores focus on Escape', async () => {
        const user = userEvent.setup(); render(<StrictMode><Calendar {...input()}/></StrictMode>);
        await open(user); const dialog = screen.getByRole('dialog'); expect(dialog).toHaveAccessibleName('Events for Mar 4, 2026');
        expect(dialog).not.toHaveAttribute('aria-modal'); expect(closeButton()).toHaveFocus();
        expect(cell()).toHaveAttribute('aria-controls', dialog.id); expect(cell()).toHaveAttribute('aria-expanded', 'true');
        await user.keyboard('{Escape}'); expect(screen.queryByRole('dialog')).toBeNull(); expect(cell()).toHaveFocus();
        expect(cell()).not.toHaveAttribute('aria-controls'); expect(cell()).toHaveAttribute('aria-expanded', 'false');
    });
    it('uses a readable list without primary callbacks and no duplicated multi-day rows', async () => {
        const user = userEvent.setup(); render(<Calendar {...input()} onItemPress={undefined}/>); await open(user);
        expect(screen.getAllByRole('listitem')).toHaveLength(2); expect(within(screen.getByRole('list')).queryByRole('button')).toBeNull();
        expect(within(screen.getByRole('dialog')).getAllByRole('button')).toHaveLength(1);
    });
    it('waits for acceptance, dismisses the old overlay, replaces stale requests and opens same-date without callback', async () => {
        const user = userEvent.setup(), onAgendaDateChange = vi.fn(), props = {...input(), agendaDate: '2026-03-04', onAgendaDateChange};
        const view = render(<Calendar {...props}/>); await open(user); expect(onAgendaDateChange).not.toHaveBeenCalled();
        await open(user, '2026-03-05'); expect(screen.queryByRole('dialog')).toBeNull(); expect(cell('2026-03-05')).toHaveFocus();
        await open(user, '2026-03-06'); expect(onAgendaDateChange.mock.calls).toEqual([['2026-03-05'], ['2026-03-06']]);
        view.rerender(<Calendar {...props} agendaDate="2026-03-05"/>); expect(screen.queryByRole('dialog')).toBeNull();
        view.rerender(<Calendar {...props} agendaDate="2026-03-06"/>); expect(screen.queryByRole('dialog')).toBeNull();
        await open(user, '2026-03-06'); expect(closeButton()).toHaveFocus(); expect(onAgendaDateChange).toHaveBeenCalledTimes(2);
    });
    it.each(['escape', 'toolbar', 'outside'])('cancels late open on %s', async cancellation => {
        const user = userEvent.setup(), props = {...input(), agendaDate: '2026-03-01', onAgendaDateChange: vi.fn()};
        const tree = (date: string) => <><button>Outside</button><Calendar {...props} agendaDate={date}/></>;
        const view = render(tree('2026-03-01')); await open(user);
        if (cancellation === 'escape') await user.keyboard('{Escape}');
        else await user.click(screen.getByRole('button', {name: cancellation === 'toolbar' ? 'Today' : 'Outside', exact: true}));
        const focused = document.activeElement; view.rerender(tree('2026-03-04'));
        expect(screen.queryByRole('dialog')).toBeNull(); expect(document.activeElement).toBe(focused);
        expect(screen.getByRole('status')).toHaveTextContent('');
    });
    it('applies a simultaneous accepted layout to a still-current request', async () => {
        const user = userEvent.setup(), props = {...input(), layout: 'mobile' as const, agendaDate: '2026-03-01', onAgendaDateChange: vi.fn()};
        const view = render(<CalendarMonth {...props}/>); await open(user);
        view.rerender(<CalendarMonth {...props} agendaDate="2026-03-04" layout="desktop"/>); expect(closeButton()).toHaveFocus();
        expect(screen.getAllByRole('listitem')).toHaveLength(2);
    });
    it('keeps external date changes closed and follows an out-of-grid date in an already open dialog', async () => {
        const user = userEvent.setup(), props = {...input(), agendaDate: '2026-03-01', onAgendaDateChange: vi.fn(), onNavigate: vi.fn()};
        const view = render(<Calendar {...props}/>); view.rerender(<Calendar {...props} agendaDate="2026-03-04"/>);
        expect(screen.queryByRole('dialog')).toBeNull(); await open(user);
        view.rerender(<Calendar {...props} agendaDate="2026-05-06"/>);
        expect(screen.getByRole('dialog')).toHaveAttribute('data-date', '2026-05-06'); expect(closeButton()).toHaveFocus();
        expect(document.querySelector('[aria-controls]')).toBeNull(); expect(props.onNavigate).not.toHaveBeenCalled();
    });
    it.each(['forward', 'backward'])('exits Tab %s relative to the date, with a body portal', async direction => {
        const user = userEvent.setup(); render(<><CalendarMonth {...input()} portalContainer={document.body}/><button>After</button></>);
        await open(user);
        if (direction === 'forward') { act(() => screen.getByRole('button', {name: /Beta/}).focus()); await user.tab(); expect(screen.getByRole('button', {name: 'After'})).toHaveFocus(); }
        else { await user.tab({shift: true}); expect(screen.getByRole('button', {name: 'Next month'})).toHaveFocus(); }
        expect(screen.queryByRole('dialog')).toBeNull();
    });
    it('recovers from a removed focused item to its date and preserves valid external focus', async () => {
        const user = userEvent.setup(), props = input(), tree = (value: CalendarProps) => <><Calendar {...value}/><button>After</button></>;
        const view = render(tree(props)); await open(user); await user.click(screen.getByRole('button', {name: /Beta/}));
        view.rerender(tree({...props, items: [items[0]]})); expect(cell()).toHaveFocus();
        await open(user); await user.click(screen.getByRole('button', {name: 'After'})); view.rerender(tree({...props, items: []}));
        expect(screen.getByRole('button', {name: 'After'})).toHaveFocus(); expect(screen.queryByRole('dialog')).toBeNull();
    });
    it('recovers a portaled view to blocking status and does not reopen after recovery', async () => {
        const user = userEvent.setup(), props = {...input(), portalContainer: document.body}; const view = render(<CalendarMonth {...props}/>);
        await open(user); view.rerender(<CalendarMonth {...props} dataState={{status: 'loading', phase: 'initial'}}/>);
        expect(screen.getByRole('region', {name: 'Loading calendar'})).toHaveFocus(); expect(screen.queryByRole('dialog')).toBeNull();
        view.rerender(<CalendarMonth {...props}/>); expect(cell()).toHaveFocus(); expect(screen.queryByRole('dialog')).toBeNull();
    });
    it('mobile pointer announces once; Enter focuses heading; Escape preserves the inline list', async () => {
        const user = userEvent.setup(); render(<StrictMode><CalendarMonth {...input()} layout="mobile"/></StrictMode>);
        await user.click(cell('2026-03-05')); expect(cell('2026-03-05')).toHaveFocus(); expect(screen.getByRole('status')).toHaveTextContent('Showing');
        await open(user); expect(screen.getByRole('heading', {level: 3})).toHaveFocus(); await user.keyboard('{Escape}'); expect(cell()).toHaveFocus();
        expect(screen.getByRole('list')).toBeInTheDocument(); expect(cell()).not.toHaveAttribute('aria-haspopup');
    });
    it('outside non-focusable press closes with recovery and unmount never programmatically focuses', async () => {
        const user = userEvent.setup(), props = input(); const view = render(<><Calendar {...props}/><div>Blank</div><button>After</button></>);
        await open(user); await user.click(screen.getByText('Blank')); await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull()); expect(cell()).toHaveFocus();
        await open(user); const focus = vi.spyOn(HTMLElement.prototype, 'focus'); focus.mockClear(); view.unmount(); expect(focus).not.toHaveBeenCalled(); focus.mockRestore();
    });
    it('preserves the logical item through both forced presentation migrations', async () => {
        const user = userEvent.setup(), props = input(); const view = render(<CalendarMonth {...props}/>);
        await open(user); await user.click(screen.getByRole('button', {name: /Alpha/}));
        view.rerender(<CalendarMonth {...props} layout="mobile"/>); expect(screen.getByRole('button', {name: /Alpha/})).toHaveFocus();
        view.rerender(<CalendarMonth {...props} layout="desktop"/>); expect(screen.getByRole('button', {name: /Alpha/})).toHaveFocus(); expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
});

// Review 2026-10-09-3: §12.3 step 4 for focus in the inline agenda when the host moves the month (§5.1.1).
describe('inline agenda recovery after an external month change', () => {
    it.each(['2026-04-01', '2026-05-01'])('an uncontrolled inline agenda moves focus from its removed item to the roving cell of %s, not the toolbar', async month => {
        const user = userEvent.setup(), props = {...input(), layout: 'mobile' as const}; const view = render(<CalendarMonth {...props}/>);
        await open(user); await user.tab(); expect(document.activeElement?.closest('[data-item-id]')).not.toBeNull();
        view.rerender(<CalendarMonth {...props} anchorDate={month}/>);
        const target = `${month.slice(0, 8)}04`; expect(cell(target)).toHaveAttribute('tabindex', '0'); expect(cell(target)).toHaveFocus();
    });
    it('a controlled inline agenda whose date leaves the grid recovers to the same roving cell', async () => {
        const user = userEvent.setup(), props = {...input(), layout: 'mobile' as const, agendaDate: '2026-03-04', onAgendaDateChange() {}}; const view = render(<CalendarMonth {...props}/>);
        await open(user); await user.tab(); view.rerender(<CalendarMonth {...props} anchorDate="2026-05-01" agendaDate="2026-05-20"/>);
        expect(cell('2026-05-04')).toHaveFocus();
    });
});
