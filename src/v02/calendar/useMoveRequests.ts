import {useCallback, useEffect, useLayoutEffect, useReducer, useRef, useState} from 'react';
import type {CalendarMoveProposal} from '../reference.js';
import type {LocalizedText} from '../core/formatting.js';
import {reconcileMoveDraft, startMoveDraft, type MoveCancelReason, type MoveDraft, type MoveOrigin} from '../core/move.js';
import {createRequestId, type MoveRegistry, type MoveWarning} from '../core/moveRequests.js';
import {snapshotItemTitle} from '../core/messages.js';
import {composedParent} from './focus.js';
import {subscribeModality} from './modality.js';
import type {CalendarDataModel, CalendarModel} from './model.js';
import type {OverlayStackController} from './overlays.js';

const useClientLayoutEffect = typeof document === 'undefined' ? useEffect : useLayoutEffect;
type Data = CalendarDataModel<unknown, unknown>;
/** How a caller ends a draft: an explicit cancellation, a no-op confirmation or an invalidation it found itself. */
export type MoveDraftEnding = 'cancel' | 'noop' | 'invalid';
/** The one owed `null`: the callback identity that received the item ID, and whether its `null` was sent. */
type Retention = {callback: (itemId: string | null) => void; settled: boolean};
type Payload = {polite?: readonly LocalizedText[]; urgent?: readonly LocalizedText[]};
export type MoveRequestOptions = {registry: MoveRegistry; overlays: OverlayStackController; warn: (path: string, reason: string, key?: string) => void};

const startOrigin: MoveOrigin = Object.freeze({kind: 'start'});
/**
 * The text of a transition warning, built in development only, so production chunks carry none of it. The key holds the
 * request ID and the transition, so each distinct invalid transition warns once per instance.
 */
const transitionWarning = process.env.NODE_ENV === 'production' ? undefined : (warning: MoveWarning) => {
    const id = warning.requestId, key = (...parts: string[]) => `itemMoveStates:${JSON.stringify([id, warning.kind, ...parts])}`;
    if (!('record' in warning)) return {key: key(), reason: warning.kind === 'removed'
        ? `request ${id} has no valid pending record before a terminal; isPending is false and the item stays blocked until a terminal`
        : `request ${id}: pending re-added after it was removed before a terminal`};
    const {record, result} = warning, observed = record.status === 'rejected' ? `rejected (${record.reason})` : record.status;
    const reached = result.status === 'rejected' ? `rejected (${result.reason})` : result.status;
    return {key: key(record.status, record.status === 'rejected' ? record.reason : ''), reason: warning.kind === 'changed'
        ? `request ${id} already ${reached}; a later ${observed} record is ignored`
        : `request ${id} was removed after it ${reached}; a reused ${observed} record is ignored`};
};
/** Why a committed render ends an open draft, or null to keep it. Without the pair, or as a contract error, it ends silently. */
function ending(model: CalendarModel<unknown, unknown>, draft: MoveDraft): MoveCancelReason | 'pair' | null {
    if (model.kind === 'contract') return 'blocking';
    if (!model.moves) return 'pair';
    // #9's reconciliation first: a draft it cancels keeps its own single reason.
    const step = reconcileMoveDraft(draft, {kind: 'data', blocking: model.blocking, timeZone: model.props.timeZone, visible: model.visible});
    if (step.outcome?.kind === 'cancel') return step.outcome.reason;
    // An accepted pending for the draft's item, from any instance, cancels it (decision Q4). This mount's own requests
    // never do: their items are locally blocked, so no draft of them can be open.
    return model.moves.pending.has(draft.itemId) ? 'unavailable' : null;
}
const reasonText = (model: Data, reason: 'unavailable' | 'timeZone' | 'interval') => (reason === 'unavailable' ? model.message('moveItemUnavailableReason')
    : reason === 'timeZone' ? model.message('moveTimeZoneChangedReason') : model.message('moveItemChangedReason')).text;

/**
 * Move requests (#10): the draft retention lifecycle, the request issued on submit and the observation of `itemMoveStates`
 * by this mount's issuer registry. The input adapters call `startDraft`, `endDraft` and `submit` and never the consumer
 * callbacks. Render only reads the registry (through the model's move-state stage); its entries are written by submit, and
 * phases, warnings and announcements change after the commit.
 */
