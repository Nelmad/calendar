import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdirSync, mkdtempSync, readFileSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {build} from 'vite';

// Review 2026-10-09-2 real-Chrome probe: focus kept after an outside press or tap (round 2), the revealed inline agenda heading, overlays of a
// hidden or suspended owner, a host modal without aria-modal above the sheet and its scroll lock, focus rings in action lists,
// popover Tab and outside press rules, Tab exit inside a modal <dialog>, <html> as portal container and date text direction.
// Usage: node scripts/implementation/review2-probe.mjs <outputDir>   (CALENDAR_PROBE_ONLY=<regexp> marks a partial run)
const here = dirname(fileURLToPath(import.meta.url)), root = resolve(here, '../..');
const output = resolve(process.argv[2] ?? mkdtempSync(resolve(tmpdir(), 'calendar-review2-')));
mkdirSync(output, {recursive: true});
const directory = mkdtempSync(resolve(tmpdir(), 'calendar-review2-build-'));
await build({configFile: false, logLevel: 'error', define: {'process.env.NODE_ENV': '"development"'}, mode: 'development',
    build: {outDir: directory, minify: false, lib: {entry: resolve(here, 'review2-entry.tsx'), formats: ['es'], fileName: () => 'index.mjs'}}});
const moduleUrl = 'data:text/javascript;base64,' + readFileSync(resolve(directory, 'index.mjs')).toString('base64');
const css = readFileSync(resolve(root, 'src/v02/styles.css'), 'utf8');
const {chromium} = await import('./spikes/node_modules/playwright/index.mjs');
const browser = await chromium.launch({channel: 'chrome', headless: true});
const checks = [], errors = [], consoleErrors = [], expectedConsole = [], version = browser.version();
const only = process.env.CALENDAR_PROBE_ONLY ? new RegExp(process.env.CALENDAR_PROBE_ONLY) : null;
const check = async (name, operation) => {
    if (only && !only.test(name)) return;
    try { const details = await operation(); checks.push({name, outcome: 'pass', ...(details ? {details} : {})}); }
    catch (error) { checks.push({name, outcome: 'fail', error: String(error?.stack ?? error)}); }
    writeFileSync(resolve(output, 'checks.json'), JSON.stringify(checks, null, 2) + '\n');
    console.log(`${checks.at(-1).outcome}: ${name}${checks.at(-1).error ? '\n' + checks.at(-1).error : ''}`);
};
const settle = (page, frames = 6) => page.evaluate(async frames => { for (let i = 0; i < frames; i++) await new Promise(requestAnimationFrame); }, frames);
const items = [{id: 'a', title: 'Alpha', data: {}, interval: {kind: 'timed', start: '2026-03-04T09:00:00Z', end: '2026-03-04T09:30:00Z'}},
    {id: 'b', title: 'Beta', data: {}, interval: {kind: 'timed', start: '2026-03-04T10:00:00Z', end: '2026-03-04T10:30:00Z'}},
    {id: 'c', title: 'Gamma', data: {}, interval: {kind: 'timed', start: '2026-03-25T10:00:00Z'}}];
const base = {items, anchorDate: '2026-03-01', today: '2026-03-04', timeZone: 'UTC', locale: 'en-US'};
/**
 * `kind`: mount | mountHost | mountSuspense. `script` runs in the page before mounting and may adjust `window.props`
 * (functions and DOM nodes cannot cross the protocol boundary).
 */
