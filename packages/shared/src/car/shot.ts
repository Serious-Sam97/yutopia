// A shot meets a car (docs/plan/93-the-car-in-the-world.md S1, F6a grounded): where a round's ray first
// enters a car's body, and what it struck there — glass, a thin panel, the engine block, a tyre, a lamp —,
// whether it goes on through (into the cabin, out the other side) and what it does to the car: the glass
// cracked or gone, a hole and a little dent, a tyre flat, enough on the front and the engine steams, then dies.
// It never burns. Pure: the server takes every shot's ray through the cars near it (features/cars.ts) and
// the clients draw what it left (the damage string, the holes).
//
// Frames: the server's — x, y on the ground, z up. A car's own: u forward from its centre of gravity, w to
// its right, h up from the ground under it.
import {
  type Damage,
  DOOR_GONE,
  DOOR_HANG,
  hitPane,
  norm,
  normWreck,
  PART,
  type Pane,
  sidePane,
  WRECK,
  type Zone,
} from "./damage.ts";
import { type CarSpec, SEATS_OF } from "./specs.ts";

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
  /** (plan 94 P3) the glass: which pane (damage.ts PANES), −1 none */
  pane: Pane | -1;
  /** on through it (glass, a door to a rifle round), or stopped in it */
  through: boolean;
  /** (plan 95 F4a) the skin's own way out where it was struck (the car's frame: forward, right, up), when the
   *  shooter's screen found it on the model — its hole laid on that */
  n?: [number, number, number];
  /** (plan 95 F5a) the windscreen's stars before this round (its glass's holes): it falls in at the fifth */
  stars?: number;
  /** (plan 96 F4a) the part of its skin it went into — the bonnet, a door, a bumper… —, for its count of rounds */
  part?: ShotPart;
}

// ── (plan 96 F4a) a part shot off: its rounds counted (the holes in it), loose at so many, off at so many ──
/** The parts a round takes off, by the model's names; a hole's 9th field is the index here. */
export const SHOT_PARTS = [
  "bonnet",
  "boot",
  "door_fl",
  "door_fr",
  "door_rl",
  "door_rr",
  "bumper_f",
  "bumper_r",
  "mirror_l",
  "mirror_r",
] as const;
export type ShotPart = (typeof SHOT_PARTS)[number];
/** rounds into it till it's loose (the bonnet and boot lid sprung, a door or bumper hanging), till it's off */
export const PART_ROUNDS: Record<"lid" | "door" | "bumper" | "mirror", [number, number]> = {
  lid: [4, 8],
  door: [5, 10],
  bumper: [3, 6],
  mirror: [1, 1],
};
export const isShotPart = (x: unknown): x is ShotPart => typeof x === "string" && (SHOT_PARTS as readonly string[]).includes(x);

/** (plan 96 F4a) Which part of a car's skin a point is in, as near as its box tells (the shooter's screen names it
 *  from the model; this, for a round the box took): the bonnet ahead of the cabin from above or high on its front,
 *  the front bumper low on it; the boot lid and the rear bumper so at its back; a door from the side, under the
 *  glass, by its row. None: the roof, a wing, a quarter. */
export function partAt(s: CarSpec, u: number, w: number, h: number, face: Zone): ShotPart | null {
  const b = s.body;
  const { belt } = beltOf(s);
  const low = s.clearance + 0.38;
  if (face === 0) return h < low ? "bumper_f" : h < belt + 0.05 ? "bonnet" : null;
  if (face === 1) return h < low ? "bumper_r" : h < belt + 0.1 ? "boot" : null;
  if (face === 4) return u > b.ahead * 0.45 ? "bonnet" : u < -b.behind * 0.55 ? "boot" : null;
  if (h < s.clearance + 0.12 || h > belt) return null;
  const end = frontRowEnd(s);
  const left = face === 2;
  if (u > end && u < s.front - 0.35) return left ? "door_fl" : "door_fr";
  if (u <= end && u > end - 0.95 && (SEATS_OF[s.kind]?.at.length ?? 0) > 2) return left ? "door_rl" : "door_rr";
  return null;
}

