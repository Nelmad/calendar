# T02 — технические эксперименты

Начало: 5 сентября 2026; обновлено 8 сентября. Статус: **in progress**. Date/runtime, минимальная ShadowRoot composition, packed consumer и 24 сценария touch emulation проверены; real-device touch остаётся открытым.

## Закреплённое окружение

[Изолированный fixture](../../scripts/implementation/spikes/package.json) и его lockfile используют `@internationalized/date@3.12.2`, `react-aria-components@1.18.0`, согласованные React/ReactDOM `18.3.1`, Vite `6.4.3`, Playwright `1.55.1`. На этой машине Chrome `152.0.7977.82`, Node `24.20.0`, ICU `78.3`, tzdata `2026c`. Это исследовательские tuples, не release support matrix.

Fixture расположен вне SDK entry. Он не реализует Calendar и не является alpha. Все команды запускаются из корня репозитория:

```sh
npm ci --prefix scripts/implementation/spikes
npm run temporal --prefix scripts/implementation/spikes
npm run dev --prefix scripts/implementation/spikes
```

В другом терминале при работающем сервере (по умолчанию Shadow DOM режим включён):

```sh
npm run browser --prefix scripts/implementation/spikes
npm run bundle --prefix scripts/implementation/spikes
```

Browser runner использует установленный Google Chrome (`channel: chrome`); Vite слушает только `127.0.0.1:4178`. `bundle.mjs` создаёт tarball и consumer в системном temporary directory. Он использует offline npm cache: при отсутствии нужных tarballs сначала выполнить установку fixture с тем же cache (`npm ci --prefix scripts/implementation/spikes --cache /private/tmp/calendar-npm-cache`). Выходные JSON, trace и screenshot находятся в `evidence/t02`. Текущие browser/bundle artifacts сохраняются в `evidence/t02/2026-09-08-on`. Контрольный прогон `CALENDAR_SHADOW_DOM=off npm run browser --prefix scripts/implementation/spikes` сохраняется отдельно в `2026-09-08-off` и ожидаемо падает на ShadowRoot cases.

## Даты: решение принято для T05

Девять экспериментов (`evidence/t02/temporal.json`) прошли. Проверены строгая грамматика и instant endpoints, signed sub-hour offsets, Berlin gap/fold, Apia, исторический second offset Paris, Gregorian tail и независимость сериализации от process `TZ`.

