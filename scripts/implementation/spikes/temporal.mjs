import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync, mkdirSync, mkdtempSync, writeFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {CalendarDateTime, fromAbsolute, parseAbsolute, parseDate, toCalendarDateTime, toZoned} from '@internationalized/date';

// Feasibility adapter. This is not a public API or the final timezone validator.
const min = -62135596800000;
const max = 253402300799999;
function strictDate(value) {
    if (typeof value !== 'string' || value.length !== 10 || !/^(?!0000)\d{4}-\d{2}-\d{2}$/.test(value)) throw new RangeError('ISO date grammar');
    return parseDate(value);
}
function strictInstant(value) {
    if (typeof value !== 'string') throw new RangeError('Timestamp must be a string');
    const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?(Z|([+-])(\d{2}):(\d{2}))$/.exec(value);
    if (!match || match[0] !== value || match[6] === '-00:00') throw new RangeError('RFC3339 grammar');
    const date = strictDate(match[1]);
    const [hour, minute, second] = match.slice(2, 5).map(Number);
    const offsetHour = Number(match[8] ?? 0), offsetMinute = Number(match[9] ?? 0);
    if (hour > 23 || minute > 59 || second > 59 || offsetHour > 23 || offsetMinute > 59) throw new RangeError('Time bounds');
    const utc = new Date(0);
    utc.setUTCFullYear(date.year, date.month - 1, date.day);
    utc.setUTCHours(hour, minute, second, Number((match[5] ?? '').padEnd(3, '0')));
    const offset = (match[7] === '-' ? -1 : 1) * (offsetHour * 60 + offsetMinute) * 60_000;
    const instant = utc.getTime() - offset;
    if (instant < min || instant > max) throw new RangeError('Instant bounds');
    return instant;
}
function resolveWallTime(wall, zone) {
    const candidates = ['earlier', 'later'].map(choice => toZoned(wall, zone, choice))
        .filter(candidate => toCalendarDateTime(candidate).compare(wall) === 0);
    if (!candidates.length) throw new RangeError('gap');
    return candidates.sort((a, b) => a.toDate().getTime() - b.toDate().getTime())[0];
}
function serialize(instant, zone) {
    const zoned = fromAbsolute(instant, zone);
    return zoned.offset % 60_000 ? new Date(instant).toISOString() : zoned.toString().replace(/\[.*\]$/, '');
}

