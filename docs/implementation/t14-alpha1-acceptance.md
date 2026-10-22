# T14 — alpha.1 acceptance на packed candidate

6 октября 2026. Checkout собирает **`@nelmad/calendar@0.2.0-alpha.1` candidate**, прошедший keyboard/axe/SSR acceptance на одном упакованном архиве в двух изолированных consumers. Candidate подготовлен для **отдельного решения о публикации**; `npm publish` не выполнялся, registry install не проверялся. T14 завершён; следующий этап — T15 (alpha.2).

## Решения

- **Surface gate.** Prerelease публикует только рабочий slice (план §3.2). Единственный источник — [`src/v02/surface.ts`](../../src/v02/surface.ts): из него выводятся публичные declarations ([`src/v02/public.ts`](../../src/v02/public.ts): `Pick`/`Omit` от private reference с сохранением generics и controlled pair, исключённые props — optional `never`), runtime gate и dist verification. Публичный `Calendar` удаляет props вне slice и один раз выдаёт development warning `[@nelmad/calendar] <prop>: not available in 0.2.0-alpha.1; ignored`; production молчит. Internal `CalendarMonth` сохраняет полный reference surface для tests следующих этапов. Будущий prop никогда не становится молчаливым no-op.
- **Обязательный `layout`.** В alpha.1 нет `auto` и mobile presentation, поэтому `layout` обязателен и принимает только `'desktop'`. Отсутствующее или иное значение в runtime — contract error с диагностикой `layout` и safe shell без grid. С T15 `layout` снова optional, default `'auto'`.
- **Base theming и расширенный customization.** `theme` (только `classicTheme`), `tokens`, scoped CSS variables, `density` и `colorScheme` относятся к базовому theming §10.3 и входят в alpha.1. Slots, class callbacks и appearance resolver — advanced epic «расширенный customization» (§2.1) и появятся в alpha.2 (T18).
- **Brief T03 для alpha.1 не нужен.** §2.1 требует датированный brief до включения advanced epic в первый prerelease. В alpha.1 нет ни одного advanced epic (sources, selection/create, move, расширенный customization), поэтому gate не применяется. Briefs [customization](t03-brief-customization.md) и [sources](t03-brief-sources.md) уже подготовлены для alpha.2.

## Реализация

Части A–C (до этого отчёта):

- **A — surface gate.** `surface.ts`/`public.ts`, обязательный desktop layout, публичные [positive/negative fixtures](../../tests/contracts/public), [surface tests](../../src/v02/calendar/__tests__/surface.test.tsx) и SSR-вариант. Публичные declarations (`evidence/t14/public-types`) проверены TypeScript 5.4.5 и 5.9.3.
- **B — документация.** Двуязычные README/[API](../api.md)/[migration guide](../migration-0.1-to-0.2.md), generated [API report](../api/calendar.api.md), docs gate `check:docs`/`check:api` и runnable [migration conversion](../../examples/migration/convert.ts) с [tests](../../tests/docs/migration.test.tsx). Docs manifest (`evidence/t14/docs/manifest.json`).
- **C — examples и stories.** Документированные [Vite](../../examples/vite) и [Next.js App Router](../../examples/next) apps стали packed-consumer fixtures; Storybook stories импортируют только `@nelmad/calendar`. Packed examples (`evidence/t14/packed-examples/final/manifest.json`): 42/42.

Часть D — acceptance:

- [`alpha-acceptance.mjs`](../../scripts/implementation/alpha-acceptance.mjs) (`--milestone=alpha.1|alpha.2`, `--output`) один раз собирает и пакует candidate. Manifest привязан к version, npm integrity (sha512), sha256 архива, списку файлов, git HEAD с dirty flag, source hashes и точным версиям Node/Chrome/Playwright/axe/React/Next/Vite. Архив лежит рядом с manifest. Для alpha.2 достаточно расширить state matrix; несовпадение версии пакета с milestone останавливает прогон.
- Логика изоляции вынесена в [`packed-harness.mjs`](../../scripts/implementation/packed-harness.mjs): build/pack, копия example вне checkout с harness-only overlays, сохранённые lockfiles, проверка integrity и отсутствия Day.js, SSR servers. [`packed-consumers.mjs`](../../scripts/implementation/packed-consumers.mjs) использует тот же модуль. Повторный `check:package` после рефакторинга сохранён в packed-final (`evidence/t14/packed-final/manifest.json`).
- [Acceptance overlays](../../scripts/implementation/acceptance-probes) добавляют в копии examples одну страницу сценариев: Vite SSR + `hydrateRoot` в StrictMode, Next Server Component → client component. Состояние выбирается URL-параметрами, поэтому server HTML и client получают одинаковый input. Импортируются только public root и `styles.css`. В manual-режиме `onNavigate` удерживается до явного acceptance, так проверяется отложенный controlled flow.
- `axe-core@4.14.0` (последний 4.x на 6 октября) закреплён точной версией только в `scripts/implementation/spikes` и его lockfile. SDK dependency не добавлялась.
- **Найденный дефект SDK.** На screenshots refresh loading/error status region вплотную примыкал к stale grid: зазор 0 px, у empty region 8 px. [CSS](../../src/v02/styles.css) добавляет `--nelmad-calendar-spacing-sm` между status и view. Регрессию ловит Chrome check `refresh-status-spacing`. До исправления дефект виден в attempt-1 (`evidence/t14/acceptance-attempts/attempt-1/vite-1280x900-loading-refresh.png`).
- [22 новых tests](../../src/v02/calendar/__tests__/alpha1.test.tsx) проверяют через публичный Calendar строки ledger, которые раньше подтверждались только private fixture/core: R01, R02.1, R05, R06 (hydration в StrictMode), R07, R16, R49, R59 и правила §5.1/§5.1.1.

