# T02 — автоматическая touch-проверка

8 сентября 2026. **24/24 scenarios pass**, browser page errors: 0. Проверка относится к private gesture/composition fixture; SDK move controller ещё не реализован.

## Окружение и evidence

Chrome `152.0.7977.82`, Playwright `1.55.1`, macOS; точный OS release и hashes исходников сохранены в отчёте (`evidence/t02/touch-2026-09-08-final/touch.json`). Viewport `390 × 844` и `412 × 844` CSS px, scale factor 3, mobile/touch flags. Ввод через CDP `Input.dispatchTouchEvent`: браузер сам выполняет hit-testing, native scrolling, capture и генерирует trusted pointer events. Это desktop touch emulation, не физический телефон.

Trace (`evidence/t02/touch-2026-09-08-final/touch-trace.zip`) и screenshot (`evidence/t02/touch-2026-09-08-final/touch-sheet.png`) сохранены. Первый прогон 22 scenarios (`evidence/t02/touch-2026-09-08-initial/touch.json`) оставлен отдельно; финальный дополняет проверку release вне grid и поведения scroll на ручке, а запись `request` теперь создаётся только при допустимом target, не при любом pointerup.

Проверены доступные устройства: `system_profiler SPUSBDataType` вернул пустой список; adb/Android SDK, Xcode/simctl и подключённый device-testing service недоступны. Поэтому real-device gate по §14 остаётся открытым, а iOS Safari, Android OS gesture handling и TalkBack/VoiceOver не объявлены проверенными.

## Проверенные сценарии

| Группа | Подтверждённое поведение |
| --- | --- |
| Tap | Primary tap активирует item один раз; короткий tap ручки не начинает draft и не оставляет таймер |
| Recognition | Small jitter допускает long press; движение дальше 8 CSS px до порога отменяет recognition, возврат пальца не запускает его заново |
| Native scroll | Свайп по основной части строки прокручивает dense agenda при обеих ширинах, не создаёт draft/activation и не прокручивает locked document |
| Modal handoff | Во всех четырёх сочетаниях document/ShadowRoot root и portal owner остаётся connected в том же portal scope; capture подтверждён до закрытия sheet; owner `aria-hidden`, без Tab-stop |
| Grid | После снятия inert/scroll lock focus переходит в initial gridcell; captured move попадает в целевую дату; pointerup даёт один request, без item activation |
| Cancel | `touchCancel` до/после handoff, второй палец, Escape, потеря capture и удаление исходного item не дают request; активный draft получает один cleanup |
| Failure/lifecycle | Ошибка `setPointerCapture` оставляет sheet открытой без draft; unmount очищает session; release вне grid не даёт request |
| Gesture area | Свайп, начатый на ручке, отменяет pending drag при превышении slop, но не прокручивает список; это явное следствие постоянного `touch-action: none` |

Capture failure проверяется явной fault injection. Origin removal/unmount вызываются тестовыми controls, остальные gesture sequences проходят через native browser touch input. Fixture считает requests и даты targets; не проверяет полный proposed interval, request history, policies, announcement router или touch no-drag UI будущего SDK.

## Кандидат gesture policy для T23

Выделенная визуальная ручка `44 × 44` CSS px с `touch-action: none`, без переключения CSS после начала жеста. Остальная строка и scroll container используют `pan-y pinch-zoom`. Long press — **450 ms**, допустимое движение до него — **8 CSS px**. Эти значения пока кандидатные; physical-device usability не подтверждена.

Нельзя одновременно обещать native pan с той же точки старта и произвольный drag после long press, просто изменив `touch-action` в таймере: браузер определяет допустимые действия для уже начавшегося жеста по начальному состоянию. Основание: [Pointer Events §8.2](https://www.w3.org/TR/pointerevents3/#determining-supported-direct-manipulation-behavior). В прототипе выбор области сделан заранее и проверен обоими сценариями — scroll на основной части строки и отсутствие scroll на ручке.

В T23 решение переносится в полный SDK с обязательным no-drag способом «Перенести → дата → Подтвердить/Отмена», общим focus/announcement controller и cancellation rules. Размеры/thresholds и OS callout/pinch/scroll поведение должны пройти реальные iOS/Android до закрытия соответствующего gate. Эмуляция это обязательство не снимает.

## Воспроизведение

После установки root и spike lockfiles, в двух терминалах из корня проекта:

```sh
npm run dev --prefix scripts/implementation/spikes
npm run touch --prefix scripts/implementation/spikes -- /private/tmp/calendar-touch-check
```

Первый процесс слушает только `127.0.0.1:4178`; runner открывает `/touch.html`. Optional output directory позволяет сохранять каждый повтор отдельно. Unit tests и SDK release build этот эксперимент не заменяет.
