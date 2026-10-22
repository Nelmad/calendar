# T17 — generic actions и controlled sources

17 октября 2026. Checkout собирает **`@nelmad/calendar@0.2.0-alpha.2` (не выпущен, в работе)**. T17 добавляет в публичный
срез alpha.2 действия над items (`getItemActions` + `onItemActionRequest`) и контролируемые sources (`sources`,
`visibleSourceIds` + `onVisibleSourceIdsChange`, `showSourceSelector`). Fixture-меню T16 заменено настоящими menus
пакета на том же child-overlay seam. Следующий этап — T18 (neutral theme, slots, RTL).

Основание: карточка плана T17, спецификация draft v7 §5.5, §5.6, §7, §12.2–12.4, строки R27 (subcheck R27.1), R39 и
alpha.2-части R41. Перед изменениями сделан снимок дерева `scratchpad/snapshots/T17-before`. Brief T03 для этого epic
уже есть: [sources](t03-brief-sources.md). Его не меняли.

## Дизайн

Разделение то же, что в T15/T16. Чистое ядро решает, что показывать. React-слой владеет DOM, focus и portal. Private
primitives (menu, sheet, checkbox) взяты из T09/T16.

- **Ядро действий ([`core/actions.ts`](../../src/v02/core/actions.ts)).** `createActionResolver(getItemActions)`
  возвращает committed набор действий item. Resolver вызывается не больше одного раза на объект item и identity
  `getItemActions`. Невалидные действия и все действия с повторённым `id` исключаются через `validateActions` из T05.
  Diagnostic получает путь `getItemActions("<id>").actions[i]`. Результат не-массив даёт пустой набор. Без пары
  наборов нет. `actionsPresentation(layout)` возвращает desktop → `menu`, mobile → `sheet`. Встроенный «Перенести»
  (T23) войдёт в этот же набор, параллельного menu не будет.
- **Ядро sources ([`core/sources.ts`](../../src/v02/core/sources.ts)).** `toggleSource(sources, accepted, id)`
  вычисляет следующий фильтр. В нём уникальные известные IDs в порядке `sources`. Если набор не меняется, результат
  `undefined`, и callback не вызывается. Вход — только нормализованное принятое значение из `validateRecords`, локального
  optimistic-состояния нет. `sourceSelectorShown` показывает selector при контролируемой паре и минимум двух валидных
  sources, если не задано `showSourceSelector={false}`. Validation sources, unknown-source fallback и игнорирование
  неизвестных/повторных `visibleSourceIds` уже были в T05 и теперь доступны через публичный prop.
- **Модель ([`calendar/model.ts`](../../src/v02/calendar/model.ts)).** Мемоизированные стадии `actions` (resolver по
  identity `getItemActions`, только при наличии `onItemActionRequest`) и `visible` (прошедшие принятый фильтр records по
  ID). Grid, counts, `+N`, повестка и действия читают один index видимых records. Поэтому после принятия они
  обновляются вместе и не раньше (R27.1).
- **Действия в повестке ([`calendar/overlays.tsx`](../../src/v02/calendar/overlays.tsx),
  [`DayAgendaBody.tsx`](../../src/v02/calendar/DayAgendaBody.tsx), [`CalendarMonth.tsx`](../../src/v02/calendar/CalendarMonth.tsx)).**
  Владелец повестки передаёт `ItemActionsContext`: presentation, `resolve(itemId)` по модели текущего render и
  `request(itemId, actionId)` по последней committed модели. У строки с непустым набором рядом с основной поверхностью
  стоит отдельный trigger `…`. Он не вложен в основную поверхность, его имя — `itemActionsLabel(title)`, `aria-haspopup` —
  `menu` или `dialog`. Trigger открывает child-overlay стека T16: на desktop это RAC `Menu` в немодальном popover, на
  mobile — именованный модальный sheet с кнопкой на каждое действие. Child читает набор последнего render через context,
  а не через closure момента открытия. Пустой набор закрывает surface с §12.3 шаг 2 (R41). Activation сначала закрывает
  surface, потом вызывает `onItemActionRequest` один раз, с item и действием последних committed props.
