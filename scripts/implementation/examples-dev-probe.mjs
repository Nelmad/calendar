import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, resolve} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {build} from 'vite';

// T19-V1-02 real-Chrome probe: the documented example routes (/, /quick-start, /workspace) in development mode, where the
// SDK reports contract problems with console warnings; packed consumers and the acceptance run production builds, where
// those warnings are silent. Server render (development bundle in Node) + StrictMode hydration in system Chrome; the
// /workspace route is driven in the document and in its ShadowRoot mode on desktop and on a touch phone. Any SDK
// diagnostic, console warning or error, page error or recoverable hydration error fails the run, except the one documented
// warning of /workspace (items[5].calendarId): it shows an item with an unknown calendarId on purpose (fail-open, docs/api.md#items).
// Usage: node scripts/implementation/examples-dev-probe.mjs <outputDir>
const here = dirname(fileURLToPath(import.meta.url)), root = resolve(here, '../..');
const output = resolve(process.argv[2] ?? resolve(tmpdir(), 'calendar-examples-dev'));
mkdirSync(output, {recursive: true});
const directory = mkdtempSync(resolve(tmpdir(), 'calendar-examples-dev-'));
await build({configFile: false, logLevel: 'error', define: {'process.env.NODE_ENV': '"development"'}, mode: 'development',
    resolve: {dedupe: ['react', 'react-dom'], alias: [{find: /^@nelmad\/calendar$/, replacement: resolve(root, 'src/index.ts')},
        {find: /^@nelmad\/calendar\/styles\.css$/, replacement: resolve(root, 'src/v02/styles.css')}]},
    build: {outDir: directory, minify: false, lib: {entry: resolve(here, 'examples-dev-entry.tsx'), formats: ['es'], fileName: () => 'index.mjs'}}});
