import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, resolve} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {inflateSync} from 'node:zlib';
import {build} from 'vite';

// QA-B real-Chrome probe: package overlays inside host pages, through the public Calendar in development StrictMode
// with server render + hydration (the T16 overlay entry). QA-02 popover scrolling, QA-03 modal hosts (native
// <dialog>, focus-trap and pointer-events hosts), QA-10 a host dialog opened from onItemPress above the sheet, QA-11
// host fixed layers, QA-20 the Enter/Escape race, QA-21 anchoring and scrolling, QA-22 host CSS resets. Spec v7 (decisions
// 2026-10-09): only modal <dialog>s and aria-modal="true" hosts are default portal targets and host layers (QA-B-1-03);
// a popover in a modal <dialog> opens on the side with more room (QA-B-1-05).
// Usage: node scripts/implementation/host-probe.mjs <outputDir>
const here = dirname(fileURLToPath(import.meta.url)), root = resolve(here, '../..');
const output = resolve(process.argv[2] ?? resolve(tmpdir(), 'calendar-host'));
mkdirSync(output, {recursive: true});
const directory = mkdtempSync(resolve(tmpdir(), 'calendar-host-'));
await build({configFile: false, logLevel: 'error', define: {'process.env.NODE_ENV': '"development"'}, mode: 'development',
    build: {outDir: directory, minify: false, lib: {entry: resolve(here, 'overlay-entry.tsx'), formats: ['es'], fileName: () => 'index.mjs'}}});
const esm = await import(pathToFileURL(resolve(directory, 'index.mjs')));
const moduleUrl = 'data:text/javascript;base64,' + readFileSync(resolve(directory, 'index.mjs')).toString('base64');
const css = readFileSync(resolve(root, 'src/v02/styles.css'), 'utf8');
const {chromium} = await import('./spikes/node_modules/playwright/index.mjs');
const browser = await chromium.launch({channel: 'chrome', headless: true});
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
const hour = index => String(8 + index).padStart(2, '0');
// A busy day: one all-day item and twelve timed items on 2026-03-04, one item on 2026-03-25.
const busy = [{id: 'release', title: 'Release preparation', data: {}, interval: {kind: 'allDay', start: '2026-03-03', end: '2026-03-06'}},
    ...Array.from({length: 12}, (_, index) => ({id: `task-${index + 1}`, title: `Task ${index + 1}`, data: {}, interval: {kind: 'timed', start: `2026-03-04T${hour(index)}:00:00Z`, end: `2026-03-04T${hour(index)}:30:00Z`}})),
    {id: 'late', title: 'Late review', data: {}, interval: {kind: 'timed', start: '2026-03-25T10:00:00Z'}}];
const settle = page => page.evaluate(async () => { for (let i = 0; i < 6; i++) await new Promise(requestAnimationFrame); });
const patch = async (page, props) => { await page.evaluate(props => window.cal.patch(props), props); await settle(page); };
const cell = (page, date = '2026-03-04') => page.locator(`[role=gridcell][data-date="${date}"]`);
const info = page => page.evaluate(() => window.info());
const press = async (page, key) => { await page.keyboard.press(key); await settle(page); };
const open = async (page, date = '2026-03-04') => { await cell(page, date).focus(); await page.keyboard.press('Enter'); await settle(page); };
/**
 * The painted colour of one CSS pixel, from a 1×1 screenshot. Hit testing skips inert nodes, so paint order above an
 * inert host layer is checked by colour. In the first PNG row every filter leaves the first pixel's bytes unchanged.
 */
async function pixel(page, x, y) {
    const png = await page.screenshot({clip: {x, y, width: 1, height: 1}}), chunks = [];
    for (let offset = 8; offset < png.length;) {
        const length = png.readUInt32BE(offset);
        if (png.toString('ascii', offset + 4, offset + 8) === 'IDAT') chunks.push(png.subarray(offset + 8, offset + 8 + length));
        offset += 12 + length;
    }
    const raw = inflateSync(Buffer.concat(chunks));
    return [raw[1], raw[2], raw[3]];
}
const desktop = {items: busy, layout: 'desktop'}, sheet = {items: busy, layout: 'mobile', agendaPresentation: 'overlay'};
const phone = {width: 390, height: 844};

/**
 * `body`: host markup with a `#mount` element for the Calendar; `before`/`after`: host CSS around the package
 * stylesheet; `script`: host script run before hydration (for example `showModal()`).
 */
async function setup({body = '<div id="mount"></div>', before = '', after = '', script = '', options = {}, viewport = {width: 1280, height: 800}, touch = false}) {
    const context = await browser.newContext({viewport, locale: 'en-US', hasTouch: touch, isMobile: touch});
    const page = await context.newPage();
    page.setDefaultTimeout(4000);
    page.on('pageerror', error => errors.push(String(error)));
    page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
    await page.setContent(`<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>body{margin:0;font:16px/1.4 system-ui;background:#f5f4f1}${before}</style><style data-nc>${css}</style><style>${after}</style></head>
        <body>${body}</body></html>`);
    await page.evaluate(async ({moduleUrl, server, options, script}) => {
        window.active = () => { let node = document.activeElement; while (node?.shadowRoot?.activeElement) node = node.shadowRoot.activeElement; return node; };
        window.info = () => {
            const node = window.active();
            return {id: node?.id || undefined, date: node?.dataset?.date, item: node?.closest?.('[data-item-id]')?.dataset.itemId, tag: node?.tagName, label: node?.getAttribute?.('aria-label') ?? undefined,
                close: !!node?.hasAttribute?.('data-agenda-close'), presentation: node?.closest?.('[data-presentation]')?.dataset.presentation};
        };
        window.rect = node => { const box = node.getBoundingClientRect(); return {top: Math.round(box.top), bottom: Math.round(box.bottom), left: Math.round(box.left), right: Math.round(box.right),
            width: Math.round(box.width), height: Math.round(box.height)}; };
        // The node's centre (or a point near its bottom edge) hit-tests to the node itself: painted on top and not clipped.
        window.hit = (node, edge = 'center') => { const box = node.getBoundingClientRect(), y = edge === 'bottom' ? box.bottom - 3 : edge === 'top' ? box.top + 3 : box.top + box.height / 2;
            const target = document.elementFromPoint(box.left + Math.min(box.width / 2, 40), y); return !!target && (node === target || node.contains(target)); };
        window.inView = node => { const box = node.getBoundingClientRect(); return box.top >= -0.5 && box.bottom <= innerHeight + 0.5 && box.left >= -0.5 && box.right <= innerWidth + 0.5; };
        window.hidden = node => !!node?.closest('[inert], [aria-hidden="true"]');
        window.agenda = () => document.querySelector('section[data-presentation]');
        window.state = () => ({dialogs: document.querySelectorAll('section[role=dialog]').length, inert: document.querySelectorAll('[inert]').length,
            overflow: document.documentElement.style.overflow, backdrops: document.querySelectorAll('.nc-backdrop').length, info: window.info()});
        if (script) new Function(script)();
        const module = await import(moduleUrl), fixture = document.getElementById('mount');
        fixture.innerHTML = server;
        window.cal = await module.hydrateOverlay(fixture, options);
    }, {moduleUrl, server: esm.serverOverlay(options).html, options, script});
    await settle(page);
    return {page, context};
}
async function scenario(name, config, body) {
    if (only && !only.test(name)) return;
    await check(name, async () => {
        const fixture = await setup(config);
        try {
            assert.deepEqual(await fixture.page.evaluate(() => window.cal.errors), [], 'hydration must not recover from mismatches');
            return await body(fixture.page, fixture);
        } finally { await fixture.context.close(); }
    });
}
const cleared = async page => { const state = await page.evaluate(() => window.state()); assert.equal(state.inert, 0, 'no inert left'); assert.equal(state.overflow, '', 'scroll lock released'); assert.equal(state.backdrops, 0); };
/** Tab through the open popover: every focused control is inside it, fully inside its scrollport and the viewport. */
async function tabThrough(page, count) {
    const seen = [];
    for (let index = 0; index < count; index++) {
        await press(page, 'Tab');
        const state = await page.evaluate(() => {
            const node = window.active(), scroller = document.querySelector('.nc-agenda-popover'), box = node.getBoundingClientRect(), port = scroller?.getBoundingClientRect();
            return {item: node.closest('[data-item-id]')?.dataset.itemId, inside: !!scroller?.contains(node), visible: !!port && box.top >= port.top - 1 && box.bottom <= port.bottom + 1 && window.inView(node),
                scrollTop: Math.round(scroller?.scrollTop ?? -1)};
        });
        seen.push(state);
    }
    return seen;
}

