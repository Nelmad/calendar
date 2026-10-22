import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdtempSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, resolve} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {build} from 'vite';

// T15 real-Chrome probe: container-based auto layout, the single agenda presentation lifecycle and the
// rows R38/R45/R46/R54/R56 through the public Calendar in development StrictMode, Document and ShadowRoot.
// Usage: node scripts/implementation/responsive-probe.mjs <outputDir>
const here = dirname(fileURLToPath(import.meta.url)), root = resolve(here, '../..');
const output = resolve(process.argv[2] ?? resolve(tmpdir(), 'calendar-responsive'));
mkdirSync(output, {recursive: true});
const directory = mkdtempSync(resolve(tmpdir(), 'calendar-responsive-'));
// Development React: StrictMode replays effects, exactly what the rows require to stay silent.
await build({configFile: false, logLevel: 'error', define: {'process.env.NODE_ENV': '"development"'}, mode: 'development',
    build: {outDir: directory, minify: false, lib: {entry: resolve(here, 'responsive-entry.tsx'), formats: ['es', 'cjs'], fileName: format => format === 'es' ? 'index.mjs' : 'index.cjs'}}});
const esm = await import(pathToFileURL(resolve(directory, 'index.mjs')));
const moduleUrl = 'data:text/javascript;base64,' + readFileSync(resolve(directory, 'index.mjs')).toString('base64');
const css = readFileSync(resolve(root, 'src/v02/styles.css'), 'utf8');
const {chromium} = await import('./spikes/node_modules/playwright/index.mjs');
const browser = await chromium.launch({channel: 'chrome', headless: true});
// QA-04: classic (space-taking) scrollbars, as on Windows/Linux or macOS "always show scroll bars".
let classicBrowser;
const classic = async () => classicBrowser ??= await chromium.launch({channel: 'chrome', headless: true, ignoreDefaultArgs: ['--hide-scrollbars'],
    args: ['--disable-features=OverlayScrollbar,OverlayScrollbars']});
const checks = [], errors = [], consoleErrors = [], version = browser.version();
// Development aid only: a filtered run is marked in the report and never counts as complete evidence.
const only = process.env.CALENDAR_PROBE_ONLY ? new RegExp(process.env.CALENDAR_PROBE_ONLY) : null;
const check = async (name, operation) => {
    if (only && !only.test(name)) return;
    try { const details = await operation(); checks.push({name, outcome: 'pass', ...(details ? {details} : {})}); }
    catch (error) { checks.push({name, outcome: 'fail', error: String(error?.stack ?? error)}); }
    writeFileSync(resolve(output, 'checks.json'), JSON.stringify(checks, null, 2) + '\n');
    console.log(`${checks.at(-1).outcome}: ${name}${checks.at(-1).error ? '\n' + checks.at(-1).error : ''}`);
};
const samples = [
    {id: 'alpha', title: 'Release preparation', data: {}, interval: {kind: 'allDay', start: '2026-03-03', end: '2026-03-06'}},
    {id: 'beta', title: 'Design review', data: {}, interval: {kind: 'timed', start: '2026-03-04T10:30:00Z', end: '2026-03-04T11:30:00Z'}},
    {id: 'gamma', title: 'Team sync', data: {}, interval: {kind: 'timed', start: '2026-03-11T12:00:00Z'}},
];
// Root padding is 16px per side (border-box): a container of 671px gives a 639px content box.
const box = content => content + 32;
const settle = page => page.evaluate(async () => { for (let i = 0; i < 6; i++) await new Promise(requestAnimationFrame); });
const patch = async (page, props) => { await page.evaluate(props => window.cal.patch(props), props); await settle(page); };
const width = async (page, value) => { await page.evaluate(value => { window.fixture.style.width = `${value}px`; }, value); await settle(page); };
const cell = (page, date) => page.locator(`[role=gridcell][data-date="${date}"]`);
const info = page => page.evaluate(() => window.info());
const snap = page => page.evaluate(() => window.snapshot());
const open = async (page, date = '2026-03-04') => { await cell(page, date).focus(); await page.keyboard.press('Enter'); await settle(page); };

async function setup({shadow = false, options = {}, container = 1000, hidden = false, viewport = {width: 1280, height: 900}, timezoneId = 'Europe/Berlin', colorScheme = 'light', html, now,
    suspense = false, scrollbars = false}) {
    const context = await (scrollbars ? await classic() : browser).newContext({viewport, locale: 'de-DE', hasTouch: true, timezoneId, colorScheme});
    const page = await context.newPage();
    page.setDefaultTimeout(4000);
    page.on('pageerror', error => errors.push(String(error)));
    page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
    const server = html ?? (suspense ? esm.serverSuspense(options) : esm.serverResponsive(options)).html;
    await page.setContent('<style>body{margin:0;font:16px/1.4 system-ui;background:#f5f4f1}#outside,#after{margin:8px}</style><button id="outside">Outside</button><p id="blank">Blank area</p><div id="owner"></div><button id="after">After</button>');
    await page.evaluate(async ({shadow, moduleUrl, css, server, options, container, hidden, now, suspense}) => {
        window.__now = now ?? Date.parse('2026-03-04T12:00:00Z');
        Date.now = () => window.__now;
        // Count ResizeObserver instances and their targets (the hook must own exactly one for auto).
        const Native = window.ResizeObserver; window.__ro = new Set();
        window.ResizeObserver = class extends Native {
            constructor(callback) { super(callback); this.targets = new Set(); window.__ro.add(this); }
            observe(target, options) { this.targets.add(target); super.observe(target, options); }
            unobserve(target) { this.targets.delete(target); super.unobserve(target); }
            disconnect() { this.targets.clear(); window.__ro.delete(this); super.disconnect(); }
        };
        const host = document.getElementById('owner'), scope = shadow ? host.attachShadow({mode: 'open'}) : host;
        const style = document.createElement('style'); style.textContent = css; scope.append(style);
        // §10.3.4 (T16): overlays portal into the owner document body by default, a separate tree scope for a
        // calendar in a ShadowRoot, so the consumer loads styles.css there as well.
        if (shadow) document.head.append(style.cloneNode(true));
        const fixture = document.createElement('div'); fixture.id = 'fixture'; if (container !== null) fixture.style.width = `${container}px`; if (hidden === 'attribute') fixture.hidden = true; else if (hidden) fixture.style.display = 'none'; fixture.innerHTML = server; scope.append(fixture);
        window.scope = scope; window.fixture = fixture;
        window.all = selector => [...new Set([...document.querySelectorAll(selector), ...(scope instanceof ShadowRoot ? scope.querySelectorAll(selector) : [])])];
        window.active = () => { let node = document.activeElement; while (node?.shadowRoot?.activeElement) node = node.shadowRoot.activeElement; return node; };
        window.info = () => {
            const node = window.active();
            return {id: node?.id || undefined, date: node?.dataset?.date, item: node?.closest?.('[data-item-id]')?.dataset.itemId,
                presentation: node?.closest?.('[data-presentation]')?.dataset.presentation, heading: node?.tagName === 'H3', close: !!node?.hasAttribute?.('data-agenda-close'),
                label: node?.getAttribute?.('aria-label') ?? undefined, tag: node?.tagName};
        };
        const calendar = () => window.all('.nc-calendar')[0];
        window.snapshot = () => ({layout: calendar()?.dataset.layout, dialogs: window.all('[role=dialog]').length, modal: window.all('[aria-modal=true]').length,
            presentations: window.all('[data-presentation]').map(node => `${node.dataset.presentation}@${node.dataset.date}`),
            inert: window.all('[inert]').length, overflow: document.documentElement.style.overflow, backdrops: window.all('.nc-backdrop').length,
            observers: [...window.__ro].filter(observer => [...observer.targets].some(target => target === calendar())).length,
            live: [...window.live], mounts: [...window.mounts]});
        // QA-04: the resolved layout with the content box it produces itself and the page scrollbar of that layout.
        window.contentOf = () => {
            const root = calendar(), style = getComputedStyle(root);
            return {layout: root.dataset.layout, layouts: window.layouts.length, scrollbar: innerWidth - document.documentElement.clientWidth,
                content: Number.parseFloat(style.width) - Number.parseFloat(style.paddingLeft) - Number.parseFloat(style.paddingRight)};
        };
        window.ssrLayout = fixture.querySelector('.nc-calendar')?.dataset.layout;
        window.ssrColorScheme = fixture.querySelector('.nc-calendar')?.dataset.colorScheme;
        window.ssrMatches = fixture.innerHTML === server;
        // Every committed data-layout value from hydration on, including values replaced within one task.
        window.layouts = [fixture.querySelector('.nc-calendar')?.dataset.layout];
        new MutationObserver(records => {
            const changes = records.filter(record => record.attributeName === 'data-layout');
            changes.forEach((record, index) => window.layouts.push(index + 1 < changes.length ? changes[index + 1].oldValue : record.target.dataset.layout));
        }).observe(fixture, {subtree: true, attributes: true, attributeOldValue: true, attributeFilter: ['data-layout']});
        const module = await import(moduleUrl);
        window.cal = await (suspense ? module.hydrateSuspense : module.hydrateResponsive)(fixture, options);
        window.live = []; window.mounts = [];
        new MutationObserver(records => { for (const record of records) if (record.addedNodes.length || record.removedNodes.length) window.live.push(record.target.textContent); })
            .observe(window.all('.nc-calendar [role=status]')[0], {childList: true});
        const mounted = records => { for (const record of records) for (const node of record.addedNodes) if (node.nodeType === 1) {
            for (const agenda of [node, ...node.querySelectorAll('[data-presentation]')]) if (agenda.matches('[data-presentation]')) window.mounts.push(`${agenda.dataset.presentation}@${agenda.dataset.date}`);
        } };
        // A light-DOM scope is already inside body; a ShadowRoot needs its own observer.
        for (const target of scope instanceof ShadowRoot ? [document.body, scope] : [document.body]) new MutationObserver(mounted).observe(target, {childList: true, subtree: true});
    }, {shadow, moduleUrl, css, server, options, container, hidden, now, suspense});
    await settle(page);
    return {page, context};
}
async function scenario(name, config, body) {
    if (only && !only.test(name)) return;
    await check(name, async () => {
        const fixture = await setup(config);
        try {
            const recoverable = await fixture.page.evaluate(() => window.cal.errors);
            assert.deepEqual(recoverable, [], 'hydration must not recover from mismatches');
            return await body(fixture.page, fixture);
        } finally { await fixture.context.close(); }
    });
}
const serverIn = (TZ, options) => JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e',
    `const m = await import(${JSON.stringify(pathToFileURL(resolve(directory, 'index.mjs')).href)}); process.stdout.write(JSON.stringify(m.serverResponsive(${JSON.stringify(options)}).html));`],
{env: {...process.env, TZ, LC_ALL: TZ === 'Asia/Tokyo' ? 'ja_JP.UTF-8' : 'de_DE.UTF-8'}, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024}));