async function setup({props = {}, kind = 'mount', viewport = {width: 1300, height: 900}, html = '<button id="outside">Outside</button><p id="blank">Blank page area</p><div id="owner"></div>', owner = '#owner', script = '',
    expected = null, touch = false} = {}) {
    // `touch`: a touch phone context; a tap moves focus at the compatibility mousedown, after pointerup and touchend.
    const context = await browser.newContext({viewport, ...(touch ? {hasTouch: true, isMobile: true} : {})}), page = await context.newPage();
    page.setDefaultTimeout(4000);
    page.on('pageerror', error => errors.push(String(error)));
    // `expected`: a console error the scenario provokes on purpose (React's own warning), kept apart and never ignored elsewhere.
    page.on('console', message => { if (message.type() === 'error') (expected?.test(message.text()) ? expectedConsole : consoleErrors).push(message.text().slice(0, 300)); });
    await page.setContent(`<!doctype html><html><head><style>body{margin:0;font:16px/1.4 system-ui;background:#f5f4f1}#outside{margin:8px}</style><style>${css}</style></head><body>${html}</body></html>`);
    await page.evaluate(async ({moduleUrl, props, kind, owner, script}) => {
        const module = await import(moduleUrl);
        window.props = {...props, onNavigate() {}, ...(props.withPress === false ? {} : {onItemPress() {}})};
        delete window.props.withPress;
        if (props.actions) { delete window.props.actions; Object.assign(window.props, {getItemActions: () => [{id: 'edit', label: 'Edit'}, {id: 'share', label: 'Share'}], onItemActionRequest() {}}); }
        if (props.sources) Object.assign(window.props, {onVisibleSourceIdsChange() {}});
        await (new Function('return (async () => {' + script + '})()'))();
        window.active = () => { let node = document.activeElement; while (node?.shadowRoot?.activeElement) node = node.shadowRoot.activeElement; return node; };
        window.info = () => { const node = window.active(); return {tag: node?.tagName, id: node?.id || undefined, date: node?.dataset?.date, close: !!node?.hasAttribute?.('data-agenda-close'),
            control: node?.dataset?.agendaControl, item: node?.closest?.('[data-item-id]')?.dataset.itemId, inPopover: !!node?.closest?.('.nc-positioned-popover'), text: node?.textContent?.slice(0, 40)}; };
        window.cal = module[kind](document.querySelector(owner), window.props);
    }, {moduleUrl, props: {...base, ...props}, kind, owner, script});
    await settle(page);
    return {page, context};
}
async function scenario(name, config, body) {
    await check(name, async () => {
        const fixture = await setup(config);
        try { return await body(fixture.page, fixture); } finally { await fixture.context.close(); }
    });
}
const info = page => page.evaluate(() => window.info());
const cell = (page, date) => page.locator(`[role=gridcell][data-date="${date}"]`);
const openByKeyboard = async (page, date = '2026-03-04') => { await cell(page, date).focus(); await page.keyboard.press('Enter'); await settle(page); };
const patch = async (page, props) => { await page.evaluate(props => window.cal.patch(props), props); await settle(page); };

