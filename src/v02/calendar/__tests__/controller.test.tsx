import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import {act, fireEvent, render, screen, waitFor, within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {afterEach, describe, expect, it, vi} from 'vitest';
import type {CalendarProps} from '../../reference.js';
import {getCalendarVisibleRange} from '../../core/formatting.js';
import {Fixture, fixtureProps} from './fixture.js';
import {CalendarMonth} from '../CalendarMonth.js';

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });
const cell = (date: string) => screen.getByRole('gridcell', {name: date});
describe('committed viewer controller', () => {
    it('deduplicates visible tuples through StrictMode, callback identity and anchor day changes', () => {
        const first = vi.fn(), second = vi.fn();
        const props = {...fixtureProps(), onVisibleRangeChange: first};
        const tree = (input: CalendarProps) => <StrictMode><Fixture input={input}/></StrictMode>;
        const view = render(tree(props));
        expect(first.mock.calls).toEqual([[getCalendarVisibleRange(props)]]);
        view.rerender(tree({...props, anchorDate: '2026-01-31', onVisibleRangeChange: second})); expect(second).not.toHaveBeenCalled();
        view.rerender(tree({...props, anchorDate: '2026-02-01', onVisibleRangeChange: second}));
        view.rerender(tree({...props, onVisibleRangeChange: second})); expect(second).toHaveBeenCalledTimes(2);
        view.rerender(tree({...props, firstDayOfWeek: 'monday', onVisibleRangeChange: second}));
        view.rerender(tree({...props, firstDayOfWeek: 'monday', timeZone: 'Europe/Moscow', onVisibleRangeChange: second}));
        expect(second).toHaveBeenCalledTimes(4);
    });
    it('keeps toolbar navigation controlled and announces only matching committed acceptance', async () => {
        const user = userEvent.setup(), navigate = vi.fn(), announcement = vi.fn((month: string) => `Accepted ${month}`);
        const props = {...fixtureProps(), onNavigate: navigate, messages: {monthChangedAnnouncement: announcement}};
        const view = render(<StrictMode><Fixture input={props}/></StrictMode>);
        const live = screen.getByRole('status');
        await user.click(screen.getByRole('button', {name: 'Next month'}));
        expect(navigate).toHaveBeenCalledWith('2026-02-01'); expect(screen.getByRole('heading')).toHaveTextContent('January');
        expect(live).toBeEmptyDOMElement();
        view.rerender(<StrictMode><Fixture input={{...props, anchorDate: '2026-02-28'}}/></StrictMode>);
        expect(announcement).toHaveBeenCalledTimes(1); expect(live.textContent).toBe('Accepted 2026-02-01');
        view.rerender(<StrictMode><Fixture input={{...props, anchorDate: '2026-02-01'}}/></StrictMode>);
        expect(screen.getByRole('status')).toBe(live); expect(announcement).toHaveBeenCalledTimes(1);
    });
    // §12.4 (S12.4-7d7fa64c22bc): only the acceptance of a toolbar Previous/Next request announces the month, and only while
    // focus is inside the calendar and not in the grid; Today, PageDown, an external change and a grid focus stay silent.
    it.each(['today', 'page', 'external', 'grid'] as const)('keeps the polite channel silent for a month accepted after %s', async reason => {
        const user = userEvent.setup(), announce = vi.fn(() => 'Changed'), props = {...fixtureProps(), today: '2026-03-14', messages: {monthChangedAnnouncement: announce}};
        const view = render(<Fixture input={props}/>), live = screen.getByRole('status');
        if (reason === 'today') await user.click(screen.getByRole('button', {name: 'Today'}));
        if (reason === 'page') { act(() => cell('2026-01-31').focus()); await user.keyboard('{PageDown}'); }
        if (reason === 'grid') { await user.click(screen.getByRole('button', {name: 'Next month'})); act(() => cell('2026-01-31').focus()); }
        view.rerender(<Fixture input={{...props, anchorDate: reason === 'today' ? '2026-03-01' : '2026-02-01'}}/>);
        expect(announce).not.toHaveBeenCalled(); expect(live).toBeEmptyDOMElement();
    });
    it.each(['Escape', 'outside', 'stale'] as const)('does not announce cancelled toolbar acceptance: %s', async reason => {
        const user = userEvent.setup(), announce = vi.fn(() => 'Changed');
        const props = {...fixtureProps(), messages: {monthChangedAnnouncement: announce}};
        const view = render(<><button>Outside</button><Fixture input={props}/></>);
        await user.click(screen.getByRole('button', {name: 'Next month'}));
        if (reason === 'Escape') await user.keyboard('{Escape}');
        if (reason === 'outside') await user.click(screen.getByRole('button', {name: 'Outside'}));
        if (reason === 'stale') await user.click(screen.getByRole('button', {name: 'Previous month'}));
        view.rerender(<><button>Outside</button><Fixture input={{...props, anchorDate: '2026-02-01'}}/></>);
        expect(announce).not.toHaveBeenCalled();
    });
    it('clamps delayed PageDown and never steals external focus', async () => {
        const user = userEvent.setup(), onNavigate = vi.fn(), props = {...fixtureProps(), onNavigate};
        const view = render(<><button>Outside</button><Fixture input={props}/></>);
        act(() => cell('2026-01-31').focus()); await user.keyboard('{PageDown}');
        expect(onNavigate).toHaveBeenCalledWith('2026-02-01'); expect(cell('2026-01-31')).toHaveFocus();
        view.rerender(<><button>Outside</button><Fixture input={{...props, anchorDate: '2026-02-01'}}/></>);
        expect(cell('2026-02-28')).toHaveFocus();
        await user.keyboard('{PageDown}'); await user.click(screen.getByRole('button', {name: 'Outside'}));
        view.rerender(<><button>Outside</button><Fixture input={{...props, anchorDate: '2026-03-01'}}/></>);
        expect(screen.getByRole('button', {name: 'Outside'})).toHaveFocus();
        expect(cell('2026-03-28')).toHaveAttribute('tabindex', '0');
    });
    it('retains logical day on an external month change while focused in grid', () => {
        const props = fixtureProps(), view = render(<Fixture input={props}/>);
        act(() => cell('2026-01-31').focus());
        view.rerender(<Fixture input={{...props, anchorDate: '2026-04-01'}}/>);
        expect(cell('2026-04-30')).toHaveFocus();
    });
    it.each([
        ['2026-03-01', '2026-03-01', 'PageDown', '2026-04-01', '2026-04-01'],
        ['2026-04-01', '2026-04-30', 'PageUp', '2026-03-01', '2026-03-30'],
    ])('waits for page navigation acceptance even with an adjacent visible target: %s', async (month, date, key, accepted, target) => {
        const user = userEvent.setup(), onNavigate = vi.fn(), props = {...fixtureProps(), anchorDate: month, onNavigate};
        const view = render(<Fixture input={props}/>);
        act(() => cell(date).focus()); await user.keyboard(`{${key}}`);
        expect(onNavigate).toHaveBeenCalledExactlyOnceWith(accepted); expect(cell(date)).toHaveFocus();
        view.rerender(<Fixture input={{...props, anchorDate: accepted}}/>); expect(cell(target)).toHaveFocus();
        expect(screen.getByRole('status')).toBeEmptyDOMElement();
    });
    it('moves Today focus only after acceptance, without a month announcement', async () => {
        const user = userEvent.setup(), announce = vi.fn(() => 'Changed'), props = {...fixtureProps(), messages: {monthChangedAnnouncement: announce}};
        const view = render(<Fixture input={props}/>);
        await user.click(screen.getByRole('button', {name: 'Today'}));
        expect(screen.getByRole('button', {name: 'Today'})).toHaveFocus();
        view.rerender(<Fixture input={{...props, anchorDate: '2026-02-01'}}/>);
        expect(cell('2026-02-14')).toHaveFocus(); expect(announce).not.toHaveBeenCalled();
    });
    it.each(['Escape', 'Tab', 'grid', 'blocking', 'contract'] as const)('cancels pending Today intent before %s acceptance', async reason => {
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        const user = userEvent.setup(), props = fixtureProps();
        const view = render(<Fixture input={props}/>);
        await user.click(screen.getByRole('button', {name: 'Today'}));
        if (reason === 'Escape' || reason === 'Tab') await user.keyboard(`{${reason}}`);
        if (reason === 'grid') act(() => cell('2026-01-31').focus());
        view.rerender(<Fixture input={{...props, anchorDate: '2026-02-01',
            ...(reason === 'blocking' ? {dataState: {status: 'loading', phase: 'initial'}} : {}),
            ...(reason === 'contract' ? {timeZone: 'invalid'} : {})}}/>);
        view.rerender(<Fixture input={{...props, anchorDate: '2026-02-01'}}/>);
        expect(cell('2026-02-14')).not.toHaveFocus();
        if (reason === 'grid') expect(cell('2026-02-28')).toHaveFocus();
        expect(screen.getByRole('status')).toBeEmptyDOMElement();
    });
    it('Today within the visible adjacent dates focuses without navigating', async () => {
        const user = userEvent.setup(), onNavigate = vi.fn();
        render(<Fixture input={{...fixtureProps(), today: '2025-12-31', onNavigate}}/>);
        await user.click(screen.getByRole('button', {name: 'Today'})); expect(cell('2025-12-31')).toHaveFocus(); expect(onNavigate).not.toHaveBeenCalled();
    });
});

