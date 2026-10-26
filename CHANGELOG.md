# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0-alpha.2] - 2026-10-26

The first `0.2` prerelease published to npm. It is on the `next` dist-tag and `latest` stays `0.1.1`, so a plain
`npm install @nelmad/calendar` still installs 0.1. Install this version by its exact number and pin it: npm otherwise
saves the caret range `^0.2.0-alpha.2`, which also accepts later `0.2.0` prereleases. The API may still change before
`0.2.0`.

```sh
npm install @nelmad/calendar@0.2.0-alpha.2 --save-exact
```

**Breaking.** `0.2` replaces 0.1 and has no compatibility layer: `events`, `utcOffset`, the 0.1 callbacks and helpers,
palettes, labels, the theme object, `CalendarSkeleton`, `@nelmad/calendar/tokens.css` and Day.js are removed, and
`Calendar` takes ISO `items` with an explicit IANA `timeZone`. See the
[migration guide](https://github.com/Nelmad/calendar/blob/main/docs/migration-0.1-to-0.2.md).

**Requirements.** Node.js 22 or newer (0.1.1: 18 or newer). `react` and `react-dom` `^18.2.0 || ^19.0.0` as a
matching pair (0.1.1: any version from 18), so React 18.0 and 18.1 are no longer supported. `dayjs`,
`react-aria-components` and `@react-aria/interactions` are no longer peer dependencies: the date and accessibility
libraries are ordinary dependencies.

**0.2.0-alpha.1 was not published.** It was an internal candidate, and this release includes all of its changes,
listed under `0.2.0-alpha.1` in the [changelog](https://github.com/Nelmad/calendar/blob/main/CHANGELOG.md): the new
`Calendar` with the desktop Month view and its day agenda, controlled navigation and visible-range loading, data states,
validation and diagnostics, `ru-RU` and `en-US` messages, `classicTheme` with tokens, and the removal of the 0.1 API.
The lists below are what this release adds on top of it, the responsive and integration slice; where an entry compares
with alpha.1, it compares with that unpublished candidate. CI runs the alpha.2 acceptance on the packed archive in a
Vite app with React 18 and a Next.js app with React 19. Selection, creation, moving items and `interactionPolicy` are
planned for `0.2.0-beta.1`.

### Added

- Responsive `layout`: optional, default `"auto"`. `"auto"` measures the content-box width of the calendar root with
  `mobileBreakpoint` (default `640` CSS px; `< breakpoint` is mobile); `"desktop"` and `"mobile"` are fixed. The server
  and the first client render of `"auto"` are mobile.
- Mobile layout: a compact grid with item indicators and the day agenda below it as a named inline region.
- `agendaPresentation` (`"auto"` | `"overlay"`) and the `CalendarAgendaPresentation` type: `"overlay"` shows the mobile
  agenda as a modal sheet with contained focus, an inert background and scroll lock.
- One agenda lifecycle across popover, inline and sheet: a resize or prop change keeps the viewed date and moves only
  focus that was inside the agenda; a pending controlled agenda request opens once in the presentation current when it is
  accepted.
- `portalContainer` (`Element` | `ShadowRoot` | `null`): the agenda popover and sheet portal into it, or into the owner
  document `body` by default. A detached or cross-document container falls back to the default with a development
  warning. Each portal has its own theme root that mirrors the 27 public CSS variables and inherited font properties of
  the calendar root before it is shown; replacing or removing the container while an overlay is open closes it and
  returns focus to the calendar.
- While a modal sheet is open, the calendar's live announcements are written to status/alert regions inside the sheet;
  the regions of the calendar root are cleared until it closes.
- Item actions: `getItemActions` with `onItemActionRequest` and the types `CalendarItemAction`, `CalendarItemActionRequest`
  and `CalendarItemActionsProps`. Each agenda row with a nonempty set gets a separate `…` trigger beside its primary
  surface; it opens a keyboard menu on desktop (nested in the agenda popover) and a named modal action sheet on mobile.
  Invalid or duplicate actions are excluded with a development warning, an empty set has no trigger, a set that becomes
  empty closes its open surface with focus recovery inside the agenda, and a request always uses the latest committed
  item and set.
- Controlled sources: `sources`, `visibleSourceIds` with `onVisibleSourceIdsChange`, `showSourceSelector` and the types
  `CalendarSource` and `CalendarSourceFilterControlProps`. The accepted filter hides items of hidden sources in the grid,
  counts, agenda and actions together; items without `calendarId` or with an unknown one stay visible. A toolbar selector
  (from two valid sources) uses `menuitemcheckbox` items on desktop and named checkboxes in a modal sheet on mobile; its
  checked state and labels follow only the accepted props, and a callback sends unique known IDs in source order.
- `neutralTheme`, the second preset: a gray-blue palette with smaller radii and its own dark scheme; it combines with
  both densities and every `colorScheme` and sets `data-theme=neutral` on the root and its portal theme roots.
- Item colors: `CalendarSource.color` now colors the accent marker of a known source (also in the source selector), and
  `getItemAppearance` with `CalendarItemAppearance` and `CalendarItemAppearanceContext` replaces the accent, background
  and text of an item independently. One appearance per item for every Month segment and its agenda row; blank,
  non-string and multi-declaration values are ignored with a development warning, identically on server and client.
- `classNames` for every package surface (`CalendarClassNames`, `CalendarClassName` and the state types
  `CalendarRootState`, `CalendarDayState`, `CalendarOverflowState`, `CalendarAgendaState`); the contract error shell runs
  only `root` and `status`.
- Content slots `renderItem`, `renderAgendaItem`, `renderDayHeader`, `renderToolbarContent`, `renderLoading`,
  `renderEmpty` and `renderError` with typed contexts (`CalendarItemSlotContext` and its Month/agenda branches,
  `CalendarToolbarSlotContext`, `CalendarLoadingSlotContext`, `CalendarEmptySlotContext`, `CalendarErrorSlotContext`).
  `renderItem` runs once per segment with its exact `segmentRange`; the accessible name of a custom agenda row starts with
  the default summary. Development builds warn about interactive content inside item and day slots.
- Documentation and examples for the alpha.2 slice: a `/workspace` route in the Vite and Next.js examples (layouts, item
  actions, a source filter accepted later, `neutralTheme` with tokens and slots, a ShadowRoot with its portals), stories for
  forced layouts, the theme × density × color scheme matrix, custom item content, a toolbar extension and a custom retry,
  and the ShadowRoot theme scope, and allowed/not allowed slot content examples in the API reference.
- `CalendarDataAttribute`, `CalendarResolvedLayout`, `CalendarResolvedAgendaPresentation` and `CalendarItemView` types.
- Prereleases are published under the `next` dist-tag with npm provenance, which links the version to its source commit
  and build; `npm audit signatures` verifies an installed release. See "Releases and provenance" in the README.

### Changed

- `layout` is no longer required. An unknown value is a contract error naming the accepted layouts.
- The stable `data-*` attributes appear only on their documented elements: item action and source sheets no longer carry
  `data-presentation`, and source menu items and checkboxes no longer carry React Aria's `data-selected`. Agenda rows
  and Month items have an accent marker at their inline start.
- The day agenda popover and sheet are no longer rendered inside the calendar root but in the owner document `body`
  (the unpublished alpha.1 rendered the popover inside the root). A calendar inside a `ShadowRoot` must now also load
  `@nelmad/calendar/styles.css` in the document, or pass a `portalContainer` inside a styled tree scope.
- Inside a host modal window the default portal target is the open modal container around the calendar (a `<dialog>`
  shown with `showModal()`, or an element with `aria-modal="true"`), re-resolved on every date activation; an explicit
  `portalContainer` still wins. If the default changes while an agenda is open, also by an attribute alone (`aria-modal`
  removed or added, a `<dialog>` closed), the agenda closes as on a change of `portalContainer`. A plain `role="dialog"` or `role="alertdialog"` without `aria-modal="true"` (a side panel,
  a toast) and a `<dialog>` opened with `show()` are not modal containers: the agenda portals to `body` there, and such an
  element shown above the modal sheet is inert background instead of a host layer the sheet yields to.
- Documented: the `layout="auto"` scrollbar feedback band
  (`scrollbar-gutter: stable` on the scrolling ancestor avoids it), the `tokens` single-declaration rule as a security
  rule and the server render of `"auto"`: the compact month has an inline agenda only with
  `agendaPresentation="auto"`, none with `"overlay"` until a date is activated.
- All package overlays share `z-index: 100000` (the sheet backdrop was `1000`) and keep pointer events under
  `body { pointer-events: none }`.
- Only a press on the sheet backdrop itself dismisses the sheet; a press inside the sheet or on a package menu above it
  does not.
- The mobile inline agenda no longer has its own scroll area; it grows with the page.
- Development warnings: a missing required prop (`items`, `anchorDate`, `timeZone`, `onNavigate`) is reported as
  `Required`. A stripped prop is reported by kind: a prop of a later prerelease as `not available in 0.2.0-alpha.2`, a 0.1
  prop as `removed in 0.2; see the migration guide`, any other name as `not a Calendar prop`; React's `key`, `ref` and
  `children` are never reported. With `sources`, an unknown `calendarId` is reported once per ID with the path of its first
  item (`items[3].calendarId: No source with ID "archive"; …`), so a later new unknown ID is reported too; without
  `sources` one `items[].calendarId` warning remains.
- Dependencies: `react-stately` is pinned to the exact version that `react-aria` and `react-aria-components` pin, and
  `@react-stately/flags` is no longer a dependency. A fresh install has one `react-stately` (and one
  `@internationalized/date`).
- Item colors follow the token map: chips, bars and agenda rows use `components.itemBackground` and
  `components.itemText` (bars used `components.selectedDayBackground`); `components.selectedDayBackground` colors only
  selected days. Buttons and menu items derive their fill and hover from `color.surface` and `color.text` instead of the
  item and selected-day tokens.
- A `tokens` value that is not a single CSS declaration value (a top-level `;` or `!`, an unclosed string, comment or
  bracket, an unmatched closing bracket, a trailing escape, or a leading or trailing character that JavaScript `trim()`
  removes but CSS keeps) or that contains any `url(` (also a well-formed one, nested in a function such as `image-set()`,
  or spelled with escapes such as `u\72l(`) is ignored like a blank value, with the warning
  `tokens.<group>.<token>: Expected a single CSS declaration value`.
- `aria-busy="true"` of `loading/refresh` is set on the stale content (the grid and an inline agenda) instead of the root,
  so the calendar's live regions and its status regions are no longer inside a busy subtree.
- The comfortable density default of `density.dayMinHeight` is `128px` (was `120px`), so it shows the two lanes that
  compact shows.
- A desktop grid keeps columns of at least 64 px and scrolls horizontally inside the grid region in a container narrower
  than 448 px (a forced `layout="desktop"`, or `"auto"` with a `mobileBreakpoint` below 448); the weekday row stays
  visible while a constrained grid scrolls, and a cell focused from the keyboard scrolls into view below it.
- Times: a 12-hour clock no longer pads the hour (`4:00 PM`, not `04:00 PM`); a 24-hour clock keeps a two-digit hour in
  every locale, so midnight is `00:…`. A timed interval within one date names that date once, a wall time that a DST fold repeats shows its UTC
  offset, and a year below 1000 shows its era (`February 1 AD`).
- Four rules are now documented: however the toolbar source
  selector closes (`Escape`, close, its trigger, a press outside or on the sheet backdrop, a layout switch, a new portal
  target), focus that was in it returns to its trigger, and the general recovery order applies only without a trigger
  that can take focus; `CalendarSource.color` and every `getItemAppearance` color follow the single-declaration
  rule of `tokens`, so an offending value is absent on the server and the client and the lower layer stays;
  under a strict CSP hydration writes back only the calendar's own validated declarations (see below); the
  accessible name of an agenda row with `renderAgendaItem` is the default summary followed by the visible content.
- Under a strict `style-src` the root `style` prop is no longer written back after hydration: only the calendar's own
  validated declarations are (the `tokens` of the root, except a variable that `style` replaces, and the grid row count).
  Like any other inline style of the page, a root `style` stays subject to the policy; move such styles into a
  stylesheet through `className`.

### Fixed

- Under a strict `style-src` the item colors of a server-rendered inline agenda (source accent, `getItemAppearance`
  accent, background and text) are written back after hydration as a client render writes them; before, the hydrated rows
  had none of them until those colors changed.
- A calendar hydrated inside a separately hydrated Suspense boundary (Next.js `loading.tsx`, streaming, deferred data)
  no longer re-renders endlessly: the internal model is memoized by its inputs, so unchanged items are also not
  validated and indexed again on every render, and internal state is written only when it changes.
- `layout="auto"` no longer alternates between desktop and mobile every frame when a page or ancestor scrollbar exists
  in only one of the layouts: a switch that moves the width back across the breakpoint by itself keeps its layout while
  the width stays within that feedback band, so a resize or window drag through the band switches once per crossing.
- A desktop popover near the bottom of a host modal `<dialog>` opens above its date cell when there is more room above,
  instead of being squeezed below it to the remaining 100–150 px; it uses the room of the side it opens on.
- When the focused agenda item disappears from the data, the sheet now always closes and focus moves to the date cell,
  in development and production builds alike.
- No false `aria-labelledby` warning when the calendar unmounts in a later commit; a `messages` function that returns an
  empty or non-string value is now reported when the agenda renders it.
- A long desktop agenda can be scrolled: scrolling inside the popover no longer repositions it and resets its scroll
  position, and `Tab` keeps the focused item visible.
- The agenda works inside host modal windows (native `<dialog>`, focus-trap and `pointer-events` modals): it is reachable,
  stays within the dialog's visible box, and the first `Escape` closes the agenda instead of the host dialog.
- A modal host dialog opened from `onItemPress` above the modal sheet (a `<dialog>` shown with `showModal()` or an
  element with `aria-modal="true"`, also inside an open `ShadowRoot` such as a web-component modal) is no longer made
  inert: the sheet yields to it until it closes and then focuses the pressed control again.
- The modal sheet's inert background, scroll lock, focus containment and `Escape` are bound to the calendar's own document:
  a calendar rendered into an iframe document no longer hides or locks the page around the iframe. `Escape` also closes
  the sheet when focus has fallen to the page body.
- `Escape` or another key pressed right after a date activation, before the overlay finished opening, no longer leaves a
  sheet or popover open without focus.
- A popover whose date cell left the grid is anchored under the toolbar instead of below the whole calendar; a popover
  whose cell is scrolled out of a host scroll container is clipped away with it. The sheet keeps its heading and close
  button visible while it scrolls.
- Host CSS resets (`button { all: unset }`, `* { box-sizing: content-box }`) and a small root font size no longer change
  the size of package-owned controls and overlays.
- Presses and the modal sheet work inside a `ShadowRoot` in consumer installs: the Shadow DOM support flag was enabled in a
  second copy of `react-stately` that React Aria did not read, so toolbar buttons, agenda items and Close did nothing in a
  shadow root.
- A token value containing `;` (for example from tenant settings) can no longer add declarations to the server-rendered
  `style` of the calendar root, also not through a `url(` spelled with CSS escapes (`u\72l(`), a non-breaking space
  after `url(` or whitespace that React trims; the server and the client render the same declarations.
- Under a strict `style-src` (no `'unsafe-inline'`, no `style-src-attr`) a server-rendered calendar keeps its row count
  and tokens after hydration: the blocked inline styles of the root and the grid are written again through CSSOM,
  property by property as a client render writes them, so a declaration that a client render rejects (such as a `style`
  value containing `;`) is not applied either. Previously the hydrated month had no row count and item presses could miss.
- A press on a chip or bar of a keyboard-focused date cell calls `onItemPress` again instead of opening the agenda; the
  focus ring is drawn above the items.
- A refresh no longer pushes the grid down on every load, in any layout: its progress is a thin bar over the top border of
  the grid that takes no space and covers no date, weekday name or control. A refresh error is a banner with Retry between
  the toolbar and the grid; it moves the grid down once while it is shown, and an open agenda popover moves with its date.
  No data state moves the toolbar buttons, so a second press on Next while the new month loads still navigates. Initial
  loading and errors keep the measured height of the view they replace, and before the first measurement the sizes the
  month itself uses (on a first load the page below moves by at most about 2 %, and not at all when the host line height
  is unitless or `normal`, unless the loaded month turns out empty and adds its "No events" region), instead of
  collapsing the calendar. The loading region is named once, by its text; the refresh progress is no region, and only its
  progress bar carries the name.
- The start of a refresh is no longer announced: the progress bar and `aria-busy` show it, so the announcement of a month
  opened with Previous/Next is not replaced by the refresh that loads it. Its completion is announced once.
- In forced colors mode chips and bars keep a visible border, continuation sides are dashed and days outside the month
  use `GrayText`.
- A press on the visible part of a date cell at the edge of the viewport opens it: pointer focus no longer scrolls the
  page between press and release.
- `+N` reserves its row only on dates that hide items; a date whose items fit shows them all. Lanes and `+N` change in the
  same frame as a resize or a month change, are measured in CSS px under a host `zoom` or `transform`, and a continued bar
  no longer repeats the start time. `+N` keeps its sign first in RTL.
- A narrow chip keeps its title with an ellipsis and hides the time first; the grid's instructions are no longer a text
  child of the `grid`.
- The press control of a custom agenda row (`renderAgendaItem`) now includes the visible custom content in its accessible
  name after the default summary, instead of exposing it only as a description, so the visible label is part of the name
  (WCAG 2.5.3, found by axe in the alpha.2 acceptance).
- A press that starts inside the modal sheet and is released over its backdrop (for example while selecting text), or
  the reverse, no longer dismisses the sheet; only a press that starts and ends on the backdrop does.
- A pure modifier key (`Shift`, `Control`, `Alt`, `Meta`) or the auto-repeat of a held key pressed right after a date
  activation no longer cancels the opening agenda.
- The menu or action sheet of an item that the accepted source filter hides while it is open stays open until dismissed,
  but its actions are now disabled instead of looking usable and doing nothing; focus stays in the surface.
- When an updated action or source set removes the focused menu item or sheet control, focus moves to the next control
  after its position, else the previous one, instead of always the first.
- The DOM ids of item menus, action sheets and the source selector are unique per calendar, so two calendars on one page
  no longer share an id, and item IDs that differ only in punctuation no longer map to the same id.
- In a mobile calendar of fixed height the inline agenda shrinks before the grid, and the grid keeps its weekday row and at
  least one week visible, also with a refresh error banner (the grid viewport was 7 px at 320 × 360 px); an intrinsic
  calendar keeps the exact first-load height.
- An accepted `tokens` value is passed CSS-trimmed, so React 19 writes on the client exactly the text it rendered on the
  server (React 19 trimmed only on the server).
- The next refresh start clears a stale "Calendar refreshed" from the polite live region, so two refresh cycles in a row
  announce their completion as two separate payloads.
- A blocking `dataState` (`loading/initial`, `error/initial`) also closes an open source selector menu or sheet with its
  modal effects and moves focus that was in it to the state region; the selector trigger is disabled until content
  returns, so no toggle can be sent while the grid is replaced.
- Mounting or hydrating a calendar with the source selector under React `StrictMode` no longer moves focus to the
  selector button, and switching `portalContainer` between `undefined` and `null` no longer closes an open overlay.
- In a mobile calendar of definite height the rows of the inline agenda scroll inside the calendar instead of painting
  over, and taking the presses of, the page content below it.
- The live regions of the source and item action sheets are inside their modal dialog element, like those of the agenda
  sheet.
- A closed calendar no longer observes DOM mutations of the whole document; the portal target is re-resolved whenever a
  package overlay opens and observed only while one is open. Only an `aria-labelledby` reference keeps an observer, which
  validates the referenced names.
- Today stays available, and focuses its cell, when today is a visible date of a neighboring month in the first or last
  supported month.
- The conversion function of the migration guide throws for an all-day event ending on 9999-12-31 and for a date that
  leaves 0001…9999 in the display offset, instead of returning an end date that the calendar excludes. The API reference
  lists the source selector, item action and cancel messages among the displayed ones and gives the accepted time zone
  count with `UTC` included (445).
- Focus that the user moved out of the calendar by pressing or tapping non-focusable page content is no longer pulled back into it
  by a later data update that removes or disables the control focused before.
- `aria-labelledby` is validated once a calendar rendered into a detached container is attached to the document or to a
  `ShadowRoot`, also after the calendar is moved into a `ShadowRoot` in a later task.
- A desktop popover or child menu whose calendar the page hides (a `hidden` or `display: none` ancestor, a Suspense
  fallback) is clipped away like one with a scrolled-away anchor; a modal sheet of a suspended calendar is not shown
  without its inert background, scroll lock and focus containment, and returns with them.
- `onRetryRequest` is called without arguments.
- Opening or closing one item's action menu re-renders only that item's trigger, not every agenda row.
- A host modal that renders no `aria-modal` but makes the rest of the page inert or `aria-hidden` (React Aria
  Components' `Modal`), opened from `onItemPress` above the mobile sheet, owns focus from the moment it opens and `Escape`;
  the sheet yields to it and never pulls focus back.
  When the sheet closes first, the page stays scroll-locked and in the background until that modal closes, and is then
  restored instead of staying `overflow: hidden`.
- The focus ring of the first and last control of item action and source sheets is no longer clipped by their list.
- Tab after a press on the heading or blank content of the desktop popover moves to its first control instead of closing
  it; a Tab exit inside a modal `<dialog>` never targets the inert page outside it and never leaves focus on `body`.
- The desktop popover and the source menu close only on a primary press that starts and ends outside them: a text
  selection dragged out of them or a secondary-button press does not close them.
- A modal sheet with `portalContainer` set to the `<html>` element makes the body its inert background.
- Enter on a date in the mobile layout scrolls the focused inline agenda heading into view; focus recovery targets other
  than date cells are revealed too.
- A well-formed locale with an unknown numbering system (`en-u-nu-xyz`) renders instead of throwing an ICU error from
  render, server rendering and `getCalendarVisibleRange`.
- The cost of laying out a timed item no longer grows with its duration: an item spanning the whole supported domain in a
  daylight-saving zone server-renders in milliseconds instead of seconds.
- With `dir` overridden, formatted dates and times keep the direction of the locale's script: `ru-RU` and `en-GB` dates
  in an `rtl` calendar are no longer visually reordered.
- A message override that contains the interpolated title or source name inside one of its own words isolates only the
  interpolation, not letters of that word.
- The invalid-configuration shell takes its direction from the same resolved locale as the data state.
- A timestamp whose written date has the year `0000` but whose instant is inside the supported domain
  (`0000-12-31T23:30:00-01:00`) is accepted.
- `classicTheme` and `neutralTheme` from the CommonJS build are accepted by the ESM `Calendar` and the other way round.
- The Vite example server answers 404 for a missing asset instead of exiting.
- Inside a host dialog that has `role="dialog"` but no `aria-modal` (Radix Dialog, React Aria Components `Modal` and
  `Popover`), where the default portal target is `body` and the host's focus trap closes the agenda at once, development
  builds now warn once and name `portalContainer` as the fix; the README documents these libraries.
- Page element rules for `h2`/`h3`/`p` (the Vite React template's `h2` color, a preflight reset) no longer restyle the
  month title, agenda headings or the empty-agenda line: with a forced `colorScheme` different from the page, the title
  was nearly invisible.
- With `layout="auto"`, opening a sheet on a page with a custom-styled (`::-webkit-scrollbar`) classic scrollbar no longer
  widens the calendar across the breakpoint and switches it to desktop: the scroll lock pads the scrollbar width that
  `scrollbar-gutter: stable` did not keep, so the requested agenda, action or source sheet opens.
- In the mobile inline agenda, focus on an agenda item whose month the host changes moves to the roving date cell of the
  new month instead of the toolbar's Previous month button.
- Without `today`, the grid's Tab stop follows the viewed agenda date to today once the clock is read (after hydration,
  after midnight) until a date is focused or navigated, instead of staying on the first of the month.
- Short weekday names that do not fit their column switch to the narrow format, and a `+N` count too wide for its column
  ends in an ellipsis, instead of being clipped mid-glyph.
- The grid description separates the instructions from the reason why month navigation is unavailable at the supported
  bounds.
- A nonexistent date such as `2026-02-30` is reported as `Expected an existing date; 2026-02-30 does not exist` instead of
  the date library's range message, and an unknown `layout` as `Unknown enum value`; slot warnings no longer cite a
  specification section.
- The README no longer claims that a `tokens` value cannot reference a resource: the rule rejects every `url(`, while
  string forms such as `image-set("…")` are passed to CSS. The SSR locale limitation now describes the Node/Chrome Intl
  data gap beyond `az-Arab`.

## [0.2.0-alpha.1] - not published

An internal candidate that was not published to npm; its changes ship in `0.2.0-alpha.2`. Breaking replacement of 0.1.
No compatibility layer; see the [migration guide](docs/migration-0.1-to-0.2.md).

### Added

- `Calendar` with the alpha.1 props: `items`, `timeZone`, `anchorDate`, `onNavigate`, `onVisibleRangeChange`, `today`,
  `locale`, `firstDayOfWeek`, `hourCycle`, `dir`, `layout` (required, `"desktop"` only), `agendaDate` with
  `onAgendaDateChange`, `dataState`, `onRetryRequest`, `onItemPress`, `sortItems`, `theme`, `density`, `colorScheme`,
  `tokens`, `messagesLocale`, `messages`, `className`, `style`, `id`, `aria-label`, `aria-labelledby`.
- ISO/RFC 3339 `CalendarItem` intervals with exclusive all-day ends, moments, generic `data` and an explicit IANA
  `timeZone` from a built-in accepted list (tzdb 2026c candidate).
- Desktop Month view with keyboard navigation, measured lanes and `+N`, and a complete day agenda in a non-modal popover.
- Controlled navigation, committed and deduplicated `onVisibleRangeChange`, and the pure server-callable
  `getCalendarVisibleRange`.
- Data states (initial/refresh loading and error, empty), runtime validation with a safe contract error shell and
  development diagnostics.
- `ru-RU` (default) and `en-US` catalogs, partial `messages`, Gregorian `Intl` formatting, RTL.
- `classicTheme`, compact/comfortable density, system/light/dark color schemes, 27 tokens and CSS variables, one scoped
  stylesheet `@nelmad/calendar/styles.css`.
- English and Russian README, API reference, generated API report and migration guide.

### Changed

- Declarations publish only the alpha.1 slice; props planned for later prereleases are typed `?: never` and removed at
  runtime with a development warning.
- `Calendar` keeps its own client boundary; the root entry is safe to import in React Server Components.
- Only React/ReactDOM are peers; date and accessibility libraries are ordinary dependencies.

### Removed

- The 0.1 renderer and API: `events`, `CalendarEvent`, `utcOffset`, `timezone`, `onEventPress`, `onEventEdit`,
  `onEventDelete`, `SeriesActionScope`, `isFetching`, `CalendarSkeleton`, `getMonthGridRange`, `getMonthGridWeeks`,
  `buildWeekLayout`, `formatEventTime`, labels, palettes, the old theme object and `@nelmad/calendar/tokens.css`.
- Day.js.

`0.2.0-alpha.2`, the first published `0.2` prerelease, adds responsive and mobile layouts, actions, sources,
`neutralTheme`, render slots and class callbacks; selection, creation and moving items are planned for `0.2.0-beta.1`.

## [0.1.1] - 2026-10-12

### Changed

- Published from GitHub Actions through npm trusted publishing, with a provenance attestation that links the
  package to its source commit and build. No code changes since 0.1.0.
- `repository`, `homepage` and `bugs` point to `github.com/Nelmad/calendar` with the exact owner name.

## [0.1.0] - 2026-06-10

### Added

- Initial release of `@nelmad/calendar`
- `Calendar` — month view with multi-day event bars and single-day chips
- `CalendarSkeleton` loading placeholder
- UTC-offset-aware layout (`buildWeekLayout`, `getMonthGridRange`, `getMonthGridWeeks`)
- `formatEventTime` helper
- Customizable `labels`, `theme`, and `palette` with default exports
- Hover edit/delete actions with `single` / `series` scope
- ESM + CJS build, bundled CSS (`styles.css`, `tokens.css`)
- Storybook examples

### Changed

- README: product overview, data-flow example, multi-day quick start, limitations, event flags matrix, CSS/font setup, exports list
