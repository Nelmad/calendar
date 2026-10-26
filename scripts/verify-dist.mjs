import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync, readdirSync} from 'node:fs';
import {createRequire} from 'node:module';
import {resolve, relative} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createElement} from 'react';
import {renderToString} from 'react-dom/server';
import Input from 'postcss/lib/input';
import tokenize from 'postcss/lib/tokenize';
import ts from 'typescript';
import {transformWithEsbuild} from 'vite';

const root = resolve(import.meta.dirname, '..'), dist = resolve(root, 'dist');
const manifest = JSON.parse(readFileSync(resolve(root, 'package.json')));
const read = path => readFileSync(resolve(dist, path), 'utf8');
const paths = readdirSync(dist, {recursive: true}).filter(path => /\.(?:js|cjs|css|ts|cts)$/.test(path));
// Every file npm publishes, learned as scripts/check-pack.mjs does (without lifecycle scripts, so no build reruns).
const [pack] = JSON.parse(execFileSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], {cwd: root, encoding: 'utf8'}));
const published = pack.files.map(file => file.path).sort();
// Internal task (T23), QA (QA-19, QA-D-1-05) and review (review 2026-10-09-3) IDs stay in the sources. A T and two digits
// before a colon and a digit is the time of an ISO date-time (`${date}T00:00:00Z`), not a task.
const internalNote = /\bT\d{2}\b(?!:\d)|\bQA-[A-Z0-9]|\b[Rr]eview 20\d\d-\d\d/;
const publicValues = ['Calendar', 'classicTheme', 'getCalendarVisibleRange', 'neutralTheme']; // alpha.2 with T18.
// Independent copy of the alpha.2 working slice (src/v02/surface.ts); a milestone changes both deliberately.
const acceptedProps = ['items', 'timeZone', 'anchorDate', 'onNavigate', 'onVisibleRangeChange', 'today', 'locale', 'firstDayOfWeek', 'hourCycle', 'dir',
    'layout', 'mobileBreakpoint', 'agendaPresentation', 'agendaDate', 'onAgendaDateChange', 'dataState', 'onRetryRequest', 'onItemPress', 'sortItems',
    'theme', 'density', 'colorScheme', 'tokens', 'messagesLocale', 'messages', 'className', 'style', 'id', 'aria-label', 'aria-labelledby', 'portalContainer',
    'getItemActions', 'onItemActionRequest', 'sources', 'visibleSourceIds', 'onVisibleSourceIdsChange', 'showSourceSelector',
    'getItemAppearance', 'classNames', 'renderItem', 'renderAgendaItem', 'renderDayHeader', 'renderToolbarContent', 'renderLoading', 'renderEmpty', 'renderError'];
const unavailableProps = ['interactionPolicy', 'selection', 'onSelectionChange', 'onCreateRequest', 'itemMoveStates', 'onItemMoveRequest', 'onItemMoveDraftChange'];
const publicTypes = ['ISODate', 'RFC3339DateTime', 'IanaTimeZone', 'CalendarInterval', 'CalendarItem', 'CalendarDateRange', 'CalendarVisibleRange', 'CalendarWeekday',
    'CalendarVisibleRangeOptions', 'CalendarItemPressRequest', 'CalendarSortContext', 'CalendarDataState', 'CalendarLayout', 'CalendarAgendaPresentation', 'CalendarDensity', 'CalendarColorScheme',
    'CalendarDirection', 'CalendarHourCycle', 'CalendarTheme', 'CalendarThemeTokens', 'CalendarCSSVariable', 'CalendarMessages', 'CalendarAgendaControlProps',
    'CalendarSource', 'CalendarSourceFilterControlProps', 'CalendarItemAction', 'CalendarItemActionRequest', 'CalendarItemActionsProps',
    'CalendarItemAppearance', 'CalendarItemAppearanceContext', 'CalendarResolvedLayout', 'CalendarResolvedAgendaPresentation', 'CalendarItemView', 'CalendarRootState',
    'CalendarDayState', 'CalendarItemSlotContext', 'CalendarMonthItemSlotContext', 'CalendarAgendaItemSlotContext', 'CalendarAgendaState', 'CalendarOverflowState',
    'CalendarToolbarSlotContext', 'CalendarLoadingSlotContext', 'CalendarEmptySlotContext', 'CalendarErrorSlotContext', 'CalendarClassName', 'CalendarClassNames',
    'CalendarDataAttribute', 'CalendarBaseProps', 'CalendarProps'];
