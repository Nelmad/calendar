import {StrictMode, useState, useSyncExternalStore, type ReactNode} from 'react';
import {flushSync} from 'react-dom';
import {createRoot, hydrateRoot} from 'react-dom/client';
import {renderToString} from 'react-dom/server';
import {act, cleanup as cleanupRender, fireEvent, render, screen, within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {afterEach, beforeEach, describe, expect, it, vi, type MockInstance} from 'vitest';
import type {CalendarItem, CalendarMoveInput, CalendarMoveRequest, CalendarMoveState, CalendarProps} from '../../reference.js';
import {createDateAdapter} from '../../core/date.js';
import {evaluateMoveTarget, startMoveDraft, type MoveDraft} from '../../core/move.js';
import {missingCryptoMessage} from '../../core/moveRequests.js';
import {CalendarMonth, CalendarMonthRoot} from '../CalendarMonth.js';
import type {CalendarController} from '../useCalendarController.js';

// #10: the move request registry and the draft retention lifecycle through the internal CalendarMonth. No input adapter
// exists yet, so the tests drive controller.move through the internal onController seam with the real proposal of #9.
type Controller = CalendarController<unknown, unknown>;
type Options = Partial<Record<keyof CalendarProps, unknown>>;
const alpha: CalendarItem = {id: 'a', title: 'Alpha', data: {}, interval: {kind: 'allDay', start: '2026-09-03', end: '2026-09-04'}};
const beta: CalendarItem = {id: 'b', title: 'Beta', calendarId: 'work', data: {}, interval: {kind: 'timed', start: '2026-09-03T10:00:00Z', end: '2026-09-03T11:00:00Z'}};
const sources = [{id: 'work', title: 'Work'}];
const v4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
/** The mobile inline agenda of 3 September shows the rows without layout; `layout: 'desktop'` renders the Month segments. */
const base = (overrides: Options = {}) => ({items: [alpha, beta], sources, anchorDate: '2026-09-01', today: '2026-09-15', timeZone: 'UTC', locale: 'en-US',
    layout: 'mobile', agendaDate: '2026-09-03', onAgendaDateChange() {}, onNavigate() {}, ...overrides}) as CalendarProps;
const pending = (requestId: string, itemId = 'a'): CalendarMoveState => ({requestId, itemId, status: 'pending'});
const succeeded = (requestId: string, itemId = 'a'): CalendarMoveState => ({requestId, itemId, status: 'succeeded'});
const rejected = (requestId: string, reason: string, itemId = 'a'): CalendarMoveState => ({requestId, itemId, status: 'rejected', reason});

/** Every consumer callback in call order: `draft:<id|null>`, `request:<item id>` and `navigate:<date>`. */
function recorder() {
    const events: string[] = [], requests: CalendarMoveRequest[] = [];
    return {events, requests, read: () => events.splice(0),
        draft: vi.fn((itemId: string | null) => { events.push(`draft:${itemId}`); }),
        request: vi.fn((request: CalendarMoveRequest) => { requests.push(request); events.push(`request:${request.item.id}`); }),
        navigate: vi.fn((date: string) => { events.push(`navigate:${date}`); })};
}
type Recorder = ReturnType<typeof recorder>;
const moving = (log: Recorder, states: readonly CalendarMoveState[] = [], overrides: Options = {}) =>
    base({itemMoveStates: states, onItemMoveRequest: log.request, onItemMoveDraftChange: log.draft, onNavigate: log.navigate, ...overrides});

const controllers = new Map<string, Controller>();
/** The internal Month with the test seam: the committed controller of each named instance. */
function Month({name = 'main', ...props}: CalendarProps & {name?: string}) {
    return <CalendarMonthRoot input={props as CalendarProps} onController={(controller: Controller) => { controllers.set(name, controller); }}/>;
}
const move = (name = 'main') => controllers.get(name)!.move;
function dataModel(name = 'main') {
    const model = controllers.get(name)!.model;
    if (model.kind !== 'data') throw new Error('No data model');
    return model;
}
const dates = createDateAdapter();
/** The real #9 proposal of an open draft for a target, as the input adapters compute it. */
function proposal(draft: MoveDraft, target: string, input: CalendarMoveInput = 'keyboard', name = 'main') {
    const model = dataModel(name), latest = model.visible.get(draft.itemId)!;
    const result = evaluateMoveTarget(draft, latest, target, input, model.props.interactionPolicy, dates);
    if (result.kind !== 'allowed') throw new Error(`Target ${target} is ${result.kind}`);
    return result.proposal;
}
/** One confirmation, as an adapter's handler does it: open the draft, then submit its proposal. Returns the request ID. */
function submitMove(itemId: string, target = '2026-09-05', name = 'main') {
    let id: string | null = null;
    act(() => {
        const draft = move(name).startDraft(itemId);
        if (!draft) throw new Error(`No draft for ${itemId}`);
        id = move(name).submit(proposal(draft, target, 'keyboard', name));
    });
    return id!;
}
const startDraft = (itemId: string, name = 'main') => { let draft: MoveDraft | null = null; act(() => { draft = move(name).startDraft(itemId); }); return draft as MoveDraft | null; };
const wrap = (node: ReactNode, strict: boolean) => strict ? <StrictMode>{node}</StrictMode> : node;
/** An act whose callback threw leaves React's queued work for the next act; this flushes it, as the browser would. */
const settle = () => act(() => {});

/** Every write to a live region, as `<calendar id or main|sheet> polite|urgent: text` of that write; clearing writes are left out. */
function liveLog() {
    const log: string[] = [];
    const record = (records: MutationRecord[]) => {
        for (const entry of records) {
            const host = entry.target as HTMLElement, text = [...entry.addedNodes].map(node => node.textContent).join('');
            if (entry.type !== 'childList' || !host.matches?.('[role=status],[role=alert]') || !text) continue;
            const owner = host.closest('[role=dialog]') ? 'sheet' : host.closest<HTMLElement>('.nc-calendar')?.id || 'main';
            log.push(`${owner} ${host.getAttribute('role') === 'alert' ? 'urgent' : 'polite'}: ${text}`);
        }
    };
    const observer = new MutationObserver(record);
    observer.observe(document.body, {childList: true, subtree: true});
    return {read: () => { record(observer.takeRecords()); return log.splice(0); }, stop: () => observer.disconnect()};
}
const row = (id: string, scope: ParentNode = document) => scope.querySelector<HTMLElement>(`li[data-item-id="${id}"]`);
const segments = (id: string) => [...document.querySelectorAll<HTMLElement>(`.nc-month-item[data-item-id="${id}"]`)];
const sizes: Record<string, Record<string, string>> = {'nc-month-week': {height: '120px', width: '700px'}, 'nc-day-header': {height: '32px'},
    'nc-month-item-probe': {height: '24px', marginBottom: '4px'}, 'nc-month-overflow-probe': {height: '24px'}};
let live: ReturnType<typeof liveLog>, warn: MockInstance<typeof console.warn>;
beforeEach(() => {
    controllers.clear(); live = liveLog(); warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    // jsdom has no layout: the measured Month boxes are given, so the desktop grid renders its segments.
    const original = window.getComputedStyle.bind(window);
    vi.spyOn(window, 'getComputedStyle').mockImplementation((node, pseudo) => {
        const style = original(node, pseudo), size = [...node.classList].map(name => sizes[name]).find(Boolean);
        return new Proxy(style, {get: (target, name) => size && typeof name === 'string' && name in size ? size[name]
            : typeof Reflect.get(target, name) === 'function' ? (Reflect.get(target, name) as (...args: unknown[]) => unknown).bind(target) : Reflect.get(target, name)});
    });
});
afterEach(() => { live.stop(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
const moveWarnings = () => warn.mock.calls.map(([message]) => String(message)).filter(message => message.includes('itemMoveStates'));
const prefix = '[@nelmad/calendar] itemMoveStates: ';

describe.each([false, true])('scenario 1: pending, then rejected, with unchanged items (StrictMode %s)', strict => {
    it('reports only the results it is given, once, and blocks the item until its terminal', () => {
        vi.useFakeTimers();
        const log = recorder(), view = render(wrap(<Month {...moving(log)}/>, strict));
        const id = submitMove('a');
        expect(log.read()).toEqual(['draft:a', 'request:a', 'draft:null']);
        const [request] = log.requests;
        expect(request.requestId).toMatch(v4);
        expect(request).toEqual({item: alpha, previousInterval: alpha.interval, proposedInterval: {kind: 'allDay', start: '2026-09-05', end: '2026-09-06'}, input: 'keyboard', requestId: id});
        expect(request.item).toBe(alpha);
        // No timeout, no automatic result and no warning, whatever time passes and however many unrelated commits follow.
        for (let i = 0; i < 3; i++) {
            act(() => { vi.advanceTimersByTime(60 * 60 * 1000); });
            view.rerender(wrap(<Month {...moving(log, [])}/>, strict));
        }
        expect(live.read()).toEqual([]); expect(moveWarnings()).toEqual([]);
        expect(move().isPending('a')).toBe(false); expect(move().isBlocked('a')).toBe(true); expect(move().isBlocked('b')).toBe(false);
        expect(row('a')).not.toHaveAttribute('data-pending');
        // A second move of the item is blocked before any acknowledgement.
        expect(startDraft('a')).toBeNull(); expect(log.read()).toEqual([]);
        view.rerender(wrap(<Month {...moving(log, [pending(id)])}/>, strict));
        expect(live.read()).toEqual(['main polite: Move of Alpha is pending']);
        expect(move().isPending('a')).toBe(true); expect(row('a')).toHaveAttribute('data-pending', 'true');
        expect(row('a')!.querySelector('.nc-agenda-details')!.textContent).toMatch(/^Move pending · \S/);
        expect(startDraft('a')).toBeNull(); expect(log.read()).toEqual([]);
        view.rerender(wrap(<Month {...moving(log, [pending(id)])}/>, strict));
        expect(live.read()).toEqual([]);
        view.rerender(wrap(<Month {...moving(log, [rejected(id, 'Slot taken')])}/>, strict));
        expect(live.read()).toEqual(['main urgent: Move of Alpha rejected: Slot taken']);
        // The package changes nothing in items: the item stays where the props put it.
        expect(row('a')).not.toBeNull(); expect(dataModel().visible.get('a')!.item).toBe(alpha);
        expect(move().isPending('a')).toBe(false); expect(move().isBlocked('a')).toBe(false); expect(row('a')).not.toHaveAttribute('data-pending');
        act(() => { vi.advanceTimersByTime(60 * 60 * 1000); });
        view.rerender(wrap(<Month {...moving(log, [rejected(id, 'Slot taken')])}/>, strict));
        expect(live.read()).toEqual([]); expect(moveWarnings()).toEqual([]); expect(log.read()).toEqual([]);
        expect(startDraft('a')).not.toBeNull(); expect(log.read()).toEqual(['draft:a']);
    });
});

describe('the title snapshot of a request', () => {
    it('is taken before onItemMoveRequest; a later title does not change it, and a blank one speaks the current untitled label', () => {
        const blank: CalendarItem = {...alpha, id: 'blank', title: ' '};
        const log = recorder(), props = (states: readonly CalendarMoveState[], overrides: Options = {}) => moving(log, states, {items: [alpha, blank], ...overrides});
        const view = render(<Month {...props([])}/>);
        const [named, untitled] = [submitMove('a'), submitMove('blank')];
        view.rerender(<Month {...props([pending(named), pending(untitled, 'blank')], {items: [{...alpha, title: 'Renamed'}, {...blank, title: 'Later title'}],
            messages: {untitledItemLabel: 'No name'}})}/>);
        expect(live.read()).toEqual(['main polite: Move of Alpha is pending Move of No name is pending']);
    });
});

/** A synchronous external store, as a consumer with a state library would keep items and move states. */
function createStore<T>(initial: T) {
    let state = initial;
    const listeners = new Set<() => void>();
    return {get: () => state, subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
        set(next: Partial<T>) { state = {...state, ...next}; for (const listener of [...listeners]) listener(); }};
}

describe('scenario 2: variants of the result', () => {
    it('a synchronous succeeded published inside onItemMoveRequest (flushSync): one success announcement, no pending announcement', () => {
        const log = recorder(), store = createStore<{states: readonly CalendarMoveState[]}>({states: []});
        function Consumer() {
            const {states} = useSyncExternalStore(store.subscribe, store.get);
            return <Month {...moving(log, states, {onItemMoveRequest: (request: CalendarMoveRequest) => {
                log.request(request);
                flushSync(() => store.set({states: [succeeded(request.requestId)]}));
                // The registry entry was written before the call, so the flushed commit already accepted the terminal.
                log.events.push(`blocked:${move().isBlocked('a')}`);
            }})}/>;
        }
        render(<StrictMode><Consumer/></StrictMode>);
        submitMove('a');
        expect(log.read()).toEqual(['draft:a', 'request:a', 'blocked:false', 'draft:null']);
        expect(live.read()).toEqual(['main polite: Alpha moved']); expect(moveWarnings()).toEqual([]);
    });
    it('optimistic items with pending, then rolled-back items with rejected in one update: every step renders exactly the props', () => {
        const log = recorder(), view = render(<Month {...moving(log)}/>);
        const id = submitMove('a');
        const moved = {...alpha, interval: {kind: 'allDay' as const, start: '2026-09-05', end: '2026-09-06'}};
        view.rerender(<Month {...moving(log, [pending(id)], {items: [moved, beta]})}/>);
        expect(row('a')).toBeNull(); expect(dataModel().visible.get('a')!.item).toBe(moved); expect(move().isPending('a')).toBe(true);
        view.rerender(<Month {...moving(log, [rejected(id, 'Conflict')], {items: [alpha, beta]})}/>);
        expect(row('a')).not.toHaveAttribute('data-pending'); expect(dataModel().visible.get('a')!.item).toBe(alpha);
        expect(live.read()).toEqual(['main polite: Move of Alpha is pending', 'main urgent: Move of Alpha rejected: Conflict']);
    });
    it('succeeded with a server-normalized interval shows the normalized interval, never the proposal', () => {
        const log = recorder(), view = render(<Month {...moving(log, [], {agendaDate: '2026-09-07'})}/>);
        const id = submitMove('a', '2026-09-05');
        const normalized = {...alpha, interval: {kind: 'allDay' as const, start: '2026-09-07', end: '2026-09-08'}};
        view.rerender(<Month {...moving(log, [succeeded(id)], {items: [normalized, beta], agendaDate: '2026-09-07'})}/>);
        expect(row('a')).not.toBeNull(); expect(dataModel().visible.get('a')!.interval).toMatchObject({start: '2026-09-07'});
        expect(live.read()).toEqual(['main polite: Alpha moved']);
    });
});

describe.each([false, true])('scenario 3: no acknowledgement (StrictMode %s)', strict => {
    it('stays unacknowledged and blocked through unrelated commits; a late pending and its terminal are announced once each', () => {
        vi.useFakeTimers();
        const log = recorder(), view = render(wrap(<Month {...moving(log)}/>, strict));
        const id = submitMove('a');
        log.read();
        for (const overrides of [{today: '2026-09-16'}, {agendaDate: '2026-09-04'}, {items: [alpha, beta]}, {dataState: {status: 'loading', phase: 'refresh'}}, {dataState: {status: 'ready'}}]) {
            act(() => { vi.advanceTimersByTime(24 * 60 * 60 * 1000); });
            view.rerender(wrap(<Month {...moving(log, [], overrides)}/>, strict));
            expect(move().isPending('a')).toBe(false); expect(move().isBlocked('a')).toBe(true);
        }
        expect(live.read()).toEqual(['main polite: Calendar refreshed']); expect(moveWarnings()).toEqual([]);
        view.rerender(wrap(<Month {...moving(log, [pending(id)])}/>, strict));
        view.rerender(wrap(<Month {...moving(log, [pending(id)])}/>, strict));
        expect(live.read()).toEqual(['main polite: Move of Alpha is pending']); expect(move().isBlocked('a')).toBe(true);
        view.rerender(wrap(<Month {...moving(log, [succeeded(id)])}/>, strict));
        view.rerender(wrap(<Month {...moving(log, [])}/>, strict));
        expect(live.read()).toEqual(['main polite: Alpha moved']); expect(move().isBlocked('a')).toBe(false);
        expect(moveWarnings()).toEqual([]); expect(log.read()).toEqual([]);
    });
    it('a first reply that is already terminal is announced once, without a pending announcement', () => {
        const log = recorder(), view = render(wrap(<Month {...moving(log)}/>, strict));
        const id = submitMove('a');
        view.rerender(wrap(<Month {...moving(log, [rejected(id, 'No room')])}/>, strict));
        view.rerender(wrap(<Month {...moving(log, [rejected(id, 'No room')])}/>, strict));
        expect(live.read()).toEqual(['main urgent: Move of Alpha rejected: No room']); expect(move().isBlocked('a')).toBe(false);
    });
    it('an unmount before any reply warns nothing and announces nothing afterwards', () => {
        vi.useFakeTimers();
        const log = recorder(), view = render(wrap(<Month {...moving(log)}/>, strict));
        submitMove('a');
        log.read();
        view.unmount();
        act(() => { vi.advanceTimersByTime(24 * 60 * 60 * 1000); });
        expect(live.read()).toEqual([]); expect(moveWarnings()).toEqual([]); expect(log.read()).toEqual([]);
    });
});

describe('scenario 4: shared states, roots and remounts', () => {
    function Pair({states, log, items}: {states: readonly CalendarMoveState[]; log: Recorder; items?: readonly CalendarItem[]}) {
        return <><Month {...moving(log, states, {id: 'first', ...items ? {items} : {}})} name="first"/>
            <Month {...moving(log, states, {id: 'second', ...items ? {items} : {}})} name="second"/></>;
    }
    it('an external pending blocks the item in both Calendars; only the issuer announces; IDs differ', () => {
        const log = recorder(), view = render(<StrictMode><Pair states={[]} log={log}/></StrictMode>);
        const first = submitMove('a', '2026-09-05', 'first'), second = submitMove('b', '2026-09-06', 'second');
        expect(first).not.toBe(second); expect([first, second].every(value => v4.test(value))).toBe(true);
        view.rerender(<StrictMode><Pair states={[pending(first), pending(second, 'b')]} log={log}/></StrictMode>);
        expect(live.read()).toEqual(['first polite: Move of Alpha is pending', 'second polite: Move of Beta is pending']);
        for (const name of ['first', 'second']) {
            expect(move(name).isPending('a')).toBe(true); expect(move(name).isBlocked('a')).toBe(true);
            expect(startDraft('a', name)).toBeNull();
        }
        view.rerender(<StrictMode><Pair states={[succeeded(first), rejected(second, 'Locked', 'b')]} log={log}/></StrictMode>);
        expect(live.read()).toEqual(['first polite: Alpha moved', 'second urgent: Move of Beta rejected: Locked']);
    });
    it('two React roots sharing one store: each mount has its own registry, warnings and announcements', () => {
        const log = recorder(), store = createStore<{states: readonly CalendarMoveState[]}>({states: []});
        function Shared({name}: {name: string}) {
            const {states} = useSyncExternalStore(store.subscribe, store.get);
            return <Month {...moving(log, states, {id: name})} name={name}/>;
        }
        const containers = ['one', 'two'].map(() => document.body.appendChild(document.createElement('div')));
        const roots = containers.map(container => createRoot(container));
        try {
            act(() => { roots[0].render(<StrictMode><Shared name="one"/></StrictMode>); roots[1].render(<StrictMode><Shared name="two"/></StrictMode>); });
            // A collision: both instances submit a move of the same item before either sees a committed pending.
            const one = submitMove('a', '2026-09-05', 'one'), two = submitMove('a', '2026-09-07', 'two');
            expect(one).not.toBe(two);
            act(() => store.set({states: [pending(one), pending(two)]}));
            expect(live.read()).toEqual(['one polite: Move of Alpha is pending', 'two polite: Move of Alpha is pending']);
            expect(move('one').isPending('a')).toBe(true); expect(move('two').isPending('a')).toBe(true);
            // The consumer settles it by request ID: at most one succeeds. Each instance speaks only for its own request.
            act(() => store.set({states: [succeeded(one), rejected(two, 'Moved elsewhere')]}));
            expect(live.read()).toEqual(['one polite: Alpha moved', 'two urgent: Move of Alpha rejected: Moved elsewhere']);
            expect(moveWarnings()).toEqual([]);
            // Warnings are per instance too: the same invalid record warns once in each Calendar.
            act(() => store.set({states: [{requestId: 'bad', itemId: 'a', status: 'moved'} as unknown as CalendarMoveState]}));
            act(() => store.set({states: [{requestId: 'bad', itemId: 'a', status: 'moved'} as unknown as CalendarMoveState]}));
            expect(moveWarnings()).toEqual([`${prefix.replace(': ', '[0]: ')}Invalid move state or issuer itemId mismatch`,
                `${prefix.replace(': ', '[0]: ')}Invalid move state or issuer itemId mismatch`]);
        } finally { act(() => roots.forEach(root => root.unmount())); containers.forEach(container => container.remove()); }
    });
});

describe.each([false, true])('scenario 4: remounts and prefixed IDs (StrictMode %s)', strict => {
    it('after a remount an old terminal is external: not announced, and it never acknowledges a new request', () => {
        const log = recorder(), view = render(wrap(<Month {...moving(log)} key="first"/>, strict));
        const old = submitMove('a');
        expect(log.read()).toEqual(['draft:a', 'request:a', 'draft:null']);
        view.rerender(wrap(<Month {...moving(log, [succeeded(old)])} key="first"/>, strict));
        expect(live.read()).toEqual(['main polite: Alpha moved']);
        view.rerender(wrap(<Month {...moving(log, [succeeded(old)])} key="second"/>, strict));
        expect(live.read()).toEqual([]); expect(move().isBlocked('a')).toBe(false); expect(log.read()).toEqual([]);
        const fresh = submitMove('a');
        expect(fresh).not.toBe(old); expect(log.read()).toEqual(['draft:a', 'request:a', 'draft:null']);
        view.rerender(wrap(<Month {...moving(log, [succeeded(old)])} key="second"/>, strict));
        expect(live.read()).toEqual([]); expect(move().isBlocked('a')).toBe(true);
        view.rerender(wrap(<Month {...moving(log, [succeeded(old), succeeded(fresh)])} key="second"/>, strict));
        view.rerender(wrap(<Month {...moving(log, [succeeded(old), succeeded(fresh)])} key="second"/>, strict));
        expect(live.read()).toEqual(['main polite: Alpha moved']); expect(moveWarnings()).toEqual([]); expect(log.read()).toEqual([]);
    });
    it('a pending for tenant-a:42 does not block tenant-b:42', () => {
        const items = ['tenant-a:42', 'tenant-b:42'].map(id => ({...alpha, id, title: id}));
        const log = recorder(), states = [{requestId: 'elsewhere', itemId: 'tenant-a:42', status: 'pending'} as const];
        const view = render(wrap(<Month {...moving(log, states, {items})}/>, strict));
        expect(move().isBlocked('tenant-a:42')).toBe(true); expect(move().isBlocked('tenant-b:42')).toBe(false);
        expect(startDraft('tenant-a:42')).toBeNull(); expect(startDraft('tenant-b:42')).not.toBeNull();
        expect(log.read()).toEqual(['draft:tenant-b:42']);
        // The external pending stays silent here, and the open draft of tenant-b:42 is not cancelled by it.
        view.rerender(wrap(<Month {...moving(log, states, {items})}/>, strict));
        expect(log.read()).toEqual([]); expect(move().draft?.itemId).toBe('tenant-b:42');
        expect(live.read()).toEqual([]); expect(moveWarnings()).toEqual([]);
    });
});

describe.each([false, true])('scenario 5: the handoff with a synchronous store, range eviction and reentrant unmount (StrictMode %s)', strict => {
    type State = {anchorDate: string; range: {start: string; end: string} | null; draft: string | null; requests: ReadonlySet<string>; mounted: boolean};
    /** A consumer that loads by visible range and keeps only retained items outside it, as the retention contract asks. */
    function setup(onRequest?: (store: ReturnType<typeof createStore<State>>, request: CalendarMoveRequest) => void) {
        const log = recorder(), domain = [alpha, beta], store = createStore<State>({anchorDate: '2026-09-01', range: null, draft: null, requests: new Set(), mounted: true});
        const present: string[] = [];
        const items = (state: State) => domain.filter(item => state.draft === item.id || state.requests.has(item.id)
            || !state.range || item.interval.kind === 'allDay' && item.interval.start >= state.range.start && item.interval.start < state.range.end
            || item.interval.kind === 'timed' && item.interval.start.slice(0, 10) >= state.range.start && item.interval.start.slice(0, 10) < state.range.end);
        const note = (label: string) => present.push(`${label}:${items(store.get()).some(item => item.id === 'a')}`);
        function Consumer() {
            const state = useSyncExternalStore(store.subscribe, store.get);
            if (!state.mounted) return null;
            return <Month {...moving(log, [], {items: items(state), anchorDate: state.anchorDate, agendaDate: undefined, onAgendaDateChange: undefined,
                onVisibleRangeChange: (range: {start: string; end: string}) => store.set({range: {start: range.start, end: range.end}}),
                onNavigate: (date: string) => { log.navigate(date); store.set({anchorDate: date}); },
                onItemMoveDraftChange: (itemId: string | null) => { log.draft(itemId); note(`draft:${itemId}`); store.set({draft: itemId}); },
                onItemMoveRequest: (request: CalendarMoveRequest) => {
                    log.request(request); note('request');
                    // Retention moves from the draft to the request record in the same call.
                    store.set({requests: new Set([...store.get().requests, request.item.id])});
                    onRequest?.(store, request);
                    // After the consumer's body: a null logged before this was sent while the request was on the stack.
                    log.events.push('request-returned');
                }})}/>;
        }
        const view = render(wrap(<Consumer/>, strict));
        return {log, store, present, items, view};
    }
    it('request, then null; the item stays in the store at every callback and the null releases only the draft retention', () => {
        const {log, store, present, items} = setup();
        let draft: MoveDraft | null = null;
        // The draft starts before the navigation it causes, so the item is retained while its month leaves the range.
        act(() => { draft = move().startDraft('a'); controllers.get('main')!.navigateMonth(1); });
        expect(log.read()).toEqual(['draft:a', 'navigate:2026-10-01']);
        expect(items(store.get()).map(item => item.id)).toEqual(['a']);
        act(() => { move().submit(proposal(draft!, '2026-10-05')); });
        expect(log.read()).toEqual(['request:a', 'request-returned', 'draft:null']);
        expect(present).toEqual(['draft:a:true', 'request:true', 'draft:null:true']);
        expect(store.get()).toMatchObject({draft: null}); expect(items(store.get()).map(item => item.id)).toEqual(['a']);
        expect(move().isBlocked('a')).toBe(true);
    });
    it('the null arrives exactly once when onItemMoveRequest unmounts the Calendar through flushSync', () => {
        const {log} = setup(store => { flushSync(() => store.set({mounted: false})); });
        submitMove('a');
        // The unmount inside the request sees the handoff and leaves the null to submit's finally, after the request returned.
        expect(log.read()).toEqual(['draft:a', 'request:a', 'request-returned', 'draft:null']);
        expect(document.querySelector('.nc-calendar')).toBeNull(); expect(live.read()).toEqual([]); expect(moveWarnings()).toEqual([]);
    });
    it('inside onItemMoveRequest a new draft and a second submit are refused; the one null still follows the request', () => {
        const nested: string[] = [];
        let other: ReturnType<typeof proposal> | null = null;
        const {log, view} = setup(() => {
            nested.push(`start:${move().startDraft('b') === null ? 'refused' : 'opened'}`, `submit:${move().submit(other!)}`);
        });
        act(() => {
            // A valid proposal of another, unblocked item: only the missing open draft refuses it inside the request.
            other = proposal(startMoveDraft(dataModel().visible.get('b')!, 'UTC', {kind: 'start'}), '2026-09-06');
            move().submit(proposal(move().startDraft('a')!, '2026-09-05'));
        });
        expect(nested).toEqual(['start:refused', 'submit:null']);
        expect(log.read()).toEqual(['draft:a', 'request:a', 'request-returned', 'draft:null']); expect(log.request).toHaveBeenCalledTimes(1);
        expect(move().draft).toBeNull(); expect(move().isBlocked('b')).toBe(false);
        // Nothing is left open or owed: the unmount sends nothing, and b can start a draft as usual before it.
        expect(startDraft('b')).not.toBeNull(); act(() => { move().endDraft('cancel'); });
        view.unmount();
        expect(log.read()).toEqual(['draft:b', 'draft:null']);
    });
    it('decision Q6: a throwing onItemMoveRequest still sends one null, propagates the same error and keeps the request blocked', () => {
        const error = new Error('Store failed');
        const {log, view} = setup(() => { throw error; });
        let draft: MoveDraft | null = null;
        act(() => { draft = move().startDraft('a'); });
        let thrown: unknown;
        try { act(() => { move().submit(proposal(draft!, '2026-09-05')); }); } catch (caught) { thrown = caught; }
        expect(thrown).toBe(error); settle();
        expect(log.read()).toEqual(['draft:a', 'request:a', 'draft:null']);
        expect(move().isBlocked('a')).toBe(true); expect(live.read()).toEqual([]); expect(moveWarnings()).toEqual([]);
        view.unmount();
        expect(log.read()).toEqual([]);
    });
});

describe('decision Q6 and Q7 through the plain Month', () => {
    it('Q6: a later pending → succeeded of a request whose callback threw is accepted and announced normally', () => {
        const error = new Error('Handler failed'), log = recorder();
        const props = (states: readonly CalendarMoveState[]) => moving(log, states, {onItemMoveRequest: (request: CalendarMoveRequest) => { log.request(request); throw error; }});
        const view = render(<Month {...props([])}/>);
        const draft = startDraft('a')!;
        expect(() => act(() => { move().submit(proposal(draft, '2026-09-05')); })).toThrow(error);
        settle();
        const id = log.requests[0].requestId;
        expect(log.read()).toEqual(['draft:a', 'request:a', 'draft:null']); expect(move().isBlocked('a')).toBe(true);
        view.rerender(<Month {...props([pending(id)])}/>); view.rerender(<Month {...props([succeeded(id)])}/>);
        expect(live.read()).toEqual(['main polite: Move of Alpha is pending', 'main polite: Alpha moved']); expect(move().isBlocked('a')).toBe(false);
    });
    it('Q7: without Web Crypto submit throws the same Error in development and production, after the one null; nothing is registered', () => {
        for (const environment of ['development', 'production']) {
            vi.stubEnv('NODE_ENV', environment);
            const log = recorder(), view = render(<Month {...moving(log)}/>);
            const draft = startDraft('a')!;
            log.read();
            vi.stubGlobal('crypto', undefined);
            expect(() => act(() => { move().submit(proposal(draft, '2026-09-05')); })).toThrow(new Error(missingCryptoMessage));
            vi.unstubAllGlobals(); settle();
            expect(log.read()).toEqual(['draft:null']); expect(log.request).not.toHaveBeenCalled();
            expect(move().isBlocked('a')).toBe(false); expect(move().draft).toBeNull();
            view.unmount();
        }
    });
    it('Q7: with only getRandomValues every ID is a UUID v4', () => {
        const getRandomValues = globalThis.crypto.getRandomValues.bind(globalThis.crypto);
        vi.stubGlobal('crypto', {getRandomValues});
        const items = Array.from({length: 12}, (_, index) => ({...alpha, id: `item-${index}`, title: `Item ${index}`}));
        const log = recorder();
        render(<Month {...moving(log, [], {items})}/>);
        const ids = items.map(item => submitMove(item.id));
        expect(new Set(ids).size).toBe(ids.length); for (const id of ids) expect(id).toMatch(v4);
    });
});

describe('scenario 6: invalid records of an issued request', () => {
    it('after pending → succeeded → absent, a reused ID is excluded with a warning; production renders the same with no console output', () => {
        for (const environment of ['development', 'production']) {
            vi.stubEnv('NODE_ENV', environment); warn.mockClear();
            const log = recorder(), view = render(<Month {...moving(log)}/>);
            const id = submitMove('a');
            for (const states of [[pending(id)], [succeeded(id)], []]) view.rerender(<Month {...moving(log, states)}/>);
            expect(live.read()).toEqual(['main polite: Move of Alpha is pending', 'main polite: Alpha moved']);
            for (const record of [pending(id), rejected(id, 'Late'), succeeded(id)]) {
                view.rerender(<Month {...moving(log, [record])}/>);
                expect(move().isPending('a')).toBe(false); expect(move().isBlocked('a')).toBe(false); expect(row('a')).not.toHaveAttribute('data-pending');
            }
            expect(live.read()).toEqual([]);
            expect(moveWarnings()).toEqual(environment === 'production' ? [] : [
                `${prefix}request ${id} was removed after it succeeded; a reused pending record is ignored`,
                `${prefix}request ${id} was removed after it succeeded; a reused rejected (Late) record is ignored`,
                `${prefix}request ${id} was removed after it succeeded; a reused succeeded record is ignored`]);
            view.unmount();
        }
    });
    it('a present terminal followed by pending, another status and another reason: each excluded once, no isPending, block or announcement', () => {
        const log = recorder(), view = render(<Month {...moving(log)}/>);
        const id = submitMove('a');
        view.rerender(<Month {...moving(log, [rejected(id, 'Busy')])}/>);
        expect(live.read()).toEqual(['main urgent: Move of Alpha rejected: Busy']);
        for (const record of [pending(id), succeeded(id), rejected(id, 'Later'), pending(id), rejected(id, 'Busy')]) {
            view.rerender(<Month {...moving(log, [record])}/>);
            expect(move().isPending('a')).toBe(false); expect(move().isBlocked('a')).toBe(false);
        }
        expect(live.read()).toEqual([]);
        expect(moveWarnings()).toEqual([
            `${prefix}request ${id} already rejected (Busy); a later pending record is ignored`,
            `${prefix}request ${id} already rejected (Busy); a later succeeded record is ignored`,
            `${prefix}request ${id} already rejected (Busy); a later rejected (Later) record is ignored`]);
    });
    it('pending → absent warns once, isPending false, and the item stays blocked until a terminal, which is announced once', () => {
        const log = recorder(), view = render(<Month {...moving(log)}/>);
        const id = submitMove('a');
        view.rerender(<Month {...moving(log, [pending(id)])}/>); view.rerender(<Month {...moving(log, [])}/>); view.rerender(<Month {...moving(log, [])}/>);
        expect(moveWarnings()).toEqual([`${prefix}request ${id} has no valid pending record before a terminal; isPending is false and the item stays blocked until a terminal`]);
        expect(move().isPending('a')).toBe(false); expect(move().isBlocked('a')).toBe(true); expect(startDraft('a')).toBeNull();
        view.rerender(<Month {...moving(log, [succeeded(id)])}/>);
        expect(live.read()).toEqual(['main polite: Move of Alpha is pending', 'main polite: Alpha moved']); expect(move().isBlocked('a')).toBe(false);
    });
    it('two different invalid records published one after the other at the same index each warn once', () => {
        const log = recorder(), view = render(<Month {...moving(log)}/>);
        const id = submitMove('a');
        const mismatch = {requestId: id, itemId: 'b', status: 'pending'} as const, unknown = {requestId: 'x', itemId: 'a', status: 'moved'};
        for (const record of [mismatch, unknown, mismatch, unknown]) view.rerender(<Month {...moving(log, [record as CalendarMoveState])}/>);
        expect(moveWarnings()).toEqual([`${prefix.replace(': ', '[0]: ')}Invalid move state or issuer itemId mismatch`,
            `${prefix.replace(': ', '[0]: ')}Invalid move state or issuer itemId mismatch`]);
        // The mismatched record never acknowledged the request.
        expect(move().isBlocked('a')).toBe(true); expect(move().isPending('b')).toBe(false); expect(live.read()).toEqual([]);
    });
    it('decision Q1: pending → [] → pending → succeeded', () => {
        const log = recorder(), view = render(<Month {...moving(log)}/>);
        const id = submitMove('a'), states: CalendarMoveState[][] = [[pending(id)], [], [pending(id)], [succeeded(id)], [succeeded(id)]];
        const observed = states.map(snapshot => { view.rerender(<Month {...moving(log, snapshot)}/>); return [move().isPending('a'), move().isBlocked('a')]; });
        expect(observed).toEqual([[true, true], [false, true], [true, true], [false, false], [false, false]]);
        expect(live.read()).toEqual(['main polite: Move of Alpha is pending', 'main polite: Alpha moved']);
        expect(moveWarnings()).toEqual([`${prefix}request ${id} has no valid pending record before a terminal; isPending is false and the item stays blocked until a terminal`,
            `${prefix}request ${id}: pending re-added after it was removed before a terminal`]);
    });
    it('decision Q2: pending → a blank rejected reason → Busy', () => {
        const log = recorder(), view = render(<Month {...moving(log)}/>);
        const id = submitMove('a');
        view.rerender(<Month {...moving(log, [pending(id)])}/>); live.read();
        view.rerender(<Month {...moving(log, [rejected(id, ' ')])}/>);
        expect(move().isPending('a')).toBe(false); expect(move().isBlocked('a')).toBe(true); expect(live.read()).toEqual([]);
        view.rerender(<Month {...moving(log, [rejected(id, 'Busy')])}/>);
        expect(live.read()).toEqual(['main urgent: Move of Alpha rejected: Busy']); expect(move().isBlocked('a')).toBe(false);
        expect(moveWarnings()).toEqual([`${prefix.replace(': ', '[0]: ')}Invalid move state or issuer itemId mismatch`,
            `${prefix}request ${id} has no valid pending record before a terminal; isPending is false and the item stays blocked until a terminal`]);
    });
});

describe('scenario 7: bookkeeping survives UI and prop changes (decision Q3)', () => {
    const changes: [string, Options][] = [['loading/initial', {dataState: {status: 'loading', phase: 'initial'}}], ['error/initial', {dataState: {status: 'error', phase: 'initial', error: 1}}],
        ['a contract error', {anchorDate: 'not a date'}], ['a time-zone change', {timeZone: 'Europe/Berlin'}], ['the move pair removed', {itemMoveStates: undefined, onItemMoveRequest: undefined, onItemMoveDraftChange: undefined}]];
    it.each(changes)('an unfinished request stays blocked across %s; the same pending returns silently', (_label, change) => {
        const log = recorder(), view = render(<StrictMode><Month {...moving(log)}/></StrictMode>);
        const id = submitMove('a');
        view.rerender(<StrictMode><Month {...moving(log, [pending(id)])}/></StrictMode>); live.read();
        // A UI cancellation of another item's draft does not touch the registry either.
        startDraft('b'); act(() => { move().endDraft('cancel'); }); log.read();
        view.rerender(<StrictMode><Month {...moving(log, [pending(id)], change)}/></StrictMode>);
        expect(log.read()).toEqual([]);
        view.rerender(<StrictMode><Month {...moving(log, [pending(id)])}/></StrictMode>);
        expect(move().isPending('a')).toBe(true); expect(move().isBlocked('a')).toBe(true);
        expect(live.read().filter(entry => entry.includes('Alpha'))).toEqual([]); expect(moveWarnings()).toEqual([]);
        view.rerender(<StrictMode><Month {...moving(log, [rejected(id, 'No')])}/></StrictMode>);
        expect(live.read()).toEqual(['main urgent: Move of Alpha rejected: No']);
    });
    it.each(changes)('an announced terminal is not repeated across %s; terminal → pending stays excluded with one warning', (_label, change) => {
        const log = recorder(), view = render(<StrictMode><Month {...moving(log)}/></StrictMode>);
        const id = submitMove('a');
        view.rerender(<StrictMode><Month {...moving(log, [succeeded(id)])}/></StrictMode>); live.read();
        view.rerender(<StrictMode><Month {...moving(log, [succeeded(id)], change)}/></StrictMode>);
        view.rerender(<StrictMode><Month {...moving(log, [succeeded(id)])}/></StrictMode>);
        expect(live.read().filter(entry => entry.includes('Alpha'))).toEqual([]); expect(moveWarnings()).toEqual([]);
        view.rerender(<StrictMode><Month {...moving(log, [pending(id)])}/></StrictMode>);
        view.rerender(<StrictMode><Month {...moving(log, [pending(id)])}/></StrictMode>);
        expect(move().isPending('a')).toBe(false); expect(move().isBlocked('a')).toBe(false);
        expect(moveWarnings()).toEqual([`${prefix}request ${id} already succeeded; a later pending record is ignored`]);
    });
    it('a tombstone survives a pair round trip; a terminal present only while paused is never seen, and a pending gone during a pause warns once', () => {
        const log = recorder(), view = render(<Month {...moving(log)}/>);
        const [first, second] = [submitMove('a'), submitMove('b')];
        view.rerender(<Month {...moving(log, [succeeded(first), pending(second, 'b')])}/>);
        view.rerender(<Month {...moving(log, [pending(second, 'b')])}/>); live.read();
        const off = {itemMoveStates: undefined, onItemMoveRequest: undefined, onItemMoveDraftChange: undefined};
        view.rerender(<Month {...moving(log, [], off)}/>);
        expect(move().isPending('b')).toBe(false);
        view.rerender(<Month {...moving(log, [succeeded(first)])}/>);
        expect(moveWarnings()).toEqual([`${prefix}request ${first} was removed after it succeeded; a reused succeeded record is ignored`,
            `${prefix}request ${second} has no valid pending record before a terminal; isPending is false and the item stays blocked until a terminal`]);
        expect(move().isBlocked('b')).toBe(true); expect(live.read()).toEqual([]);
        // A new mount inherits nothing: both IDs are external there.
        view.rerender(<Month {...moving(log, [succeeded(first), pending(second, 'b')])} key="new"/>);
        expect(move().isBlocked('a')).toBe(false); expect(move().isPending('b')).toBe(true); expect(live.read()).toEqual([]);
    });
    it('a contract error announces nothing; a terminal still present once the props are fixed is announced then, once', () => {
        const log = recorder(), view = render(<Month {...moving(log)}/>);
        const id = submitMove('a');
        view.rerender(<Month {...moving(log, [succeeded(id)], {anchorDate: 'bad'})}/>);
        view.rerender(<Month {...moving(log, [succeeded(id)], {anchorDate: 'worse'})}/>);
        expect(live.read()).toEqual(['main urgent: Calendar cannot be displayed: invalid configuration']);
        view.rerender(<Month {...moving(log, [succeeded(id)])}/>);
        view.rerender(<Month {...moving(log, [succeeded(id)])}/>);
        expect(live.read()).toEqual(['main polite: Alpha moved']);
    });
    it('a blocking data state announces results as usual, once, through the root channels', () => {
        const log = recorder(), view = render(<Month {...moving(log)}/>);
        const id = submitMove('a');
        view.rerender(<Month {...moving(log, [], {dataState: {status: 'loading', phase: 'initial'}})}/>); live.read();
        view.rerender(<Month {...moving(log, [pending(id)], {dataState: {status: 'loading', phase: 'initial'}})}/>);
        view.rerender(<Month {...moving(log, [rejected(id, 'Gone')], {dataState: {status: 'loading', phase: 'initial'}})}/>);
        expect(live.read()).toEqual(['main polite: Move of Alpha is pending', 'main urgent: Move of Alpha rejected: Gone']);
    });
});

describe.each([false, true])('scenario 8: the draft retention lifecycle (StrictMode %s)', strict => {
    const draw = (node: ReactNode) => wrap(node, strict);
    it('only the identity that received the ID gets its null; a new identity gets nothing retroactive, and a removed prop still gets its null', () => {
        const first = recorder(), second = recorder(), view = render(draw(<Month {...moving(first)}/>));
        startDraft('a');
        view.rerender(draw(<Month {...moving(first, [], {onItemMoveDraftChange: second.draft})}/>));
        expect(second.read()).toEqual([]);
        act(() => { move().endDraft('cancel'); });
        expect(first.read()).toEqual(['draft:a', 'draft:null']); expect(second.read()).toEqual([]);
        // The new identity applies from the next draft only.
        startDraft('a'); expect(second.read()).toEqual(['draft:a']);
        view.rerender(draw(<Month {...moving(first, [], {onItemMoveDraftChange: undefined})}/>));
        act(() => { move().endDraft('noop'); });
        expect(second.read()).toEqual(['draft:null']); expect(first.read()).toEqual([]);
        // Without the callback at draft start nothing is owed.
        startDraft('a'); act(() => { move().endDraft('invalid'); }); view.unmount();
        expect([...first.read(), ...second.read()]).toEqual([]);
    });
    it('removing the pair ends the draft with one null after the commit; re-adding restores nothing and calls nothing', () => {
        const log = recorder(), view = render(draw(<Month {...moving(log)}/>));
        startDraft('a'); log.read();
        view.rerender(draw(<Month {...moving(log, [], {itemMoveStates: undefined, onItemMoveRequest: undefined, onItemMoveDraftChange: undefined})}/>));
        expect(log.read()).toEqual(['draft:null']);
        view.rerender(draw(<Month {...moving(log)}/>));
        expect(log.read()).toEqual([]); expect(move().draft).toBeNull(); expect(live.read()).toEqual([]);
    });
    it('a blocking loading/initial ends the draft with one null after the commit, none during render', () => {
        const log = recorder(), committed: boolean[] = [];
        const props = (overrides: Options = {}) => moving(log, [], {onItemMoveDraftChange: (itemId: string | null) => {
            log.draft(itemId); committed.push(!!document.querySelector('.nc-calendar[data-status="loading"]'));
        }, ...overrides});
        const view = render(draw(<Month {...props()}/>));
        startDraft('a'); log.read(); committed.length = 0;
        view.rerender(draw(<Month {...props({dataState: {status: 'loading', phase: 'initial'}})}/>));
        expect(log.read()).toEqual(['draft:null']); expect(committed).toEqual([true]);
        view.rerender(draw(<Month {...props()}/>)); expect(log.read()).toEqual([]);
        expect(live.read()).toEqual(['main polite: Loading calendar']);
    });
    it('a contract-invalid configuration sends one null, then nothing on repeated invalid renders or after the fix', () => {
        const log = recorder(), view = render(draw(<Month {...moving(log)}/>));
        startDraft('a'); log.read();
        for (const anchorDate of ['bad', 'worse']) view.rerender(draw(<Month {...moving(log, [], {anchorDate})}/>));
        expect(log.read()).toEqual(['draft:null']);
        view.rerender(draw(<Month {...moving(log)}/>));
        expect(log.read()).toEqual([]); expect(move().draft).toBeNull(); expect(log.request).not.toHaveBeenCalled();
    });
    it('the draft starts before the navigation it causes', () => {
        const log = recorder();
        render(draw(<Month {...moving(log)}/>));
        act(() => { move().startDraft('a'); controllers.get('main')!.navigateMonth(1); });
        expect(log.read()).toEqual(['draft:a', 'navigate:2026-10-01']);
    });
    it('a submit without an open draft of the item is refused: a draft an interval change cancelled stays cancelled', () => {
        const log = recorder(), view = render(draw(<Month {...moving(log)}/>));
        const draft = startDraft('a')!, stale = proposal(draft, '2026-09-05');
        const changed = {...alpha, interval: {kind: 'allDay' as const, start: '2026-09-04', end: '2026-09-05'}};
        view.rerender(draw(<Month {...moving(log, [], {items: [changed, beta]})}/>));
        expect(log.read()).toEqual(['draft:a', 'draft:null']);
        expect(live.read()).toEqual(['main urgent: Move of Alpha cancelled: Event time has changed']);
        // The proposal of the cancelled draft; one built from the current item with no draft ever started (so no draft ID was
        // published for the consumer to retain); one for an item while another item's draft is open.
        const draftless = proposal(startMoveDraft(dataModel().visible.get('a')!, 'UTC', {kind: 'start'}), '2026-09-06');
        const results: (string | null)[] = [];
        act(() => { results.push(move().submit(stale), move().submit(draftless)); });
        startDraft('b');
        act(() => { results.push(move().submit(draftless)); move().endDraft('cancel'); });
        expect(results).toEqual([null, null, null]); expect(log.request).not.toHaveBeenCalled();
        expect(log.read()).toEqual(['draft:b', 'draft:null']); expect(move().isBlocked('a')).toBe(false);
        expect(live.read()).toEqual([]); expect(moveWarnings()).toEqual([]);
        // A new draft of the changed item confirms as usual, with the latest item and interval.
        submitMove('a', '2026-09-06');
        expect(log.read()).toEqual(['draft:a', 'request:a', 'draft:null']);
        expect(log.requests).toHaveLength(1); expect(log.requests[0].item).toBe(changed); expect(log.requests[0].previousInterval).toBe(changed.interval);
    });
    it('a draft started inside onItemMoveRequest is refused, also when the handed-off draft owed no null', () => {
        const log = recorder(), nested: (MoveDraft | null)[] = [];
        const props = (onDraft?: (itemId: string | null) => void) => moving(log, [], {onItemMoveDraftChange: onDraft,
            onItemMoveRequest: (request: CalendarMoveRequest) => { log.request(request); nested.push(move().startDraft('b')); }});
        const view = render(draw(<Month {...props()}/>));
        const draft = startDraft('a')!;
        // A callback added mid-draft applies from the next draft only, so this handoff owes no null.
        view.rerender(draw(<Month {...props(log.draft)}/>));
        act(() => { move().submit(proposal(draft, '2026-09-05')); });
        expect(nested).toEqual([null]); expect(log.read()).toEqual(['request:a']); expect(move().draft).toBeNull();
        view.unmount();
        expect(log.read()).toEqual([]);
    });
    it('a draft open at unmount gets one null; a draft already handed off gets none from the unmount', () => {
        const log = recorder(), view = render(draw(<Month {...moving(log)}/>));
        startDraft('a'); view.unmount();
        expect(log.read()).toEqual(['draft:a', 'draft:null']);
        const next = render(draw(<Month {...moving(log)}/>));
        submitMove('a'); log.read(); next.unmount();
        expect(log.read()).toEqual([]);
    });
    it('decision Q5: a throwing onItemMoveDraftChange opens no draft, gets its one null and propagates the same error', () => {
        const error = new Error('Retention failed'), calls: (string | null)[] = [];
        const draft = vi.fn((itemId: string | null) => { calls.push(itemId); if (itemId !== null) throw error; });
        const log = recorder(), view = render(draw(<Month {...moving(log, [], {onItemMoveDraftChange: draft})}/>));
        expect(() => act(() => { move().startDraft('a'); })).toThrow(error);
        settle();
        expect(calls).toEqual(['a', null]); expect(draft).toHaveBeenCalledTimes(2);
        expect(move().draft).toBeNull(); expect(move().isBlocked('a')).toBe(false); expect(moveWarnings()).toEqual([]);
        view.unmount();
        expect(calls).toEqual(['a', null]); expect(log.request).not.toHaveBeenCalled();
    });
    it('decision Q5: an unmount inside the throwing call also yields exactly one null', () => {
        const error = new Error('Unmounted'), calls: (string | null)[] = [];
        function Host() {
            const [shown, setShown] = useState(true);
            return shown ? <Month {...moving(recorder(), [], {onItemMoveDraftChange: (itemId: string | null) => {
                calls.push(itemId);
                if (itemId !== null) { flushSync(() => setShown(false)); throw error; }
            }})}/> : null;
        }
        render(draw(<Host/>));
        expect(() => act(() => { move().startDraft('a'); })).toThrow(error);
        expect(calls).toEqual(['a', null]);
    });
});

describe('decision Q4: an observed pending cancels an open draft', () => {
    it('an external pending for the draft\'s item: one null, one urgent cancellation with the start title, no polite cancellation', () => {
        const log = recorder(), view = render(<StrictMode><Month {...moving(log)}/></StrictMode>);
        startDraft('a'); log.read();
        // The title changes after the draft started: the cancellation uses the draft-start snapshot.
        view.rerender(<StrictMode><Month {...moving(log, [pending('elsewhere')], {items: [{...alpha, title: 'Renamed'}, beta]})}/></StrictMode>);
        expect(log.read()).toEqual(['draft:null']);
        expect(live.read()).toEqual(['main urgent: Move of Alpha cancelled: Event is no longer available to move']);
        view.rerender(<StrictMode><Month {...moving(log, [pending('elsewhere')])}/></StrictMode>);
        expect(log.read()).toEqual([]); expect(live.read()).toEqual([]); expect(startDraft('a')).toBeNull();
    });
    it('with loading/initial in the same commit: one null and no cancellation text', () => {
        const log = recorder(), view = render(<Month {...moving(log)}/>);
        startDraft('a'); log.read();
        view.rerender(<Month {...moving(log, [pending('elsewhere')], {dataState: {status: 'loading', phase: 'initial'}})}/>);
        expect(log.read()).toEqual(['draft:null']); expect(live.read()).toEqual(['main polite: Loading calendar']);
    });
    it('with an interval change in the same commit: only moveItemChangedReason', () => {
        const log = recorder(), view = render(<Month {...moving(log)}/>);
        startDraft('a'); log.read();
        view.rerender(<Month {...moving(log, [pending('elsewhere')], {items: [{...alpha, interval: {kind: 'allDay', start: '2026-09-04', end: '2026-09-05'}}, beta]})}/>);
        expect(log.read()).toEqual(['draft:null']); expect(live.read()).toEqual(['main urgent: Move of Alpha cancelled: Event time has changed']);
    });
    it('#9 invalidations end the draft through the same path: removal, a time-zone change, a source filter', () => {
        for (const [change, text] of [[{items: [beta]}, 'Event is no longer available to move'], [{timeZone: 'Europe/Berlin'}, 'Calendar time zone has changed'],
            [{visibleSourceIds: [], onVisibleSourceIdsChange() {}, items: [alpha, beta]}, null]] as const) {
            const log = recorder(), view = render(<Month {...moving(log)}/>);
            const filtered = 'visibleSourceIds' in change;
            startDraft(filtered ? 'b' : 'a'); log.read();
            view.rerender(<Month {...moving(log, [], change as Options)}/>);
            expect(log.read()).toEqual(['draft:null']);
            expect(live.read()).toEqual([`main urgent: Move of ${filtered ? 'Beta' : 'Alpha'} cancelled: ${text ?? 'Event is no longer available to move'}`]);
            view.unmount();
        }
    });
});

describe('scenario 10: request IDs', () => {
    it('are UUID v4, distinct across many submits and instances, and created only at submit', async () => {
        const randomUUID = vi.spyOn(globalThis.crypto, 'randomUUID'), getRandomValues = vi.spyOn(globalThis.crypto, 'getRandomValues');
        vi.resetModules();
        const module = await import('../CalendarMonth.js');
        const items = Array.from({length: 10}, (_, index) => ({...alpha, id: `item-${index}`, title: `Item ${index}`}));
        const log = recorder(), props = moving(log, [], {items});
        renderToString(<module.CalendarMonth {...props}/>);
        const view = render(<StrictMode><Month {...props} name="one"/><Month {...props} name="two"/></StrictMode>);
        view.rerender(<StrictMode><Month {...props} name="one"/><Month {...props} name="two"/></StrictMode>);
        expect(randomUUID).not.toHaveBeenCalled(); expect(getRandomValues).not.toHaveBeenCalled();
        const ids = items.flatMap(item => [submitMove(item.id, '2026-09-05', 'one'), submitMove(item.id, '2026-09-06', 'two')]);
        expect(randomUUID).toHaveBeenCalledTimes(ids.length);
        expect(new Set(ids).size).toBe(20); for (const id of ids) expect(id).toMatch(v4);
    });
    it('without randomUUID (a non-secure page) the getRandomValues fallback still produces v4 IDs', () => {
        vi.stubGlobal('crypto', {getRandomValues: (bytes: Uint8Array) => bytes.map((_, index) => (index * 37 + 11) & 0xff)});
        const log = recorder();
        render(<Month {...moving(log)}/>);
        expect(submitMove('a')).toMatch(v4);
    });
});

describe('scenario 11: results with other live output (decision Q8)', () => {
    it('a success in the same commit as an accepted toolbar month change: one polite write with both', async () => {
        const user = userEvent.setup(), log = recorder(), view = render(<Month {...moving(log)}/>);
        const id = submitMove('a');
        await user.click(screen.getByRole('button', {name: 'Next month'}));
        live.read();
        view.rerender(<Month {...moving(log, [succeeded(id)], {anchorDate: '2026-10-01'})}/>);
        expect(live.read()).toEqual(['main polite: Showing October 2026 Alpha moved']);
    });
    it('a success with a refresh completion: one polite write; a later refresh still announces its completion', () => {
        const log = recorder(), view = render(<Month {...moving(log)}/>);
        const id = submitMove('a');
        view.rerender(<Month {...moving(log, [], {dataState: {status: 'loading', phase: 'refresh'}})}/>);
        view.rerender(<Month {...moving(log, [succeeded(id)], {dataState: {status: 'ready'}})}/>);
        expect(live.read()).toEqual(['main polite: Calendar refreshed Alpha moved']);
        view.rerender(<Month {...moving(log, [succeeded(id)], {dataState: {status: 'loading', phase: 'refresh'}})}/>);
        view.rerender(<Month {...moving(log, [succeeded(id)], {dataState: {status: 'ready'}})}/>);
        expect(live.read()).toEqual(['main polite: Calendar refreshed']);
    });
    it('a rejection with a polite message goes to urgent and leaves polite unchanged; with a data error polite gets the results', async () => {
        const user = userEvent.setup(), log = recorder(), view = render(<Month {...moving(log)}/>);
        const [first, second] = [submitMove('a'), submitMove('b')];
        await user.click(screen.getByRole('button', {name: 'Next month'}));
        live.read();
        view.rerender(<Month {...moving(log, [rejected(first, 'Busy')], {anchorDate: '2026-10-01'})}/>);
        expect(live.read()).toEqual(['main polite: Showing October 2026', 'main urgent: Move of Alpha rejected: Busy']);
        view.rerender(<Month {...moving(log, [rejected(first, 'Busy'), succeeded(second, 'b')], {anchorDate: '2026-10-01', dataState: {status: 'error', phase: 'refresh', error: 1}})}/>);
        expect(live.read()).toEqual(['main polite: Beta moved', 'main urgent: Could not load calendar']);
    });
    it('a success and a rejection of two requests in one commit: the success polite, the rejection urgent, each once, in issue order', () => {
        const log = recorder(), view = render(<Month {...moving(log)}/>);
        const [first, second] = [submitMove('a'), submitMove('b')];
        view.rerender(<Month {...moving(log, [rejected(second, 'Locked', 'b'), succeeded(first)])}/>);
        view.rerender(<Month {...moving(log, [rejected(second, 'Locked', 'b'), succeeded(first)])}/>);
        expect(live.read()).toEqual(['main polite: Alpha moved', 'main urgent: Move of Beta rejected: Locked']);
    });
    it('results owed while another Calendar\'s modal sheet is open are written once when it closes, in issue order, the overtaken pending dropped', async () => {
        const user = userEvent.setup(), log = recorder();
        const tree = (states: readonly CalendarMoveState[]) => <>
            <CalendarMonth {...base({id: 'other', layout: 'mobile', agendaPresentation: 'overlay', agendaDate: undefined, onAgendaDateChange: undefined})}/>
            <Month {...moving(log, states, {id: 'issuer'})}/></>;
        const view = render(<StrictMode>{tree([])}</StrictMode>);
        const [first, second] = [submitMove('a'), submitMove('b')];
        await user.click(within(document.getElementById('other')!).getAllByRole('gridcell').find(node => node.dataset.date === '2026-09-04')!);
        expect(document.getElementById('issuer')!.closest('[inert], [aria-hidden="true"]')).not.toBeNull();
        live.read();
        view.rerender(<StrictMode>{tree([pending(first), pending(second, 'b')])}</StrictMode>);
        view.rerender(<StrictMode>{tree([pending(first), rejected(second, 'Locked', 'b')])}</StrictMode>);
        view.rerender(<StrictMode>{tree([succeeded(first), rejected(second, 'Locked', 'b')])}</StrictMode>);
        expect(live.read()).toEqual([]);
        await user.keyboard('{Escape}');
        expect(document.getElementById('issuer')!.closest('[inert], [aria-hidden="true"]')).toBeNull();
        expect(live.read()).toEqual(['issuer polite: Alpha moved', 'issuer urgent: Move of Beta rejected: Locked']);
        view.rerender(<StrictMode>{tree([succeeded(first), rejected(second, 'Locked', 'b')])}</StrictMode>);
        expect(live.read()).toEqual([]);
    });
    it('the closing sheet\'s modality notification writes the owed result synchronously, before any attribute observer runs', async () => {
        const user = userEvent.setup(), log = recorder();
        const tree = (states: readonly CalendarMoveState[]) => <>
            <CalendarMonth {...base({id: 'other', layout: 'mobile', agendaPresentation: 'overlay', agendaDate: undefined, onAgendaDateChange: undefined})}/>
            <Month {...moving(log, states, {id: 'issuer'})}/></>;
        const view = render(tree([]));
        const id = submitMove('a');
        await user.click(within(document.getElementById('other')!).getAllByRole('gridcell').find(node => node.dataset.date === '2026-09-04')!);
        view.rerender(tree([succeeded(id)]));
        live.read();
        // One synchronous Escape: no microtask runs before the read below, so a MutationObserver (the one watching the
        // issuer's ancestors included) has not been called yet. Only the package modal layer's close notification can write.
        fireEvent.keyDown(document.activeElement!, {key: 'Escape'});
        expect(document.querySelector('[role=dialog]')).toBeNull();
        expect(live.read()).toEqual(['issuer polite: Alpha moved']);
        // The attribute observer, once called, finds nothing owed and writes nothing more.
        await act(async () => { await Promise.resolve(); });
        expect(live.read()).toEqual([]);
    });
    it('results owed under inert the package did not create are written once it is removed', async () => {
        const log = recorder(), host = document.body.appendChild(document.createElement('div'));
        try {
            const view = render(<Month {...moving(log)}/>, {container: host});
            const id = submitMove('a');
            host.setAttribute('aria-hidden', 'true');
            view.rerender(<Month {...moving(log, [pending(id)])}/>);
            expect(live.read()).toEqual([]);
            await act(async () => { host.removeAttribute('aria-hidden'); await Promise.resolve(); });
            expect(live.read()).toEqual(['main polite: Move of Alpha is pending']);
            view.rerender(<Month {...moving(log, [pending(id)])}/>);
            expect(live.read()).toEqual([]);
            view.unmount();
        } finally { host.remove(); }
    });
});

describe('scenario 12: the pending marker and the agenda label (decisions Q9 and Q10)', () => {
    // A bar from Thursday 3 to Thursday 10 September spans two week rows: two segments.
    const bar: CalendarItem = {id: 'bar', title: 'Sprint', calendarId: 'work', data: {}, interval: {kind: 'allDay', start: '2026-09-03', end: '2026-09-11'}};
    const states = [pending('elsewhere', 'bar'), pending('other', 'b')];
    const markers = () => [...document.querySelectorAll<HTMLElement>('.nc-item-pending')];
    /** Exactly one marker in each pending wrapper and none elsewhere; the marker sits outside the slot content. */
    function expectMarkers() {
        const wrappers = [...document.querySelectorAll<HTMLElement>('[data-item-id]')];
        for (const wrapper of wrappers) {
            expect(wrapper.querySelectorAll('.nc-item-pending'), wrapper.dataset.itemId).toHaveLength(wrapper.dataset.pending === 'true' ? 1 : 0);
            if (wrapper.dataset.pending !== undefined) expect(wrapper.dataset.pending).toBe('true');
        }
        for (const marker of markers()) {
            expect(marker.closest('[data-pending="true"]')).not.toBeNull();
            expect(marker.closest('[data-nc-slot], .nc-item-content, .nc-agenda-content, .nc-visually-hidden')).toBeNull();
            const icon = marker.querySelector('svg')!;
            expect(icon).toHaveAttribute('aria-hidden', 'true'); expect(icon).toHaveAttribute('focusable', 'false');
            // The last child of its segment, or of the row content: the inline end.
            expect(marker.nextElementSibling).toBeNull();
        }
        return wrappers;
    }
    it('every desktop month segment of a pending item carries data-pending and the marker; other items carry neither', () => {
        const log = recorder();
        const view = render(<Month {...moving(log, states, {layout: 'desktop', items: [alpha, beta, bar], agendaDate: undefined, onAgendaDateChange: undefined})}/>);
        expect(segments('bar')).toHaveLength(2);
        for (const node of [...segments('bar'), ...segments('b')]) expect(node).toHaveAttribute('data-pending', 'true');
        expect(segments('a')[0]).not.toHaveAttribute('data-pending');
        expectMarkers(); expect(markers()).toHaveLength(3);
        // The month segments are visual only (inside an aria-hidden container); the agenda row carries the accessible state.
        for (const marker of markers()) expect(marker.closest('.nc-month-segments')).toHaveAttribute('aria-hidden', 'true');
        view.rerender(<Month {...moving(log, [], {layout: 'desktop', items: [alpha, beta, bar], agendaDate: undefined, onAgendaDateChange: undefined})}/>);
        expect(markers()).toHaveLength(0); expect(document.querySelector('[data-pending]')).toBeNull();
    });
    it('survives renderItem, renderAgendaItem, theme, tokens, source colors and getItemAppearance; slot contexts carry isPending', () => {
        const contexts: [string, boolean][] = [];
        const custom = {theme: 'neutral', tokens: {color: {accent: 'rgb(1, 2, 3)'}}, sources: [{id: 'work', title: 'Work', color: 'rgb(9, 9, 9)'}],
            getItemAppearance: () => ({backgroundColor: 'rgb(200, 0, 0)', textColor: 'rgb(255, 255, 255)'}),
            renderItem: (context: {item: CalendarItem; isPending: boolean}) => { contexts.push([`month:${context.item.id}`, context.isPending]); return <b>custom</b>; },
            renderAgendaItem: (context: {item: CalendarItem; isPending: boolean}) => { contexts.push([`agenda:${context.item.id}`, context.isPending]); return <i>custom</i>; }};
        const log = recorder();
        render(<StrictMode><Month {...moving(log, states, {...custom, items: [alpha, beta, bar], theme: undefined})}/></StrictMode>);
        expectMarkers();
        expect(markers().map(marker => marker.closest<HTMLElement>('[data-item-id]')!.dataset.itemId).sort()).toEqual(['b', 'bar']);
        expect(new Set(contexts.filter(([key]) => key.startsWith('agenda:')).map(entry => entry.join('=')))).toEqual(new Set(['agenda:a=false', 'agenda:b=true', 'agenda:bar=true']));
        cleanupRender();
        contexts.length = 0;
        render(<Month {...moving(log, states, {...custom, items: [alpha, beta, bar], theme: undefined, layout: 'desktop', agendaDate: undefined, onAgendaDateChange: undefined})}/>);
        expectMarkers(); expect(markers()).toHaveLength(3);
        expect(new Set(contexts.map(entry => entry.join('=')))).toEqual(new Set(['month:a=false', 'month:b=true', 'month:bar=true']));
    });
    it('Q10: the default row reads title, then the pending label, the times and the source; the label is visible text', () => {
        const log = recorder(), view = render(<Month {...moving(log, states, {onItemPress() {}})}/>);
        const details = row('b')!.querySelector('.nc-agenda-details')!, label = details.querySelector('.nc-agenda-pending')!;
        expect(row('b')!.querySelector('.nc-agenda-title')).toHaveTextContent('Beta');
        expect(details.firstElementChild).toBe(label); expect(label).toHaveTextContent('Move pending');
        expect(details.textContent).toMatch(/^Move pending · .+ · Work$/);
        expect(label.closest('.nc-visually-hidden')).toBeNull();
        expect(within(row('b')!).getByRole('button', {name: /^Beta Move pending · /})).toBeInTheDocument();
        expect(row('a')!.querySelector('.nc-agenda-pending')).toBeNull();
        view.rerender(<Month {...moving(log, [], {onItemPress() {}})}/>);
        expect(row('b')!.querySelector('.nc-agenda-pending')).toBeNull(); expect(row('b')!.querySelector('.nc-agenda-details')!.textContent).toMatch(/^\S.+ · Work$/);
    });
    it('Q10: with renderAgendaItem the accessible name starts with the title, then the label; without onItemPress the item text keeps the order', () => {
        const log = recorder();
        const view = render(<Month {...moving(log, states, {onItemPress() {}, renderAgendaItem: () => <i>custom content</i>})}/>);
        const button = within(row('b')!).getByRole('button');
        expect(button).toHaveAccessibleName(/^Beta Move pending · .+ · Work custom content$/);
        expect(row('b')!.querySelector('.nc-visually-hidden .nc-agenda-pending')).not.toBeNull();
        view.rerender(<Month {...moving(log, states)}/>);
        expect(row('b')!.textContent).toMatch(/^BetaMove pending · .+ · Work$/);
        expect(row('b')!.querySelector('.nc-item-pending')).not.toBeNull();
    });
    it('server markup with a pending item equals the first client render: the hydrated row keeps its marker and label without a mismatch', () => {
        const log = recorder(), props = moving(log, states);
        const html = renderToString(<CalendarMonth {...props}/>), container = document.body.appendChild(document.createElement('div'));
        // Spied after the server render: in jsdom that render logs React's useLayoutEffect notice, an artifact of the test host.
        const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
        container.innerHTML = html;
        expect(container.querySelector('li[data-item-id="b"][data-pending="true"] .nc-item-pending')).not.toBeNull();
        const recoverable: unknown[] = [];
        let root: ReturnType<typeof hydrateRoot> | undefined;
        act(() => { root = hydrateRoot(container, <CalendarMonth {...props}/>, {onRecoverableError: error => { recoverable.push(error); }}); });
        try {
            expect(recoverable).toEqual([]); expect(errors).not.toHaveBeenCalled();
            expect(row('b', container)!.querySelector('.nc-agenda-pending')).toHaveTextContent('Move pending');
        } finally { act(() => root!.unmount()); container.remove(); }
    });
});
