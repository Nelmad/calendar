import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {axeStates, desktopChecks, mobileChecks, ssrScenarios} from './acceptance-alpha2.mjs';
import {createRecorder, createServers, examples, hash, packCandidate, prepareConsumer, root, runOutcome, tarballArgument, walk} from './packed-harness.mjs';

// Prerelease acceptance on the packed candidate (plan T14/T19): one archive, isolated Vite (React 18)
// and Next App Router (React 19) consumers, SSR determinism, hydration, desktop keyboard and axe-core. alpha.2 (T19)
// adds the responsive/integration slice from acceptance-alpha2.mjs: auto/forced layouts, a 390 px touch phone, overlays,
// actions, sources, several calendars, ShadowRoot, slots and the theme/density/color-scheme axe matrix.
// Usage: node scripts/implementation/alpha-acceptance.mjs --milestone=alpha.1|alpha.2 [--tarball=<tgz>] [--output=<dir>] [--only=<regexp>]
// (--tarball tests that archive, which must be byte-identical to the checkout's build, instead of building and packing one:
// the release and CI workflows pack once and run this acceptance and the packed consumers on the same file).
// (--only runs a subset of the browser checks while developing the harness; evidence comes from full runs only).
const argument = name => process.argv.find(arg => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
const milestone = argument('milestone') ?? 'alpha.1';
assert.ok(['alpha.1', 'alpha.2'].includes(milestone), `Unknown milestone ${milestone}`);
// Without --output the run writes to a fresh temporary directory; run reports are never written into the repository.
const output = resolve(argument('output') ?? mkdtempSync(join(tmpdir(), `calendar-acceptance-${milestone}-evidence-`)));
const spikes = join(root, 'scripts/implementation/spikes'), probes = join(root, 'scripts/implementation/acceptance-probes');
const only = argument('only') ? new RegExp(argument('only')) : null;
const temporary = realpathSync(mkdtempSync(join(tmpdir(), 'calendar-acceptance-')));
mkdirSync(output, {recursive: true});
const tags = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
// The axe/screenshot state matrix. alpha.2 (T19) appends its layouts/overlays/themes here.
const matrix = {
    'alpha.1': ['month', 'agenda-open', 'loading-initial', 'loading-refresh', 'error-initial', 'error-refresh', 'empty', 'contract',
        'dark', 'comfortable', 'rtl-ar', 'constrained', 'ru-RU', 'en-US'],
};
matrix['alpha.2'] = [...matrix['alpha.1']];
const viewports = [{width: 1280, height: 900}, {width: 1024, height: 768}, ...(milestone === 'alpha.2' ? [{width: 390, height: 844, touch: true}] : [])];
const exclusions = [{
    rule: 'label-content-name-mismatch', scope: 'date gridcell whose only visible text outside its accessible name is the aria-hidden "+N" overflow indicator',
    predicate: 'role=gridcell inside .nc-theme; one child .nc-overflow[aria-hidden=true] with text "+<count>"; the visible day number is a whole number token of the cell name; the cell description contains the same count as a whole number token (moreItemsLabel); digits of any numbering system compare by value',
    justification: 'WCAG 2.5.3 concerns the visible label of a component. The label of a date gridcell is its day number, and it is contained in the accessible name (the full localized date). The "+N" text is not a label but the overflow count indicator that spec §6.3/§12.1 require as an aria-hidden affordance inside the gridcell; its accessible equivalent is exactly one moreItemsLabel(date, N) in the cell description. The experimental axe rule counts all visible text, including this indicator. The rule stays enabled: every other node it reports still fails acceptance. Manual speech-input/AT confirmation remains part of the T28 gate.',
}];
// Runs in the page: classifies every WCAG violation/incomplete node and verifies each resolution.
function reviewAxe({violations, incomplete}) {
    // A target inside a shadow tree is an array of selectors, one per tree scope.
    const find = target => { let scope = document, node = null; for (const selector of [].concat(target[0])) { node = scope?.querySelector(selector); scope = node?.shadowRoot ?? node; } return node; };
    const owner = node => node?.closest('.nc-theme') ? 'package' : 'harness';
    const texts = (node, attribute) => (node.getAttribute(attribute) ?? '').split(/\s+/).filter(Boolean).map(id => node.getRootNode().getElementById(id)?.textContent ?? '').join(' ');
    // A whole number token, never a substring: the day "4" is not contained in "2026" (T14-1-D7). Digits of any numbering
    // system compare by value: the `+N` indicator follows the date locale (Arabic-Indic in `ar`), the message its own locale.
    const digits = new Map(['latn', 'arab', 'arabext', 'deva', 'beng', 'thai', 'tibt', 'mymr', 'khmr', 'fullwide'].flatMap(system =>
        [...Array(10).keys()].map(digit => [new Intl.NumberFormat(`en-u-nu-${system}`).format(digit), String(digit)])));
    const ascii = text => text.replace(/\p{Nd}/gu, char => digits.get(char) ?? char);
    const hasNumber = (text, value) => !!value && new RegExp(`(?<!\\d)${ascii(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?!\\d)`).test(ascii(text));
    const overflowOnly = cell => {
        if (cell?.getAttribute('role') !== 'gridcell') return 'not a gridcell';
        const indicator = cell.querySelector(':scope > .nc-overflow[aria-hidden="true"]'), day = cell.querySelector(':scope > .nc-day-header')?.textContent.trim();
        if (!indicator || !/^\+\S+$/.test(indicator.textContent.trim())) return 'no aria-hidden +N indicator';
        const visible = [...cell.children].filter(child => !child.classList.contains('nc-visually-hidden') && child !== indicator).map(child => child.textContent.trim()).filter(Boolean).join(' ');
        if (visible !== day) return `other visible text: ${visible}`;
        if (!hasNumber(texts(cell, 'aria-labelledby'), day)) return 'day number missing from the name';
        if (!hasNumber(texts(cell, 'aria-describedby'), indicator.textContent.trim().slice(1))) return 'count missing from the description';
        return null;
    };
    const rgba = value => {
        const numbers = value.match(/[\d.]+/g)?.map(Number) ?? [];
        if (value.startsWith('color(srgb')) return [numbers[0] * 255, numbers[1] * 255, numbers[2] * 255, numbers[3] ?? 1];
        if (value.startsWith('rgb')) return [numbers[0], numbers[1], numbers[2], numbers[3] ?? 1];
        return null;
    };
    const over = (top, bottom) => [0, 1, 2].map(i => top[i] * top[3] + bottom[i] * (1 - top[3])).concat(1);
    const background = node => {
        const layers = [];
        for (let current = node; current; current = current.parentElement) {
            const style = getComputedStyle(current), color = rgba(style.backgroundColor);
            if (style.backgroundImage !== 'none') return null;
            if (color === null) return null;
            if (color[3] > 0) layers.push(color);
            if (color[3] === 1) break;
        }
        return layers.reverse().reduce((bottom, top) => over(top, bottom), [255, 255, 255, 1]);
    };
    const luminance = color => { const [r, g, b] = color.slice(0, 3).map(v => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
    const contrast = node => {
        const style = getComputedStyle(node), back = background(node), fore = rgba(style.color);
        if (!back || !fore) return {reason: `unsupported colors ${style.color} on ${style.backgroundColor}`};
        const text = over(fore, back), [a, b] = [luminance(text), luminance(back)].sort((x, y) => y - x), ratio = (a + 0.05) / (b + 0.05);
        const size = parseFloat(style.fontSize), large = size >= 24 || (size >= 18.66 && Number(style.fontWeight) >= 700), required = large ? 3 : 4.5;
        const box = node.getBoundingClientRect();
        // A visible item layer above the text would be a real occlusion, not an unknown background.
        const covered = [...node.getRootNode().querySelectorAll('.nc-month-item')].some(item => { const r = item.getBoundingClientRect(); return r.left < box.right && r.right > box.left && r.top < box.bottom && r.bottom > box.top; });
        return {ratio: Math.round(ratio * 100) / 100, required, covered, resolved: ratio >= required && !covered, reason: `${Math.round(ratio * 100) / 100}:1 (needs ${required}:1)${covered ? ', covered by an item' : ''}`};
    };
    const ratios = [];
    const result = {
        violations: violations.flatMap(rule => rule.nodes.map(entry => {
            const node = find(entry.target), reason = rule.id === 'label-content-name-mismatch' ? overflowOnly(node) : 'no exclusion defined';
            return {rule: rule.id, target: entry.target.join(' '), owner: owner(node), excluded: reason === null, reason: reason ?? 'verified +N indicator'};
        })),
        incomplete: incomplete.flatMap(rule => rule.nodes.map(entry => {
            const node = find(entry.target), base = {rule: rule.id, target: entry.target.join(' '), owner: owner(node)};
            if (rule.id === 'color-contrast') { const value = contrast(node); if (value.ratio) ratios.push(value.ratio); return {...base, resolved: !!value.resolved, reason: value.reason}; }
            if (rule.id === 'aria-valid-attr-value' && /aria-controls/.test(entry.summary ?? '')) {
                const id = node.getAttribute('aria-controls'), popup = id && node.getRootNode().getElementById(id);
                return {...base, resolved: !!popup && popup.getAttribute('role') === node.getAttribute('aria-haspopup'), reason: popup ? `aria-controls → ${popup.getAttribute('role')} in the same tree` : 'missing popup'};
            }
            if (rule.id === 'label-content-name-mismatch') {
                const day = node.querySelector(':scope > .nc-day-header')?.textContent.trim(), overflow = node.querySelector(':scope > .nc-overflow');
                const ok = !!day && hasNumber(texts(node, 'aria-labelledby'), day) && (!overflow || overflowOnly(node) === null);
                return {...base, resolved: ok, reason: ok ? `visible day number "${day}" is contained in the name` : 'visible label not in the name'};
            }
            return {...base, resolved: false, reason: 'no verification defined'};
        })),
    };
    return {...result, minimumContrast: ratios.length ? Math.min(...ratios) : null};
}
const report = {
    startedAt: new Date().toISOString(), milestone, filter: only ? only.source : null,
    scope: `${milestone} acceptance of the packed candidate: SSR, hydration, desktop keyboard, axe-core on package-owned UI in Chrome${milestone === 'alpha.2' ? '; alpha.2 adds auto/forced layouts at 1280 px and on a 390 px touch phone, the 639/640 breakpoint, popover, sheets, menus and nested Escape, actions, sources with delayed acceptance, two calendars, Document/ShadowRoot portals, slots, §6 Month order/sizing and axe across themes, densities, color schemes and RTL' : ''}. Not the stable §12.5 gate: no manual AT, real devices, forced-colors, reflow/zoom or full browser matrix.`,
    axe: {tags, bestPractice: 'reported separately, not part of the pass criterion', exclusions, excludedNodes: {},
        incomplete: 'every package-owned incomplete node needs a verified resolution (computed contrast, same-tree popup IDREF, label contained in the name)'},
    checks: [], sourceHashes: {}, temporary,
};
const {save, record, run} = createRecorder(output, report);
const failures = [];
async function check(name, operation) {
    if (only && !only.test(name)) return;
    try {
        const details = await operation();
        record(name, details ?? {});
    } catch (error) {
        report.checks.push({name, outcome: 'fail', error: String(error?.stack ?? error).slice(0, 4000)}); save();
        failures.push(name); console.log(`FAIL: ${name}\n${String(error).slice(0, 2000)}`);
    }
}
const git = args => spawnSync('git', args, {cwd: root, encoding: 'utf8'}).stdout.trim();
const version = path => JSON.parse(readFileSync(join(path, 'package.json'), 'utf8')).version;
const {serve, stop} = createServers(output);
let browser;
try {
    const {pack, details} = packCandidate({run, record, temporary, output, tarball: tarballArgument()});
    assert.equal(pack.version, `0.2.0-${milestone}`, `Package version must be the ${milestone} prerelease`);
    const status = git(['status', '--porcelain']);
    report.binding = {...details, npmIntegrity: pack.integrity, gitHead: git(['rev-parse', 'HEAD']), gitDirty: status.length > 0,
        gitStatusEntries: status ? status.split('\n').length : 0,
        note: `The candidate is ${details.source === 'npm pack of the checkout' ? 'built and packed from the working tree' : 'the given archive, byte-identical to the build output of the working tree'}; the run is bound to the archive integrity and sha256, not to a commit.`};
    const sources = ['package.json', 'package-lock.json', 'vite.lib.config.ts', 'scripts/bundle-css.mjs', 'scripts/verify-dist.mjs', 'src/index.ts', 'src/Calendar.tsx',
        'scripts/implementation/alpha-acceptance.mjs', 'scripts/implementation/acceptance-alpha2.mjs', 'scripts/implementation/packed-harness.mjs', 'scripts/implementation/spikes/package.json', 'scripts/implementation/spikes/package-lock.json',
        ...readdirSync(join(root, 'src/v02'), {recursive: true}).filter(path => /\.(ts|tsx|css)$/.test(path)).map(path => `src/v02/${path}`),
        ...walk(probes).map(path => `scripts/implementation/acceptance-probes/${path}`),
        ...['vite', 'next'].flatMap(kind => walk(join(examples, kind)).map(path => `examples/${kind}/${path}`))];
    for (const path of sources) report.sourceHashes[path] = hash(readFileSync(join(root, path)));
    await check('package-contents', async () => {
        const extract = join(temporary, 'extract'); mkdirSync(extract);
        assert.equal(spawnSync('tar', ['-xzf', join(temporary, pack.filename), '-C', extract]).status, 0);
        const files = readdirSync(join(extract, 'package'), {recursive: true, withFileTypes: true}).filter(entry => entry.isFile())
            .map(entry => join(entry.parentPath, entry.name).slice(join(extract, 'package').length + 1)).sort();
        assert.deepEqual(files, [...details.files].sort());
        const offending = files.filter(file => /dayjs/i.test(file) || /dayjs/i.test(readFileSync(join(extract, 'package', file), 'utf8')));
        assert.deepEqual(offending, [], 'Day.js in package files, imports or declarations');
        assert.ok(files.includes('dist/styles.css') && !files.some(file => /tokens\.css$/.test(file)), 'only styles.css is shipped');
        const exports = JSON.parse(readFileSync(join(extract, 'package/package.json'), 'utf8')).exports;
        assert.deepEqual(Object.keys(exports), ['.', './styles.css']);
        return {files: files.length, exports: Object.keys(exports)};
    });
    const axeSource = readFileSync(join(spikes, 'node_modules/axe-core/axe.min.js'), 'utf8');
    report.versions = {node: process.version, playwright: version(join(spikes, 'node_modules/playwright')), axeCore: version(join(spikes, 'node_modules/axe-core'))};

    const directories = {};
    for (const kind of ['vite', 'next']) {
        const {directory, versions} = prepareConsumer({kind, temporary, pack, run, record, output, overlays: [join(probes, kind)]});
        directories[kind] = directory; report.versions[kind] = versions;
        cpSync(join(probes, 'shared/Acceptance.tsx'), join(directory, kind === 'vite' ? 'src/acceptance/Acceptance.tsx' : 'components/Acceptance.tsx'));
        cpSync(join(probes, 'shared/clock.mjs'), join(directory, 'acceptance-clock.mjs'));
        if (kind === 'vite') {
            run('vite-acceptance-typecheck', 'npm', ['run', 'typecheck'], directory);
            const vite = ['node_modules/vite/bin/vite.js', 'build', '--config', 'acceptance.vite.config.mjs'];
            run('vite-acceptance-build', process.execPath, vite, directory);
            run('vite-acceptance-ssr-build', process.execPath, [...vite, '--ssr', 'src/acceptance/entry-server.tsx', '--outDir', 'dist-acceptance-server'], directory);
            for (const log of ['vite-acceptance-build', 'vite-acceptance-ssr-build']) assert.doesNotMatch(readFileSync(join(output, `${log}.txt`), 'utf8'), /\(!\)|warning/i, `${log} warnings`);
        } else {
            // next build type-checks the app, including the harness route and scenario component.
            assert.match(run('next-acceptance-build', 'npm', ['run', 'build'], directory), /Compiled successfully/);
        }
    }

    // Two servers per consumer: different host time zone, default locale and a clock shifted by 400 days.
    const hosts = [{name: 'a', TZ: 'Asia/Tokyo', LC_ALL: 'ja_JP.UTF-8', LANG: 'ja_JP.UTF-8', offset: 0},
        {name: 'b', TZ: 'America/Los_Angeles', LC_ALL: 'de_DE.UTF-8', LANG: 'de_DE.UTF-8', offset: 400 * 86_400_000}];
    const bases = {};
    for (const [i, kind] of ['vite', 'next'].entries()) for (const [j, host] of hosts.entries()) {
        const port = 4401 + i * 2 + j, directory = directories[kind];
        const extra = {TZ: host.TZ, LC_ALL: host.LC_ALL, LANG: host.LANG, ACCEPTANCE_CLOCK_OFFSET_MS: String(host.offset),
            NODE_OPTIONS: `--import=${new URL(`file://${join(directory, 'acceptance-clock.mjs')}`).href}`};
        await serve(kind, directory, port, {name: `${kind}-${host.name}`, extra, path: kind === 'vite' ? '/clock' : '/acceptance/clock',
            ...(kind === 'vite' ? {args: ['acceptance-server.mjs']} : {})});
        bases[`${kind}-${host.name}`] = `http://127.0.0.1:${port}`;
    }
    const page = (kind, params) => `${kind === 'vite' ? '/' : '/acceptance'}?${new URLSearchParams(params)}`;
    const fragment = html => {
        const start = html.indexOf('<div id="calendar-host">'), end = html.indexOf('<button type="button" id="after"');
        assert.ok(start > 0 && end > start, 'calendar host fragment missing'); return html.slice(start, end);
    };

    for (const kind of ['vite', 'next']) {
        await check(`${kind}-server-clock-shift`, async () => {
            const clocks = await Promise.all(hosts.map(host => fetch(bases[`${kind}-${host.name}`] + (kind === 'vite' ? '/clock' : '/acceptance/clock')).then(r => r.text())));
            const days = (Date.parse(clocks[1]) - Date.parse(clocks[0])) / 86_400_000;
            assert.ok(Math.abs(days - 400) < 0.01, `clock shift ${days}`); return {clocks};
        });
        for (const scenario of matrix[milestone].filter(name => name !== 'agenda-open')) await check(`${kind}-ssr-${scenario}`, async () => {
            const [a, b] = await Promise.all(hosts.map(host => fetch(bases[`${kind}-${host.name}`] + page(kind, {scenario})).then(r => r.text())));
            const html = fragment(a);
            assert.equal(fragment(b), html, 'Server HTML depends on host time zone, locale or clock');
            writeFileSync(join(output, `${kind}-ssr-${scenario}.html`), html);
            const grid = /role="grid"/.test(html);
            if (['loading-initial', 'error-initial', 'contract'].includes(scenario)) assert.ok(!grid, 'blocking state renders no grid');
            else assert.ok(grid, 'semantic grid in server HTML');
            if (scenario === 'contract') assert.match(html, /data-status="error"/);
            if (scenario.startsWith('loading')) assert.match(html, new RegExp(`data-loading-phase="${scenario.slice(8)}"`));
            if (scenario === 'month') {
                assert.match(html, /aria-colcount="7"/); assert.match(html, /aria-rowcount="6"/);
                assert.equal(html.match(/role="columnheader"/g).length, 7); assert.equal(html.match(/role="gridcell"/g).length, 35);
                const cells = [...html.matchAll(/<div[^>]*role="gridcell"[^>]*>/g)].map(tag => tag[0]);
                assert.equal(cells.filter(tag => /tabindex="0"/.test(tag)).length, 1);
                const current = cells.filter(tag => /aria-current="date"/.test(tag));
                assert.equal(current.length, 1); assert.match(current[0], /data-date="2026-09-03"/);
                // Counts are server-rendered in each cell description; lanes need client geometry.
                for (const [count, text] of [[3, '3 события'], [7, '7 событий'], [0, '0 событий']]) assert.ok(html.includes(text), `count ${count}`);
                // R49: the unverified IDREF is not rendered; the fallback label names the root without DOM lookup.
                const rootTag = html.match(/<div[^>]*role="region"[^>]*class="[^"]*nc-calendar[ "][^>]*>|<div[^>]*class="[^"]*nc-calendar[ "][^>]*role="region"[^>]*>/)[0];
                assert.doesNotMatch(rootTag, /aria-labelledby/); assert.match(rootTag, /aria-label="Календарь"/);
            }
            return {sha256: hash(html), grid};
        });
        if (milestone === 'alpha.2') for (const [name, params, expect] of ssrScenarios) await check(`${kind}-ssr-${name}`, async () => {
            const [a, b] = await Promise.all(hosts.map(host => fetch(bases[`${kind}-${host.name}`] + page(kind, params)).then(r => r.text())));
            const html = fragment(a);
            assert.equal(fragment(b), html, 'Server HTML depends on host time zone, locale or clock');
            writeFileSync(join(output, `${kind}-ssr-${name}.html`), html);
            expect(html);
            return {params, sha256: hash(html)};
        });
    }

    const {chromium} = await import('./spikes/node_modules/playwright/index.mjs');
    browser = await chromium.launch({channel: 'chrome', headless: true}); report.versions.chrome = browser.version();
    for (const kind of ['vite', 'next']) for (const viewport of viewports) {
        const label = `${kind}-${viewport.width}x${viewport.height}${viewport.touch ? '-touch' : ''}`, base = bases[`${kind}-a`];
        // Browser host differs from both servers: hydration must not depend on the client zone/locale.
        const context = await browser.newContext({viewport: {width: viewport.width, height: viewport.height}, locale: 'de-DE', timezoneId: 'Pacific/Kiritimati',
            ...(viewport.touch ? {isMobile: true, hasTouch: true} : {})});
        // Every data-layout change of a calendar root from the first parsed byte: the server layout is the parsed value.
        await context.addInitScript(() => {
            window.__layouts = [];
            new MutationObserver(records => { for (const entry of records) if (entry.target.classList?.contains('nc-calendar')) window.__layouts.push(entry.target.getAttribute('data-layout')); })
                .observe(document, {subtree: true, attributes: true, attributeFilter: ['data-layout']});
        });
        const errors = [], network = [];
        context.on('page', tab => {
            tab.setDefaultTimeout(5000);
            tab.on('console', message => { if (['error', 'warning'].includes(message.type())) errors.push(`${message.type()}: ${message.text()}`); });
            tab.on('pageerror', error => errors.push(String(error)));
            tab.on('request', request => { if (!request.url().startsWith(base) && !request.url().startsWith('data:')) network.push(request.url()); });
        });
        const tab = await context.newPage();
        const settle = () => tab.evaluate(async () => { await document.fonts.ready; for (let i = 0; i < 6; i++) await new Promise(requestAnimationFrame); });
        async function open(params) {
            await tab.goto(base + page(kind, params));
            await tab.locator('html[data-hydrated=true]').waitFor({state: 'attached'});
            await tab.locator('.nc-calendar').first().waitFor({state: 'attached'}); await settle();
            // Desktop grids draw lanes after the first client measurement; the compact mobile grid has none.
            if (await tab.locator('.nc-calendar[data-layout=desktop] [role=gridcell][data-has-items=true]').count()) await tab.locator('.nc-month-item').first().waitFor();
            await settle();
        }
        const active = () => tab.evaluate(() => {
            const node = document.activeElement;
            // A loading region is named by its visible text (QA-07): the label is aria-label or the text of aria-labelledby.
            const named = node?.getAttribute('aria-labelledby')?.split(' ').map(id => node.getRootNode().getElementById(id)?.textContent).join(' ');
            return {id: node?.id || undefined, date: node?.dataset?.date, role: node?.getAttribute('role') ?? undefined, label: node?.getAttribute('aria-label') ?? named ?? undefined,
                item: node?.closest('[data-item-id]')?.dataset.itemId, inDialog: !!node?.closest('[role=dialog]'), close: node?.hasAttribute('data-agenda-close') ?? false,
                text: node?.textContent?.trim().slice(0, 80)};
        });
        const roving = () => tab.locator('[role=gridcell][tabindex="0"]').evaluateAll(nodes => nodes.map(node => node.dataset.date));
        const heading = () => tab.locator('.nc-calendar-heading').evaluate(node => node.textContent);
        const press = async key => { await tab.keyboard.press(key); await settle(); };
        const log = () => tab.evaluate(() => JSON.parse(JSON.stringify(window.acceptance.log)));
        const accept = async () => { await tab.evaluate(() => window.acceptance.accept()); await settle(); };
        const expectFocus = async (expected, message) => { const value = await active(); for (const [key, wanted] of Object.entries(expected)) assert.equal(value[key], wanted, `${message}: ${key} ${JSON.stringify(value)}`); };
        const live = () => tab.evaluate(() => {
            window.liveLog = [];
            for (const node of document.querySelectorAll('.nc-calendar [role=status], .nc-calendar [role=alert]')) new MutationObserver(() =>
                window.liveLog.push({role: node.getAttribute('role'), text: node.textContent, root: node.closest('.nc-calendar').id || 'first'})).observe(node, {childList: true, subtree: true, characterData: true});
        });
        const announcements = () => tab.evaluate(() => window.liveLog.filter(entry => entry.text));
        const fromBefore = async tabs => { await tab.locator('#before').focus(); for (let i = 0; i < tabs; i++) await press('Tab'); };

        // The alpha.1 desktop suite runs at both desktop sizes in every milestone; the phone context has its own flows.
        if (!viewport.touch) {
            await check(`${label}-hydration-host-zone`, async () => {
                await open({scenario: 'month'});
                assert.equal(await tab.getByRole('grid').count(), 1);
                assert.equal(await tab.locator('[role=gridcell][aria-current=date]').getAttribute('data-date'), '2026-09-03');
                assert.deepEqual(await roving(), ['2026-09-03']);
                assert.equal(await tab.evaluate(() => Intl.DateTimeFormat().resolvedOptions().timeZone), 'Pacific/Kiritimati');
                const ranges = (await log()).filter(entry => entry.onVisibleRangeChange);
                assert.deepEqual(ranges, [{onVisibleRangeChange: {start: '2026-08-31', end: '2026-10-05', timeZone: 'Europe/Moscow'}}]);
                assert.equal(await tab.locator('.nc-calendar').getAttribute('aria-labelledby'), 'acceptance-title', 'valid IDREF added after commit');
                return {browserTimeZone: 'Pacific/Kiritimati', browserLocale: 'de-DE', servers: hosts.map(({TZ, LC_ALL}) => ({TZ, LC_ALL}))};
            });
            await check(`${label}-keyboard-single-tab-stop`, async () => {
                await open({scenario: 'month', accept: 'manual'});
                assert.equal(await tab.locator('[role=gridcell]').count(), 35);
                await tab.locator('#before').focus();
                const order = [];
                for (let i = 0; i < 5; i++) { await press('Tab'); const value = await active(); order.push(value.date ?? value.label ?? (value.id === 'after' ? 'after' : value.text)); }
                assert.deepEqual(order, ['Предыдущий месяц', 'Сегодня', 'Следующий месяц', '2026-09-03', 'after']);
                await press('Shift+Tab'); await expectFocus({date: '2026-09-03'}, 'Shift+Tab back into grid');
                await press('Shift+Tab'); await expectFocus({label: 'Следующий месяц'}, 'Shift+Tab out of grid');
                return {order};
            });
            await check(`${label}-keyboard-arrows-home-end`, async () => {
                await fromBefore(4);
                const steps = [['ArrowRight', '2026-09-04'], ['ArrowDown', '2026-09-11'], ['ArrowLeft', '2026-09-10'], ['ArrowUp', '2026-09-03'], ['Home', '2026-08-31'], ['End', '2026-09-06'], ['Home', '2026-08-31']];
                for (const [key, date] of steps) { await press(key); await expectFocus({date}, key); assert.deepEqual(await roving(), [date]); }
                assert.deepEqual((await log()).filter(entry => entry.onNavigate), [], 'in-grid moves never navigate');
                return {steps};
            });
            await check(`${label}-keyboard-arrow-beyond-grid-delayed`, async () => {
                const month = await heading();
                await press('ArrowLeft');
                await expectFocus({date: '2026-08-31'}, 'focus stays until acceptance');
                assert.equal(await heading(), month);
                assert.deepEqual((await log()).filter(entry => entry.onNavigate).at(-1), {onNavigate: '2026-08-01'});
                await accept(); await expectFocus({date: '2026-08-30'}, 'target after acceptance');
                assert.notEqual(await heading(), month);
            });
            await check(`${label}-keyboard-page-keys-delayed`, async () => {
                const steps = [['PageDown', '2026-09-01', '2026-09-30'], ['Shift+PageUp', '2025-09-01', '2025-09-30'], ['Shift+PageDown', '2026-09-01', '2026-09-30'], ['PageUp', '2026-08-01', '2026-08-30']];
                for (const [key, request, target] of steps) {
                    const before = await active();
                    await press(key);
                    await expectFocus({date: before.date}, `${key} before acceptance`);
                    assert.deepEqual((await log()).filter(entry => entry.onNavigate).at(-1), {onNavigate: request});
                    await accept(); await expectFocus({date: target}, `${key} after acceptance`); assert.deepEqual(await roving(), [target]);
                }
                return {steps};
            });
            await check(`${label}-keyboard-page-clamp-and-tab-away`, async () => {
                await open({scenario: 'month', accept: 'manual', anchor: '2026-01-01', agenda: '2026-01-31'});
                await tab.locator('[role=gridcell][tabindex="0"]').focus(); await expectFocus({date: '2026-01-31'}, 'initial');
                for (const target of ['2026-02-28', '2026-03-28']) { await press('PageDown'); await accept(); await expectFocus({date: target}, 'PageDown clamp'); }
                await press('PageDown'); await press('Tab'); await expectFocus({id: 'after'}, 'Tab away before acceptance');
                await accept(); await expectFocus({id: 'after'}, 'late acceptance does not steal focus');
                assert.deepEqual(await roving(), ['2026-04-28']);
                return {sequence: ['2026-01-31', '2026-02-28', '2026-03-28', 'Tab-away → roving 2026-04-28']};
            });
            await check(`${label}-keyboard-toolbar-announcements`, async () => {
                await open({scenario: 'month', accept: 'manual'}); await live();
                await fromBefore(3); await expectFocus({label: 'Следующий месяц'}, 'next');
                await press('Enter'); assert.deepEqual(await announcements(), [], 'nothing before acceptance');
                await accept(); await expectFocus({label: 'Следующий месяц'}, 'focus stays on next');
                const october = await heading();
                await press('Enter'); await accept();
                const november = await heading();
                await press('Shift+Tab'); await press('Shift+Tab'); await expectFocus({label: 'Предыдущий месяц'}, 'previous');
                await press('Space'); assert.equal(await heading(), november, 'previous waits for acceptance'); await accept();
                const values = (await announcements()).map(entry => `${entry.role}: ${entry.text}`);
                assert.deepEqual(values, [october, november, october].map(month => `status: Открыт месяц: ${month}`));
                // October does not show 3 September: Today must request the month and wait for acceptance.
                await press('Tab'); await expectFocus({text: 'Сегодня'}, 'today');
                await press('Enter'); await expectFocus({text: 'Сегодня'}, 'Today before acceptance');
                assert.deepEqual((await log()).filter(entry => entry.onNavigate).at(-1), {onNavigate: '2026-09-01'});
                await accept(); await expectFocus({date: '2026-09-03'}, 'Today moves focus to the today cell');
                assert.equal((await announcements()).length, 3, 'Today adds no month announcement');
                return {announcements: values};
            });
            await check(`${label}-keyboard-agenda-dialog`, async () => {
                await open({scenario: 'month'});
                await fromBefore(4); await press('Enter');
                const dialog = tab.getByRole('dialog'); await dialog.waitFor();
                await expectFocus({inDialog: true, close: true}, 'initial focus on the first control');
                const id = await dialog.getAttribute('id');
                assert.equal(await tab.locator('[role=gridcell][data-date="2026-09-03"]').getAttribute('aria-controls'), id);
                assert.equal(await tab.locator('[role=gridcell][data-date="2026-09-03"]').getAttribute('aria-expanded'), 'true');
                const items = await dialog.locator('li[data-item-id]').evaluateAll(nodes => nodes.map(node => node.dataset.itemId));
                assert.deepEqual([...items].sort(), ['docs', 'review', 'sprint']);
                const order = [];
                for (let i = 0; i < items.length; i++) { await press('Tab'); order.push((await active()).item); }
                assert.deepEqual(order, items, 'Tab traverses items in order');
                await press('Tab'); await expectFocus({id: 'after'}, 'Tab exits after the trigger'); await dialog.waitFor({state: 'hidden'});
                await press('Shift+Tab'); await expectFocus({date: '2026-09-03'}, 'back to trigger');
                await press('Enter'); await dialog.waitFor(); await press('Shift+Tab');
                await expectFocus({label: 'Следующий месяц'}, 'Shift+Tab exits before the trigger'); await dialog.waitFor({state: 'hidden'});
                await press('Tab'); await press('Enter'); await dialog.waitFor(); await press('Tab');
                await expectFocus({item: items[0]}, 'first item'); await press('Enter');
                const request = await tab.evaluate(() => { const entry = window.acceptance.log.findLast(value => value.onItemPress); return JSON.parse(JSON.stringify(entry.onItemPress)); });
                assert.deepEqual({date: request.date, view: request.view, id: request.item.id}, {date: '2026-09-03', view: 'agenda', id: items[0]});
                assert.equal(await tab.locator('#pressed').innerText(), items[0]);
                await press('Escape'); await dialog.waitFor({state: 'hidden'}); await expectFocus({date: '2026-09-03'}, 'Escape restores the date cell');
                return {items, request};
            });
            await check(`${label}-item-press-payload-exact`, async () => {
                // Exact payloads against the fixture objects that the page passed in `items`.
                const result = await tab.evaluate(() => {
                    const entry = window.acceptance.log.findLast(value => value.onItemPress).onItemPress;
                    return {request: JSON.parse(JSON.stringify(entry)), sameObject: window.acceptance.items.includes(entry.item)};
                });
                const fixture = JSON.parse(await tab.evaluate(() => JSON.stringify(window.acceptance.items)));
                assert.deepEqual(result.request, {item: fixture.find(item => item.id === result.request.item.id), date: '2026-09-03', view: 'agenda'});
                await tab.locator('.nc-month-item[data-item-id=sprint]').click({position: {x: 8, y: 6}}); await settle();
                const month = await tab.evaluate(() => JSON.parse(JSON.stringify(window.acceptance.log.findLast(value => value.onItemPress).onItemPress)));
                assert.deepEqual(month, {item: fixture.find(item => item.id === 'sprint'), date: '2026-09-02', view: 'month', segmentRange: {start: '2026-09-02', end: '2026-09-06'}});
                return {agenda: result.request, month, itemIdentityPreserved: result.sameObject};
            });
            await check(`${label}-status-focus-blocking-loading`, async () => {
                await open({scenario: 'month'});
                await fromBefore(4); await expectFocus({date: '2026-09-03'}, 'grid');
                await tab.evaluate(() => window.acceptance.setDataState({status: 'loading', phase: 'initial'}));
                await tab.locator('.nc-calendar[data-loading-phase=initial]').waitFor(); await settle();
                await expectFocus({role: 'region', label: 'Загрузка календаря'}, 'status region');
                assert.equal(await tab.getByRole('grid').count(), 0);
                await tab.evaluate(() => window.acceptance.setDataState({status: 'ready'}));
                await tab.getByRole('grid').waitFor(); await settle();
                await expectFocus({date: '2026-09-03'}, 'back to the date cell');
                await tab.evaluate(() => window.acceptance.setDataState({status: 'error', phase: 'initial', error: new Error('x')}));
                await tab.locator('.nc-calendar[data-status=error]').waitFor(); await settle();
                await expectFocus({role: 'region', label: 'Не удалось загрузить календарь'}, 'error status region');
                await press('Tab'); await expectFocus({text: 'Повторить'}, 'retry'); await press('Enter');
                assert.equal((await log()).filter(entry => entry === 'onRetryRequest').length, 1);
                await tab.evaluate(() => window.acceptance.setDataState({status: 'ready'}));
                await tab.getByRole('grid').waitFor(); await settle();
                await expectFocus({date: '2026-09-03'}, 'retry removed: focus returns to the date cell');
            });
            await check(`${label}-keyboard-rtl-arrows`, async () => {
                await open({scenario: 'rtl-ar'});
                assert.equal(await tab.locator('.nc-calendar').getAttribute('dir'), 'rtl');
                await tab.locator('[role=gridcell][tabindex="0"]').focus(); await expectFocus({date: '2026-09-03'}, 'initial');
                for (const [key, date] of [['ArrowLeft', '2026-09-04'], ['ArrowRight', '2026-09-03'], ['ArrowRight', '2026-09-02']]) { await press(key); await expectFocus({date}, `RTL ${key}`); }
                const row = await tab.locator('[role=gridcell][data-date="2026-09-02"]').evaluate(node => [...node.closest('[role=row]').querySelectorAll('[role=gridcell]')].map(cell => cell.dataset.date));
                await press('Home'); await expectFocus({date: row[0]}, 'Home'); await press('End'); await expectFocus({date: row[6]}, 'End');
                const first = await tab.locator('[role=gridcell]').first().boundingBox(), second = await tab.locator('[role=gridcell]').nth(1).boundingBox();
                assert.ok(first.x > second.x, 'first day of week is on the right in RTL');
                return {row};
            });
            await check(`${label}-segment-presentation-and-hit-date`, async () => {
                await open({scenario: 'segments'});
                const segments = await tab.locator('.nc-month-item').evaluateAll(nodes => nodes.map(node => ({id: node.dataset.itemId,
                    kind: node.classList.contains('nc-month-bar') ? 'bar' : node.classList.contains('nc-month-chip') ? 'chip' : 'other',
                    before: node.hasAttribute('data-continues-before'), after: node.hasAttribute('data-continues-after'), week: node.closest('[role=row]').dataset.week})));
                assert.deepEqual(segments.map(({id, kind}) => `${id}:${kind}`).sort(), ['chip:chip', 'one-day:bar', 'overnight:bar', 'split:bar', 'split:bar']);
                assert.deepEqual(segments.filter(segment => segment.id === 'split').map(({before, after, week}) => ({before, after, week})),
                    [{before: false, after: true, week: '2026-08-31'}, {before: true, after: false, week: '2026-09-07'}]);
                const second = tab.locator('.nc-month-item[data-item-id=split]').nth(1), box = await second.boundingBox();
                await second.click({position: {x: box.width - 8, y: box.height / 2}}); await settle();
                const request = await tab.evaluate(() => JSON.parse(JSON.stringify(window.acceptance.log.findLast(value => value.onItemPress).onItemPress)));
                const fixture = JSON.parse(await tab.evaluate(() => JSON.stringify(window.acceptance.items)));
                assert.deepEqual(request, {item: fixture.find(item => item.id === 'split'), date: '2026-09-08', view: 'month', segmentRange: {start: '2026-09-07', end: '2026-09-09'}});
                return {segments, request: {date: request.date, segmentRange: request.segmentRange}};
            });
            await check(`${label}-refresh-status-spacing`, async () => {
                // Visual regression found in the T14 screenshots: the refresh status touched the stale grid. QA-D-3 (lead decision):
                // no status sits in the toolbar row, so no data state moves its controls. A refresh is a 3 px progress bar over the
                // grid's top border that takes no space; a refresh error is an in-flow banner between the toolbar and the grid that
                // moves the grid by exactly its outer size. Neither covers a date cell, weekday name or toolbar control. Positions
                // are taken from the top of the calendar root: the stand's page heading names the scenario and wraps differently at 320 px.
                const gaps = {}, place = () => tab.evaluate(() => {
                    const rootNode = document.querySelector('.nc-calendar'), root = rootNode.getBoundingClientRect(), grid = document.querySelector('[role=grid]').getBoundingClientRect();
                    const statusNode = document.querySelector('.nc-calendar-status'), status = statusNode?.getBoundingClientRect(), toolbar = document.querySelector('.nc-calendar-toolbar');
                    const overlaps = box => box.left < status.right - 0.5 && status.left < box.right - 0.5 && box.top < status.bottom - 0.5 && status.top < box.bottom - 0.5;
                    const covered = status ? [...document.querySelectorAll('[role=gridcell], [role=columnheader], .nc-calendar-toolbar button')]
                        .map(node => node.getBoundingClientRect()).filter(overlaps).length : 0;
                    return {gridTop: grid.top - root.top, placement: statusNode?.dataset.placement, inToolbar: !!statusNode && toolbar.contains(statusNode),
                        status: status && {top: status.top - root.top, bottom: status.bottom - root.top, height: status.height}, margin: statusNode ? Number.parseFloat(getComputedStyle(statusNode).marginBlockEnd) || 0 : 0,
                        controls: [...toolbar.querySelectorAll('button')].map(node => { const box = node.getBoundingClientRect(); return [box.left - root.left, box.top - root.top]; }), covered};
                });
                const fits = (state, ready, scenario) => state.status && !state.inToolbar && state.covered === 0 && JSON.stringify(state.controls) === JSON.stringify(ready.controls)
                    && (scenario === 'loading-refresh' ? state.placement === 'progress' && Math.abs(state.gridTop - ready.gridTop) < 0.5 && Math.abs(state.status.height - 3) < 0.1
                        : state.placement === 'banner' && Math.abs(state.gridTop - ready.gridTop - state.status.height - state.margin) < 0.5);
                await open({scenario: 'month'}); const ready = await place();
                for (const scenario of ['loading-refresh', 'error-refresh']) {
                    await open({scenario}); const state = await place();
                    assert.ok(fits(state, ready, scenario), `${scenario}: ${JSON.stringify({ready, state})}`);
                    gaps[scenario] = state;
                }
                // QA-D-1-02/QA-D-3-01: at the reflow width of §12.5 the error banner wraps; it still covers nothing and the top of every
                // first-week cell (where its focus ring is drawn) stays the cell itself. The forced desktop grid scrolls inside its
                // region at 320 px: each cell is brought into that region before the hit test.
                await tab.setViewportSize({width: 320, height: viewport.height});
                try {
                    await open({scenario: 'month'}); const narrow = await place();
                    for (const scenario of ['loading-refresh', 'error-refresh']) {
                        await open({scenario}); const state = await place();
                        state.hits = await tab.evaluate(() => [...document.querySelectorAll('.nc-month-week:first-child [role=gridcell]')].map(cell => {
                            cell.scrollIntoView({block: 'nearest', inline: 'nearest'});
                            const box = cell.getBoundingClientRect(); return document.elementFromPoint(box.left + box.width / 2, box.top + 3)?.closest('[role=gridcell]') === cell; }));
                        assert.ok(fits(state, narrow, scenario) && state.hits.length === 7 && state.hits.every(Boolean), `${scenario} at 320 px: ${JSON.stringify({narrow, state})}`);
                        gaps[`${scenario}-320`] = state;
                    }
                } finally { await tab.setViewportSize(viewport); }
                await open({scenario: 'empty'});
                gaps.empty = await tab.evaluate(() => {
                    const status = [...document.querySelectorAll('.nc-calendar-status')].at(-1).getBoundingClientRect(), grid = document.querySelector('[role=grid]').getBoundingClientRect();
                    const spacing = parseFloat(getComputedStyle(document.querySelector('.nc-calendar')).getPropertyValue('--nelmad-calendar-spacing-sm'));
                    return {gap: Math.round(Math.max(status.top - grid.bottom, grid.top - status.bottom)), spacing};
                });
                assert.ok(gaps.empty.gap >= gaps.empty.spacing && gaps.empty.spacing > 0, `empty: ${gaps.empty.gap}px between status and grid`);
                return gaps;
            });
            await check(`${label}-double-next-under-refresh`, async () => {
                // QA-D-3-01: under the documented loading pattern (onNavigate, then loading/refresh for the new range, possibly
                // failing) the Next button stays where it was, so presses at the same point keep navigating and never retry.
                await open({scenario: 'month'});
                const next = tab.getByRole('button', {name: 'Следующий месяц'}), box = await next.boundingBox(), point = {x: box.x + box.width / 2, y: box.y + box.height / 2};
                const under = () => tab.evaluate(({x, y}) => document.elementFromPoint(x, y)?.closest('button')?.getAttribute('aria-label') ?? null, point);
                const states = [];
                for (const dataState of [{status: 'loading', phase: 'refresh'}, {status: 'error', phase: 'refresh', error: 'down'}]) {
                    await tab.mouse.click(point.x, point.y); await settle();
                    await tab.evaluate(state => window.acceptance.setDataState(state), dataState); await settle();
                    states.push({status: dataState.status, under: await under(), box: await next.boundingBox(), heading: await heading()});
                }
                await tab.mouse.click(point.x, point.y); await settle();
                const entries = await log(), navigations = entries.filter(entry => entry.onNavigate).map(entry => entry.onNavigate);
                assert.deepEqual(states.map(state => [state.under, state.box]), [['Следующий месяц', box], ['Следующий месяц', box]], JSON.stringify(states));
                assert.deepEqual([navigations, entries.filter(entry => entry === 'onRetryRequest').length, await heading()],
                    [['2026-10-01', '2026-11-01', '2026-12-01'], 0, 'декабрь 2026 г.'], JSON.stringify(entries));
                return {point, states, navigations};
            });
            await check(`${label}-constrained-overflow`, async () => {
                await open({scenario: 'constrained'});
                const result = await tab.evaluate(() => {
                    const root = document.querySelector('.nc-calendar').getBoundingClientRect(), indicator = document.querySelector('[data-date="2026-09-16"] .nc-overflow');
                    const box = indicator?.getBoundingClientRect(), controls = [...document.querySelectorAll('.nc-calendar-toolbar button')].map(node => node.getBoundingClientRect());
                    const description = document.getElementById(document.querySelector('[data-date="2026-09-16"]').getAttribute('aria-describedby')).textContent;
                    return {rootHeight: root.height, indicator: box && {width: box.width, height: box.height, text: indicator.textContent, hidden: indicator.getAttribute('aria-hidden'), tabIndex: indicator.tabIndex},
                        controlsInside: controls.every(rect => rect.top >= root.top && rect.bottom <= root.bottom && rect.height >= 24), description};
                });
                assert.ok(result.indicator, '+N indicator'); assert.ok(result.indicator.width >= 24 && result.indicator.height >= 24, `+N hit area ${JSON.stringify(result.indicator)}`);
                assert.equal(result.indicator.hidden, 'true'); assert.equal(result.indicator.tabIndex, -1);
                assert.ok(result.controlsInside, 'toolbar controls are not clipped');
                assert.match(result.description, /ещё/);
                return result;
            });
        }
        const fixture = id => tab.evaluate(id => JSON.parse(JSON.stringify(window.acceptance.items.find(item => item.id === id))), id);
        const h = {tab, check, label, open, press, settle, accept, fixture, live, log};
        if (milestone === 'alpha.2' && viewport.touch) await mobileChecks(h);
        else if (milestone === 'alpha.2' && viewport.width === 1280) await desktopChecks(h);
        const axeResults = {}, excluded = report.axe.excludedNodes[label] = {};
        // [state, URL params, preparation, emulated prefers-color-scheme]: the alpha.1 matrix on desktop sizes, alpha.2 states per context.
        const states = [...(viewport.touch ? [] : matrix[milestone].map(state => [state, {scenario: state === 'agenda-open' ? 'month' : state},
            state === 'agenda-open' ? async () => { await tab.locator('[role=gridcell][tabindex="0"]').focus(); await press('Enter'); await tab.getByRole('dialog').waitFor(); await settle(); } : null])),
        ...(milestone === 'alpha.2' ? axeStates(h, {touch: !!viewport.touch, wide: viewport.width === 1280}) : [])];
        for (const [state, params, prepare, scheme] of states) await check(`${label}-axe-${state}`, async () => {
            await tab.emulateMedia({colorScheme: scheme ?? 'light'});
            await open(params);
            if (prepare) { await prepare(); await settle(); }
            if (!await tab.evaluate(() => 'axe' in window)) await tab.addScriptTag({content: axeSource});
            const scan = values => tab.evaluate(async values => {
                const result = await window.axe.run(document, {runOnly: {type: 'tag', values}, resultTypes: ['violations', 'incomplete']});
                const find = target => { let scope = document, node = null; for (const selector of [].concat(target[0])) { node = scope?.querySelector(selector); scope = node?.shadowRoot ?? node; } return node; };
                const owner = target => find(target)?.closest('.nc-theme') ? 'package' : 'harness';
                const summarize = list => list.map(rule => ({id: rule.id, impact: rule.impact, help: rule.help, tags: rule.tags,
                    nodes: rule.nodes.map(node => ({target: node.target, owner: owner(node.target), html: node.html.slice(0, 300), summary: node.failureSummary?.slice(0, 500)}))}));
                return {axeVersion: window.axe.version, violations: summarize(result.violations), incomplete: summarize(result.incomplete), passes: result.passes.length};
            }, values);
            const wcag = await scan(tags), practice = await scan(['best-practice']);
            const review = await tab.evaluate(reviewAxe, {violations: wcag.violations, incomplete: wcag.incomplete});
            axeResults[state] = {wcag, bestPractice: practice, review};
            writeFileSync(join(output, `${label}-axe-${state}.json`), JSON.stringify(axeResults[state], null, 2) + '\n');
            if (kind === 'vite' || ['month', 'agenda-open', 'mobile-inline', 'mobile-sheet-open', 'auto-desktop', 'neutral-comfortable-dark'].includes(state)) await tab.screenshot({path: join(output, `${label}-${state}.png`), fullPage: true});
            for (const entry of review.violations.filter(entry => entry.excluded)) excluded[entry.rule] = (excluded[entry.rule] ?? 0) + 1;
            const owned = review.violations.filter(entry => !entry.excluded && entry.owner === 'package').map(entry => `${entry.rule} ${entry.target}: ${entry.reason}`);
            assert.deepEqual(owned, [], 'package-owned WCAG violations');
            assert.deepEqual(review.violations.filter(entry => !entry.excluded).map(entry => entry.rule), [], 'harness WCAG violations');
            const unresolved = review.incomplete.filter(entry => !entry.resolved && entry.owner === 'package').map(entry => `${entry.rule} ${entry.target}: ${entry.reason}`);
            assert.deepEqual(unresolved, [], 'package-owned incomplete results without a verified resolution');
            return {axeVersion: wcag.axeVersion, violations: 0, excludedNodes: review.violations.filter(entry => entry.excluded).length,
                incomplete: wcag.incomplete.map(rule => `${rule.id}×${rule.nodes.length}`), incompleteResolved: review.incomplete.filter(entry => entry.resolved).length,
                minimumContrast: review.minimumContrast, bestPractice: practice.violations.map(rule => `${rule.id}: ${rule.nodes.map(node => node.owner).join(',')}`), log: `${label}-axe-${state}.json`};
        });
        await check(`${label}-no-console-or-external-network`, async () => {
            assert.deepEqual(errors, []); assert.deepEqual(network, []); return {errors, network};
        });
        await context.close();
    }
    // A filtered run skips checks without recording them: its outcome is 'partial', never release evidence.
    report.outcome = runOutcome({failures, filter: only?.source}); report.failures = failures;
    if (report.outcome === 'partial') console.log(`PARTIAL: filtered by --only=${only.source}; not evidence of a full run`);
    if (failures.length) process.exitCode = 1;
} catch (error) {
    report.outcome = 'fail'; report.error = String(error?.stack ?? error); console.error(String(error).slice(0, 6000)); process.exitCode = 1;
} finally {
    await browser?.close();
    await stop();
    report.finishedAt = new Date().toISOString(); save();
    console.log(`Report: ${output}`);
}
