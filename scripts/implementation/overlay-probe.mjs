import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, resolve} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {build} from 'vite';

// T16 real-Chrome probe: the overlay ownership tree, portal scope (2×2 Document/ShadowRoot), the portal theme
// mirror and live routing — rows R37, R42, R48, R52, R53 and the portal part of R54 — through the public
// Calendar in development StrictMode, with server render + hydration. Since T17 the child menus are the public item
// actions (getItemActions/onItemActionRequest); the entry's private seam only forces the presentation (menu or sheet) that
// the layout would choose. Usage: node scripts/implementation/overlay-probe.mjs <outputDir>
const here = dirname(fileURLToPath(import.meta.url)), root = resolve(here, '../..');
const output = resolve(process.argv[2] ?? resolve(tmpdir(), 'calendar-overlay'));
mkdirSync(output, {recursive: true});
const directory = mkdtempSync(resolve(tmpdir(), 'calendar-overlay-'));
await build({configFile: false, logLevel: 'error', define: {'process.env.NODE_ENV': '"development"'}, mode: 'development',
    build: {outDir: directory, minify: false, lib: {entry: resolve(here, 'overlay-entry.tsx'), formats: ['es'], fileName: () => 'index.mjs'}}});
const esm = await import(pathToFileURL(resolve(directory, 'index.mjs')));
const moduleUrl = 'data:text/javascript;base64,' + readFileSync(resolve(directory, 'index.mjs')).toString('base64');
const css = readFileSync(resolve(root, 'src/v02/styles.css'), 'utf8');
const mirrored = [...esm.mirroredVariables, ...esm.mirroredFontProperties];
const {chromium} = await import('./spikes/node_modules/playwright/index.mjs');
const browser = await chromium.launch({channel: 'chrome', headless: true});
const checks = [], errors = [], consoleErrors = [], warnings = [], version = browser.version();
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
const withoutBeta = samples.filter(item => item.id !== 'beta');
// Public trigger and menu names isolate the item title with FSI/PDI (§12.4); a sheet is named by its visible heading.
const titles = Object.fromEntries(samples.map(item => [item.id, item.title]));
// The trigger is found by its row, so the scenarios with a Russian catalog (R52) find it too; English names are asserted.
const actionsLabel = id => `Actions for \u2068${titles[id]}\u2069`, triggerSelector = id => `[data-item-id="${id}"] > button[data-agenda-control="actions"]`;
const sheetName = id => `Actions for ${titles[id]}`;
const settle = page => page.evaluate(async () => { for (let i = 0; i < 6; i++) await new Promise(requestAnimationFrame); });
const patch = async (page, props, which = 'cal') => { await page.evaluate(({props, which}) => window[which].patch(props), {props, which}); await settle(page); };
const cell = (page, date = '2026-03-04', owner = '#owner') => page.locator(`${owner} [role=gridcell][data-date="${date}"]`);
const info = page => page.evaluate(() => window.info());
const snap = page => page.evaluate(() => window.snapshot());
const open = async (page, date = '2026-03-04', owner = '#owner') => { await cell(page, date, owner).focus(); await page.keyboard.press('Enter'); await settle(page); };
const openMenu = async (page, item = 'beta') => { await page.locator(triggerSelector(item)).focus(); await page.keyboard.press('Enter'); await settle(page); };
const press = async (page, key) => { await page.keyboard.press(key); await settle(page); };

/**
 * `root`: Calendar root scope ('document' | 'shadow'); `portal`: 'body' (default owner body), 'shadow' (explicit
 * connected ShadowRoot) or 'element' (explicit Element). styles.css is loaded in exactly the affected tree scopes.
 */
