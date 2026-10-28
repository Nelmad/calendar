import {mkdirSync, mkdtempSync, readFileSync, realpathSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join, relative, resolve} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {gzipSync} from 'node:zlib';
import {createRecorder, hash, packCandidate, prepareConsumer, root, tarballArgument, walk} from './packed-harness.mjs';

// The size protocol of the beta (issue #12): the full Calendar of the checked-in fixture, built by Vite from the installed
// packed archive, minus a baseline build of the same shell without the calendar. Each production JS and CSS file is
// gzipped alone at level 9; the deltas are compared with bundle-fixture/budget.json. Report-only until the freeze:
// `node scripts/implementation/bundle-size.mjs [--tarball=<tgz>] [--output=<dir>] [--refresh-locks]`.
export const fixture = join(root, 'scripts/implementation/bundle-fixture');
// The gated target (decision Q2a); the fixture config sets it, and a change of either is a dated protocol change.
const gatedTarget = 'es2020', gzipLevel = 9;
const gzip = bytes => gzipSync(bytes, {level: gzipLevel}).length;
const size = bytes => ({bytes, kib: Math.round(bytes / 1024 * 100) / 100});
const kib = bytes => `${(bytes / 1024).toFixed(1)} KiB`;
const posix = path => path.split('\\').join('/');

/**
 * The thresholds and mode of bundle-fixture/budget.json. A missing field, a wrong type, enforcement without the freeze (decision
 * Q1) or a frozen budget without its dated decision (decision Q6c: an https `decision` link and an ISO `decidedOn`) is a
 * measurement error, never a default.
 */
