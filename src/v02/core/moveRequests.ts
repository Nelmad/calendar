import type {CalendarMoveState} from '../reference.js';

// The move request registry (#10): one issuer state machine per request ID this mount issued, the accepted move states
// of a snapshot and the request ID. Pure: no React, DOM, clock, logging or crypto at import; the React layer injects the
// random source at submit and applies each step after its commit.

/** A terminal of an issued request; "the same terminal" means the same status and the same reason. */
export type MoveResult = Readonly<{status: 'succeeded'} | {status: 'rejected'; reason: string}>;
export type IssuerPhase =
    | Readonly<{kind: 'issued'}> // sent, never acknowledged
    | Readonly<{kind: 'pending'}> // a committed pending was seen and is still present
    | Readonly<{kind: 'removed'}> // the pending disappeared before any terminal
    | Readonly<{kind: 'terminal'; result: MoveResult}> // the first terminal was seen and is still present
    | Readonly<{kind: 'tombstone'; result: MoveResult}>; // that terminal was seen and then removed
export type IssuedRequest = Readonly<{requestId: string; itemId: string; phase: IssuerPhase}>;

/**
 * A warning of one transition, keyed by the request ID and the transition: `removed` is a pending gone (or excluded)
 * before a terminal, `readded` its late return, `changed` a record after the terminal, `reused` a record after the tombstone.
 */
export type MoveWarning =
    | Readonly<{kind: 'removed' | 'readded'; requestId: string}>
    | Readonly<{kind: 'changed' | 'reused'; requestId: string; result: MoveResult; record: CalendarMoveState}>;
export type MoveTransition = Readonly<{
    requestId: string;
    to: IssuerPhase;
    /** Whether the valid record with this ID counts for isPending, blocking and announcements. */
    accepted: boolean;
    /** The first committed pending, or the first committed terminal, of this request. */
    announce?: 'pending' | 'terminal';
    warning?: MoveWarning;
}>;

const issued: IssuerPhase = Object.freeze({kind: 'issued'}), pending: IssuerPhase = Object.freeze({kind: 'pending'}), removed: IssuerPhase = Object.freeze({kind: 'removed'});
const resultOf = (record: CalendarMoveState): MoveResult | null => record.status === 'succeeded' ? {status: 'succeeded'}
    : record.status === 'rejected' ? {status: 'rejected', reason: record.reason} : null;
const sameResult = (a: MoveResult, b: MoveResult) => a.status === b.status && (a.status !== 'rejected' || a.reason === (b as {reason: string}).reason);
/** The local issuer block: from submit until a valid terminal. */
export const blocksLocally = (phase: IssuerPhase) => phase.kind === 'issued' || phase.kind === 'pending' || phase.kind === 'removed';

/**
 * One observation of one request: `record` is the valid record with its ID in a counted commit, or undefined (absent).
 * An excluded record is absent here. Applying the result again to the same record changes nothing and announces nothing.
 */
export function moveTransition(requestId: string, phase: IssuerPhase, record: CalendarMoveState | undefined): MoveTransition {
    const result = record && resultOf(record);
    const step = (to: IssuerPhase, accepted: boolean, extra: Pick<MoveTransition, 'announce' | 'warning'> = {}): MoveTransition => ({requestId, to, accepted, ...extra});
    switch (phase.kind) {
    case 'issued':
        // Nothing while absent: no timeout and no warning, whatever time passes.
        if (!record) return step(phase, false);
        return result ? step({kind: 'terminal', result}, true, {announce: 'terminal'}) : step(pending, true, {announce: 'pending'});
    case 'pending':
        if (!record) return step(removed, false, {warning: {kind: 'removed', requestId}});
        return result ? step({kind: 'terminal', result}, true, {announce: 'terminal'}) : step(phase, true);
    case 'removed':
        if (!record) return step(phase, false);
        // A late acknowledgement is accepted silently for speech; a terminal after the removal is announced once.
        return result ? step({kind: 'terminal', result}, true, {announce: 'terminal'}) : step(pending, true, {warning: {kind: 'readded', requestId}});
    case 'terminal':
        if (!record) return step({kind: 'tombstone', result: phase.result}, false);
        if (result && sameResult(result, phase.result)) return step(phase, true);
        return step(phase, false, {warning: {kind: 'changed', requestId, result: phase.result, record}});
    case 'tombstone':
        return record ? step(phase, false, {warning: {kind: 'reused', requestId, result: phase.result, record}}) : step(phase, false);
    }
}

export type MoveObservation = Readonly<{
    /** External records as they are, plus this mount's accepted records, in snapshot order. */
    accepted: readonly CalendarMoveState[];
    /** One transition per issued request, in issue order. */
    transitions: readonly MoveTransition[];
    /** Item IDs with at least one accepted pending record: isPending and the shared block. */
    pending: ReadonlySet<string>;
    /** `pending` plus the items of this mount's requests that still block locally after the transitions. */
    blocked: ReadonlySet<string>;
}>;