- **Source selector ([`calendar/SourceSelector.tsx`](../../src/v02/calendar/SourceSelector.tsx)).** Кнопка в toolbar
  (`sourceSelectorLabel`) рендерится через новый слот `renderToolbarControls` в [`CalendarShell`](../../src/v02/calendar/CalendarShell.tsx),
  в том числе на сервере. Selector — standalone overlay вне цепочки повестки. Desktop: RAC `Menu` с
  `selectionMode="multiple"` (`menuitemcheckbox`). `selectedKeys` берётся только из принятого фильтра, RAC предлагает набор
  с одним переключённым ключом, а решают следующие props. Mobile: `ModalSheet` с видимым заголовком и `Checkbox` на
  source. Controlled `isSelected` не даёт нативному checkbox переключиться заранее, это проверено в Chrome. Имя control —
  `hideSourceLabel`/`showSourceLabel` по принятому состоянию.
- **Standalone-слой в стеке.** `createOverlayStack` получил `setAside`. Открытый selector регистрируется как часть
  ownership Calendar (`owns`) и, если он modal, как единственный live endpoint (`liveTarget`). Цепочку повестки слой не
  трогает: focus в selector закрывает popover повестки как внешний. Controller считает focus в selector focus внутри
  Calendar.
- **Surface gate.** [`surface.ts`](../../src/v02/surface.ts) принимает шесть props. [`public.ts`](../../src/v02/public.ts)
  добавляет `CalendarSourceFilterControlProps<TSourceData>` и `CalendarItemActionsProps<TItemData>` к `CalendarProps`. Так
  сохраняются controlled-пары и независимые generics items/sources. Экспорты: `CalendarSource`, `CalendarItemAction`,
  `CalendarItemActionRequest`, `CalendarSourceFilterControlProps`, `CalendarItemActionsProps`. Отложенными остаются
  slots/appearance (T18) и selection/move/policy (beta.1).

## Интерпретации

- **Строка удалена или скрыта при открытом menu (R37 против §5.5).** R37 требует, чтобы menu, чей trigger удалён или
  отфильтрован, оставалось открытым до первого `Escape`. §5.5 требует закрывать surface, если итоговый набор стал пустым.
  Принято так: пустой набор item, который ещё показан (включая удаление пары), закрывает surface (R41). Item, который
  больше не показан (удалён или скрыт принятым фильтром), оставляет surface с последним набором до закрытия. Его
  activation запрос не отправляет: у такого item нет committed набора, а принятый фильтр исключает его actions (§5.6).
  Такое прочтение стоит подтвердить решением lead.
- **Кнопка закрытия sheets.** Каталог §5.7 не имеет общей подписи «Закрыть». Для action/source sheet используется
  `cancelLabel` («Отмена»/«Cancel»). `closeAgendaLabel` относится к повестке.
- **Возврат focus у standalone selector.** §12.3 не называет toolbar-overlay. Escape, выбор в sheet, нажатие на фон,
  смена presentation и outside press с focus, вытесненным на `body`, возвращают focus на trigger: это аналог шага 3 для
  ячейки, из которой открыта повестка. Если валидных sources стало меньше двух, trigger исчезает, и controller применяет
  общий порядок: roving-ячейка, status, toolbar, корень.
- **Удалённый focused control в открытой поверхности.** Если обновлённый набор убрал действие или source, на котором был
  focus, а surface остаётся открытой, focus переходит на первый control этой surface. Это шаг 1 без «того же control»
  внутри родителя. React Aria в этом случае фокусирует сам элемент `menu`, и `Enter` перестаёт работать. Focus, который
  ушёл из surface (нажатие на пустую область, другой узел), не возвращается.
- **Цвет source** (`CalendarSource.color`) принимается, но не отображается: оформление по source — R62/T18. Это записано
  в README и API как ограничение.

## Реализация

