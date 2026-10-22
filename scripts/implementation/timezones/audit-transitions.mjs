// Build-time audit of the spacing/bounds used by the Intl transition scanner.
// TZif structure: RFC 9636 §3. Historical records plus a complete Gregorian
// 400-year cycle of POSIX footer rules. This is not an audit of every host ICU.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdirSync, mkdtempSync, readFileSync, writeFileSync} from 'node:fs';
import {dirname, resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {sha256} from './primary.mjs';

const here = dirname(fileURLToPath(import.meta.url)), root = resolve(here, '../../..');
const output = resolve(process.argv[2] ?? resolve(tmpdir(), 'calendar-transition-audit.json'));
const policy = JSON.parse(readFileSync(resolve(here, 'policy.json')));
const manifest = JSON.parse(readFileSync(resolve(root, 'docs/implementation/timezones-candidate.json')));
const archive = resolve(here, policy.tzdb.archive);
assert.equal(sha256(readFileSync(archive)), policy.tzdb.sha256);
const directory = mkdtempSync(resolve(tmpdir(), 'calendar-transition-audit-'));
const codeArchive = resolve(here, 'vendor/tzcode2026c.tar.gz');
const codeHash = 'b1cffc3ace4c4c7cd0efba2f7add86ec3d0b79da48bcf03582671fd3c8feace8';
assert.equal(sha256(readFileSync(codeArchive)), codeHash);
// Build isolated tools, never install or modify the host timezone database.
const codeFiles = ['Makefile', 'version', 'tzfile.h', 'private.h', 'localtime.c', 'asctime.c', 'difftime.c', 'strftime.c', 'zic.c', 'zdump.c'];
for (const file of codeFiles) writeFileSync(resolve(directory, file), execFileSync('tar', ['-xOf', codeArchive, file]));
execFileSync('make', ['VERSION_DEPS=', 'VERSION=2026c', 'zic', 'zdump'], {cwd: directory, maxBuffer: 2_000_000});
const files = [...policy.tzdb.sources, 'backzone', 'zone.tab', 'ziguard.awk'];
for (const file of files) writeFileSync(resolve(directory, file), execFileSync('tar', ['-xOf', archive, file]));
const zic = resolve(directory, 'zic'), zdump = resolve(directory, 'zdump');
const data = execFileSync('awk', ['-v', 'DATAFORM=main', '-v', 'PACKRATDATA=backzone', '-v', 'PACKRATLIST=zone.tab', '-f', 'ziguard.awk', ...policy.tzdb.sources, 'backzone'], {cwd: directory, maxBuffer: 8_000_000});
writeFileSync(resolve(directory, 'main.zi'), data);
execFileSync(zic, ['-b', 'fat', '-d', resolve(directory, 'compiled'), resolve(directory, 'main.zi')]);
const projection = readFileSync(resolve(root, 'src/v02/core/projection.ts'), 'utf8');
const dateAdapter = readFileSync(resolve(root, 'src/v02/core/date.ts'), 'utf8');
assert.match(dateAdapter, /export const UTC_DAY_MS = 86_400_000;/);
assert.match(projection, /export const TRANSITION_SCAN_MS = 3 \* UTC_DAY_MS;/);
const scanSeconds = 3 * 86_400;
const results = [];
const footerCache = new Map();
const utc = (year, month, day) => {
    const date = new Date(0); date.setUTCFullYear(year, month - 1, day); return date.getTime() / 1000;
};
const clockSeconds = text => {
    const fields = text.replace(/^[+-]/, '').split(':').map(Number);
    return (text.startsWith('-') ? -1 : 1) * (fields[0] * 3600 + (fields[1] ?? 0) * 60 + (fields[2] ?? 0));
};
function parseFooter(footer) {
    const match = /^(?:<[^>]+>|[A-Za-z]+)([+-]?\d+(?::\d+(?::\d+)?)?)(?:(?:<[^>]+>|[A-Za-z]+)([+-]?\d+(?::\d+(?::\d+)?)?)?,([^,]+),([^,]+))?$/.exec(footer);
    assert.ok(match, `Unrecognized POSIX footer: ${footer}`);
    const standard = -clockSeconds(match[1]), daylight = match[2] ? -clockSeconds(match[2]) : standard + 3600;
    const transition = (rule, year, beforeOffset) => {
        // All recurring rules in this pinned archive use M.m.w.d. Reject new
        // syntax on an input update instead of guessing its calendar semantics.
        const parts = /^M(\d+)\.(\d+)\.(\d+)(?:\/([+-]?\d+(?::\d+(?::\d+)?)?))?$/.exec(rule);
        assert.ok(parts, `Unsupported footer rule: ${rule}`);
        const [, monthText, weekText, weekdayText, time = '2'] = parts;
        const month = Number(monthText), week = Number(weekText), weekday = Number(weekdayText);
        const monthStart = utc(year, month, 1);
        let day = 1 + (weekday - new Date(monthStart * 1000).getUTCDay() + 7) % 7 + (week - 1) * 7;
        const monthDays = (utc(year, month + 1, 1) - monthStart) / 86_400;
        if (day > monthDays) day -= 7;
        return utc(year, month, day) + clockSeconds(time) - beforeOffset;
    };
    return {
        offsets: match[3] ? [standard, daylight] : [standard],
        year: year => match[3] && daylight !== standard ? [transition(match[3], year, standard), transition(match[4], year, daylight)].sort((a, b) => a - b) : [],
    };
}
for (const identifier of manifest.identifiers) {
    const path = resolve(directory, 'compiled', identifier), bytes = readFileSync(path);
    assert.equal(bytes.subarray(0, 4).toString(), 'TZif');
    const header = position => {
        const [ut, standard, leaps, times, types, characters] = Array.from({length: 6}, (_, i) => bytes.readUInt32BE(position + 20 + 4 * i));
        return {ut, standard, leaps, times, types, characters};
    };
    const size = (h, width) => h.times * (width + 1) + h.types * 6 + h.characters + h.leaps * (width + 4) + h.standard + h.ut;
    const second = 44 + size(header(0), 4), h = header(second), base = second + 44;
    assert.equal(bytes.subarray(second, second + 4).toString(), 'TZif');
    const offsets = Array.from({length: h.types}, (_, i) => bytes.readInt32BE(base + h.times * 9 + 6 * i));
    const footer = bytes.subarray(base + size(h, 8)).toString().trim();
    const transitions = [];
    let previousOffset = offsets[0];
    for (let i = 0; i < h.times; i++) {
        const seconds = Number(bytes.readBigInt64BE(base + 8 * i));
        const offset = offsets[bytes[base + h.times * 8 + i]];
        if (offset !== previousOffset) transitions.push(seconds);
        previousOffset = offset;
    }
    let rules = footerCache.get(footer);
    if (!rules) {
        rules = parseFooter(footer);
        // Independent zic/zdump oracle checks each distinct footer. The pure
        // rule evaluator then covers all 400 years without millions of TZ reads.
        const future = execFileSync(zdump, ['-V', '-c', '2400,2401', path], {encoding: 'utf8', maxBuffer: 100_000, env: {...process.env, LC_ALL: 'C'}});
        const oracle = [];
        let previousFuture;
        for (const line of future.trim().split('\n')) {
            if (!line) continue;
            const match = /  (.+?) UT = .* gmtoff=(-?\d+)$/.exec(line);
            assert.ok(match, `Unrecognized zdump output: ${line}`);
            const offset = Number(match[2]), seconds = Date.parse(match[1] + ' UTC') / 1000;
            assert.ok(Number.isFinite(seconds));
            if (previousFuture !== undefined && offset !== previousFuture) oracle.push(seconds);
            previousFuture = offset;
        }
        assert.deepEqual(rules.year(2400), oracle, `Footer differs from zdump: ${footer}`);
        footerCache.set(footer, rules);
    }
    offsets.push(...rules.offsets);
    const futureTransitions = Array.from({length: 402}, (_, i) => rules.year(2400 + i)).flat();
    const lastExplicit = transitions.at(-1);
    const tailYear = lastExplicit === undefined ? 2400 : new Date(lastExplicit * 1000).getUTCFullYear();
    assert.ok(Number.isFinite(tailYear) && (lastExplicit === undefined || tailYear < 2400), `Extend the audited footer cycle: ${identifier}`);
    const bridge = [tailYear, tailYear + 1, tailYear + 2].flatMap(rules.year).filter(seconds => seconds > (lastExplicit ?? -Infinity));
    const ordered = [...new Set([...transitions, ...bridge, ...futureTransitions])].sort((a, b) => a - b);
    let closest = null;
    for (let i = 1; i < ordered.length; i++) {
        const seconds = ordered[i] - ordered[i - 1];
        if (!closest || seconds < closest.seconds) closest = {seconds, before: ordered[i - 1], after: ordered[i]};
    }
    const maxOffsetSeconds = Math.max(...offsets.map(Math.abs));
    assert.ok(maxOffsetSeconds < 86_400, `Offset outside scanner bounds: ${identifier}`);
    assert.ok(!closest || closest.seconds > scanSeconds, `Transitions too close for scanner: ${identifier}`);
    results.push({identifier, tzifSha256: sha256(bytes), explicitOffsetChanges: transitions.length, footer, footerOffsetChanges: futureTransitions.length, maxOffsetSeconds, closest});
}
const closest = results.filter(row => row.closest).sort((a, b) => a.closest.seconds - b.closest.seconds)[0];
const report = {
    capturedAt: new Date().toISOString(), outcome: 'pass', scope: 'Pinned tzdb source audit; full exact-runtime/ICU qualification remains T27',
    tzdbVersion: policy.tzdb.version, archiveSha256: policy.tzdb.sha256, listSha256: manifest.listSha256,
    tzcode: {version: '2026c', url: 'https://data.iana.org/time-zones/releases/tzcode2026c.tar.gz', sha256: codeHash},
    sourceHashes: {'date.ts': sha256(dateAdapter), 'projection.ts': sha256(projection), 'audit-transitions.mjs': sha256(readFileSync(fileURLToPath(import.meta.url)))},
    compiler: execFileSync(zic, ['--version'], {encoding: 'utf8'}).trim(), zdump: execFileSync(zdump, ['--version'], {encoding: 'utf8'}).trim(),
    configuration: 'DATAFORM=main BACKWARD=backward PACKRATDATA=backzone PACKRATLIST=zone.tab; zic -b fat',
    scanSeconds, wallTimeWindowSeconds: 2 * 86_400, futureRuleCycle: [2400, 2802], distinctFooters: footerCache.size, footerOracleYear: 2400, zoneCount: results.length,
    minimumSpacing: {identifier: closest.identifier, ...closest.closest}, maxOffsetSeconds: Math.max(...results.map(row => row.maxOffsetSeconds)), results,
};
mkdirSync(dirname(output), {recursive: true});
writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({outcome: report.outcome, zones: report.zoneCount, minimumSpacing: report.minimumSpacing, output}));
