import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join, resolve} from 'node:path';
import {test} from 'node:test';
import {runInNewContext} from 'node:vm';

import {injectSwitcher, isPrerelease, lineOf, planSite, readManifest, readRegistry, redirectPage, storyHomes} from './site.mjs';
import {currentLine, prereleaseLabel} from './version-switcher.js';

// Checks of the versioned Storybook site (pages.yml runs them before building): node --test scripts/pages/*.checks.mjs.
// Named .checks.mjs, not .test.mjs, so that vitest (npm test) does not collect them.
const root = resolve(import.meta.dirname, '../..');
const read = path => readFileSync(join(root, path), 'utf8');
const manifest = readManifest(JSON.parse(read('scripts/pages/versions.json')));
const today = readRegistry('{"dist-tags": {"latest": "0.1.1"}, "versions": ["0.1.0", "0.1.1"]}');
const built = {'0.1': '0.1.1', '0.2': '0.2.0-alpha.2'};

test('a line is major.minor before 1.0 and the major after it', () => {
    assert.equal(lineOf('0.1.1'), '0.1');
    assert.equal(lineOf('0.2.0-alpha.2'), '0.2');
    assert.equal(lineOf('0.10.3'), '0.10');
    assert.equal(lineOf('1.0.0'), '1');
    assert.equal(lineOf('2.3.4-rc.1+build.5'), '2');
    for (const version of ['1.0', 'v1.0.0', '', '01.0.0', undefined]) assert.throws(() => lineOf(version), /not a semver version/);
    assert.equal(isPrerelease('0.2.0-alpha.2'), true);
    assert.equal(isPrerelease('0.1.1'), false);
});

test('the committed manifest: 0.1 from v0.1.1, 0.2 from the deployed commit, under /calendar/', () => {
    assert.deepEqual(manifest, {package: '@nelmad/calendar', basePath: '/calendar/', lines: [
        {line: '0.1', ref: 'v0.1.1', scripts: ['build-storybook'], path: '/calendar/0.1/'},
        {line: '0.2', ref: 'HEAD', scripts: ['build', 'build-storybook'], path: '/calendar/0.2/'},
    ]});
    // The HEAD line is the line of package.json.
    assert.equal(lineOf(JSON.parse(read('package.json')).version), manifest.lines.find(entry => entry.ref === 'HEAD').line);
});

test('the manifest refuses names that would become wrong paths or refs', () => {
    const scripts = ['build-storybook'], lines = [{line: '0.1', ref: 'v0.1.1', scripts}, {line: '0.2', ref: 'HEAD', scripts}];
    const base = {package: '@nelmad/calendar', basePath: '/calendar/', lines};
    assert.throws(() => readManifest({...base, basePath: 'calendar'}), /basePath/);
    assert.throws(() => readManifest({...base, basePath: '/calendar'}), /basePath/);
    assert.throws(() => readManifest({...base, package: 'Bad Name'}), /package/);
    assert.throws(() => readManifest({...base, lines: []}), /at least one line/);
    assert.throws(() => readManifest({...base, lines: [...lines, {line: '0.1', ref: 'v0.1.0', scripts}]}), /listed twice/);
    assert.throws(() => readManifest({...base, lines: [{line: '0.1.1', ref: 'v0.1.1', scripts}, lines[1]]}), /must be 0\.<minor> or <major>/);
    assert.throws(() => readManifest({...base, lines: [{line: '../x', ref: 'v0.1.1', scripts}, lines[1]]}), /must be 0\.<minor> or <major>/);
    assert.throws(() => readManifest({...base, lines: [{line: '0.1', ref: 'main', scripts}, lines[1]]}), /v<semver> tag or HEAD/);
    assert.throws(() => readManifest({...base, lines: [{line: '0.1', ref: 'v0.1.1; rm -rf /', scripts}, lines[1]]}), /v<semver> tag or HEAD/);
    assert.throws(() => readManifest({...base, lines: [lines[0]]}), /exactly one line is built from HEAD/);
    assert.throws(() => readManifest({...base, lines: [{line: '0.1', ref: 'HEAD', scripts}, lines[1]]}), /exactly one line is built from HEAD/);
    for (const bad of [undefined, [], ['build storybook'], ['--output-dir=/'], [42]]) {
        assert.throws(() => readManifest({...base, lines: [{line: '0.1', ref: 'v0.1.1', scripts: bad}, lines[1]]}), /scripts must list the npm scripts/);
    }
    const sorted = readManifest({...base, lines: [{line: '1', ref: 'HEAD', scripts}, {line: '0.10', ref: 'v0.10.0', scripts}, {line: '0.9', ref: 'v0.9.2', scripts}]});
    assert.deepEqual(sorted.lines.map(entry => entry.line), ['0.9', '0.10', '1']);
});