- Ядро: [`actions.ts`](../../src/v02/core/actions.ts), [`sources.ts`](../../src/v02/core/sources.ts).
- React: [`SourceSelector.tsx`](../../src/v02/calendar/SourceSelector.tsx) (новый), [`overlays.tsx`](../../src/v02/calendar/overlays.tsx)
  (вместо `ItemMenuContext`/`ItemMenuButton` — `ItemActionsContext`, trigger, surface, `ItemActionsContent`,
  `refocusDisplaced`/`trackSurfaceFocus`, `setAside`/`owns`, отложенное recovery). [`CalendarMonth.tsx`](../../src/v02/calendar/CalendarMonth.tsx):
  scope действий, путь запроса по последней committed модели, diagnostics resolver, `FocusKey.child`.
  [`DayAgendaBody.tsx`](../../src/v02/calendar/DayAgendaBody.tsx), [`CalendarShell.tsx`](../../src/v02/calendar/CalendarShell.tsx),
  [`model.ts`](../../src/v02/calendar/model.ts), [`useCalendarController.ts`](../../src/v02/calendar/useCalendarController.ts)
  (`owns`). [CSS](../../src/v02/styles.css): `nc-action-list`, `nc-menu-check`.
- Private seam: `ActionsPresentationContext` задаёт presentation, которую выбрал бы layout. Он нужен fixture T16, чтобы
  menu внутри inline-повестки или sheet оставалось проверяемым (overlay probe, `overlays.test.tsx`). Действия при этом
  идут через публичную пару. Публичный Calendar этот context не задаёт, в публичный API он не входит.
- Surface/package: [`surface.ts`](../../src/v02/surface.ts), [`public.ts`](../../src/v02/public.ts), [`index.ts`](../../src/index.ts),
  [`verify-dist.mjs`](../../scripts/verify-dist.mjs) (props, типы, SSR trigger selector в ESM/CJS, отсутствие warning у
  принятых props, другие future props для gate). Public fixtures: [positive](../../tests/contracts/public/positive.ts)
  (пары, generics, tones) и [negative](../../tests/contracts/public/negative.ts) (половины пар, `Set`, `showSourceSelector`
  без пары, tone, типы payload). CommonJS [`require.cts`](../../scripts/implementation/packed-probes/shared/require.cts),
  smoke в [`packed-consumers.mjs`](../../scripts/implementation/packed-consumers.mjs). [API report](../api/calendar.api.md).
- Документация: [API](../api.md)/[API ru](../api.ru.md) — шесть разделов props, пять разделов типов, таблицы callbacks
  и диагностики, раздел `unavailable` сокращён. [README](../../README.md)/[README ru](../../README.ru.md) — повестка,
  экспорты, ограничения. [Migration](../migration-0.1-to-0.2.md)/[ru](../migration-0.1-to-0.2.ru.md): `onEventEdit`/`onEventDelete`
  → действия. [CHANGELOG](../../CHANGELOG.md), README examples. В self-test docs gate пример недоступного prop заменён на
  `classNames`. Story [`ActionsSources`](../../stories/ActionsSources.stories.tsx) (desktop, mobile, задержанный
  фильтр). Полировка guides/examples — T19.
- Harness: [`actions-sources-probe.mjs`](../../scripts/implementation/actions-sources-probe.mjs) +
  [entry](../../scripts/implementation/actions-sources-entry.tsx). [`overlay-entry.tsx`](../../scripts/implementation/overlay-entry.tsx)
  и [`overlay-probe.mjs`](../../scripts/implementation/overlay-probe.mjs) переведены на публичные actions: trigger ищется по
  строке item, имена menu/sheet — `itemActionsLabel` с bidi-изоляцией. Assertions не ослаблены.
  [`verify-foundation.mjs`](../../scripts/implementation/verify-foundation.mjs): `sourcePaths`, syntax probe, scope.

## Проверки

