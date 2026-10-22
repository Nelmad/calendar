import {useState} from 'react';
import type {Meta, StoryObj} from '@storybook/react';
import {Calendar} from '@nelmad/calendar';
import {Log, frame, releaseItems, september, useLog} from './support';

const keys: [string, string][] = [
    ['Tab / Shift+Tab', 'The grid is one Tab stop (the focused day); toolbar buttons are separate stops before it.'],
    ['ArrowLeft / ArrowRight', 'Previous / next day in the visual direction (mirrored in RTL).'],
    ['ArrowUp / ArrowDown', 'Seven days back / forward.'],
    ['Home / End', 'First / last day of the week.'],
    ['PageUp / PageDown', 'Previous / next month through onNavigate.'],
    ['Shift+PageUp / Shift+PageDown', 'Previous / next year through onNavigate.'],
    ['Enter', 'Open the day agenda for the focused day; focus moves into it.'],
    ['Tab inside the agenda', 'Moves through its controls; past the last one the agenda closes and focus continues after the calendar.'],
    ['Escape', 'Closes the agenda and returns focus to the day cell.'],
    ['Space', 'Reserved for date selection (beta); no action in alpha.2.'],
];
const table = `| Key | Action |\n| --- | --- |\n${keys.map(([key, action]) => `| \`${key}\` | ${action} |`).join('\n')}`;

function KeyboardDemo() {
    const [anchorDate, setAnchorDate] = useState(september.anchorDate);
    const [entries, log] = useLog();
    return <div style={frame}>
        <button type="button">Before the calendar</button>
        <Calendar items={releaseItems} timeZone={september.timeZone} today={september.today} locale="ru-RU" layout="desktop"
            anchorDate={anchorDate} onNavigate={date => { log(`onNavigate(${date})`); setAnchorDate(date); }}
            onItemPress={({item, view}) => log(`onItemPress(${item.id}, ${view})`)}/>
        <button type="button">After the calendar</button>
        <table style={{marginBlockStart: 16, fontSize: 14, borderCollapse: 'collapse'}}>
            <thead><tr><th style={{textAlign: 'start', paddingInlineEnd: 16}}>Key</th><th style={{textAlign: 'start'}}>Action</th></tr></thead>
            <tbody>{keys.map(([key, action]) => <tr key={key}><td style={{paddingInlineEnd: 16}}><kbd>{key}</kbd></td><td>{action}</td></tr>)}</tbody>
        </table>
        <Log title="Callbacks" entries={entries}/>
    </div>;
}

const meta = {
    title: 'Calendar/Keyboard',
    tags: ['autodocs'],
    parameters: {docs: {description: {component: `
The Month grid is a composite widget with a single Tab stop and a roving focused day. Chips, bars and \`+N\` are not focusable:
every item is reachable as a button in the day agenda. Each day's accessible name is the full date; its description adds the
item count, today, the viewed day and how many items are hidden behind \`+N\`.

${table}

Moving past the visible grid requests navigation; the focus follows once the application accepts the new \`anchorDate\`.
`}}},
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

export const KeyboardOperation: Story = {name: 'Keyboard operation', render: () => <KeyboardDemo/>};
