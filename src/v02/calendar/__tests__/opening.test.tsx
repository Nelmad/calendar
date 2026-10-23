import {useLayoutEffect, type ComponentProps} from 'react';
import {act, render, screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import type {CalendarProps} from '../../reference.js';
import type * as Mirror from '../../primitives/mirror.js';
import type * as Sheet from '../../primitives/ModalSheet.js';
import type * as Popover from '../../primitives/NonModalPopover.js';
import {CalendarMonth} from '../CalendarMonth.js';

// QA-20: a key pressed after an activation requested its overlay, but before that overlay committed with its initial
// focus, cancels the intent (§5.2.1, §8). The overlay wrappers below press the key in the commit that mounts the
// overlay, ahead of the owner's passive effect: the deterministic form of the race seen in Chrome. T16-V3-03: the
// portal theme root is hidden until its first mirror.
const race = vi.hoisted(() => ({key: null as string | null, repeat: false, visibility: [] as string[], pending: [] as boolean[]}));
const pressInCommit = () => {
    const key = race.key;
    race.key = null;
    if (key) document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', {key, repeat: race.repeat, bubbles: true, cancelable: true}));
};
vi.mock('../../primitives/ModalSheet.js', async importOriginal => {
    const actual = await importOriginal<typeof Sheet>();
    return {ModalSheet: (props: ComponentProps<typeof actual.ModalSheet>) => { useLayoutEffect(pressInCommit, []); return <actual.ModalSheet {...props}/>; }};
});
vi.mock('../../primitives/NonModalPopover.js', async importOriginal => {
    const actual = await importOriginal<typeof Popover>();
    return {NonModalPopover: (props: ComponentProps<typeof actual.NonModalPopover>) => { useLayoutEffect(pressInCommit, []); return <actual.NonModalPopover {...props}/>; }};
});
vi.mock('../../primitives/mirror.js', async importOriginal => {
    const actual = await importOriginal<typeof Mirror>();
    return {...actual, mirrorTheme: (owner: Element, target: HTMLElement) => {
        race.visibility.push(target.style.visibility); race.pending.push(target.hasAttribute('data-nc-mirror-pending')); return actual.mirrorTheme(owner, target); }};
});
const items = [{id: 'b', title: 'Beta', data: {}, interval: {kind: 'timed' as const, start: '2026-03-04T10:00:00Z'}}];
const input = (): CalendarProps => ({items, anchorDate: '2026-03-01', today: '2026-03-04', timeZone: 'UTC', locale: 'en-US', layout: 'desktop', onNavigate() {}, onItemPress() {}});
const cell = () => screen.getAllByRole('gridcell', {hidden: true}).find(node => node.dataset.date === '2026-03-04')!;
let warn: ReturnType<typeof vi.spyOn>;
beforeEach(() => { warn = vi.spyOn(console, 'warn').mockImplementation(() => {}); race.key = null; race.repeat = false; race.visibility = []; race.pending = []; });
afterEach(() => { warn.mockRestore(); });

describe('a cancelled opening intent never leaves an overlay open (QA-20)', () => {
    it.each([['sheet', 'Escape'], ['sheet', 'a'], ['popover', 'Escape'], ['popover', 'a']] as const)('%s: %s between the request and the mount commit closes it again', async (presentation, key) => {
        const user = userEvent.setup();
        render(<CalendarMonth {...input()} {...presentation === 'sheet' ? {layout: 'mobile', agendaPresentation: 'overlay'} : {}}/>);
        act(() => cell().focus()); race.key = key;
        await user.keyboard('{Enter}');
        expect(race.key).toBeNull();
        expect(screen.queryByRole('dialog')).toBeNull(); expect(cell()).toHaveFocus();
        expect(document.querySelectorAll('.nc-backdrop, .nc-positioned-popover, [inert], [aria-hidden="true"] [role=grid]')).toHaveLength(0);
        expect(document.documentElement.style.overflow).toBe('');
        // The next activation opens normally, with its initial focus inside.
        await user.keyboard('{Enter}');
        expect(screen.getByRole('dialog')).toBeInTheDocument(); expect(screen.getByRole('dialog').contains(document.activeElement)).toBe(true);
    });
    it.each([['sheet', 'Shift', false], ['sheet', 'Control', false], ['sheet', 'a', true], ['popover', 'Shift', false], ['popover', 'Meta', false], ['popover', 'a', true]] as const)(
        '%s: a pure modifier or a key repeat (%s, repeat=%s) is not a new activation; the overlay opens (QA-B-1-04)', async (presentation, key, repeat) => {
            const user = userEvent.setup();
            render(<CalendarMonth {...input()} {...presentation === 'sheet' ? {layout: 'mobile', agendaPresentation: 'overlay'} : {}}/>);
            act(() => cell().focus()); race.key = key; race.repeat = repeat;
            await user.keyboard('{Enter}');
            expect(race.key).toBeNull();
            expect(screen.getByRole('dialog')).toBeInTheDocument(); expect(screen.getByRole('dialog').contains(document.activeElement)).toBe(true);
        });
});

describe('portal theme root (§10.3.4, T16-V3-03)', () => {
    it.each([['popover', {}], ['sheet', {layout: 'mobile', agendaPresentation: 'overlay'}]] as const)('the %s theme root is hidden until its first mirror and revealed by it', async (_presentation, props) => {
        const user = userEvent.setup(); render(<CalendarMonth {...input()} {...props}/>);
        act(() => cell().focus()); await user.keyboard('{Enter}');
        const theme = screen.getByRole('dialog').closest<HTMLElement>('.nc-popover, .nc-sheet-backdrop')!;
        expect(race.visibility[0]).toBe('hidden'); expect(theme.style.visibility).toBe('');
        expect(theme.contains(document.activeElement)).toBe(true);
    });
    it.each([['popover', {}], ['sheet', {layout: 'mobile', agendaPresentation: 'overlay'}]] as const)('the %s keeps transitions off until its first mirror ran (T18: no fade from the preset defaults)', async (_presentation, props) => {
        const user = userEvent.setup(); render(<CalendarMonth {...input()} {...props} tokens={{components: {itemBackground: 'rgb(1, 2, 3)'}}}/>);
        act(() => cell().focus()); await user.keyboard('{Enter}');
        const theme = screen.getByRole('dialog').closest<HTMLElement>('.nc-popover, .nc-sheet-backdrop')!;
        expect(race.pending[0]).toBe(true); expect(theme.hasAttribute('data-nc-mirror-pending')).toBe(false);
        // Later mirrors (owner commits) never turn transitions off again.
        await user.keyboard('{ArrowDown}'); expect(race.pending.slice(1).every(value => !value)).toBe(true);
    });
});
