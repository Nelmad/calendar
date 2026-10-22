# T10 — private controller, data states и SSR

17 сентября 2026. Controller и shell реализованы в `src/v02/calendar`. Это внутренняя основа T11/T12: полноценные Month View и DayAgenda ещё не подключены; публичный entry остаётся `0.1`.

## Реализация

- [Pure transitions](../../src/v02/core/controller.ts) отделяют принятый месяц от navigation intent. Toolbar, grid и Today имеют разные focus/announcement gates; новый request заменяет прежний, mismatching acceptance становится внешним обновлением. Blocking/contract commit отменяет intent раньше acceptance. PageDown clamping не сохраняет скрытый предпочтительный номер дня, соседние даты внутри крайних допустимых grid остаются доступны.
- [Controller hook](../../src/v02/calendar/useCalendarController.ts) выполняет notifications и focus только после commit. Visible tuple `(start,end,timeZone)` использует общий [helper](../../src/v02/core/formatting.ts), дедуплицируется при StrictMode и смене identity callback; `A → B → A` даёт три notifications. Escape, unrelated keyboard/pointer action и уход focus отменяют navigation intent. Listener наблюдает Document и локальный ShadowRoot: focus events между его descendants могут не дойти до Document из-за retargeting.
- [CalendarShell](../../src/v02/calendar/CalendarShell.tsx) сохраняет controlled props и именованный region. Ready/empty, initial/refresh loading и initial/refresh error различаются явно; stale-content определяется валидным отфильтрованным пересечением с visible range. Default retry вызывает только consumer callback, custom error slot владеет своей кнопкой. Contract branch использует classic/mobile/compact/system, не вызывает item/toolbar resolvers и effectful notifications; root/status classes и `renderError` получают contract context. Исключения consumer resolvers не перехватываются рекурсивным error renderer.
- [Today](../../src/v02/calendar/useToday.ts) не читает часы при заданном snapshot. Без snapshot SSR/первый client render показывают неизвестную дату и disabled Today; post-hydration effect вычисляет дату в явной зоне. [Pure boundary calculation](../../src/v02/core/today.ts) находит конец содержащего now instant-диапазона локальной даты: DST, Monrovia и пропуск даты Apia не заменяются фиксированными `24h`. Timer и `visibilitychange` очищаются при смене режима/zone и unmount.
- Uncontrolled agenda пока хранит только дату: untouched fallback может принять post-hydration today; пользовательская дата и controlled дата не перезаписываются. Переключение controlled → uncontrolled сохраняет последнюю принятую дату. Open/acceptance и presentation принадлежат T12/T15.
- Root naming сохраняет резервный `aria-label` при SSR и первом client render. [Post-commit validation](../../src/v02/calendar/useRootName.ts) оставляет connected same-tree IDs с непустым name contribution и повторяется при DOM mutations. Missing/cross-tree/empty references не оставляют region без имени. В development diagnostics выводятся после commit с дедупликацией.
- Polite/urgent root hosts стабильны. Один committed semantic transition записывается одной child-list mutation с сохранёнными `lang`/bidi fragments. Toolbar acceptance и refresh completion не повторяются в StrictMode. Focus recovery направляет удалённый view в видимый blocking region и подавляет дублирующий live output; внешний focus и focus при unmount не перехватываются. Modal routing endpoints остаётся T16/T24.

## Проверки

Общий manifest (`evidence/validation-2026-09-17-t10/manifest.json`): **15 checks pass, 412 unit tests**. Новые 49 тестов: navigation/agenda kernel, пять exact date-boundary cases, React commit/focus/data-state/naming lifecycle и SSR purity/safe shell. Проверены lint, build/types, reference TS 5.4.5/5.9.3, Storybook и четыре host timezones. У package build сохраняется прежний warning о `@microsoft/api-extractor`.

Chrome report (`evidence/t10/verified/browser.json`): **36/36 checks, ноль page errors**. Production ESM/CJS SSR равен; en-US/ru-RU/ar с known/unknown today гидратируются без mismatch при немецком host locale. Document/ShadowRoot проверяют controlled toolbar/PageDown/Today, Tab cancellation, blocking и contract focus recovery, root IDREF removal, invalid enum/dataState SSR и unmount. Native observer подтверждает одну запись toolbar announcement и отсутствие повторной записи при том же принятом месяце.

