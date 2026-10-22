import {Children, StrictMode, cloneElement, isValidElement, type ReactNode} from 'react';
import {act, render, screen, waitFor, within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import type {CalendarProps} from '../../reference.js';
import {CalendarMonth} from '../CalendarMonth.js';
import {ActionsPresentationContext, ItemActionsContent} from '../overlays.js';
import {mirroredFontProperties, mirroredVariables} from '../../primitives/mirror.js';

// T16: overlay ownership tree, portal scope and live routing (R37, R42, R48, R52, R53). Since T17 the child menus are the
// public item actions (getItemActions/onItemActionRequest); a private seam only forces the presentation that the layout
// would choose, so a menu inside an inline or sheet agenda stays testable.
const items = [{id: 'a', title: 'Alpha', data: {}, interval: {kind: 'allDay' as const, start: '2026-03-01', end: '2026-03-10'}},
    {id: 'b', title: 'Beta', data: {}, interval: {kind: 'timed' as const, start: '2026-03-04T10:00:00Z'}}];
const input = (): CalendarProps => ({items, anchorDate: '2026-03-01', today: '2026-03-04', timeZone: 'UTC', locale: 'en-US', layout: 'desktop', onNavigate() {}, onItemPress() {}});
const sheetInput = (): CalendarProps => ({...input(), layout: 'mobile', agendaPresentation: 'overlay'});
const actions = [{id: 'open', label: 'Open'}, {id: 'share', label: 'Share'}];
const titles: Record<string, string> = {a: 'Alpha', b: 'Beta'};
type Menus = {presentation: 'menu' | 'sheet'; props: Pick<CalendarProps, 'getItemActions' | 'onItemActionRequest'>};
const menus = (modal = false, onAction = vi.fn()): Menus => ({presentation: modal ? 'sheet' : 'menu',
    props: {getItemActions: () => actions, onItemActionRequest: ({actionId}) => onAction(actionId)} as Menus['props']});
/** The public action pair on every CalendarMonth of the tree. */
const withActions = (node: ReactNode, spec: Menus): ReactNode => !isValidElement<{children?: ReactNode}>(node) ? node : node.type === CalendarMonth ? cloneElement(node, spec.props)
    : cloneElement(node, undefined, ...Children.toArray(node.props.children).map(child => withActions(child, spec)));
const withMenus = (node: ReactNode, spec = menus()) => <ActionsPresentationContext.Provider value={spec.presentation}>{withActions(node, spec)}</ActionsPresentationContext.Provider>;
const cell = (date = '2026-03-04') => screen.getAllByRole('gridcell', {hidden: true}).find(node => node.dataset.date === date)!;
// Package labels isolate user text with FSI/PDI (§12.4, T08).
const actionsFor = (title: string) => `Actions for \u2068${title}\u2069`;
const trigger = (item: string) => screen.getByRole('button', {name: actionsFor(titles[item]), hidden: true});
const hiddenOutside = () => document.querySelectorAll('[aria-hidden="true"] [role=grid], [inert]').length + document.querySelectorAll('.nc-backdrop[aria-hidden="true"]').length;
const focused = () => ({item: document.activeElement?.closest<HTMLElement>('[data-item-id]')?.dataset.itemId, control: (document.activeElement as HTMLElement | null)?.dataset.agendaControl,
    date: (document.activeElement as HTMLElement | null)?.dataset.date, role: document.activeElement?.getAttribute('role'), tag: document.activeElement?.tagName,
    presentation: document.activeElement?.closest<HTMLElement>('[data-presentation]')?.dataset.presentation});
async function open(user: ReturnType<typeof userEvent.setup>, date = '2026-03-04') { act(() => cell(date).focus()); await user.keyboard('{Enter}'); }
async function openMenu(user: ReturnType<typeof userEvent.setup>, item = 'b') { act(() => trigger(item).focus()); await user.keyboard('{Enter}'); }
let warn: ReturnType<typeof vi.spyOn>;
beforeEach(() => { warn = vi.spyOn(console, 'warn').mockImplementation(() => {}); });
afterEach(() => { warn.mockRestore(); });

describe('nested overlay stack (§12.2, §12.3, R37)', () => {
    it('a child menu opens inside the agenda, owns its name and IDREF, and Escape closes only the top overlay', async () => {
        const user = userEvent.setup(); render(<StrictMode>{withMenus(<CalendarMonth {...input()}/>)}</StrictMode>);
        await open(user); expect(trigger('b')).toHaveAttribute('aria-haspopup', 'menu'); expect(trigger('b')).toHaveAttribute('aria-expanded', 'false');
        await openMenu(user);
        const menu = screen.getByRole('menu', {name: actionsFor('Beta')});
        expect(within(menu).getAllByRole('menuitem')[0]).toHaveFocus(); expect(trigger('b')).toHaveAttribute('aria-expanded', 'true');
        expect(trigger('b')).toHaveAttribute('aria-controls', menu.id); expect(screen.getByRole('dialog').contains(menu)).toBe(false);
        await user.keyboard('{Escape}');
        expect(screen.queryByRole('menu')).toBeNull(); expect(trigger('b')).toHaveFocus(); expect(screen.getByRole('dialog')).toBeInTheDocument();
        expect(trigger('b')).not.toHaveAttribute('aria-controls');
        await user.keyboard('{Escape}'); expect(screen.queryByRole('dialog')).toBeNull(); expect(cell()).toHaveFocus();
    });
    it('R37: with its trigger removed, the first Escape stays inside the open agenda; the second closes it to the date cell', async () => {
        const user = userEvent.setup(), props = input(); const view = render(<StrictMode>{withMenus(<CalendarMonth {...props}/>)}</StrictMode>);
        await open(user); await openMenu(user);
        view.rerender(<StrictMode>{withMenus(<CalendarMonth {...props} items={[items[0]]}/>)}</StrictMode>);
        // The menu is owned by the stack, not by the removed row: it stays open until Escape.
        expect(screen.getByRole('menu', {name: actionsFor('Beta')})).toBeInTheDocument();
        await user.keyboard('{Escape}');
        expect(screen.queryByRole('menu')).toBeNull(); expect(screen.getByRole('dialog')).toBeInTheDocument();
        // The nearest control after the trigger's former position is gone, so the last one before it wins.
        expect(focused()).toMatchObject({item: 'a', control: 'actions'});
        await user.keyboard('{Escape}'); expect(screen.queryByRole('dialog')).toBeNull(); expect(cell()).toHaveFocus();
    });
    it('falls back to the agenda heading, never outside the parent, when no control remains', async () => {
        const user = userEvent.setup(), props = {...input(), onItemPress: undefined}; const view = render(withMenus(<CalendarMonth {...props} items={[items[1]]}/>));
        await open(user); await openMenu(user);
        view.rerender(withMenus(<CalendarMonth {...props} items={[]}/>));
        // The close control is the only remaining control and precedes the trigger.
        await user.keyboard('{Escape}'); expect(screen.getByRole('button', {name: 'Close day agenda'})).toHaveFocus();
        expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    it('pressing the trigger of the open menu toggles it closed, without reopening; focus stays on the trigger', async () => {
        const user = userEvent.setup(); render(withMenus(<CalendarMonth {...input()}/>));
        await open(user); await user.click(trigger('b')); expect(screen.getByRole('menu')).toBeInTheDocument();
        await user.click(trigger('b'));
        await waitFor(() => expect(screen.queryByRole('menu')).toBeNull()); expect(trigger('b')).toHaveFocus();
        await act(async () => { await new Promise(requestAnimationFrame); }); expect(screen.queryByRole('menu')).toBeNull();
        // Another trigger replaces the open menu (one child per parent).
        await user.click(trigger('b')); await user.click(trigger('a'));
        expect(screen.getAllByRole('menu')).toHaveLength(1); expect(screen.getByRole('menu')).toHaveAccessibleName(actionsFor('Alpha'));
    });
    it('a menu action closes the menu and returns focus to its trigger', async () => {
        const user = userEvent.setup(), onAction = vi.fn(); render(withMenus(<CalendarMonth {...input()}/>, menus(false, onAction)));
        await open(user); await openMenu(user, 'a'); await user.keyboard('{ArrowDown}{Enter}');
        expect(onAction).toHaveBeenCalledWith('share'); expect(screen.queryByRole('menu')).toBeNull(); expect(trigger('a')).toHaveFocus();
    });
    it('Tab and Shift+Tab leave the menu to the logical neighbors of its trigger inside the agenda', async () => {
        const user = userEvent.setup(); render(<>{withMenus(<CalendarMonth {...input()}/>)}<button>After</button></>);
        await open(user); await openMenu(user, 'a'); await user.tab();
        expect(screen.queryByRole('menu')).toBeNull(); expect(focused()).toMatchObject({item: 'b', control: 'primary'});
        await openMenu(user, 'a'); await user.tab({shift: true}); expect(focused()).toMatchObject({item: 'a', control: 'primary'});
        // The last trigger has no next control in the agenda: the agenda's own logical exit continues after the date.
        await openMenu(user, 'b'); await user.tab();
        expect(screen.getByRole('button', {name: 'After'})).toHaveFocus(); expect(screen.queryByRole('dialog')).toBeNull(); expect(screen.queryByRole('menu')).toBeNull();
    });
    it('unmounting the calendar with an open child stack never focuses programmatically and leaves no portal', async () => {
        const user = userEvent.setup(); const view = render(withMenus(<CalendarMonth {...sheetInput()}/>, menus(true)));
        await user.click(cell()); await openMenu(user);
        const focus = vi.spyOn(HTMLElement.prototype, 'focus'); focus.mockClear(); view.unmount();
        expect(focus).not.toHaveBeenCalled(); focus.mockRestore();
        expect(document.querySelectorAll('.nc-theme, [inert], [aria-hidden="true"]')).toHaveLength(0); expect(document.documentElement.style.overflow).toBe('');
    });
    it('with its trigger removed, Shift+Tab leaves the menu to the control before the former trigger position', async () => {
        const user = userEvent.setup(), props = input(); const view = render(withMenus(<CalendarMonth {...props}/>));
        await open(user); await openMenu(user);
        view.rerender(withMenus(<CalendarMonth {...props} items={[items[0]]}/>));
        await user.tab({shift: true});
        expect(screen.queryByRole('menu')).toBeNull(); expect(focused()).toMatchObject({item: 'a', control: 'actions'}); expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    it('an outside press inside the agenda closes only the menu; an external focus closes the stack without stealing focus', async () => {
        const user = userEvent.setup(); render(<>{withMenus(<CalendarMonth {...input()}/>)}<input aria-label="Notes"/></>);
        await open(user); await openMenu(user);
        await user.click(screen.getByRole('heading', {level: 3}));
        await waitFor(() => expect(screen.queryByRole('menu')).toBeNull()); expect(screen.getByRole('dialog')).toBeInTheDocument();
        await openMenu(user); const notes = screen.getByRole('textbox', {name: 'Notes'}); act(() => notes.focus());
        expect(screen.queryByRole('menu')).toBeNull(); expect(screen.queryByRole('dialog')).toBeNull(); expect(notes).toHaveFocus();
    });
    it('a presentation switch with focus in the child closes it top-down and keeps its logical trigger (R38 child part)', async () => {
        const user = userEvent.setup(), props: CalendarProps = {...input(), agendaDate: '2026-03-04', onAgendaDateChange: vi.fn()};
        const view = render(withMenus(<CalendarMonth {...props}/>)); await open(user); await openMenu(user);
        view.rerender(withMenus(<CalendarMonth {...props} layout="mobile" agendaPresentation="overlay"/>));

        expect(screen.queryByRole('menu')).toBeNull(); expect(screen.getByRole('dialog')).toHaveAttribute('data-presentation', 'sheet');
        expect(focused()).toMatchObject({item: 'b', control: 'actions', presentation: 'sheet'});
        expect(props.onAgendaDateChange).not.toHaveBeenCalled();
    });
    it('a modal child inside the sheet is reference-counted: closing it keeps the sheet modal, closing the sheet clears everything', async () => {
        const user = userEvent.setup(); render(<StrictMode>{withMenus(<><CalendarMonth {...sheetInput()}/><button>After</button></>, menus(true))}</StrictMode>);
        await user.click(cell()); await openMenu(user);
        const child = screen.getByRole('dialog', {name: 'Actions for Beta'});
        expect(child).toHaveAttribute('aria-modal', 'true'); expect(screen.getByRole('button', {name: 'Open'})).toHaveFocus();
        expect(trigger('b')).toHaveAttribute('aria-haspopup', 'dialog');
        // jsdom has no `inert`: React Aria falls back to aria-hidden for the sheet under the child and the page.
        expect(screen.getByText('After').closest('[aria-hidden="true"], [inert]')).not.toBeNull();
        expect(document.querySelector('.nc-sheet-backdrop')?.closest('[aria-hidden="true"], [inert]')).not.toBeNull();
        await user.keyboard('{Escape}');
        expect(screen.queryByRole('dialog', {name: 'Actions for Beta'})).toBeNull(); expect(trigger('b')).toHaveFocus();
        expect(document.querySelector('.nc-sheet-backdrop')?.closest('[aria-hidden="true"], [inert]')).toBeNull();
        expect(screen.getByText('After').closest('[aria-hidden="true"], [inert]')).not.toBeNull();
        await user.keyboard('{Escape}');
        expect(screen.queryAllByRole('dialog')).toHaveLength(0); expect(cell()).toHaveFocus(); expect(hiddenOutside()).toBe(0);
        expect(document.querySelectorAll('.nc-backdrop')).toHaveLength(0);
    });
    it('a modal action sheet without an enabled action focuses its close control (§12.2)', async () => {
        // A public set never opens empty (its trigger is absent, R41); the content still owns the §12.2 fallback.
        const label = {text: 'Actions for Beta', lang: 'en-US', dir: 'ltr' as const, fragments: [{text: 'Actions for Beta', lang: 'en-US', dir: 'ltr' as const, kind: 'message' as const}]};
        render(<ItemActionsContent domId="sheet" modal label={label} closeLabel={{...label, text: 'Cancel'}} actions={[]} onAction={() => {}} onClose={() => {}}/>);
        const child = screen.getByRole('dialog', {name: 'Actions for Beta'});
        expect(within(child).getByRole('button', {name: 'Cancel'})).toHaveFocus();
        expect(within(child).getByRole('heading')).not.toHaveFocus();
    });
    it('a modal child of the inline agenda recovers inside the inline region after its trigger disappears', async () => {
        const user = userEvent.setup(), props = {...input(), layout: 'mobile' as const}; const view = render(withMenus(<CalendarMonth {...props}/>, menus(true)));
        await openMenu(user); expect(screen.getByRole('dialog', {name: 'Actions for Beta'})).toBeInTheDocument();
        view.rerender(withMenus(<CalendarMonth {...props} items={[items[0]]}/>, menus(true)));
        await user.keyboard('{Escape}');
        expect(screen.queryAllByRole('dialog')).toHaveLength(0); expect(focused()).toMatchObject({item: 'a', control: 'actions', presentation: 'inline'});
        expect(hiddenOutside()).toBe(0);
    });
});

describe('portalContainer scope (§10.3.4, R53)', () => {
    const containers = () => { const a = document.createElement('div'), b = document.createElement('div'); a.id = 'A'; b.id = 'B'; document.body.append(a, b); return {a, b}; };
    afterEach(() => { document.getElementById('A')?.remove(); document.getElementById('B')?.remove(); });
    it.each(['popover', 'sheet'] as const)('A → B → null closes the open %s stack top-down, recovers focus and never reopens; the next activation uses the new target', async kind => {
        const user = userEvent.setup(), {a, b} = containers(), base = {...(kind === 'sheet' ? sheetInput() : input())};
        const tree = (portalContainer: Element | null) => withMenus(<CalendarMonth {...base} portalContainer={portalContainer}/>, menus(kind === 'sheet'));
        const view = render(<StrictMode>{tree(a)}</StrictMode>);
        await open(user); expect(a.querySelector('[data-presentation]')).not.toBeNull(); await openMenu(user);
        expect(a.querySelectorAll('.nc-theme')).toHaveLength(2);
        view.rerender(<StrictMode>{tree(b)}</StrictMode>);
        expect(screen.queryAllByRole('dialog')).toHaveLength(0); expect(screen.queryByRole('menu')).toBeNull(); expect(cell()).toHaveFocus();
        expect(a.childNodes).toHaveLength(0); expect(b.childNodes).toHaveLength(0); expect(hiddenOutside()).toBe(0);
        await open(user); expect(b.querySelector('[data-presentation]')).not.toBeNull();
        view.rerender(<StrictMode>{tree(null)}</StrictMode>);
        expect(screen.queryAllByRole('dialog')).toHaveLength(0); expect(cell()).toHaveFocus(); expect(b.childNodes).toHaveLength(0);
        await open(user); const agenda = document.querySelector('[data-presentation]')!;
        expect(a.contains(agenda) || b.contains(agenda)).toBe(false); expect(agenda.closest('.nc-calendar')).toBeNull();
        // The same accepted identity changes nothing.
        view.rerender(<StrictMode>{tree(null)}</StrictMode>); expect(document.querySelector('[data-presentation]')).toBe(agenda);
        expect(warn).not.toHaveBeenCalled();
    });
    it('removing the active container closes the stack and recovers focus; the next activation uses the default body', async () => {
        const user = userEvent.setup(), {a} = containers(); render(withMenus(<CalendarMonth {...input()} portalContainer={a}/>));
        await open(user); await openMenu(user);
        await act(async () => { a.remove(); await Promise.resolve(); });
        expect(screen.queryAllByRole('dialog')).toHaveLength(0); expect(screen.queryByRole('menu')).toBeNull(); expect(cell()).toHaveFocus();
        await open(user); expect(screen.getByRole('dialog').closest('.nc-theme')?.parentElement?.parentElement).toBe(document.body);
        expect(warn.mock.calls.map(([message]) => String(message))).toEqual(['[@nelmad/calendar] portalContainer: Detached container; using the default container']);
    });
    it('an initial detached or cross-document container uses the owner body with one development warning; nothing mounts in the other document', async () => {
        const user = userEvent.setup(), frame = document.createElement('iframe'); document.body.append(frame);
        const foreign = frame.contentDocument!.body, detached = document.createElement('div');
        try {
            const view = render(<CalendarMonth {...input()} portalContainer={foreign}/>); await open(user);
            expect(foreign.childNodes).toHaveLength(0); expect(document.body.contains(screen.getByRole('dialog'))).toBe(true);
            await user.keyboard('{Escape}'); view.unmount();
            render(<CalendarMonth {...input()} portalContainer={detached}/>); await open(user);
            expect(detached.childNodes).toHaveLength(0); expect(document.body.contains(screen.getByRole('dialog'))).toBe(true);
            expect(warn.mock.calls.map(([message]) => String(message))).toEqual([
                "[@nelmad/calendar] portalContainer: Container belongs to another document; using the calendar's document body",
                '[@nelmad/calendar] portalContainer: Detached container; using the default container']);
        } finally { frame.remove(); }
    });
    it('a ShadowRoot container receives one package host; aria-controls exists only for same-tree endpoints (R42)', async () => {
        const user = userEvent.setup(), host = document.createElement('div'); host.id = 'A'; document.body.append(host);
        const shadow = host.attachShadow({mode: 'open'});
        const view = render(withMenus(<CalendarMonth {...input()} portalContainer={shadow}/>));
        await open(user);
        const dialog = shadow.querySelector<HTMLElement>('[role=dialog]')!;
        expect(dialog).not.toBeNull(); expect(shadow.children).toHaveLength(1); expect(dialog).toHaveAccessibleName('Events for Mar 4, 2026');
        expect(cell()).toHaveAttribute('aria-expanded', 'true'); expect(cell()).not.toHaveAttribute('aria-controls');
        // Menu and agenda share the portal tree scope: that IDREF is valid.
        act(() => shadow.querySelector<HTMLElement>(`[aria-label="${actionsFor('Beta')}"]`)!.focus()); await user.keyboard('{Enter}');
        const menu = shadow.querySelector<HTMLElement>('[role=menu]')!;
        expect(menu).toHaveAttribute('aria-label', actionsFor('Beta')); expect(shadow.querySelector(`[aria-label="${actionsFor('Beta')}"]`)).toHaveAttribute('aria-controls', menu.id);
        view.rerender(withMenus(<CalendarMonth {...input()} portalContainer={null}/>));
        expect(shadow.querySelector('[role=dialog]')).toBeNull(); expect(cell()).not.toHaveAttribute('aria-controls');
        await open(user); expect(cell()).toHaveAttribute('aria-controls', screen.getByRole('dialog').id);
    });
});

describe('live routing (§12.4, R48)', () => {
    const live = () => [...document.querySelectorAll<HTMLElement>('[role=status], [role=alert]')];
    it('while a sheet is open the owner writes only to its modal endpoint; the other calendar stays silent; closing returns to root', async () => {
        const user = userEvent.setup(), first = {...sheetInput(), id: 'first'}, second = {...sheetInput(), id: 'second'};
        const tree = (state?: CalendarProps['dataState']) => <><CalendarMonth {...first} dataState={state}/><CalendarMonth {...second}/></>;
        const view = render(<StrictMode>{tree()}</StrictMode>);
        const [firstRoot, secondRoot] = ['first', 'second'].map(id => document.getElementById(id)!);
        await user.click(within(firstRoot).getAllByRole('gridcell').find(node => node.dataset.date === '2026-03-04')!);
        const sheet = screen.getByRole('dialog'), mutations: string[] = [];
        // Each record keeps the text it added: one child-list mutation per payload (§12.4).
        const observer = new MutationObserver(records => { for (const record of records) mutations.push(`${(record.target as HTMLElement).closest('[role=dialog]') ? 'sheet' : (record.target as HTMLElement).closest('.nc-calendar')!.id}:${[...record.addedNodes].map(node => node.textContent).join('')}`); });
        for (const node of live()) observer.observe(node, {childList: true, subtree: true, characterData: true});
        // A refresh start writes nothing (QA-D-3-03); its completion is the routed event.
        view.rerender(<StrictMode>{tree({status: 'loading', phase: 'refresh'})}</StrictMode>);
        view.rerender(<StrictMode>{tree({status: 'ready'})}</StrictMode>);
        await act(async () => { await Promise.resolve(); });
        expect(mutations).toEqual(['sheet:Calendar refreshed']);
        expect(within(sheet).getByRole('status')).toHaveTextContent('Calendar refreshed');
        for (const root of [firstRoot, secondRoot]) for (const node of root.querySelectorAll('[role=status], [role=alert]')) expect(node).toBeEmptyDOMElement();
        mutations.length = 0; await user.keyboard('{Escape}'); await act(async () => { await Promise.resolve(); });
        expect(mutations).toEqual([]); expect(hiddenOutside()).toBe(0);
        view.rerender(<StrictMode>{tree({status: 'loading', phase: 'refresh'})}</StrictMode>);
        view.rerender(<StrictMode>{tree({status: 'ready'})}</StrictMode>); await act(async () => { await Promise.resolve(); });
        expect(mutations).toEqual(['first:Calendar refreshed']);
        observer.disconnect();
    });
    it('the other calendar writes nothing into its inert background during the modal, and no stale text remains after it closes', async () => {
        const user = userEvent.setup(), first = {...sheetInput(), id: 'first'}, second = {...sheetInput(), id: 'second'};
        const tree = (state?: CalendarProps['dataState']) => <><CalendarMonth {...first}/><CalendarMonth {...second} dataState={state}/></>;
        const view = render(<StrictMode>{tree()}</StrictMode>);
        const [firstRoot, secondRoot] = ['first', 'second'].map(id => document.getElementById(id)!), mutations: string[] = [];
        await user.click(within(firstRoot).getAllByRole('gridcell').find(node => node.dataset.date === '2026-03-04')!);
        expect(secondRoot.closest('[aria-hidden="true"], [inert]')).not.toBeNull();
        const observer = new MutationObserver(records => { for (const record of records) mutations.push([...record.addedNodes].map(node => node.textContent).join('')); });
        for (const node of live()) observer.observe(node, {childList: true, subtree: true, characterData: true});
        view.rerender(<StrictMode>{tree({status: 'loading', phase: 'refresh'})}</StrictMode>);
        view.rerender(<StrictMode>{tree({status: 'error', phase: 'refresh', error: new Error('down')})}</StrictMode>);
        await act(async () => { await Promise.resolve(); });
        expect(mutations.filter(Boolean)).toEqual([]); expect(within(screen.getByRole('dialog')).getByRole('status')).toBeEmptyDOMElement();
        await user.keyboard('{Escape}'); await act(async () => { await Promise.resolve(); });
        expect(hiddenOutside()).toBe(0);
        for (const node of secondRoot.querySelectorAll('[role=status], [role=alert]')) expect(node).toBeEmptyDOMElement();
        // Once the background is no longer inert the instance announces its own transitions again.
        view.rerender(<StrictMode>{tree({status: 'loading', phase: 'refresh'})}</StrictMode>);
        view.rerender(<StrictMode>{tree({status: 'ready'})}</StrictMode>); await act(async () => { await Promise.resolve(); });
        expect(within(secondRoot).getByRole('status')).toHaveTextContent('Calendar refreshed');
        observer.disconnect();
    });
    it('opening a nested modal child clears the parent sheet endpoint, so no stale text remains there after the child closes', async () => {
        const user = userEvent.setup(), props = sheetInput();
        const tree = (state?: CalendarProps['dataState']) => withMenus(<CalendarMonth {...props} dataState={state}/>, menus(true));
        const view = render(tree()); await user.click(cell());
        const sheet = screen.getByRole('dialog', {name: /Events for/}), status = () => within(sheet).getAllByRole('status', {hidden: true})[0];
        view.rerender(tree({status: 'loading', phase: 'refresh'})); expect(status()).toBeEmptyDOMElement();
        view.rerender(tree({status: 'ready'})); expect(status()).toHaveTextContent('Calendar refreshed');
        view.rerender(tree({status: 'loading', phase: 'refresh'}));
        await openMenu(user);
        expect(status()).toBeEmptyDOMElement(); expect(live().filter(node => node.textContent)).toEqual([]);
        await user.keyboard('{Escape}');
        expect(screen.queryByRole('dialog', {name: 'Actions for Beta'})).toBeNull(); expect(sheet.closest('[inert], [aria-hidden="true"]')).toBeNull();
        expect(status()).toBeEmptyDOMElement(); expect(live().filter(node => node.textContent)).toEqual([]);
        // The parent sheet is the endpoint again for the next transition.
        view.rerender(tree({status: 'ready'})); expect(status()).toHaveTextContent('Calendar refreshed');
    });
    it('a nested modal child becomes the single endpoint; a blocking error closes the stack and focuses the error region silently', async () => {
        const user = userEvent.setup(), props = sheetInput();
        const tree = (state?: CalendarProps['dataState']) => withMenus(<CalendarMonth {...props} dataState={state}/>, menus(true));
        const view = render(tree()); await user.click(cell()); await openMenu(user);
        const child = screen.getByRole('dialog', {name: 'Actions for Beta'}).closest<HTMLElement>('.nc-sheet')!;
        view.rerender(tree({status: 'loading', phase: 'refresh'})); view.rerender(tree({status: 'ready'}));
        expect(within(child).getByRole('status')).toHaveTextContent('Calendar refreshed');
        expect(live().filter(node => node.textContent)).toHaveLength(1);
        view.rerender(tree({status: 'error', phase: 'refresh', error: new Error('down')}));
        expect(within(child).getByRole('alert')).toHaveTextContent('Could not load calendar');
        expect(live().filter(node => node.textContent).map(node => node.getAttribute('role'))).toEqual(['alert']);
        // Moving focus to the visible blocking region replaces the announcement of this transition (§12.4).
        view.rerender(tree({status: 'error', phase: 'initial', error: new Error('down')}));
        expect(screen.queryAllByRole('dialog')).toHaveLength(0); expect(screen.getByRole('region', {name: 'Could not load calendar'})).toHaveFocus();
        expect(live().filter(node => node.textContent)).toEqual([]); expect(hiddenOutside()).toBe(0);
    });
});

describe('portal theme mirror (§10.3.4, R52)', () => {
    it('mirrors every resolved public variable and font property of the owner root before focus, and nothing else', async () => {
        const user = userEvent.setup(), style = {'--nelmad-calendar-color-accent': 'rgb(1, 2, 3)', '--nelmad-calendar-spacing-md': '19px', '--private-value': 'secret',
            fontFamily: 'Georgia', fontSize: '17px', letterSpacing: '1px'} as CalendarProps['style'];
        // Initial focus inside the portal must already see the mirrored values.
        const original = HTMLElement.prototype.focus, seen: string[] = [];
        const focus = vi.spyOn(HTMLElement.prototype, 'focus').mockImplementation(function (this: HTMLElement, options?: FocusOptions) {
            const theme = this.closest<HTMLElement>('.nc-agenda-popover');
            if (theme) seen.push(`${theme.style.visibility}|${theme.style.getPropertyValue('--nelmad-calendar-color-accent')}`);
            original.call(this, options);
        });
        render(<CalendarMonth {...input()} density="comfortable" colorScheme="dark" dir="rtl" tokens={{color: {focus: 'rgb(9, 9, 9)'}}} style={style}/>);
        await open(user); focus.mockRestore();
        expect(seen.length).toBeGreaterThan(0); expect(new Set(seen)).toEqual(new Set(['|rgb(1, 2, 3)']));
        const theme = screen.getByRole('dialog').closest<HTMLElement>('.nc-theme')!, root = document.querySelector<HTMLElement>('.nc-calendar')!;
        expect(theme).not.toBe(root); expect(theme.style.visibility).toBe('');
        for (const name of ['data-theme', 'data-density', 'data-color-scheme', 'data-dir', 'dir', 'lang']) expect(theme.getAttribute(name)).toBe(root.getAttribute(name));
        const rootStyle = getComputedStyle(root);
        for (const name of [...mirroredVariables, ...mirroredFontProperties]) expect(theme.style.getPropertyValue(name)).toBe(rootStyle.getPropertyValue(name).trim());
        expect(theme.style.getPropertyValue('--nelmad-calendar-color-accent')).toBe('rgb(1, 2, 3)');
        expect(theme.style.getPropertyValue('--nelmad-calendar-color-focus')).toBe('rgb(9, 9, 9)');
        expect(theme.style.getPropertyValue('font-family')).toBe('Georgia');
        expect(theme.style.getPropertyValue('--private-value')).toBe('');
    });
    it.each([
        ['ar', undefined, 'en-US'], ['de-DE', undefined, 'en-US'], ['en-US', 'ru-RU', 'ru-RU'],
    ] as const)('the popover and sheet theme roots repeat the root lang, not the formatting locale (locale %s, messagesLocale %s)', async (locale, messagesLocale, lang) => {
        const user = userEvent.setup(), props = {locale, ...(messagesLocale ? {messagesLocale} : {})};
        const view = render(<CalendarMonth {...input()} {...props}/>);
        const root = () => document.querySelector<HTMLElement>('.nc-calendar')!, portal = () => [...document.querySelectorAll<HTMLElement>('.nc-theme')].filter(node => node !== root());
        // The catalog language of the root label differs from the date locale here.
        expect(root().getAttribute('lang')).toBe(lang);
        await open(user);
        expect(portal().map(node => node.getAttribute('lang'))).toEqual([lang]);
        // Content keeps the content language it has inline (the view's lang), below the portal theme root.
        expect(screen.getByRole('dialog')).toHaveAttribute('lang', locale);
        await user.keyboard('{Escape}'); view.unmount();
        render(<CalendarMonth {...sheetInput()} {...props}/>); await open(user);
        expect(portal().length).toBeGreaterThan(0); expect(new Set(portal().map(node => node.getAttribute('lang')))).toEqual(new Set([root().getAttribute('lang')]));
        expect(root().getAttribute('lang')).toBe(lang);
    });
    it('refreshes after an owner commit and writes only changed values', async () => {
        const user = userEvent.setup(), tree = (accent: string) => <CalendarMonth {...input()} style={{'--nelmad-calendar-color-accent': accent} as CalendarProps['style']}/>;
        const view = render(tree('rgb(1, 1, 1)')); await open(user);
        const theme = screen.getByRole('dialog').closest<HTMLElement>('.nc-theme')!, set = vi.spyOn(theme.style, 'setProperty');
        view.rerender(tree('rgb(2, 2, 2)'));
        expect(theme.style.getPropertyValue('--nelmad-calendar-color-accent')).toBe('rgb(2, 2, 2)');
        expect(set.mock.calls.map(([name]) => name)).toEqual(['--nelmad-calendar-color-accent']);
        set.mockClear(); view.rerender(tree('rgb(2, 2, 2)')); expect(set).not.toHaveBeenCalled();
    });
});
