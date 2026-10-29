import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdirSync, mkdtempSync, readFileSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

// Hydration CLS of the public Calendar in system Chrome (issue #20, the CLS budget of #13): the server HTML is painted
// before hydrateRoot, every layout-shift entry from navigation to 2 s after hydration settles is observed (buffered) and
// cross-checked with the LayoutShift events of a Chrome trace of the same run. Four budget scenarios run `runs` times each
// (cls-budget.json; the verdict is their maximum), the report-only scenarios 3 times. Until the freeze the budget only
// reports; a harness error (input, an unpainted server HTML, a recoverable error, a second presentation replacement, not
// exactly one onVisibleRangeChange, a trace mismatch, a page error, a failed scenario assertion) always fails.
// node scripts/implementation/cls-probe.mjs [<outputDir>] [--package=<package root with dist/>]
// --package points the same entry at a built or installed package (dist/index.js and dist/styles.css) instead of src/.
const here = dirname(fileURLToPath(import.meta.url)), root = resolve(here, '../..');
export const budgetFile = join(here, 'cls-budget.json');
/** The gated scenarios of the CLS budget, in report order. */
export const budgetScenarios = ['auto-390', 'mobile-390', 'desktop-1200', 'auto-1200'];
const reportOnlyRuns = 3;

/**
 * cls-budget.json, read strictly like bundle-fixture/budget.json: a missing or malformed scenario value or run count,
 * enforcement without the freeze, or a frozen budget without its dated decision (an https `decision` link and an ISO
 * `decidedOn`) is a measurement error, never a default.
 */
export function readClsBudget(text) {
    let budget;
    try { budget = JSON.parse(text); } catch (error) { throw new Error(`cls-budget.json is not JSON: ${error.message}`); }
    const fail = reason => { throw new Error(`cls-budget.json: ${reason}`); };
    if (!budget || typeof budget !== 'object' || Array.isArray(budget)) fail('expected an object');
    const {scenarios} = budget;
    if (!scenarios || typeof scenarios !== 'object' || Array.isArray(scenarios)) fail('scenarios must be an object of CLS values by scenario');
    if (JSON.stringify(Object.keys(scenarios).sort()) !== JSON.stringify([...budgetScenarios].sort())) fail(`scenarios must name exactly ${budgetScenarios.join(', ')}`);
    for (const name of budgetScenarios) if (typeof scenarios[name] !== 'number' || !Number.isFinite(scenarios[name]) || scenarios[name] < 0) fail(`scenarios.${name} must be a CLS value of at least 0`);
    if (!Number.isSafeInteger(budget.runs) || budget.runs <= 0) fail('runs must be a positive integer');
    if (!['candidate', 'frozen'].includes(budget.status)) fail('status must be "candidate" or "frozen"');
    if (typeof budget.enforce !== 'boolean') fail('enforce must be a boolean');
    if (budget.enforce !== (budget.status === 'frozen')) fail('enforce is true exactly when status is "frozen"');
    if (budget.status === 'frozen') {
        if (typeof budget.decision !== 'string' || !URL.canParse(budget.decision) || new URL(budget.decision).protocol !== 'https:') fail('a frozen budget needs the https link of its decision');
        const day = typeof budget.decidedOn === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(budget.decidedOn) ? new Date(`${budget.decidedOn}T00:00:00Z`) : null;
        if (!day || Number.isNaN(day.getTime()) || day.toISOString().slice(0, 10) !== budget.decidedOn) fail('a frozen budget needs decidedOn as an ISO date (YYYY-MM-DD)');
    }
    return budget;
}
/** CLS as the largest session window of the entries: a new window after a 1 s gap or once the window spans 5 s. */
export function sessionWindow(entries, {gap = 1000, cap = 5000} = {}) {
    let best = 0, current = 0, first = 0, last = 0, open = false;
    for (const entry of [...entries].sort((a, b) => a.startTime - b.startTime)) {
        if (open && entry.startTime - last < gap && entry.startTime - first < cap) current += entry.value;
        else { current = entry.value; first = entry.startTime; open = true; }
        last = entry.startTime; best = Math.max(best, current);
    }
    return best;
}
/** The main-frame LayoutShift events of a Chrome trace without recent input, in trace order. */
export function layoutShiftEvents(trace) {
    const events = Array.isArray(trace) ? trace : trace?.traceEvents ?? [];
    return events.filter(event => event.name === 'LayoutShift' && event.args?.data?.is_main_frame === true && event.args.data.had_recent_input === false)
        .sort((a, b) => a.ts - b.ts).map(event => ({ts: event.ts, score: event.args.data.score}));
}
/** The trace cross-check: the same count and order as the observer entries without recent input, each score within 1e-6. */
export function traceMismatch(entries, events) {
    const observed = entries.filter(entry => !entry.hadRecentInput);
    if (observed.length !== events.length) return `${observed.length} observer entries but ${events.length} trace LayoutShift events`;
    const index = observed.findIndex((entry, at) => !(Math.abs(entry.value - events[at].score) <= 1e-6));
    return index < 0 ? null : `entry ${index}: observer value ${observed[index].value}, trace score ${events[index].score}`;
}
/** Harness errors of one run, whatever the budget mode. */
export function harnessErrors(run) {
    const errors = [];
    if (run.entries.some(entry => entry.hadRecentInput)) errors.push('a layout-shift entry has hadRecentInput: true (the fixture has no input)');
    if (!(run.paint?.fcp >= 0 && run.paint.fcp < run.hydration?.startedAt)) errors.push('hydration started before the server HTML was painted');
    if (run.recoverableErrors.length) errors.push(`${run.recoverableErrors.length} recoverable hydration error(s): ${run.recoverableErrors[0]}`);
    if (run.replacements > 1) errors.push(`${run.replacements} presentation replacements at hydration: ${run.hydrationLayouts.join(' → ')}`);
    const ranges = run.callbacks.filter(callback => callback.name === 'onVisibleRangeChange').length;
    if (ranges !== 1) errors.push(`${ranges} onVisibleRangeChange calls instead of exactly one`);
    if (run.traceMismatch) errors.push(`trace mismatch: ${run.traceMismatch}`);
    for (const error of run.pageErrors) errors.push(`page error: ${error}`);
    for (const failure of run.assertions) errors.push(`assertion: ${failure}`);
    return errors;
}
/**
 * The budget verdict over the runs of each gated scenario: a zero budget means no layout-shift entry in any run, any other
 * value bounds the maximum CLS. A candidate budget only reports (exit 0, warning annotations); an enforced one fails.
 */
