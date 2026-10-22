# T18 — neutral theme, полный styling/slots contract и RTL

19 октября 2026. Checkout собирает **`@nelmad/calendar@0.2.0-alpha.2` (не выпущен, в работе)**. T18 добавляет в публичный
срез alpha.2 вторую тему `neutralTheme`, оформление items по source и `getItemAppearance`, content slots
(`renderItem`, `renderAgendaItem`, `renderDayHeader`, `renderToolbarContent`, `renderLoading`, `renderEmpty`,
`renderError`), `classNames` и стабильные `data-*` attributes по нормативной таблице §5.7. Следующий этап — T19
(alpha.2 acceptance).

Основание: карточка плана T18, спецификация draft v7 §4.2, §5.7 (slot/class contexts, таблица `data-*`), §10, RTL-части
§8 и §12, строки R15 (subcheck R15.2), R35 (subcheck R35.2), R51, R60 (таблица), R61, R62, R63 и повторная проверка
R33/R34. Снимок дерева до изменений: `scratchpad/snapshots/T18-before`; он сделан до первой попытки, поэтому diff покрывает
все попытки. Brief T03 для этого advanced epic уже есть: [customization](t03-brief-customization.md) (решение `iterate`,
первый prerelease epic — alpha.2). Его не меняли.

Задача выполнялась в четыре захода: три прерывались (дважды сон машины, затем истёкший токен). Работа предыдущих
заходов пересмотрена, а не принята на веру: незавершённые проверки (`R60`, `R63`, Chrome probe) доведены, найденный
Chrome probe дефект исправлен (см. «Найденное»).

## Дизайн

Разделение прежнее: чистое ядро решает, что показывать, React-слой владеет DOM, focus и portal, private primitives
дают theme root и controls.

- **Тема ([`themes/neutral.ts`](../../src/v02/themes/neutral.ts), [CSS](../../src/v02/styles.css)).** `neutralTheme` —
  замороженный opaque preset `{name: 'neutral'}`, как `classicTheme`. Validation сравнивает identity, а не имя или форму
  объекта. `themeName()` даёт литерал `data-theme`; contract shell всегда `classic` (§4.3.2). Defaults neutral лежат в
  `styles.css` под `:where(.nc-theme[data-theme="neutral"])` для light, dark и system-dark. Правила с нулевой
  специфичностью, поэтому scoped CSS, `tokens` и root `style` их переопределяют. Тема задаёт цвета, радиусы, тень и
  motion, но не density-переменные: theme и density независимы. Типографику обе темы наследуют от приложения.
- **Значения CSS ([`core/cssValue.ts`](../../src/v02/core/cssValue.ts)).** Структурная проверка «ровно одно значение
  декларации без `url(`» (решение 3 спецификации v7) вынесена из `classic.ts` в ядро без изменений. Ей пользуются tokens и
  цвета items.
- **Appearance ([`core/appearance.ts`](../../src/v02/core/appearance.ts)).** `createAppearanceResolver(getItemAppearance,
  timeZone)` возвращает для validated record (item + известный source) один `ResolvedAppearance`: `sourceAccent`,
  `accent`, `background`, `text`. Resolver получает только item и `{timeZone, source?}`, без segment и даты, и
  вызывается не больше одного раза на record и identity resolver. Поэтому все segments и строка повестки делят один
  результат (R35). Каждое поле независимо: `undefined`, не-строка, пустая после `trim` строка и строка, которая не
  является одним значением декларации, означают отсутствие override. Кроме `undefined`, они дают одну development
  diagnostic на record. Неизвестный или невалидный source отброшен validation (T05), item получает base accent.
  Diagnostics — данные для commit effect, как diagnostics messages (QA-23).
- **Слои цвета в DOM ([`calendar/slots.tsx`](../../src/v02/calendar/slots.tsx)).** Accent marker — package-owned
  `span` у inline-start каждого segment и строки повестки: внешний span с `color` source, внутренний — с `color`
  resolver, полоса — `border-inline-start` в `currentcolor`, а theme accent приходит из stylesheet. Каждый слой — отдельная
  CSS-декларация цвета. Значение, которое UA отвергает при присваивании, не заменяет нижний слой; значение, ставшее
  invalid at computed-value time, подчиняется CSS. Фон и текст пишутся inline на поверхность item (`surfaceStyle`).
  Source selector показывает точку цвета source.
