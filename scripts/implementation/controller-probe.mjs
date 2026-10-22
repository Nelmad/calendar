import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {mkdtempSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, resolve} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {build} from 'vite';

const here = dirname(fileURLToPath(import.meta.url)), root = resolve(here, '../..');
const output = resolve(process.argv[2] ?? resolve(tmpdir(), 'calendar-controller'));
mkdirSync(output, {recursive: true});
const directory = mkdtempSync(resolve(tmpdir(), 'calendar-controller-'));
await build({configFile: false, logLevel: 'error', define: {'process.env.NODE_ENV': '"production"'},
    build: {outDir: directory, minify: true, lib: {entry: resolve(here, 'controller-entry.tsx'), formats: ['es', 'cjs'], fileName: format => format === 'es' ? 'index.mjs' : 'index.cjs'}}});
const esm = await import(pathToFileURL(resolve(directory, 'index.mjs'))), cjs = createRequire(import.meta.url)(resolve(directory, 'index.cjs'));
const moduleUrl = 'data:text/javascript;base64,' + readFileSync(resolve(directory, 'index.mjs')).toString('base64');
const css = readFileSync(resolve(root, 'src/v02/styles.css'), 'utf8');
const {chromium} = await import('./spikes/node_modules/playwright/index.mjs');
const browser = await chromium.launch({channel: 'chrome', headless: true});
const checks = [], errors = [], version = browser.version();
const check = async (name, operation) => {
    try { const details = await operation(); checks.push({name, outcome: 'pass', ...(details ? {details} : {})}); }
    catch (error) { checks.push({name, outcome: 'fail', error: String(error)}); }
    writeFileSync(resolve(output, 'checks.json'), JSON.stringify(checks, null, 2) + '\n');
    console.log(`${checks.at(-1).outcome}: ${name}`);
};
const settle = page => page.evaluate(async () => { for (let i = 0; i < 4; i++) await new Promise(requestAnimationFrame); });
const patch = async (page, props) => { await page.evaluate(props => window.controller.patch(props), props); await settle(page); };
const focused = page => page.evaluate(() => { let node = document.activeElement; while (node?.shadowRoot?.activeElement) node = node.shadowRoot.activeElement;
    // A loading region is named by its visible text (QA-07): the label is aria-label or the text of aria-labelledby.
    const named = node?.getAttribute('aria-labelledby')?.split(' ').map(id => node.getRootNode().getElementById(id)?.textContent).join(' ');
    return {date: node?.getAttribute('data-date'), text: node?.textContent, label: node?.getAttribute('aria-label') ?? named ?? null, id: node?.id, status: !!node?.classList.contains('nc-calendar-status')}; });
