// Packed-consumer probe copied next to the Vite example: rebuilds the example's client
// in memory with its own config and checks the module graph; the example stays clean.
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {build} from 'vite';
const modulesOf = result => (Array.isArray(result) ? result : [result]).flatMap(output => output.output).flatMap(chunk => Object.keys(chunk.modules ?? {}));
const full = modulesOf(await build({logLevel: 'warn', build: {write: false}}));
for (const library of ['react/', 'react-dom/', 'react-aria', '@internationalized/date']) assert.ok(full.some(path => path.includes(`node_modules/${library}`)), `${library} missing from full consumer output`);
assert.ok(full.some(path => path.includes('/calendar/dist/v02/calendar/DayAgendaBody.js')));
assert.ok(!full.some(path => /dayjs|\/calendar\/dist\/(?:ui-kit|components)\//.test(path)));
const modules = modulesOf(await build({configFile: false, logLevel: 'warn', build: {write: false, rollupOptions: {input: 'helper.ts', preserveEntrySignatures: 'strict'}}}));
assert.ok(modules.some(path => path.includes('@internationalized/date')));
assert.ok(!modules.some(path => /node_modules\/(?:react(?:-dom|-aria|-stately)?\/|@react-)|\/calendar\/dist\/(?:Calendar|v02\/calendar\/)/.test(path)), 'Pure helper retained UI modules');
const summarize = paths => paths.map(path => path.replace(process.cwd() + '/', ''));
writeFileSync('graph-evidence.json', JSON.stringify({full: summarize(full), helper: summarize(modules), externalImplementationLibraries: false}, null, 2));
console.log('Full example client includes runtime dependencies and DayAgenda; helper-only consumer removes UI, no legacy graph');
