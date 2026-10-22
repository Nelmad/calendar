# Исправление declaration bundle — 19 сентября 2026

Устранено предупреждение `Failed to load '@microsoft/api-extractor'`. В Vite был включён `bundleTypes: true`, но optional peer сборщика не был установлен: plugin пропускал объединение declarations и завершал build успешно.

Добавлена прямая devDependency `@microsoft/api-extractor` (lockfile: 7.59.1). Теперь сборка создаёт один `dist/index.d.ts`. В `scripts/verify-dist.mjs` добавлена проверка непустых, синтаксически корректных declarations и отсутствия относительных type imports/re-exports, чтобы пропуск bundling больше не проходил незаметно.

Проверено:

- `npm run build` проходит без предупреждений; JS/CSS dist verification проходит.
- `npm run typecheck` проходит.
- Собранный `index.d.ts` проверен TypeScript 5.9.3 в режимах `bundler` и `NodeNext`, `strict: true`, `skipLibCheck: false`.
- Все 24 публичных экспорта declarations сохранены относительно состояния до исправления.
- Негативная проверка: временно подставленный unbundled entry с относительным re-export отклонён `verify-dist`; исходный bundle восстановлен и повторно проверен.

Build log (`evidence/declaration-bundle-2026-09-19/build.txt`), результаты проверок (`evidence/declaration-bundle-2026-09-19/checks.json`). Исторические логи с предупреждением сохранены. Это исправление сборки текущего API 0.1; cutover 0.2 и его release qualification остаются отдельными этапами.
