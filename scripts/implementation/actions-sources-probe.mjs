import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, resolve} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {build} from 'vite';

// T17 real-Chrome probe: generic item actions in DayAgenda and controlled sources through the public Calendar in
// development StrictMode, with server render + hydration, in a Document and an open ShadowRoot root scope (default body
// portal with styles.css in every affected scope), LTR and RTL. Rows: R27 subcheck R27.1 (delayed filter acceptance),
// R39 (selector presentation switch), the alpha.2 parts of R41 (named sheets, empty item/source sheets), R37 on public
// menus, §5.5/§5.6, §12.2–12.4. Usage: node scripts/implementation/actions-sources-probe.mjs <outputDir>
const here = dirname(fileURLToPath(import.meta.url)), root = resolve(here, '../..');
const output = resolve(process.argv[2] ?? resolve(tmpdir(), 'calendar-actions-sources'));
mkdirSync(output, {recursive: true});
const directory = mkdtempSync(resolve(tmpdir(), 'calendar-actions-sources-'));
await build({configFile: false, logLevel: 'error', define: {'process.env.NODE_ENV': '"development"'}, mode: 'development',
    build: {outDir: directory, minify: false, lib: {entry: resolve(here, 'actions-sources-entry.tsx'), formats: ['es'], fileName: () => 'index.mjs'}}});
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

const day = (id, title, calendarId, date = '2026-03-04') => ({id, title, data: {}, ...(calendarId ? {calendarId} : {}),
    interval: {kind: 'allDay', start: date, end: `2026-03-${String(Number(date.slice(8)) + 1).padStart(2, '0')}`}});
// Five items on 4 March: known sources, no source and an unknown source; one more Home item on 5 March.
const items = [day('report', 'Report', 'work'), day('dinner', 'Dinner', 'home'), day('run', 'Run', 'gym'), day('note', 'Note'), day('lost', 'Lost', 'missing'),
    day('party', 'Party', 'home', '2026-03-05')];
const sources = [{id: 'work', title: 'Work'}, {id: 'home', title: 'Home'}, {id: 'gym', title: 'Gym'}];
const standard = [{id: 'open', label: 'Open'}, {id: 'share', label: 'Share'}, {id: 'delete', label: 'Delete', tone: 'danger'}];
const filtered = (overrides = {}) => ({items, sources, visibleSourceIds: ['work', 'home', 'gym'], filter: true, defaultActions: standard, ...overrides});
const isolated = text => `⁨${text}⁩`;
const hide = title => `Hide calendar ${isolated(title)}`, show = title => `Show calendar ${isolated(title)}`, actionsLabel = title => `Actions for ${isolated(title)}`;
const settle = page => page.evaluate(async () => { for (let i = 0; i < 6; i++) await new Promise(requestAnimationFrame); });
const patch = async (page, options) => { await page.evaluate(options => window.cal.patch(options), options); await settle(page); };
const info = page => page.evaluate(() => window.info());
const snap = page => page.evaluate(() => window.snapshot());
const events = (page, type) => page.evaluate(type => window.cal.events.filter(event => event.type === type).map(event => event.value), type);
const press = async (page, key) => { await page.keyboard.press(key); await settle(page); };
const selector = page => page.locator('#owner [data-source-selector]');
const cell = (page, date = '2026-03-04') => page.locator(`#owner [role=gridcell][data-date="${date}"]`);
const trigger = (page, id) => page.locator(`#owner [data-item-id="${id}"] > button[data-agenda-control="actions"], body > * [data-item-id="${id}"] > button[data-agenda-control="actions"]`);
const cleared = async page => { const state = await snap(page); assert.equal(state.inert, 0, 'no inert left'); assert.equal(state.overflow, '', 'scroll lock released'); assert.equal(state.backdrops, 0, 'no backdrop'); return state; };

