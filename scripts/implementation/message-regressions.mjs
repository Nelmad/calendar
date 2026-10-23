import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {mkdtempSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, resolve} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {build} from 'vite';

const here = dirname(fileURLToPath(import.meta.url)), root = resolve(here, '../..');
const output = resolve(process.argv[2] ?? resolve(tmpdir(), 'calendar-message-regressions.json'));
const directory = mkdtempSync(resolve(tmpdir(), 'calendar-message-regressions-'));
await build({configFile: false, logLevel: 'error', define: {'process.env.NODE_ENV': '"production"'},
    build: {outDir: directory, minify: true, lib: {entry: resolve(here, 'locale-entry.ts'), formats: ['es', 'cjs'], fileName: format => format === 'es' ? 'index.mjs' : 'index.cjs'}}});
const esm = await import(pathToFileURL(resolve(directory, 'index.mjs'))), cjs = createRequire(import.meta.url)(resolve(directory, 'index.cjs'));
const expected = esm.messageRegressions();
assert.deepEqual(cjs.messageRegressions(), expected);
const {chromium} = await import('./spikes/node_modules/playwright/index.mjs');
const browser = await chromium.launch({channel: 'chrome', headless: true});
const results = [], failures = [];
const check = (name, operation) => {
    try { operation(); }
    catch (error) { failures.push({name, error: String(error)}); }
};
const browserVersion = browser.version();
try {
    for (const direction of ['ltr', 'rtl']) {
        const page = await browser.newPage({locale: 'de-DE', timezoneId: 'Africa/Monrovia'});
        const pageErrors = [];
        page.on('pageerror', error => pageErrors.push(String(error)));
        try {
            await page.setContent(`<main dir="${direction}" style="font: 20px monospace; white-space: pre"></main>`);
            const actual = await page.evaluate(async url => {
                const data = (await import(url)).messageRegressions();
                const visuals = [];
                for (const row of data.rows) for (const mode of ['markup', 'plain']) {
                    const container = document.createElement('div');
                    if (mode === 'markup') container.innerHTML = row.html;
                    else { container.dir = row.value.dir; container.textContent = row.value.text; }
                    document.querySelector('main').append(container);
                    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT), glyphs = [];
                    let node;
                    while ((node = walker.nextNode())) for (let index = 0; index < node.textContent.length; index++) {
                        const range = document.createRange();
                        range.setStart(node, index); range.setEnd(node, index + 1);
                        const bounds = range.getBoundingClientRect();
                        // The fixture is ASCII/French plus zero-width bidi controls.
                        if (bounds.width > 0) glyphs.push({character: node.textContent[index], left: bounds.left});
                    }
                    visuals.push({name: row.name, mode, text: glyphs.sort((a, b) => a.left - b.left).map(glyph => glyph.character).join(''), expected: row.expected});
                    container.remove();
                }
                return {data, visuals};
            }, 'data:text/javascript;base64,' + readFileSync(resolve(directory, 'index.mjs')).toString('base64'));
            check(`${direction}: Node/Chrome fragments`, () => assert.deepEqual(actual.data, expected));
            for (const row of actual.visuals) check(`${direction}: ${row.name}/${row.mode}`, () => assert.equal(row.text, row.expected));
            for (const shell of actual.data.shells) check(`${direction}: ${shell.locale}/${shell.malformedMessagesLocale}`, () => {
                assert.equal(shell.value.lang, 'ru-RU');
                assert.equal(shell.value.calendarLabel.lang, shell.value.lang);
                assert.equal(shell.value.invalidConfigurationLabel.lang, shell.value.lang);
            });
            check(`${direction}: page errors`, () => assert.deepEqual(pageErrors, []));
            results.push({direction, visuals: actual.visuals, shells: actual.data.shells, pageErrors});
        } finally { await page.close(); }
    }
} finally { await browser.close(); }
const paths = ['src/v02/core/locale.ts', 'src/v02/core/formatting.ts', 'src/v02/core/messages.ts', 'src/v02/core/catalogs.ts', 'src/v02/LocalizedText.tsx',
    'src/v02/core/__tests__/messages.test.tsx', 'scripts/implementation/locale-entry.ts', 'scripts/implementation/message-regressions.mjs'];
const report = {capturedAt: new Date().toISOString(), outcome: failures.length ? 'fail' : 'pass',
    scope: 'Two T08 review fixes: native visual bidi isolation in markup/plain strings, safe-shell language aliases; not full Calendar/AT qualification',
    node: process.version, icu: process.versions.icu, browser: browserVersion, results, failures,
    sourceHashes: Object.fromEntries(paths.map(path => [path, createHash('sha256').update(readFileSync(resolve(root, path))).digest('hex')]))};
mkdirSync(dirname(output), {recursive: true});
writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
console.log(`Message review regressions: ${report.outcome}; ${results.flatMap(row => row.visuals).length} visual cases; ${output}`);
if (failures.length) process.exitCode = 1;
