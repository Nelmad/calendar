import {useId, useRef, type CSSProperties, type KeyboardEvent, type MouseEvent} from 'react';
import type {CalendarDayState, CalendarMonthItemSlotContext} from '../reference.js';
import {fitWeekLanes, type WeekSegment} from '../core/layout.js';
import {gridKeyTarget, hitDate, rowLaneCapacity, type RowMetrics} from '../core/month.js';
import {inRange, monthStart, shiftMonth} from '../core/controller.js';
import {LocalizedText} from '../LocalizedText.js';
import {useMonthMeasurements, useWeekdayFit} from './useMonthMeasurements.js';
import {useServerStyle} from '../primitives/serverStyle.js';
import {useMessageDiagnostics, type CalendarController} from './useCalendarController.js';
import type {CalendarDataModel, CalendarModel} from './model.js';
import {AccentMarker, SlotContent, classes, resolveClass, surfaceStyle} from './slots.js';

export type DateActivation = (date: string, input: 'pointer' | 'keyboard') => void;
/** `popup`: the resolved agenda is an overlay (popover/sheet); inline agenda cells carry no popup attributes. */
type MonthProps<I, S> = {controller: CalendarController<I, S>; headingId: string; onDateActivate: DateActivation; popup: boolean; openAgendaDate?: string};

