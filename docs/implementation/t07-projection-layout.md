# T07 — date membership, порядок и недельная раскладка

8 сентября 2026. **Готов private core T07**. UI, public cutover и release qualification остаются отдельными этапами.

Дополнение 17 сентября: [исправлен wall-time resolver T05](wall-time-fix.md). UTC coordinate constant теперь общий для resolver и projection; ограничения source audit также квалифицируют его 48-hour candidate window. Повторный audit (`evidence/wall-time-2026-09-17/transition-audit.json`) и расширенная runtime parity (`evidence/wall-time-2026-09-17/runtime-parity.json`) относятся к текущим исходникам; первоначальные evidence ниже сохранены.

## Что реализовано

[Projection](../../src/v02/core/projection.ts) раскладывает timed interval на участки с постоянным host offset и объединяет занятые гражданские даты. Полуинтервалы остаются exclusive; отсутствующий или равный start `end` трактуется как момент без изменения исходной записи. Непредставимые local tails обрезаются отдельно. All-day интервалы остаются date-only.

Вместо предположения об одной полуночи `dayInstants` возвращает все части прообраза даты. Например, `1987-10-25` в `America/Goose_Bay` состоит из UTC-отрезков `03:00–03:01` и `04:00–04:00` следующего дня. Interval с обеими boundary projections в 24 октября всё равно может занимать также 25 октября. В Apia timed membership пропускает `2011-12-30`, а all-day — сохраняет.

Внутри используются отсортированные диапазоны номеров Gregorian dates: длинный interval не требует массива на каждый день, повторная дата считается один раз. Число занятых дат и классификация timed bar/chip вычисляются по всему interval, а не по обрезанному текущим grid фрагменту. Cache ограничен 256 intervals на экземпляр projector; `dayInstants` не предполагает фиксированной длительности местного дня.

[Layout](../../src/v02/core/layout.ts) использует pipeline validated records → source filter → membership → один global order → week segments / agenda index / counts. Default sort реализует группы и tie-breakers §6.2; custom comparator полностью заменяет группы, получает исходные items и только `{timeZone}`. Non-finite result превращается в ноль с pure diagnostic; равенство разрешается по Unicode code units, без locale. Consumer exceptions не подавляются.

Segments имеют точный exclusive `segmentRange`; неделя и настоящие отверстия membership разрывают bar. Фрагменты одного item в пределах недели остаются на одном lane. Новая схема lane allocation сохраняет global order в каждой занятой ячейке: first-fit из `0.1` мог разместить поздний короткий item выше раннего длинного bar.

Grid counts, скрытое число `N` и полный agenda берутся из одного набора. `fitWeekLanes` получает две измеренные вместимости — без `+N` и с учётом её отдельной высоты; она не предполагает одинаковой высоты индикатора и item. Нулевое/non-finite измерение оставляет ноль item lanes. Сам core не читает DOM и не отвечает за CSS heights, hit areas или фокус.

## Как ограничен поиск timezone transitions

Intl не предоставляет стандартный API перечисления transitions для всей выбранной support matrix. Private scanner проверяет offset с шагом **72 UTC hours**, затем находит изменившуюся boundary бинарным поиском с точностью до миллисекунды. Это требует не более одного offset change в каждом таком окне и абсолютного offset меньше 24 часов. Деление UTC coordinates на 86 400 000 используется только для Gregorian arithmetic; оно не задаёт длительность местного дня.

Эти свойства проверены воспроизводимым audit (`evidence/t07/transition-audit.json`) для всех **445** candidate identifiers tzdb **2026c**: **26 579** явных offset changes, полный 400-летний Gregorian цикл recurring footer rules и граница между явными записями и footer. Минимальная дистанция — **344 400 секунд (95 часов 40 минут)**, `Africa/Freetown`, 1–5 сентября 1939; максимальный абсолютный offset — **57 368 секунд**. Они удовлетворяют выбранным ограничениям scanner.

Audit строит изолированные `zic`/`zdump` из [закреплённого IANA tzcode 2026c](https://data.iana.org/time-zones/releases/tzcode2026c.tar.gz), проверяет SHA-256 обоих архивов и читает 64-bit TZif records по [RFC 9636](https://www.rfc-editor.org/rfc/rfc9636.html#section-3). Recurring `M.m.w.d` rules вычисляются для полного цикла; каждое уникальное footer сверяется с независимым `zdump` oracle. Новая syntax footer или слишком близкие transitions останавливают audit. Системный timezone database не меняется.

Начальная попытка многовекового `zdump` для каждой зоны была остановлена как слишком медленная; системный `zdump 2022g` также не разобрал отрицательный transition time одного footer. Поэтому итоговый audit использует закреплённые инструменты и отдельно вычисляет recurring cycle. Неполная первая сборка инструмента потребовала явного `VERSION_DEPS=` для локального build; итоговый runner воспроизводит исправленную команду.

**Граница доказательства:** source audit не доказывает устройство произвольного host ICU. Offsets остаются данными host Intl, не встроенными правилами tzdb. В T27 необходимо квалифицировать transition spacing/bounds на всех exact runtime tuples вместе с accepted-set и SSR compatibility; это явный release gate. Нельзя объявить новую runtime/tzdata версию совместимой, если она нарушает ограничение scanner. Исключительно длинные non-UTC интервалы требуют обхода большого UTC range; дальнейшая оптимизация/полный runtime budget остаются в T25, искусственного лимита длительности не введено.

## Проверки и воспроизведение

- 45 новых pure tests: [projection](../../src/v02/core/__tests__/projection.test.ts), [layout](../../src/v02/core/__tests__/layout.test.ts). Включены independent minute-by-minute oracle, исторический seconds offset, 23/25 и 23.5/24.5-hour дни, domain clipping, global sort/lanes, source filtering, frozen inputs/cyclic data и отдельная высота overflow.
- ESM/CJS/Chrome parity (`evidence/t07/runtime-parity-final.json`): Apia, Goose Bay, Berlin DST и upper-domain tail; одинаковые order, membership, segments, counts, overflow и day preimages. Chrome `152.0.7977.83`, Node `24.20.0` / ICU `78.3` / tz `2026c`. Это private bundle, не packed public `0.2`.
- Foundation manifest (`evidence/validation-2026-09-08-t07-final/manifest.json`): 14 checks; в том числе все unit tests, lint, current/minimum type fixtures, build, Storybook и повтор date/projection/layout под тремя `TZ`.
- `check:transitions` добавлен в CI. Для audit нужны `cc`, `make`, `awk`, `tar`; исходники закреплены локально, сеть для повторной проверки не нужна.

```sh
npm run check:transitions
npm test -- src/v02/core/__tests__/projection.test.ts src/v02/core/__tests__/layout.test.ts
node scripts/implementation/timezones/audit-transitions.mjs /private/tmp/t07-transition-audit.json
node scripts/implementation/projection-probe.mjs /private/tmp/t07-runtime-parity.json
node scripts/implementation/verify-foundation.mjs /private/tmp/calendar-t07-foundation
```

Следующий этап — T08 locale/messages. Вычисление публичного visible-range helper и его интеграция с controlled viewer продолжаются в T08/T10/T13. Настоящие DOM measurements/overflow, segments render и accessibility подключаются в T11; данный core не считается готовым Month UI.