/** (plan 96 F4a) A part's rounds counted from its holes (each a round, each of a shotgun's pellets one): loose,
 *  then off, at its counts — its wreck's bits (a front bumper's and a mirror's in the parts' too). Returns whether
 *  anything new came loose or off. */
export function shotWreck(dm: Damage, holes: readonly Hole[], part: ShotPart): boolean {
  const n = holes.reduce((a, x) => a + (x.part === part ? 1 : 0), 0);
  const was = [dm.wreck, dm.parts];
  const at = (k: keyof typeof PART_ROUNDS) => [n >= PART_ROUNDS[k][0], n >= PART_ROUNDS[k][1]];
  if (part === "bonnet" || part === "boot") {
    const [loose, off] = at("lid");
    const L = part === "bonnet" ? WRECK.bonnetLoose : WRECK.bootLoose;
    const G = part === "bonnet" ? WRECK.bonnetGone : WRECK.bootGone;
    if (loose) dm.wreck |= L;
    if (off) dm.wreck |= G;
  } else if (part.startsWith("door_")) {
    const slot = ["door_fl", "door_fr", "door_rl", "door_rr"].indexOf(part);
    const [hang, off] = at("door");
    if (hang) dm.wreck |= DOOR_HANG[slot];
    if (off) dm.wreck |= DOOR_GONE[slot];
  } else if (part === "bumper_f") {
    const [hang, off] = at("bumper");
    if (hang) dm.parts |= PART.bumperHang;
    if (off) dm.parts |= PART.bumperGone;
  } else if (part === "bumper_r") {
    const [hang, off] = at("bumper");
    if (hang) dm.wreck |= WRECK.bumperRHang;
    if (off) dm.wreck |= WRECK.bumperRGone;
  } else {
    const [, off] = at("mirror");
    if (off) {
      dm.wreck |= part === "mirror_l" ? WRECK.mirrorLOff : WRECK.mirrorROff;
      dm.parts |= part === "mirror_l" ? PART.mirrorL : PART.mirrorR;
    }
  }
  dm.wreck = normWreck(dm.wreck);
  dm.parts = norm(dm.parts);
  return dm.wreck !== was[0] || dm.parts !== was[1];
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
  // (plan 94 P3) the pane: the windscreen, the rear window, or a side's — ahead of the line between its first
  // row and the one behind it the front window, else the one behind (a rear door's, the quarter's)
  let pane: Pane | -1 = -1;
  if (struck === "glass") {
    if (face === 0) pane = 0;
    else if (face === 1) pane = 1;
    else pane = sidePane(face === 2, u > frontRowEnd(s));
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
    pane,
    through,
    // (plan 96 F4a: the part of its skin, as the box tells)
    ...((struck === "panel" || struck === "engine") && partAt(s, u, w, h, face) ? { part: partAt(s, u, w, h, face) as ShotPart } : {}),
  };
}

/** (plan 94 P4) Who sat in a car a round reaches on its way through it (from `t0`, where it came in, to `t1`,
 *  where it'd come out): the seats taken (`taken`: their numbers), each person a torso up from their hip and a head
 *  above it; the nearest along it — it stops in them. Null: past them all. */
export function seatedAlong(
  o: { x: number; y: number; z: number },
  d: { x: number; y: number; z: number },
  car: CarAt,
  taken: readonly number[],
  t0: number,
  t1: number,
): { seat: number; t: number; head: boolean } | null {
  const s = car.spec;
  const S = SEATS_OF[s.kind];
  if (!S || !taken.length) return null;
  const rx = o.x - car.x;
  const ry = o.y - car.y;
  const rz = o.z - car.z;
  const dot = (a: [number, number, number], x: number, y: number, z: number) => a[0] * x + a[1] * y + a[2] * z;
  const p = [dot(car.fwd, rx, ry, rz), dot(car.right, rx, ry, rz), dot(car.up, rx, ry, rz)];
  const v = [dot(car.fwd, d.x, d.y, d.z), dot(car.right, d.x, d.y, d.z), dot(car.up, d.x, d.y, d.z)];
  // (from the centre of gravity, as the seats are: up from it, the hip's height less the CoG's)
  const bodies = taken
    .filter((i) => S.at[i])
    .map((i) => ({ i, u: S.at[i][0], w: S.at[i][1], h: (S.hip[i] ?? 0.45) - s.cog }));
  for (let t = Math.max(0, t0); t <= t1; t += 0.04) {
    const x = p[0] + v[0] * t;
    const y = p[1] + v[1] * t;
    const z = p[2] + v[2] * t;
    for (const b of bodies) {
      // (the torso: a column 0.24 round from just over the hip to the shoulders; the head over it)
      const dz = z - b.h;
      const flat = Math.hypot(x - b.u, y - b.w);
      if (dz > 0.05 && dz < 0.62 && flat < 0.24) return { seat: b.i, t, head: false };
      if (Math.hypot(flat, dz - 0.75) < 0.13) return { seat: b.i, t, head: true };
    }
  }
  return null;
}

