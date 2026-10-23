import {
    Calendar, classicTheme, getCalendarVisibleRange, neutralTheme,
    type CalendarClassNames, type CalendarErrorSlotContext, type CalendarInterval,
    type CalendarItem, type CalendarItemPressRequest, type CalendarItemSlotContext,
    type CalendarMoveRequest, type CalendarProps, type CalendarRootState,
    type CalendarSource,
} from '../../../src/v02/reference.js';

type ItemData = {ticketId: number};
type SourceData = {teamSlug: string};
const items: readonly CalendarItem<ItemData>[] = [{
    id: 'one', title: 'Review', data: {ticketId: 42},
    interval: {kind: 'timed', start: '2026-09-03T09:00:00+03:00'},
}];
const sources: readonly CalendarSource<SourceData>[] = [{
    id: 'engineering', title: 'Engineering', data: {teamSlug: 'core'},
}];
export const base = {items, anchorDate: '2026-09-03', timeZone: 'Europe/Moscow', onNavigate: (_date: string) => {}};
export const typed: CalendarProps<ItemData, SourceData> = {
    ...base, sources, theme: classicTheme,
    agendaDate: '2026-09-03', onAgendaDateChange: date => { const _string: string = date; },
    selection: null, onSelectionChange: selection => { const _end: string | undefined = selection?.end; },
    onCreateRequest: range => { const _start: string = range.start; },
    visibleSourceIds: ['engineering'] as const,
    onVisibleSourceIdsChange: ids => { const _ids: readonly string[] = ids; },
    itemMoveStates: [] as const,
    onItemMoveRequest: request => { const _id: number = request.item.data.ticketId; },
    onItemMoveDraftChange: id => { const _id: string | null = id; },
    getItemActions: item => [{id: String(item.data.ticketId), label: 'Open'}] as const,
    onItemActionRequest: request => { const _id: number = request.item.data.ticketId; },
    getItemAppearance: (item, context) => ({textColor: item.data.ticketId && context.source?.data?.teamSlug ? 'black' : 'grey'}),
    renderItem: context => `${context.item.data.ticketId}/${context.source?.data?.teamSlug}/${context.segmentRange.start}`,
    renderAgendaItem: context => `${context.item.data.ticketId}/${context.date}`,
    classNames: {grid: state => state.dataState.status, item: context => context.segmentRange.start},
    style: {'--nelmad-calendar-color-text': 'black', width: 500},
};

// Inference through the generic component, without explicit <ItemData, SourceData>.
Calendar({
    ...base, sources, theme: neutralTheme,
    itemMoveStates: [],
    onItemMoveRequest: request => { const _request: CalendarMoveRequest<ItemData> = request; },
    onItemPress: request => { const _id: number = request.item.data.ticketId; },
    renderItem: context => {
        const _ticket: number = context.item.data.ticketId;
        const _team: string | undefined = context.source?.data?.teamSlug;
        return context.segmentRange.end;
    },
});
export const visibleRange = getCalendarVisibleRange({anchorDate: '2026-09-03', timeZone: 'UTC', firstDayOfWeek: 'monday'});

export function narrowInterval(interval: CalendarInterval) {
    if (interval.kind === 'allDay') { const _end: string = interval.end; }
    else { const _end: string | undefined = interval.end; const _zone: string | undefined = interval.timeZone; }
}
export function narrowRoot(state: CalendarRootState) {
    if (state.kind === 'contract') { const _error: Error = state.dataState.error; const _phase: 'initial' = state.dataState.phase; }
    else if (state.dataState.status === 'error') { const _error: unknown = state.dataState.error; }
}
export function narrowError(context: CalendarErrorSlotContext) {
    if (context.kind === 'contract') { const _error: Error = context.error; const _stale: false = context.hasStaleItems; }
    else { const _range: string = context.visibleRange.start; const _error: unknown = context.state.error; }
}
export function narrowSlots(context: CalendarItemSlotContext<ItemData, SourceData>) {
    if (context.view === 'month') { const _range: string = context.segmentRange.start; }
    else { const _date: string = context.date; }
}
export function narrowPress(request: CalendarItemPressRequest<ItemData>) {
    if (request.view === 'month') { const _end: string = request.segmentRange.end; }
    else { const _date: string = request.date; }
}
export const classes: CalendarClassNames<ItemData, SourceData> = {
    root: state => state.kind, status: state => state.kind,
    grid: state => { const _data: 'data' = state.kind; return state.dataState.status; },
    toolbar: state => state.visibleRange.start,
    sourceSelector: state => { const _data: 'data' = state.kind; return state.layout; },
};
