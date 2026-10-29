import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtempSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {build} from 'vite';

// #10: the pending marker and the agenda pending label need real layout and forced colors, so they are checked in Chrome;
// the registry, the draft lifecycle and the announcements are covered by jsdom tests through CalendarMonth. One request
// also runs end to end through the internal controller seam (Chrome's crypto.randomUUID).
// node scripts/implementation/move-requests-probe.mjs [<output dir>]
const here = dirname(fileURLToPath(import.meta.url)), root = resolve(here, '../..');
const output = resolve(process.argv[2] ?? resolve(tmpdir(), 'calendar-move-requests'));
mkdirSync(output, {recursive: true});
const directory = mkdtempSync(resolve(tmpdir(), 'calendar-move-requests-'));
await build({configFile: false, logLevel: 'error', define: {'process.env.NODE_ENV': '"production"'},
    build: {outDir: directory, minify: true, lib: {entry: resolve(here, 'move-requests-entry.tsx'), formats: ['es'], fileName: () => 'index.mjs'}}});
const moduleUrl = 'data:text/javascript;base64,' + readFileSync(resolve(directory, 'index.mjs')).toString('base64');
const css = readFileSync(resolve(root, 'src/v02/styles.css'), 'utf8');
const {chromium} = await import('./spikes/node_modules/playwright/index.mjs');
const browser = await chromium.launch({channel: 'chrome', headless: true});
const checks = [], errors = [], version = browser.version();
// Development aid only: a filtered run is marked in the report and never counts as complete evidence.
const only = process.env.CALENDAR_PROBE_ONLY ? new RegExp(process.env.CALENDAR_PROBE_ONLY) : null;
const check = async (name, operation) => {
    if (only && !only.test(name)) return;
    try { const details = await operation(); checks.push({name, outcome: 'pass', ...(details ? {details} : {})}); }
    catch (error) { checks.push({name, outcome: 'fail', error: String(error)}); }
    writeFileSync(resolve(output, 'checks.json'), JSON.stringify(checks, null, 2) + '\n');
    console.log(`${checks.at(-1).outcome}: ${name}${checks.at(-1).error ? '\n' + checks.at(-1).error : ''}`);
};
const settle = page => page.evaluate(async () => { for (let i = 0; i < 6; i++) await new Promise(requestAnimationFrame); });
const patch = async (page, options) => { await page.evaluate(options => window.fixture.patch(options), options); await settle(page); };
async function setup(options = {}, viewport = {width: 1280, height: 900}, colorScheme = 'light') {
    const context = await browser.newContext({viewport, locale: 'en-US', colorScheme}), page = await context.newPage();
    page.setDefaultTimeout(4000); page.on('pageerror', error => errors.push(String(error)));
    await page.setContent('<style>body{margin:0;font:16px/1.4 system-ui;background:#f5f4f1}</style><div id="owner"></div>');
    await page.evaluate(async ({moduleUrl, css, options}) => {
        const style = document.createElement('style'); style.textContent = css; document.head.append(style);
        const module = await import(moduleUrl);
        window.fixture = module.mountMove(document.getElementById('owner'), options);
        // Every write to a live region: one entry per DOM mutation, clearing writes left out.
        window.live = [];
        new MutationObserver(records => { for (const record of records) {
            const host = record.target, text = [...record.addedNodes].map(node => node.textContent).join('');
            if (host.matches?.('[role=status],[role=alert]') && text) window.live.push(`${host.getAttribute('role') === 'alert' ? 'urgent' : 'polite'}: ${text}`);
        } }).observe(document.body, {childList: true, subtree: true});
    }, {moduleUrl, css, options});
    await settle(page); return {page, context};
}
/** Opens the desktop agenda popover of a date from the keyboard, as a user of the grid does. */
async function openAgenda(page, date = '2026-09-03') {
    await page.locator(`[role=gridcell][data-date="${date}"]`).focus(); await page.keyboard.press('Enter'); await settle(page);
}
/** Every marker with its box, the fill of its clock and the color of the item wrapper it sits in. */
const markers = page => page.evaluate(() => [...document.querySelectorAll('.nc-item-pending')].map(node => {
    const box = node.getBoundingClientRect(), wrapper = node.closest('[data-item-id]'), path = node.querySelector('path');
    return {item: wrapper.dataset.itemId, view: wrapper.dataset.view, pending: wrapper.dataset.pending, width: box.width, height: box.height,
        display: getComputedStyle(node).display, fill: getComputedStyle(path).fill, color: getComputedStyle(node.parentElement).color,
        fontSize: parseFloat(getComputedStyle(node).fontSize)};
}));
/** The computed value of system colors in this page, for comparing a forced fill. */
const systemColors = page => page.evaluate(() => Object.fromEntries(['ButtonText', 'CanvasText'].map(name => {
    const probe = document.createElement('span'); probe.style.color = name; document.body.append(probe);
    const value = getComputedStyle(probe).color; probe.remove(); return [name, value];
})));

