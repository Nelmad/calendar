# T19 — alpha.2 acceptance на packed candidate

19 октября 2026. Checkout собирает **`@nelmad/calendar@0.2.0-alpha.2` candidate** (не выпущен). Он прошёл acceptance alpha.2
на одном упакованном архиве в двух изолированных consumers. Candidate подготовлен для **отдельного решения о
публикации**: `npm publish` не выполнялся, registry install не проверялся. T19 завершает milestone M3 (T15–T19). Следующий
этап — T20 (selection и create, beta.1).

**Итоговый candidate** — после [финальной переквалификации](#финальная-переквалификация) на итоговом дереве (после трёх
независимых проверок): integrity `sha512-fPtPXlZTFeBRTuNkY8RoAlWpoLnlYV1WAHU6CGzxl57R8S+VfJj8c1Er8xZ31lpLRThaXKjmQyP7PrNJcyWqsg==`,
acceptance alpha.2 **303/303**, packed **58/58**, общая регрессия **36/36 checks, 948 tests**. Числа и integrity разделов ниже
до этого раздела относятся к прежним прогонам.

**Статус T19 (22 октября 2026): done.** Пункт 3 карточки (ранний внешний feedback с участниками T03) отложен
22 октября 2026 как явное решение пользователя, переданное задачей workflow DECISIONS-V8 (у пользователя в сессии не
перепроверялось, [оговорка](decisions-2026-10-22.md#approval-source)): он не выполнен и по §19.3 остаётся обязательным до RC/stable. SDK изменился в
[решениях 2026-10-22](decisions-2026-10-22.md) (spec draft v8), поэтому итоговым стал **заменяющий candidate** integrity
`sha512-Mz56MW7g…Nadbw==` ([Финальная переквалификация](#заменяющий-candidate-решения-2026-10-22)); прежний — исторический.
См. [решения 2026-10-22](#решения-2026-10-22).

Основание: карточка плана T19, спецификация draft v7 §§2.1, 6, 18–19 и уточнения пользователя от 9 октября
([решения 2026-10-09](decisions-2026-10-09.md)). Предыдущие исправления по независимой проверке —
[QA-исправления 2026-10-09](qa-fixes-2026-10-09.md). Снимок дерева до изменений: `scratchpad/snapshots/T19-before`.

## Brief T03 и внешний feedback

§2.1 требует датированный brief до первого prerelease advanced epic. Для двух epics alpha.2 они есть, оба с
рекомендацией `iterate` от 6 октября 2026. Одобрение maintainer ещё не получено. *22 октября 2026: решение «iterate» обоих
briefs утверждено владельцем (источник — задача workflow DECISIONS-V8, [оговорка](decisions-2026-10-22.md#approval-source)); набор участников не начат
([решения 2026-10-22](decisions-2026-10-22.md#process)).*

- [sources](t03-brief-sources.md) — `CalendarSource`, controlled filter с отложенным принятием, selector, fail-open
  неизвестного `calendarId`;
- [расширенный customization](t03-brief-customization.md) — slots, `classNames`, `getItemAppearance`.

**Ранний внешний интеграционный feedback с участниками T03 не собирался: никто не приглашён и не опрошен.** Карточка плана
требует этот feedback для advanced epics. Он остаётся обязательным и не заменяется acceptance, примерами maintainer или
тем, что prop включён в prerelease. Для stable go каждый advanced epic, оставшийся в stable scope, требует двух
независимых положительных пилотов с явным `go` (§2.1, §19.3). Зарезервированные участники timed RC-onboarding в раннем
feedback не участвуют. Набор участников начинается только после явного разрешения пользователя.

## Реализация

### Найденный дефект SDK и исправление

Axe нашёл в первом прогоне acceptance (attempt-1 (`evidence/t19/acceptance-attempts/attempt-1/manifest.json`),
`*-390x844-touch-axe-mobile-slots`) нарушение WCAG 2.5.3 «Label in Name». Кнопка нажатия строки повестки с
`renderAgendaItem` имела доступное имя только из скрытой сводки по умолчанию, а видимое пользовательское содержимое было
лишь описанием. Видимая подпись не входила в имя: пользователь голосового ввода не смог бы назвать кнопку по тексту на
экране.

Исправление в [`DayAgendaBody.tsx`](../../src/v02/calendar/DayAgendaBody.tsx): `aria-labelledby` ссылается на сводку и затем
на видимое содержимое, `aria-describedby` убран. Базовая accessible summary §10.4 сохраняется и начинает имя, видимая подпись
входит в него. Это меняет интерпретацию T18 («custom content — описание, а не имя»). Обновлены:

- тест [`slots.test.tsx`](../../src/v02/calendar/__tests__/slots.test.tsx): имя `^Standup.*Ticket 2$`, пустое описание, обе
  части `aria-labelledby` внутри кнопки;
- проверка в [`themes-slots-probe.mjs`](../../scripts/implementation/themes-slots-probe.mjs);
- [API](../api.md#prop-renderagendaitem)/[API ru](../api.ru.md#prop-renderagendaitem) и [CHANGELOG](../../CHANGELOG.md).

Мутационная проверка: с версией файла из снимка T19-before тест падает
(вывод (`evidence/t19/mutation-agenda-name-without-content.txt`)).

### Acceptance harness

[`alpha-acceptance.mjs`](../../scripts/implementation/alpha-acceptance.mjs) расширен для `--milestone=alpha.2`. Новые
сценарии вынесены в [`acceptance-alpha2.mjs`](../../scripts/implementation/acceptance-alpha2.mjs). Страница сценариев
[`Acceptance.tsx`](../../scripts/implementation/acceptance-probes/shared/Acceptance.tsx) получила URL-параметры: `layout`,
`presentation`, `theme`, `density`, `scheme`, `rtl`, `actions`, `sources`, `slots`, `multi`, `shadow`/`portal=shadow`, а также
fixtures `order`/`sorted` для §6 и `tiny`. Импортируются только public root и `styles.css`.

Остальные изменения:

- третий context — телефон 390×844 с `isMobile` и `hasTouch`;
- init script записывает каждое изменение `data-layout` с первого байта HTML;
- axe-цели внутри shadow trees разбираются по scope;
- `--only=<regexp>` нужен только для отладки harness, evidence даёт полный прогон.

Набор alpha.1 идёт без изменений при 1280 и 1024 px.

### Документация, примеры, stories

- **README/[README ru](../../README.ru.md):** статус «candidate, ждёт отдельного решения о публикации»; маршрут `/workspace`;
  раздел «Доступность» описывает фактический объём axe-проверки; миграция hover-действий на `getItemActions`. Известные
  ограничения:
  - selection, create, move и `interactionPolicy` появятся в beta.1;
  - нет сертификации screen readers и физических устройств;
  - нет бюджетов производительности и матрицы поддержки;
  - `az-Arab` не гидрируется одинаково;
  - пакет не опубликован.
- **[API](../api.md):** допустимые и недопустимые примеры содержимого slots (§10.4), новая формулировка имени custom строки
  повестки.
- **[Миграция](../migration-0.1-to-0.2.md):** убраны устаревшие строки «actions/appearance не входят в alpha.2»;
  `neutralTheme` в таблице экспортов.
- **[CHANGELOG](../../CHANGELOG.md):** запись alpha.2 закрыта как не выпущенный candidate.
- **[API report](../api/calendar.api.md):** без изменений, declarations не менялись.
- **Docs gate** [`check-docs.mjs`](../../scripts/docs/check-docs.mjs): новая проверка `prerelease-guides` (в
  `#limitations` есть версия и `az-Arab`, в `#install` есть `/workspace`, у правил slots есть пример allowed/not allowed с
  интерактивным содержимым, README примеров описывают `Workspace.tsx`) и побайтное равенство `Workspace.tsx` Vite/Next.
  [Self-test](../../scripts/docs/check-docs-selftest.mjs) получил четыре негативных случая; ожидание «stale version»
  дополнено новой проверкой.
- **Примеры Vite и Next:** новый маршрут `/workspace`
  ([`Workspace.tsx`](../../examples/vite/src/Workspace.tsx), побайтно одинаковый в обоих). В нём:
  - `layout` auto/desktop/mobile и `agendaPresentation`;
  - `getItemActions` с изменением собственных `items`;
  - sources: принятие фильтра через 500 мс, fail-open для item без `calendarId` и с неизвестным `calendarId`;
  - `neutralTheme`, `tokens`, `classNames`, пассивные `renderItem`/`renderAgendaItem`;
  - кнопка расширения toolbar с `aria-pressed` и видимым нажатым состоянием;
  - календарь в ShadowRoot с копиями таблиц стилей и `portalContainer`.

  README обоих примеров (EN/RU) описывают маршрут и обновлённые ограничения.
  [`packed-consumers.mjs`](../../scripts/implementation/packed-consumers.mjs) проверяет его в обоих consumers: SSR, actions,
  отложенный фильтр, density, ShadowRoot-portal, phone sheet и action sheet.
- **Stories:**
  - `Responsive/Forced layouts`;
  - `Theming/Theme × density × color scheme`;
  - новый [`Slots.stories.tsx`](../../stories/Slots.stories.tsx): пассивное содержимое items, расширение toolbar и
    собственный retry с доступностью;
  - `Portals/ShadowRoot theme scope`.

  Остальные требуемые stories уже были: mobile month + agenda, sheet, actions, sources, RTL.
- [`verify-foundation.mjs`](../../scripts/implementation/verify-foundation.mjs): `sourcePaths` и syntax-проверка нового
  модуля.

## Проверки

*Первый прогон T19 (заменён, см. [раунд 1](#раунд-1-исправления-по-независимой-проверке)); итоговые числа — в
[финальной переквалификации](#финальная-переквалификация).*

Acceptance manifest (`evidence/t19/acceptance/manifest.json`): **303/303 checks, ноль ошибок и предупреждений console,
ноль внешних запросов.**

Привязка candidate:

- версия `0.2.0-alpha.2`, 121 файл;
- integrity `sha512-QcR+p1ECQSkM0OmCZGIvkrR+8Cpx/LCk+jt9U6C7TEGmUuSIlNMZ2lLMZ5bTa3kV5vfAg92fk8j2e0MThITeuA==`;
- sha256 `ee142ec4c383b69f57996b2af137a23e8e5ad496f85518e11a6d4b89f9fca7f8`;
- архив сохранён (`evidence/t19/acceptance/nelmad-calendar-0.2.0-alpha.2.tgz`);
- git HEAD `ba8bb48`, `gitDirty: true`: работа 0.2 не закоммичена, поэтому evidence привязано к integrity и sha256.

Профиль: Node 24.20.0, Chrome 155.0.8059.84, Playwright 1.55.1, axe-core 4.14.0; Vite 6.4.3 + React 18.3.1; Next.js
16.3.8 + React 19.3.0.

| Группа | Что проверено |
| --- | --- |
| SSR (50) | 13 состояний alpha.1 и 12 сценариев alpha.2 × 2 consumers. HTML побайтно совпадает у двух серверов с разными `TZ`, `LC_ALL` и часами (+400 дней). `auto` даёт компактный месяц с inline-повесткой без `+N`; `auto` + `overlay` — без повестки до активации (решение 4). Selector имеет `aria-haspopup` `menu` на desktop и `dialog` на mobile; два trigger действий; тема и density neutral; классы slots. Два календаря без общих DOM id, ShadowRoot-mount только на клиенте. До первого измерения ноль lanes и `+N` с точными числами на всех 7 непустых днях |
| Desktop 1280 (alpha.2) | Hydration `auto`: одно переключение mobile → desktop, без повестки и без захвата focus. Content box 640/639/640/639/1000/320 → desktop/mobile/…/mobile точно по границе; внешний focus и viewed date сохраняются, overlays и callbacks не появляются. Focus внутри повестки переходит inline ↔ popover на тот же item. Forced mobile в 1000 px. Outside press у popover. Menu действий вложен в popover: первый `Escape` закрывает только menu, второй — повестку; действие даёт ровно один запрос с committed item. Sources с отложенным принятием: `aria-checked` и имена не меняются до принятия, затем скрытые items уходят из grid, counts, `+N` и повестки; `docs` без `calendarId` и `night` с неизвестным остаются. Два календаря: Tab-порядок, объявления только в своём root, тема в portal своего календаря. ShadowRoot с portal в body и в ShadowRoot: mirror переменных и шрифта, `aria-controls` только в одном tree scope, возврат focus в ShadowRoot. Slots: один Tab-вход в grid, именованное расширение toolbar, свой retry вместо встроенного |
| Month §6 | Bar и chip, включая moment и нулевую длительность; соседние месяцы; 4/5/6 недель по 7 колонок. Порядок по умолчанию и tie-break по code units одинаков в lanes и повестке; `sortItems` с результатами `0`. Повторный render не сдвигает ни одного сегмента. Ряды intrinsic и равные, не растут от items; высота родителя не ограничение; при 520 px равное деление; при 160 px grid прокручивается в своём region, toolbar цел. Нет частично видимых items. Click по `+N` и `Enter` открывают одну и ту же повестку; resize 520 → 900 px меняет `+7` на `+4` при открытой повестке, без восстановления focus |
| Телефон 390, touch | Сервер, первый client render и измерение — mobile без переключений; точки без chips и `+N`, без горизонтальной прокрутки страницы. Tap по дате обновляет inline-повестку, оставляет focus и объявляет; `Enter` ведёт к заголовку, `Escape` возвращает. Sheet: `aria-modal`, inert фон, scroll lock, focus на заголовке; tap по item, `Escape`, фон и кнопка закрытия возвращают к дате. Action sheet, вложенный sheet поверх повестки (`Escape` сверху вниз). Source sheet с нативными checkboxes и отложенным принятием. Forced desktop прокручивается внутри своего region |
| alpha.1 (повтор) | Весь набор T14 при 1280 и 1024 px в обоих consumers: hydration в чужой зоне, один Tab stop, arrows/Home/End, отложенные PageUp/PageDown и clamp, объявления toolbar, dialog повестки, точный payload, focus статуса, RTL, segments, spacing статуса, двойной Next, constrained `+N` |
| axe (122 скана) | 14 состояний alpha.1 при 1024 px; при 1280 px те же 14 и 19 состояний alpha.2: `auto`, classic/neutral × compact/comfortable × light/dark (8), neutral system в эмуляции dark, повестка neutral dark, RTL neutral dark comfortable, открытые menu действий и menu sources, slots, slots с ошибкой refresh, два календаря, повестка в ShadowRoot, order. На телефоне 14 состояний: inline, sheet, action sheet, source sheet, все шесть состояний данных, neutral dark comfortable, RTL, slots, forced desktop. В обоих consumers **0 нарушений** WCAG 2.0–2.2 A/AA в UI пакета и harness |

Ограниченное исключение axe то же, что в T14: `label-content-name-mismatch` для ячейки с aria-hidden `+N`. Узел исключается
только после проверки предиката в странице; счётчики — в `manifest.axe.excludedNodes`, на телефоне они идут из состояния
forced desktop. Неполные результаты получают проверенное разрешение. Минимальный вычисленный контраст разрешённого
`color-contrast` — 4.88:1.

**Packed consumers** — manifest (`evidence/t19/packed/manifest.json`), **58/58**, та же integrity. Покрытие:

- types TS 5.4.5/5.9.3 × bundler/NodeNext;
- ESM/CJS smoke и surface gate;
- production builds обоих consumers;
- Suspense/streaming settle;
- ShadowRoot presses и sheet;
- новый `*-workspace-alpha2-integrations` в обоих consumers.

**Регрессии на финальном коде** (Chrome, ноль page errors, статусы (`evidence/t19/run-status-probes.txt`)):

| Проба | Результат |
| --- | --- |
| themes/slots (`evidence/t19/themes-slots/browser.json`) | **24/24** |
| actions/sources (`evidence/t19/actions-sources/browser.json`) | **25/25** |
| overlay (`evidence/t19/overlay/browser.json`) | **48/48** |
| responsive (`evidence/t19/responsive/browser.json`) | **115/115** |
| Month (`evidence/t19/month/browser.json`) | **67/67** |
| agenda (`evidence/t19/agenda/browser.json`) | **72/72** |
| controller (`evidence/t19/controller/browser.json`) | **59/59** |
| foundation (`evidence/t19/foundation/browser.json`) | **108/108** |
| host (`evidence/t19/host/browser.json`) | **41/41** |
| story smoke (`evidence/t19/stories/manifest.json`) | **2/2** |

**Общая регрессия:** manifest (`evidence/validation-2026-10-19-t19/manifest.json`) — **28/28 checks, 803 tests в 44 suites**. Запущен после обновления ledger: hash ledger в manifest совпадает с поставленным файлом.
Отдельно прошли:

- `typecheck`, `typecheck:storybook`, `lint`, `test` (803 tests);
- `build` с dist verification;
- `typecheck:contract` с TypeScript 5.9.3 и 5.4.5;
- `check:requirements`, `check:timezones`, `check:transitions`;
- `check:docs` и self-test, `check:api`;
- `build-storybook`.

**Screenshots просмотрены** (acceptance (`evidence/t19/acceptance`), packed (`evidence/t19/packed`)): mobile inline и sheet,
menu действий, два календаря, slots, source sheet, RTL на телефоне, повестка в ShadowRoot, `/workspace` на desktop и
телефоне. Перекрытий, обрезанных controls, горизонтальной прокрутки страницы и потери focus ring нет. Замечания:

- кнопка расширения toolbar в `/workspace` не показывала нажатое состояние визуально. Это содержимое потребителя: в примере
  и story добавлен видимый стиль `aria-pressed`, после чего acceptance и packed прогнаны заново;
- кнопка «Экспорт» на странице сценариев — небольшой нестилизованный control harness, ответственность потребителя;
- в `ar-EG` подписи пакета английские: catalogs RU/EN, fallback по §11.2.

### Неудачные и заменённые прогоны

Сохранены рядом с финальными:

- attempt-1 (`evidence/t19/acceptance-attempts/attempt-1/manifest.json`) — 289 pass, 14 fail.
  - Настоящий дефект SDK: WCAG 2.5.3 у custom строки повестки, см. выше.
  - Ошибки ожиданий harness: неверно посчитанные непустые дни (all-day `end` исключающий, 6 сентября пуст), разбор `+N`
    с комментарием React в SSR HTML, U+2068/U+2069 в именах sources, item fixture вне видимых lanes, ожидание lanes в
    месяце без items.
- attempt-2 (`evidence/t19/acceptance-attempts/attempt-2/manifest.json`) — 303/303 до правок документации и примеров;
  source hashes устарели.
- attempt-3 (`evidence/t19/acceptance-attempts/attempt-3-before-example-css/manifest.json`) и
  packed attempt-1 (`evidence/t19/packed-attempts/attempt-1-before-example-css/manifest.json`) — 303/303 и 58/58 до стиля
  `aria-pressed` в `app.css` примеров. Хеши примеров устарели, integrity архива та же.

## Ledger

**`pass`:**

- все блоки §6.1 (7), §6.2 (6) и §6.3 (6), до T19 они были `in_progress`. Evidence: packed acceptance, unit tests
  layout, QA-D и проба Month на финальном коде. Каждый блок сверен с полным текстом спецификации;
- повторная проверка уже пройденных строк alpha.2: S4.2 (2), R33, R34, R37, R38, R39, R42, R45, R46, R48, R51, R52, R53,
  R54, R56, R61, R62, R63 и subchecks R15.2, R27.1, R35.2. Им добавлено evidence T19;
- все строки alpha.1 из T14 (S5.1, S5.1.1, R01, R03, R05, R06, R07, R16, R32, R40, R49, R59, R65 и subchecks R02.1, R15.1,
  R35.1) подтверждены повтором набора T14 на candidate alpha.2.

**`in_progress`** с частичным evidence T19 (поверхности документации §18, владелец T29/RC):

- generic actions;
- sources с отложенным принятием и fail-open;
- пассивный `renderItem` и custom toolbar/retry;
- темы;
- mobile month + agenda;
- auto/forced layouts и portal theme scope;
- RTL.

Строки §2.1 и §19.3 о пилотах остаются `planned`: внешнего feedback нет.

```sh
npm ci && npm ci --prefix scripts/implementation/spikes
npm test -- src/v02/calendar/__tests__/slots.test.tsx
node scripts/implementation/alpha-acceptance.mjs --milestone=alpha.2 --output=/private/tmp/calendar-t19-acceptance
node scripts/implementation/packed-consumers.mjs --output=/private/tmp/calendar-t19-packed
for probe in themes-slots actions-sources overlay responsive month agenda controller foundation host; do node scripts/implementation/$probe-probe.mjs /private/tmp/calendar-t19-$probe; done
npm run build-storybook && node scripts/implementation/portal-stories-check.mjs /private/tmp/calendar-t19-stories
node scripts/implementation/verify-foundation.mjs /private/tmp/calendar-t19-validation
# Раунд 1 проверки
node scripts/implementation/examples-dev-probe.mjs /private/tmp/calendar-t19-examples-dev
NODE_ENV=development npx storybook build -o /private/tmp/calendar-t19-storybook-dev && node scripts/implementation/portal-stories-check.mjs /private/tmp/calendar-t19-stories-dev /private/tmp/calendar-t19-storybook-dev
```

## Раунд 1: исправления по независимой проверке

Независимая проверка T19 нашла пять замечаний (T19-V1-01…05). Исправлены V1-01, V1-02 и V1-04. V1-03 требует решения
пользователя или lead, V1-05 не подтвердилось. Код SDK не менялся: integrity архива та же.

- **T19-V1-01 (P1), проверка детерминизма §6.1 была пустой.** В сценарии `order` `{...rest}` из `scenarioProps('order')`
  содержал `items: ordered` и стоял после `items={items}`. После `rerender()` Calendar получал тот же массив и те же
  объекты, и check `*-month-presentation-and-default-order` повторял render с идентичными props. Утверждения ledger и
  комментария harness о «свежих объектах» были ложными. В [`Acceptance.tsx`](../../scripts/implementation/acceptance-probes/shared/Acceptance.tsx)
  `items` больше не входит в `rest`. Страница записывает массив последнего commit в `window.acceptance.rendered`, и check в
  [`acceptance-alpha2.mjs`](../../scripts/implementation/acceptance-alpha2.mjs) теперь требует:
  - новый массив;
  - новый объект на каждой позиции;
  - структурное равенство;
  - те же позиции всех сегментов.

  Без исправления проверка падает: массив тот же. Unit test в [`layout.test.ts`](../../src/v02/core/__tests__/layout.test.ts)
  проверяет fresh copies в исходном, обратном и перемешанном порядке. У них одинаковые сегменты, lanes, continuation,
  списки дней и `fitWeekLanes`. Мутация (без tie-break по id) этот test роняет
  (вывод (`evidence/t19/fix-1/mutation-layout-without-id-tie-break.txt`)).
- **T19-V1-02 (P2), `aria-labelledby` через границу ShadowRoot.** В режиме «В ShadowRoot» пример `/workspace` передавал
  `aria-labelledby="workspace-title"`, а заголовок оставался в документе. SDK правильно отвергал ссылку: region получал
  имя «Календарь», в development печаталось предупреждение. Теперь [`Workspace.tsx`](../../examples/vite/src/Workspace.tsx)
  (побайтно равен копии Next) в ShadowRoot передаёт `aria-label` с тем же текстом, в документе — по-прежнему IDREF. Это
  описано в README примеров (EN/RU), там же упомянуто единственное документированное предупреждение маршрута
  (`items[].calendarId` для item с неизвестным source). Сценарий `shadow` acceptance называет корень через `aria-label`
  в своём tree scope и проверяет это в обоих `*-shadow-root-*-portal`. Packed `/workspace` проверяет имя в обоих режимах.
  Новая development-проба [`examples-dev-probe.mjs`](../../scripts/implementation/examples-dev-probe.mjs) собирает маршруты
  `/`, `/quick-start`, `/workspace` из исходников примера: `@nelmad/calendar` указывает на source facade, сборка в режиме
  development. Server render идёт в Node, hydration в StrictMode — в Chrome; `/workspace` проверяется в документе и в
  ShadowRoot, на desktop и на телефоне. Проба падает на любом предупреждении или ошибке, кроме документированного
  `items[].calendarId`. Результат (`evidence/t19/fix-1/examples-dev/browser.json`) — **4/4**. На версии примера из T19
  проба падает с предупреждением `aria-labelledby` (мутация (`evidence/t19/fix-1/examples-dev-mutation-labelledby-in-shadow/browser.json`)).
- **T19-V1-03 (P2), пункт 3 карточки.** Ранний внешний feedback T03 не собран: никто не приглашён. Решать, закрыть ли T19
  с отложенным пунктом или держать задачу открытой, должны пользователь или lead. Приглашение участников без разрешения
  пользователя не выполнялось. Статус в [журнале](progress-0.2.md) и шапке плана теперь прямо называет невыполненный пункт.
- **T19-V1-04 (P3), stories только компилировались.** [`portal-stories-check.mjs`](../../scripts/implementation/portal-stories-check.mjs)
  теперь после двух проверок Portals рендерит каждую story из `index.json` (47). Каждая должна дать хотя бы один корень
  calendar с role `region` и именем, без page errors и без ошибок или предупреждений console. Story `ShadowRoot theme scope`
  дополнительно открывает тематизированную повестку внутри своего ShadowRoot. `npm run build-storybook` — production
  сборка, в ней диагностика SDK вырезана. Поэтому скрипт принимает и вторую, development-сборку
  (`NODE_ENV=development npx storybook build`). В ней допускаются только документированные диагностики stories
  actions/sources (неизвестный `calendarId`) и validation. Описание story ThemeScope теперь говорит о ширине календаря,
  а не окна.
- **T19-V1-05 (P3), `sourcePaths`.** Не подтвердилось: `docs/implementation/t03-brief-customization.md` уже был в
  `sourcePaths` [`verify-foundation.mjs`](../../scripts/implementation/verify-foundation.mjs) (рядом с файлами T18), и его hash
  есть в manifest T19 (`evidence/validation-2026-10-19-t19/manifest.json`). `sourcePaths` дополнены новой пробой, её entry
  и README примеров; syntax check — новой пробой.

Проверки раунда 1 (новые каталоги в `evidence/t19/fix-1`, прежние прогоны не тронуты):

| Проверка | Результат |
| --- | --- |
| Acceptance alpha.2 (`evidence/t19/fix-1/acceptance/manifest.json`) | **303/303**, ноль ошибок и предупреждений console, ноль внешних запросов; check детерминизма записывает `fresh: {length: 11, array: true, objects: true, equal: true}` |
| Packed consumers (`evidence/t19/fix-1/packed/manifest.json`) | **58/58**; `/workspace`: имя `workspace-title` в документе и `aria-label` в ShadowRoot в обоих consumers |
| Examples development (`evidence/t19/fix-1/examples-dev/browser.json`) | **4/4**, 0 page errors, 0 непредусмотренных сообщений console |
| Story smoke, production (`evidence/t19/fix-1/stories/manifest.json`) | Portals **2/2**, все stories **47/47** |
| Story smoke, development (`evidence/t19/fix-1/stories-development/manifest.json`) | Portals **2/2**, все stories **47/47**, только документированные диагностики |
| Общая регрессия (`evidence/validation-2026-10-19-t19-fix-1/manifest.json`) | **29/29 checks, 804 tests в 44 suites**; hash ledger в manifest совпадает с поставленным файлом |

Integrity архива та же: `sha512-QcR+p1EC…ITeuA==`, sha256 `ee142ec4…f9fca7f8`. Первый повторный прогон acceptance сохранён
как attempt-1 (`evidence/t19/fix-1/acceptance-attempts/attempt-1-check-name-overwritten/manifest.json`): 303/303, но
возвращённое поле `name` перезаписало имена четырёх shadow checks в manifest. Поле переименовано в `rootName`, прогон
повторён. Прежний acceptance T19 (`evidence/t19/acceptance/manifest.json`) заменён: его check детерминизма был пустым.

Ledger после раунда 1: у S6.1-39970f213352 ложное pass-evidence заменено evidence раунда 1. Статус остаётся `pass`: повторный
render со свежими равными объектами проверен в Chrome, плюс unit test. Строки §2.1/§19.3 о пилотах — `planned`, без изменений.

<a id="остаточные-исправления"></a>
## Остаточные исправления

19 октября 2026, после T14–T19 и перед независимыми проверками. Источник — неблокирующие замечания проверяющих задач T14–T19,
групп QA-A…QA-D и решений 2026-10-09. Спецификация не менялась (draft v7). Снимок дерева до изменений —
`scratchpad/snapshots/RESIDUAL-before`. Evidence — `evidence/residual-2026-10-19` (`evidence/residual-2026-10-19/`).
Прежние прогоны не перезаписывались. Мутационные проверки лежат в
`mutations/` (`evidence/residual-2026-10-19/mutations/manifest.json`): каждое исправление по отдельности откатывается к
поведению до раунда, и его tests падают (**12/12** обнаружены). Пробы Chrome на коде до раунда — в
`host-on-pre-fix-code` (`evidence/residual-2026-10-19/host-on-pre-fix-code/browser.json`) (**42/45**, падают три новых
сценария) и `month-on-pre-fix-code` (`evidence/residual-2026-10-19/month-on-pre-fix-code/browser.json`) (**67/68**, падает новый
сценарий QA-D-4-01).

### Реализация

| Пункт | Итог |
| --- | --- |
| T14-1-D1 (P2) | Исправлено. Без `--output` (или каталога в argv) `packed-consumers.mjs`, `alpha-acceptance.mjs`, `verify-foundation.mjs`, `projection-probe.mjs`, `capture-baseline.mjs`, `timezones/run-capabilities.mjs` и `portal-stories-check.mjs` пишут в свежий `mkdtemp` во временном каталоге ОС и печатают путь; `typecheck:contract` так уже работал. Цитируемые каталоги evidence больше не меняются от рутинного запуска. Ledger и отчёты переведены на прогоны с актуальными hash (ниже) |
| T14-1-D2 | Исправлено ([`validation.ts`](../../src/v02/core/validation.ts)). При переданном `sources` каждый неизвестный `calendarId` сообщается один раз на ID и путь первого item: `items[3].calendarId: No source with ID "archive"; items with this calendarId remain visible with fallback appearance`. Ключ дедупликации — ID, поэтому переупорядоченная лента молчит, а новый ID позже сообщается. Без prop `sources` (alpha.1) остаётся одно общее `items[].calendarId: No sources supplied; …`. Пробы и story smoke ждут новый текст |
| T14-1-D3 | Исправлено ([`surface.ts`](../../src/v02/surface.ts)). Три формулировки: prop следующего prerelease — `not available in 0.2.0-alpha.2; ignored`; prop 0.1 (13 имён из удалённого `CalendarProps` 0.1) — `removed in 0.2; see the migration guide (docs/migration-0.1-to-0.2.md); ignored`; иное имя — `not a Calendar prop; ignored`. `key`, `ref`, `children` удаляются молча. Охрана dist (`verify-dist.mjs`) по-прежнему запрещает старые имена во всём JS, кроме ровно одного массива удалённых props в `v02/surface.(c)js` |
| T14-1-D4 | Исправлено: в [brief customization](t03-brief-customization.md) добавлены датированные уточнения. Tokens, CSS variables, `density` и `colorScheme` — базовый theming §10.3. Slots, `classNames` и resolver опубликованы в surface alpha.2 с T18. Исследование и решение brief не менялись. Brief sources состояние пакета не искажал |
| T14-1-D5 | Исправлено в корне. [`public.ts`](../../src/v02/public.ts) задаёт `CalendarBaseProps` явно, а не через `Pick` из reference, и `Unavailable<LaterProp>` берёт имена из `surface.ts`. Поэтому `dist/index.d.ts` и [отчёт API](../api/calendar.api.md) больше не содержат форм будущих props: остались 6 неэкспортируемых helpers вместо 15 (символ бренда темы, принимаемые layouts, `laterProps`, `Unavailable`). Новый compile-time guard [`public.guard.ts`](../../src/v02/public.guard.ts) доказывает равенство с прежним `Pick` (мутация с удалённым `renderEmpty` даёт ошибку `tsc`). `check-docs.mjs` читает props из `laterProps`. README уточняет, что в отчёте есть только эти helpers |
| T14-1-D6 | Исправлено в ledger: записи с T14 packed-examples manifest помечены как исторические; R06, R65 и строки §5.1 получили evidence финального архива |
| T14-1-D7 | Исправлено ([`alpha-acceptance.mjs`](../../scripts/implementation/alpha-acceptance.mjs)). Номер дня и число `+N` сравниваются как целые числовые токены (`\p{Nd}`-границы), а не подстрокой: день «4» больше не находится в «2026» |
| T14-1-D8 | Исправлено в README/API (EN/RU): предупреждения props вне prerelease выводятся один раз на имя для всего модуля, уже во время рендера, в том числе серверного; остальные — один раз на экземпляр после клиентского рендера |
| T15-R2-01 | Закрыто [решением 4](decisions-2026-10-09.md#decision-4); журнал, шапка плана и отчёты T15/T16 согласованы с записью решений |
| T15-R2-02 | Изменений не потребовалось: после раунда 3 T15 (T15-V2-03) forced → `auto` у неизмеримого корня даёт mobile, как пишет api.md. Это проверяют jsdom-test `a runtime forced → auto switch of an unmeasurable root…` и сценарий Chrome «forced → auto switch while hidden» responsive (`evidence/residual-2026-10-19/responsive/browser.json`) |
| T15-R2-03 | Уже исправлено до раунда: README и migration называют замену `getItemActions` |
| T15-R2-04 | Исправлено ([`vitest.setup.ts`](../../vitest.setup.ts)). В jsdom выводится только копия известного уведомления React 18 о `useLayoutEffect` в `renderToString`: серверный рендер внутри DOM-хоста — артефакт среды. Suites в node-окружении (`ssr.test.tsx`, `surface.ssr.test.tsx`) показали бы его, остальные `console.error` и spies тестов не затронуты. Вывод `npm test`: 1,16 МБ → 5 КБ |
| QA-A-2-01 (P2) | Исправлено в ledger: scope записей QA-A говорит «code before QA-A fix round 1»; шесть строк получили записи с прогонами QA-A-fix-1 и финальным деревом |
| QA-A-2-02 (P2) | Закрыто [решением 1](decisions-2026-10-09.md#decision-1): `S7-d04802a1ab27` и R54 — `pass` |
| QA-A-2-03 | Строка T15 журнала согласована (R54 — `pass` с решения 1) |
| QA-A-2-04 | Исправлено: test проверяет ровно одно предупреждение после rerender и двух мутаций DOM; без дедупликации падает |
| QA-B-1-01 (P2) | Закрыто [решением 2](decisions-2026-10-09.md#decision-2) — датированной записью одобренного уточнения §10.3.4 |
| QA-B-1-02 (P2) | Исправлено ([`ModalSheet.tsx`](../../src/v02/primitives/ModalSheet.tsx)). Фон закрывает sheet, только если и `pointerdown`, и `pointerup` пришлись на сам фон. Перетаскивание sheet → фон (выделение текста) и обратно больше не закрывает. jsdom-test и сценарий Chrome; на коде до раунда оба падают |
| QA-B-1-03 | Немодальный `role=dialog` исправлен решением 2. Остаток исправлен ([`modality.ts`](../../src/v02/calendar/modality.ts)): модальный слой хоста ищется и в открытых ShadowRoot (вложенные тоже), они наблюдаются на смену атрибутов. Модальное окно web component больше не делается `inert`, sheet ему уступает. Закрытые ShadowRoot недостижимы — так и задокументировано |
| QA-B-1-04 | Исправлено ([`CalendarMonth.tsx`](../../src/v02/calendar/CalendarMonth.tsx)). Чистые модификаторы и автоповтор не отменяют ожидающее открытие. Race-tests QA-20 используют обычную клавишу, новые tests проверяют Shift/Control/Meta и повтор. Сценарии Chrome popover/sheet; на коде до раунда sheet падает |
| QA-B-1-05 | Уже исправлено в задаче решений (popover в модальном `<dialog>` открывается в сторону с большим местом); сценарии QA-B-1-05 host (`evidence/residual-2026-10-19/host/browser.json`) проходят |
| QA-C-3-01 | Исправлено ([`classic.ts`](../../src/v02/themes/classic.ts)): принятое значение `tokens` передаётся CSS-обрезанным, поэтому клиент React 19 пишет тот же текст, что сервер. Оракул month probe сравнивает серверный текст со значением, которое передаёт пакет, и считает значения, чей необрезанный вид дал бы другой текст (из 60 000 сгенерированных значений, принятых и отвергнутых, — 4383) |
| QA-C-3-02 | Исправлено в ledger: R65 ссылается на QA-C-fix-2 и финальный архив |
| QA-D-4-01 (P2) | Исправлено ([`styles.css`](../../src/v02/styles.css)). Размер inline-повестки пустой даты теперь распорка содержимого (float нулевой ширины в `flow-root`), а не `min-block-size`. Без ограничения высоты он задаёт ту же flex-базу, поэтому оценка первого монтирования остаётся точной (проверки QA-D-3 проходят, в том числе `p{margin:0}`). В корне фиксированной высоты повестка сжимается до 80 px раньше сетки, а сетка mobile сохраняет строку дней недели и одну неделю 44 px. Новый сценарий Chrome: 320×360 `ru-RU` — viewport сетки 125 px в ready и 100 px с баннером ошибки (было 7), 390×420 — 172/149, 375×480 — 221/196. На коде до раунда сценарий падает |
| QA-D-4-02 | Исправлено ([`useCalendarController.ts`](../../src/v02/calendar/useCalendarController.ts)). Тихое начало refresh очищает устаревший текст завершения (не объявление месяца), поэтому два цикла подряд дают два разных payload. Проверка на реальном AT остаётся в матрице T28 |
| QA-D-4-03 | Исправлено в CHANGELOG: «в пределах около 2 %; точно при безразмерной или `normal` высоте строки хоста» |
| QA-D-4-04 | Исправлено ([`CalendarShell.tsx`](../../src/v02/calendar/CalendarShell.tsx)). Прогресс refresh без собственного `region`, текст подписи `aria-hidden`: в полном AX-дереве Chrome имя «Refreshing calendar» одно — у `progressbar` (новая проверка controller probe) |
| DEC-2-01 (P2) | Исправлено: два jsdom-test держат ширину внутри выученной полосы через `layout` auto → mobile → auto (645 px → desktop) и через breakpoint 644 (→ mobile). Оба падают без сброса полосы |
| DEC-2-02 | Исправлено: устаревшая фраза строки T15 журнала заменена |
| DEC-2-03 | Исправлено: пункт CHANGELOG о диалоге хоста называет только модальный диалог (`showModal()` или `aria-modal="true"`, также в открытом ShadowRoot) |
| DEC-2-04 | Без изменений: спецификацию эта задача не правит; строку даты при необходимости обновит владелец спецификации |
| T17-V1-D1 (P2) | Исправлено без отдельного решения lead вариантом, который проверяющий назвал совместимым с R37 и §5.6 ([`overlays.tsx`](../../src/v02/calendar/overlays.tsx)). Открытое menu или sheet item, скрытого принятым фильтром, остаётся до закрытия, но все действия отключены (`aria-disabled` у пунктов menu, disabled-кнопки sheet). Focus остаётся в поверхности (в sheet — на «Отмена»). Когда item снова показан, действия снова доступны. Обновлены api.md/api.ru.md, jsdom и сценарий Chrome R37 |
| T17-V1-D2 | Исправлено по §12.3 шаг 2: удалённый или отключённый control с focus передаёт его следующему доступному после прежней позиции, затем предыдущему, затем первому. Это работает и для fallback React Aria, который сначала уводит focus на сам menu |
| T17-V1-D3 | Исправлено: DOM id дочерних overlays — `nc-overlay-<useId корня>-<ID>`, кодирование ID инъективно (`-<hex>-` для каждого не-словесного символа). Tests: два Calendar и ID `a.b`/`a-b`/`a b`/`a_b`/`a/b` |
| T17-V1-D4 | Уже исправлено в раунде 1 T19 (story smoke рендерит все 47 stories) |
| T18-V1-01 (P2) | README примеров уже исправлены в T19. Добавлен docs check `examples-current-slice`: опубликованный prop или export в README примера не может быть описан как будущая работа. Self-test дополнен мутацией |
| T18-V1-02 | Уже исправлено в T19 (story Slots) |
| T18-V1-03 | Не исправлено: нужно решение lead или владельца спецификации. Решение 3 касается только `tokens`. Реализованное правило для `CalendarSource.color`/`getItemAppearance` даёт тот же итог, что отказ UA (нижний канал сохраняется), и нужно для равенства server/client §10.3.2. Формально R63 говорит о передаче CSS engine; вопрос остаётся в списке ниже |
| T19-V2-01 (P2), T19-V2-03 | Исправлено в ledger: 64 строки и их записи с заменённым прогоном T19 помечены как исторические, рядом добавлены записи финального прогона; у `S6.3-0d51d7f1d454` — fix-1, финальный прогон и `layout.test.ts`. Журнал отмечает прогон T19 как заменённый |
| T19-V2-02 (P2) | Не исправлено: пункт 3 карточки (ранний внешний feedback T03) требует решения пользователя или lead и разрешения на набор участников. Никто не приглашался |
| T19-V2-04 | Исправлено: README EN/RU описывает проверенное исключение axe `label-content-name-mismatch` для `+N` и ссылается на этот отчёт |
| T19-V2-05 | Исправлено: `/workspace` (обе копии `Workspace.tsx`, `app.css`) передаёт «Выполнено» визуально скрытым текстом. Story Slots передаёт «Заблокировано» скрытым текстом в сетке и видимым в строке повестки |

Затронутые тесты: [`surface.test.tsx`](../../src/v02/calendar/__tests__/surface.test.tsx),
[`diagnostics.test.tsx`](../../src/v02/calendar/__tests__/diagnostics.test.tsx),
[`validation.test.ts`](../../src/v02/core/__tests__/validation.test.ts),
[`sources.test.tsx`](../../src/v02/calendar/__tests__/sources.test.tsx),
[`actions.test.tsx`](../../src/v02/calendar/__tests__/actions.test.tsx),
[`hosts.test.tsx`](../../src/v02/calendar/__tests__/hosts.test.tsx),
[`opening.test.tsx`](../../src/v02/calendar/__tests__/opening.test.tsx),
[`responsive.test.tsx`](../../src/v02/calendar/__tests__/responsive.test.tsx),
[`controller.test.tsx`](../../src/v02/calendar/__tests__/controller.test.tsx),
[`classic.test.tsx`](../../src/v02/themes/__tests__/classic.test.tsx). Ни одна проверка не ослаблена. Два ожидания изменены
по смыслу исправлений. Клавиша «unrelated key» в tests и responsive probe теперь `a` (Shift больше не отменяет). Test
фокуса после удаления source ждёт соседа, а не первый пункт.

### Проверки

| Проверка | Результат |
| --- | --- |
| Общая регрессия (`evidence/residual-2026-10-19/validation/manifest.json`) | **32/32 checks, 822 tests в 44 suites**; все 260 source hashes manifest совпадают с итоговым деревом, включая ledger. Первый запуск остановлен до правки шапки плана и сохранён как attempt-1 (`evidence/residual-2026-10-19/validation-attempts/attempt-1-interrupted-before-plan-edit/manifest.json`) |
| Acceptance alpha.2 (`evidence/residual-2026-10-19/acceptance-alpha2/manifest.json`) | **303/303** на integrity `sha512-2mWpkOUl…PMttJA==`, sha256 `588773a6…1e9b5bde`; ноль ошибок console и внешних запросов. Первый прогон сохранён как attempt-1 (`evidence/residual-2026-10-19/acceptance-attempts/attempt-1-rtl-arabic-indic-count/manifest.json`): 299/303, четыре скана axe `rtl-ar`. Исправленный предикат исключения T14-1-D7 показал, что прежний подстрочный поиск находил число `+N` в цифрах даты описания: индикатор выводит число арабско-индийскими цифрами локали дат (`+٢`), а описание `moreItemsLabel` — цифрами языка сообщений (`2`). Число в описании есть, так что это ошибка harness, а не SDK. Предикат сравнивает цифры любой системы счисления по значению, прогон повторён |
| Packed consumers (`evidence/residual-2026-10-19/packed/manifest.json`) | **58/58** на той же integrity |
| Chrome | Month 68/68 (`evidence/residual-2026-10-19/month/browser.json`), host 45/45 (`evidence/residual-2026-10-19/host/browser.json`), controller 59/59 (`evidence/residual-2026-10-19/controller/browser.json`), overlay 48/48 (`evidence/residual-2026-10-19/overlay/browser.json`), themes/slots 24/24 (`evidence/residual-2026-10-19/themes-slots/browser.json`), actions/sources 25/25 (`evidence/residual-2026-10-19/actions-sources/browser.json`), responsive 115/115 (`evidence/residual-2026-10-19/responsive/browser.json`), agenda 72/72 (`evidence/residual-2026-10-19/agenda/browser.json`), foundation 108/108 (`evidence/residual-2026-10-19/foundation/browser.json`), examples development 4/4 (`evidence/residual-2026-10-19/examples-dev/browser.json`); 0 page errors |
| Story smoke | production (`evidence/residual-2026-10-19/stories/manifest.json`) и development (`evidence/residual-2026-10-19/stories-development/manifest.json`): Portals **2/2**, все stories **47/47**, только документированные диагностики (новый текст `items[9].calendarId`) |
| Мутации (`evidence/residual-2026-10-19/mutations/manifest.json`) | 12/12 обнаружены |

Команды: `npm run typecheck`, `typecheck:storybook`, `lint`, `test`, `build`, `typecheck:contract` (TS 5.9.3 и 5.4.5),
`check:requirements`, `check:timezones`, `check:transitions`, `build-storybook`, `check:docs` (+ self-test), `check:api` —
внутри общей регрессии; probes, `check:package` и acceptance — каждый с явным каталогом в `evidence/residual-2026-10-19`.

### Ledger

Статусы не менялись. Добавлены записи финального дерева (см. T19-V2-01/03, QA-A-2-01, T14-1-D6, QA-C-3-02) и записи
поведения раунда: R37, R32, `S5.6-2ff3e3aaebb8` (partial), `S5.6-2d29c23eee4d`, `S12.3-dfa39439ad42` (partial),
`S12.2-aed8cbdf0ee7` (partial), `S12.4-e9b2c18d692a`, `S10.3.2-615ac46d0076`, `S10.3.4-9e326aa5a127`,
`S5.2.1-60e618f8c1b5` (partial), `S7-d04802a1ab27`, `S9-193c29cf1993`. Прежние записи сохранены; устаревшие помечены как
исторические в scope.

### Границы

- Решения пользователя или lead по-прежнему нужны для T19-V2-02 (пункт 3 карточки T19) и T18-V1-03 (правило одного значения
  декларации для цветов items). *22 октября 2026: T19-V2-02 — пункт отложен решением пользователя ([источник](decisions-2026-10-22.md#approval-source)), T18-V1-03 — утверждено решением 2
  spec draft v8 ([решения 2026-10-22](decisions-2026-10-22.md)).*
- QA-D-4-02 подтвердит только матрица AT T28. Закрытые ShadowRoot для поиска модальных окон хоста недостижимы.
- Candidate по-прежнему не опубликован; npm publish и набор участников не выполнялись.

<a id="финальная-переквалификация"></a>
## Финальная переквалификация

19 октября 2026, после T14–T19, остаточных исправлений и трёх независимых проверок. На итоговом дереве заново прогнан весь
набор evidence: общая регрессия, все Chrome probes, packed consumers, acceptance alpha.2 и story smoke. Спецификация не
менялась (draft v7). Evidence:

- Chrome probes, packed consumers и story smoke — `evidence/final-2026-10-09` (`evidence/final-2026-10-09/`)
  (статусы (`evidence/final-2026-10-09/run-status.txt`), примечания (`evidence/final-2026-10-09/run-status-notes.txt`));
- acceptance alpha.2 — `evidence/t19/final-after-reviews` (`evidence/t19/final-after-reviews/manifest.json`), архив сохранён
  рядом;
- общая регрессия — `evidence/validation-2026-10-09-final` (`evidence/validation-2026-10-09-final/manifest.json`).

Прежние прогоны не перезаписывались.

### Три независимые проверки

| Проверка | Метод | Подтверждено | Итог |
| --- | --- | --- | --- |
| [2026-10-09-1](review-2026-10-09-1.md) | Аудит трассируемости к спецификации, два проверяющих | 13: 4 P2, 9 P3 (одно найдено обоими, поэтому 12 строк) | Исправлено в двух раундах: повторная проверка нашла регрессию и неполноту исправления 8 (C1, C2). Не исправлено № 11 — цель восстановления focus selector sources; документация приведена к коду, решение за lead |
| [2026-10-09-2](review-2026-10-09-2.md) | Состязательное чтение кода по четырём направлениям, каждое замечание подтверждено судьёй | 27: 1 P1, 6 P2, 20 P3 | Исправлены все 27 и три замечания повторной проверки (R2C-1…3). Новый Chrome probe `review2` |
| [2026-10-09-3](review-2026-10-09-3.md) | Black-box тестирование packed candidate: onboarding по README, browser-e2e, differential-fuzz | 15: 4 P2, 11 P3, из них два повтора | Исправлены все, кроме № 13: JS bundle около 93 KiB gzip против кандидатного потолка 80 KiB §15.1 — риск до performance spike. Новый Chrome probe `review3` |

### Реализация

Код SDK, публичные типы, документация пакета, примеры и stories не менялись. Изменено:

- описание scope в [`verify-foundation.mjs`](../../scripts/implementation/verify-foundation.mjs) называет исправления
  проверки 2026-10-09-3. Список команд и `sourcePaths` не менялись: `review3-probe.mjs` в них уже был;
- [ledger](requirements-0.2.json): записи evidence финального прогона добавлены к 64 строкам. Это все 61 строка `pass`
  этапов alpha.1 и alpha.2 и три строки с alpha.2 evidence других этапов: `S5.2.1-031010b96f3e`, `S7-147eafd5e2a7`,
  `S11.3-dfb23a6d815e`. Статусы не менялись. Ledger правился до общей регрессии, его hash в manifest актуален;
- строка статуса [плана](../implementation-plan-0.2.md) ссылается на этот раздел.

### Проверки

Привязка candidate:

- версия `0.2.0-alpha.2`, 123 файла;
- integrity `sha512-fPtPXlZTFeBRTuNkY8RoAlWpoLnlYV1WAHU6CGzxl57R8S+VfJj8c1Er8xZ31lpLRThaXKjmQyP7PrNJcyWqsg==`;
- sha256 `88abd6de452ea7cbffeb70392c56830528d3ba536e0bf84d9b0056b3aaa29378`;
- архив сохранён (`evidence/t19/final-after-reviews/nelmad-calendar-0.2.0-alpha.2.tgz`);
- git HEAD `ba8bb48`, `gitDirty: true` (140 записей status): работа 0.2 не закоммичена, evidence привязано к integrity и
  sha256.

Integrity совпадает с прогоном проверки 3: дерево пакета после неё не менялось. Packed consumers собрали тот же архив
независимо.

Профиль: Node 24.20.0, Chrome 155.0.8059.84, Playwright 1.55.1, axe-core 4.14.0; Vite 6.4.3 + React 18.3.1; Next.js
16.3.8 + React 19.3.0.

| Проверка | Результат |
| --- | --- |
| Acceptance alpha.2 (`evidence/t19/final-after-reviews/manifest.json`) | **303/303**, ноль failures. SSR — 50 (по 25 в каждом consumer). 122 скана axe — **0 нарушений** WCAG 2.0–2.2 A/AA; минимальный контраст разрешённого `color-contrast` — 4.88:1; проверенное исключение `label-content-name-mismatch` для `+N` — 160 узлов. Все 6 checks «нет ошибок console и внешних запросов» проходят |
| Packed consumers (`evidence/final-2026-10-09/packed/manifest.json`) | **58/58** на той же integrity |
| Chrome probes | review3 26/26 (`evidence/final-2026-10-09/review3/browser.json`), review2 27/27 (`evidence/final-2026-10-09/review2/browser.json`), Month 71/71 (`evidence/final-2026-10-09/month/browser.json`), host 49/49 (`evidence/final-2026-10-09/host/browser.json`), controller 59/59 (`evidence/final-2026-10-09/controller/browser.json`), overlay 48/48 (`evidence/final-2026-10-09/overlay/browser.json`), themes/slots 24/24 (`evidence/final-2026-10-09/themes-slots/browser.json`), actions/sources 43/43 (`evidence/final-2026-10-09/actions-sources/browser.json`), responsive 115/115 (`evidence/final-2026-10-09/responsive/browser.json`), agenda 72/72 (`evidence/final-2026-10-09/agenda/browser.json`), foundation 108/108 (`evidence/final-2026-10-09/foundation/browser.json`), examples development 4/4 (`evidence/final-2026-10-09/examples-dev/browser.json`) (5 документированных диагностик). Всего **646/646**, 0 page errors |
| Projection parity (`evidence/final-2026-10-09/projection/runtime-parity.json`) | ESM/CJS/Chrome: 4 projection и 11 wall-time cases, две host zones браузера |
| Locale parity (`evidence/final-2026-10-09/locale/locale-parity.json`) | **22/24**, ожидаемо: два случая `az-Arab` (модель locale и hydration fixture 9) расходятся из-за native Intl data Node 24.20 и Chrome 155 — известная проблема T08, тот же результат в [решениях 2026-10-09](decisions-2026-10-09.md). Открыта до T27 |
| Story smoke | production (`evidence/final-2026-10-09/stories/manifest.json`) и development (`evidence/final-2026-10-09/stories-development/manifest.json`): Portals **2/2**, все stories **47/47**, 0 page errors, только документированные диагностики |
| Общая регрессия (`evidence/validation-2026-10-09-final/manifest.json`) | **36/36 checks, 948 tests в 45 suites**; повтор 308 tests в 10 suites под четырьмя host `TZ`. Все 268 source hashes совпадают с итоговым деревом |

Source hashes остальных manifests тоже сверены с деревом после прогонов: acceptance (158), packed (164), story smoke и все
probes — расхождений нет.

Внутри общей регрессии прошли:

- `typecheck`, `typecheck:storybook`, `lint`, `test`;
- `build` с dist verification;
- `typecheck:contract` с TypeScript 5.9.3 и 5.4.5;
- `check:requirements`, `check:timezones`, `check:transitions`;
- `check:docs` и self-test, `check:api`;
- `build-storybook`, self-test harness, syntax всех probes.

**Screenshots просмотрены:** sheet на телефоне, RTL `ar` на телефоне, `/workspace` в ShadowRoot (packed Next). Перекрытий,
обрезанных controls и потери focus ring нет.

Неудачных прогонов, кроме ожидаемого locale parity, не было; исправлений не потребовалось.

<a id="заменяющий-candidate-решения-2026-10-22"></a>
### Заменяющий candidate (решения 2026-10-22)

22 октября 2026 [решения 2026-10-22](decisions-2026-10-22.md) (spec draft v8) изменили SDK по решению 3: восстановление
при строгом CSP ограничено собственными validated declarations пакета (без `style` корня потребителя) и дополнено
цветами строк серверной inline-повестки. Поэтому архив другой, и candidate выше стал историческим. Заменяющий candidate:

- версия `0.2.0-alpha.2` (не выпущена), 123 файла;
- integrity `sha512-Mz56MW7gUsOV1TocE1a+NtdMjz5QLhJ63VtFZzqCWbZ/TM66SBEzToPLt0iEoxlQwEbpLSgZ4sAYphumdNadbw==`;
- sha256 `9b67d1176d2b9447985c519ad7de5fad31c60431b057046fc392f14e602b19f1`;
- архив сохранён (`evidence/decisions-2026-10-22/acceptance-alpha2/nelmad-calendar-0.2.0-alpha.2.tgz`), тот же байт в байт
  собрали packed consumers (`evidence/decisions-2026-10-22/packed/manifest.json`).

Результаты на нём: acceptance alpha.2 (`evidence/decisions-2026-10-22/acceptance-alpha2/manifest.json`) **303/303**,
packed (`evidence/decisions-2026-10-22/packed/manifest.json`) **58/58**, Chrome probes **658/658** (прежние 646 и 12 новых
сценариев v8), story smoke 47/47 в production и development, CSP-потребители React 18.3.1 и 19.2.0 — pass. Общая
регрессия — в [решениях 2026-10-22](decisions-2026-10-22.md#checks).

### Что требует явного решения пользователя или lead

*22 октября 2026:* пункт 3 карточки отложен решением пользователя (см. [ниже](#решения-2026-10-22), с оговоркой об источнике); правило цветов items
(T18-V1-03), цель восстановления focus selector (№ 11), CSP §10.3.4 и имя custom строки повестки утверждены spec draft v8
([решения 1–4](decisions-2026-10-22.md)). Открытыми остаются публикация, размер bundle и проверки, которым нужны люди и
устройства. Список ниже — на 19 октября.

- **Публикация.** `npm publish` сохранённого архива без rebuild, затем registry install с той же integrity. Не выполнялось.
- **Пункт 3 карточки T19 (T19-V2-02).** Ранний внешний feedback T03 не собран, никто не приглашён. Нужно решение, закрывать
  ли T19 с отложенным пунктом, и разрешение на набор участников. До stable на каждый advanced epic нужны два положительных
  пилота (T03/T30). Briefs T03 ждут одобрения maintainer.
- **Решения lead:**
  - правило одного значения декларации для цветов items (T18-V1-03);
  - цель восстановления focus selector sources (проверка 1, № 11);
  - CSP §10.3.4 (T18);
  - имя custom строки повестки «сводка + видимое содержимое» (WCAG 2.5.3).
- **Размер bundle** выше кандидатного потолка §15.1 (проверка 3, № 13) — до performance spike T25.
- **Не выполнялось и требует людей или устройств:**
  - physical iOS/Android (touch только эмуляцией Chrome);
  - manual AT (NVDA, VoiceOver, TalkBack);
  - Firefox и Safari, матрица поддержки;
  - SSR qualification `az-Arab` и ещё 96 языков full ICU Node, которых нет в Chrome (T27).

## Границы

- Это prerelease acceptance, **не stable gate §12.5/§19**. Не выполнены:
  - manual AT (NVDA, VoiceOver, TalkBack);
  - физические телефоны и планшеты: touch только эмуляцией Chrome;
  - Firefox и Safari, матрица поддержки;
  - ручной аудит контраста, reflow 320 px и zoom 400 %, text spacing;
  - бюджеты производительности (T25).

  axe проверяет только автоматически определяемые критерии.
- Не входят в alpha.2 (beta.1, T20–T24): `selection`/`onSelectionChange`/`onCreateRequest`,
  `itemMoveStates`/`onItemMoveRequest`/`onItemMoveDraftChange`, `interactionPolicy`. Части R15, R27, R35, R60 для beta.1
  остаются открытыми.
- Открытые вопросы на решение lead, T19 их не менял (*22 октября 2026 утверждены spec draft v8, [решения 2026-10-22](decisions-2026-10-22.md)*):
  - T17: menu скрытого item остаётся открытым без запроса (*закрыто в [остаточных исправлениях](#остаточные-исправления):
    действия такого menu отключены, это совместимо с R37 и §5.6*);
  - T18: правило одного значения декларации для цветов items;
  - T18: CSP §10.3.4;
  - новое: имя custom строки повестки «сводка + видимое содержимое», которое заменило интерпретацию T18 ради WCAG 2.5.3.
- `az-Arab` native SSR mismatch (T08), physical touch (T02/T23) и pilots (T03/T30) остаются открытыми.
- Candidate собран из незакоммиченного дерева. Публикация — отдельное release-действие пользователя: `npm publish <tgz>`
  без rebuild, затем registry install с той же integrity. Ничего из этого не выполнялось.
  *Позже (согласование 2026-10-23):* публикация идёт по [RELEASING.md](../../RELEASING.md) — Release workflow на `main`
  собирает версию из commit и ставит её в npm как staged с provenance, публичной она становится после одобрения с 2FA;
  `npm publish <tgz>` без rebuild не используется.

<a id="решения-2026-10-22"></a>
## Решения 2026-10-22

Оба процессных решения ниже переданы задачей workflow DECISIONS-V8 по сообщению пользователя «ок дальше»; у пользователя
в сессии они не перепроверялись ([оговорка](decisions-2026-10-22.md#approval-source)).

- **T19 — done.** Пункт 3 карточки (T19-V1-03, T19-V2-02: ранний внешний интеграционный feedback по advanced epics с
  участниками T03) отложен 22 октября 2026 как явное решение пользователя. Он **не выполнен**: никто не приглашён и не опрошен. По
  §19.3 он остаётся обязательным до RC/stable — по два независимых положительных пилота на advanced epic (T30);
  включённый prop не считается доказательством спроса.
- **T03 — briefs approved; recruitment not started.** Решение «iterate» обоих briefs утверждено владельцем
  22 октября 2026.
- **Решения lead по T17–T19** утверждены spec draft v8 ([решения 2026-10-22](decisions-2026-10-22.md)): focus selector
  (решение 1), цвета items (решение 2), CSP (решение 3, с исправлением SDK), имя custom строки повестки (решение 4).
- **Candidate.** Итоговый — [заменяющий](#заменяющий-candidate-решения-2026-10-22) `sha512-Mz56MW7g…Nadbw==`; прежний
  `sha512-fPtPXlZT…JcyWqsg==` — исторический. Публикация не выполнялась.
