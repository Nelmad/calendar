import {useRef, useState} from 'react';
import type {Meta, StoryObj} from '@storybook/react';
import {Calendar, getCalendarVisibleRange, type CalendarDataState, type CalendarItem, type CalendarVisibleRange, type ISODate} from '@nelmad/calendar';
import {Log, Toolbar, fetchRange, frame, itemsInRange, rangeKey, releaseItems, september, shiftDate, useLog, type Ticket} from './support';

/** Server-style prefetch: the pure helper returns the exact range the first render will report. */
const initialRange = getCalendarVisibleRange({anchorDate: september.anchorDate, timeZone: september.timeZone, locale: 'ru-RU'});
/** A backend with records for every month: the release month repeated with shifted dates. */
const allItems: CalendarItem<Ticket>[] = [-2, -1, 0, 1, 2].flatMap(month => releaseItems.map(item => {
    const shift = (value: string) => value.replace(/^\d{4}-\d{2}/, prefix => {
        const date = new Date(`${prefix}-01T00:00:00Z`); date.setUTCMonth(date.getUTCMonth() + month);
        return date.toISOString().slice(0, 7);
    });
    const interval = item.interval.kind === 'allDay' ? {...item.interval, start: shift(item.interval.start), end: shift(item.interval.end)}
        : {...item.interval, start: shift(item.interval.start), ...(item.interval.end ? {end: shift(item.interval.end)} : {})};
    return {...item, id: `${item.id}-${month}`, interval};
}));

function VisibleRangeLoadingDemo({latency}: {latency: number}) {
    const [anchorDate, setAnchorDate] = useState(september.anchorDate);
    const [items, setItems] = useState<CalendarItem<Ticket>[]>(() => itemsInRange(initialRange, allItems));
    const [dataState, setDataState] = useState<CalendarDataState>({status: 'ready'});
    const [failNext, setFailNext] = useState(false);
    const [entries, log] = useLog();
    const loaded = useRef(new Set([rangeKey(initialRange)])), current = useRef<{range: CalendarVisibleRange; controller: AbortController}>(undefined);
    function load(range: CalendarVisibleRange) {
        current.current?.controller.abort();
        const controller = new AbortController(); current.current = {range, controller};
        setDataState({status: 'loading', phase: 'refresh'}); log(`request ${rangeKey(range)}`);
        fetchRange(range, allItems, latency, failNext, controller.signal).then(result => {
            loaded.current.add(rangeKey(range)); setItems(result); setDataState({status: 'ready'}); log(`loaded ${result.length} items`);
        }, (error: unknown) => {
            if (controller.signal.aborted) { log('aborted: a newer range replaced it'); return; }
            setDataState({status: 'error', phase: 'refresh', error}); log('failed: stale items stay visible');
        });
        setFailNext(false);
    }
    function changeRange(range: CalendarVisibleRange) {
        log(`onVisibleRangeChange ${rangeKey(range)}`);
        if (loaded.current.has(rangeKey(range))) { log('already loaded: no request'); return; }
        load(range);
    }
    return <div style={frame}>
        <Toolbar>
            <label><input type="checkbox" checked={failNext} onChange={event => setFailNext(event.target.checked)}/> Fail the next request</label>
            <span>dataState: <code>{JSON.stringify(dataState, (key, value) => key === 'error' ? String(value) : value)}</code></span>
        </Toolbar>
        <Calendar items={items} timeZone={september.timeZone} today={september.today} locale="ru-RU" layout="desktop"
            anchorDate={anchorDate} onNavigate={setAnchorDate} onVisibleRangeChange={changeRange}
            dataState={dataState} onRetryRequest={() => current.current && load(current.current.range)}/>
        <Log title="Notifications and requests (newest first)" entries={entries}/>
    </div>;
}

function ControlledNavigationDemo() {
    const [anchorDate, setAnchorDate] = useState<ISODate>(september.anchorDate);
    const [delayed, setDelayed] = useState(true);
    const [entries, log] = useLog();
    const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
    function navigate(date: ISODate) {
        log(`onNavigate(${date})${delayed ? ': accepting in 800 ms' : ''}`);
        clearTimeout(timer.current);
        if (delayed) timer.current = setTimeout(() => { setAnchorDate(date); log(`anchorDate = ${date}`); }, 800);
        else setAnchorDate(date);
    }
    return <div style={frame}>
        <Toolbar>
            <label><input type="checkbox" checked={delayed} onChange={event => setDelayed(event.target.checked)}/> Accept navigation after 800 ms</label>
            <button type="button" onClick={() => setAnchorDate(shiftDate(anchorDate, -365))}>Year back (external)</button>
            <button type="button" onClick={() => setAnchorDate('2027-01-15')}>Open January 2027 (external)</button>
            <span>anchorDate: <code>{anchorDate}</code></span>
        </Toolbar>
        <Calendar items={allItems} timeZone={september.timeZone} today={september.today} locale="ru-RU" layout="desktop"
            anchorDate={anchorDate} onNavigate={navigate}/>
        <Log title="Navigation requests" entries={entries}/>
    </div>;
}

const meta = {
    title: 'Calendar/Navigation and loading',
    tags: ['autodocs'],
    parameters: {docs: {description: {component: `
Navigation is controlled: toolbar buttons, \`PageUp\`/\`PageDown\` and Today call \`onNavigate(anchorDate)\`, and the month changes
only when the application passes the new \`anchorDate\`. Any date inside the month is a valid anchor.

\`onVisibleRangeChange(range)\` is a notification after commit for every new \`(start, end, timeZone)\` tuple, including the first
render. It is not called during SSR, for an unaccepted navigation request, for a new callback identity or for a StrictMode
re-run. \`getCalendarVisibleRange({anchorDate, timeZone, locale, firstDayOfWeek})\` computes the same range on the server, so
the first notification can be deduplicated against prefetched data (here: "already loaded").
`}}},
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

export const VisibleRangeLoading: Story = {
    name: 'Visible-range loading',
    render: () => <VisibleRangeLoadingDemo latency={900}/>,
    parameters: {docs: {description: {story: `
A simulated backend with 900 ms latency. The prefetched September range is not requested again. Navigating shows
\`loading/refresh\` with the previous records still visible; a newer range aborts the older request. Check "Fail the next
request" to get \`error/refresh\`: stale items stay, and the retry button of the error banner above the grid calls \`onRetryRequest\`.
`}}},
};
export const ControlledNavigation: Story = {
    name: 'Controlled navigation',
    render: () => <ControlledNavigationDemo/>,
    parameters: {docs: {description: {story: `
Requests are accepted after a delay: the grid keeps the current month until \`anchorDate\` changes. External buttons change
\`anchorDate\` directly; that is a normal controlled update and calls no \`onNavigate\`.
`}}},
};