- **Unit/React: 766 tests в 40 suites** (было 729 в 37, +37). Новые:
  [`actions.test.ts`](../../src/v02/core/__tests__/actions.test.ts) (7, ядро действий и sources),
  [`actions.test.tsx`](../../src/v02/calendar/__tests__/actions.test.tsx) (12, публичный Calendar: отдельный trigger,
  menu/sheet, один запрос в StrictMode, невалидные действия, последний committed набор и item, скрытый item, пустой
  набор, R41, удалённое focused-действие, focus, ушедший из menu), [`sources.test.tsx`](../../src/v02/calendar/__tests__/sources.test.tsx)
  (16, R27.1 desktop/mobile, отклонение, нормализация, невалидные sources, `showSourceSelector`, удаление пары,
  contract errors, Tab/outside, R41, live routing, R39 в обе стороны и внешний focus). Тесты, которые раньше
  проверяли alpha.1/T16-срез, переписаны на alpha.2, а не удалены. В `surface.test.tsx` «strips sources» заменён на «accepts
  sources and the controlled filter», добавлены «without the pair» и «accepts the item action pair». `overlays.test.tsx` и
  `overlays.subscriptions.test.tsx` идут через публичную пару; подписки на stack проверены ещё и для пары с пустыми
  наборами. Тест «sheet без enabled action фокусирует close» проверяет `ItemActionsContent` напрямую: через публичный API
  пустой набор не открывается (R41).
- **Мутационные проверки** (временный откат, выводы сохранены): без отложенного recovery дочерней поверхности — 2 падения
  (вывод (`evidence/t17/mutation-without-child-recovery-deferral.txt`)); без возврата вытесненного focus — 2
  (вывод (`evidence/t17/mutation-without-displaced-focus-refocus.txt`)); без проверки «удалён собственный focused control»
  — 1 (вывод (`evidence/t17/mutation-refocus-without-own-removal-check.txt`)).
- **Chrome, T17 probe** — **25/25** (`evidence/t17/actions-sources/browser.json`), ноль page/console errors. Chrome
  155.0.8059.84, Node 24.20.0, публичный Calendar в development StrictMode, SSR + hydration без recoverable errors, source
  hashes в отчёте:
  - SSR: trigger selector в серверном HTML (sheet-trigger для `auto`, menu для desktop), его нет при
    `showSourceSelector={false}`, одном валидном source и без пары; actions на сервере ничего не рендерят;
  - R27.1 — Document/ShadowRoot × LTR `en-US`/RTL `ar` dark: `menuitemcheckbox` сохраняют `aria-checked` и имя
    `hideSourceLabel` после переключения до acceptance; один нормализованный запрос; menu остаётся открытым; после
    acceptance — `showSourceLabel`, focus на том же control, число 5 → 4, item уходит и из другой даты, в повестке нет
    скрытого item и его trigger; items без source и с неизвестным source видны, warning один. Menu привязано к trigger и
    не выходит за viewport; `aria-controls` только у Document root;
  - R27.1/R41 mobile: sheet назван видимым `H3`, нативные checkboxes не переключаются до acceptance (`checked` прежний),
    inline-повестка следует принятому фильтру, `inert`/scroll lock включены и полностью сняты;
  - R39 — Document/ShadowRoot, `layout="auto"` с шириной контейнера 480 → 900 px и обратно: sheet закрывается, menu не
    открывается (и наоборот), focus на том же trigger с новым `aria-haspopup`, нет `inert`, scroll lock, backdrop, portal,
    callback не вызван, видимость прежняя; внешний focus сохраняется;
  - §12.2 source menu: нажатие на пустую область закрывает и возвращает focus на trigger, на focusable цель — оставляет её,
    `Tab`/`Shift+Tab` продолжают после/перед trigger;
  - R41: sources становится меньше двух — sheet закрыт, trigger исчез, focus на roving-ячейке; action sheet назван
    заголовком, кнопки Cancel/Open/Share/Delete ≥ 24 px, sheet у нижнего края, focus на первом действии; пустой набор —
    sheet закрыт, trigger исчез, focus в inline-повестке; действие из sheet даёт ровно один запрос и возвращает focus;
  - §5.5 — Document/ShadowRoot × LTR/RTL: в grid нет кнопок, trigger не вложен в основную поверхность, пустой набор без
    trigger, menu с собственным именем вне DOM-поддерева повестки, danger оформлен; `ArrowDown`+`Enter` — ровно один
    запрос; два `Escape`; `Tab`-выход; невалидное действие исключено с одним warning;
  - §5.5/R37 — обновлённый набор в открытом menu (focus переходит на новое первое действие), скрытый фильтром item
    сохраняет menu, но запроса нет, focus внутри повестки; пустой набор закрывает menu внутри повестки; удаление пары
    убирает все triggers;
  - §12.4 — при открытом source sheet завершение refresh объявлено один раз и только в нём, root endpoints пусты, при
    закрытии ничего не копируется.
