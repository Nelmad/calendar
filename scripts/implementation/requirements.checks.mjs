import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import {evidenceProblem, ledgerProblems} from './ledger-evidence.mjs';

// Ledger record self-checks (decisions 2026-10-22 fix round 1, DV8-1-01): `node --test scripts/implementation/requirements.checks.mjs`.
const note = 'docs/implementation/t11-month.md — private semantic Month';
const record = {kind: 'pass', milestone: 'alpha.2', paths: ['docs/implementation/t19-alpha2-acceptance.md'], scope: 'Chrome and jsdom'};
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

test('the DV8-1-01 corruption of S12.1 is rejected and the live ledger is well formed', () => {
    const live = JSON.parse(readFileSync('docs/implementation/requirements-0.2.json', 'utf8')).requirements;
    // Rebuilt from the repaired record (raw evidence is no longer kept in the repository): its two note strings spread per character.
    const repaired = live.find(entry => entry.id === 'S12.1-338f7155c157').evidence;
    assert.equal(repaired.filter(entry => typeof entry === 'string').length, 2);
    const corrupted = repaired.map(entry => typeof entry === 'string' ? {...entry} : entry);
    assert.equal(ledgerProblems([requirement(corrupted)]).length, 2);
    assert.deepEqual(ledgerProblems(live), []);
});