export function MonthView<I, S>(props: MonthProps<I, S>) {
    return props.controller.model.kind === 'data' && props.controller.model.index ? <DataMonth {...props} model={props.controller.model}/> : null;
}
function DataMonth<I, S>({controller, model, headingId, onDateActivate, popup, openAgendaDate}: MonthProps<I, S> & {model: CalendarDataModel<I, S>}) {
    const id = useId(), {props, index, state} = model, {gridRef, weekdaysRef, registerCell} = controller;
    useMessageDiagnostics(model as CalendarModel<unknown, unknown>, controller.warn);
    // Mobile shows indicators, not lanes: no row observer is needed there (§11.3).
    const rows = useMonthMeasurements(gridRef, `${model.range.start}/${model.range.end}/${state.layout}/${state.density}/${model.lang}`, state.layout === 'desktop');
    useWeekdayFit(weekdaysRef, `${model.range.start}/${state.layout}/${state.density}/${model.lang}`);
    const minimumRow = Math.max(64, ...rows.map(row => row.header + row.overflow + 2 * row.gap + 1).filter(Number.isFinite));
    const style = {'--nc-week-count': index!.weeks.length, '--nc-minimum-row': `${minimumRow}px`} as CSSProperties;
    useServerStyle(gridRef, style);
    const selectionEnabled = props.selection !== undefined;
    const boundary = !shiftMonth(model.month, -1) || !shiftMonth(model.month, 1);
    const activate = (date: string, input: 'pointer' | 'keyboard') => { controller.navigate(date, 'grid'); onDateActivate(date, input); };
    // QA-12: focus from a pointer press stays where the page is. Scrolling on mousedown would move the cell under the
    // pointer before mouseup and lose the click; keyboard and programmatic focus still bring the cell into view.
    const pointerDate = useRef<string | null>(null);
    // The mark lives for one press: a press on the already focused cell fires no focus event, so the end of that press
    // (its click, or a cancel) clears it, and a later restoration of focus to the cell scrolls again (QA-D-1-06).
    const pressCell = (node: HTMLElement, date: string) => {
        pointerDate.current = date;
        const done = new AbortController(), end = () => { if (pointerDate.current === date) pointerDate.current = null; done.abort(); };
        for (const type of ['click', 'pointercancel']) node.ownerDocument.addEventListener(type, end, {capture: true, signal: done.signal});
    };
    const keyDown = (event: KeyboardEvent<HTMLDivElement>, date: string, column: number) => {
        pointerDate.current = null;
        if (event.altKey || event.ctrlKey || event.metaKey) return;
        if (event.key === 'Enter') { event.preventDefault(); activate(date, 'keyboard'); }
        else if (event.key === 'PageUp' || event.key === 'PageDown') {
            event.preventDefault(); controller.navigateGridMonth((event.key === 'PageDown' ? 1 : -1) * (event.shiftKey ? 12 : 1));
        } else if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) {
            event.preventDefault(); const target = gridKeyTarget(date, column, event.key, state.dir); if (target) controller.navigate(target, 'grid');
        } else if (event.key === ' ') event.preventDefault(); // Selection commands join this viewer in T20.
    };
    const pressSegment = (event: MouseEvent<HTMLDivElement>, segment: WeekSegment<I, S>) => {
        event.stopPropagation();
        const row = event.currentTarget.closest('.nc-month-week')!;
        const columns = [...row.querySelectorAll<HTMLElement>('[role=gridcell]')].map(cell => {
            const box = cell.getBoundingClientRect(); return {date: cell.dataset.date!, left: box.left, right: box.right};
        });
        const date = hitDate(event.clientX, columns, segment.segmentRange);
        if (!date) return;
        controller.navigate(date, 'grid');
        if (props.onItemPress) props.onItemPress({item: segment.entry.record.item, date, view: 'month', segmentRange: {...segment.segmentRange}});
        else onDateActivate(date, 'pointer');
    };
    // QA-19: the instructions describe the grid from outside it; a grid owns only rows (§12.1). A rendered grid is never
    // blocking, so loading here is a refresh: its stale content is busy (§9, QA-08).
    return <><span id={`${id}-instructions`} className="nc-visually-hidden"><LocalizedText value={model.message('gridInstructions')}/>
        {/* Review 2026-10-09-3: a separate sentence in the computed description, also after a `messages` text without a final period. */}
        {boundary && <>{' '}<LocalizedText value={model.message('navigationBoundaryReason')}/></>}</span>
    <div ref={gridRef} role="grid" className={classes('nc-month', resolveClass(props.classNames?.grid, state))} style={style}
        aria-labelledby={headingId} aria-describedby={`${id}-instructions`} aria-colcount={7} aria-rowcount={index!.weeks.length + 1}
        aria-multiselectable={selectionEnabled ? true : undefined} aria-busy={state.dataState.status === 'loading' ? true : undefined}>
        <div aria-hidden="true" className="nc-month-probes"><div className="nc-month-item-probe">M</div><div className="nc-month-overflow-probe">+1</div></div>
        <div ref={weekdaysRef} role="row" aria-rowindex={1} className="nc-month-weekdays">
            {index!.weeks[0].dates.map((date, column) => <div key={date} role="columnheader" aria-colindex={column + 1}
                lang={model.lang} aria-label={model.format.date(date, 'weekday').text} data-narrow-label={model.format.date(date, 'weekdayNarrow').text}
                className={classes('nc-weekday', resolveClass(props.classNames?.weekdayHeader, state))}><span className="nc-weekday-label">{model.format.date(date, 'weekdayShort').text}</span></div>)}
        </div>
        <div role="rowgroup" className="nc-month-weeks">
            {index!.weeks.map((week, weekIndex) => {
                const metrics = rows[weekIndex] as RowMetrics | undefined, desktop = state.layout === 'desktop';
                const fitted = fitWeekLanes(week, desktop ? rowLaneCapacity(metrics) : {withoutOverflow: 0, withOverflow: 0});
                return <div key={week.dates[0]} role="row" aria-rowindex={weekIndex + 2} data-week={week.dates[0]} className="nc-month-week">
                    {fitted.days.map((day, column) => {
                        const dayState: CalendarDayState = {date: day.date, isToday: day.date === controller.today, isAgendaDate: day.date === controller.agendaDate,
                            isSelected: !!props.selection && inRange(day.date, props.selection), isSelectionDraft: false, isSelectionUnavailable: false,
                            isOutsideMonth: monthStart(day.date) !== model.month, itemCount: day.itemCount};
                        const cellId = `${id}-${day.date}`;
                        return <div key={day.date} ref={node => registerCell(day.date, node)} role="gridcell" aria-colindex={column + 1}
                            aria-haspopup={popup ? 'dialog' : undefined} aria-expanded={popup ? day.date === openAgendaDate : undefined}
                            aria-labelledby={`${cellId}-label`} aria-describedby={`${cellId}-description`} aria-current={dayState.isToday ? 'date' : undefined}
                            aria-selected={selectionEnabled ? dayState.isSelected : undefined} tabIndex={controller.focusDate === day.date ? 0 : -1}
                            data-date={day.date} data-today={dayState.isToday || undefined} data-agenda-date={dayState.isAgendaDate || undefined}
                            data-selected={dayState.isSelected || undefined} data-outside-month={dayState.isOutsideMonth || undefined} data-has-items={!!day.itemCount || undefined}
                            className={classes('nc-day', resolveClass(props.classNames?.day, dayState))}
                            onPointerDown={event => pressCell(event.currentTarget, day.date)}
                            onFocus={event => {
                                controller.onDateFocus(day.date);
                                if (pointerDate.current !== day.date) event.currentTarget.scrollIntoView?.({block: 'nearest', inline: 'nearest'});
                                pointerDate.current = null;
                            }}
                            onKeyDown={event => keyDown(event, day.date, column)} onClick={() => activate(day.date, 'pointer')}>
                            <span id={`${cellId}-label`} className="nc-visually-hidden" lang={model.lang}>{model.format.date(day.date).text}</span>
                            <span id={`${cellId}-description`} className="nc-visually-hidden">
                                <LocalizedText value={model.message('itemCountLabel', day.date, day.itemCount)}/>{' '}
                                {dayState.isToday && <><LocalizedText value={model.message('todayStateLabel')}/>{' '}</>}
                                {dayState.isSelected && <><LocalizedText value={model.message('selectedStateLabel')}/>{' '}</>}
                                {dayState.isAgendaDate && <><LocalizedText value={model.message('viewedDateStateLabel')}/>{' '}</>}
                                {desktop && day.hiddenCount > 0 && <LocalizedText value={model.message('moreItemsLabel', day.date, day.hiddenCount)}/>}
                            </span>
                            <div aria-hidden="true" className={classes('nc-day-header', resolveClass(props.classNames?.dayHeader, dayState))}>
                                {props.renderDayHeader ? <SlotContent slot="renderDayHeader">{props.renderDayHeader(dayState)}</SlotContent> : <span>{model.format.date(day.date, 'day').text}</span>}
                            </div>
                            {/* QA-17: "+N" keeps its sign before the number in RTL. */}
                            {desktop && day.hiddenCount > 0 && <div aria-hidden="true" className={classes('nc-overflow', resolveClass(props.classNames?.overflowIndicator, {...dayState, hiddenItemCount: day.hiddenCount}))}>
                                <bdi dir="ltr">+{new Intl.NumberFormat(model.lang).format(day.hiddenCount)}</bdi></div>}
                            {!desktop && day.itemCount > 0 && <span aria-hidden="true" className="nc-day-indicator"/>}
                        </div>;
                    })}
                    {desktop && metrics && <div aria-hidden="true" className="nc-month-segments">
                        {fitted.visibleSegments.map(segment => {
                            const {item, source, title} = segment.entry.record, appearance = model.appearance.resolve(segment.entry.record);
                            const context: CalendarMonthItemSlotContext<I, S> = {item, ...(source ? {source} : {}), view: 'month', segmentRange: segment.segmentRange,
                                isSelected: !!props.selection && props.selection.start < segment.segmentRange.end && segment.segmentRange.start < props.selection.end,
                                isDragging: false,
                                // §5.7: a month segment offers only the primary press (actions live in the agenda; move joins in T23).
                                isPending: false, isDisabled: !props.onItemPress};
                            return <div key={`${item.id}/${segment.segmentRange.start}`} data-item-id={item.id} data-view="month" data-selected={context.isSelected || undefined}
                                data-continues-before={segment.continuesBefore || undefined} data-continues-after={segment.continuesAfter || undefined}
                                className={classes('nc-month-item', segment.entry.presentation === 'bar' ? 'nc-month-bar' : 'nc-month-chip', resolveClass(props.classNames?.item, context))}
                                style={{insetInlineStart: `${segment.startColumn * 100 / 7}%`, inlineSize: `${(segment.endColumn - segment.startColumn) * 100 / 7}%`,
                                    top: metrics.header + metrics.gap + segment.lane * (metrics.item + metrics.gap), height: metrics.item, ...surfaceStyle(appearance)}}
                                onClick={event => pressSegment(event, segment)}>
                                <AccentMarker appearance={appearance}/>
                                {/* QA-18: a continuation shows no start time, so it does not read as another item. */}
                                {props.renderItem ? <SlotContent slot="renderItem" className="nc-item-content">{props.renderItem(context)}</SlotContent> : <><span className="nc-item-time">{segment.entry.record.interval.kind === 'timed' && !segment.continuesBefore
                                    ? model.format.time(segment.entry.record.interval.start).text : ''}</span>
                                    {item.title.trim().length > 0 ? <bdi dir="auto">{title}</bdi> : <LocalizedText value={model.message('untitledItemLabel')}/>}</>}
                            </div>;
                        })}
                    </div>}
                </div>;
            })}
        </div>
    </div></>;
}
