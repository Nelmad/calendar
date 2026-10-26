# @nelmad/calendar

**English** · [Русский](README.ru.md) · [API reference](docs/api.md) · [Migration from 0.1](docs/migration-0.1-to-0.2.md)

React month calendar with ISO intervals, IANA time zones and an accessible day agenda.

<a id="status"></a>
## Status

> **`0.2.0-alpha.2` is a prerelease, published on npm under the `next` dist-tag; `latest` remains `0.1.1`.** It is a
> breaking replacement for `0.1`: the 0.1 props, helpers, palettes, labels and token stylesheet are gone and there is no
> compatibility layer. This prerelease covers one working slice: the Month view with a responsive layout chosen from the calendar's own width (a desktop grid or a
> compact mobile grid), a complete day agenda as a non-modal popover, an inline region below the mobile grid or a modal
> sheet, controlled navigation and visible-range loading, data states, `onItemPress`, item actions in the agenda,
> controlled sources with a built-in selector, localization, `classicTheme` and `neutralTheme` with tokens, item
> colors, typed content slots and class callbacks. The API may still change before `0.2.0`; read [Known limitations](#limitations) before integrating.

Contents: [Install](#install) · [Quick start](#quick-start) · [Styles and the Next.js boundary](#styles) ·
[Data model](#data-model) · [Navigation and visible range](#navigation) · [Day agenda](#day-agenda) ·
[Responsive layout](#responsive) · [Sizing](#sizing) ·
[Data states](#data-states) · [Today and SSR](#today-ssr) · [Localization](#localization) · [Theming](#theming) ·
[Validation and diagnostics](#validation) · [Keyboard](#keyboard) · [Accessibility](#accessibility) · [Exports](#exports) ·
[Known limitations](#limitations) · [Migrating from 0.1](#migration) · [Releases and provenance](#releases) ·
[License and privacy](#license)

<a id="install"></a>
## Install

Requirements: React and ReactDOM `^18.2.0 || ^19.0.0` (one matching pair) and Node.js 22 or newer for SSR and builds.
`0.1.1` accepted any React from 18 and Node.js 18. The date and accessibility libraries are ordinary dependencies:
nothing else needs to be installed, and Day.js is not used.

`0.2.0-alpha.2` is published on npm under the `next` dist-tag, while `latest` remains `0.1.1`: a plain
`npm install @nelmad/calendar` still installs 0.1. Install the prerelease by its exact version and pin it:

```sh
npm install @nelmad/calendar@0.2.0-alpha.2 --save-exact
```

Without `--save-exact` npm saves the caret range `^0.2.0-alpha.2`, which also accepts later `0.2.0` prereleases; the
API may still change between prereleases until `0.2.0`, so update a pinned prerelease deliberately, with the
[changelog](CHANGELOG.md).

To test an unreleased commit of this repository instead, build and pack it and install the archive:

```sh
# In a checkout of this repository
npm ci
npm run build
npm pack
# In your application
npm install /path/to/nelmad-calendar-0.2.0-alpha.2.tgz
```

The [Vite](examples/vite/README.md) and [Next.js](examples/next/README.md) examples in this repository are runnable apps
that install such an archive of the checkout. Their
`/workspace` route shows the alpha.2 integrations together: responsive layouts, the mobile agenda, item actions, a source
filter that your backend accepts later, `neutralTheme` with tokens, slots and class callbacks, and a calendar inside a
ShadowRoot with its portals.

<a id="quick-start"></a>
## Quick start

<!-- file: examples/vite/src/Schedule.tsx -->
```tsx
'use client';
import {useState} from 'react';
import {Calendar, type CalendarItem} from '@nelmad/calendar';
import '@nelmad/calendar/styles.css';

const items: CalendarItem<{room: string}>[] = [
    {id: 'standup', title: 'Стендап', data: {room: '301'},
        interval: {kind: 'timed', start: '2026-09-03T10:00:00+03:00', end: '2026-09-03T10:15:00+03:00'}},
    // All-day `end` is exclusive: this item covers 10 and 11 September.
    {id: 'offsite', title: 'Выездная сессия', data: {room: 'Парк'},
        interval: {kind: 'allDay', start: '2026-09-10', end: '2026-09-12'}},
];

export function Schedule() {
    const [anchorDate, setAnchorDate] = useState('2026-09-01');
    const [opened, setOpened] = useState('');
    return <>
        <Calendar items={items} timeZone="Europe/Moscow" locale="ru-RU"
            anchorDate={anchorDate} onNavigate={setAnchorDate}
            onItemPress={({item}) => setOpened(`${item.title}: ${item.data.room}`)}/>
        <p id="opened" aria-live="polite">{opened}</p>
    </>;
}
```

This is the `/quick-start` route of both examples, byte for byte. `items`, `timeZone`, `anchorDate` and `onNavigate` are
required. `layout` keeps its default `"auto"`: the calendar follows its own width, a seven-column grid on a wide page and a
compact month with the agenda below it on a phone (see [Responsive layout](#responsive)); `layout="desktop"` or
`"mobile"` fixes it. The application owns the records and the displayed month: `onNavigate` only requests a month, and
the calendar shows it once the new `anchorDate` arrives. Pressing an item reports it with its typed `data`; a click on a
date opens the full list of that day.

More: the complete integration in [`ReleaseCalendar.tsx`](examples/vite/src/ReleaseCalendar.tsx) (server prefetch,
loading, retry, controlled agenda) and the Storybook stories in [`stories/`](stories) (`npm run build && npm run storybook`).

<a id="styles"></a>
## Styles and the Next.js boundary

Import the one public stylesheet, `@nelmad/calendar/styles.css`. The calendar's own code does not inject CSS from
JavaScript, loads no fonts and inherits the font of your application. Styles are scoped to the calendar root (`.nc-theme`) and do not touch
global elements. Its `box-sizing` reset has class specificity, so element resets of your page such as `button { all: unset }`
or `* { box-sizing: content-box }` do not change the calendar's layout, and overlay widths follow the calendar font size
(`em`), not the root font size. The month title, agenda headings and the empty-agenda line set their own color, weight and
margins with class specificity too, so page element rules such as `h2 { color: …; font-weight: 500 }` (the Vite React
template) or a preflight reset (`h1, h2, h3 { font-weight: inherit }`, `* { margin: 0 }`) do not restyle them, also with
a forced `colorScheme` that differs from your page. A rule with a class, such as `.prose h2`, is your own styling and
still applies.

A stylesheet imported into the document does not reach inside a `ShadowRoot`. Add the same stylesheet to every CSS tree
scope that contains a calendar root or one of its portals. By default the day agenda popover and sheet are portaled into
the document `body`; inside a modal window they go into the open modal container around the calendar (a `<dialog>` shown
with `showModal()`, or an element with `aria-modal="true"`) so that they keep working there. A plain `role="dialog"` side
panel without `aria-modal="true"` is not a modal container: the agenda goes to `body`. [`portalContainer`](docs/api.md#prop-portalcontainer) chooses another node.

**Modal and popover libraries.** Several libraries render their dialog with `role="dialog"` but without `aria-modal`
(for example Radix Dialog and the React Aria Components `Modal` and `Popover`), and trap focus or close on outside focus.
With the default target the agenda then opens in `body` and is closed at once, or the host popover closes itself and
unmounts the calendar. Pass the dialog's content element as `portalContainer`:

```tsx
const [panel, setPanel] = useState<HTMLElement | null>(null);
<Dialog ref={setPanel}>{panel && <Calendar {...props} portalContainer={panel}/>}</Dialog>
```

Development builds warn once when the calendar is inside such an element and the default goes to `body`:
`[@nelmad/calendar] portalContainer: The calendar is inside a role="dialog" element without aria-modal="true", …`. Pass
`portalContainer={document.body}` to keep the default for a non-trapping side panel; an explicit container is never
reported.

A calendar inside a `ShadowRoot` therefore needs the stylesheet both in that shadow root and in the document. With
Vite, for example:

```ts
// Vite: `?inline` returns the stylesheet text instead of adding it to the document.
import calendarCss from '@nelmad/calendar/styles.css?inline';

const sheet = new CSSStyleSheet();
sheet.replaceSync(calendarCss);
shadowRoot.adoptedStyleSheets = [...shadowRoot.adoptedStyleSheets, sheet];
```

**Content Security Policy.** One dependency adds a style element: React Aria inserts
`<style id="react-aria-pressable-style">` into the document `<head>` when the first button mounts, with one rule in an
anonymous `@layer` (`touch-action: pan-x pan-y pinch-zoom` for pressable elements). Under a `style-src` without
`'unsafe-inline'` the browser blocks it and reports a violation; the calendar keeps working without that rule. To allow it,
give it a nonce: React Aria reads it from `<meta property="csp-nonce" nonce="…">` in the document (or webpack's
`__webpack_nonce__`). Server-rendered HTML also contains inline `style` attributes (the grid always has one, the root has
one with `tokens` or `style`, and the rows of an inline agenda have one with item colors). A policy without
`'unsafe-inline'` or `style-src-attr` blocks them; on hydration the calendar writes its own validated declarations again
through CSSOM, which CSP does not restrict: the `tokens` of the root (except a variable that `style` replaces), the row
count of the grid and the item colors of the agenda rows, so the hydrated month keeps its rows, tokens and colors. It
writes them property by property, as a client render does, never as the blocked attribute text. The `style` you pass to
the root is not written again: like any inline style of your page it stays subject to your policy, so under a strict
policy put such styles into your stylesheet through `className`. This is not a CSP bypass, and no stylesheet is
injected. Until hydration (and without JavaScript) the server HTML renders without these
declarations, and the browser reports a violation for each blocked attribute. To avoid both, allow attributes with `style-src-attr 'unsafe-inline'`, for
example `style-src 'self' 'nonce-…'; style-src-attr 'unsafe-inline'`. Styles that the calendar sets from JavaScript are
not affected.

**TypeScript.** `import '@nelmad/calendar/styles.css'` is a side-effect import of a stylesheet. Vite and Next.js declare
CSS modules for you. A plain `tsc` project with `noUncheckedSideEffectImports` (on by default in TypeScript 6) needs
its own declaration, for example a `css.d.ts` with `declare module '*.css';`.

**Next.js App Router.** Importing `@nelmad/calendar` is safe on the server. `getCalendarVisibleRange` is a pure function
and runs in Server Components. `Calendar` carries its own `'use client'` boundary, but its callback props are functions,
so render it from your own client component and pass it plain serializable data:

<!-- file: examples/next/app/page.tsx -->
```tsx
import {getCalendarVisibleRange} from '@nelmad/calendar';
import {ReleaseCalendar} from '../components/ReleaseCalendar';
import {loadRange, release} from '../components/releaseData';

// A Server Component: the pure helper gives the exact first grid range, so the records
// are loaded before the client bundle runs and arrive in the first HTML.
export default async function Page() {
    const range = getCalendarVisibleRange({anchorDate: release.anchorDate, timeZone: release.timeZone, locale: release.locale});
    return <ReleaseCalendar prefetch={{range, items: await loadRange(range)}}/>;
}
```

The stylesheet can be imported in that client component or once in `app/layout.tsx`. Import `classicTheme` in the client
component as well: the calendar recognizes theme presets by identity, and a preset passed as a prop from a Server Component
arrives as a serialized copy, which renders the "invalid configuration" shell.

<a id="data-model"></a>
## Data model

```ts
const items: CalendarItem<{ticket: number}>[] = [
    // All-day: dates only, `end` is exclusive. This item covers 3 and 4 September.
    {id: 'review', title: 'Release review', data: {ticket: 42}, interval: {kind: 'allDay', start: '2026-09-03', end: '2026-09-05'}},
    // Timed: RFC 3339 instants with an explicit offset or Z.
    {id: 'call', title: 'Call', data: {ticket: 43}, interval: {kind: 'timed', start: '2026-09-03T10:00:00+03:00', end: '2026-09-03T10:30:00+03:00'}},
    // A moment: no end. It is shown only on the date of its start.
    {id: 'deploy', title: 'Deploy', data: {ticket: 44}, interval: {kind: 'timed', start: '2026-09-04T07:00:00Z'}},
    // The author zone travels with the item; display always uses the Calendar timeZone.
    {id: 'sync', title: 'Berlin sync', data: {ticket: 45},
        interval: {kind: 'timed', start: '2026-09-07T09:00:00+02:00', end: '2026-09-07T09:15:00+02:00', timeZone: 'Europe/Berlin'}},
];
```

- **`CalendarItem<TItemData>`** has `id`, `title`, `interval` and `data`. `id` is nonempty and unique within `items`.
  Domain fields (status, assignee, task IDs) live in the generic `data`; the calendar never reads or copies it and
  returns the same item object in callbacks. An empty `title` is shown as the localized "Untitled".
- **All-day** intervals are dates (`YYYY-MM-DD`, years `0001`–`9999`), never instants: changing `timeZone` does not shift
  them. `end` is **exclusive** and must be after `start`: a one-day item is `{start: '2026-09-03', end: '2026-09-04'}`.
- **Timed** intervals use strict RFC 3339: `YYYY-MM-DDTHH:mm:ss`, optional 1–3 fraction digits and a mandatory `Z` or
  `±HH:MM`. Offset-less timestamps are rejected, never read in the host zone. A day shows a timed item when any instant of
  `[start, end)` falls on that date in the Calendar `timeZone`; an end exactly at midnight does not add the next day.
- **Moments.** Without `end`, or with `end` equal to `start`, a timed item is a moment on the date of its start.
- **Author zone.** The optional `interval.timeZone` records the zone the item was written in. In alpha.2 it is validated
  and kept; display and day membership use the Calendar `timeZone`.
- **`timeZone`** is an explicit IANA identifier from the package's accepted list: 445 primary identifiers of tzdb 2026c,
  `UTC` included, matched exactly and case-sensitively. Aliases such as `Etc/UTC`, `GMT`, `US/Eastern`, wrong case and fixed
  offsets like `+03:00` are rejected. The list is in the [API reference](docs/api.md#time-zones).
- **The browser's zone is not always accepted.** `Intl.DateTimeFormat().resolvedOptions().timeZone` returns legacy names
  for 19 zones, for example `Asia/Calcutta`, `Europe/Kiev`, `Asia/Saigon`, `Asia/Katmandu` and `America/Godthab`
  (Chrome 154, Node.js 24). Passing such a name renders the "invalid configuration" shell. Map these names to the
  accepted ones before passing a detected zone; the [API reference](docs/api.md#browser-zones) has the full table.
- Values are never repaired: the calendar does not add zones, turn inclusive ends into exclusive ones or round fractions.
  An invalid or duplicate record is excluded (see [Validation](#validation)).

Recurrence is not interpreted: pass already expanded occurrences as separate items.

<a id="navigation"></a>
## Controlled navigation and the visible range

`anchorDate` selects the displayed month; its day number is ignored. `onNavigate(anchorDate)` requests the first day of
another month from the toolbar, the keyboard or the Today button. Nothing changes until you pass the new `anchorDate`:
there is no internal optimistic month, and a delayed or ignored request leaves the current month and focus in place.

The grid starts on `firstDayOfWeek` on or before the first day of the month and ends after the last full week, 4 to 6
weeks including days of neighboring months. `getCalendarVisibleRange({anchorDate, timeZone, locale, firstDayOfWeek})`
returns exactly the range the calendar will render, as `{start, end, timeZone}` with an exclusive `end`. It is pure (no
clock, DOM or host locale) and throws `RangeError` on invalid input, so a server can prefetch the first range:

```ts
getCalendarVisibleRange({anchorDate: '2026-09-15', timeZone: 'Europe/Moscow'});
// {start: '2026-08-31', end: '2026-10-05', timeZone: 'Europe/Moscow'}: ru-RU weeks start on Monday
getCalendarVisibleRange({anchorDate: '2026-09-15', timeZone: 'Europe/Moscow', locale: 'en-US'});
// {start: '2026-08-30', end: '2026-10-04', timeZone: 'Europe/Moscow'}: en-US weeks start on Sunday
```

`onVisibleRangeChange(range)` is a notification after commit: once after the first client render and then whenever the
accepted `(start, end, timeZone)` changes, including a change of `firstDayOfWeek` or `locale` that moves the grid. It never
runs during SSR or render, is not repeated for an unchanged range, a new callback identity or a StrictMode effect replay,
and `A → B → A` reports all three. Its first call repeats the range you prefetched; answer it from your cache. Records
outside the grid are allowed in `items` and are simply not drawn.

```tsx
const [anchorDate, setAnchorDate] = useState<ISODate>('2026-09-01');
const [items, setItems] = useState<CalendarItem<Ticket>[]>([]);
const [dataState, setDataState] = useState<CalendarDataState>({status: 'loading', phase: 'initial'});
const [range, setRange] = useState<CalendarVisibleRange>();

function load(next: CalendarVisibleRange) {
    setRange(next);
    setDataState({status: 'loading', phase: items.length ? 'refresh' : 'initial'});
    fetchTickets(next).then(result => { setItems(result); setDataState({status: 'ready'}); },
        error => setDataState({status: 'error', phase: items.length ? 'refresh' : 'initial', error}));
}

<Calendar items={items} timeZone="Europe/Moscow" layout="desktop"
    anchorDate={anchorDate} onNavigate={setAnchorDate} onVisibleRangeChange={load}
    dataState={dataState} onRetryRequest={() => range && load(range)}/>;
```

A real application also aborts superseded requests and caches ranges, as
[`ReleaseCalendar.tsx`](examples/vite/src/ReleaseCalendar.tsx) does.

**Focus.** Inside the rendered grid, arrow keys move focus at once, also onto days of the neighboring months. Leaving the
grid with the keyboard, `PageUp`/`PageDown` and Today request the target month; focus moves to the target date only if,
when the month arrives, focus is still in the grid (or still on the Today button that asked) and nothing else happened in
between. The calendar never takes focus from another control. After an accepted Previous/Next from the toolbar the month
is announced once. An external `anchorDate` change keeps the same day number (clamped to the month length). Months before
February 0001 and after November 9999 are unavailable: the buttons are disabled and explain why.

<a id="day-agenda"></a>
## Day agenda

Activating a date (click, `Enter`, or a click on the `+N` area of a cell) opens the day agenda with a heading, the item
count and the full list of that day. A multi-day item appears once. On desktop it is a non-modal popover anchored to the
cell: `Escape`, the close button and a press outside close it; `Tab` past the last control closes it and continues with the
next element after the date cell. Focus returns to the date cell when it was still inside the popover. On mobile the same
agenda is shown below the grid or in a sheet; see [Responsive layout](#responsive).

**Uncontrolled.** Without `agendaDate`, the calendar keeps the viewed date itself: today when it is known and in the
displayed month, otherwise the first day of the month. It survives item updates and navigation within the month; after a
month change it falls back again unless the date belongs to the new month.

**Controlled.** Pass `agendaDate` and `onAgendaDateChange` together (the types and the runtime reject one without the
other). Activating another date calls `onAgendaDateChange(date)` once; the agenda opens for that date only when your
`agendaDate` becomes equal to it and focus is still on the date cell that asked. It opens in the presentation that is
current at that moment, even if the layout changed meanwhile. Activating the already accepted date opens
it at once without a callback. A controlled date may lie outside the displayed month, and changing it never navigates:
loading that month is up to you.

**`onItemPress`.** In the grid, a pointer press on a chip or bar reports `{item, date, view: 'month', segmentRange}`, where
`date` is the cell under the pointer and `segmentRange` is the clipped part of the item drawn in that week. In the agenda,
each item is a button that reports `{item, date, view: 'agenda'}` with the agenda date. Without `onItemPress`, a press on a
chip opens the agenda of the date under it, and agenda rows are plain list items. Keyboard and screen-reader users reach
every item through the agenda.

**Item actions.** With `getItemActions` and `onItemActionRequest`, every agenda row with actions gets a separate `…` button
next to it, named after the item. It opens the same actions as a menu on desktop and as a modal action sheet on mobile;
`onItemActionRequest({item, actionId})` reports the chosen one once. The grid itself never shows action buttons. Editing
and deleting stay your own operations ([API reference](docs/api.md#prop-getitemactions)).

**Sources.** `sources` lists the calendars that items reference by `calendarId`. With the controlled pair
`visibleSourceIds` and `onVisibleSourceIdsChange`, a toolbar button (from two valid sources; hide it with
`showSourceSelector={false}`) toggles them as a menu on desktop or a sheet on mobile. The calendar shows only what your
props accept: a toggle calls the callback and changes nothing until the new array arrives. Items without `calendarId` or
with an unknown one always stay visible ([API reference](docs/api.md#prop-sources)). However the selector closes
(`Escape`, its close button or its trigger, a press outside, a layout switch, a new portal target), focus that was in it
returns to its toolbar button; focus that already moved elsewhere stays there.

<a id="responsive"></a>
## Responsive layout

`layout` defaults to `"auto"`: the calendar measures the content-box width of its own root, not the browser window, so a
calendar in a narrow side panel is mobile on a wide screen. A width below `mobileBreakpoint` (default `640` CSS px) is
mobile, the breakpoint and wider is desktop. The content box is inside the root's own padding (`spacing.md`, 16 px on
each side by default), so with the defaults the root itself switches at 672 px. `layout="desktop"` or `"mobile"` fixes
the layout and never measures. A desktop grid keeps columns of at least 64 px: in a container narrower than 448 px it
scrolls horizontally inside its own region, never the page. A forced desktop gets there in any narrow container; `"auto"`
only with a `mobileBreakpoint` below 448, since the default switches to mobile first. Prefer `"auto"` where phones are
expected.

```tsx
<Calendar {...props} mobileBreakpoint={720} agendaPresentation="overlay"/>
```

- **Desktop:** the seven-column grid with chips, bars and `+N`; the agenda is a popover.
- **Mobile:** a compact grid with dates and a dot on days that have items. A tap or `Enter` on a date changes the viewed
  date; there is no `+N`. With `agendaPresentation="auto"` (default) the agenda of the viewed date is a region below the
  grid: a tap keeps focus on the date and announces the update, `Enter` moves focus to the agenda heading, `Escape` returns
  to the date. With `agendaPresentation="overlay"` the agenda opens as a modal sheet: the rest of the page is inert and
  does not scroll, focus starts on the heading, and `Escape`, the close button or a press on the backdrop return to the
  date. A dialog of your own opened from `onItemPress` above the sheet stays usable; see
  [`onItemPress`](docs/api.md#prop-onitempress).

The server and the first client render of `"auto"` are always the compact mobile month, so hydration matches whatever the
width is: with `agendaPresentation="auto"` it includes the inline agenda, with `"overlay"` it has no agenda until a date
is activated. The measured layout is applied right after hydration, before the browser paints. When the layout changes while the agenda is
shown, the viewed date is kept. Focus that was inside the agenda moves to the same item or control in the new
presentation; focus anywhere else is never taken, and a resize alone never opens a popover or sheet. A width that depends
on the layout itself, such as a page scrollbar that only the taller desktop month needs, switches the layout once per
crossing and then keeps it while the width stays within that scrollbar's band; the rule is in the
[API reference](docs/api.md#prop-layout). To avoid that band, reserve the scrollbar space on the scrolling ancestor, for
example `html { scrollbar-gutter: stable; }`.

<a id="sizing"></a>
## Sizing

No fixed-height parent is needed. The root is `inline-size: 100%` with intrinsic `block-size: auto`, and every week row has
a preferred height from `density` and the `dayMinHeight` token, so the number of weeks sets the natural height. Rows do not
grow with the number of items: items that do not fit are counted in a `+N` indicator and remain in the agenda.

A definite height on the root itself (`style`, `className` or your CSS) is shared equally between the week rows; the
calendar measures each row and shows only whole lanes, never a clipped chip. A height on the parent alone is not a
constraint. When the height is too small even for one line of `+N`, the grid scrolls inside its own region and the toolbar
stays visible. Before the first measurement (and on the server) every non-empty day shows `+N` with zero lanes.
A `+N` count too wide for a narrow column ends in an ellipsis, and short weekday names that do not fit their column (long
names at 320 px, large text) switch the header row to the narrow format; the full names stay the accessible names.

```tsx
<Calendar {...props} style={{blockSize: 480}}/>
```

<a id="data-states"></a>
## Data states

`dataState` (default `{status: 'ready'}`) tells the calendar what your data is doing; it never fetches.

| `dataState` | What is shown |
| --- | --- |
| `{status: 'ready'}` | The grid. When no valid item intersects the visible range, a named "No events in this month" region appears next to the grid; navigation stays available. |
| `{status: 'loading', phase: 'initial'}` | A skeleton replaces grid and agenda, whatever `items` contains, and keeps their height. Navigation is disabled. |
| `{status: 'loading', phase: 'refresh'}` | The current items stay in place; the grid and the inline agenda (not the root with its live regions, and not an agenda open in a popover or sheet) get `aria-busy="true"`, and a thin progress bar runs along the top border of the grid. It takes no space and covers no date, weekday name or control. |
| `{status: 'error', phase: 'initial', error}` | A blocking error region replaces grid and agenda and keeps their height. Navigation is disabled. |
| `{status: 'error', phase: 'refresh', error}` | The current items stay in place; a non-blocking error banner (with Retry) appears between the toolbar and the grid and moves the grid down once while it is shown. |

With `onRetryRequest` the error region shows a Retry button that calls it once per press; the state changes only when you
pass a new `dataState`. A blocking state closes the agenda and the source selector (its trigger is disabled like the
navigation) and cancels pending focus moves; if focus was inside the removed view or the selector it moves to the state
region. Loading, refresh completion and errors are announced through the calendar's own live
regions. The month opened with Previous/Next is announced once, when you accept it. The start of a refresh is not
announced (the progress bar and `aria-busy` show it), so a refresh that you start for the new month never replaces that
announcement; its completion is announced once ("Calendar refreshed"). A data state never moves the toolbar buttons, so a
second press on Next while the new month loads still lands on Next. An agenda popover that is open when the error banner
appears moves with its date.

<a id="today-ssr"></a>
## Today and SSR

`today` is an optional `ISODate` snapshot of the current date in the Calendar `timeZone`. With it, the server and the
client render the same today highlight, Today button and default agenda date, and the calendar never reads the clock; you
update it, for example at midnight.

Without `today`, the server and the first client render agree on "today unknown": no highlight and a disabled Today button.
After hydration the calendar computes the date in `timeZone`, enables the button and keeps it up to date across midnight
(and when the tab becomes visible again). This is one extra update after hydration.

For identical HTML on both sides also pass the same `items`, `anchorDate`, `locale`, `firstDayOfWeek`, `dir` and
`timeZone`. A forced `layout` is fixed already on the server; the default `"auto"` renders the compact mobile month on the
server and in the first client render, with the inline agenda only for `agendaPresentation="auto"` (see
[Responsive layout](#responsive)). The server and the browser must have matching Intl and time
zone data for the locales you use; see [Known limitations](#limitations).

<a id="localization"></a>
## Localization

```tsx
<Calendar {...props} locale="en-GB" messagesLocale="en-US" firstDayOfWeek="sunday" hourCycle={12} dir="ltr"
    messages={{todayLabel: 'Now', agendaHeading: date => `Agenda for ${date}`}}/>
```

- **`locale`** (default `ru-RU`) is a BCP 47 tag for dates, the first day of the week, the hour cycle and the direction.
  Dates always use the Gregorian calendar through `Intl` with explicit options; `u-ca-*` extensions cannot change it.
  A well-formed tag that `Intl` does not support resolves to `en-US` with one development warning, never to the host
  default. A malformed tag, such as `en_US`, is a contract error.
- **`messagesLocale`** (default: the resolved `locale`) selects the built-in catalog: `ru-*` uses Russian, every other valid
  tag uses English. **`messages`** overrides any subset of the catalog, written in the `messagesLocale` language. An empty
  override falls back to the catalog with a development warning. Function messages receive plain values (dates as
  `ISODate`) and return a string.
- **`firstDayOfWeek`**, **`hourCycle`** (`12` or `24`) and **`dir`** override the values derived from the locale; without
  locale data the fallbacks are Monday, 24 hours and `ltr`. In 24-hour mode midnight is `00:00`.
- Right-to-left locales mirror the grid, arrow keys and icons; Previous and Next keep their chronological meaning. Item
  titles are isolated from the surrounding text direction.

Every message and date fragment carries the `lang` of its actual language.

<a id="theming"></a>
## Theming

```tsx
<Calendar {...props} theme={classicTheme} density="comfortable" colorScheme="dark"
    tokens={{color: {accent: '#0b57d0'}, density: {dayMinHeight: '120px'}}}
    style={{'--nelmad-calendar-color-focus': '#e8710a'}}/>
```

- **`theme`**: `classicTheme` (default) or `neutralTheme`, a restrained gray-blue preset. Both work with either density
  and every `colorScheme`; a theme changes appearance, never roles, focus or keyboard behavior.
- **`density`**: `compact` (default) or `comfortable`.
- **`colorScheme`**: `system` (default, follows `prefers-color-scheme` through CSS, so server and client HTML agree), `light`
  or `dark`. Forced colors mode always wins over theme colors; reduced motion disables optional transitions.
- **`tokens`** sets any of the 27 semantic tokens; each maps to one public CSS variable such as
  `--nelmad-calendar-color-accent`. The full map is in the [API reference](docs/api.md#tokens).

For each variable the precedence is: theme and density defaults → your CSS on the calendar root (for example through
`className`) → `tokens` → the same variable in `style`. Declare variables on the root element, not on an ancestor: the
defaults are defined on the root itself. Values are passed to CSS as they are; an invalid CSS value is a styling error
of the application, not a calendar error. A `tokens` value must be a single CSS declaration value without a `url(`: one with
a top-level `;` or `!`, an unclosed string, comment or bracket, or any `url(` (also a well-formed one and one spelled with
escapes, such as `u\72l(`) is ignored with a development warning, so a theme taken from user or tenant settings cannot
add other declarations to the root or contain a `url(`. This security rule is decided the same way on the server and
the client and is not CSS validation. It does not reject other functions that take a resource as a string, such as
`image-set("…" 1x)` or `src("…")`: the package's own styles use the token variables only in color, shadow and font
properties and never load them, but your CSS or slot content that uses a token variable in an image property (for
example `background: var(--nelmad-calendar-components-item-background)`) would. Validate tenant values yourself if you
use the variables that way. Chips, bars and agenda rows use the item tokens;
buttons derive their colors from `color.surface` and `color.text`. `className` and `style` are applied to the root element and `id` sets its `id`.

Per item, `CalendarSource.color` colors only the accent marker of a known source, and `getItemAppearance` can replace the
accent, background and text of one item independently; every segment and the agenda row of an item share its colors.
These colors follow the same single-declaration rule as `tokens`: a value with a top-level `;` or `!`, unbalanced quotes,
brackets or comments, or any `url(` (also spelled with escapes) is ignored with a development warning, identically on the
server and the client, and the lower layer stays (the source accent, then the theme token). With `renderAgendaItem` the
accessible name of an agenda row is the default summary followed by your visible content.
`classNames` adds classes to package surfaces from their typed state, and the content slots `renderItem`,
`renderAgendaItem`, `renderDayHeader`, `renderToolbarContent`, `renderLoading`, `renderEmpty` and `renderError` replace or
extend visible content while the calendar keeps its roles, names and focus. Item and day slots take passive content only
(no links, buttons or inputs: use `onItemPress` and `getItemActions`); development builds warn about interactive
content they find. Stable `data-*` attributes are listed in the [API reference](docs/api.md#data-attributes).

```css
.release-calendar {
    --nelmad-calendar-color-surface: #fbfaf8;
    --nelmad-calendar-radii-md: 8px;
}
```

<a id="validation"></a>
## Validation and diagnostics

TypeScript types do not prove that strings are valid, so the calendar validates its input before any date math.

- **Contract errors.** An invalid configuration prop renders a safe error shell instead of the grid: an invalid
  `anchorDate`, `timeZone`, `today` or `agendaDate`, an unknown enum value, a malformed `locale`/`messagesLocale`, an
  invalid `dataState`, a missing callback, half of the `agendaDate` pair, a `theme` that is not a package preset, an
  unknown `layout` or `agendaPresentation`, or a `mobileBreakpoint` that is not a positive finite number. The shell keeps the named calendar region and shows "Calendar cannot be displayed:
  invalid configuration"; no toolbar, grid, agenda or retry is rendered and no callback runs until the props are fixed.
- **Excluded records.** An item with an invalid interval, an invalid `id`, a duplicate `id` (all copies) or an unknown
  `interval.timeZone` is left out of the grid, counts and agenda; the other items render normally.
- **Recoverable values.** An empty item title, an empty message override, an empty token value or one that is not a
  single CSS declaration value, and a comparator result that is not finite use their documented fallback.
- **Development warnings.** Each problem is reported once per calendar instance as
  `[@nelmad/calendar] <path>: <reason>` after the client render, for example
  `[@nelmad/calendar] items[3].interval: Expected YYYY-MM-DD in 0001…9999`. An item whose `calendarId` names no source in
  `sources` is reported once per unknown ID, at its first item:
  `[@nelmad/calendar] items[3].calendarId: No source with ID "archive"; items with this calendarId remain visible with fallback appearance`
  (without a `sources` prop one warning, `items[].calendarId`, covers them all). Props outside this prerelease are
  removed before validation, and they are reported differently: once per prop name for the whole page (not per instance),
  already during the render, a server render included. A prop that a later prerelease adds gives
  `[@nelmad/calendar] <prop>: not available in 0.2.0-alpha.2; ignored`; a 0.1 prop gives
  `[@nelmad/calendar] <prop>: removed in 0.2; see the migration guide (docs/migration-0.1-to-0.2.md); ignored`; any other
  name gives `[@nelmad/calendar] <prop>: not a Calendar prop; ignored`. React's own `key`, `ref` and `children` are
  never reported. A missing required prop is reported as `Required`, for example
  `[@nelmad/calendar] timeZone: Required; expected an IANA time zone such as Europe/Moscow`.
- **Production** builds (`NODE_ENV=production`) accept and reject exactly the same values and print nothing.

<a id="keyboard"></a>
## Keyboard

The Month grid is one Tab stop with a roving focus on date cells; chips, bars and `+N` are not focusable.

| Key | Action |
| --- | --- |
| `Tab` / `Shift+Tab` | Move between the toolbar, the grid and the agenda; inside the agenda, move between its controls and leave it past the last one |
| `ArrowLeft` / `ArrowRight` | Previous / next day in visual order (mirrored in RTL) |
| `ArrowUp` / `ArrowDown` | Same weekday in the previous / next week |
| `Home` / `End` | First / last day of the week |
| `PageUp` / `PageDown` | Request the previous / next month, keeping the day number (clamped) |
| `Shift+PageUp` / `Shift+PageDown` | Request the same month of the previous / next year |
| `Enter` | Open the day agenda of the focused date and move focus into it |
| `Escape` | Close the agenda and return focus to its date cell |
| `Enter` / `Space` on a button | Activate toolbar buttons, the close button and agenda items |

A date cell's accessible name is the full date; its description lists the item count, today, the viewed day and how many
items are hidden behind `+N`.

<a id="accessibility"></a>
## Accessibility

The target for `0.2.0` is WCAG 2.2 AA for the package-owned UI. This alpha does **not** claim conformance.

Implemented: a named `region` root with its own polite and urgent live regions; a `grid` named by the visible month heading
with instructions, `aria-rowcount`/`aria-colindex`, named column headers, `aria-current="date"` for today and one roving
Tab stop; the agenda with a heading and a semantic list as a named non-modal `dialog`, a named inline `region` or a named
modal `dialog`; disabled navigation at the supported
date bounds with an explanation; visible focus, forced colors and reduced motion styles; localized names in Russian and
English.

Verified so far: unit tests of the ARIA structure, focus recovery and live-region writes; real-Chrome checks of keyboard
navigation, focus order, RTL, the popover, sheets, menus and Shadow DOM; and the packed tarball in a Vite (React 18) and a
Next.js (React 19) application with SSR, hydration, keyboard, touch-emulation and agenda checks. The alpha.2 acceptance ran
axe-core (WCAG 2.0–2.2 A/AA rules) without violations in the package-owned UI for both themes, both densities, light and
dark color schemes, RTL, all data states, open overlays, a 1280 px desktop and a 390 px phone viewport. One reviewed
exclusion applies: the experimental `label-content-name-mismatch` rule is not counted for a date cell whose only other
visible text is its decorative `+N` indicator (the day number is in the cell's name, the count in its description); every
other node it reports still fails the run ([acceptance check](scripts/implementation/alpha-acceptance.mjs)).

Not verified yet: screen readers (NVDA, VoiceOver, TalkBack), physical phones and tablets, browsers other than Chrome, and
a manual contrast, zoom, reflow and text-spacing audit; automated rules cover only part of WCAG. Colors from `tokens`, your CSS and item titles or
message overrides are your responsibility.

<a id="exports"></a>
## Exports

Root values: `Calendar`, `getCalendarVisibleRange`, `classicTheme`, `neutralTheme`. One stylesheet: `@nelmad/calendar/styles.css`. No other
subpath is public.

Types: `CalendarProps`, `CalendarBaseProps`, `CalendarAgendaControlProps`, `CalendarSourceFilterControlProps`,
`CalendarItemActionsProps`, `CalendarSource`, `CalendarItemAction`, `CalendarItemActionRequest`, `CalendarItem`, `CalendarInterval`, `ISODate`,
`RFC3339DateTime`, `IanaTimeZone`, `CalendarDateRange`, `CalendarVisibleRange`, `CalendarVisibleRangeOptions`,
`CalendarWeekday`, `CalendarItemPressRequest`, `CalendarSortContext`, `CalendarDataState`, `CalendarLayout`,
`CalendarAgendaPresentation`, `CalendarDensity`, `CalendarColorScheme`, `CalendarDirection`, `CalendarHourCycle`,
`CalendarTheme`, `CalendarThemeTokens`, `CalendarCSSVariable`, `CalendarMessages`,
`CalendarItemAppearance`, `CalendarItemAppearanceContext`, `CalendarRootState`, `CalendarResolvedLayout`,
`CalendarResolvedAgendaPresentation`, `CalendarDayState`, `CalendarItemView`, `CalendarItemSlotContext`, `CalendarMonthItemSlotContext`,
`CalendarAgendaItemSlotContext`, `CalendarAgendaState`, `CalendarOverflowState`, `CalendarToolbarSlotContext`,
`CalendarLoadingSlotContext`, `CalendarEmptySlotContext`, `CalendarErrorSlotContext`, `CalendarClassName`, `CalendarClassNames`,
`CalendarDataAttribute`.

The package ships ESM and CJS with bundled declarations for TypeScript `moduleResolution` `bundler` and `NodeNext`
(checked with TypeScript 5.4.5 and 5.9.3). Every prop and type is described in the [API reference](docs/api.md); the
[generated report](docs/api/calendar.api.md) is the exact declaration surface: besides the exports it lists only the
non-exported helpers they are typed with (the theme brand symbol, the accepted layouts and the names of the later props
typed as unavailable).

<a id="limitations"></a>
## Known limitations

- **Prerelease on the `next` dist-tag.** `0.2.0-alpha.2` is an alpha: later prereleases may still change the API before
  `0.2.0`. `latest` remains `0.1.1`, so install the exact version and pin it ([Install](#install)).
- **Only the current slice is available.** Every prop of the planned `0.2` API that is not described above is typed as
  unavailable (`?: never`) and, if passed anyway, removed at runtime with a development warning; it is never a silent
  no-op.
  - `0.2.0-beta.1`: `selection` with `onSelectionChange` and `onCreateRequest`, moving items (`itemMoveStates`,
    `onItemMoveRequest`, `onItemMoveDraftChange`) and `interactionPolicy`.
- **Unknown sources.** An item whose `calendarId` matches no source stays visible with the base accent and produces one
  development warning.
- **Custom content checks are best-effort.** Development diagnostics see only the DOM inside the package wrappers after
  a commit; content in portals, shadow trees or added later is not checked, and your own content needs its own
  accessibility testing.
- **Mobile scope.** Long-press dragging is not available yet; physical phones and tablets have not been tested. On a very short desktop-width viewport, such as a
  phone in landscape, the popover is only as tall as the space next to the date (it scrolls); `layout` follows width only.
- **Strict CSP with SSR.** Without `style-src-attr 'unsafe-inline'` the server-rendered inline styles apply only after
  hydration (each blocked attribute is reported as a violation), the root `style` you pass stays blocked, and React Aria's
  single `<style>` needs a nonce; see [Styles](#styles).
- **SSR locale data.** The calendar uses the runtime's own `Intl` data, and Node's full ICU covers far more languages than
  Chrome. A locale the browser lacks resolves to `en-US` there (with a development warning in the browser only) while the
  server renders native text, so hydration fails and React re-renders on the client. Where the week data differs, the
  first day of the week and the visible range differ too (for `ps-AF` the server grid starts on Saturday, the browser's
  `en-US` grid on Sunday), so a server prefetch from `getCalendarVisibleRange` does not match the first
  `onVisibleRangeChange`. A comparison of Node 24.20 (ICU 78.3) with Chrome 155 found 96 such languages, among them
  `be`, `cy`, `eu`, `hy`, `is`, `ka`, `km`, `lo`, `mk`, `mn`, `my`, `ne`, `ps`, `si`, `sq`, `tg` and `ug`, and different
  text for `az`, `az-Arab`, `bs`, `kk`, `kok`, `pa`, `sd` and `uz`. Before rendering a locale on the server, check that your
  target browsers support it (`Intl.DateTimeFormat.supportedLocalesOf` in the browser), or render that calendar on the
  client only.
- **Not certified.** No screen-reader or physical-device testing, no published support matrix and no measured
  performance budgets yet. The time zone list is a candidate until the first release candidate.

<a id="migration"></a>
## Migrating from 0.1

`0.2` is a breaking release without compatibility adapters. It needs Node.js 22 or newer and a matching React/ReactDOM
pair `^18.2.0 || ^19.0.0` (0.1 accepted Node.js 18 and any React from 18). In short: `events` become `items` with domain
fields in `data`; choose an IANA `timeZone` instead of `utcOffset`/`timezone`; convert inclusive all-day ends to exclusive ones (dates 3–4
September become `[2026-09-03, 2026-09-05)`, a missing end means one day); keep timed instants, noting that an end at
midnight no longer occupies the next day; replace `onEventPress` with `onItemPress` and `isFetching`/`CalendarSkeleton`
with `dataState`; replace `palette`, `theme` objects, `labels` and `@nelmad/calendar/tokens.css` with `tokens`, CSS
variables, `messages` and `@nelmad/calendar/styles.css`; edit/delete hover actions become `getItemActions` in the day agenda.

The [migration guide](docs/migration-0.1-to-0.2.md) has a tested conversion function and a table of removed exports.

<a id="releases"></a>
## Releases and provenance

Releases follow [RELEASING.md](RELEASING.md) and are published only from GitHub Actions, never from a developer machine
or a pull request. Every pull request and every push to `main` runs the full set of checks in
[CI](.github/workflows/ci.yml): type checks, lint, tests, the build and the tarball content check, the contract fixtures,
docs, the API report and the Storybook build; on one packed archive the Vite and Next.js consumers and the acceptance of
the milestone (`alpha.2`: server rendering, hydration, keyboard and axe checks in Chrome); and the Chrome probes.

A release starts only after CI is green on the commit to release: a maintainer runs the
[Release workflow](.github/workflows/release.yml) on `main` by hand. It repeats the type checks, tests, build and tarball
content check on that commit and stages the version on npm through trusted publishing, without a stored npm token, with
a provenance attestation. A staged version is not public until a maintainer approves it with two-factor authentication
on npmjs.com; only then does the workflow create the `vX.Y.Z` tag and a GitHub Release with the changelog section of the
version. Prereleases are published under the `next` dist-tag and stable versions under `latest`, so `latest` never
points to a prerelease.

The archive that CI tests and the archive that the Release workflow stages are built from the same commit and lockfile:
two reproducible builds of that commit, not one shared file. Provenance is a signed Sigstore attestation that links the
published package to that commit and to the workflow run that built it; the npm package page shows both. To verify the
registry signatures and provenance attestations of the packages installed in your application, run:

```sh
npm audit signatures
```

<a id="license"></a>
## License and privacy

MIT, see [LICENSE](LICENSE). The package has no license key, collects no telemetry, makes no network requests and loads
no external fonts, icons or other assets. [Changelog](CHANGELOG.md).
