# jolt-physics (built here)

JoltPhysics.js **1.1.1** — the release npm has — in the one variant the game loads
(`jolt-physics/wasm-compat`: single-threaded, the wasm inlined), built with a **growing heap**
(`ALLOW_MEMORY_GROWTH`, up to 2 GB). The published build's heap is a fixed 128 MB: a world that
outgrew it (the land streamed along the long road, a room per test) was refused
(docs/plan/72-the-3d-core.md, phase 7). Ours starts at 16 MB (`INITIAL_MEMORY`; phase 13's memory
pass: the 128 MB start was ~134 MB of a page's heap with ~14 MB of it in use) and grows as it's wanted
— the same build otherwise, byte for byte but the memory's starting size.

The same Jolt C++ revision and Emscripten 6.0.13 as JoltPhysics.js's own CI; the physics the same
(the bench's determinism hashes: `pnpm physics`). Every `jolt-physics` import in the repo resolves
here (`pnpm-workspace.yaml` overrides).

Rebuild: `./build.sh` (needs Docker). `dist/jolt-physics.wasm-compat.js`:
sha256 `6b316261272a118094a810d61e01ead92c5028915797ef5f57bfcfdbad300068`.
