import { cp, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '..');
const distDir = resolve(projectRoot, 'dist/wasm');
const sourceDir = resolve(projectRoot, 'wasm');

await mkdir(distDir, { recursive: true });
await cp(sourceDir, distDir, { recursive: true });