// Server-side SDK diagnostics go to the Node console while the routes render.
const serverMessages = [], original = {warn: console.warn, error: console.error};
console.warn = (...args) => serverMessages.push(`warn: ${args.join(' ')}`); console.error = (...args) => serverMessages.push(`error: ${args.join(' ')}`);
const esm = await import(pathToFileURL(resolve(directory, 'index.mjs')));
const routes = {};
try { for (const path of ['/', '/quick-start', '/workspace']) routes[path] = await esm.render(path); } finally { Object.assign(console, original); }
const moduleUrl = 'data:text/javascript;base64,' + readFileSync(resolve(directory, 'index.mjs')).toString('base64');
const css = readFileSync(resolve(root, 'src/v02/styles.css'), 'utf8') + '\n' + readFileSync(resolve(root, 'examples/vite/src/app.css'), 'utf8');
const {chromium} = await import('./spikes/node_modules/playwright/index.mjs');
const browser = await chromium.launch({channel: 'chrome', headless: true});
const checks = [], errors = [], consoleMessages = [], expectedDiagnostics = [], version = browser.version();
const documented = '[@nelmad/calendar] items[5].calendarId: No source with ID "archive-2025"; items with this calendarId remain visible with fallback appearance';
const check = async (name, operation) => {
    try { const details = await operation(); checks.push({name, outcome: 'pass', ...(details ? {details} : {})}); }
    catch (error) { checks.push({name, outcome: 'fail', error: String(error?.stack ?? error)}); }
    writeFileSync(resolve(output, 'checks.json'), JSON.stringify(checks, null, 2) + '\n');
    console.log(`${checks.at(-1).outcome}: ${name}${checks.at(-1).error ? '\n' + checks.at(-1).error : ''}`);
};
const settle = page => page.evaluate(async () => { for (let i = 0; i < 6; i++) await new Promise(requestAnimationFrame); });
const viewports = {desktop: {viewport: {width: 1280, height: 900}}, phone: {viewport: {width: 390, height: 844}, isMobile: true, hasTouch: true}};
/** Opens one route with its server HTML and hydrates it; console messages of every check are kept with their route. */
async function open(path, kind) {
    const context = await browser.newContext({...viewports[kind], locale: 'ru-RU', timezoneId: 'Europe/Moscow'});
    const page = await context.newPage(), label = `${kind} ${path}`;
    page.setDefaultTimeout(5000);
    page.on('pageerror', error => errors.push(`${label}: ${error}`));
    page.on('console', message => {
        if (!['warning', 'error'].includes(message.type()) && !message.text().includes('[@nelmad/calendar]')) return;
        (path === '/workspace' && message.type() === 'warning' && message.text() === documented ? expectedDiagnostics : consoleMessages).push(`${label} ${message.type()}: ${message.text()}`);
    });
    const {html, prefetch} = routes[path];
    await page.setContent(`<!doctype html><html lang="ru"><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>${css}</style></head><body><div id="app">${html}</div></body></html>`);
    await page.evaluate(async ({moduleUrl, path, prefetch}) => {
        const module = await import(moduleUrl);
        window.recoverable = module.hydrateExample(document.getElementById('app'), path, prefetch ?? undefined);
    }, {moduleUrl, path, prefetch: prefetch ?? null});
    // hydrateRoot only schedules hydration, so the errors array is read live, never before the commit has set the flag.
    await page.locator('html[data-hydrated=true]').waitFor({state: 'attached'}); await settle(page);
    return {context, page, recoverable: () => page.evaluate(() => window.recoverable)};
}
const rootName = locator => locator.evaluate(node => [node.getAttribute('aria-label'), node.getAttribute('aria-labelledby')]);
const inShadow = locator => locator.evaluate(node => node.getRootNode() instanceof ShadowRoot);
try {
    await check('desktop-release-demo', async () => {
        const {context, page, recoverable} = await open('/', 'desktop');
        await page.locator('.nc-calendar[data-layout=desktop]').waitFor();
        assert.deepEqual(await rootName(page.locator('.nc-calendar')), ['Календарь', 'release-title']);
        await page.locator('[role=gridcell][data-date="2026-09-03"]').focus(); await page.keyboard.press('Enter'); await page.getByRole('dialog').waitFor();
        await page.keyboard.press('Escape'); await page.getByRole('dialog').waitFor({state: 'hidden'});
        await page.screenshot({path: resolve(output, 'desktop-release-demo.png')});
        assert.deepEqual(await recoverable(), []); await context.close();
    });
    await check('desktop-quick-start', async () => {
        const {context, page, recoverable} = await open('/quick-start', 'desktop');
        await page.locator('.nc-month-item[data-item-id=standup]').click();
        assert.equal(await page.locator('#opened').innerText(), 'Стендап: 301');
        assert.deepEqual(await recoverable(), []); await context.close();
    });
    await check('desktop-workspace-document-and-shadow-root', async () => {
        const {context, page, recoverable} = await open('/workspace', 'desktop');
        await page.locator('.nc-calendar[data-layout=desktop]').waitFor();
        const names = {document: await rootName(page.locator('.nc-calendar'))};
        await page.locator('[role=gridcell][data-date="2026-09-03"]').focus(); await page.keyboard.press('Enter'); await page.getByRole('dialog').waitFor();
        await page.locator('[role=dialog] [data-item-id=triage] [data-agenda-control=actions]').focus(); await page.keyboard.press('Enter');
        await page.getByRole('menu').waitFor(); await page.keyboard.press('Escape'); await page.keyboard.press('Escape'); await page.getByRole('dialog').waitFor({state: 'hidden'});
        await page.locator('[data-source-selector]').click(); await page.getByRole('menuitemcheckbox').first().click();
        await page.locator('#workspace-saving', {hasText: 'Фильтр сохранён'}).waitFor(); await page.keyboard.press('Escape');
        await page.getByRole('button', {name: 'Просторно'}).click();
        await page.getByLabel('В ShadowRoot').check();
        const cell = page.locator('.workspace-shadow [role=gridcell][data-date="2026-09-03"]'); await cell.waitFor(); await settle(page);
        assert.equal(await inShadow(cell), true);
        // In the document the IDREF names the region (it wins over the fallback aria-label); in the ShadowRoot the
        // light-DOM heading is out of reach, so the example passes aria-label and no IDREF.
        names.shadow = await rootName(page.locator('.workspace-shadow .nc-calendar'));
        await cell.focus(); await page.keyboard.press('Enter'); await page.getByRole('dialog').waitFor();
        assert.equal(await inShadow(page.getByRole('dialog')), true, 'the agenda is portaled into the ShadowRoot');
        await page.keyboard.press('Escape'); await page.getByRole('dialog').waitFor({state: 'hidden'});
        await page.screenshot({path: resolve(output, 'desktop-workspace-shadow.png'), fullPage: true});
        await page.getByLabel('В ShadowRoot').uncheck(); await page.locator('.workspace > .nc-calendar').waitFor(); await settle(page);
        names.back = await rootName(page.locator('.nc-calendar'));
        assert.deepEqual(names, {document: ['Календарь', 'workspace-title'], shadow: ['Рабочее пространство', null], back: ['Календарь', 'workspace-title']},
            'the calendar keeps the page name in both tree scopes');
        assert.deepEqual(await recoverable(), []); await context.close();
        return {names};
    });
    await check('phone-workspace-sheet-and-shadow-root', async () => {
        const {context, page, recoverable} = await open('/workspace', 'phone');
        await page.locator('.nc-calendar[data-layout=mobile] [data-presentation=inline]').waitFor();
        await page.getByLabel('Повестка на телефоне').selectOption('overlay');
        await page.locator('[role=gridcell][data-date="2026-09-03"]').tap(); await page.locator('[data-presentation=sheet]').waitFor();
        await page.keyboard.press('Escape'); await page.locator('[data-presentation=sheet]').waitFor({state: 'detached'});
        await page.getByLabel('В ShadowRoot').check();
        const cell = page.locator('.workspace-shadow [role=gridcell][data-date="2026-09-03"]'); await cell.waitFor(); await settle(page);
        const name = await rootName(page.locator('.workspace-shadow .nc-calendar'));
        assert.deepEqual(name, ['Рабочее пространство', null]);
        await cell.tap(); const sheet = page.locator('[data-presentation=sheet]'); await sheet.waitFor();
        assert.equal(await inShadow(sheet), true, 'the sheet is portaled into the ShadowRoot');
        await page.screenshot({path: resolve(output, 'phone-workspace-shadow-sheet.png')});
        await page.keyboard.press('Escape'); await sheet.waitFor({state: 'detached'});
        assert.deepEqual(await recoverable(), []); await context.close();
        return {name};
    });
} finally { await browser.close(); }
const sourcePaths = ['scripts/implementation/examples-dev-entry.tsx', 'scripts/implementation/examples-dev-probe.mjs',
    ...['App.tsx', 'entry-server.tsx', 'main.tsx', 'Schedule.tsx', 'ReleaseCalendar.tsx', 'releaseData.ts', 'Workspace.tsx', 'app.css'].map(name => `examples/vite/src/${name}`),
    'examples/next/components/Workspace.tsx', 'src/index.ts', 'src/Calendar.tsx', 'src/v02/surface.ts', 'src/v02/calendar/dom.ts', 'src/v02/calendar/useRootName.ts',
    'src/v02/calendar/CalendarShell.tsx', 'src/v02/styles.css', 'package.json', 'package-lock.json', 'scripts/implementation/spikes/package-lock.json'];
