import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {copyFileSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';

const sha = value => createHash('sha256').update(value).digest('hex');
// Reports go to `--output=<dir>` (reference/ and public/ per compiler version). A routine run without it
// writes to a fresh temporary directory: run reports are never written into the repository (process change 2026-10-22).
const outputArgument = process.argv.find(argument => argument.startsWith('--output='))?.slice('--output='.length);
const reports = resolve(outputArgument || mkdtempSync(join(tmpdir(), 'calendar-contracts-')));
const source = readFileSync('docs/specification-0.2.md', 'utf8');
const canonical = source.match(/### 5\.7\.[\s\S]*?```ts\n([\s\S]*?)\n```/)[1];
const declarationPath = 'src/v02/reference.d.ts';
const expected = '// Generated from specification-0.2.md §5.7. Private reference; not a package entry.\n' + canonical + '\n';
if (process.argv.includes('--write')) {
    mkdirSync('src/v02', {recursive: true});
    writeFileSync(declarationPath, expected);
}
assert.equal(readFileSync(declarationPath, 'utf8'), expected, 'Private reference differs from normative §5.7');
assert.ok(!/(?:dayjs|@internationalized\/date|react-aria)/.test(canonical), 'Internal dependency in public reference');
const compiler = resolve(process.env.CALENDAR_TYPESCRIPT_COMPILER ?? 'node_modules/typescript/lib/tsc.js');
const invoke = args => spawnSync(process.execPath, [compiler, ...args], {encoding: 'utf8'});
const version = invoke(['--version']);
assert.equal(version.status, 0, version.stderr);
const checks = ['bundler', 'nodenext'].map(mode => {
    const config = `tests/contracts/0.2/tsconfig.${mode}.json`;
    const result = invoke(['-p', config]);
    return {mode, config, exitCode: result.status, outcome: result.status === 0 ? 'pass' : 'fail', output: result.stdout + result.stderr};
});
const output = join(reports, 'reference');
mkdirSync(output, {recursive: true});
const report = {
    date: new Date().toISOString(), node: process.version, compiler: version.stdout.trim(),
    specificationSha256: sha(source), declarationSha256: sha(expected),
    fixtureHashes: Object.fromEntries(['positive.ts', 'negative.ts', 'messages.ts', 'tsconfig.bundler.json', 'tsconfig.nodenext.json'].map(name => [name, sha(readFileSync(`tests/contracts/0.2/${name}`))])),
    scope: 'Normative full 0.2 reference and internal T08 message typing. Public alpha.1 declarations are checked separately by packed-consumers.mjs; release min/latest matrix remains T27.',
    checks,
};
writeFileSync(`${output}/typescript-${version.stdout.trim().split(' ')[1]}.json`, JSON.stringify(report, null, 2) + '\n');
checks.forEach(check => console.log(`${version.stdout.trim()} ${check.mode}: ${check.outcome}\n${check.output}`));

// Public prerelease declarations (T14): emitted from the current source with the project
// compiler, never from a possibly stale dist, then checked by the selected compiler. The
// fixtures import '@nelmad/calendar' exactly like a consumer; packed-consumers.mjs reuses them.
const fixtures = ['positive.ts', 'negative.ts', 'tsconfig.bundler.json', 'tsconfig.nodenext.json'];
const temporary = realpathSync(mkdtempSync(join(tmpdir(), 'calendar-public-types-'))), types = join(temporary, 'types');
const publicChecks = [];
try {
    const emitted = spawnSync(process.execPath, [resolve('node_modules/typescript/lib/tsc.js'), '-p', 'tsconfig.build.json', '--declaration', '--emitDeclarationOnly', '--outDir', types], {encoding: 'utf8'});
    assert.equal(emitted.status, 0, `Declaration emit failed:\n${emitted.stdout}${emitted.stderr}`);
    // tsc never copies authored .d.ts inputs; the reference is part of the declaration graph.
    copyFileSync(declarationPath, join(types, 'v02/reference.d.ts'));
    writeFileSync(join(types, 'package.json'), JSON.stringify({type: 'module'}) + '\n');
    // Bare imports in the emitted tree (react, date runtime types) resolve to the project dependencies.
    symlinkSync(resolve('node_modules'), join(temporary, 'node_modules'), 'dir');
    for (const mode of ['bundler', 'nodenext']) {
        const config = join(temporary, `tsconfig.${mode}.json`);
        writeFileSync(config, JSON.stringify({extends: resolve(`tests/contracts/public/tsconfig.${mode}.json`), compilerOptions: {paths: {'@nelmad/calendar': [join(types, 'index.d.ts')]}}}, null, 2));
        const result = invoke(['-p', config]);
        publicChecks.push({mode, config: `tests/contracts/public/tsconfig.${mode}.json`, declarations: 'emitted from src/index.ts', exitCode: result.status,
            outcome: result.status === 0 ? 'pass' : 'fail', output: result.stdout + result.stderr});
    }
} finally { rmSync(temporary, {recursive: true, force: true}); }
const packageVersion = JSON.parse(readFileSync('package.json', 'utf8')).version;
const publicOutput = join(reports, 'public');
mkdirSync(publicOutput, {recursive: true});
writeFileSync(`${publicOutput}/typescript-${version.stdout.trim().split(' ')[1]}.json`, JSON.stringify({
    date: new Date().toISOString(), node: process.version, compiler: version.stdout.trim(), declarationSha256: sha(expected),
    sourceHashes: Object.fromEntries(['src/index.ts', 'src/Calendar.tsx', 'src/v02/public.ts', 'src/v02/surface.ts'].map(path => [path, sha(readFileSync(path))])),
    fixtureHashes: Object.fromEntries(fixtures.map(name => [name, sha(readFileSync(`tests/contracts/public/${name}`))])),
    scope: `Public ${packageVersion} surface gate declarations, strict + exactOptionalPropertyTypes + skipLibCheck=false. The CommonJS fixture (consumers/shared/require.cts) runs only against the packed declarations in packed-consumers.mjs.`,
    checks: publicChecks,
}, null, 2) + '\n');
publicChecks.forEach(check => console.log(`${version.stdout.trim()} public ${check.mode}: ${check.outcome}\n${check.output}`));
console.log(`Reports: ${reports}`);
if ([...checks, ...publicChecks].some(check => check.outcome !== 'pass')) process.exitCode = 1;