Первый browser run (`evidence/t10/initial/browser.json`) дал **24/26**: Document listener не видел перемещения focus внутри ShadowRoot, из-за чего терялся owner удалённой cell. После local-scope listener — 26/26 (`evidence/t10/shadow-focus-fix/browser.json`); финальный report добавляет восемь safe-shell SSR scenarios, проверку contract focus recovery и два случая восстановления focus с Today, ставшей disabled при blocking loading.

Регрессия T09 (`evidence/t10/foundation-regression/browser.json`): **108/108**, включая long menu geometry, logical placement и nested RTL/LTR. Screenshot (`evidence/t10/verified/controller-fixture.png`) показывает диагностическую grid fixture, а не дизайн/semantics готового Month View.

```sh
npm test -- src/v02/calendar src/v02/core/__tests__/controller.test.ts src/v02/core/__tests__/today.test.ts
node scripts/implementation/controller-probe.mjs /private/tmp/calendar-t10
node scripts/implementation/verify-foundation.mjs /private/tmp/calendar-t10-foundation
```

## Исправления review — 19 сентября 2026

Закрыты все четыре P2 из [code review](review-t10-2026-09-19.md):

- При исчезновении loading/error/contract region либо retry control восстановление focus выбирает принятую roving cell; внешний focus сохраняется. Recovery выполняется и после возврата в ready, с учётом одновременно принятого месяца.
- Navigation kernel различает переход к дате и команду смены месяца. `navigateGridMonth` сохраняет источник intent `grid`, но PageUp/PageDown ждут acceptance даже для уже видимого target соседнего месяца. Стрелки и Today сохраняют прежнее поведение.
- Accessible labels сохраняют язык resolved message. Private ThemeRoot разделяет HTML `lang` именованного root и локаль React Aria/date scope; heading, RTL и consumer slots сохраняют свою локаль. Английские fallback и французские overrides больше не наследуют арабский язык ARIA labels.
- Root naming учитывает строки CSS `::before`/`::after`, escapes, `attr(...)` и альтернативный текст после `/`. URL не считается текстом. MutationObserver повторяет validation при изменении использованных attributes. Native Chrome AX name проверен отдельно в Document/ShadowRoot.

Актуальный manifest (`evidence/validation-2026-09-19-t10-review-fixes/manifest.json`): **15 checks pass, 434 tests** (22 дополнительных регрессии, всего 71 тест T10). Controller browser (`evidence/t10/review-fixes-2026-09-19/browser.json`): **59/59**, без page errors. Foundation regression (`evidence/t10/review-fixes-2026-09-19-foundation/browser.json`): **108/108**. Просмотрены screenshots узкой загрузки, RTL dark error и contract shell; geometry checks подтверждают отсутствие горизонтального overflow и минимум 44 px у toolbar buttons. Прежний warning declaration bundler остаётся.

Предупреждение declaration bundler затем [устранено отдельным исправлением](declaration-bundle-fix.md): build создаёт единый `index.d.ts` без warnings, оба consumer resolution modes проходят проверку с `skipLibCheck: false`.

## Границы

`renderView` — внутренний seam, а не новый public slot. [Fixture](../../src/v02/calendar/__tests__/fixture.tsx) только даёт controller DOM targets; она не реализует нормативный Month grid/agenda. T11 подключит полный Month, keyboard модель и measurements; T12 — agenda requests/open/focus. Auto layout пока использует SSR mobile baseline; post-hydration sizing/presentation migration — T15. Draft cleanup, nested overlay ownership и modal live routing — T16/T20–T24. Ledger evidence остаётся `in_progress` до интеграции соответствующих SDK сценариев.

T08 `az-Arab` native Intl mismatch, physical touch и полная browser/AT qualification остаются открытыми. Следующий этап — T11.

## Изменения после QA 2026-10-07 (группа QA-D)

[Группа QA-D](qa-fixes-2026-10-09.md#qa-d): `aria-busy` refresh-загрузки стоит на устаревшем содержимом
(`.nc-calendar-view`), а не на корне, поэтому root live regions вне busy-поддерева (QA-08). Refresh, который хост
начинает для месяца, только что принятого по Previous/Next, объявляется одним payload вместе с этим месяцем (месяц
первым), если после объявления не было другой записи и ввода пользователя. Статусы refresh и refresh error перекрывают
строку дней недели и не сдвигают сетку; блокирующие состояния сохраняют высоту сетки (`data-weeks`); области загрузки и
progressbar названы своим видимым текстом (QA-07).
