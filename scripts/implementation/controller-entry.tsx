import {StrictMode} from 'react';
import {createRoot, hydrateRoot} from 'react-dom/client';
import {renderToString} from 'react-dom/server';
import type {CalendarProps} from '../../src/v02/reference.js';
import {Fixture, fixtureProps} from '../../src/v02/calendar/__tests__/fixture.js';
import {getCalendarVisibleRange} from '../../src/v02/core/formatting.js';

type Options = Partial<CalendarProps> & {unknownToday?: boolean};
function setup(options: Options) {
    const events: {type: string; value: unknown}[] = [];
    const {unknownToday, ...overrides} = options;
    let props = {...fixtureProps(), ...overrides, onNavigate: (date: string) => events.push({type: 'navigate', value: date}),
        onVisibleRangeChange: (range: unknown) => events.push({type: 'range', value: range})} as CalendarProps;
    if (unknownToday) { const {today: _today, ...rest} = props; props = rest; }
    return {events, props};
}
export function serverController(options: Options = {}) {
    const {props, events} = setup(options);
    return {html: renderToString(<StrictMode><Fixture input={props}/></StrictMode>), events, range: getCalendarVisibleRange(props)};
}
export async function hydrateController(container: Element, options: Options = {}) {
    const fixture = setup(options), errors: string[] = [];
    const tree = () => <StrictMode><Fixture input={fixture.props}/></StrictMode>;
    const root = hydrateRoot(container, tree(), {onRecoverableError: error => errors.push(String(error))});
    await new Promise<void>(done => requestAnimationFrame(() => requestAnimationFrame(() => done())));
    return {errors, events: fixture.events, patch: (props: Options) => { fixture.props = {...fixture.props, ...props} as CalendarProps; root.render(tree()); }, unmount: () => root.unmount()};
}
export function mountController(container: Element, options: Options = {}) {
    const fixture = setup(options), root = createRoot(container);
    root.render(<Fixture input={fixture.props}/>);
    return () => root.unmount();
}
