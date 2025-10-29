import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createCoACD } from '../src/index.js';

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error('Usage: node dist/examples/convert.js <input.obj> [output.wrl]');
    process.exitCode = 1;
    return;
  }

  const scriptDir = dirname(fileURLToPath(import.meta.url));
  const repoRoot = resolve(scriptDir, '..', '..', '..');
  const inputPath = resolve(repoRoot, args[0]);
  const outputPath = args[1]
    ? resolve(repoRoot, args[1])
    : resolve(repoRoot, args[0].replace(/\.obj$/i, '.wrl'));

  const objSource = await readFile(inputPath, 'utf8');

  const coacd = await createCoACD();
  const result = await coacd.decomposeFromObj(objSource, {
    // Looser threshold and lower sampling density keep the example fast while exercising the full pipeline.
    threshold: 0.2,
    resolution: 750,
  });

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, result.wrl, 'utf8');
  console.log(`Decomposed ${inputPath} into ${result.parts.length} convex parts.`);
  console.log(`VRML output written to ${outputPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