async function setup({root: rootScope = 'document', portal = 'body', options = {}, second, viewport = {width: 1200, height: 900}, colorScheme = 'light', extraCss = ''}) {
    const context = await browser.newContext({viewport, locale: 'en-US', hasTouch: true, colorScheme});
    const page = await context.newPage();
    page.setDefaultTimeout(4000);
    page.on('pageerror', error => errors.push(String(error)));
    page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); if (message.type() === 'warning') warnings.push(message.text()); });
    const server = esm.serverOverlay(options).html, secondServer = second ? esm.serverOverlay(second).html : '';
    await page.setContent(`<style>body{margin:0;font:16px/1.4 system-ui;background:#f5f4f1}#outside,#after{margin:8px}
        #owner,#owner2{font:italic 15px/1.6 Georgia,serif;letter-spacing:.5px}${extraCss}</style>
        <button id="outside">Outside</button><p id="blank">Blank area</p><div id="owner"></div><div id="owner2"></div><button id="after">After</button>
        <div id="portal-a"></div><div id="portal-b"></div>`);
    await page.evaluate(async ({rootScope, portal, moduleUrl, css, server, secondServer, options, second, mirrored}) => {
        const addCss = scope => { const style = document.createElement('style'); style.textContent = css; style.dataset.nc = 'styles.css'; (scope === document ? document.head : scope).append(style); };
        const host = document.getElementById('owner'), scope = rootScope === 'shadow' ? host.attachShadow({mode: 'open'}) : host;
        const container = portal === 'shadow' ? document.getElementById('portal-a').attachShadow({mode: 'open'}) : portal === 'element' ? document.getElementById('portal-a') : null;
        for (const target of new Set([rootScope === 'shadow' ? scope : document, portal === 'shadow' ? container : document, ...(second ? [document] : [])])) addCss(target);
        window.scope = scope; window.portalA = container;
        window.deep = selector => { const out = new Set(); const visit = node => { for (const element of node.querySelectorAll(selector)) out.add(element); for (const element of node.querySelectorAll('*')) if (element.shadowRoot) visit(element.shadowRoot); }; visit(document); return [...out]; };
        window.active = () => { let node = document.activeElement; while (node?.shadowRoot?.activeElement) node = node.shadowRoot.activeElement; return node; };
        window.composedClosest = (node, selector) => { for (let current = node; current; current = current.assignedSlot ?? current.parentElement ?? current.getRootNode().host) if (current.matches?.(selector)) return current; return null; };
        window.info = () => {
            const node = window.active();
            return {id: node?.id || undefined, date: node?.dataset?.date, item: node?.closest?.('[data-item-id]')?.dataset.itemId, control: node?.dataset?.agendaControl,
                role: node?.getAttribute?.('role') ?? undefined, label: node?.getAttribute?.('aria-label') ?? undefined, tag: node?.tagName, close: !!node?.hasAttribute?.('data-agenda-close'),
                presentation: node?.closest?.('[data-presentation]')?.dataset.presentation, menu: !!node?.closest?.('[role=menu]')};
        };
        window.calendars = () => window.deep('.nc-calendar');
        window.portals = () => window.deep('.nc-theme').filter(node => !node.classList.contains('nc-calendar'));
        window.snapshot = () => ({dialogs: window.deep('[role=dialog]').length, menus: window.deep('[role=menu]').length, modal: window.deep('[aria-modal=true]').length,
            inert: window.deep('[inert]').length, overflow: document.documentElement.style.overflow, backdrops: window.deep('.nc-backdrop').length, portals: window.portals().length,
            presentations: window.deep('[data-presentation]').map(node => `${node.dataset.presentation}@${node.dataset.date}`), controls: window.deep('[aria-controls]').length});
        /** Names whose resolved value differs between a portal theme root and its owner Calendar root. */
        window.mismatch = (portalRoot, owner) => { const a = getComputedStyle(portalRoot), b = getComputedStyle(owner); return mirrored.filter(name => a.getPropertyValue(name).trim() !== b.getPropertyValue(name).trim()); };
        window.ownerRoot = () => window.calendars()[0];
        // Reveal checkpoint: when a portal theme root first becomes observable it was hidden until mirrored.
        window.reveals = [];
        const watch = target => new MutationObserver(records => {
            for (const record of records) for (const node of record.addedNodes) if (node.nodeType === 1) for (const theme of [node, ...node.querySelectorAll('.nc-theme')]) {
                if (!theme.matches('.nc-theme') || theme.matches('.nc-calendar')) continue;
                const wasHidden = records.some(entry => entry.type === 'attributes' && entry.target === theme && /visibility: hidden/.test(entry.oldValue ?? ''));
                window.reveals.push({className: theme.className, wasHidden, visibility: getComputedStyle(theme).visibility, mismatch: window.mismatch(theme, window.owners?.(theme) ?? window.ownerRoot())});
            }
        }).observe(target, {childList: true, subtree: true, attributes: true, attributeFilter: ['style'], attributeOldValue: true});
        for (const target of new Set([document.body, ...(container instanceof ShadowRoot ? [container] : [])])) watch(target);
        // Focus checkpoint: initial focus inside a portal already sees the mirrored values.
        const focus = HTMLElement.prototype.focus; window.focusLog = [];
        HTMLElement.prototype.focus = function (focusOptions) {
            const theme = this.closest('.nc-theme');
            if (theme && !theme.matches('.nc-calendar')) window.focusLog.push({visibility: getComputedStyle(theme).visibility, mismatch: window.mismatch(theme, window.owners?.(theme) ?? window.ownerRoot())});
            return focus.call(this, focusOptions);
        };
        // Live log: every child-list write to a live endpoint, its location and composed inertness.
        window.live = [];
        const liveWatch = target => new MutationObserver(records => {
            for (const record of records) {
                const endpoint = record.target;
                if (!endpoint.matches?.('[role=status], [role=alert]') || !record.addedNodes.length) continue;
                // The agenda sheet's endpoints live in its dialog section; a child sheet's in its own modal surface.
                const agenda = endpoint.closest('section[data-date]'), sheet = endpoint.closest('.nc-sheet'), calendar = window.composedClosest(endpoint, '.nc-calendar');
                window.live.push({where: agenda && sheet ? `sheet:${agenda.dataset.date}` : sheet ? 'sheet:child' : calendar?.id ?? 'unknown', role: endpoint.getAttribute('role'),
                    text: [...record.addedNodes].map(node => node.textContent).join(''), inert: !!window.composedClosest(endpoint, '[inert]')});
            }
        }).observe(target, {childList: true, subtree: true});
        const module = await import(moduleUrl);
        const mount = async (owner, html, props) => { const fixture = document.createElement('div'); fixture.className = 'fixture'; fixture.innerHTML = html; owner.append(fixture); return module.hydrateOverlay(fixture, props); };
        window.cal = await mount(scope, server, {...options, ...(container ? {portalContainer: container} : {})});
        if (second) window.cal2 = await mount(document.getElementById('owner2'), secondServer, second);
        window.owners = theme => { const roots = window.calendars(); return roots.length < 2 ? roots[0] : roots.find(node => node.dataset.layout && theme.getAttribute('data-dir') === node.getAttribute('data-dir') && theme.getAttribute('lang') === node.getAttribute('lang')) ?? roots[0]; };
        for (const target of new Set([document.body, scope instanceof ShadowRoot ? scope : document.body, ...(container instanceof ShadowRoot ? [container] : [])])) liveWatch(target);
    }, {rootScope, portal, moduleUrl, css, server, secondServer, options, second, mirrored});
    await settle(page);
    return {page, context};
}
async function scenario(name, config, body) {
    if (only && !only.test(name)) return;
    await check(name, async () => {
        const fixture = await setup(config);
        try {
            assert.deepEqual(await fixture.page.evaluate(() => [...window.cal.errors, ...(window.cal2?.errors ?? [])]), [], 'hydration must not recover from mismatches');
            return await body(fixture.page, fixture);
        } finally { await fixture.context.close(); }
    });
}
/** Every aria-controls points to a connected node of the same tree scope. */
const dangling = page => page.evaluate(() => window.deep('[aria-controls]').filter(node => {
    const target = node.getRootNode().getElementById?.(node.getAttribute('aria-controls'));
    return !target || !target.isConnected || target.getRootNode() !== node.getRootNode();
}).length);
const cleared = async page => { const state = await snap(page); assert.equal(state.inert, 0, 'no inert left'); assert.equal(state.overflow, '', 'scroll lock released'); assert.equal(state.backdrops, 0); return state; };

