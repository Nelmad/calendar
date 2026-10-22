# Решения 2026-10-22: уточнения спецификации, draft v8

22 октября 2026 пользователь (владелец спецификации) одобрил четыре уточнения поверх draft v7
([решения 2026-10-09](decisions-2026-10-09.md)). Они закрывают вопросы трактовки, которые оставили открытыми
[проверка 2026-10-09-1](review-2026-10-09-1.md) (№ 11, C3), [T18](t18-themes-slots.md) (T18-V1-03, CSP §10.3.4) и
[T19](t19-alpha2-acceptance.md) (имя custom строки повестки). Спецификация стала **draft v8**: SHA-256
`4d54f73e9ce7d90709b0f20248ef668244b3738060a5380a5d293b2bdd1d8388` → `b35babb559f93ae5ad880de5e48c72f7e85cdbcc7aa4ba7c4dfe37d70e2601ab`.
Это уточнение, а не изменение scope ([план](../implementation-plan-0.2.md), абзац о draft v8 под строкой «Основание»).
Изменены пять мест: строка статуса (v8 с кратким перечнем, v7 оставлена как история), по одному абзацу в §10.3.3,
§10.3.4 и §12.1 и новый абзац в §12.3. Код §5.7 и строки §19.4 не менялись: `src/v02/reference.d.ts` совпадает
побайтно, `npm run typecheck:contract` проходит без правок fixtures.

<a id="approval-source"></a>
Источник одобрения — задача workflow DECISIONS-V8 от 22 октября 2026, которую оркестратор передал по сообщению
пользователя («ок дальше»); текст решений взят из неё, в этой сессии одобрение у пользователя не перепроверялось.

Снимок дерева до изменений — `scratchpad/snapshots/DECISIONS-V8-before` (без `node_modules`, `dist`, `storybook-static` и
evidence). Evidence этой задачи — evidence/decisions-2026-10-22 (`evidence/decisions-2026-10-22/`), ход прогонов —
run-status.txt (`evidence/decisions-2026-10-22/run-status.txt`). Неудачные и заменённые прогоны сохранены рядом с
итоговыми.

<a id="decision-1"></a>
## Решение 1. §12.3: focus после закрытия standalone source selector

**Проблема.** Проверка 2026-10-09-1, № 11 и C3. Selector sources в toolbar (desktop menu или mobile sheet) при закрытии
возвращал focus на свой trigger: после `Escape`, кнопки закрытия, нажатия на пустое место, смены layout (R39) и нового
`portalContainer`. Буквальное чтение §12.3 для верхнеуровневого overlay без ячейки даты давало шаг 4 (roving-ячейку), а
R39 предписывал trigger только для смены layout, §12.2 — для `Escape`. Документацию тогда привели к коду, код ждал решения.

**Варианты.** (а) Буква §12.3: шаг 4, roving-ячейка. Trigger терялся бы даже после `Escape` из sheet, что расходится с
§12.2 и R39. (б) Trigger для всех путей закрытия (паттерн WAI-ARIA menu button), общий порядок §12.3 — только без
trigger; уже внешний focus не забирается.

**Одобрено.** Вариант (б): после закрытия по любой причине focus, который был внутри, возвращается на собственный trigger
в toolbar (как в R39). Общий порядок §12.3 действует, только если trigger исчез. Уже внешний focus не забирается.

**Текст спецификации.** До (v7) в §12.3 правила для selector не было; последний абзац заканчивался словами «… unmount
Calendar не выполняет программный focus.». После (v8) за ним добавлен абзац: standalone source selector из toolbar
(desktop menu или mobile sheet) после закрытия по любой причине, например `Escape`, close control, повторного нажатия
trigger, outside или backdrop press, смены resolved `layout` или portal target, возвращает focus, находившийся внутри
него, на собственный trigger в toolbar (WAI-ARIA menu button pattern, как в R39). Порядок выше применяется, только если
trigger исчез или не может получить focus по последнему правилу предыдущего абзаца; уже valid внешний focus не
забирается. `Tab`/`Shift+Tab`-выход из menu по 12.2 сам продолжает sequential order и recovery не запускает.

Два уточнения формулировки записаны явно, оба следуют из уже действующего текста, а не расширяют решение:

- «Исчез» прочитано как «не может получить focus». Последнее предложение предыдущего абзаца §12.3 запрещает возврат в
  disconnected/hidden/disabled/`inert` node. Поэтому при blocking `dataState`, где trigger отключён, focus идёт в область
  состояния (шаг 5). Само отключение trigger при blocking state остаётся трактовкой проверки 2026-10-09-1, а не частью v8.
