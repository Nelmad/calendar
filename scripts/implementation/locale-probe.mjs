import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {mkdtempSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, resolve} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {build} from 'vite';

const here = dirname(fileURLToPath(import.meta.url)), root = resolve(here, '../..');
const output = resolve(process.argv[2] ?? resolve(tmpdir(), 'calendar-locale-parity.json'));
const directory = mkdtempSync(resolve(tmpdir(), 'calendar-locale-probe-'));
await build({configFile: false, logLevel: 'error', define: {'process.env.NODE_ENV': '"production"'},
    build: {outDir: directory, minify: true, lib: {entry: resolve(here, 'locale-entry.ts'), formats: ['es', 'cjs'], fileName: format => format === 'es' ? 'index.mjs' : 'index.cjs'}}});
const esm = await import(pathToFileURL(resolve(directory, 'index.mjs'))), cjs = createRequire(import.meta.url)(resolve(directory, 'index.cjs'));
const inputs = [{}, {locale: 'en-US'}, {locale: 'fr-FR', messages: {todayLabel: 'Aujourd’hui'}}, {locale: 'ar-SA-u-ca-islamic', messagesLocale: 'ru-RU'},
    {locale: 'th-TH-u-ca-buddhist'}, {locale: 'en-US-u-nu-arab-hc-h24'}, {locale: 'x-company'}, {locale: 'en-US-u-fw-tue'},
    {locale: 'ar-Latn'}, {locale: 'az-Arab'}, {locale: 'en-US', hourCycle: 12}, {locale: 'fr-FR', messages: {todayLabel: ' '}}];
const cases = inputs.map(input => ({input, model: esm.localeModel(input), html: esm.serverText(input)}));
for (const entry of cases) {
    assert.deepEqual(cjs.localeModel(entry.input), entry.model, 'CJS locale model');
    assert.equal(cjs.serverText(entry.input), entry.html, 'CJS localized markup');
}
const {chromium} = await import('./spikes/node_modules/playwright/index.mjs');
const browser = await chromium.launch({channel: 'chrome', headless: true});
const contexts = [];
const failures = [];
const check = (name, operation) => {
    try { operation(); return true; }
    catch (error) { failures.push({name, error: String(error)}); return false; }
};
const browserVersion = browser.version();
try {
    for (const timezoneId of ['UTC', 'Africa/Monrovia']) {
        const context = await browser.newContext({timezoneId, locale: 'de-DE'});
        try {
            const page = await context.newPage(), pageErrors = [];
            page.on('pageerror', error => pageErrors.push(String(error)));
            await page.setContent('<main id="probe"></main>');
            const actual = await page.evaluate(async ({url, cases}) => {
                const module = await import(url), results = [];
                for (const entry of cases) {
                    const container = document.getElementById('probe');
                    container.innerHTML = entry.html;
                    results.push({model: module.localeModel(entry.input), ...await module.hydrateText(entry.input, container)});
                }
                return {timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone, results};
            }, {url: 'data:text/javascript;base64,' + readFileSync(resolve(directory, 'index.mjs')).toString('base64'), cases});
            check(`Host timezone ${timezoneId}`, () => assert.equal(actual.timeZone, timezoneId));
            const results = [];
            for (let i = 0; i < cases.length; i++) {
                const before = failures.length;
                check(`Browser locale model ${i}/${timezoneId}`, () => assert.deepEqual(actual.results[i].model, cases[i].model));
                check(`Hydration ${i}/${timezoneId}`, () => assert.deepEqual(actual.results[i].errors, []));
                check(`Hydrated text ${i}/${timezoneId}`, () => assert.equal(actual.results[i].html, cases[i].html));
                results.push({input: cases[i].input, outcome: before === failures.length ? 'pass' : 'fail', actual: actual.results[i]});
            }
            check(`Page errors ${timezoneId}`, () => assert.deepEqual(pageErrors, []));
            contexts.push({timeZone: timezoneId, hostLocale: 'de-DE', results, pageErrors, outcome: results.every(row => row.outcome === 'pass') && !pageErrors.length ? 'pass' : 'fail'});
        } finally { await context.close(); }
    }
} finally { await browser.close(); }
const paths = ['src/v02/core/locale.ts', 'src/v02/core/formatting.ts', 'src/v02/core/messages.ts', 'src/v02/core/catalogs.ts', 'src/v02/LocalizedText.tsx', 'scripts/implementation/locale-entry.ts', 'scripts/implementation/locale-probe.mjs'];
const report = {capturedAt: new Date().toISOString(), outcome: failures.length ? 'fail' : 'pass', scope: 'Private T08 ESM/CJS/Chrome model and text hydration; mismatched native Intl cases block their SSR qualification. Not complete Calendar/AT or supported runtime matrix',
    node: process.version, icu: process.versions.icu, browser: browserVersion, contexts, cases, failures,
    sourceHashes: Object.fromEntries(paths.map(path => [path, createHash('sha256').update(readFileSync(resolve(root, path))).digest('hex')]))};
mkdirSync(dirname(output), {recursive: true});
writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
console.log(`Locale/text hydration parity: ${contexts.flatMap(row => row.results).filter(row => row.outcome === 'pass').length}/${cases.length * contexts.length} cases passed; ${output}`);
if (failures.length) process.exitCode = 1;
