// A Strike Park map as data (docs/plan/114-the-strike-park.md, S-M6): what it's built of, where the teams
// start and buy, the sites, the hostages, the places' names. From this one description come the solids
// (Jolt), the walk grid (the checks, the bots), the wallbang materials, the radar and the 3D.
//
// Local metres: (0, 0) is the arena's middle (land.ts STRIKE_PARK), x east, z south, y up from the pad.
// Every map is our own (F1): built on the competitive map's rules, measured by check.ts.

export type P = [number, number];
export interface Rect {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
}

/** What a surface is made of: how a shot gets through it (S-M2's wallbangs) and how it's drawn. */
export type Mat =
  | "concrete"
  | "brick"
  | "stone"
  | "wood"
  | "plank"
  | "drywall"
  | "metal"
  | "sheet"
  | "glass"
  | "snow"
  | "rock"
  | "tile";

/** Per material: `pen` the share of a shot's damage kept per 10 cm of it (0: stops it); `step` the
 *  footstep's surface (plan 63's kinds). */
export const MATS: Record<Mat, { pen: number; step: string; label: string }> = {
  concrete: { pen: 0, step: "concrete", label: "concrete" },
  brick: { pen: 0, step: "concrete", label: "brick" },
  stone: { pen: 0, step: "concrete", label: "stone" },
  rock: { pen: 0, step: "concrete", label: "rock" },
  wood: { pen: 0.72, step: "wood", label: "timber" },
  plank: { pen: 0.85, step: "wood", label: "planks" },
  drywall: { pen: 0.9, step: "wood", label: "drywall" },
  metal: { pen: 0.35, step: "metal", label: "steel" },
  sheet: { pen: 0.8, step: "metal", label: "sheet metal" },
  glass: { pen: 0.95, step: "concrete", label: "glass" },
  snow: { pen: 0.6, step: "snow", label: "packed snow" },
  tile: { pen: 0, step: "concrete", label: "tile" },
};

/** The pieces a map's built of. Heights in metres from the pad; `m` its material. */
export type Piece =
  /** a solid block, axis-aligned (a building's mass, a wall's run, a platform's body) */
  | { k: "box"; x0: number; z0: number; x1: number; z1: number; y0?: number; y1: number; m: Mat; look?: string }
  /** a wall from a to b, `t` thick (0.3), any angle; `y0` its foot (a lintel over a door: y0 2.4) */
  | { k: "wall"; a: P; b: P; t?: number; y0?: number; y1: number; m: Mat; look?: string }
  /** a slab: its top at `y`, `t` thick (0.3) — an upper floor, a catwalk, a roof; walked on, under it headroom */
  | { k: "floor"; x0: number; z0: number; x1: number; z1: number; y: number; t?: number; m: Mat; look?: string }
  /** a slope from `y0` to `y1`, rising toward `up` (walked: its solids are 0.25 m steps) */
  | { k: "ramp"; x0: number; z0: number; x1: number; z1: number; y0: number; y1: number; up: Dir; m: Mat }
  /** a flight of stairs, the same as a ramp drawn as treads (0.2 m risers) */
  | { k: "stairs"; x0: number; z0: number; x1: number; z1: number; y0: number; y1: number; up: Dir; m: Mat }
  /** a crate `s` a side (1.1 the CS crate, 1.4 the big one), `n` stacked, on `y` */
  | { k: "crate"; x: number; z: number; s: number; n?: number; y?: number; m?: "wood" | "metal"; ry?: number }
  /** a thing drawn only (no solid): a lamp, a sign, a barrel's light… `kind` the 3D's */
  | { k: "prop"; kind: string; x: number; z: number; y?: number; ry?: number; s?: number };
export type Dir = "n" | "s" | "e" | "w";

export type Team = "r" | "w";
/** The Raiders (attack: the charge) and the Wardens (defend; rescue the hostages): F4's names. */
export const TEAMS: Record<Team, { name: string; short: string }> = {
  r: { name: "Raiders", short: "RAID" },
  w: { name: "Wardens", short: "WARD" },
};

