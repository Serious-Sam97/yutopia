import type { AreaDef, MapDef } from "./map.ts";

// The Grounds (docs/plan/27-the-grounds.md): the land round the headquarters
// made real — the campus, the woods inside the company's fence, the road out
// past the gatehouse and the company town across the river. Built from code,
// the same everywhere (the server's grid, both views, the site plan): nothing
// of it is stored or sent, only GROUNDS_VERSION.
//
// Units are tiles in the building's coords (the studio's corner at 0, 0; x
// east, z = map y south), the ground at y = 0 round the headquarters. A tile
// is about a metre: the Grounds are a kilometre across.

export const GROUNDS_VERSION = 1;
// Marks the chunk for `pnpm budget` (the client fetches it once the world starts).
export const GROUNDS_CHUNK = "yutopia-grounds";
export const CHUNK = 32;
export const GROUNDS = { x0: -480, z0: -624, x1: 544, z1: 208 };

export type P = [number, number];
export type Surface = "snow" | "deep" | "path" | "asphalt" | "walk" | "ice" | "floor" | "rock";

// ── noise (deterministic, no dependencies) ───────────────────────────────────
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
/** Fractal noise, −1..1. */
export function fbm(x: number, z: number, oct: number, s: number): number {
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
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
/** A seeded random for things placed by the Grounds (the same each time). */
export function groundsRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── lines: a centripetal-ish Catmull-Rom through the points, a sample a tile ──
function dense(pts: P[], closed = false, step = 1): P[] {
  const n = pts.length;
  const at = (i: number): P => (closed ? pts[(i + n) % n] : pts[Math.max(0, Math.min(n - 1, i))]);
  const out: P[] = [];
  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const p0 = at(i - 1);
    const p1 = at(i);
    const p2 = at(i + 1);
    const p3 = at(i + 2);
    const len = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
    const k = Math.max(1, Math.round(len / step));
    for (let j = 0; j < k; j++) {
      const t = j / k;
      const t2 = t * t;
      const t3 = t2 * t;
      const f = (a: number, b: number, c: number, d: number) =>
        0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  if (!closed) out.push(pts[n - 1]);
  return out;
}

// ── the site ─────────────────────────────────────────────────────────────────
export type WayKind = "driveway" | "road" | "street" | "trail" | "walk";
export interface Way {
  key: string;
  kind: WayKind;
  name: string;
  w: number;
  pts: P[];
  closed?: boolean;
  /** a sample a tile along it */
  line: P[];
  /** the height the way runs at, per sample (the land smoothed under it) */
  h: number[];
  /** per sample: on a bridge (the land under it isn't flattened) */
  bridged: boolean[];
}
export type BuildingKind =
  | "hq"
  | "block"
  | "gatehouse"
  | "boathouse"
  | "shed"
  | "shelter"
  | "shop"
  | "bar"
  | "diner"
  | "hotel"
  | "house"
  | "church"
  | "gas";
export interface Building {
  key: string;
  kind: BuildingKind;
  name: string;
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  floors: number;
  /** the side its door is on */
  face: "n" | "s" | "e" | "w";
  /** you can walk in (its ground floor is part of the Grounds) */
  enter?: boolean;
  /** what its sign says (town) */
  sign?: string;
  /** shut for good: boarded, dark */
  vacant?: boolean;
  /** its ground floor is the stored ground floor's (shared building.ts BLOCKS) */
  stored?: boolean;
}
export interface Lamp {
  x: number;
  z: number;
  ry: number; // which way its arm reaches (radians about y; 0 = +x)
  kind: "cobra" | "town" | "lone" | "porch";
}

const H = 36; // the studio's depth (the campus's own numbers: tp/campus.ts)
const W = 48;
// the parking lot (shared building.ts campusLot): x −56..−10, z −8..H + 12
export const LOT = { x0: -56, z0: -8, x1: -10, z1: H + 12 };
// the stored ground floor's rectangle (shared building.ts groundLevel and
// upgradeGround: the lobby, the lot and the blocks, GROUND_OFFSET −60, −10,
// 148 × 82): flat, at 0
export const SITE = { x0: -60, z0: -10, x1: 88, z1: 72 };
export const POND = { cx: -240, cz: -60, rx: 48, rz: 34 };
export const TOWER = { x: -34, z: -96 };
export const STATUE = { x: 420, z: -386 };
export const BENCH = { x: 120, z: -250 };
export const GATE = { x: -40, z: -360 };
export const TOWN = { x0: 296, z0: -560, x1: 536, z1: -366 };
export const PLAZA = { x0: 400, z0: -398, x1: 440, z1: -370 };
/** The cars parked along Main Street (z −405): kerbside both ways, none across
 *  the square's side or the crossing at x 420. `colour` indexes building.ts
 *  CAR_COLOURS; `dir` 1 noses east, −1 west. Both views draw them, they block. */
export const TOWN_CARS: {
  x: number;
  z: number;
  dir: 1 | -1;
  wagon: boolean;
  colour: number;
  snowy: boolean;
  tilt: number;
}[] = (() => {
  const r = groundsRng(4242);
  const out: (typeof TOWN_CARS)[number][] = [];
  for (let x = 306; x < 520; x += 6.5 + r() * 8) {
    for (const s of [1, -1] as const) {
      if (r() < 0.45) continue;
      if (x > PLAZA.x0 - 3 && x < PLAZA.x1 + 3 && s > 0) continue;
      if (Math.abs(x - 420) < 6) continue;
      const wagon = r() < 0.3;
      const colour = Math.floor(r() * 8);
      const snowy = r() < 0.7;
      out.push({ x, z: -405 + s * 3.6, dir: s, wagon, colour, snowy, tilt: (r() - 0.5) * 0.03 });
    }
  }
  return out;
})();
/** On a parked car in town (its 5 × 2 body). */
function onTownCar(x: number, z: number): boolean {
  if (z < -411 || z > -399 || x < 300 || x > 526) return false;
  for (const c of TOWN_CARS) if (Math.abs(x - c.x) < 2.5 && Math.abs(z - c.z) < 1) return true;
  return false;
}
/** The company's fence (a closed line; the gate where the driveway goes through). */
export const FENCE: P[] = [
  [-400, -360],
  [220, -360],
  [220, 170],
  [-400, 170],
];
// where the lawn round the headquarters ends (no trees inside)
const LAWN = { cx: 10, cz: -14, rx: 140, rz: 125 };
const CLEARING = { x: BENCH.x, z: BENCH.z, r: 15 };
// flat ground where things are built: the campus and the town
const FLATS = [
  { x: 10, z: 10, r0: 150, r1: 240, h: 0 },
  { x: 418, z: -450, r0: 120, r1: 190, h: 1.5 },
];

function way(key: string, kind: WayKind, name: string, w: number, pts: P[], closed = false): Way {
  return { key, kind, name, w, pts, closed, line: dense(pts, closed), h: [], bridged: [] };
}

export const WAYS: Way[] = [
  // from the lot's mouth up through the woods to the gatehouse
  way("driveway", "driveway", "Driveway", 7, [
    [-48, -9],
    [-40, -50],
    [-14, -100],
    [-20, -150],
    [-60, -200],
    [-70, -250],
    [-50, -300],
    [-40, -340],
    [-40, -366],
  ]),
  // the public road: out of the gate, east, over the river to the town
  way("road", "road", "County road", 8, [
    [-40, -366],
    [-40, -392],
    [-26, -404],
    [40, -410],
    [140, -400],
    [230, -404],
    [300, -405],
  ]),
  way("main", "street", "Main Street", 10, [
    [300, -405],
    [420, -405],
    [536, -405],
  ]),
  way("church-st", "street", "Church Street", 8, [
    [420, -410],
    [420, -470],
    [420, -524],
  ]),
  // the courtyard: from the headquarters' east doors to the east block's
  way("court", "walk", "Courtyard", 4, [
    [W, 18],
    [60, 18],
  ]),
  // trails through the woods (packed snow)
  way(
    "pond-loop",
    "trail",
    "Pond loop",
    2.4,
    [
      [-188, -34],
      [-190, -74],
      [-214, -108],
      [-256, -116],
      [-300, -94],
      [-308, -54],
      [-284, -14],
      [-238, -8],
      [-198, -20],
    ],
    true,
  ),
  way("to-pond", "trail", "Pond trail", 2.4, [
    [-57, 22],
    [-110, 14],
    [-160, -6],
    [-188, -34],
  ]),
  way("ravine", "trail", "Ravine trail", 2.4, [
    [-256, -116],
    [-262, -160],
    [-263, -200],
    [-262, -236],
    [-258, -266],
    [-230, -302],
    [-160, -320],
    [-100, -314],
    [-54, -300],
  ]),
  way("clearing", "trail", "Clearing trail", 2.4, [
    [-16, -152],
    [40, -182],
    [96, -228],
    [116, -244],
    [150, -238],
    [170, -206],
    [164, -130],
    [120, -70],
    [92, -40],
    [74, -32],
  ]),
  way("south-woods", "trail", "South woods", 2.4, [
    [24, 74],
    [-30, 104],
    [-100, 120],
    [-148, 124],
    [-210, 80],
    [-248, 30],
    [-282, -12],
  ]),
];

export const RIVER = {
  w: 22,
  pts: [
    [262, -624],
    [256, -540],
    [266, -460],
    [262, -400],
    [252, -320],
    [262, -220],
    [250, -100],
    [258, 40],
    [262, 208],
  ] as P[],
  line: [] as P[],
  h: [] as number[],
};
RIVER.line = dense(RIVER.pts);
export const RAVINE = {
  w: 18,
  depth: 9,
  pts: [
    [-410, -306],
    [-340, -264],
    [-262, -236],
    [-200, -206],
    [-150, -172],
    [-118, -150],
  ] as P[],
  line: [] as P[],
};
RAVINE.line = dense(RAVINE.pts);

// ── the buildings ────────────────────────────────────────────────────────────
const b = (
  key: string,
  kind: BuildingKind,
  name: string,
  x0: number,
  z0: number,
  x1: number,
  z1: number,
  floors: number,
  face: Building["face"],
  extra: Partial<Building> = {},
): Building => ({ key, kind, name, x0, z0, x1, z1, floors, face, ...extra });

export const BUILDINGS: Building[] = [
  b("hq", "hq", "Headquarters", 0, 0, W, H, 5, "w", { enter: true }),
  // (their ground floors are the ground floor's own: shared building.ts BLOCKS)
  b("east", "block", "East block", 60, -10, 88, H + 12, 5, "w", { enter: true, stored: true }),
  b("south", "block", "South block", -4, H + 12, W + 2, H + 36, 5, "n", { enter: true, stored: true }),
  b("gatehouse", "gatehouse", "Gatehouse", -34, -367, -29, -361, 1, "w", { enter: true }),
  b("boathouse", "boathouse", "Boathouse", -262, -108, -248, -98, 1, "s"),
  b("shed", "shed", "Grounds shed", -162, 110, -148, 120, 1, "n"),
  b("shelter", "shelter", "Bus shelter", -16, -417, -10, -413, 1, "s"),
  // the town: Main Street, south side
  b("gas", "gas", "Gas station", 306, -396, 328, -380, 1, "n", { sign: "GAS" }),
  b("diner", "diner", "Diner", 336, -398, 354, -384, 1, "n", { enter: true, sign: "DINER" }),
  b("market", "shop", "Market", 358, -398, 374, -382, 2, "n", { enter: true, sign: "MARKET" }),
  b("books", "shop", "Bookshop", 378, -398, 392, -384, 2, "n", { sign: "BOOKS" }),
  b("bar", "bar", "Bar", 448, -398, 464, -382, 2, "n", { enter: true, sign: "BAR" }),
  b("hardware", "shop", "Hardware", 468, -398, 482, -384, 2, "n", { sign: "HARDWARE" }),
  b("vacant", "shop", "Shut shop", 486, -398, 500, -384, 2, "n", { vacant: true }),
  // north side
  b("post", "shop", "Post office", 338, -428, 354, -412, 1, "s", { sign: "POST OFFICE" }),
  b("laundry", "shop", "Laundromat", 358, -426, 372, -412, 1, "s", { sign: "LAUNDRY" }),
  b("hall", "shop", "Town hall", 378, -432, 404, -412, 2, "s", { sign: "TOWN HALL" }),
  b("hotel", "hotel", "Hotel", 432, -434, 452, -412, 3, "s", { sign: "HOTEL" }),
  b("bakery", "shop", "Bakery", 458, -426, 472, -412, 2, "s", { sign: "BAKERY" }),
  b("church", "church", "Church", 410, -556, 430, -534, 1, "s"),
];
// two rows of the same townhouse up Church Street
for (let k = 0; k < 7; k++) {
  const z1 = -440 - k * 10;
  BUILDINGS.push(b(`house-w${k}`, "house", "Townhouse", 404, z1 - 8, 414, z1, 2, "e"));
  BUILDINGS.push(b(`house-e${k}`, "house", "Townhouse", 426, z1 - 8, 436, z1, 2, "w"));
}

// ── the index: the lines' samples by cell, for "what's near here" ────────────
const CELL = 28;
interface Sample {
  x: number;
  z: number;
  f: number; // which line: 0..WAYS.length-1 the ways, then the river, the ravine
  i: number; // which sample
}
const RIVER_F = WAYS.length;
const RAVINE_F = WAYS.length + 1;
const cells = new Map<number, Sample[]>();
const cellKey = (cx: number, cz: number) => cx * 4096 + cz;
function indexLine(line: P[], f: number) {
  for (const [i, [x, z]] of line.entries()) {
    const k = cellKey(Math.floor(x / CELL), Math.floor(z / CELL));
    const l = cells.get(k) ?? [];
    cells.set(k, l);
    l.push({ x, z, f, i });
  }
}
for (const [f, w] of WAYS.entries()) indexLine(w.line, f);
indexLine(RIVER.line, RIVER_F);
indexLine(RAVINE.line, RAVINE_F);
const bCells = new Map<number, Building[]>();
for (const bd of BUILDINGS)
  for (let cx = Math.floor((bd.x0 - 8) / CELL); cx <= Math.floor((bd.x1 + 8) / CELL); cx++)
    for (let cz = Math.floor((bd.z0 - 8) / CELL); cz <= Math.floor((bd.z1 + 8) / CELL); cz++) {
      const k = cellKey(cx, cz);
      const l = bCells.get(k) ?? [];
      bCells.set(k, l);
      l.push(bd);
    }

/** The nearest sample of every line within ~a cell of (x, z): distance and sample. */
function nearLines(x: number, z: number): Map<number, { d: number; i: number }> {
  const out = new Map<number, { d: number; i: number }>();
  const cx = Math.floor(x / CELL);
  const cz = Math.floor(z / CELL);
  for (let dx = -1; dx <= 1; dx++)
    for (let dz = -1; dz <= 1; dz++) {
      const l = cells.get(cellKey(cx + dx, cz + dz));
      if (!l) continue;
      for (const s of l) {
        const d = Math.hypot(s.x - x, s.z - z);
        const o = out.get(s.f);
        if (!o || d < o.d) out.set(s.f, { d, i: s.i });
      }
    }
  return out;
}
function nearBuildings(x: number, z: number): Building[] {
  return bCells.get(cellKey(Math.floor(x / CELL), Math.floor(z / CELL))) ?? [];
}
const rectDist = (r: { x0: number; z0: number; x1: number; z1: number }, x: number, z: number) =>
  Math.hypot(Math.max(r.x0 - x, 0, x - r.x1), Math.max(r.z0 - z, 0, z - r.z1));

// ── the land ─────────────────────────────────────────────────────────────────
/** How far (x, z) is beyond the land you can reach: the ridges rise there. */
function beyond(x: number, z: number): number {
  return Math.max(-400 - x, z - 172, -580 - z, x - 528, 0);
}
function macro(x: number, z: number): number {
  let m = 6 * fbm(x / 170, z / 170, 2, 11);
  for (const f of FLATS) m = f.h + (m - f.h) * smooth(f.r0, f.r1, Math.hypot(x - f.x, z - f.z));
  const o = beyond(x, z);
  if (o > 0) m += 40 * (1 - Math.exp(-((o / 60) ** 2))) * (0.7 + 0.6 * vnoise(x / 70, z / 70, 41));
  return m;
}
function inLawn(x: number, z: number): number {
  const wob = 1 + 0.12 * fbm(x / 40, z / 40, 2, 5);
  return ((x - LAWN.cx) / (LAWN.rx * wob)) ** 2 + ((z - LAWN.cz) / (LAWN.rz * wob)) ** 2;
}
function microWeight(x: number, z: number): number {
  const lawn = 0.35 + 0.65 * smooth(0.7, 1.2, inLawn(x, z));
  const town = smooth(100, 170, Math.hypot(x - 418, z + 450));
  return lawn * (0.15 + 0.85 * town);
}
function micro(x: number, z: number): number {
  return 1.5 * fbm(x / 38, z / 38, 3, 21) + 0.3 * fbm(x / 9, z / 9, 1, 31);
}
/** The land before anything is built on it. */
function base(x: number, z: number): number {
  return macro(x, z) + micro(x, z) * microWeight(x, z);
}

// the ways' heights: the land under them, smoothed along them
for (const w of WAYS) {
  const raw = w.line.map(([x, z]) => macro(x, z));
  const n = raw.length;
  w.h = raw.map((_, i) => {
    let s = 0;
    let c = 0;
    for (let j = Math.max(0, i - 10); j <= Math.min(n - 1, i + 10); j++) {
      s += raw[j];
      c++;
    }
    return s / c;
  });
  w.bridged = w.line.map(() => false);
}
RIVER.h = RIVER.line.map(([x, z]) => macro(x, z) - 2.6);
// bridges: where a way crosses the river or the ravine
for (const w of WAYS)
  for (const [i, [x, z]] of w.line.entries()) {
    const n = nearLines(x, z);
    const r = n.get(RIVER_F);
    const v = n.get(RAVINE_F);
    if ((r && r.d < RIVER.w / 2 + 6) || (v && v.d < RAVINE.w / 2 + 1.5)) w.bridged[i] = true;
  }
/** The deck's height where a way is bridged (the river's: the banks either side). */
export const POND_LEVEL = macro(POND.cx, POND.cz) - 1.1;

/** The land's height at (x, z) (tiles up), with what's built on it carved and flattened. */
export function terrainAt(x: number, z: number): number {
  let h = base(x, z);
  // the pond: ice at its level, the banks down to it
  const e = ((x - POND.cx) / POND.rx) ** 2 + ((z - POND.cz) / POND.rz) ** 2;
  if (e < 2) h = lerp(POND_LEVEL, h, smooth(1, 1.9, e));
  const near = nearLines(x, z);
  // the river: ice in its bed, banks either side
  const r = near.get(RIVER_F);
  if (r) h = lerp(RIVER.h[r.i], h, smooth(RIVER.w / 2, RIVER.w / 2 + 14, r.d));
  // the ravine: a cut with a flat icy floor
  const v = near.get(RAVINE_F);
  if (v && v.d < RAVINE.w / 2) {
    const t = v.d / (RAVINE.w / 2);
    h -= RAVINE.depth * Math.min(1, (1 - t * t) * 1.5);
  }
  // the ways: the land flattened to their height, eased in from their verges
  let best = 1;
  let target = h;
  for (const [f, n] of near) {
    if (f >= WAYS.length) continue;
    const w = WAYS[f];
    if (w.bridged[n.i]) continue;
    const r0 = w.w / 2 + 1.2;
    const k = smooth(r0, r0 + (w.kind === "trail" ? 3 : 8), n.d);
    if (k < best) {
      best = k;
      target = w.h[n.i];
    }
  }
  // the buildings' pads (and the lot's)
  const pads: { x0: number; z0: number; x1: number; z1: number; h: number }[] = nearBuildings(x, z).map((bd) => ({
    ...bd,
    h: macro((bd.x0 + bd.x1) / 2, (bd.z0 + bd.z1) / 2),
  }));
  if (x > SITE.x0 - 12 && x < SITE.x1 + 12 && z > SITE.z0 - 12 && z < SITE.z1 + 12) pads.push({ ...SITE, h: 0 });
  if (x > PLAZA.x0 - 8 && x < PLAZA.x1 + 8 && z > PLAZA.z0 - 8 && z < PLAZA.z1 + 8)
    pads.push({ ...PLAZA, h: macro(STATUE.x, STATUE.z) });
  for (const p of pads) {
    const k = smooth(0.5, 7, rectDist(p, x, z));
    if (k < best) {
      best = k;
      target = p.h;
    }
  }
  return lerp(target, h, best);
}

/** Where a body stands at (x, z): the land, or a bridge's deck over it. */
export function groundAt(x: number, z: number): number {
  for (const [f, n] of nearLines(x, z)) {
    if (f >= WAYS.length) continue;
    const w = WAYS[f];
    if (w.bridged[n.i] && n.d < w.w / 2) return w.h[n.i];
  }
  return terrainAt(x, z);
}

/** What the ground is at (x, z). `rough`: no rock (its slope needs the chunk underfoot: far off, don't). */
export function groundSurfaceAt(x: number, z: number, rough = false): Surface {
  for (const bd of nearBuildings(x, z)) if (x >= bd.x0 && x < bd.x1 && z >= bd.z0 && z < bd.z1) return "floor";
  const near = nearLines(x, z);
  let on: Surface | null = null;
  for (const [f, n] of near) {
    if (f >= WAYS.length) continue;
    const w = WAYS[f];
    if (n.d < w.w / 2) {
      const s: Surface = w.kind === "trail" ? "path" : w.kind === "walk" ? "walk" : "asphalt";
      if (!on || s === "asphalt") on = s;
    } else if (w.kind === "street" && n.d < w.w / 2 + 2.6 && !on) on = "walk"; // the town's pavements
  }
  if (on) return on;
  if (x >= LOT.x0 && x < LOT.x1 && z >= LOT.z0 && z < LOT.z1) return "asphalt";
  if (x >= PLAZA.x0 && x < PLAZA.x1 && z >= PLAZA.z0 && z < PLAZA.z1) return "walk";
  if (((x - POND.cx) / POND.rx) ** 2 + ((z - POND.cz) / POND.rz) ** 2 < 1) return "ice";
  const r = near.get(RIVER_F);
  if (r && r.d < RIVER.w / 2) return "ice";
  if (!rough && slopeAt(x, z) > 0.85) return "rock";
  return treeDensity(x, z) > 0.3 ? "deep" : "snow";
}

/** Inside the company's fence. */
export function insideFence(x: number, z: number): boolean {
  return x > -400 && x < 220 && z > -360 && z < 170;
}

/** How thick the woods are at (x, z), 0..1 (0: kept clear). */
export function treeDensity(x: number, z: number): number {
  if (x < GROUNDS.x0 || x > GROUNDS.x1 || z < GROUNDS.z0 || z > GROUNDS.z1) return 0;
  const lawn = inLawn(x, z);
  if (lawn < 1) return 0;
  if (Math.hypot(x - CLEARING.x, z - CLEARING.z) < CLEARING.r) return 0;
  for (const bd of nearBuildings(x, z)) if (rectDist(bd, x, z) < 5) return 0;
  if (((x - POND.cx) / POND.rx) ** 2 + ((z - POND.cz) / POND.rz) ** 2 < 1.3) return 0;
  const near = nearLines(x, z);
  for (const [f, n] of near) {
    if (f === RAVINE_F) {
      if (n.d < RAVINE.w / 2 - 1) return 0.12;
      continue;
    }
    if (f === RIVER_F) {
      if (n.d < RIVER.w / 2 + 3) return 0;
      continue;
    }
    const w = WAYS[f];
    if (n.d < w.w / 2 + (w.kind === "trail" ? 3.2 : 4.5)) return 0;
  }
  // the town: a yard tree here and there, none on the streets or the plaza
  if (x > TOWN.x0 && x < TOWN.x1 && z > TOWN.z0 && z < TOWN.z1)
    return x > PLAZA.x0 - 4 && x < PLAZA.x1 + 4 && z > PLAZA.z0 - 4 && z < PLAZA.z1 + 4 ? 0 : 0.04;
  // along the fence: a cleared strip each side
  if (Math.abs(x + 400) < 3 || Math.abs(x - 220) < 3 || Math.abs(z + 360) < 3 || Math.abs(z - 170) < 3) {
    if (x >= -403 && x <= 223 && z >= -363 && z <= 173) return 0;
  }
  const edge = smooth(1, 1.5, lawn); // thinner at the lawn's edge
  const patch = 0.5 + 0.5 * fbm(x / 60, z / 60, 2, 61); // groves and glades
  const o = beyond(x, z);
  return Math.min(0.95, (0.25 + 0.7 * patch) * edge + (o > 0 ? 0.3 : 0));
}

export type TreeKind = "pine" | "birch" | "bare";
export interface Tree {
  x: number;
  z: number;
  y: number;
  kind: TreeKind;
  s: number; // scale
  ry: number;
}
const TREE_CELL = 3.2;
/** The trees in a chunk (cx, cz: chunk coords, CHUNK tiles each). */
export function treesIn(cx: number, cz: number): Tree[] {
  const out: Tree[] = [];
  const x0 = cx * CHUNK;
  const z0 = cz * CHUNK;
  for (let i = Math.ceil(x0 / TREE_CELL); i * TREE_CELL < x0 + CHUNK; i++)
    for (let j = Math.ceil(z0 / TREE_CELL); j * TREE_CELL < z0 + CHUNK; j++) {
      const r = groundsRng(Math.imul(i, 92821) ^ Math.imul(j, 68917) ^ 0x51ed);
      const x = (i + 0.15 + r() * 0.7) * TREE_CELL;
      const z = (j + 0.15 + r() * 0.7) * TREE_CELL;
      const d = treeDensity(x, z);
      if (r() >= d) continue;
      // birches by the water, pines in the deep woods, a few dead ones
      const nearWater = ((x - POND.cx) / POND.rx) ** 2 + ((z - POND.cz) / POND.rz) ** 2 < 4 || Math.abs(x - 260) < 50;
      const q = r();
      const kind: TreeKind = q < (nearWater ? 0.45 : 0.2) ? "birch" : q > 0.9 ? "bare" : "pine";
      out.push({ x, z, y: terrainAt(x, z), kind, s: 0.72 + r() * 0.62, ry: r() * Math.PI * 2 });
    }
  return out;
}

// ── lamps ────────────────────────────────────────────────────────────────────
export const LAMPS: Lamp[] = [];
{
  const along = (w: Way, every: number, both: boolean, kind: Lamp["kind"], from = 0) => {
    let side = 1;
    for (let i = from; i < w.line.length - 2; i += every) {
      const [x, z] = w.line[i];
      const [x2, z2] = w.line[i + 1];
      const len = Math.hypot(x2 - x, z2 - z) || 1;
      const tx = (x2 - x) / len;
      const tz = (z2 - z) / len;
      for (const s of both ? [1, -1] : [side]) {
        // (the post on the verge; its arm reaches back over the road)
        const nx = -tz * s;
        const nz = tx * s;
        const off = w.w / 2 + (kind === "town" ? 1.6 : 1.4);
        LAMPS.push({ x: x + nx * off, z: z + nz * off, ry: Math.atan2(nz, -nx), kind });
      }
      side = -side;
    }
  };
  const byKey = (k: string) => WAYS.find((w) => w.key === k) as Way;
  along(byKey("driveway"), 30, false, "cobra", 70);
  along(byKey("main"), 22, true, "town", 6);
  along(byKey("church-st"), 22, true, "town", 12);
  LAMPS.push({ x: BENCH.x + 2.2, z: BENCH.z - 1.4, ry: Math.PI, kind: "lone" });
  LAMPS.push({ x: -36, z: -370, ry: Math.PI, kind: "cobra" }); // the gate's
  LAMPS.push({ x: -255, z: -97.4, ry: 0, kind: "porch" }); // the boathouse's
  LAMPS.push({ x: -13, z: -412, ry: 0, kind: "porch" }); // the bus shelter's
}

/** Where the barrier closes the road at the edge of the world (east, past the town). */
export const ROAD_CLOSED = { x: 528, z: -405 };

// ── the Grounds underfoot: chunks of heights and walkable tiles ─────────────
// What the ground floor's grid reads beyond its stored tiles (shared grid.ts
// Outdoors): the height where you stand (a bridge's deck over the river), and
// which tiles you can walk on. Made a chunk at a time when first asked, kept.
const LAT = 2; // height samples a tile
const LN = CHUNK * LAT + 1;
export interface GroundsChunk {
  cx: number;
  cz: number;
  /** heights, (CHUNK·LAT + 1)², row by row (z), a sample every 1/LAT tile */
  h: Float32Array;
  /** walkable tiles, CHUNK², row by row */
  walk: Uint8Array;
  trees: Tree[];
}
const chunks = new Map<number, GroundsChunk>();
const chunkKey = (cx: number, cz: number) => (cx + 2048) * 4096 + (cz + 2048);

/** The chunk (cx, cz) (CHUNK tiles a side, building coords / CHUNK). */
export function groundsChunk(cx: number, cz: number): GroundsChunk {
  const k = chunkKey(cx, cz);
  const hit = chunks.get(k);
  if (hit) return hit;
  const c = makeChunk(cx, cz);
  chunks.set(k, c);
  return c;
}
/** A chunk made elsewhere (a worker) put in the cache. */
export function adoptChunk(c: GroundsChunk): void {
  chunks.set(chunkKey(c.cx, c.cz), c);
}
export function hasChunk(cx: number, cz: number): boolean {
  return chunks.has(chunkKey(cx, cz));
}
/** A chunk round (cx, cz) not made yet (it, or one of its eight neighbours: its
 *  slopes reach into them), or null. Drawing makes them one a frame first. */
export function missingLand(cx: number, cz: number): [number, number] | null {
  for (let dz = -1; dz <= 1; dz++)
    for (let dx = -1; dx <= 1; dx++) if (!chunks.has(chunkKey(cx + dx, cz + dz))) return [cx + dx, cz + dz];
  return null;
}

function makeChunk(cx: number, cz: number): GroundsChunk {
  const x0 = cx * CHUNK;
  const z0 = cz * CHUNK;
  const h = new Float32Array(LN * LN);
  for (let j = 0; j < LN; j++) for (let i = 0; i < LN; i++) h[j * LN + i] = terrainAt(x0 + i / LAT, z0 + j / LAT);
  const walk = new Uint8Array(CHUNK * CHUNK);
  const trees = treesIn(cx, cz);
  const blocked = new Set<number>();
  const shut = (x: number, z: number) => {
    const i = Math.floor(x) - x0;
    const j = Math.floor(z) - z0;
    if (i >= 0 && j >= 0 && i < CHUNK && j < CHUNK) blocked.add(j * CHUNK + i);
  };
  for (const t of trees) shut(t.x, t.z);
  for (const l of LAMPS) if (l.kind !== "porch") shut(l.x, l.z);
  shut(BENCH.x, BENCH.z);
  shut(BENCH.x + 1, BENCH.z);
  for (let j = 0; j < CHUNK; j++)
    for (let i = 0; i < CHUNK; i++) {
      const x = x0 + i + 0.5;
      const z = z0 + j + 0.5;
      // the tile's own slope, from its corners' heights
      const at = (a: number, b: number) => h[(j * LAT + b) * LN + i * LAT + a];
      let lo = Number.POSITIVE_INFINITY;
      let hi = Number.NEGATIVE_INFINITY;
      for (let b = 0; b <= LAT; b++)
        for (let a = 0; a <= LAT; a++) {
          const v = at(a, b);
          if (v < lo) lo = v;
          if (v > hi) hi = v;
        }
      // (a bridge's deck: walkable whatever's under it)
      const deck = deckAt(x, z) !== null;
      walk[j * CHUNK + i] = !blocked.has(j * CHUNK + i) && (deck || hi - lo < 0.9) && walkable(x, z) ? 1 : 0;
    }
  return { cx, cz, h, walk, trees };
}

/** Can you stand on the tile whose middle is (x, z)? (Its slope aside: the chunk checks that.) */
function walkable(x: number, z: number): boolean {
  if (x < GROUNDS.x0 + 2 || x > GROUNDS.x1 - 2 || z < GROUNDS.z0 + 2 || z > GROUNDS.z1 - 2) return false;
  if (beyond(x, z) > 24) return false;
  for (const bd of nearBuildings(x, z))
    if (bd.kind !== "hq" && x >= bd.x0 && x < bd.x1 && z >= bd.z0 && z < bd.z1)
      // (inside one you walk into: its floor, round its furniture)
      return !!insideOf(bd) && !FIT_TILES.has(`${Math.floor(x)},${Math.floor(z)}`);
  if (onFence(x, z) || onTownCar(x, z)) return false;
  // the water tower: its stem, and the fence round it (a gap to the south)
  const td = Math.hypot(x - TOWER.x, z - TOWER.z);
  if (td < 2.6) return false;
  if (Math.abs(td - 9) < 0.6 && !(z > TOWER.z && Math.abs(x - TOWER.x) < 1.5)) return false;
  if (Math.abs(x - STATUE.x) < 2.5 && Math.abs(z - STATUE.z) < 2.5) return false;
  return true;
}
/** On the company's fence line (not at the gate). */
function onFence(x: number, z: number): boolean {
  for (let i = 0; i < FENCE.length; i++) {
    const [ax, az] = FENCE[i];
    const [bx, bz] = FENCE[(i + 1) % FENCE.length];
    const vert = ax === bx;
    if (vert ? Math.abs(x - ax) < 0.6 && z > Math.min(az, bz) - 0.6 && z < Math.max(az, bz) + 0.6 : false) return true;
    if (!vert && Math.abs(z - az) < 0.6 && x > Math.min(ax, bx) - 0.6 && x < Math.max(ax, bx) + 0.6)
      return !(Math.abs(z - GATE.z) < 1 && x > GATE.x - 5 && x < GATE.x + 3); // the gate: the road's way through
  }
  return false;
}

/** Where you stand at (x, z): the land (or a bridge's deck), from the chunks. */
export function heightAt(x: number, z: number): number {
  const deck = deckAt(x, z);
  if (deck !== null) return deck;
  return landAt(x, z);
}
/** The land's height from the chunks (no bridges). */
export function landAt(x: number, z: number): number {
  const cx = Math.floor(x / CHUNK);
  const cz = Math.floor(z / CHUNK);
  const c = groundsChunk(cx, cz);
  const u = (x - cx * CHUNK) * LAT;
  const v = (z - cz * CHUNK) * LAT;
  const i = Math.min(LN - 2, Math.max(0, Math.floor(u)));
  const j = Math.min(LN - 2, Math.max(0, Math.floor(v)));
  const fu = u - i;
  const fv = v - j;
  const a = c.h[j * LN + i];
  const b = c.h[j * LN + i + 1];
  const d = c.h[(j + 1) * LN + i];
  const e = c.h[(j + 1) * LN + i + 1];
  return a + (b - a) * fu + (d - a) * fv + (a - b - d + e) * fu * fv;
}
/** How steep it is at (x, z) (rise a tile). */
export function slopeAt(x: number, z: number): number {
  return Math.hypot(heightAt(x + 0.5, z) - heightAt(x - 0.5, z), heightAt(x, z + 0.5) - heightAt(x, z - 0.5));
}
/** Can you walk on tile (tx, tz) (building coords)? */
export function walkableTile(tx: number, tz: number): boolean {
  const cx = Math.floor(tx / CHUNK);
  const cz = Math.floor(tz / CHUNK);
  return groundsChunk(cx, cz).walk[(tz - cz * CHUNK) * CHUNK + (tx - cx * CHUNK)] === 1;
}

/** The ground floor's outdoors (shared grid.ts Outdoors), for a floor whose
 *  corner is at (ox, oy) in the building's coords. */
export function outdoorsAt(
  ox: number,
  oy: number,
): {
  walkable(tx: number, ty: number): boolean;
  height(x: number, y: number): number;
  speed(x: number, y: number): number;
  edge(dir: "h" | "v", x: number, y: number): boolean;
} {
  return {
    walkable: (tx, ty) => walkableTile(tx + ox, ty + oy),
    height: (x, y) => heightAt(x + ox, y + oy),
    speed: (x, y) => speedOn(surfaceTileAt(Math.floor(x + ox), Math.floor(y + oy))),
    edge: (dir, x, y) => wallEdgeAt(dir, x + ox, y + oy),
  };
}

/** How fast you go on a surface (1: a floor). */
export function speedOn(s: Surface): number {
  return s === "deep" ? 0.6 : s === "snow" ? 0.85 : s === "rock" ? 0.7 : 1;
}

// a tile's surface (kept: walking asks every frame)
const surfaces = new Map<number, Uint8Array>();
const SURFACES: Surface[] = ["snow", "deep", "path", "asphalt", "walk", "ice", "floor", "rock"];
/** What the tile (tx, tz) (building coords) is. */
export function surfaceTileAt(tx: number, tz: number): Surface {
  const cx = Math.floor(tx / CHUNK);
  const cz = Math.floor(tz / CHUNK);
  const k = chunkKey(cx, cz);
  let a = surfaces.get(k);
  if (!a) {
    a = new Uint8Array(CHUNK * CHUNK).fill(255);
    surfaces.set(k, a);
  }
  const i = (tz - cz * CHUNK) * CHUNK + (tx - cx * CHUNK);
  if (a[i] === 255) a[i] = SURFACES.indexOf(groundSurfaceAt(tx + 0.5, tz + 0.5));
  return SURFACES[a[i]];
}
/** The Grounds round a building's ground floor (for shared grid.ts setOutdoors):
 *  level 0 of a map with floors; nothing for any other floor or a lone map. */
export function groundsOutdoors(map: MapDef): ReturnType<typeof outdoorsAt> | null {
  if ((map.floor ?? 0) !== 0 || !map.levels?.length) return null;
  return outdoorsAt(map.ox ?? 0, map.oy ?? 0);
}

// the bridges' decks: the bridged samples of the ways, boxed for a quick "not here"
const DECKS = WAYS.flatMap((w) => {
  const idx = w.line.map((_, i) => i).filter((i) => w.bridged[i]);
  if (!idx.length) return [];
  const xs = idx.map((i) => w.line[i][0]);
  const zs = idx.map((i) => w.line[i][1]);
  const m = w.w / 2 + 0.5;
  return [{ w, x0: Math.min(...xs) - m, x1: Math.max(...xs) + m, z0: Math.min(...zs) - m, z1: Math.max(...zs) + m }];
});
/** A bridge's deck height at (x, z), or null (not on one). */
export function deckAt(x: number, z: number): number | null {
  for (const d of DECKS) {
    if (x < d.x0 || x > d.x1 || z < d.z0 || z > d.z1) continue;
    const { w } = d;
    let best = -1;
    let bd = Number.POSITIVE_INFINITY;
    for (let i = 0; i < w.line.length; i++) {
      if (!w.bridged[i]) continue;
      const dd = Math.hypot(w.line[i][0] - x, w.line[i][1] - z);
      if (dd < bd) {
        bd = dd;
        best = i;
      }
    }
    if (best >= 0 && bd < w.w / 2) return w.h[best] + 0.35;
  }
  return null;
}

// ── inside: the town's bar, diner and market, the gatehouse (phase 4) ────────
// Their ground floors are the Grounds' own (code, not stored): walls round
// them with a doorway on the street, a floor, the furniture. Private rooms:
// everyone inside hears everyone inside, nobody outside.
export type FitKind =
  | "counter"
  | "stool"
  | "table"
  | "chair"
  | "shelf"
  | "booth"
  | "fridge"
  | "jukebox"
  | "till"
  | "desk"
  | "screens";
export interface Fit {
  kind: FitKind;
  x: number;
  z: number;
  w: number;
  d: number;
  h: number; // tiles up
  solid: boolean;
}
export interface Inside {
  b: Building;
  floor: string; // its colour
  fits: Fit[];
  door: { dir: "h" | "v"; at: number; from: number; to: number };
}
function doorOf(b: Building): Inside["door"] {
  const xm = Math.round((b.x0 + b.x1) / 2);
  const zm = Math.round((b.z0 + b.z1) / 2);
  if (b.face === "n") return { dir: "h", at: b.z0, from: xm - 1, to: xm + 1 };
  if (b.face === "s") return { dir: "h", at: b.z1, from: xm - 1, to: xm + 1 };
  if (b.face === "e") return { dir: "v", at: b.x1, from: zm - 1, to: zm + 1 };
  return { dir: "v", at: b.x0, from: zm - 1, to: zm + 1 };
}
function fitsOf(b: Building): { floor: string; fits: Fit[] } {
  const { x0, z0, x1, z1 } = b;
  const xm = (x0 + x1) / 2;
  const fits: Fit[] = [];
  const f = (kind: FitKind, x: number, z: number, w: number, d: number, h: number, solid = true) =>
    fits.push({ kind, x, z, w, d, h, solid });
  if (b.sign === "BAR") {
    // the counter along the back wall, stools before it, the bottles behind;
    // tables either side of the way in, the jukebox in the corner
    f("shelf", x0 + 2, z1 - 1, x1 - x0 - 4, 1, 2.2);
    f("counter", x0 + 2, z1 - 3, x1 - x0 - 4, 1, 1.1);
    for (let x = x0 + 2.5; x < x1 - 2; x += 1.6) f("stool", x, z1 - 4.4, 0.6, 0.6, 0.75, false);
    for (const tx of [x0 + 1.5, x1 - 3.5])
      for (const tz of [z0 + 4, z0 + 8]) {
        f("table", tx, tz, 2, 2, 0.8);
        f("chair", tx - 0.9, tz + 0.6, 0.7, 0.7, 0.9, false);
        f("chair", tx + 2.2, tz + 0.6, 0.7, 0.7, 0.9, false);
      }
    f("jukebox", x1 - 1.6, z0 + 0.6, 1.2, 0.9, 1.7);
    return { floor: "#5b3a26", fits };
  }
  if (b.kind === "diner") {
    f("counter", x0 + 2, z1 - 3, x1 - x0 - 4, 1, 1.05);
    f("shelf", x0 + 2, z1 - 1, x1 - x0 - 4, 1, 1.9);
    for (let x = x0 + 2.5; x < x1 - 2; x += 1.6) f("stool", x, z1 - 4.4, 0.6, 0.6, 0.75, false);
    // booths along the front windows (the way in kept clear)
    for (const bx of [x0 + 0.6, x0 + 4.4, x1 - 7.6, x1 - 3.8]) {
      if (Math.abs(bx + 1.6 - xm) < 3) continue;
      f("booth", bx, z0 + 1, 3.2, 3, 1.2);
    }
    return { floor: "#c9c2b2", fits };
  }
  if (b.kind === "gatehouse") {
    f("desk", x1 - 1.2, z0 + 0.8, 0.9, z1 - z0 - 1.6, 0.8);
    f("screens", x1 - 1.0, z0 + 1.6, 0.4, 2.4, 1.3, false);
    return { floor: "#8f8b83", fits };
  }
  // the market: shelves in rows, the till by the door, the fridges down a side
  for (const z of [z0 + 5, z0 + 8.5, z0 + 12]) {
    f("shelf", x0 + 2, z, xm - 1.2 - (x0 + 2), 1, 1.8);
    f("shelf", xm + 1.2, z, x1 - 3 - (xm + 1.2), 1, 1.8);
  }
  f("till", x0 + 1.5, z0 + 1.5, 3, 1.2, 1.0);
  f("fridge", x1 - 1.2, z0 + 3, 1, z1 - z0 - 5, 2.4);
  return { floor: "#d8d2c4", fits };
}
export const INSIDES: Inside[] = BUILDINGS.filter((b) => b.enter && !b.stored && b.kind !== "hq").map((b) => ({
  b,
  door: doorOf(b),
  ...fitsOf(b),
}));
const insideBy = new Map(INSIDES.map((i) => [i.b, i]));
/** The inside of a building you walk into (not the stored ones), or null. */
export function insideOf(b: Building): Inside | null {
  return insideBy.get(b) ?? null;
}
// the tiles their solid furniture stands on; their walls' edges
const FIT_TILES = new Set<string>();
const WALL_EDGES = new Set<string>();
for (const i of INSIDES) {
  for (const f of i.fits)
    if (f.solid)
      for (let z = Math.floor(f.z); z < Math.ceil(f.z + f.d); z++)
        for (let x = Math.floor(f.x); x < Math.ceil(f.x + f.w); x++) FIT_TILES.add(`${x},${z}`);
  const { b, door } = i;
  const open = (dir: "h" | "v", at: number, u: number) =>
    door.dir === dir && door.at === at && u >= door.from && u < door.to;
  for (let x = b.x0; x < b.x1; x++) for (const z of [b.z0, b.z1]) if (!open("h", z, x)) WALL_EDGES.add(`h${x},${z}`);
  for (let z = b.z0; z < b.z1; z++) for (const x of [b.x0, b.x1]) if (!open("v", x, z)) WALL_EDGES.add(`v${x},${z}`);
}
/** A wall on an edge (building coords: h the north edge of tile (x, z), v the west). */
export function wallEdgeAt(dir: "h" | "v", x: number, z: number): boolean {
  return WALL_EDGES.has(`${dir}${x},${z}`);
}

/** The room or the place at (x, z) (building coords): inside a building you walk
 *  into, its room; out on the land, the place's name (one room for hearing). */
export function placeAt(x: number, z: number): { key: string; name: string; private: boolean; b?: Building } {
  for (const bd of nearBuildings(x, z)) {
    const i = insideOf(bd);
    if (i && x >= bd.x0 && x < bd.x1 && z >= bd.z0 && z < bd.z1)
      return { key: `grounds-${bd.key}`, name: bd.name, private: true, b: bd };
  }
  const name = (): string => {
    if (x >= PLAZA.x0 && x < PLAZA.x1 && z >= PLAZA.z0 && z < PLAZA.z1) return "The square";
    if (((x - POND.cx) / POND.rx) ** 2 + ((z - POND.cz) / POND.rz) ** 2 < 1.4) return "The frozen pond";
    if (Math.hypot(x - CLEARING.x, z - CLEARING.z) < CLEARING.r) return "The clearing";
    const near = nearLines(x, z);
    const r = near.get(RIVER_F);
    if (r && r.d < RIVER.w / 2 + 2) return "The river";
    const v = near.get(RAVINE_F);
    if (v && v.d < RAVINE.w / 2 + 1) return "The ravine";
    let best: { d: number; w: Way } | null = null;
    for (const [f, n] of near) {
      if (f >= WAYS.length) continue;
      const w = WAYS[f];
      if (n.d < w.w / 2 + 2.5 && (!best || n.d < best.d)) best = { d: n.d, w };
    }
    if (best) return best.w.name;
    if (x > TOWN.x0 && x < TOWN.x1 && z > TOWN.z0 && z < TOWN.z1) return "The town";
    if (inLawn(x, z) < 1) return "The lawn";
    return "The woods";
  };
  return { key: "outdoors", name: name(), private: false };
}

/** Rooms and places round a building's ground floor (shared map.ts setAreasBeyond). */
export function groundsAreaAt(map: MapDef, x: number, y: number): AreaDef | null {
  if ((map.floor ?? 0) !== 0 || !map.levels?.length) return null;
  const ox = map.ox ?? 0;
  const oy = map.oy ?? 0;
  const p = placeAt(x + ox, y + oy);
  if (p.b)
    return {
      key: p.key,
      name: p.name,
      kind: "private",
      x: p.b.x0 - ox,
      y: p.b.z0 - oy,
      w: p.b.x1 - p.b.x0,
      h: p.b.z1 - p.b.z0,
    };
  return {
    key: p.key,
    name: p.name,
    kind: "open",
    x: GROUNDS.x0 - ox,
    y: GROUNDS.z0 - oy,
    w: GROUNDS.x1 - GROUNDS.x0,
    h: GROUNDS.z1 - GROUNDS.z0,
  };
}

// ── life (phase 6): what moves on the Grounds, driven by the server ──────────
// A route is a line of points a tile apart; whatever drives it keeps to its
// right of the way's middle. The visitor's car comes in at the gate, down the
// driveway and into its bay on the lot; the shuttle runs the driveway, the
// county road and Main Street between the headquarters and the town square;
// the night guard walks the fence, inside it.

export interface Route {
  pts: P[];
  s: number[]; // the distance along it to each point
  len: number;
}
function routeOf(pts: P[]): Route {
  const s = [0];
  for (let i = 1; i < pts.length; i++)
    s.push(s[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  return { pts, s, len: s[s.length - 1] };
}
/** Where `s` along `r` is, and its heading there (radians, atan2 of z, x). */
export function along(r: Route, s: number): { x: number; z: number; a: number } {
  const t = Math.max(0, Math.min(r.len, s));
  let lo = 0;
  let hi = r.s.length - 1;
  while (hi - lo > 1) {
    const m = (lo + hi) >> 1;
    if (r.s[m] <= t) lo = m;
    else hi = m;
  }
  const k = (t - r.s[lo]) / Math.max(1e-6, r.s[hi] - r.s[lo]);
  const [ax, az] = r.pts[lo];
  const [bx, bz] = r.pts[hi];
  // (the heading from a little behind to a little ahead: corners turn, not snap)
  const b = r.pts[Math.max(0, lo - 2)];
  const f = r.pts[Math.min(r.pts.length - 1, hi + 2)];
  return { x: ax + (bx - ax) * k, z: az + (bz - az) * k, a: Math.atan2(f[1] - b[1], f[0] - b[0]) };
}
// a way's line, kept to the right of its middle (going the way the points run)
function keepRight(pts: P[], by: number): P[] {
  return pts.map((p, i) => {
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(pts.length - 1, i + 1)];
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    // (x east, z south: the right of a heading (dx, dz) is (−dz, dx))
    return [p[0] - ((b[1] - a[1]) / l) * by, p[1] + ((b[0] - a[0]) / l) * by] as P;
  });
}
// straight between points, a tile apart
function straight(pts: P[]): P[] {
  const out: P[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i];
    const [bx, bz] = pts[i + 1];
    const n = Math.max(1, Math.round(Math.hypot(bx - ax, bz - az)));
    for (let j = 0; j < n; j++) out.push([ax + ((bx - ax) * j) / n, az + ((bz - az) * j) / n]);
  }
  out.push(pts[pts.length - 1]);
  return out;
}
const wayLine = (key: string) => (WAYS.find((w) => w.key === key) as Way).line;
const LANE = 1.8;
const nearestOn = (line: P[], x: number, z: number) => {
  let best = 0;
  for (let i = 1; i < line.length; i++)
    if (Math.hypot(line[i][0] - x, line[i][1] - z) < Math.hypot(line[best][0] - x, line[best][1] - z)) best = i;
  return best;
};

/** The visitor's car: in from the county road, through the gate, down the
 *  driveway, across the lot's top and down its first aisle into the bay by the
 *  doors (shared building.ts campusLot: its visitorBay, nosed east), and out
 *  the way it came (backed out of the bay first). */
export const VISITOR = (() => {
  const road = wayLine("road");
  const from = nearestOn(road, -26, -404);
  const down = [...road.slice(0, from + 1).reverse(), ...wayLine("driveway").slice().reverse()];
  const bay = { x: -14.8, z: 24.4 }; // campusLot(36).bays[visitorBay]
  const aisle = -20.85; // the first aisle (campusLot(36).aisles[0])
  const lot = straight([
    [-48, -9],
    [-40, -6.5],
    [aisle, -6.5],
    [aisle, bay.z],
    [bay.x, bay.z],
  ]);
  const inn = routeOf([...keepRight(down, LANE), ...lot.slice(1)]);
  // out: backed out to the aisle, then up the aisle and away the same roads
  const back = routeOf(
    straight([
      [bay.x, bay.z],
      [aisle, bay.z],
    ]),
  );
  const up = [
    ...straight([
      [aisle, bay.z],
      [aisle, -6.5],
      [-40, -6.5],
    ]),
    ...keepRight([...wayLine("driveway"), ...road.slice(1, from + 1)], LANE),
  ];
  return { in: inn, back, out: routeOf(up), bay };
})();

/** The shuttle: the headquarters' stop (the lot's mouth) to the town square's
 *  (Main Street, by the statue) and back; `stops` are how far along each way. */
export const SHUTTLE = (() => {
  const main = wayLine("main");
  const to = nearestOn(main, 412, -405);
  // (on Main Street closer in: the cars parked along its kerbs)
  // (the headquarters' stop a bus length up the driveway: clear of the lot's cars)
  const pieces: [P[], number][] = [
    [wayLine("driveway").slice(14), LANE],
    [wayLine("road").slice(1), LANE],
    [main.slice(1, to + 1), 1.4],
  ];
  const there = routeOf(pieces.flatMap(([l, by]) => keepRight(l, by)));
  const back = routeOf(
    pieces
      .slice()
      .reverse()
      .flatMap(([l, by]) => keepRight(l.slice().reverse(), by)),
  );
  return {
    there,
    back,
    stops: [
      { key: "hq", name: "Headquarters" },
      { key: "town", name: "Town square" },
    ],
  };
})();

/** The night guard's round: the fence, three tiles inside it. */
export const GUARD_ROUND: Route = (() => {
  const [x0, z0, x1, z1] = [-397, -357, 217, 167];
  return routeOf(
    straight([
      [x0, z0],
      [x1, z0],
      [x1, z1],
      [x0, z1],
      [x0, z0],
    ]),
  );
})();
