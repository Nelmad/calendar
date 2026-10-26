import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join, relative, resolve} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import ts from 'typescript';

// Docs gate (spec §18, plan T14): EN/RU parity, API coverage against the published
// declarations, tested code blocks, no removed or unavailable API presented as usable,
// relative links. `--output <file>` writes the parity checklist for the CI run report.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const at = path => resolve(root, path);
const read = path => readFileSync(at(path), 'utf8');
const hash = path => createHash('sha256').update(readFileSync(at(path))).digest('hex');
const outputIndex = process.argv.indexOf('--output');
const output = outputIndex > 0 ? resolve(process.argv[outputIndex + 1] ?? '') : undefined;
if (!existsSync(at('dist/index.d.ts'))) throw new Error('dist/index.d.ts is missing: run npm run build first');

const pairs = [
    {kind: 'readme', en: 'README.md', ru: 'README.ru.md'},
    {kind: 'api', en: 'docs/api.md', ru: 'docs/api.ru.md'},
    {kind: 'migration', en: 'docs/migration-0.1-to-0.2.md', ru: 'docs/migration-0.1-to-0.2.ru.md'},
];
const docs = pairs.flatMap(pair => [pair.en, pair.ru]);
const linkedDocs = [...docs, 'CHANGELOG.md', ...['vite', 'next'].flatMap(kind => [`examples/${kind}/README.md`, `examples/${kind}/README.ru.md`])];
// Sections where props/exports outside the prerelease may be named, always as unavailable.
const unavailableSections = {readme: ['limitations'], api: ['unavailable'], migration: ['not-yet']};
// Sections where removed 0.1 API may be named, always as removed.
const removedSections = {readme: ['migration'], api: [], migration: null};
const removed = ['events', 'CalendarEvent', 'CalendarEventVariant', 'utcOffset', 'timezone', 'onEventPress', 'onEventEdit', 'onEventDelete',
    'SeriesActionScope', 'getMonthGridRange', 'getMonthGridWeeks', 'buildWeekLayout', 'formatEventTime', 'EventSegment', 'WeekLayout',
    'CalendarSkeleton', 'CalendarSkeletonProps', 'CalendarLabels', 'defaultLabels', 'defaultTheme', 'defaultPalette', 'defaultOverdueColor',
    'defaultCriticalColor', 'defaultProgressBarColor', 'DEFAULT_LOCALE', 'VariantColor', 'VariantPalette', 'isFetching', 'palette', 'labels',
    'overdueColor', 'criticalColor', 'progressBarColor', 'dayjs', '@nelmad/calendar/tokens.css'];
// Values planned for later prereleases that are not props (neutralTheme shipped with T18; none are pending now).
const futureExports = [];

/** The published surface, read with the TypeScript checker from dist/index.d.ts. */
function surface() {
    const dts = read('dist/index.d.ts');
    const exports = [...dts.matchAll(/^export declare (?:function|const|type) (\w+)/gm)].map(match => match[1]);
    // The props typed as unavailable (`?: never`): the published list of later props.
    const later = JSON.parse(/declare const laterProps: readonly (\[[^\]]*\]);/.exec(dts)[1]);
    const layouts = JSON.parse(/declare const surfaceLayouts: readonly (\[[^\]]*\]);/.exec(dts)[1]);
    const version = JSON.parse(read('package.json')).version;
    const temp = mkdtempSync(join(tmpdir(), 'nelmad-calendar-docs-'));
    try {
        const probe = join(temp, 'probe.ts');
        writeFileSync(probe, [`import type {CalendarProps, CalendarMessages, CalendarCSSVariable, CalendarThemeTokens} from ${JSON.stringify(at('dist/index.js'))};`,
            'export type Props = keyof CalendarProps;', 'export type Messages = keyof CalendarMessages;', 'export type Variables = CalendarCSSVariable;',
            'export type Tokens = {[G in keyof CalendarThemeTokens]-?: `${G & string}.${keyof NonNullable<CalendarThemeTokens[G]> & string}`}[keyof CalendarThemeTokens];', ''].join('\n'));
        const program = ts.createProgram([probe], {strict: true, noEmit: true, moduleResolution: ts.ModuleResolutionKind.Bundler, module: ts.ModuleKind.ESNext,
            target: ts.ScriptTarget.ES2022, skipLibCheck: true, types: []});
        const checker = program.getTypeChecker(), file = program.getSourceFile(probe);
        const errors = ts.getPreEmitDiagnostics(program);
        if (errors.length) throw new Error(ts.formatDiagnostics(errors, {getCanonicalFileName: name => name, getCurrentDirectory: () => root, getNewLine: () => '\n'}));
        const literals = name => {
            const node = file.statements.find(statement => ts.isTypeAliasDeclaration(statement) && statement.name.text === name);
            const type = checker.getTypeAtLocation(node.name);
            return (type.isUnion() ? type.types : [type]).map(member => member.value).filter(value => typeof value === 'string').sort();
        };
        const allProps = literals('Props'), props = allProps.filter(name => !later.includes(name));
        if (later.some(name => !allProps.includes(name))) throw new Error(`laterProps names a prop that CalendarProps lacks: ${later}`);
        return {version, exports, props, layouts, allProps, excluded: allProps.filter(name => later.includes(name)),
            messages: literals('Messages'), variables: literals('Variables'), tokens: literals('Tokens')};
    } finally {
        rmSync(temp, {recursive: true, force: true});
    }
}

