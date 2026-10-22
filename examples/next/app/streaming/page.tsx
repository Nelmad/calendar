import {AutoSchedule} from '../../components/AutoSchedule';

// Rendered on each request: the shell with loading.tsx is sent first, this segment streams in after its data and
// hydrates inside a separate Suspense boundary. The calendar settles to idle there (no repeated renders).
export const dynamic = 'force-dynamic';
export default async function StreamingPage() {
    await new Promise(resolve => setTimeout(resolve, 150)); // a slower data source
    return <><h1 className="example-title" lang="en">Streaming</h1><AutoSchedule/></>;
}
