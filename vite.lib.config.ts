import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {readFileSync, rmSync} from 'node:fs';
import react from '@vitejs/plugin-react';
import {defineConfig} from 'vite';
import dts from 'vite-plugin-dts';

const rootDir = dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(readFileSync(resolve(rootDir, 'package.json'), 'utf8'));
const externals = [...Object.keys(manifest.dependencies), ...Object.keys(manifest.peerDependencies)];
const clientEntry = resolve(rootDir, 'src/Calendar.tsx');

export default defineConfig({
    plugins: [
        react(),
        {
            name: 'calendar-client-boundary',
            // Only RSC resolvers need a client directive. Ordinary ESM/CJS users
            // receive the same implementation without Rollup directive warnings.
            generateBundle(options, bundle) {
                const esm = options.format === 'es', extension = esm ? 'js' : 'cjs';
                const entry = bundle[`index.${extension}`];
                if (entry.type !== 'chunk') throw new Error('Missing root entry');
                this.emitFile({type: 'asset', fileName: `index.react-server.${extension}`,
                    source: entry.code.replaceAll(`./Calendar.${extension}`, `./Calendar.client.${extension}`)});
                this.emitFile({type: 'asset', fileName: `Calendar.client.${extension}`,
                    source: `'use client';\n${esm ? "export {Calendar} from './Calendar.js';" : "exports.Calendar = require('./Calendar.cjs').Calendar;"}\n`});
            },
        },
        dts({
            include: ['src'],
            exclude: ['src/**/__tests__/**', 'src/**/*.test.ts', 'src/**/*.test.tsx'],
            tsconfigPath: './tsconfig.build.json',
            bundleTypes: true,
            // The plugin bundles declarations for every lib entry. The Calendar entry exists only for the JS client
            // boundary; its Calendar.d.ts would be a second copy of the public types that no types condition names.
            afterBuild: () => rmSync(resolve(rootDir, 'dist/Calendar.d.ts')),
        }),
    ],
    build: {
        lib: {
            entry: {index: resolve(rootDir, 'src/index.ts'), Calendar: clientEntry},
            formats: ['es', 'cjs'],
            fileName: (format, name) => `${name}.${format === 'es' ? 'js' : 'cjs'}`,
        },
        rollupOptions: {
            preserveEntrySignatures: 'strict',
            output: {preserveModules: true, preserveModulesRoot: resolve(rootDir, 'src')},
            external: id => externals.some(name => id === name || id.startsWith(`${name}/`)),
            onwarn(warning, warn) {
                if (warning.code === 'MODULE_LEVEL_DIRECTIVE' && warning.id === clientEntry && warning.message.includes('use client')) return;
                warn(warning);
            },
        },
        outDir: 'dist',
        emptyOutDir: true,
    },
});
