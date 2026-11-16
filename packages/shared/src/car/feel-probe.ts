// The handling in numbers (docs/plan/93 phase 0, A.1): scripted drives of a car on the bench — ordinary turns,
// a lift mid-turn, a lane change — on dry asphalt and on packed snow. Each one's front and rear tyres' slip
// angle, the body's slip, how much of the yaw the arcade layer put in (its angular impulse against the yaw the
// car reached), the rear's grip cut, the yaw's overshoot.
//   tsx src/car/feel-probe.ts [SPEC=SEDAN] [FEEL=92]   (SET='{"turnIn":2}' to try a number)
import { ASSIST } from "./assist.ts";
import { FEEL } from "./drive.ts";
import { HATCH, OFFROAD, SEDAN, setEngine, VAN } from "./index.ts";
import { JoltCarWorld } from "./jolt-world.ts";
import type { Controls } from "./state.ts";
import { flatWorld } from "./world.ts";

const set = process.env.SET ? JSON.parse(process.env.SET) : {};
for (const [k, v] of Object.entries(set)) ((k in ASSIST ? ASSIST : FEEL) as Record<string, unknown>)[k] = v;
const SPEC = ({ SEDAN, HATCH, VAN, OFFROAD } as const)[(process.env.SPEC ?? "SEDAN") as "SEDAN"];
const D = 57.2958;

type Script = (t: number) => Partial<Controls>;
const CASES: { name: string; kmh: number; secs: number; c: Script }[] = [
  { name: "turn 30", kmh: 30, secs: 3, c: () => ({ up: 0.3, steer: 0.7 }) },
  { name: "turn 60", kmh: 60, secs: 3, c: () => ({ up: 0.45, steer: 0.5 }) },
  { name: "lift 60", kmh: 60, secs: 3, c: (t) => ({ up: t < 1.2 ? 0.6 : 0, steer: 0.5 }) },
  { name: "lane 90", kmh: 90, secs: 3, c: (t) => ({ up: 0.5, steer: t < 0.5 ? 0.4 : t < 1.0 ? -0.4 : 0 }) },
];

async function run(ground: "asphalt" | "path", c: (typeof CASES)[number]) {
  const w = await JoltCarWorld.create(flatWorld(ground));
  const d = w.add(SPEC, 0, 0, 0);
  setEngine(d.s, true);
  const s = d.s;
  const ctl = (x: Partial<Controls>): Controls => ({ up: 0, down: 0, steer: 0, hand: 0, digital: true, ...x });
  // up to speed, straight, then a moment held there
  w.run(
    (st) => ctl({ up: Math.hypot(st.v.x, st.v.z) * 3.6 < c.kmh ? 1 : 0.25 }),
    25,
    undefined,
    (st) => Math.hypot(st.v.x, st.v.z) * 3.6 >= c.kmh,
  );
  w.run(ctl({ up: 0.3 }), 0.5);
  const st = (d as unknown as { as: { rear: number }; ao: { t: number[]; beta: number } }).as;
  const ao = (d as unknown as { ao: { t: number[]; beta: number } }).ao;
  const Iy = SPEC.inertia[1];
  let aF = 0,
    aR = 0,
    beta = 0,
    imp = 0,
    wPeak = 0,
    rearMin = 1,
    wEnd = 0,
    lat = 0;
  const n = Math.round(c.secs * 60);
  for (let i = 0; i < n; i++) {
    const t = i / 60;
    w.step(ctl(c.c(t)), 1 / 60);
    aF = Math.max(aF, Math.abs(s.wheels[0].alpha), Math.abs(s.wheels[1].alpha));
    aR = Math.max(aR, Math.abs(s.wheels[2].alpha), Math.abs(s.wheels[3].alpha));
    beta = Math.max(beta, Math.abs(ao.beta));
    imp += Math.abs(ao.t[1]) / 60;
    wPeak = Math.max(wPeak, Math.abs(s.w.y));
    rearMin = Math.min(rearMin, st.rear);
    // (the lateral g: speed × yaw rate)
    lat = Math.max(lat, (Math.hypot(s.v.x, s.v.z) * Math.abs(s.w.y)) / 9.81);
    if (c.name.startsWith("turn") && t > c.secs - 0.5) wEnd = Math.abs(s.w.y);
  }
  w.dispose();
  return {
    case: c.name,
    ground,
    "αF°": +(aF * D).toFixed(1),
    "αR°": +(aR * D).toFixed(1),
    "β°": +(beta * D).toFixed(1),
    "assist yaw share": +(imp / Math.max(1e-3, Iy * wPeak)).toFixed(2),
    "lat g": +lat.toFixed(2),
    "rear grip min": +rearMin.toFixed(2),
    overshoot: wEnd ? +(wPeak / wEnd).toFixed(2) : undefined,
  };
}

const rows = [];
for (const g of ["asphalt", "path"] as const) for (const c of CASES) rows.push(await run(g, c));
console.table(rows);
