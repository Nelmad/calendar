# `@nelmad/calendar` 0.2 — продуктовая и техническая спецификация

Статус: draft v9 — изменение процесса выпуска, одобренное пользователем (владельцем спецификации) 22 октября 2026: доказательство релиза — CI release workflow, который проверяет и публикует один и тот же tarball с npm provenance, вместо хранимого release-evidence manifest и raw artifacts (§§11.3, 12.5, 14, 15.3, 18, 19.1, 19.2); история: draft v8 — уточнения, одобренные владельцем спецификации 22 октября 2026: возврат focus на trigger после закрытия standalone source selector (§12.3), правило одного значения декларации для `CalendarSource.color` и цветов `getItemAppearance` (§10.3.3), восстановление собственных declarations пакета через CSSOM при строгом CSP (§10.3.4) и accessible name строки agenda с `renderAgendaItem` (§12.1); история: draft v7 — уточнения, одобренные владельцем спецификации 9 октября 2026: удержание `layout="auto"` при обратной связи полосы прокрутки (§7), default portal target в открытом modal container (§10.3.4), правило безопасности значений `tokens` (§10.3.2) и SSR `layout="auto"` с `agendaPresentation` (§11.3); в v6 уточнены move-focus, сравнение item во время draft и data-only class contexts по повторному review; продуктовый scope согласован

Дата: 5 сентября 2026

Целевой релиз: `0.2.0`

Документ описывает целевое поведение, а не уже реализованные возможности. `0.2` — осознанно несовместимый с `0.1` релиз: один API `items`, без legacy режима и обязательств сохранять старые props, helpers или зависимости. Переход потребителя описан в разделе 17. Примеры в тематических разделах поясняют поведение; единым нормативным источником публичного TypeScript API является раздел 5.7.

## 1. Назначение продукта

`@nelmad/calendar` — встраиваемый React/TypeScript calendar SDK для B2B SaaS-продуктов, у которых уже есть собственные backend, хранилище и доменная модель.

Главный сценарий — календарное представление задач и других рабочих объектов: проектов, заявок, заказов, публикаций, выездов и дедлайнов.

Пакет отвечает за:

- календарный layout;
- доступные взаимодействия;
- адаптивный desktop/mobile UX;
- корректную работу с датами и timezone;
- визуальную основу и кастомизацию;
- типизированные запросы на изменение данных.

Пакет не хранит данные, не синхронизируется с backend и не выполняет доменные операции самостоятельно.

### 1.1. Основной пользователь

Frontend- или full-stack-разработчик React/TypeScript в продуктовой команде, который хочет встроить готовый календарь в существующее приложение без покупки enterprise UI-suite и без замены своего backend.

### 1.2. Эталонный продукт

Task/project manager. Это референс для UX и API, но базовая модель не должна быть привязана только к задачам.

### 1.3. Позиционирование

> Composable React calendar for tasks and operational workflows: controlled, backend-agnostic, mobile-ready, accessible and design-system friendly.

Go-to-market `0.2` — CIS-first, поэтому осознанный default locale остаётся `ru-RU`; технический API не содержит русскоязычных identifiers, `en-US` является first-class catalog, а npm README/API reference публикуются на английском с русской версией. Другие BCP 47 locales получают локализованные date labels и документированный fallback UI messages из раздела 11.2.

### 1.4. Граница обещания продукта

Долгосрочное видение — дать продуктовым командам UI-фундамент, на котором можно построить календарный опыт уровня крупных календарных приложений. Сам npm-пакет при этом не становится hosted calendar service.

Проверяемое обещание `0.2` уже: разработчик подключает существующий backend и без private imports получает готовый Month View и DayAgenda, а пользователь на desktop и mobile может найти, просмотреть и открыть рабочие объекты по датам. Selection, создание и перенос расширяют этот сценарий, но не добавляют хранение, приглашения или синхронизацию.

В `0.2` явно не обещаются аккаунты, участники и invitations, reminders/notifications, free/busy, почта, видеовстречи, offline sync или совместное редактирование. Поэтому формулировка «заменить Яндекс Календарь» означает замену встраиваемой календарной поверхности внутри продукта, а не всего сервиса Яндекс Календаря.

## 2. Принципы

1. **Embeddable first.** Встраиваемый npm-пакет важнее собственного приложения или backend.
2. **Controlled data.** Источник истины находится у приложения-потребителя.
3. **Generic core, task-first UX.** Модель универсальна, стандартный UX оптимизирован для рабочих объектов.
4. **Accessible by contract.** React Aria — фундамент, но не замена самостоятельной проверке WCAG.
5. **Correct time model.** Публичный API использует сериализуемые строки, IANA timezone и явные правила интервалов.
6. **Useful out of the box.** Компонент должен выглядеть и работать качественно сразу после установки.
7. **Deep customization without broken semantics.** Потребитель меняет содержимое и внешний вид, а обязательные ARIA, focus и interaction semantics сохраняет пакет.
8. **No lock-in.** MIT, без license key, telemetry, скрытой сети и обязательных внешних ресурсов.

### 2.1. Стратегия поставки и проверки спроса

Scope ниже относится к стабильному `0.2.0`; это не обещание реализовать весь объём одним шагом. Поставка идёт через npm prereleases, каждый из которых пригоден для интеграционного feedback:

1. `0.2.0-alpha.1` — новый ISO/IANA data contract, desktop Month View, базовый доступный desktop `DayAgenda` для полного списка и keyboard/AT activation items, controlled navigation/loading, `onItemPress`, package/SSR fixtures и `classicTheme`;
2. `0.2.0-alpha.2` — responsive Month View, mobile и overlay presentations `DayAgenda`, item actions, overflow, sources и `neutralTheme`;
3. `0.2.0-beta.1` — selection/create и полный move contract одновременно для pointer, touch и keyboard; недоступный вариант ввода не выпускается как единственный способ операции;
4. `0.2.0-rc.1` и при необходимости следующие RC — стабилизация публичного API, WCAG-аудит, support matrix, performance baselines, документация и внешние пилоты;
5. stable `0.2.0` — выполнены критерии раздела 19, а API не требует private imports или необъявленных обходных решений.

Advanced epic (`sources`, selection/create, move или расширенный customization) проходит проверку на prerelease как минимум в двух независимых внешних интеграционных сценариях; обязательность для обоих пилотов является способом набрать эти два сценария, а не альтернативой проверке результата. До включения epic в первый prerelease для него создаётся датированный comparison brief: конкретная user problem, сигналы спроса, актуальные поддерживаемые npm/OSS/commercial alternatives, их license/API/a11y/mobile/SSR ограничения и причина, почему composition с ними не решает сценарий дешевле. Наличие аналога само по себе не запрещает epic, но запрещает строить его без сформулированного преимущества для целевого пользователя.

Положительный сценарий означает одновременно: проблема существует в реальном или уже запланированном продукте участника; core task завершён только через public API без private imports и неподдерживаемого workaround; участник подтвердил, что оставил бы возможность включённой и назвал конкретную зависимость, собственную реализацию или UX-ограничение, которое она устраняет. Go требует двух таких положительных сценариев и отсутствия открытого P0/P1 по epic. При меньшем сигнале, более дешёвой composition-альтернативе или несовместимых требованиях epic получает решение `iterate`/`defer`, а не проходит gate формально. Датированный decision record фиксирует evidence, defects/workarounds, сравнение, решение и владельца следующего шага.

Решение перенести epic в следующий minor меняет эту спецификацию явно; незавершённый или недоступный вариант не маскируется под готовую возможность `0.2.0`. Кандидаты `0.3` проходят такой же market gate заново на момент планирования, а не наследуют выводы `0.2`.

## 3. Scope `0.2`

### 3.1. Обязательные возможности

- desktop Month View;
- mobile compact month + agenda;
- single-day, multi-day и all-day items;
- generic `CalendarItem<TItemData>`;
- несколько проектов/календарей через независимый `CalendarSource<TSourceData>`;
- controlled-фильтрация sources;
- выбор даты и диапазона;
- отдельный request на создание;
- перенос items мышью, touch и клавиатурой;
- policy callbacks для выбора и переноса;
- универсальные item actions;
- автоматическое переполнение дня через `+N`;
- `DayAgenda` для полного списка дня;
- IANA timezone и DST;
- locale, первый день недели, 12/24 часа и RTL;
- initial loading, refreshing, empty и error states;
- `classicTheme` и `neutralTheme`;
- compact/comfortable density;
- content slots, class callbacks и CSS variables;
- WCAG 2.2 AA release gate;
- SSR/hydration, ESM/CJS и consumer compatibility tests.

### 3.2. Не входит в `0.2`

- week и day views;
- recurrence engine и редактор повторений;
- встроенная форма создания/редактирования;
- resize по времени;
- ICS import/export;
- CalDAV sync;
- resource timeline, capacity и availability engine;
- собственный backend, аккаунты, уведомления и совместная работа;
- полностью headless API;
- отдельный публичный UI-kit.

Потребитель может передавать заранее развёрнутые occurrence как обычные items, но пакет `0.2` не интерпретирует RRULE и не изменяет серии.

## 4. Публичная модель данных

Публичный контракт не содержит `Date`, Day.js или типов `@internationalized/date`, без исключений для старых exports. Потребитель передаёт строки ISO/RFC 3339; внутреннюю date library можно заменить без изменения этого контракта.

```ts
export type ISODate = string; // YYYY-MM-DD
export type RFC3339DateTime = string; // offset или Z обязателен
export type IanaTimeZone = string; // например, Europe/Moscow

export type CalendarInterval =
  | {
      kind: 'allDay';
      start: ISODate;
      end: ISODate;
    }
  | {
      kind: 'timed';
      start: RFC3339DateTime;
      end?: RFC3339DateTime;
      timeZone?: IanaTimeZone;
    };

export type CalendarItem<TItemData = unknown> = {
  id: string;
  title: string;
  calendarId?: string;
  interval: CalendarInterval;
  data: TItemData;
};

export type CalendarSource<TSourceData = unknown> = {
  id: string;
  title: string;
  color?: string;
  data?: TSourceData;
};
```

### 4.1. Семантика интервалов

- Все date-only значения — существующие даты proleptic Gregorian calendar в точном формате `YYYY-MM-DD`, с четырёхзначным годом `0001…9999`. Locale меняет представление, но не календарную систему данных.
- Полный Month grid гарантируется для `anchorDate` от февраля `0001` до ноября `9999` включительно. Это оставляет представимыми соседние дни grid; навигация за эти границы недоступна. Прямая передача `anchorDate` вне этой границы является contract error; helper бросает `RangeError`, partial grid не возвращается. Остальные `ISODate` допустимы для items и чтения agenda, но exclusive range не может включить 31 декабря `9999`, потому что `10000-01-01` не входит в контракт.
- `allDay.start` и `allDay.end` — date-only значения, не instants. Смена timezone не сдвигает их даты.
- `end` является exclusive. Однодневный all-day item: `start=2026-09-03`, `end=2026-09-04`. Для all-day обязательно `end > start`; пустой диапазон недопустим.
- Timed `start/end` — строгие RFC 3339 timestamps: `YYYY-MM-DDTHH:mm:ss`, необязательная точка с 1–3 decimal digits, затем обязательный `Z` или valid numeric offset `±HH:MM`. `T`/`Z` — uppercase; `24:00`, leap seconds, `-00:00`, несуществующие даты и точность выше миллисекунд не принимаются. После применения offset каждая boundary обязана попасть в instant-range `[0001-01-01T00:00:00.000Z, 9999-12-31T23:59:59.999Z]`; underflow/overflow делает interval невалидным. Сравнение выполняется по instant, а не лексикографически по строкам.
- Timed item без `end` — событие-момент, не открытый интервал и не событие со скрытой default duration. Оно отображается только в дате своего `start` в `Calendar.timeZone`; при переносе `end` остаётся отсутствующим.
- Timed item с `end === start` по instant также является событием-моментом; явно заданное окончание сохраняется. `end < start` недопустим.
- Timed item ненулевой длительности показывается в дате `D`, если существует хотя бы один instant `t` из `[start, end)`, чья проекция в `Calendar.timeZone` имеет григорианскую дату `D`. Множество instants одной локальной даты может быть пустым или состоять из нескольких несмежных частей; реализация не предполагает единственную локальную полночь и не прибавляет фиксированные `24h`. Exclusive `end` сам по себе не создаёт membership новой даты; она всё же входит, если другой instant до `end` проецируется в неё.
- Если часть timed interval проецируется за пределы `0001-01-01…9999-12-31`, отбрасывается только непредставимая часть; item не исключается целиком, если у него остаётся пересечение с видимыми поддерживаемыми датами. All-day даты никогда не исчезают из-за timezone-перехода, даже если такая локальная дата не имела instants.
- RFC 3339 значение однозначно задаёт instant. `interval.timeZone` — исходная/авторская зона, а `Calendar.timeZone` — зона отображения и календарного переноса. Offset timestamp не обязан совпадать с авторской зоной: значение с `Z` и отдельной IANA timezone допустимо.
- Если timed item не задаёт `timeZone`, для связанных с ним операций используется `Calendar.timeZone`; отсутствующее поле не добавляется в item автоматически.
- `id` уникален в `items`, стабилен при обновлениях и непуст после `trim`. Для пустого `title` пакет использует локализованное «Без названия» и выдаёт development warning. Все items с конфликтующим id либо невалидным интервалом исключаются из layout, счётчиков и взаимодействий; в development выдаётся диагностическое предупреждение.

Если несколько Calendar получают общее `itemMoveStates`, их `item.id` принадлежат единому пространству идентичности: одинаковый ID всегда обозначает один и тот же доменный объект, даже в разных `items` и после remount. Для разных datasets/tenants с локальным `id="42"` consumer формирует разные стабильные IDs, например `tenant-a:42` и `tenant-b:42`, либо передаёт раздельные move-state stores. `calendarId` обозначает source и не является namespace item. Пакет не может обнаружить коллизию между непересекающимися массивами другого экземпляра; соблюдение sharing-domain — обязательство consumer, а не неявная глобальная проверка.

Формулировки «день начинается в полночь» ниже являются UX-сокращением. Нормативным для timed items остаётся предикат проекции instant выше; он покрывает исторические midnight gaps/folds и целиком пропущенные гражданские даты.

### 4.2. Доменная информация

`status`, `priority`, `assignee`, `taskId` и аналогичные поля находятся в `data`. Их содержимое отображается через `renderItem`/`renderAgendaItem`, а цветовое оформление — через `CalendarSource.color` и `getItemAppearance`.

`CalendarSource.color` задаёт только accent marker items известного source; он не становится фоном или цветом текста. `getItemAppearance` является частичным item-level override: каждое присутствующее поле независимо заменяет соответствующий accent/background/text слой, а отсутствующие поля продолжают наследовать source и theme/token defaults. Один resolved appearance применяется ко всем month segments и agenda-представлению item. Полная precedence, fallback и ответственность за consumer colors заданы в разделе 10.3.

### 4.3. Runtime validation

TypeScript aliases не доказывают корректность строк во время выполнения. Пакет валидирует вход до date math и layout:

- `ISODate`, RFC 3339, IANA timezone, диапазоны и уникальность IDs проверяются без исправления входных значений;
- `IanaTimeZone` должна посимвольно, с тем же регистром, совпадать с `UTC` либо identifier из встроенного accepted-set по правилам ниже; fixed-offset строки вроде `+03:00` не являются `IanaTimeZone`;
- неверные configuration/controlled props (`anchorDate`, `timeZone`, `today`, `agendaDate`, `selection`, `dataState`, enum, breakpoint, locale/messagesLocale или неполная controlled-пара) являются consumer contract error: Calendar не выполняет новые effectful `on*` notifications и показывает локализованный безопасный error-state с детерминированным locale fallback раздела 11.2; development build дополнительно сообщает имя prop и причину. Вход в этот state закрывает package overlays и отменяет selection/move drafts, pending agenda open и отложенные navigation/focus targets; после исправления props они не возобновляются, а уже выпущенные внешние requests не отменяются. Если до этого экземпляр уже отправил ненулевой `onItemMoveDraftChange`, при входе в error-state он ровно один раз отправляет парный cleanup `null` исходной identity, после чего notifications запрещены до корректных props. Это единственное lifecycle-исключение и не создаёт request/change notification. Только явно описанные recoverable cases вроде `portalContainer`, пустого message override или item title используют свой fallback;
- невалидная отдельная запись `item`, `source`, action или move state изолируется по правилам её раздела и не ломает остальные корректные данные;
- production и development принимают и отклоняют одинаковые значения; diagnostics не являются скрытой веткой поведения.

Значения не нормализуются молча: пакет не дописывает timezone, не меняет inclusive end на exclusive, не обрезает дробные секунды и не заменяет невалидную дату ближайшей существующей. Идентичность accepted props и deduplication callbacks сравниваются по их каноническому смыслу, а не по случайному объектному identity.

#### 4.3.1. Допустимые timezone identifiers

Accepted-set — immutable данные самого package, одинаковые в ESM/CJS, server и browser. До первого RC воспроизводимый generator строит список primary identifiers из pinned IANA tzdb по pinned редакции алгоритма ECMA-402 §6.5, включая его явные исключения для primary links; решение не выводится только из наличия `Zone`/`Link` строки. Результат пересекается с identifiers, которые все exact runtime tuples раздела 14 умеют использовать в выбранном date runtime/Intl. Manifest хранит tzdb version и hash архива, revision стандарта/generator, полный отсортированный список, исключения с причинами и hash списка. Обязательный минимум: `UTC`, `Europe/Moscow`, `Europe/Berlin`, `America/New_York`, `Asia/Tokyo`, `Pacific/Apia`; невозможность поддержать его блокирует RC, а не молча сужает data contract. Список публикуется в EN/RU API reference как artifact релиза, без нового JS export.

Membership проверяется только по этим package data. `Intl.supportedValuesOf`, `resolvedOptions().timeZone`, системная зона и host enumeration не меняют accept/reject. Non-primary aliases вне списка, включая `Etc/UTC`, `GMT`, `US/Eastern`, а также `europe/berlin`, пустые строки и POSIX expressions отклоняются без case folding/alias mapping. Невалидная `Calendar.timeZone` даёт contract error, невалидная авторская `interval.timeZone` исключает только соответствующий item. Принятое значение сохраняется в payloads без переименования.

