import {StrictMode} from 'react';
import {hydrateRoot} from 'react-dom/client';
import {App} from '../../examples/vite/src/App';
import type {ReleasePrefetch} from '../../examples/vite/src/ReleaseCalendar';

// T19-V1-02 probe entry: the documented example routes exactly as examples/vite renders them (entry-server.tsx on the
// server, main.tsx hydration in StrictMode), built in development mode with '@nelmad/calendar' aliased to the source
// facade. Packed consumers run production builds, where the SDK's development warnings are silent.
export {render} from '../../examples/vite/src/entry-server';
export function hydrateExample(container: Element, path: string, prefetch?: ReleasePrefetch) {
    const errors: string[] = [];
    hydrateRoot(container, <StrictMode><App path={path} {...(prefetch ? {prefetch} : {})}/></StrictMode>, {onRecoverableError: error => errors.push(String(error))});
    return errors;
}
