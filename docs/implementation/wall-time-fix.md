# Исправление wall-time после review

17 сентября 2026. Исправлен P2 в private date adapter T05. Следующий этап плана — T08; публичный SDK `0.2` ещё не собран.

## Дефект и исправление

`resolveWallTime` делегировал поиск кандидатов `toZoned`. При совпадении заданной и системной зон библиотека использовала `Date.getTimezoneOffset()`, теряя секунды исторического offset. Для полуночи `1971-01-01` в `Africa/Monrovia` процесс с `TZ=UTC` возвращал `00:44:30Z`, а с `TZ=Africa/Monrovia` — `00:44:00Z`, то есть 23:59:30 предыдущего местного дня. Сравнение библиотечных wall fields не обнаруживало эту ошибку. Тот же механизм принимал часть несуществующего времени перед переходом Monrovia 7 января 1972 года.

Новый resolver читает offset только через собственную Gregorian-проекцию с явно заданным `Intl.DateTimeFormat.timeZone`. Он вычисляет возможные instants, проверяет каждый обратной проекцией всех wall fields, включая секунды и миллисекунды, отклоняет gap и выбирает минимальный matching instant при fold. Глобальные настройки date library и системная timezone не меняются.

Поиск использует те же квалифицированные ограничения, что и T07: абсолютный offset меньше 24 часов, расстояние между transitions больше 72 UTC hours. При этих условиях все кандидаты находятся внутри UTC-окна wall coordinate ±24 часа, содержащего не более одного изменения offset; значения на обоих концах дают полный набор offset-кандидатов. Окно обрезается по instant domain, без clamping результата. Это координаты поиска, а не предположение о длительности местного дня. Обновлённый source audit (`evidence/wall-time-2026-09-17/transition-audit.json`) фиксирует hashes обоих modules, 48-hour wall-time window и прежние проверенные bounds для 445 зон. Qualification всех host ICU остаётся открытым gate T27.

## Проверки

- До исправления (`evidence/wall-time-2026-09-17/before-fix.txt`): новые regression tests воспроизводят три failures под `TZ=Africa/Monrovia` — midnight, midday и gap.
- Шесть новых tests в [date.test.ts](../../src/v02/core/__tests__/date.test.ts): Monrovia seconds/milliseconds и точная граница gap; earlier folds Goose Bay/Lord Howe; оба края instant domain. Всего 56 date tests, 275 unit tests проекта.
- Foundation manifest (`evidence/validation-2026-09-17-wall-time/manifest.json`): 15 checks pass. Date/projection/layout повторяются в отдельных процессах с `TZ=UTC`, `America/Los_Angeles`, `Asia/Tokyo`, `Africa/Monrovia`. Monrovia-прогон также добавлен в CI.
- ESM/CJS/Chrome parity (`evidence/wall-time-2026-09-17/runtime-parity.json`): 11 wall-time и четыре прежних projection cases. Оба browser contexts явно используют и проверяют системные зоны `UTC`/`Africa/Monrovia`; проверяется также обратная проекция разрешённого wall time.
- Прежнее предупреждение сборки о недоступном `@microsoft/api-extractor` сохраняется. Эти проверки относятся к private core, не к public `0.2` release build, physical touch или полной support matrix.

Воспроизведение с новым каталогом результатов:

```sh
TZ=Africa/Monrovia npm test -- src/v02/core/__tests__/date.test.ts
node scripts/implementation/verify-foundation.mjs /private/tmp/calendar-wall-time-foundation
node scripts/implementation/projection-probe.mjs /private/tmp/calendar-wall-time-parity.json
```