try {
    for (const shadow of [false, true]) {
        const label = shadow ? 'shadow' : 'document';
        await scenario(`${label}: auto resolves the root content box exactly at 639/640 px; SSR and first render are mobile (R54)`, {shadow, options: {items: samples}, container: 1000}, async page => {
            assert.equal(await page.evaluate(() => window.ssrLayout), 'mobile'); assert.equal(await page.evaluate(() => window.ssrMatches), true);
            const results = [];
            assert.equal((await snap(page)).layout, 'desktop');
            for (const [content, layout] of [[639, 'mobile'], [639.5, 'mobile'], [640, 'desktop'], [641, 'desktop'], [639.99, 'mobile'], [368, 'mobile'], [1000, 'desktop']]) {
                await width(page, box(content));
                const state = await snap(page), measured = await page.evaluate(() => { const node = window.all('.nc-calendar')[0], style = getComputedStyle(node);
                    return Number.parseFloat(style.width) - Number.parseFloat(style.paddingLeft) - Number.parseFloat(style.paddingRight); });
                assert.equal(state.layout, layout, `${content}px content box`); assert.ok(Math.abs(measured - content) < 0.02, `content box ${measured}`);
                const markers = await page.evaluate(() => ({indicators: window.all('.nc-day-indicator').length, segments: window.all('.nc-month-segments').length, overflow: window.all('.nc-overflow').length}));
                assert.equal(markers.indicators > 0, layout === 'mobile'); assert.equal(markers.segments > 0 || markers.overflow > 0, layout === 'desktop');
                assert.equal(state.observers, 1); results.push({content, layout});
            }
            return results;
        });
        // Spec v7 §11.3 (decision 2026-10-09): with agendaPresentation="overlay" the server and first client render of auto are
        // the compact month without any agenda; nothing mounts before activation, then the resolved overlay opens once.
        for (const [container, presentation] of [[400, 'sheet'], [1000, 'popover']]) {
            const options = {items: samples, agendaPresentation: 'overlay'}, html = esm.serverResponsive(options).html;
            await scenario(`${label}: spec v7 §11.3 auto + overlay @${container}px: server and first client render have no agenda; none mounts before activation, then one ${presentation}`,
                {shadow, options, container, viewport: {width: container + 120, height: 900}}, async page => {
                assert.equal(html.includes('data-presentation='), false, 'no agenda in the server HTML'); assert.equal(html.includes('role="dialog"'), false);
                assert.deepEqual(await page.evaluate(() => ({layout: window.ssrLayout, matches: window.ssrMatches})), {layout: 'mobile', matches: true});
                const before = await snap(page);
                assert.equal(before.layout, container < 672 ? 'mobile' : 'desktop'); assert.deepEqual(before.presentations, []);
                assert.deepEqual(await page.evaluate(() => window.mounts), [], 'nothing mounted after hydration');
                await cell(page, '2026-03-04').click({position: {x: 6, y: 6}}); await settle(page);
                assert.deepEqual(await page.evaluate(() => window.mounts), [`${presentation}@2026-03-04`]);
                return {layout: before.layout, mounts: await page.evaluate(() => window.mounts)};
            });
        }
        await scenario(`${label}: container width, not the viewport, decides; forced layouts and the breakpoint never need an observer`, {shadow, options: {items: samples}, container: 400}, async page => {
            assert.equal((await snap(page)).layout, 'mobile');
            await patch(page, {mobileBreakpoint: 500}); await width(page, box(499)); assert.equal((await snap(page)).layout, 'mobile');
            await width(page, box(500)); assert.equal((await snap(page)).layout, 'desktop');
            await patch(page, {layout: 'mobile'}); await width(page, 1200); let state = await snap(page);
            assert.equal(state.layout, 'mobile'); assert.equal(state.observers, 0);
            await patch(page, {layout: 'desktop'}); await width(page, 300); state = await snap(page);
            assert.equal(state.layout, 'desktop'); assert.equal(state.observers, 0);
            await patch(page, {layout: 'auto'}); state = await snap(page); assert.equal(state.layout, 'mobile'); assert.equal(state.observers, 1);
            await page.evaluate(() => window.cal.unmount()); assert.equal(await page.evaluate(() => window.__ro.size), 0);
        });
        // T15-V1-01: without a layout box Chrome's getComputedStyle reports the specified width ('900px',
        // '800px' for 50em, '100%'), which must not count as a measurement (§7: unmeasurable stays mobile).
        for (const [variant, style] of [['900px', {width: 900}], ['50em', {width: '50em'}], ['default 100%', undefined]]) {
            await scenario(`${label}: a display:none ancestor at hydration is unmeasurable (${variant} root width): mobile until shown (§7)`, {shadow, options: {items: samples, ...(style ? {style} : {})}, container: 1000, hidden: true}, async page => {
                const specified = await page.evaluate(() => getComputedStyle(window.all('.nc-calendar')[0]).width);
                let state = await snap(page);
                assert.equal(state.layout, 'mobile', `hidden root reports ${specified}`); assert.equal(state.observers, 1); assert.deepEqual(state.presentations, ['inline@2026-03-04']);
                await page.evaluate(() => { window.fixture.style.display = ''; }); await settle(page); state = await snap(page);
                assert.equal(state.layout, 'desktop'); assert.deepEqual(state.presentations, []);
                return {specified};
            });
        }
        // T15-V1-01 re-check (QA-A): a `hidden` attribute ancestor and a root that is itself display:none, both with a
        // specified 900px width, are unmeasurable too; showing them measures the real content box.
        for (const [variant, hidden, style, show] of [['hidden attribute ancestor', 'attribute', {width: 900}, () => { window.fixture.hidden = false; }],
            ['display:none root', false, {width: 900, display: 'none'}, null]]) {
            await scenario(`${label}: ${variant} at hydration with a specified 900px root width is unmeasurable: mobile until shown (T15-V1-01)`,
                {shadow, options: {items: samples, style}, container: 1000, hidden}, async page => {
                    const specified = await page.evaluate(() => getComputedStyle(window.all('.nc-calendar')[0]).width);
                    let state = await snap(page);
                    assert.equal(state.layout, 'mobile', `hidden root reports ${specified}`); assert.deepEqual(state.presentations, ['inline@2026-03-04']);
                    if (show) await page.evaluate(show); else await patch(page, {style: {width: 900}});
                    await settle(page); state = await snap(page);
                    assert.equal(state.layout, 'desktop'); assert.deepEqual(state.presentations, []);
                    return {specified, shown: state.layout};
                });
        }
        await scenario(`${label}: a breakpoint change or a forced → auto switch while hidden switches nothing from the specified width (§7)`, {shadow, options: {items: samples}, container: 1000}, async page => {
            assert.equal((await snap(page)).layout, 'desktop');
            const hide = value => page.evaluate(value => { window.fixture.style.display = value ? 'none' : ''; }, value);
            await hide(true); await settle(page); assert.equal((await snap(page)).layout, 'desktop');
            const before = (await snap(page)).mounts.length;
            await patch(page, {mobileBreakpoint: 700}); let state = await snap(page);
            assert.equal(state.layout, 'desktop', 'last valid width 1000 against 700'); assert.deepEqual(state.mounts.slice(before), [], 'no inline agenda mounts while hidden');
            await patch(page, {mobileBreakpoint: 1200}); assert.equal((await snap(page)).layout, 'mobile', 'last valid width 968 against 1200');
            await hide(false); await settle(page); assert.equal((await snap(page)).layout, 'mobile');
            await patch(page, {mobileBreakpoint: 700}); assert.equal((await snap(page)).layout, 'desktop');
            await patch(page, {layout: 'desktop'}); await hide(true); await settle(page);
            await patch(page, {layout: 'auto'}); state = await snap(page);
            assert.equal(state.layout, 'mobile', 'an unmeasurable root drops the forced carry-over (T15-V1-03)'); assert.equal(state.observers, 1);
            await hide(false); await settle(page); state = await snap(page); assert.equal(state.layout, 'desktop'); assert.equal(state.dialogs, 0);
            await page.evaluate(() => window.cal.unmount()); assert.equal(await page.evaluate(() => window.__ro.size), 0);
        });
        await scenario(`${label}: focus in the inline agenda follows a resize into exactly one popover and back (R38)`, {shadow, options: {items: samples}, container: 400}, async page => {
            await page.locator('[data-presentation=inline] [data-item-id=beta] button').click(); await settle(page);
            assert.deepEqual(await info(page), {...await info(page), item: 'beta', presentation: 'inline'});
            await width(page, 1000); let state = await snap(page);
            assert.equal(state.dialogs, 1); assert.deepEqual(state.presentations, ['popover@2026-03-04']);
            assert.deepEqual([(await info(page)).item, (await info(page)).presentation], ['beta', 'popover']);
            assert.equal(await cell(page, '2026-03-04').getAttribute('aria-expanded'), 'true');
            await width(page, 400); state = await snap(page);
            assert.equal(state.dialogs, 0); assert.deepEqual(state.presentations, ['inline@2026-03-04']);
            assert.deepEqual([(await info(page)).item, (await info(page)).presentation], ['beta', 'inline']);
            assert.equal(await cell(page, '2026-03-04').getAttribute('aria-haspopup'), null);
            return {mounts: state.mounts};
        });
        await scenario(`${label}: a touch drag on the grid keeps focus ownership; focus on the agenda container migrates too (R38, R56)`, {shadow, options: {items: samples}, container: 400}, async (page, {context}) => {
            await page.evaluate(() => { document.body.style.minHeight = '3000px'; window.pointerTypes = []; for (const type of ['pointerdown', 'pointercancel', 'click']) document.addEventListener(type, event => window.pointerTypes.push(type), true); });
            await page.locator('[data-presentation=inline] [data-item-id=beta] button').focus();
            const grid = await page.getByRole('grid').boundingBox(), cdp = await context.newCDPSession(page), x = grid.x + grid.width / 2, y = grid.y + grid.height / 2;
            await cdp.send('Input.dispatchTouchEvent', {type: 'touchStart', touchPoints: [{x, y}]});
            for (let step = 1; step <= 6; step++) await cdp.send('Input.dispatchTouchEvent', {type: 'touchMove', touchPoints: [{x, y: y - step * 25}]});
            await cdp.send('Input.dispatchTouchEvent', {type: 'touchEnd', touchPoints: []}); await settle(page);
            const types = await page.evaluate(() => window.pointerTypes);
            assert.ok(types.includes('pointerdown') && !types.includes('click'), JSON.stringify(types)); assert.equal((await info(page)).item, 'beta');
            await width(page, 1000); assert.deepEqual([(await info(page)).item, (await info(page)).presentation], ['beta', 'popover']);
            await page.locator('[data-presentation=popover]').focus(); await width(page, 400);
            assert.deepEqual(await page.evaluate(() => [window.active()?.dataset.presentation, window.active()?.getAttribute('role')]), ['inline', 'region']);
            return {types};
        });
        await scenario(`${label}: inline ↔ sheet ↔ popover keep the logical control and clean modal inert/scroll lock (R38)`, {shadow, options: {items: samples}, container: 400}, async page => {
            await page.locator('[data-presentation=inline] h3').focus();
            await patch(page, {agendaPresentation: 'overlay'}); let state = await snap(page);
            assert.equal(state.modal, 1); assert.deepEqual(state.presentations, ['sheet@2026-03-04']); assert.equal((await info(page)).heading, true);
            assert.ok(state.inert > 0, 'background is inert'); assert.equal(state.overflow, 'hidden');
            assert.equal(await page.locator('#after').evaluate(node => node.inert), true);
            const sheetInert = state.inert;
            await width(page, 1000); state = await snap(page);
            assert.deepEqual(state.presentations, ['popover@2026-03-04']); assert.equal(state.modal, 0); assert.equal((await info(page)).heading, true);
            assert.equal(state.inert, 0); assert.equal(state.overflow, ''); assert.equal(state.backdrops, 0);
            await page.locator('[data-presentation=popover] [data-item-id=alpha] button').focus();
            await width(page, 400); state = await snap(page);
            assert.deepEqual(state.presentations, ['sheet@2026-03-04']); assert.equal((await info(page)).item, 'alpha'); assert.equal(state.overflow, 'hidden');
            await patch(page, {agendaPresentation: 'auto'}); state = await snap(page);
            assert.deepEqual(state.presentations, ['inline@2026-03-04']); assert.deepEqual([(await info(page)).item, (await info(page)).presentation], ['alpha', 'inline']);
            assert.equal(state.inert, 0); assert.equal(state.overflow, ''); assert.equal(state.backdrops, 0);
            return {sheetInert, mounts: state.mounts};
        });
        await scenario(`${label}: external focus is never taken; overlay targets mount nothing until the next activation (R38)`, {shadow, options: {items: samples}, container: 400}, async page => {
            await page.locator('#outside').focus();
            await width(page, 1000); assert.equal((await snap(page)).dialogs, 0); assert.equal((await info(page)).id, 'outside');
            await width(page, 400); await patch(page, {agendaPresentation: 'overlay'}); let state = await snap(page);
            assert.equal(state.dialogs, 0); assert.deepEqual(state.presentations, []); assert.equal((await info(page)).id, 'outside'); assert.equal(state.inert, 0);
            await patch(page, {agendaPresentation: 'auto'}); assert.deepEqual((await snap(page)).presentations, ['inline@2026-03-04']);
            // A press on a non-focusable area leaves the owning stack too.
            await page.locator('[data-presentation=inline] [data-item-id=beta] button').click(); await page.locator('#blank').click(); await settle(page);
            await width(page, 1000); state = await snap(page); assert.equal(state.dialogs, 0); assert.notEqual((await info(page)).presentation, 'popover');
            await open(page); assert.equal((await snap(page)).dialogs, 1);
            await width(page, 400); await page.locator('#after').focus(); await patch(page, {agendaPresentation: 'overlay'});
            state = await snap(page); assert.equal(state.dialogs, 0); assert.equal((await info(page)).id, 'after');
            await cell(page, '2026-03-05').click(); await settle(page);
            assert.deepEqual((await snap(page)).presentations, ['sheet@2026-03-05']);
        });
        await scenario(`${label}: desktop auto ↔ overlay and resizes within desktop keep the same popover node and focus (R38)`, {shadow, options: {items: samples}, container: 1000}, async page => {
            await open(page); await page.locator('[role=dialog]').evaluate(node => { node.__marker = true; });
            const focus = await info(page);
            for (const step of [() => patch(page, {agendaPresentation: 'overlay'}), () => width(page, 1200), () => width(page, 700), () => patch(page, {agendaPresentation: 'auto'})]) {
                await step();
                assert.equal(await page.locator('[role=dialog]').evaluate(node => node.__marker === true), true, 'popover node kept');
                assert.deepEqual(await info(page), focus);
            }
            const mounts = (await snap(page)).mounts; assert.deepEqual(mounts.filter(value => value.startsWith('popover')), ['popover@2026-03-04']);
        });
        await scenario(`${label}: an accepted out-of-grid date survives popover → sheet → inline without navigation (R38)`, {shadow, options: {items: samples, controlled: true}, container: 1000}, async page => {
            await open(page); await patch(page, {agendaDate: '2026-05-06'});
            let state = await snap(page); assert.deepEqual(state.presentations, ['popover@2026-05-06']); assert.equal((await info(page)).close, true);
            assert.equal(await cell(page, '2026-03-04').getAttribute('aria-controls'), null, 'no IDREF to a cell that does not own the date');
            await patch(page, {layout: 'mobile', agendaPresentation: 'overlay'}); state = await snap(page);
            assert.deepEqual(state.presentations, ['sheet@2026-05-06']); assert.equal((await info(page)).close, true);
            await patch(page, {agendaPresentation: 'auto'}); state = await snap(page);
            assert.deepEqual(state.presentations, ['inline@2026-05-06']); assert.equal((await info(page)).date, '2026-03-04', 'inline has no close control: roving cell (§12.3)');
            assert.equal(state.inert, 0);
            assert.deepEqual((await page.evaluate(() => window.cal.events)).filter(event => event.type !== 'range'), []);
        });
        await scenario(`${label}: the sheet is a named modal dialog with heading focus, contained Tab and Escape/close/backdrop recovery (§12.2)`, {shadow, options: {items: samples, agendaPresentation: 'overlay'}, container: 400, viewport: {width: 420, height: 800}}, async page => {
            assert.equal(await cell(page, '2026-03-04').getAttribute('aria-haspopup'), 'dialog'); assert.deepEqual((await snap(page)).presentations, []);
            await cell(page, '2026-03-04').click(); await settle(page);
            const dialog = page.getByRole('dialog', {name: 'Events for Mar 4, 2026'});
            assert.equal(await dialog.getAttribute('aria-modal'), 'true'); assert.equal((await info(page)).heading, true);
            assert.equal(await cell(page, '2026-03-04').getAttribute('aria-expanded'), 'true');
            for (let i = 0; i < 6; i++) { await page.keyboard.press('Tab'); assert.equal((await info(page)).presentation, 'sheet', `Tab ${i}`); }
            for (let i = 0; i < 3; i++) { await page.keyboard.press('Shift+Tab'); assert.equal((await info(page)).presentation, 'sheet', `Shift+Tab ${i}`); }
            const bounds = await page.locator('.nc-sheet').boundingBox();
            assert.ok(Math.abs(bounds.y + bounds.height - 800) <= 1 && Math.abs(bounds.width - 420) <= 1 && bounds.y > 0, JSON.stringify(bounds));
            assert.equal((await snap(page)).live.length, 0, 'opening the dialog is announced by focus, not live text');
            await page.keyboard.press('Escape'); await settle(page);
            let state = await snap(page); assert.equal(state.dialogs, 0); assert.equal((await info(page)).date, '2026-03-04'); assert.equal(state.inert, 0); assert.equal(state.overflow, '');
            await page.keyboard.press('Enter'); await settle(page); assert.equal((await info(page)).heading, true);
            await page.getByRole('button', {name: 'Close day agenda'}).click(); await settle(page);
            assert.equal((await snap(page)).dialogs, 0); assert.equal((await info(page)).date, '2026-03-04');
            await cell(page, '2026-03-05').tap(); await settle(page); assert.deepEqual((await snap(page)).presentations, ['sheet@2026-03-05']);
            // The backdrop press must not move focus to a focusable ancestor (the calendar root) before dismissal.
            await page.mouse.click(200, 8); await settle(page); await settle(page);
            state = await snap(page); assert.equal(state.dialogs, 0);
            assert.equal((await info(page)).date, '2026-03-05', JSON.stringify(await info(page)));
            assert.equal(state.inert, 0); assert.equal(state.overflow, '');
            return {bounds};
        });
        await scenario(`${label}: a still-current controlled request opens the presentation resolved at acceptance exactly once (R46)`, {shadow, options: {items: samples, controlled: true, agendaDate: '2026-03-01'}, container: 400}, async page => {
            await open(page, '2026-03-04'); assert.deepEqual((await snap(page)).presentations, ['inline@2026-03-01']);
            await patch(page, {agendaDate: '2026-03-04', layout: 'desktop'}); let state = await snap(page);
            assert.deepEqual(state.presentations, ['popover@2026-03-04']); assert.equal((await info(page)).close, true);
            assert.deepEqual(state.mounts.filter(value => value.endsWith('2026-03-04')), ['popover@2026-03-04'], 'no intermediate presentation for the target');
            await page.keyboard.press('Escape'); await patch(page, {layout: 'auto'}); await width(page, 400); await settle(page);
            await cell(page, '2026-03-06').click(); await width(page, 1000); assert.equal((await snap(page)).dialogs, 0);
            await patch(page, {agendaDate: '2026-03-06'}); state = await snap(page);
            assert.deepEqual(state.presentations, ['popover@2026-03-06']); assert.equal((await info(page)).close, true);
            await page.keyboard.press('Escape'); await width(page, 400); await patch(page, {agendaPresentation: 'overlay'});
            await cell(page, '2026-03-07').click(); await patch(page, {agendaDate: '2026-03-07'}); state = await snap(page);
            assert.deepEqual(state.presentations, ['sheet@2026-03-07']); assert.equal((await info(page)).heading, true);
            assert.deepEqual(state.mounts.filter(value => value.endsWith('2026-03-07')), ['sheet@2026-03-07']);
            await page.keyboard.press('Escape'); await settle(page); await patch(page, {agendaPresentation: 'auto'});
            await open(page, '2026-03-09'); await patch(page, {agendaDate: '2026-03-09', agendaPresentation: 'overlay'}); state = await snap(page);
            assert.deepEqual(state.presentations, ['sheet@2026-03-09']); assert.equal((await info(page)).heading, true);
            assert.deepEqual(state.mounts.filter(value => value.endsWith('2026-03-09')), ['sheet@2026-03-09'], 'same-commit inline → sheet mounts only the sheet');
            await page.keyboard.press('Escape'); await settle(page); await patch(page, {agendaPresentation: 'auto'});
            await cell(page, '2026-03-08').click(); await page.keyboard.press('Tab'); await settle(page); const moved = await info(page);
            await patch(page, {agendaDate: '2026-03-08', layout: 'desktop'}); state = await snap(page);
            assert.equal(state.dialogs, 0); assert.deepEqual(await info(page), moved, 'a cancelled intent opens nothing and keeps focus');
            assert.deepEqual(state.live, [], 'no announcement for overlay acceptance or cancelled intent');
            return {mounts: state.mounts, agendaRequests: (await page.evaluate(() => window.cal.events)).filter(event => event.type === 'agenda').map(event => event.value)};
        });
        await scenario(`${label}: delayed acceptance: user cancellation silences late props; an uncancelled tap announces once (R45)`, {shadow, options: {items: samples, controlled: true, agendaDate: '2026-03-01'}, container: 400}, async page => {
            await cell(page, '2026-03-04').click(); await patch(page, {agendaDate: '2026-03-04'});
            let state = await snap(page); assert.equal((await info(page)).date, '2026-03-04'); assert.deepEqual(state.live, ['Showing Mar 4, 2026, 2 events']);
            await open(page, '2026-03-05'); await patch(page, {agendaDate: '2026-03-05'}); assert.equal((await info(page)).heading, true);
            await page.keyboard.press('Escape'); await settle(page); assert.equal((await info(page)).date, '2026-03-05');
            await cell(page, '2026-03-06').click(); await page.getByRole('button', {name: 'Next month'}).click(); await settle(page);
            await patch(page, {agendaDate: '2026-03-06'}); assert.equal((await info(page)).label, 'Next month'); assert.deepEqual((await snap(page)).presentations, ['inline@2026-03-06']);
            await cell(page, '2026-03-07').click(); await page.locator('#outside').focus(); await patch(page, {agendaDate: '2026-03-07'}); assert.equal((await info(page)).id, 'outside');
            // An unrelated key cancels the intent; a pure modifier such as Shift would not (QA-B-1-04).
            await cell(page, '2026-03-09').click(); await page.keyboard.press('KeyA'); await patch(page, {agendaDate: '2026-03-09'});
            assert.equal((await info(page)).date, '2026-03-09'); assert.equal((await info(page)).heading, false);
            await cell(page, '2026-03-10').click(); await patch(page, {agendaDate: '2026-03-02'}); await patch(page, {agendaDate: '2026-03-10'});
            state = await snap(page);
            assert.deepEqual(state.live, ['Showing Mar 4, 2026, 2 events'], 'only the uncancelled tap is announced, once, in StrictMode');
            assert.equal(state.dialogs, 0);
            const requested = (await page.evaluate(() => window.cal.events)).filter(event => event.type === 'agenda').map(event => event.value);
            assert.deepEqual(requested, ['2026-03-04', '2026-03-05', '2026-03-06', '2026-03-07', '2026-03-09', '2026-03-10'], 'callbacks already made are never retracted');
            return {requested};
        });
        await scenario(`${label}: removing the focused item closes the sheet and restores the date cell, not the root (§12.3)`, {shadow, options: {items: samples, agendaPresentation: 'overlay'}, container: 400, viewport: {width: 420, height: 800}}, async page => {
            await cell(page, '2026-03-04').click(); await settle(page);
            await page.locator('[data-presentation=sheet] [data-item-id=beta] button').focus(); assert.equal((await info(page)).item, 'beta');
            await patch(page, {items: [samples[0], samples[2]]}); await settle(page);
            const state = await snap(page), focus = await info(page);
            assert.equal(state.dialogs, 0); assert.equal(focus.date, '2026-03-04', JSON.stringify(focus));
            assert.equal(state.inert, 0); assert.equal(state.overflow, ''); assert.equal(state.backdrops, 0);
            return {focus};
        });
        await scenario(`${label}: a touch scroll between a controlled tap and acceptance keeps the intent: one sheet, one inline announcement (R45, §7)`, {shadow, options: {items: samples, controlled: true, agendaDate: '2026-03-01', agendaPresentation: 'overlay'}, container: 400, viewport: {width: 420, height: 800}}, async (page, {context}) => {
            await page.evaluate(() => { document.body.style.minHeight = '3000px'; window.pointerTypes = []; for (const type of ['pointerdown', 'pointercancel', 'pointerup', 'click']) document.addEventListener(type, () => window.pointerTypes.push(type), true); });
            const cdp = await context.newCDPSession(page);
            const drag = async () => {
                await page.evaluate(() => { window.pointerTypes = []; });
                const grid = await page.getByRole('grid').boundingBox(), x = grid.x + grid.width / 2, y = grid.y + grid.height / 2;
                await cdp.send('Input.dispatchTouchEvent', {type: 'touchStart', touchPoints: [{x, y}]});
                for (let step = 1; step <= 6; step++) await cdp.send('Input.dispatchTouchEvent', {type: 'touchMove', touchPoints: [{x, y: y - step * 25}]});
                await cdp.send('Input.dispatchTouchEvent', {type: 'touchEnd', touchPoints: []}); await settle(page);
                const types = await page.evaluate(() => window.pointerTypes);
                assert.ok(types.includes('pointercancel') && !types.includes('pointerup') && !types.includes('click'), JSON.stringify(types));
                return types;
            };
            await cell(page, '2026-03-04').tap(); await settle(page); assert.equal((await info(page)).date, '2026-03-04');
            const sheetDrag = await drag(); assert.equal((await info(page)).date, '2026-03-04', 'the scroll keeps focus on the cell');
            await patch(page, {agendaDate: '2026-03-04'}); let state = await snap(page);
            assert.deepEqual(state.presentations, ['sheet@2026-03-04']); assert.equal((await info(page)).heading, true);
            assert.deepEqual(state.mounts.filter(value => value.endsWith('2026-03-04')), ['sheet@2026-03-04']); assert.deepEqual(state.live, []);
            await page.keyboard.press('Escape'); await settle(page); await patch(page, {agendaPresentation: 'auto'});
            await cell(page, '2026-03-05').tap(); await settle(page); const inlineDrag = await drag();
            await patch(page, {agendaDate: '2026-03-05'}); state = await snap(page);
            assert.equal((await info(page)).date, '2026-03-05'); assert.deepEqual(state.presentations, ['inline@2026-03-05']);
            assert.equal(state.live.length, 1, JSON.stringify(state.live)); assert.match(state.live[0], /^Showing Mar 5, 2026/);
            const requested = (await page.evaluate(() => window.cal.events)).filter(event => event.type === 'agenda').map(event => event.value);
            assert.deepEqual(requested, ['2026-03-04', '2026-03-05'], 'one callback per tap');
            return {sheetDrag, inlineDrag, live: state.live};
        });
        await scenario(`${label}: requested color scheme is stable through hydration; system resolves in CSS; explicit dark reaches popover and sheet (R54)`, {shadow, options: {items: samples, colorScheme: 'system'}, container: 1000, colorScheme: 'dark'}, async page => {
            const scheme = () => page.evaluate(() => ({attribute: window.all('.nc-calendar')[0].dataset.colorScheme, background: getComputedStyle(window.all('.nc-calendar')[0]).backgroundColor}));
            assert.equal(await page.evaluate(() => window.ssrColorScheme), 'system'); const system = await scheme();
            assert.equal(system.attribute, 'system'); assert.notEqual(system.background, 'rgb(255, 255, 255)');
            await patch(page, {colorScheme: 'light'}); assert.equal((await scheme()).background, 'rgb(255, 255, 255)');
            await patch(page, {colorScheme: 'dark'}); const dark = await scheme(); await open(page);
            const portal = () => page.evaluate(() => { const node = window.all('[data-presentation]')[0].closest('.nc-theme:not(.nc-calendar)');
                return {attribute: node?.dataset.colorScheme, background: getComputedStyle(node.classList.contains('nc-backdrop') ? node.querySelector('.nc-sheet') : node).backgroundColor}; });
            assert.deepEqual(await portal(), {attribute: 'dark', background: dark.background});
            await page.locator('[data-presentation] h3').focus(); await patch(page, {layout: 'mobile', agendaPresentation: 'overlay'});
            assert.deepEqual((await snap(page)).presentations, ['sheet@2026-03-04']); assert.deepEqual(await portal(), {attribute: 'dark', background: dark.background});
            return {system, dark};
        });
        await scenario(`${label}: RTL ar migrates sheet → popover → inline with the same control`, {shadow, options: {items: samples, locale: 'ar', agendaPresentation: 'overlay', colorScheme: 'dark'}, container: 400, viewport: {width: 420, height: 820}}, async page => {
            await cell(page, '2026-03-04').click(); await settle(page);
            assert.equal(await page.locator('.nc-sheet-backdrop').getAttribute('dir'), 'rtl'); assert.equal((await info(page)).heading, true);
            await page.locator('[data-presentation=sheet] [data-item-id=beta] button').focus();
            if (!shadow) await page.screenshot({path: resolve(output, `${label}-ar-dark-sheet.png`)});
            await page.setViewportSize({width: 1100, height: 820}); await width(page, 1000);
            assert.deepEqual([(await info(page)).item, (await info(page)).presentation], ['beta', 'popover']);
            if (!shadow) await page.screenshot({path: resolve(output, `${label}-ar-dark-popover.png`)});
            await width(page, 400); await patch(page, {agendaPresentation: 'auto'});
            assert.deepEqual([(await info(page)).item, (await info(page)).presentation], ['beta', 'inline']);
            const geometry = await page.evaluate(() => { const cells = window.all('[role=gridcell]'); const first = cells[0].getBoundingClientRect(), second = cells[1].getBoundingClientRect(); return {first: first.left, second: second.left}; });
            assert.ok(geometry.first > geometry.second, 'columns mirror in RTL');
            if (!shadow) await page.screenshot({path: resolve(output, `${label}-ar-dark-inline.png`), fullPage: true});
        });
    }
    // R56: the server renders before midnight in two host zones; Chrome hydrates after midnight in a third.
    for (const [mode, options] of [['today unknown', {items: samples, unknownToday: true}], ['today snapshot', {items: samples, today: '2026-03-04'}]]) {
        const tokyo = serverIn('Asia/Tokyo', options), angeles = serverIn('America/Los_Angeles', options);
        await check(`SSR ${mode}: byte-identical HTML from two host zones/locales; auto is mobile`, () => {
            assert.equal(tokyo, angeles); assert.match(tokyo, /data-layout="mobile"/); assert.doesNotMatch(tokyo, /nc-overflow|nc-month-segments/);
            if (mode === 'today unknown') assert.doesNotMatch(tokyo, /aria-current/); else assert.match(tokyo, /aria-current="date"/);
        });
        for (const shadow of [false, true]) for (const [container, layout] of [[box(288), 'mobile'], [box(639), 'mobile'], [box(640), 'desktop'], [1280, 'desktop']]) {
            const label = `${shadow ? 'shadow' : 'document'} ${mode} @${container}px`;
            await scenario(`R56 ${label}: hydration after midnight in another zone matches; today/layout updates keep the chosen date and focus`,
                {shadow, options, html: tokyo, container, viewport: {width: 1320, height: 900}, timezoneId: 'Pacific/Kiritimati', now: Date.parse('2026-03-05T00:00:30Z')}, async page => {
                    assert.equal(await page.evaluate(() => window.ssrMatches), true); assert.equal(await page.evaluate(() => window.ssrLayout), 'mobile');
                    assert.equal((await snap(page)).layout, layout);
                    const today = () => page.evaluate(() => window.all('[aria-current=date]').map(node => node.dataset.date));
                    assert.deepEqual(await today(), [mode === 'today unknown' ? '2026-03-05' : '2026-03-04']);
                    if (mode === 'today unknown' && layout === 'mobile') assert.deepEqual((await snap(page)).presentations, ['inline@2026-03-05'], 'an untouched fallback moves to the known today');
                    await cell(page, '2026-03-12').click(); await settle(page); if (layout === 'desktop') { await page.keyboard.press('Escape'); await settle(page); }
                    if (mode === 'today unknown') {
                        await page.evaluate(() => { window.__now = Date.parse('2026-03-06T00:00:05Z'); document.dispatchEvent(new Event('visibilitychange')); }); await settle(page);
                        assert.deepEqual(await today(), ['2026-03-06']);
                    } else { await patch(page, {today: '2026-03-05'}); assert.deepEqual(await today(), ['2026-03-05']); }
                    assert.equal((await info(page)).date, '2026-03-12');
                    for (const next of layout === 'mobile' ? [1280, container] : [box(300), container]) {
                        await width(page, next); assert.equal((await info(page)).date, '2026-03-12'); assert.equal((await snap(page)).dialogs, 0);
                    }
                    assert.equal(await cell(page, '2026-03-12').getAttribute('data-agenda-date'), 'true', 'the user-chosen agenda date is kept');
                    if (layout === 'mobile') assert.deepEqual((await snap(page)).presentations, ['inline@2026-03-12']);
                    const visible = (await page.evaluate(() => window.cal.events)).filter(event => event.type === 'range');
                    assert.equal(visible.length, 1, 'one committed visible range in StrictMode');
                });
        }
    }
    // R56 (T15-V2-01): activating the date that is the untouched today fallback is a user choice too. A later
    // today (clock rollover or snapshot update) keeps that agenda date, its open presentation and focus inside it.
    for (const [mode, options] of [['today unknown', {items: samples, unknownToday: true}], ['today snapshot', {items: samples, today: '2026-03-04'}]]) {
        for (const shadow of [false, true]) for (const [container, layout] of [[400, 'mobile'], [1000, 'desktop']]) for (const input of ['tap', 'click', 'Enter']) {
            const label = `${shadow ? 'shadow' : 'document'} ${mode} ${layout} ${input}`;
            await scenario(`R56 ${label}: activating the today fallback itself keeps the agenda date and item focus across a today update`,
                {shadow, options, container, now: Date.parse('2026-03-04T23:59:58Z')}, async page => {
                    const presentation = layout === 'mobile' ? 'inline' : 'popover';
                    assert.equal(await cell(page, '2026-03-04').getAttribute('data-agenda-date'), 'true', 'the fallback is today before activation');
                    // The day-number corner: on desktop the cell centre is covered by the pressable 'alpha' bar.
                    if (input === 'Enter') await open(page); else { await cell(page, '2026-03-04')[input]({position: {x: 6, y: 6}}); await settle(page); }
                    assert.deepEqual((await snap(page)).presentations, [`${presentation}@2026-03-04`]);
                    await page.locator('[data-presentation] [data-item-id="beta"] [data-agenda-control]').focus(); await settle(page);
                    assert.deepEqual([(await info(page)).item, (await info(page)).presentation], ['beta', presentation]);
                    const before = (await snap(page)).mounts.length;
                    if (mode === 'today unknown') await page.evaluate(() => { window.__now = Date.parse('2026-03-05T00:00:05Z'); document.dispatchEvent(new Event('visibilitychange')); });
                    else await page.evaluate(() => window.cal.patch({today: '2026-03-05'}));
                    await settle(page);
                    assert.deepEqual(await page.evaluate(() => window.all('[aria-current=date]').map(node => node.dataset.date)), ['2026-03-05']);
                    const after = await snap(page);
                    assert.deepEqual(after.presentations, [`${presentation}@2026-03-04`], 'the user-chosen agenda date and its presentation are kept');
                    assert.equal(after.mounts.length, before, 'no presentation is remounted');
                    assert.equal(await cell(page, '2026-03-04').getAttribute('data-agenda-date'), 'true');
                    assert.deepEqual([(await info(page)).item, (await info(page)).presentation], ['beta', presentation], 'focus stays on the agenda item');
                    return {presentations: after.presentations, focus: await info(page)};
                });
        }
    }
    // QA-01: a Calendar whose Suspense boundary hydrates separately (a sibling suspends on the client) settles
    // to idle in development StrictMode; Today becomes available and Enter opens the agenda.
    for (const shadow of [false, true]) for (const [container, layout, presentation] of [[1000, 'desktop', 'popover'], [400, 'mobile', 'inline']]) {
        await scenario(`QA-01 ${shadow ? 'shadow' : 'document'} @${container}px: hydration inside a Suspense boundary settles to idle; Today and Enter work`,
            {shadow, suspense: true, options: {items: samples, unknownToday: true}, container}, async page => {
                await page.evaluate(() => window.cal.ready); await settle(page);
                const cdp = await page.context().newCDPSession(page); await cdp.send('Performance.enable');
                const metrics = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(metric => [metric.name, metric.value]));
                const before = await metrics(), layouts = await page.evaluate(() => window.layouts.length);
                await page.waitForTimeout(2000);
                const after = await metrics(), busy = Math.round((after.TaskDuration - before.TaskDuration) * 1000);
                assert.ok(busy < 100, `main thread busy ${busy} ms during 2 s of idle`);
                assert.equal(await page.evaluate(() => window.layouts.length), layouts, 'no layout change while idle');
                assert.equal((await snap(page)).layout, layout);
                const today = page.locator('.nc-calendar-toolbar button', {hasText: 'Today'});
                assert.equal(await today.isDisabled(), false, 'Today is available after hydration');
                await open(page);
                const state = await snap(page);
                assert.deepEqual(state.presentations, [`${presentation}@2026-03-04`]); assert.equal(state.dialogs, layout === 'desktop' ? 1 : 0);
                assert.equal((await info(page)).presentation, presentation, 'Enter moved focus into the agenda');
                return {busyMs: busy, layouts: await page.evaluate(() => window.layouts), commitsWhileIdle: 0};
            });
    }
    // QA-04: a page scrollbar that exists only in the taller desktop layout (classic scrollbars). The root content
    // box is 645 px without it and 645 - scrollbar with it, on both sides of the 640 px breakpoint. Inside that
    // feedback band [640 - scrollbar, 640 + scrollbar) neither layout fits the exact §7 boundary of the width it
    // produces itself (no fixed point; open interpretation, see qa-fixes-2026-10-09.md): the guard keeps the current
    // layout there (hysteresis), so the checks pin "one switch per crossing" and the exact boundary outside the band.
    const bands = {};
    // Window height between the heights of both layouts at this width (measured with a tall viewport, no scrollbar).
    const bandHeight = async (shadow, options, content) => {
        if (bands[shadow]) return bands[shadow];
        const probe = await setup({shadow, options, container: null, scrollbars: true, viewport: {width: box(content), height: 3000}});
        const heights = {};
        try {
            for (const layout of ['desktop', 'mobile']) { await patch(probe.page, {layout}); heights[layout] = await probe.page.evaluate(() => { const last = document.getElementById('after'); return last.getBoundingClientRect().bottom + Number.parseFloat(getComputedStyle(last).marginBottom); }); }
        } finally { await probe.context.close(); }
        assert.ok(heights.desktop > heights.mobile + 40, `desktop must be taller: ${JSON.stringify(heights)}`);
        return bands[shadow] = {heights, height: Math.round((heights.desktop + heights.mobile) / 2)};
    };
    const inBand = (content, scrollbar) => scrollbar > 0 && content >= 640 - scrollbar && content < 640 + scrollbar;
    for (const shadow of [false, true]) {
        const label = shadow ? 'shadow' : 'document', options = {items: samples, today: '2026-03-20'}, content = 645;
        await check(`QA-04 ${label}: a layout-dependent page scrollbar switches auto at most once and stays settled (hydration and resize)`, async () => {
            const {heights, height} = await bandHeight(shadow, options, content), results = {heights, height};
            // Hydration inside the feedback band.
            const fixture = await setup({shadow, options, container: null, scrollbars: true, viewport: {width: box(content), height}});
            try {
                const {page} = fixture;
                await page.waitForTimeout(500);
                const settled = await page.evaluate(() => window.layouts.length);
                await page.waitForTimeout(1000);
                const state = await page.evaluate(() => ({...window.contentOf(), layouts: window.layouts}));
                // SSR mobile measures 645 px: desktop; desktop measures 645 - scrollbar px and holds (one switch).
                assert.deepEqual(state.layouts, ['mobile', 'desktop'], `one switch after hydration: ${state.layouts.join(' → ')}`);
                assert.equal(state.layouts.length, settled, 'no switch while settled');
                assert.ok(inBand(state.content, state.scrollbar), `the fixture sits in the feedback band: ${state.content} px, scrollbar ${state.scrollbar} px`);
                results.hydration = state;
            } finally { await fixture.context.close(); }
            // Runtime resize into the band with the agenda open and focus inside it.
            const runtime = await setup({shadow, options, container: null, scrollbars: true, viewport: {width: 1000, height}});
            try {
                const {page} = runtime;
                await open(runtime.page, '2026-03-20'); await page.locator('[data-presentation] h3').focus(); await settle(page);
                assert.deepEqual([(await info(page)).heading, (await info(page)).presentation], [true, 'popover']);
                const start = await page.evaluate(() => window.layouts.length);
                await page.setViewportSize({width: box(content), height}); await page.waitForTimeout(1000);
                const state = await page.evaluate(start => ({...window.contentOf(), layouts: window.layouts.slice(start - 1)}), start);
                // Desktop measures 645 - scrollbar px: mobile; mobile measures 645 px and holds (one switch).
                assert.deepEqual(state.layouts, ['desktop', 'mobile'], `one switch after the resize: ${state.layouts.join(' → ')}`);
                assert.ok(inBand(state.content, results.hydration.scrollbar), `held inside the feedback band: ${state.content} px`);
                const snapshot = await snap(page);
                assert.equal(snapshot.presentations.length, 1, 'one agenda presentation');
                assert.equal((await info(page)).heading, true, 'focus stays on the agenda heading');
                results.resize = {...state, presentations: snapshot.presentations, focus: await info(page)};
            } finally { await runtime.context.close(); }
            return results;
        });
        // QA-A-1-02: a drag through the band, settled 1 px steps and one-frame steps, both directions and a turn
        // inside the band. Window widths: mobile content = width - 32, desktop content = width - 32 - scrollbar.
        await check(`QA-04 ${label}: 1 px resize steps through the feedback band switch once per crossing; outside the band the exact boundary decides`, async () => {
            const {height} = await bandHeight(shadow, options, content);
            const fixture = await setup({shadow, options, container: null, scrollbars: true, viewport: {width: 720, height}});
            try {
                const {page} = fixture, results = {};
                await page.waitForTimeout(300);
                const scrollbar = (await page.evaluate(() => window.contentOf())).scrollbar, low = 672, high = 672 + scrollbar;
                assert.ok(scrollbar > 0, 'desktop shows the page scrollbar at 720 px');
                const passes = {down: [high + 8, low - 8], up: [low - 8, high + 8], turnDown: [high + 8, low + Math.floor(scrollbar / 2)], turnUp: [low + Math.floor(scrollbar / 2), high + 8]};
                for (const [mode, frames] of [['settled', 6], ['one-frame', 1]]) {
                    for (const [name, [from, to]] of Object.entries(passes)) {
                        const steps = [], before = (await page.evaluate(() => window.contentOf())).layouts;
                        for (let width = from; ; width += Math.sign(to - from)) {
                            await page.setViewportSize({width, height});
                            await page.evaluate(async frames => { for (let i = 0; i < frames; i++) await new Promise(requestAnimationFrame); }, frames);
                            if (mode === 'settled') {
                                const state = await page.evaluate(() => window.contentOf());
                                steps.push(`${width}:${state.layout}:${state.content}`);
                                if (width < low || width >= high) assert.equal(state.layout, state.content < 640 ? 'mobile' : 'desktop', `${name} ${width}: ${state.layout} at ${state.content} px`);
                            }
                            if (width === to) break;
                        }
                        await settle(page);
                        const after = await page.evaluate(() => window.contentOf()), switches = after.layouts - before;
                        // Each pass crosses the breakpoint once (the turning passes enter or leave the band only once).
                        assert.ok(switches <= 1, `${mode} ${name}: ${switches} switches`);
                        if (mode === 'settled' || name === 'down' || name === 'up') assert.equal(switches, 1, `${mode} ${name}: one switch`);
                        if (name === 'turnDown') assert.ok(inBand(after.content, scrollbar), `${mode} ${name} turns inside the band`);
                        else assert.equal(after.layout, after.content < 640 ? 'mobile' : 'desktop', `${mode} ${name} ends outside the band by the exact boundary`);
                        results[`${mode} ${name}`] = {switches, ...(steps.length ? {steps} : {})};
                    }
                }
                const settled = await page.evaluate(() => window.layouts.length);
                await page.waitForTimeout(1000);
                assert.equal(await page.evaluate(() => window.layouts.length), settled, 'no switch while settled');
                return {scrollbar, band: [low, high], ...results};
            } finally { await fixture.context.close(); }
        });
    }
    // QA-13: a host data update (not a user event, development build) removes, re-identifies or moves the focused
    // agenda item. Every presentation resolves §12.3 the same way on every run: overlays close, the cell takes focus.
    const changes = {
        removed: list => list.filter(item => item.id !== 'beta'),
        reIdentified: list => list.map(item => item.id === 'beta' ? {...item, id: 'beta-2'} : item),
        moved: list => list.map(item => item.id === 'beta' ? {...item, interval: {kind: 'timed', start: '2026-03-20T10:00:00Z'}} : item),
    };
    for (const shadow of [false, true]) for (const [presentation, layout, agendaPresentation, runs] of [['sheet', 'mobile', 'overlay', 3], ['popover', 'desktop', 'auto', 1], ['inline', 'mobile', 'auto', 1]]) {
        for (const [change, update] of Object.entries(changes)) {
            await scenario(`QA-13 ${shadow ? 'shadow' : 'document'} ${presentation}: the focused item ${change} by a data update recovers the date cell deterministically (${runs} runs)`,
                {shadow, options: {items: samples, layout, agendaPresentation}, container: layout === 'mobile' ? 400 : 1000}, async page => {
                    const outcomes = [];
                    for (let run = 0; run < runs; run++) {
                        if (run) { await patch(page, {items: samples}); await page.keyboard.press('Escape'); await settle(page); }
                        await open(page); await page.locator('[data-presentation] [data-item-id="beta"] [data-agenda-control]').focus(); await settle(page);
                        assert.deepEqual([(await info(page)).item, (await info(page)).presentation], ['beta', presentation]);
                        await page.waitForTimeout(run % 2 ? 400 : 60);
                        await page.evaluate(source => window.cal.patch({items: (0, eval)(source)(window.cal.current().items)}), `(${update.toString()})`);
                        await page.waitForTimeout(600);
                        const state = await snap(page), focus = await info(page);
                        outcomes.push({dialogs: state.dialogs, inert: state.inert, overflow: state.overflow, focus: focus.date ?? focus.tag, presentations: state.presentations});
                    }
                    for (const outcome of outcomes) {
                        assert.deepEqual(outcome, {dialogs: 0, inert: 0, overflow: '', focus: '2026-03-04', presentations: presentation === 'inline' ? ['inline@2026-03-04'] : []});
                    }
                    return outcomes;
                });
        }
    }
    await check('visual: mobile inline (ru-RU light) and desktop popover after migration', async () => {
        const {page, context} = await setup({options: {items: samples, locale: 'ru-RU'}, container: 400, viewport: {width: 440, height: 900}});
        try {
            await cell(page, '2026-03-04').click(); await settle(page);
            await page.screenshot({path: resolve(output, 'document-ru-inline.png'), fullPage: true});
            const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth); assert.ok(overflow <= 0, `horizontal page scroll ${overflow}`);
            await page.locator('[data-presentation=inline] h3').focus(); await page.setViewportSize({width: 1100, height: 900}); await width(page, 1000);
            assert.equal((await info(page)).presentation, 'popover');
            await page.screenshot({path: resolve(output, 'document-ru-popover-after-migration.png')});
        } finally { await context.close(); }
    });
} finally { await browser.close(); await classicBrowser?.close(); }
const paths = ['src/v02/core/responsive.ts', 'src/v02/calendar/useResponsiveLayout.ts', 'src/v02/calendar/CalendarMonth.tsx', 'src/v02/calendar/useCalendarController.ts',
    'src/v02/calendar/model.ts', 'src/v02/core/layout.ts', 'src/v02/core/controller.ts', 'src/v02/calendar/useRootName.ts', 'src/v02/calendar/useToday.ts', 'src/v02/calendar/MonthView.tsx', 'src/v02/calendar/useMonthMeasurements.ts', 'src/v02/calendar/useStatusGeometry.ts', 'src/v02/calendar/DayAgendaBody.tsx', 'src/v02/calendar/focus.ts',
    'src/v02/primitives/ModalSheet.tsx', 'src/v02/primitives/NonModalPopover.tsx', 'src/v02/surface.ts', 'src/v02/core/validation.ts', 'src/v02/styles.css', 'src/index.ts', 'src/Calendar.tsx',
    'scripts/implementation/responsive-entry.tsx', 'scripts/implementation/responsive-probe.mjs', 'package.json', 'scripts/implementation/spikes/package-lock.json'];
const report = {capturedAt: new Date().toISOString(), outcome: !only && checks.every(c => c.outcome === 'pass') && !errors.length && !consoleErrors.length ? 'pass' : 'fail', filter: only ? String(only) : null,
    node: process.version, browser: version, react: 'bundled from the root lockfile, development build', checks, errors, consoleErrors,
    scope: 'T15 responsive resolver and agenda presentation lifecycle through the public Calendar (development StrictMode), Document and open ShadowRoot, LTR and RTL. Child overlay menus (T17), consumer portals and full overlay-stack/live routing (T16) and manual AT are out of scope.',
    sourceHashes: Object.fromEntries(paths.map(path => [path, createHash('sha256').update(readFileSync(resolve(root, path))).digest('hex')]))};
writeFileSync(resolve(output, 'browser.json'), JSON.stringify(report, null, 2) + '\n');
console.log(`Responsive: ${checks.filter(c => c.outcome === 'pass').length}/${checks.length}; ${errors.length} page errors; ${consoleErrors.length} console errors; ${output}`);
if (report.outcome === 'fail') process.exitCode = 1;
