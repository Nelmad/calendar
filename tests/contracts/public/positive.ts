import {
    Calendar, classicTheme, getCalendarVisibleRange, neutralTheme,
    type CalendarAgendaItemSlotContext, type CalendarAgendaState, type CalendarClassName, type CalendarClassNames, type CalendarDataAttribute, type CalendarDayState,
    type CalendarEmptySlotContext, type CalendarErrorSlotContext, type CalendarItemAppearance, type CalendarItemAppearanceContext, type CalendarItemSlotContext,
    type CalendarItemView, type CalendarLoadingSlotContext, type CalendarMonthItemSlotContext, type CalendarOverflowState, type CalendarResolvedAgendaPresentation,
    type CalendarResolvedLayout, type CalendarRootState, type CalendarToolbarSlotContext,
    type CalendarAgendaControlProps, type CalendarAgendaPresentation, type CalendarBaseProps, type CalendarCSSVariable, type CalendarDataState, type CalendarDateRange,
    type CalendarInterval, type CalendarItem, type CalendarItemAction, type CalendarItemActionRequest, type CalendarItemActionsProps, type CalendarItemPressRequest,
    type CalendarLayout, type CalendarMessages, type CalendarSource, type CalendarSourceFilterControlProps,
    type CalendarProps, type CalendarSortContext, type CalendarTheme, type CalendarThemeTokens, type CalendarVisibleRange,
    type CalendarVisibleRangeOptions, type CalendarWeekday, type IanaTimeZone, type ISODate, type RFC3339DateTime,
} from '@nelmad/calendar';

// Public alpha.2 declarations only: no reference or private imports.
type ItemData = {ticketId: number};
const start: RFC3339DateTime = '2026-09-03T09:00:00+03:00', zone: IanaTimeZone = 'Europe/Moscow', day: ISODate = '2026-09-03';
const items: readonly CalendarItem<ItemData>[] = [
    {id: 'one', title: 'Review', calendarId: 'engineering', data: {ticketId: 42}, interval: {kind: 'timed', start, timeZone: zone}},
    {id: 'two', title: 'Sprint', data: {ticketId: 43}, interval: {kind: 'allDay', start: day, end: '2026-09-05'}},
];
const layout: CalendarLayout = 'desktop';
export const base = {items, anchorDate: day, timeZone: zone, onNavigate: (_date: string) => {}, layout};

const tokens: CalendarThemeTokens = {color: {surface: '#fff', accent: 'rebeccapurple'}, typography: {fontSize: '14px'}, density: {dayMinHeight: '6rem'},
    radii: {md: '8px'}, components: {itemBackground: 'Canvas'}};
const variable: CalendarCSSVariable = '--nelmad-calendar-color-text';
const messages: Partial<CalendarMessages> = {todayLabel: 'Today', agendaHeading: date => `Events: ${date}`, itemCountLabel: (date, count) => `${date}: ${count}`};
const theme: CalendarTheme = classicTheme;
const weekday: CalendarWeekday = 'monday';

