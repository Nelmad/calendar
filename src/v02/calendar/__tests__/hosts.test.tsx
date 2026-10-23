import {useState} from 'react';
import {createPortal} from 'react-dom';
import {act, render, screen, within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {Button as HostButton, Dialog as HostDialog, Heading as HostHeading, Modal as HostModal, ModalOverlay as HostModalOverlay} from 'react-aria-components';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import type {CalendarProps} from '../../reference.js';
import {CalendarMonth} from '../CalendarMonth.js';
import {dialogContainer} from '../portal.js';

// QA-B: package overlays inside host pages — modal hosts (QA-03), host dialogs above the sheet (QA-10), popover
// scrolling (QA-02), Escape with displaced focus, and modal effects in another realm's document (T16-V3-01).
const items = [{id: 'a', title: 'Alpha', data: {}, interval: {kind: 'allDay' as const, start: '2026-03-01', end: '2026-03-10'}},
    {id: 'b', title: 'Beta', data: {}, interval: {kind: 'timed' as const, start: '2026-03-04T10:00:00Z'}}];
const input = (): CalendarProps => ({items, anchorDate: '2026-03-01', today: '2026-03-04', timeZone: 'UTC', locale: 'en-US', layout: 'desktop', onNavigate() {}, onItemPress() {}});
const sheetInput = (): CalendarProps => ({...input(), layout: 'mobile', agendaPresentation: 'overlay'});
const cellIn = (scope: ParentNode, date = '2026-03-04') => scope.querySelector<HTMLElement>(`[role=gridcell][data-date="${date}"]`)!;
const hidden = (node: Element | null) => !!node?.closest('[aria-hidden="true"], [inert]');
const frames = () => act(() => new Promise<void>(resolve => setTimeout(resolve, 50)));
let warn: ReturnType<typeof vi.spyOn>;
beforeEach(() => { warn = vi.spyOn(console, 'warn').mockImplementation(() => {}); });
afterEach(() => { warn.mockRestore(); });

describe('modal effects in the calendar document (T16-V3-01)', () => {
    it('a Calendar in a same-origin iframe of another realm hides only that document\'s background, locks its scroll and cleans up', async () => {
        const frame = document.createElement('iframe'), outside = document.createElement('button');
        outside.textContent = 'Outer page'; document.body.append(outside, frame);
        const doc = frame.contentDocument!, view = frame.contentWindow!;
        expect(view).not.toBe(window); expect(doc).not.toBe(document);
        doc.body.innerHTML = '<button id="before">Before</button><div id="mount"></div><button id="after">After</button>';
        const user = userEvent.setup({document: doc});
        render(<CalendarMonth {...sheetInput()}/>, {container: doc.getElementById('mount')!});
        const decorative = [...doc.querySelectorAll('[aria-hidden="true"]')];
        await user.click(cellIn(doc));
        const sheet = within(doc.body).getByRole('dialog', {name: 'Events for Mar 4, 2026'});
        expect(sheet.ownerDocument).toBe(doc); expect(hidden(sheet)).toBe(false); expect(doc.activeElement?.tagName).toBe('H3');
        expect(hidden(doc.getElementById('before'))).toBe(true); expect(hidden(doc.getElementById('after'))).toBe(true);
        expect(hidden(doc.querySelector('[role=grid]'))).toBe(true); expect(doc.documentElement.style.overflow).toBe('hidden');
        // The parent document is untouched: no hidden node, no scroll lock, the iframe itself stays exposed.
        expect(document.querySelectorAll('[aria-hidden="true"], [inert]')).toHaveLength(0); expect(hidden(frame)).toBe(false);
        expect(document.documentElement.style.overflow).toBe('');
        // Containment and Escape act in the iframe document.
        for (let index = 0; index < 4; index++) { await user.tab(); expect(sheet.contains(doc.activeElement)).toBe(true); }
        await user.keyboard('{Escape}');
        expect(within(doc.body).queryByRole('dialog')).toBeNull(); expect(doc.activeElement).toBe(cellIn(doc));
        expect([...doc.querySelectorAll('[aria-hidden="true"], [inert]')]).toEqual(decorative);
        expect(doc.documentElement.style.overflow).toBe(''); expect(document.querySelectorAll('[aria-hidden="true"], [inert]')).toHaveLength(0);
        outside.remove(); frame.remove();
    });
    it('Escape with focus displaced to the body still closes the top modal sheet and recovers the date cell', async () => {
        const user = userEvent.setup(); render(<CalendarMonth {...sheetInput()}/>);
        await user.click(cellIn(document));
        expect(screen.getByRole('dialog')).toBeInTheDocument();
        act(() => (document.activeElement as HTMLElement).blur()); expect(document.activeElement).toBe(document.body);
        await user.keyboard('{Escape}');
        expect(screen.queryByRole('dialog')).toBeNull(); expect(cellIn(document)).toHaveFocus(); expect(document.documentElement.style.overflow).toBe('');
    });
    it('only a press on the backdrop itself dismisses; a press inside the sheet does not', async () => {
        const user = userEvent.setup(); render(<CalendarMonth {...sheetInput()}/>);
        await user.click(cellIn(document));
        await user.pointer({keys: '[MouseLeft]', target: document.querySelector<HTMLElement>('.nc-sheet')!});
        expect(screen.getByRole('dialog')).toBeInTheDocument();
        await user.pointer({keys: '[MouseLeft]', target: document.querySelector<HTMLElement>('.nc-sheet-backdrop')!});
        expect(screen.queryByRole('dialog')).toBeNull(); expect(cellIn(document)).toHaveFocus();
    });
    it('a press that starts inside the sheet and is released over the backdrop does not dismiss (QA-B-1-02)', async () => {
        const user = userEvent.setup(); render(<CalendarMonth {...sheetInput()}/>);
        await user.click(cellIn(document));
        const heading = within(screen.getByRole('dialog')).getByRole('heading'), backdrop = document.querySelector<HTMLElement>('.nc-sheet-backdrop')!;
        // A text selection drag: the click goes to the common ancestor, the backdrop.
        await user.pointer([{keys: '[MouseLeft>]', target: heading}, {target: backdrop}, {keys: '[/MouseLeft]', target: backdrop}]);
        expect(screen.getByRole('dialog')).toBeInTheDocument();
        // The reverse drag (backdrop to sheet) does not dismiss either; a whole press on the backdrop still does.
        await user.pointer([{keys: '[MouseLeft>]', target: backdrop}, {target: heading}, {keys: '[/MouseLeft]', target: heading}]);
        expect(screen.getByRole('dialog')).toBeInTheDocument();
        await user.pointer({keys: '[MouseLeft]', target: backdrop});
        expect(screen.queryByRole('dialog')).toBeNull(); expect(cellIn(document)).toHaveFocus();
    });
});

// Review 2026-10-09-2: an explicit portalContainer of <html> is a connected same-document Element; its sheet still makes
// the page (the body) its inert background (§10.3.4: a consumer container does not cancel inert).
describe('a sheet portaled into <html>', () => {
    it('hides the body as background and restores it', async () => {
        const user = userEvent.setup(); render(<CalendarMonth {...sheetInput()} portalContainer={document.documentElement}/>);
        await user.click(cellIn(document));
        const backdrop = document.querySelector('.nc-sheet-backdrop')!;
        expect(backdrop.parentElement).toBe(document.documentElement); expect(hidden(document.body)).toBe(true); expect(hidden(backdrop)).toBe(false);
        expect(document.documentElement.style.overflow).toBe('hidden');
        await user.keyboard('{Escape}');
        expect(document.querySelector('.nc-sheet-backdrop')).toBeNull(); expect(hidden(document.body)).toBe(false); expect(cellIn(document)).toHaveFocus();
    });
});

describe('modal hosts (QA-03)', () => {
    // Host markup outside the render container; removed after each test, also when an assertion fails.
    const pages: Element[] = [];
    const page = (html: string, shadow = false) => {
        const node = document.createElement('div'); document.body.append(node); pages.push(node);
        const scope = shadow ? node.attachShadow({mode: 'open'}) : node; scope.innerHTML = html; return scope;
    };
    afterEach(() => { for (const node of pages.splice(0)) node.remove(); });
    it.each([['popover', input], ['sheet', sheetInput]] as const)('the default %s portal stays inside the host dialog that contains the Calendar', async (presentation, props) => {
        const user = userEvent.setup();
        render(<><button>Page behind</button><div role="dialog" aria-modal="true" aria-label="Host dialog"><CalendarMonth {...props()}/></div></>);
        const host = screen.getByRole('dialog', {name: 'Host dialog'});
        act(() => cellIn(host).focus()); await user.keyboard('{Enter}');
        const agenda = within(host).getByRole('dialog', {name: 'Events for Mar 4, 2026'});
        expect(agenda.closest('.nc-calendar')).toBeNull(); expect(host.contains(agenda)).toBe(true);
        expect(agenda.closest('[data-presentation]')).toHaveAttribute('data-presentation', presentation);
        if (presentation === 'sheet') {
            expect(hidden(host)).toBe(false); expect(hidden(host.querySelector('[role=grid]'))).toBe(true);
            expect(hidden(screen.getByText('Page behind'))).toBe(true);
        }
        await user.keyboard('{Escape}');
        expect(within(host).queryByRole('dialog')).toBeNull(); expect(cellIn(host)).toHaveFocus();
    });
    it('a host dialog that opens around a mounted Calendar is used from the next activation; an explicit portalContainer still wins', async () => {
        const user = userEvent.setup();
        const view = render(<div data-testid="host"><CalendarMonth {...input()}/></div>);
        const host = screen.getByTestId('host');
        act(() => { host.setAttribute('role', 'dialog'); host.setAttribute('aria-modal', 'true'); host.setAttribute('aria-label', 'Late host'); });
        act(() => cellIn(host).focus()); await user.keyboard('{Enter}');
        expect(host.contains(screen.getByRole('dialog', {name: 'Events for Mar 4, 2026'}))).toBe(true);
        await user.keyboard('{Escape}');
        view.rerender(<div data-testid="host" role="dialog" aria-modal="true" aria-label="Late host"><CalendarMonth {...input()} portalContainer={document.body}/></div>);
        act(() => cellIn(host).focus()); await user.keyboard('{Enter}');
        const agenda = screen.getByRole('dialog', {name: 'Events for Mar 4, 2026'});
        expect(host.contains(agenda)).toBe(false); expect(agenda.closest('body')).toBe(document.body);
    });
    it('a change of the default target while the agenda is open closes it like a portalContainer identity change (spec v7 §10.3.4)', async () => {
        const user = userEvent.setup(), tree = (modal: boolean) => <div data-testid="host" role="dialog" aria-modal={modal ? 'true' : undefined} aria-label="Host"><CalendarMonth {...input()}/></div>;
        const view = render(tree(true)), host = screen.getByTestId('host');
        act(() => cellIn(host).focus()); await user.keyboard('{Enter}');
        expect(host.contains(screen.getByRole('dialog', {name: 'Events for Mar 4, 2026'}))).toBe(true);
        // The host stops being modal by its aria-modal attribute alone: no node is inserted or removed anywhere.
        view.rerender(tree(false)); await frames();
        expect(screen.queryByRole('dialog', {name: 'Events for Mar 4, 2026'})).toBeNull(); expect(cellIn(host)).toHaveFocus();
        await user.keyboard('{Enter}');
        const agenda = screen.getByRole('dialog', {name: 'Events for Mar 4, 2026'});
        expect(host.contains(agenda)).toBe(false); expect(agenda.closest('body')).toBe(document.body);
    });
    // DEC-1-02: modality changes by attributes only (aria-modal, the open attribute of showModal()/close()).
    it('a host that gains and loses aria-modal by the attribute alone while the agenda is open closes it each time; the next activation uses the new default', async () => {
        const user = userEvent.setup(), scope = page('<section id="frame" aria-label="Host"><div id="mount"></div></section>'), title = {name: 'Events for Mar 4, 2026'};
        const frame = scope.querySelector('#frame')!;
        render(<CalendarMonth {...input()}/>, {container: scope.querySelector<HTMLElement>('#mount')!});
        act(() => cellIn(frame).focus()); await user.keyboard('{Enter}');
        expect(frame.contains(screen.getByRole('dialog', title))).toBe(false);
        act(() => frame.setAttribute('aria-modal', 'true')); await frames();
        expect(screen.queryByRole('dialog', title)).toBeNull(); expect(cellIn(frame)).toHaveFocus();
        await user.keyboard('{Enter}'); expect(frame.contains(screen.getByRole('dialog', title))).toBe(true);
        act(() => frame.removeAttribute('aria-modal')); await frames();
        expect(screen.queryByRole('dialog', title)).toBeNull(); expect(cellIn(frame)).toHaveFocus();
        await user.keyboard('{Enter}');
        const agenda = screen.getByRole('dialog', title);
        expect(frame.contains(agenda)).toBe(false); expect(agenda.closest('body')).toBe(document.body);
        await user.keyboard('{Escape}');
    });
    it('the open attribute of a host <dialog> (showModal()/close() without a node change) re-resolves the default target while the agenda is open', async () => {
        const user = userEvent.setup(), scope = page('<dialog id="frame" aria-label="Host"><div id="mount"></div></dialog>'), title = {name: 'Events for Mar 4, 2026'};
        const frame = scope.querySelector('dialog')!;
        render(<CalendarMonth {...input()}/>, {container: scope.querySelector<HTMLElement>('#mount')!});
        act(() => cellIn(frame).focus()); await user.keyboard('{Enter}');
        expect(frame.contains(screen.getByRole('dialog', title))).toBe(false);
        // jsdom has neither showModal() nor :modal: the open attribute stands for the modal state (the Chrome host probe uses the real methods).
        act(() => frame.setAttribute('open', '')); await frames();
        expect(screen.queryByRole('dialog', title)).toBeNull(); expect(cellIn(frame)).toHaveFocus();
        await user.keyboard('{Enter}'); expect(frame.contains(screen.getByRole('dialog', title))).toBe(true);
        act(() => frame.removeAttribute('open')); await frames();
        expect(screen.queryByRole('dialog', title)).toBeNull(); expect(frame.querySelector('.nc-agenda-popover')).toBeNull();
    });
    it('an aria-modal attribute change inside the ShadowRoot of the Calendar is observed there (no document mutation)', async () => {
        const user = userEvent.setup(), shadow = page('<section id="frame" aria-label="Host"><div id="mount"></div></section>', true);
        const frame = shadow.querySelector('#frame')!, panel = () => document.querySelector('.nc-agenda-popover') ?? shadow.querySelector('.nc-agenda-popover');
        render(<CalendarMonth {...input()}/>, {container: shadow.querySelector<HTMLElement>('#mount')!});
        act(() => cellIn(frame).focus()); await user.keyboard('{Enter}');
        expect(panel()).not.toBeNull(); expect(frame.contains(panel())).toBe(false);
        act(() => frame.setAttribute('aria-modal', 'true')); await frames();
        expect(panel()).toBeNull();
        act(() => cellIn(frame).focus()); await user.keyboard('{Enter}');
        expect(frame.contains(panel())).toBe(true);
        await user.keyboard('{Escape}');
    });
});

// Spec v7 §10.3.4 (decision 2026-10-09): only a modal <dialog> or an aria-modal="true" element is a default target.
describe('open modal containers (spec v7 §10.3.4)', () => {
    const created: Element[] = [];
    const element = (html: string) => { const host = document.createElement('div'); host.innerHTML = html; document.body.append(host); created.push(host); return host; };
    afterEach(() => { for (const host of created.splice(0)) host.remove(); });
    it('counts aria-modal="true" elements and open modal <dialog>s, never a plain role=dialog/alertdialog or a closed dialog', () => {
        const host = element(`<div id="modal" role="dialog" aria-modal="true"><p id="a"></p></div><div role="dialog"><p id="b"></p></div><div role="alertdialog"><p id="c"></p></div>
            <div role="dialog" aria-modal="false"><p id="d"></p></div><dialog open><p id="e"></p></dialog><dialog aria-modal="true"><p id="f"></p></dialog><section aria-modal="true"><p id="g"></p></section>`);
        const at = (id: string) => dialogContainer(host.querySelector(`#${id}`));
        expect(at('a')).toBe(host.querySelector('#modal')); expect(at('b')).toBeNull(); expect(at('c')).toBeNull(); expect(at('d')).toBeNull();
        // jsdom has no :modal; an open <dialog> counts there (the browser checks :modal, see the Chrome host probe).
        expect(at('e')).toBe(host.querySelector('dialog[open]')); expect(at('f')).toBeNull(); expect(at('g')).toBe(host.querySelector('section'));
    });
    it('an open <dialog> outside the modal state (show()) is not a modal container unless it has aria-modal="true"', () => {
        const host = element('<dialog id="plain" open><p id="a"></p></dialog><dialog id="marked" open aria-modal="true"><p id="b"></p></dialog>');
        const matches = Element.prototype.matches, spy = vi.spyOn(Element.prototype, 'matches').mockImplementation(function (this: Element, selector: string) {
            return selector === ':modal' ? false : matches.call(this, selector);
        });
        try {
            expect(dialogContainer(host.querySelector('#a'))).toBeNull(); expect(dialogContainer(host.querySelector('#b'))).toBe(host.querySelector('#marked'));
        } finally { spy.mockRestore(); }
    });
    it('follows the composed path out of a ShadowRoot to an aria-modal host', () => {
        const host = element('<div id="modal" aria-modal="true"><div id="shadow-host"></div></div>'), shadow = host.querySelector('#shadow-host')!.attachShadow({mode: 'open'});
        shadow.innerHTML = '<div role="dialog"><p id="inner"></p></div>';
        expect(dialogContainer(shadow.querySelector('#inner'))).toBe(host.querySelector('#modal'));
    });
    it.each(['dialog', 'alertdialog'])('a Calendar inside a non-modal role=%s panel keeps the default popover in the owner body', async role => {
        const user = userEvent.setup();
        render(<aside role={role} aria-label="Filters"><CalendarMonth {...input()}/></aside>);
        const panel = screen.getByRole(role, {name: 'Filters'});
        act(() => cellIn(panel).focus()); await user.keyboard('{Enter}');
        const agenda = screen.getByRole('dialog', {name: 'Events for Mar 4, 2026'});
        expect(panel.contains(agenda)).toBe(false); expect(agenda.closest('body')).toBe(document.body); expect(agenda.closest('[data-presentation]')).toHaveAttribute('data-presentation', 'popover');
        await user.keyboard('{Escape}'); expect(cellIn(panel)).toHaveFocus();
    });
});

function HostDetails({onClose}: {onClose: () => void}) {
    return createPortal(<div role="dialog" aria-modal="true" aria-label="Item details"><input aria-label="Note"/><button onClick={onClose}>Close details</button></div>, document.body);
}
function HostPage() {
    const [details, setDetails] = useState(false);
    return <><CalendarMonth {...sheetInput()} onItemPress={() => setDetails(true)}/>{details && <HostDetails onClose={() => setDetails(false)}/>}</>;
}
describe('a host dialog opened from onItemPress above the modal sheet (QA-10)', () => {
    it('stays exposed and focusable while the sheet yields; the sheet resumes when it closes', async () => {
        const user = userEvent.setup(); render(<HostPage/>);
        await user.click(cellIn(document)); await user.click(screen.getByRole('button', {name: /Beta/}));
        const details = screen.getByRole('dialog', {name: 'Item details'}), note = within(details).getByRole('textbox', {name: 'Note'});
        expect(hidden(details)).toBe(false); expect(document.querySelector('.nc-sheet-backdrop')).toHaveAttribute('data-yielded');
        await user.click(note); await user.keyboard('hello');
        expect(note).toHaveFocus(); expect(note).toHaveValue('hello');
        await user.tab(); expect(within(details).getByRole('button', {name: 'Close details'})).toHaveFocus();
        await user.click(within(details).getByRole('button', {name: 'Close details'}));
        await frames();
        // The host restores nothing here: focus returns to the last control of the still-open sheet.
        expect(screen.queryByRole('dialog', {name: 'Item details'})).toBeNull(); expect(screen.getByRole('dialog', {name: 'Events for Mar 4, 2026'})).toBeInTheDocument();
        expect(document.querySelector('.nc-sheet-backdrop')).not.toHaveAttribute('data-yielded');
        expect(screen.getByRole('button', {name: /Beta/})).toHaveFocus();
        for (let index = 0; index < 4; index++) { await user.tab(); expect(document.querySelector('.nc-sheet')!.contains(document.activeElement)).toBe(true); }
        await user.keyboard('{Escape}'); expect(screen.queryByRole('dialog')).toBeNull(); expect(document.querySelectorAll('[inert], .nc-backdrop')).toHaveLength(0);
    });
});

// Review 2026-10-09-2: React Aria Components' Modal (the package's own dependency) renders no aria-modal; it makes everything
// outside its overlay inert or aria-hidden instead. It covers the stack: a host layer, never background.
function RacHostPage({props = {}}: {props?: Partial<CalendarProps>}) {
    const [open, setOpen] = useState(false);
    return <><CalendarMonth {...sheetInput()} {...props} onItemPress={() => setOpen(true)}/>
        <HostModalOverlay isOpen={open} onOpenChange={setOpen} isDismissable>
            <HostModal><HostDialog aria-label="Item details"><HostHeading slot="title">Details</HostHeading>
                <input aria-label="Note"/><HostButton onPress={() => setOpen(false)}>Close details</HostButton></HostDialog></HostModal>
        </HostModalOverlay></>;
}
describe('a host modal without aria-modal opened from onItemPress above the modal sheet (review 2026-10-09-2)', () => {
    it('owns focus and Escape while the sheet yields; the sheet resumes when it closes', async () => {
        const user = userEvent.setup(); render(<RacHostPage/>);
        await user.click(cellIn(document)); await user.keyboard('{Tab}');
        await user.click(screen.getByRole('button', {name: /Beta/})); await frames();
        const details = screen.getByRole('dialog', {name: 'Item details'}), note = within(details).getByRole('textbox', {name: 'Note'});
        expect(details).not.toHaveAttribute('aria-modal');
        expect(hidden(details)).toBe(false); expect(document.querySelector('.nc-sheet-backdrop')).toHaveAttribute('data-yielded');
        await user.click(note); await user.keyboard('hello');
        expect(note).toHaveFocus(); expect(note).toHaveValue('hello');
        // Escape belongs to the top layer, the host dialog; the package sheet underneath stays open.
        await user.keyboard('{Escape}'); await frames();
        expect(screen.queryByRole('dialog', {name: 'Item details'})).toBeNull();
        expect(screen.getByRole('dialog', {name: 'Events for Mar 4, 2026'})).toBeInTheDocument();
        expect(document.querySelector('.nc-sheet-backdrop')).not.toHaveAttribute('data-yielded');
        expect(document.querySelector('.nc-sheet')!.contains(document.activeElement)).toBe(true);
        expect(document.documentElement.style.overflow).toBe('hidden');
        await user.keyboard('{Escape}');
        expect(screen.queryByRole('dialog')).toBeNull(); expect(cellIn(document)).toHaveFocus();
        expect(document.querySelectorAll('[inert], .nc-backdrop')).toHaveLength(0); expect(document.documentElement.style.overflow).toBe('');
    });
    // Round 2: the host focuses its dialog in the commit that opens it, before it hides the sheet; containment must not pull
    // focus back into the sheet (the host then hides it and focus would drop to body).
    it('focus stays in the host dialog from the moment it opens: it never returns to the sheet', async () => {
        const user = userEvent.setup(); render(<RacHostPage/>);
        await user.click(cellIn(document));
        const sheet = document.querySelector('.nc-sheet')!, trail: string[] = [];
        act(() => screen.getByRole('button', {name: /Beta/}).focus());
        const record = (event: FocusEvent) => trail.push(sheet.contains(event.target as Node) ? 'sheet' : (event.target as Element).closest('[role=dialog]')?.getAttribute('aria-label') ?? 'other');
        document.addEventListener('focusin', record, true);
        try {
            await user.keyboard('{Enter}');
            const details = screen.getByRole('dialog', {name: 'Item details'});
            expect(details.contains(document.activeElement)).toBe(true);
            await frames();
            expect(details.contains(document.activeElement)).toBe(true); expect(hidden(details)).toBe(false);
            expect(trail).toEqual(['Item details']);
        } finally { document.removeEventListener('focusin', record, true); }
    });
    it('a sheet that closes under the open host modal keeps the page locked until the host closes, then restores it', async () => {
        const user = userEvent.setup(), view = render(<RacHostPage/>);
        expect(document.documentElement.style.overflow).toBe('');
        await user.click(cellIn(document)); await user.keyboard('{Tab}');
        await user.click(screen.getByRole('button', {name: /Beta/})); await frames();
        expect(screen.getByRole('dialog', {name: 'Item details'})).toBeInTheDocument();
        // A data update removes the sheet while the host modal is still open (non-LIFO release).
        view.rerender(<RacHostPage props={{dataState: {status: 'loading', phase: 'initial'}}}/>); await frames();
        expect(document.querySelector('.nc-sheet-backdrop')).toBeNull();
        // The page under the host modal stays locked and hidden.
        expect(document.documentElement.style.overflow).toBe('hidden'); expect(hidden(document.querySelector('.nc-calendar'))).toBe(true);
        expect(hidden(screen.getByRole('dialog', {name: 'Item details'}))).toBe(false);
        await user.click(within(screen.getByRole('dialog', {name: 'Item details'})).getByRole('button', {name: 'Close details'})); await frames();
        expect(screen.queryByRole('dialog', {name: 'Item details'})).toBeNull();
        expect(document.documentElement.style.overflow).toBe(''); expect(hidden(document.querySelector('.nc-calendar'))).toBe(false);
    });
});

// QA-B-1-03: a non-modal host dialog shown above the sheet is background; only a modal host layer yields the stack.
describe('a non-modal host dialog above the modal sheet (QA-B-1-03)', () => {
    const panels: Element[] = [];
    const panel = (attributes: Record<string, string>) => {
        const node = document.createElement('div');
        for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, value);
        node.innerHTML = '<button>Undo</button>'; panels.push(node);
        return node;
    };
    afterEach(() => { for (const node of panels.splice(0)) node.remove(); });
    it.each(['dialog', 'alertdialog'])('a role=%s panel without aria-modal is hidden as background; the sheet keeps containment and does not yield', async role => {
        const user = userEvent.setup(); render(<CalendarMonth {...sheetInput()}/>);
        await user.click(cellIn(document));
        const sheet = screen.getByRole('dialog', {name: 'Events for Mar 4, 2026'}), toast = panel({role, 'aria-label': 'Saved'});
        act(() => { document.body.append(toast); }); await frames();
        expect(document.querySelector('.nc-sheet-backdrop')).not.toHaveAttribute('data-yielded'); expect(hidden(toast)).toBe(true);
        for (let index = 0; index < 4; index++) { await user.tab(); expect(sheet.contains(document.activeElement)).toBe(true); }
        await user.keyboard('{Escape}');
        expect(screen.queryByRole('dialog', {name: 'Events for Mar 4, 2026'})).toBeNull(); expect(cellIn(document)).toHaveFocus(); expect(hidden(toast)).toBe(false);
    });
    // Round 2: a later dialog that receives focus is contained only after its commit; one that hides the stack in a later task
    // covers it then, and the focus that containment returned to the now hidden sheet moves into the host dialog.
    it('a focused later role=dialog stays background (focus returns to the sheet); when it then hides the sheet, focus moves into it', async () => {
        const user = userEvent.setup(); render(<CalendarMonth {...sheetInput()}/>);
        await user.click(cellIn(document));
        const sheet = screen.getByRole('dialog', {name: 'Events for Mar 4, 2026'}), host = panel({role: 'dialog', 'aria-label': 'Saved'});
        await act(async () => { document.body.append(host); host.querySelector('button')!.focus(); });
        expect(sheet.contains(document.activeElement)).toBe(true); expect(hidden(host)).toBe(true);
        expect(document.querySelector('.nc-sheet-backdrop')).not.toHaveAttribute('data-yielded');
        act(() => { document.querySelector('.nc-sheet-backdrop')!.setAttribute('aria-hidden', 'true'); }); await frames();
        expect(document.querySelector('.nc-sheet-backdrop')).toHaveAttribute('data-yielded'); expect(hidden(host)).toBe(false);
        expect(host.querySelector('button')).toHaveFocus();
        act(() => { host.remove(); document.querySelector('.nc-sheet-backdrop')!.removeAttribute('aria-hidden'); }); await frames();
        expect(document.querySelector('.nc-sheet-backdrop')).not.toHaveAttribute('data-yielded');
        await user.keyboard('{Escape}'); expect(screen.queryByRole('dialog', {name: 'Events for Mar 4, 2026'})).toBeNull();
    });
    it('the same panel with aria-modal="true" is a host layer: exposed, and the sheet yields until it closes', async () => {
        const user = userEvent.setup(); render(<CalendarMonth {...sheetInput()}/>);
        await user.click(cellIn(document));
        const modal = panel({role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Saved'});
        act(() => { document.body.append(modal); }); await frames();
        expect(document.querySelector('.nc-sheet-backdrop')).toHaveAttribute('data-yielded'); expect(hidden(modal)).toBe(false);
        act(() => { modal.remove(); }); await frames();
        expect(document.querySelector('.nc-sheet-backdrop')).not.toHaveAttribute('data-yielded');
        await user.keyboard('{Escape}'); expect(screen.queryByRole('dialog', {name: 'Events for Mar 4, 2026'})).toBeNull();
    });
    it('a modal host layer inside an open ShadowRoot (a web-component modal) is found too: its host stays exposed while the sheet yields', async () => {
        const user = userEvent.setup(); render(<CalendarMonth {...sheetInput()}/>);
        await user.click(cellIn(document));
        const component = panel({}), outer = component.attachShadow({mode: 'open'});
        outer.innerHTML = '<div id="inner-host"></div>';
        const inner = outer.querySelector('#inner-host')!.attachShadow({mode: 'open'});
        act(() => { document.body.append(component); }); await frames();
        // Present but not modal yet: background like any node.
        expect(document.querySelector('.nc-sheet-backdrop')).not.toHaveAttribute('data-yielded'); expect(hidden(component)).toBe(true);
        // An attribute change inside a nested ShadowRoot opens the layer.
        inner.innerHTML = '<div role="dialog" aria-label="Component modal"><button>Confirm</button></div>';
        act(() => { inner.querySelector('[role=dialog]')!.setAttribute('aria-modal', 'true'); }); await frames();
        expect(document.querySelector('.nc-sheet-backdrop')).toHaveAttribute('data-yielded'); expect(hidden(component)).toBe(false);
        act(() => { inner.querySelector('[role=dialog]')!.removeAttribute('aria-modal'); }); await frames();
        expect(document.querySelector('.nc-sheet-backdrop')).not.toHaveAttribute('data-yielded'); expect(hidden(component)).toBe(true);
        await user.keyboard('{Escape}'); expect(screen.queryByRole('dialog', {name: 'Events for Mar 4, 2026'})).toBeNull(); expect(hidden(component)).toBe(false);
    });
});

describe('desktop popover scrolling (QA-02)', () => {
    it('scrolling inside the popover never repositions it; scrolling the page does', async () => {
        const user = userEvent.setup(); render(<CalendarMonth {...input()}/>);
        act(() => cellIn(document).focus()); await user.keyboard('{Enter}'); await frames();
        const positioner = document.querySelector<HTMLElement>('.nc-agenda-positioner')!, scroller = document.querySelector<HTMLElement>('.nc-agenda-popover')!;
        const writes: MutationRecord[] = [];
        new MutationObserver(records => writes.push(...records)).observe(positioner, {attributes: true, attributeFilter: ['style']});
        act(() => { scroller.dispatchEvent(new Event('scroll')); scroller.querySelector('li')?.dispatchEvent(new Event('scroll')); }); await frames();
        expect(writes).toHaveLength(0);
        act(() => { document.dispatchEvent(new Event('scroll')); }); await frames();
        expect(writes.length).toBeGreaterThan(0);
    });
});

// Review 2026-10-09-3: the package scroll lock never widens the page. Chrome with overlay scrollbars keeps no stable gutter
// for a custom-styled (::-webkit-scrollbar) classic scrollbar under overflow:hidden, so the gained width is padded instead.
describe('scroll lock keeps the layout width', () => {
    const html = document.documentElement;
    function scrollbar(kind: 'stable' | 'lost') {
        // A 17 px classic scrollbar. Only the box of <html> shows it and whether the lock lost the gutter (`lost`: overflow:hidden
        // removes it although scrollbar-gutter is stable). `clientWidth` is stale, as in Chrome for a styled scrollbar when the
        // lock is released and taken again in one task (StrictMode): it is never the measure.
        const box = () => html.style.overflow === 'hidden' && kind === 'lost' ? window.innerWidth : window.innerWidth - 17;
        Object.defineProperty(html, 'clientWidth', {configurable: true, get: () => window.innerWidth});
        vi.spyOn(html, 'getBoundingClientRect').mockImplementation(() => ({width: box()}) as DOMRect);
        vi.stubGlobal('CSS', {supports: (property: string, value: string) => property === 'scrollbar-gutter' && value === 'stable'});
    }
    afterEach(() => { delete (html as Partial<{clientWidth: number}>).clientWidth; vi.unstubAllGlobals(); vi.restoreAllMocks(); html.removeAttribute('style'); });
    it.each([['lost', '17px'], ['stable', '']] as const)('a %s gutter: the sheet lock pads %s and restores the page on close', async (kind, padding) => {
        scrollbar(kind); const user = userEvent.setup(); render(<CalendarMonth {...sheetInput()}/>);
        await user.click(cellIn(document)); expect(screen.getByRole('dialog')).toBeInTheDocument();
        expect(html.style.overflow).toBe('hidden'); expect(html.style.getPropertyValue('scrollbar-gutter')).toBe('stable'); expect(html.style.paddingRight).toBe(padding);
        await user.keyboard('{Escape}');
        expect(html.style.overflow).toBe(''); expect(html.style.paddingRight).toBe(''); expect(html.style.getPropertyValue('scrollbar-gutter')).toBe('');
    });
    it('adds the lost gutter to the page\'s own padding', async () => {
        scrollbar('lost'); const style = document.createElement('style'); style.textContent = 'html { padding-right: 8px }'; document.head.append(style);
        try {
            const user = userEvent.setup(); render(<CalendarMonth {...sheetInput()}/>);
            await user.click(cellIn(document)); expect(html.style.paddingRight).toBe('25px');
            await user.keyboard('{Escape}'); expect(html.style.paddingRight).toBe('');
        } finally { style.remove(); }
    });
});

// Review 2026-10-09-3: a host dialog without aria-modal keeps the v7 default (body); development builds explain it once.
describe('Calendar inside a host dialog without aria-modal', () => {
    const portalWarnings = () => warn.mock.calls.map(([message]) => String(message)).filter(message => message.includes('portalContainer'));
    const unmarked = '[@nelmad/calendar] portalContainer: The calendar is inside a role="dialog" element without aria-modal="true", so the agenda and menus render in document.body; '
        + 'a dialog or popover library that traps focus or closes on outside focus closes them (or itself) at once. Pass that dialog element as portalContainer, or document.body to keep this default';
    function InModal({props = {}}: {props?: Partial<CalendarProps>}) {
        return <HostModalOverlay isOpen><HostModal><HostDialog aria-label="Planner"><CalendarMonth {...input()} {...props}/></HostDialog></HostModal></HostModalOverlay>;
    }
    it('React Aria Components Modal: the agenda goes to body with one development warning naming the fix', async () => {
        const user = userEvent.setup(); render(<InModal/>);
        expect(screen.getByRole('dialog', {name: 'Planner'})).not.toHaveAttribute('aria-modal');
        act(() => cellIn(document).focus()); await user.keyboard('{Enter}'); await user.keyboard('{Escape}'); await user.keyboard('{Enter}');
        expect(portalWarnings()).toEqual([unmarked]);
    });
    it('a role="alertdialog" side panel names its role', () => {
        render(<div role="alertdialog" aria-label="Panel"><CalendarMonth {...input()}/></div>);
        expect(portalWarnings()).toEqual([unmarked.replace('role="dialog"', 'role="alertdialog"')]);
    });
    it.each([['an explicit portalContainer', true], ['document.body as portalContainer', false]])('%s is a choice: no warning', async (_, own) => {
        function Own() {
            const [node, setNode] = useState<HTMLElement | null>(null);
            return <div role="dialog" aria-label="Planner" ref={setNode}>{node && <CalendarMonth {...input()} portalContainer={own ? node : document.body}/>}</div>;
        }
        const user = userEvent.setup(); render(<Own/>); act(() => cellIn(document).focus()); await user.keyboard('{Enter}');
        expect(screen.getByRole('dialog', {name: /Events for/})).toBeInTheDocument(); expect(portalWarnings()).toEqual([]);
    });
    it.each([['aria-modal="true"', {'aria-modal': true}], ['no dialog', null]] as const)('%s: no warning', async (_, attributes) => {
        const user = userEvent.setup();
        render(attributes ? <div role="dialog" aria-label="Planner" {...attributes}><CalendarMonth {...input()}/></div> : <CalendarMonth {...input()}/>);
        act(() => cellIn(document).focus()); await user.keyboard('{Enter}'); expect(portalWarnings()).toEqual([]);
    });
});
