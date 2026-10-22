import {StrictMode, useState} from 'react';
import {createRoot} from 'react-dom/client';
import {Calendar, type CalendarItem} from '@nelmad/calendar';
import calendarCss from '@nelmad/calendar/styles.css?inline';

// QA-05 probe: a consumer install with one react-stately. React Aria presses and the modal sheet work inside a ShadowRoot
// only when the Shadow DOM flag the SDK enables is the one React Aria reads. `?case=`:
// all: Calendar and its portal in a ShadowRoot; portal: Calendar in the document, portal in a ShadowRoot;
// sheet-document / sheet-shadow: the mobile modal sheet portaled into a ShadowRoot, Calendar in the document / the same ShadowRoot.
const items: CalendarItem<{room: string}>[] = [
    {id: 'standup', title: 'Standup', data: {room: '301'}, interval: {kind: 'timed', start: '2026-09-03T10:00:00+03:00', end: '2026-09-03T10:15:00+03:00'}},
    {id: 'review', title: 'Review', data: {room: '302'}, interval: {kind: 'timed', start: '2026-09-03T12:00:00+03:00', end: '2026-09-03T13:00:00+03:00'}},
    {id: 'offsite', title: 'Offsite', data: {room: 'Park'}, interval: {kind: 'allDay', start: '2026-09-10', end: '2026-09-12'}},
];
const log: string[] = [];
Object.assign(window, {__log: log});
const style = document.createElement('style'); style.textContent = calendarCss; document.head.append(style);
const host = document.getElementById('host')!, shadow = host.attachShadow({mode: 'open'});
const sheet = new CSSStyleSheet(); sheet.replaceSync(calendarCss); shadow.adoptedStyleSheets = [sheet];
const kind = new URLSearchParams(location.search).get('case') ?? 'all';
const mobile = kind.startsWith('sheet') ? {layout: 'mobile', agendaPresentation: 'overlay'} as const : {layout: 'desktop'} as const;
function Probe() {
    const [anchorDate, setAnchorDate] = useState('2026-09-01');
    return <Calendar items={items} timeZone="Europe/Moscow" locale="en-US" today="2026-09-03" anchorDate={anchorDate} portalContainer={shadow} {...mobile}
        onNavigate={date => { log.push(`navigate ${date}`); setAnchorDate(date); }} onItemPress={({item, view}) => log.push(`press ${item.id} ${view}`)}/>;
}
const mount = document.createElement('div');
if (kind === 'all' || kind === 'sheet-shadow') shadow.append(mount); else host.before(mount);
createRoot(mount).render(<StrictMode><Probe/></StrictMode>);