/**
 * The accepted move states of one counted commit and the transitions of this mount's requests. `states` are the records
 * `validateMoveStates` kept for `requests`; render computes the accepted states with it, the commit applies the same result.
 */
export function observeMoveStates(requests: readonly IssuedRequest[], states: readonly CalendarMoveState[]): MoveObservation {
    const byId = new Map(states.map(state => [state.requestId, state]));
    const transitions = requests.map(request => moveTransition(request.requestId, request.phase, byId.get(request.requestId)));
    const own = new Map(transitions.map(transition => [transition.requestId, transition]));
    // Every other ID is external: no history, its current valid records count as they are.
    const accepted = states.filter(state => own.get(state.requestId)?.accepted ?? true);
    const pendingItems = new Set(accepted.filter(state => state.status === 'pending').map(state => state.itemId)), blocked = new Set(pendingItems);
    requests.forEach((request, index) => { if (blocksLocally(transitions[index].to)) blocked.add(request.itemId); });
    return {accepted, transitions, pending: pendingItems, blocked};
}

type Speech = 'none' | 'owed' | 'done';
/** One issued request: the raw title snapshot taken before onItemMoveRequest, its phase and its owed announcements. */
export type MoveEntry = {readonly requestId: string; readonly itemId: string; readonly title: string; phase: IssuerPhase; pendingSpeech: Speech; terminalSpeech: Speech};
export type OwedResult = Readonly<{entry: MoveEntry; kind: 'pending' | 'terminal'}>;

/**
 * The per-mount issuer registry. It keeps every entry until unmount (terminals and tombstones included); submit writes
 * entries in its handler, and only the commit step changes phases and announcement flags. Clearing it never calls back.
 */
export function createMoveRegistry() {
    const entries: MoveEntry[] = [], byId = new Map<string, MoveEntry>(), issuedItems = new Map<string, string>();
    let revision = 0;
    const owed = (): readonly OwedResult[] => entries.flatMap(entry => [
        ...entry.pendingSpeech === 'owed' ? [{entry, kind: 'pending' as const}] : [],
        ...entry.terminalSpeech === 'owed' ? [{entry, kind: 'terminal' as const}] : []]);
    return {
        /** `requestId → itemId` for `validateMoveStates`. */
        issued: issuedItems as ReadonlyMap<string, string>,
        entries: (): readonly MoveEntry[] => entries,
        /** Changes whenever an entry is added: the move-state stage of the model is keyed on it. */
        revision: () => revision,
        has: (requestId: string) => byId.has(requestId),
        register(requestId: string, itemId: string, title: string) {
            const entry: MoveEntry = {requestId, itemId, title, phase: issued, pendingSpeech: 'none', terminalSpeech: 'none'};
            entries.push(entry); byId.set(requestId, entry); issuedItems.set(requestId, itemId); revision++;
            return entry;
        },
        /** The local issuer block with the phases of the latest applied commit. */
        blocks: (itemId: string) => entries.some(entry => entry.itemId === itemId && blocksLocally(entry.phase)),
        /** The commit step: idempotent, so a second application of the same observation changes nothing. */
        apply(transitions: readonly MoveTransition[]) {
            for (const transition of transitions) {
                const entry = byId.get(transition.requestId);
                if (!entry) continue;
                entry.phase = transition.to;
                if (transition.announce === 'pending' && entry.pendingSpeech === 'none' && entry.terminalSpeech === 'none') entry.pendingSpeech = 'owed';
                if (transition.announce === 'terminal' && entry.terminalSpeech === 'none') {
                    entry.terminalSpeech = 'owed';
                    // A pending still owed when its terminal arrives is dropped: only the terminal is spoken.
                    if (entry.pendingSpeech === 'owed') entry.pendingSpeech = 'done';
                }
            }
        },
        /** The announcements owed, in issue order; `take` marks them spoken. */
        owed,
        take() {
            const results = owed();
            for (const {entry, kind} of results) { if (kind === 'pending') entry.pendingSpeech = 'done'; else entry.terminalSpeech = 'done'; }
            return results;
        },
    };
}
export type MoveRegistry = ReturnType<typeof createMoveRegistry>;

/** A Web Crypto source, read by the caller at submit time only (never at import, during render or on the server). */
export type RandomSource = Readonly<{randomUUID?: unknown; getRandomValues?: unknown}> | null | undefined;
/** Thrown in development and production alike; not a development warning, so it carries no warning prefix. */
export const missingCryptoMessage = '@nelmad/calendar: move requests need Web Crypto (crypto.randomUUID or crypto.getRandomValues)';
/**
 * A new UUID v4 request ID: `randomUUID()` where it exists (secure contexts only), else 16 bytes of `getRandomValues()` with
 * the version and variant bits set. Never a counter, timestamp or `useId`.
 */
export function createRequestId(source: RandomSource): string {
    const crypto = source as Partial<Crypto> | null | undefined;
    if (typeof crypto?.randomUUID === 'function') return crypto.randomUUID();
    if (typeof crypto?.getRandomValues !== 'function') throw new Error(missingCryptoMessage);
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