describe('data and contract surfaces', () => {
    it('keeps empty grid/toolbar and renders one named empty region', () => {
        const renderEmpty = vi.fn(() => 'Nothing yet');
        render(<Fixture input={{...fixtureProps(), renderEmpty}}/>);
        expect(screen.getByRole('grid')).toBeInTheDocument(); expect(screen.getAllByRole('region', {name: 'No events in this month'})).toHaveLength(1);
        expect(screen.getByRole('button', {name: 'Today'})).toBeEnabled();
    });
    it('derives stale items from valid filtered membership, not array length', () => {
        const renderError = vi.fn(() => 'Custom error'), renderEmpty = vi.fn(() => 'Empty');
        const outside = {id: 'outside', title: 'Outside', data: {}, interval: {kind: 'allDay', start: '2026-05-01', end: '2026-05-02'}} as const;
        const props = {...fixtureProps(), renderError, renderEmpty, items: [outside]};
        const view = render(<Fixture input={props}/>); expect(renderEmpty).toHaveBeenCalled();
        view.rerender(<Fixture input={{...props, dataState: {status: 'error', phase: 'refresh', error: 'failure'}}}/>);
        expect(renderError).toHaveBeenLastCalledWith(expect.objectContaining({kind: 'data', hasStaleItems: false}));
        view.rerender(<Fixture input={{...props, items: [{...outside, interval: {kind: 'allDay', start: '2026-01-01', end: '2026-01-02'}}],
            dataState: {status: 'error', phase: 'refresh', error: 'failure'}}}/>);
        expect(renderError).toHaveBeenLastCalledWith(expect.objectContaining({hasStaleItems: true}));
        expect(screen.getByRole('grid')).toBeInTheDocument();
        view.rerender(<Fixture input={{...props, dataState: {status: 'error', phase: 'initial', error: 'failure'}}}/>);
        expect(screen.queryByRole('grid')).not.toBeInTheDocument();
        expect(renderError).toHaveBeenLastCalledWith(expect.objectContaining({hasStaleItems: false}));
    });
    it('excludes filtered and invalid records from stale-content semantics', () => {
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        const renderError = vi.fn(() => 'Failure');
        const item = {id: 'hidden', title: 'Hidden', calendarId: 'source', data: null,
            interval: {kind: 'allDay', start: '2026-01-01', end: '2026-01-02'}} as const;
        render(<Fixture input={{...fixtureProps(), sources: [{id: 'source', title: 'Source'}], visibleSourceIds: [], onVisibleSourceIdsChange() {},
            items: [item, {...item, id: 'invalid', calendarId: undefined, interval: {kind: 'allDay', start: 'bad', end: 'bad'}}], renderError,
            dataState: {status: 'error', phase: 'refresh', error: 1}}}/>);
        expect(renderError).toHaveBeenLastCalledWith(expect.objectContaining({hasStaleItems: false}));
    });
    it('keeps content during refresh and announces completion once', () => {
        const props = fixtureProps(), view = render(<StrictMode><Fixture input={props}/></StrictMode>);
        const live = screen.getByRole('status');
        view.rerender(<StrictMode><Fixture input={{...props, dataState: {status: 'loading', phase: 'refresh'}}}/></StrictMode>);
        expect(screen.getByRole('grid')).toBeInTheDocument(); expect(screen.getByRole('progressbar')).toBeInTheDocument();
        // QA-08: the view marks its own stale content busy (the Month grid and an inline agenda, see month tests); the root,
        // the view and its progress region and the live regions are not inside a busy subtree.
        expect(screen.getByRole('region', {name: 'Calendar'})).not.toHaveAttribute('aria-busy');
        expect(document.querySelector('.nc-calendar-view')).not.toHaveAttribute('aria-busy');
        for (const node of [live, screen.getByRole('alert'), screen.getByRole('progressbar')]) expect(node.closest('[aria-busy]')).toBeNull();
        view.rerender(<StrictMode><Fixture input={props}/></StrictMode>);
        expect(live).toHaveTextContent('Calendar refreshed');
        const content = live.firstChild;
        view.rerender(<StrictMode><Fixture input={props}/></StrictMode>); expect(live.firstChild).toBe(content);
    });
    it('recovers deleted view focus to visible blocking state without duplicate live output', () => {
        const props = fixtureProps(), view = render(<Fixture input={props}/>);
        act(() => cell('2026-01-31').focus());
        view.rerender(<Fixture input={{...props, dataState: {status: 'loading', phase: 'initial'}}}/>);
        expect(screen.getByRole('region', {name: 'Loading calendar'})).toHaveFocus(); expect(screen.getByRole('status')).toBeEmptyDOMElement();
        view.rerender(<Fixture input={props}/>); expect(screen.getByRole('grid')).toBeInTheDocument();
    });
    it('does not move external focus on initial loading or error', () => {
        const props = fixtureProps(), view = render(<><button>Outside</button><Fixture input={props}/></>);
        screen.getByRole('button', {name: 'Outside'}).focus();
        view.rerender(<><button>Outside</button><Fixture input={{...props, dataState: {status: 'error', phase: 'initial', error: 'failure'}}}/></>);
        expect(screen.getByRole('button', {name: 'Outside'})).toHaveFocus();
    });
    it.each(['loading', 'error', 'contract'] as const)('recovers focus when a %s region disappears, using the accepted month', kind => {
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        const props = fixtureProps(), view = render(<StrictMode><Fixture input={props}/></StrictMode>);
        act(() => cell('2026-01-31').focus());
        const blocked: CalendarProps = kind === 'contract' ? {...props, timeZone: 'invalid'}
            : {...props, dataState: kind === 'loading' ? {status: 'loading', phase: 'initial'} : {status: 'error', phase: 'initial', error: 'Failure'}};
        view.rerender(<StrictMode><Fixture input={blocked}/></StrictMode>);
        expect(document.activeElement).toHaveClass('nc-calendar-status');
        view.rerender(<StrictMode><Fixture input={{...props, anchorDate: '2026-02-01'}}/></StrictMode>);
        expect(cell('2026-02-28')).toHaveFocus(); expect(screen.getByRole('status')).toBeEmptyDOMElement();
    });
    it.each(['loading', 'error'] as const)('preserves external focus when %s finishes', status => {
        const props = fixtureProps(), tree = (input: CalendarProps) => <><button>Outside</button><Fixture input={input}/></>;
        const view = render(tree(props)); act(() => cell('2026-01-31').focus());
        view.rerender(tree({...props, dataState: status === 'loading' ? {status, phase: 'initial'} : {status, phase: 'initial', error: 'Failure'}}));
        act(() => screen.getByRole('button', {name: 'Outside'}).focus());
        view.rerender(tree(props)); expect(screen.getByRole('button', {name: 'Outside'})).toHaveFocus();
    });
    it('recovers a focused retry button after successful data acceptance', async () => {
        const user = userEvent.setup(), onRetryRequest = vi.fn(), props = {...fixtureProps(), onRetryRequest};
        const view = render(<Fixture input={{...props, dataState: {status: 'error', phase: 'initial', error: 1}}}/>);
        await user.click(screen.getByRole('button', {name: 'Retry'})); expect(onRetryRequest).toHaveBeenCalledOnce();
        view.rerender(<Fixture input={props}/>); expect(cell('2026-01-01')).toHaveFocus();
    });
    // Review 2026-10-09-2: §5.7 types it `() => void`; an existing function with an optional first parameter
    // (a data hook's `mutate`, `refetch(options?)`) must not receive React Aria's PressEvent as data.
    it('calls onRetryRequest without arguments', async () => {
        const user = userEvent.setup(), onRetryRequest = vi.fn();
        render(<Fixture input={{...fixtureProps(), onRetryRequest, dataState: {status: 'error', phase: 'initial', error: 1}}}/>);
        await user.click(screen.getByRole('button', {name: 'Retry'}));
        await user.keyboard('{Enter}');
        expect(onRetryRequest.mock.calls).toEqual([[], []]);
    });
    it('default retry requests once, while a custom error body owns its own retry', async () => {
        const user = userEvent.setup(), retry = vi.fn(), props = {...fixtureProps(), onRetryRequest: retry, dataState: {status: 'error', phase: 'initial', error: 1} as const};
        const view = render(<Fixture input={props}/>);
        await user.click(screen.getByRole('button', {name: 'Retry'})); expect(retry).toHaveBeenCalledTimes(1);
        expect(screen.getByRole('region', {name: 'Calendar'})).toHaveAttribute('data-status', 'error');
        view.rerender(<Fixture input={{...props, renderError: () => <span>Custom</span>}}/>); expect(screen.queryByRole('button', {name: 'Retry'})).toBeNull();
    });
    it('contract error uses only safe resolvers and suppresses callbacks until valid props', () => {
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        const forbidden = vi.fn(() => { throw new Error('Forbidden resolver'); }), range = vi.fn(), error = vi.fn(() => 'Invalid props');
        const root = vi.fn(() => 'custom-root'), status = vi.fn(() => 'custom-status');
        const props = {...fixtureProps(), timeZone: 'invalid', density: 'invalid', tokens: {color: {surface: 'red'}}, onVisibleRangeChange: range,
            onRetryRequest: forbidden, sortItems: forbidden, renderToolbarContent: forbidden, renderEmpty: forbidden, renderLoading: forbidden,
            renderError: error, classNames: {root, status, toolbar: forbidden}, 'aria-label': 'My calendar'} as unknown as CalendarProps;
        const view = render(<Fixture input={props}/>);
        const region = screen.getByRole('region', {name: 'My calendar'});
        expect(region).toHaveAttribute('data-layout', 'mobile'); expect(region).toHaveAttribute('data-density', 'compact'); expect(region).toHaveAttribute('data-theme', 'classic');
        expect(region).not.toHaveAttribute('data-loading-phase'); expect(region.style.getPropertyValue('--nelmad-calendar-color-surface')).toBe('');
        expect(root).toHaveBeenCalledWith(expect.objectContaining({kind: 'contract'})); expect(status).toHaveBeenCalledWith(expect.objectContaining({kind: 'contract'}));
        expect(error).toHaveBeenLastCalledWith({kind: 'contract', error: expect.any(RangeError), hasStaleItems: false});
        expect(forbidden).not.toHaveBeenCalled(); expect(range).not.toHaveBeenCalled(); expect(screen.queryByRole('grid')).toBeNull();
        view.rerender(<Fixture input={{...fixtureProps(), onVisibleRangeChange: range}}/>); expect(range).toHaveBeenCalledTimes(1);
    });
    it('explains unavailable navigation at both anchor boundaries', () => {
        // A today outside the grid in a month beyond the bound; one in the grid stays available (§11.3, alpha1.test.tsx).
        const props = fixtureProps(), view = render(<Fixture input={{...props, anchorDate: '0001-02-01', today: '0001-01-27'}}/>);
        expect(screen.getByRole('button', {name: 'Previous month'})).toBeDisabled();
        expect(screen.getByRole('button', {name: 'Today'})).toBeDisabled();
        expect(screen.getByRole('button', {name: 'Today'})).toHaveAccessibleDescription('Month is outside the supported range');
        expect(screen.getByRole('button', {name: 'Previous month'})).toHaveAccessibleDescription('Month is outside the supported range');
        view.rerender(<Fixture input={{...props, anchorDate: '9999-11-01'}}/>);
        expect(screen.getByRole('button', {name: 'Next month'})).toBeDisabled();
    });
});

