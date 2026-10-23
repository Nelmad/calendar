import {StrictMode} from 'react';
import {createRoot, hydrateRoot} from 'react-dom/client';
import {renderToString} from 'react-dom/server';
import type {CalendarItemAppearance, CalendarProps} from '../../src/v02/reference.js';
import {CalendarMonth} from '../../src/v02/calendar/CalendarMonth.js';
import {getCalendarVisibleRange} from '../../src/v02/core/formatting.js';
export {isDeclarationValue} from '../../src/v02/themes/classic.js';

type Options = Partial<CalendarProps> & {unknownToday?: boolean; /** getItemAppearance results by item id (spec v8 CSP check). */ appearance?: Record<string, CalendarItemAppearance>};
function setup(options: Options) {
    const events: {type: string; value: unknown}[] = [];
    const {unknownToday, appearance, ...overrides} = options;
    let props = {items: [], anchorDate: '2026-03-01', today: '2026-03-04', timeZone: 'UTC', locale: 'en-US', layout: 'desktop', ...overrides,
        onNavigate: (date: string) => events.push({type: 'navigate', value: date}),
        onItemPress: (value: unknown) => events.push({type: 'item', value}),
        ...(overrides.agendaDate !== undefined ? {onAgendaDateChange: (value: string) => events.push({type: 'agenda', value})} : {}),
        ...(overrides.selection !== undefined ? {onSelectionChange: (value: unknown) => events.push({type: 'selection', value})} : {}),
        ...(appearance ? {getItemAppearance: (item: {id: string}) => appearance[item.id]} : {}),
        onVisibleRangeChange: (range: unknown) => events.push({type: 'range', value: range})} as CalendarProps;
    if (unknownToday) { const {today: _today, ...rest} = props; props = rest; }
    return {events, props};
}
export function serverMonth(options: Options = {}) {
    const {props, events} = setup(options);
    return {html: renderToString(<StrictMode><CalendarMonth {...props}/></StrictMode>), events, range: getCalendarVisibleRange(props)};
}
export async function hydrateMonth(container: Element, options: Options = {}) {
    const fixture = setup(options), errors: string[] = [];
    const tree = () => <StrictMode><CalendarMonth {...fixture.props}/></StrictMode>;
    const root = hydrateRoot(container, tree(), {onRecoverableError: error => errors.push(String(error))});
    await new Promise<void>(done => requestAnimationFrame(() => requestAnimationFrame(() => done())));
    return {errors, events: fixture.events, patch: (props: Options) => { fixture.props = {...fixture.props, ...props} as CalendarProps; root.render(tree()); }, unmount: () => root.unmount()};
}
/** Client-only render of the same props (QA-14: inline declarations must equal the server and hydrated ones). */
export async function renderMonth(container: Element, options: Options = {}) {
    const fixture = setup(options), root = createRoot(container);
    root.render(<StrictMode><CalendarMonth {...fixture.props}/></StrictMode>);
    await new Promise<void>(done => requestAnimationFrame(() => requestAnimationFrame(() => done())));
    return {unmount: () => root.unmount()};
}
