import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdirSync, mkdtempSync, readFileSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {build} from 'vite';

// Review 2026-10-09-3 real-Chrome probe (black-box findings on the packed candidate): the calendar inside React Aria Components
// Modal/Popover hosts (role="dialog" without aria-modal), host h2/h3/p element rules and a preflight reset, the package scroll
// lock with a custom-styled classic scrollbar under layout="auto", §12.3 recovery from the inline agenda after an external month
// change, the roving Tab stop without `today`, weekday labels at 320 px and 200% text, `+N` in narrow columns and the grid
// description at the supported bounds.
// Usage: node scripts/implementation/review3-probe.mjs <outputDir>   (CALENDAR_PROBE_ONLY=<regexp> marks a partial run)
const here = dirname(fileURLToPath(import.meta.url)), root = resolve(here, '../..');
const output = resolve(process.argv[2] ?? mkdtempSync(resolve(tmpdir(), 'calendar-review3-')));
mkdirSync(output, {recursive: true});
const directory = mkdtempSync(resolve(tmpdir(), 'calendar-review3-build-'));
await build({configFile: false, logLevel: 'error', define: {'process.env.NODE_ENV': '"development"'}, mode: 'development',
    build: {outDir: directory, minify: false, lib: {entry: resolve(here, 'review3-entry.tsx'), formats: ['es'], fileName: () => 'index.mjs'}}});
const moduleUrl = 'data:text/javascript;base64,' + readFileSync(resolve(directory, 'index.mjs')).toString('base64');
const css = readFileSync(resolve(root, 'src/v02/styles.css'), 'utf8');
const {chromium} = await import('./spikes/node_modules/playwright/index.mjs');
const browser = await chromium.launch({channel: 'chrome', headless: true});
// Space-taking scrollbars. `classic`: native classic scrollbars, as on Windows/Linux or macOS "always show scroll bars"
// (responsive-probe QA-04). `overlay`: the platform default of macOS (overlay scrollbars), where only a page that styles its
// scrollbar with ::-webkit-scrollbar gets a classic one (the finding's setup).
const browsers = {};
const scrollbarBrowser = async mode => browsers[mode] ??= await chromium.launch({channel: 'chrome', headless: true, ignoreDefaultArgs: ['--hide-scrollbars'],
    ...(mode === 'classic' ? {args: ['--disable-features=OverlayScrollbar,OverlayScrollbars']} : {})});
const checks = [], errors = [], consoleErrors = [], version = browser.version();
const only = process.env.CALENDAR_PROBE_ONLY ? new RegExp(process.env.CALENDAR_PROBE_ONLY) : null;
const check = async (name, operation) => {
    if (only && !only.test(name)) return;
    try { const details = await operation(); checks.push({name, outcome: 'pass', ...(details ? {details} : {})}); }
    catch (error) { checks.push({name, outcome: 'fail', error: String(error?.stack ?? error)}); }
    writeFileSync(resolve(output, 'checks.json'), JSON.stringify(checks, null, 2) + '\n');
    console.log(`${checks.at(-1).outcome}: ${name}${checks.at(-1).error ? '\n' + checks.at(-1).error : ''}`);
};
const settle = (page, frames = 6) => page.evaluate(async frames => { for (let i = 0; i < frames; i++) await new Promise(requestAnimationFrame); }, frames);
const items = [{id: 'a', title: 'Offsite long multi day bar', data: {}, interval: {kind: 'allDay', start: '2026-09-08', end: '2026-09-12'}},
    {id: 'b', title: 'Review', data: {}, interval: {kind: 'timed', start: '2026-09-10T09:00:00Z', end: '2026-09-10T10:00:00Z'}}];
const base = {items, anchorDate: '2026-09-01', today: '2026-09-10', timeZone: 'Europe/Moscow', locale: 'en-US'};
/**
 * `kind`: mount | modal | popover (`own` passes the host dialog as portalContainer). `script` runs in the page before
 * mounting and may adjust `window.props`. `scrollbars` ('classic' | 'overlay') launches Chrome with page scrollbars shown. `clock` installs
 * Playwright's fake clock at that instant before the page loads.
 */
