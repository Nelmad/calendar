// Pure parts of the versioned Storybook site (https://nelmad.github.io/calendar/): one Storybook per release line side
// by side, a version switcher in each manager and root redirects to the line of the npm `latest` dist-tag. The commands
// that build and write the site are in assemble.mjs; checks in site.checks.mjs.

const semver = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z.-]+)?$/;
const lineName = /^(?:0\.(?:0|[1-9]\d*)|[1-9]\d*)$/;
const tagName = /^v(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?$/;
/** The anchor of the injection: the manager globals (`__STORYBOOK_API__`, `__REACT__`) load first in a Storybook 8 build. */
const managerGlobals = "import './sb-manager/globals-runtime.js';";
export const switcherFile = 'version-switcher.js';
export const versionsFile = 'versions.json';

function parse(version) {
    const match = semver.exec(String(version));
    if (!match) throw new Error(`${JSON.stringify(version)} is not a semver version`);
    return {major: Number(match[1]), minor: Number(match[2]), prerelease: match[4]};
}

/** The release line of a version: semver breaks on the minor before 1.0 (0.1 → 0.2) and on the major after it. */
export function lineOf(version) {
    const {major, minor} = parse(version);
    return major === 0 ? `0.${minor}` : String(major);
}

export const isPrerelease = version => parse(version).prerelease !== undefined;

const compareLines = (a, b) => {
    const [aMajor, aMinor = 0] = a.split('.').map(Number), [bMajor, bMinor = 0] = b.split('.').map(Number);
    return aMajor - bMajor || aMinor - bMinor;
};

/**
 * scripts/pages/versions.json: the lines the site shows, oldest first. `ref` is the tag a line is built from, or `HEAD`
 * for the one line built from the deployed commit; `scripts` are the npm scripts that build its Storybook, in order, the
 * last one given the output directory (the stories of 0.2 import the built package, those of 0.1 its sources). Names are
 * checked strictly because they become paths, git refs and commands.
 */
export function readManifest(manifest) {
    const {package: name, basePath, lines} = manifest ?? {};
    if (typeof name !== 'string' || !/^(?:@[a-z0-9-]+\/)?[a-z0-9][a-z0-9._-]*$/.test(name)) throw new Error(`versions.json: package ${JSON.stringify(name)} is not an npm package name`);
    if (typeof basePath !== 'string' || !/^\/(?:[A-Za-z0-9._-]+\/)*$/.test(basePath)) throw new Error(`versions.json: basePath ${JSON.stringify(basePath)} must start and end with "/"`);
    if (!Array.isArray(lines) || lines.length === 0) throw new Error('versions.json: lines must list at least one line');
    const seen = new Set();
    for (const entry of lines) {
        if (!lineName.test(entry?.line ?? '')) throw new Error(`versions.json: line ${JSON.stringify(entry?.line)} must be 0.<minor> or <major>`);
        if (seen.has(entry.line)) throw new Error(`versions.json: line ${entry.line} is listed twice`);
        seen.add(entry.line);
        if (entry.ref !== 'HEAD' && !tagName.test(entry.ref ?? '')) throw new Error(`versions.json: line ${entry.line} ref ${JSON.stringify(entry.ref)} must be a v<semver> tag or HEAD`);
        if (!Array.isArray(entry.scripts) || entry.scripts.length === 0 || !entry.scripts.every(script => typeof script === 'string' && /^[A-Za-z0-9][A-Za-z0-9:_-]*$/.test(script))) {
            throw new Error(`versions.json: line ${entry.line} scripts must list the npm scripts that build its Storybook`);
        }
    }
    const head = lines.filter(entry => entry.ref === 'HEAD');
    if (head.length !== 1) throw new Error(`versions.json: exactly one line is built from HEAD (the deployed commit), found ${head.length}`);
    return {
        package: name,
        basePath,
        lines: [...lines].sort((a, b) => compareLines(a.line, b.line)).map(({line, ref, scripts}) => ({line, ref, scripts, path: `${basePath}${line}/`})),
    };
}

/** `npm view <package> dist-tags versions --json`; npm prints `versions` as a string when only one is published. */
export function readRegistry(output) {
    const {'dist-tags': distTags, versions} = typeof output === 'string' ? JSON.parse(output) : output;
    if (typeof distTags?.latest !== 'string') throw new Error('the npm registry reports no latest dist-tag');
    return {latest: distTags.latest, versions: [versions ?? []].flat()};
}

/**
 * versions.json of the site. `built` maps each line to the package version it was built from (package.json of its ref).
 * A line is stable once npm has a non-prerelease version in it, a prerelease line until then. The root redirects to the
 * line of the npm `latest` dist-tag, so a latest the manifest does not list fails the build instead of redirecting
 * somewhere else; so does a ref whose package version belongs to another line.
 */
export function planSite(manifest, built, registry) {
    const warnings = [];
    const latest = lineOf(registry.latest);
    if (!manifest.lines.some(entry => entry.line === latest)) {
        throw new Error(`npm latest is ${registry.latest} (line ${latest}), which scripts/pages/versions.json does not list; add that line before deploying`);
    }
    const lines = manifest.lines.map(entry => {
        const version = built[entry.line];
        if (version === undefined) throw new Error(`no version is known for line ${entry.line}`);
        if (lineOf(version) !== entry.line) throw new Error(`line ${entry.line} (${entry.ref}) has version ${version}, which belongs to line ${lineOf(version)}`);
        if (entry.ref !== 'HEAD' && entry.ref !== `v${version}`) throw new Error(`tag ${entry.ref} has version ${version} in package.json`);
        const stable = registry.versions.filter(published => !isPrerelease(published) && lineOf(published) === entry.line);
        const newest = stable.sort(compareVersions).at(-1);
        if (entry.ref !== 'HEAD' && newest && compareVersions(newest, version) > 0) {
            warnings.push(`npm has ${newest} in line ${entry.line}, but versions.json builds ${entry.ref}`);
        }
        return {line: entry.line, version, status: stable.length > 0 ? 'stable' : 'prerelease', path: entry.path};
    });
    return {document: {package: manifest.package, latest, lines}, warnings};
}

function compareVersions(a, b) {
    const left = semver.exec(a), right = semver.exec(b);
    for (let index = 1; index <= 3; index += 1) {
        const difference = Number(left[index]) - Number(right[index]);
        if (difference) return difference;
    }
    // A prerelease sorts before its release; two prereleases compare as text, which is enough for a warning.
    if (left[4] === right[4]) return 0;
    if (left[4] === undefined) return 1;
    if (right[4] === undefined) return -1;
    return left[4] < right[4] ? -1 : 1;
}

/**
 * The manager index.html of one line with the switcher imported right after the manager globals, so it registers its
 * toolbar tool before the addons and the manager runtime load. Only the manager is changed: the preview (iframe.html)
 * and every built asset stay as the line's own sources built them.
 */
export function injectSwitcher(html, line) {
    const statement = `import '../${switcherFile}';`;
    if (html.includes(statement)) return html;
    const at = html.indexOf(managerGlobals);
    if (at < 0 || html.indexOf(managerGlobals, at + 1) >= 0) {
        throw new Error(`${line}/index.html does not import the Storybook manager globals exactly once (${managerGlobals}); the switcher needs a Storybook 8 manager`);
    }
    const end = at + managerGlobals.length, indent = /[ \t]*$/.exec(html.slice(0, at))[0];
    return `${html.slice(0, end)}\n${indent}${statement}${html.slice(end)}`;
}

/**
 * Story and docs ids that the latest line lacks, mapped to the newest other line that has them: a root link to an id of
 * another line (`?path=/story/<id>`, `iframe.html?id=<id>`) still opens it there once `latest` moves on.
 */
export function storyHomes(document, indexes) {
    const ids = line => Object.keys(indexes[line]?.entries ?? {});
    const latest = new Set(ids(document.latest)), homes = {};
    for (const {line, path} of [...document.lines].reverse()) {
        if (line === document.latest) continue;
        for (const id of ids(line)) if (!latest.has(id) && !Object.hasOwn(homes, id)) homes[id] = path;
    }
    return homes;
}

const html = text => String(text).replace(/[&<>"']/g, char => `&#${char.charCodeAt(0)};`);
const script = value => JSON.stringify(value).replace(/[<>&\u2028\u2029]/g, char => `\\u${char.charCodeAt(0).toString(16).padStart(4, '0')}`);

/**
 * The root index.html (`file` '') or iframe.html (`file` 'iframe.html'): a redirect to the same file of the latest line
 * that keeps the query and the hash, so /calendar/?path=/story/<id> and old /calendar/iframe.html?id=<id> embeds land on
 * the same story. Without JavaScript a meta refresh opens the latest line's root.
 */
export function redirectPage(document, homes, file) {
    const latest = document.lines.find(entry => entry.line === document.latest);
    const others = document.lines.filter(entry => entry !== latest).map(entry => `<a href="${html(entry.path)}">${html(entry.line)}</a>${entry.status === 'prerelease' ? ' (prerelease)' : ''}`);
    return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${html(document.package)} Storybook</title>
<script>
(function (latest, homes, file) {
    var query = new URLSearchParams(location.search);
    var id = query.get('id') || (/^\\/(?:story|docs)\\/([^/?#]+)/.exec(query.get('path') || '') || [])[1];
    var line = id && Object.prototype.hasOwnProperty.call(homes, id) ? homes[id] : latest;
    location.replace(line + file + location.search + location.hash);
})(${script(latest.path)}, ${script(homes)}, ${script(file)});
</script>
<noscript><meta http-equiv="refresh" content="0; url=${html(latest.path)}"></noscript>
</head>
<body>
<p>Opening the <a href="${html(latest.path)}">${html(document.package)} ${html(latest.line)} Storybook</a>${others.length ? `; other versions: ${others.join(', ')}` : ''}.</p>
</body>
</html>
`;
}
