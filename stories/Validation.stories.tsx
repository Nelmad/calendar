import {useState} from 'react';
import type {Meta, StoryObj} from '@storybook/react';
import {Calendar, type CalendarItem, type CalendarProps} from '@nelmad/calendar';
import {Toolbar, frame, september} from './support';

type Why = {why: string};
/** Runtime data is not trusted: these records come from an untyped source. */
const records = [
    {id: 'ok', title: 'Корректное событие', data: {why: 'valid'}, interval: {kind: 'allDay', start: '2026-09-03', end: '2026-09-04'}},
    {id: 'untitled', title: '   ', data: {why: 'empty title: shown as «Без названия», warning'}, interval: {kind: 'allDay', start: '2026-09-07', end: '2026-09-08'}},
    {id: 'short-date', title: 'Дата без нулей', data: {why: 'excluded: "2026-9-8" is not YYYY-MM-DD'}, interval: {kind: 'allDay', start: '2026-9-8', end: '2026-09-09'}},
    {id: 'inclusive', title: 'Инклюзивный конец', data: {why: 'excluded: all-day end must be after start'}, interval: {kind: 'allDay', start: '2026-09-10', end: '2026-09-10'}},
    {id: 'no-offset', title: 'Без смещения', data: {why: 'excluded: RFC 3339 needs an offset or Z'}, interval: {kind: 'timed', start: '2026-09-11T10:00:00'}},
    {id: 'reversed', title: 'Конец раньше начала', data: {why: 'excluded: end < start'}, interval: {kind: 'timed', start: '2026-09-14T12:00:00+03:00', end: '2026-09-14T11:00:00+03:00'}},
    {id: 'zone', title: 'Неизвестная зона автора', data: {why: 'excluded: interval.timeZone is not an accepted IANA identifier'}, interval: {kind: 'timed', start: '2026-09-15T10:00:00+03:00', timeZone: 'Europe/Moskva'}},
    {id: 'dup', title: 'Дубликат A', data: {why: 'excluded: duplicate id'}, interval: {kind: 'allDay', start: '2026-09-16', end: '2026-09-17'}},
    {id: 'dup', title: 'Дубликат B', data: {why: 'excluded: duplicate id'}, interval: {kind: 'allDay', start: '2026-09-17', end: '2026-09-18'}},
] as unknown as CalendarItem<Why>[];

function MalformedItemsDemo() {
    const [anchorDate, setAnchorDate] = useState(september.anchorDate);
    return <div style={frame}>
        <Calendar items={records} timeZone={september.timeZone} today={september.today} locale="ru-RU" layout="desktop" anchorDate={anchorDate} onNavigate={setAnchorDate}/>
        <ul style={{fontSize: 14}}>{records.map((record, i) => <li key={i}><code>{record.id}</code> {record.title.trim() || '(blank)'}: {record.data.why}</li>)}</ul>
    </div>;
}

const base = {items: [], timeZone: september.timeZone, anchorDate: september.anchorDate, onNavigate: () => {}, locale: 'ru-RU', layout: 'desktop'};
const configurations: Record<string, object> = {
    'timeZone="+03:00"': {...base, timeZone: '+03:00'},
    'timeZone="europe/moscow"': {...base, timeZone: 'europe/moscow'},
    'anchorDate="2026-02-30"': {...base, anchorDate: '2026-02-30'},
    'agendaDate without onAgendaDateChange': {...base, agendaDate: '2026-09-03'},
    'layout="tablet"': {...base, layout: 'tablet'},
    'mobileBreakpoint={0}': {...base, mobileBreakpoint: 0},
    'dataState={status: "done"}': {...base, dataState: {status: 'done'}},
};
function InvalidConfigurationDemo() {
    const [name, setName] = useState(Object.keys(configurations)[0]);
    return <div style={frame}>
        <Toolbar><label>Invalid input <select value={name} onChange={event => setName(event.target.value)}>
            {Object.keys(configurations).map(key => <option key={key}>{key}</option>)}</select></label></Toolbar>
        <Calendar {...configurations[name] as CalendarProps}/>
    </div>;
}

const meta = {
    title: 'Calendar/Validation',
    tags: ['autodocs'],
    parameters: {docs: {description: {component: `
TypeScript types do not prove runtime strings, so the calendar validates every input before date math and never corrects it.
Production and development accept and reject exactly the same values; development builds additionally print a
\`console.warn\` per problem (run \`npm run storybook\` to see them; the published Storybook is a production build).
`}}},
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

export const MalformedItems: Story = {name: 'Malformed and duplicate items', render: () => <MalformedItemsDemo/>,
    parameters: {docs: {description: {story: 'An invalid record is excluded from layout, counts and interactions without affecting the valid ones. Every record sharing a duplicated `id` is excluded, so neither copy wins by position. An empty title is kept with the localized fallback.'}}}};
export const InvalidConfiguration: Story = {name: 'Invalid configuration: safe shell', render: () => <InvalidConfigurationDemo/>,
    parameters: {docs: {description: {story: 'Invalid configuration or controlled props are a consumer contract error: a named, localized error region replaces toolbar, grid and agenda, no `on*` notification runs and no retry is offered. Fixing the props restores the calendar.'}}}};