async function setup({props = {}, kind = 'mount', own = false, viewport = {width: 1300, height: 900}, colorScheme = 'light', head = '', html = '<div id="owner"></div>',
    script = '', scrollbars = null, clock = null} = {}) {
    const context = await (scrollbars ? await scrollbarBrowser(scrollbars) : browser).newContext({viewport, colorScheme}), page = await context.newPage();
    page.setDefaultTimeout(4000);
    const warnings = [];
    page.on('pageerror', error => errors.push(String(error)));
    page.on('console', message => {
        if (message.type() === 'error') consoleErrors.push(message.text().slice(0, 300));
        else if (message.type() === 'warning') warnings.push(message.text());
    });
    if (clock) await page.clock.install({time: new Date(clock)});
    await page.setContent(`<!doctype html><html><head><style>body{margin:0;font:16px/1.4 system-ui}</style><style>${css}</style>${head}</head><body>${html}</body></html>`);
    await page.evaluate(async ({moduleUrl, props, kind, own, script}) => {
        const module = await import(moduleUrl);
        window.props = {...props, onNavigate() {}, ...(props.withPress === false ? {} : {onItemPress(request) { (window.presses ??= []).push(request.item.id); }})};
        delete window.props.withPress;
        if (props.actions) { delete window.props.actions; Object.assign(window.props, {getItemActions: () => [{id: 'edit', label: 'Edit'}], onItemActionRequest() {}}); }
        if (props.sources) Object.assign(window.props, {onVisibleSourceIdsChange() {}});
        await (new Function('return (async () => {' + script + '})()'))();
        window.active = () => { let node = document.activeElement; while (node?.shadowRoot?.activeElement) node = node.shadowRoot.activeElement; return node; };
        window.info = () => { const node = window.active(); return {tag: node?.tagName, date: node?.dataset?.date, item: node?.closest?.('[data-item-id]')?.dataset.itemId, text: node?.textContent?.slice(0, 40)}; };
        window.roving = () => [...document.querySelectorAll('[role=gridcell]')].filter(node => node.tabIndex === 0).map(node => node.dataset.date);
        const owner = document.querySelector('#owner');
        window.cal = kind === 'mount' ? module.mount(owner, window.props) : module.mountHosted(owner, window.props, kind, own);
    }, {moduleUrl, props: {...base, ...props}, kind, own, script});
    await settle(page);
    return {page, context, warnings};
}
async function scenario(name, config, body) {
    await check(name, async () => {
        const fixture = await setup(config);
        try { return await body(fixture.page, fixture); } finally { await fixture.context.close(); }
    });
}
const info = page => page.evaluate(() => window.info());
const cell = (page, date) => page.locator(`[role=gridcell][data-date="${date}"]`);
const patch = async (page, props) => { await page.evaluate(props => window.cal.patch(props), props); await settle(page); };
const portalWarnings = warnings => warnings.filter(text => text.includes('portalContainer'));
const unmarked = '[@nelmad/calendar] portalContainer: The calendar is inside a role="dialog" element without aria-modal="true", so the agenda and menus render in document.body; '
    + 'a dialog or popover library that traps focus or closes on outside focus closes them (or itself) at once. Pass that dialog element as portalContainer, or document.body to keep this default';
const agendaState = page => page.evaluate(() => {
    const agenda = document.querySelector('.nc-day-list[data-presentation]:not([data-presentation=inline])');
    return {agenda: !!agenda, host: !!document.querySelector('#host-dialog'), focusInAgenda: !!agenda?.contains(window.active()), inHost: !!agenda?.closest('#host-dialog'), active: window.info()};
});
/** WCAG relative-luminance contrast of two computed `rgb()` colors. */
const contrast = (a, b) => {
    const channel = value => { const c = value / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
    const luminance = color => { const [r, g, b] = color.match(/\d+(\.\d+)?/g).map(Number); return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b); };
    const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (high + 0.05) / (low + 0.05);
};

