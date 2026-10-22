// Packed-consumer Suspense probe build (QA-01): the example's own config with a harness-only page.
import {defineConfig, mergeConfig} from 'vite';
import base from './vite.config.mjs';

export default mergeConfig(base, defineConfig({build: {outDir: 'dist-suspense', rollupOptions: {input: 'suspense.html'}}}));
