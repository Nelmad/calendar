import {StrictMode, type ReactNode} from 'react';
import {createRoot, hydrateRoot} from 'react-dom/client';
import {renderToString} from 'react-dom/server';
import {Calendar, classicTheme, neutralTheme, type CalendarItem, type CalendarItemAppearance, type CalendarProps} from '../../src/index.js';

// T18 probe entry: only the public facade (surface gate with themes, slots, class callbacks and item appearance) in
// development StrictMode, server render + hydration. Options are JSON from the probe; slot and class callbacks record
// their contexts (a probe-only side effect of pure resolvers), callbacks record events.
export type ThemesOptions = Partial<CalendarProps> & {
    themeName?: 'classic' | 'neutral';
    /** Passive renderItem/renderAgendaItem/renderDayHeader and a toolbar extension with its own button. */
    slots?: boolean;
    /** renderItem with a link: the passive-content diagnostics must report it. */
    interactive?: boolean;
    /** Every classNames key, recording its state. */
    classes?: boolean;
    /** getItemAppearance results by item id. */
    appearance?: Record<string, CalendarItemAppearance>;
    /** Controlled agenda date; accepted by the probe (patch). */
    controlledAgenda?: boolean;
    /** Controlled source filter; accepted by the probe. */
    filter?: boolean;
    /** Item actions on every row. */
    actions?: boolean;
    /** A sortItems comparator that always returns 0, recording its context. */
    flatSort?: boolean;
    /** A sortItems comparator in reverse id order, recording its context. */
    reverseSort?: boolean;
    /** Custom state bodies: renderLoading, renderEmpty, and renderError with its own retry button for the data branch. */
    stateSlots?: boolean;
    /** portalContainer: the shadow root of the element with this id, or the element itself. */
    portalId?: string;
    /** StrictMode wrapper (default true); false gives exact per-render call counts. */
    strict?: boolean;
};
type Event = {type: string; value: unknown};
export type Recorder = {events: Event[]; calls: {slot: string; context: unknown}[]};
const keys = ['root', 'status', 'toolbar', 'sourceSelector', 'grid', 'weekdayHeader', 'day', 'dayHeader', 'item', 'itemActions', 'overflowIndicator', 'agenda', 'agendaItem'] as const;
const plain = (value: unknown) => JSON.parse(JSON.stringify(value, (key, inner) => key === 'data' ? undefined : inner instanceof Error ? `Error: ${inner.message}` : inner)) as unknown;
function props(options: ThemesOptions, recorder: Recorder): CalendarProps {
    const {themeName, slots, interactive, classes, appearance, controlledAgenda, filter, actions, flatSort, reverseSort, stateSlots, portalId, strict, ...rest} = options;
    void strict;
    const {events, calls} = recorder, record = (slot: string, context: unknown) => { calls.push({slot, context: plain(context)}); };
    const retry = () => { events.push({type: 'retry', value: null}); };
    const base: Record<string, unknown> = {items: [], anchorDate: '2026-03-01', today: '2026-03-04', timeZone: 'UTC', locale: 'en-US', ...rest,
        onNavigate: (date: string) => { events.push({type: 'navigate', value: date}); },
        onItemPress: (request: {item: CalendarItem; view: string; date: string; segmentRange?: unknown}) => {
            events.push({type: 'press', value: {id: request.item.id, view: request.view, date: request.date, segmentRange: request.segmentRange}});
        },
        onRetryRequest: retry};
    if (themeName) base.theme = themeName === 'neutral' ? neutralTheme : classicTheme;
    if (controlledAgenda) {
        base.agendaDate = rest.agendaDate ?? '2026-03-04';
        base.onAgendaDateChange = (date: string) => { events.push({type: 'agenda', value: date}); };
    }
    if (filter) base.onVisibleSourceIdsChange = (ids: readonly string[]) => { events.push({type: 'sources', value: [...ids]}); };
    if (actions) {
        base.getItemActions = () => [{id: 'open', label: 'Open'}, {id: 'delete', label: 'Delete', tone: 'danger'}];
        base.onItemActionRequest = ({item, actionId}: {item: CalendarItem; actionId: string}) => { events.push({type: 'action', value: {id: item.id, actionId}}); };
    }
    if (slots) {
        base.renderItem = (context: {item: CalendarItem; segmentRange: unknown}) => { record('renderItem', context); return <span className="probe-chip">{`◆ ${context.item.title}`}</span>; };
        base.renderAgendaItem = (context: {item: CalendarItem; date: string}) => { record('renderAgendaItem', context);
            return <span className="probe-row"><strong>{context.item.title}</strong> <em>{`#${context.item.id}`}</em></span>; };
        base.renderDayHeader = (context: {date: string; isToday: boolean}) => { record('renderDayHeader', context); return <span>{`${Number(context.date.slice(8))}${context.isToday ? ' •' : ''}`}</span>; };
        base.renderToolbarContent = (context: unknown): ReactNode => { record('renderToolbarContent', context); return <button type="button" className="probe-export">Export</button>; };
    }
    if (stateSlots) {
        base.renderLoading = (context: unknown) => { record('renderLoading', context); return <p className="probe-loading">Fetching events</p>; };
        base.renderEmpty = (context: unknown) => { record('renderEmpty', context); return <p className="probe-empty">Nothing planned</p>; };
        base.renderError = (context: {kind: string}) => { record('renderError', context);
            return context.kind === 'data' ? <div className="probe-error"><p>Feed unavailable</p><button type="button" onClick={retry}>Reload feed</button></div>
                : <p className="probe-error">Configuration problem</p>; };
    }
    if (interactive) base.renderItem = (context: {item: CalendarItem}) => <a href={`#${context.item.id}`}>{context.item.title}</a>;
    if (classes) base.classNames = Object.fromEntries(keys.map(key => [key, (state: unknown) => { record(`class:${key}`, state); return `probe-${key}`; }]));
    if (appearance) base.getItemAppearance = (item: CalendarItem, context: unknown) => { record('getItemAppearance', {id: item.id, context}); return appearance[item.id]; };
    if (flatSort) base.sortItems = (_a: CalendarItem, _b: CalendarItem, context: unknown) => { record('sortItems', context); return 0; };
    if (reverseSort) base.sortItems = (a: CalendarItem, b: CalendarItem, context: unknown) => { record('sortItems', context); return a.id < b.id ? 1 : a.id > b.id ? -1 : 0; };
    if (portalId && typeof document !== 'undefined') {
        const host = document.getElementById(portalId);
        base.portalContainer = host?.shadowRoot ?? host;
    }
    return base as unknown as CalendarProps;
}
const tree = (options: ThemesOptions, recorder: Recorder) => options.strict === false ? <Calendar {...props(options, recorder)}/>
    : <StrictMode><Calendar {...props(options, recorder)}/></StrictMode>;