/** A small Markdown reader: explicit anchors, headings, fenced code, inline code and links. */
function parse(path) {
    const text = read(path), lines = text.split('\n');
    const sections = [], blocks = [], spans = [], links = [], anchors = new Set(), headings = [];
    let section = null, fence = null, pendingAnchor = null, pendingFile = null;
    for (const [index, line] of lines.entries()) {
        if (fence) {
            if (line === '```') { blocks.push({...fence, section}); fence = null; } else fence.code += `${line}\n`;
            continue;
        }
        const open = /^```(\w*)$/.exec(line);
        if (open) { fence = {lang: open[1], code: '', line: index + 1, file: pendingFile}; pendingFile = null; continue; }
        const file = /^<!-- file: (\S+) -->$/.exec(line);
        if (file) { pendingFile = file[1]; continue; }
        pendingFile = null;
        const anchor = /^<a id="([^"]+)"><\/a>$/.exec(line);
        if (anchor) { anchors.add(anchor[1]); pendingAnchor = anchor[1]; continue; }
        const heading = /^(#{1,6}) (.+)$/.exec(line);
        if (heading) {
            const level = heading[1].length;
            headings.push({level, text: heading[2], anchor: pendingAnchor, line: index + 1});
            if (level >= 2) {
                sections.push({id: pendingAnchor, level, title: heading[2], line: index + 1});
                if (level === 2) section = pendingAnchor;
            }
            pendingAnchor = null;
            continue;
        }
        if (line.trim()) pendingAnchor = null;
        const prose = line.replace(/`[^`]*`/g, match => { spans.push({code: match.slice(1, -1), section, line: index + 1}); return ''; });
        for (const match of prose.matchAll(/\[[^\]]*\]\(([^)\s]+)\)|<a href="([^"]+)"/g)) links.push({target: match[1] ?? match[2], line: index + 1});
    }
    for (const heading of headings) anchors.add(slug(heading.text));
    return {path, text, lines, sections, blocks, spans, links, anchors};
}
/** GitHub heading anchors, used only to validate links into documents without explicit IDs. */
function slug(text) {
    let plain = text.toLowerCase(), previous;
    // Repeat until nothing changes: one pass over nested input such as '<<a>b>' can leave a tag behind.
    do { previous = plain; plain = plain.replace(/<[^>]*>/g, ''); } while (plain !== previous);
    return plain.replace(/[^\p{L}\p{N}\s_-]/gu, '').trim().replace(/\s/g, '-');
}
/** Names a backtick span refers to: the whole span or its leading identifier (`name=`, `name(`). */
function spanNames(code) {
    const names = new Set([code]);
    const leading = /^([A-Za-z@][\w./@-]*)(?=$|[=(<{?:\s])/.exec(code);
    if (leading) names.add(leading[1]);
    return names;
}

const api = surface();
const parsed = Object.fromEntries(docs.map(path => [path, parse(path)]));
const checks = [];
function check(name, run) {
    const failures = [];
    run(message => failures.push(message));
    checks.push({name, outcome: failures.length ? 'fail' : 'pass', failures});
}
const fileOf = path => path.split('/').pop();

check('mutual-language-links', fail => {
    for (const pair of pairs) for (const [from, to] of [[pair.en, pair.ru], [pair.ru, pair.en]]) {
        const head = parsed[from].lines.slice(0, 5).join('\n');
        if (!head.includes(`](${fileOf(to)})`)) fail(`${from}: the first lines must link to ${fileOf(to)}`);
    }
});
check('section-parity', fail => {
    for (const pair of pairs) {
        const en = parsed[pair.en], ru = parsed[pair.ru];
        for (const doc of [en, ru]) for (const section of doc.sections) if (!section.id) fail(`${doc.path}:${section.line}: heading "${section.title}" has no <a id> anchor`);
        const shape = doc => doc.sections.map(section => `${section.level}:${section.id}`).join('\n');
        if (shape(en) !== shape(ru)) fail(`${pair.en} and ${pair.ru}: section anchors or levels differ`);
        const ids = doc => doc.sections.map(section => section.id).filter(Boolean);
        for (const doc of [en, ru]) if (new Set(ids(doc)).size !== ids(doc).length) fail(`${doc.path}: duplicate section anchors`);
    }
});
check('code-block-parity', fail => {
    for (const pair of pairs) {
        const en = parsed[pair.en].blocks, ru = parsed[pair.ru].blocks;
        if (en.length !== ru.length) fail(`${pair.en} has ${en.length} code blocks, ${pair.ru} has ${ru.length}`);
        for (const [index, block] of en.entries()) {
            const other = ru[index];
            if (other && (block.lang !== other.lang || block.code !== other.code || block.file !== other.file || block.section !== other.section)) {
                fail(`${pair.en}:${block.line} and ${pair.ru}:${other.line}: code block ${index + 1} differs`);
            }
        }
    }
});
const known = new Set([...api.props, ...api.excluded, ...api.exports, ...futureExports, ...removed]);
const documented = doc => [...new Set(doc.spans.flatMap(span => [...spanNames(span.code)]).filter(name => known.has(name)))].sort();
check('documented-name-parity', fail => {
    for (const pair of pairs) {
        const en = documented(parsed[pair.en]), ru = documented(parsed[pair.ru]);
        const missing = (a, b) => a.filter(name => !b.includes(name));
        if (missing(en, ru).length) fail(`${pair.ru} does not mention: ${missing(en, ru).join(', ')}`);
        if (missing(ru, en).length) fail(`${pair.en} does not mention: ${missing(ru, en).join(', ')}`);
    }
});
check('api-coverage', fail => {
    for (const path of [pairs[1].en, pairs[1].ru]) {
        const doc = parsed[path], sectionTitle = id => doc.sections.find(section => section.id === id)?.title;
        for (const name of api.exports) if (sectionTitle(`export-${name.toLowerCase()}`) !== `\`${name}\``) fail(`${path}: export ${name} needs a section #export-${name.toLowerCase()} titled \`${name}\``);
        for (const name of api.props) if (sectionTitle(`prop-${name.toLowerCase()}`) !== `\`${name}\``) fail(`${path}: prop ${name} needs a section #prop-${name.toLowerCase()} titled \`${name}\``);
        for (const section of doc.sections) {
            const [, kind, id] = /^(export|prop)-(.+)$/.exec(section.id ?? '') ?? [];
            const names = kind === 'export' ? api.exports : kind === 'prop' ? api.props : [];
            if (kind && !names.some(name => name.toLowerCase() === id)) fail(`${path}: section #${section.id} documents ${kind} ${id}, which is not in the published surface`);
        }
        const inSection = (id, name) => doc.spans.some(span => span.section === id && spanNames(span.code).has(name));
        for (const name of api.excluded) if (!inSection('unavailable', name)) fail(`${path}: unavailable prop ${name} is missing from #unavailable`);
        for (const name of api.messages) if (!inSection('messages', name)) fail(`${path}: message key ${name} is missing from #messages`);
        for (const name of [...api.variables, ...api.tokens]) if (!inSection('tokens', name)) fail(`${path}: ${name} is missing from #tokens`);
    }
    for (const path of [pairs[0].en, pairs[0].ru]) {
        const names = documented(parsed[path]);
        for (const name of api.exports) if (!names.includes(name)) fail(`${path}: export ${name} is not mentioned`);
        for (const name of api.excluded) if (!parsed[path].spans.some(span => span.section === 'limitations' && spanNames(span.code).has(name))) fail(`${path}: unavailable prop ${name} is missing from #limitations`);
    }
    for (const path of [pairs[2].en, pairs[2].ru]) {
        for (const name of api.excluded) if (!parsed[path].spans.some(span => span.section === 'not-yet' && spanNames(span.code).has(name))) fail(`${path}: unavailable prop ${name} is missing from #not-yet`);
    }
});
check('surface-only', fail => {
    const unavailable = new Set([...api.excluded, ...futureExports]);
    for (const pair of pairs) for (const path of [pair.en, pair.ru]) {
        const doc = parsed[path];
        for (const span of doc.spans) for (const name of spanNames(span.code)) {
            if (unavailable.has(name) && !unavailableSections[pair.kind].includes(span.section)) fail(`${path}:${span.line}: ${name} is not in ${api.version}; name it only in #${unavailableSections[pair.kind].join(', #')}`);
        }
        for (const block of doc.blocks) {
            for (const name of unavailable) if (new RegExp(`(?<![\\w.-])${name}\\s*[=:]`).test(block.code)) fail(`${path}:${block.line}: code uses ${name}, which is not in ${api.version}`);
            for (const match of block.code.matchAll(/\blayout=(?:\{\s*)?["']([^"']*)["']/g)) {
                if (!api.layouts.includes(match[1])) fail(`${path}:${block.line}: code uses layout "${match[1]}", which is not in ${api.version}`);
            }
        }
    }
});
check('no-removed-api-as-usable', fail => {
    for (const pair of pairs) for (const path of [pair.en, pair.ru]) {
        const doc = parsed[path], allowed = removedSections[pair.kind];
        if (allowed) for (const span of doc.spans) for (const name of spanNames(span.code)) {
            if (removed.includes(name) && !allowed.includes(span.section)) fail(`${path}:${span.line}: removed 0.1 API ${name} outside #${allowed.join(', #') || '(none)'}`);
        }
        for (const block of doc.blocks) {
            for (const match of block.code.matchAll(/import\s+(?:type\s+)?\{([^}]*)\}\s+from\s+'@nelmad\/calendar'/g)) {
                for (const raw of match[1].split(',')) {
                    const name = raw.trim().replace(/^type\s+/, '').split(/\s+as\s+/)[0];
                    if (name && !api.exports.includes(name)) fail(`${path}:${block.line}: imports ${name}, which is not a ${api.version} export`);
                }
            }
            for (const match of block.code.matchAll(/'@nelmad\/calendar\/([^'?]+)/g)) if (match[1] !== 'styles.css') fail(`${path}:${block.line}: imports the non-public subpath @nelmad/calendar/${match[1]}`);
            for (const name of ['events', 'utcOffset', 'timezone', 'onEventPress', 'onEventEdit', 'onEventDelete', 'isFetching', 'palette', 'labels']) {
                if (new RegExp(`<Calendar\\b[^>]*\\s${name}=`).test(block.code)) fail(`${path}:${block.line}: passes the removed 0.1 prop ${name}`);
            }
        }
    }
});
check('tested-code-blocks', fail => {
    const required = [
        {doc: pairs[0], file: 'examples/vite/src/Schedule.tsx', section: 'quick-start'},
        {doc: pairs[2], file: 'examples/migration/convert.ts', section: 'conversion'},
    ];
    for (const pair of pairs) for (const path of [pair.en, pair.ru]) for (const block of parsed[path].blocks) {
        if (!block.file) continue;
        if (!existsSync(at(block.file))) fail(`${path}:${block.line}: ${block.file} does not exist`);
        else if (read(block.file) !== block.code) fail(`${path}:${block.line}: code differs from ${block.file}`);
    }
    for (const {doc, file, section} of required) for (const path of [doc.en, doc.ru]) {
        const block = parsed[path].blocks.find(candidate => candidate.file === file);
        if (!block || block.section !== section) fail(`${path}: #${section} must show ${file} with <!-- file: ${file} -->`);
    }
    if (read('examples/vite/src/Schedule.tsx') !== read('examples/next/components/Schedule.tsx')) fail('The Vite and Next.js Schedule quick starts differ');
    if (read('examples/vite/src/Workspace.tsx') !== read('examples/next/components/Workspace.tsx')) fail('The Vite and Next.js Workspace integrations differ');
    const tsc = spawnSync(process.execPath, [at('node_modules/typescript/bin/tsc'), '-p', at('examples/migration/tsconfig.json')], {encoding: 'utf8'});
    if (tsc.status !== 0) fail(`examples/migration does not type-check against dist/index.d.ts:\n${tsc.stdout}${tsc.stderr}`);
});
// The version in package.json is the one the Release workflow publishes, and npm versions are immutable (RELEASING.md):
// the shipped README describes it as published. A prerelease is on the `next` dist-tag, so it is installed by its exact
// version and pinned, because the caret range npm saves by default also accepts later prereleases of the same version.
const prerelease = api.version.includes('-');
const exampleReadmes = ['vite', 'next'].flatMap(kind => [`examples/${kind}/README.md`, `examples/${kind}/README.ru.md`]);
const unpublished = /\bunpublished\b|\bnot (?:yet )?(?:published|on npm|on the registry)\b|\b(?:before|after|until) publication\b|не опубликован|неопубликован|нет в npm|в registry этой версии|до публикации|после публикации/i;
check('version-and-status', fail => {
    for (const path of [pairs[0].en, pairs[0].ru]) {
        const doc = parsed[path];
        if (!doc.text.includes(`npm install @nelmad/calendar@${api.version}`)) fail(`${path}: install command must name ${api.version}`);
        const status = doc.spans.filter(span => span.section === 'status').map(span => span.code);
        if (!status.includes(api.version)) fail(`${path}: #status must name ${api.version}`);
        if (!prerelease) continue;
        const install = doc.spans.filter(span => span.section === 'install').map(span => span.code);
        const pinned = `npm install @nelmad/calendar@${api.version} --save-exact`;
        if (!doc.blocks.some(block => block.section === 'install' && block.code.split('\n').includes(pinned))) fail(`${path}: #install must pin the prerelease with \`${pinned}\``);
        if (!status.includes('next') || !install.includes('next')) fail(`${path}: #status and #install must name the \`next\` dist-tag of ${api.version}`);
        if (!install.includes('latest')) fail(`${path}: #install must say what \`latest\` installs instead of ${api.version}`);
        if (!install.includes(`^${api.version}`)) fail(`${path}: #install must explain the caret range ^${api.version} that npm saves without --save-exact`);
    }
    for (const path of [...docs, ...exampleReadmes]) read(path).split('\n').forEach((line, index) => {
        if (unpublished.test(line)) fail(`${path}:${index + 1}: ${api.version} is the published version; do not describe it as unpublished or as installable only from an archive`);
    });
    for (const path of [pairs[1].en, pairs[1].ru]) if (!parsed[path].lines[0].includes(api.version)) fail(`${path}: title must name ${api.version}`);
    const changelog = read('CHANGELOG.md');
    const heading = changelog.split('\n').find(line => line.startsWith(`## [${api.version}]`));
    if (!heading) fail(`CHANGELOG.md has no ${api.version} entry`);
    // RELEASING.md step 1: the release moves its entry from "Unreleased" to a dated heading.
    else if (!/^## \[[^\]]+\] - \d{4}-\d{2}-\d{2}$/.test(heading)) fail(`CHANGELOG.md: "${heading}" must be dated: ## [${api.version}] - YYYY-MM-DD`);
});
// alpha.2 (T19): the prerelease limitations, the integrations example and the §10.4 allowed/not-allowed slot examples.
check('prerelease-guides', fail => {
    for (const path of [pairs[0].en, pairs[0].ru]) {
        const limitations = parsed[path].spans.filter(span => span.section === 'limitations').map(span => span.code);
        for (const name of [api.version, 'az-Arab']) if (!limitations.includes(name)) fail(`${path}: #limitations must name ${name}`);
        if (!parsed[path].spans.some(span => span.section === 'install' && span.code === '/workspace')) fail(`${path}: #install must point to the /workspace integrations example`);
    }
    for (const path of [pairs[1].en, pairs[1].ru]) {
        const blocks = parsed[path].blocks.filter(block => block.section === 'props' && /\/\/ Allowed:/.test(block.code) && /\/\/ Not allowed:/.test(block.code));
        if (!blocks.some(block => /renderItem=\{[^\n]*<(?:a|button)\b/.test(block.code))) fail(`${path}: the slot rules need an allowed/not-allowed example with interactive content marked as not allowed`);
    }
    for (const kind of ['vite', 'next']) for (const readme of ['README.md', 'README.ru.md']) {
        if (!read(`examples/${kind}/${readme}`).includes('Workspace.tsx')) fail(`examples/${kind}/${readme}: describe the /workspace route (Workspace.tsx)`);
    }
});
// T18-V1-01: the example READMEs describe the current slice; a shipped prop or export is never announced as future work there.
check('examples-current-slice', fail => {
    const shipped = new Set([...api.props, ...api.exports]), future = /\b(?:later|not yet|arrives?|coming|upcoming)\b|позже|появ(?:ится|ятся)|ещё нет|пока нет/i;
    for (const kind of ['vite', 'next']) for (const readme of ['README.md', 'README.ru.md']) {
        const path = `examples/${kind}/${readme}`;
        read(path).split('\n').forEach((line, index) => {
            if (!future.test(line)) return;
            for (const [, code] of line.matchAll(/`([^`]+)`/g)) for (const name of spanNames(code)) {
                if (shipped.has(name)) fail(`${path}:${index + 1}: ${name} ships in ${api.version}; do not describe it as future work`);
            }
        });
    }
});
// Review 2026-10-09-1: the #messages table lists exactly the keys the prerelease renders or announces. The keys are read
// from the message calls of the SDK sources; a key rendered only for an API outside the prerelease is named here.
const laterOnlyMessages = {selectedStateLabel: 'rendered only for an accepted selection (beta.1)'};
function renderedMessages() {
    const files = [], visit = directory => {
        for (const entry of readdirSync(at(directory), {withFileTypes: true})) {
            const path = `${directory}/${entry.name}`;
            if (entry.isDirectory()) { if (entry.name !== '__tests__') visit(path); } else if (/\.tsx?$/.test(entry.name) && !/\.d\.ts$/.test(entry.name)) files.push(path);
        }
    };
    visit('src/v02'); files.push('src/Calendar.tsx');
    const keys = new Set(api.messages), used = new Set();
    for (const path of files.filter(path => !/core\/(?:catalogs|messages)\.ts$/.test(path))) {
        const source = read(path);
        for (const match of source.matchAll(/\bmessage\(([^;]{0,160})/g)) for (const [, key] of match[1].matchAll(/'(\w+)'/g)) if (keys.has(key)) used.add(key);
        for (const [, key] of source.matchAll(/\bmessages\.(\w+)/g)) if (keys.has(key)) used.add(key);
    }
    return [...used].filter(key => !(key in laterOnlyMessages)).sort();
}
check('displayed-messages', fail => {
    const rendered = renderedMessages();
    for (const path of [pairs[1].en, pairs[1].ru]) {
        const doc = parsed[path], start = doc.lines.findIndex(line => line === '<a id="messages"></a>');
        const end = doc.lines.findIndex((line, index) => index > start && line.startsWith('<a id='));
        const section = doc.lines.slice(start, end), table = section.map(line => /^\| `(\w+)` \|/.exec(line)?.[1]).filter(Boolean).sort();
        for (const key of rendered) if (!table.includes(key)) fail(`${path}: ${key} is rendered in ${api.version} but missing from the #messages table`);
        for (const key of table) if (!rendered.includes(key)) fail(`${path}: ${key} is in the #messages table but no SDK source renders it`);
        const other = Number(/(?:The other|Остальные) (\d+) (?:keys|ключ)/.exec(section.join('\n'))?.[1]);
        if (other !== api.messages.length - table.length) fail(`${path}: the #messages section names ${other} other keys, expected ${api.messages.length - table.length}`);
        const listed = section.join('\n').split(/(?:The other|Остальные) \d+/)[1] ?? '';
        for (const key of table) if (new RegExp('`' + key + '`').test(listed)) fail(`${path}: ${key} is displayed but also listed as not displayed`);
    }
});
// Review 2026-10-09-1: every count of accepted time-zone identifiers in the guides is the length of the shipped list.
const {acceptedTimeZoneIdentifiers} = await import(pathToFileURL(at('dist/v02/core/timeZones.generated.js')).href);
check('time-zone-count', fail => {
    for (const path of [pairs[0].en, pairs[0].ru, pairs[1].en, pairs[1].ru]) {
        const counts = [...parsed[path].text.matchAll(/(\d+) (?:primary )?identifiers/g)].map(match => Number(match[1]));
        if (!counts.length) fail(`${path}: names no count of accepted time-zone identifiers`);
        for (const count of counts) if (count !== acceptedTimeZoneIdentifiers.length) fail(`${path}: ${count} identifiers, the package accepts ${acceptedTimeZoneIdentifiers.length} (UTC included)`);
        // UTC is one of them: "UTC plus/and N" would read as N + 1.
        if (/`UTC` (?:plus|and|и) (?:the )?\d+/.test(parsed[path].text)) fail(`${path}: UTC is counted in the accepted identifiers; do not add it to the count`);
    }
    if (!acceptedTimeZoneIdentifiers.includes('UTC')) fail('the accepted list has no UTC');
});
const linkTargets = new Map();
check('relative-links', fail => {
    for (const path of linkedDocs) {
        const doc = parsed[path] ?? parse(path);
        for (const {target, line} of doc.links) {
            if (/^(?:[a-z]+:)?\/\//i.test(target) || /^mailto:/i.test(target)) continue;
            const [file, fragment] = target.split('#');
            const resolved = file ? resolve(dirname(at(path)), decodeURIComponent(file)) : at(path);
            const label = `${path}:${line}: ${target}`;
            if (!resolved.startsWith(root) || !existsSync(resolved)) { fail(`${label} does not exist`); continue; }
            linkTargets.set(target, relative(root, resolved));
            if (fragment === undefined || !resolved.endsWith('.md')) continue;
            const targetDoc = parsed[relative(root, resolved)] ?? parse(relative(root, resolved));
            if (!targetDoc.anchors.has(fragment)) fail(`${label}: #${fragment} is not an anchor of ${relative(root, resolved)}`);
        }
    }
});

const report = {
    generatedAt: new Date().toISOString(), node: process.version, typescript: ts.version, version: api.version,
    scope: `EN/RU documentation parity and API coverage of the published ${api.version} declarations (spec §18).`,
    sourceHashes: Object.fromEntries([...linkedDocs, 'dist/index.d.ts', 'examples/vite/src/Schedule.tsx', 'examples/next/components/Schedule.tsx',
        'examples/next/app/page.tsx', 'examples/vite/src/Workspace.tsx', 'examples/next/components/Workspace.tsx', 'examples/migration/convert.ts', 'package.json'].map(path => [path, hash(path)])),
    surface: {exports: api.exports, props: api.props, layouts: api.layouts, unavailableProps: api.excluded, messageKeys: api.messages.length, cssVariables: api.variables.length},
    parity: pairs.map(pair => ({
        en: pair.en, ru: pair.ru,
        sections: parsed[pair.en].sections.map((section, index) => ({id: section.id, level: section.level, en: section.title, ru: parsed[pair.ru].sections[index]?.title ?? null})),
        codeBlocks: parsed[pair.en].blocks.length, testedCodeBlocks: parsed[pair.en].blocks.filter(block => block.file).map(block => block.file),
        documentedNames: documented(parsed[pair.en]).length,
    })),
    checks,
    outcome: checks.every(item => item.outcome === 'pass') ? 'pass' : 'fail',
};
for (const item of checks) {
    console.log(`${item.name}: ${item.outcome.toUpperCase()}`);
    for (const failure of item.failures) console.log(`  - ${failure}`);
}
if (output) {
    mkdirSync(dirname(output), {recursive: true});
    writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
    console.log(`checklist: ${relative(root, output)}`);
}
if (report.outcome === 'fail') process.exitCode = 1;
