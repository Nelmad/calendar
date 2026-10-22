# T12 — DayAgenda и desktop focus cycle

27 сентября 2026. Private viewer `src/v02` теперь использует desktop non-modal popover и постоянный mobile inline region с одним общим содержимым. Публичный entry остаётся `0.1`; следующий этап — T13 package cutover.

## Реализация

- [DayAgendaBody](../../src/v02/calendar/DayAgendaBody.tsx) содержит heading/count и обычный semantic list. Каждая запись присутствует один раз, сохраняет title/source/полный interval и становится primary button только при `onItemPress`. Виртуализации нет; последний item в наборе из 1000 доступен клавиатурой. Close использует существующий IconButton с локализованным accessible name.
- [CalendarMonth](../../src/v02/calendar/CalendarMonth.tsx) разделяет accepted agenda date и pending user intent. Same-date open не вызывает callback; другой controlled target ждёт acceptance. Новая activation заменяет request и закрывает прежний popover. Escape, unrelated keyboard/pointer action, уход в toolbar или наружу отменяют поздний open/focus/announcement. Принятая внешняя дата обновляет существующее content без неявной навигации месяца.
- [NonModalPopover](../../src/v02/primitives/NonModalPopover.tsx) использует публичные React Aria `Overlay` и `useOverlayPosition`. Для них явно закреплён `react-aria@3.49.0` как private dev dependency; его перенос в обычные dependencies относится к T13. Package владеет non-modal focus lifecycle через документированный `disableFocusManagement` у Overlay, не через непубличные props RAC Popover. Default portal остаётся в root scope; same-document consumer Element/ShadowRoot поддержаны. При отсутствии date cell anchor становится Calendar root. Resize и scroll, в том числе внутри ShadowRoot, обновляют geometry.
- [Composed focus helpers](../../src/v02/calendar/focus.ts) обходят открытые shadow trees и assigned slots, учитывают local positive tabindex, radio group и скрытые/disabled/inert цели. Tab внутри списка следует native order; на границе popover закрывается, следующий/предыдущий control выбирается относительно trigger с исключённым overlay subtree. Если следующей цели нет, остаётся native выход за границу документа без отложенного возврата к trigger.
- Escape/close/blank outside press восстанавливают cell → roving → status → toolbar → root. Focusable outside press сохраняет выбранную внешнюю цель. Удалённый focused item восстанавливается по logical item/control key, затем по date; [controller](../../src/v02/calendar/useCalendarController.ts) учитывает portaled agenda при замене view на blocking status. Unmount не программирует focus.
- Trigger имеет `aria-haspopup`/`aria-expanded` только для desktop presentation. `aria-controls` существует только после mount connected endpoints в одном tree scope; cross-ShadowRoot reference не создаётся. Inline pointer update объявляется один раз через существующий polite host, если focus остаётся в Calendar вне agenda; keyboard focus и внешние prop updates этого объявления не дублируют.
- Принятие pending target одновременно с forced layout change использует новую presentation. При owned focus переключение inline ↔ popover сохраняет logical item без промежуточного переноса в grid. Выявленная браузером потеря ownership при обратном переходе зафиксирована в исходном прогоне (`evidence/t12/migration-before/browser.json`) и покрыта регрессией.

## Проверки

- **19 новых tests**: 15 React lifecycle/semantics и 4 composed-focus. Обновлены три прежних T11 ожидания initial focus: desktop теперь переводит focus в первый enabled control popover.
- Agenda Chrome report (`evidence/t12/verified-2026-09-27/browser.json`): **72/72 checks, ноль page errors**. Проверяет Document/ShadowRoot owners и local/body/отдельный ShadowRoot portal. Сценарии включают initial focus, Escape, logical Tab exit и document edge, outside targets, stale requests, blocking recovery, missing trigger/root anchor, 1000-item keyboard activation, resize/scroll и forced presentation migration. Сохранены RU/light и Arabic/RTL/dark screenshots.
- Регрессии: Month (`evidence/t12/month-regression/browser.json`) **36/36**, controller (`evidence/t12/controller-regression/browser.json`) **59/59**, foundation (`evidence/t12/foundation-regression/browser.json`) **108/108**, без page errors. Validation manifest (`evidence/validation-2026-09-27-t12/manifest.json`): **15 checks pass, 475 tests**, общие типы, reference TS 5.4.5/5.9.3, lint, builds и четыре host timezone. Reports фиксируют версии runtime и source hashes.

```sh
npm test -- src/v02/calendar/__tests__/agenda.test.tsx src/v02/calendar/__tests__/focus.test.ts
node scripts/implementation/agenda-probe.mjs /private/tmp/calendar-t12
node scripts/implementation/verify-foundation.mjs /private/tmp/calendar-t12-foundation
```

## Границы

T12 покрывает desktop popover и inline agenda. Измеряемый `layout="auto"`, mobile sheet и полная passive migration matrix — T15; nested menus/modal stacks, полное зеркалирование computed portal styles и дополнительные DOM-removal scenarios — T16. Actions/source controls и styling contracts — T17/T18. Selection/move остаются T20–T24. Manual screen-reader/physical-device qualification не подменяется Chrome AX/Playwright checks; native `az-Arab` SSR issue T08 остаётся открытым. Requirements ledger сохраняет частичный release scope как `in_progress`.
