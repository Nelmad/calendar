import {useRef, useState} from 'react';
import type {Meta, StoryObj} from '@storybook/react';
import {Calendar, type CalendarItem, type CalendarItemAction, type CalendarLayout, type CalendarSource} from '@nelmad/calendar';
import {Log, Toolbar, frame, releaseItems, september, useLog, type Ticket} from './support';

type Team = {owner: string};
const sources: readonly CalendarSource<Team>[] = [
    {id: 'release', title: 'Релизы', data: {owner: 'Anna'}}, {id: 'team', title: 'Команда', data: {owner: 'Ivan'}}, {id: 'personal', title: 'Личное'},
];
// Every item of the release month gets a source; one keeps a broken link and stays visible with a development warning.
const items: CalendarItem<Ticket>[] = releaseItems.map((item, index) => ({...item,
    calendarId: item.id === 'deploy' ? 'missing' : item.id === 'vacation' ? 'personal' : index % 2 ? 'team' : 'release'}));
const actions = (item: CalendarItem<Ticket>): readonly CalendarItemAction[] => item.id.startsWith('task')
    ? [{id: 'complete', label: 'Завершить'}, {id: 'delete', label: 'Удалить', tone: 'danger'}]
    : item.id === 'vacation' ? [] : [{id: 'open', label: 'Открыть'}, {id: 'delete', label: 'Удалить', tone: 'danger'}];

function Demo({layout, delay}: {layout: CalendarLayout; delay: number}) {
    const [anchorDate, setAnchorDate] = useState(september.anchorDate);
    const [visible, setVisible] = useState<readonly string[]>(sources.map(source => source.id));
    const [entries, log] = useLog();
    const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
    function request(next: readonly string[]) {
        log(`onVisibleSourceIdsChange(${JSON.stringify(next)})`);
        clearTimeout(timer.current);
        timer.current = setTimeout(() => { setVisible(next); log(`visibleSourceIds = ${JSON.stringify(next)}`); }, delay);
    }
    return <div style={frame}>
        <Toolbar><span>visibleSourceIds: <code>{JSON.stringify(visible)}</code></span>
            <button type="button" onClick={() => setVisible(sources.map(source => source.id))}>Show all (external)</button></Toolbar>
        <Calendar items={items} timeZone={september.timeZone} today={september.today} locale="ru-RU" layout={layout}
            anchorDate={anchorDate} onNavigate={setAnchorDate} sources={sources} visibleSourceIds={visible} onVisibleSourceIdsChange={request}
            getItemActions={actions} onItemActionRequest={({item, actionId}) => log(`onItemActionRequest ${JSON.stringify({id: item.id, actionId, ticket: item.data.ticket})}`)}
            onItemPress={({item, view}) => log(`onItemPress ${JSON.stringify({id: item.id, view})}`)}/>
        <Log title="Requests (newest first)" entries={entries}/>
    </div>;
}

const meta = {
    title: 'Calendar/Actions and sources',
    tags: ['autodocs'],
    parameters: {docs: {description: {component: `
\`getItemActions\` + \`onItemActionRequest\` give every agenda row with actions a separate \`…\` button: a keyboard menu on
desktop, a modal action sheet on mobile. The grid never shows action buttons. \`sources\` with the controlled
\`visibleSourceIds\` + \`onVisibleSourceIdsChange\` add a toolbar selector; its checked state follows only the accepted props.
`}}},
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

export const Desktop: Story = {
    name: 'Desktop menu and source menu',
    render: () => <Demo layout="desktop" delay={0}/>,
    parameters: {docs: {description: {story: 'Open a day, then `…` beside an item. «Отпуск Анны» has an empty set and no trigger. «Выкладка» references an unknown source and stays visible.'}}},
};
export const Mobile: Story = {
    name: 'Mobile action sheet and source sheet',
    render: () => <div style={{maxWidth: 420}}><Demo layout="mobile" delay={0}/></div>,
    parameters: {docs: {description: {story: 'The same sets in modal sheets named by their visible headings.'}}},
};
export const DelayedFilter: Story = {
    name: 'Delayed filter acceptance',
    render: () => <Demo layout="desktop" delay={1000}/>,
    parameters: {docs: {description: {story: 'A toggle calls the callback at once; the checkbox, its label, the grid, counts and agenda change only when `visibleSourceIds` is accepted a second later.'}}},
};