// Review 2026-10-09-2: §12.3 recovers focus displaced by a removal, not focus the user moved out of the Calendar
// (§5.1.1). A press on non-focusable page content sends focus to body without any focusin.
describe('focus the user moved out of the Calendar', () => {
    const page = (input: CalendarProps) => <><p>Blank page area</p><Fixture input={input}/></>;
    it.each(['loading', 'error'] as const)('a later initial %s does not pull focus from body into the status region', async status => {
        const user = userEvent.setup(), props = fixtureProps(), view = render(page(props));
        act(() => screen.getByRole('button', {name: 'Next month'}).focus());
        await user.click(screen.getByText('Blank page area'));
        expect(document.activeElement).toBe(document.body);
        view.rerender(page({...props, dataState: status === 'loading' ? {status, phase: 'initial'} : {status, phase: 'initial', error: 'Failure'}}));
        expect(document.activeElement).toBe(document.body);
        view.rerender(page(props));
        expect(document.activeElement).toBe(document.body);
    });
    it('a later update that removes the focused inline agenda row leaves focus on body', async () => {
        const user = userEvent.setup(), tree = (items: CalendarProps['items']) => <><p>Blank page area</p>
            <CalendarMonth {...fixtureProps()} anchorDate="2026-03-01" today="2026-03-04" layout="mobile" onItemPress={() => {}} items={items}/></>;
        const view = render(tree([{id: 'a', title: 'Alpha', data: {}, interval: {kind: 'timed', start: '2026-03-04T10:00:00Z'}}]));
        act(() => screen.getByRole('button', {name: /Alpha/}).focus());
        await user.click(screen.getByText('Blank page area'));
        expect(document.activeElement).toBe(document.body);
        view.rerender(tree([]));
        expect(document.activeElement).toBe(document.body);
    });
    // Round 2: a tap moves focus at the compatibility mousedown, after pointerup and touchend; only the click sees body.
    const tap = (target: Element) => {
        fireEvent.pointerDown(target, {pointerType: 'touch'}); fireEvent.pointerUp(target, {pointerType: 'touch'}); fireEvent.touchEnd(target);
        expect(document.activeElement).not.toBe(document.body);
        fireEvent.mouseDown(target); act(() => (document.activeElement as HTMLElement).blur()); fireEvent.click(target);
        expect(document.activeElement).toBe(document.body);
    };
    it('a tap outside (focus moves after pointerup) also leaves focus on body when a later update removes the inline row', () => {
        const tree = (items: CalendarProps['items']) => <><p>Blank page area</p>
            <CalendarMonth {...fixtureProps()} anchorDate="2026-03-01" today="2026-03-04" layout="mobile" onItemPress={() => {}} items={items}/></>;
        const view = render(tree([{id: 'a', title: 'Alpha', data: {}, interval: {kind: 'timed', start: '2026-03-04T10:00:00Z'}}]));
        act(() => screen.getByRole('button', {name: /Alpha/}).focus());
        tap(screen.getByText('Blank page area'));
        view.rerender(tree([]));
        expect(document.activeElement).toBe(document.body);
    });
    it('a tap outside leaves focus on body when a later initial load replaces the toolbar', () => {
        const props = fixtureProps(), view = render(page(props));
        act(() => screen.getByRole('button', {name: 'Next month'}).focus());
        tap(screen.getByText('Blank page area'));
        view.rerender(page({...props, dataState: {status: 'loading', phase: 'initial'}}));
        expect(document.activeElement).toBe(document.body);
    });
    it('a press inside the Calendar keeps its recovery: the removed control was still focused', async () => {
        const user = userEvent.setup(), props = fixtureProps(), view = render(page(props));
        await user.click(cell('2026-01-31'));
        expect(cell('2026-01-31')).toHaveFocus();
        view.rerender(page({...props, dataState: {status: 'loading', phase: 'initial'}}));
        expect(screen.getByRole('region', {name: 'Loading calendar'})).toHaveFocus();
    });
});
describe('status placement and live payloads (QA-07, QA-08)', () => {
    const tree = (input: CalendarProps) => <StrictMode><Fixture input={input}/></StrictMode>;
    // Each write of a live host is one replaceChildren record; its added text is the payload.
    const recordWrites = (host: HTMLElement) => {
        const writes: string[] = [];
        new MutationObserver(records => { for (const record of records) writes.push([...record.addedNodes].map(node => node.textContent).join('')); })
            .observe(host, {childList: true});
        return async () => { await act(async () => {}); return writes; };
    };
    const refresh = {status: 'loading', phase: 'refresh'} as const;
    // QA-D-3-03 (lead decision on QA-08): a refresh start writes nothing, so it never replaces the month announcement; its
    // completion is announced once per refresh -> ready transition. QA-D-1-01/04: the month is announced once.
    it('announces an accepted month once; a refresh start writes nothing and its completion once', async () => {
        const user = userEvent.setup(), props = fixtureProps(), view = render(tree(props)), live = screen.getByRole('status'), writes = recordWrites(live);
        await user.click(screen.getByRole('button', {name: 'Next month'}));
        view.rerender(tree({...props, anchorDate: '2026-02-01'}));
        view.rerender(tree({...props, anchorDate: '2026-02-01', dataState: refresh}));
        expect(live).toHaveTextContent('Showing February 2026');
        view.rerender(tree({...props, anchorDate: '2026-02-01'}));
        view.rerender(tree({...props, anchorDate: '2026-02-01', items: [...props.items], dataState: refresh}));
        view.rerender(tree({...props, anchorDate: '2026-02-01', items: [...props.items], dataState: refresh}));
        // The second refresh start only clears the stale completion (QA-D-4-02); it writes no text.
        expect(await writes()).toEqual(['Showing February 2026', 'Calendar refreshed', '']); expect(live).toBeEmptyDOMElement();
    });
    it('two consecutive refresh cycles announce two distinct completion payloads: the stale completion is cleared at the next start (QA-D-4-02)', async () => {
        const props = fixtureProps(), view = render(tree(props)), live = screen.getByRole('status'), writes = recordWrites(live);
        for (let cycle = 0; cycle < 2; cycle++) { view.rerender(tree({...props, dataState: refresh})); view.rerender(tree({...props, items: [...props.items]})); }
        expect(await writes()).toEqual(['Calendar refreshed', '', 'Calendar refreshed']); expect(live).toHaveTextContent('Calendar refreshed');
        // A month announcement is never cleared by the refresh the host starts for it.
        const user = userEvent.setup();
        await user.click(screen.getByRole('button', {name: 'Next month'}));
        view.rerender(tree({...props, anchorDate: '2026-02-01'})); view.rerender(tree({...props, anchorDate: '2026-02-01', dataState: refresh}));
        expect(live).toHaveTextContent('Showing February 2026');
    });
    // §12.4 lifecycle table (S12.4-e9b2c18d692a): only a committed loading/refresh -> ready transition announces completion.
    it('announces refresh completion once per refresh -> ready transition, never after an initial load, a refresh error or a remount', async () => {
        const props = fixtureProps(), view = render(tree({...props, dataState: {status: 'loading', phase: 'initial'}})), writes = recordWrites(screen.getByRole('status'));
        view.rerender(tree(props));
        view.rerender(tree({...props, dataState: {status: 'error', phase: 'refresh', error: 1}})); view.rerender(tree(props));
        view.rerender(tree({...props, dataState: refresh})); view.rerender(tree(props)); view.rerender(tree({...props, items: [...props.items]}));
        expect((await writes()).filter(Boolean)).toEqual(['Calendar refreshed']);
        view.unmount();
        const again = render(tree(props)), rewrites = recordWrites(screen.getByRole('status'));
        again.rerender(tree({...props, items: [...props.items]}));
        expect((await rewrites()).filter(Boolean)).toEqual([]); expect(screen.getByRole('status')).toBeEmptyDOMElement();
    });
    it('never repeats the month for a refresh after focus left the calendar', async () => {
        const user = userEvent.setup(), props = fixtureProps();
        const page = (input: CalendarProps) => <><button>Outside</button>{tree(input)}</>;
        const view = render(page(props)), writes = recordWrites(screen.getByRole('status'));
        await user.click(screen.getByRole('button', {name: 'Next month'}));
        view.rerender(page({...props, anchorDate: '2026-02-01'}));
        act(() => screen.getByRole('button', {name: 'Outside'}).focus());
        view.rerender(page({...props, anchorDate: '2026-02-01', dataState: refresh}));
        view.rerender(page({...props, anchorDate: '2026-02-01'}));
        expect(await writes()).toEqual(['Showing February 2026', 'Calendar refreshed']);
    });
    it('announces only the month when acceptance and refresh commit together; a refresh start clears only a stale error', async () => {
        const user = userEvent.setup(), props = fixtureProps(), view = render(tree(props)), writes = recordWrites(screen.getByRole('status'));
        await user.click(screen.getByRole('button', {name: 'Next month'}));
        view.rerender(tree({...props, anchorDate: '2026-02-01', dataState: refresh}));
        view.rerender(tree({...props, anchorDate: '2026-02-01'}));
        await user.click(screen.getByRole('button', {name: 'Next month'}));
        view.rerender(tree({...props, anchorDate: '2026-03-01'}));
        await user.keyboard('{Shift}');
        view.rerender(tree({...props, anchorDate: '2026-03-01', dataState: refresh}));
        view.rerender(tree({...props, anchorDate: '2026-03-01', dataState: {status: 'error', phase: 'refresh', error: 1}}));
        expect(screen.getByRole('alert')).toHaveTextContent('Could not load calendar');
        view.rerender(tree({...props, anchorDate: '2026-03-01', dataState: refresh}));
        expect(await writes()).toEqual(['Showing February 2026', 'Calendar refreshed', 'Showing March 2026', '']);
        expect(screen.getByRole('alert')).toBeEmptyDOMElement();
    });
    it('draws a refresh as a progress bar at the top of the view and a refresh error as a banner before it; the toolbar holds no status (QA-D-3-01)', async () => {
        const user = userEvent.setup(), props = fixtureProps(), view = render(tree({...props, dataState: refresh}));
        const progress = screen.getByRole('progressbar', {name: 'Refreshing calendar'}), text = document.getElementById(progress.getAttribute('aria-labelledby')!)!;
        const status = progress.closest<HTMLElement>('.nc-calendar-status')!;
        const toolbar = document.querySelector('.nc-calendar-toolbar')!, calendarView = document.querySelector('.nc-calendar-view')!;
        expect(status).toHaveAttribute('data-placement', 'progress'); expect(progress).not.toHaveAttribute('aria-label');
        expect(calendarView.firstElementChild).toBe(status); expect(toolbar.querySelector('.nc-calendar-status')).toBeNull();
        // QA-D-4-04: the name is exposed once, on the progress bar: the wrapper is no named region and the text that names
        // the bar is not drawn and hidden from the accessibility tree.
        expect(status).not.toHaveAttribute('role'); expect(status).not.toHaveAttribute('aria-labelledby'); expect(status).not.toHaveAttribute('tabindex');
        expect(screen.queryByRole('region', {name: 'Refreshing calendar'})).toBeNull();
        expect(text).toHaveTextContent('Refreshing calendar'); expect(status.contains(text)).toBe(true); expect(text).toHaveClass('nc-visually-hidden');
        expect(text).toHaveAttribute('aria-hidden', 'true');
        expect(toolbar.nextElementSibling).toBe(calendarView);
        view.rerender(tree({...props, dataState: {status: 'error', phase: 'refresh', error: 1}, onRetryRequest() {}}));
        const banner = screen.getByRole('region', {name: 'Could not load calendar'}), retry = within(banner).getByRole('button', {name: 'Retry'});
        expect(banner).toHaveAttribute('data-placement', 'banner'); expect(toolbar.nextElementSibling).toBe(banner); expect(banner.nextElementSibling).toBe(calendarView);
        expect(toolbar.querySelector('.nc-calendar-status')).toBeNull(); expect(calendarView.querySelector('.nc-calendar-status')).toBeNull();
        // The Tab order of QA-07 is kept: the toolbar controls, the retry control, then the grid.
        screen.getByRole('button', {name: 'Next month'}).focus(); await user.tab(); expect(retry).toHaveFocus();
        await user.tab(); expect(screen.getByRole('grid').contains(document.activeElement)).toBe(true);
        // A custom refresh body has a size the package cannot know: it is a banner too, never drawn over the grid.
        view.rerender(tree({...props, dataState: refresh, renderLoading: () => <a href="#details">Details</a>}));
        const custom = screen.getByRole('region', {name: 'Refreshing calendar'});
        expect(custom).toHaveAttribute('data-placement', 'banner'); expect(custom.nextElementSibling).toBe(calendarView);
        expect(within(custom).getByRole('link', {name: 'Details'})).toBeInTheDocument(); expect(screen.queryByRole('progressbar')).toBeNull();
    });
    it.each([['2026-02-01', 4], ['2026-01-01', 5], ['2026-08-01', 6]] as const)('keeps the week count of %s on a blocking status (%i weeks)', (anchorDate, weeks) => {
        // A host clock shim may replace the global Date: the count never reads it.
        vi.spyOn(Date, 'parse').mockImplementation(() => { throw new TypeError('Date.parse is not a function'); });
        const props = {...fixtureProps(), anchorDate}, view = render(tree({...props, dataState: {status: 'loading', phase: 'initial'}}));
        const status = screen.getByRole('region', {name: 'Loading calendar'});
        expect(status).toHaveAttribute('data-placement', 'block'); expect(status).toHaveAttribute('data-weeks', String(weeks));
        view.rerender(tree({...props, dataState: {status: 'error', phase: 'initial', error: 1}}));
        expect(screen.getByRole('region', {name: 'Could not load calendar'})).toHaveAttribute('data-weeks', String(weeks));
    });
});

