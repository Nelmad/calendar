import {StrictMode, useEffect, type ReactNode} from 'react';
import {hydrateRoot} from 'react-dom/client';
import {App} from '../../examples/vite/src/App';
import type {ReleasePrefetch} from '../../examples/vite/src/ReleaseCalendar';

// T19-V1-02 probe entry: the documented example routes exactly as examples/vite renders them (entry-server.tsx on the
// server, main.tsx hydration in StrictMode), built in development mode with '@nelmad/calendar' aliased to the source
// facade. Packed consumers run production builds, where the SDK's development warnings are silent.
export {render} from '../../examples/vite/src/entry-server';
/** Adds no DOM. Its passive effect runs after the whole example's, once hydration (or the client render that recovered
 * from a mismatch) has committed; React reports recoverable errors during that commit, before any passive effect. */
function Hydrated({children}: {children: ReactNode}) {
    useEffect(() => { document.documentElement.dataset.hydrated = 'true'; }, []);
    return children;
}
/** hydrateRoot only schedules hydration (a Scheduler task), so the returned array fills later: read it live, once
 * html[data-hydrated=true]. */
export function hydrateExample(container: Element, path: string, prefetch?: ReleasePrefetch) {
    const errors: string[] = [];
    hydrateRoot(container, <StrictMode><Hydrated><App path={path} {...(prefetch ? {prefetch} : {})}/></Hydrated></StrictMode>,
        {onRecoverableError: error => errors.push(String(error))});
    return errors;
}
