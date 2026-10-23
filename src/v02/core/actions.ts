import type {CalendarItem, CalendarItemAction, CalendarResolvedLayout} from '../reference.js';
import {validateActions, type Diagnostic} from './validation.js';

/** §5.5/§7/§12.2: one action set; desktop shows it as a keyboard menu, mobile as a modal action sheet. */
export type ActionsPresentation = 'menu' | 'sheet';
export const actionsPresentation = (layout: CalendarResolvedLayout): ActionsPresentation => layout === 'desktop' ? 'menu' : 'sheet';

export type ResolvedActions = Readonly<{actions: readonly CalendarItemAction[]; diagnostics: readonly Diagnostic[]}>;
const none: ResolvedActions = Object.freeze({actions: Object.freeze([]), diagnostics: Object.freeze([])});
type GetItemActions<I> = ((item: CalendarItem<I>) => readonly CalendarItemAction[]) | undefined;

/**
 * The committed consumer action set of each item record (§5.5), for one `getItemActions` identity: the resolver is
 * called at most once per item object, invalid or duplicate actions are excluded with a diagnostic naming the item.
 * Without the pair every set is empty, so no trigger exists. The built-in move command joins this set in T23.
 */
export function createActionResolver<I>(getItemActions: GetItemActions<I>) {
    const cache = new WeakMap<CalendarItem<I>, ResolvedActions>(), seen = new Set<string>(), pending: Diagnostic[] = [];
    const resolve = (item: CalendarItem<I>): ResolvedActions => {
        if (!getItemActions) return none;
        let resolved = cache.get(item);
        if (!resolved) {
            const result = validateActions(getItemActions(item));
            const diagnostics = result.diagnostics.map(diagnostic => ({...diagnostic, path: `getItemActions(${JSON.stringify(item.id)}).${diagnostic.path}`}));
            resolved = {actions: result.actions, diagnostics};
            cache.set(item, resolved);
            for (const diagnostic of diagnostics) {
                const key = `${diagnostic.path}: ${diagnostic.reason}`;
                if (!seen.has(key)) { seen.add(key); pending.push(diagnostic); }
            }
        }
        return resolved;
    };
    /** Diagnostics of render-time resolution, once each, for a commit effect to report. */
    const drain = (): Diagnostic[] => pending.splice(0);
    return {resolve, drain};
}
export type ActionResolver<I> = ReturnType<typeof createActionResolver<I>>;
/** The action with `id` in a committed set, or undefined: an action that is gone sends no request. */
export const findAction = (resolved: ResolvedActions, id: string) => resolved.actions.find(action => action.id === id);
