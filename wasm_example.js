#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

function main() {
  const [,, input, output] = process.argv;
  if (!input || !output) {
    console.error('Usage: node wasm_example.js <input.obj> <output.wrl>');
    process.exit(1);
  }

  const inputAbs = path.resolve(input);
  const outputAbs = path.resolve(output);

  globalThis.Module = {
    locateFile: (p) => path.join(__dirname, 'build-wasm', p),
    preRun: [function () {
      Module.FS.mkdir('/host');
      Module.FS.mount(Module.NODEFS, { root: '/' }, '/host');
      Module.ENV = {
        HOME: process.env.HOME || process.cwd(),
        PATH: process.env.PATH || '',
        PWD: '/host' + process.cwd(),
        USER: process.env.USER || process.env.USERNAME || 'node'
      };
    }],
    print: (...args) => console.log(...args),
    printErr: (...args) => console.error(...args),
    onRuntimeInitialized() {
      const decompose = Module.cwrap('coacd_decompose', 'number', ['string','string']);
      const rc = decompose('/host' + inputAbs, '/host' + outputAbs);
      console.log('[JS] coacd_decompose returned', rc);
    }
  };

  try {
    require('./build-wasm/coacd.js');
  } catch (err) {
    console.error('Error running module:', err);
    process.exitCode = 1;
  }
}

main();
