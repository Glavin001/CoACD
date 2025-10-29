#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const USAGE = `Usage: node wasm_example.js <input.obj> <output.wrl> [options]
Options:
  -t, --threshold <value>        Set the concavity threshold (0.01-1).
  -pm, --preprocess-mode <mode>  Override preprocess mode (auto|on|off).
  -s, --seed <value>             Fixed random seed for deterministic runs.
  -np, --no-preprocess           Shortcut for --preprocess-mode off.
  -h, --help                     Show this message.`;

function printUsage() {
  console.error(USAGE);
}

function parseArgs(argv) {
  const positional = [];
  const options = {};

  const requireValue = (i, flag) => {
    if (i + 1 >= argv.length) {
      throw new Error(`Missing value for ${flag}`);
    }
    return argv[i + 1];
  };

  for (let i = 0; i < argv.length; ++i) {
    const arg = argv[i];
    if (arg === '--') {
      positional.push(...argv.slice(i + 1));
      break;
    }
    switch (arg) {
      case '--help':
      case '-h':
        options.help = true;
        break;
      case '--threshold':
      case '-t': {
        const value = requireValue(i, arg);
        const parsed = Number(value);
        if (!Number.isFinite(parsed)) {
          throw new Error(`Invalid threshold value: ${value}`);
        }
        options.threshold = parsed;
        i += 1;
        break;
      }
      case '--preprocess-mode':
      case '-pm': {
        const value = requireValue(i, arg);
        options.preprocessMode = value;
        i += 1;
        break;
      }
      case '--seed':
      case '-s': {
        const value = requireValue(i, arg);
        const parsed = Number.parseInt(value, 10);
        if (!Number.isFinite(parsed)) {
          throw new Error(`Invalid seed value: ${value}`);
        }
        options.seed = parsed;
        i += 1;
        break;
      }
      case '--no-preprocess':
      case '-np':
        options.preprocessMode = 'off';
        break;
      default:
        if (arg.startsWith('-')) {
          throw new Error(`Unknown option: ${arg}`);
        }
        positional.push(arg);
        break;
    }
  }

  return { positional, options };
}

async function main() {
  let parsed;
  try {
    parsed = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(err.message);
    printUsage();
    process.exit(1);
  }

  if (parsed.options.help) {
    printUsage();
    return;
  }

  const [input, output, ...rest] = parsed.positional;
  if (!input || !output || rest.length > 0) {
    printUsage();
    process.exit(1);
  }

  const inputAbs = path.resolve(input);
  const outputAbs = path.resolve(output);

  const createModule = require('./build-wasm/coacd.js');

  try {
    const Module = await createModule({
      locateFile: (p) => path.join(__dirname, 'build-wasm', p),
      print: (...args) => console.log(...args),
      printErr: (...args) => console.error(...args)
    });

    const mountPoint = '/host';
    if (!Module.FS.analyzePath(mountPoint).exists) {
      Module.FS.mkdir(mountPoint);
    }
    Module.FS.mount(Module.NODEFS, { root: '/' }, mountPoint);

    const wrap = (name, returnType, argTypes) => Module.cwrap(name, returnType, argTypes);
    const resetParams = wrap('coacd_reset_params', null, []);
    const setThreshold = wrap('coacd_set_threshold', null, ['number']);
    const setPreprocessMode = wrap('coacd_set_preprocess_mode', null, ['string']);
    const setSeed = wrap('coacd_set_seed', null, ['number']);
    const decompose = wrap('coacd_decompose', 'number', ['string', 'string']);

    resetParams();
    if (typeof parsed.options.threshold === 'number') {
      setThreshold(parsed.options.threshold);
    }
    if (typeof parsed.options.seed === 'number') {
      setSeed(parsed.options.seed >>> 0);
    }
    if (parsed.options.preprocessMode) {
      setPreprocessMode(parsed.options.preprocessMode);
    }

    const rc = decompose(mountPoint + inputAbs, mountPoint + outputAbs);
    console.log('[JS] coacd_decompose returned', rc);
    if (rc !== 0) {
      process.exitCode = 1;
      return;
    }

    const objName = outputAbs.replace(/\.wrl$/i, '.obj');
    if (fs.existsSync(outputAbs)) {
      const stats = fs.statSync(outputAbs);
      console.log(`[JS] Wrote ${outputAbs} (${stats.size} bytes)`);
    }
    if (fs.existsSync(objName)) {
      const stats = fs.statSync(objName);
      console.log(`[JS] Wrote ${objName} (${stats.size} bytes)`);
    }
  } catch (err) {
    console.error('Error initialising CoACD WASM module:', err);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error('Unexpected error:', err);
  process.exitCode = 1;
});
