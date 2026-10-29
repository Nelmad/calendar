import {useId, useRef, type ReactNode, type RefObject} from 'react';
import type {CalendarAgendaItemSlotContext} from '../reference.js';
import {LocalizedText} from '../LocalizedText.js';
import {Button, IconButton, Icon} from '../primitives/index.js';
import {useServerStyle} from '../primitives/serverStyle.js';
import {AccentMarker, PendingMarker, SlotContent, classes, resolveClass, surfaceStyle} from './slots.js';
import type {CalendarDataModel} from './model.js';
import {ItemActionsButton} from './overlays.js';

/**
 * Shared semantic content; presentation owns heading focus, close and portal behavior. `select`: the Select day control
 * (#11), after the count; without it the element structure, and so the server ids, stay as in a viewer.
 */
export function DayAgendaBody<I, S>({model, date, heading, headingId, onClose, select}: {
    model: CalendarDataModel<I, S>; date: string; heading: RefObject<HTMLHeadingElement>; headingId: string; onClose?: () => void; select?: ReactNode;
}) {
    const entries = model.index!.agenda(date), id = useId();
    const count = <p className="nc-day-list-count"><LocalizedText value={model.message('itemCountLabel', date, entries.length)}/></p>;
    return <>
        <div className="nc-day-list-heading">
            <h3 ref={heading} id={headingId} tabIndex={-1}><LocalizedText value={model.message('agendaHeading', date)}/></h3>
            {onClose && <IconButton data-agenda-close lang={model.message('closeAgendaLabel').lang} aria-label={model.message('closeAgendaLabel').text}
                onPress={onClose}><Icon name="close"/></IconButton>}
        </div>
        {select ? <>{count}{select}</> : count}
        {entries.length ? <ul>{entries.map((entry, index) => <AgendaRow key={entry.record.item.id} model={model} entry={entry} index={index} id={id} date={date}/>)}</ul> : <p className="nc-day-list-empty"><LocalizedText value={model.message('agendaEmpty')}/></p>}
    </>;
}
type AgendaEntry<I, S> = ReturnType<NonNullable<CalendarDataModel<I, S>['index']>['agenda']>[number];
/** One agenda row: the primary press surface (or a plain list item), the accent marker and the separate actions trigger. */
function AgendaRow<I, S>({model, entry, index, id, date}: {model: CalendarDataModel<I, S>; entry: AgendaEntry<I, S>; index: number; id: string; date: string}) {
    const props = model.props, {item, source, title, interval} = entry.record, appearance = model.appearance.resolve(entry.record);
    const context: CalendarAgendaItemSlotContext<I, S> = {item, ...(source ? {source} : {}), view: 'agenda', date,
        isSelected: !!props.selection && date >= props.selection.start && date < props.selection.end, isDragging: false,
        // §5.7: no primary and no action operation for this row (item moves come in a later prerelease). isPending follows
        // the accepted move states only (#10).
        isPending: !!model.moves?.pending.has(item.id), isDisabled: !props.onItemPress && !model.actions.resolve(item).actions.length};
    const times = interval.kind === 'allDay' ? model.format.range(interval) : model.format.timedRange(interval.start, interval.end);
    // Decision Q10 of #10: title, then the pending state, the times and the source on the details line; the state is
    // visible text in the default row and starts the details of the hidden summary that names a custom row.
    const summary = <><span className="nc-agenda-title">{item.title.trim().length > 0 ? <bdi dir="auto">{title}</bdi> : <LocalizedText value={model.message('untitledItemLabel')}/>}</span>
        <span className="nc-agenda-details">{context.isPending && <><span className="nc-agenda-pending"><LocalizedText value={model.message('pendingStateLabel')}/></span> · </>}
            {times.map((part, index) => <span key={index} lang={part.lang} dir={part.dir}>{part.text}</span>)}
            {source && <> · <bdi dir="auto">{source.title}</bdi></>}</span></>;
    // §10.4: a custom row replaces the visible default content only. The default summary (visually hidden) starts the
    // row's accessible name and the visible custom content follows it, so the visible label is part of the name
    // (WCAG 2.5.3, found by the T19 acceptance).
    const custom = props.renderAgendaItem && {summary: `${id}-${index}-summary`, content: `${id}-${index}-content`};
    const content = <><AccentMarker appearance={appearance}/>
        {custom ? <><span id={custom.summary} className="nc-visually-hidden">{summary}</span>
            <SlotContent slot="renderAgendaItem" id={custom.content} className="nc-agenda-content">{props.renderAgendaItem!(context)}</SlotContent></>
            : <span className="nc-agenda-content">{summary}</span>}
        {context.isPending && <PendingMarker/>}</>;
    // Spec v8 §10.3.4: the validated item colors of a server-rendered row come back when a strict CSP blocked them.
    const style = surfaceStyle(appearance), row = useRef<HTMLLIElement>(null), primary = useRef<HTMLButtonElement>(null);
    useServerStyle(props.onItemPress ? primary : row, style);
    return <li ref={row} data-item-id={item.id} data-view="agenda" data-selected={context.isSelected || undefined} data-pending={context.isPending || undefined}
        className={classes('nc-agenda-item', resolveClass(props.classNames?.agendaItem, context))} style={props.onItemPress ? undefined : style}>
        {props.onItemPress ? <Button ref={primary} data-agenda-control="primary" style={style} aria-labelledby={custom && `${custom.summary} ${custom.content}`}
            onPress={() => props.onItemPress?.({item, date, view: 'agenda'})}>{content}</Button> : content}
        <ItemActionsButton itemId={item.id} className={() => resolveClass(props.classNames?.itemActions, context)}/>
    </li>;
}
