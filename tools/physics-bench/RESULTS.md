# Physics engines for Yutopia — Rapier vs Jolt (measured 2026-10-27)

The bench that chose the physics engine for docs/plan/50-the-volume.md. **Jolt was chosen**
(the user's call, 2026-10-27). This folder keeps the Jolt side so it can be run again, and in CI
as the determinism check; Rapier's adapter isn't kept, its numbers are below.

Versions: `@dimforge/rapier3d-compat` 0.21.0, `jolt-physics` 1.1.1 (JoltPhysics.js, the
wasm-compat build). Machine: Apple Silicon (arm64), Node 24.21; Chrome 1243 (Playwright);
x86-64 Node 24 in Docker (`node:24-alpine`, emulated: its times are slow, its results aren't).

## The scenes (gen-scene.ts)

The real Grounds from `shared/grounds.ts`: the land's height every metre, and every tile you
can't walk as a box 2.5 m over the ground (merged along rows).
- **area**: 256 × 256 m round the HQ and the car park — 884 boxes.
- **full**: the whole Grounds, 1024 × 1168 m — 162,465 boxes (the woods).
- **chunk32**: the boxes as one compound shape per 32 × 32 m (what a real build does).

## The players (bench.mjs)

A capsule 1.8 m (r 0.3), steps to 0.35 m, slopes to 45°, snapped to the ground walking. Inputs
are a pure function of (player, time), exact arithmetic: walking, jogging, sprinting, jumping;
one in five flying. 60 Hz. Both engines covered the same ground (~37 m mean, on the ground ~80%
of the time, the same fliers up) — the same work.

## Round 1 — speed (Node, ms per tick, mean)

| Scene | Players | Rapier | Jolt |
|---|---|---|---|
| area, one box each | 50 | 1.59 | 0.18 |
| area, one box each | 200 | 5.75 | 0.65 |
| full, one box each | 50 | **22.3** | 0.28 |
| full, one box each | 200 | **28.7** | 1.12 |
| area, chunk32 | 50 | 1.48 | 0.18 |
| full, chunk32 | 200 | 8.35 | 1.18 |

Rapier's step grows with the number of colliders (21 ms of a 22 ms tick on the full Grounds,
one box each); chunked, it's fine. Jolt's doesn't.

## Round 2

**Behaviour** (round2.mjs `behaviour`) — both 8 / 8, within a few cm of each other: a 0.30 m step
climbed, 0.50 m stopped; a 40° ramp walked up (2.43 m in 4 s), 55° not; a 1.2 m fence stops a
walker and lets a flier at 2 m over; a ceiling at 3 m stops a flier's head (feet 1.16–1.18);
walking into a wall at 45° slides along it. **Rapier's autostep fails under a hard push down**
(−1 m/s on the ground): it needs a light one (−0.1) — Jolt steps either way.

**Speed, re-run with the light push** (Node, chunk32, ms per tick: mean / p95):

| Scene | Players | Rapier | Jolt | |
|---|---|---|---|---|
| area | 50 | 1.35 / 1.80 | 0.18 / 0.25 | 7.5× |
| area | 200 | 5.09 / 6.70 | 0.67 / 0.88 | 7.6× |
| full | 50 | 1.87 / 2.71 | 0.33 / 0.43 | 5.7× |
| full | 200 | 7.10 / 8.70 | 1.29 / 1.59 | 5.5× |

Per player: Rapier 25–37 µs, Jolt 3.3–6.5 µs. Chrome: within ~10% of Node for both.

**Queries** (10,000 each on the real Grounds): a ray — Rapier 1.0–2.1 µs, Jolt 1.9–3.4 µs (the JS
glue makes and frees objects per call); a sphere overlap — both 3–7 µs.

**Things falling** (300 balls r 0.15 + 100 crates, dropped 3–8 m, 20 s): both 0.5–0.8 ms a tick.
With the defaults **Jolt lost 81 of 400 through the land** (area; 32 on the full Grounds),
Rapier 5 and 0. With continuous collision on (Jolt `EMotionQuality_LinearCast`, Rapier CCD):
Jolt 3 and 0, Rapier 5 and 0 (Rapier's unchanged: not tunnelling — likely spawned in a box).

**A long session** (50 players, two leaving and two joining every second, 10 and 20 simulated
minutes, 2,400 joins; GC forced before each reading): no leak in either — Jolt's heap flat,
Rapier's process lost ~210 MB once its start-up garbage went.

**Jolt aborted the process** ("TempAllocator: Out of memory") with `mMaxBodies` 400,000 (what the
unchunked full scene needed) once things were falling; with 20,000 / 16,384 pairs it's fine. The
JS build doesn't expose the temp allocator's size.

**Determinism** — every run's final positions hashed (FNV-1a over the float32s): identical,
for both engines, on Node arm64 (twice), Chrome and Node x86-64, for the players (area 50:
Rapier `566570ef`, Jolt `68ea128e`) and for the falling things (area+ccd: Rapier `dd3a27a7`,
Jolt `d430410a`; full+ccd: Rapier `36e1ed22`, Jolt `a54956d2`). Not tried: Firefox (Playwright's
won't start on this macOS), Safari.

**Download** (the production builds: the `.wasm` and its JS):

| | raw | gzip | brotli |
|---|---|---|---|
| Rapier 0.21 | 3,341 KB | 1,182 KB | 858 KB |
| Jolt 1.1.1 | 2,924 KB | 870 KB | 592 KB |

Start-up: the module 13–45 ms in both; building the area 7 ms (Jolt) / 30 ms (Rapier), the full
Grounds chunked ~150–190 ms in both.

## Running it

A workspace package (`@yutopia/physics-bench`: `jolt-physics` pinned at 1.1.1, `esbuild`). From the
repo's root, `pnpm physics` is CI's check (`check.mjs`, the `physics` job, x86-64): the 8 behaviour
checks, the three hashes above, and 20 simulated minutes with Jolt's heap flat — it makes the scenes
first if they're missing. Each runner by hand, in this folder:

```sh
npx tsx gen-scene.ts                         # area.json, full.json
node node-run.mjs jolt area 50 60 32         # the players (hash 68ea128e)
node node-round2.mjs jolt behaviour          # the 8 behaviour checks
node node-round2.mjs jolt dynamics area ccd  # things falling
node node-round2.mjs jolt queries full
MINUTES=10 node --expose-gc node-round2.mjs jolt longrun area
pnpm browser && node serve.mjs               # the browser bundle and its page (drive2.mjs drives Chrome)
```
Jolt moves only with this bench: a new version means new hashes recorded here and in `check.mjs`.