- `Tab`/`Shift+Tab` из menu — движение focus пользователем по §12.2 (так же в паттерне WAI-ARIA), а не восстановление.

**Код и tests.** Реализация уже соответствовала, код не менялся
([`SourceSelector.tsx`](../../src/v02/calendar/SourceSelector.tsx): `close(true)` и effect восстановления после commit,
удаляющего поверхность). Новые tests закрепляют каждый путь:
[`sources.test.tsx`](../../src/v02/calendar/__tests__/sources.test.tsx), «spec v8: focus returns to the source selector
trigger on every close path», 12 tests в StrictMode. `Escape` (menu и sheet), нажатие на пустое место, нажатие на
внешний focusable control (focus остаётся на нём), кнопка закрытия и backdrop sheet, новый `portalContainer` (menu и
sheet), смена цели по умолчанию одним атрибутом `aria-modal`, смена layout в обе стороны, нет trigger (sources меньше
двух — roving-ячейка; blocking state — область состояния). Chrome:
[`actions-sources-probe.mjs`](../../scripts/implementation/actions-sources-probe.mjs), четыре сценария «spec v8 §12.3»
(Document/ShadowRoot × menu/sheet), включая удаление `portalContainer`, переход следующей activation в новый container и
модальный хост вокруг корня. Вместе с ними проходят прежние сценарии R39, §12.2, R41 и §9 того же прогона. На дереве до
задачи новые tests и сценарии тоже проходят: это подтверждение, а не исправление.

