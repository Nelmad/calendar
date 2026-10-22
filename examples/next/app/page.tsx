import {getCalendarVisibleRange} from '@nelmad/calendar';
import {ReleaseCalendar} from '../components/ReleaseCalendar';
import {loadRange, release} from '../components/releaseData';

// A Server Component: the pure helper gives the exact first grid range, so the records
// are loaded before the client bundle runs and arrive in the first HTML.
export default async function Page() {
    const range = getCalendarVisibleRange({anchorDate: release.anchorDate, timeZone: release.timeZone, locale: release.locale});
    return <ReleaseCalendar prefetch={{range, items: await loadRange(range)}}/>;
}
