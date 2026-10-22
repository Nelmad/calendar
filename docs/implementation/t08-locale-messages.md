# T08 — locale, форматирование и сообщения

17 сентября 2026. Реализована private часть T08; интеграция с Calendar/portals и полная SSR/AT qualification ещё открыты. Обнаруженное native Intl расхождение `az-Arab` не засчитано как pass.

## Реализация

- [locale.ts](../../src/v02/core/locale.ts): default `ru-RU`, отдельная BCP 47 syntax validation, lookup-проверка поддержки DateTimeFormat и deterministic `en-US` fallback с одной pure diagnostic. Сохраняются поддержанные script/region/extensions. Locale Info читается через методы или прежние getters; явные props имеют приоритет. При отсутствии соответствующих данных действуют нормативные monday/24/ltr; hour-cycle дополнительно читается из formatter с явной поддержанной locale. Никакой host locale не используется для выбора fallback.
- [formatting.ts](../../src/v02/core/formatting.ts): Gregorian date-only labels через UTC, timed labels в явной зоне календаря; digits следуют locale/`u-nu`, cycles принудительно `h12`/`h23`. Range labels показывают последний включённый день, сохраняя exclusive данные. Private `getCalendarVisibleRange` валидирует input, строит 4–6 полных недель и поддерживает крайние anchor months. Его root export и использование в viewer появятся в T10/T13; текущий public API остаётся `0.1`.
- [catalogs.ts](../../src/v02/core/catalogs.ts): оба встроенных каталога содержат все **62** нормативных ключа `CalendarMessages`, включая pending, navigation/selection/move reasons и announcements. Generic mapped type сохраняет точные callback arguments; strings и fragments не создают interaction modes или notifications.
- [messages.ts](../../src/v02/core/messages.ts): независимый `messagesLocale`, partial overrides, проверка shape/пустого результата на каждой invocation. Неиспользованные resolvers не вызываются, consumer exceptions не перехватываются. Diagnostics возвращаются как данные; post-commit warning deduplication принадлежит controller T10. Snapshot helper сохраняет только исходную строку title, а blank title разрешается через актуальный `untitledItemLabel`; diagnostic вложенного fallback не теряется.
- [LocalizedText](../../src/v02/LocalizedText.tsx): текстовые fragments с отдельными `lang`/`dir`, bidi isolation и React escaping. Например, English fallback и французская дата не помечаются одним неверным языком. User titles не интерпретируются как HTML; неизвестный язык пользовательского текста обозначен `lang=""`, направление — `auto`. Для plain-text attributes подготовлена строка с Unicode isolate boundaries; per-fragment language доступен в markup. Literal text consumer override имеет объявленный `messagesLocale`; дословно вставленные title/source/reason выделяются в изолированные fragments. Подставленный `untitledItemLabel` сохраняет фактический язык своего override/fallback.
- Safe contract-error получает собственную deterministic language/direction цепочку. При отсутствии валидного `messagesLocale` каталог и root `lang` используют один resolved date locale, включая canonical aliases (`rus` → `ru`) и unsupported fallback. Malformed `messagesLocale` отключает связанные overrides; только разрешённый `invalidConfigurationLabel` override рассматривается в этой ветке. Другие consumer resolvers не вызываются.

