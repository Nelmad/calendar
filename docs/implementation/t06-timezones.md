# T06 — воспроизводимый candidate accepted-set

8 сентября 2026. Private foundation, не public cutover и не RC freeze.

## Результат

Генератор выделяет 446 primary identifiers из 598 Zone/Link имён tzdb 2026c. В candidate входят **445**: `Factory` исключена, поскольку Node v24.20.0 / ICU 78.3 / tz 2026c не умеет её форматировать. Chrome 152.0.7977.82 её поддерживает, но package membership одинаково отклоняет её в обоих окружениях. Обязательные шесть зон сохранены.

- [Manifest](timezones-candidate.json): источники, hashes, 107 primary Links, все исключения и полный список.
- [EN artifact](timezones-candidate.en.md), [RU artifact](timezones-candidate.ru.md): одинаковый список для будущей API reference.
- [Package data](../../src/v02/core/timeZones.generated.ts): frozen array; mutable Set остаётся внутри date adapter. Default `createDateAdapter()` использует только эти данные. Внедрение отдельного набора остаётся private seam для fixtures/probes.
- SHA-256 списка: `fc7e166281d099166bd0908a22896ada040ea242385241e9f7ac98765e2b0763`. Encoding: UTF-8, одно имя на строку, включая последний LF.

## Закреплённый алгоритм и inputs

[Policy](../../scripts/implementation/timezones/policy.json) закрепляет [официальный архив IANA 2026c](https://data.iana.org/time-zones/releases/tzdata2026c.tar.gz), его SHA-256 и опубликованную [12-ю редакцию ECMA-402, §6.5](https://402.ecma-international.org/12.0/#sec-use-of-the-iana-time-zone-database). Архив сохранён в `vendor` вместе с public-domain LICENSE; обычная генерация не требует сети. Исходные данные `DATAFORM=main`, default `BACKWARD=backward`, без PACKRAT overlay. Hashes использованных файлов, NEWS и Makefile записаны в manifest.

Generator вычисляет только множество `Identifier === PrimaryIdentifier` из §6.5.3. Для этого §6.5.1 сохраняет Zone и Link из `zone.tab`, применяет исключение UTC и явные pending renames. Это не просто выбор строк Zone: `Europe/Bratislava`, `Atlantic/Reykjavik`, `Arctic/Longyearbyen`, `Pacific/Chuuk` и другие территориальные Links остаются основными именами.

Country routing для остальных Links не создаёт новых primary identifiers: его результат — другой Zone, имя из `zone.tab` либо target из `backzone`. Поэтому generator не подменяет country mapping обычным разрешением Link и вообще не выпускает alias canonicalizer. Для такой проекции проверяются отсутствие self-links в `backzone`, целостность всех ссылок, cycles и уникальность имён без учёта регистра. `Atlantic/Jan_Mayen` и `Pacific/Truk` остаются non-primary; target для них package не возвращает.

Rename waiting period задан входными данными, не часами процесса. NEWS проверен по 2026c: последняя замена имени `Europe/Kiev → Europe/Kyiv` произошла в 2022b, ожидание закончено; `America/Coyhaique` — новая выделенная зона, не переименование. При смене архива review pending renames нужно повторить.

## Проверка runtime и воспроизведение

```sh
npm run check:timezones
node scripts/implementation/timezones/generate.mjs --write
node scripts/implementation/timezones/run-capabilities.mjs docs/implementation/evidence/t06/new-run --browser
```

*Позже ([изменение процесса 2026-10-22](../implementation-plan-0.2.md#process-2026-10-22), раунд 1 исправлений PROCESS-V9):* закреплённые входные runtime reports генератора (`node.json`, `chrome.json`; ниже — исторические пути `evidence/t06/initial/`) перенесены побайтно в `scripts/implementation/timezones/runtime/`, их SHA-256 сверяет `policy.json`. Новый прогон третьей команды пишется вне репозитория: `node scripts/implementation/timezones/run-capabilities.mjs "$(mktemp -d)" --browser` (каталог — первый аргумент; без него отчёт уходит во временный каталог `os.tmpdir()`).

Первая команда запускает семь generator checks и проверяет все generated artifacts побайтно. Вторая явно обновляет artifacts из закреплённых inputs/reports. Третья строит один private probe в ESM/CJS и запускает установленный Chrome; для browser части нужны зависимости из spike lockfile и сам Chrome. Без `--browser` доступны Node и ESM/CJS parity; это не browser evidence. Новые отчёты сами не меняют membership: изменение `policy.runtimeReports` требует явной правки и закрепления hashes.

Initial reports (`evidence/t06/initial/node.json`) и Chrome report (`evidence/t06/initial/chrome.json`) проверяют весь primary universe, включая ранее исключённые имена. Для каждой зоны проверены форматирование/serialization round trip на семи instants от границ домена до исторических и современных дат, а также wall-time conversion. Это sampled usability, не доказательство корректности каждого transition.

Проверка итогового candidate (`evidence/t06/accepted/parity.json`) подтверждает одинаковые списки и accept/reject в Node ESM/CJS и Chrome для всех 598 tzdb имён и дополнительных невалидных входов. Node imports выполняются без DOM; browser получает тот же bundled module. Capability и membership разделены: поддержка `Factory` браузером не расширяет package data.

18 unit tests проверяют запрет нормализации, immutable данные, независимость от Intl при membership и применение одинакового набора к fatal configuration / invalid item isolation. Изолированный минифицированный list module стоит **2665 bytes gzip**, level 9. Это только стоимость данных; полный Calendar budget остаётся в T25.

## Открытые границы

T06 candidate generator готов. До RC в T27 нужны exact tuples всей support matrix, пересечение их отчётов и freeze на всю `0.2.x`. Текущий runner намеренно отказывается объявлять candidate замороженным. В T13 нужно проверить уже опубликованную package surface; нынешние проверки относятся к private core. Offsets по-прежнему берутся из host Intl/tzdata, поэтому SSR compatibility проверяется отдельно. Нового JS export нет.
