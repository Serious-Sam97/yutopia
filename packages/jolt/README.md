# jolt-physics (built here)

JoltPhysics.js **1.1.1** — the release npm has — **in double precision** (`DOUBLE_PRECISION=ON`: positions in
doubles, a body 1,000 km out as smooth as one in town — docs/plan/91-the-big-map.md phase 7), in the one variant the game loads
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
sha256 `7b237ea24c591dec44c201651474cedf4175a098bf5ccfe69c7c786a89b2d385` (double; the single-precision build
before plan 91 was `6b316261272a118094a810d61e01ead92c5028915797ef5f57bfcfdbad300068`).
