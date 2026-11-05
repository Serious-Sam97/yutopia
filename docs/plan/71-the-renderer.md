# 71 — The renderer (investigation)

Ask (2026-11-04): "Estou começando a sentir que o threejs está no seu limite, principalmente na
direção mundo aberto, com trilhões de coisas acontecendo. Será que chegamos a um ponto onde uma
mudança de engine/renderer seria benéfica e facilitaria o nosso trabalho futuro? Jolt fica, estou
falando somente do three js."

Status: **investigation done, decision pending (the user's).** No code changed.

## The answer, short

**Not now, and probably not to another engine at all.** What we've hit is not three.js's limit
but two others:

1. **WebGL's** — every draw is a CPU call (~7 µs in Chromium, more in Firefox), shaders link
   synchronously, a readback waits for the GPU. Any engine running on WebGL2 pays the same.
2. **Ours** — the world is drawn as *one three object per thing*, walked by three's scene graph
   every frame, its look built by ~30 chained `onBeforeCompile` patches. That shape, not the
   library, is what each lag round fought.

Switching engines would cost a rewrite of ~100k lines and the whole look, for gains nobody has
shown in a browser open world. The useful move is to **reshape how we draw inside three** so the
world scales, and so a later move to WebGPU (three's own, when it's ready) is a small step
instead of a rewrite.

## What we measured ourselves (the evidence that it's draws, not three)

From `38-the-lag.md`, `69-the-long-road.md` and memory:

| Where | What it was | What fixed it (all within three) |
|---|---|---|
| Indoors, plan 38 | 4,800 draws, 28 ms main thread, 30 fps | culling + merging → 2,138 draws, 14.6 ms, 60 fps |
| Prod office (Firefox) | 8,578 objects walked a frame (~5 ms before any draw), 1,850 draws | floors merged per area → 965 draws, 7.6 ms |
| Two-sided glass | three re-evaluates the program each draw (a third of a frame) | split back/front meshes |
| Quality switch | 30–41 programs linked in one frame: 722–791 ms | compiled ahead, a few a frame → 106–112 ms |
| Furnish thumbnails | `toDataURL` waits on the GPU: 100–217 ms frames | queued a few a frame → 33 ms |
| Long road, plan 69 | land blocks 20–90 ms on the main thread, tree pools re-uploaded 30×/s | workers, upload only changes → median 17 ms, p95 ≤ 33 |
| Weak CPU (÷4) | 20 fps, `tp.frame` dominates | CPU-bound draw submission — not yet fixed |

Every one of these is either a WebGL cost (draw submission, link, readback) or how many objects we
hand the renderer. None is a missing three.js feature. Outdoors is cheap today (142–213 draws,
6–9 ms).

## How deep three goes (audit, 2026-11-04)

- **166 files** import three, all under `apps/client/src/world`: **101k of 165k** world lines
  (61%). Nothing in `packages/shared` (54k lines, all the Jolt code) touches three.
- **No abstraction layer**: `WebGLRenderer` passed directly through 17 files; ~458 `new Mesh`,
  ~850 geometry and ~460 material constructors, 222 `userData`, 67 `renderOrder`.
- **The look is the hard part**: ~30 `onBeforeCompile` hooks in 17 files, chained (`light3d`'s
  baked light map at the bottom, cel / legs / fade / furniture on top, `fog3d` wrapping all through
  `Material.prototype`), **142 GLSL `#include` injections**, 15 `ShaderMaterial`s, an
  `EffectComposer` chain (ink, bloom edited by string replace, finish), and patches to three's
  internals (`shadowMap.render`, `Object3D.prototype.updateMatrixWorld`).
- **Easy to carry anywhere**: Jolt and shared, the workers' typed arrays (except
  `land-block.ts`, which pulls three math in), poses stored as plain Euler data, the ~75
  canvas-drawn textures.

## The alternatives (researched 2026-11-04, versions as of that day)

