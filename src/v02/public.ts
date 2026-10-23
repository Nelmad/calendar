import type {CSSProperties, ReactNode} from 'react';
import type {
    CalendarAgendaControlProps, CalendarAgendaItemSlotContext, CalendarAgendaPresentation, CalendarClassNames, CalendarColorScheme, CalendarCSSVariable,
    CalendarDataState, CalendarDayState, CalendarDensity, CalendarDirection, CalendarEmptySlotContext, CalendarErrorSlotContext, CalendarHourCycle, CalendarItem,
    CalendarItemActionsProps, CalendarItemAppearance, CalendarItemAppearanceContext, CalendarItemPressRequest, CalendarLoadingSlotContext, CalendarMessages,
    CalendarMonthItemSlotContext, CalendarSortContext, CalendarSourceFilterControlProps, CalendarTheme, CalendarThemeTokens, CalendarToolbarSlotContext,
    CalendarVisibleRange, CalendarWeekday, IanaTimeZone, ISODate,
} from './reference.js';
import type {LaterProp, SurfaceLayout} from './surface.js';

/**
 * Public declarations of the current prerelease, built from the private §5.7
 * reference types. Props outside the working slice are typed as unavailable, never as
 * silent no-ops; generics and the controlled pairs (agenda, source filter, item actions) are preserved.
 * CalendarBaseProps is spelled out rather than picked from the reference, so the published
 * declarations never carry the shapes of later props (public.guard.ts proves it equals the pick).
 */
export type {
    ISODate, RFC3339DateTime, IanaTimeZone, CalendarInterval, CalendarItem, CalendarDateRange, CalendarVisibleRange,
    CalendarWeekday, CalendarVisibleRangeOptions, CalendarItemPressRequest, CalendarSortContext, CalendarDataState,
    CalendarDensity, CalendarColorScheme, CalendarDirection, CalendarHourCycle, CalendarTheme, CalendarThemeTokens,
    CalendarCSSVariable, CalendarMessages, CalendarAgendaControlProps, CalendarAgendaPresentation,
    CalendarSource, CalendarItemAction, CalendarItemActionRequest, CalendarSourceFilterControlProps, CalendarItemActionsProps,
    CalendarItemAppearance, CalendarItemAppearanceContext, CalendarResolvedLayout, CalendarResolvedAgendaPresentation, CalendarItemView, CalendarRootState,
    CalendarDayState, CalendarItemSlotContext, CalendarMonthItemSlotContext, CalendarAgendaItemSlotContext, CalendarAgendaState, CalendarOverflowState,
    CalendarToolbarSlotContext, CalendarLoadingSlotContext, CalendarEmptySlotContext, CalendarErrorSlotContext, CalendarClassName, CalendarClassNames,
    CalendarDataAttribute,
} from './reference.js';

type Unavailable<K extends PropertyKey> = {[P in K]?: never};

/** Layouts accepted by this prerelease; optional because the default 'auto' is available. */
export type CalendarLayout = SurfaceLayout;
export type CalendarBaseProps<TItemData = unknown, TSourceData = unknown> = {
    items: readonly CalendarItem<TItemData>[];
    anchorDate: ISODate;
    onNavigate: (anchorDate: ISODate) => void;
    onVisibleRangeChange?: (range: CalendarVisibleRange) => void;
    timeZone: IanaTimeZone;
    today?: ISODate;
    locale?: string;
    firstDayOfWeek?: CalendarWeekday;
    hourCycle?: CalendarHourCycle;
    dir?: CalendarDirection;
    layout?: CalendarLayout;
    mobileBreakpoint?: number;
    agendaPresentation?: CalendarAgendaPresentation;
    dataState?: CalendarDataState;
    onRetryRequest?: () => void;
    onItemPress?: (request: CalendarItemPressRequest<TItemData>) => void;
    getItemAppearance?: (item: CalendarItem<TItemData>, context: CalendarItemAppearanceContext<TSourceData>) => CalendarItemAppearance | undefined;
    sortItems?: (a: CalendarItem<TItemData>, b: CalendarItem<TItemData>, context: CalendarSortContext) => number;
    theme?: CalendarTheme;
    density?: CalendarDensity;
    colorScheme?: CalendarColorScheme;
    tokens?: CalendarThemeTokens;
    messagesLocale?: string;
    messages?: Partial<CalendarMessages>;
    renderItem?: (context: CalendarMonthItemSlotContext<TItemData, TSourceData>) => ReactNode;
    renderAgendaItem?: (context: CalendarAgendaItemSlotContext<TItemData, TSourceData>) => ReactNode;
    renderDayHeader?: (context: CalendarDayState) => ReactNode;
    renderToolbarContent?: (context: CalendarToolbarSlotContext) => ReactNode;
    renderLoading?: (context: CalendarLoadingSlotContext) => ReactNode;
    renderEmpty?: (context: CalendarEmptySlotContext) => ReactNode;
    renderError?: (context: CalendarErrorSlotContext) => ReactNode;
    className?: string;
    classNames?: CalendarClassNames<TItemData, TSourceData>;
    style?: CSSProperties & Partial<Record<CalendarCSSVariable, string>>;
    id?: string;
    'aria-label'?: string;
    'aria-labelledby'?: string;
    portalContainer?: Element | DocumentFragment | null;
};
export type CalendarProps<TItemData = unknown, TSourceData = unknown> =
    CalendarBaseProps<TItemData, TSourceData> & CalendarAgendaControlProps & CalendarSourceFilterControlProps<TSourceData>
    & CalendarItemActionsProps<TItemData> & Unavailable<LaterProp>;