try {
    // ——— R52 / R42 / R54: 2×2 tree scopes ———
    for (const rootScope of ['document', 'shadow']) for (const portal of ['body', 'shadow']) {
        const label = `${rootScope} root → ${portal === 'body' ? 'default body' : 'ShadowRoot'} portal`;
        const sameTree = rootScope === 'document' && portal === 'body';
        await scenario(`R52/R42/R54 ${label}: root and popover fully styled, mirrored before reveal and focus; scoped IDREF; focus kept`, {root: rootScope, portal,
            extraCss: '.nc-calendar{outline:3px solid rgb(255, 0, 0)}',
            options: {items: samples, layout: 'desktop', density: 'comfortable', colorScheme: 'dark', tokens: {color: {accent: 'rgb(200, 10, 20)'}},
                style: {'--nelmad-calendar-radii-lg': '18px', '--consumer-private': '7px'}}}, async page => {
            await open(page);
            const state = await page.evaluate(() => {
                const theme = window.deep('.nc-agenda-popover')[0], calendar = window.ownerRoot(), a = getComputedStyle(theme), b = getComputedStyle(calendar);
                return {mismatch: window.mismatch(theme, calendar), attributes: ['data-theme', 'data-density', 'data-color-scheme', 'data-dir', 'dir', 'lang'].map(name => [theme.getAttribute(name), calendar.getAttribute(name)]),
                    background: a.backgroundColor, radius: a.borderTopLeftRadius, shadow: a.boxShadow, font: [a.fontFamily, a.fontSize, a.fontStyle, a.letterSpacing, a.lineHeight],
                    rootFont: [b.fontFamily, b.fontSize, b.fontStyle, b.letterSpacing, b.lineHeight], rootDisplay: b.display, rootPadding: b.paddingTop, rootBackground: b.backgroundColor,
                    private: theme.style.getPropertyValue('--consumer-private') + a.getPropertyValue('--consumer-private'), outline: a.outlineStyle,
                    scope: theme.getRootNode() === document ? 'document' : 'shadow', inBody: !!window.composedClosest(theme, 'body') && !window.composedClosest(theme, '.nc-calendar'),
                    portalHost: theme.getRootNode() === window.portalA, reveals: window.reveals, focusLog: window.focusLog};
            });
            assert.deepEqual(state.mismatch, [], 'all 27 public variables and 7 font properties equal the owner root');
            for (const [portalValue, rootValue] of state.attributes) assert.equal(portalValue, rootValue);
            assert.equal(state.rootDisplay, 'flex'); assert.equal(state.rootPadding, '16px'); assert.equal(state.rootBackground, 'rgb(34, 32, 31)', 'root dark surface');
            assert.equal(state.background, 'rgb(34, 32, 31)', 'explicit dark reaches the portal (R54)'); assert.equal(state.radius, '18px'); assert.notEqual(state.shadow, 'none');
            assert.deepEqual(state.font, state.rootFont); assert.match(state.font[0], /Georgia/);
            assert.equal(state.private, '', 'a non-public custom property is not copied'); assert.equal(state.outline, 'none', 'element rules of the root are not copied');
            assert.equal(state.scope, portal === 'shadow' ? 'shadow' : 'document'); assert.equal(state.portalHost, portal === 'shadow'); assert.equal(state.inBody, true);
            assert.ok(state.reveals.length >= 1 && state.reveals.every(entry => entry.wasHidden && entry.visibility === 'visible' && !entry.mismatch.length), JSON.stringify(state.reveals));
            assert.ok(state.focusLog.length >= 1 && state.focusLog.every(entry => entry.visibility === 'visible' && !entry.mismatch.length), JSON.stringify(state.focusLog));
            assert.equal(await cell(page).getAttribute('aria-haspopup'), 'dialog'); assert.equal(await cell(page).getAttribute('aria-expanded'), 'true');
            assert.equal(!!await cell(page).getAttribute('aria-controls'), sameTree, 'aria-controls only within one tree scope'); assert.equal(await dangling(page), 0);
            assert.equal(await page.getByRole('dialog', {name: 'Events for Mar 4, 2026'}).count(), 1, 'the agenda keeps its own name');
            if (rootScope === 'document' && portal === 'body') await page.screenshot({path: resolve(output, 'document-body-dark-popover.png')});
            assert.equal((await info(page)).close, true); await press(page, 'Tab'); assert.equal((await info(page)).item, 'alpha');
            await press(page, 'Escape'); assert.equal((await info(page)).date, '2026-03-04');
            assert.equal(await cell(page).getAttribute('aria-controls'), null); assert.equal(await cell(page).getAttribute('aria-expanded'), 'false');
            assert.equal((await snap(page)).portals, 0, 'no orphan portal');
            return {reveals: state.reveals.length, focusChecks: state.focusLog.length};
        });
        await scenario(`R52/R54 ${label}: modal sheet fully styled; inert, scroll lock and containment in every scope`, {root: rootScope, portal, viewport: {width: 420, height: 800},
            options: {items: samples, layout: 'mobile', agendaPresentation: 'overlay', colorScheme: 'dark', dir: 'rtl', locale: 'ar'}}, async page => {
            await cell(page).click(); await settle(page);
            const state = await page.evaluate(() => {
                const backdrop = window.deep('.nc-sheet-backdrop')[0], sheet = window.deep('.nc-sheet')[0], calendar = window.ownerRoot();
                return {mismatch: window.mismatch(backdrop, calendar), position: getComputedStyle(backdrop).position, backdrop: getComputedStyle(backdrop).backgroundColor,
                    surface: getComputedStyle(sheet).backgroundColor, dir: backdrop.getAttribute('dir'), scheme: backdrop.dataset.colorScheme, rootInert: !!window.composedClosest(calendar, '[inert]'),
                    outsideInert: document.getElementById('outside').inert, sheetInert: !!window.composedClosest(sheet, '[inert]'), bottom: Math.round(sheet.getBoundingClientRect().bottom),
                    reveals: window.reveals, focusLog: window.focusLog};
            });
            assert.deepEqual(state.mismatch, []); assert.equal(state.position, 'fixed'); assert.equal(state.backdrop, 'rgba(0, 0, 0, 0.4)');
            assert.equal(state.surface, 'rgb(34, 32, 31)'); assert.equal(state.dir, 'rtl'); assert.equal(state.scheme, 'dark');
            assert.equal(state.rootInert, true); assert.equal(state.outsideInert, true); assert.equal(state.sheetInert, false); assert.equal(state.bottom, 800);
            assert.ok(state.reveals.every(entry => entry.wasHidden && !entry.mismatch.length) && state.focusLog.every(entry => !entry.mismatch.length && entry.visibility === 'visible'));
            assert.equal((await snap(page)).overflow, 'hidden'); assert.equal((await info(page)).tag, 'H3');
            for (let i = 0; i < 5; i++) { await press(page, 'Tab'); assert.ok((await info(page)).presentation === 'sheet', 'Tab stays inside the sheet'); }
            assert.equal(await cell(page).getAttribute('aria-controls') !== null, sameTree); assert.equal(await dangling(page), 0);
            await press(page, 'Escape'); assert.equal((await info(page)).date, '2026-03-04'); await cleared(page);
            if (rootScope === 'shadow' && portal === 'shadow') { await cell(page).click(); await settle(page); await page.screenshot({path: resolve(output, 'shadow-shadow-rtl-dark-sheet.png')}); }
        });
    }
    await check('R52 control: without styles.css in the portal tree scope the popover is unstyled (integration error, not a fallback)', async () => {
        const {page, context} = await setup({root: 'shadow', portal: 'body', options: {items: samples, layout: 'desktop'}});
        try {
            await page.evaluate(() => document.head.querySelector('[data-nc]').remove()); await open(page);
            const state = await page.evaluate(() => { const theme = window.deep('.nc-agenda-popover')[0]; return {radius: getComputedStyle(theme).borderTopLeftRadius, shadow: getComputedStyle(theme).boxShadow}; });
            assert.equal(state.radius, '0px'); assert.equal(state.shadow, 'none');
        } finally { await context.close(); }
    });
    await scenario('R52: two calendars keep theme, density, color scheme, dir and lang per instance in their portals', {
        options: {items: samples, layout: 'desktop', id: 'first'},
        second: {items: samples, layout: 'desktop', id: 'second', locale: 'ar', density: 'comfortable', colorScheme: 'dark', tokens: {color: {accent: 'rgb(1, 120, 2)'}}}}, async page => {
        // §10.3.4: the portal theme root repeats its owner root's attributes, including the root `lang` (the label language),
        // while the agenda content keeps the date-formatting language below it.
        const names = ['data-theme', 'data-density', 'data-color-scheme', 'data-dir', 'dir', 'lang'];
        const read = () => page.evaluate(names => { const theme = window.deep('.nc-agenda-popover')[0], [first, second] = window.calendars();
            return {mismatchFirst: window.mismatch(theme, first), mismatchSecond: window.mismatch(theme, second), attributes: names.map(name => theme.getAttribute(name)),
                first: names.map(name => first.getAttribute(name)), second: names.map(name => second.getAttribute(name)), content: window.deep('[role=dialog]')[0].getAttribute('lang')}; }, names);
        await open(page); let state = await read();
        assert.deepEqual(state.attributes, state.first); assert.deepEqual(state.mismatchFirst, []); assert.ok(state.mismatchSecond.length > 0);
        assert.deepEqual(state.attributes, ['classic', 'compact', 'system', 'ltr', 'ltr', 'en-US']); assert.equal(state.content, 'en-US');
        await press(page, 'Escape'); await open(page, '2026-03-04', '#owner2'); state = await read();
        assert.deepEqual(state.attributes, state.second); assert.deepEqual(state.mismatchSecond, []); assert.ok(state.mismatchFirst.includes('--nelmad-calendar-color-accent'));
        // locale 'ar' has no catalog: the root label, and so the root lang, is the en-US fallback; dates format in ar.
        assert.deepEqual(state.attributes, ['classic', 'comfortable', 'dark', 'rtl', 'rtl', 'en-US']); assert.equal(state.content, 'ar');
        return {first: state.first, second: state.second};
    });
    for (const [locale, messagesLocale, lang] of [['ar', undefined, 'en-US'], ['de-DE', undefined, 'en-US'], ['en-US', 'ru-RU', 'ru-RU'], ['ru-RU', undefined, 'ru-RU']]) {
        const props = {locale, ...(messagesLocale ? {messagesLocale} : {})};
        await scenario(`R52: locale ${locale}${messagesLocale ? ` + messagesLocale ${messagesLocale}` : ''}: popover, sheet and child menu theme roots carry the root lang ${lang}, not the formatting locale`, {
            viewport: {width: 1200, height: 900}, options: {items: samples, layout: 'desktop', menus: 'menu', controlled: true, ...props}}, async page => {
            const read = () => page.evaluate(() => ({root: window.ownerRoot().getAttribute('lang'), portals: window.portals().map(node => node.getAttribute('lang')),
                content: window.deep('[role=dialog]').map(node => node.getAttribute('lang'))}));
            await open(page); await openMenu(page); let state = await read();
            assert.equal(state.root, lang); assert.deepEqual(state.portals, [lang, lang], 'agenda popover and child menu'); assert.deepEqual(state.content, [locale]);
            await press(page, 'Escape'); await press(page, 'Escape');
            await patch(page, {layout: 'mobile', agendaPresentation: 'overlay'}); await open(page); state = await read();
            assert.equal(state.root, lang); assert.ok(state.portals.length >= 1); assert.deepEqual([...new Set(state.portals)], [lang], 'sheet backdrop/theme root'); assert.deepEqual(state.content, [locale]);
            await press(page, 'Escape'); await cleared(page);
            return state;
        });
    }
    await scenario('R52 mirror checkpoints: owner commit, root resize, window resize and media change refresh only changed values, without a loop', {viewport: {width: 1200, height: 900},
        extraCss: '#owner .fixture{container-type:inline-size;width:1000px}@container (min-width: 1100px){.nc-calendar{--nelmad-calendar-spacing-md:22px}}@media (min-width: 1300px){.nc-calendar{--nelmad-calendar-radii-md:3px}}',
        options: {items: samples, colorScheme: 'system'}}, async page => {
        await open(page);
        await page.evaluate(() => { const theme = window.portals()[0]; window.styleWrites = 0; new MutationObserver(records => { window.styleWrites += records.length; }).observe(theme, {attributes: true, attributeFilter: ['style']}); });
        const value = name => page.evaluate(name => window.portals()[0].style.getPropertyValue(name), name);
        const writes = () => page.evaluate(() => window.styleWrites);
        await settle(page); await settle(page); assert.equal(await writes(), 0, 'an idle open portal is not rewritten (no render/resize loop)');
        await patch(page, {tokens: {color: {accent: 'rgb(9, 8, 7)'}}}); assert.equal(await value('--nelmad-calendar-color-accent'), 'rgb(9, 8, 7)');
        const afterCommit = await writes(); assert.equal(afterCommit, 1, 'one changed value, one write');
        await page.evaluate(() => { document.querySelector('#owner .fixture').style.width = '1150px'; }); await settle(page);
        assert.equal(await value('--nelmad-calendar-spacing-md'), '22px', 'root resize checkpoint');
        await page.setViewportSize({width: 1400, height: 900}); await settle(page); assert.equal(await value('--nelmad-calendar-radii-md'), '3px', 'window resize checkpoint');
        const light = await value('--nelmad-calendar-color-surface'); await page.emulateMedia({colorScheme: 'dark'}); await settle(page);
        const dark = await value('--nelmad-calendar-color-surface'); assert.notEqual(dark, light); assert.equal(dark, '#22201f', 'prefers-color-scheme checkpoint');
        assert.deepEqual(await page.evaluate(() => window.mismatch(window.portals()[0], window.ownerRoot())), []);
        const total = await writes(); await settle(page); await settle(page); assert.equal(await writes(), total, 'no further writes after the checkpoints');
        return {writes: total};
    });

    // ——— R37: menu inside the agenda, removed trigger, two Escapes ———
    for (const rootScope of ['document', 'shadow']) for (const locale of ['en-US', 'ar']) {
        const label = `${rootScope}, ${locale === 'ar' ? 'RTL ar' : 'LTR en-US'}`;
        await scenario(`R37 ${label}: popover → menu; the removed trigger's menu closes on the first Escape inside the agenda, the second closes the agenda`, {root: rootScope,
            options: {items: samples, layout: 'desktop', locale, controlled: true, menus: 'menu'}}, async page => {
            await open(page); await openMenu(page);
            let state = await snap(page); assert.equal(state.menus, 1); assert.equal(state.dialogs, 1);
            assert.deepEqual([(await info(page)).role, (await info(page)).menu], ['menuitem', true]);
            const trigger = page.locator(triggerSelector('beta'));
            assert.equal(await trigger.getAttribute('aria-haspopup'), 'menu'); assert.equal(await trigger.getAttribute('aria-expanded'), 'true');
            assert.equal(await trigger.getAttribute('aria-controls'), await page.getByRole('menu', {name: actionsLabel('beta'), exact: true}).getAttribute('id')); assert.equal(await dangling(page), 0);
            await patch(page, {items: withoutBeta}); state = await snap(page);
            assert.equal(state.menus, 1, 'the menu is owned by the stack, not by the removed row'); assert.equal(await dangling(page), 0);
            await press(page, 'Escape'); state = await snap(page);
            assert.equal(state.menus, 0); assert.equal(state.dialogs, 1, 'the agenda stays open');
            assert.deepEqual([(await info(page)).item, (await info(page)).control], ['alpha', 'actions'], 'nearest control inside the agenda, not outside it');
            await press(page, 'Escape'); state = await snap(page);
            assert.equal(state.dialogs, 0); assert.equal((await info(page)).date, '2026-03-04'); assert.equal(state.portals, 0);
            if (rootScope === 'document') {
                await patch(page, {items: samples}); await open(page); await openMenu(page, 'alpha');
                if (locale === 'ar') await page.screenshot({path: resolve(output, 'document-ar-menu-in-agenda.png')});
                await press(page, 'Tab'); assert.deepEqual([(await info(page)).item, (await info(page)).control], ['beta', 'primary'], 'Tab continues after the trigger inside the agenda');
                await openMenu(page, 'alpha'); await press(page, 'Shift+Tab'); assert.deepEqual([(await info(page)).item, (await info(page)).control], ['alpha', 'primary']);
                await openMenu(page, 'beta'); await press(page, 'Tab'); assert.equal((await info(page)).id, 'after', 'the last trigger continues with the agenda logical exit');
                state = await snap(page); assert.equal(state.dialogs + state.menus, 0);
            }
        });
    }
    for (const rootScope of ['document', 'shadow']) {
        await scenario(`R37 ${rootScope}: external focus and outside presses never steal focus; a press inside the agenda closes only the menu`, {root: rootScope,
            options: {items: samples, layout: 'desktop', menus: 'menu'}}, async page => {
            await open(page); await openMenu(page); await page.getByRole('heading', {level: 3}).click(); await settle(page);
            let state = await snap(page); assert.equal(state.menus, 0); assert.equal(state.dialogs, 1);
            await openMenu(page); await page.evaluate(() => document.getElementById('outside').focus()); await settle(page);
            state = await snap(page); assert.equal(state.menus + state.dialogs, 0); assert.equal((await info(page)).id, 'outside');
            await open(page); await openMenu(page); await page.locator('#blank').click(); await settle(page);
            state = await snap(page); assert.equal(state.menus + state.dialogs, 0); assert.equal((await info(page)).date, '2026-03-04', 'a non-focusable outside press recovers by §12.3');
            await open(page); await openMenu(page); await page.locator('#after').click(); await settle(page); assert.equal((await info(page)).id, 'after');
            // The open menu's own trigger toggles it closed instead of dismiss-and-reopen.
            await open(page); const trigger = page.locator(triggerSelector('beta'));
            await trigger.click(); await settle(page); assert.equal((await snap(page)).menus, 1);
            await trigger.click(); await settle(page); assert.equal((await snap(page)).menus, 0); assert.deepEqual([(await info(page)).item, (await info(page)).control], ['beta', 'actions']);
            await press(page, 'Escape');
            assert.equal((await snap(page)).portals, 0);
        });
        await scenario(`R37/R38 ${rootScope}: sheet → modal child; reference-counted inert and scroll lock; trigger removal; two Escapes`, {root: rootScope, viewport: {width: 420, height: 800},
            options: {items: samples, layout: 'mobile', agendaPresentation: 'overlay', menus: 'sheet'}}, async page => {
            await cell(page).click(); await settle(page); await openMenu(page);
            const layers = () => page.evaluate(() => ({sheetInert: !!window.composedClosest(window.deep('.nc-sheet')[0], '[inert]'),
                childInert: !!window.composedClosest(window.deep('.nc-sheet')[1] ?? document.body, '[inert]'), rootInert: !!window.composedClosest(window.ownerRoot(), '[inert]'),
                overflow: document.documentElement.style.overflow, sheets: window.deep('.nc-sheet').length}));
            let state = await layers();
            assert.deepEqual(state, {sheetInert: true, childInert: false, rootInert: true, overflow: 'hidden', sheets: 2});
            assert.equal((await info(page)).label, undefined); assert.equal(await page.getByRole('dialog', {name: sheetName('beta'), exact: true}).count(), 1);
            assert.equal(await page.getByRole('button', {name: 'Open', exact: true}).evaluate(node => node === node.getRootNode().activeElement), true, 'first action focused');
            if (rootScope === 'document') await page.screenshot({path: resolve(output, 'document-nested-modal-child.png')});
            await patch(page, {items: withoutBeta}); assert.equal((await layers()).sheets, 2);
            await press(page, 'Escape'); state = await layers();
            assert.deepEqual(state, {sheetInert: false, childInert: false, rootInert: true, overflow: 'hidden', sheets: 1}, 'the parent sheet stays modal');
            assert.deepEqual([(await info(page)).item, (await info(page)).control, (await info(page)).presentation], ['alpha', 'actions', 'sheet']);
            await press(page, 'Escape'); assert.equal((await info(page)).date, '2026-03-04'); await cleared(page);
        });
        await scenario(`R38 ${rootScope}: focus in a portaled child menu during popover → sheet → popover keeps the logical trigger; children never orphan`, {root: rootScope,
            options: {items: samples, layout: 'desktop', controlled: true, menus: 'menu'}}, async page => {
            await open(page); await openMenu(page);
            await patch(page, {layout: 'mobile', agendaPresentation: 'overlay'}); let state = await snap(page);
            assert.equal(state.menus, 0); assert.deepEqual(state.presentations, ['sheet@2026-03-04']);
            assert.deepEqual([(await info(page)).item, (await info(page)).control, (await info(page)).presentation], ['beta', 'actions', 'sheet']);
            await patch(page, {layout: 'desktop'}); state = await snap(page);
            assert.deepEqual(state.presentations, ['popover@2026-03-04']); assert.equal(state.inert, 0); assert.equal(state.overflow, '');
            assert.deepEqual([(await info(page)).item, (await info(page)).control], ['beta', 'actions']);
            assert.deepEqual(await page.evaluate(() => window.cal.events.filter(event => event.type === 'agenda')), []);
        });
    }

    // ——— R42 / R37: inline agenda (in the Calendar tree scope) with a child portaled to the owner body ———
    for (const rootScope of ['document', 'shadow']) for (const menus of ['menu', 'sheet']) {
        await scenario(`R42/R37 ${rootScope} root, inline agenda → ${menus === 'menu' ? 'menu' : 'modal child sheet'} in the default body portal: aria-controls only in one tree scope, no dangling IDREF`
            + (menus === 'menu' ? '; a non-focusable outside press closes only the menu and recovers its trigger (§12.3 step 2)' : ''), {root: rootScope, viewport: {width: 420, height: 900},
            options: {items: samples, layout: 'mobile', agendaPresentation: 'auto', menus}}, async page => {
            await open(page); let state = await snap(page);
            assert.deepEqual(state.presentations, ['inline@2026-03-04']); assert.equal(state.portals, 0);
            await openMenu(page); state = await snap(page);
            const trigger = page.locator(triggerSelector('beta'));
            const child = await page.evaluate(() => { const node = window.deep('[id^="nc-overlay-"]')[0]; return node && {id: node.id, scope: node.getRootNode() === document ? 'document' : 'shadow'}; });
            assert.equal(child?.scope, 'document', 'the child is portaled to the owner body');
            assert.equal(await trigger.getAttribute('aria-expanded'), 'true');
            assert.equal(await trigger.getAttribute('aria-controls'), rootScope === 'document' ? child.id : null, 'aria-controls only while trigger and target share a tree scope');
            assert.equal(await dangling(page), 0);
            if (menus === 'menu') {
                assert.equal(state.menus, 1); assert.equal((await info(page)).role, 'menuitem');
                await page.locator('#blank').click(); await settle(page); state = await snap(page);
                assert.equal(state.menus, 0, 'the pointer press closes the menu'); assert.deepEqual(state.presentations, ['inline@2026-03-04'], 'the inline agenda stays');
                assert.deepEqual([(await info(page)).item, (await info(page)).control], ['beta', 'actions'], 'focus displaced to body returns to the trigger inside the parent');
            } else {
                assert.equal(await page.getByRole('dialog', {name: sheetName('beta'), exact: true}).count(), 1); assert.equal(state.overflow, 'hidden');
                await press(page, 'Escape'); assert.deepEqual([(await info(page)).item, (await info(page)).control], ['beta', 'actions']); await cleared(page);
            }
            assert.equal(await trigger.getAttribute('aria-controls'), null); assert.equal(await trigger.getAttribute('aria-expanded'), 'false'); assert.equal(await dangling(page), 0);
            assert.equal((await snap(page)).portals, 0, 'no orphan portal');
        });
    }

    // ——— R48: live routing with two calendars ———
    for (const rootScope of ['document', 'shadow']) {
        await scenario(`R48 ${rootScope}: during the modal sheet each event is written once to the owning sheet endpoint; the other calendar stays silent; closing returns to root`, {root: rootScope,
            viewport: {width: 420, height: 900}, options: {items: samples, layout: 'mobile', agendaPresentation: 'overlay', id: 'first'}, second: {items: samples, layout: 'mobile', id: 'second'}}, async page => {
            await cell(page).click(); await settle(page); await page.evaluate(() => { window.live = []; });
            const endpoints = () => page.evaluate(() => window.calendars().sort((a, b) => a.id.localeCompare(b.id)).map(calendar => ({id: calendar.id, text: [...calendar.querySelectorAll('[role=status], [role=alert]')].map(node => node.textContent).join(''),
                inert: !!window.composedClosest(calendar.querySelector('[role=status]'), '[inert]')})));
            // A refresh start writes nothing (QA-D-3-03); its completion is the routed event.
            await patch(page, {dataState: {status: 'loading', phase: 'refresh'}});
            await patch(page, {dataState: {status: 'ready'}});
            let log = await page.evaluate(() => window.live);
            assert.deepEqual(log, [{where: 'sheet:2026-03-04', role: 'status', text: 'Calendar refreshed', inert: false}]);
            assert.deepEqual(await endpoints(), [{id: 'first', text: '', inert: true}, {id: 'second', text: '', inert: true}], 'background endpoints are empty and inert');
            await press(page, 'Escape'); log = await page.evaluate(() => window.live);
            assert.equal(log.length, 1, 'closing does not re-announce'); await cleared(page);
            await patch(page, {dataState: {status: 'loading', phase: 'refresh'}}); await patch(page, {dataState: {status: 'ready'}}); log = await page.evaluate(() => window.live);
            assert.deepEqual(log.slice(1), [{where: 'first', role: 'status', text: 'Calendar refreshed', inert: false}], 'after close the root endpoint is used');
            // Isolation: the other calendar writes nothing into its inert background during this modal and keeps no stale text after it.
            await cell(page).click(); await settle(page); await page.evaluate(() => { window.live = []; });
            await patch(page, {dataState: {status: 'loading', phase: 'refresh'}}, 'cal2');
            await patch(page, {dataState: {status: 'error', phase: 'refresh', error: {message: 'down'}}}, 'cal2');
            assert.deepEqual(await page.evaluate(() => window.live), [], 'the other calendar stays silent');
            await press(page, 'Escape'); await cleared(page);
            assert.deepEqual(await endpoints(), [{id: 'first', text: '', inert: false}, {id: 'second', text: '', inert: false}], 'no stale text after the modal');
            await patch(page, {dataState: {status: 'loading', phase: 'refresh'}}, 'cal2'); await patch(page, {dataState: {status: 'ready'}}, 'cal2');
            assert.deepEqual(await page.evaluate(() => window.live), [{where: 'second', role: 'status', text: 'Calendar refreshed', inert: false}]);
        });
    }
    await scenario('R48: a nested modal child is the single endpoint; an urgent refresh error goes there once', {viewport: {width: 420, height: 900},
        options: {items: samples, layout: 'mobile', agendaPresentation: 'overlay', id: 'first', menus: 'sheet'}, second: {items: samples, layout: 'mobile', id: 'second'}}, async page => {
        await cell(page).click(); await settle(page); await openMenu(page); await page.evaluate(() => { window.live = []; });
        await patch(page, {dataState: {status: 'error', phase: 'refresh', error: {message: 'down'}}});
        assert.deepEqual(await page.evaluate(() => window.live), [{where: 'sheet:child', role: 'alert', text: 'Could not load calendar', inert: false}]);
        await press(page, 'Escape'); await press(page, 'Escape'); await cleared(page);
        assert.equal((await page.evaluate(() => window.live)).length, 1);
    });

    await scenario('R48: opening a nested modal child clears the parent sheet endpoint; no stale text there once the child closes', {viewport: {width: 420, height: 900},
        options: {items: samples, layout: 'mobile', agendaPresentation: 'overlay', menus: 'sheet'}}, async page => {
        const sheet = () => page.evaluate(() => { const node = window.deep('section[data-date] [role=status]')[0];
            return {text: node.textContent, inert: !!window.composedClosest(node, '[inert]'), filled: window.deep('[role=status], [role=alert]').filter(entry => entry.textContent).length}; });
        await cell(page).click(); await settle(page);
        await patch(page, {dataState: {status: 'loading', phase: 'refresh'}}); assert.deepEqual(await sheet(), {text: '', inert: false, filled: 0}, 'a refresh start writes nothing');
        await patch(page, {dataState: {status: 'ready'}}); assert.deepEqual(await sheet(), {text: 'Calendar refreshed', inert: false, filled: 1});
        await patch(page, {dataState: {status: 'loading', phase: 'refresh'}});
        await openMenu(page); assert.deepEqual(await sheet(), {text: '', inert: true, filled: 0}, 'the background sheet endpoint is cleared while the child is the endpoint');
        await press(page, 'Escape'); assert.equal((await snap(page)).dialogs, 1);
        assert.deepEqual(await sheet(), {text: '', inert: false, filled: 0}, 'no stale text in the parent sheet after the child closes');
        await page.evaluate(() => { window.live = []; }); await patch(page, {dataState: {status: 'ready'}});
        assert.deepEqual(await page.evaluate(() => window.live), [{where: 'sheet:2026-03-04', role: 'status', text: 'Calendar refreshed', inert: false}]);
        await press(page, 'Escape'); await cleared(page);
    });

    // ——— T16-V3-01: a Calendar rendered from this realm into a same-origin iframe document ———
    // The module runs in the top window; the Calendar root's ownerDocument is the iframe document. Modal effects,
    // containment and Escape act there only: the parent document is never hidden or scroll-locked.
    for (const menus of [undefined, 'sheet']) {
        await check(`T16-V3-01 cross-realm iframe: modal effects of the sheet${menus ? ' and its modal child' : ''} (inert, scroll lock, containment, Escape) stay in the iframe document; the parent stays untouched and exposed; full cleanup`, async () => {
            const context = await browser.newContext({viewport: {width: 440, height: 900}, locale: 'en-US', hasTouch: true}), page = await context.newPage();
            page.setDefaultTimeout(4000);
            page.on('pageerror', error => errors.push(String(error)));
            page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
            try {
                const options = {items: samples, layout: 'mobile', agendaPresentation: 'overlay', ...(menus ? {menus} : {})};
                await page.setContent(`<style>body{margin:0;font:16px/1.4 system-ui}</style><button id="top-before">Top before</button>
                    <iframe id="frame" title="Embedded schedule" style="display:block;width:420px;height:800px;border:0"></iframe><button id="top-after">Top after</button><div style="height:1200px"></div>`);
                const errorsInFrame = await page.evaluate(async ({moduleUrl, css, server, options}) => {
                    const frame = document.getElementById('frame'), doc = frame.contentDocument;
                    doc.open(); doc.write('<!doctype html><html lang="en"><head></head><body><button id="before">Before</button><div id="fixture"></div><button id="after">After</button><div style="height:2000px"></div></body></html>'); doc.close();
                    const style = doc.createElement('style'); style.textContent = css; doc.head.append(style);
                    const fixture = doc.getElementById('fixture'); fixture.innerHTML = server;
                    const module = await import(moduleUrl);
                    window.cal = await module.hydrateOverlay(fixture, options);
                    window.frameState = () => {
                        const inner = frame.contentDocument, sheets = [...inner.querySelectorAll('.nc-sheet')], hiddenIn = node => !!node?.closest('[inert], [aria-hidden="true"]');
                        let active = inner.activeElement; while (active?.shadowRoot?.activeElement) active = active.shadowRoot.activeElement;
                        return {sheets: sheets.length, sheetsHidden: sheets.map(hiddenIn), realm: sheets.every(node => node.ownerDocument === inner && !(node instanceof HTMLElement)),
                            before: hiddenIn(inner.getElementById('before')), after: hiddenIn(inner.getElementById('after')), calendar: hiddenIn(inner.querySelector('.nc-calendar')),
                            innerOverflow: inner.documentElement.style.overflow, inert: inner.querySelectorAll('[inert]').length,
                            topHidden: document.querySelectorAll('[inert], [aria-hidden="true"]').length, topOverflow: document.documentElement.style.overflow, topActive: document.activeElement?.id,
                            active: active?.tagName, activeInSheet: sheets.some(node => node.contains(active)), date: active?.dataset?.date};
                    };
                    return window.cal.errors;
                }, {moduleUrl, css, server: esm.serverOverlay(options).html, options});
                assert.deepEqual(errorsInFrame, [], 'hydration must not recover from mismatches');
                const frame = page.frameLocator('#frame'), state = () => page.evaluate(() => window.frameState());
                await frame.locator('[role=gridcell][data-date="2026-03-04"]').click(); await settle(page);
                let current = await state();
                assert.deepEqual(current, {sheets: 1, sheetsHidden: [false], realm: true, before: true, after: true, calendar: true, innerOverflow: 'hidden', inert: current.inert, topHidden: 0, topOverflow: '',
                    topActive: 'frame', active: 'H3', activeInSheet: true, date: undefined});
                assert.ok(current.inert >= 3, 'the iframe background is inert, not only aria-hidden');
                // Chrome's own accessibility tree (CDP): inert content is ignored there, the sheet is not.
                const session = await context.newCDPSession(page), {frameTree} = await session.send('Page.getFrameTree');
                const exposed = async frameId => (await session.send('Accessibility.getFullAXTree', {frameId})).nodes.filter(node => !node.ignored)
                    .map(node => `${node.role?.value}:${node.name?.value ?? ''}`);
                const inner = await exposed(frameTree.childFrames[0].frame.id), outer = await exposed(frameTree.frame.id);
                assert.ok(inner.includes('dialog:Events for Mar 4, 2026'), 'the sheet stays in the accessibility tree');
                assert.deepEqual(inner.filter(entry => /^grid:|^button:(Before|After)$|^gridcell:/.test(entry)), [], 'the iframe background is not exposed');
                assert.ok(['button:Top before', 'button:Top after'].every(entry => outer.includes(entry)) && outer.some(entry => entry.startsWith('Iframe:')), `the parent document stays exposed: ${outer}`);
                for (let index = 0; index < 5; index++) { await press(page, 'Tab'); assert.equal((await state()).activeInSheet, true, 'Tab stays inside the sheet of the iframe document'); }
                if (menus) {
                    await frame.locator(triggerSelector('beta')).click(); await settle(page); current = await state();
                    assert.deepEqual([current.sheets, current.sheetsHidden, current.topHidden, current.topOverflow, current.innerOverflow], [2, [true, false], 0, '', 'hidden'], 'the child sheet is the top layer');
                    await press(page, 'Escape'); current = await state();
                    assert.deepEqual([current.sheets, current.sheetsHidden, current.innerOverflow, current.activeInSheet], [1, [false], 'hidden', true], 'the parent sheet resumes, still modal');
                }
                await press(page, 'Escape'); current = await state();
                assert.deepEqual(current, {sheets: 0, sheetsHidden: [], realm: true, before: false, after: false, calendar: false, innerOverflow: '', inert: 0, topHidden: 0, topOverflow: '',
                    topActive: 'frame', active: 'DIV', activeInSheet: false, date: '2026-03-04'});
                return {inertWhileOpen: true};
            } finally { await context.close(); }
        });
    }

    // ——— R53: portalContainer identity changes, removal and invalid initial containers ———
    for (const containers of ['element', 'shadow']) for (const kind of ['popover', 'sheet']) {
        const options = kind === 'popover' ? {items: samples, layout: 'desktop', menus: 'menu'} : {items: samples, layout: 'mobile', agendaPresentation: 'overlay', menus: 'sheet'};
        await scenario(`R53 ${kind} in ${containers === 'shadow' ? 'ShadowRoot' : 'Element'} containers: A → B → null closes the whole stack top-down, removes modal effects, recovers focus, never reopens; the next activation uses B/default`,
            {portal: containers, viewport: {width: kind === 'sheet' ? 420 : 1200, height: 800}, options}, async page => {
                await page.evaluate(({containers, css}) => {
                    if (containers === 'element') { window.portalB = document.getElementById('portal-b'); return; }
                    window.portalB = document.getElementById('portal-b').attachShadow({mode: 'open'});
                    const style = document.createElement('style'); style.textContent = css; window.portalB.append(style);
                }, {containers, css});
                const activate = async () => { if (kind === 'sheet') { await cell(page).click(); await settle(page); } else await open(page); };
                const where = () => page.evaluate(() => {
                    const theme = window.portals()[0], host = theme?.getRootNode().host;
                    if (!theme) return null;
                    const holder = host ?? theme.closest('#portal-a, #portal-b');
                    return holder?.id === 'portal-a' ? 'A' : holder?.id === 'portal-b' ? 'B' : theme.parentElement?.closest('body') && !theme.closest('#owner') ? 'body' : 'other';
                });
                // Package nodes left in the containers: theme roots anywhere, or a non-empty package host.
                const leftovers = () => page.evaluate(() => [document.getElementById('portal-a'), document.getElementById('portal-b')].map(node => {
                    const scope = node.shadowRoot ?? node;
                    return scope.querySelectorAll('.nc-theme').length + [...scope.children].filter(child => child.localName === 'div' && child.childNodes.length).length;
                }));
                await activate(); await openMenu(page); assert.equal(await where(), 'A'); assert.equal((await snap(page)).portals, 2);
                await page.evaluate(() => window.cal.patch({portalContainer: window.portalB})); await settle(page);
                let state = await snap(page); assert.equal(state.dialogs + state.menus, 0); assert.equal(state.portals, 0); assert.equal((await info(page)).date, '2026-03-04');
                await cleared(page); await settle(page); assert.equal((await snap(page)).dialogs, 0, 'no automatic reopen');
                assert.deepEqual(await leftovers(), [0, 0]);
                await activate(); assert.equal(await where(), 'B');
                await page.evaluate(() => window.cal.patch({portalContainer: window.portalB})); await settle(page);
                assert.equal((await snap(page)).dialogs, 1, 'the same identity closes nothing');
                await page.evaluate(() => window.cal.patch({portalContainer: null})); await settle(page);
                state = await snap(page); assert.equal(state.dialogs, 0); assert.equal((await info(page)).date, '2026-03-04'); await cleared(page);
                assert.deepEqual(await leftovers(), [0, 0]);
                await activate(); assert.equal(await where(), 'body');
                assert.deepEqual(warnings.filter(text => text.includes('portalContainer')), []);
            });
    }
    await scenario('R53: removing the active Element container closes the stack and recovers focus; the next activation uses the default body', {portal: 'element',
        options: {items: samples, layout: 'desktop', menus: 'menu'}}, async page => {
        const before = warnings.length;
        await open(page); await openMenu(page); await page.evaluate(() => document.getElementById('portal-a').remove()); await settle(page);
        const state = await snap(page); assert.equal(state.dialogs + state.menus, 0); assert.equal((await info(page)).date, '2026-03-04');
        await open(page); assert.equal(await page.evaluate(() => !!window.portals()[0]?.parentElement?.closest('body')), true);
        assert.deepEqual(warnings.slice(before).filter(text => text.includes('portalContainer')), ['[@nelmad/calendar] portalContainer: Detached container; using the default container']);
    });
    await scenario('R53: removing the host of an active ShadowRoot container closes the modal stack; inert and scroll lock are released', {portal: 'shadow', viewport: {width: 420, height: 800},
        options: {items: samples, layout: 'mobile', agendaPresentation: 'overlay', menus: 'sheet'}}, async page => {
        await cell(page).click(); await settle(page); await openMenu(page); assert.equal((await snap(page)).overflow, 'hidden');
        await page.evaluate(() => document.getElementById('portal-a').remove()); await settle(page);
        assert.equal((await snap(page)).dialogs, 0); await cleared(page); assert.equal((await info(page)).date, '2026-03-04');
    });
    // JavaScript values that are not nodes, and a detached anchor (whose string `host` is not a ShadowRoot host), never crash the calendar.
    const unexpected = '[@nelmad/calendar] portalContainer: Expected an Element or ShadowRoot; using the default container';
    for (const invalid of ['detached', 'cross-document', 'detached-anchor', 'inside-detached-anchor', 'string', 'object', 'number']) {
        await check(`R53: an initial ${invalid} container uses the owner body with one development warning; nothing mounts in another document`, async () => {
            const context = await browser.newContext({viewport: {width: 1200, height: 900}}), page = await context.newPage(), messages = [];
            page.on('console', message => { if (message.type() === 'warning') messages.push(message.text()); if (message.type() === 'error') consoleErrors.push(message.text()); });
            page.on('pageerror', error => errors.push(String(error)));
            try {
                await page.setContent(`<style>${css}</style><iframe id="frame"></iframe><div id="owner"></div>`);
                const result = await page.evaluate(async ({moduleUrl, invalid, server}) => {
                    const module = await import(moduleUrl), fixture = document.createElement('div'); fixture.innerHTML = server; document.getElementById('owner').append(fixture);
                    const foreign = document.getElementById('frame').contentDocument.body, detached = document.createElement('div'), anchor = document.createElement('a');
                    if (invalid === 'inside-detached-anchor') anchor.append(detached);
                    const values = {detached, 'cross-document': foreign, 'detached-anchor': anchor, 'inside-detached-anchor': detached, string: 'body', object: {}, number: 5};
                    window.cal = await module.hydrateOverlay(fixture, {items: [], layout: 'desktop', portalContainer: values[invalid]});
                    const cell = fixture.querySelector('[role=gridcell][data-date="2026-03-04"]'); cell.focus(); cell.click();
                    for (let i = 0; i < 6; i++) await new Promise(requestAnimationFrame);
                    const dialog = document.querySelector('[role=dialog]');
                    return {foreign: foreign.childNodes.length, detached: detached.childNodes.length, anchor: anchor.querySelectorAll('.nc-theme').length, grid: !!fixture.querySelector('[role=grid]'),
                        inBody: !!dialog && dialog.closest('body') === document.body && !fixture.contains(dialog)};
                }, {moduleUrl, invalid, server: esm.serverOverlay({items: [], layout: 'desktop'}).html});
                assert.deepEqual(result, {foreign: 0, detached: 0, anchor: 0, grid: true, inBody: true});
                assert.deepEqual(messages.filter(text => text.includes('portalContainer')), [invalid.includes('detached') ? '[@nelmad/calendar] portalContainer: Detached container; using the default container'
                    : invalid === 'cross-document' ? "[@nelmad/calendar] portalContainer: Container belongs to another document; using the calendar's document body" : unexpected]);
            } finally { await context.close(); }
        });
    }
} finally { await browser.close(); }
const paths = ['src/v02/core/overlayStack.ts', 'src/v02/calendar/overlays.tsx', 'src/v02/calendar/portal.ts', 'src/v02/calendar/CalendarMonth.tsx', 'src/v02/calendar/useCalendarController.ts',
    'src/v02/calendar/CalendarShell.tsx', 'src/v02/calendar/useStatusGeometry.ts', 'src/v02/calendar/DayAgendaBody.tsx', 'src/v02/calendar/focus.ts', 'src/v02/calendar/dom.ts', 'src/v02/calendar/useResponsiveLayout.ts',
    'src/v02/primitives/mirror.ts', 'src/v02/primitives/PortalTheme.tsx', 'src/v02/primitives/ThemeRoot.tsx', 'src/v02/primitives/NonModalPopover.tsx', 'src/v02/primitives/ModalSheet.tsx',
    'src/v02/primitives/overlays.tsx', 'src/v02/themes/classic.ts', 'src/v02/surface.ts', 'src/v02/styles.css', 'src/index.ts', 'src/Calendar.tsx', 'src/v02/calendar/modality.ts',
    'scripts/implementation/overlay-entry.tsx', 'scripts/implementation/overlay-probe.mjs', 'package.json', 'package-lock.json', 'scripts/implementation/spikes/package-lock.json'];
