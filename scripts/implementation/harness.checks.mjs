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
    assert.doesNotMatch(readFileSync(join(root, 'scripts/implementation/packed-harness.mjs'), 'utf8'), /['"]\/private\//);
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
    assert.match(job, /if: always\(\)\n {8}with:\n {10}name: packed-consumers\n {10}path: \$\{\{ runner\.temp \}\}\/packed-consumers/);
    assert.match(probes, /if: always\(\)\n {8}with:\n {10}name: browser-probes\n {10}path: \$\{\{ runner\.temp \}\}\/browser-probes/);
    assert.doesNotMatch(workflow, /docs\/implementation\/evidence/);
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