/** (plan 94 P3) Where a car's front side windows end (m along from its centre of gravity): halfway from its first
 *  row of seats to the next; with one row, behind its whole cabin. */
export function frontRowEnd(s: CarSpec): number {
  const at = SEATS_OF[s.kind]?.at ?? [];
  if (!at.length) return -Infinity;
  const first = Math.max(...at.map((p) => p[0]));
  const next = at.map((p) => p[0]).filter((u) => u < first - 0.3);
  return next.length ? (first + Math.max(...next)) / 2 : -Infinity;
}

// ── (plan 95 F4a) where a round met the car, as the shooter's screen found it on the model it drew ──

/** A round's car as the shooter saw it struck: which car (its live vehicle's id, or its parked object's), the point
 *  on its skin in the car's own frame (u forward, w right, h up from the ground: m), its face (damage's zones), what
 *  it struck there (the tyre's index, the lamp's side, the pane), the skin's way out there. */
export interface CarClaim {
  id: string;
  u: number;
  w: number;
  h: number;
  f: number;
  s: Struck;
  /** the tyre (0 FL, 1 FR, 2 RL, 3 RR), the lamp's side (0 its left, 1 its right) */
  n?: number;
  /** the pane (damage.ts PANES) */
  p?: number;
  /** (plan 96 F4a) the part of its skin (the model's name: SHOT_PARTS) */
  part?: string;
  /** the skin's normal there, the car's frame ×100 */
  nu?: number;
  nw?: number;
  nh?: number;
}
const STRUCK: readonly Struck[] = ["glass", "panel", "engine", "tyre", "lamp"];

/** (plan 95 F4a) What a round on the car's body (paint, not glass, a lamp or a wheel) struck: the engine block
 *  through its bonnet or its front — ahead of the front wheels' middle, below a little over the glass's line, not
 *  from behind —, else a panel. */
export function bodyStruck(s: CarSpec, u: number, h: number, face: number): "engine" | "panel" {
  return face !== 1 && u > s.front - 0.15 && h < beltOf(s).belt + 0.2 ? "engine" : "panel";
}

/** (plan 95 F4a) A face (damage's zones) from the skin's way out there (the car's frame): the front, the back, a
 *  side, or the top — the top ahead of the cabin the front's (its bonnet), behind it the back's (its boot lid). */
export function faceOf(s: CarSpec, u: number, nu: number, nw: number, nh: number): Zone {
  const au = Math.abs(nu);
  const aw = Math.abs(nw);
  if (nh > au && nh > aw) {
    if (u > s.body.ahead * 0.45) return 0;
    if (u < -s.body.behind * 0.55) return 1;
    return 4;
  }
  if (au >= aw) return nu > 0 ? 0 : 1;
  return nw < 0 ? 2 : 3;
}

/** (plan 95 F4a) A shooter's claim checked against the car where the server has it and the round's own ray (from
 *  `o` along the unit `d`): its point on the car (its box, a hand's width over) and near the ray (the shooter's
 *  spread a guess of the server's: more slack the further it went), within reach. Null: not taken (the box decides). */