Основание locale-info API — [TC39 Locale Info](https://tc39.es/proposal-intl-locale-info/); bidi markup следует [W3C inline bidi guidance](https://www.w3.org/International/articles/inline-bidi-markup/). Полные screen-reader и keyboard проверки остаются в T28.

## Проверки и найденная несовместимость

[79 locale/message unit tests](../../src/v02/core/__tests__) проверяют completeness относительно reference §5.7, plural forms, partial/blank overrides, raw title snapshots, malformed/grandfathered/private-use tags, script direction, safe error, h12/h23 midnight, Gregorian calendar/digits, 4/5/6-week ranges, domain edges и text-only SSR escaping. В их числе 17 regressions после двух проходов review. [Type fixtures](../../tests/contracts/0.2/messages.ts) проходят TS 5.4.5/5.9.3 в bundler/NodeNext, strict + exactOptionalPropertyTypes; они отклоняют неверные callback arguments, неизвестные keys и неполный built-in catalog.

Foundation manifest после исправлений review (`evidence/validation-2026-09-17-t08-review-fixes-final/manifest.json`): **15 checks pass**, **354 unit tests**. Date/projection/layout/locale/messages повторяются в четырёх отдельных host `TZ` с немецким host locale. Проверки включают lint, типы, source audits, сборку и Storybook. Прежний warning `@microsoft/api-extractor` остаётся ограничением будущего public release build. Предыдущий manifest T08 (`evidence/validation-2026-09-17-t08-final/manifest.json`) с 337 tests сохранён отдельно.

Native runtime report после исправлений (`evidence/t08/native-runtime-parity-review-fixes-final.json`) намеренно имеет **outcome=fail**, runner завершает работу с ненулевым кодом. Из 12 cases в каждом из двух Chrome contexts (`UTC` и `Africa/Monrovia`, host locale `de-DE`) прошли **22/24** сравнения model и hydration text. RU, EN, FR, AR, TH, Gregorian extensions, Arabic digits, h24, explicit week-start, unsupported fallback и `ar-Latn` совпали. Предыдущий полный отчёт (`evidence/t08/native-runtime-parity-final.json`) сохранён отдельно.

Оба failures — `az-Arab`: Node `24.20.0` / ICU `78.3` выдаёт `3 sen 2026`, Chrome `153.0.8010.48` — `2026 M09 3`; это также создаёт hydration errors. Одинаковые props/options не выравнивают различающиеся native locale data. Locale не исключена из API, outputs не подменены, mismatch не подавлен. **До квалификации этого SSR profile в T27 нужно выровнять locale data по §11.3 и повторить тот же fixture; текущая пара для `az-Arab` не имеет SSR pass.** Это не считается успешной полной compatibility matrix.

## Исправления после двух проходов review

Оба P2 воспроизведены: 17 новых tests до исправления падали (`evidence/t08/review-fixes-before.txt`). `contractMessages({locale: 'rus'})` теперь возвращает русский catalog и согласованный root `lang`; malformed `messagesLocale` по-прежнему отключает его overrides. Дополнительно проверено отсутствие поддержки русского в host `Intl`.

В callback overrides аргументы остаются исходными plain strings, resolver вызывается ровно один раз. После его вызова `messageFragments` находит все дословные вставки известных title/source/reason/local-time/offset значений и сохраняет их отдельные bidi boundaries. Совпадения ищутся без regular expressions; в одной позиции выбирается наиболее длинное. Пустой title получает актуальный fallback с его языком и diagnostic. Преобразованный самим callback текст, для которого исходное значение больше не встречается дословно, остаётся частью перевода: string-returning API не сохраняет происхождение произвольных преобразований; package не переисполняет resolver и не подменяет его аргументы маркерами.

Browser regression report (`evidence/t08/review-fixes-browser-final.json`): **20/20 visual cases**, ESM/CJS/Chrome models согласованы, ноль page errors. Проверяется реальный порядок glyphs для title с `U+202E`, повторов, source/reason и пустого title в LTR/RTL окружении, отдельно для `<bdi>` markup и Unicode-isolated plain strings. Alias cases `rus`, `rus-RU`, `RUS` с отсутствующим/malformed `messagesLocale` также проверены в Chrome. Это дополняет unit/SSR checks, не заменяя будущую AT qualification.

```sh
npm test -- src/v02/core/__tests__/locale.test.ts src/v02/core/__tests__/messages.test.tsx
npm run typecheck:contract
node scripts/implementation/verify-foundation.mjs /private/tmp/calendar-t08-foundation
node scripts/implementation/message-regressions.mjs /private/tmp/calendar-t08-message-regressions.json
node scripts/implementation/locale-probe.mjs /private/tmp/calendar-t08-native-parity.json
```

Последняя команда сохраняет все результаты, включая failures; при текущих native данных её ненулевой exit является ожидаемым воспроизведением открытого дефекта совместимости, а не разрешением игнорировать его при релизе.

Следующий независимый этап — T09 UI foundation. Полный Calendar, safe shell DOM, portal language propagation, post-commit diagnostics, реальное keyboard/AT поведение и lifecycle announcements подключаются в следующих задачах; базовые text fixtures не заменяют эти проверки.