- **Chrome, overlay probe T16 на публичных menus** — **48/48** (`evidence/t17/overlay/browser.json`). R37/R38/R42/R48/R52/R53
  проходят на `getItemActions`; русская подпись trigger (R52 с `ru-RU`) находится по строке item.
- **Найденное и неудачные прогоны** (сохранены рядом с финальными):
  - `actions-sources-attempt-1` (`evidence/t17/actions-sources-attempt-1/checks.json`) — 19/23. Два падения — ошибка
    ожидания harness: trigger и menu повестки в одном tree scope и при ShadowRoot-корне, потому что повестка в `body`.
    Два — **реальный дефект**: если обновлённый набор убирал focused-действие в открытом menu, React Aria переводил focus
    на сам элемент `menu`, и `Enter` ничего не делал. Исправлено (`trackSurfaceFocus`/`refocusDisplaced`), покрыто jsdom и
    Chrome.
  - `overlay-attempt-1-russian-label-selector` (`evidence/t17/overlay-attempt-1-russian-label-selector/checks.json`) —
    46/48, ошибка harness: английский selector trigger в сценарии с `ru-RU`.
  - `overlay-attempt-2-blank-press-regression` (`evidence/t17/overlay-attempt-2-blank-press-regression/checks.json`) —
    46/48, **регрессия первого варианта исправления**. Effect возврата focus зависел от identity context, поэтому после
    нажатия на пустую область возвращал focus в menu, и повестка закрывалась без recovery. Теперь focus возвращается,
    только если удалён собственный focused control поверхности. Добавлен jsdom-тест и сценарий source menu.
  - `actions-sources-attempt-2-…` (`evidence/t17/actions-sources-attempt-2-superseded-by-focus-tracking-fix/browser.json`)
    (23/23) и `responsive-attempt-1-interrupted` (`evidence/t17/responsive-attempt-1-interrupted`) — сняты до этого
    исправления; прогон остановлен, hashes устарели.
  - jsdom-самопроверка нашла ещё два дефекта до Chrome. Закрытие child, запрошенное внутри commit (набор стал пустым),
    выполняло recovery, пока modal sheet ещё делал родителя `inert`. Restore повестки закрывал весь стек, потому что
    focus был в уже закрытом child. Исправлено: recovery ждёт удаления поверхностей, `FocusKey.child` +
    `stack.recovering()`.
- **Регрессии на финальном коде** (Chrome, ноль page errors): responsive **115/115** (`evidence/t17/responsive/browser.json`),
  Month **67/67** (`evidence/t17/month/browser.json`), agenda **72/72** (`evidence/t17/agenda/browser.json`), controller
  **59/59** (`evidence/t17/controller/browser.json`), foundation **108/108** (`evidence/t17/foundation/browser.json`), host
  **41/41** (`evidence/t17/host/browser.json`), story smoke **2/2** (`evidence/t17/stories/manifest.json`).
- **Packed:** packed consumers (`evidence/t17/packed/manifest.json`) **56/56** и acceptance T14 в режиме
  alpha.2 (`evidence/t17/acceptance-alpha2/manifest.json`) **165/165** на одном packed `0.2.0-alpha.2`, integrity
  `sha512-lLbTW07/06QcJztNusCKgwktwxouus+nGTh2s6gvXeN6CMdoBW45Jxpyz4ImRLIR20ONIHpmAjB13kykfCk8Gw==`. Vite/React 18 и
  Next/React 19, public types TS 5.4.5/5.9.3 × bundler/NodeNext с новыми fixtures пар, SSR/hydration, keyboard, axe без
  нарушений в package-owned UI.
