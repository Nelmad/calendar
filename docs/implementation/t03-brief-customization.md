# T03 — comparison brief: расширенный customization

6 октября 2026. Brief для advanced epic «расширенный customization» по [§2.1](../specification-0.2.md) и [T03](../implementation-plan-0.2.md). Внешние источники проверены 6 октября 2026: страницы документации и цен, npm registry (`dist-tags`, `time`, `license`, `peerDependencies`), GitHub API, а для FullCalendar ещё и declarations из опубликованного tarball `@fullcalendar/react@7.1.1`. Если факт не удалось подтвердить первичным источником или источники противоречат друг другу, это указано в тексте. Brief ничего не говорит о намерениях реальных участников: интервью и пилотов пока не было.

## Решение

**`iterate`**: epic входит в `0.2.0-alpha.2` (T18 → T19) как предмет раннего интеграционного feedback. Это не stable `go`. Stable-включение требует двух положительных пилотов §19.3 и отсутствия открытых P0/P1 по epic. Следующий шаг за maintainer `@nelmad/calendar`: после явного разрешения пользователя начать набор ранних участников alpha.2, отдельно от зарезервированных RC-участников. Подробности — в [decision record](#decision-record-6-октября-2026).

## Scope epic

Что входит, со ссылками на спецификацию:

- Типизированные content slots `renderItem`, `renderAgendaItem`, `renderDayHeader`, `renderToolbarContent` и state slots `renderLoading`/`renderEmpty`/`renderError`. Пакет сохраняет wrapper, accessible summary, roles, focus и drag semantics. Item/day slots принимают только неинтерактивное содержимое ([§10.4](../specification-0.2.md); вызов per segment/agenda item и pure-resolver правило — [§5.7](../specification-0.2.md)).
- `classNames` callbacks с типизированным context для каждой поверхности; data-only contexts не получают contract branch ([§4.3.2](../specification-0.2.md), type acceptance в §19.4).
- Resolver `getItemAppearance`: три независимых канала (accent, background, text) поверх theme/token и source слоёв. Forced-colors и package state markers имеют приоритет над author colors ([§10.3.3](../specification-0.2.md)).
- 27 публичных tokens/CSS variables сверх presets с precedence theme → scoped CSS → `tokens` → root `style`, portal mirror и правилами Shadow DOM ([§10.3.1–10.3.4](../specification-0.2.md)). *Уточнение 19 октября 2026:* по решению lead (T14) `tokens`, CSS variables, `density` и `colorScheme` — базовый theming §10.3, публичный с `0.2.0-alpha.1`; в prerelease этого epic они не входят и упомянуты здесь как слой, поверх которого работают slots, `classNames` и resolver.
- Общий инвариант — принцип 7 «Deep customization without broken semantics» ([§2](../specification-0.2.md)). Минимальная задача pilot — строка «Расширенный customization» таблицы [§19.3](../specification-0.2.md).

Вне scope: полностью headless API ([§3.2](../specification-0.2.md), последняя фраза §10.4), встроенный редактор, отдельный UI-kit.

Состояние реализации на дату brief. Рабочее дерево собирает неопубликованный candidate `0.2.0-alpha.2` (T15/T16 завершены, T17–T19 запланированы, см. [журнал](progress-0.2.md)). Внутри `src/v02/calendar` уже частично подключены `renderItem`, `renderAgendaItem`, `renderDayHeader` и часть `classNames` (root/status/toolbar/grid/weekdayHeader/day/dayHeader/item/agenda/agendaItem/overflowIndicator) — см. `MonthView.tsx`, `DayAgendaBody.tsx`, `CalendarShell.tsx`, `CalendarMonth.tsx`. Публичный surface их пока не выпускает: README перечисляет `getItemAppearance`, `classNames` и все семь render slots в «Later in `0.2.0-alpha.2`», а неподдерживаемый prop удаляется с development warning. Публичны сейчас только `theme`/`density`/`colorScheme`/`tokens`/CSS variables. Полный contract, resolver, diagnostics и `neutralTheme` относятся к T18. Поэтому alpha.1 не был prerelease этого epic ([T14](t14-alpha1-acceptance.md) фиксирует, что advanced epics в alpha.1 нет), а первым prerelease станет alpha.2.

*Состояние пакета на 19 октября 2026 (исследование и решение brief не менялись).* После [T18](t18-themes-slots.md) surface gate `0.2.0-alpha.2` больше не удаляет props этого epic: `getItemAppearance`, `classNames` и все семь render slots, а также `neutralTheme`, входят в опубликованные declarations и runtime candidate и описаны в README и API reference как доступные. Acceptance candidate — [T19](t19-alpha2-acceptance.md). Candidate не опубликован, ранний внешний feedback по epic не собран.

## Проблема пользователя

Целевой пользователь — frontend/full-stack React/TypeScript-разработчик ([§1.1](../specification-0.2.md)), который встраивает Month View в B2B SaaS task/project/operations продукт. Эталонный продукт — task/project manager ([§1.2](../specification-0.2.md)); go-to-market CIS-first, default `ru-RU` ([§1.3](../specification-0.2.md)).

У рабочего объекта в календаре есть доменные поля: статус, приоритет, исполнитель, номер задачи. Спецификация намеренно держит их в `data` и выводит через `renderItem`/`renderAgendaItem` (§4). Цвет зависит от проекта или статуса, а оформление должно совпадать с дизайн-системой продукта: свой шрифт, плотность, радиусы, тёмная тема.

Типовая боль при встраивании generic calendar:

1. **Доменное поле без потери доступности.** Свой renderer вкладывает разметку в интерактивную обёртку события. Получается невалидный DOM (ссылка или кнопка внутри интерактивного элемента) или событие, которое нельзя активировать клавиатурой.
2. **Цвет и класс по доменному состоянию.** Нужны class/style по состоянию (pending, disabled, selected, source), и цвет не должен ломать focus indicator и forced-colors.
3. **Темизация под чужую дизайн-систему.** Нужны CSS variables вместо SASS-сборки или глобальных override. Темизация должна работать в portal/overlay и Shadow DOM и давать одинаковый HTML на server и client.
4. **Нет бюджета на enterprise suite и license key.** Это прямо названо в §1.1, а MIT без license key — принцип 8.

## Сигналы спроса

### Что есть сегодня

Все сигналы косвенные: публичные issues и документация альтернатив, плюс потребность эталонного продукта из спецификации.

| Сигнал | Что подтверждает | Состояние на 6.10.2026 |
| --- | --- | --- |
| [FullCalendar #5710](https://github.com/fullcalendar/fullcalendar/issues/5710) «Interactive content inside eventContent hook produces invalid DOM» | Кастомный контент внутри интерактивной обёртки события даёт невалидный DOM | open с 2020-08-11, 12 👍 |
| [FullCalendar #5927](https://github.com/fullcalendar/fullcalendar/issues/5927) «Provide default innerContent in eventContent so it can be wrapped» | Нужно обернуть стандартный контент (например, tooltip), не переписывая его | open с 2020-10-22, 37 👍, 15 комментариев |
| [FullCalendar #7819](https://github.com/fullcalendar/fullcalendar/issues/7819) «Support for hooks inside eventContent» | Контент события должен быть полноценным React tree | open, обновлён 2026-01-05. В v7 React-реализация нативная; закрывает ли это issue, не проверено |
| [react-big-calendar #1753](https://github.com/bigcalendar/react-big-calendar/issues/1753) «How can I make Events accessible to keyboard only users» | Custom event не даёт активации с клавиатуры | closed 2021-03-01 без комментариев |
| [react-big-calendar #2214](https://github.com/bigcalendar/react-big-calendar/issues/2214) «Usage of css custom properties on top of sass variables» | Нужна темизация через CSS variables без SASS, runtime dark theme | open с 2022-07-08, обновлён 2026-05-19 |
| [react-big-calendar #2538](https://github.com/bigcalendar/react-big-calendar/issues/2538), [#2488](https://github.com/bigcalendar/react-big-calendar/issues/2488), [#2764](https://github.com/bigcalendar/react-big-calendar/issues/2764) | Нарушения ARIA-структуры month view, screen reader не читает месяц, toolbar dropdown недоступен с клавиатуры | все open; обновлены 2026-09-10, 2026-05-19, 2026-09-23 |
| [MUI X #23468](https://github.com/mui/mui-x/issues/23468) | Команда не может перейти на Event Timeline, пока нет render hooks для event block и resource cell: по словам автора, это «the only reason we cannot move». Нужны иконка, вторая строка и `<a href>` ради cmd-click | closed 2026-10-01 в пользу #23718 |
| [MUI X PR #23557](https://github.com/mui/mui-x/pull/23557) | Добавлены content slots Event Timeline; блок сохраняет «geometry, handles and button semantics». Интерактивный контент в slots **разрешён**: введён guard для вложенных controls и Tab внутрь event. Calendar slots обещаны позже | merged 2026-09-16 (вышло в `9.0.0-beta.12`) |
| [MUI X #23718](https://github.com/mui/mui-x/issues/23718) «Render read-only events as links with an href» | Maintainer MUI отклонил `<a>` внутри slot как «link inside a button»; вместо него предложено поле `href` у read-only event | open с 2026-09-30 |
| [Schedule-X #461](https://github.com/schedule-x/schedule-x/issues/461), [#636](https://github.com/schedule-x/schedule-x/issues/636) | Month grid/agenda и event modal требовали a11y-доработки | closed 2024 |
| Эталонный продукт (§1.2, §4) | Task manager показывает status/priority/assignee и цвет проекта | требование спецификации, не внешнее evidence |

Вывод. Конфликт «кастомный контент против package-owned semantics» многолетний, есть у крупнейших OSS-решений и до сих пор открыт. Самый свежий крупный игрок, MUI X, в сентябре 2026 решил его иначе, чем §10.4: интерактивный контент в slot разрешён с guard, а ссылочная семантика события выносится в отдельное поле `href`. Это подтверждает, что проблема существует. Что наш вариант решения нужен целевому пользователю, это не подтверждает.

### Чего нет

- Нет интервью, опросов или пилотов с участниками целевого сегмента. Набор участников T03 не начат: в [журнале](progress-0.2.md) T03 значится `planned`, участники не приглашены.
- Нет количественных данных о сегменте, например о доле CIS B2B-команд, которым нужна глубокая кастомизация, а не presets.
- Нет внешнего подтверждения, что правило «только неинтерактивный контент в item/day slots» приемлемо. Сигналы выше (#5927 — tooltip, #23468 — `<a href>`, решение MUI разрешить nested controls) показывают обратное давление.
- Нет данных о CIS-специфике кастомизации, например о длине русских названий статусов в compact chips и собственных шрифтах дизайн-систем. Это предположения, не evidence.

## Альтернативы

Версии и даты взяты из npm registry на 6.10.2026. Обозначения: «н/п» — не проверено в рамках brief, «(?)» — источники противоречат друг другу или неполны.

| Решение | Версия / сопровождение | Лицензия / цена | Как решает epic | A11y | Mobile | SSR / RSC |
| --- | --- | --- | --- | --- | --- | --- |
| **FullCalendar** (`@fullcalendar/react`) | 7.1.1 от 2026-10-06; 7.0.0 от 2026-06-19 | Standard MIT, month/daygrid бесплатны. Premium (timeline/resource/print) от $480/год за 1–10 dev. Open-source вариант Premium в v7 перешёл с GPLv3 на AGPLv3 (changelog v7) | `eventContent` (content injection, JSX). Class hooks `eventClass`/`eventInnerClass`/`eventTimeClass`/`eventTitleClass`, `dayCellClass`, `dayHeaderClass` — по d.ts 7.1.1 string или функция, возвращающая одну строку; массивы убраны в v7. `dayCellTopContent`, `dayHeaderContent`, `eventDidMount`. `useCalendarController()` для своего toolbar. Темы Monarch/Forma/Breezy/Pulse/Classic с variables `--fc-<theme>-*`, интеграции shadcn/MUI. Цвет события — `eventColor` и поля event; `extendedProps` в типах — `Dictionary`/`any`, без generic. Открыты баги цвета текста [#7694](https://github.com/fullcalendar/fullcalendar/issues/7694), [#5528](https://github.com/fullcalendar/fullcalendar/issues/5528) | WAI-ARIA, focus по Tab, `eventInteractive`, настраиваемые hints. Changelog v7: «all calendar views now pass Axe»; страница accessibility об axe не говорит (?). Конфликт интерактивного контента остаётся (#5710) | н/п: отдельной mobile month/agenda presentation в просмотренных docs не найдено | Docs React: «server-side rendering and StrictMode work», примеры Next.js/Remix. RSC и `'use client'` в docs не упомянуты |
| **FullCalendar headless** (`@full-ui/headless-calendar`) | 7.1.1 от 2026-10-06, используется внутри core | MIT. README: недокументированная beta для «select FullCalendar Premium users» | Утилиты парсинга и slicing событий; UI делает потребитель | на потребителе | на потребителе | н/п |
| **react-big-calendar** | 1.20.0 от 2026-06-01; repo перенесён в `bigcalendar/`; на GitHub 39 open issues и 81 open PR | MIT | `components` prop (event, toolbar и др., по view), `eventPropGetter` → `{className, style}`, `dayPropGetter`. Стили — CSS/SASS; CSS custom properties только запрошены (#2214). Нужен localizer: Moment, Globalize, date-fns или Day.js | Открытые ARIA-issues (#2538, #2488, #2764); keyboard activation custom event официально не решена (#1753) | н/п | н/п |
| **Schedule-X** (`@schedule-x/react` + `@schedule-x/calendar`) | react 4.1.0 от 2026-01-21; calendar 4.9.1 от 2026-09-29 | Core MIT. Premium (Gantt, event modal с формой, drag-to-create, resource view, draw, sidebar): €479/год или €999 lifetime для 2–3 dev, одна лицензия на проект | Custom components: `monthGridEvent`, `monthGridDate`, `monthGridDayName`, `monthAgendaEvent`, `monthAgendaDateDots`, `headerContent*`, `eventModal` и др. Внутри Preact: peers `preact`, `@preact/signals` | Публичного a11y statement не найдено; отдельные issues закрыты (#461, #636). Гарантий семантики кастомного контента в docs не найдено | Есть month agenda view | Next.js: `'use client'` и `useNextCalendarApp` |
| **TOAST UI Calendar** | 2.1.3 от 2022-08-16; [repo](https://github.com/nhn/tui.calendar) и React wrapper archived | MIT | Не сопровождается, исключён | — | — | — |
| **DayPilot Lite for React** | 6.0.0 от 2026-10-01 | Apache-2.0; коммерческий Pro (цены н/п) | `onBeforeEventRender`: html, cssClass, backColor, areas. В 2026 добавлен JSX для событий и ячеек Calendar (day/week); для Month — н/п. Month event customization в Lite частичная, в Pro полная | Keyboard и `aria-activedescendant` документированы только для Scheduler Pro (`keyboardEnabled`, выключен по умолчанию; в Lite «No Support»). Для Month Lite keyboard-модель не найдена (н/п) | н/п | Заявлена поддержка Next.js 16; детали н/п |
| **Syncfusion React Scheduler** | `@syncfusion/ej2-react-schedule` 35.1.37 от 2026-09-29 | Коммерческая («SEE LICENSE IN license»). Scheduler SDK $959/dev/год, Essential Studio $1,199/dev/год. Community License бесплатна при выручке < $1M, ≤ 5 dev, ≤ 10 сотрудников и ≤ $3M внешнего капитала | `eventSettings.template` (JSX), `eventRendered`, `cssClass` (по docs «customize the events dynamically» и поисковому summary); templates для cells и headers — н/п в этой проверке | Заявлены WCAG 2.2, Section 508, WAI-ARIA, проверка axe-core. Docs сами перечисляют предупреждения: missing table headers, контраст в Adaptive mode, `aria-expanded` в editor dropdowns | Adaptive mode | н/п |
| **DevExtreme Scheduler** | `devextreme-react` 26.1.5 от 2026-09-18 | Wrapper MIT, но `devextreme` — «SEE LICENSE IN README.md». DevExtreme Complete $899.99/dev, продление $449.99 | `appointmentRender` (подтверждён на странице customize appointment); другие templates (tooltip, data cell) — н/п | Заявлены Section 508, WCAG 2.x, WAI-ARIA. Документированные исключения: нельзя создать appointment с клавиатуры, keyboard trap при virtual scrolling, нет поддержки Windows High Contrast | н/п | н/п |
| **Bryntum Calendar** | `@bryntum/calendar-react` 7.3.7 от 2026-09-24 | Commercial. Internal perpetual: от $680/dev (минимум 3) или $600/dev (минимум 10). SaaS — только OEM subscription по запросу | Кастомный рендер событий и заголовков, tooltips с links/buttons, CSS variables, темы | На product page WCAG/keyboard не заявлены, н/п | Responsive layouts | н/п |
| **Mobiscroll Eventcalendar** | `@mobiscroll/react` в публичном npm не найден (вероятно, собственный registry, н/п). Публичный `@mobiscroll/react-lite` 6.1.4 — не event calendar | Internal: Scheduling & Calendaring $995 за проект; SaaS — подписка, scheduling по quotation | `renderCalendarEvent` (полный template), `renderCalendarEventContent` (только контент), `renderHeader` из готовых блоков, `renderDay` | Прямо: «not fully compliant with WCAG 2.2». Не поддержаны contrast, focus appearance, target size; у drag-and-drop нет keyboard-альтернативы | Mobile-first позиционирование | н/п |
| **KendoReact Scheduler** | 16.1.0 от 2026-09-08; peer `@progress/kendo-licensing` | Premium-компонент. $649 / $749 / $1,199 за dev; по pricing page — perpetual с годом поддержки, продление 50% | Custom renderers для item/view item/editor, ThemeBuilder | Docs: WCAG 2.2 AA и Section 508 (по поисковому snippet docs); product page: «AA rated with WCAG 2.0» (?) | Agenda view | н/п |
| **MUI X Scheduler** (`@mui/x-scheduler`) | 9.0.0-beta.12 от 2026-09-17. Stable ожидался «early July» 2026 ([blog](https://mui.com/blog/introducing-mui-x-scheduler-v9-alpha/)) и на дату brief не вышел | Community MIT, Premium коммерческий (recurrence, lazy loading, Event Timeline). Peers: `@mui/material`, `@mui/system`, `@mui/icons-material`, Emotion | EventCalendar: `classes`, `sx`, `eventColor` из 11 именованных palette (переопределяется per-resource и per-event), `slots` только `eventDialogGeneralTab`. Content slots с разрешённым интерактивным контентом пока только у Premium Timeline (#23557); `href` для read-only events в работе (#23718) | Отдельная страница a11y: month grid `role="grid"`, target WCAG 2.2 AA | «Responsiveness 🧪» в docs | н/п |
| **MUI X headless** (`@mui/x-scheduler-headless`) | 9.0.0-alpha.4 от 2026-04-28, новых версий нет; `@mui/x-scheduler` 9.0.0-beta.12 зависит уже от `@mui/x-scheduler-internals` | MIT | Headless primitives, UI на потребителе | на потребителе | на потребителе | н/п |
| **ilamy Calendar** (`@ilamy/calendar`) | 3.2.0 от 2026-10-03 | MIT. Peers: React 19.2, Tailwind 4, `tailwindcss-animate`, dayjs; позиционируется как shadcn/ui-based | `renderEvent`, CSS не поставляется, plugins | Не заявлено | Заявлен responsive | Заявлен «Built for Next.js»; детали н/п |
| **Gravity UI date-components** (Yandex OSS, CIS) | 4.1.0 от 2026-09-07 | MIT | Только date pickers и Calendar для выбора даты/диапазона; event month view нет | — | — | — |
| **React Aria Components Calendar** | (фундамент нашего пакета) | Apache-2.0 | Calendar для выбора даты, события не показывает | — | — | — |

Не разбирались подробно: `@event-calendar/core` (5.16.0 от 2026-10-05, MIT, не React-native) и `@aldabil/react-scheduler` (3.1.2 от 2025-04-19, привязан к MUI и date-fns; по дате релиза сопровождается слабее).

## Composition-альтернатива

**Вариант A. Generic calendar + рендеринг и фильтрация на стороне приложения.** Например, FullCalendar Standard (MIT): `eventContent` для доменных полей, `eventClass` как функция по состоянию, тема v7 с переопределением `--fc-<theme>-*`. Для текста и цвета это действительно дёшево и проверено рынком. Дороже становится там, где epic даёт гарантии:

- Интерактивный или обёрнутый контент события — открытая проблема (#5710, #5927). Команда сама следит, чтобы её renderer не ломал DOM и focus.
- Contexts class/content hooks не типизируют доменные поля: `extendedProps` — `Dictionary`/`any`. Типобезопасность доменных данных пишется поверх.
- Mobile month/agenda presentation и единый focus contract между grid и agenda строятся отдельно (для FullCalendar — н/п).
- Для Month-only сценария Premium не нужен; это важно только при росте в timeline/resource views.

Для команды, которой достаточно текста и цвета в событии, вариант A **дешевле или сопоставим**. Это прямой риск для ценности epic, см. «Риски».

**Вариант B. Коммерческий suite** (Syncfusion, DevExtreme, KendoReact, Bryntum, Mobiscroll). Templates и a11y-заявления богаче, но:

- от $600 до $1,199 за разработчика (Bryntum perpetual с минимумом 3 dev; Syncfusion и Kendo с ежегодной поддержкой);
- лицензионный пакет (`@progress/kendo-licensing`) или ограничения для SaaS: Bryntum OEM, Mobiscroll SaaS quotation, Schedule-X Premium per project;
- отдельная design-system suite.

Это противоречит §1.1 («без покупки enterprise UI-suite») и принципу 8. Вариант B дешевле только для команды, которая уже купила suite. Syncfusion Community покрывает микрокоманды, но не растущий B2B SaaS.

**Вариант C. Headless** (`@full-ui/headless-calendar`, `@mui/x-scheduler-headless`, React Aria primitives). Разметка полностью своя, ограничений нет. Но потребитель сам строит roving grid, overflow `+N`, agenda, focus recovery, live regions, portals и forced-colors. В нашей реализации это T09–T12 и T15–T16: сотни tests и browser checks. Оба headless-пакета на дату brief не готовы стать production-зависимостью: README FullCalendar называет свой пакет недокументированной beta, а MUI headless остаётся alpha без релизов с 28 апреля, и сам MUI Scheduler перешёл на `x-scheduler-internals`. React Aria Calendar — date picker, не event grid. Для целевого пользователя вариант C **заметно дороже**. Наш собственный headless API вне scope `0.2` (§3.2).

**Вариант D. MUI X Scheduler Community (MIT).** Ближайший по философии конкурент: MIT core, slots, palette с порядком event → resource → prop. Но на 6.10.2026 он в beta, требует `@mui/material` и Emotion, responsiveness экспериментальна, а content slots для calendar views ещё нет. Для команды на MUI он может стать дешевле после stable; нужен пересмотр перед RC.

## Конкретное преимущество

Отдельные элементы epic есть у части альтернатив. Преимущество — их сочетание как проверяемого контракта для целевого пользователя:

1. **Slots с гарантированной оболочкой.** Пакет сохраняет item wrapper, accessible summary, roles, focus и single grid Tab-stop; slot меняет только видимый контент, а действия идут через `onItemPress` и `getItemActions` с triggers вне wrapper ([§10.4](../specification-0.2.md), [§12](../specification-0.2.md)). FullCalendar и react-big-calendar оставляют эту ответственность потребителю (#5710, #1753). MUI выбрал другую модель — guard для вложенных controls и Tab внутрь event (#23557). Наша модель проще для проверки и сохраняет один Tab-stop grid; её цена — запрет ссылок и tooltip-триггеров внутри slot (см. «Риски»).
2. **Типизация доменных данных во всех callbacks.** Generics `TItemData`/`TSourceData` в slot/class/appearance contexts; contexts сужаются по `kind`, data-only contexts без contract branch ([§5.7](../specification-0.2.md), §19.4). У FullCalendar `extendedProps` нетипизирован; у остальных альтернатив эквивалентного разделения `item.data`/`source.data` с сужением contexts не найдено (на уровне всех d.ts — н/п).
3. **Appearance как три независимых канала.** Accent/background/text, source layer, partial fallback, один цвет во всех segments и agenda row; forced-colors и package state markers имеют приоритет ([§10.3.3](../specification-0.2.md)). У MUI сопоставимый порядок event → resource → prop, но в рамках фиксированной palette из 11 цветов.
4. **Нормативные tokens с precedence, portal mirror и Shadow DOM.** 27 variables, одинаковые на server и client, без runtime CSS parser, внешних шрифтов и CDN ([§10.3.1–10.3.4](../specification-0.2.md), [§16](../specification-0.2.md)). Это отвечает на запрос react-big-calendar #2214. Portal mirror уже реализован в T16.
5. **MIT без license key, telemetry и design-system peer** (принцип 8, [§13](../specification-0.2.md)) и CIS-first `ru-RU` по умолчанию ([§1.3](../specification-0.2.md), [§11](../specification-0.2.md)). Коммерческие наборы со сравнимыми a11y-заявлениями стоят $600–1,199 за разработчика; MUI требует Material и Emotion.

Пользователю это даёт доменный контент и бренд в календаре без собственной a11y-доводки grid/agenda и без покупки suite. Подтвердить это могут только пилоты.

## Риски

| Риск | Влияние | Митигация / сигнал для `defer` |
| --- | --- | --- |
| Composition через FullCalendar Standard (MIT, v7 native React, темы, shadcn, function class hooks) решает «текст + цвет» дешевле | Для простых случаев epic не даёт преимущества | В alpha.2 спрашивать, что из epic реально использовано сверх presets. Если только цвет и текст, сократить epic до tokens + appearance |
| Запрет интерактивного контента в item slots (§10.4) расходится с рынком: `<a href>` ради cmd-click (#23468), tooltip (#5927); MUI разрешил nested controls (#23557) и делает `href` у event (#23718) | Workaround через private DOM или отказ от пакета | Проверить, хватает ли `onItemPress` + `getItemActions`. Запрос ссылочной семантики item (аналог MUI `href`) оформить отдельным decision request; правило §10.4 молча не ослаблять |
| Diagnostics best-effort, нарушения внутри custom components не ловятся | Потребитель ломает a11y и считает это defect пакета | Docs с допустимыми и недопустимыми примерами (§18), conforming fixtures; в отчёте pilot разделять consumer-owned scope |
| Большая API surface: 7 slots, много ключей `classNames`, 27 tokens | Стоимость EN/RU документации и стабилизации, breaking changes между prereleases | Не расширять surface до feedback; в alpha.2 помечать нестабильные части |
| Связка с actions (T17): задача pilot требует «добавить domain action» | При `defer` actions задача customization невыполнима | Если actions выпадают из scope, decision record до пилотов явно заменяет этот шаг (по аналогии с правилом sources в §19.3) |
| Цена render callbacks per segment (§5.7) | Регрессия performance budgets §15 | Включить custom-slot сценарий в baseline T25 |
| Конкуренты быстро движутся: MUI Scheduler stable с calendar slots и `href`, FullCalendar headless | Преимущества 1–2 сужаются к RC | Повторно проверить альтернативы перед T30: brief устаревает |
| Частичная внутренняя проводка slots уже есть в candidate | Ранние пользователи примут неполный contract за готовый | Surface alpha.2 удаляет эти props с warning, README называет их «Later»; публиковать только после T18 (*19 октября 2026:* T18 выполнен, props опубликованы в surface alpha.2) |
| Нет ни одного участника | Решение опирается на спецификацию, а не на evidence | Набор ранних участников — следующий шаг (ниже) |

## Decision record (6 октября 2026)

**22 октября 2026: решение «iterate» утверждено владельцем** (запись в [решениях 2026-10-22](decisions-2026-10-22.md#process);
источник — задача workflow DECISIONS-V8, у пользователя в сессии не перепроверялось, [оговорка](decisions-2026-10-22.md#approval-source)).
Набор участников T03 не начат; утверждение не заменяет ранний feedback и пилоты §19.3.

- **Epic:** расширенный customization (§10.3–10.4, §2 принцип 7, §19.3).
- **Evidence:** только косвенные внешние сигналы и потребность эталонного продукта. Интервью, ранних интеграций и пилотов нет; набор участников T03 не начат. Defects и workarounds по epic извне не собраны. Внутреннее состояние: частичная проводка slots/`classNames` в неопубликованном alpha.2 candidate, скрытая surface gate; полный contract — в T18.
- **Сравнение:** для простого «текст + цвет» composition с FullCalendar Standard дешевле или сопоставима. Коммерческие suites противоречат §1.1 и принципу 8. Headless-варианты незрелы и для целевого пользователя дороже. MUI X Community — главный кандидат на пересмотр после stable; он выбрал другую модель интерактивного контента.
- **Решение:** **`iterate`** — включить epic в `0.2.0-alpha.2` (T18 → T19) для раннего интеграционного feedback. Stable `go` не объявляется. «Content slots, class callbacks и CSS variables» уже входят в обязательный scope §3.1, поэтому `defer` потребует явной правки спецификации (§2.1) и сокращения до presets + `tokens` + `getItemAppearance`.
- **Владелец следующего шага:** maintainer `@nelmad/calendar`. Шаг: получить явное разрешение пользователя и начать набор 1–2 ранних участников alpha.2; поиск и контакт — отдельная явно запускаемая работа T03. Ранние участники отделены от зарезервированных RC-участников, и их последующий RC-onboarding не засчитывается как первое знакомство. Срок — до начала T19. В отчёте ранней интеграции фиксировать:
  - какие слои epic использованы сверх presets;
  - какой workaround понадобился, особенно для ссылочной семантики и tooltip;
  - выбрал бы участник FullCalendar или MUI и почему.
- **Пересмотр:** после alpha.2 feedback и повторно перед T30 — MUI X Scheduler stable (calendar slots, #23718), FullCalendar headless и v7 content hooks.

### Что должен показать каждый из двух пилотов для stable `go`

Пилоты — Next.js и Vite, с независимыми внешними участниками (§19.3). Хотя бы один пилот — реальный или запланированный CIS-продукт с `ru-RU` как resolved date locale и языком package messages. Каждый пилот должен выполнить все пункты на реальном сценарии, а не включённым prop:

1. Реальное доменное поле (статус, приоритет, исполнитель или номер) выведено через пассивные `renderItem` и `renderAgendaItem` только через public API, без private imports и неподдерживаемых workarounds.
2. Доменное действие добавлено через `getItemActions`/`onItemActionRequest`; action trigger отделён от item wrapper, кнопки не вложены друг в друга.
3. Tokens настроены через `tokens` или scoped CSS variables, и значения видны в portal agenda/sheet (mirror §10.3.4).
4. `classNames` callback зависит от состояния day или item context: source, `isDisabled` или собственное состояние из `data`.
5. Сохранены package-owned accessible summary item, имя date cell при custom day header, видимый focus и single grid Tab-stop на desktop и mobile. Проверяется keyboard smoke; в Next-пилоте — ещё и отсутствие hydration mismatch.
6. Участник подтверждает, что оставил бы возможность включённой, и называет конкретную зависимость, собственную реализацию или UX-ограничение, которое она устраняет (§2.1). Без этого `go` не засчитывается.
7. По epic нет открытых P0/P1. Время, полученная помощь и найденные defects/workarounds записаны в отчёт; помощь по API учитывается как defect/workaround evidence.

`iterate`/`defer` хотя бы в одном из двух отчётов не даёт stable evidence по этому epic (§19.3). Тогда epic переносится явной правкой спецификации.

## Источники

Все источники открыты 6 октября 2026.

- FullCalendar: [event render hooks](https://fullcalendar.io/docs/event-render-hooks), [upgrading from v6 (V7 changelog)](https://fullcalendar.io/docs/upgrading-from-v6), [accessibility](https://fullcalendar.io/docs/accessibility), [pricing](https://fullcalendar.io/pricing), [React](https://fullcalendar.io/docs/react), [color palettes](https://fullcalendar.io/docs/color-palettes); issues [#5710](https://github.com/fullcalendar/fullcalendar/issues/5710), [#5927](https://github.com/fullcalendar/fullcalendar/issues/5927), [#7819](https://github.com/fullcalendar/fullcalendar/issues/7819), [#7694](https://github.com/fullcalendar/fullcalendar/issues/7694), [#5528](https://github.com/fullcalendar/fullcalendar/issues/5528); npm [@fullcalendar/react](https://registry.npmjs.org/@fullcalendar/react) (declarations из tarball 7.1.1), [@full-ui/headless-calendar](https://registry.npmjs.org/@full-ui/headless-calendar).
- react-big-calendar: [repo](https://github.com/bigcalendar/react-big-calendar), issues [#1753](https://github.com/bigcalendar/react-big-calendar/issues/1753), [#2214](https://github.com/bigcalendar/react-big-calendar/issues/2214), [#2538](https://github.com/bigcalendar/react-big-calendar/issues/2538), [#2488](https://github.com/bigcalendar/react-big-calendar/issues/2488), [#2764](https://github.com/bigcalendar/react-big-calendar/issues/2764); [npm](https://registry.npmjs.org/react-big-calendar).
- Schedule-X: [React adapter](https://schedule-x.dev/docs/frameworks/react) (список custom components и Next.js), [custom components overview](https://schedule-x.dev/docs/calendar/custom-components), [premium](https://schedule-x.dev/premium), issues [#461](https://github.com/schedule-x/schedule-x/issues/461), [#636](https://github.com/schedule-x/schedule-x/issues/636); npm [@schedule-x/react](https://registry.npmjs.org/@schedule-x/react), [@schedule-x/calendar](https://registry.npmjs.org/@schedule-x/calendar).
- TOAST UI: [nhn/tui.calendar](https://github.com/nhn/tui.calendar), [nhn/toast-ui.react-calendar](https://github.com/nhn/toast-ui.react-calendar), [npm](https://registry.npmjs.org/@toast-ui/calendar).
- DayPilot: [Lite release history](https://javascript.daypilot.org/daypilot-lite-history/), [Month event customization](https://doc.daypilot.org/month/event-customization/), [Scheduler keyboard](https://doc.daypilot.org/scheduler/keyboard/), [npm](https://registry.npmjs.org/@daypilot/daypilot-lite-react).
- Syncfusion: [appointments](https://ej2.syncfusion.com/react/documentation/schedule/appointments), [customize events dynamically](https://ej2.syncfusion.com/react/documentation/schedule/how-to/customize-the-events-dynamically), [accessibility](https://ej2.syncfusion.com/react/documentation/schedule/accessibility), [pricing](https://www.syncfusion.com/sales/products), [community license](https://www.syncfusion.com/sales/communitylicense), [npm](https://registry.npmjs.org/@syncfusion/ej2-react-schedule).
- DevExtreme: [customize appointment](https://js.devexpress.com/React/Documentation/Guide/UI_Components/Scheduler/Appointments/Customize_Appointment/), [accessibility](https://js.devexpress.com/React/Documentation/Guide/UI_Components/Scheduler/Accessibility/), [buy](https://js.devexpress.com/Buy/); npm [devextreme](https://registry.npmjs.org/devextreme), [devextreme-react](https://registry.npmjs.org/devextreme-react).
- Bryntum: [Calendar](https://www.bryntum.com/products/calendar/), [store](https://www.bryntum.com/store/calendar/), [npm](https://registry.npmjs.org/@bryntum/calendar-react).
- Mobiscroll: [templating](https://mobiscroll.com/docs/react/eventcalendar/templating), [accessibility](https://mobiscroll.com/docs/react/eventcalendar/accessibility), [pricing](https://mobiscroll.com/pricing); npm [@mobiscroll/react-lite](https://registry.npmjs.org/@mobiscroll/react-lite).
- KendoReact: [Scheduler](https://www.telerik.com/kendo-react-ui/scheduler), [WAI-ARIA support](https://www.telerik.com/kendo-react-ui/components/scheduler/accessibility/wai-aria-support) (WCAG 2.2 AA — по поисковому snippet), [pricing](https://www.telerik.com/kendo-react-ui/pricing), [npm](https://registry.npmjs.org/@progress/kendo-react-scheduler).
- MUI X: [Scheduler overview](https://mui.com/x/react-scheduler/), [EventCalendar API](https://mui.com/x/api/scheduler/event-calendar/), [accessibility](https://mui.com/x/react-scheduler/accessibility/), [v9 alpha blog](https://mui.com/blog/introducing-mui-x-scheduler-v9-alpha/), [#23468](https://github.com/mui/mui-x/issues/23468), [PR #23557](https://github.com/mui/mui-x/pull/23557), [#23718](https://github.com/mui/mui-x/issues/23718); npm [@mui/x-scheduler](https://registry.npmjs.org/@mui/x-scheduler), [@mui/x-scheduler-headless](https://registry.npmjs.org/@mui/x-scheduler-headless), [@mui/x-scheduler-premium](https://registry.npmjs.org/@mui/x-scheduler-premium).
- ilamy: [site](https://ilamy.dev), [npm](https://registry.npmjs.org/@ilamy/calendar).
- Gravity UI: [npm @gravity-ui/date-components](https://registry.npmjs.org/@gravity-ui/date-components).
- React Aria: [Calendar](https://react-aria.adobe.com/Calendar).
- Прочие: npm [@event-calendar/core](https://registry.npmjs.org/@event-calendar/core), [@aldabil/react-scheduler](https://registry.npmjs.org/@aldabil/react-scheduler).
