import assert from 'node:assert/strict';
import {cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {createRecorder, createServers, examples, hash, packCandidate, prepareConsumer, root, singleInstances, tarballArgument, walk} from './packed-harness.mjs';

const probes = join(root, 'scripts/implementation/packed-probes');
// The documented examples are the consumer fixtures; probes add harness-only files to the isolated copy.
const shared = {'Schedule.tsx': ['src', 'components'], 'ReleaseCalendar.tsx': ['src', 'components'], 'releaseData.ts': ['src', 'components'], 'Workspace.tsx': ['src', 'components'], 'app.css': ['src', 'app']};
const exampleFiles = kind => walk(join(examples, kind));
const version = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;
// The run report goes to --output=<dir> (CI: under $RUNNER_TEMP, uploaded as a workflow artifact); without it the run writes
// to a fresh temporary directory. Nothing is written into the repository (process change 2026-10-22). --tarball=<tgz> tests
// that archive (byte-identical to the checkout's build) instead of building and packing one (PV9-1-01/02).
const output = resolve(process.argv.find(arg => arg.startsWith('--output='))?.slice(9) ?? mkdtempSync(join(tmpdir(), 'calendar-packed-evidence-')));
const refresh = process.argv.includes('--refresh-locks');
const temporary = realpathSync(mkdtempSync(join(tmpdir(), 'calendar-packed-')));
mkdirSync(output, {recursive: true});
const report = {startedAt: new Date().toISOString(), scope: `Packed ${version} through the documented examples/vite and examples/next apps, not release or full compatibility acceptance`, node: process.version, temporary, versions: {node: process.version}, checks: [], sourceHashes: {}};
const {save, record, run} = createRecorder(output, report);
function contracts(dir) {
    // The public prerelease fixtures already import '@nelmad/calendar' like a consumer; copy them verbatim.
    const dest = join(dir, 'contracts'); mkdirSync(dest);
    for (const name of ['positive.ts', 'negative.ts']) cpSync(join(root, 'tests/contracts/public', name), join(dest, name));
    cpSync(join(probes, 'shared/require.cts'), join(dest, 'require.cts'));
    const config = {compilerOptions: {target: 'ES2020', lib: ['ES2020', 'DOM', 'DOM.Iterable'], module: 'ESNext', moduleResolution: 'bundler', strict: true, exactOptionalPropertyTypes: true, skipLibCheck: false, noEmit: true, types: ['react', 'react-dom']}, include: ['*.ts'], exclude: ['*.cts']};
    writeFileSync(join(dest, 'tsconfig.bundler.json'), JSON.stringify(config, null, 2));
    writeFileSync(join(dest, 'tsconfig.nodenext.json'), JSON.stringify({...config, compilerOptions: {...config.compilerOptions, module: 'NodeNext', moduleResolution: 'NodeNext'}, include: ['*.ts', '*.cts'], exclude: []}, null, 2));
}
const {serve, stop} = createServers(output);
let browser;
try {
    const {pack, details} = packCandidate({run, record, temporary, output, tarball: tarballArgument()});
    report.package = details;
    for (const path of ['package.json', 'package-lock.json', 'vite.lib.config.ts', 'scripts/bundle-css.mjs', 'scripts/verify-dist.mjs', 'scripts/implementation/packed-consumers.mjs', 'scripts/implementation/packed-harness.mjs', 'src/index.ts', 'src/Calendar.tsx', ...readdirSync(join(root, 'tests/contracts/public')).map(path => `tests/contracts/public/${path}`), ...readdirSync(join(root, 'src/v02'), {recursive: true}).filter(path => /\.(ts|tsx|css)$/.test(path)).map(path => `src/v02/${path}`)]) report.sourceHashes[path] = hash(readFileSync(join(root, path)));
    for (const kind of ['vite', 'next']) for (const file of exampleFiles(kind)) report.sourceHashes[`examples/${kind}/${file}`] = hash(readFileSync(join(examples, kind, file)));
    for (const file of walk(probes)) report.sourceHashes[`scripts/implementation/packed-probes/${file}`] = hash(readFileSync(join(probes, file)));
    for (const [file, [vite, next]] of Object.entries(shared)) assert.equal(readFileSync(join(examples, 'next', next, file), 'utf8'), readFileSync(join(examples, 'vite', vite, file), 'utf8'), `examples/*/${file} differ`);
    for (const kind of ['vite', 'next']) for (const readme of ['README.md', 'README.ru.md']) assert.ok(existsSync(join(examples, kind, readme)), `examples/${kind}/${readme} missing`);
    record('examples-shared-sources', {files: Object.keys(shared)});
    {
        // QA-05: a fresh install of the archive without any saved lockfile, as `npm install @nelmad/calendar` resolves it today.
        const fresh = join(temporary, 'fresh'); mkdirSync(fresh);
        writeFileSync(join(fresh, 'package.json'), JSON.stringify({name: 'calendar-fresh-consumer', private: true, dependencies: {'@nelmad/calendar': 'file:../calendar.tgz', react: '18.3.1', 'react-dom': '18.3.1'}}, null, 2));
        run('fresh-install', 'npm', ['install', '--no-audit', '--no-fund'], fresh);
        cpSync(join(fresh, 'package-lock.json'), join(output, 'fresh-lock.json'));
        singleInstances({kind: 'fresh', directory: fresh, run, record, manifest: JSON.parse(readFileSync(join(root, 'package.json')))});
    }
    const directories = {};
    for (const kind of ['vite', 'next']) {
        const {directory, versions} = prepareConsumer({kind, temporary, pack, run, record, output, overlays: [join(probes, kind)], refresh}); directories[kind] = directory;
        contracts(directory);
        const compilers = kind === 'next' ? ['typescript-5', 'typescript-min'] : ['typescript', 'typescript-min'];
        // The tool tuple of the run (the CI run report, PV9-1-04): the consumer graph and each compiler of the type fixtures.
        report.versions[kind] = {...versions, typescript: Object.fromEntries(compilers.map(compiler => [compiler, JSON.parse(readFileSync(join(directory, 'node_modules', compiler, 'package.json'), 'utf8')).version]))};
        for (const compiler of compilers) for (const mode of ['bundler', 'nodenext']) run(`${kind}-${compiler}-${mode}`, process.execPath, [`node_modules/${compiler}/lib/tsc.js`, '-p', `contracts/tsconfig.${mode}.json`], directory);
        writeFileSync(join(directory, 'package-smoke.mjs'), `
import assert from 'node:assert/strict'; import {readFileSync} from 'node:fs'; import {createRequire} from 'node:module'; import {createElement} from 'react'; import {renderToString} from 'react-dom/server';
globalThis.fetch = () => { throw new Error('SDK must not fetch'); };
const esm = await import('@nelmad/calendar'), require = createRequire(import.meta.url), cjs = require('@nelmad/calendar');
assert.deepEqual(Object.keys(esm).sort(), ['Calendar', 'classicTheme', 'getCalendarVisibleRange', 'neutralTheme']); assert.deepEqual(Object.keys(esm).sort(), Object.keys(cjs).sort());
assert.deepEqual([esm.neutralTheme, Object.isFrozen(cjs.neutralTheme)], [{name: 'neutral'}, true]);
const props = {items: [], anchorDate: '2026-09-01', today: '2026-09-03', timeZone: 'UTC', locale: 'en-US', onNavigate() {}, layout: 'desktop'};
const html = renderToString(createElement(esm.Calendar, props)); assert.match(html, /role="grid"/); assert.equal(html, renderToString(createElement(cjs.Calendar, props)));
for (const path of ['tokens.css', 'dist/index.js', 'Calendar', 'v02/core/date', 'v02/surface', 'package.json']) assert.throws(() => require.resolve('@nelmad/calendar/' + path), {code: 'ERR_PACKAGE_PATH_NOT_EXPORTED'});
const warnings = []; console.warn = message => warnings.push(String(message)); process.env.NODE_ENV = 'development';
const future = {...props, selection: {start: '2026-09-03', end: '2026-09-04'}, onSelectionChange() {}, interactionPolicy: {}, itemMoveStates: []};
for (const mod of [esm, esm, cjs]) assert.equal(renderToString(createElement(mod.Calendar, future)), html);
const version = JSON.parse(readFileSync(new URL('node_modules/@nelmad/calendar/package.json', import.meta.url))).version;
assert.equal(renderToString(createElement(esm.Calendar, {...props, portalContainer: null})), html); // accepted in alpha.2; portals are client-only
const expected = ['selection', 'onSelectionChange', 'interactionPolicy', 'itemMoveStates'].map(name => '[@nelmad/calendar] ' + name + ': not available in ' + version + '; ignored');
assert.deepEqual(warnings, [...expected, ...expected]);
// T17: item actions and controlled sources are accepted; the source selector is a server-rendered toolbar trigger in both formats.
const filtered = {...props, sources: [{id: 'a', title: 'A'}, {id: 'b', title: 'B'}], visibleSourceIds: ['b'], onVisibleSourceIdsChange() {}, getItemActions: () => [], onItemActionRequest() {}};
const selector = renderToString(createElement(esm.Calendar, filtered)); assert.match(selector, /data-source-selector/); assert.equal(selector, renderToString(createElement(cjs.Calendar, filtered)));
assert.deepEqual(warnings, [...expected, ...expected]);
// T18: the neutral preset, class callbacks and content slots are accepted and render identically in both formats.
const styled = {...props, theme: esm.neutralTheme, classNames: {root: 'host-root'}, renderToolbarContent: () => 'Extension', getItemAppearance: () => undefined};
const neutral = renderToString(createElement(esm.Calendar, styled)); assert.match(neutral, /data-theme="neutral"/); assert.match(neutral, /host-root/); assert.match(neutral, /Extension/);
assert.equal(neutral, renderToString(createElement(cjs.Calendar, {...styled, theme: cjs.neutralTheme}))); assert.deepEqual(warnings, [...expected, ...expected]);
const {layout: _layout, ...missing} = props;
for (const [value, layout] of [[missing, 'mobile'], [{...props, layout: 'mobile', agendaPresentation: 'overlay', mobileBreakpoint: 700}, 'mobile'], [props, 'desktop']]) {
    const tree = renderToString(createElement(esm.Calendar, value)); assert.match(tree, /role="grid"/); assert.match(tree, new RegExp('data-layout="' + layout + '"'));
    assert.equal(tree, renderToString(createElement(cjs.Calendar, value)));
}
const shell = renderToString(createElement(esm.Calendar, {...props, layout: 'tablet'})); assert.match(shell, /data-status="error"/); assert.doesNotMatch(shell, /role="grid"/);
console.log('ESM/CJS exports, SSR parity, surface gate (strip/warn once/layout contract, auto renders mobile on the server), blocked private/legacy imports; no DOM or network');
`);
        run(`${kind}-package-smoke`, process.execPath, ['package-smoke.mjs'], directory);
        if (kind === 'vite') run('vite-example-typecheck', 'npm', ['run', 'typecheck'], directory); // next build type-checks the Next app itself.
        const build = run(`${kind}-production-build`, 'npm', ['run', 'build'], directory);
        if (kind === 'vite') assert.doesNotMatch(readFileSync(join(output, 'vite-production-build.txt'), 'utf8'), /Module level directives|sourcemap for reporting|\(!\)/, 'Vite example build warnings');
        assert.match(build, kind === 'vite' ? /built in/ : /Compiled successfully/);
        if (kind === 'vite') {
            run('vite-module-graph', process.execPath, ['graph-check.mjs'], directory);
            cpSync(join(directory, 'graph-evidence.json'), join(output, 'module-graph.json'));
            // QA-01: harness-only server-rendered page whose Suspense boundary hydrates separately.
            const vite = ['node_modules/vite/bin/vite.js', 'build', '--config', 'suspense.vite.config.mjs'];
            run('vite-suspense-build', process.execPath, vite, directory);
            run('vite-suspense-ssr-build', process.execPath, [...vite, '--ssr', 'src/suspense/entry-server.tsx', '--outDir', 'dist-suspense-server'], directory);
            // QA-05: harness-only page with Calendar and its portals in a ShadowRoot.
            run('vite-shadow-build', process.execPath, ['node_modules/vite/bin/vite.js', 'build', '--config', 'shadow.vite.config.mjs'], directory);
        }
    }
    const {chromium} = await import('./spikes/node_modules/playwright/index.mjs');
    browser = await chromium.launch({channel: 'chrome', headless: true}); report.chrome = report.versions.chrome = browser.version();
    /**
     * QA-01: a calendar inside a separately hydrated Suspense boundary (Next loading.tsx streaming, a suspending
     * sibling) settles to idle in the production build: the main thread stays free for 3 s after hydration and
     * Enter on a date opens the agenda of the resolved layout.
     */
    async function settles(name, url, hydrated, cases) {
        const results = {};
        for (const [label, viewport, layout] of cases) {
            const context = await browser.newContext({viewport, locale: 'ru-RU', timezoneId: 'Europe/Moscow'});
            const page = await context.newPage(), errors = [];
            page.on('console', message => {if (['error', 'warning'].includes(message.type())) errors.push(`${message.type()}: ${message.text()}`);});
            page.on('pageerror', error => errors.push(String(error)));
            const cdp = await context.newCDPSession(page); await cdp.send('Performance.enable');
            const metrics = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(metric => [metric.name, metric.value]));
            await page.goto(url); await page.waitForFunction(hydrated); await page.waitForTimeout(500);
            const before = await metrics(); await page.waitForTimeout(3000); const after = await metrics();
            const busy = Math.round((after.TaskDuration - before.TaskDuration) * 1000);
            assert.ok(busy < 150, `${name} ${label}: main thread busy ${busy} ms during 3 s after hydration`);
            assert.equal(await page.locator('.nc-theme[data-layout]').first().getAttribute('data-layout'), layout);
            await page.locator('[role=gridcell][data-date="2026-09-03"]').focus(); await page.keyboard.press('Enter');
            if (layout === 'desktop') await page.getByRole('dialog').waitFor(); else await page.locator('section[data-presentation=inline] h3:focus').waitFor();
            await page.screenshot({path: join(output, `${name}-${label}.png`)});
            assert.deepEqual(errors, []);
            results[label] = {busyMs: busy, layout, taskDurationWindowMs: 3000};
            await context.close();
        }
        record(name, results);
    }
    const viewports = {desktop: {width: 1280, height: 1000}, mobile: {width: 390, height: 844}};
    /**
     * QA-05: React Aria presses inside a ShadowRoot (toolbar, agenda items, Close) and the modal sheet portaled into a
     * ShadowRoot in the production build of the packed consumer: background inert except the sheet path, `body` itself never
     * inert, focus on the sheet heading, a press reaches `onItemPress`, `Escape` restores the page (no inert, no scroll lock).
     */
    async function shadowChecks(base) {
        const results = {};
        const deepFocus = page => page.evaluate(() => { let node = document.activeElement; while (node?.shadowRoot?.activeElement) node = node.shadowRoot.activeElement; return `${node?.tagName}:${node?.textContent?.slice(0, 40)}`; });
        const page0 = async (kind, viewport, mobile) => {
            const context = await browser.newContext({viewport, locale: 'en-US', timezoneId: 'Europe/Moscow', ...(mobile ? {isMobile: true, hasTouch: true} : {})});
            const page = await context.newPage(), errors = [];
            page.on('console', message => {if (['error', 'warning'].includes(message.type())) errors.push(`${message.type()}: ${message.text()}`);});
            page.on('pageerror', error => errors.push(String(error)));
            await page.goto(`${base}/?case=${kind}`); await page.getByRole('grid').waitFor();
            return {context, page, errors, log: () => page.evaluate(() => window.__log.splice(0))};
        };
        for (const kind of ['all', 'portal']) {
            const {context, page, errors, log} = await page0(kind, viewports.desktop, false), result = {};
            await page.getByRole('button', {name: 'Next month'}).click(); result.mouseNext = await log();
            await page.getByRole('button', {name: 'Previous month'}).focus(); await page.keyboard.press('Enter'); result.keyboardPrevious = await log();
            assert.deepEqual([...result.mouseNext, ...result.keyboardPrevious], ['navigate 2026-10-01', 'navigate 2026-09-01'], `${kind}: toolbar presses`);
            const cell = page.locator('[role=gridcell][data-date="2026-09-03"]'), dialog = page.getByRole('dialog');
            await cell.focus(); await page.keyboard.press('Enter'); await dialog.waitFor();
            await dialog.getByRole('button', {name: /Review/}).click(); result.mouseItem = await log();
            await dialog.getByRole('button', {name: /Standup/}).focus(); await page.keyboard.press('Enter'); result.keyboardItem = await log();
            assert.deepEqual([...result.mouseItem, ...result.keyboardItem], ['press review agenda', 'press standup agenda'], `${kind}: agenda item presses`);
            await dialog.getByRole('button', {name: /Close/}).click(); await dialog.waitFor({state: 'hidden'});
            assert.ok(await cell.evaluate(node => node.getRootNode().activeElement === node), `${kind}: Close returns focus to the date`);
            assert.deepEqual(errors, []);
            results[kind] = result; await context.close();
        }
        for (const kind of ['sheet-document', 'sheet-shadow']) {
            const {context, page, errors, log} = await page0(kind, viewports.mobile, true);
            const state = () => page.evaluate(() => {
                const shadow = document.getElementById('host').shadowRoot, sheet = shadow.querySelector('[role=dialog]');
                let inertAncestor = null; for (let node = sheet; node; node = node.parentElement ?? node.getRootNode().host) if (node.inert) { inertAncestor = node.tagName; break; }
                return {dialogs: shadow.querySelectorAll('[role=dialog]').length, bodyInert: document.body.inert, inert: [...document.querySelectorAll('[inert]')].map(node => node.id || node.tagName),
                    inertAncestor, htmlOverflow: getComputedStyle(document.documentElement).overflow};
            });
            const cell = page.locator('[role=gridcell][data-date="2026-09-03"]');
            await cell.focus(); await page.keyboard.press('Enter'); await page.getByRole('dialog').waitFor();
            const open = await state(), focus = await deepFocus(page);
            assert.equal(open.dialogs, 1); assert.equal(open.bodyInert, false, `${kind}: body is never inert`); assert.equal(open.inertAncestor, null, `${kind}: the sheet is not inert`);
            assert.deepEqual(open.inert, kind === 'sheet-document' ? ['before', 'DIV', 'after'] : ['before', 'after'], `${kind}: only the background is inert`);
            assert.equal(open.htmlOverflow, 'hidden'); assert.match(focus, /^H3:Events for/, `${kind}: focus starts on the sheet heading`);
            const item = page.getByRole('dialog').getByRole('button', {name: /Review/}), box = await item.boundingBox();
            await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
            assert.deepEqual(await log(), ['press review agenda'], `${kind}: a tap in the sheet reaches onItemPress`);
            await page.keyboard.press('Escape'); await page.getByRole('dialog').waitFor({state: 'hidden'});
            const closed = await state();
            assert.deepEqual({...closed, focusOnCell: await cell.evaluate(node => node.getRootNode().activeElement === node)},
                {dialogs: 0, bodyInert: false, inert: [], inertAncestor: null, htmlOverflow: 'visible', focusOnCell: true}, `${kind}: Escape restores the page`);
            assert.deepEqual(errors, []);
            results[kind] = {open: {...open, focus}, closed}; await context.close();
        }
        record('vite-shadow-root-presses-and-sheet', results);
    }
    for (const [i, kind] of ['vite', 'next'].entries()) {
        const port = 4387 + i, base = `http://127.0.0.1:${port}`;
        const html = await serve(kind, directories[kind], port);
        assert.match(html, /role="grid"/); assert.match(html, /10 событий/); assert.match(html, /2026-08-31/);
        assert.match(html, /<h1 id="release-title">Релиз 0.2<\/h1>/); if (kind === 'vite') assert.match(html, /<script id="app-data" type="application\/json">/);
        writeFileSync(join(output, `${kind}-server.html`), html);
        record(`${kind}-server-html`, {sha256: hash(html)});
        const context = await browser.newContext({viewport: {width: 1280, height: 1000}, locale: 'en-US', timezoneId: 'America/Los_Angeles'});
        const page = await context.newPage(), errors = [], network = [];
        page.on('console', message => {if (['error', 'warning'].includes(message.type())) errors.push(`${message.type()}: ${message.text()}`);});
        page.on('pageerror', error => errors.push(String(error)));
        page.on('request', request => {if (!request.url().startsWith(base) && !request.url().startsWith('data:')) network.push(request.url());});
        const requests = page.locator('#requests li'), outcomes = async () => (await requests.evaluateAll(nodes => nodes.map(node => `${node.dataset.outcome} ${node.querySelector('code').textContent}`))).reverse();
        const logged = count => page.waitForFunction(length => document.querySelectorAll('#requests li').length >= length, count);
        const september = '2026-08-31 → 2026-10-05 · Europe/Moscow', october = '2026-09-28 → 2026-11-02 · Europe/Moscow', november = '2026-10-26 → 2026-12-07 · Europe/Moscow';
        // The first client notification follows hydration and repeats the prefetched range: no request.
        await page.goto(base); await page.locator('#requests li[data-outcome=cached]').waitFor();
        assert.deepEqual(await outcomes(), [`prefetch ${september}`, `cached ${september}`]);
        assert.equal(await page.locator('#visible-range').innerText(), september);
        assert.equal(await page.getByRole('grid').count(), 1);
        assert.equal(await page.getByRole('region', {name: 'Релиз 0.2'}).count(), 1);
        assert.equal(await page.locator('[role=gridcell][tabindex="0"]').count(), 1);
        assert.equal(await page.locator('.nc-theme').first().evaluate(node => getComputedStyle(node).getPropertyValue('--nelmad-calendar-color-surface').trim()), '#fff');
        record(`${kind}-hydration-css-roving-prefetch-dedup`);
        const day = page.locator('[role=gridcell][data-date="2026-09-03"]');
        await day.focus(); await page.keyboard.press('Enter');
        const dialog = page.getByRole('dialog'); await dialog.waitFor();
        assert.equal(await dialog.getByRole('listitem').count(), 10);
        await page.screenshot({path: join(output, `${kind}-agenda.png`), fullPage: true});
        await dialog.getByRole('button', {name: /Проверка релиза/}).click();
        assert.deepEqual(JSON.parse(await page.locator('#pressed').innerText()), {id: 'review', view: 'agenda', date: '2026-09-03', data: {ticket: 43, owner: 'oleg'}});
        await page.keyboard.press('Escape'); await dialog.waitFor({state: 'hidden'});
        assert.ok(await day.evaluate(node => node === document.activeElement));
        record(`${kind}-agenda-press-escape`);
        const monday = page.locator('[role=gridcell][data-date="2026-09-07"]');
        await monday.focus(); await page.keyboard.press('Enter'); await dialog.waitFor();
        assert.equal(await page.locator('#agenda-date').innerText(), '2026-09-07');
        assert.equal(await dialog.getByRole('listitem').count(), 1);
        await dialog.getByRole('button', {name: /Планёрка/}).click();
        assert.equal(JSON.parse(await page.locator('#pressed').innerText()).id, 'planning-2026-09-07');
        await page.keyboard.press('Escape'); await dialog.waitFor({state: 'hidden'});
        await page.locator('.nc-month-item[data-item-id=sprint]').click({position: {x: 8, y: 8}});
        assert.deepEqual(JSON.parse(await page.locator('#pressed').innerText()), {id: 'sprint', view: 'month', date: '2026-09-02', segmentRange: {start: '2026-09-02', end: '2026-09-06'}, data: {ticket: 42, owner: 'anna'}});
        record(`${kind}-controlled-agenda-month-press`);
        await page.getByRole('button', {name: 'Следующий месяц'}).click();
        await page.getByRole('grid', {name: /октябр/i}).waitFor();
        await page.locator('#requests li[data-outcome=loaded]').waitFor(); await logged(4);
        assert.deepEqual((await outcomes()).slice(2), [`request ${october}`, `loaded ${october}`]);
        await page.locator('.nc-month-item[data-item-id=launch]').waitFor();
        await page.getByRole('button', {name: 'Предыдущий месяц'}).click();
        await page.getByRole('grid', {name: /сентябр/i}).waitFor(); await logged(5);
        assert.deepEqual((await outcomes()).slice(4), [`cached ${september}`]);
        record(`${kind}-controlled-navigation-range-loading`);
        await page.getByRole('checkbox', {name: 'Сбой следующего запроса'}).check();
        await page.getByRole('button', {name: 'Следующий месяц'}).click(); await page.getByRole('grid', {name: /октябр/i}).waitFor();
        await page.getByRole('button', {name: 'Следующий месяц'}).click(); await page.getByRole('grid', {name: /ноябр/i}).waitFor();
        await page.locator('.nc-theme[data-status=error]').waitFor();
        assert.equal(await page.getByRole('grid').count(), 1, 'Refresh error keeps the stale grid');
        assert.equal(await page.getByRole('checkbox', {name: 'Сбой следующего запроса'}).isChecked(), false);
        await page.getByRole('button', {name: 'Повторить'}).click();
        await page.locator('.nc-theme[data-status=ready]').waitFor(); await logged(10);
        assert.deepEqual((await outcomes()).slice(5), [`cached ${october}`, `request ${november}`, `failed ${november}`, `request ${november}`, `loaded ${november}`]);
        record(`${kind}-refresh-error-retry`);
        await page.getByRole('button', {name: 'Очистить кэш и загрузить заново'}).click();
        await page.locator('.nc-theme[data-loading-phase=initial]').waitFor();
        assert.equal(await page.getByRole('grid').count(), 0, 'Initial loading replaces the grid');
        await page.locator('.nc-theme[data-status=ready]').waitFor(); await page.getByRole('grid', {name: /ноябр/i}).waitFor();
        await page.getByLabel('Язык').selectOption('en-US');
        await page.getByRole('grid', {name: 'November 2026'}).waitFor();
        await page.locator('#requests li[data-outcome=loaded] code', {hasText: '2026-11-01 → 2026-12-06 · Europe/Moscow'}).waitFor();
        assert.equal(await page.locator('#visible-range').innerText(), '2026-11-01 → 2026-12-06 · Europe/Moscow');
        assert.equal(await page.locator('[role=columnheader]').first().getAttribute('aria-label'), 'Sunday');
        record(`${kind}-initial-reload-and-en-US-switch`);
        // Quick start without a `today` snapshot: the server renders Today disabled, the client enables it after hydration.
        const quick = await fetch(`${base}/quick-start`).then(response => response.text());
        assert.match(quick, /role="grid"/); assert.match(quick, /<button[^>]*disabled=""[^>]*>(?:<[^>]*>)*Сегодня</);
        writeFileSync(join(output, `${kind}-quick-start.html`), quick);
        await page.goto(`${base}/quick-start`);
        await page.waitForFunction(() => [...document.querySelectorAll('button')].some(button => button.textContent === 'Сегодня' && !button.disabled));
        await page.locator('.nc-month-item[data-item-id=standup]').click();
        assert.equal(await page.locator('#opened').innerText(), 'Стендап: 301');
        assert.equal(await page.locator('[role=gridcell][data-date="2026-09-11"]').getAttribute('data-has-items'), 'true');
        assert.equal(await page.locator('[role=gridcell][data-date="2026-09-12"]').getAttribute('data-has-items'), null);
        await page.screenshot({path: join(output, `${kind}-quick-start.png`), fullPage: true});
        record(`${kind}-quick-start`, {sha256: hash(quick)});
        // T19: the documented alpha.2 integrations route (auto layout, actions, delayed source filter, neutralTheme + slots, ShadowRoot).
        const work = await fetch(`${base}/workspace`).then(response => response.text());
        assert.match(work, /role="grid"/); assert.match(work, /data-theme="neutral"/); assert.match(work, /data-layout="mobile"/); assert.match(work, /data-presentation="inline"/);
        writeFileSync(join(output, `${kind}-workspace.html`), work);
        await page.goto(`${base}/workspace`); await page.locator('.nc-calendar[data-layout=desktop]').waitFor();
        const workLog = () => page.locator('#workspace-log li').allInnerTexts();
        await page.locator('[role=gridcell][data-date="2026-09-03"]').focus(); await page.keyboard.press('Enter'); await dialog.waitFor();
        await dialog.locator('[data-item-id=triage] [data-agenda-control=actions]').focus(); await page.keyboard.press('Enter');
        await page.getByRole('menuitem', {name: 'Удалить'}).click(); await dialog.locator('[data-item-id=triage]').waitFor({state: 'detached'});
        assert.deepEqual(await workLog(), ['Удалена: Разбор обращений']);
        await page.keyboard.press('Escape'); await dialog.waitFor({state: 'hidden'});
        await page.locator('[data-source-selector]').click(); await page.getByRole('menu').waitFor();
        const product = page.getByRole('menuitemcheckbox').first();
        await product.click();
        assert.equal(await product.getAttribute('aria-checked'), 'true', 'the filter waits for the saved value');
        assert.equal(await page.locator('#workspace-saving').innerText(), 'Сохранение фильтра…');
        await page.locator('#workspace-saving', {hasText: 'Фильтр сохранён'}).waitFor();
        assert.equal(await product.getAttribute('aria-checked'), 'false');
        await page.keyboard.press('Escape');
        const shown = await page.locator('.nc-month-item').evaluateAll(nodes => [...new Set(nodes.map(node => node.dataset.itemId))].sort());
        assert.deepEqual(shown, ['deploy', 'holiday', 'legacy'], 'hidden product items; no calendarId and an unknown one stay visible');
        await page.getByRole('button', {name: 'Просторно'}).click();
        assert.equal(await page.locator('.nc-calendar').getAttribute('data-density'), 'comfortable');
        const rootName = locator => locator.evaluate(node => [node.getAttribute('aria-label'), node.getAttribute('aria-labelledby')]);
        const names = {document: await rootName(page.locator('.nc-calendar'))};
        await page.getByLabel('В ShadowRoot').check();
        const shadowCell = page.locator('.workspace-shadow [role=gridcell][data-date="2026-09-03"]'); await shadowCell.waitFor();
        assert.ok(await shadowCell.evaluate(node => node.getRootNode() instanceof ShadowRoot));
        // T19-V1-02: the heading is outside the ShadowRoot, so there the example names the calendar with aria-label.
        names.shadow = await rootName(page.locator('.workspace-shadow .nc-calendar'));
        assert.deepEqual(names, {document: ['Календарь', 'workspace-title'], shadow: ['Рабочее пространство', null]}, 'the calendar keeps the page name in both tree scopes');
        await shadowCell.focus(); await page.keyboard.press('Enter'); await page.getByRole('dialog').waitFor();
        assert.ok(await page.getByRole('dialog').evaluate(node => node.getRootNode() instanceof ShadowRoot), 'the agenda is portaled into the ShadowRoot');
        assert.equal(await page.getByRole('dialog').evaluate(node => node.closest('.nc-theme').dataset.theme), 'neutral');
        await page.keyboard.press('Escape'); await page.getByRole('dialog').waitFor({state: 'hidden'});
        assert.ok(await shadowCell.evaluate(node => node.getRootNode().activeElement === node), 'focus returns inside the ShadowRoot');
        await page.screenshot({path: join(output, `${kind}-workspace.png`), fullPage: true});
        {
            const phone = await browser.newContext({viewport: viewports.mobile, isMobile: true, hasTouch: true, locale: 'ru-RU', timezoneId: 'Europe/Moscow'});
            const tab = await phone.newPage(), phoneErrors = [];
            tab.on('console', message => {if (['error', 'warning'].includes(message.type())) phoneErrors.push(`${message.type()}: ${message.text()}`);});
            tab.on('pageerror', error => phoneErrors.push(String(error)));
            await tab.goto(`${base}/workspace`); await tab.locator('.nc-calendar[data-layout=mobile] [data-presentation=inline]').waitFor();
            await tab.locator('[role=gridcell][data-date="2026-09-08"]').tap();
            await tab.locator('[data-presentation=inline][data-date="2026-09-08"]').waitFor();
            await tab.getByLabel('Повестка на телефоне').selectOption('overlay');
            await tab.locator('[role=gridcell][data-date="2026-09-03"]').tap(); await tab.locator('[data-presentation=sheet]').waitFor();
            await tab.locator('[data-presentation=sheet] [data-item-id=roadmap] [data-agenda-control=actions]').tap();
            await tab.getByRole('dialog', {name: /Роадмап квартала/}).waitFor();
            await tab.getByRole('button', {name: 'Отметить выполненной'}).tap();
            await tab.locator('[data-presentation=sheet] [data-item-id=roadmap]', {hasText: 'выполнено'}).waitFor();
            await tab.screenshot({path: join(output, `${kind}-workspace-mobile.png`)});
            await tab.keyboard.press('Escape'); await tab.locator('[data-presentation=sheet]').waitFor({state: 'detached'});
            assert.deepEqual(phoneErrors, []); await phone.close();
        }
        record(`${kind}-workspace-alpha2-integrations`, {sha256: hash(work), shown, names});
        if (kind === 'next') {
            const boundary = await fetch(`${base}/boundary`); assert.equal(boundary.status, 200); assert.match(await boundary.text(), /role="grid"/);
            await page.goto(`${base}/boundary`); await page.getByRole('grid').waitFor();
            await page.locator('[role=gridcell][data-date="2026-09-03"]').focus(); await page.keyboard.press('Enter'); await page.getByRole('dialog').waitFor();
            assert.equal(await page.locator('#boundary-range').innerText(), '2026-08-30');
            record('next-sdk-client-boundary-from-server');
            // loading.tsx streams the segment; without `today` the Today button is enabled once the calendar hydrated.
            const enabled = () => [...document.querySelectorAll('button')].some(button => button.textContent === 'Сегодня' && !button.disabled);
            await settles('next-streaming-suspense-settles', `${base}/streaming`, enabled, [['desktop', viewports.desktop, 'desktop'], ['mobile', viewports.mobile, 'mobile']]);
        } else {
            const suspense = 'http://127.0.0.1:4389';
            await serve('vite', directories.vite, 4389, {name: 'vite-suspense', args: ['suspense-server.mjs']});
            const hydrated = () => document.documentElement.dataset.hydrated === 'true';
            await settles('vite-suspense-auto-settles', `${suspense}/`, hydrated, [['desktop', viewports.desktop, 'desktop'], ['mobile', viewports.mobile, 'mobile']]);
            await settles('vite-suspense-desktop-settles', `${suspense}/desktop`, hydrated, [['desktop', viewports.desktop, 'desktop'], ['mobile', viewports.mobile, 'desktop']]);
            await serve('vite', directories.vite, 4390, {name: 'vite-shadow', args: ['shadow-server.mjs']});
            await shadowChecks('http://127.0.0.1:4390');
        }
        assert.deepEqual(errors, []); assert.deepEqual(network, []);
        record(`${kind}-no-console-or-external-network`, {errors, network});
        await context.close();
    }
    report.outcome = 'pass';
} catch (error) {
    report.outcome = 'fail'; report.error = String(error); console.error(String(error).slice(0, 6000)); process.exitCode = 1;
} finally {
    await browser?.close();
    await stop();
    report.finishedAt = new Date().toISOString(); save();
    console.log(`Report: ${output}`);
}
