import {tokenVariables} from '../themes/classic.js';

/** §10.3.4: all 27 public variables of table 10.3.1 and the inherited font properties, nothing else. */
export const mirroredVariables: readonly string[] = Object.values(tokenVariables).flatMap(group => Object.values(group));
export const mirroredFontProperties = ['font-family', 'font-size', 'font-style', 'font-weight', 'font-stretch', 'line-height', 'letter-spacing'] as const;
const mirrored = [...mirroredVariables, ...mirroredFontProperties];

/** Owner-side checkpoints (committed render, its ResizeObserver) that refresh open portal mirrors. */
export type MirrorHub = Readonly<{subscribe: (listener: () => void) => () => void; notify: () => void}>;
export function createMirrorHub(): MirrorHub {
    const listeners = new Set<() => void>();
    return {subscribe: listener => { listeners.add(listener); return () => { listeners.delete(listener); }; }, notify: () => { for (const listener of [...listeners]) listener(); }};
}
const written = new WeakMap<HTMLElement, Map<string, string>>();
/**
 * Reads only the owner root's computed values and writes the changed ones as inline declarations of the
 * portal theme root. A DOM-only write: it never renders, so a refresh cannot start a render/resize loop.
 */
export function mirrorTheme(owner: Element, target: HTMLElement): number {
    const window = owner.ownerDocument.defaultView;
    if (!window) return 0;
    const source = window.getComputedStyle(owner), last = written.get(target) ?? new Map<string, string>();
    written.set(target, last);
    let writes = 0;
    for (const name of mirrored) {
        const value = source.getPropertyValue(name).trim();
        if (last.get(name) === value) continue;
        last.set(name, value); writes++;
        if (value) target.style.setProperty(name, value); else target.style.removeProperty(name);
    }
    return writes;
}
