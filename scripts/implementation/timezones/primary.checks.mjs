import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {primaryIdentifiers, intersectCapabilities, listHash} from './primary.mjs';

const utc = 'Zone Etc/UTC 0 - UTC\nZone Etc/GMT 0 - GMT\nLink Etc/UTC UTC\nLink Etc/GMT GMT\nLink Etc/UTC Zulu';
const table = (country, id) => `${country}\t+0000+00000\t${id}`;
const generate = (source, tab = '', backzone = '', pending = []) => primaryIdentifiers([utc, source], tab, backzone, pending);

test('keeps primary links for distinct territories, UTC and named Etc offsets', () => {
    const result = generate('Zone Europe/Prague 1 - CET\nLink Europe/Prague Europe/Bratislava\nZone Etc/GMT+3 -3 - -03',
        [table('CZ', 'Europe/Prague'), table('SK', 'Europe/Bratislava')].join('\n'));
    assert.deepEqual(result.identifiers, ['Etc/GMT+3', 'Europe/Bratislava', 'Europe/Prague', 'UTC']);
    assert.deepEqual(result.primaryLinks, ['Europe/Bratislava', 'UTC']);
    assert.equal(result.exclusions.find(row => row.identifier === 'Etc/UTC').reason, 'utc-primary-exception');
    assert.equal(result.exclusions.find(row => row.identifier === 'Zulu').reason, 'non-primary-link');
});
test('country routing of Jan_Mayen and Truk does not promote non-primary aliases', () => {
    const result = generate('Zone Europe/Berlin 1 - CET\nLink Europe/Berlin Arctic/Longyearbyen\nLink Europe/Berlin Atlantic/Jan_Mayen\nZone Pacific/Port_Moresby 10 - +10\nLink Pacific/Port_Moresby Pacific/Chuuk\nLink Pacific/Port_Moresby Pacific/Truk',
        [table('DE', 'Europe/Berlin'), table('SJ', 'Arctic/Longyearbyen'), table('PG', 'Pacific/Port_Moresby'), table('FM', 'Pacific/Chuuk')].join('\n'),
        '#PACKRATLIST zone.tab Link Pacific/Chuuk Pacific/Truk');
    assert.deepEqual(result.identifiers, ['Arctic/Longyearbyen', 'Europe/Berlin', 'Pacific/Chuuk', 'Pacific/Port_Moresby', 'UTC']);
});
test('pending rename is an explicit input, not wall clock or host Intl', () => {
    const source = 'Zone Europe/Kyiv 2 - EET\nLink Europe/Kyiv Europe/Kiev';
    const pending = [{replacement: 'Europe/Kyiv', renamed: 'Europe/Kiev'}];
    const result = generate(source, table('UA', 'Europe/Kyiv'), '', pending);
    assert.deepEqual(result.identifiers, ['Europe/Kiev', 'UTC']);
    assert.equal(result.exclusions.find(row => row.identifier === 'Europe/Kyiv').reason, 'rename-waiting-period');
    assert.deepEqual(generate(source, table('UA', 'Europe/Kyiv')).identifiers, ['Europe/Kyiv', 'UTC']);
});
test('fails closed on ambiguous, cyclic, dangling and invalid data', () => {
    for (const source of ['Zone UTC 0 - UTC', 'Zone utc 0 - UTC', 'Link Missing Alias', 'Link A B\nLink B A', 'Link Missing']) {
        assert.throws(() => generate(source));
    }
    assert.throws(() => generate('', table('XX', 'Missing')));
    assert.throws(() => generate('', '', 'Link UTC UTC'));
    assert.throws(() => generate('', '', '', [{replacement: 'Missing', renamed: 'UTC'}]));
});
test('intersects every pinned runtime without losing required minimum', () => {
    const ids = ['Europe/Berlin', 'Factory', 'UTC'];
    const make = (runtime, unsupported) => ({runtime, primaryListSha256: listHash(ids), results: ids.map(identifier => ({identifier, supported: identifier !== unsupported}))});
    const result = intersectCapabilities(ids, [make('node', 'Factory'), make('browser')], ['UTC', 'Europe/Berlin']);
    assert.deepEqual(result.identifiers, ['Europe/Berlin', 'UTC']);
    assert.deepEqual(result.exclusions, [{identifier: 'Factory', reason: 'runtime-unsupported', runtimes: ['node']}]);
    assert.throws(() => intersectCapabilities(ids, [make('broken', 'UTC')], ['UTC']), /Required minimum/);
});
test('rejects incomplete, duplicate, reordered or unrelated runtime reports', () => {
    const ids = ['Europe/Berlin', 'UTC'];
    const report = {runtime: 'test', primaryListSha256: listHash(ids), results: ids.map(identifier => ({identifier, supported: true}))};
    for (const invalid of [
        {...report, primaryListSha256: 'wrong'}, {...report, results: []},
        {...report, results: report.results.toReversed()}, {...report, results: [report.results[0], report.results[0]]},
        {...report, results: [{identifier: 'Europe/Berlin'}, report.results[1]]},
    ]) assert.throws(() => intersectCapabilities(ids, [invalid], ['UTC']));
});
test('pinned real-world input preserves exceptions and explains every exclusion', () => {
    const manifest = JSON.parse(readFileSync(new URL('../../../docs/implementation/timezones-candidate.json', import.meta.url)));
    for (const id of ['UTC', 'Europe/Bratislava', 'Atlantic/Reykjavik', 'Arctic/Longyearbyen', 'Pacific/Chuuk', 'Pacific/Pohnpei', 'Europe/Kyiv', 'America/Coyhaique']) {
        assert.ok(manifest.identifiers.includes(id), id);
    }
    for (const id of ['GMT', 'Etc/UTC', 'Etc/GMT', 'US/Eastern', 'Europe/Kiev', 'Atlantic/Jan_Mayen', 'Pacific/Truk', 'Factory']) {
        assert.ok(!manifest.identifiers.includes(id), id);
        assert.ok(manifest.exclusions.some(row => row.identifier === id), id);
    }
    assert.equal(manifest.allIdentifiers.length, manifest.identifiers.length + manifest.exclusions.length);
    assert.equal(listHash(manifest.identifiers), manifest.listSha256);
});