- **Slots и classNames.** `resolveClass` принимает строку или pure callback; результат, не являющийся непустой строкой,
  класса не добавляет. Validation отклоняет `classNames` не-объект и поле не строку/функцию как contract error (§4.3).
  Тринадцать поверхностей получают свой точный state: data-only контексты (`toolbar`, `sourceSelector`, `grid`,
  `weekdayHeader`, `day`, `dayHeader`, `item`, `itemActions`, `overflowIndicator`, `agenda`, `agendaItem`) никогда не
  видят contract branch; contract shell вызывает только `root` и `status`. `classNames.itemActions` вызывается лишь для
  отрисованного trigger. `renderItem` и `classNames.item` вызываются один раз на точный `segmentRange`. Custom строка
  повестки заменяет только видимое содержимое: default summary остаётся visually hidden именем press-control
  (`aria-labelledby`), custom content его описывает (`aria-describedby`), trigger `…` остаётся соседом поверхности.
  `renderDayHeader` заменяет только видимый заголовок, у ячейки остаётся полное имя. `renderToolbarContent` — отдельная
  область после controls пакета. State slots заменяют только тело своего region; стандартный retry показывается только
  для `kind="data"` без custom body.
- **Passive content.** Item/day slot content рендерится внутри package-owned wrapper `[data-nc-slot]` (private
  marker). После каждого commit development effect (`usePassiveDiagnostics`) проверяет фактических DOM descendants
  wrappers в grid и повестке, включая её portal: ссылки, controls, `contenteditable`, любой `tabindex`, widget roles,
  inline handlers. Предупреждение одно на slot. Это best-effort: portals, shadow trees и поздние mutations внутри consumer
  content не видны. Production build effect не регистрирует.
- **`data-*` (§5.7).** Атрибуты таблицы стоят только на её элементах. Убраны дубли: `data-presentation` у action/source
  sheets (теперь только у DayAgenda; общая разметка sheets держится на классе `nc-action-sheet`) и `data-selected`,
  который React Aria ставит на `menuitemcheckbox` и label checkbox (`withoutSelected` в private primitives; состояние
  остаётся в `aria-checked`/нативном `checked`). Portal theme root получает `data-theme` своего Calendar.
- **Portal mirror.** Mirror T16 теперь наблюдает и `ResizeObserver` корня, пока portal открыт: Calendar с явным
  `layout` ширину не измеряет, а checkpoint «owner resize» обязателен (R61). Новое в этом заходе: до первого mirror
  portal theme root несёт private `data-nc-mirror-pending`, под которым transitions выключены. После записи значений
  стиль пересчитывается (`offsetHeight`) и атрибут снимается. Иначе descendants, чей стиль уже был вычислен с preset
  defaults, плавно перетекали к зеркальным значениям после показа (см. «Найденное»).
- **Forced colors и reduced motion.** В forced colors accent markers и точки sources рисуются `CanvasText`, items
  сохраняют системную рамку, focus виден; цвета темы, tokens, source и resolver не сохраняются. Reduced motion выключает
  transitions и анимации независимо от `motion.duration`.
- **Surface gate ([`surface.ts`](../../src/v02/surface.ts), [`public.ts`](../../src/v02/public.ts), [`index.ts`](../../src/index.ts)).**
  Приняты `getItemAppearance`, `classNames` и семь render slots; `neutralTheme` — четвёртое root value. Экспортированы
  типы, достижимые из среза: `CalendarItemAppearance`, `CalendarItemAppearanceContext`, `CalendarRootState`,
  `CalendarResolvedLayout`, `CalendarResolvedAgendaPresentation`, `CalendarDayState`, `CalendarItemView`, slot contexts
  (`CalendarItemSlotContext`, Month/agenda ветви, toolbar/loading/empty/error), `CalendarAgendaState`,
  `CalendarOverflowState`, `CalendarClassName`, `CalendarClassNames`, `CalendarDataAttribute`. Недоступными до beta.1
  остаются selection, move и `interactionPolicy`.

## Интерпретации

