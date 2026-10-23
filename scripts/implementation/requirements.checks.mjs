import assert from 'node:assert/strict';
import {existsSync, readFileSync} from 'node:fs';
import {test} from 'node:test';
import {evidenceProblem, ledgerProblems} from './ledger-evidence.mjs';

// Ledger record self-checks (decisions 2026-10-22 fix round 1, DV8-1-01): `node --test scripts/implementation/requirements.checks.mjs`.
// The ledger is a local, git-ignored file since 2026-10-23, so the fixtures below stand in for its records.
const note = 'T11 Month report — private semantic Month';
const record = {kind: 'pass', milestone: 'alpha.2', paths: ['scripts/implementation/alpha-acceptance.mjs'], scope: 'Chrome and jsdom'};
const ledgerPath = 'docs/implementation/requirements-0.2.json';
const requirement = (evidence, extra = {}) => ({id: 'S1-000000000000', status: 'in_progress', evidence, ...extra});

test('accepts note strings and evidence records with or without milestone and migration', () => {
    for (const entry of [note, record, {...record, kind: 'partial'}, {kind: 'partial', paths: ['a.md'], scope: 'x'}, {...record, migration: 'spec v7 clarification (2026-10-09): carried from S7-d0dcc8bd4064'}]) {
        assert.equal(evidenceProblem(entry), null, JSON.stringify(entry));
    }
});

test('rejects a string spread into per-character fields, as the first v8 migration wrote it', () => {
    const spread = {...note, migration: 'spec v8 clarification (2026-10-22): carried from S12.1-c2efdf6dd1ad'};
    assert.match(evidenceProblem(spread), /^unknown fields 0, 1, 2, 3, 4 \(\+\d+\)$/);
    assert.deepEqual(ledgerProblems([requirement([note, spread])]), [`S1-000000000000 evidence[1]: ${evidenceProblem(spread)}`]);
});

test('rejects records without kind, paths or scope and malformed optional fields', () => {
    assert.match(evidenceProblem(''), /empty note/);
    assert.match(evidenceProblem(null), /got object/);
    assert.match(evidenceProblem(['a.md']), /got array/);
    assert.match(evidenceProblem({...record, kind: 'done'}), /kind "done"/);
    assert.match(evidenceProblem({...record, paths: []}), /paths/);
    assert.match(evidenceProblem({...record, paths: ['']}), /paths/);
    assert.match(evidenceProblem({...record, paths: 'a.md'}), /paths/);
    assert.match(evidenceProblem({...record, scope: ' '}), /scope/);
    assert.match(evidenceProblem({...record, milestone: 1}), /milestone/);
    assert.match(evidenceProblem({...record, migration: ''}), /migration/);
});

test('checks statuses and the evidence of subchecks', () => {
    assert.deepEqual(ledgerProblems([requirement([], {status: 'done'})]), ['S1-000000000000: status "done"']);
    assert.deepEqual(ledgerProblems([requirement('x')]), ['S1-000000000000: evidence is not a list']);
    const subchecks = [{id: 'R02.1', status: 'pass', evidence: [record]}, {id: 'R02.2', status: 'planned', evidence: [{paths: ['a.md']}]}];
    assert.deepEqual(ledgerProblems([requirement([], {subchecks})]), ['R02.2 evidence[0]: kind undefined is not pass or partial']);
});

test('the DV8-1-01 corruption of S12.1 is rejected', () => {
    // The shape of the repaired S12.1-338f7155c157 record (two T11/T12 note strings and a v8 record), shortened.
    const repaired = [
        'T11 Month report — private semantic Month, measured intrinsic/constrained rows, whole lanes and hit dates.',
        'T12 DayAgenda report — private shared DayAgenda body, desktop non-modal popover and controlled acceptance.',
        {kind: 'partial', milestone: 'alpha.2', paths: ['src/v02/calendar/__tests__/slots.test.tsx'], scope: 'spec v8 clarification (2026-10-22): decision 4'},
    ];
    assert.deepEqual(ledgerProblems([requirement(repaired)]), []);
    // The first v8 migration spread both note strings per character.
    const corrupted = repaired.map(entry => typeof entry === 'string' ? {...entry} : entry);
    assert.equal(ledgerProblems([requirement(corrupted)]).length, 2);
});

test('a local ledger, when present, is well formed', {skip: !existsSync(ledgerPath) && 'no local ledger (git-ignored; npm run check:requirements -- --write creates it)'}, () => {
    assert.deepEqual(ledgerProblems(JSON.parse(readFileSync(ledgerPath, 'utf8')).requirements), []);
});
