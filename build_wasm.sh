#!/usr/bin/env bash
set -euo pipefail

git submodule update --init --recursive

mkdir -p build-wasm
cd build-wasm

emcmake cmake .. -DCMAKE_BUILD_TYPE=Release -DWITH_3RD_PARTY_LIBS=OFF
emmake make coacd_wasm -j$(nproc 2>/dev/null || echo 2)

cd ..
mkdir -p ts/wasm
cp build-wasm/coacd-wasm.mjs ts/wasm/
cp build-wasm/coacd-wasm.wasm ts/wasm/

if [[ -f build-wasm/coacd-wasm.d.ts ]]; then
  cp build-wasm/coacd-wasm.d.ts ts/wasm/coacd-wasm.mjs.d.ts
  cp build-wasm/coacd-wasm.d.ts ts/wasm/coacd-wasm.mjs.d.mts
else
  cat <<'EOF' > ts/wasm/coacd-wasm.mjs.d.ts
import type { CoACDEmscriptenModule, ModuleFactory } from '../src/types.js';

declare const createCoACDModule: ModuleFactory;

export default createCoACDModule;
export type { CoACDEmscriptenModule };
EOF

  cp ts/wasm/coacd-wasm.mjs.d.ts ts/wasm/coacd-wasm.mjs.d.mts
fi
