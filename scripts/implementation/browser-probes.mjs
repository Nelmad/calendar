import {spawnSync} from 'node:child_process';
import {existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {hash, nameFilter, root, runOutcome} from './packed-harness.mjs';

// The Chrome probes as one gate (PV9-1-01): CI runs it on every pull request and push to main, after
// `npm run build` and `npm run build-storybook` (the story smoke reads storybook-static). Each probe builds its private
// entry from the sources of this checkout with Vite and drives system Chrome; its report goes to <output>/<probe>.
// node scripts/implementation/browser-probes.mjs [--output=<dir>] [--only=<part|part>]
// Not run here: locale-probe.mjs, the T08 native Intl qualification. Its two az-Arab cases are a known open Node/Chrome
// data divergence (open until T27); it is an open check, not a gate, and is run by its documented command.
export const probes = [
    ['month', 'month-probe.mjs', 'dir'], ['agenda', 'agenda-probe.mjs', 'dir'], ['controller', 'controller-probe.mjs', 'dir'],
    ['foundation', 'foundation-probe.mjs', 'dir'], ['responsive', 'responsive-probe.mjs', 'dir'], ['overlay', 'overlay-probe.mjs', 'dir'],
    ['host', 'host-probe.mjs', 'dir'], ['actions-sources', 'actions-sources-probe.mjs', 'dir'], ['themes-slots', 'themes-slots-probe.mjs', 'dir'],
    ['examples-dev', 'examples-dev-probe.mjs', 'dir'], ['review2', 'review2-probe.mjs', 'dir'], ['review3', 'review3-probe.mjs', 'dir'],
    ['selection', 'selection-probe.mjs', 'dir'], ['move-requests', 'move-requests-probe.mjs', 'dir'], ['cls', 'cls-probe.mjs', 'dir'],
    ['projection', 'projection-probe.mjs', 'file'], ['message-regressions', 'message-regressions.mjs', 'file'], ['portal-stories', 'portal-stories-check.mjs', 'dir'],
];
/** Probe scripts that are deliberately not part of this gate, with the reason; every other *-probe.mjs must be listed above. */
export const notGated = {'locale-probe.mjs': 'T08 native Intl qualification; known open az-Arab Node/Chrome divergence until T27'};

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
    const argument = name => process.argv.find(arg => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
    const output = resolve(argument('output') ?? mkdtempSync(join(tmpdir(), 'calendar-browser-probes-')));
    const only = nameFilter(argument('only'));
    mkdirSync(output, {recursive: true});
    if (!existsSync(join(root, 'storybook-static/index.json'))) throw new Error('storybook-static is missing: run npm run build && npm run build-storybook first');
    const version = path => JSON.parse(readFileSync(join(root, 'scripts/implementation/spikes/node_modules', path, 'package.json'), 'utf8')).version;
    const {chromium} = await import('./spikes/node_modules/playwright/index.mjs');
    const browser = await chromium.launch({channel: 'chrome', headless: true}), chrome = browser.version(); await browser.close();
    const report = {startedAt: new Date().toISOString(), filter: only ? only.source : null, notGated,
        scope: 'Chrome probes of the checkout sources (private Vite entries) and the Storybook smoke; not the packed archive, which packed-consumers and the milestone acceptance test',
        versions: {node: process.version, chrome, playwright: version('playwright'), axeCore: version('axe-core')}, probes: [], sourceHashes: {}};
    const save = () => writeFileSync(join(output, 'manifest.json'), JSON.stringify(report, null, 2) + '\n');
    for (const [, script] of probes) report.sourceHashes[`scripts/implementation/${script}`] = hash(readFileSync(join(root, 'scripts/implementation', script)));
    const failures = [];
    for (const [name, script, kind] of probes) {
        if (only && !only.test(name)) continue;
        const target = kind === 'dir' ? join(output, name) : join(output, name, `${name}.json`);
        mkdirSync(join(output, name), {recursive: true});
        const command = [process.execPath, join('scripts/implementation', script), target], started = performance.now();
        const result = spawnSync(command[0], command.slice(1), {cwd: root, encoding: 'utf8', timeout: 1_200_000, maxBuffer: 64 * 1024 * 1024,
            env: {...process.env, CI: '1', DO_NOT_TRACK: '1'}});
        const log = `${name}.txt`, text = [result.stdout, result.stderr, result.error ? String(result.error) : ''].filter(Boolean).join('\n');
        writeFileSync(join(output, log), text);
        const outcome = result.status === 0 ? 'pass' : 'fail';
        if (outcome === 'fail') failures.push(name);
        const summary = (result.stdout ?? '').trim().split('\n').filter(Boolean).at(-1) ?? '';
        report.probes.push({name, command: ['node', join('scripts/implementation', script), target], durationMs: Math.round(performance.now() - started),
            exitCode: result.status, signal: result.signal, outcome, summary, log});
        save();
        console.log(`${outcome.toUpperCase()}: ${name} — ${summary}`);
        if (outcome === 'fail') console.log(text.slice(-4000));
    }
    report.outcome = runOutcome({failures, filter: only?.source}); report.failures = failures; report.finishedAt = new Date().toISOString(); save();
    console.log(`Browser probes: ${report.probes.length - failures.length}/${report.probes.length} pass (${report.outcome}); ${output}`);
    if (failures.length) process.exitCode = 1;
}
