// The settings the baseline and calendar builds of the size protocol share (issue #12). bundle-size.mjs adds only the
// entry and, for its diagnostics, the Vite default target or a chunk per package. No imports: the self-checks read it too.
export default {
    // React's automatic JSX runtime without extra plugins, as in examples/vite.
    esbuild: {jsx: 'automatic'},
    build: {
        // The gated target (decision Q2a); changing it is a dated protocol change with before/after numbers.
        target: 'es2020',
        minify: 'esbuild',
        cssMinify: 'esbuild',
        sourcemap: false,
        modulePreload: {polyfill: false},
        // React and ReactDOM with all their subpaths are external in both builds; every other dependency counts.
        rollupOptions: {external: id => /^react(?:-dom)?(?:\/|$)/.test(id)},
    },
};
