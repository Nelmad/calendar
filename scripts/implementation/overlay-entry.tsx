import {StrictMode} from 'react';
import {hydrateRoot} from 'react-dom/client';
import {renderToString} from 'react-dom/server';
import {Calendar, type CalendarProps} from '../../src/index.js';
import {ActionsPresentationContext} from '../../src/v02/calendar/overlays.js';

// T16 probe entry: the public facade (surface gate, portalContainer) in development StrictMode, server render +
// hydration. Since T17 item menus are the public actions; the private seam only forces their presentation (menu or
// sheet), so the stack scenarios of T16 (a menu inside an inline agenda, a modal child) keep their coverage.
type Menus = 'menu' | 'sheet' | undefined;
export type OverlayOptions = Partial<CalendarProps> & {controlled?: boolean; menus?: Menus};
function setup(options: OverlayOptions) {
    const events: {type: string; value: unknown}[] = [];
    const {controlled, menus, ...overrides} = options;
    const props = {items: [], anchorDate: '2026-03-01', today: '2026-03-04', timeZone: 'UTC', locale: 'en-US', ...overrides,
        onNavigate: (date: string) => events.push({type: 'navigate', value: date}),
        // A host page may answer the press (QA-10: open its own dialog); the probe installs it on the page.
        onItemPress: (value: unknown) => { events.push({type: 'item', value}); (globalThis as {calendarItemPress?: (value: unknown) => void}).calendarItemPress?.(value); },
        ...(controlled ? {agendaDate: overrides.agendaDate ?? '2026-03-04', onAgendaDateChange: (value: string) => events.push({type: 'agenda', value})} : {}),
        onVisibleRangeChange: (range: unknown) => events.push({type: 'range', value: range})} as CalendarProps;
    const actions = {getItemActions: () => [{id: 'open', label: 'Open'}, {id: 'share', label: 'Share'}],
        onItemActionRequest: ({item, actionId}: {item: {id: string}; actionId: string}) => { events.push({type: 'action', value: {itemId: item.id, id: actionId}}); }};
    return {events, props, menus, actions};
}
const tree = (fixture: ReturnType<typeof setup>) => <StrictMode><ActionsPresentationContext.Provider value={fixture.menus}>
    <Calendar {...(fixture.menus ? {...fixture.props, ...fixture.actions} : fixture.props) as CalendarProps}/></ActionsPresentationContext.Provider></StrictMode>;
export function serverOverlay(options: OverlayOptions = {}) {
    const fixture = setup(options);
    return {html: renderToString(tree(fixture)), events: fixture.events};
}
export async function hydrateOverlay(container: Element, options: OverlayOptions = {}) {
    const fixture = setup(options), errors: string[] = [];
    const root = hydrateRoot(container, tree(fixture), {onRecoverableError: error => errors.push(String(error))});
    await new Promise<void>(done => requestAnimationFrame(() => requestAnimationFrame(() => done())));
    return {errors, events: fixture.events, unmount: () => root.unmount(),
        patch: (props: OverlayOptions) => {
            const {menus, ...rest} = props;
            if ('menus' in props) fixture.menus = menus;
            fixture.props = {...fixture.props, ...rest} as CalendarProps; root.render(tree(fixture));
        }};
}
export {mirroredFontProperties, mirroredVariables} from '../../src/v02/primitives/mirror.js';