export function useMoveRequests<I, S>(model: CalendarModel<I, S>, {registry, overlays, warn}: MoveRequestOptions) {
    const moves = model.kind === 'data' ? model.moves : null, enabled = !!moves && !model.blocking;
    const [stored, setStored] = useState<MoveDraft | null>(null);
    // Submit counts here, so the local block reaches render even when no acknowledgement re-renders the Calendar.
    const [, submitted] = useReducer((value: number) => value + 1, 0);
    const draftRef = useRef<MoveDraft | null>(null), retention = useRef<Retention | null>(null);
    const handoff = useRef(false), alive = useRef(false), committed = useRef<CalendarModel<unknown, unknown>>(model as CalendarModel<unknown, unknown>);
    // Automatic cancellations of this commit (urgent), merged into the controller's payload or flushed after it.
    const cancellations = useRef<LocalizedText[]>([]), watcher = useRef<(() => void) | null>(null);
    useClientLayoutEffect(() => { committed.current = model as CalendarModel<unknown, unknown>; });

    /** The latest committed model while a draft may open or a request be sent: data, the pair present and not blocking. */
    const current = () => { const latest = committed.current; return latest.kind === 'data' && latest.moves && !latest.blocking ? latest : null; };
    const blocked = (latest: Data, itemId: string) => registry.blocks(itemId) || latest.moves!.pending.has(itemId);
    /** Sends the one paired `null`, marked done before the call, so a reentrant update or unmount never sends a second one. */
    const settle = (owed: Retention | null) => {
        if (retention.current === owed) retention.current = null;
        if (!owed || owed.settled) return;
        owed.settled = true;
        owed.callback(null);
    };
    const detach = () => { const draft = draftRef.current; draftRef.current = null; if (draft) setStored(null); return draft; };

    /**
     * Opens a draft of a visible, unblocked item, calling `onItemMoveDraftChange(itemId)` before it returns and before any
     * navigation the caller's draft causes. Returns the draft (built by #9 with the caller's origin), or null when refused.
     * A throwing callback opens nothing: the same identity gets its one `null`, and the error propagates (decision Q5).
     */
    const startDraft = (itemId: string, origin: MoveOrigin = startOrigin): MoveDraft | null => {
        const latest = current();
        if (!latest || !alive.current || draftRef.current || retention.current || blocked(latest, itemId)) return null;
        const record = latest.visible.get(itemId);
        if (!record) return null;
        const draft = startMoveDraft(record, latest.props.timeZone, origin), callback = latest.props.onItemMoveDraftChange;
        if (callback) {
            const owed: Retention = {callback, settled: false};
            // The identity counts as sent before the call: an unmount inside it sends the paired null itself.
            retention.current = owed;
            let opened = false;
            try { callback(itemId); opened = true; } finally { if (!opened) settle(owed); }
            if (owed.settled) return null;
        }
        draftRef.current = draft; setStored(draft);
        return draft;
    };
    /** The endings a caller reports (Escape, Cancel, capture loss, a no-op, an invalidation): one `null`, no request, no speech. */
    const endDraft = (_ending: MoveDraftEnding) => {
        if (!detach()) return false;
        settle(retention.current);
        return true;
    };
    /**
     * Issues one request in one synchronous handler: register it, call `onItemMoveRequest` once, then send the paired `null`
     * from `finally`. A throwing callback or missing Web Crypto propagates after that `null` (decisions Q6 and Q7). Returns the
     * request ID, or null when refused (no move pair, a blocking state, a blocked item, or a draft of another item).
     */
    const submit = (proposal: CalendarMoveProposal<I>): string | null => {
        const latest = current(), itemId = proposal.item.id, open = draftRef.current;
        // A submit inside onItemMoveRequest is refused: the first handoff owns the paired null until its finally.
        if (!latest || !alive.current || handoff.current || (open && open.itemId !== itemId) || blocked(latest, itemId)) return null;
        // The draft is handed off before the request: a render inside onItemMoveRequest sees no open draft to cancel.
        detach();
        handoff.current = true;
        try {
            // Inside the try: without Web Crypto nothing is registered or blocked, and the paired null still follows.
            const requestId = createRequestId(globalThis.crypto);
            registry.register(requestId, itemId, snapshotItemTitle(proposal.item));
            submitted();
            // The consumer's item object passes through; its return value is ignored (not a Promise API).
            latest.props.onItemMoveRequest!({item: proposal.item, previousInterval: proposal.previousInterval, proposedInterval: proposal.proposedInterval,
                input: proposal.input, requestId});
            return requestId;
        } finally {
            handoff.current = false;
            settle(retention.current);
        }
    };

    /** The speech of this commit and the owed results, unless the live endpoints are inert: then results stay owed. */
    const take = useCallback((): Payload => {
        const urgent = cancellations.current.splice(0), latest = committed.current;
        if (latest.kind !== 'data' || !latest.moves || overlays.liveInert()) return {};
        const polite: LocalizedText[] = [];
        for (const {entry, kind} of registry.take()) {
            const phase = entry.phase;
            if (kind === 'pending') polite.push(latest.message('movePendingAnnouncement', entry.title));
            else if (phase.kind === 'terminal' || phase.kind === 'tombstone') {
                if (phase.result.status === 'succeeded') polite.push(latest.message('moveSucceededAnnouncement', entry.title));
                else urgent.push(latest.message('moveRejectedAnnouncement', entry.title, phase.result.reason));
            }
        }
        return {polite: polite.length ? polite : undefined, urgent: urgent.length ? urgent : undefined};
    }, [registry, overlays]);
    /**
     * While results are owed to inert endpoints, one MutationObserver on the `inert` and `aria-hidden` attributes of the live
     * target's composed ancestors and the modality registry's close notification write them once the target is not inert.
     */
    const watch = useCallback(() => {
        const stop = () => { watcher.current?.(); watcher.current = null; };
        if (!alive.current || !registry.owed().length || !overlays.liveInert()) { stop(); return; }
        const target = overlays.liveTarget().polite, document = target?.ownerDocument;
        if (watcher.current || !target || !document?.defaultView) return;
        const flush = () => {
            if (!alive.current) return;
            const {polite, urgent} = take();
            if (polite || urgent) overlays.announce(polite, urgent);
            if (!registry.owed().length) stop();
        };
        const observer = new document.defaultView.MutationObserver(flush);
        for (let node: Element | null = target; node; node = composedParent(node)) observer.observe(node, {attributes: true, attributeFilter: ['inert', 'aria-hidden']});
        const unsubscribe = subscribeModality(document, flush);
        watcher.current = () => { observer.disconnect(); unsubscribe(); };
    }, [registry, overlays, take]);

    useEffect(() => {
        alive.current = true;
        return () => {
            alive.current = false;
            watcher.current?.(); watcher.current = null;
            // Any cleanup ends an open draft with its one null and never restores it; a handoff leaves the null to submit.
            if (handoff.current) return;
            detach();
            settle(retention.current);
        };
    }, []);
    // Each commit: the prop-driven endings of an open draft, then (only in a counted commit: data with the pair) the snapshot's
    // record warnings, the transitions of this mount's requests and their warnings. Announcements become owed in the registry.
    useEffect(() => {
        const draft = draftRef.current, latest = model as CalendarModel<unknown, unknown>;
        const reason = draft ? ending(latest, draft) : null;
        if (draft && reason) {
            detach();
            settle(retention.current);
            // A blocking or contract commit and a removed pair end silently; the others speak once, urgently.
            if (latest.kind === 'data' && (reason === 'unavailable' || reason === 'timeZone' || reason === 'interval') && !overlays.liveInert()) {
                cancellations.current.push(latest.message('moveCancelledAnnouncement', draft.title, reasonText(latest, reason)));
            }
        }
        if (!moves) return;
        for (const diagnostic of moves.diagnostics) warn(diagnostic.path, diagnostic.reason, diagnostic.key);
        registry.apply(moves.transitions);
        if (transitionWarning) for (const {warning} of moves.transitions) if (warning) { const text = transitionWarning(warning); warn('itemMoveStates', text.reason, text.key); }
    });

    return {
        /** The move pair is present in a data state that is not blocking: a draft may open. */
        enabled,
        /** The open draft as rendered; a commit that ends it removes it. */
        draft: enabled ? stored : null,
        /** Whether an accepted pending record names the item: isPending, data-pending and the pending marker. */
        isPending: (itemId: string) => !!moves?.pending.has(itemId),
        /** The local issuer block or an accepted pending: no draft may start and no request be sent for the item. */
        isBlocked: (itemId: string) => !!moves?.blocked.has(itemId),
        startDraft, endDraft, submit, take, watch,
    };
}
export type CalendarMoveRequests = ReturnType<typeof useMoveRequests>;
