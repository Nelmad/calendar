# T05 — private date adapter и validation

Обновлено: 17 сентября 2026. Статус: **done для private core**. Подключение UI остаётся в T10/T13. После T05 default adapter подключён к [candidate package set T06](t06-timezones.md); RC matrix/freeze ещё не выполнены.

## Реализовано

[date.ts](../../src/v02/core/date.ts) проверяет точную ISO/RFC3339 грамматику, proleptic Gregorian domain и instant bounds; сравнивает интервалы по каноническому смыслу, сохраняя различие отсутствующего/явного `end` и author timezone. Проекция читает Gregorian fields Intl до ограниченных date types; исторические second offsets и local tail сериализуются через `Z`. Wall time отклоняет gap и выбирает более ранний fold. Никакие системные locale/timezone/clock defaults не используются.

[Исправление после review](wall-time-fix.md) заменило библиотечный wall-time resolver собственным поиском кандидатов через explicit Intl fields: прежний local-zone fast path терял секунды Monrovia. Поиск использует квалифицированные T07 offset/transition bounds; полная host ICU qualification остаётся в T27.

[validation.ts](../../src/v02/core/validation.ts) разделяет:

- `validateConfiguration`: fatal ошибки anchor/timezone/dates/ranges, enum, breakpoint, BCP 47 tags, data state, callback shapes и controlled-пар. Возвращает contract branch с `RangeError` и path/reason diagnostics.
- `validateRecords`: исключает invalid items/sources и **все** записи с конфликтующим ID. Считает дубликаты до проверки содержимого, поэтому невалидный duplicate не разрешает второй записи «победить». Blank item title получает переданный локализованный fallback без изменения исходного item.
- Нормализацию source filter: только уникальные известные IDs в порядке sources; скрытый selector не отменяет filter. Uncontrolled filter отличается от controlled пустого массива. Items без source и с неизвестным source остаются видимыми.
- `validateActions` и `validateMoveStates`: snapshot isolation, duplicate IDs, непустые labels/reasons, допустимые statuses/tones, проверку issuer itemId. Допускаются несколько pending с одним itemId и разными requestId. История request transitions и tombstones относятся к T22.
- `validateCalendarInput`: сначала configuration, затем records/states. Fatal branch не читает интервалы records и не вызывает ни resolver, ни notification. Изменения props после ошибки проверяются заново, UI intents сюда не входят.

Все функции чистые: возвращают diagnostics, не вызывают `console`, не зависят от development/production. Controller сможет публиковать development warnings отдельно от acceptance. Оригинальные item/source/action/state references, exact IDs, timestamps и произвольные/cyclic payloads сохраняются. Входные массивы не сортируются и не меняются.

## Границы

Date adapter получает snapshot явного accepted-set; после T06 вызов без аргумента использует встроенный сгенерированный набор. Unit-test зоны не стали данными SDK. Theme identity guard передаётся из private theme module; структурный объект с одним `name` не считается preset.

Синтаксис locale проверяет [localeTag.ts](../../src/v02/core/localeTag.ts) по [RFC 5646](https://www.rfc-editor.org/rfc/rfc5646#section-2.1), независимо от Intl. В частности, `x-company`, `i-klingon` и `en-GB-oed` не считаются malformed только потому, что Intl их отклоняет. Malformed locale является contract error, но поддержка Intl service, locale negotiation, messages и safe-shell language fallback реализуются в T08. CSS/message/portal/IDREF recoverable cases не превращаются в fatal configuration errors: их обработка остаётся у соответствующих modules. Safe-shell rendering, закрытие overlays и ровно один draft cleanup при входе в error — задачи T10/T24. Чистая validation сама callbacks не отправляет.

## Evidence

- [56 date tests](../../src/v02/core/__tests__/date.test.ts) и [62 validation tests](../../src/v02/core/__tests__/validation.test.ts) выполняются в Node environment без React/DOM.
- [48 locale-tag tests](../../src/v02/core/__tests__/localeTag.test.ts) отдельно проверяют BCP 47 grammar, private-use/grandfathered tags и malformed/duplicate subtags.
- Проверены readonly/frozen inputs, cyclic data, equivalent timestamps, boundary tails, все controlled-пары, invalid/duplicate records, source filtering, snapshots move states и development/production parity.
- Проверка 8 сентября (`evidence/validation-2026-09-08-final/manifest.json`): 206 tests всего, 12 checks pass, включая typecheck, contract matrix, lint, build и Storybook. Date tests дополнительно проходят под process `TZ=UTC`, `America/Los_Angeles`, `Asia/Tokyo`.
- Новый core не доступен из package root и не попадает в declarations сборки `0.1`. Public/packed acceptance подтверждается позже, после T13.
- Проверка исправления 17 сентября (`evidence/validation-2026-09-17-wall-time/manifest.json`): 275 tests, 15 checks pass, четыре host `TZ`, включая Monrovia. Browser parity (`evidence/wall-time-2026-09-17/runtime-parity.json`) проверяет 11 wall-time cases в Chrome с двумя host timezones.
