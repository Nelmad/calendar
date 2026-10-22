# @nelmad/calendar: пример на Next.js App Router

[English version](README.md) · [Пример на Vite](../vite/README.ru.md)

Запускаемое приложение Next.js 16 App Router (React 19, TypeScript 6). Использует только публичный API
`@nelmad/calendar` `0.2.0-alpha.2`: корень пакета и `@nelmad/calendar/styles.css`.

| Маршрут | Что показывает |
| --- | --- |
| `/quick-start` | [`components/Schedule.tsx`](components/Schedule.tsx) — quick start из README пакета, его рендерит [`app/quick-start/page.tsx`](app/quick-start/page.tsx). |
| `/` | [`components/ReleaseCalendar.tsx`](components/ReleaseCalendar.tsx) с записями, предзагруженными Server Component [`app/page.tsx`](app/page.tsx). |
| `/streaming` | [`components/AutoSchedule.tsx`](components/AutoSchedule.tsx) — quick start без `today` в маршруте с [`app/streaming/loading.tsx`](app/streaming/loading.tsx): сегмент приходит потоком и гидрируется внутри собственной границы Suspense, как в приложениях с `loading.tsx` или потоковыми данными. |
| `/workspace` | [`components/Workspace.tsx`](components/Workspace.tsx) — интеграции alpha.2: layouts, действия, sources, тема и slots, ShadowRoot (ниже). |

## Запуск

Нужен Node.js 22 или новее.

### До публикации: локально собранный архив

```sh
# В корне репозитория
npm ci
npm run build
npm pack
mv nelmad-calendar-*.tgz examples/calendar.tgz

# В этом каталоге
cd examples/next
npm install ../calendar.tgz
npm run build
npm start              # http://127.0.0.1:3000
```

`npm install ../calendar.tgz` ставит закреплённый граф зависимостей из `package-lock.json` и заменяет записанную для
архива integrity на хеш вашей сборки. Не используйте `npm ci` со свежим архивом: в lockfile остаётся хеш последнего
проверенного архива, и npm может поставить его копию из кэша вместо вашей.
`npm run dev` запускает dev-сервер. Оба скрипта используют webpack (`--webpack`) — bundler, с которым пример проверен.

### После публикации: версия из registry

```sh
npm install @nelmad/calendar@0.2.0-alpha.2
npm run build && npm start
```

Команда заменяет зависимость `file:../calendar.tgz`. Версия ещё не опубликована — до публикации используйте архив.

## Границы сервера и клиента

- `@nelmad/calendar` безопасно импортировать на сервере. `getCalendarVisibleRange` — чистая функция, поэтому
  [`app/page.tsx`](app/page.tsx) вызывает её в Server Component, загружает именно этот диапазон из имитации backend и
  передаёт клиентскому компоненту обычные сериализуемые записи.
- `Calendar` — клиентский компонент, пакет сам объявляет свою client boundary. Callback-props вроде `onNavigate` должны
  быть функциями, поэтому календарь обычно рендерится из вашего `'use client'` компонента, как в
  [`components/ReleaseCalendar.tsx`](components/ReleaseCalendar.tsx) и [`components/Schedule.tsx`](components/Schedule.tsx).
- Стили SDK импортируют эти клиентские компоненты; Next.js убирает дубли. Можно и один раз импортировать их в
  `app/layout.tsx`.

## Что показывает демо

- **Общий снимок.** [`components/releaseData.ts`](components/releaseData.ts) задаёт один `today`, `Europe/Moscow` и
  `ru-RU` для сервера и клиента, поэтому первый клиентский рендер совпадает с HTML.
- **Загрузка видимого диапазона.** `onVisibleRangeChange` вызывается после commit для каждой новой тройки
  `(start, end, timeZone)`. Первый вызов повторяет предзагруженный диапазон и обслуживается из кэша, поэтому ничего не
  запрашивается дважды. Новый месяц показывает `loading/refresh` с прежними записями, более новый диапазон отменяет старый
  запрос, а «Сбой следующего запроса» даёт `error/refresh` со встроенной кнопкой повтора (`onRetryRequest`).
  «Очистить кэш и загрузить заново» показывает `loading/initial`.
- **Контролируемые навигация и agenda.** `anchorDate`/`onNavigate` и `agendaDate`/`onAgendaDateChange` хранятся в
  состоянии приложения. Активация уже принятого дня открывает его agenda без callback.
- **Payload события.** `onItemPress` получает item с типизированным `data`, нажатую `date`, `view` и в сетке —
  `segmentRange`; демо выводит его.