const frames = () => new Promise<void>(done => requestAnimationFrame(() => requestAnimationFrame(() => done())));
export function serverThemes(options: ThemesOptions = {}) {
    const recorder: Recorder = {events: [], calls: []};
    return {html: renderToString(tree(options, recorder)), ...recorder};
}
function controls(root: {render: (node: ReactNode) => void; unmount: () => void}, recorder: Recorder, options: ThemesOptions) {
    let current = options;
    return {...recorder, unmount: () => root.unmount(), options: () => current,
        patch: (next: ThemesOptions) => { current = {...current, ...next}; root.render(tree(current, recorder)); }};
}
export async function hydrateThemes(container: Element, options: ThemesOptions = {}) {
    const recorder: Recorder = {events: [], calls: []}, errors: string[] = [];
    const root = hydrateRoot(container, tree(options, recorder), {onRecoverableError: error => errors.push(String(error))});
    await frames();
    return {errors, ...controls(root, recorder, options)};
}
/** A client-only first render of the same options, to compare its DOM and inline declarations with the server markup. */
export async function renderThemes(container: Element, options: ThemesOptions = {}) {
    const recorder: Recorder = {events: [], calls: []}, root = createRoot(container);
    root.render(tree(options, recorder));
    await frames();
    return {errors: [] as string[], ...controls(root, recorder, options)};
}
export {mirroredFontProperties, mirroredVariables} from '../../src/v02/primitives/mirror.js';
export {tokenVariables} from '../../src/v02/themes/classic.js';