async function setup(shadow, options = {}) {
    const context = await browser.newContext({viewport: {width: 900, height: 700}, locale: 'de-DE'}), page = await context.newPage();
    page.setDefaultTimeout(4000);
    page.on('pageerror', error => errors.push(String(error)));
    const server = esm.serverController(options); assert.deepEqual(cjs.serverController(options), server); assert.deepEqual(server.events, []);
    await page.setContent('<button id="outside">Outside</button><span id="external-label">External</span><div id="owner"></div>');
    await page.evaluate(async ({shadow, moduleUrl, css, server, options}) => {
        window.clockNow = Date.parse('2026-01-17T12:00:00Z'); window.clockReads = 0;
        Date.now = () => { window.clockReads++; return window.clockNow; };
        const host = document.getElementById('owner'), scope = shadow ? host.attachShadow({mode: 'open'}) : host;
        const style = document.createElement('style'); style.textContent = css + '\n[role=grid] {display:grid;grid-template-columns:repeat(7,1fr);gap:2px} [role=gridcell]{padding:8px;border:1px solid gray} [role=gridcell]:focus{outline:2px solid blue}';
        scope.append(style);
        const label = document.createElement('span'); label.id = 'own-label'; label.textContent = 'Project'; scope.append(label);
        const container = document.createElement('div'); container.innerHTML = server.html; scope.append(container);
        const module = await import(moduleUrl);
        window.controller = await module.hydrateController(container, options);
        window.scope = scope;
        window.liveMutations = [];
        window.liveObserver = new MutationObserver(records => { for (const record of records) if (record.type === 'childList') window.liveMutations.push(record.target.textContent); });
        window.liveObserver.observe(scope.querySelector('[role=status]'), {childList: true});
    }, {shadow, moduleUrl, css, server, options});
    await settle(page);
    return {page, context, server};
}
try {
    for (const shadow of [false, true]) {
        const label = shadow ? 'shadow' : 'document';
        for (const locale of ['en-US', 'ru-RU', 'ar']) for (const unknownToday of [false, true]) {
            await check(`${label}: SSR ${locale}, unknownToday=${unknownToday}`, async () => {
                const {page, context, server} = await setup(shadow, {locale, unknownToday});
                try {
                    assert.deepEqual(await page.evaluate(() => window.controller.errors), []);
                    assert.deepEqual(await page.evaluate(() => window.controller.events), [{type: 'range', value: server.range}]);
                    assert.equal(await page.locator('[data-testid=today]').textContent(), unknownToday ? '2026-01-17' : '2026-02-14');
                    if (!unknownToday) assert.equal(await page.evaluate(() => window.clockReads), 0);
                } finally { await context.close(); }
            });
        }
        for (const prop of ['layout', 'density', 'colorScheme', 'dataState']) {
            await check(`${label}: safe SSR shell for invalid ${prop}, then recovery`, async () => {
                const {page, context} = await setup(shadow, {[prop]: 'invalid'});
                try {
                    assert.deepEqual(await page.evaluate(() => window.controller.errors), []);
                    assert.deepEqual(await page.evaluate(() => window.controller.events), []);
                    const attributes = await page.locator('.nc-calendar').evaluate(node => ({theme: node.dataset.theme, layout: node.dataset.layout,
                        density: node.dataset.density, scheme: node.dataset.colorScheme, status: node.dataset.status, phase: node.dataset.loadingPhase}));
                    assert.deepEqual(attributes, {theme: 'classic', layout: 'mobile', density: 'compact', scheme: 'system', status: 'error', phase: undefined});
                    assert.equal(await page.getByRole('button', {name: 'Today', exact: true}).count(), 0);
                    await patch(page, {layout: 'auto', density: 'compact', colorScheme: 'system', dataState: {status: 'ready'}});
                    assert.equal(await page.getByRole('grid').count(), 1);
                    assert.equal(await page.evaluate(() => window.controller.events.filter(event => event.type === 'range').length), 1);
                } finally { await context.close(); }
            });
        }
        for (const [month, date, key, accepted, target] of [
            ['2026-03-01', '2026-03-01', 'PageDown', '2026-04-01', '2026-04-01'],
            ['2026-04-01', '2026-04-30', 'PageUp', '2026-03-01', '2026-03-30'],
        ]) await check(`${label}: ${key} requests a month with an already-visible target`, async () => {
            const {page, context} = await setup(shadow, {anchorDate: month});
            try {
                await page.getByRole('gridcell', {name: date}).focus(); await page.keyboard.press(key); await settle(page);
                assert.equal((await focused(page)).date, date);
                assert.deepEqual(await page.evaluate(() => window.controller.events.filter(event => event.type === 'navigate')), [{type: 'navigate', value: accepted}]);
                await patch(page, {anchorDate: accepted}); assert.equal((await focused(page)).date, target);
                assert.equal(await page.getByRole('status').textContent(), '');
            } finally { await context.close(); }
        });
        for (const kind of ['loading', 'error', 'contract']) await check(`${label}: ${kind} recovery on return to ready preserves external focus`, async () => {
            const {page, context} = await setup(shadow);
            const blocked = kind === 'contract' ? {timeZone: 'invalid'} : {dataState: {status: kind, phase: 'initial', ...(kind === 'error' ? {error: 'Failure'} : {})}};
            try {
                await page.getByRole('gridcell', {name: '2026-01-31'}).focus(); await patch(page, blocked);
                // The focused region is the status, named by its resolved label (aria-label or its labelling text).
                const statusLabel = {loading: 'Loading calendar', error: 'Could not load calendar', contract: 'Calendar cannot be displayed: invalid configuration'}[kind];
                assert.deepEqual(await focused(page).then(({status, label}) => ({status, label})), {status: true, label: statusLabel});
                await patch(page, {timeZone: 'UTC', dataState: {status: 'ready'}, anchorDate: '2026-02-01'});
                assert.equal((await focused(page)).date, '2026-02-28');
                await patch(page, blocked); await page.locator('#outside').focus();
                await patch(page, {timeZone: 'UTC', dataState: {status: 'ready'}});
                assert.equal((await focused(page)).id, 'outside');
            } finally { await context.close(); }
        });
        await check(`${label}: focused Retry recovers to the grid after successful acceptance`, async () => {
            const {page, context} = await setup(shadow);
            try {
                await page.evaluate(() => { window.retryCount = 0; window.controller.patch({dataState: {status: 'error', phase: 'initial', error: 'Failure'}, onRetryRequest: () => window.retryCount++}); });
                await settle(page); await page.getByRole('button', {name: 'Retry', exact: true}).click();
                assert.equal(await page.evaluate(() => window.retryCount), 1);
                await patch(page, {dataState: {status: 'ready'}}); assert.equal((await focused(page)).date, '2026-01-01');
            } finally { await context.close(); }
        });
        await check(`${label}: accessible message language is independent of Arabic dates and RTL`, async () => {
            const {page, context} = await setup(shadow, {locale: 'ar'});
            try {
                assert.equal(await page.locator('.nc-calendar').getAttribute('lang'), 'en-US');
                assert.equal(await page.locator('.nc-calendar').getAttribute('dir'), 'rtl');
                assert.equal(await page.getByRole('heading').getAttribute('lang'), 'ar');
                for (const name of ['Previous month', 'Today', 'Next month']) assert.equal(await page.getByRole('button', {name, exact: true}).getAttribute('lang'), 'en-US');
                assert.equal(await page.locator('.nc-calendar-status').getAttribute('lang'), 'en-US');
                await patch(page, {dataState: {status: 'loading', phase: 'refresh'}});
                assert.equal(await page.getByRole('progressbar').getAttribute('lang'), 'en-US');
                // QA-D-4-04: the refresh progress is no region; its name and language are on the progress bar alone.
                assert.equal(await page.locator('.nc-calendar-status').getAttribute('role'), null);
                const cdp = await page.context().newCDPSession(page), {nodes} = await cdp.send('Accessibility.getFullAXTree');
                const exposed = nodes.filter(node => !node.ignored && (node.name?.value === 'Refreshing calendar' || node.role?.value === 'StaticText' && /Refreshing calendar/.test(node.name?.value ?? '')))
                    .map(node => node.role?.value);
                assert.deepEqual(exposed, ['progressbar'], 'the refresh name is exposed once, on the progress bar');
                await patch(page, {dataState: {status: 'error', phase: 'initial', error: 'Failure'}});
                assert.equal(await page.locator('.nc-calendar-status').getAttribute('lang'), 'en-US');
                await patch(page, {messagesLocale: 'fr', messages: {calendarLabel: 'Calendrier', previousMonthLabel: 'Mois précédent', errorLabel: 'Erreur'}});
                assert.equal(await page.locator('.nc-calendar').getAttribute('lang'), 'fr');
                assert.equal(await page.getByRole('button', {name: 'Mois précédent'}).getAttribute('lang'), 'fr');
                assert.equal(await page.getByRole('button', {name: 'Next month'}).getAttribute('lang'), 'en-US');
                assert.equal(await page.locator('.nc-calendar-status').getAttribute('lang'), 'fr');
                assert.equal(await page.getByRole('heading').getAttribute('lang'), 'ar');
            } finally { await context.close(); }
        });
        for (const generated of ['before', 'after', 'attribute', 'alternative']) await check(`${label}: CSS ${generated} root label matches native AX name and revalidates`, async () => {
            const {page, context} = await setup(shadow, {'aria-label': 'Fallback', 'aria-labelledby': 'own-label'});
            try {
                await page.evaluate(generated => {
                    const node = window.scope.querySelector('#own-label'); node.textContent = ''; node.dataset.label = 'Project calendar';
                    const style = document.createElement('style'); style.id = 'generated-label';
                    const content = generated === 'attribute' ? 'attr(data-label)' : generated === 'alternative' ? '"Visual label" / "Project calendar"' : '"Project calendar"';
                    style.textContent = `#own-label::${generated === 'after' ? 'after' : 'before'} {content:${content}}`;
                    window.scope.append(style);
                }, generated); await settle(page);
                assert.equal(await page.locator('.nc-calendar').getAttribute('aria-labelledby'), 'own-label');
                const session = await context.newCDPSession(page);
                const ax = await session.send('Accessibility.getFullAXTree'); await session.detach();
                assert.equal(ax.nodes.some(node => node.role?.value === 'region' && node.name?.value === 'Project calendar'), true);
                const count = await page.evaluate(() => window.controller.events.length);
                if (generated === 'attribute') await page.evaluate(() => { window.scope.querySelector('#own-label').dataset.label = ''; });
                else await page.evaluate(() => { window.scope.querySelector('#generated-label').textContent = '#own-label::before,#own-label::after {content:""}'; });
                await settle(page); assert.equal(await page.locator('.nc-calendar').getAttribute('aria-labelledby'), null);
                assert.equal(await page.evaluate(() => window.controller.events.length), count);
                assert.equal(await page.getByRole('region', {name: 'Fallback', exact: true}).count(), 1);
                assert.equal(await page.getByRole('status').textContent(), '');
            } finally { await context.close(); }
        });
        const {page, context} = await setup(shadow);
        try {
            await check(`${label}: toolbar request/accept, one live mutation`, async () => {
                await page.getByRole('button', {name: 'Next month', exact: true}).click();
                assert.match(await page.getByRole('heading').textContent(), /January/);
                assert.deepEqual(await page.evaluate(() => window.controller.events.filter(event => event.type === 'navigate')), [{type: 'navigate', value: '2026-02-01'}]);
                await patch(page, {anchorDate: '2026-02-01'});
                assert.match(await page.getByRole('status').textContent(), /Showing/);
                assert.equal(await page.evaluate(() => window.liveMutations.length), 1);
                await patch(page, {anchorDate: '2026-02-28'});
                assert.equal(await page.evaluate(() => window.liveMutations.length), 1);
            });
            await check(`${label}: delayed PageDown clamps and preserves external focus`, async () => {
                await patch(page, {anchorDate: '2026-01-01'});
                await page.getByRole('gridcell', {name: '2026-01-31'}).focus(); await page.keyboard.press('PageDown');
                assert.equal((await focused(page)).date, '2026-01-31');
                await patch(page, {anchorDate: '2026-02-01'}); assert.equal((await focused(page)).date, '2026-02-28');
                await page.keyboard.press('PageDown'); await page.locator('#outside').focus();
                await patch(page, {anchorDate: '2026-03-01'}); assert.equal((await focused(page)).id, 'outside');
            });
            await check(`${label}: Today acceptance and Tab cancellation`, async () => {
                await patch(page, {anchorDate: '2026-01-01'});
                await page.getByRole('button', {name: 'Today', exact: true}).click();
                await patch(page, {anchorDate: '2026-02-01'}); assert.equal((await focused(page)).date, '2026-02-14');
                await patch(page, {anchorDate: '2026-01-01'}); await page.getByRole('button', {name: 'Today', exact: true}).click();
                await page.keyboard.press('Tab'); const before = await focused(page);
                await patch(page, {anchorDate: '2026-02-01'}); assert.deepEqual(await focused(page), before);
            });
            await check(`${label}: blocking recovery and no duplicate live announcement`, async () => {
                await page.getByRole('gridcell', {name: '2026-02-14'}).focus();
                await patch(page, {dataState: {status: 'loading', phase: 'initial'}});
                assert.equal((await focused(page)).label, 'Loading calendar');
                assert.equal(await page.getByRole('status').textContent(), '');
                await patch(page, {dataState: {status: 'ready'}});
                await page.locator('#outside').focus(); await patch(page, {dataState: {status: 'error', phase: 'initial', error: 'failure'}});
                assert.equal((await focused(page)).id, 'outside');
                await patch(page, {dataState: {status: 'ready'}});
            });
            await check(`${label}: blocking disables focused Today without losing focus to body`, async () => {
                await page.getByRole('button', {name: 'Today', exact: true}).focus();
                await patch(page, {dataState: {status: 'loading', phase: 'initial'}});
                assert.equal((await focused(page)).label, 'Loading calendar');
                assert.equal(await page.getByRole('status').textContent(), '');
                await patch(page, {dataState: {status: 'ready'}});
            });
            await check(`${label}: same-tree root name and target removal`, async () => {
                await patch(page, {'aria-labelledby': 'own-label external-label missing', 'aria-label': 'Fallback'});
                const root = page.locator('.nc-calendar');
                assert.equal(await root.getAttribute('aria-labelledby'), shadow ? 'own-label' : 'own-label external-label');
                await page.evaluate(() => window.scope.querySelector('#own-label').remove()); await settle(page);
                assert.equal(await root.getAttribute('aria-labelledby'), shadow ? null : 'external-label');
                await page.evaluate(() => document.getElementById('external-label').remove()); await settle(page);
                assert.equal(await root.getAttribute('aria-labelledby'), null); assert.equal(await root.getAttribute('aria-label'), 'Fallback');
            });
            await check(`${label}: contract shell suppresses callbacks and preserves live hosts`, async () => {
                await page.getByRole('gridcell', {name: '2026-02-14'}).focus();
                const events = await page.evaluate(() => { window.savedLive = window.scope.querySelector('[role=status]'); return window.controller.events.length; });
                await patch(page, {timeZone: '+03:00', anchorDate: '2026-04-01'});
                assert.equal(await page.getByRole('grid').count(), 0);
                assert.equal(await page.locator('.nc-calendar').getAttribute('data-status'), 'error');
                assert.equal(await page.evaluate(() => window.controller.events.length), events);
                assert.deepEqual(await focused(page).then(({status, label}) => ({status, label})), {status: true, label: 'Calendar cannot be displayed: invalid configuration'});
                assert.equal(await page.getByRole('alert').textContent(), '');
                await patch(page, {timeZone: 'UTC'});
                assert.equal(await page.evaluate(() => window.savedLive === window.scope.querySelector('[role=status]')), true);
            });
            if (!shadow) {
                await page.screenshot({path: resolve(output, 'controller-fixture.png'), fullPage: true});
                await check('document: narrow loading, RTL dark error and contract shell geometry', async () => {
                    await page.setViewportSize({width: 320, height: 700});
                    for (const [name, props] of [
                        ['narrow-loading', {locale: 'ru-RU', dataState: {status: 'loading', phase: 'initial'}}],
                        ['narrow-rtl-error', {locale: 'ar', colorScheme: 'dark', dataState: {status: 'error', phase: 'initial', error: 'Failure'}}],
                        ['narrow-contract', {locale: 'ru-RU', layout: 'invalid'}],
                    ]) {
                        await patch(page, props);
                        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
                        const sizes = await page.locator('.nc-calendar button').evaluateAll(nodes => nodes.map(node => {const rect = node.getBoundingClientRect(); return {width: rect.width, height: rect.height, right: rect.right};}));
                        assert.equal(sizes.every(size => size.width >= 44 && size.height >= 44 && size.right <= 320), true);
                        await page.screenshot({path: resolve(output, `${name}.png`), fullPage: true});
                    }
                });
            }
            await check(`${label}: unmount preserves external focus`, async () => {
                await page.locator('#outside').focus(); await page.evaluate(() => { window.liveObserver.disconnect(); window.controller.unmount(); });
                assert.equal((await focused(page)).id, 'outside'); assert.equal(await page.locator('.nc-calendar').count(), 0);
            });
        } finally { await context.close(); }
    }
} finally { await browser.close(); }
const paths = ['src/v02/core/controller.ts', 'src/v02/core/today.ts', 'src/v02/calendar/model.ts', 'src/v02/calendar/dom.ts',
    'src/v02/calendar/useToday.ts', 'src/v02/calendar/useRootName.ts', 'src/v02/calendar/useCalendarController.ts', 'src/v02/calendar/CalendarShell.tsx', 'src/v02/calendar/useStatusGeometry.ts',
    'src/v02/calendar/__tests__/fixture.tsx', 'src/v02/primitives/ThemeRoot.tsx', 'src/v02/styles.css', 'scripts/implementation/controller-entry.tsx', 'scripts/implementation/controller-probe.mjs'];
const report = {capturedAt: new Date().toISOString(), outcome: checks.every(check => check.outcome === 'pass') && !errors.length ? 'pass' : 'fail',
    scope: 'T10 private controller + test-only grid. Not T11 Month, T12 agenda, complete T16 overlay stack, physical touch or AT qualification.',
    node: process.version, browser: version, checks, errors,
    sourceHashes: Object.fromEntries(paths.map(path => [path, createHash('sha256').update(readFileSync(resolve(root, path))).digest('hex')]))};
writeFileSync(resolve(output, 'browser.json'), JSON.stringify(report, null, 2) + '\n');
console.log(`Controller: ${checks.filter(check => check.outcome === 'pass').length}/${checks.length}; ${errors.length} page errors; ${output}`);
if (report.outcome === 'fail') process.exitCode = 1;