## Проверки

Acceptance manifest (`evidence/t14/acceptance/manifest.json`): **157/157 checks, ноль ошибок/предупреждений console и внешних запросов**. Candidate `0.2.0-alpha.1`, integrity `sha512-XzdiFrAcG/ACURB6EHGqgKxS8LEMgQrOT9CHWdkZS+heqDW8n17J+YbABN11fIbWx5FmvdydxkgOIB2/IMMGlw==`, sha256 `710656b3cf95e9fa5880887174714f45d3379d3964f5acb5e5df0ef52660632f`, 81 файл; git HEAD `ba8bb48`, `gitDirty: true` (работа 0.2 не закоммичена, поэтому evidence привязано к integrity/sha256 архива). Профиль: Node 24.20.0, Chrome 154.0.8037.98, Playwright 1.55.1, axe-core 4.14.0; Vite 6.4.3 + React 18.3.1; Next.js 16.3.6 + React 19.3.0.

| Группа | Что проверено |
| --- | --- |
| Package | Содержимое tgz совпадает с `npm pack`; нет Day.js в файлах/imports/declarations; только `.` и `./styles.css`, нет `tokens.css`. Isolated install через сохранённые lockfiles; typecheck и production build страницы сценариев в обоих consumers |
| SSR | 13 состояний × 2 consumers: HTML фрагмента Calendar побайтно совпадает у двух серверов с разными `TZ` (Tokyo/Los Angeles), `LC_ALL` (ja/de) и часами со сдвигом на 400 дней. Month: `aria-colcount=7`, `aria-rowcount=6`, 7 columnheaders, 35 cells, один `tabindex=0`, `aria-current` только у fixed today, полные counts в descriptions; root назван fallback `aria-label` без непроверенного `aria-labelledby`. Blocking states и contract shell не содержат grid |
| Hydration | Browser в `Pacific/Kiritimati`/`de-DE`, отличном от обоих серверов: один grid, today и roving target сохранены, ровно один `onVisibleRangeChange` с server range, после commit добавлен валидный `aria-labelledby` |
| Keyboard | Один Tab stop в grid (Previous → Today → Next → cell → после Calendar и обратно); arrows/Home/End без navigation; arrow за grid и PageUp/PageDown/Shift ждут acceptance, focus держится до него; `01-31 → 02-28 → 03-28`; Tab-away до acceptance не теряет внешний focus; toolbar Next/Next/Previous дают ровно три `Открыт месяц: …`; Today ждёт acceptance и переводит focus в today cell без announcement; Enter открывает dialog с focus на первом control, `aria-controls`/`aria-expanded`; Tab/Shift+Tab проходят items и логически выходят после/до trigger; Escape возвращает focus в date cell; item activation даёт точный payload; blocking loading/error переводит focus в status region, Retry вызывает `onRetryRequest`, после ready focus возвращается в cell; RTL `ar-EG` зеркалирует arrows |
| Layout | Bar/chip presentation (R03), bar через границу недели с точными `segmentRange` и hit date (R35.1); constrained 520 px: `+N` ≥ 24×24, `aria-hidden`, без Tab stop, controls не обрезаны; refresh status spacing |
| axe | 14 состояний × 2 viewports × 2 consumers = 56 сканов по `wcag2a/2aa/21a/21aa/22aa` (best-practice отдельно): initial month, open agenda, initial/refresh loading, initial/refresh error с retry, empty, contract shell, dark, comfortable, RTL ar, constrained `+N`, ru-RU, en-US. **0 нарушений** в package-owned UI и в harness; best-practice — 0 нарушений |

Все checks выполнены в Chrome при 1280×900 и 1024×768, в обоих consumers.

**axe: одно ограниченное исключение.** Экспериментальное правило `label-content-name-mismatch` сообщает о date cells с `+N`. Видимая метка cell — номер дня, и он входит в accessible name (полная дата). `+N` — обязательный по §6.3/§12.1 `aria-hidden` индикатор внутри gridcell; его accessible equivalent — ровно один `moreItemsLabel` в description. Правило не отключено. Узел исключается только после проверки предиката в странице: gridcell, `.nc-overflow[aria-hidden=true]` с `+<число>`, иного видимого текста нет, номер дня есть в name, число — в description. Любой другой узел этого правила валит acceptance. Обоснование и счётчики (23 узла на каждый consumer/viewport) записаны в `manifest.axe`. Проверка speech input/AT остаётся в T28.

