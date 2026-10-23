import {Calendar, getCalendarVisibleRange} from '@nelmad/calendar';
import '@nelmad/calendar/styles.css';

// Packed-consumer probe added to the Next example: a direct Server Component import
// exercises the SDK's own client boundary with a Server Action as onNavigate.
async function navigate(_date: string) { 'use server'; }
export default function BoundaryPage() {
    const range = getCalendarVisibleRange({anchorDate: '2026-09-01', timeZone: 'UTC', locale: 'en-US'});
    return <section><output id="boundary-range">{range.start}</output><Calendar items={[]} timeZone="UTC" locale="en-US"
        anchorDate="2026-09-01" today="2026-09-03" onNavigate={navigate} layout="desktop"/></section>;
}
