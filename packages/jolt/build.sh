#!/bin/sh
# Jolt with a growing heap (docs/plan/72-the-3d-core.md, phase 7): JoltPhysics.js at the release npm
# has as 1.1.1, its own build (the same Jolt C++ revision, Emscripten 6.0.13 as its CI), the one
# variant we load (single-threaded wasm-compat) with ALLOW_MEMORY_GROWTH — the published build's
# heap is a fixed 128 MB. Needs Docker; writes dist/jolt-physics.wasm-compat.js.
set -e
here=$(cd "$(dirname "$0")" && pwd)
work=$(mktemp -d)
git clone --depth 1 --branch 1.1.1 https://github.com/jrouwe/JoltPhysics.js "$work/src"
docker run --rm -v "$work/src":/src -w /src emscripten/emsdk:6.0.13 bash -c \
  "mkdir -p dist && cmake -B Build/Distribution/ST -DCMAKE_BUILD_TYPE=Distribution -DBUILD_WASM_COMPAT_ONLY=ON -DALLOW_MEMORY_GROWTH=ON -DMAXIMUM_MEMORY=2147483648 && cmake --build Build/Distribution/ST -j8"
cp "$work/src/dist/jolt-physics.wasm-compat.js" "$here/dist/"
shasum -a 256 "$here/dist/jolt-physics.wasm-compat.js"
