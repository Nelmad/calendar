import {createRequire} from 'node:module';
import {mkdtempSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {tmpdir, release} from 'node:os';
import {dirname, resolve} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {gzipSync} from 'node:zlib';
import {build} from 'vite';
import {sha256, listHash} from './primary.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../../..');
// The first argument that is not a flag (such as --browser) is the output directory.
const output = resolve(process.argv.slice(2).find(argument => !argument.startsWith('--')) ?? mkdtempSync(resolve(tmpdir(), 'calendar-capabilities-')));
mkdirSync(output, {recursive: true});
const manifest = JSON.parse(readFileSync(resolve(root, 'docs/implementation/timezones-candidate.json')));
const directory = mkdtempSync(resolve(tmpdir(), 'calendar-timezones-'));
await build({configFile: false, logLevel: 'error', build: {
    outDir: directory, emptyOutDir: false, minify: true,
    lib: {entry: resolve(here, 'probe.ts'), formats: ['es', 'cjs'], fileName: format => format === 'es' ? 'probe.mjs' : 'probe.cjs'},
}});
const esm = await import(pathToFileURL(resolve(directory, 'probe.mjs')));
const cjs = createRequire(import.meta.url)(resolve(directory, 'probe.cjs'));
const primary = manifest.primaryIdentifiers;
const extras = ['', 'europe/berlin', 'US/Eastern', 'GMT', 'Etc/UTC', '+03:00', 'EST5EDT,M3.2.0,M11.1.0', 'Host/Only', null, 3];
const input = [...manifest.allIdentifiers, ...extras];
const expectedMembership = input.map(id => manifest.identifiers.includes(id) ? id : null);
const sourceHashes = Object.fromEntries(['probe.ts', 'run-capabilities.mjs', '../../../src/v02/core/date.ts'].map(path => [path, sha256(readFileSync(resolve(here, path)))]));
const common = {
    schemaVersion: 1, capturedAt: new Date().toISOString(), scope: 'Sampled identifier usability, not all-instant correctness or full RC runtime matrix',
    primaryListSha256: listHash(primary), dateRuntime: '@internationalized/date@' + JSON.parse(readFileSync(resolve(root, 'node_modules/@internationalized/date/package.json'))).version,
    sourceHashes, platform: process.platform, architecture: process.arch, osRelease: release(),
};
const nodeResults = esm.probeTimeZones(primary);
if (JSON.stringify(nodeResults) !== JSON.stringify(cjs.probeTimeZones(primary))) throw new Error('ESM/CJS usability differs');
const report = { ...common, runtime: `Node ${process.version} / ICU ${process.versions.icu} / tz ${process.versions.tz}`, versions: process.versions, results: nodeResults};
writeFileSync(resolve(output, 'node.json'), JSON.stringify(report, null, 2) + '\n');
const parity = {candidateListSha256: manifest.listSha256, sourceHashes,
    esm: JSON.stringify(esm.probeMembership(input)) === JSON.stringify(expectedMembership),
    cjs: JSON.stringify(cjs.probeMembership(input)) === JSON.stringify(expectedMembership),
    membershipInput: input, membershipExpected: expectedMembership,
    packageListEqual: JSON.stringify(esm.packageIdentifiers) === JSON.stringify(manifest.identifiers) && JSON.stringify(cjs.packageIdentifiers) === JSON.stringify(manifest.identifiers),
};
if (process.argv.includes('--browser')) {
    const {chromium} = await import('../spikes/node_modules/playwright/index.mjs');
    const browser = await chromium.launch({channel: 'chrome', headless: true});
    try {
        const page = await browser.newPage();
        const result = await page.evaluate(async ({url, primary, input}) => {
            const probe = await import(url);
            return {results: probe.probeTimeZones(primary), membership: probe.probeMembership(input), identifiers: probe.packageIdentifiers, userAgent: navigator.userAgent};
        }, {url: 'data:text/javascript;base64,' + readFileSync(resolve(directory, 'probe.mjs')).toString('base64'), primary, input});
        writeFileSync(resolve(output, 'chrome.json'), JSON.stringify({...common,
            runtime: `Chrome ${browser.version()}`, userAgent: result.userAgent, results: result.results,
        }, null, 2) + '\n');
        parity.browser = JSON.stringify(result.membership) === JSON.stringify(expectedMembership);
        parity.browserPackageListEqual = JSON.stringify(result.identifiers) === JSON.stringify(manifest.identifiers);
    } finally { await browser.close(); }
}
// Isolated data cost, not a substitute for the full Calendar bundle gate.
await build({configFile: false, logLevel: 'error', build: {
    outDir: directory, emptyOutDir: false, minify: true,
    lib: {entry: resolve(root, 'src/v02/core/timeZones.generated.ts'), formats: ['es'], fileName: () => 'list.mjs'},
}});
parity.isolatedListGzipBytes = gzipSync(readFileSync(resolve(directory, 'list.mjs')), {level: 9}).length;
parity.passed = ['esm', 'cjs', 'packageListEqual', ...(process.argv.includes('--browser') ? ['browser', 'browserPackageListEqual'] : [])].every(key => parity[key]);
writeFileSync(resolve(output, 'parity.json'), JSON.stringify(parity, null, 2) + '\n');
console.log(JSON.stringify({nodeSupported: nodeResults.filter(row => row.supported).length, primary: primary.length, parity: parity.passed, listGzipBytes: parity.isolatedListGzipBytes, output}));
if (!parity.passed) process.exitCode = 1;
