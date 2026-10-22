# T13 — публичный пакет и изолированные consumers

27 сентября 2026. Checkout собирает **0.2.0-alpha.1 candidate**, npm publish не выполнялся. T13 завершён для desktop slice; alpha.1 acceptance остаётся в T14.

## Пакет

- Root exports: `Calendar`, `getCalendarVisibleRange`, `classicTheme` и типы нового контракта. `neutralTheme` появится в T18/alpha.2; фиктивного preset нет. Полный type vocabulary содержит будущие возможности, ограничения runtime alpha.1 перечислены в README.
- Удалены renderer 0.1, его components/UI-kit, Day.js adapter, helpers, palette/labels/Skeleton, связанные stories и 46 legacy tests. Tests Month/agenda вызывают новый публичный компонент. В source, manifest, установленных production graphs и output нет Day.js.
- Peers — только React/ReactDOM. `@internationalized/date@3.12.2`, `react-aria-components@1.18.0`, `react-aria@3.49.0`, `@react-stately/flags@3.2.1` — прямые ordinary dependencies. Дополнительные ручные установки consumer не нужны. *Позже (QA-05, [группа QA-C](qa-fixes-2026-10-09.md#qa-c)):* `@react-stately/flags` заменён на `react-stately@3.47.0`; свежая установка содержит один экземпляр `react-stately` и `@internationalized/date`, это проверяет `npm run check:package`.
- Один явно подключаемый scoped asset: `@nelmad/calendar/styles.css`. Прежний `tokens.css` и private subpaths запрещены export map. JavaScript не внедряет CSS.
- ESM/CJS сохраняют внутренние module boundaries. Декларации root собраны в `index.d.ts`/`index.d.cts`, не ссылаются на внутренние файлы или date/accessibility types. Dist guard проверяет оба формата, exports, assets, SSR parity, отсутствие legacy и сетевых primitives.
- Условие `react-server` направляет RSC resolver на root с отдельным `Calendar.client` facade. Только этот facade содержит `use client`; helper остаётся серверной функцией. Обычные Vite/Node ESM/CJS entry используют тот же компонент без предупреждения Rollup о directive. Это реализует отдельную client boundary, описанную в [Next.js documentation](https://nextjs.org/docs/app/getting-started/server-and-client-components). Реальная route `/boundary` импортирует Calendar прямо в Server Component, а основной пример держит state, callbacks и theme preset в своём Client Component.
- Stories используют public root/CSS imports. CI и Pages собирают пакет перед Storybook; добавлен отдельный packed-consumer CI job. Запуск этого workflow на GitHub ещё не выполнялся.

## Доказательства

Итоговый packed manifest (`evidence/t13/verified-final/manifest.json`) — **32/32 checks**. Один сохранённый `.tgz` устанавливается без symlinks к исходникам в два новых каталога вне checkout; архив, integrity, package-lock, dependency trees, исходные HTML, screenshots и source hashes лежат рядом с manifest.

| Проверка | Точный профиль |
| --- | --- |
| Host | Node 24.20.0, Chrome 154.0.8037.57, macOS |
| Vite SSR + browser | Vite 6.4.3, React/ReactDOM 18.3.1 |
| Next App Router | Next.js 16.3.6, React/ReactDOM 19.3.0, framework compiler TypeScript 6.0.3 |
| Published declarations | TypeScript 5.4.5 и 5.9.3 × bundler/NodeNext × оба consumers; strict, exactOptionalPropertyTypes, skipLibCheck=false; NodeNext также компилирует `.cts` require fixture |

Consumer fixtures импортируют только public root/CSS. Positive/negative fixtures проверяют generic inference, opaque theme, обязательные controlled пары, discriminated unions, отклонение старых props/types/exports. Для Next.js понадобился TypeScript 6: его собственные declarations `URLPatternInput`/`URLPatternOptions` не проходят framework build с 5.9. Это не обход через `skipLibCheck`; совместимость деклараций SDK с 5.4/5.9 проверяется отдельно.

Оба consumers проходят production build, ESM/CJS import/SSR parity и browser hydration при отличающемся host timezone. Сервер выдаёт semantic grid и точные counts/overflow; полосы появляются после измерения геометрии на клиенте. Проверены CSS, один roving tab stop, keyboard open, полный список из 10 items, item press с payload/date/view, Escape recovery и controlled navigation. Next дополнительно проверяет собственную RSC boundary пакета. Ошибок/предупреждений browser console и внешних запросов нет.

Vite screenshot (`evidence/t13/verified-final/vite-agenda.png`) и Next screenshot (`evidence/t13/verified-final/next-agenda.png`) просмотрены: одинаковые layout, шрифт, позиции popover, focus ring и overflow. Screenshots совпадают побайтно. Это desktop smoke, не замена browser/AT/real-device matrix.

Module graph (`evidence/t13/verified-final/module-graph.json`) подтверждает присутствие React, ReactDOM, React Aria, date runtime и DayAgenda в полном consumer output. Для helper-only root import UI modules удаляются. Implementation libraries не помечены consumer externals. Это проверка состава/tree shaking, **не полный size/performance gate T25**.

Общая регрессия (`evidence/validation-2026-09-27-t13-final/manifest.json`): 15 checks, **429 tests в 19 suites**, типы, lint, timezone generators/audit, четыре host timezones, library и Storybook builds. Число tests уменьшилось с 475 из-за удаления 46 tests renderer 0.1. Next печатает сообщение о пустом build cache в новом каталоге; compile/type warnings отсутствуют. Storybook сохраняет прежние upstream предупреждения об `eval` и размере собственных chunks; это не включено в утверждение о чистом consumer runtime.

## Воспроизведение

```sh
npm ci
npm ci --prefix scripts/implementation/spikes
# Нужен установленный Chrome; CI устанавливает его через Playwright.
npm run check:package
node scripts/implementation/verify-foundation.mjs docs/implementation/evidence/validation-local
```

`check:package` собирает и пакует checkout, использует сохранённые consumer lockfiles и сохраняет evidence в `docs/implementation/evidence/t13/packed`. `--output=<path>` задаёт иной каталог.

*Позже ([изменение процесса 2026-10-22](../implementation-plan-0.2.md#process-2026-10-22), раунд 1 исправлений PROCESS-V9):* отчёты прогонов в репозиторий не пишутся, путь `docs/implementation/evidence/...` в командах выше — исторический. Без `--output` `check:package` пишет во временный каталог (`os.tmpdir()`); `verify-foundation.mjs` без аргумента — тоже, иначе ему передаётся каталог вне checkout. `check:package --tarball=<tgz>` не собирает и не пакует: он проверяет уже упакованный архив (CI и release workflow пакуют один раз) и сначала требует, чтобы файлы архива побайтно совпадали со сборкой checkout. После согласованного изменения dependency graph выполнить `node scripts/implementation/packed-consumers.mjs --refresh-locks --output=<path>` и проверить diff consumer lockfiles. SDK integrity обновляется для каждого проверяемого локального архива; остальные версии фиксирует lockfile.

Промежуточные failed прогоны сохранены отдельно. Они выявляли ошибки harness (private message imports, расширение импорта Next, SSR ожидание полос до measurement, locale mismatch в fixture), несовместимый framework compiler и предупреждение Vite от общей client directive. Итоговый manifest относится к исправленным fixtures и conditional RSC entry.

## Дальше

T14: двуязычная документация первого slice, runnable migration/examples и desktop keyboard/axe acceptance на этом candidate. Затем T15 — responsive resolver и согласованные mobile/inline/popover/sheet transitions. `az-Arab` Intl hydration issue, physical touch/AT, полный min/latest matrix, performance budgets и release/pilot gates остаются открытыми. Публикация не разрешена этим техническим отчётом автоматически.
