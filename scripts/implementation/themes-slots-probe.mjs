import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, resolve} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {build} from 'vite';

// T18 real-Chrome probe: themes, tokens, item appearance, content/class slots, stable data-* attributes and RTL through
// the public Calendar in development StrictMode (exact call counts without it), with server render + hydration, in
// Document and open ShadowRoot root scopes. Rows: R15 subcheck R15.2 (RTL viewer navigation), R35 subcheck R35.2
// (render/class contexts and one appearance), R51 (two calendars with different themes/dir/portals), R60 (data-* table),
// R61 (27 token sentinels, precedence, portal mirror checkpoints), R62 (appearance channels), R63 (SSR-stable invalid
// values, bad sizing measurement, UA-rejected colors), R33/R34 (comparator, +N, one global order), §10.2 theme matrix,
// forced colors and reduced motion. Usage: node scripts/implementation/themes-slots-probe.mjs <outputDir>
const here = dirname(fileURLToPath(import.meta.url)), root = resolve(here, '../..');
const output = resolve(process.argv[2] ?? resolve(tmpdir(), 'calendar-themes-slots'));
mkdirSync(output, {recursive: true});
const directory = mkdtempSync(resolve(tmpdir(), 'calendar-themes-slots-'));
await build({configFile: false, logLevel: 'error', define: {'process.env.NODE_ENV': '"development"'}, mode: 'development',
    build: {outDir: directory, minify: false, lib: {entry: resolve(here, 'themes-slots-entry.tsx'), formats: ['es'], fileName: () => 'index.mjs'}}});
const esm = await import(pathToFileURL(resolve(directory, 'index.mjs')));
const moduleUrl = 'data:text/javascript;base64,' + readFileSync(resolve(directory, 'index.mjs')).toString('base64');
const css = readFileSync(resolve(root, 'src/v02/styles.css'), 'utf8');
const mirrored = [...esm.mirroredVariables, ...esm.mirroredFontProperties];
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

const next = date => { const value = new Date(`${date}T00:00:00Z`); value.setUTCDate(value.getUTCDate() + 1); return value.toISOString().slice(0, 10); };
const allDay = (id, title, start, end = next(start), extra = {}) => ({id, title, data: {}, interval: {kind: 'allDay', start, end}, ...extra});
// All 27 public token paths, each with its own conforming sentinel per layer (§10.3.1, R61).
const paths = Object.entries(esm.tokenVariables).flatMap(([group, fields]) => Object.entries(fields).map(([key, variable]) => ({group, key, variable})));
const sentinel = (layer, {group, key}, index) => {
    const n = layer * 30 + index;
    if (group === 'color' || group === 'components') return `rgb(${layer}, ${index}, ${n})`;
    if (key === 'fontFamily') return `"Sentinel ${layer}", serif`;
    if (key === 'fontSize') return `${14 + layer}px`;
    if (key === 'fontWeight') return String(300 + layer * 100 + index);
    if (key === 'lineHeight') return `1.${layer}${index}`;
    if (group === 'shadows') return `0px ${layer}px ${index}px rgb(${layer}, 1, 2)`;
    if (key === 'duration') return `${100 * layer + index}ms`;
    if (key === 'easing') return `cubic-bezier(0.${layer}, 0.1, 0.2, 1)`;
    if (key === 'dayMinHeight') return `${90 + layer * 10}px`;
    if (key === 'itemHeight') return `${20 + layer}px`;
    return `${layer + index}px`;
};
const tokensOf = layer => { const tokens = {}; paths.forEach((path, index) => { (tokens[path.group] ??= {})[path.key] = sentinel(layer, path, index); }); return tokens; };
const styleOf = layer => Object.fromEntries(paths.map((path, index) => [path.variable, sentinel(layer, path, index)]));
const cssOf = (selector, layer) => `${selector}{${paths.map((path, index) => `${path.variable}:${sentinel(layer, path, index)}`).join(';')}}`;

const settle = page => page.evaluate(async () => { for (let i = 0; i < 6; i++) await new Promise(requestAnimationFrame); });
const patch = async (page, options, which = 'cal') => { await page.evaluate(({options, which}) => window[which].patch(options), {options, which}); await settle(page); };
const events = (page, type, which = 'cal') => page.evaluate(({type, which}) => window[which].events.filter(event => event.type === type).map(event => event.value), {type, which});
const calls = (page, slot, which = 'cal') => page.evaluate(({slot, which}) => window[which].calls.filter(call => call.slot === slot).map(call => call.context), {slot, which});
const resetCalls = (page, which = 'cal') => page.evaluate(which => { window[which].calls.length = 0; }, which);
const info = page => page.evaluate(() => window.info());
const press = async (page, key) => { await page.keyboard.press(key); await settle(page); };
const cell = (page, date, owner = '#owner') => page.locator(`${owner} [role=gridcell][data-date="${date}"]`);
const openAgenda = async (page, date, owner = '#owner') => { await cell(page, date, owner).focus(); await press(page, 'Enter'); };
const portalTransitions = page => page.evaluate(() => document.getAnimations().filter(animation => window.portals().some(portal => portal.contains(animation.effect?.target ?? null)))
    .map(animation => `${animation.effect.target.className}:${animation.transitionProperty ?? animation.animationName}`));
const screenshot = (page, name) => page.screenshot({path: resolve(output, `${name}.png`)});

/**
 * `root`: Calendar root scope ('document' | 'shadow'). `second`: options of a second Calendar in `#owner2` (`secondRoot`
 * scope). `extraCss` is added to the document and every root scope; styles.css is loaded in every affected tree scope
 * (§10.3.4). `server: false` renders client-only (no server markup).
 */
async function setup({root: rootScope = 'document', options = {}, second, secondRoot = 'document', viewport = {width: 1200, height: 900}, colorScheme = 'light',
    extraCss = '', server = true, media = {}}) {
    const context = await browser.newContext({viewport, locale: 'en-US', colorScheme});
    const page = await context.newPage(), warnings = [];
    page.setDefaultTimeout(4000);
    page.on('pageerror', error => errors.push(String(error)));
    page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); if (message.type() === 'warning') warnings.push(message.text()); });
    if (Object.keys(media).length) await page.emulateMedia(media);
    const html = server ? esm.serverThemes(options).html : null, secondHtml = second && server ? esm.serverThemes(second).html : null;
    await page.setContent(`<style>body{margin:0;font:16px/1.4 system-ui;background:#f5f4f1}#before,#after,#between{margin:8px}#owner,#owner2{font:15px/1.5 system-ui}</style>
        <button id="before">Before</button><p id="blank">Blank area</p><div id="owner"></div><button id="between">Between</button><div id="owner2"></div><button id="after">After</button>`);
    await page.evaluate(async ({rootScope, secondRoot, moduleUrl, css, html, secondHtml, options, second, mirrored, extraCss}) => {
        const addCss = (scope, text, id) => { const style = document.createElement('style'); style.textContent = text; if (id) style.id = id; (scope === document ? document.head : scope).append(style); };
        const scopeOf = (id, kind) => { const host = document.getElementById(id); return kind === 'shadow' ? host.attachShadow({mode: 'open'}) : host; };
        const scope = scopeOf('owner', rootScope), scope2 = second ? scopeOf('owner2', secondRoot) : null;
        addCss(document, css); addCss(document, extraCss, 'extra');
        for (const target of [scope, scope2]) if (target instanceof ShadowRoot) { addCss(target, css); addCss(target, extraCss, 'extra'); }
        window.scopes = [scope, scope2].filter(Boolean);
        window.deep = selector => { const out = new Set(); const visit = node => { for (const element of node.querySelectorAll(selector)) out.add(element); for (const element of node.querySelectorAll('*')) if (element.shadowRoot) visit(element.shadowRoot); }; visit(document); return [...out]; };
        window.active = () => { let node = document.activeElement; while (node?.shadowRoot?.activeElement) node = node.shadowRoot.activeElement; return node; };
        window.composedClosest = (node, selector) => { for (let current = node; current; current = current.assignedSlot ?? current.parentElement ?? current.getRootNode().host) if (current.matches?.(selector)) return current; return null; };
        window.info = () => {
            const node = window.active();
            return {id: node?.id || undefined, date: node?.dataset?.date, item: node?.closest?.('[data-item-id]')?.dataset.itemId, control: node?.dataset?.agendaControl,
                role: node?.getAttribute?.('role') ?? undefined, label: node?.getAttribute?.('aria-label') ?? undefined, text: node?.textContent, tag: node?.tagName,
                calendar: window.composedClosest(node, '.nc-calendar')?.parentElement?.getRootNode()?.host?.id ?? window.composedClosest(node, '[id^=owner]')?.id};
        };
        window.calendars = () => window.deep('.nc-calendar');
        window.portals = () => window.deep('.nc-theme').filter(node => !node.classList.contains('nc-calendar'));
        window.mismatch = (portalRoot, owner) => { const a = getComputedStyle(portalRoot), b = getComputedStyle(owner); return mirrored.filter(name => a.getPropertyValue(name).trim() !== b.getPropertyValue(name).trim()); };
        // A portal theme root belongs to the Calendar with the same theme attributes (two calendars here never share them).
        window.ownerOf = theme => { const roots = window.calendars(); return roots.find(node => ['data-theme', 'data-dir', 'lang', 'data-color-scheme'].every(name => node.getAttribute(name) === theme.getAttribute(name))) ?? roots[0]; };
        window.cellText = (date, owner = 0) => {
            const node = window.calendars()[owner].querySelector(`[role=gridcell][data-date="${date}"]`), tree = node.getRootNode();
            return ['aria-labelledby', 'aria-describedby'].flatMap(name => node.getAttribute(name)?.split(' ') ?? []).map(id => tree.getElementById(id)?.textContent).join(' ');
        };
        // Reveal and focus checkpoints: a portal theme root is hidden until mirrored; initial focus sees mirrored values.
        window.reveals = [];
        const watch = target => new MutationObserver(records => {
            for (const record of records) for (const node of record.addedNodes) if (node.nodeType === 1) for (const theme of [node, ...node.querySelectorAll('.nc-theme')]) {
                if (!theme.matches('.nc-theme') || theme.matches('.nc-calendar')) continue;
                window.reveals.push({visibility: getComputedStyle(theme).visibility, mismatch: window.mismatch(theme, window.ownerOf(theme))});
            }
        }).observe(target, {childList: true, subtree: true});
        for (const target of new Set([document.body, ...window.scopes.filter(node => node instanceof ShadowRoot)])) watch(target);
        const focus = HTMLElement.prototype.focus; window.focusLog = [];
        HTMLElement.prototype.focus = function (focusOptions) {
            const theme = this.closest('.nc-theme');
            if (theme && !theme.matches('.nc-calendar')) window.focusLog.push({visibility: getComputedStyle(theme).visibility, mismatch: window.mismatch(theme, window.ownerOf(theme))});
            return focus.call(this, focusOptions);
        };
        const module = await import(moduleUrl);
        const mount = async (target, markup, props) => {
            const fixture = document.createElement('div'); fixture.className = 'fixture'; target.append(fixture);
            if (markup === null) return module.renderThemes(fixture, props);
            fixture.innerHTML = markup; return module.hydrateThemes(fixture, props);
        };
        window.cal = await mount(scope, html, options);
        if (second) window.cal2 = await mount(scope2, secondHtml, second);
    }, {rootScope, secondRoot, moduleUrl, css, html, secondHtml, options, second, mirrored, extraCss});
    await settle(page);
    return {page, context, warnings};
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
const libraryWarnings = warnings => warnings.filter(text => text.startsWith('[@nelmad/calendar]'));