export function claimShot(
  o: { x: number; y: number; z: number },
  d: { x: number; y: number; z: number },
  car: CarAt,
  c: CarClaim,
  range: number,
  gun: string,
): CarShot | null {
  const s = car.spec;
  const b = s.body;
  if (![c.u, c.w, c.h, c.f].every((x) => typeof x === "number" && Number.isFinite(x))) return null;
  const m = 0.3;
  if (c.u < -b.behind - m || c.u > b.ahead + m || Math.abs(c.w) > b.width / 2 + m || c.h < -0.1 || c.h > b.height + m)
    return null;
  const hz = c.h - s.cog;
  const x = car.x + car.fwd[0] * c.u + car.right[0] * c.w + car.up[0] * hz;
  const y = car.y + car.fwd[1] * c.u + car.right[1] * c.w + car.up[1] * hz;
  const z = car.z + car.fwd[2] * c.u + car.right[2] * c.w + car.up[2] * hz;
  const t = (x - o.x) * d.x + (y - o.y) * d.y + (z - o.z) * d.z;
  if (t < 0 || t > range) return null;
  const off = Math.hypot(o.x + d.x * t - x, o.y + d.y * t - y, o.z + d.z * t - z);
  if (off > 0.45 + 0.03 * t) return null;
  const struck: Struck = STRUCK.includes(c.s) ? c.s : "panel";
  const face = Math.max(0, Math.min(4, Math.round(c.f))) as Zone;
  const which = struck === "tyre" ? Math.max(0, Math.min(3, Math.round(c.n ?? 0))) : struck === "lamp" ? (c.n ? 1 : 0) : 0;
  let pane: Pane | -1 = -1;
  if (struck === "glass") {
    const p = Math.round(c.p ?? -1);
    pane = p >= 0 && p <= 5 ? (p as Pane) : face === 0 ? 0 : face === 1 ? 1 : sidePane(face === 2, c.u > frontRowEnd(s));
  }
  const through =
    struck === "glass" ||
    (struck === "panel" && (gun === "ak" || gun === "sniper" || (gun === "revolver" && (face === 2 || face === 3))));
  // (where it'd come out: the box's far side along it)
  const box = carAlong(o, d, car, range, gun);
  const out = box ? Math.max(box.out, t + 0.05) : t + b.width;
  const nn = [c.nu, c.nw, c.nh].map((v) => (typeof v === "number" && Number.isFinite(v) ? v / 100 : 0));
  const nl = Math.hypot(nn[0], nn[1], nn[2]);
  return {
    t,
    out,
    x,
    y,
    z,
    u: c.u,
    w: c.w,
    h: c.h,
    face,
    struck,
    which,
    pane,
    through,
    ...(nl > 0.5 ? { n: [nn[0] / nl, nn[1] / nl, nn[2] / nl] as [number, number, number] } : {}),
    // (plan 96 F4a: its part as the screen named it, else as the box tells — its skin only)
    ...(struck === "panel" || struck === "engine"
      ? (() => {
          const part = isShotPart(c.part) ? c.part : partAt(s, c.u, c.w, c.h, face);
          return part ? { part } : {};
        })()
      : {}),
  };
}

/** (plan 95 F1a) The panes whose windows are wound down (bits 1 << pane): each seat's own window (`win`: the
 *  car's bits by seat) — on its side, its row's. A round through one meets no glass. */
export function panesOpen(s: CarSpec, win: number): number {
  if (!win) return 0;
  const at = SEATS_OF[s.kind]?.at ?? [];
  const end = frontRowEnd(s);
  let out = 0;
  at.forEach((p, i) => {
    if (win & (1 << i)) out |= 1 << sidePane(p[1] < 0, p[0] > end);
  });
  return out;
}

/** What a round did to the car: its damage (only ever more), and the parts it newly broke. A tyre struck goes
 *  flat; its pane of glass cracks, then goes (the windscreen: cracked, badly, then gone); a lamp breaks; a panel takes a
 *  hole and a little dent; the engine block more, and past its mark the engine steams and then dies. */