**axe incomplete.** Каждый package-owned incomplete-узел получает проверенное разрешение, иначе check падает. Для `color-contrast` (фон перекрыт слоем items, слишком короткий текст) contrast вычисляется по computed colors с alpha compositing и проверкой отсутствия перекрытия item. Минимум 6.05:1 в light и 7.95:1 в dark. Для `aria-controls` при `aria-haspopup` проверяется dialog в том же tree. Для `label-content-name-mismatch` в арабских цифрах проверяется, что номер дня входит в name.

**Screenshots** (acceptance (`evidence/t14/acceptance`)) просмотрены: Vite — все 14 состояний в двух viewports, Next — month и agenda. Найденный зазор status/grid исправлен. Остальное — замечания, не дефекты:

- при intrinsic высоте compact row помещает одну lane и `+N`, это ожидаемый preferred size;
- в RTL `+٢` отображается как `٢+` по bidi-правилам;
- в `ar-EG` package-owned labels английские: catalogs только RU/EN, fallback `en-US` по §11.2;
- при `hourCycle={12}` chip показывает `02:00 AM` с ведущим нулём: двузначный час формата, не нарушение §11. Стоит пересмотреть вместе с оформлением в T18;
- disabled toolbar при initial loading имеет пониженный contrast, disabled controls исключены из 1.4.3.

Перекрытий, обрезанных controls, horizontal page scroll или потери focus ring не найдено.

Регрессии текущего кода (Chrome, ноль page errors): Month (`evidence/t14/regression-month/browser.json`) **36/36**, agenda (`evidence/t14/regression-agenda/browser.json`) **72/72**, controller (`evidence/t14/regression-controller/browser.json`) **59/59**, foundation (`evidence/t14/regression-foundation/browser.json`) **108/108**. Packed consumers после рефакторинга (`evidence/t14/packed-final/manifest.json`): **42/42**, та же integrity. Общая регрессия (`evidence/validation-2026-10-06-t14/manifest.json`): **21/21 checks, 479 tests в 23 suites** (typecheck, lint, оба reference compilers, docs/API gates, timezone generators, четыре host timezone, library и Storybook builds, syntax harness).

Неудачные прогоны сохранены в acceptance-attempts (`evidence/t14/acceptance-attempts`):

- attempt-1 — ошибки harness: id RAC-кнопок вместо labels, сценарий Today внутри видимых соседних дат. Там же исходные axe-находки и screenshot с дефектом spacing;
- attempt-2 — ошибка листинга содержимого tgz;
- attempt-3 — полный pass до добавления последних unit tests. Перенесён в attempts, потому что source hashes test-файла устарели.

Ledger: все alpha.1 строки и subchecks (S5.1, S5.1.1, R01, R03, R05, R06, R07, R16, R32, R40, R49, R59, R65, R02.1, R15.1, R35.1) сверены с полным ожидаемым текстом и отмечены `pass` с конкретными evidence paths. Родительские R02/R15/R35 остаются `in_progress` до beta.1. Блоки §13/§17/§18 получили T14 evidence как `in_progress`; bullets §18 о будущих возможностях (move, actions, sources, slots, mobile, drag, touch selection) остаются `planned`.

```sh
npm ci && npm ci --prefix scripts/implementation/spikes
node scripts/implementation/alpha-acceptance.mjs --milestone=alpha.1 --output=/private/tmp/calendar-t14-acceptance
for probe in month agenda controller foundation; do node scripts/implementation/$probe-probe.mjs /private/tmp/calendar-t14-$probe; done
node scripts/implementation/verify-foundation.mjs /private/tmp/calendar-t14-validation
```

## Границы

- Это prerelease acceptance, **не stable gate §12.5/§19**. Не выполнены: manual AT (NVDA, VoiceOver, TalkBack), forced-colors и reduced-motion, reflow 320 px/zoom 400 %, text spacing, полный contrast non-text/focus indicator, target size всех controls, Firefox/Safari и support matrix, real devices.
- axe проверяет только автоматически определяемые критерии. Исключение `label-content-name-mismatch` и incomplete-разрешения требуют ручного подтверждения в T28.
- Candidate собран из незакоммиченного рабочего дерева (`gitDirty: true`). Публикация — отдельное release-действие: решение принимает пользователь, `npm publish <tgz>` выполняется без rebuild, после него нужен registry install с той же integrity. Ничего из этого не выполнялось.
- Mobile/auto layout, overlays, actions, sources, `neutralTheme`, slots — T15–T19. Selection/move — beta.1. `az-Arab` native SSR mismatch (T08), physical touch (T02/T23), performance budgets (T25) и pilots остаются открытыми.
