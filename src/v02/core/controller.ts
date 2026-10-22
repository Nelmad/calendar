import type {CalendarDateRange, CalendarDataState} from '../reference.js';
import {parseAnchorDate, parseISODate} from './date.js';

export const monthStart = (date: string) => `${date.slice(0, 7)}-01`;
export const inRange = (date: string, range: CalendarDateRange) => range.start <= date && date < range.end;
export const isBlocking = (state: CalendarDataState) => state.status !== 'ready' && state.phase === 'initial';
export function shiftMonth(month: string, amount: number): string | null {
    const value = parseAnchorDate(month);
    const index = (value.year - 1) * 12 + value.month - 1 + amount;
    if (!Number.isInteger(amount) || index < 1 || index > 119_986) return null;
    return `${String(Math.floor(index / 12) + 1).padStart(4, '0')}-${String(index % 12 + 1).padStart(2, '0')}-01`;
}
export function clampToMonth(date: string, month: string): string {
    return parseISODate(month).set({day: parseISODate(date).day}).toString();
}
export type NavigationSource = 'grid' | 'today' | 'toolbar';
export type NavigationKind = 'date' | 'month';
export type NavigationIntent = Readonly<{month: string; date: string; source: NavigationSource}>;
export type NavigationState = Readonly<{month: string; date: string; intent: NavigationIntent | null}>;
export const sameNavigation = (a: NavigationState, b: NavigationState) => a.month === b.month && a.date === b.date && a.intent === b.intent;
export type NavigationSnapshot = Readonly<{month: string; range: CalendarDateRange; blocking: boolean}>;
export type FocusOwner = Readonly<{grid: boolean; calendar: boolean; initiator: boolean}>;

/** Render-only target derivation; acceptance and DOM focus are commit operations. */
export function navigationDate(state: NavigationState, snapshot: NavigationSnapshot): string {
    if (state.month !== snapshot.month || !inRange(state.date, snapshot.range)) return clampToMonth(state.date, snapshot.month);
    return state.date;
}
export function requestNavigation(state: NavigationState, snapshot: NavigationSnapshot, date: string, source: NavigationSource, kind: NavigationKind = 'date') {
    parseISODate(date);
    const month = monthStart(date);
    if (snapshot.blocking) return {state, blocked: true} as const;
    // Neighbor dates of the first/last supported Month still belong to its grid: a grid or Today target there is focused
    // without a callback (§5.1.1, §11.3), so the anchor bound does not apply to it.
    if (kind === 'date' && source !== 'toolbar' && inRange(date, snapshot.range)) return {state: {...state, date, intent: null}, focus: date, blocked: false} as const;
    if (month < '0001-02-01' || month > '9999-11-01') return {state, blocked: true} as const;
    if (month === snapshot.month) {
        return {state: {...state, date, intent: null}, focus: source === 'toolbar' ? undefined : date, blocked: false} as const;
    }
    return {state: {...state, intent: {month, date, source}}, navigate: month, blocked: false} as const;
}
/** Blocking wins over matching acceptance, even when both arrive in one commit. */
export function commitNavigation(state: NavigationState, snapshot: NavigationSnapshot | null, owner: FocusOwner) {
    if (!snapshot) return {state: {...state, intent: null}};
    const date = navigationDate(state, snapshot), changed = state.month !== snapshot.month;
    const intent = snapshot.blocking ? null : state.intent;
    const matches = changed && intent?.month === snapshot.month;
    const canFocus = matches && (intent.source === 'grid' ? owner.grid : intent.source === 'today' && owner.initiator);
    const target = canFocus && inRange(intent.date, snapshot.range) ? intent.date : date;
    return {
        state: {month: snapshot.month, date: target, intent: changed || snapshot.blocking ? null : intent},
        focus: !snapshot.blocking && (canFocus || (owner.grid && state.date !== target)) ? target : undefined,
        announce: matches && intent.source === 'toolbar' && owner.calendar && !owner.grid ? snapshot.month : undefined,
    };
}

export type AgendaState = Readonly<{month: string; date: string; controlled: boolean; untouched: boolean}>;
export const sameAgenda = (a: AgendaState, b: AgendaState) => a.month === b.month && a.date === b.date && a.controlled === b.controlled && a.untouched === b.untouched;
export function agendaFallback(month: string, today: string | null): string {
    return today && monthStart(today) === month ? today : month;
}
export function reconcileAgenda(previous: AgendaState | null, month: string, controlledDate: string | undefined, today: string | null): AgendaState {
    if (controlledDate !== undefined) return {month, date: controlledDate, controlled: true, untouched: false};
    if (!previous) return {month, date: agendaFallback(month, today), controlled: false, untouched: true};
    if (previous.controlled) return {...previous, month, controlled: false};
    if (previous.month !== month && monthStart(previous.date) !== month) return {month, date: agendaFallback(month, today), controlled: false, untouched: true};
    return {...previous, month, date: previous.untouched && today && monthStart(today) === month ? today : previous.date};
}