// Every alpha.2 prop together, with the controlled agenda pair.
type SourceData = {team: string};
export const complete: CalendarProps<ItemData, SourceData> = {
    ...base, today: day, locale: 'ru-RU', firstDayOfWeek: weekday, hourCycle: 24, dir: 'ltr',
    layout: 'auto', mobileBreakpoint: 720, agendaPresentation: 'overlay',
    agendaDate: day, onAgendaDateChange: date => { const _date: string = date; },
    onVisibleRangeChange: range => { const _range: CalendarVisibleRange = range; },
    dataState: {status: 'loading', phase: 'refresh'}, onRetryRequest: () => {},
    onItemPress: request => { const _id: number = request.item.data.ticketId; },
    sortItems: (a, b, context) => { const _context: CalendarSortContext = context; return a.data.ticketId - b.data.ticketId; },
    theme, density: 'comfortable', colorScheme: 'dark', tokens, messagesLocale: 'en-US', messages,
    className: 'host', style: {[variable]: 'black', width: 500}, id: 'calendar', 'aria-label': 'Releases', 'aria-labelledby': 'heading',
    portalContainer: null,
    sources: [{id: 'engineering', title: 'Engineering', color: '#3366ff', data: {team: 'core'}}], visibleSourceIds: ['engineering'],
    onVisibleSourceIdsChange: ids => { const _ids: readonly string[] = ids; }, showSourceSelector: true,
    getItemActions: item => item.data.ticketId > 0 ? [{id: 'open', label: 'Open'}, {id: 'delete', label: 'Delete', tone: 'danger'}] : [],
    onItemActionRequest: request => { const _id: number = request.item.data.ticketId; const _action: string = request.actionId; },
};
// Portal scope (§10.3.4): an Element, a ShadowRoot, or null (like omitting it) for the owner document body.
const shadow: ShadowRoot = document.createElement('div').attachShadow({mode: 'open'});
for (const portalContainer of [document.body, shadow, null]) Calendar({...base, portalContainer});
export const uncontrolled: CalendarBaseProps<ItemData> & CalendarAgendaControlProps = base;
export const controlledAgenda: CalendarAgendaControlProps = {agendaDate: day, onAgendaDateChange: () => {}};

// Inference through the generic component, without explicit type arguments.
Calendar({
    ...base,
    onItemPress: request => {
        const _id: number = request.item.data.ticketId;
        if (request.view === 'month') { const _end: string = request.segmentRange.end; }
    },
    sortItems: (a, b) => a.data.ticketId - b.data.ticketId,
});
Calendar({items: [], anchorDate: day, timeZone: 'UTC', onNavigate: () => {}, layout: 'desktop', dataState: {status: 'error', phase: 'initial', error: new Error('x')}});

// Responsive alpha.2: layout is optional (default 'auto'); every layout and presentation is accepted.
const {layout: _layout, ...withoutLayout} = base;
Calendar(withoutLayout);
export const layouts: readonly CalendarLayout[] = ['auto', 'desktop', 'mobile'];
export const presentations: readonly CalendarAgendaPresentation[] = ['auto', 'overlay'];
for (const value of layouts) for (const agendaPresentation of presentations) Calendar({...withoutLayout, layout: value, agendaPresentation, mobileBreakpoint: 640});
export const responsive: CalendarBaseProps<ItemData> = {...withoutLayout, mobileBreakpoint: 480.5};

const options: CalendarVisibleRangeOptions = {anchorDate: day, timeZone: 'UTC', firstDayOfWeek: 'monday', locale: 'en-US'};
export const visibleRange: CalendarDateRange = getCalendarVisibleRange(options);

export function narrowDataState(state: CalendarDataState) {
    if (state.status === 'ready') return 'ready';
    const _phase: 'initial' | 'refresh' = state.phase;
    if (state.status === 'error') { const _error: unknown = state.error; }
    return state.status;
}
export function narrowInterval(interval: CalendarInterval) {
    if (interval.kind === 'allDay') { const _end: string = interval.end; }
    else { const _end: string | undefined = interval.end; const _zone: string | undefined = interval.timeZone; }
}
export function narrowPress(request: CalendarItemPressRequest<ItemData>) {
    if (request.view === 'month') { const _range: CalendarDateRange = request.segmentRange; }
    else { const _date: string = request.date; }
}

// Item actions (§5.5, T17): the pair is supplied together; the item payload type flows into both callbacks.
const actions: readonly CalendarItemAction[] = [{id: 'open', label: 'Open'}, {id: 'complete', label: 'Complete', tone: 'default'}];
export const actionPair: CalendarItemActionsProps<ItemData> = {getItemActions: () => actions, onItemActionRequest: (request: CalendarItemActionRequest<ItemData>) => {
    const _ticket: number = request.item.data.ticketId;
}};
export const noActions: CalendarItemActionsProps = {};
Calendar({...base, ...actionPair});

