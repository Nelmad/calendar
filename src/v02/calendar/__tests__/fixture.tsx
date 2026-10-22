import type {CalendarProps} from '../../reference.js';
import type {CalendarController} from '../useCalendarController.js';
import {CalendarShell} from '../CalendarShell.js';

export const fixtureProps = (): CalendarProps => ({items: [], anchorDate: '2026-01-01', today: '2026-02-14', timeZone: 'UTC', locale: 'en-US', onNavigate() {}});
/** Test-only grid: exercises the controller seam, not the T11 Month implementation. */
export function FixtureView({controller}: {controller: CalendarController<unknown, unknown>}) {
    const {model, gridRef, registerCell} = controller;
    if (model.kind !== 'data' || !model.index) return null;
    return <><span data-testid="today">{controller.today ?? 'unknown'}</span><span data-testid="agenda">{controller.agendaDate}</span>
        <div role="grid" aria-label="Controller fixture" ref={gridRef}>
            {model.index.days.map(day => <div key={day.date} ref={node => registerCell(day.date, node)} role="gridcell" aria-label={day.date}
                tabIndex={controller.focusDate === day.date ? 0 : -1} data-date={day.date} onFocus={() => controller.onDateFocus(day.date)}
                onKeyDown={event => {
                    if (event.key === 'PageDown' || event.key === 'PageUp') {
                        event.preventDefault();
                        controller.navigateGridMonth((event.key === 'PageDown' ? 1 : -1) * (event.shiftKey ? 12 : 1));
                    }
                }} onClick={() => controller.setUncontrolledAgendaDate(day.date)}>{day.date}</div>)}
        </div></>;
}
export function Fixture({input}: {input: CalendarProps}) {
    return <CalendarShell input={input} renderView={controller => <FixtureView controller={controller}/>}/>;
}
