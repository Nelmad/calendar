# @nelmad/calendar API reference — 0.2.0-alpha.2

**English** · [Русский](api.ru.md) · [README](../README.md) · [Migration from 0.1](migration-0.1-to-0.2.md)

<a id="overview"></a>
## Overview

This reference describes exactly the public surface of the `0.2.0-alpha.2` prerelease: the root entry `@nelmad/calendar`
and the stylesheet `@nelmad/calendar/styles.css`. The [generated API report](api/calendar.api.md), produced by API
Extractor from the published `dist/index.d.ts`, is the exact declaration text; this page explains behavior, defaults and
validation.

The published declarations also name props of the planned `0.2` API that this prerelease does not offer. They are typed as
`?: never`, so passing them does not compile, and the runtime removes them with a development warning. They are listed
only in [Props not available in alpha.2](#unavailable) and are not part of the alpha.2 contract.

Conventions: "contract error" means the calendar renders its safe error shell instead of the grid (see
[Diagnostics](#diagnostics)); "excluded" means a single record is left out while the rest renders; "warning" means a
development-only `console.warn` of the form `[@nelmad/calendar] <path>: <reason>`, once per calendar instance. Production
builds behave identically and print nothing. All input arrays are treated as immutable and are never copied or mutated.

<a id="exports"></a>
## Root exports

| Export | Kind | Summary |
| --- | --- | --- |
| [`Calendar`](#export-calendar) | component | Month view with day agenda |
| [`getCalendarVisibleRange`](#export-getcalendarvisiblerange) | function | Pure helper: the exact grid range for prefetching |
| [`classicTheme`](#export-classictheme) | value | The built-in theme preset |
| [`neutralTheme`](#export-neutraltheme) | value | The second built-in theme preset |
| [`CalendarProps`](#export-calendarprops) | type | Props of `Calendar` |
| [`CalendarBaseProps`](#export-calendarbaseprops) | type | Props without the controlled agenda pair |
| [`CalendarAgendaControlProps`](#export-calendaragendacontrolprops) | type | The `agendaDate` / `onAgendaDateChange` pair |
| [`CalendarSourceFilterControlProps`](#export-calendarsourcefiltercontrolprops) | type | `sources` and the controlled source filter |
| [`CalendarItemActionsProps`](#export-calendaritemactionsprops) | type | The `getItemActions` / `onItemActionRequest` pair |
| [`CalendarSource`](#export-calendarsource) | type | One source (calendar) of items |
| [`CalendarItemAction`](#export-calendaritemaction) | type | One consumer action of an item |
| [`CalendarItemActionRequest`](#export-calendaritemactionrequest) | type | Payload of `onItemActionRequest` |
| [`CalendarItem`](#export-calendaritem) | type | One record |
| [`CalendarInterval`](#export-calendarinterval) | type | All-day or timed interval |
| [`ISODate`](#export-isodate) | type | `YYYY-MM-DD` |
| [`RFC3339DateTime`](#export-rfc3339datetime) | type | Timestamp with offset |
| [`IanaTimeZone`](#export-ianatimezone) | type | Accepted IANA identifier |
| [`CalendarDateRange`](#export-calendardaterange) | type | Date range with exclusive end |
| [`CalendarVisibleRange`](#export-calendarvisiblerange) | type | Grid range with its time zone |
| [`CalendarVisibleRangeOptions`](#export-calendarvisiblerangeoptions) | type | Options of `getCalendarVisibleRange` |
| [`CalendarWeekday`](#export-calendarweekday) | type | `'monday'` … `'sunday'` |
| [`CalendarItemPressRequest`](#export-calendaritempressrequest) | type | Payload of `onItemPress` |
| [`CalendarSortContext`](#export-calendarsortcontext) | type | Context of `sortItems` |
| [`CalendarDataState`](#export-calendardatastate) | type | Ready, loading or error |
| [`CalendarLayout`](#export-calendarlayout) | type | `'auto' \| 'desktop' \| 'mobile'` |
| [`CalendarAgendaPresentation`](#export-calendaragendapresentation) | type | `'auto' \| 'overlay'` |
| [`CalendarDensity`](#export-calendardensity) | type | `'compact' \| 'comfortable'` |
| [`CalendarColorScheme`](#export-calendarcolorscheme) | type | `'system' \| 'light' \| 'dark'` |
| [`CalendarDirection`](#export-calendardirection) | type | `'ltr' \| 'rtl'` |
| [`CalendarHourCycle`](#export-calendarhourcycle) | type | `12 \| 24` |
| [`CalendarTheme`](#export-calendartheme) | type | Opaque theme preset |
| [`CalendarThemeTokens`](#export-calendarthemetokens) | type | Semantic tokens |
| [`CalendarCSSVariable`](#export-calendarcssvariable) | type | The 27 public CSS variables |
| [`CalendarMessages`](#export-calendarmessages) | type | Complete message catalog |
| [`CalendarItemAppearance`](#export-calendaritemappearance) | type | Result of `getItemAppearance` |
| [`CalendarItemAppearanceContext`](#export-calendaritemappearancecontext) | type | Context of `getItemAppearance` |
| [`CalendarRootState`](#export-calendarrootstate) | type | State of the root and status class callbacks |
| [`CalendarResolvedLayout`](#export-calendarresolvedlayout) | type | `'desktop' \| 'mobile'` |
| [`CalendarResolvedAgendaPresentation`](#export-calendarresolvedagendapresentation) | type | `'inline' \| 'popover' \| 'sheet'` |
| [`CalendarDayState`](#export-calendardaystate) | type | State of one date cell |
| [`CalendarItemView`](#export-calendaritemview) | type | `'month' \| 'agenda'` |
| [`CalendarItemSlotContext`](#export-calendaritemslotcontext) | type | Context of item slots and class callbacks |
| [`CalendarMonthItemSlotContext`](#export-calendarmonthitemslotcontext) | type | The Month branch of the item context |
| [`CalendarAgendaItemSlotContext`](#export-calendaragendaitemslotcontext) | type | The agenda branch of the item context |
| [`CalendarAgendaState`](#export-calendaragendastate) | type | State of the agenda class callback |
| [`CalendarOverflowState`](#export-calendaroverflowstate) | type | State of the `+N` class callback |
| [`CalendarToolbarSlotContext`](#export-calendartoolbarslotcontext) | type | Context of `renderToolbarContent` |
| [`CalendarLoadingSlotContext`](#export-calendarloadingslotcontext) | type | Context of `renderLoading` |
| [`CalendarEmptySlotContext`](#export-calendaremptyslotcontext) | type | Context of `renderEmpty` |
| [`CalendarErrorSlotContext`](#export-calendarerrorslotcontext) | type | Context of `renderError` |
| [`CalendarClassName`](#export-calendarclassname) | type | A class string or a pure class callback |
| [`CalendarClassNames`](#export-calendarclassnames) | type | The `classNames` object |
| [`CalendarDataAttribute`](#export-calendardataattribute) | type | The stable `data-*` attribute names |

No other root value or subpath is public. Internal modules, classes and DOM structure are not API.

<a id="export-calendar"></a>
### `Calendar`

```ts
function Calendar<TItemData = unknown, TSourceData = unknown>(props: CalendarProps<TItemData, TSourceData>): ReactElement;
```

A client component (the package marks its own `'use client'` boundary). `TItemData` types `item.data` in all callbacks.
`TSourceData` types `source.data` in `sources`, independently of `TItemData`. Import `@nelmad/calendar/styles.css` in every CSS
tree scope that contains the calendar or one of its portals: the agenda popover and sheet are not rendered inside the
calendar root but in the document `body`, the modal host dialog around the calendar or [`portalContainer`](#prop-portalcontainer).
A calendar inside a `ShadowRoot` with the default portal therefore needs the stylesheet in the shadow root and in the
document. See [Props](#props).

<a id="export-getcalendarvisiblerange"></a>
### `getCalendarVisibleRange`

```ts
function getCalendarVisibleRange(options: CalendarVisibleRangeOptions): CalendarVisibleRange;
```

Returns the grid range that `Calendar` renders for the same `anchorDate`, `timeZone`, `locale` and `firstDayOfWeek`: from
the first `firstDayOfWeek` on or before the first day of the month to the end of the last week that contains a day of the
month (4–6 weeks), with an exclusive `end`. Defaults are those of `Calendar` (`locale` `ru-RU`, first day from the locale).
It reads no clock, DOM or host locale and can run on the server. Invalid input throws `RangeError` synchronously, for
example `Expected YYYY-MM-DD in 0001…9999`, `anchorDate must be between February 0001 and November 9999`,
`Timezone is outside the package accepted-set`, `locale must be a well-formed BCP 47 tag`; no partial range is returned.

<a id="export-classictheme"></a>
### `classicTheme`

`const classicTheme: CalendarTheme`, a frozen preset with `name` `"classic"`. It is the default `theme`. The calendar
recognizes presets as the package created them: a structural copy is a contract error. This includes a preset passed as a
prop from a React Server Component to a client component, which arrives serialized; import `classicTheme` in the client
component that renders `Calendar`. The ESM and CommonJS builds are the same package: a preset imported through `require`
works with a `Calendar` imported through `import`, and the other way round.

<a id="export-neutraltheme"></a>
### `neutralTheme`

`const neutralTheme: CalendarTheme` is a frozen preset with `name` `"neutral"`: a restrained gray-blue palette with smaller
radii and a lighter overlay shadow. It changes only colors, radii, the overlay shadow and motion defaults; layout,
roles, focus and keyboard behavior are the same as with `classicTheme`. It combines with both densities and every
`colorScheme`. Like `classicTheme` it is recognized as the package created it (in either module format), so import it in
the client component that renders `Calendar`.

<a id="export-calendarprops"></a>
### `CalendarProps`

```ts
type CalendarProps<TItemData = unknown, TSourceData = unknown> =
    CalendarBaseProps<TItemData, TSourceData> & CalendarAgendaControlProps & CalendarSourceFilterControlProps<TSourceData>
    & CalendarItemActionsProps<TItemData> & Unavailable<UnavailableProp>;
```

The canonical props type. `Unavailable` makes every prop outside alpha.2 an optional `never`. Every key is described in
[Props](#props).

<a id="export-calendarbaseprops"></a>
### `CalendarBaseProps`

`CalendarBaseProps<TItemData, TSourceData>` contains every alpha.2 prop except the controlled pairs (agenda, source filter, item actions); `layout` is
optional. Use `CalendarProps` for components that forward props.

<a id="export-calendaragendacontrolprops"></a>
### `CalendarAgendaControlProps`

```ts
type CalendarAgendaControlProps =
    | {agendaDate: ISODate; onAgendaDateChange: (date: ISODate) => void}
    | {agendaDate?: never; onAgendaDateChange?: never};
```

Both or neither. At runtime one without the other is a contract error.

<a id="export-calendarsourcefiltercontrolprops"></a>
### `CalendarSourceFilterControlProps`

```ts
type CalendarSourceFilterControlProps<TSourceData = unknown> =
    | {sources?: readonly CalendarSource<TSourceData>[]; visibleSourceIds?: never; onVisibleSourceIdsChange?: never; showSourceSelector?: never}
    | {sources: readonly CalendarSource<TSourceData>[]; visibleSourceIds: readonly string[];
        onVisibleSourceIdsChange: (visibleSourceIds: readonly string[]) => void; showSourceSelector?: boolean};
```

Either sources without a filter, or the controlled filter: `visibleSourceIds` with `onVisibleSourceIdsChange`, which
also require `sources`; `showSourceSelector` exists only with the pair. At runtime a half pair, a filter without
`sources` or `showSourceSelector` without the pair is a contract error. See [`sources`](#prop-sources).

<a id="export-calendaritemactionsprops"></a>
### `CalendarItemActionsProps`

```ts
type CalendarItemActionsProps<TItemData = unknown> =
    | {getItemActions: (item: CalendarItem<TItemData>) => readonly CalendarItemAction[];
        onItemActionRequest: (request: CalendarItemActionRequest<TItemData>) => void}
    | {getItemActions?: never; onItemActionRequest?: never};
```

Both or neither. At runtime one without the other is a contract error. See [`getItemActions`](#prop-getitemactions).

<a id="export-calendarsource"></a>
### `CalendarSource`

```ts
type CalendarSource<TSourceData = unknown> = {id: string; title: string; color?: string; data?: TSourceData};
```

A source (a calendar) that items reference by `calendarId`. `id` and `title` must be nonempty after `trim` and IDs must be
unique. `color`, when it is a nonempty CSS color, colors only the accent marker of the source's items and of the source in
the selector, never their background or text (see [`getItemAppearance`](#prop-getitemappearance)); a blank or non-string
color, or one that is not a single CSS declaration value (the rule of [`tokens`](#prop-tokens)), is ignored with a
development warning and its items keep `color.accent`. `data` is carried as it is.

<a id="export-calendaritemaction"></a>
### `CalendarItemAction`

```ts
type CalendarItemAction = {id: string; label: string; tone?: 'default' | 'danger'};
```

One consumer action. `id` is nonempty and unique within the item, `label` is nonempty after `trim`; `tone: 'danger'` only
styles the control (no confirmation is built in).

<a id="export-calendaritemactionrequest"></a>
### `CalendarItemActionRequest`

```ts
type CalendarItemActionRequest<TItemData = unknown> = {item: CalendarItem<TItemData>; actionId: string};
```

The payload of [`onItemActionRequest`](#prop-onitemactionrequest): the item of the latest committed props with that `id`,
and the activated action `id`.

<a id="export-calendaritem"></a>
### `CalendarItem`

```ts
type CalendarItem<TItemData = unknown> = {
    id: string;
    title: string;
    calendarId?: string;
    interval: CalendarInterval;
    data: TItemData;
};
```

- `id`: nonempty after trimming and unique in `items`. All items sharing an `id` are excluded with a warning.
- `title`: a string; an empty or blank title is shown as `untitledItemLabel` with a warning. Titles are plain text with
  bidi isolation, never HTML.
- `calendarId`: a string if present. It links the item to one of the [`sources`](#prop-sources): the source filter and its
  accent color apply. An item whose `calendarId` matches no valid source stays visible with the base accent, with a
  warning once per unknown ID that names its first item (`items[i].calendarId`); without a `sources` prop one warning
  (`items[].calendarId`) covers them all.
- `data`: your domain value. It is never read, cloned or compared, and callbacks return the same item object.
- A record that is not an object, or has an invalid `id`, a non-string `title` or `calendarId`, or an invalid `interval`,
  is excluded with a warning naming its index.

<a id="export-calendarinterval"></a>
### `CalendarInterval`

```ts
type CalendarInterval =
    | {kind: 'allDay'; start: ISODate; end: ISODate}
    | {kind: 'timed'; start: RFC3339DateTime; end?: RFC3339DateTime; timeZone?: IanaTimeZone};
```

- **All-day**: date-only values; `end` is exclusive and must be later than `start`. Time zones never shift them.
- **Timed**: instants. `end` must not be earlier than `start` (compared as instants, not strings). Without `end`, or with
  `end` equal to `start`, the item is a moment shown on the date of its start. A timed item of nonzero length belongs to
  every date `D` for which some instant of `[start, end)` falls on `D` in the Calendar `timeZone`; an exclusive end at
  midnight does not add the next date. A local date may have zero, one or several instant ranges around DST and historical
  transitions; no fixed 24 hours are assumed.
- **`timeZone`** (timed only): the author zone. It must be an accepted identifier or the item is excluded. In alpha.2 it is
  only validated and kept.
- All-day items are bars; a timed item on one local date is a chip; a timed item over several local dates is a bar.

<a id="export-isodate"></a>
### `ISODate`

`string` in the exact form `YYYY-MM-DD`, an existing proleptic Gregorian date with year `0001`–`9999`. `2026-9-8`,
`2026-02-30` and `0000-01-01` are invalid. The locale changes only presentation.

<a id="export-rfc3339datetime"></a>
### `RFC3339DateTime`

`string` matching `YYYY-MM-DDTHH:mm:ss`, an optional `.` with 1–3 digits, then `Z` or `±HH:MM` (uppercase `T` and `Z`).
Not accepted: missing offset, `24:00`, leap seconds, `-00:00`, more than millisecond precision, impossible dates, and
instants outside `0001-01-01T00:00:00.000Z`…`9999-12-31T23:59:59.999Z` after applying the offset. The year range applies
to that instant, not to the written date: `0000-12-31T23:30:00-01:00` is `0001-01-01T00:30:00Z` and is accepted.

<a id="export-ianatimezone"></a>
### `IanaTimeZone`

`string`, accepted only when it equals `UTC` or one of the package's primary identifiers exactly, including case. See
[Accepted time zones](#time-zones).

<a id="export-calendardaterange"></a>
### `CalendarDateRange`

`{start: ISODate; end: ISODate}` with an exclusive `end` later than `start`.

<a id="export-calendarvisiblerange"></a>
### `CalendarVisibleRange`

`CalendarDateRange & {timeZone: IanaTimeZone}`: the dates of the rendered grid, including days of neighboring months, and
the Calendar `timeZone` they are interpreted in. Convert local dates to instants with your time zone rules, not by adding
24 hours.

<a id="export-calendarvisiblerangeoptions"></a>
### `CalendarVisibleRangeOptions`

`{anchorDate: ISODate; timeZone: IanaTimeZone; locale?: string; firstDayOfWeek?: CalendarWeekday}`, validated like the
props of the same names.

<a id="export-calendarweekday"></a>
### `CalendarWeekday`

`'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday'`.

<a id="export-calendaritempressrequest"></a>
### `CalendarItemPressRequest`

```ts
type CalendarItemPressRequest<TItemData = unknown> = {item: CalendarItem<TItemData>; date: ISODate} & (
    | {view: 'month'; segmentRange: CalendarDateRange}
    | {view: 'agenda'; segmentRange?: never}
);
```

- `view: 'month'`: a pointer press on a chip or bar in the grid. `date` is the date cell under the pointer, inside
  `segmentRange`, the part of the item drawn in that week (clipped to the week, exclusive end).
- `view: 'agenda'`: activation of the item button in the day agenda (pointer, `Enter` or `Space`). `date` is the agenda date.
- `item` is the object from your `items`.

<a id="export-calendarsortcontext"></a>
### `CalendarSortContext`

`{timeZone: IanaTimeZone}`: the Calendar time zone, the only context `sortItems` receives.

<a id="export-calendardatastate"></a>
### `CalendarDataState`

```ts
type CalendarDataState =
    | {status: 'ready'}
    | {status: 'loading'; phase: 'initial' | 'refresh'}
    | {status: 'error'; phase: 'initial' | 'refresh'; error: unknown};
```

| State | Grid and agenda | Toolbar | Status region | Live region |
| --- | --- | --- | --- | --- |
| `ready` | Shown; an "empty" region is added when no valid item intersects the visible range | Enabled | Empty region only | Polite: refresh completed, once after `loading/refresh` |
| `loading/initial` | Replaced by a skeleton of the same height | Navigation disabled | Named loading region | Polite: loading |
| `loading/refresh` | Kept in place; grid and inline agenda `aria-busy="true"` (the root, its live regions and a popover or sheet agenda are not busy) | Enabled, never moved | A 3 px progress bar named "refreshing" over the top border of the grid; it takes no space and is not a region, so the name is exposed once, on the progress bar | None at the start (a Previous/Next month announcement is never replaced) |
| `error/initial` | Replaced by a region of the same height | Navigation disabled | Named error region, Retry with `onRetryRequest` | Urgent: error |
| `error/refresh` | Kept in place, moved down by the banner | Enabled, never moved | Non-blocking error banner between the toolbar and the grid, Retry with `onRetryRequest` | Urgent: error |

`phase` decides blocking versus stale content; the length of `items` is never used to guess it. A blocking state closes the
agenda, its menus and the source selector (whose trigger is disabled while it lasts) and cancels pending navigation and
agenda focus requests; they do not resume later. Controlled props are not
cleared. `error` is yours and is not displayed.

<a id="export-calendarlayout"></a>
### `CalendarLayout`

`'auto' | 'desktop' | 'mobile'`, the values of the optional [`layout`](#prop-layout) prop. The calendar itself only ever
resolves to `'desktop'` or `'mobile'` (`data-layout`).

<a id="export-calendaragendapresentation"></a>
### `CalendarAgendaPresentation`

`'auto' | 'overlay'`, the values of [`agendaPresentation`](#prop-agendapresentation). The resolved presentation is one of
popover, inline or sheet (`data-presentation`).

<a id="export-calendardensity"></a>
### `CalendarDensity`

`'compact' | 'comfortable'`.

<a id="export-calendarcolorscheme"></a>
### `CalendarColorScheme`

`'system' | 'light' | 'dark'`.

<a id="export-calendardirection"></a>
### `CalendarDirection`

`'ltr' | 'rtl'`.

<a id="export-calendarhourcycle"></a>
### `CalendarHourCycle`

`12 | 24`. `12` formats with `hourCycle: 'h12'` and an unpadded hour (`4:00 PM`), `24` with `'h23'` and a two-digit hour
in every locale (`09:00`, `00:05` at midnight; `00.05` in `fi-FI`). A wall time that a DST fold repeats shows its UTC
offset.

<a id="export-calendartheme"></a>
### `CalendarTheme`

`Readonly<{name: string; [calendarThemeBrand]: true}>`: an opaque, branded preset. Only package presets are valid:
`classicTheme` and `neutralTheme`.

<a id="export-calendarthemetokens"></a>
### `CalendarThemeTokens`

Nested optional groups of string tokens: `color`, `typography`, `spacing`, `density`, `radii`, `shadows`, `motion`,
`components`. Each token maps to one CSS variable; see [Tokens and CSS variables](#tokens).

<a id="export-calendarcssvariable"></a>
### `CalendarCSSVariable`

The union of the 27 public custom property names listed in [Tokens and CSS variables](#tokens). `style` accepts them
without a type assertion.

<a id="export-calendarmessages"></a>
### `CalendarMessages`

The complete catalog of package-owned strings: string keys and functions returning a string. `messages` takes a
`Partial<CalendarMessages>`. See [Message catalog](#messages).

<a id="export-calendaritemappearance"></a>
### `CalendarItemAppearance`

`{accentColor?: string; backgroundColor?: string; textColor?: string}`: a partial item-level override, see
[`getItemAppearance`](#prop-getitemappearance).

<a id="export-calendaritemappearancecontext"></a>
### `CalendarItemAppearanceContext`

`{timeZone: IanaTimeZone; source?: CalendarSource<TSourceData>}`: the calendar zone and the item's known source. It has no
segment or date: one appearance applies to the whole item.

<a id="export-calendarrootstate"></a>
### `CalendarRootState`

`{layout: CalendarResolvedLayout; density; colorScheme; dir}` and either `{kind: 'data'; dataState: CalendarDataState}` or
`{kind: 'contract'; dataState: {status: 'error'; phase: 'initial'; error: Error}}`. `layout` is always resolved and
`colorScheme` is the requested value. The `contract` branch reaches only `classNames.root` and `classNames.status`.

<a id="export-calendarresolvedlayout"></a>
### `CalendarResolvedLayout`

`'desktop' | 'mobile'`: the layout that is rendered (`auto` is never a resolved value).

<a id="export-calendarresolvedagendapresentation"></a>
### `CalendarResolvedAgendaPresentation`

`'inline' | 'popover' | 'sheet'`: the agenda presentation that is rendered, as in `data-presentation`.

<a id="export-calendardaystate"></a>
### `CalendarDayState`

`{date; isToday; isAgendaDate; isSelected; isSelectionDraft; isOutsideMonth; isSelectionUnavailable; unavailableReason?;
itemCount}`: the state of one date cell for `renderDayHeader`, `classNames.day` and `classNames.dayHeader`. `itemCount`
counts valid items that pass the accepted source filter. The selection fields are `false` until selection arrives in beta.1.

<a id="export-calendaritemview"></a>
### `CalendarItemView`

`'month' | 'agenda'`: where an item is shown, as in `data-view`.

<a id="export-calendaritemslotcontext"></a>
### `CalendarItemSlotContext`

`{item; source?; isSelected; isDragging; isPending; isDisabled}` with either `{view: 'month'; segmentRange}` or
`{view: 'agenda'; date}`. In the Month branch `segmentRange` is the clipped half-open range of one continuous segment of a
week row; in the agenda branch `date` is the agenda date. `source` is present only for a known source. `isDisabled` means
that this view offers no primary press (Month) or neither a press nor an action (agenda). `isSelected`, `isDragging` and
`isPending` stay `false` in alpha.2 (selection and move arrive in beta.1).

<a id="export-calendarmonthitemslotcontext"></a>
### `CalendarMonthItemSlotContext`

The `view: 'month'` branch of `CalendarItemSlotContext`, used by `renderItem` and `classNames.item`.

<a id="export-calendaragendaitemslotcontext"></a>
### `CalendarAgendaItemSlotContext`

The `view: 'agenda'` branch of `CalendarItemSlotContext`, used by `renderAgendaItem`, `classNames.agendaItem` and
`classNames.itemActions`.

<a id="export-calendaragendastate"></a>
### `CalendarAgendaState`

`{date: ISODate; presentation: CalendarResolvedAgendaPresentation; itemCount: number}` for `classNames.agenda`.

<a id="export-calendaroverflowstate"></a>
### `CalendarOverflowState`

`CalendarDayState & {hiddenItemCount: number}` for `classNames.overflowIndicator`.

<a id="export-calendartoolbarslotcontext"></a>
### `CalendarToolbarSlotContext`

The `kind: 'data'` branch of `CalendarRootState` with `anchorDate` and `visibleRange`, for `renderToolbarContent` and
`classNames.toolbar`. The toolbar does not exist in the contract error shell, so there is no contract branch.

<a id="export-calendarloadingslotcontext"></a>
### `CalendarLoadingSlotContext`

`{state: {status: 'loading'; phase}; visibleRange}` for `renderLoading`.

<a id="export-calendaremptyslotcontext"></a>
### `CalendarEmptySlotContext`

`{visibleRange: CalendarVisibleRange}` for `renderEmpty`.

<a id="export-calendarerrorslotcontext"></a>
### `CalendarErrorSlotContext`

Either `{kind: 'data'; state; visibleRange; hasStaleItems}` for a data error, or `{kind: 'contract'; error: Error;
hasStaleItems: false}` for the contract error shell, which has no range and no retry.

<a id="export-calendarclassname"></a>
### `CalendarClassName`

`string | ((state: TState) => string | undefined)`: a class string, or a pure callback of the typed state of its surface.

<a id="export-calendarclassnames"></a>
### `CalendarClassNames`

The keys of [`classNames`](#prop-classnames) with their state types: `root`, `status` (`CalendarRootState`), `toolbar`
(`CalendarToolbarSlotContext`), `sourceSelector`, `grid`, `weekdayHeader` (the `kind: 'data'` branch only), `day`,
`dayHeader` (`CalendarDayState`), `item` (`CalendarMonthItemSlotContext`), `itemActions`, `agendaItem`
(`CalendarAgendaItemSlotContext`), `overflowIndicator` (`CalendarOverflowState`), `agenda` (`CalendarAgendaState`).

<a id="export-calendardataattribute"></a>
### `CalendarDataAttribute`

The union of the stable attribute names of [`data-*` attributes](#data-attributes).

<a id="props"></a>
## Props

| Prop | Type | Required / default | Invalid value |
| --- | --- | --- | --- |
| [`items`](#prop-items) | `readonly CalendarItem<TItemData>[]` | required | not an array: contract error; bad record: excluded |
| [`timeZone`](#prop-timezone) | `IanaTimeZone` | required | contract error |
| [`anchorDate`](#prop-anchordate) | `ISODate` | required | contract error |
| [`onNavigate`](#prop-onnavigate) | `(anchorDate: ISODate) => void` | required | contract error |
| [`layout`](#prop-layout) | `CalendarLayout` | `'auto'` | contract error |
| [`mobileBreakpoint`](#prop-mobilebreakpoint) | `number` (CSS px) | `640` | not a positive finite number: contract error |
| [`agendaPresentation`](#prop-agendapresentation) | `CalendarAgendaPresentation` | `'auto'` | contract error |
| [`onVisibleRangeChange`](#prop-onvisiblerangechange) | `(range: CalendarVisibleRange) => void` | optional | not a function: contract error |
| [`today`](#prop-today) | `ISODate` | optional; unknown until hydration | contract error |
| [`locale`](#prop-locale) | `string` (BCP 47) | `'ru-RU'` | malformed: contract error; unsupported: `en-US` + warning |
| [`firstDayOfWeek`](#prop-firstdayofweek) | `CalendarWeekday` | from `locale`, else `'monday'` | contract error |
| [`hourCycle`](#prop-hourcycle) | `CalendarHourCycle` | from `locale`, else `24` | contract error |
| [`dir`](#prop-dir) | `CalendarDirection` | from `locale`, else `'ltr'` | contract error |
| [`agendaDate`](#prop-agendadate) | `ISODate` | optional, pair | invalid or unpaired: contract error |
| [`onAgendaDateChange`](#prop-onagendadatechange) | `(date: ISODate) => void` | optional, pair | unpaired or not a function: contract error |
| [`dataState`](#prop-datastate) | `CalendarDataState` | `{status: 'ready'}` | contract error |
| [`onRetryRequest`](#prop-onretryrequest) | `() => void` | optional | not a function: contract error |
| [`onItemPress`](#prop-onitempress) | `(request: CalendarItemPressRequest<TItemData>) => void` | optional | not a function: contract error |
| [`sortItems`](#prop-sortitems) | `(a, b, context: CalendarSortContext) => number` | built-in order | not a function: contract error; non-finite result: `0` + warning |
| [`theme`](#prop-theme) | `CalendarTheme` | `classicTheme` | not a preset: contract error |
| [`density`](#prop-density) | `CalendarDensity` | `'compact'` | contract error |
| [`colorScheme`](#prop-colorscheme) | `CalendarColorScheme` | `'system'` | contract error |
| [`tokens`](#prop-tokens) | `CalendarThemeTokens` | theme values | empty, non-string or not one declaration value: ignored + warning |
| [`messagesLocale`](#prop-messageslocale) | `string` (BCP 47) | resolved `locale` | malformed: contract error |
| [`messages`](#prop-messages) | `Partial<CalendarMessages>` | built-in catalog | empty or wrong shape: built-in text + warning |
| [`className`](#prop-classname) | `string` | none | — |
| [`style`](#prop-style) | `CSSProperties & Partial<Record<CalendarCSSVariable, string>>` | none | standard React/CSS behavior |
| [`id`](#prop-id) | `string` | none | — |
| [`aria-label`](#prop-aria-label) | `string` | `calendarLabel` | blank: catalog label |
| [`aria-labelledby`](#prop-aria-labelledby) | `string` (IDREF list) | none | invalid IDs dropped + warning |
| [`portalContainer`](#prop-portalcontainer) | `Element \| DocumentFragment \| null` | the open modal container around the calendar (modal `<dialog>` or `aria-modal="true"`), else owner document `body` | detached, other document or not a node: default + warning |
| [`getItemActions`](#prop-getitemactions) | `(item: CalendarItem<TItemData>) => readonly CalendarItemAction[]` | optional, pair | unpaired or not a function: contract error; bad action: excluded + warning |
| [`onItemActionRequest`](#prop-onitemactionrequest) | `(request: CalendarItemActionRequest<TItemData>) => void` | optional, pair | unpaired or not a function: contract error |
| [`sources`](#prop-sources) | `readonly CalendarSource<TSourceData>[]` | none | not an array: contract error; bad source: excluded + warning |
| [`visibleSourceIds`](#prop-visiblesourceids) | `readonly string[]` | optional, pair; all sources visible | unpaired or without `sources`: contract error; unknown/repeated ID: ignored + warning |
| [`onVisibleSourceIdsChange`](#prop-onvisiblesourceidschange) | `(visibleSourceIds: readonly string[]) => void` | optional, pair | unpaired or not a function: contract error |
| [`showSourceSelector`](#prop-showsourceselector) | `boolean` | `true` with the pair | without the pair or not a boolean: contract error |
| [`getItemAppearance`](#prop-getitemappearance) | `(item, context: CalendarItemAppearanceContext<TSourceData>) => CalendarItemAppearance \| undefined` | theme and source colors | not a function: contract error; bad field: ignored + warning |
| [`classNames`](#prop-classnames) | `CalendarClassNames<TItemData, TSourceData>` | none | not an object, or a field that is not a string or function: contract error |
| [`renderItem`](#prop-renderitem) | `(context: CalendarMonthItemSlotContext) => ReactNode` | default chip/bar content | not a function: contract error |
| [`renderAgendaItem`](#prop-renderagendaitem) | `(context: CalendarAgendaItemSlotContext) => ReactNode` | default row content | not a function: contract error |
| [`renderDayHeader`](#prop-renderdayheader) | `(context: CalendarDayState) => ReactNode` | the day number | not a function: contract error |
| [`renderToolbarContent`](#prop-rendertoolbarcontent) | `(context: CalendarToolbarSlotContext) => ReactNode` | none | not a function: contract error |
| [`renderLoading`](#prop-renderloading) | `(context: CalendarLoadingSlotContext) => ReactNode` | default loading body | not a function: contract error |
| [`renderEmpty`](#prop-renderempty) | `(context: CalendarEmptySlotContext) => ReactNode` | `emptyLabel` | not a function: contract error |
| [`renderError`](#prop-rendererror) | `(context: CalendarErrorSlotContext) => ReactNode` | default error body with Retry | not a function: contract error |

<a id="prop-items"></a>
### `items`

The records to show, `readonly CalendarItem<TItemData>[]`. Pass `items={[]}` for an empty calendar. Items outside the
visible range are allowed and are not drawn. Records are validated individually: an invalid or duplicate record is excluded
from the grid, counts, agenda and callbacks with a warning; the others render. The default order is: all-day items by
start date, longer first; then timed items spanning several local dates by start instant, longer first; then other timed
items by start instant; ties by `id` in code-unit order. `sortItems` replaces it.

`id` is the identity of an item across updates, so keep it stable between loads instead of generating it per request. When
the focused item of the agenda disappears (removed, moved to another date, given a new `id`, or invalid), focus moves to
its date cell on every run and in every build: a popover or sheet closes first, the inline agenda stays.

<a id="prop-timezone"></a>
### `timeZone`

The display time zone, an accepted IANA identifier (`IanaTimeZone`). It decides which dates timed items belong to, how
times are formatted and which date "today" is. Not inferred from the browser or server. Invalid: contract error
`timeZone: Timezone is outside the package accepted-set`; missing: `timeZone: Required; expected an IANA time zone such as
Europe/Moscow`.

<a id="prop-anchordate"></a>
### `anchorDate`

Any `ISODate` in the month to display; the day number is ignored. Supported months are February 0001 to November 9999, so
the neighboring grid days stay representable. Invalid or out of bounds: contract error.

<a id="prop-onnavigate"></a>
### `onNavigate`

`(anchorDate: ISODate) => void`, required. Called with the first day (`YYYY-MM-01`) of the requested month after a user
action: Previous/Next, Today when today is outside the grid, arrow keys past the grid, `PageUp`/`PageDown` with or without
`Shift`. It is a request: the month changes only when you pass the new `anchorDate`. A request for the already displayed
month does not call it. Focus rules are in the [README](../README.md#navigation).

<a id="prop-layout"></a>
### `layout`

`CalendarLayout`, default `'auto'`.

- `'desktop'`: a seven-column Month grid with chips, bars and `+N`; the agenda is a popover.
- `'mobile'`: a compact grid with dates and a dot on days that have items, without chips, bars or `+N`; the agenda of the
  viewed date is shown below the grid (or in a sheet, see [`agendaPresentation`](#prop-agendapresentation)). A tap or
  `Enter` on a date changes the viewed date.
- `'auto'`: the calendar measures the content-box width of its own root, not the browser window. A width below
  [`mobileBreakpoint`](#prop-mobilebreakpoint) is mobile, the breakpoint and wider is desktop: with the default `640`, a
  content width of 639 px is mobile and 640 px is desktop. The content box is inside the root's own padding
  (`spacing.md`, 16 px on each side by default), so the root's border box switches at 672 px. The server and the first client render are always mobile; the
  measured layout is applied after hydration, before the browser paints. A zero or unmeasurable width (for example inside
  `display: none`) is not a measurement: the calendar stays mobile until the first one. Later it keeps the last measured
  width, which a changed `mobileBreakpoint` is compared against, so a hidden calendar does not switch on its own. Switching
  a forced layout to `'auto'` while the calendar cannot be measured gives mobile.
- A width that depends on the layout itself cannot make `'auto'` alternate. Example: the desktop month is taller than the
  window, so its page scrollbar narrows the calendar below the breakpoint, while the shorter mobile layout has no
  scrollbar and is wider again. Every switch caused by a width is measured once more before the browser paints; if the new
  layout itself moved the width back across the breakpoint, the difference of the two widths (here the scrollbar width)
  becomes a band on both sides of the breakpoint. At a width inside the band neither layout fits the breakpoint with the
  width it produces itself, so the calendar keeps its current layout there (a height-only change decides nothing); for
  example desktop stays at a 630 px content width next to a 15 px scrollbar. Outside the band the exact breakpoint decides
  again. A window resized or dragged through the band therefore switches once per crossing, not on every step. Changing
  `mobileBreakpoint` or `layout` forgets the band. To avoid the
  feedback altogether, reserve the scrollbar space on the scrolling ancestor, for example
  `html { scrollbar-gutter: stable; }`: then both layouts measure the same width and the exact breakpoint always decides.
  Near the breakpoint, a page scrollbar that only the desktop height needs can also stay on the server paint until the
  first measurement (see the next item); the same rule avoids it.
- Hydration and layout shift. In a container whose width does not depend on the calendar's content, and with the
  server's inline styles applied, hydration without a layout switch moves nothing. The one exception is large text: the
  first desktop measurement can still grow the rows a little. With the default `mobileBreakpoint`, the stylesheet also
  sizes the server's compact month like the desktop month while the root's content box is at least 640 px wide (672 px
  for the root with the default padding): desktop row heights, and no inline agenda until the first measurement. The
  DOM and `data-layout` stay mobile. The page below the calendar therefore does not move when it hydrates to desktop.
  Under a policy that blocks style attributes, only the hidden agenda applies before hydration (see
  [Strict CSP with SSR](../README.md#limitations)). Without JavaScript such a calendar shows the compact grid at desktop
  row height and no agenda. In a shrink-to-fit host (an inline-block or absolutely positioned wrapper without a width, a
  `max-content` grid track) its server paint is only as wide as its toolbar until the first measurement, so an inline
  agenda wider than the toolbar can move the page once. With another `mobileBreakpoint` the server layout is not
  pre-sized: an SSR page that needs zero shift passes a forced `layout` that matches the page.

A forced `'desktop'` or `'mobile'` never observes the width and is already fixed in the server HTML. `data-layout` on the
root is always the resolved `"desktop"` or `"mobile"`, never `"auto"`. Any other value is a contract error
`layout: Unknown enum value; expected 'auto' or 'desktop' or 'mobile'`.

When the resolved layout or presentation changes while the agenda is shown, the viewed date is kept and only focus inside
the agenda follows: it moves to the same item, heading or control in the new presentation, or to the date cell if that
control does not exist there. If focus was elsewhere, a resize never opens a popover or sheet and never takes focus; an
open overlay closes instead.

<a id="prop-mobilebreakpoint"></a>
### `mobileBreakpoint`

`number`, default `640`, in CSS px of the root content-box width, that is without the root's own padding (`spacing.md`).
Used only by `layout="auto"`: a width `< mobileBreakpoint` is mobile, `≥ mobileBreakpoint` desktop. Fractions are allowed. A value that is not a positive finite number is a contract
error `mobileBreakpoint: Expected a positive finite number`.
A desktop grid keeps columns of at least 64 px (448 px for seven): with a `mobileBreakpoint` below 448, an `auto` desktop
narrower than that scrolls horizontally inside the grid region, never the page.

<a id="prop-agendapresentation"></a>
### `agendaPresentation`

`CalendarAgendaPresentation`, default `'auto'`.

| Resolved layout | `'auto'` | `'overlay'` |
| --- | --- | --- |
| desktop | popover | popover |
| mobile | inline region below the grid | modal sheet |

- **Popover:** a named non-modal `dialog` next to the date cell; focus moves to its first control. A long day scrolls
  inside the popover (wheel, touch, keyboard), and `Tab` keeps the focused control in view. The popover stays attached to
  the cell when the page scrolls; when the cell is scrolled out of view (also out of a scrolling container of your page),
  the popover is clipped away with it and keeps focus, and keyboard focus inside it scrolls the cell back into view. When
  the cell is gone, for example a controlled `agendaDate` outside a new month, the popover moves under the toolbar of the
  calendar root.
- **Inline:** a named `region` that is always shown and never closes. A tap keeps focus on the date cell and announces the
  update with `agendaUpdatedAnnouncement`; `Enter` moves focus to the agenda heading; `Escape` inside returns focus to the
  date cell.
- **Sheet:** a named modal `dialog` (`aria-modal="true"`) at the bottom of the viewport. While it is open the rest of the
  page is `inert` and does not scroll; focus stays inside and starts on the heading. `Escape` (also when focus has fallen
  to the page body), the close button and a press on the backdrop itself (one that starts and ends there; a drag between
the sheet and the backdrop does not count) close it and return focus to the date cell. The
  heading and the close button stay visible while a long day scrolls. These effects belong to the document of the calendar
  root, so a calendar rendered into an iframe document hides and locks that document, never the page around the iframe. A
  dialog of your own that opens above the sheet, for example from [`onItemPress`](#prop-onitempress), stays usable: see
  there.
- The mobile inline agenda grows with the page; it has no scroll area of its own while the root has no definite height.
  With a definite root height (see [Sizing](../README.md#sizing)) it shares the remaining space with the grid and scrolls
  its rows inside the root, so it never paints over the page below.

With [`layout="auto"`](#prop-layout) the server and the first client render show the compact mobile month without reading
the window or the container. With `'auto'` it includes the inline agenda of the viewed date; with the default
[`mobileBreakpoint`](#prop-mobilebreakpoint) and a root content box of at least 640 px, that agenda is in the markup but
not displayed until the first measurement. With `'overlay'` it has no
agenda: the sheet is closed, and after hydration neither a sheet (mobile) nor a popover (desktop) opens before a date is
activated. A forced `layout` renders its own presentation already on the server.

A date cell has `aria-haspopup="dialog"` and `aria-expanded` only for popover and sheet. On desktop, switching between
`'auto'` and `'overlay'` keeps the open popover as it is. Any other value is a contract error
`agendaPresentation: Unknown enum value`.

<a id="prop-onvisiblerangechange"></a>
### `onVisibleRangeChange`

`(range: CalendarVisibleRange) => void`, a notification after commit. Called once after the first client render and then
whenever the accepted `(start, end, timeZone)` changes. Not called during SSR or render, for a pending navigation request,
for an unchanged range, for a new callback identity or for StrictMode effect replays; `A → B → A` reports each change. The
range equals `getCalendarVisibleRange` for the current props. Each call receives a new object.

<a id="prop-today"></a>
### `today`

Optional `ISODate`, the current date in `timeZone`, computed by your app and passed to both server and client. With it the
calendar never reads the clock and you update it. Without it, server and first client render have no today: no highlight,
a disabled Today button and a first-day-of-month agenda fallback. After hydration the calendar computes today in
`timeZone` and updates it at the next local date boundary and on `visibilitychange`. Invalid: contract error.

<a id="prop-locale"></a>
### `locale`

BCP 47 tag, default `'ru-RU'`. Controls date formatting (always Gregorian, `localeMatcher: 'lookup'`, digits of the locale
and its `u-nu` extension), the default first day of the week, hour cycle and direction, and the default message catalog.
A well-formed but unsupported tag resolves to `en-US` with the warning `locale: <tag> is unsupported; using en-US`, never to
the host default. A malformed tag (`en_US`, `""`) is a contract error.

<a id="prop-firstdayofweek"></a>
### `firstDayOfWeek`

`CalendarWeekday`. Default: from the resolved locale, otherwise `'monday'`. Changes the grid range and therefore can trigger
`onVisibleRangeChange`.

<a id="prop-hourcycle"></a>
### `hourCycle`

`12` or `24`. Default: from the resolved locale, otherwise `24`.

<a id="prop-dir"></a>
### `dir`

`'ltr'` or `'rtl'`. Default: from the script of the resolved locale, otherwise `'ltr'`. Independent of the messages
language. RTL mirrors columns, arrow keys, bar geometry, the overflow position and directional icons; Previous/Next and
`PageUp`/`PageDown` keep their chronological meaning. `dir` sets the layout direction only: formatted dates and times keep
the direction of the locale's script, so `ru-RU` dates read left to right in an `rtl` calendar.

<a id="prop-agendadate"></a>
### `agendaDate`

Optional `ISODate`, the controlled viewed date of the day agenda; must be passed with `onAgendaDateChange`. The calendar
uses only the prop, never an internal copy. It may lie outside the displayed month; changing it never calls `onNavigate`.
Switching from uncontrolled to controlled accepts the passed date at once; from controlled to uncontrolled starts from the
last valid controlled date. Without the pair, the calendar keeps the viewed date itself (today in the displayed month,
otherwise the first day of the month). Until the user activates a date, that fallback follows a later known today;
activating any date, today included, keeps it as the viewed date across later today updates. Invalid or unpaired: contract error
`agendaDate: Must be supplied together with onAgendaDateChange`.

<a id="prop-onagendadatechange"></a>
### `onAgendaDateChange`

`(date: ISODate) => void`, paired with `agendaDate`. Called once when the user activates a date other than the current
`agendaDate` (click, `Enter`, a press on `+N`, or a press on a chip without `onItemPress`). The agenda for that date opens
only after the prop equals it and while focus is still on the date cell that asked; moving focus, another activation,
another key (`Escape` included; a pure modifier such as `Shift` and the auto-repeat of a held key are not new keys) or
leaving the calendar cancels the pending open, but not the callback already made. An accepted value different
from the last request is treated as an external change. The presentation that opens is the one resolved when the date is
accepted: a resize or a `layout`/`agendaPresentation` change in the meantime does not cancel the request and never shows
the previous presentation.

<a id="prop-datastate"></a>
### `dataState`

`CalendarDataState`, default `{status: 'ready'}`. See [`CalendarDataState`](#export-calendardatastate). Invalid shapes are
contract errors: `dataState: Unknown data state`, `dataState.phase: Expected initial or refresh`,
`dataState.error: Error state requires an error payload` (the `error` key must be present; its value may be anything).

<a id="prop-onretryrequest"></a>
### `onRetryRequest`

`() => void`. When present, data error regions (both phases) show a Retry button; each press calls it once, without
arguments, so an existing function with an optional parameter (a data hook's `refetch`) can be passed directly. The state
changes only through a new `dataState`. Never shown or called for contract errors.

<a id="prop-onitempress"></a>
### `onItemPress`

`(request: CalendarItemPressRequest<TItemData>) => void`, the primary activation of an item. Grid: called after a completed
pointer press on a chip or bar, with the hit date, and focus moves to that date cell. Agenda: each item becomes a button
that calls it with the agenda date. Without it, a press on a chip opens the agenda of the date under it and agenda rows are
plain list items without a Tab stop. Called once per activation, never during render.

Opening your own editor or details dialog from `onItemPress` works in every presentation. A popover closes when focus moves
into your dialog. The modal sheet stays open under it: a modal dialog that appears above the sheet — a `<dialog>` shown
with `showModal()`, or an element with `aria-modal="true"`, in the document or inside an open `ShadowRoot` (a
web-component modal; a closed one cannot be seen) — is never made inert, the sheet stops containing focus and
drops below it (its `z-index` becomes `auto`), and your dialog handles its own focus and `Escape`. A modal library that
renders no `aria-modal` but makes everything outside its dialog inert or `aria-hidden` (React Aria Components' `Modal`,
for example) counts as such a dialog too: the `role="dialog"` it shows after the sheet opened is not made inert, and focus
that it moves into that dialog in the same commit stays there (the sheet does not pull it back). If the
sheet closes while your dialog is still open, the page stays scroll-locked and in the background until your dialog
closes. A non-modal element with `role="dialog"` or `role="alertdialog"` but without `aria-modal="true"` (a toast, a side
panel) that leaves the sheet usable is page background like any other node: it is inert while the sheet is open, and the
sheet keeps focus. When that dialog closes, the sheet is modal again; if your dialog does not return focus, the sheet focuses the
control that was pressed. Render such a dialog outside the calendar's container (a portal to `body` or a native
`<dialog>`), because the calendar's own container is inert while the sheet is open.

<a id="prop-sortitems"></a>
### `sortItems`

`(a: CalendarItem<TItemData>, b: CalendarItem<TItemData>, context: CalendarSortContext) => number`. Replaces the default
order (see [`items`](#prop-items)) with one global order used in every cell and the agenda; `0` still falls back to the `id`
tie-break. A non-finite result counts as `0` with the warning `sortItems: Non-finite comparator result is treated as zero`.
It must be pure and consistent (`(a, a)` is `0`, antisymmetric, transitive); it may run several times.

<a id="prop-theme"></a>
### `theme`

`CalendarTheme`, default `classicTheme`; the other preset is [`neutralTheme`](#export-neutraltheme). Anything else, including a
structural copy, is a contract error `theme: Expected a package theme preset`. Sets `data-theme="classic"` or
`data-theme="neutral"` on the root and its portal theme roots. Themes change appearance only, never roles, focus or
keyboard behavior; the contract error shell always uses `classicTheme`.

<a id="prop-density"></a>
### `density`

`'compact'` (default) or `'comfortable'`. Changes the defaults of `density.dayMinHeight` (100px / 128px), `itemHeight`
(24px / 32px) and `gap` (4px / 8px). Sets `data-density`.

<a id="prop-colorscheme"></a>
### `colorScheme`

`'system'` (default), `'light'` or `'dark'`. `system` follows `prefers-color-scheme` through CSS only, so server and client
render the same DOM; `data-color-scheme` holds the requested value. `forced-colors: active` takes precedence over theme
and token colors; `prefers-reduced-motion` disables optional transitions.

<a id="prop-tokens"></a>
### `tokens`

`CalendarThemeTokens`. Each nonempty string is written as an inline declaration of its CSS variable on the calendar root;
see [Tokens and CSS variables](#tokens). Missing fields keep the lower layer. A non-string or blank value is ignored with the
warning `tokens.<group>.<token>: Expected a nonempty CSS string`; a group that is not an object gives
`tokens.<group>: Expected a token group`. A string that is not a single CSS declaration value, so that it would add or
swallow other declarations, is ignored the same way with the warning
`tokens.<group>.<token>: Expected a single CSS declaration value`: a top-level `;` or `!` (including `!important`), an
unclosed string, comment or bracket, an unmatched closing bracket, a bad string, an escape at the end or before a
newline, or a leading or trailing character that JavaScript `trim()` removes but CSS does not read as whitespace (such as
U+00A0). A value with any `url(` is ignored the same way, also a well-formed one and one nested in another function such
as `image-set(url(…) 1x)`, so a token never contains a `url(`, even where your own CSS uses the variable in a property
that loads URLs. Other functions that take a resource as a string, such as `image-set("…" 1x)`, `-webkit-image-set("…" 1x)`,
`image("…")` or `src("…")`, are not rejected: the package's own styles use token variables only in color, shadow and font
properties and never load them, but your CSS or slot content that uses a token variable in an image property would.
Validate tenant values yourself if you use the variables that way. Tokens are read the way CSS reads them, so an escaped spelling such as `u\72l(` or `\75 rl(` is
a `url(` too, while `url(` inside a quoted string or a comment is text. An accepted value is passed trimmed, so React 18
and React 19 write the same text on the server and on the client: server and client then render the same declarations. This is a security rule, decided the same way on the server and
the client, not CSS validation: no `CSS.supports` and no computed styles are read. Values are otherwise not parsed or validated as CSS: an
invalid value is a styling error with normal CSS behavior, not a contract error. Tokens are not applied in the contract
error shell.

<a id="prop-messageslocale"></a>
### `messagesLocale`

BCP 47 tag, default: the resolved `locale`. Chooses the built-in catalog (`ru-*`: Russian; any other valid tag: English) and
the language of `messages` overrides, which receive `lang` of this tag. Direction still follows `locale`/`dir`. Malformed:
contract error.

<a id="prop-messages"></a>
### `messages`

`Partial<CalendarMessages>`: overrides of the catalog, written in the `messagesLocale` language. A string key needs a
nonempty string; a function key needs a function that returns a nonempty string. Function messages receive plain values:
dates as `ISODate`, counts as numbers, titles already resolved with `untitledItemLabel`. Anything else falls back to the
built-in text with the warning `messages.<key>: Expected a nonempty message of the declared shape; using built-in fallback`
(`messages.*` when `messages` is not an object). Message functions are pure resolvers and may run several times. In the
contract error shell only `invalidConfigurationLabel` is used.

<a id="prop-classname"></a>
### `className`

Added to the class list of the calendar root, also in the contract error shell. Use it to scope your CSS variables and
sizing. Internal class names are not API.

<a id="prop-style"></a>
### `style`

Inline style of the calendar root. Public CSS variables are typed keys. It is merged after `tokens`, so the same variable in
`style` wins. A definite `height`/`block-size` switches the grid to [constrained sizing](../README.md#sizing). Values reach
React unchanged and, unlike [`tokens`](#prop-tokens), are not checked: React writes them into server-rendered HTML as
text, where a value containing `;` becomes further declarations, while a client render rejects it. Pass values from user
or tenant settings through `tokens`. Under a strict CSP (`style-src` without `'unsafe-inline'` or `style-src-attr`) the
browser blocks the server-rendered `style` attribute, and hydration writes back only the calendar's own validated
declarations (the `tokens`, without a variable that `style` replaces), never `style`: like your other inline styles it
stays subject to your policy (see [Styles](../README.md#styles)).

<a id="prop-id"></a>
### `id`

The `id` of the calendar root element.

<a id="prop-aria-label"></a>
### `aria-label`

Accessible name of the calendar root `region`. A blank value falls back to `calendarLabel`. It is always rendered, also on
the server, and serves as the fallback when `aria-labelledby` has no valid target.

<a id="prop-aria-labelledby"></a>
### `aria-labelledby`

A space-separated IDREF list naming the root. After each commit the calendar keeps only IDs whose elements exist, are
connected, are in the same `Document` or `ShadowRoot` as the root and contribute a nonempty name, in their original order;
the rest are dropped with the warning `aria-labelledby: Ignored missing, empty or cross-tree references: <ids>`. The server
and the first client render never output it (they use `aria-label` or the catalog label), so hydration does not differ; the
validated attribute is added after hydration and updated when the targets change. A calendar rendered into a container
that is attached later, to the document or to a `ShadowRoot`, is validated once connected (at the latest in the next
animation frame).

<a id="prop-portalcontainer"></a>
### `portalContainer`

`Element | DocumentFragment | null`. The node that receives the day agenda popover and sheet. Accepted: a connected
`Element` or a connected `ShadowRoot` of the calendar's own document. A detached node, a node of another document (for
example inside an iframe) or any other value is ignored in favor of the default with a development warning
`portalContainer: <reason>`; it is never a contract error, and nothing is mounted in another document.

**Default.** The nearest open modal container around the calendar root in the same document, else the `body` of the root's
`ownerDocument` (never the global document of another realm). A modal container is a `<dialog>` in the modal state (shown
with `showModal()`) or an element with `aria-modal="true"`, as rendered by modal libraries. A plain `role="dialog"` or
`role="alertdialog"` without `aria-modal="true"`, such as a side panel, and a `<dialog>` opened with `show()` are not
modal containers: the agenda goes to `body` there, so a small panel never squeezes or clips it. A modal host keeps
everything outside it inert, traps focus or disables pointer events on `body`, so the agenda stays inside it: it remains
reachable, a popover is placed within the visible box of that dialog on the side of its date cell with more room (above
the cell near the bottom of the dialog, unless it fits below), and the first `Escape` closes the agenda before the second
reaches your dialog. The default is resolved when the calendar mounts and again whenever a package overlay opens (a date
activation, an item actions or source selector trigger, or a layout switch that carries focus from the inline agenda into a
popover or sheet), so a dialog that opens around an already mounted calendar is used by the next overlay; if the default
changes while an agenda is open,
also by an attribute alone (`aria-modal` added or removed, a `<dialog>` closed or shown), the agenda closes as on a change
of `portalContainer`. An explicit valid `portalContainer` always wins.
If your modal library renders a dialog without `aria-modal="true"` (some set
only `role="dialog"` and trap focus), pass that dialog as `portalContainer`. Radix Dialog and the React Aria Components
`Modal` and `Popover` are such libraries: with the default the agenda opens in `body` and the host's focus trap closes it
at once, or a host popover closes on the outside focus and unmounts the calendar. When the default resolves to `body` for
a calendar inside a `role="dialog"` or `role="alertdialog"` element without `aria-modal="true"`, development builds warn
once per calendar: `portalContainer: The calendar is inside a role="dialog" element without aria-modal="true", so the agenda
and menus render in document.body; a dialog or popover library that traps focus or closes on outside focus closes them (or
itself) at once. Pass that dialog element as portalContainer, or document.body to keep this default`. An explicit valid
container, `document.body` included, is never reported.

**Stacking.** Package overlays use `z-index: 100000` (popover, child menus and the sheet backdrop alike) and keep pointer
events even under `body { pointer-events: none }`. Fixed layers of your page with a lower `z-index`, such as headers and tab
bars, stay below the sheet. To put the overlays into a particular layer, give `portalContainer` its own stacking context
(for example `position: relative; z-index: 10`). Do not put `portalContainer` inside an element with `transform`, `filter`,
`perspective`, `contain: paint` or `will-change: transform`: such an ancestor becomes the containing block of the fixed
sheet and backdrop, so they no longer cover the viewport.

Every portal gets its own package theme root with the calendar's `data-theme`, `data-density`, `data-color-scheme`,
`data-dir` and `lang`. Before a portal becomes visible and before it takes focus, the calendar copies the resolved values
of all 27 public CSS variables and the inherited font properties (`font-family`, `font-size`, `font-style`,
`font-weight`, `font-stretch`, `line-height`, `letter-spacing`) from its own root, so `theme`, `density`, scoped CSS,
`tokens` and `style` look the same in the portal. While a portal is open these values are refreshed after every render of
the calendar, when its root is resized, on a window resize and on changes of `prefers-color-scheme`, `forced-colors` and
`prefers-reduced-motion`; any other stylesheet or class change needs a re-render of the calendar. Only changed values are
written, and non-public properties or element rules of the root are not copied.

`styles.css` does not cross a shadow boundary: import it in every tree scope that holds the calendar root or a portal (see
[Styles](../README.md#styles)). A calendar in a `ShadowRoot` with the default portal needs the stylesheet in that shadow root
and in the document; a calendar in the document portaled into a `ShadowRoot` needs it in the document and in that shadow
root.

If the accepted container changes identity while an overlay is open, including a change to or from `null`, or if it is
removed from the document, the calendar closes the open overlays, removes the modal effects (inert background, scroll
lock) and moves focus back into the calendar: to the date cell (then the current date) from the agenda and its menus, to
the trigger from the source selector. The same happens when the default
target changes, for example when a host dialog around the calendar is removed. Nothing reopens by itself; the next
activation uses the new container or the default. Passing the same node again changes nothing. A date cell gets
`aria-controls` only while it and the overlay are connected in the same `Document` or `ShadowRoot`.

<a id="prop-getitemactions"></a>
### `getItemActions`

`(item: CalendarItem<TItemData>) => readonly CalendarItemAction[]`, paired with `onItemActionRequest`. A pure resolver of
the actions of one item, called during render at most once per item object and resolver identity (a new function or a new
item object resolves again). Editing and deleting are your domain operations; the calendar only offers the set. The same
set is used in the day agenda, its desktop menu and the mobile action sheet. The Month grid never gets action buttons or
extra focus targets: its path to actions is the agenda of the date.

```tsx
<Calendar
    {...props}
    sources={sources}
    visibleSourceIds={visibleSourceIds}
    onVisibleSourceIdsChange={setVisibleSourceIds}
    getItemActions={() => [{id: 'open', label: 'Open'}, {id: 'delete', label: 'Delete', tone: 'danger'}]}
    onItemActionRequest={({item, actionId}) => handleAction(item, actionId)}
/>
```

Each agenda row with a nonempty set gets a separate `…` trigger beside its primary surface, never inside it, named
`itemActionsLabel(title)` (the untitled fallback applies). An empty set, an invalid result or no pair: no trigger. An action
needs a nonempty `id` that is unique within the item, a nonempty `label` after `trim` and `tone` `'default'` or `'danger'`;
an invalid action, and every action of a repeated `id`, is excluded with the warning
`getItemActions("<item id>").actions[<i>]: …`; a result that is not an array is an empty set.

- **Desktop:** a `menu` named `itemActionsLabel(title)` in a non-modal popover above the agenda. The first item has focus;
  arrow keys move, `Enter`/`Space` activate. `Escape` closes only the menu and returns focus to the trigger (a second
  `Escape` closes the agenda); `Tab`/`Shift+Tab` close the menu and continue with the control after or before the trigger.
- **Mobile:** a modal sheet titled by a visible heading `itemActionsLabel(title)` with one button per action. The first
  action has focus, never the heading; `cancelLabel`, `Escape` and the backdrop close it and return focus to the trigger.

If the set of an open menu or sheet becomes empty, or the pair is removed, the surface closes and focus moves to the
nearest control of the still open agenda (the next control after the trigger's position, then the previous one, then the
heading). If the item itself is removed or hidden by the accepted source filter while its menu is open, the menu or sheet
stays until it is dismissed, but every action in it is disabled (`aria-disabled` menu items, disabled sheet buttons): the
item has no available actions any more, so nothing looks usable and no request is sent. Focus stays in the surface. When
an updated set removes the focused action while the surface stays open, focus moves to the next action after its position,
then the previous one, then the first usable control.

<a id="prop-onitemactionrequest"></a>
### `onItemActionRequest`

`(request: CalendarItemActionRequest<TItemData>) => void`, paired with `getItemActions`. Called once per activation of an
action, synchronously after the menu or sheet starts closing, with the item and action of the latest committed props: an
action that is no longer in the set, or an item that is no longer shown, sends nothing. `onItemPress` is a separate primary
activation and never calls it. Opening your own dialog from it works as described for [`onItemPress`](#prop-onitempress).

<a id="prop-sources"></a>
### `sources`

`readonly CalendarSource<TSourceData>[]`, the sources (calendars) that items reference by `calendarId`. A source needs a
nonempty `id` and `title` after `trim` (else excluded: `sources[i]: Source requires nonempty id and title`); every source of
a repeated `id` is excluded (`sources[i]: All sources with this ID are excluded`). An item without `calendarId` is always
visible. An item whose `calendarId` matches no valid source stays visible, and the calendar warns once per unknown ID,
naming its first item:
`items[3].calendarId: No source with ID "archive"; items with this calendarId remain visible with fallback appearance`
(a later new unknown ID is reported too; without `sources` one warning
`items[].calendarId: No sources supplied; affected items remain visible with fallback appearance` covers them all), so a
broken link never hides data silently. The agenda row and its accessible summary name a known
source. Without the controlled pair sources do not filter: every valid item is visible and no selector is shown.

<a id="prop-visiblesourceids"></a>
### `visibleSourceIds`

`readonly string[]`, the accepted filter; paired with `onVisibleSourceIdsChange` and requires `sources`. An item with a known
`calendarId` is visible if and only if that ID is in the array. The filter applies to the grid, the counts and `+N`, the
agenda, the empty state and the availability of actions, also when the built-in selector is hidden. Unknown and repeated
IDs are ignored with the warning `visibleSourceIds[i]: Unknown or repeated source ID`. It is an array, not a `Set`, so the
controlled state stays serializable. Removing the pair shows every source at once and hides the selector; adding it again
accepts only the current array. Neither transition calls the callback.

<a id="prop-onvisiblesourceidschange"></a>
### `onVisibleSourceIdsChange`

`(visibleSourceIds: readonly string[]) => void`, paired with `visibleSourceIds`. Called once per toggle in the built-in
selector with the next set: unique known IDs in the order of `sources`, not in the order of presses; not called when the
set would not change. The filter is controlled: the checked state, the `showSourceLabel`/`hideSourceLabel` names, the grid,
agenda, counts and actions change only when the props accept the new array. A rejected or different value is shown as it
is, without imitating a successful toggle.

<a id="prop-showsourceselector"></a>
### `showSourceSelector`

`boolean`, default `true`, allowed only with the controlled pair. The built-in selector is a toolbar button named
`sourceSelectorLabel`, shown while at least two valid sources remain. On desktop it opens a `menu` of `menuitemcheckbox`
items: `aria-checked` comes from the accepted array, the name is `hideSourceLabel(title)` for a visible source and
`showSourceLabel(title)` for a hidden one, a toggle keeps the menu open, `Escape` returns to the trigger and `Tab` continues
after it. On mobile it opens a modal sheet titled `sourceSelectorLabel` with one named checkbox per source (the first has
focus) and a `cancelLabel` close button. `false` hides the built-in selector so that you can render your own; filtering
still applies.

If fewer than two valid sources remain or the pair is removed while the selector is open, it closes and focus that was in it
moves to the current date cell. A change of the resolved layout closes it without opening the other presentation, and
focus that was in it returns to the trigger. Closing it otherwise (`Escape`, the close button, a press on a blank area of
the page, a new `portalContainer` or default portal target) also returns focus that was in it to the trigger. In short:
however the selector closes, focus that was inside it returns to its own
toolbar trigger (the WAI-ARIA menu button pattern); only without a trigger that can take focus (fewer than two sources,
the pair removed, the trigger disabled) the general recovery order applies, and focus that already moved outside, for
example by a press on another control or by `Tab`, stays there. A blocking `dataState`
(`loading/initial`, `error/initial`) closes it with its modal effects, disables the trigger like the navigation buttons and
moves focus that was in it to the state region; it does not reopen when content returns. While its sheet is open, the
calendar announces only inside that sheet.

<a id="prop-getitemappearance"></a>
### `getItemAppearance`

`(item: CalendarItem<TItemData>, context: CalendarItemAppearanceContext<TSourceData>) => CalendarItemAppearance | undefined`.
A pure resolver of the item colors, called at most once per item record (an item with its source) and resolver identity.
It gets the item, the calendar `timeZone` and the known `source`, never a segment or date, so all Month segments and the
agenda row of an item share one appearance. Three channels are independent:

| Channel | Theme / token base | Source layer | Resolver layer |
| --- | --- | --- | --- |
| accent marker | `color.accent` | `color` of a known source | `accentColor` |
| item background | `components.itemBackground` | none | `backgroundColor` |
| item text | `components.itemText` | none | `textColor` |

Each present field replaces only its channel; a missing field keeps the source or theme layer. `CalendarSource.color`
changes only the accent marker (the bar at the inline start of each chip, bar and agenda row, and the dot of the source in
the selector), never the background or text. An item without `calendarId`, with an unknown source or a source without
`color` uses `color.accent`. A field or `source.color` that is not a string or is blank after `trim` is no override and
gives the warning `getItemAppearance("<id>").<field>: Expected a nonempty CSS color string; ignored` (or
`sources("<id>").color: …`); a result that is not an object gives `getItemAppearance("<id>"): Expected an appearance object
or undefined; ignored`. A value that is not exactly one declaration value (the same rule as for [`tokens`](#prop-tokens):
`;`, `!important`, unbalanced quotes, brackets or comments, `url(` also spelled with escapes) is ignored with `Expected a
single CSS declaration value; ignored`, so server and client write the same declarations, and the lower layer stays (the
source accent for `accentColor`, otherwise the theme token). Anything else is written as its own CSS color
declaration over the lower layer, without CSS parsing: a value the browser rejects at assignment leaves the lower
layer; a value valid as syntax but invalid at computed-value time (an unresolved `var()`) follows the normal CSS
rules. Custom slot content inherits the item text color. Focus rings and state markers are not part of the appearance,
and in `forced-colors: active` system colors replace consumer colors.

<a id="prop-classnames"></a>
### `classNames`

`CalendarClassNames<TItemData, TSourceData>`: extra classes for package-owned surfaces, each a string or a pure callback of
the typed state of that surface; a callback result that is not a nonempty string adds nothing.

| Key | Element | State |
| --- | --- | --- |
| `root` | calendar root (also the contract error shell) | `CalendarRootState` |
| `status` | loading, empty and error regions (also the contract error shell) | `CalendarRootState` |
| `toolbar` | toolbar | `CalendarToolbarSlotContext` |
| `sourceSelector` | source selector button | `CalendarRootState` with `kind: 'data'` |
| `grid` | month `grid` | `CalendarRootState` with `kind: 'data'` |
| `weekdayHeader` | each `columnheader` | `CalendarRootState` with `kind: 'data'` |
| `day` | each date `gridcell` | `CalendarDayState` |
| `dayHeader` | the visible header of each date cell | `CalendarDayState` |
| `item` | each Month segment wrapper | `CalendarMonthItemSlotContext` |
| `overflowIndicator` | each `+N` | `CalendarOverflowState` |
| `agenda` | the agenda root | `CalendarAgendaState` |
| `agendaItem` | each agenda row | `CalendarAgendaItemSlotContext` |
| `itemActions` | the `…` trigger of an agenda row | `CalendarAgendaItemSlotContext` |

In the contract error shell only `root` and `status` run, with the `contract` state; the data-only surfaces never see that
branch. Classes add styling, they do not remove the package roles, names or focus indicator.

<a id="prop-renderitem"></a>
### `renderItem`

`(context: CalendarMonthItemSlotContext<TItemData, TSourceData>) => ReactNode`. Replaces the visible content of a Month
chip or bar inside the package-owned wrapper, which keeps the accent marker, the item colors, the press behavior and the
cell's accessible summary. It is called once per visible segment with its exact clipped `segmentRange`, so a bar that
crosses a week boundary calls it once per week row. Content must be passive: text, static badges, icons. Links, buttons,
inputs, `contentEditable`, own tab stops or interactive roles are not allowed, even with `tabIndex={-1}`; use
[`onItemPress`](#prop-onitempress) and [`getItemActions`](#prop-getitemactions). After each commit development builds check
the actual DOM inside the wrapper and warn once, for example `renderItem: Interactive content <a href> is not allowed in
passive slot content; use onItemPress or getItemActions`. The check is best-effort: portals, shadow trees and later
mutations are not seen, and an undetected violation is still not supported.

```tsx
<Calendar
    {...props}
    renderItem={({item}) => <><span className="badge">{item.data.priority}</span> {item.title}</>}
    renderAgendaItem={({item, date}) => <span>{item.title} · {item.data.assignee} · {date}</span>}
    classNames={{item: ({item}) => `priority-${item.data.priority}`, day: ({isToday}) => isToday ? 'is-today' : undefined}}
    getItemAppearance={item => item.data.blocked ? {accentColor: 'crimson'} : undefined}
/>
```

Allowed and not allowed slot content:

```tsx
// Allowed: passive text, static badges and icons.
renderItem={({item}) => <><span className="badge">{item.data.priority}</span> {item.title}</>}
// Not allowed: links, buttons, inputs or tab stops of their own, even with tabIndex={-1}.
renderItem={({item}) => <a href={`/tasks/${item.id}`}>{item.title}</a>}
renderItem={({item}) => <button type="button" onClick={() => archive(item)}>Archive</button>}
// Instead: onItemPress opens the task, getItemActions offers "Archive" in the day agenda.
onItemPress={({item}) => openTask(item.id)}
getItemActions={() => [{id: 'archive', label: 'Archive'}]}
```

<a id="prop-renderagendaitem"></a>
### `renderAgendaItem`

`(context: CalendarAgendaItemSlotContext<TItemData, TSourceData>) => ReactNode`. Replaces the visible content of an agenda row;
called once per item of the agenda date. The default summary (title, times, source) stays as visually hidden text and starts
the accessible name of the row's press control; the visible custom content follows it in the name, so what the user sees
is part of what assistive technologies and speech input use (WCAG 2.5.3). Without the slot
the name is the summary alone. The row keeps its accent
marker and colors, and the actions trigger stays outside the custom content. The passive-content rules of
[`renderItem`](#prop-renderitem) apply.

<a id="prop-renderdayheader"></a>
### `renderDayHeader`

`(context: CalendarDayState) => ReactNode`. Replaces the visible header of each date cell. The cell keeps its full accessible
name (the long date) and description (counts, today, viewed day); the header is hidden from assistive technology. Passive
content only, as for [`renderItem`](#prop-renderitem).

<a id="prop-rendertoolbarcontent"></a>
### `renderToolbarContent`

`(context: CalendarToolbarSlotContext) => ReactNode`. An extension area after the package toolbar controls (navigation,
Today, source selector); it never replaces them. It is outside the grid, so it may contain your own controls, which keep
their normal Tab order after the package controls; their names, keyboard behavior and focus styles are yours.

<a id="prop-renderloading"></a>
### `renderLoading`

`(context: CalendarLoadingSlotContext) => ReactNode`. Replaces the default body of the loading region (initial: the region
that replaces the grid; refresh: an in-flow banner above the grid instead of the thin progress bar). The region keeps its
role and name; your content may contain controls.

<a id="prop-renderempty"></a>
### `renderEmpty`

`(context: CalendarEmptySlotContext) => ReactNode`. Replaces the `emptyLabel` body of the named region shown when the visible
range has no item after the source filter.

<a id="prop-rendererror"></a>
### `renderError`

`(context: CalendarErrorSlotContext) => ReactNode`. Replaces the default body of the error region. For `kind: 'data'` the
standard Retry button is not shown once you replace the body: call `onRetryRequest` from your own accessible control. It also
renders the contract error shell with `{kind: 'contract', error, hasStaleItems: false}`, which has no range and no retry. An
error thrown by your renderer belongs to your error boundary.

<a id="unavailable"></a>
## Props not available in alpha.2

These keys exist in the published `CalendarProps` only as `?: never`. If they reach `Calendar` at runtime (for example from
untyped JavaScript), each one is removed before validation, never takes effect and produces one development warning
`[@nelmad/calendar] <prop>: not available in 0.2.0-alpha.2; ignored` (silent in production). Any other unknown prop is
stripped the same way with its own wording: a 0.1 prop gives
`[@nelmad/calendar] <prop>: removed in 0.2; see the migration guide (docs/migration-0.1-to-0.2.md); ignored`, any other
name `[@nelmad/calendar] <prop>: not a Calendar prop; ignored`. React's `key`, `ref` (a React 19 `ref` reaches the props)
and `children` are stripped without a warning.

| Planned for | Props |
| --- | --- |
| `0.2.0-beta.1` | `selection`, `onSelectionChange`, `onCreateRequest`, `itemMoveStates`, `onItemMoveRequest`, `onItemMoveDraftChange`, `interactionPolicy` |

<a id="callbacks"></a>
## Callback timing

| Callback | When | Payload |
| --- | --- | --- |
| `onNavigate` | Synchronously in the user event handler | First day of the requested month |
| `onVisibleRangeChange` | In a commit effect, after the DOM is updated | New `CalendarVisibleRange` object |
| `onAgendaDateChange` | Synchronously in the user event handler | Requested date |
| `onRetryRequest` | Synchronously on Retry press | none |
| `onItemPress` | Synchronously after a completed press | `CalendarItemPressRequest` |
| `onItemActionRequest` | Synchronously after a completed action activation | `CalendarItemActionRequest` |
| `onVisibleSourceIdsChange` | Synchronously on a source toggle | Next `visibleSourceIds` |

No callback runs during render or on the server, and none runs while the contract error shell is shown. Callbacks may be
new functions on every render. `sortItems`, `getItemActions`, `getItemAppearance`, the `render*` slots, `classNames` callbacks and message functions are
pure resolvers, not notifications: React may call them more than once, so they must not have side effects.

<a id="tokens"></a>
## Tokens and CSS variables

| Token path | CSS variable | `classicTheme` default (light) | Conforming value |
| --- | --- | --- | --- |
| `color.surface` | `--nelmad-calendar-color-surface` | `#fff` | CSS `<color>` |
| `color.text` | `--nelmad-calendar-color-text` | `#21201f` | CSS `<color>` |
| `color.muted` | `--nelmad-calendar-color-muted` | `#66625e` | CSS `<color>` |
| `color.border` | `--nelmad-calendar-color-border` | `#8b8680` | CSS `<color>` |
| `color.accent` | `--nelmad-calendar-color-accent` | `#b52f21` | CSS `<color>` |
| `color.danger` | `--nelmad-calendar-color-danger` | `#b21f24` | CSS `<color>` |
| `color.focus` | `--nelmad-calendar-color-focus` | `#135fd1` | CSS `<color>` |
| `typography.fontFamily` | `--nelmad-calendar-typography-font-family` | inherited | `font-family` list |
| `typography.fontSize` | `--nelmad-calendar-typography-font-size` | inherited | positive `<length-percentage>` |
| `typography.fontWeight` | `--nelmad-calendar-typography-font-weight` | inherited | `font-weight` |
| `typography.lineHeight` | `--nelmad-calendar-typography-line-height` | inherited | `normal`, positive number or `<length-percentage>` |
| `spacing.xs` | `--nelmad-calendar-spacing-xs` | `4px` | non-negative `<length>` |
| `spacing.sm` | `--nelmad-calendar-spacing-sm` | `8px` | non-negative `<length>` |
| `spacing.md` | `--nelmad-calendar-spacing-md` | `16px` | non-negative `<length>` |
| `spacing.lg` | `--nelmad-calendar-spacing-lg` | `24px` | non-negative `<length>` |
| `density.dayMinHeight` | `--nelmad-calendar-density-day-min-height` | `100px` (comfortable `128px`) | positive `<length>` |
| `density.itemHeight` | `--nelmad-calendar-density-item-height` | `24px` (comfortable `32px`) | positive `<length>` |
| `density.gap` | `--nelmad-calendar-density-gap` | `4px` (comfortable `8px`) | non-negative `<length>` |
| `radii.sm` | `--nelmad-calendar-radii-sm` | `6px` | non-negative `<length-percentage>` |
| `radii.md` | `--nelmad-calendar-radii-md` | `13px` | non-negative `<length-percentage>` |
| `radii.lg` | `--nelmad-calendar-radii-lg` | `24px` | non-negative `<length-percentage>` |
| `shadows.overlay` | `--nelmad-calendar-shadows-overlay` | `0 8px 24px rgb(0 0 0 / 18%)` | `box-shadow` list or `none` |
| `motion.duration` | `--nelmad-calendar-motion-duration` | `100ms` | non-negative `<time>` |
| `motion.easing` | `--nelmad-calendar-motion-easing` | `ease-out` | `<easing-function>` |
| `components.itemBackground` | `--nelmad-calendar-components-item-background` | `#f2f0ec` | CSS `<color>` |
| `components.itemText` | `--nelmad-calendar-components-item-text` | `#21201f` | CSS `<color>` |
| `components.selectedDayBackground` | `--nelmad-calendar-components-selected-day-background` | `#fde5df` | CSS `<color>` |

The dark scheme (`colorScheme="dark"`, or `"system"` with a dark preference) changes the color and component defaults.
`var()`, `calc()` and relative units are fine when the computed value conforms; spacing and density do not accept
percentages. Chips, bars and agenda rows use `components.itemBackground` and `components.itemText`;
`components.selectedDayBackground` colors only selected days, which alpha.2 does not offer. `neutralTheme` changes the
color and component defaults (light: surface `#fff`, text `#1b1f24`, muted `#545d68`, border `#818b98`, accent
`#0a5bc4`, danger `#b4232c`, focus `#7139c9`, item background `#eef1f5`), the radii (`4px`, `6px`, `10px`), the overlay
shadow and motion (`150ms`, `cubic-bezier(0.2, 0, 0, 1)`); it keeps the density, spacing and typography defaults. Both
presets have a dark palette. Buttons and menu items derive
their fill and hover state from `color.surface` and `color.text`.

Precedence for every variable, lowest first: theme and density defaults (declared on the root with zero specificity) →
your CSS on the root element → `tokens` (inline) → the same variable in `style` (inline, merged last). CSS `!important`
follows the normal cascade. Declarations on an ancestor of the root do not apply, because the defaults are declared on the
root itself. A `tokens` value that is one declaration value is passed through unchanged; the calendar does not call
`CSS.supports` or read computed styles during render. A sizing value that measures as zero or non-finite falls back to zero lanes and `+N`.

<a id="messages"></a>
## Message catalog

`CalendarMessages` has 63 keys. All of them can be overridden; the following are displayed or announced in alpha.2:

| Key | Signature | `en-US` | `ru-RU` |
| --- | --- | --- | --- |
| `calendarLabel` | `string` | Calendar | Календарь |
| `previousMonthLabel` | `string` | Previous month | Предыдущий месяц |
| `nextMonthLabel` | `string` | Next month | Следующий месяц |
| `todayLabel` | `string` | Today | Сегодня |
| `untitledItemLabel` | `string` | Untitled | Без названия |
| `closeAgendaLabel` | `string` | Close day agenda | Закрыть события дня |
| `agendaHeading` | `(date: ISODate) => string` | Events for {date} | События: {date} |
| `agendaEmpty` | `string` | No events on this day | На этот день событий нет |
| `itemCountLabel` | `(date: ISODate, count: number) => string` | {date}: {count} events | {date}: {count} событий |
| `moreItemsLabel` | `(date: ISODate, count: number) => string` | {date}: {count} events hidden | {date}: ещё {count} событий |
| `todayStateLabel` | `string` | Today | Сегодня |
| `viewedDateStateLabel` | `string` | Viewed day | Открытый день |
| `retryLabel` | `string` | Retry | Повторить |
| `loadingLabel` | `string` | Loading calendar | Загрузка календаря |
| `refreshingLabel` | `string` | Refreshing calendar | Обновление календаря |
| `emptyLabel` | `string` | No events in this month | В этом месяце событий нет |
| `errorLabel` | `string` | Could not load calendar | Не удалось загрузить календарь |
| `invalidConfigurationLabel` | `string` | Calendar cannot be displayed: invalid configuration | Не удалось показать календарь: неверные настройки |
| `navigationBoundaryReason` | `string` | Month is outside the supported range | Месяц вне поддерживаемого диапазона |
| `gridInstructions` | `string` | Use arrow keys to navigate dates. Enter opens day events. Page Up and Page Down change the month. | Стрелки — перейти к дате. Enter — открыть события дня. Page Up и Page Down — сменить месяц. |
| `monthChangedAnnouncement` | `(monthStart: ISODate) => string` | Showing {month} | Открыт месяц: {month} |
| `refreshCompletedAnnouncement` | `string` | Calendar refreshed | Календарь обновлён |
| `agendaUpdatedAnnouncement` | `(date: ISODate, count: number) => string` | Showing {date}, {count} events | Открыты события: {date}, {count} событий |
| `sourceSelectorLabel` | `string` | Calendars | Календари |
| `showSourceLabel` | `(sourceTitle: string) => string` | Show calendar {title} | Показать календарь {title} |
| `hideSourceLabel` | `(sourceTitle: string) => string` | Hide calendar {title} | Скрыть календарь {title} |
| `itemActionsLabel` | `(itemTitle: string) => string` | Actions for {title} | Действия: {title} |
| `cancelLabel` | `string` | Cancel | Отмена |

`{date}` is a short localized date, `{month}` the month and year, `{count}` a localized number with the plural form of the
catalog language, `{title}` the source or item title (the untitled fallback applies to items), isolated as bidirectional
text.

The other 35 keys are typed for the planned `0.2` API and are not displayed in alpha.2: `openAgendaLabel`,
`selectedStateLabel`, `selectionDraftStateLabel`, `unavailableStateLabel`, `pendingStateLabel`, `selectDateLabel`,
`selectRangeLabel`, `confirmSelectionLabel`, `clearSelectionLabel`, `createLabel`, `moveItemLabel`, `confirmMoveLabel`,
`genericBlockedReason`, `selectionBoundaryReason`, `moveDstGapReason`, `moveBoundaryReason`, `moveItemChangedReason`,
`moveTimeZoneChangedReason`, `moveItemUnavailableReason`, `rangeSelectionInstructions`, `moveInstructions`,
`blockedAnnouncement`, `selectionStartedAnnouncement`, `selectionTargetAnnouncement`, `selectionCancelledAnnouncement`,
`selectionCompletedAnnouncement`, `selectionClearedAnnouncement`, `moveStartedAnnouncement`,
`moveNavigationPendingLabel`, `moveTargetAnnouncement`, `moveCancelledAnnouncement`, `moveNoopAnnouncement`,
`movePendingAnnouncement`, `moveSucceededAnnouncement`, `moveRejectedAnnouncement`. Their exact signatures are in the
[generated report](api/calendar.api.md).

<a id="data-attributes"></a>
## `data-*` attributes

The stable styling and testing contract (`CalendarDataAttribute`). Booleans are `"true"` when active and absent otherwise.
Each attribute appears only on the elements listed here; "portal theme roots" are the package-owned theme roots of the
agenda popover and sheet, item action menus and sheets, and the source selector menu and sheet of that calendar.

| Attribute | Element | Values |
| --- | --- | --- |
| `data-theme` | calendar root and its portal theme roots | `"classic"`, `"neutral"` |
| `data-layout` | calendar root | resolved `"desktop"`, `"mobile"`; `"mobile"` for `auto` before the first measurement and in the contract error shell |
| `data-density` | calendar root and its portal theme roots | `"compact"`, `"comfortable"` |
| `data-color-scheme` | calendar root and its portal theme roots | requested `"system"`, `"light"`, `"dark"` |
| `data-dir` | calendar root and its portal theme roots | resolved `"ltr"`, `"rtl"` |
| `data-status` | calendar root | `"ready"`, `"loading"`, `"error"` (also for contract errors) |
| `data-loading-phase` | calendar root | `"initial"`, `"refresh"`; only with `data-status="loading"` |
| `data-date` | each date `gridcell`, the agenda root | the ISO date |
| `data-today` | date `gridcell` | `"true"` for the known today |
| `data-agenda-date` | date `gridcell` | `"true"` for the viewed agenda date |
| `data-selected` | date `gridcell`, Month segment and agenda item wrappers | `"true"` for the accepted selection (beta.1) |
| `data-selection-draft` | date `gridcell` | `"true"` inside the selection draft (beta.1) |
| `data-selection-unavailable` | date `gridcell` | `"true"` when the date cannot be selected (beta.1) |
| `data-outside-month` | date `gridcell` | `"true"` for days of neighboring months |
| `data-has-items` | date `gridcell` | `"true"` when the day has at least one valid item after the source filter |
| `data-item-id` | each Month segment wrapper and agenda item wrapper | the exact `item.id` |
| `data-view` | the same item wrappers | `"month"`, `"agenda"` |
| `data-dragging` | the same item wrappers | `"true"` while the item is dragged (beta.1) |
| `data-pending` | the same item wrappers | `"true"` while a move is pending (beta.1) |
| `data-presentation` | the agenda root | resolved `"popover"`, `"inline"`, `"sheet"` |

The contract error shell has `data-theme="classic"`, `data-layout="mobile"`, `data-density="compact"`,
`data-color-scheme="system"`, `data-status="error"`, the fallback `data-dir`, no `data-loading-phase`, no portals and no
view attributes. Selection, drag and pending attributes never appear in alpha.2, because those states do not exist yet.
Two calendars never share or mix these values: each portal theme root repeats the attributes of its own calendar. Other
attributes and class names are internal.

<a id="diagnostics"></a>
## Diagnostics

**Contract errors.** The first problem becomes the message of the `RangeError` behind the error shell; every problem is
also printed as a warning.

| Path | Reason |
| --- | --- |
| `props` | Expected a props object |
| `items`, `anchorDate`, `timeZone`, `onNavigate` (missing) | Required; expected a readonly array / an ISO date such as 2026-09-01 / an IANA time zone such as Europe/Moscow / a function |
| `anchorDate` | Expected YYYY-MM-DD in 0001…9999; Expected an existing date; `<date>` does not exist; anchorDate must be between February 0001 and November 9999 |
| `timeZone` | Timezone is outside the package accepted-set |
| `today`, `agendaDate` | Expected YYYY-MM-DD in 0001…9999; Expected an existing date; `<date>` does not exist |
| `layout` | Unknown enum value; expected 'auto' or 'desktop' or 'mobile' |
| `mobileBreakpoint` | Expected a positive finite number |
| `firstDayOfWeek`, `hourCycle`, `dir`, `agendaPresentation`, `density`, `colorScheme` | Unknown enum value |
| `locale`, `messagesLocale` | Expected a well-formed BCP 47 language tag |
| present `onNavigate`, `onVisibleRangeChange`, `onAgendaDateChange`, `onRetryRequest`, `onItemPress`, `sortItems`, `getItemActions`, `onItemActionRequest`, `onVisibleSourceIdsChange` | Expected a function |
| `agendaDate`, `visibleSourceIds`, `getItemActions` | Must be supplied together with onAgendaDateChange / onVisibleSourceIdsChange / onItemActionRequest |
| `items`, `sources`, `visibleSourceIds` | Expected a readonly array |
| `sources` | Controlled source filtering requires sources |
| `showSourceSelector` | Requires visibleSourceIds and its callback; Expected a boolean |
| `dataState`, `dataState.phase`, `dataState.error` | Unknown data state; Expected initial or refresh; Error state requires an error payload |
| `theme` | Expected a package theme preset |
| `classNames`, `classNames.<key>` | Expected an object of class names; Expected a class name string or function |

The shell is a named `region` with a visible error region (`invalidConfigurationLabel`) and an urgent announcement; it has
no toolbar, grid, agenda, retry or callbacks. Its language comes from a valid `messagesLocale`, then a valid `locale`, then
`ru-RU`; its direction from a valid `dir`, then the valid `locale`, then `ltr`. `className`, `style`, `id` and the ARIA
naming props still apply; `tokens` do not. Fixing the props renders the calendar again; cancelled requests do not resume.

**Excluded records and recoverable values** (warnings only):

| Path | Reason |
| --- | --- |
| `items[i]` | Invalid item id, title or calendarId; All items with this ID are excluded |
| `items[i].interval` | The parser reason, e.g. Expected YYYY-MM-DD in 0001…9999, Expected an existing date; `<date>` does not exist, Invalid RFC3339 grammar, A date range requires end > start, Timed end must be >= start, Timezone is outside the package accepted-set |
| `items[i].title` | Use the localized untitled-item label |
| `items[i].calendarId` | No source with ID `"<id>"`; items with this calendarId remain visible with fallback appearance (once per unknown ID, at its first item) |
| `items[].calendarId` | No sources supplied; affected items remain visible with fallback appearance (without a `sources` prop: one warning for all) |
| `sources[i]` | Source requires nonempty id and title; All sources with this ID are excluded |
| `visibleSourceIds[i]` | Unknown or repeated source ID |
| `getItemActions("<id>").actions[i]`, `getItemActions("<id>").actions` | Invalid action id, label or tone; All actions with this ID are excluded; Expected an array |
| `locale` | `<tag>` is unsupported; using en-US |
| `messages.<key>`, `messages.*` | Expected a nonempty message of the declared shape; using built-in fallback |
| `tokens.<group>`, `tokens.<group>.<token>` | Expected a token group; Expected a nonempty CSS string; Expected a single CSS declaration value |
| `sources("<id>").color` | Expected a nonempty CSS color string; ignored / Expected a single CSS declaration value; ignored |
| `getItemAppearance("<id>")`, `getItemAppearance("<id>").<field>` | Expected an appearance object or undefined; ignored / Expected a nonempty CSS color string; ignored / Expected a single CSS declaration value; ignored |
| `renderItem`, `renderAgendaItem`, `renderDayHeader` | Interactive content `<tag …>` is not allowed in passive slot content; use onItemPress or getItemActions |
| `portalContainer` | The calendar is inside a role="dialog" element without aria-modal="true", … (default target `body` inside an unmarked host dialog, see [`portalContainer`](#prop-portalcontainer)); the reason of a rejected container |
| `sortItems` | Non-finite comparator result is treated as zero |
| `aria-labelledby` | Ignored missing, empty or cross-tree references: `<ids>` |
| `<prop>` (a later prerelease) | not available in 0.2.0-alpha.2; ignored |
| `<prop>` (0.1) | removed in 0.2; see the migration guide (docs/migration-0.1-to-0.2.md); ignored |
| other `<prop>` | not a Calendar prop; ignored |

Diagnostics are written after the client commit that rendered them, including a message rendered only in the agenda (the
unavailable-prop warning also during render, including SSR), and are deduplicated per instance (props outside the
prerelease once per prop name for the whole module; an unknown `calendarId` once per ID). A root that is being removed is not validated, so unmounting never reports `aria-labelledby`. Warning texts are diagnostics, not API.

<a id="time-zones"></a>
## Accepted time zones

`timeZone` and `interval.timeZone` accept the 445 primary identifiers, `UTC` included, generated from IANA tzdb 2026c by the
ECMA-402 edition 12 rules, case-sensitively and without alias mapping. The list is part of the package data and is the same
in ESM, CJS, server and browser; `Intl.supportedValuesOf` and the host zone are never consulted. Guaranteed members include
`UTC`, `Europe/Moscow`, `Europe/Berlin`, `America/New_York`, `Asia/Tokyo` and `Pacific/Apia`. Rejected examples: `Etc/UTC`,
`GMT`, `US/Eastern`, `europe/berlin`, `+03:00`, `""`.

The full list with its SHA-256 is in [timezones-candidate.en.md](implementation/timezones-candidate.en.md). It is a
candidate: the list is frozen for the whole `0.2.x` line at the first release candidate. Offsets and transitions still come
from the runtime's Intl data.

<a id="browser-zones"></a>
### The browser's own zone

`Intl.DateTimeFormat().resolvedOptions().timeZone` does not always return an accepted identifier. For 19 zones Chrome 154
and Node.js 24 report a legacy name, and the calendar rejects it (contract error) like any other alias:

| Reported by the browser | Accepted identifier |
| --- | --- |
| `Africa/Asmera` | `Africa/Asmara` |
| `America/Buenos_Aires` | `America/Argentina/Buenos_Aires` |
| `America/Catamarca` | `America/Argentina/Catamarca` |
| `America/Coral_Harbour` | `America/Atikokan` |
| `America/Cordoba` | `America/Argentina/Cordoba` |
| `America/Godthab` | `America/Nuuk` |
| `America/Indianapolis` | `America/Indiana/Indianapolis` |
| `America/Jujuy` | `America/Argentina/Jujuy` |
| `America/Louisville` | `America/Kentucky/Louisville` |
| `America/Mendoza` | `America/Argentina/Mendoza` |
| `Asia/Calcutta` | `Asia/Kolkata` |
| `Asia/Katmandu` | `Asia/Kathmandu` |
| `Asia/Rangoon` | `Asia/Yangon` |
| `Asia/Saigon` | `Asia/Ho_Chi_Minh` |
| `Atlantic/Faeroe` | `Atlantic/Faroe` |
| `Europe/Kiev` | `Europe/Kyiv` |
| `Pacific/Enderbury` | `Pacific/Kanton` |
| `Pacific/Ponape` | `Pacific/Pohnpei` |
| `Pacific/Truk` | `Pacific/Chuuk` |

Map these names before passing a detected zone, and keep a fallback for a runtime that reports something else.
`getCalendarVisibleRange` throws for a zone outside the list, so it can check the result:

```ts
import {getCalendarVisibleRange, type IanaTimeZone} from '@nelmad/calendar';

// Legacy names that Chrome 154 and Node.js 24 report for accepted zones.
const legacyZones: Record<string, IanaTimeZone> = {
    'Africa/Asmera': 'Africa/Asmara', 'America/Buenos_Aires': 'America/Argentina/Buenos_Aires', 'America/Catamarca': 'America/Argentina/Catamarca',
    'America/Coral_Harbour': 'America/Atikokan', 'America/Cordoba': 'America/Argentina/Cordoba', 'America/Godthab': 'America/Nuuk',
    'America/Indianapolis': 'America/Indiana/Indianapolis', 'America/Jujuy': 'America/Argentina/Jujuy', 'America/Louisville': 'America/Kentucky/Louisville',
    'America/Mendoza': 'America/Argentina/Mendoza', 'Asia/Calcutta': 'Asia/Kolkata', 'Asia/Katmandu': 'Asia/Kathmandu',
    'Asia/Rangoon': 'Asia/Yangon', 'Asia/Saigon': 'Asia/Ho_Chi_Minh', 'Atlantic/Faeroe': 'Atlantic/Faroe',
    'Europe/Kiev': 'Europe/Kyiv', 'Pacific/Enderbury': 'Pacific/Kanton', 'Pacific/Ponape': 'Pacific/Pohnpei',
    'Pacific/Truk': 'Pacific/Chuuk',
};

/** The viewer's zone as an accepted identifier, or `fallback` when the package does not accept it. */
export function viewerTimeZone(fallback: IanaTimeZone = 'UTC'): IanaTimeZone {
    const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const zone = legacyZones[detected] ?? detected;
    try {
        getCalendarVisibleRange({anchorDate: '2026-01-01', timeZone: zone}); // throws RangeError for a zone outside the list
        return zone;
    } catch {
        return fallback;
    }
}
```

<a id="stability"></a>
## Stability

`0.2.0-alpha.2` is a prerelease: a later prerelease may change this API with a changelog entry. The compatibility promise
for `0.2.x` patch releases starts with stable `0.2.0`.

<a id="releases"></a>
## Releases and provenance

Releases follow [RELEASING.md](../RELEASING.md): after CI passes on the commit, a maintainer runs the
[Release workflow](../.github/workflows/release.yml) on `main`, which stages the version on npm with provenance through
trusted publishing. The version becomes public only after a maintainer approves it with two-factor authentication; then
the tag and a GitHub Release with the changelog section are created. Prereleases use the `next` dist-tag.
`npm audit signatures` in your application verifies the registry signatures and provenance attestations; see
[Releases and provenance](../README.md#releases).
