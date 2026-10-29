import {useEffect, useRef, type CSSProperties, type ReactNode} from 'react';
import type {CalendarClassName} from '../reference.js';
import type {ResolvedAppearance} from '../core/appearance.js';
import {useServerStyle} from '../primitives/serverStyle.js';
import {Icon} from '../primitives/index.js';

/**
 * `classNames` resolution (§10.4): a string, or a pure callback of its typed state. Anything else, including a callback
 * result that is not a nonempty string, adds no class; validation already rejected a field of the wrong type.
 */
export function resolveClass<T>(value: CalendarClassName<T> | undefined, state: T): string | undefined {
    const result: unknown = typeof value === 'function' ? value(state) : value;
    return typeof result === 'string' && result.trim() ? result : undefined;
}
export const classes = (...values: (string | undefined)[]) => values.filter(Boolean).join(' ');

/** The passive content slots of §10.4, checked by the best-effort diagnostics below. */
export type PassiveSlot = 'renderItem' | 'renderAgendaItem' | 'renderDayHeader';
/** Package-owned wrapper of consumer slot content inside an item or day header; the marker is private (§5.7 table). */
export function SlotContent({slot, id, className, children}: {slot: PassiveSlot; id?: string; className?: string; children: ReactNode}) {
    return <span id={id} className={classes('nc-slot', className)} data-nc-slot={slot}>{children}</span>;
}

/** Inline declarations of the item surface: background and text channels of the resolved appearance. */
export function surfaceStyle(appearance: ResolvedAppearance): CSSProperties | undefined {
    if (appearance.background === undefined && appearance.text === undefined) return undefined;
    return {...(appearance.background !== undefined ? {backgroundColor: appearance.background} : {}), ...(appearance.text !== undefined ? {color: appearance.text} : {})};
}
/**
 * The accent marker (§10.3.3): two nested `color` declarations over the theme accent of the stylesheet. Each layer is a
 * separate CSS color declaration, so a value that the UA rejects at assignment leaves the layer below it (source, then
 * `color.accent`); the inner span draws its inline-start border in `currentcolor`, which forced colors keep visible.
 * Spec v8 §10.3.4: a server-rendered marker (inline agenda) gets its validated colors back when a strict CSP blocked them.
 */
export function AccentMarker({appearance}: {appearance: ResolvedAppearance}) {
    const source = useRef<HTMLSpanElement>(null), item = useRef<HTMLSpanElement>(null);
    const sourceStyle = appearance.sourceAccent !== undefined ? {color: appearance.sourceAccent} : undefined, itemStyle = appearance.accent !== undefined ? {color: appearance.accent} : undefined;
    useServerStyle(source, sourceStyle); useServerStyle(item, itemStyle);
    // An empty decorative node: nothing to hide from assistive technology, so no aria-hidden.
    return <span ref={source} className="nc-item-accent" style={sourceStyle}><span ref={item} style={itemStyle}/></span>;
}

/**
 * The package-owned pending marker of an item with an accepted pending move (#10 decision Q9): a static clock in the
 * resolved item text color, at the inline end of the segment or row, outside the slot content, so `renderItem` and
 * `renderAgendaItem` never remove it. Decorative: the agenda summary carries the state for assistive technology.
 */
export function PendingMarker() {
    return <span className="nc-item-pending"><Icon name="pending"/></span>;
}

// Interactive DOM that a passive slot must not contain (§10.4): links, controls, editable or focusable nodes, widget
// roles, draggable nodes and inline handlers. React handlers leave no DOM trace; the check is best-effort by design.
const interactive = ['a[href]', 'area[href]', 'button', 'input', 'select', 'textarea', 'iframe', 'object', 'embed', 'audio[controls]', 'video[controls]', 'summary',
    '[contenteditable]:not([contenteditable="false"])', '[tabindex]', '[draggable="true"]', '[onclick]', '[onkeydown]', '[onkeyup]', '[onmousedown]', '[onpointerdown]',
    '[ontouchstart]', ...['button', 'link', 'checkbox', 'radio', 'switch', 'tab', 'menuitem', 'menuitemcheckbox', 'menuitemradio', 'option', 'textbox', 'searchbox',
        'combobox', 'slider', 'spinbutton', 'listbox', 'menu', 'menubar', 'grid', 'tree', 'treegrid', 'tablist', 'radiogroup', 'scrollbar'].map(role => `[role="${role}"]`)];
const interactiveSelector = interactive.join(', ');
/** A short description of the first interactive descendant of a slot wrapper, for the development warning. */
export function interactiveDescendant(slot: Element): string | undefined {
    const node = slot.querySelector(interactiveSelector);
    if (!node) return undefined;
    const match = interactive.find(selector => node.matches(selector))!, attribute = /\[([\w-]+)/.exec(match)?.[1];
    return `<${node.localName}${attribute === 'role' ? ` role="${node.getAttribute('role')}"` : attribute ? ` ${attribute}` : ''}>`;
}
/**
 * §10.4 best-effort development diagnostics: after each commit, the actual DOM descendants of the package-owned slot
 * wrappers in the given scopes (grid, agenda, a portal). Portals, shadow trees and later mutations inside consumer
 * content are not seen; an undetected violation is still not allowed. Production builds register no effect.
 */
function useDevelopmentPassiveDiagnostics(scopes: () => readonly (Element | null | undefined)[], warn: (path: string, reason: string) => void) {
    useEffect(() => {
        for (const scope of scopes()) for (const slot of scope?.querySelectorAll<HTMLElement>('[data-nc-slot]') ?? []) {
            const found = interactiveDescendant(slot);
            if (found) warn(slot.dataset.ncSlot!, `Interactive content ${found} is not allowed in passive slot content; use onItemPress or getItemActions`);
        }
    });
}
export const usePassiveDiagnostics: typeof useDevelopmentPassiveDiagnostics = process.env.NODE_ENV === 'production' ? () => undefined : useDevelopmentPassiveDiagnostics;
