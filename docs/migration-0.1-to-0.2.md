# Migrating from 0.1 to 0.2

**English** · [Русский](migration-0.1-to-0.2.ru.md) · [README](../README.md) · [API reference](api.md)

<a id="overview"></a>
## Overview

`0.2` is a deliberate breaking release. It has one data model, `items` with an explicit IANA `timeZone`, and no legacy
mode, compatibility adapter or deprecated alias: the calendar does not recognize the 0.1 props and does not map them
silently. This guide converts your data and callbacks in the application. It targets `0.2.0-alpha.2`, which offers the
Month view with a responsive desktop/mobile layout, the day agenda, controlled navigation and loading, `onItemPress`, item
actions, controlled sources, localization, `classicTheme` and `neutralTheme`, item colors and content slots; see
[What alpha.2 does not offer yet](#not-yet).

<a id="checklist"></a>
## Checklist

1. Install the new version and remove calendar-only peers ([Dependencies](#dependencies)).
2. Convert `events` to `items` with domain fields in `data` ([Events to items](#items)).
3. Choose an explicit IANA `timeZone` ([Time zone](#time-zone)) and resolve offset-less timestamps ([Offset-less
   timestamps](#offset-less)).
4. Convert all-day dates from inclusive to exclusive ends ([All-day](#all-day)); keep timed instants ([Timed](#timed)).
5. Replace callbacks, loading and styling props ([Callbacks](#callbacks), [Loading](#loading), [Styling](#styling)).
6. Replace removed helpers ([Helpers](#helpers)) and remove every import listed in [Removed exports](#removed-exports).
7. Choose a layout: the default `layout="auto"` follows the width of the calendar; pass `layout="desktop"` to keep the
   seven-column grid of 0.1 at every width.

<a id="dependencies"></a>
## Dependencies

0.1 asked the application to install `dayjs`, `react-aria-components` and `@react-aria/interactions` next to the calendar.
`0.2` has only `react` and `react-dom` as peers (`^18.2.0 || ^19.0.0`) and ships its date and accessibility libraries as
ordinary dependencies; Day.js is not used at all. Remove those packages unless your application uses them itself, and
install the calendar as described in the [README](../README.md#install). Day.js locale imports no longer configure the
calendar: use `locale`.

<a id="items"></a>
## Events to items

Rename the prop `events` to `items`. Every item has `id`, `title`, `interval` and a generic `data`; keep all domain fields
there, including `taskId`, `variant`, `isOverdue`, `isCritical`, `isClickable` and `hasHoverActions`. The calendar does
not read them; map them yourself to [`getItemAppearance`](api.md#prop-getitemappearance),
[`getItemActions`](api.md#prop-getitemactions) and the content slots ([Styling](#styling), [Callbacks](#callbacks)). An empty calendar is `items={[]}`. IDs must be
unique and nonempty; records that fail validation are excluded with a development warning instead of breaking the
calendar.

<a id="time-zone"></a>
## Time zone

0.1 drew everything in one fixed offset (`utcOffset`, or the lowercase alias `timezone` that took the same `+03:00`
string, falling back to `+00:00`). `0.2` requires `timeZone`, an IANA identifier such as `Europe/Moscow`, and applies its
DST and historical rules. A fixed offset does not identify one geographic zone, so the calendar never turns `+03:00`
into a zone for you: choose the zone your users mean. A fixed-offset string passed as `timeZone` is a contract error.

<a id="offset-less"></a>
## Offset-less timestamps

0.1 parsed strings through Day.js, so a value like `2026-09-03T10:00:00` was read in the host zone of whichever machine
ran the code. `0.2` accepts only RFC 3339 timestamps with `Z` or `±HH:MM`. Resolve such values to explicit instants
before migration, using what your data actually means (for example the zone of the office that entered them). Do not pass
them through unchanged and do not let the runtime choose: the conversion function below rejects them.

<a id="all-day"></a>
## All-day: inclusive to exclusive

In 0.1 an all-day event covered the dates of `start` and `end` in the display offset, both inclusive; without `end` it
covered the start date. In `0.2` an all-day interval is a pair of dates with an **exclusive** end:

- take the start date and the last included date in the 0.1 display offset;
- the new `end` is the calendar day after the last included date (add one calendar day to the date, not 24 hours to an
  instant);
- a missing 0.1 `end` means the last included date is the start date.

Dates 3–4 September become `[2026-09-03, 2026-09-05)`; an event on 3 September without an end becomes
`[2026-09-03, 2026-09-04)`. Only the covered dates carry over, not the time-of-day of the old timestamps; keep the
originals in `data` if you need them. All-day dates no longer move when the time zone changes.

<a id="timed"></a>
## Timed: instants are kept

For timed events keep the `start` and `end` instants; a missing `end` stays missing and the item becomes a moment on its
start date. The layout uses exclusive ends, so it can differ from 0.1: an event that ends exactly at midnight no longer
appears on the next day. For example `22:00 → 00:00` on 14 September occupies only 14 September. Do not add a millisecond
or a day to reproduce the old bar; the old layout is not promised.

<a id="conversion"></a>
## Conversion function

This function is the file [`examples/migration/convert.ts`](../examples/migration/convert.ts), checked by the repository
tests: inclusive to exclusive conversion, a missing end, preserved instants and the midnight difference rendered by the
real `Calendar`.

<!-- file: examples/migration/convert.ts -->
```ts
import type {CalendarItem, ISODate, RFC3339DateTime} from '@nelmad/calendar';

/** The 0.1 event shape. Keep it in the application only while migrating. */
export type LegacyEvent = {
    id: string; start: string; end?: string; title: string;
    variant: 'red' | 'blue' | 'green' | 'grey';
    isOverdue: boolean; isCritical: boolean; isAllDay: boolean;
    taskId: string | null; isClickable: boolean; hasHoverActions: boolean;
};
/** Domain fields move to `data`; the original 0.1 timestamps stay there as well. */
export type LegacyEventData = Omit<LegacyEvent, 'id' | 'title' | 'isAllDay'>;

const strict = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;
const timestamp = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d+))?)?(Z|([+-])(\d{2}):(\d{2}))$/;

/** A real calendar date 0001-01-01…9999-12-31 (no 30 February), as 0.2 requires. */
function isoDate(value: string, field: string): ISODate {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    const [year, month, day] = match ? match.slice(1).map(Number) : [];
    const days = month === 2 ? (year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28) : [4, 6, 9, 11].includes(month) ? 30 : 31;
    if (!match || year < 1 || month < 1 || month > 12 || day < 1 || day > days) throw new RangeError(`${field}: ${value} is not a calendar date`);
    return value;
}
/**
 * An instant with an explicit offset. Offset-less values are resolved by the application first; `-00:00` (offset
 * unknown), hour 24, leap seconds and impossible dates throw like in 0.2 instead of being moved by `Date.parse`.
 */
function instant(value: string, field: string): RFC3339DateTime {
    const match = timestamp.exec(value);
    if (!match || match[6] === '-00:00') throw new RangeError(`${field}: ${value} is not a timestamp with a UTC offset`);
    const [hour, minute, second, offsetHour, offsetMinute] = [match[2], match[3], match[4] ?? '0', match[8] ?? '0', match[9] ?? '0'].map(Number);
    if (hour > 23 || minute > 59 || second > 59 || offsetHour > 23 || offsetMinute > 59) throw new RangeError(`${field}: ${value} has an invalid time or offset`);
    const date = isoDate(match[1], field), time = new Date(0);
    time.setUTCFullYear(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8)));
    time.setUTCHours(hour, minute - (match[7] === '-' ? -1 : 1) * (offsetHour * 60 + offsetMinute), second, Number((match[5] ?? '').slice(0, 3).padEnd(3, '0')));
    if (time.getUTCFullYear() < 1 || time.getUTCFullYear() > 9999) throw new RangeError(`${field}: ${value} is outside 0001…9999`);
    // Same instant; only a non-strict spelling (no seconds, more digits) is rewritten in UTC.
    return strict.test(value) ? value : time.toISOString();
}
/** The calendar date of a 0.1 value in the fixed display offset that 0.1 used, e.g. '+03:00'. */
function dateAt(value: string, field: string, displayOffset: string): ISODate {
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return isoDate(value, field);
    const offset = /^([+-])(\d{2}):(\d{2})$/.exec(displayOffset);
    if (!offset) throw new RangeError(`displayOffset: ${displayOffset} is not ±HH:MM`);
    const minutes = (offset[1] === '-' ? -1 : 1) * (Number(offset[2]) * 60 + Number(offset[3]));
    // A date outside 0001…9999 in that offset (year 0 or +010000) throws like any other invalid date.
    return isoDate(new Date(Date.parse(instant(value, field)) + minutes * 60_000).toISOString().slice(0, 10), field);
}
/** Adds one calendar day to a date-only value, not 24 hours to an instant. 9999-12-31 has no exclusive end in 0.2. */
function nextDay(date: ISODate, field: string): ISODate {
    if (date === '9999-12-31') throw new RangeError(`${field}: ${date} has no exclusive end date in 0001…9999`);
    const value = new Date(`${date}T00:00:00Z`);
    value.setUTCDate(value.getUTCDate() + 1);
    return value.toISOString().slice(0, 10);
}

/**
 * Converts one 0.1 event. All-day: the inclusive 0.1 dates in `displayOffset` become an
 * exclusive date range; a missing end means one day. Timed: instants are kept, a missing
 * end stays missing (a moment). The Calendar time zone is chosen separately.
 */
export function toCalendarItem(event: LegacyEvent, displayOffset: string): CalendarItem<LegacyEventData> {
    const {id, title, isAllDay, ...data} = event;
    if (isAllDay) {
        const start = dateAt(event.start, 'start', displayOffset);
        const last = event.end === undefined ? start : dateAt(event.end, 'end', displayOffset);
        if (last < start) throw new RangeError(`end: ${event.end} is before start`);
        return {id, title, data, interval: {kind: 'allDay', start, end: nextDay(last, event.end === undefined ? 'start' : 'end')}};
    }
    const start = instant(event.start, 'start');
    if (event.end === undefined) return {id, title, data, interval: {kind: 'timed', start}};
    const end = instant(event.end, 'end');
    if (Date.parse(end) < Date.parse(start)) throw new RangeError(`end: ${event.end} is before start`);
    return {id, title, data, interval: {kind: 'timed', start, end}};
}
```

Pass the offset your 0.1 calendar used as `displayOffset`, then choose the IANA zone for the new calendar:

```tsx
const items = events.map(event => toCalendarItem(event, '+03:00'));

<Calendar items={items} timeZone="Europe/Moscow" layout="desktop" anchorDate={anchorDate} onNavigate={setAnchorDate}/>;
```

A date-only 0.1 value (`2026-09-03`) is taken as that date. The function throws `RangeError` for everything 0.2 would
exclude: an offset-less timestamp, `-00:00`, a malformed or out-of-range date, time or offset (for example 30 February,
`T24:00` or a leap second), a timed end before its start and an all-day end before its start. These records surface during
migration instead of being guessed or silently left out by the calendar.

<a id="callbacks"></a>
## Callbacks

| 0.1 | 0.2 |
| --- | --- |
| `onNavigate(anchorDate)` | Unchanged name and meaning: a request with the first day of the target month. Keep `anchorDate` in state. |
| `onEventPress(event)` | `onItemPress({item, date, view, segmentRange?})`: the item with its `data`, the pressed date and where it was pressed. |
| `isClickable` | No per-item flag: without `onItemPress` nothing is pressable; decide in your handler using `item.data`. |
| `onEventEdit`, `onEventDelete`, `hasHoverActions` | `getItemActions` with `onItemActionRequest`: return your actions per item (for example `{id: 'delete', label: 'Delete', tone: 'danger'}`) and run the chosen `actionId` in your handler. They appear in the day agenda as a desktop menu or a mobile action sheet, not on hover. |
| `SeriesActionScope` | No replacement: series actions are outside `0.2`; pass expanded occurrences as separate items. |

`onItemPress` and the item actions are also available to keyboard and screen-reader users through the day agenda, unlike the
0.1 hover actions. Per-project grouping moves to `sources` with `calendarId` on items; the controlled `visibleSourceIds` and
`onVisibleSourceIdsChange` add a built-in visibility selector.

<a id="loading"></a>
## Loading

Replace `isFetching` and the standalone `CalendarSkeleton` with `dataState`:

| 0.1 | 0.2 |
| --- | --- |
| `CalendarSkeleton` before the first data | `dataState={{status: 'loading', phase: 'initial'}}` |
| `isFetching` while reloading | `dataState={{status: 'loading', phase: 'refresh'}}`, items stay visible |
| Error handled outside the calendar | `dataState={{status: 'error', phase, error}}` with optional `onRetryRequest` |
| `getMonthGridRange(anchorDate)` for the query | `onVisibleRangeChange(range)` or `getCalendarVisibleRange(...)` on the server |

<a id="styling"></a>
## Styling

- Replace `import '@nelmad/calendar/tokens.css'` with the single stylesheet `import '@nelmad/calendar/styles.css'`, imported
  in every CSS tree scope that contains a calendar.
- A fixed-height parent is no longer required: the calendar has an intrinsic height; a definite height on the root itself
  limits it ([Sizing](../README.md#sizing)).
- The old `theme` object, `palette`, `overdueColor`, `criticalColor`, `progressBarColor` and the `--tc-*` variables have no
  aliases. Move the values by hand to the `tokens` prop or the `--nelmad-calendar-*` variables on the calendar root; the
  map of the 27 variables is in the [API reference](api.md#tokens). `theme` now takes the preset `classicTheme` or `neutralTheme`.
- Per-item colors of the 0.1 `variant` (and overdue or critical markers) become `getItemAppearance`, which returns an
  accent, background or text color from `item.data`; a project color becomes `CalendarSource.color`, which colors the
  accent only. Custom event content becomes `renderItem`/`renderAgendaItem` with passive content; edit and delete buttons
  become item actions.
- Replace `labels` with `messages` (partial overrides of the built-in `ru-RU`/`en-US` catalogs) and `messagesLocale`.
  The 0.1 time formatting functions in `labels` are replaced by `locale`, `hourCycle` and the Calendar `timeZone`.
- `data-testid` is not a prop; use `id`, `className` or the documented `data-*` attributes.

<a id="helpers"></a>
## Helpers

`getMonthGridRange(anchorDate)` returned `{from, to}` with an inclusive `to` and always started weeks on Monday.
`getCalendarVisibleRange({anchorDate, timeZone, locale, firstDayOfWeek})` returns `{start, end, timeZone}` with an
exclusive `end`, and weeks start on the locale's first day (Monday for `ru-RU`, Sunday for `en-US`) unless you pass
`firstDayOfWeek`. It is pure and safe on the server. `getMonthGridWeeks`, `buildWeekLayout` and `formatEventTime` have no
public replacement: layout and formatting belong to the calendar.

<a id="removed-exports"></a>
## Removed exports

| 0.1 export | Replacement in 0.2 |
| --- | --- |
| `CalendarEvent` | `CalendarItem<TItemData>` |
| `CalendarEventVariant`, `VariantColor`, `VariantPalette` | Keep the variant in `data`; per-item colors through `getItemAppearance` |
| `CalendarProps` (0.1 shape) | `CalendarProps<TItemData, TSourceData>` (new shape) |
| `SeriesActionScope` | None: series actions are outside `0.2` |
| `CalendarSkeleton`, `CalendarSkeletonProps` | `dataState` |
| `getMonthGridRange` | `getCalendarVisibleRange` |
| `getMonthGridWeeks`, `buildWeekLayout`, `EventSegment`, `WeekLayout` | None: layout is internal |
| `formatEventTime` | None: formatting follows `locale`, `hourCycle`, `timeZone` |
| `CalendarLabels`, `defaultLabels` | `CalendarMessages`, `messages` |
| `CalendarTheme` (0.1 color object), `defaultTheme` | `CalendarTheme` (opaque preset), `classicTheme`, `neutralTheme`, `tokens` |
| `defaultPalette`, `defaultOverdueColor`, `defaultCriticalColor`, `defaultProgressBarColor` | `tokens` / CSS variables |
| `DEFAULT_LOCALE` | `locale` defaults to `ru-RU` |
| `@nelmad/calendar/tokens.css` | `@nelmad/calendar/styles.css` |

Importing any of the named exports fails type checking against the new declarations. The side-effect import
`import '@nelmad/calendar/tokens.css'` is different: TypeScript does not resolve side-effect imports (unless
`noUncheckedSideEffectImports` is on), so it type-checks and fails only in the bundler or in Node, because the package no
longer exports that path. A 0.1 prop passed from untyped JavaScript is removed before validation with the development
warning `[@nelmad/calendar] events: removed in 0.2; see the migration guide (docs/migration-0.1-to-0.2.md); ignored`.

<a id="not-yet"></a>
## What alpha.2 does not offer yet

These parts of the planned `0.2` API are typed as unavailable in alpha.2 and ignored at runtime with a development
warning. Keep the corresponding 0.1 behavior out of the migrated screen until they ship:

- `0.2.0-beta.1`: date and range `selection` with `onSelectionChange` and `onCreateRequest`; moving items with
  `itemMoveStates`, `onItemMoveRequest` and `onItemMoveDraftChange`; `interactionPolicy`.

Recurrence series actions are outside `0.2`; pass expanded occurrences as separate items.

<a id="verification"></a>
## How this guide is verified

`tests/docs/migration.test.tsx` runs the conversion function and renders its output with the public `Calendar` on the
server: dates 3–4 September occupy exactly 3 and 4 September, a missing end occupies one day, timed instants are unchanged,
and a timed event ending at midnight counts only on its start date. Every value the function accepts is also accepted by
the calendar, and every value the calendar would exclude makes it throw. `npm run check:docs` checks that the function printed
above is identical to the tested file in both languages, that the examples use only the current exports and that the
English and Russian guides have the same sections and code.
