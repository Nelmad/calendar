# @nelmad/calendar: пример на Vite

[English version](README.md) · [Пример на Next.js](../next/README.ru.md)

Запускаемое приложение React 18 + Vite 6 с серверным рендерингом. Использует только публичный API
`@nelmad/calendar` `0.2.0-alpha.2`: корень пакета и `@nelmad/calendar/styles.css`.

| Маршрут | Что показывает |
| --- | --- |
| `/quick-start` | [`src/Schedule.tsx`](src/Schedule.tsx) — quick start из README пакета: записи, контролируемая навигация, `onItemPress`. Рендерится на сервере и гидрируется. |
| `/` | [`src/ReleaseCalendar.tsx`](src/ReleaseCalendar.tsx) — полная интеграция alpha.2, описанная ниже. |
| `/workspace` | [`src/Workspace.tsx`](src/Workspace.tsx) — интеграции alpha.2: layouts, действия, sources, тема и slots, ShadowRoot (ниже). |

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
cd examples/vite
npm install ../calendar.tgz
npm run build
npm start              # http://127.0.0.1:4173 (порт меняется через PORT)
```

`npm install ../calendar.tgz` ставит закреплённый граф зависимостей из `package-lock.json` и заменяет записанную для
архива integrity на хеш вашей сборки. Не используйте `npm ci` со свежим архивом: в lockfile остаётся хеш последнего
проверенного архива, и npm может поставить его копию из кэша вместо вашей.

`npm run dev` запускает dev-сервер Vite без SSR: клиент сам рендерит демо и показывает начальную загрузку, пока не
придёт первый диапазон.

### После публикации: версия из registry

```sh
npm install @nelmad/calendar@0.2.0-alpha.2
npm run build && npm start
```

Команда заменяет зависимость `file:../calendar.tgz`. Версия ещё не опубликована — до публикации используйте архив.

## Что показывает демо

- **Серверная предзагрузка.** [`src/entry-server.tsx`](src/entry-server.tsx) вычисляет первый диапазон сетки через
  `getCalendarVisibleRange({anchorDate, timeZone, locale})`, загружает его из имитации backend и рендерит HTML уже с
  записями. [`server.mjs`](server.mjs) рендерит на сервере все маршруты и встраивает данные `/` как JSON;
  [`src/main.tsx`](src/main.tsx) гидрирует всё, что отрендерил сервер (на `/` — с этими данными), и рендерит на клиенте,
  только когда серверного HTML нет (`npm run dev`).
- **Общий снимок.** [`src/releaseData.ts`](src/releaseData.ts) задаёт один `today`, `Europe/Moscow` и `ru-RU` для
  сервера и клиента, поэтому первый клиентский рендер совпадает с HTML.
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
- **Адаптивная страница.** Календарь оставляет `layout="auto"` по умолчанию, а у страницы на телефоне узкие поля, поэтому
  одно и то же демо — desktop-месяц с popover на широком экране и mobile-месяц с повесткой под ним на телефоне.
- **Цветовая схема.** `colorScheme="system"` календаря по умолчанию следует светлым или тёмным предпочтениям пользователя,
  страница тоже ([`app.css`](src/app.css)).
- **Тихое состояние демо.** Видимый диапазон, просматриваемый день и последний payload `onItemPress` — обычный текст, а не
  live regions: календарь сам объявляет свои изменения, и демо с ним не конкурирует.

`src/Schedule.tsx`, `src/ReleaseCalendar.tsx`, `src/releaseData.ts`, `src/Workspace.tsx` и `src/app.css` побайтно совпадают с файлами
примера на Next.js. Они начинаются с `'use client'` для Next.js; [`vite.config.mjs`](vite.config.mjs) затирает эту
директиву, потому что в Vite нет Server Components.

## Маршрут `/workspace`

[`src/Workspace.tsx`](src/Workspace.tsx) собирает интеграции alpha.2 на одной странице:

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

`/`, `/quick-start` используют `layout="auto"` по умолчанию: в широком окне календарь — сетка из семи колонок с
повесткой в popover; на телефоне, и вообще когда content-box самого календаря уже `mobileBreakpoint` (640 px, то есть 672 px
для корня с padding 16 px по умолчанию), — компактный mobile-месяц с повесткой просматриваемого дня под ним. Действия items,
sources, `neutralTheme`, slots и `portalContainer` показаны на `/workspace`. Выделение, создание и перенос событий
запланированы на `0.2.0-beta.1`. Props вне текущего среза типизированы как недоступные и во время выполнения игнорируются с
предупреждением в development. Пакет ещё не опубликован, сертификации screen readers и физических устройств нет.

## Квалификация пакета

`npm run check:package` в корне репозитория копирует этот каталог во временную изолированную папку, ставит только что
собранный архив с проверкой integrity, проверяет публичные декларации (`typescript` и минимальной поддерживаемой
`typescript-min`), собирает приложение и проходит его в Chrome. Файлы-пробы этой проверки лежат в
`scripts/implementation/packed-probes` и в пример не входят.