- **Язык.** Переключатель меняет `locale` между `ru-RU` и `en-US`; вместе с ним меняются каталог сообщений и первый день
  недели, поэтому меняется видимый диапазон и загружается новый.
- **Без снимка `today`.** Quick start не передаёт `today`: сервер рендерит кнопку «Сегодня» неактивной, а клиент
  включает её после гидрации по часам пользователя.
- **Адаптивная страница.** Календарь оставляет `layout="auto"` по умолчанию, а у страницы на телефоне узкие поля, поэтому
  одно и то же демо — desktop-месяц с popover на широком экране и mobile-месяц с повесткой под ним на телефоне.
- **Цветовая схема.** `colorScheme="system"` календаря по умолчанию следует светлым или тёмным предпочтениям пользователя,
  страница тоже ([`app.css`](app/app.css)).
- **Тихое состояние демо.** Видимый диапазон, просматриваемый день и последний payload `onItemPress` — обычный текст, а не
  live regions: календарь сам объявляет свои изменения, и демо с ним не конкурирует.

`components/Schedule.tsx`, `components/ReleaseCalendar.tsx`, `components/releaseData.ts`, `components/Workspace.tsx` и
`app/app.css` побайтно
совпадают с примером на Vite.

## Маршрут `/workspace`

[`components/Workspace.tsx`](components/Workspace.tsx) собирает интеграции alpha.2 на одной странице (её рендерит [`app/workspace/page.tsx`](app/workspace/page.tsx)):

- **Layouts.** Один select переключает `layout` между `auto` (по умолчанию), `desktop` и `mobile`, другой —
  `agendaPresentation` между повесткой под mobile-сеткой и модальным sheet. Сузьте окно, чтобы увидеть переключение `auto`
  на content-box 640 px.
- **Действия items.** `getItemActions` предлагает «Отметить выполненной» и «Удалить»; `onItemActionRequest` меняет
  собственные `items` приложения. На desktop действия — menu рядом со строкой повестки, на телефоне — action sheet.
- **Sources с отложенным принятием.** Три sources с цветами; переключатель только отправляет `onVisibleSourceIdsChange`,
  имитация сервиса настроек сохраняет фильтр через 500 мс, и лишь тогда календарь скрывает items. Item без `calendarId` и
  item с неизвестным `calendarId` остаются видимыми всегда; для второго development-сборка печатает одно документированное
  предупреждение `items[5].calendarId` (нет source с ID `archive-2025`) — единственное сообщение console на этом маршруте.
- **Тема и slots.** `neutralTheme` с `tokens`, `classNames` для выполненных items и today, пассивное содержимое `renderItem` и
  `renderAgendaItem` из `data` и собственная кнопка в расширении toolbar (`aria-pressed`), переключающая density.
- **ShadowRoot.** «В ShadowRoot» рендерит тот же календарь внутри открытого shadow root, который получает копии таблиц
  стилей документа (вместе с `styles.css`), и передаёт этот root в `portalContainer`, поэтому popover и sheets тоже получают тему.
  `aria-labelledby` разрешается только в tree scope самого календаря, а заголовок страницы остаётся в документе, поэтому в этом
  режиме пример называет календарь через `aria-label`; ссылка через границу дерева была бы проигнорирована с предупреждением в development.

## Ограничения alpha.2

`/`, `/quick-start` и `/streaming` используют `layout="auto"` по умолчанию: в широком окне календарь — сетка из семи колонок с
повесткой в popover; на телефоне, и вообще когда content-box самого календаря уже `mobileBreakpoint` (640 px, то есть 672 px
для корня с padding 16 px по умолчанию), — компактный mobile-месяц с повесткой просматриваемого дня под ним. Действия items,
sources, `neutralTheme`, slots и `portalContainer` показаны на `/workspace`. Выделение, создание и перенос событий
запланированы на `0.2.0-beta.1`. Props вне текущего среза типизированы как недоступные и во время выполнения игнорируются с
предупреждением в development. Пакет ещё не опубликован, сертификации screen readers и физических устройств нет.

## Квалификация пакета

`npm run check:package` в корне репозитория копирует этот каталог во временную изолированную папку, ставит только что
собранный архив с проверкой integrity, проверяет публичные декларации TypeScript 5.9.3 и минимальной поддерживаемой
5.4.5 (`typescript-5`, `typescript-min`), выполняет `next build` (он проверяет типы приложения TypeScript 6) и проходит
production-сервер в Chrome. Файлы-пробы этой проверки, например Server Component с прямым импортом `Calendar`, лежат в
`scripts/implementation/packed-probes` и в пример не входят.
