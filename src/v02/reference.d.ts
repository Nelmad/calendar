// The full 0.2 public contract (internal specification §5.7). Private reference; not a package entry.
import type {CSSProperties, ReactElement, ReactNode} from 'react';

export type ISODate = string;
export type RFC3339DateTime = string;
export type IanaTimeZone = string;

export type CalendarInterval =
  | {
      kind: 'allDay';
      start: ISODate;
      end: ISODate;
    }
  | {
      kind: 'timed';
      start: RFC3339DateTime;
      end?: RFC3339DateTime;
      timeZone?: IanaTimeZone;
    };

export type CalendarItem<TItemData = unknown> = {
  id: string;
  title: string;
  calendarId?: string;
  interval: CalendarInterval;
  data: TItemData;
};

export type CalendarSource<TSourceData = unknown> = {
  id: string;
  title: string;
  color?: string;
  data?: TSourceData;
};

export type CalendarDateRange = {
  start: ISODate;
  end: ISODate;
};

export type CalendarVisibleRange = CalendarDateRange & {
  timeZone: IanaTimeZone;
};

export type CalendarWeekday =
  | 'monday'
  | 'tuesday'
  | 'wednesday'
  | 'thursday'
  | 'friday'
  | 'saturday'
  | 'sunday';

export type CalendarVisibleRangeOptions = {
  anchorDate: ISODate;
  timeZone: IanaTimeZone;
  locale?: string;
  firstDayOfWeek?: CalendarWeekday;
};

export function getCalendarVisibleRange(
  options: CalendarVisibleRangeOptions,
): CalendarVisibleRange;

export type CalendarMoveInput = 'pointer' | 'touch' | 'keyboard';

export type CalendarMoveProposal<TItemData = unknown> = {
  item: CalendarItem<TItemData>;
  previousInterval: CalendarInterval;
  proposedInterval: CalendarInterval;
  input: CalendarMoveInput;
};

export type CalendarMoveRequest<TItemData = unknown> =
  CalendarMoveProposal<TItemData> & {
    requestId: string;
  };

export type CalendarMoveState = {
  requestId: string;
  itemId: string;
} & (
  | {status: 'pending'}
  | {status: 'succeeded'}
  | {status: 'rejected'; reason: string}
);

export type PolicyResult =
  | true
  | {
      allowed: false;
      reason: string;
    };

export type CalendarInteractionPolicy<TItemData = unknown> = {
  canSelectDate?: (date: ISODate) => PolicyResult;
  canSelectRange?: (range: CalendarDateRange) => PolicyResult;
  canMoveItem?: (item: CalendarItem<TItemData>) => PolicyResult;
  canDropItem?: (
    proposal: CalendarMoveProposal<TItemData>,
  ) => PolicyResult;
};

export type CalendarItemAction = {
  id: string;
  label: string;
  tone?: 'default' | 'danger';
};

export type CalendarItemActionRequest<TItemData = unknown> = {
  item: CalendarItem<TItemData>;
  actionId: string;
};

export type CalendarItemPressRequest<TItemData = unknown> = {
  item: CalendarItem<TItemData>;
  date: ISODate;
} & (
  | {
      view: 'month';
      segmentRange: CalendarDateRange;
    }
  | {
      view: 'agenda';
      segmentRange?: never;
    }
);

export type CalendarItemAppearance = {
  accentColor?: string;
  backgroundColor?: string;
  textColor?: string;
};

export type CalendarItemAppearanceContext<TSourceData = unknown> = {
  timeZone: IanaTimeZone;
  source?: CalendarSource<TSourceData>;
};

export type CalendarSortContext = {
  timeZone: IanaTimeZone;
};

export type CalendarDataState =
  | {status: 'ready'}
  | {status: 'loading'; phase: 'initial' | 'refresh'}
  | {
      status: 'error';
      phase: 'initial' | 'refresh';
      error: unknown;
    };

export type CalendarLayout = 'auto' | 'desktop' | 'mobile';
export type CalendarResolvedLayout = Exclude<CalendarLayout, 'auto'>;
export type CalendarDensity = 'compact' | 'comfortable';
export type CalendarColorScheme = 'system' | 'light' | 'dark';
export type CalendarDirection = 'ltr' | 'rtl';
export type CalendarHourCycle = 12 | 24;
export type CalendarAgendaPresentation = 'auto' | 'overlay';
export type CalendarResolvedAgendaPresentation =
  | 'inline'
  | 'popover'
  | 'sheet';
export type CalendarItemView = 'month' | 'agenda';

declare const calendarThemeBrand: unique symbol;

export type CalendarTheme = Readonly<{
  name: string;
  [calendarThemeBrand]: true;
}>;

