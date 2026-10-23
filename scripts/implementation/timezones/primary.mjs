// Private build-time projection of ECMA-402 edition 12 §6.5.1 -> §6.5.3.
// We need only Identifier === PrimaryIdentifier, never an alias canonicalizer.
import {createHash} from 'node:crypto';

export const sha256 = value => createHash('sha256').update(value).digest('hex');
export const listHash = identifiers => sha256(identifiers.join('\n') + '\n');
const invariant = (condition, reason) => { if (!condition) throw new Error(reason); };

export function primaryIdentifiers(sourceTexts, zoneTab, backzone, pendingRenames = []) {
    const entries = new Map();
    const folded = new Set();
    for (const text of sourceTexts) {
        for (const line of text.split('\n')) {
            const fields = line.split('#')[0].trim().split(/\s+/);
            if (fields[0] !== 'Zone' && fields[0] !== 'Link') continue;
            const [kind, target, link] = fields;
            const identifier = kind === 'Zone' ? target : link;
            invariant(identifier && target && /^[A-Za-z0-9_+/-]+$/.test(identifier), 'Malformed Zone/Link');
            invariant(!folded.has(identifier.toLowerCase()), `Duplicate identifier: ${identifier}`);
            folded.add(identifier.toLowerCase());
            entries.set(identifier, {kind, target});
        }
    }
    const territorial = new Set();
    for (const line of zoneTab.split('\n')) {
        if (!line.trim() || line.startsWith('#')) continue;
        const [country, coordinates, identifier] = line.split('\t');
        invariant(/^[A-Z]{2}$/.test(country) && coordinates && entries.has(identifier), `Invalid zone.tab: ${line}`);
        invariant(!territorial.has(identifier), `Duplicate zone.tab entry: ${identifier}`);
        territorial.add(identifier);
    }
    // §6.5.1 step 5.b maps a non-territorial Link to a different identifier:
    // a Zone, a zone.tab identifier, or a backzone Link target. Confirm that the
    // third case cannot be a self-link; its country routing cannot affect the set.
    for (const line of backzone.split('\n')) {
        const match = /^(?:#PACKRATLIST zone\.tab )?Link\s+(\S+)\s+(\S+)/.exec(line);
        if (!match) continue;
        invariant(match[1] !== match[2] && entries.has(match[1]) && entries.has(match[2]), 'Invalid backzone Link');
    }
    for (const identifier of entries.keys()) {
        const visited = new Set();
        let current = identifier;
        while (true) {
            invariant(!visited.has(current), `Link cycle: ${identifier}`);
            visited.add(current);
            const entry = entries.get(current);
            invariant(entry, `Unresolved Link: ${identifier} -> ${current}`);
            if (entry.kind === 'Zone') break;
            current = entry.target;
        }
    }
    invariant(entries.has('UTC'), 'UTC must be present in tzdb');
    const accepted = new Set([...entries].filter(([id, entry]) => entry.kind === 'Zone' || territorial.has(id)).map(([id]) => id));
    // §6.5.1 step 5.c: these three primary candidates resolve to UTC instead.
    for (const id of ['Etc/UTC', 'Etc/GMT', 'GMT']) accepted.delete(id);
    accepted.add('UTC');
    const waiting = new Map();
    for (const {replacement, renamed} of pendingRenames) {
        invariant(accepted.has(replacement) && entries.get(renamed)?.kind === 'Link', 'Invalid pending rename');
        invariant(!waiting.has(replacement) && !accepted.has(renamed), 'Conflicting pending rename');
        accepted.delete(replacement);
        accepted.add(renamed);
        waiting.set(replacement, renamed);
    }
    const all = [...entries.keys()].sort();
    const identifiers = [...accepted].sort();
    const exclusions = all.filter(id => !accepted.has(id)).map(identifier => ({identifier,
        reason: waiting.has(identifier) ? 'rename-waiting-period' : ['Etc/UTC', 'Etc/GMT', 'GMT'].includes(identifier) ? 'utc-primary-exception' : 'non-primary-link',
    }));
    return {all, identifiers, exclusions, primaryLinks: identifiers.filter(id => entries.get(id).kind === 'Link')};
}

export function intersectCapabilities(primary, reports, requiredMinimum) {
    const exclusions = [];
    const identifiers = primary.filter(identifier => {
        const unsupported = reports.filter(report => {
            invariant(report.primaryListSha256 === listHash(primary), 'Runtime report has a different primary list');
            invariant(report.results.length === primary.length && report.results.every((row, i) => row.identifier === primary[i] && typeof row.supported === 'boolean'), 'Incomplete runtime report');
            return !report.results.find(row => row.identifier === identifier).supported;
        });
        if (unsupported.length) exclusions.push({identifier, reason: 'runtime-unsupported', runtimes: unsupported.map(report => report.runtime)});
        return !unsupported.length;
    });
    invariant(requiredMinimum.every(id => identifiers.includes(id)), 'Required minimum unsupported; cannot narrow the contract');
    return {identifiers, exclusions};
}
