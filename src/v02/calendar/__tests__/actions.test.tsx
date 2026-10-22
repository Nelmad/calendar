import {StrictMode} from 'react';
import {act, render, screen, waitFor, within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {Calendar, type CalendarItem, type CalendarItemAction, type CalendarProps} from '../../../index.js';
import {resetSurfaceWarnings} from '../../surface.js';

// T17: generic item actions in DayAgenda (§5.5, §7, §12.1–12.3, R41 item part) through the public Calendar.
type Data = {ticket: number};
const items: CalendarItem<Data>[] = [
    {id: 'a', title: 'Alpha', data: {ticket: 1}, interval: {kind: 'allDay', start: '2026-03-01', end: '2026-03-10'}},
    {id: 'b', title: 'Beta', data: {ticket: 2}, interval: {kind: 'timed', start: '2026-03-04T10:00:00Z'}},
];
const standard: readonly CalendarItemAction[] = [{id: 'open', label: 'Open'}, {id: 'complete', label: 'Complete'}, {id: 'delete', label: 'Delete', tone: 'danger'}];
type Props = CalendarProps<Data>;
const input = (overrides: Partial<Props> = {}): Props => ({items, anchorDate: '2026-03-01', today: '2026-03-04', timeZone: 'UTC', locale: 'en-US', layout: 'desktop',
    onNavigate() {}, onItemPress() {}, getItemActions: () => standard, onItemActionRequest() {}, ...overrides} as Props);
const cell = (date = '2026-03-04') => screen.getAllByRole('gridcell').find(node => node.dataset.date === date)!;
const actionsFor = (title: string) => `Actions for ⁨${title}⁩`;
const trigger = (title: string) => screen.getByRole('button', {name: actionsFor(title)});
const focused = () => ({item: document.activeElement?.closest<HTMLElement>('[data-item-id]')?.dataset.itemId, control: (document.activeElement as HTMLElement | null)?.dataset.agendaControl,
    date: (document.activeElement as HTMLElement | null)?.dataset.date});
async function open(user: ReturnType<typeof userEvent.setup>, date = '2026-03-04') { act(() => cell(date).focus()); await user.keyboard('{Enter}'); }
let warn: ReturnType<typeof vi.spyOn>;
beforeEach(() => { resetSurfaceWarnings(); warn = vi.spyOn(console, 'warn').mockImplementation(() => {}); });
afterEach(() => { warn.mockRestore(); });
const warnings = () => warn.mock.calls.map(([message]) => String(message));

describe('desktop item action menu (§5.5, §12.2)', () => {
    it('puts a separate named trigger beside the primary surface, opens a named menu and sends one request from the latest committed set', async () => {
        const user = userEvent.setup(), onItemActionRequest = vi.fn(), onItemPress = vi.fn();
        render(<StrictMode><Calendar {...input({onItemActionRequest, onItemPress})}/></StrictMode>);
        // The Month grid never gets action buttons (§5.5): the path to actions is the agenda of the date.
        expect(within(screen.getByRole('grid')).queryByRole('button')).toBeNull();
        await open(user);
        const row = trigger('Beta').closest('li')!, primary = within(row).getByRole('button', {name: /^Beta/});
        expect(primary).not.toBe(trigger('Beta')); expect(primary.contains(trigger('Beta'))).toBe(false); expect(trigger('Beta').contains(primary)).toBe(false);
        expect(trigger('Beta')).toHaveAttribute('aria-haspopup', 'menu'); expect(trigger('Beta')).toHaveAttribute('aria-expanded', 'false');
        act(() => trigger('Beta').focus()); await user.keyboard('{Enter}');
        const menu = screen.getByRole('menu', {name: actionsFor('Beta')});
        expect(within(menu).getAllByRole('menuitem').map(node => node.textContent)).toEqual(['Open', 'Complete', 'Delete']);
        expect(within(menu).getAllByRole('menuitem')[0]).toHaveFocus();
        expect(within(menu).getByRole('menuitem', {name: 'Delete'})).toHaveAttribute('data-tone', 'danger');
        await user.keyboard('{ArrowDown}{Enter}');
        expect(onItemActionRequest).toHaveBeenCalledTimes(1);
        expect(onItemActionRequest.mock.calls[0][0]).toEqual({item: items[1], actionId: 'complete'});
        expect(onItemPress).not.toHaveBeenCalled();
        expect(screen.queryByRole('menu')).toBeNull(); expect(trigger('Beta')).toHaveFocus(); expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    it('excludes invalid and duplicate actions with one development warning each; an empty result has no trigger', async () => {
        const user = userEvent.setup(), getItemActions = (item: CalendarItem<Data>) => item.id === 'a'
            ? [{id: 'open', label: 'Open'}, {id: 'open', label: 'Again'}, {id: 'share', label: ' '}, {id: '', label: 'Empty id'}] : [{id: 'keep', label: 'Keep'}, {id: 'bad', label: 'Bad', tone: 'loud'}];
        render(<StrictMode><Calendar {...input({getItemActions: getItemActions as Props['getItemActions']})}/></StrictMode>);
        await open(user);
        expect(screen.queryByRole('button', {name: actionsFor('Alpha')})).toBeNull();
        act(() => trigger('Beta').focus()); await user.keyboard('{Enter}');
        expect(within(screen.getByRole('menu')).getAllByRole('menuitem').map(node => node.textContent)).toEqual(['Keep']);
        const actionWarnings = warnings().filter(message => message.includes('getItemActions('));
        expect(actionWarnings).toEqual([
            '[@nelmad/calendar] getItemActions("a").actions[0]: All actions with this ID are excluded',
            '[@nelmad/calendar] getItemActions("a").actions[1]: All actions with this ID are excluded',
            '[@nelmad/calendar] getItemActions("a").actions[2]: Invalid action id, label or tone',
            '[@nelmad/calendar] getItemActions("a").actions[3]: Invalid action id, label or tone',
            '[@nelmad/calendar] getItemActions("b").actions[1]: Invalid action id, label or tone',
        ]);
    });
    it('keeps an agenda row without onItemPress readable with no primary button, and its actions reachable', async () => {
        const user = userEvent.setup(); render(<Calendar {...input({onItemPress: undefined})}/>);
        await open(user);
        const row = trigger('Beta').closest('li')!;
        expect(within(row).getAllByRole('button')).toEqual([trigger('Beta')]);
        expect(row).toHaveTextContent('Beta');
    });
    it('uses the latest committed set: an updated set replaces the open menu content and a removed action sends nothing', async () => {
        const user = userEvent.setup(), onItemActionRequest = vi.fn(), props = input({onItemActionRequest});
        const view = render(<Calendar {...props}/>); await open(user);
        act(() => trigger('Beta').focus()); await user.keyboard('{Enter}');
        view.rerender(<Calendar {...props} getItemActions={() => [{id: 'archive', label: 'Archive'}]}/>);
        const menu = screen.getByRole('menu');
        expect(within(menu).getAllByRole('menuitem').map(node => node.textContent)).toEqual(['Archive']);
        await user.click(within(menu).getByRole('menuitem', {name: 'Archive'}));
        expect(onItemActionRequest.mock.calls.map(([request]) => request.actionId)).toEqual(['archive']);
    });
    it('an updated set that removes the focused action keeps focus on the first action of the open menu, so Enter still activates (§12.3)', async () => {
        const user = userEvent.setup(), onItemActionRequest = vi.fn(), props = input({onItemActionRequest});
        const view = render(<Calendar {...props}/>); await open(user);
        act(() => trigger('Beta').focus()); await user.keyboard('{Enter}');
        expect(screen.getByRole('menuitem', {name: 'Open'})).toHaveFocus();
        view.rerender(<Calendar {...props} getItemActions={() => [{id: 'archive', label: 'Archive'}, {id: 'share', label: 'Share'}]}/>);
        await waitFor(() => expect(screen.getByRole('menuitem', {name: 'Archive'})).toHaveFocus());
        await user.keyboard('{Enter}');
        expect(onItemActionRequest.mock.calls.map(([request]) => request.actionId)).toEqual(['archive']);
    });
    it('focus that left an open menu (a press on a blank area) is never taken back by a later render with an equal set', async () => {
        const user = userEvent.setup(), props = input();
        const view = render(<Calendar {...props}/>); await open(user);
        act(() => trigger('Beta').focus()); await user.keyboard('{Enter}');
        act(() => (document.activeElement as HTMLElement).blur());
        expect(document.activeElement).toBe(document.body);
        view.rerender(<Calendar {...props} getItemActions={() => [...standard]}/>);
        await act(async () => { await new Promise(requestAnimationFrame); });
        expect(document.activeElement).toBe(document.body);
    });
    it('the request carries the latest committed item with the same ID', async () => {
        const user = userEvent.setup(), onItemActionRequest = vi.fn(), props = input({onItemActionRequest});
        const view = render(<Calendar {...props}/>); await open(user);
        act(() => trigger('Beta').focus()); await user.keyboard('{Enter}');
        const renamed = {...items[1], title: 'Beta renamed', data: {ticket: 20}};
        view.rerender(<Calendar {...props} items={[items[0], renamed]}/>);
        await user.click(screen.getByRole('menuitem', {name: 'Open'}));
        expect(onItemActionRequest).toHaveBeenCalledTimes(1); expect(onItemActionRequest.mock.calls[0][0].item).toBe(renamed);
    });
    it('an item filtered out while its menu is open keeps the menu until dismissed (R37), with its actions disabled (§5.6, T17-V1-D1)', async () => {
        const user = userEvent.setup(), onItemActionRequest = vi.fn();
        const sourced = [items[0], {...items[1], calendarId: 'home'}], sources = [{id: 'work', title: 'Work'}, {id: 'home', title: 'Home'}];
        const props = input({items: sourced, sources, visibleSourceIds: ['work', 'home'], onVisibleSourceIdsChange() {}, onItemActionRequest} as Partial<Props>);
        const view = render(<Calendar {...props}/>); await open(user);
        act(() => trigger('Beta').focus()); await user.keyboard('{Enter}');
        expect(screen.getAllByRole('menuitem').map(node => node.getAttribute('aria-disabled'))).toEqual(standard.map(() => null));
        view.rerender(<Calendar {...props} visibleSourceIds={['work']}/>);
        expect(screen.queryByRole('button', {name: actionsFor('Beta')})).toBeNull();
        expect(screen.getByRole('menu')).toBeInTheDocument();
        // The accepted filter removes the item's actions: the open menu still lists them, but none is offered as usable.
        expect(screen.getAllByRole('menuitem').map(node => node.getAttribute('aria-disabled'))).toEqual(standard.map(() => 'true'));
        expect(screen.getByRole('menu').contains(document.activeElement)).toBe(true);
        await user.keyboard('{Enter}');
        await user.click(screen.getByRole('menuitem', {name: 'Open'}));
        expect(onItemActionRequest).not.toHaveBeenCalled(); expect(screen.getByRole('menu')).toBeInTheDocument();
        await user.keyboard('{Escape}');
        expect(screen.queryByRole('menu')).toBeNull();
        // §12.3 step 2 inside the still-open agenda: the trigger is gone, so the nearest control before its position.
        expect(screen.getByRole('dialog')).toBeInTheDocument(); expect(focused()).toMatchObject({item: 'a', control: 'actions'});
    });
    it('an open menu whose set became empty closes with §12.3 recovery inside the agenda; removing the pair hides every trigger', async () => {
        const user = userEvent.setup(), props = input();
        const view = render(<><Calendar {...props}/><button>After</button></>); await open(user);
        act(() => trigger('Alpha').focus()); await user.keyboard('{Enter}');
        view.rerender(<><Calendar {...props} getItemActions={item => item.id === 'a' ? [] : standard}/><button>After</button></>);
        expect(screen.queryByRole('menu')).toBeNull(); expect(screen.queryByRole('button', {name: actionsFor('Alpha')})).toBeNull();
        // The first usable control after the trigger's former position: the next row's primary surface.
        expect(focused()).toMatchObject({item: 'b', control: 'primary'}); expect(screen.getByRole('dialog')).toBeInTheDocument();
        const {getItemActions: _get, onItemActionRequest: _request, ...withoutPair} = props;
        view.rerender(<><Calendar {...withoutPair as Props}/><button>After</button></>);
        expect(within(screen.getByRole('dialog')).queryAllByRole('button', {name: /^Actions for/})).toHaveLength(0);
    });
});

describe('mobile item action sheet (§7, §12.2, R41)', () => {
    const mobile = (overrides: Partial<Props> = {}) => input({layout: 'mobile', ...overrides});
    it('opens a modal dialog named by its visible heading with one button per action; the first action has focus; Cancel returns to the trigger', async () => {
        const user = userEvent.setup(), onItemActionRequest = vi.fn();
        render(<StrictMode><Calendar {...mobile({onItemActionRequest})}/><button>After</button></StrictMode>);
        expect(screen.getByRole('region', {name: /Events for/})).toBeInTheDocument();
        expect(trigger('Beta')).toHaveAttribute('aria-haspopup', 'dialog');
        await user.click(trigger('Beta'));
        const sheet = screen.getByRole('dialog', {name: 'Actions for Beta'});
        expect(sheet).toHaveAttribute('aria-modal', 'true');
        expect(within(sheet).getByRole('heading', {name: 'Actions for Beta'})).toBeInTheDocument();
        expect(within(sheet).getAllByRole('button').map(node => node.textContent || node.getAttribute('aria-label'))).toEqual(['Cancel', 'Open', 'Complete', 'Delete']);
        expect(within(sheet).getByRole('button', {name: 'Open'})).toHaveFocus();
        expect(screen.getByText('After').closest('[aria-hidden="true"], [inert]')).not.toBeNull();
        await user.click(within(sheet).getByRole('button', {name: 'Cancel'}));
        expect(screen.queryByRole('dialog')).toBeNull(); expect(trigger('Beta')).toHaveFocus(); expect(onItemActionRequest).not.toHaveBeenCalled();
        await user.click(trigger('Beta')); await user.click(screen.getByRole('button', {name: 'Delete'}));
        expect(onItemActionRequest).toHaveBeenCalledTimes(1); expect(onItemActionRequest.mock.calls[0][0]).toEqual({item: items[1], actionId: 'delete'});
        await waitFor(() => expect(trigger('Beta')).toHaveFocus());
        expect(screen.getByText('After').closest('[aria-hidden="true"], [inert]')).toBeNull();
    });
    it('an item filtered out while its sheet is open keeps the sheet with disabled actions; focus moves to Cancel (§5.6, T17-V1-D1)', async () => {
        const user = userEvent.setup(), onItemActionRequest = vi.fn();
        const sourced = [items[0], {...items[1], calendarId: 'home'}], sources = [{id: 'work', title: 'Work'}, {id: 'home', title: 'Home'}];
        const props = mobile({items: sourced, sources, visibleSourceIds: ['work', 'home'], onVisibleSourceIdsChange() {}, onItemActionRequest} as Partial<Props>);
        const view = render(<Calendar {...props}/>);
        await user.click(trigger('Beta'));
        const sheet = screen.getByRole('dialog', {name: 'Actions for Beta'});
        expect(within(sheet).getByRole('button', {name: 'Open'})).toHaveFocus();
        view.rerender(<Calendar {...props} visibleSourceIds={['work']}/>);
        expect(screen.getByRole('dialog', {name: 'Actions for Beta'})).toBe(sheet);
        for (const name of ['Open', 'Complete', 'Delete']) expect(within(sheet).getByRole('button', {name})).toBeDisabled();
        expect(within(sheet).getByRole('button', {name: 'Cancel'})).toHaveFocus();
        await user.click(within(sheet).getByRole('button', {name: 'Delete'}));
        expect(onItemActionRequest).not.toHaveBeenCalled(); expect(screen.getByRole('dialog', {name: 'Actions for Beta'})).toBeInTheDocument();
        // The item shown again: its actions are usable again in the same sheet.
        view.rerender(<Calendar {...props} visibleSourceIds={['work', 'home']}/>);
        expect(within(sheet).getByRole('button', {name: 'Delete'})).toBeEnabled();
        await user.click(within(sheet).getByRole('button', {name: 'Delete'}));
        expect(onItemActionRequest).toHaveBeenCalledTimes(1);
    });
    it('R41: a nonempty sheet whose set becomes empty closes; its trigger disappears and focus recovers inside the inline agenda', async () => {
        const user = userEvent.setup(), props = mobile();
        const view = render(<><Calendar {...props}/><button>After</button></>);
        await user.click(trigger('Beta'));
        expect(screen.getByRole('dialog', {name: 'Actions for Beta'})).toBeInTheDocument();
        view.rerender(<><Calendar {...props} getItemActions={item => item.id === 'b' ? [] : standard}/><button>After</button></>);
        expect(screen.queryByRole('dialog')).toBeNull(); expect(screen.queryByRole('button', {name: actionsFor('Beta')})).toBeNull();
        await waitFor(() => expect(focused()).toMatchObject({item: 'b', control: 'primary'}));
        expect(screen.getByText('After').closest('[aria-hidden="true"], [inert]')).toBeNull();
        expect(document.documentElement.style.overflow).toBe('');
    });
    it('a sheet over the agenda sheet uses the same set and closes when the pair is removed', async () => {
        const user = userEvent.setup(), props = mobile({agendaPresentation: 'overlay'});
        const view = render(<Calendar {...props}/>);
        await user.click(cell()); await user.click(trigger('Beta'));
        expect(screen.getByRole('dialog', {name: 'Actions for Beta'})).toBeInTheDocument();
        const {getItemActions: _get, onItemActionRequest: _request, ...withoutPair} = props;
        view.rerender(<Calendar {...withoutPair as Props}/>);
        expect(screen.queryByRole('dialog', {name: 'Actions for Beta'})).toBeNull();
        expect(screen.getByRole('dialog', {name: /Events for/})).toBeInTheDocument();
        await waitFor(() => expect(focused()).toMatchObject({item: 'b', control: 'primary'}));
    });
});
