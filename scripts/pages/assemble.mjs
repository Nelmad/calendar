import {execFileSync} from 'node:child_process';
import {copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join, resolve} from 'node:path';
import process from 'node:process';
import {setTimeout as sleep} from 'node:timers/promises';
import {fileURLToPath} from 'node:url';
import {parseArgs} from 'node:util';

import {injectSwitcher, planSite, readManifest, readRegistry, redirectPage, storyHomes, switcherFile, versionsFile} from './site.mjs';

// The versioned Storybook of GitHub Pages (.github/workflows/pages.yml), one Storybook per line of versions.json:
//   node scripts/pages/assemble.mjs build --site <dir> [--work <dir>]
//     builds every line into <dir>/<line>/ under its base path with the npm scripts versions.json lists: the HEAD line
//     in this checkout (after npm ci), every other line in a git worktree of its tag (npm ci first).
//   node scripts/pages/assemble.mjs assemble --site <dir>
//     adds the version switcher to each manager, versions.json (status from the npm registry) and the root redirects.
const here = dirname(fileURLToPath(import.meta.url)), root = resolve(here, '../..');
const log = message => process.stdout.write(`${message}\n`);
const run = (command, args, options = {}) => {
    log(`$ ${[command, ...args].join(' ')}${options.cwd && options.cwd !== root ? `   (in ${options.cwd})` : ''}`);
    return execFileSync(command, args, {cwd: root, stdio: 'inherit', ...options});
};
const git = (...args) => execFileSync('git', args, {cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']}).trim();
const manifest = () => readManifest(JSON.parse(readFileSync(join(here, 'versions.json'), 'utf8')));

/** The tag of a line, fetched when the checkout lacks it (actions/checkout fetches no tags). */
function ensureTag(ref) {
    try {
        git('rev-parse', '--verify', '--quiet', `refs/tags/${ref}^{commit}`);
    } catch {
        run('git', ['fetch', '--no-tags', '--depth=1', 'origin', `+refs/tags/${ref}:refs/tags/${ref}`]);
    }
}

function buildStorybook(checkout, entry, out) {
    const env = {...process.env, STORYBOOK_BASE_PATH: entry.path, STORYBOOK_DISABLE_TELEMETRY: '1'};
    for (const [index, script] of entry.scripts.entries()) {
        const storybook = index === entry.scripts.length - 1 ? ['--', '--output-dir', out, '--disable-telemetry'] : [];
        run('npm', ['run', script, ...storybook], {cwd: checkout, env});
    }
}

function build(site, work) {
    const {lines} = manifest();
    for (const entry of lines) if (existsSync(join(site, entry.line))) throw new Error(`${join(site, entry.line)} exists; build into an empty site directory`);
    mkdirSync(site, {recursive: true});
    const checkouts = work ?? mkdtempSync(join(tmpdir(), 'calendar-pages-'));
    try {
        for (const entry of lines) {
            const out = join(site, entry.line);
            log(`\n== ${entry.line} from ${entry.ref} (base path ${entry.path})`);
            if (entry.ref === 'HEAD') {
                buildStorybook(root, entry, out);
                continue;
            }
            ensureTag(entry.ref);
            const checkout = join(checkouts, entry.line);
            run('git', ['worktree', 'add', '--detach', checkout, `refs/tags/${entry.ref}`]);
            try {
                run('npm', ['ci', '--no-audit', '--no-fund'], {cwd: checkout});
                buildStorybook(checkout, entry, out);
            } finally {
                run('git', ['worktree', 'remove', '--force', checkout]);
            }
        }
    } finally {
        if (!work) rmSync(checkouts, {recursive: true, force: true});
    }
}

/**
 * `npm view` with retries: the registry decides the redirect and the statuses, so no answer fails the build.
 * --prefer-online revalidates metadata a restored npm cache may hold, as release.yml does when it waits for a version.
 */
async function queryRegistry(name) {
    const delays = [0, 5, 20];
    for (const [attempt, delay] of delays.entries()) {
        await sleep(delay * 1000);
        try {
            return readRegistry(execFileSync('npm', ['view', name, 'dist-tags', 'versions', '--json', '--prefer-online'], {cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']}));
        } catch (error) {
            const reason = String(error.stderr || error.message).trim().split('\n')[0];
            if (attempt === delays.length - 1 || /E404/.test(reason)) throw new Error(`npm view ${name} failed: ${reason}`);
            log(`npm view ${name} failed (${reason}); retrying`);
        }
    }
}

function versionAt(ref) {
    if (ref === 'HEAD') return JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;
    try {
        return JSON.parse(git('show', `refs/tags/${ref}:package.json`)).version;
    } catch (error) {
        throw new Error(`cannot read package.json of ${ref} (the build fetches the tag): ${String(error.stderr || error.message).trim()}`);
    }
}

async function assemble(site) {
    const plan = manifest(), names = new Set(plan.lines.map(entry => entry.line));
    const own = new Set([switcherFile, versionsFile, 'index.html', 'iframe.html']);
    const unexpected = readdirSync(site).filter(name => !names.has(name) && !own.has(name));
    if (unexpected.length) throw new Error(`${site} has entries versions.json does not list: ${unexpected.join(', ')}`);
    const indexes = {};
    for (const {line} of plan.lines) {
        for (const file of ['index.html', 'iframe.html', 'index.json', 'sb-manager/globals-runtime.js']) {
            if (!existsSync(join(site, line, file))) throw new Error(`${line}/${file} is missing; run the build first`);
        }
        if (!readFileSync(join(site, line, 'sb-manager/globals-runtime.js'), 'utf8').includes('__STORYBOOK_API__')) {
            throw new Error(`${line}/sb-manager/globals-runtime.js does not define the manager API global the switcher uses`);
        }
        indexes[line] = JSON.parse(readFileSync(join(site, line, 'index.json'), 'utf8'));
    }
    const built = Object.fromEntries(plan.lines.map(entry => [entry.line, versionAt(entry.ref)]));
    const {document, warnings} = planSite(plan, built, await queryRegistry(plan.package));
    for (const warning of warnings) log(process.env.GITHUB_ACTIONS ? `::warning::${warning}` : `warning: ${warning}`);

    for (const {line} of plan.lines) {
        const manager = join(site, line, 'index.html');
        writeFileSync(manager, injectSwitcher(readFileSync(manager, 'utf8'), line));
    }
    copyFileSync(join(here, switcherFile), join(site, switcherFile));
    writeFileSync(join(site, versionsFile), `${JSON.stringify(document, null, 2)}\n`);
    const homes = storyHomes(document, indexes);
    writeFileSync(join(site, 'index.html'), redirectPage(document, homes, ''));
    writeFileSync(join(site, 'iframe.html'), redirectPage(document, homes, 'iframe.html'));
    log(`${plan.basePath} redirects to ${document.latest}; ${document.lines.map(entry => `${entry.line} = ${entry.version} (${entry.status})`).join(', ')}`);
}

const {positionals: [command], values} = parseArgs({allowPositionals: true, options: {site: {type: 'string'}, work: {type: 'string'}}});
if (!['build', 'assemble'].includes(command) || !values.site) {
    process.stderr.write('usage: node scripts/pages/assemble.mjs build|assemble --site <dir> [--work <dir>]\n');
    process.exit(2);
}
try {
    const site = resolve(values.site);
    if (command === 'build') build(site, values.work && resolve(values.work));
    else await assemble(site);
} catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exit(1);
}
