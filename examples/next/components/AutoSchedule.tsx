'use client';
import {useState} from 'react';
import {Calendar, type CalendarItem} from '@nelmad/calendar';
import '@nelmad/calendar/styles.css';

const items: CalendarItem<{room: string}>[] = [
    {id: 'standup', title: 'Стендап', data: {room: '301'},
        interval: {kind: 'timed', start: '2026-09-03T10:00:00+03:00', end: '2026-09-03T10:15:00+03:00'}},
    {id: 'offsite', title: 'Выездная сессия', data: {room: 'Парк'},
        interval: {kind: 'allDay', start: '2026-09-10', end: '2026-09-12'}},
];

// The quick start with the default layout="auto": the width of the calendar chooses the desktop grid with a
// popover agenda or the compact mobile month with the agenda below it. Without a `today` snapshot the package
// determines today after hydration.
export function AutoSchedule() {
    const [anchorDate, setAnchorDate] = useState('2026-09-01');
    const [opened, setOpened] = useState('');
    return <>
        <Calendar items={items} timeZone="Europe/Moscow" locale="ru-RU" anchorDate={anchorDate} onNavigate={setAnchorDate}
            onItemPress={({item}) => setOpened(`${item.title}: ${item.data.room}`)}/>
        <p id="opened" aria-live="polite">{opened}</p>
    </>;
}
