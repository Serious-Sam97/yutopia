// A car's world on Jolt for the tests and the /dev/car bench (docs/plan/92-the-cars.md, phase 1):
// a CarWorld (heights, grounds, solids) made a Jolt world — its land in 32 m chunks round the car as
// it goes, its solids (posts, walls, trunks) as statics — with a car on it, stepped as the game
// steps its own (two collision steps a frame). Not for the game: the browser's world is its own
// (tp/physics3d.ts). Not in the car's index: it brings Jolt with it.

import { loadJolt } from "../physics/load.ts";
import { PhysicsWorld, sizesFor } from "../physics/world.ts";
import type { Solid3 } from "../shapes/index.ts";
import { Drive, defOf } from "./drive.ts";
import type { CarSpec } from "./specs.ts";
import {
  type CarState,
  type CarWorld,
  type Controls,
  createCar,
  HELPS,
  type Helps,
  type Solid,
  settle,
} from "./state.ts";

const CHUNK = 32;
const STEP = 0.5;
const RING = 3;

export class JoltCarWorld {
  private readonly built = new Set<string>();
  private readonly solidsBuilt = new Set<string>();
  readonly drives: Drive[] = [];

  private constructor(
    readonly world: PhysicsWorld,
    readonly cw: CarWorld,
  ) {}

  static async create(cw: CarWorld): Promise<JoltCarWorld> {
    const world = await PhysicsWorld.create(loadJolt, sizesFor({ statics: 600, things: 16, vehicles: 16 }), () => {});
    return new JoltCarWorld(world, cw);
  }

  /** The land (and what stands on it) round (x, z). */
  around(x: number, z: number, ring = RING): void {
    const cx = Math.floor(x / CHUNK);
    const cz = Math.floor(z / CHUNK);
    let made = false;
    for (let dz = -ring; dz <= ring; dz++)
      for (let dx = -ring; dx <= ring; dx++) made = this.chunk(cx + dx, cz + dz) || made;
    if (made) this.world.settle();
  }
  private chunk(cx: number, cz: number): boolean {
    const k = `${cx},${cz}`;
    if (this.built.has(k)) return false;
    this.built.add(k);
    const n = CHUNK / STEP + 1;
    const h = new Float32Array(n * n);
    const x0 = cx * CHUNK;
    const z0 = cz * CHUNK;
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) h[j * n + i] = this.cw.height(x0 + i * STEP, z0 + j * STEP);
    this.world.setLand(`land:${k}`, { x0, z0, n, step: STEP, h });
    // its solids: the hard ones (soft ones — people, banks — are the drive's own)
    const out: Solid[] = [];
    this.cw.solids(x0 + CHUNK / 2, z0 + CHUNK / 2, CHUNK / 2, out);
    const s3: Solid3[] = [];
    for (const o of out) {
      if (o.soft || o.vx || o.vz || o.shove) continue;
      const key = `${o.kind}:${o.x.toFixed(2)},${o.z.toFixed(2)}`;
      if (this.solidsBuilt.has(key)) continue;
      if (Math.floor(o.x / CHUNK) !== cx || Math.floor(o.z / CHUNK) !== cz) continue;
      this.solidsBuilt.add(key);
      const y = this.cw.height(o.x, o.z);
      if (o.kind === "circle") s3.push({ t: "cyl", x: o.x, z: o.z, r: o.r ?? 0.2, y0: y - 1, y1: y + 4 });
      else s3.push({ t: "box", x: o.x, y: y + 1, z: o.z, hx: o.hx ?? 0.5, hy: 2.5, hz: o.hz ?? 0.5, a: -(o.a ?? 0) });
    }
    if (s3.length) this.world.setStatic(`solids:${k}`, s3, "wall");
    return true;
  }

  /** A car of `spec` at (x, z) heading a, on its wheels. */
  add(spec: CarSpec, x: number, z: number, a = 0): Drive {
    this.around(x, z);
    const s = createCar(spec, x, this.cw.height(x, z), z, a);
    settle(s, this.cw);
    const car = this.world.addCar(defOf(spec), s.p.x, s.p.y + 0.05, s.p.z, [s.q.x, s.q.y, s.q.z, s.q.w]);
    if (!car) throw new Error("no room for a car");
    const d = new Drive(s, car);
    this.drives.push(d);
    // (read once: where it is before the first step)
    d.post(this.cw, 1 / 60);
    return d;
  }

  /** One frame: each car's driver, the world's step (two collision steps), each read back. */
  step(controls: Controls[] | Controls, dt = 1 / 60, helps: Helps = HELPS): void {
    this.drives.forEach((d, i) => {
      const c = Array.isArray(controls) ? (controls[i] ?? controls[0]) : controls;
      d.pre(c, this.cw, dt, helps);
    });
    this.world.step(dt, 2);
    for (const d of this.drives) {
      d.post(this.cw, dt);
      this.around(d.s.p.x, d.s.p.z, 2);
    }
  }

  /** Seconds of the same controls. */
  run(
    c: Controls | ((s: CarState, t: number) => Controls),
    seconds: number,
    helps: Helps = HELPS,
    each?: (s: CarState, t: number) => boolean | undefined,
  ): number {
    const n = Math.round(seconds * 60);
    for (let i = 0; i < n; i++) {
      this.step(typeof c === "function" ? c(this.drives[0].s, i / 60) : c, 1 / 60, helps);
      if (each?.(this.drives[0].s, (i + 1) / 60)) return (i + 1) / 60;
    }
    return seconds;
  }

  dispose(): void {
    this.world.destroy();
  }
}
