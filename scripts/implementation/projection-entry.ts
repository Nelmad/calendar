import {createDateAdapter, type WallTime} from '../../src/v02/core/date';
import {createIntervalProjector} from '../../src/v02/core/projection';
import {buildCalendarIndex, fitWeekLanes} from '../../src/v02/core/layout';
import {validateRecords} from '../../src/v02/core/validation';
import type {CalendarItem, CalendarDateRange} from '../../src/v02/reference';

export function runWallTime(input: {wall: WallTime; timeZone: string}) {
    const dates = createDateAdapter();
    try {
        const instant = dates.resolveWallTime(input.wall, input.timeZone);
        const projected = dates.projectInstant(instant, input.timeZone);
        for (const key of ['date', 'hour', 'minute', 'second', 'millisecond'] as const) {
            if (projected[key] !== input.wall[key]) throw new Error(`Wall time changed: ${key}`);
        }
        return new Date(instant).toISOString();
    } catch (error) {
        if (!(error instanceof RangeError)) throw error;
        return error.message;
    }
}

export function runProjection(input: {items: CalendarItem[]; timeZone: string; range: CalendarDateRange; agenda: string[]}) {
    const dates = createDateAdapter(), projector = createIntervalProjector(dates);
    const records = validateRecords({items: input.items, timeZone: input.timeZone, anchorDate: input.range.start, onNavigate() {}}, dates, 'Untitled');
    const index = buildCalendarIndex(records, projector, input.timeZone, input.range);
    return {
        order: index.entries.map(entry => entry.record.item.id),
        counts: index.entries.map(entry => projector.project(entry.record.interval, input.timeZone).dayCount),
        dates: index.entries.map(entry => [entry.membership.first, entry.membership.end]),
        weeks: index.weeks.map(week => ({segments: week.segments.map(segment => ({id: segment.entry.record.item.id, lane: segment.lane, range: segment.segmentRange})), overflow: fitWeekLanes(week, {withoutOverflow: 2, withOverflow: 1}).days})),
        agenda: input.agenda.map(date => ({date, ids: index.agenda(date).map(entry => entry.record.item.id), instants: projector.dayInstants(date, input.timeZone)})),
    };
}