try {
    // Finding 1: role="dialog" hosts without aria-modal. The v7 default is body; development builds say so once, and an explicit
    // portalContainer keeps the agenda usable.
    for (const kind of ['modal', 'popover']) {
        await scenario(`§10.3.4 React Aria Components ${kind} host, default portal: one development warning names portalContainer (review 2026-10-09-3)`, {kind, props: {layout: 'desktop'}}, async (page, {warnings}) => {
            const dialog = await page.evaluate(() => ({role: document.querySelector('#host-dialog')?.getAttribute('role'), modal: document.querySelector('#host-dialog')?.getAttribute('aria-modal')}));
            assert.deepEqual(dialog, {role: 'dialog', modal: null});
            if (kind === 'modal') { await cell(page, '2026-09-10').focus(); await page.keyboard.press('Enter'); } else await cell(page, '2026-09-10').click({position: {x: 12, y: 10}});
            await settle(page, 10);
            const after = await agendaState(page);
            // The documented outcome without portalContainer (README): the host's trap closes the agenda or the popover closes itself.
            assert.equal(after.agenda && after.focusInAgenda && !after.inHost, false, 'the default body portal is not usable inside this host');
            assert.deepEqual(portalWarnings(warnings), [unmarked]);
            return {dialog, after, warnings: portalWarnings(warnings)};
        });
        await scenario(`§10.3.4 React Aria Components ${kind} host with the dialog as portalContainer: the agenda opens inside it, a row press works, no warning (review 2026-10-09-3)`,
            {kind, own: true, props: {layout: 'desktop'}}, async (page, {warnings}) => {
                if (kind === 'modal') { await cell(page, '2026-09-10').focus(); await page.keyboard.press('Enter'); } else await cell(page, '2026-09-10').click({position: {x: 12, y: 10}});
                await settle(page, 10);
                const after = await agendaState(page);
                assert.equal(after.agenda, true); assert.equal(after.inHost, true); assert.equal(after.host, true);
                if (kind === 'modal') assert.equal(after.focusInAgenda, true);
                await page.locator('.nc-day-list [data-item-id="b"] [data-agenda-control="primary"]').click(); await settle(page);
                const presses = await page.evaluate(() => window.presses ?? []);
                assert.deepEqual(presses, ['b']); assert.deepEqual(portalWarnings(warnings), []);
                return {after, presses};
            });
    }

    // Findings 2 and 3: element rules of the host page never restyle package-owned headings and the empty line.
    const template = '<style>:root{--text-h:#08060d}@media (prefers-color-scheme: dark){:root{--text-h:#f3f4f6}}h1,h2{font-weight:500;color:var(--text-h);letter-spacing:-0.24px;line-height:118%}p{margin:0}</style>';
    for (const [os, scheme] of [['dark', 'light'], ['light', 'dark']]) {
        await scenario(`§10.3.4/§12 Vite template h2 rule, ${os} page, colorScheme="${scheme}": the month title keeps the calendar text color and weight (review 2026-10-09-3)`,
            {colorScheme: os, head: template, props: {layout: 'desktop', colorScheme: scheme}}, async page => {
                const result = await page.evaluate(() => {
                    const heading = document.querySelector('.nc-calendar-heading'), root = document.querySelector('.nc-calendar'), style = getComputedStyle(heading), rootStyle = getComputedStyle(root);
                    return {color: style.color, rootColor: rootStyle.color, background: rootStyle.backgroundColor, weight: style.fontWeight, letterSpacing: style.letterSpacing,
                        lineHeight: style.lineHeight, fontSize: style.fontSize};
                });
                assert.equal(result.color, result.rootColor); assert.equal(result.weight, '700'); assert.equal(result.letterSpacing, 'normal');
                // The page's unitless 1.4 line height, not the template's h2 118%.
                assert.equal(Number.parseFloat(result.lineHeight), Number((Number.parseFloat(result.fontSize) * 1.4).toFixed(1)));
                const ratio = contrast(result.color, result.background);
                assert.ok(ratio >= 4.5, `contrast ${ratio}`);
                await page.locator('.nc-calendar-toolbar').screenshot({path: resolve(output, `heading-${os}-page-${scheme}-calendar.png`)});
                return {...result, contrast: Number(ratio.toFixed(2))};
            });
    }
    const preflight = '<style>*,::before,::after{margin:0;padding:0}h1,h2,h3,h4{font-size:inherit;font-weight:inherit}p{margin:0}</style>';
    const typography = page => page.evaluate(() => {
        const read = selector => { const node = document.querySelector(selector); if (!node) return null; const style = getComputedStyle(node); return {weight: style.fontWeight, margin: style.marginBlockStart, size: style.fontSize}; };
        const popover = document.querySelector('.nc-day-list[data-presentation=popover]')?.getBoundingClientRect();
        return {h2: read('.nc-calendar-heading'), h3: read('.nc-day-list-heading h3'), empty: read('.nc-day-list-empty'), popover: popover && {width: Math.round(popover.width), height: Math.round(popover.height)}};
    });
    const emptyDay = async page => { await cell(page, '2026-09-20').focus(); await page.keyboard.press('Enter'); await settle(page); return typography(page); };
    let plain = null;
    await scenario('§10.3.4 empty desktop agenda without a host reset: reference typography and size (review 2026-10-09-3)', {props: {layout: 'desktop'}}, async page => {
        plain = await emptyDay(page);
        assert.equal(plain.h2.weight, '700'); assert.equal(plain.h3.weight, '700'); assert.equal(plain.empty.margin, '16px');
        await page.locator('.nc-day-list').screenshot({path: resolve(output, 'empty-agenda-plain.png')});
        return plain;
    });
    await scenario('§10.3.4 a preflight reset (`* {margin:0}`, `h1…h4 {font-weight:inherit}`) keeps heading weight, empty-line margins and the popover size (review 2026-10-09-3)',
        {head: preflight, props: {layout: 'desktop'}}, async page => {
            const reset = await emptyDay(page);
            assert.ok(plain, 'reference scenario ran');
            assert.deepEqual({h2: reset.h2, h3: reset.h3, empty: reset.empty, popover: reset.popover}, {h2: plain.h2, h3: plain.h3, empty: plain.empty, popover: plain.popover});
            await page.locator('.nc-day-list').screenshot({path: resolve(output, 'empty-agenda-preflight.png')});
            return reset;
        });

    // Finding 10: the package scroll lock with a custom-styled classic scrollbar keeps a layout="auto" root mobile.
    const styledScrollbar = '<style>html::-webkit-scrollbar{width:17px;background:#ccc}html::-webkit-scrollbar-thumb{background:#888}</style>';
    // A 680 px viewport puts the root content box within one scrollbar below 640 px, so a lost gutter would cross the breakpoint.
    const tall = '<div id="owner" style="padding:0 0 1200px"></div>';
    const layoutState = page => page.evaluate(() => {
        const root = document.querySelector('.nc-calendar'), style = getComputedStyle(root);
        const content = Number.parseFloat(style.width) - Number.parseFloat(style.paddingLeft) - Number.parseFloat(style.paddingRight) - Number.parseFloat(style.borderLeftWidth) - Number.parseFloat(style.borderRightWidth);
        return {html: document.documentElement.getAttribute('style'), htmlWidth: document.documentElement.getBoundingClientRect().width, layout: root.dataset.layout, content, gutter: innerWidth - document.documentElement.clientWidth, overflow: document.documentElement.style.overflow,
            sheets: document.querySelectorAll('[role=dialog][aria-modal=true]').length, popovers: document.querySelectorAll('.nc-day-list[data-presentation=popover]').length,
            menus: document.querySelectorAll('[role=menu]').length};
    });
    for (const [mode, head] of [['overlay', styledScrollbar], ['classic', '']]) for (const [label, props, open] of [
        ['agenda sheet', {agendaPresentation: 'overlay'}, page => cell(page, '2026-09-20').click()],
        ['item action sheet', {actions: true}, page => page.locator('.nc-day-list[data-presentation=inline] [data-item-id="b"] [data-agenda-control="actions"]').click()],
        ['source sheet', {sources: [{id: 'work', title: 'Work', color: '#2f6fed'}, {id: 'home', title: 'Home'}], visibleSourceIds: ['work', 'home']},
            page => page.locator('.nc-calendar-toolbar [data-source-selector]').click()],
    ]) {
        await scenario(`§7/§11.3 layout="auto" just below 640 px with a ${mode === 'overlay' ? 'styled (::-webkit-scrollbar) page scrollbar on an overlay-scrollbar platform' : 'native classic page scrollbar'}: the ${label} opens and the calendar stays mobile (review 2026-10-09-3)`,
            {scrollbars: mode, viewport: {width: 680, height: 800}, head, html: tall, props: {...props}}, async page => {
                const before = await layoutState(page);
                assert.ok(before.gutter >= 15, `page scrollbar ${before.gutter}`); assert.equal(before.layout, 'mobile');
                assert.ok(before.content >= 640 - before.gutter && before.content < 640, `content ${before.content} within one scrollbar below the breakpoint`);
                await open(page); await settle(page, 10);
                const during = await layoutState(page);
                assert.equal(during.layout, 'mobile', JSON.stringify({before, during})); assert.equal(during.content, before.content); assert.equal(during.overflow, 'hidden');
                assert.equal(during.sheets, 1, 'one modal sheet'); assert.equal(during.popovers, 0); assert.equal(during.menus, 0);
                await page.screenshot({path: resolve(output, `scroll-lock-${mode}-${label.replaceAll(' ', '-')}.png`)});
                await page.keyboard.press('Escape'); await settle(page, 10);
                const after = await layoutState(page);
                assert.equal(after.layout, 'mobile'); assert.equal(after.sheets, 0); assert.equal(after.overflow, ''); assert.equal(after.content, before.content);
                return {before, during, after};
            });
    }

    // Findings 5 and 11: §12.3 step 4 for focus in the mobile inline agenda when the host changes the month.
    for (const [label, props, month, roving] of [['uncontrolled', {}, '2026-11-01', '2026-11-10'], ['uncontrolled', {}, '2026-10-01', '2026-10-10'],
        ['controlled', {agendaDate: '2026-09-10', onAgendaDateChange: true}, '2026-11-01', '2026-11-10']]) {
        await scenario(`§12.3 mobile inline (${label}): focus on an agenda item, external anchorDate ${month}: focus moves to the roving cell ${roving}, not the toolbar (review 2026-10-09-3)`,
            {viewport: {width: 390, height: 844}, props: {layout: 'mobile', ...props}, script: props.onAgendaDateChange ? 'window.props.onAgendaDateChange = () => {};' : ''}, async page => {
                await cell(page, '2026-09-10').focus(); await page.keyboard.press('Enter'); await settle(page); await page.keyboard.press('Tab'); await settle(page);
                const before = await info(page);
                assert.equal(before.item, 'a');
                await patch(page, {anchorDate: month, ...(props.agendaDate ? {agendaDate: month.replace(/01$/, '20')} : {})}); await settle(page, 10);
                const after = await info(page), state = await page.evaluate(() => window.roving());
                assert.deepEqual(state, [roving]); assert.equal(after.date, roving);
                return {before, after, roving: state};
            });
    }

    // Finding 6: without `today`, the roving Tab stop follows the untouched agenda fallback once the clock is read.
    for (const layout of ['desktop', 'mobile']) {
        await scenario(`§12.1/§11.3 ${layout} without today: the Tab stop follows today after the clock read and after midnight, until a date is focused (review 2026-10-09-3)`,
            {clock: '2026-09-10T23:59:00+03:00', viewport: layout === 'mobile' ? {width: 390, height: 844} : {width: 1300, height: 900}, props: {layout, today: undefined},
                script: 'delete window.props.today;'}, async page => {
                await settle(page);
                const first = await page.evaluate(() => ({roving: window.roving(), today: document.querySelector('[data-today]')?.dataset.date, agenda: document.querySelector('[data-agenda-date]')?.dataset.date}));
                assert.deepEqual(first, {roving: ['2026-09-10'], today: '2026-09-10', agenda: '2026-09-10'});
                await page.clock.runFor(120_000); await settle(page);
                const midnight = await page.evaluate(() => ({roving: window.roving(), today: document.querySelector('[data-today]')?.dataset.date, agenda: document.querySelector('[data-agenda-date]')?.dataset.date}));
                assert.deepEqual(midnight, {roving: ['2026-09-11'], today: '2026-09-11', agenda: '2026-09-11'});
                await page.keyboard.press('Tab');
                for (let index = 0; index < 8 && (await info(page)).date === undefined; index++) await page.keyboard.press('Tab');
                const tabbed = await info(page);
                assert.equal(tabbed.date, '2026-09-11', 'Tab enters the grid at today');
                await page.keyboard.press('ArrowRight'); await page.clock.runFor(86_400_000); await settle(page);
                const saved = await page.evaluate(() => window.roving());
                assert.deepEqual(saved, ['2026-09-12'], 'a focused date is saved: the next day does not move it');
                return {first, midnight, tabbed, saved};
            });
    }

    // Finding 7: weekday labels never lose visible content at 320 px or with 200% text.
    const visibleLabels = page => page.evaluate(() => {
        const row = document.querySelector('.nc-month-weekdays'), narrow = row.hasAttribute('data-narrow-weekdays');
        return {narrow, labels: [...row.querySelectorAll('[role=columnheader]')].map(cell => {
            const style = getComputedStyle(cell), probe = document.createElement('span');
            probe.textContent = narrow ? cell.dataset.narrowLabel : cell.querySelector('.nc-weekday-label').textContent;
            Object.assign(probe.style, {font: style.font, letterSpacing: style.letterSpacing, whiteSpace: 'nowrap', position: 'absolute', visibility: 'hidden'});
            cell.append(probe); const width = probe.getBoundingClientRect().width; probe.remove();
            const room = cell.getBoundingClientRect().width - Number.parseFloat(style.paddingLeft) - Number.parseFloat(style.paddingRight);
            return {name: cell.getAttribute('aria-label'), text: probe.textContent, width: Number(width.toFixed(1)), room: Number(room.toFixed(1)), fits: width <= room + 0.5};
        })};
    });
    for (const [label, config, narrow] of [
        ['ar-EG at 320 px', {viewport: {width: 320, height: 700}, props: {locale: 'ar-EG'}}, true],
        ['en-US at 390 px with 200% text', {viewport: {width: 390, height: 844}, head: '<style>body{font-size:32px}</style>', props: {}}, true],
        ['en-US at 390 px', {viewport: {width: 390, height: 844}, props: {}}, false],
    ]) {
        await scenario(`§12.5 weekday labels, ${label}: every visible label fits its column (review 2026-10-09-3)`, config, async page => {
            const result = await visibleLabels(page);
            assert.equal(result.narrow, narrow);
            for (const entry of result.labels) assert.equal(entry.fits, true, JSON.stringify(entry));
            assert.ok(result.labels.every(entry => entry.name.length >= entry.text.length), 'full names stay the accessible names');
            await page.locator('.nc-month-weekdays').screenshot({path: resolve(output, `weekdays-${label.replaceAll(/[^\w]+/g, '-')}.png`)});
            return result;
        });
    }

    // Finding 14: a +N count wider than a 64 px desktop column is visibly truncated.
    const many = Array.from({length: 1200}, (_, index) => ({id: `m${index}`, title: `Event ${index}`, data: {}, interval: {kind: 'allDay', start: '2026-09-16', end: '2026-09-17'}}));
    for (const locale of ['en-US', 'ar-EG']) {
        await scenario(`§6.3 +N with 1200 items in a 64 px desktop column at 24 px (${locale}): an overflowing count ends in an ellipsis (review 2026-10-09-3)`,
            {viewport: {width: 480, height: 900}, head: '<style>body{font-size:24px}</style>', props: {layout: 'desktop', locale, items: many}}, async page => {
                await settle(page, 10);
                const result = await page.evaluate(() => {
                    const node = document.querySelector('[role=gridcell][data-date="2026-09-16"] .nc-overflow'), style = getComputedStyle(node);
                    return {text: node.textContent, overflowing: node.scrollWidth > node.clientWidth, textOverflow: style.textOverflow, whiteSpace: style.whiteSpace};
                });
                assert.equal(result.textOverflow, 'ellipsis'); assert.equal(result.whiteSpace, 'nowrap');
                await cell(page, '2026-09-16').screenshot({path: resolve(output, `plus-n-${locale}.png`)});
                return result;
            });
    }

    // Finding 8: the computed grid description at the bounds is two sentences.
    for (const [anchorDate, locale, expected] of [['0001-02-01', 'en-US', 'Page Up and Page Down change the month. Month is outside the supported range'],
        ['9999-11-01', 'ru-RU', 'Page Up и Page Down — сменить месяц. Месяц вне поддерживаемого диапазона']]) {
        await scenario(`§5.1.1 grid description at ${anchorDate} (${locale}): the boundary reason is a separate sentence (review 2026-10-09-3)`,
            {props: {layout: 'desktop', anchorDate, today: anchorDate, locale, timeZone: 'UTC'}}, async page => {
                const session = await page.context().newCDPSession(page);
                const {nodes} = await session.send('Accessibility.getFullAXTree');
                const grid = nodes.find(node => node.role?.value === 'grid');
                const description = grid?.description?.value ?? '';
                assert.ok(description.endsWith(expected), description);
                return {description};
            });
    }
} finally { await browser.close(); for (const instance of Object.values(browsers)) await instance.close(); }
const paths = ['src/v02/calendar/portal.ts', 'src/v02/calendar/modality.ts', 'src/v02/calendar/CalendarMonth.tsx', 'src/v02/calendar/useCalendarController.ts', 'src/v02/calendar/MonthView.tsx',
    'src/v02/calendar/useMonthMeasurements.ts', 'src/v02/calendar/DayAgendaBody.tsx', 'src/v02/calendar/useResponsiveLayout.ts', 'src/v02/core/formatting.ts', 'src/v02/styles.css',
    'src/index.ts', 'src/Calendar.tsx', 'scripts/implementation/review3-entry.tsx', 'scripts/implementation/review3-probe.mjs', 'package.json', 'scripts/implementation/spikes/package-lock.json'];