export type Mode = "bomb" | "hostage" | "wingman" | "range";

export interface StrikeMap {
  key: string;
  name: string;
  mode: Mode;
  /** one line for the Map Board */
  blurb: string;
  /** what it plays like (the board's second line) */
  plays: string;
  /** the playable box (its outer walls inside it) */
  size: Rect;
  pieces: Piece[];
  /** where each team starts: ≥ 10 each (5 for Wingman), standable */
  spawns: Record<Team, P[]>;
  /** where each team may buy */
  buy: Record<Team, Rect>;
  /** bomb maps: the sites the charge is planted on (A, and B but on Wingman) */
  sites?: { A: Rect; B?: Rect };
  /** hostage maps: where the hostages are held, and where the Wardens bring them */
  hostages?: P[];
  rescue?: Rect;
  /** the places' names (callouts on the radar) */
  calls: { name: string; r: Rect }[];
  /** the ground's look (its tint and the snow's cover) */
  ground: Mat;
  /** a light for the night: lamp posts are props; this the arena's floods' count */
  floods?: number;
}

export const rect = (x0: number, z0: number, x1: number, z1: number): Rect => ({
  x0: Math.min(x0, x1),
  z0: Math.min(z0, z1),
  x1: Math.max(x0, x1),
  z1: Math.max(z0, z1),
});
export const inRect = (r: Rect, x: number, z: number, m = 0) =>
  x >= r.x0 - m && x <= r.x1 + m && z >= r.z0 - m && z <= r.z1 + m;
export const midOf = (r: Rect): P => [(r.x0 + r.x1) / 2, (r.z0 + r.z1) / 2];

/** A solid of a map in local metres: an oriented box (yaw `a`, as three.js turns things: its +x goes
 *  to (cos a, −sin a)), its material, and the piece it came from. */
export interface MapBox {
  x: number;
  y: number;
  z: number;
  hx: number;
  hy: number;
  hz: number;
  a: number;
  m: Mat;
  /** the piece's index in `pieces` */
  i: number;
  look?: string;
}

const box = (
  x0: number,
  z0: number,
  x1: number,
  z1: number,
  y0: number,
  y1: number,
  m: Mat,
  i: number,
  look?: string,
): MapBox => ({
  x: (x0 + x1) / 2,
  y: (y0 + y1) / 2,
  z: (z0 + z1) / 2,
  hx: Math.abs(x1 - x0) / 2,
  hy: Math.abs(y1 - y0) / 2,
  hz: Math.abs(z1 - z0) / 2,
  a: 0,
  m,
  i,
  look,
});

/** A slope's solids: steps `rise` high, each from the pad's level (or y0) up to its tread. */
function steps(p: Extract<Piece, { k: "ramp" | "stairs" }>, i: number, rise: number): MapBox[] {
  const out: MapBox[] = [];
  const H = p.y1 - p.y0;
  const n = Math.max(1, Math.ceil(H / rise - 1e-6));
  const along = p.up === "n" || p.up === "s" ? p.z1 - p.z0 : p.x1 - p.x0;
  const run = along / n;
  for (let k = 0; k < n; k++) {
    const top = p.y0 + (H * (k + 1)) / n;
    // the k-th step from the low end
    let x0 = p.x0;
    let x1 = p.x1;
    let z0 = p.z0;
    let z1 = p.z1;
    if (p.up === "n") {
      z1 = p.z1 - run * k;
      z0 = z1 - run;
    } else if (p.up === "s") {
      z0 = p.z0 + run * k;
      z1 = z0 + run;
    } else if (p.up === "e") {
      x0 = p.x0 + run * k;
      x1 = x0 + run;
    } else {
      x1 = p.x1 - run * k;
      x0 = x1 - run;
    }
    // (each step reaches to the slope's high end, so the steps are one solid under the slope)
    if (p.up === "n") z0 = p.z0;
    else if (p.up === "s") z1 = p.z1;
    else if (p.up === "e") x1 = p.x1;
    else x0 = p.x0;
    out.push(box(x0, z0, x1, z1, Math.max(0, p.y0 - 0.02), top, p.m, i));
  }
  return out;
}

