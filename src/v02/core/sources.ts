import type {CalendarSource} from '../reference.js';

const sameIds = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((id, index) => id === b[index]);

/**
 * §5.6: the next controlled filter after toggling `id` in the accepted one. The result holds unique known IDs in
 * `sources` order, never the order of presses; `undefined` means the set would not change, so no callback is sent.
 * `accepted` is the normalized accepted value (validateRecords), never an optimistic local state.
 */
export function toggleSource(sources: readonly CalendarSource<unknown>[], accepted: readonly string[], id: string): readonly string[] | undefined {
    if (!sources.some(source => source.id === id)) return undefined;
    const visible = new Set(accepted);
    if (visible.has(id)) visible.delete(id); else visible.add(id);
    const next = sources.filter(source => visible.has(source.id)).map(source => source.id);
    return sameIds(next, accepted) ? undefined : next;
}

/**
 * §5.6: the built-in selector exists only with the controlled pair and at least two valid sources, unless the
 * consumer hides it with `showSourceSelector={false}` (filtering still applies then).
 */
export const sourceSelectorShown = (validSources: number, controlled: boolean, showSourceSelector: boolean | undefined) =>
    controlled && validSources >= 2 && showSourceSelector !== false;
