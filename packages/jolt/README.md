# jolt-physics (built here)

JoltPhysics.js **1.1.1** — the release npm has — in the one variant the game loads
(`jolt-physics/wasm-compat`: single-threaded, the wasm inlined), built with a **growing heap**
(`ALLOW_MEMORY_GROWTH`, up to 2 GB; it starts at 128 MB as before). The published build's heap is a
fixed 128 MB: a world that outgrew it (the land streamed along the long road, a room per test)
was refused (docs/plan/72-the-3d-core.md, phase 7).

The same Jolt C++ revision and Emscripten 6.0.13 as JoltPhysics.js's own CI; the physics the same
(the bench's determinism hashes: `pnpm physics`). Every `jolt-physics` import in the repo resolves
here (`pnpm-workspace.yaml` overrides).

Rebuild: `./build.sh` (needs Docker). `dist/jolt-physics.wasm-compat.js`:
sha256 `2768df1e744327dcc5e7f50a9105aa8a48dde157196328683883df8eafc92060`.