/** Every solid of a map (local metres), made once per map. */
export function mapBoxes(map: StrikeMap): MapBox[] {
  const cached = boxCache.get(map);
  if (cached) return cached;
  const out: MapBox[] = [];
  map.pieces.forEach((p, i) => {
    switch (p.k) {
      case "box":
        out.push(box(p.x0, p.z0, p.x1, p.z1, p.y0 ?? 0, p.y1, p.m, i, p.look));
        break;
      case "wall": {
        const [ax, az] = p.a;
        const [bx, bz] = p.b;
        const L = Math.hypot(bx - ax, bz - az);
        const t = p.t ?? 0.3;
        const y0 = p.y0 ?? 0;
        out.push({
          x: (ax + bx) / 2,
          y: (y0 + p.y1) / 2,
          z: (az + bz) / 2,
          hx: L / 2 + t / 2,
          hy: (p.y1 - y0) / 2,
          hz: t / 2,
          a: Math.atan2(-(bz - az), bx - ax),
          m: p.m,
          i,
          look: p.look,
        });
        break;
      }
      case "floor": {
        const t = p.t ?? 0.3;
        out.push(box(p.x0, p.z0, p.x1, p.z1, p.y - t, p.y, p.m, i, p.look));
        break;
      }
      case "ramp":
        out.push(...steps(p, i, 0.25));
        break;
      case "stairs":
        out.push(...steps(p, i, 0.2));
        break;
      case "crate": {
        const n = p.n ?? 1;
        const y = p.y ?? 0;
        const h = p.s / 2;
        const a = p.ry ?? 0;
        out.push({
          x: p.x,
          y: y + (p.s * n) / 2,
          z: p.z,
          hx: h,
          hy: (p.s * n) / 2,
          hz: h,
          a,
          m: p.m ?? "wood",
          i,
          look: "crate",
        });
        break;
      }
      case "prop":
        break;
    }
  });
  boxCache.set(map, out);
  return out;
}
const boxCache = new WeakMap<StrikeMap, MapBox[]>();

/** Whether (x, z) is inside box b's footprint (with `m` more round it). */
export function inBox(b: MapBox, x: number, z: number, m = 0): boolean {
  const dx = x - b.x;
  const dz = z - b.z;
  const c = Math.cos(b.a);
  const s = Math.sin(b.a);
  // (the box's local axes: +x to (c, −s), +z to (s, c))
  const lx = dx * c - dz * s;
  const lz = dx * s + dz * c;
  return Math.abs(lx) <= b.hx + m && Math.abs(lz) <= b.hz + m;
}
/** A box's footprint's bounds (for indexing). */
export function boxBounds(b: MapBox): Rect {
  const c = Math.abs(Math.cos(b.a));
  const s = Math.abs(Math.sin(b.a));
  const ex = b.hx * c + b.hz * s;
  const ez = b.hx * s + b.hz * c;
  return { x0: b.x - ex, z0: b.z - ez, x1: b.x + ex, z1: b.z + ez };
}

/** The ray from `o` along `d` (unit) against a box: [tin, tout] or null (a slab test in its frame). */
export function rayBox(b: MapBox, o: [number, number, number], d: [number, number, number]): [number, number] | null {
  const c = Math.cos(b.a);
  const s = Math.sin(b.a);
  const ox = o[0] - b.x;
  const oz = o[2] - b.z;
  const lo = [ox * c - oz * s, o[1] - b.y, ox * s + oz * c];
  const ld = [d[0] * c - d[2] * s, d[1], d[0] * s + d[2] * c];
  const h = [b.hx, b.hy, b.hz];
  let t0 = -Infinity;
  let t1 = Infinity;
  for (let k = 0; k < 3; k++) {
    if (Math.abs(ld[k]) < 1e-9) {
      if (Math.abs(lo[k]) > h[k]) return null;
      continue;
    }
    const a = (-h[k] - lo[k]) / ld[k];
    const bb = (h[k] - lo[k]) / ld[k];
    t0 = Math.max(t0, Math.min(a, bb));
    t1 = Math.min(t1, Math.max(a, bb));
    if (t0 > t1) return null;
  }
  return t1 < 0 ? null : [Math.max(0, t0), t1];
}

