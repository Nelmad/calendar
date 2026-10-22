import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';

// Run in the checkout being measured; output may be outside that checkout (default: a fresh temporary directory).
const output = resolve(process.argv[2] ?? mkdtempSync(join(tmpdir(), 'calendar-baseline-')));
const reason = process.argv.find(arg => arg.startsWith('--reason='))?.slice(9);
const only = process.argv.find(arg => arg.startsWith('--only='))?.slice(7);
mkdirSync(output, {recursive: true});
const digest = path => createHash('sha256').update(readFileSync(path)).digest('hex');
const inspect = (command, args) => {
    const result = spawnSync(command, args, {encoding: 'utf8'});
    return (result.stdout || result.stderr).trim();
};
const manifestPath = resolve(output, 'manifest.json');
const previous = only && existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : null;
const manifest = previous ?? {
    schemaVersion: 1,
    purpose: 'Diagnostic 0.1 baseline, not 0.2 release evidence',
    startedAt: new Date().toISOString(),
    checkout: process.cwd(),
    gitSha: process.env.BASELINE_SOURCE_GIT_SHA ?? inspect('git', ['rev-parse', 'HEAD']),
    gitStatus: process.env.BASELINE_SOURCE_GIT_SHA ? null : inspect('git', ['status', '--short']),
    node: process.version,
    npm: inspect('npm', ['--version']),
    platform: process.platform,
    architecture: process.arch,
    runtimeVersions: process.versions,
    packageSha256: digest('package.json'),
    lockSha256: digest('package-lock.json'),
    checks: [],
};
const commands = [
    ['installation', ['ls', '--depth=0', '--json']],
    ['typecheck', ['run', 'typecheck']],
    ['typecheck-storybook', ['run', 'typecheck:storybook']],
    ['lint', ['run', 'lint']],
    ['test', ['test', '--', '--reporter=dot']],
    ['build', ['run', 'build']],
    ['build-storybook', ['run', 'build-storybook', '--', '--disable-telemetry']],
];
if (only && !commands.some(([name]) => name === only)) throw new Error(`Unknown check: ${only}`);
if (previous?.checks.some(check => check.name === only) && !reason) throw new Error('A repeated check requires --reason=<explanation>');
for (const [name, args] of commands) {
    if (only && only !== name) continue;
    const startedAt = new Date().toISOString();
    const start = performance.now();
    const result = spawnSync('npm', args, {
        encoding: 'utf8', timeout: 180_000, maxBuffer: 16 * 1024 * 1024,
        env: {...process.env, CI: '1', STORYBOOK_DISABLE_TELEMETRY: '1', DO_NOT_TRACK: '1'},
    });
    const prior = manifest.checks.find(check => check.name === name);
    const report = prior ? `${name}-retry-${(prior.previousAttempts?.length ?? 0) + 1}.txt` : `${name}.txt`;
    writeFileSync(resolve(output, report), [
        `$ npm ${args.join(' ')}`, result.stdout, result.stderr,
        result.error ? String(result.error) : '',
    ].filter(Boolean).join('\n'));
    const check = {
        name, command: ['npm', ...args], startedAt,
        durationMs: Math.round(performance.now() - start),
        exitCode: result.status, signal: result.signal, report,
        outcome: result.status === 0 ? 'pass' : 'fail',
    };
    if (prior) {
        check.previousAttempts = [...(prior.previousAttempts ?? []), {...prior, previousAttempts: undefined}];
        check.rerunReason = reason;
        manifest.checks[manifest.checks.indexOf(prior)] = check;
    } else manifest.checks.push(check);
    writeFileSync(resolve(output, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
    console.log(`${name}: ${result.status === 0 ? 'PASS' : 'FAIL'} (${result.status ?? result.signal})`);
}
manifest.finishedAt = new Date().toISOString();
writeFileSync(resolve(output, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Diagnostic evidence: ${output}`);
