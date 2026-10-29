# Справочник API @nelmad/calendar — 0.2.0-alpha.2

[English](api.md) · **Русский** · [README](../README.ru.md) · [Переход с 0.1](migration-0.1-to-0.2.ru.md)

<a id="overview"></a>
## Обзор

Справочник описывает ровно публичную поверхность prerelease `0.2.0-alpha.2`: корневой entry `@nelmad/calendar` и таблицу
стилей `@nelmad/calendar/styles.css`. [Сгенерированный отчёт API](api/calendar.api.md), который API Extractor строит по
опубликованному `dist/index.d.ts`, содержит точный текст declarations; эта страница объясняет поведение, значения по
умолчанию и валидацию.

Опубликованные declarations также называют props запланированного API `0.2`, которых нет в этом prerelease. Они
типизированы как `?: never`, поэтому код с ними не компилируется, а runtime удаляет их с предупреждением в development.
Они перечислены только в разделе [Props, недоступные в alpha.2](#unavailable) и не входят в контракт alpha.2.

Обозначения: «contract error» — календарь показывает безопасную оболочку ошибки вместо сетки (см.
[Диагностику](#diagnostics)); «исключается» — одна запись не показывается, остальное рендерится; «предупреждение» —
`console.warn` только в development вида `[@nelmad/calendar] <path>: <reason>`, один раз на экземпляр календаря.
Production-сборки ведут себя так же и ничего не выводят. Все входные массивы считаются неизменяемыми, календарь их не
копирует и не меняет.

<a id="exports"></a>
## Экспорты из корня

| Экспорт | Вид | Кратко |
| --- | --- | --- |
| [`Calendar`](#export-calendar) | компонент | Вид месяца с повесткой дня |
| [`getCalendarVisibleRange`](#export-getcalendarvisiblerange) | функция | Чистый helper: точный диапазон сетки для предзагрузки |
| [`classicTheme`](#export-classictheme) | значение | Встроенный preset темы |
| [`neutralTheme`](#export-neutraltheme) | значение | Второй встроенный preset темы |
| [`CalendarProps`](#export-calendarprops) | тип | Props `Calendar` |
| [`CalendarBaseProps`](#export-calendarbaseprops) | тип | Props без контролируемой пары повестки |
| [`CalendarAgendaControlProps`](#export-calendaragendacontrolprops) | тип | Пара `agendaDate` / `onAgendaDateChange` |
| [`CalendarSourceFilterControlProps`](#export-calendarsourcefiltercontrolprops) | тип | `sources` и контролируемый фильтр sources |
| [`CalendarItemActionsProps`](#export-calendaritemactionsprops) | тип | Пара `getItemActions` / `onItemActionRequest` |
| [`CalendarSource`](#export-calendarsource) | тип | Один source (календарь) items |
| [`CalendarItemAction`](#export-calendaritemaction) | тип | Одно действие потребителя над item |
| [`CalendarItemActionRequest`](#export-calendaritemactionrequest) | тип | Payload `onItemActionRequest` |
| [`CalendarItem`](#export-calendaritem) | тип | Одна запись |
| [`CalendarInterval`](#export-calendarinterval) | тип | All-day или timed интервал |
| [`ISODate`](#export-isodate) | тип | `YYYY-MM-DD` |
| [`RFC3339DateTime`](#export-rfc3339datetime) | тип | Timestamp со смещением |
| [`IanaTimeZone`](#export-ianatimezone) | тип | Принятый IANA identifier |
| [`CalendarDateRange`](#export-calendardaterange) | тип | Диапазон дат с исключённым концом |
| [`CalendarVisibleRange`](#export-calendarvisiblerange) | тип | Диапазон сетки с часовым поясом |
| [`CalendarVisibleRangeOptions`](#export-calendarvisiblerangeoptions) | тип | Options `getCalendarVisibleRange` |
| [`CalendarWeekday`](#export-calendarweekday) | тип | `'monday'` … `'sunday'` |
| [`CalendarItemPressRequest`](#export-calendaritempressrequest) | тип | Payload `onItemPress` |
| [`CalendarSortContext`](#export-calendarsortcontext) | тип | Контекст `sortItems` |
| [`CalendarDataState`](#export-calendardatastate) | тип | Готово, загрузка или ошибка |
| [`CalendarLayout`](#export-calendarlayout) | тип | `'auto' \| 'desktop' \| 'mobile'` |
| [`CalendarAgendaPresentation`](#export-calendaragendapresentation) | тип | `'auto' \| 'overlay'` |
| [`CalendarDensity`](#export-calendardensity) | тип | `'compact' \| 'comfortable'` |
| [`CalendarColorScheme`](#export-calendarcolorscheme) | тип | `'system' \| 'light' \| 'dark'` |
| [`CalendarDirection`](#export-calendardirection) | тип | `'ltr' \| 'rtl'` |
| [`CalendarHourCycle`](#export-calendarhourcycle) | тип | `12 \| 24` |
| [`CalendarTheme`](#export-calendartheme) | тип | Непрозрачный preset темы |
| [`CalendarThemeTokens`](#export-calendarthemetokens) | тип | Семантические tokens |
| [`CalendarCSSVariable`](#export-calendarcssvariable) | тип | 27 публичных CSS-переменных |
| [`CalendarMessages`](#export-calendarmessages) | тип | Полный каталог сообщений |
| [`CalendarItemAppearance`](#export-calendaritemappearance) | тип | Результат `getItemAppearance` |
| [`CalendarItemAppearanceContext`](#export-calendaritemappearancecontext) | тип | Контекст `getItemAppearance` |
| [`CalendarRootState`](#export-calendarrootstate) | тип | Состояние class callbacks корня и status |
| [`CalendarResolvedLayout`](#export-calendarresolvedlayout) | тип | `'desktop' \| 'mobile'` |
| [`CalendarResolvedAgendaPresentation`](#export-calendarresolvedagendapresentation) | тип | `'inline' \| 'popover' \| 'sheet'` |
| [`CalendarDayState`](#export-calendardaystate) | тип | Состояние одной ячейки даты |
| [`CalendarItemView`](#export-calendaritemview) | тип | `'month' \| 'agenda'` |
| [`CalendarItemSlotContext`](#export-calendaritemslotcontext) | тип | Контекст slots и class callbacks item |
| [`CalendarMonthItemSlotContext`](#export-calendarmonthitemslotcontext) | тип | Ветвь Month контекста item |
| [`CalendarAgendaItemSlotContext`](#export-calendaragendaitemslotcontext) | тип | Ветвь повестки контекста item |
| [`CalendarAgendaState`](#export-calendaragendastate) | тип | Состояние class callback повестки |
| [`CalendarOverflowState`](#export-calendaroverflowstate) | тип | Состояние class callback `+N` |
| [`CalendarToolbarSlotContext`](#export-calendartoolbarslotcontext) | тип | Контекст `renderToolbarContent` |
| [`CalendarLoadingSlotContext`](#export-calendarloadingslotcontext) | тип | Контекст `renderLoading` |
| [`CalendarEmptySlotContext`](#export-calendaremptyslotcontext) | тип | Контекст `renderEmpty` |
| [`CalendarErrorSlotContext`](#export-calendarerrorslotcontext) | тип | Контекст `renderError` |
| [`CalendarClassName`](#export-calendarclassname) | тип | Строка класса или чистый class callback |
| [`CalendarClassNames`](#export-calendarclassnames) | тип | Объект `classNames` |
| [`CalendarDataAttribute`](#export-calendardataattribute) | тип | Имена стабильных атрибутов `data-*` |

Других публичных значений в корне и subpaths нет. Внутренние модули, классы и структура DOM не являются API.

<a id="export-calendar"></a>
### `Calendar`

```ts
function Calendar<TItemData = unknown, TSourceData = unknown>(props: CalendarProps<TItemData, TSourceData>): ReactElement;
```

Клиентский компонент (пакет сам объявляет границу `'use client'`). `TItemData` типизирует `item.data` во всех callbacks.
`TSourceData` типизирует `source.data` в `sources` независимо от `TItemData`. Подключите `@nelmad/calendar/styles.css` в
каждой CSS tree scope, где есть календарь или один из его portals: popover и sheet повестки рендерятся не внутри корня
календаря, а в `body` документа, в модальном диалоге хоста вокруг календаря или в [`portalContainer`](#prop-portalcontainer).
Поэтому календарю внутри `ShadowRoot` с portal по умолчанию таблица нужна и в shadow root, и в документе. См.
[Props](#props).

<a id="export-getcalendarvisiblerange"></a>
### `getCalendarVisibleRange`

```ts
function getCalendarVisibleRange(options: CalendarVisibleRangeOptions): CalendarVisibleRange;
```

Возвращает диапазон сетки, который `Calendar` отрисует при тех же `anchorDate`, `timeZone`, `locale` и `firstDayOfWeek`: от
первого `firstDayOfWeek` не позже первого дня месяца до конца последней недели с днём месяца (4–6 недель), с исключённым
`end`. Значения по умолчанию те же, что у `Calendar` (`locale` `ru-RU`, первый день недели из locale). Функция не читает
часы, DOM и locale хоста и работает на сервере. Невалидный вход синхронно бросает `RangeError`, например
`Expected YYYY-MM-DD in 0001…9999`, `anchorDate must be between February 0001 and November 9999`,
`Timezone is outside the package accepted-set`, `locale must be a well-formed BCP 47 tag`; частичный диапазон не
возвращается.

<a id="export-classictheme"></a>
### `classicTheme`

`const classicTheme: CalendarTheme` — замороженный preset с `name` `"classic"`, `theme` по умолчанию. Календарь узнаёт
presets, созданные пакетом: структурная копия — contract error. Это относится и к preset, переданному prop из React Server
Component в клиентский компонент: он приходит сериализованным. Импортируйте `classicTheme` в клиентском компоненте, который
рендерит `Calendar`. Сборки ESM и CommonJS — один пакет: preset, импортированный через `require`, работает с `Calendar`,
импортированным через `import`, и наоборот.

<a id="export-neutraltheme"></a>
### `neutralTheme`

`const neutralTheme: CalendarTheme` — замороженный preset с `name` `"neutral"`: сдержанная серо-синяя палитра, меньшие
радиусы и более лёгкая тень overlay. Он меняет только цвета, радиусы, тень overlay и параметры motion; раскладка, роли,
focus и клавиатура те же, что у `classicTheme`. Сочетается с обеими плотностями и любым `colorScheme`. Как и
`classicTheme`, узнаётся как preset, созданный пакетом (в любом формате модулей): импортируйте его в клиентском
компоненте, который рендерит `Calendar`.

<a id="export-calendarprops"></a>
### `CalendarProps`

```ts
type CalendarProps<TItemData = unknown, TSourceData = unknown> =
    CalendarBaseProps<TItemData, TSourceData> & CalendarAgendaControlProps & CalendarSourceFilterControlProps<TSourceData>
    & CalendarItemActionsProps<TItemData> & Unavailable<UnavailableProp>;
```

Канонический тип props. `Unavailable` делает каждый prop вне alpha.2 необязательным `never`. Каждый ключ описан в
разделе [Props](#props).

<a id="export-calendarbaseprops"></a>
### `CalendarBaseProps`

`CalendarBaseProps<TItemData, TSourceData>` содержит все props alpha.2, кроме контролируемых пар (повестка, фильтр sources, действия items); `layout`
необязателен. Для компонентов, пробрасывающих props, используйте `CalendarProps`.

<a id="export-calendaragendacontrolprops"></a>
### `CalendarAgendaControlProps`

```ts
type CalendarAgendaControlProps =
    | {agendaDate: ISODate; onAgendaDateChange: (date: ISODate) => void}
    | {agendaDate?: never; onAgendaDateChange?: never};
```

Оба или ни одного. Во время выполнения одно без другого — contract error.

<a id="export-calendarsourcefiltercontrolprops"></a>
### `CalendarSourceFilterControlProps`

```ts
type CalendarSourceFilterControlProps<TSourceData = unknown> =
    | {sources?: readonly CalendarSource<TSourceData>[]; visibleSourceIds?: never; onVisibleSourceIdsChange?: never; showSourceSelector?: never}
    | {sources: readonly CalendarSource<TSourceData>[]; visibleSourceIds: readonly string[];
        onVisibleSourceIdsChange: (visibleSourceIds: readonly string[]) => void; showSourceSelector?: boolean};
```

Либо sources без фильтра, либо контролируемый фильтр: `visibleSourceIds` вместе с `onVisibleSourceIdsChange`, которым
нужны и `sources`; `showSourceSelector` бывает только с парой. Во время выполнения половина пары, фильтр без `sources` или
`showSourceSelector` без пары — contract error. См. [`sources`](#prop-sources).

<a id="export-calendaritemactionsprops"></a>
### `CalendarItemActionsProps`

```ts
type CalendarItemActionsProps<TItemData = unknown> =
    | {getItemActions: (item: CalendarItem<TItemData>) => readonly CalendarItemAction[];
        onItemActionRequest: (request: CalendarItemActionRequest<TItemData>) => void}
    | {getItemActions?: never; onItemActionRequest?: never};
```

Оба или ни одного. Во время выполнения одно без другого — contract error. См. [`getItemActions`](#prop-getitemactions).

<a id="export-calendarsource"></a>
### `CalendarSource`

```ts
type CalendarSource<TSourceData = unknown> = {id: string; title: string; color?: string; data?: TSourceData};
```

Source (календарь), на который items ссылаются через `calendarId`. `id` и `title` непустые после `trim`, IDs уникальны.
Непустой CSS-цвет `color` окрашивает только accent marker items этого source и самого source в selector, но не их фон или
текст (см. [`getItemAppearance`](#prop-getitemappearance)); пустой или нестроковый `color`, а также `color`, который не
является одним значением CSS-декларации (правило [`tokens`](#prop-tokens)), игнорируется с development warning, и items
сохраняют `color.accent`. `data` передаётся как есть.

<a id="export-calendaritemaction"></a>
### `CalendarItemAction`

```ts
type CalendarItemAction = {id: string; label: string; tone?: 'default' | 'danger'};
```

Одно действие потребителя. `id` непустой и уникальный в пределах item, `label` непустой после `trim`; `tone: 'danger'`
только оформляет control (встроенного подтверждения нет).

<a id="export-calendaritemactionrequest"></a>
### `CalendarItemActionRequest`

```ts
type CalendarItemActionRequest<TItemData = unknown> = {item: CalendarItem<TItemData>; actionId: string};
```

Payload [`onItemActionRequest`](#prop-onitemactionrequest): item последних committed props с этим `id` и `id`
активированного действия.

<a id="export-calendaritem"></a>
### `CalendarItem`

```ts
type CalendarItem<TItemData = unknown> = {
    id: string;
    title: string;
    calendarId?: string;
    interval: CalendarInterval;
    data: TItemData;
};
```

- `id`: непуст после trim и уникален в `items`. Все items с одинаковым `id` исключаются с предупреждением.
- `title`: строка; пустое название показывается как `untitledItemLabel` с предупреждением. Названия — простой текст с
  bidi-изоляцией, никогда не HTML.
- `calendarId`: строка, если задан. Связывает item с одним из [`sources`](#prop-sources): к нему применяются фильтр
  sources и accent-цвет source. Item, чей `calendarId` не совпадает ни с одним валидным source, остаётся видимым с базовым
  accent, а предупреждение выводится один раз на неизвестный ID и называет его первый item (`items[i].calendarId`); без
  prop `sources` все такие items покрывает одно предупреждение (`items[].calendarId`).
- `data`: ваше доменное значение. Календарь его не читает, не клонирует и не сравнивает, а callbacks возвращают тот же
  объект item.
- Запись, которая не является объектом, имеет невалидный `id`, нестроковый `title` или `calendarId` либо невалидный
  `interval`, исключается с предупреждением, где указан её индекс.

<a id="export-calendarinterval"></a>
### `CalendarInterval`

```ts
type CalendarInterval =
    | {kind: 'allDay'; start: ISODate; end: ISODate}
    | {kind: 'timed'; start: RFC3339DateTime; end?: RFC3339DateTime; timeZone?: IanaTimeZone};
```

- **All-day**: только даты; `end` исключается и должен быть позже `start`. Часовые пояса их не сдвигают.
- **Timed**: instants. `end` не может быть раньше `start` (сравниваются instants, а не строки). Без `end` или с `end`,
  равным `start`, item — момент в дату своего начала. Timed item ненулевой длины принадлежит каждой дате `D`, на которую в
  `timeZone` календаря приходится хотя бы один instant из `[start, end)`; исключённый конец в полночь не добавляет
  следующую дату. У локальной даты может быть ноль, один или несколько диапазонов instants около переходов DST и
  исторических смен; фиксированные 24 часа не предполагаются.
- **`timeZone`** (только timed): зона автора. Должна быть принятым identifier, иначе item исключается. В alpha.2 она только
  проверяется и сохраняется.
- All-day items рисуются полосами (bars); timed item на одной локальной дате — chip; timed item на нескольких локальных
  датах — bar.

<a id="export-isodate"></a>
### `ISODate`

`string` точно в форме `YYYY-MM-DD`: существующая дата пролептического григорианского календаря с годом `0001`–`9999`.
`2026-9-8`, `2026-02-30` и `0000-01-01` невалидны. Locale меняет только представление.

<a id="export-rfc3339datetime"></a>
### `RFC3339DateTime`

`string` вида `YYYY-MM-DDTHH:mm:ss`, необязательная `.` с 1–3 цифрами, затем `Z` или `±HH:MM` (`T` и `Z` заглавные). Не
принимаются: отсутствие смещения, `24:00`, leap seconds, `-00:00`, точность выше миллисекунд, несуществующие даты и
instants вне `0001-01-01T00:00:00.000Z`…`9999-12-31T23:59:59.999Z` после применения смещения. Диапазон лет относится к
этому instant, а не к записанной дате: `0000-12-31T23:30:00-01:00` — это `0001-01-01T00:30:00Z`, он принимается.

<a id="export-ianatimezone"></a>
### `IanaTimeZone`

`string`; принимается, только если точно, с учётом регистра, совпадает с `UTC` или одним из primary identifiers пакета.
См. [Допустимые часовые пояса](#time-zones).

<a id="export-calendardaterange"></a>
### `CalendarDateRange`

`{start: ISODate; end: ISODate}` с исключённым `end`, который позже `start`.

<a id="export-calendarvisiblerange"></a>
### `CalendarVisibleRange`

`CalendarDateRange & {timeZone: IanaTimeZone}`: даты отрисованной сетки, включая дни соседних месяцев, и `timeZone`
календаря, в которой они понимаются. Переводите локальные даты в instants по правилам вашей зоны, а не прибавлением 24 часов.

<a id="export-calendarvisiblerangeoptions"></a>
### `CalendarVisibleRangeOptions`

`{anchorDate: ISODate; timeZone: IanaTimeZone; locale?: string; firstDayOfWeek?: CalendarWeekday}`; проверяется так же, как
одноимённые props.

<a id="export-calendarweekday"></a>
### `CalendarWeekday`

`'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday'`.

<a id="export-calendaritempressrequest"></a>
### `CalendarItemPressRequest`

```ts
type CalendarItemPressRequest<TItemData = unknown> = {item: CalendarItem<TItemData>; date: ISODate} & (
    | {view: 'month'; segmentRange: CalendarDateRange}
    | {view: 'agenda'; segmentRange?: never}
);
```

- `view: 'month'`: нажатие указателем на chip или bar в сетке. `date` — ячейка даты под указателем внутри `segmentRange`,
  части item, нарисованной в этой неделе (обрезана по неделе, конец исключён).
- `view: 'agenda'`: активация кнопки item в повестке дня (указатель, `Enter` или `Space`). `date` — дата повестки.
- `item` — объект из ваших `items`.

<a id="export-calendarsortcontext"></a>
### `CalendarSortContext`

`{timeZone: IanaTimeZone}`: часовой пояс календаря, единственный контекст, который получает `sortItems`.

<a id="export-calendardatastate"></a>
### `CalendarDataState`

```ts
type CalendarDataState =
    | {status: 'ready'}
    | {status: 'loading'; phase: 'initial' | 'refresh'}
    | {status: 'error'; phase: 'initial' | 'refresh'; error: unknown};
```

| Состояние | Сетка и повестка | Toolbar | Область состояния | Live region |
| --- | --- | --- | --- | --- |
| `ready` | Показаны; если ни один валидный item не пересекает видимый диапазон, добавляется область «пусто» | Доступен | Только область «пусто» | Polite: обновление завершено, один раз после `loading/refresh` |
| `loading/initial` | Заменены skeleton той же высоты | Навигация выключена | Именованная область загрузки | Polite: загрузка |
| `loading/refresh` | Сохранены на месте; сетка и inline-повестка `aria-busy="true"` (корень, его live regions и повестка в popover или sheet — нет) | Доступен, не сдвигается | Полоса прогресса 3 px с именем «обновление» по верхней границе сетки; места не занимает и не является region, поэтому имя выставлено один раз, у progressbar | Нет в начале (объявление месяца «Предыдущий»/«Следующий» не заменяется) |
| `error/initial` | Заменены областью той же высоты | Навигация выключена | Именованная область ошибки, «Повторить» при `onRetryRequest` | Urgent: ошибка |
| `error/refresh` | Сохранены на месте, ниже на высоту баннера | Доступен, не сдвигается | Неблокирующий баннер ошибки между toolbar и сеткой, «Повторить» при `onRetryRequest` | Urgent: ошибка |

`phase` определяет блокирующий режим или сохранение прежнего содержимого; длина `items` для этого никогда не используется.
Блокирующее состояние закрывает повестку, её menus и selector sources (его trigger на это время отключён) и отменяет
ожидающие запросы навигации и focus повестки; позже они не возобновляются. Контролируемые props не очищаются. `error` принадлежит приложению и не отображается.

<a id="export-calendarlayout"></a>
### `CalendarLayout`

`'auto' | 'desktop' | 'mobile'` — значения необязательного prop [`layout`](#prop-layout). Сам календарь всегда
разрешается в `'desktop'` или `'mobile'` (`data-layout`).

<a id="export-calendaragendapresentation"></a>
### `CalendarAgendaPresentation`

`'auto' | 'overlay'` — значения [`agendaPresentation`](#prop-agendapresentation). Разрешённая presentation — popover,
inline или sheet (`data-presentation`).

<a id="export-calendardensity"></a>
### `CalendarDensity`

`'compact' | 'comfortable'`.

<a id="export-calendarcolorscheme"></a>
### `CalendarColorScheme`

`'system' | 'light' | 'dark'`.

<a id="export-calendardirection"></a>
### `CalendarDirection`

`'ltr' | 'rtl'`.

<a id="export-calendarhourcycle"></a>
### `CalendarHourCycle`

`12 | 24`. `12` форматируется с `hourCycle: 'h12'` и часом без ведущего нуля (`4:00 PM`), `24` — с `'h23'` и двузначным
часом в любой локали (`09:00`, в полночь `00:05`; `00.05` в `fi-FI`). Время, которое повторяет переход DST, показывается
со смещением UTC.

<a id="export-calendartheme"></a>
### `CalendarTheme`

`Readonly<{name: string; [calendarThemeBrand]: true}>`: непрозрачный branded preset. Допустимы только presets пакета:
`classicTheme` и `neutralTheme`.

<a id="export-calendarthemetokens"></a>
### `CalendarThemeTokens`

Вложенные необязательные группы строковых tokens: `color`, `typography`, `spacing`, `density`, `radii`, `shadows`, `motion`,
`components`. Каждый token соответствует одной CSS-переменной; см. [Tokens и CSS-переменные](#tokens).

<a id="export-calendarcssvariable"></a>
### `CalendarCSSVariable`

Union 27 имён публичных custom properties из таблицы [Tokens и CSS-переменные](#tokens). `style` принимает их без type
assertion.

<a id="export-calendarmessages"></a>
### `CalendarMessages`

Полный каталог строк пакета: строковые ключи и функции, возвращающие строку. `messages` принимает
`Partial<CalendarMessages>`. См. [Каталог сообщений](#messages).

<a id="export-calendaritemappearance"></a>
### `CalendarItemAppearance`

`{accentColor?: string; backgroundColor?: string; textColor?: string}`: частичное переопределение на уровне item, см.
[`getItemAppearance`](#prop-getitemappearance).

<a id="export-calendaritemappearancecontext"></a>
### `CalendarItemAppearanceContext`

`{timeZone: IanaTimeZone; source?: CalendarSource<TSourceData>}`: зона календаря и известный source item. Сегмента и даты в
нём нет: один appearance относится ко всему item.

<a id="export-calendarrootstate"></a>
### `CalendarRootState`

`{layout: CalendarResolvedLayout; density; colorScheme; dir}` и одна из ветвей `{kind: 'data'; dataState: CalendarDataState}`
или `{kind: 'contract'; dataState: {status: 'error'; phase: 'initial'; error: Error}}`. `layout` всегда разрешённый,
`colorScheme` — запрошенное значение. Ветвь `contract` получают только `classNames.root` и `classNames.status`.

<a id="export-calendarresolvedlayout"></a>
### `CalendarResolvedLayout`

`'desktop' | 'mobile'`: фактически отрисованная раскладка (`auto` не бывает разрешённым значением).

<a id="export-calendarresolvedagendapresentation"></a>
### `CalendarResolvedAgendaPresentation`

`'inline' | 'popover' | 'sheet'`: фактически отрисованная presentation повестки, как в `data-presentation`.

<a id="export-calendardaystate"></a>
### `CalendarDayState`

`{date; isToday; isAgendaDate; isSelected; isSelectionDraft; isOutsideMonth; isSelectionUnavailable; unavailableReason?;
itemCount}`: состояние одной ячейки даты для `renderDayHeader`, `classNames.day` и `classNames.dayHeader`. `itemCount` считает
валидные items, прошедшие принятый фильтр sources. Поля выделения равны `false`, пока выделение не появится в beta.1.

<a id="export-calendaritemview"></a>
### `CalendarItemView`

`'month' | 'agenda'`: где показан item, как в `data-view`.

<a id="export-calendaritemslotcontext"></a>
### `CalendarItemSlotContext`

`{item; source?; isSelected; isDragging; isPending; isDisabled}` с ветвью `{view: 'month'; segmentRange}` или
`{view: 'agenda'; date}`. В ветви Month `segmentRange` — обрезанный полуоткрытый диапазон одного непрерывного сегмента строки
недели; в ветви повестки `date` — дата повестки. `source` есть только у известного source. `isDisabled` означает, что в этом
представлении нет основного нажатия (Month) либо нет ни нажатия, ни действия (повестка). `isSelected`, `isDragging` и
`isPending` в alpha.2 остаются `false` (выделение и перенос появятся в beta.1).

<a id="export-calendarmonthitemslotcontext"></a>
### `CalendarMonthItemSlotContext`

Ветвь `view: 'month'` типа `CalendarItemSlotContext` для `renderItem` и `classNames.item`.

<a id="export-calendaragendaitemslotcontext"></a>
### `CalendarAgendaItemSlotContext`

Ветвь `view: 'agenda'` типа `CalendarItemSlotContext` для `renderAgendaItem`, `classNames.agendaItem` и
`classNames.itemActions`.

<a id="export-calendaragendastate"></a>
### `CalendarAgendaState`

`{date: ISODate; presentation: CalendarResolvedAgendaPresentation; itemCount: number}` для `classNames.agenda`.

<a id="export-calendaroverflowstate"></a>
### `CalendarOverflowState`

`CalendarDayState & {hiddenItemCount: number}` для `classNames.overflowIndicator`.

<a id="export-calendartoolbarslotcontext"></a>
### `CalendarToolbarSlotContext`

Ветвь `kind: 'data'` типа `CalendarRootState` с `anchorDate` и `visibleRange` для `renderToolbarContent` и
`classNames.toolbar`. В оболочке contract error панели инструментов нет, поэтому нет и ветви contract.

<a id="export-calendarloadingslotcontext"></a>
### `CalendarLoadingSlotContext`

`{state: {status: 'loading'; phase}; visibleRange}` для `renderLoading`.

<a id="export-calendaremptyslotcontext"></a>
### `CalendarEmptySlotContext`

`{visibleRange: CalendarVisibleRange}` для `renderEmpty`.

<a id="export-calendarerrorslotcontext"></a>
### `CalendarErrorSlotContext`

Либо `{kind: 'data'; state; visibleRange; hasStaleItems}` для ошибки данных, либо `{kind: 'contract'; error: Error;
hasStaleItems: false}` для оболочки contract error, в которой нет диапазона и повтора.

<a id="export-calendarclassname"></a>
### `CalendarClassName`

`string | ((state: TState) => string | undefined)`: строка класса или чистый callback типизированного состояния поверхности.

<a id="export-calendarclassnames"></a>
### `CalendarClassNames`

Ключи [`classNames`](#prop-classnames) с типами состояний: `root`, `status` (`CalendarRootState`), `toolbar`
(`CalendarToolbarSlotContext`), `sourceSelector`, `grid`, `weekdayHeader` (только ветвь `kind: 'data'`), `day`,
`dayHeader` (`CalendarDayState`), `item` (`CalendarMonthItemSlotContext`), `itemActions`, `agendaItem`
(`CalendarAgendaItemSlotContext`), `overflowIndicator` (`CalendarOverflowState`), `agenda` (`CalendarAgendaState`).

<a id="export-calendardataattribute"></a>
### `CalendarDataAttribute`

Объединение имён стабильных атрибутов из раздела [Атрибуты `data-*`](#data-attributes).

<a id="props"></a>
## Props

| Prop | Тип | Обязателен / по умолчанию | Невалидное значение |
| --- | --- | --- | --- |
| [`items`](#prop-items) | `readonly CalendarItem<TItemData>[]` | обязателен | не массив: contract error; плохая запись: исключается |
| [`timeZone`](#prop-timezone) | `IanaTimeZone` | обязателен | contract error |
| [`anchorDate`](#prop-anchordate) | `ISODate` | обязателен | contract error |
| [`onNavigate`](#prop-onnavigate) | `(anchorDate: ISODate) => void` | обязателен | contract error |
| [`layout`](#prop-layout) | `CalendarLayout` | `'auto'` | contract error |
| [`mobileBreakpoint`](#prop-mobilebreakpoint) | `number` (CSS px) | `640` | не положительное конечное число: contract error |
| [`agendaPresentation`](#prop-agendapresentation) | `CalendarAgendaPresentation` | `'auto'` | contract error |
| [`onVisibleRangeChange`](#prop-onvisiblerangechange) | `(range: CalendarVisibleRange) => void` | необязателен | не функция: contract error |
| [`today`](#prop-today) | `ISODate` | необязателен; неизвестен до hydration | contract error |
| [`locale`](#prop-locale) | `string` (BCP 47) | `'ru-RU'` | синтаксически неверный: contract error; неподдерживаемый: `en-US` + предупреждение |
| [`firstDayOfWeek`](#prop-firstdayofweek) | `CalendarWeekday` | из `locale`, иначе `'monday'` | contract error |
| [`hourCycle`](#prop-hourcycle) | `CalendarHourCycle` | из `locale`, иначе `24` | contract error |
| [`dir`](#prop-dir) | `CalendarDirection` | из `locale`, иначе `'ltr'` | contract error |
| [`agendaDate`](#prop-agendadate) | `ISODate` | необязателен, пара | невалидный или без пары: contract error |
| [`onAgendaDateChange`](#prop-onagendadatechange) | `(date: ISODate) => void` | необязателен, пара | без пары или не функция: contract error |
| [`dataState`](#prop-datastate) | `CalendarDataState` | `{status: 'ready'}` | contract error |
| [`onRetryRequest`](#prop-onretryrequest) | `() => void` | необязателен | не функция: contract error |
| [`onItemPress`](#prop-onitempress) | `(request: CalendarItemPressRequest<TItemData>) => void` | необязателен | не функция: contract error |
| [`sortItems`](#prop-sortitems) | `(a, b, context: CalendarSortContext) => number` | встроенный порядок | не функция: contract error; не конечный результат: `0` + предупреждение |
| [`theme`](#prop-theme) | `CalendarTheme` | `classicTheme` | не preset: contract error |
| [`density`](#prop-density) | `CalendarDensity` | `'compact'` | contract error |
| [`colorScheme`](#prop-colorscheme) | `CalendarColorScheme` | `'system'` | contract error |
| [`tokens`](#prop-tokens) | `CalendarThemeTokens` | значения темы | пустое, нестроковое или не одно значение декларации: игнорируется + предупреждение |
| [`messagesLocale`](#prop-messageslocale) | `string` (BCP 47) | разрешённый `locale` | синтаксически неверный: contract error |
| [`messages`](#prop-messages) | `Partial<CalendarMessages>` | встроенный каталог | пустое или неверной формы: встроенный текст + предупреждение |
| [`className`](#prop-classname) | `string` | нет | — |
| [`style`](#prop-style) | `CSSProperties & Partial<Record<CalendarCSSVariable, string>>` | нет | обычное поведение React/CSS |
| [`id`](#prop-id) | `string` | нет | — |
| [`aria-label`](#prop-aria-label) | `string` | `calendarLabel` | пустой: имя из каталога |
| [`aria-labelledby`](#prop-aria-labelledby) | `string` (список IDREF) | нет | невалидные ID отбрасываются + предупреждение |
| [`portalContainer`](#prop-portalcontainer) | `Element \| DocumentFragment \| null` | открытый модальный контейнер вокруг календаря (модальный `<dialog>` или `aria-modal="true"`), иначе `body` документа-владельца | отсоединённый, из другого документа или не узел: по умолчанию + предупреждение |
| [`getItemActions`](#prop-getitemactions) | `(item: CalendarItem<TItemData>) => readonly CalendarItemAction[]` | необязателен, пара | без пары или не функция: contract error; плохое действие: исключается + предупреждение |
| [`onItemActionRequest`](#prop-onitemactionrequest) | `(request: CalendarItemActionRequest<TItemData>) => void` | необязателен, пара | без пары или не функция: contract error |
| [`sources`](#prop-sources) | `readonly CalendarSource<TSourceData>[]` | нет | не массив: contract error; плохой source: исключается + предупреждение |
| [`visibleSourceIds`](#prop-visiblesourceids) | `readonly string[]` | необязателен, пара; видны все sources | без пары или без `sources`: contract error; неизвестный/повторный ID: игнорируется + предупреждение |
| [`onVisibleSourceIdsChange`](#prop-onvisiblesourceidschange) | `(visibleSourceIds: readonly string[]) => void` | необязателен, пара | без пары или не функция: contract error |
| [`showSourceSelector`](#prop-showsourceselector) | `boolean` | `true` при паре | без пары или не boolean: contract error |
| [`getItemAppearance`](#prop-getitemappearance) | `(item, context: CalendarItemAppearanceContext<TSourceData>) => CalendarItemAppearance \| undefined` | цвета темы и source | не функция: contract error; плохое поле: игнорируется + предупреждение |
| [`classNames`](#prop-classnames) | `CalendarClassNames<TItemData, TSourceData>` | нет | не объект или поле не строка и не функция: contract error |
| [`renderItem`](#prop-renderitem) | `(context: CalendarMonthItemSlotContext) => ReactNode` | содержимое chip/bar по умолчанию | не функция: contract error |
| [`renderAgendaItem`](#prop-renderagendaitem) | `(context: CalendarAgendaItemSlotContext) => ReactNode` | содержимое строки по умолчанию | не функция: contract error |
| [`renderDayHeader`](#prop-renderdayheader) | `(context: CalendarDayState) => ReactNode` | номер дня | не функция: contract error |
| [`renderToolbarContent`](#prop-rendertoolbarcontent) | `(context: CalendarToolbarSlotContext) => ReactNode` | нет | не функция: contract error |
| [`renderLoading`](#prop-renderloading) | `(context: CalendarLoadingSlotContext) => ReactNode` | тело загрузки по умолчанию | не функция: contract error |
| [`renderEmpty`](#prop-renderempty) | `(context: CalendarEmptySlotContext) => ReactNode` | `emptyLabel` | не функция: contract error |
| [`renderError`](#prop-rendererror) | `(context: CalendarErrorSlotContext) => ReactNode` | тело ошибки с «Повторить» | не функция: contract error |

<a id="prop-items"></a>
### `items`

Показываемые записи, `readonly CalendarItem<TItemData>[]`. Для пустого календаря передавайте `items={[]}`. Items вне
видимого диапазона допустимы и не рисуются. Записи проверяются по отдельности: невалидная или повторяющаяся запись
исключается из сетки, счётчиков, повестки и callbacks с предупреждением, остальные рендерятся. Порядок по умолчанию: все
all-day items по дате начала, более длинные раньше; затем timed items на нескольких локальных датах по instant начала,
более длинные раньше; затем остальные timed items по instant начала; при равенстве — `id` по code units. `sortItems`
заменяет этот порядок.

`id` — идентичность item между обновлениями, поэтому сохраняйте его стабильным между загрузками, а не генерируйте заново
на каждый запрос. Если сфокусированный item повестки исчезает (удалён, перенесён на другую дату, получил новый `id` или
стал невалидным), focus переходит на ячейку его даты при каждом прогоне и в любой сборке: popover или sheet сначала
закрывается, inline-повестка остаётся.

<a id="prop-timezone"></a>
### `timeZone`

Часовой пояс отображения, принятый IANA identifier (`IanaTimeZone`). Определяет, каким датам принадлежат timed items, как
форматируется время и какая дата считается «сегодня». Не выводится из браузера или сервера. Невалидный: contract error
`timeZone: Timezone is outside the package accepted-set`; отсутствующий: `timeZone: Required; expected an IANA time zone
such as Europe/Moscow`.

<a id="prop-anchordate"></a>
### `anchorDate`

Любой `ISODate` внутри показываемого месяца; номер дня не учитывается. Поддерживаются месяцы с февраля 0001 по ноябрь 9999,
чтобы соседние дни сетки оставались представимыми. Невалидный или вне границ: contract error.

<a id="prop-onnavigate"></a>
### `onNavigate`

`(anchorDate: ISODate) => void`, обязателен. Вызывается с первым днём (`YYYY-MM-01`) запрошенного месяца после действия
пользователя: «Предыдущий/Следующий месяц», «Сегодня», когда today вне сетки, стрелки за пределы сетки, `PageUp`/`PageDown`
с `Shift` или без. Это запрос: месяц меняется, только когда вы передаёте новый `anchorDate`. Запрос уже показанного месяца
его не вызывает. Правила focus — в [README](../README.ru.md#navigation).

<a id="prop-layout"></a>
### `layout`

`CalendarLayout`, по умолчанию `'auto'`.

- `'desktop'`: сетка месяца из семи столбцов с chips, bars и `+N`; повестка — popover.
- `'mobile'`: компактная сетка с датами и точкой у дней, где есть items, без chips, bars и `+N`; повестка просматриваемой
  даты показывается под сеткой (или в sheet, см. [`agendaPresentation`](#prop-agendapresentation)). Tap или `Enter` на
  дате меняет просматриваемую дату.
- `'auto'`: календарь измеряет ширину content-box собственного корня, а не окна браузера. Ширина меньше
  [`mobileBreakpoint`](#prop-mobilebreakpoint) — mobile, сама граница и больше — desktop: при значении по умолчанию `640`
  ширина содержимого 639 px — mobile, 640 px — desktop. Content-box находится внутри собственного padding корня
  (`spacing.md`, по умолчанию 16 px с каждой стороны), поэтому border box корня переключается при 672 px. Сервер и первый client render всегда mobile; измеренный layout
  применяется после hydration до отрисовки браузером. Нулевая или неизмеримая ширина (например, внутри `display: none`)
  не считается измерением: до первого измерения календарь остаётся mobile. Затем он сохраняет последнюю измеренную ширину,
  с которой сравнивается и изменённый `mobileBreakpoint`, поэтому скрытый календарь сам не переключается. Переключение
  принудительного layout на `'auto'`, пока календарь нельзя измерить, даёт mobile.
- Ширина, которая зависит от самого layout, не заставляет `'auto'` переключаться туда и обратно. Пример: desktop-месяц
  выше окна, поэтому полоса прокрутки страницы сужает календарь ниже границы, а у более низкого mobile полосы нет, и он
  снова шире. Каждое переключение, вызванное шириной, измеряется ещё раз до отрисовки браузером; если новый layout сам
  вернул ширину через границу, разница двух ширин (здесь ширина полосы прокрутки) становится полосой по обе стороны
  границы. При ширине внутри этой полосы ни один layout не подходит к границе с той шириной, которую он сам даёт, поэтому
  календарь сохраняет текущий layout (изменение только высоты ничего не решает); например, desktop остаётся при ширине
  содержимого 630 px рядом с полосой прокрутки 15 px. Вне полосы снова решает точная граница. Поэтому resize или
  перетаскивание окна через полосу переключает layout один раз на пересечение, а не на каждом шаге. Смена
  `mobileBreakpoint` или `layout` забывает полосу. Чтобы обратной связи не было
  вовсе, зарезервируйте место полосы прокрутки у прокручиваемого предка, например `html { scrollbar-gutter: stable; }`:
  тогда оба layout измеряют одну ширину и всегда решает точная граница. Около границы полоса прокрутки страницы, которая
  нужна только desktop-высоте, может также остаться на серверной отрисовке до первого измерения (см. следующий пункт);
  то же правило это устраняет.
- Hydration и сдвиг layout. В контейнере, ширина которого не зависит от содержимого календаря, и с применёнными
  inline-стилями сервера hydration без смены layout ничего не сдвигает. Единственное исключение — крупный текст: первое
  desktop-измерение ещё может немного увеличить строки. При `mobileBreakpoint` по умолчанию таблица стилей к тому же
  задаёт компактному серверному месяцу размеры desktop-месяца, пока content-box корня не уже 640 px (672 px для корня с
  padding по умолчанию): высоту строк desktop и отсутствие inline-повестки до первого измерения. DOM и `data-layout`
  остаются mobile. Поэтому страница под календарём не сдвигается, когда он гидрируется в desktop, если только он не
  гидрируется в начальном блокирующем состоянии (`loading/initial`, `error/initial`): такой skeleton или область ошибки
  не получают этих размеров и один раз вырастают до высоты desktop-месяца. При политике, которая блокирует атрибуты
  style, до hydration действует только скрытие повестки (см.
  [Строгий CSP и SSR](../README.ru.md#limitations)). Без JavaScript такой календарь показывает компактную сетку с высотой
  строк desktop и без повестки. В хосте, сжимающемся по содержимому (inline-block или абсолютно позиционированная
  обёртка без ширины, дорожка grid `max-content`), его серверная отрисовка до первого измерения не шире его toolbar,
  поэтому inline-повестка шире toolbar может один раз сдвинуть страницу. При другом `mobileBreakpoint` серверный layout
  не получает этих размеров: SSR-странице, которой нужен нулевой сдвиг, следует передать принудительный `layout`,
  подходящий странице.

Принудительный `'desktop'` или `'mobile'` не наблюдает ширину и фиксирован уже в HTML сервера. `data-layout` на корне —
всегда разрешённое `"desktop"` или `"mobile"`, никогда `"auto"`. Любое другое значение — contract error
`layout: Unknown enum value; expected 'auto' or 'desktop' or 'mobile'`.

Если разрешённый layout или presentation меняется, пока повестка показана, просматриваемая дата сохраняется, а за сменой
следует только focus внутри повестки: он переходит на тот же item, заголовок или control в новой presentation, а если
такого control там нет, — на ячейку даты. Если focus был в другом месте, resize никогда не открывает popover или sheet и
не забирает focus; открытый overlay вместо этого закрывается.

<a id="prop-mobilebreakpoint"></a>
### `mobileBreakpoint`

`number`, по умолчанию `640`, в CSS px ширины content-box корня, то есть без собственного padding корня (`spacing.md`).
Используется только при `layout="auto"`: ширина
`< mobileBreakpoint` — mobile, `≥ mobileBreakpoint` — desktop. Дробные значения допустимы. Значение, не являющееся
положительным конечным числом, — contract error `mobileBreakpoint: Expected a positive finite number`.
Desktop-сетка держит столбцы не уже 64 px (448 px на семь): при `mobileBreakpoint` меньше 448 desktop в режиме `auto` уже
этой ширины прокручивается по горизонтали внутри региона сетки, а не страница.

<a id="prop-agendapresentation"></a>
### `agendaPresentation`

`CalendarAgendaPresentation`, по умолчанию `'auto'`.

| Разрешённый layout | `'auto'` | `'overlay'` |
| --- | --- | --- |
| desktop | popover | popover |
| mobile | inline region под сеткой | модальный sheet |

- **Popover:** именованный немодальный `dialog` рядом с ячейкой даты; focus переходит на его первый control. Длинный день
  прокручивается внутри popover (колесо, касание, клавиатура), а при `Tab` сфокусированный control остаётся в видимой
  области. При прокрутке страницы popover остаётся у ячейки; если ячейка уходит из видимой области (в том числе из
  прокручиваемого контейнера вашей страницы), popover обрезается вместе с ней и сохраняет focus, а focus клавиатуры внутри
  него возвращает ячейку в видимую область. Если ячейки больше нет, например controlled `agendaDate` вне нового месяца,
  popover переходит под тулбар корня календаря.
- **Inline:** именованный `region`, который всегда показан и не закрывается. Tap оставляет focus на ячейке даты и объявляет
  обновление через `agendaUpdatedAnnouncement`; `Enter` переносит focus на заголовок повестки; `Escape` внутри возвращает
  focus на ячейку даты.
- **Sheet:** именованный модальный `dialog` (`aria-modal="true"`) у нижнего края viewport. Пока он открыт, остальная
  страница `inert` и не прокручивается; focus остаётся внутри и начинается с заголовка. `Escape` (в том числе когда focus
  оказался на `body` страницы), кнопка закрытия и нажатие на сам фон (начатое и законченное на нём; перетаскивание между
  sheet и фоном не считается) закрывают его и возвращают focus на ячейку даты.
  Заголовок и кнопка закрытия остаются видимыми при прокрутке длинного дня. Эти эффекты принадлежат документу корня
  календаря: календарь, отрендеренный в документ iframe, скрывает и блокирует этот документ, а не страницу вокруг iframe.
  Собственный диалог, открытый поверх sheet, например из [`onItemPress`](#prop-onitempress), остаётся рабочим: см. там.
- Mobile inline-повестка растёт вместе со страницей и не имеет собственной области прокрутки, пока у корня нет
  определённой высоты. При определённой высоте корня (см. [Размеры](../README.ru.md#sizing)) она делит оставшееся место с
  сеткой и прокручивает строки внутри корня, поэтому никогда не рисуется поверх страницы ниже.

При [`layout="auto"`](#prop-layout) сервер и первый client render показывают компактный mobile-месяц, не читая окно и
контейнер. При `'auto'` в нём есть inline-повестка просматриваемой даты; при
[`mobileBreakpoint`](#prop-mobilebreakpoint) по умолчанию и content-box корня не уже 640 px эта повестка есть в разметке,
но не показывается до первого измерения. При `'overlay'` повестки нет: sheet закрыт, и после
hydration ни sheet (mobile), ни popover (desktop) не открываются до activation даты. Принудительный `layout` выводит свою
presentation уже на сервере.

У ячейки даты `aria-haspopup="dialog"` и `aria-expanded` есть только для popover и sheet. На desktop переключение между
`'auto'` и `'overlay'` оставляет открытый popover как есть. Любое другое значение — contract error
`agendaPresentation: Unknown enum value`.

<a id="prop-onvisiblerangechange"></a>
### `onVisibleRangeChange`

`(range: CalendarVisibleRange) => void`, уведомление после commit. Вызывается один раз после первого клиентского рендера и
затем при каждом изменении принятой тройки `(start, end, timeZone)`. Не вызывается во время SSR или render, для ожидающего
запроса навигации, для неизменного диапазона, новой identity callback и повторных effects StrictMode; `A → B → A` сообщает
каждое изменение. Диапазон равен `getCalendarVisibleRange` для текущих props. Каждый вызов получает новый объект.

<a id="prop-today"></a>
### `today`

Необязательный `ISODate` — текущая дата в `timeZone`, вычисленная приложением и переданная серверу и клиенту. С ним
календарь никогда не читает часы, а обновляете его вы. Без него у сервера и первого клиентского рендера нет today: нет
подсветки, кнопка «Сегодня» выключена, повестка по умолчанию — первый день месяца. После hydration календарь вычисляет
today в `timeZone` и обновляет его на следующей границе локальной даты и при `visibilitychange`. Невалидный: contract error.

<a id="prop-locale"></a>
### `locale`

BCP 47 tag, по умолчанию `'ru-RU'`. Управляет форматированием дат (всегда григорианский календарь, `localeMatcher: 'lookup'`,
цифры locale и его расширения `u-nu`), первым днём недели, форматом часов и направлением по умолчанию, а также каталогом
сообщений по умолчанию. Корректный, но неподдерживаемый tag разрешается в `en-US` с предупреждением
`locale: <tag> is unsupported; using en-US`, никогда не в locale хоста. Синтаксически неверный tag (`en_US`, `""`) —
contract error.

<a id="prop-firstdayofweek"></a>
### `firstDayOfWeek`

`CalendarWeekday`. По умолчанию — из разрешённого locale, иначе `'monday'`. Меняет диапазон сетки и поэтому может вызвать
`onVisibleRangeChange`.

<a id="prop-hourcycle"></a>
### `hourCycle`

`12` или `24`. По умолчанию — из разрешённого locale, иначе `24`.

<a id="prop-dir"></a>
### `dir`

`'ltr'` или `'rtl'`. По умолчанию — из письменности разрешённого locale, иначе `'ltr'`. Не зависит от языка сообщений. RTL
зеркалит столбцы, стрелки, геометрию bars, положение overflow и направленные значки; «Предыдущий/Следующий» и
`PageUp`/`PageDown` сохраняют хронологический смысл. `dir` задаёт только направление раскладки: отформатированные даты и
время сохраняют направление письменности locale, поэтому даты `ru-RU` читаются слева направо и в календаре `rtl`.

<a id="prop-agendadate"></a>
### `agendaDate`

Необязательный `ISODate` — контролируемая дата просмотра повестки; передаётся вместе с `onAgendaDateChange`. Календарь
использует только prop, без внутренней копии. Дата может лежать вне показанного месяца; её смена никогда не вызывает
`onNavigate`. Переход от неконтролируемого режима к контролируемому сразу принимает переданную дату, обратный переход
начинается с последней валидной контролируемой даты. Без пары календарь сам хранит дату просмотра (today в показанном
месяце, иначе первый день месяца). Пока пользователь не активировал дату, этот fallback следует за более поздним
известным today; активация любой даты, в том числе самого today, сохраняет её датой просмотра при последующих обновлениях
today. Невалидный или без пары: contract error
`agendaDate: Must be supplied together with onAgendaDateChange`.

<a id="prop-onagendadatechange"></a>
### `onAgendaDateChange`

`(date: ISODate) => void`, в паре с `agendaDate`. Вызывается один раз, когда пользователь активирует дату, отличную от
текущего `agendaDate` (щелчок, `Enter`, нажатие на `+N` или на chip без `onItemPress`). Повестка этой даты открывается
только после того, как prop станет равен ей, и пока focus остаётся на ячейке, сделавшей запрос; перенос focus, другая
активация, другая клавиша (включая `Escape`; чистый модификатор вроде `Shift` и автоповтор удерживаемой клавиши новой
клавишей не считаются) или уход из календаря отменяют ожидающее открытие, но не уже сделанный вызов. Принятое значение,
отличное от последнего запроса, считается внешним изменением. Открывается presentation, разрешённая в момент принятия
даты: resize или смена `layout`/`agendaPresentation` в ожидании не отменяет запрос и никогда не показывает прежнюю
presentation.

<a id="prop-datastate"></a>
### `dataState`

`CalendarDataState`, по умолчанию `{status: 'ready'}`. См. [`CalendarDataState`](#export-calendardatastate). Неверные формы —
contract errors: `dataState: Unknown data state`, `dataState.phase: Expected initial or refresh`,
`dataState.error: Error state requires an error payload` (ключ `error` должен присутствовать; значение — любое).

<a id="prop-onretryrequest"></a>
### `onRetryRequest`

`() => void`. Если передан, области ошибок данных (обе фазы) показывают кнопку «Повторить»; каждое нажатие вызывает его
один раз и без аргументов, поэтому готовую функцию с необязательным параметром (`refetch` хука данных) можно передать
напрямую. Состояние меняется только через новый `dataState`. Для contract errors кнопка не показывается и callback не
вызывается.

<a id="prop-onitempress"></a>
### `onItemPress`

`(request: CalendarItemPressRequest<TItemData>) => void` — основная активация item. В сетке вызывается после завершённого
нажатия указателем на chip или bar с датой под указателем, и focus переходит в эту ячейку даты. В повестке каждый item
становится кнопкой, вызывающей его с датой повестки. Без него нажатие на chip открывает повестку даты под ним, а строки
повестки — обычные элементы списка без остановки Tab. Вызывается один раз на активацию и никогда во время render.

Открыть из `onItemPress` собственный редактор или диалог деталей можно в любой presentation. Popover закрывается, когда
focus переходит в ваш диалог. Модальный sheet остаётся открытым под ним: модальный диалог, появившийся поверх sheet, —
`<dialog>`, показанный через `showModal()`, или элемент с `aria-modal="true"`, в документе или внутри открытого
`ShadowRoot` (модальное окно web component; закрытый ShadowRoot не виден) — никогда не становится `inert`, sheet
перестаёт удерживать focus и опускается под него (его `z-index` становится `auto`), а focus и `Escape` обрабатывает ваш
диалог. Библиотека модальных окон, которая не выводит `aria-modal`, но делает всё вне своего диалога `inert` или
`aria-hidden` (например, `Modal` из React Aria Components), тоже считается таким диалогом: показанный ею после открытия sheet
`role="dialog"` не становится `inert`, а focus, который она переносит в этот диалог в том же commit, остаётся в нём (sheet
не возвращает его себе). Если sheet закрывается, пока ваш диалог ещё открыт, страница остаётся заблокированной
для прокрутки и фоном до закрытия вашего диалога. Немодальный элемент с `role="dialog"` или `role="alertdialog"` без
`aria-modal="true"` (уведомление, боковая панель), который оставляет sheet доступным, — такой же фон страницы, как любой
другой узел: пока sheet открыт, он `inert`, а focus остаётся в sheet. Когда он закрывается, sheet снова модален; если ваш диалог не вернул focus, sheet
фокусирует нажатый control. Выводите такой диалог вне контейнера календаря (portal в `body` или нативный `<dialog>`):
пока sheet открыт, собственный контейнер календаря `inert`.

<a id="prop-sortitems"></a>
### `sortItems`

`(a: CalendarItem<TItemData>, b: CalendarItem<TItemData>, context: CalendarSortContext) => number`. Заменяет порядок по
умолчанию (см. [`items`](#prop-items)) одним глобальным порядком для всех ячеек и повестки; при `0` по-прежнему применяется
сравнение по `id`. Не конечный результат считается `0` с предупреждением
`sortItems: Non-finite comparator result is treated as zero`. Функция должна быть чистой и согласованной (`(a, a)` даёт `0`,
антисимметрия, транзитивность); её могут вызывать несколько раз.

<a id="prop-theme"></a>
### `theme`

`CalendarTheme`, по умолчанию `classicTheme`; второй preset — [`neutralTheme`](#export-neutraltheme). Любое другое значение,
в том числе структурная копия, — contract error `theme: Expected a package theme preset`. Задаёт `data-theme="classic"`
или `data-theme="neutral"` на корне и его portal theme roots. Темы меняют только оформление, но не роли, focus и
клавиатуру; оболочка contract error всегда использует `classicTheme`.

<a id="prop-density"></a>
### `density`

`'compact'` (по умолчанию) или `'comfortable'`. Меняет значения по умолчанию `density.dayMinHeight` (100px / 128px),
`itemHeight` (24px / 32px) и `gap` (4px / 8px). Задаёт `data-density`.

<a id="prop-colorscheme"></a>
### `colorScheme`

`'system'` (по умолчанию), `'light'` или `'dark'`. `system` следует `prefers-color-scheme` только через CSS, поэтому сервер
и клиент рендерят одинаковый DOM; `data-color-scheme` содержит запрошенное значение. `forced-colors: active` важнее цветов
темы и tokens; `prefers-reduced-motion` отключает необязательные переходы.

<a id="prop-tokens"></a>
### `tokens`

`CalendarThemeTokens`. Каждая непустая строка записывается inline-объявлением своей CSS-переменной на корне календаря; см.
[Tokens и CSS-переменные](#tokens). Отсутствующие поля сохраняют нижний слой. Нестроковое или пустое значение игнорируется
с предупреждением `tokens.<group>.<token>: Expected a nonempty CSS string`; группа, не являющаяся объектом, даёт
`tokens.<group>: Expected a token group`. Строка, которая не является одним значением CSS-декларации и поэтому добавила бы
или поглотила другие декларации, игнорируется так же, с предупреждением
`tokens.<group>.<token>: Expected a single CSS declaration value`: `;` или `!` на верхнем уровне (в том числе
`!important`), незакрытые строка, комментарий или скобка, лишняя закрывающая скобка, bad string, экранирование в конце
или перед переводом строки, символ в начале или в конце, который JavaScript `trim()` удаляет, а CSS не считает пробелом
(например U+00A0). Так же игнорируется значение с любым `url(`, в том числе корректным и вложенным в другую функцию,
например `image-set(url(…) 1x)`: токен никогда не содержит `url(`, даже если ваш CSS использует переменную в свойстве,
которое загружает URL. Другие функции, принимающие ресурс строкой, например `image-set("…" 1x)`,
`-webkit-image-set("…" 1x)`, `image("…")` или `src("…")`, не отклоняются: собственные стили пакета используют переменные
tokens только в свойствах цвета, тени и шрифта и никогда их не загружают, но ваш CSS или содержимое slots, использующие
переменную token в свойстве изображения, загрузили бы ресурс. Если вы используете переменные так, проверяйте значения
арендаторов сами. Токены читаются так же, как их читает CSS, поэтому экранированные записи вроде `u\72l(`
или `\75 rl(` — тоже `url(`, а `url(` внутри строки в кавычках или комментария — просто текст. Принятое значение
передаётся обрезанным, поэтому React 18 и React 19 пишут на сервере и на клиенте один текст: тогда сервер и клиент
выводят одинаковые декларации. Это правило безопасности, одинаково решаемое на сервере и
на клиенте, а не проверка CSS: `CSS.supports` и computed styles не читаются. В остальном значения не разбираются и
не проверяются как CSS: невалидное значение — ошибка оформления с обычным поведением CSS, а не contract error. В оболочке
contract error tokens не применяются.

<a id="prop-messageslocale"></a>
### `messagesLocale`

BCP 47 tag, по умолчанию — разрешённый `locale`. Выбирает встроенный каталог (`ru-*` — русский, любой другой валидный tag —
английский) и язык переопределений `messages`, которые получают `lang` этого tag. Направление по-прежнему определяется
`locale`/`dir`. Синтаксически неверный: contract error.

<a id="prop-messages"></a>
### `messages`

`Partial<CalendarMessages>`: переопределения каталога на языке `messagesLocale`. Строковому ключу нужна непустая строка,
ключу-функции — функция, возвращающая непустую строку. Сообщения-функции получают простые значения: даты как `ISODate`,
числа как numbers, названия уже с fallback `untitledItemLabel`. Иначе используется встроенный текст с предупреждением
`messages.<key>: Expected a nonempty message of the declared shape; using built-in fallback` (`messages.*`, если
`messages` не объект). Функции сообщений — чистые resolvers и могут вызываться несколько раз. В оболочке contract error
используется только `invalidConfigurationLabel`.

<a id="prop-classname"></a>
### `className`

Добавляется к списку классов корня календаря, в том числе в оболочке contract error. Используйте его, чтобы ограничить
свои CSS-переменные и размеры. Внутренние имена классов не являются API.

<a id="prop-style"></a>
### `style`

Inline-стиль корня календаря. Публичные CSS-переменные — типизированные ключи. Объединяется после `tokens`, поэтому та же
переменная в `style` выигрывает. Определённые `height`/`block-size` переводят сетку в [ограниченный
режим](../README.ru.md#sizing). Значения передаются в React без изменений и, в отличие от [`tokens`](#prop-tokens), не
проверяются: React пишет их в серверный HTML текстом, и значение с `;` становится там дополнительными декларациями, а
клиентский рендер его отвергает. Значения из настроек пользователя или арендатора передавайте через `tokens`. При строгом
CSP (`style-src` без `'unsafe-inline'` и без `style-src-attr`) браузер блокирует серверный атрибут `style`, и гидрация
записывает обратно только собственные проверенные декларации календаря (`tokens`, без переменной, которую заменяет
`style`), но никогда `style`: как и другие ваши inline-стили, он подчиняется вашей политике (см.
[Стили](../README.ru.md#styles)).

<a id="prop-id"></a>
### `id`

`id` корневого элемента календаря.

<a id="prop-aria-label"></a>
### `aria-label`

Accessible name корневого `region`. Пустое значение заменяется на `calendarLabel`. Выводится всегда, в том числе на
сервере, и служит резервом, когда у `aria-labelledby` нет валидной цели.

<a id="prop-aria-labelledby"></a>
### `aria-labelledby`

Список IDREF через пробел, именующий корень. После каждого commit календарь оставляет только ID элементов, которые
существуют, подключены, находятся в том же `Document` или `ShadowRoot`, что и корень, и дают непустое имя, в исходном
порядке; остальные отбрасываются с предупреждением
`aria-labelledby: Ignored missing, empty or cross-tree references: <ids>`. Сервер и первый клиентский рендер никогда его не
выводят (используются `aria-label` или имя из каталога), поэтому hydration не расходится; проверенный attribute добавляется
после hydration и обновляется при изменении целей. Календарь, отрисованный в container, который подключается позже — к
документу или к `ShadowRoot`, — проверяется после подключения (не позже следующего animation frame).

<a id="prop-portalcontainer"></a>
### `portalContainer`

`Element | DocumentFragment | null`. Узел, в который выводятся popover и sheet повестки дня. Принимаются подключённый
`Element` или подключённый `ShadowRoot` того же документа, что и календарь. Отсоединённый узел, узел другого документа
(например, внутри iframe) или любое другое значение игнорируется в пользу значения по умолчанию с предупреждением в
development `portalContainer: <reason>`; это никогда не contract error, и в чужой документ ничего не монтируется.

**По умолчанию.** Ближайший открытый модальный контейнер вокруг корня календаря в том же документе, иначе `body` документа
`ownerDocument` корня (никогда не глобальный document другого realm). Модальный контейнер — `<dialog>` в модальном
состоянии (показанный через `showModal()`) или элемент с `aria-modal="true"`, как их выводят библиотеки модальных окон.
Обычный `role="dialog"` или `role="alertdialog"` без `aria-modal="true"`, например боковая панель, и `<dialog>`, открытый
через `show()`, модальными контейнерами не являются: там повестка выводится в `body`, и маленькая панель никогда её не
сжимает и не обрезает. Модальный хост делает `inert` всё вне себя, удерживает focus или отключает события указателя на
`body`, поэтому повестка остаётся внутри него: она достижима, popover размещается в видимой части этого диалога с той
стороны ячейки даты, где больше места (у нижнего края диалога — над ячейкой, если снизу не помещается), а первый `Escape`
закрывает повестку раньше, чем второй дойдёт до вашего диалога. Значение по умолчанию вычисляется при монтировании
календаря и заново при каждом открытии overlay пакета (activation даты, trigger действий или selector sources, смена
layout, которая переносит focus из inline-повестки в popover или sheet), поэтому диалог, открытый вокруг уже
смонтированного календаря, используется следующим overlay; если значение по умолчанию меняется, пока повестка открыта, в том числе только атрибутом
(`aria-modal` добавлен или снят, `<dialog>` закрыт или показан), она закрывается, как при смене `portalContainer`. Явный валидный `portalContainer` всегда главнее. Если
ваша библиотека модальных окон выводит диалог без `aria-modal="true"` (некоторые ставят только `role="dialog"` и
удерживают focus), передайте этот диалог как `portalContainer`. Так ведут себя Radix Dialog и `Modal` и `Popover` из React
Aria Components: по умолчанию повестка открывается в `body`, и ловушка focus хоста сразу её закрывает, либо popover хоста
закрывается при уходе focus наружу и размонтирует календарь. Если для календаря внутри элемента `role="dialog"` или
`role="alertdialog"` без `aria-modal="true"` значение по умолчанию разрешается в `body`, сборка development один раз на
календарь предупреждает: `portalContainer: The calendar is inside a role="dialog" element without aria-modal="true", so the
agenda and menus render in document.body; a dialog or popover library that traps focus or closes on outside focus closes them
(or itself) at once. Pass that dialog element as portalContainer, or document.body to keep this default`. О явном валидном
container, в том числе `document.body`, предупреждения нет.

**Слои.** Overlays пакета используют `z-index: 100000` (popover, дочерние menus и фон sheet одинаково) и принимают события
указателя даже при `body { pointer-events: none }`. Фиксированные слои вашей страницы с меньшим `z-index`, например шапки и
панели вкладок, остаются под sheet. Чтобы поместить overlays в определённый слой, дайте `portalContainer` собственный
stacking context (например, `position: relative; z-index: 10`). Не помещайте `portalContainer` внутрь элемента с
`transform`, `filter`, `perspective`, `contain: paint` или `will-change: transform`: такой предок становится containing block
для фиксированных sheet и фона, и они перестают закрывать viewport.

Каждый portal получает собственный theme root пакета с `data-theme`, `data-density`, `data-color-scheme`, `data-dir` и
`lang` календаря. До того как portal станет видимым и получит focus, календарь копирует со своего корня разрешённые
значения всех 27 публичных CSS-переменных и наследуемых свойств шрифта (`font-family`, `font-size`, `font-style`,
`font-weight`, `font-stretch`, `line-height`, `letter-spacing`), поэтому `theme`, `density`, scoped CSS, `tokens` и
`style` выглядят в portal так же. Пока portal открыт, значения обновляются после каждого рендера календаря, при изменении
размера его корня, при resize окна и при изменении `prefers-color-scheme`, `forced-colors` и `prefers-reduced-motion`;
другие изменения таблиц стилей или классов требуют повторного рендера календаря. Записываются только изменившиеся
значения; непубличные свойства и правила элементов корня не копируются.

`styles.css` не пересекает границу shadow DOM: подключите его в каждой tree scope, где есть корень календаря или portal (см.
[Стили](../README.ru.md#styles)). Календарю в `ShadowRoot` с portal по умолчанию таблица нужна в этом shadow root и в
документе; календарю в документе с portal в `ShadowRoot` — в документе и в этом shadow root.

Если принятый container меняет identity, пока overlay открыт, в том числе на `null` или с `null`, либо удаляется из
документа, календарь закрывает открытые overlays, снимает modal-эффекты (inert фона, блокировку прокрутки) и возвращает
focus в календарь: из повестки и её menus — на ячейку даты (затем текущую дату), из selector sources — на его trigger. То
же происходит при смене цели по умолчанию, например когда диалог
хоста вокруг календаря удаляется. Сам по себе ничего не открывается заново; следующая activation использует новый container
или значение по умолчанию. Повторная передача того же узла ничего не меняет. Ячейка даты
получает `aria-controls`, только пока она и overlay подключены в одном `Document` или `ShadowRoot`.

<a id="prop-getitemactions"></a>
### `getItemActions`

`(item: CalendarItem<TItemData>) => readonly CalendarItemAction[]`, пара с `onItemActionRequest`. Чистый resolver действий
одного item: вызывается во время render не более одного раза на объект item и identity resolver (новая функция или новый
объект item разрешаются заново). Редактирование и удаление — доменные операции приложения; календарь только предлагает
набор. Один набор используется в повестке дня, её desktop menu и mobile action sheet. Сетка месяца не получает кнопок
действий и дополнительных целей focus: путь к действиям — повестка даты.

```tsx
<Calendar
    {...props}
    sources={sources}
    visibleSourceIds={visibleSourceIds}
    onVisibleSourceIdsChange={setVisibleSourceIds}
    getItemActions={() => [{id: 'open', label: 'Open'}, {id: 'delete', label: 'Delete', tone: 'danger'}]}
    onItemActionRequest={({item, actionId}) => handleAction(item, actionId)}
/>
```

Каждая строка повестки с непустым набором получает отдельный trigger `…` рядом со своей основной поверхностью, никогда не
внутри неё, с именем `itemActionsLabel(title)` (fallback «Без названия» применяется). Пустой набор, невалидный результат или
отсутствие пары — trigger нет. Действию нужен непустой `id`, уникальный в пределах item, непустой после `trim` `label` и
`tone` `'default'` или `'danger'`; невалидное действие и все действия с повторённым `id` исключаются с предупреждением
`getItemActions("<item id>").actions[<i>]: …`; результат, который не является массивом, — пустой набор.

- **Desktop:** `menu` с именем `itemActionsLabel(title)` в немодальном popover поверх повестки. Focus на первом пункте;
  стрелки перемещают, `Enter`/`Space` активируют. `Escape` закрывает только menu и возвращает focus на trigger (второй
  `Escape` закрывает повестку); `Tab`/`Shift+Tab` закрывают menu и продолжают с control после или перед trigger.
- **Mobile:** модальный sheet с видимым заголовком `itemActionsLabel(title)` и одной кнопкой на действие. Focus на первом
  действии, никогда не на заголовке; `cancelLabel`, `Escape` и нажатие на фон закрывают его и возвращают focus на trigger.

Если набор открытого menu или sheet стал пустым или пару удалили, поверхность закрывается, а focus переходит на ближайший
control всё ещё открытой повестки (следующий после позиции trigger, затем предыдущий, затем заголовок). Если сам item удалён
или скрыт принятым фильтром sources, пока его menu открыто, menu или sheet остаётся до закрытия, но все действия в нём
отключены (`aria-disabled` у пунктов menu, disabled-кнопки sheet): у item больше нет доступных действий, поэтому ничто не
выглядит рабочим и запрос не отправляется. Focus остаётся в поверхности. Если обновлённый набор удаляет действие с focus,
пока поверхность открыта, focus переходит на следующее действие после его позиции, затем на предыдущее, затем на первый
доступный control.

<a id="prop-onitemactionrequest"></a>
### `onItemActionRequest`

`(request: CalendarItemActionRequest<TItemData>) => void`, пара с `getItemActions`. Вызывается один раз на activation
действия, синхронно после начала закрытия menu или sheet, с item и действием последних committed props: действие, которого
больше нет в наборе, или item, который больше не показан, ничего не отправляют. `onItemPress` — отдельная основная
activation и его не вызывает. Открытие своего диалога из него работает так же, как описано для [`onItemPress`](#prop-onitempress).

<a id="prop-sources"></a>
### `sources`

`readonly CalendarSource<TSourceData>[]`, sources (календари), на которые items ссылаются через `calendarId`. Source нужен
непустой после `trim` `id` и `title` (иначе исключается: `sources[i]: Source requires nonempty id and title`); все sources с
повторённым `id` исключаются (`sources[i]: All sources with this ID are excluded`). Item без `calendarId` виден всегда. Item,
чей `calendarId` не совпал ни с одним валидным source, остаётся видимым, а календарь предупреждает один раз на неизвестный
ID и называет его первый item:
`items[3].calendarId: No source with ID "archive"; items with this calendarId remain visible with fallback appearance`
(новый неизвестный ID позже тоже сообщается; без `sources` все такие items покрывает одно предупреждение
`items[].calendarId: No sources supplied; affected items remain visible with fallback appearance`), поэтому ошибка связи
никогда не скрывает данные молча. Строка повестки и её accessible summary называют известный
source. Без контролируемой пары sources не фильтруют: видны все валидные items, selector не показывается.

<a id="prop-visiblesourceids"></a>
### `visibleSourceIds`

`readonly string[]`, принятый фильтр; пара с `onVisibleSourceIdsChange`, требует `sources`. Item с известным `calendarId`
виден тогда и только тогда, когда этот ID есть в массиве. Фильтр действует на сетку, числа и `+N`, повестку, пустое
состояние и доступность действий, и при скрытом встроенном selector тоже. Неизвестные и повторённые IDs игнорируются с
предупреждением `visibleSourceIds[i]: Unknown or repeated source ID`. Это массив, а не `Set`, чтобы контролируемое
состояние оставалось сериализуемым. Удаление пары сразу показывает все sources и скрывает selector; повторное добавление
принимает только текущий массив. Ни один из этих переходов callback не вызывает.

<a id="prop-onvisiblesourceidschange"></a>
### `onVisibleSourceIdsChange`

`(visibleSourceIds: readonly string[]) => void`, пара с `visibleSourceIds`. Вызывается один раз на переключение во
встроенном selector со следующим набором: уникальные известные IDs в порядке `sources`, а не в порядке нажатий; не
вызывается, если набор не изменился бы. Фильтр контролируемый: отмеченное состояние, имена `showSourceLabel`/
`hideSourceLabel`, сетка, повестка, числа и действия меняются только после того, как props примут новый массив.
Отклонённое или другое значение показывается как есть, без имитации успешного переключения.

<a id="prop-showsourceselector"></a>
### `showSourceSelector`

`boolean`, по умолчанию `true`, допустим только с контролируемой парой. Встроенный selector — кнопка toolbar с именем
`sourceSelectorLabel`, которая показывается, пока осталось хотя бы два валидных source. На desktop она открывает `menu` из
`menuitemcheckbox`: `aria-checked` берётся из принятого массива, имя — `hideSourceLabel(title)` для видимого source и
`showSourceLabel(title)` для скрытого, переключение оставляет menu открытым, `Escape` возвращает на trigger, `Tab`
продолжает после него. На mobile она открывает модальный sheet с заголовком `sourceSelectorLabel`, одним именованным
checkbox на source (focus на первом) и кнопкой закрытия `cancelLabel`. `false` скрывает встроенный selector, чтобы вы
показали свой; фильтрация продолжает действовать.

Если валидных sources стало меньше двух или пару удалили, пока selector открыт, он закрывается, а focus из него переходит
на текущую ячейку даты. Смена разрешённого layout закрывает его, не открывая другую presentation, и focus из него
возвращается на trigger. Другие способы закрытия (`Escape`, кнопка закрытия, нажатие на пустое место страницы, новый
`portalContainer` или цель portal по умолчанию) тоже возвращают focus из него на trigger. Коротко:
как бы selector ни закрылся, focus, который был в нём, возвращается на его собственный trigger в toolbar
(паттерн WAI-ARIA menu button); только если trigger не может получить focus (sources меньше двух, пара удалена, trigger
отключён), действует общий порядок восстановления, а focus, который уже ушёл наружу, например нажатием на другой control
или через `Tab`, остаётся там. Блокирующий `dataState` (`loading/initial`, `error/initial`)
закрывает его вместе с modal-эффектами, отключает trigger, как кнопки навигации, и переносит focus из него в область
состояния; при возврате содержимого он не открывается снова. Пока открыт его sheet, календарь объявляет сообщения только
внутри этого sheet.

<a id="prop-getitemappearance"></a>
### `getItemAppearance`

`(item: CalendarItem<TItemData>, context: CalendarItemAppearanceContext<TSourceData>) => CalendarItemAppearance | undefined`.
Чистый resolver цветов item: вызывается не больше одного раза на запись item (item вместе с его source) и identity resolver.
Он получает item, `timeZone` календаря и известный `source`, но не сегмент и не дату, поэтому все сегменты Month и строка
повестки одного item имеют один appearance. Три канала независимы:

| Канал | Основа темы / tokens | Слой source | Слой resolver |
| --- | --- | --- | --- |
| accent marker | `color.accent` | `color` известного source | `accentColor` |
| фон item | `components.itemBackground` | нет | `backgroundColor` |
| текст item | `components.itemText` | нет | `textColor` |

Каждое присутствующее поле заменяет только свой канал; отсутствующее оставляет слой source или темы. `CalendarSource.color`
меняет только accent marker (полоску у начала каждого chip, bar и строки повестки и точку source в selector), но не фон и не
текст. Item без `calendarId`, с неизвестным source или source без `color` использует `color.accent`. Поле или `source.color`,
которое не строка или пусто после `trim`, не переопределяет канал и даёт предупреждение
`getItemAppearance("<id>").<field>: Expected a nonempty CSS color string; ignored` (или `sources("<id>").color: …`); результат,
который не объект, — `getItemAppearance("<id>"): Expected an appearance object or undefined; ignored`. Значение, которое не
является ровно одним значением декларации (то же правило, что для [`tokens`](#prop-tokens): `;`, `!important`,
несбалансированные кавычки, скобки или комментарии, `url(` в том числе с escape-последовательностями), игнорируется с
`Expected a single CSS declaration value; ignored`, поэтому server и client пишут одинаковые декларации, а нижний слой
остаётся (accent source для `accentColor`, иначе token темы). Остальное записывается отдельной CSS-декларацией цвета поверх нижнего
слоя без разбора CSS: значение, которое браузер отвергает при присваивании, оставляет нижний слой; синтаксически верное, но
невалидное на этапе computed value (неразрешённый `var()`) подчиняется обычным правилам CSS. Пользовательское содержимое
slots наследует цвет текста item. Focus ring и маркеры состояний не входят в appearance, а при `forced-colors: active`
системные цвета заменяют цвета потребителя.

<a id="prop-classnames"></a>
### `classNames`

`CalendarClassNames<TItemData, TSourceData>`: дополнительные классы для поверхностей пакета; каждое поле — строка или чистый
callback типизированного состояния этой поверхности. Результат callback, который не непустая строка, ничего не добавляет.

| Ключ | Элемент | Состояние |
| --- | --- | --- |
| `root` | корень календаря (и оболочка contract error) | `CalendarRootState` |
| `status` | области загрузки, пустого состояния и ошибки (и оболочка contract error) | `CalendarRootState` |
| `toolbar` | панель инструментов | `CalendarToolbarSlotContext` |
| `sourceSelector` | кнопка selector sources | `CalendarRootState` с `kind: 'data'` |
| `grid` | `grid` месяца | `CalendarRootState` с `kind: 'data'` |
| `weekdayHeader` | каждый `columnheader` | `CalendarRootState` с `kind: 'data'` |
| `day` | каждая ячейка даты `gridcell` | `CalendarDayState` |
| `dayHeader` | видимый заголовок каждой ячейки | `CalendarDayState` |
| `item` | каждая обёртка сегмента Month | `CalendarMonthItemSlotContext` |
| `overflowIndicator` | каждый `+N` | `CalendarOverflowState` |
| `agenda` | корень повестки | `CalendarAgendaState` |
| `agendaItem` | каждая строка повестки | `CalendarAgendaItemSlotContext` |
| `itemActions` | trigger `…` строки повестки | `CalendarAgendaItemSlotContext` |

В оболочке contract error вызываются только `root` и `status` с состоянием `contract`; поверхности только для данных эту
ветвь не получают. Классы добавляют оформление и не убирают роли, имена и focus indicator пакета.

<a id="prop-renderitem"></a>
### `renderItem`

`(context: CalendarMonthItemSlotContext<TItemData, TSourceData>) => ReactNode`. Заменяет видимое содержимое chip или bar в
Month внутри обёртки пакета, которая сохраняет accent marker, цвета item, нажатие и доступное описание ячейки. Вызывается один
раз на каждый видимый сегмент с его точным обрезанным `segmentRange`: bar через границу недели вызывает его один раз на
строку недели. Содержимое должно быть пассивным: текст, статичные badges, иконки. Ссылки, кнопки, поля ввода,
`contentEditable`, собственные tab stops и интерактивные роли недопустимы даже с `tabIndex={-1}`; используйте
[`onItemPress`](#prop-onitempress) и [`getItemActions`](#prop-getitemactions). После каждого commit development-сборка
проверяет фактический DOM внутри обёртки и один раз предупреждает, например `renderItem: Interactive content <a href> is not
allowed in passive slot content; use onItemPress or getItemActions`. Проверка best-effort: portals, shadow trees и
поздние мутации она не видит, и необнаруженное нарушение всё равно не поддерживается.

```tsx
<Calendar
    {...props}
    renderItem={({item}) => <><span className="badge">{item.data.priority}</span> {item.title}</>}
    renderAgendaItem={({item, date}) => <span>{item.title} · {item.data.assignee} · {date}</span>}
    classNames={{item: ({item}) => `priority-${item.data.priority}`, day: ({isToday}) => isToday ? 'is-today' : undefined}}
    getItemAppearance={item => item.data.blocked ? {accentColor: 'crimson'} : undefined}
/>
```

Допустимое и недопустимое содержимое slots:

```tsx
// Allowed: passive text, static badges and icons.
renderItem={({item}) => <><span className="badge">{item.data.priority}</span> {item.title}</>}
// Not allowed: links, buttons, inputs or tab stops of their own, even with tabIndex={-1}.
renderItem={({item}) => <a href={`/tasks/${item.id}`}>{item.title}</a>}
renderItem={({item}) => <button type="button" onClick={() => archive(item)}>Archive</button>}
// Instead: onItemPress opens the task, getItemActions offers "Archive" in the day agenda.
onItemPress={({item}) => openTask(item.id)}
getItemActions={() => [{id: 'archive', label: 'Archive'}]}
```

<a id="prop-renderagendaitem"></a>
### `renderAgendaItem`

`(context: CalendarAgendaItemSlotContext<TItemData, TSourceData>) => ReactNode`. Заменяет видимое содержимое строки повестки;
вызывается один раз на каждый item даты повестки. Сводка по умолчанию (название, время, source) остаётся визуально скрытым
текстом и начинает доступное имя элемента нажатия строки; видимое пользовательское содержимое следует за ней в имени, поэтому
то, что видит пользователь, входит в имя для assistive technologies и голосового ввода (WCAG 2.5.3).
Без slot имя — только сводка. Строка сохраняет
accent marker и цвета, а trigger действий остаётся вне пользовательского содержимого. Действуют правила пассивного содержимого
[`renderItem`](#prop-renderitem).

<a id="prop-renderdayheader"></a>
### `renderDayHeader`

`(context: CalendarDayState) => ReactNode`. Заменяет видимый заголовок каждой ячейки даты. Ячейка сохраняет полное доступное
имя (длинную дату) и описание (число событий, сегодня, открытый день); заголовок скрыт от assistive technology. Только
пассивное содержимое, как для [`renderItem`](#prop-renderitem).

<a id="prop-rendertoolbarcontent"></a>
### `renderToolbarContent`

`(context: CalendarToolbarSlotContext) => ReactNode`. Область расширения после controls панели пакета (навигация, «Сегодня»,
selector sources); она их не заменяет. Она вне сетки, поэтому может содержать ваши controls, которые сохраняют обычный
порядок Tab после controls пакета; их имена, клавиатура и стили focus — ваша ответственность.

<a id="prop-renderloading"></a>
### `renderLoading`

`(context: CalendarLoadingSlotContext) => ReactNode`. Заменяет тело области загрузки по умолчанию (initial — область вместо
сетки; refresh — баннер в потоке над сеткой вместо тонкой полосы прогресса). Область сохраняет роль и имя; ваше содержимое
может содержать controls.

<a id="prop-renderempty"></a>
### `renderEmpty`

`(context: CalendarEmptySlotContext) => ReactNode`. Заменяет тело `emptyLabel` именованной области, которая показывается, когда в
видимом диапазоне после фильтра sources нет items.

<a id="prop-rendererror"></a>
### `renderError`

`(context: CalendarErrorSlotContext) => ReactNode`. Заменяет тело области ошибки по умолчанию. Для `kind: 'data'` стандартная
кнопка «Повторить» не показывается, если вы заменили тело: вызывайте `onRetryRequest` из собственного доступного control. Он
же рендерит оболочку contract error с `{kind: 'contract', error, hasStaleItems: false}`, где нет диапазона и повтора. Ошибка,
брошенная вашим renderer, относится к вашему error boundary.

<a id="unavailable"></a>
## Props, недоступные в alpha.2

Эти ключи есть в опубликованном `CalendarProps` только как `?: never`. Если они всё же попадают в `Calendar` во время
выполнения (например, из нетипизированного JavaScript), каждый удаляется до валидации, ни на что не влияет и даёт одно
предупреждение в development `[@nelmad/calendar] <prop>: not available in 0.2.0-alpha.2; ignored` (в production — тишина).
Любой другой неизвестный prop удаляется так же, со своей формулировкой: prop 0.1 даёт
`[@nelmad/calendar] <prop>: removed in 0.2; see the migration guide (docs/migration-0.1-to-0.2.md); ignored`, любое другое
имя — `[@nelmad/calendar] <prop>: not a Calendar prop; ignored`. Собственные `key`, `ref` (в React 19 `ref` попадает в
props) и `children` React удаляются без предупреждения.

| Запланировано на | Props |
| --- | --- |
| `0.2.0-beta.1` | `selection`, `onSelectionChange`, `onCreateRequest`, `itemMoveStates`, `onItemMoveRequest`, `onItemMoveDraftChange`, `interactionPolicy` |

<a id="callbacks"></a>
## Когда вызываются callbacks

| Callback | Когда | Payload |
| --- | --- | --- |
| `onNavigate` | Синхронно в обработчике события пользователя | Первый день запрошенного месяца |
| `onVisibleRangeChange` | В effect после commit, когда DOM обновлён | Новый объект `CalendarVisibleRange` |
| `onAgendaDateChange` | Синхронно в обработчике события пользователя | Запрошенная дата |
| `onRetryRequest` | Синхронно при нажатии «Повторить» | нет |
| `onItemPress` | Синхронно после завершённого нажатия | `CalendarItemPressRequest` |
| `onItemActionRequest` | Синхронно после завершённой activation действия | `CalendarItemActionRequest` |
| `onVisibleSourceIdsChange` | Синхронно при переключении source | Следующий `visibleSourceIds` |

Ни один callback не вызывается во время render или на сервере и ни один — пока показана оболочка contract error.
Callbacks могут быть новыми функциями на каждом рендере. `sortItems`, `getItemActions`, `getItemAppearance`, slots `render*`,
callbacks `classNames` и функции сообщений — чистые resolvers, а не уведомления: React может вызвать их несколько раз,
поэтому побочных эффектов в них быть не должно.

<a id="tokens"></a>
## Tokens и CSS-переменные

| Путь token | CSS-переменная | По умолчанию в `classicTheme` (светлая) | Допустимое значение |
| --- | --- | --- | --- |
| `color.surface` | `--nelmad-calendar-color-surface` | `#fff` | CSS `<color>` |
| `color.text` | `--nelmad-calendar-color-text` | `#21201f` | CSS `<color>` |
| `color.muted` | `--nelmad-calendar-color-muted` | `#66625e` | CSS `<color>` |
| `color.border` | `--nelmad-calendar-color-border` | `#8b8680` | CSS `<color>` |
| `color.accent` | `--nelmad-calendar-color-accent` | `#b52f21` | CSS `<color>` |
| `color.danger` | `--nelmad-calendar-color-danger` | `#b21f24` | CSS `<color>` |
| `color.focus` | `--nelmad-calendar-color-focus` | `#135fd1` | CSS `<color>` |
| `typography.fontFamily` | `--nelmad-calendar-typography-font-family` | наследуется | список `font-family` |
| `typography.fontSize` | `--nelmad-calendar-typography-font-size` | наследуется | положительный `<length-percentage>` |
| `typography.fontWeight` | `--nelmad-calendar-typography-font-weight` | наследуется | `font-weight` |
| `typography.lineHeight` | `--nelmad-calendar-typography-line-height` | наследуется | `normal`, положительное число или `<length-percentage>` |
| `spacing.xs` | `--nelmad-calendar-spacing-xs` | `4px` | неотрицательная `<length>` |
| `spacing.sm` | `--nelmad-calendar-spacing-sm` | `8px` | неотрицательная `<length>` |
| `spacing.md` | `--nelmad-calendar-spacing-md` | `16px` | неотрицательная `<length>` |
| `spacing.lg` | `--nelmad-calendar-spacing-lg` | `24px` | неотрицательная `<length>` |
| `density.dayMinHeight` | `--nelmad-calendar-density-day-min-height` | `100px` (comfortable `128px`) | положительная `<length>` |
| `density.itemHeight` | `--nelmad-calendar-density-item-height` | `24px` (comfortable `32px`) | положительная `<length>` |
| `density.gap` | `--nelmad-calendar-density-gap` | `4px` (comfortable `8px`) | неотрицательная `<length>` |
| `radii.sm` | `--nelmad-calendar-radii-sm` | `6px` | неотрицательный `<length-percentage>` |
| `radii.md` | `--nelmad-calendar-radii-md` | `13px` | неотрицательный `<length-percentage>` |
| `radii.lg` | `--nelmad-calendar-radii-lg` | `24px` | неотрицательный `<length-percentage>` |
| `shadows.overlay` | `--nelmad-calendar-shadows-overlay` | `0 8px 24px rgb(0 0 0 / 18%)` | список `box-shadow` или `none` |
| `motion.duration` | `--nelmad-calendar-motion-duration` | `100ms` | неотрицательное `<time>` |
| `motion.easing` | `--nelmad-calendar-motion-easing` | `ease-out` | `<easing-function>` |
| `components.itemBackground` | `--nelmad-calendar-components-item-background` | `#f2f0ec` | CSS `<color>` |
| `components.itemText` | `--nelmad-calendar-components-item-text` | `#21201f` | CSS `<color>` |
| `components.selectedDayBackground` | `--nelmad-calendar-components-selected-day-background` | `#fde5df` | CSS `<color>` |

Тёмная схема (`colorScheme="dark"` или `"system"` при тёмных предпочтениях) меняет значения цветов и components по
умолчанию. `var()`, `calc()` и относительные единицы допустимы, если вычисленное значение соответствует таблице; spacing и
density не принимают проценты. Chips, bars и строки повестки используют `components.itemBackground` и
`components.itemText`; `components.selectedDayBackground` окрашивает только выбранные дни, а выделения в alpha.2 нет. `neutralTheme` меняет
значения цветов и компонентов (светлая схема: surface `#fff`, text `#1b1f24`, muted `#545d68`, border `#818b98`, accent
`#0a5bc4`, danger `#b4232c`, focus `#7139c9`, фон item `#eef1f5`), радиусы (`4px`, `6px`, `10px`), тень overlay и motion
(`150ms`, `cubic-bezier(0.2, 0, 0, 1)`); значения density, spacing и typography остаются прежними. У обоих presets есть
тёмная палитра.
Кнопки и пункты меню берут заливку и состояние hover из `color.surface` и `color.text`.

Приоритет для каждой переменной, от низшего: значения темы и density (объявлены на корне с нулевой specificity) → ваш CSS на
корневом элементе → `tokens` (inline) → та же переменная в `style` (inline, объединяется последней). CSS `!important`
подчиняется обычному cascade. Объявления на предке корня не действуют, потому что значения по умолчанию заданы на самом
корне. Значение `tokens`, являющееся одним значением декларации, передаётся без изменений; во время render календарь не
вызывает `CSS.supports` и не читает computed styles.
Значение размера, которое измеряется как ноль или не конечное число, приводит к нулю lanes и `+N`.

<a id="messages"></a>
## Каталог сообщений

В `CalendarMessages` 63 ключа. Переопределить можно любой; в alpha.2 отображаются или объявляются следующие:

| Ключ | Сигнатура | `en-US` | `ru-RU` |
| --- | --- | --- | --- |
| `calendarLabel` | `string` | Calendar | Календарь |
| `previousMonthLabel` | `string` | Previous month | Предыдущий месяц |
| `nextMonthLabel` | `string` | Next month | Следующий месяц |
| `todayLabel` | `string` | Today | Сегодня |
| `untitledItemLabel` | `string` | Untitled | Без названия |
| `closeAgendaLabel` | `string` | Close day agenda | Закрыть события дня |
| `agendaHeading` | `(date: ISODate) => string` | Events for {date} | События: {date} |
| `agendaEmpty` | `string` | No events on this day | На этот день событий нет |
| `itemCountLabel` | `(date: ISODate, count: number) => string` | {date}: {count} events | {date}: {count} событий |
| `moreItemsLabel` | `(date: ISODate, count: number) => string` | {date}: {count} events hidden | {date}: ещё {count} событий |
| `todayStateLabel` | `string` | Today | Сегодня |
| `viewedDateStateLabel` | `string` | Viewed day | Открытый день |
| `retryLabel` | `string` | Retry | Повторить |
| `loadingLabel` | `string` | Loading calendar | Загрузка календаря |
| `refreshingLabel` | `string` | Refreshing calendar | Обновление календаря |
| `emptyLabel` | `string` | No events in this month | В этом месяце событий нет |
| `errorLabel` | `string` | Could not load calendar | Не удалось загрузить календарь |
| `invalidConfigurationLabel` | `string` | Calendar cannot be displayed: invalid configuration | Не удалось показать календарь: неверные настройки |
| `navigationBoundaryReason` | `string` | Month is outside the supported range | Месяц вне поддерживаемого диапазона |
| `gridInstructions` | `string` | Use arrow keys to navigate dates. Enter opens day events. Page Up and Page Down change the month. | Стрелки — перейти к дате. Enter — открыть события дня. Page Up и Page Down — сменить месяц. |
| `monthChangedAnnouncement` | `(monthStart: ISODate) => string` | Showing {month} | Открыт месяц: {month} |
| `refreshCompletedAnnouncement` | `string` | Calendar refreshed | Календарь обновлён |
| `agendaUpdatedAnnouncement` | `(date: ISODate, count: number) => string` | Showing {date}, {count} events | Открыты события: {date}, {count} событий |
| `sourceSelectorLabel` | `string` | Calendars | Календари |
| `showSourceLabel` | `(sourceTitle: string) => string` | Show calendar {title} | Показать календарь {title} |
| `hideSourceLabel` | `(sourceTitle: string) => string` | Hide calendar {title} | Скрыть календарь {title} |
| `itemActionsLabel` | `(itemTitle: string) => string` | Actions for {title} | Действия: {title} |
| `cancelLabel` | `string` | Cancel | Отмена |

`{date}` — короткая локализованная дата, `{month}` — месяц и год, `{count}` — локализованное число с формой
множественного числа языка каталога, `{title}` — название source или item (для item действует fallback «Без названия»),
изолированное как двунаправленный текст.

Остальные 35 ключей типизированы для запланированного API `0.2` и в alpha.2 не отображаются: `openAgendaLabel`,
`selectedStateLabel`, `selectionDraftStateLabel`, `unavailableStateLabel`, `pendingStateLabel`, `selectDateLabel`,
`selectRangeLabel`, `confirmSelectionLabel`, `clearSelectionLabel`, `createLabel`, `moveItemLabel`, `confirmMoveLabel`,
`genericBlockedReason`, `selectionBoundaryReason`, `moveDstGapReason`, `moveBoundaryReason`, `moveItemChangedReason`,
`moveTimeZoneChangedReason`, `moveItemUnavailableReason`, `rangeSelectionInstructions`, `moveInstructions`,
`blockedAnnouncement`, `selectionStartedAnnouncement`, `selectionTargetAnnouncement`, `selectionCancelledAnnouncement`,
`selectionCompletedAnnouncement`, `selectionClearedAnnouncement`, `moveStartedAnnouncement`,
`moveNavigationPendingLabel`, `moveTargetAnnouncement`, `moveCancelledAnnouncement`, `moveNoopAnnouncement`,
`movePendingAnnouncement`, `moveSucceededAnnouncement`, `moveRejectedAnnouncement`. Их точные сигнатуры — в
[сгенерированном отчёте](api/calendar.api.md).

<a id="data-attributes"></a>
## Атрибуты `data-*`

Стабильный контракт для оформления и тестов (`CalendarDataAttribute`). Boolean-атрибуты равны `"true"`, когда состояние
активно, и отсутствуют иначе. Каждый атрибут есть только на перечисленных элементах; «portal theme roots» — theme roots
пакета у popover и sheet повестки, menus и sheets действий item и menu и sheet selector sources этого календаря.

| Атрибут | Элемент | Значения |
| --- | --- | --- |
| `data-theme` | корень календаря и его portal theme roots | `"classic"`, `"neutral"` |
| `data-layout` | корень календаря | разрешённое `"desktop"`, `"mobile"`; `"mobile"` для `auto` до первого измерения и в оболочке contract error |
| `data-density` | корень календаря и его portal theme roots | `"compact"`, `"comfortable"` |
| `data-color-scheme` | корень календаря и его portal theme roots | запрошенное `"system"`, `"light"`, `"dark"` |
| `data-dir` | корень календаря и его portal theme roots | разрешённое `"ltr"`, `"rtl"` |
| `data-status` | корень календаря | `"ready"`, `"loading"`, `"error"` (и для contract errors) |
| `data-loading-phase` | корень календаря | `"initial"`, `"refresh"`; только при `data-status="loading"` |
| `data-date` | каждая ячейка даты `gridcell`, корень повестки | ISO-дата |
| `data-today` | ячейка `gridcell` | `"true"` для известного today |
| `data-agenda-date` | ячейка `gridcell` | `"true"` для открытой даты повестки |
| `data-selected` | ячейка `gridcell`, обёртки сегментов Month и items повестки | `"true"` для принятого выделения (beta.1) |
| `data-selection-draft` | ячейка `gridcell` | `"true"` внутри черновика выделения (beta.1) |
| `data-selection-unavailable` | ячейка `gridcell` | `"true"`, если дату нельзя выделить (beta.1) |
| `data-outside-month` | ячейка `gridcell` | `"true"` для дней соседних месяцев |
| `data-has-items` | ячейка `gridcell` | `"true"`, если у дня есть хотя бы один валидный item после фильтра sources |
| `data-item-id` | каждая обёртка сегмента Month и item повестки | точный `item.id` |
| `data-view` | те же обёртки items | `"month"`, `"agenda"` |
| `data-dragging` | те же обёртки items | `"true"`, пока item перетаскивается (beta.1) |
| `data-pending` | те же обёртки items | `"true"`, пока перенос ожидает ответа (beta.1) |
| `data-presentation` | корень повестки | разрешённое `"popover"`, `"inline"`, `"sheet"` |

Оболочка contract error имеет `data-theme="classic"`, `data-layout="mobile"`, `data-density="compact"`,
`data-color-scheme="system"`, `data-status="error"`, fallback `data-dir`, не имеет `data-loading-phase`, portals и
атрибутов представлений. Атрибуты выделения, перетаскивания и ожидания в alpha.2 не появляются: этих состояний ещё нет.
Два календаря не делят и не смешивают эти значения: каждый portal theme root повторяет атрибуты своего календаря. Остальные
атрибуты и имена классов внутренние.

<a id="diagnostics"></a>
## Диагностика

**Contract errors.** Первая проблема становится сообщением `RangeError` за оболочкой ошибки; каждая проблема также
выводится предупреждением.

| Путь | Причина |
| --- | --- |
| `props` | Expected a props object |
| `items`, `anchorDate`, `timeZone`, `onNavigate` (отсутствует) | Required; expected a readonly array / an ISO date such as 2026-09-01 / an IANA time zone such as Europe/Moscow / a function |
| `anchorDate` | Expected YYYY-MM-DD in 0001…9999; Expected an existing date; `<date>` does not exist; anchorDate must be between February 0001 and November 9999 |
| `timeZone` | Timezone is outside the package accepted-set |
| `today`, `agendaDate` | Expected YYYY-MM-DD in 0001…9999; Expected an existing date; `<date>` does not exist |
| `layout` | Unknown enum value; expected 'auto' or 'desktop' or 'mobile' |
| `mobileBreakpoint` | Expected a positive finite number |
| `firstDayOfWeek`, `hourCycle`, `dir`, `agendaPresentation`, `density`, `colorScheme` | Unknown enum value |
| `locale`, `messagesLocale` | Expected a well-formed BCP 47 language tag |
| переданные `onNavigate`, `onVisibleRangeChange`, `onAgendaDateChange`, `onRetryRequest`, `onItemPress`, `sortItems`, `getItemActions`, `onItemActionRequest`, `onVisibleSourceIdsChange` | Expected a function |
| `agendaDate`, `visibleSourceIds`, `getItemActions` | Must be supplied together with onAgendaDateChange / onVisibleSourceIdsChange / onItemActionRequest |
| `items`, `sources`, `visibleSourceIds` | Expected a readonly array |
| `sources` | Controlled source filtering requires sources |
| `showSourceSelector` | Requires visibleSourceIds and its callback; Expected a boolean |
| `dataState`, `dataState.phase`, `dataState.error` | Unknown data state; Expected initial or refresh; Error state requires an error payload |
| `theme` | Expected a package theme preset |
| `classNames`, `classNames.<key>` | Expected an object of class names; Expected a class name string or function |

Оболочка — именованный `region` с видимой областью ошибки (`invalidConfigurationLabel`) и срочным объявлением; в ней нет
toolbar, сетки, повестки, повтора и callbacks. Язык берётся из валидного `messagesLocale`, затем из валидного `locale`, затем
`ru-RU`; направление — из валидного `dir`, затем из валидного `locale`, затем `ltr`. `className`, `style`, `id` и ARIA-props
имени по-прежнему применяются, `tokens` — нет. После исправления props календарь рендерится снова; отменённые запросы не
возобновляются.

**Исключённые записи и восстановимые значения** (только предупреждения):

| Путь | Причина |
| --- | --- |
| `items[i]` | Invalid item id, title or calendarId; All items with this ID are excluded |
| `items[i].interval` | Причина парсера, например Expected YYYY-MM-DD in 0001…9999, Expected an existing date; `<date>` does not exist, Invalid RFC3339 grammar, A date range requires end > start, Timed end must be >= start, Timezone is outside the package accepted-set |
| `items[i].title` | Use the localized untitled-item label |
| `items[i].calendarId` | No source with ID `"<id>"`; items with this calendarId remain visible with fallback appearance (один раз на неизвестный ID, по первому item) |
| `items[].calendarId` | No sources supplied; affected items remain visible with fallback appearance (без prop `sources`: одно предупреждение на все) |
| `sources[i]` | Source requires nonempty id and title; All sources with this ID are excluded |
| `visibleSourceIds[i]` | Unknown or repeated source ID |
| `getItemActions("<id>").actions[i]`, `getItemActions("<id>").actions` | Invalid action id, label or tone; All actions with this ID are excluded; Expected an array |
| `locale` | `<tag>` is unsupported; using en-US |
| `messages.<key>`, `messages.*` | Expected a nonempty message of the declared shape; using built-in fallback |
| `tokens.<group>`, `tokens.<group>.<token>` | Expected a token group; Expected a nonempty CSS string; Expected a single CSS declaration value |
| `sources("<id>").color` | Expected a nonempty CSS color string; ignored / Expected a single CSS declaration value; ignored |
| `getItemAppearance("<id>")`, `getItemAppearance("<id>").<field>` | Expected an appearance object or undefined; ignored / Expected a nonempty CSS color string; ignored / Expected a single CSS declaration value; ignored |
| `renderItem`, `renderAgendaItem`, `renderDayHeader` | Interactive content `<tag …>` is not allowed in passive slot content; use onItemPress or getItemActions |
| `portalContainer` | The calendar is inside a role="dialog" element without aria-modal="true", … (target по умолчанию `body` внутри диалога хоста без `aria-modal`, см. [`portalContainer`](#prop-portalcontainer)); причина отклонённого container |
| `sortItems` | Non-finite comparator result is treated as zero |
| `aria-labelledby` | Ignored missing, empty or cross-tree references: `<ids>` |
| `<prop>` (следующий prerelease) | not available in 0.2.0-alpha.2; ignored |
| `<prop>` (0.1) | removed in 0.2; see the migration guide (docs/migration-0.1-to-0.2.md); ignored |
| другой `<prop>` | not a Calendar prop; ignored |

Диагностика выводится после клиентского commit, в котором она отрендерена, включая сообщение, которое рендерит только
повестка (предупреждение о недоступном prop — также во время render, включая SSR), и дедуплицируется на экземпляр
(props вне prerelease — один раз на имя prop для всего модуля; неизвестный `calendarId` — один раз на ID). Удаляемый корень не проверяется, поэтому размонтирование никогда не сообщает о
`aria-labelledby`. Тексты предупреждений — диагностика, а не API.

<a id="time-zones"></a>
## Допустимые часовые пояса

`timeZone` и `interval.timeZone` принимают 445 primary identifiers, включая `UTC`, построенных из IANA tzdb 2026c по правилам
ECMA-402 edition 12, с учётом регистра и без сопоставления aliases. Список входит в данные пакета и одинаков в ESM, CJS, на
сервере и в браузере; `Intl.supportedValuesOf` и зона хоста не используются. Гарантированно входят `UTC`, `Europe/Moscow`,
`Europe/Berlin`, `America/New_York`, `Asia/Tokyo` и `Pacific/Apia`. Примеры отклоняемых значений: `Etc/UTC`, `GMT`,
`US/Eastern`, `europe/berlin`, `+03:00`, `""`.

Полный список с SHA-256 — в [timezones-candidate.ru.md](implementation/timezones-candidate.ru.md). Это кандидат: список
замораживается для всей линии `0.2.x` в первом release candidate. Смещения и переходы по-прежнему берутся из данных Intl
среды выполнения.

<a id="browser-zones"></a>
### Собственная зона браузера

`Intl.DateTimeFormat().resolvedOptions().timeZone` не всегда возвращает принимаемый identifier. Для 19 зон Chrome 154 и
Node.js 24 сообщают устаревшее имя, и календарь отклоняет его (contract error), как любой другой alias:

| Сообщает браузер | Принимаемый identifier |
| --- | --- |
| `Africa/Asmera` | `Africa/Asmara` |
| `America/Buenos_Aires` | `America/Argentina/Buenos_Aires` |
| `America/Catamarca` | `America/Argentina/Catamarca` |
| `America/Coral_Harbour` | `America/Atikokan` |
| `America/Cordoba` | `America/Argentina/Cordoba` |
| `America/Godthab` | `America/Nuuk` |
| `America/Indianapolis` | `America/Indiana/Indianapolis` |
| `America/Jujuy` | `America/Argentina/Jujuy` |
| `America/Louisville` | `America/Kentucky/Louisville` |
| `America/Mendoza` | `America/Argentina/Mendoza` |
| `Asia/Calcutta` | `Asia/Kolkata` |
| `Asia/Katmandu` | `Asia/Kathmandu` |
| `Asia/Rangoon` | `Asia/Yangon` |
| `Asia/Saigon` | `Asia/Ho_Chi_Minh` |
| `Atlantic/Faeroe` | `Atlantic/Faroe` |
| `Europe/Kiev` | `Europe/Kyiv` |
| `Pacific/Enderbury` | `Pacific/Kanton` |
| `Pacific/Ponape` | `Pacific/Pohnpei` |
| `Pacific/Truk` | `Pacific/Chuuk` |

Сопоставьте эти имена, прежде чем передавать определённую зону, и оставьте fallback для среды, которая сообщит что-то
другое. `getCalendarVisibleRange` выбрасывает исключение для зоны вне списка, поэтому им можно проверить результат:

```ts
import {getCalendarVisibleRange, type IanaTimeZone} from '@nelmad/calendar';

// Legacy names that Chrome 154 and Node.js 24 report for accepted zones.
const legacyZones: Record<string, IanaTimeZone> = {
    'Africa/Asmera': 'Africa/Asmara', 'America/Buenos_Aires': 'America/Argentina/Buenos_Aires', 'America/Catamarca': 'America/Argentina/Catamarca',
    'America/Coral_Harbour': 'America/Atikokan', 'America/Cordoba': 'America/Argentina/Cordoba', 'America/Godthab': 'America/Nuuk',
    'America/Indianapolis': 'America/Indiana/Indianapolis', 'America/Jujuy': 'America/Argentina/Jujuy', 'America/Louisville': 'America/Kentucky/Louisville',
    'America/Mendoza': 'America/Argentina/Mendoza', 'Asia/Calcutta': 'Asia/Kolkata', 'Asia/Katmandu': 'Asia/Kathmandu',
    'Asia/Rangoon': 'Asia/Yangon', 'Asia/Saigon': 'Asia/Ho_Chi_Minh', 'Atlantic/Faeroe': 'Atlantic/Faroe',
    'Europe/Kiev': 'Europe/Kyiv', 'Pacific/Enderbury': 'Pacific/Kanton', 'Pacific/Ponape': 'Pacific/Pohnpei',
    'Pacific/Truk': 'Pacific/Chuuk',
};

/** The viewer's zone as an accepted identifier, or `fallback` when the package does not accept it. */
export function viewerTimeZone(fallback: IanaTimeZone = 'UTC'): IanaTimeZone {
    const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const zone = legacyZones[detected] ?? detected;
    try {
        getCalendarVisibleRange({anchorDate: '2026-01-01', timeZone: zone}); // throws RangeError for a zone outside the list
        return zone;
    } catch {
        return fallback;
    }
}
```

<a id="stability"></a>
## Стабильность

`0.2.0-alpha.2` — prerelease: следующий prerelease может изменить этот API с записью в changelog. Обещание совместимости для
patch-релизов `0.2.x` начинается со stable `0.2.0`.

<a id="releases"></a>
## Релизы и provenance

Релизы выпускаются по [RELEASING.md](../RELEASING.md): после зелёного CI на commit мейнтейнер запускает
[Release workflow](../.github/workflows/release.yml) на `main`, который ставит version в npm staged publishing с provenance
через trusted publishing. Version становится публичной только после подтверждения мейнтейнера с двухфакторной
аутентификацией; затем создаются tag и GitHub Release с разделом changelog. Prereleases используют dist-tag `next`.
`npm audit signatures` в вашем приложении проверяет подписи registry и provenance attestations; см.
[Релизы и provenance](../README.ru.md#releases).