const report = {capturedAt: new Date().toISOString(), outcome: !only && checks.every(c => c.outcome === 'pass') && !errors.length && !consoleErrors.length ? 'pass' : 'fail', filter: only ? String(only) : null,
    node: process.version, browser: version, react: 'bundled from the root lockfile, development build, StrictMode', reactAriaComponents: JSON.parse(readFileSync(resolve(root, 'node_modules/react-aria-components/package.json'), 'utf8')).version,
    checks, errors, consoleErrors,
    scope: 'Review 2026-10-09-3 findings through the public Calendar in Chrome: React Aria Components Modal/Popover hosts and the portalContainer warning, host h2/h3/p rules and a preflight reset, the scroll lock with a styled classic scrollbar under layout="auto", inline agenda recovery after an external month change, the roving Tab stop without today, weekday labels at 320 px and 200% text, +N in narrow columns and the boundary grid description. Radix Dialog, manual AT and other browsers are out of scope.',
    sourceHashes: Object.fromEntries(paths.map(path => [path, createHash('sha256').update(readFileSync(resolve(root, path))).digest('hex')]))};
writeFileSync(resolve(output, 'browser.json'), JSON.stringify(report, null, 2) + '\n');
console.log(`Review 2026-10-09-3: ${checks.filter(c => c.outcome === 'pass').length}/${checks.length}; ${errors.length} page errors; ${consoleErrors.length} console errors; ${output}`);
if (report.outcome === 'fail') process.exitCode = 1;
