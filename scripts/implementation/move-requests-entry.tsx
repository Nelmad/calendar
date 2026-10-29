import {StrictMode} from 'react';
import {flushSync} from 'react-dom';
import {createRoot} from 'react-dom/client';
import type {CalendarItem, CalendarMoveRequest, CalendarMoveState, CalendarProps} from '../../src/v02/reference.js';
import {CalendarMonthRoot} from '../../src/v02/calendar/CalendarMonth.js';
import type {CalendarController} from '../../src/v02/calendar/useCalendarController.js';
import {classicTheme} from '../../src/v02/themes/classic.js';
import {neutralTheme} from '../../src/v02/themes/neutral.js';
import {createDateAdapter} from '../../src/v02/core/date.js';
import {evaluateMoveTarget} from '../../src/v02/core/move.js';

// #10 probe entry: the internal CalendarMonth with the move pair. `pending` names items with a pending record of another
// Calendar; `accept` publishes pending, then succeeded, for this Calendar's own requests. The internal onController seam
// reaches controller.move, as the later input adapters will. Every callback is recorded in `events`.
type Options = Partial<CalendarProps> & {themeName?: 'classic' | 'neutral'; pending?: readonly string[]; textColor?: string; actions?: boolean; only?: readonly string[]};
type Event = {type: string; value: unknown};
export const items: CalendarItem[] = [
    {id: 'bar', title: 'Release preparation', calendarId: 'work', data: {}, interval: {kind: 'allDay', start: '2026-09-03', end: '2026-09-11'}},
    {id: 'sync', title: 'Team sync', calendarId: 'work', data: {}, interval: {kind: 'timed', start: '2026-09-03T10:00:00Z', end: '2026-09-03T10:30:00Z'}},
    {id: 'review', title: 'Design review of the quarterly roadmap with every team', calendarId: 'work', data: {},
        interval: {kind: 'timed', start: '2026-09-03T14:00:00Z', end: '2026-09-03T15:00:00Z'}},
];
const dates = createDateAdapter();

export function mountMove(container: Element, initial: Options) {
    const events: Event[] = [], root = createRoot(container);
    let options = initial, own: CalendarMoveState[] = [], controller: CalendarController<unknown, unknown> | null = null;
    const props = (): CalendarProps => {
        const {themeName, pending = [], textColor, actions, only, ...rest} = options;
        const external = pending.map((itemId, index): CalendarMoveState => ({requestId: `external-${index}`, itemId, status: 'pending'}));
        // A desktop root of definite height, so every item of 3 September has a lane instead of a "+N".
        const style = (rest.layout ?? 'desktop') === 'desktop' ? {blockSize: 860} : undefined;
        return {items: only ? items.filter(item => only.includes(item.id)) : items, sources: [{id: 'work', title: 'Work'}], anchorDate: '2026-09-01', today: '2026-09-15', timeZone: 'UTC', locale: 'en-US', layout: 'desktop',
            style, ...rest,
            ...(themeName ? {theme: themeName === 'neutral' ? neutralTheme : classicTheme} : {}),
            ...(textColor ? {getItemAppearance: () => ({backgroundColor: 'rgb(40, 40, 120)', textColor})} : {}),
            ...(rest.agendaDate !== undefined ? {onAgendaDateChange: (value: string) => events.push({type: 'agenda', value})} : {}),
            ...(actions ? {getItemActions: () => [{id: 'open', label: 'Open'}], onItemActionRequest: (value: unknown) => events.push({type: 'action', value})} : {}),
            onNavigate: (value: string) => events.push({type: 'navigate', value}), onItemPress: (value: {item: CalendarItem}) => events.push({type: 'press', value: value.item.id}),
            itemMoveStates: [...external, ...own],
            onItemMoveDraftChange: (value: string | null) => events.push({type: 'draft', value}),
            onItemMoveRequest: (request: CalendarMoveRequest) => {
                events.push({type: 'request', value: {itemId: request.item.id, requestId: request.requestId, input: request.input, proposed: request.proposedInterval}});
            }} as CalendarProps;
    };
    const render = () => flushSync(() => root.render(<StrictMode>
        <CalendarMonthRoot input={props()} onController={(value: CalendarController<unknown, unknown>) => { controller = value; }}/></StrictMode>));
    render();
    return {
        events,
        patch(next: Options) { options = {...options, ...next}; render(); },
        /** Replaces this Calendar's own published records, as the consumer's server would. */
        publish(states: CalendarMoveState[]) { own = states; render(); },
        /** One confirmation through the internal API, as an adapter's handler does it, with #9's proposal. */
        submit(itemId: string, target: string) {
            const move = controller!.move, model = controller!.model, draft = move.startDraft(itemId);
            if (!draft || model.kind !== 'data') return null;
            const result = evaluateMoveTarget(draft, model.visible.get(itemId)!, target, 'pointer', model.props.interactionPolicy, dates);
            if (result.kind !== 'allowed') { move.endDraft('invalid'); return null; }
            return move.submit(result.proposal);
        },
        unmount: () => root.unmount(),
    };
}
