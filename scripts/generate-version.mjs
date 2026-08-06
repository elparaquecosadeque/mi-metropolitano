// Writes src/app/version.ts from package.json's major.minor, with patch = CI run number.
// Locally (no GITHUB_RUN_NUMBER) patch falls back to 0.
import { readFileSync, writeFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url)));
const [major, minor] = pkg.version.split('.');
const patch = process.env.GITHUB_RUN_NUMBER ?? '0';
const version = `${major}.${minor}.${patch}`;

writeFileSync(
  new URL('../src/app/version.ts', import.meta.url),
  `export const APP_VERSION = '${version}';\n`,
);

console.log(`Generated src/app/version.ts -> ${version}`);
