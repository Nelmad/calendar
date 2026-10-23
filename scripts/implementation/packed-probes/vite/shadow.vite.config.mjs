// Packed-consumer Shadow DOM probe build (QA-05): the example's own config with a harness-only page.
import {defineConfig, mergeConfig} from 'vite';
import base from './vite.config.mjs';

export default mergeConfig(base, defineConfig({build: {outDir: 'dist-shadow', rollupOptions: {input: 'shadow.html'}}}));
