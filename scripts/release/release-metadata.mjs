import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {existsSync, mkdtempSync, readFileSync, readdirSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {basename, dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

// Archive helpers of the packed harnesses: CI packs the checkout once and every harness given --tarball reads that file
// (packed-harness.mjs). Releases are the owner's staged-publishing Release workflow (RELEASING.md); nothing here publishes.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

/** package.json inside a packed archive, without unpacking it. */
export function archiveManifest(tarball) {
    return JSON.parse(execFileSync('tar', ['-xzOf', tarball, 'package/package.json'], {encoding: 'utf8', maxBuffer: 4 * 1024 * 1024}));
}

/**
 * npm trusted publishing and provenance match the source repository exactly: repository.url must name the repository that
 * builds the release, case included (PV9-1-03), so `nelmad/calendar` is refused for a release that `Nelmad/calendar` builds.
 */
export function checkRepository(manifest, repository) {
    const url = typeof manifest.repository === 'string' ? manifest.repository : manifest.repository?.url;
    const named = /^(?:git\+)?https:\/\/github\.com\/([^/]+\/[^/]+?)(?:\.git)?$/.exec(url ?? '')?.[1];
    if (!named) throw new Error(`package.json repository.url ${JSON.stringify(url)} must be https://github.com/<owner>/<repo> for npm provenance`);
    if (repository !== undefined && named !== repository) throw new Error(`repository.url names ${named}, but ${repository} builds the release (the case must match exactly)`);
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
 * Byte differences between the archive and the checkout it was packed from (PV9-1-02): a harness given an archive tests it
 * only when every packed file equals the checkout's build, so the source hashes of its report describe that archive.
 * A `dist` file the archive does not contain is a difference too: checks of the checkout would read it, consumers never would.
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