// ——— Fixtures ———
const sources = [{id: 'work', title: 'Work', color: 'rgb(10, 120, 40)'}, {id: 'home', title: 'Home', color: 'rgb(0, 90, 200)'}];
const base = {accent: 'rgb(150, 30, 30)', background: 'rgb(240, 241, 242)', text: 'rgb(20, 21, 22)'};
const baseTokens = {color: {accent: base.accent}, components: {itemBackground: base.background, itemText: base.text}};
// R62: every partial field on its own item, a multi-week bar with a source only and one with a full override.
const appearanceItems = [allDay('trip', 'Trip', '2026-03-05', '2026-03-10', {calendarId: 'work'}), allDay('acc', 'Accent', '2026-03-02', undefined, {calendarId: 'work'}),
    allDay('bg', 'Background', '2026-03-03', undefined, {calendarId: 'work'}), allDay('txt', 'Text', '2026-03-04', undefined, {calendarId: 'work'}),
    allDay('plain', 'Plain', '2026-03-11'), allDay('lost', 'Lost', '2026-03-12', undefined, {calendarId: 'missing'}),
    allDay('tour', 'Tour', '2026-03-19', '2026-03-24', {calendarId: 'home'})];
const appearance = {acc: {accentColor: 'rgb(200, 0, 100)'}, bg: {backgroundColor: 'rgb(255, 240, 200)'}, txt: {textColor: 'rgb(90, 0, 160)'},
    tour: {accentColor: 'rgb(1, 2, 3)', backgroundColor: 'rgb(250, 250, 210)', textColor: 'rgb(60, 10, 10)'}};
const expected = {trip: {accent: 'rgb(10, 120, 40)', background: base.background, text: base.text}, acc: {accent: 'rgb(200, 0, 100)', background: base.background, text: base.text},
    bg: {accent: 'rgb(10, 120, 40)', background: 'rgb(255, 240, 200)', text: base.text}, txt: {accent: 'rgb(10, 120, 40)', background: base.background, text: 'rgb(90, 0, 160)'},
    plain: {accent: base.accent, ...{background: base.background, text: base.text}}, lost: {accent: base.accent, background: base.background, text: base.text},
    tour: {accent: 'rgb(1, 2, 3)', background: 'rgb(250, 250, 210)', text: 'rgb(60, 10, 10)'}};
// The computed channels of every Month segment and agenda row of an item: accent marker, surface background and text.
const colorsOf = (page, id) => page.evaluate(id => window.deep(`[data-item-id="${id}"]`).map(node => {
    const surface = node.matches('.nc-month-item') ? node : node.querySelector(':scope > [data-agenda-control=primary]') ?? node;
    const marker = surface.querySelector('.nc-item-accent > span'), style = getComputedStyle(surface);
    return {view: node.dataset.view, accent: getComputedStyle(marker).borderInlineStartColor, background: style.backgroundColor, text: style.color};
}), id);

