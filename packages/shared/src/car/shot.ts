// A shot meets a car (docs/plan/93-the-car-in-the-world.md S1, F6a grounded): where a round's ray first
// enters a car's body, and what it struck there — glass, a thin panel, the engine block, a tyre, a lamp —,
// whether it goes on through (into the cabin, out the other side) and what it does to the car: the glass
// cracked or gone, a hole and a little dent, a tyre flat, enough on the front and the engine steams, then dies.
// It never burns. Pure: the server takes every shot's ray through the cars near it (features/cars.ts) and
// the clients draw what it left (the damage string, the holes).
//
// Frames: the server's — x, y on the ground, z up. A car's own: u forward from its centre of gravity, w to
// its right, h up from the ground under it.
import { type Damage, PART, type Zone } from "./damage.ts";
import type { CarSpec } from "./specs.ts";

/** A car where it is: its centre of gravity (the server's frame) and its axes (unit vectors there). */
export interface CarAt {
  x: number;
  y: number;
  z: number;
  fwd: [number, number, number];
  right: [number, number, number];
  up: [number, number, number];
  spec: CarSpec;
}

export type Struck = "glass" | "panel" | "engine" | "tyre" | "lamp";

export interface CarShot {
  /** along the ray (m): where it came in, and where it'd come out the far side */
  t: number;
  out: number;
  /** the point struck (the server's frame) */
  x: number;
  y: number;
  z: number;
  /** the car's own: forward, right, up from the ground */
  u: number;
  w: number;
  h: number;
  /** which face it came in by: 0 front, 1 rear, 2 left, 3 right, 4 the roof (damage's zones) */
  face: Zone;
  struck: Struck;
  /** the tyre (0 FL, 1 FR, 2 RL, 3 RR) or the lamp's side (0 its left, 1 its right) */
  which: number;
  /** on through it (glass, a door to a rifle round), or stopped in it */
  through: boolean;
}

/** A car's axes from its heading on the flat (a parked one: level, its heading `a`). */
export function levelCar(x: number, y: number, ground: number, a: number, spec: CarSpec): CarAt {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return { x, y, z: ground + spec.cog, fwd: [c, s, 0], right: [-s, c, 0], up: [0, 0, 1], spec };
}

/** …and from a quaternion in the 3D view's frame (x, y up, z: the vehicles' wire) — its x forward, z right. */
export function wireCar(x: number, y3: number, z3: number, q: [number, number, number, number], spec: CarSpec): CarAt {
  const [qx, qy, qz, qw] = q;
  // (an axis of the car in the view's frame, then to the server's: x, z on the ground → x, y; y up → z)
  const ax = (vx: number, vy: number, vz: number): [number, number, number] => {
    // (v + w·t + q×t, t = 2 q×v)
    const tx = 2 * (qy * vz - qz * vy);
    const ty = 2 * (qz * vx - qx * vz);
    const tz = 2 * (qx * vy - qy * vx);
    const rx = vx + qw * tx + (qy * tz - qz * ty);
    const ry = vy + qw * ty + (qz * tx - qx * tz);
    const rz = vz + qw * tz + (qx * ty - qy * tx);
    return [rx, rz, ry];
  };
  return { x, y: z3, z: y3, fwd: ax(1, 0, 0), right: ax(0, 0, 1), up: ax(0, 1, 0), spec };
}

/** How far up its sides the glass starts, and the roof (m from the ground). */
export function beltOf(spec: CarSpec): { belt: number; roof: number } {
  const b = spec.body;
  return { belt: spec.clearance + (b.height - spec.clearance) * 0.55, roof: b.height };
}

/** Where a ray (from `o`, along the unit `d`) first enters a car within `range`, and what it struck; null if
 *  it misses. `gun`: the round's (a rifle's goes through a door, the revolver's through a door's skin, the
 *  shotgun's pellets stop in it; nothing goes through the engine block or a wheel). */
