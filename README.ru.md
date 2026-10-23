# @nelmad/calendar

[English](README.md) · **Русский** · [Справочник API](docs/api.ru.md) · [Переход с 0.1](docs/migration-0.1-to-0.2.ru.md)

Календарь месяца для React с ISO-интервалами, часовыми поясами IANA и доступной повесткой дня.

<a id="status"></a>
## Статус

> **Кандидат `0.2.0-alpha.2`: не опубликован, ждёт отдельного решения о публикации.** Это несовместимая замена `0.1`: props,
> helpers, палитры, labels и таблица tokens 0.1 удалены, слоя совместимости нет. Prerelease покрывает один рабочий срез:
> вид месяца с адаптивным layout по ширине самого календаря (desktop-сетка или компактная mobile-сетка), полный список дня
> в немодальном popover, в inline region под mobile-сеткой или в модальном sheet, контролируемые навигацию и загрузку
> видимого диапазона, состояния данных, `onItemPress`, действия items в повестке, контролируемые sources со встроенным
> selector, локализацию, `classicTheme` и `neutralTheme` с tokens, цвета items, типизированные slots содержимого и
> class callbacks. До `0.2.0` API ещё может
> измениться; перед интеграцией прочитайте [Известные ограничения](#limitations).

Содержание: [Установка](#install) · [Быстрый старт](#quick-start) · [Стили и граница Next.js](#styles) ·
[Модель данных](#data-model) · [Навигация и видимый диапазон](#navigation) · [Повестка дня](#day-agenda) ·
[Адаптивный layout](#responsive) · [Размеры](#sizing) · [Состояния данных](#data-states) · [Today и SSR](#today-ssr) · [Локализация](#localization) ·
[Оформление](#theming) · [Валидация и диагностика](#validation) · [Клавиатура](#keyboard) · [Доступность](#accessibility) ·
[Экспорты](#exports) · [Известные ограничения](#limitations) · [Переход с 0.1](#migration) · [Релизы и provenance](#releases) ·
[Лицензия и приватность](#license)

<a id="install"></a>
## Установка

Нужны React и ReactDOM `^18.2.0 || ^19.0.0` (согласованная пара) и Node.js 22 или новее для SSR и сборки. Библиотеки дат и
доступности — обычные dependencies: ничего дополнительно ставить не нужно, Day.js не используется.

После публикации:

```sh
npm install @nelmad/calendar@0.2.0-alpha.2
```

В registry этой версии пока нет. До публикации соберите и упакуйте этот репозиторий и установите архив:

```sh
# In a checkout of this repository
npm ci
npm run build
npm pack
# In your application
npm install /path/to/nelmad-calendar-0.2.0-alpha.2.tgz
```

Примеры на [Vite](examples/vite/README.ru.md) и [Next.js](examples/next/README.ru.md) — запускаемые приложения, собранные
именно так. Их маршрут `/workspace` показывает интеграции alpha.2 вместе: адаптивные layouts, mobile-повестку, действия
items, фильтр sources, который ваш backend принимает позже, `neutralTheme` с tokens, slots и class callbacks, а также
календарь внутри ShadowRoot с его portals.

<a id="quick-start"></a>
## Быстрый старт

<!-- file: examples/vite/src/Schedule.tsx -->
```tsx
'use client';
import {useState} from 'react';
import {Calendar, type CalendarItem} from '@nelmad/calendar';
import '@nelmad/calendar/styles.css';

const items: CalendarItem<{room: string}>[] = [
    {id: 'standup', title: 'Стендап', data: {room: '301'},
        interval: {kind: 'timed', start: '2026-09-03T10:00:00+03:00', end: '2026-09-03T10:15:00+03:00'}},
    // All-day `end` is exclusive: this item covers 10 and 11 September.
    {id: 'offsite', title: 'Выездная сессия', data: {room: 'Парк'},
        interval: {kind: 'allDay', start: '2026-09-10', end: '2026-09-12'}},
];

export function Schedule() {
    const [anchorDate, setAnchorDate] = useState('2026-09-01');
    const [opened, setOpened] = useState('');
    return <>
        <Calendar items={items} timeZone="Europe/Moscow" locale="ru-RU"
            anchorDate={anchorDate} onNavigate={setAnchorDate}
            onItemPress={({item}) => setOpened(`${item.title}: ${item.data.room}`)}/>
        <p id="opened" aria-live="polite">{opened}</p>
    </>;
}
```

Это маршрут `/quick-start` обоих примеров, байт в байт. Обязательны `items`, `timeZone`, `anchorDate` и `onNavigate`.
`layout` остаётся по умолчанию `"auto"`: календарь следует за собственной шириной — сетка из семи колонок на широкой
странице и компактный месяц с повесткой под ним на телефоне (см. [Адаптивный layout](#responsive)); `layout="desktop"`
или `"mobile"` фиксирует его. Записи и показанный месяц принадлежат приложению: `onNavigate` только запрашивает месяц, а календарь показывает
его, когда приходит новый `anchorDate`. Нажатие на событие передаёт его вместе с типизированным `data`; щелчок по дате
открывает полный список этого дня.

Дальше: полная интеграция в [`ReleaseCalendar.tsx`](examples/vite/src/ReleaseCalendar.tsx) (серверная предзагрузка,
загрузка, повтор, контролируемая повестка) и stories Storybook в [`stories/`](stories) (`npm run build && npm run storybook`).

<a id="styles"></a>
## Стили и граница Next.js

Подключите единственную публичную таблицу стилей `@nelmad/calendar/styles.css`. Собственный код календаря не внедряет
CSS из JavaScript, не загружает шрифты и наследует шрифт приложения. Стили ограничены корнем календаря (`.nc-theme`) и не меняют глобальные
элементы. Сброс `box-sizing` имеет специфичность класса, поэтому сбросы элементов вашей страницы вроде
`button { all: unset }` или `* { box-sizing: content-box }` не меняют layout календаря, а ширины overlays следуют размеру
шрифта календаря (`em`), а не корневому размеру шрифта. Заголовок месяца, заголовки повестки и строка пустой повестки тоже
задают свои цвет, насыщенность и отступы со специфичностью класса, поэтому правила элементов страницы вроде
`h2 { color: …; font-weight: 500 }` (шаблон Vite React) или сброс preflight (`h1, h2, h3 { font-weight: inherit }`,
`* { margin: 0 }`) их не меняют, в том числе при принудительном `colorScheme`, отличном от схемы страницы. Правило с
классом, например `.prose h2`, — ваше собственное оформление и по-прежнему применяется.

Таблица стилей, подключённая к документу, не проникает внутрь `ShadowRoot`. Добавьте ту же таблицу в каждую CSS tree scope,
где есть корень календаря или один из его portals. По умолчанию popover и sheet повестки выводятся в `body` документа;
внутри модального окна — в открытый модальный контейнер вокруг календаря (`<dialog>`, показанный через `showModal()`, или
элемент с `aria-modal="true"`), чтобы они там работали. Обычная боковая панель с `role="dialog"` без `aria-modal="true"`
модальным контейнером не является: повестка выводится в `body`. Другой узел выбирается через
[`portalContainer`](docs/api.ru.md#prop-portalcontainer).

**Библиотеки модальных окон и popovers.** Некоторые библиотеки выводят свой диалог с `role="dialog"`, но без `aria-modal`
(например Radix Dialog и `Modal` и `Popover` из React Aria Components), и удерживают focus или закрываются при уходе
focus наружу. С target по умолчанию повестка тогда открывается в `body` и сразу закрывается, либо popover хоста
закрывается сам и размонтирует календарь. Передайте элемент содержимого диалога как `portalContainer`:

```tsx
const [panel, setPanel] = useState<HTMLElement | null>(null);
<Dialog ref={setPanel}>{panel && <Calendar {...props} portalContainer={panel}/>}</Dialog>
```

Сборка development один раз предупреждает, если календарь находится внутри такого элемента, а target по умолчанию —
`body`: `[@nelmad/calendar] portalContainer: The calendar is inside a role="dialog" element without aria-modal="true", …`.
Чтобы сохранить target по умолчанию для боковой панели без удержания focus, передайте `portalContainer={document.body}`;
о явном container предупреждения нет.

Поэтому календарю внутри `ShadowRoot` таблица нужна и в этом shadow root, и в документе. Например, с Vite:

```ts
// Vite: `?inline` returns the stylesheet text instead of adding it to the document.
import calendarCss from '@nelmad/calendar/styles.css?inline';

const sheet = new CSSStyleSheet();
sheet.replaceSync(calendarCss);
shadowRoot.adoptedStyleSheets = [...shadowRoot.adoptedStyleSheets, sheet];
```

**Content Security Policy.** Одна зависимость добавляет элемент стилей: React Aria вставляет
`<style id="react-aria-pressable-style">` в `<head>` документа, когда монтируется первая кнопка, с одним правилом в
анонимном `@layer` (`touch-action: pan-x pan-y pinch-zoom` для нажимаемых элементов). При `style-src` без
`'unsafe-inline'` браузер блокирует его и сообщает о нарушении; календарь работает и без этого правила. Чтобы разрешить
его, дайте ему nonce: React Aria читает его из `<meta property="csp-nonce" nonce="…">` в документе (или из
`__webpack_nonce__` webpack). В HTML, отрендеренном на сервере, есть и inline-атрибуты `style` (у сетки он есть всегда, у
корня — при `tokens` или `style`, у строк inline-повестки — при цветах items). Политика без `'unsafe-inline'` и без
`style-src-attr` их блокирует; при гидрации календарь заново записывает через CSSOM, который CSP не ограничивает, свои
собственные проверенные декларации: `tokens` корня (кроме переменной, которую заменяет `style`), число строк сетки и
цвета items в строках повестки, и гидрированный месяц сохраняет строки, tokens и цвета. Он записывает их по одному
свойству, как клиентский рендер, и никогда — текстом заблокированного атрибута. `style`, переданный корню, заново не
записывается: как любой inline-стиль вашей страницы, он подчиняется вашей политике, поэтому при строгой политике
вынесите такие стили в свою таблицу стилей через `className`. Это не обход CSP, таблица стилей не внедряется
(спецификация draft v8, §10.3.4). До гидрации (и без JavaScript) серверный HTML отображается без этих деклараций, а
браузер сообщает о нарушении для каждого заблокированного атрибута. Чтобы избежать и того и другого, разрешите атрибуты через
`style-src-attr 'unsafe-inline'`, например `style-src 'self' 'nonce-…'; style-src-attr 'unsafe-inline'`. Стили, которые
календарь задаёт из JavaScript, это не затрагивает.

**TypeScript.** `import '@nelmad/calendar/styles.css'` — импорт таблицы стилей ради побочного эффекта. Vite и Next.js
объявляют CSS-модули сами. Проекту на «голом» `tsc` с `noUncheckedSideEffectImports` (в TypeScript 6 включён по
умолчанию) нужна собственная декларация, например `css.d.ts` с `declare module '*.css';`.

**Next.js App Router.** Импорт `@nelmad/calendar` безопасен на сервере. `getCalendarVisibleRange` — чистая функция и
работает в Server Components. `Calendar` сам объявляет границу `'use client'`, но его callback props — функции, поэтому
рендерите его из собственного клиентского компонента и передавайте ему простые сериализуемые данные:

<!-- file: examples/next/app/page.tsx -->
```tsx
import {getCalendarVisibleRange} from '@nelmad/calendar';
import {ReleaseCalendar} from '../components/ReleaseCalendar';
import {loadRange, release} from '../components/releaseData';

// A Server Component: the pure helper gives the exact first grid range, so the records
// are loaded before the client bundle runs and arrive in the first HTML.
export default async function Page() {
    const range = getCalendarVisibleRange({anchorDate: release.anchorDate, timeZone: release.timeZone, locale: release.locale});
    return <ReleaseCalendar prefetch={{range, items: await loadRange(range)}}/>;
}
```

Таблицу стилей можно импортировать в этом клиентском компоненте или один раз в `app/layout.tsx`. `classicTheme` тоже
импортируйте в клиентском компоненте: календарь узнаёт preset темы по идентичности, а preset, переданный prop из Server
Component, приходит сериализованной копией и показывает оболочку «неверные настройки».

<a id="data-model"></a>
## Модель данных

```ts
const items: CalendarItem<{ticket: number}>[] = [
    // All-day: dates only, `end` is exclusive. This item covers 3 and 4 September.
    {id: 'review', title: 'Release review', data: {ticket: 42}, interval: {kind: 'allDay', start: '2026-09-03', end: '2026-09-05'}},
    // Timed: RFC 3339 instants with an explicit offset or Z.
    {id: 'call', title: 'Call', data: {ticket: 43}, interval: {kind: 'timed', start: '2026-09-03T10:00:00+03:00', end: '2026-09-03T10:30:00+03:00'}},
    // A moment: no end. It is shown only on the date of its start.
    {id: 'deploy', title: 'Deploy', data: {ticket: 44}, interval: {kind: 'timed', start: '2026-09-04T07:00:00Z'}},
    // The author zone travels with the item; display always uses the Calendar timeZone.
    {id: 'sync', title: 'Berlin sync', data: {ticket: 45},
        interval: {kind: 'timed', start: '2026-09-07T09:00:00+02:00', end: '2026-09-07T09:15:00+02:00', timeZone: 'Europe/Berlin'}},
];
```

- **`CalendarItem<TItemData>`** содержит `id`, `title`, `interval` и `data`. `id` непуст и уникален в `items`. Доменные
  поля (статус, исполнитель, ID задачи) хранятся в обобщённом `data`; календарь не читает и не копирует его и возвращает
  тот же объект item в callbacks. Пустой `title` показывается как локализованное «Без названия».
- **All-day** интервалы — даты (`YYYY-MM-DD`, годы `0001`–`9999`), а не instants: смена `timeZone` их не сдвигает. `end`
  **исключается** и должен быть позже `start`: однодневный item — `{start: '2026-09-03', end: '2026-09-04'}`.
- **Timed** интервалы используют строгий RFC 3339: `YYYY-MM-DDTHH:mm:ss`, необязательные 1–3 цифры долей секунды и
  обязательный `Z` или `±HH:MM`. Timestamps без смещения отклоняются и никогда не читаются в зоне хоста. Timed item
  попадает в день, если хотя бы один instant из `[start, end)` приходится на эту дату в `timeZone` календаря; окончание
  ровно в полночь не добавляет следующий день.
- **Моменты.** Без `end` или с `end`, равным `start`, timed item — момент в дату своего начала.
- **Зона автора.** Необязательный `interval.timeZone` фиксирует зону, в которой создан item. В alpha.2 он проверяется и
  сохраняется; отображение и принадлежность дню определяются `timeZone` календаря.
- **`timeZone`** — явный IANA identifier из списка, принятого пакетом: 445 primary identifiers tzdb 2026c, включая `UTC`,
  совпадение точное и с учётом регистра. Aliases вроде `Etc/UTC`, `GMT`, `US/Eastern`, неверный регистр и фиксированные
  смещения вроде `+03:00` отклоняются. Список приведён в [справочнике API](docs/api.ru.md#time-zones).
- **Зона браузера принимается не всегда.** `Intl.DateTimeFormat().resolvedOptions().timeZone` для 19 зон возвращает
  устаревшие имена, например `Asia/Calcutta`, `Europe/Kiev`, `Asia/Saigon`, `Asia/Katmandu` и `America/Godthab`
  (Chrome 154, Node.js 24). С таким именем календарь показывает оболочку «неверные настройки». Сопоставьте эти имена с
  принятыми, прежде чем передавать определённую зону; полная таблица — в [справочнике API](docs/api.ru.md#browser-zones).
- Значения не исправляются: календарь не дописывает зоны, не превращает включённый конец в исключённый и не округляет
  доли секунды. Невалидная или повторяющаяся запись исключается (см. [Валидацию](#validation)).

Повторения не интерпретируются: передавайте уже развёрнутые экземпляры отдельными items.

<a id="navigation"></a>
## Контролируемая навигация и видимый диапазон

`anchorDate` выбирает показываемый месяц; номер дня в нём не учитывается. `onNavigate(anchorDate)` запрашивает первый день
другого месяца из toolbar, с клавиатуры или кнопкой «Сегодня». Ничего не меняется, пока вы не передадите новый
`anchorDate`: внутреннего оптимистичного месяца нет, а задержанный или проигнорированный запрос оставляет на месте текущий
месяц и focus.

Сетка начинается с `firstDayOfWeek` не позже первого дня месяца и заканчивается после последней полной недели: от 4 до 6
недель вместе с днями соседних месяцев. `getCalendarVisibleRange({anchorDate, timeZone, locale, firstDayOfWeek})`
возвращает ровно тот диапазон, который отрисует календарь, в виде `{start, end, timeZone}` с исключённым `end`. Функция
чистая (не читает часы, DOM и locale хоста) и бросает `RangeError` на невалидном входе, поэтому сервер может заранее
загрузить первый диапазон:

```ts
getCalendarVisibleRange({anchorDate: '2026-09-15', timeZone: 'Europe/Moscow'});
// {start: '2026-08-31', end: '2026-10-05', timeZone: 'Europe/Moscow'}: ru-RU weeks start on Monday
getCalendarVisibleRange({anchorDate: '2026-09-15', timeZone: 'Europe/Moscow', locale: 'en-US'});
// {start: '2026-08-30', end: '2026-10-04', timeZone: 'Europe/Moscow'}: en-US weeks start on Sunday
```

`onVisibleRangeChange(range)` — уведомление после commit: один раз после первого клиентского рендера и затем при каждом
изменении принятой тройки `(start, end, timeZone)`, включая смену `firstDayOfWeek` или `locale`, сдвинувшую сетку. Оно
никогда не вызывается во время SSR или render, не повторяется для неизменного диапазона, новой identity callback или
повторного effect в StrictMode, а `A → B → A` даёт все три вызова. Первый вызов повторяет предзагруженный диапазон —
отвечайте на него из кэша. Записи вне сетки допустимы в `items` и просто не рисуются.

```tsx
const [anchorDate, setAnchorDate] = useState<ISODate>('2026-09-01');
const [items, setItems] = useState<CalendarItem<Ticket>[]>([]);
const [dataState, setDataState] = useState<CalendarDataState>({status: 'loading', phase: 'initial'});
const [range, setRange] = useState<CalendarVisibleRange>();

function load(next: CalendarVisibleRange) {
    setRange(next);
    setDataState({status: 'loading', phase: items.length ? 'refresh' : 'initial'});
    fetchTickets(next).then(result => { setItems(result); setDataState({status: 'ready'}); },
        error => setDataState({status: 'error', phase: items.length ? 'refresh' : 'initial', error}));
}

<Calendar items={items} timeZone="Europe/Moscow" layout="desktop"
    anchorDate={anchorDate} onNavigate={setAnchorDate} onVisibleRangeChange={load}
    dataState={dataState} onRetryRequest={() => range && load(range)}/>;
```

Настоящее приложение также отменяет устаревшие запросы и кэширует диапазоны, как
[`ReleaseCalendar.tsx`](examples/vite/src/ReleaseCalendar.tsx).

**Focus.** Внутри отрисованной сетки стрелки сразу переносят focus, в том числе на дни соседних месяцев. Выход за сетку с
клавиатуры, `PageUp`/`PageDown` и «Сегодня» запрашивают целевой месяц; focus переходит на целевую дату, только если к
приходу месяца он всё ещё в сетке (или на той же кнопке «Сегодня», которая сделала запрос) и в промежутке не было других
действий. Календарь никогда не забирает focus у другого control. После принятого «Предыдущий/Следующий месяц» из toolbar
месяц объявляется один раз. Внешняя смена `anchorDate` сохраняет номер дня (с ограничением длиной месяца). Месяцы раньше
февраля 0001 и позже ноября 9999 недоступны: кнопки выключены и объясняют причину.

<a id="day-agenda"></a>
## Повестка дня

Активация даты (щелчок, `Enter` или щелчок по области `+N` в ячейке) открывает повестку дня с заголовком, числом событий и
полным списком этого дня. Многодневный item в ней один раз. На desktop это немодальный popover у ячейки: `Escape`, кнопка
закрытия и нажатие снаружи закрывают его; `Tab` за последним control закрывает его и продолжает со следующего элемента
после ячейки даты. Focus возвращается в ячейку даты, если он оставался внутри popover. На mobile та же повестка показана под
сеткой или в sheet; см. [Адаптивный layout](#responsive).

**Без контроля.** Без `agendaDate` календарь сам хранит дату просмотра: today, если он известен и входит в показанный месяц,
иначе первый день месяца. Она сохраняется при обновлении items и навигации внутри месяца; после смены месяца снова
применяется fallback, если дата не принадлежит новому месяцу.

**Под контролем.** Передавайте `agendaDate` и `onAgendaDateChange` вместе (типы и runtime отклоняют одно без другого).
Активация другой даты один раз вызывает `onAgendaDateChange(date)`; повестка открывается для этой даты, только когда ваш
`agendaDate` станет равен ей, а focus всё ещё на ячейке, сделавшей запрос. Она открывается в presentation, актуальной в
этот момент, даже если layout за это время сменился. Активация уже принятой даты открывает её сразу
без callback. Контролируемая дата может лежать вне показанного месяца, и её смена никогда не вызывает навигацию: загрузка
этого месяца — задача приложения.

**`onItemPress`.** В сетке нажатие указателем на chip или bar передаёт `{item, date, view: 'month', segmentRange}`, где
`date` — ячейка под указателем, а `segmentRange` — обрезанная часть item, нарисованная в этой неделе. В повестке каждый item —
кнопка, передающая `{item, date, view: 'agenda'}` с датой повестки. Без `onItemPress` нажатие на chip открывает повестку даты
под ним, а строки повестки — обычные элементы списка. С клавиатуры и screen reader каждый item доступен через повестку.

**Действия items.** С `getItemActions` и `onItemActionRequest` каждая строка повестки с действиями получает рядом отдельную
кнопку `…` с именем item. Она открывает те же действия как menu на desktop и как модальный action sheet на mobile;
`onItemActionRequest({item, actionId})` один раз сообщает выбранное. Сама сетка кнопок действий не показывает.
Редактирование и удаление остаются операциями приложения ([справочник API](docs/api.ru.md#prop-getitemactions)).

**Sources.** `sources` перечисляет календари, на которые items ссылаются через `calendarId`. С контролируемой парой
`visibleSourceIds` и `onVisibleSourceIdsChange` кнопка toolbar (от двух валидных sources; скрыть — `showSourceSelector={false}`)
переключает их через menu на desktop или sheet на mobile. Календарь показывает только то, что приняли ваши props:
переключение вызывает callback и ничего не меняет до прихода нового массива. Items без `calendarId` или с неизвестным
всегда остаются видимыми ([справочник API](docs/api.ru.md#prop-sources)). Как бы selector ни закрылся (`Escape`, его
кнопка закрытия или trigger, нажатие снаружи, смена layout, новая цель portal), focus, который был в нём, возвращается
на его кнопку в toolbar; focus, уже перешедший в другое место, остаётся там (спецификация draft v8, §12.3).

<a id="responsive"></a>
## Адаптивный layout

По умолчанию `layout` равен `"auto"`: календарь измеряет ширину content-box собственного корня, а не окна браузера, поэтому
календарь в узкой боковой панели остаётся mobile и на широком экране. Ширина меньше `mobileBreakpoint` (по умолчанию `640`
CSS px) — mobile, сама граница и больше — desktop. Content-box находится внутри собственного padding корня (`spacing.md`,
по умолчанию 16 px с каждой стороны), поэтому с настройками по умолчанию сам корень переключается при 672 px.
`layout="desktop"` или `"mobile"` фиксирует layout и ничего не измеряет. Desktop-сетка сохраняет колонки не уже 64 px: в
контейнере уже 448 px она прокручивается по горизонтали внутри своего региона, а не страница. Принудительный desktop
доходит до этого в любом узком контейнере, `"auto"` — только с `mobileBreakpoint` меньше 448, потому что по умолчанию
раньше включается mobile. Там, где ожидаются телефоны, лучше `"auto"`.

```tsx
<Calendar {...props} mobileBreakpoint={720} agendaPresentation="overlay"/>
```

- **Desktop:** сетка из семи столбцов с chips, bars и `+N`; повестка — popover.
- **Mobile:** компактная сетка с датами и точкой у дней, где есть items. Tap или `Enter` на дате меняет просматриваемую
  дату; `+N` нет. При `agendaPresentation="auto"` (по умолчанию) повестка просматриваемой даты — region под сеткой: tap
  оставляет focus на дате и объявляет обновление, `Enter` переносит focus на заголовок повестки, `Escape` возвращает к
  дате. При `agendaPresentation="overlay"` повестка открывается модальным sheet: остальная страница inert и не
  прокручивается, focus начинается с заголовка, а `Escape`, кнопка закрытия или нажатие на фон возвращают к дате.
  Собственный диалог, открытый из `onItemPress` поверх sheet, остаётся рабочим; см.
  [`onItemPress`](docs/api.ru.md#prop-onitempress).

Сервер и первый client render для `"auto"` всегда показывают компактный mobile-месяц, поэтому hydration совпадает при любой
ширине: при `agendaPresentation="auto"` в нём есть inline-повестка, при `"overlay"` повестки нет до activation даты.
Измеренный layout применяется сразу после hydration, до отрисовки браузером. Если layout меняется, пока повестка показана, просматриваемая
дата сохраняется. Focus внутри повестки переходит на тот же item или control новой presentation; focus в любом другом месте
не забирается, и один resize никогда не открывает popover или sheet. Ширина, которая зависит от самого layout (например,
полоса прокрутки страницы, нужная только более высокому desktop-месяцу), переключает layout один раз на пересечение и затем
удерживает его, пока ширина остаётся в пределах ширины этой полосы прокрутки; правило описано в
[справочнике API](docs/api.ru.md#prop-layout). Чтобы такой полосы не было, зарезервируйте место полосы прокрутки у
прокручиваемого предка, например `html { scrollbar-gutter: stable; }`.

<a id="sizing"></a>
## Размеры

Родитель с фиксированной высотой не нужен. Корень имеет `inline-size: 100%` и intrinsic `block-size: auto`, у каждой недели
есть предпочтительная высота из `density` и token `dayMinHeight`, поэтому естественная высота определяется числом недель.
Строки не растут от числа items: непоместившиеся считаются в индикаторе `+N` и остаются в повестке.

Определённая высота самого корня (`style`, `className` или ваш CSS) делится поровну между неделями; календарь измеряет
каждую строку и показывает только целые lanes, никогда — обрезанный chip. Высота одного только родителя ограничением не
считается. Если высоты не хватает даже на одну строку `+N`, сетка прокручивается внутри своей области, а toolbar остаётся
видимым. До первого измерения (и на сервере) каждый непустой день показывает `+N` при нуле lanes.
Число `+N`, слишком широкое для узкого столбца, заканчивается многоточием, а короткие названия дней недели, которые не
помещаются в столбец (длинные названия при 320 px, крупный текст), переводят строку заголовков в узкий формат; полные
названия остаются accessible names.

```tsx
<Calendar {...props} style={{blockSize: 480}}/>
```

<a id="data-states"></a>
## Состояния данных

`dataState` (по умолчанию `{status: 'ready'}`) сообщает календарю, что происходит с вашими данными; сам он ничего не
загружает.

| `dataState` | Что показано |
| --- | --- |
| `{status: 'ready'}` | Сетка. Если ни один валидный item не пересекает видимый диапазон, рядом с сеткой появляется именованная область «В этом месяце событий нет»; навигация доступна. |
| `{status: 'loading', phase: 'initial'}` | Skeleton вместо сетки и повестки, независимо от содержимого `items`, с сохранением их высоты. Навигация выключена. |
| `{status: 'loading', phase: 'refresh'}` | Текущие items остаются на месте; сетка и inline-повестка (не корень с его live regions и не повестка, открытая в popover или sheet) получают `aria-busy="true"`, а по верхней границе сетки идёт тонкая полоса прогресса. Она не занимает места и не закрывает ни дат, ни названий дней недели, ни кнопок. |
| `{status: 'error', phase: 'initial', error}` | Блокирующая область ошибки вместо сетки и повестки, с сохранением их высоты. Навигация выключена. |
| `{status: 'error', phase: 'refresh', error}` | Текущие items остаются на месте; между toolbar и сеткой появляется неблокирующий баннер ошибки (с «Повторить»), и пока он показан, сетка ниже на его высоту. |

При наличии `onRetryRequest` область ошибки показывает кнопку «Повторить», которая вызывает его один раз на нажатие;
состояние меняется только с новым `dataState`. Блокирующее состояние закрывает повестку и selector sources (его trigger
отключается, как навигация) и отменяет отложенные переносы focus; если focus был внутри удалённого вида или selector, он
переходит в область состояния. Загрузка, завершение обновления и ошибки
объявляются через собственные live regions календаря. Месяц, открытый кнопками «Предыдущий»/«Следующий», объявляется один
раз, когда вы его принимаете. Начало обновления не объявляется (его показывают полоса прогресса и `aria-busy`), поэтому
обновление, которое вы начинаете для нового месяца, не заменяет это объявление; завершение обновления объявляется один раз
(«Календарь обновлён»). Состояние данных никогда не сдвигает кнопки toolbar: второе нажатие «Следующий месяц», пока
загружается новый месяц, попадает в ту же кнопку. Открытая popover-повестка при появлении баннера ошибки сдвигается вместе со
своей датой.

<a id="today-ssr"></a>
## Today и SSR

`today` — необязательный снимок текущей даты (`ISODate`) в `timeZone` календаря. С ним сервер и клиент одинаково рендерят
подсветку today, кнопку «Сегодня» и дату повестки по умолчанию, а календарь не читает часы; обновляете его вы, например в
полночь.

Без `today` сервер и первый клиентский рендер сходятся на «today неизвестен»: подсветки нет, кнопка «Сегодня» выключена.
После hydration календарь вычисляет дату в `timeZone`, включает кнопку и обновляет дату после полуночи (и при возвращении
на вкладку). Это одно дополнительное обновление после hydration.

Для одинакового HTML на обеих сторонах передавайте также одинаковые `items`, `anchorDate`, `locale`, `firstDayOfWeek`,
`dir` и `timeZone`. Принудительный `layout` фиксируется уже на сервере; значение по умолчанию `"auto"` даёт компактный
mobile-месяц на сервере и в первом client render, с inline-повесткой только при `agendaPresentation="auto"` (см.
[Адаптивный layout](#responsive)). Данные Intl и часовых поясов на сервере и в браузере
должны совпадать для используемых locales; см. [Известные ограничения](#limitations).

<a id="localization"></a>
## Локализация

```tsx
<Calendar {...props} locale="en-GB" messagesLocale="en-US" firstDayOfWeek="sunday" hourCycle={12} dir="ltr"
    messages={{todayLabel: 'Now', agendaHeading: date => `Agenda for ${date}`}}/>
```

- **`locale`** (по умолчанию `ru-RU`) — BCP 47 tag для дат, первого дня недели, формата часов и направления текста. Даты
  всегда используют григорианский календарь через `Intl` с явными options; расширения `u-ca-*` его не меняют.
  Корректный tag, который `Intl` не поддерживает, разрешается в `en-US` с одним предупреждением в development, но никогда
  не в locale хоста. Синтаксически неверный tag, например `en_US`, — contract error.
- **`messagesLocale`** (по умолчанию — разрешённый `locale`) выбирает встроенный каталог: `ru-*` — русский, любой другой
  валидный tag — английский. **`messages`** переопределяет любую часть каталога и считается написанным на языке
  `messagesLocale`. Пустое переопределение заменяется каталогом с предупреждением в development. Сообщения-функции получают
  простые значения (даты как `ISODate`) и возвращают строку.
- **`firstDayOfWeek`**, **`hourCycle`** (`12` или `24`) и **`dir`** переопределяют значения из locale; без данных locale
  используются понедельник, 24 часа и `ltr`. В 24-часовом режиме полночь — `00:00`.
- Locales с письмом справа налево зеркалят сетку, стрелки и значки; «Предыдущий» и «Следующий» сохраняют хронологический
  смысл. Названия items изолируются от направления окружающего текста.

Каждое сообщение и фрагмент даты получают `lang` своего фактического языка.

<a id="theming"></a>
## Оформление

```tsx
<Calendar {...props} theme={classicTheme} density="comfortable" colorScheme="dark"
    tokens={{color: {accent: '#0b57d0'}, density: {dayMinHeight: '120px'}}}
    style={{'--nelmad-calendar-color-focus': '#e8710a'}}/>
```

- **`theme`**: `classicTheme` (по умолчанию) или `neutralTheme` — сдержанный серо-синий preset. Оба работают с любой
  плотностью и любым `colorScheme`; тема меняет оформление, но не роли, focus и клавиатуру.
- **`density`**: `compact` (по умолчанию) или `comfortable`.
- **`colorScheme`**: `system` (по умолчанию, следует `prefers-color-scheme` через CSS, поэтому HTML сервера и клиента
  совпадает), `light` или `dark`. Режим forced colors всегда важнее цветов темы; reduced motion отключает необязательные
  переходы.
- **`tokens`** задаёт любой из 27 семантических tokens; каждый соответствует одной публичной CSS-переменной, например
  `--nelmad-calendar-color-accent`. Полная таблица — в [справочнике API](docs/api.ru.md#tokens).

Для каждой переменной приоритет такой: значения темы и density → ваш CSS на корне календаря (например через `className`) →
`tokens` → та же переменная в `style`. Объявляйте переменные на корневом элементе, а не на предке: значения по умолчанию
заданы на самом корне. Значения передаются в CSS как есть; невалидное CSS-значение — ошибка оформления приложения, а не
ошибка календаря. Значение `tokens` должно быть одним значением CSS-декларации без `url(`: значение с `;` или `!` на
верхнем уровне, с незакрытой строкой, комментарием или скобкой или с любым `url(` (в том числе корректным и записанным
через экранирование, например `u\72l(`) игнорируется с предупреждением в development, поэтому тема из настроек
пользователя или арендатора не может добавить корню другие декларации или содержать `url(`. Это правило безопасности
одинаково решается на сервере и на клиенте и не является проверкой CSS. Другие функции, принимающие ресурс строкой,
например `image-set("…" 1x)` или `src("…")`, оно не отклоняет: собственные стили пакета используют переменные tokens
только в свойствах цвета, тени и шрифта и никогда их не загружают, но ваш CSS или содержимое slots, использующие
переменную token в свойстве изображения (например `background: var(--nelmad-calendar-components-item-background)`),
загрузили бы ресурс. Если вы используете переменные так, проверяйте значения арендаторов сами. Chips, bars и строки повестки используют
tokens items; кнопки берут цвета из `color.surface` и `color.text`. `className` и `style` применяются к корневому элементу, `id` задаёт его `id`.

Для отдельных items `CalendarSource.color` окрашивает только accent marker известного source, а `getItemAppearance`
независимо заменяет accent, фон и текст одного item; все сегменты и строка повестки item имеют одни цвета. Для этих
цветов действует то же правило одного значения декларации, что для `tokens`: значение с `;` или `!` на верхнем уровне,
несбалансированными кавычками, скобками или комментариями либо с любым `url(` (в том числе записанным
escape-последовательностями) игнорируется с предупреждением в development, одинаково на сервере и клиенте, и остаётся нижний
слой (accent source, затем token темы; спецификация draft v8, §10.3.3). С `renderAgendaItem` доступное имя строки
повестки — сводка по умолчанию, за которой следует ваше видимое содержимое (§12.1). `classNames`
добавляет классы поверхностям пакета по их типизированному состоянию, а slots содержимого `renderItem`, `renderAgendaItem`,
`renderDayHeader`, `renderToolbarContent`, `renderLoading`, `renderEmpty` и `renderError` заменяют или дополняют видимое
содержимое, сохраняя роли, имена и focus календаря. Slots items и дней принимают только пассивное содержимое (без ссылок,
кнопок и полей ввода: используйте `onItemPress` и `getItemActions`); development-сборка предупреждает о найденном
интерактивном содержимом. Стабильные атрибуты `data-*` перечислены в [справочнике API](docs/api.ru.md#data-attributes).

```css
.release-calendar {
    --nelmad-calendar-color-surface: #fbfaf8;
    --nelmad-calendar-radii-md: 8px;
}
```

<a id="validation"></a>
## Валидация и диагностика

Типы TypeScript не доказывают корректность строк, поэтому календарь проверяет вход до любых вычислений с датами.

- **Contract errors.** Невалидный prop конфигурации показывает безопасную оболочку ошибки вместо сетки: невалидные
  `anchorDate`, `timeZone`, `today` или `agendaDate`, неизвестное значение enum, синтаксически неверный
  `locale`/`messagesLocale`, невалидный `dataState`, отсутствующий callback, половина пары `agendaDate`, `theme`, не
  являющийся preset пакета, неизвестный `layout` или `agendaPresentation`, `mobileBreakpoint`, не являющийся положительным
  конечным числом. Оболочка сохраняет именованную область календаря и
  показывает «Не удалось показать календарь: неверные настройки»; toolbar, сетка, повестка и повтор не рендерятся, и ни один
  callback не вызывается, пока props не исправлены.
- **Исключённые записи.** Item с невалидным интервалом, невалидным `id`, повторяющимся `id` (все копии) или неизвестным
  `interval.timeZone` не попадает в сетку, счётчики и повестку; остальные items отображаются как обычно.
- **Восстановимые значения.** Пустое название item, пустое переопределение сообщения, пустое значение token или
  значение, не являющееся одним значением CSS-декларации, и нечисловой результат comparator используют документированный
  fallback.
- **Предупреждения в development.** Каждая проблема сообщается один раз на экземпляр календаря как
  `[@nelmad/calendar] <path>: <reason>` после клиентского рендера, например
  `[@nelmad/calendar] items[3].interval: Expected YYYY-MM-DD in 0001…9999`. Item, чей `calendarId` не называет ни одного
  source из `sources`, сообщается один раз на неизвестный ID, по первому такому item:
  `[@nelmad/calendar] items[3].calendarId: No source with ID "archive"; items with this calendarId remain visible with fallback appearance`
  (без prop `sources` все такие items покрывает одно предупреждение `items[].calendarId`). Props вне этого prerelease
  удаляются до валидации и сообщаются иначе: один раз на имя prop для всей страницы (не на экземпляр), уже во время
  рендера, в том числе серверного. Prop, который добавит следующий prerelease, даёт
  `[@nelmad/calendar] <prop>: not available in 0.2.0-alpha.2; ignored`; prop 0.1 —
  `[@nelmad/calendar] <prop>: removed in 0.2; see the migration guide (docs/migration-0.1-to-0.2.md); ignored`; любое
  другое имя — `[@nelmad/calendar] <prop>: not a Calendar prop; ignored`. Собственные `key`, `ref` и `children` React
  не сообщаются никогда. Отсутствующий обязательный prop сообщается как `Required`, например
  `[@nelmad/calendar] timeZone: Required; expected an IANA time zone such as Europe/Moscow`.
- **Production**-сборки (`NODE_ENV=production`) принимают и отклоняют те же значения и ничего не выводят.

<a id="keyboard"></a>
## Клавиатура

Сетка месяца — одна остановка Tab с roving focus на ячейках дат; chips, bars и `+N` фокус не получают.

| Клавиша | Действие |
| --- | --- |
| `Tab` / `Shift+Tab` | Переход между toolbar, сеткой и повесткой; внутри повестки — между её controls и выход за последним |
| `ArrowLeft` / `ArrowRight` | Предыдущий / следующий день в визуальном порядке (зеркально в RTL) |
| `ArrowUp` / `ArrowDown` | Тот же день недели на предыдущей / следующей неделе |
| `Home` / `End` | Первый / последний день недели |
| `PageUp` / `PageDown` | Запрос предыдущего / следующего месяца с тем же номером дня (с ограничением) |
| `Shift+PageUp` / `Shift+PageDown` | Запрос того же месяца предыдущего / следующего года |
| `Enter` | Открыть повестку дня сфокусированной даты и перенести в неё focus |
| `Escape` | Закрыть повестку и вернуть focus в её ячейку даты |
| `Enter` / `Space` на кнопке | Активировать кнопки toolbar, кнопку закрытия и items повестки |

Accessible name ячейки — полная дата; описание содержит число событий, today, открытый день и число items, скрытых за `+N`.

<a id="accessibility"></a>
## Доступность

Цель для `0.2.0` — WCAG 2.2 AA для UI, которым владеет пакет. Этот alpha соответствие **не** заявляет.

Реализовано: корень — именованный `region` с собственными polite и urgent live regions; `grid`, названный видимым
заголовком месяца, с инструкцией, `aria-rowcount`/`aria-colindex`, именованными заголовками столбцов, `aria-current="date"`
для today и одной roving остановкой Tab; повестка с заголовком и семантическим списком — именованный немодальный `dialog`,
именованный inline `region` или именованный модальный `dialog`;
выключенная навигация на границах поддерживаемых дат с объяснением; видимый focus, стили forced colors и reduced motion;
локализованные имена на русском и английском.

Уже проверено: unit tests ARIA-структуры, восстановления focus и записи в live regions; проверки в реальном Chrome:
клавиатурная навигация, порядок focus, RTL, popover, sheets, menus и Shadow DOM; упакованный tarball в приложениях на Vite
(React 18) и Next.js (React 19) с SSR, hydration, клавиатурой, эмуляцией touch и повесткой. Acceptance alpha.2 прогнал
axe-core (правила WCAG 2.0–2.2 A/AA) без нарушений в UI пакета для обеих тем, обеих density, светлой и тёмной цветовых схем,
RTL, всех состояний данных, открытых overlays, desktop 1280 px и телефона 390 px. Действует одно проверенное
исключение: экспериментальное правило `label-content-name-mismatch` не засчитывается для ячейки даты, чей единственный
другой видимый текст — декоративный индикатор `+N` (номер дня входит в имя ячейки, число — в её описание); любой другой
узел, о котором сообщает правило, по-прежнему проваливает прогон ([отчёт acceptance](docs/implementation/t19-alpha2-acceptance.md)).

Ещё не проверено: screen readers (NVDA, VoiceOver, TalkBack), физические телефоны и планшеты, браузеры кроме Chrome, ручной
аудит контраста, масштаба, reflow и text spacing; автоматические правила покрывают только часть WCAG. За цвета из `tokens`, ваш CSS, названия items и
переопределения сообщений отвечает приложение.

<a id="exports"></a>
## Экспорты

Значения из корня: `Calendar`, `getCalendarVisibleRange`, `classicTheme`, `neutralTheme`. Одна таблица стилей: `@nelmad/calendar/styles.css`.
Других публичных subpaths нет.

Типы: `CalendarProps`, `CalendarBaseProps`, `CalendarAgendaControlProps`, `CalendarSourceFilterControlProps`,
`CalendarItemActionsProps`, `CalendarSource`, `CalendarItemAction`, `CalendarItemActionRequest`, `CalendarItem`, `CalendarInterval`, `ISODate`,
`RFC3339DateTime`, `IanaTimeZone`, `CalendarDateRange`, `CalendarVisibleRange`, `CalendarVisibleRangeOptions`,
`CalendarWeekday`, `CalendarItemPressRequest`, `CalendarSortContext`, `CalendarDataState`, `CalendarLayout`,
`CalendarAgendaPresentation`, `CalendarDensity`, `CalendarColorScheme`, `CalendarDirection`, `CalendarHourCycle`,
`CalendarTheme`, `CalendarThemeTokens`, `CalendarCSSVariable`, `CalendarMessages`,
`CalendarItemAppearance`, `CalendarItemAppearanceContext`, `CalendarRootState`, `CalendarResolvedLayout`,
`CalendarResolvedAgendaPresentation`, `CalendarDayState`, `CalendarItemView`, `CalendarItemSlotContext`, `CalendarMonthItemSlotContext`,
`CalendarAgendaItemSlotContext`, `CalendarAgendaState`, `CalendarOverflowState`, `CalendarToolbarSlotContext`,
`CalendarLoadingSlotContext`, `CalendarEmptySlotContext`, `CalendarErrorSlotContext`, `CalendarClassName`, `CalendarClassNames`,
`CalendarDataAttribute`.

Пакет поставляет ESM и CJS с собранными declarations для TypeScript `moduleResolution` `bundler` и `NodeNext` (проверено
TypeScript 5.4.5 и 5.9.3). Каждый prop и тип описан в [справочнике API](docs/api.ru.md); [сгенерированный
отчёт](docs/api/calendar.api.md) — точная поверхность declarations: кроме exports в нём только неэкспортируемые
вспомогательные типы, через которые они типизированы (символ бренда темы, принимаемые layouts и имена следующих props,
типизированных как недоступные).

<a id="limitations"></a>
## Известные ограничения

- **Неопубликованный кандидат.** `0.2.0-alpha.2` нет в npm; публикация — отдельное решение. Устанавливайте упакованный архив.
  Prereleases ещё могут менять API.
- **Доступен только текущий срез.** Все props запланированного API `0.2`, не описанные выше, типизированы как недоступные
  (`?: never`) и, если их всё же передать, удаляются во время выполнения с предупреждением в development; молча
  игнорируемым no-op они не бывают.
  - `0.2.0-beta.1`: `selection` с `onSelectionChange` и `onCreateRequest`, перенос items (`itemMoveStates`,
    `onItemMoveRequest`, `onItemMoveDraftChange`) и `interactionPolicy`.
- **Неизвестные sources.** Item, чей `calendarId` не совпал ни с одним source, остаётся видимым с базовым accent и даёт
  одно предупреждение в development.
- **Проверка пользовательского содержимого best-effort.** Диагностика development видит только DOM внутри обёрток пакета
  после commit; содержимое в portals, shadow trees или добавленное позже не проверяется, а вашему содержимому нужны
  собственные проверки доступности.
- **Объём mobile.** Перетаскивание long press пока недоступно; физические телефоны и планшеты не проверялись. На очень низком viewport с шириной desktop, например у
  телефона в landscape, popover высотой с доступное место рядом с датой (он прокручивается); `layout` зависит только от
  ширины.
- **Строгий CSP и SSR.** Без `style-src-attr 'unsafe-inline'` inline-стили из серверного HTML применяются только после
  гидрации (о каждом заблокированном атрибуте браузер сообщает как о нарушении), переданный корню `style` остаётся
  заблокированным, а единственному `<style>` React Aria нужен nonce; см. [Стили](#styles).
- **Данные locale для SSR.** Календарь использует данные `Intl` самой среды выполнения, а full ICU в Node охватывает
  намного больше языков, чем Chrome. Locale, которой нет в браузере, разрешается там в `en-US` (с предупреждением
  development только в браузере), а сервер выводит текст на языке locale: hydration не проходит, и React перерисовывает
  дерево на клиенте. Если различаются данные недели, различаются и первый день недели, и видимый диапазон (для `ps-AF`
  сетка сервера начинается с субботы, сетка `en-US` браузера — с воскресенья), поэтому серверная предзагрузка через
  `getCalendarVisibleRange` не совпадает с первым `onVisibleRangeChange`. Сравнение Node 24.20 (ICU 78.3) и Chrome 155 нашло
  96 таких языков, среди них `be`, `cy`, `eu`, `hy`, `is`, `ka`, `km`, `lo`, `mk`, `mn`, `my`, `ne`, `ps`, `si`, `sq`, `tg` и
  `ug`, и разный текст для `az`, `az-Arab`, `bs`, `kk`, `kok`, `pa`, `sd` и `uz`. Прежде чем выводить locale на сервере,
  проверьте, что ваши целевые браузеры её поддерживают (`Intl.DateTimeFormat.supportedLocalesOf` в браузере), или выводите
  такой календарь только на клиенте.
- **Нет сертификации.** Нет проверки screen readers и физических устройств, нет опубликованной матрицы поддержки и
  измеренных бюджетов производительности. Список часовых поясов — кандидат до первого release candidate.

<a id="migration"></a>
## Переход с 0.1

`0.2` — несовместимый релиз без адаптеров совместимости. Кратко: `events` становятся `items`, доменные поля — `data`;
выберите IANA `timeZone` вместо `utcOffset`/`timezone`; переведите включённые концы all-day в исключённые (даты 3–4
сентября становятся `[2026-09-03, 2026-09-05)`, отсутствующий конец — один день); сохраните timed instants, учитывая, что
окончание в полночь больше не занимает следующий день; замените `onEventPress` на `onItemPress`, а
`isFetching`/`CalendarSkeleton` — на `dataState`; замените `palette`, объекты `theme`, `labels` и
`@nelmad/calendar/tokens.css` на `tokens`, CSS-переменные, `messages` и `@nelmad/calendar/styles.css`; hover-действия
редактирования и удаления становятся `getItemActions` в повестке дня.

В [руководстве по переходу](docs/migration-0.1-to-0.2.ru.md) есть проверенная функция конверсии и таблица удалённых экспортов.

<a id="releases"></a>
## Релизы и provenance

Релизы выпускаются по [RELEASING.md](RELEASING.md) и публикуются только из GitHub Actions — никогда не с машины
разработчика и не из pull request. Каждый pull request и каждый push в `main` выполняют в [CI](.github/workflows/ci.yml)
полный набор проверок: проверки типов, lint, тесты, сборку и проверку содержимого tarball, contract fixtures, docs,
API report и сборку Storybook; на одном упакованном архиве — consumers Vite и Next.js и acceptance milestone (`alpha.2`:
серверный рендеринг, hydration, клавиатура и проверки axe в Chrome); а также Chrome probes.

Релиз начинается только после зелёного CI на выпускаемом commit: мейнтейнер вручную запускает
[Release workflow](.github/workflows/release.yml) на `main`. Он повторяет на этом commit проверки типов, тесты, сборку и
проверку содержимого tarball и ставит version в npm staged publishing через trusted publishing, без хранимого npm token,
с provenance attestation. Staged version не становится публичной, пока мейнтейнер не подтвердит её с двухфакторной
аутентификацией на npmjs.com; только после этого workflow создаёт tag `vX.Y.Z` и GitHub Release с разделом changelog этой
версии. Prereleases публикуются под dist-tag `next`, stable-версии — под `latest`, поэтому `latest` никогда не указывает на
prerelease.

Архив, который проверяет CI, и архив, который ставит Release workflow, собираются из одного commit и lockfile: это две
воспроизводимые сборки этого commit, а не один общий файл. Provenance — подписанная attestation Sigstore, которая
связывает опубликованный package с этим commit и с прогоном workflow, собравшим его; страница package на npm показывает
оба. Чтобы проверить подписи registry и provenance attestations установленных в вашем приложении packages, выполните:

```sh
npm audit signatures
```

<a id="license"></a>
## Лицензия и приватность

MIT, см. [LICENSE](LICENSE). У пакета нет license key, он не собирает telemetry, не выполняет сетевых запросов и не
загружает внешние шрифты, значки и другие assets. [Changelog](CHANGELOG.md).
