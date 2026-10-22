import {StrictMode} from 'react';
import {renderToString} from 'react-dom/server';
import {getCalendarVisibleRange} from '@nelmad/calendar';
import {App} from './App';
import {loadRange, release} from './releaseData';

/** Server render: the pure helper gives the exact first grid range before any client code runs. */
export async function render(path: string) {
    const range = getCalendarVisibleRange({anchorDate: release.anchorDate, timeZone: release.timeZone, locale: release.locale});
    const prefetch = path === '/' ? {range, items: await loadRange(range)} : undefined;
    const html = renderToString(<StrictMode><App path={path} {...(prefetch ? {prefetch} : {})}/></StrictMode>);
    return {html, prefetch};
}
