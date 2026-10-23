import {useState} from 'react';
import type {Meta, StoryObj} from '@storybook/react';
import {Calendar, type CalendarItem, type IanaTimeZone, type ISODate} from '@nelmad/calendar';
import {Toolbar, frame} from './support';

type Note = {note: string};
const item = (id: string, title: string, interval: CalendarItem<Note>['interval'], note: string): CalendarItem<Note> => ({id, title, interval, data: {note}});

const berlinSpring = [
    item('night', 'Выкладка, 1 ч', {kind: 'timed', start: '2026-03-29T01:30:00+01:00', end: '2026-03-29T03:30:00+02:00'}, '01:30 CET → 03:30 CEST: one elapsed hour'),
    item('after', 'Сразу после перехода', {kind: 'timed', start: '2026-03-29T03:00:00+02:00'}, 'First valid minute after the gap'),
    item('moscow', 'Созвон из Москвы', {kind: 'timed', start: '2026-03-29T10:00:00+03:00', end: '2026-03-29T11:00:00+03:00', timeZone: 'Europe/Moscow'}, 'Authored in Europe/Moscow, displayed at 09:00 in Berlin'),
    item('weekend', 'Выходные', {kind: 'allDay', start: '2026-03-28', end: '2026-03-30'}, 'All-day dates never shift'),
];
const berlinAutumn = [
    item('first', 'Первое 02:30', {kind: 'timed', start: '2026-10-25T02:30:00+02:00', end: '2026-10-25T02:45:00+02:00'}, '02:30 CEST, before the fold'),
    item('second', 'Второе 02:30', {kind: 'timed', start: '2026-10-25T02:30:00+01:00', end: '2026-10-25T02:45:00+01:00'}, '02:30 CET, one hour later'),
];
const apia = [
    item('gap', 'Через пропущенный день', {kind: 'timed', start: '2011-12-29T23:00:00-10:00', end: '2011-12-31T01:00:00+14:00'}, 'Two elapsed hours: segments on 29 and 31 December only'),
    item('days', 'Три даты', {kind: 'allDay', start: '2011-12-29', end: '2012-01-01'}, 'All-day keeps 29, 30 and 31 December'),
    item('moment', 'Момент', {kind: 'timed', start: '2011-12-29T10:00:00-10:00'}, 'A moment without end'),
];
const travel = [
    item('late', 'Поздний звонок', {kind: 'timed', start: '2026-09-10T23:30:00+03:00', end: '2026-09-11T00:15:00+03:00'}, '23:30 Moscow'),
    item('utc', 'Отчёт (UTC)', {kind: 'timed', start: '2026-09-15T22:00:00Z'}, 'Given in UTC'),
    item('trip', 'Командировка', {kind: 'allDay', start: '2026-09-21', end: '2026-09-24'}, 'All-day: same dates in every zone'),
];

function Zoned({items, timeZone, anchorDate, today}: {items: CalendarItem<Note>[]; timeZone: IanaTimeZone; anchorDate: ISODate; today: ISODate}) {
    const [anchor, setAnchor] = useState(anchorDate);
    const [note, setNote] = useState('');
    return <div style={frame}>
        <Calendar items={items} timeZone={timeZone} today={today} locale="ru-RU" hourCycle={24} layout="desktop" anchorDate={anchor} onNavigate={setAnchor}
            onItemPress={({item, date}) => setNote(`${item.title} (${date}): ${item.data.note} — ${item.interval.start}${item.interval.kind === 'timed' && item.interval.end ? ` / ${item.interval.end}` : ''}`)}/>
        <p aria-live="polite" style={{fontSize: 14}}>{note || 'Press an item to see its exact interval.'}</p>
    </div>;
}
function DisplayZones() {
    const [timeZone, setTimeZone] = useState('Europe/Moscow');
    return <>
        <div style={frame}><Toolbar><label>timeZone <select value={timeZone} onChange={event => setTimeZone(event.target.value)}>
            {['Europe/Moscow', 'Europe/Berlin', 'America/New_York', 'Asia/Tokyo', 'UTC'].map(zone => <option key={zone}>{zone}</option>)}
        </select></label></Toolbar></div>
        <Zoned items={travel} timeZone={timeZone} anchorDate="2026-09-01" today="2026-09-03"/>
    </>;
}

const meta = {
    title: 'Calendar/Time zones and DST',
    tags: ['autodocs'],
    parameters: {docs: {description: {component: `
\`timeZone\` is the IANA display zone (an exact identifier from the built-in accepted set, e.g. \`Europe/Moscow\`; \`+03:00\`,
\`GMT\` or \`europe/berlin\` are contract errors). Timed values are RFC 3339 instants with an offset or \`Z\`; an item belongs to every
local date that one of its instants projects to, so DST gaps, folds and skipped civil days need no special casing. All-day
items are dates, not instants: changing the zone never moves them. \`interval.timeZone\` is the author's zone and is kept in payloads.
`}}},
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

export const BerlinSpringForward: Story = {name: 'Europe/Berlin, 2026-03-29 (gap)',
    render: () => <Zoned items={berlinSpring} timeZone="Europe/Berlin" anchorDate="2026-03-01" today="2026-03-29"/>};
export const BerlinFallBack: Story = {name: 'Europe/Berlin, 2026-10-25 (fold)',
    render: () => <Zoned items={berlinAutumn} timeZone="Europe/Berlin" anchorDate="2026-10-01" today="2026-10-25"/>,
    parameters: {docs: {description: {story: 'Both items show 02:30 but are different instants an hour apart; the order follows the instant.'}}}};
export const ApiaSkippedDay: Story = {name: 'Pacific/Apia, skipped 2011-12-30',
    render: () => <Zoned items={apia} timeZone="Pacific/Apia" anchorDate="2011-12-01" today="2011-12-29"/>,
    parameters: {docs: {description: {story: 'Samoa skipped 30 December 2011. The grid still has the date; the timed item lasts two hours and is absent from it, the all-day item covers it.'}}}};
export const DisplayZone: Story = {name: 'Switching the display zone', render: () => <DisplayZones/>,
    parameters: {docs: {description: {story: 'The same instants move between dates when the display zone changes; the all-day trip stays on 21–23 September.'}}}};