describe('root naming and today lifecycle', () => {
    it('keeps English accessible labels separate from Arabic date formatting', () => {
        const props = {...fixtureProps(), locale: 'ar'}, view = render(<Fixture input={props}/>);
        expect(screen.getByRole('region', {name: 'Calendar'})).toHaveAttribute('lang', 'en-US');
        expect(screen.getByRole('heading')).toHaveAttribute('lang', 'ar');
        expect(screen.getByRole('region', {name: 'Calendar'})).toHaveAttribute('dir', 'rtl');
        for (const name of ['Previous month', 'Today', 'Next month']) expect(screen.getByRole('button', {name})).toHaveAttribute('lang', 'en-US');
        expect(screen.getByRole('region', {name: 'No events in this month'})).toHaveAttribute('lang', 'en-US');
        view.rerender(<Fixture input={{...props, dataState: {status: 'loading', phase: 'refresh'}}}/>);
        expect(screen.getByRole('progressbar', {name: 'Refreshing calendar'})).toHaveAttribute('lang', 'en-US');
        view.rerender(<Fixture input={{...props, dataState: {status: 'error', phase: 'initial', error: 1}}}/>);
        expect(screen.getByRole('region', {name: 'Could not load calendar'})).toHaveAttribute('lang', 'en-US');
    });
    it('preserves override languages and consumer slot language independently', () => {
        const props = {...fixtureProps(), locale: 'ar', messagesLocale: 'fr', messages: {calendarLabel: 'Calendrier', previousMonthLabel: 'Mois précédent'},
            renderEmpty: () => <span data-testid="custom-empty">Consumer text</span>};
        const view = render(<Fixture input={props}/>);
        expect(screen.getByRole('region', {name: 'Calendrier'})).toHaveAttribute('lang', 'fr');
        expect(screen.getByRole('button', {name: 'Mois précédent'})).toHaveAttribute('lang', 'fr');
        expect(screen.getByRole('button', {name: 'Next month'})).toHaveAttribute('lang', 'en-US');
        expect(screen.getByTestId('custom-empty').closest('[lang]')).toHaveAttribute('lang', 'ar');
        view.rerender(<Fixture input={{...props, 'aria-label': 'اسم المستخدم'}}/>);
        expect(screen.getByRole('region', {name: 'اسم المستخدم'})).toHaveAttribute('lang', 'ar');
    });
    it('filters IDREFs and revalidates target content/removal without callbacks', async () => {
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        const range = vi.fn(), props = {...fixtureProps(), 'aria-label': 'Fallback', 'aria-labelledby': 'label absent empty', onVisibleRangeChange: range};
        const view = render(<><span id="label">Project</span><span id="empty"/><Fixture input={props}/></>);
        expect(screen.getByRole('region', {name: 'Project'})).toHaveAttribute('aria-labelledby', 'label');
        view.rerender(<><span id="label"/><span id="empty"/><Fixture input={props}/></>);
        await waitFor(() => expect(screen.getByRole('region', {name: 'Fallback'})).not.toHaveAttribute('aria-labelledby'));
        expect(range).toHaveBeenCalledTimes(1);
    });
    // Review 2026-10-09-2: a Calendar rendered into a container that the host attaches later (a custom element before
    // connectedCallback, a framework wrapper) is validated once connected, and again on later changes (§5.7).
    it('validates aria-labelledby once a root rendered into a detached container is attached', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const label = document.createElement('h2'); label.id = 'detached-title'; label.textContent = 'Team calendar'; document.body.append(label);
        const container = document.createElement('div'), root = createRoot(container);
        try {
            await act(async () => root.render(<Fixture input={{...fixtureProps(), 'aria-labelledby': 'detached-title'}}/>));
            const region = container.querySelector('.nc-calendar')!;
            expect(region).not.toHaveAttribute('aria-labelledby');
            await act(async () => { document.body.append(container); });
            await waitFor(() => expect(region).toHaveAttribute('aria-labelledby', 'detached-title'));
            await act(async () => { label.textContent = ''; });
            await waitFor(() => expect(region).not.toHaveAttribute('aria-labelledby'));
            expect(warn).toHaveBeenCalledWith(expect.stringContaining('aria-labelledby: Ignored missing, empty or cross-tree references: detached-title'));
        } finally { act(() => root.unmount()); container.remove(); label.remove(); }
    });
    // Round 2: a document observer never sees an insertion into a ShadowRoot; the detached root re-checks its connection.
    it.each(['a detached root later inserted into an attached ShadowRoot', 'a connected root moved into a ShadowRoot in a later task'])('validates aria-labelledby of %s', async variant => {
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        const host = document.createElement('div'); document.body.append(host);
        const shadow = host.attachShadow({mode: 'open'}), label = document.createElement('h2'); label.id = 'shadow-title'; label.textContent = 'Team calendar'; shadow.append(label);
        const container = document.createElement('div'), root = createRoot(container), moved = variant.startsWith('a connected');
        if (moved) document.body.append(container);
        try {
            await act(async () => root.render(<Fixture input={{...fixtureProps(), 'aria-labelledby': 'shadow-title'}}/>));
            const region = container.querySelector('.nc-calendar')!;
            // In the document the IDREF is cross-tree (§5.7): no name.
            expect(region).not.toHaveAttribute('aria-labelledby');
            if (moved) { await act(async () => { container.remove(); }); await act(() => new Promise(resolve => setTimeout(resolve, 20))); }
            await act(async () => { shadow.append(container); });
            await waitFor(() => expect(region).toHaveAttribute('aria-labelledby', 'shadow-title'));
            // The observer now watches the ShadowRoot: a later emptied label is seen there.
            await act(async () => { label.textContent = ''; });
            await waitFor(() => expect(region).not.toHaveAttribute('aria-labelledby'));
        } finally { act(() => root.unmount()); host.remove(); }
    });
    it('a root that stays detached re-checks per frame until unmount, then schedules nothing', async () => {
        const frames = vi.spyOn(window, 'requestAnimationFrame'), cancels = vi.spyOn(window, 'cancelAnimationFrame');
        const container = document.createElement('div'), root = createRoot(container);
        await act(async () => root.render(<Fixture input={{...fixtureProps(), 'aria-labelledby': 'nowhere'}}/>));
        const first = frames.mock.calls.length;
        await act(() => new Promise(resolve => setTimeout(resolve, 100)));
        expect(frames.mock.calls.length).toBeGreaterThan(first);
        act(() => root.unmount());
        expect(cancels).toHaveBeenCalled();
        const after = frames.mock.calls.length;
        await act(() => new Promise(resolve => setTimeout(resolve, 100)));
        expect(frames.mock.calls.length).toBe(after);
    });
    it('accepts non-text label contributions and rejects decorative-only content', async () => {
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        render(<><span id="image-label"><img alt="Calendar project"/></span><span id="decorative"><span aria-hidden="true">Decoration</span></span>
            <Fixture input={{...fixtureProps(), 'aria-labelledby': 'decorative image-label'}}/></>);
        expect(screen.getByRole('region', {name: 'Calendar project'})).toHaveAttribute('aria-labelledby', 'image-label');
    });
    it('uses snapshots without reading the clock and computes fallback only after mount', () => {
        const now = vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-01-17T12:00:00Z'));
        const props = fixtureProps(), view = render(<Fixture input={props}/>);
        expect(now).not.toHaveBeenCalled(); expect(screen.getByTestId('today')).toHaveTextContent('2026-02-14');
        const {today: _today, ...withoutToday} = props;
        view.rerender(<Fixture input={withoutToday}/>);
        expect(now).toHaveBeenCalled(); expect(screen.getByTestId('today')).toHaveTextContent('2026-01-17'); expect(screen.getByTestId('agenda')).toHaveTextContent('2026-01-17');
    });
    it('rolls over at the timezone boundary, resyncs on visibility and cleans timers', () => {
        vi.useFakeTimers(); vi.setSystemTime(new Date('2026-03-29T21:59:59Z'));
        const {today: _today, ...props} = fixtureProps();
        const view = render(<Fixture input={{...props, anchorDate: '2026-03-01', timeZone: 'Europe/Berlin'}}/>);
        expect(screen.getByTestId('today')).toHaveTextContent('2026-03-29');
        act(() => vi.advanceTimersByTime(1000)); expect(screen.getByTestId('today')).toHaveTextContent('2026-03-30');
        vi.setSystemTime(new Date('2026-04-01T12:00:00Z')); fireEvent(document, new Event('visibilitychange'));
        expect(screen.getByTestId('today')).toHaveTextContent('2026-04-01');
        view.unmount(); expect(vi.getTimerCount()).toBe(0);
    });
    it('snapshot changes do not overwrite a touched or controlled agenda date', () => {
        const props = {...fixtureProps(), today: '2026-01-17'}, view = render(<Fixture input={props}/>);
        fireEvent.click(cell('2026-01-03'));
        view.rerender(<Fixture input={{...props, today: '2026-01-18'}}/>); expect(screen.getByTestId('agenda')).toHaveTextContent('2026-01-03');
        view.rerender(<Fixture input={{...props, agendaDate: '2026-05-10', onAgendaDateChange() {}}}/>);
        view.rerender(<Fixture input={props}/>); expect(screen.getByTestId('agenda')).toHaveTextContent('2026-05-10');
    });
});
