#!/bin/sh
# Jolt with a growing heap (docs/plan/72-the-3d-core.md, phase 7): JoltPhysics.js at the release npm
# has as 1.1.1, its own build (the same Jolt C++ revision, Emscripten 6.0.13 as its CI), the one
# variant we load (single-threaded wasm-compat) with ALLOW_MEMORY_GROWTH — the published build's
# heap is a fixed 128 MB. Its heap starts at 16 MB (INITIAL_MEMORY; the release's 128 MB was most of a
# page's memory with ~14 MB of it in use — plan 72 phase 13's memory pass) and grows as it's wanted.
# Needs Docker; writes dist/jolt-physics.wasm-compat.js. JOBS=n: build jobs (8).
set -e
here=$(cd "$(dirname "$0")" && pwd)
work=$(mktemp -d)
git clone --depth 1 --branch 1.1.1 https://github.com/jrouwe/JoltPhysics.js "$work/src"
docker run --rm -v "$work/src":/src -w /src emscripten/emsdk:6.0.13 bash -c \
  "mkdir -p dist && cmake -B Build/Distribution/ST -DCMAKE_BUILD_TYPE=Distribution -DBUILD_WASM_COMPAT_ONLY=ON -DALLOW_MEMORY_GROWTH=ON -DINITIAL_MEMORY=16777216 -DMAXIMUM_MEMORY=2147483648 && cmake --build Build/Distribution/ST -j${JOBS:-8}"
cp "$work/src/dist/jolt-physics.wasm-compat.js" "$here/dist/"
shasum -a 256 "$here/dist/jolt-physics.wasm-compat.js"