test('npm view output: a single published version is a string, and latest is required', () => {
    assert.deepEqual(readRegistry('{"dist-tags": {"latest": "0.1.0"}, "versions": "0.1.0"}'), {latest: '0.1.0', versions: ['0.1.0']});
    assert.deepEqual(today, {latest: '0.1.1', versions: ['0.1.0', '0.1.1']});
    assert.throws(() => readRegistry('{"dist-tags": {"next": "0.2.0-alpha.2"}, "versions": ["0.2.0-alpha.2"]}'), /no latest dist-tag/);
});

test('today: the root opens 0.1 (npm latest 0.1.1) and 0.2 is a prerelease', () => {
    const {document, warnings} = planSite(manifest, built, today);
    assert.deepEqual(document, {package: '@nelmad/calendar', latest: '0.1', lines: [
        {line: '0.1', version: '0.1.1', status: 'stable', path: '/calendar/0.1/'},
        {line: '0.2', version: '0.2.0-alpha.2', status: 'prerelease', path: '/calendar/0.2/'},
    ]});
    assert.deepEqual(warnings, []);
    // Published alphas leave the line a prerelease line.
    const alphas = readRegistry({'dist-tags': {latest: '0.1.1', next: '0.2.0-alpha.3'}, versions: ['0.1.1', '0.2.0-alpha.2', '0.2.0-alpha.3']});
    assert.equal(planSite(manifest, built, alphas).document.lines[1].status, 'prerelease');
});

test('once 0.2.0 is latest, the root opens 0.2 and both lines are stable', () => {
    const registry = readRegistry({'dist-tags': {latest: '0.2.0'}, versions: ['0.1.0', '0.1.1', '0.2.0-alpha.2', '0.2.0']});
    const {document} = planSite(manifest, {...built, '0.2': '0.2.1-alpha.0'}, registry);
    assert.equal(document.latest, '0.2');
    assert.deepEqual(document.lines.map(entry => entry.status), ['stable', 'stable']);
});

test('a latest line the manifest does not list fails the build instead of redirecting elsewhere', () => {
    const registry = readRegistry({'dist-tags': {latest: '1.0.0'}, versions: ['0.1.1', '1.0.0']});
    assert.throws(() => planSite(manifest, built, registry), /npm latest is 1\.0\.0 \(line 1\), which scripts\/pages\/versions\.json does not list/);
});

test('a ref whose package.json belongs to another line or version fails; a newer stable patch warns', () => {
    assert.throws(() => planSite(manifest, {...built, '0.2': '0.3.0-alpha.0'}, today), /line 0\.2 \(HEAD\) has version 0\.3\.0-alpha\.0, which belongs to line 0\.3/);
    assert.throws(() => planSite(manifest, {...built, '0.1': '0.1.2'}, today), /tag v0\.1\.1 has version 0\.1\.2/);
    assert.throws(() => planSite(manifest, {'0.1': '0.1.1'}, today), /no version is known for line 0\.2/);
    const patched = readRegistry({'dist-tags': {latest: '0.1.2'}, versions: ['0.1.0', '0.1.1', '0.1.2']});
    assert.deepEqual(planSite(manifest, built, patched).warnings, ['npm has 0.1.2 in line 0.1, but versions.json builds v0.1.1']);
});

const manager = `<script type="module">
      import './sb-manager/globals-runtime.js';

        import './sb-addons/essentials-controls-1/manager-bundle.js';
      import './sb-manager/runtime.js';
    </script>`;

