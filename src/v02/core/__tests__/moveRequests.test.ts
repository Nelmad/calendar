import {describe, expect, it, vi} from 'vitest';
import type {CalendarMoveState} from '../../reference.js';
import {blocksLocally, createMoveRegistry, createRequestId, missingCryptoMessage, moveTransition, observeMoveStates, type IssuerPhase, type MoveTransition} from '../moveRequests.js';

// #10: the issuer state machine, one case per row of the transition table, each applied twice through the registry.
const id = 'req-1', item = 'item-1';
const pending = {requestId: id, itemId: item, status: 'pending'} as const satisfies CalendarMoveState;
const succeeded = {requestId: id, itemId: item, status: 'succeeded'} as const satisfies CalendarMoveState;
const rejected = (reason: string) => ({requestId: id, itemId: item, status: 'rejected', reason} as const satisfies CalendarMoveState);
const phases = {
    issued: {kind: 'issued'}, pending: {kind: 'pending'}, removed: {kind: 'removed'},
    succeeded: {kind: 'terminal', result: {status: 'succeeded'}}, rejected: {kind: 'terminal', result: {status: 'rejected', reason: 'Busy'}},
    tombstone: {kind: 'tombstone', result: {status: 'succeeded'}},
} as const satisfies Record<string, IssuerPhase>;
type Row = [label: string, from: IssuerPhase, record: CalendarMoveState | undefined, to: IssuerPhase, accepted: boolean, announce: MoveTransition['announce'], warning: string | undefined];
const rows: Row[] = [
    ['issued + absent: nothing, no timeout and no warning', phases.issued, undefined, phases.issued, false, undefined, undefined],
    ['issued + pending: announce pending once', phases.issued, pending, phases.pending, true, 'pending', undefined],
    ['issued + succeeded: a direct terminal, no pending announcement', phases.issued, succeeded, phases.succeeded, true, 'terminal', undefined],
    ['issued + rejected: a direct terminal with its reason', phases.issued, rejected('Busy'), phases.rejected, true, 'terminal', undefined],
    ['pending + pending: a repeated snapshot', phases.pending, pending, phases.pending, true, undefined, undefined],
    ['pending + succeeded: announce the terminal, release the block', phases.pending, succeeded, phases.succeeded, true, 'terminal', undefined],
    ['pending + absent: premature removal warns, no isPending, the block stays', phases.pending, undefined, phases.removed, false, undefined, 'removed'],
    ['removed + absent: nothing more', phases.removed, undefined, phases.removed, false, undefined, undefined],
    ['removed + rejected: announce the terminal, release the block (decision Q1a)', phases.removed, rejected('Busy'), phases.rejected, true, 'terminal', undefined],
    ['removed + pending: a late acknowledgement warns, no announcement (decision Q1b)', phases.removed, pending, phases.pending, true, undefined, 'readded'],
    ['terminal + the same terminal: a repeated snapshot', phases.rejected, rejected('Busy'), phases.rejected, true, undefined, undefined],
    ['terminal + absent: tombstone', phases.succeeded, undefined, phases.tombstone, false, undefined, undefined],
    ['terminal + pending: excluded', phases.succeeded, pending, phases.succeeded, false, undefined, 'changed'],
    ['terminal + another status: excluded', phases.succeeded, rejected('Busy'), phases.succeeded, false, undefined, 'changed'],
    ['terminal + another reason: excluded', phases.rejected, rejected('Later'), phases.rejected, false, undefined, 'changed'],
    ['tombstone + absent: nothing', phases.tombstone, undefined, phases.tombstone, false, undefined, undefined],
    ['tombstone + the same terminal: a reused ID is excluded', phases.tombstone, succeeded, phases.tombstone, false, undefined, 'reused'],
    ['tombstone + pending: a reused ID is excluded', phases.tombstone, pending, phases.tombstone, false, undefined, 'reused'],
];