export function carAlong(
  o: { x: number; y: number; z: number },
  d: { x: number; y: number; z: number },
  car: CarAt,
  range: number,
  gun: string,
): CarShot | null {
  const s = car.spec;
  const b = s.body;
  const rx = o.x - car.x;
  const ry = o.y - car.y;
  const rz = o.z - car.z;
  const dot = (a: [number, number, number], x: number, y: number, z: number) => a[0] * x + a[1] * y + a[2] * z;
  // the ray in the car's frame (relative to its centre of gravity)
  const p = [dot(car.fwd, rx, ry, rz), dot(car.right, rx, ry, rz), dot(car.up, rx, ry, rz)];
  const v = [dot(car.fwd, d.x, d.y, d.z), dot(car.right, d.x, d.y, d.z), dot(car.up, d.x, d.y, d.z)];
  const lo = [-b.behind, -b.width / 2, -s.cog + s.clearance];
  const hi = [b.ahead, b.width / 2, -s.cog + b.height];
  let t0 = 0;
  let t1 = range;
  let axis = -1;
  let neg = false;
  for (let i = 0; i < 3; i++) {
    if (Math.abs(v[i]) < 1e-9) {
      if (p[i] < lo[i] || p[i] > hi[i]) return null;
      continue;
    }
    let ta = (lo[i] - p[i]) / v[i];
    let tb = (hi[i] - p[i]) / v[i];
    let n = true;
    if (ta > tb) {
      [ta, tb] = [tb, ta];
      n = false;
    }
    if (ta > t0) {
      t0 = ta;
      axis = i;
      neg = n;
    }
    t1 = Math.min(t1, tb);
    if (t0 > t1) return null;
  }
  // (from inside it — a shot from a seat: not its own car's)
  if (axis < 0) return null;
  const u = p[0] + v[0] * t0;
  const w = p[1] + v[1] * t0;
  const h = p[2] + v[2] * t0 + s.cog;
  const face: Zone = axis === 0 ? (neg ? 1 : 0) : axis === 1 ? (neg ? 2 : 3) : 4;
  const { belt, roof } = beltOf(s);
  let struck: Struck = "panel";
  let which = 0;
  // a tyre: by its wheel, from the side or a corner, under its top
  const rear = -(s.wheelbase - s.front);
  const r = s.wheel.r;
  for (const [i, ua] of [s.front, s.front, rear, rear].entries()) {
    const side = i % 2 ? 1 : -1;
    if (face === 4 || h > 2 * r * 1.02) continue;
    if (Math.abs(u - ua) < r * 1.05 && Math.abs(w - (side * s.track) / 2) < b.width * 0.3) {
      struck = "tyre";
      which = i;
      break;
    }
  }
  if (struck === "panel" && face !== 4) {
    if (h > belt && h < roof - 0.06) struck = "glass";
    // a lamp: at the front's or back's outer corners, at the lamps' height
    else if ((face === 0 || face === 1) && Math.abs(w) > b.width / 2 - 0.36 && h > belt - 0.5 && h < belt + 0.02) {
      struck = "lamp";
      which = w < 0 ? 0 : 1;
    }
    // the engine block: the front's low half, ahead of the front wheels' middle — from the front or the sides
    else if (h < belt && u > s.front - 0.15 && face !== 1) struck = "engine";
  }
  const through =
    struck === "glass" ||
    (struck === "panel" && (gun === "ak" || gun === "sniper" || (gun === "revolver" && (face === 2 || face === 3))));
  return {
    t: t0,
    out: t1,
    x: o.x + d.x * t0,
    y: o.y + d.y * t0,
    z: o.z + d.z * t0,
    u,
    w,
    h,
    face,
    struck,
    which,
    through,
  };
}

/** What a round did to the car: its damage (only ever more), and the parts it newly broke. A tyre struck goes
 *  flat; glass cracks (the windscreen: cracked, then badly) or a side's goes; a lamp breaks; a panel takes a
 *  hole and a little dent; the engine block more, and past its mark the engine steams and then dies. */
export function shotDamage(dm: Damage, hit: CarShot): number {
  const before = dm.parts;
  const z = hit.face;
  const add = (k: number) => {
    dm.zones[z] = Math.min(1, dm.zones[z] + k);
  };
  if (hit.struck === "tyre") dm.parts |= [PART.flatFL, PART.flatFR, PART.flatRL, PART.flatRR][hit.which];
  else if (hit.struck === "glass") {
    if (z === 0) dm.parts |= dm.parts & PART.screen ? PART.screenBad : PART.screen;
    else if (z === 2) dm.parts |= PART.sideL;
    else if (z === 3) dm.parts |= PART.sideR;
  } else if (hit.struck === "lamp") {
    if (z === 0) dm.parts |= hit.which === 0 ? PART.headL : PART.headR;
    else dm.parts |= hit.which === 0 ? PART.tailL : PART.tailR;
    add(0.02);
  } else if (hit.struck === "engine") {
    // (the front's: a radiator's water out, then the block — past 0.9 a hit there stops it)
    const was = dm.zones[0];
    dm.zones[0] = Math.min(1, dm.zones[0] + 0.07);
    if (was >= 0.9) dm.parts |= PART.engineDead;
  } else add(0.025);
  return dm.parts & ~before;
}

/** The holes a car's taken (its string: "u,w,h,face;…", the car's own frame, cm), the latest kept. */
export const HOLES_MAX = 32;
export function addHole(s: string, hit: CarShot): string {
  const cm = (x: number) => Math.round(x * 100);
  const list = s ? s.split(";") : [];
  list.push(`${cm(hit.u)},${cm(hit.w)},${cm(hit.h)},${hit.face}`);
  return list.slice(-HOLES_MAX).join(";");
}
export function parseHoles(s: unknown): { u: number; w: number; h: number; face: Zone }[] {
  if (typeof s !== "string" || !s) return [];
  const out: { u: number; w: number; h: number; face: Zone }[] = [];
  for (const it of s.split(";")) {
    const [u, w, h, f] = it.split(",").map(Number);
    if ([u, w, h, f].every(Number.isFinite) && f >= 0 && f <= 4)
      out.push({ u: u / 100, w: w / 100, h: h / 100, face: f as Zone });
  }
  return out.slice(-HOLES_MAX);
}