test('the switcher is imported right after the manager globals, once', () => {
    const injected = injectSwitcher(manager, '0.1');
    assert.equal(injected, manager.replace("globals-runtime.js';", "globals-runtime.js';\n      import '../version-switcher.js';"));
    const order = ['globals-runtime.js', 'version-switcher.js', 'essentials-controls', 'sb-manager/runtime.js'].map(name => injected.indexOf(name));
    assert.deepEqual(order, [...order].sort((a, b) => a - b));
    assert.equal(injectSwitcher(injected, '0.1'), injected);
    assert.throws(() => injectSwitcher('<script type="module">import "./main.js";</script>', '0.3'), /0\.3\/index\.html does not import the Storybook manager globals exactly once/);
    assert.throws(() => injectSwitcher(manager + manager, '0.1'), /exactly once/);
});

const site = planSite(manifest, built, today).document;
const indexes = {'0.1': {entries: {'calendar--default': {}, 'shared--id': {}}}, '0.2': {entries: {'calendar-quick-start--docs': {}, 'shared--id': {}}}};

test('ids the latest line lacks map to the newest other line that has them', () => {
    assert.deepEqual(storyHomes(site, indexes), {'calendar-quick-start--docs': '/calendar/0.2/'});
    const three = {...site, lines: [...site.lines, {line: '1', version: '1.0.0-beta.1', status: 'prerelease', path: '/calendar/1/'}]};
    assert.deepEqual(storyHomes(three, {...indexes, 1: {entries: {'calendar-quick-start--docs': {}, 'new--story': {}}}}),
        {'calendar-quick-start--docs': '/calendar/1/', 'new--story': '/calendar/1/'});
});

/** Where the inline script of a redirect page sends a visit with this query and hash. */
function redirect(page, search, hash = '') {
    // redirectPage writes exactly one inline <script>; slice it out of our own output rather than parse HTML.
    const start = page.indexOf('<script>') + '<script>'.length, code = page.slice(start, page.indexOf('</script>', start));
    let target;
    runInNewContext(code, {URLSearchParams, location: {search, hash, replace: url => { target = url; }}});
    return target;
}

test('the root index.html keeps the query and hash, and opens ids of other lines there', () => {
    const page = redirectPage(site, storyHomes(site, indexes), '');
    assert.equal(redirect(page, ''), '/calendar/0.1/');
    assert.equal(redirect(page, '?path=/story/calendar--default', '#top'), '/calendar/0.1/?path=/story/calendar--default#top');
    assert.equal(redirect(page, '?path=/story/shared--id&args=a:1'), '/calendar/0.1/?path=/story/shared--id&args=a:1');
    assert.equal(redirect(page, '?path=/docs/calendar-quick-start--docs'), '/calendar/0.2/?path=/docs/calendar-quick-start--docs');
    assert.equal(redirect(page, '?path=/story/unknown--id'), '/calendar/0.1/?path=/story/unknown--id');
    assert.equal(redirect(page, '?path=/story/constructor'), '/calendar/0.1/?path=/story/constructor');
    assert.match(page, /<noscript><meta http-equiv="refresh" content="0; url=\/calendar\/0\.1\/"><\/noscript>/);
    assert.match(page, /other versions: <a href="\/calendar\/0\.2\/">0\.2<\/a> \(prerelease\)/);
});

test('the root iframe.html opens the same story in the latest line (old embeds)', () => {
    const page = redirectPage(site, storyHomes(site, indexes), 'iframe.html');
    assert.equal(redirect(page, '?id=calendar--default&viewMode=story'), '/calendar/0.1/iframe.html?id=calendar--default&viewMode=story');
    assert.equal(redirect(page, '?id=calendar-quick-start--docs&viewMode=docs'), '/calendar/0.2/iframe.html?id=calendar-quick-start--docs&viewMode=docs');
});

test('ids are embedded as data: markup in an id cannot close the script', () => {
    const page = redirectPage(site, {'</script><script>alert(1)//': '/calendar/0.2/'}, '');
    assert.equal(page.split('</script>').length - 1, 1);
    assert.equal(redirect(page, '?id=</script><script>alert(1)//'), '/calendar/0.2/?id=</script><script>alert(1)//');
});