export type CalendarThemeTokens = Readonly<{
  color?: Readonly<{
    surface?: string;
    text?: string;
    muted?: string;
    border?: string;
    accent?: string;
    danger?: string;
    focus?: string;
  }>;
  typography?: Readonly<{
    fontFamily?: string;
    fontSize?: string;
    fontWeight?: string;
    lineHeight?: string;
  }>;
  spacing?: Readonly<{
    xs?: string;
    sm?: string;
    md?: string;
    lg?: string;
  }>;
  density?: Readonly<{
    dayMinHeight?: string;
    itemHeight?: string;
    gap?: string;
  }>;
  radii?: Readonly<{
    sm?: string;
    md?: string;
    lg?: string;
  }>;
  shadows?: Readonly<{
    overlay?: string;
  }>;
  motion?: Readonly<{
    duration?: string;
    easing?: string;
  }>;
  components?: Readonly<{
    itemBackground?: string;
    itemText?: string;
    selectedDayBackground?: string;
  }>;
}>;

export type CalendarCSSVariable =
  | '--nelmad-calendar-color-surface'
  | '--nelmad-calendar-color-text'
  | '--nelmad-calendar-color-muted'
  | '--nelmad-calendar-color-border'
  | '--nelmad-calendar-color-accent'
  | '--nelmad-calendar-color-danger'
  | '--nelmad-calendar-color-focus'
  | '--nelmad-calendar-typography-font-family'
  | '--nelmad-calendar-typography-font-size'
  | '--nelmad-calendar-typography-font-weight'
  | '--nelmad-calendar-typography-line-height'
  | '--nelmad-calendar-spacing-xs'
  | '--nelmad-calendar-spacing-sm'
  | '--nelmad-calendar-spacing-md'
  | '--nelmad-calendar-spacing-lg'
  | '--nelmad-calendar-density-day-min-height'
  | '--nelmad-calendar-density-item-height'
  | '--nelmad-calendar-density-gap'
  | '--nelmad-calendar-radii-sm'
  | '--nelmad-calendar-radii-md'
  | '--nelmad-calendar-radii-lg'
  | '--nelmad-calendar-shadows-overlay'
  | '--nelmad-calendar-motion-duration'
  | '--nelmad-calendar-motion-easing'
  | '--nelmad-calendar-components-item-background'
  | '--nelmad-calendar-components-item-text'
  | '--nelmad-calendar-components-selected-day-background';

export const classicTheme: CalendarTheme;
export const neutralTheme: CalendarTheme;

export type CalendarMessages = {
  calendarLabel: string;
  previousMonthLabel: string;
  nextMonthLabel: string;
  todayLabel: string;
  untitledItemLabel: string;
  sourceSelectorLabel: string;
  showSourceLabel: (sourceTitle: string) => string;
  hideSourceLabel: (sourceTitle: string) => string;
  openAgendaLabel: (date: ISODate) => string;
  closeAgendaLabel: string;
  agendaHeading: (date: ISODate) => string;
  agendaEmpty: string;
  itemActionsLabel: (itemTitle: string) => string;
  itemCountLabel: (date: ISODate, count: number) => string;
  moreItemsLabel: (date: ISODate, count: number) => string;
  todayStateLabel: string;
  selectedStateLabel: string;
  viewedDateStateLabel: string;
  unavailableStateLabel: string;
  pendingStateLabel: string;
  selectDateLabel: string;
  selectRangeLabel: string;
  confirmSelectionLabel: string;
  clearSelectionLabel: string;
  createLabel: string;
  moveItemLabel: string;
  confirmMoveLabel: string;
  cancelLabel: string;
  retryLabel: string;
  loadingLabel: string;
  refreshingLabel: string;
  emptyLabel: string;
  errorLabel: string;
  invalidConfigurationLabel: string;
  genericBlockedReason: string;
  navigationBoundaryReason: string;
  selectionBoundaryReason: string;
  moveDstGapReason: (date: ISODate, localTime: string) => string;
  moveBoundaryReason: string;
  moveItemChangedReason: string;
  moveTimeZoneChangedReason: string;
  moveItemUnavailableReason: string;
  gridInstructions: string;
  rangeSelectionInstructions: string;
  moveInstructions: string;
  blockedAnnouncement: (reason: string) => string;
  monthChangedAnnouncement: (monthStart: ISODate) => string;
  agendaUpdatedAnnouncement: (date: ISODate, count: number) => string;
  refreshCompletedAnnouncement: string;
  selectionStartedAnnouncement: (date: ISODate) => string;
  selectionTargetAnnouncement: (
    range: CalendarDateRange,
    isAllowed: boolean,
  ) => string;
  selectionCancelledAnnouncement: string;
  selectionCompletedAnnouncement: (
    range: CalendarDateRange,
  ) => string;
  selectionClearedAnnouncement: string;
  moveStartedAnnouncement: (itemTitle: string) => string;
  moveNavigationPendingLabel: (
    itemTitle: string,
    monthStart: ISODate,
  ) => string;
  moveTargetAnnouncement: (
    itemTitle: string,
    date: ISODate,
    isAllowed: boolean,
    utcOffset?: string,
  ) => string;
  moveCancelledAnnouncement: (
    itemTitle: string,
    reason?: string,
  ) => string;
  moveNoopAnnouncement: (itemTitle: string) => string;
  movePendingAnnouncement: (itemTitle: string) => string;
  moveSucceededAnnouncement: (itemTitle: string) => string;
  moveRejectedAnnouncement: (
    itemTitle: string,
    reason: string,
  ) => string;
};

