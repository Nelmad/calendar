// Packed-consumer acceptance build: the example's own config with a harness-only page.
import {defineConfig, mergeConfig} from 'vite';
import base from './vite.config.mjs';

export default mergeConfig(base, defineConfig({build: {outDir: 'dist-acceptance', rollupOptions: {input: 'acceptance.html'}}}));
