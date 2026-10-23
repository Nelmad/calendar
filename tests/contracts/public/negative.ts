import {
    Calendar,
    type CalendarAgendaControlProps, type CalendarAgendaPresentation, type CalendarDataState, type CalendarInterval, type CalendarLayout, type CalendarProps,
    type CalendarTheme,
} from '@nelmad/calendar';
import {base} from './positive.js';

// Props outside the alpha.2 working slice are typed optional never, not silent no-ops.
// @ts-expect-error selection is not available in alpha.2.
Calendar({...base, selection: null});
// @ts-expect-error onSelectionChange is not available in alpha.2.
Calendar({...base, onSelectionChange: () => {}});
// @ts-expect-error onCreateRequest is not available in alpha.2.
Calendar({...base, onCreateRequest: () => {}});
// Controlled pairs of alpha.2 (T17) are accepted only together.
// @ts-expect-error visibleSourceIds requires its callback.
Calendar({...base, sources: [], visibleSourceIds: []});
// @ts-expect-error onVisibleSourceIdsChange requires visibleSourceIds.
Calendar({...base, sources: [], onVisibleSourceIdsChange: () => {}});
// @ts-expect-error The controlled filter requires sources.
Calendar({...base, visibleSourceIds: [], onVisibleSourceIdsChange: () => {}});
// @ts-expect-error showSourceSelector requires the controlled pair.
Calendar({...base, sources: [], showSourceSelector: false});
// @ts-expect-error visibleSourceIds is a serializable array, not a Set.
Calendar({...base, sources: [], visibleSourceIds: new Set<string>(), onVisibleSourceIdsChange: () => {}});
// @ts-expect-error Source data stays typed by the source generic.
export const wrongSourceData: CalendarProps<unknown, {team: string}> = {...base, sources: [{id: 'a', title: 'A', data: {team: 1}}]};
// @ts-expect-error Sources require a title.
Calendar({...base, sources: [{id: 'a'}]});
// @ts-expect-error itemMoveStates is not available before beta.1.
Calendar({...base, itemMoveStates: []});
// @ts-expect-error onItemMoveRequest is not available before beta.1.
Calendar({...base, onItemMoveRequest: () => {}});
// @ts-expect-error onItemMoveDraftChange is not available before beta.1.
Calendar({...base, onItemMoveDraftChange: () => {}});
// @ts-expect-error getItemActions requires onItemActionRequest.
Calendar({...base, getItemActions: () => []});
// @ts-expect-error onItemActionRequest requires getItemActions.
Calendar({...base, onItemActionRequest: () => {}});
// @ts-expect-error Action tones are 'default' or 'danger'.
Calendar({...base, getItemActions: () => [{id: 'open', label: 'Open', tone: 'warning'}], onItemActionRequest: () => {}});
export const wrongActionPayload: CalendarProps<{ticketId: number}> = {
    ...base, items: [], getItemActions: () => [],
    onItemActionRequest: request => {
        // @ts-expect-error The action request keeps the item payload type.
        const _team: string = request.item.data.teamSlug;
    },
};
// @ts-expect-error interactionPolicy is not available before beta.1.
Calendar({...base, interactionPolicy: {}});
// @ts-expect-error portalContainer accepts an Element, DocumentFragment (ShadowRoot) or null, not a selector.
Calendar({...base, portalContainer: 'body'});
// @ts-expect-error A Document is not a portal container; its body is.
Calendar({...base, portalContainer: document});
// Slots, class callbacks and the appearance resolver (T18) keep their exact typed contexts.
// @ts-expect-error A Month item context has a segment range, never an agenda date.
Calendar({...base, renderItem: context => context.date.slice(0)});
// @ts-expect-error An agenda item context has the agenda date, never a segment range.
Calendar({...base, renderAgendaItem: context => context.segmentRange.start});
// @ts-expect-error The appearance resolver gets no segment or date.
Calendar({...base, getItemAppearance: (_item, context) => ({accentColor: context.date})});
// @ts-expect-error Appearance fields are CSS strings.
Calendar({...base, getItemAppearance: () => ({backgroundColor: 1})});
// @ts-expect-error Appearance has exactly three channels.
Calendar({...base, getItemAppearance: () => ({borderColor: 'red'})});
// @ts-expect-error A data-only class context has no contract branch.
Calendar({...base, classNames: {grid: state => state.kind === 'contract' ? 'never' : undefined}});
// @ts-expect-error The toolbar context exists only for valid data configurations.
Calendar({...base, renderToolbarContent: context => context.kind === 'contract' ? null : null});
// @ts-expect-error A class callback returns a string or undefined.
Calendar({...base, classNames: {day: () => 1}});
// @ts-expect-error Unknown class surfaces are rejected.
Calendar({...base, classNames: {cell: 'x'}});
// @ts-expect-error A data error context has a range; a contract one does not.
Calendar({...base, renderError: context => context.kind === 'contract' ? context.visibleRange.start : null});
// @ts-expect-error The day header context is the day state, not an item context.
Calendar({...base, renderDayHeader: state => state.item});