- Выбран private adapter над `@internationalized/date@3.12.2` и явно настроенным Gregorian Intl. Публичные типы не используют типы этой зависимости. Пока adapter не входит в package entry, зависимость закреплена как dev; ordinary dependency переносится при T13.
- `parseAbsolute` допускает отсутствующие секунды, precision выше миллисекунд и `-00:00`. Поэтому RFC3339 grammar, Gregorian date и UTC instant bounds проверяются до библиотечного разбора; вход не исправляется.
- `fromAbsolute(MAX_INSTANT, 'Asia/Tokyo')` возвращает ограниченный year `9999` вместо локального `10000`. Первоначальное неверное предположение сохранено в failed report (`evidence/t02/temporal-initial.json`). Adapter сначала читает явные Gregorian/era fields Intl. У локального хвоста вне `0001…9999` date membership отсутствует; весь interval от этого не исключается. Общий membership algorithm относится к T07.
- Historical offset с секундами и local tail сериализуются через `Z`; каждый instant сохраняется. Gap отклоняется; из двух соответствующих wall time кандидатов fold выбирается более ранний instant. Это собственная семантика SDK, поверх [документированных вариантов disambiguation](https://react-aria.adobe.com/internationalized/date/CalendarDateTime).
- Accepted-set не выводится из Intl. После T06 default adapter использует [сгенерированный candidate package set](t06-timezones.md); полный RC matrix/freeze остаётся открытым. Фиксированный набор unit tests не считается списком зон SDK.

## React Aria: исходный сбой и решение 8 сентября

Первоначальные 9/11 outcomes сохранены в отчёте 5 сентября (`evidence/t02/browser.json`). Текущий browser report (`evidence/t02/2026-09-08-on/browser.json`) содержит **15/15 pass**, source hashes, точное состояние фокуса и browser version; рядом trace (`evidence/t02/2026-09-08-on/browser-trace.zip`) и screenshot (`evidence/t02/2026-09-08-on/browser.png`). Полная проверка SDK/AT этим не заменяется.

Проверены собственная gridcell, agenda без RAC trigger, initial focus, logical Tab/Shift+Tab exit, вложенное menu в document portal, вложенные modals, native inert с проверкой Chromium accessibility tree, mouse capture и эмулированный touch capture после удаления sheet.

`Dialog` этой версии фильтрует `onKeyDown`, поэтому собственная logical-exit обработка размещена на DOM-container в capture phase. Конечный target восстанавливается после commit; контроллер T16 должен вычислять его по нормативному composed order, включая `tabindex`, slots и source tree. Жёстко заданные соседние buttons прототипа доказывают только возможность перехода.

При modal обнаружен native `inert`, а не `aria-hidden`; background отсутствует в Chromium AX tree и не принимает programmatic focus. После закрытия доступность и focus восстанавливаются. Playwright `getByRole` данной версии не является достаточным oracle для native inert, поэтому используется AX tree вместе с DOM/focus assertions. Это не проверка реального screen reader.

**B02-SHADOW — минимальный repro закрыт.** Добавлен публичный `@react-stately/flags@3.2.1`, использующий ту же закреплённую `react-stately@3.47.0`, что RAC. `enableShadowDOM()` выполняется до первого mount. Это устраняет ошибочную изоляцию portal host и включает работу с глубоким activeElement. Одного флага оказалось недостаточно: первая попытка (`evidence/t02/2026-09-08-on/browser-initial.json`) сохранила сбои nested menu и dialog restoration.

Menu test теперь ожидает фактический initial focus внутри menu до Escape; наличие DOM-node не означает завершения начального focus transition. Для nested dialog закрытие controlled state явно ставит source trigger в post-commit focus routing прототипа. Включённый режим после этих изменений проходит все четыре пары root/portal для agenda/menu/Tab exit и modal nesting/return. Контрольный прогон без флага (`evidence/t02/2026-09-08-off/browser.json`) с тем же ожиданием focus и controlled restoration по-прежнему воспроизводит ShadowRoot failures: проблема не была только таймингом теста.

**Решение для T09/T16:** использовать публичный flag package и собственный source-aware focus controller. Настройка в SDK должна быть внутренней, идемпотентной и происходить до первого overlay; новых public exports или обязательного bootstrap от потребителя не добавляем. Probe экспортирует `configureFeasibilityRuntime` только для исследования. Его вызов проверен в ESM SSR и CJS без DOM. Флаг меняет состояние общей копии React Stately и не выключается при unmount; dependency graph и одна копия runtime фиксируются в fixture. Private imports библиотеки в коде SDK не нужны. Полный focus ownership, отмена stale intents и matrix поддерживаемых browsers/AT остаются задачами T09/T16/T27/T28.

**Реализация 17 сентября:** [T09](t09-ui-foundation.md) перенёс bootstrap в private UI; явный вызов из используемых компонентов сохраняется при production tree shaking. 40/40 native checks покрывают базовые controls/overlays в четырёх парах tree scopes. Полный ownership stack и source-aware routing остаются в T16.

## Touch: автоматическая проверка завершена, real devices остаются открытыми

В mouse и CDP-emulated touch сценариях стабильный connected owner получает capture до удаления sheet, затем получает `pointermove` и `lostpointercapture` после завершения. У fixture `touch-action: none` установлен до `pointerdown`, capture начинается сразу. Это проверка handoff механизма, не long-press recognizer, не package-owned accessibility-hidden session owner и не полный move protocol.

По последующему запросу пользователя «тач сам проверь» добавлен отдельный [touch fixture и отчёт](t02-touch.md): **24/24 pass** в Chrome, native scroll при ширине 390/412 px, long press с movement slop, стабильный accessibility-hidden owner в том же portal scope, все четыре document/ShadowRoot пары, capture failure/loss, второй палец, pointercancel, Escape, removal/unmount и release вне grid. Кандидат: ручка 44 × 44 px, 450 ms, slop 8 px; обычная прокрутка начинается с остальной части строки. Этот результат заменяет прежнее ограничение «проверен только immediate handoff», но не является реализацией всего move contract.

**B02-TOUCH — открытая real-device проверка (T02/T23).** Gesture/scroll policy проверена в desktop touch emulation; её ещё нужно проверить на реальных iOS/Android из support matrix. Доступных телефонов, Android SDK или Xcode/simctl здесь нет. Окончательная область/thresholds и OS gestures/callout остаются предметом physical-device проверки; уже подтверждённые автоматические сценарии воспроизводятся без неё.

No-drag путь «Перенести → дата → Подтвердить/Отмена» остаётся обязательным. Он не заменяет предусмотренный touch drag и не снимает эту проверку.

**Решение пользователя, 8 сентября 2026:** «продолжи тогда, проверим на тач потом». Real-device проверка отложена и больше не блокирует продолжение core/UI этапов. B02-TOUCH не помечается pass: проверка gesture/scroll policy остаётся обязательной до закрытия touch input в T23, полный real-device/AT evidence — до RC.

## Packed consumer и размер

bundle.json от 8 сентября (`evidence/t02/2026-09-08-on/bundle.json`) фиксирует tarball integrity/SHA-256, файлы, toolchain, baseline/probe chunks, gzip level 9, consumer lock hash. Consumer lockfile (`evidence/t02/2026-09-08-on/bundle-consumer-lock.json`) сохранён отдельно. Probe действительно установлен из `npm pack` tarball; ESM SSR render, CJS import и отсутствие Day.js в установленном production graph прошли.

Consumer overrides фиксируют весь production graph из spike lockfile. Это устранило обнаруженный drift: при новом install registry metadata пыталась выбрать `react-stately@3.50.0` вместо проверенной `3.47.0`; offline runner остановился, а затем был исправлен для точного graph. Baseline и probe собраны одним Vite/minifier toolchain; external только React/ReactDOM и их subpaths. Delta: **54 654 bytes JS gzip (53,37 KiB)** и **332 bytes CSS gzip**. До JS gate 80 KiB остаётся 27 266 bytes (26,63 KiB).

Это небольшой набор primitives и date operation: в нём отсутствуют полноценные Month/DayAgenda, DnD, accepted-set, две темы и весь focus/announcement controller. Поэтому размер доказывает только отсутствие немедленного превышения бюджета данным набором зависимостей. Достижимость полного gate пока не установлена; расширять probe по мере T09–T24, полный baseline и thresholds заморозить в T25.
