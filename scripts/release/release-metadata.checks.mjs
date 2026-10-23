import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {test} from 'node:test';
import {checkRepository, checkoutDifferences, readArchive} from './release-metadata.mjs';

// Release self-checks (aligned with the owner's staged-publishing process, 2026-10-23):
// `node --test scripts/release/release-metadata.checks.mjs`. The Release workflow and RELEASING.md are the owner's and
// are only read here, never generated or rewritten.
const root = resolve(import.meta.dirname, '../..');
const read = path => readFileSync(join(root, path), 'utf8');
const repository = {type: 'git', url: 'git+https://github.com/Nelmad/calendar.git'};
/** The text of one top-level key (`on`, `permissions`, `jobs`) or of one job, up to the next sibling. */
const block = (text, start, sibling) => {
    const from = text.indexOf(start);
    assert.ok(from >= 0, start);
    const rest = text.slice(from + start.length), next = rest.search(sibling);
    return start + (next < 0 ? rest : rest.slice(0, next));
};

test('trusted publishing and provenance need repository.url to name the building repository, case included', () => {
    checkRepository({repository}, 'Nelmad/calendar');
    checkRepository({repository: 'https://github.com/Nelmad/calendar'}, undefined);
    assert.throws(() => checkRepository({}, 'Nelmad/calendar'), /repository\.url/);
    assert.throws(() => checkRepository({repository}, 'someone/fork'), /someone\/fork builds/);
    assert.throws(() => checkRepository({repository: 'https://github.com/nelmad/calendar.git'}, 'Nelmad/calendar'), /case must match/);
    // The npm trusted publisher names owner `Nelmad` and repository `calendar` (RELEASING.md).
    checkRepository(JSON.parse(read('package.json')), 'Nelmad/calendar');
});

test('the CHANGELOG has the section of the package version that the Release workflow uses as release notes', () => {
    const version = JSON.parse(read('package.json')).version, lines = read('CHANGELOG.md').split('\n');
    const start = lines.findIndex(line => line.startsWith(`## [${version}]`));
    assert.ok(start >= 0, `CHANGELOG.md has no ## [${version}] section`);
    const end = lines.findIndex((line, index) => index > start && /^## \[/.test(line));
    assert.ok(lines.slice(start + 1, end < 0 ? undefined : end).join('\n').trim(), `the ${version} section is empty`);
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
    // A rebuild between the pack and a harness, a stale extra dist file and a missing file are all differences.
    writeFileSync(join(checkout, 'dist/v02/core.js'), 'export const a = 2;\n');
    writeFileSync(join(checkout, 'dist/stale.js'), '');
    execFileSync('rm', [join(checkout, 'dist/index.js')]);
    assert.deepEqual(checkoutDifferences(tarball, checkout).sort((a, b) => a.path.localeCompare(b.path)), [
        {path: 'dist/index.js', reason: 'missing in the checkout'}, {path: 'dist/stale.js', reason: 'not in the archive'}, {path: 'dist/v02/core.js', reason: 'bytes differ'}]);
});

test('the owner Release workflow is manual on main and stages a checked pack with provenance; the tag follows approval', () => {
    const workflow = read('.github/workflows/release.yml');
    // Started by hand only: no tag, branch, pull request or schedule trigger.
    assert.equal(block(workflow, '\non:\n', /\n\S/).trim(), 'on:\n  workflow_dispatch:');
    assert.match(block(workflow, '\npermissions:\n', /\n\S/), /^\npermissions:\n {2}contents: read\n$/);
    const jobs = block(workflow, '\njobs:\n', /\n\S/), release = block(jobs, '\n  release:\n', /\n {2}\S/);
    assert.equal([...jobs.matchAll(/^ {2}[\w-]+:$/gm)].length, 1, 'one job');
    assert.match(release, /\n {4}if: github\.ref == 'refs\/heads\/main'\n/);
    assert.match(release, /\n {4}environment: npm-publish\n/);
    // OIDC for trusted publishing and provenance exists only in the release job.
    assert.equal((workflow.match(/id-token: write/g) ?? []).length, 1);
    assert.match(release, /\n {4}permissions:\n {6}contents: write[^\n]*\n {6}id-token: write[^\n]*\n/);
    assert.doesNotMatch(workflow, /NODE_AUTH_TOKEN|NPM_TOKEN|secrets\./);
    // Prereleases stage under `next`, so `latest` never moves to a prerelease.
    assert.match(release, /\*-\*\) dist_tag=next; prerelease=true ;;\n\s+\*\) dist_tag=latest; prerelease=false ;;/);
    // Checks of the checkout, then the pack check, then staging; nothing is published directly.
    const at = text => { const index = release.indexOf(text); assert.ok(index >= 0, text); return index; };
    const order = ['npm ci', 'npm run typecheck', 'npm test', 'npm run build', 'node scripts/check-pack.mjs', 'npm stage publish --tag "${DIST_TAG}" --provenance',
        'name: Wait for approval on npmjs.com', 'gh release create "v${VERSION}"'].map(at);
    assert.deepEqual(order, [...order].sort((a, b) => a - b));
    assert.doesNotMatch(workflow, /(?<!stage )npm publish/);
    // The tag and the GitHub Release only for a version that is live on npm: already published or approved now.
    const create = release.slice(release.indexOf('- name: Create tag and GitHub Release'));
    assert.match(create, /if: >-\n\s+steps\.release\.outputs\.tagged == 'false' &&\n\s+\(steps\.release\.outputs\.published == 'true' \|\| steps\.approval\.outputs\.approved == 'true'\)/);
    assert.match(create, /awk -v version="\$\{VERSION\}"[\s\S]*CHANGELOG\.md > release-notes\.md/);
    for (const path of ['scripts/check-pack.mjs', 'RELEASING.md']) assert.ok(existsSync(join(root, path)), path);
    assert.doesNotMatch(workflow, /scripts\/release\//);
});

