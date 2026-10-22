import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {dirname, resolve} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {describe, expect, it} from 'vitest';
import {initializeUIRuntime} from '../runtime.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const require = createRequire(import.meta.url);
const manifest = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')) as {dependencies: Record<string, string>};
const pinOf = (name: string) => (JSON.parse(readFileSync(require.resolve(`${name}/package.json`), 'utf8')) as {dependencies: Record<string, string>}).dependencies['react-stately'];

// QA-05: the Shadow DOM flag works only in the react-stately instance React Aria reads. A fresh consumer install has one
// instance only when nothing in the SDK dependencies resolves react-stately differently from the exact pin of React Aria.
describe('UI runtime: one react-stately flag instance', () => {
    it('pins react-stately exactly like react-aria and react-aria-components and has no separate flags package', () => {
        expect(manifest.dependencies['@react-stately/flags']).toBeUndefined();
        expect(manifest.dependencies['react-stately']).toMatch(/^\d+\.\d+\.\d+$/);
        expect(manifest.dependencies['react-stately']).toBe(pinOf('react-aria'));
        expect(manifest.dependencies['react-stately']).toBe(pinOf('react-aria-components'));
    });
    it('enables Shadow DOM support in the flag module that react-aria and react-aria-components read', async () => {
        initializeUIRuntime();
        for (const name of ['react-aria', 'react-aria-components']) {
            // The ESM file next to the CommonJS one that the package resolves from its own location.
            const flags = createRequire(require.resolve(name)).resolve('react-stately/private/flags/flags').replace(/\.cjs$/, '.mjs');
            expect(((await import(/* @vite-ignore */ pathToFileURL(flags).href)) as {shadowDOM: () => boolean}).shadowDOM(), name).toBe(true);
        }
    });
});