const report = {capturedAt: new Date().toISOString(), outcome: !only && checks.every(c => c.outcome === 'pass') && !errors.length && !consoleErrors.length ? 'pass' : 'fail', filter: only ? String(only) : null,
    node: process.version, browser: version, react: 'bundled from the root lockfile, development build', checks, errors, consoleErrors,
    portalWarnings: warnings.filter(text => text.includes('portalContainer')),
    scope: 'T16 (fix round 2, QA-B) overlay ownership tree, package-owned modal effects bound to the calendar document (a Calendar rendered into a same-origin iframe from another realm), portal scope (including non-node and detached-anchor values) and live routing through the public Calendar (development StrictMode, SSR + hydration): 2×2 Document/ShadowRoot root × default body/explicit ShadowRoot portal with styles.css in each affected scope, portal theme mirror checkpoints, nested menu/modal child (internal fixture through the private child-overlay seam; public item actions are T17), R53 container changes, two-calendar live routing, LTR and RTL. Manual AT, Firefox/Safari and physical devices are out of scope.',
    // A run on an earlier tree (new scenarios on pre-fix code) records a file it does not have as missing.
    sourceHashes: Object.fromEntries(paths.map(path => [path, existsSync(resolve(root, path)) ? createHash('sha256').update(readFileSync(resolve(root, path))).digest('hex') : 'missing']))};
writeFileSync(resolve(output, 'browser.json'), JSON.stringify(report, null, 2) + '\n');
console.log(`Overlay: ${checks.filter(c => c.outcome === 'pass').length}/${checks.length}; ${errors.length} page errors; ${consoleErrors.length} console errors; ${output}`);
if (report.outcome === 'fail') process.exitCode = 1;