test('the switcher finds the current line by path and labels prereleases by their id', () => {
    assert.equal(currentLine(site.lines, '/calendar/0.2/')?.line, '0.2');
    assert.equal(currentLine(site.lines, '/calendar/0.1/index.html')?.line, '0.1');
    assert.equal(currentLine(site.lines, '/calendar/0.1')?.line, '0.1');
    assert.equal(currentLine(site.lines, '/calendar/0.10/'), undefined);
    assert.equal(prereleaseLabel('0.2.0-alpha.2'), 'alpha');
    assert.equal(prereleaseLabel('1.0.0-rc.1'), 'rc');
    assert.equal(prereleaseLabel('0.3.0'), 'pre');
});

test('pages.yml: least privilege, no untrusted event fields in run lines, deploys only from main', () => {
    const workflow = read('.github/workflows/pages.yml');
    const job = name => {
        const from = workflow.indexOf(`\n  ${name}:\n`);
        assert.ok(from >= 0, name);
        const rest = workflow.slice(from + 1), next = rest.slice(1).search(/\n {2}[a-z-]+:\n/);
        return next < 0 ? rest : rest.slice(0, next + 1);
    };
    const build = job('build'), deploy = job('deploy');
    assert.match(build, /permissions:\n {6}contents: read\n {4}steps:/);
    assert.doesNotMatch(build, /pages: write|id-token: write|actions: write|upload-pages-artifact|delete-artifact/);
    assert.match(build, /persist-credentials: false/);
    assert.match(deploy, /if: github\.event_name != 'pull_request' && github\.ref == 'refs\/heads\/main'/);
    assert.match(deploy, /pages: write/);
    assert.match(deploy, /id-token: write/);
    assert.doesNotMatch(deploy, /\n {8}run:|- run:|actions\/checkout/);
    for (const line of workflow.split('\n').filter(text => /^\s*(?:- )?run:/.test(text))) assert.doesNotMatch(line, /\$\{\{/, line);
    assert.doesNotMatch(workflow, /head_ref|pull_request\.title|pull_request\.body|\.head\.label|workflow_run\.head/);
    assert.match(workflow, /node --test scripts\/pages\/\*\.checks\.mjs/);
});

test('pages.yml pins every action by its full commit SHA with the release in a comment', () => {
    const uses = [...read('.github/workflows/pages.yml').matchAll(/^ +(?:- )?uses: (.*)$/gm)].map(match => match[1]);
    assert.ok(uses.length, 'pages.yml uses actions');
    for (const action of uses) assert.match(action, /^[\w.-]+\/[\w.-]+@[0-9a-f]{40} # v\d+\.\d+\.\d+$/, action);
});

test('pages.yml redeploys main after each successful Release run, whose tag and GitHub Release start no workflow', () => {
    const workflow = read('.github/workflows/pages.yml');
    const on = workflow.slice(workflow.indexOf('\non:\n'), workflow.indexOf('\npermissions:'));
    assert.match(on, /\n {2}push:\n {4}branches: \[main\]\n/);
    assert.match(on, /\n {2}workflow_run:\n {4}workflows: \[Release\]\n {4}types: \[completed\]\n/);
    // workflow_run names the workflow, not its file: renaming Release would silently stop the redeploys.
    assert.match(read('.github/workflows/release.yml'), /^name: Release$/m);
    assert.match(workflow, /\n {2}build:\n(?: {4}#.*\n| {4}name: .*\n)* {4}if: github\.event_name != 'workflow_run' \|\| github\.event\.workflow_run\.conclusion == 'success'\n/);
    // Runs on main deploy in the one 'pages' group (on workflow_run github.ref is the default branch); a pull request or a
    // manual build of another branch gets a group of its own, so cancel-in-progress never cancels a deploy.
    assert.match(workflow, /group: \$\{\{ github\.event_name == 'pull_request' && format\('pages-pr-\{0\}', github\.event\.pull_request\.number\) \|\| \(github\.ref == 'refs\/heads\/main' && 'pages'\) \|\| format\('pages-build-\{0\}', github\.ref\) \}\}/);
});
