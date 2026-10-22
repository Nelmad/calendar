import {defineConfig} from 'vite';

export default defineConfig({
    // React's automatic JSX runtime without extra plugins; add @vitejs/plugin-react for Fast Refresh.
    esbuild: {jsx: 'automatic'},
    plugins: [{
        // The components shared with the Next.js example start with 'use client'. Vite has no Server
        // Components, so the directive is blanked in place (same length, source maps stay valid)
        // instead of producing a "module level directive" warning on every build.
        name: 'shared-use-client', enforce: 'pre',
        transform: (code, id) => !id.includes('/node_modules/') && code.startsWith("'use client';") ? {code: ' '.repeat(13) + code.slice(13), map: null} : undefined,
    }],
    // The client chunk carries React Aria and the time-zone accepted set; split it in a real app if needed.
    build: {chunkSizeWarningLimit: 1000},
});
