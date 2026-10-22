import {copyFileSync} from 'node:fs';

// Explicit scoped asset; importing JavaScript never injects CSS.
copyFileSync(new URL('../src/v02/styles.css', import.meta.url), new URL('../dist/styles.css', import.meta.url));
// NodeNext require() consumers need a declaration with CommonJS identity.
copyFileSync(new URL('../dist/index.d.ts', import.meta.url), new URL('../dist/index.d.cts', import.meta.url));
