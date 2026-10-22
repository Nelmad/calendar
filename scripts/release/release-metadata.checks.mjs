import assert from 'node:assert/strict';
import {execFileSync, spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdirSync, mkdtempSync, readFileSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {test} from 'node:test';
import {changelogSection, checkRepository, checkoutDifferences, distTag, gateManifest, milestone, readArchive, readGateLog, releaseGates, releaseMetadata, tagVersion} from './release-metadata.mjs';

// Release workflow self-checks (process change 2026-10-22): `node --test scripts/release/release-metadata.checks.mjs`.
const root = resolve(import.meta.dirname, '../..');
const repository = {type: 'git', url: 'https://github.com/Nelmad/calendar.git'};
const changelog = '# Changelog\n\n## [0.2.0-beta.1] - 2026-11-20\n\n### Added\n\n- Selection.\n\n## [0.2.0-alpha.2] - Unreleased\n\n- Responsive layout.\n\n## [0.1.0] - 2026-06-10\n\n- First.\n';
function archive(manifest) {
    const directory = mkdtempSync(join(tmpdir(), 'calendar-release-check-'));
    mkdirSync(join(directory, 'package'));
    writeFileSync(join(directory, 'package/package.json'), JSON.stringify(manifest));
    execFileSync('tar', ['-czf', join(directory, 'archive.tgz'), '-C', directory, 'package']);
    return join(directory, 'archive.tgz');
}

test('the dist-tag follows the prerelease id; anything else is refused', () => {
    assert.equal(distTag('0.2.0'), 'latest');
    assert.equal(distTag('0.2.0-alpha.2'), 'alpha');
    assert.equal(distTag('0.2.0-beta.1'), 'beta');
    assert.equal(distTag('0.2.0-rc.3'), 'rc');
    for (const version of ['0.2.0-next.1', '0.2.0-alpha', '0.2.0-rc.01', '0.2.0-alpha.1.2', 'v0.2.0', '0.2', '']) assert.throws(() => distTag(version), version);
});

test('a release tag is v<version>', () => {
    assert.equal(tagVersion('v0.2.0-alpha.2'), '0.2.0-alpha.2');
    for (const tag of ['0.2.0', 'v0.2', 'release-0.2.0', undefined]) assert.throws(() => tagVersion(tag));
});

test('release notes are the CHANGELOG section of the version; a release needs its date', () => {
    assert.equal(changelogSection(changelog, '0.2.0-beta.1', {dated: true}), '### Added\n\n- Selection.\n');
    assert.equal(changelogSection(changelog, '0.1.0', {dated: true}), '- First.\n');
    assert.equal(changelogSection(changelog, '0.2.0-alpha.2'), '- Responsive layout.\n');
    assert.throws(() => changelogSection(changelog, '0.2.0-alpha.2', {dated: true}), /release date/);
    assert.throws(() => changelogSection(changelog, '0.2.0'), /no ## \[0\.2\.0\] section/);
    assert.throws(() => changelogSection('## [1.0.0] - 2026-01-01\n\n## [0.9.0] - 2025-01-01\n- x\n', '1.0.0'), /empty/);
    // The real CHANGELOG has a section for the version in package.json.
    const version = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;
    assert.ok(changelogSection(readFileSync(join(root, 'CHANGELOG.md'), 'utf8'), version).length > 0);
});

test('provenance needs repository.url to name the building repository, case included', () => {
    checkRepository({repository}, 'Nelmad/calendar');
    checkRepository({repository: 'https://github.com/Nelmad/calendar'}, undefined);
    assert.throws(() => checkRepository({}, 'Nelmad/calendar'), /repository\.url/);
    assert.throws(() => checkRepository({repository}, 'someone/fork'), /someone\/fork builds/);
    // PV9-1-03: the registry compares the provenance source repository as given; a case difference is refused here first.
    assert.throws(() => checkRepository({repository: 'https://github.com/nelmad/calendar.git'}, 'Nelmad/calendar'), /names nelmad\/calendar, but Nelmad\/calendar builds/);
    assert.throws(() => checkRepository({repository}, 'nelmad/calendar'), /case must match/);
    // The package names the canonical repository exactly as GitHub spells it (the release workflow passes GITHUB_REPOSITORY).
    checkRepository(JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')), 'Nelmad/calendar');
});

test('the milestone of a version is its prerelease id; it selects the acceptance of the release', () => {
    assert.equal(milestone('0.2.0-alpha.2'), 'alpha.2');
    assert.equal(milestone('0.2.0-beta.1'), 'beta.1');
    assert.equal(milestone('0.2.0'), 'stable');
    assert.throws(() => milestone('0.2.0-next.1'));
});

test('the metadata is read from the archive and checked against the tag', () => {
    const tarball = archive({name: '@nelmad/calendar', version: '0.2.0-beta.1', repository});
    const bytes = readFileSync(tarball), metadata = releaseMetadata({tarball, tag: 'v0.2.0-beta.1', changelog, repository: 'Nelmad/calendar'});
    assert.deepEqual({...metadata, notes: undefined}, {name: '@nelmad/calendar', version: '0.2.0-beta.1', distTag: 'beta', prerelease: true, milestone: 'beta.1', tarball: 'archive.tgz',
        sha256: createHash('sha256').update(bytes).digest('hex'), integrity: `sha512-${createHash('sha512').update(bytes).digest('base64')}`, notes: undefined});
    assert.throws(() => releaseMetadata({tarball, tag: 'v0.2.0-beta.2', changelog}), /does not match the archive version 0\.2\.0-beta\.1/);
    assert.throws(() => releaseMetadata({tarball: archive({name: 'calendar', version: '0.2.0-beta.1', repository}), changelog}), /not @nelmad\/calendar/);
    // A dry run without a tag accepts an undated section; a tag publishes only a dated one.
    const undated = archive({name: '@nelmad/calendar', version: '0.2.0-alpha.2', repository});
    assert.equal(releaseMetadata({tarball: undated, changelog}).distTag, 'alpha');
    assert.throws(() => releaseMetadata({tarball: undated, tag: 'v0.2.0-alpha.2', changelog}), /release date/);
});

// A checkout with dist and the archive packed from it (PV9-1-02).
function packedCheckout() {
    const checkout = mkdtempSync(join(tmpdir(), 'calendar-release-checkout-'));
    mkdirSync(join(checkout, 'dist/v02'), {recursive: true});
    writeFileSync(join(checkout, 'package.json'), JSON.stringify({name: '@nelmad/calendar', version: '0.2.0-alpha.2', repository}));
    writeFileSync(join(checkout, 'dist/index.js'), 'export {};\n');
    writeFileSync(join(checkout, 'dist/v02/core.js'), 'export const a = 1;\n');
    const staging = mkdtempSync(join(tmpdir(), 'calendar-release-staging-'));
    execFileSync('cp', ['-R', checkout, join(staging, 'package')]);
    execFileSync('tar', ['-czf', join(staging, 'archive.tgz'), '-C', staging, 'package/package.json', 'package/dist/index.js', 'package/dist/v02/core.js']);
    return {checkout, tarball: join(staging, 'archive.tgz')};
}

test('an archive is read without unpacking it into the checkout, and compared with the checkout byte by byte', () => {
    const {checkout, tarball} = packedCheckout(), bytes = readFileSync(tarball);
    assert.deepEqual(readArchive(tarball), {name: '@nelmad/calendar', version: '0.2.0-alpha.2', filename: 'archive.tgz',
        integrity: `sha512-${createHash('sha512').update(bytes).digest('base64')}`, sha256: createHash('sha256').update(bytes).digest('hex'),
        files: ['dist/index.js', 'dist/v02/core.js', 'package.json']});
    assert.deepEqual(checkoutDifferences(tarball, checkout), []);
    // A rebuild between the pack and a gate that reads dist, a stale extra dist file and a missing file are all differences.
    writeFileSync(join(checkout, 'dist/v02/core.js'), 'export const a = 2;\n');
    writeFileSync(join(checkout, 'dist/stale.js'), '');
    execFileSync('rm', [join(checkout, 'dist/index.js')]);
    assert.deepEqual(checkoutDifferences(tarball, checkout).sort((a, b) => a.path.localeCompare(b.path)), [
        {path: 'dist/index.js', reason: 'missing in the checkout'}, {path: 'dist/stale.js', reason: 'not in the archive'}, {path: 'dist/v02/core.js', reason: 'bytes differ'}]);
});

const passed = id => ({id, command: ['npm', 'run', id], environment: {}, outcome: 'pass', exitCode: 0});
const integrity = 'sha512-gated';
const reports = {'packed-consumers': {outcome: 'pass', package: {integrity}, versions: {chrome: '141'}},
    'milestone-acceptance': {outcome: 'pass', milestone: 'alpha.2', binding: {npmIntegrity: integrity}, versions: {axeCore: '4.14.0'}},
    'browser-probes': {outcome: 'pass', versions: {chrome: '141'}}};

test('the release manifest passes only with a passing record of every gate and reports bound to the archive', () => {
    const metadata = {integrity, milestone: 'alpha.2'}, gates = releaseGates.map(passed);
    const result = gateManifest({metadata, gates, reports});
    assert.equal(result.outcome, 'pass', result.problems.join('\n'));
    assert.deepEqual(result.gates.map(gate => [gate.id, gate.outcome]), releaseGates.map(id => [id, 'pass']));
    assert.deepEqual(result.runReports, {'packed-consumers': {chrome: '141'}, 'milestone-acceptance': {axeCore: '4.14.0'}, 'browser-probes': {chrome: '141'}});
    const fails = (change, pattern) => { const value = gateManifest({metadata, gates, reports, ...change(structuredClone({gates, reports}))}); assert.equal(value.outcome, 'fail'); assert.match(value.problems.join('\n'), pattern); };
    fails(({gates}) => ({gates: gates.filter(gate => gate.id !== 'milestone-acceptance')}), /milestone-acceptance: no record/);
    fails(({gates}) => ({gates: gates.map(gate => gate.id === 'browser-probes' ? {...gate, outcome: 'fail'} : gate)}), /browser-probes: fail/);
    fails(({gates}) => ({gates: [...gates, passed('lint')]}), /lint: recorded more than once/);
    fails(({gates}) => ({gates: [...gates, passed('smoke')]}), /smoke: not a release gate/);
    fails(({reports}) => ({reports: {...reports, 'packed-consumers': {...reports['packed-consumers'], package: {integrity: 'sha512-rebuilt'}}}}), /packed-consumers: run report is bound to sha512-rebuilt/);
    fails(({reports}) => ({reports: {...reports, 'milestone-acceptance': {...reports['milestone-acceptance'], milestone: 'alpha.1'}}}), /ran alpha\.1, the archive releases alpha\.2/);
    fails(({reports}) => ({reports: {...reports, 'milestone-acceptance': {...reports['milestone-acceptance'], outcome: 'partial'}}}), /outcome partial/);
    fails(({reports}) => { const {'browser-probes': _probes, ...rest} = reports; return {reports: rest}; }, /browser-probes: no run report/);
});

test('gate.mjs records the command, environment and outcome of a gate and keeps its exit code', () => {
    const directory = mkdtempSync(join(tmpdir(), 'calendar-gate-check-')), log = join(directory, 'gates.jsonl');
    const gate = (id, ...command) => spawnSync(process.execPath, [join(root, 'scripts/release/gate.mjs'), id, '--', ...command], {encoding: 'utf8', env: {...process.env, RELEASE_GATE_LOG: log, TZ: 'Africa/Monrovia'}});
    assert.equal(gate('lint', process.execPath, '-e', 'process.exit(0)').status, 0);
    assert.equal(gate('test', process.execPath, '-e', 'process.exit(3)').status, 1);
    assert.notEqual(gate('smoke', process.execPath, '-e', '').status, 0);
    const records = readGateLog(log);
    assert.deepEqual(records.map(record => [record.id, record.outcome, record.exitCode, record.environment.TZ]), [['lint', 'pass', 0, 'Africa/Monrovia'], ['test', 'fail', 3, 'Africa/Monrovia']]);
    assert.deepEqual(records[1].command, [process.execPath, '-e', 'process.exit(3)']);
    assert.deepEqual(readGateLog(join(directory, 'none.jsonl')), []);
});

const job = (workflow, name, next) => workflow.slice(workflow.indexOf(`\n  ${name}:`), next ? workflow.indexOf(`\n  ${next}:`) : undefined);

test('the release workflow gates one packed archive with the milestone acceptance and publishes it, with provenance', () => {
    const workflow = readFileSync(join(root, '.github/workflows/release.yml'), 'utf8');
    const on = workflow.slice(workflow.indexOf('\non:'), workflow.indexOf('\npermissions:'));
    assert.match(on, /push:\n {4}tags: \['v\*'\]/);
    assert.match(on, /workflow_dispatch:\n {4}inputs:\n {6}dry-run:/);
    assert.doesNotMatch(on, /pull_request|branches/);
    const [top, gate, publish] = [workflow.slice(0, workflow.indexOf('\njobs:')), job(workflow, 'gate', 'publish'), job(workflow, 'publish')];
    assert.match(top, /\npermissions:\n {2}contents: read\n/);
    assert.doesNotMatch(gate, /id-token|contents: write/);
    assert.match(publish, /permissions:\n {6}contents: write\n {6}id-token: write\n/);
    assert.match(publish, /needs: gate\n/);
    assert.match(publish, /github\.ref_type == 'tag'/);
    assert.match(publish, /github\.event_name != 'pull_request'/);
    assert.match(publish, /inputs\.dry-run == false/);
    for (const command of ['npm ci', 'npm ci --prefix scripts/implementation/spikes', 'npx playwright install --with-deps chrome', 'npm publish "$TARBALL" --dry-run']) assert.ok(gate.includes(command), command);
    // PV9-1-01/04: every release gate is one recorded step, in the order of releaseGates, and nothing else runs through gate.mjs.
    const recorded = [...gate.matchAll(/node scripts\/release\/gate\.mjs (\S+) -- (.+)/g)];
    assert.deepEqual(recorded.map(match => match[1]), releaseGates);
    const command = Object.fromEntries(recorded.map(match => [match[1], match[2]]));
    const expected = {typecheck: 'npm run typecheck', 'typecheck-storybook': 'npm run typecheck:storybook', lint: 'npm run lint', test: 'npm test',
        'test-host-timezone': 'npm test -- src/v02/core/__tests__/date.test.ts', build: 'npm run build', pack: 'npm pack --pack-destination "$RUNNER_TEMP/release-tarball"',
        'archive-matches-checkout': 'node scripts/release/release-metadata.mjs --tarball="$TARBALL" --verify-checkout', 'typecheck-contract': 'npm run typecheck:contract',
        'typecheck-contract-ts-5.4.5': 'npm run typecheck:contract', 'check-requirements': 'npm run check:requirements',
        'self-checks': 'node --test scripts/implementation/requirements.checks.mjs scripts/implementation/harness.checks.mjs scripts/release/release-metadata.checks.mjs',
        'check-timezones': 'npm run check:timezones', 'check-transitions': 'npm run check:transitions', 'check-docs': 'npm run check:docs',
        'docs-gate-selftest': 'node scripts/docs/check-docs-selftest.mjs', 'check-api': 'npm run check:api', 'build-storybook': 'npm run build-storybook',
        'packed-consumers': 'npm run check:package -- --tarball="$TARBALL" --output="$RUNNER_TEMP/',
        'milestone-acceptance': 'node scripts/implementation/alpha-acceptance.mjs --milestone="$MILESTONE" --tarball="$TARBALL" --output="$RUNNER_TEMP/',
        'browser-probes': 'node scripts/implementation/browser-probes.mjs --output="$RUNNER_TEMP/',
        'archive-unchanged': 'node scripts/release/release-metadata.mjs --tarball="$TARBALL" --verify-checkout'};
    for (const id of releaseGates) assert.ok(command[id].startsWith(expected[id]), `${id}: ${command[id]}`);
    assert.match(gate, /gate\.mjs typecheck-contract-ts-5\.4\.5 -- .+\n {8}env:\n {10}CALENDAR_TYPESCRIPT_COMPILER: scripts\/implementation\/spikes\/node_modules\/typescript-min\/lib\/tsc\.js\n/);
    assert.match(gate, /gate\.mjs test-host-timezone -- .+\n {8}env:\n {10}TZ: Africa\/Monrovia\n/);
    assert.match(gate, /gate\.mjs milestone-acceptance -- .+\n {8}env:\n {10}MILESTONE: \$\{\{ steps\.metadata\.outputs\.milestone \}\}\n/);
    assert.equal((workflow.match(/npm pack --/g) ?? []).length, 1, 'the only pack is gate `pack`');
    // One library build; check:package and the acceptance test the given archive instead of building and packing their own.
    assert.equal((gate.match(/npm run build(?!-storybook)/g) ?? []).length, 1, 'one library build');
    assert.doesNotMatch(gate, /check:package -- --output|alpha-acceptance\.mjs(?![^\n]*--tarball=)/);
    // The manifest step records failed and missing gates too, from the gate log and the run reports.
    assert.match(gate, /name: Release manifest of the packed archive\n {8}if: always\(\) && steps\.metadata\.outcome == 'success'\n/);
    assert.match(gate, /--manifest="\$RUNNER_TEMP\/release-reports\/release-manifest\.json" --gate-log="\$RUNNER_TEMP\/release-reports\/gates\.jsonl" --reports="\$RUNNER_TEMP\/release-reports"/);
    assert.ok(gate.indexOf('name: Release manifest') < gate.indexOf('npm publish "$TARBALL" --dry-run'), 'the dry run follows the manifest');
    assert.match(gate, /name: release-tarball\n/);
    assert.match(publish, /name: release-tarball\n/);
    assert.match(publish, /sha256sum --check --strict/);
    assert.match(publish, /--tag="\$GITHUB_REF_NAME"/);
    assert.match(publish, /npm publish "\$TARBALL" --provenance --access public --tag "\$DIST_TAG"/);
    assert.match(publish, /NODE_AUTH_TOKEN: \$\{\{ secrets\.NPM_TOKEN \}\}/);
    assert.match(publish, /npm audit signatures/);
    // The durable proof travels with the release: the gated archive, its manifest and the gate log, never a rebuild.
    assert.match(publish, /^    environment: npm-release$/m);
    assert.match(publish, /name: release-reports\n          path: \$\{\{ runner\.temp \}\}\/release-reports/);
    assert.match(publish, /assets=\("\$TARBALL" "\$RUNNER_TEMP\/release-reports\/release-manifest\.json" "\$RUNNER_TEMP\/release-reports\/gates\.jsonl"\)/);
    assert.match(publish, /gh release create "\$GITHUB_REF_NAME" "\$\{assets\[@\]\}" --verify-tag/);
    assert.match(publish, /gh release upload "\$GITHUB_REF_NAME" "\$\{assets\[@\]\}" --clobber/);
    assert.doesNotMatch(workflow, /docs\/implementation\/evidence/);
});

test('CI runs with a read-only token, gates one packed archive with the milestone acceptance and runs the Chrome probes', () => {
    const workflow = readFileSync(join(root, '.github/workflows/ci.yml'), 'utf8');
    // PV9-1-05: least privilege for push and pull request runs.
    assert.match(workflow.slice(0, workflow.indexOf('\njobs:')), /\npermissions:\n {2}contents: read\n/);
    assert.doesNotMatch(workflow, /contents: write|id-token|npm publish/);
    const packed = job(workflow, 'packed-consumers', 'browser-probes'), probes = job(workflow, 'browser-probes');
    assert.equal((workflow.match(/npm pack --/g) ?? []).length, 1);
    assert.match(packed, /--tarball="\$\{tarball\[0\]\}" --verify-checkout --github-output="\$GITHUB_OUTPUT"/);
    assert.match(packed, /npm run check:package -- --tarball="\$TARBALL" --output="\$RUNNER_TEMP\/packed-consumers"/);
    assert.match(packed, /node scripts\/implementation\/alpha-acceptance\.mjs --milestone="\$MILESTONE" --tarball="\$TARBALL" --output="\$RUNNER_TEMP\/packed-consumers\/milestone-acceptance"\n {8}env:\n {10}MILESTONE: \$\{\{ steps\.archive\.outputs\.milestone \}\}\n/);
    for (const command of ['npm run build', 'npm run build-storybook', 'node scripts/implementation/browser-probes.mjs --output="$RUNNER_TEMP/browser-probes"', 'npx playwright install --with-deps chrome']) assert.ok(probes.includes(command), command);
    assert.ok(probes.indexOf('npm run build-storybook') < probes.indexOf('browser-probes.mjs'), 'the story smoke needs the Storybook build');
});
