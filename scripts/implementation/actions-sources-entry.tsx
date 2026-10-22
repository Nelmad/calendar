import {StrictMode} from 'react';
import {hydrateRoot} from 'react-dom/client';
import {renderToString} from 'react-dom/server';
import {Calendar, type CalendarItem, type CalendarItemAction, type CalendarProps} from '../../src/index.js';

// T17 probe entry: only the public facade (surface gate with item actions and controlled sources) in development
// StrictMode, server render + hydration. Options are JSON from the probe; the callbacks record events, so the probe
// decides when (and whether) a requested filter is accepted.
export type ActionsSourcesOptions = Partial<CalendarProps> & {
    /** Supplies onVisibleSourceIdsChange; visibleSourceIds and sources come with the options. */
    filter?: boolean;
    /** Per-item action sets; other items get `defaultActions`. `null` defaults without a map remove the pair. */
    actionsByItem?: Record<string, CalendarItemAction[]>;
    defaultActions?: CalendarItemAction[] | null;
};
type Event = {type: string; value: unknown};
function props(options: ActionsSourcesOptions, events: Event[]): CalendarProps {
    const {filter, actionsByItem, defaultActions, ...rest} = options;
    const base = {items: [], anchorDate: '2026-03-01', today: '2026-03-04', timeZone: 'UTC', locale: 'en-US', ...rest,
        onNavigate: (date: string) => { events.push({type: 'navigate', value: date}); },
        onItemPress: (request: {item: CalendarItem; view: string}) => { events.push({type: 'press', value: {id: request.item.id, view: request.view}}); }};
    const actions = defaultActions === null && !actionsByItem ? {} : {
        getItemActions: (item: CalendarItem) => actionsByItem?.[item.id] ?? defaultActions ?? [],
        onItemActionRequest: ({item, actionId}: {item: CalendarItem; actionId: string}) => { events.push({type: 'action', value: {id: item.id, actionId, title: item.title}}); },
    };
    const sources = filter ? {onVisibleSourceIdsChange: (ids: readonly string[]) => { events.push({type: 'sources', value: [...ids]}); }} : {};
    return {...base, ...actions, ...sources} as CalendarProps;
}
const tree = (options: ActionsSourcesOptions, events: Event[]) => <StrictMode><Calendar {...props(options, events)}/></StrictMode>;
export function serverActions(options: ActionsSourcesOptions = {}) {
    const events: Event[] = [];
    return {html: renderToString(tree(options, events)), events};
}
export async function hydrateActions(container: Element, options: ActionsSourcesOptions = {}) {
    const events: Event[] = [], errors: string[] = [];
    let current = options;
    const root = hydrateRoot(container, tree(current, events), {onRecoverableError: error => errors.push(String(error))});
    await new Promise<void>(done => requestAnimationFrame(() => requestAnimationFrame(() => done())));
    return {errors, events, unmount: () => root.unmount(),
        patch: (next: ActionsSourcesOptions) => { current = {...current, ...next}; root.render(tree(current, events)); }};
}
