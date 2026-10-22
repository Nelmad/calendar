// CommonJS identity of the public alpha.2 declarations (NodeNext), checked against the packed package.
import sdk = require('@nelmad/calendar');

const props: sdk.CalendarProps<{ticket: number}> = {items: [], timeZone: 'UTC', anchorDate: '2026-09-01', onNavigate() {}, layout: 'desktop'};
const responsive: sdk.CalendarProps = {items: [], timeZone: 'UTC', anchorDate: '2026-09-01', onNavigate() {}, mobileBreakpoint: 600, agendaPresentation: 'overlay'};
sdk.Calendar(responsive);
// portalContainer is part of the alpha.2 slice in CommonJS too.
sdk.Calendar({...props, portalContainer: null});
// @ts-expect-error A selector string is not a portal container.
sdk.Calendar({...props, portalContainer: 'body'});
// @ts-expect-error Layouts keep their exact vocabulary in CommonJS too.
sdk.Calendar({...props, layout: 'tablet'});
sdk.Calendar(props); sdk.getCalendarVisibleRange(props);
const theme: sdk.CalendarTheme = sdk.classicTheme; void theme;
// Item actions and controlled sources are part of the alpha.2 slice in CommonJS too (T17).
const source: sdk.CalendarSource<{team: string}> = {id: 'work', title: 'Work', data: {team: 'core'}};
const action: sdk.CalendarItemAction = {id: 'open', label: 'Open'};
sdk.Calendar<{ticket: number}, {team: string}>({...props, sources: [source], visibleSourceIds: ['work'], onVisibleSourceIdsChange() {}, showSourceSelector: true,
    getItemActions: () => [action], onItemActionRequest: (request: sdk.CalendarItemActionRequest<{ticket: number}>) => { void request.item.data.ticket; }});
// @ts-expect-error The action pair is accepted only together.
sdk.Calendar({...props, getItemActions: () => [action]});
// @ts-expect-error Unavailable props are typed never in CommonJS too.
sdk.Calendar({...props, selection: null, onSelectionChange() {}});
// The neutral preset, slots and class callbacks are part of the alpha.2 slice in CommonJS too (T18).
const neutral: sdk.CalendarTheme = sdk.neutralTheme;
const classes: sdk.CalendarClassNames<{ticket: number}> = {item: (state: sdk.CalendarMonthItemSlotContext<{ticket: number}>) => state.segmentRange.start, grid: 'grid'};
sdk.Calendar({...props, theme: neutral, classNames: classes, renderItem: context => context.item.data.ticket, getItemAppearance: () => ({accentColor: 'red'})});
// @ts-expect-error A data-only class context has no contract branch in CommonJS either.
sdk.Calendar({...props, classNames: {grid: state => state.kind === 'contract' ? 'x' : undefined}});
// @ts-expect-error No legacy CommonJS export.
void sdk.CalendarSkeleton;
