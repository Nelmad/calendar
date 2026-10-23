import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

import react from '@vitejs/plugin-react';
import {configDefaults, defineConfig} from 'vitest/config';

const rootDir = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
    plugins: [react()],
    resolve: {
        alias: {
            '@': resolve(rootDir, 'src'),
        },
    },
    css: {
        modules: {
            localsConvention: 'camelCaseOnly',
            generateScopedName: '[name]__[local]__[hash:base64:5]',
        },
    },
    test: {
        environment: 'jsdom',
        setupFiles: ['./vitest.setup.ts'],
        // Claude Code worktrees (git-ignored) are checkouts of other branches inside this one.
        exclude: [...configDefaults.exclude, '.claude/worktrees/**'],
    },
});
