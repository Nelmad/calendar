import {useState} from 'react';
import {Calendar, classicTheme, neutralTheme} from '@nelmad/calendar';
import '@nelmad/calendar/styles.css';
import {mount} from './shell.jsx';

// The full Calendar of the size protocol: the day agenda, item actions, sources and both themes stay reachable at
// runtime. The options come from the query string, so no theme or layout is a compile-time constant.
const search = new URLSearchParams(location.search);
const sources = [{id: 'work', title: 'Work', color: '#0b57d0'}, {id: 'home', title: 'Home', color: '#188038'}];
const items = [
    {id: 'review', title: 'Design review', calendarId: 'work', interval: {kind: 'timed', start: '2026-09-03T10:00:00+03:00', end: '2026-09-03T11:30:00+03:00'}},
    {id: 'standup', title: 'Standup', interval: {kind: 'timed', start: '2026-09-08T09:30:00+03:00', end: '2026-09-08T09:45:00+03:00'}},
    {id: 'trip', title: 'Trip', calendarId: 'home', interval: {kind: 'allDay', start: '2026-09-10', end: '2026-09-13'}},
    {id: 'holiday', title: 'Holiday', interval: {kind: 'allDay', start: '2026-09-18', end: '2026-09-19'}},
];
const actions = [{id: 'edit', label: 'Edit'}, {id: 'delete', label: 'Delete', tone: 'danger'}];

function Fixture() {
    const [anchorDate, setAnchorDate] = useState('2026-09-01');
    const [visibleSourceIds, setVisibleSourceIds] = useState(sources.map(source => source.id));
    return <Calendar aria-label="Calendar" items={items} anchorDate={anchorDate} onNavigate={setAnchorDate}
        timeZone={search.get('timeZone') ?? 'Europe/Moscow'} locale={search.get('locale') ?? 'en-US'} layout={search.get('layout') ?? 'auto'}
        theme={search.get('theme') === 'neutral' ? neutralTheme : classicTheme}
        onItemPress={({item, date}) => console.info('press', item.id, date)}
        getItemActions={() => actions} onItemActionRequest={({item, actionId}) => console.info('action', actionId, item.id)}
        sources={sources} visibleSourceIds={visibleSourceIds} onVisibleSourceIdsChange={setVisibleSourceIds}/>;
}

mount(<Fixture/>);