async function setup({root: rootScope = 'document', options = {}, viewport = {width: 1200, height: 900}, colorScheme = 'light', hostWidth, init}) {
    const context = await browser.newContext({viewport, locale: 'en-US', hasTouch: true, colorScheme});
    // `init` runs in the page before any document script (instrumentation of a platform API).
    if (init) await context.addInitScript(init);
    const page = await context.newPage(), warnings = [];
    page.setDefaultTimeout(4000);
    page.on('pageerror', error => errors.push(String(error)));
    page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); if (message.type() === 'warning') warnings.push(message.text()); });
    const server = esm.serverActions(options).html;
    await page.setContent(`<style>body{margin:0;font:16px/1.4 system-ui;background:#f5f4f1}#outside,#after{margin:8px}
        #owner{font:15px/1.5 system-ui${hostWidth ? `;width:${hostWidth}px` : ''}}</style>
        <button id="outside">Outside</button><p id="blank">Blank area</p><div id="owner"></div><button id="after">After</button>`);
    await page.evaluate(async ({rootScope, moduleUrl, css, server, options}) => {
        const addCss = scope => { const style = document.createElement('style'); style.textContent = css; (scope === document ? document.head : scope).append(style); };
        const host = document.getElementById('owner'), scope = rootScope === 'shadow' ? host.attachShadow({mode: 'open'}) : host;
        // §10.3.4: the default portal is the document body, so the document always needs the stylesheet; a shadow root too.
        addCss(document); if (scope !== host) addCss(scope);
        window.scope = scope;
        window.deep = selector => { const out = new Set(); const visit = node => { for (const element of node.querySelectorAll(selector)) out.add(element); for (const element of node.querySelectorAll('*')) if (element.shadowRoot) visit(element.shadowRoot); }; visit(document); return [...out]; };
        window.active = () => { let node = document.activeElement; while (node?.shadowRoot?.activeElement) node = node.shadowRoot.activeElement; return node; };
        window.composedClosest = (node, selector) => { for (let current = node; current; current = current.assignedSlot ?? current.parentElement ?? current.getRootNode().host) if (current.matches?.(selector)) return current; return null; };
        window.info = () => {
            const node = window.active();
            return {id: node?.id || undefined, date: node?.dataset?.date, item: node?.closest?.('[data-item-id]')?.dataset.itemId, control: node?.dataset?.agendaControl,
                role: node?.getAttribute?.('role') ?? undefined, label: node?.getAttribute?.('aria-label') ?? undefined, tag: node?.tagName, type: node?.type,
                selector: !!node?.hasAttribute?.('data-source-selector'), presentation: window.composedClosest(node, '[data-presentation]')?.dataset.presentation,
                inCalendar: !!window.composedClosest(node, '.nc-calendar'), inSheet: !!window.composedClosest(node, '.nc-sheet'), inMenu: !!node?.closest?.('[role=menu]')};
        };
        window.portals = () => window.deep('.nc-theme').filter(node => !node.classList.contains('nc-calendar'));
        window.snapshot = () => ({dialogs: window.deep('[role=dialog]').length, menus: window.deep('[role=menu]').length, inert: window.deep('[inert]').length,
            overflow: document.documentElement.style.overflow, backdrops: window.deep('.nc-backdrop').length, portals: window.portals().length,
            presentations: window.deep('[data-presentation]').map(node => `${node.dataset.presentation}@${node.dataset.date ?? '-'}`)});
        /** The accessible description text of a date cell: the full count of items that passed the filter (§12.1). */
        window.cellText = date => {
            const node = window.deep(`[role=gridcell][data-date="${date}"]`)[0], tree = node.getRootNode();
            return ['aria-labelledby', 'aria-describedby'].flatMap(name => node.getAttribute(name)?.split(' ') ?? []).map(id => tree.getElementById(id)?.textContent).join(' ');
        };
        window.rows = () => window.deep('section[data-date] [data-item-id]').map(node => node.dataset.itemId);
        // Live log: every child-list write to a live endpoint and where it is.
        window.live = [];
        // The source sheet is found by its dialog id: data-presentation belongs to DayAgenda only (§5.7 table, T18).
        const liveWatch = target => new MutationObserver(records => {
            for (const record of records) {
                const endpoint = record.target;
                if (!endpoint.matches?.('[role=status], [role=alert]') || !record.addedNodes.length) continue;
                window.live.push({where: endpoint.closest('.nc-sheet') ? (endpoint.closest('.nc-sheet').querySelector('[role=dialog]')?.id?.includes('sources') ? 'sources-sheet' : 'sheet') : 'root',
                    role: endpoint.getAttribute('role'), text: [...record.addedNodes].map(node => node.textContent).join('')});
            }
        }).observe(target, {childList: true, subtree: true});
        for (const target of new Set([document.body, scope instanceof ShadowRoot ? scope : document.body])) liveWatch(target);
        const module = await import(moduleUrl);
        // A second hydration of the same server markup (the review 2026-10-09-1 mount checks).
        window.rehydrate = async () => { window.cal.unmount(); fixture.innerHTML = server; window.cal = await module.hydrateActions(fixture, options); return window.cal.errors; };
        const fixture = document.createElement('div'); fixture.className = 'fixture'; fixture.innerHTML = server; scope.append(fixture);
        window.cal = await module.hydrateActions(fixture, options);
    }, {rootScope, moduleUrl, css, server, options});
    await settle(page);
    return {page, context, warnings};
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
const screenshot = (page, name) => page.screenshot({path: resolve(output, `${name}.png`)});
const checkboxes = page => page.evaluate(() => window.deep('[role=menuitemcheckbox]').map(node => [node.getAttribute('aria-label'), node.getAttribute('aria-checked')]));
const sheetBoxes = page => page.evaluate(() => window.deep('.nc-sheet input[type=checkbox]').map(node => [node.getAttribute('aria-label'), node.checked]));

