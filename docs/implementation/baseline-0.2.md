# T01 — baseline и карта требований

Дата: 5 сентября 2026. Исходный commit: `ba8bb48e29e944d06b81aa5489e32b9aff187729` (`0.1.0`).

## Результат

Проблема missing-Day.js воспроизведена в рабочем каталоге и отделена от исходного кода. В отдельном каталоге из `git archive HEAD` установка исходного lockfile и все семь проверок завершились успешно. Это диагностический baseline `0.1`, не acceptance реализации `0.2`.

| Проверка | Исходная локальная установка | Clean install исходного checkout |
| --- | --- | --- |
| `npm ls --depth=0 --json` | Missing Day.js и extraneous packages | pass |
| `npm run typecheck` | Missing Day.js | pass |
| `npm run typecheck:storybook` | Missing Day.js | pass |
| `npm run lint` | pass | pass |
| `npm test -- --reporter=dot` | 8 suites не загружены; 5 прошли | 13 suites, 46 tests passed |
| `npm run build` | Missing Day.js | pass |
| `npm run build-storybook -- --disable-telemetry` | Missing Day.js | pass |

Exact Node/npm/ICU/tzdata, hashes исходного package/lockfile, команды, exit codes и отдельные stdout/stderr сохранены в локальном manifest (`evidence/baseline-local/manifest.json`) и clean manifest (`evidence/baseline-clean/manifest.json`). Maintainer Node — `24.20.0`, npm — `11.19.0`; это не объявление consumer support matrix.

Первая clean-install попытка завершилась `ENOTFOUND registry.npmjs.org` в сетевой песочнице. После предоставления инструменту сетевого доступа повтор той же команды `npm ci --cache /private/tmp/calendar-npm-cache --no-audit --no-fund` установил 605 packages. npm сообщил deprecation warnings и два install scripts, не разрешённых его текущей policy; последующие реальные сборки и тесты прошли. Исходный lockfile не изменялся.

Первоначальная команда harness для Storybook ошибочно содержала `--ci`, которого у `storybook build` нет. Этот результат сохранён как предыдущая попытка в local manifest. Harness исправлен: `CI=1` задаётся через environment, повторён только затронутый check. Успех clean build не означает отсутствия всех build warnings: подробности остаются в сохранённых отчётах.

## Воспроизведение

Из проверяемого checkout с установленными зависимостями:

```sh
node /path/to/calendar/scripts/implementation/capture-baseline.mjs /path/to/evidence
```

Harness не останавливается на первом падении и сохраняет результат каждой команды. Для отдельного повторного check используются `--only=build-storybook` и `--reason="причина повтора"`; предыдущая попытка сохраняется. Для архива без `.git` переменная `BASELINE_SOURCE_GIT_SHA` указывает commit, из которого создан архив.

Для исторического clean baseline: извлечь указанный commit через `git archive`, выполнить `npm ci` в отдельном каталоге, затем запустить harness с отдельным output path. Day.js требуется этому старому checkout; целевой SDK `0.2` исключает его в T13.

## Реестр требований

[requirements-0.2.json](requirements-0.2.json) содержит точные исходные блоки спецификации с section/line range/SHA-256, владельцем, этапом полной проверки и видом evidence. Включены все 74 R-ID, нормативный TypeScript-контракт §5.7, scope, styling, accessibility, distribution, docs и quality requirements вне regression-таблицы. Контекст и сокращённые code examples отмечены отдельно; они не объявляются самостоятельными исполнимыми fixtures. Раздел 20 (`0.3`) исключён.

У R02/R15/R27/R35 есть отдельные обязательные alpha/beta subchecks. Полный R-ID нельзя пометить `pass` без evidence всех его частей. В момент T01 implementation requirements получили `planned`: генерация реестра не доказывает поведение SDK. Дальнейшие изменения статуса с partial evidence отражаются в самом реестре и [журнале](progress-0.2.md).

```sh
node scripts/implementation/requirements.mjs
node scripts/implementation/requirements.mjs --write
```

Первая команда проверяет актуальность. Вторая обновляет производные поля после review изменений, сохраняя status/evidence неизменённых требований. Изменение исходного текста существующего R-ID вызывает ошибку и требует явного сопоставления; автоматического переноса старого evidence на новый текст нет.

## Существующие tests: что переносим

| Suite `0.1` | Решение `0.2` | Владелец |
| --- | --- | --- |
| `dateUtils`, `formatEventTime`, `validateCalendarInput` | Сохранить идеи boundaries/formatting; заменить fixed-offset/inclusive/default-zone assertions строгим ISO/IANA-контрактом | T05–T08 |
| `buildWeekLayout` | Сохранить cases clipping/continuations/lanes; заменить модель, порядок и exclusive endpoints | T07/T11 |
| `EventChip`, `EventBar` | Переиспользовать визуальные cases; заменить button/hover semantics пассивными segments и agenda activation | T11/T12/T17 |
| `Calendar` | Сохранить navigation/loading cases; заменить props, DOM/ARIA и controlled acceptance oracles | T10/T11/T24 |
| `ActionMenu` | Переиспользовать keyboard/disabled cases; добавить nested overlays, latest actions и focus recovery | T09/T16/T17 |
| `useProgressBarVisible` | Перепроверить применимость к новому data-state и reduced-motion contract | T10/T18 |
| `CalendarSkeleton` | Возможен private skeleton; старый public export удаляется | T09/T13 |
| `buildThemeStyle`, `calendarPaletteVars`, `eventVariantClass` | Legacy palette/variants удаляются; новые tests проверяют 27 scoped variables, precedence и portal mirror | T18 |

Stories, CSS packaging и `verify-dist.mjs` переключаются согласованно в T13. Существующие зелёные tests не являются причиной сохранять legacy API.