export type CalendarRootState = {
  layout: CalendarResolvedLayout;
  density: CalendarDensity;
  colorScheme: CalendarColorScheme;
  dir: CalendarDirection;
} & (
  | {kind: 'data'; dataState: CalendarDataState}
  | {
      kind: 'contract';
      dataState: {status: 'error'; phase: 'initial'; error: Error};
    }
);

export type CalendarDayState = {
  date: ISODate;
  isToday: boolean;
  isAgendaDate: boolean;
  isSelected: boolean;
  isSelectionDraft: boolean;
  isOutsideMonth: boolean;
  isSelectionUnavailable: boolean;
  unavailableReason?: string;
  itemCount: number;
};

export type CalendarItemSlotContext<
  TItemData = unknown,
  TSourceData = unknown,
> = {
  item: CalendarItem<TItemData>;
  source?: CalendarSource<TSourceData>;
  isSelected: boolean;
  isDragging: boolean;
  isPending: boolean;
  isDisabled: boolean;
} & (
  | {
      view: 'month';
      segmentRange: CalendarDateRange;
      date?: never;
    }
  | {
      view: 'agenda';
      date: ISODate;
      segmentRange?: never;
    }
);

export type CalendarMonthItemSlotContext<
  TItemData = unknown,
  TSourceData = unknown,
> = Extract<
  CalendarItemSlotContext<TItemData, TSourceData>,
  {view: 'month'}
>;

export type CalendarAgendaItemSlotContext<
  TItemData = unknown,
  TSourceData = unknown,
> = Extract<
  CalendarItemSlotContext<TItemData, TSourceData>,
  {view: 'agenda'}
>;

export type CalendarAgendaState = {
  date: ISODate;
  presentation: CalendarResolvedAgendaPresentation;
  itemCount: number;
};

export type CalendarOverflowState = CalendarDayState & {
  hiddenItemCount: number;
};

export type CalendarToolbarSlotContext = Extract<
  CalendarRootState,
  {kind: 'data'}
> & {
  anchorDate: ISODate;
  visibleRange: CalendarVisibleRange;
};

export type CalendarLoadingSlotContext = {
  state: Extract<CalendarDataState, {status: 'loading'}>;
  visibleRange: CalendarVisibleRange;
};

export type CalendarEmptySlotContext = {
  visibleRange: CalendarVisibleRange;
};

export type CalendarErrorSlotContext =
  | {
      kind: 'data';
      state: Extract<CalendarDataState, {status: 'error'}>;
      visibleRange: CalendarVisibleRange;
      hasStaleItems: boolean;
    }
  | {
      kind: 'contract';
      error: Error;
      hasStaleItems: false;
      visibleRange?: never;
    };

export type CalendarClassName<TState> =
  | string
  | ((state: TState) => string | undefined);

export type CalendarClassNames<
  TItemData = unknown,
  TSourceData = unknown,
> = {
  root?: CalendarClassName<CalendarRootState>;
  toolbar?: CalendarClassName<CalendarToolbarSlotContext>;
  sourceSelector?: CalendarClassName<
    Extract<CalendarRootState, {kind: 'data'}>
  >;
  grid?: CalendarClassName<
    Extract<CalendarRootState, {kind: 'data'}>
  >;
  weekdayHeader?: CalendarClassName<
    Extract<CalendarRootState, {kind: 'data'}>
  >;
  day?: CalendarClassName<CalendarDayState>;
  dayHeader?: CalendarClassName<CalendarDayState>;
  item?: CalendarClassName<
    CalendarMonthItemSlotContext<TItemData, TSourceData>
  >;
  itemActions?: CalendarClassName<
    CalendarAgendaItemSlotContext<TItemData, TSourceData>
  >;
  overflowIndicator?: CalendarClassName<CalendarOverflowState>;
  agenda?: CalendarClassName<CalendarAgendaState>;
  agendaItem?: CalendarClassName<
    CalendarAgendaItemSlotContext<TItemData, TSourceData>
  >;
  status?: CalendarClassName<CalendarRootState>;
};

