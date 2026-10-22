// Fails when a path that package.json points consumers to (main, module,
// types, exports) is missing from the tarball `npm pack` would publish.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

function targets(value) {
  if (typeof value === 'string') return [value];
  if (value && typeof value === 'object') return Object.values(value).flatMap(targets);
  return [];
}

const declared = new Set(
  [manifest.main, manifest.module, manifest.types, ...targets(manifest.exports)]
    .filter((path) => typeof path === 'string' && !path.includes('*'))
    .map((path) => path.replace(/^\.\//, '')),
);

const [pack] = JSON.parse(
  execFileSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], { encoding: 'utf8' }),
);
const files = new Set(pack.files.map((file) => file.path));
const missing = [...declared].filter((path) => !files.has(path));

if (missing.length > 0) {
  console.error(`The tarball is missing paths declared in package.json: ${missing.join(', ')}`);
  process.exit(1);
}
console.log(`${pack.name}@${pack.version}: ${files.size} files, all ${declared.size} declared entry points present.`);
