import {useRef, useState} from 'react';
import type {Meta, StoryObj} from '@storybook/react';
import {Calendar, type CalendarItemPressRequest, type ISODate} from '@nelmad/calendar';
import {Log, Toolbar, frame, releaseItems, september, useLog, type Ticket} from './support';

const describe = ({item, view, date, segmentRange}: CalendarItemPressRequest<Ticket>) =>
    `onItemPress ${JSON.stringify({id: item.id, view, date, segmentRange, ticket: item.data.ticket})}`;

function UncontrolledDemo() {
    const [anchorDate, setAnchorDate] = useState(september.anchorDate);
    const [entries, log] = useLog();
    return <div style={frame}>
        <Calendar items={releaseItems} timeZone={september.timeZone} today={september.today} locale="ru-RU" layout="desktop"
            anchorDate={anchorDate} onNavigate={setAnchorDate} onItemPress={request => log(describe(request))}/>
        <Log title="Item presses" entries={entries}/>
    </div>;
}

function DelayedAcceptanceDemo() {
    const [anchorDate, setAnchorDate] = useState(september.anchorDate);
    const [agendaDate, setAgendaDate] = useState<ISODate>(september.today);
    const [rejectWeekends, setRejectWeekends] = useState(false);
    const [entries, log] = useLog();
    const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
    function request(date: ISODate) {
        const weekend = [0, 6].includes(new Date(`${date}T00:00:00Z`).getUTCDay());
        log(`onAgendaDateChange(${date})`);
        clearTimeout(timer.current);
        if (rejectWeekends && weekend) { log(`not accepted: ${date} is a weekend`); return; }
        timer.current = setTimeout(() => { setAgendaDate(date); log(`agendaDate = ${date}`); }, 800);
    }
    return <div style={frame}>
        <Toolbar>
            <label><input type="checkbox" checked={rejectWeekends} onChange={event => setRejectWeekends(event.target.checked)}/> Do not accept weekends</label>
            <button type="button" onClick={() => setAgendaDate('2026-09-15')}>Set agendaDate = 2026-09-15 (external)</button>
            <span>agendaDate: <code>{agendaDate}</code></span>
        </Toolbar>
        <Calendar items={releaseItems} timeZone={september.timeZone} today={september.today} locale="ru-RU" layout="desktop"
            anchorDate={anchorDate} onNavigate={setAnchorDate} agendaDate={agendaDate} onAgendaDateChange={request}
            onItemPress={item => log(describe(item))}/>
        <Log title="Agenda requests (newest first)" entries={entries}/>
    </div>;
}

const meta = {
    title: 'Calendar/Agenda',
    tags: ['autodocs'],
    parameters: {docs: {description: {component: `
\`Enter\` on a day cell, a click on the day or on its \`+N\` opens the full \`DayAgenda\` for that date in a non-modal desktop popover.
Every item of the day is a button there; \`Escape\` closes the popover and returns focus to the day cell, \`Tab\` past the last
control closes it and continues after the calendar.

\`agendaDate\` + \`onAgendaDateChange\` are an optional controlled pair and are passed together. Without the pair the agenda
opens immediately.
`}}},
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

export const Uncontrolled: Story = {
    name: 'Simple viewer',
    render: () => <UncontrolledDemo/>,
    parameters: {docs: {description: {story: 'No controlled pair: activating a day opens its agenda at once. Item presses from the grid report `view: "month"` with the pressed `segmentRange`; from the agenda `view: "agenda"`.'}}},
};
export const DelayedAcceptance: Story = {
    name: 'Controlled agenda with delayed acceptance',
    render: () => <DelayedAcceptanceDemo/>,
    parameters: {docs: {description: {story: `
Activating another day calls \`onAgendaDateChange\` once; the popover opens only after \`agendaDate\` becomes that date (800 ms
here) and only while the user still waits on that cell. Activating the already accepted day (3 September initially) is a
no-op for the callback: the agenda opens immediately and no request is logged. With "Do not accept weekends" a weekend
request is never accepted and nothing opens. The external button changes \`agendaDate\` without opening an overlay.
`}}},
};
