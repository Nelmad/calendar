# T03 — market brief: sources

6 октября 2026. Comparison brief для advanced epic `sources` по [§2.1](../specification-0.2.md) и [T03](../implementation-plan-0.2.md). В scope epic входят: несколько проектов/календарей через независимый `CalendarSource<TSourceData>`, controlled source filter с отложенным принятием, встроенный selector (desktop menu, mobile sheet), fail-open для неизвестного `calendarId` и accent color source ([§5.6](../specification-0.2.md), [§10.3.3](../specification-0.2.md), строка Sources в [§19.3](../specification-0.2.md)). Brief нужен до первого prerelease epic, то есть до `0.2.0-alpha.2` (T17/T19).

Все внешние факты проверены 6 октября 2026: страницы вендоров, GitHub и `npm view`. Утром того же дня выполнен повторный проход: версии перепроверены (FullCalendar успел выйти в 7.1.1), утверждения без прямого подтверждения в источнике удалены или помечены. Если источник противоречив или тему не удалось проверить, это помечено как **не проверено**. Ничего из этого brief не является результатом интервью или пилота.

## Проблема пользователя

Целевой сегмент — встроенный календарь в B2B SaaS для задач и проектов, в первую очередь для рынка СНГ ([§1](../specification-0.2.md), [§1.3](../specification-0.2.md)). В таком продукте календарь почти никогда не показывает одну сущность: в нём сразу видны задачи нескольких проектов, досок, команд или типов работ. Конечному пользователю нужно:

1. понять, к какому проекту относится запись (цвет и название source в summary и selector);
2. временно скрыть проект и вернуть его, не теряя контекст месяца;
3. знать, что «пропавшая» запись действительно скрыта фильтром, а не потерялась из-за ошибки данных.

Разработчику продукта ([§1.1](../specification-0.2.md)) нужно:

- хранить состояние фильтра у себя: в URL, user preferences или на backend, иногда с асинхронным сохранением;
- типизировать metadata проекта (`TSourceData`) отдельно от данных задачи;
- получить доступный selector для desktop и mobile, не собирая его из UI-kit;
- не получать расхождений между сеткой, `+N`, agenda, counts и доступными actions после переключения.

В `0.1` sources нет совсем, а цвета событий ограничены четырьмя вариантами: README `0.1` прямо называет «Custom event colors beyond 4 variants» как «Not a fit for». Это слабый внутренний сигнал: ограничение было задокументировано, но обращений пользователей по нему нет.

## Сигналы спроса, доступные на сегодня

