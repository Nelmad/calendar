import {useRef, useState} from 'react';
import type {Meta, StoryObj} from '@storybook/react';
import {Calendar, type CalendarDataState, type CalendarItem} from '@nelmad/calendar';
import {Toolbar, frame, releaseItems, september, type Ticket} from './support';

type Props = {items: readonly CalendarItem<Ticket>[]; initial: CalendarDataState; retry?: CalendarDataState['status']};
/** `dataState` belongs to the application; retry runs a simulated 900 ms reload that succeeds. */
function DataStateDemo({items, initial, retry}: Props) {
    const [anchorDate, setAnchorDate] = useState(september.anchorDate);
    const [dataState, setDataState] = useState(initial);
    const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
    const reload = () => {
        if (dataState.status !== 'error') return;
        setDataState({status: 'loading', phase: dataState.phase});
        clearTimeout(timer.current); timer.current = setTimeout(() => setDataState({status: 'ready'}), 900);
    };
    return <div style={frame}>
        <Toolbar>
            <span>dataState: <code>{JSON.stringify(dataState, (key, value) => key === 'error' ? String(value) : value)}</code></span>
            <button type="button" onClick={() => setDataState(initial)}>Reset</button>
        </Toolbar>
        <Calendar items={items} timeZone={september.timeZone} today={september.today} locale="ru-RU" layout="desktop"
            anchorDate={anchorDate} onNavigate={setAnchorDate} dataState={dataState} {...(retry ? {onRetryRequest: reload} : {})}/>
    </div>;
}

const meta = {
    title: 'Calendar/Data states',
    tags: ['autodocs'],
    parameters: {docs: {description: {component: `
\`dataState\` is a discriminated union owned by the application: \`{status: 'ready'}\` (default),
\`{status: 'loading', phase: 'initial' | 'refresh'}\` and \`{status: 'error', phase: 'initial' | 'refresh', error}\`.

- \`initial\` phases replace the grid with a skeleton or an error region, regardless of \`items\`.
- \`refresh\` phases keep the accepted content in place and never move the toolbar controls. Loading marks the grid and the
  inline agenda \`aria-busy\` and draws a thin progress bar over the top border of the grid, which takes no space; a
  non-blocking error is a banner between the toolbar and the grid. Neither covers a weekday name, date or control.
- The retry button appears for data errors only when \`onRetryRequest\` is passed; the state changes only through a new \`dataState\`.
- \`ready\` with no item in the visible range is the empty state; the grid and navigation stay usable.
`}}},
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

export const InitialLoading: Story = {
    name: 'Initial loading',
    render: () => <DataStateDemo items={[]} initial={{status: 'loading', phase: 'initial'}}/>,
};
export const Refresh: Story = {
    name: 'Refresh',
    render: () => <DataStateDemo items={releaseItems} initial={{status: 'loading', phase: 'refresh'}}/>,
    parameters: {docs: {description: {story: 'Items stay visible and interactive while a progress indicator is shown.'}}},
};
export const InitialError: Story = {
    name: 'Initial error with retry',
    render: () => <DataStateDemo items={[]} initial={{status: 'error', phase: 'initial', error: new Error('Backend unavailable')}} retry="ready"/>,
    parameters: {docs: {description: {story: 'Blocking error region with the built-in retry button; retry switches to `loading/initial`, then `ready`.'}}},
};
export const RefreshError: Story = {
    name: 'Refresh error with stale items',
    render: () => <DataStateDemo items={releaseItems} initial={{status: 'error', phase: 'refresh', error: new Error('Backend unavailable')}} retry="ready"/>,
    parameters: {docs: {description: {story: 'A non-blocking error banner between the toolbar and the stale records; the grid, agenda and navigation keep working.'}}},
};
export const Empty: Story = {
    name: 'Empty month',
    render: () => <DataStateDemo items={[{id: 'later', title: 'В декабре', data: {ticket: 1}, interval: {kind: 'allDay', start: '2026-12-01', end: '2026-12-02'}}]} initial={{status: 'ready'}}/>,
    parameters: {docs: {description: {story: 'The only record is in December, outside the grid, so September is empty; the empty region sits next to a fully usable grid.'}}},
};
