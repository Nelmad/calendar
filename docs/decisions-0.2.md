# `@nelmad/calendar` 0.2 — ключевые решения

Сводка на 23 октября 2026: что выпускает `0.2.0-alpha.2`, какие решения приняты и почему, как устроены доказательства
и выпуск, что остаётся открытым. Нормативный источник — [спецификация](specification-0.2.md), порядок работ и gates —
[план](implementation-plan-0.2.md); при расхождении приоритет у спецификации. Журнал реализации, baseline T01, журналы QA,
независимых проверок и решений, отчёты задач T02–T19 и briefs T03 хранятся в локальном архиве вне репозитория; их
последняя версия в git — commit `c0077e3` из PR #4 (последний до сокращения документации)
([`docs/implementation` на этом commit](https://github.com/Nelmad/calendar/tree/c0077e3710c4d6b94888d43e4547359259462f98/docs/implementation)).
При squash merge PR этот commit не попадает в историю `main`: в clone сначала `git fetch origin pull/4/head`, затем
`git show c0077e3:<path>`. Идентификаторы в комментариях кода и названиях сценариев probes (QA-…, T16-V3-…, DV8-1-…,
«review 2026-10-09-N») относятся к этим журналам.

## Prerelease и surface gate

- `0.2` — несовместимая замена `0.1`: один API `items`, без adapter, legacy mode и Day.js. Root exports — `Calendar`,
  `getCalendarVisibleRange`, `classicTheme` и `neutralTheme`, один stylesheet, peers — только React/ReactDOM.
- `0.2.0-alpha.1` (T14, 6 октября 2026) — desktop slice. Packed candidate прошёл 157/157 SSR/hydration/keyboard/axe checks
  в Vite/React 18 и Next.js/React 19, но не публиковался (в CHANGELOG — `Unreleased`); alpha.2 построен поверх него.
- `0.2.0-alpha.2` (T15–T19) добавляет responsive `layout` (default `"auto"`, точная граница 639/640 px,
  `mobileBreakpoint`), `agendaPresentation` и повестку inline/popover/sheet, `portalContainer`, item actions, sources,
  `neutralTheme`, `getItemAppearance`, `classNames` и семь render slots. Acceptance alpha.2 на packed archive в Vite/React
  18 и Next.js/React 19 (SSR, hydration, desktop 1280 и телефон 390 px с touch emulation, overlays, ShadowRoot, keyboard
  и 122 скана axe по темам, density, цветовым схемам и RTL без нарушений) последний раз прошёл локально 22 октября 2026
  (302/302); теперь его выполняет CI на каждом PR. Version не опубликована.
- Surface gate ([`src/v02/surface.ts`](../src/v02/surface.ts)) — единственный источник публичных declarations, runtime
  gate и проверки dist. До `0.2.0-beta.1` исключены `selection`, `onSelectionChange`, `onCreateRequest`,
  `itemMoveStates`, `onItemMoveRequest`, `onItemMoveDraftChange` и `interactionPolicy`: в declarations они `?: never`, в
  runtime удаляются с одним development warning на имя. Будущий prop не становится молчаливым no-op (план §3.2), а
  selection/create и move выходят вместе для pointer, touch и keyboard (§2.1).
- `tokens`, CSS variables, `density` и `colorScheme` — базовый theming §10.3, публичный с alpha.1 (решение lead в T14).
  Slots, `classNames` и `getItemAppearance` — advanced epic «расширенный customization»; второй advanced epic alpha.2 —
  sources.

## Уточнения спецификации

Все уточнения ниже — трактовка, а не изменение scope: §5.7 и строки §19.4 не менялись, `src/v02/reference.d.ts`
совпадает с §5.7. Draft v7 одобрен пользователем (владельцем спецификации) 9 октября 2026, draft v8 — 22 октября 2026
(подтверждение lead 23 октября 2026: одобрение дано пользователем в основной сессии).

| Draft, § | Решение | Почему |
| --- | --- | --- |
| v7, §7 | `layout="auto"` сохраняет точную границу, но пока измеренная ширина колеблется из-за обратной связи собственной полосы прокрутки, текущий layout удерживается в полосе `[mobileBreakpoint − Δ, mobileBreakpoint + Δ)`; смена `mobileBreakpoint` или `layout` сбрасывает удержание. Потребителям рекомендуется `scrollbar-gutter: stable` | Буква v6 давала переключение каждый кадр (66 в секунду), удержание на 0,5 px — чередование на каждом шаге перетаскивания окна |
| v7, §10.3.4 | Цель portal по умолчанию — ближайший открытый modal container корня в том же документе (`<dialog>` в `:modal` или `aria-modal="true"`), иначе `ownerDocument.body`; явный `portalContainer` главнее | Внутри модального окна хоста повестка в `body` недостижима (`inert`, focus trap, `pointer-events: none`); любой `role="dialog"` без `aria-modal` целью не считается — немодальная панель ломала бы модальность sheet |
| v7, §10.3.2 | Значение `tokens` с `;` или `!` на верхнем уровне, несбалансированными кавычками, скобками или комментариями либо с любым `url(` (в том числе экранированным) отвергается — правило безопасности, а не `CSS.supports` | React SSR пишет строку токена в атрибут `style` как текст; правило одинаково на server и client |
| v7, §11.3 | SSR и первый client render `auto` — компактный mobile month; inline-повестка входит в него только при `agendaPresentation="auto"`, при `"overlay"` повестки нет до activation | Иначе серверная inline-повестка исчезала бы при hydration и мелькала |
| v8, §12.3 | После закрытия standalone source selector по любой причине focus, бывший внутри, возвращается на его trigger в toolbar; общий порядок §12.3 — только если trigger исчез; внешний focus не забирается | Паттерн WAI-ARIA menu button; согласовано с §12.2 (`Escape`) и R39 (смена layout) |
| v8, §10.3.3 | `CalendarSource.color` и цвета `getItemAppearance`, не являющиеся одним значением декларации (то же правило, что у `tokens`), считаются отсутствующими с development warning; остаётся нижний канал (accent source, затем token темы) | Иначе значение с `;` добавляло бы декларации в серверный `style`, а клиент отвергал бы его целиком: server и client расходились бы (R63) |
| v8, §10.3.4 | Если строгий `style-src` отбросил серверные атрибуты `style`, после hydration пакет через CSSOM заново применяет только собственные validated declarations; `style` корня потребителя не восстанавливается | Это не обход CSP: stylesheet не внедряется, а `<style>` pressable-правил React Aria требует документированного nonce |
| v8, §12.1 | Имя строки повестки с `renderAgendaItem` — сводка пакета, затем видимое содержимое slot; без slot — сводка | WCAG 2.5.3 (Label in Name): видимое содержимое должно входить в имя |

## Технические решения

- Даты (T02, T05): private adapter над `@internationalized/date` 3.12.2 с явно настроенным Gregorian Intl; публичные
  типы не используют типы этой зависимости. Грамматика RFC 3339, Gregorian date и UTC instant bounds проверяются до
  разбора библиотекой, вход не исправляется; gap отклоняется, в fold выбирается более ранний instant.
- Часовые пояса (T06): accepted-set не выводится из Intl. Сгенерированный candidate — tzdb 2026c, ECMA-402 edition 12,
  445 primary identifiers (`UTC` входит): [`timezones-candidate.ru.md`](implementation/timezones-candidate.ru.md),
  generator `scripts/implementation/timezones/generate.mjs`. Freeze и RC runtime matrix — T27.
- React Aria — основа внутренних primitives (T02, T09, T16). Поддержка Shadow DOM (`enableShadowDOM` из `react-stately`
  с тем же точным pin, что у react-aria и RAC) включается внутри пакета до первого overlay, без public bootstrap. Focus
  ведёт собственный контроллер: дерево владения вложенными overlays и восстановление trigger → соседи по прежней
  позиции → heading родителя.
- Touch (T02): кандидат gesture policy для move — ручка 44 × 44 px, long press 450 ms, slop 8 px; проверен только
  эмуляцией Chrome (24/24). Путь без перетаскивания «Перенести → дата → Подтвердить/Отмена» обязателен.

## Доказательства и выпуск

- Изменение процесса 22 октября 2026 (spec draft v9; решение пользователя, принятое им в основной
  сессии; текст оформлен задачей workflow PROCESS-V9): raw evidence (screenshots, probe JSON, logs, tarballs, manifests) в
  репозитории не хранится; прежний каталог `docs/implementation/evidence/` (около 17 тыс. файлов, 1,2 ГБ) архивирован
  вне репозитория и игнорируется git. Доказательство — re-runnable checks с документированной командой, CI на каждом
  PR и push в `main` (отчёты прогонов — CI artifacts) и npm provenance опубликованной version. Ручные результаты (AT,
  устройства, пилоты) — краткие датированные отчёты в docs.
- Выпуск — процесс владельца репозитория ([RELEASING.md](../RELEASING.md); введён PR #1, по нему выпущен `0.1.1` — в npm
  19 октября 2026), с которым текст spec draft v9 согласован 23 октября 2026 (задача workflow RELEASE-ALIGN; отдельного
  подтверждения владельцем этого текста не записано). Ручной [Release workflow](../.github/workflows/release.yml) на
  `main` (environment `npm-publish`) повторяет typecheck, tests, build и `scripts/check-pack.mjs` и ставит version в npm
  staged publishing с provenance через trusted publishing без tokens: prerelease — dist-tag `next`, `latest` не
  переходит на prerelease. Публичной version становится после подтверждения мейнтейнера с 2FA на npmjs.com; затем
  workflow создаёт tag `vX.Y.Z` и GitHub Release с разделом CHANGELOG. Прежний workflow этой ветки по version tag и
  `scripts/release/gate.mjs` удалены; инварианты workflow владельца проверяет
  `scripts/release/release-metadata.checks.mjs`.
- Release workflow не запускает packed consumers, acceptance milestone и Chrome probes — их выполняет только CI, поэтому
  Release запускается после зелёного CI на выпускаемом commit `main` (§19.2). CI-tarball и staged tarball —
  воспроизводимые сборки одного commit, их побайтное совпадение не утверждается; опубликованную version с проверенным
  кодом связывает commit в provenance.
- Integrity локальных candidates alpha.2 (`sha512-fPtPXlZT…`, `sha512-Mz56MW7g…` и последующие) — исторические. CI на
  выпускаемом commit пакует и проверяет архив (integrity и состав — в CI artifacts этого прогона); опубликованный staged
  tarball — воспроизводимая сборка того же commit, а не этот файл (см. выше).
- Сокращение процессной документации 23 октября 2026 (выбор владельца 23 октября 2026: спецификация, план, данные
  часовых поясов и пользовательская документация остаются, остальное — в локальный архив): журнал реализации, baseline T01, журналы QA, проверок и решений, отчёты задач и briefs T03
  удалены из репозитория; ключевые решения сведены на эту страницу. Requirement ledger
  `docs/implementation/requirements-0.2.json` — локальный файл в `.gitignore`: `npm run check:requirements -- --write`
  создаёт его из спецификации и плана (при наличии прежней локальной копии переносит статусы и evidence записей с
  неизменённым текстом), без `--write` команда сверяет локальную копию, а если её нет — только соответствие спецификации
  и плана. Без локальной копии `--write` создаёт все записи со статусом `planned`; чтобы сохранить статусы на 23 октября
  2026 (`pass` 192, `in_progress` 203, `planned` 358), сначала положите копию с commit `c0077e3` (см. начало страницы):
  `git show c0077e3:docs/implementation/requirements-0.2.json > docs/implementation/requirements-0.2.json`, затем
  `--write` (новый id получает только изменённый блок §19.1, бывший `planned` без evidence). CI запускает
  `npm run check:requirements` без ledger (соответствие спецификации и плана: SHA-256, строки R01–R74) и self-check
  формы записей (`scripts/implementation/requirements.checks.mjs`); сам ledger CI не проверяет. Текст спецификации изменён: в §19.1 «requirement ledger репозитория» → «requirement ledger», строка статуса
  дополнена; SHA-256 `67cb25d7…d0707e` → `b73da2a0…1c9081`; §5.7 и строки §19.4 не менялись, число строк файла то же.

## CI

[ci.yml](../.github/workflows/ci.yml) работает на каждом pull request и push в `main` с token только `contents: read`:

- `build` (`ubuntu-latest`, Node 22): typecheck, build, `scripts/check-pack.mjs`, API report, docs gate и его self-test,
  self-checks ledger, harness и release, timezone и transitions checks, contract types (TypeScript по умолчанию и 5.4.5 в
  `packed-consumers`), Storybook typecheck, lint, tests (поднабор ещё раз под `TZ=Africa/Monrovia` и `de_DE.UTF-8`),
  Storybook build;
- `packed-consumers` (`ubuntu-24.04`, Node 24): один `npm pack`; на этом архиве packed consumers и acceptance milestone
  версии, оба сначала сверяют архив со сборкой checkout;
- `browser-probes` (`ubuntu-24.04`, Node 24): 15 Chrome probes исходников checkout, включая story smoke; `locale-probe.mjs`
  не входит (открытая qualification T08 до T27).

Jobs с Playwright закреплены на `ubuntu-24.04`, а не `ubuntu-latest`: Playwright 1.55.1 (pin
`scripts/implementation/spikes`) не устанавливается на Ubuntu 26.04 — для неё нет сборки ffmpeg.

## Открытые пункты

- T25: JS bundle около 93 KiB gzip (Vite) выше кандидатного потолка 80 KiB §15.1 ещё до DnD и selection (проверка
  2026-10-09-3, № 13). Бюджеты фиксируются или один раз пересматриваются до первой beta.
- T27: native SSR mismatch `az-Arab` — Node 24.20 (ICU 78.3) и Chrome форматируют дату по-разному, и hydration
  расходится; ещё около 96 языков full ICU Node нет в Chrome 155. README описывает ограничение; до qualification T27 эти
  SSR profiles не считаются совместимыми.
- Не проверялись: физические iOS/Android (B02-TOUCH открыт до T23; по решению пользователя 8 сентября 2026 не блокирует
  реализацию), manual AT (NVDA, VoiceOver, TalkBack), Firefox и Safari, ручной аудит контраста, reflow 320 px, zoom 400 %
  и text spacing. axe покрывает только автоматически определяемые критерии.
- T03: briefs `iterate` для sources и расширенного customization (6 октября 2026) утверждены владельцем 22 октября 2026,
  набор участников не начат. Brief sources требует пересмотреть встроенный selector в сторону `defer` (data-часть
  остаётся) явной правкой спецификации, если оба ранних участника его отключают, ни один не подтверждает асинхронное или
  внешнее хранение фильтра или к началу T19 не найден участник из СНГ; последнее условие выполнено, отдельного решения
  по нему при утверждении `iterate` не записано. Ранний внешний feedback по advanced epics не собран — никто не
  приглашён; пункт 3 карточки T19 отложен решением пользователя 22 октября 2026. До RC/stable на каждый advanced epic
  нужны два независимых положительных пилота с явным `go` (§2.1, §19.3, T30); набор участников начинается только с
  явного разрешения пользователя. Датированные comparison briefs и decision records обоих epics, которых требует §2.1
  (6 октября 2026, `iterate` утверждён 22 октября; в них же критерии `go` для каждого пилота, а в brief customization —
  пересмотр альтернатив после alpha.2 feedback и повторно перед T30), удалены из репозитория вместе с журналами: они в
  локальном архиве и на commit `c0077e3` (`t03-brief-sources.md`, `t03-brief-customization.md`; см. начало страницы).
  Manifest RC/stable должен ссылаться на них (§19.2), поэтому до RC их нужно восстановить в docs как датированные документы.
- beta.1 (T20–T26): selection/create (T20), move proposal, request lifecycle, input adapters и интеграция (T21–T24),
  полный performance freeze (T25), acceptance (T26). Строки R41 и R60 и beta-части составных R02, R15, R27 и R35
  закрываются там.
- §13.3: `<style>` pressable-правил React Aria (runtime style injection) остаётся открытым до stable; при строгом CSP нужен
  документированный nonce.
- Проверка после публикации (registry install, commit в provenance, `npm audit signatures`) обязательна для stable (T32);
  для prerelease она в процессе не записана.
- Verification-поля записей ledger — общие формулировки («where applicable», «where required»); до RC/stable каждую строку
  scope/§19.4 нужно сопоставить с конкретной командой и test, которые CI выполняет на выпускаемом commit (§19.1, T31).
