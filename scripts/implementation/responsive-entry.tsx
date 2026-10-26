import {StrictMode, Suspense, lazy, useEffect, type ReactNode} from 'react';
import {hydrateRoot} from 'react-dom/client';
import {renderToString} from 'react-dom/server';
import {Calendar, type CalendarProps} from '../../src/index.js';

// T15 probe entry: the public facade (surface gate included) in StrictMode, server render + hydration.
type Options = Partial<CalendarProps> & {controlled?: boolean; unknownToday?: boolean};
function setup(options: Options) {
    const events: {type: string; value: unknown}[] = [];
    const {controlled, unknownToday, ...overrides} = options;
    let props = {items: [], anchorDate: '2026-03-01', today: '2026-03-04', timeZone: 'UTC', locale: 'en-US', ...overrides,
        onNavigate: (date: string) => events.push({type: 'navigate', value: date}),
        onItemPress: (value: unknown) => events.push({type: 'item', value}),
        ...(controlled ? {agendaDate: overrides.agendaDate ?? '2026-03-04', onAgendaDateChange: (value: string) => events.push({type: 'agenda', value})} : {}),
        onVisibleRangeChange: (range: unknown) => events.push({type: 'range', value: range})} as CalendarProps;
    if (unknownToday) { const {today: _today, ...rest} = props; props = rest as CalendarProps; }
    return {events, props};
}
export function serverResponsive(options: Options = {}) {
    const {props, events} = setup(options);
    return {html: renderToString(<StrictMode><Calendar {...props}/></StrictMode>), events};
}
export async function hydrateResponsive(container: Element, options: Options = {}) {
    const fixture = setup(options), errors: string[] = [];
    const tree = () => <StrictMode><Calendar {...fixture.props}/></StrictMode>;
    const root = hydrateRoot(container, tree(), {onRecoverableError: error => errors.push(String(error))});
    await new Promise<void>(done => requestAnimationFrame(() => requestAnimationFrame(() => done())));
    return {errors, events: fixture.events, unmount: () => root.unmount(), current: () => fixture.props,
        patch: (props: Options) => { fixture.props = {...fixture.props, ...props} as CalendarProps; root.render(tree()); }};
}
// QA-01: the Calendar next to a sibling that renders on the server but suspends on the client, so its Suspense
// boundary hydrates separately (Next loading.tsx, streaming, React Router deferred data).
const suspended = (calendar: ReactNode, sibling: ReactNode) => <StrictMode><Suspense fallback={<p>Loading</p>}><span id="sibling">{sibling}</span>{calendar}</Suspense></StrictMode>;
export function serverSuspense(options: Options = {}) {
    const {props, events} = setup(options);
    return {html: renderToString(suspended(<Calendar {...props}/>, 'loaded')), events};
}
export async function hydrateSuspense(container: Element, options: Options = {}, delay = 300) {
    const fixture = setup(options), errors: string[] = [];
    let hydrated!: () => void;
    const ready = new Promise<void>(done => { hydrated = done; });
    function Loaded() { useEffect(() => hydrated(), []); return 'loaded'; }
    const Slow = lazy(() => new Promise<{default: () => ReactNode}>(done => setTimeout(() => done({default: Loaded}), delay)));
    const root = hydrateRoot(container, suspended(<Calendar {...fixture.props}/>, <Slow/>), {onRecoverableError: error => errors.push(String(error))});
    // `ready` resolves once the boundary, Calendar included, has hydrated and committed its effects. React reports the
    // boundary's recoverable errors during that commit, before any passive effect: read `errors` live after `ready`.
    return {errors, events: fixture.events, ready, unmount: () => root.unmount(), current: () => fixture.props, patch: () => { throw new Error('Not patchable'); }};
}
