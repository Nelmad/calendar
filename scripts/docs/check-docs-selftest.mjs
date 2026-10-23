import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

// Negative checks of the docs gate: each mutation of a temporary copy must fail exactly
// the named check, and the unmodified copy must pass. Nothing is written to the repository.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const both = (en, ru) => [en, ru];
const replace = (path, from, to) => ({path, from, to});
const cases = [
    {name: 'baseline', expect: [], edits: []},
    {name: 'missing language link', expect: ['mutual-language-links'], edits: [replace('README.ru.md', '[English](README.md) · ', '')]},
    {name: 'section only in English', expect: ['section-parity'], edits: [replace('docs/api.ru.md', '<a id="stability"></a>\n## Стабильность', '## Стабильность')]},
    {name: 'renamed anchor', expect: ['section-parity', 'api-coverage', 'relative-links'], edits: [replace('docs/api.ru.md', '<a id="prop-id"></a>', '<a id="prop-identifier"></a>')]},
    {name: 'translated code', expect: ['code-block-parity'], edits: [replace('docs/api.ru.md', 'function getCalendarVisibleRange(options', 'function getCalendarVisibleRange(opts')]},
    {name: 'stale quick start', expect: ['code-block-parity', 'tested-code-blocks'], edits: [replace('README.md', 'const [opened, setOpened]', 'const [open, setOpened]')]},
    {name: 'stale conversion file', expect: ['tested-code-blocks'], edits: [replace('examples/migration/convert.ts', 'Adds one calendar day', 'Adds a calendar day')]},
    {name: 'conversion type error', expect: ['tested-code-blocks'], edits: ['examples/migration/convert.ts', 'docs/migration-0.1-to-0.2.md', 'docs/migration-0.1-to-0.2.ru.md']
        .map(path => replace(path, "{kind: 'allDay', start, end: nextDay(last, event.end === undefined ? 'start' : 'end')}",
            "{kind: 'allDay', start, end: nextDay(last, event.end === undefined ? 'start' : 'end'), timeZone: 'UTC'}"))},
    {name: 'diverging Next.js quick start', expect: ['tested-code-blocks'], edits: [replace('examples/next/components/Schedule.tsx', "'use client';", "'use client';\n")]},
    {name: 'undocumented prop', expect: ['api-coverage', 'relative-links'], edits: both('docs/api.md', 'docs/api.ru.md').map(path => replace(path, '<a id="prop-sortitems"></a>\n### `sortItems`', '<a id="prop-sort"></a>\n### Sort'))},
    {name: 'undocumented export', expect: ['api-coverage'], edits: [replace('docs/api.ru.md', '### `CalendarHourCycle`', '### CalendarHourCycle')]},
    {name: 'missing message key', expect: ['api-coverage'], edits: [replace('docs/api.md', '`moveRejectedAnnouncement`. Their', 'moveRejectedAnnouncement. Their')]},
    {name: 'unavailable prop omitted', expect: ['documented-name-parity', 'api-coverage'], edits: [replace('docs/api.ru.md', ', `interactionPolicy` |', ' |')]},
    {name: 'unavailable prop presented as available', expect: ['surface-only'], edits: both('README.md', 'README.ru.md').map(path => replace(path, '`onItemPress`, ', '`onItemPress`, `selection`, '))},
    {name: 'unavailable prop in code', expect: ['surface-only'], edits: both('README.md', 'README.ru.md').map(path => replace(path, 'density="comfortable" colorScheme', 'density="comfortable" interactionPolicy={{}} colorScheme'))},
    {name: 'unknown layout in code', expect: ['surface-only'], edits: both('README.md', 'README.ru.md').map(path => replace(path, '<Calendar {...props} style={{blockSize: 480}}/>', '<Calendar {...props} layout="tablet" style={{blockSize: 480}}/>'))},
    {name: 'removed import in code', expect: ['no-removed-api-as-usable'], edits: both('README.md', 'README.ru.md')
        .map(path => replace(path, '```ts\ngetCalendarVisibleRange(', "```ts\nimport {getMonthGridRange} from '@nelmad/calendar';\ngetCalendarVisibleRange("))},
    {name: 'removed name in API prose', expect: ['no-removed-api-as-usable'], edits: [replace('docs/api.md', '| One record |', '| One record, formerly `CalendarEvent` |'),
        replace('docs/api.ru.md', '| Одна запись |', '| Одна запись, раньше `CalendarEvent` |')]},
    {name: 'removed stylesheet in code', expect: ['no-removed-api-as-usable'], edits: both('docs/migration-0.1-to-0.2.md', 'docs/migration-0.1-to-0.2.ru.md')
        .map(path => replace(path, 'const items = events.map', "import '@nelmad/calendar/tokens.css';\nconst items = events.map"))},
    {name: 'removed prop in code', expect: ['no-removed-api-as-usable'], edits: both('docs/migration-0.1-to-0.2.md', 'docs/migration-0.1-to-0.2.ru.md')
        .map(path => replace(path, '<Calendar items={items} timeZone=', '<Calendar items={items} utcOffset="+03:00" timeZone='))},
    {name: 'stale version', expect: ['version-and-status', 'prerelease-guides'], edits: [replace('package.json', '"version": "0.2.0-alpha.2"', '"version": "0.2.0-alpha.3"')]},
    {name: 'diverging Next.js workspace', expect: ['tested-code-blocks'], edits: [replace('examples/next/components/Workspace.tsx', "'use client';", "'use client';\n")]},
    {name: 'limitations without az-Arab', expect: ['prerelease-guides'], edits: [replace('README.ru.md', '`az`, `az-Arab`, `bs`', '`az`, `bs`')]},
    {name: 'no allowed/not-allowed slot example', expect: ['prerelease-guides'], edits: both('docs/api.md', 'docs/api.ru.md').map(path => replace(path, '// Not allowed: links', '// Avoid: links'))},
    {name: 'install without the workspace example', expect: ['prerelease-guides'], edits: [replace('README.md', 'Their\n`/workspace` route', 'Their\nworkspace route')]},
    {name: 'shipped prop described as future work in an example README', expect: ['examples-current-slice'],
        edits: [replace('examples/vite/README.md', '- **Theme and slots.**', '- `neutralTheme` and render slots arrive later in alpha.2.\n- **Theme and slots.**')]},
    // Review 2026-10-09-1: the displayed message table and the accepted time zone count.
    {name: 'rendered message missing from the displayed table', expect: ['api-coverage', 'displayed-messages'],
        edits: [replace('docs/api.md', '| `cancelLabel` | `string` | Cancel | Отмена |\n', '')]},
    {name: 'displayed message counted as not displayed', expect: ['displayed-messages'], edits: [replace('docs/api.ru.md', 'Остальные 34 ключа', 'Остальные 39 ключей')]},
    {name: 'UTC added to the time zone count', expect: ['time-zone-count'],
        edits: [replace('README.md', "accepted list: 445 primary identifiers of tzdb 2026c,\n  `UTC` included,", "accepted list: `UTC` plus 445 primary identifiers of\n  tzdb 2026c,")]},
    {name: 'broken anchor link', expect: ['relative-links'], edits: [replace('README.md', '(docs/api.md#tokens)', '(docs/api.md#token)')]},
    {name: 'broken file link', expect: ['relative-links'], edits: [replace('docs/api.ru.md', '(implementation/timezones-candidate.ru.md)', '(implementation/timezones.ru.md)')]},
];

