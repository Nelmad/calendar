import {useState} from 'react';
import type {Meta, StoryObj} from '@storybook/react';
import {Calendar, type CalendarItem} from '@nelmad/calendar';
import {frame, september} from './support';

type Rule = {rule: string};
const items: CalendarItem<Rule>[] = [
    {id: 'one-day', title: 'Один день', data: {rule: 'allDay 07 → 08: only 7 September'}, interval: {kind: 'allDay', start: '2026-09-07', end: '2026-09-08'}},
    {id: 'three-days', title: 'Три дня', data: {rule: 'allDay 09 → 12: 9, 10 and 11 September'}, interval: {kind: 'allDay', start: '2026-09-09', end: '2026-09-12'}},
    {id: 'to-midnight', title: 'До полуночи', data: {rule: 'timed 22:00 → 00:00 next day: only 14 September'}, interval: {kind: 'timed', start: '2026-09-14T22:00:00+03:00', end: '2026-09-15T00:00:00+03:00'}},
    {id: 'past-midnight', title: 'Через полночь', data: {rule: 'timed 22:00 → 01:00: 16 and 17 September'}, interval: {kind: 'timed', start: '2026-09-16T22:00:00+03:00', end: '2026-09-17T01:00:00+03:00'}},
    {id: 'moment', title: 'Момент', data: {rule: 'timed without end: a moment on its start date'}, interval: {kind: 'timed', start: '2026-09-18T12:00:00+03:00'}},
    {id: 'zero', title: 'Нулевая длительность', data: {rule: 'end equal to start: also a moment'}, interval: {kind: 'timed', start: '2026-09-21T09:00:00+03:00', end: '2026-09-21T09:00:00+03:00'}},
    {id: 'utc', title: 'Задано в UTC', data: {rule: '21:30Z is 00:30 on 23 September in Europe/Moscow'}, interval: {kind: 'timed', start: '2026-09-22T21:30:00Z', end: '2026-09-22T22:00:00Z'}},
];

function IntervalsDemo() {
    const [anchorDate, setAnchorDate] = useState(september.anchorDate);
    const [rule, setRule] = useState('');
    return <div style={frame}>
        <Calendar items={items} timeZone={september.timeZone} today={september.today} locale="ru-RU" layout="desktop"
            anchorDate={anchorDate} onNavigate={setAnchorDate} onItemPress={({item}) => setRule(`${item.title}: ${item.data.rule}`)}/>
        <p aria-live="polite" style={{fontSize: 14}}>{rule || 'Press an item to see its rule.'}</p>
    </div>;
}

const meta = {
    title: 'Calendar/Interval semantics',
    tags: ['autodocs'],
    parameters: {docs: {description: {component: `
Every \`end\` is exclusive, and nothing is normalized silently.

| Item | Interval | Shown on |
| --- | --- | --- |
| Один день | \`allDay\` 2026-09-07 → 2026-09-08 | 7 |
| Три дня | \`allDay\` 2026-09-09 → 2026-09-12 | 9, 10, 11 |
| До полуночи | \`timed\` 22:00 → 00:00 (+03:00) | 14 only: the end instant itself adds no date |
| Через полночь | \`timed\` 22:00 → 01:00 | 16 and 17 (a bar) |
| Момент | \`timed\` without \`end\` | 18 (a chip, no default duration) |
| Нулевая длительность | \`end === start\` | 21 (a moment, the explicit end is kept) |
| Задано в UTC | \`2026-09-22T21:30:00Z\` | 23 in Europe/Moscow |

An inclusive all-day end (\`start === end\`) is invalid and the item is excluded; see Validation.
`}}},
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

export const ExclusiveEnds: Story = {name: 'All-day exclusive end vs timed midnight end', render: () => <IntervalsDemo/>};
