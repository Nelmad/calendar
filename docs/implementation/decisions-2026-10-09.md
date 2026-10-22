# Решения 2026-10-09: уточнения спецификации, draft v7

9 октября 2026 пользователь (владелец спецификации) одобрил четыре уточнения. Они закрывают вопросы трактовки, которые
[QA-исправления 2026-10-09](qa-fixes-2026-10-09.md) и отчёты [T15](t15-responsive.md)/[T16](t16-overlays.md) оставили
открытыми как «решение lead». Спецификация стала **draft v7**: SHA-256
`22159fb6202dcb3df016380532fdb7d30155fd9cf177bdfaf2c8fac522f09c40` → `16cbcbd85c09a2c137d88ec644ab05eb81e042086f8704fe47aff4666286a002`.
Это уточнение, а не изменение scope ([план](../implementation-plan-0.2.md), строка «Основание»). В [раунде 1 исправлений](#fix-1)
текст §10.3.2 v7 исправлен, чтобы дословно передавать одобренное правило `url(` (решение 3): SHA-256 v7 стал
`4d54f73e9ce7d90709b0f20248ef668244b3738060a5380a5d293b2bdd1d8388`. Изменены пять строк: строка
статуса и по одному абзацу или пункту в §7, §10.3.2, §10.3.4 и §11.3. Код §5.7 и строки §19.4 не менялись, поэтому
`src/v02/reference.d.ts` совпадает побайтно, а `npm run typecheck:contract` проходит без правок fixtures.

Снимок дерева до изменений — `scratchpad/snapshots/DECISIONS-before` (без `node_modules`, `dist`, `storybook-static` и
evidence). Evidence этой задачи — evidence/decisions-2026-10-09 (`evidence/decisions-2026-10-09/`), ход прогонов —
run-status.txt (`evidence/decisions-2026-10-09/run-status.txt`). Неудачные и заменённые прогоны сохранены рядом с итоговыми.

<a id="decision-1"></a>
## Решение 1. §7: `layout="auto"` при обратной связи собственной полосы прокрутки

**Проблема.** QA-04: если полоса прокрутки страницы или предка нужна только одному layout (например, более высокому
desktop-месяцу), каждый layout измеряет ширину по другую сторону границы. Буква v6 («`< mobileBreakpoint` — mobile,
`≥` — desktop» на каждом измерении) давала переключение каждый кадр (66 переключений в секунду). Гистерезис раунда 1 QA-A
убрал мерцание, но внутри полосы обратной связи показанный layout может расходиться с точной границей. В QA-A-1-01 это
записано как отступление от буквы §7.

**Варианты.** (а) Буква v6, точная граница на каждом измерении: петля без устойчивого состояния. (б) Удержание до
изменения ширины на 0,5 px (QA-A): чередование на каждом шаге перетаскивания окна (QA-A-1-02). (в) Гистерезис по измеренной
полосе обратной связи (QA-A, раунд 1). (г) Без удержания, только рекомендация `scrollbar-gutter: stable`: петля остаётся у
всех, кто её не применил.

**Одобрено.** Точная граница сохраняется (639 px — mobile, 640 px — desktop). Пока измеренная ширина колеблется из-за
собственной обратной связи полосы прокрутки, текущий layout удерживается. Потребителям рекомендуется
`scrollbar-gutter: stable`. Это вариант (в) вместе с рекомендацией.

**Текст спецификации.** До (v6): «… server и первый client render для `auto` имеют значение `mobile`. Forced layout не
наблюдает …». После (v7) между этими предложениями добавлено правило удержания: если переключение, вызванное измерением,
само возвращает ширину через границу, layout удерживается, пока ширина остаётся в полосе
`[mobileBreakpoint − Δ, mobileBreakpoint + Δ)`. Здесь Δ — изменение ширины, вызванное переключением. Вне полосы решает
точная граница, а смена `mobileBreakpoint` или `layout` сбрасывает удержание. Дальше идёт рекомендация `scrollbar-gutter: stable`.

**Код и tests.** Реализация уже соответствует тексту v7, код не менялся: [`responsive.ts`](../../src/v02/core/responsive.ts)
(`switchFeedback`, `withinFeedbackBand`) и [`useResponsiveLayout.ts`](../../src/v02/calendar/useResponsiveLayout.ts)
(полоса запоминается после переключения с обратной связью и забывается вне полосы, при смене breakpoint и при forced
layout). Tests — прежние: core `responsive.test.ts` (`switchFeedback`, границы `withinFeedbackBand`) и
`responsive.test.tsx` («auto layout loop guard», в том числе шаги 1 px через полосу). Chrome — сценарии QA-04 и «1 px resize
steps» в responsive probe (`evidence/decisions-2026-10-09/responsive/browser.json`). Документация: `api.md`/`api.ru.md`
(`layout`), README/README.ru (адаптивный layout), CHANGELOG.

**Ledger.** `S7-d0dcc8bd4064` → `S7-d04802a1ab27` (новый id после правки абзаца), R54. Статусы — в разделе
[ledger](#ledger).

<a id="decision-2"></a>
## Решение 2. §10.3.4: цель portal по умолчанию — открытый modal container

**Проблема.** QA-03: внутри модального окна хоста повестка в `body` недостижима: нативный `showModal()` делает
`inert` всё вне диалога, focus-trap забирает focus, а Radix/shadcn ставят `body { pointer-events: none }`. Группа QA-B
отступила от буквы v6 («default — `ownerDocument.body`») и выбрала ближайший диалог хоста. Распознавание было широким:
`<dialog>` `:modal`, `aria-modal="true"`, а также любые `role="dialog"`/`"alertdialog"`. Проверка QA-B (QA-B-1) нашла два
следствия, которые эта задача исправляет вместе с решением:
- **QA-B-1-03.** Немодальный `role="dialog"` (уведомление, боковая панель), появившийся поверх открытого sheet, заставлял
  стек пакета уступать: sheet терял удержание focus и `z-index`, а сам элемент не становился фоном.
- **QA-B-1-05.** Внутри модального `<dialog>` popover у ячейки нижних строк оставался снизу и сжимался до остатка высоты
  (112 px для 2026-03-25 в host probe), хотя сверху было 431 px. React Aria считает границу, которая одновременно служит
  containing block, в смешанных координатах: popover не переворачивается, а при перевороте смещение диалога учитывается
  дважды.

**Варианты.** (а) Буква v6, всегда `body`: модальные хосты ломают повестку (QA-03). (б) Решение QA-B: любой диалог хоста,
включая немодальные `role="dialog"`/`"alertdialog"`. Маленькая немодальная панель тогда стесняет popover, а немодальный
слой поверх sheet ломает его модальность (QA-B-1-03). (в) Только открытые модальные контейнеры: нативный `<dialog>` в
modal state и элементы с `aria-modal="true"`.

**Одобрено.** Вариант (в). Цель по умолчанию — ближайший открытый modal container корня в том же документе: нативный
`<dialog>` в modal state (`:modal`, открыт через `showModal()`) или элемент с `aria-modal="true"`. Иначе —
`ownerDocument.body`. Явный `portalContainer` главнее.

**Текст спецификации.** До (v6): «При отсутствующем или `null` `portalContainer` default — `Calendar` root
`ownerDocument.body`, а не global document другого realm.» После (v7): default — ближайший открытый modal container на
composed path корня (`<dialog>` в modal state или `aria-modal="true"`; `role="dialog"`/`"alertdialog"` без `aria-modal` им
не является), иначе `ownerDocument.body`, но никогда не global document другого realm. Default определяется на client и
заново перед каждой user activation. Его смена при открытом overlay обрабатывается как смена identity (это предложение
шире буквы одобренного решения; в раунде 1 исправлений реализация доведена до него и для смены одних атрибутов, DEC-1-02). Явный valid
`portalContainer` всегда выигрывает. Остаток абзаца (валидация явного container, закрытие стека) не менялся.

**Код.**
- [`portal.ts`](../../src/v02/calendar/portal.ts): `modalDialog` (открытый `<dialog>` в `:modal`; в среде без `:modal`,
  например jsdom, считается любой открытый) и `modalContainer` (`modalDialog` или `aria-modal="true"`; закрытый
  `<dialog>` — никогда). `dialogContainer` ищет ближайший такой элемент на composed path. Простой `role="dialog"` или
  `role="alertdialog"` больше не считается. *Дополнено в раунде 1:* `usePortalTarget` наблюдает и атрибуты `aria-modal`
  и `open`, а не только вставку и удаление узлов (DEC-1-02).
- [`modality.ts`](../../src/v02/calendar/modality.ts): слой хоста, которому уступает стек (QA-10), распознаётся тем же
  `modalContainer`. Селектор `dialog[open], [aria-modal="true"]` и фильтр вне `.nc-theme`; для не-`<dialog>` элемент должен
  отображаться. Немодальный `role="dialog"` поверх sheet теперь фон: он `inert`, а sheet сохраняет удержание focus, `Escape`
  и `z-index` (QA-B-1-03).
- [`NonModalPopover.tsx`](../../src/v02/primitives/NonModalPopover.tsx) и новый чистый модуль
  [`core/placement.ts`](../../src/v02/core/placement.ts) (QA-B-1-05). Внутри dialog-границы сторону по блочной оси пакет
  выбирает сам по геометрии viewport (`verticalPlacement`). Popover остаётся снизу, если помещается там своей естественной
  высотой или если снизу места не меньше, чем сверху. Иначе он открывается сверху, `max-height` равна месту выбранной
  стороны в видимой части диалога. Край прикрепляется к ячейке записью `top`/`bottom` с проверкой по измеренному
  положению (`pin`), так что результат не зависит от того, какой containing block у позиционера. В границе `body`
  размещение React Aria не менялось.

**Tests.**
- [`hosts.test.tsx`](../../src/v02/calendar/__tests__/hosts.test.tsx), «open modal containers (spec v7 §10.3.4)».
  `aria-modal="true"` и открытый `<dialog>` считаются; `role="dialog"`, `role="alertdialog"`, `aria-modal="false"` и закрытый
  `<dialog aria-modal="true">` — нет. `<dialog>`, открытый через `show()` (`:modal` = false), не считается без
  `aria-modal="true"`. Composed path выходит из ShadowRoot к хосту `aria-modal`. Calendar внутри немодальной панели
  `role="dialog"`/`"alertdialog"` открывает popover в `body`.
- Там же, «modal hosts (QA-03)»: смена цели по умолчанию при открытой повестке (хост перестаёт быть модальным) закрывает её,
  возвращает focus на ячейку, следующая activation открывает повестку в `body`.
- Там же, «a non-modal host dialog above the modal sheet (QA-B-1-03)»: немодальные `role="dialog"`/`"alertdialog"` поверх
  sheet скрыты как фон, `data-yielded` нет, Tab остаётся в sheet, `Escape` закрывает sheet и открывает панель. Контрольный
  test: тот же элемент с `aria-modal="true"` — слой хоста, sheet уступает и возвращается после его закрытия.
- [`core/__tests__/placement.test.ts`](../../src/v02/core/__tests__/placement.test.ts): выбор стороны и предел высоты, в
  том числе случай проверки (112 px снизу, 431 px сверху) и отрицательное место.
- Chrome, [`host-probe.mjs`](../../scripts/implementation/host-probe.mjs). Три панели вокруг корня: немодальные
  `role="dialog"`, `role="alertdialog"` и `<dialog>` через `show()`. Во всех трёх popover в `body`, не сжат панелью, ничего
  не `inert`, Tab, `Escape` и нажатие item работают. Pointer-events хост с `role="dialog"`: без `aria-modal` повестка в `body`
  и принимает нажатия при `body { pointer-events: none }`; с `aria-modal="true"` — в хосте; с явным `body` — в `body`.
  QA-B-1-05: пять сценариев (даты 03-31/03-25/03-18/03-04, окна 1280×900 и 1280×760). Popover на стороне, где больше места,
  если не помещается снизу, высота не меньше min(естественная, место стороны), он внутри видимой части диалога, «Закрыть»
  видима. QA-B-1-03: немодальные `role="dialog"`/`"alertdialog"` поверх sheet `inert`, `data-yielded` нет,
  `z-index: 100000`, Tab в sheet, `Escape` чистит всё.
  Смена цели по умолчанию: хост `aria-modal` перестаёт быть модальным при открытом popover. Повестка закрывается без
  `inert`, focus переходит на ячейку, следующая activation открывает повестку в `body`.
- Изменённый Chrome-сценарий: прежний «QA-03 pointer-events host (role=dialog content)» ожидал повестку в хосте. По v7
  `role="dialog"` без `aria-modal` не modal container, поэтому сценарий разделён на три варианта выше. Проверка нажатия
  сохранена во всех.

**Поведение для потребителей.** Библиотека модальных окон, которая ставит только `role="dialog"` без `aria-modal="true"` и
при этом удерживает focus или выключает события указателя, больше не получает повестку автоматически. Нужно передать её
диалог как `portalContainer`. Это записано в api.md/api.ru.md (`portalContainer`), README/README.ru, CHANGELOG и описании
story `Portals`.

**Ledger.** `S10.3.4-a18225d84126` → `S10.3.4-9e326aa5a127`, R54 (portal-часть). Статусы — в разделе [ledger](#ledger).

<a id="decision-3"></a>
## Решение 3. §10.3.2: значение `tokens`, не являющееся одним значением декларации

**Проблема.** QA-14: React SSR пишет строку токена в атрибут `style` как текст. Значение `white;position:fixed;…` в
серверном HTML становилось несколькими декларациями, а клиентский рендер (`setProperty`) отвергал его. Сервер и клиент
расходились, гидрация сохраняла внедрённые декларации. Буква v6 («остальные строки … без нормализации») такое значение не
отличала. QA-C ввела структурную проверку и вынесла трактовку lead (вопрос QA-C (1); R63 и `S10.3.2-2c15227a264d` —
`partial`).

**Варианты.** (а) Буква v6, передавать всё: внедрение деклараций через SSR. (б) Разбор CSS или `CSS.supports`: противоречит
§10.3.2 («не вызывает `CSS.supports` … не пытается полноценно парсить CSS») и даёт разный результат на сервере и клиенте.
(в) Структурная проверка границ одной декларации как правило безопасности: значение, которое не является ровно одним
значением CSS-декларации, трактуется как отсутствующее, с development warning.

**Одобрено.** Вариант (в): правило безопасности, а не проверка через `CSS.supports`. Детерминировано и одинаково на сервере
и клиенте. Отвергаются `;` или `!` на верхнем уровне, несбалансированные кавычки, скобки и комментарии, а также `url(`,
в том числе экранированные записи.

**Текст спецификации.** До (v6): «Остальные строки пакет передаёт как CSS component values без нормализации.» После (v7)
перед этим предложением добавлено исключение по правилу безопасности. Строка, которая не является ровно одним значением
CSS-декларации, тоже трактуется как отсутствующее поле с development warning, детерминированно на server и client. Сюда
относятся `;` или `!` на верхнем уровне, незакрытые либо несбалансированные кавычки, скобки или комментарии, а также
строка, содержащая `url(`, в том числе записанный escape-последовательностями (`u\72l(`). Это структурная проверка, а не
проверка по таблице и не `CSS.supports`. Остаток абзаца не менялся. *Исправлено в раунде 1 (DEC-1-01):* первая редакция
v7 вместо «`url(`» говорила «некорректный либо незакрытый `url(`» и тем сужала одобренное правило; текст выше —
исправленный.

**Трактовка «`url(` including escaped forms».** *Заменено в раунде 1 (DEC-1-01):* абзац ниже описывает первую редакцию,
которая сузила решение. Теперь отвергается любой `url(` (url token или функция в любой декодированной записи, корректный
или нет, в том числе вложенный в другие функции и блоки); `url(` внутри строки в кавычках или комментария — текст, а не
ссылка. Первая редакция: текст v7 записан так, как реализовано после раундов QA-C. `url(` в любой
записи, которую CSS декодирует (`URL(`, `u\72l(`, `\75 rl(`), токенизируется как url token или функция. Значение отвергается,
если такой `url(` некорректен или не закрыт: кавычка, `(`, пробел внутри или управляющий символ в `url(` без кавычек.
Корректный `url(…)` — одно значение декларации, он проходит; например, `url(data:image/png;base64,AA==)` в tests остаётся
допустимым. Собственный CSS пакета использует цветовые токены только в `background-color`, поэтому `url(…)` в токене ничего
не загружает. Если владелец спецификации имел в виду запрет любого `url(`, это отдельное ужесточение. Его можно сделать
одной правкой `isDeclarationValue` и tests, но в рамках этой задачи оно не вносилось, чтобы не менять уже проверенное
поведение без явного решения.

**Код и tests.** *Раунд 1:* код и tests изменены, см. [раунд 1](#fix-1). Первая редакция: реализация соответствовала тексту, код не менялся: [`themes/classic.ts`](../../src/v02/themes/classic.ts)
(`isDeclarationValue`, `themeStyle`). Tests — прежние: [`classic.test.tsx`](../../src/v02/themes/__tests__/classic.test.tsx)
(допустимые и отвергаемые значения, экранированные `url(`, `trim()`) и
[`tokens.test.tsx`](../../src/v02/calendar/__tests__/tokens.test.tsx) (сервер, гидрация и клиент дают одни декларации). Chrome:
сценарии QA-14 и QA-C-1-01/QA-C-2-02 в month probe (`evidence/decisions-2026-10-09/month/browser.json`). Это враждебное
значение на сервере, при гидрации и в клиентском рендере и дифференциальная проверка 60 000 сгенерированных значений
парсерами Chrome. Полный прогон на 1 000 000 значений — в evidence QA-C раунда 2, на том же коде `classic.ts`.

**Ledger.** `S10.3.2-2c15227a264d` → `S10.3.2-8c189ee6b965` → (раунд 1) `S10.3.2-b901126aa8a1`, R63. Статусы — в разделе [ledger](#ledger).

<a id="decision-4"></a>
## Решение 4. §11.3: SSR `layout="auto"` и `agendaPresentation`

**Проблема.** T15 V1-08, T15-V1-02, T15-V2-02. Буква v6 («сервер и первый client render используют общий компактный
month+inline-agenda layout») при `agendaPresentation="overlay"` требовала inline-повестку на сервере. Но §7 разрешает явный
выбор overlay на mobile в sheet. Inline-повестку пришлось бы удалять при hydration или после измерения, и она мелькала бы
у пользователя. Реализация T15 выводила компактный месяц без повестки, `S11.3-d7f1a73a5793` оставался `in_progress`.

**Варианты.** (а) Буква v6: inline-повестка в серверном HTML при любом `agendaPresentation`, удаление после hydration.
(б) Inline-повестка только при `agendaPresentation="auto"`; при `"overlay"` компактный месяц без повестки до activation.

**Одобрено.** Вариант (б).

**Текст спецификации.** До (v6): «при `layout="auto"` сервер и первый client render используют общий компактный
month+inline-agenda layout, без чтения `window`, `matchMedia` или размеров контейнера во время render;». После (v7):
«… используют общий компактный mobile month layout, без чтения … во время render; inline agenda входит в него только при
`agendaPresentation="auto"`, а при `"overlay"` компактный month не содержит agenda до activation (sheet закрыт);».

**Код и tests.** Реализация соответствует тексту v7, код не менялся. Закрепляющий test
[`surface.ssr.test.tsx`](../../src/v02/calendar/__tests__/surface.ssr.test.tsx) (`auto` — одна inline-повестка в серверном
HTML; `auto` + `overlay` — ни повестки, ни диалога) теперь ссылается на v7. Новый test в
[`responsive.test.tsx`](../../src/v02/calendar/__tests__/responsive.test.tsx) проверяет 320 px и 900 px: hydration
`auto` + `overlay` без mismatch, после измерения нет ни повестки, ни диалога, activation открывает sheet (mobile) или
popover (desktop). Chrome, [`responsive-probe.mjs`](../../scripts/implementation/responsive-probe.mjs): 4 сценария
«spec v7 §11.3 auto + overlay» (Document/ShadowRoot, 400 и 1000 px). В серверном HTML нет повестки и диалога, hydration
совпадает, до activation ничего не монтируется, после неё — ровно один sheet или popover. На коде до задачи эти tests и
сценарии тоже проходят: это подтверждение, а не исправление дефекта. Документация:
api.md/api.ru.md (`agendaPresentation`), README/README.ru (адаптивный layout и SSR).

**Ledger.** `S11.3-d7f1a73a5793` → `S11.3-85e370099dda`. Статус — в разделе [ledger](#ledger).

<a id="ledger"></a>
## Ledger: миграция и статусы

`node scripts/implementation/requirements.mjs --write` даёт изменённым блокам новые id (по hash текста) и отбрасывает
старые записи вместе со статусом и evidence. Поэтому до регенерации записи четырёх блоков сохранены в
ledger/before.json (`evidence/decisions-2026-10-09/ledger/before.json`), рядом лежит копия всего прежнего ledger. После
регенерации скрипт ledger/migrate.mjs (`evidence/decisions-2026-10-09/ledger/migrate.mjs`) переносит статус и evidence на
новый id того же раздела и помечает каждую запись полем `migration: "spec v7 clarification (2026-10-09): carried from <id>"`.
Скрипт проверяет, что изменились ровно эти четыре блока, и записывает ledger/mapping.json (`evidence/decisions-2026-10-09/ledger/mapping.json`).
Итоговые статусы и evidence добавлены вторым скриптом ledger/close.mjs (`evidence/decisions-2026-10-09/ledger/close.mjs`),
который переписывает только поля `status`/`evidence`.

| Блок / строка | До (v6) | После (v7) | Основание |
| --- | --- | --- | --- |
| §7, `S7-d0dcc8bd4064` → `S7-d04802a1ab27` | `in_progress` (QA-A-1-01) | `pass` | решение 1; responsive probe на финальном дереве |
| R54 | `in_progress` (QA-A-1-01) | `pass` | решение 1; responsive и overlay probes, acceptance alpha.2 |
| §10.3.4, `S10.3.4-a18225d84126` → `S10.3.4-9e326aa5a127` | `in_progress` (отступление QA-03) | `pass` | решение 2; host и overlay probes, `hosts.test.tsx`, `overlays.test.tsx` |
| §11.3, `S11.3-d7f1a73a5793` → `S11.3-85e370099dda` | `in_progress` (T15 V1-08) | `pass` | решение 4; SSR/hydration tests и сценарии responsive probe |
| §10.3.2, `S10.3.2-2c15227a264d` → `S10.3.2-8c189ee6b965` (раунд 1: → `S10.3.2-b901126aa8a1`) | `in_progress` (QA-14) | `in_progress` | решение 3 закрыло трактовку; не хватает Chrome-evidence для плохого sizing-измерения (ноль lanes и `+N`) |
| R63 | `in_progress` | `in_progress` | трактовка tokens закрыта; `source.color`/appearance (T17/T18) и sizing-измерение не проверены |
| §10.3.2, `S10.3.2-615ac46d0076` | `in_progress` | `in_progress` | добавлена partial-запись; чтение CSP (`S10.3.4-aa1394936d83`) решениями не закрыто |

Прежние записи evidence перенесены без изменения текста. Новые записи `pass`/`partial` ссылаются на этот отчёт и на
прогоны в `evidence/decisions-2026-10-09`. `npm run check:requirements` проходит: 752 блока, 74 строки регрессии.

<a id="checks"></a>
## Проверки

Все прогоны выполнены на финальном дереве, в новых каталогах evidence/decisions-2026-10-09 (`evidence/decisions-2026-10-09/`). Chrome 155.0.8059.84 (системный, headless; исправлено в
раунде 1, DEC-1-03 — первая редакция ошибочно называла 154), Playwright 1.55.1, Node 24.20.0.

- **Unit/React:** 725 tests в 37 suites (711 до задачи и 14 новых: `placement.test.ts` 3, `hosts.test.tsx` 9,
  `responsive.test.tsx` 2). Новые и изменённые tests на дереве до задачи (снимок плюс новые файлы tests):
  8 из 85 падают, suite `placement.test.ts` не загружается (модуля нет) (`evidence/decisions-2026-10-09/new-tests-on-pre-change-code.txt`).
  Падают все tests сужения modal container, QA-B-1-03 и смены цели по умолчанию. Контрольные tests проходят: слой
  `aria-modal="true"` поверх sheet, SSR и hydration `auto` + `overlay` (решение 4 подтверждает прежнее поведение). На
  финальном дереве — 88/88 (`evidence/decisions-2026-10-09/new-tests-on-final-code.txt`). Более ранние записи с другой версией `hosts.test.tsx`
  сохранены как `*-attempt-*`. В первой записи падение контрольного test вызвала утечка панели из упавшего test; очистка
  исправлена, и запись повторена.
- **Chrome, новые сценарии на дереве до задачи:**
  host 5/13 (`evidence/decisions-2026-10-09/host-new-scenarios-on-pre-change-code/browser.json`). Падают панели `role="dialog"`/`"alertdialog"`,
  pointer-events хост `role="dialog"`, QA-B-1-05 для 03-31 (оба окна) и 03-25 (popover 112 px снизу при 431 px сверху),
  а также оба QA-B-1-03. Проходят контрольные: `aria-modal` хосты, `show()`, 03-18 и 03-04.
  Смена цели по умолчанию 0/1 (`evidence/decisions-2026-10-09/host-default-change-on-pre-change-code/browser.json`),
  SSR `auto` + `overlay` 4/4 (`evidence/decisions-2026-10-09/responsive-v7-ssr-on-pre-change-code/browser.json`) (подтверждение).
- **Chrome на финальном дереве:** host **39/39** (`evidence/decisions-2026-10-09/host/browser.json`) (25 прежних без изменений; два прежних
  сценария pointer-events заменены тремя; 11 новых), responsive **115/115** (`evidence/decisions-2026-10-09/responsive/browser.json`) (111 + 4 сценария SSR v7 §11.3),
  overlay **48/48** (`evidence/decisions-2026-10-09/overlay/browser.json`), регрессии Month/agenda/controller/foundation —
  66 (`evidence/decisions-2026-10-09/month/browser.json`)/72 (`evidence/decisions-2026-10-09/agenda/browser.json`)/59 (`evidence/decisions-2026-10-09/controller/browser.json`)/108 (`evidence/decisions-2026-10-09/foundation/browser.json`),
  message regressions (`evidence/decisions-2026-10-09/messages/message-regressions.json`) 20/20, projection/wall-time parity (`evidence/decisions-2026-10-09/projection/runtime-parity.json`)
  pass, story smoke Portals **2/2** (`evidence/decisions-2026-10-09/stories/manifest.json`); ноль page/console errors. Первые прогоны host (38/38) и
  responsive (111/111), выполненные до добавления двух последних сценариев, сохранены как `*-attempt-1-*`.
  Locale parity (`evidence/decisions-2026-10-09/locale/locale-parity.json`) — **22/24**: два случая `az-Arab` расходятся из-за native Intl data. Это
  известное ограничение T08, то же расхождение, что в `evidence/t08`; эта задача его не затрагивает.
- **Packed:** packed consumers **56/56** (`evidence/decisions-2026-10-09/packed/manifest.json`) и acceptance alpha.2 **165/165** (`evidence/decisions-2026-10-09/acceptance-alpha2/manifest.json`)
  на одном packed `0.2.0-alpha.2`, integrity `sha512-UOeSxYILGj0Ij5FPTuXLrycijxUfxj7iisrXwjgW2ykIJx/+8SkWxKibXFVC5Vj3D1jFmZQLHAI8oKSF0skrJw==`,
  sha256 `ddc75e630aa77623addd508fcea34d6d6200d1c4b302a9fde0b80d1674af358c`.
- **Общая регрессия:** manifest (`evidence/decisions-2026-10-09/validation/manifest.json`): `typecheck`, `typecheck:storybook`, `lint`, `test`, tests в
  четырёх host `TZ`, `build`, `typecheck:contract` на TS 5.9.3 и 5.4.5, `check:requirements`, `check:timezones`,
  `check:transitions`, `check:docs` с self-test, `check:api`, `build-storybook` и синтаксис harness. Итог — **25/25 checks, 725 tests в 37 suites**.

<a id="fix-1"></a>
## Раунд 1 исправлений (независимая проверка DEC-1, 17 октября 2026)

Снимок дерева до раунда — `scratchpad/snapshots/DECISIONS-fix-1-before`. Evidence — evidence/decisions-2026-10-09-fix-1 (`evidence/decisions-2026-10-09-fix-1/`), ход прогонов —
run-status.txt (`evidence/decisions-2026-10-09-fix-1/run-status.txt`). Прежние каталоги `evidence/decisions-2026-10-09` не менялись; неудачные прогоны
раунда сохранены как `*-attempt-1-*`.

### Реализация

- **DEC-1-01 (P1), решение 3 записано не так, как одобрено.** Одобрено: значение отвергается, если содержит `url(`, в том
  числе в экранированной записи. Первая редакция v7 сузила это до «некорректный либо незакрытый `url(`», а api/README
  обещали, что корректный `url(…)` проходит. Исправлено по существу решения, а не по реализации:
  - §10.3.2 v7: «… (`;` или `!` на верхнем уровне, незакрытые либо несбалансированные кавычки, скобки или комментарии) или
    содержит `url(`, в том числе записанный escape-последовательностями (например `u\72l(`) …; это структурная проверка
    границ декларации и `url(` …». Изменён только этот абзац, SHA-256 спецификации
    `16cbcbd8…a002` → `4d54f73e9ce7d90709b0f20248ef668244b3738060a5380a5d293b2bdd1d8388`; план (строка «Основание») обновлён.
  - [`themes/classic.ts`](../../src/v02/themes/classic.ts): `isDeclarationValue` отвергает любой url token или функцию
    `url()` в любой декодированной записи (`URL(`, `u\72l(`, `\75 rl(`, `\55 \52 \4c (`, `ur\l(`), корректный или нет,
    в том числе внутри других функций и блоков (`image-set(url(…) 1x)`, `var(--x, url(…))`, `[url(…)]`). `url(` в строке в
    кавычках или в комментарии — текст. Сканер url token стал не нужен и удалён.
  - Tests [`classic.test.tsx`](../../src/v02/themes/__tests__/classic.test.tsx): `url(data:…;…)`, `url( "a;b" )`, `URL("a;b")`,
    `u\72l("a;b")` и `u\72l(data:a;b)` перенесены из допустимых в новый test отвергаемых вместе с остальными записями;
    в допустимые добавлены `"url(a)"`, `/* url(a) */ red`, `url (a)`, `curl(a)`.
  - Month probe: новый сценарий — корректные `url()` в пяти записях как tokens отсутствуют на сервере, при гидрации и в
    клиентском рендере, а CSS потребителя, использующий переменные в `background-image`, `border-image-source` и
    `list-style-image`, ничего не загружает (контрольное правило загружает). Дифференциальная проверка на 60 000 значений
    дополнена оракулом Chrome: принятое значение не должно читаться Chrome как ресурс в `background-image: var(--x)`;
    плюс 15 образцов `url(`, которые обязаны отвергаться (Chrome читает 13 из них как ресурс — это проверка оракула).
  - Документация: api.md/api.ru.md (`tokens`), README/README.ru, CHANGELOG.
  - Ledger: блок §10.3.2 получил новый id `S10.3.2-8c189ee6b965` → `S10.3.2-b901126aa8a1`; статус и evidence перенесены
    скриптом ledger/migrate.mjs (`evidence/decisions-2026-10-09-fix-1/ledger/migrate.mjs`) (mapping (`evidence/decisions-2026-10-09-fix-1/ledger/mapping.json`), исходные записи —
    ledger/before.json (`evidence/decisions-2026-10-09-fix-1/ledger/before.json`)).
- **DEC-1-02 (P1), смена цели по умолчанию одним атрибутом.** `MutationObserver` в
  [`portal.ts`](../../src/v02/calendar/portal.ts) смотрел только `childList`, поэтому снятие `aria-modal` у хоста при
  открытой повестке оставляло её в бывшем модальном хосте, пока где-то не вставлялся узел. Теперь observer следит и за
  атрибутами `aria-modal` и `open` (`attributeFilter`) в документе и в каждом ShadowRoot на composed path. Предложение
  §10.3.4 v7 («смена default при открытом overlay — смена identity») оставлено: теперь оно выполняется.
  Tests [`hosts.test.tsx`](../../src/v02/calendar/__tests__/hosts.test.tsx): прежний test больше не вставляет узел-маркер
  (смена только rerender атрибута); новые — `aria-modal` появляется и снимается `setAttribute`/`removeAttribute`, атрибут
  `open` у `<dialog>` (в jsdom нет `showModal()`), `aria-modal` внутри ShadowRoot календаря. Очистка разметки хоста идёт в
  `afterEach`, поэтому упавший test не влияет на соседние. Chrome, host probe: в прежнем сценарии убрана вставка `div`;
  новые — хост получает `aria-modal="true"` при открытой повестке в `body` и модальный `<dialog>` становится немодальным
  (`close()` + `show()`), без изменения узлов.
- **DEC-1-03 (P2).** В разделе «Проверки» версия Chrome исправлена на 155.0.8059.84 — её записывают все `browser.json`.
- **DEC-1-04 (P3).** План, раздел 13: R-ID — строки §19.4 draft v6, в draft v7 они не менялись.

### Проверки

Node 24.20.0, Chrome 155.0.8059.84 (системный, headless), Playwright 1.55.1, vitest 3.2.6.

- **Unit/React:** 729 tests в 37 suites (725 + 4 новых: `hosts.test.tsx` 3, `classic.test.tsx` 1). Новые и изменённые tests
  на дереве до раунда: 5 из 34 падают (`evidence/decisions-2026-10-09-fix-1/new-tests-on-pre-change-code.txt`) — все четыре сценария смены модальности
  атрибутом и отказ от `url(`; на финальном дереве — 34/34 (`evidence/decisions-2026-10-09-fix-1/new-tests-on-final-code.txt`). Первая запись на дереве до
  раунда (attempt-1 (`evidence/decisions-2026-10-09-fix-1/new-tests-on-pre-change-code-attempt-1-leaky-cleanup.txt`)) дала шестое падение (QA-10) из-за
  разметки, оставшейся от упавшего test; очистка перенесена в `afterEach`, запись повторена.
- **Chrome на дереве до раунда:** host, новые сценарии 1/3 (`evidence/decisions-2026-10-09-fix-1/host-new-scenarios-on-pre-change-code/browser.json`) —
  падают снятие и установка `aria-modal`; `close()` + `show()` проходит и раньше (подтверждение).
  Month 65/67 (`evidence/decisions-2026-10-09-fix-1/month-on-pre-change-code/browser.json`) — падают оба новых сценария `url(`.
- **Chrome на финальном дереве:** host **41/41** (`evidence/decisions-2026-10-09-fix-1/host/browser.json`), month **67/67** (`evidence/decisions-2026-10-09-fix-1/month/browser.json`)
  (60 000 значений: 6 159 принято, ни одно не читается Chrome как ресурс и не даёт лишних деклараций),
  overlay **48/48** (`evidence/decisions-2026-10-09-fix-1/overlay/browser.json`), responsive **115/115** (`evidence/decisions-2026-10-09-fix-1/responsive/browser.json`),
  agenda 72/72 (`evidence/decisions-2026-10-09-fix-1/agenda/browser.json`), controller 59/59 (`evidence/decisions-2026-10-09-fix-1/controller/browser.json`),
  foundation 108/108 (`evidence/decisions-2026-10-09-fix-1/foundation/browser.json`), message regressions (`evidence/decisions-2026-10-09-fix-1/messages/message-regressions.json`) 20/20,
  projection/wall-time parity (`evidence/decisions-2026-10-09-fix-1/projection/runtime-parity.json`) pass, story smoke Portals 2/2 (`evidence/decisions-2026-10-09-fix-1/stories/manifest.json`);
  ноль page/console errors. Locale parity (`evidence/decisions-2026-10-09-fix-1/locale/locale-parity.json`) — 22/24, те же два случая `az-Arab` (T08).
  Первый прогон month на финальном дереве (attempt-1 (`evidence/decisions-2026-10-09-fix-1/month-attempt-1-probe-declaration-normalization/browser.json`),
  66/67) упал на ошибке самого нового сценария: декларации CSSOM сравнивались без обрезки пробела после `:`. Probe
  исправлен, код пакета не менялся; прогон до раунда повторён с тем же probe.
- **Packed:** packed consumers **56/56** (`evidence/decisions-2026-10-09-fix-1/packed/manifest.json`) и acceptance alpha.2 **165/165** (`evidence/decisions-2026-10-09-fix-1/acceptance-alpha2/manifest.json`)
  на одном packed `0.2.0-alpha.2`, integrity `sha512-VsMX9mkKgCYggIOOQ6YQODpJbAzAbUNt2AqER5lvyTipNvZJ4XWybqhFJ8XT95bJ4pwoQB5bAroBLX86VmiFhw==`,
  sha256 `4546884449908f01f9f0effa2d01f7b707f7d3978e528dee4b339639753eb885`.
- **Общая регрессия:** manifest (`evidence/decisions-2026-10-09-fix-1/validation/manifest.json`) — **25/25 checks, 729 tests в 37 suites** (`typecheck`, `typecheck:storybook`, `lint`, `test`, tests в четырёх host `TZ`, `build`, `typecheck:contract` на TS 5.9.3 и 5.4.5, `check:requirements`, `check:timezones`, `check:transitions`, `check:docs` с self-test, `check:api`, `build-storybook`, синтаксис harness).

### Ledger после раунда 1

Скрипт ledger/close.mjs (`evidence/decisions-2026-10-09-fix-1/ledger/close.mjs`) переписывает только `status`/`evidence`. `S10.3.4-9e326aa5a127` — `pass`
с новым evidence (смена модальности атрибутом в jsdom и Chrome); R54 — `pass`, evidence обновлено. `S10.3.2-b901126aa8a1`
и R63 — `in_progress` с partial evidence: правило `url(` проверено, но Chrome-evidence для плохого sizing-измерения и
`source.color`/appearance (T17/T18) по-прежнему нет. `npm run check:requirements`: 752 блока, 74 строки регрессии.

<a id="bounds"></a>
## Границы

- Firefox/Safari, физические устройства и реальные скринридеры не проверялись. `:modal` поддерживают все браузеры матрицы
  §14. В среде без него, например в jsdom, открытый `<dialog>` считается модальным, поэтому немодальный `show()` проверен
  только в Chrome и в jsdom с подменой `matches(':modal')`.
- Модальный хост распознаётся только по разметке (`<dialog>` в `:modal` или `aria-modal="true"`). Модальное окно
  библиотеки без `aria-modal="true"` требует явного `portalContainer`; это задокументировано.
- QA-B-1-05: сторону по блочной оси пакет выбирает сам только внутри dialog-границы. Горизонтальное размещение и граница
  `body` остаются за React Aria. Если содержимое popover меняет высоту, пока он открыт, сторона пересчитывается на
  следующем размещении (render владельца, scroll, resize), а не сразу.
- Решение 3: после раунда 1 отвергается любой `url(`. Другие способы сослаться на ресурс без `url(` (строка в
  `image-set("…")`, `src("…")` из CSS Values 4) одобренное правило не называет, и они не проверяются: это вопрос
  владельцу спецификации, а не молчаливое расширение. Остальная строка R63 (`source.color`, appearance — T17/T18; плохое sizing-
  измерение в Chrome) этим решением не закрывается.
- Не затронуты и остаются открытыми: прочтение §10.3.4 «не обходит CSP» для восстановления inline-стилей через CSSOM
  (`S10.3.4-aa1394936d83`, вопрос QA-C (2)), проверка root `style` наравне с `tokens` (QA-C (3)), `<style>` React Aria
  (§13.3), резерв `+N` по дате (QA-18), `az-Arab` (T08), физический touch (T02/T23).
- Публикация не выполнялась; `0.2.0-alpha.2` остаётся неопубликованным кандидатом.
