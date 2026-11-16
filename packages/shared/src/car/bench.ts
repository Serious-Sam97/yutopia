// The car on Jolt for the physics bench (tools/physics-bench check.mjs, docs/plan/92 phase 1): a
// scripted drive on the test pad — its end state hashed (Jolt's determinism: the same each run), the
// cost of a frame; and 200 cars made and dropped (the heap flat: plan 50 guardrail 3).
//   tsx src/car/bench.ts
import { readout, SEDAN, setEngine } from "./index.ts";
import { JoltCarWorld } from "./jolt-world.ts";
import { padWorld } from "./world.ts";

const w = await JoltCarWorld.create(padWorld());
const d = w.add(SEDAN, 0, 250, -Math.PI / 2);
setEngine(d.s, true);
const t0 = performance.now();
const N = 60 * 60;
for (let i = 0; i < N; i++)
  w.step({
    up: 0.6 + 0.4 * Math.sin(i / 97),
    down: i % 600 > 560 ? 1 : 0,
    steer: Math.sin(i / 70) * 0.8,
    hand: i % 900 < 30 ? 1 : 0,
    digital: true,
  });
const ms = (performance.now() - t0) / N;
const s = d.s;
const hash = (() => {
  const f = new Float64Array([s.p.x, s.p.y, s.p.z, s.q.x, s.q.y, s.q.z, s.q.w, s.v.x, s.v.z, s.rpm]);
  let h = 2166136261;
  for (const b of new Uint8Array(f.buffer)) h = Math.imul(h ^ b, 16777619) >>> 0;
  return h.toString(16).padStart(8, "0");
})();
// made and dropped: the heap where it was
const world = w.world;
let before = world.counts().heap;
const M = Number(process.env.CARS ?? 400);
for (let i = 0; i < M; i++) {
  // (the first fifty: the allocator's own high water, not a leak)
  if (i === 50) before = world.counts().heap;
  const extra = w.add(SEDAN, 40 + (i % 5) * 6, 0, 0);
  w.step({ up: 0, down: 0, steer: 0, hand: 0, digital: true });
  world.removeCar(extra.car);
  w.drives.pop();
}
const heapGrowthMB = (world.counts().heap - before) / 1024 / 1024;
console.log(
  JSON.stringify({
    hash,
    msPerFrame: Number(ms.toFixed(4)),
    kmh: Number(readout(s).kmh.toFixed(1)),
    heapGrowthMB: Number(heapGrowthMB.toFixed(3)),
  }),
);
w.dispose();