Accepted-set замораживается на всю линию `0.2.x`; новый host identifier не принимается автоматически, а добавление новых названий планируется в следующем minor. Это фиксирует acceptance, но не timezone offsets: transitions по-прежнему зависят от Intl/tzdata и требуют SSR-совместимости из 11.3. Стоимость встроенного списка учитывается в bundle budget. Основание отделять package validation от runtime data: [ECMA-402 §6.5](https://tc39.es/ecma402/#sec-use-of-the-iana-time-zone-database) допускает различия доступных identifiers и описывает переименования; [IANA identifiers](https://data.iana.org/time-zones/theory.html#naming) различают имена и связи в обновляемой базе.

#### 4.3.2. Safe contract-error surface

Contract-error shell всегда использует `classicTheme`, resolved `layout="mobile"`, `density="compact"`, `colorScheme="system"` и `lang`/`dir` из fallback 11.2; это оформление ошибки, не принятие исправленных входных props. Toolbar, grid, agenda и portals отсутствуют, остаются именованный Calendar region и видимый error region. `CalendarRootState.kind` равен `contract`, `dataState` — синтезированный `{status: 'error', phase: 'initial', error: Error}` с причиной валидации. При корректной конфигурации `kind='data'`, а `dataState` отражает consumer prop/default. `data-status="error"` присутствует и `data-loading-phase` отсутствует; остальные обязательные root attributes получают значения safe shell, даже если исходный enum невалиден.

В contract-error разрешены только относящиеся к shell pure resolvers: локализация его имени/ошибки по fallback 11.2, `classNames.root`/`classNames.status` с описанным state и `renderError({kind: 'contract', error, hasStaleItems: false})`. `className`, `style`, `id` и ARIA naming props сохраняют своё обычное назначение; custom tokens не применяются. Item/day/toolbar/loading/empty renderers, item/source resolvers, sort и policy не вызываются. Ошибка, брошенная самим consumer resolver, относится к React error boundary приложения и не запускает рекурсивную попытку показать тот же custom error renderer.

## 5. Controlled API

Приложение-потребитель контролирует `items`, отображаемый месяц, принятую selection, фильтрацию и состояние запросов переноса. Внутри календаря разрешено presentation/interaction UI-состояние:

- focus;
- hover/press;
- drag preview;
- незавершённый selection/move draft и ожидаемая цель keyboard focus;
- открытые popover/menu/sheet;
- измерение контейнера и количества видимых строк.

Единственное отдельно оговорённое uncontrolled view state — дата просмотра `DayAgenda`, когда потребитель не передал controlled-пару (раздел 5.2). Она не является selection и не изменяет данные.

Календарь не создаёт внутреннюю копию `items` или принятой selection как второй источник истины. Draft и preview не являются принятыми изменениями.

### 5.1. Навигация и видимый диапазон

`anchorDate: ISODate` задаёт отображаемый месяц; номер дня во входном значении не меняет выбор месяца. `onNavigate(anchorDate: ISODate)` запрашивает первый день целевого месяца. До принятия props календарь продолжает показывать прежний месяц; внутреннего optimistic month нет.

```ts
export type CalendarDateRange = {
  start: ISODate;
  end: ISODate; // exclusive, обязательно > start
};

export type CalendarVisibleRange = CalendarDateRange & {
  timeZone: IanaTimeZone;
};

export type CalendarVisibleRangeOptions = {
  anchorDate: ISODate;
  timeZone: IanaTimeZone;
  locale?: string;
  firstDayOfWeek?: CalendarWeekday;
};

export function getCalendarVisibleRange(
  options: CalendarVisibleRangeOptions,
): CalendarVisibleRange;
```

Grid начинается с первого `firstDayOfWeek` не позже первого дня месяца и заканчивается после последнего дня последней полной недели, содержащей день месяца; получается от четырёх до шести строк. `getCalendarVisibleRange` — чистый root export для SSR-prefetch и initial query: при тех же `anchorDate`, `timeZone`, `locale` и `firstDayOfWeek` он обязан вернуть ровно тот range, который отрисует `Calendar`. Он не читает часы, DOM или process-global locale и применяет defaults раздела 11. Helper валидирует input по тем же правилам, но в отличие от React surface синхронно бросает `RangeError` и никогда не возвращает partial/fallback range.

`onVisibleRangeChange(range: CalendarVisibleRange)` вызывается после первого committed render и при изменении принятой tuple `(start, end, timeZone)`, включая изменение первого дня недели, если оно поменяло range. Диапазон включает дни соседних месяцев, попавшие в grid. Callback не вызывается во время SSR/render, для ещё не принятого navigation request, из-за замены identity самого callback или повторного setup effect в React StrictMode. Последовательные commits одной tuple дедуплицируются, но возврат `A → B → A` законно вызывает callbacks для `A`, `B`, `A`. Потребитель может заранее загрузить initial range через helper; callback остаётся notification, а не единственным способом узнать range. Преобразование набора локальных дат в instants следует правилу проекции раздела 4.1, а не одному предполагаемому интервалу или фиксированным `24h`.

#### 5.1.1. Focus при controlled navigation

- В пределах отрисованного grid соседняя дата получает focus сразу, даже если это день соседнего месяца. Это не меняет selection или agenda date.
- Переход стрелками за пределы grid запрашивает месяц целевой даты. До принятия props focus остаётся на существующей ячейке; для этого запроса и `PageUp`/`PageDown` ниже запоминается только transient focus intent с target и источником `grid`, не новый месяц.
- `PageUp/PageDown` запрашивают предыдущий/следующий отображаемый месяц, сохраняя номер сфокусированного дня с ограничением последним днём целевого месяца. `Shift` меняет год. `2026-01-31 → 2026-02-28 → 2026-03-28`: скрытого «предпочитаемого 31-го» нет.
- После принятия запрошенного месяца target получает focus, только если последний source-aware focus intent ещё актуален и запрос не отменён последующим пользовательским действием. Для источника `grid` focus должен всё ещё находиться в grid; для источника `today` — на том же package-owned control «Сегодня», который инициировал request. Календарь не забирает focus из другого control или приложения.
- После принятия последнего ещё актуального user-initiated запроса previous/next из toolbar пакет один раз использует `monthChangedAnnouncement(monthStart)` в scoped polite channel владеющего Calendar, если focus остался внутри этого Calendar и не перешёл в date gridcell нового месяца, чьё accessible name уже сообщает новую дату. `monthStart` — первый день принятого месяца. Перенос focus в такую cell заменяет live announcement; внешний update месяца, keyboard-навигация из grid, кнопка «Сегодня», отменённый/устаревший request и повторный StrictMode effect его не создают. Выход focus из Calendar до acceptance отменяет ожидаемое announcement.
- Если props не обновились, прежние месяц и focus сохраняются. Задержка не объявляется отказом. Новый navigation request заменяет прежние target/source/initiator. `Escape`, любое не относящееся к request пользовательское keyboard/pointer action или выход focus из разрешённого для источника owner (`grid` либо та же инициировавшая кнопка «Сегодня») отменяет ожидаемый source-intent перенос. Stale/mismatching acceptance после этого не переносит focus к сохранённому target; если принятое значение становится обычным внешним изменением месяца, для уже находящегося в grid focus действует только правило строки ниже. Committed переход в blocking data-state или contract-error сначала отменяет intent любого источника и только затем обрабатывает acceptance того же commit; исправление состояния позднее его не возобновляет.
- Внешняя смена месяца вне актуального request переносит roving target на тот же номер дня с clamping; DOM focus перемещается только если до обновления был внутри grid.
- Запрос навигации в уже принятый месяц не вызывает `onNavigate`: целевая дата получает focus сразу. На границах поддерживаемого диапазона соответствующая кнопка и keyboard-команда недоступны и объясняют причину через accessible description.

### 5.2. Selection и создание

Просмотр дня, selection и создание — три разные операции.

#### 5.2.1. Дата просмотра `DayAgenda`

- `agendaDate: ISODate` и `onAgendaDateChange(date: ISODate)` — optional controlled-пара; передаются только вместе. При наличии пары дата берётся только из props, без внутренней копии.
- Без пары календарь хранит дату agenda как presentation UI-state. Fallback: известное `today` в отображаемом месяце, иначе первый день месяца. Источник `today` и первое SSR/client состояние определены в разделе 11.3.
- После принятой смены месяца uncontrolled agenda date сохраняется, если принадлежит новому месяцу; иначе применяется fallback. Потеря focus, смена selection и обновление items не сбрасывают её.
- Controlled `agendaDate` не изменяется автоматически при навигации. Она может находиться вне grid; согласование месяца и загрузку items для такой даты выполняет потребитель. Изменение agenda date само по себе не вызывает `onNavigate`.
- Обычный click/tap по дате, включая pointer hit-area видимого `+N` внутри неё, и `Enter` на date cell запрашивают просмотр этой даты, не меняя selection. `+N` не является отдельным control; его keyboard/AT-эквивалент — activation владеющей date cell. Policy запрета выбора не запрещает просмотр её событий.
- Без controlled-пары agenda обновляется сразу. Если controlled target уже равен `agendaDate`, callback не вызывается и agenda открывается сразу. Иначе `onAgendaDateChange` вызывается один раз, а новый content не показывается и focus не переносится в новую agenda, пока prop не станет равен последнему target. Pending request хранит отдельно target и ещё актуальный user open/focus intent. Если request начат внутри уже открытой agenda, прежний content/focus может сохраниться до acceptance; activation другой date cell снаружи dismiss-ит старый overlay и оставляет focus на target cell, заменяя pending target и intent. Любое последующее пользовательское перемещение focus за пределы инициировавшей date cell либо прежнего owning agenda stack, включая переход в другой control того же Calendar, а также любая не относящаяся к request keyboard/pointer activation, `Escape` или выход focus из Calendar отменяет open/focus intent и ожидаемое user-initiated announcement; уже вызванный callback не отменяется. Если после этого prop всё же принимает target, это остаётся обычным принятием controlled `agendaDate`: существующий inline content может обновиться, но package не открывает overlay, не переносит focus и не объявляет update как завершение отменённого intent. Любое принятое значение `agendaDate`, отличное от последнего target, считается внешним изменением и отменяет весь pending request.
- Если ещё актуальный target принят, passive resize или одновременная runtime-смена `layout`/`agendaPresentation` не отменяет intent: package открывает presentation, разрешённую уже принятым новым layout, ровно один раз. `Enter` применяет её initial-focus правило; click/tap оставляет focus на date cell для inline presentation, а для popover/sheet применяет соответствующее правило раздела 12.2. Это узкое исключение из focus-gate пассивной migration раздела 11.3 и не позволяет позднему acceptance забирать focus после перечисленной выше пользовательской отмены.
- Дата overlay и inline agenda следует одному `agendaDate` контракту. Range selection не выбирает для agenda ни start, ни end автоматически.
- Переход uncontrolled → controlled немедленно принимает переданный `agendaDate`. Переход controlled → uncontrolled начинает внутреннее состояние с последней корректной controlled-даты; если её не было, применяется обычный fallback. Такое переключение поддержано и не создаёт callback само по себе.

#### 5.2.2. Принятая selection и draft

`selection: CalendarDateRange | null` и `onSelectionChange(selection: CalendarDateRange | null)` передаются вместе. Без пары календарь работает как viewer: команды выбора скрыты, `Space` не создаёт selection. Принятая selection сохраняется при навигации, пока её не изменит потребитель.

- Single date: `Space` на дате предлагает `[date, следующий день)`. Pointer/touch-эквивалент — явное действие «Выбрать дату» в `DayAgenda`; обычный tap продолжает означать просмотр.
- Range: доступная команда «Выбрать диапазон» закрывает текущие package overlays, включает transient mode и возвращает focus в связанную с agenda датой grid cell, если она существует; для допустимой `agendaDate` вне grid используется текущая roving cell, затем общий fallback раздела 12.3, без неявной навигации месяца. Первый `Space` фиксирует anchor, стрелки перемещают focus/endpoint, второй `Space` завершает диапазон. На pointer/touch в этом режиме первый click/tap фиксирует anchor, второй завершает диапазон.
- Desktop drag по пустой области — shortcut того же range draft: pointer down задаёт anchor, движение endpoint, pointer up завершает. Нажатие без начала drag остаётся обычным просмотром дня; выбор не должен срабатывать при прокрутке или отменённом жесте.
- Диапазон нормализуется независимо от направления: `start = min(anchor, endpoint)`, `end = следующий календарный день после max(anchor, endpoint)`. Одинаковые anchor и endpoint дают один день.
- Draft содержит только anchor/endpoint/mode. До завершения `onSelectionChange` не вызывается. Разрешённое завершение вызывает callback один раз и закрывает draft; отображаемая принятая selection меняется только после новых props.
- Если нормализованный результат уже равен принятой `selection`, draft закрывается как no-op без callback. Снятие уже пустой selection также no-op.
- Запрещённая policy цель не отправляет callback: причина показана и объявлена, draft можно исправить или отменить. Для диапазона проверяются все включённые даты, а не только endpoints.
- `Escape` / явная «Отмена» отменяют draft, но не очищают принятую selection. Отдельная команда «Снять выделение» запрашивает `null` и также ждёт принятия props.
- Навигация с принятым keyboard target может продолжать range draft между месяцами. Пока навигация не принята, endpoint не меняется. Внешнее изменение selection, месяца вне актуального запроса или начало move отменяет draft.
- Удаление controlled selection-пары немедленно переводит календарь в viewer mode, отменяет selection draft и перестаёт отображать принятую selection; повторное добавление пары принимает только новое значение prop. Смена режима сама по себе callback не вызывает.

31 декабря `9999` можно просматривать в agenda, но нельзя включить в selection/create: следующий exclusive boundary не представим как `ISODate`. Это core validation block с доступной причиной, который consumer policy не может разрешить.

#### 5.2.3. Создание

Optional-кнопка «Создать» появляется только при наличии `onCreateRequest`. Она недоступна без принятой selection, во время selection/move draft и при policy-запрете. Callback получает только принятую `CalendarDateRange`, никогда незавершённый draft; перед вызовом актуальная selection повторно проверяется по policy. Форму открывает и сохраняет приложение-потребитель.

### 5.3. Перенос item

Мышь, touch и keyboard используют один request:

```ts
export type CalendarMoveRequest<TItemData> = {
  requestId: string;
  item: CalendarItem<TItemData>;
  previousInterval: CalendarInterval;
  proposedInterval: CalendarInterval;
  input: 'pointer' | 'touch' | 'keyboard';
};

export type CalendarMoveState = {
  requestId: string;
  itemId: string;
} & (
  | {status: 'pending'}
  | {status: 'succeeded'}
  | {status: 'rejected'; reason: string}
);
```

- desktop: drag-and-drop;
- mobile: long press и drag;
- keyboard: действие «Перенести», навигация стрелками, `Enter` для подтверждения;
- без drag и без клавиатуры: действие «Перенести» в item menu → click/tap целевой даты → явная кнопка «Подтвердить»; доступны кнопка «Отмена» и `Escape`;
- move mode временно заменяет обычное открытие agenda/selection по дате, показывает целевую дату и причину запрета; он не открывает встроенный редактор события;
- `Escape`, «Отмена», потеря pointer capture и удаление исходного item до подтверждения отменяют только draft, без request;
- отсутствие `onItemMoveRequest` отключает все способы переноса и скрывает встроенное действие «Перенести»;
- long press никогда не является единственным способом переноса.

Встроенная команда «Перенести» добавляется пакетом независимо от consumer `getItemActions`. Она закрывает menu/agenda overlay, затем использует основной grid как выбор новой даты, включая controlled-навигацию месяца по разделу 5.1; отдельный date picker с независимым месяцем не вводится. Initial target — `allDay.start` либо дата timed `start` после проекции в `Calendar.timeZone`. Если target уже в grid, он становится roving/focus target. Иначе package после удаления закрываемого overlay и снятия его modal containment/background `inert`/scroll lock, но до `onNavigate`, переводит roving/DOM focus в текущую connected roving cell и создаёт transient focus intent с target и source `grid` по разделу 5.1.1; если cell неожиданно недоступна, применяется общий fallback 12.3 и intent переноса target не создаётся. Затем package запрашивает содержащий target месяц через `onNavigate`: до принятия props request невозможен, прежний grid и roving-cell focus сохраняются, а видимый status использует `moveNavigationPendingLabel(resolvedItemTitle, monthStart)`, где `resolvedItemTitle` — `item.title` после `untitledItemLabel` fallback, а `monthStart` — первый день запрошенного месяца. Matching acceptance переносит roving/DOM focus в target только пока source intent актуален и focus остаётся в grid. `Tab`/`Shift+Tab` из grid, unrelated user action, stale/mismatching acceptance и blocking/contract transition отменяют этот перенос по 5.1.1 и не позволяют позднему update забрать внешний focus; `Escape` дополнительно отменяет сам draft и pending target. Status является polite fragment по deterministic coalescing правилам 12.4, а не вторым live endpoint, и не повторяется на commits той же pending target. Если origin не входит ни в один поддерживаемый Month grid, встроенное действие недоступно с boundary reason. Pointer/touch может пользоваться обычными кнопками навигации, выбора даты и подтверждения. После завершения move package восстанавливает focus к исходному item/action trigger, а если он больше не отрисован — по общему fallback раздела 12.3, но только когда focus всё ещё находится внутри закрываемой package-поверхности либо оказался на `body`. Pointer/outside action, уже перенёсший focus наружу, сохраняет свою цель. Начало move отменяет range draft.

Long-press drag из modal agenda sheet не пытается hit-test недоступный `inert` grid сквозь открытую sheet. После распознавания long press, но до удаления dialog, package передаёт активный pointer на стабильный package-owned drag-session owner в том же portal scope; этот owner остаётся connected до `pointerup`/`pointercancel`, исключён из accessibility tree и никогда не получает keyboard focus. Только после подтверждённого pointer capture package атомарно начинает draft, закрывает sheet, снимает её focus containment/background `inert`/scroll lock, восстанавливает focus в initial target gridcell по правилам выше и начинает hit-testing уже доступного grid по координатам captured pointer. Если capture не удалось получить, sheet остаётся открытой и drag не начинается; если capture потерян после старта, draft отменяется по общему правилу без request. Закрытие sheet не считается такой потерей, потому что capture owner переживает её; combined start announcement маршрутизируется только после switch в разрешённый root endpoint по разделу 12.4.

Range-based загрузка не должна удалять исходный item из `items` только потому, что его дата вышла из нового grid range. Потребитель сохраняет его в cache и props до завершения draft/request; items вне grid допустимы и не добавляют видимые строки. Для выборочного удержания предусмотрен optional `onItemMoveDraftChange(itemId: string | null)`: id сообщается при начале draft до возможного `onNavigate`, `null` — при отмене, no-op завершении, unmount или передаче в `onItemMoveRequest`. Это UI lifecycle notification, не запрос изменения данных; изменение endpoint не вызывает его заново.

Экземпляр сохраняет identity callback, которому отправил ненулевой item ID, и именно ему гарантированно отправляет завершающий `null`, даже если prop затем заменён или удалён; новая identity применяется только к следующему draft и не получает retroactive ID. Так lifecycle остаётся парным. Передача draft в request имеет строгий порядок в одной синхронной обработке submit: зарегистрировать request локально → вызвать `onItemMoveRequest(request)` → вызвать парный `onItemMoveDraftChange(null)`. Consumer уже в обработчике request атомарно переводит удержание item с draft id на запись запроса; следующий cleanup `null` освобождает только draft-удержание и не удаляет request-удержание. Это работает также с синхронным внешним store и не полагается на автоматический React batching. Cleanup помечается завершённым до уведомления, поэтому reentrant update/unmount не отправляет второй `null`; исключение из consumer callback не считается серверным отказом, но парный cleanup выполняется в `finally`. Настоящее удаление из доменных данных по-прежнему отменяет draft; новое значение того же item нельзя заменять устаревшей cache-копией ради его сохранения.

#### 5.3.1. Расчёт proposed interval

Точка отсчёта зависит от presentation, а не от устройства ввода:

- Drag из Month grid: сдвиг равен разнице дат между ячейкой захвата и целевой ячейкой. Захват продолжения multi-day bar сохраняет смещение относительно начала item.
- Drag из `DayAgenda` (inline, popover или sheet, на desktop и mobile): целевая ячейка задаёт новую дату начала всего item. Origin — `allDay.start` либо дата timed `start` в `Calendar.timeZone`, а не `agendaDate`. Само присутствие item в списке другого дня не создаёт смещение захвата. Для modal sheet сначала выполняется pointer-session handoff и атомарное закрытие из предыдущего абзаца; grid никогда не является drop target, пока остаётся `inert`.
- В режиме «Перенести» целевая дата также означает новую дату начала всего item. Поэтому agenda drag и выбор той же даты через команду «Перенести» дают одинаковый proposed interval. Для grid drag такое сравнение выполняется с учётом смещения захвата.

Preview явно показывает предлагаемую дату начала. Например, all-day `[2026-09-03, 2026-09-12)` из agenda 10 сентября при drop на 11 сентября становится `[2026-09-11, 2026-09-20)`. Захват того же bar в grid за ячейку 10 сентября и drop на 11 сентября сдвигает весь interval только на один день: `[2026-09-04, 2026-09-13)`.

1. All-day: к обеим date-only границам прибавляется одно число календарных дней; число дней сохраняется.
2. Timed: исходный `start` проецируется в `Calendar.timeZone`. Меняется календарная дата, сохраняются часы, минуты, секунды и миллисекунды начала.
3. Если новое локальное время отсутствует из-за DST gap или пропущенной календарной даты, перенос блокируется до request с понятной причиной. Пакет не сдвигает его молча на следующий час.
4. Если новое локальное время повторяется при DST fold, выбирается более ранний instant (`earlier`). Preview и live announcement указывают также числовой UTC offset, чтобы различать два одинаковых локальных времени. Это фиксированная политика `0.2`, а не зависимость от library default.
5. Gap/fold disambiguation применяется только при разрешении нового локального start. При наличии `end` сохраняется elapsed duration: разница исходных `end` и `start` по instants. Новое окончание равно новому start instant плюс эта длительность и не проходит второе локальное gap/fold-разрешение. Локальное время окончания при пересечении DST может измениться; wall-clock duration не гарантируется. Для события-момента применяются правила раздела 4.1.
6. Собственная `interval.timeZone` сохраняется без изменений. Start/end сериализуются независимо с offset авторской зоны, если она указана, иначе — зоны календаря. Если исторический offset boundary содержит секунды либо её локальный Gregorian year в этой зоне вышел за `0001…9999`, boundary сериализуется через `Z`; instant не округляется, а `interval.timeZone` сохраняется.
7. All-day item можно перенести на гражданскую дату, не имевшую instants в данной timezone: его date-only semantics не зависят от этого. Выход любой all-day boundary за `ISODate` domain либо timed boundary за instant-range раздела 4.1 блокирует proposal до request.

Сдвиг календарной даты не равен прибавлению `24h`. Миллисекунды используются только для elapsed duration. Нулевой сдвиг относительно origin соответствующего presentation — no-op: сохраняются точные строки timestamps последнего committed item, request не создаётся, в том числе для исходного времени из второй части DST fold. Если consumer во время draft заменил timestamps лексически иными строками тех же instants, no-op не возвращает строки snapshot начала draft. Draft завершается с `onItemMoveDraftChange(null)`, чтобы потребитель освободил удерживаемый item. Drop agenda item на `agendaDate` не считается no-op, если эта дата отличается от даты начала item.

При старте draft пакет запоминает стабильный `item.id`, канонический interval и точный принятый `Calendar.timeZone`. Последующие committed props проверяются по следующим правилам:

- All-day intervals равны при одинаковых `kind`, `start` и `end` как date-only значениях.
- Timed intervals равны при одинаковых `kind`, start instant, наличии `end` и его instant, если он задан, а также наличии и точном принятом identifier `interval.timeZone`. Для optional `end`/`timeZone` значение `undefined` равнозначно отсутствию поля. Другой offset или число fractional digits в строке того же instant не являются изменением boundary. Отсутствующий `end` и явно заданный `end`, равный start, различаются, как и отсутствующая авторская timezone и явно заданная зона, даже если она сейчас совпадает с зоной календаря.
- Object identity, `title`, `calendarId` и `data` не входят в сравнение interval. Пересоздание item/interval с тем же каноническим содержимым не отменяет draft; `TItemData` не сравнивается и не клонируется глубоко.
- Если прежний ID исчез, соответствующий item исключён validation/duplicate-ID правилом или принятым source filter, draft отменяется с `moveItemUnavailableReason`. Смена `calendarId` сама по себе не отменяет draft, но переход в скрытый source применяет это правило. Изменение принятой `Calendar.timeZone` отменяет draft с `moveTimeZoneChangedReason`; изменение канонического interval всё ещё доступного item — с `moveItemChangedReason`.
- При совпадении перечисленных причин в одном commit blocking/contract state имеет приоритет и не создаёт отдельного cancellation announcement; иначе выбирается одна причина в порядке unavailable → Calendar timezone → interval. Отмена завершает опубликованный draft одним парным `onItemMoveDraftChange(null)` по lifecycle 5.3 и не возобновляет его при последующем возврате прежних props. Остальные правила отмены mode, capture и observed pending продолжают действовать независимо.

Пока канонический interval и зона календаря не изменились, preview и policy используют последний committed item с тем же ID. Перед подтверждением package заново строит proposal для текущего target из его актуального interval и повторно проверяет `canMoveItem` и `canDropItem` по правилам 5.4. Запрет не отправляет request: draft остаётся доступен для исправления/отмены. При разрешении `request.item` является последним committed item, включая актуальные `title`, `calendarId` и `data`; `request.previousInterval` — точный interval этого же item, а `request.proposedInterval` — проверенный proposal. Таким образом payload не подменяет metadata старой копией начала draft. Это обновление snapshot при неизменном каноническом interval, а не скрытый пересчёт переноса изменившегося события. Title snapshots для draft/no-op/request announcements определены в 12.4. Уже выпущенный request остаётся внешней операцией и последующими изменениями item или timezone не отменяется.

Термины gap/fold и варианты преобразования локального времени описаны в [документации `@internationalized/date`](https://react-spectrum.adobe.com/internationalized/date/CalendarDateTime.html); выбор gap-reject / fold-earlier выше является собственным контрактом календаря.

#### 5.3.2. Pending, подтверждение и отклонение

`onItemMoveRequest: (request: CalendarMoveRequest<TItemData>) => void` и `itemMoveStates: readonly CalendarMoveState[]` передаются вместе. Пустой массив означает отсутствие опубликованных move states (`isPending=false`), но не стирает issuer registry и не доказывает отсутствие уже выпущенного незавершённого request. Callback не является Promise API: ожидание и результаты передаются только через props.

- На подтверждение пакет создаёт новый криптографически случайный UUID v4 `requestId`, никогда намеренно не переиспользует ранее сгенерированное значение, вызывает callback ровно один раз и завершает drag/move preview. Практическая уникальность между экземплярами, React roots, вкладками, mount и перезагрузками является вероятностной гарантией UUID v4, а не абсолютной математической уникальностью. После этого расположение item определяется только текущими `items`, а не сохранённым proposed interval.
- Генерация ID — UUID v4 из криптографического источника случайности (`crypto.randomUUID()` либо эквивалент через `crypto.getRandomValues()`). Она выполняется только при создании request, не при import, render или SSR. Локальный counter, timestamp и `useId` сами по себе не являются допустимой реализацией этого контракта; UUID collision resistance не является механизмом авторизации серверной операции.
- Каждый выпущенный request потребитель обязан отразить последующим committed `pending`, `succeeded` или `rejected` с тем же `requestId` и `itemId`. Для async операции recommended flow — сначала опубликовать `pending`, при желании одновременно применив optimistic `items`; разрешено оставить старые `items` до ответа сервера. Первым опубликованным state может быть сразу terminal, в том числе при синхронном результате.
- `isPending` во всех item slots выводится только из принятого `itemMoveStates`. После выпуска request данный экземпляр блокирует новый перенос того же item по своему transient registry ещё до acknowledgement; любой экземпляр блокирует его после того, как увидел committed `pending` в общих props. Если в этот момент у экземпляра ещё открыт draft того же item, он отменяется и ранее уведомлённая identity `onItemMoveDraftChange` один раз получает парный `null`; submit второго request после observed pending невозможен. Другие items не блокируются.
- Это локальная защита, а не межэкземплярный lock: два Calendar могут выпустить разные request для одного item до того, как любой из них увидит общий committed `pending`. Такие request с разными IDs можно одновременно представить как `pending`; все они блокируют следующий move этого item. Consumer/server атомарно арбитрирует коллизию по `requestId`: не более одного request может успешно изменить item, остальные получают terminal `rejected`. Пакет не выбирает победителя и не применяет proposal самостоятельно.
- При успехе потребитель передаёт подтверждённые, при необходимости нормализованные сервером `items` и `succeeded` в одном update. При отказе он передаёт актуальные/откаченные им `items` и `rejected` с пользовательским `reason` в одном update. Пакет сам не восстанавливает старый snapshot поверх более новых данных.
- Неизменившиеся `items`, истечение времени или отсутствие ответного state не считаются отказом. До первого matching committed `pending`, `succeeded` или `rejected` request остаётся unacknowledged, а локальная issuer-блокировка сохраняется. Пакет не ставит timeout, не создаёт terminal state и не выдаёт warning только из-за длительности или отсутствия acknowledgement, включая unrelated commits и unmount. Это не снимает с consumer обязанность опубликовать ответ; runtime диагностика ограничена наблюдаемыми невалидными records/transitions из следующих пунктов. Поздний корректный acknowledgement принимается по тем же правилам, что немедленный.
- Terminal state должен присутствовать как минимум в одном committed render, затем потребитель может убрать запись. Экземпляр хранит только transient registry выпущенных им request IDs для acknowledgement/announcements и объявляет каждый результат один раз. При новом mount registry пуст: ранее сохранённый request считается внешним, даже если `itemId` совпадает. Внешний `pending` может блокировать item, но не создаёт announcement от другого экземпляра.
- Потребитель связывает сетевые ответы с `requestId` и не применяет устаревший ответ к более новой операции. При unmount пакет прекращает свои UI announcements, но не отменяет внешнюю доменную операцию.
- `requestId` уникален в `itemMoveStates`. Несколько `pending` с одним `itemId` и разными request IDs допустимы только как представление уже возникшей межэкземплярной коллизии; `isPending` остаётся истинным, пока присутствует хотя бы одна такая запись. Записи с пустыми IDs, повторяющимся `requestId`, неизвестным status, несовпадающим `itemId` для выпущенного данным экземпляром request или пустым `rejected.reason` игнорируются с development warning.
- Удаление пары `onItemMoveRequest` / `itemMoveStates` во время mount отключает move, отменяет текущий draft и один раз вызывает `onItemMoveDraftChange(null)`, если draft был опубликован. Повторное включение принимает только актуальные props и не восстанавливает прежний draft.

Lifecycle каждой операции consumer задаёт как `absent → pending → succeeded|rejected → absent` либо `absent → succeeded|rejected → absent` без промежуточного `pending`. Повторные committed snapshots одной фазы допустимы; после первого terminal его status, `itemId` и reason неизменны. Возврат terminal → pending, смена одного terminal другим, удаление pending до terminal и повторное использование удалённого `requestId` запрещены consumer contract. Новая операция всегда имеет новый request ID. Для выпущенных данным mount requests registry сохраняет terminal/tombstone до unmount: запись с обнаруженным недопустимым переходом после terminal исключается из принятого move-state с development warning, не возобновляет `isPending` и не повторяет announcement. Преждевременное удаление pending также даёт warning: `isPending` не выдумывается без записи в props, но локальная блокировка issuer остаётся до корректного terminal, как для request без acknowledgement. Для внешних IDs пакет не строит глобальный журнал: использует текущие валидные props для блокировки, не объявляет чужие результаты; проверку истории shared store обеспечивает consumer. Unmount/remount не даёт права переиспользовать request ID.

### 5.4. Interaction policy

```ts
export type PolicyResult =
  | true
  | {
      allowed: false;
      reason: string;
    };
```

```tsx
<Calendar
  interactionPolicy={{
    canSelectDate,
    canSelectRange,
    canMoveItem,
    canDropItem,
  }}
/>
```

Policy callbacks синхронны, чтобы pointer и keyboard interactions получали решение без задержки. Причина запрета показывается визуально и объявляется через live region.

`reason` должен быть непустым после `trim`. Пустая причина не превращает запрет в разрешение: пакет использует локализованное сообщение «Действие недоступно» и выдаёт development warning. Policy callbacks должны быть pure относительно переданных аргументов и не используются как notification о пользовательском действии.

Policy выбора ограничивает только selection/create, но не просмотр даты, agenda или keyboard focus: нельзя скрывать существующие события на недоступной для создания дате. Для диапазона `canSelectDate` проверяет только включённые дни `start ≤ date < end`, затем вызывается `canSelectRange`; exclusive `end` не проверяется как выбранная дата. Обход запрещённого дня внутри диапазона не допускается. `canDropItem` получает уже рассчитанный proposed interval; core validation/DST запрет нельзя отменить policy.

Серверная проверка выполняется потребителем после request. Для move отказ выражается через `itemMoveStates` по разделу 5.3.2; доменную ошибку показывает потребитель, а календарь объявляет переданный reason.

### 5.5. Item actions

Редактирование и удаление не зашиваются в generic core.

```tsx
<Calendar
  getItemActions={item => [
    {id: 'open', label: 'Открыть'},
    {id: 'complete', label: 'Завершить'},
    {id: 'delete', label: 'Удалить', tone: 'danger'},
  ]}
  onItemActionRequest={({item, actionId}) => {}}
/>
```

Один набор действий используется в `DayAgenda`, его desktop keyboard menu и mobile bottom sheet. Month grid не создаёт action buttons или дополнительные focus targets внутри visual chips/bars; hover может менять только пассивное оформление. Путь к actions из grid — открыть agenda соответствующей даты.

`onItemPress` задаёт primary activation независимо от actions. В Month grid pointer/touch activation visual chip/bar вызывает его с hit-tested датой; в `DayAgenda` primary item button вызывает его с agenda date. Callback вызывается один раз только после завершённой activation, не после начавшегося drag/long-press, action trigger или отменённого pointer. Без callback agenda row остаётся читаемой, а activation month visual эквивалентна activation находящейся под ним date cell и открывает `DayAgenda`, не создавая недоступный mouse-only action.

`getItemActions` и `onItemActionRequest` передаются только вместе. `id` действия должен быть непустым и уникальным в пределах item, `label` — непустым после `trim`; невалидные действия исключаются с development warning. Видимость trigger определяется объединённым committed набором: валидные consumer actions плюс встроенная команда переноса, если она доступна по move-контракту. Пустой consumer array или удаление пары скрывает только consumer actions; trigger исчезает лишь при пустом итоговом наборе. Если итоговый набор уже открытого item menu/sheet стал пустым, поверхность закрывается и применяет focus recovery 12.3; недостижимая пустая action surface не остаётся открытой. Callback получает consumer action из последнего committed набора и вызывается не более одного раза на activation; встроенный move не вызывает `onItemActionRequest`.

Действия над occurrence/series будут частью recurrence API, а не generic action contract `0.2`.

### 5.6. Sources и фильтрация

```tsx
<Calendar
  sources={sources}
  visibleSourceIds={['work', 'personal']}
  onVisibleSourceIdsChange={setVisibleSourceIds}
/>
```

- встроенный selector отображается по умолчанию, если после validation осталось несколько sources и переданы controlled `visibleSourceIds` вместе с `onVisibleSourceIdsChange`;
- desktop selector использует menu/popover;
- mobile selector использует bottom sheet;
- встроенный selector можно скрыть и заменить внешним;
- перемещение item сохраняет `calendarId`;
- смена source — отдельная доменная операция приложения.

Массив `visibleSourceIds` используется вместо `Set`, чтобы controlled state оставался сериализуемым.

Каждый source-control показывает состояние только из принятого `visibleSourceIds`, без optimistic toggle. На desktop это `menuitemcheckbox` с `aria-checked="true|false"`; на mobile — именованный checkbox/toggle control с эквивалентным checked state внутри sheet. Его accessible action name использует `hideSourceLabel(source.title)` для принятого видимого source и `showSourceLabel(source.title)` для скрытого. До принятия callback-результата checked state и label остаются прежними; отклонение или более позднее внешнее значение не имитируют успешное переключение.

Если controlled filter props не переданы, видны все sources, а встроенный selector скрыт. `visibleSourceIds` и `onVisibleSourceIdsChange` должны передаваться вместе.

Нормативная ссылочная семантика:

- source `id` и `title` должны быть непустыми после `trim`, IDs уникальны; все записи с повторяющимся ID исключаются, а ссылающиеся на них items обрабатываются как имеющие неизвестный source;
- item без `calendarId` всегда виден и получает default appearance;
- без controlled filter-пары видны все валидные items; при включённой паре item с известным `calendarId` виден тогда и только тогда, когда ID входит в `visibleSourceIds`; filtering применяется и при скрытом встроенном selector;
- item с неизвестным `calendarId` остаётся видимым с fallback appearance и development warning, чтобы ошибка связи не приводила к тихой потере данных;
- неизвестные и повторяющиеся значения входного `visibleSourceIds` игнорируются. Callback возвращает уникальные известные IDs в порядке `sources`, а не в порядке нажатий; если итоговый набор не изменился, callback не вызывается;
- удаление controlled filter-пары немедленно показывает все sources и скрывает selector; повторное добавление принимает только текущий массив prop. Эти переходы сами по себе callback не вызывают;
- если после committed update валидных sources стало меньше двух, открытый встроенный selector закрывается, trigger скрывается и focus восстанавливается по разделу 12.3.

Фильтрация controlled: activation selector отправляет один нормализованный следующий массив, но grid, agenda, count, empty-state и доступность actions меняются только после принятия новых props. Принятый filter исключает скрытые items из всех этих поверхностей. Если он скрывает item активного move draft, draft отменяется и `onItemMoveDraftChange(null)` вызывается один раз; уже выпущенный внешний pending request не отменяется.

### 5.7. Нормативный публичный TypeScript API

Этот раздел — единственный нормативный источник public declarations `0.2`. Типы в тематических разделах являются сокращёнными выдержками и обязаны совпадать с ним. Все входные массивы рассматриваются как immutable; пакет их не изменяет.

```ts
import type {CSSProperties, ReactElement, ReactNode} from 'react';

export type ISODate = string;
export type RFC3339DateTime = string;
export type IanaTimeZone = string;

export type CalendarInterval =
  | {
      kind: 'allDay';
      start: ISODate;
      end: ISODate;
    }
  | {
      kind: 'timed';
      start: RFC3339DateTime;
      end?: RFC3339DateTime;
      timeZone?: IanaTimeZone;
    };

export type CalendarItem<TItemData = unknown> = {
  id: string;
  title: string;
  calendarId?: string;
  interval: CalendarInterval;
  data: TItemData;
};

export type CalendarSource<TSourceData = unknown> = {
  id: string;
  title: string;
  color?: string;
  data?: TSourceData;
};

export type CalendarDateRange = {
  start: ISODate;
  end: ISODate;
};

export type CalendarVisibleRange = CalendarDateRange & {
  timeZone: IanaTimeZone;
};

export type CalendarWeekday =
  | 'monday'
  | 'tuesday'
  | 'wednesday'
  | 'thursday'
  | 'friday'
  | 'saturday'
  | 'sunday';

export type CalendarVisibleRangeOptions = {
  anchorDate: ISODate;
  timeZone: IanaTimeZone;
  locale?: string;
  firstDayOfWeek?: CalendarWeekday;
};

export function getCalendarVisibleRange(
  options: CalendarVisibleRangeOptions,
): CalendarVisibleRange;

export type CalendarMoveInput = 'pointer' | 'touch' | 'keyboard';

export type CalendarMoveProposal<TItemData = unknown> = {
  item: CalendarItem<TItemData>;
  previousInterval: CalendarInterval;
  proposedInterval: CalendarInterval;
  input: CalendarMoveInput;
};

export type CalendarMoveRequest<TItemData = unknown> =
  CalendarMoveProposal<TItemData> & {
    requestId: string;
  };

export type CalendarMoveState = {
  requestId: string;
  itemId: string;
} & (
  | {status: 'pending'}
  | {status: 'succeeded'}
  | {status: 'rejected'; reason: string}
);

export type PolicyResult =
  | true
  | {
      allowed: false;
      reason: string;
    };

export type CalendarInteractionPolicy<TItemData = unknown> = {
  canSelectDate?: (date: ISODate) => PolicyResult;
  canSelectRange?: (range: CalendarDateRange) => PolicyResult;
  canMoveItem?: (item: CalendarItem<TItemData>) => PolicyResult;
  canDropItem?: (
    proposal: CalendarMoveProposal<TItemData>,
  ) => PolicyResult;
};

export type CalendarItemAction = {
  id: string;
  label: string;
  tone?: 'default' | 'danger';
};

export type CalendarItemActionRequest<TItemData = unknown> = {
  item: CalendarItem<TItemData>;
  actionId: string;
};

export type CalendarItemPressRequest<TItemData = unknown> = {
  item: CalendarItem<TItemData>;
  date: ISODate;
} & (
  | {
      view: 'month';
      segmentRange: CalendarDateRange;
    }
  | {
      view: 'agenda';
      segmentRange?: never;
    }
);

export type CalendarItemAppearance = {
  accentColor?: string;
  backgroundColor?: string;
  textColor?: string;
};

export type CalendarItemAppearanceContext<TSourceData = unknown> = {
  timeZone: IanaTimeZone;
  source?: CalendarSource<TSourceData>;
};

export type CalendarSortContext = {
  timeZone: IanaTimeZone;
};

export type CalendarDataState =
  | {status: 'ready'}
  | {status: 'loading'; phase: 'initial' | 'refresh'}
  | {
      status: 'error';
      phase: 'initial' | 'refresh';
      error: unknown;
    };

export type CalendarLayout = 'auto' | 'desktop' | 'mobile';
export type CalendarResolvedLayout = Exclude<CalendarLayout, 'auto'>;
export type CalendarDensity = 'compact' | 'comfortable';
export type CalendarColorScheme = 'system' | 'light' | 'dark';
export type CalendarDirection = 'ltr' | 'rtl';
export type CalendarHourCycle = 12 | 24;
export type CalendarAgendaPresentation = 'auto' | 'overlay';
export type CalendarResolvedAgendaPresentation =
  | 'inline'
  | 'popover'
  | 'sheet';
export type CalendarItemView = 'month' | 'agenda';

declare const calendarThemeBrand: unique symbol;

export type CalendarTheme = Readonly<{
  name: string;
  [calendarThemeBrand]: true;
}>;

export type CalendarThemeTokens = Readonly<{
  color?: Readonly<{
    surface?: string;
    text?: string;
    muted?: string;
    border?: string;
    accent?: string;
    danger?: string;
    focus?: string;
  }>;
  typography?: Readonly<{
    fontFamily?: string;
    fontSize?: string;
    fontWeight?: string;
    lineHeight?: string;
  }>;
  spacing?: Readonly<{
    xs?: string;
    sm?: string;
    md?: string;
    lg?: string;
  }>;
  density?: Readonly<{
    dayMinHeight?: string;
    itemHeight?: string;
    gap?: string;
  }>;
  radii?: Readonly<{
    sm?: string;
    md?: string;
    lg?: string;
  }>;
  shadows?: Readonly<{
    overlay?: string;
  }>;
  motion?: Readonly<{
    duration?: string;
    easing?: string;
  }>;
  components?: Readonly<{
    itemBackground?: string;
    itemText?: string;
    selectedDayBackground?: string;
  }>;
}>;

export type CalendarCSSVariable =
  | '--nelmad-calendar-color-surface'
  | '--nelmad-calendar-color-text'
  | '--nelmad-calendar-color-muted'
  | '--nelmad-calendar-color-border'
  | '--nelmad-calendar-color-accent'
  | '--nelmad-calendar-color-danger'
  | '--nelmad-calendar-color-focus'
  | '--nelmad-calendar-typography-font-family'
  | '--nelmad-calendar-typography-font-size'
  | '--nelmad-calendar-typography-font-weight'
  | '--nelmad-calendar-typography-line-height'
  | '--nelmad-calendar-spacing-xs'
  | '--nelmad-calendar-spacing-sm'
  | '--nelmad-calendar-spacing-md'
  | '--nelmad-calendar-spacing-lg'
  | '--nelmad-calendar-density-day-min-height'
  | '--nelmad-calendar-density-item-height'
  | '--nelmad-calendar-density-gap'
  | '--nelmad-calendar-radii-sm'
  | '--nelmad-calendar-radii-md'
  | '--nelmad-calendar-radii-lg'
  | '--nelmad-calendar-shadows-overlay'
  | '--nelmad-calendar-motion-duration'
  | '--nelmad-calendar-motion-easing'
  | '--nelmad-calendar-components-item-background'
  | '--nelmad-calendar-components-item-text'
  | '--nelmad-calendar-components-selected-day-background';

export const classicTheme: CalendarTheme;
export const neutralTheme: CalendarTheme;

export type CalendarMessages = {
  calendarLabel: string;
  previousMonthLabel: string;
  nextMonthLabel: string;
  todayLabel: string;
  untitledItemLabel: string;
  sourceSelectorLabel: string;
  showSourceLabel: (sourceTitle: string) => string;
  hideSourceLabel: (sourceTitle: string) => string;
  openAgendaLabel: (date: ISODate) => string;
  closeAgendaLabel: string;
  agendaHeading: (date: ISODate) => string;
  agendaEmpty: string;
  itemActionsLabel: (itemTitle: string) => string;
  itemCountLabel: (date: ISODate, count: number) => string;
  moreItemsLabel: (date: ISODate, count: number) => string;
  todayStateLabel: string;
  selectedStateLabel: string;
  viewedDateStateLabel: string;
  unavailableStateLabel: string;
  pendingStateLabel: string;
  selectDateLabel: string;
  selectRangeLabel: string;
  confirmSelectionLabel: string;
  clearSelectionLabel: string;
  createLabel: string;
  moveItemLabel: string;
  confirmMoveLabel: string;
  cancelLabel: string;
  retryLabel: string;
  loadingLabel: string;
  refreshingLabel: string;
  emptyLabel: string;
  errorLabel: string;
  invalidConfigurationLabel: string;
  genericBlockedReason: string;
  navigationBoundaryReason: string;
  selectionBoundaryReason: string;
  moveDstGapReason: (date: ISODate, localTime: string) => string;
  moveBoundaryReason: string;
  moveItemChangedReason: string;
  moveTimeZoneChangedReason: string;
  moveItemUnavailableReason: string;
  gridInstructions: string;
  rangeSelectionInstructions: string;
  moveInstructions: string;
  blockedAnnouncement: (reason: string) => string;
  monthChangedAnnouncement: (monthStart: ISODate) => string;
  agendaUpdatedAnnouncement: (date: ISODate, count: number) => string;
  refreshCompletedAnnouncement: string;
  selectionStartedAnnouncement: (date: ISODate) => string;
  selectionTargetAnnouncement: (
    range: CalendarDateRange,
    isAllowed: boolean,
  ) => string;
  selectionCancelledAnnouncement: string;
  selectionCompletedAnnouncement: (
    range: CalendarDateRange,
  ) => string;
  selectionClearedAnnouncement: string;
  moveStartedAnnouncement: (itemTitle: string) => string;
  moveNavigationPendingLabel: (
    itemTitle: string,
    monthStart: ISODate,
  ) => string;
  moveTargetAnnouncement: (
    itemTitle: string,
    date: ISODate,
    isAllowed: boolean,
    utcOffset?: string,
  ) => string;
  moveCancelledAnnouncement: (
    itemTitle: string,
    reason?: string,
  ) => string;
  moveNoopAnnouncement: (itemTitle: string) => string;
  movePendingAnnouncement: (itemTitle: string) => string;
  moveSucceededAnnouncement: (itemTitle: string) => string;
  moveRejectedAnnouncement: (
    itemTitle: string,
    reason: string,
  ) => string;
};

export type CalendarRootState = {
  layout: CalendarResolvedLayout;
  density: CalendarDensity;
  colorScheme: CalendarColorScheme;
  dir: CalendarDirection;
} & (
  | {kind: 'data'; dataState: CalendarDataState}
  | {
      kind: 'contract';
      dataState: {status: 'error'; phase: 'initial'; error: Error};
    }
);

export type CalendarDayState = {
  date: ISODate;
  isToday: boolean;
  isAgendaDate: boolean;
  isSelected: boolean;
  isSelectionDraft: boolean;
  isOutsideMonth: boolean;
  isSelectionUnavailable: boolean;
  unavailableReason?: string;
  itemCount: number;
};

export type CalendarItemSlotContext<
  TItemData = unknown,
  TSourceData = unknown,
> = {
  item: CalendarItem<TItemData>;
  source?: CalendarSource<TSourceData>;
  isSelected: boolean;
  isDragging: boolean;
  isPending: boolean;
  isDisabled: boolean;
} & (
  | {
      view: 'month';
      segmentRange: CalendarDateRange;
      date?: never;
    }
  | {
      view: 'agenda';
      date: ISODate;
      segmentRange?: never;
    }
);

export type CalendarMonthItemSlotContext<
  TItemData = unknown,
  TSourceData = unknown,
> = Extract<
  CalendarItemSlotContext<TItemData, TSourceData>,
  {view: 'month'}
>;

export type CalendarAgendaItemSlotContext<
  TItemData = unknown,
  TSourceData = unknown,
> = Extract<
  CalendarItemSlotContext<TItemData, TSourceData>,
  {view: 'agenda'}
>;

export type CalendarAgendaState = {
  date: ISODate;
  presentation: CalendarResolvedAgendaPresentation;
  itemCount: number;
};

export type CalendarOverflowState = CalendarDayState & {
  hiddenItemCount: number;
};

export type CalendarToolbarSlotContext = Extract<
  CalendarRootState,
  {kind: 'data'}
> & {
  anchorDate: ISODate;
  visibleRange: CalendarVisibleRange;
};

export type CalendarLoadingSlotContext = {
  state: Extract<CalendarDataState, {status: 'loading'}>;
  visibleRange: CalendarVisibleRange;
};

export type CalendarEmptySlotContext = {
  visibleRange: CalendarVisibleRange;
};

export type CalendarErrorSlotContext =
  | {
      kind: 'data';
      state: Extract<CalendarDataState, {status: 'error'}>;
      visibleRange: CalendarVisibleRange;
      hasStaleItems: boolean;
    }
  | {
      kind: 'contract';
      error: Error;
      hasStaleItems: false;
      visibleRange?: never;
    };

export type CalendarClassName<TState> =
  | string
  | ((state: TState) => string | undefined);

export type CalendarClassNames<
  TItemData = unknown,
  TSourceData = unknown,
> = {
  root?: CalendarClassName<CalendarRootState>;
  toolbar?: CalendarClassName<CalendarToolbarSlotContext>;
  sourceSelector?: CalendarClassName<
    Extract<CalendarRootState, {kind: 'data'}>
  >;
  grid?: CalendarClassName<
    Extract<CalendarRootState, {kind: 'data'}>
  >;
  weekdayHeader?: CalendarClassName<
    Extract<CalendarRootState, {kind: 'data'}>
  >;
  day?: CalendarClassName<CalendarDayState>;
  dayHeader?: CalendarClassName<CalendarDayState>;
  item?: CalendarClassName<
    CalendarMonthItemSlotContext<TItemData, TSourceData>
  >;
  itemActions?: CalendarClassName<
    CalendarAgendaItemSlotContext<TItemData, TSourceData>
  >;
  overflowIndicator?: CalendarClassName<CalendarOverflowState>;
  agenda?: CalendarClassName<CalendarAgendaState>;
  agendaItem?: CalendarClassName<
    CalendarAgendaItemSlotContext<TItemData, TSourceData>
  >;
  status?: CalendarClassName<CalendarRootState>;
};

export type CalendarDataAttribute =
  | 'data-theme'
  | 'data-layout'
  | 'data-density'
  | 'data-color-scheme'
  | 'data-dir'
  | 'data-status'
  | 'data-loading-phase'
  | 'data-date'
  | 'data-today'
  | 'data-agenda-date'
  | 'data-selected'
  | 'data-selection-draft'
  | 'data-selection-unavailable'
  | 'data-outside-month'
  | 'data-has-items'
  | 'data-item-id'
  | 'data-view'
  | 'data-dragging'
  | 'data-pending'
  | 'data-presentation';

export type CalendarAgendaControlProps =
  | {
      agendaDate: ISODate;
      onAgendaDateChange: (date: ISODate) => void;
    }
  | {
      agendaDate?: never;
      onAgendaDateChange?: never;
    };

export type CalendarSelectionControlProps =
  | {
      selection: CalendarDateRange | null;
      onSelectionChange: (
        selection: CalendarDateRange | null,
      ) => void;
      onCreateRequest?: (selection: CalendarDateRange) => void;
    }
  | {
      selection?: never;
      onSelectionChange?: never;
      onCreateRequest?: never;
    };

export type CalendarSourceFilterControlProps<
  TSourceData = unknown,
> =
  | {
      sources?: readonly CalendarSource<TSourceData>[];
      visibleSourceIds?: never;
      onVisibleSourceIdsChange?: never;
      showSourceSelector?: never;
    }
  | {
      sources: readonly CalendarSource<TSourceData>[];
      visibleSourceIds: readonly string[];
      onVisibleSourceIdsChange: (
        visibleSourceIds: readonly string[],
      ) => void;
      showSourceSelector?: boolean;
    };

export type CalendarMoveControlProps<TItemData = unknown> =
  | {
      itemMoveStates: readonly CalendarMoveState[];
      onItemMoveRequest: (
        request: CalendarMoveRequest<TItemData>,
      ) => void;
      onItemMoveDraftChange?: (itemId: string | null) => void;
    }
  | {
      itemMoveStates?: never;
      onItemMoveRequest?: never;
      onItemMoveDraftChange?: never;
    };

export type CalendarItemActionsProps<TItemData = unknown> =
  | {
      getItemActions: (
        item: CalendarItem<TItemData>,
      ) => readonly CalendarItemAction[];
      onItemActionRequest: (
        request: CalendarItemActionRequest<TItemData>,
      ) => void;
    }
  | {
      getItemActions?: never;
      onItemActionRequest?: never;
    };

export type CalendarBaseProps<
  TItemData = unknown,
  TSourceData = unknown,
> = {
  items: readonly CalendarItem<TItemData>[];

  anchorDate: ISODate;
  onNavigate: (anchorDate: ISODate) => void;
  onVisibleRangeChange?: (range: CalendarVisibleRange) => void;

  timeZone: IanaTimeZone;
  today?: ISODate;
  locale?: string;
  firstDayOfWeek?: CalendarWeekday;
  hourCycle?: CalendarHourCycle;
  dir?: CalendarDirection;

  layout?: CalendarLayout;
  mobileBreakpoint?: number;
  agendaPresentation?: CalendarAgendaPresentation;

  dataState?: CalendarDataState;
  onRetryRequest?: () => void;

  interactionPolicy?: CalendarInteractionPolicy<TItemData>;
  onItemPress?: (
    request: CalendarItemPressRequest<TItemData>,
  ) => void;
  getItemAppearance?: (
    item: CalendarItem<TItemData>,
    context: CalendarItemAppearanceContext<TSourceData>,
  ) => CalendarItemAppearance | undefined;
  sortItems?: (
    a: CalendarItem<TItemData>,
    b: CalendarItem<TItemData>,
    context: CalendarSortContext,
  ) => number;

  theme?: CalendarTheme;
  density?: CalendarDensity;
  colorScheme?: CalendarColorScheme;
  tokens?: CalendarThemeTokens;
  messagesLocale?: string;
  messages?: Partial<CalendarMessages>;

  renderItem?: (
    context: CalendarMonthItemSlotContext<TItemData, TSourceData>,
  ) => ReactNode;
  renderAgendaItem?: (
    context: CalendarAgendaItemSlotContext<TItemData, TSourceData>,
  ) => ReactNode;
  renderDayHeader?: (context: CalendarDayState) => ReactNode;
  renderToolbarContent?: (
    context: CalendarToolbarSlotContext,
  ) => ReactNode;
  renderLoading?: (
    context: CalendarLoadingSlotContext,
  ) => ReactNode;
  renderEmpty?: (context: CalendarEmptySlotContext) => ReactNode;
  renderError?: (context: CalendarErrorSlotContext) => ReactNode;

  className?: string;
  classNames?: CalendarClassNames<TItemData, TSourceData>;
  style?: CSSProperties & Partial<Record<CalendarCSSVariable, string>>;
  id?: string;
  'aria-label'?: string;
  'aria-labelledby'?: string;
  portalContainer?: Element | DocumentFragment | null;
};

export type CalendarProps<
  TItemData = unknown,
  TSourceData = unknown,
> = CalendarBaseProps<TItemData, TSourceData> &
  CalendarAgendaControlProps &
  CalendarSelectionControlProps &
  CalendarSourceFilterControlProps<TSourceData> &
  CalendarMoveControlProps<TItemData> &
  CalendarItemActionsProps<TItemData>;

export declare function Calendar<
  TItemData = unknown,
  TSourceData = unknown,
>(
  props: CalendarProps<TItemData, TSourceData>,
): ReactElement;
```

Defaults: `classicTheme`, `compact`, `colorScheme="system"`, `ru-RU`, `layout="auto"`, `mobileBreakpoint={640}`, `agendaPresentation="auto"` и `{status: 'ready'}`. Положительный finite `mobileBreakpoint` измеряется в CSS px. Automatic agenda presentation означает popover на desktop и inline agenda на mobile; явный `overlay` означает popover на desktop и modal sheet на mobile.

При `CalendarRootState.kind='data'` поля `CalendarRootState.colorScheme` и `data-color-scheme` содержат запрошенное `system|light|dark`, не вычисленный OS mode. В `kind='contract'` действует фиксированный safe-shell `system` раздела 4.3.2. `system` разрешается только CSS media query, поэтому server/client DOM не расходятся; forced-colors имеет приоритет над декоративной palette независимо от этого prop.

Accessible name Calendar root выбирается в порядке valid `aria-labelledby` → `aria-label` → `CalendarMessages.calendarLabel`. Непустой `aria-labelledby` разбирается как список IDREF: после commit учитываются только targets, которые существуют, connected и имеют тот же `getRootNode()`/tree scope, что и Calendar root; references через границу `Document`/`ShadowRoot`, отсутствующие targets и targets без непустого accessible-name contribution исключаются с development warning. Если valid target не осталось, attribute отсутствует и используется следующий fallback; смешанный список сохраняет только valid IDs в исходном порядке. Передача обоих ARIA props допустима: package всегда выводит непустой `aria-label` либо catalog fallback как резерв, но после validation хотя бы один valid `aria-labelledby` получает стандартный приоритет. SSR и первый client render не выполняют DOM lookup и потому не выводят ещё не проверенный `aria-labelledby`: оба одинаково используют резервный `aria-label`. Первая post-hydration validation добавляет только очищенный same-tree IDREF list; изменение prop/tree scope или connectivity/name contribution target повторно проходит ту же проверку. Это post-commit уточнение не вызывает callback, focus move, announcement или hydration mismatch, а root остаётся именованным до, во время и после него. Month grid отдельно получает имя от видимого month heading и description с `gridInstructions`.

`CalendarTheme` намеренно opaque: в `0.2` потребитель выбирает один из двух presets и применяет `tokens` либо документированные scoped CSS variables по нормативной mapping/precedence раздела 10.3. Для package portal client-side mirror копирует только resolved values этих публичных variables и описанные inherited font properties; произвольный другой computed CSS Calendar root не копируется. Checkpoints и SSR-ограничения заданы в 10.3.4. Все package-owned строки берутся из полного `CalendarMessages`; `messagesLocale` задаёт язык catalog/overrides и по умолчанию равен resolved date locale, а `messages` является partial override поверх fallback раздела 11.2.

`renderItem` и соответствующий month class callback вызываются для каждого visual segment; `renderAgendaItem`/agenda class callback — один раз на item этой agenda date. В month context `segmentRange` — clipped полуоткрытый диапазон одного непрерывного segment внутри недели/grid. `CalendarItemSlotContext.isSelected` означает пересечение segment с принятой selection; в agenda context `date` всегда равна текущей agenda date и `isSelected` относится к ней. Для `CalendarItemPressRequest` month `date` — фактически hit-tested cell внутри `segmentRange`, agenda `date` — agenda date. Appearance разрешается на item целиком и потому намеренно не получает segment/date. `isDisabled` означает отсутствие доступной primary/action/move операции для данного представления, но не скрывает item из agenda. Passive-content ограничение `ReactNode` невозможно выразить типом, поэтому правила 10.4 остаются нормативными.

Перечисленные `data-*` — полный стабильный styling/testing contract `0.2`: boolean state имеет значение `"true"`, когда активен, и отсутствует иначе; enum получает literal соответствующего union. Таблица разрешает корректные props при `kind='data'`. Для `kind='contract'` приоритет имеет 4.3.2: root всегда `data-theme="classic"`, `data-layout="mobile"`, `data-density="compact"`, `data-color-scheme="system"`, `data-status="error"`, без `data-loading-phase`, с fallback `data-dir`; portals и view attributes отсутствуют. Нормативное размещение и значения:

| Attribute | Обязательный package-owned element | Значение / presence |
| --- | --- | --- |
| `data-theme` | Calendar root и каждый смонтированный portal theme root этого Calendar | `"classic"` для `classicTheme`, `"neutral"` для `neutralTheme` |
| `data-layout` | Calendar root | resolved `"mobile"` или `"desktop"` |
| `data-density` | Calendar root и каждый смонтированный portal theme root | `"compact"` или `"comfortable"` |
| `data-color-scheme` | Calendar root и каждый смонтированный portal theme root | запрошенное `"system"`, `"light"` или `"dark"` |
| `data-dir` | Calendar root и каждый смонтированный portal theme root | resolved `"ltr"` или `"rtl"` |
| `data-status` | Calendar root | `"ready"`, `"loading"` или `"error"`; contract error также использует `"error"` |
| `data-loading-phase` | Calendar root | `"initial"` или `"refresh"` только при `data-status="loading"`, иначе отсутствует |
| `data-date` | каждый date `gridcell` и корень `DayAgenda` | ISO date соответствующей cell либо agenda |
| `data-today` | date `gridcell` | `"true"`, только если его дата равна известному today |
| `data-agenda-date` | date `gridcell` | `"true"`, только если его дата равна принятой/uncontrolled agenda date |
| `data-selected` | date `gridcell` и каждый month/agenda item wrapper | `"true"` по принятой selection и соответствующему `CalendarDayState.isSelected` / `CalendarItemSlotContext.isSelected` |
| `data-selection-draft` | date `gridcell` | `"true"`, если дата входит в текущий selection draft |
| `data-selection-unavailable` | date `gridcell` | `"true"` по `CalendarDayState.isSelectionUnavailable` |
| `data-outside-month` | date `gridcell` | `"true"` по `CalendarDayState.isOutsideMonth` |
| `data-has-items` | date `gridcell` | `"true"`, если `itemCount > 0` после validation/filter |
| `data-item-id` | каждый visual segment wrapper Month View и каждый agenda item wrapper | точный `CalendarItem.id` |
| `data-view` | те же item wrappers | `"month"` или `"agenda"` |
| `data-dragging` | те же item wrappers | `"true"` по `CalendarItemSlotContext.isDragging` |
| `data-pending` | те же item wrappers | `"true"` по `CalendarItemSlotContext.isPending` |
| `data-presentation` | корень `DayAgenda` | resolved `"inline"`, `"popover"` или `"sheet"` |

Атрибуты не дублируются на иных внутренних wrappers; исключение — явно перечисленные portal theme roots. `classicTheme.name` равен `"classic"`, `neutralTheme.name` — `"neutral"`. Иные внутренние classes, DOM structure вне ARIA-контракта и attributes не являются public API.

Root value exports — только `Calendar`, `getCalendarVisibleRange`, `classicTheme`, `neutralTheme`. Все объявленные выше types экспортируются из `@nelmad/calendar`. `DayAgenda` является встроенной presentation `Calendar`, не отдельным root component. Единственный public asset subpath — `@nelmad/calendar/styles.css`; private imports запрещены.

Все перечисленные API становятся stable с `0.2.0`. Prerelease может внести документированный breaking change, но patch-релизы `0.2.x` не удаляют stable export, не делают optional prop обязательным, не меняют callback payload/семантику или CSS/data-attribute contract. Экспериментальная поверхность, если появится, имеет префикс `unstable_`, не используется обязательными примерами и не входит в это обещание.

`render*`, `classNames` functions, function-valued поля `CalendarMessages`, `getItemAppearance`, `getItemActions`, `sortItems` и policy callbacks — pure resolvers: React может вызвать или replay их несколько раз, поэтому side effects в них являются consumer bug. Только `onNavigate`, `on*Request`, `on*Change`, `onRetryRequest` и `onItemPress` являются effectful notifications; пакет не вызывает их во время render/SSR и соблюдает описанную once-per-semantic-action дедупликацию в StrictMode.

## 6. Month View

### 6.1. Desktop

- классическая сетка из семи колонок;
- каждый all-day item отображается bar; однодневный полуинтервал занимает bar в одной ячейке, multi-day — продолжение bar через несколько ячеек;
- timed item, занимающий ровно одну локальную дату по правилам проекции раздела 4.1, отображается chip, включая moment без `end` и interval с одинаковыми start/end instants;
- timed item, занимающий несколько локальных дат, отображается bar через соответствующие ячейки;
- события соседних месяцев корректно отображаются в видимом grid range;
- число строк зависит от месяца;
- layout детерминирован и не меняет порядок между renders при одинаковых входных данных.

### 6.2. Порядок items

Порядок по умолчанию:

1. все all-day items: по `interval.start` как ISO date по возрастанию, затем большая календарная длительность раньше меньшей;
2. timed items, занимающие больше одной локальной даты: по start instant, затем большее число занимаемых дат раньше меньшего;
3. остальные timed items, включая moments: по start instant;
4. окончательный tie-breaker во всех группах — `id` по Unicode code units, независимо от locale.

Потребитель может передать `sortItems(a, b, context)`. Comparator полностью заменяет пункты 1–3 глобальным порядком принятых items; при результате `0` пакет всё равно применяет tie-breaker по `id`. `NaN`/infinite result считается `0` с development warning. `context` содержит только `timeZone`; comparator pure, детерминирован для одинаковых входов, не зависит от даты/view, возвращает `0` для `(a,a)` и соблюдает антисимметрию знака и транзитивность, включая эквивалентность при `0`. Нарушение этих законов — consumer bug; package не обязан доказывать их полным перебором. Один итоговый порядок используется во всех grid cells и `DayAgenda`, поэтому пересекающиеся multi-day bars не меняются местами внутри недели; геометрия lanes может добавлять пустое место ради непрерывности bar.

### 6.3. Переполнение

По умолчанию Calendar не требует fixed-height parent: root имеет `inline-size: 100%` и intrinsic `block-size: auto`, но строки не растут от числа items. Toolbar, weekday header и status используют свою intrinsic высоту, а каждая week row получает встроенный preferred block-size из `density`/theme и `dayMinHeight`; число строк месяца поэтому определяет естественную высоту Month grid. Item content не участвует в вычислении intrinsic row height и не может бесконечно расширять root вместо включения overflow.

Если consumer задаёт root конечный definite `height`/`block-size` через `style`, `className` или external CSS, так что computed root получает definite used block-size, оставшееся после toolbar/weekday/status место делится поровну между week rows. Такая высота может дать меньше или больше lanes, чем встроенный preferred size. Package не устанавливает `height: 100%` и не выводит constraint только из высоты родителя: без definite block-size самого root всегда применяется безопасный intrinsic режим выше. Если constraint меньше места, необходимого для date header и одной видимой строки `+N`, grid становится собственным вертикально прокручиваемым region и сохраняет этот минимальный cell chrome; controls не обрезаются и page-level двухмерная прокрутка не создаётся.

Календарь измеряет фактически получившийся content-box каждой week row и показывает максимальное целое число lanes, которое помещается без обрезанного содержимого; частично видимый chip/bar не допускается. При одинаковых resolved row sizes, font metrics и входных данных lane allocation детерминирован. Продолжение multi-day bar занимает тот же lane внутри недели; оно считается одним item этой даты, а не несколькими сегментами.

До первого valid client measurement, а также при нулевом, non-finite или временно недоступном размере используются ноль item lanes и видимый `+N` с достаточной pointer hit-area для каждого непустого дня, как в SSR-контракте раздела 11.3. Это fallback измерения, а не сигнал изменить intrinsic sizing или скрыть grid: после появления положительного finite размера lanes и `N` пересчитываются атомарно. Resize loop не допускается — изменение набора видимых items не изменяет intrinsic row block-size.

`N` — число прошедших source filter items этой даты, не представленных видимым chip/bar в ячейке после lane allocation. Сам `+N` резервирует отдельную строку: если без неё скрытые items появились бы, layout освобождает для неё место и пересчитывает `N`; при нулевых доступных item lanes `N` равно полному числу items дня. `+N` является `aria-hidden` visual affordance внутри package-owned date `gridcell`, без собственного role, accessible name, `tabIndex` или focus state. Его pointer/touch hit-area не меньше target-size gate раздела 12.5 и делегирует ровно ту же activation владеющей cell; cell accessible name независимо сообщает полный count. Изменение размеров обновляет lanes и `N` атомарно, сохраняя текущий roving target и открытый agenda; появление или исчезновение `+N` никогда не требует focus recovery.

Click/tap по hit-area `+N` и `Enter` на владеющей date cell открывают один и тот же полный `DayAgenda`. Отдельной keyboard-команды, event target или accessibility node у `+N` нет. Перерасчёт не должен создавать layout loop или заметное мерцание.

## 7. Mobile UX

Responsive mode определяется шириной контейнера календаря, а не шириной browser viewport.

```ts
type CalendarLayout = 'auto' | 'desktop' | 'mobile';
```

- default: `auto`;
- default breakpoint: `640px`;
- breakpoint переопределяется потребителем;
- layout можно принудительно зафиксировать.

В `auto` измеряется content-box ширина самого Calendar root в CSS px: `< mobileBreakpoint` даёт resolved `mobile`, `≥ mobileBreakpoint` — `desktop`. Ровно `640px` при default поэтому desktop. Нулевая/пока неизмеримая ширина после hydration остаётся mobile до valid measurement. `CalendarRootState.layout` и `data-layout` всегда содержат resolved `mobile|desktop`, никогда `auto`; server и первый client render для `auto` имеют значение `mobile`. Исключение — обратная связь собственной полосы прокрутки: если переключение, вызванное измерением, само возвращает измеренную ширину через границу (например, полоса прокрутки страницы или предка нужна только одному из layouts), текущий layout удерживается, пока ширина остаётся в полосе этой обратной связи `[mobileBreakpoint − Δ, mobileBreakpoint + Δ)`, где Δ — изменение ширины, вызванное переключением; вне полосы снова решает точная граница, смена `mobileBreakpoint` или `layout` сбрасывает удержание. Потребителю рекомендуется `scrollbar-gutter: stable` у прокручиваемого предка, тогда такой обратной связи нет. Forced layout не наблюдает ширину для выбора presentation и не зависит от неё; отдельное измерение для desktop overflow всё ещё допустимо.

Mobile presentation:

- компактная сетка месяца с датами и индикаторами наличия items;
- полные chips/bars не сжимаются в семь узких колонок;
- agenda просматриваемой даты (`agendaDate`, не selection) отображается под сеткой;
- tap по дате меняет активную дату;
- item tap вызывает `onItemPress`;
- явная кнопка `…` открывает доступный action sheet/menu;
- long press используется для drag; action «Перенести» → tap даты → «Подтвердить» является полноценной альтернативой без drag;
- single/range selection доступны явными командами из раздела 5.2 и не перехватывают обычный просмотр дня или прокрутку.

`DayAgenda` является одним логическим компонентом с разными presentations: popover на desktop, inline agenda в основном mobile layout и sheet там, где требуется overlay presentation.

В mobile layout отдельного `+N` нет: tap/keyboard activation даты обновляет inline agenda. Bottom sheet используется для action menu или при явном выборе overlay presentation потребителем.

## 8. Keyboard model

Month grid является composite widget с одним Tab-входом. Tab не проходит последовательно через каждый chip, bar или overflow indicator; визуальный `+N` никогда не получает focus, а `Enter` на его владеющей date cell является keyboard/AT-эквивалентом pointer activation его hit-area.

- `ArrowLeft/Right` — соседняя дата в визуальном направлении, с учётом RTL; `ArrowUp/Down` — минус/плюс семь дней;
- `Home` — первый календарный день недели, `End` — последний. Это chronological boundaries: первый день находится у visual inline-start (справа в RTL), последний — у inline-end;
- `PageUp/PageDown` — предыдущий/следующий месяц;
- `Shift + PageUp/PageDown` — предыдущий/следующий год;
- `Enter` вне draft — открыть или сфокусировать `DayAgenda` для текущей даты;
- `Space` вне draft — запросить single-date selection, если она включена;
- в явном range mode первый `Space` задаёт anchor, второй завершает диапазон; `Enter` после anchor также подтверждает текущий endpoint, до anchor работает как его установка;
- в move mode стрелки меняют целевую дату, `Enter` подтверждает; `Space` не запускает selection;
- `Escape` снимает ровно верхний активный слой: сначала закрывает верхний overlay и отменяет связанный с ним pending open, а при отсутствии overlay отменяет active draft и отложенный focus target. Запуск selection или move через command заранее закрывает package overlays, поэтому draft не скрыт под dialog/menu. Long-press drag из modal sheet использует атомарный pointer-capture handoff раздела 5.3: capture подтверждается до закрытия, но grid становится target и получает восстановленный focus только после удаления dialog и снятия `inert`. Принятая selection не очищается.

Все items и actions доступны через `DayAgenda`. После закрытия agenda overlay package восстанавливает focus по разделу 12.3 — обычно в исходную grid cell, затем в текущий roving target, — только если focus оставался внутри закрываемой поверхности либо оказался на `body`. В desktop agenda `Tab` / `Shift+Tab` идёт по внутреннему порядку controls, а при переходе за первую/последнюю цель закрывает popover и продолжает logical sequential order относительно trigger по правилу 12.2 без возврата к нему. Outside press или другая pointer action сохраняет выбранную внешнюю цель только если действительно перенесла focus в valid внешний узел; иначе применяется recovery 12.3. Interactive controls agenda находятся вне composite grid и имеют собственный последовательный keyboard-порядок.

Переходы между месяцами и ожидание controlled props подчиняются разделу 5.1.1 во всех режимах. Фокус на недоступной для selection дате разрешён: её события остаются доступны для чтения. Контекстная инструкция сообщает активный режим и способ подтверждения/отмены; одна и та же клавиша не запускает две операции. В обычном состоянии `aria-describedby` grid ссылается на `gridInstructions`. При входе в range/move mode к нему добавляется соответственно `rangeSelectionInstructions` или `moveInstructions`, а при выходе дополнительная ссылка удаляется без повторного объявления обычной инструкции. Mode-инструкция входит ровно один раз в единое coalesced polite-сообщение semantic transition по разделу 12.4: самостоятельный вход в range mode сообщает только `rangeSelectionInstructions`; первый anchor следующей отдельной activation объединяет start и initial target; вход в move mode объединяет start, initial target либо navigation-pending и `moveInstructions`. Перемещение target после этого не повторяет инструкцию.

Accessible representation каждой даты — name вместе с ARIA states/descriptions — включает полную дату, today/selected/unavailable и число items. Grid предоставляет короткую инструкцию по открытию `DayAgenda`; hidden chips не являются единственным источником информации для screen reader.

В RTL `ArrowLeft/Right`, column order, bar continuation geometry, overflow placement и directional icons зеркальны визуально; previous/next month сохраняют chronological meaning. `ArrowUp/Down` остаются `−7/+7` календарных дней. Hit-testing pointer/touch следует фактической mirrored geometry, а user titles изолируются от служебного bidi-контекста.

## 9. Loading, empty и error states

Различаются четыре состояния:

1. **Initial loading:** skeleton вместо содержимого календаря.
2. **Refreshing:** существующие items остаются, показываются progress indicator и `aria-busy`.
3. **Empty:** стандартный empty-state для видимого диапазона.
4. **Error:** `phase` явно определяет blocking initial error или неблокирующий refresh error со stale content; наличие произвольных items само по себе не угадывает phase.

Нормативный discriminated contract:

```ts
export type CalendarDataState =
  | {status: 'ready'}
  | {status: 'loading'; phase: 'initial' | 'refresh'}
  | {status: 'error'; phase: 'initial' | 'refresh'; error: unknown};
```

Default — `{status: 'ready'}`. `loading/initial` и `error/initial` заменяют grid/agenda соответственно skeleton или error-state независимо от длины `items`. `loading/refresh` сохраняет принятый content, помечает owned region `aria-busy="true"` и показывает progress. `error/refresh` сохраняет тот же content, не имеет `aria-busy` и показывает неблокирующий error banner. Для `CalendarErrorSlotContext` с `kind="data"` поле `hasStaleItems` всегда `false` при `phase="initial"`; при `phase="refresh"` оно истинно тогда и только тогда, когда хотя бы один корректный прошедший filter item пересекает accepted visible range и остаётся отрисован за неблокирующим banner. Исходные невалидные, отфильтрованные и удерживаемые только вне grid записи не учитываются. `ready`, где с принятым visible range не пересекается ни один корректный прошедший filter item, является неблокирующим empty-состоянием: сохранённые в `items` записи вне grid его не подавляют; toolbar, Month grid, navigation, просмотр дат, selection и создание первого item остаются доступны, а grid не заменяется общей заглушкой. Рядом с grid существует один именованный empty region, body которого задаёт `renderEmpty`. Открытый пустой `DayAgenda` отдельно сохраняет heading и показывает `CalendarMessages.agendaEmpty` в своей content-area; второй экземпляр `renderEmpty` там не создаётся.

Committed переход в blocking `loading/initial` или `error/initial` закрывает package overlays и отменяет selection/move drafts, pending agenda open и отложенные navigation/focus targets; при последующем возврате content они не возобновляются. Если для move draft ранее был опубликован item ID, после commit исходная identity `onItemMoveDraftChange` ровно один раз получает парный `null`, не во время render. Принятые `selection`/`agendaDate`, `items` и другие controlled props не очищаются, а уже выпущенные внешние move requests и их registry/`itemMoveStates` не отменяются. Неблокирующие refresh states drafts сами по себе не отменяют.

Пакет предоставляет стандартный UI и content slots:

- `renderLoading`;
- `renderEmpty`;
- `renderError`.

Повторный запрос, error object и data state контролирует приложение-потребитель. `onRetryRequest` относится только к `CalendarErrorSlotContext.kind="data"`: стандартная retry-кнопка отображается для data error только при наличии callback, один activation вызывает его один раз, а состояние меняется только через новый `dataState`. Для `kind="contract"` пакет никогда не показывает retry и не вызывает `onRetryRequest`, даже если prop передан. Ошибка не очищает принятую selection/agenda date. Если blocking state удаляет сфокусированный view, focus восстанавливается по разделу 12.3.

## 10. Темы и внутренняя дизайн-система

### 10.1. Calendar UI Foundation

В `0.2` создаётся внутренняя дизайн-система календаря. Она не публикуется отдельным npm-пакетом.

```text
core/         date math, layout, selection, move proposals
primitives/   React Aria behavior + design tokens
calendar/     Month View, DayAgenda и calendar-specific patterns
themes/       classic и neutral
```

Foundation строится на текущих компонентах, но не сохраняет их API без изменений:

- `ActionMenu` становится общим Menu/Popover pattern;
- текущий `IconButton` разделяется на `Button` и настоящий `IconButton`;
- `Box` упрощается до layout primitive/`Stack`;
- `Text` получает семантические варианты вместо calendar-specific цветов;
- `Skeleton` и SVG icons становятся primitives;
- `EventChip`, `EventBar`, MonthGrid и generic item actions остаются calendar-specific компонентами; recurrence/series primitives в `0.2` не входят.

React Aria Components используются для стандартных controls и overlays. Низкоуровневые hooks применяются только там, где calendar grid требует собственного поведения.

### 10.2. Встроенные темы

- default: `classicTheme`;
- default density: `compact`;
- optional: `neutralTheme`;
- optional density: `comfortable`;
- theme и density независимы и могут комбинироваться;
- публичный export не называется `yandexTheme` и не создаёт впечатление официальной связи с Яндексом.

```tsx
<Calendar />

<Calendar theme={neutralTheme} density="comfortable" />
```

### 10.3. Tokens

#### 10.3.1. Нормативная карта tokens и CSS variables

`CalendarThemeTokens` и scoped CSS variables являются двумя входами в один semantic token set. Имена ниже — полный публичный CSS-variable contract `0.2` и точный union `CalendarCSSVariable`; `style` принимает эти строковые custom properties без type assertion наряду с обычными `CSSProperties`. Автоматическое преобразование произвольного camelCase имени не является API.

| Token path | CSS variable | Conforming computed value |
| --- | --- | --- |
| `color.surface` | `--nelmad-calendar-color-surface` | CSS `<color>` |
| `color.text` | `--nelmad-calendar-color-text` | CSS `<color>` |
| `color.muted` | `--nelmad-calendar-color-muted` | CSS `<color>` |
| `color.border` | `--nelmad-calendar-color-border` | CSS `<color>` |
| `color.accent` | `--nelmad-calendar-color-accent` | CSS `<color>` |
| `color.danger` | `--nelmad-calendar-color-danger` | CSS `<color>` |
| `color.focus` | `--nelmad-calendar-color-focus` | CSS `<color>` |
| `typography.fontFamily` | `--nelmad-calendar-typography-font-family` | valid CSS `font-family` list |
| `typography.fontSize` | `--nelmad-calendar-typography-font-size` | positive CSS `<length-percentage>` |
| `typography.fontWeight` | `--nelmad-calendar-typography-font-weight` | valid CSS `font-weight` |
| `typography.lineHeight` | `--nelmad-calendar-typography-line-height` | `normal` or positive number/`<length-percentage>` |
| `spacing.xs` | `--nelmad-calendar-spacing-xs` | non-negative CSS `<length>` |
| `spacing.sm` | `--nelmad-calendar-spacing-sm` | non-negative CSS `<length>` |
| `spacing.md` | `--nelmad-calendar-spacing-md` | non-negative CSS `<length>` |
| `spacing.lg` | `--nelmad-calendar-spacing-lg` | non-negative CSS `<length>` |
| `density.dayMinHeight` | `--nelmad-calendar-density-day-min-height` | positive CSS `<length>` resolving to finite CSS px |
| `density.itemHeight` | `--nelmad-calendar-density-item-height` | positive CSS `<length>` resolving to finite CSS px |
| `density.gap` | `--nelmad-calendar-density-gap` | non-negative CSS `<length>` resolving to finite CSS px |
| `radii.sm` | `--nelmad-calendar-radii-sm` | non-negative CSS `<length-percentage>` |
| `radii.md` | `--nelmad-calendar-radii-md` | non-negative CSS `<length-percentage>` |
| `radii.lg` | `--nelmad-calendar-radii-lg` | non-negative CSS `<length-percentage>` |
| `shadows.overlay` | `--nelmad-calendar-shadows-overlay` | valid CSS `box-shadow` list or `none` |
| `motion.duration` | `--nelmad-calendar-motion-duration` | non-negative CSS `<time>` |
| `motion.easing` | `--nelmad-calendar-motion-easing` | valid CSS `<easing-function>` |
| `components.itemBackground` | `--nelmad-calendar-components-item-background` | CSS `<color>` |
| `components.itemText` | `--nelmad-calendar-components-item-text` | CSS `<color>` |
| `components.selectedDayBackground` | `--nelmad-calendar-components-selected-day-background` | CSS `<color>` |

`var(...)`, `calc(...)` и относительные units допустимы, если итоговое computed value соответствует последней колонке. Проценты намеренно не входят в conforming values spacing/density tokens: intrinsic Month sizing не зависит от циклического percentage resolution. Таблица фиксирует semantic grammar, но не добавляет новые TypeScript types или runtime parser.

#### 10.3.2. Precedence, fallback и invalid CSS

Для каждого semantic token порядок следующий:

1. выбранные `theme` и `density` дают полный встроенный набор defaults;
2. consumer может переопределить точную CSS variable обычным CSS cascade в конкретном theme root;
3. непустое поле `tokens` prop записывает ту же variable как package-generated inline declaration и поэтому выигрывает у обычной author declaration; объявление consumer с `!important` подчиняется стандартному CSS cascade;
4. если consumer через root `style` явно передал ту же custom property, `style` объединяется после generated declarations `tokens` и выигрывает на Calendar root. Её resolved computed value, как и любой другой resolved value публичной token variable на root, client-side зеркалируется в открытый portal по правилам 10.3.4.

Отсутствующее поле `tokens` не сбрасывает предыдущий слой. Runtime non-string либо строка, пустая после `trim`, трактуется как отсутствующее поле с development warning. Исключение по правилу безопасности: строка, которая не является ровно одним значением CSS-декларации (`;` или `!` на верхнем уровне, незакрытые либо несбалансированные кавычки, скобки или комментарии) или содержит `url(`, в том числе записанный escape-последовательностями (например `u\72l(`), тоже трактуется как отсутствующее поле с development warning, детерминированно и одинаково на server и client; это структурная проверка границ декларации и `url(`, а не проверка соответствия таблице и не `CSS.supports`. Остальные строки пакет передаёт как CSS component values без нормализации. Он не вызывает `CSS.supports`, не читает computed styles и не пытается полноценно парсить CSS во время server/client render: syntactically invalid либо не соответствующее таблице non-empty значение является consumer styling error и не переводит Calendar в contract-error UI, не вызывает callbacks и не получает гарантированного визуального fallback сверх стандартного поведения CSS engine. Для некорректного sizing value фактически получившийся нулевой/non-finite/недоступный measurement безопасно обрабатывается нулём lanes и `+N` по разделу 6.3.

Одинаковые props создают одинаковые theme attributes и inline custom-property declarations на server и первом client render. Package-owned portals на server и первом hydration render ещё закрыты, поэтому client mirror не является hydration input. Media queries (`colorScheme="system"`, forced colors, reduced motion) и внешний stylesheet могут изменить computed presentation, но не DOM structure, controlled state или callback lifecycle. Host-dependent CSS validation и DOM/computed-style reads не используются во время server/client render.

#### 10.3.3. Item appearance

Resolved item colors вычисляются независимо по трём semantic каналам:

| Канал | Theme/token base | Source layer | Item resolver layer |
| --- | --- | --- | --- |
| accent marker | `color.accent` | непустой `CalendarSource.color` известного source | непустой `getItemAppearance(item, context).accentColor` |
| item background | `components.itemBackground` | не изменяет | непустой `backgroundColor` |
| item text/currentColor | `components.itemText` | не изменяет | непустой `textColor` |

Каждый resolver field заменяет только свой канал; `undefined`, runtime non-string и строка, пустая после `trim`, означают отсутствие override. Item без `calendarId`, с неизвестным/невалидным source либо без `source.color` использует base accent. `CalendarSource.color` задаёт также accent marker самого source в selector, но никогда не меняет item background/text. `components.selectedDayBackground` относится только к selected date cell и не участвует в item appearance.

Package не выполняет собственный parser произвольных CSS colors. Правило безопасности раздела 10.3.2 действует и здесь: непустое `source.color` или appearance value, которое не является ровно одним значением CSS-декларации (`;` или `!` на верхнем уровне, незакрытые либо несбалансированные кавычки, скобки или комментарии) или содержит `url(`, в том числе записанный escape-последовательностями, трактуется как отсутствующее с development warning, детерминированно и одинаково на server и client, и действует нижний канал (accent source, затем theme token). Остальное непустое `source.color`/appearance value применяется как отдельное CSS color declaration поверх уже resolved нижнего слоя, не изменяя shared theme variable. Если UA отвергает такую declaration при parsing/assignment, она не заменяет нижний канал. Если строка принята как CSS syntax, но стала invalid at computed-value time, например из-за unresolved `var(...)`, действует стандартная CSS semantics без package-guaranteed fallback. Runtime non-string/blank игнорируется с development warning. Один resolved appearance используется у всех visual segments и agenda row item; пользовательское slot-содержимое наследует item text `currentColor`, если само не задаёт цвет.

Focus indicator, pending/drag/disabled affordances и другие package-owned state markers не являются четвёртым appearance channel и не удаляются consumer colors. При `forced-colors: active` package-owned surfaces используют system colors для текста, границ, focus и различимых state markers; `theme`, `tokens`, `CalendarSource.color` и `getItemAppearance` не могут требовать сохранения брендовых цветов. Consumer rule с `forced-color-adjust: none` выводит затронутую поверхность из conforming default fixture.

#### 10.3.4. Root, portals и Shadow DOM

Theme defaults и CSS reset ограничены Calendar/theme root, а не глобальным `:root`. Portal overlays (agenda, menu, sheet) получают отдельный package-owned theme root с теми же `data-theme`, `data-density`, `data-color-scheme`, `data-dir` и `lang`. Перед тем как первый client-only portal становится видимым и interactive, package считывает с Calendar root текущие computed values всех 27 публичных variables таблицы 10.3.1 и inherited font properties `font-family`, `font-size`, `font-style`, `font-weight`, `font-stretch`, `line-height` и `letter-spacing`, записывая resolved values как inline declarations portal theme root. До этого атомарного layout-effect переноса portal скрыт и не принимает input. Так mirror сохраняет итог theme/density, scoped CSS, `tokens` и root `style`, но не копирует непубличные properties или произвольные element rules.

Пока portal открыт, mirror обновляется после каждого committed render владеющего Calendar, при notification его `ResizeObserver`, при `window` resize в том же realm и при изменении используемых `prefers-color-scheme`, `forced-colors` и `prefers-reduced-motion` media queries. Package не наблюдает за произвольной мутацией consumer stylesheet/ancestor class: если она не совпала с перечисленным checkpoint, consumer должен вызвать owner render. Каждое refresh считывает только owner root данного Calendar и записывает только изменившиеся значения, поэтому экземпляры не смешивают values и mirror не запускает render/resize loop. При открытии mirror завершается до initial focus и modal announcement; DOM/computed-style reads не выполняются в render и на server.

Base styles и theme variables решают разные задачи. Импортированный в document `@nelmad/calendar/styles.css` не пересекает shadow boundary: если Calendar root или явный `portalContainer` находится в `ShadowRoot`, consumer обязан подключить тот же stylesheet внутри каждого содержащего UI tree scope через поддерживаемый его toolchain способ (`adoptedStyleSheets`, bundled `<style>` или эквивалент). Для Calendar в ShadowRoot с default portal поэтому stylesheet нужен и в Calendar ShadowRoot, и в `ownerDocument`; для Calendar в document с portal в ShadowRoot — в document и target ShadowRoot. Package не внедряет stylesheet автоматически и не обходит CSP: если строгий `style-src` без `'unsafe-inline'`/`style-src-attr` отбрасывает server-rendered атрибуты `style`, client после hydration заново применяет через CSSOM только собственные validated declarations пакета, по одному свойству, как их записывает client render, но не consumer root `style` и не текст атрибута. Это не обход CSP: stylesheet не внедряется, а `<style>` pressable-правила React Aria требует документированного nonce. Отсутствие base CSS в любом целевом tree scope является ошибкой интеграции, а не вариантом unstyled default UI.

При отсутствующем или `null` `portalContainer` default — ближайший открытый modal container Calendar root в том же document (на composed path корня: native `<dialog>` в modal state, то есть открытый через `showModal()`, либо элемент с `aria-modal="true"`; `role="dialog"`/`"alertdialog"` без `aria-modal` им не является), иначе root `ownerDocument.body`, но никогда не global document другого realm. Default target определяется на client и заново перед каждой user activation; его смена при открытом package overlay обрабатывается как смена identity ниже. Явный valid `portalContainer` всегда выигрывает. Явный container должен быть connected и принадлежать тому же `ownerDocument`; connected `ShadowRoot` допустим. Detached/cross-document значение игнорируется в пользу default с development warning. Если identity принятого `portalContainer` меняется во время открытого package overlay, включая переход к/от `null`, либо active container удаляется, package закрывает его descendant overlays top-down, снимает modal effects, восстанавливает focus по разделу 12.3 и не открывает их автоматически в новом container; следующая user activation использует новый valid container или default. Равный по identity valid container ничего не закрывает.

Пакет наследует шрифт приложения. Он не загружает `YS Text` или другой font с внешнего CDN.

`colorScheme="light"|"dark"|"system"` работает для обеих тем; default — `system`. Forced-colors policy выше имеет приоритет над декоративными author colors. `prefers-reduced-motion` отключает необязательную animation/transition независимо от `motion.duration`; функциональный state transition остаётся мгновенно доступен.

### 10.4. Slots и styling API

Пакет владеет обязательными interactive elements, roles, ARIA attributes, focus и drag semantics.

Content slots меняют содержимое, но не удаляют доступную оболочку:

- `renderItem`;
- `renderAgendaItem`;
- `renderDayHeader`;
- `renderToolbarContent`;
- `renderLoading`;
- `renderEmpty`;
- `renderError`.

`renderItem`/`renderAgendaItem` заменяют только default visual content внутри package-owned item wrapper; базовый accessible summary остаётся. `renderDayHeader` заменяет видимое содержимое заголовка date cell, но не её полное accessible name. `renderToolbarContent` добавляет extension area и не заменяет navigation/Today/source controls. `renderLoading`/`renderEmpty`/`renderError` заменяют default body соответствующего именованного state region; package сохраняет state semantics, а стандартная retry-кнопка показывается только для `kind="data"` и только когда slot её не заменил. Consumer, заменивший data-error body, сам вызывает переданный через closure `onRetryRequest` из собственного доступного control; для `kind="contract"` retry отсутствует.

Границы composition contract:

- `renderItem`, `renderAgendaItem` и `renderDayHeader` принимают только неинтерактивное содержимое: текст, статические badges/icons/разметку. Внутри не допускаются ссылки, buttons, inputs, `contentEditable`, собственные interactive roles/tab stops и обработчики, перехватывающие управление focus, activation или drag. Даже `tabIndex={-1}` не делает вложенную кнопку допустимой.
- Основную активацию item задаёт `onItemPress`, дополнительные действия — `getItemActions` / `onItemActionRequest`. Пакет размещает action triggers отдельно от интерактивной оболочки item, не вкладывая одну кнопку в другую.
- `renderToolbarContent`, `renderLoading`, `renderEmpty`, `renderError` размещаются вне composite grid и interactive item wrappers. Они могут содержать самостоятельные controls с обычным Tab-порядком; их labels, keyboard behavior, focus styles и semantics обеспечивает потребитель. Например, custom retry action не вкладывается в стандартную retry-кнопку.
- Styling API не даёт права удалять обязательные controls из accessibility tree или скрывать focus indicator. Потребитель отвечает за доступность собственного содержимого, контраст custom colors и корректный текст/alt.
- Пакет гарантирует собственную оболочку и стандартные presentations, а не произвольное содержимое slots. Документация содержит допустимые/недопустимые примеры. Development diagnostics являются best-effort: после commit они проверяют только фактических DOM descendants внутри owned wrapper и не гарантируют обнаружение portals, shadow DOM, поздних mutations или поведения custom components. Необнаруженное нарушение не становится допустимым и diagnostics не заменяют consumer accessibility tests.

Slot context типизирован и включает релевантные состояния:

- `item`;
- `view`;
- `isSelected`;
- `isDragging`;
- `isPending`;
- `isDisabled`.

`isPending` для item означает незавершённый move из `itemMoveStates`, а не общий loading данных или автоматически угаданное ожидание пользовательского action. Для ожидания доменных actions потребитель передаёт собственное состояние в `data`/resolver; пакет не интерпретирует его без явного контракта.

Для оформления доступны `classNames` callbacks, CSS variables и стабильные `data-*` attributes.

Полностью headless API рассматривается после подтверждения отдельного спроса.

## 11. Timezone и локализация

### 11.1. Calendar timezone

Основной API требует явную IANA timezone:

```tsx
<Calendar timeZone="Europe/Moscow" />
```

Неявная timezone browser/system не используется для нового API. Это устраняет один источник SSR-различий, но не синхронизирует часы, container measurements или locale data; полный initial-render контракт определён в разделе 11.3.

Date math переезжает на `@internationalized/date`. Библиотека является implementation dependency и не попадает в публичные типы. Day.js полностью исключается из целевого SDK `0.2`: нет старого renderer, helper bridge или параллельного date runtime.

#### 11.1.1. Причины выбора date library

Выбор связан с требованиями календаря и принятой React Aria основой:

- `CalendarDate` представляет дату без времени, `CalendarDateTime` — локальные дату/время, `ZonedDateTime` — значение с timezone. Это позволяет различать all-day и timed операции внутри core, не моделируя каждый календарный день как полночь некоторого instant. См. [модель типов](https://react-spectrum.adobe.com/internationalized/date/index.html).
- Преобразование локального времени в timezone позволяет явно выбрать поведение при DST gap/fold. Это подходящий инструмент для правил переноса из раздела 5.3.1, а не автоматическая гарантия правильного продуктового поведения. См. [disambiguation API](https://react-spectrum.adobe.com/internationalized/date/CalendarDateTime.html).
- Date-aware компоненты React Aria используют эту же модель: не нужен дополнительный Day.js ↔ React Aria слой при их подключении. Это преимущество согласованности стека, а не обязательное условие использования обычных buttons/menus. См. [React Aria Calendar](https://react-spectrum.adobe.com/react-aria/Calendar.html).

Day.js также поддерживает timezone через [UTC/timezone plugins](https://day.js.org/docs/en/plugin/timezone); отказ не означает, что на нём невозможно построить корректный календарь. Текущий `0.1` использует fixed-offset подход, а для `0.2` всё равно требуется пересмотр модели и арифметики. В этот момент выбирается более подходящий для календарной предметной области внутренний API.

Не заявляются непроверенные выигрыши в скорости или размере bundle. ISO public contract, отсутствие global locale registry, SSR snapshot и конкретная DST policy — решения нашего SDK; миграция библиотеки сама по себе не заменяет validation, hydration и regression tests. Цена перехода — переработка date math и освоение её типов; сохранение Day.js ради старого API в эту цену больше не включается.

### 11.2. Locale

- default locale: `ru-RU` как выбранная базовая локаль продукта;
- встроенные UI messages: `ru-RU` и `en-US`;
- date labels формируются через `Intl.DateTimeFormat` с явными `calendar: 'gregory'`, нужными конкретной строке `timeZone`/format options; digits следуют resolved locale и его `u-nu` extension, но никогда не host defaults;
- locale-файлы и global locale configuration Day.js не используются;
- первый день недели выводится из locale и может быть переопределён;
- 12/24-часовой формат выводится из locale и может быть переопределён;
- `ltr/rtl` выводится автоматически и может быть переопределён;
- RTL входит в visual и keyboard test matrix.

BCP 47 locale управляет форматированием дат. Malformed tag обрабатывается как contract error раздела 4.3. Для well-formed locale, который не поддерживает требуемый `Intl` service, resolved locale детерминированно становится `en-US` с одним development warning, никогда не host default. Один resolved locale используется helper, компонентом, messages negotiation и portal root.

`messagesLocale` по умолчанию равен resolved date locale и независимо выбирает сообщения: `ru-* → ru-RU`, `en-* → en-US`, остальные valid BCP 47 tags → встроенный `en-US`; malformed tag является contract error. Затем применяются `messages` overrides, которые считаются написанными на запрошенном `messagesLocale`. Пустой override не используется: включается встроенный fallback и development warning. Каждое override/fallback сообщение и локализованный date fragment получают `lang` своего фактического языка; Calendar/portal root не выдаёт английское сообщение за французское или арабское. `dir` определяется из date locale/script независимо от языка сообщений.

Если safe contract-error вызван malformed `locale` и/или `messagesLocale`, его язык выбирается без чтения host defaults: сначала используется catalog валидного `messagesLocale` и допустимый override `invalidConfigurationLabel`, затем catalog валидного `locale`, иначе встроенный `ru-RU`. Overrides, привязанные к malformed `messagesLocale`, для этого error не применяются. Direction safe error сначала использует валидный явный `dir`, затем выводится из валидного `locale`, а при их отсутствии/невалидности равен `ltr`; то же resolved значение получает `data-dir`. `lang` соответствует фактически выбранному catalog. Эта fallback-цепочка применяется одинаково на server и client.

Для `firstDayOfWeek`, `hourCycle` и `dir` приоритет одинаков: явный prop → данные resolved locale → нормативный fallback `monday`, `24`, `ltr` соответственно; process/browser defaults не читаются. После выбора числового `hourCycle` formatter всегда отображает `12` как `Intl` `hourCycle: "h12"`, а `24` как `hourCycle: "h23"`; `hour12` и `h11`/`h24` не используются, поэтому полночь в 24-часовом режиме — `00:…`, не `24:…`.

Каждый formatter использует `localeMatcher: 'lookup'` и `calendar: 'gregory'`; Unicode extension `u-ca-*` не может переопределить Gregorian contract. Date-only labels сохраняют исходные Gregorian fields и, если реализация временно мостит их через `Date`, форматируются с явным `timeZone: 'UTC'`; timed labels форматируют instant в `Calendar.timeZone`.

```tsx
<Calendar
  locale="en-US"
  firstDayOfWeek="sunday"
  hourCycle={12}
/>
```

### 11.3. Today, SSR и первый client render

Optional `today: ISODate` — общий snapshot текущей календарной даты в `Calendar.timeZone`. Сервер/приложение вычисляет его один раз и передаёт то же значение при hydration. В этом режиме пакет не читает текущие часы для подсветки today, кнопки «Сегодня» или fallback agenda; обновление snapshot, включая полночь и смену timezone, контролирует потребитель.

Без `today` сервер и первый client render используют одинаковое состояние «today ещё неизвестно»: подсветки today нет, кнопка «Сегодня» видима, но недоступна, fallback agenda — первый день месяца. Только после hydration пакет вычисляет дату в явной `Calendar.timeZone` и планирует rollover на первый instant, чья Gregorian date в этой зоне отличается от текущей, а не через `+24h`; `visibilitychange` пересинхронизирует пропущенную границу. Если дата agenda всё ещё является нетронутым fallback, она переходит на today только когда today принадлежит принятому отображаемому месяцу; пользовательский просмотр или controlled agenda date не сбрасываются. Такой режим не требует дополнительного server prop, но допускает один post-hydration UI update.

Кнопка «Сегодня» не меняет selection или agenda date. Если today уже входит в grid, activation сразу переносит roving/DOM focus в его cell. Иначе она вызывает `onNavigate` с первым днём месяца today и сохраняет transient focus intent с source `today`, target и identity инициировавшей кнопки по правилам 5.1.1. Matching acceptance переносит roving/DOM focus в today cell, только пока focus остаётся на той же кнопке и intent не отменён; `Tab`/`Shift+Tab`, `Escape`, unrelated user action, stale/mismatching acceptance и blocking/contract transition не позволяют позднему update забрать focus с этой кнопки или другого control. Если пользователь уже вернулся в grid, обычное внешнее изменение месяца сохраняет grid-focus только по общему правилу 5.1.1 и не возобновляет Today intent. Успешный Today-перенос не создаёт `monthChangedAnnouncement`: новую дату сообщает accessible name сфокусированной cell; отменённый intent также не создаёт Today-specific announcement. Если месяц today находится за поддерживаемой anchor-границей, кнопка недоступна с accessible reason и callback не вызывается. Кнопка остаётся в toolbar, пока today известен, включая уже открытый текущий месяц, поэтому focus не исчезает из-за успешной навигации; activation при уже сфокусированной today cell является no-op.

Для responsive/overflow поведения:

- при `layout="auto"` сервер и первый client render используют общий компактный mobile month layout, без чтения `window`, `matchMedia` или размеров контейнера во время render; inline agenda входит в него только при `agendaPresentation="auto"`, а при `"overlay"` компактный month не содержит agenda до activation (sheet закрыт);
- после hydration измеряется контейнер и выбирается mobile/desktop presentation; `layout="desktop"` / `"mobile"` фиксируют presentation уже на сервере;
- пока desktop высота не измерена, используются ноль item lanes и видимый `+N` с достаточной pointer hit-area для каждого непустого дня; он не является отдельным accessibility node или focus target. После измерения lanes и число скрытых items пересчитываются вместе. Полный список всё время доступен через agenda;
- post-hydration или runtime-смена `layout` / `agendaPresentation` не теряет agenda date/selection и не дублирует активные DOM controls. Для этих переходов package-owned descendant overlay stack логически является частью owning agenda независимо от portal DOM: если focus находится в дочернем item menu/sheet, он считается находящимся внутри заменяемой поверхности. Перед заменой presentation дочерние overlays закрываются top-down и автоматически не открываются заново; их логический trigger в новой agenda становится предпочтительной целью восстановления. Переход inline → popover или inline → sheet открывает новую overlay-presentation только когда focus находился внутри заменяемой inline agenda или её descendant overlay; package восстанавливает логически тот же item/control, а при его отсутствии применяет раздел 12.3. Если focus был вне этого owning stack, один resize или prop update сам по себе не открывает popover/sheet. При открытой поверхности переходы popover → inline, sheet → inline, popover → sheet и sheet → popover сохраняют тот же accepted `agendaDate`; focus переносится на логически тот же control только если до switch находился внутри owning stack, иначе уже внешний focus сохраняется. В частности, если focus уже находится вне заменяемого non-modal popover, переход к modal sheet не открывает sheet. Этот focus-gate относится только к пассивной migration уже принятой presentation: он не отменяет ещё актуальный user open/focus intent раздела 5.2.1. Если matching `agendaDate` принимается после либо в одном commit со switch, package не монтирует промежуточную старую presentation, а ровно один раз открывает текущую resolved presentation и применяет её input-specific initial-focus/announcement rule; если пользователь до acceptance перевёл focus или совершил отменяющее действие, intent уже недействителен и switch ничего не открывает. Вход в sheet атомарно включает containment, background `inert` и scroll lock до переноса focus; любой switch с modal descendants reference-counts эти эффекты по всему owning stack и снимает их только после удаления последней modal surface, не оставляя orphan overlay или focus в `inert` subtree. Смена `agendaPresentation="auto" ↔ "overlay"` в desktop layout, где resolved presentation остаётся popover, не перемонтирует его и не меняет focus. Ни один passive switch не забирает уже внешний focus;
- при смене resolved `layout` standalone source selector из toolbar не мигрирует автоматически между desktop menu и mobile sheet: открытая поверхность закрывается top-down, а accepted `visibleSourceIds` сохраняется. Если focus был внутри неё, он возвращается в логически тот же source trigger новой toolbar либо применяет 12.3; уже valid внешний focus сохраняется. Выход из modal source sheet снимает containment, background `inert` и scroll lock не позже её удаления и не оставляет orphan portal;
- theme/system color scheme и motion решаются CSS media queries, без разных server/client DOM trees.

SSR fixture передаёт одинаковые `items`, `anchorDate`, locale/firstDayOfWeek/dir, timezone и опциональный `today` на обеих сторонах; formatters используют одинаковые явные options. До fetch сервер может вычислить точный initial range через `getCalendarVisibleRange`. `onVisibleRangeChange` появляется только после client commit и не дублируется StrictMode.

Release manifest (отчёт release workflow, раздел 19.2) перечисляет точные протестированные Node/browser/OS, ICU и tzdata tuples и обе границы каждой опубликованной Node semver range: минимальный patch и последний доступный patch на дату RC. Это representative evidence, а не скрытый whitelist единственных допустимых patch-версий. Минимум проверяются `ru-RU`, `en-US`, одна RTL locale, UTC, положительная и отрицательная timezone, DST gap/fold и историческая смена около полуночи. Все patches внутри опубликованной support range являются поддерживаемыми runtime; найденный после релиза package bug внутри неё обслуживается как compatibility defect. При этом пакет не обещает идентичность произвольно различающихся Intl/tzdata: для server/browser пары вне протестированного tuple потребитель обязан выровнять locale/timezone data документированным polyfill, если native outputs расходятся. Hydration mismatch в протестированном tuple либо в иной поддерживаемой паре с выровненными данными является release blocker/compatibility defect, а не обычным warning.

Package import, pure helper и React render не читают DOM, clock или crypto и не вызывают lifecycle/request callbacks. Client effects создают не более одного актуального экземпляра каждого необходимого timer/listener/`ResizeObserver`; ненужный effect отсутствует, cleanup оставляет ноль. React 18/19 development StrictMode replay не дублирует visible-range/draft/request callbacks или announcements и не оставляет лишних observers. Эти свойства проверяются отдельно от production performance run.

Нормативная основа: [React требует одинаковое содержимое при hydration](https://react.dev/reference/react-dom/client/hydrateRoot). Обязательные edge cases — server render перед полуночью, hydration после полуночи, отсутствие `today`, разные system timezones, auto layout и несколько экземпляров календаря.

## 12. Accessibility

Цель — WCAG 2.2 AA. Это release gate для package-owned default presentations обеих встроенных тем и зафиксированных conforming-slot fixtures, а не маркетинговое заявление на основании одной зависимости. Обычный theme contrast значений из `tokens`, документированных CSS-variable overrides, global CSS, `CalendarSource.color`, `getItemAppearance` и пользовательского slot-содержимого относится к consumer-owned scope; туда же входят смысловая достаточность `item.title`, source/action labels и `messages` overrides, а также приложение вокруг Calendar. Package остаётся ответственным за wrapper semantics и structural ARIA, escaping/bidi isolation, встроенные fallback labels/messages, видимый focus indicator и state markers, default appearance, forced-colors override и fallback нижнего semantic color channel, когда custom item color отсутствует либо отвергнут UA при parsing/assignment. Conforming default fixtures используют только встроенные theme values либо замороженный conforming styling fixture; consumer rule `forced-color-adjust: none` выводит затронутую поверхность за его границы. Поскольку WCAG conformance относится к полной web page, допустимая публичная формулировка: «`@nelmad/calendar 0.2.0` проверен в reference harness по применимым WCAG 2.2 A/AA в границах package-owned UI»; она не объявляет автоматически conformant приложение потребителя.

### 12.1. ARIA-модель Month grid

- Calendar root — именованный `region`; Month View имеет видимый heading, именующий `grid` через `aria-labelledby`, и короткую `gridInstructions` через `aria-describedby`. В активном range/move mode description дополняется соответствующей инструкцией по правилам раздела 8. В grid находятся header row с семью `columnheader`, week rows и по одному `gridcell` на каждую отображаемую дату; сокращённый weekday header имеет полное localized accessible name. DOM/ARIA order хронологический, `aria-colcount="7"`, а `aria-rowcount` точно равно числу week rows плюс header. Header row имеет `aria-rowindex="1"`, week rows — последовательные `aria-rowindex="2…N+1"`, а их `columnheader`/`gridcell` — `aria-colindex="1…7"` в DOM/ARIA order независимо от визуального RTL-зеркалирования. При включённой selection grid задаёт `aria-multiselectable="true"`.
- Используется roving `tabIndex`, не `aria-activedescendant`: ровно один date `gridcell` имеет `tabIndex=0`, остальные `-1`. Initial target — сохранённая логическая дата, затем принятый `agendaDate` внутри grid, `selection.start` внутри grid, today внутри grid, первый день anchor month и, наконец, первая дата grid.
- При включённом selection API каждая cell получает `aria-selected="true|false"` только по принятой `selection`; в viewer mode attribute отсутствует. Draft обозначается отдельным описанием, а `agendaDate` — состоянием «просматривается», но не selection. Today получает `aria-current="date"`.
- Policy-запрет selection/move не ставит `aria-disabled` на date cell: дату всё ещё можно сфокусировать и открыть. Причина доступна через description только в активном взаимодействии, к которому она относится.
- Accessible name/description date cell содержит полную локализованную дату, today/accepted selection/agenda/draft states и полное число прошедших filter items. При `N > 0` description дополнительно ровно один раз включает `moreItemsLabel(date, N)` как accessible equivalent визуального overflow indicator. Внутренние visual chips, bars, mobile indicators и `+N` не являются дополнительными gridcells, widgets или Tab-stops и скрыты от accessibility tree; `+N` имеет только pointer/touch hit-area, делегирующую activation владеющей cell, а keyboard/screen-reader equivalent — `Enter` на этой cell и полный `DayAgenda`.
- Multi-day item присутствует в `DayAgenda` выбранной даты ровно один раз, независимо от числа visual bar segments. Primary item control вызывает `onItemPress`, отдельный action trigger открывает actions; один interactive element не вкладывается в другой.
- `DayAgenda` имеет видимый heading с полной датой/count и semantic list. Базовый accessible summary item содержит title, package-owned pending state через `pendingStateLabel` только при `isPending=true` и title разрешённого известного source, если он есть; для item без `calendarId` или с неизвестным source выдуманный source label не добавляется. Для timed item interval форматируется после проекции instants в `Calendar.timeZone`; для all-day item форматируется исходный date-only полуинтервал без timezone-проекции. Без `onItemPress` строка остаётся читаемым list item без искусственного Tab-stop; при наличии callback primary surface является button. С `renderAgendaItem` accessible name строки (primary button, а без него — текст list item) — этот package-owned summary, за которым следует видимое содержимое slot (WCAG 2.5.3 Label in Name); без slot это summary, как прежде.
- Agenda может виртуализировать длинный список, только если каждый item остаётся достижим keyboard/AT, сообщает корректные position/total semantics (`aria-posinset`/`aria-setsize` или нативный эквивалент), focused row не recycling-ится до безопасного переноса focus, а последний item можно найти и активировать в обязательном 1000-item scenario. Иначе все строки рендерятся как обычный semantic list.

### 12.2. Overlays и inline agenda

| Presentation | Семантика и modality | Initial focus и Tab | Закрытие |
| --- | --- | --- | --- |
| Desktop `DayAgenda` | именованный non-modal `dialog`/popover; связан и визуально anchored к date cell, когда она существует, иначе anchored к Calendar root и не содержит ARIA-ссылки на отсутствующую cell | первый enabled agenda control; если его нет — heading с программным `tabIndex=-1`; `Tab` / `Shift+Tab` идёт по controls, а на границе закрывает popover и продолжает logical sequential order по правилу ниже | `Escape`, close control, outside press и Tab exit; outside action сохраняет свою цель только если она действительно перевела focus в valid внешний узел, иначе применяется 12.3 |
| Mobile inline `DayAgenda` | постоянно расположенный именованный `region`, не overlay | pointer/tap не крадёт focus; `Enter` из grid переносит focus в heading/первый control | не закрывается; `Escape` внутри возвращает focus в связанную date cell, а если она вне grid — в roving cell и далее по 12.3; content остаётся |
| Явный mobile agenda sheet | modal `dialog` с именем даты; фон inert, body scroll locked | focus contained; heading получает initial focus, destructive action — никогда | `Escape`, close, документированный backdrop press и подтверждённый long-press drag-session handoff раздела 5.3 |
| Desktop item/source menu | `menu` в non-modal popover с menu keyboard model и собственным `aria-label`: `itemActionsLabel(itemTitle)` для item actions, где title уже разрешён через `untitledItemLabel`, либо `sourceSelectorLabel` для sources; имя не зависит от IDREF на trigger | первый enabled `menuitem`; source controls имеют `menuitemcheckbox`; `Tab`/`Shift+Tab` закрывает menu и продолжает logical sequential order по правилу ниже | `Escape`/item action закрывают с возвратом trigger; outside action сохраняет цель только при valid внешнем focus, иначе применяется 12.3; source toggle сохраняет menu |
| Mobile item/source action sheet | именованный modal `dialog`: item actions представлены именованными buttons, sources — именованными checkbox/toggle controls; видимый heading и `aria-labelledby` используют `itemActionsLabel(itemTitle)` для item actions, где `itemTitle` уже разрешён через `untitledItemLabel` fallback, и `sourceSelectorLabel` для sources; фон inert, scroll locked | первый enabled action/toggle, иначе close | `Escape`, close, action и backdrop press |

Для вложенных presentations `Escape` закрывает только верхний overlay; следующий `Escape` действует на оставшийся draft/overlay по разделу 8. Portal остаётся в том же `ownerDocument` и theme scope, а consumer `portalContainer` не отменяет focus containment, inert и возврат focus.

Для Tab-выхода из non-modal agenda/menu overlay логически занимает позицию сразу после своего trigger, даже если физически portaled в конец `body` или `ShadowRoot`. После исключения закрываемого overlay subtree `Tab` переносит focus в первый enabled tabbable после trigger, а `Shift+Tab` — в последний enabled tabbable перед ним в composed sequential order; сам trigger пропускается, поэтому выход не зацикливает пользователя. Если цели в соответствующем направлении нет, overlay закрывается и user agent продолжает выход за границу документа; package не возвращает focus к trigger. Это правило не применяется к modal sheet, где focus contained до явного закрытия.

Триггер package overlay получает `aria-haspopup="dialog"` для agenda/sheet или `aria-haspopup="menu"` для menu, а `aria-expanded` отражает фактически открытую им presentation; для inline agenda эти popup-attributes не ставятся. `aria-controls` добавляется только пока trigger и overlay target одновременно connected и имеют одинаковый `getRootNode()`/tree scope. При portal через границу `ShadowRoot`, при отсутствующей date cell или до mount target этот IDREF отсутствует; package не создаёт dangling/cross-tree ARIA-ссылку, а overlay сохраняет собственное имя.

### 12.3. Восстановление focus

Если focused control исчез после controlled update, filter, responsive switch или закрытия overlay, пакет выбирает первую существующую цель:

1. логически тот же control/item с тем же ID в новой presentation;
2. если закрылся только дочерний overlay, а его parent-overlay остался открыт, — существующий trigger внутри parent; если он исчез, первый следующий enabled control после прежней логической позиции trigger в composed sequential order, затем последний предыдущий enabled control и, наконец, heading или container parent с программным `tabIndex=-1`; пока parent открыт, цели за его пределами не рассматриваются;
3. date cell, из которой был открыт item/overlay, если она в grid;
4. текущий roving date cell;
5. видимый именованный blocking loading/error region с программным `tabIndex=-1`, если он заменил прежний view;
6. первый enabled toolbar control;
7. Calendar root с программным `tabIndex=-1`.

Алгоритм срабатывает, только если focus оставался внутри заменяемой/закрываемой package-поверхности либо оказался на `body`. Переход в blocking loading/error переносит находившийся внутри удаляемого view focus на видимый state region, но не на скрытый live-region host и не забирает внешний focus. Удаление/фильтрация agenda item, source selector или action trigger следует тому же порядку. Появление, изменение или исчезновение presentation-only `+N` никогда не запускает recovery, поскольку он не может владеть focus. Возврат никогда не направляется в disconnected/hidden/disabled/`inert` node; unmount Calendar не выполняет программный focus.

Standalone source selector из toolbar (desktop menu или mobile sheet) после закрытия по любой причине, например `Escape`, close control, повторного нажатия trigger, outside или backdrop press, смены resolved `layout` или portal target, возвращает focus, находившийся внутри него, на собственный trigger в toolbar (WAI-ARIA menu button pattern, как в R39). Порядок выше применяется, только если trigger исчез или не может получить focus по последнему правилу предыдущего абзаца; уже valid внешний focus не забирается. `Tab`/`Shift+Tab`-выход из menu по 12.2 сам продолжает sequential order и recovery не запускает.

### 12.4. Live regions

Каждый Calendar имеет собственные стабильные polite/urgent channels: `role="status" aria-live="polite" aria-atomic="true"` для loading/refresh, начала, явной отмены и успеха interaction и `role="alert" aria-atomic="true"` для blocking error, policy/core-validation block, автоматической отмены move с reason и rejected move. Root endpoints существуют с mount и не пересоздаются при навигации. При modal overlay сообщения владеющего им Calendar маршрутизируются только в эквивалентные endpoints внутри разрешённого modal subtree, а его background endpoints очищены/inert; hosts остальных Calendar остаются вместе со своим inert background и молчат. Одно событие никогда не пишется в два endpoints, экземпляры не объявляют результаты друг друга.

Единица live output — committed semantic transition, вызванный одной user activation либо одним принятием controlled result, а не каждый промежуточный state setter/effect. Все обязательные polite fragments одного transition объединяются в один `aria-atomic` payload: каждый resolved fragment включается в semantic payload ровно один раз, хотя pure message-resolver может вычисляться/replay-иться по общему правилу раздела 5.7; непустые trimmed fragments соединяются одним пробелом, и весь текст записывается в active polite endpoint одной DOM mutation после commit focus/overlay state. Нельзя последовательно перезаписать один host несколькими fragments того же transition или дублировать текст в видимом status с собственным `aria-live`. Порядок fragments фиксирован: lifecycle start, затем current target **либо** navigation-pending, затем mode instruction. Поэтому:

- самостоятельный вход в range mode выводит только `rangeSelectionInstructions`; отдельная следующая activation первого anchor объединяет `selectionStartedAnnouncement` и initial `selectionTargetAnnouncement`, после чего target changes выводят только target fragment;
- вход в move mode с уже доступным target объединяет `moveStartedAnnouncement`, initial `moveTargetAnnouncement` и `moveInstructions`; если initial target требует controlled navigation, вместо target используется `moveNavigationPendingLabel`, а target объявляется отдельным transition только после acceptance;
- если start transition закрывает menu/modal sheet, сначала завершаются focus recovery, снятие containment/`inert`/scroll lock и выбор разрешённого endpoint, затем combined payload ровно один раз записывается в post-transition root channel; background/modal endpoint не получает промежуточной копии.

Urgent block/rejection/автоматическая cancellation не объединяется с неуспевшим polite start: transition, который не создал valid draft, выдаёт только urgent payload. Разные последующие semantic transitions не сливаются; их deduplication следует таблице ниже. Mode-start payload является барьером: effect более позднего target transition не может заменить его в той же commit/effect flush. Фиксированная миллисекундная задержка не является частью API — проверяется порядок DOM mutations и отсутствие потери/дублирования ключевого spoken state в ручной AT matrix.

Обычное движение focus, menu focus и открытие dialog не дублируются live message: их сообщает focused semantic node. После принятия user-initiated target для inline agenda `agendaUpdatedAnnouncement` отправляется polite только если focus остаётся вне agenda, но внутри владеющего Calendar; при `Enter` и переносе focus на её heading/control сообщение подавляется. Внешние изменения `agendaDate`, items/data/filter, locale/timezone/today и прочих props не создают unsolicited agenda announcement. Перенос focus на видимый loading/error region также подавляет дублирующее live announcement этого же transition.

Принятие `anchorDate`, равного последнему ещё актуальному user-initiated запросу previous/next из toolbar, один раз отправляет `monthChangedAnnouncement(monthStart)` через polite channel владеющего Calendar, если focus всё ещё внутри этого Calendar и не перенесён в grid; `monthStart` — первый день принятого месяца. До acceptance сообщения нет. Внешнее изменение месяца, принятие устаревшего/отменённого request, `PageUp`/`PageDown`, кнопка «Сегодня» и любой случай, где новая cell уже получила focus и сообщает дату, не создают toolbar-navigation announcement. Выход focus из Calendar до acceptance отменяет его.

Нормативный lifecycle остальных public announcement messages:

| Message | Trigger | Channel и suppression |
| --- | --- | --- |
| `blockedAnnouncement(reason)` | Отдельная user activation/confirmation, которую остановили core validation или policy | urgent; один раз на попытку. Простое попадание focus на недоступную дату не считается попыткой; если текущий target уже сообщил `isAllowed=false`, второе сообщение без новой confirmation не создаётся |
| `agendaUpdatedAnnouncement(date, count)` | Принят последний актуальный user-request inline agenda | polite только при focus внутри owning Calendar, но вне agenda; подавляется переносом focus в agenda, external/stale/cancelled update и выходом focus |
| `monthChangedAnnouncement(monthStart)` | Принят последний актуальный toolbar previous/next request | polite по точным правилам выше; grid navigation, Today, external/stale/cancelled update и уже озвучившая дату focused cell подавляют его |
| `refreshCompletedAnnouncement` | Committed переход `loading/refresh → ready` после того, как этот экземпляр ранее видел refresh | polite один раз на transition; initial load, remount уже в `ready`, `error/refresh` и commits той же state не создают его |
| `selectionStartedAnnouncement(date)` | Первый anchor нового range draft принят локальным interaction state | polite один раз; вход в range mode без anchor и single-date request его не создают. При той же activation, что и initial target, является первым fragment единого payload |
| `selectionTargetAnnouncement(range, isAllowed)` | В active range draft изменился нормализованный range или его allowed state | polite; initial target является вторым fragment start payload, а не отдельной записью; key-repeat без изменения tuple молчит. `isAllowed=false` уже сообщает запрет target и не дублируется `blockedAnnouncement` до отдельной confirmation |
| `selectionCancelledAnnouncement` | Пользователь явно отменил незавершённый range draft | polite один раз. Unmount, blocking/contract error, external controlled update и замена другим mode используют сообщение нового состояния либо молчат, а не выдают ложную пользовательскую отмену |
| `selectionCompletedAnnouncement(range)` | Props впервые приняли range последнего ещё актуального `onSelectionChange(range)` request | polite один раз после acceptance, не при callback emission. Отличающееся external значение, новый request или удаление controlled-пары отменяют ожидаемое announcement; таймера автоуспеха нет |
| `selectionClearedAnnouncement` | Props впервые приняли `null` последнего ещё актуального запроса «Снять выделение» | polite с теми же acceptance/cancellation правилами; исходное либо внешнее `null` сообщения не создаёт |
| `moveStartedAnnouncement(itemTitle)` | Валидный user interaction вошёл в move draft | polite один раз как первый fragment combined start payload; title разрешён через `untitledItemLabel` |
| `moveNavigationPendingLabel(itemTitle, monthStart)` | Active move запросил ещё не принятый месяц origin/target | одновременно видимый status и polite fragment на новую pending tuple; при start заменяет initial target fragment, но не создаёт вторую live mutation. Visible status сам не имеет live role. Acceptance, `Escape`, blocking state или смена target снимает status без ложного success |
| `moveTargetAnnouncement(itemTitle, date, isAllowed, utcOffset?)` | В active move изменились logical target date, allowed state или выбранный fold offset | polite по target-dedup правилу ниже; initial in-grid target является вторым fragment combined start payload, а не отдельной записью. После navigation acceptance либо дальнейшего target change создаёт отдельный transition; `isAllowed` сообщает доступность без повторения полного reason, title разрешён через fallback |
| `moveCancelledAnnouncement(itemTitle, reason?)` | Active move отменён явной командой/`Escape`/потерей pointer capture либо автоматически стал невалиден до request | Явная отмена передаёт `reason=undefined` и звучит polite один раз. Изменение канонического interval, `Calendar.timeZone` или недоступность item передают соответственно `moveItemChangedReason`, `moveTimeZoneChangedReason` либо `moveItemUnavailableReason` и звучат urgent; сравнение, availability и приоритет совпавших причин определены в 5.3.1. Изменения metadata сами по себе cancellation не создают. Blocking/contract error и unmount не дублируются cancellation message |
| `moveNoopAnnouncement(itemTitle)` | Подтверждён proposal, равный исходному interval по нормативному сравнению | polite один раз; request/callback/`pending` не создаются |
| `movePendingAnnouncement(itemTitle)` | Consumer впервые committed `pending` для выпущенного этим экземпляром `requestId` | polite один раз; само `onItemMoveRequest` ещё не считается pending. Синхронный terminal state может пропустить эту фазу |
| `moveSucceededAnnouncement(itemTitle)` | Consumer впервые committed `succeeded` для выпущенного этим экземпляром `requestId` | polite один раз на terminal request ID |
| `moveRejectedAnnouncement(itemTitle, reason)` | Consumer впервые committed `rejected` для выпущенного этим экземпляром `requestId` | urgent один раз на terminal request ID; reason берётся из принятого state |

Для move messages существуют две точки snapshot исходного `title`: начало draft для `moveStartedAnnouncement`, `moveNavigationPendingLabel`, `moveTargetAnnouncement` и `moveCancelledAnnouncement`; подтверждение по последнему committed item для `moveNoopAnnouncement` либо нового request. Request title фиксируется до вызова `onItemMoveRequest` и затем используется для его pending/succeeded/rejected announcements; более поздний item с тем же ID его не подменяет. Каждый сохранённый title разрешается через актуальный `untitledItemLabel` fallback по 11.2. Обновление metadata во время draft не пересоздаёт start/target announcement само по себе, не требует глубокой копии `data` и не мешает policy/request использовать актуальный item по 5.3.1.

Pending acceptance selection/month и request registry являются только transient bookkeeping для truthful announcements, не вторым источником принятой selection/items, но имеют разные сроки жизни. Pending acceptance selection/month очищается при соответствующих cancellation transitions. Issuer request registry живёт по 5.3.2 до unmount: отмена UI intent/draft, blocking или contract-error transition, смена timezone и отключение/повторное включение move-пары не стирают незавершённые requests и terminal/tombstones. Отмена UI не возобновляет уже объявленные сообщения и не отменяет внешнюю операцию. Очистка bookkeeping сама не вызывает callbacks; парный cleanup опубликованного draft следует отдельному lifecycle 5.3.

Move/range target объявляется только при смене логической даты, allowed state или UTC offset, а не на каждый pointer/key-repeat event. Одинаковая причина одного непрерывного block не повторяется; отдельная новая попытка с тем же текстом объявляется снова. Один semantic event и один terminal `requestId` объявляются не более одного раза, включая React StrictMode. Пользовательские titles передаются как plain text с bidi isolation.

### 12.5. Проверяемый WCAG/AT gate

Для каждого применимого WCAG 2.2 A/AA criterion release artifact содержит `pass`, `not applicable` с обоснованием либо `consumer-owned` с описанием границы. Известный package-owned failure блокирует stable и не маскируется как limitation. До stable `0.2.0` обязательны:

- axe tests для каждой строки state/presentation matrix: ready, initial/refresh loading, initial/refresh error, empty, agenda/menu/sheet open, selection/move draft, обе темы, обе density и LTR/RTL;
- semantic DOM/ARIA assertions для месяцев с четырьмя, пятью и шестью week rows в LTR и RTL: `aria-colcount="7"`, `aria-rowcount = weekCount + 1`, header row index `1`, последовательные week row indices `2…weekCount+1`, cell `aria-colindex="1…7"`, семь именованных `columnheader`, хронологический DOM/ARIA order и ровно один roving `tabIndex=0`. Viewer fixture не имеет `aria-multiselectable`/`aria-selected`; selection fixture имеет `aria-multiselectable="true"` и `aria-selected="true|false"` на каждой cell; `aria-current="date"` существует только на today. Overflow fixture отдельно проверяет полный count и один `moreItemsLabel(date, N)` в cell description, `aria-hidden` indicator и отсутствие собственного role/Tab-stop/focus;
- keyboard matrix для grid, DayAgenda, menus, selection и move, включая focus recovery и React StrictMode;
- contrast текста и non-text UI/focus indicator, light/dark/forced-colors, а также видимый и не перекрытый focus;
- target size не меньше `24 × 24` CSS px для navigation, date/action и overlay controls, а также для pointer/touch hit-area presentation-only `+N`, либо документированное допустимое исключение WCAG; этот geometry test не превращает `+N` в отдельный semantic control;
- reflow при ширине `320` CSS px и zoom `400%`, text-spacing override из WCAG 1.4.12, отсутствие потери content/actions; `layout="auto"` переходит в mobile presentation без двухмерной прокрутки всей страницы. Явно forced desktop проверяется отдельно как документированное исключение для двухмерного calendar content: прокрутка локальна его region, toolbar/actions остаются доступны;
- `prefers-reduced-motion`, desktop/mobile viewport и RTL visual/keyboard checks;
- ручные сценарии NVDA + Chrome/Firefox на Windows, VoiceOver + Safari на macOS, VoiceOver + Safari на iOS и TalkBack + Chrome на Android;
- single-pointer/touch сценарии выбора и переноса без dragging; keyboard alternative не заменяет проверку [WCAG 2.5.7](https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements.html);
- theme/locale/focus сохранены при portal overlays и смене responsive presentation;
- manual AT oracle для mode start фиксирует один atomic payload и порядок локализованных fragments `start → target-or-navigation-pending → instruction`, отсутствие промежуточной записи в закрываемый modal endpoint и отсутствие потери instruction при следующем target update;
- опубликованный accessibility statement со scope, датой, точными OS/browser/AT versions, известными ограничениями и ссылками на GitHub Release и датированный AT-отчёт в docs.

Ручные AT-сценарии содержат ожидаемые focus transitions и ключевые spoken states, а не только отметку «проверено». Точные версии фиксируются для каждого релиза в этом датированном отчёте, на который ссылается release manifest раздела 19.2. Если критерии не выполнены, пакет не заявляет WCAG 2.2 AA conformance.

## 13. Package architecture и dependencies

### 13.1. Один пакет

В `0.2` остаётся один npm-пакет: `@nelmad/calendar`.

Framework-independent core не использует React или DOM, но физически остаётся внутри пакета. Выделение `@nelmad/calendar-core` возможно после подтверждённого спроса.

### 13.2. Dependencies

Peer dependencies:

```text
react
react-dom
```

`react-aria-components`, `@internationalized/date` и остальные implementation libraries являются обычными dependencies. Потребителю не требуется устанавливать или синхронизировать их вручную.

Day.js не входит в dependencies, peerDependencies или devDependencies целевого SDK и не остаётся в его production dependency graph, imports или declarations. Наличие Day.js в самом приложении-потребителе допустимо, но календарь его не использует и не требует общего runtime/регистрации локалей.

Целевой install flow в React-приложении:

```bash
npm install @nelmad/calendar
```

Приложение обеспечивает совместимые React/ReactDOM из support matrix. Отдельная установка date library или locale-пакетов для использования календаря не требуется.

### 13.3. Distribution

- ESM — основной формат;
- CJS — compatibility format;
- types работают с TypeScript `moduleResolution: "bundler"` и `moduleResolution: "NodeNext"`;
- CSS подключается явно через `@nelmad/calendar/styles.css` в каждом CSS tree scope, содержащем Calendar или его portal; обычный document import не стилизует отдельный `ShadowRoot`, и package не выполняет runtime style injection;
- package import не обращается к `window` или `document`;
- SSR и hydration поддерживаются;
- exports являются tree-shakable;
- неиспользуемые независимые exports подлежат tree-shaking; отсутствие callback не считается статической границей и само по себе не обещает удаления DnD или DayAgenda из bundle;
- в `0.2` не вводится отдельная облегчённая entry point ради размера: единственный полный `Calendar` включает доступ к DayAgenda и всем заявленным interactions. Достижимые из него зависимости учитываются в общем бюджете раздела 15.

Корректность проверяется сборкой реальных consumer fixtures, а не только сборкой самого пакета.

## 14. Support matrix

- React/ReactDOM `^18.2.0 || ^19.0.0`, всегда согласованная пара с одинаковой exact version; смешанные major/minor/patch пары не поддерживаются. Для каждого релиза CI проверяет `18.2.0`, `19.0.0` и последний стабильный minor/patch каждого из major 18 и 19 на дату сборки candidate; совпадающие endpoints не дублируются. Каждая пара проходит development StrictMode, production и SSR/hydration fixtures;
- публичные declarations проверяются TypeScript `5.4` и последней стабильной версией на дату релиза с `moduleResolution` `bundler` и `NodeNext`;
- consumer SSR runtime: Node 22, 24 и 26 в отдельных semver ranges с явной минимальной patch-version для каждого major; нижние границы замораживаются до RC из фактической Intl/SSR compatibility и публикуются в `engines`/support table и release manifest раздела 19.2. Эти ranges, включая более новые patches внутри каждого major, поддерживаются во всей стабильной линии `0.2.x`: её patch-релиз не удаляет major и не повышает минимальную patch-version. Сузить поддержку можно только в следующем minor/major с явной support table и migration note; upstream EOL сам по себе не меняет обязательства `0.2.x` по runtime compatibility и не означает обещания upstream security updates;
- CI каждого release проверяет минимальную и последнюю доступную patch-version каждой Node range; maintainer toolchain использует одну закреплённую Node 24 patch-version и lockfile, но не сужает consumer runtime до неё;
- последние две стабильные версии Chrome, Edge, Firefox и Safari;
- текущий и предыдущий iOS Safari;
- Android Chrome: две последние стабильные Chrome версии на дату candidate, без Beta/Canary, на Android 12 и на последнем стабильном Android major. Если vendor не предоставляет установку конкретной пары, датированный device-отчёт в docs фиксирует ограничение и реально проверенную ближайшую версию, а публичная support table явно сужает эту комбинацию до первого RC; missing tuple не считается pass. Для touch/TalkBack обязательны физический телефон на минимальной OS и физический телефон на последней OS; touch viewport не шире `412` CSS px, portrait. Модель, RAM, Android build, Chrome и TalkBack versions фиксируются в этом отчёте; desktop emulation не заменяет real-device gate. Tablet-specific UI и Android ниже 12 не входят в support claim;
- Internet Explorer не поддерживается.

Фраза «последние две» задаёт публичную rolling policy. Для бинарного verdict каждого конкретного релиза manifest замораживает фактически проверенные browser/OS versions; новый browser release не меняет уже опубликованное evidence задним числом.

Manifest содержит exact React/ReactDOM pairs, Node/OS/browser/AT tuple, выбранный язык fixtures и hash timezone accepted-set. Для каждого ID списка CI проверяет byte-identical server/client acceptance и возможность форматирования/преобразования во всех exact tuples; runtime, случайно принимающий дополнительные aliases, не расширяет публичный список. Первый RC фиксирует этот baseline. Последующие rolling browser/minor/patch updates должны сохранить весь список; при регрессии устраняется compatibility defect либо документируется необходимый polyfill, а не удаляются ранее принятые IDs из `0.2.x`.

## 15. Performance budgets

Числа этого draft — кандидатные ceilings, а не измеренные характеристики текущего кода. На alpha выполняется performance spike на packed package; до первой beta отдельное датированное решение либо замораживает эти значения, либо один раз пересматривает их вместе с baseline, пользовательским impact и причинами. Stable `0.2.0` невозможен с незаполненным manifest или незамороженными thresholds. После freeze ослабление gate требует явного product/engineering решения и не может быть автоматическим следствием красного CI.

### 15.1. Bundle acceptance

Единственный обязательный JS size gate `0.2` — полный `Calendar`, включая `DayAgenda`, DnD, React Aria и код обеих тем: **не более 80 KB gzip**. CSS обеих тем вместе — **не более 10 KB gzip**. Здесь `1 KB = 1024 bytes`; JS и CSS измеряются отдельно.

Прежние 50 KB для изолированного Month View остаются research target, а не отдельным release gate: в `0.2` не вводятся облегчённый public entry point или опциональные interactions ради разделения этих бюджетов. Отдельный gate возможен после подтверждения статической границы, реально доступной потребителю. Это уточнение неоднозначного способа измерения, а не утверждение о новом измеренном размере пакета.

Канонический size fixture — checked-in Vite consumer, который собирает production ESM-приложение из установленного результата `npm pack`. Он использует только следующие package imports:

```ts
import {Calendar, classicTheme, neutralTheme} from '@nelmad/calendar';
import '@nelmad/calendar/styles.css';
```

Fixture рендерит `Calendar`, сохраняет runtime-доступность обеих тем и полного interaction contract, включая agenda, move и actions. Нельзя измерять пустой import, подменять компоненты stubs или использовать внутренние subpath imports. Выбор темы не является compile-time constant.

Протокол измерения:

- baseline — тот же consumer shell, React/ReactDOM, mount и harness без calendar imports, CSS и render; единственная разница сравниваемых сборок — подключение календаря;
- React и ReactDOM со всеми их package subpaths (включая `react/jsx-runtime` и `react-dom/client`) помечены одинаковыми externals в обеих сборках; все остальные runtime dependencies и все достижимые JS chunks, в том числе lazy chunks, учитываются;
- JS delta равна сумме gzip-размеров production JS chunks calendar-сборки минус той же сумме baseline; аналогично считается CSS delta. Gzip применяется к каждому минифицированному файлу отдельно, level `9`, без имени файла и временной метки в заголовке; source maps не учитываются;
- версии Node, Vite/bundler, JS/CSS minifier и gzip implementation, target, настройки сборки и общий lockfile фиксируются в репозитории. Baseline и calendar-сборка выполняются с одним toolchain и clean install; minifier и gzip не меняются между ними;
- CI сохраняет manifest, размеры baseline/calendar/delta и список chunks. Gate проверяется через `size-limit` или эквивалентный скрипт с указанным протоколом, а не по размеру исходного `dist`;
- отдельная root-import regression-проверка анализирует tree-shaking неиспользуемых независимых exports и output/module graph, но не является вторым JS size budget. Root `Calendar` имеет только `items` API. В calendar dependency graph и output отсутствуют Day.js, старый renderer и compatibility adapters; отсутствие Day.js проверяется отдельно от размера, а не достигается исключением его из измерения;

### 15.2. Runtime fixtures и среда

Пороговые значения ниже — проектные acceptance thresholds до реализации, **не результаты уже проведённых измерений**. Они проверяются на production build без React development/StrictMode overhead, сети, backend и стороннего кода приложения в измеряемом интервале.

Канонический desktop fixture: `layout="desktop"`, `classicTheme`, compact density, `locale="en-GB"`, `timeZone="UTC"`, `today="2026-08-19"`, первый день недели — понедельник и device scale factor `1`. Definite size задаётся самому Calendar root: его computed content-box имеет `inline-size: 1200px` и `block-size: 800px`, поэтому fixture намеренно измеряет constrained режим раздела 6.3, а не wrapper-only/intrinsic вариант. Manifest фиксирует эти computed root dimensions, число получившихся lanes и `+N` oracle. Целевой месяц — август 2026; grid range `[2026-07-27, 2026-09-07)` содержит ровно **42 visible days**. Все items видимы по source filter, их IDs, titles, data и порядок заданы детерминированным generator без случайного seed или текущей даты.

Канонический mobile fixture использует тот же месяц/data generator, `layout="mobile"`, Calendar root с definite `inline-size: 390px` и intrinsic `block-size: auto`, viewport `390 × 844` CSS px и device scale factor `3`. Он отдельно измеряет date activation → готовую inline agenda, scroll через dense agenda и touch move preview после long-press. Кандидатные ceilings: `p95 < 100 ms` для agenda update, `p95 < 32 ms` для preview frame и отсутствие browser long task `> 50 ms` во время заранее заданного scroll trace.

Auto-layout hydration fixture серверно рендерит общий compact layout и гидрирует его при container widths `390` и `1200` CSS px. Проверяются focus/agenda preservation, отсутствие дубликатов controls/callbacks, не более одной post-measurement замены presentation и записанный CLS. Числовой CLS budget замораживается вместе с первым baseline до beta; отсутствие этого значения к RC является провалом gate.

Один и тот же `today` snapshot передаётся во всех warm-up и измеряемых samples и фиксируется в manifest. Каноническая серия не запускает определение today после hydration или обновление на реальной полуночи. Работу без `today` проверяют отдельно по SSR matrix; её samples не смешиваются с performance acceptance. Часы измерения elapsed latency (`performance.now()` / browser trace) не замораживаются.

Каждый из трёх workloads содержит ровно **1000 items**, индекс `i` принимает значения `0…999`:

- **distributed:** timed items распределены по всем 42 дням; для item с индексом `i` день равен `i % 42`, время начала — `09:00 + 30 минут × (floor(i / 42) % 16)`, продолжительность — 30 минут;
- **dense:** все timed items находятся 19 августа, начинаются в `10:00` и длятся 30 минут; проверяются максимальное переполнение и agenda на 1000 items;
- **multiday:** all-day items; offset начала от начала grid равен `i % 36`, длина — `2 + (i % 6)` дней с exclusive end. Все интервалы укладываются в 42 дня, пересекают ячейки и границы недель.

До первой acceptance-серии в репозитории фиксируется обязательный benchmark manifest: SHA/integrity точного `npm pack` candidate, конкретный runner ID/class, dedicated/shared isolation policy, CPU model и выделенные cores, RAM, OS/architecture, power/CPU governor и отсутствие throttling, browser engine/version/build, automation version, viewport/device scale factor, Node/toolchain/lockfile, fixture revision и cache policy. Для stable verdict candidate уже имеет package version `0.2.0`; prerelease baselines дополнительно называют свою `0.2.0-*.N` integrity. Канонический runner использует закреплённую сборку Chromium без CPU/network throttling; обычная плавающая версия browser или неизвестное CI hardware не заменяют его. Пока manifest не заполнен и runner не воспроизводим, runtime gate не считается пройденным. Его изменение требует отдельного документированного решения и повторного baseline, а не неявного пересчёта thresholds.

### 15.3. Runtime acceptance protocol

Для каждой из двенадцати desktop-пар workload/операция выполняются 5 исключаемых warm-up прогонов и 30 измеряемых samples. Перед учётом времени semantic oracle подтверждает ожидаемые range, item order/count, overflow, final focus и proposed interval; неверный frame не является быстрым успешным sample. `p95` — 29-е значение в отсортированном массиве из 30 samples; результаты разных workloads и операций не усредняются. Все samples, trace и manifest сохраняются как CI artifacts прогона серии; skip, missing result и flake не считаются pass, выбросы не удаляются, повторный запуск не заменяет неудачную серию без зафиксированной причины сбоя инфраструктуры.

Mobile latency operations используют те же 5 warm-ups/30 samples и semantic-oracle правило; scroll trace выполняется 30 раз, и наличие long task в любом принятом trace проваливает этот gate. Auto-layout сценарии повторяются минимум 10 раз для каждой ширины, сохраняют все CLS/commit/callback counts и должны дать одинаковый semantic result; их числовой CLS verdict применяется после freeze по разделу 15.

- **Cold component initial render: `p95 < 200 ms`.** Каждый sample получает новый document и свежий экземпляр Calendar без ранее рассчитанных layout/measurement caches. JS/CSS уже загружены; network transfer, download и parse не входят в эту метрику. Начало — непосредственно перед первым React render с готовыми 1000 items; конец — первый painted frame с итоговым grid и overflow. Warm-up использует отдельные documents и не прогревает экземпляр измеряемого календаря.
- **Warm month navigation: `p95 < 100 ms`.** Calendar уже смонтирован, runtime caches сохраняются. Из июля выполняется переход в целевой август с синхронным controlled update месяца и заранее подготовленных 1000 items; подготовка следующего sample выполняется вне измерения. Начало — activation навигации; конец — painted frame целевого 42-дневного grid с обновлёнными items и overflow. Ожидание backend не измеряется и не подменяет этот сценарий.
- **Warm agenda open: `p95 < 100 ms`.** Начало — activation agenda даты с наибольшим количеством items данного workload; конец — painted frame готовой agenda с итоговым первым viewport и корректным полным count. В dense scenario дополнительный untimed oracle прокручивает/перемещает focus к последнему из 1000 items, активирует его и проверяет accessibility position/total semantics при virtualization. Перед следующим sample agenda закрывается, Calendar и caches остаются смонтированными.
- **Pointer preview update: `p95 < 32 ms`.** Drag уже активирован; начало — timestamp `pointermove` в заранее заданную соседнюю допустимую ячейку, конец — painted frame обновлённого preview. Long-press delay и ожидание drop/consumer update сюда не входят. Для каждого workload используются фиксированные item ID и последовательность целевых ячеек.

Paint timestamps подтверждаются browser trace; React commit или окончание чистой layout-функции не считаются paint. Итоговый frame дополнительно проверяется на отсутствие последующей корректировки grid/overflow в следующие два frames; время этой проверки не прибавляется к timestamp уже подтверждённого frame. Нельзя смешивать cold initial samples с повторным render из прогретого layout cache или заменять end-to-end metric временем вычислений core.

Чистые normalization/date math, распределение items по дням и layout в framework-independent core измеряются отдельно на тех же workloads. Их timings, React commit и задержка до paint сохраняются раздельно для диагностики, но не заменяют перечисленные пользовательские latency gates и не получают выдуманных измеренных baseline до реализации.

Bundle и runtime budgets для stable проверяются на точном packed `0.2.0` publish-candidate. Значения после freeze являются верхними границами, а не целями расходования бюджета. Превышение блокирует acceptance до исправления либо явного документированного пересмотра соответствующего порога; автоматическое ослабление thresholds или обновление baseline ради зелёного CI запрещено.

## 16. Privacy, licensing и network behavior

- основной package остаётся MIT как минимум до `1.0`;
- package не содержит license key;
- package не собирает telemetry;
- package не выполняет скрытых network requests;
- package не загружает внешние шрифты, иконки или другие assets;
- будущие коммерческие возможности выпускаются отдельными пакетами;
- уже открытые функции не переносятся задним числом в платную версию.

## 17. Переход на `0.2` без обратной совместимости

### 17.1. Breaking release

`0.2.0` — осознанный breaking release относительно `0.1`. Потребитель обновляет интеграцию перед переходом. Пакет не содержит legacy режима, runtime compatibility adapters или deprecated aliases. Это не отменяет узкое обещание совместимости stable API внутри patch-релизов `0.2.x` из раздела 5.7; следующий minor до `1.0` всё ещё может быть breaking с migration guide.

- У `Calendar` одна модель: `items: readonly CalendarItem<TItemData>[]` и явная IANA `timeZone`. Канонический публичный тип props — `CalendarProps<TItemData = unknown, TSourceData = unknown>`. Пустой календарь передаётся как `items={[]}`.
- `events`, `CalendarEvent`, `utcOffset`, lowercase `timezone`, `onEventPress`, `onEventEdit`, `onEventDelete` и `SeriesActionScope` не поддерживаются. Нет fixed-offset ветки, приоритета старых aliases или неявного UTC fallback.
- Старые root helpers `getMonthGridRange`, `getMonthGridWeeks`, `buildWeekLayout`, `formatEventTime`, связанные с ними типы и прежний standalone `CalendarSkeleton` API не сохраняются. Новый `getCalendarVisibleRange` имеет контракт разделов 5.1/5.7 и не является legacy alias.
- Старые theme/palette/labels exports, их типы и CSS aliases не переносятся как слой совместимости. Публичный subpath `@nelmad/calendar/tokens.css` также удалён: consumer импортирует единственный stylesheet `@nelmad/calendar/styles.css`, а значения настраивает через новые `theme`/`tokens` props либо документированные scoped CSS variables из раздела 10. Используются новые appearance/content customization и локализация из разделов 10–11.
- Day.js исключён из целевого SDK: нет production dependency, peer dependency, встроенной runtime-копии или ссылок в публичных declarations. Locale использует BCP 47 и `Intl`; импорты `dayjs/locale/*` в приложении не настраивают календарь.

### 17.2. Consumer-side migration guide

Migration guide помогает приложению преобразовать данные и callbacks; он не описывает дополнительный режим SDK и не требует сохранения старых runtime helpers.

1. `id` и `title` переносятся в `CalendarItem`; доменные поля, включая `taskId`, status и прежние flags, потребитель сохраняет в `data`. Внешний вид и доступность действий он задаёт новым appearance/actions API. Старые callbacks заменяются на `onItemPress`, `getItemActions` и `onItemActionRequest`.
2. Потребитель явно выбирает IANA timezone. Fixed offset не определяет единственную географическую зону или DST-правила, поэтому пакет не превращает `+03:00` автоматически в `Europe/Moscow` либо другую зону.
3. Offset-less timestamps до миграции разрешаются потребителем в явные instants на основании исходной семантики данных. Они не передаются в новый API как RFC 3339 и не получают неявную timezone среды.
4. Для прежнего all-day event потребитель получает start date и последнюю включённую end date в прежнем display offset. Новая `allDay.end` — следующий календарный день после последней включённой даты; при отсутствующем старом `end` последней датой считается start date. Прибавляется календарный день к date-only значению, не `24h` к instant.
5. Для timed event сохраняются instants `start/end`; отсутствующий `end` остаётся отсутствующим. Новый exclusive-end layout может отличаться: окончание ровно в полночь больше не добавляет item в следующий день. Миграция не прибавляет миллисекунду или день ради сохранения старой полосы и не обещает roundtrip старого layout.
6. Loading, theme, palette и labels настройки переводятся на новый контракт явно; SDK не распознаёт старую структуру props и не выполняет скрытый mapping. Импорт `@nelmad/calendar/tokens.css` удаляется и заменяется на `@nelmad/calendar/styles.css`; прежние token aliases переносятся вручную в `tokens` prop или новые scoped CSS variables, а не продолжают действовать глобально.

Пример all-day конверсии: прежние включённые даты 3–4 сентября становятся `[2026-09-03, 2026-09-05)`; event на 3 сентября без окончания становится `[2026-09-03, 2026-09-04)`. Сохраняются покрываемые календарные даты, а не timestamp/time-of-day поля старого all-day объекта; при необходимости исходные значения остаются в consumer `data`.

### 17.3. Проверки перехода

- Type-negative fixtures проверяют отклонение старых props и imports: `events`, `utcOffset`, `timezone`, event callbacks, удалённые types/helpers; отсутствие `items` или `timeZone` также не проходит typecheck.
- Положительные type fixtures используют только `CalendarProps<TItemData, TSourceData>` и новый публичный API; декларации не содержат Day.js или иных внешних date types.
- Package manifest, граф установленных production-зависимостей SDK и production output после `npm pack` не содержат Day.js, его locale modules или runtime adapters для API `0.1`.
- Примеры migration guide проверяют all-day inclusive-to-exclusive конверсию, отсутствующий `end`, сохранение timed instants и midnight layout difference. Это проверки документированной consumer-side миграции, не legacy rendering suite SDK.
- README и runnable examples явно отмечают breaking change и не используют удалённый API.

## 18. Документация `0.2`

Отдельный documentation-сайт не требуется. Основные поверхности:

- npm README;
- живой Storybook;
- runnable Vite example;
- runnable Next.js App Router example;
- generated API reference;
- migration guide `0.1 → 0.2`.

README и API reference публикуются на английском и русском с взаимными ссылками. Обе версии содержат одинаковые public exports/props, defaults, обязательные пары, ограничения, timezone/interval semantics и runnable quick start для одного tarball; переводы не обязаны быть буквальными. Parity check по разделам и проверка примеров обеих версий выполняются в CI на каждом pull request и в release workflow на проверяемом tarball; их отчёт хранится среди CI artifacts прогона. Отсутствие языка либо устаревший контракт в одной версии блокирует docs gate. CIS pilot использует русские README/API, второй участник может выбрать английские; выбранный язык фиксируется в отчёте.

Обязательные примеры:

- quick start;
- sizing quick start без fixed-height parent, использующий встроенную intrinsic высоту, и отдельный constrained-height пример, в котором уменьшается число lanes и появляется `+N`, но grid/controls не обрезаются;
- controlled navigation и visible-range loading: SSR-prefetch через `getCalendarVisibleRange`, deduplicated client notification и удержание исходного item через `onItemMoveDraftChange` при переносе между месяцами;
- независимые agenda date и selection: простой viewer без controlled agenda, controlled agenda с отложенным принятием, заблокированная для selection дата с доступными событиями;
- optimistic move, `itemMoveStates`, synchronous accept/reject, async rollback и защита от устаревшего request;
- общие `itemMoveStates` для нескольких экземпляров и remount без повторных announcements; UUID request identity;
- generic item data и actions;
- независимые item/source generics, controlled source filter с delayed acceptance и fail-open неизвестного `calendarId`;
- custom `renderItem` с пассивным содержимым и отдельными actions; пример custom toolbar/retry control с собственной accessibility;
- classic/neutral themes и custom tokens;
- mobile month + agenda;
- drag multi-day item из agenda и из продолжения grid bar: различие origin, предсказуемое новое начало и no-op lifecycle;
- IANA timezone и DST boundary;
- validation/fallback examples для malformed ISO/RFC3339, unsupported locale и invalid controlled pair;
- all-day exclusive-end semantics;
- RTL;
- keyboard operation;
- single/range selection и move без drag на touch; переходы Space/Enter/Escape с diagram/table состояний;
- SSR с общим `today` snapshot и без него, auto/forced layouts и portal theme scope, включая явное подключение `styles.css` внутри `ShadowRoot`;
- loading/empty/error states;
- переход с `0.1` на новый API без runtime compatibility layer.

Отдельный docs-сайт рассматривается после появления нескольких полноценных views в `0.3`.

## 19. Release acceptance criteria

### 19.1. Functional

- все возможности Scope `0.2` реализованы;
- одинаковые input props дают детерминированный layout;
- selection, create, move, filter и actions не мутируют consumer data;
- all-day, timed, multi-day, DST и edge-of-month cases покрыты тестами;
- каждая строка scope/19.4 сопоставлена в requirement ledger репозитория с re-runnable automated check (команда и test), который выполняет release workflow, либо с явно указанным manual-only сценарием, шагами и ожидаемым результатом; формулировка «где возможно» не является допустимым evidence;
- desktop, mobile и forced layouts соответствуют контракту;
- quick-start без definite height родителя даёт полный intrinsic Month grid; constrained root height, нулевое/недоступное измерение и последующее восстановление размера соответствуют sizing/overflow-контракту раздела 6.3 без обрезанных controls;
- обе темы и density combinations работают без изменения interaction semantics;
- примеры consumer-side перехода `0.1 → 0.2` проверяют новые результаты без сохранения legacy runtime.

### 19.2. Quality gates

- unit/integration/e2e suite проходит;
- accessibility gate из раздела 12 проходит;
- support matrix из раздела 14 проходит;
- performance budgets из раздела 15 проходят;
- consumer fixtures собираются без warnings и type workarounds; negative fixtures подтверждают отклонение старых props и отсутствие удалённых exports;
- final publish-candidate tarball с package version `0.2.0`, созданный через `npm pack`, проходит clean-install smoke до публикации; после публикации registry install подтверждает ту же integrity;
- README, API reference и Storybook соответствуют фактическому API; EN/RU README/API проходят parity gate раздела 18;
- в production bundle нет telemetry, CDN references или development warnings.

Stable gate считается пройденным только по успешному release workflow CI для точного publish-candidate tarball, уже содержащего version `0.2.0`. Workflow запускается push version tag, один раз собирает tarball через `npm pack` и выполняет на этом файле все automated gates: unit/type/e2e/SSR-StrictMode/a11y, packed consumers, bundle/runtime и network checks; Next/Vite, ESM/CJS и SSR fixtures устанавливают этот tgz. Release manifest — отчёт этого run: git SHA, lockfile hash, tgz SHA512/integrity, package contents, команды, tool/runtime versions и outcome каждого gate, ссылки на bundle/runtime samples и traces, network log и датированные manual AT- и pilot-отчёты. Manifest, logs и reports run хранятся как CI artifacts, а не в репозитории. `skip`, missing result и unresolved flake не являются pass; infrastructure rerun сохраняет оба run и причину. Публикуется тот же файл через `npm publish <tgz> --provenance` без rebuild: npm provenance (Sigstore attestation) связывает опубликованный package с commit и workflow run; затем workflow создаёт GitHub Release с notes из раздела CHANGELOG этой версии и приложенным tgz. Любое изменение байтов аннулирует technical gates. Ручные результаты — AT, физические устройства, pilots — оформляются краткими датированными отчётами в docs с integrity проверенного tarball, а не выгрузками raw artifacts.

Pilot reports могут относиться к названному `0.2.0-rc.N` tarball и указывают его отдельную integrity. Release manifest называет reviewed diff (commit range) от этого prerelease к final `0.2.0`; изменение поведения после pilot требует повторить затронутый pilot scenario, а не считать старый отчёт доказательством нового кода. Prerelease validation каждого advanced epic из раздела 2.1 подтверждают его датированные decision records и pilot reports, на которые ссылается manifest.

### 19.3. Pilot validation

До признания MVP готовым нужны две независимые внешние продуктовые интеграции, а не два maintainer examples:

- одна Next.js;
- одна Vite;
- участник — React/TypeScript frontend-разработчик, ранее не работавший с API `0.2`; старт — clean pinned starter, опубликованные README/API reference и RC tarball, без private консультации maintainer;
- basic-сценарий: установить package/CSS, показать 50 подготовленных domain records, загрузить новый visible range при навигации и открыть item на desktop/mobile; production build должен пройти не более чем за 30 минут;
- расширенный onboarding-сценарий: типизировать свою item/source data, подключить actions, controlled source filter и custom tokens; production build и keyboard smoke должны пройти не более чем за два часа от того же старта. Если sources явно исключён из stable scope по разделу 2.1, decision record до начала обоих pilots назначает одну и ту же оставшуюся controlled-возможность вместо filter;
- хотя бы один pilot использует mobile layout и IANA timezone;
- хотя бы один из двух пилотов относится к реальному или уже запланированному продукту для CIS-аудитории; его basic-сценарий и необходимые положительные advanced-эпики используют `ru-RU` как resolved date locale и язык package messages. Простое переключение locale в искусственном demo не засчитывается как проверка целевого рынка;
- в обоих пилотах advanced epics, оставшиеся в stable scope по разделу 2.1, проверяются реальным пользовательским сценарием, а не только включённым prop;
- для каждого advanced epic, оставшегося в stable scope, оба отчёта удовлетворяют определению положительного сценария из 2.1 и содержат явный `go`; `iterate`/`defer` хотя бы в одном из двух необходимых подтверждений не засчитывается как stable evidence для включения этого epic;
- нет открытых P0 (потеря/искажение данных, security/privacy, полностью неработающий package) и P1 (core job, accessibility, SSR или timezone блокирован без документированного безопасного workaround) defects; допустимый P2 не нарушает acceptance и опубликован как known limitation;
- публичный API не требует доступа к внутренностям или неподдерживаемых обходных решений.

Двухчасовой таймер измеряет именно указанный onboarding-сценарий. Проверка спроса на все advanced epics, оставшиеся в stable scope, — отдельная обязательная часть каждого pilot: она может завершаться после этого таймера, без ограничения двумя часами, но с учётом времени и помощи в отчёте. Успешный onboarding не заменяет market gate. Если core task уже выполнен в timed части на реальном сценарии и отвечает определению 2.1, evidence переиспользуется без повторения работы. Минимальные core tasks для оставшихся в scope epics:

| Epic | Обязательный результат в каждом из двух pilots |
| --- | --- |
| Sources | Подключить минимум два реальных source, скрыть и вернуть один; после принятия props grid, agenda, counts и actions согласованно меняются, domain items остаются в consumer store. |
| Selection/create | Выбрать дату и диапазон, проверить реальное policy-ограничение, открыть consumer-owned форму по принятой selection и после сохранения показать новый domain item через `items`. Редактор не становится частью SDK. |
| Move | Перенести реальный item, принять результат и обработать отклонение consumer backend/контролируемым failure fixture; сохранить более свежие данные и показать reason. Проверить pointer/touch и keyboard/button путь; хотя бы один move пересекает месяц с range loading. |
| Расширенный customization | Показать реальное доменное поле через пассивный item/agenda slot, добавить domain action, настроить tokens и class callback по состоянию; сохранить package-owned summary, focus и single grid Tab-stop на desktop/mobile. |

Для каждого pilot сохраняется короткий отчёт: профиль участника, starter commit, package integrity, язык и разрешённые материалы, timestamps начала/окончания обоих timed checkpoints и untimed epic tasks, выполненные шаги, отклонения и найденные defects. Помощь maintainer останавливает таймер только при подтверждённой проблеме окружения; подсказка по API означает непрохождение соответствующего time gate. Для отдельного epic task помощь учитывается как defect/workaround evidence и не отменяет требование самостоятельно завершить core task через public API; формального включения prop недостаточно для `go`.

### 19.4. Минимальная regression matrix уточнённых контрактов

Эти примеры задают ожидаемое поведение будущей реализации; наличие таблицы не означает, что тесты или функции уже реализованы.

| Сценарий | Ожидаемый результат |
| --- | --- |
| All-day `[2026-09-03, 2026-09-04)`; затем пустой `[2026-09-03, 2026-09-03)` | Первый item виден только 3 сентября; второй отклоняется validation и не учитывается в count. |
| Timed `2026-09-03T23:00:00+03:00 → 2026-09-04T00:00:00+03:00`, календарь `Europe/Moscow` | Item виден только 3 сентября. Timed без `end` на `2026-09-04T00:00:00+03:00` виден только 4 сентября; move сохраняет отсутствие `end`. |
| Однодневный all-day, однодневный timed и timed через две локальные даты | All-day всегда является bar, включая segment в одной cell; однодневный timed является chip; timed на нескольких локальных датах является bar. |
| `Pacific/Apia`: timed `[2011-12-29T23:00:00-10:00, 2011-12-31T01:00:00+14:00)` и all-day `[2011-12-29, 2012-01-01)`; move moment `2011-12-29T10:00:00-10:00` на 30 декабря | Timed длится ровно 2 elapsed часа и имеет отдельные segments `[2011-12-29, 2011-12-30)` и `[2011-12-31, 2012-01-01)`, не занимает 30 декабря. All-day занимает 29, 30 и 31 декабря непрерывно. Новый timed start `2011-12-30 10:00` отсутствует: preview сообщает gap, request не отправляется. Перенос аналогичного однодневного all-day на `[2011-12-30, 2011-12-31)` разрешён. |
| Anchor на нижней/верхней границе и timestamp `9999-12-31T23:59:59-23:59` | Месяцы `0001-02` и `9999-11` рендерят полный grid, дальнейшая навигация недоступна; timestamp отклонён из-за instant overflow. Представимая часть другого valid interval не теряется из-за проекции local tail за ISO domain. |
| Server вызывает `getCalendarVisibleRange`, затем Calendar hydrate в StrictMode | Helper range равен первому committed callback для default и explicit week-start; callback приходит один раз, не вызывается при SSR/render или замене callback identity. Malformed input helper синхронно бросает `RangeError`. |
| Locales `ar-SA-u-ca-islamic`, `th-TH-u-ca-buddhist` и well-formed unsupported tag | Dates/range остаются Gregorian и SSR-stable; `u-ca-*` не меняет модель. Unsupported locale детерминированно resolve-ится в `en-US`, не host locale, с development warning. |
| Move начала `2026-03-28T02:30:00+01:00` на 29 марта в `Europe/Berlin` | `02:30` попадает в gap: запрет, понятный reason, request не отправляется; нет скрытого переноса на `03:30`. |
| Move начала `2026-10-24T02:30:00+02:00` на 25 октября в `Europe/Berlin` | Выбран более ранний `2026-10-25T02:30:00+02:00`; offset указан в preview/announcement. No-op исходного `2026-10-25T02:30:00+01:00` сохраняет именно этот instant. |
| Move `2026-03-28T01:30:00+01:00 → 2026-03-28T03:30:00+01:00` на 29 марта в `Europe/Berlin` | Новое начало `01:30+01:00`, окончание `04:30+02:00`: elapsed duration остаётся 2 часа. Отдельный случай проверяет отличающуюся авторскую timezone и её сохранение. |
| Selection на 3 сентября; открытие agenda 10 сентября, в том числе при запрете selection 10-го | Показывается 10 сентября, selection остаётся прежней. В controlled agenda режиме задержка/отклонение props не открывает неверный день; viewer без selection работает. |
| Range mode: Space на 10 сентября → назад до 3 сентября → Space → Escape | Единственный запрос `[2026-09-03, 2026-09-11)`; Escape после завершения не очищает принятую selection. Escape до второго Space не отправляет запрос. Two-tap даёт тот же диапазон. |
| Single-date selection `[2026-09-03, 2026-09-04)`, 3 сентября разрешено, 4 сентября запрещено | Выбор разрешён: exclusive `end` не является выбранным днём. Диапазон, действительно включающий 4 сентября, запрещён. |
| Controlled selection request и «Снять выделение» принимаются с задержкой, отклоняются либо заменяются external value | Start/target messages следуют draft; completion/cleared звучат только после acceptance последнего актуального request, никогда при callback emission. Rejected/stale/external state, remount и StrictMode не создают ложного или повторного success. |
| Keyboard PageDown на 31 января с delayed/непринятыми props | Пока старый месяц — focus на прежней ячейке; после актуального принятия — 28 февраля. После Tab из grid позднее принятие props не крадёт focus. Проверяется RTL и range через границу месяца. |
| Toolbar previous/next с delayed acceptance, затем stale request/внешний update/выход focus; отдельно Today вне grid с matching delayed acceptance, `Tab`/`Escape`/unrelated action, stale acceptance и blocking/contract state | Только принятие последнего актуального previous/next request при focus внутри Calendar и вне новой gridcell один раз объявляет `monthChangedAnnouncement`. Для Today matching acceptance переносит roving/DOM focus в today cell только пока focus на той же инициировавшей кнопке, и live message не дублирует имя cell. Уход focus, отменяющее действие, stale value или blocking/contract transition отменяют Today intent раньше acceptance; поздний update не забирает focus из другого control, уже находящийся в grid focus следует только общему external-update правилу, а последующее исправление blocking/contract state intent не возобновляет. Ни один отменённый Today-path не создаёт announcement; StrictMode не дублирует focus effect или сообщение. |
| Move request → pending без изменения `items` → rejected | Нет таймера автоматического отказа; до committed state `movePendingAnnouncement` молчит, затем `isPending` показан и сообщение звучит один раз. Повторный move заблокирован. На reject старые items остаются, `moveRejectedAnnouncement` с reason звучит один раз только у issuer. Отдельно проверяются synchronous terminal без pending, optimistic rollback и succeeded с server-normalized interval. |
| Move request → несколько unrelated commits и продвижение часов при `itemMoveStates=[]` → поздний pending → terminal; отдельно первый ответ сразу terminal и unmount до ответа | До acknowledgement `isPending=false`, но issuer блокирует повторный move того же item; нет timeout, auto-reject, move-state announcement или warning только за отсутствие ответа. Поздний pending принимается и объявляется один раз, terminal завершает lock и объявляется один раз; terminal первым ответом не создаёт pending announcement. Unmount прекращает локальное bookkeeping без missing-ack warning и без отмены внешней операции. |
| Touch «Перенести» → tap даты → «Подтвердить» / «Отмена» | Тот же proposed interval, что у agenda drag/keyboard с той же датой нового начала; для grid drag учитывается смещение захвата. Общие policy checks; одна операция без long press. Отмена не вызывает callback и возвращает focus. |
| All-day `[2026-09-03, 2026-09-12)` показан в agenda 10 сентября; drop на 11 сентября | Agenda drag и команда «Перенести» дают `[2026-09-11, 2026-09-20)`. Grid drag с захватом ячейки 10 сентября даёт `[2026-09-04, 2026-09-13)`. Проверяются обе точки отсчёта, desktop/touch и timed multi-day item. |
| No-op drag / команда «Перенести» с исходной датой начала | Request не создаётся, timestamps сохраняются, draft lifecycle заканчивается `null`. Для agenda origin равен дате начала, а не дате просматриваемого списка. |
| Два Calendar, разные React roots и remount с общим `itemMoveStates`; затем разные datasets с IDs `tenant-a:42` и `tenant-b:42` | Все новые request IDs различаются; внешний pending блокирует один и тот же доменный item в обоих экземплярах, но только issuer объявляет результат. Pending `tenant-a:42` не блокирует `tenant-b:42`. Старый результат не подтверждает новый request и не воспроизводится после remount. Если оба экземпляра отправили move одного item до committed pending, consumer/server атомарно подтверждает не более одного и отклоняет остальные. Sharing example явно квалифицирует IDs и не использует одинаковый локальный `42` для разных сущностей. |
| Move в другой месяц с `loading/refresh` нового visible range | Потребитель удерживает item по draft id, затем по request state; неблокирующий refresh не отменяет move. `loading/initial`, настоящее удаление или изменение исходного interval отменяет незавершённый draft по своим правилам. |
| Во время draft consumer пересоздаёт item/interval с теми же значениями, меняет `title`/`data`/видимый `calendarId` и записывает прежние timed instants другим offset или fractional form | Draft сохраняется без повторного start/cancellation/cleanup; `data` может содержать циклическую ссылку и не проходит deep comparison/clone. Preview/policy используют latest item; при подтверждении `request.item` содержит новые metadata, а `previousInterval` — точные latest boundaries. При no-op timestamps не откатываются к draft-start строкам. Draft messages используют title начала, no-op/request — title подтверждения; последующее переименование не меняет pending/terminal title snapshot. |
| В active draft меняются interval kind/start/end instant, наличие moment `end` либо наличие/identifier авторской timezone; отдельно item исчезает/становится invalid/filtered, меняется Calendar timezone или policy запрещает latest item | Каждое каноническое изменение interval отменяет draft с `moveItemChangedReason`, недоступность — с `moveItemUnavailableReason`, Calendar timezone — с `moveTimeZoneChangedReason`; при совпадении причин действует приоритет 5.3.1, cleanup один и stale request отсутствует. Одно лишь изменение policy не выдаёт ложный item-changed: актуальный запрет виден, submit не отправляется, draft можно исправить/отменить. Возврат прежнего interval после cancellation не восстанавливает draft. |
| Move запускается командой из controlled inline/overlay agenda, а initial target вне grid; отдельно до acceptance выполняются `Tab`/`Shift+Tab`, `Escape`, unrelated action, stale acceptance и blocking/contract transition | После закрытия overlay и снятия modal effects package до `onNavigate` фокусирует текущую roving cell и создаёт source=`grid` intent; до acceptance focus остаётся в прежнем grid, pending status видим, submit недоступен. Matching acceptance при сохранившемся grid focus переносит roving/DOM focus в target. Tab-away, unrelated/stale и blocking/contract paths target-focus не крадут; `Escape` также отменяет draft/pending target. Непредставимая в Month grid origin-date даёт доступный boundary block без navigation request. |
| Controlled source selector скрывает известный source с задержанным принятием props | Desktop `menuitemcheckbox` и mobile checkbox/toggle сохраняют прежние `aria-checked` и `showSourceLabel`/`hideSourceLabel` до acceptance. Затем hidden items исчезают из grid/agenda/count/actions. Item без `calendarId` и с неизвестным ID остаётся видимым; hidden move draft отменяется с одним `null`, внешний pending request остаётся. |
| Removal/re-addition optional controlled-пар agenda, selection, filter и move; замена draft callback identity | Agenda seeds uncontrolled state последней принятой датой; selection становится viewer, filter показывает все sources, move отменяет draft. Callback, получивший item ID, получает парный `null`; новая identity не получает retroactive event. Повторное включение принимает только новые props и не испускает callback из-за самого переключения. |
| После `onItemMoveDraftChange(itemId)` props становятся contract-invalid | Перед safe error-state исходная callback identity ровно один раз получает cleanup `null`; request/change callbacks не вызываются. Повторные invalid renders и последующее исправление props не повторяют lifecycle event. |
| Initial/refresh loading и initial/refresh error при одинаковом массиве `items`, когда открыты overlay/draft/pending focus target | Phase, а не длина массива, выбирает blocking или stale-content UI; `aria-busy` только у refresh loading, `hasStaleItems` считается по valid filtered items в range. Blocking transition закрывает поверхности и отменяет UI drafts/targets с единственным парным move cleanup `null`, но не очищает accepted agenda/selection и не отменяет уже выпущенный request; refresh сохраняет UI state, а только его переход в ready один раз объявляет completion. Retry доступен и вызывается один раз только для data error, а для contract error отсутствует. |
| `ready` без items в accepted visible range, но с item вне grid либо пустым filter result, при включённом selection/create | Toolbar и Month grid остаются интерактивны; item вне range не подавляет отдельный empty region, а пустой DayAgenda сообщает отсутствие items. Пользователь может выбрать дату/диапазон и создать первый item. |
| Root без definite height; затем constrained height и resize на 0/1/несколько lanes | Без fixed-height parent Month grid получает intrinsic высоту из числа недель и preferred row size. При constraint controls не обрезаются, при необходимости grid прокручивается; при нулевом/невалидном измерении виден `+N` с hit-area не меньше `24 × 24` CSS px и полным числом скрытых items дня, а восстановление размера атомарно меняет lanes и `N` без loop. Indicator остаётся `aria-hidden`, без role/Tab-stop/focus, поэтому его появление или исчезновение не запускает focus recovery. |
| Одинаковые items, resize на 0/1/несколько lanes и consumer comparator, возвращающий `0` | `+N` считает скрытые item records после filter и резервирует свою строку; его hit-area делегирует одну activation владеющей date cell. Cell description содержит ровно один `moreItemsLabel(date, N)`, а сам indicator не является самостоятельным interaction/accessibility target. Обновление атомарно; порядок grid/agenda совпадает, окончательный tie-break по `id` детерминирован. |
| Два пересекающихся multi-day item и consumer comparator | Comparator получает только `timeZone`; один глобальный порядок сохраняется во всех датах, agenda и continuation lanes внутри недели. Date/view-dependent перестановка невозможна через public context. |
| Multi-day bar разбит границей недели; render/class callbacks и press разных частей | Month slot вызывается один раз на каждый точный `segmentRange`; `isSelected` означает пересечение segment. Press request содержит hit-tested `date` внутри segment; agenda context содержит agenda date и ровно одну строку item. Appearance одинаков для item целиком. |
| Month grid для месяцев с 4/5/6 week rows, в LTR/RTL, viewer/selection, с overflow, policy block и multi-day bars | В accessibility tree один grid и один roving Tab-stop; visual items/`+N` не создают widgets. Точно проверяются семь именованных headers, `aria-colcount=7`, `aria-rowcount=weekCount+1`, header/week row indices `1…weekCount+1`, cell column indices `1…7` и хронологический DOM/ARIA order. Viewer не имеет `aria-multiselectable`/`aria-selected`; selection имеет `aria-multiselectable=true` и boolean `aria-selected` на каждой cell; только today имеет `aria-current=date`. Cell сообщает дату, accepted states, полный count и один `moreItemsLabel` при overflow; все items по одному разу доступны через semantic agenda list. |
| Menu внутри agenda overlay; child trigger удалён/отфильтрован; два `Escape` | Первый `Escape` закрывает только menu и оставляет focus на ближайшем control/heading внутри всё ещё открытой agenda; fallback за пределы parent overlay не используется. Второй закрывает agenda и применяет общий logical item/date/roving/root fallback; внешний focus календарь не крадёт. |
| Открытая agenda проходит inline ↔ popover ↔ sheet и `auto ↔ overlay`, в том числе с focus в portaled child menu, с уже внешним focus и `agendaDate` вне grid | Descendant stack считается частью owner: children закрываются top-down и не остаются orphan, accepted date сохраняется. При focus внутри owning stack существует ровно одна новая presentation и восстанавливается тот же logical control. Уже внешний focus не крадётся: inline presentation остаётся единственной inline agenda, а если target является overlay, passive switch закрывает старую поверхность и не монтирует новую, поэтому ожидается ноль agenda overlay controls до следующей activation. Modal `inert`/scroll lock reference-counted и полностью очищаются после последней modal surface; неизменившийся resolved popover не перемонтируется. |
| Toolbar source selector открыт как mobile sheet, затем layout становится desktop; обратный переход начинается с desktop menu | Standalone selector закрывается и не открывает автоматически другую presentation, accepted visibility не меняется. Внутренний focus возвращается в новый toolbar trigger, внешний сохраняется; после sheet нет остаточного `inert`, scroll lock или orphan portal. |
| Desktop agenda покидают `Tab`/`Shift+Tab`; затем pointer нажимает focusable и нефокусируемую внешнюю цель | Overlay логически исключается сразу после trigger: Tab выбирает первый следующий, Shift+Tab — последний предыдущий tabbable в composed order, не возвращаясь к trigger. Valid внешний pointer focus сохраняется; если active element оказался на `body`, применяется recovery 12.3. |
| Непустой mobile item/source sheet открыт, затем итоговый item action set без доступного move становится пустым либо sources становится меньше двух | Sheet изначально именован видимым heading через `itemActionsLabel`/`sourceSelectorLabel`, item buttons и source checked-state доступны. После исчезновения trigger sheet закрывается, focus восстанавливается по 12.3; пустая недостижимая sheet не создаётся. |
| Overlay trigger и target в одном tree scope, затем target portaled через границу `ShadowRoot` или удалён | `aria-haspopup`/`aria-expanded` отражают presentation/open state; `aria-controls` существует только для одновременно connected узлов с одинаковым `getRootNode()` и иначе удаляется без dangling/cross-tree IDREF. Agenda, item menu и source menu сохраняют собственное имя независимо от trigger. |
| Вход и выход из range mode; первый anchor; вход в move с initial target в grid либо с controlled navigation | Grid description получает ровно одну mode-инструкцию, target navigation её не повторяет, выход восстанавливает обычное описание. Range entry выводит instruction одним payload, а первая следующая anchor activation — один payload `selectionStarted → selectionTarget`. Move entry выводит ровно один atomic payload `moveStarted → target-or-navigation-pending → moveInstructions`; visible pending status не создаёт второй live event, StrictMode не дублирует fragments. |
| Move начинается командой либо long press внутри modal agenda sheet | Command закрывает sheet до включения grid mode. Long press до удаления dialog передаёт active pointer стабильному drag-session owner; только после успешного capture sheet удаляется, containment/`inert`/scroll lock снимаются, focus переходит в initial grid target и grid начинает hit-testing. Capture переживает закрытие; настоящая последующая потеря отменяет draft без request. Combined start payload записывается один раз только в post-transition root endpoint. |
| User открывает controlled agenda tap/click или `Enter` с delayed acceptance, затем переводит focus в toolbar того же Calendar, наружу либо совершает unrelated action | Последующее user focus/action отменяет open/focus intent и ожидаемое announcement, не отменяя уже отправленный callback. Позднее matching prop принимает данные, но не открывает overlay, не переносит focus и не выдаёт success speech; external/stale value и StrictMode также молчат. Без отмены inline tap/click объявляет update только при focus внутри Calendar вне agenda, а `Enter` с переносом focus не дублируется live region. |
| Последний controlled agenda target принимается после либо в одном commit с passive inline → popover/sheet switch | Если user intent ещё актуален, промежуточная старая presentation не монтируется: ровно один раз открывается текущая resolved presentation с её input-specific initial-focus/announcement rule. Пассивный switch без pending intent следует обычному focus-gate; отменённый intent ничего не открывает и внешний focus не крадётся. |
| Удержание arrow/pointer на одной запрещённой move/selection цели, затем отдельная повторная попытка | Непрерывная попытка не спамит live region и StrictMode не дублирует событие; новая попытка с тем же reason объявляется снова. Два Calendar не объявляют события друг друга. |
| Modal sheet открывается и закрывается при двух Calendar с активными live-region hosts | Во время modal состояния событие записывается ровно в один разрешённый endpoint внутри owning sheet; background endpoint владельца очищен/inert, второй Calendar молчит. После закрытия modal routing возвращается root endpoints без повторного объявления и без оставшегося inert host. |
| Calendar root получает `aria-labelledby` с valid same-root ID, смешанными missing/cross-ShadowRoot IDs либо полностью invalid списком при SSR/hydration | Server и первый client render совпадают: непроверенный `aria-labelledby` отсутствует, резервный `aria-label` именует root без DOM lookup. После commit valid same-root IDs добавляются в исходном порядке и имеют приоритет; invalid IDs исключаются с development warning. Если valid reference нет либо позднее исчезает, attribute отсутствует и имя непрерывно берётся из consumer `aria-label`, затем catalog fallback, без callback/focus/announcement или hydration warning. |
| RTL grid с mixed Arabic/Latin title: `ArrowLeft`, `Home`, `PageDown`, drag и previous/next controls | Left идёт в следующую визуальную дату, Home — в первый logical weekday справа, PageDown — в следующий месяц; geometry/icons зеркальны, chronological смысл и bidi текста сохранены. |
| Custom slot, portal overlay и два календаря с разными темами/dir | В grid один Tab-вход; item actions не вложены в кнопку item. Portal сохраняет тему своего календаря; toolbar/retry controls имеют доступные имена и собственный Tab-порядок. |
| 2×2: Calendar root находится в `Document`/connected `ShadowRoot`, portal — в default `ownerDocument.body`/явном connected `ShadowRoot`; `styles.css` подключён в каждом затронутом tree scope | Root и overlay полностью стилизованы во всех четырёх комбинациях; `theme`/`density`/`colorScheme`/`dir`/`lang` изолированы на экземпляр, а перед видимостью portal все resolved public variables и inherited font properties равны owner root. Произвольные непубличные properties/element rules не копируются. Для root в ShadowRoot с default body portal stylesheet явно подключён и в shadow scope, и в document; cross-root `aria-controls` отсутствует, focus/modality сохраняются. |
| Открыт package overlay в accepted `portalContainer=A`; prop меняет identity `A→B→null`, либо `A` удаляется; отдельно initial container detached/cross-document | При identity/removal весь descendant stack закрывается top-down, modal effects сняты, focus восстановлен по 12.3, автоматического reopen нет; следующая activation использует `B`/default. Initial invalid container даёт default owner body и development warning; в чужую document ничего не монтируется. |
| Auto root content width `639/640px`, forced layout и `colorScheme="system"`/`"dark"` при SSR | Auto resolve-ится mobile/desktop точно по границе и first render всегда mobile; forced presentation не зависит от width. Requested color-scheme attribute стабилен при hydration, system разрешается CSS, explicit dark применяется также к portal. |
| Обе темы/density при dark, forced-colors, reduced-motion, 400% zoom и text-spacing override, включая conforming custom `tokens`/source/appearance fixture | Package-owned UI сохраняет contrast, видимый/неперекрытый focus, различимые state markers, target sizes, content/actions и mobile reflow. При forced-colors system colors и package state/focus styling имеют приоритет над theme/tokens/source/appearance; consumer `forced-color-adjust:none` в fixture не используется. |
| SSR до полуночи, hydration после неё; `today` задан / отсутствует; разные system zones и ширины | Server и первый client render совпадают по разделу 11.3, без hydration warnings. Последующее обновление today/layout не сбрасывает выбранную пользователем agenda date и не теряет focus. |
| Auto-layout hydrate на `390` и `1200` px; mobile dense agenda и touch move | Нет duplicate controls/callbacks; не больше одной замены presentation, focus/agenda сохранены. Mobile/CLS traces и доступ к последнему из 1000 items соответствуют замороженным budgets/evidence. |
| Канонический benchmark запускается в разные реальные даты | Во всех samples `today="2026-08-19"`; today/button/fallback UI одинаков, нет post-hydration определения даты. Реальные elapsed timestamps для latency продолжают измеряться; сценарий без snapshot остаётся отдельным SSR-тестом. |
| Полночь форматируется при `hourCycle={12}` и `{24}`; malformed `locale`/`messagesLocale`; valid unsupported locale | Получаются соответственно `h12` и `h23` (`00:…`, не `24:…`); malformed tag показывает SSR-stable contract error по точной fallback-цепочке без host defaults/retry, unsupported tag resolve-ится в `en-US` с development warning. |
| Каждый стабильный `data-*` в root, portal, day, item, agenda и data-state fixtures | Attribute присутствует только на элементе из нормативной таблицы и имеет точный literal/boolean-presence contract; две темы и portal не смешивают scoped значения. |
| Каждый `CalendarThemeTokens` path получает своё sentinel conforming value; рядом scoped CSS переопределяет те же variables, `tokens` — ещё раз, root `style` — ещё раз; открыт portal, затем изменяются owner props/CSS на mirror checkpoints | Все 27 paths создают точную variable из 10.3.1; mixed-case paths имеют явное kebab-case имя. Обычный CSS cascade действует, `tokens` inline выигрывает у non-important author CSS, root `style` выигрывает у `tokens`. Перед первой видимостью и после owner commit, owner resize/window resize и relevant media change все computed public variables и inherited font properties на portal точно равны root, включая CSS- и `style`-overrides; non-public CSS не копируется. Изолированная stylesheet mutation без checkpoint становится видна в portal после следующего owner render. |
| Известный source имеет `source.color`, а `getItemAppearance` поочерёдно возвращает каждый partial field; отдельно item без/с неизвестным source | Source меняет только accent; resolver independently заменяет accent/background/text, а пропущенный field идёт к source/theme-token layer. Unknown/invalid source использует base accent; background/text от source не зависят. Цвета одинаковы во всех week segments и agenda row. |
| SSR/hydration с blank/runtime non-string и non-empty invalid `tokens`, `source.color` и appearance values; sizing token даёт zero/non-finite measurement; item color отвергается UA при declaration assignment | Blank/non-string пропущен с development warning. Non-empty string передан без `CSS.supports`/computed-style probing, не даёт contract error/callback и подчиняется CSS engine; server и first client DOM/inline declarations совпадают. Bad measurement даёт zero lanes и доступный `+N`; item declaration, отвергнутая при parsing/assignment, не заменяет lower semantic channel, а computed-value invalidity следует стандартной CSS semantics. |
| Потребитель переводит старое all-day событие с включёнными датами 3–4 сентября и timed событие до полуночи на новый API | All-day получает `[2026-09-03, 2026-09-05)`. Timed сохраняет instants, но exclusive окончание не включает следующий день. Это проверка примера миграции данных, не наличие legacy renderer или adapter. |
| Чистый consumer устанавливает packed `0.2`, не устанавливая Day.js | Новый Calendar работает с ISO/IANA inputs; SDK graph/imports/declarations не содержат Day.js. Старые `events`, offset aliases, helper imports и `@nelmad/calendar/tokens.css` не проходят acceptance; стили подключаются только через `styles.css`. |
| Exact final `0.2.0` publish-candidate tarball в Vite/Next, ESM/CJS, min/latest Node 22/24/26, согласованные React/ReactDOM `18.2.0`/`19.0.0` и latest endpoints из 14, TypeScript fixtures | Все fixtures используют public root/CSS exports, SSR/hydration и production build без warnings/private imports; declarations отдельно проходят `moduleResolution: "bundler"` и `"NodeNext"`. Manifest задаёт exact пары, не только majors, и tested tgz integrity совпадает с опубликованной. Android real-device matrix фиксирует min/latest OS, Chrome и TalkBack по 14. |
| Полные `ru-RU`/`en-US` catalogs, partial `messages` и отличный `messagesLocale` | Каждая package-owned кнопка/reason/announcement берётся из типизированного catalog, fallback детерминирован, пустой override заменяется, а message/date fragments получают корректные `lang`. |
| `Calendar`/helper с `UTC`, `Europe/Berlin`, `Etc/UTC`, `GMT`, `US/Eastern`, `europe/berlin` и host-only identifier вне frozen accepted-set | Первые два принимаются и сохраняются в payloads; остальные одинаково отклоняются ESM/CJS, SSR/client независимо от host acceptance. Config даёт safe error/helper `RangeError`, invalid author zone исключает только item. Полный список воспроизводимо генерируется и проверяется во всех exact tuples; hash одинаков в package и manifest. |
| Невалидные `layout`, `density`, `colorScheme` и `dataState` по отдельности при SSR/hydration; затем исправление props | Safe shell имеет `classic/mobile/compact/system`, точные `data-*`, `kind='contract'` и synthetic initial error в root/status callbacks. Custom `renderError` получает contract branch без range/retry. Item/policy/toolbar resolvers и effectful `on*` молчат, кроме одного ранее обещанного draft cleanup. После исправления `kind='data'`; UI intent не возобновляется. |
| Передача move draft в request с синхронным внешним store, range eviction и reentrant unmount | Порядок request → cleanup `null` неизменен; обработчик request атомарно переносит удержание item. Между callbacks item не исчезает, cleanup не освобождает request retention и приходит ровно один раз, включая reentrant unmount. |
| Выпущенный экземпляром request: pending → terminal → absent; затем terminal → pending, смена terminal и повторное появление ID; отдельно pending → absent | Допустимая последовательность объявляет один результат. Недопустимая запись после terminal игнорируется с warning, не блокирует item повторно и не объявляется. Удаление pending без terminal не имитирует успех: warning, `isPending=false` без записи, локальный issuer lock сохраняется до terminal. Consumer store отдельно проверяет DFA для shared/external requests и непереиспользование IDs после remount. |
| В одном mount после выпущенного request и отдельно после terminal/tombstone происходят UI cancellation, blocking/contract error, смена timezone либо удаление/возврат move-пары; затем корректные props возвращают прежний request ID | UI drafts/targets отменены, но issuer registry сохранён до unmount. Незавершённый request остаётся локально заблокированным до корректного terminal; уже объявленный terminal не повторяется. Возврат terminal → pending после восстановления props по-прежнему исключается с warning и не восстанавливает `isPending` или lock. Новый mount не наследует journal и не объявляет чужой результат. |
| Следующий `0.2.x` patch-кандидат после upstream EOL одного из Node majors либо с более новой maintainer toolchain | Consumer ranges Node 22/24/26 и их минимальные версии не сужены относительно stable `0.2.0`; прежние minimum и текущие latest endpoints проходят CI по разделу 14. Сужение диапазона блокирует patch-релиз и требует следующего minor/major с support table и migration note. |
| EN/RU README/API для одного tarball и два независимых pilot reports | Языковая parity покрывает API/defaults/ограничения и runnable quick starts. Reports разделяют 30-минутный/двухчасовой onboarding и отдельные core tasks каждого advanced epic, оставшегося в stable scope; для каждого такого epic существуют два положительных `go`, язык CIS pilot — русский. |

Type-level acceptance дополнительно проверяет обязательные `items/anchorDate/onNavigate/timeZone`, отдельные item/source generics, обе ветви agenda/selection/filter/move/actions unions, запрет half-controlled комбинаций и create без selection, readonly arrays, точные callback payloads, narrowing `CalendarRootState.kind` с обязательной initial error branch для `classNames.root/status`, единственную `kind='data'` ветвь `CalendarToolbarSlotContext` для renderer и `classNames.toolbar`, а также data-only contexts `classNames.sourceSelector/grid/weekdayHeader` с отклонением contract branch, `classNames.overflowIndicator`, полноту catalog с `pendingStateLabel`, отклонение старых props и отсутствие внешних date types в публичных declarations.

## 20. Возможное направление `0.3`

Следующие возможности являются кандидатами для отдельного обсуждения, а не обязательствами текущей спецификации:

1. week/day views;
2. recurrence по RFC 5545 с exceptions и операциями occurrence/following/series;
3. встроенная, но заменяемая форма редактирования;
4. ICS import/export как отдельный adapter.

CalDAV не объединяется с ICS: это отдельный sync/integration слой с authentication, conflict resolution и server compatibility. Он рассматривается позднее только после подтверждения спроса.

Resource scheduling, capacity, собственный backend и standalone-календарное приложение также требуют отдельной market validation.
