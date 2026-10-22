import {spawnSync} from 'node:child_process';
import {appendFileSync, mkdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join, resolve} from 'node:path';
import {releaseGates} from './release-metadata.mjs';

// One gate of the release workflow (PV9-1-04): runs the command with inherited output and appends its record (command,
// environment, duration, exit code, outcome) to the gate log that the release manifest reads. The exit code is the command's.
// node scripts/release/gate.mjs <gate id> -- <command> [args...]
// The log is $RELEASE_GATE_LOG, or release-reports/gates.jsonl under $RUNNER_TEMP (the platform temporary directory locally).
const [id, separator, command, ...args] = process.argv.slice(2);
if (!releaseGates.includes(id)) throw new Error(`${JSON.stringify(id)} is not a release gate (${releaseGates.join(', ')})`);
if (separator !== '--' || !command) throw new Error('Usage: node scripts/release/gate.mjs <gate id> -- <command> [args...]');
const log = resolve(process.env.RELEASE_GATE_LOG ?? join(process.env.RUNNER_TEMP ?? tmpdir(), 'release-reports/gates.jsonl'));
mkdirSync(dirname(log), {recursive: true});
const environment = Object.fromEntries(['TZ', 'LANG', 'LC_ALL', 'CALENDAR_TYPESCRIPT_COMPILER'].filter(name => process.env[name] !== undefined).map(name => [name, process.env[name]]));
const startedAt = new Date(), result = spawnSync(command, args, {stdio: 'inherit'});
const finishedAt = new Date();
appendFileSync(log, JSON.stringify({id, command: [command, ...args], environment, startedAt: startedAt.toISOString(), finishedAt: finishedAt.toISOString(),
    durationMs: finishedAt - startedAt, exitCode: result.status, signal: result.signal, ...(result.error ? {error: String(result.error)} : {}),
    outcome: result.status === 0 ? 'pass' : 'fail'}) + '\n');
console.log(`gate ${id}: ${result.status === 0 ? 'pass' : 'fail'} (${log})`);
process.exitCode = result.status === 0 ? 0 : 1;
