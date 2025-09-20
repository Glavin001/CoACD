#!/usr/bin/env bash
set -euo pipefail

# Build native C++ binary for CoACD
# 1. Ensure submodules are present
# 2. Configure and compile in Release mode
# 3. The resulting executable is build/main

git submodule update --init --recursive

mkdir -p build
cd build
cmake .. -DCMAKE_BUILD_TYPE=Release
make main -j"${MAKEFLAGS:-$(nproc)}"

