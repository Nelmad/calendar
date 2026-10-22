import {forwardRef, type ComponentProps} from 'react';
import {render, screen, within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {describe, expect, it, vi} from 'vitest';
import type {CalendarProps} from '../../reference.js';
import type * as Primitives from '../../primitives/index.js';
import {CalendarMonth} from '../CalendarMonth.js';

// Review 2026-10-09-2: counts renders of the agenda rows' `…` triggers (§15.3: one item's menu must not re-render every row).
const renders = vi.hoisted(() => ({count: 0}));
vi.mock('../../primitives/index.js', async importOriginal => {
    const actual = await importOriginal<typeof Primitives>();
    const IconButton = forwardRef<HTMLButtonElement, ComponentProps<typeof actual.IconButton>>(function CountedIconButton(props, ref) {
        if ((props as Record<string, unknown>)['data-agenda-control'] === 'actions') renders.count++;
        return <actual.IconButton {...props} ref={ref}/>;
    });
    return {...actual, IconButton};
});

const items = Array.from({length: 40}, (_, index) => ({id: `item-${index}`, title: `Event ${index}`, data: {},
    interval: {kind: 'timed' as const, start: `2026-03-04T10:${String(index).padStart(2, '0')}:00Z`}}));
const input = (): CalendarProps => ({items, anchorDate: '2026-03-01', today: '2026-03-04', timeZone: 'UTC', locale: 'en-US', layout: 'desktop', onNavigate() {},
    onItemPress() {}, getItemActions: () => [{id: 'edit', label: 'Edit'}], onItemActionRequest() {}});

describe('item action triggers of a dense agenda', () => {
    it('opening and closing one item menu re-renders only that trigger', async () => {
        const user = userEvent.setup();
        render(<CalendarMonth {...input()}/>);
        await user.click(screen.getAllByRole('gridcell').find(node => node.dataset.date === '2026-03-04')!);
        const agenda = screen.getByRole('dialog', {name: /Mar 4, 2026/});
        const triggers = within(agenda).getAllByRole('button', {name: /^Actions for/});
        expect(triggers).toHaveLength(40);
        renders.count = 0;
        await user.click(triggers[7]);
        expect(screen.getByRole('menu')).toBeInTheDocument(); expect(triggers[7]).toHaveAttribute('aria-expanded', 'true');
        const opened = renders.count;
        await user.keyboard('{Escape}');
        expect(screen.queryByRole('menu')).toBeNull(); expect(triggers[7]).toHaveAttribute('aria-expanded', 'false');
        expect(opened).toBeLessThanOrEqual(2);
        expect(renders.count - opened).toBeLessThanOrEqual(2);
    });
});