// Responsive props keep their exact vocabularies; resolved values are not inputs.
// @ts-expect-error Unknown layouts are rejected.
Calendar({...base, layout: 'tablet'});
// @ts-expect-error CalendarLayout lists exactly 'auto', 'desktop' and 'mobile'.
export const tabletLayout: CalendarLayout = 'tablet';
// @ts-expect-error A resolved presentation is not an agendaPresentation value.
Calendar({...base, agendaPresentation: 'sheet'});
// @ts-expect-error CalendarAgendaPresentation lists exactly 'auto' and 'overlay'.
export const popover: CalendarAgendaPresentation = 'popover';
// @ts-expect-error The breakpoint is a number of CSS px, not a length string.
Calendar({...base, mobileBreakpoint: '640px'});

// @ts-expect-error Agenda value requires its callback.
export const agendaValue: CalendarAgendaControlProps = {agendaDate: '2026-09-03'};
// @ts-expect-error Agenda callback requires its value.
export const agendaCallback: CalendarAgendaControlProps = {onAgendaDateChange: (_date: string) => {}};
// @ts-expect-error A half agenda pair is rejected on the component too.
Calendar({...base, agendaDate: '2026-09-03'});
// @ts-expect-error Loading requires a phase.
export const phaseless: CalendarDataState = {status: 'loading'};
// @ts-expect-error Error state requires its payload.
export const payloadless: CalendarDataState = {status: 'error', phase: 'initial'};
// @ts-expect-error Themes are opaque; consumers cannot construct a preset.
export const customTheme: CalendarTheme = {name: 'custom'};
// @ts-expect-error A lookalike of a preset is not a preset either.
export const lookalike: CalendarTheme = {name: 'neutral'};
// @ts-expect-error All-day end is required.
export const openAllDay: CalendarInterval = {kind: 'allDay', start: '2026-09-03'};
// @ts-expect-error Explicit timeZone is mandatory.
Calendar({items: [], anchorDate: '2026-09-01', onNavigate: () => {}, layout: 'desktop'});
// @ts-expect-error Unknown density values are rejected.
Calendar({...base, density: 'dense'});

// No legacy 0.1 props.
// @ts-expect-error events
Calendar({...base, events: []});
// @ts-expect-error utcOffset
Calendar({...base, utcOffset: 180});
// @ts-expect-error timezone
Calendar({...base, timezone: 'UTC'});
// @ts-expect-error onEventPress
Calendar({...base, onEventPress: () => {}});
// @ts-expect-error onEventEdit
Calendar({...base, onEventEdit: () => {}});
// @ts-expect-error onEventDelete
Calendar({...base, onEventDelete: () => {}});

