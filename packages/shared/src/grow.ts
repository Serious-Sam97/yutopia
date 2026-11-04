import type { GrowBiome, GrowDef } from "./grounds-edits.ts";
import type { Rect, Region } from "./land.ts";

// God mode grows the land (docs/plan/69-the-long-road.md, phase 10): an admin adds a piece of land
// (`GroundsEdits.land`), a rect snapped to the chunks touching the land there is, and picks its
// biome. Here, what each biome makes of it — its heights eased in from the land it touches over
// 100 m, its trees, its surface, its water — read by grounds.ts where the piece is the land's.
// Building coords (metres; x east, z south). Free of grounds.ts (it reads this): the land it
// touches is asked of it through `setGrown`'s `under`.

/** The biomes a piece may be (the user's eight, 2026-11-03). */
export const GROW_BIOMES: readonly GrowBiome[] = [
  "forest",
  "meadow",
  "hills",
  "mountains",
  "lake",
  "farmland",
  "beach",
  "desert",
];
export const GROW_NAMES: Record<GrowBiome, string> = {
  forest: "Forest",
  meadow: "Meadow",
  hills: "Hills",
  mountains: "Mountains",
  lake: "Lake",
  farmland: "Farmland",
  beach: "Beach & coast",
  desert: "Desert & canyon",
};
/** A piece's sides are on this grid (the chunks'). */
export const GROW_SNAP = 32;
/** How far in from its edge a piece's own land has come in full (m). */
export const GROW_BLEND = 100;
/** The scenery drawn round a piece past where anyone may go (its drawn box: its reach and this). */
export const GROW_DRAWN = 96;
/** The rules: a piece at least this a side, at most this; all of them at most this much (m²); this
 *  many; none past this far from the middle of the world; a lake at most `lake` a side and `lakes` of
 *  them (its ice is solid: rows 2 m apart, the physics' to hold). */
export const GROW_LIMITS = {
  min: 64,
  max: 4096,
  area: 40_000_000,
  count: 200,
  reach: 30_000,
  lift: 60,
  lake: 1536,
  lakes: 12,
};