try {
    // §12.3/§5.1.1: recovery is for focus displaced by a removal, not for focus the user moved out of the Calendar.
    await scenario('§12.3 mobile: after an outside press moved focus to body, an update that removes the focused inline row leaves focus on body (review 2026-10-09-2)',
        {props: {layout: 'mobile'}, viewport: {width: 420, height: 900}}, async page => {
            await page.locator('[data-presentation=inline] [data-item-id="a"] [data-agenda-control="primary"]').focus();
            await page.click('#blank'); await settle(page);
            assert.equal((await info(page)).tag, 'BODY');
            const scroll = await page.evaluate(() => scrollY);
            await patch(page, {items: []});
            const after = await info(page);
            assert.equal(after.tag, 'BODY', `focus moved to ${JSON.stringify(after)}`); assert.equal(await page.evaluate(() => scrollY), scroll);
            return after;
        });
    for (const [status, label] of [['loading', 'Loading calendar'], ['error', 'Could not load calendar']]) {
        await scenario(`§12.3 desktop: after an outside press, a later initial ${status} does not focus the "${label}" region (review 2026-10-09-2)`, {props: {layout: 'desktop'}}, async page => {
            await page.getByRole('button', {name: 'Next month'}).focus();
            await page.click('#blank'); await settle(page);
            await patch(page, {dataState: status === 'loading' ? {status, phase: 'initial'} : {status, phase: 'initial', error: 'Failure'}});
            assert.equal(await page.getByRole('region', {name: label}).count(), 1);
            const after = await info(page);
            assert.equal(after.tag, 'BODY', `focus moved to ${JSON.stringify(after)}`);
            return after;
        });
    }
    // Round 2: the same with a tap. Focus moves at the compatibility mousedown after pointerup; only the click sees body.
    await scenario('§12.3 mobile touch: after a tap on the page moved focus to body, an update that removes the focused inline row leaves focus on body (review 2026-10-09-2, round 2)',
        {props: {layout: 'mobile'}, viewport: {width: 420, height: 900}, touch: true}, async page => {
            await page.locator('[data-presentation=inline] [data-item-id="a"] [data-agenda-control="primary"]').focus();
            await page.evaluate(() => { window.trace = []; for (const type of ['pointerup', 'mousedown', 'click']) document.addEventListener(type, () => window.trace.push(`${type}:${document.activeElement === document.body ? 'body' : 'calendar'}`), true); });
            await page.tap('#blank'); await settle(page);
            const trace = await page.evaluate(() => window.trace);
            // The tap really is the touch order: focus is still in the Calendar at pointerup.
            assert.deepEqual(trace, ['pointerup:calendar', 'mousedown:calendar', 'click:body']);
            assert.equal((await info(page)).tag, 'BODY');
            await patch(page, {items: []});
            const after = await info(page);
            assert.equal(after.tag, 'BODY', `focus moved to ${JSON.stringify(after)}`);
            return {trace, after};
        });
    for (const [status, label] of [['loading', 'Loading calendar'], ['error', 'Could not load calendar']]) {
        await scenario(`§12.3 desktop touch: after a tap on the page, a later initial ${status} does not focus the "${label}" region (review 2026-10-09-2, round 2)`, {props: {layout: 'desktop'}, touch: true}, async page => {
            await page.getByRole('button', {name: 'Next month'}).focus();
            await page.tap('#blank'); await settle(page);
            assert.equal((await info(page)).tag, 'BODY');
            await patch(page, {dataState: status === 'loading' ? {status, phase: 'initial'} : {status, phase: 'initial', error: 'Failure'}});
            assert.equal(await page.getByRole('region', {name: label}).count(), 1);
            const after = await info(page);
            assert.equal(after.tag, 'BODY', `focus moved to ${JSON.stringify(after)}`);
            return after;
        });
    }
    await scenario('§12.3 mobile touch control: after a tap on the focused inline row, its removal recovers focus inside the Calendar (review 2026-10-09-2, round 2)',
        {props: {layout: 'mobile'}, viewport: {width: 420, height: 900}, touch: true}, async page => {
            const row = page.locator('[data-presentation=inline] [data-item-id="a"] [data-agenda-control="primary"]');
            await row.focus(); await row.tap(); await settle(page);
            assert.equal((await info(page)).item, 'a');
            await patch(page, {items: []});
            const after = await page.evaluate(() => ({inCalendar: !!window.active()?.closest('.nc-calendar'), ...window.info()}));
            assert.equal(after.inCalendar, true, `focus moved to ${JSON.stringify(after)}`);
            return after;
        });
    await scenario('§12.3 control: a removed control that still had focus recovers to the status region', {props: {layout: 'desktop'}}, async page => {
        await cell(page, '2026-03-11').focus(); await settle(page);
        await patch(page, {dataState: {status: 'loading', phase: 'initial'}});
        assert.deepEqual(await page.evaluate(() => [window.active().classList.contains('nc-calendar-status'), window.active().textContent]), [true, 'Loading calendar']);
    });

    // §12.2/§12.5: the inline agenda below the grid; Enter moves focus to its heading, which must be visible.
    await scenario('§12.5 mobile: Enter on a date below the fold reveals the focused inline agenda heading (review 2026-10-09-2)',
        {props: {layout: 'mobile'}, viewport: {width: 390, height: 500}, html: '<div style="height:150px">Host header</div><div id="owner"></div><div style="height:800px">Host footer</div>'}, async page => {
            await cell(page, '2026-03-25').focus(); await settle(page);
            await page.keyboard.press('Enter'); await settle(page, 10);
            const box = await page.evaluate(() => { const node = window.active(), rect = node.getBoundingClientRect(); return {tag: node.tagName, top: rect.top, bottom: rect.bottom, innerHeight, scrollY}; });
            assert.equal(box.tag, 'H3'); assert.ok(box.top >= 0 && box.bottom <= box.innerHeight, `heading at ${box.top}…${box.bottom} of ${box.innerHeight}`);
            await page.screenshot({path: resolve(output, 'mobile-inline-heading-revealed.png')});
            return box;
        });

    // §12.2: the desktop agenda stays anchored to its cell; an owner without a layout box hides it like a scrolled-away anchor.
    await scenario('§12.2 desktop: a popover whose host panel becomes hidden is clipped away, and returns with the panel (review 2026-10-09-2)',
        {html: '<div id="panel"><div id="owner"></div></div>'}, async page => {
            await openByKeyboard(page, '2026-03-05');
            const state = () => page.evaluate(() => { const node = document.querySelector('.nc-positioned-popover'), rect = node?.getBoundingClientRect();
                return node && {top: Math.round(rect.top), left: Math.round(rect.left), clip: node.style.clipPath, visible: getComputedStyle(node).visibility, focusInside: node.contains(window.active())}; });
            const before = await state();
            assert.equal(before.clip, ''); assert.equal(before.focusInside, true);
            await page.evaluate(() => { document.getElementById('panel').hidden = true; }); await settle(page);
            const hidden = await state();
            assert.equal(hidden.clip, 'inset(50%)', `hidden: ${JSON.stringify(hidden)}`);
            await page.evaluate(() => { document.getElementById('panel').hidden = false; }); await settle(page);
            const shown = await state();
            assert.equal(shown.clip, ''); assert.deepEqual([shown.top, shown.left], [before.top, before.left]);
            return {before, hidden, shown};
        });
    await scenario('§12.2 Suspense: a sheet of a suspended Calendar is not shown without its modal effects and returns with them (review 2026-10-09-2)',
        {kind: 'mountSuspense', props: {layout: 'mobile', agendaPresentation: 'overlay'}, viewport: {width: 400, height: 900}}, async page => {
            await openByKeyboard(page);
            const read = () => page.evaluate(() => ({shownModal: [...document.querySelectorAll('[aria-modal="true"]')].filter(node => node.getClientRects().length).length,
                outsideInert: document.getElementById('outside').inert, overflow: document.documentElement.style.overflow,
                calendarRendered: document.querySelector('.nc-calendar')?.getClientRects().length > 0, fallback: !!document.getElementById('fallback'),
                focusInSheet: !!window.active()?.closest('.nc-sheet')}));
            const before = await read();
            assert.deepEqual([before.shownModal, before.outsideInert, before.overflow, before.focusInSheet], [1, true, 'hidden', true]);
            await page.evaluate(() => window.cal.suspend()); await settle(page);
            const during = await read();
            assert.deepEqual([during.calendarRendered, during.fallback, during.shownModal, during.outsideInert, during.overflow], [false, true, 0, false, '']);
            await page.evaluate(() => window.cal.resume()); await settle(page, 10);
            const after = await read();
            assert.deepEqual([after.calendarRendered, after.shownModal, after.outsideInert, after.overflow, after.focusInSheet], [true, 1, true, 'hidden', true]);
            await page.keyboard.press('Escape'); await settle(page);
            assert.deepEqual(await page.evaluate(() => [document.querySelectorAll('.nc-backdrop').length, document.documentElement.style.overflow, window.active()?.dataset.date]), [0, '', '2026-03-04']);
            return {before, during, after};
        });
    await scenario('§12.2 Suspense: a desktop popover of a suspended Calendar is clipped away and returns (review 2026-10-09-2)',
        {kind: 'mountSuspense', props: {layout: 'desktop'}}, async page => {
            await openByKeyboard(page);
            const clip = () => page.evaluate(() => document.querySelector('.nc-positioned-popover')?.style.clipPath);
            assert.equal(await clip(), '');
            await page.evaluate(() => window.cal.suspend()); await settle(page);
            assert.equal(await clip(), 'inset(50%)');
            await page.evaluate(() => window.cal.resume()); await settle(page, 10);
            assert.equal(await clip(), '');
        });

    // §8/§12.2: a host modal from onItemPress without aria-modal (React Aria Components) is the top layer above the sheet.
    await scenario('§8 a React Aria Components modal opened from onItemPress above the sheet owns focus and Escape; the sheet resumes (review 2026-10-09-2)',
        {kind: 'mountHost', props: {layout: 'mobile', agendaPresentation: 'overlay'}, viewport: {width: 400, height: 800}}, async page => {
            await openByKeyboard(page);
            await page.locator('.nc-sheet [data-item-id="a"] [data-agenda-control="primary"]').focus(); await page.keyboard.press('Enter'); await settle(page, 10);
            const state = await page.evaluate(() => { const dialog = document.getElementById('host-dialog'); let inert = null;
                for (let node = dialog; node; node = node.parentElement) if (node.inert || node.getAttribute('aria-hidden') === 'true') { inert = node.className; break; }
                return {dialog: !!dialog, ariaModal: dialog?.getAttribute('aria-modal'), inert, yielded: document.querySelector('.nc-sheet-backdrop')?.hasAttribute('data-yielded'),
                    hit: document.elementFromPoint(...(r => [r.x + 5, r.y + 5])(document.getElementById('host-input').getBoundingClientRect()))?.id}; });
            assert.deepEqual(state, {dialog: true, ariaModal: null, inert: null, yielded: true, hit: 'host-input'});
            await page.locator('#host-input').focus(); await page.keyboard.type('note');
            assert.equal(await page.inputValue('#host-input'), 'note');
            const trail = [];
            for (const key of ['Tab', 'Tab', 'Tab']) { await page.keyboard.press(key); await settle(page); trail.push(await page.evaluate(() => !!window.active()?.closest('#host-dialog'))); }
            assert.deepEqual(trail, [true, true, true], 'Tab stays in the host dialog');
            await page.keyboard.press('Escape'); await settle(page, 10);
            const after = await page.evaluate(() => ({host: !!document.getElementById('host-dialog'), sheet: document.querySelectorAll('.nc-day-list[role=dialog]').length,
                focusInSheet: !!window.active()?.closest('.nc-sheet'), tag: window.active()?.tagName, overflow: document.documentElement.style.overflow}));
            assert.deepEqual(after, {host: false, sheet: 1, focusInSheet: true, tag: after.tag, overflow: 'hidden'});
            await page.keyboard.press('Escape'); await settle(page);
            const closed = await page.evaluate(() => ({sheet: document.querySelectorAll('.nc-day-list[role=dialog]').length, date: window.active()?.dataset.date, overflow: document.documentElement.style.overflow,
                inert: document.querySelectorAll('[inert]').length}));
            assert.deepEqual(closed, {sheet: 0, date: '2026-03-04', overflow: '', inert: 0});
            return {state, after, closed};
        });
    // Round 2: the host focuses its dialog in the commit that opens it, before it makes the sheet inert. Nothing may pull focus
    // back into the sheet: React Aria's own late refocus must not be needed (focus is checked without any explicit focus()).
    for (const [presentation, props, viewport] of [['sheet', {layout: 'mobile', agendaPresentation: 'overlay'}, {width: 400, height: 800}], ['desktop popover', {layout: 'desktop'}, undefined]]) {
        await scenario(`§8 a React Aria Components modal opened from onItemPress above the ${presentation} has focus as soon as it opens and focus never returns below it (review 2026-10-09-2, round 2)`,
            {kind: 'mountHost', props, ...(viewport ? {viewport} : {})}, async page => {
                await openByKeyboard(page);
                await page.locator('.nc-day-list [data-item-id="a"] [data-agenda-control="primary"]').focus();
                await page.evaluate(() => { window.trail = []; document.addEventListener('focusin', event => window.trail.push(event.composedPath()[0].closest?.('#host-dialog') ? 'host' : event.composedPath()[0].closest?.('.nc-day-list') ? 'agenda' : 'other'), true); });
                // The first read after the key press: before any frame-based or timed refocus of the host (React Aria's is 500 ms).
                await page.keyboard.press('Enter');
                const immediate = await page.evaluate(() => ({inHost: !!window.active()?.closest('#host-dialog'), tag: window.active()?.tagName}));
                await settle(page, 6);
                await page.waitForTimeout(700);
                const settled = {inHost: await page.evaluate(() => !!window.active()?.closest('#host-dialog')), trail: await page.evaluate(() => window.trail)};
                assert.equal(await page.locator('#host-dialog').count(), 1);
                assert.deepEqual([immediate.inHost, settled.inHost], [true, true], JSON.stringify({immediate, settled}));
                assert.deepEqual(settled.trail, ['host'], `focus trail ${JSON.stringify(settled.trail)}`);
                await page.keyboard.press('Escape'); await settle(page, 10);
                assert.equal(await page.locator('#host-dialog').count(), 0);
                return {immediate, settled};
            });
    }
    await scenario('§12.2 a sheet that closes under the open React Aria Components modal keeps the page locked and in the background until the modal closes (review 2026-10-09-2)',
        {kind: 'mountHost', props: {layout: 'mobile', agendaPresentation: 'overlay'}, viewport: {width: 400, height: 800}}, async page => {
            await openByKeyboard(page);
            await page.locator('.nc-sheet [data-item-id="a"] [data-agenda-control="primary"]').focus(); await page.keyboard.press('Enter'); await settle(page, 10);
            await patch(page, {dataState: {status: 'loading', phase: 'initial'}}); await settle(page);
            const read = () => page.evaluate(() => ({host: !!document.getElementById('host-dialog'), sheet: document.querySelectorAll('.nc-backdrop').length, overflow: document.documentElement.style.overflow,
                calendarHidden: !!document.querySelector('.nc-calendar')?.closest('[inert], [aria-hidden="true"]'), outsideHidden: !!document.getElementById('outside').closest('[inert], [aria-hidden="true"]')}));
            const during = await read();
            assert.deepEqual(during, {host: true, sheet: 0, overflow: 'hidden', calendarHidden: true, outsideHidden: true});
            await page.click('#host-close'); await settle(page, 10);
            const after = await read();
            assert.deepEqual(after, {host: false, sheet: 0, overflow: '', calendarHidden: false, outsideHidden: false});
            return {during, after};
        });

    // §12.5: the 2px ring with its 2px offset is fully inside the scroll container of action and source sheets.
    for (const [label, props, open, control] of [
        ['item action sheet', {layout: 'mobile', actions: true}, '[data-presentation=inline] [data-item-id="a"] [data-agenda-control="actions"]', '.nc-action-list > .nc-button'],
        ['source sheet', {layout: 'mobile', sources: [{id: 'work', title: 'Work'}, {id: 'home', title: 'Home'}], visibleSourceIds: ['work', 'home']}, '[data-source-selector]', '.nc-action-list > .nc-checkbox'],
    ]) {
        await scenario(`§12.5 mobile ${label}: the focus ring of its first control is not clipped by the list (review 2026-10-09-2)`, {props, viewport: {width: 400, height: 800}}, async page => {
            await page.locator(open).first().focus(); await page.keyboard.press('Enter'); await settle(page, 10);
            const geometry = await page.evaluate(selector => {
                const list = document.querySelector('.nc-action-list'), first = list.querySelector(selector), box = list.getBoundingClientRect(), rect = first.getBoundingClientRect();
                const style = getComputedStyle(first), extent = Number.parseFloat(style.outlineWidth) + Number.parseFloat(style.outlineOffset);
                const port = {top: box.top + list.clientTop, left: box.left + list.clientLeft}; port.bottom = port.top + list.clientHeight; port.right = port.left + list.clientWidth;
                return {focusVisible: first.matches('[data-focus-visible]') || first.contains(window.active()) && first.matches(':has([data-focus-visible]), [data-focus-visible]'), outline: style.outlineStyle, extent,
                    ring: {top: rect.top - extent, left: rect.left - extent, bottom: rect.bottom + extent, right: rect.right + extent}, port};
            }, control);
            assert.equal(geometry.outline, 'solid'); assert.ok(geometry.extent >= 4, `ring extent ${geometry.extent}`);
            for (const side of ['top', 'left']) assert.ok(geometry.ring[side] >= geometry.port[side] - 0.5, `${side}: ${JSON.stringify(geometry)}`);
            for (const side of ['bottom', 'right']) assert.ok(geometry.ring[side] <= geometry.port[side] + 0.5, `${side}: ${JSON.stringify(geometry)}`);
            await page.screenshot({path: resolve(output, `mobile-${label.replace(/ /g, '-')}-focus-ring.png`)});
            return geometry;
        });
    }

    // §8/§12.2: Tab inside the popover walks its controls and exits only past the last one.
    for (const target of ['.nc-day-list-count', '.nc-day-list h3']) {
        await scenario(`§8 desktop popover: after a click on ${target}, Tab reaches its first control and keeps it open (review 2026-10-09-2)`, {props: {layout: 'desktop'}}, async page => {
            await cell(page, '2026-03-04').click({position: {x: 6, y: 6}}); await settle(page);
            assert.equal(await page.locator('.nc-positioned-popover').count(), 1);
            await page.click(`.nc-positioned-popover ${target}`); await settle(page);
            assert.equal((await info(page)).inPopover, true, 'the press focused the popover container or heading');
            await page.keyboard.press('Tab'); await settle(page);
            const state = {...await info(page), open: await page.locator('.nc-positioned-popover').count()};
            assert.deepEqual([state.close, state.inPopover, state.open], [true, true, 1], JSON.stringify(state));
            return state;
        });
    }
    // The page outside an open modal <dialog> is inert by its modal state alone: a Tab exit never targets it. With a control after
    // the Calendar in the dialog, focus moves there; with the Calendar last, the trigger is the UA's starting point (the UA
    // then leaves the document, which headless Chrome reports as body), never a failed focus on the inert page.
    for (const [variant, after] of [['a control after the Calendar', '<button id="dlg-last">Dialog last</button>'], ['the Calendar last', '']]) {
        await scenario(`§12.2 desktop popover in a modal <dialog>, ${variant}: Tab from its last control never targets the inert page (review 2026-10-09-2)`,
            {props: {layout: 'desktop'}, html: `<button id="page-before">Page before</button><dialog id="host"><button id="dlg-first">Dialog first</button><div id="owner"></div>${after}</dialog><button id="page-after">Page after</button>`,
                script: "document.getElementById('host').showModal(); window.trail = []; document.addEventListener('focusin', event => window.trail.push(event.target.id || event.target.dataset?.date || event.target.tagName), true);"}, async page => {
                await openByKeyboard(page);
                await page.evaluate(() => { [...document.querySelectorAll('.nc-positioned-popover button')].at(-1).focus(); window.trail.length = 0; });
                await page.keyboard.press('Tab'); await settle(page);
                const state = {...await info(page), open: await page.locator('.nc-positioned-popover').count(), trail: await page.evaluate(() => window.trail)};
                assert.equal(state.open, 0); assert.ok(!state.trail.includes('page-after'));
                if (after) assert.deepEqual([state.id, state.trail], ['dlg-last', ['dlg-last']]);
                else assert.equal(state.trail[0], '2026-03-04', `trail ${JSON.stringify(state.trail)}`);
                return state;
            });
    }

    // §12.2 closing by outside press: only a primary press that starts and ends outside, as for the sheet backdrop.
    await scenario('§12.2 desktop popover: a drag released outside and a secondary-button press keep it open; a primary press outside closes it (review 2026-10-09-2)',
        {props: {layout: 'desktop'}}, async page => {
            await openByKeyboard(page);
            // Non-focusable page content: neither press moves focus to another control (that alone closes the popover, §12.2).
            const heading = await page.locator('.nc-positioned-popover h3').boundingBox(), outside = await page.locator('#blank').boundingBox();
            await page.mouse.move(heading.x + 4, heading.y + heading.height / 2); await page.mouse.down();
            await page.mouse.move(outside.x + 5, outside.y + 5, {steps: 5}); await page.mouse.up(); await settle(page);
            const afterDrag = await page.locator('.nc-positioned-popover').count();
            await page.mouse.click(outside.x + 5, outside.y + 5, {button: 'right'}); await settle(page);
            const afterRight = await page.locator('.nc-positioned-popover').count();
            await page.mouse.click(outside.x + 5, outside.y + 5); await settle(page);
            const afterPrimary = await page.locator('.nc-positioned-popover').count();
            assert.deepEqual([afterDrag, afterRight, afterPrimary], [1, 1, 0]);
            return {afterDrag, afterRight, afterPrimary};
        });

    await scenario('§12.2 mobile sheet portaled into <html>: the body is its inert background (review 2026-10-09-2)',
        // React warns in development that a <div> under <html> is invalid nesting; the container is still accepted (§10.3.4).
        {props: {layout: 'mobile', agendaPresentation: 'overlay'}, viewport: {width: 400, height: 800}, script: 'window.props.portalContainer = document.documentElement;',
            expected: /^Warning: validateDOMNesting\(\.\.\.\): %s cannot appear as a child of <%s>\.%s%s%s <div> html/}, async page => {
            await openByKeyboard(page);
            const open = await page.evaluate(() => ({parent: document.querySelector('.nc-backdrop')?.parentElement?.tagName, bodyInert: document.body.inert, overflow: document.documentElement.style.overflow}));
            assert.deepEqual(open, {parent: 'HTML', bodyInert: true, overflow: 'hidden'});
            await page.keyboard.press('Escape'); await settle(page);
            const closed = await page.evaluate(() => ({backdrops: document.querySelectorAll('.nc-backdrop').length, bodyInert: document.body.inert, date: window.active()?.dataset.date}));
            assert.deepEqual(closed, {backdrops: 0, bodyInert: false, date: '2026-03-04'});
            return {open, closed};
        });

    // §11.2: `dir` is the layout direction; date and time text keeps its own script's direction.
    for (const [locale, dir] of [['ru-RU', 'rtl'], ['en-GB', 'rtl'], ['ar', 'ltr']]) {
        await scenario(`§11.2 ${locale} with dir="${dir}": dates and times keep the direction of the locale's script (review 2026-10-09-2)`,
            {props: {layout: 'desktop', locale, dir, anchorDate: '2026-09-01', today: '2026-09-01', items: [{id: 'a', title: 'Alpha', data: {}, interval: {kind: 'timed', start: '2026-09-01T10:30:00Z', end: '2026-09-01T11:30:00Z'}}]}}, async page => {
                await openByKeyboard(page, '2026-09-01');
                const result = await page.evaluate(locale => {
                    // Leaf date/time fragments of the agenda heading and rows.
                    const expected = locale === 'ar' ? 'rtl' : 'ltr', nodes = [...document.querySelectorAll(`.nc-day-list [lang="${locale}"]`)]
                        .filter(node => !node.children.length && node.firstChild?.nodeType === 3 && /\d/u.test(node.textContent));
                    // Visual order of the first and last character of each LTR date fragment.
                    const order = nodes.filter(node => expected === 'ltr').map(node => {
                        const text = node.firstChild, range = document.createRange(), first = (range.setStart(text, 0), range.setEnd(text, 1), range.getBoundingClientRect().left);
                        range.setStart(text, text.length - 1); range.setEnd(text, text.length);
                        return {text: node.textContent, firstLeftOfLast: first < range.getBoundingClientRect().left};
                    });
                    return {count: nodes.length, directions: [...new Set(nodes.map(node => getComputedStyle(node).direction))], expected, order};
                }, locale);
                assert.ok(result.count >= 2, 'heading date and time fragments'); assert.deepEqual(result.directions, [result.expected]);
                for (const entry of result.order) assert.equal(entry.firstLeftOfLast, true, entry.text);
                await page.screenshot({path: resolve(output, `${locale}-dir-${dir}-agenda.png`)});
                return result;
            });
    }
} finally { await browser.close(); }
const paths = ['src/v02/calendar/useCalendarController.ts', 'src/v02/calendar/useRootName.ts', 'src/v02/calendar/CalendarMonth.tsx', 'src/v02/calendar/SourceSelector.tsx', 'src/v02/calendar/overlays.tsx', 'src/v02/calendar/modality.ts',
    'src/v02/calendar/focus.ts', 'src/v02/calendar/dom.ts', 'src/v02/calendar/portal.ts', 'src/v02/primitives/NonModalPopover.tsx', 'src/v02/primitives/ModalSheet.tsx', 'src/v02/core/formatting.ts',
    'src/v02/core/locale.ts', 'src/v02/styles.css', 'src/index.ts', 'src/Calendar.tsx', 'scripts/implementation/review2-entry.tsx', 'scripts/implementation/review2-probe.mjs', 'package.json',
    'scripts/implementation/spikes/package-lock.json'];