try {
    await check('forced colors: every desktop segment and agenda row of a pending item keeps a 1em marker with a non-zero box and a system-color fill', async () => {
        const {page, context} = await setup({pending: ['bar', 'sync']});
        try {
            await page.emulateMedia({forcedColors: 'active'}); await openAgenda(page);
            const found = await markers(page), system = await systemColors(page);
            const segments = found.filter(marker => marker.view === 'month'), rows = found.filter(marker => marker.view === 'agenda');
            assert.deepEqual(segments.map(marker => marker.item).sort(), ['bar', 'bar', 'sync'], JSON.stringify(found));
            assert.deepEqual(rows.map(marker => marker.item).sort(), ['bar', 'sync']);
            for (const marker of found) {
                assert.ok(marker.width > 0 && marker.height > 0 && Math.abs(marker.width - marker.fontSize) < 0.5 && Math.abs(marker.height - marker.fontSize) < 0.5, JSON.stringify(marker));
                assert.ok(Object.values(system).includes(marker.fill), JSON.stringify({marker, system}));
                assert.equal(marker.pending, 'true');
            }
            assert.equal(await page.locator('[data-item-id="review"] .nc-item-pending').count(), 0);
            await page.screenshot({path: resolve(output, 'forced-colors.png')});
            return {markers: found, system};
        } finally { await context.close(); }
    });
    for (const themeName of ['classic', 'neutral']) for (const colorScheme of ['light', 'dark']) {
        await check(`${themeName} ${colorScheme}: the marker is drawn in the resolved item text color on the segment and the agenda row`, async () => {
            const {page, context} = await setup({pending: ['bar', 'sync'], themeName, colorScheme}, undefined, colorScheme);
            try {
                await openAgenda(page);
                const found = await markers(page);
                assert.equal(found.length, 5, JSON.stringify(found));
                for (const marker of found) assert.equal(marker.fill, marker.color, JSON.stringify(marker));
                await page.screenshot({path: resolve(output, `${themeName}-${colorScheme}.png`)});
                return {markers: found.map(({item, view, fill}) => ({item, view, fill}))};
            } finally { await context.close(); }
        });
    }
    await check('consumer item colors: the marker follows getItemAppearance textColor; no opacity, animation or extra border on the item', async () => {
        const {page, context} = await setup({pending: ['sync'], textColor: 'rgb(255, 230, 120)'});
        try {
            await openAgenda(page);
            const found = await markers(page);
            assert.equal(found.length, 2);
            for (const marker of found) assert.equal(marker.fill, 'rgb(255, 230, 120)', JSON.stringify(marker));
            const style = await page.evaluate(() => [...document.querySelectorAll('[data-item-id="sync"]')].map(node => {
                const own = getComputedStyle(node), marker = node.querySelector('.nc-item-pending'), icon = getComputedStyle(marker);
                return {opacity: own.opacity, animation: icon.animationName, border: getComputedStyle(node).borderTopWidth};
            }));
            const plain = await page.evaluate(() => [...document.querySelectorAll('[data-item-id="review"]')].map(node => getComputedStyle(node).borderTopWidth));
            for (const [index, entry] of style.entries()) { assert.equal(entry.opacity, '1'); assert.equal(entry.animation, 'none'); assert.equal(entry.border, plain[index]); }
            return {markers: found.map(({view, fill}) => ({view, fill}))};
        } finally { await context.close(); }
    });
    await check('a narrow chip: the title ellipsis gives way first, the marker stays whole inside its segment, also in RTL and below the time-hiding width', async () => {
        const result = {};
        for (const dir of ['ltr', 'rtl']) for (const width of [1280, 560]) {
            const {page, context} = await setup({pending: ['review'], only: ['review'], dir}, {width, height: 900});
            try {
                const state = await page.evaluate(() => {
                    const segment = document.querySelector('.nc-month-item[data-item-id="review"]'), marker = segment.querySelector('.nc-item-pending');
                    const title = segment.querySelector(':scope > bdi'), time = segment.querySelector('.nc-item-time');
                    const box = segment.getBoundingClientRect(), mark = marker.getBoundingClientRect(), text = title.getBoundingClientRect();
                    return {segment: [box.left, box.right], marker: [mark.left, mark.right, mark.width], title: [text.left, text.right],
                        truncated: title.scrollWidth > title.clientWidth, time: getComputedStyle(time).display, display: getComputedStyle(marker).display};
                });
                assert.ok(state.marker[2] > 0 && state.display !== 'none', JSON.stringify(state));
                assert.ok(state.marker[0] >= state.segment[0] - 0.5 && state.marker[1] <= state.segment[1] + 0.5, JSON.stringify(state));
                assert.ok(state.truncated, JSON.stringify(state));
                // The narrow layout is below the width where the chip's time disappears; the marker is not hidden with it.
                if (width === 560) assert.equal(state.time, 'none', JSON.stringify(state));
                // At the inline end: after the title in LTR, before it (to the left) in RTL.
                assert.ok(dir === 'ltr' ? state.marker[0] >= state.title[1] - 0.5 : state.marker[1] <= state.title[0] + 0.5, JSON.stringify(state));
                result[`${dir}-${width}`] = state;
                if (width === 560) await page.screenshot({path: resolve(output, `narrow-chip-${dir}.png`)});
            } finally { await context.close(); }
        }
        return result;
    });
    // Decision Q10 of #10 at 1280 px, on the default timed row (a short item with its date, times and source) in the 24em
    // popover: the label starts the details line, which may wrap while the item is pending (as at 390 px and in ru-RU), so
    // the row may grow by that line alone; nothing overflows horizontally and no other element of the row moves.
    for (const locale of ['en-US', 'ru-RU']) {
        await check(`1280 px, ${locale}: the label sits inside the details line, nothing overflows horizontally and no other element of the row moves`, async () => {
            const {page, context} = await setup({pending: [], actions: true, locale});
            try {
                await openAgenda(page);
                const measure = () => page.evaluate(() => {
                    const row = document.querySelector('li[data-item-id="sync"]'), origin = row.getBoundingClientRect(), popover = row.closest('.nc-agenda-popover');
                    const round = value => Math.round(value * 10) / 10, rect = node => { const box = node.getBoundingClientRect();
                        return [box.left - origin.left, box.top - origin.top, box.width, box.height].map(round); };
                    const details = row.querySelector('.nc-agenda-details'), label = details.querySelector('.nc-agenda-pending');
                    const inside = label ? (() => { const box = label.getBoundingClientRect(), line = details.getBoundingClientRect();
                        return box.left >= line.left - 0.5 && box.right <= line.right + 0.5 && box.top >= line.top - 0.5 && box.bottom <= line.bottom + 0.5; })() : null;
                    // The inline length of the details text over all its line boxes: what one line would need.
                    const walker = document.createTreeWalker(details, NodeFilter.SHOW_TEXT), range = document.createRange();
                    let length = 0;
                    for (let node = walker.nextNode(); node; node = walker.nextNode()) { range.selectNodeContents(node); for (const box of range.getClientRects()) length += box.width; }
                    return {row: round(origin.height), details: rect(details), length: round(length), text: details.textContent, label: label?.textContent ?? null,
                        first: !!label && details.firstElementChild === label, labelInside: inside, marker: !!row.querySelector('.nc-item-pending'),
                        title: rect(row.querySelector('.nc-agenda-title')), accent: rect(row.querySelector('.nc-item-accent')),
                        trigger: rect(row.querySelector('[data-agenda-control="actions"]')),
                        overflow: row.scrollWidth > row.clientWidth || popover.scrollWidth > popover.clientWidth, page: document.documentElement.scrollWidth > innerWidth};
                });
                const before = await measure();
                await patch(page, {pending: ['sync']});
                const after = await measure();
                const evidence = JSON.stringify({before, after});
                // The default summary: a time range and the source, then the label, the separator and the same text.
                assert.match(before.text, /\d:\d\d.*–.*\d:\d\d.* · Work$/); assert.equal(before.labelInside, null); assert.equal(before.marker, false);
                assert.ok(after.label, evidence); assert.equal(after.text, `${after.label} · ${before.text}`, evidence);
                assert.equal(after.first, true); assert.equal(after.labelInside, true, evidence); assert.equal(after.marker, true);
                assert.equal(after.overflow, false, evidence); assert.equal(after.page, false);
                // The title, the accent and the details line keep their start, and the actions trigger its whole box.
                assert.deepEqual([after.title.slice(0, 2), after.accent.slice(0, 2), after.details.slice(0, 2), after.trigger],
                    [before.title.slice(0, 2), before.accent.slice(0, 2), before.details.slice(0, 2), before.trigger], evidence);
                // Any change of the row's block size is the details line's alone.
                assert.ok(Math.abs(after.row - before.row - (after.details[3] - before.details[3])) < 0.5, evidence);
                await page.screenshot({path: resolve(output, `agenda-1280-${locale}.png`)});
                return {before, after, growth: Math.round((after.row - before.row) * 10) / 10};
            } finally { await context.close(); }
        });
    }
    for (const locale of ['en-US', 'ru-RU']) {
        await check(`390 px, ${locale}: the label sits inside the details line, nothing overflows horizontally and no other element of the row moves`, async () => {
            const {page, context} = await setup({pending: [], actions: true, layout: 'mobile', locale, agendaDate: '2026-09-03'}, {width: 390, height: 844});
            try {
                const measure = () => page.evaluate(() => {
                    return [...document.querySelectorAll('li[data-item-id]')].map(row => {
                        // Relative to the row: a row above that wraps moves this one, which is not a move inside it.
                        const origin = row.getBoundingClientRect(), rect = node => { const box = node.getBoundingClientRect();
                            return [box.left - origin.left, box.top - origin.top, box.width, box.height].map(value => Math.round(value * 10) / 10); };
                        const details = row.querySelector('.nc-agenda-details'), label = details.querySelector('.nc-agenda-pending');
                        const inside = label ? (() => { const box = label.getBoundingClientRect(), line = details.getBoundingClientRect();
                            return box.left >= line.left - 0.5 && box.right <= line.right + 0.5 && box.top >= line.top - 0.5 && box.bottom <= line.bottom + 0.5; })() : null;
                        return {id: row.dataset.itemId, title: rect(row.querySelector('.nc-agenda-title')), accent: rect(row.querySelector('.nc-item-accent')),
                            trigger: rect(row.querySelector('[data-agenda-control="actions"]')), labelInside: inside, overflow: row.scrollWidth > row.clientWidth,
                            height: Math.round(origin.height * 10) / 10};
                    }).concat([{page: document.documentElement.scrollWidth > innerWidth}]);
                });
                const before = await measure();
                await patch(page, {pending: ['bar', 'sync', 'review']});
                const after = await measure();
                assert.equal(after.at(-1).page, false, JSON.stringify(after.at(-1)));
                for (const [index, row] of after.slice(0, -1).entries()) {
                    const previous = before[index];
                    assert.equal(row.labelInside, true, JSON.stringify(row)); assert.equal(row.overflow, false, JSON.stringify(row));
                    // The title and the accent keep their start (the marker at the inline end only narrows the content block), and the
                    // actions trigger keeps its whole box.
                    assert.deepEqual([row.title.slice(0, 2), row.accent.slice(0, 2), row.trigger], [previous.title.slice(0, 2), previous.accent.slice(0, 2), previous.trigger],
                        JSON.stringify({row, previous}));
                }
                await page.screenshot({path: resolve(output, `agenda-390-${locale}.png`), fullPage: true});
                return {before, after};
            } finally { await context.close(); }
        });
    }
    await check('one request end to end in Chrome: a crypto.randomUUID v4 ID, request then null, the pending marker and each result spoken once', async () => {
        const {page, context} = await setup({});
        try {
            const id = await page.evaluate(() => window.fixture.submit('sync', '2026-09-10'));
            await settle(page);
            assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
            const events = await page.evaluate(() => window.fixture.events.filter(event => event.type !== 'navigate'));
            assert.deepEqual(events.map(event => event.type), ['draft', 'request', 'draft']);
            assert.deepEqual(events.map(event => event.type === 'request' ? event.value.input : event.value), ['sync', 'pointer', null]);
            assert.equal(events[1].value.requestId, id);
            await page.evaluate(id => window.fixture.publish([{requestId: id, itemId: 'sync', status: 'pending'}]), id); await settle(page);
            assert.equal(await page.locator('.nc-month-item[data-item-id="sync"][data-pending="true"] .nc-item-pending').count(), 1);
            await page.evaluate(id => window.fixture.publish([{requestId: id, itemId: 'sync', status: 'succeeded'}]), id); await settle(page);
            await page.evaluate(id => window.fixture.publish([{requestId: id, itemId: 'sync', status: 'succeeded'}]), id); await settle(page);
            assert.deepEqual(await page.evaluate(() => window.live.splice(0)), ['polite: Move of Team sync is pending', 'polite: Team sync moved']);
            assert.equal(await page.locator('.nc-item-pending').count(), 0);
            return {id, events};
        } finally { await context.close(); }
    });
} finally { await browser.close(); }
const paths = ['src/v02/core/moveRequests.ts', 'src/v02/calendar/useMoveRequests.ts', 'src/v02/calendar/MonthView.tsx', 'src/v02/calendar/DayAgendaBody.tsx',
    'src/v02/calendar/slots.tsx', 'src/v02/primitives/content.tsx', 'src/v02/styles.css', 'scripts/implementation/move-requests-entry.tsx', 'scripts/implementation/move-requests-probe.mjs'];
const report = {capturedAt: new Date().toISOString(), outcome: !only && checks.every(entry => entry.outcome === 'pass') && !errors.length ? 'pass' : 'fail', filter: only ? String(only) : null,
    node: process.version, browser: version, checks, errors,
    scope: '#10 in Chrome: the pending marker on desktop month segments and agenda rows under forced-colors emulation (box and system-color fill), both themes in light and dark, consumer item colors, a narrow chip in LTR and RTL, the agenda pending label on the default timed row at 1280 px in the 24em popover, in en-US and ru-RU (inside the details line, which may wrap while pending; no overflow, no other element moved; the row growth is recorded) and at 390 px in en-US and ru-RU (inside the details line, no overflow, no other element moved), and one request through the internal controller seam. Screenshots go to the output directory only. Not AT qualification.',
    sourceHashes: Object.fromEntries(paths.map(path => [path, createHash('sha256').update(readFileSync(resolve(root, path))).digest('hex')]))};
writeFileSync(resolve(output, 'browser.json'), JSON.stringify(report, null, 2) + '\n');
console.log(`Move requests: ${checks.filter(entry => entry.outcome === 'pass').length}/${checks.length}; ${errors.length} page errors; ${output}`);
if (report.outcome === 'fail') process.exitCode = 1;
