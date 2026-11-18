// A bicycle tried on a flat world (docs/plan/101 phase 2): how it goes, turns, stops, hops — numbers printed.
//   tsx src/bike/probe.ts [kind] [ground]

import type { Ground } from "../car/grip.ts";
import { JoltCarWorld } from "../car/jolt-world.ts";
import { flatWorld } from "../car/world.ts";
import type { BikeDrive } from "./drive.ts";
import { BIKE_SPECS, type BikeKind } from "./specs.ts";

const kind = (process.argv[2] ?? "bike_town") as BikeKind;
const ground = (process.argv[3] ?? "asphalt") as Ground;
const w = await JoltCarWorld.create(flatWorld(ground));
const d = w.addBike(BIKE_SPECS[kind], 0, 0, 0) as BikeDrive;
const s = d.s;
const deg = (r: number) => ((r * 180) / Math.PI).toFixed(1);
const show = (t: number, what: string) => {
  const k = d.bk;
  const vf = Math.hypot(s.v.x, s.v.z);
  console.log(
    `${t.toFixed(2).padStart(5)} ${what.padEnd(9)} v ${(vf * 3.6).toFixed(1).padStart(5)} km/h  y ${s.p.y.toFixed(2)}  roll ${deg(k.roll).padStart(6)}  pitch ${deg(k.pitch).padStart(6)}  steer ${deg(s.str).padStart(5)}  cad ${k.cadence.toFixed(0).padStart(3)} g${k.gear} stand ${k.stand.toFixed(1)} air ${k.air.toFixed(2)} ${k.fell ? `FELL ${k.fell.why}` : ""} ${k.trick ?? ""}`,
  );
};
type C = Parameters<BikeDrive["pre"]>[0];
const run = (what: string, c: C, secs: number, every = 0.5) => {
  const n = Math.round(secs * 60);
  for (let i = 0; i < n; i++) {
    w.step(c);
    if ((i + 1) % Math.round(every * 60) === 0) show(s.t, what);
    if (d.bk.fell) break;
  }
};
const idle: C = { up: 0, down: 0, steer: 0, hand: 0, digital: true };
const mode = process.argv[4] ?? "all";
run("still", idle, 1);
if (mode === "all" || mode === "go") {
  run("pedal", { ...idle, up: 1 }, 6, 1);
  run("sprint", { ...idle, up: 1, sprint: true }, 6, 1);
  run("coast", idle, 2, 1);
  run("right", { ...idle, up: 1, steer: 1 }, 3, 0.5);
  run("left", { ...idle, up: 1, steer: -1 }, 3, 0.5);
  run("straight", { ...idle, up: 1 }, 2, 1);
  run("brake", { ...idle, down: 1 }, 3, 0.25);
  run("stopped", idle, 1, 0.5);
}
if (mode === "all" || mode === "hop") {
  run("pedal", { ...idle, up: 1 }, 4, 2);
  run("charge", { ...idle, up: 1, hop: true }, 0.5, 0.25);
  run("hop", { ...idle, up: 1 }, 1.5, 0.1);
  run("wheelie", { ...idle, up: 1, lean: 1 }, 3, 0.25);
  run("level", { ...idle, up: 1 }, 1.5, 0.25);
}
w.dispose();