// `src` and the generated time zone list feed the displayed-messages and time-zone-count checks; the guides link CI, the release workflow and RELEASING.md.
const copied = ['.github/workflows/ci.yml', '.github/workflows/release.yml', 'RELEASING.md', 'README.md', 'README.ru.md', 'CHANGELOG.md', 'LICENSE', 'package.json', 'dist/index.d.ts', 'dist/v02/core/timeZones.generated.js', 'src', 'scripts/docs', 'stories', 'examples/migration',
    'docs/api.md', 'docs/api.ru.md', 'docs/migration-0.1-to-0.2.md', 'docs/migration-0.1-to-0.2.ru.md', 'docs/api', 'docs/implementation/timezones-candidate.en.md',
    'docs/implementation/timezones-candidate.ru.md', 'docs/implementation/timezones-candidate.json', 'docs/implementation/t19-alpha2-acceptance.md', 'examples/vite', 'examples/next'];
const skipped = /(?:^|\/)(?:node_modules|\.next|dist|dist-server)(?:\/|$)/;
const results = [];
for (const testCase of cases) {
    const work = mkdtempSync(join(tmpdir(), 'nelmad-calendar-docs-selftest-'));
    try {
        for (const path of copied) {
            cpSync(resolve(root, path), join(work, path), {recursive: true, filter: source => !skipped.test(source.slice(resolve(root, path).length))});
        }
        symlinkSync(resolve(root, 'node_modules'), join(work, 'node_modules'));
        for (const {path, from, to} of testCase.edits) {
            const file = join(work, path), text = readFileSync(file, 'utf8');
            assert.ok(text.includes(from), `${testCase.name}: ${path} does not contain the text to mutate`);
            writeFileSync(file, text.replace(from, to));
        }
        const report = join(work, 'report.json');
        const run = spawnSync(process.execPath, [join(work, 'scripts/docs/check-docs.mjs'), '--output', report], {encoding: 'utf8'});
        assert.ok(existsSync(report), `${testCase.name}: the gate crashed\n${run.stdout}${run.stderr}`);
        const failed = JSON.parse(readFileSync(report, 'utf8')).checks.filter(check => check.outcome === 'fail').map(check => check.name).sort();
        const outcome = JSON.stringify(failed) === JSON.stringify([...testCase.expect].sort()) && (run.status === 0) === !testCase.expect.length ? 'pass' : 'fail';
        results.push({name: testCase.name, expectedFailures: testCase.expect, actualFailures: failed, exitCode: run.status, outcome});
        console.log(`${testCase.name}: ${outcome.toUpperCase()} (failed: ${failed.join(', ') || 'none'})`);
    } finally {
        rmSync(work, {recursive: true, force: true});
    }
}
const outputIndex = process.argv.indexOf('--output');
if (outputIndex > 0) {
    const output = resolve(process.argv[outputIndex + 1]);
    mkdirSync(dirname(output), {recursive: true});
    writeFileSync(output, JSON.stringify({generatedAt: new Date().toISOString(), node: process.version, results}, null, 2) + '\n');
}
if (results.some(result => result.outcome === 'fail')) process.exitCode = 1;
