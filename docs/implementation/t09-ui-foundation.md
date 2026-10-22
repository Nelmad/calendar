# T09 — private UI foundation и classic

17 сентября 2026. Базовая часть T09 реализована в `src/v02`. Root exports и дистрибутив пока остаются `0.1`; полного Calendar `0.2` ещё нет.

## Реализация

- [Primitives](../../src/v02/primitives/index.ts): React Aria Button/IconButton, Checkbox, Menu/MenuItem, Popover, Modal/Dialog и triggers; пассивные Stack/Text/Skeleton и декоративные SVG icons. Button по умолчанию не отправляет form; IconButton требует отдельное имя, а SVG скрыты от accessibility tree. Controlled Checkbox показывает принятое состояние.
- [Classic](../../src/v02/styles.css): scoped `.nc-theme`, compact/comfortable, light/dark/system, logical CSS, RTL navigation icons, keyboard focus, disabled states, 44px control targets, reduced-motion и system colors при forced-colors. Шрифт наследуется от приложения. Нет глобального `:root`, runtime style injection или font assets в новой UI-базе.
- [Token declarations](../../src/v02/themes/classic.ts): явная карта всех 27 нормативных paths, pure blank/non-string diagnostics, сохранение nonempty CSS values без parser и root `style` после generated `tokens`. Typography defaults наследуют font properties приложения. Это основа T18, не закрытая проверка всех theme/slot/appearance contracts.
- [ThemeRoot](../../src/v02/primitives/ThemeRoot.tsx) передаёт явный locale React Aria и хранит props текущего экземпляра. Portal получает отдельный theme root с lang/direction/density/color-scheme и заданными tokens. Полный mirror computed variables/font properties и lifecycle container replacement/removal принадлежит T16.
- После промежуточного review Popover разрешает все `start/end` через явный `dir`, сохраняя physical `left/right`. Его scroll surface наследует доступную высоту positioner React Aria. Directional icons используют собственное `:dir(rtl)`, поэтому вложенный LTR root не наследует зеркалирование RTL-предка.
- [Runtime bootstrap](../../src/v02/primitives/runtime.ts): публичный `enableShadowDOM()` вызывается идемпотентно до mount React Aria descendants. Вызов находится в используемых компонентах, поэтому production tree shaking сохраняет его при текущем `sideEffects` contract. Bootstrap не требует consumer API и сам не читает DOM/clock. Флаг общей копии React Stately не выключается при unmount.
- `@react-stately/flags@3.2.1` закреплён как dev dependency для private этапа, используется та же единственная `react-stately@3.47.0`, что RAC `1.18.0`. Перенос implementation libraries в обычные dependencies — T13. *Позже (QA-05, [группа QA-C](qa-fixes-2026-10-09.md#qa-c)):* в потребительских установках `@react-stately/flags` разрешал собственную `react-stately` 3.50+, поэтому пакет заменён прямой зависимостью `react-stately@3.47.0` (тот же точный pin, что у react-aria и RAC), флаг импортируется из `react-stately/private/flags/flags`.
- В Storybook удалены `yastatic.net` preconnect/font-face; старые Text/IconButton/ActionMenu тоже наследуют font family. Новый stylesheet подключается явно в каждом содержащем UI CSS tree scope.

## Проверки

Foundation manifest (`evidence/validation-2026-09-17-t09-review-fixes/manifest.json`): **15 checks pass, 363 unit tests**. Добавлены 9 тестов реального button press, form safety, disabled controls, naming/ref, controlled/mixed Checkbox, точной token map/precedence и SSR. Проверены lint, types, reference contracts TS 5.4.5/5.9.3, timezone/source audits, сборки package и Storybook. Прежний warning `@microsoft/api-extractor` сохраняется; это не clean public `0.2` release build.

Browser report (`evidence/t09/review-fixes/browser.json`): **108/108 checks, ноль page errors**, Chrome `153.0.8010.48`, Node `24.20.0`. Fixture собирается в minified ESM/CJS, сравнивает SSR и выполняет hydration при немецком host locale. Четыре пары Document/ShadowRoot проверяют Enter/Space/Tab, skip disabled, Checkbox, Menu ArrowDown/Escape/action/return, именованный dialog, modal focus containment и inert cleanup, удаление открытого modal при unmount, inherited font, scoped CSS, media, RTL и comfortable/dark. CSS явно установлен fixture в каждом используемом tree scope.

[Review regressions](../../scripts/implementation/foundation-regressions.mjs) добавляют 68 проверок в тех же четырёх парах: меню из 10/30 пунктов с trigger сверху/снизу, видимость focus после Home/End и локальная прокрутка, resize до 320×360, несовпадающие locale/direction для logical и physical placement, вложенные RTL/LTR/RTL icons. Geometry проверяется после rAF-прокрутки React Aria. Это browser assertions, а не jsdom-проверки CSS строк.

Скриншоты: classic light (`evidence/t09/review-fixes/classic.png`), classic dark/RTL (`evidence/t09/review-fixes/classic-dark-rtl.png`). Они показывают private controls fixture, не готовый Month View.

Первоначальные failures сохранены:

1. 13/36 (`evidence/t09/initial/browser.json`): side-effect-only импорт bootstrap удалялся production tree shaking; Menu наследовал `aria-labelledby` trigger и терял собственное имя. После явного bootstrap call и очистки implicit IDREF — 36/36 (`evidence/t09/bootstrap-fix/browser.json`).
2. 32/40 с новым RTL case (`evidence/t09/final/browser.json`): RAC Popover перезаписывает `dir` направлением locale. Package theme root перенесён внутрь positioning boundary, explicit physical placement сохраняет выбранную сторону. После исправления — 40/40 (`evidence/t09/rtl-fix/browser.json`); verified report (`evidence/t09/verified/browser.json`) дополнительно ждёт завершения media transition перед light screenshot.
3. 56/108 до review fixes (`evidence/t09/review-regressions-before/browser.json`): две P2 — scroll surface не учитывал доступную высоту Popover, explicit logical placement использовал направление locale; одна P3 — RTL-предок зеркалил icons вложенного LTR root. Те же исходники fixture после трёх runtime/CSS исправлений дают 108/108 (`evidence/t09/review-fixes/browser.json`). Исходные 40 checks проходят в обоих отчётах.

```sh
npm test -- src/v02/primitives src/v02/themes
node scripts/implementation/foundation-probe.mjs /private/tmp/calendar-t09
node scripts/implementation/verify-foundation.mjs /private/tmp/calendar-t09-foundation
```

## Границы этапа

T10 подключит Calendar controller, SSR/today и data states; T11/T12 — Month/agenda. T16 реализует весь ownership stack, logical Tab exit относительно trigger, nested modal effects, valid same-tree ARIA references, container lifecycle и computed theme mirror до focus/reveal. T18 завершит neutral, slots, appearance и полную styling matrix. Текущие wrappers не заявлены готовыми реализациями этих контрактов.

Физические touch/AT и runtime matrix остаются открытыми. Известное T08 расхождение `az-Arab` Node/Chrome не исправлялось этим этапом и по-прежнему блокирует qualification соответствующего SSR profile. [T10 controller](t10-controller.md) реализован следующим private этапом; далее — T11.
