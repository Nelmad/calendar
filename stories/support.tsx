import {useRef, useState, type CSSProperties, type ReactNode} from 'react';
import type {CalendarItem, CalendarVisibleRange, IanaTimeZone, ISODate} from '@nelmad/calendar';

/** Story helpers: public API types only, deterministic dates and an in-page event log. */
export type Ticket = {ticket: number};
export const september: Readonly<{anchorDate: ISODate; today: ISODate; timeZone: IanaTimeZone}> = {anchorDate: '2026-09-01', today: '2026-09-03', timeZone: 'Europe/Moscow'};

export const shiftDate = (date: ISODate, days: number) => {
    const value = new Date(`${date}T00:00:00Z`);
    value.setUTCDate(value.getUTCDate() + days);
    return value.toISOString().slice(0, 10);
};
const timed = (id: string, title: string, start: string, end: string | undefined, ticket: number): CalendarItem<Ticket> =>
    ({id, title, data: {ticket}, interval: {kind: 'timed', start, ...(end ? {end} : {})}});
const allDay = (id: string, title: string, start: ISODate, end: ISODate, ticket: number): CalendarItem<Ticket> =>
    ({id, title, data: {ticket}, interval: {kind: 'allDay', start, end}});

/** A small release month: all-day bars, timed chips, a moment and a crowded day. */
export const releaseItems: CalendarItem<Ticket>[] = [
    allDay('sprint', 'Подготовка релиза', '2026-09-02', '2026-09-06', 42),
    timed('review', 'Проверка релиза', '2026-09-03T09:00:00+03:00', '2026-09-03T10:00:00+03:00', 43),
    timed('demo', 'Демо заказчику', '2026-09-03T15:00:00+03:00', '2026-09-03T16:00:00+03:00', 44),
    ...Array.from({length: 5}, (_, i) => allDay(`task-${i + 1}`, `Задача ${i + 1}`, '2026-09-03', '2026-09-04', 50 + i)),
    allDay('vacation', 'Отпуск Анны', '2026-09-14', '2026-09-26', 60),
    timed('deploy', 'Выкладка', '2026-09-17T23:00:00+03:00', '2026-09-18T01:30:00+03:00', 61),
    timed('launch', 'Публикация', '2026-09-24T12:00:00+03:00', undefined, 62),
    timed('retro', 'Ретроспектива', '2026-09-30T16:00:00+03:00', '2026-09-30T17:00:00+03:00', 63),
];

/** Several items on every weekday of the month, for sizing and overflow. */
export function crowdedItems(perDay: number): CalendarItem<Ticket>[] {
    return Array.from({length: 30}, (_, i) => shiftDate('2026-09-01', i)).filter(date => ![0, 6].includes(new Date(`${date}T00:00:00Z`).getUTCDay()))
        .flatMap((date, d) => Array.from({length: perDay}, (_, n) => timed(`${date}-${n}`, `Встреча ${n + 1}`, `${date}T${String(9 + n).padStart(2, '0')}:00:00+03:00`,
            `${date}T${String(9 + n).padStart(2, '0')}:45:00+03:00`, d * 10 + n)));
}

/** Backend-side range query with a one-day margin: records outside the grid are allowed and simply not drawn. */
export const itemsInRange = (range: CalendarVisibleRange, items: readonly CalendarItem<Ticket>[]) => items.filter(({interval}) => {
    const start = interval.start.slice(0, 10), end = interval.kind === 'allDay' ? interval.end : (interval.end ?? interval.start).slice(0, 10);
    return start < shiftDate(range.end, 1) && end >= shiftDate(range.start, -1);
});
/** Simulated backend for a visible range; rejects when `fail` is set. */
export function fetchRange(range: CalendarVisibleRange, items: readonly CalendarItem<Ticket>[], latency: number, fail: boolean, signal: AbortSignal) {
    return new Promise<CalendarItem<Ticket>[]>((resolve, reject) => {
        const timer = setTimeout(() => fail ? reject(new Error('Backend unavailable')) : resolve(itemsInRange(range, items)), latency);
        signal.addEventListener('abort', () => { clearTimeout(timer); reject(signal.reason); });
    });
}
export const rangeKey = (range: CalendarVisibleRange) => `${range.start} → ${range.end} · ${range.timeZone}`;

/** Newest-first event log rendered next to a story. */
export function useLog() {
    const [entries, setEntries] = useState<{id: number; text: string}[]>([]), counter = useRef(0);
    const add = (text: string) => {
        const id = ++counter.current;
        setEntries(current => [{id, text}, ...current].slice(0, 12));
    };
    return [entries, add] as const;
}
export function Log({title, entries}: {title: string; entries: readonly {id: number; text: string}[]}) {
    return <section aria-label={title} style={{marginBlockStart: 12, fontSize: 14}}>
        <strong>{title}</strong>
        {entries.length ? <ol style={{margin: '4px 0 0', paddingInlineStart: 20, overflowWrap: 'anywhere'}}>{entries.map(entry => <li key={entry.id}><code>{entry.text}</code></li>)}</ol>
            : <p style={{margin: '4px 0 0', color: 'GrayText'}}>—</p>}
    </section>;
}

export const frame: CSSProperties = {maxWidth: 1100, marginInline: 'auto'};
export function Toolbar({children}: {children: ReactNode}) {
    // Long values (JSON, ranges) wrap anywhere instead of widening the page on a phone.
    return <div style={{display: 'flex', flexWrap: 'wrap', gap: '8px 16px', alignItems: 'center', marginBlockEnd: 12, fontSize: 14, overflowWrap: 'anywhere'}}>{children}</div>;
}
export function Side({title, children}: {title: string; children: ReactNode}) {
    return <figure style={{margin: 0, minWidth: 0}}><figcaption style={{fontWeight: 600, marginBlockEnd: 8}}>{title}</figcaption>{children}</figure>;
}
export function Columns({children}: {children: ReactNode}) {
    // One column below 420 px of available width, so side-by-side comparisons never scroll the page horizontally.
    return <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(420px, 100%), 1fr))', gap: 24}}>{children}</div>;
}