export type CalendarDataAttribute =
  | 'data-theme'
  | 'data-layout'
  | 'data-density'
  | 'data-color-scheme'
  | 'data-dir'
  | 'data-status'
  | 'data-loading-phase'
  | 'data-date'
  | 'data-today'
  | 'data-agenda-date'
  | 'data-selected'
  | 'data-selection-draft'
  | 'data-selection-unavailable'
  | 'data-outside-month'
  | 'data-has-items'
  | 'data-item-id'
  | 'data-view'
  | 'data-dragging'
  | 'data-pending'
  | 'data-presentation';

export type CalendarAgendaControlProps =
  | {
      agendaDate: ISODate;
      onAgendaDateChange: (date: ISODate) => void;
    }
  | {
      agendaDate?: never;
      onAgendaDateChange?: never;
    };

export type CalendarSelectionControlProps =
  | {
      selection: CalendarDateRange | null;
      onSelectionChange: (
        selection: CalendarDateRange | null,
      ) => void;
      onCreateRequest?: (selection: CalendarDateRange) => void;
    }
  | {
      selection?: never;
      onSelectionChange?: never;
      onCreateRequest?: never;
    };

export type CalendarSourceFilterControlProps<
  TSourceData = unknown,
> =
  | {
      sources?: readonly CalendarSource<TSourceData>[];
      visibleSourceIds?: never;
      onVisibleSourceIdsChange?: never;
      showSourceSelector?: never;
    }
  | {
      sources: readonly CalendarSource<TSourceData>[];
      visibleSourceIds: readonly string[];
      onVisibleSourceIdsChange: (
        visibleSourceIds: readonly string[],
      ) => void;
      showSourceSelector?: boolean;
    };

export type CalendarMoveControlProps<TItemData = unknown> =
  | {
      itemMoveStates: readonly CalendarMoveState[];
      onItemMoveRequest: (
        request: CalendarMoveRequest<TItemData>,
      ) => void;
      onItemMoveDraftChange?: (itemId: string | null) => void;
    }
  | {
      itemMoveStates?: never;
      onItemMoveRequest?: never;
      onItemMoveDraftChange?: never;
    };

export type CalendarItemActionsProps<TItemData = unknown> =
  | {
      getItemActions: (
        item: CalendarItem<TItemData>,
      ) => readonly CalendarItemAction[];
      onItemActionRequest: (
        request: CalendarItemActionRequest<TItemData>,
      ) => void;
    }
  | {
      getItemActions?: never;
      onItemActionRequest?: never;
    };

export type CalendarBaseProps<
  TItemData = unknown,
  TSourceData = unknown,
> = {
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

  interactionPolicy?: CalendarInteractionPolicy<TItemData>;
  onItemPress?: (
    request: CalendarItemPressRequest<TItemData>,
  ) => void;
  getItemAppearance?: (
    item: CalendarItem<TItemData>,
    context: CalendarItemAppearanceContext<TSourceData>,
  ) => CalendarItemAppearance | undefined;
  sortItems?: (
    a: CalendarItem<TItemData>,
    b: CalendarItem<TItemData>,
    context: CalendarSortContext,
  ) => number;

  theme?: CalendarTheme;
  density?: CalendarDensity;
  colorScheme?: CalendarColorScheme;
  tokens?: CalendarThemeTokens;
  messagesLocale?: string;
  messages?: Partial<CalendarMessages>;

  renderItem?: (
    context: CalendarMonthItemSlotContext<TItemData, TSourceData>,
  ) => ReactNode;
  renderAgendaItem?: (
    context: CalendarAgendaItemSlotContext<TItemData, TSourceData>,
  ) => ReactNode;
  renderDayHeader?: (context: CalendarDayState) => ReactNode;
  renderToolbarContent?: (
    context: CalendarToolbarSlotContext,
  ) => ReactNode;
  renderLoading?: (
    context: CalendarLoadingSlotContext,
  ) => ReactNode;
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

export type CalendarProps<
  TItemData = unknown,
  TSourceData = unknown,
> = CalendarBaseProps<TItemData, TSourceData> &
  CalendarAgendaControlProps &
  CalendarSelectionControlProps &
  CalendarSourceFilterControlProps<TSourceData> &
  CalendarMoveControlProps<TItemData> &
  CalendarItemActionsProps<TItemData>;

export declare function Calendar<
  TItemData = unknown,
  TSourceData = unknown,
>(
  props: CalendarProps<TItemData, TSourceData>,
): ReactElement;
