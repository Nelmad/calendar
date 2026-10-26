# Переход с 0.1 на 0.2

[English](migration-0.1-to-0.2.md) · **Русский** · [README](../README.ru.md) · [Справочник API](api.ru.md)

<a id="overview"></a>
## Обзор

`0.2` — осознанно несовместимый релиз. В нём одна модель данных — `items` с явной IANA `timeZone` — и нет legacy-режима,
адаптеров совместимости и deprecated aliases: календарь не распознаёт props 0.1 и не сопоставляет их молча. Это руководство
переводит ваши данные и callbacks на стороне приложения. Оно рассчитано на `0.2.0-alpha.2`, где есть вид месяца с
адаптивным desktop/mobile layout, повестка дня, контролируемые навигация и загрузка, `onItemPress`, действия items,
контролируемые sources, локализация, `classicTheme` и `neutralTheme`, цвета items и slots содержимого; см.
[Чего ещё нет в alpha.2](#not-yet).

<a id="checklist"></a>
## Порядок действий

1. Проверьте требования к Node.js и React, установите новую версию по точному номеру и удалите peers, нужные только
   календарю ([Зависимости](#dependencies)).
2. Переведите `events` в `items`, доменные поля — в `data` ([События в items](#items)).
3. Выберите явную IANA `timeZone` ([Часовой пояс](#time-zone)) и разрешите timestamps без смещения
   ([Timestamps без смещения](#offset-less)).
4. Переведите all-day даты с включённого конца на исключённый ([All-day](#all-day)); сохраните timed instants
   ([Timed](#timed)).
5. Замените callbacks, props загрузки и оформления ([Callbacks](#callbacks), [Загрузка](#loading), [Оформление](#styling)).
6. Замените удалённые helpers ([Helpers](#helpers)) и уберите все импорты из таблицы [Удалённые экспорты](#removed-exports).
7. Выберите layout: значение по умолчанию `layout="auto"` следует за шириной календаря; передайте `layout="desktop"`,
   чтобы при любой ширине сохранить сетку из семи столбцов, как в 0.1.

<a id="dependencies"></a>
## Зависимости

0.1 требовал ставить рядом с календарём `dayjs`, `react-aria-components` и `@react-aria/interactions`. У `0.2` peers только
`react` и `react-dom` (`^18.2.0 || ^19.0.0`), а библиотеки дат и доступности поставляются обычными dependencies; Day.js не
используется вовсе. Удалите эти пакеты, если приложение не использует их само. Импорты locales Day.js больше не
настраивают календарь: используйте `locale`.

Требования строже, чем в `0.1.1`:

| | `0.1.1` | `0.2` |
| --- | --- | --- |
| Node.js (`engines`) | 18 или новее | 22 или новее |
| `react`, `react-dom` | любая версия начиная с 18 | `^18.2.0 \|\| ^19.0.0`, согласованная пара |

React 18.0 и 18.1 больше не поддерживаются, как и `react` и `react-dom` разных версий: обновите оба пакета вместе до
установки `0.2`.

`0.2.0-alpha.2` опубликован под npm dist-tag `next`, а `latest` по-прежнему указывает на `0.1.1`, поэтому простая
установка оставляет 0.1. Установите календарь по точной версии, как описано в [README](../README.ru.md#install), с
`--save-exact`, чтобы следующий prerelease `0.2.0` не подтянулся без вашей проверки.

<a id="items"></a>
## События в items

Переименуйте prop `events` в `items`. У каждого item есть `id`, `title`, `interval` и обобщённое `data`; храните там все
доменные поля, включая `taskId`, `variant`, `isOverdue`, `isCritical`, `isClickable` и `hasHoverActions`. Календарь их не
читает; сопоставьте их сами с [`getItemAppearance`](api.ru.md#prop-getitemappearance),
[`getItemActions`](api.ru.md#prop-getitemactions) и slots содержимого ([Оформление](#styling), [Callbacks](#callbacks)). Пустой календарь — `items={[]}`. ID должны быть
уникальными и непустыми; записи, не прошедшие проверку, исключаются с предупреждением в development, а не ломают календарь.

<a id="time-zone"></a>
## Часовой пояс

0.1 рисовал всё в одном фиксированном смещении (`utcOffset` или alias в нижнем регистре `timezone`, принимавший ту же строку
`+03:00`, по умолчанию `+00:00`). `0.2` требует `timeZone` — IANA identifier вроде `Europe/Moscow` — и применяет её
правила DST и исторические изменения. Фиксированное смещение не определяет одну географическую зону, поэтому календарь
никогда сам не превращает `+03:00` в зону: выберите ту зону, которую имеют в виду ваши пользователи. Строка смещения в
`timeZone` — contract error.

<a id="offset-less"></a>
## Timestamps без смещения

0.1 разбирал строки через Day.js, поэтому значение вроде `2026-09-03T10:00:00` читалось в зоне той машины, где выполнялся
код. `0.2` принимает только RFC 3339 timestamps с `Z` или `±HH:MM`. До миграции разрешите такие значения в явные instants
по реальному смыслу данных (например, по зоне офиса, где их вводили). Не передавайте их как есть и не позволяйте выбирать
среде выполнения: функция конверсии ниже их отклоняет.

<a id="all-day"></a>
## All-day: от включённого конца к исключённому

В 0.1 all-day событие занимало даты `start` и `end` в смещении отображения, обе включительно; без `end` — дату начала. В
`0.2` all-day интервал — пара дат с **исключённым** концом:

- возьмите дату начала и последнюю включённую дату в смещении отображения 0.1;
- новый `end` — календарный день после последней включённой даты (прибавьте один календарный день к дате, а не 24 часа к
  instant);
- при отсутствующем `end` в 0.1 последней включённой датой считается дата начала.

Даты 3–4 сентября становятся `[2026-09-03, 2026-09-05)`; событие на 3 сентября без окончания —
`[2026-09-03, 2026-09-04)`. Переносятся только покрываемые даты, а не время старых timestamps; при необходимости сохраните
исходные значения в `data`. All-day даты больше не сдвигаются при смене часового пояса.

<a id="timed"></a>
## Timed: instants сохраняются

Для timed событий сохраните instants `start` и `end`; отсутствующий `end` остаётся отсутствующим, и item становится
моментом в дату своего начала. Layout использует исключённые концы, поэтому может отличаться от 0.1: событие, которое
заканчивается ровно в полночь, больше не появляется в следующем дне. Например, `22:00 → 00:00` 14 сентября занимает только
14 сентября. Не прибавляйте миллисекунду или день, чтобы воспроизвести старую полосу: прежний layout не обещается.

<a id="conversion"></a>
## Функция конверсии

Эта функция — файл [`examples/migration/convert.ts`](../examples/migration/convert.ts), который проверяют тесты
репозитория: перевод включённого конца в исключённый, отсутствующий конец, сохранение instants и разница в полночь,
отрисованная настоящим `Calendar`.

<!-- file: examples/migration/convert.ts -->
```ts
import type {CalendarItem, ISODate, RFC3339DateTime} from '@nelmad/calendar';

/** The 0.1 event shape. Keep it in the application only while migrating. */
export type LegacyEvent = {
    id: string; start: string; end?: string; title: string;
    variant: 'red' | 'blue' | 'green' | 'grey';
    isOverdue: boolean; isCritical: boolean; isAllDay: boolean;
    taskId: string | null; isClickable: boolean; hasHoverActions: boolean;
};
/** Domain fields move to `data`; the original 0.1 timestamps stay there as well. */
export type LegacyEventData = Omit<LegacyEvent, 'id' | 'title' | 'isAllDay'>;

const strict = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;
const timestamp = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d+))?)?(Z|([+-])(\d{2}):(\d{2}))$/;

/** A real calendar date 0001-01-01…9999-12-31 (no 30 February), as 0.2 requires. */
function isoDate(value: string, field: string): ISODate {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    const [year, month, day] = match ? match.slice(1).map(Number) : [];
    const days = month === 2 ? (year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28) : [4, 6, 9, 11].includes(month) ? 30 : 31;
    if (!match || year < 1 || month < 1 || month > 12 || day < 1 || day > days) throw new RangeError(`${field}: ${value} is not a calendar date`);
    return value;
}
/**
 * An instant with an explicit offset. Offset-less values are resolved by the application first; `-00:00` (offset
 * unknown), hour 24, leap seconds and impossible dates throw like in 0.2 instead of being moved by `Date.parse`.
 */
function instant(value: string, field: string): RFC3339DateTime {
    const match = timestamp.exec(value);
    if (!match || match[6] === '-00:00') throw new RangeError(`${field}: ${value} is not a timestamp with a UTC offset`);
    const [hour, minute, second, offsetHour, offsetMinute] = [match[2], match[3], match[4] ?? '0', match[8] ?? '0', match[9] ?? '0'].map(Number);
    if (hour > 23 || minute > 59 || second > 59 || offsetHour > 23 || offsetMinute > 59) throw new RangeError(`${field}: ${value} has an invalid time or offset`);
    const date = isoDate(match[1], field), time = new Date(0);
    time.setUTCFullYear(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8)));
    time.setUTCHours(hour, minute - (match[7] === '-' ? -1 : 1) * (offsetHour * 60 + offsetMinute), second, Number((match[5] ?? '').slice(0, 3).padEnd(3, '0')));
    if (time.getUTCFullYear() < 1 || time.getUTCFullYear() > 9999) throw new RangeError(`${field}: ${value} is outside 0001…9999`);
    // Same instant; only a non-strict spelling (no seconds, more digits) is rewritten in UTC.
    return strict.test(value) ? value : time.toISOString();
}
/** The calendar date of a 0.1 value in the fixed display offset that 0.1 used, e.g. '+03:00'. */
function dateAt(value: string, field: string, displayOffset: string): ISODate {
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return isoDate(value, field);
    const offset = /^([+-])(\d{2}):(\d{2})$/.exec(displayOffset);
    if (!offset) throw new RangeError(`displayOffset: ${displayOffset} is not ±HH:MM`);
    const minutes = (offset[1] === '-' ? -1 : 1) * (Number(offset[2]) * 60 + Number(offset[3]));
    // A date outside 0001…9999 in that offset (year 0 or +010000) throws like any other invalid date.
    return isoDate(new Date(Date.parse(instant(value, field)) + minutes * 60_000).toISOString().slice(0, 10), field);
}
/** Adds one calendar day to a date-only value, not 24 hours to an instant. 9999-12-31 has no exclusive end in 0.2. */
function nextDay(date: ISODate, field: string): ISODate {
    if (date === '9999-12-31') throw new RangeError(`${field}: ${date} has no exclusive end date in 0001…9999`);
    const value = new Date(`${date}T00:00:00Z`);
    value.setUTCDate(value.getUTCDate() + 1);
    return value.toISOString().slice(0, 10);
}

/**
 * Converts one 0.1 event. All-day: the inclusive 0.1 dates in `displayOffset` become an
 * exclusive date range; a missing end means one day. Timed: instants are kept, a missing
 * end stays missing (a moment). The Calendar time zone is chosen separately.
 */
export function toCalendarItem(event: LegacyEvent, displayOffset: string): CalendarItem<LegacyEventData> {
    const {id, title, isAllDay, ...data} = event;
    if (isAllDay) {
        const start = dateAt(event.start, 'start', displayOffset);
        const last = event.end === undefined ? start : dateAt(event.end, 'end', displayOffset);
        if (last < start) throw new RangeError(`end: ${event.end} is before start`);
        return {id, title, data, interval: {kind: 'allDay', start, end: nextDay(last, event.end === undefined ? 'start' : 'end')}};
    }
    const start = instant(event.start, 'start');
    if (event.end === undefined) return {id, title, data, interval: {kind: 'timed', start}};
    const end = instant(event.end, 'end');
    if (Date.parse(end) < Date.parse(start)) throw new RangeError(`end: ${event.end} is before start`);
    return {id, title, data, interval: {kind: 'timed', start, end}};
}
```

Передайте как `displayOffset` смещение, которое использовал ваш календарь 0.1, а затем выберите IANA-зону для нового
календаря:

```tsx
const items = events.map(event => toCalendarItem(event, '+03:00'));

<Calendar items={items} timeZone="Europe/Moscow" layout="desktop" anchorDate={anchorDate} onNavigate={setAnchorDate}/>;
```

Значение 0.1 только с датой (`2026-09-03`) считается этой датой. Функция бросает `RangeError` для всего, что 0.2 исключил
бы: timestamp без смещения, `-00:00`, неверные или выходящие за допустимый диапазон дата, время или смещение (например,
30 февраля, `T24:00` или leap second), timed конец раньше начала и all-day конец раньше начала. Такие записи обнаруживаются
при миграции, а не угадываются и не исключаются календарём молча.

<a id="callbacks"></a>
## Callbacks

| 0.1 | 0.2 |
| --- | --- |
| `onNavigate(anchorDate)` | То же имя и смысл: запрос с первым днём целевого месяца. Храните `anchorDate` в состоянии. |
| `onEventPress(event)` | `onItemPress({item, date, view, segmentRange?})`: item с его `data`, нажатая дата и место нажатия. |
| `isClickable` | Флага на item нет: без `onItemPress` ничего не нажимается; решайте в обработчике по `item.data`. |
| `onEventEdit`, `onEventDelete`, `hasHoverActions` | `getItemActions` с `onItemActionRequest`: возвращайте действия для каждого item (например `{id: 'delete', label: 'Delete', tone: 'danger'}`) и выполняйте выбранный `actionId` в своём обработчике. Они показываются в повестке дня как menu на desktop или action sheet на mobile, а не при наведении. |
| `SeriesActionScope` | Замены нет: действия над сериями вне `0.2`; передавайте развёрнутые вхождения отдельными items. |

В отличие от hover-действий 0.1, `onItemPress` и действия items доступны и с клавиатуры и screen reader через повестку дня.
Группировка по проектам переходит в `sources` с `calendarId` у items; контролируемые `visibleSourceIds` и
`onVisibleSourceIdsChange` добавляют встроенный selector видимости.

<a id="loading"></a>
## Загрузка

Замените `isFetching` и отдельный `CalendarSkeleton` на `dataState`:

| 0.1 | 0.2 |
| --- | --- |
| `CalendarSkeleton` до первых данных | `dataState={{status: 'loading', phase: 'initial'}}` |
| `isFetching` при перезагрузке | `dataState={{status: 'loading', phase: 'refresh'}}`, items остаются видимыми |
| Ошибка обрабатывалась вне календаря | `dataState={{status: 'error', phase, error}}` и необязательный `onRetryRequest` |
| `getMonthGridRange(anchorDate)` для запроса | `onVisibleRangeChange(range)` или `getCalendarVisibleRange(...)` на сервере |

<a id="styling"></a>
## Оформление

- Замените `import '@nelmad/calendar/tokens.css'` на единственную таблицу стилей `import '@nelmad/calendar/styles.css'`,
  подключённую в каждой CSS tree scope с календарём.
- Родитель с фиксированной высотой больше не нужен: у календаря intrinsic высота; ограничивает её определённая высота
  самого корня ([Размеры](../README.ru.md#sizing)).
- У старого объекта `theme`, `palette`, `overdueColor`, `criticalColor`, `progressBarColor` и переменных `--tc-*` нет
  aliases. Перенесите значения вручную в prop `tokens` или переменные `--nelmad-calendar-*` на корне календаря; таблица 27
  переменных — в [справочнике API](api.ru.md#tokens). `theme` теперь принимает preset `classicTheme` или `neutralTheme`.
- Цвета отдельных items по `variant` из 0.1 (и маркеры просрочки или критичности) переходят в `getItemAppearance`, который
  возвращает цвет accent, фона или текста по `item.data`; цвет проекта становится `CalendarSource.color`, который окрашивает
  только accent. Своё содержимое событий переходит в `renderItem`/`renderAgendaItem` с пассивным содержимым; кнопки
  редактирования и удаления становятся действиями item.
- Замените `labels` на `messages` (частичные переопределения встроенных каталогов `ru-RU`/`en-US`) и `messagesLocale`.
  Функции форматирования времени из `labels` 0.1 заменены `locale`, `hourCycle` и `timeZone` календаря.
- `data-testid` не является prop; используйте `id`, `className` или документированные атрибуты `data-*`.

<a id="helpers"></a>
## Helpers

`getMonthGridRange(anchorDate)` возвращал `{from, to}` с включённым `to` и всегда начинал недели с понедельника.
`getCalendarVisibleRange({anchorDate, timeZone, locale, firstDayOfWeek})` возвращает `{start, end, timeZone}` с
исключённым `end`, а недели начинаются с первого дня недели locale (понедельник для `ru-RU`, воскресенье для `en-US`), если
не передан `firstDayOfWeek`. Функция чистая и безопасна на сервере. У `getMonthGridWeeks`, `buildWeekLayout` и
`formatEventTime` публичной замены нет: layout и форматирование — задача календаря.

<a id="removed-exports"></a>
## Удалённые экспорты

| Экспорт 0.1 | Замена в 0.2 |
| --- | --- |
| `CalendarEvent` | `CalendarItem<TItemData>` |
| `CalendarEventVariant`, `VariantColor`, `VariantPalette` | Храните variant в `data`; цвета отдельных items — через `getItemAppearance` |
| `CalendarProps` (форма 0.1) | `CalendarProps<TItemData, TSourceData>` (новая форма) |
| `SeriesActionScope` | Нет: действия над сериями вне `0.2` |
| `CalendarSkeleton`, `CalendarSkeletonProps` | `dataState` |
| `getMonthGridRange` | `getCalendarVisibleRange` |
| `getMonthGridWeeks`, `buildWeekLayout`, `EventSegment`, `WeekLayout` | Нет: layout внутренний |
| `formatEventTime` | Нет: форматирование следует `locale`, `hourCycle`, `timeZone` |
| `CalendarLabels`, `defaultLabels` | `CalendarMessages`, `messages` |
| `CalendarTheme` (объект цветов 0.1), `defaultTheme` | `CalendarTheme` (непрозрачный preset), `classicTheme`, `neutralTheme`, `tokens` |
| `defaultPalette`, `defaultOverdueColor`, `defaultCriticalColor`, `defaultProgressBarColor` | `tokens` / CSS-переменные |
| `DEFAULT_LOCALE` | `locale` по умолчанию `ru-RU` |
| `@nelmad/calendar/tokens.css` | `@nelmad/calendar/styles.css` |

Импорт любого из именованных экспортов не проходит проверку типов с новыми declarations. Side-effect import
`import '@nelmad/calendar/tokens.css'` устроен иначе: TypeScript не разрешает side-effect imports (если не включён
`noUncheckedSideEffectImports`), поэтому проверку типов он проходит и падает только в бандлере или в Node, потому что пакет
больше не экспортирует этот путь. Prop 0.1, переданный из нетипизированного JavaScript, удаляется до валидации с
предупреждением в development
`[@nelmad/calendar] events: removed in 0.2; see the migration guide (docs/migration-0.1-to-0.2.md); ignored`.

<a id="not-yet"></a>
## Чего ещё нет в alpha.2

Эти части запланированного API `0.2` в alpha.2 типизированы как недоступные и во время выполнения игнорируются с
предупреждением в development. Не переносите соответствующее поведение 0.1 на мигрированный экран, пока они не выйдут:

- `0.2.0-beta.1`: выделение даты и диапазона — `selection` с `onSelectionChange` и `onCreateRequest`; перенос items с
  `itemMoveStates`, `onItemMoveRequest` и `onItemMoveDraftChange`; `interactionPolicy`.

Действия над сериями повторений не входят в `0.2`; передавайте развёрнутые экземпляры отдельными items.

<a id="verification"></a>
## Как проверяется это руководство

`tests/docs/migration.test.tsx` запускает функцию конверсии и рендерит её результат публичным `Calendar` на сервере: даты
3–4 сентября занимают ровно 3 и 4 сентября, отсутствующий конец — один день, timed instants не меняются, а timed событие,
заканчивающееся в полночь, учитывается только в дату начала. Каждое значение, которое функция принимает, принимает и
календарь, а каждое значение, которое календарь исключил бы, заставляет её бросить исключение. `npm run check:docs` проверяет, что напечатанная выше функция
совпадает с проверяемым файлом на обоих языках, что примеры используют только текущие экспорты и что у английского и
русского руководств одинаковые разделы и код.