| Сигнал | Что подтверждает | Сила |
| --- | --- | --- |
| Паттерн «Мои календари» в Google Calendar: показать/скрыть календарь кликом в списке ([help](https://support.google.com/calendar/answer/34580?hl=en&co=GENIE.Platform%3DDesktop)) | Конечные пользователи знают UX включения и выключения источников | Косвенный: это потребительский календарь, а не B2B task |
| FullCalendar [#1147](https://github.com/fullcalendar/fullcalendar/issues/1147) «More easily toggle event visibility» (импорт из Google Code 2011, на GitHub с 2015, закрыт, labels Accepted / Event Model / Event Rendering). Автор прямо сравнивает просьбу с включением и выключением календарей в Google Calendar. Сегодня в документации есть `eventDisplay: 'none'` ([docs](https://fullcalendar.io/docs/eventDisplay)), отдельного show/hide для source нет | Есть давний запрос на переключение «календарей» без удаления данных у самой популярной библиотеки | Средний, публичный, старый |
| Почти у каждой коммерческой альтернативы есть пример или виджет фильтра: Schedule-X Sidebar (premium), Syncfusion demo add/remove resources, Mobiscroll demo «Resource filtering in header», Bryntum `ResourceFilter`, MUI X `visibleResources` | Вендоры считают сценарий достаточно частым, чтобы делать для него демо, виджеты или платные plugins | Средний: это предложение рынка, а не измеренный спрос |
| В MUI X Scheduler «Filtering» значится как Planned для Event Calendar и Timeline ([overview](https://mui.com/x/react-scheduler/), [#21568](https://github.com/mui/mui-x/issues/21568)) | Новый игрок с MIT-уровнем Community тоже закладывает фильтрацию в план | Слабый/средний |
| СНГ, task-продукты: в YouGile календарь нескольких проектов собирается через «сводку» с фильтром по расположению, цвет берётся от колонки, фильтр в календаре только по исполнителю ([help](https://help.yougile.com/books/baza-znanii-yougile/page/vid-kalendar)); в Kaiten календарный вид пространства использует обычные фильтры пространства ([FAQ](https://faq-ru.kaiten.site/filtry-v-kalendarnom-vide); страница при обеих проверках не открылась, ECONNREFUSED, факт взят из сниппета поиска — **не проверено напрямую**) | Российские task-продукты решают задачу «несколько проектов в одном календаре» своими силами, причём ограниченно | Средний для сегмента: это поведение продуктов, а не интервью |
| Эталонный продукт ([§1.2](../specification-0.2.md)): task/project manager | Потребность заложена в продуктовую модель | Внутренний, не внешний |

### Чего нет

- **Интервью и пилотов нет.** Ни один внешний React/TypeScript-разработчик не подтвердил, что ему нужен встроенный selector, а не только типизированные sources и цвет.
- **Набор участников T03 не начат:** в [progress](progress-0.2.md) записано «участники не приглашены». Поиск участников и контакт с ними — отдельная работа, которую нужно явно запустить; этот brief её не выполняет.
- Нет количественных данных: доли продуктов, где фильтр сохраняется асинхронно; числа sources в типичном аккаунте; того, как часто разработчики заменяют встроенный selector своим.
- Нет СНГ-продукта, подтвердившего, что встроит именно этот API. Требование §19.3 об одном реальном или запланированном CIS-продукте пока ничем не покрыто.

## Альтернативы

Версии и даты публикации текущей версии взяты из npm registry (`npm view <pkg> version` и `time[<version>]`) 6 октября 2026.

| Продукт (npm, версия, дата) | License / цена | Как решает epic | A11y | Mobile | SSR/RSC |
| --- | --- | --- | --- | --- | --- |
| **FullCalendar** `@fullcalendar/react` 7.1.1, 2026-10-06 | MIT standard; Premium (timeline/resource, печать) от $480 ([pricing](https://fullcalendar.io/pricing)) | `eventSources` с `id`, `color`, `className`, `display`; `addEventSource`/`EventSource.remove` ([docs](https://fullcalendar.io/docs/event-source-object)). Встроенного selector и prop видимости нет: скрытие — remove/re-add source, `display: 'none'` ([eventDisplay](https://fullcalendar.io/docs/eventDisplay)) или фильтрация `events` в приложении | В v7 исправлены role/ARIA, list markup, клавиатура для popover, axe-проверка всех views ([v7 changelog](https://fullcalendar.io/docs/upgrading-from-v6)); полного WCAG-заявления не найдено | Responsive улучшен в v7; отдельного mobile selector нет | В v7 React-реализация нативная, заявлены SSR и StrictMode; при этом открыт [#8088](https://github.com/fullcalendar/fullcalendar/issues/8088) (2026-07-22, заявлен на 7.0.1): под StrictMode или поверх modal события day-grid остаются `visibility: hidden`, в том числе в production; воспроизводится ли в 7.1.1 — **не проверено**. Обязательная peer-зависимость `temporal-polyfill` |
| **react-big-calendar** 1.20.0, 2026-06-01 | MIT | Понятия source нет; фильтрация массива `events` в приложении и цвет через `eventPropGetter` ([repo](https://github.com/jquense/react-big-calendar)) | Исторически слабая: [#963](https://github.com/bigcalendar/react-big-calendar/issues/963), [#2037](https://github.com/jquense/react-big-calendar/issues/2037), [#2764](https://github.com/bigcalendar/react-big-calendar/issues/2764); текущее состояние **не проверено** | Mobile UX не документирован | Не проверено; требует localizer (moment/date-fns/dayjs/Globalize) |
| **Schedule-X** `@schedule-x/calendar` 4.9.1, 2026-09-29; `@schedule-x/react` 4.1.0, 2026-01-21 | MIT core; Premium €479/год или €999 lifetime на 2–3 разработчиков, одна лицензия на проект ([premium](https://schedule-x.dev/premium)) | `calendars` + `calendarId` на событии, цвета light/dark; `@schedule-x/calendar-controls` с `setCalendars()`/`getCalendars()`, отдельного show/hide метода нет ([docs](https://schedule-x.dev/docs/calendar/plugins/calendar-controls); бесплатность плагина на странице явно не указана); готовые переключатели только в **premium** Sidebar (`activeCalendarIds`, `hasCalendarToggles`) ([docs](https://schedule-x.dev/docs/calendar/plugins/sidebar)) | **Не проверено**: документации по a11y не найдено | Responsive заявлен; отдельный sheet для фильтра не найден | Для Next.js нужны `useNextCalendarApp` и `'use client'`, данные загружаются в `onRender` ([React docs](https://schedule-x.dev/docs/frameworks/react)); peer `temporal-polyfill` |
| **TOAST UI Calendar** `@toast-ui/calendar` 2.1.3, 2022-08-16 | MIT | `calendars` + `setCalendarVisibility(id, bool)` императивно, без UI ([API](https://github.com/nhn/tui.calendar/blob/main/docs/en/apis/calendar.md)) | Не проверено | Не проверено | Нет смысла оценивать: **репозиторий архивирован 2 сентября 2026** ([repo](https://github.com/nhn/tui.calendar)) |
| **MUI X Scheduler** `@mui/x-scheduler` 9.0.0-beta.12, 2026-09-17 | Пакет в **beta**. Community MIT; `@mui/x-scheduler-premium` (recurrence, lazy loading, Timeline) в плане MUI X Premium $599 за разработчика в год (Pro — $299), license key снимает watermark ([pricing](https://mui.com/pricing/), [overview](https://mui.com/x/react-scheduler/)) | Ближайший аналог. `resources` (`id`, `title`, `eventColor`, `children`), `event.resource`; `defaultVisibleResources` или controlled `visibleResources` + `onVisibleResourcesChange`: resource видим, если его нет в объекте или значение `true`; `defaultCollapsedResources` для дерева ([resources](https://mui.com/x/react-scheduler/event-calendar/resources/), [API](https://mui.com/x/api/scheduler/event-calendar/)). Событие можно сохранить без resource; поведение для неизвестного resource ID в документации не описано (**не проверено**). Общий «Filtering» — Planned | Целевой уровень WCAG 2.2 AA, grid roles, live regions; известное ограничение: в mini calendar side panel нет навигации стрелками ([a11y](https://mui.com/x/react-scheduler/accessibility/)) | Responsiveness помечена как experimental ([overview](https://mui.com/x/react-scheduler/)) | Не документировано на проверенных страницах (**не проверено**). Peer-зависимости: `@mui/material`, `@mui/system`, `@mui/icons-material`, `@emotion/react`, `@emotion/styled` |
| **DayPilot** `@daypilot/daypilot-lite-react` 6.0.0, 2026-10-01 | Lite Apache-2.0; Pro: Web $649–2999, SaaS $1199–5799, perpetual + maintenance ([buy](https://javascript.daypilot.org/buy/); цены при повторном проходе не перепроверялись) | `onEventFilter` / `events.filter()` в Month — **только в Pro** ([docs](https://doc.daypilot.org/month/event-filtering/)); встроенного selector нет | Не проверено | Не проверено | Не проверено |
| **Syncfusion** `@syncfusion/ej2-react-schedule` 35.1.37, 2026-09-29 | Коммерческая лицензия; Community License при выручке < $1M, ≤ 5 разработчиков, ≤ 10 сотрудников и не более $3M внешнего капитала ([community](https://www.syncfusion.com/sales/communitylicense)); Scheduler SDK $959/год, suite $1199 за разработчика в год ([team](https://www.syncfusion.com/sales/teamlicense)) | `resources` с `idField`/`textField`/`colorField`, grouping; показ/скрытие через императивные `addResource`/`removeResource` и чекбоксы приложения ([demo](https://ej2.syncfusion.com/react/demos/schedule/add-remove-resources/), [docs](https://ej2.syncfusion.com/react/documentation/schedule/resources)) | Заявлены WCAG 2.2 и Section 508 с перечнем известных предупреждений ([a11y](https://ej2.syncfusion.com/react/documentation/schedule/accessibility)) | `enableAdaptiveUI` | Не проверено |
| **DevExtreme** `devextreme-react` 26.1.5, 2026-09-18 | В npm-метаданных указано MIT, но vendor требует per-developer subscription: Complete $899.99 в год ([buy](https://js.devexpress.com/Buy/)). License key задаётся через `config({ licenseKey })` и проверяется при создании первого компонента ([licensing](https://js.devexpress.com/React/Documentation/Guide/Common/Licensing/)) | `resources[]`: `fieldExpr`, `dataSource`, `colorExpr`, `useColorAsDefault`; механизма скрытия в разделе нет ([API](https://js.devexpress.com/React/Documentation/ApiReference/UI_Components/dxScheduler/Configuration/resources/)), фильтрация — через data source приложения | Не проверено | Не проверено | Не проверено |
| **KendoReact Scheduler** `@progress/kendo-react-scheduler` 16.1.0, 2026-09-08 | Scheduler — компонент KendoReact **premium**, в Free не входит ([overview](https://www.telerik.com/kendo-react-ui/components/scheduler/)); подписка $649 / $749 / $1199 за разработчика в год ([pricing](https://www.telerik.com/kendo-react-ui/pricing)); механизм license key на проверенных страницах не описан (**не проверено**) | `resources` (`field`, `data`, `valueField`, `textField`), цвет от первого совпавшего resource, grouping ([resources](https://www.telerik.com/kendo-react-ui/components/scheduler/resources)); встроенного фильтра не найдено | Не проверено на странице Scheduler | Не проверено | Не проверено |
| **Bryntum Calendar** `@bryntum/calendar-react` 7.3.7, 2026-09-24 | Коммерческая; от $680 за разработчика при 3+ лицензиях ([store](https://bryntum.com/store/)). Пакет `@bryntum/calendar` в npm — placeholder с меткой MIT, сам продукт коммерческий | Sidebar по умолчанию содержит `resourceFilter` — список calendars/resources с переключением видимости; настраивается `selected`, `itemTpl`, groupers store, отключается через `null` (по форуму и трекеру поддержки: [forum](https://forum.bryntum.com/viewtopic.php?p=152403), [#2006](https://github.com/bryntum/support/issues/2006)); API-страница виджета не открылась (**частично проверено**) | Не проверено | Заявлен адаптивный UI ([product](https://bryntum.com/products/calendar/)) | Не проверено |
| **Mobiscroll** (npm-пакет из приватного registry, публичная версия не проверена) | Internal project $995–1955 perpetual; для B2B SaaS и любого multi-customer сценария обязательна SaaS-подписка (от $645/год за date & time pickers; цена SaaS для event calendar явно не указана — **не проверено**) ([pricing](https://mobiscroll.com/pricing)) | В calendar view нет встроенного списка resources; официальное демо фильтрует массив в приложении через `Segmented` в `renderHeader` ([demo](https://demo.mobiscroll.com/react/eventcalendar/resource-filtering-in-header)) | Не проверено | Mobile — сильная сторона продукта (заявлено) | Не проверено |
| **Event Calendar (vkurko)** `@event-calendar/core` 5.16.0, 2026-10-05 | MIT | Svelte 5 / vanilla; `eventFilter`, `filterEventsWithResources` ([repo](https://github.com/vkurko/calendar)); официального React-wrapper нет | Не проверено | Не проверено | Не React-компонент |
| **ilamy Calendar** `@ilamy/calendar` 3.2.0, 2026-10-03 | MIT | shadcn/Tailwind 4, React 19+, resources; встроенного source filter не найдено ([repo](https://github.com/kcsujeet/ilamy-calendar)) | Не проверено | Не проверено | Есть examples для Next.js; RSC-граница не проверена |

Headless-опции:

- `@full-ui/headless-calendar` 7.1.1 (2026-10-06, MIT) — headless-библиотека авторов FullCalendar и зависимость `@fullcalendar/react` 7.1.1. По описанию на [npm](https://www.npmjs.com/package/@full-ui/headless-calendar) функциональность пока не задокументирована, а как beta она предлагается отдельным пользователям FullCalendar Premium. Как самостоятельную production-опцию её рассматривать рано.
- `@h6s/calendar` 2.2.0 (Toss, 2026-03-24) — headless-hook сетки ([repo](https://github.com/toss/h6s)).
- `react-aria-components` 1.21.1 — date-picker `Calendar`, а не event calendar.

Ни одна из этих опций не даёт sources, selector, overflow или agenda.

## Composition-альтернатива

**Generic calendar + фильтрация в приложении.** Это самый частый путь на рынке: так устроены официальное демо Mobiscroll, react-big-calendar, Syncfusion add/remove и DevExtreme data source. Сама фильтрация дешёвая: `items.filter(i => visible.has(i.calendarId))` в несколько строк. Если calendar строит `+N`, agenda и counts из переданного массива, они согласуются автоматически. Пакет `0.2` тоже обрабатывает исчезновение item из `items` (правило для move draft, [§5.3](../specification-0.2.md)). Значит, **согласованность поверхностей сама по себе не является преимуществом встроенного фильтра**: при фильтрации на стороне приложения её получает любой controlled calendar.

Дорогое в composition — всё вокруг фильтра:

1. Доступный selector двух видов: desktop `menuitemcheckbox` с `aria-checked`, mobile sheet с именованными toggle, focus-recovery, когда sources меньше двух, закрытие при смене layout без orphan portal и `inert` ([§5.6](../specification-0.2.md), [§7](../specification-0.2.md), R39). Разработчику придётся строить и тестировать его на своём UI-kit, чтобы он вписался в toolbar календаря.
2. Accepted-only state: при асинхронном сохранении фильтра чекбокс не должен показывать optimistic-состояние, а label должен соответствовать принятому значению. Собственная реализация обычно делает optimistic toggle.
3. Единый цвет source в сегментах, agenda и selector с частичным override item и forced-colors fallback ([§10.3.3](../specification-0.2.md)). В composition это `eventPropGetter`/`className` плюс отдельная легенда.
4. Безопасная обработка неизвестного или дублирующегося `calendarId`. Наивный `filter` молча скрывает item, у которого нет известного source. Спецификация требует: item без `calendarId` виден всегда, item с неизвестным ID виден с fallback appearance и development warning, записи с повторяющимся source ID исключаются ([§5.6](../specification-0.2.md)).
5. Source title в accessible summary item ([§12.1](../specification-0.2.md)) без выдуманного label для неизвестного source.

**Headless-библиотеки** не снижают стоимость: selector, overflow, agenda и a11y-модель всё равно приходится писать самому, и это противоречит позиционированию «useful out of the box» ([§2](../specification-0.2.md)).

**Вывод.** Для разработчика, которому достаточно внешнего фильтра в своём sidebar, composition почти так же дёшева. API это поддерживает: `showSourceSelector={false}` при сохранённой controlled-паре, и фильтр всё равно применяется. Реальная экономия появляется, когда нужен готовый доступный selector в toolbar на desktop и mobile и единая модель цвета и summary. Эта гипотеза пока не проверена ни одним внешним участником.

## Конкретное преимущество

Против ближайшего аналога, MUI X Scheduler Community, и против composition:

| Преимущество | Где задано | Против кого |
| --- | --- | --- |
| Нет зависимости от чужой дизайн-системы: без `@mui/material`/Emotion, без license key, MIT, без telemetry | [§2](../specification-0.2.md) п. 8, [§13.2](../specification-0.2.md), [§16](../specification-0.2.md) | MUI X, Syncfusion, DevExtreme, Kendo, Bryntum, Mobiscroll, Schedule-X Sidebar (premium) |
| Сериализуемый controlled `visibleSourceIds: readonly string[]`; callback нормализует набор в порядке `sources`, не вызывается без изменения, игнорирует unknown/duplicate | [§5.6](../specification-0.2.md), [§5.7](../specification-0.2.md) `CalendarSourceFilterControlProps` | Императивные API: FullCalendar, TOAST UI, Syncfusion, Schedule-X `setCalendars` |
| Accepted-only checked state и labels (`hideSourceLabel`/`showSourceLabel`) при отложенном принятии | [§5.6](../specification-0.2.md), [§19.4](../specification-0.2.md) | Composition; у MUI X поведение при отложенном принятии **не проверено** |
| Встроенный selector, адаптированный под layout: desktop menu, mobile bottom sheet, focus-recovery | [§5.6](../specification-0.2.md), [§7](../specification-0.2.md), [§11.3](../specification-0.2.md) | FullCalendar, RBC, DevExtreme, Kendo, Mobiscroll (своего selector нет); у MUI side panel, mobile в нём experimental |
| Fail-open для неизвестного `calendarId` с development warning; duplicate source IDs исключаются детерминированно | [§5.6](../specification-0.2.md), [§4.3](../specification-0.2.md) | Наивная composition-фильтрация; у MUI X похожая семантика «нет в объекте — видим» для карты видимости, но поведение для события с неизвестным resource ID не документировано |
| Независимые generics `TItemData`/`TSourceData` в slots и appearance context | [§5.7](../specification-0.2.md) | Почти все альтернативы (у них resource — нетипизированная запись) |
| Accent source меняет только marker, не фон и не текст; partial override item; forced-colors | [§10.3.3](../specification-0.2.md) | Альтернативы, где resource color перекрашивает весь блок события и требует контроля контраста |
| Ориентация на СНГ: `ru-RU` по умолчанию, RU-документация | [§1.3](../specification-0.2.md) | Все перечисленные (у них EN-first; RU-локали есть у части, полнота **не проверена**) |

Где преимущества нет: сама фильтрация массива, согласованность counts при фильтрации на стороне приложения и наличие цвета у source есть почти у всех. Нельзя рекламировать эти пункты как уникальные.

## Риски

1. **Слабый измеренный спрос.** Все сигналы косвенные. Если участники заменят встроенный selector своим (`showSourceSelector={false}`), ценность epic сведётся к типизированным sources и цвету, а фильтр окажется дорогим в сопровождении слоем a11y и focus.
2. **Конкуренция с MUI X Scheduler.** Это MIT-аналог с controlled visibility, resource tree и целью WCAG 2.2 AA. Сейчас он в beta. Для команд на MUI он дешевле. Наше преимущество реально только для команд без MUI и с потребностью в mobile/СНГ; после выхода MUI из beta и стабилизации responsiveness разрыв по mobile может сократиться.
3. **Стоимость a11y.** Selector добавляет поверхности в overlay stack T16, R39 и R41 (empty sheet после update), focus-recovery, когда sources меньше двух. Это увеличивает объём alpha.2 и AT-матрицы T27.
4. **Взаимодействие с move.** R27: скрытый draft отменяется, уже выпущенный pending request сохраняется. Проверяется только в beta.1 (T24), поэтому alpha.2 покрывает фильтр лишь частично.
5. **Fail-open как неожиданность.** Item с опечаткой в `calendarId` остаётся видимым при скрытом проекте. Некоторые продукты сочтут это утечкой видимости (например, приватный проект). Нужно ясно описать в docs, что фильтр — функция UX, а не контроль доступа.
6. **Неподтверждённый CIS-пилот.** Без реального СНГ-продукта требование §19.3 не закрывается, а набор ещё не начат.
7. **Расхождение со спецификацией при `defer`.** Если epic откладывается после alpha.2, нужна явная правка §3.1/§5.6, а в §19.3 до начала пилотов назначается другая controlled-возможность вместо filter.

## Decision record

**Дата:** 6 октября 2026.

**Статус:** предложение brief (повторно проверено 6 октября 2026); утверждает maintainer проекта. **22 октября 2026:
решение «iterate» утверждено владельцем** (запись в [решениях 2026-10-22](decisions-2026-10-22.md#process); источник —
задача workflow DECISIONS-V8, у пользователя в сессии не перепроверялось, [оговорка](decisions-2026-10-22.md#approval-source)).
Набор участников T03 не начат; утверждение не заменяет ранний feedback и пилоты §19.3.

**Решение: `iterate`.** Включить sources в `0.2.0-alpha.2` (T17) как prerelease-возможность для раннего интеграционного feedback. Stable `go` не объявлять.

Основания:

- Сценарий массовый: у всех альтернатив есть свой механизм или демо, а в СНГ-продуктах встречаются ограниченные самодельные решения.
- Стоимость composition для selector + a11y + mobile существенная.
- Data-часть (типизированный source, accent, fail-open) дешёвая и нужна в любом случае: на неё опираются appearance T18 и summary §12.1.
- Ранний prerelease — единственный способ получить недостающие сигналы спроса.

Что не делать: не расширять epic (вложенные sources, поиск, группировка) до получения feedback.

Условия пересмотра в сторону `defer` встроенного selector при сохранении data-части:

- оба ранних участника отключают встроенный selector;
- или ни один не подтверждает асинхронное либо внешнее хранение фильтра;
- или к началу T19 не найден ни один участник из СНГ.

Пересмотр оформляется явной правкой спецификации.

**Владелец следующего шага:** maintainer проекта (Nelmad).

1. Явно запустить набор участников T03 (сейчас не начат): отдельно участники раннего alpha/beta feedback и отдельно двое зарезервированных для timed RC-onboarding без опыта с API `0.2`. Сохранить Next.js/Vite и минимум один реальный или запланированный СНГ-продукт.
2. До релиза T19 подтвердить или изменить это решение; после первого раннего feedback записать evidence в этот decision record.

### Что должен показать каждый из двух пилотов для stable `go` (§19.3, §2.1)

Общие для обоих:

- Проблема существует в реальном или запланированном продукте участника: в нём есть минимум два настоящих проекта или календаря, а не demo-набор.
- Core task выполнен только через public API, без private imports и неподдерживаемых workaround. Помощь maintainer записана как defect или workaround.
- Подключены минимум два реальных source с собственным типом `TSourceData`. Один скрыт и возвращён. Только после принятия props согласованно меняются grid, `+N`, agenda, counts и доступность actions. Domain items остаются в consumer store.
- Фильтр управляется controlled-парой `visibleSourceIds`/`onVisibleSourceIdsChange`, через встроенный selector или внешний при `showSourceSelector={false}`. В отчёте указано, какой вариант выбран и почему. До принятия checked state и labels не меняются.
- Item с неизвестным `calendarId` остаётся видимым с fallback appearance. Участник подтверждает, что такое поведение для продукта приемлемо.
- Участник подтверждает, что оставил бы возможность включённой, и называет конкретную зависимость, собственную реализацию или UX-ограничение, которое она устраняет (например, свой sidebar-фильтр, легенду цветов, MUI/Syncfusion).
- Нет открытых P0/P1 по epic. Отчёт содержит явный `go`. `iterate`/`defer` хотя бы в одном из двух отчётов не засчитывается.

Распределение между пилотами:

- **Пилот A (Next.js).** Production build с SSR/hydration без hydration mismatch по selector. Проверка keyboard smoke для desktop menu (`menuitemcheckbox`). Если это СНГ-продукт — `ru-RU` как resolved locale и язык package messages.
- **Пилот B (Vite).** Mobile layout с bottom sheet selector и IANA timezone (если они не покрыты пилотом A). Restore focus после закрытия sheet.
- Хотя бы один из двух пилотов — реальный или запланированный продукт для СНГ-аудитории. Хотя бы один использует mobile и IANA timezone.

После beta.1 хотя бы в одном пилоте дополнительно проверяется R27: скрытие source с активным move draft отменяет draft, а уже выпущенный pending request сохраняется. Это относится к move, а не к stable gate sources, но в отчёте фиксируется как взаимодействие epic.

## Источники

Все проверены 6 октября 2026.

- FullCalendar: https://fullcalendar.io/pricing, https://fullcalendar.io/docs/event-source, https://fullcalendar.io/docs/event-source-object, https://fullcalendar.io/docs/eventDisplay, https://fullcalendar.io/docs/upgrading-from-v6, https://github.com/fullcalendar/fullcalendar/issues/1147, https://github.com/fullcalendar/fullcalendar/issues/8088
- react-big-calendar: https://github.com/jquense/react-big-calendar, https://github.com/jquense/react-big-calendar/releases, https://github.com/bigcalendar/react-big-calendar/issues/963, https://github.com/jquense/react-big-calendar/issues/2037, https://github.com/bigcalendar/react-big-calendar/issues/2764
- Schedule-X: https://schedule-x.dev/premium, https://schedule-x.dev/docs/calendar/plugins/sidebar, https://schedule-x.dev/docs/calendar/plugins/calendar-controls, https://schedule-x.dev/docs/frameworks/react
- TOAST UI Calendar: https://github.com/nhn/tui.calendar, https://github.com/nhn/tui.calendar/blob/main/docs/en/apis/calendar.md
- MUI X Scheduler: https://mui.com/x/react-scheduler/, https://mui.com/x/react-scheduler/event-calendar/resources/, https://mui.com/x/api/scheduler/event-calendar/, https://mui.com/x/react-scheduler/accessibility/, https://mui.com/x/react-scheduler/quickstart/, https://mui.com/pricing/, https://github.com/mui/mui-x/issues/21568
- DayPilot: https://doc.daypilot.org/month/event-filtering/, https://javascript.daypilot.org/buy/
- Syncfusion: https://ej2.syncfusion.com/react/documentation/schedule/resources, https://ej2.syncfusion.com/react/demos/schedule/add-remove-resources/, https://ej2.syncfusion.com/react/documentation/schedule/accessibility, https://www.syncfusion.com/sales/communitylicense, https://www.syncfusion.com/sales/teamlicense
- DevExtreme: https://js.devexpress.com/React/Documentation/ApiReference/UI_Components/dxScheduler/Configuration/resources/, https://js.devexpress.com/Buy/, https://js.devexpress.com/React/Documentation/Guide/Common/Licensing/
- KendoReact: https://www.telerik.com/kendo-react-ui/components/scheduler/, https://www.telerik.com/kendo-react-ui/components/scheduler/resources, https://www.telerik.com/kendo-react-ui/pricing
- Bryntum: https://bryntum.com/products/calendar/, https://bryntum.com/store/, https://forum.bryntum.com/viewtopic.php?p=152403, https://github.com/bryntum/support/issues/2006
- Mobiscroll: https://mobiscroll.com/pricing, https://demo.mobiscroll.com/react/eventcalendar/resource-filtering-in-header
- Event Calendar / ilamy: https://github.com/vkurko/calendar, https://github.com/kcsujeet/ilamy-calendar
- Headless: https://www.npmjs.com/package/@full-ui/headless-calendar, https://github.com/toss/h6s
- Сигналы UX/СНГ: https://support.google.com/calendar/answer/34580?hl=en&co=GENIE.Platform%3DDesktop, https://help.yougile.com/books/baza-znanii-yougile/page/vid-kalendar, https://faq-ru.kaiten.site/filtry-v-kalendarnom-vide (не открылась при обеих проверках)
- Версии и даты: npm registry, `npm view <package> version` и `time[<version>]` на 2026-10-06; `@mobiscroll/react` в публичном registry отсутствует (404) (react-big-calendar, @schedule-x/*, @toast-ui/calendar, @daypilot/daypilot-lite-react, @syncfusion/ej2-react-schedule, devextreme-react, @bryntum/calendar(-react), @progress/kendo-react-scheduler, @mui/x-scheduler(-premium), @fullcalendar/react, @full-ui/headless-calendar, @h6s/calendar, react-aria-components, @ilamy/calendar, @event-calendar/core).