const report = {capturedAt: new Date().toISOString(), outcome: checks.length === 4 && checks.every(c => c.outcome === 'pass') && !errors.length && !consoleMessages.length
    && !serverMessages.filter(message => message !== `warn: ${documented}`).length && expectedDiagnostics.length > 0 ? 'pass' : 'fail',
    node: process.version, browser: version, react: 'bundled from the root lockfile, development build',
    vite: JSON.parse(readFileSync(resolve(root, 'node_modules/vite/package.json'), 'utf8')).version,
    playwright: JSON.parse(readFileSync(resolve(here, 'spikes/node_modules/playwright/package.json'), 'utf8')).version,
    checks, errors, consoleMessages, expectedDiagnostics, serverMessages,
    scope: 'Development-mode run of the documented example routes (/, /quick-start, /workspace) with @nelmad/calendar aliased to the source facade: server render in Node and StrictMode hydration in Chrome; /workspace in the document and in its ShadowRoot mode (agenda popover, item menu, delayed source filter, density extension on desktop; sheet in the ShadowRoot on a touch phone). Fails on any SDK diagnostic, console warning or error, page error or recoverable hydration error, except the documented items[5].calendarId warning of /workspace (its fail-open item with an unknown calendarId; expectedDiagnostics). The Next copy of Workspace.tsx is byte-identical (check:docs). Not a probe of record for an R row.',
    sourceHashes: Object.fromEntries(sourcePaths.map(path => [path, existsSync(resolve(root, path)) ? createHash('sha256').update(readFileSync(resolve(root, path))).digest('hex') : 'missing']))};
writeFileSync(resolve(output, 'browser.json'), JSON.stringify(report, null, 2) + '\n');
console.log(`Examples (development): ${checks.filter(c => c.outcome === 'pass').length}/${checks.length}; ${errors.length} page errors; ${consoleMessages.length} unexpected console messages; ${expectedDiagnostics.length} documented diagnostics; ${serverMessages.length} server messages; ${output}`);
if (report.outcome === 'fail') process.exitCode = 1;
