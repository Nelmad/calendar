import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createServer} from 'node:http';
import {readFileSync, readdirSync, existsSync, mkdirSync, mkdtempSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join, resolve, extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
// Storybook smoke (T16, extended for T19-V1-04): run after `npm run build-storybook`. Each Portals story's agenda must
// mount inside its explicit container (an Element, or a ShadowRoot that holds styles.css), styled, with the owner's theme
// attributes; then every story of the built index renders at least one named calendar root (in the document or in a
// ShadowRoot) without page errors, console errors or warnings. `npm run build-storybook` is a production build, where the
// SDK development diagnostics are silent; argv[3] names another static build, e.g. `NODE_ENV=development npx storybook
// build -o <dir>`, where they are compiled in and every warning beyond a story's documented diagnostics fails.
// Screenshots and manifest.json (computed outcomes, versions, source hashes) go to argv[2]. Not a probe of record for an R row.
const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../..'), root = resolve(process.argv[3] ?? resolve(repo, 'storybook-static'));
const output = resolve(process.argv[2] ?? mkdtempSync(join(tmpdir(), 'calendar-stories-'))); mkdirSync(output, {recursive: true});
const require = createRequire(import.meta.url);
const types = {'.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2'};
const missing = [];
const server = createServer((req, res) => { const path = resolve(root, '.' + decodeURIComponent(req.url.split('?')[0])); if (!existsSync(path)) { missing.push(req.url); res.writeHead(404); return res.end(); } res.writeHead(200, {'content-type': types[extname(path)] ?? 'application/octet-stream'}); res.end(readFileSync(path)); }).listen(0);
const port = server.address().port;
const {chromium} = await import('./spikes/node_modules/playwright/index.mjs');
const browser = await chromium.launch({channel: 'chrome', headless: true}), pageErrors = [], consoleMessages = [], checks = [];
const stories = [{story: 'calendar-portals--element-container', shadow: false}, {story: 'calendar-portals--shadow-root-container', shadow: true}];
const index = JSON.parse(readFileSync(resolve(root, 'index.json'), 'utf8'));
const all = Object.values(index.entries).filter(entry => entry.type === 'story').map(entry => entry.id), smoke = [];
// A development build compiles the SDK diagnostics in (a production build strips them).
const development = readdirSync(resolve(root, 'assets')).some(name => name.endsWith('.js') && readFileSync(resolve(root, 'assets', name), 'utf8').includes('not available in'));
// Stories that demonstrate a diagnostic on purpose (documented in their descriptions): exactly these warnings, nothing else.
const unknownSource = 'warning: [@nelmad/calendar] items[9].calendarId: No source with ID "missing"; items with this calendarId remain visible with fallback appearance';
const documented = !development ? {} : {
    'calendar-actions-and-sources--desktop': [unknownSource], 'calendar-actions-and-sources--mobile': [unknownSource], 'calendar-actions-and-sources--delayed-filter': [unknownSource],
    'calendar-validation--malformed-items': ['items[1].title: Use the localized untitled-item label', 'items[2].interval: Expected YYYY-MM-DD in 0001…9999',
        'items[3].interval: A date range requires end > start', 'items[4].interval: Invalid RFC3339 grammar', 'items[5].interval: Timed end must be >= start',
        'items[6].interval: Timezone is outside the package accepted-set', 'items[7]: All items with this ID are excluded', 'items[8]: All items with this ID are excluded']
        .map(text => `warning: [@nelmad/calendar] ${text}`),
    'calendar-validation--invalid-configuration': ['warning: [@nelmad/calendar] timeZone: Timezone is outside the package accepted-set'],
};
try {
    for (const {story, shadow} of stories) {
        const page = await browser.newPage({viewport: {width: 1300, height: 900}});
        page.on('pageerror', e => pageErrors.push(String(e))); page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') consoleMessages.push(m.text()); });
        let result;
        try {
            await page.goto(`http://localhost:${port}/iframe.html?id=${story}&viewMode=story`); await page.waitForSelector('[role=grid]');
            await page.waitForTimeout(500);
            await page.locator('[role=gridcell][data-date="2026-09-03"]').focus(); await page.keyboard.press('Enter'); await page.waitForTimeout(500);
            result = await page.evaluate(() => {
                const host = [...document.querySelectorAll('figure div')].find(node => node.shadowRoot || !node.closest('.nc-calendar') && node.querySelector('.nc-theme'));
                const scope = host?.shadowRoot ?? host, dialog = scope?.querySelector('[role=dialog]'), theme = dialog?.closest('.nc-agenda-popover'), calendar = document.querySelector('.nc-calendar');
                const style = theme && getComputedStyle(theme), names = ['data-theme', 'data-density', 'data-color-scheme', 'data-dir', 'lang'];
                return {inContainer: !!dialog && !!theme, shadow: !!host?.shadowRoot, background: style?.backgroundColor ?? null, radius: style?.borderTopLeftRadius ?? null,
                    shadowStyle: style?.boxShadow ?? null, attributes: theme ? names.filter(name => theme.getAttribute(name) !== calendar.getAttribute(name)) : null,
                    dialogs: document.querySelectorAll('[role=dialog]').length};
            });
            await page.screenshot({path: resolve(output, `${story}.png`)});
            assert.equal(result.inContainer, true, 'the agenda popover is mounted inside the explicit container');
            assert.equal(result.shadow, shadow, shadow ? 'the container is a ShadowRoot' : 'the container is an Element');
            if (shadow) assert.equal(result.dialogs, 0, 'nothing leaks into the document tree scope');
            assert.notEqual(result.background, 'rgba(0, 0, 0, 0)', 'styles.css styles the popover surface in this tree scope');
            assert.notEqual(result.radius, '0px'); assert.notEqual(result.shadowStyle, 'none');
            assert.deepEqual(result.attributes, [], 'the portal theme root repeats the owner theme attributes and lang');
            checks.push({story, result, outcome: 'pass'});
        } catch (error) {
            checks.push({story, result, outcome: 'fail', error: String(error?.stack ?? error)});
        } finally { await page.close(); }
        console.log(`${checks.at(-1).outcome}: ${story} ${JSON.stringify(result)}${checks.at(-1).error ? '\n' + checks.at(-1).error : ''}`);
    }
    for (const story of all) {
        const page = await browser.newPage({viewport: {width: 1300, height: 900}}), messages = [], errors = [];
        page.on('pageerror', e => errors.push(String(e))); page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') messages.push(`${m.type()}: ${m.text()}`); });
        let result;
        try {
            await page.goto(`http://localhost:${port}/iframe.html?id=${story}&viewMode=story`);
            const roots = () => page.evaluate(() => {
                const scopes = [document, ...[...document.querySelectorAll('*')].map(node => node.shadowRoot).filter(Boolean)];
                return scopes.flatMap(scope => [...scope.querySelectorAll('.nc-calendar')].map(node => {
                    const ids = node.getAttribute('aria-labelledby')?.split(/\s+/) ?? [];
                    const labelled = ids.map(id => node.getRootNode().getElementById(id)?.textContent?.trim()).filter(Boolean).join(' ');
                    return {role: node.getAttribute('role'), name: labelled || node.getAttribute('aria-label') || '', shadow: node.getRootNode() instanceof ShadowRoot, status: node.dataset.status ?? null};
                }));
            });
            await page.waitForFunction(() => document.querySelector('.nc-calendar') || [...document.querySelectorAll('*')].some(node => node.shadowRoot?.querySelector('.nc-calendar')));
            await page.waitForTimeout(400);
            result = {roots: await roots()};
            if (story === 'calendar-portals--theme-scope') {
                // The calendar root and its portals share one ShadowRoot: Enter opens the themed agenda inside it.
                await page.locator('[role=gridcell][data-date="2026-09-03"]').focus(); await page.keyboard.press('Enter'); await page.waitForTimeout(500);
                result.agenda = await page.evaluate(() => {
                    const shadow = [...document.querySelectorAll('*')].map(node => node.shadowRoot).find(scope => scope?.querySelector('.nc-calendar'));
                    const calendar = shadow.querySelector('.nc-calendar'), dialog = shadow.querySelector('[role=dialog]'), theme = dialog?.closest('.nc-theme');
                    const names = ['data-theme', 'data-density', 'data-color-scheme', 'data-dir', 'lang'];
                    return {inShadow: !!dialog, inDocument: document.querySelectorAll('[role=dialog]').length, background: theme && getComputedStyle(theme).backgroundColor,
                        attributes: theme ? Object.fromEntries(names.map(name => [name, theme.getAttribute(name)])) : null, owner: Object.fromEntries(names.map(name => [name, calendar.getAttribute(name)]))};
                });
                assert.equal(result.agenda.inShadow, true, 'the agenda opens inside the ShadowRoot'); assert.equal(result.agenda.inDocument, 0);
                assert.deepEqual(result.agenda.attributes, result.agenda.owner, 'the portal theme root repeats the owner theme attributes');
                assert.deepEqual([result.agenda.owner['data-theme'], result.agenda.owner['data-color-scheme'], result.agenda.owner['data-density']], ['neutral', 'dark', 'comfortable']);
                assert.notEqual(result.agenda.background, 'rgba(0, 0, 0, 0)');
            }
            await page.screenshot({path: resolve(output, `smoke-${story}.png`)});
            assert.ok(result.roots.length > 0, 'at least one calendar root');
            for (const item of result.roots) { assert.equal(item.role, 'region'); assert.ok(item.name, 'every calendar root has an accessible name'); }
            assert.deepEqual(errors, [], 'no page errors');
            assert.deepEqual(messages.filter(text => !/404/.test(text)), documented[story] ?? [], 'no console errors or warnings beyond the documented diagnostics');
            smoke.push({story, result, messages, outcome: 'pass'});
        } catch (error) {
            smoke.push({story, result, messages, errors, outcome: 'fail', error: String(error?.stack ?? error)});
        } finally { await page.close(); }
        console.log(`${smoke.at(-1).outcome}: smoke ${story} ${JSON.stringify(result?.roots ?? null)}${smoke.at(-1).error ? '\n' + smoke.at(-1).error : ''}`);
    }
} finally { await browser.close(); server.close(); }
// Static resources the ad-hoc server does not serve (favicon) answer 404; any other console error or warning fails.
const unexpected = consoleMessages.filter(text => !/404/.test(text));
const paths = [...new Set(Object.values(index.entries).map(entry => entry.importPath.replace(/^\.\//, '')))].sort().concat(['stories/support.tsx', 'stories/css-inline.d.ts', '.storybook/preview.ts', 'scripts/implementation/portal-stories-check.mjs', 'package-lock.json']);
const manifest = {capturedAt: new Date().toISOString(), node: process.version, storybook: require(resolve(repo, 'node_modules/storybook/package.json')).version,
    playwright: require('./spikes/node_modules/playwright/package.json').version, browser: `system Chrome ${browser.version()} (channel chrome, headless)`,
    outcome: checks.length === stories.length && checks.every(check => check.outcome === 'pass') && !pageErrors.length && !unexpected.length
        && all.length > 0 && smoke.length === all.length && smoke.every(check => check.outcome === 'pass') ? 'pass' : 'fail',
    command: `npm run build-storybook && node scripts/implementation/portal-stories-check.mjs ${process.argv.slice(2).join(' ')}`.trim(), storybookBuild: development ? 'development' : 'production',
    storybookDirectory: root, documentedDiagnostics: documented, checks, smoke, pageErrors, consoleMessages, notFound: missing,
    scope: 'Storybook smoke on the built package; with a production Storybook build the SDK development diagnostics are silent, with a development build (argv[3]) every console warning fails except the documented diagnostics of the actions/sources (unknown calendarId) and validation stories. Portals: Enter on 3 September opens the agenda inside the Element container and inside the ShadowRoot container that holds styles.css; the script asserts placement, styled surface (background, radius, shadow) and theme attributes/lang equal to the owner root. Every story of index.json: at least one calendar root with role region and an accessible name (document or ShadowRoot), no page errors, console errors or warnings; the ShadowRoot theme scope story opens its themed agenda inside its ShadowRoot. Not a probe of record for any R row.',
    sourceHashes: Object.fromEntries(paths.filter(path => existsSync(resolve(repo, path))).map(path => [path, createHash('sha256').update(readFileSync(resolve(repo, path))).digest('hex')]))};
writeFileSync(resolve(output, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(`Portal stories: ${checks.filter(check => check.outcome === 'pass').length}/${stories.length}; story smoke: ${smoke.filter(check => check.outcome === 'pass').length}/${all.length}; ${pageErrors.length} page errors; ${unexpected.length} unexpected console messages; ${output}`);
if (manifest.outcome !== 'pass') process.exitCode = 1;
