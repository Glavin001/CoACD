#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const repoRoot = __dirname;
const examplesDir = path.join(repoRoot, 'examples');
const wasmOutDir = path.join(repoRoot, 'build-wasm', 'wasm-outputs');
const nativeOutDir = path.join(repoRoot, 'build-wasm', 'native-outputs');
const wasmWrapper = path.join(repoRoot, 'wasm_example.js');
const nativeBinary = process.env.COACD_NATIVE_BIN ||
  path.join(repoRoot, 'build-no3rd', 'main');
const wasmBundle = path.join(repoRoot, 'build-wasm', 'coacd.js');

const REQUIRED_SEED = 1234;
const DEFAULT_THRESHOLD = 0.05;
const DEFAULT_PREPROCESS = 'off';

const exampleConfigs = {
  'SnowFlake': { threshold: 0.02, preprocessMode: 'off' },
  'Octocat-v2': { threshold: 0.05, preprocessMode: 'off' },
  'KitchenPot': { threshold: 0.05, preprocessMode: 'off' },
  'Kettle': { threshold: 0.05, preprocessMode: 'off' },
  'Bottle': { threshold: 0.05, preprocessMode: 'off' }
};

function ensureExists(filePath, description) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing ${description}: ${filePath}`);
  }
}

function runCommand(command, args, options = {}) {
  const pretty = `${command} ${args.join(' ')}`.trim();
  console.log(`[verify] $ ${pretty}`);
  const result = spawnSync(command, args, { stdio: 'inherit', ...options });
  if (result.error) {
    throw result.error;
  }
  if (typeof result.status === 'number' && result.status !== 0) {
    throw new Error(`Command failed (${result.status}): ${pretty}`);
  }
}

function hashFile(filePath) {
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(filePath));
  return hash.digest('hex');
}

function compareFiles(label, wasmPath, nativePath, mismatches, missing) {
  const missingPaths = [];
  if (!fs.existsSync(wasmPath)) missingPaths.push(wasmPath);
  if (!fs.existsSync(nativePath)) missingPaths.push(nativePath);
  if (missingPaths.length > 0) {
    missing.push({ label, paths: missingPaths });
    return;
  }

  const wasmHash = hashFile(wasmPath);
  const nativeHash = hashFile(nativePath);
  if (wasmHash !== nativeHash) {
    mismatches.push({ label, wasmPath, nativePath, wasmHash, nativeHash });
  }
}

function main() {
  ensureExists(
    nativeBinary,
    'native executable built with WITH_3RD_PARTY_LIBS=OFF (e.g. cmake -S . -B build-no3rd -DWITH_3RD_PARTY_LIBS=OFF)'
  );
  ensureExists(wasmBundle, 'WebAssembly bundle (run ./build_wasm.sh)');
  ensureExists(wasmWrapper, 'wasm_example.js script');

  fs.rmSync(wasmOutDir, { recursive: true, force: true });
  fs.rmSync(nativeOutDir, { recursive: true, force: true });
  fs.mkdirSync(wasmOutDir, { recursive: true });
  fs.mkdirSync(nativeOutDir, { recursive: true });

  const exampleFiles = fs
    .readdirSync(examplesDir)
    .filter((name) => name.toLowerCase().endsWith('.obj'))
    .sort();

  if (exampleFiles.length === 0) {
    throw new Error(`No example OBJ files found in ${examplesDir}`);
  }

  const mismatches = [];
  const missingOutputs = [];

  for (const objName of exampleFiles) {
    const base = path.parse(objName).name;
    const inputPath = path.join(examplesDir, objName);
    const wasmWrl = path.join(wasmOutDir, `${base}.wrl`);
    const nativeWrl = path.join(nativeOutDir, `${base}.wrl`);

    const config = exampleConfigs[base] || {};
    const threshold = config.threshold ?? DEFAULT_THRESHOLD;
    const preprocessMode = config.preprocessMode ?? DEFAULT_PREPROCESS;

    const wasmArgs = [
      wasmWrapper,
      inputPath,
      wasmWrl,
      '-t',
      threshold.toString(),
      '-pm',
      preprocessMode,
      '-s',
      REQUIRED_SEED.toString()
    ];

    runCommand(process.execPath, wasmArgs, { cwd: repoRoot });

    const nativeArgs = [
      '-i', inputPath,
      '-o', nativeWrl,
      '-t', threshold.toString(),
      '-pm', preprocessMode,
      '-s', REQUIRED_SEED.toString()
    ];

    runCommand(nativeBinary, nativeArgs, { cwd: repoRoot });

    const wasmObj = wasmWrl.replace(/\.wrl$/i, '.obj');
    const nativeObj = nativeWrl.replace(/\.wrl$/i, '.obj');

    compareFiles(`${base} (.wrl)`, wasmWrl, nativeWrl, mismatches, missingOutputs);
    compareFiles(`${base} (.obj)`, wasmObj, nativeObj, mismatches, missingOutputs);
  }

  if (missingOutputs.length > 0 || mismatches.length > 0) {
    if (missingOutputs.length > 0) {
      console.error('\nMissing outputs:');
      for (const entry of missingOutputs) {
        console.error(`  ${entry.label}`);
        entry.paths.forEach((p) => console.error(`    ${p}`));
      }
    }

    if (mismatches.length > 0) {
      console.error('\nMismatched outputs:');
      for (const entry of mismatches) {
        console.error(`  ${entry.label}`);
        console.error(`    WASM  (${entry.wasmHash}): ${entry.wasmPath}`);
        console.error(`    Native(${entry.nativeHash}): ${entry.nativePath}`);
      }
    }

    process.exitCode = 1;
    return;
  }

  console.log('\nAll example conversions matched between WASM and native outputs.');
}

try {
  main();
} catch (err) {
  console.error('[verify] Failed:', err.message);
  process.exitCode = 1;
}
