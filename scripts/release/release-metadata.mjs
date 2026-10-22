import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {appendFileSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {basename, dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

// Release metadata of one packed archive for the tag-triggered release workflow (process change 2026-10-22, spec §19.2):
// the version is read from the archive itself and checked against the tag, the npm dist-tag follows the prerelease id and
// the release notes are the CHANGELOG section of that version. Nothing is published here.
// node scripts/release/release-metadata.mjs --tarball=<tgz> [--tag=v<version>] [--repository=<owner/repo>] [--notes=<file>]
//     [--verify-checkout] [--manifest=<file> --gate-log=<gates.jsonl> --reports=<dir>] [--github-output=<file>]
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export const packageName = '@nelmad/calendar';
const semver = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;

/** The npm dist-tag of a version: `latest` for a stable one, `alpha`/`beta`/`rc` for `<x.y.z>-<id>.<n>`. */
export function distTag(version) {
    const match = semver.exec(version);
    if (!match) throw new Error(`${JSON.stringify(version)} is not a semantic version`);
    if (match[4] === undefined) return 'latest';
    const prerelease = /^(alpha|beta|rc)\.(0|[1-9]\d*)$/.exec(match[4]);
    if (!prerelease) throw new Error(`${version}: a prerelease must be <x.y.z>-alpha.N, -beta.N or -rc.N`);
    return prerelease[1];
}

/** The version a release tag names: `v<version>`, nothing else. */
export function tagVersion(tag) {
    if (typeof tag !== 'string' || !tag.startsWith('v') || !semver.test(tag.slice(1))) throw new Error(`${JSON.stringify(tag)} is not a v<version> release tag`);
    return tag.slice(1);
}

/**
 * The body of the `## [<version>] - <date>` CHANGELOG section, up to the next version heading. A release (`dated`)
 * needs a date in the heading: a section still marked Unreleased is not published.
 */
export function changelogSection(changelog, version, {dated = false} = {}) {
    const lines = changelog.split('\n'), start = lines.findIndex(line => line.startsWith(`## [${version}]`));
    if (start < 0) throw new Error(`CHANGELOG.md has no ## [${version}] section`);
    const heading = lines[start];
    if (dated && !new RegExp(`^## \\[${version.replace(/\./g, '\\.')}\\] - \\d{4}-\\d{2}-\\d{2}$`).test(heading)) {
        throw new Error(`CHANGELOG.md: "${heading}" must carry the release date (## [${version}] - YYYY-MM-DD) before ${version} is published`);
    }
    const end = lines.findIndex((line, index) => index > start && /^## \[/.test(line));
    const body = lines.slice(start + 1, end < 0 ? lines.length : end).join('\n').trim();
    if (!body) throw new Error(`CHANGELOG.md: the ${version} section is empty`);
    return `${body}\n`;
}

/** package.json inside a packed archive, without unpacking it. */
export function archiveManifest(tarball) {
    return JSON.parse(execFileSync('tar', ['-xzOf', tarball, 'package/package.json'], {encoding: 'utf8', maxBuffer: 4 * 1024 * 1024}));
}

/**
 * npm provenance links the package to its source repository: repository.url must name the repository that builds it. The
 * comparison is exact, case included (PV9-1-03): the registry is not documented to fold the case of the provenance
 * source repository, so `nelmad/calendar` is refused for a release that `Nelmad/calendar` builds.
 */
export function checkRepository(manifest, repository) {
    const url = typeof manifest.repository === 'string' ? manifest.repository : manifest.repository?.url;
    const named = /^(?:git\+)?https:\/\/github\.com\/([^/]+\/[^/]+?)(?:\.git)?$/.exec(url ?? '')?.[1];
    if (!named) throw new Error(`package.json repository.url ${JSON.stringify(url)} must be https://github.com/<owner>/<repo> for npm provenance`);
    if (repository !== undefined && named !== repository) throw new Error(`repository.url names ${named}, but ${repository} builds the release (the case must match exactly)`);
}

/** The milestone a version releases: the prerelease id (`alpha.2`, `beta.1`, `rc.1`) or `stable`; it selects the acceptance. */
export function milestone(version) {
    distTag(version);
    return semver.exec(version)[4] ?? 'stable';
}

/** What `npm pack --json` reports about an archive, read from the file itself: one pack, any number of readers. */
export function readArchive(tarball) {
    const bytes = readFileSync(tarball), manifest = archiveManifest(tarball);
    const files = execFileSync('tar', ['-tzf', tarball], {encoding: 'utf8', maxBuffer: 16 * 1024 * 1024}).split('\n').filter(path => path && !path.endsWith('/'));
    if (!files.every(path => path.startsWith('package/'))) throw new Error(`${basename(tarball)} has entries outside package/`);
    return {name: manifest.name, version: manifest.version, filename: basename(tarball), integrity: `sha512-${createHash('sha512').update(bytes).digest('base64')}`,
        sha256: createHash('sha256').update(bytes).digest('hex'), files: files.map(path => path.slice('package/'.length)).sort()};
}

/**
 * Byte differences between the archive and the checkout it was packed from (PV9-1-02). The gates that read `dist` (contract,
 * docs, API, Storybook) run on the checkout; an empty result before and after them binds those gates to the archive.
 * A `dist` file the archive does not contain is a difference too: the gates would read it, the consumers never would.
 */
export function checkoutDifferences(tarball, checkout = root) {
    const directory = mkdtempSync(join(tmpdir(), 'calendar-archive-'));
    try {
        execFileSync('tar', ['-xzf', tarball, '-C', directory]);
        const {files} = readArchive(tarball), packed = new Set(files), differences = [];
        for (const path of files) {
            const local = join(checkout, path);
            if (!existsSync(local)) differences.push({path, reason: 'missing in the checkout'});
            else if (!readFileSync(local).equals(readFileSync(join(directory, 'package', path)))) differences.push({path, reason: 'bytes differ'});
        }
        const dist = existsSync(join(checkout, 'dist')) ? readdirSync(join(checkout, 'dist'), {recursive: true, withFileTypes: true}).filter(entry => entry.isFile())
            .map(entry => join(entry.parentPath, entry.name).slice(checkout.length + 1).split('\\').join('/')) : [];
        for (const path of dist) if (!packed.has(path)) differences.push({path, reason: 'not in the archive'});
        return differences;
    } finally {
        rmSync(directory, {recursive: true, force: true});
    }
}

/** Everything the release jobs need about one archive; throws when the archive does not match the tag. */
export function releaseMetadata({tarball, tag, changelog, repository}) {
    const manifest = archiveManifest(tarball);
    if (manifest.name !== packageName) throw new Error(`${basename(tarball)} packs ${manifest.name}, not ${packageName}`);
    checkRepository(manifest, repository);
    if (tag !== undefined && tagVersion(tag) !== manifest.version) throw new Error(`Tag ${tag} does not match the archive version ${manifest.version}`);
    const bytes = readFileSync(tarball), tagName = distTag(manifest.version);
    return {
        name: manifest.name, version: manifest.version, distTag: tagName, prerelease: tagName !== 'latest', milestone: milestone(manifest.version), tarball: basename(tarball),
        sha256: createHash('sha256').update(bytes).digest('hex'), integrity: `sha512-${createHash('sha512').update(bytes).digest('base64')}`,
        notes: changelogSection(changelog, manifest.version, {dated: tag !== undefined}),
    };
}

/**
 * The gates of the release proof in the order the gate job runs them (spec §19.2, plan §12.2): each step runs one of them
 * through scripts/release/gate.mjs, which records its command, environment, duration and outcome. `pack` is the only
 * `npm pack`; `archive-matches-checkout` and `archive-unchanged` bind the gates that read the checkout's dist to that archive.
 */
export const releaseGates = ['typecheck', 'typecheck-storybook', 'lint', 'test', 'test-host-timezone', 'build', 'pack', 'archive-matches-checkout',
    'typecheck-contract', 'typecheck-contract-ts-5.4.5', 'check-requirements', 'self-checks', 'check-timezones', 'check-transitions', 'check-docs',
    'docs-gate-selftest', 'check-api', 'build-storybook', 'packed-consumers', 'milestone-acceptance', 'browser-probes', 'archive-unchanged'];

/** The gate records that scripts/release/gate.mjs appends, one JSON object per line; no file is no record. */
export function readGateLog(file) {
    return existsSync(file) ? readFileSync(file, 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line)) : [];
}

/**
 * The gate part of the release manifest (PV9-1-04): the recorded outcome of every release gate, the tool/runtime tuples of
 * the run reports, and the binding of those reports to the archive. `pass` needs a `pass` record of every gate, nothing
 * else recorded, and reports of the packed consumers and the milestone acceptance that name this archive's integrity.
 * A missing record, a missing report or a skipped gate is not a pass.
 */
export function gateManifest({metadata, gates, reports = {}}) {
    const problems = [], recorded = new Map();
    for (const record of gates) {
        if (!releaseGates.includes(record.id)) problems.push(`${record.id}: not a release gate`);
        if (recorded.has(record.id)) problems.push(`${record.id}: recorded more than once`);
        recorded.set(record.id, record);
    }
    const outcomes = releaseGates.map(id => {
        const record = recorded.get(id);
        if (!record) problems.push(`${id}: no record`);
        else if (record.outcome !== 'pass') problems.push(`${id}: ${record.outcome}`);
        return record ?? {id, outcome: 'missing'};
    });
    const bound = {'packed-consumers': report => report.package?.integrity, 'milestone-acceptance': report => report.binding?.npmIntegrity};
    for (const name of ['packed-consumers', 'milestone-acceptance', 'browser-probes']) {
        const report = reports[name];
        if (!report) { problems.push(`${name}: no run report`); continue; }
        if (report.outcome !== 'pass') problems.push(`${name}: run report outcome ${report.outcome}`);
        if (bound[name] && bound[name](report) !== metadata.integrity) problems.push(`${name}: run report is bound to ${bound[name](report)}, not ${metadata.integrity}`);
    }
    const acceptance = reports['milestone-acceptance'];
    if (acceptance && acceptance.milestone !== metadata.milestone) problems.push(`milestone-acceptance: ran ${acceptance.milestone}, the archive releases ${metadata.milestone}`);
    return {
        gates: outcomes,
        runReports: {'packed-consumers': reports['packed-consumers']?.versions ?? null, 'milestone-acceptance': acceptance?.versions ?? null, 'browser-probes': reports['browser-probes']?.versions ?? null},
        problems, outcome: problems.length ? 'fail' : 'pass',
    };
}

/** Exact tool versions of the checkout: the root and harness lockfiles, which `npm ci` installs as they are. */
export function lockedTools(checkout = root) {
    const pick = (lock, names) => Object.fromEntries(names.map(name => [name, JSON.parse(readFileSync(join(checkout, lock), 'utf8')).packages[`node_modules/${name}`]?.version ?? null]));
    return {...pick('package-lock.json', ['typescript', 'vitest', 'jsdom', 'eslint', 'stylelint', 'storybook', 'vite', '@microsoft/api-extractor', 'react', 'react-dom']),
        harness: pick('scripts/implementation/spikes/package-lock.json', ['playwright', 'axe-core', 'typescript', 'typescript-min'])};
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const option = name => process.argv.find(arg => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
    const tarball = option('tarball');
    if (!tarball) throw new Error('--tarball=<tgz> is required');
    const metadata = releaseMetadata({tarball: resolve(tarball), tag: option('tag') || undefined, repository: option('repository') || undefined,
        changelog: readFileSync(resolve(root, 'CHANGELOG.md'), 'utf8')});
    const {notes, ...summary} = metadata;
    if (option('notes')) writeFileSync(option('notes'), notes);
    if (option('github-output')) appendFileSync(option('github-output'), Object.entries(summary).map(([key, value]) => `${key}=${value}\n`).join(''));
    console.log(JSON.stringify(summary, null, 2));
    if (process.argv.includes('--verify-checkout')) {
        const differences = checkoutDifferences(resolve(tarball));
        if (differences.length) throw new Error(`${metadata.tarball} differs from the checkout:\n${differences.map(entry => `${entry.path}: ${entry.reason}`).join('\n')}`);
        console.log(`${metadata.tarball}: every packed file is byte-identical to the checkout, and dist has no other file`);
    }
    if (option('manifest')) {
        // The release manifest of §19.2 is this report of the run, kept as a CI artifact: the recorded outcome, command and
        // environment of each gate, the tool/runtime tuples of the run reports, and their binding to the archive.
        const {GITHUB_SERVER_URL: server, GITHUB_REPOSITORY: repository, GITHUB_RUN_ID: run, GITHUB_RUN_ATTEMPT: attempt} = process.env;
        const reports = Object.fromEntries(['packed-consumers', 'milestone-acceptance', 'browser-probes'].map(name => [name, join(resolve(option('reports') ?? '.'), name, 'manifest.json')])
            .filter(([, path]) => existsSync(path)).map(([name, path]) => [name, JSON.parse(readFileSync(path, 'utf8'))]));
        const gates = gateManifest({metadata, gates: readGateLog(resolve(option('gate-log') ?? 'gates.jsonl')), reports});
        writeFileSync(option('manifest'), JSON.stringify({
            ...summary, commit: process.env.GITHUB_SHA ?? execFileSync('git', ['rev-parse', 'HEAD'], {cwd: root, encoding: 'utf8'}).trim(),
            ref: process.env.GITHUB_REF ?? null, run: run ? `${server}/${repository}/actions/runs/${run}/attempts/${attempt}` : null,
            lockfileSha256: createHash('sha256').update(readFileSync(resolve(root, 'package-lock.json'))).digest('hex'),
            tools: {node: process.version, npm: execFileSync('npm', ['--version'], {encoding: 'utf8'}).trim(), os: `${process.platform}-${process.arch}`, ...lockedTools()},
            files: readArchive(resolve(tarball)).files, ...gates, generatedAt: new Date().toISOString(),
        }, null, 2) + '\n');
        if (gates.outcome !== 'pass') throw new Error(`Release manifest outcome fail:\n${gates.problems.join('\n')}`);
        console.log(`Release manifest: ${releaseGates.length} gates pass on ${metadata.integrity}`);
    }
}