test('CI runs every gate on pull requests and pushes to main with a read-only token and references no removed script', () => {
    const workflow = read('.github/workflows/ci.yml');
    assert.match(block(workflow, '\non:\n', /\n\S/), /^\non:\n {2}push:\n {4}branches: \[main[^\]]*\]\n {2}pull_request:\n$/);
    assert.match(block(workflow, '\npermissions:\n', /\n\S/), /^\npermissions:\n {2}contents: read\n$/);
    assert.doesNotMatch(workflow, /contents: write|id-token|npm publish|npm stage|secrets\./);
    // Whole `- run:` lines, not substrings: `npm test` must not be satisfied by the Monrovia `npm test -- …` step (RA-1-01).
    const runs = [...workflow.matchAll(/^ +- run: (.+)$/gm)].map(match => match[1]);
    for (const command of ['npm ci', 'npm run typecheck', 'npm run typecheck:storybook', 'npm run lint', 'npm test', 'npm run build', 'node scripts/check-pack.mjs',
        'npm run typecheck:contract', 'npm run check:requirements',
        'node --test scripts/implementation/requirements.checks.mjs scripts/implementation/harness.checks.mjs scripts/release/release-metadata.checks.mjs',
        'npm run check:timezones', 'npm run check:transitions', 'npm run check:docs', 'node scripts/docs/check-docs-selftest.mjs', 'npm run check:api', 'npm run build-storybook',
        'npm run check:package -- --tarball="$TARBALL" --output="$RUNNER_TEMP/packed-consumers"',
        'node scripts/implementation/alpha-acceptance.mjs --milestone="$MILESTONE" --tarball="$TARBALL" --output="$RUNNER_TEMP/packed-consumers/milestone-acceptance"',
        'node scripts/implementation/browser-probes.mjs --output="$RUNNER_TEMP/browser-probes"']) assert.ok(runs.includes(command), command);
    // The minimum compiler and the host time zone are step environments of their own commands.
    assert.match(workflow, /- run: npm run typecheck:contract\n {8}env:\n {10}CALENDAR_TYPESCRIPT_COMPILER: scripts\/implementation\/spikes\/node_modules\/typescript-min\/lib\/tsc\.js\n/);
    assert.match(workflow, /- run: npm test -- src\/v02\/core\/__tests__\/date\.test\.ts [^\n]+\n {8}env:\n {10}TZ: Africa\/Monrovia\n/);
    // No gate may be neutralised.
    assert.doesNotMatch(workflow, /continue-on-error/);
    // One pack per run, after the build it is compared with; check-pack only lists the dry-run contents.
    assert.equal((workflow.match(/npm pack --/g) ?? []).length, 1);
    assert.ok(workflow.indexOf('npm run build\n') < workflow.indexOf('node scripts/check-pack.mjs'), 'check-pack reads dist');
    assert.match(workflow, /MILESTONE: \$\{\{ steps\.archive\.outputs\.milestone \}\}/);
    // Every script the workflow runs exists; the removed tag-workflow runners are gone.
    for (const [, path] of workflow.matchAll(/node (?:--test )?((?:scripts|\.\/scripts)\/\S+\.mjs)/g)) assert.ok(existsSync(join(root, path)), path);
    assert.doesNotMatch(workflow, /gate\.mjs|release-metadata\.mjs|--verify-checkout/);
    assert.ok(!existsSync(join(root, 'scripts/release/gate.mjs')));
});