export function readBudget(text) {
    let budget;
    try { budget = JSON.parse(text); } catch (error) { throw new Error(`budget.json is not JSON: ${error.message}`); }
    const fail = reason => { throw new Error(`budget.json: ${reason}`); };
    if (!budget || typeof budget !== 'object' || Array.isArray(budget)) fail('expected an object');
    for (const key of ['jsGzipBytes', 'cssGzipBytes']) if (!Number.isSafeInteger(budget[key]) || budget[key] <= 0) fail(`${key} must be a positive integer of bytes`);
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

/**
 * The assertions of the protocol on the two gated builds. `resolved` is the resolved Vite build config, `graph` every module
 * id Rollup loaded, `included` the ids rendered into the chunks, `chunks` the measured files with their text. Any failure is
 * a measurement error in both modes.
 */
export function buildAssertions({baseline, calendar}) {
    const ids = list => list.map(posix);
    const calendarIncluded = ids(calendar.included), calendarGraph = ids(calendar.graph), baselineGraph = ids(baseline.graph);
    const code = calendar.chunks.filter(chunk => chunk.type === 'js').map(chunk => chunk.text).join('\n');
    const check = (name, pass, detail) => ({name, pass, ...(pass ? {} : {detail})});
    const dayjs = calendarGraph.filter(id => /\/node_modules\/dayjs\//.test(id));
    const dnd = calendarIncluded.filter(id => id.includes('/node_modules/react-aria/dist/private/dnd/'));
    const leaked = baselineGraph.filter(id => id.includes('/node_modules/@nelmad/calendar/'));
    const count = (build, type) => build.chunks.filter(chunk => chunk.type === type).length;
    return [
        check(`both builds use target ${gatedTarget}`, [baseline, calendar].every(build => build.resolved?.target === gatedTarget),
            `baseline ${JSON.stringify(baseline.resolved?.target)}, calendar ${JSON.stringify(calendar.resolved?.target)}`),
        check('calendar build has JS and CSS chunks', count(calendar, 'js') > 0 && count(calendar, 'css') > 0, `${count(calendar, 'js')} JS, ${count(calendar, 'css')} CSS`),
        check('baseline build has a JS chunk', count(baseline, 'js') > 0, 'no JS chunk'),
        ...['v02/calendar/CalendarMonth.js', 'v02/calendar/DayAgendaBody.js', 'v02/calendar/SourceSelector.js', 'v02/calendar/overlays.js', 'v02/themes/classic.js', 'v02/themes/neutral.js']
            .map(path => check(`calendar build contains dist/${path}`, calendarIncluded.some(id => id.endsWith(`/node_modules/@nelmad/calendar/dist/${path}`)), 'not in the rendered modules')),
        check('baseline build has no @nelmad/calendar module', leaked.length === 0, leaked.join(', ')),
        check('Day.js is absent from the calendar graph', dayjs.length === 0, dayjs.join(', ')),
        check('Day.js is absent from the calendar output', !/dayjs/i.test(code), 'a calendar chunk names dayjs'),
        check('no calendar chunk contains the development-warning prefix', !code.includes('[@nelmad/calendar]'), 'a calendar chunk contains [@nelmad/calendar]'),
        // Decision Q7: move never uses React Aria drag and drop (about 22 KiB).
        check('no React Aria drag and drop module in the calendar chunks', dnd.length === 0, dnd.join(', ')),
    ];
}

/**
 * The outcome of one measurement (decision Q1). A failed assertion exits 1 in both modes. Over budget, a candidate budget
 * only reports: exit 0, `overBudget` and a warning annotation; with `enforce` the excess exits 1.
 */
export function verdict({budget, delta, assertions}) {
    const overBudget = {js: delta.js > budget.jsGzipBytes, css: delta.css > budget.cssGzipBytes};
    const annotations = [];
    for (const [kind, label, limit] of [['js', 'JS', budget.jsGzipBytes], ['css', 'CSS', budget.cssGzipBytes]]) {
        if (overBudget[kind]) annotations.push(`::${budget.enforce ? 'error' : 'warning'} title=Bundle size::${label} delta ${delta[kind]} B exceeds ${budget.status} ${limit} B by ${delta[kind] - limit} B (${kib(delta[kind] - limit)})`);
    }
    const failed = assertions.filter(assertion => !assertion.pass);
    for (const assertion of failed) annotations.push(`::error title=Bundle size::${assertion.name}: ${assertion.detail}`);
    const exitCode = failed.length || (budget.enforce && (overBudget.js || overBudget.css)) ? 1 : 0;
    return {exitCode, overBudget, annotations};
}

/** Vite of the installed fixture, so its lock (not the repository's) decides Vite, Rollup and esbuild. */
async function fixtureVite(directory) {
    const base = join(directory, 'node_modules/vite'), entry = JSON.parse(readFileSync(join(base, 'package.json'), 'utf8')).exports['.'].import;
    return import(pathToFileURL(join(base, typeof entry === 'string' ? entry : entry.default)).href);
}

/** One production build of an entry with the fixture config; `build` overrides only the diagnostics. */
async function measure(vite, directory, entry, {build = {}, output, logLevel = 'warn'} = {}) {
    let resolved, graph = [];
    const result = await vite.build({
        root: directory, configFile: join(directory, 'vite.config.mjs'), logLevel,
        plugins: [{name: 'bundle-size-graph', configResolved(config) { resolved = config.build; }, buildEnd() { graph = [...this.getModuleIds()]; }}],
        build: {...build, write: false, rollupOptions: {input: join(directory, `${entry}.html`), ...(output ? {output} : {})}},
    });
    const files = (Array.isArray(result) ? result : [result]).flatMap(bundle => bundle.output);
    const chunks = files.filter(file => /\.(?:js|css)$/.test(file.fileName)).map(file => {
        const bytes = Buffer.from(file.type === 'chunk' ? file.code : file.source);
        return {file: file.fileName, type: file.fileName.endsWith('.css') ? 'css' : 'js', bytes: bytes.length, gzip: gzip(bytes), name: file.name, text: bytes.toString('utf8'), modules: file.modules ?? {}};
    }).sort((a, b) => a.file.localeCompare(b.file));
    const total = type => chunks.filter(chunk => chunk.type === type).reduce((sum, chunk) => sum + chunk.gzip, 0);
    return {resolved, graph, included: chunks.flatMap(chunk => Object.keys(chunk.modules)), chunks, js: total('js'), css: total('css')};
}
const listed = build => build.chunks.map(({file, type, bytes, gzip}) => ({file, type, bytes, gzip}));

/** The package of a module id; our own code is split by its directory in dist. */
function groupOf(id) {
    const path = posix(id), at = path.lastIndexOf('/node_modules/');
    if (path.startsWith('\0')) return '(virtual)';
    if (at < 0) return '(fixture)';
    const parts = path.slice(at + '/node_modules/'.length).split('/'), name = parts[0].startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
    if (name !== '@nelmad/calendar') return name;
    const directory = dirname(parts.slice(3).join('/'));
    return directory === '.' ? name : `${name}/${directory}`;
}

/**
 * Diagnostic breakdown, not the gated number: a build with one chunk per package (and per directory of our dist), each
 * gzipped alone, and our own modules minified and gzipped alone. Neither adds up to the single-chunk delta.
 */
async function breakdown(vite, directory, calendar) {
    const names = new Map();
    // The split itself creates circular and empty chunks; their warnings say nothing about the package.
    const split = await measure(vite, directory, 'calendar', {logLevel: 'error', output: {manualChunks(id) {
        const group = groupOf(id);
        if (group === '(fixture)') return undefined;
        const name = `size-${group.replace(/[^\w.-]+/g, '_')}`;
        names.set(name, group);
        return name;
    }}});
    const rendered = {};
    for (const chunk of calendar.chunks) for (const [id, module] of Object.entries(chunk.modules)) rendered[groupOf(id)] = (rendered[groupOf(id)] ?? 0) + module.renderedLength;
    const packages = split.chunks.filter(chunk => chunk.type === 'js').map(chunk => {
        const group = names.get(chunk.name) ?? '(fixture)';
        return {group, gzip: chunk.gzip, bytes: chunk.bytes, renderedLength: rendered[group] ?? 0, modules: Object.keys(chunk.modules).length};
    }).sort((a, b) => b.gzip - a.gzip);
    const modules = [];
    for (const chunk of calendar.chunks) {
        for (const [id, module] of Object.entries(chunk.modules)) {
            const path = posix(id), at = path.lastIndexOf('/node_modules/@nelmad/calendar/dist/');
            if (at < 0 || !module.code) continue;
            const {code} = await vite.transformWithEsbuild(module.code, path, {minify: true, target: calendar.resolved.target, loader: 'js'});
            modules.push({module: path.slice(at + '/node_modules/@nelmad/calendar/dist/'.length), gzip: gzip(Buffer.from(code)), renderedLength: module.renderedLength});
        }
    }
    modules.sort((a, b) => b.gzip - a.gzip);
    return {
        method: 'packages: one chunk per package (our dist per directory) in an otherwise identical calendar build, each gzipped alone; ownModules: the rendered code of each module minified and gzipped alone. Use for proportions only: neither list adds up to the delta.',
        packages, packagesGzipSum: packages.reduce((sum, entry) => sum + entry.gzip, 0), ownModules: modules,
    };
}

function print(report) {
    const {toolchain, build, sizes, budget, diagnostics, assertions} = report;
    console.log(`\nBundle size of the full Calendar (target ${JSON.stringify(build.target)}, gzip level ${gzipLevel}; Node ${toolchain.node}, zlib ${toolchain.zlib}, ${toolchain.platform}-${toolchain.arch}; Vite ${toolchain.vite}, Rollup ${toolchain.rollup}, esbuild ${toolchain.esbuild})`);
    for (const [kind, label, limit] of [['js', 'JS ', budget.jsGzipBytes], ['css', 'CSS', budget.cssGzipBytes]]) {
        const delta = sizes.delta[kind].bytes, state = delta > limit ? `over by ${delta - limit} B = ${kib(delta - limit)}` : `${limit - delta} B = ${kib(limit - delta)} under`;
        console.log(`  ${label}: baseline ${sizes.baseline[kind].bytes} B, calendar ${sizes.calendar[kind].bytes} B, delta ${delta} B = ${kib(delta)}; ${budget.status} ${limit} B: ${state}`);
    }
    const defaults = diagnostics.defaultTarget;
    console.log(`  Diagnostic: JS delta at the Vite default target ${JSON.stringify(defaults.target)}: ${defaults.js.bytes} B = ${kib(defaults.js.bytes)} (CSS ${defaults.css.bytes} B)`);
    console.log(`\nBy package (diagnostic, each gzipped alone; the sum ${diagnostics.breakdown.packagesGzipSum} B overstates the delta):`);
    for (const entry of diagnostics.breakdown.packages) console.log(`  ${String(entry.gzip).padStart(7)} B  ${entry.group}`);
    console.log('\nLargest own modules (diagnostic, each minified and gzipped alone):');
    for (const entry of diagnostics.breakdown.ownModules.slice(0, 10)) console.log(`  ${String(entry.gzip).padStart(7)} B  ${entry.module}`);
    console.log('\nBuild assertions:');
    for (const assertion of assertions) console.log(`  ${assertion.pass ? 'PASS' : 'FAIL'}: ${assertion.name}${assertion.pass ? '' : ` (${assertion.detail})`}`);
}

async function main() {
    // The manifest and logs go to --output=<dir> (CI: under $RUNNER_TEMP, uploaded as an artifact) or a fresh temporary
    // directory. The only write into the repository is the fixture lock of --refresh-locks.
    const output = resolve(process.argv.find(arg => arg.startsWith('--output='))?.slice(9) ?? mkdtempSync(join(tmpdir(), 'calendar-bundle-size-')));
    const refresh = process.argv.includes('--refresh-locks');
    const temporary = realpathSync(mkdtempSync(join(tmpdir(), 'calendar-bundle-size-run-')));
    mkdirSync(output, {recursive: true});
    const report = {startedAt: new Date().toISOString(), protocol: 'https://github.com/Nelmad/calendar/issues/12', outcome: 'running', temporary, checks: []};
    const {save, record, run} = createRecorder(output, report);
    try {
        // An inherited NODE_ENV changes the measurement: Vite keeps it (development measures a development build), and
        // `npm ci` under production omits devDependencies, the fixture's Vite among them.
        if (process.env.NODE_ENV !== undefined) throw new Error(`NODE_ENV=${process.env.NODE_ENV}: the measurement needs a clean install and Vite's production default; unset NODE_ENV`);
        report.budget = readBudget(readFileSync(join(fixture, 'budget.json'), 'utf8'));
        report.git = {sha: run('git-sha', 'git', ['rev-parse', 'HEAD']).trim(), dirty: run('git-status', 'git', ['status', '--porcelain']).trim() !== ''};
        const {pack, details} = packCandidate({run, record, temporary, output, tarball: tarballArgument()});
        report.package = details;
        const {directory, versions} = prepareConsumer({kind: 'bundle-fixture', source: fixture, temporary, pack, run, record, output, refresh});
        report.fixture = {refreshedLock: refresh, lockSha256: hash(readFileSync(join(fixture, 'package-lock.json'))),
            sourceHashes: Object.fromEntries(walk(fixture).map(path => [`${posix(relative(root, fixture))}/${path}`, hash(readFileSync(join(fixture, path)))]))};
        const vite = await fixtureVite(directory);
        report.toolchain = {node: process.version, zlib: process.versions.zlib, platform: process.platform, arch: process.arch,
            vite: vite.version, rollup: vite.rollupVersion, esbuild: vite.esbuildVersion, react: versions.react, reactDOM: versions.reactDOM, gzip: `node:zlib gzipSync level ${gzipLevel}`};
        const baseline = await measure(vite, directory, 'baseline'), calendar = await measure(vite, directory, 'calendar');
        const {target, minify, cssMinify, sourcemap, modulePreload, rollupOptions} = calendar.resolved;
        report.build = {target, minify, cssMinify, sourcemap, modulePreload, external: String(rollupOptions.external)};
        report.assertions = buildAssertions({baseline, calendar});
        const delta = {js: calendar.js - baseline.js, css: calendar.css - baseline.css};
        const result = verdict({budget: report.budget, delta, assertions: report.assertions});
        report.sizes = {
            baseline: {js: size(baseline.js), css: size(baseline.css)}, calendar: {js: size(calendar.js), css: size(calendar.css)},
            delta: {js: {...size(delta.js), overBudget: result.overBudget.js}, css: {...size(delta.css), overBudget: result.overBudget.css}},
        };
        report.chunks = {baseline: listed(baseline), calendar: listed(calendar)};
        save();
        // Decision Q2a: the JS delta at the Vite 6 default target is recorded for comparison, never gated.
        const defaults = {target: 'modules'}, defaultBaseline = await measure(vite, directory, 'baseline', {build: defaults}), defaultCalendar = await measure(vite, directory, 'calendar', {build: defaults});
        report.diagnostics = {
            defaultTarget: {target: defaultCalendar.resolved.target, js: size(defaultCalendar.js - defaultBaseline.js), css: size(defaultCalendar.css - defaultBaseline.css)},
            graph: {calendarLoadedModules: calendar.graph.length, calendarRenderedModules: calendar.included.length},
            breakdown: await breakdown(vite, directory, calendar),
        };
        report.verdict = result;
        report.outcome = result.exitCode ? 'fail' : 'pass';
        report.finishedAt = new Date().toISOString();
        save();
        print(report);
        for (const annotation of result.annotations) console.log(annotation);
        console.log(`\nManifest: ${join(output, 'manifest.json')}`);
        process.exitCode = result.exitCode;
    } catch (error) {
        report.outcome = 'error';
        report.error = String(error?.stack ?? error);
        console.error(error);
        console.log(`::error title=Bundle size::Measurement error: ${String(error?.message ?? error).split('\n')[0]}`);
        process.exitCode = 1;
        save();
    }
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
