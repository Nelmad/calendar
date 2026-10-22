# @nelmad/calendar: Next.js App Router example

[Русская версия](README.ru.md) · [Vite example](../vite/README.md)

A runnable Next.js 16 App Router app (React 19, TypeScript 6) built on the public API of `@nelmad/calendar`
`0.2.0-alpha.2` only: the package root and `@nelmad/calendar/styles.css`.

| Route | What it shows |
| --- | --- |
| `/quick-start` | [`components/Schedule.tsx`](components/Schedule.tsx), the quick start from the package README, rendered by [`app/quick-start/page.tsx`](app/quick-start/page.tsx). |
| `/` | [`components/ReleaseCalendar.tsx`](components/ReleaseCalendar.tsx) with records prefetched by the Server Component [`app/page.tsx`](app/page.tsx). |
| `/streaming` | [`components/AutoSchedule.tsx`](components/AutoSchedule.tsx), the quick start without `today`, in a route with [`app/streaming/loading.tsx`](app/streaming/loading.tsx): the segment streams and hydrates inside its own Suspense boundary, as in apps with `loading.tsx` or streamed data. |
| `/workspace` | [`components/Workspace.tsx`](components/Workspace.tsx), the alpha.2 integrations: layouts, actions, sources, theme and slots, ShadowRoot (below). |

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
cd examples/next
npm install ../calendar.tgz
npm run build
npm start              # http://127.0.0.1:3000
```

`npm install ../calendar.tgz` installs the pinned dependency graph from `package-lock.json` and replaces the integrity
recorded for the archive with that of your build. Do not use `npm ci` with a freshly packed archive: the lockfile still
holds the hash of the last qualified archive, and npm may install that cached copy instead of yours.
`npm run dev` starts the development server. Both scripts use webpack (`--webpack`), the bundler this example is
qualified with.

### After publication: the registry version

```sh
npm install @nelmad/calendar@0.2.0-alpha.2
npm run build && npm start
```

This replaces the `file:../calendar.tgz` dependency. The version is not published yet; use the archive until it is.

## Server and client boundaries

- `@nelmad/calendar` is safe to import on the server. `getCalendarVisibleRange` is a pure helper, so
  [`app/page.tsx`](app/page.tsx) calls it in a Server Component, loads that exact range from the simulated backend and
  passes plain serializable records to the client component.
- `Calendar` is a client component and the package marks its own client boundary. Callback props such as `onNavigate`
  must be functions, so the calendar is normally rendered from your own `'use client'` component, as
  [`components/ReleaseCalendar.tsx`](components/ReleaseCalendar.tsx) and [`components/Schedule.tsx`](components/Schedule.tsx) do.
- The SDK stylesheet is imported by those client components; Next.js deduplicates it. Importing it once in
  `app/layout.tsx` works as well.

## What the demo covers

- **Shared snapshot.** [`components/releaseData.ts`](components/releaseData.ts) holds one `today`, `Europe/Moscow` and
  `ru-RU` for server and client, so the first client render matches the HTML.
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
- **No `today` snapshot.** The quick start omits `today`: the server renders the Today button disabled and the client
  enables it after hydration from the viewer's clock.
- **Responsive page.** The calendar keeps the default `layout="auto"` and the page has narrow gutters on a phone, so the
  same demo is the desktop month with a popover on a wide screen and the mobile month with the agenda below it on a phone.
- **Color scheme.** The calendar's default `colorScheme="system"` follows the viewer's light or dark preference, and so
  does the page ([`app.css`](app/app.css)).
- **Quiet demo state.** The visible range, the viewed day and the last `onItemPress` payload are plain text, not live
  regions: the calendar announces its own changes, and the demo does not compete with it.

`components/Schedule.tsx`, `components/ReleaseCalendar.tsx`, `components/releaseData.ts`, `components/Workspace.tsx` and
`app/app.css` are
byte-identical to the Vite example.

## The `/workspace` route

[`components/Workspace.tsx`](components/Workspace.tsx) puts the alpha.2 integrations on one page (rendered by [`app/workspace/page.tsx`](app/workspace/page.tsx)):

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

`/`, `/quick-start` and `/streaming` use the default `layout="auto"`: in a wide window the calendar is the seven-column grid with a
popover agenda; on a phone, or whenever the calendar's own content box is narrower than `mobileBreakpoint` (640 px, that is
672 px for the root with its default 16 px padding), it is the compact mobile month with the agenda of the viewed day below
it. Item actions, sources, `neutralTheme`, slots and `portalContainer` are shown on `/workspace`. Selection, creation and
moving items are planned for `0.2.0-beta.1`. Props outside the current slice are typed as unavailable and ignored at
runtime with a development warning. The package is not published yet and has no screen-reader or physical-device
certification.

## Package qualification

`npm run check:package` in the repository root copies this directory to an isolated temporary folder, installs the freshly
packed archive with its integrity, type-checks the public declarations with TypeScript 5.9.3 and the minimum supported
5.4.5 (`typescript-5`, `typescript-min`), runs `next build` (which type-checks the app with TypeScript 6) and drives the
production server in Chrome. Probe files used only by that check, such as a Server Component that imports `Calendar`
directly, live in `scripts/implementation/packed-probes` and are never part of this example.