try {
    // ——— QA-02: desktop popover scrolling ———
    for (const [label, viewport] of [['1280×700', {width: 1280, height: 700}], ['landscape phone 844×390 (QA-21)', {width: 844, height: 390}]]) {
        await scenario(`QA-02 ${label}: a long desktop agenda scrolls by wheel, keeps a programmatic position and keeps every Tab focus visible`, {options: desktop, viewport}, async page => {
            await open(page);
            const metrics = () => page.evaluate(() => { const node = document.querySelector('.nc-agenda-popover'); return {top: Math.round(node.scrollTop), max: node.scrollHeight - node.clientHeight, height: node.clientHeight}; });
            const initial = await metrics(); assert.ok(initial.max > 100, `the agenda overflows its popover (${JSON.stringify(initial)})`);
            const box = await page.locator('.nc-agenda-popover').boundingBox();
            await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
            const series = [];
            for (let index = 0; index < 12; index++) { await page.mouse.wheel(0, 120); await settle(page); series.push((await metrics()).top); }
            for (let index = 1; index < series.length; index++) assert.ok(series[index] >= series[index - 1], `wheel scrolling never jumps back: ${series}`);
            const end = await metrics(); assert.ok(end.top >= end.max - 1, `the end of the list is reachable: ${JSON.stringify(end)} ${series}`);
            // Wait for the last wheel animation to finish before the programmatic position.
            await page.evaluate(async () => { const node = document.querySelector('.nc-agenda-popover'); let last = -1, still = 0;
                while (still < 10) { await new Promise(requestAnimationFrame); still = node.scrollTop === last ? still + 1 : 0; last = node.scrollTop; } });
            assert.equal(await page.evaluate(async () => { const node = document.querySelector('.nc-agenda-popover'); node.scrollTop = 60; for (let i = 0; i < 6; i++) await new Promise(requestAnimationFrame); return Math.round(node.scrollTop); }), 60,
                'a programmatic scroll position is kept');
            await page.evaluate(() => { document.querySelector('.nc-agenda-popover').scrollTop = 0; });
            assert.equal((await info(page)).close, true, 'initial focus on the first control');
            const seen = await tabThrough(page, 13);
            assert.deepEqual(seen.map(entry => entry.item), ['release', ...Array.from({length: 12}, (_, index) => `task-${index + 1}`)]);
            assert.ok(seen.every(entry => entry.inside && entry.visible), JSON.stringify(seen));
            if (viewport.height === 700) await page.screenshot({path: resolve(output, 'qa02-last-item-focused.png')});
            await press(page, 'Escape'); assert.equal((await info(page)).date, '2026-03-04');
            return {popover: initial, wheel: series, lastScrollTop: seen.at(-1).scrollTop};
        });
    }
    await scenario('QA-02: page scrolling keeps the popover on its cell; scrolling inside the popover never repositions it', {options: desktop, viewport: {width: 1280, height: 700},
        after: '#mount{padding-bottom:1600px}'}, async page => {
        await open(page);
        const gap = () => page.evaluate(() => { const cellBox = document.querySelector('[role=gridcell][data-date="2026-03-04"]').getBoundingClientRect(), popover = document.querySelector('.nc-agenda-popover').getBoundingClientRect();
            return Math.round(popover.top - cellBox.bottom); });
        const first = await gap();
        const writes = await page.evaluate(async () => {
            const positioner = document.querySelector('.nc-agenda-positioner'), list = [];
            new MutationObserver(records => list.push(...records)).observe(positioner, {attributes: true, attributeFilter: ['style']});
            const node = document.querySelector('.nc-agenda-popover');
            for (const value of [40, 80, 120]) { node.scrollTop = value; for (let i = 0; i < 3; i++) await new Promise(requestAnimationFrame); }
            return list.length;
        });
        assert.equal(writes, 0, 'no repositioning for the popover\'s own scroll');
        await page.mouse.move(1200, 300); await page.mouse.wheel(0, 150); await settle(page);
        assert.equal(await page.evaluate(() => Math.round(scrollY)), 150); assert.equal(await gap(), first, 'the popover follows its cell');
        return {gap: first};
    });

    // ——— QA-03: modal hosts with the default portal ———
    const dialogHost = `<main style="padding:24px"><h1>Dialog host</h1><button id="behind">Behind</button></main>
        <dialog id="host" aria-label="Schedule" style="width:900px;max-width:95vw;padding:16px"><form method="dialog"><button id="host-close">Close dialog</button></form><div id="mount"></div></dialog>`;
    await scenario('QA-03 native modal <dialog>, desktop: the popover opens inside the dialog, is reachable by keyboard and pointer, and Escape closes it before the dialog', {
        body: dialogHost, script: 'document.getElementById("host").showModal()', options: desktop, viewport: {width: 1280, height: 900}}, async page => {
        await open(page);
        const state = () => page.evaluate(() => { const agenda = window.agenda(), host = document.getElementById('host');
            return {inDialog: !!agenda && host.contains(agenda), hit: !!agenda && window.hit(agenda.closest('.nc-agenda-popover')), open: host.open, focusInside: !!agenda?.contains(window.active())}; });
        assert.deepEqual(await state(), {inDialog: true, hit: true, open: true, focusInside: true});
        await press(page, 'Tab'); assert.equal((await info(page)).item, 'release');
        await press(page, 'Escape'); assert.deepEqual({...await state(), date: (await info(page)).date}, {inDialog: false, hit: false, open: true, focusInside: false, date: '2026-03-04'},
            'the first Escape closes only the agenda');
        await press(page, 'Escape'); assert.equal((await state()).open, false, 'the second Escape reaches the host dialog');
        await page.evaluate(() => document.getElementById('host').showModal()); await settle(page);
        await cell(page).click({position: {x: 10, y: 10}}); await settle(page);
        await page.getByRole('button', {name: /Task 1\b/}).click(); await settle(page);
        assert.deepEqual(await page.evaluate(() => window.cal.events.filter(event => event.type === 'item').map(event => event.value.item.id)), ['task-1']);
    });
    await scenario('QA-03 native modal <dialog>, phone: the sheet is modal inside the dialog; only the dialog content behind it is inert; Escape closes the sheet, then the dialog', {
        body: dialogHost, script: 'document.getElementById("host").showModal()', options: sheet, viewport: phone, touch: true}, async page => {
        await cell(page).tap(); await settle(page);
        const state = await page.evaluate(() => { const agenda = window.agenda(), host = document.getElementById('host');
            return {inDialog: host.contains(agenda), dialogHidden: window.hidden(host), gridHidden: window.hidden(host.querySelector('[role=grid]')), sheetHidden: window.hidden(agenda),
                hit: window.hit(agenda.querySelector('h3')), overflow: document.documentElement.style.overflow, info: window.info()}; });
        assert.deepEqual(state, {inDialog: true, dialogHidden: false, gridHidden: true, sheetHidden: false, hit: true, overflow: 'hidden', info: {...state.info, tag: 'H3'}});
        for (let index = 0; index < 4; index++) { await press(page, 'Tab'); assert.equal((await info(page)).presentation, 'sheet'); }
        await press(page, 'Escape'); assert.equal(await page.evaluate(() => document.getElementById('host').open), true); assert.equal((await info(page)).date, '2026-03-04'); await cleared(page);
        await press(page, 'Escape'); assert.equal(await page.evaluate(() => document.getElementById('host').open), false);
    });
    await scenario('QA-03 focus-trap modal host (aria-modal, focusin trap): the popover keeps focus inside the host and stays open', {
        body: `<main><button id="behind">Behind</button></main><div style="position:fixed;inset:0;background:rgb(0 0 0/50%);z-index:1050"></div>
            <div id="host" role="dialog" aria-modal="true" aria-label="Schedule" tabindex="-1" style="position:fixed;inset:0;z-index:1055;overflow-y:auto"><div style="margin:40px auto;width:900px;background:#fff;padding:16px"><div id="mount"></div></div></div>`,
        script: 'window.trapped = 0; const host = document.getElementById("host"); document.addEventListener("focusin", event => { if (!host.contains(event.target)) { window.trapped++; host.focus(); } });',
        options: desktop}, async page => {
        await open(page);
        const state = await page.evaluate(() => ({inHost: document.getElementById('host').contains(window.agenda()), focusInside: !!window.agenda()?.contains(window.active()), trapped: window.trapped}));
        assert.deepEqual(state, {inHost: true, focusInside: true, trapped: 0});
        await press(page, 'Tab'); assert.equal((await info(page)).item, 'release'); assert.equal(await page.evaluate(() => window.trapped), 0);
        await press(page, 'Escape'); assert.equal((await info(page)).date, '2026-03-04');
    });
    // Spec v7 §10.3.4: only an aria-modal="true" container (or a modal <dialog>) is a default target; a plain role=dialog
    // pointer-events host keeps the body portal, which still receives pointer input under body pointer-events: none.
    for (const [label, modal, explicit, expected] of [['role=dialog content', false, false, 'body'], ['role=dialog aria-modal=true content', true, false, 'host'],
        ['role=dialog aria-modal=true content with an explicit body portalContainer', true, true, 'body']]) {
        await scenario(`QA-03 pointer-events host (body pointer-events: none, ${label}): the popover is in the ${expected} and receives pointer input`, {
            body: `<div id="host" role="dialog"${modal ? ' aria-modal="true"' : ''} aria-label="Schedule" style="pointer-events:auto;margin:24px"><div id="mount"></div></div>`, before: 'body{pointer-events:none}',
            options: desktop}, async page => {
            if (explicit) { await page.evaluate(() => window.cal.patch({portalContainer: document.body})); await settle(page); }
            await cell(page).click({position: {x: 10, y: 10}}); await settle(page);
            const where = await page.evaluate(() => document.getElementById('host').contains(window.agenda()) ? 'host' : 'body');
            assert.equal(where, expected);
            await page.getByRole('button', {name: /Task 2\b/}).click(); await settle(page);
            assert.deepEqual(await page.evaluate(() => window.cal.events.filter(event => event.type === 'item').map(event => event.value.item.id)), ['task-2']);
        });
    }
    // ——— Spec v7 §10.3.4 (decision 2026-10-09): non-modal host dialogs are not default portal targets ———
    const panels = [['a non-modal role=dialog side panel', '<aside id="panel" role="dialog" aria-label="Filters" style="position:fixed;top:0;right:0;bottom:0;width:760px;overflow:auto;background:#fff;border-left:1px solid #888;padding:8px"><div id="mount"></div></aside>', ''],
        ['a non-modal role=alertdialog side panel', '<aside id="panel" role="alertdialog" aria-label="Filters" style="position:fixed;top:0;right:0;bottom:0;width:760px;overflow:auto;background:#fff;border-left:1px solid #888;padding:8px"><div id="mount"></div></aside>', ''],
        ['an open non-modal <dialog> (show())', '<dialog id="panel" aria-label="Filters" style="position:fixed;inset:0 0 0 auto;margin:0;width:760px;max-height:none;height:100%;overflow:auto;padding:8px"><div id="mount"></div></dialog>', 'document.getElementById("panel").show()']];
    for (const [label, body, script] of panels) {
        await scenario(`v7 §10.3.4 ${label} around the root: the default popover portal stays in the owner body, unclipped and usable; nothing becomes inert`, {
            body: `<main style="padding:24px"><h1>Page</h1><button id="behind">Behind</button></main>${body}`, script, options: desktop, viewport: {width: 1280, height: 900}}, async page => {
            await open(page);
            const state = await page.evaluate(() => { const agenda = window.agenda(), panel = document.getElementById('panel'), popover = document.querySelector('.nc-agenda-popover');
                return {inPanel: panel.contains(agenda), inBody: document.body.contains(agenda), focusInside: !!agenda?.contains(window.active()), inert: document.querySelectorAll('[inert]').length,
                    hit: window.hit(popover), height: Math.round(popover.getBoundingClientRect().height), scrollHeight: popover.scrollHeight}; });
            assert.deepEqual({inPanel: state.inPanel, inBody: state.inBody, focusInside: state.focusInside, inert: state.inert, hit: state.hit}, {inPanel: false, inBody: true, focusInside: true, inert: 0, hit: true}, JSON.stringify(state));
            assert.ok(state.height > 300, `the panel does not squeeze the popover: ${JSON.stringify(state)}`);
            await press(page, 'Tab'); assert.equal((await info(page)).item, 'release');
            await press(page, 'Escape'); assert.equal((await info(page)).date, '2026-03-04');
            await cell(page).click({position: {x: 10, y: 10}}); await settle(page);
            await page.getByRole('button', {name: /Task 3\b/}).click(); await settle(page);
            assert.deepEqual(await page.evaluate(() => window.cal.events.filter(event => event.type === 'item').map(event => event.value.item.id)), ['task-3']);
            return state;
        });
    }
    // Spec v7 §10.3.4: a change of the default target while the agenda is open closes it like a portalContainer identity change.
    // DEC-1-02: hosts change modality by attributes alone (aria-modal, the open state of showModal()/close()/show()); no
    // node is inserted or removed in these scenarios.
    await scenario('v7 §10.3.4 the aria-modal host around the root stops being modal while the popover is open (aria-modal removed, no other DOM change): the agenda closes, focus returns to the cell; the next activation opens it in the body', {
        body: '<div id="host" role="dialog" aria-modal="true" aria-label="Schedule" style="margin:24px"><div id="mount"></div></div>', options: desktop}, async page => {
        await open(page);
        assert.equal(await page.evaluate(() => document.getElementById('host').contains(window.agenda())), true);
        await page.evaluate(() => document.getElementById('host').removeAttribute('aria-modal')); await settle(page);
        const after = await page.evaluate(() => ({agenda: !!window.agenda(), date: window.info().date, inert: document.querySelectorAll('[inert]').length}));
        assert.deepEqual(after, {agenda: false, date: '2026-03-04', inert: 0});
        await press(page, 'Enter');
        const reopened = await page.evaluate(() => ({inHost: document.getElementById('host').contains(window.agenda()), inBody: document.body.contains(window.agenda()), focusInside: !!window.agenda()?.contains(window.active())}));
        assert.deepEqual(reopened, {inHost: false, inBody: true, focusInside: true});
        return {after, reopened};
    });
    await scenario('v7 §10.3.4 a plain host around the root becomes modal while the popover is open in the body (aria-modal="true" set, no other DOM change): the agenda closes, focus returns to the cell; the next activation opens it in the host', {
        body: '<div id="host" role="dialog" aria-label="Schedule" style="margin:24px"><div id="mount"></div></div>', options: desktop}, async page => {
        await open(page);
        assert.deepEqual(await page.evaluate(() => ({inHost: document.getElementById('host').contains(window.agenda()), inBody: document.body.contains(window.agenda())})), {inHost: false, inBody: true});
        await page.evaluate(() => document.getElementById('host').setAttribute('aria-modal', 'true')); await settle(page);
        const after = await page.evaluate(() => ({agenda: !!window.agenda(), date: window.info().date, inert: document.querySelectorAll('[inert]').length}));
        assert.deepEqual(after, {agenda: false, date: '2026-03-04', inert: 0});
        await press(page, 'Enter');
        const reopened = await page.evaluate(() => ({inHost: document.getElementById('host').contains(window.agenda()), focusInside: !!window.agenda()?.contains(window.active())}));
        assert.deepEqual(reopened, {inHost: true, focusInside: true});
        await press(page, 'Escape'); assert.equal((await info(page)).date, '2026-03-04');
        return {after, reopened};
    });
    await scenario('v7 §10.3.4 a modal <dialog> host turns non-modal while the popover is open (close() then show(), no node change): the agenda closes; the next activation opens it in the body', {
        body: dialogHost, script: 'document.getElementById("host").showModal()', options: desktop, viewport: {width: 1280, height: 900}}, async page => {
        await open(page);
        assert.equal(await page.evaluate(() => document.getElementById('host').contains(window.agenda())), true);
        await page.evaluate(() => { const host = document.getElementById('host'); host.close(); host.show(); }); await settle(page);
        const after = await page.evaluate(() => ({agenda: !!window.agenda(), modal: document.getElementById('host').matches(':modal'), open: document.getElementById('host').open, inert: document.querySelectorAll('[inert]').length}));
        assert.deepEqual(after, {agenda: false, modal: false, open: true, inert: 0});
        await open(page);
        const reopened = await page.evaluate(() => ({inHost: document.getElementById('host').contains(window.agenda()), inBody: document.body.contains(window.agenda()), focusInside: !!window.agenda()?.contains(window.active())}));
        assert.deepEqual(reopened, {inHost: false, inBody: true, focusInside: true});
        await press(page, 'Escape'); assert.equal((await info(page)).date, '2026-03-04');
        return {after, reopened};
    });
    // Review 2026-10-09-1 fix 2 (C1): a closed Calendar observes no document, so a host <dialog> that turns modal around it
    // after hydration is found only when an overlay opens. A §11.3 passive switch with focus inside the inline agenda opens
    // one without any user activation; it must still open in the dialog (the default target) and keep the same control.
    const switches = [['inline → popover (layout mobile → desktop)', {layout: 'desktop'}, 'popover', {width: 1280, height: 900}],
        ['inline → sheet (agendaPresentation auto → overlay)', {agendaPresentation: 'overlay'}, 'sheet', phone]];
    // showModal() moves focus into the dialog, so the native host turns modal before focus enters the agenda; an aria-modal
    // host turns modal by its attribute alone, with focus already inside the agenda.
    const hosts = [['a <dialog> shown with show() at hydration turns modal (close() + showModal()) before focus enters the inline agenda', dialogHost, 'document.getElementById("host").show()',
        () => { const host = document.getElementById('host'); host.close(); host.showModal(); }, 'before'],
    ['a role="dialog" host gets aria-modal="true" while focus is inside the inline agenda', '<div id="host" role="dialog" aria-label="Schedule" style="margin:24px"><div id="mount"></div></div>', '',
        () => document.getElementById('host').setAttribute('aria-modal', 'true'), 'while']];
    for (const [label, change, presentation, viewport] of switches) for (const [hostLabel, body, script, turnModal, order] of hosts) {
        await scenario(`§10.3.4/§11.3 ${label}: ${hostLabel}; the overlay opens inside the host and keeps focus on the same control (review 2026-10-09-1 fix 2)`, {
            body, script, options: {items: busy, layout: 'mobile'}, viewport}, async page => {
            const modal = () => page.evaluate(`(${turnModal})()`);
            const focus = () => page.evaluate(() => document.querySelector('section[data-presentation=inline] [data-item-id="task-3"] [data-agenda-control]').focus());
            if (order === 'before') { await modal(); await settle(page); await focus(); } else { await focus(); await settle(page); await modal(); }
            await settle(page);
            const before = await info(page);
            const isModal = () => page.evaluate(() => { const host = document.getElementById('host'); return host.localName === 'dialog' ? host.matches(':modal') : host.getAttribute('aria-modal') === 'true'; });
            assert.deepEqual({item: before.item, presentation: before.presentation, modal: await isModal()}, {item: 'task-3', presentation: 'inline', modal: true});
            await page.evaluate(() => { window.moves = []; new MutationObserver(records => { for (const record of records) for (const [kind, nodes] of [['added', record.addedNodes], ['removed', record.removedNodes]])
                for (const node of nodes) if (node.nodeType === 1 && (node.matches('section[data-presentation]:not([data-presentation=inline])') || node.querySelector('section[data-presentation]:not([data-presentation=inline])')))
                    window.moves.push(`${kind} ${record.target.closest('#host') ? 'host' : 'body'}`); }).observe(document, {subtree: true, childList: true}); });
            const frames = await page.evaluate(async change => {
                // Paint check: every animation frame after the switch shows exactly one surface, inside the host.
                const seen = [];
                window.cal.patch(change);
                for (let index = 0; index < 8; index++) { await new Promise(requestAnimationFrame); const surfaces = [...document.querySelectorAll('section[data-presentation]')];
                    seen.push(surfaces.map(node => `${node.dataset.presentation}@${document.getElementById('host').contains(node) ? 'host' : 'body'}`).join(',')); }
                return seen;
            }, change);
            await settle(page);
            const after = await page.evaluate(() => { const agenda = window.agenda(), node = window.active(), host = document.getElementById('host');
                return {presentation: agenda?.dataset.presentation, inDialog: !!agenda && host.contains(agenda), focusInside: !!agenda?.contains(node), item: node?.closest('[data-item-id]')?.dataset.itemId,
                    control: node?.dataset.agendaControl, hit: !!agenda && window.hit(node), hidden: window.hidden(node)}; });
            assert.deepEqual(after, {presentation, inDialog: true, focusInside: true, item: 'task-3', control: 'primary', hit: true, hidden: false});
            assert.equal(await isModal(), true, 'the host is still modal');
            assert.ok(frames.every(frame => frame === `${presentation}@host`), `painted frames: ${JSON.stringify(frames)}`);
            const mutations = await page.evaluate(() => window.moves);
            await page.screenshot({path: resolve(output, `fix2-${presentation}-${order}.png`)});
            // Escape closes the overlay first; focus returns to the date cell inside the still modal host.
            await press(page, 'Escape');
            const closed = await page.evaluate(() => ({agenda: window.agenda()?.dataset.presentation ?? null, date: window.info().date, inHost: document.getElementById('host').contains(window.active())}));
            assert.deepEqual(closed, {agenda: null, date: '2026-03-04', inHost: true}); assert.equal(await isModal(), true);
            await cleared(page);
            return {before, after, frames, mutations, closed};
        });
    }
    // ——— QA-B-1-05: a popover near the bottom of a modal <dialog> flips upward when more room is above ———
    const late = Array.from({length: 10}, (_, index) => ({id: `eve-${index + 1}`, title: `Evening ${index + 1}`, data: {}, interval: {kind: 'timed', start: `2026-03-31T${hour(index)}:00:00Z`}}));
    for (const [viewport, date] of [[{width: 1280, height: 900}, '2026-03-31'], [{width: 1280, height: 900}, '2026-03-25'], [{width: 1280, height: 900}, '2026-03-18'], [{width: 1280, height: 760}, '2026-03-31'], [{width: 1280, height: 900}, '2026-03-04']]) {
        await scenario(`QA-B-1-05 popover in a modal <dialog> (${viewport.width}×${viewport.height}, ${date}): placed on the side with more room, not squeezed below the anchor; within the dialog's visible box`, {
            body: dialogHost, script: 'document.getElementById("host").showModal()', options: {...desktop, items: [...busy, ...late]}, viewport}, async page => {
            await open(page, date);
            const state = await page.evaluate(() => {
                const host = document.getElementById('host').getBoundingClientRect(), popover = document.querySelector('.nc-agenda-popover'), box = popover.getBoundingClientRect();
                return {popover: window.rect(popover), natural: popover.scrollHeight + 2, dialog: window.rect(document.getElementById('host')), within: box.top >= Math.max(host.top, 0) - 0.5 && box.bottom <= Math.min(host.bottom, innerHeight) + 0.5,
                    closeVisible: window.hit(window.active()), close: window.info().close};
            });
            const anchor = await cell(page, date).boundingBox(), area = {top: Math.max(state.dialog.top, 0), bottom: Math.min(state.dialog.bottom, viewport.height)};
            const below = area.bottom - 16 - (anchor.y + anchor.height + 8), above = anchor.y - 8 - (area.top + 16), {popover} = state;
            const placed = popover.top >= anchor.y + anchor.height - 0.5 ? 'below' : popover.bottom <= anchor.y + 0.5 ? 'above' : 'overlapping';
            const expected = state.natural <= below + 1 || below >= above ? 'below' : 'above', room = expected === 'below' ? below : above;
            const details = {...state, anchor: {top: Math.round(anchor.y), bottom: Math.round(anchor.y + anchor.height)}, below: Math.round(below), above: Math.round(above), placed, expected};
            assert.equal(state.close, true); assert.equal(state.closeVisible, true, JSON.stringify(details)); assert.equal(state.within, true, JSON.stringify(details));
            assert.equal(placed, expected, JSON.stringify(details));
            assert.ok(popover.height >= Math.min(state.natural, room) - 2, `the popover uses the room on its side: ${JSON.stringify(details)}`);
            return details;
        });
    }
    for (const date of ['2026-03-18', '2026-03-25', '2026-03-11']) {
        await scenario(`QA-03 popover in a modal <dialog> (${date}): placed within the dialog's visible box; the focused close control is visible`, {
            body: dialogHost, script: 'document.getElementById("host").showModal()', options: desktop, viewport: {width: 1280, height: 900}}, async page => {
            await open(page, date);
            const state = await page.evaluate(() => { const host = document.getElementById('host').getBoundingClientRect(), popover = document.querySelector('.nc-agenda-popover'), box = popover.getBoundingClientRect();
                return {within: box.top >= host.top - 0.5 && box.bottom <= host.bottom + 0.5, closeVisible: window.hit(window.active()), close: window.info().close, popover: window.rect(popover), dialog: window.rect(document.getElementById('host'))}; });
            assert.equal(state.close, true); assert.equal(state.closeVisible, true, JSON.stringify(state)); assert.equal(state.within, true, JSON.stringify(state));
            return state;
        });
    }

    // ——— QA-10: host dialog opened from onItemPress above the modal sheet ———
    const portalDetails = `window.calendarItemPress = ({item}) => {
        const modal = document.createElement('div'); modal.id = 'details'; modal.setAttribute('role', 'dialog'); modal.setAttribute('aria-modal', 'true'); modal.setAttribute('aria-label', 'Item details');
        modal.style.cssText = 'position:fixed;inset:120px 24px auto;z-index:1050;background:#fff;padding:16px;border:1px solid';
        modal.innerHTML = '<p>' + item.title + '</p><input id="note" aria-label="Note"><button id="details-close">Close details</button>';
        document.body.append(modal); requestAnimationFrame(() => document.getElementById('note').focus());
        modal.querySelector('#details-close').addEventListener('click', () => { modal.remove(); });
    };`;
    const nativeDetails = `window.calendarItemPress = ({item}) => {
        const dialog = document.createElement('dialog'); dialog.id = 'details'; dialog.setAttribute('aria-label', 'Item details');
        dialog.innerHTML = '<p>' + item.title + '</p><input id="note" aria-label="Note"><button id="details-close">Close details</button>';
        document.body.append(dialog); dialog.showModal();
        dialog.querySelector('#details-close').addEventListener('click', () => { dialog.close(); dialog.remove(); });
    };`;
    for (const [label, script] of [['a portaled aria-modal dialog', portalDetails], ['a native modal <dialog>', nativeDetails]]) {
        await scenario(`QA-10 ${label} from onItemPress above the sheet: exposed, on top, usable by keyboard; the sheet resumes with focus on the pressed item`, {script, options: sheet, viewport: phone, touch: true}, async page => {
            await cell(page).tap(); await settle(page);
            await page.getByRole('button', {name: /Task 1\b/}).tap(); await settle(page);
            const state = await page.evaluate(() => { const details = document.getElementById('details'), backdrop = document.querySelector('.nc-sheet-backdrop');
                return {hidden: window.hidden(details), onTop: window.hit(details), focus: window.active()?.id, yielded: backdrop.hasAttribute('data-yielded'), sheet: !!window.agenda()}; });
            assert.deepEqual(state, {hidden: false, onTop: true, focus: 'note', yielded: true, sheet: true});
            await page.keyboard.type('hello'); assert.equal(await page.evaluate(() => document.getElementById('note').value), 'hello');
            await press(page, 'Tab'); assert.equal((await info(page)).id, 'details-close');
            await page.keyboard.press('Enter'); await settle(page); await settle(page);
            const after = await page.evaluate(() => ({details: !!document.getElementById('details'), yielded: document.querySelector('.nc-sheet-backdrop')?.hasAttribute('data-yielded'), info: window.info(),
                inert: document.querySelectorAll('[inert]').length > 0}));
            assert.deepEqual(after, {details: false, yielded: false, info: {...after.info, item: 'task-1', presentation: 'sheet'}, inert: true}, JSON.stringify(after));
            for (let index = 0; index < 3; index++) { await press(page, 'Tab'); assert.equal((await info(page)).presentation, 'sheet', 'containment resumes'); }
            await press(page, 'Escape'); assert.equal((await info(page)).date, '2026-03-04'); await cleared(page);
        });
    }

    // ——— QA-B-1-03: a non-modal host dialog shown above the sheet is background; the stack does not yield ———
    for (const role of ['dialog', 'alertdialog']) {
        await scenario(`QA-B-1-03 a non-modal role=${role} appearing after the sheet opened: inert background, the sheet keeps containment and Escape; nothing yields`, {options: sheet, viewport: phone, touch: true}, async page => {
            await cell(page).tap(); await settle(page);
            await page.evaluate(role => { const toast = document.createElement('div'); toast.id = 'toast'; toast.setAttribute('role', role); toast.setAttribute('aria-label', 'Saved');
                toast.style.cssText = 'position:fixed;inset:auto 8px 8px;z-index:10;background:#fff;padding:8px'; toast.innerHTML = 'Saved <button id="undo">Undo</button>'; document.body.append(toast); }, role);
            await settle(page);
            const state = await page.evaluate(() => ({yielded: document.querySelector('.nc-sheet-backdrop').hasAttribute('data-yielded'), toastHidden: window.hidden(document.getElementById('toast')),
                focusInSheet: !!document.querySelector('.nc-sheet')?.contains(window.active()), z: getComputedStyle(document.querySelector('.nc-sheet-backdrop')).zIndex}));
            assert.deepEqual(state, {yielded: false, toastHidden: true, focusInSheet: true, z: '100000'});
            for (let index = 0; index < 4; index++) { await press(page, 'Tab'); assert.equal((await info(page)).presentation, 'sheet', 'containment continues'); }
            await press(page, 'Escape'); assert.equal((await info(page)).date, '2026-03-04'); await cleared(page);
            assert.equal(await page.evaluate(() => window.hidden(document.getElementById('toast'))), false, 'the panel is exposed again after the sheet closes');
            return state;
        });
    }

    // ——— QA-B-1-03 (residual): a modal host layer inside an open ShadowRoot (a web-component modal) yields the stack ———
    await scenario('QA-B-1-03 a web-component modal (aria-modal="true" inside nested open ShadowRoots) opened above the sheet: exposed and usable, the sheet yields until it closes', {options: sheet, viewport: phone, touch: true}, async page => {
        await cell(page).tap(); await settle(page);
        await page.evaluate(() => {
            const component = document.createElement('x-host-modal'); component.id = 'component'; document.body.append(component);
            const outer = component.attachShadow({mode: 'open'}); outer.innerHTML = '<div id="inner"></div>';
            const inner = outer.getElementById('inner').attachShadow({mode: 'open'});
            inner.innerHTML = '<div role="dialog" aria-label="Component modal" style="position:fixed;inset:20% 10%;z-index:200000;background:#fff;padding:12px"><input id="note" aria-label="Note"><button id="ok">OK</button></div>';
            window.componentDialog = inner.querySelector('[role=dialog]');
        });
        await settle(page);
        const before = await page.evaluate(() => ({yielded: document.querySelector('.nc-sheet-backdrop').hasAttribute('data-yielded'), hidden: window.hidden(document.getElementById('component'))}));
        assert.deepEqual(before, {yielded: false, hidden: true}, 'not modal yet: background');
        // The component becomes modal, then focuses its field in a later frame, as a modal component does after it renders.
        await page.evaluate(() => window.componentDialog.setAttribute('aria-modal', 'true')); await settle(page);
        await page.evaluate(() => window.componentDialog.querySelector('#note').focus()); await settle(page);
        const open = await page.evaluate(() => ({yielded: document.querySelector('.nc-sheet-backdrop').hasAttribute('data-yielded'), hidden: window.hidden(document.getElementById('component')),
            z: getComputedStyle(document.querySelector('.nc-sheet-backdrop')).zIndex, focus: window.active()?.id}));
        assert.deepEqual(open, {yielded: true, hidden: false, z: 'auto', focus: 'note'});
        await page.keyboard.type('ok'); await press(page, 'Tab');
        assert.equal(await page.evaluate(() => window.active()?.id), 'ok', 'Tab moves inside the component modal, not into the sheet');
        await page.evaluate(() => window.componentDialog.removeAttribute('aria-modal')); await settle(page);
        const after = await page.evaluate(() => ({yielded: document.querySelector('.nc-sheet-backdrop').hasAttribute('data-yielded'), hidden: window.hidden(document.getElementById('component'))}));
        assert.deepEqual(after, {yielded: false, hidden: true});
        await press(page, 'Escape'); await cleared(page);
        return {before, open, after};
    });

    // ——— QA-B-1-02 (residual): only a press that starts and ends on the backdrop dismisses the sheet ———
    await scenario('QA-B-1-02 a mouse drag from the sheet heading to the backdrop (text selection) and back keeps the sheet; a whole backdrop press dismisses it', {options: {...sheet, layout: 'mobile'}, viewport: phone}, async page => {
        await open(page);
        const points = await page.evaluate(() => {
            const heading = document.querySelector('.nc-sheet h3').getBoundingClientRect(), sheet = document.querySelector('.nc-sheet').getBoundingClientRect();
            return {heading: {x: heading.left + 4, y: heading.top + heading.height / 2}, backdrop: {x: 20, y: Math.max(10, sheet.top - 40)}};
        });
        const drag = async (from, to) => { await page.mouse.move(from.x, from.y); await page.mouse.down(); await page.mouse.move(to.x, to.y, {steps: 5}); await page.mouse.up(); await settle(page); };
        await drag(points.heading, points.backdrop);
        const sheetToBackdrop = (await page.evaluate(() => window.state())).dialogs;
        await drag(points.backdrop, points.heading);
        const backdropToSheet = (await page.evaluate(() => window.state())).dialogs;
        assert.deepEqual({sheetToBackdrop, backdropToSheet}, {sheetToBackdrop: 1, backdropToSheet: 1});
        await page.mouse.click(points.backdrop.x, points.backdrop.y); await settle(page);
        assert.equal((await page.evaluate(() => window.state())).dialogs, 0, 'a whole press on the backdrop dismisses');
        assert.equal((await info(page)).date, '2026-03-04'); await cleared(page);
        return {points, sheetToBackdrop, backdropToSheet};
    });

    // ——— QA-B-1-04 (residual): a pure modifier right after the activation keeps the opening intent ———
    for (const [label, options, viewport] of [['popover', desktop, {width: 1000, height: 800}], ['sheet', sheet, {width: 390, height: 800}]]) {
        await scenario(`QA-B-1-04 ${label}: Shift, Control or Meta pressed right after Enter does not cancel the opening`, {options, viewport}, async page => {
            const outcomes = [];
            for (const key of ['Shift', 'Control', 'Meta', 'KeyA']) {
                await cell(page).focus(); await page.keyboard.press('Enter'); await page.keyboard.press(key);
                await page.waitForTimeout(150); await settle(page);
                const state = await page.evaluate(() => ({dialogs: window.state().dialogs, inside: !!window.agenda()?.contains(window.active())}));
                outcomes.push({key, ...state});
                if (state.dialogs) { await press(page, 'Escape'); await settle(page); }
            }
            // A letter is recorded only: whether it lands before the overlay commits depends on the frame timing (QA-20 covers Escape).
            const modifiers = outcomes.filter(entry => entry.key !== 'KeyA');
            assert.ok(modifiers.every(entry => entry.dialogs === 1 && entry.inside), JSON.stringify(outcomes));
            return {outcomes};
        });
    }

    // ——— QA-11: host fixed layers ———
    await scenario('QA-11: host fixed bars (z-index 1030) stay below the modal sheet; the last focused item is not covered', {
        body: '<header id="top-bar" style="position:fixed;inset:0 0 auto 0;height:56px;z-index:1030;background:#0d3b66">Top bar</header><main style="padding:64px 8px 80px"><div id="mount"></div></main><nav id="tab-bar" style="position:fixed;inset:auto 0 0 0;height:64px;z-index:1030;background:#600">Tab bar</nav>',
        options: sheet, viewport: phone, touch: true}, async page => {
        await cell(page).tap(); await settle(page);
        const state = await page.evaluate(() => ({z: getComputedStyle(document.querySelector('.nc-sheet-backdrop')).zIndex, barsInert: ['top-bar', 'tab-bar'].map(id => document.getElementById(id).inert)}));
        assert.deepEqual(state, {z: '100000', barsInert: [true, true]});
        // Paint order: the top bar (#0d3b66) is dimmed by the scrim; where the tab bar (#600) lies, the sheet surface shows.
        const top = await pixel(page, 200, 30), bottom = await pixel(page, 200, 830);
        assert.ok(top[1] < 45 && top[2] < 75, `the scrim covers the top bar: rgb(${top})`); assert.ok(bottom[1] > 200, `the sheet covers the tab bar: rgb(${bottom})`);
        const seen = [];
        for (let index = 0; index < 14; index++) {
            await press(page, 'Tab');
            seen.push(await page.evaluate(() => ({item: window.info().item, close: window.info().close, visible: window.hit(window.active(), 'bottom') && window.inView(window.active())})));
        }
        assert.ok(seen.every(entry => entry.visible), JSON.stringify(seen)); assert.ok(seen.some(entry => entry.item === 'task-12'));
        const last = await page.evaluate(() => { const box = [...document.querySelectorAll('.nc-sheet li')].at(-1).querySelector('button').getBoundingClientRect(); return {x: Math.round(box.left + 20), y: Math.round(box.bottom - 4)}; });
        const lastPixel = await pixel(page, last.x, last.y); assert.ok(lastPixel[1] > 100, `the last item is painted above the tab bar: rgb(${lastPixel}) at ${JSON.stringify(last)}`);
        await page.screenshot({path: resolve(output, 'qa11-sheet-over-host-bars.png')});
        // Backwards: an item scrolled into view is not covered by the sticky heading.
        const back = [];
        for (let index = 0; index < 13; index++) {
            await press(page, 'Shift+Tab');
            back.push(await page.evaluate(() => ({item: window.info().item, close: window.info().close, visible: window.hit(window.active(), 'top') && window.hit(window.active(), 'bottom')})));
        }
        assert.ok(back.every(entry => entry.visible), JSON.stringify(back));
        return {z: state.z, topBar: top, tabBarArea: bottom};
    });

    // ——— QA-20: Enter/press immediately followed by Escape ———
    for (const [label, options, viewport] of [['popover', desktop, {width: 1000, height: 800}], ['sheet', sheet, {width: 390, height: 800}], ['controlled sheet', {...sheet, controlled: true}, {width: 390, height: 800}]]) {
        await scenario(`QA-20 ${label}: Enter or a press immediately followed by Escape never leaves an overlay open; the date cell keeps focus`, {options, viewport}, async page => {
            const outcomes = [];
            for (const [index, date] of ['2026-03-04', '2026-03-11', '2026-03-18', '2026-03-25', '2026-03-12'].entries()) for (const mode of ['keyboard', 'pointer']) {
                if (mode === 'keyboard') { await cell(page, date).focus(); await page.keyboard.press('Enter'); await page.keyboard.press('Escape'); }
                else { await cell(page, date).click({position: {x: 6, y: 6}}); await page.keyboard.press('Escape'); }
                await page.waitForTimeout(150); await settle(page);
                const state = await page.evaluate(() => window.state());
                outcomes.push({date, mode, dialogs: state.dialogs, focus: state.info.date ?? state.info.tag, inert: state.inert, overflow: state.overflow});
                if (index === 0 && mode === 'keyboard') assert.ok(true);
            }
            assert.ok(outcomes.every(entry => entry.dialogs === 0 && entry.focus === entry.date && entry.inert === 0 && entry.overflow === ''), JSON.stringify(outcomes));
            await open(page); assert.equal(await page.evaluate(() => !!window.agenda()?.contains(window.active())), true, 'a later activation opens with its initial focus');
            return {cases: outcomes.length};
        });
    }

    // ——— QA-21: anchoring and agenda ergonomics ———
    await scenario('QA-21: an anchor scrolled out of a host scroll container clips its popover away (focus kept); keyboard focus inside brings the anchor back', {
        body: '<main style="padding:24px"><h1 id="heading">Scroll container host</h1><div id="scroller" style="height:520px;overflow:auto;border:3px solid purple"><div style="height:260px"></div><div id="mount"></div><div style="height:900px"></div></div></main>',
        options: desktop, viewport: {width: 1280, height: 900}}, async page => {
        await page.evaluate(() => { document.getElementById('scroller').scrollTop = 200; }); await settle(page);
        await cell(page, '2026-03-04').click({position: {x: 10, y: 10}}); await settle(page);
        const state = () => page.evaluate(() => { const popover = document.querySelector('.nc-agenda-positioner'), box = popover.getBoundingClientRect(), heading = document.getElementById('heading').getBoundingClientRect();
            const target = document.elementFromPoint(box.left + 20, Math.max(box.top, 0) + 20);
            return {clipped: getComputedStyle(popover).clipPath !== 'none', painted: !!target && popover.contains(target), overHeading: box.top < heading.bottom && box.bottom > heading.top,
                focusInside: popover.contains(window.active()), scrollTop: document.getElementById('scroller').scrollTop}; });
        let current = await state(); assert.deepEqual({clipped: current.clipped, painted: current.painted, focusInside: current.focusInside}, {clipped: false, painted: true, focusInside: true});
        await page.evaluate(() => document.getElementById('scroller').scrollBy(0, 420)); await settle(page);
        current = await state(); assert.deepEqual({clipped: current.clipped, painted: current.painted, focusInside: current.focusInside}, {clipped: true, painted: false, focusInside: true}, JSON.stringify(current));
        const away = current.scrollTop;
        await press(page, 'Tab'); current = await state();
        assert.ok(current.scrollTop < away, 'keyboard focus inside the popover scrolls its anchor back into view'); assert.deepEqual({clipped: current.clipped, focusInside: current.focusInside}, {clipped: false, focusInside: true});
        await press(page, 'Escape'); assert.equal((await info(page)).date, '2026-03-04');
    });
    await scenario('QA-21: a controlled agenda date that leaves the grid re-anchors the popover to the root toolbar, in view, with its focused control visible', {
        options: {...desktop, controlled: true}, viewport: {width: 1000, height: 800}}, async page => {
        await open(page, '2026-03-04');
        await patch(page, {anchorDate: '2026-05-01'}); await settle(page);
        const state = await page.evaluate(() => { const positioner = document.querySelector('.nc-agenda-positioner'), toolbar = document.querySelector('.nc-calendar-toolbar').getBoundingClientRect(), box = positioner.getBoundingClientRect();
            return {date: window.agenda().dataset.date, top: Math.round(box.top), toolbarBottom: Math.round(toolbar.bottom), height: Math.round(box.height), focusVisible: window.hit(window.active()) && window.inView(window.active()),
                controls: document.querySelectorAll('[aria-controls]').length}; });
        assert.equal(state.date, '2026-03-04'); assert.ok(state.top >= state.toolbarBottom && state.top <= state.toolbarBottom + 16, JSON.stringify(state)); assert.ok(state.height > 150, JSON.stringify(state));
        assert.equal(state.focusVisible, true); assert.equal(state.controls, 0, 'no IDREF to a cell outside the grid');
        return state;
    });
    await scenario('QA-21: the sheet heading and close control stay visible while the sheet scrolls; the mobile inline agenda has no nested scroller', {options: sheet, viewport: {width: 390, height: 640}, touch: true}, async page => {
        await cell(page).tap(); await settle(page);
        const sheetState = await page.evaluate(async () => { const list = document.querySelector('.nc-sheet ul'); list.scrollTop = list.scrollHeight; for (let i = 0; i < 3; i++) await new Promise(requestAnimationFrame);
            const close = document.querySelector('[data-agenda-close]'), last = list.lastElementChild.querySelector('button');
            return {scrolled: list.scrollTop > 100, closeVisible: window.hit(close), headingVisible: window.hit(document.querySelector('.nc-sheet h3')), lastVisible: window.hit(last, 'bottom'),
                sheetScrolls: document.querySelector('.nc-sheet').scrollHeight > document.querySelector('.nc-sheet').clientHeight + 1}; });
        assert.deepEqual(sheetState, {scrolled: true, closeVisible: true, headingVisible: true, lastVisible: true, sheetScrolls: false});
        // Keyboard: Tab to the last item and back; every focused item is fully visible.
        await page.evaluate(() => { document.querySelector('.nc-sheet ul').scrollTop = 0; window.agenda().querySelector('h3').focus(); });
        const walk = [];
        for (const key of [...Array(14).fill('Tab'), ...Array(13).fill('Shift+Tab')]) {
            await press(page, key);
            walk.push(await page.evaluate(() => window.hit(window.active(), 'top') && window.hit(window.active(), 'bottom')));
        }
        assert.ok(walk.every(Boolean), JSON.stringify(walk));
        await press(page, 'Escape');
        await patch(page, {agendaPresentation: 'auto'}); await open(page);
        const inline = await page.evaluate(() => { const list = document.querySelector('section[data-presentation=inline]'); return {presentation: list.dataset.presentation, nested: list.scrollHeight > list.clientHeight + 1}; });
        assert.deepEqual(inline, {presentation: 'inline', nested: false});
        // Review 2026-10-09-1: the inline agenda is a scroll container (`overflow: auto`) so that it scrolls inside a root of
        // definite height; in this intrinsic root it has nothing to scroll, so a wheel over it scrolls the page.
        const point = await page.evaluate(() => { const list = document.querySelector('section[data-presentation=inline]'); list.scrollIntoView({block: 'start'});
            const box = list.getBoundingClientRect(); return {x: box.left + box.width / 2, y: Math.min(box.top + 200, innerHeight - 20), scrollY: scrollY}; });
        await page.mouse.move(point.x, point.y); await page.mouse.wheel(0, 400); await page.waitForTimeout(300); await settle(page);
        const wheel = await page.evaluate(() => ({page: scrollY, agenda: document.querySelector('section[data-presentation=inline]').scrollTop}));
        assert.ok(wheel.page > point.scrollY && wheel.agenda === 0, JSON.stringify({point, wheel}));
        return {sheet: sheetState, inline, wheel: {before: point.scrollY, ...wheel}};
    });

    // ——— QA-22: host CSS ———
    const resets = [['button{all:unset} before the package CSS', 'button{all:unset}', ''], ['* { box-sizing: content-box } after the package CSS', '', '*{box-sizing:content-box}'],
        ['inherited content-box pattern', '', 'html{box-sizing:content-box} *,*::before,*::after{box-sizing:inherit}']];
    for (const [label, before, after] of resets) for (const options of [desktop, sheet]) {
        const kind = options === desktop ? 'popover' : 'sheet';
        await scenario(`QA-22 ${label}, ${kind}: package-owned UI keeps border-box sizing; nothing overflows its container`, {before, after, options, viewport: kind === 'sheet' ? phone : {width: 1280, height: 900}, touch: kind === 'sheet'}, async page => {
            const toolbar = await page.evaluate(() => [...document.querySelectorAll('.nc-calendar-toolbar button')].map(node => `${Math.round(node.getBoundingClientRect().height)}/${getComputedStyle(node).boxSizing}`));
            const rootFits = await page.evaluate(() => { const node = document.querySelector('.nc-calendar'); return node.getBoundingClientRect().width <= node.parentElement.clientWidth + 0.5; });
            await cell(page).click({position: {x: 10, y: 10}}); await settle(page);
            const overlay = await page.evaluate(() => { const surface = document.querySelector('.nc-agenda-popover, .nc-sheet'), button = surface.querySelector('.nc-agenda-item .nc-button'), list = button.closest('ul');
                return {boxSizing: getComputedStyle(button).boxSizing, overflowX: surface.scrollWidth - surface.clientWidth, fits: button.getBoundingClientRect().right <= list.getBoundingClientRect().right + 0.5}; });
            assert.deepEqual(toolbar, ['44/border-box', '44/border-box', '44/border-box']); assert.equal(rootFits, true);
            assert.deepEqual(overlay, {boxSizing: 'border-box', overflowX: 0, fits: true});
        });
    }
    await scenario('QA-22: a 62.5% root font size does not shrink the popover; its widths follow the Calendar font size (em)', {before: 'html{font-size:62.5%} body{font-size:16px}', options: desktop}, async page => {
        await open(page);
        const state = await page.evaluate(() => { const popover = document.querySelector('.nc-agenda-popover'); return {width: Math.round(popover.getBoundingClientRect().width), font: getComputedStyle(popover).fontSize}; });
        assert.deepEqual(state, {width: 384, font: '16px'});
    });
} finally { await browser.close(); }
const paths = ['src/v02/calendar/modality.ts', 'src/v02/calendar/portal.ts', 'src/v02/calendar/CalendarMonth.tsx', 'src/v02/calendar/overlays.tsx', 'src/v02/calendar/focus.ts', 'src/v02/calendar/dom.ts',
    'src/v02/calendar/useCalendarController.ts', 'src/v02/primitives/NonModalPopover.tsx', 'src/v02/core/placement.ts', 'src/v02/primitives/ModalSheet.tsx', 'src/v02/primitives/PortalTheme.tsx', 'src/v02/styles.css', 'src/index.ts', 'src/Calendar.tsx',
    'scripts/implementation/overlay-entry.tsx', 'scripts/implementation/host-probe.mjs', 'package.json', 'package-lock.json', 'scripts/implementation/spikes/package-lock.json'];
