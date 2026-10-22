# `@nelmad/calendar` 0.2 — подробный план реализации

<a id="process-2026-10-22"></a>Изменение процесса, 22 октября 2026 (решение пользователя; источник — задача workflow PROCESS-V9, у пользователя в сессии не перепроверялось): хранение raw evidence в репозитории прекращено. Screenshots, probe JSON, HTML, logs, упакованные tarballs и manifests отдельных прогонов больше не создаются для репозитория и не цитируются как доказательство; каталог `docs/implementation/evidence/` архивируется вне репозитория и удаляется. Причины: стоимость и размер (тысячи файлов, повторно перезаписываемые каждым раундом), отсутствие ценности сверх проверок, которые любой может повторить документированной командой, и стандартная практика — CI на каждом pull request плюс npm provenance для опубликованного package. Проверка теперь — tests, type/contract checks, docs checks и browser probes с документированной командой: их запускает исполнитель, повторяет проверяющий, и CI выполняет их на каждом PR (уточнено [раундом 1 исправлений](#process-2026-10-22-fix-1): job `browser-probes` — все Chrome probes и story smoke, кроме открытой qualification `locale-probe.mjs`; job `packed-consumers` один раз пакует архив и запускает на нём packed consumers и acceptance milestone). Доказательство релиза — release workflow GitHub Actions по version tag: один раз собирает tarball, выполняет на этом файле все gates (packed consumers и acceptance milestone устанавливают сам файл; gates, читающие `dist`, идут на сборке checkout, побайтно сверенной с архивом до и после них; Chrome probes — на исходниках того же checkout), публикует тот же файл с npm provenance (Sigstore attestation, связывающая package с commit и workflow run) и создаёт GitHub Release; logs и reports прогона хранятся как CI artifacts. Ручные результаты (AT, физические устройства, пилоты) — краткие датированные отчёты в docs. Прежние ссылки отчётов и ledger на `evidence/` — исторические, неверсионированные локальные artifacts. Spec draft v9 переносит это правило в §§11.3, 12.5, 14, 15.3, 18, 19.1 и 19.2.

Статус: реализация идёт. Выполнены T01 и T04–T19 (открытые ограничения T02/T08 — ниже; пункт карточки T19 о раннем внешнем feedback T03 отложен 22 октября 2026 как решение пользователя по задаче workflow DECISIONS-V8, у пользователя в сессии не перепроверялось ([источник](implementation/decisions-2026-10-22.md#approval-source)) — он не выполнен и остаётся обязательным до RC/stable по §19.3; утверждение briefs T03 — из того же источника, набор участников не начат): private core, Month/DayAgenda, публичный package cutover, [alpha.1 acceptance](implementation/t14-alpha1-acceptance.md), responsive/overlays/actions/sources/themes ([T15](implementation/t15-responsive.md)–[T18](implementation/t18-themes-slots.md)) и [alpha.2 acceptance](implementation/t19-alpha2-acceptance.md). Candidate `0.2.0-alpha.2` прошёл acceptance на packed archive в Vite/React 18 и Next.js/React 19 (SSR, hydration, desktop 1280 и телефон 390 с touch, overlays, ShadowRoot, keyboard и axe по темам/density/цветовым схемам/RTL) и подготовлен для отдельного решения о публикации; npm publish не выполнялся. Открытые трактовки T15/T16 закрыты уточнениями spec draft v7, одобренными пользователем 9 октября ([решения 2026-10-09](implementation/decisions-2026-10-09.md)); неблокирующие замечания проверок T14–T19 разобраны в [остаточных исправлениях](implementation/t19-alpha2-acceptance.md#остаточные-исправления) 19 октября (пункт 3 T19 отложен по тому же источнику, правило цветов items T18 утверждено spec draft v8 — [решения 2026-10-22](implementation/decisions-2026-10-22.md)); замечания независимой проверки 1 (аудит соответствия спецификации) исправлены в двух раундах [проверки 2026-10-09-1](implementation/review-2026-10-09-1.md), кроме цели восстановления focus selector sources, которую затем утвердило решение 1 spec draft v8; все 27 замечаний независимой проверки 2 (многоаспектное чтение кода) и три замечания её повторной проверки исправлены в двух раундах [проверки 2026-10-09-2](implementation/review-2026-10-09-2.md); замечания независимой проверки 3 (black-box тестирование packed candidate) исправлены в [проверке 2026-10-09-3](implementation/review-2026-10-09-3.md), кроме размера bundle выше кандидатного потолка §15.1 (открытый риск до performance spike). [Финальная переквалификация](implementation/t19-alpha2-acceptance.md#финальная-переквалификация) 19 октября на итоговом дереве после трёх проверок прошла: acceptance alpha.2 303/303 и packed consumers 58/58 на integrity `sha512-fPtPXlZT…JcyWqsg==`, все Chrome probes без регрессий. Этот candidate — исторический: решение 3 spec draft v8 изменило SDK, и 22 октября [заменяющий candidate](implementation/t19-alpha2-acceptance.md#заменяющий-candidate-решения-2026-10-22) `sha512-Mz56MW7g…Nadbw==` прошёл acceptance alpha.2 303/303 (122 скана axe, 0 нарушений), packed consumers 58/58 и Chrome probes 658/658; итоговый candidate `0.2.0-alpha.2` — он. Ранний внешний интеграционный feedback по advanced epics с участниками T03 не собран (никто не приглашён) и остаётся обязательным. Native SSR mismatch `az-Arab` (и, по проверке 3, ещё 96 языков full ICU Node, которых нет в Chrome) остаётся открытым до выравнивания Intl data и qualification T27. В T02 выполнены 24 сценария touch emulation; physical iOS/Android недоступны, real-device gate остаётся открытым и не блокирует продолжение по решению пользователя от 8 сентября. Следующий этап — T20 (selection и create, beta.1). Результаты и ограничения — в [журнале реализации](implementation/progress-0.2.md). Выпуск `0.2` ещё не готов.

Дата: 5 сентября 2026.

Основание: [спецификация 0.2, draft v9](/Users/nelmad/Developer/calendar/docs/specification-0.2.md), SHA-256 `d40619813132c26a655c1bc256aed1ad7f65ad63ca7e5921a736cf7c410c0eb6`.

Draft v7 — уточнение, одобренное пользователем (владельцем спецификации) 9 октября 2026, а не изменение scope: четыре правила (§7 удержание `auto` при обратной связи полосы прокрутки, §10.3.4 default portal target в открытом modal container, §10.3.2 правило безопасности значений `tokens`, §11.3 SSR `auto` с `agendaPresentation`) разрешают открытые вопросы трактовки QA-исправлений 2026-10-09; в коде из-за них сужено распознавание modal container, значение `tokens` с любым `url(` отвергается, а цель portal по умолчанию пересчитывается и при смене одних атрибутов модальности. Текст §10.3.2 v7 исправлен в раунде 1 проверки решений, чтобы дословно передавать одобренное правило `url(` (прежний SHA-256 v7 — `16cbcbd85c09a2c137d88ec644ab05eb81e042086f8704fe47aff4666286a002`). §5.7 и строки §19.4 не менялись. Подробности — [решения 2026-10-09](implementation/decisions-2026-10-09.md).

Draft v8 — уточнение, одобренное пользователем (владельцем спецификации) 22 октября 2026, а не изменение scope: четыре правила (§12.3 возврат focus на trigger standalone source selector, §10.3.3 правило одного значения декларации для `CalendarSource.color` и цветов `getItemAppearance`, §10.3.4 восстановление через CSSOM только собственных validated declarations пакета при строгом CSP, §12.1 accessible name строки agenda с `renderAgendaItem`) закрывают открытые вопросы трактовки проверок T17–T19; прежний SHA-256 v7 — `4d54f73e9ce7d90709b0f20248ef668244b3738060a5380a5d293b2bdd1d8388`. §5.7 и строки §19.4 не менялись. Подробности — [решения 2026-10-22](implementation/decisions-2026-10-22.md).

Draft v9 — изменение процесса выпуска, одобренное пользователем (владельцем спецификации) 22 октября 2026, а не изменение scope или поведения пакета: вместо хранимого immutable release-evidence manifest и raw artifacts доказательство релиза — release workflow CI, который один раз собирает tarball по version tag, выполняет на нём все gates и публикует тот же файл с npm provenance, с GitHub Release и notes из CHANGELOG; manifest — отчёт этого run среди CI artifacts, ручные результаты — датированные отчёты в docs (§§11.3, 12.5, 14, 15.3, 18, 19.1, 19.2; см. [примечание выше](#process-2026-10-22)). Прежний SHA-256 v8 — `b35babb559f93ae5ad880de5e48c72f7e85cdbcc7aa4ba7c4dfe37d70e2601ab`. §5.7 и строки §19.4 не менялись, число строк файла то же.

Спецификация определяет **что** должен делать пакет; этот документ — **в каком порядке это построить и чем подтвердить результат**. При расхождении приоритет у спецификации. План не изменяет scope, публичный API или release gates. Переход к написанию кода, публикации npm, приглашению пилотов и deployment выполняется отдельными задачами, а не самим принятием этого документа.

## 1. Результат и границы

Результат — один встраиваемый React/TypeScript npm-пакет с Month View и встроенным DayAgenda, ISO/IANA-моделью, controlled API, доступными взаимодействиями, двумя темами и доказанными критериями выпуска.

- `classicTheme` остаётся default; `neutralTheme` — второй preset.
- Переход несовместим с `0.1`: не строим adapter, legacy mode или union старых и новых props.
- Удаляем Day.js из целевого SDK, включая dev/peer dependencies и production graph. Наличие Day.js у потребителя допустимо, но SDK от него не зависит.
- React Aria — основа внутренних доступных primitives; собственными остаются calendar state, date grid, delayed focus, move protocol и композиция объявлений.
- Не реализуем week/day views, recurrence, встроенный редактор, ICS, CalDAV, backend или standalone-приложение. Это кандидаты следующего планирования, а не «дополнительные задачи» текущего backlog.
- Разделение на этапы не разрешает выпустить pointer-only move, недоступное overflow или фиктивные props без поведения.

## 2. Реальная точка старта

Ниже — результаты локальной инвентаризации, не проверка состояния npm registry.

| Область | Что существует | Решение для `0.2` |
| --- | --- | --- |
| Package | [package.json](/Users/nelmad/Developer/calendar/package.json) содержит `0.1.0`, ESM/CJS, CSS exports, Vite/Vitest/Storybook | Сохранить инструменты там, где подходят; перестроить dependency/export contract |
| Public API | [src/types.ts](/Users/nelmad/Developer/calendar/src/types.ts): `CalendarEvent`, `events`, fixed-offset props, domain flags, series callbacks | Заменить моделью и unions из §5.7, без совместимости |
| Root exports | [src/index.ts](/Users/nelmad/Developer/calendar/src/index.ts): legacy helpers, palettes, labels, standalone Skeleton | Удалить старую публичную поверхность; Skeleton может остаться private |
| Date/core | [dayjs.ts](/Users/nelmad/Developer/calendar/src/core/dayjs.ts), [dateUtils.ts](/Users/nelmad/Developer/calendar/src/core/dateUtils.ts), [buildWeekLayout.ts](/Users/nelmad/Developer/calendar/src/core/buildWeekLayout.ts) | Заменить date math/validation; идею clipping и свободных lanes использовать после перепроверки |
| Calendar UI | [Calendar.tsx](/Users/nelmad/Developer/calendar/src/calendar/Calendar/Calendar.tsx), [MonthGrid.tsx](/Users/nelmad/Developer/calendar/src/components/MonthGrid/MonthGrid.tsx) | Разделить orchestration и presentations; перестроить grid semantics, не только добавить attributes |
| React Aria | [ActionMenu.tsx](/Users/nelmad/Developer/calendar/src/ui-kit/ActionMenu/ActionMenu.tsx) уже использует RAC; часть кнопок/items использует interactions hooks | Переиспользовать опыт и visual assets; построить общие focus/overlay primitives |
| Styling | Legacy palette, flat theme и глобальные `--tc-*`; root зависит от высоты | Перейти к scoped 27-variable contract, intrinsic/constrained sizing и portal mirror |
| Distribution checks | [verify-dist.mjs](/Users/nelmad/Developer/calendar/scripts/verify-dist.mjs) требует старый Skeleton/variant CSS; [bundle-css.mjs](/Users/nelmad/Developer/calendar/scripts/bundle-css.mjs) копирует `tokens.css` | Переписать проверки и CSS packaging под целевые exports |
| CI | [.github/workflows/ci.yml](/Users/nelmad/Developer/calendar/.github/workflows/ci.yml): один Node 22 job, typecheck/lint/test/build/Storybook | Добавить contract, browser, SSR и consumer проверки и release workflow (tag → один tarball → gates → npm provenance) |
| Documentation | [README.md](/Users/nelmad/Developer/calendar/README.md), stories, Pages workflow описывают `0.1` | Переписать examples и EN/RU reference; отдельный docs-сайт не нужен |

### 2.1. Диагностический baseline на дату плана

- `npm run typecheck` завершился с ошибкой: не разрешаются `dayjs` и `dayjs/plugin/utc.js` из существующего `src/core/dayjs.ts`.
- `npm test -- --reporter=dot`: 5 test files прошли, 8 suites не загрузились из-за того же импорта; 8 реально выполненных tests прошли. Это не означает, что остальные assertions проверены.
- Day.js объявлен в package/lockfile; локальная установка не соответствует тому, что нужно текущему исходному коду. Причина состояния установки глубже не исследовалась.
- Build, Storybook, lint и clean install при подготовке плана не запускались; их успех не предполагается.
- Канонический TypeScript-контракт спецификации проверен отдельно в `bundler`/`NodeNext`; 27 CSS variables согласованы с типом, структура Markdown корректна. Это не тесты реализации `0.2`.

В T01 фиксируем этот baseline и отделяем проблему окружения от дефектов кода. Для исторического сравнения допустим отдельный воспроизводимый install старого checkout; это не повод возвращать Day.js в целевой `0.2` или поддерживать старый runtime.

## 3. Структура поставки

| Этап | Задачи | Пользовательский результат | Условие выхода |
| --- | --- | --- | --- |
| M0 — подготовка | T01–T03 | Воспроизводимая точка старта, проверенные технические риски, market/pilot план | Известны ограничения; у каждого риска есть решение или явный blocker |
| M1 — foundation | T04–T09 | Типы, date/core, локализация и UI foundation | Чистый core и contract fixtures; инфраструктура не требует legacy API |
| M2 — `alpha.1` | T10–T14 | Desktop Month + доступный полный DayAgenda, navigation/loading, classic | Packed clean-consumer/SSR/keyboard smoke и документация реально реализованного slice |
| M3 — `alpha.2` | T15–T19 | Responsive/mobile, overlays, actions/sources, neutral/customization | Согласованы данные, focus, темы и overflow во всех добавленных presentations |
| M4 — `beta.1` | T20–T26 | Selection/create и полный move для всех способов ввода | Полный API, interaction matrix, performance thresholds заморожены до публикации beta |
| M5 — RC | T27–T31 | Compatibility/AT проверки и отчёты, полная документация и внешние пилоты | Точный RC candidate, support/accepted-set freeze и удовлетворённые gates |
| M6 — stable | T32 | Проверенный `0.2.0` tarball | Все критерии §19, release workflow публикует те же байты с npm provenance, integrity в registry совпадает |
| M7 — сопровождение | T33 | Предсказуемые `0.2.x` patches | Сохраняются stable API, accepted zones и Node ranges |

### 3.1. Порядок зависимостей

```text
T01 baseline → T02 spikes → T04 types → T05 dates/validation → T06 zones → T07 projection/layout
T04 + T05 + T06 → T08 locale/messages
T02 + T04 + T08(base) → T09 UI foundation

T07 + T08 + T09 → T10 controller → T11 Month → T12 DayAgenda → T13 packed consumer → T14 alpha.1
T14 → T15 responsive → T16 overlays/modal → T17 actions/sources → T18 themes/slots → T19 alpha.2
T10 + T11 + T16 → T20 selection/create
T05 + T07 + T17 → T21 move proposal → T22 request lifecycle → T23 inputs → T24 integration
T19 + T20 + T24 → T25 full performance freeze → T26 beta.1
T26 → T27 compatibility + T28 AT + T29 docs → T30 pilot completion → T31 RC gate → T32 stable
T32 → T33 patch policy

T03 market briefs/pilot recruitment runs alongside the technical path and gates relevant releases.
```

Диаграмма показывает основные зависимости; точные prerequisites указаны в карточках. T20 можно делать параллельно с частью alpha.2, но не публиковать неполные interactions. T29 начинается с ранних examples, T30 — с раннего поиска участников, T27/T28 — с ранних harnesses: финальные проверки и отчёты этих задач появляются после feature-complete candidate.

### 3.2. Организация изменений

- Работа идёт небольшими проверяемыми PR/изменениями по T-ID. Каждый содержит код, тесты, story/example и обновление contract fixtures, ledger и команд проверки, если применимо. Raw artifacts прогонов (screenshots, probe JSON, logs, tarballs, manifests) в репозиторий не добавляются: доказательство — re-runnable checks, CI на PR и release workflow ([изменение процесса 2026-10-22](#process-2026-10-22)).
- При одном разработчике выполняем dependency order. При параллельной работе выделяем core/API, UI/interaction и QA/distribution; один владелец согласует public types, controller и package barrel.
- Целевой полный §5.7 можно сразу хранить как reference/type fixtures. Публикуемые prerelease declarations раскрывают только работающий slice; будущие props не принимаются с молчаливым no-op. К beta публичная поверхность должна совпасть с полной спецификацией.
- T04–T12 сначала создают private новые modules/reference fixtures, недоступные из действующего public entry; промежуточный `0.2` до cutover не публикуется. Переключение entry выполняется согласованно в T13 вместе с Calendar/types, package map, stories и tests. Так подготовка типов не требует оставить весь существующий UI некомпилируемым на несколько этапов. Временное сосуществование исходников в рабочей ветке — техника разработки, не shipped dual API: до первого публикуемого `0.2` tarball старый renderer/date graph и legacy exports удалены, runtime adapter не создаётся.
- Отличия prerelease от stable описываются явно. В частности, alpha.1 desktop-сценарий не выдаётся за готовый responsive `auto`; stable defaults этим планом не меняются.
- Неполный внутренний шаг не требует npm-публикации. Дополнительные alpha/RC допустимы при честном описании scope; beta не публикуется без всех input paths.
- Каждая задача имеет статус `planned → in progress → verification → done` либо `blocked` с конкретной причиной. Сейчас T01–T33 — `planned`; подготовка плана не закрывает задачи реализации.
- Сроки и размер команды не зафиксированы. После T02 и первого вертикального slice уточняем оценки; ниже задан порядок и объём, а не обещанный календарный срок.

## 4. Предлагаемые внутренние границы

Это направления организации будущего кода, не новые public exports и не уже созданные каталоги:

```text
core/date adapter + validators + immutable timezone data
    ↓
valid records → source filter → date membership → global sort → week segments/lanes/counts
    ↓
Calendar controller: accepted props + transient reducers + effect descriptors
    ↓
MonthGrid / one DayAgenda body / toolbar / state regions
    ↓
private React Aria wrappers + focus/overlay/live services + themes
```

Core не импортирует React/DOM и не читает clock/crypto при import или вычислении range. React shell исполняет user notifications в обработчиках либо post-commit, как требует конкретный контракт; не все callbacks искусственно переносятся в effect. Focus, portal measurement и DOM announcements исполняются на client после необходимого commit. Generation UUID остаётся submit-time operation, не reducer/render side effect.

Date projection, count, sort и policy не дублируются между Month и DayAgenda. Desktop/mobile используют один agenda data/body contract и presentation adapters. Полностью headless API, отдельный core package и публичный UI kit не добавляются.

## 5. M0 — подготовка

### T01 — baseline и карта требований

Зависит: нет. Основание: §§3, 17, 19.

- Зафиксировать checkout/lock/tool versions и результаты существующих typecheck/test/lint/build/Storybook checks; текущие missing-Day.js failures учитывать отдельно.
- Завести requirement ledger: `requirementId`, ссылка/фрагмент спецификации, T-ID, milestone, automated/manual evidence, status.
- Перенести R01–R74 из раздела 13 плана в ledger, добавить type-level, scope и quality requirements вне этой таблицы.
- Отметить tests `0.1`, чьи сценарии переиспользуются, а assertions подлежат замене; не сохранять inclusive/fixed-offset semantics ради зелёных тестов.

Готово: исходное состояние воспроизводимо, все требования имеют владельца; ничего не объявлено реализованным только на основании существующего компонента.

### T02 — короткие технические spikes

Зависит: T01. Основание: §§4, 11–15.

- Проверить `@internationalized/date`/Intl на strict parsing, instant bounds, исторических offsets, Apia, gap/fold и server/client serialization. Версии выбрать по фактической проверке и зафиксировать lockfile, не угадывать сейчас.
- Проверить React Aria composition для собственного date grid, anchorless agenda, logical Tab exit, modal nesting, ShadowRoot и source-aware focus.
- Проверить touch pointer capture при закрытии modal sheet; заранее установить реалистичный gesture/scroll policy на supported devices, сохранив no-drag alternative.
- Собрать минимальный packed feasibility fixture с React Aria/date runtime; оценить достижимость полного bundle budget, не называть этот размер финальным baseline.

Готово: для каждого вопроса есть маленький воспроизводимый experiment, наблюдение и решение. Если контракт технически не выполняется, заводится blocker/decision request; date semantics, accessibility или thresholds не ослабляются молча.

Решение 8 сентября 2026: пользователь разрешил продолжать реализацию, проверив touch позже. B02-TOUCH остаётся открытым в T02/T23; его перенос не блокирует следующие этапы и не считается успешной проверкой gesture policy. До завершения touch input в T23 и RC необходимы реальные устройства и предусмотренный evidence.

### T03 — market briefs и подготовка двух пилотов

Зависит: T01; идёт параллельно. Основание: §§2.1, 19.3.

- Для sources, selection/create, move и расширенного customization подготовить датированные comparison briefs с актуальными альтернативами, источниками, license/API/a11y/mobile/SSR ограничениями и конкретным преимуществом.
- Завершать brief до первого prerelease соответствующего epic; это относится и к customization, если он включён уже в alpha.1.
- Согласовать два независимых внешних RC-сценария: Next.js и Vite, минимум один реальный/запланированный CIS-продукт; определить материалы, данные и способ записи результатов. Для timed onboarding зарезервировать двух React/TypeScript-разработчиков, ранее не работавших с API `0.2`, и сохранить их первое практическое знакомство до старта T30.
- Ранний alpha/beta feedback проводить с отдельными участниками. В плане участия фиксировать роль, сценарий и предыдущий опыт с API `0.2`: участник ранней интеграции может продолжать давать feedback и проверять исправления, но его последующий RC-onboarding не засчитывается как первое знакомство. Перед T30 повторно проверить соответствие зарезервированных участников требованиям и при необходимости подобрать новых с сохранением Next/Vite и CIS-требований.
- Поиск участников/контакт с ними — отдельная явно запущенная работа, не выполненное действие этого плана.

Готово: briefs и сценарии существуют, ранний feedback и timed RC-пилоты имеют раздельный состав участников с проверенными условиями допуска; итоговый `go` пока не подменяется намерением участника. Два положительных результата подтверждаются в T30. `defer` меняет scope только явной правкой спецификации.

## 6. M1 — контракт и фундамент

### T04 — новый public TypeScript contract

Зависит: T01, результаты T02 для dependency boundaries. Основание: §§4, 5.7, 17.

- Подготовить ISO/RFC3339/IANA aliases, discriminated intervals, независимые item/source generics, controlled unions, requests, slots, messages и opaque themes.
- Развести полный нормативный reference и фактически готовую prerelease surface; исключить старые `events`, date types, series/domain flags и helper exports.
- Добавить positive/negative fixtures для half-controlled pairs, create без selection, readonly arrays, narrowing root/error/data-only class contexts и inference callback payloads.

Готово: contract fixtures проходят `bundler` и `NodeNext`; public declarations не протекают внутренними date types. Матрица min/latest TypeScript запускается в release harness, не заменяется локальным compiler.

### T05 — date adapter и двухуровневая validation

Зависит: T02, T04. Основание: §§4.1–4.3, 5.3.1.

- Заменить Day.js/fixed-offset helpers private adapter над выбранным date runtime и явным Intl.
- Реализовать строгую грамматику, Gregorian/date/instant bounds, optional-end/moment distinctions, exclusive ranges и canonical interval equality.
- Разделить fatal configuration errors и исключение отдельных invalid/duplicate records; diagnostics не должны менять production acceptance.
- Исключить host clock/locale/timezone defaults и молчаливое исправление входа.

Готово: boundary/grammar таблицы проходят без React/DOM; config errors и record isolation имеют точные error/diagnostic oracles. Day.js assertions не переносятся механически.

### T06 — immutable timezone accepted-set

Зависит: T02, T05. Основание: §4.3.1, §§11.3, 14.

- Построить reproducible generator из pinned tzdb и редакции алгоритма primary identifiers; сохранить inputs, exclusions и hashes.
- Проверять membership по package data, не по host enumeration; обеспечить обязательный минимум зон и одинаковую acceptance ESM/CJS/server/browser.
- На alpha иметь явный candidate list; до RC проверить весь список на exact runtime tuples и заморозить baseline для `0.2.x`.

Готово: повторная генерация даёт тот же список/hash; aliases и host-only identifiers отклоняются; полный RC freeze выполняется вместе с T27.

### T07 — projection, indexing, global order и week layout

Зависит: T05, T06. Основание: §§4.1, 5.6, 6.

- Построить один pipeline valid records → filter → date membership → global order → segments/lanes/agenda index/counts.
- Реализовать timed membership по проекции instants, включая skipped dates/несмежные части, exclusive midnight, moments и clipping domain boundaries.
- Переиспользовать идею lane occupancy из старого layout, но переписать входы, sort/tie-break и `segmentRange`; не экспортировать старый helper.
- Ввести default/custom comparator contract и единую последовательность для grid/agenda.

Готово: одинаковые inputs дают одинаковый порядок/segments; counts и agenda membership согласованы, consumer records не мутируются. Core не знает о реальном размере DOM row.

### T08 — locale, formatting и полный messages catalog

Зависит: T04–T06. Основание: §§5.7, 11.2, 12.4.

- Заменить legacy labels на типизированные RU/EN catalogs, partial overrides, `messagesLocale`, fallback и per-fragment `lang`/bidi handling.
- Настроить Gregorian formatting, week start, h12/h23, RTL и deterministic unsupported-locale behavior.
- Отделить raw title snapshots от локализованных fallback messages; подготовить все semantic message inputs без side effects resolvers.

Готово: catalog completeness/type tests, malformed/unsupported locale и midnight fixtures проходят; новые interaction messages подключаются к UI по мере T20–T24, а не обозначают уже реализованные modes.

### T09 — private UI foundation и classic theme

Зависит: T02, T04, базовый T08. Основание: §§10, 12, 13.

- Сформировать private wrappers для Button/IconButton/Menu/Popover/Dialog/Checkbox и нейтральных layout/text/skeleton primitives.
- Сохранить удачные visual assets/характер classic; не переносить item Tab-stops, event-gridcells и вложенные hover action buttons.
- Ввести scoped theme/reset, density и базовые semantic tokens; удалить зависимость SDK от CDN/font assets.

Готово: primitives имеют keyboard/disabled/focus semantics и tests; classic работает без глобального `:root`. Это внутренняя foundation, не публичная дизайн-система.

## 7. M2 — первый работающий desktop slice

### T10 — Calendar controller, navigation, data states и SSR

Зависит: T07–T09. Основание: §§4.3.2, 5.1–5.2.1, 9, 11.3, 12.

- Разделить accepted props и transient state; создать pure transition kernels и исполняемые shell-эффекты.
- Реализовать `getCalendarVisibleRange`, initial/changed committed notifications, navigation/Today intents и их source-aware cancellation.
- Реализовать ready/empty/initial/refresh loading/error, safe contract shell, root naming и стабильные scoped live channels.
- Обеспечить SSR snapshot `today`/без него, post-hydration rollover/resync и cleanup observers/listeners без clock reads в render.

Готово: request/accept/stale/external/blocking сценарии детерминированы; callbacks не вызываются в render/SSR и не дублируются StrictMode; focus не крадётся извне.

### T11 — semantic Month View, sizing и overflow baseline

Зависит: T07, T09, T10. Основание: §§6, 8, 12.1.

- Перестроить Month DOM: header/week rows, одна cell на дату, один roving Tab-stop; visual items не становятся дополнительными widgets.
- Подключить keyboard navigation, соседние месяцы, named descriptions/counts, segment hit-testing и `onItemPress` payload.
- Реализовать intrinsic и constrained root sizing, row measurement, whole lanes и атомарный `+N`; минимально корректный доступ к полному списку нужен уже alpha.1.
- Проверять геометрию реальным browser harness; jsdom не подтверждает ResizeObserver/layout/paint correctness.

Готово: 4/5/6 weeks, ноль/одна/несколько lanes, resize и deterministic layout; `+N` не имеет role/Tab-stop и открывает полный agenda через date-cell equivalent. Расширенная responsive/visual matrix продолжается в alpha.2.

### T12 — базовый DayAgenda и desktop focus cycle

Зависит: T08–T11. Основание: §§5.2.1, 12.1–12.3.

- Создать один presentation-neutral agenda body: heading/count, semantic list, item summary, readable row либо primary button.
- Реализовать controlled/uncontrolled date, no-op same-date open, delayed/stale acceptance и отмену user open/focus intent.
- Добавить desktop non-modal popover, root anchor для agenda вне grid, logical Tab exit, outside press и recovery по logical item/date keys.
- Начать с обычного списка; virtualization допустима только отдельной доказанной оптимизацией, не ценой 1000-item reachability.

Готово: любой item доступен keyboard/AT, multi-day появляется в дате один раз; исчезнувший trigger и отменённый intent не оставляют dangling focus/ARIA links.

### T13 — breaking package cut и clean consumer harness

Зависит: T04–T12; конфигурационный каркас начинается с T04. Основание: §§13, 17, 19.2.

- Пересобрать root exports и package map; оставить один public stylesheet, убрать legacy `tokens.css`, helpers/palette/labels/Skeleton exports.
- Выполнить согласованный entry cutover с подготовленных private modules: Calendar, публикуемые types, stories и tests переключаются вместе; T04–T12 не требуют раннего разрыва действующего public entry.
- Перевести implementation libraries в ordinary dependencies; peers — только React/ReactDOM. Добавить date runtime напрямую, не полагаться на transitive hoisting.
- Удалить Day.js из целевого исходного/dependency/declaration graph; заменить или удалить завязанные на старый runtime файлы/tests/stories. Не оставлять вторую скрытую реализацию Calendar.
- Переписать CSS bundling и dist verification: текущие проверки старых variant classes/Skeleton непригодны. Проверять оба JS formats/types, assets, отсутствие запрещённых imports/exports и network side effects.
- Создать изолированные packed Vite и Next.js App Router consumers: только public root/CSS imports, React client boundary, pure helper для server prefetch, SSR/hydration и production build.

Готово: candidate устанавливается без Day.js/ручной установки date/RAC peers; package import безопасен на server. Измерение полного bundle позднее не исключает implementation libraries как externals.

### T14 — alpha.1 acceptance и документация первого slice

Зависит: T10–T13 и применимые briefs T03. Основание: §§2.1, 18–19.

- Написать runnable quick start, desktop viewer/navigation/loading/agenda stories, минимальный migration guide и known limitations prerelease.
- Провести desktop keyboard/axe/browser/SSR smoke на packed candidate; привязать результаты к version/integrity.
- Сверить заявленные props с работающими: не рекламировать ещё отсутствующие modes или mobile semantics.

Готово: разработчик способен показать records и открыть item через public API; разрешённый к публикации alpha.1 candidate и evidence подготовлены. Сам npm publish — отдельный release action.

## 8. M3 — responsive и интеграционные возможности

### T15 — responsive resolver и единый agenda presentation lifecycle

Зависит: T14. Основание: §§5.2.1, 7, 11.3.

- Добавить container-based `auto`, exact breakpoint, mobile indicators и inline agenda; forced layouts не зависят от observer для выбора presentation.
- Реализовать inline/popover/sheet и `auto/overlay` переходы как одну транзакцию со stable logical focus keys.
- Совместить pending agenda acceptance с пассивным switch: одна новая presentation, no unsolicited modal opening, сохранение accepted agenda date. Сохранение selection при тех же switches проверяется в T24 после появления selection API.

Готово: 639/640px, SSR-first-mobile, passive switch и delayed acceptance не дублируют controls/callbacks и не забирают внешний focus.

### T16 — полный overlay stack, portal scope и live routing

Зависит: T12, T15, T09. Основание: §§10.3.4, 12.2–12.4.

- Построить ownership tree для вложенных overlays, top-down dismissal, logical Tab exit и reference-counted modal effects.
- Реализовать ownerDocument/container validation, replacement/removal cleanup и Document/ShadowRoot support с явным CSS import в каждом tree scope.
- Добавить portal mirror публичных variables/font properties на нормативных checkpoints, до reveal/focus.
- Маршрутизировать события ровно в один разрешённый root/modal endpoint; изолировать несколько Calendar.

Готово: nested Escape, container changes, responsive cleanup и 2×2 tree-scope fixtures не оставляют orphan portal, `inert`, scroll lock, IDREF или duplicate announcements.

### T17 — generic actions и controlled sources

Зависит: T07, T15, T16; release требует brief T03. Основание: §§5.5–5.6.

- Заменить встроенные legacy edit/delete/series/hover flows generic action model в DayAgenda; callbacks используют latest committed valid set.
- Добавить desktop menu/mobile action sheet, отдельные primary/action surfaces и исчезновение пустого trigger.
- Реализовать source validation, unknown-source fallback, normalized IDs/filter callback, accepted-only checked state и independent item/source generics.
- Синхронизировать grid/agenda/counts/actions после принятого filter; место встроенной move-команды подключается в T23.

Готово: delayed toggles не показывают optimistic acceptance; invalid/duplicate sources и action removal имеют определённые focus/data outcomes. Alpha.2-часть R27 проверена; взаимодействие принятого filter с move draft и pending request проверяется в T24 / beta.1. Добавление move позже расширяет эту же action model, не создаёт параллельное меню.

### T18 — neutral theme, полный styling/slots contract и RTL

Зависит: T09, T15–T17; release требует применимый brief T03. Основание: §§5.7, 10–12.

- Довести classic/neutral × compact/comfortable × system/light/dark; сохранить default classic и logical CSS geometry.
- Реализовать все 27 tokens, precedence scoped CSS → tokens → root style, source accent и partial appearance fallback по спецификации.
- Подключить typed content/class slots, стабильные `data-*`, passive item/day content и best-effort diagnostics недопустимых descendants.
- Покрыть sentinel token tests, portal mirror, forced-colors/reduced-motion, RTL и conforming custom-content fixtures.

Готово: темы меняют оформление, не interaction semantics; root/status допускают contract branch, data-only contexts — нет. Consumer customization не удаляет package-owned accessible shell.

### T19 — alpha.2 acceptance

Зависит: T15–T18, T03. Основание: §§2.1, 18–19.

- Обновить EN/RU slice docs/stories и packed consumers для mobile, actions, sources и themes.
- Проверить оба layouts, initial/refresh/error/empty, overlays, multiple Calendar и ShadowRoot в browser/SSR harness.
- Собрать интеграционный feedback по advanced epics с ранними участниками T03; хранить reports, не считать включённый prop доказательством спроса. Зарезервированные участники timed RC-onboarding в этих интеграциях не участвуют.

Готово: alpha.2 candidate имеет проверенный responsive интеграционный slice; не обещает selection/move до beta.

## 9. M4 — selection/create и полный move

### T20 — selection state machine и create request

Зависит: T10, T11, T16; release требует brief T03. Основание: §§5.2.2–5.2.3, 5.4, 8, 12.4.

- Реализовать single/range modes, Space/Enter/two-tap/desktop-empty-drag, reverse normalization и exclusive endpoint.
- Применять `canSelectDate` ко всем включённым датам, затем range policy; core boundary block не переопределяется policy.
- Развести accepted selection, draft и pending announcement; no-op, clear, external changes, pair removal и cross-month transitions проверять отдельно.
- Добавить Create только по принятой selection, без встроенной формы и без callback во время draft.

Готово: все способы ввода дают одинаковый range; запрет просмотра не возникает из selection policy; completion speech появляется только после controlled acceptance.

### T21 — pure move proposal, equality и latest-item semantics

Зависит: T05, T07, T08, T17. Основание: §§5.3.1, 5.4.

- Реализовать различие Month grab-offset и agenda/command new-start origin; all-day day-count и timed elapsed-duration preservation.
- Добавить gap reject, fold earlier с offset preview, author-zone serialization, historical-second `Z` fallback и domain limits.
- Реализовать canonical interval equality, invalidation priority, latest metadata/policy/proposal и точные latest input strings для no-op.
- Не deep-compare/clone произвольное `data`; хранить только необходимые interval/identity/title snapshots.

Готово: deterministic table tests покрывают DST/Apia/moments/author zone, metadata refresh и реальное изменение interval. Pure core не создаёт UUID/callbacks/DOM effects.

### T22 — request registry и draft retention lifecycle

Зависит: T10, T21. Основание: §§5.3, 5.3.2, 12.4.

- Реализовать per-mount issuer registry, UUID submit-time generation, регистрацию до request callback и парный cleanup исходной draft callback identity.
- Соблюсти порядок request → cleanup и `finally` при reentrant updates/unmount; consumer retention переводится атомарно.
- Реализовать pending/direct-terminal/late-ack/DFA validation, локальную issuer-блокировку до корректного terminal, включая отсутствие acknowledgement и premature pending removal; terminal/tombstones хранить до unmount, невалидные наблюдаемые переходы диагностировать.
- Развести внешние shared states и issuer announcements; проверить несколько roots/instances, одинаковые domain IDs и consumer arbitration colliding requests.

Готово: нет автоматического server rejection/rollback, повторных results или потерянного retention. Metadata/timezone/UI cancellation после выпуска request не отменяет внешнюю операцию.

### T23 — все input adapters и move command UX

Зависит: T11, T16, T17, T21, T22. Основание: §§5.3, 7–8, 12.

- Подключить keyboard command, click/tap target + confirm/cancel, desktop drag и touch long-press к одному move controller.
- Реализовать grid hit-testing/grab offset, gesture threshold/scroll cancellation, lost capture и отказ от click после drag.
- Для command origin вне grid закрыть overlay, сфокусировать current roving cell до `onNavigate`, затем применить source-aware delayed target focus.
- Для modal long-press передать pointer стабильному session owner до удаления sheet, снять modal effects и только затем использовать grid.

Готово: одинаковый origin/target даёт одинаковый proposal между допустимыми путями; no-drag alternative полноценна; ни один input path не выпускается как единственный.

### T24 — общий mode arbiter, focus и live regression

Зависит: T15–T23. Основание: §§5, 8–9, 11.3, 12.4, 19.4.

- Интегрировать viewer/selection/move, cancellation priority, optional-pair changes, blocking/contract state и accepted navigation.
- Повторить responsive/presentation switch matrix с включённой selection: accepted range сохраняется, а draft/intents следуют своим cancellation rules; alpha.2 проверки одного agendaDate этого не заменяют.
- Завершить составные R02/R15/R35 из раздела 13: move сохраняет отсутствие `end`, delayed navigation работает с range через границу месяца в LTR/RTL, а `isSelected` вычисляется для каждого segment. Ранние alpha-проверки этих строк остаются частичным результатом (subchecks ledger), не заменяя полный beta-сценарий.
- Завершить R27: проверить принятие source filter во время move draft и отдельно после выпуска pending request. Скрытый draft отменяется с единственным парным `onItemMoveDraftChange(null)`, уже выпущенный внешний request сохраняется; alpha.2-проверка самого фильтра не закрывает эти lifecycle-сценарии.
- Зафиксировать draft-start и submit-time title snapshots, latest metadata request и сохранение request history при UI cleanup.
- Реализовать единый semantic event composer: start → target-or-pending → instruction, без duplicated hosts и StrictMode events.
- Прогнать cross-feature matrix: filter/policy/item refresh во время drag, delayed controlled state, nested overlays, RTL, два Calendar и external focus.

Готово: полные interaction rows R11–R50 и lifecycle rows R70–R72 покрыты re-runnable automated checks; каждый finish/cancel/blocking путь проверяет callbacks, focus, state и speech, не только визуальный preview.

### T25 — полный performance baseline и freeze до beta

Зависит: T19, T20, T24; harness начинается в T02/T13. Основание: §15.

- Измерить полный Calendar из packed feature-complete candidate: обе темы, DayAgenda, actions и все move paths остаются runtime-доступны.
- Зафиксировать baseline/calendar delta, React/ReactDOM externals, все остальные reachable/lazy chunks, gzip level 9 и toolchain. Gates: JS ≤80 KiB gzip, CSS ≤10 KiB gzip; 50 KiB Month остаётся research target.
- Зафиксировать в репозитории benchmark manifest §15.2 (runner/OS/browser/cache/fixture как конфигурация, не результат); выполнить distributed/dense/multiday по 1000 items, 5 warm-ups и 30 samples с semantic oracle, traces и p95 правилом §15. Samples, traces и отчёт серии хранятся как CI artifacts прогона, не в репозитории.
- Проверить cold render <200 ms, warm navigation/agenda <100 ms, preview <32 ms, mobile agenda/preview/scroll и auto-hydration CLS. Заморозить числовой CLS budget.
- До публикации beta датированным решением принять кандидатные thresholds либо один раз пересмотреть их с результатами серии и impact. Для этого допустим внутренний candidate или честно описанный дополнительный feature-complete alpha; ждать опубликованной beta не требуется.

Готово: полный benchmark воспроизводим, thresholds/CLS заполнены до beta. Быстрый неверный frame, skip, потерянный sample и автоматическое ослабление порога не проходят gate.

### T26 — beta.1 acceptance

Зависит: T20–T25, применимые T03 briefs. Основание: §§2.1, 5.7, 15, 19.

- Сверить полную public surface с нормативным §5.7: больше нет typed-but-unimplemented возможностей стабильного scope.
- Выполнить all-input interaction, packed consumer, SSR/StrictMode, type, dependency и performance gates; обновить stories/docs примерами полного API.
- Передать beta ранним участникам T03 для внешней интеграционной проверки; протоколы фиксируют named tarball, не абстрактную «последнюю сборку». Это feedback до RC; для timed первого знакомства в T30 сохраняется отдельный состав участников.

Готово: feature-complete candidate соответствует scope; последующая работа — стабилизация и проверки, а не скрытое добавление недостающего input mode.

## 10. M5 — RC и внешнее подтверждение

### T27 — финальная support matrix и timezone freeze

Зависит: T26, T06, T13. Основание: §§11.3, 14.

- Проверить React/ReactDOM exact согласованные 18.2.0, 19.0.0 и latest endpoints major 18/19, TypeScript 5.4/latest, оба resolution modes и ESM/CJS.
- По фактической совместимости зафиксировать minimum patches Node 22/24/26 до RC; проверять minimum/latest каждого major, не только maintainer Node 24.
- Выполнить browser/iOS/Android rolling matrix и real-device минимум/последнюю OS по §14. Exact ICU/tzdata tuples automated matrix попадают в release manifest (отчёт release workflow); ручные device/AT tuples — в краткий датированный device-отчёт в docs.
- Заморозить полный accepted-set, проверить каждый identifier во всех tuples; документировать polyfill alignment, если он необходим для supported SSR pairing.

Готово: support table, engines, tested tuples и hashes согласованы. Unsupported/missing tuple не становится pass; frozen Node ranges сохраняются во всей stable `0.2.x`.

### T28 — accessibility, visual и manual AT audit

Зависит: T24, T26, среда T27. Основание: §12.5.

- Завершить axe/semantic/browser matrix по states, layouts, themes, densities, LTR/RTL, overlays, selection/move и custom conforming fixtures.
- Проверить contrast/focus/target geometry, 320px/400% reflow, text spacing, forced-colors, reduced motion и single-pointer no-drag paths.
- Выполнить manual NVDA Chrome/Firefox, VoiceOver macOS/iOS Safari и TalkBack Android Chrome с точными focus/spoken-state oracles.
- Проверить 1000-item agenda reachability, modal routing, coalesced mode start и отсутствие focus в inert/disconnected nodes.

Готово: criterion ledger содержит pass/N-A/consumer-owned с обоснованием; manual AT оформлен кратким датированным отчётом в docs (versions, focus transitions, spoken states, integrity проверенного tarball), без выгрузок записей; опубликованный statement не обещает доступность произвольного consumer UI. Package-owned A/AA failure блокирует stable.

### T29 — полная документация и migration examples

Зависит: T26; examples наращиваются с T14/T19. Основание: §§17–18.

- Переписать EN/RU README/API, Storybook, Vite и Next examples на public API/CSS одного candidate.
- Покрыть sizing, visible-range retention, controlled agenda/selection, actions/sources, optimistic/rejected move, sharing IDs, DST, themes/slots, RTL, SSR/ShadowRoot и errors.
- Сделать consumer-side migration guide с явной сменой inclusive/exclusive semantics и удалённых exports; не добавлять runtime legacy adapter.
- Удалить устаревшие peer/font-install инструкции и обещания series behavior; docs parity проверять на runnable examples.

Готово: все обязательные примеры §18 существуют, собираются из packed package и не требуют private imports/type workarounds.

### T30 — два независимых pilot reports и go/defer

Зависит: T03, T26–T29; подготовка участников начинается раньше. Основание: §§2.1, 19.3.

- На входе после technical/docs readiness T27–T29 подготовить именованный `0.2.0-rc.N` tarball через packed harness T13. Создание candidate предшествует пилотам; их успешный результат нужен для закрытия RC gate T31, не для появления самого тестируемого artifact.
- До старта каждого timed pilot подтвердить, что участник ранее не работал с API `0.2`, включая alpha/beta-интеграции. Записать это в профиль отчёта; при предыдущем опыте привлечь нового участника, сохранив две независимые Next/Vite-интеграции и CIS-сценарий.
- Дать участникам clean pinned Next/Vite starter, опубликованные материалы и названный RC tarball; не предоставлять скрытую консультацию по API.
- Измерить basic onboarding ≤30 минут и расширенный ≤2 часов от одного старта; помощь и environment exceptions учитывать по спецификации.
- Отдельно проверить все оставшиеся advanced epics в обоих пилотах: реальные tasks, public API, сохранение данных, отказ backend/failure fixture, keyboard/touch и cross-month move.
- Зафиксировать минимум один CIS/ru-RU сценарий, defect/workaround evidence, timestamps и два положительных `go` на каждый включённый epic. Каждый pilot report — краткий датированный отчёт в docs с integrity названного RC tarball; raw recordings и логи участников в репозиторий не добавляются.

Повторная проверка исправлений и untimed epic tasks допустима с прежним участником и сохраняется отдельно от исходного onboarding-замера. Если после неуспешной попытки или изменения затронутого сценария нужно заново подтвердить timed gate, новый замер первого знакомства проводится с новым участником без опыта API `0.2`; прежние результаты и причины повтора сохраняются. Продолжение той же попытки после допустимой паузы из-за подтверждённой проблемы окружения следует §19.3 и не считается новым замером. Повторный pilot, заменяющий обязательный отчёт, проходит также остальные требования T30, включая advanced epics; результаты двух участников не склеиваются в один отчёт.

Готово: два reports от допущенных к первому timed onboarding участников подтверждают реальную интеграцию и спрос; у каждого пройдены оба timed checkpoints первого onboarding и отдельно отмечены последующие проверки. `iterate`/`defer` ведёт к исправлению/повтору по правилам выше либо явному scope decision, а не к формальному закрытию gate.

### T31 — RC stabilization gate

Зависит: T27–T30. Основание: §§2.1, 19.

- Проверить результаты одного или нескольких `0.2.0-rc.N`, подготовленных на входе T30. Этот gate закрывается после pilot results; при дефектах выпускается новый проверенный candidate и повторяются затронутые сценарии T27–T30. Для T30 различать повторную функциональную проверку и новый timed onboarding; требования к участникам и сохранению исходных pilot reports остаются обязательными.
- Закрыть blockers, сопоставить в ledger все requirements/R-IDs с re-runnable automated check (команда и test), который выполняет release workflow, либо с manual-only сценарием и датированным отчётом; проверить отсутствие skip/missing/unresolved flake.
- Зафиксировать known limitations и release notes (раздел CHANGELOG). Каждый `0.2.0-rc.N` выпускается release workflow по tag `v0.2.0-rc.N` (dist-tag `rc`, npm provenance, GitHub Release); tested RC integrity — integrity этого run.

Готово: RC прошёл spec gates; есть разрешённый переход к сборке final-version candidate, но проверки RC ещё не заменяют технические проверки точного `0.2.0` tarball.

## 11. M6–M7 — stable и patches

### T32 — exact final tarball и stable release

Зависит: T31. Основание: §§19.1–19.2.

- Подготовить commit с version `0.2.0` и датированным разделом CHANGELOG (`## [0.2.0] - YYYY-MM-DD`; раздел `Unreleased` workflow не публикует); push tag `v0.2.0` запускает [release workflow](../.github/workflows/release.yml). Он один раз выполняет `npm pack` и записывает в отчёт run git SHA, lockfile hash, tgz SHA-256/integrity и package contents.
- Workflow устанавливает именно этот tgz в clean Vite/Next, ESM/CJS, type/SSR/support fixtures и проводит на нём final unit/e2e/a11y/performance/network gates; manifest, logs и reports run хранятся как CI artifacts. Перед tag тот же gate можно выполнить вручную с `dry-run`.
- Сверить reviewed diff от pilot RC. Изменение поведения требует повторить затронутый pilot scenario; version-only diff не отменяет обязанность повторить technical checks на final tgz.
- При отдельно подтверждённом release workflow публикует тот же tgz без rebuild: `npm publish <tgz> --provenance` (trusted publishing через OIDC), затем GitHub Release с notes из CHANGELOG и приложенным tgz. После публикации проверить registry install/integrity, `npm audit signatures` и docs links; не подменять неудавшийся шаг предположением об успехе.

Готово: опубликованные байты совпадают с проверенными (integrity registry равна integrity run), provenance attestation связывает package с commit и workflow run, все automated gates §19 пройдены этим run, ручные отчёты §19 — в docs. Publishing credentials и внешняя публикация не требуются для завершения этого плана как документа.

### T33 — процесс `0.2.x` patches

Зависит: T32. Основание: §§4.3.1, 5.7, 14, 19.

- Сохранять stable exports/props/payloads/CSS/data contract, frozen accepted zones и Node minimum ranges.
- Каждый patch выпускается тем же release workflow по version tag. На каждом candidate проверять minimum/latest endpoints, regressions, integrity и соответствие release notes; новые browser versions не переписывают результаты уже опубликованных релизов.
- Не удалять поддерживаемый Node major из patch из-за EOL; сужение — только следующий minor/major с support table/migration note.
- Запросы `0.3` помещать в отдельный discovery backlog с новым market gate; не расширять `0.2.x` скрытым breaking change.

Готово: есть воспроизводимый patch checklist, issue triage по severity и понятный путь compatibility defect → regression → verified release.

## 12. Общая система проверки

### 12.1. Уровни тестов

| Уровень | Что доказывает | Чего не доказывает |
| --- | --- | --- |
| Pure unit/table tests | Parsing, canonical equality, projection, sort/layout, policy и state/effect transitions | Browser focus, фактическую геометрию и speech |
| Type/exports fixtures | Public generics/unions/narrowing, старые imports отвергаются, ESM/CJS declarations | Runtime validation входа JavaScript consumer |
| React/jsdom integration | Controlled props, callback order, rendering state, StrictMode replay | Layout/paint, capture и реальную работу AT |
| Real browser/e2e | Focus, DOM/ARIA, Tab order, resize/scroll/portal/capture, SSR hydration | Само по себе полную WCAG conformance |
| Axe + visual/geometry | Автоматически обнаружимые a11y ошибки, contrast/targets/reflow в выбранных fixtures | Корректность всех spoken-state сценариев |
| Manual AT/device | Реальные keyboard/touch/speech flows на exact tuples | Поведение непроверенного arbitrary consumer content |
| Packed consumer/performance | Installation/exports/SSR, полный reachable bundle и runtime latency | Backend latency и весь продукт потребителя |
| External pilot | Возможность интеграции через public API и подтверждённую ценность | Автоматическое отсутствие технических дефектов |

### 12.2. CI, release workflow и отчёты

Правило с 22 октября 2026 ([изменение процесса](#process-2026-10-22)): raw artifacts прогонов в репозитории не хранятся и доказательством не считаются.

- Каждый PR ([ci.yml](../.github/workflows/ci.yml), token только `contents: read`): `typecheck`, Storybook typecheck, lint, unit/integration, contract/export fixtures (TS default и 5.4.5), ledger, timezone, docs и API checks, Storybook build; job `packed-consumers` — один `npm pack`, проверка архива против checkout, packed consumers (`check:package --tarball=<tgz>`) и acceptance milestone версии (`alpha-acceptance.mjs --milestone=<prerelease id> --tarball=<tgz>`: SSR, hydration, keyboard, axe) на этом файле; job `browser-probes` — `browser-probes.mjs`: все Chrome probes checkout и story smoke, кроме `locale-probe.mjs` (открытая qualification T08 до T27, запускается своей командой). Отчёты jobs загружаются из `$RUNNER_TEMP` как CI artifacts.
- Каждый prerelease candidate: packed consumers, SSR/StrictMode, dependency/network checks, все доступные на этапе R-IDs; незавершённые будущие rows обозначаются planned, не pass.
- Каждый публикуемый prerelease и stable — [release workflow](../.github/workflows/release.yml) по tag `v*`: один `npm pack`, на этом tgz полный milestone gate (beta/RC/stable дополнительно — pinned performance runner и support matrix), проверка version = tag. Состав gate — `releaseGates` в [release-metadata.mjs](../scripts/release/release-metadata.mjs); каждый шаг выполняется через [gate.mjs](../scripts/release/gate.mjs), который записывает команду, окружение и итог, а release manifest проходит, только если записан `pass` каждого gate и отчёты packed consumers и acceptance связаны с integrity этого архива. Packed consumers и acceptance milestone (alpha.2 — `alpha-acceptance.mjs --milestone=alpha.2`; для milestone без acceptance gate падает) устанавливают сам tgz; contract, docs, API и Storybook читают `dist` checkout, который gates `archive-matches-checkout` и `archive-unchanged` до и после них требуют побайтно равным архиву; Chrome probes собирают private entries из исходников того же checkout; `npm publish <tgz> --provenance` с dist-tag из prerelease id (`alpha`/`beta`/`rc`, `latest` для stable) и GitHub Release с notes из CHANGELOG. Pull requests никогда не публикуют. Final stable использует exact `0.2.0` tgz.
- Новые harness commands и расположение fixtures вводятся задачами T01/T13/T25/T27; документ не утверждает, что такие scripts уже существуют.
- Результат записи в ledger: `requirementId`, T-ID, command/test или manual script, expected/observed, pass/fail, ссылка на отчёт задачи в docs. Exact candidate/tool tuple automated прогона — в отчёте run (CI artifacts), ручных — в датированном отчёте. Автоматизированные и ручные части одного сценария фиксируются раздельно. Без `--output` scripts пишут во временный каталог (`os.tmpdir()`).
- Нельзя исправить красный CI удалением требования, фиктивным mock, потерей sample или сменой thresholds без разрешённого решения.

<a id="process-2026-10-22-fix-1"></a>Раунд 1 исправлений изменения процесса (независимая проверка PROCESS-V9, 22 октября 2026): прежний release workflow не запускал acceptance alpha.2 и Chrome probes, а `check:package` собирал и паковал второй раз. Исправление и проверки — в [журнале реализации](implementation/progress-0.2.md#process-v9-fix-1).

### 12.3. Done для одной задачи

1. Реализован заявленный scope; изменяемые API и assumptions согласованы со спецификацией.
2. Есть tests и story/example; для геометрии/focus — real-browser probe с документированной командой, а не только jsdom.
3. Позитивные, negative и cancellation пути проверены; отсутствие stale/duplicate callbacks не предполагается.
4. Нет legacy/date-type/dependency утечек, private-import workaround или consumer-data mutation.
5. Requirement ledger обновлён; полный cross-feature сценарий остаётся открытым, если его будущая часть ещё не реализована.
6. Применимые docs, migration notes и раздел CHANGELOG обновлены; внешний gate не закрыт без внешнего результата.
7. Отчёт задачи в docs кратко называет выполненные команды и их итог; исполнитель запускает их, проверяющий повторяет, CI выполняет на PR. Raw artifacts прогонов в репозиторий не добавляются.

## 13. Покрытие всех 74 regression-сценариев

R-ID — порядковая строка §19.4 **зафиксированного draft v6**, без header/separator; в draft v7, v8 и v9 строки §19.4 не менялись (в v8 они сдвинулись в файле на две строки, в v9 остались на месте; текст и fingerprints те же), поэтому нумерация та же. Это служебная нумерация плана, не изменение спецификации. T01 сохраняет исходный текст сценария и его fingerprint: после правки спецификации строки сопоставляются явно, а не молча перенумеровываются.

Колонка «полная проверка» означает первый gate, где должен быть проверен весь сценарий. Базовые части часто появляются раньше; владелец отвечает и за их последующую интеграционную проверку. Expected result берётся из §19.4, не сокращённого названия этой таблицы. Ledger T01 хранит для составных строк отдельные subchecks с T-ID, milestone и evidence; успешная ранняя часть не переводит весь R-ID в `pass` до проверки всех его обязательных частей.

| R-ID | Сценарий | Владелец | Полная проверка |
| --- | --- | --- | --- |
| R01 | All-day exclusive/empty interval | T05 | alpha.1 |
| R02 | Timed midnight, moment и отсутствие end после move | T21 | beta.1 |
| R03 | Single/multi-day chip/bar classification | T11 | alpha.1 |
| R04 | Apia skipped date, membership и move | T21 | beta.1 |
| R05 | Anchor/instant domain bounds | T05 | alpha.1 |
| R06 | Helper/SSR/StrictMode visible range | T10 | alpha.1 |
| R07 | Gregorian и unsupported locale | T08 | alpha.1 |
| R08 | Berlin spring gap | T21 | beta.1 |
| R09 | Berlin fold/earlier и no-op instant | T21 | beta.1 |
| R10 | DST elapsed duration и author zone | T21 | beta.1 |
| R11 | Agenda date независима от selection | T20 | beta.1 |
| R12 | Reverse range, Space/Escape/two-tap | T20 | beta.1 |
| R13 | Policy не проверяет exclusive end как день | T20 | beta.1 |
| R14 | Controlled selection completion/clear | T20 | beta.1 |
| R15 | Delayed PageDown, Tab-away и range через месяц в RTL | T24 | beta.1 |
| R16 | Previous/next и Today delayed focus | T10 | alpha.1 |
| R17 | Pending/rejected/optimistic/direct terminal | T22 | beta.1 |
| R18 | No-ack, late ack и unmount | T22 | beta.1 |
| R19 | Touch move без dragging | T23 | beta.1 |
| R20 | Agenda/grid различают grab origin | T21 | beta.1 |
| R21 | No-op move lifecycle | T21 | beta.1 |
| R22 | Shared states, roots, remount и collisions | T22 | beta.1 |
| R23 | Cross-month move с range refresh | T24 | beta.1 |
| R24 | Metadata/equivalent interval refresh | T21 | beta.1 |
| R25 | Canonical invalidation и latest policy | T21 | beta.1 |
| R26 | Move origin вне grid, pending focus | T23 | beta.1 |
| R27 | Delayed source filter, move draft cancellation и pending request | T24 | beta.1 |
| R28 | Removal/re-addition controlled pairs | T24 | beta.1 |
| R29 | Contract-invalid после draft callback | T24 | beta.1 |
| R30 | Blocking/refresh cross-feature state | T24 | beta.1 |
| R31 | Empty grid остаётся доступен для create | T20 | beta.1 |
| R32 | Intrinsic/constrained sizing и zero lanes | T11 | alpha.1 |
| R33 | Overflow count, comparator tie-break | T11 | alpha.2 |
| R34 | Один global comparator order | T07 | alpha.2 |
| R35 | Segment slots, press date и segment isSelected | T24 | beta.1 |
| R36 | Полная semantic grid mode matrix | T24 | beta.1 |
| R37 | Nested overlay и disappearing trigger | T16 | alpha.2 |
| R38 | Passive agenda presentation switch | T15 | alpha.2 |
| R39 | Source selector layout switch | T17 | alpha.2 |
| R40 | Agenda Tab exit и outside press | T12 | alpha.1 |
| R41 | Empty item/source sheet после update | T17 | beta.1 |
| R42 | Same-tree-only overlay ARIA links | T16 | alpha.2 |
| R43 | Range/move instruction coalescing | T24 | beta.1 |
| R44 | Move command/long-press modal handoff | T23 | beta.1 |
| R45 | Cancelled delayed agenda intent | T15 | alpha.2 |
| R46 | Agenda acceptance вместе с switch | T15 | alpha.2 |
| R47 | Block/target announcement dedup | T24 | beta.1 |
| R48 | Modal live routing между Calendar | T16 | alpha.2 |
| R49 | Root ARIA naming при SSR/ShadowRoot | T10 | alpha.1 |
| R50 | RTL keyboard/drag и bidi | T24 | beta.1 |
| R51 | Slots, разные темы/dir, portals | T18 | alpha.2 |
| R52 | Document/ShadowRoot 2×2 CSS scopes | T16 | alpha.2 |
| R53 | Portal container replacement/removal | T16 | alpha.2 |
| R54 | 639/640px, forced layout, SSR colors | T15 | alpha.2 |
| R55 | Themes/density и visual a11y matrix | T28 | RC |
| R56 | Today/midnight/system-zone hydration | T10 | alpha.2 |
| R57 | Auto hydration и mobile performance | T25 | beta.1 |
| R58 | Benchmark независим от текущей даты | T25 | beta.1 |
| R59 | h12/h23 и locale failures | T08 | alpha.1 |
| R60 | Весь stable data-attribute contract | T18 | beta.1 |
| R61 | Все tokens, precedence, portal checkpoints | T18 | alpha.2 |
| R62 | Source/partial appearance precedence | T18 | alpha.2 |
| R63 | Invalid CSS values и measurement fallback | T18 | alpha.2 |
| R64 | Consumer inclusive → exclusive migration | T29 | RC |
| R65 | Clean install без Day.js/старых exports | T13 | alpha.1 |
| R66 | Exact final tarball/full consumer matrix | T32 | stable |
| R67 | Полные RU/EN messages/fallback | T08 | beta.1 |
| R68 | Frozen timezone accepted-set | T06 | RC |
| R69 | Safe error shell и восстановление после draft | T10 | beta.1 |
| R70 | Request→cleanup, reentrant store/unmount | T22 | beta.1 |
| R71 | Issuer DFA и premature pending removal | T22 | beta.1 |
| R72 | Registry переживает UI cancellation | T22 | beta.1 |
| R73 | Node support во всей `0.2.x` | T33 | каждый patch |
| R74 | Docs parity и два pilot reports | T30 | RC |

Обязательные ранние части R02/R15/R27/R35 сохраняются в своих alpha-gates:

- **R02:** T07 / alpha.1 проверяет exclusive midnight и membership moment без `end`. T21 добавляет сохранение отсутствующего `end` в proposed interval, T24 / beta.1 подтверждает результат через полный move flow.
- **R15:** T10 / alpha.1 проверяет clamping `31 января → 28 февраля`, delayed acceptance и Tab-away без перехвата focus. T18 / alpha.2 добавляет RTL viewer navigation. T20/T24 / beta.1 проверяют тот же navigation flow с range selection через границу месяца в LTR/RTL, включая delayed acceptance и отменённый focus intent.
- **R27:** T17 / alpha.2 проверяет delayed acceptance filter, прежние checked-state и action labels до принятия props, согласованное обновление grid/agenda/counts/actions после acceptance и видимость items без source или с неизвестным `calendarId`. T24 / beta.1 отдельно проверяет отмену скрытого move draft с одним парным cleanup `null` после принятия filter и сохранение уже выпущенного внешнего pending request.
- **R35:** T11 / alpha.1 проверяет week segmentation и hit-tested press date; T18 / alpha.2 — render/class callbacks с точным `segmentRange`, agenda context и единое appearance в viewer. T20/T24 / beta.1 проверяют `isSelected` по пересечению принятой selection с каждым segment, в том числе разные значения у сегментов одного item, когда selection пересекает только часть из них.

R01–R74 не заменяют coverage остального документа. Ledger дополнительно связывает §§1–3 с T03/T14/T19/T26/T30; полный §5.7 и type-level acceptance — с T04/T13/T26; §§10–12 — с T08–T18/T24/T28; §§13–17 — с T13/T25/T27/T29/T32/T33; §§18–19 — с T29–T32. Особенности будущего `0.3` остаются вне implementation ledger `0.2`.

## 14. Что делать первым после утверждения плана

1. T01: завести baseline/requirement ledger и проверить воспроизводимость окружения без исправления старого API ради совместимости.
2. T02: закрыть три наиболее рискованных эксперимента — temporal/SSR, overlay/focus/touch, полный dependency/bundle feasibility.
3. Параллельно T03: подготовить briefs, договориться о способе проверки двух RC-пилотов с участниками без опыта API `0.2` и отдельно организовать ранний feedback.
4. T04–T06: зафиксировать type reference, private date adapter и accepted-zone pipeline; добавить строгие tests до подключения UI.
5. T07–T12: собрать первый сквозной сценарий «records → grid → дата → полный agenda → item press» и проверить его из packed consumer T13.

Первый практический результат — не набор новых props, а проверяемый alpha.1 slice. Следующие задачи берутся из dependency graph; незапланированное расширение scope и неподтверждённый release gate требуют явного решения.
