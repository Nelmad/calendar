import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {gzipSync} from 'node:zlib';
import {build} from 'vite';
import react from '@vitejs/plugin-react';

const root = fileURLToPath(new URL('.', import.meta.url));
// Raw run output goes to the given directory or a fresh temporary one, never into the repository (process change 2026-10-22).
const evidence = resolve(process.argv[2] ?? mkdtempSync(join(tmpdir(), 'calendar-spike-bundle-')));
const fixtureLock = JSON.parse(readFileSync(resolve(root, 'package-lock.json')));
const runtimePins = {};
for (const [path, entry] of Object.entries(fixtureLock.packages)) {
    if (!path || entry.dev) continue;
    const name = path.split('node_modules/').at(-1);
    assert.ok(!runtimePins[name] || runtimePins[name] === entry.version, `Multiple runtime versions for ${name}; preserve a nested lock instead`);
    runtimePins[name] = entry.version;
}
const temporary = realpathSync(mkdtempSync(join(tmpdir(), 'calendar-bundle-probe-')));
const reactExternal = id => /^react(?:-dom)?(?:\/|$)/.test(id);
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
function run(command, args, cwd) {
    const result = spawnSync(command, args, {cwd, encoding: 'utf8', env: {...process.env, CI: '1', npm_config_cache: '/private/tmp/calendar-npm-cache'}, maxBuffer: 16 * 1024 * 1024});
    assert.equal(result.status, 0, `${command} ${args.join(' ')}\n${result.stderr}\n${result.stdout}`);
    return result.stdout;
}
await build({root, configFile: false, plugins: [react()], logLevel: 'warn', build: {
    outDir: resolve(root, 'probe-package/dist'), emptyOutDir: true, cssCodeSplit: false,
    lib: {entry: resolve(root, 'surface.jsx'), formats: ['es', 'cjs'], fileName: format => format === 'es' ? 'probe.js' : 'probe.cjs', cssFileName: 'styles'},
    rollupOptions: {external: id => reactExternal(id) || ['@internationalized/date', 'react-aria-components', '@react-stately/flags'].includes(id)},
}});
const packed = JSON.parse(run('npm', ['pack', '--json', '--pack-destination', temporary], resolve(root, 'probe-package')))[0];
const tgz = join(temporary, packed.filename);
const consumer = join(temporary, 'consumer');
mkdirSync(consumer);
// Reuse the fixture's exact runtime graph. Registry/cache metadata must not silently
// change React Aria under an otherwise identical browser/size experiment.
writeFileSync(join(consumer, 'package.json'), JSON.stringify({name: 'calendar-probe-consumer', private: true, type: 'module', dependencies: {react: '18.3.1', 'react-dom': '18.3.1'}, overrides: runtimePins}));
const installLog = run('npm', ['install', tgz, '--offline', '--cache', '/private/tmp/calendar-npm-cache', '--no-audit', '--no-fund'], consumer);
writeFileSync(join(consumer, 'index.html'), '<div id="app"></div><script type="module" src="/main.js"></script>');
const measure = async withProbe => {
    writeFileSync(join(consumer, 'main.js'), `import React from 'react'; import {createRoot} from 'react-dom/client';
${withProbe ? "import {FeasibilitySurface, configureFeasibilityRuntime} from '@nelmad/calendar-feasibility-probe'; configureFeasibilityRuntime(); import '@nelmad/calendar-feasibility-probe/styles.css';" : ''}
createRoot(document.getElementById('app')).render(React.createElement('div', null, 'shell'${withProbe ? ', React.createElement(FeasibilitySurface)' : ''}));`);
    const outDir = join(consumer, withProbe ? 'dist-probe' : 'dist-baseline');
    await build({root: consumer, configFile: false, logLevel: 'error', build: {
        outDir, target: 'es2020', minify: 'esbuild', cssMinify: 'esbuild', sourcemap: false,
        rollupOptions: {external: reactExternal},
    }});
    const chunks = readdirSync(join(outDir, 'assets')).filter(name => /\.(js|css)$/.test(name)).map(name => {
        const bytes = readFileSync(join(outDir, 'assets', name));
        return {name, type: name.endsWith('.js') ? 'js' : 'css', bytes: bytes.length, gzip: gzipSync(bytes, {level: 9}).length, sha256: sha(bytes)};
    });
    return {chunks, js: chunks.filter(c => c.type === 'js').reduce((n, c) => n + c.gzip, 0), css: chunks.filter(c => c.type === 'css').reduce((n, c) => n + c.gzip, 0)};
};
const baseline = await measure(false), probe = await measure(true);
writeFileSync(join(consumer, 'ssr.mjs'), `import React from 'react'; import {renderToString} from 'react-dom/server';
import {FeasibilitySurface, configureFeasibilityRuntime} from '@nelmad/calendar-feasibility-probe'; configureFeasibilityRuntime();
const html=renderToString(React.createElement(FeasibilitySurface));
if(!html.includes('2026-09-03')) throw new Error('Missing deterministic date'); console.log('ESM SSR pass');`);
const esm = run(process.execPath, ['ssr.mjs'], consumer);
const cjs = run(process.execPath, ['-e', "const p=require('@nelmad/calendar-feasibility-probe'); p.configureFeasibilityRuntime(); if(typeof p.FeasibilitySurface!=='function')throw Error('CJS export'); console.log('CJS import pass')"], consumer);
const installedLock = JSON.parse(readFileSync(join(consumer, 'package-lock.json')));
assert.ok(!Object.keys(installedLock.packages).some(path => /(?:^|\/)dayjs$/.test(path)), 'Probe installs Day.js');
for (const [path, entry] of Object.entries(installedLock.packages)) {
    const name = path.split('node_modules/').at(-1);
    if (runtimePins[name]) assert.equal(entry.version, runtimePins[name], `${name}: runtime graph drift`);
}
mkdirSync(evidence, {recursive: true});
writeFileSync(join(evidence, 'bundle-consumer-lock.json'), JSON.stringify(installedLock, null, 2) + '\n');
writeFileSync(join(evidence, 'bundle-install.txt'), installLog);
const report = {date: new Date().toISOString(), kind: 'feasibility-only',
    limitation: 'Small RAC/date surface, not full Calendar: no second theme, full DnD, timezone accepted-set or complete a11y implementation. This cannot pass the release size gate.',
    node: process.version, vite: '6.4.4', target: 'es2020', minifier: 'esbuild', gzipLevel: 9, runtimePins,
    externals: 'Only React/ReactDOM and all their subpaths',
    packed: {name: packed.name, version: packed.version, integrity: packed.integrity, sha256: sha(readFileSync(tgz)), files: packed.files},
    baseline, probe, delta: {js: probe.js - baseline.js, css: probe.css - baseline.css},
    checks: {esm: esm.trim(), cjs: cjs.trim(), dayjsAbsent: true},
    consumerLockSha256: sha(readFileSync(join(consumer, 'package-lock.json'))), temporary,
};
writeFileSync(join(evidence, 'bundle.json'), JSON.stringify(report, null, 2) + '\n');
console.log(`Packed probe delta: JS ${report.delta.js} bytes gzip; CSS ${report.delta.css} bytes gzip. ${esm.trim()}; ${cjs.trim()}. NOT a full Calendar baseline.`);