const cases = [];
const check = (name, fn) => {
    try { const observed = fn(); cases.push({name, outcome: 'pass', observed: observed ?? true}); }
    catch (error) { cases.push({name, outcome: 'fail', error: String(error)}); }
};
check('Strict RFC3339 accepts instant endpoints and signed sub-hour offsets', () => {
    assert.equal(strictInstant('0001-01-01T00:00:00Z'), min);
    assert.equal(strictInstant('9999-12-31T23:59:59.999Z'), max);
    assert.equal(strictInstant('2026-09-03T00:00:00-00:30'), Date.parse('2026-09-03T00:30:00Z'));
    assert.equal(strictInstant('2026-09-03T00:00:00+00:30'), Date.parse('2026-09-02T23:30:00Z'));
});
check('Invalid grammar and overflowing instants are rejected before date math', () => {
    const rejected = ['0000-01-01T00:00:00Z', '2026-02-29T00:00:00Z', '2026-09-03T24:00:00Z',
        '2026-09-03T00:00:60Z', '2026-09-03T00:00Z', '2026-09-03T00:00:00',
        '2026-09-03T00:00:00.1234Z', '2026-09-03T00:00:00-00:00', '2026-09-03T00:00:00Z\n', '2026-09-03T00:00:00+24:00',
        '2026-09-03t00:00:00z', '0001-01-01T00:00:00+00:01', '9999-12-31T23:59:59-23:59'];
    rejected.forEach(value => assert.throws(() => strictInstant(value), undefined, value));
    return {rejected: rejected.length};
});
check('Berlin spring gap is rejected instead of shifted', () => {
    assert.throws(() => resolveWallTime(new CalendarDateTime(2026, 3, 29, 2, 30), 'Europe/Berlin'), /gap/);
});
check('Berlin fold chooses earlier; elapsed duration crosses DST', () => {
    assert.equal(resolveWallTime(new CalendarDateTime(2026, 10, 25, 2, 30), 'Europe/Berlin').toDate().toISOString(), '2026-10-25T00:30:00.000Z');
    const start = resolveWallTime(new CalendarDateTime(2026, 3, 29, 1, 30), 'Europe/Berlin').toDate().getTime();
    assert.equal(serialize(start + 7_200_000, 'Europe/Berlin'), '2026-03-29T04:30:00+02:00');
});
check('Apia skipped date has no timed wall time; all-day date arithmetic keeps it', () => {
    assert.throws(() => resolveWallTime(new CalendarDateTime(2011, 12, 30, 10), 'Pacific/Apia'), /gap/);
    assert.equal(strictDate('2011-12-29').add({days: 1}).toString(), '2011-12-30');
    const start = strictInstant('2011-12-29T23:00:00-10:00'), end = strictInstant('2011-12-31T01:00:00+14:00');
    assert.equal(end - start, 7_200_000);
    const dates = [...new Set(Array.from({length: 120}, (_, i) => fromAbsolute(start + i * 60_000, 'Pacific/Apia').toString().slice(0, 10)))];
    assert.deepEqual(dates, ['2011-12-29', '2011-12-31']);
    return {dates, caveat: 'Finite oracle for this fixture, not a general membership algorithm'};
});
check('Historical second offsets fall back to Z and preserve the instant', () => {
    const instant = strictInstant('1890-01-01T00:00:00Z');
    const offset = fromAbsolute(instant, 'Europe/Paris').offset;
    assert.equal(offset, 561000);
    const serialized = serialize(instant, 'Europe/Paris');
    assert.equal(serialized, '1890-01-01T00:00:00.000Z');
    assert.equal(strictInstant(serialized), instant);
    return {offset, serialized};
});
check('Intl fields detect local tail before constructing a bounded CalendarDate', () => {
    assert.equal(fromAbsolute(min, 'UTC').toString(), '0001-01-01T00:00:00+00:00[UTC]');
    const tail = fromAbsolute(max, 'Asia/Tokyo');
    assert.equal(tail.year, 9999); // Observed library constraint, not correct domain projection.
    const parts = new Intl.DateTimeFormat('en-US-u-nu-latn', {timeZone: 'Asia/Tokyo', calendar: 'gregory', year: 'numeric', era: 'short'}).formatToParts(max);
    assert.equal(parts.find(part => part.type === 'year').value, '10000');
    return {libraryTail: tail.toString(), intlYear: '10000',
        decision: 'Inspect explicit Gregorian Intl fields before a CalendarDate conversion; clip only out-of-domain membership. See temporal-initial.json for the rejected assumption.'};
});
check('Native parsers are intentionally broader than the SDK grammar', () => {
    const accepted = ['2026-09-03T10:00Z', '2026-09-03T10:00:00.1234Z', '2026-09-03T10:00:00-00:00'];
    for (const value of accepted) {
        assert.doesNotThrow(() => parseAbsolute(value, 'UTC'));
        assert.throws(() => strictInstant(value));
    }
    return {acceptedByLibraryOnly: accepted};
});

const snapshot = () => ['UTC', 'Europe/Berlin', 'Pacific/Apia'].map(zone => ({
    zone, date: fromAbsolute(strictInstant('2026-09-03T00:30:00-00:30'), zone).toString(),
    label: new Intl.DateTimeFormat('en-GB', {calendar: 'gregory', timeZone: zone, dateStyle: 'full', hourCycle: 'h23'}).format(strictInstant('2026-09-03T00:30:00-00:30')),
}));
if (process.argv.includes('--snapshot')) {
    console.log(JSON.stringify(snapshot()));
} else {
    check('Explicit timezone/locale serialization is independent of process TZ', () => {
        const snapshots = ['UTC', 'America/Los_Angeles', 'Asia/Tokyo'].map(TZ => {
            const result = spawnSync(process.execPath, [fileURLToPath(import.meta.url), '--snapshot'], {env: {...process.env, TZ}, encoding: 'utf8'});
            assert.equal(result.status, 0, result.stderr);
            return JSON.parse(result.stdout);
        });
        snapshots.slice(1).forEach(value => assert.deepEqual(value, snapshots[0]));
        return snapshots[0];
    });
    // Raw run output goes to the given directory or a fresh temporary one, never into the repository (process change 2026-10-22).
    const output = pathToFileURL(`${resolve(process.argv[2] ?? mkdtempSync(join(tmpdir(), 'calendar-spike-temporal-')))}/`);
    mkdirSync(output, {recursive: true});
    const report = {date: new Date().toISOString(), runtimeVersions: process.versions,
        dependency: '@internationalized/date@3.12.2',
        scriptSha256: createHash('sha256').update(readFileSync(new URL(import.meta.url))).digest('hex'),
        cases, outcome: cases.every(c => c.outcome === 'pass') ? 'pass' : 'fail'};
    writeFileSync(new URL('temporal.json', output), JSON.stringify(report, null, 2) + '\n');
    cases.forEach(c => console.log(`${c.outcome.toUpperCase()}: ${c.name}${c.error ? ` — ${c.error}` : ''}`));
    if (report.outcome === 'fail') process.exitCode = 1;
}
