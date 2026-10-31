// Plan 61 phase 6 (docs/plan/61-the-sway.md): what the sway costs a frame with N people near, on this
// machine's CPU — each in a satchel and a ponytail, posed jogging round a circle, their stand-ins
// and anchors moved, Jolt's step, their bones read back — 60 frames a second for 10 s. The posing
// itself is plan 58's (e2e/anim-cost.mts), not this.
//   npx tsx e2e/sway-cost.mts [people] [steps]
import { DEFAULT_AVATAR } from "@yutopia/shared";
import { loadJolt, PhysicsWorld, sizesFor } from "@yutopia/shared/physics";
import * as C from "@/world/chars";
import { SwayHub } from "@/world/sway/hub";

await C.loadHero();
const N = Number(process.argv[2] ?? 7);
const STEPS = Number(process.argv[3] ?? 1);
const dt = 1 / 60;
const world = await PhysicsWorld.create(loadJolt, sizesFor({ statics: 8, worn: N * 16 }));
world.setLand("land", { x0: -40, z0: -40, n: 161, step: 0.5, h: new Float32Array(161 * 161) });
world.settle();
const f = new C.CharFactory();
const look = { ...DEFAULT_AVATAR, extra: "satchel", hair: "ponytail" };
const people = Array.from({ length: N }, (_, i) => ({
  id: `p${i}`,
  model: new C.PersonModel(f, look, 0),
  loco: new C.Locomotion(),
  a: (i / N) * Math.PI * 2,
}));
for (let k = 0; k < 50 && !people.every((p) => p.model.update()); k++) f.pump(1000);
const hub = new SwayHub(world, () => ({ x: 0, y: 0, z: 0 }));
const times: number[] = [];
for (let fr = 0; fr < 660; fr++) {
  for (const p of people) {
    // (round a 3 m circle at a jog, each a little apart)
    p.a += (4 / 3) * dt;
    const m = p.loco.update(dt, { dist: 4 * dt, speed: 4, ahead: 4, left: 0, turn: 1.3, accel: 0, up: false });
    p.model.root.position.set(Math.cos(p.a) * 3, 0, Math.sin(p.a) * 3);
    p.model.root.rotation.y = -p.a;
    p.model.setPose(m.pose, m.lift);
  }
  const t0 = performance.now();
  hub.pre(
    people.map((p, i) => ({ id: p.id, model: p.model, d: i * 0.5 })),
    dt,
    "p0",
  );
  world.step(dt, STEPS);
  hub.post();
  times.push(performance.now() - t0);
}
const s = times.slice(60).sort((a, b) => a - b);
const mean = s.reduce((a, b) => a + b, 0) / s.length;
console.log(
  JSON.stringify({
    people: N,
    steps: STEPS,
    swinging: people.filter((p) => hub.skipOf(p.id)?.size).length,
    meanMs: +mean.toFixed(3),
    p99Ms: +s[Math.floor(s.length * 0.99)].toFixed(3),
  }),
);
