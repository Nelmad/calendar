import {StrictMode, type ReactNode} from 'react';
import {act, render, screen, waitFor, within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {hydrateRoot} from 'react-dom/client';
import {renderToString} from 'react-dom/server';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {Calendar, type CalendarItem, type CalendarProps, type CalendarSource} from '../../../index.js';
import {resetSurfaceWarnings} from '../../surface.js';
import {createOverlayStack} from '../overlays.js';

// T17: controlled sources and the built-in selector (§5.6, §12.2, R27.1, R39, R41 source part) through the public Calendar.
type Team = {team: string};
const sources: CalendarSource<Team>[] = [{id: 'work', title: 'Work', data: {team: 'a'}}, {id: 'home', title: 'Home'}, {id: 'gym', title: 'Gym'}];
const at = (id: string, calendarId?: string): CalendarItem => ({id, title: id[0].toUpperCase() + id.slice(1), data: {}, ...(calendarId ? {calendarId} : {}),
    interval: {kind: 'allDay', start: '2026-03-04', end: '2026-03-05'}});
const items = [at('report', 'work'), at('dinner', 'home'), at('run', 'gym'), at('note'), at('lost', 'missing')];
type Props = CalendarProps<unknown, Team>;
const input = (overrides: Partial<Props> = {}): Props => ({items, sources, visibleSourceIds: ['work', 'home', 'gym'], onVisibleSourceIdsChange() {},
    anchorDate: '2026-03-01', today: '2026-03-04', timeZone: 'UTC', locale: 'en-US', layout: 'desktop', onNavigate() {}, onItemPress() {},
    getItemActions: () => [{id: 'open', label: 'Open'}], onItemActionRequest() {}, ...overrides} as Props);
const cell = (date = '2026-03-04') => screen.getAllByRole('gridcell').find(node => node.dataset.date === date)!;
const selector = () => screen.getByRole('button', {name: 'Calendars'});
const isolated = (text: string) => `⁨${text}⁩`;
const hide = (title: string) => `Hide calendar ${isolated(title)}`, show = (title: string) => `Show calendar ${isolated(title)}`;
/** The cell's accessible name and description: the full count of items that passed the filter (§12.1). */
const count = () => ['aria-labelledby', 'aria-describedby'].flatMap(name => cell().getAttribute(name)?.split(' ') ?? []).map(id => document.getElementById(id)?.textContent).join(' ');
let warn: ReturnType<typeof vi.spyOn>;
beforeEach(() => { resetSurfaceWarnings(); warn = vi.spyOn(console, 'warn').mockImplementation(() => {}); });
afterEach(() => { warn.mockRestore(); });
const warnings = () => warn.mock.calls.map(([message]) => String(message));
function agendaRows() { return within(screen.getByRole('dialog', {name: /Events for/})).getAllByRole('listitem').map(node => node.dataset.itemId); }

describe('controlled source filter (§5.6, R27.1)', () => {
    it('a delayed acceptance keeps the checked state and labels; then grid, agenda, count and actions update together', async () => {
        const user = userEvent.setup(), onVisibleSourceIdsChange = vi.fn(), props = input({onVisibleSourceIdsChange});
        const tree = (overrides: Partial<Props> = {}) => <StrictMode><Calendar {...props} {...overrides}/></StrictMode>;
        const view = render(tree());
        expect(selector()).toHaveAttribute('aria-haspopup', 'menu'); expect(selector()).toHaveAttribute('aria-expanded', 'false');
        await user.click(selector());
        const menu = screen.getByRole('menu', {name: 'Calendars'});
        expect(selector()).toHaveAttribute('aria-expanded', 'true'); expect(selector()).toHaveAttribute('aria-controls', menu.id);
        const checkboxes = within(menu).getAllByRole('menuitemcheckbox');
        expect(checkboxes.map(node => [node.getAttribute('aria-label'), node.getAttribute('aria-checked')])).toEqual([
            [hide('Work'), 'true'], [hide('Home'), 'true'], [hide('Gym'), 'true']]);
        expect(checkboxes[0]).toHaveFocus();
        await user.keyboard('{ArrowDown}{Enter}');
        expect(onVisibleSourceIdsChange.mock.calls).toEqual([[['work', 'gym']]]);
        // No optimistic toggle: the accepted value still decides the state and the action name; the menu stays open.
        expect(screen.getByRole('menuitemcheckbox', {name: hide('Home')})).toHaveAttribute('aria-checked', 'true');
        expect(screen.getByRole('menu')).toBeInTheDocument();
        view.rerender(tree({visibleSourceIds: ['work', 'gym']}));
        expect(screen.getByRole('menuitemcheckbox', {name: show('Home')})).toHaveAttribute('aria-checked', 'false');
        expect(screen.getByRole('menuitemcheckbox', {name: show('Home')})).toHaveFocus();
        await user.keyboard('{Escape}'); expect(screen.queryByRole('menu')).toBeNull(); expect(selector()).toHaveFocus();
        expect(selector()).not.toHaveAttribute('aria-controls');
        // The accepted filter excludes the hidden item everywhere; no source and an unknown source stay visible.
        expect(count()).toContain('4 events');
        act(() => cell().focus()); await user.keyboard('{Enter}');
        expect(agendaRows()).toEqual(['lost', 'note', 'report', 'run']);
        expect(screen.queryByRole('button', {name: `Actions for ${isolated('Dinner')}`})).toBeNull();
        expect(screen.getByRole('button', {name: `Actions for ${isolated('Note')}`})).toBeInTheDocument();
        expect(warnings().filter(message => message.includes('calendarId'))).toEqual([
            '[@nelmad/calendar] items[4].calendarId: No source with ID "missing"; items with this calendarId remain visible with fallback appearance']);
    });
    it('names each unknown calendarId once per Calendar: a reordered feed stays silent, a new unknown ID is reported with its item path', () => {
        const props = input(), view = render(<Calendar {...props}/>);
        view.rerender(<Calendar {...props} items={[at('lost', 'missing'), ...items.slice(0, 4), at('late', 'missing')]}/>);
        view.rerender(<Calendar {...props} items={[...items, at('stray', 'retired')]}/>);
        expect(warnings().filter(message => message.includes('calendarId'))).toEqual([
            '[@nelmad/calendar] items[4].calendarId: No source with ID "missing"; items with this calendarId remain visible with fallback appearance',
            '[@nelmad/calendar] items[5].calendarId: No source with ID "retired"; items with this calendarId remain visible with fallback appearance']);
        expect(warnings().join('\n')).not.toContain('items[].calendarId');
    });
    it('rejection or a later external value never imitates a successful toggle', async () => {
        const user = userEvent.setup(), onVisibleSourceIdsChange = vi.fn(), props = input({visibleSourceIds: ['work'], onVisibleSourceIdsChange});
        const view = render(<Calendar {...props}/>);
        await user.click(selector()); await user.click(screen.getByRole('menuitemcheckbox', {name: show('Gym')}));
        expect(onVisibleSourceIdsChange.mock.calls).toEqual([[['work', 'gym']]]);
        view.rerender(<Calendar {...props} visibleSourceIds={['home']}/>);
        expect(screen.getAllByRole('menuitemcheckbox').map(node => node.getAttribute('aria-checked'))).toEqual(['false', 'true', 'false']);
        expect(screen.getByRole('menuitemcheckbox', {name: show('Gym')})).toBeInTheDocument();
    });
    it('ignores unknown and repeated filter IDs and reports them; the callback sends unique known IDs in sources order', async () => {
        const user = userEvent.setup(), onVisibleSourceIdsChange = vi.fn();
        render(<Calendar {...input({visibleSourceIds: ['gym', 'nope', 'gym'], onVisibleSourceIdsChange})}/>);
        await user.click(selector());
        expect(screen.getAllByRole('menuitemcheckbox').map(node => node.getAttribute('aria-checked'))).toEqual(['false', 'false', 'true']);
        await user.click(screen.getByRole('menuitemcheckbox', {name: show('Work')}));
        expect(onVisibleSourceIdsChange.mock.calls).toEqual([[['work', 'gym']]]);
        expect(warnings()).toEqual(expect.arrayContaining(['[@nelmad/calendar] visibleSourceIds[1]: Unknown or repeated source ID',
            '[@nelmad/calendar] visibleSourceIds[2]: Unknown or repeated source ID']));
    });
    it('invalid and duplicate sources are excluded: items of a duplicate ID count as unknown and stay visible; one valid source hides the selector', () => {
        const broken = [{id: 'work', title: 'Work'}, {id: 'home', title: 'Home'}, {id: 'home', title: 'Home 2'}, {id: ' ', title: 'Blank'}] as CalendarSource<Team>[];
        render(<Calendar {...input({sources: broken, visibleSourceIds: ['work']})}/>);
        expect(screen.queryByRole('button', {name: 'Calendars'})).toBeNull();
        // report (work) + dinner (duplicate home: unknown) + run (gym: unknown) + note + lost.
        expect(count()).toContain('5 events');
        expect(warnings()).toEqual(expect.arrayContaining(['[@nelmad/calendar] sources[1]: All sources with this ID are excluded',
            '[@nelmad/calendar] sources[2]: All sources with this ID are excluded', '[@nelmad/calendar] sources[3]: Source requires nonempty id and title']));
    });
    it('showSourceSelector={false} hides the built-in selector, while the accepted filter still applies', () => {
        render(<Calendar {...input({visibleSourceIds: ['work'], showSourceSelector: false})}/>);
        expect(screen.queryByRole('button', {name: 'Calendars'})).toBeNull();
        expect(count()).toContain('3 events');
    });
    it('removing the controlled pair shows every source at once and hides the selector; re-adding accepts only the current array; no callback', () => {
        const onVisibleSourceIdsChange = vi.fn(), props = input({visibleSourceIds: ['work'], onVisibleSourceIdsChange});
        const {visibleSourceIds: _ids, onVisibleSourceIdsChange: _callback, ...uncontrolled} = props;
        const view = render(<Calendar {...props}/>); expect(count()).toContain('3 events');
        view.rerender(<Calendar {...uncontrolled as Props}/>);
        expect(count()).toContain('5 events'); expect(screen.queryByRole('button', {name: 'Calendars'})).toBeNull();
        view.rerender(<Calendar {...props} visibleSourceIds={['home']}/>);
        expect(count()).toContain('3 events'); expect(onVisibleSourceIdsChange).not.toHaveBeenCalled();
    });
    it('a half pair or a selector flag without the pair is a contract error naming the prop', () => {
        const {onVisibleSourceIdsChange: _callback, ...half} = input();
        const view = render(<Calendar {...half as Props}/>);
        expect(screen.queryByRole('grid')).toBeNull();
        expect(warnings()).toContain('[@nelmad/calendar] visibleSourceIds: Must be supplied together with onVisibleSourceIdsChange');
        const {visibleSourceIds: _ids, onVisibleSourceIdsChange: _change, ...rest} = input();
        view.rerender(<Calendar {...{...rest, showSourceSelector: true} as unknown as Props}/>);
        expect(warnings()).toContain('[@nelmad/calendar] showSourceSelector: Requires visibleSourceIds and its callback');
    });
});

describe('overlay DOM ids (T17-V1-D3)', () => {
    it('two Calendars on one page give their selector menus different ids, each referenced by its own trigger', async () => {
        const user = userEvent.setup();
        render(<><Calendar {...input()} aria-label="First"/><Calendar {...input()} aria-label="Second"/></>);
        const [first, second] = screen.getAllByRole('button', {name: 'Calendars'});
        await user.click(first); const a = screen.getByRole('menu').id; expect(first).toHaveAttribute('aria-controls', a);
        await user.keyboard('{Escape}');
        await user.click(second); const b = screen.getByRole('menu').id; expect(second).toHaveAttribute('aria-controls', b);
        expect(a).not.toBe(b); expect(document.querySelectorAll(`[id="${b}"]`)).toHaveLength(1);
    });
    it('the child id encoding is injective: item IDs that differ only in non-word characters get different ids', () => {
        const stack = createOverlayStack(':r1:');
        const ids = ['actions:a.b', 'actions:a-b', 'actions:a b', 'actions:a_b', 'actions:a/b'].map(stack.domId);
        expect(new Set(ids).size).toBe(ids.length);
        expect(createOverlayStack(':r2:').domId('sources')).not.toBe(stack.domId('sources'));
    });
});

describe('desktop source menu keyboard and dismissal (§12.2)', () => {
    it('Tab and Shift+Tab close the menu and continue right after or before its trigger; an outside focus keeps its target', async () => {
        const user = userEvent.setup(), tree = <><button>Before</button><Calendar {...input()}/><button>After</button></>;
        render(tree);
        await user.click(selector()); await user.tab();
        expect(screen.queryByRole('menu')).toBeNull(); expect(document.activeElement).not.toBe(selector());
        expect(selector().compareDocumentPosition(document.activeElement!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        await user.click(selector()); await user.tab({shift: true});
        expect(screen.queryByRole('menu')).toBeNull(); expect(screen.getByRole('button', {name: 'Next month'})).toHaveFocus();
        await user.click(selector()); act(() => screen.getByRole('button', {name: 'After'}).focus());
        expect(screen.queryByRole('menu')).toBeNull(); expect(screen.getByRole('button', {name: 'After'})).toHaveFocus();
    });
    it('a source removed while its menu item has focus keeps focus in the open menu at the old position: the next item, else the previous (§12.3, T17-V1-D2)', async () => {
        const user = userEvent.setup(), onVisibleSourceIdsChange = vi.fn(), props = input({onVisibleSourceIdsChange});
        const view = render(<Calendar {...props}/>);
        await user.click(selector()); await user.keyboard('{ArrowDown}{ArrowDown}');
        expect(screen.getByRole('menuitemcheckbox', {name: hide('Gym')})).toHaveFocus();
        // The last item leaves: no next one, so the previous neighbor.
        view.rerender(<Calendar {...props} sources={sources.slice(0, 2)}/>);
        await waitFor(() => expect(screen.getByRole('menuitemcheckbox', {name: hide('Home')})).toHaveFocus());
        await user.keyboard('{Enter}'); expect(onVisibleSourceIdsChange.mock.calls).toEqual([[['work']]]);
    });
    it('a middle source removed while focused moves focus to the next item after its position (§12.3, T17-V1-D2)', async () => {
        const user = userEvent.setup(), props = input();
        const view = render(<Calendar {...props}/>);
        await user.click(selector()); await user.keyboard('{ArrowDown}');
        expect(screen.getByRole('menuitemcheckbox', {name: hide('Home')})).toHaveFocus();
        view.rerender(<Calendar {...props} sources={[sources[0], sources[2]]} visibleSourceIds={['work', 'gym']}/>);
        await waitFor(() => expect(screen.getByRole('menuitemcheckbox', {name: hide('Gym')})).toHaveFocus());
    });
    it('pressing the trigger again toggles the menu closed; opening the selector dismisses an open agenda popover', async () => {
        const user = userEvent.setup(); render(<Calendar {...input()}/>);
        act(() => cell().focus()); await user.keyboard('{Enter}'); expect(screen.getByRole('dialog')).toBeInTheDocument();
        await user.click(selector());
        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull()); expect(screen.getByRole('menu')).toBeInTheDocument();
        await user.click(selector()); expect(screen.queryByRole('menu')).toBeNull(); expect(selector()).toHaveFocus();
    });
});

describe('mobile source sheet (§12.2, R41, §12.4)', () => {
    const mobile = (overrides: Partial<Props> = {}) => input({layout: 'mobile', ...overrides});
    it('is a modal dialog named by its heading with named checkboxes; focus starts on the first; toggles are not optimistic', async () => {
        const user = userEvent.setup(), onVisibleSourceIdsChange = vi.fn(), props = mobile({visibleSourceIds: ['work'], onVisibleSourceIdsChange});
        const view = render(<><Calendar {...props}/><button>After</button></>);
        expect(selector()).toHaveAttribute('aria-haspopup', 'dialog');
        await user.click(selector());
        const sheet = screen.getByRole('dialog', {name: 'Calendars'});
        expect(sheet).toHaveAttribute('aria-modal', 'true'); expect(within(sheet).getByRole('heading', {name: 'Calendars'})).toBeInTheDocument();
        const boxes = within(sheet).getAllByRole('checkbox');
        expect(boxes.map(node => [node.getAttribute('aria-label'), (node as HTMLInputElement).checked])).toEqual([[hide('Work'), true], [show('Home'), false], [show('Gym'), false]]);
        expect(boxes[0]).toHaveFocus();
        expect(screen.getByText('After').closest('[aria-hidden="true"], [inert]')).not.toBeNull();
        await user.click(boxes[1]);
        expect(onVisibleSourceIdsChange.mock.calls).toEqual([[['work', 'home']]]);
        expect(within(sheet).getByRole('checkbox', {name: show('Home')})).not.toBeChecked();
        view.rerender(<><Calendar {...props} visibleSourceIds={['work', 'home']}/><button>After</button></>);
        expect(within(screen.getByRole('dialog')).getByRole('checkbox', {name: hide('Home')})).toBeChecked();
        await user.keyboard('{Escape}');
        expect(screen.queryByRole('dialog')).toBeNull(); await waitFor(() => expect(selector()).toHaveFocus());
        expect(screen.getByText('After').closest('[aria-hidden="true"], [inert]')).toBeNull(); expect(document.documentElement.style.overflow).toBe('');
    });
    it('R41: when fewer than two valid sources remain, the open sheet closes, the trigger disappears and focus recovers to the roving date cell', async () => {
        const user = userEvent.setup(), props = mobile();
        const view = render(<><Calendar {...props}/><button>After</button></>);
        await user.click(selector()); expect(screen.getByRole('dialog', {name: 'Calendars'})).toBeInTheDocument();
        view.rerender(<><Calendar {...props} sources={sources.slice(0, 1)} visibleSourceIds={['work']}/><button>After</button></>);
        expect(screen.queryByRole('dialog', {name: 'Calendars'})).toBeNull(); expect(screen.queryByRole('button', {name: 'Calendars'})).toBeNull();
        await waitFor(() => expect(cell()).toHaveFocus());
        expect(document.querySelectorAll('[inert], [aria-hidden="true"] [role=grid]')).toHaveLength(0); expect(document.documentElement.style.overflow).toBe('');
    });
    it('while the sheet is open, the Calendar announces only in the sheet endpoint (§12.4)', async () => {
        const user = userEvent.setup(), props = mobile({dataState: {status: 'loading', phase: 'refresh'}});
        const view = render(<Calendar {...props}/>);
        await user.click(selector());
        view.rerender(<Calendar {...props} dataState={{status: 'ready'}}/>);
        const sheet = screen.getByRole('dialog', {name: 'Calendars'}).closest('.nc-sheet')!;
        expect(within(sheet as HTMLElement).getByRole('status', {hidden: true})).toHaveTextContent('Calendar refreshed');
        const root = screen.getAllByRole('status', {hidden: true}).find(node => !sheet.contains(node))!;
        expect(root).toHaveTextContent('');
    });
});

describe('R39: source selector presentation switch', () => {
    const tree = (props: Props, extra?: ReactNode) => <StrictMode><Calendar {...props}/>{extra}<input aria-label="Notes"/></StrictMode>;
    it('a mobile sheet becomes desktop: the sheet closes, no menu opens, the visibility is unchanged and focus returns to the new trigger', async () => {
        const user = userEvent.setup(), onVisibleSourceIdsChange = vi.fn(), props = input({layout: 'mobile', visibleSourceIds: ['work'], onVisibleSourceIdsChange});
        const view = render(tree(props));
        await user.click(selector()); expect(screen.getByRole('dialog', {name: 'Calendars'})).toBeInTheDocument();
        view.rerender(tree({...props, layout: 'desktop'}));
        expect(screen.queryByRole('dialog')).toBeNull(); expect(screen.queryByRole('menu')).toBeNull();
        await waitFor(() => expect(selector()).toHaveFocus());
        expect(selector()).toHaveAttribute('aria-haspopup', 'menu'); expect(selector()).toHaveAttribute('aria-expanded', 'false');
        expect(document.querySelectorAll('[inert], .nc-backdrop')).toHaveLength(0); expect(document.documentElement.style.overflow).toBe('');
        expect(onVisibleSourceIdsChange).not.toHaveBeenCalled(); expect(count()).toContain('3 events');
    });
    it('a desktop menu becomes mobile: the menu closes, no sheet opens and focus returns to the trigger', async () => {
        const user = userEvent.setup(), props = input();
        const view = render(tree(props));
        await user.click(selector()); expect(screen.getByRole('menu')).toBeInTheDocument();
        view.rerender(tree({...props, layout: 'mobile'}));
        expect(screen.queryByRole('menu')).toBeNull(); expect(screen.queryByRole('dialog', {name: 'Calendars'})).toBeNull();
        await waitFor(() => expect(selector()).toHaveFocus()); expect(selector()).toHaveAttribute('aria-haspopup', 'dialog');
    });
    it('external focus is kept when the switch closes the selector', async () => {
        const user = userEvent.setup(), props = input();
        const view = render(tree(props));
        await user.click(selector());
        // Pointer focus outside closes the non-modal menu first; the switch then has nothing to restore.
        act(() => screen.getByRole('textbox', {name: 'Notes'}).focus());
        view.rerender(tree({...props, layout: 'mobile'}));
        expect(screen.getByRole('textbox', {name: 'Notes'})).toHaveFocus(); expect(screen.queryByRole('dialog')).toBeNull();
    });
});

// Spec v8 §12.3 (decision 1, 2026-10-22): after the standalone selector closes for any reason, focus that was inside it returns
// to its own toolbar trigger (WAI-ARIA menu button); the general order applies only without a focusable trigger, and an
// external focus is kept. Tab/Shift+Tab exit is a user move by §12.2 (see the keyboard tests above).
describe('spec v8: focus returns to the source selector trigger on every close path (§12.3)', () => {
    const frames = () => act(() => new Promise<void>(resolve => setTimeout(resolve, 50)));
    const surface = (layout: 'desktop' | 'mobile') => layout === 'desktop' ? screen.getByRole('menu', {name: 'Calendars'}) : screen.getByRole('dialog', {name: 'Calendars'});
    const closed = () => { expect(screen.queryByRole('menu')).toBeNull(); expect(screen.queryByRole('dialog')).toBeNull(); };
    async function opened(layout: 'desktop' | 'mobile', extra: ReactNode = null, overrides: Partial<Props> = {}) {
        const user = userEvent.setup(), props = input({layout, ...overrides}), tree = (more: Partial<Props> = {}) => <StrictMode>
            <p>Blank area</p><Calendar {...props} {...more}/><button>After</button>{extra}</StrictMode>;
        const view = render(tree());
        await user.click(selector());
        const owner = surface(layout);
        expect(within(owner).getAllByRole(layout === 'desktop' ? 'menuitemcheckbox' : 'checkbox')[0]).toHaveFocus();
        return {user, view, tree};
    }
    it.each(['desktop', 'mobile'] as const)('%s: Escape', async layout => {
        const {user} = await opened(layout);
        await user.keyboard('{Escape}'); closed(); await waitFor(() => expect(selector()).toHaveFocus());
    });
    it('desktop: a press on a blank area of the page (focus displaced to body)', async () => {
        const {user} = await opened('desktop');
        await user.click(screen.getByText('Blank area')); await frames();
        closed(); expect(selector()).toHaveFocus();
    });
    it('desktop: a press on an outside focusable control keeps that control focused', async () => {
        const {user} = await opened('desktop');
        await user.click(screen.getByRole('button', {name: 'After'})); await frames();
        closed(); expect(screen.getByRole('button', {name: 'After'})).toHaveFocus();
    });
    it('mobile: the close button and a backdrop press', async () => {
        const {user} = await opened('mobile');
        await user.click(within(surface('mobile')).getByRole('button', {name: 'Cancel'}));
        closed(); await waitFor(() => expect(selector()).toHaveFocus());
        await user.click(selector()); expect(surface('mobile')).toBeInTheDocument();
        await user.click(document.querySelector<HTMLElement>('.nc-backdrop')!);
        closed(); await waitFor(() => expect(selector()).toHaveFocus());
        expect(document.querySelectorAll('[inert], .nc-backdrop')).toHaveLength(0);
    });
    it.each(['desktop', 'mobile'] as const)('%s: a new portalContainer while open', async layout => {
        const {view, tree} = await opened(layout), host = document.body.appendChild(document.createElement('div'));
        view.rerender(tree({portalContainer: host}));
        closed(); await waitFor(() => expect(selector()).toHaveFocus());
        expect(document.querySelectorAll('[inert], .nc-backdrop')).toHaveLength(0); host.remove();
    });
    it('desktop: the default portal target changes while open (a host gains aria-modal by the attribute alone)', async () => {
        const user = userEvent.setup(), frame = document.body.appendChild(document.createElement('section')), mount = frame.appendChild(document.createElement('div'));
        frame.setAttribute('aria-label', 'Host');
        const view = render(<Calendar {...input()}/>, {container: mount});
        await user.click(selector()); expect(surface('desktop')).toBeInTheDocument();
        act(() => frame.setAttribute('aria-modal', 'true')); await frames();
        closed(); expect(selector()).toHaveFocus();
        view.unmount(); frame.remove();
    });
    it.each(['desktop', 'mobile'] as const)('%s: a change of the resolved layout returns focus to the trigger of the new presentation', async layout => {
        const {view, tree} = await opened(layout);
        view.rerender(tree({layout: layout === 'desktop' ? 'mobile' : 'desktop'}));
        closed(); await waitFor(() => expect(selector()).toHaveFocus());
    });
    it.each(['desktop', 'mobile'] as const)('%s: without a focusable trigger the general order applies (fewer than two sources: roving cell; blocking state: state region)', async layout => {
        const first = await opened(layout);
        first.view.rerender(first.tree({sources: sources.slice(0, 1), visibleSourceIds: ['work']}));
        closed(); await waitFor(() => expect(cell()).toHaveFocus());
        first.view.unmount();
        const second = await opened(layout);
        second.view.rerender(second.tree({dataState: {status: 'loading', phase: 'initial'}}));
        closed(); expect(selector()).toBeDisabled();
        await waitFor(() => expect(screen.getByRole('region', {name: 'Loading calendar'})).toHaveFocus());
    });
});

// Review 2026-10-09-1: findings of the spec-conformance audit for the standalone selector.
describe('blocking data state closes the source selector (§9, §12.3)', () => {
    const loading = {status: 'loading', phase: 'initial'} as const, failed = {status: 'error', phase: 'initial', error: new Error('down')} as const;
    it.each([
        ['desktop', loading, 'Loading calendar'], ['desktop', failed, 'Could not load calendar'],
        ['mobile', loading, 'Loading calendar'], ['mobile', failed, 'Could not load calendar'],
    ] as const)('%s, %o: the open selector closes in that commit, its trigger is disabled, focus moves to the state region; nothing reopens', async (layout, dataState, region) => {
        const user = userEvent.setup(), onVisibleSourceIdsChange = vi.fn(), props = input({layout, onVisibleSourceIdsChange});
        const tree = (overrides: Partial<Props> = {}) => <StrictMode><Calendar {...props} {...overrides}/><button>After</button></StrictMode>;
        const view = render(tree());
        await user.click(selector());
        const surface = screen.getByRole(layout === 'desktop' ? 'menu' : 'dialog', {name: 'Calendars'});
        expect(within(surface).getAllByRole(layout === 'desktop' ? 'menuitemcheckbox' : 'checkbox')[0]).toHaveFocus();
        view.rerender(tree({dataState}));
        expect(screen.queryByRole('menu')).toBeNull(); expect(screen.queryByRole('dialog')).toBeNull();
        expect(selector()).toBeDisabled(); expect(selector()).toHaveAttribute('aria-expanded', 'false');
        await waitFor(() => expect(screen.getByRole('region', {name: region})).toHaveFocus());
        expect(document.querySelectorAll('[inert], .nc-backdrop')).toHaveLength(0); expect(document.documentElement.style.overflow).toBe('');
        // A disabled trigger opens nothing, and no toggle can fire from a closed surface.
        await user.click(selector()); await user.keyboard(' ');
        expect(screen.queryByRole('menu')).toBeNull(); expect(screen.queryByRole('dialog')).toBeNull();
        view.rerender(tree({dataState: {status: 'ready'}}));
        expect(screen.queryByRole('menu')).toBeNull(); expect(screen.queryByRole('dialog')).toBeNull();
        expect(selector()).toBeEnabled(); expect(onVisibleSourceIdsChange).not.toHaveBeenCalled();
    });
    it('a refresh state keeps the open selector and its toggles (§9: non-blocking states keep UI state)', async () => {
        const user = userEvent.setup(), onVisibleSourceIdsChange = vi.fn(), props = input({onVisibleSourceIdsChange});
        const view = render(<Calendar {...props}/>);
        await user.click(selector());
        view.rerender(<Calendar {...props} dataState={{status: 'loading', phase: 'refresh'}}/>);
        expect(screen.getByRole('menu', {name: 'Calendars'})).toBeInTheDocument(); expect(selector()).toBeEnabled();
        await user.keyboard('{Enter}'); expect(onVisibleSourceIdsChange.mock.calls).toEqual([[['home', 'gym']]]);
    });
});

describe('source selector mount and hydration (§12.3, §12.5 StrictMode)', () => {
    it.each(['desktop', 'mobile'] as const)('mounting a %s Calendar with the selector in StrictMode never moves focus', layout => {
        render(<StrictMode><Calendar {...input({layout})}/></StrictMode>);
        expect(document.activeElement).toBe(document.body);
        expect(selector()).toHaveAttribute('aria-expanded', 'false');
    });
    it.each([false, true])('hydrating a server render in StrictMode never moves focus (an external control focused: %s)', async external => {
        const tree = <StrictMode><input aria-label="Search"/><Calendar {...input()}/></StrictMode>, container = document.createElement('div');
        container.innerHTML = renderToString(tree); document.body.append(container);
        const search = container.querySelector('input')!;
        if (external) search.focus();
        let root: ReturnType<typeof hydrateRoot> | undefined;
        await act(async () => { root = hydrateRoot(container, tree); });
        expect(document.activeElement).toBe(external ? search : document.body);
        act(() => root!.unmount()); container.remove();
    });
});

describe('portal container lifecycle (§10.3.4, §11.3)', () => {
    it('undefined and null are the same absent container: switching between them keeps the open agenda popover and source menu', async () => {
        const user = userEvent.setup(), props = input();
        const view = render(<Calendar {...props}/>);
        act(() => cell().focus()); await user.keyboard('{Enter}');
        const agenda = screen.getByRole('dialog', {name: /Events for/});
        view.rerender(<Calendar {...props} portalContainer={null}/>); view.rerender(<Calendar {...props} portalContainer={undefined}/>);
        expect(screen.getByRole('dialog', {name: /Events for/})).toBe(agenda);
        await user.click(selector()); await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
        const menu = screen.getByRole('menu', {name: 'Calendars'});
        view.rerender(<Calendar {...props} portalContainer={null}/>); view.rerender(<Calendar {...props}/>);
        expect(screen.getByRole('menu', {name: 'Calendars'})).toBe(menu);
        // An explicit container is a real identity change: it closes the menu (R53).
        const host = document.body.appendChild(document.createElement('div'));
        view.rerender(<Calendar {...props} portalContainer={host}/>);
        await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
        host.remove();
    });
    it('observes the document only while a package overlay is open', async () => {
        const Native = window.MutationObserver, watching = new Set<MutationObserver>();
        class Tracked extends Native {
            observe(target: Node, options?: MutationObserverInit) { if (options?.attributeFilter?.join() === 'aria-modal,open') watching.add(this); super.observe(target, options); }
            disconnect() { watching.delete(this); super.disconnect(); }
        }
        vi.stubGlobal('MutationObserver', Tracked);
        try {
            const user = userEvent.setup(), view = render(<StrictMode><Calendar {...input({layout: 'mobile'})}/></StrictMode>);
            expect(watching.size).toBe(0);
            for (let index = 0; index < 5; index++) document.body.append(document.createElement('span'));
            await user.click(selector()); expect(watching.size).toBe(1);
            await user.keyboard('{Escape}'); await waitFor(() => expect(selector()).toHaveFocus()); expect(watching.size).toBe(0);
            // A child of the inline agenda (the item action sheet) is a package overlay too.
            await user.click(screen.getAllByRole('button', {name: `Actions for ${isolated('Report')}`})[0]); expect(watching.size).toBe(1);
            await user.keyboard('{Escape}'); await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull()); expect(watching.size).toBe(0);
            view.rerender(<StrictMode><Calendar {...input()}/></StrictMode>);
            act(() => cell().focus()); await user.keyboard('{Enter}'); expect(watching.size).toBe(1);
            await user.keyboard('{Escape}'); expect(watching.size).toBe(0);
            view.unmount(); expect(watching.size).toBe(0);
        } finally { vi.unstubAllGlobals(); }
    });
    it.each(['desktop', 'mobile'] as const)('a closed %s Calendar without aria-labelledby keeps no MutationObserver at all (§11.3)', async layout => {
        const Native = window.MutationObserver, live = new Set<MutationObserver>();
        class Tracked extends Native {
            observe(target: Node, options?: MutationObserverInit) { live.add(this); super.observe(target, options); }
            disconnect() { live.delete(this); super.disconnect(); }
        }
        vi.stubGlobal('MutationObserver', Tracked);
        try {
            const label = document.body.appendChild(document.createElement('h2'));
            label.id = 'calendar-title'; label.textContent = 'Team calendar';
            const view = render(<StrictMode><Calendar {...input({layout})}/></StrictMode>);
            for (let index = 0; index < 5; index++) document.body.append(document.createElement('span'));
            expect(live.size).toBe(0);
            view.rerender(<StrictMode><Calendar {...input({layout})} aria-labelledby="  "/></StrictMode>); expect(live.size).toBe(0);
            // A reference is validated against the live tree: exactly its one name observer.
            view.rerender(<StrictMode><Calendar {...input({layout})} aria-labelledby="calendar-title"/></StrictMode>); expect(live.size).toBe(1);
            expect(screen.getByRole('region', {name: 'Team calendar'})).toBeInTheDocument();
            view.rerender(<StrictMode><Calendar {...input({layout})}/></StrictMode>); expect(live.size).toBe(0);
            view.unmount(); label.remove(); expect(live.size).toBe(0);
        } finally { vi.unstubAllGlobals(); }
    });
    it('a host dialog opened around an inline agenda since mount receives the item action sheet (QA-03, without an observer)', async () => {
        const user = userEvent.setup(), dialog = document.body.appendChild(document.createElement('div'));
        render(<Calendar {...input({layout: 'mobile'})}/>, {container: dialog});
        dialog.setAttribute('role', 'dialog'); dialog.setAttribute('aria-modal', 'true');
        await user.click(screen.getAllByRole('button', {name: `Actions for ${isolated('Report')}`})[0]);
        const sheet = screen.getByRole('dialog', {name: 'Actions for Report'});
        expect(dialog.contains(sheet)).toBe(true);
        dialog.remove();
    });
});

describe('default portal target of a passive switch (§10.3.4, §11.3, review 2026-10-09-1 fix 2)', () => {
    // A host dialog becomes modal around the Calendar after mount; nothing package-owned is open, so no observer saw it.
    // A passive switch with focus inside the inline agenda then opens an overlay without any user activation.
    const presentations = [['popover', {layout: 'desktop'}], ['sheet', {agendaPresentation: 'overlay'}]] as const;
    it.each(presentations)('inline → %s opens inside the host that became modal since mount and keeps focus on the same control', async (presentation, change) => {
        const host = document.body.appendChild(document.createElement('div')), props = input({layout: 'mobile'});
        const view = render(<StrictMode><Calendar {...props}/></StrictMode>, {container: host});
        host.setAttribute('role', 'dialog'); host.setAttribute('aria-modal', 'true');
        const control = within(screen.getByRole('region', {name: /Events for/})).getByRole('button', {name: `Actions for ${isolated('Report')}`});
        act(() => control.focus());
        view.rerender(<StrictMode><Calendar {...props} {...change}/></StrictMode>);
        await waitFor(() => expect(document.activeElement).toHaveAccessibleName(`Actions for ${isolated('Report')}`));
        const agenda = document.querySelector<HTMLElement>(`section[data-presentation="${presentation}"]`)!;
        expect(agenda).not.toBeNull(); expect(host.contains(agenda)).toBe(true);
        expect(agenda.contains(document.activeElement)).toBe(true); expect(document.activeElement).not.toBe(control);
        expect(document.querySelectorAll('section[data-presentation]')).toHaveLength(1);
        view.unmount(); host.remove();
    });
    it('the host becoming modal while focus is already inside the inline agenda is found as well', async () => {
        const host = document.body.appendChild(document.createElement('div')), props = input({layout: 'mobile'});
        const view = render(<Calendar {...props}/>, {container: host});
        act(() => within(screen.getByRole('region', {name: /Events for/})).getByRole('button', {name: `Actions for ${isolated('Report')}`}).focus());
        host.setAttribute('role', 'dialog'); host.setAttribute('aria-modal', 'true');
        view.rerender(<Calendar {...props} layout="desktop"/>);
        await waitFor(() => expect(document.activeElement).toHaveAccessibleName(`Actions for ${isolated('Report')}`));
        expect(host.contains(screen.getByRole('dialog', {name: /Events for/}))).toBe(true);
        view.unmount(); host.remove();
    });
});

describe('live endpoints of the source and item action sheets (§12.4)', () => {
    it('are descendants of the aria-modal dialog element and receive the Calendar output while it is open', async () => {
        const user = userEvent.setup(), props = input({layout: 'mobile', dataState: {status: 'loading', phase: 'refresh'}});
        const view = render(<Calendar {...props}/>);
        const endpoints = (dialog: HTMLElement) => [...dialog.closest('.nc-sheet')!.querySelectorAll('[role=status], [role=alert]')];
        await user.click(selector());
        const sources = screen.getByRole('dialog', {name: 'Calendars'});
        expect(endpoints(sources)).toHaveLength(2); expect(endpoints(sources).every(node => sources.contains(node))).toBe(true);
        view.rerender(<Calendar {...props} dataState={{status: 'ready'}}/>);
        expect(within(sources).getByRole('status', {hidden: true})).toHaveTextContent('Calendar refreshed');
        await user.keyboard('{Escape}');
        await user.click(screen.getAllByRole('button', {name: `Actions for ${isolated('Report')}`})[0]);
        const actions = screen.getByRole('dialog', {name: 'Actions for Report'});
        expect(endpoints(actions)).toHaveLength(2); expect(endpoints(actions).every(node => actions.contains(node))).toBe(true);
        view.rerender(<Calendar {...props} dataState={{status: 'error', phase: 'refresh', error: new Error('down')}}/>);
        expect(within(actions).getByRole('alert', {hidden: true})).toHaveTextContent('Could not load calendar');
    });
});
