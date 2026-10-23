import type {CalendarLayout, CalendarProps} from './reference.js';

/**
 * The working slice of the current prerelease (plan §3.2): the single source for
 * the public declarations, the runtime gate and dist verification. The internal
 * CalendarMonth keeps the full reference surface for upcoming milestones.
 */
export const surfaceVersion = '0.2.0-alpha.2';
export const surfaceProps = [
    'items', 'timeZone', 'anchorDate', 'onNavigate', 'onVisibleRangeChange', 'today', 'locale', 'firstDayOfWeek', 'hourCycle', 'dir',
    'layout', 'mobileBreakpoint', 'agendaPresentation', 'agendaDate', 'onAgendaDateChange', 'dataState', 'onRetryRequest', 'onItemPress', 'sortItems',
    'theme', 'density', 'colorScheme', 'tokens', 'messagesLocale', 'messages', 'className', 'style', 'id', 'aria-label', 'aria-labelledby',
    'portalContainer', 'getItemActions', 'onItemActionRequest', 'sources', 'visibleSourceIds', 'onVisibleSourceIdsChange', 'showSourceSelector',
    'getItemAppearance', 'classNames', 'renderItem', 'renderAgendaItem', 'renderDayHeader', 'renderToolbarContent', 'renderLoading', 'renderEmpty', 'renderError',
] as const satisfies readonly (keyof CalendarProps)[];
/** Layouts accepted by the prerelease. Without 'auto' an explicit layout from this list is required. */
export const surfaceLayouts = ['auto', 'desktop', 'mobile'] as const satisfies readonly CalendarLayout[];
export type SurfaceProp = typeof surfaceProps[number];
export type SurfaceLayout = typeof surfaceLayouts[number];
export type CalendarSurface = Readonly<{version: string; layouts: readonly CalendarLayout[]}>;
export const calendarSurface: CalendarSurface = Object.freeze({version: surfaceVersion, layouts: surfaceLayouts});

/** §5.7 props that a later prerelease adds; with surfaceProps they are exactly the reference props. */
export const laterProps = [
    'selection', 'onSelectionChange', 'onCreateRequest', 'itemMoveStates', 'onItemMoveRequest', 'onItemMoveDraftChange', 'interactionPolicy',
] as const satisfies readonly Exclude<keyof CalendarProps, SurfaceProp>[];
export type LaterProp = typeof laterProps[number];
// Compile-time completeness: every reference prop is either in this prerelease or planned for a later one.
const complete: Exclude<keyof CalendarProps, SurfaceProp | typeof laterProps[number]> extends never ? true : never = true;
void complete;
/** The 0.1 Calendar props without a 0.2 prop of the same name (docs/migration-0.1-to-0.2.md). */
export const removedProps = [
    'events', 'utcOffset', 'timezone', 'onEventPress', 'onEventEdit', 'onEventDelete', 'palette', 'overdueColor', 'criticalColor', 'progressBarColor',
    'isFetching', 'labels', 'data-testid',
] as const;
// React-reserved names (a React 19 ref arrives as a prop) are stripped without a warning.
const reserved: ReadonlySet<string> = new Set(['key', 'ref', 'children']);
const accepted: ReadonlySet<string> = new Set(surfaceProps), later: ReadonlySet<string> = new Set(laterProps), removed: ReadonlySet<string> = new Set(removedProps);
const warned = new Set<string>();
const unavailable = (name: string) => later.has(name) ? `not available in ${surfaceVersion}`
    : removed.has(name) ? 'removed in 0.2; see the migration guide (docs/migration-0.1-to-0.2.md)' : 'not a Calendar prop';
/**
 * Removes props outside the prerelease before validation, so a future prop is never
 * a silent no-op: one development warning per prop name for the whole module (also
 * during a server render). A planned prop is reported as not available yet, a removed
 * 0.1 prop points to the migration guide, any other name is not a Calendar prop.
 */
export function applySurface<P extends object>(props: P): P {
    let result: Record<string, unknown> | undefined;
    for (const [name, value] of Object.entries(props)) {
        if (accepted.has(name)) continue;
        result ??= {...props} as Record<string, unknown>;
        delete result[name];
        if (value === undefined || reserved.has(name) || process.env.NODE_ENV === 'production' || warned.has(name)) continue;
        warned.add(name);
        console.warn(`[@nelmad/calendar] ${name}: ${unavailable(name)}; ignored`);
    }
    return (result ?? props) as P;
}
/** Test seam: warnings are deduplicated for the lifetime of the module. */
export function resetSurfaceWarnings() { warned.clear(); }