describe('the issuer transition table (#10)', () => {
    it.each(rows)('%s', (_label, from, record, to, accepted, announce, warning) => {
        const transition = moveTransition(id, from, record);
        expect(transition.to).toEqual(to);
        expect(transition.accepted).toBe(accepted);
        expect(transition.announce).toBe(announce);
        expect(transition.warning?.kind).toBe(warning);
        if (warning) expect(transition.warning?.requestId).toBe(id);
        // Only issued, pending and removed block locally; a terminal and a tombstone never do.
        expect(blocksLocally(transition.to)).toBe(['issued', 'pending', 'removed'].includes(to.kind));
        // The state machine through the registry: the first commit applies the row, the second application of the same
        // snapshot changes nothing and announces nothing; an excluded record repeats only its warning, whose key is the same.
        const registry = createMoveRegistry(), entry = registry.register(id, item, 'Title');
        entry.phase = from;
        const states = record ? [record] : [];
        const first = observeMoveStates(registry.entries(), states);
        registry.apply(first.transitions);
        expect(entry.phase).toEqual(to);
        expect(first.accepted).toEqual(accepted && record ? [record] : []);
        const owed = registry.owed().map(result => result.kind);
        expect(owed).toEqual(announce ? [announce] : []);
        const second = observeMoveStates(registry.entries(), states);
        registry.apply(second.transitions);
        expect(second.transitions[0].to).toEqual(to); expect(entry.phase).toEqual(to);
        expect(second.accepted).toEqual(first.accepted);
        expect(second.transitions[0].announce).toBeUndefined();
        expect(registry.owed().map(result => result.kind)).toEqual(owed);
        if (from.kind === 'terminal' || from.kind === 'tombstone') expect(second.transitions[0].warning).toEqual(first.transitions[0].warning);
        else expect(second.transitions[0].warning).toBeUndefined();
    });
});

/** Runs snapshots through the machine as counted commits, collecting what each commit announced and warned. */
function run(snapshots: readonly (readonly CalendarMoveState[])[]) {
    const registry = createMoveRegistry();
    registry.register(id, item, 'Title');
    return snapshots.map(states => {
        const step = observeMoveStates(registry.entries(), states);
        registry.apply(step.transitions);
        return {pending: step.pending.has(item), blocked: step.blocked.has(item), spoken: registry.take().map(result => result.kind),
            warned: step.transitions.flatMap(transition => transition.warning ? [transition.warning.kind] : [])};
    });
}

describe('issuer sequences (#10 decisions Q1 and Q2)', () => {
    it('Q1: pending → [] → pending → succeeded announces [pending, succeeded], warns [removed, readded], and keeps the block until succeeded', () => {
        const steps = run([[pending], [], [pending], [succeeded], [succeeded]]);
        expect(steps.map(step => step.spoken)).toEqual([['pending'], [], [], ['terminal'], []]);
        expect(steps.flatMap(step => step.warned)).toEqual(['removed', 'readded']);
        expect(steps.map(step => step.pending)).toEqual([true, false, true, false, false]);
        expect(steps.map(step => step.blocked)).toEqual([true, true, true, false, false]);
    });
    it('Q1: a later pending → absent returns to removed without a new warning (the same transition key, printed once per instance)', () => {
        const steps = run([[pending], [], [pending], []]);
        expect(steps.flatMap(step => step.warned)).toEqual(['removed', 'readded', 'removed']);
        expect([...new Set(steps.flatMap(step => step.warned))]).toEqual(['removed', 'readded']);
        expect(steps[steps.length - 1]).toMatchObject({pending: false, blocked: true});
    });
    it('Q2: an excluded record of an issued ID is absent: pending → blank reason → Busy', () => {
        // validateMoveStates excludes the blank reason, so the machine sees no record in the second commit.
        const steps = run([[pending], [], [rejected('Busy')]]);
        expect(steps.map(step => step.spoken)).toEqual([['pending'], [], ['terminal']]);
        expect(steps.flatMap(step => step.warned)).toEqual(['removed']);
        expect(steps.map(step => [step.pending, step.blocked])).toEqual([[true, true], [false, true], [false, false]]);
    });
    it('Q2: terminal → an excluded record → the same terminal is a reused ID; the warning is the only effect', () => {
        const steps = run([[succeeded], [], [succeeded]]);
        expect(steps.map(step => step.spoken)).toEqual([['terminal'], [], []]);
        expect(steps.flatMap(step => step.warned)).toEqual(['reused']);
        expect(steps.map(step => step.blocked)).toEqual([false, false, false]);
    });
    it('a terminal that follows an unspoken pending drops it: only the terminal is owed', () => {
        const registry = createMoveRegistry();
        registry.register(id, item, 'Title');
        registry.apply(observeMoveStates(registry.entries(), [pending]).transitions);
        registry.apply(observeMoveStates(registry.entries(), [succeeded]).transitions);
        expect(registry.take().map(result => result.kind)).toEqual(['terminal']);
        expect(registry.take()).toEqual([]);
    });
});

