import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {existsSync, readFileSync, writeFileSync} from 'node:fs';
import {ledgerProblems} from './ledger-evidence.mjs';

const sourcePath = 'docs/specification-0.2.md';
const planPath = 'docs/implementation-plan-0.2.md';
const outputPath = 'docs/implementation/requirements-0.2.json';
const source = readFileSync(sourcePath, 'utf8');
const plan = readFileSync(planPath, 'utf8');
const hash = value => createHash('sha256').update(value).digest('hex');
assert.equal(hash(source), plan.match(/SHA-256 `([a-f\d]+)`/)[1], 'Specification differs from approved plan');
const regression = [...plan.matchAll(/^\| (R\d{2}) \| (.*?) \| (T\d{2}) \| (.*?) \|$/gm)];
assert.deepEqual(regression.map(row => row[1]), Array.from({length: 74}, (_, i) => `R${String(i + 1).padStart(2, '0')}`));

// Latest full acceptance for a specification section. Earlier mandatory slices
// are owned by the regression rows and their explicit subchecks below.
const ownership = {
    '1': ['T03', 'RC', 'T30'], '2': ['T03', 'RC', 'T30'], '3': ['T26', 'beta.1'],
    '4': ['T05', 'beta.1', 'T04', 'T07', 'T24'],
    '4.2': ['T18', 'alpha.2'], '4.3.1': ['T06', 'RC', 'T27'],
    '4.3.2': ['T10', 'beta.1', 'T24'],
    '5': ['T24', 'beta.1'], '5.1': ['T10', 'alpha.1'],
    '5.2.1': ['T12', 'beta.1', 'T15', 'T24'],
    '5.2.2': ['T20', 'beta.1', 'T24'], '5.2.3': ['T20', 'beta.1'],
    '5.3': ['T22', 'beta.1', 'T23', 'T24'], '5.3.1': ['T21', 'beta.1', 'T24'],
    '5.4': ['T20', 'beta.1', 'T21', 'T24'],
    '5.5': ['T17', 'beta.1', 'T23', 'T24'], '5.6': ['T17', 'beta.1', 'T24'],
    '5.7': ['T04', 'beta.1', 'T13', 'T26'],
    '6': ['T11', 'alpha.2', 'T07', 'T18'], '7': ['T15', 'beta.1', 'T23', 'T24'],
    '8': ['T24', 'beta.1'], '9': ['T10', 'beta.1', 'T24'],
    '10': ['T18', 'RC', 'T09', 'T16', 'T28'],
    '11': ['T05', 'RC', 'T06', 'T27'], '11.2': ['T08', 'beta.1'],
    '11.3': ['T10', 'RC', 'T15', 'T16', 'T24', 'T27'],
    '12': ['T28', 'RC', 'T10', 'T12', 'T16', 'T24'],
    '13': ['T13', 'stable', 'T25', 'T27', 'T32'],
    '14': ['T27', 'RC', 'T33'], '15': ['T25', 'stable', 'T32'],
    '16': ['T32', 'stable', 'T13'], '17': ['T29', 'stable', 'T13', 'T32'],
    '18': ['T29', 'RC'], '19': ['T32', 'stable'],
    '19.1': ['T32', 'stable', 'T26'], '19.2': ['T32', 'stable'],
    '19.3': ['T30', 'RC', 'T03'], '19.4': ['T04', 'beta.1', 'T13', 'T26'],
};
const verification = section => {
    if (/^(1|2|3)(\.|$)|^19\.3/.test(section)) return ['manual: product/scope/pilot evidence'];
    if (section === '5.7') return ['automated: public positive/negative type fixtures, bundler/NodeNext'];
    if (/^(4|5\.3\.1|11\.2)(\.|$)/.test(section)) return ['automated: pure table tests', 'automated: integration where applicable'];
    if (/^(13|14|15|17|19\.2)(\.|$)/.test(section)) return ['automated: packed consumer/release harness', 'manual: exact runtime/evidence audit'];
    if (/^(16|18)(\.|$)/.test(section)) return ['automated: package/docs checks', 'manual: source/document audit'];
    return ['automated: state/browser regression', 'manual: focus/AT/visual oracle where required'];
};
const subchecks = {
    R02: [['alpha.1', 'T07', 'Exclusive midnight and moment membership'], ['beta.1', 'T24', 'Move preserves missing end; proposal owned by T21']],
    R15: [['alpha.1', 'T10', 'Delayed PageDown clamping and Tab-away'], ['alpha.2', 'T18', 'RTL viewer navigation'], ['beta.1', 'T24', 'Cross-month range selection in LTR/RTL']],
    R27: [['alpha.2', 'T17', 'Controlled filter acceptance, checked-state, source fallback and all presentations'], ['beta.1', 'T24', 'Cancel hidden draft once; separately preserve issued pending request']],
    R35: [['alpha.1', 'T11', 'Week segments and press hit date'], ['alpha.2', 'T18', 'Viewer render/class contexts and appearance'], ['beta.1', 'T24', 'Selection intersects each segment independently']],
};
const previous = existsSync(outputPath) ? JSON.parse(readFileSync(outputPath, 'utf8')) : null;
const priorEntries = new Map(previous?.requirements.map(r => [r.id, r]) ?? []);
const requirements = [];
let section = null;
let regressionIndex = 0;
const lines = source.split('\n');
function add(text, startLine, endLine, kind) {
    if (!section || section.startsWith('20')) return;
    if (kind === 'table' && /^\|\s*:?-+/.test(text)) return;
    let key = section;
    while (!ownership[key]) key = key.split('.').slice(0, -1).join('.');
    let [owner, milestone, ...contributors] = ownership[key];
    let id = `S${section}-${hash(text).slice(0, 12)}`;
    if (section === '19.4' && kind === 'table') {
        if (text.startsWith('| Сценарий |')) return;
        const row = regression[regressionIndex++];
        assert.ok(row, 'Unmapped regression scenario');
        [id, , owner, milestone] = row.slice(1);
        contributors = [];
        kind = 'regression';
    }
    const old = priorEntries.get(id);
    const fingerprint = hash(text);
    if (old && old.source.sha256 !== fingerprint) {
        throw new Error(`${id} changed: review correspondence and evidence before regenerating`);
    }
    const entry = {
        id, kind, owner, contributors, milestone,
        source: {path: sourcePath, section, startLine, endLine, sha256: fingerprint, text},
        verification: kind === 'reference-code' ? ['manual: contextual example, not a standalone runnable fixture'] : verification(section),
        status: old?.status ?? 'planned', evidence: old?.evidence ?? [],
    };
    if (subchecks[id]) entry.subchecks = subchecks[id].map(([milestone, owner, expected], i) => ({
        id: `${id}.${i + 1}`, owner, milestone, expected,
        status: old?.subchecks?.[i]?.status ?? 'planned', evidence: old?.subchecks?.[i]?.evidence ?? [],
    }));
    requirements.push(entry);
}
for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const heading = line.match(/^#{2,4} (\d+(?:\.\d+)*)(?:\.|\s)/);
    if (heading) { section = heading[1]; continue; }
    if (!line.trim() || !section || section.startsWith('20')) continue;
    const start = i;
    let kind = line.startsWith('|') ? 'table' : 'specification-block';
    if (line.startsWith('```')) {
        kind = section === '5.7' ? 'public-type-contract' : 'reference-code';
        while (++i < lines.length && !lines[i].startsWith('```')) {}
        assert.ok(i < lines.length, 'Unclosed code fence');
    } else if (kind !== 'table') {
        while (i + 1 < lines.length && lines[i + 1].trim() && !/^(#{2,4} |```|\||- |\d+\. )/.test(lines[i + 1])) i++;
    }
    add(lines.slice(start, i + 1).join('\n'), start + 1, i + 1, kind);
}
assert.equal(regressionIndex, 74);
assert.equal(new Set(requirements.map(r => r.id)).size, requirements.length, 'Duplicate requirement IDs');
for (const requirement of requirements) {
    if (requirement.status === 'pass') assert.ok(requirement.evidence.length, `${requirement.id}: pass without evidence`);
    if (requirement.status === 'pass' && requirement.subchecks) {
        assert.ok(requirement.subchecks.every(s => s.status === 'pass' && s.evidence.length), `${requirement.id}: partial pass`);
    }
}
const problems = ledgerProblems(requirements);
assert.equal(problems.length, 0, `Malformed ledger records:\n${problems.join('\n')}`);
const result = `${JSON.stringify({
    schemaVersion: 1, specificationSha256: hash(source),
    note: 'Exact source-block coverage; prose includes context. Reference code is not an independent release gate. T01 does not mark implementation requirements passed. Section 20 is out of scope. ' +
        'Evidence paths under docs/implementation/evidence/ refer to historical, unversioned local artifacts that were archived outside the repository on 2026-10-22; ' +
        'from then on proof is re-runnable checks (tests, type/contract, docs and browser probes with documented commands), CI and npm provenance of the release workflow.',
    requirements,
}, null, 2)}\n`;
if (process.argv.includes('--write')) writeFileSync(outputPath, result);
else assert.equal(readFileSync(outputPath, 'utf8'), result, 'Ledger is stale; review source/plan changes and run --write');
console.log(`${requirements.length} source blocks, 74 regression rows, 4 composite scenarios: ${process.argv.includes('--write') ? 'written' : 'verified'}`);