try {
    // ——— Server markup ———
    await check('SSR: the controlled selector is a server-rendered toolbar trigger; hidden by showSourceSelector={false}, by fewer than two valid sources and without the pair', async () => {
        const html = esm.serverActions(filtered()).html;
        assert.match(html, /data-source-selector[^>]*aria-haspopup="dialog"|aria-haspopup="dialog"[^>]*data-source-selector/, 'auto renders mobile on the server: a sheet trigger');
        assert.match(esm.serverActions(filtered({layout: 'desktop'})).html, /aria-haspopup="menu"[^>]*aria-expanded="false"|aria-expanded="false"[^>]*aria-haspopup="menu"/);
        for (const options of [filtered({showSourceSelector: false}), filtered({sources: sources.slice(0, 1), visibleSourceIds: ['work']}),
            {items, sources, defaultActions: standard}]) assert.doesNotMatch(esm.serverActions(options).html, /data-source-selector/);
        // Actions render nothing on the server: no agenda is open there.
        assert.doesNotMatch(esm.serverActions({...filtered({layout: 'desktop'})}).html, /data-agenda-control="actions"/);
    });

    for (const rootScope of ['document', 'shadow']) for (const [locale, dir] of [['en-US', 'ltr'], ['ar', 'rtl']]) {
        const label = `${rootScope}, ${dir.toUpperCase()} ${locale}`;
        // ——— R27.1: desktop source menu with delayed acceptance ———
        await scenario(`R27.1 ${label}: desktop menuitemcheckbox keeps aria-checked and its show/hide name until acceptance; then grid, count, agenda and actions update together`, {root: rootScope,
            colorScheme: dir === 'rtl' ? 'dark' : 'light', options: filtered({layout: 'desktop', locale, colorScheme: dir === 'rtl' ? 'dark' : 'light'})}, async (page, {warnings}) => {
            assert.match(await page.evaluate(() => window.cellText('2026-03-04')), /5 events/);
            assert.equal(await selector(page).getAttribute('aria-haspopup'), 'menu'); assert.equal(await selector(page).getAttribute('aria-expanded'), 'false');
            await selector(page).click(); await settle(page);
            assert.deepEqual(await checkboxes(page), [[hide('Work'), 'true'], [hide('Home'), 'true'], [hide('Gym'), 'true']]);
            assert.equal((await info(page)).role, 'menuitemcheckbox', 'the first menu item has focus'); assert.equal(await selector(page).getAttribute('aria-expanded'), 'true');
            assert.equal(await page.evaluate(() => window.deep('[role=menu]')[0].getAttribute('aria-label')), 'Calendars', 'the menu owns its name, independent of the trigger IDREF (R42)');
            // R42: the trigger in the calendar root and the menu in the body share a tree scope only for a Document root.
            assert.equal(await page.evaluate(() => { const button = window.deep('[data-source-selector]')[0], menu = window.deep('[role=menu]')[0];
                return button.getAttribute('aria-controls') === menu.id ? 'linked' : button.hasAttribute('aria-controls') ? 'dangling' : 'none'; }), rootScope === 'document' ? 'linked' : 'none');
            const geometry = await page.evaluate(() => { const menu = window.deep('[role=menu]')[0].getBoundingClientRect(), button = window.deep('[data-source-selector]')[0].getBoundingClientRect();
                return {below: menu.top >= button.bottom - 1, overlap: Math.min(menu.right, button.right) - Math.max(menu.left, button.left), inside: menu.left >= 0 && menu.right <= innerWidth}; });
            assert.ok(geometry.below && geometry.overlap > 0 && geometry.inside, `menu anchored below its trigger: ${JSON.stringify(geometry)}`);
            if (rootScope === 'document' && dir === 'ltr') await screenshot(page, 'document-ltr-source-menu');
            if (rootScope === 'document' && dir === 'rtl') await screenshot(page, 'document-rtl-dark-source-menu');
            await press(page, 'ArrowDown'); await press(page, 'Space');
            assert.deepEqual(await events(page, 'sources'), [['work', 'gym']], 'one normalized request in sources order');
            assert.deepEqual(await checkboxes(page), [[hide('Work'), 'true'], [hide('Home'), 'true'], [hide('Gym'), 'true']], 'no optimistic toggle');
            assert.equal((await snap(page)).menus, 1, 'a source toggle keeps the menu open');
            assert.match(await page.evaluate(() => window.cellText('2026-03-04')), /5 events/, 'the grid waits for acceptance');
            await patch(page, {visibleSourceIds: ['work', 'gym']});
            assert.deepEqual(await checkboxes(page), [[hide('Work'), 'true'], [show('Home'), 'false'], [hide('Gym'), 'true']]);
            assert.equal((await info(page)).label, show('Home'), 'focus stays on the toggled control');
            assert.match(await page.evaluate(() => window.cellText('2026-03-04')), /4 events/);
            assert.doesNotMatch(await page.evaluate(() => window.cellText('2026-03-05')), /1 event/, 'the hidden item leaves every date');
            await press(page, 'Escape');
            assert.equal((await snap(page)).menus, 0); assert.equal((await info(page)).selector, true, 'Escape returns to the trigger');
            assert.equal(await selector(page).getAttribute('aria-controls'), null, 'no IDREF to a closed menu');
            await cell(page).focus(); await press(page, 'Enter');
            assert.deepEqual(await page.evaluate(() => window.rows()), ['lost', 'note', 'report', 'run'], 'no source and an unknown source stay visible; the hidden one is gone');
            assert.equal(await trigger(page, 'dinner').count(), 0); assert.equal(await trigger(page, 'note').count(), 1); assert.equal(await trigger(page, 'lost').count(), 1);
            assert.deepEqual(warnings.filter(text => text.includes('calendarId')), ['[@nelmad/calendar] items[4].calendarId: No source with ID "missing"; items with this calendarId remain visible with fallback appearance']);
            assert.deepEqual(await events(page, 'sources'), [['work', 'gym']], 'acceptance itself calls nothing');
        });
    }

    for (const rootScope of ['document', 'shadow']) {
        // ——— R27.1 mobile: native checkboxes are not toggled before acceptance ———
        await scenario(`R27.1/R41 ${rootScope}: mobile source sheet is named by its heading; checkboxes keep their native checked state until acceptance; the inline agenda follows the accepted filter`,
            {root: rootScope, viewport: {width: 420, height: 860}, options: filtered({layout: 'mobile', visibleSourceIds: ['work', 'home']})}, async page => {
            assert.deepEqual(await page.evaluate(() => window.rows()), ['dinner', 'lost', 'note', 'report']);
            await selector(page).click(); await settle(page);
            const named = await page.evaluate(() => { const dialog = window.deep('[role=dialog][aria-modal=true]')[0], heading = dialog.getRootNode().getElementById(dialog.getAttribute('aria-labelledby'));
                return {heading: heading?.textContent, visible: heading?.getBoundingClientRect().height > 0, tag: heading?.tagName}; });
            assert.deepEqual(named, {heading: 'Calendars', visible: true, tag: 'H3'});
            assert.deepEqual(await sheetBoxes(page), [[hide('Work'), true], [hide('Home'), true], [show('Gym'), false]]);
            assert.equal((await info(page)).type, 'checkbox', 'the first toggle has focus');
            assert.equal((await snap(page)).overflow, 'hidden'); assert.ok((await snap(page)).inert > 0, 'background inert');
            await screenshot(page, `${rootScope}-mobile-source-sheet`);
            await page.locator('.nc-sheet input[type=checkbox]').nth(2).click({force: true}); await settle(page);
            assert.deepEqual(await events(page, 'sources'), [['work', 'home', 'gym']]);
            assert.deepEqual(await sheetBoxes(page), [[hide('Work'), true], [hide('Home'), true], [show('Gym'), false]], 'a native checkbox is not toggled optimistically');
            await patch(page, {visibleSourceIds: ['work', 'home', 'gym']});
            assert.deepEqual(await sheetBoxes(page), [[hide('Work'), true], [hide('Home'), true], [hide('Gym'), true]]);
            assert.deepEqual(await page.evaluate(() => window.rows()), ['dinner', 'lost', 'note', 'report', 'run']);
            await page.locator('.nc-sheet [data-sources-close]').click(); await settle(page);
            assert.equal((await snap(page)).dialogs, 0); assert.equal((await info(page)).selector, true); await cleared(page);
        });

        // ——— R39: presentation switch of the standalone selector, measured by layout="auto" ———
        await scenario(`R39 ${rootScope}: a mobile source sheet closes when the measured layout becomes desktop; no menu opens, visibility is unchanged, focus returns to the new trigger, nothing remains`,
            {root: rootScope, viewport: {width: 1200, height: 900}, hostWidth: 480, options: filtered({visibleSourceIds: ['work']})}, async page => {
            assert.equal(await page.evaluate(() => window.deep('.nc-calendar')[0].dataset.layout), 'mobile');
            await selector(page).click(); await settle(page);
            assert.equal((await snap(page)).dialogs, 1); assert.equal((await info(page)).inSheet, true);
            await page.evaluate(() => { document.getElementById('owner').style.width = '900px'; }); await settle(page);
            assert.equal(await page.evaluate(() => window.deep('.nc-calendar')[0].dataset.layout), 'desktop');
            const state = await cleared(page); assert.equal(state.dialogs, 0); assert.equal(state.menus, 0); assert.equal(state.portals, 0, 'no orphan portal');
            assert.equal((await info(page)).selector, true, 'focus on the trigger'); assert.equal(await selector(page).getAttribute('aria-haspopup'), 'menu');
            assert.equal(await selector(page).getAttribute('aria-expanded'), 'false'); assert.deepEqual(await events(page, 'sources'), []);
            assert.match(await page.evaluate(() => window.cellText('2026-03-04')), /3 events/, 'accepted visibility unchanged');
            // Reverse: a desktop menu becomes a mobile layout.
            await selector(page).click(); await settle(page); assert.equal((await snap(page)).menus, 1); assert.equal((await info(page)).inMenu, true);
            await page.evaluate(() => { document.getElementById('owner').style.width = '480px'; }); await settle(page);
            const back = await cleared(page); assert.equal(back.menus, 0); assert.equal(back.dialogs, 0); assert.equal(back.portals, 0);
            assert.equal((await info(page)).selector, true); assert.equal(await selector(page).getAttribute('aria-haspopup'), 'dialog');
        });
        await scenario(`R39 ${rootScope}: an external focus target is kept when the switch closes the selector`, {root: rootScope, hostWidth: 900, options: filtered()}, async page => {
            await selector(page).click(); await settle(page); assert.equal((await snap(page)).menus, 1);
            await page.locator('#outside').focus(); await settle(page);
            assert.equal((await snap(page)).menus, 0, 'focus that left closes the non-modal menu'); assert.equal((await info(page)).id, 'outside');
            await page.evaluate(() => { document.getElementById('owner').style.width = '480px'; }); await settle(page);
            assert.equal((await info(page)).id, 'outside'); await cleared(page);
        });

        // ——— §12.2 source menu dismissal: outside presses and Tab ———
        await scenario(`§12.2 ${rootScope}: a press on a blank area closes the source menu and returns displaced focus to its trigger; a press on a focusable target keeps it; Tab continues after the trigger`,
            {root: rootScope, options: filtered({layout: 'desktop'})}, async page => {
            await selector(page).click(); await settle(page); assert.equal((await snap(page)).menus, 1);
            await page.locator('#blank').click(); await settle(page);
            assert.equal((await snap(page)).menus, 0); assert.equal((await info(page)).selector, true, '§12.3: displaced focus returns to the trigger');
            await selector(page).click(); await settle(page); await page.locator('#after').click(); await settle(page);
            assert.equal((await snap(page)).menus, 0); assert.equal((await info(page)).id, 'after');
            await selector(page).click(); await settle(page); await press(page, 'Tab');
            const next = await info(page); assert.equal((await snap(page)).menus, 0); assert.equal(next.selector, false); assert.equal(next.inCalendar, true, `the next control after the trigger: ${JSON.stringify(next)}`);
            await selector(page).click(); await settle(page); await press(page, 'Shift+Tab');
            assert.equal((await info(page)).label, 'Next month', 'Shift+Tab continues before the trigger');
            assert.deepEqual(await events(page, 'sources'), []);
        });

        // ——— Spec v8 §12.3 (decision 1, 2026-10-22): the standalone selector returns focus to its own trigger on every close path ———
        const onTrigger = async (page, path) => { assert.equal((await info(page)).selector, true, `${path}: focus on the trigger ${JSON.stringify(await info(page))}`); };
        const openSelector = async (page, kind) => {
            await selector(page).click(); await settle(page);
            const state = await snap(page), focus = await info(page);
            assert.equal(kind === 'menu' ? state.menus : state.dialogs, 1, `the ${kind} is open`);
            assert.ok(kind === 'menu' ? focus.inMenu : focus.inSheet, `focus inside the ${kind}: ${JSON.stringify(focus)}`);
        };
        const container = (page, id) => page.evaluate(id => { const box = document.createElement('div'); box.id = id; document.body.append(box); window.cal.patch({portalContainer: box}); }, id).then(() => settle(page));
        // The modal host is a wrapper around the Calendar host element, as a host dialog would be (#frame, made by `framed`).
        const framed = page => page.evaluate(() => { const frame = document.createElement('section'), owner = document.getElementById('owner'); frame.id = 'frame'; frame.setAttribute('aria-label', 'Host');
            owner.before(frame); frame.append(owner); }).then(() => settle(page));
        const modalHost = (page, on) => page.evaluate(on => { const host = document.getElementById('frame'); if (on) host.setAttribute('aria-modal', 'true'); else host.removeAttribute('aria-modal'); }, on).then(() => settle(page));
        await scenario(`spec v8 §12.3 ${rootScope} desktop: every close path of the source menu (Escape, its trigger, a blank-area press, a new portalContainer, a default target that changes by aria-modal alone) returns focus that was inside to the trigger; an outside focusable target keeps focus`,
            {root: rootScope, options: filtered({layout: 'desktop'})}, async page => {
            await framed(page);
            await openSelector(page, 'menu'); await press(page, 'Escape'); await onTrigger(page, 'Escape');
            await openSelector(page, 'menu'); await selector(page).click(); await settle(page); assert.equal((await snap(page)).menus, 0); await onTrigger(page, 'trigger press');
            await openSelector(page, 'menu'); await page.locator('#blank').click(); await settle(page); assert.equal((await snap(page)).menus, 0); await onTrigger(page, 'blank-area press');
            await openSelector(page, 'menu'); await page.locator('#after').click(); await settle(page); assert.equal((await snap(page)).menus, 0);
            assert.equal((await info(page)).id, 'after', 'an outside focusable target keeps focus');
            await openSelector(page, 'menu'); await container(page, 'box'); assert.equal((await snap(page)).menus, 0); await onTrigger(page, 'new portalContainer');
            await openSelector(page, 'menu'); assert.equal(await page.evaluate(() => document.getElementById('box').querySelectorAll('[role=menu]').length), 1, 'the next activation uses the new container');
            await page.evaluate(() => window.cal.patch({portalContainer: undefined})); await settle(page); assert.equal((await snap(page)).menus, 0); await onTrigger(page, 'portalContainer removed');
            await openSelector(page, 'menu'); await modalHost(page, true); assert.equal((await snap(page)).menus, 0); await onTrigger(page, 'host became modal');
            await openSelector(page, 'menu'); assert.equal(await page.evaluate(() => window.composedClosest(window.deep('[role=menu]')[0], '#frame') !== null), true, 'the next menu opens in the modal host');
            await modalHost(page, false); assert.equal((await snap(page)).menus, 0); await onTrigger(page, 'host no longer modal');
            assert.deepEqual(await events(page, 'sources'), []);
        });
        await scenario(`spec v8 §12.3 ${rootScope} mobile: every close path of the source sheet (Escape, close, a backdrop press, a new portalContainer, a default target that changes by aria-modal alone) returns focus to the trigger and releases the modal effects (around a host that became modal, once the host closes)`,
            {root: rootScope, viewport: {width: 420, height: 860}, options: filtered({layout: 'mobile'})}, async page => {
            await framed(page);
            await openSelector(page, 'sheet'); await press(page, 'Escape'); await cleared(page); await onTrigger(page, 'Escape');
            await openSelector(page, 'sheet'); await page.locator('.nc-sheet [data-sources-close]').click(); await settle(page); await cleared(page); await onTrigger(page, 'close');
            await openSelector(page, 'sheet'); await page.mouse.click(8, 8); await settle(page); assert.equal((await snap(page)).dialogs, 0, 'the backdrop press closes'); await cleared(page); await onTrigger(page, 'backdrop press');
            await openSelector(page, 'sheet'); await container(page, 'box'); assert.equal((await snap(page)).dialogs, 0); await cleared(page); await onTrigger(page, 'new portalContainer');
            await page.evaluate(() => window.cal.patch({portalContainer: undefined})); await settle(page);
            await openSelector(page, 'sheet'); await modalHost(page, true); assert.equal((await snap(page)).dialogs, 0); await onTrigger(page, 'host became modal');
            // The host is now a modal layer: the page outside it stays inert until it closes (QA-10); nothing inside it is inert.
            assert.deepEqual(await page.evaluate(() => window.deep('[inert]').filter(node => node.closest('#frame') || !node.parentElement?.matches('body')).length), 0, 'only the page around the modal host is inert');
            await modalHost(page, false); await cleared(page); await onTrigger(page, 'host no longer modal');
            assert.deepEqual(await events(page, 'sources'), []);
        });

        // ——— R41 sources: fewer than two valid sources ———
        await scenario(`R41 ${rootScope}: an open source sheet closes when fewer than two valid sources remain; the trigger disappears and focus recovers to the roving date cell`,
            {root: rootScope, viewport: {width: 420, height: 860}, options: filtered({layout: 'mobile'})}, async page => {
            await selector(page).click(); await settle(page); assert.equal((await snap(page)).dialogs, 1);
            await patch(page, {sources: [sources[0], {id: 'home', title: 'Home'}, {id: 'home', title: 'Duplicate'}], visibleSourceIds: ['work']});
            const state = await cleared(page); assert.equal(state.dialogs, 0); assert.equal(state.portals, 0);
            assert.equal(await selector(page).count(), 0); assert.equal((await info(page)).date, '2026-03-04', 'roving date cell (§12.3 step 4)');
        });

        // ——— R41 items + §12.2: mobile action sheet ———
        await scenario(`R41 ${rootScope}: a named mobile action sheet with one button per action; when its set becomes empty it closes, its trigger disappears and focus stays in the inline agenda`,
            {root: rootScope, viewport: {width: 420, height: 860}, options: filtered({layout: 'mobile'})}, async page => {
            assert.equal(await trigger(page, 'report').getAttribute('aria-label'), actionsLabel('Report')); assert.equal(await trigger(page, 'report').getAttribute('aria-haspopup'), 'dialog');
            await trigger(page, 'report').click(); await settle(page);
            const sheet = await page.evaluate(() => { const dialog = window.deep('[role=dialog][aria-modal=true]')[0], heading = dialog.getRootNode().getElementById(dialog.getAttribute('aria-labelledby'));
                return {heading: heading?.textContent, buttons: [...dialog.querySelectorAll('button')].map(node => node.textContent || node.getAttribute('aria-label')),
                    sizes: [...dialog.querySelectorAll('button')].map(node => { const box = node.getBoundingClientRect(); return Math.min(box.width, box.height); }),
                    bottom: Math.round(dialog.closest('.nc-sheet').getBoundingClientRect().bottom), danger: dialog.querySelector('[data-tone=danger]')?.textContent}; });
            assert.equal(sheet.heading, 'Actions for Report'); assert.deepEqual(sheet.buttons, ['Cancel', 'Open', 'Share', 'Delete']); assert.equal(sheet.danger, 'Delete');
            assert.ok(sheet.sizes.every(size => size >= 24), `targets ≥ 24 px: ${sheet.sizes}`); assert.equal(sheet.bottom, 860, 'bottom sheet');
            assert.equal((await info(page)).tag, 'BUTTON'); assert.equal(await page.evaluate(() => window.active().textContent), 'Open', 'the first action has focus, not the heading');
            await screenshot(page, `${rootScope}-mobile-action-sheet`);
            await patch(page, {actionsByItem: {report: []}});
            const state = await cleared(page); assert.equal(state.dialogs, 0); assert.equal(state.portals, 0);
            assert.equal(await trigger(page, 'report').count(), 0);
            const focus = await info(page); assert.equal(focus.presentation, 'inline'); assert.ok(focus.control, `a control of the inline agenda: ${JSON.stringify(focus)}`);
            assert.deepEqual(await events(page, 'action'), []);
            // The same sheet over an agenda sheet: an action sends exactly one request (StrictMode) and returns to its trigger.
            await trigger(page, 'run').click(); await settle(page); await page.getByRole('button', {name: 'Share', exact: true}).click(); await settle(page);
            assert.deepEqual(await events(page, 'action'), [{id: 'run', actionId: 'share', title: 'Run'}]); assert.equal((await info(page)).item, 'run');
            await cleared(page);
        });
    }

    for (const rootScope of ['document', 'shadow']) for (const [locale, dir] of [['en-US', 'ltr'], ['ar', 'rtl']]) {
        const label = `${rootScope}, ${dir.toUpperCase()} ${locale}`;
        // ——— §5.5/§12.2: desktop item menu nested in the agenda popover ———
        await scenario(`§5.5 ${label}: a separate actions trigger opens a named menu nested in the agenda; one request per activation; Escape layers; Tab exit; IDREF within one tree scope`,
            {root: rootScope, options: filtered({layout: 'desktop', locale, actionsByItem: {note: [{id: 'x', label: ' '}, {id: 'open', label: 'Open'}], lost: []}})}, async (page, {warnings}) => {
            assert.equal(await page.evaluate(() => window.deep('[role=grid] button, [role=grid] [data-agenda-control]').length), 0, 'the grid has no action buttons');
            await cell(page).focus(); await press(page, 'Enter');
            const row = await page.evaluate(() => { const actions = window.deep('[data-item-id="report"] > [data-agenda-control="actions"]')[0], primary = window.deep('[data-item-id="report"] > [data-agenda-control="primary"]')[0];
                return {nested: primary.contains(actions) || actions.contains(primary), haspopup: actions.getAttribute('aria-haspopup'), expanded: actions.getAttribute('aria-expanded')}; });
            assert.deepEqual(row, {nested: false, haspopup: 'menu', expanded: 'false'});
            assert.equal(await trigger(page, 'lost').count(), 0, 'an empty set has no trigger');
            await trigger(page, 'report').focus(); await press(page, 'Enter');
            const menu = await page.evaluate(() => { const node = window.deep('[role=menu]')[0], button = window.deep('[data-item-id="report"] > [data-agenda-control="actions"]')[0];
                return {label: node.getAttribute('aria-label'), items: [...node.querySelectorAll('[role=menuitem]')].map(item => item.textContent), controls: button.getAttribute('aria-controls') === node.id,
                    expanded: button.getAttribute('aria-expanded'), danger: getComputedStyle(node.querySelector('[data-tone=danger]')).color !== getComputedStyle(node.querySelector('[role=menuitem]')).color,
                    inAgenda: !!window.composedClosest(node, 'section[data-date]')}; });
            // The trigger lives in the agenda popover, which the default portal puts into the document body with the menu: one tree scope.
            assert.deepEqual(menu, {label: actionsLabel('Report'), items: ['Open', 'Share', 'Delete'], controls: true, expanded: 'true', danger: true, inAgenda: false});
            assert.equal((await info(page)).role, 'menuitem');
            if (rootScope === 'document') await screenshot(page, `document-${dir}-item-menu-in-agenda`);
            await press(page, 'ArrowDown'); await press(page, 'Enter');
            assert.deepEqual(await events(page, 'action'), [{id: 'report', actionId: 'share', title: 'Report'}], 'exactly one request in StrictMode');
            let state = await snap(page); assert.equal(state.menus, 0); assert.equal(state.dialogs, 1);
            assert.deepEqual([(await info(page)).item, (await info(page)).control], ['report', 'actions']);
            // Two Escapes: the menu, then the agenda to its date cell.
            await press(page, 'Enter'); assert.equal((await snap(page)).menus, 1);
            await press(page, 'Escape'); state = await snap(page); assert.equal(state.menus, 0); assert.equal(state.dialogs, 1); assert.equal((await info(page)).control, 'actions');
            await press(page, 'Escape'); assert.equal((await snap(page)).dialogs, 0); assert.equal((await info(page)).date, '2026-03-04');
            // Tab leaves the menu to the next control after its trigger inside the agenda.
            await press(page, 'Enter'); await trigger(page, 'report').focus(); await press(page, 'Enter'); await press(page, 'Tab');
            state = await snap(page); assert.equal(state.menus, 0); assert.equal(state.dialogs, 1);
            const next = await info(page); assert.notEqual(next.control, undefined); assert.notEqual(next.item, 'report', 'the trigger itself is skipped');
            // Invalid actions are excluded with one development warning each.
            await trigger(page, 'note').focus(); await press(page, 'Enter');
            assert.deepEqual(await page.evaluate(() => [...window.deep('[role=menu]')[0].querySelectorAll('[role=menuitem]')].map(node => node.textContent)), ['Open']);
            assert.deepEqual(warnings.filter(text => text.includes('getItemActions(')), ['[@nelmad/calendar] getItemActions("note").actions[0]: Invalid action id, label or tone']);
        });
    }

    for (const rootScope of ['document', 'shadow']) {
        // ——— Latest committed set, R37 on public menus ———
        await scenario(`§5.5/R37 ${rootScope}: the open menu shows the latest committed set; a filtered item keeps its menu until Escape with every action disabled (§5.6); an emptied set closes inside the agenda`,
            {root: rootScope, options: filtered({layout: 'desktop'})}, async page => {
            await cell(page).focus(); await press(page, 'Enter'); await trigger(page, 'dinner').focus(); await press(page, 'Enter');
            await patch(page, {actionsByItem: {dinner: [{id: 'archive', label: 'Archive'}]}});
            assert.deepEqual(await page.evaluate(() => [...window.deep('[role=menu]')[0].querySelectorAll('[role=menuitem]')].map(node => node.textContent)), ['Archive']);
            assert.equal(await page.evaluate(() => window.active().textContent), 'Archive', 'the removed focused action hands focus to the first control of the open menu');
            await press(page, 'Enter'); assert.deepEqual(await events(page, 'action'), [{id: 'dinner', actionId: 'archive', title: 'Dinner'}]);
            // The accepted filter hides the item while its menu is open: the menu belongs to the stack (R37) but its action is unavailable.
            await press(page, 'Enter'); assert.equal((await snap(page)).menus, 1);
            await patch(page, {visibleSourceIds: ['work', 'gym']});
            assert.equal(await trigger(page, 'dinner').count(), 0); assert.equal((await snap(page)).menus, 1);
            // T17-V1-D1: the item no longer has available actions, so none is offered as usable; focus stays in the menu.
            const items = await page.evaluate(() => [...window.deep('[role=menu]')[0].querySelectorAll('[role=menuitem]')].map(node => node.getAttribute('aria-disabled')));
            assert.deepEqual(items, ['true']);
            assert.equal(await page.evaluate(() => !!window.deep('[role=menu]')[0].contains(window.active())), true, 'focus stays in the open menu');
            await press(page, 'Enter'); await page.locator('[role=menuitem]').first().click({force: true}); await settle(page);
            assert.equal((await snap(page)).menus, 1, 'a disabled action neither runs nor closes the menu');
            await press(page, 'Escape'); let state = await snap(page);
            assert.equal(state.menus, 0); assert.equal(state.dialogs, 1, 'the agenda stays open');
            assert.deepEqual(await events(page, 'action'), [{id: 'dinner', actionId: 'archive', title: 'Dinner'}], 'no request for a hidden item');
            const focus = await info(page); assert.ok(focus.control && focus.item !== 'dinner', `§12.3 step 2 inside the agenda: ${JSON.stringify(focus)}`);
            // An emptied set of an open menu closes it; focus stays inside the open agenda.
            await trigger(page, 'report').focus(); await press(page, 'Enter'); assert.equal((await snap(page)).menus, 1);
            await patch(page, {actionsByItem: {report: []}});
            state = await snap(page); assert.equal(state.menus, 0); assert.equal(state.dialogs, 1);
            const after = await info(page); assert.ok(after.control && after.item !== undefined, `focus inside the agenda: ${JSON.stringify(after)}`);
            // Removing the pair hides every trigger.
            await patch(page, {defaultActions: null, actionsByItem: undefined});
            assert.equal(await page.evaluate(() => window.deep('[data-agenda-control="actions"]').length), 0);
        });

        // ——— §12.4: a modal source sheet owns the single live endpoint ———
        await scenario(`§12.4 ${rootScope}: while the source sheet is open, the refresh completion is announced once, only inside it; the root endpoints stay empty`,
            {root: rootScope, viewport: {width: 420, height: 860}, options: filtered({layout: 'mobile', dataState: {status: 'loading', phase: 'refresh'}})}, async page => {
            await selector(page).click(); await settle(page);
            await page.evaluate(() => { window.live.length = 0; });
            await patch(page, {dataState: {status: 'ready'}});
            const live = await page.evaluate(() => window.live.filter(entry => entry.text));
            assert.deepEqual(live, [{where: 'sources-sheet', role: 'status', text: 'Calendar refreshed'}]);
            await press(page, 'Escape'); await cleared(page);
            assert.deepEqual(await page.evaluate(() => window.live.filter(entry => entry.text).length), 1, 'nothing is copied to the root on close');
        });

        // ——— Review 2026-10-09-1 ———
        // §12.4: the endpoints of the source and item action sheets are inside their aria-modal element (the modal subtree).
        await scenario(`§12.4 ${rootScope}: the live endpoints of the source sheet and the item action sheet are descendants of their aria-modal dialog and receive the output (review 2026-10-09-1)`,
            {root: rootScope, viewport: {width: 420, height: 860}, options: filtered({layout: 'mobile', dataState: {status: 'loading', phase: 'refresh'}})}, async page => {
            const endpoints = () => page.evaluate(() => { const dialog = window.deep('.nc-sheet [role=dialog][aria-modal=true]')[0], sheet = dialog.closest('.nc-sheet');
                return [...sheet.querySelectorAll('[role=status], [role=alert]')].map(node => ({role: node.getAttribute('role'), inDialog: dialog.contains(node)})); });
            await selector(page).click(); await settle(page);
            assert.deepEqual(await endpoints(), [{role: 'status', inDialog: true}, {role: 'alert', inDialog: true}]);
            await page.evaluate(() => { window.live.length = 0; }); await patch(page, {dataState: {status: 'ready'}});
            assert.deepEqual(await page.evaluate(() => window.live.filter(entry => entry.text)), [{where: 'sources-sheet', role: 'status', text: 'Calendar refreshed'}]);
            await press(page, 'Escape'); await cleared(page);
            await trigger(page, 'report').click(); await settle(page);
            assert.deepEqual(await endpoints(), [{role: 'status', inDialog: true}, {role: 'alert', inDialog: true}]);
            await page.evaluate(() => { window.live.length = 0; }); await patch(page, {dataState: {status: 'error', phase: 'refresh', error: null}});
            assert.deepEqual(await page.evaluate(() => window.live.filter(entry => entry.text)), [{where: 'sheet', role: 'alert', text: 'Could not load calendar'}]);
            await press(page, 'Escape'); await cleared(page);
        });
        // §12.3/§12.5: development StrictMode hydration (the probe entry) and a later client mount never move focus.
        for (const layout of ['desktop', 'mobile']) await scenario(`§12.3 ${rootScope} ${layout}: StrictMode hydration with the source selector leaves focus where it was; so does an external focused control (review 2026-10-09-1)`,
            {root: rootScope, viewport: {width: layout === 'mobile' ? 420 : 1200, height: 860}, options: filtered({layout})}, async page => {
            const focus = await info(page); assert.equal(focus.tag, 'BODY', JSON.stringify(focus));
            assert.equal(await page.evaluate(() => window.deep(':focus-visible').length), 0, 'no focus ring at mount');
            await page.locator('#outside').focus();
            assert.deepEqual(await page.evaluate(() => window.rehydrate()), [], 'hydration must not recover from mismatches');
            await settle(page); assert.equal((await info(page)).id, 'outside');
        });
        // §9: a committed blocking state closes the selector top-down; its trigger is disabled like the navigation.
        for (const layout of ['desktop', 'mobile']) for (const [phase, dataState, region] of [['loading', {status: 'loading', phase: 'initial'}, 'Loading calendar'],
            ['error', {status: 'error', phase: 'initial', error: null}, 'Could not load calendar']]) {
            await scenario(`§9 ${rootScope} ${layout} ${phase}/initial: the open source ${layout === 'desktop' ? 'menu' : 'sheet'} closes, modal effects are released, focus moves to the state region, no toggle fires and nothing reopens (review 2026-10-09-1)`,
                {root: rootScope, viewport: {width: layout === 'mobile' ? 420 : 1200, height: 860}, options: filtered({layout})}, async page => {
                await selector(page).focus(); await press(page, 'Enter');
                const before = await info(page); assert.ok(layout === 'desktop' ? before.role === 'menuitemcheckbox' : before.type === 'checkbox', JSON.stringify(before));
                await patch(page, {dataState});
                const state = await cleared(page); assert.equal(state.menus, 0); assert.equal(state.dialogs, 0); assert.equal(state.portals, 0);
                const focus = await page.evaluate(() => { const node = window.active(); return {role: node?.getAttribute('role'), name: node?.textContent?.trim().slice(0, 40), inCalendar: !!window.composedClosest(node, '.nc-calendar')}; });
                assert.equal(focus.role, 'region'); assert.ok(focus.name.startsWith(region), JSON.stringify(focus)); assert.ok(focus.inCalendar);
                assert.equal(await selector(page).isDisabled(), true); assert.equal(await selector(page).getAttribute('aria-expanded'), 'false');
                await press(page, ' '); await press(page, 'Enter'); await selector(page).click({force: true}); await settle(page);
                assert.equal((await snap(page)).menus + (await snap(page)).dialogs, 0); assert.deepEqual(await events(page, 'sources'), []);
                await patch(page, {dataState: {status: 'ready'}});
                const after = await snap(page); assert.equal(after.menus + after.dialogs, 0, 'nothing reopens when content returns');
                assert.equal(await selector(page).isDisabled(), false);
                if (rootScope === 'document') await screenshot(page, `document-${layout}-${phase}-closed-selector`);
            });
        }
        // §10.3.4: undefined and null are the same absent container; §11.3: the document is observed only while an overlay is open.
        await scenario(`§10.3.4 ${rootScope}: undefined ↔ null keeps the open agenda popover and source menu (review 2026-10-09-1)`,
            {root: rootScope, options: filtered({layout: 'desktop'})}, async page => {
            await cell(page).focus(); await press(page, 'Enter'); assert.equal((await snap(page)).dialogs, 1);
            await patch(page, {portalContainer: null}); await patch(page, {portalContainer: undefined}); assert.equal((await snap(page)).dialogs, 1, 'the agenda stays open');
            await selector(page).focus(); await press(page, 'Enter'); assert.equal((await snap(page)).menus, 1);
            await patch(page, {portalContainer: null}); await patch(page, {portalContainer: undefined});
            assert.equal((await snap(page)).menus, 1, 'the menu stays open'); assert.equal((await info(page)).role, 'menuitemcheckbox');
        });
        await scenario(`§11.3 ${rootScope}: a closed Calendar keeps no document observer; one observer exists only while a package overlay is open (review 2026-10-09-1)`,
            {root: rootScope, viewport: {width: 420, height: 860}, options: filtered({layout: 'mobile'}), init: () => {
                const Native = window.MutationObserver; window.__portalObservers = new Set(); window.__packageObservers = new Set();
                // Review 2026-10-09-1 fix 2 (C2): every subtree observer the package bundle creates (its code runs from the data: URL;
                // the probe's own live-region log runs from evaluated page scripts), not only the portal observer. Observers of a
                // single element (React Aria watches the `disabled` attribute of a focused button) are not tree observers.
                window.MutationObserver = class extends Native {
                    constructor(callback) { super(callback); this.__package = /data:text\/javascript/.test(new Error().stack ?? ''); }
                    observe(target, options) {
                        if (options?.attributeFilter?.join() === 'aria-modal,open') window.__portalObservers.add(this);
                        if (this.__package && options?.subtree) window.__packageObservers.add(this);
                        super.observe(target, options);
                    }
                    disconnect() { window.__portalObservers.delete(this); window.__packageObservers.delete(this); super.disconnect(); }
                };
            }}, async page => {
            const count = () => page.evaluate(() => window.__portalObservers.size);
            const trees = () => page.evaluate(() => window.__packageObservers.size);
            assert.equal(await count(), 0, 'closed after hydration'); assert.equal(await trees(), 0, 'no package tree observer on a closed Calendar without aria-labelledby');
            await page.evaluate(() => { for (let i = 0; i < 50; i++) document.body.append(document.createElement('span')); }); await settle(page);
            assert.equal(await trees(), 0, 'still none after 50 unrelated mutations');
            await selector(page).click(); await settle(page); assert.equal(await count(), 1, 'source sheet open');
            await press(page, 'Escape'); await cleared(page); assert.equal(await count(), 0); assert.equal(await trees(), 0, 'none after the source sheet closed');
            await trigger(page, 'report').click(); await settle(page); assert.equal(await count(), 1, 'item action sheet open');
            await press(page, 'Escape'); await cleared(page); assert.equal(await count(), 0); assert.equal(await trees(), 0, 'none after the item action sheet closed');
            // Focus is back on the item's action trigger in the inline agenda, so the switch migrates it into a popover (§11.3).
            await patch(page, {layout: 'desktop'}); assert.equal((await info(page)).presentation, 'popover');
            assert.deepEqual([await count(), await trees()], [1, 1], 'only the portal observer of the migrated popover');
            await cell(page).focus(); await press(page, 'Enter'); assert.equal(await count(), 1, 'agenda popover open'); assert.equal(await trees(), 1, 'only the portal observer while the popover is open');
            await press(page, 'Escape'); assert.equal(await count(), 0); assert.equal(await trees(), 0, 'none after the popover closed');
        });
    }
} finally { await browser.close(); }
const paths = ['src/v02/core/actions.ts', 'src/v02/core/sources.ts', 'src/v02/core/validation.ts', 'src/v02/core/overlayStack.ts', 'src/v02/calendar/overlays.tsx',
    'src/v02/calendar/SourceSelector.tsx', 'src/v02/calendar/CalendarMonth.tsx', 'src/v02/calendar/CalendarShell.tsx', 'src/v02/calendar/DayAgendaBody.tsx', 'src/v02/calendar/model.ts',
    'src/v02/calendar/useCalendarController.ts', 'src/v02/calendar/portal.ts', 'src/v02/calendar/useRootName.ts', 'src/v02/calendar/focus.ts', 'src/v02/calendar/dom.ts', 'src/v02/calendar/modality.ts',
    'src/v02/primitives/NonModalPopover.tsx', 'src/v02/primitives/ModalSheet.tsx', 'src/v02/primitives/overlays.tsx', 'src/v02/primitives/controls.tsx', 'src/v02/primitives/PortalTheme.tsx',
    'src/v02/surface.ts', 'src/v02/public.ts', 'src/v02/styles.css', 'src/index.ts', 'src/Calendar.tsx',
    'scripts/implementation/actions-sources-entry.tsx', 'scripts/implementation/actions-sources-probe.mjs', 'package.json', 'package-lock.json', 'scripts/implementation/spikes/package-lock.json'];
