import {createDateAdapter} from './date.js';
import {createIntervalProjector} from './projection.js';

/** Explicit instant input: safe in tests and never reads the current clock. */
export function todaySnapshot(instant: number, timeZone: string, dates = createDateAdapter()) {
    const date = dates.projectInstant(instant, timeZone).date;
    if (!date) throw new RangeError('Current local date is outside the ISO domain');
    const interval = createIntervalProjector(dates).dayInstants(date, timeZone).find(part => part.start <= instant && instant < part.end);
    if (!interval) throw new RangeError('Current instant has no local date membership');
    return {date, nextBoundary: interval.end};
}
