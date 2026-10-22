import {createDateAdapter, parseRFC3339, MIN_INSTANT, MAX_INSTANT} from '../../../src/v02/core/date';
import {acceptedTimeZoneIdentifiers} from '../../../src/v02/core/timeZones.generated';

export function probeTimeZones(identifiers: string[]) {
    // Capability probes use the entire tzdb primary universe, even if a previous
    // candidate excluded an ID. They cannot expand runtime package membership.
    const dates = createDateAdapter(new Set(identifiers));
    const samples = [MIN_INSTANT, -11_676_096_000_000, -2_208_988_800_000, 0, 1_767_268_800_000, 1_782_907_200_000, MAX_INSTANT];
    return identifiers.map(identifier => {
        try {
            for (const instant of samples) {
                const projected = dates.projectInstant(instant, identifier);
                if (!Number.isFinite(projected.offsetMilliseconds) || Math.abs(projected.offsetMilliseconds) > 86_400_000) throw new Error('Invalid projection');
                if (parseRFC3339(dates.serializeInstant(instant, identifier)) !== instant) throw new Error('Round trip failed');
            }
            const wall = {date: '2026-02-03', hour: 12, minute: 34, second: 56, millisecond: 789};
            const projected = dates.projectInstant(dates.resolveWallTime(wall, identifier), identifier);
            if (Object.entries(wall).some(([key, value]) => projected[key as keyof typeof projected] !== value)) throw new Error('Wall-time conversion failed');
            return {identifier, supported: true};
        } catch (error) {
            return {identifier, supported: false, reason: String(error)};
        }
    });
}

export function probeMembership(identifiers: unknown[]) {
    const dates = createDateAdapter();
    return identifiers.map(identifier => {
        try { return dates.validateTimeZone(identifier); }
        catch { return null; }
    });
}

export const packageIdentifiers = acceptedTimeZoneIdentifiers;