const report = {capturedAt: new Date().toISOString(), outcome: !only && checks.length > 0 && checks.every(c => c.outcome === 'pass') && !errors.length && !consoleErrors.length ? 'pass' : 'fail',
    filter: only ? String(only) : null, node: process.version, browser: version, react: 'bundled from the root lockfile, development build', checks, errors, consoleErrors,
    scope: 'T17 generic item actions and controlled sources through the public Calendar (development StrictMode, SSR + hydration) in Document and open ShadowRoot root scopes with the default body portal, LTR en-US and RTL ar: R27.1 delayed filter acceptance on the desktop menu and on native mobile checkboxes, R39 measured auto-layout switch of the standalone selector both ways and external focus, R41 alpha.2 parts (named item/source sheets, empty set and fewer than two sources), R37 on public menus, §5.5 latest committed set and separate trigger, §12.4 live routing into the source sheet, spec v8 §12.3 (2026-10-22) focus return to the selector trigger on every close path. The move part of R27/R41 (beta.1, T24), manual AT, Firefox/Safari and physical devices are out of scope.',
    sourceHashes: Object.fromEntries(paths.map(path => [path, existsSync(resolve(root, path)) ? createHash('sha256').update(readFileSync(resolve(root, path))).digest('hex') : 'missing']))};
writeFileSync(resolve(output, 'browser.json'), JSON.stringify(report, null, 2) + '\n');
console.log(`Actions/sources: ${checks.filter(c => c.outcome === 'pass').length}/${checks.length}; ${errors.length} page errors; ${consoleErrors.length} console errors; ${output}`);
if (report.outcome === 'fail') process.exitCode = 1;
