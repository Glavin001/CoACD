# CoACD WebAssembly artefacts

This directory is populated by `./build_wasm.sh`, which compiles the CoACD C++
bindings to WebAssembly via Emscripten. The resulting `.mjs`, `.wasm`, and
TypeScript declaration files are copied here as build outputs and are excluded
from version control.

Run `./build_wasm.sh` before `npm --prefix ts run build` to ensure the latest
artifacts are available for packaging. The build will recreate this folder as
needed.
