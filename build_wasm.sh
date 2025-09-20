#!/usr/bin/env bash
set -euo pipefail

git submodule update --init --recursive

mkdir -p build-wasm
cd build-wasm

emcmake cmake .. -DCMAKE_BUILD_TYPE=Release -DWITH_3RD_PARTY_LIBS=OFF
emmake make coacd_wasm -j$(nproc 2>/dev/null || echo 2)
