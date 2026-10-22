# @nelmad/calendar: Vite example

[Русская версия](README.ru.md) · [Next.js example](../next/README.md)

A runnable React 18 + Vite 6 app with server-side rendering, built on the public API of `@nelmad/calendar` `0.2.0-alpha.2`
only: the package root and `@nelmad/calendar/styles.css`.

| Route | What it shows |
| --- | --- |
| `/quick-start` | [`src/Schedule.tsx`](src/Schedule.tsx), the quick start from the package README: records, controlled navigation, `onItemPress`. Server-rendered and hydrated. |
| `/` | [`src/ReleaseCalendar.tsx`](src/ReleaseCalendar.tsx), the complete alpha.2 integration described below. |
| `/workspace` | [`src/Workspace.tsx`](src/Workspace.tsx), the alpha.2 integrations: layouts, actions, sources, theme and slots, ShadowRoot (below). |

## Run

Node.js 22 or newer.

### Before publication: a locally packed archive

```sh
# In the repository root
npm ci
npm run build
npm pack
mv nelmad-calendar-*.tgz examples/calendar.tgz

# In this directory
cd examples/vite
npm install ../calendar.tgz
npm run build
npm start              # http://127.0.0.1:4173 (PORT overrides the port)
```

`npm install ../calendar.tgz` installs the pinned dependency graph from `package-lock.json` and replaces the integrity
recorded for the archive with that of your build. Do not use `npm ci` with a freshly packed archive: the lockfile still
holds the hash of the last qualified archive, and npm may install that cached copy instead of yours.

`npm run dev` starts the Vite dev server without SSR: the client renders the demo itself and shows the initial loading
state before the first range arrives.

### After publication: the registry version

```sh
npm install @nelmad/calendar@0.2.0-alpha.2
npm run build && npm start
```

This replaces the `file:../calendar.tgz` dependency. The version is not published yet; use the archive until it is.

## What the demo covers

- **Server prefetch.** [`src/entry-server.tsx`](src/entry-server.tsx) computes the first grid range with
  `getCalendarVisibleRange({anchorDate, timeZone, locale})`, loads it from the simulated backend and renders HTML that
  already contains the records. [`server.mjs`](server.mjs) server-renders every route and embeds the data of `/` as JSON;
  [`src/main.tsx`](src/main.tsx) hydrates whatever the server rendered (with that data on `/`) and renders on the client
  only when there is no server HTML (`npm run dev`).
- **Shared snapshot.** [`src/releaseData.ts`](src/releaseData.ts) holds one `today`, `Europe/Moscow` and `ru-RU`
  for both server and client, so the first client render matches the HTML.
- **Visible-range loading.** `onVisibleRangeChange` runs after commit for every new `(start, end, timeZone)`. Its first
  call repeats the prefetched range and is answered from the cache, so nothing is requested twice. A new month shows
  `loading/refresh` with the previous records, a newer range aborts the older request, and "Fail the next request" produces
  `error/refresh` with the built-in retry (`onRetryRequest`). "Clear cache and reload" shows `loading/initial`.
- **Controlled navigation and agenda.** `anchorDate`/`onNavigate` and `agendaDate`/`onAgendaDateChange` are state of the app.
  Activating the already accepted day opens its agenda without a callback.
- **Item payload.** `onItemPress` receives the item with its typed `data`, the pressed `date`, the `view` and, in the grid,
  the `segmentRange`; the demo prints it.
- **Language.** The switch changes `locale` between `ru-RU` and `en-US`; the message catalog and the first day of the week
  follow, so the visible range changes and a new range is loaded.
- **Responsive page.** The calendar keeps the default `layout="auto"` and the page has narrow gutters on a phone, so the
  same demo is the desktop month with a popover on a wide screen and the mobile month with the agenda below it on a phone.
- **Color scheme.** The calendar's default `colorScheme="system"` follows the viewer's light or dark preference, and so
  does the page ([`app.css`](src/app.css)).
- **Quiet demo state.** The visible range, the viewed day and the last `onItemPress` payload are plain text, not live
  regions: the calendar announces its own changes, and the demo does not compete with it.

`src/Schedule.tsx`, `src/ReleaseCalendar.tsx`, `src/releaseData.ts`, `src/Workspace.tsx` and `src/app.css` are byte-identical to the files of
the Next.js example. They start with `'use client'` for Next.js; [`vite.config.mjs`](vite.config.mjs) blanks that
directive because Vite has no Server Components.

## The `/workspace` route

[`src/Workspace.tsx`](src/Workspace.tsx) puts the alpha.2 integrations on one page:

- **Layouts.** A select switches `layout` between `auto` (default), `desktop` and `mobile`, another `agendaPresentation`
  between the agenda below the mobile grid and a modal sheet. Narrow the window to see `auto` switch at a 640 px content box.
- **Item actions.** `getItemActions` offers "Mark as done" and "Delete"; `onItemActionRequest` changes the application's own
  `items`. On desktop the actions are a menu next to the agenda row, on a phone an action sheet.
- **Sources with delayed acceptance.** Three sources with colors; a toggle only sends `onVisibleSourceIdsChange`, the
  simulated settings service saves the filter 500 ms later and only then does the calendar hide the items. An item without
  `calendarId` and one with an unknown `calendarId` always stay visible; for the latter a development build prints the one
  documented `items[5].calendarId` warning (no source with ID `archive-2025`), the only console message of this route.
- **Theme and slots.** `neutralTheme` with `tokens`, `classNames` for done items and today, passive `renderItem` and
  `renderAgendaItem` content from `data`, and a toolbar extension button of its own (`aria-pressed`) that switches the density.
- **ShadowRoot.** "In a ShadowRoot" renders the same calendar inside an open shadow root that adopts copies of the document
  stylesheets (with `styles.css`) and passes that root as `portalContainer`, so the popover and the sheets get the theme too.
  `aria-labelledby` is resolved only in the calendar's own tree scope, and the page heading stays in the document, so in this
  mode the example names the calendar with `aria-label` instead; a cross-tree reference would be ignored with a development warning.

## Limits of alpha.2

`/`, `/quick-start` use the default `layout="auto"`: in a wide window the calendar is the seven-column grid with a
popover agenda; on a phone, or whenever the calendar's own content box is narrower than `mobileBreakpoint` (640 px, that is
672 px for the root with its default 16 px padding), it is the compact mobile month with the agenda of the viewed day below
it. Item actions, sources, `neutralTheme`, slots and `portalContainer` are shown on `/workspace`. Selection, creation and
moving items are planned for `0.2.0-beta.1`. Props outside the current slice are typed as unavailable and ignored at
runtime with a development warning. The package is not published yet and has no screen-reader or physical-device
certification.

## Package qualification

`npm run check:package` in the repository root copies this directory to an isolated temporary folder, installs the freshly
packed archive with its integrity, type-checks the public declarations (`typescript` and the minimum supported
`typescript-min`), builds the app and drives it in Chrome. Probe files used only by that check live in
`scripts/implementation/packed-probes` and are never part of this example.
