import type {CalendarItem, CalendarVisibleRange, ISODate} from '@nelmad/calendar';

/** Domain fields live in `data`: the calendar passes them back untouched in callbacks. */
export type Ticket = {ticket: number; owner: string};
export type ReleaseItem = CalendarItem<Ticket>;

/**
 * One snapshot shared by the server render and the client. A real app computes `today`
 * on the server for the user's zone and sends the same value to both sides.
 */
export const release = {anchorDate: '2026-09-01', today: '2026-09-03', timeZone: 'Europe/Moscow', locale: 'ru-RU'} as const;

const day = (date: ISODate, offset: number) => {
    const value = new Date(`${date}T00:00:00Z`);
    value.setUTCDate(value.getUTCDate() + offset);
    return value.toISOString().slice(0, 10);
};
const planning: ReleaseItem[] = Array.from({length: 18}, (_, week) => {
    const date = day('2026-08-03', week * 7);
    return {id: `planning-${date}`, title: 'Планёрка', data: {ticket: 100 + week, owner: 'team'},
        interval: {kind: 'timed', start: `${date}T10:00:00+03:00`, end: `${date}T10:30:00+03:00`}};
});
/** The simulated database. All-day `end` is exclusive: 2026-09-02..2026-09-06 covers 2–5 September. */
const database: readonly ReleaseItem[] = [
    {id: 'sprint', title: 'Подготовка релиза', data: {ticket: 42, owner: 'anna'}, interval: {kind: 'allDay', start: '2026-09-02', end: '2026-09-06'}},
    {id: 'review', title: 'Проверка релиза', data: {ticket: 43, owner: 'oleg'}, interval: {kind: 'timed', start: '2026-09-03T09:00:00+03:00', end: '2026-09-03T10:00:00+03:00'}},
    ...Array.from({length: 8}, (_, i): ReleaseItem => ({id: `task-${i + 1}`, title: `Задача ${i + 1}`, data: {ticket: 50 + i, owner: 'team'},
        interval: {kind: 'allDay', start: '2026-09-03', end: '2026-09-04'}})),
    {id: 'freeze', title: 'Code freeze', data: {ticket: 61, owner: 'anna'}, interval: {kind: 'allDay', start: '2026-09-28', end: '2026-10-03'}},
    {id: 'launch', title: 'Публикация 0.2', data: {ticket: 62, owner: 'oleg'}, interval: {kind: 'timed', start: '2026-10-15T12:00:00+03:00'}},
    {id: 'retro', title: 'Ретроспектива', data: {ticket: 63, owner: 'team'}, interval: {kind: 'timed', start: '2026-10-22T16:00:00+03:00', end: '2026-10-22T17:30:00+03:00'}},
    ...planning,
];

/** Cache and request key: the visible range is the tuple (start, end, timeZone). */
export const rangeKey = (range: CalendarVisibleRange) => `${range.start} → ${range.end} · ${range.timeZone}`;

/**
 * Simulated backend query for a visible range. Timed items are matched with a one-day
 * margin on each side instead of guessing local midnights: items outside the grid are
 * allowed in `items` and are simply not drawn.
 */
export function loadRange(range: CalendarVisibleRange, options: {latency?: number; fail?: boolean; signal?: AbortSignal} = {}): Promise<ReleaseItem[]> {
    const from = day(range.start, -1), to = day(range.end, 1);
    const result = database.filter(({interval}) => interval.kind === 'allDay'
        ? interval.start < range.end && interval.end > range.start
        : new Date(interval.end ?? interval.start).toISOString().slice(0, 10) >= from && new Date(interval.start).toISOString().slice(0, 10) < to);
    if (!options.latency) return options.fail ? Promise.reject(new Error('Backend unavailable')) : Promise.resolve(result);
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => options.fail ? reject(new Error('Backend unavailable')) : resolve(result), options.latency);
        options.signal?.addEventListener('abort', () => { clearTimeout(timer); reject(options.signal!.reason); });
    });
}
