// Shape of the ledger records that requirements.mjs carries between regenerations (decisions 2026-10-22 fix round 1,
// DV8-1-01: a migration once spread string evidence into per-character objects and the ledger still verified).
export const statuses = ['planned', 'in_progress', 'pass'];
const fields = new Set(['kind', 'milestone', 'paths', 'scope', 'migration']);
const text = value => typeof value === 'string' && value.trim() !== '';

/** Why an evidence entry is malformed, or null: a non-empty note string, or {kind, paths, scope[, milestone, migration]}. */
export function evidenceProblem(entry) {
    if (typeof entry === 'string') return entry.trim() ? null : 'empty note';
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return `expected a note string or a record, got ${Array.isArray(entry) ? 'array' : typeof entry}`;
    const extra = Object.keys(entry).filter(key => !fields.has(key));
    if (extra.length) return `unknown fields ${extra.slice(0, 5).join(', ')}${extra.length > 5 ? ` (+${extra.length - 5})` : ''}`;
    if (entry.kind !== 'pass' && entry.kind !== 'partial') return `kind ${JSON.stringify(entry.kind)} is not pass or partial`;
    if (!Array.isArray(entry.paths) || !entry.paths.length || !entry.paths.every(text)) return 'paths must be a non-empty list of paths';
    if (!text(entry.scope)) return 'scope must be a non-empty string';
    for (const key of ['milestone', 'migration']) if (key in entry && !text(entry[key])) return `${key} must be a non-empty string`;
    return null;
}

/** Every problem of the status/evidence records of the requirements and their subchecks, as "<id> ...: <problem>". */
export function ledgerProblems(requirements) {
    const problems = [];
    const check = (id, record) => {
        if (!statuses.includes(record.status)) problems.push(`${id}: status ${JSON.stringify(record.status)}`);
        if (!Array.isArray(record.evidence)) return void problems.push(`${id}: evidence is not a list`);
        record.evidence.forEach((entry, i) => { const problem = evidenceProblem(entry); if (problem) problems.push(`${id} evidence[${i}]: ${problem}`); });
    };
    for (const requirement of requirements) {
        check(requirement.id, requirement);
        for (const subcheck of requirement.subchecks ?? []) check(subcheck.id, subcheck);
    }
    return problems;
}