// Controlled sources (§5.6, T17): serializable arrays; item and source generics are independent.
const sources: readonly CalendarSource<SourceData>[] = [{id: 'engineering', title: 'Engineering', data: {team: 'core'}}, {id: 'design', title: 'Design'}];
export const filter: CalendarSourceFilterControlProps<SourceData> = {sources, visibleSourceIds: ['design'], onVisibleSourceIdsChange: () => {}, showSourceSelector: false};
export const sourcesOnly: CalendarSourceFilterControlProps<SourceData> = {sources};
Calendar<ItemData, SourceData>({...base, sources, visibleSourceIds: [], onVisibleSourceIdsChange: () => {}});
Calendar({...base, sources});
export const sourceData = (source: CalendarSource<SourceData>) => source.data?.team;

// Themes, slots, class callbacks and item appearance (T18): both presets, exact typed contexts per surface.
export const presets: readonly CalendarTheme[] = [classicTheme, neutralTheme];
Calendar({...base, theme: neutralTheme, density: 'comfortable', colorScheme: 'system'});
const appearance = (item: CalendarItem<ItemData>, context: CalendarItemAppearanceContext<SourceData>): CalendarItemAppearance | undefined =>
    item.data.ticketId > 0 ? {accentColor: context.source?.color ?? 'CanvasText', ...(context.timeZone === 'UTC' ? {textColor: 'black'} : {})} : undefined;
const classNames: CalendarClassNames<ItemData, SourceData> = {
    root: (state: CalendarRootState) => state.kind === 'contract' ? `failed-${state.dataState.error.message}` : `layout-${state.layout}`,
    status: state => state.dataState.status,
    toolbar: (state: CalendarToolbarSlotContext) => `${state.kind}-${state.anchorDate}-${state.visibleRange.start}`,
    sourceSelector: state => state.dataState.status, grid: state => `grid-${state.dir}`, weekdayHeader: 'weekday',
    day: (state: CalendarDayState) => state.isToday ? 'today' : undefined, dayHeader: state => state.isOutsideMonth ? 'outside' : undefined,
    item: (state: CalendarMonthItemSlotContext<ItemData, SourceData>) => `${state.segmentRange.start}-${state.item.data.ticketId}-${state.source?.data?.team ?? ''}`,
    itemActions: state => state.date, agendaItem: (state: CalendarAgendaItemSlotContext<ItemData>) => state.date,
    overflowIndicator: (state: CalendarOverflowState) => `more-${state.hiddenItemCount}`,
    agenda: (state: CalendarAgendaState) => {
        const presentation: CalendarResolvedAgendaPresentation = state.presentation;
        return `${presentation}-${state.itemCount}`;
    },
};
export const styled: CalendarProps<ItemData, SourceData> = {
    ...base, sources: [{id: 'engineering', title: 'Engineering', color: '#3366ff', data: {team: 'core'}}], getItemAppearance: appearance, classNames,
    renderItem: context => { const view: CalendarItemView = context.view; return `${view} ${context.item.data.ticketId} ${context.segmentRange.end}`; },
    renderAgendaItem: context => `${context.date} ${context.isDisabled} ${context.isPending} ${context.isDragging} ${context.isSelected}`,
    renderDayHeader: state => `${state.date}:${state.itemCount}`,
    renderToolbarContent: context => { const layout: CalendarResolvedLayout = context.layout; return layout; },
    renderLoading: (context: CalendarLoadingSlotContext) => context.state.phase,
    renderEmpty: (context: CalendarEmptySlotContext) => context.visibleRange.start,
    renderError: (context: CalendarErrorSlotContext) => context.kind === 'data' ? context.visibleRange.start : context.error.message,
};
Calendar(styled);
export function narrowSlot(context: CalendarItemSlotContext<ItemData>) {
    return context.view === 'month' ? context.segmentRange.start : context.date;
}
export const literalClass: CalendarClassName<CalendarDayState> = 'day';
export const attributes: readonly CalendarDataAttribute[] = ['data-theme', 'data-item-id', 'data-presentation'];