try {
    // ——— §10.2: theme × density × colorScheme matrix ———
    await scenario('§10.2 theme matrix: classic/neutral × compact/comfortable × system/light/dark change only appearance; the accessibility tree is identical; text contrast ≥ 4.5', {
        server: false, options: {layout: 'desktop', items: appearanceItems}}, async page => {
        const results = [], trees = new Set();
        for (const themeName of ['classic', 'neutral']) for (const density of ['compact', 'comfortable']) for (const colorScheme of ['system', 'light', 'dark']) for (const media of colorScheme === 'system' ? ['light', 'dark'] : ['light']) {
            await page.emulateMedia({colorScheme: media}); await patch(page, {themeName, density, colorScheme});
            const state = await page.evaluate(() => {
                const node = window.calendars()[0], style = getComputedStyle(node), value = name => style.getPropertyValue(name).trim();
                const luminance = color => { const [r, g, b] = color.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number).map(c => c / 255).map(c => c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
                const ratio = (a, b) => { const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
                const tree = [...node.querySelectorAll('[role], button, [aria-label], [tabindex]')].map(element => [element.tagName, element.getAttribute('role'), element.getAttribute('aria-label'),
                    element.getAttribute('tabindex'), element.getAttribute('aria-selected'), element.getAttribute('aria-haspopup')].join('|')).join('\n');
                return {attributes: [node.dataset.theme, node.dataset.density, node.dataset.colorScheme], surface: style.backgroundColor, text: style.color, accent: value('--nelmad-calendar-color-accent'),
                    radius: value('--nelmad-calendar-radii-md'), dayMinHeight: value('--nelmad-calendar-density-day-min-height'), itemHeight: value('--nelmad-calendar-density-item-height'),
                    contrast: ratio(style.color, style.backgroundColor), tree};
            });
            assert.deepEqual(state.attributes, [themeName, density, colorScheme]);
            assert.ok(state.contrast >= 4.5, `text contrast ${state.contrast} for ${themeName}/${colorScheme}/${media}`);
            trees.add(state.tree); delete state.tree;
            results.push({themeName, density, colorScheme, media, ...state});
        }
        assert.equal(trees.size, 1, 'themes, densities and schemes never change roles, names, tab stops or popup semantics');
        const pick = (themeName, density, colorScheme, media = 'light') => results.find(entry => entry.themeName === themeName && entry.density === density && entry.colorScheme === colorScheme && entry.media === media);
        assert.notEqual(pick('classic', 'compact', 'light').accent, pick('neutral', 'compact', 'light').accent, 'neutral has its own palette');
        assert.notEqual(pick('classic', 'compact', 'light').radius, pick('neutral', 'compact', 'light').radius);
        for (const themeName of ['classic', 'neutral']) {
            assert.notEqual(pick(themeName, 'compact', 'light').surface, pick(themeName, 'compact', 'dark').surface, `${themeName} has a dark scheme`);
            assert.equal(pick(themeName, 'compact', 'system', 'dark').surface, pick(themeName, 'compact', 'dark').surface, 'system follows prefers-color-scheme: dark');
            assert.equal(pick(themeName, 'compact', 'system', 'light').surface, pick(themeName, 'compact', 'light').surface);
            assert.notEqual(pick(themeName, 'compact', 'light').dayMinHeight, pick(themeName, 'comfortable', 'light').dayMinHeight, 'density changes sizes');
            assert.equal(pick(themeName, 'comfortable', 'light').surface, pick(themeName, 'compact', 'light').surface, 'density changes no colors');
        }
        assert.deepEqual([pick('classic', 'compact', 'light').dayMinHeight, pick('classic', 'compact', 'light').itemHeight], [pick('neutral', 'compact', 'light').dayMinHeight, pick('neutral', 'compact', 'light').itemHeight],
            'a theme never sets density variables');
        for (const [themeName, colorScheme] of [['classic', 'light'], ['classic', 'dark'], ['neutral', 'light'], ['neutral', 'dark']]) {
            await page.emulateMedia({colorScheme: 'light'}); await patch(page, {themeName, density: 'comfortable', colorScheme}); await screenshot(page, `theme-${themeName}-${colorScheme}-comfortable`);
        }
        return {combinations: results.length, results};
    });

    // ——— R61: 27 sentinels, precedence and the portal mirror ———
    for (const rootScope of ['document', 'shadow']) {
        await scenario(`R61 ${rootScope}: each of the 27 token paths writes its exact variable; scoped CSS < tokens < root style; !important CSS follows the cascade; the portal mirrors every resolved public value before reveal and focus`, {
            root: rootScope, server: true, extraCss: `${cssOf('#owner .nc-calendar, .fixture > .nc-calendar', 1)}#owner .nc-calendar, .fixture > .nc-calendar{--host-private:9px;text-transform:uppercase}`,
            options: {layout: 'desktop', items: appearanceItems}}, async page => {
            const values = () => page.evaluate(variables => { const style = getComputedStyle(window.calendars()[0]); return variables.map(name => style.getPropertyValue(name).trim()); }, paths.map(path => path.variable));
            assert.deepEqual(await values(), paths.map((path, index) => sentinel(1, path, index)), 'scoped CSS overrides every preset default');
            await patch(page, {tokens: tokensOf(2)});
            assert.deepEqual(await values(), paths.map((path, index) => sentinel(2, path, index)), 'tokens win over non-important author CSS');
            const written = await page.evaluate(() => [...window.calendars()[0].style].filter(name => name.startsWith('--')));
            assert.deepEqual([...written].sort(), paths.map(path => path.variable).sort(), 'exactly the 27 kebab-case variables, mixed-case paths included');
            assert.ok(paths.some(path => path.key === 'fontFamily' && path.variable === '--nelmad-calendar-typography-font-family'));
            await patch(page, {style: styleOf(3)});
            assert.deepEqual(await values(), paths.map((path, index) => sentinel(3, path, index)), 'root style wins over tokens');
            await page.evaluate(() => { for (const scope of [document, ...window.scopes]) { const style = document.createElement('style'); style.className = 'important';
                style.textContent = '.fixture > .nc-calendar, #owner .nc-calendar{--nelmad-calendar-color-muted: rgb(7, 7, 7) !important}'; (scope === document ? document.head : scope).append(style); } });
            assert.equal((await values())[paths.findIndex(path => path.key === 'muted')], 'rgb(7, 7, 7)', 'an !important author declaration wins by the standard cascade');
            await page.evaluate(() => { window.reveals.length = 0; window.focusLog.length = 0; });
            await openAgenda(page, '2026-03-04');
            const opened = await page.evaluate(() => { const portal = window.portals()[0], style = getComputedStyle(portal);
                return {count: window.portals().length, reveals: window.reveals, focus: window.focusLog, mismatch: window.mismatch(portal, window.calendars()[0]),
                    privateValue: style.getPropertyValue('--host-private'), transform: style.textTransform, inline: [...portal.style].filter(name => !name.startsWith('--nelmad-calendar-') && name !== 'visibility')}; });
            assert.equal(opened.count, 1);
            assert.deepEqual(await portalTransitions(page), [], 'no transition from the preset defaults after the reveal');
            assert.ok(opened.reveals.length > 0 && opened.reveals.every(entry => entry.visibility === 'hidden' || entry.mismatch.length === 0), `hidden until mirrored: ${JSON.stringify(opened.reveals)}`);
            assert.ok(opened.focus.length > 0 && opened.focus.every(entry => entry.mismatch.length === 0 && entry.visibility === 'visible'), `initial focus sees the mirror: ${JSON.stringify(opened.focus)}`);
            assert.deepEqual(opened.mismatch, [], 'all 27 variables and 7 font properties equal the root, CSS and style overrides included');
            assert.equal(opened.privateValue, '', 'non-public custom properties are not copied'); assert.equal(opened.transform, 'none', 'non-public properties are not copied');
            assert.deepEqual(opened.inline.filter(name => !mirrored.includes(name)), [], 'only mirrored names are written inline');
            if (rootScope === 'document') await screenshot(page, 'r61-sentinel-portal');
            return {written: written.length};
        });
    }
    await scenario('R61 mirror checkpoints: owner commit, owner resize, window resize and color-scheme/forced-colors/reduced-motion changes keep the open portal equal to the root; an isolated stylesheet mutation shows after the next owner render', {
        server: true, viewport: {width: 1200, height: 900}, options: {layout: 'desktop', items: appearanceItems, colorScheme: 'system'},
        extraCss: '#owner .fixture{container-type:inline-size;width:1000px}@container (min-width: 1100px){.nc-calendar{--nelmad-calendar-spacing-md:22px}}'
            + '@media (min-width: 1300px){#owner .nc-calendar{--nelmad-calendar-radii-md:3px}}@media (prefers-reduced-motion: reduce){#owner .nc-calendar{--nelmad-calendar-motion-duration:0ms}}'}, async page => {
        await openAgenda(page, '2026-03-04');
        const mismatch = () => page.evaluate(() => window.mismatch(window.portals()[0], window.calendars()[0]));
        const portalValue = name => page.evaluate(name => getComputedStyle(window.portals()[0]).getPropertyValue(name).trim(), name);
        const log = {};
        await patch(page, {tokens: {color: {accent: 'rgb(9, 8, 7)'}}}); assert.equal(await portalValue('--nelmad-calendar-color-accent'), 'rgb(9, 8, 7)'); assert.deepEqual(await mismatch(), [], 'owner commit');
        await page.evaluate(() => { document.querySelector('#owner .fixture').style.width = '1150px'; }); await settle(page);
        assert.equal(await portalValue('--nelmad-calendar-spacing-md'), '22px', 'owner resize (forced desktop layout observes no width)'); assert.deepEqual(await mismatch(), []);
        await page.setViewportSize({width: 1400, height: 900}); await settle(page); assert.equal(await portalValue('--nelmad-calendar-radii-md'), '3px', 'window resize'); assert.deepEqual(await mismatch(), []);
        log.light = await portalValue('--nelmad-calendar-color-surface');
        await page.emulateMedia({colorScheme: 'dark'}); await settle(page); log.dark = await portalValue('--nelmad-calendar-color-surface');
        assert.notEqual(log.dark, log.light); assert.deepEqual(await mismatch(), [], 'prefers-color-scheme');
        await page.emulateMedia({reducedMotion: 'reduce'}); await settle(page); assert.equal(await portalValue('--nelmad-calendar-motion-duration'), '0ms'); assert.deepEqual(await mismatch(), [], 'prefers-reduced-motion');
        await page.emulateMedia({forcedColors: 'active'}); await settle(page); log.forced = await portalValue('--nelmad-calendar-color-surface');
        assert.deepEqual(await mismatch(), [], 'forced-colors');
        await page.emulateMedia({forcedColors: 'none', reducedMotion: 'no-preference', colorScheme: 'light'}); await settle(page);
        // A stylesheet mutation is not a checkpoint; the next owner render is.
        await page.evaluate(() => { document.getElementById('extra').append('#owner .nc-calendar{--nelmad-calendar-color-muted: rgb(4, 5, 6)}'); }); await settle(page);
        log.beforeRender = await portalValue('--nelmad-calendar-color-muted');
        await patch(page, {density: 'comfortable'});
        assert.equal(await portalValue('--nelmad-calendar-color-muted'), 'rgb(4, 5, 6)', 'visible after the next owner render'); assert.deepEqual(await mismatch(), []);
        return log;
    });

    // ——— R62: appearance channels ———
    for (const rootScope of ['document', 'shadow']) for (const [locale, dir] of [['en-US', 'ltr'], ['ar', 'rtl']]) {
        await scenario(`R62 ${rootScope}, ${dir.toUpperCase()} ${locale}: a source color changes only the accent; each resolver field replaces its own channel; no/unknown source keeps the base accent; every week segment and the agenda row share the colors`, {
            root: rootScope, server: true, viewport: {width: 1200, height: 1000},
            options: {layout: 'desktop', locale, items: appearanceItems, sources, visibleSourceIds: ['work', 'home'], filter: true, appearance, tokens: {...baseTokens, density: {dayMinHeight: '120px'}}}}, async (page, {warnings}) => {
            const report = {};
            for (const id of Object.keys(expected)) {
                const segments = await colorsOf(page, id);
                assert.ok(segments.length >= 1, `${id} is visible in the Month`);
                for (const segment of segments) assert.deepEqual({accent: segment.accent, background: segment.background, text: segment.text}, expected[id], `${id} ${segment.view}`);
                report[id] = segments.length;
            }
            assert.equal(report.trip, 2, 'Trip has one segment per week'); assert.equal(report.tour, 2, 'Tour has one segment per week');
            for (const [id, date] of [['trip', '2026-03-09'], ['tour', '2026-03-23'], ['bg', '2026-03-03'], ['lost', '2026-03-12']]) {
                await openAgenda(page, date);
                // Revealed with its mirrored values: nothing fades in from the preset defaults (no running transition).
                assert.deepEqual(await portalTransitions(page), [], `${id}: no transition in the portal after its reveal`);
                const rows = (await colorsOf(page, id)).filter(entry => entry.view === 'agenda');
                assert.equal(rows.length, 1, `${id} has one agenda row`); assert.deepEqual({accent: rows[0].accent, background: rows[0].background, text: rows[0].text}, expected[id], `${id} agenda row`);
                if (id === 'tour' && rootScope === 'document') await screenshot(page, `r62-${dir}-agenda-appearance`);
                await press(page, 'Escape');
            }
            const resolverCalls = await calls(page, 'getItemAppearance');
            assert.ok(resolverCalls.every(call => Object.keys(call.context).sort().join() === (call.context.source ? 'source,timeZone' : 'timeZone')), 'context: timeZone and a known source only');
            assert.equal(resolverCalls.find(call => call.id === 'lost').context.source, undefined, 'an unknown source is not passed');
            // The selector marks each source with its own color.
            await page.locator('#owner [data-source-selector]').click(); await settle(page);
            const dots = await page.evaluate(() => window.deep('[role=menuitemcheckbox] .nc-source-accent').map(node => getComputedStyle(node).borderTopColor));
            assert.deepEqual(dots, ['rgb(10, 120, 40)', 'rgb(0, 90, 200)']);
            assert.deepEqual(libraryWarnings(warnings).filter(text => text.includes('calendarId')), ['[@nelmad/calendar] items[5].calendarId: No source with ID "missing"; items with this calendarId remain visible with fallback appearance']);
            assert.deepEqual(libraryWarnings(warnings).filter(text => !text.includes('calendarId') && /color|appearance|tokens/i.test(text)), [], 'valid colors are not diagnosed');
            if (rootScope === 'document' && dir === 'ltr') await screenshot(page, 'r62-month-appearance');
            return report;
        });
    }

    // ——— R63: SSR stability, bad measurements, UA-rejected colors ———
    const invalid = {layout: 'mobile', items: [allDay('blank', 'Blank', '2026-03-04', undefined, {calendarId: 'work'}), allDay('nonstring', 'Number', '2026-03-04', undefined, {calendarId: 'home'}),
        allDay('rejected', 'Rejected', '2026-03-04', undefined, {calendarId: 'work'}), allDay('late', 'Late', '2026-03-04', undefined, {calendarId: 'work'}),
        allDay('multi', 'Multi', '2026-03-04', undefined, {calendarId: 'bad'}), allDay('ok', 'Fine', '2026-03-04')],
        sources: [{id: 'work', title: 'Work', color: 'rgb(10, 120, 40)'}, {id: 'home', title: 'Home', color: 7}, {id: 'bad', title: 'Bad', color: 'red; color: blue'}, {id: 'odd', title: 'Odd', color: 'not-a-color'}],
        visibleSourceIds: ['work', 'home', 'bad', 'odd'], filter: true,
        appearance: {blank: {accentColor: '   ', backgroundColor: ''}, nonstring: {textColor: 12, backgroundColor: null}, rejected: {backgroundColor: 'definitely-not-a-color', accentColor: 'nope'},
            late: {backgroundColor: 'var(--missing-color)'}, multi: {textColor: 'red !important'}},
        tokens: {color: {surface: '  ', text: 5, muted: 'not-a-color', border: 'red; background: blue', accent: base.accent}, spacing: {xs: 'url(x)'},
            components: {itemBackground: base.background, itemText: base.text}}};
    await scenario('R63 SSR: blank/non-string/invalid tokens, source colors and appearance values give identical server and first-client declarations, no hydration recovery, no contract error or callback, one warning per absent value', {
        server: true, viewport: {width: 420, height: 900}, options: invalid}, async (page, {warnings}) => {
        const declarations = which => page.evaluate(which => {
            const container = which === 'server' ? document.querySelector('#owner .fixture') : document.querySelector('#client');
            const nodes = [container.querySelector('.nc-calendar'), ...container.querySelectorAll('[data-item-id], [data-item-id] *')];
            return nodes.map(node => [node.dataset?.itemId ?? node.className, [...node.style].map(name => `${name}:${node.style.getPropertyValue(name)}`).join(';')]);
        }, which);
        const server = await declarations('server'), serverWarnings = libraryWarnings(warnings);
        // A client-only first render of the same props in the same document, read before any effect can change it.
        await page.evaluate(async ({options, moduleUrl}) => { const module = await import(moduleUrl); const client = Object.assign(document.createElement('div'), {id: 'client'});
            document.body.append(client); window.client = await module.renderThemes(client, options); }, {options: invalid, moduleUrl});
        const client = await declarations('client');
        assert.deepEqual(client, server, 'server markup and the first client render parse to the same declarations');
        const root = await page.evaluate(() => { const node = document.querySelector('#owner .nc-calendar'); return {status: node.dataset.status, style: node.getAttribute('style'), presentation: node.querySelector('[data-presentation]')?.dataset.presentation}; });
        assert.equal(root.status, 'ready', 'no contract error'); assert.equal(root.presentation, 'inline');
        assert.doesNotMatch(root.style, /surface|--nelmad-calendar-color-text|border|spacing-xs/, 'absent token values write nothing'); assert.match(root.style, /--nelmad-calendar-color-muted:\s*not-a-color/, 'a structurally valid value is passed through');
        assert.deepEqual(await events(page, 'navigate'), []); assert.deepEqual(await events(page, 'press'), []);
        const colors = Object.fromEntries(await Promise.all(['blank', 'nonstring', 'rejected', 'late', 'multi', 'ok'].map(async id => [id, (await colorsOf(page, id)).find(entry => entry.view === 'agenda')])));
        assert.deepEqual(colors.blank, {view: 'agenda', accent: 'rgb(10, 120, 40)', background: base.background, text: base.text}, 'blank fields are absent: source accent, token surface');
        assert.deepEqual(colors.nonstring, {view: 'agenda', accent: base.accent, background: base.background, text: base.text}, 'a non-string source color and fields are absent');
        assert.deepEqual(colors.rejected, {view: 'agenda', accent: 'rgb(10, 120, 40)', background: base.background, text: base.text}, 'UA-rejected declarations keep the lower channel (source, then tokens)');
        assert.equal(colors.late.background, 'rgba(0, 0, 0, 0)', 'invalid at computed-value time: standard CSS (background-color unset → transparent)');
        assert.deepEqual(colors.multi, {view: 'agenda', accent: base.accent, background: base.background, text: base.text}, 'a multi-declaration value is absent; the invalid source keeps the base accent');
        const expectedWarnings = ['tokens.color.surface', 'tokens.color.text', 'tokens.color.border', 'tokens.spacing.xs', 'sources("home").color', 'sources("bad").color',
            'getItemAppearance("blank").accentColor', 'getItemAppearance("blank").backgroundColor', 'getItemAppearance("nonstring").textColor', 'getItemAppearance("nonstring").backgroundColor',
            'getItemAppearance("multi").textColor'];
        const found = serverWarnings;
        for (const path of expectedWarnings) assert.equal(found.filter(text => text.startsWith(`[@nelmad/calendar] ${path}:`)).length, 1, `one warning for ${path}: ${JSON.stringify(found)}`);
        assert.equal(found.filter(text => /not-a-color|rejected|late|\("odd"\)/.test(text)).length, 0, 'well-formed values are not diagnosed');
        assert.deepEqual(libraryWarnings(warnings).slice(found.length).sort(), [...found].sort(), 'the client-only instance reports the same diagnostics once');
        return {declarations: server.length, warnings: found.length};
    });
    await scenario('R63 bad sizing: non-finite item height or gap gives zero lanes and an accessible +N on every date with items; a zero item height is held by the package minimum without losing items; the hit area opens the owning date', {
        server: true, options: {layout: 'desktop', items: appearanceItems, controlledAgenda: true, agendaDate: '2026-03-01', tokens: {density: {itemHeight: 'calc(infinity * 1px)'}}}}, async (page, {warnings}) => {
        const state = () => page.evaluate(() => {
            const dates = ['2026-03-02', '2026-03-03', '2026-03-04', '2026-03-05', '2026-03-11', '2026-03-12', '2026-03-19'];
            return {segments: window.deep('.nc-month-item').length, overflow: window.deep('.nc-overflow').length, probe: window.deep('.nc-month-item-probe')[0].getBoundingClientRect().height,
                cells: dates.map(date => { const node = window.calendars()[0].querySelector(`[role=gridcell][data-date="${date}"]`), week = node.closest('[role=row]'), box = node.getBoundingClientRect();
                    const covering = [...week.querySelectorAll('.nc-month-item')].filter(item => { const rect = item.getBoundingClientRect(); return rect.left < box.right - 1 && rect.right > box.left + 1; }).length;
                    const overflow = node.querySelector('.nc-overflow'); return {date, covering, hidden: overflow ? Number(overflow.textContent.replace(/\D/g, '')) : 0, labels: (window.cellText(date).match(/hidden/g) ?? []).length}; })};
        });
        const results = {};
        for (const tokens of [{density: {itemHeight: 'calc(infinity * 1px)'}}, {density: {gap: 'calc(infinity * 1px)'}}, {density: {itemHeight: '0px'}}]) {
            await patch(page, {tokens}); const current = await state(), label = JSON.stringify(tokens); results[label] = current;
            for (const entry of current.cells) assert.equal(entry.covering + entry.hidden, 1, `${label} ${entry.date}: the item is shown or counted`);
            if (!tokens.density.itemHeight || tokens.density.itemHeight !== '0px') {
                assert.equal(current.segments, 0, `${label}: zero lanes`);
                for (const entry of current.cells) assert.deepEqual([entry.hidden, entry.labels], [1, 1], `${label} ${entry.date}: +N and one moreItemsLabel`);
            } else assert.ok(current.probe > 0 && current.segments > 0, `${label}: the package minimum item size keeps lanes (${current.probe}px)`);
        }
        await patch(page, {tokens: {density: {itemHeight: 'calc(infinity * 1px)'}}});
        await page.locator('#owner [role=gridcell][data-date="2026-03-04"] .nc-overflow').click(); await settle(page);
        assert.deepEqual(await events(page, 'agenda'), ['2026-03-04'], 'one activation of the owning date');
        assert.ok(await page.evaluate(() => window.deep('.nc-overflow').every(node => node.closest('[aria-hidden=true]') && node.tabIndex < 0)), 'the indicator is no accessibility or Tab target');
        assert.equal(await page.evaluate(() => window.calendars()[0].dataset.status), 'ready'); assert.deepEqual(libraryWarnings(warnings).filter(text => !text.includes('calendarId')), [], 'a structurally valid value is not diagnosed');
        return results;
    });

    // ——— R35.2: render and class contexts ———
    await scenario('R35.2: renderItem and classNames.item run once per exact segmentRange per render; agenda slots once per row with the agenda date; appearance once per item for all segments and the row', {
        server: true, options: {layout: 'desktop', items: appearanceItems, slots: true, classes: true, appearance, strict: false, sources, visibleSourceIds: ['work', 'home'], filter: true}}, async page => {
        // One owner render that changes no measurement: exactly one render pass of the Month.
        await resetCalls(page); await patch(page, {});
        const items = await calls(page, 'renderItem'), classesCalls = await calls(page, 'class:item');
        const dom = await page.evaluate(() => window.deep('.nc-month-item').map(node => node.dataset.itemId + '@' + node.querySelector('.probe-chip')?.textContent));
        const ranges = list => list.map(context => `${context.item.id}:${context.segmentRange.start}/${context.segmentRange.end}`);
        assert.equal(new Set(ranges(items)).size, items.length, 'no segment twice in one render');
        assert.deepEqual(ranges(items).sort(), ranges(classesCalls).sort(), 'class callback context = slot context');
        assert.equal(items.length, dom.length, 'one call per rendered segment');
        assert.deepEqual(ranges(items).filter(range => range.startsWith('trip:')).sort(), ['trip:2026-03-05/2026-03-08', 'trip:2026-03-08/2026-03-10']);
        for (const context of items) {
            assert.deepEqual(Object.keys(context).sort(), [...(context.source ? ['source'] : []), 'isDisabled', 'isDragging', 'isPending', 'isSelected', 'item', 'segmentRange', 'view'].sort());
            assert.deepEqual([context.view, context.isSelected, context.isDragging, context.isPending, context.isDisabled], ['month', false, false, false, false]);
        }
        assert.equal(items.find(context => context.item.id === 'trip').source.id, 'work');
        const resolver = await calls(page, 'getItemAppearance');
        assert.deepEqual(resolver.map(call => call.id).sort(), [...new Set(items.map(context => context.item.id))].sort(), 'one resolver call per item, not per segment');
        // Press on each part of the split bar reports the hit-tested date inside that segment.
        await resetCalls(page);
        for (const [index, expectedDate] of [[0, '2026-03-05'], [1, '2026-03-08']]) {
            await page.locator('#owner [data-item-id=trip]').nth(index).click({position: {x: 8, y: 6}}); await settle(page);
            const request = (await events(page, 'press')).at(-1); assert.equal(request.date, expectedDate); assert.equal(request.view, 'month');
        }
        await page.keyboard.press('Escape');
        await resetCalls(page); await openAgenda(page, '2026-03-09');
        const rows = await calls(page, 'renderAgendaItem'), rowClasses = await calls(page, 'class:agendaItem'), actionClasses = await calls(page, 'class:itemActions');
        const perItem = rows.reduce((map, context) => map.set(context.item.id, (map.get(context.item.id) ?? 0) + 1), new Map());
        assert.deepEqual([...perItem.keys()], ['trip'], 'one agenda item on 9 March');
        for (const context of [...rows, ...rowClasses]) { assert.equal(context.view, 'agenda'); assert.equal(context.date, '2026-03-09'); assert.equal('segmentRange' in context, false); }
        assert.deepEqual(actionClasses, [], 'no item actions without the pair, so no trigger class');
        const agendaState = (await calls(page, 'class:agenda')).at(-1);
        assert.deepEqual(agendaState, {date: '2026-03-09', presentation: 'popover', itemCount: 1});
        const name = await page.evaluate(() => { const row = window.deep('section[data-date] [data-item-id=trip] > [data-agenda-control=primary]')[0], tree = row.getRootNode();
            const [summary, content] = row.getAttribute('aria-labelledby').split(' ').map(value => tree.getElementById(value)?.textContent);
            return {summary, content, description: row.getAttribute('aria-describedby')}; });
        // T19: the visible custom content follows the default summary in the name (WCAG 2.5.3 label in name).
        assert.match(name.summary, /Trip/, 'the default summary starts the row name'); assert.match(name.content, /#trip/, 'the visible custom content is part of the name');
        assert.equal(name.description, null);
        const counts = new Map(); for (const call of await calls(page, 'getItemAppearance')) counts.set(call.id, (counts.get(call.id) ?? 0) + 1);
        assert.deepEqual([...counts], [], 'the agenda row reuses the appearance resolved for the Month segments');
        return {segments: items.length};
    });

    // ——— R51: two calendars, different themes/dir/portals, custom slots ———
    for (const secondRoot of ['document', 'shadow']) {
        await scenario(`R51 Document classic LTR + ${secondRoot} neutral RTL dark with its own portal: one grid Tab entry each; actions never nested; each portal keeps its calendar's theme; toolbar and retry controls are named in their own Tab order`, {
            server: true, secondRoot, viewport: {width: 1300, height: 1800},
            options: {layout: 'desktop', items: appearanceItems, slots: true, actions: true, dataState: {status: 'error', phase: 'refresh', error: 'offline'}, id: 'first'},
            second: {layout: 'desktop', locale: 'ar', themeName: 'neutral', colorScheme: 'dark', density: 'comfortable', items: appearanceItems, slots: true, stateSlots: true, actions: true,
                dataState: {status: 'error', phase: 'refresh', error: 'offline'}, portalId: secondRoot === 'shadow' ? 'owner2' : 'portal2', id: 'second', appearance}}, async page => {
            if (secondRoot === 'document') await page.evaluate(() => { const target = document.createElement('div'); target.id = 'portal2'; document.body.append(target); });
            // Re-render the second calendar so it reads the explicit container created above.
            await patch(page, {portalId: secondRoot === 'shadow' ? 'owner2' : 'portal2'}, 'cal2');
            await page.locator('#before').focus();
            const order = [];
            for (let i = 0; i < 40; i++) { await page.keyboard.press('Tab'); const focused = await info(page); order.push(focused); if (focused.id === 'after') break; }
            const summary = order.map(entry => `${entry.calendar ?? '-'}:${entry.role ?? entry.tag}:${entry.label ?? entry.text?.trim().slice(0, 20)}`);
            const gridStops = calendar => order.filter(entry => entry.calendar === calendar && entry.role === 'gridcell').length;
            assert.equal(gridStops('owner'), 1, `one grid Tab stop in the first calendar: ${summary.join(' | ')}`);
            assert.equal(gridStops('owner2'), 1, `one grid Tab stop in the second calendar: ${summary.join(' | ')}`);
            const named = order.filter(entry => entry.tag === 'BUTTON').map(entry => entry.label ?? entry.text?.trim());
            assert.ok(named.every(Boolean), `every button is named: ${summary}`);
            for (const calendar of ['owner', 'owner2']) {
                const list = order.filter(entry => entry.calendar === calendar).map(entry => entry.label ?? entry.text?.trim());
                const exportAt = list.indexOf('Export'), retryAt = list.findIndex(name => name === 'Retry' || name === 'Reload feed'), gridAt = order.filter(entry => entry.calendar === calendar).findIndex(entry => entry.role === 'gridcell');
                assert.ok(exportAt >= 0 && retryAt > exportAt && gridAt > retryAt, `${calendar}: toolbar extension, then retry, then grid: ${list}`);
            }
            assert.ok(order.some(entry => entry.calendar === 'owner' && entry.text?.trim() === 'Retry'), 'the standard retry without a custom error body');
            assert.ok(order.some(entry => entry.calendar === 'owner2' && entry.text?.trim() === 'Reload feed') && !order.some(entry => entry.calendar === 'owner2' && entry.text?.trim() === 'Retry'), 'a custom data-error body replaces the standard retry');
            const theme = () => page.evaluate(() => window.portals().map(node => ({theme: node.dataset.theme, dir: node.dataset.dir, scheme: node.dataset.colorScheme, density: node.dataset.density,
                lang: node.getAttribute('lang'), mismatch: window.mismatch(node, window.ownerOf(node)), owner: window.ownerOf(node).id, inShadow: node.getRootNode() instanceof ShadowRoot})));
            await openAgenda(page, '2026-03-04');
            const first = await theme();
            assert.deepEqual(first.map(entry => [entry.theme, entry.dir, entry.scheme, entry.density, entry.owner, entry.mismatch.length]), [['classic', 'ltr', 'system', 'compact', 'first', 0]]);
            const nested = await page.evaluate(() => window.deep('[data-item-id] > [data-agenda-control=primary]').filter(node => node.querySelector('button') || node.closest('[data-agenda-control=actions]')).length);
            assert.equal(nested, 0, 'no action trigger nested in an item button');
            await press(page, 'Escape');
            const second = page.locator(secondRoot === 'shadow' ? '#owner2 [role=gridcell][data-date="2026-03-04"]' : '#owner2 [role=gridcell][data-date="2026-03-04"]');
            await second.focus(); await press(page, 'Enter');
            const after = await theme();
            assert.deepEqual(after.map(entry => [entry.theme, entry.dir, entry.scheme, entry.density, entry.owner, entry.mismatch.length, entry.inShadow]),
                [['neutral', 'rtl', 'dark', 'comfortable', 'second', 0, secondRoot === 'shadow']], 'the second portal keeps its own theme and lives in its container');
            assert.equal(await page.evaluate(() => { const portal = window.portals()[0]; return window.composedClosest(portal, '#portal2') ? 'portal2' : portal.getRootNode().host?.id; }), secondRoot === 'shadow' ? 'owner2' : 'portal2');
            await page.locator(`[data-item-id=txt] > [data-agenda-control=actions]`).last().focus(); await press(page, 'Enter');
            const menu = await page.evaluate(() => { const node = window.deep('[role=menu]')[0]; return {theme: window.composedClosest(node, '.nc-theme')?.dataset.theme, dir: window.composedClosest(node, '.nc-theme')?.dataset.dir}; });
            assert.deepEqual(menu, {theme: 'neutral', dir: 'rtl'}, 'the nested item menu inherits the second calendar portal theme');
            assert.deepEqual(await page.evaluate(() => window.calendars().map(node => [node.id, node.dataset.theme, node.dataset.dir])), [['first', 'classic', 'ltr'], ['second', 'neutral', 'rtl']]);
            if (secondRoot === 'shadow') await screenshot(page, 'r51-two-calendars');
            return {order: summary};
        });
    }

    // ——— R60: stable data-* table ———
    const table = {'data-theme': 'theme', 'data-density': 'theme', 'data-color-scheme': 'theme', 'data-dir': 'theme', 'data-layout': 'root', 'data-status': 'root', 'data-loading-phase': 'root',
        'data-date': 'cell|agenda', 'data-today': 'cell', 'data-agenda-date': 'cell', 'data-selected': 'cell|item', 'data-selection-draft': 'cell', 'data-selection-unavailable': 'cell',
        'data-outside-month': 'cell', 'data-has-items': 'cell', 'data-item-id': 'item', 'data-view': 'item', 'data-dragging': 'item', 'data-pending': 'item', 'data-presentation': 'agenda'};
    const audit = (page, label) => page.evaluate(({table, label}) => {
        const kind = node => node.matches('.nc-calendar') ? 'root' : node.matches('.nc-theme') ? 'portal' : node.matches('[role=gridcell]') ? 'cell'
            : node.matches('section[data-presentation]') ? 'agenda' : node.matches('.nc-month-item, li.nc-agenda-item') ? 'item' : `other:${node.tagName}.${node.className}`;
        const allowed = {theme: ['root', 'portal'], root: ['root'], cell: ['cell'], agenda: ['agenda'], item: ['item']};
        const booleans = ['data-today', 'data-agenda-date', 'data-selected', 'data-selection-draft', 'data-selection-unavailable', 'data-outside-month', 'data-has-items', 'data-dragging', 'data-pending'];
        const literals = {'data-theme': ['classic', 'neutral'], 'data-density': ['compact', 'comfortable'], 'data-color-scheme': ['system', 'light', 'dark'], 'data-dir': ['ltr', 'rtl'],
            'data-layout': ['mobile', 'desktop'], 'data-status': ['ready', 'loading', 'error'], 'data-loading-phase': ['initial', 'refresh'], 'data-view': ['month', 'agenda'], 'data-presentation': ['inline', 'popover', 'sheet']};
        const problems = [], seen = {};
        for (const [name, where] of Object.entries(table)) for (const node of window.deep(`[${name}]`)) {
            const value = node.getAttribute(name), type = kind(node);
            seen[name] = (seen[name] ?? 0) + 1;
            if (!where.split('|').flatMap(key => allowed[key] ?? [key]).includes(type)) problems.push(`${label}: ${name} on ${type}`);
            if (booleans.includes(name) && value !== 'true') problems.push(`${label}: ${name}="${value}"`);
            if (literals[name] && !literals[name].includes(value)) problems.push(`${label}: ${name}="${value}"`);
            if ((name === 'data-date') && !/^\d{4}-\d{2}-\d{2}$/.test(value)) problems.push(`${label}: ${name}="${value}"`);
        }
        for (const root of window.calendars()) {
            if (root.dataset.status !== 'loading' && root.hasAttribute('data-loading-phase')) problems.push(`${label}: data-loading-phase without loading`);
            for (const name of ['data-theme', 'data-layout', 'data-density', 'data-color-scheme', 'data-dir', 'data-status']) if (!root.hasAttribute(name)) problems.push(`${label}: root without ${name}`);
        }
        for (const portal of window.portals()) {
            const owner = window.ownerOf(portal);
            for (const name of ['data-theme', 'data-density', 'data-color-scheme', 'data-dir', 'lang']) if (portal.getAttribute(name) !== owner.getAttribute(name)) problems.push(`${label}: portal ${name} differs from its owner`);
            for (const name of ['data-layout', 'data-status', 'data-loading-phase']) if (portal.hasAttribute(name)) problems.push(`${label}: portal has ${name}`);
        }
        for (const node of window.deep('[role=gridcell]')) for (const name of ['data-date']) if (!node.hasAttribute(name)) problems.push(`${label}: cell without ${name}`);
        for (const node of window.deep('.nc-month-item, li.nc-agenda-item')) if (!node.dataset.itemId || !node.dataset.view) problems.push(`${label}: item wrapper without id/view`);
        return {problems, seen};
    }, {table, label});
    await scenario('R60 data-* table: root, cells, Month items, popover agenda, item menu, source menu and a second themed calendar carry only their normative attributes with exact literals', {
        server: true, viewport: {width: 1300, height: 1800},
        options: {layout: 'desktop', items: appearanceItems, sources, visibleSourceIds: ['work', 'home'], filter: true, actions: true, controlledAgenda: true, agendaDate: '2026-03-04', id: 'first'},
        second: {layout: 'mobile', locale: 'ar', themeName: 'neutral', colorScheme: 'dark', density: 'comfortable', items: appearanceItems, id: 'second'}}, async page => {
        const seen = {}, merge = result => { for (const [name, count] of Object.entries(result.seen)) seen[name] = (seen[name] ?? 0) + count; return result.problems; };
        const problems = [...merge(await audit(page, 'closed'))];
        await openAgenda(page, '2026-03-05'); await patch(page, {agendaDate: '2026-03-05'});
        problems.push(...merge(await audit(page, 'popover')));
        await page.locator('[data-item-id=trip] > [data-agenda-control=actions]').first().focus(); await press(page, 'Enter');
        problems.push(...merge(await audit(page, 'item menu')));
        await press(page, 'Escape'); await press(page, 'Escape');
        await page.locator('#owner [data-source-selector]').click(); await settle(page);
        problems.push(...merge(await audit(page, 'source menu')));
        await press(page, 'Escape');
        const literals = await page.evaluate(() => {
            const [first, second] = window.calendars(), cell = date => first.querySelector(`[role=gridcell][data-date="${date}"]`);
            return {first: [first.dataset.theme, first.dataset.layout, first.dataset.density, first.dataset.colorScheme, first.dataset.dir, first.dataset.status],
                second: [second.dataset.theme, second.dataset.layout, second.dataset.density, second.dataset.colorScheme, second.dataset.dir, second.dataset.status],
                today: cell('2026-03-04').dataset.today, agenda: cell('2026-03-05').dataset.agendaDate, empty: cell('2026-03-01').hasAttribute('data-has-items'),
                outside: first.querySelector('[role=gridcell][data-date="2026-04-02"]')?.dataset.outsideMonth, inline: second.querySelector('[data-presentation]')?.dataset.presentation};
        });
        assert.deepEqual(literals, {first: ['classic', 'desktop', 'compact', 'system', 'ltr', 'ready'], second: ['neutral', 'mobile', 'comfortable', 'dark', 'rtl', 'ready'],
            today: 'true', agenda: 'true', empty: false, outside: 'true', inline: 'inline'});
        for (const [dataState, status, phase] of [[{status: 'loading', phase: 'initial'}, 'loading', 'initial'], [{status: 'loading', phase: 'refresh'}, 'loading', 'refresh'], [{status: 'error', phase: 'refresh', error: 'x'}, 'error', null]]) {
            await patch(page, {dataState});
            assert.deepEqual(await page.evaluate(() => [window.calendars()[0].dataset.status, window.calendars()[0].getAttribute('data-loading-phase')]), [status, phase]);
            problems.push(...merge(await audit(page, `state ${status}/${phase}`)));
        }
        await patch(page, {dataState: {status: 'ready'}, timeZone: 'Mars/Base'});
        const contract = await page.evaluate(() => { const node = window.calendars()[0]; return [node.dataset.theme, node.dataset.layout, node.dataset.density, node.dataset.colorScheme, node.dataset.status, node.hasAttribute('data-loading-phase'),
            node.querySelectorAll('[data-date], [data-item-id], [data-view], [data-presentation]').length]; });
        assert.deepEqual(contract, ['classic', 'mobile', 'compact', 'system', 'error', false, 0], 'the contract shell has the safe-shell values and no view attributes');
        problems.push(...merge(await audit(page, 'contract')));
        assert.deepEqual(problems, []);
        for (const name of ['data-theme', 'data-layout', 'data-density', 'data-color-scheme', 'data-dir', 'data-status', 'data-loading-phase', 'data-date', 'data-today', 'data-agenda-date',
            'data-outside-month', 'data-has-items', 'data-item-id', 'data-view', 'data-presentation']) assert.ok(seen[name] > 0, `${name} was exercised`);
        return {seen};
    });

    // ——— R15.2: RTL viewer navigation ———
    for (const [locale, dir] of [['ar', undefined], ['en-US', 'rtl']]) for (const rootScope of ['document', 'shadow']) {
        await scenario(`R15.2 ${rootScope}, ${locale}${dir ? ' dir=rtl' : ''}: RTL arrows follow the visual direction; delayed PageDown keeps 31 January, clamps to 28 February after acceptance; a late acceptance after Tab-away keeps external focus`, {
            root: rootScope, server: true, options: {layout: 'desktop', locale, ...(dir ? {dir} : {}), anchorDate: '2026-01-01', today: '2026-01-15', items: [], slots: true}}, async page => {
            assert.equal(await page.evaluate(() => window.calendars()[0].dataset.dir), 'rtl');
            const x = date => page.evaluate(date => window.calendars()[0].querySelector(`[role=gridcell][data-date="${date}"]`).getBoundingClientRect().left, date);
            assert.ok(await x('2026-01-28') < await x('2026-01-27'), 'a later date in the same row is to the left in RTL');
            await cell(page, '2026-01-30').focus(); await press(page, 'ArrowLeft'); assert.equal((await info(page)).date, '2026-01-31', 'ArrowLeft moves forward in RTL');
            await press(page, 'PageDown');
            assert.deepEqual(await events(page, 'navigate'), ['2026-02-01']); assert.equal((await info(page)).date, '2026-01-31', 'the old month keeps focus until acceptance');
            await patch(page, {anchorDate: '2026-02-01'}); assert.equal((await info(page)).date, '2026-02-28', 'clamped after acceptance');
            await press(page, 'ArrowRight'); assert.equal((await info(page)).date, '2026-02-27', 'ArrowRight moves back in RTL');
            await press(page, 'Home'); const home = (await info(page)).date; await press(page, 'End'); const end = (await info(page)).date;
            assert.ok(await x(home) > await x(end), 'Home is the visual start (right) of the row in RTL');
            await press(page, 'PageDown'); assert.deepEqual(await events(page, 'navigate'), ['2026-02-01', '2026-03-01']);
            await page.locator('#between').focus(); await settle(page);
            await patch(page, {anchorDate: '2026-03-01'});
            assert.equal((await info(page)).id, 'between', 'a late acceptance does not steal focus');
            assert.equal(await page.evaluate(() => window.calendars()[0].querySelector('[role=gridcell][tabindex="0"]').dataset.date), end.replace('2026-02', '2026-03'));
            if (rootScope === 'document' && locale === 'ar') await screenshot(page, 'r15-rtl-ar');
        });
    }

    // ——— R33/R34: comparator, +N and one global order ———
    const twins = ['d', 'b', 'c', 'a', 'e'].map(id => allDay(id, 'Same', '2026-03-04', undefined, {calendarId: id === 'e' ? 'home' : 'work'}));
    const crossing = [allDay('x', 'Crossing X', '2026-03-05', '2026-03-11'), allDay('y', 'Crossing Y', '2026-03-06', '2026-03-10')];
    await scenario('R33: identical items with a comparator returning 0 order by id in grid and agenda; +N counts only filtered-in hidden records, reserves its row and updates atomically at 0/1/several lanes', {
        server: true, viewport: {width: 1200, height: 1000}, options: {layout: 'desktop', items: [...twins, ...crossing], flatSort: true, sources, visibleSourceIds: ['work'], filter: true,
            controlledAgenda: true, agendaDate: '2026-03-01'}}, async page => {
        const state = () => page.evaluate(() => {
            const root = window.calendars()[0], cellNode = root.querySelector('[role=gridcell][data-date="2026-03-04"]'), week = cellNode.closest('[role=row]');
            const lanes = [...week.querySelectorAll('.nc-month-item')].filter(node => ['a', 'b', 'c', 'd', 'e'].includes(node.dataset.itemId)).sort((p, q) => p.getBoundingClientRect().top - q.getBoundingClientRect().top);
            const overflow = cellNode.querySelector('.nc-overflow'), box = cellNode.getBoundingClientRect();
            const bottom = Math.max(0, ...[...week.querySelectorAll('.nc-month-item')].map(node => node.getBoundingClientRect())
                .filter(rect => rect.left < box.right - 1 && rect.right > box.left + 1).map(rect => rect.bottom));
            return {visible: lanes.map(node => node.dataset.itemId), hidden: overflow ? Number(overflow.textContent.replace(/\D/g, '')) : 0,
                overflowClear: !overflow || overflow.getBoundingClientRect().top >= bottom - 0.5, inside: !overflow || overflow.getBoundingClientRect().bottom <= box.bottom + 0.5,
                text: window.cellText('2026-03-04')};
        });
        const results = {};
        for (const height of [520, 700, 1100, 1600]) {
            await page.evaluate(height => { window.calendars()[0].style.blockSize = `${height}px`; }, height);
            // The first frame after the resize already shows lanes and N of the same measurement (atomic update).
            const frame = await page.evaluate(() => new Promise(done => requestAnimationFrame(() => {
                const cellNode = window.calendars()[0].querySelector('[role=gridcell][data-date="2026-03-04"]'), week = cellNode.closest('[role=row]');
                const visible = [...week.querySelectorAll('.nc-month-item')].filter(node => ['a', 'b', 'c', 'd'].includes(node.dataset.itemId)).length;
                const overflow = cellNode.querySelector('.nc-overflow'); done(visible + (overflow ? Number(overflow.textContent.replace(/\D/g, '')) : 0));
            })));
            await settle(page);
            const current = await state(); results[height] = current;
            assert.equal(frame, 4, `${height}px: the first painted frame is consistent`);
            assert.equal(current.visible.length + current.hidden, 4, `${height}px: lanes + N = the 4 filtered-in records (the hidden source is not counted)`);
            assert.deepEqual(current.visible, ['a', 'b', 'c', 'd'].slice(0, current.visible.length), 'id tie-break in lanes');
            assert.ok(current.overflowClear && current.inside, `${height}px: +N has its own row inside the cell: ${JSON.stringify(current)}`);
            assert.equal((current.text.match(/hidden/g) ?? []).length, current.hidden ? 1 : 0, 'exactly one moreItemsLabel when N > 0');
        }
        const laneCounts = new Set(Object.values(results).map(entry => entry.visible.length));
        assert.ok(laneCounts.has(0) && laneCounts.has(1) && [...laneCounts].some(count => count > 1), `0, 1 and several lanes were reached: ${[...laneCounts]}`);
        await page.evaluate(() => { window.calendars()[0].style.blockSize = '520px'; }); await settle(page);
        const overflow = page.locator('#owner [role=gridcell][data-date="2026-03-04"] .nc-overflow');
        assert.deepEqual(await overflow.evaluate(node => [node.closest('[aria-hidden=true]') !== null, node.tabIndex, node.getAttribute('role')]), [true, -1, null], 'not an accessibility or Tab target');
        await overflow.click(); await settle(page);
        assert.deepEqual(await events(page, 'agenda'), ['2026-03-04'], 'one activation of the owning date');
        await patch(page, {agendaDate: '2026-03-04'});
        assert.deepEqual(await page.evaluate(() => window.deep('section[data-date] [data-item-id]').map(node => node.dataset.itemId)), ['a', 'b', 'c', 'd'], 'agenda order = grid order');
        assert.ok((await calls(page, 'sortItems')).every(context => JSON.stringify(context) === '{"timeZone":"UTC"}'), 'the comparator gets only the zone');
        return results;
    });
    await scenario('R34: two crossing multi-day items with a consumer comparator keep one global order in every date, the agenda and continuation lanes; the context is only the zone', {
        server: true, viewport: {width: 1200, height: 1000}, options: {layout: 'desktop', items: [...crossing, allDay('z', 'Single', '2026-03-09')], reverseSort: true, tokens: {density: {dayMinHeight: '140px'}}}}, async page => {
        const lanes = await page.evaluate(() => window.deep('.nc-month-item').map(node => ({id: node.dataset.itemId, week: node.closest('[role=row]').dataset.week, top: Math.round(node.getBoundingClientRect().top)})));
        const byWeek = {}; for (const entry of lanes) (byWeek[entry.week] ??= []).push(entry);
        for (const [week, entries] of Object.entries(byWeek)) {
            const order = entries.sort((p, q) => p.top - q.top).map(entry => entry.id);
            assert.deepEqual(order, ['z', 'y', 'x'].filter(id => order.includes(id)), `reverse id order in week ${week}: ${order}`);
        }
        assert.equal(Object.keys(byWeek).length, 2, 'both items continue into the next week');
        for (const date of ['2026-03-06', '2026-03-09']) {
            await openAgenda(page, date);
            assert.deepEqual(await page.evaluate(() => window.deep('section[data-date] [data-item-id]').map(node => node.dataset.itemId)), ['z', 'y', 'x'].filter(id => id !== 'z' || date === '2026-03-09'), `agenda ${date}`);
            await press(page, 'Escape');
        }
        const contexts = await calls(page, 'sortItems');
        assert.ok(contexts.length > 0 && contexts.every(context => JSON.stringify(context) === '{"timeZone":"UTC"}'), 'context has only timeZone');
        return {weeks: byWeek};
    });

    // ——— §10.4: passive slot diagnostics in Chrome ———
    await scenario('§10.4 passive slot diagnostics: an interactive descendant in renderItem gets one development warning; passive slots stay silent', {
        server: true, options: {layout: 'desktop', items: appearanceItems, interactive: true}}, async (page, {warnings}) => {
        await patch(page, {density: 'comfortable'});
        const found = libraryWarnings(warnings).filter(text => text.includes('renderItem'));
        assert.equal(found.length, 1, JSON.stringify(found)); assert.match(found[0], /Interactive content <a href>/);
        return {warning: found[0]};
    });
    await scenario('§10.4 passive slots: custom item/day content keeps the cell names, a single grid Tab stop and no tabbable descendants in the grid', {
        server: true, options: {layout: 'desktop', items: appearanceItems, slots: true}}, async (page, {warnings}) => {
        const grid = await page.evaluate(() => { const node = window.calendars()[0].querySelector('[role=grid]');
            return {tabbable: [...node.querySelectorAll('a[href], button, input, [tabindex]')].filter(element => element.tabIndex >= 0).length, chips: node.querySelectorAll('.probe-chip').length,
                header: node.querySelector('[data-date="2026-03-04"] .nc-day-header').textContent, name: window.cellText('2026-03-04')}; });
        assert.equal(grid.tabbable, 1, 'only the roving cell'); assert.ok(grid.chips > 0); assert.equal(grid.header, '4 •'); assert.match(grid.name, /March 4, 2026/);
        assert.deepEqual(libraryWarnings(warnings).filter(text => !text.includes('calendarId')), [], 'passive content is not diagnosed');
    });

    // ——— Forced colors and reduced motion ———
    await scenario('forced colors: package surfaces use system colors over theme, tokens, source and appearance colors; focus stays visible', {
        server: true, media: {forcedColors: 'active'}, options: {layout: 'desktop', items: appearanceItems, sources, visibleSourceIds: ['work', 'home'], filter: true, appearance, tokens: baseTokens}}, async page => {
        await cell(page, '2026-03-04').focus(); await press(page, 'ArrowRight');
        const state = await page.evaluate(() => {
            const item = window.deep('[data-item-id=tour]')[0], marker = item.querySelector('.nc-item-accent > span'), focused = window.active(), ring = getComputedStyle(focused, '::after');
            const outline = focused.matches(':focus-visible') && ring.borderTopStyle === 'solid' && Number.parseFloat(ring.borderTopWidth) >= 2 ? ring.borderTopColor : null;
            return {background: getComputedStyle(item).backgroundColor, text: getComputedStyle(item).color, accent: getComputedStyle(marker).borderInlineStartColor, border: getComputedStyle(item).borderTopStyle, outline,
                forced: matchMedia('(forced-colors: active)').matches};
        });
        assert.equal(state.forced, true);
        assert.notEqual(state.background, 'rgb(250, 250, 210)'); assert.notEqual(state.text, 'rgb(60, 10, 10)'); assert.notEqual(state.accent, 'rgb(1, 2, 3)');
        assert.equal(state.border, 'solid', 'items keep a visible system-colored box'); assert.ok(state.outline, 'the focus indicator is visible');
        await screenshot(page, 'forced-colors');
        return state;
    });
    // ——— Spec v8 (decisions 2026-10-22) ———
    // Decision 2, §10.3.3: the single-declaration rule of §10.3.2 applies to CalendarSource.color and every getItemAppearance color.
    const offending = ['red;position:fixed;inset:0;z-index:2147483647', String.raw`u\72l(https://example.invalid/a.gif)`, 'blue !important', 'rgb(1, 2, 3',
        'red)', '"open', '/* open', 'url(https://example.invalid/p.gif)', 'image-set(url(https://example.invalid/i.png) 1x)'];
    const v8Colors = {layout: 'mobile', tokens: baseTokens, filter: true,
        items: [...offending.map((_, index) => allDay(`s${index}`, `Source ${index}`, '2026-03-04', undefined, {calendarId: `bad${index}`})),
            ...offending.map((_, index) => allDay(`a${index}`, `Appearance ${index}`, '2026-03-04', undefined, {calendarId: 'work'}))],
        sources: [sources[0], ...offending.map((color, index) => ({id: `bad${index}`, title: `Bad ${index}`, color}))],
        visibleSourceIds: ['work', ...offending.map((_, index) => `bad${index}`)],
        appearance: Object.fromEntries(offending.map((color, index) => [`a${index}`, {accentColor: color, backgroundColor: color, textColor: color}]))};
    await scenario('spec v8 §10.3.3 SSR: a source color or appearance color that is not one declaration value (top-level ; or !, unbalanced quotes, brackets or comments, any url( also escaped) is absent on the server, at hydration and in a client render; the lower channel stays; nothing is requested', {
        server: true, viewport: {width: 420, height: 1400}, options: v8Colors}, async (page, {warnings}) => {
        const html = esm.serverThemes(v8Colors).html;
        assert.doesNotMatch(html, /position:\s*fixed|example\.invalid|!important|u\\72l|"open|\/\*/, 'no offending value reaches the server markup');
        const requests = []; page.on('request', request => { if (request.url().includes('example.invalid')) requests.push(request.url()); });
        const declarations = which => page.evaluate(which => {
            const container = which === 'server' ? document.querySelector('#owner .fixture') : document.querySelector('#client');
            return [...container.querySelectorAll('[data-item-id], [data-item-id] *')].map(node => [node.dataset?.itemId ?? node.className, [...node.style].map(name => `${name}:${node.style.getPropertyValue(name)}`).join(';')]);
        }, which);
        const server = await declarations('server');
        await page.evaluate(async ({options, moduleUrl}) => { const module = await import(moduleUrl); const client = Object.assign(document.createElement('div'), {id: 'client'});
            document.body.append(client); window.client = await module.renderThemes(client, options); }, {options: v8Colors, moduleUrl});
        assert.deepEqual(await declarations('client'), server, 'server markup and a client render parse to the same declarations');
        assert.ok(server.every(([, text]) => !/position|z-index|url|important/.test(text)), JSON.stringify(server));
        for (let index = 0; index < offending.length; index++) {
            const source = (await colorsOf(page, `s${index}`)).find(entry => entry.view === 'agenda'), item = (await colorsOf(page, `a${index}`)).find(entry => entry.view === 'agenda');
            assert.deepEqual(source, {view: 'agenda', accent: base.accent, background: base.background, text: base.text}, `offending source color ${index}: the theme accent stays`);
            assert.deepEqual(item, {view: 'agenda', accent: 'rgb(10, 120, 40)', background: base.background, text: base.text}, `offending appearance ${index}: the source accent and the item tokens stay`);
        }
        const position = await page.evaluate(() => window.deep('.nc-calendar, [data-item-id], [data-item-id] *').filter(node => getComputedStyle(node).position === 'fixed').length);
        assert.equal(position, 0, 'no element became fixed');
        const found = libraryWarnings(warnings);
        for (let index = 0; index < offending.length; index++) for (const path of [`sources("bad${index}").color`, `getItemAppearance("a${index}").accentColor`, `getItemAppearance("a${index}").backgroundColor`, `getItemAppearance("a${index}").textColor`]) {
            assert.equal(found.filter(text => text === `[@nelmad/calendar] ${path}: Expected a single CSS declaration value; ignored`).length, 2, `one warning per instance (hydrated and client) for ${path}`);
        }
        await settle(page); assert.deepEqual(requests, [], 'no offending url( is fetched');
        return {declarations: server.length, values: offending.length, warnings: found.length};
    });
    // Decision 4, §12.1: the computed name of a custom agenda row is the package summary followed by the visible slot content.
    const axName = async (page, selector) => {
        const session = await page.context().newCDPSession(page);
        try {
            const {result} = await session.send('Runtime.evaluate', {expression: `window.deep(${JSON.stringify(selector)})[0]`});
            assert.ok(result.objectId, `found ${selector}`);
            const {nodes} = await session.send('Accessibility.getPartialAXTree', {objectId: result.objectId, fetchRelatives: false});
            return {role: nodes[0]?.role?.value, name: nodes[0]?.name?.value, description: nodes[0]?.description?.value ?? ''};
        } finally { await session.detach(); }
    };
    const nameItems = [allDay('trip', 'Trip', '2026-03-04', '2026-03-06', {calendarId: 'work'}), allDay('note', 'Note', '2026-03-04')];
    for (const [layout, agendaPresentation] of [['desktop', 'auto'], ['mobile', 'auto'], ['mobile', 'overlay']]) {
        for (const rootScope of ['document', 'shadow']) await scenario(`spec v8 §12.1 ${rootScope} ${layout}/${agendaPresentation}: the Chrome accessible name of a renderAgendaItem row is the package summary followed by the visible slot content; without the slot it is the summary alone`, {
            root: rootScope, server: true, viewport: layout === 'mobile' ? {width: 420, height: 900} : {width: 1200, height: 900}, options: {layout, agendaPresentation, items: nameItems, sources}}, async page => {
            const row = id => `section[data-date] [data-item-id=${id}] > [data-agenda-control=primary]`;
            const open = async () => { if (layout === 'desktop' || agendaPresentation === 'overlay') await openAgenda(page, '2026-03-04'); };
            await open();
            const plain = {trip: await axName(page, row('trip')), note: await axName(page, row('note'))};
            assert.equal(plain.trip.role, 'button'); assert.match(plain.trip.name, /^Trip.*Work$/); assert.match(plain.note.name, /^Note/);
            await press(page, 'Escape'); await patch(page, {slots: true}); await open();
            const custom = {trip: await axName(page, row('trip')), note: await axName(page, row('note'))};
            assert.equal(custom.trip.name, `${plain.trip.name} Trip #trip`, 'summary, then the visible content'); assert.equal(custom.note.name, `${plain.note.name} Note #note`);
            assert.equal(custom.trip.description, '', 'the visible content is part of the name, not a description');
            const visible = await page.evaluate(selector => window.deep(selector)[0].querySelector('[data-nc-slot]').innerText.trim(), row('trip'));
            assert.ok(custom.trip.name.endsWith(visible), `WCAG 2.5.3: the visible label "${visible}" is in the name`);
            return {plain, custom};
        });
    }
    await scenario('reduced motion: optional transitions and animations stop whatever motion.duration says; without the preference the token drives transitions', {
        server: true, options: {layout: 'desktop', items: appearanceItems, dataState: {status: 'loading', phase: 'refresh'}, tokens: {motion: {duration: '400ms'}}}}, async page => {
        const read = () => page.evaluate(() => ({button: getComputedStyle(window.calendars()[0].querySelector('.nc-button')).transitionDuration,
            progress: getComputedStyle(window.calendars()[0].querySelector('.nc-calendar-progress-indicator')).animationName}));
        const normal = await read();
        await page.emulateMedia({reducedMotion: 'reduce'}); await settle(page);
        const reduced = await read();
        assert.equal(normal.button, '0.4s'); assert.notEqual(normal.progress, 'none');
        assert.equal(reduced.button, '0s'); assert.equal(reduced.progress, 'none');
        return {normal, reduced};
    });
} finally { await browser.close(); }
const sourcePaths = ['src/v02/core/appearance.ts', 'src/v02/core/cssValue.ts', 'src/v02/core/validation.ts', 'src/v02/core/layout.ts', 'src/v02/core/month.ts', 'src/v02/themes/classic.ts', 'src/v02/themes/neutral.ts',
    'src/v02/calendar/slots.tsx', 'src/v02/calendar/MonthView.tsx', 'src/v02/calendar/DayAgendaBody.tsx', 'src/v02/calendar/CalendarShell.tsx', 'src/v02/calendar/CalendarMonth.tsx',
    'src/v02/calendar/SourceSelector.tsx', 'src/v02/calendar/overlays.tsx', 'src/v02/calendar/model.ts', 'src/v02/calendar/useCalendarController.ts', 'src/v02/calendar/useMonthMeasurements.ts',
    'src/v02/primitives/ThemeRoot.tsx', 'src/v02/primitives/serverStyle.ts', 'src/v02/primitives/PortalTheme.tsx', 'src/v02/primitives/mirror.ts', 'src/v02/primitives/controls.tsx', 'src/v02/primitives/overlays.tsx',
    'src/v02/surface.ts', 'src/v02/public.ts', 'src/v02/styles.css', 'src/index.ts', 'src/Calendar.tsx',
    'scripts/implementation/themes-slots-entry.tsx', 'scripts/implementation/themes-slots-probe.mjs', 'package.json', 'package-lock.json', 'scripts/implementation/spikes/package-lock.json'];
const report = {capturedAt: new Date().toISOString(), outcome: !only && checks.length > 0 && checks.every(c => c.outcome === 'pass') && !errors.length && !consoleErrors.length ? 'pass' : 'fail',
    filter: only ? String(only) : null, node: process.version, browser: version, react: 'bundled from the root lockfile, development build', checks, errors, consoleErrors,
    scope: 'T18 themes, tokens, item appearance, content/class slots, stable data-* attributes and RTL through the public Calendar (development StrictMode unless exact call counts are needed, SSR + hydration) in Document and open ShadowRoot root scopes: §10.2 theme × density × colorScheme matrix, R61 27 sentinels/precedence/mirror checkpoints, R62 appearance channels (LTR/RTL), R63 SSR stability, bad sizing and UA-rejected colors, R35.2 slot/class contexts, R51 two calendars with different themes/dir/portals, R60 data-* table, R15.2 RTL viewer navigation, R33/R34 comparator rows, passive slot diagnostics, forced colors and reduced motion; spec v8 (2026-10-22): the single-declaration rule for source and appearance colors on server/hydration/client and the Chrome accessible name of a renderAgendaItem row (summary, then visible content) in popover, inline agenda and sheet. Manual AT, Firefox/Safari, physical devices and selection/move parts (beta.1) are out of scope.',
    sourceHashes: Object.fromEntries(sourcePaths.map(path => [path, existsSync(resolve(root, path)) ? createHash('sha256').update(readFileSync(resolve(root, path))).digest('hex') : 'missing']))};
writeFileSync(resolve(output, 'browser.json'), JSON.stringify(report, null, 2) + '\n');
console.log(`Themes/slots: ${checks.filter(c => c.outcome === 'pass').length}/${checks.length}; ${errors.length} page errors; ${consoleErrors.length} console errors; ${output}`);
if (report.outcome === 'fail') process.exitCode = 1;