export const wrongPayload: CalendarProps<{ticketId: number}> = {
    ...base, items: [],
    onItemPress: request => {
        // @ts-expect-error Item payload stays typed.
        const _team: string = request.item.data.teamSlug;
    },
};
export function immutableInputs(props: CalendarProps) {
    // @ts-expect-error Input arrays cannot be mutated by the SDK.
    props.items.push(props.items[0]);
}

// Beta.1 reference types are not exported yet.
// @ts-expect-error Selection is beta.1.
import type {CalendarSelectionControlProps} from '@nelmad/calendar';
// @ts-expect-error Move is beta.1.
import type {CalendarMoveRequest} from '@nelmad/calendar';
// @ts-expect-error Interaction policy is beta.1.
import type {CalendarInteractionPolicy} from '@nelmad/calendar';
// @ts-expect-error Move proposals are beta.1.
import type {CalendarMoveProposal} from '@nelmad/calendar';
export type Unused = [CalendarSelectionControlProps, CalendarMoveRequest, CalendarInteractionPolicy, CalendarMoveProposal];

// Removed 0.1 exports.
// @ts-expect-error Removed 0.1 export.
import {CalendarSkeleton} from '@nelmad/calendar';
// @ts-expect-error Removed 0.1 export.
import {getMonthGridRange} from '@nelmad/calendar';
// @ts-expect-error Removed 0.1 export.
import {getMonthGridWeeks} from '@nelmad/calendar';
// @ts-expect-error Removed 0.1 export.
import {getMonthDates} from '@nelmad/calendar';
// @ts-expect-error Removed 0.1 export.
import {buildWeekLayout} from '@nelmad/calendar';
// @ts-expect-error Removed 0.1 export.
import {formatEventTime} from '@nelmad/calendar';
// @ts-expect-error Removed 0.1 export.
import {dateUtils} from '@nelmad/calendar';
// @ts-expect-error Removed 0.1 export.
import {defaultLabels} from '@nelmad/calendar';
// @ts-expect-error Removed 0.1 export.
import {defaultTheme} from '@nelmad/calendar';
// @ts-expect-error Removed 0.1 export.
import {defaultPalette} from '@nelmad/calendar';
// @ts-expect-error Removed 0.1 export.
import {DEFAULT_LOCALE} from '@nelmad/calendar';
// @ts-expect-error Removed 0.1 export.
import {defaultOverdueColor} from '@nelmad/calendar';
// @ts-expect-error Removed 0.1 export.
import {defaultCriticalColor} from '@nelmad/calendar';
// @ts-expect-error Removed 0.1 export.
import {defaultProgressBarColor} from '@nelmad/calendar';
void [CalendarSkeleton, getMonthGridRange, getMonthGridWeeks, getMonthDates, buildWeekLayout, formatEventTime, dateUtils, defaultLabels,
    defaultTheme, defaultPalette, DEFAULT_LOCALE, defaultOverdueColor, defaultCriticalColor, defaultProgressBarColor];
// @ts-expect-error Removed 0.1 type.
import type {CalendarEvent} from '@nelmad/calendar';
// @ts-expect-error Removed 0.1 type.
import type {CalendarEventVariant} from '@nelmad/calendar';
// @ts-expect-error Removed 0.1 type.
import type {SeriesActionScope} from '@nelmad/calendar';
// @ts-expect-error Removed 0.1 type.
import type {CalendarLabels} from '@nelmad/calendar';
// @ts-expect-error Removed 0.1 type.
import type {VariantColor} from '@nelmad/calendar';
// @ts-expect-error Removed 0.1 type.
import type {VariantPalette} from '@nelmad/calendar';
// @ts-expect-error Removed 0.1 type.
import type {WeekLayout} from '@nelmad/calendar';
// @ts-expect-error Removed 0.1 type.
import type {EventSegment} from '@nelmad/calendar';
export type Removed = [CalendarEvent, CalendarEventVariant, SeriesActionScope, CalendarLabels, VariantColor, VariantPalette, WeekLayout, EventSegment];
