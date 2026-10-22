import {useState} from 'react';
import type {Meta, StoryObj} from '@storybook/react';
import {Calendar, neutralTheme, type CalendarDataState, type CalendarItem} from '@nelmad/calendar';
import {Log, Toolbar, frame, september, useLog} from './support';

type Task = {ticket: number; assignee: string; blocked: boolean};
const task = (id: string, title: string, start: string, end: string, ticket: number, assignee: string, blocked = false): CalendarItem<Task> =>
    ({id, title, data: {ticket, assignee, blocked}, interval: {kind: 'allDay', start, end}});
const visuallyHidden = {position: 'absolute', inlineSize: 1, blockSize: 1, overflow: 'hidden', clipPath: 'inset(50%)', whiteSpace: 'nowrap'} as const;
const tasks: CalendarItem<Task>[] = [
    task('api', 'Публичный API', '2026-09-01', '2026-09-04', 101, 'Анна'),
    task('docs', 'Документация', '2026-09-03', '2026-09-04', 102, 'Олег', true),
    task('review', 'Ревью дизайна', '2026-09-10', '2026-09-12', 103, 'Ира'),
    task('release', 'Выпуск', '2026-09-24', '2026-09-25', 104, 'Анна'),
];

function CustomItemsDemo() {
    const [anchorDate, setAnchorDate] = useState(september.anchorDate);
    const [entries, log] = useLog();
    return <div>
        <Calendar<Task> items={tasks} timeZone={september.timeZone} today={september.today} locale="ru-RU" layout="auto" theme={neutralTheme}
            anchorDate={anchorDate} onNavigate={setAnchorDate} onItemPress={({item, view}) => log(`onItemPress ${item.id} (${view})`)}
            // Passive content only: text and static badges. Activation stays onItemPress, extra operations go to getItemActions.
            // The blocked state is text too (visually hidden next to the decorative badge), not only an icon and a color.
            renderItem={({item}) => <>{item.data.blocked && <><span aria-hidden="true">⛔ </span><span style={visuallyHidden}>Заблокировано: </span></>}{item.title} <small>#{item.data.ticket}</small></>}
            renderAgendaItem={({item, date}) => <span style={{display: 'grid'}}><span>{item.title}</span>
                <small>#{item.data.ticket} · {item.data.assignee} · {date}{item.data.blocked ? ' · заблокировано' : ''}</small></span>}
            classNames={{item: ({item}) => item.data.blocked ? 'story-blocked' : undefined, day: ({isToday}) => isToday ? 'story-today' : undefined}}
            getItemAppearance={item => item.data.blocked ? {accentColor: '#b3261e', backgroundColor: '#fce8e6', textColor: '#410e0b'} : undefined}/>
        <Log title="Item presses" entries={entries}/>
    </div>;
}

function ToolbarAndRetryDemo() {
    const [anchorDate, setAnchorDate] = useState(september.anchorDate);
    const [dataState, setDataState] = useState<CalendarDataState>({status: 'error', phase: 'refresh', error: new Error('Backend unavailable')});
    const [compact, setCompact] = useState(true);
    const [entries, log] = useLog();
    const retry = () => { log('retry from the custom error body'); setDataState({status: 'loading', phase: 'refresh'}); setTimeout(() => setDataState({status: 'ready'}), 600); };
    return <div>
        <Toolbar><button type="button" onClick={() => setDataState({status: 'error', phase: 'refresh', error: new Error('Backend unavailable')})}>Fail again</button></Toolbar>
        <Calendar<Task> items={tasks} timeZone={september.timeZone} today={september.today} locale="ru-RU" layout="auto" density={compact ? 'compact' : 'comfortable'}
            anchorDate={anchorDate} onNavigate={setAnchorDate} dataState={dataState} onRetryRequest={retry}
            // Controls of your own: their name, state, keyboard behavior, size and focus style are yours.
            renderToolbarContent={() => <button type="button" aria-pressed={!compact} style={{minBlockSize: 44, paddingInline: 12, font: 'inherit', fontWeight: compact ? 400 : 600,
                boxShadow: compact ? 'none' : 'inset 0 0 0 2px currentcolor'}}
                onClick={() => setCompact(value => !value)}>Просторно</button>}
            renderError={context => context.kind === 'data' ? <div role="group" aria-labelledby="story-error-title">
                <p id="story-error-title" style={{margin: '0 0 8px'}}>Сервер недоступен. Данные могут быть устаревшими.</p>
                <button type="button" style={{minBlockSize: 44, paddingInline: 12, font: 'inherit'}} onClick={retry}>Загрузить снова</button>
            </div> : undefined}/>
        <Log title="Log" entries={entries}/>
    </div>;
}

const meta = {
    title: 'Calendar/Slots',
    tags: ['autodocs'],
    parameters: {docs: {description: {component: `
Content slots replace or extend visible content; the calendar keeps its roles, names, focus and keyboard behavior.
\`renderItem\`, \`renderAgendaItem\` and \`renderDayHeader\` take passive content only: text, static badges and icons, never links,
buttons, inputs or tab stops (development builds warn about interactive content they find). The visible content of a
custom agenda row follows the default summary in the accessible name of its press control.
\`renderToolbarContent\`, \`renderLoading\`, \`renderEmpty\` and \`renderError\` sit outside the grid and may hold controls of your
own; you provide their names, keyboard behavior and focus styles. A custom data-error body replaces the built-in retry:
call your own retry from it.
`}}},
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

export const CustomItems: Story = {
    name: 'Custom item content',
    render: () => <div style={frame}><CustomItemsDemo/></div>,
    parameters: {docs: {description: {story: 'Ticket numbers and a static "blocked" badge from `data`, a class per item state and one appearance for every segment and the agenda row. The badge is decorative (`aria-hidden`); the blocked state is also passed as text: visually hidden in the grid item, visible in the agenda row.'}}},
};
export const ToolbarAndRetry: Story = {
    name: 'Toolbar extension and custom retry',
    render: () => <div style={frame}><ToolbarAndRetryDemo/></div>,
    parameters: {docs: {description: {story: 'A toggle button with `aria-pressed` in the toolbar extension, after the package navigation, and a refresh-error body with its own "Load again" button instead of the built-in retry. Both follow the normal Tab order outside the grid.'}}},
};
