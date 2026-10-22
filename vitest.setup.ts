import '@testing-library/jest-dom/vitest';
import {cleanup} from '@testing-library/react';
import {afterEach} from 'vitest';

afterEach(() => {
    cleanup();
});

// A server render inside jsdom is an artifact of the test host: `document` exists, so isomorphic layout effects (the
// package's and React Aria's) choose useLayoutEffect, and React 18's server renderer logs its documented notice once per
// effect (T15-R2-04). A real server has no document; the node-environment suites (ssr.test.tsx, surface.ssr.test.tsx)
// render there and keep this notice visible, so only the jsdom copy of this one message is dropped. Every other
// console.error, and any test's own console spy, is unchanged.
if (typeof document !== 'undefined') {
    const error = console.error;
    console.error = (...args: unknown[]) => {
        if (typeof args[0] === 'string' && args[0].startsWith('Warning: useLayoutEffect does nothing on the server')) return;
        error(...args);
    };
}
