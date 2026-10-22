# T11 — semantic Month, sizing и overflow

19 сентября 2026. Реализован private Month поверх T10 controller. Публичный entry остаётся `0.1`; T13 переключает его отдельно. Для доступа ко всем событиям уже работает inline список дня; desktop popover и полный focus cycle остаются T12.

## Реализация

- [MonthView](../../src/v02/calendar/MonthView.tsx): chronological DOM с header/week rows, семью cells в каждой неделе, точными ARIA row/column indices и одним roving Tab-stop. Full-date name отделён от описания count/today/accepted selection/agenda date/overflow. Visual bars, chips, indicators и `+N` скрыты от accessibility tree и не становятся controls внутри composite grid.
- [Navigation/geometry helpers](../../src/v02/core/month.ts): стрелки учитывают RTL, Home/End сохраняют chronological начало/конец недели; PageUp/PageDown и Shift+PageUp/PageDown используют controlled month acceptance T10. Hit-test многодневной полосы использует реальные прямоугольники cells и её `segmentRange`; callback получает фактическую дату клика.
- [Measurement hook](../../src/v02/calendar/useMonthMeasurements.ts) наблюдает grid, week rows, date headers и probes через ResizeObserver; font loading и resize повторяют измерение. До валидного измерения, при скрытом/нулевом размере используются ноль lanes и полный `+N`. Измерения выполняются после commit; absolute item layer не влияет на intrinsic row size.
- [CSS](../../src/v02/styles.css) задаёт preferred week size из density/token, без зависимости от количества событий или только от высоты родителя. Definite root height из inline style либо external CSS распределяется между неделями; при недостатке места grid прокручивается внутри себя и сохраняет минимальную высоту date header/overflow. Fit T07 атомарно вычисляет целые lanes и скрытые counts. Продолжения полос используют logical corners для RTL.
- [Private CalendarMonth](../../src/v02/calendar/CalendarMonth.tsx) соединяет shell, Month и базовый inline список. Click/tap по `+N` и Enter на дате показывают все записи; pointer оставляет focus на cell, keyboard переводит его в heading. Controlled agenda request ждёт acceptance, external focus отменяет отложенный focus intent. Список не виртуализирован: доступна и активируется 1000-я запись. Без `onItemPress` запись читаемая, при callback — primary button. Timed interval показывает обе даты/время в Calendar timezone; пустой title сохраняет язык fallback message.

## Проверки

- **22 новых unit/React tests**: 11 navigation/geometry и 11 semantic Month/list. Включают 4/5/6 weeks, one Tab stop, selection attributes, RTL/page acceptance, pointer/Enter, repeated activation, delayed agenda acceptance, filter/order, timezone interval и язык пустого title.
- Chrome report (`evidence/t11/verified-2026-09-19/browser.json`): **36/36 checks, ноль page errors**, production ESM/CJS SSR parity и hydration `en-US`/`ru-RU`/`ar`, known/unknown today, Document/ShadowRoot. Измерены intrinsic и constrained rows, hidden/show recovery, внешняя высота, font-size 28px, обе density, 0/1/many lanes, target `+N ≥ 24×24`, отсутствие overlap/partial lanes и горизонтального page overflow. Проверены native AX grid, LTR/RTL segment hit, controlled navigation, touch-emulated tap и 1000-item reachability.
- Просмотрены desktop (`evidence/t11/verified-2026-09-19/document-desktop.png`), RTL dark (`evidence/t11/verified-2026-09-19/document-rtl-dark.png`), mobile 320px (`evidence/t11/verified-2026-09-19/document-mobile.png`) и constrained large font (`evidence/t11/verified-2026-09-19/document-large-font-constrained.png`). Это визуальные проверки текущей реализации в Chrome, без pixel-baseline release matrix.
- Общий manifest (`evidence/validation-2026-09-19-t11/manifest.json`): **15 checks pass, 456 tests**, lint, TypeScript, reference compiler matrix, build и Storybook; 208 core tests повторены под четырьмя host timezones. Первый Monrovia process достиг timeout 180 секунд без failed assertion; адресный повтор (`evidence/validation-2026-09-19-t11/date-host-timezone-4-recheck.txt`) прошёл, исходный log и первая попытка сохранены в manifest.
- Регрессии T10 controller (`evidence/t11/controller-regression/browser.json`) — **59/59**, T09 foundation (`evidence/t11/foundation-regression/browser.json`) — **108/108**, ноль page errors. Все reports фиксируют source hashes.

```sh
npm test -- src/v02/core/__tests__/month.test.ts src/v02/calendar/__tests__/month.test.tsx
node scripts/implementation/month-probe.mjs /private/tmp/calendar-t11
node scripts/implementation/verify-foundation.mjs /private/tmp/calendar-t11-foundation
```

## Границы этапа

T11 viewer baseline завершён. T12 ещё должен выделить presentation-neutral agenda body, добавить desktop popover, logical Tab exit, Escape/outside-press recovery и полный acceptance/focus lifecycle. Текущий desktop inline список служит доступом к items в private этапе, а не финальной desktop presentation.

`layout="auto"` пока сохраняет mobile fallback T10; измерение ширины/переключение presentation — T15. Consumer appearance/action resolvers, полный slots/classes contract — T17/T18; selection/move drafts и policy states — T20–T24. Shift-selection ещё не включена. Touch проверен эмуляцией Chrome; physical iOS/Android, browser/AT matrix и native `az-Arab` SSR qualification остаются открытыми. Requirements ledger хранит частичные этапы как `in_progress`, не как release pass.

## Изменения после QA 2026-10-07 (группа QA-D)

Часть фактов выше изменилась в [группе QA-D](qa-fixes-2026-10-09.md#qa-d):
- `+N` резервирует строку только в датах, где без неё items скрылись бы (QA-18); полоса через обе разновидности дат
  рисуется частями, обрезанные стороны помечены как продолжения. Продолжение не повторяет время начала, части у
  пропущенной даты (Apia) тоже продолжения.
- Измерение строк — computed CSS px (не `getBoundingClientRect`), по индексу строки; новая ревизия измеряется до
  отрисовки (layout effect), resize применяется внутри callback ResizeObserver (`flushSync`): каждый отрисованный кадр
  resize и навигации содержит свои lanes и `+N`. Comfortable density — 128px.
- Pointer-фокус ячейки не прокручивает страницу (QA-12); инструкции grid лежат вне `role=grid` (QA-19); строка дней
  недели sticky, forced desktop держит колонки от 64 px и прокручивается внутри grid; узкий chip скрывает время раньше
  заголовка. Кольцо фокуса ячейки — `::after` над items, сама ячейка не поднимается над ними (QA-06).