// (the Grounds' noise, the same numbers — its own copy, as longroad.ts keeps one)
function hash2(x: number, z: number, s: number): number {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(z | 0, 668265263) + Math.imul(s | 0, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
function vnoise(x: number, z: number, s: number): number {
  const xi = Math.floor(x);
  const zi = Math.floor(z);
  const fx = x - xi;
  const fz = z - zi;
  const u = fx * fx * (3 - 2 * fx);
  const v = fz * fz * (3 - 2 * fz);
  const a = hash2(xi, zi, s);
  const b = hash2(xi + 1, zi, s);
  const c = hash2(xi, zi + 1, s);
  const d = hash2(xi + 1, zi + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x: number, z: number, oct: number, s: number): number {
  let sum = 0;
  let norm = 0;
  let a = 1;
  let f = 1;
  for (let i = 0; i < oct; i++) {
    sum += a * (vnoise(x * f, z * f, s + i * 17) * 2 - 1);
    norm += a;
    a *= 0.5;
    f *= 2.03;
  }
  return sum / norm;
}
const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const ridged = (x: number, z: number) => {
  let sum = 0;
  let a = 1;
  let f = 1 / 900;
  let norm = 0;
  for (let o = 0; o < 5; o++) {
    const n = 1 - Math.abs(fbm(x * f, z * f, 1, 5101 + o * 7));
    sum += a * n * n;
    norm += a;
    a *= 0.5;
    f *= 2.1;
  }
  return sum / norm;
};

/** A piece as the land has it: its region, how high its land starts (the land it touches, there),
 *  and which of its sides that is (a beach runs down from it to the sea). */
export interface Grown {
  def: GrowDef;
  region: Region;
  y: number;
  /** the side it's joined on: its outward normal (a beach's land falls away from it) */
  from: [number, number];
}

/** A piece's region: reached to its edges, drawn GROW_DRAWN past them. */
export function growRegion(d: GrowDef): Region {
  return {
    key: `grow:${d.key}`,
    biome: d.biome,
    reach: { kind: "rect", x0: d.x0, z0: d.z0, x1: d.x1, z1: d.z1 },
    drawn: { x0: d.x0 - GROW_DRAWN, z0: d.z0 - GROW_DRAWN, x1: d.x1 + GROW_DRAWN, z1: d.z1 + GROW_DRAWN },
  };
}

let GROWN: Grown[] = [];
/** How far past the land that's always there (x, z) is: a piece's land comes in only from there. */
let pastFixed: (x: number, z: number) => number = () => Number.POSITIVE_INFINITY;
/** The pieces as laid. */
export function grownNow(): readonly Grown[] {
  return GROWN;
}
/** Lays these pieces: `under(x, z)` the land's height as it'd be without any of them, `joined(x, z)`
 *  whether (x, z) is on the rest of the land (not this piece) — each piece's start read from where
 *  it meets that; `fixed(x, z)` how far past the land that's always there (x, z) is (over it, a
 *  piece changes nothing: today's town and the long road's band stay as they are). */
export function setGrown(
  defs: readonly GrowDef[],
  under: (x: number, z: number) => number,
  joined: (x: number, z: number) => boolean,
  fixed: (x: number, z: number) => number = () => Number.POSITIVE_INFINITY,
) {
  GROWN = [];
  pastFixed = fixed;
  GROWN = defs.map((def) => {
    const region = growRegion(def);
    // round its edge a sample every 16 m, just outside it: where that's the land, its height
    const sides: { n: [number, number]; pts: [number, number][] }[] = [
      { n: [0, -1], pts: [] },
      { n: [0, 1], pts: [] },
      { n: [-1, 0], pts: [] },
      { n: [1, 0], pts: [] },
    ];
    for (let x = def.x0 + 8; x < def.x1; x += 16) {
      sides[0].pts.push([x, def.z0 - 4]);
      sides[1].pts.push([x, def.z1 + 4]);
    }
    for (let z = def.z0 + 8; z < def.z1; z += 16) {
      sides[2].pts.push([def.x0 - 4, z]);
      sides[3].pts.push([def.x1 + 4, z]);
    }
    let sum = 0;
    let n = 0;
    let from: [number, number] = [0, -1];
    let most = 0;
    for (const s of sides) {
      const on = s.pts.filter(([x, z]) => joined(x, z));
      for (const [x, z] of on) sum += under(x, z);
      n += on.length;
      if (on.length > most) {
        most = on.length;
        from = s.n;
      }
    }
    return { def, region, y: n ? sum / n : under((def.x0 + def.x1) / 2, (def.z0 + def.z1) / 2), from };
  });
}

/** How far in from a rect's nearest edge (x, z) is (negative outside it). */
const inside = (r: Rect, x: number, z: number) => Math.min(x - r.x0, r.x1 - x, z - r.z0, r.z1 - z);

/** The piece (x, z) is the land of, and how much (0 at its edge or on the land that's always
 *  there, 1 from GROW_BLEND in from both) — the most-in when two meet. */
export function grownAt(x: number, z: number): { g: Grown; w: number } | null {
  let best: { g: Grown; w: number } | null = null;
  for (const g of GROWN) {
    const d = inside(g.def, x, z);
    if (d <= 0) continue;
    const w = smooth(0, GROW_BLEND, d);
    if (!best || w > best.w) best = { g, w };
  }
  if (!best) return null;
  const f = pastFixed(x, z);
  if (f < GROW_BLEND) best.w = Math.min(best.w, smooth(0, GROW_BLEND, f));
  return best.w > 0 ? best : null;
}

/** Across a piece from the side it's joined on: 0 there, 1 at the far side. */
function across(g: Grown, x: number, z: number): number {
  const { def, from } = g;
  if (from[0] < 0) return (x - def.x0) / (def.x1 - def.x0);
  if (from[0] > 0) return (def.x1 - x) / (def.x1 - def.x0);
  if (from[1] < 0) return (z - def.z0) / (def.z1 - def.z0);
  return (def.z1 - z) / (def.z1 - def.z0);
}
/** A lake piece's bowl: its middle and its radii (its shore, out to 1.3 of them and a wobble, is
 *  GROW_BLEND in from its sides: on its own land). */
export function lakeBowl(def: GrowDef): { cx: number; cz: number; rx: number; rz: number } {
  return {
    cx: (def.x0 + def.x1) / 2,
    cz: (def.z0 + def.z1) / 2,
    rx: Math.max(20, ((def.x1 - def.x0) / 2 - GROW_BLEND) / 1.3),
    rz: Math.max(20, ((def.z1 - def.z0) / 2 - GROW_BLEND) / 1.3),
  };
}
/** The lake's bowl: 0 its middle, 1 its shore (an ellipse, wobbly; its shore out to 1.3 inside the
 *  piece's own land, past where it's eased into what it meets). */
export function grownLakeR(g: Grown, x: number, z: number): number {
  const { cx, cz, rx, rz } = lakeBowl(g.def);
  const w = 1 + 0.08 * fbm(x / 90, z / 90, 3, 733);
  return Math.hypot((x - cx) / rx, (z - cz) / rz) / w;
}
/** Its water's level: the lake's at its start, the sea's a little under it. */
export function grownLevel(g: Grown): number {
  const lift = g.def.lift ?? 0;
  return g.def.biome === "beach" ? g.y + lift - 2 : g.y + lift - 0.4;
}
/** The canyon's line: where |noise| is small, a winding cut. */
const canyon = (x: number, z: number) => Math.abs(fbm(x / 520, z / 520, 3, 911));

/** The piece's own land at (x, z) (before it's eased in: grounds.ts lerps from the land under). */
export function grownLand(g: Grown, x: number, z: number): number {
  const y = g.y + (g.def.lift ?? 0);
  const k = g.def.key.length * 97;
  switch (g.def.biome) {
    case "meadow":
      return y + 2.5 * fbm(x / 160, z / 160, 3, 61 + k);
    case "farmland":
      return y + 0.8 * fbm(x / 220, z / 220, 2, 67 + k);
    case "forest":
      return y + 7 * fbm(x / 180, z / 180, 3, 71 + k);
    case "hills":
      return y + 26 * (0.5 + 0.5 * fbm(x / 260, z / 260, 4, 73 + k)) + 6 * fbm(x / 70, z / 70, 2, 79);
    case "mountains": {
      // (rising from its edge: the peaks from 150 m in)
      const d = smooth(80, 600, inside(g.def, x, z));
      return y + d * (60 + 520 * ridged(x + k, z) ** 1.4) + 8 * fbm(x / 60, z / 60, 2, 83);
    }
    case "lake": {
      const r = grownLakeR(g, x, z);
      const level = grownLevel(g);
      // (its bowl: down to 12 m at its middle, its shore up to the land at 1.3)
      const bed = level - 12 * (1 - Math.min(1, r) ** 2) - 0.6;
      // (its rim kept over its level: the water's held, not ending in a step on lower land)
      const land = y + 3 * fbm(x / 150, z / 150, 3, 89 + k);
      const rim = r < 1.6 ? Math.max(land, level + 0.6 * (1 - smooth(1.3, 1.6, r))) : land;
      return r < 1 ? bed : bed + (rim - bed) * smooth(1, 1.3, r);
    }
    case "beach": {
      // (from the land it's joined on down over the sand to the sea, a flat level at its far side)
      const t = across(g, x, z);
      const level = grownLevel(g);
      const dune = 1.5 * fbm(x / 40, z / 40, 2, 97 + k) * (1 - smooth(0.35, 0.6, t));
      return y + 1 + dune - (y + 1 - (level - 9)) * smooth(0.25, 0.85, t) ** 1.3;
    }
    case "desert": {
      // (flats with mesas stood up in steps, and a canyon cut through)
      const m = fbm(x / 340, z / 340, 3, 101 + k);
      const mesa = m > 0.25 ? 14 * Math.min(1, (m - 0.25) * 8) + (m > 0.45 ? 18 * Math.min(1, (m - 0.45) * 8) : 0) : 0;
      const cut = 34 * (1 - smooth(0.02, 0.07, canyon(x, z))) * smooth(120, 260, inside(g.def, x, z));
      return y + 2 * fbm(x / 90, z / 90, 2, 103) + mesa - cut;
    }
  }
}
/** How much small rough the land has here (grounds.ts micro's weight): little on the flats. */
export function grownMicro(g: Grown): number {
  return g.def.biome === "farmland" || g.def.biome === "beach" ? 0.2 : g.def.biome === "desert" ? 0.4 : 1;
}

/** Its trees' density (0–1) at (x, z), its height h and slope there. */
export function grownTrees(g: Grown, x: number, z: number, h: number, slope: number): number {
  const up = h - (g.y + (g.def.lift ?? 0));
  const clear = fbm(x / 200, z / 200, 3, 515) > 0.45 ? 0.1 : 1;
  switch (g.def.biome) {
    case "forest":
      return 0.88 * clear * (slope > 0.85 ? 0.15 : 1);
    case "meadow":
      return fbm(x / 60, z / 60, 2, 131) > 0.55 ? 0.5 : 0.02;
    case "hills":
      return (fbm(x / 120, z / 120, 3, 137) > 0.05 ? 0.6 : 0.05) * clear;
    case "mountains":
      // (the forest up to a treeline 260 m over its foot, ragged)
      return up > 260 + 60 * fbm(x / 300, z / 300, 2, 139) ? 0 : 0.75 * clear * (slope > 0.85 ? 0.15 : 1);
    case "lake":
      return grownLakeR(g, x, z) < 1.08 ? 0 : 0.55 * clear;
    case "farmland": {
      // (open fields and hedgerows along their edges every 120 m)
      const hx = Math.abs((((x % 120) + 120) % 120) - 60);
      const hz = Math.abs((((z % 160) + 160) % 160) - 80);
      return Math.max(hx, hz) > 58 ? 0.6 : 0;
    }
    case "beach":
      return across(g, x, z) < 0.2 ? 0.25 : 0;
    case "desert":
      // (dry scrub, here and there)
      return 0.02;
  }
}
/** Its ground: sand on the beach and the desert (its canyon's walls rock by their slope). */
export function grownSand(g: Grown): boolean {
  return g.def.biome === "beach" || g.def.biome === "desert";
}
/** Where it's warm (no snow lies, nothing freezes): the beach, the desert. */
export function grownWarm(g: Grown): boolean {
  return g.def.biome === "desert" || g.def.biome === "beach";
}
/** How much warmer (or colder) the air is on a piece than the weather's (°C): the beach mild, the
 *  desert hot by day and cold by night (`night` 0 day … 1 night), eased in from its edges. */
export function grownTemp(x: number, z: number, night: number): number {
  const g = grownAt(x, z);
  if (!g) return 0;
  if (g.g.def.biome === "desert") return g.w * (24 - 30 * night);
  if (g.g.def.biome === "beach") return g.w * 12;
  return 0;
}
