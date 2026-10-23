import assert from 'node:assert/strict';
import {spawn, spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {cpSync, existsSync, readFileSync, readdirSync, realpathSync, writeFileSync} from 'node:fs';
import {createServer} from 'node:net';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {checkoutDifferences, readArchive} from '../release/release-metadata.mjs';

// Shared packed-candidate logic: one build and `npm pack`, isolated copies of the documented
// examples with harness-only overlays, the saved consumer lockfiles and local SSR servers.
export const root = resolve(import.meta.dirname, '../..'), examples = join(root, 'examples');
export const local = /(?:^|\/)(?:node_modules|dist|dist-server|dist-acceptance|\.next)(?:\/|$)|next-env\.d\.ts$|\.tsbuildinfo$/;
export const walk = (base, prefix = '') => readdirSync(join(base, prefix), {withFileTypes: true}).flatMap(entry => {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    return local.test(path) ? [] : entry.isDirectory() ? walk(base, path) : [path];
});
export const hash = bytes => createHash('sha256').update(bytes).digest('hex');
// The npm cache lives in the platform temporary directory (review 2026-10-09-2): the Linux CI runner has no /private.
export const npmCache = process.env.CALENDAR_NPM_CACHE ?? join(tmpdir(), 'calendar-npm-cache');
export const env = {...process.env, CI: '1', NEXT_TELEMETRY_DISABLED: '1', DO_NOT_TRACK: '1', npm_config_cache: npmCache};
/** A filtered run is a development run: it records its filter and never reports a passing outcome (review 2026-10-09-2). */

/**
 * The --only filter of the harness runners: '|'-separated literal parts, a check runs when its name contains one of them.
 * A literal match keeps command-line text out of RegExp construction.
 */
export function nameFilter(value) {
    if (!value) return null;
    const parts = value.split('|').filter(Boolean);
    return {source: value, test: name => parts.some(part => name.includes(part))};
}

export const runOutcome = ({failures, filter}) => failures.length ? 'fail' : filter ? 'partial' : 'pass';
/** Resolves when nothing listens on 127.0.0.1:`port`; a stale server from an interrupted run is rejected, never served. */
export function assertPortFree(port) {
    return new Promise((resolve, reject) => {
        const probe = createServer().once('error', error => reject(new Error(`Port ${port} is already in use (${error.code}): stop the stale server first`)));
        probe.listen(port, '127.0.0.1', () => probe.close(() => resolve()));
    });
}

/** Manifest writer: every command log is kept next to the manifest, failures included. */
export function createRecorder(output, report) {
    const save = () => writeFileSync(join(output, 'manifest.json'), JSON.stringify(report, null, 2) + '\n');
    const record = (name, details = {}) => {report.checks.push({name, outcome: 'pass', ...details}); save(); console.log(`PASS: ${name}`);};
    function run(name, command, args, cwd = root, extra = {}) {
        const result = spawnSync(command, args, {cwd, env: {...env, ...extra}, encoding: 'utf8', timeout: 300_000, maxBuffer: 32 * 1024 * 1024});
        const log = `${name}.txt`;
        writeFileSync(join(output, log), [result.stdout, result.stderr, result.error?.message].filter(Boolean).join('\n'));
        assert.equal(result.status, 0, `${name} failed (see ${join(output, log)}):\n${(result.stdout + result.stderr).slice(-5000)}`);
        record(name, {log}); return result.stdout;
    }
    return {save, record, run};
}

/** `--tarball=<tgz>` of a harness command line: the archive to test instead of building and packing the checkout. */
export const tarballArgument = (argv = process.argv) => argv.find(arg => arg.startsWith('--tarball='))?.slice('--tarball='.length) || undefined;

/**
 * The candidate archive. Without `tarball` it builds and packs the checkout once and keeps the archive next to the run
 * report. With `tarball` (PV9-1-01/02: CI packs once and passes that file to every harness) it
 * neither builds nor packs: it reads that archive and first requires it to be byte-identical to the checkout's build
 * output, so the source hashes of the report describe the archive under test.
 */
export function packCandidate({run, record, temporary, output, tarball}) {
    if (tarball) {
        const path = resolve(tarball), pack = readArchive(path);
        assert.equal(pack.name, '@nelmad/calendar', `${pack.filename} packs ${pack.name}`);
        const differences = checkoutDifferences(path);
        assert.deepEqual(differences, [], `${pack.filename} differs from the checkout; build and pack the same checkout`);
        const bytes = readFileSync(path);
        writeFileSync(join(temporary, pack.filename), bytes); writeFileSync(join(temporary, 'calendar.tgz'), bytes);
        record?.('given-archive', {path, integrity: pack.integrity, sha256: pack.sha256, files: pack.files.length, matchesCheckout: true});
        return {pack, tarball: bytes, details: {version: pack.version, filename: pack.filename, integrity: pack.integrity, sha256: pack.sha256, files: pack.files, source: path}};
    }
    run('library-build', 'npm', ['run', 'build']);
    const pack = JSON.parse(run('pack', 'npm', ['pack', '--json', '--pack-destination', temporary]))[0];
    const bytes = readFileSync(join(temporary, pack.filename));
    writeFileSync(join(temporary, 'calendar.tgz'), bytes);
    writeFileSync(join(output, pack.filename), bytes);
    return {pack, tarball: bytes, details: {version: pack.version, filename: pack.filename, integrity: pack.integrity, sha256: hash(bytes), files: pack.files.map(file => file.path), source: 'npm pack of the checkout'}};
}

/** Copies examples/<kind> outside the checkout, applies overlays and installs the packed archive. */
export function prepareConsumer({kind, temporary, pack, run, record, output, overlays = [], refresh = false}) {
    const manifest = JSON.parse(readFileSync(join(root, 'package.json')));
    const directory = join(temporary, kind);
    cpSync(join(examples, kind), directory, {recursive: true, filter: source => !local.test(source.slice(join(examples, kind).length))});
    for (const overlay of overlays) if (existsSync(overlay)) cpSync(overlay, directory, {recursive: true});
    const lockPath = join(directory, 'package-lock.json');
    if (refresh && existsSync(lockPath)) {
        const lock = JSON.parse(readFileSync(lockPath));
        // Same-version local archives can change during development. Retain
        // the consumer graph but force npm to read this SDK archive afresh.
        delete lock.packages['node_modules/@nelmad/calendar'];
        writeFileSync(lockPath, JSON.stringify(lock, null, 2) + '\n');
    }
    if (!refresh) {
        assert.ok(existsSync(lockPath), 'First qualify and save fixture locks with --refresh-locks');
        const lock = JSON.parse(readFileSync(lockPath)), sdk = lock.packages['node_modules/@nelmad/calendar'];
        assert.deepEqual(sdk.dependencies, manifest.dependencies, 'SDK dependency change requires --refresh-locks');
        Object.assign(sdk, {version: manifest.version, integrity: pack.integrity, resolved: 'file:../calendar.tgz'});
        writeFileSync(lockPath, JSON.stringify(lock, null, 2) + '\n');
    }
    run(`${kind}-install`, 'npm', [refresh ? 'install' : 'ci', '--no-audit', '--no-fund', ...(process.env.CALENDAR_OFFLINE === '1' ? ['--offline'] : [])], directory);
    if (refresh) cpSync(lockPath, join(examples, kind, 'package-lock.json'));
    cpSync(lockPath, join(output, `${kind}-lock.json`));
    const installed = JSON.parse(readFileSync(lockPath));
    assert.equal(installed.packages['node_modules/@nelmad/calendar'].integrity, pack.integrity);
    assert.ok(!Object.keys(installed.packages).some(name => /(?:^|\/)dayjs(?:\/|$)/.test(name)));
    assert.equal(realpathSync(join(directory, 'node_modules/@nelmad/calendar')), join(directory, 'node_modules/@nelmad/calendar'));
    const sdk = JSON.parse(readFileSync(join(directory, 'node_modules/@nelmad/calendar/package.json')));
    assert.deepEqual(sdk.dependencies, manifest.dependencies);
    run(`${kind}-dependency-tree`, 'npm', ['ls', '--omit=dev', '--all', '--json'], directory);
    singleInstances({kind, directory, run, record, manifest});
    const versions = {react: installed.packages['node_modules/react'].version, reactDOM: installed.packages['node_modules/react-dom'].version,
        ...(kind === 'next' ? {next: installed.packages['node_modules/next'].version} : {vite: installed.packages['node_modules/vite'].version})};
    record(`${kind}-isolated-install`, {...versions, integrity: pack.integrity});
    return {directory, versions};
}

/**
 * QA-05: the installed graph has exactly one react-stately (the version the SDK, react-aria and react-aria-components pin)
 * and one @internationalized/date, and no separate @react-stately/flags. React Aria reads the Shadow DOM flag from that
 * single react-stately, so the flag the SDK enables is the one it reads. `npm ls` keeps the human-readable tree.
 */
export function singleInstances({kind, directory, run, record, manifest}) {
    const lock = JSON.parse(readFileSync(join(directory, 'package-lock.json')));
    const copies = name => Object.entries(lock.packages).filter(([path]) => path === `node_modules/${name}` || path.endsWith(`/node_modules/${name}`)).map(([path, entry]) => `${path}@${entry.version}`);
    const stately = copies('react-stately'), date = copies('@internationalized/date');
    assert.deepEqual(stately, [`node_modules/react-stately@${manifest.dependencies['react-stately']}`], `${kind}: one react-stately`);
    assert.deepEqual(date, [`node_modules/@internationalized/date@${manifest.dependencies['@internationalized/date']}`], `${kind}: one @internationalized/date`);
    assert.deepEqual(copies('@react-stately/flags'), [], `${kind}: no separate @react-stately/flags`);
    const tree = run(`${kind}-npm-ls-react-stately`, 'npm', ['ls', 'react-stately', '@internationalized/date', '--all'], directory);
    assert.equal(new Set(tree.match(/react-stately@[\w.-]+/g)).size, 1, `${kind}: npm ls shows one react-stately version`);
    record(`${kind}-single-react-stately`, {reactStately: stately, internationalizedDate: date});
}

/** Local production servers; logs are written when each process exits. */
export function createServers(output) {
    const children = [];
    async function serve(kind, directory, port, {name = kind, args, extra = {}, path = '/'} = {}) {
        // Only the spawned child may answer: a listener already on the port would be accepted as the candidate.
        await assertPortFree(port);
        const log = [];
        const child = spawn(process.execPath, args ?? (kind === 'vite' ? ['server.mjs'] : ['node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', String(port)]),
            {cwd: directory, env: {...env, PORT: String(port), ...extra}, stdio: ['ignore', 'pipe', 'pipe']});
        children.push(child); child.stdout.on('data', data => log.push(data.toString())); child.stderr.on('data', data => log.push(data.toString()));
        child.on('exit', () => writeFileSync(join(output, `${name}-server.txt`), log.join('')));
        for (let i = 0; i < 300; i++) {
            if (child.exitCode !== null) throw new Error(`${name} exited: ${log.join('')}`);
            try {
                const response = await fetch(`http://127.0.0.1:${port}${path}`), text = response.ok ? await response.text() : null;
                // The response counts only while the spawned child is still running.
                if (text !== null && child.exitCode === null) return text;
            } catch { /* Await local listener. */ }
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        throw new Error(`${name} server did not become ready`);
    }
    const stop = async () => {
        await Promise.all(children.filter(child => child.exitCode === null).map(child => new Promise(resolve => { child.once('exit', resolve); child.kill('SIGTERM'); })));
        children.length = 0;
    };
    return {serve, stop};
}