export function shotDamage(dm: Damage, hit: CarShot): number {
  const before = dm.parts;
  const z = hit.face;
  const add = (k: number) => {
    dm.zones[z] = Math.min(1, dm.zones[z] + k);
  };
  if (hit.struck === "tyre") dm.parts |= [PART.flatFL, PART.flatFR, PART.flatRL, PART.flatRR][hit.which];
  // (plan 94 P3: its pane — whole, it cracks; cracked, it goes; the windscreen badly first)
  else if (hit.struck === "glass") {
    // (plan 95 F5a: the windscreen — laminated — stars where each round goes in and stays: badly from the third,
    // in at the fifth; the others crack where struck, and go at the second)
    if (hit.pane === 0 && hit.stars !== undefined && !(dm.parts & PART.screenGone)) {
      const n = hit.stars + 1;
      dm.parts |= PART.screen;
      if (n >= STARS_BAD) dm.parts |= PART.screenBad;
      if (n >= STARS_IN) dm.parts |= PART.screenGone;
      dm.parts = norm(dm.parts);
    } else if (hit.pane >= 0) hitPane(dm, hit.pane as Pane);
  } else if (hit.struck === "lamp") {
    if (z === 0) dm.parts |= hit.which === 0 ? PART.headL : PART.headR;
    else dm.parts |= hit.which === 0 ? PART.tailL : PART.tailR;
    add(0.02);
  } else if (hit.struck === "engine") {
    // (the front's: a radiator's water out, then the block — past 0.9 a hit there stops it)
    const was = dm.zones[0];
    // (plan 94 P4: heavier — each round tells)
    dm.zones[0] = Math.min(1, dm.zones[0] + 0.09);
    if (was >= 0.9) dm.parts |= PART.engineDead;
  } else add(0.04);
  return dm.parts & ~before;
}

/** The holes a car's taken (its string: "u,w,h,face;…", the car's own frame, cm), the latest kept. */
export const HOLES_MAX = 32;
/** (plan 95 F5a) the windscreen's stars: badly cracked from this many, fallen in at this many */
export const STARS_BAD = 3;
export const STARS_IN = 5;
export function addHole(s: string, hit: CarShot): string {
  const cm = (x: number) => Math.round(x * 100);
  const list = s ? s.split(";") : [];
  // (plan 95 F4a: the skin's way out there, when it's known — "u,w,h,face,nu,nw,nh"; F5a: in glass, its pane
  // after — "…,nu,nw,nh,pane", the normal 0,0,0 when it isn't known)
  // (plan 96 F4a: in a part of its skin, after them — "…,pane,part", its pane −1)
  const glass = hit.struck === "glass" && hit.pane >= 0;
  const part = hit.part ? SHOT_PARTS.indexOf(hit.part) : -1;
  const n = hit.n ? `,${hit.n.map(cm).join(",")}` : glass || part >= 0 ? ",0,0,0" : "";
  const tail = part >= 0 ? `,${glass ? hit.pane : -1},${part}` : glass ? `,${hit.pane}` : "";
  list.push(`${cm(hit.u)},${cm(hit.w)},${cm(hit.h)},${hit.face}${n}${tail}`);
  return list.slice(-HOLES_MAX).join(";");
}
export interface Hole {
  u: number;
  w: number;
  h: number;
  face: Zone;
  /** (plan 95 F4a) the skin's way out there (the car's frame), if known */
  n?: [number, number, number];
  /** (plan 95 F5a) in glass: its pane (a star on the windscreen; where the others cracked from) */
  pane?: number;
  /** (plan 96 F4a) the part of its skin it's in */
  part?: ShotPart;
}
export function parseHoles(s: unknown): Hole[] {
  if (typeof s !== "string" || !s) return [];
  const out: Hole[] = [];
  for (const it of s.split(";")) {
    const [u, w, h, f, nu, nw, nh, pane, part] = it.split(",").map(Number);
    if (![u, w, h, f].every(Number.isFinite) || f < 0 || f > 4) continue;
    const hole: Hole = { u: u / 100, w: w / 100, h: h / 100, face: f as Zone };
    if ([nu, nw, nh].every(Number.isFinite) && Math.hypot(nu, nw, nh) > 50) hole.n = [nu / 100, nw / 100, nh / 100];
    if (Number.isInteger(pane) && pane >= 0 && pane <= 5) hole.pane = pane;
    if (Number.isInteger(part) && part >= 0 && part < SHOT_PARTS.length) hole.part = SHOT_PARTS[part];
    out.push(hole);
  }
  return out.slice(-HOLES_MAX);
}