/** (plan 118, F9a) The first solid a ray from `o` along `d` (unit; local metres, y up) meets within `max` m — the
 *  ground's top at 0 too —: how far, the face's outward normal, its material. Null: nothing. */
export function rayFirst(
  map: StrikeMap,
  o: [number, number, number],
  d: [number, number, number],
  max: number,
): { t: number; n: [number, number, number]; m: Mat | "ground" } | null {
  let best: { t: number; n: [number, number, number]; m: Mat | "ground" } | null = null;
  if (d[1] < -1e-6 && o[1] > 0) {
    const t = -o[1] / d[1];
    if (t <= max) best = { t, n: [0, 1, 0], m: "ground" };
  }
  for (const b of mapBoxes(map)) {
    const c = Math.cos(b.a);
    const s = Math.sin(b.a);
    const ox = o[0] - b.x;
    const oz = o[2] - b.z;
    const lo = [ox * c - oz * s, o[1] - b.y, ox * s + oz * c];
    const ld = [d[0] * c - d[2] * s, d[1], d[0] * s + d[2] * c];
    const h = [b.hx, b.hy, b.hz];
    let t0 = -Infinity;
    let t1 = Infinity;
    let axis = -1;
    let sign = 1;
    let miss = false;
    for (let k = 0; k < 3; k++) {
      if (Math.abs(ld[k]) < 1e-9) {
        if (Math.abs(lo[k]) > h[k]) {
          miss = true;
          break;
        }
        continue;
      }
      const a = (-h[k] - lo[k]) / ld[k];
      const bb = (h[k] - lo[k]) / ld[k];
      const near = Math.min(a, bb);
      if (near > t0) {
        t0 = near;
        axis = k;
        // (the face met first: the one facing back at the ray)
        sign = ld[k] > 0 ? -1 : 1;
      }
      t1 = Math.min(t1, Math.max(a, bb));
      if (t0 > t1) {
        miss = true;
        break;
      }
    }
    if (miss || axis < 0 || t0 < 0 || t0 > max || (best && t0 >= best.t)) continue;
    // (the normal back out of the box's turn)
    const ln = [0, 0, 0];
    ln[axis] = sign;
    const n: [number, number, number] = [ln[0] * c + ln[2] * s, ln[1], -ln[0] * s + ln[2] * c];
    best = { t: t0, n, m: b.m };
  }
  return best;
}

/** What's left of a shot's damage after it passes through a map from `o` to `to` (local metres, y up):
 *  1 when nothing's in the way, 0 when something stops it (concrete, brick, or too much of anything);
 *  `walls` how many it went through (the kill feed's wallbang mark). */
export function shotThrough(
  map: StrikeMap,
  o: [number, number, number],
  to: [number, number, number],
): { kept: number; walls: number } {
  const d: [number, number, number] = [to[0] - o[0], to[1] - o[1], to[2] - o[2]];
  const L = Math.hypot(d[0], d[1], d[2]);
  if (L < 1e-6) return { kept: 1, walls: 0 };
  d[0] /= L;
  d[1] /= L;
  d[2] /= L;
  let kept = 1;
  let walls = 0;
  for (const b of mapBoxes(map)) {
    const t = rayBox(b, o, d);
    if (!t || t[0] >= L) continue;
    const thick = Math.min(t[1], L) - t[0];
    if (thick <= 1e-4) continue;
    const pen = MATS[b.m].pen;
    if (pen <= 0) return { kept: 0, walls: walls + 1 };
    kept *= pen ** (thick / 0.1);
    walls++;
    if (kept < 0.1) return { kept: 0, walls };
  }
  return { kept, walls };
}