- **Цвет, не являющийся одним значением декларации.** Решение 3 v7 сформулировано для `tokens`. Для
  `CalendarSource.color` и полей appearance применяется то же структурное правило: значение с `;`/`!` на верхнем уровне,
  несбалансированными скобками, кавычками или комментариями либо с `url(` считается отсутствующим, с development warning.
  Иначе React записал бы его в серверный `style` как дополнительные декларации, а клиент отверг бы целиком, и R63
  («server и first client declarations совпадают») нарушался бы. Это не проверка цвета: `not-a-color` проходит и
  отвергается CSS engine. *22 октября 2026: утверждено [решением 2](decisions-2026-10-22.md#decision-2) spec draft v8
  (§10.3.3), T18-V1-03 закрыт.*
- **`classNames` не того типа.** Как и render slots/resolvers не-функции (T05), `classNames` не-объект или поле не
  строка/функция — consumer contract error с именем поля. Результат callback, не являющийся непустой строкой, ошибкой не
  считается и класса не добавляет: callback вызывается во время render, и его значение не проверяется до commit.
- **`isDisabled`.** Month segment предлагает только primary press (действия — в повестке, move — T23), поэтому
  `isDisabled = !onItemPress`. Строка повестки disabled, если нет ни press, ни committed действий.
- **Custom строка повестки.** Видимое содержимое заменяется, а default summary (название, время, source) остаётся
  скрытым именем control. Это читается как «базовый accessible summary остаётся» §10.4; custom content становится
  описанием, а не частью имени, чтобы имя не дублировалось. *Заменено в T19 (WCAG 2.5.3): имя — сводка, затем видимое
  содержимое; 22 октября 2026 утверждено [решением 4](decisions-2026-10-22.md#decision-4) spec draft v8 (§12.1).*
- **Hover строки повестки.** Фон из `getItemAppearance` пишется inline, и прежнее правило hover (`background-color` через
  item tokens) его не перекрывало бы. Hover и press теперь тонируют собственные цвета item полупрозрачным `currentcolor`
  поверх фона (`background-image`), а сам канал фона остаётся resolved значением. Accent marker — декоративный пустой узел
  без текста, `aria-hidden` ему не нужен.

## Реализация

- Ядро: [`appearance.ts`](../../src/v02/core/appearance.ts), [`cssValue.ts`](../../src/v02/core/cssValue.ts),
  [`validation.ts`](../../src/v02/core/validation.ts) (`classNames`).
- Темы: [`neutral.ts`](../../src/v02/themes/neutral.ts), [`classic.ts`](../../src/v02/themes/classic.ts) (проверка
  значений вынесена в ядро).
- React: [`slots.tsx`](../../src/v02/calendar/slots.tsx) (новый: classes, `SlotContent`, accent marker, diagnostics),
  [`MonthView.tsx`](../../src/v02/calendar/MonthView.tsx), [`DayAgendaBody.tsx`](../../src/v02/calendar/DayAgendaBody.tsx),
  [`CalendarShell.tsx`](../../src/v02/calendar/CalendarShell.tsx), [`CalendarMonth.tsx`](../../src/v02/calendar/CalendarMonth.tsx),
  [`SourceSelector.tsx`](../../src/v02/calendar/SourceSelector.tsx), [`overlays.tsx`](../../src/v02/calendar/overlays.tsx),
  [`model.ts`](../../src/v02/calendar/model.ts) (стадия `appearance`), [`useCalendarController.ts`](../../src/v02/calendar/useCalendarController.ts)
  (diagnostics цветов).
- Primitives: [`ThemeRoot.tsx`](../../src/v02/primitives/ThemeRoot.tsx) (`theme`), [`PortalTheme.tsx`](../../src/v02/primitives/PortalTheme.tsx)
  (owner `ResizeObserver`, transitions до первого mirror), [`controls.tsx`](../../src/v02/primitives/controls.tsx) и
  [`overlays.tsx`](../../src/v02/primitives/overlays.tsx) (`withoutSelected`). [CSS](../../src/v02/styles.css): neutral
  light/dark/system, accent marker, точка source, toolbar extension, custom header, mirror-pending, forced colors.
- Surface/package: [`surface.ts`](../../src/v02/surface.ts), [`public.ts`](../../src/v02/public.ts), [`index.ts`](../../src/index.ts),
  [`verify-dist.mjs`](../../scripts/verify-dist.mjs) (четыре root values, новые props и типы, `neutralTheme` в
  declarations и ESM/CJS, одинаковый SSR neutral/classNames/toolbar slot в обоих форматах, gate на beta.1 props). Public
  fixtures: [positive](../../tests/contracts/public/positive.ts) и [negative](../../tests/contracts/public/negative.ts)
  (контексты slots/classes, data-only ветви без contract, appearance, поля не того типа). CommonJS
  [`require.cts`](../../scripts/implementation/packed-probes/shared/require.cts), smoke в
  [`packed-consumers.mjs`](../../scripts/implementation/packed-consumers.mjs). [API report](../api/calendar.api.md).
- Документация: [API](../api.md)/[API ru](../api.ru.md) — `neutralTheme`, `getItemAppearance`, `classNames`, семь
  slots, таблица `data-*`, типы, diagnostics; исправлены устаревшие строки о `calendarId` и `CalendarSource.color`.
  [README](../../README.md)/[README ru](../../README.ru.md) — темы, оформление, slots, экспорты, ограничения.
  [Migration](../migration-0.1-to-0.2.md)/[ru](../migration-0.1-to-0.2.ru.md): `variant` → `getItemAppearance`, цвет
  проекта → `CalendarSource.color`. [CHANGELOG](../../CHANGELOG.md). Story [`Theming`](../../stories/Theming.stories.tsx)
  получила `Presets`. Self-test docs gate проверяет «недоступный prop» на beta.1 props. Полировка guides/examples — T19.
- Harness: [`themes-slots-probe.mjs`](../../scripts/implementation/themes-slots-probe.mjs) +
  [entry](../../scripts/implementation/themes-slots-entry.tsx) (только публичный facade). В
  [`actions-sources-probe.mjs`](../../scripts/implementation/actions-sources-probe.mjs) source sheet теперь находится по id
  своего dialog, а не по `data-presentation`, который по таблице §5.7 принадлежит только DayAgenda; assertion прежний.
  В [`month-probe.mjs`](../../scripts/implementation/month-probe.mjs) проверка hover строки повестки (QA-15) переписана на
  overlay-тонирование (см. «Найденное»).
  [`verify-foundation.mjs`](../../scripts/implementation/verify-foundation.mjs): sourcePaths, syntax probe, scope.

## Проверки

- **Unit/React: 803 tests в 44 suites** (было 766 в 40, +37). Новые suites:
  [`appearance.test.ts`](../../src/v02/core/__tests__/appearance.test.ts) (5: значения, слои, контекст resolver, один
  результат на record, diagnostics), [`neutral.test.tsx`](../../src/v02/themes/__tests__/neutral.test.tsx) (6: identity
  preset, полный набор переменных в каждой комбинации, независимость theme/density, отличия только в цветах/радиусах/тени/
  motion, dark = system-dark, WCAG-контраст текста, состояний, границ и focus),
  [`slots.test.tsx`](../../src/v02/calendar/__tests__/slots.test.tsx) (16: R35.2, custom строка повестки, `isDisabled`,
  day header, toolbar, state slots, все `classNames` с точными state, contract shell только `root`/`status`, результат не
  строка, passive diagnostics и production, каналы R62, R63-предупреждения, точки sources, темы portals),
  [`attributes.test.tsx`](../../src/v02/calendar/__tests__/attributes.test.tsx) (6: таблица R60 в data fixture, portals,
  menus, mobile sheet/inline, две темы, contract shell; R63 SSR → hydration; owner resize checkpoint mirror). Также R15.2
  (`ar`, `en-US dir=rtl`, StrictMode) в [`month.test.tsx`](../../src/v02/calendar/__tests__/month.test.tsx) и два теста
  mirror-pending в [`opening.test.tsx`](../../src/v02/calendar/__tests__/opening.test.tsx). Тесты среза alpha.2 в
  `surface.test.tsx`, `surface.ssr.test.tsx`, `diagnostics.test.tsx` переписаны на новый срез (slots приняты, gate
  проверяется на beta.1 props), а не удалены.
- **Мутационные проверки** (временное изменение, откат, вывод сохранён): `classNames.itemActions`, вычисляемый для
  каждой строки, — падает «runs only for a rendered actions trigger» (вывод (`evidence/t18/mutation-eager-item-actions-class.txt`));
  без `data-nc-mirror-pending` — падают оба новых теста mirror-pending (вывод (`evidence/t18/mutation-without-mirror-pending.txt`)).
- **Chrome, T18 probe** — **24/24** (`evidence/t18/themes-slots/browser.json`), ноль page/console errors. Chrome
  155.0.8059.84, Node 24.20.0, публичный Calendar в development StrictMode (без него только там, где нужны точные числа
  вызовов), SSR + hydration без recoverable errors, source hashes в отчёте:
  - §10.2: classic/neutral × compact/comfortable × system/light/dark (system — со светлым и тёмным предпочтением, 16
    вариантов): атрибуты точные, accessibility tree одинаковый, контраст текста ≥ 4.5, тема не трогает density, dark =
    system-dark;
  - R61 — Document/ShadowRoot: 27 sentinel paths пишут точные kebab-case переменные; scoped CSS < `tokens` < root `style`;
    `!important` по каскаду; portal скрыт до mirror, initial focus видит зеркальные значения, все 27 переменных и 7
    свойств шрифта равны корню, непубличные свойства не копируются, после показа в portal нет transitions;
    checkpoints: commit владельца, resize владельца при явном layout, resize окна, `prefers-color-scheme`,
    `prefers-reduced-motion`, `forced-colors`; изолированная мутация stylesheet видна после следующего render владельца;
  - R62 — Document/ShadowRoot × LTR `en-US`/RTL `ar`: source меняет только accent, каждое поле resolver — свой канал,
    item без source и с неизвестным source — base accent, оба week segments и строка повестки одного цвета, transitions
    после открытия повестки нет, контекст resolver — `timeZone` и известный source, точки sources в menu;
  - R63: blank/не-строка/небезопасные tokens, source colors и поля appearance — по одному warning на путь, серверная
    разметка и первый client render дают одинаковые декларации, contract error и callbacks нет, `not-a-color` передан
    как есть, отвергнутые UA цвета оставляют нижний слой, `var(--missing)` — стандартная CSS semantics; бесконечная
    высота item или gap — ноль lanes и доступный `+N` на каждой дате, нулевая высота — минимум пакета без потери items,
    hit area открывает свою дату;
  - R35.2: `renderItem` и `classNames.item` один раз на точный `segmentRange`, контекст класса = контекст slot, press по
    каждой части bar даёт свою дату, slots повестки один раз на строку с датой повестки, resolver один раз на item,
    имя строки — default summary, описание — custom content;
  - R51 — classic LTR (Document) + neutral RTL dark comfortable (Document и ShadowRoot, явные portal containers) с custom
    slots: один Tab-вход в каждую grid, actions не вложены в кнопку item, каждый portal и вложенное menu сохраняют тему
    своего Calendar, toolbar extension и retry названы и идут своим Tab-порядком, custom data-error body заменяет retry;
  - R60: root, ячейки, Month items, popover повестки, item menu, source menu, второй Calendar с другой темой, состояния
    loading initial/refresh, error и contract — каждый атрибут только на своём элементе, с точным литералом;
  - R15.2 — Document/ShadowRoot × `ar`/`en-US dir=rtl`: стрелки по визуальному направлению, Home/End — визуальные края
    строки, задержанный PageDown держит 31 января и после acceptance даёт 28 февраля, позднее acceptance после Tab не
    забирает focus;
  - R33: одинаковые items и comparator `0` — порядок по `id` в grid и повестке, `+N` считает только прошедшие фильтр
    records, имеет свою строку в ячейке и согласован в первом кадре после resize при 0, 1 и нескольких lanes, один
    `moreItemsLabel`, indicator не цель Tab/AT, hit area активирует дату один раз; R34: обратный comparator — один порядок
    во всех неделях, continuation lanes и повестке, контекст ровно `{timeZone}`;
  - §10.4: ссылка в `renderItem` — одно предупреждение; passive content — одна Tab-остановка в grid, имя ячейки целое;
    forced colors и reduced motion.
- **Регрессии на финальном коде** (Chrome, ноль page errors): actions/sources **25/25** (`evidence/t18/actions-sources/browser.json`),
  overlay **48/48** (`evidence/t18/overlay/browser.json`), responsive **115/115** (`evidence/t18/responsive/browser.json`),
  Month **67/67** (`evidence/t18/month/browser.json`), agenda **72/72** (`evidence/t18/agenda/browser.json`), controller
  **59/59** (`evidence/t18/controller/browser.json`), foundation **108/108** (`evidence/t18/foundation/browser.json`), host
  **41/41** (`evidence/t18/host/browser.json`), story smoke **2/2** (`evidence/t18/stories/manifest.json`). Статусы прогонов —
  run-status (`evidence/t18/run-status.txt`).
- **Packed:** packed consumers (`evidence/t18/packed/manifest.json`) **56/56** и acceptance T14 в режиме
  alpha.2 (`evidence/t18/acceptance-alpha2/manifest.json`) **165/165** на одном packed `0.2.0-alpha.2`, integrity
  `sha512-uYX/tYllHqJOQtTBBcM1O33wt3oZ/bgwWshHC6s13V+SOk5l9EcSB8SPGvg0lw1vZ8W4dwg/4rlacQJBt+1uPA==`. Vite/React 18 и
  Next/React 19, public types TS 5.4.5/5.9.3 × bundler/NodeNext с fixtures slots/classes/appearance, ESM/CJS smoke
  `neutralTheme` и одинакового SSR со slots, SSR/hydration, keyboard, axe без нарушений в package-owned UI.
- **Общая регрессия:** manifest (`evidence/validation-2026-10-09-t18/manifest.json`) — **27/27 checks, 803 tests в 44 suites**
  (requirements, timezones/transitions, typecheck, library build с dist verification, API report, docs gate и self-test,
  Storybook types/build, reference и public types TS 5.4.5/5.9.3, lint, tests, четыре host timezone, syntax harness,
  включая T18 probe). Запущен после обновления ledger: hash ledger в manifest совпадает с поставленным файлом.
- Отдельно прошли `typecheck`, `typecheck:storybook`, `lint`, `test`, `build` (dist verification), `typecheck:contract`
  (TypeScript 5.9.3 и 5.4.5), `check:requirements`, `check:timezones`, `check:transitions`, `check:docs`, `check:api`,
  `build-storybook`.

### Найденное и неудачные прогоны

Сохранены рядом с финальными:

- `themes-slots-attempt-1-mirror-transition` (`evidence/t18/themes-slots-attempt-1-mirror-transition/browser.json`) — 20/24,
  прогон предыдущего захода (18 октября, его source hashes). Три падения R62 — **реальный дефект**: строка повестки после
  открытия ещё ~150 ms перетекала от preset-фона `rgb(242, 240, 236)` к фону из `tokens` `rgb(240, 241, 242)`. Причина:
  стиль descendants portal вычислялся до первого mirror, а смена переменных запускала transition `.nc-button`. Исправлено
  (`data-nc-mirror-pending`), покрыто jsdom (оба presentation) и Chrome (нет transitions в portal после показа, R61/R62).
  Четвёртое падение (R62 RTL) — timeout `setContent` 4 s под нагрузкой; в финальном прогоне сценарий проходит.
- `actions-sources-attempt-1-sheet-locator` (`evidence/t18/actions-sources-attempt-1-sheet-locator/browser.json`) — 23/25,
  ошибка ожидания harness: probe T17 искал source sheet по `data-presentation`, который T18 по таблице §5.7 убрал с
  action/source sheets. Locator заменён на id dialog, assertion не менялся.
- `month-attempt-1-hover-overlay` (`evidence/t18/month-attempt-1-hover-overlay/browser.json`) — 66/67, устаревшее ожидание
  QA-15: проверка требовала, чтобы hover строки повестки менял `background-color`. T18 намеренно тонирует hover
  `background-image` поверх фона item (иначе inline-фон из `getItemAppearance` терял бы feedback, см. «Интерпретации»).
  Проверка теперь требует `data-hovered`, неизменный канал фона и overlay-градиент, которого до hover нет.

Screenshots просмотрены: темы (`evidence/t18/themes-slots/theme-neutral-dark-comfortable.png`) (classic/neutral × light/dark),
R62 Month (`evidence/t18/themes-slots/r62-month-appearance.png`), R62 RTL повестка (`evidence/t18/themes-slots/r62-rtl-agenda-appearance.png`),
R51 (`evidence/t18/themes-slots/r51-two-calendars.png`), R61 portal (`evidence/t18/themes-slots/r61-sentinel-portal.png`),
R15.2 (`evidence/t18/themes-slots/r15-rtl-ar.png`), forced colors (`evidence/t18/themes-slots/forced-colors.png`). Accent
marker стоит у inline-start и зеркалится в RTL, оба куска bar одного цвета, точки sources видны в menu. В R51 светлые
цвета appearance fixture на тёмной neutral теме дают низкий контраст текста item: это consumer-owned цвета (§10.3.3,
§12), fixture намеренно не подбирает их под тему.

Ledger: **`pass`** — R15.2, R35.2, R51, R61, R62, R63, R33 и R34 (повторная проверка comparator rows; закрыт пробел
«подсчёт после фильтра sources» из QA-D). Блоки §4.2, §10.1 (кроме reference-кода с selection/move в `core/`), §10.2,
§10.3.1, §10.3.2, §10.3.3 (кроме блока о state markers), §10.3.4 о theme root, checkpoints, шрифте и colorScheme/motion,
§10.4 о slots, границах composition, типах контекста, `classNames`/`data-*` и отсутствии headless API. **`in_progress`**:
R60 (beta.1: true-состояния selection/drag/pending), R15 и R35 (beta.1 subchecks), §10.4 о `isSelected`/`isDragging`/
`isPending`, drag semantics и запрещённых примерах в guides (T19), §10.3.3 о pending/drag markers, §10.3.4 о CSP
(открытый вопрос lead, не менялся; *22 октября 2026 закрыт [решением 3](decisions-2026-10-22.md#decision-3) spec draft v8,
блок `S10.3.4-d80012de1d2a` — `pass`*). Частичное evidence добавлено к §8 RTL (T24) и §12.5 контраст/motion (T28).

```sh
npm ci && npm ci --prefix scripts/implementation/spikes
npm test -- src/v02/core/__tests__/appearance.test.ts src/v02/themes/__tests__/neutral.test.tsx src/v02/calendar/__tests__/slots.test.tsx src/v02/calendar/__tests__/attributes.test.tsx
node scripts/implementation/themes-slots-probe.mjs /private/tmp/calendar-t18-themes-slots
for probe in actions-sources overlay responsive month agenda controller foundation host; do node scripts/implementation/$probe-probe.mjs /private/tmp/calendar-t18-$probe; done
npm run build-storybook && node scripts/implementation/portal-stories-check.mjs /private/tmp/calendar-t18-stories
node scripts/implementation/packed-consumers.mjs --output=/private/tmp/calendar-t18-packed
node scripts/implementation/alpha-acceptance.mjs --milestone=alpha.2 --output=/private/tmp/calendar-t18-acceptance
node scripts/implementation/verify-foundation.mjs /private/tmp/calendar-t18-validation
```

## Границы

- Selection, drag и move: `isSelected`/`isDragging`/`isPending` в контекстах всегда `false`, атрибуты
  `data-selected`/`data-selection-draft`/`data-selection-unavailable`/`data-dragging`/`data-pending` не появляются до
  beta.1 (T20–T24). R60 остаётся `in_progress`.
- Diagnostics passive content best-effort: portals, shadow trees, поздние mutations и React-обработчики без следа в DOM не
  видны. Контраст consumer-цветов и доступность собственного содержимого slots — ответственность потребителя.
- Prerelease-проверка, не stable gate: manual AT, Firefox/Safari, физические устройства, полная axe/контраст-матрица
  обеих тем (T19/T28) не выполнены. Публикация `0.2.0-alpha.1`/`alpha.2` не выполнялась.
- Интерпретация «цвет item, не являющийся одним значением декларации, отсутствует» распространяет решение 3 на цвета;
  её стоит подтвердить решением lead. *22 октября 2026: подтверждена [решением 2](decisions-2026-10-22.md#decision-2).*
