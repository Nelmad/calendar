import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {mkdirSync, mkdtempSync, readFileSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, resolve} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {build} from 'vite';

const here = dirname(fileURLToPath(import.meta.url)), root = resolve(here, '../..');
const output = resolve(process.argv[2] ?? resolve(mkdtempSync(resolve(tmpdir(), 'calendar-projection-parity-')), 'runtime-parity.json'));
const directory = mkdtempSync(resolve(tmpdir(), 'calendar-projection-probe-'));
await build({configFile: false, logLevel: 'error', build: {outDir: directory, emptyOutDir: false, minify: true,
    lib: {entry: resolve(here, 'projection-entry.ts'), formats: ['es', 'cjs'], fileName: format => format === 'es' ? 'index.mjs' : 'index.cjs'},
}});
const esm = await import(pathToFileURL(resolve(directory, 'index.mjs')));
const cjs = createRequire(import.meta.url)(resolve(directory, 'index.cjs'));
const item = (id, interval) => ({id, title: id, data: null, interval});
const cases = [
    {name: 'Apia skipped date', items: [item('timed', {kind: 'timed', start: '2011-12-29T10:00:00Z', end: '2011-12-31T10:00:00Z'}), item('all', {kind: 'allDay', start: '2011-12-29', end: '2012-01-01'})], timeZone: 'Pacific/Apia', range: {start: '2011-12-26', end: '2012-01-23'}, agenda: ['2011-12-29', '2011-12-30', '2011-12-31'], expected: [['all', 'timed'], ['all'], ['all', 'timed']]},
    {name: 'Goose Bay disjoint local date', items: [item('reverse', {kind: 'timed', start: '1987-10-25T02:59:00Z', end: '1987-10-25T03:02:00Z'})], timeZone: 'America/Goose_Bay', range: {start: '1987-10-05', end: '1987-11-02'}, agenda: ['1987-10-24', '1987-10-25'], expected: [['reverse'], ['reverse']]},
    {name: 'Berlin DST gap', items: [item('gap', {kind: 'timed', start: '2026-03-28T23:00:00Z', end: '2026-03-29T22:00:00Z'})], timeZone: 'Europe/Berlin', range: {start: '2026-03-02', end: '2026-03-30'}, agenda: ['2026-03-28', '2026-03-29', '2026-03-30'], expected: [[], ['gap'], []]},
    {name: 'Upper ISO-domain tail', items: [item('tail', {kind: 'timed', start: '9999-12-31T00:00:00Z', end: '9999-12-31T23:59:59.999Z'})], timeZone: 'Asia/Tokyo', range: {start: '9999-11-01', end: '9999-12-06'}, agenda: ['9999-12-31'], expected: [['tail']]},
];
const nodeResults = cases.map(input => esm.runProjection(input));
const wall = (date, hour, minute = 0, second = 0, millisecond = 0) => ({date, hour, minute, second, millisecond});
const wallTimeCases = [
    {wall: wall('1971-01-01', 0, 0, 0, 123), timeZone: 'Africa/Monrovia', expected: '1971-01-01T00:44:30.123Z'},
    {wall: wall('1971-01-01', 12), timeZone: 'Africa/Monrovia', expected: '1971-01-01T12:44:30.000Z'},
    {wall: wall('1972-01-07', 0, 44, 29, 999), timeZone: 'Africa/Monrovia', expected: 'Local wall time is in a timezone gap'},
    {wall: wall('1972-01-07', 0, 44, 30), timeZone: 'Africa/Monrovia', expected: '1972-01-07T00:44:30.000Z'},
    {wall: wall('2026-03-29', 2, 30), timeZone: 'Europe/Berlin', expected: 'Local wall time is in a timezone gap'},
    {wall: wall('2026-10-25', 2, 30), timeZone: 'Europe/Berlin', expected: '2026-10-25T00:30:00.000Z'},
    {wall: wall('1987-10-25', 0), timeZone: 'America/Goose_Bay', expected: '1987-10-25T03:00:00.000Z'},
    {wall: wall('2026-04-05', 1, 45), timeZone: 'Australia/Lord_Howe', expected: '2026-04-04T14:45:00.000Z'},
    {wall: wall('2011-12-30', 10), timeZone: 'Pacific/Apia', expected: 'Local wall time is in a timezone gap'},
    {wall: wall('0001-01-01', 0), timeZone: 'UTC', expected: '0001-01-01T00:00:00.000Z'},
    {wall: wall('9999-12-31', 23, 59, 59, 999), timeZone: 'UTC', expected: '9999-12-31T23:59:59.999Z'},
];
const wallTimeResults = wallTimeCases.map(input => esm.runWallTime(input));
assert.deepEqual(wallTimeResults, wallTimeCases.map(input => input.expected), 'ESM wall-time oracle');
assert.deepEqual(wallTimeCases.map(input => cjs.runWallTime(input)), wallTimeResults, 'CJS wall-time oracle');
for (const [i, input] of cases.entries()) {
    assert.deepEqual(nodeResults[i].agenda.map(row => row.ids), input.expected, input.name);
    assert.deepEqual(cjs.runProjection(input), nodeResults[i], `CJS: ${input.name}`);
}
const {chromium} = await import('./spikes/node_modules/playwright/index.mjs');
const browser = await chromium.launch({channel: 'chrome', headless: true});
let browserVersion;
const browserContexts = [];
try {
    browserVersion = browser.version();
    for (const timezoneId of ['UTC', 'Africa/Monrovia']) {
        const context = await browser.newContext({timezoneId});
        try {
            const page = await context.newPage();
            const result = await page.evaluate(async ({url, cases, wallTimeCases}) => {
                const module = await import(url);
                return {timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                    projections: cases.map(input => module.runProjection(input)), wallTimes: wallTimeCases.map(input => module.runWallTime(input))};
            }, {url: 'data:text/javascript;base64,' + readFileSync(resolve(directory, 'index.mjs')).toString('base64'), cases, wallTimeCases});
            assert.equal(result.timeZone, timezoneId, 'Browser host timezone override');
            assert.deepEqual(result.projections, nodeResults, `Browser and server projection differ: ${timezoneId}`);
            assert.deepEqual(result.wallTimes, wallTimeResults, `Browser and server wall times differ: ${timezoneId}`);
            browserContexts.push({timeZone: timezoneId, projectionCases: cases.length, wallTimeCases: wallTimeCases.length, outcome: 'pass'});
        } finally { await context.close(); }
    }
} finally { await browser.close(); }
const report = {capturedAt: new Date().toISOString(), outcome: 'pass', node: process.version, icu: process.versions.icu, tz: process.versions.tz, browser: browserVersion,
    scope: 'Private T05/T07 ESM/CJS/Chrome core parity, including explicit browser host timezones. Not public packed package or complete support matrix.',
    sourceHashes: Object.fromEntries(['src/v02/core/projection.ts', 'src/v02/core/layout.ts', 'src/v02/core/date.ts', 'scripts/implementation/projection-entry.ts', 'scripts/implementation/projection-probe.mjs'].map(path => [path, createHash('sha256').update(readFileSync(resolve(root, path))).digest('hex')])),
    cases: cases.map((input, i) => ({name: input.name, input, result: nodeResults[i]})),
    wallTimeCases: wallTimeCases.map((input, i) => ({input, result: wallTimeResults[i]})), browserContexts,
};
mkdirSync(dirname(output), {recursive: true});
writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
console.log(`ESM/CJS/Chrome parity: ${cases.length} projection + ${wallTimeCases.length} wall-time cases, ${browserContexts.length} browser host zones passed; ${output}`);
