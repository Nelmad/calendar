import {Suspense, lazy, useEffect, useState, type ReactNode} from 'react';
import {Calendar, type CalendarItem} from '@nelmad/calendar';
import '@nelmad/calendar/styles.css';

const items: CalendarItem<{room: string}>[] = [
    {id: 'standup', title: 'Стендап', data: {room: '301'},
        interval: {kind: 'timed', start: '2026-09-03T10:00:00+03:00', end: '2026-09-03T10:15:00+03:00'}},
    {id: 'offsite', title: 'Выездная сессия', data: {room: 'Парк'},
        interval: {kind: 'allDay', start: '2026-09-10', end: '2026-09-12'}},
];
function Loaded() {
    // Marks the moment the boundary, the calendar included, has hydrated.
    useEffect(() => { document.documentElement.dataset.hydrated = 'true'; }, []);
    return <span id="sibling">loaded</span>;
}
// On the client the sibling suspends, so its Suspense boundary hydrates separately from the root (QA-01).
const Slow = lazy(() => new Promise<{default: () => ReactNode}>(resolve => setTimeout(() => resolve({default: Loaded}), 300)));
export function Suspended({path, server}: {path: string; server: boolean}) {
    const [anchorDate, setAnchorDate] = useState('2026-09-01');
    return <Suspense fallback={<p>Загрузка…</p>}>
        {server ? <span id="sibling">loaded</span> : <Slow/>}
        <Calendar items={items} timeZone="Europe/Moscow" locale="ru-RU" anchorDate={anchorDate} onNavigate={setAnchorDate}
            {...(path === '/desktop' ? {layout: 'desktop' as const} : {})}/>
    </Suspense>;
}