export function budgetVerdict(budget, results) {
    const scenarios = {}, annotations = [];
    for (const name of budgetScenarios) {
        const runs = results[name] ?? [], limit = budget.scenarios[name];
        const max = runs.length ? Math.max(...runs.map(run => run.cls)) : Number.NaN, entries = runs.reduce((sum, run) => sum + run.entries.length, 0);
        const complete = runs.length === budget.runs, pass = complete && (limit === 0 ? entries === 0 : max <= limit);
        scenarios[name] = {budget: limit, runs: runs.length, max, entries, pass};
        if (!pass) annotations.push(`::${budget.enforce ? 'error' : 'warning'} title=CLS budget::${name}: ${complete ? `max CLS ${max.toFixed(4)} over ${runs.length} runs (${entries} entries)` : `${runs.length} of ${budget.runs} runs`} exceeds ${budget.status} ${limit}`);
    }
    const pass = Object.values(scenarios).every(scenario => scenario.pass);
    return {scenarios, pass, annotations, exitCode: budget.enforce && !pass ? 1 : 0};
}

const phone = {viewport: {width: 390, height: 844}, deviceScaleFactor: 3, isMobile: true, hasTouch: true};
const desktop = {viewport: {width: 1280, height: 900}, deviceScaleFactor: 1};
const breakpointOf = options => options.mobileBreakpoint ?? 640;
// Wrapper classes of the page stylesheet. The root has 16 px padding, so a 671 px wrapper gives a 639 px content box.
export const scenarios = [
    {name: 'auto-390', budget: true, context: phone, wrapper: 'w390', options: {}},
    {name: 'mobile-390', budget: true, context: phone, wrapper: 'w390', options: {layout: 'mobile'}},
    {name: 'desktop-1200', budget: true, context: desktop, wrapper: 'w1200', options: {layout: 'desktop'}},
    {name: 'auto-1200', budget: true, context: desktop, wrapper: 'w1200', options: {}},
    {name: 'auto-1200-overlay', context: desktop, wrapper: 'w1200', options: {agendaPresentation: 'overlay'}},
    {name: 'auto-1200-comfortable', context: desktop, wrapper: 'w1200', options: {density: 'comfortable'}},
    {name: 'auto-1200-initial-blocking-load', context: desktop, wrapper: 'w1200', options: {blocking: true}},
    {name: 'auto-1200-text-32px', context: desktop, wrapper: 'w1200 large', options: {}},
    {name: 'desktop-1200-text-32px', context: desktop, wrapper: 'w1200 large', options: {layout: 'desktop'}},
    {name: 'auto-1200-strict-csp', context: desktop, wrapper: 'w1200', options: {}, csp: true},
    {name: 'desktop-1200-strict-csp', context: desktop, wrapper: 'w1200', options: {layout: 'desktop'}, csp: true},
    {name: 'auto-1200-breakpoint-900', context: desktop, wrapper: 'w1200', options: {mobileBreakpoint: 900}},
    {name: 'auto-content-639', context: desktop, wrapper: 'w671', options: {}, layout: 'mobile'},
    {name: 'auto-content-640', context: desktop, wrapper: 'w672', options: {}, layout: 'desktop'},
    {name: 'auto-host-inline-block', context: desktop, wrapper: 'host-inline-block', options: {}},
    {name: 'auto-host-absolute', context: desktop, wrapper: 'host-absolute', options: {}},
    {name: 'auto-host-max-content-track', context: desktop, wrapper: 'host-max-content', options: {}},
    // On main the root content box stays below 640 px here, so hydration switches nothing. The title's width depends on the
    // font system-ui resolves to (510 px on macOS, 578 px in a Verdana-like font, which would switch), so the host is capped
    // at 660 px: a wider font wraps the title at a 628 px content box, still wider than the toolbar.
    {name: 'auto-host-inline-block-long-title', context: desktop, wrapper: 'host-inline-block capped', options: {longTitle: true}, layout: 'mobile', below: 640},
    // The feedback-band hydration setup of responsive-probe.mjs: its fixture, classic scrollbars, a 645 px root content box
    // without a page scrollbar and a window height between the heights of both layouts at that width (measured first).
    {name: 'auto-feedback-band', band: true, wrapper: '', options: {fixture: 'band'}},
    // Runtime switches after hydration are recorded, not gated.
    {name: 'auto-resize-639-640', context: desktop, wrapper: 'w671', options: {}, layout: 'mobile', resize: ['w672', 'w671', 'w672', 'w671']},
];
const pageCss = `body { margin: 0; font: 16px/1.4 system-ui; }
#after { block-size: 120px; }
.w390 { inline-size: 390px; }
.w671 { inline-size: 671px; }
.w672 { inline-size: 672px; }
.w1200 { inline-size: 1200px; }
.large { font-size: 32px; }
.host-inline-block { display: inline-block; }
.capped { max-inline-size: 660px; }
.host-absolute { position: absolute; }
.host-max-content { display: grid; grid-template-columns: max-content; }
`;
// The same-origin head script: every layout-shift entry from navigation on (buffered), with its sources as they were.
const observerJs = `window.__cls = {shifts: []};
(() => {
    const rect = r => r && {x: r.x, y: r.y, width: r.width, height: r.height};
    const describe = node => !node ? null : node.nodeType !== 1 ? node.nodeName : node.localName + (node.id ? '#' + node.id : '')
        + [...node.classList].map(name => '.' + name).join('') + (node.dataset.week ? '[data-week=' + node.dataset.week + ']' : '')
        + (node.dataset.date ? '[data-date=' + node.dataset.date + ']' : '') + (node.dataset.presentation ? '[data-presentation=' + node.dataset.presentation + ']' : '');
    new PerformanceObserver(list => {
        for (const entry of list.getEntries()) window.__cls.shifts.push({startTime: entry.startTime, value: entry.value, hadRecentInput: entry.hadRecentInput,
            sources: entry.sources.map(source => ({node: describe(source.node), previousRect: rect(source.previousRect), currentRect: rect(source.currentRect)}))});
    }).observe({type: 'layout-shift', buffered: true});
})();
`;
const page = (html, wrapper) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>CLS probe</title>
<script src="/observer.js"></script>
<link rel="stylesheet" href="/styles.css">
<link rel="stylesheet" href="/page.css">
</head>
<body>
<div id="wrapper"${wrapper ? ` class="${wrapper}"` : ''}>${html}</div>
<div id="after">Page content after the calendar</div>
</body>
</html>
`;

// In-page helpers (serialized into page.evaluate).
function waitForPaint() {
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('no first-contentful-paint within 10 s')), 10_000);
        const look = () => {
            const [entry] = performance.getEntriesByName('first-contentful-paint');
            if (!entry) { requestAnimationFrame(look); return; }
            clearTimeout(timeout);
            requestAnimationFrame(() => requestAnimationFrame(() => resolve({fcp: entry.startTime, readyAt: performance.now()})));
        };
        look();
    });
}
function measure() {
    const root = document.querySelector('#wrapper .nc-calendar'), style = getComputedStyle(root), px = value => Number.parseFloat(value) || 0, box = root.getBoundingClientRect();
    const agenda = root.querySelector('.nc-day-list[data-presentation="inline"]'), after = document.getElementById('after').getBoundingClientRect();
    return {layout: root.dataset.layout, marker: !!root.querySelector('.nc-calendar-view[data-unmeasured]'), width: box.width, height: box.height,
        content: px(style.width) - px(style.paddingLeft) - px(style.paddingRight) - px(style.borderLeftWidth) - px(style.borderRightWidth),
        scrollbar: innerWidth - document.documentElement.clientWidth, afterTop: after.top + scrollY, inlineAgenda: !!agenda && getComputedStyle(agenda).display !== 'none',
        rows: [...root.querySelectorAll('.nc-month-week')].map(row => Math.round(row.getBoundingClientRect().height * 100) / 100)};
}
async function startHydration(options) {
    const wrapper = document.getElementById('wrapper');
    // Every committed data-layout value from hydration on, including values replaced within one task.
    window.layouts = [wrapper.querySelector('.nc-calendar')?.dataset.layout];
    new MutationObserver(records => {
        const changes = records.filter(record => record.attributeName === 'data-layout');
        changes.forEach((record, index) => window.layouts.push(index + 1 < changes.length ? changes[index + 1].oldValue : record.target.dataset.layout));
    }).observe(wrapper, {subtree: true, attributes: true, attributeOldValue: true, attributeFilter: ['data-layout']});
    const module = await import('/entry.mjs');
    window.cls = module.hydrate(wrapper, options);
    return {startedAt: window.cls.startedAt};
}
async function waitForSettle() {
    const started = performance.now();
    let count = -1, since = started;
    while (performance.now() - started < 15_000) {
        await new Promise(resolve => setTimeout(resolve, 50));
        const commits = window.cls.commits.length;
        if (commits !== count) { count = commits; since = performance.now(); } else if (count > 0 && performance.now() - since >= 500) return {commits, lastCommitAt: window.cls.commits.at(-1).at};
    }
    throw new Error('hydration did not settle within 15 s');
}

async function main() {
    const {build} = await import('vite');
    const positional = process.argv.slice(2).filter(arg => !arg.startsWith('--'));
    const packageRoot = process.argv.find(arg => arg.startsWith('--package='))?.slice('--package='.length);
    const output = resolve(positional[0] ?? mkdtempSync(join(tmpdir(), 'calendar-cls-'))), shots = join(output, 'screenshots');
    mkdirSync(shots, {recursive: true});
    // Development aids only: a filtered run is marked in the report and never counts as complete evidence.
    const only = process.env.CALENDAR_PROBE_ONLY ? new RegExp(process.env.CALENDAR_PROBE_ONLY) : null;
    const runsOverride = process.env.CALENDAR_CLS_RUNS ? Number(process.env.CALENDAR_CLS_RUNS) : null;
    const report = {capturedAt: new Date().toISOString(), filter: only ? String(only) : null, runsOverride, package: packageRoot ? resolve(packageRoot) : null,
        node: process.version, measurementErrors: [], scenarios: {}};
    const save = () => writeFileSync(join(output, 'cls.json'), JSON.stringify(report, null, 2) + '\n');
    let budget;
    try { budget = readClsBudget(readFileSync(budgetFile, 'utf8')); } catch (error) { report.measurementErrors.push(String(error.message)); save(); console.log(`CLS: measurement error: ${error.message}`); process.exitCode = 1; return; }
    report.budget = budget;
    if (budget.status === 'frozen') Object.assign(report, {decision: budget.decision, decidedOn: budget.decidedOn});

    const directory = mkdtempSync(join(tmpdir(), 'calendar-cls-'));
    const calendar = packageRoot ? resolve(packageRoot, 'dist/index.js') : resolve(root, 'src/index.ts');
    // Production React with the profiling build of react-dom, so <Profiler> reports every commit.
    await build({configFile: false, logLevel: 'error', mode: 'production', define: {'process.env.NODE_ENV': '"production"'},
        resolve: {alias: [{find: /^react-dom$/, replacement: 'react-dom/profiling'}, {find: /^@nelmad\/calendar$/, replacement: calendar}], dedupe: ['react', 'react-dom']},
        build: {outDir: directory, minify: true, lib: {entry: join(here, 'cls-entry.tsx'), formats: ['es'], fileName: () => 'index.mjs'}}});
    // The sources as they were built (an edit during the run does not change the record).
    report.sourceHashes = Object.fromEntries(['src/v02/styles.css', 'src/v02/calendar/useResponsiveLayout.ts', 'src/v02/calendar/useCalendarController.ts',
        'src/v02/calendar/CalendarShell.tsx', 'src/v02/core/responsive.ts', 'scripts/implementation/cls-entry.tsx', 'scripts/implementation/cls-probe.mjs',
        'scripts/implementation/cls-budget.json'].map(path => [path, createHash('sha256').update(readFileSync(join(root, path))).digest('hex')]));
    const esm = await import(pathToFileURL(join(directory, 'index.mjs')));
    const module = readFileSync(join(directory, 'index.mjs'), 'utf8');
    const css = readFileSync(packageRoot ? resolve(packageRoot, 'dist/styles.css') : join(root, 'src/v02/styles.css'), 'utf8');
    assert.equal(esm.longTitle.length, 70);

    const {chromium} = await import('./spikes/node_modules/playwright/index.mjs');
    const browser = await chromium.launch({channel: 'chrome', headless: true});
    // Classic (space-taking) scrollbars for the feedback band, as in responsive-probe.mjs.
    let classicBrowser;
    const classic = async () => classicBrowser ??= await chromium.launch({channel: 'chrome', headless: true, ignoreDefaultArgs: ['--hide-scrollbars'],
        args: ['--disable-features=OverlayScrollbar,OverlayScrollbars']});
    report.chrome = browser.version();
    const origin = 'http://calendar.test', policy = "default-src 'self'; style-src 'self'; script-src 'self'";
    const serve = async (target, html, wrapper, csp) => {
        const files = {'/': ['text/html; charset=utf-8', page(html, wrapper)], '/styles.css': ['text/css; charset=utf-8', css], '/page.css': ['text/css; charset=utf-8', pageCss],
            '/observer.js': ['text/javascript; charset=utf-8', observerJs], '/entry.mjs': ['text/javascript; charset=utf-8', module]};
        await target.route(`${origin}/**`, route => {
            const file = files[new URL(route.request().url()).pathname];
            if (!file) return route.fulfill({status: 404, body: ''});
            return route.fulfill({status: 200, contentType: file[0], body: file[1], headers: csp ? {'content-security-policy': policy} : {}});
        });
    };
    const server = options => {
        const result = esm.serverHtml(options);
        assert.deepEqual(result.callbacks, [], 'no callback during the server render');
        return result.html;
    };
    // The band window: 645 px of root content without a scrollbar, between the document heights of both layouts there.
    let band;
    const bandWindow = async () => {
        if (band) return band;
        const heights = {};
        for (const layout of ['mobile', 'desktop']) {
            const context = await (await classic()).newContext({viewport: {width: 677, height: 3000}}), target = await context.newPage();
            try {
                await serve(target, server({fixture: 'band', layout}), '', false); await target.goto(`${origin}/`);
                heights[layout] = await target.evaluate(() => document.getElementById('after').getBoundingClientRect().bottom + scrollY);
            } finally { await context.close(); }
        }
        assert.ok(heights.desktop > heights.mobile + 40, `desktop must be taller: ${JSON.stringify(heights)}`);
        return band = {viewport: {width: 677, height: Math.round((heights.desktop + heights.mobile) / 2)}, deviceScaleFactor: 1, heights};
    };

    async function run(scenario, index) {
        const owner = scenario.band ? await classic() : browser, contextOptions = scenario.band ? await bandWindow() : scenario.context;
        const html = server(scenario.options), label = `${scenario.name}-${index + 1}`;
        const context = await owner.newContext({viewport: contextOptions.viewport, deviceScaleFactor: contextOptions.deviceScaleFactor,
            isMobile: !!contextOptions.isMobile, hasTouch: !!contextOptions.hasTouch, locale: 'en-GB', timezoneId: 'UTC'});
        const target = await context.newPage(), pageErrors = [], violations = [];
        target.setDefaultTimeout(20_000);
        target.on('pageerror', error => pageErrors.push(String(error)));
        target.on('console', message => { if (/Content Security Policy/.test(message.text())) violations.push(message.text().slice(0, 160)); });
        await serve(target, html, scenario.wrapper, scenario.csp);
        // Playwright's viewport setup counts as recent input: wait at least 1 s from creating the context before loading.
        await new Promise(done => setTimeout(done, 1100));
        let trace, record;
        await owner.startTracing(target, {categories: ['loading']});
        try {
            await target.goto(`${origin}/`);
            const paint = await target.evaluate(waitForPaint);
            const serverPaint = await target.evaluate(measure);
            await target.screenshot({path: join(shots, `${label}-server.png`)});
            const hydration = await target.evaluate(startHydration, scenario.options);
            const settled = await target.evaluate(waitForSettle);
            await target.waitForTimeout(2000);
            const hydratedAt = await target.evaluate(() => performance.now()), hydrated = await target.evaluate(measure);
            await target.screenshot({path: join(shots, `${label}-hydrated.png`)});
            const hydrationLayouts = await target.evaluate(() => [...window.layouts]), steps = [];
            for (const wrapper of scenario.resize ?? []) {
                await target.evaluate(name => { document.getElementById('wrapper').className = name; }, wrapper);
                await target.waitForTimeout(1200);
                steps.push({wrapper, ...await target.evaluate(measure)});
            }
            record = {paint, serverPaint, hydration, settled, hydratedAt, hydrated, hydrationLayouts, steps,
                ...await target.evaluate(() => ({shifts: window.__cls.shifts, layouts: window.layouts, commits: window.cls.commits, callbacks: window.cls.callbacks, recoverableErrors: window.cls.errors}))};
        } finally {
            trace = JSON.parse((await owner.stopTracing()).toString('utf8'));
            await context.close();
        }
        const hydrationEntries = record.shifts.filter(entry => entry.startTime <= record.hydratedAt), runtimeEntries = record.shifts.filter(entry => entry.startTime > record.hydratedAt);
        const mount = record.commits.find(commit => commit.phase === 'mount'), forced = scenario.options.layout === 'desktop' || scenario.options.layout === 'mobile';
        const firstDecision = forced || !mount ? null : Number.isFinite(mount.content) && mount.content > 0 ? (mount.content < breakpointOf(scenario.options) ? 'mobile' : 'desktop') : 'unmeasurable';
        const assertions = [];
        if (scenario.layout && record.hydrated.layout !== scenario.layout) assertions.push(`hydrated layout ${record.hydrated.layout}, expected ${scenario.layout}`);
        if (scenario.below && !(record.hydrated.content < scenario.below)) assertions.push(`hydrated root content box ${record.hydrated.content} px, expected below ${scenario.below} px`);
        if (scenario.band && JSON.stringify(record.hydrationLayouts) !== JSON.stringify(['mobile', 'desktop'])) assertions.push(`committed layouts ${record.hydrationLayouts.join(' → ')}, expected mobile → desktop`);
        const result = {run: index + 1, cls: sessionWindow(hydrationEntries), entries: hydrationEntries, paint: record.paint, hydration: record.hydration, settled: record.settled,
            serverPaint: record.serverPaint, hydrated: record.hydrated, firstRead: mount ? {content: mount.content, width: mount.width, layout: mount.layout, marker: mount.marker} : null, firstDecision,
            layouts: record.layouts, hydrationLayouts: record.hydrationLayouts, replacements: record.hydrationLayouts.length - 1,
            commits: record.commits.length, commitPhases: record.commits.map(commit => commit.phase), callbacks: record.callbacks, recoverableErrors: record.recoverableErrors,
            pageErrors, cspViolations: violations.length, traceEvents: layoutShiftEvents(trace).length, traceMismatch: traceMismatch(record.shifts, layoutShiftEvents(trace)), assertions,
            ...(scenario.resize ? {runtime: {cls: sessionWindow(runtimeEntries), entries: runtimeEntries, steps: record.steps}} : {}),
            screenshots: [`screenshots/${label}-server.png`, `screenshots/${label}-hydrated.png`]};
        result.harnessErrors = harnessErrors(result);
        return result;
    }

    const results = {};
    let harnessFailures = 0;
    try {
        for (const scenario of scenarios) {
            if (only && !only.test(scenario.name)) continue;
            const count = runsOverride ?? (scenario.budget ? budget.runs : reportOnlyRuns), runs = [];
            for (let index = 0; index < count; index++) {
                let result;
                try { result = await run(scenario, index); } catch (error) { result = {run: index + 1, cls: Number.NaN, entries: [], harnessErrors: [`run failed: ${error?.stack ?? error}`]}; }
                runs.push(result); harnessFailures += result.harnessErrors.length ? 1 : 0;
                console.log(`${result.harnessErrors.length ? 'harness error' : 'run'}: ${scenario.name} #${index + 1} CLS ${Number(result.cls).toFixed(4)} (${result.entries.length} entries)`
                    + `${result.firstDecision ? `, first decision ${result.firstDecision}` : ''}${result.hydrationLayouts ? `, layouts ${result.hydrationLayouts.join(' → ')}` : ''}`
                    + (result.harnessErrors.length ? `\n  ${result.harnessErrors.join('\n  ')}` : ''));
            }
            results[scenario.name] = runs;
            const values = runs.map(item => item.cls), last = runs.at(-1);
            report.scenarios[scenario.name] = {budget: !!scenario.budget, wrapper: scenario.wrapper, options: scenario.options, csp: !!scenario.csp, ...(scenario.band ? {window: band} : {}),
                summary: {runs: runs.length, maxCls: Math.max(...values), minCls: Math.min(...values), entries: runs.reduce((sum, item) => sum + item.entries.length, 0),
                    harnessErrors: runs.reduce((sum, item) => sum + item.harnessErrors.length, 0),
                    serverPaint: last?.serverPaint && {width: last.serverPaint.width, content: last.serverPaint.content, scrollbar: last.serverPaint.scrollbar, marker: last.serverPaint.marker},
                    hydrated: last?.hydrated && {width: last.hydrated.width, content: last.hydrated.content, layout: last.hydrated.layout},
                    firstDecisions: [...new Set(runs.map(item => item.firstDecision))], layouts: [...new Set(runs.map(item => item.hydrationLayouts?.join(' → ')))],
                    ...(scenario.resize ? {runtimeMaxCls: Math.max(...runs.map(item => item.runtime?.cls ?? Number.NaN))} : {})},
                runs};
            save();
        }
    } finally {
        await browser.close(); await classicBrowser?.close();
    }
    const filtered = !!only || runsOverride !== null;
    report.verdict = filtered ? null : budgetVerdict(budget, results);
    report.harnessFailures = harnessFailures;
    report.outcome = harnessFailures || report.verdict?.exitCode ? 'fail' : filtered ? 'partial' : 'pass';
    save();
    for (const annotation of report.verdict?.annotations ?? []) console.log(annotation);
    const summary = budgetScenarios.filter(name => report.scenarios[name]).map(name => {
        const scenario = report.scenarios[name].summary;
        return `${name} ${scenario.maxCls.toFixed(4)} (${scenario.entries} entries, budget ${budget.scenarios[name]})`;
    }).join(', ');
    console.log(`CLS (${budget.status}${budget.enforce ? '' : ', report-only'}, outcome ${report.outcome}): ${summary || 'no budget scenario'}; `
        + `${Object.keys(report.scenarios).length - budgetScenarios.filter(name => report.scenarios[name]).length} report-only scenarios; ${harnessFailures} runs with harness errors; ${output}`);
    if (report.outcome !== 'pass') process.exitCode = 1;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) await main();
