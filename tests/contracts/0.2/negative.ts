import {
    Calendar,
    type CalendarAgendaControlProps, type CalendarClassNames, type CalendarErrorSlotContext,
    type CalendarInterval, type CalendarItemActionsProps, type CalendarItemSlotContext,
    type CalendarMoveControlProps, type CalendarProps, type CalendarSelectionControlProps,
    type CalendarSourceFilterControlProps, type CalendarTheme,
} from '../../../src/v02/reference.js';
import {base} from './positive.js';

// @ts-expect-error Agenda value requires its callback.
export const agendaValue: CalendarAgendaControlProps = {agendaDate: '2026-09-03'};
// @ts-expect-error Agenda callback requires its value.
export const agendaCallback: CalendarAgendaControlProps = {onAgendaDateChange: (_date: string) => {}};
// @ts-expect-error Selection value requires its callback.
export const selectionValue: CalendarSelectionControlProps = {selection: null};
// @ts-expect-error Selection callback requires its value.
export const selectionCallback: CalendarSelectionControlProps = {onSelectionChange: () => {}};
// @ts-expect-error Create is only available with controlled selection.
export const createAlone: CalendarSelectionControlProps = {onCreateRequest: () => {}};
// @ts-expect-error Filter value requires its callback and sources.
export const filterValue: CalendarSourceFilterControlProps = {visibleSourceIds: []};
// @ts-expect-error Filter callback requires its value.
export const filterCallback: CalendarSourceFilterControlProps = {sources: [], onVisibleSourceIdsChange: () => {}};
// @ts-expect-error Controlled filtering requires sources even for an empty list.
export const filterNoSources: CalendarSourceFilterControlProps = {visibleSourceIds: [], onVisibleSourceIdsChange: () => {}};
// @ts-expect-error Selector configuration requires the controlled filter pair.
export const selectorAlone: CalendarSourceFilterControlProps = {sources: [], showSourceSelector: false};
// @ts-expect-error Move states require the request callback.
export const moveStates: CalendarMoveControlProps = {itemMoveStates: []};
// @ts-expect-error Move callback requires externally controlled states.
export const moveCallback: CalendarMoveControlProps = {onItemMoveRequest: () => {}};
// @ts-expect-error Draft callback cannot enable move alone.
export const draftAlone: CalendarMoveControlProps = {onItemMoveDraftChange: () => {}};
// @ts-expect-error Action provider requires a request callback.
export const actionsProvider: CalendarItemActionsProps = {getItemActions: () => []};
// @ts-expect-error Action callback requires its provider.
export const actionsCallback: CalendarItemActionsProps = {onItemActionRequest: () => {}};
// @ts-expect-error Themes are opaque; consumers cannot construct a preset.
export const customTheme: CalendarTheme = {name: 'custom'};
// @ts-expect-error All-day end is required.
export const openAllDay: CalendarInterval = {kind: 'allDay', start: '2026-09-03'};
// @ts-expect-error Author timeZone is limited to timed intervals.
export const zonedAllDay: CalendarInterval = {kind: 'allDay', start: '2026-09-03', end: '2026-09-04', timeZone: 'UTC'};
// @ts-expect-error Old event props are not part of the reference API.
Calendar({...base, events: []});
// @ts-expect-error Required current items cannot be replaced with events.
Calendar({anchorDate: '2026-09-03', timeZone: 'UTC', onNavigate: () => {}, events: []});
// @ts-expect-error The reference has no legacy helper exports.
import {getMonthDates} from '../../../src/v02/reference.js';
// @ts-expect-error The reference has no legacy skeleton component.
import {CalendarSkeleton} from '../../../src/v02/reference.js';
void getMonthDates;
void CalendarSkeleton;

export const wrongPayload: CalendarProps<{ticketId: number}> = {
    ...base,
    onItemPress: request => {
        // @ts-expect-error Item payload remains independent from source payload.
        const _team: string = request.item.data.teamSlug;
    },
};
export function immutableInputs(props: CalendarProps) {
    // @ts-expect-error Input arrays cannot be mutated by the SDK.
    props.items.push(props.items[0]);
    // @ts-expect-error Optional sources array is readonly too.
    props.sources?.sort();
    // @ts-expect-error Controlled filter IDs are readonly.
    props.visibleSourceIds?.push('new');
}
export function invalidNarrowing(context: CalendarErrorSlotContext, slot: CalendarItemSlotContext) {
    if (context.kind === 'contract') {
        // @ts-expect-error Contract errors have no visible date range.
        const _start: string = context.visibleRange.start;
    }
    if (slot.view === 'month') {
        // @ts-expect-error Month segment has no single agenda date.
        const _date: string = slot.date;
    } else {
        // @ts-expect-error Agenda slot has no week segment.
        const _start: string = slot.segmentRange.start;
    }
}
export const invalidClasses: CalendarClassNames = {
    grid: state => {
        // @ts-expect-error Grid class callback only receives a data state.
        const _contract: 'contract' = state.kind;
        return state.layout;
    },
};