**Документация.** [api.md](../api.md#prop-showsourceselector)/[api.ru.md](../api.ru.md#prop-showsourceselector)
(`showSourceSelector`), README/README.ru (Sources), CHANGELOG.

**Ledger.** Новый блок §12.3 `S12.3-447361d81653` — `pass`. К `S12.3-92dd3f71b1a6`, `S12.2-a57dea992579` (partial, ручная
AT остаётся в T28) и R39 добавлено evidence.

<a id="decision-2"></a>
## Решение 2. §10.3.3: правило одного значения декларации для цветов items

**Проблема.** T18-V1-03. Решение 3 v7 сформулировано для `tokens`. T18 применил ту же структурную проверку к
`CalendarSource.color` и цветам `getItemAppearance`: иначе React записал бы значение с `;` в серверный `style` как
дополнительные декларации, а клиент отверг бы его целиком, и R63 («server и first client declarations совпадают»)
нарушался бы. Буква §10.3.3 и R63 говорили о передаче непустого значения CSS engine без проверки.

**Варианты.** (а) Буква: передавать всё CSS engine. Серверный HTML получает чужие декларации, server и client расходятся.
(б) То же правило безопасности, что для `tokens`: значение, не являющееся ровно одним значением декларации, отсутствует.

**Одобрено.** Вариант (б). Значение с `;` или `!` на верхнем уровне, несбалансированными кавычками, скобками или
комментариями либо с `url(` (в том числе экранированным) трактуется как отсутствующее с development warning,
детерминированно на server и client. Нижний канал (accent source, затем token темы) остаётся.

**Текст спецификации.** До (v7): «Package не выполняет собственный parser произвольных CSS colors. Непустое
`source.color`/appearance value применяется как отдельное CSS color declaration …». После (v8) между этими предложениями
добавлено правило: «Правило безопасности раздела 10.3.2 действует и здесь: непустое `source.color` или appearance value,
которое не является ровно одним значением CSS-декларации (…) или содержит `url(`, в том числе записанный
escape-последовательностями, трактуется как отсутствующее с development warning, детерминированно и одинаково на server
и client, и действует нижний канал (accent source, затем theme token).» Следующее предложение начинается словами
«Остальное непустое …». Остаток абзаца не менялся.

**Код и tests.** Реализация уже соответствовала, код не менялся: [`core/appearance.ts`](../../src/v02/core/appearance.ts)
(`colorValue` вызывает тот же `isDeclarationValue` из [`core/cssValue.ts`](../../src/v02/core/cssValue.ts), что и
`tokens`). Новые tests:
- [`appearance.test.ts`](../../src/v02/core/__tests__/appearance.test.ts): 15 отвергаемых записей (в том числе
  `u\72l(`, `\75 rl(`, `image-set(url(…))`, `var(--x, url(…))`, хвостовой `\`, U+00A0), 4 допустимых (`url(` в строке и
  комментарии, `rgb(1 2 3 / 50%)`, `var()` с fallback), нижний канал для `accentColor` и фона;
- [`tokens.test.tsx`](../../src/v02/calendar/__tests__/tokens.test.tsx), «item color declarations on the server and the
  client»: 9 враждебных значений как `source.color` и во всех трёх полях appearance. Серверный HTML без них, единственная
  сериализованная декларация строки — цвет валидного source; hydration без recovery; server, hydration и клиентский
  рендер дают одни декларации; по одному предупреждению на значение.

Chrome: [`themes-slots-probe.mjs`](../../scripts/implementation/themes-slots-probe.mjs), сценарий «spec v8 §10.3.3 SSR»
(9 значений на канал, mobile inline). Серверная разметка и клиентский рендер дают одни декларации. Accent — тема для
плохого source и цвет source для плохого appearance; фон и текст — tokens; ни один элемент не стал `fixed`; запросов к
`url(` нет; по одному предупреждению на значение и экземпляр. На дереве до задачи — тоже проходит (подтверждение).

**Документация.** api.md/api.ru.md (`CalendarSource`, `getItemAppearance`), README/README.ru (оформление items), CHANGELOG.

**Ledger.** `S10.3.3-93748c15968c` → `S10.3.3-8c1da884c1d8` (`pass`, evidence дополнено). R63 — `pass`, добавлена запись:
решение закрывает оставшуюся трактовку строки.

<a id="decision-3"></a>
## Решение 3. §10.3.4: строгий CSP и восстановление через CSSOM

**Проблема.** Вопрос QA-C (2) и строка T18 «CSP §10.3.4». При `style-src` без `'unsafe-inline'`/`style-src-attr` браузер
отбрасывает серверные атрибуты `style`, а hydration их не пишет заново. С QA-C-1-02 пакет после hydration записывал
через CSSOM объект `style`, отрисованный корнем и сеткой; с QA-C-2-01 — по одному свойству, а не текстом атрибута.
Оставалось неясно, не «обходит» ли это CSP (§10.3.4: «не обходит CSP»). `S10.3.4-aa1394936d83` был `in_progress`.

**Варианты.** (а) Ничего не восстанавливать: гидрированный месяц без числа строк, нажатия промахиваются (QA-C-1-02).
(б) Восстанавливать отрисованный объект `style` целиком, включая `style` потребителя (поведение до задачи). (в) Заново
применять через CSSOM только собственные проверенные декларации пакета, как их пишет клиентский рендер.

**Одобрено.** Вариант (в). Это не обход CSP: пакет не внедряет stylesheet, а `<style>` pressable-правила React Aria
требует документированного nonce.

**Текст спецификации.** До (v7): «Package не внедряет stylesheet автоматически и не обходит CSP.» После (v8): «… и не
обходит CSP: если строгий `style-src` без `'unsafe-inline'`/`style-src-attr` отбрасывает server-rendered атрибуты
`style`, client после hydration заново применяет через CSSOM только собственные validated declarations пакета, по одному
свойству, как их записывает client render, но не consumer root `style` и не текст атрибута. Это не обход CSP: stylesheet не
внедряется, а `<style>` pressable-правила React Aria требует документированного nonce.» Остаток абзаца не менялся.

**Расхождения с кодом и исправления.** Проверка показала два расхождения с текстом v8:

1. **Восстанавливался `style` потребителя.** [`ThemeRoot.tsx`](../../src/v02/primitives/ThemeRoot.tsx) передавал в
   `useServerStyle` объединённый объект `tokens` + `style`. Теперь передаются только проверенные декларации `tokens`, без
   ключей, которые задаёт `style` потребителя (`withoutKeys`). В клиентском рендере такой ключ имеет значение
   потребителя, поэтому значение token из пакета там никогда не появляется. `style` потребителя, как любой inline-стиль
   страницы, остаётся под его политикой.
2. **Не восстанавливались цвета items в серверной inline-повестке.** Строки mobile inline-повестки рендерятся на сервере
   с проверенными цветами (фон и текст из appearance, accent source и item). При строгом CSP они пропадали до смены
   цветов. Строка повестки вынесена в компонент `AgendaRow`
   ([`DayAgendaBody.tsx`](../../src/v02/calendar/DayAgendaBody.tsx)), он восстанавливает декларации поверхности строки.
   [`AccentMarker`](../../src/v02/calendar/slots.tsx) восстанавливает оба своих `color`. Сегменты Month и overlays —
   только клиентские и не затронуты.

Механизм не менялся ([`serverStyle.ts`](../../src/v02/primitives/serverStyle.ts)): запись идёт один раз после commit
hydration, по одному свойству, как в react-dom, и только в блок, который CSP оставил пустым при наличии атрибута.

**Tests.** [`serverStyle.test.tsx`](../../src/v02/calendar/__tests__/serverStyle.test.tsx). Ожидания трёх прежних tests
изменены по одобренному правилу и стали строже: после восстановления на корне только декларации `tokens`, а клиентский
рендер, с которым идёт сравнение, сам по-прежнему пишет `style` потребителя. Новые tests: переменная, которую заменил
`style`, не восстанавливается ни значением token, ни значением потребителя; цвета строк повестки с `onItemPress` и без него
равны клиентскому рендеру, отвергнутые значения отсутствуют. На дереве до задачи
6 из 84 (`evidence/decisions-2026-10-22/new-tests-on-pre-change-code.txt`) новых и изменённых tests падают — все tests
восстановления; на итоговом дереве 84/84 (`evidence/decisions-2026-10-22/new-tests-on-final-code.txt`).

**Chrome.** [`month-probe.mjs`](../../scripts/implementation/month-probe.mjs) с настоящим заголовком CSP:

- прежний сценарий QA-C-1-02/QA-C-2-01 теперь требует на корне только `--nelmad-calendar-color-accent`, `max-width`
  потребителя не восстанавливается, а клиентский рендер того же props пишет `max-width` и `line-height`;
- новый сценарий mobile inline-повестки: до hydration CSP блокирует все декларации строк; после hydration строки несут
  ровно декларации клиентского рендера (accent source, фон, текст и accent appearance), отвергнутые цвета отсутствуют,
  `max-width` корня заблокирован.

На дереве до задачи оба сценария падают (`evidence/decisions-2026-10-22/pre-change/month-csp/browser.json`). Первый
прогон нового сценария упал на фикстуре: документ без `<meta charset>` декодировал не-ASCII текст строк в другой
кодировке, и hydration шла с recovery. Фикстура объявляет `utf-8`, код пакета не менялся.

**Packed.** Два отдельных потребителя с архивом этой задачи, React 18.3.1 и 19.2.0, заголовок CSP, SSR, `hydrateRoot` и
клиентский рендер тех же props: react18 (`evidence/decisions-2026-10-22/csp-consumers/react18/csp-consumers.json`),
react19 (`evidence/decisions-2026-10-22/csp-consumers/react19/csp-consumers.json`). Скрипты — производные QA-C-2-01 в
csp-consumers/scripts (`evidence/decisions-2026-10-22/csp-consumers/scripts/`).

**Документация.** README/README.ru (Content Security Policy, ограничения), api.md/api.ru.md (`style`), CHANGELOG: в
Changed — `style` корня больше не восстанавливается, в Fixed — цвета строк inline-повестки.

**Поведение для потребителей.** При строгом CSP `style` корня после hydration остаётся заблокированным. Стили нужно
вынести в свою таблицу стилей через `className`, а значения из настроек — передавать через `tokens`.

**Ledger.** `S10.3.4-aa1394936d83` → `S10.3.4-d80012de1d2a` — `pass`. Evidence добавлено к `S10.3.2-615ac46d0076` (`pass`)
и `S13.3-cedb30e5fd64` (partial, stable).

<a id="decision-4"></a>
## Решение 4. §12.1: доступное имя строки повестки с `renderAgendaItem`

**Проблема.** T19 нашёл нарушение WCAG 2.5.3 (Label in Name): строка с `renderAgendaItem` называлась только скрытой
сводкой, а видимое содержимое было описанием (интерпретация T18). T19 изменил имя на «сводка + видимое содержимое», это
стало новой трактовкой и ждало решения.

**Варианты.** (а) Интерпретация T18: имя — сводка, содержимое slot — описание. Нарушает WCAG 2.5.3. (б) Имя — сводка,
затем видимое содержимое slot. (в) Имя только из видимого содержимого: теряется сводка §12.1 (название, время, source).

**Одобрено.** Вариант (б). Без slot имя — сводка, как прежде.

**Текст спецификации.** До (v7) bullet DayAgenda §12.1 заканчивался словами «… при наличии callback primary surface
является button.». После (v8) добавлено: «С `renderAgendaItem` accessible name строки (primary button, а без него — текст
list item) — этот package-owned summary, за которым следует видимое содержимое slot (WCAG 2.5.3 Label in Name); без slot
это summary, как прежде.» Задача называла место правила «§12.2», но сводка строки описана в bullet §12.1, поэтому правка
там. §10.4 не говорит, что содержимое slot — только описание, и не менялся.

**Код и tests.** Реализация T19 соответствует, код не менялся
([`DayAgendaBody.tsx`](../../src/v02/calendar/DayAgendaBody.tsx): `aria-labelledby` — сводка, затем содержимое).
Новый test [`slots.test.tsx`](../../src/v02/calendar/__tests__/slots.test.tsx) сравнивает имена точно, в popover,
inline-повестке и sheet: имя без slot, затем то же имя, пробел и текст slot, описание пустое. Chrome:
[`themes-slots-probe.mjs`](../../scripts/implementation/themes-slots-probe.mjs), шесть сценариев «spec v8 §12.1»
(Document/ShadowRoot × popover/inline/sheet) читают имя из дерева доступности Chrome (`Accessibility.getPartialAXTree`).
Например, «Trip Mar 4, 2026 – Mar 5, 2026 · Work Trip #trip» при имени без slot «Trip Mar 4, 2026 – Mar 5, 2026 · Work»;
видимый текст slot входит в имя. На дереве до задачи — тоже проходит (подтверждение).

**Документация.** api.md/api.ru.md (`renderAgendaItem`), README/README.ru, CHANGELOG.

**Ledger.** `S12.1-c2efdf6dd1ad` → `S12.1-338f7155c157`, остаётся `in_progress` (ручная AT и остальные части блока — T28),
добавлено partial evidence. К `S10.4-505bf7dfa483` (`pass`) добавлена запись.

<a id="process"></a>
## Процессные решения (без кода)

Источник обоих процессных решений тот же, что у четырёх уточнений ([источник одобрений](#approval-source)): задача
workflow DECISIONS-V8; у пользователя в сессии они не перепроверялись. Записи ниже и в связанных документах передают их
как решения пользователя с этой оговоркой.

- **T03.** Рекомендация `iterate` обоих briefs от 6 октября 2026 утверждена владельцем 22 октября 2026: запись добавлена
  рядом с датированной рекомендацией в [sources](t03-brief-sources.md) и [расширенном customization](t03-brief-customization.md).
  Статус T03 — «briefs approved; recruitment not started»: никто не приглашён.
- **T19.** Задача закрыта (`done`). Пункт 3 карточки (ранний внешний feedback с участниками T03) отложен решением
  пользователя 22 октября 2026: он не выполнен и по §19.3 остаётся обязательным до RC/stable (два независимых
  положительных пилота на advanced epic, T30). Записи — в [T19](t19-alpha2-acceptance.md#решения-2026-10-22) и [журнале](progress-0.2.md).

<a id="ledger"></a>
## Ledger: миграция и статусы

До регенерации записи трёх изменённых блоков сохранены в ledger/before.json (`evidence/decisions-2026-10-22/ledger/before.json`),
рядом — копия всего прежнего ledger и плана. После `node scripts/implementation/requirements.mjs --write` скрипт
ledger/migrate.mjs (`evidence/decisions-2026-10-22/ledger/migrate.mjs`) проверяет, что новые id получили ровно эти три
блока и добавился один новый блок §12.3. Затем он переносит статус и evidence и помечает каждую запись-объект
`migration: "spec v8 clarification (2026-10-22): carried from <id>"`; неизменённые записи сверяются побайтно
(mapping (`evidence/decisions-2026-10-22/ledger/mapping.json`)). *Раунд 1:* первая версия скрипта разложила две строковые
записи `S12.1-c2efdf6dd1ad` (T11/T12) на объекты по символу; ledger восстановлен, скрипт исправлен, неудачная версия
сохранена — [DV8-1-01](#fix-1). Итоговые записи добавил
ledger/close.mjs (`evidence/decisions-2026-10-22/ledger/close.mjs`), он переписывает только `status`/`evidence`.

| Блок / строка | До | После | Основание |
| --- | --- | --- | --- |
| §12.3, новый `S12.3-447361d81653` | — | `pass` | решение 1; jsdom и Chrome на каждом пути закрытия |
| §12.3, `S12.3-92dd3f71b1a6`; §12.2, `S12.2-a57dea992579` | `in_progress` | `in_progress` | решение 1 закрыло цель восстановления; ручная AT — T28 |
| R39 | `pass` | `pass` | решение 1; запись evidence |
| §10.3.3, `S10.3.3-93748c15968c` → `S10.3.3-8c1da884c1d8` | `pass` | `pass` | решение 2 |
| R63 | `pass` | `pass` | решение 2 закрыло T18-V1-03 |
| §10.3.4, `S10.3.4-aa1394936d83` → `S10.3.4-d80012de1d2a` | `in_progress` | `pass` | решение 3; исправления и Chrome/packed evidence |
| §10.3.2, `S10.3.2-615ac46d0076` | `pass` | `pass` | решение 3; запись evidence |
| §13.3, `S13.3-cedb30e5fd64` | `in_progress` | `in_progress` | решение 3; матрица stable открыта |
| §12.1, `S12.1-c2efdf6dd1ad` → `S12.1-338f7155c157` | `in_progress` | `in_progress` | решение 4; ручная AT — T28 |
| §10.4, `S10.4-505bf7dfa483` | `pass` | `pass` | решение 4; запись evidence |

`npm run check:requirements` проходит: 753 блока (752 + новый абзац §12.3), 74 строки регрессии.

<a id="checks"></a>
## Проверки

Все прогоны выполнены на итоговом дереве в новых каталогах evidence/decisions-2026-10-22 (`evidence/decisions-2026-10-22/`). Node 24.20.0, Chrome 155.0.8059.85
(системный, headless; в прогонах 2026-10-09 и 2026-10-19 — 155.0.8059.84), Playwright 1.55.1, vitest 3.2.6, axe-core 4.14.0;
Vite 6.4.3 + React 18.3.1, Next.js 16.3.8 + React 19.3.0. Порядок прогонов и пояснения —
run-status.txt (`evidence/decisions-2026-10-22/run-status.txt`), run-status-notes.txt (`evidence/decisions-2026-10-22/run-status-notes.txt`).

- **Unit/React:** 968 tests в 45 suites (948 до задачи и 20 новых: `sources.test.tsx` 12, `serverStyle.test.tsx` 3,
  `slots.test.tsx` 3, `tokens.test.tsx` 1, `appearance.test.ts` 1; ожидания трёх tests `serverStyle.test.tsx` изменены по
  решению 3). Новые и изменённые tests на дереве до задачи (снимок плюс новые файлы tests):
  6 из 84 падают (`evidence/decisions-2026-10-22/new-tests-on-pre-change-code.txt`) — все tests восстановления при строгом CSP; tests решений 1, 2
  и 4 проходят (подтверждение). На итоговом дереве — 84/84 (`evidence/decisions-2026-10-22/new-tests-on-final-code.txt`).
- **Chrome, новые сценарии на дереве до задачи** (фильтрованные прогоны): month CSP 0/2 (`evidence/decisions-2026-10-22/pre-change/month-csp/browser.json`),
  actions-sources v8 4/4 (`evidence/decisions-2026-10-22/pre-change/actions-sources-v8/browser.json`),
  themes-slots v8 7/7 (`evidence/decisions-2026-10-22/pre-change/themes-slots-v8/browser.json`).
- **Chrome на итоговом дереве:** review3 26/26 (`evidence/decisions-2026-10-22/review3/browser.json`), review2 27/27 (`evidence/decisions-2026-10-22/review2/browser.json`),
  Month **72/72** (`evidence/decisions-2026-10-22/month/browser.json`) (71 и новый сценарий inline-повестки под CSP; прежний сценарий CSP изменён по
  решению 3), host 49/49 (`evidence/decisions-2026-10-22/host/browser.json`), controller 59/59 (`evidence/decisions-2026-10-22/controller/browser.json`),
  overlay 48/48 (`evidence/decisions-2026-10-22/overlay/browser.json`), themes/slots **31/31** (`evidence/decisions-2026-10-22/themes-slots/browser.json`) (24 + 7 v8),
  actions/sources **47/47** (`evidence/decisions-2026-10-22/actions-sources/browser.json`) (43 + 4 v8), responsive 115/115 (`evidence/decisions-2026-10-22/responsive/browser.json`),
  agenda 72/72 (`evidence/decisions-2026-10-22/agenda/browser.json`), foundation 108/108 (`evidence/decisions-2026-10-22/foundation/browser.json`), examples development
  4/4 (`evidence/decisions-2026-10-22/examples-dev/browser.json`). Всего **658/658**, ноль page/console errors.
  Message regressions (`evidence/decisions-2026-10-22/messages/message-regressions.json`) 20/20, projection/wall-time parity (`evidence/decisions-2026-10-22/projection/runtime-parity.json`)
  pass, story smoke production (`evidence/decisions-2026-10-22/stories/manifest.json`) и development (`evidence/decisions-2026-10-22/stories-development/manifest.json`):
  Portals 2/2, все stories 47/47. Locale parity (`evidence/decisions-2026-10-22/locale/locale-parity.json`) — 22/24, те же два случая `az-Arab` (T08,
  открыто до T27); задача их не затрагивает.
- **Packed:** packed consumers **58/58** (`evidence/decisions-2026-10-22/packed/manifest.json`) и acceptance alpha.2 **303/303** (`evidence/decisions-2026-10-22/acceptance-alpha2/manifest.json`)
  (122 скана axe, 0 нарушений) на одном packed `0.2.0-alpha.2`, 123 файла, integrity
  `sha512-Mz56MW7gUsOV1TocE1a+NtdMjz5QLhJ63VtFZzqCWbZ/TM66SBEzToPLt0iEoxlQwEbpLSgZ4sAYphumdNadbw==`, sha256
  `9b67d1176d2b9447985c519ad7de5fad31c60431b057046fc392f14e602b19f1` (архив (`evidence/decisions-2026-10-22/acceptance-alpha2/nelmad-calendar-0.2.0-alpha.2.tgz`)).
  Байты SDK изменились (решение 3), поэтому это заменяющий candidate: он записан в
  [T19, «Финальная переквалификация»](t19-alpha2-acceptance.md#заменяющий-candidate-решения-2026-10-22), прежний
  `sha512-fPtPXlZT…JcyWqsg==` — исторический. CSP-потребители на том же архиве:
  manifest (`evidence/decisions-2026-10-22/csp-consumers/manifest.json`), React 18.3.1 и 19.2.0 — 9/9 checks каждый.
- **Общая регрессия:** manifest (`evidence/decisions-2026-10-22/validation/manifest.json`) — **36/36 checks, 968 tests в 45 suites**, повтор 308 tests в
  10 suites под четырьмя host `TZ`: `typecheck`, `typecheck:storybook`, `lint`, `test`, `build` с dist verification,
  `typecheck:contract` на TS 5.9.3 и 5.4.5, `check:requirements`, `check:timezones`, `check:transitions`, `check:docs` с
  self-test, `check:api`, `build-storybook`, self-test harness и синтаксис probes. Все 268 source hashes совпадают с
  итоговым деревом; source hashes остальных manifests (acceptance 158, packed 164, все probes и story smoke) тоже сверены
  после прогонов — расхождений нет.

<a id="bounds"></a>
## Границы

- Firefox/Safari, физические устройства и реальные screen readers не проверялись. Имя строки повестки проверено по дереву
  доступности Chrome, а не речью AT (T28).
- Отключение trigger selector при blocking state — по-прежнему трактовка проверки 2026-10-09-1. Решение 1 его не
  утверждает и не отменяет: отключённый trigger просто не может получить focus.
- Модальный хост, который сам является shadow host без `<slot>`, получил бы portal в light DOM, где тот не отображается.
  Реальные web-component dialogs проецируют содержимое через slot; сценарий Chrome этой задачи ставит `aria-modal` на
  обёртку вокруг хоста. Это не область v8 и не проверялось.
- Решение 3 не затрагивает `<style>` React Aria: §13.3 («package не выполняет runtime style injection»,
  `S13.3-470a0ae6a289`) остаётся открытым до stable; nonce задокументирован.
- Без CSP серверный атрибут `style` корня по-прежнему применяет значения `style` потребителя как есть, в том числе с `;`
  (React пишет непроверенный `style` в HTML; задокументировано в api.md). Значения из настроек — через `tokens`.
- Публикация не выполнялась; `0.2.0-alpha.2` остаётся неопубликованным кандидатом. Набор участников T03 не начат.

<a id="fix-1"></a>
## Раунд 1 исправлений (независимая проверка DV8-1, 22 октября 2026)

Снимок изменяемых документов до раунда — `scratchpad/snapshots/DECISIONS-V8-fix-1-before` (хеши —
docs-sha256-before.txt (`evidence/decisions-2026-10-22/fix-1/docs-sha256-before.txt`)). Evidence —
evidence/decisions-2026-10-22/fix-1 (`evidence/decisions-2026-10-22/fix-1/`) (manifest (`evidence/decisions-2026-10-22/fix-1/manifest.json`)).
Прежние файлы evidence не менялись, кроме исправленного `ledger/migrate.mjs`; его неудачная версия сохранена рядом.
SDK, файлы архива и probes не менялись.

### Реализация

- **DV8-1-01 (P1), миграция испортила evidence `S12.1-338f7155c157`.** У прежнего блока `S12.1-c2efdf6dd1ad` две записи
  evidence (T11, T12) — строки. migrate.mjs (`evidence/decisions-2026-10-22/ledger/migrate.mjs`) копировал каждую запись
  через `{...entry, migration}`, и строка стала объектом с ключом на каждый символ. `check:requirements` проходил, потому
  что форму записей не проверял.
  - Ledger: fix-1/ledger/repair.mjs (`evidence/decisions-2026-10-22/fix-1/ledger/repair.mjs`) собирает текст из
    символов и сверяет его со строкой на той же позиции в
    requirements-0.2.before.json (`evidence/decisions-2026-10-22/ledger/requirements-0.2.before.json`), затем возвращает
    строки. Он проверяет, что во всём ledger испорчены ровно эти две записи. Запись `partial` решения 4 остаётся третьей.
    Строка не может нести поле `migration`, поэтому смена id записана только в mapping. Запись до ремонта —
    corrupted-S12.1-338f7155c157.json (`evidence/decisions-2026-10-22/fix-1/ledger/corrupted-S12.1-338f7155c157.json`),
    SHA-256 ledger `510db128…837b17` → `0987cea8…264955`.
  - Скрипт: `migrate.mjs` переносит строки как есть, проверяет, что тип каждой записи сохранился, и пишет в mapping число
    строковых записей (`strings`). Неудачная версия сохранена байт в байт:
    migrate.failed.mjs (`evidence/decisions-2026-10-22/ledger/migrate.failed.mjs`). mapping.json (`evidence/decisions-2026-10-22/ledger/mapping.json`)
    — вывод первого прогона, исправленный — fix-1/ledger/mapping.json (`evidence/decisions-2026-10-22/fix-1/ledger/mapping.json`).
  - Повтор: replay.mjs (`evidence/decisions-2026-10-22/fix-1/ledger/replay.mjs`) в двух scratch-копиях прежнего ledger
    запускает `requirements.mjs --write`, затем неудачный или исправленный скрипт. Неудачный воспроизводит дефект, и новая
    проверка его отвергает. После исправленного ledger проходит. Отремонтированный ledger равен результату исправленного
    скрипта плюс 11 записей `close.mjs` и два статуса, которые тот установил (replay.json (`evidence/decisions-2026-10-22/fix-1/ledger/replay.json`)).
  - Проверка: [ledger-evidence.mjs](../../scripts/implementation/ledger-evidence.mjs) проверяет каждую запись evidence
    требований и subchecks. Запись — непустая строка или объект `{kind: pass|partial, paths, scope[, milestone, migration]}`
    без других полей. Статус — `planned`, `in_progress` или `pass`. [requirements.mjs](../../scripts/implementation/requirements.mjs)
    падает при любом нарушении. На ledger до ремонта `check:requirements`
    падает (`evidence/decisions-2026-10-22/fix-1/ledger/check-requirements-before-repair.log`) на двух записях.
    Self-checks [requirements.checks.mjs](../../scripts/implementation/requirements.checks.mjs) (`node --test`, 5 tests,
    включая испорченную запись и живой ledger) входят в общую регрессию (`requirements-selftest`) и в CI. `package.json`
    не менялся: он входит в архив.
- **DV8-1-02 (P2), записи называли итоговым candidate 19 октября.** Строка статуса плана и строка T19 журнала теперь
  называют заменяющий candidate `sha512-Mz56MW7g…Nadbw==` (303/303, 58/58, 658/658) итоговым, а `sha512-fPtPXlZT…JcyWqsg==`
  — историческим. Так же помечена запись журнала о переквалификации 19 октября.
- **DV8-1-03 (P2), источник одобрений T03/T19.** У пользователя в сессии они не перепроверялись. Поэтому рядом с каждым
  утверждением добавлена та же оговорка, что в [начале отчёта](#approval-source): в briefs T03, отчёте T19 (статус, brief
  T03, «Границы», «Решения 2026-10-22»), строках T03/T19 и плане журнала, строке статуса плана и в разделе
  [процессных решений](#process). Подтверждение у пользователя остаётся за lead.
- **DV8-1-05 (P3).** Примечание плана к таблице R-ID: в draft v8 строки §19.4 тоже не менялись (сдвиг в файле на две
  строки, fingerprints те же).
- **DV8-1-04 (P3) отложен.** Лишняя пустая строка в списке «Fixed» CHANGELOG остаётся. `CHANGELOG.md` входит в архив
  (`files` в `package.json`), поэтому правка изменила бы integrity квалифицированного candidate и потребовала новой
  переквалификации. Убрать её при следующей пересборке архива (запись — в плане следующего изменения журнала).

### Проверки

Node 24.20.0, npm 11.19.0. Общая регрессия (`evidence/decisions-2026-10-22/fix-1/validation/manifest.json`) —
**37/37 checks** (прежние 36 и `requirements-selftest`), **968 tests в 45 suites**, повтор под четырьмя host `TZ`.
В неё входят `typecheck`, `typecheck:storybook`, `lint`, `test`, `build`, `typecheck:contract` на TS 5.9.3 и 5.4.5,
`check:requirements`, `check:timezones`, `check:transitions`, `check:docs` с self-test, `check:api` и `build-storybook`.
Учтено 270 source hashes. `npm pack --dry-run` на итоговом дереве даёт тот же архив
`sha512-Mz56MW7g…Nadbw==` из 123 файлов (pack-dry-run.json (`evidence/decisions-2026-10-22/fix-1/pack-dry-run.json`)).
Поэтому acceptance alpha.2, packed consumers и Chrome probes [основного прогона](#checks) остаются в силе и не повторялись.