assert.deepEqual(Object.keys(manifest.exports).sort(), ['.', './styles.css']);
assert.deepEqual(Object.keys(manifest.peerDependencies).sort(), ['react', 'react-dom']);
assert.deepEqual(manifest.sideEffects, ['**/*.css']);
for (const kind of ['dependencies', 'devDependencies', 'peerDependencies']) assert.ok(!manifest[kind]?.dayjs);
for (const name of ['@internationalized/date', 'react-aria-components', 'react-stately', 'react-aria']) assert.ok(manifest.dependencies[name]);
// QA-05: one react-stately in a consumer install. The SDK enables the Shadow DOM flag in the module React Aria reads,
// so its pin must equal the exact react-stately pin of react-aria and react-aria-components; no separate flags package.
assert.ok(!manifest.dependencies['@react-stately/flags'], '@react-stately/flags resolves its own react-stately');
for (const name of ['react-aria', 'react-aria-components']) {
    const pinned = JSON.parse(readFileSync(createRequire(import.meta.url).resolve(`${name}/package.json`))).dependencies['react-stately'];
    assert.equal(manifest.dependencies['react-stately'], pinned, `react-stately must be pinned like ${name}`);
}
assert.match(manifest.dependencies['react-stately'], /^\d+\.\d+\.\d+$/);
for (const extension of ['js', 'cjs']) assert.match(read(`v02/primitives/runtime.${extension}`), /react-stately\/private\/flags\/flags/);
assert.equal(manifest.exports['.'].import.types, './dist/index.d.ts');
assert.equal(manifest.exports['.'].require.types, './dist/index.d.cts');
assert.deepEqual(manifest.exports['.']['react-server'], {
    import: {types: './dist/index.d.ts', default: './dist/index.react-server.js'},
    require: {types: './dist/index.d.cts', default: './dist/index.react-server.cjs'},
});
for (const extension of ['d.ts', 'd.cts']) {
    const source = read(`index.${extension}`), file = ts.createSourceFile(`index.${extension}`, source, ts.ScriptTarget.Latest, true);
    assert.ok(file.statements.length && !file.parseDiagnostics.length, 'Invalid bundled declarations');
    const visit = node => {
        const specifier = ts.isImportDeclaration(node) || ts.isExportDeclaration(node) ? node.moduleSpecifier
            : ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument) ? node.argument.literal : undefined;
        if (specifier && ts.isStringLiteral(specifier)) assert.equal(specifier.text, 'react', 'Only React types may escape the bundled public contract');
        ts.forEachChild(node, visit);
    };
    visit(file);
    assert.ok(!/dayjs|@internationalized\/date|react-aria|CalendarSkeleton|CalendarEvent|SeriesActionScope/.test(source));
}
// Type-level surface of the bundle: exact exports and exactly the alpha.2 props accepted by
// CalendarProps; every other §5.7 prop is optional never. The probe exists only in memory.
{
    const probePath = resolve(dist, '__surface-probe.ts'), probe = `import type {CalendarProps, CalendarLayout} from './index.js';
type P = CalendarProps<{ticket: number}, {team: string}>;
export type Accepted = {[K in keyof P]-?: [Exclude<P[K], undefined>] extends [never] ? never : K}[keyof P];
export type Unavailable = {[K in keyof P]-?: [Exclude<P[K], undefined>] extends [never] ? K : never}[keyof P];
export type Layouts = CalendarLayout;
export type RequiredLayout = undefined extends P['layout'] ? 'optional' : 'required';
`;
    const options = {target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler, strict: true,
        exactOptionalPropertyTypes: true, skipLibCheck: false, noEmit: true, types: [], lib: ['lib.es2020.d.ts', 'lib.dom.d.ts']};
    const host = ts.createCompilerHost(options), {getSourceFile, fileExists, readFile} = host;
    host.getSourceFile = (name, ...rest) => name === probePath ? ts.createSourceFile(name, probe, ts.ScriptTarget.Latest, true) : getSourceFile.call(host, name, ...rest);
    host.fileExists = name => name === probePath || fileExists.call(host, name);
    host.readFile = name => name === probePath ? probe : readFile.call(host, name);
    const program = ts.createProgram([probePath], options, host), checker = program.getTypeChecker();
    const errors = ts.getPreEmitDiagnostics(program).map(diagnostic => ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'));
    assert.deepEqual(errors, [], 'Bundled declarations must type-check strictly with skipLibCheck=false');
    const index = program.getSourceFile(resolve(dist, 'index.d.ts'));
    const exported = checker.getExportsOfModule(checker.getSymbolAtLocation(index)).map(symbol => symbol.name).sort();
    assert.deepEqual(exported, [...publicValues, ...publicTypes].sort(), 'Bundled declarations export exactly the alpha.2 names');
    const literals = name => {
        const node = program.getSourceFile(probePath).statements.find(statement => ts.isTypeAliasDeclaration(statement) && statement.name.text === name);
        const type = checker.getTypeAtLocation(node.name);
        return (type.isUnion() ? type.types : [type]).map(member => member.isStringLiteral() ? member.value : checker.typeToString(member)).sort();
    };
    assert.deepEqual(literals('Accepted'), [...acceptedProps].sort(), 'CalendarProps accepts exactly the alpha.2 props');
    assert.deepEqual(literals('Unavailable'), [...unavailableProps].sort(), 'Every other reference prop is typed optional never');
    assert.deepEqual(literals('Layouts'), ['auto', 'desktop', 'mobile']);
    assert.deepEqual(literals('RequiredLayout'), ['optional'], 'layout is optional once the default auto is available');
    const source = read('index.d.ts');
    assert.match(source, /declare const neutralTheme: CalendarTheme;/, 'neutralTheme is an opaque preset (T18)');
    // Editor hovers show these comments: internal task and review notes stay in the sources (review 2026-10-09-1).
    assert.doesNotMatch(source, new RegExp(`Private until|${internalNote.source}`), 'Published declarations carry no internal task notes');
}
for (const extension of ['js', 'cjs']) {
    assert.match(read(`Calendar.client.${extension}`), /^['"]use client['"];/);
    assert.match(read(`index.react-server.${extension}`), /Calendar\.client\./);
    assert.doesNotMatch(read(`Calendar.${extension}`), /use client/);
    assert.doesNotMatch(read(`index.${extension}`), /use client/);
}
const css = read('styles.css');
assert.match(css, /:where\(\.nc-theme\)/);
assert.match(css, /--nelmad-calendar-color-surface/);
assert.match(css, /\.nc-agenda-popover/);
assert.doesNotMatch(css, /@import|url\s*\(|--tc-/i);
assert.deepEqual(paths.filter(path => path.endsWith('.css')), ['styles.css']);
// The comments of src/v02/styles.css are maintainer notes: the published copy has none (PostCSS tokens, so strings and
// url() are not mistaken for one) and the same rules (equal esbuild minifications, legal comments dropped from both).
{
    const tokens = tokenize(new Input(css)), comments = [];
    while (!tokens.endOfFile()) { const token = tokens.nextToken(); if (token?.[0] === 'comment') comments.push(token[1].slice(0, 80)); }
    assert.deepEqual(comments, [], 'dist/styles.css carries no comments');
    const minified = async source => (await transformWithEsbuild(source, 'styles.css', {minify: true, legalComments: 'none'})).code;
    assert.equal(await minified(css), await minified(readFileSync(resolve(root, 'src/v02/styles.css'), 'utf8')), 'dist/styles.css keeps the rules of src/v02/styles.css');
}
// The package holds exactly the declarations package.json references (types and the types conditions of exports).
const typeTargets = value => typeof value === 'string' ? (/\.d\.[cm]?ts$/.test(value) ? [value] : [])
    : Object.values(value ?? {}).flatMap(typeTargets);
const declarations = [...new Set([manifest.types, ...typeTargets(manifest.exports)].map(path => path.replace(/^\.\//, '')))].sort();
assert.deepEqual(published.filter(path => /\.d\.[cm]?ts$/.test(path)), declarations, 'Only referenced declarations are published');
assert.deepEqual(declarations, ['dist/index.d.cts', 'dist/index.d.ts']);
// No published file (code, declarations, styles, docs, package.json) names an internal task, QA or review note.
const notes = published.flatMap(path => readFileSync(resolve(root, path), 'utf8').split('\n')
    .flatMap((line, index) => internalNote.test(line) ? [`${path}:${index + 1}: ${line.trim().slice(0, 120)}`] : []));
assert.deepEqual(notes, [], 'Published files carry no internal task, QA or review notes');
// The surface gate names the removed 0.1 props to point at the migration guide; that one array literal is the only
// place where a legacy name may appear.
const removedProps = new RegExp(String.raw`\[\s*` + ['events', 'utcOffset', 'timezone', 'onEventPress', 'onEventEdit', 'onEventDelete', 'palette', 'overdueColor',
    'criticalColor', 'progressBarColor', 'isFetching', 'labels', 'data-testid'].map(name => `"${name}"`).join(String.raw`,\s*`) + String.raw`,?\s*\]`, 'g');
for (const path of paths.filter(path => /\.(?:js|cjs)$/.test(path))) {
    let source = read(path);
    if (/^v02\/surface\.c?js$/.test(path)) {
        assert.equal(source.match(removedProps)?.length, 1, `${path}: the removed 0.1 prop list`);
        source = source.replace(removedProps, '');
    }
    assert.doesNotMatch(source, /dayjs|CalendarSkeleton|CalendarEvent|SeriesActionScope|getMonthGridRange|defaultPalette|utcOffset/, path);
    assert.doesNotMatch(source, /\bfetch\s*\(|\bXMLHttpRequest\b|\bWebSocket\b|\bsendBeacon\s*\(/, `Unexpected network primitive: ${path}`);
}
// A fresh Node process has no window/document. Import and render both real formats.
const originalFetch = globalThis.fetch;
try {
    globalThis.fetch = () => { throw new Error('Network side effect while importing/rendering SDK'); };
    const esm = await import(pathToFileURL(resolve(dist, 'index.js')));
    const cjs = createRequire(import.meta.url)(resolve(dist, 'index.cjs'));
    const props = {items: [], anchorDate: '2026-09-01', onNavigate() {}, today: '2026-09-03', timeZone: 'Europe/Moscow', locale: 'en-US', layout: 'desktop'};
    for (const mod of [esm, cjs]) {
        assert.deepEqual(Object.keys(mod).sort(), publicValues);
        assert.equal(typeof mod.Calendar, 'function');
        assert.deepEqual(mod.classicTheme, {name: 'classic'}); assert.deepEqual(mod.neutralTheme, {name: 'neutral'});
        assert.ok(Object.isFrozen(mod.classicTheme) && Object.isFrozen(mod.neutralTheme));
        assert.deepEqual(mod.getCalendarVisibleRange(props), {start: '2026-08-30', end: '2026-10-04', timeZone: 'Europe/Moscow'});
    }
    const html = renderToString(createElement(esm.Calendar, props));
    assert.match(html, /role="grid"/);
    assert.equal(html, renderToString(createElement(cjs.Calendar, props)));
    // Runtime gate: future props are stripped before validation, warned once per module
    // format in development and silently in production; an unknown layout is a contract error.
    const warnings = [], originalWarn = console.warn, environment = process.env.NODE_ENV;
    console.warn = message => warnings.push(String(message));
    process.env.NODE_ENV = 'development';
    try {
        const future = {...props, selection: {start: '2026-09-03', end: '2026-09-04'}, onSelectionChange() {}, interactionPolicy: {}, itemMoveStates: []};
        for (const mod of [esm, cjs]) for (let i = 0; i < 2; i++) assert.equal(renderToString(createElement(mod.Calendar, future)), html);
        // An accepted alpha.2 prop: portals are client-only, so a container never changes the server tree.
        for (const mod of [esm, cjs]) assert.equal(renderToString(createElement(mod.Calendar, {...props, portalContainer: null})), html);
        const expected = ['selection', 'onSelectionChange', 'interactionPolicy', 'itemMoveStates'].map(name => `[@nelmad/calendar] ${name}: not available in ${manifest.version}; ignored`);
        assert.deepEqual(warnings, [...expected, ...expected], 'One development warning per stripped prop and module instance');
        // Accepted alpha.2 props (T17): actions render nothing on the server (the agenda is closed), the controlled source
        // selector is a toolbar trigger with the same markup in both formats; neither warns.
        assert.equal(renderToString(createElement(esm.Calendar, {...props, getItemActions: () => [{id: 'open', label: 'Open'}], onItemActionRequest() {}})), html);
        const filtered = {...props, sources: [{id: 'a', title: 'A'}, {id: 'b', title: 'B'}], visibleSourceIds: ['a'], onVisibleSourceIdsChange() {}};
        const selector = renderToString(createElement(esm.Calendar, filtered));
        assert.match(selector, /data-source-selector/); assert.match(selector, /aria-haspopup="menu"/);
        assert.equal(selector, renderToString(createElement(cjs.Calendar, filtered)));
        assert.doesNotMatch(renderToString(createElement(esm.Calendar, {...filtered, showSourceSelector: false})), /data-source-selector/);
        // Accepted T18 props: the neutral preset and class callbacks reach the server tree identically in both formats; content
        // slots of the toolbar and of an inline agenda render there too.
        const styled = {...props, theme: esm.neutralTheme, classNames: {root: 'host-root', day: state => state.isToday ? 'host-today' : undefined},
            renderToolbarContent: () => 'Toolbar extension', getItemAppearance: () => ({backgroundColor: 'red'})};
        const neutral = renderToString(createElement(esm.Calendar, styled));
        assert.match(neutral, /data-theme="neutral"/); assert.match(neutral, /host-root/); assert.match(neutral, /host-today/); assert.match(neutral, /Toolbar extension/);
        assert.equal(neutral, renderToString(createElement(cjs.Calendar, {...styled, theme: cjs.neutralTheme})));
        // Review 2026-10-09-2 (dual package): a preset from the other format is the same preset; a structural copy is not one.
        assert.equal(renderToString(createElement(esm.Calendar, {...styled, theme: cjs.neutralTheme})), neutral);
        assert.equal(renderToString(createElement(cjs.Calendar, {...styled, theme: esm.neutralTheme})), neutral);
        assert.equal(renderToString(createElement(esm.Calendar, {...props, theme: cjs.classicTheme})), html);
        assert.match(renderToString(createElement(esm.Calendar, {...props, theme: {name: 'classic'}})), /data-status="error"/);
        assert.equal(warnings.length, expected.length * 2, 'Accepted props never warn as unavailable');
        process.env.NODE_ENV = 'production';
        for (const mod of [esm, cjs]) assert.equal(renderToString(createElement(mod.Calendar, {...props, selection: null, onSelectionChange() {}, onItemMoveRequest() {}})), html);
        assert.equal(warnings.length, expected.length * 2, 'Production builds strip silently');
        // The default auto layout renders the compact mobile tree on the server; forced layouts are fixed.
        const {layout: _layout, ...missing} = props;
        for (const [value, layout] of [[missing, 'mobile'], [{...props, layout: 'auto'}, 'mobile'], [{...props, layout: 'mobile'}, 'mobile'], [props, 'desktop']]) {
            const tree = renderToString(createElement(esm.Calendar, value));
            assert.match(tree, /role="grid"/); assert.match(tree, new RegExp(`data-layout="${layout}"`));
            assert.equal(tree, renderToString(createElement(cjs.Calendar, value)));
        }
        const shell = renderToString(createElement(esm.Calendar, {...props, layout: 'tablet'}));
        assert.match(shell, /data-status="error"/); assert.doesNotMatch(shell, /role="grid"/);
        assert.equal(shell, renderToString(createElement(cjs.Calendar, {...props, layout: 'tablet'})));
    } finally { console.warn = originalWarn; if (environment === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = environment; }
} finally { globalThis.fetch = originalFetch; }
console.log(`dist verification passed: ${relative(root, dist)}, ESM/CJS, bundled types, scoped CSS, alpha.2 exports/props/type surface, runtime gate, SSR parity`);