const report = {capturedAt: new Date().toISOString(), outcome: !only && checks.every(c => c.outcome === 'pass') && !errors.length && !consoleErrors.length ? 'pass' : 'fail', filter: only ? String(only) : null,
    node: process.version, browser: version, react: 'bundled from the root lockfile, development build', checks, errors, consoleErrors,
    scope: 'QA-B package overlays in host pages through the public Calendar (development StrictMode, SSR + hydration): popover scrolling (QA-02), modal hosts with the default portal (QA-03), a host dialog from onItemPress above the sheet (QA-10), host fixed layers (QA-11), the Enter/Escape race (QA-20), anchoring and agenda scrolling (QA-21), host CSS resets and root font size (QA-22); spec v7 §10.3.4 modal-container rule (non-modal role=dialog/alertdialog panels and show() dialogs keep the body portal; aria-modal hosts are used), QA-B-1-05 popover side in a modal <dialog>, QA-B-1-03 non-modal host dialog above the sheet. Manual AT, Firefox/Safari and physical devices are out of scope.',
    // A run on an earlier tree (new scenarios on pre-fix code) records a file it does not have as missing.
    sourceHashes: Object.fromEntries(paths.map(path => [path, existsSync(resolve(root, path)) ? createHash('sha256').update(readFileSync(resolve(root, path))).digest('hex') : 'missing']))};
writeFileSync(resolve(output, 'browser.json'), JSON.stringify(report, null, 2) + '\n');
console.log(`Host: ${checks.filter(c => c.outcome === 'pass').length}/${checks.length}; ${errors.length} page errors; ${consoleErrors.length} console errors; ${output}`);
if (report.outcome === 'fail') process.exitCode = 1;
