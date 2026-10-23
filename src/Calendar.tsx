'use client';

import type {ReactElement} from 'react';
import type {CalendarProps} from './v02/public.js';
import {CalendarMonthRoot} from './v02/calendar/CalendarMonth.js';
import {applySurface, calendarSurface} from './v02/surface.js';

/** Public facade: only the current prerelease surface reaches the internal component. */
export function Calendar<TItemData = unknown, TSourceData = unknown>(props: CalendarProps<TItemData, TSourceData>): ReactElement {
    return <CalendarMonthRoot input={applySurface(props)} surface={calendarSurface}/>;
}