describe('accepted move states (#10)', () => {
    it('counts external records as they are, keeps this mount\'s accepted ones, and blocks only the named items', () => {
        const registry = createMoveRegistry();
        registry.register('mine', 'tenant-a:42', 'Mine');
        registry.register('done', 'tenant-a:7', 'Done');
        registry.entries()[1].phase = phases.succeeded;
        const external = {requestId: 'theirs', itemId: 'tenant-a:42', status: 'pending'} as const;
        const collision = {requestId: 'other', itemId: 'tenant-a:42', status: 'pending'} as const;
        const reused = {requestId: 'done', itemId: 'tenant-a:7', status: 'pending'} as const;
        const step = observeMoveStates(registry.entries(), [external, collision, reused]);
        // Several pending records of one item under different request IDs are a collision between instances: all count.
        expect(step.accepted).toEqual([external, collision]);
        expect([...step.pending]).toEqual(['tenant-a:42']);
        expect(step.blocked.has('tenant-a:42')).toBe(true); expect(step.blocked.has('tenant-b:42')).toBe(false);
        // A record for the same item under another request ID never acknowledges this mount's request.
        expect(step.transitions[0]).toMatchObject({requestId: 'mine', to: {kind: 'issued'}, accepted: false});
        expect(step.blocked.has('tenant-a:7')).toBe(false);
    });
    it('an empty snapshot publishes nothing but keeps the registry and its local blocks', () => {
        const registry = createMoveRegistry();
        registry.register(id, item, 'Title');
        const step = observeMoveStates(registry.entries(), []);
        expect(step.accepted).toEqual([]); expect(step.pending.size).toBe(0); expect(step.blocked.has(item)).toBe(true);
        expect(registry.entries()).toHaveLength(1); expect(registry.blocks(item)).toBe(true);
    });
    it('registers entries in issue order with their raw title snapshot and a new revision', () => {
        const registry = createMoveRegistry(), before = registry.revision();
        registry.register('b', 'x', ' '); registry.register('a', 'y', 'Y');
        expect(registry.revision()).toBe(before + 2);
        expect(registry.entries().map(entry => [entry.requestId, entry.title])).toEqual([['b', ' '], ['a', 'Y']]);
        expect([...registry.issued]).toEqual([['b', 'x'], ['a', 'y']]);
    });
});

describe('request IDs (#10)', () => {
    const v4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
    it('uses crypto.randomUUID where it exists', () => {
        const randomUUID = vi.fn(() => '1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed'), getRandomValues = vi.fn();
        expect(createRequestId({randomUUID, getRandomValues})).toBe('1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed');
        expect(getRandomValues).not.toHaveBeenCalled();
    });
    it('builds a v4 ID from getRandomValues without randomUUID, setting the version and variant bits', () => {
        const ids = new Set<string>();
        for (let i = 0; i < 200; i++) ids.add(createRequestId({getRandomValues: (bytes: Uint8Array) => globalThis.crypto.getRandomValues(bytes)}));
        expect(ids.size).toBe(200);
        for (const value of ids) expect(value).toMatch(v4);
        expect(createRequestId({getRandomValues: (bytes: Uint8Array) => bytes.fill(0xff)})).toBe('ffffffff-ffff-4fff-bfff-ffffffffffff');
        expect(createRequestId({getRandomValues: (bytes: Uint8Array) => bytes.fill(0)})).toBe('00000000-0000-4000-8000-000000000000');
    });
    it('throws the same Error without Web Crypto, without the development-warning prefix', () => {
        for (const source of [undefined, null, {}, {randomUUID: 'no', getRandomValues: 1}]) expect(() => createRequestId(source)).toThrow(new Error(missingCryptoMessage));
        expect(missingCryptoMessage).not.toContain('[@nelmad/calendar]');
    });
});
