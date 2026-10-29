import assert from 'node:assert/strict';
import {spawn, spawnSync} from 'node:child_process';
import {cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync} from 'node:fs';
import {createServer} from 'node:http';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {test} from 'node:test';
import * as harness from './packed-harness.mjs';

const {createServers, env, root} = harness;

// Harness self-checks (review 2026-10-09-2): `node --test scripts/implementation/harness.checks.mjs`.
const scratch = () => mkdtempSync(join(tmpdir(), 'calendar-harness-check-'));
const listen = (server, port) => new Promise(resolve => server.listen(port, '127.0.0.1', resolve));

test('the npm cache of every packed-consumer command lives in the platform temporary directory', () => {
    // The CI job runs on ubuntu-latest, where a hard-coded macOS path such as /private/tmp cannot be created.
    assert.ok(env.npm_config_cache.startsWith(tmpdir()) || env.npm_config_cache === process.env.CALENDAR_NPM_CACHE, env.npm_config_cache);
    for (const script of ['packed-harness.mjs', 'bundle-size.mjs']) assert.doesNotMatch(readFileSync(join(root, 'scripts/implementation', script), 'utf8'), /['"]\/private\//, script);
});

test('a filtered acceptance run is partial, never a pass, and records its filter', () => {
    const {runOutcome} = harness;
    assert.equal(typeof runOutcome, 'function', 'shared outcome rule');
    assert.equal(runOutcome({failures: [], filter: '^no-such-check$'}), 'partial');
    assert.equal(runOutcome({failures: ['x'], filter: 'x'}), 'fail');
    assert.equal(runOutcome({failures: [], filter: undefined}), 'pass');
    const source = readFileSync(join(root, 'scripts/implementation/alpha-acceptance.mjs'), 'utf8');
    assert.match(source, /filter: only \? only\.source : null/);
    assert.match(source, /report\.outcome = runOutcome\(\{failures, filter: only\?\.source\}\)/);
    assert.doesNotMatch(source, /report\.outcome = failures\.length \? 'fail' : 'pass'/);
});

test('serve() rejects a port that a stale server still holds instead of returning its content', async () => {
    const output = scratch(), app = scratch(), port = 4519;
    writeFileSync(join(app, 'server.mjs'), "import {createServer} from 'node:http'; createServer((q, s) => s.end('FRESH')).listen(Number(process.env.PORT), '127.0.0.1');\n");
    const stale = createServer((request, response) => response.end('STALE build from an earlier run'));
    await listen(stale, port);
    const {serve, stop} = createServers(output);
    try {
        await assert.rejects(serve('vite', app, port), /already in use/);
    } finally {
        await stop(); await new Promise(resolve => stale.close(resolve));
    }
    // With the port free the spawned child answers.
    const servers = createServers(output);
    try { assert.equal(await servers.serve('vite', app, port), 'FRESH'); } finally { await servers.stop(); }
});

test('CI uploads the reports of its own packed-consumer, acceptance and probe runs from the runner temporary directory', () => {
    const workflow = readFileSync(join(root, '.github/workflows/ci.yml'), 'utf8');
    const job = workflow.slice(workflow.indexOf('  packed-consumers:'), workflow.indexOf('  browser-probes:')), probes = workflow.slice(workflow.indexOf('  browser-probes:'));
    assert.match(job, /npm run check:package -- --tarball="\$TARBALL" --output="\$RUNNER_TEMP\/packed-consumers"/);
    assert.match(job, /alpha-acceptance\.mjs --milestone="\$MILESTONE" --tarball="\$TARBALL" --output="\$RUNNER_TEMP\/packed-consumers\/milestone-acceptance"/);
    assert.match(job, /bundle-size\.mjs --tarball="\$TARBALL" --output="\$RUNNER_TEMP\/packed-consumers\/bundle-size"/);
    // The size step follows the acceptance and directly precedes the upload, so a size failure never hides their results.
    assert.match(job, /alpha-acceptance\.mjs [^\n]+\n(?: {8}[^\n]+\n)*(?: {6}#[^\n]*\n)* {6}- run: node scripts\/implementation\/bundle-size\.mjs [^\n]+\n {6}- uses: actions\/upload-artifact@/);
    assert.match(job, /if: always\(\)\n {8}with:\n {10}name: packed-consumers\n {10}path: \$\{\{ runner\.temp \}\}\/packed-consumers/);
    assert.match(probes, /if: always\(\)\n {8}with:\n {10}name: browser-probes\n {10}path: \$\{\{ runner\.temp \}\}\/browser-probes/);
    assert.doesNotMatch(workflow, /docs\/implementation\/evidence/);
});

// Issue #12, decision Q2b: the size gate records Node and zlib, so its job cannot silently float back to the latest patch.
test('the packed-consumers job sets up one exact Node version', () => {
    const workflow = readFileSync(join(root, '.github/workflows/ci.yml'), 'utf8');
    const job = workflow.slice(workflow.indexOf('  packed-consumers:'), workflow.indexOf('  browser-probes:'));
    assert.deepEqual([...job.matchAll(/^ +node-version: (.+)$/gm)].map(match => /^\d+\.\d+\.\d+$/.test(match[1])), [true]);
    assert.match(job, /- uses: actions\/setup-node@[0-9a-f]{40} # v[\d.]+\n {8}with:\n {10}node-version: \d+\.\d+\.\d+\n/);
});

// Issue #12, decision Q1: the bundle-size verdict with synthetic sizes and module graphs.
test('the bundle-size verdict reports a candidate excess, fails an enforced one and fails a build assertion in both modes', async () => {
    const {buildAssertions, verdict} = await import('./bundle-size.mjs');
    const candidate = {jsGzipBytes: 81920, cssGzipBytes: 10240, status: 'candidate', enforce: false};
    const frozen = {...candidate, status: 'frozen', enforce: true, decision: 'https://github.com/Nelmad/calendar/issues/13#issuecomment-1', decidedOn: '2026-11-02'};
    const delta = {js: 96377, css: 4282}, passing = [{name: 'Day.js is absent from the calendar graph', pass: true}];
    // (a) Report-only and over budget: exit 0, overBudget and a warning annotation with the excess.
    assert.deepEqual(verdict({budget: candidate, delta, assertions: passing}), {exitCode: 0, overBudget: {js: true, css: false},
        annotations: ['::warning title=Bundle size::JS delta 96377 B exceeds candidate 81920 B by 14457 B (14.1 KiB)']});
    assert.deepEqual(verdict({budget: candidate, delta: {js: 81920, css: 10240}, assertions: passing}), {exitCode: 0, overBudget: {js: false, css: false}, annotations: []});
    // (b) Enforced and over budget: exit 1; at the threshold it passes.
    const enforced = verdict({budget: frozen, delta: {js: 4096, css: 10241}, assertions: passing});
    assert.deepEqual([enforced.exitCode, enforced.overBudget], [1, {js: false, css: true}]);
    assert.deepEqual(enforced.annotations, ['::error title=Bundle size::CSS delta 10241 B exceeds frozen 10240 B by 1 B (0.0 KiB)']);
    assert.equal(verdict({budget: frozen, delta: {js: 81920, css: 4282}, assertions: passing}).exitCode, 0);
    // (c) Day.js in the graph: exit 1 in both modes, within budget too.
    const required = ['calendar/CalendarMonth', 'calendar/DayAgendaBody', 'calendar/SourceSelector', 'calendar/overlays', 'themes/classic', 'themes/neutral']
        .map(path => `/t/node_modules/@nelmad/calendar/dist/v02/${path}.js`);
    const build = ({graph = required, included = graph, text = 'export{};', js = true, css = true, target = 'es2020'} = {}) => ({resolved: {target}, graph, included,
        chunks: [...(js ? [{type: 'js', text}] : []), ...(css ? [{type: 'css', text: ''}] : [])]});
    const baseline = build({graph: ['/t/src/baseline.jsx'], css: false});
    const failed = builds => buildAssertions(builds).filter(assertion => !assertion.pass).map(assertion => assertion.name);
    const failures = calendar => failed({baseline, calendar});
    assert.deepEqual(failures(build()), []);
    const dayjs = buildAssertions({baseline, calendar: build({graph: [...required, '/t/node_modules/dayjs/dayjs.min.js'], included: required})});
    assert.deepEqual(dayjs.filter(assertion => !assertion.pass).map(assertion => assertion.name), ['Day.js is absent from the calendar graph']);
    for (const budget of [candidate, frozen]) assert.equal(verdict({budget, delta: {js: 1, css: 1}, assertions: dayjs}).exitCode, 1);
    // Every other assertion catches its own fault. React Aria's barrels load the drag and drop modules into the graph and
    // Rollup drops them, so decision Q7 checks the rendered modules.
    const dnd = '/t/node_modules/react-aria/dist/private/dnd/useDrag.mjs';
    assert.deepEqual(failures(build({graph: [...required, dnd], included: required})), []);
    assert.deepEqual(failures(build({included: [...required, dnd]})), ['no React Aria drag and drop module in the calendar chunks']);
    assert.deepEqual(failures(build({text: 'console.warn("[@nelmad/calendar] x")'})), ['no calendar chunk contains the development-warning prefix']);
    assert.deepEqual(failures(build({text: 'import "dayjs";'})), ['Day.js is absent from the calendar output']);
    for (const path of required) {
        assert.deepEqual(failures(build({included: required.filter(id => id !== path)})), [`calendar build contains ${path.slice(path.indexOf('dist/'))}`]);
    }
    assert.deepEqual(failures(build({css: false})), ['calendar build has JS and CSS chunks']);
    assert.deepEqual(failures(build({js: false})), ['calendar build has JS and CSS chunks']);
    assert.deepEqual(failed({baseline: build({graph: [], js: false, css: false}), calendar: build()}), ['baseline build has a JS chunk']);
    assert.deepEqual(failed({baseline: build({graph: required.slice(0, 1), css: false}), calendar: build()}), ['baseline build has no @nelmad/calendar module']);
    // Decision Q2a: the gated number is measured at es2020 only, in both builds.
    assert.deepEqual(failures(build({target: ['es2020', 'edge88', 'firefox78', 'chrome87', 'safari14']})), ['both builds use target es2020']);
    assert.deepEqual(failed({baseline: build({graph: [], css: false, target: 'esnext'}), calendar: build()}), ['both builds use target es2020']);
});

// Issue #12, decisions Q1 and Q6c: the thresholds come only from budget.json, and a frozen budget names its dated decision.
test('budget.json is read strictly: a malformed budget or a frozen one without its decision is a measurement error', async () => {
    const {fixture, readBudget} = await import('./bundle-size.mjs');
    const candidate = {jsGzipBytes: 81920, cssGzipBytes: 10240, status: 'candidate', enforce: false};
    // The candidate ceilings until the freeze PR (decision Q6c) changes this file and this line together.
    assert.deepEqual(readBudget(readFileSync(join(fixture, 'budget.json'), 'utf8')), candidate);
    const frozen = {...candidate, status: 'frozen', enforce: true, decision: 'https://github.com/Nelmad/calendar/issues/13#issuecomment-1', decidedOn: '2026-11-02'};
    assert.deepEqual(readBudget(JSON.stringify(frozen)), frozen);
    for (const [text, reason] of [['{', /not JSON/], ['[]', /object/], [{...candidate, jsGzipBytes: undefined}, /jsGzipBytes/], [{...candidate, cssGzipBytes: '10240'}, /cssGzipBytes/],
        [{...candidate, jsGzipBytes: 0}, /jsGzipBytes/], [{...candidate, status: 'draft'}, /status/], [{...candidate, enforce: 'false'}, /enforce/],
        [{...candidate, enforce: true}, /enforce is true exactly when status is "frozen"/], [{...frozen, enforce: false}, /enforce is true exactly when status is "frozen"/],
        [{...frozen, decision: undefined}, /decision/], [{...frozen, decision: 'http://example.com/decision'}, /decision/],
        [{...frozen, decidedOn: undefined}, /decidedOn/], [{...frozen, decidedOn: '2026-13-01'}, /decidedOn/], [{...frozen, decidedOn: '2026-11-02T00:00:00Z'}, /decidedOn/]]) {
        assert.throws(() => readBudget(typeof text === 'string' ? text : JSON.stringify(text)), reason, JSON.stringify(text));
    }
});

// Issue #20: the CLS budget file is configuration only and is read as strictly as budget.json.
test('cls-budget.json is read strictly: a malformed scenario value or run count, or a frozen budget without its decision, is a measurement error', async () => {
    const {budgetFile, budgetScenarios, readClsBudget} = await import('./cls-probe.mjs');
    const candidate = {scenarios: {'auto-390': 0, 'mobile-390': 0, 'desktop-1200': 0, 'auto-1200': 0.1}, runs: 10, status: 'candidate', enforce: false};
    // The candidate values until the freeze PR changes this file and this line together.
    assert.deepEqual(readClsBudget(readFileSync(budgetFile, 'utf8')), candidate);
    assert.deepEqual(Object.keys(candidate.scenarios), budgetScenarios);
    const frozen = {...candidate, status: 'frozen', enforce: true, decision: 'https://github.com/Nelmad/calendar/issues/13#issuecomment-1', decidedOn: '2026-11-02'};
    assert.deepEqual(readClsBudget(JSON.stringify(frozen)), frozen);
    const scenarios = values => ({...candidate, scenarios: {...candidate.scenarios, ...values}});
    const {'auto-1200': _switch, ...missing} = candidate.scenarios;
    for (const [text, reason] of [['{', /not JSON/], ['[]', /object/], [{...candidate, scenarios: undefined}, /scenarios must be an object/],
        [{...candidate, scenarios: missing}, /name exactly/], [scenarios({'auto-1280': 0}), /name exactly/], [scenarios({'auto-1200': '0.1'}), /auto-1200/],
        [scenarios({'auto-390': -0.01}), /auto-390/], [scenarios({'mobile-390': null}), /mobile-390/], [{...candidate, runs: undefined}, /runs/], [{...candidate, runs: 0}, /runs/],
        [{...candidate, runs: 2.5}, /runs/], [{...candidate, status: 'draft'}, /status/], [{...candidate, enforce: 'false'}, /enforce/],
        [{...candidate, enforce: true}, /enforce is true exactly when status is "frozen"/], [{...frozen, enforce: false}, /enforce is true exactly when status is "frozen"/],
        [{...frozen, decision: undefined}, /decision/], [{...frozen, decision: 'http://example.com/decision'}, /decision/],
        [{...frozen, decidedOn: undefined}, /decidedOn/], [{...frozen, decidedOn: '2026-02-30'}, /decidedOn/]]) {
        assert.throws(() => readClsBudget(typeof text === 'string' ? text : JSON.stringify(text)), reason, JSON.stringify(text));
    }
});

test('the CLS probe takes the largest session window, cross-checks the trace and reports a candidate budget without failing', async () => {
    const {budgetVerdict, harnessErrors, layoutShiftEvents, sessionWindow, traceMismatch} = await import('./cls-probe.mjs');
    const shift = (startTime, value, hadRecentInput = false) => ({startTime, value, hadRecentInput, sources: []});
    // A 1 s gap or a 5 s span starts a new window.
    assert.equal(sessionWindow([]), 0);
    assert.equal(sessionWindow([shift(0, 0.1), shift(999, 0.2), shift(2100, 0.25)]), 0.30000000000000004);
    assert.equal(sessionWindow([shift(0, 0.1), shift(1000, 0.2)]), 0.2);
    assert.equal(sessionWindow([0, 900, 1800, 2700, 3600, 4500, 5400].map(time => shift(time, 0.1))), 0.6);
    // Only main-frame events without recent input, in trace order.
    const event = (ts, score, data = {}) => ({name: 'LayoutShift', ts, args: {data: {score, is_main_frame: true, had_recent_input: false, ...data}}});
    const trace = {traceEvents: [event(20, 0.2), event(10, 0.1), event(30, 0.5, {is_main_frame: false}), event(40, 0.5, {had_recent_input: true}), {name: 'Paint', ts: 5}]};
    assert.deepEqual(layoutShiftEvents(trace), [{ts: 10, score: 0.1}, {ts: 20, score: 0.2}]);
    assert.equal(traceMismatch([shift(1, 0.1), shift(2, 0.2 + 5e-7)], layoutShiftEvents(trace)), null);
    assert.match(traceMismatch([shift(1, 0.1)], layoutShiftEvents(trace)), /1 observer entries but 2 trace/);
    assert.match(traceMismatch([shift(1, 0.1), shift(2, 0.21)], layoutShiftEvents(trace)), /entry 1/);
    const clean = {entries: [], paint: {fcp: 40}, hydration: {startedAt: 90}, recoverableErrors: [], replacements: 1, hydrationLayouts: ['mobile', 'desktop'],
        callbacks: [{name: 'onVisibleRangeChange'}], traceMismatch: null, pageErrors: [], assertions: []};
    assert.deepEqual(harnessErrors(clean), []);
    assert.deepEqual(harnessErrors({...clean, entries: [shift(1, 0.01, true)], paint: {fcp: 95}, recoverableErrors: ['mismatch'], replacements: 2,
        hydrationLayouts: ['mobile', 'desktop', 'mobile'], callbacks: [], traceMismatch: 'x', pageErrors: ['boom'], assertions: ['layout']}).length, 8);
    const budget = {scenarios: {'auto-390': 0, 'mobile-390': 0, 'desktop-1200': 0, 'auto-1200': 0.1}, runs: 2, status: 'candidate', enforce: false};
    const runs = (...values) => values.map(cls => ({cls, entries: cls ? [shift(1, cls)] : []}));
    const results = {'auto-390': runs(0, 0), 'mobile-390': runs(0, 0), 'desktop-1200': runs(0, 0), 'auto-1200': runs(0.05, 0.1)};
    assert.deepEqual([budgetVerdict(budget, results).pass, budgetVerdict(budget, results).exitCode], [true, 0]);
    // A zero budget allows no entry at all; a missing run is never a pass. A candidate reports, an enforced budget fails.
    const over = {...results, 'auto-390': runs(0, 1e-9), 'auto-1200': runs(0.11)};
    const reported = budgetVerdict(budget, over);
    assert.deepEqual([reported.exitCode, reported.scenarios['auto-390'].pass, reported.scenarios['auto-1200'].pass], [0, false, false]);
    assert.match(reported.annotations.join('\n'), /::warning title=CLS budget::auto-1200: 1 of 2 runs exceeds candidate 0\.1/);
    assert.equal(budgetVerdict({...budget, status: 'frozen', enforce: true}, over).exitCode, 1);
});

// Issue #12, decision Q2a and the fixture rules: one shared config at es2020, React external only, public imports only.
test('the bundle fixture builds at target es2020 with only React and ReactDOM external and imports only the public entry', async () => {
    const {default: config} = await import('./bundle-fixture/vite.config.mjs');
    assert.equal(config.build.target, 'es2020');
    const {external} = config.build.rollupOptions;
    for (const id of ['react', 'react-dom', 'react/jsx-runtime', 'react-dom/client']) assert.ok(external(id), id);
    for (const id of ['react-aria', 'react-aria-components', 'react-stately', '@internationalized/date', '@nelmad/calendar', 'reactive', 'react-domain']) assert.ok(!external(id), id);
    const source = name => readFileSync(join(root, 'scripts/implementation/bundle-fixture/src', name), 'utf8');
    assert.deepEqual([...source('calendar.jsx').matchAll(/(?:from|import) '(@nelmad\/calendar[^']*)'/g)].map(match => match[1]), ['@nelmad/calendar', '@nelmad/calendar/styles.css']);
    assert.match(source('calendar.jsx'), /theme=\{search\.get\('theme'\) === 'neutral' \? neutralTheme : classicTheme\}/);
    assert.doesNotMatch(source('baseline.jsx') + source('shell.jsx'), /@nelmad\/calendar/);
});

// PV9-1-01/02: the workflows pack once and pass that archive to every harness, which then neither builds nor packs.
test('a harness given --tarball tests that archive and refuses one that differs from the checkout', () => {
    const {packCandidate, tarballArgument} = harness;
    assert.equal(tarballArgument(['node', 'x.mjs', '--output=o', '--tarball=/tmp/a.tgz']), '/tmp/a.tgz');
    assert.equal(tarballArgument(['node', 'x.mjs', '--tarball=']), undefined);
    assert.equal(tarballArgument(['node', 'x.mjs']), undefined);
    const directory = scratch(), temporary = join(directory, 'temporary'), output = join(directory, 'output'); mkdirSync(temporary); mkdirSync(output);
    // The checkout's build output must exist: the self-checks run after `npm run build` in CI.
    const pack = JSON.parse(spawnSync('npm', ['pack', '--json', '--pack-destination', directory], {cwd: root, encoding: 'utf8'}).stdout)[0];
    const tarball = join(directory, pack.filename), recorded = [];
    const run = name => assert.fail(`${name}: a given archive is neither built nor packed`), record = (name, details) => recorded.push([name, details]);
    const given = packCandidate({run, record, temporary, output, tarball});
    assert.deepEqual([given.pack.version, given.pack.integrity, given.details.integrity], [pack.version, pack.integrity, pack.integrity]);
    assert.deepEqual(given.details.files, pack.files.map(file => file.path).sort());
    assert.deepEqual(readFileSync(join(temporary, 'calendar.tgz')), readFileSync(tarball));
    assert.deepEqual(readdirSync(output), [], 'the given archive is not copied into the report');
    assert.deepEqual(recorded.map(([name, details]) => [name, details.matchesCheckout]), [['given-archive', true]]);
    // A file changed after the pack (a stale archive or a rebuild) is refused before any consumer installs it.
    const extract = join(directory, 'extract'); mkdirSync(extract);
    spawnSync('tar', ['-xzf', tarball, '-C', extract]);
    writeFileSync(join(extract, 'package/dist/index.js'), readFileSync(join(extract, 'package/dist/index.js'), 'utf8') + '\n// tampered\n');
    const tampered = join(directory, 'tampered.tgz');
    spawnSync('tar', ['-czf', tampered, '-C', extract, 'package']);
    assert.throws(() => packCandidate({run, record, temporary: scratch(), output, tarball: tampered}), /differs from the checkout[\s\S]*dist\/index\.js/);
});

test('the browser-probe gate runs every Chrome probe except the named open check', async () => {
    const {probes, notGated} = await import('./browser-probes.mjs');
    const scripts = readdirSync(join(root, 'scripts/implementation')).filter(name => /-probe\.mjs$/.test(name));
    const gated = probes.map(([, script]) => script);
    assert.deepEqual([...scripts.filter(name => !gated.includes(name))].sort(), Object.keys(notGated).sort());
    assert.ok(gated.includes('portal-stories-check.mjs') && gated.includes('message-regressions.mjs'));
    assert.equal(new Set(probes.map(([name]) => name)).size, probes.length);
    for (const script of gated) assert.ok(readdirSync(join(root, 'scripts/implementation')).includes(script), script);
});

// Process change 2026-10-22: raw run artifacts are not kept in the repository; proof is re-runnable checks, CI and provenance.
test('raw run artifacts are ignored by git and no script depends on docs/implementation/evidence', () => {
    const paths = ['docs/implementation/evidence/t19/acceptance-attempts/attempt-1.log', 'docs/implementation/evidence/any/nested/manifest.json',
        'docs/implementation/evidence/any/screenshot.png', 'npm-debug.log'];
    const result = spawnSync('git', ['check-ignore', '--no-index', '--stdin'], {cwd: root, input: paths.join('\n'), encoding: 'utf8'});
    assert.deepEqual(result.stdout.trim().split('\n'), paths);
    // Only the lint ignore of a leftover local copy and this check may name the archived directory.
    const named = [], code = /\.(?:[cm]?js|ts|tsx|json|ya?ml|html)$/, skipped = new Set(['node_modules', '.next', 'dist', 'dist-server', 'dist-acceptance']);
    const scan = path => { if (/implementation\/evidence\b/.test(readFileSync(join(root, path), 'utf8'))) named.push(path); };
    const visit = (directory, deep) => {
        for (const entry of readdirSync(join(root, directory), {withFileTypes: true})) {
            const path = directory === '.' ? entry.name : `${directory}/${entry.name}`;
            if (entry.isDirectory()) { if (deep && !skipped.has(entry.name)) visit(path, deep); } else if (code.test(entry.name)) scan(path);
        }
    };
    visit('.', false);
    for (const directory of ['scripts', 'src', 'tests', 'stories', 'examples', '.github', '.storybook']) visit(directory, true);
    assert.deepEqual(named.sort(), ['eslint.config.js', 'scripts/implementation/harness.checks.mjs']);
});

// Owner decision 2026-10-26: the maintainers' local notes (.notes/: the internal documents, the requirement ledger and its
// tools; absent in CI) and nested Claude Code worktrees (skipped by the lint and test configs) are not part of the repository.
test('the local notes folder and nested worktrees are ignored by git', () => {
    const paths = ['.notes/requirements-0.2.json', '.notes/tools/requirements.mjs', '.claude/worktrees/any/package.json'];
    const result = spawnSync('git', ['check-ignore', '--no-index', '--stdin'], {cwd: root, input: paths.join('\n'), encoding: 'utf8'});
    assert.deepEqual(result.stdout.trim().split('\n'), paths);
    assert.equal(spawnSync('git', ['ls-files', '.notes'], {cwd: root, encoding: 'utf8'}).stdout, '', 'nothing in .notes/ is tracked');
});

test('the documented Vite example server answers 404 for a missing asset and keeps running', async () => {
    const app = scratch(), port = 4521;
    cpSync(join(root, 'examples/vite/server.mjs'), join(app, 'server.mjs'));
    mkdirSync(join(app, 'dist/assets'), {recursive: true}); mkdirSync(join(app, 'dist-server'));
    writeFileSync(join(app, 'dist/index.html'), '<div id="root"><!--app-html--></div><!--app-data-->');
    writeFileSync(join(app, 'dist/assets/app.js'), 'export {};');
    writeFileSync(join(app, 'dist-server/entry-server.js'), "export async function render() { return {html: 'SSR', prefetch: null}; }\n");
    const child = spawn(process.execPath, ['server.mjs'], {cwd: app, env: {...process.env, PORT: String(port)}, stdio: 'ignore'});
    try {
        let ready = false;
        for (let i = 0; i < 100 && !ready; i++) { try { ready = (await fetch(`http://127.0.0.1:${port}/`)).ok; } catch { await new Promise(resolve => setTimeout(resolve, 50)); } }
        assert.ok(ready, 'example server started');
        assert.equal((await fetch(`http://127.0.0.1:${port}/assets/missing-0123abcd.js`)).status, 404);
        assert.equal((await fetch(`http://127.0.0.1:${port}/assets/app.js`)).status, 200);
        const page = await fetch(`http://127.0.0.1:${port}/`);
        assert.equal(page.status, 200); assert.match(await page.text(), /SSR/);
        assert.equal(child.exitCode, null);
    } finally {
        child.kill();
    }
});
