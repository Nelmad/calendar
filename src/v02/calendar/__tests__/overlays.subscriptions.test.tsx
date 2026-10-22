import {render, screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {describe, expect, it, vi} from 'vitest';
import type {CalendarProps} from '../../reference.js';
import {CalendarMonth} from '../CalendarMonth.js';
import type * as Overlays from '../overlays.js';

// Counts subscriptions to every overlay stack the calendar creates.
const subscriptions = vi.hoisted(() => ({count: 0}));
vi.mock('../overlays.js', async importOriginal => {
    const actual = await importOriginal<typeof Overlays>();
    return {...actual, createOverlayStack() {
        const stack = actual.createOverlayStack(), subscribe = stack.subscribe;
        stack.subscribe = listener => { subscriptions.count++; return subscribe(listener); };
        return stack;
    }};
});

const items = (count: number) => Array.from({length: count}, (_, index) => ({id: `item-${index}`, title: `Event ${index}`, data: {},
    interval: {kind: 'allDay' as const, start: '2026-03-04', end: '2026-03-05'}}));
const input = (count: number): CalendarProps => ({items: items(count), anchorDate: '2026-03-01', today: '2026-03-04', timeZone: 'UTC', locale: 'en-US', layout: 'desktop', onNavigate() {}});
/** `menus`: every row has a nonempty action set; `empty`: the pair is supplied, but every set is empty (no trigger). */
async function agendaSubscriptions(count: number, menus?: 'menus' | 'empty') {
    const user = userEvent.setup(), props = input(count);
    const actions = menus ? {getItemActions: () => menus === 'menus' ? [{id: 'open', label: 'Open'}] : [], onItemActionRequest() {}} : {};
    const view = render(<CalendarMonth {...props} {...actions}/>);
    subscriptions.count = 0;
    await user.click(screen.getAllByRole('gridcell').find(node => node.dataset.date === '2026-03-04')!);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    const result = subscriptions.count; view.unmount(); return result;
}

describe('agenda rows and the overlay stack', () => {
    it('rows without an item menu never subscribe to stack changes; rows with one do', async () => {
        const one = await agendaSubscriptions(1), five = await agendaSubscriptions(5);
        expect(five).toBe(one);
        expect(await agendaSubscriptions(5, 'empty')).toBe(one);
        expect(await agendaSubscriptions(5, 'menus')).toBeGreaterThanOrEqual(one + 5);
    });
});