| | Verdict for us | Why |
|---|---|---|
| **three WebGPURenderer** (r187) | Not yet; the eventual path | Official successor (WebGL renderer gets no big features now). Falls back to WebGL2. But `onBeforeCompile`, `ShaderMaterial` and `EffectComposer` don't run on it — the whole look moves to TSL. And for many-mesh scenes it's **slower** today: 9.7 ms vs 4.5 ms CPU for 4,000 meshes (forum, r183, May 2026), issue #30560 open. Gains (compute, indirect draw, GPU culling) only on the WebGPU backend |
| **Babylon.js 9** (9.33) | The only credible full switch, not worth it | Frame Graph, clustered lights (1,000+), snapshot rendering (replays a frozen frame's draws — good for still scenery, can't add/remove meshes while on). Jolt via a community plugin. Full rewrite + new set of traps |
| **PlayCanvas 2.23** | Second | WebGPU still labelled beta; indirect draw and storage-buffer instancing in 2.23. No open-world evidence. React binding pre-1.0 |
| **Unity 6.6 (web)** | No | Most GPU-driven features on the web (resident drawer, GPU occlusion), but leaves TypeScript, shared code with the server, React HUD; multi-MB wasm; WebGL2 still its default |
| **Godot 4.7 / Bevy 0.20** | No | Godot's web export is WebGL2-only, no C#; Bevy means Rust and a new client. Both embed a canvas in React and bridge everything |

WebGPU itself: ~88% of users (caniuse); Chrome/Edge desktop + Android 12+, Safari 26 (macOS + iOS),
Firefox on Windows (141) and macOS (147). Not Firefox on Linux/Android or Samsung Xclipse phones,
so a WebGL2 path stays mandatory for the Capacitor Android build regardless of engine.

No shipped large open-world browser game on any of these has published numbers we could find.

**And one factor specific to how we work:** three.js is the library with by far the most code,
docs and examples behind it; every trap we've hit is written down (memory notes on shadows,
layers, two-sided glass, readback). A new engine resets that to zero.

## What would change the verdict

Switch (most likely to three's WebGPU, Babylon only if three's per-object cost stays bad) when we
need something WebGL can't give:

- GPU-driven culling/LOD of **100k+ distinct moving things** (crowds of people, traffic at scale);
- **compute** for foliage, particles, snow/water simulation on the GPU;
- **hundreds of dynamic lights** (a whole lit city at night);
- and three's WebGPURenderer measures **faster than WebGLRenderer on our own bench** (below).

## Proposed plan (if the user wants it): make the world renderer-ready inside three

Each phase pays off on its own, today, on WebGL — and each shrinks a future port.

**Phase 0 — the bench.** One fixed scene set as a script (like `e2e/stream-soak.mts`): the long road
at speed, the prod office floor 4, the town at night in rain, a crowd of 50 people. Reports draws,
programs, CPU ms, p95, on Chromium and Firefox. This is the yardstick for every phase and the
WebGPU tripwire: re-run it on WebGPURenderer each three release.

**Phase 1 — one material family.** Fold the ~30 chained `onBeforeCompile` patches and 142
injections into a small set of our own materials (`YuLit`: light map, cel, fade, fog, legs,
facets as defines/uniforms), owned in one folder. Fewer distinct programs (fewer link stalls,
better batching), one place for the look, and later a single file to write in TSL. Pixel-identical
stills as the gate (the plan 38 rule).

**Phase 2 — draw lists, not objects.** Still scenery and furniture as `BatchedMesh` /
`InstancedMesh` per material per chunk, with our own culling over flat arrays (box per entry,
chunk-level frustum + distance), instead of thousands of `Object3D` walked each frame. The goal:
draws and scene-walk cost proportional to *materials × chunks in view*, not *things in the world*.
This is the change that makes "trillions of things" possible on any renderer.

**Phase 3 — the post chain as our own passes.** Ink, bloom, finish as plain full-screen passes
we own (no `EffectComposer`, no string edits to three's bloom). Maps 1:1 onto three's
`RenderPipeline` or any engine's frame graph later.

**Phase 4 — a thin seam.** Keep three types out of non-render code (the 18 math-only files,
`land-block.ts` in the worker, the rig as plain data with `Bone`s only at the edge). Not an
abstraction over three — just a clean edge.

**Phase 5 (gated) — WebGPU.** Only when phase 0's bench says three's WebGPURenderer wins: port the
material family to TSL and the passes to `RenderPipeline`, WebGL2 fallback kept, behind a setting.
Then compute and indirect draw become available for what comes next.

Phases 1–2 are the big ones (weeks, touching most of `tp/` and `furn/`); 0 and 4 are small.