- **Общая регрессия:** manifest (`evidence/validation-2026-10-09-t17/manifest.json`) — **26/26 checks, 766 tests в 40 suites** (requirements, timezones/transitions, typecheck, library build с dist verification, API report, docs gate и self-test, Storybook types/build, reference и public types TS 5.4.5/5.9.3, lint, tests, четыре host timezone, syntax harness, включая T17 probe). Запущен после обновления ledger: hash ledger в manifest совпадают с поставленным файлом.
- Отдельно прошли `typecheck`, `typecheck:storybook`, `lint`, `test`, `build` (dist verification), `typecheck:contract`
  (TypeScript 5.9.3 и 5.4.5), `check:requirements`, `check:timezones`, `check:transitions`, `check:docs` и self-test
  (23/23), `check:api`, `build-storybook`.

Screenshots просмотрены: desktop item menu в повестке (`evidence/t17/actions-sources/document-ltr-item-menu-in-agenda.png`),
RTL (`evidence/t17/actions-sources/document-rtl-item-menu-in-agenda.png`), source menu (`evidence/t17/actions-sources/document-ltr-source-menu.png`),
RTL dark source menu (`evidence/t17/actions-sources/document-rtl-dark-source-menu.png`), mobile action
sheet (`evidence/t17/actions-sources/document-mobile-action-sheet.png`), mobile source sheet в ShadowRoot (`evidence/t17/actions-sources/shadow-mobile-source-sheet.png`).
Menu открывается у своего trigger и в RTL зеркалируется, sheets у нижнего края. Перекрытий controls и обрезанного текста
нет, danger-действие выделено цветом.

Ledger: **`pass`** — R27.1, R39, R37 (на публичных menus, вместо fixture), R38 (часть child menu), R42 (собственные имена
item/source menu и sheets, IDREF source trigger). Также `pass` блоки §5.5 о generic-модели, один набор/нет кнопок в
grid, пример и series, все блоки §5.6, кроме move (`5cf580cc9959` остаётся `planned`, `2ff3e3aaebb8` —
`in_progress`), §7 «явная кнопка `…`», §11.3 о смене layout у standalone selector. **`in_progress`**: R27 (R27.2 —
T24), R41 (встроенный move — T23), блоки §5.5 о `onItemPress`/наборе с move, §10.4 о slots, §12.1–§12.3 (частичное
evidence T17; manual AT — T28).

```sh
npm ci && npm ci --prefix scripts/implementation/spikes
npm test -- src/v02/core/__tests__/actions.test.ts src/v02/calendar/__tests__/actions.test.tsx src/v02/calendar/__tests__/sources.test.tsx
node scripts/implementation/actions-sources-probe.mjs /private/tmp/calendar-t17-actions-sources
for probe in overlay responsive month agenda controller foundation host; do node scripts/implementation/$probe-probe.mjs /private/tmp/calendar-t17-$probe; done
npm run build-storybook && node scripts/implementation/portal-stories-check.mjs /private/tmp/calendar-t17-stories
node scripts/implementation/packed-consumers.mjs --output=/private/tmp/calendar-t17-packed
node scripts/implementation/alpha-acceptance.mjs --milestone=alpha.2 --output=/private/tmp/calendar-t17-acceptance
node scripts/implementation/verify-foundation.mjs /private/tmp/calendar-t17-validation
```

## Границы

- Move-части R27 (отмена скрытого draft одним `null`, сохранение выпущенного pending request) и R41 (итоговый набор
  со встроенным «Перенести») — T23/T24, beta.1. R27 и R41 остаются `in_progress`.
- Цвет source не отображается (R62/T18). Custom slot content для строк повестки — T18. Сейчас trigger отделён только от
  package-owned основной поверхности.
- Prerelease-проверка, не stable gate: manual AT, Firefox/Safari, физические устройства и axe-матрица menu/sheet
  (T19/T28) не выполнены. Публикация `0.2.0-alpha.1`/`alpha.2` не выполнялась.
- Интерпретация «скрытый item сохраняет открытое menu, но не отправляет запрос» ждёт подтверждения lead.