const report = {capturedAt: new Date().toISOString(), outcome: !only && checks.every(c => c.outcome === 'pass') && !errors.length && !consoleErrors.length ? 'pass' : 'fail', filter: only ? String(only) : null,
    node: process.version, browser: version, react: 'bundled from the root lockfile, development build, StrictMode', checks, errors, consoleErrors, expectedConsole,
    scope: 'Review 2026-10-09-2 findings (and round 2) through the public Calendar in Chrome: outside-press focus (mouse and touch tap), inline heading visibility, hidden/suspended overlay owners, a React Aria Components host modal above the sheet and the shared scroll lock, action/source list focus rings, popover Tab and outside press, Tab exit in a modal <dialog>, <html> portal container and date text direction. Manual AT and other browsers are out of scope.',
    sourceHashes: Object.fromEntries(paths.map(path => [path, createHash('sha256').update(readFileSync(resolve(root, path))).digest('hex')]))};
writeFileSync(resolve(output, 'browser.json'), JSON.stringify(report, null, 2) + '\n');
console.log(`Review 2026-10-09-2: ${checks.filter(c => c.outcome === 'pass').length}/${checks.length}; ${errors.length} page errors; ${consoleErrors.length} console errors; ${output}`);
if (report.outcome === 'fail') process.exitCode = 1;
