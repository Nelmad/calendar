import {useState} from 'react';
import type {Meta, StoryObj} from '@storybook/react';
import {Calendar, type CalendarItem} from '@nelmad/calendar';

const items: CalendarItem<{room: string}>[] = [
    {id: 'standup', title: 'Стендап', data: {room: '301'},
        interval: {kind: 'timed', start: '2026-09-03T10:00:00+03:00', end: '2026-09-03T10:15:00+03:00'}},
    // All-day `end` is exclusive: this item covers 10 and 11 September.
    {id: 'offsite', title: 'Выездная сессия', data: {room: 'Парк'},
        interval: {kind: 'allDay', start: '2026-09-10', end: '2026-09-12'}},
];

/** Same code as `Schedule.tsx` in examples/vite and examples/next (the stylesheet is loaded by the Storybook preview). */
function Schedule() {
    const [anchorDate, setAnchorDate] = useState('2026-09-01');
    const [opened, setOpened] = useState('');
    return <>
        <Calendar items={items} timeZone="Europe/Moscow" locale="ru-RU"
            anchorDate={anchorDate} onNavigate={setAnchorDate}
            onItemPress={({item}) => setOpened(`${item.title}: ${item.data.room}`)}/>
        <p aria-live="polite">{opened}</p>
    </>;
}

const meta = {
    title: 'Calendar/Quick start',
    tags: ['autodocs'],
    parameters: {docs: {description: {component: `
The smallest working integration of \`0.2.0-alpha.2\`: records with ISO/RFC 3339 intervals, an IANA display zone,
controlled navigation and an item press. Import the stylesheet once: \`import '@nelmad/calendar/styles.css'\`.

- \`anchorDate\` + \`onNavigate\` are required: the calendar requests a month, the application accepts it.
- \`layout\` is left at its default \`"auto"\`: the seven-column grid from 640 px of calendar content width, the compact mobile month with the agenda below it on narrower calendars.
- \`today\` is omitted, so it comes from the viewer's clock after hydration. Pass \`today\` to share one server snapshot.
- Clicking a chip or bar, or \`Enter\` on a day and then an item in the agenda, calls \`onItemPress\` with \`data\`.
`}}},
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

export const QuickStart: Story = {name: 'Quick start', render: () => <Schedule/>};
