import type {CalendarAgendaPresentation, CalendarLayout, CalendarResolvedAgendaPresentation, CalendarResolvedLayout} from '../reference.js';

export const defaultMobileBreakpoint = 640;
export type AgendaOverlay = Exclude<CalendarResolvedAgendaPresentation, 'inline'>;

/** A content-box width is a valid measurement only when positive and finite (CSS px). */
export const validWidth = (width: number | null | undefined): width is number => typeof width === 'number' && Number.isFinite(width) && width > 0;
/** Exact §7 boundary: `< breakpoint` is mobile, `≥ breakpoint` desktop. */
export function layoutForWidth(width: number, breakpoint = defaultMobileBreakpoint): CalendarResolvedLayout {
    return width < breakpoint ? 'mobile' : 'desktop';
}
/**
 * Render-time resolution. A forced layout never depends on width. `auto` uses the last valid
 * measurement; before one exists it is mobile on the server and the first client render, or keeps
 * the presentation of a runtime forced → auto switch until the commit-time read settles it (a valid
 * measurement replaces the carry, an unmeasurable root drops it to mobile; no intermediate commit).
 */
export function resolveLayout(requested: CalendarLayout | undefined, measured: CalendarResolvedLayout | null, carried: CalendarResolvedLayout | null = null): CalendarResolvedLayout {
    if (requested === 'desktop' || requested === 'mobile') return requested;
    return measured ?? carried ?? 'mobile';
}
/**
 * Loop guard of `auto` (QA-04): the root is measured again in the commit of each width-driven switch. When
 * the new layout itself moved the content box back across the breakpoint (a page or ancestor scrollbar that
 * exists in only one layout), the switch is self-feedback. Without feedback the measurement agrees with the
 * switch, and the exact §7 boundary keeps deciding.
 */
export function switchFeedback(from: CalendarResolvedLayout, to: CalendarResolvedLayout, widthAfter: number, breakpoint = defaultMobileBreakpoint): boolean {
    return from !== to && validWidth(widthAfter) && layoutForWidth(widthAfter, breakpoint) === from;
}
/**
 * Hysteresis band of a feedback switch that moved the content box by `band` px (|after − before|). Within
 * `[breakpoint − band, breakpoint + band)` either the layout shown already fits the exact boundary, or neither
 * layout fits the width it produces itself (§7 has no fixed point there): the current layout stays. Outside the
 * band the layout chosen by the exact boundary also fits its own width, so the boundary decides again.
 */
export function withinFeedbackBand(width: number, band: number | null, breakpoint = defaultMobileBreakpoint): boolean {
    return band !== null && band > 0 && width >= breakpoint - band && width < breakpoint + band;
}
/** §5.7 defaults: popover on desktop; inline on mobile, or a modal sheet for an explicit overlay. */
export function resolveAgendaPresentation(layout: CalendarResolvedLayout, requested: CalendarAgendaPresentation = 'auto'): CalendarResolvedAgendaPresentation {
    if (layout === 'desktop') return 'popover';
    return requested === 'overlay' ? 'sheet' : 'inline';
}

export type PresentationState = Readonly<{
    /** The overlay that the last commit mounted, if any; inline needs no mount state. */
    mounted: AgendaOverlay | null;
    /** Presentation whose owning stack holds focus, including focus displaced to body by its removal. */
    owner: CalendarResolvedAgendaPresentation | null;
}>;
/**
 * One transactional passive switch (§11.3): an open overlay survives only as the same resolved
 * presentation, or as the new one when focus is inside the owning stack. With external focus the
 * old surface closes and no new overlay mounts. Inline is always the single rendered agenda.
 */
export function openOverlay(state: PresentationState, next: CalendarResolvedAgendaPresentation): AgendaOverlay | null {
    if (next === 'inline') return null;
    return state.mounted === next || state.owner !== null ? next : null;
}
/** Focus moves to the logically same control only when the switch replaced the owning surface. */
export function migratesFocus(state: PresentationState, next: CalendarResolvedAgendaPresentation): boolean {
    return state.owner !== null && state.owner !== next;
}

export type AcceptanceRule = Readonly<{open: AgendaOverlay | null; focus: 'first-control' | 'heading' | 'none'; announce: boolean}>;
/**
 * Input-specific rule (§5.2.1/§12.2) for a still-current user request, applied once in the
 * presentation resolved when the target is accepted: the old presentation is never mounted for it.
 */
export function acceptanceRule(presentation: CalendarResolvedAgendaPresentation, input: 'pointer' | 'keyboard', changed: boolean): AcceptanceRule {
    if (presentation === 'popover') return {open: 'popover', focus: 'first-control', announce: false};
    if (presentation === 'sheet') return {open: 'sheet', focus: 'heading', announce: false};
    return input === 'keyboard' ? {open: null, focus: 'heading', announce: false} : {open: null, focus: 'none', announce: changed};
}
