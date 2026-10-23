import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {mkdtempSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, resolve} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {build} from 'vite';
import {foundationRegressions} from './foundation-regressions.mjs';

const here = dirname(fileURLToPath(import.meta.url)), root = resolve(here, '../..');
const output = resolve(process.argv[2] ?? resolve(tmpdir(), 'calendar-foundation'));
mkdirSync(output, {recursive: true});
const directory = mkdtempSync(resolve(tmpdir(), 'calendar-foundation-'));
await build({configFile: false, logLevel: 'error', define: {'process.env.NODE_ENV': '"production"'},
    build: {outDir: directory, minify: true, lib: {entry: resolve(here, 'foundation-entry.tsx'), formats: ['es', 'cjs'], fileName: format => format === 'es' ? 'index.mjs' : 'index.cjs'}}});
const esm = await import(pathToFileURL(resolve(directory, 'index.mjs'))), cjs = createRequire(import.meta.url)(resolve(directory, 'index.cjs'));
const html = esm.serverFoundation();
assert.equal(cjs.serverFoundation(), html, 'ESM/CJS SSR');
const moduleUrl = 'data:text/javascript;base64,' + readFileSync(resolve(directory, 'index.mjs')).toString('base64');
const css = readFileSync(resolve(root, 'src/v02/styles.css'), 'utf8');
const {chromium} = await import('./spikes/node_modules/playwright/index.mjs');
const browser = await chromium.launch({channel: 'chrome', headless: true});
const checks = [], errors = [];
const browserVersion = browser.version();
const check = async (name, operation) => {
    try { const details = await operation(); checks.push({name, outcome: 'pass', ...(details ? {details} : {})}); }
    catch (error) { checks.push({name, outcome: 'fail', error: String(error)}); }
    writeFileSync(resolve(output, 'checks.json'), JSON.stringify(checks, null, 2) + '\n');
    console.log(`${checks.at(-1).outcome}: ${name}`);
};
const active = () => { let node = document.activeElement; while (node?.shadowRoot?.activeElement) node = node.shadowRoot.activeElement; return node; };
const waitFocus = (page, id) => page.waitForFunction(({source, id}) => (0, eval)(`(${source})`)()?.id === id, {source: String(active), id});
try {
    for (const ownerShadow of [false, true]) for (const portalShadow of [false, true]) {
        const label = `${ownerShadow ? 'shadow' : 'document'}→${portalShadow ? 'shadow' : 'body'}`;
        const context = await browser.newContext({viewport: {width: 980, height: 780}, colorScheme: 'light', locale: 'de-DE'});
        const page = await context.newPage();
        page.setDefaultTimeout(5000);
        page.on('pageerror', error => errors.push({label, error: String(error)}));
        try {
            await page.setContent('<style>body { font: 16px/1.5 monospace; } #foundation { padding:24px; } </style><button id="outside">Outside</button><div id="owner"></div><div id="portal"></div>');
            await page.evaluate(async ({ownerShadow, portalShadow, css, moduleUrl, html}) => {
                const owner = document.getElementById('owner'), portal = document.getElementById('portal');
                const ownerScope = ownerShadow ? owner.attachShadow({mode: 'open'}) : owner;
                const portalScope = portalShadow ? portal.attachShadow({mode: 'open'}) : undefined;
                const style = document.createElement('style'); style.textContent = css; document.head.append(style);
                for (const scope of [ownerShadow ? ownerScope : undefined, portalScope].filter(Boolean)) scope.append(style.cloneNode(true));
                const container = document.createElement('div'); ownerScope.append(container);
                const module = await import(moduleUrl);
                // SSR/client first-render parity uses the same closed-overlay tree.
                container.innerHTML = html;
                const hydration = await module.hydrateFoundation(container, {portalContainer: portalScope});
                window.foundation = {module, container, hydration, portalScope};
            }, {ownerShadow, portalShadow, css, moduleUrl, html});
            await check(`${label}: SSR hydration`, async () => {
                const errors = await page.evaluate(() => window.foundation.hydration.errors);
                assert.deepEqual(errors, []);
            });
            await check(`${label}: Enter/Space, disabled skip and focus ring`, async () => {
                await page.locator('#outside').focus(); await page.keyboard.press('Tab'); await waitFocus(page, 'press');
                assert.equal(await page.locator('#press').getAttribute('data-focus-visible'), 'true');
                const geometry = await page.locator('#press').evaluate(node => ({height: node.getBoundingClientRect().height, outline: getComputedStyle(node).outlineWidth}));
                assert.ok(geometry.height >= 44); assert.equal(geometry.outline, '2px');
                await page.keyboard.press('Enter'); await page.keyboard.press('Space');
                await page.waitForFunction(() => { const owner = document.getElementById('owner'); return (owner.shadowRoot ?? owner).querySelector('#result').textContent.startsWith('2/'); });
                await page.keyboard.press('Tab'); await waitFocus(page, 'previous');
                return geometry;
            });
            await check(`${label}: checkbox`, async () => {
                const checkbox = page.getByRole('checkbox', {name: 'Work calendar', exact: true});
                await checkbox.focus(); await page.keyboard.press('Space');
                assert.equal(await checkbox.isChecked(), true);
                assert.equal(await page.getByRole('checkbox', {name: 'Disabled calendar', exact: true}).isDisabled(), true);
            });
            await check(`${label}: menu keyboard, disabled item, action and return`, async () => {
                await page.locator('#menu-trigger').focus(); await page.keyboard.press('ArrowDown');
                await page.getByRole('menuitem', {name: 'Open item', exact: true}).waitFor();
                await page.waitForFunction(source => (0, eval)(`(${source})`)()?.textContent === 'Open item', String(active));
                await page.keyboard.press('ArrowDown');
                await page.waitForFunction(source => (0, eval)(`(${source})`)()?.textContent === 'Remove item', String(active));
                await page.keyboard.press('Enter');
                await page.getByRole('menu').waitFor({state: 'detached'}); await waitFocus(page, 'menu-trigger');
                assert.equal(await page.locator('#result').textContent(), '2/true/remove');
            });
            await check(`${label}: menu Escape and portal scope`, async () => {
                await page.locator('#menu-trigger').focus(); await page.keyboard.press('ArrowDown');
                const menu = page.getByRole('menu', {name: 'Item actions', exact: true}); await menu.waitFor();
                const scope = await menu.evaluate(node => { const root = node.closest('.nc-theme'); return {theme: root.dataset.theme, density: root.dataset.density,
                    lang: root.lang, radius: getComputedStyle(root).borderRadius, shadow: root.getRootNode() instanceof ShadowRoot}; });
                assert.deepEqual(scope, {theme: 'classic', density: 'compact', lang: 'en-US', radius: '24px', shadow: portalShadow});
                await page.keyboard.press('Escape'); await menu.waitFor({state: 'detached'}); await waitFocus(page, 'menu-trigger');
                return scope;
            });
            await check(`${label}: popover dialog and close`, async () => {
                await page.locator('#popover-trigger').click();
                const dialog = page.getByRole('dialog', {name: 'Information', exact: true}); await dialog.waitFor();
                await page.getByRole('button', {name: 'Close information', exact: true}).click();
                await dialog.waitFor({state: 'detached'}); await waitFocus(page, 'popover-trigger');
            });
            await check(`${label}: modal focus, containment, inert cleanup`, async () => {
                await page.locator('#dialog-trigger').click();
                const dialog = page.getByRole('dialog', {name: 'Calendar settings', exact: true}); await dialog.waitFor();
                const first = dialog.getByRole('checkbox', {name: 'Show details'}); await first.focus();
                await page.keyboard.press('Shift+Tab');
                await page.waitForFunction(source => (0, eval)(`(${source})`)()?.textContent === 'Close settings', String(active));
                assert.equal(await page.locator('#outside').evaluate(node => !!node.closest('[inert]')), true);
                await page.keyboard.press('Escape'); await dialog.waitFor({state: 'detached'}); await waitFocus(page, 'dialog-trigger');
                assert.equal(await page.locator('#outside').evaluate(node => !!node.closest('[inert]')), false);
            });
            await check(`${label}: scoped styles, inherited font and media`, async () => {
                const font = await page.locator('#press').evaluate(node => getComputedStyle(node).fontFamily);
                assert.match(font, /monospace/);
                assert.equal(await page.locator('#outside').evaluate(node => getComputedStyle(node).getPropertyValue('--nelmad-calendar-color-surface')), '');
                await page.emulateMedia({colorScheme: 'dark', reducedMotion: 'reduce'});
                const style = await page.locator('#foundation').evaluate(node => ({surface: getComputedStyle(node).getPropertyValue('--nelmad-calendar-color-surface').trim(),
                    animation: getComputedStyle(node.querySelector('.nc-skeleton')).animationName, transition: getComputedStyle(node.querySelector('.nc-button')).transitionDuration}));
                assert.deepEqual(style, {surface: '#22201f', animation: 'none', transition: '0s'});
                await page.emulateMedia({forcedColors: 'active'});
                assert.equal(await page.locator('#press').evaluate(node => getComputedStyle(node).forcedColorAdjust), 'auto');
                await page.emulateMedia({colorScheme: 'light', reducedMotion: 'no-preference', forcedColors: 'none'});
                await page.waitForFunction(() => {
                    const host = document.getElementById('owner');
                    // Light-scheme button fill: color-mix of 6% text #21201f into surface #fff (buttons stopped using the item token, QA-15).
                    return getComputedStyle((host.shadowRoot ?? host).querySelector('#press')).backgroundColor === 'color(srgb 0.947765 0.947529 0.947294)';
                });
                return style;
            });
            if (!ownerShadow && !portalShadow) await page.screenshot({path: resolve(output, 'classic.png'), fullPage: true});
            await check(`${label}: RTL, comfortable density and forced dark`, async () => {
                await page.evaluate(() => {
                    const fixture = window.foundation;
                    fixture.hydration.unmount();
                    fixture.hydration = {unmount: fixture.module.mountFoundation(fixture.container, {portalContainer: fixture.portalScope,
                        direction: 'rtl', density: 'comfortable', colorScheme: 'dark'})};
                });
                await page.locator('#foundation[data-density="comfortable"]').waitFor();
                const style = await page.locator('#foundation').evaluate(node => ({direction: getComputedStyle(node).direction,
                    surface: getComputedStyle(node).getPropertyValue('--nelmad-calendar-color-surface').trim(),
                    itemHeight: getComputedStyle(node).getPropertyValue('--nelmad-calendar-density-item-height').trim(),
                    icon: getComputedStyle(node.querySelector('.nc-icon')).transform}));
                assert.deepEqual(style, {direction: 'rtl', surface: '#22201f', itemHeight: '32px', icon: 'matrix(-1, 0, 0, 1, 0, 0)'});
                await page.locator('#menu-trigger').focus(); await page.keyboard.press('ArrowDown');
                const menu = page.getByRole('menu', {name: 'Item actions', exact: true}); await menu.waitFor();
                assert.equal(await menu.evaluate(node => node.closest('.nc-theme').dir), 'rtl');
                await page.keyboard.press('Escape'); await menu.waitFor({state: 'detached'}); await waitFocus(page, 'menu-trigger');
                if (!ownerShadow && !portalShadow) await page.screenshot({path: resolve(output, 'classic-dark-rtl.png'), fullPage: true});
                return style;
            });
            await check(`${label}: unmount removes overlays and modal effects`, async () => {
                await page.locator('#dialog-trigger').click(); await page.getByRole('dialog', {name: 'Calendar settings', exact: true}).waitFor();
                await page.evaluate(() => window.foundation.hydration.unmount());
                await page.getByRole('dialog').waitFor({state: 'detached'});
                assert.equal(await page.locator('#outside').evaluate(node => !!node.closest('[inert]')), false);
                await page.locator('#outside').focus(); await waitFocus(page, 'outside');
            });
            await foundationRegressions({page, check, label, waitFocus});
        } finally { await context.close(); }
    }
} finally { await browser.close(); }
const paths = ['src/v02/primitives/runtime.ts', 'src/v02/primitives/ThemeRoot.tsx', 'src/v02/primitives/controls.tsx', 'src/v02/primitives/overlays.tsx',
    'src/v02/primitives/content.tsx', 'src/v02/primitives/index.ts', 'src/v02/themes/classic.ts', 'src/v02/styles.css', 'package.json', 'package-lock.json',
    'scripts/implementation/foundation-entry.tsx', 'scripts/implementation/foundation-probe.mjs', 'scripts/implementation/foundation-regressions.mjs'];
const report = {capturedAt: new Date().toISOString(), outcome: checks.every(check => check.outcome === 'pass') && !errors.length ? 'pass' : 'fail',
    scope: 'T09 private primitives only. T16 nested stack, logical Tab exit, computed portal mirror and container lifecycle remain open. Not SDK/AT qualification.',
    node: process.version, browser: browserVersion, checks, errors,
    sourceHashes: Object.fromEntries(paths.map(path => [path, createHash('sha256').update(readFileSync(resolve(root, path))).digest('hex')]))};
writeFileSync(resolve(output, 'browser.json'), JSON.stringify(report, null, 2) + '\n');
console.log(`Foundation: ${checks.filter(check => check.outcome === 'pass').length}/${checks.length}; ${errors.length} page errors; ${output}`);
if (report.outcome === 'fail') process.exitCode = 1;
