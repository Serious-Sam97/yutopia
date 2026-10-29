import {
  KART_CARPARK,
  KART_CLEARING,
  KART_FENCE,
  KART_GATE,
  KART_GROUND,
  KART_PARK,
  KART_ROAD,
  KART_TURN,
  KART_VERGE,
  kartSignPosts,
} from "./kart/land.ts";
import { kartCarBlocked, kartDeckAt, kartFloods, kartSurfaceAt, kartWalkBlocked, setKartLayout } from "./kart/park.ts";

// (what the game's 3D scenery needs of the park: from here, so the Grounds' chunks don't take the karts' whole module)
export { KART_CARPARK, KART_FENCE, KART_GATE, KART_PARK, KART_SIGN, KART_TURN, kartSignWings } from "./kart/land.ts";
export {
  crowdDraw,
  KART_BOWL,
  KART_CROWD,
  KART_DESK,
  KART_FOLK,
  KART_PADDOCK,
  KART_RACK,
  KART_SHED,
  KART_SHOW,
  KART_STANDS,
  KART_THINGS,
  KART_TOWER,
  kartBridged,
  kartFloods,
  kartLayoutNow,
  kartPloughAt,
  kartPloughed,
  kartSeats,
  kartShowNow,
  kartTrack,
  kartTrackNow,
  STAND_AISLE,
  STAND_WALL,
  setKartShow,
  standAisles,
  standLights,
  standRoof,
  TRACK_W,
  trackAt,
} from "./kart/park.ts";

import {
  type BuildingDef,
  decodeBytes,
  decodeHeights,
  type GroundsEdits,
  NO_EDITS,
  type Section,
  type ThingDef,
  TREE_MASK,
  type WayDef,
} from "./grounds-edits.ts";
import type { LotLayout } from "./lot.ts";
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

export const GROUNDS_VERSION = 3; // (2: the farm, docs/plan/31-the-day.md; 3: the Kart Park, docs/plan/46-the-karts.md)
// Marks the chunk for `pnpm budget` (the client fetches it once the world starts).
export const GROUNDS_CHUNK = "yutopia-grounds";
export const CHUNK = 32;
/** The Kart Park's ground (docs/plan/46-the-karts.md): a clearing in the woods north of the county
 *  road, the land opened north past where it ended to fit it, the road in, the park on it. On in the
 *  game since 2026-10-26 (it was the stills' and the sandbox's only, behind a switch, till then). */
export const KART_LAND = true;
export const GROUNDS = { x0: -480, z0: KART_LAND ? -960 : -624, x1: 544, z1: 208 };

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
  /** a street's pavements, each side (0: none) */
  pave: number;
  /** it opens out from `w0` wide (and no pavements) at its start to its width over `n` samples
   *  (Main Street from the county road: docs/plan/33-the-look.md) */
  flare?: { n: number; w0: number };
  /** lamps along it (god mode's ways: grounds-edits.ts WayDef) */
  lamps?: boolean;
}
/** A way's half-width and its pavements' at sample i (a flared start narrower). */
export function wayHalf(w: Way, i: number): number {
  if (!w.flare || i >= w.flare.n) return w.w / 2;
  return lerp(w.flare.w0 / 2, w.w / 2, smooth(0, w.flare.n, i));
}
export function wayPave(w: Way, i: number): number {
  if (!w.flare || i >= w.flare.n) return w.pave;
  return w.pave * smooth(w.flare.n * 0.3, w.flare.n, i);
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
  | "gas"
  | "barn"
  | "silo"
  | "farmhouse";
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
  /** the part of its plot that's built (the rest open ground: the gas station's forecourt under
   *  its canopy, driven in and walked); none: all of it */
  built?: { x0: number; z0: number; x1: number; z1: number };
  /** its walls' colour (god mode's: one of WALL_TINTS); none: its kind's own */
  tint?: string;
}
export interface Lamp {
  /** which lamp, for ever (docs/plan/53-the-god-mode.md): its way's and its place along it, or a name */
  key: string;
  x: number;
  z: number;
  ry: number; // which way its arm reaches (radians about y; 0 = +x)
  kind: "cobra" | "town" | "lone" | "porch" | "flood"; // (flood: the Kart Park's masts, drawn by the park)
}

const H = 36; // the studio's depth (the campus's own numbers: tp/campus.ts)
const W = 48;
// the parking lot (lot.ts, docs/plan/42-the-lot.md): its rectangle, the driveway's mouth on its
// north edge, its pavement along the building from x −13. A copy of lot.ts's own (lot.test.ts
// checks they agree): this module is lazy on the client, and one it shared with the page would
// be copied into every chunk that uses either (+7 KB on the page, +90 KB of the Grounds')
export const LOT = { x0: -56, z0: -8, x1: -10, z1: 60 };
export const LOT_MOUTH = { x: -40.6, z: -8, w: 9 };
export const LOT_PAVE = -13;
/** Its parked rows (their x spans, the pair as one) and where they run (z), a bay every 2.8:
 *  the site plan's drawing of it. */
export const LOT_ROWS = {
  xs: [
    [-49.8, -44.2],
    [-37, -25.8],
    [-18.6, -13],
  ] as [number, number][],
  z0: -0.8,
  z1: 52.8,
  bay: 2.8,
};
// the stored ground floor's rectangle (shared building.ts groundLevel and
// upgradeGround: the lobby, the lot and the blocks, GROUND_OFFSET −60, −10,
// 160 × 94): flat, at 0
export const SITE = { x0: -60, z0: -10, x1: 100, z1: 84 };
export const POND = { cx: -240, cz: -60, rx: 48, rz: 34 };
export const TOWER = { x: -34, z: -96 };
export const STATUE = { x: 420, z: -384 };
export const BENCH = { x: 120, z: -250 };
export const GATE = { x: -40, z: -360 };
export const TOWN = { x0: 296, z0: -560, x1: 536, z1: -366 };
export const PLAZA = { x0: 400, z0: -396, x1: 440, z1: -368 };
/** The farm (docs/plan/31-the-day.md): across the river, south of Main Street, a
 *  lane down from the square — the barn (you walk in), the silo, the farmhouse,
 *  a cornfield of dry stalks in the snow, a tractor, scarecrows. */
export const FARM = { x0: 330, z0: -334, x1: 505, z1: -205 };
/** The cornfield: rows running north–south, `CORN.row` tiles apart (the stalks
 *  don't stop you: you walk between them, and so does what waits there). */
export const CORN = { x0: 344, z0: -318, x1: 414, z1: -216, row: 2 };
export const TRACTOR = { x: 476, z: -270, ry: 0.35 };
export const SCARECROWS: { x: number; z: number; ry: number }[] = [
  { x: 369.5, z: -281.5, ry: 0.4 },
  { x: 397.5, z: -239.5, ry: -0.8 },
];
/** The cars parked along Main Street (z −405): kerbside both ways, none across
 *  the square's side, the crossing at x 420 or the gas station's way in. `colour` indexes building.ts
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
  for (let x = 318; x < 520; x += 6.5 + r() * 8) {
    for (const s of [1, -1] as const) {
      if (r() < 0.45) continue;
      if (x > PLAZA.x0 - 3 && x < PLAZA.x1 + 3 && s > 0) continue;
      if (Math.abs(x - 420) < 10.5) continue; // (the crossing and its crosswalks)
      const wagon = r() < 0.3;
      const colour = Math.floor(r() * 9); // (all nine CAR_COLOURS: the orange never came up)
      const snowy = r() < 0.7;
      const tilt = (r() - 0.5) * 0.03;
      // (none across the gas station's way in: x 306–328, its side of the street)
      if (s > 0 && x - 2.5 < 331) continue;
      // (in the parking lane: the kerb 7 out, the car's middle 1.3 in from it)
      out.push({ x, z: -405 + s * 5.7, dir: s, wagon, colour, snowy, tilt });
    }
  }
  return out;
})();
/** The company's fence (a closed line; the gate where the driveway goes through). */
export const FENCE: P[] = [
  [-400, -360],
  [220, -360],
  [220, 170],
  [-400, 170],
];
/** Its height (m): low enough to fly over, never to walk through (docs/plan/50-the-volume.md). */
export const FENCE_H = 1.2;
// where the lawn round the headquarters ends (no trees inside)
const LAWN = { cx: 10, cz: -14, rx: 140, rz: 125 };
const CLEARING = { x: BENCH.x, z: BENCH.z, r: 15 };
// flat ground where things are built: the campus and the town
const FLATS = [
  { x: 10, z: 10, r0: 150, r1: 240, h: 0 },
  { x: 418, z: -450, r0: 120, r1: 190, h: 1.5 },
  { x: 420, z: -268, r0: 95, r1: 135, h: 1.5 }, // the farm
];

function way(
  key: string,
  kind: WayKind,
  name: string,
  w: number,
  pts: P[],
  closed = false,
  pave = 0,
  flare?: Way["flare"],
): Way {
  return { key, kind, name, w, pts, closed, line: dense(pts, closed), h: [], bridged: [], pave, flare };
}

// (the generator's; WAYS is them as edited)
const BASE_WAYS: Way[] = [
  // from the lot's mouth up through the woods to the gatehouse
  // (widths, docs/plan/33-the-look.md: two cars pass; the driveway as wide as the road it runs
  // into, so their lanes and lines meet; Main Street parks both kerbs as well)
  // (it lands on the lot's aisle W, opening out into a bellmouth: lot.ts, docs/plan/42-the-lot.md)
  way(
    "driveway",
    "driveway",
    "Driveway",
    9,
    [
      [LOT_MOUTH.x, LOT_MOUTH.z],
      [-40, -50],
      [-14, -100],
      [-20, -150],
      [-60, -200],
      [-70, -250],
      [-50, -300],
      [-40, -340],
      [-40, -366],
    ],
    false,
    0,
    { n: 8, w0: 17 },
  ),
  // the public road: out of the gate, east, over the river to the town
  way("road", "road", "County road", 9, [
    [-40, -366],
    [-40, -392],
    [-26, -404],
    [40, -410],
    [140, -400],
    [230, -404],
    [300, -405],
  ]),
  way(
    "main",
    "street",
    "Main Street",
    14,
    [
      [300, -405],
      [420, -405],
      [536, -405],
    ],
    false,
    2.6,
    { n: 18, w0: 9 },
  ),
  way(
    "church-st",
    "street",
    "Church Street",
    8,
    [
      [420, -412],
      [420, -470],
      [420, -524],
    ],
    false,
    1.6,
  ),
  // the courtyard: from the headquarters' east doors to the east block's
  way("court", "walk", "Courtyard", 4, [
    [W, 18],
    [76, 18],
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
  // the farm's lane: down from the square, past the barn's doors, to the farmhouse
  way("farm-lane", "trail", "Farm lane", 4, [
    [420, -371],
    [422, -346],
    [432, -322],
    [435, -304],
    [440, -284],
    [447, -265],
  ]),
];
// the road in to the Kart Park, off the county road by the river (docs/plan/46-the-karts.md)
if (KART_LAND) BASE_WAYS.push(way("kart-road", "road", "Kart Park road", 9, KART_ROAD));

// ── god mode's edits (docs/plan/53-the-god-mode.md): laid over all that's generated ──
let EDITS: GroundsEdits = NO_EDITS;
// its grids, decoded, by chunk (chunkKey): the land's lift in cm, the surfaces painted, the tree cells
const LIFT_N = CHUNK * 2 + 1;
const lifts = new Map<number, Int16Array>();
const paints = new Map<number, Uint8Array>();
const treeMasks = new Map<number, Uint8Array>();
const keep = <T extends { key: string }>(s: Section<T> | undefined) => ({
  gone: new Set(s?.remove ?? []),
  change: (s?.change ?? {}) as Record<string, Partial<T>>,
  add: s?.add ?? [],
});
const wayDef = (w: Way): WayDef => ({
  key: w.key,
  kind: w.kind,
  name: w.name,
  w: w.w,
  pts: w.pts,
  closed: w.closed,
  pave: w.pave,
});
const wayOf = (d: WayDef, flare?: Way["flare"]): Way => ({
  ...way(d.key, d.kind, d.name, d.w, d.pts, d.closed ?? false, d.pave ?? 0, flare),
  ...(d.lamps !== undefined ? { lamps: d.lamps } : {}),
});
/** The ways as they are: the generator's, edited. */
export const WAYS: Way[] = [];
/** The way a plot lies on (a sample of its line within it, or its carriageway over its edge),
 *  its name; or null. */
function wayOver(r: { x0: number; z0: number; x1: number; z1: number }): string | null {
  for (const w of WAYS)
    for (const [x, z] of w.line)
      if (x > r.x0 - w.w / 2 && x < r.x1 + w.w / 2 && z > r.z0 - w.w / 2 && z < r.z1 + w.w / 2) return w.name;
  return null;
}
/** The way at (x, z) — within its width and `pad` m of its middle — the nearest; its line's
 *  sample there, and how far off its middle (god mode's roads tool picks with it). */
export function wayAt(x: number, z: number, pad = 2): { w: Way; i: number; d: number } | null {
  let best: { w: Way; i: number; d: number } | null = null;
  for (const [f, n] of nearLines(x, z)) {
    if (f >= WAYS.length) continue;
    const w = WAYS[f];
    if (n.d < w.w / 2 + pad && (!best || n.d < best.d)) best = { w, i: n.i, d: n.d };
  }
  return best;
}
/** A way's line through its points, smoothed as the generator's are (a sample a tile). */
export function smoothLine(pts: P[], closed = false): P[] {
  return dense(pts, closed);
}
function layWays() {
  const e = keep<WayDef>(EDITS.ways);
  WAYS.length = 0;
  for (const w of BASE_WAYS) {
    if (e.gone.has(w.key)) continue;
    const c = e.change[w.key];
    WAYS.push(c ? wayOf({ ...wayDef(w), ...c }, w.flare) : { ...w });
  }
  for (const d of e.add) if (!e.gone.has(d.key)) WAYS.push(wayOf({ ...d, ...e.change[d.key] }));
}
layWays();

export const RIVER = {
  w: 22,
  pts: [
    // (on north past where the land ended, under the Kart Park's ground: docs/plan/46-the-karts.md)
    ...(KART_LAND ? ([[258, -990]] as P[]) : []),
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

const BASE_BUILDINGS: Building[] = [
  b("hq", "hq", "Headquarters", 0, 0, W, H, 5, "w", { enter: true }),
  // (their ground floors are the ground floor's own: shared building.ts BLOCKS)
  // (clear of a studio up to 64 × 48 across a 12-tile courtyard: building.ts BLOCKS)
  b("east", "block", "East block", 76, -10, 100, 48, 5, "w", { enter: true, stored: true }),
  b("south", "block", "South block", -4, 60, 50, 84, 5, "n", { enter: true, stored: true }),
  b("gatehouse", "gatehouse", "Gatehouse", -34, -367, -29, -361, 1, "w", { enter: true }),
  b("boathouse", "boathouse", "Boathouse", -262, -108, -248, -98, 1, "s"),
  b("shed", "shed", "Grounds shed", -162, 110, -148, 120, 1, "n"),
  b("shelter", "shelter", "Bus shelter", -16, -417, -10, -413, 1, "s"),
  // the town: Main Street, south side
  // (built: the kiosk at the back — the forecourt before it is open, its pumps under the canopy)
  b("gas", "gas", "Gas station", 306, -394, 328, -378, 1, "n", {
    sign: "GAS",
    built: { x0: 308, z0: -384, x1: 318, z1: -378 },
  }),
  b("diner", "diner", "Diner", 336, -396, 354, -382, 1, "n", { enter: true, sign: "DINER" }),
  b("market", "shop", "Market", 358, -396, 374, -380, 2, "n", { enter: true, sign: "MARKET" }),
  b("books", "shop", "Bookshop", 378, -396, 392, -382, 2, "n", { sign: "BOOKS" }),
  b("bar", "bar", "Bar", 448, -396, 464, -380, 2, "n", { enter: true, sign: "BAR" }),
  b("hardware", "shop", "Hardware", 468, -396, 482, -382, 2, "n", { sign: "HARDWARE" }),
  // (the shut shop, opened again as the car dealer: docs/plan/43-the-spot.md; its forecourt is MOTORS)
  b("motors", "shop", "Motors", 486, -396, 500, -382, 2, "n", { sign: "MOTORS" }),
  // north side
  b("post", "shop", "Post office", 338, -430, 354, -414, 1, "s", { sign: "POST OFFICE" }),
  b("laundry", "shop", "Laundromat", 358, -428, 372, -414, 1, "s", { sign: "LAUNDRY" }),
  b("hall", "shop", "Town hall", 378, -434, 404, -414, 2, "s", { sign: "TOWN HALL" }),
  b("hotel", "hotel", "Hotel", 432, -436, 452, -414, 3, "s", { sign: "HOTEL" }),
  b("bakery", "shop", "Bakery", 458, -428, 472, -414, 2, "s", { sign: "BAKERY" }),
  b("church", "church", "Church", 410, -556, 430, -534, 1, "s"),
  // the farm (docs/plan/31-the-day.md)
  b("barn", "barn", "Barn", 440, -320, 464, -302, 2, "w", { enter: true }),
  b("silo", "silo", "Silo", 468, -318, 476, -310, 4, "w"),
  b("farmhouse", "farmhouse", "Farmhouse", 440, -262, 454, -250, 2, "n", { enter: true }),
];
// two rows of the same townhouse up Church Street
for (let k = 0; k < 7; k++) {
  const z1 = -440 - k * 10;
  BASE_BUILDINGS.push(b(`house-w${k}`, "house", "Townhouse", 402, z1 - 8, 412, z1, 2, "e"));
  BASE_BUILDINGS.push(b(`house-e${k}`, "house", "Townhouse", 428, z1 - 8, 438, z1, 2, "w"));
}
/** The buildings as they are: the generator's, edited. */
export const BUILDINGS: Building[] = [];
function layBuildings() {
  const e = keep<BuildingDef>(EDITS.buildings);
  BUILDINGS.length = 0;
  for (const bd of BASE_BUILDINGS) {
    if (e.gone.has(bd.key)) continue;
    const c = e.change[bd.key];
    BUILDINGS.push(c ? { ...bd, ...c } : bd);
  }
  for (const d of e.add) {
    if (e.gone.has(d.key)) continue;
    const bd: Building = { ...d, ...e.change[d.key] };
    // (a gas station put down: its kiosk built, its forecourt open — as the town's)
    BUILDINGS.push(bd.kind === "gas" && !bd.built ? { ...bd, built: kioskOf(bd) } : bd);
  }
}
layBuildings();

/** The car dealer's forecourt (docs/plan/43-the-spot.md): east of its showroom (Main Street's
 *  old shut shop) to where the street's closed. Its way in is at the east end, the one gap in
 *  the kerb's parked cars and lamps; the collection bay by it, where a new car waits; one of
 *  each vehicle on show, the cars nosed to the street, the big ones side-on along the back.
 *  `a`: the nose's heading, atan2(dz, dx), as the server's vehicles. */
export const MOTORS = {
  yard: { x0: 501.5, z0: -395.4, x1: 526, z1: -382 },
  way: { x0: 522, x1: 526 },
  collect: { x: 523.8, z: -389.6, a: -Math.PI / 2 },
  sign: { x: 520.6, z: -395 },
  /** the pole sign's two posts */
  signPosts: [
    [518.94, -395],
    [522.26, -395],
  ] as [number, number][],
  /** the flood lamps' poles: two in the back corners, one between, one on the east side */
  floods: [
    [502.1, -382.6],
    [512.75, -382.5],
    [525.5, -382.6],
    [525.5, -392],
  ] as [number, number][],
  /** the low white rail along the back and the east side: [x0, z0, x1, z1] */
  rails: [
    [501.8, -382.2, 525.8, -382.2],
    [525.8, -392.2, 525.8, -382.2],
  ] as [number, number, number, number][],
  /** the collection bay's sign */
  collectSign: { x: 525.75, z: -387.1 },
  show: [
    { model: "sedan", x: 505.2, z: -390.2, a: -Math.PI / 2 + 0.28 },
    { model: "offroad", x: 509.6, z: -390.6, a: -Math.PI / 2 + 0.28 },
    { model: "pickup", x: 514.0, z: -390.0, a: -Math.PI / 2 + 0.28 },
    { model: "snowmobile", x: 518.4, z: -391.4, a: -Math.PI / 2 + 0.5 },
    { model: "ploughtruck", x: 505.6, z: -384.2, a: 0 },
    { model: "snowcat", x: 513.0, z: -384.3, a: 0 },
    { model: "tractor", x: 518.6, z: -384.4, a: 0 },
    { model: "toboggan", x: 522.8, z: -384.2, a: 0 },
  ] as { model: string; x: number; z: number; a: number }[],
};

/** On the car dealer's forecourt (`pad` round it)? */
export const inMotors = (x: number, z: number, pad = 0) =>
  x >= MOTORS.yard.x0 - pad && x < MOTORS.yard.x1 + pad && z >= MOTORS.yard.z0 - pad && z < MOTORS.yard.z1 + pad;
/** The forecourt's posts (the sign's, the flood lamps', the collection sign's) and the tiles its
 *  rail runs along: what a body can't walk through. */
export function motorsTiles(): [number, number][] {
  const out: [number, number][] = [];
  const posts = [...MOTORS.signPosts, ...MOTORS.floods, [MOTORS.collectSign.x, MOTORS.collectSign.z]];
  for (const [x, z] of posts) out.push([Math.floor(x), Math.floor(z)]);
  for (const [x0, z0, x1, z1] of MOTORS.rails) {
    const n = Math.ceil(Math.hypot(x1 - x0, z1 - z0));
    for (let i = 0; i <= n; i++) out.push([Math.floor(x0 + ((x1 - x0) * i) / n), Math.floor(z0 + ((z1 - z0) * i) / n)]);
  }
  return out;
}

/** The gas station's pump islands (as tp/grounds3d.ts builds them: two, a kerb each, along z under
 *  the canopy): their middles. A car stopped beside one, either side, is at the pump. */
export const PUMPS: { x: number; z: number }[] = (() => {
  const g = BUILDINGS.find((b) => b.key === "gas") as Building;
  return [g.x0 + 7, g.x1 - 7].map((x) => ({ x, z: g.z0 + 5 }));
})();
/** Is a car whose middle is at (x, z) at a pump: in any lane under the canopy — beside an island,
 *  either side, or in the middle one between them (the hose reaches) — not past either end? */
export const atPump = (x: number, z: number) =>
  PUMPS.some((p) => Math.abs(x - p.x) > 0.9 && Math.abs(x - p.x) < 4.4 && Math.abs(z - p.z) < 3.8);
/** The forecourt's solid bits (as tp/grounds3d.ts builds them): each island's kerb with its pumps,
 *  and the canopy's four posts. */
export const FORECOURT: {
  islands: { x: number; z: number; hx: number; hz: number }[];
  posts: { x: number; z: number }[];
} = (() => {
  const g = BUILDINGS.find((b) => b.key === "gas") as Building;
  return {
    islands: PUMPS.map((p) => ({ x: p.x, z: p.z, hx: 0.62, hz: 1.82 })),
    posts: [g.x0 + 3, g.x1 - 3].flatMap((x) => [g.z0 + 2, g.z0 + 8].map((z) => ({ x, z }))),
  };
})();
/** Is (x, z) in what's built of a building (its whole plot, but for one with open ground in it)? */
/** The church's steeple, south of its nave and past its plot (docs/plan/50-the-volume.md: the drawing's,
 *  its solid's, the tiles walking keeps you off). */
export function steepleOf(b: Building): { x0: number; z0: number; x1: number; z1: number } {
  const t = turnOf(b);
  const xm = (t.b.x0 + t.b.x1) / 2;
  const s = { x0: xm - 2.2, z0: t.b.z1 - 1.2, x1: xm + 2.2, z1: t.b.z1 + 2.7 };
  return t.k ? quarterRect(s, (b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2, t.k) : s;
}

// ── a building turned (god mode's, docs/plan/53-the-god-mode.md phase 9): each kind's builder
// draws its door on some sides; on another, it's built on one of those and turned a quarter (or
// two, or three) about its plot's middle — drawn, solid and walked the same ──
type Face = Building["face"];
/** The sides each kind's builder puts its door on itself. */
export const NATIVE_FACES: Partial<Record<BuildingKind, Face[]>> = {
  house: ["e", "w"],
  shop: ["n", "s"],
  bar: ["n", "s"],
  diner: ["n", "s"],
  hotel: ["n", "s"],
  barn: ["w"],
  farmhouse: ["n"],
  church: ["s"],
  gas: ["n"],
  shed: ["n"],
  boathouse: ["s"],
  silo: ["n", "e", "s", "w"],
};
// a quarter turn (+90° about up, as three.js turns: x' = z, z' = −x) takes a door from n to w,
// w to s, s to e, e to n
const TURNED: Record<Face, Face> = { n: "w", w: "s", s: "e", e: "n" };
/** (x, z) turned `k` quarters about (cx, cz). */
export function quarter(x: number, z: number, cx: number, cz: number, k: number): [number, number] {
  let dx = x - cx;
  let dz = z - cz;
  for (let i = 0; i < ((k % 4) + 4) % 4; i++) [dx, dz] = [dz, -dx];
  return [cx + dx, cz + dz];
}
/** A rectangle turned `k` quarters about (cx, cz). */
export function quarterRect<R extends { x0: number; z0: number; x1: number; z1: number }>(
  r: R,
  cx: number,
  cz: number,
  k: number,
): R {
  const [ax, az] = quarter(r.x0, r.z0, cx, cz, k);
  const [bx, bz] = quarter(r.x1, r.z1, cx, cz, k);
  return { ...r, x0: Math.min(ax, bx), z0: Math.min(az, bz), x1: Math.max(ax, bx), z1: Math.max(az, bz) };
}
/** How a building's drawn: `k` quarters turned from `b`, a building on a side its kind's builder
 *  draws (k 0: as it is). */
export function turnOf(b: Building): { k: number; b: Building } {
  const native = NATIVE_FACES[b.kind];
  if (!native || native.includes(b.face)) return { k: 0, b };
  for (let k = 1; k < 4; k++)
    for (const f of native) {
      let g = f;
      for (let i = 0; i < k; i++) g = TURNED[g];
      if (g !== b.face) continue;
      const cx = (b.x0 + b.x1) / 2;
      const cz = (b.z0 + b.z1) / 2;
      return { k, b: { ...quarterRect(b, cx, cz, 4 - k), face: f } };
    }
  return { k: 0, b };
}
/** A placed gas station's kiosk (as tp/grounds3d.ts draws it: at the back, the canopy at the front). */
function kioskOf(b: Building): { x0: number; z0: number; x1: number; z1: number } {
  const t = turnOf(b);
  const k = { x0: t.b.x0 + 2, z0: t.b.z1 - 6, x1: t.b.x0 + 12, z1: t.b.z1 };
  return t.k ? quarterRect(k, (b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2, t.k) : k;
}
/** A gas station's forecourt's solid bits (any gas station: as drawn, turned with it). */
export function forecourtOf(b: Building): {
  islands: { x: number; z: number; hx: number; hz: number }[];
  posts: { x: number; z: number }[];
} {
  const t = turnOf(b);
  const g = t.b;
  const cx = (b.x0 + b.x1) / 2;
  const cz = (b.z0 + b.z1) / 2;
  const at = (x: number, z: number) => (t.k ? quarter(x, z, cx, cz, t.k) : ([x, z] as P));
  const odd = t.k % 2 === 1;
  return {
    islands: [g.x0 + 7, g.x1 - 7].map((x) => {
      const [ix, iz] = at(x, g.z0 + 5);
      return { x: ix, z: iz, hx: odd ? 1.82 : 0.62, hz: odd ? 0.62 : 1.82 };
    }),
    posts: [g.x0 + 3, g.x1 - 3].flatMap((x) =>
      [g.z0 + 2, g.z0 + 8].map((z) => {
        const [px, pz] = at(x, z);
        return { x: px, z: pz };
      }),
    ),
  };
}
/** God mode's walls' colours (the mock 07-buildings): cream, sage, tan, oxblood, a pale grey. */
export const WALL_TINTS = ["#e8e1cf", "#9fb5a2", "#c9a27e", "#7a3b2e", "#d8dde0"] as const;

export const inBuilt = (bd: Building, x: number, z: number) => {
  const r = bd.built ?? bd;
  return x >= r.x0 && x < r.x1 && z >= r.z0 && z < r.z1;
};
/** On a gas station's forecourt's islands or posts (a body a little round them)? */
function onForecourt(bd: Building, x: number, z: number, pad = 0): boolean {
  const f = bd.key === "gas" ? FORECOURT : forecourtOf(bd);
  for (const i of f.islands) if (Math.abs(x - i.x) < i.hx + pad && Math.abs(z - i.z) < i.hz + pad) return true;
  for (const p of f.posts) if (Math.hypot(x - p.x, z - p.z) < 0.3 + pad) return true;
  return false;
}

// ── the index: the lines' samples by cell, for "what's near here" ────────────
const CELL = 28;
interface Sample {
  x: number;
  z: number;
  f: number; // which line: 0..WAYS.length-1 the ways, then the river, the ravine
  i: number; // which sample
}
let RIVER_F = 0;
let RAVINE_F = 0;
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
const bCells = new Map<number, Building[]>();
function layIndex() {
  RIVER_F = WAYS.length;
  RAVINE_F = WAYS.length + 1;
  cells.clear();
  for (const [f, w] of WAYS.entries()) indexLine(w.line, f);
  indexLine(RIVER.line, RIVER_F);
  indexLine(RAVINE.line, RAVINE_F);
  bCells.clear();
  for (const bd of BUILDINGS)
    for (let cx = Math.floor((bd.x0 - 8) / CELL); cx <= Math.floor((bd.x1 + 8) / CELL); cx++)
      for (let cz = Math.floor((bd.z0 - 8) / CELL); cz <= Math.floor((bd.z1 + 8) / CELL); cz++) {
        const k = cellKey(cx, cz);
        const l = bCells.get(k) ?? [];
        bCells.set(k, l);
        l.push(bd);
      }
}
layIndex();

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
/** How far (x, z) is from the nearest way's edge (tiles; 0 on one), the town's pavements and the
 *  lot as ways too; past the index's reach (28+ tiles), Infinity. */
export function wayClearance(x: number, z: number): number {
  let best = Number.POSITIVE_INFINITY;
  for (const [f, n] of nearLines(x, z)) {
    if (f >= WAYS.length) continue;
    const w = WAYS[f];
    best = Math.min(best, n.d - wayHalf(w, n.i) - wayPave(w, n.i));
  }
  if (x >= LOT.x0 - 1 && x < LOT.x1 + 1 && z >= LOT.z0 - 1 && z < LOT.z1 + 1) best = 0;
  if (x >= PLAZA.x0 && x < PLAZA.x1 && z >= PLAZA.z0 && z < PLAZA.z1) best = 0;
  return Math.max(0, best);
}
function nearBuildings(x: number, z: number): Building[] {
  return bCells.get(cellKey(Math.floor(x / CELL), Math.floor(z / CELL))) ?? [];
}
const rectDist = (r: { x0: number; z0: number; x1: number; z1: number }, x: number, z: number) =>
  Math.hypot(Math.max(r.x0 - x, 0, x - r.x1), Math.max(r.z0 - z, 0, z - r.z1));
/** The Kart Park's ground outside its gate, levelled as one: the car park, its footway, the
 *  turning circle, the gate's paving (docs/plan/46-the-karts.md). */
const KART_APRON = {
  x0: KART_CARPARK.x0,
  z0: KART_FENCE.z1,
  x1: KART_TURN.x + KART_TURN.r,
  z1: Math.max(KART_CARPARK.z1, KART_TURN.z + KART_TURN.r),
};
/** How far (x, z) is off the Kart Park's level ground: its fence's rectangle or its apron (the
 *  apron's reach mostly south, down the road in: across, twice as far — not out to the river). */
const kartPadDist = (x: number, z: number) => {
  const A = KART_APRON;
  const apron = Math.hypot(2 * Math.max(A.x0 - x, 0, x - A.x1), Math.max(A.z0 - z, 0, z - A.z1));
  return Math.min(rectDist(KART_FENCE, x, z), apron);
};
/** What's underfoot there: the circle's and the car park's asphalt, the footway's and the gate's
 *  paving (the circle's island: the snow it is). */
function kartApronAt(x: number, z: number): Surface | null {
  if (rectDist(KART_APRON, x, z) > 0) return null;
  const C = KART_CARPARK;
  const t = Math.hypot(x - KART_TURN.x, z - KART_TURN.z);
  if (t < KART_TURN.r) return t < KART_TURN.island ? null : "asphalt";
  if (rectDist(C, x, z) === 0) return "asphalt";
  if (z >= C.walk[0] && z < C.walk[1] && x < KART_TURN.x) return "walk";
  if (z < C.walk[1] && Math.abs(x - KART_GATE.x) < KART_GATE.w / 2 + 1) return "walk";
  return null;
}

// ── the land ─────────────────────────────────────────────────────────────────
/** How far (x, z) is beyond the land you can reach: the ridges rise there. */
/** Where anyone may be (docs/plan/50-the-volume.md): within 24 of the land's own rectangles — these,
 *  their union (walkable()'s `beyond`; the physics world's invisible wall round it). */
export function worldRects(): { x0: number; z0: number; x1: number; z1: number }[] {
  const m = (r: { x0: number; z0: number; x1: number; z1: number }) => ({
    x0: Math.max(GROUNDS.x0 + 2, r.x0 - 24),
    z0: Math.max(GROUNDS.z0 + 2, r.z0 - 24),
    x1: Math.min(GROUNDS.x1 - 2, r.x1 + 24),
    z1: Math.min(GROUNDS.z1 - 2, r.z1 + 24),
  });
  const core = m({ x0: -400, z0: -580, x1: 528, z1: 172 });
  return KART_LAND ? [core, m(KART_GROUND)] : [core];
}
function beyond(x: number, z: number): number {
  const o = Math.max(-400 - x, z - 172, -580 - z, x - 528, 0);
  if (!KART_LAND || o === 0) return o;
  // (and the Kart Park's ground, opened north of where the land ended)
  const F = KART_GROUND;
  return Math.min(o, Math.max(F.x0 - x, x - F.x1, F.z0 - z, z - F.z1, 0));
}
function macro(x: number, z: number): number {
  let m = 6 * fbm(x / 170, z / 170, 2, 11);
  for (const f of FLATS) m = f.h + (m - f.h) * smooth(f.r0, f.r1, Math.hypot(x - f.x, z - f.z));
  // the Kart Park's pad, levelled out to its fence — and its apron outside the gate (the car park,
  // the turning circle: the road in climbs to them, not into a step) — and eased into the woods
  if (KART_LAND) m = KART_PARK.h + (m - KART_PARK.h) * smooth(4, 44, kartPadDist(x, z));
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
  // (the Kart Park's pad: levelled flat for the circuit)
  const park = KART_LAND ? smooth(4, 44, kartPadDist(x, z)) : 1;
  return lawn * (0.15 + 0.85 * town) * park;
}
function micro(x: number, z: number): number {
  return 1.5 * fbm(x / 38, z / 38, 3, 21) + 0.3 * fbm(x / 9, z / 9, 1, 31);
}
/** The land before anything is built on it. */
function base(x: number, z: number): number {
  return macro(x, z) + micro(x, z) * microWeight(x, z);
}

// the ways' heights: the land under them, smoothed along them — and on through a way that goes
// on from either end, so two that meet agree where they meet (the driveway's end and the road's
// start were 0.17 apart: a step across the road at the gatehouse)
function layLevels() {
  const raws = WAYS.map((w) => w.line.map(([x, z]) => macro(x, z)));
  const at = (p: P, q: P) => Math.hypot(p[0] - q[0], p[1] - q[1]) < 1.5;
  WAYS.forEach((w, f) => {
    const raw = raws[f];
    const n = raw.length;
    const first = w.line[0];
    const last = w.line[n - 1];
    let pre: number[] = [];
    let post: number[] = [];
    WAYS.forEach((u, g) => {
      if (g === f || u.closed || w.closed) return;
      const r = raws[g];
      const ul = u.line;
      if (at(ul[ul.length - 1], first)) pre = r.slice(-11, -1);
      else if (at(ul[0], first)) pre = r.slice(1, 11).reverse();
      if (at(ul[0], last)) post = r.slice(1, 11);
      else if (at(ul[ul.length - 1], last)) post = r.slice(-11, -1).reverse();
    });
    const ext = [...pre, ...raw, ...post];
    const o = pre.length;
    w.h = raw.map((_, i) => {
      let sum = 0;
      let c = 0;
      for (let j = Math.max(0, i + o - 10); j <= Math.min(ext.length - 1, i + o + 10); j++) {
        sum += ext[j];
        c++;
      }
      return sum / c;
    });
    w.bridged = w.line.map(() => false);
  });
  // a way that starts (or ends) on another's middle — Church Street off Main — eases from that
  // one's height over its first (last) tiles
  for (const w of WAYS) {
    if (w.closed) continue;
    for (const end of [0, w.line.length - 1]) {
      const [x, z] = w.line[end];
      let best: { u: Way; j: number; d: number } | null = null;
      for (const u of WAYS) {
        if (u === w || u.kind === "trail" || u.kind === "walk") continue;
        for (let j = 2; j < u.line.length - 2; j++) {
          const d = Math.hypot(u.line[j][0] - x, u.line[j][1] - z);
          if (d < u.w / 2 + 3 && (!best || d < best.d)) best = { u, j, d };
        }
      }
      if (!best) continue;
      const hj = best.u.h[best.j];
      for (let k = 0; k < Math.min(12, w.line.length); k++) {
        const i = end === 0 ? k : w.line.length - 1 - k;
        w.h[i] = lerp(hj, w.h[i], smooth(0, 12, k));
      }
    }
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
}
layLevels();
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
    const r0 = wayHalf(w, n.i) + 1.2;
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
  // (the Kart Park's car park, its footway and the turning circle: one level pad)
  if (KART_LAND && rectDist(KART_APRON, x, z) < 8) pads.push({ ...KART_APRON, h: KART_PARK.h });
  for (const p of pads) {
    const k = smooth(0.5, 7, rectDist(p, x, z));
    if (k < best) {
      best = k;
      target = p.h;
    }
  }
  const land = lerp(target, h, best);
  return lifts.size ? land + liftAt(x, z) : land;
}
/** God mode's lift of the land at (x, z) (its grid's, between samples as the chunks are). */
function liftAt(x: number, z: number): number {
  const cx = Math.floor(x / CHUNK);
  const cz = Math.floor(z / CHUNK);
  const g = lifts.get(chunkKey(cx, cz));
  if (!g) return 0;
  const u = (x - cx * CHUNK) * 2;
  const v = (z - cz * CHUNK) * 2;
  const i = Math.min(LIFT_N - 2, Math.floor(u));
  const j = Math.min(LIFT_N - 2, Math.floor(v));
  const fu = u - i;
  const fv = v - j;
  const a = g[j * LIFT_N + i];
  const b = g[j * LIFT_N + i + 1];
  const d = g[(j + 1) * LIFT_N + i];
  const e = g[(j + 1) * LIFT_N + i + 1];
  return (a + (b - a) * fu + (d - a) * fv + (a - b - d + e) * fu * fv) / 100;
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
  for (const bd of nearBuildings(x, z))
    if (x >= bd.x0 && x < bd.x1 && z >= bd.z0 && z < bd.z1) return inBuilt(bd, x, z) ? "floor" : "walk";
  if (paints.size) {
    const tx = Math.floor(x);
    const tz = Math.floor(z);
    const cx = Math.floor(tx / CHUNK);
    const cz = Math.floor(tz / CHUNK);
    const p = paints.get(chunkKey(cx, cz))?.[(tz - cz * CHUNK) * CHUNK + (tx - cx * CHUNK)];
    if (p) return SURFACES[p - 1];
  }
  if (KART_LAND) {
    const ks = kartSurfaceAt(x, z) ?? kartApronAt(x, z);
    if (ks) return ks;
  }
  const near = nearLines(x, z);
  let on: Surface | null = null;
  for (const [f, n] of near) {
    if (f >= WAYS.length) continue;
    const w = WAYS[f];
    if (n.d < wayHalf(w, n.i)) {
      const s: Surface = w.kind === "trail" ? "path" : w.kind === "walk" ? "walk" : "asphalt";
      if (!on || s === "asphalt") on = s;
    } else if (n.d < wayHalf(w, n.i) + wayPave(w, n.i) && !on) on = "walk"; // the town's pavements
  }
  if (on) return on;
  if (x >= LOT.x0 && x < LOT.x1 && z >= LOT.z0 && z < LOT.z1) return x >= LOT_PAVE ? "walk" : "asphalt";
  if (x >= PLAZA.x0 && x < PLAZA.x1 && z >= PLAZA.z0 && z < PLAZA.z1) return "walk";
  // (the car dealer's forecourt: concrete, docs/plan/43-the-spot.md)
  if (inMotors(x, z)) return "walk";
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
/** Room for a tree at (x, z) whatever the woods would do there: off the ways, the buildings and
 *  the water (god mode's planted ones: docs/plan/53-the-god-mode.md, phase 8). */
export function treeRoom(x: number, z: number): boolean {
  for (const bd of nearBuildings(x, z)) if (rectDist(bd, x, z) < 2) return false;
  if (((x - POND.cx) / POND.rx) ** 2 + ((z - POND.cz) / POND.rz) ** 2 < 1.15) return false;
  for (const [f, n] of nearLines(x, z)) {
    if (f === RAVINE_F) {
      if (n.d < RAVINE.w / 2) return false;
      continue;
    }
    if (f === RIVER_F) {
      if (n.d < RIVER.w / 2 + 1) return false;
      continue;
    }
    if (n.d < WAYS[f].w / 2 + 1.5) return false;
  }
  return true;
}
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
  // the car dealer's forecourt, and a little round it
  if (inMotors(x, z, 2.5)) return 0;
  // the Kart Park's clearing, its car park
  if (
    KART_LAND &&
    (rectDist(KART_FENCE, x, z) < KART_CLEARING || rectDist(KART_APRON, x, z) < 6 || rectDist(KART_VERGE, x, z) === 0)
  )
    return 0;
  // the farm: cleared (the fields, the yard)
  if (x > FARM.x0 - 3 && x < FARM.x1 + 3 && z > FARM.z0 - 3 && z < FARM.z1 + 3) return 0;
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
/** Which spruce a pine is (docs/plan/50-the-volume.md: the drawing's, its trunk's — one choice, the
 *  same everywhere: an integer hash of where it stands): mostly the usual three (0–2), now and then
 *  a young one (3), a tall thin one (4), an old broad one (5). */
export function pineVariant(t: { x: number; z: number; ry: number }): number {
  const h = hash2(Math.floor(t.x * 64), Math.floor(t.z * 64), 0x9135);
  return h < 0.6 ? Math.floor(t.ry * 10) % 3 : h < 0.75 ? 3 : h < 0.88 ? 4 : 5;
}
/** Each spruce's height before its scale (tp/grounds3d.ts pineGeometry's H). */
export const PINE_H = [10.5, 10.5, 10.5, 6.5, 13.5, 11];
const PLANTED: TreeKind[] = ["pine", "birch", "bare"];
/** God mode's byte for tree cell (i, j) (TREE_MASK): its grid is the chunk the cell's tenth is. */
function treeMaskAt(i: number, j: number): number {
  const ci = Math.floor(i / 10);
  const cj = Math.floor(j / 10);
  return treeMasks.get(chunkKey(ci, cj))?.[(j - cj * 10) * 10 + (i - ci * 10)] ?? TREE_MASK.generated;
}
/** The trees in a chunk (cx, cz: chunk coords, CHUNK tiles each). */
export function treesIn(cx: number, cz: number): Tree[] {
  const out: Tree[] = [];
  const x0 = cx * CHUNK;
  const z0 = cz * CHUNK;
  for (let i = Math.ceil(x0 / TREE_CELL); i * TREE_CELL < x0 + CHUNK; i++)
    for (let j = Math.ceil(z0 / TREE_CELL); j * TREE_CELL < z0 + CHUNK; j++) {
      // (god mode's: cleared, or planted — where and how big as the generator's own would be)
      const m = treeMasks.size ? treeMaskAt(i, j) : TREE_MASK.generated;
      if (m === TREE_MASK.none) continue;
      const r = groundsRng(Math.imul(i, 92821) ^ Math.imul(j, 68917) ^ 0x51ed);
      const x = (i + 0.15 + r() * 0.7) * TREE_CELL;
      const z = (j + 0.15 + r() * 0.7) * TREE_CELL;
      const d = m ? 1 : treeDensity(x, z);
      if (r() >= d) continue;
      // (planted: not on a way, a building, the water)
      if (m && !treeRoom(x, z)) continue;
      // birches by the water, pines in the deep woods, a few dead ones
      const nearWater = ((x - POND.cx) / POND.rx) ** 2 + ((z - POND.cz) / POND.rz) ** 2 < 4 || Math.abs(x - 260) < 50;
      const q = r();
      const kind: TreeKind = m
        ? PLANTED[m - TREE_MASK.pine]
        : q < (nearWater ? 0.45 : 0.2)
          ? "birch"
          : q > 0.9
            ? "bare"
            : "pine";
      out.push({ x, z, y: terrainAt(x, z), kind, s: 0.72 + r() * 0.62, ry: r() * Math.PI * 2 });
    }
  return out;
}

// ── lamps ────────────────────────────────────────────────────────────────────
export const LAMPS: Lamp[] = [];
// (the generated ways with their own lamps, below)
const LAMPED = new Set(["driveway", "main", "church-st"]);
function layLamps() {
  LAMPS.length = 0;
  const along = (w: Way | undefined, every: number, both: boolean, kind: Lamp["kind"], from = 0) => {
    if (!w || w.lamps === false) return;
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
        const key = `lamp:${w.key}:${i}${both ? (s > 0 ? "l" : "r") : ""}`;
        LAMPS.push({ key, x: x + nx * off, z: z + nz * off, ry: Math.atan2(nz, -nx), kind });
      }
      side = -side;
    }
  };
  const byKey = (k: string) => WAYS.find((w) => w.key === k);
  along(byKey("driveway"), 30, false, "cobra", 70);
  along(byKey("main"), 22, true, "town", 6);
  along(byKey("church-st"), 22, true, "town", 12);
  // (god mode's ways with lamps: a street's both sides every 22, a road's one side every 30)
  for (const w of WAYS)
    if (w.lamps && !LAMPED.has(w.key)) {
      const st = w.kind === "street";
      along(w, st ? 22 : 30, st, st ? "town" : "cobra", 4);
    }
  // (none in the gas station's way in, x 306–328: to its corner)
  for (const l of LAMPS) if (l.kind === "town" && l.x > 305 && l.x < 329 && l.z > -399 && l.z < -394) l.x = 329.5;
  LAMPS.push({ key: "lamp:clearing", x: BENCH.x + 2.2, z: BENCH.z - 1.4, ry: Math.PI, kind: "lone" });
  LAMPS.push({ key: "lamp:gate", x: -36, z: -370, ry: Math.PI, kind: "cobra" }); // the gate's
  LAMPS.push({ key: "lamp:boathouse", x: -255, z: -97.4, ry: 0, kind: "porch" }); // the boathouse's
  LAMPS.push({ key: "lamp:shelter", x: -13, z: -412, ry: 0, kind: "porch" }); // the bus shelter's
  // the Kart Park's floodlights (docs/plan/46-the-karts.md): their light and pools as any lamp's
  if (KART_LAND)
    for (const [i, f] of kartFloods().entries())
      LAMPS.push({ key: `lamp:kart-flood:${i}`, x: f.x, z: f.z, ry: f.ry, kind: "flood" });
  // and its others: the road in's corner, the turning circle, the car park's row ends and footway,
  // the paddock's
  if (KART_LAND) {
    const C = KART_CARPARK;
    const g = KART_GATE.x;
    const z1 = KART_FENCE.z1;
    for (const [name, x, z, ry] of [
      ["corner", g + 5.8, -410.4, -2.36],
      ["turn", KART_TURN.x + KART_TURN.r + 2, KART_TURN.z, Math.PI],
      ["row-n", C.x0 + 1.5, (C.z0 + C.aisle[0]) / 2, 0],
      ["row-s", C.x0 + 1.5, (C.aisle[1] + C.z1) / 2, 0],
      ["footway", (C.x0 + C.x1) / 2, C.walk[0] + 0.4, -Math.PI / 2],
      ["car-park", (C.x0 + C.x1) / 2, C.z1 + 1.2, Math.PI / 2],
    ] as const)
      LAMPS.push({ key: `lamp:kart:${name}`, x, z, ry, kind: "cobra" });
    // the paddock's: down its east edge by the fence, out of the walk from the gate (the user's call)
    for (const dz of [52, 38, 24, 10])
      LAMPS.push({ key: `lamp:kart-paddock:${dz}`, x: g + 12.5, z: z1 - dz, ry: 0, kind: "lone" });
  }
}
layLamps();

/** The town's street furniture (docs/plan/33-the-look.md, phase 4): hydrants, bins, newspaper
 *  boxes along Main Street's kerbs, wooden poles carrying the wires down its north side, benches
 *  and bins round the statue, a stop sign and the street names where Church Street meets Main,
 *  the post office's box. Solid (a tile each, a bench two); `ry` turns its front (+z) to face. */
export interface StreetThing {
  /** which one, for ever (docs/plan/53-the-god-mode.md): its place, not its order */
  key: string;
  kind:
    | "hydrant"
    | "bin"
    | "newsbox"
    | "pole"
    | "bench"
    | "stop"
    | "streetsign"
    | "postbox"
    // god mode's own (docs/plan/53-the-god-mode.md, phase 8)
    | "boulder"
    | "planter"
    | "sign"
    | "fence";
  x: number;
  z: number;
  ry: number;
  /** how big (a boulder, a planter) */
  s?: number;
  /** what a sign says */
  text?: string;
  /** a fence's line */
  pts?: P[];
}
export const STREET: StreetThing[] = [];
function layStreet() {
  STREET.length = 0;
  const MZ = -405;
  const doors = BUILDINGS.filter((b) => b.sign || b.vacant).map((b) => ({
    x: (b.x0 + b.x1) / 2,
    side: b.face === "n" ? 1 : -1,
  }));
  const lampNear = (x: number, z: number, d: number) => LAMPS.some((l) => Math.hypot(l.x - x, l.z - z) < d);
  const clear = (x: number, side: number) =>
    !doors.some((d) => d.side === side && Math.abs(d.x - x) < 3) &&
    !(side > 0 && (x < 332 || (x > PLAZA.x0 - 2 && x < PLAZA.x1 + 2))) &&
    !(side < 0 && Math.abs(x - 420) < 8);
  // along both kerbs: a hydrant, a bin, a newspaper box, a bin…
  const seq: StreetThing["kind"][] = ["hydrant", "bin", "newsbox", "bin"];
  let k = 0;
  for (const side of [1, -1])
    for (let x = 322; x < 516; x += 9) {
      const z = MZ + side * 7.7;
      if (!clear(x, side) || lampNear(x, z, 2.5)) continue;
      STREET.push({
        key: `street:main-${side > 0 ? "s" : "n"}:${x}`,
        kind: seq[k++ % seq.length],
        x,
        z,
        ry: side > 0 ? Math.PI : 0,
      });
    }
  // the poles down the north side, every 26 tiles or so
  for (let x = 306; x < 520; x += 26) {
    let px = x;
    while (!clear(px, -1) || lampNear(px, MZ - 8, 3.5)) px += 2;
    if (px < 524) STREET.push({ key: `street:pole:${x}`, kind: "pole", x: px, z: MZ - 8, ry: 0 });
  }
  // round the statue: two benches facing it, a bin by each
  for (const bx of [STATUE.x - 7, STATUE.x + 5]) {
    const at = bx < STATUE.x ? "w" : "e";
    STREET.push({ key: `street:statue-bench:${at}`, kind: "bench", x: bx, z: STATUE.z - 7, ry: 0 });
    STREET.push({
      key: `street:statue-bin:${at}`,
      kind: "bin",
      x: bx + (at === "w" ? -1.2 : 3.2),
      z: STATUE.z - 6.6,
      ry: 0,
    });
  }
  // where Church Street meets Main: its stop sign, the street names
  STREET.push({ key: "street:stop", kind: "stop", x: 424.8, z: -415.6, ry: 0 });
  STREET.push({ key: "street:streetsign", kind: "streetsign", x: 415.2, z: -415.6, ry: 0 });
  STREET.push({ key: "street:postbox", kind: "postbox", x: 349.6, z: MZ - 7.7, ry: 0 });
}
layStreet();
/** The tiles street furniture stands on. */
function streetTiles(): [number, number][] {
  return STREET.flatMap((t) =>
    t.kind === "bench"
      ? [
          [Math.floor(t.x), Math.floor(t.z)],
          [Math.floor(t.x) + 1, Math.floor(t.z)],
        ]
      : [[Math.floor(t.x), Math.floor(t.z)]],
  );
}

/** Snow poles along the driveway and the county road (docs/plan/33-the-look.md): an orange
 *  stake with a reflector each side every 25 tiles or so, out in the plough's bank — where the
 *  road's edge is when it's all white. Only to look at (thin; not in the walking). */
export const SNOW_POLES: { key: string; x: number; z: number; ry: number }[] = [];
function laySnowPoles() {
  SNOW_POLES.length = 0;
  for (const key of ["driveway", "road", ...(KART_LAND ? ["kart-road"] : [])]) {
    const w = WAYS.find((u) => u.key === key);
    if (!w) continue;
    const L = w.line;
    for (let i = 8; i < L.length - 8; i += 25)
      for (const s of [1, -1]) {
        const [px, pz] = L[i - 1];
        const [qx, qz] = L[i + 1];
        const l = Math.hypot(qx - px, qz - pz) || 1;
        const nx = (-(qz - pz) / l) * s;
        const nz = ((qx - px) / l) * s;
        const x = L[i][0] + nx * (w.w / 2 + 1.5);
        const z = L[i][1] + nz * (w.w / 2 + 1.5);
        // (not on a bridge, across another way, in the lot or by a lamp)
        if (w.bridged[i] || w.bridged[i - 3] || w.bridged[i + 3]) continue;
        const crossing = [...nearLines(x, z)].some(([f, n]) => {
          const u = WAYS[f];
          return !!u && u !== w && u.kind !== "trail" && n.d < u.w / 2 + 2;
        });
        if (crossing) continue;
        if (x > LOT.x0 - 3 && x < LOT.x1 + 3 && z > LOT.z0 - 3 && z < LOT.z1 + 3) continue;
        if (LAMPS.some((m) => Math.hypot(m.x - x, m.z - z) < 3)) continue;
        SNOW_POLES.push({ key: `snowpole:${key}:${i}${s > 0 ? "l" : "r"}`, x, z, ry: Math.atan2(nx, nz) });
      }
  }
}
laySnowPoles();

/** God mode's things: the generated ones moved or taken away, new ones put down. */
function layThings() {
  const e = keep<ThingDef>(EDITS.things);
  const place = (c: Partial<ThingDef> | undefined) =>
    c
      ? {
          ...(c.x !== undefined && { x: c.x }),
          ...(c.z !== undefined && { z: c.z }),
          ...(c.ry !== undefined && { ry: c.ry }),
          ...(c.s !== undefined && { s: c.s }),
          ...(c.text !== undefined && { text: c.text }),
          ...(c.pts !== undefined && { pts: c.pts }),
        }
      : null;
  const edit = <T extends { key: string; x: number; z: number; ry: number }>(list: T[]) => {
    const kept = list.filter((t) => !e.gone.has(t.key));
    list.length = 0;
    for (const t of kept) {
      const c = place(e.change[t.key]);
      list.push(c ? { ...t, ...c } : t);
    }
  };
  edit(LAMPS);
  edit(STREET);
  edit(SNOW_POLES);
  for (const d of e.add) {
    if (e.gone.has(d.key)) continue;
    const t = { ...d, ...e.change[d.key] };
    if (t.kind.startsWith("lamp-"))
      LAMPS.push({ key: t.key, x: t.x, z: t.z, ry: t.ry, kind: t.kind.slice(5) as Lamp["kind"] });
    else if (t.kind === "snowpole") SNOW_POLES.push({ key: t.key, x: t.x, z: t.z, ry: t.ry });
    else
      STREET.push({
        key: t.key,
        kind: t.kind as StreetThing["kind"],
        x: t.x,
        z: t.z,
        ry: t.ry,
        ...(t.s !== undefined && { s: t.s }),
        ...(t.text !== undefined && { text: t.text }),
        ...(t.pts !== undefined && { pts: t.pts }),
      });
  }
}
layThings();

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
/** The Kart Park's layout to race (docs/plan/47-the-track-changer.md): what's asphalt there
 *  follows it, and the bridge (there for a layout over it: its deck walked, its guard strips not),
 *  so the park's chunks are dropped, to be made again. True if it changed. */
export function setParkLayout(key: string, reverse: boolean): boolean {
  if (!setKartLayout(key, reverse)) return false;
  layoutVersion++;
  const cs = chunksOver(KART_FENCE, 4);
  drop(cs);
  for (const f of changed) f(cs, "park");
  return true;
}
/** Forget every chunk made (a full rebuild; the tests, to check what's kept against what's made). */
export function forgetGrounds(): void {
  chunks.clear();
  surfaces.clear();
}
/** The chunks a rectangle (and `pad` round it) falls in. */
function chunksOver(r: { x0: number; z0: number; x1: number; z1: number }, pad: number): [number, number][] {
  const out: [number, number][] = [];
  for (let cz = Math.floor((r.z0 - pad) / CHUNK); cz <= Math.floor((r.z1 + pad) / CHUNK); cz++)
    for (let cx = Math.floor((r.x0 - pad) / CHUNK); cx <= Math.floor((r.x1 + pad) / CHUNK); cx++) out.push([cx, cz]);
  return out;
}
/** Drop these chunks and their tiles' surfaces: they're made again when next asked. */
function drop(cs: [number, number][]) {
  for (const [cx, cz] of cs) {
    chunks.delete(chunkKey(cx, cz));
    surfaces.delete(chunkKey(cx, cz));
  }
}
type Changed = (chunks: [number, number][], why: "park" | "edits") => void;
const changed = new Set<Changed>();
/** Told each time chunks change here (the park's layout raced, god mode's edits laid): what's
 *  made of them — drawn, solid — makes itself again. Gives back the unsubscribe. */
export function onGroundsChanged(f: Changed): () => void {
  changed.add(f);
  return () => {
    changed.delete(f);
  };
}
/** How many times the park's layout or god mode's edits changed here (a chunk made elsewhere
 *  before: not taken). */
export let layoutVersion = 0;
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
  // (the clearing's bench as it's drawn: a metre each side of BENCH.x)
  shut(BENCH.x - 1, BENCH.z);
  shut(BENCH.x, BENCH.z);
  for (const [x, z] of streetTiles()) shut(x + 0.5, z + 0.5);
  for (const [x, z] of motorsTiles()) shut(x + 0.5, z + 0.5);
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
  for (const bd of nearBuildings(x, z)) {
    // (the church's steeple, past its plot)
    if (bd.kind === "church") {
      const s = steepleOf(bd);
      if (x > s.x0 - 0.2 && x < s.x1 + 0.2 && z > s.z0 && z < s.z1 + 0.2) return false;
    }
    // (the bus shelter: walked into from the street — its glass back and sides are walls on the
    // tiles' edges: wallEdgeAt)
    if (bd.kind === "shelter") continue;
    if (bd.kind !== "hq" && x >= bd.x0 && x < bd.x1 && z >= bd.z0 && z < bd.z1)
      // (inside one you walk into: its floor, round its furniture; its open ground: round what's on it)
      return inBuilt(bd, x, z)
        ? !!insideOf(bd) && !FIT_TILES.has(`${Math.floor(x)},${Math.floor(z)}`)
        : bd.kind === "gas" && !onForecourt(bd, x, z, 0.2);
  }
  // (the town's parked cars and the farm's tractor are vehicles now — shared car/homes.ts: their
  // own boxes)
  // (the fences are walls on the tiles' edges, thin as they're drawn: wallEdgeAt)
  if (onBridgeRail(x, z)) return false;
  for (const c of SCARECROWS) if (Math.abs(x - c.x) < 0.5 && Math.abs(z - c.z) < 0.5) return false;
  // the water tower: its stem, and the fence round it (a gap to the south)
  const td = Math.hypot(x - TOWER.x, z - TOWER.z);
  if (td < 2.6) return false;
  if (Math.abs(td - 9) < 0.6 && !(z > TOWER.z && Math.abs(x - TOWER.x) < 1.5)) return false;
  if (Math.abs(x - STATUE.x) < 2.5 && Math.abs(z - STATUE.z) < 2.5) return false;
  // the Kart Park: its fence, stands, tower, bowl, the bridge's ramps (kart/park.ts)
  if (KART_LAND && kartWalkBlocked(x, z)) return false;
  // (and outside it: the turning circle's island, the billboard's and the fingerpost's posts)
  if (KART_LAND && Math.hypot(x - KART_TURN.x, z - KART_TURN.z) < KART_TURN.island - 0.3) return false;
  if (KART_LAND && kartSignPosts().some(([px, pz]) => Math.abs(x - px) < 0.6 && Math.abs(z - pz) < 0.6)) return false;
  return true;
}
/** A tile a car can't go into (docs/plan/28-the-car.md): the fence, the tower, the statue,
 *  the world's edge — what's really there. Not the tiles people walk round (a tree's, a
 *  lamp's, a steep one's: a car hits the trunk, climbs what it can). Buildings are boxes of
 *  their own. */
export function carBlockedTile(tx: number, tz: number): boolean {
  // (and the Kart Park, its gate too: the karts are the park's, the cars stay out)
  return (
    !walkable(tx + 0.5, tz + 0.5) || onFence(tx + 0.5, tz + 0.5) || (KART_LAND && kartCarBlocked(tx + 0.5, tz + 0.5))
  );
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
/** What's low on a tile you can't walk, over the ground (tiles): the clearing's bench (its seat) —
 *  to vault or climb onto (docs/plan/29-the-move.md M4); else NaN. (The town's cars and the farm's
 *  tractor are vehicles now: their tops are their boxes' — shared grid.ts.) */
export function topTile(tx: number, tz: number): number {
  if (tz === Math.floor(BENCH.z) && (tx === Math.floor(BENCH.x) - 1 || tx === Math.floor(BENCH.x))) return 0.45;
  return Number.NaN;
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
  top(tx: number, ty: number): number;
} {
  return {
    walkable: (tx, ty) => walkableTile(tx + ox, ty + oy),
    top: (tx, ty) => topTile(tx + ox, ty + oy),
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
/** The surfaces a painted tile can be (its byte: the index + 1; 0 as generated). */
export const SURFACES: Surface[] = ["snow", "deep", "path", "asphalt", "walk", "ice", "floor", "rock"];
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
/** The bridges' decks (docs/plan/33-the-look.md, "Bugs on the ways"): flush with their way —
 *  no lip to hit, its height along the line interpolated —, as wide as to their guard rails,
 *  from the first bridged sample to the last. Past the rails, a strip nobody walks or drives on
 *  (you fell off into the river). */
interface Deck {
  w: Way;
  a: number;
  b: number;
  half: number;
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}
const RAIL = 1.6; // the blocked strip's width past the deck
const DECKS: Deck[] = [];
function layDecks() {
  DECKS.length = 0;
  DECKS.push(
    ...WAYS.flatMap((w) => {
      const idx = w.line.map((_, i) => i).filter((i) => w.bridged[i]);
      if (!idx.length) return [];
      const xs = idx.map((i) => w.line[i][0]);
      const zs = idx.map((i) => w.line[i][1]);
      const half = w.w / 2 + (w.kind === "trail" ? 0.2 : 0.35);
      const m = half + RAIL + 0.5;
      // (a segment more each end: onto the land flattened to the way, no gap over the bank)
      return [
        {
          w,
          a: Math.max(0, idx[0] - 1),
          b: Math.min(w.line.length - 1, idx[idx.length - 1] + 1),
          half,
          x0: Math.min(...xs) - m,
          x1: Math.max(...xs) + m,
          z0: Math.min(...zs) - m,
          z1: Math.max(...zs) + m,
        },
      ];
    }),
  );
}
layDecks();
/** Where (x, z) falls along a deck: the segment and how far along it, how far off its line,
 *  and whether that's within the bridge's span (not past either end). */
function alongDeck(d: Deck, x: number, z: number): { i: number; u: number; off: number; within: boolean } {
  const L = d.w.line;
  let best = { i: d.a, u: 0, off: Number.POSITIVE_INFINITY, within: false };
  for (let i = d.a; i < d.b; i++) {
    const [ax, az] = L[i];
    const [bx, bz] = L[i + 1];
    const dx = bx - ax;
    const dz = bz - az;
    const l2 = dx * dx + dz * dz || 1;
    const raw = ((x - ax) * dx + (z - az) * dz) / l2;
    const u = Math.min(1, Math.max(0, raw));
    const off = Math.hypot(x - (ax + dx * u), z - (az + dz * u));
    if (off < best.off) {
      const within = (i > d.a || raw >= 0) && (i < d.b - 1 || raw <= 1);
      best = { i, u, off, within };
    }
  }
  return best;
}
/** A bridge's deck height at (x, z), or null (not on one). */
export function deckAt(x: number, z: number): number | null {
  // (the Kart Park's bridge: kart/park.ts)
  if (KART_LAND) {
    const k = kartDeckAt(x, z);
    if (k !== null) return terrainAt(x, z) + k;
  }
  for (const d of DECKS) {
    if (x < d.x0 || x > d.x1 || z < d.z0 || z > d.z1) continue;
    const p = alongDeck(d, x, z);
    if (p.within && p.off < d.half) return d.w.h[p.i] + (d.w.h[p.i + 1] - d.w.h[p.i]) * p.u;
  }
  return null;
}
/** Just past a bridge's guard rail (along its span): nobody walks or drives there. */
export function onBridgeRail(x: number, z: number): boolean {
  for (const d of DECKS) {
    if (x < d.x0 || x > d.x1 || z < d.z0 || z > d.z1) continue;
    const p = alongDeck(d, x, z);
    if (p.within && p.off >= d.half && p.off < d.half + RAIL) return true;
  }
  return false;
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
  | "screens"
  | "locker"
  | "hay"
  | "stall"
  | "bench"
  | "stove"
  | "sofa"
  | "armchair"
  | "coffee"
  | "rug"
  | "fireplace"
  | "bookshelf"
  | "bed"
  | "nightstand"
  | "wardrobe";
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
  if (b.kind === "barn") {
    // stalls down the south side, hay stacked at the back, the workbench by the door
    for (let x = x0 + 3; x + 3 <= x1 - 4; x += 4) f("stall", x, z1 - 4, 0.3, 4, 1.3);
    f("hay", x1 - 3.5, z0 + 1, 2.5, 3, 1.6);
    f("hay", x1 - 3.5, z0 + 4.5, 2.5, 2.5, 1.0);
    f("hay", x1 - 6.5, z0 + 1, 2.5, 2, 0.9);
    f("bench", x0 + 2, z0 + 0.5, 4, 1, 0.95);
    return { floor: "#6d5a44", fits };
  }
  if (b.kind === "farmhouse") {
    // one room under the beams (the door in the north wall, middle): the living room west of the
    // door — books by it, the sofa, a rug and a low table, an armchair, the fireplace on the south
    // wall; the kitchen east — the counter and stove along the east wall, the fridge, a table and
    // chairs; a bed, a nightstand and a wardrobe in the south-east corner
    f("bookshelf", x0 + 0.4, z0 + 0.15, 2.8, 0.5, 2.0);
    f("sofa", x0 + 0.2, z0 + 2.5, 1.0, 3.2, 0.85);
    f("rug", x0 + 1.4, z0 + 2.2, 3.6, 4.6, 0.02, false);
    f("coffee", x0 + 2.0, z0 + 3.3, 1.2, 1.6, 0.45);
    f("armchair", x0 + 3.8, z0 + 6.4, 1.1, 1.1, 0.9);
    f("fireplace", x0 + 1.3, z1 - 0.8, 2.4, 0.8, 1.6);
    f("counter", x1 - 0.9, z0 + 1, 0.8, 4, 0.95);
    f("stove", x1 - 0.9, z0 + 5, 0.8, 0.9, 0.95);
    f("fridge", x1 - 1, z0 + 6.2, 0.9, 0.9, 2.0);
    f("table", x0 + 8.5, z0 + 3, 1.6, 1.6, 0.8);
    f("chair", x0 + 7.6, z0 + 3.45, 0.7, 0.7, 0.9, false);
    f("chair", x0 + 10.3, z0 + 3.45, 0.7, 0.7, 0.9, false);
    f("bed", x1 - 2.5, z1 - 3.1, 2.2, 2.9, 0.6);
    f("nightstand", x1 - 3.1, z1 - 1.0, 0.5, 0.5, 0.6);
    f("wardrobe", x0 + 8.4, z1 - 0.7, 1.6, 0.6, 2.0);
    return { floor: "#8a6a4a", fits };
  }
  if (b.kind === "gatehouse") {
    f("desk", x1 - 1.2, z0 + 0.8, 0.9, z1 - z0 - 1.6, 0.8);
    f("screens", x1 - 1.0, z0 + 1.6, 0.4, 2.4, 1.3, false);
    // the guards' locker against the north wall (docs/plan/30-the-dark.md: a revolver in it)
    f("locker", x0 + 1, z0 + 0.15, 1, 0.55, 1.9);
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
export const INSIDES: Inside[] = [];
const insideBy = new Map<string, Inside>();
/** The inside of a building you walk into (not the stored ones), or null. */
export function insideOf(b: Building): Inside | null {
  return insideBy.get(b.key) ?? null;
}
// the tiles their solid furniture stands on; their walls' edges
const FIT_TILES = new Set<string>();
const WALL_EDGES = new Set<string>();
function layInsides() {
  INSIDES.length = 0;
  for (const b of BUILDINGS)
    if (b.enter && !b.stored && b.kind !== "hq") INSIDES.push({ b, door: doorOf(b), ...fitsOf(b) });
  insideBy.clear();
  for (const i of INSIDES) insideBy.set(i.b.key, i);
  FIT_TILES.clear();
  WALL_EDGES.clear();
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
  // the bus shelter's glass: its back (north) and its sides, open to the street (shapes/grounds.ts)
  for (const b of BUILDINGS)
    if (b.kind === "shelter") {
      for (let x = b.x0; x < b.x1; x++) WALL_EDGES.add(`h${x},${b.z0}`);
      for (let z = b.z0; z < b.z1 - 1; z++) for (const x of [b.x0, b.x1]) WALL_EDGES.add(`v${x},${z}`);
    }
  // the fences, thin as they're drawn (docs/plan/50-the-volume.md: their physics a 0.12 wall on the
  // line): the company's, open at its gate as drawn (x −43…−28, the gatehouse's stretch too); the
  // Kart Park's, open at its gate
  {
    const line = (ax: number, az: number, bx: number, bz: number, open: (x: number, z: number) => boolean) => {
      if (az === bz)
        for (let x = Math.min(ax, bx); x < Math.max(ax, bx); x++) {
          if (!open(x + 0.5, az)) WALL_EDGES.add(`h${x},${az}`);
        }
      else
        for (let z = Math.min(az, bz); z < Math.max(az, bz); z++) {
          if (!open(ax, z + 0.5)) WALL_EDGES.add(`v${ax},${z}`);
        }
    };
    for (let i = 0; i < FENCE.length; i++) {
      const [ax, az] = FENCE[i];
      const [bx, bz] = FENCE[(i + 1) % FENCE.length];
      line(ax, az, bx, bz, (x, z) => z === GATE.z && x > GATE.x - 3 && x < GATE.x + 12);
    }
    if (KART_LAND) {
      const F = KART_FENCE;
      const G = KART_GATE;
      const corners: P[] = [
        [F.x0, F.z0],
        [F.x1, F.z0],
        [F.x1, F.z1],
        [F.x0, F.z1],
      ];
      for (let i = 0; i < 4; i++)
        line(...corners[i], ...corners[(i + 1) % 4], (x, z) => z === G.z && Math.abs(x - G.x) < G.w / 2);
    }
  }
}
layInsides();
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
    if (x >= CORN.x0 && x < CORN.x1 && z >= CORN.z0 && z < CORN.z1) return "The cornfield";
    if (x >= FARM.x0 && x < FARM.x1 && z >= FARM.z0 && z < FARM.z1) return "The farm";
    if (((x - POND.cx) / POND.rx) ** 2 + ((z - POND.cz) / POND.rz) ** 2 < 1.4) return "The frozen pond";
    if (Math.hypot(x - CLEARING.x, z - CLEARING.z) < CLEARING.r) return "The clearing";
    if (KART_LAND && x >= KART_FENCE.x0 && x < KART_FENCE.x1 && z >= KART_FENCE.z0 && z < KART_FENCE.z1)
      return "Yutopia Kart Park";
    if (KART_LAND && (rectDist(KART_CARPARK, x, z) < 2 || Math.hypot(x - KART_TURN.x, z - KART_TURN.z) < KART_TURN.r))
      return "The Kart Park's car park";
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

/** The visitor's car (`l`: the lot, its visitors' bay by the doors — lot.ts lotLayout; the
 *  server's, by its own doors): in from
 *  the county road, through the gate and down the driveway, keeping right round the lot's loop
 *  (along the north cross aisle, down aisle E) into its bay nosed east; backed out into the aisle,
 *  then on round (aisle E, the south cross aisle, up aisle W) and away the way it came. */
export function visitorRoute(l: LotLayout) {
  const road = wayLine("road");
  const from = nearestOn(road, -26, -404);
  const down = [...road.slice(0, from + 1).reverse(), ...wayLine("driveway").slice().reverse()];
  const b = l.bays[l.visitorBay];
  const bay = { x: b.x, z: b.z };
  const [aw, ae] = l.aisles;
  const zN = (l.cross[0].z0 + l.cross[0].z1) / 2;
  const zS = (l.cross[1].z0 + l.cross[1].z1) / 2;
  // (in the aisles, on the right as on the roads: half a lane over)
  const inn = routeOf([
    ...keepRight(down, LANE),
    ...straight([
      [aw - LANE, l.z0 + 1],
      [aw - LANE, zN + LANE],
      [ae - LANE, zN + LANE],
      [ae - LANE, bay.z],
      [bay.x, bay.z],
    ]).slice(1),
  ]);
  // out: backed into aisle E (its middle: clear of the bays across it), then round
  const back = routeOf(
    straight([
      [bay.x, bay.z],
      [ae + 0.2, bay.z],
    ]),
  );
  const up = [
    ...straight([
      [ae + 0.2, bay.z],
      [ae - LANE, bay.z + 4],
      [ae - LANE, zS - LANE],
      [aw + LANE, zS - LANE],
      [aw + LANE, l.z0 + 1],
    ]),
    ...keepRight([...wayLine("driveway"), ...road.slice(1, from + 1)], LANE).slice(1),
  ];
  return { in: inn, back, out: routeOf(up), bay };
}
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
    [main.slice(1, to + 1), 1.75], // (its lane's middle: clear of the parked cars)
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

// ── keys and anchors (docs/plan/53-the-god-mode.md, phase 1) ────────────────
// Every generated thing on the Grounds has a key that stays its own whatever is edited round it
// (a way's and a building's own key, a lamp's way and its place along it, a tree's cell), so an
// edit can move or take away that one thing. Anchored ones are what other features hang on:
// god mode can't move or remove them, and the land in an anchored area stays as generated.

/** A tree's key: its 3.2 m cell (treesIn puts one tree at most in each). */
export function treeKey(t: { x: number; z: number }): string {
  return `tree:${Math.floor(t.x / TREE_CELL)},${Math.floor(t.z / TREE_CELL)}`;
}
export type GroundsThingKind =
  | "way"
  | "building"
  | "lamp"
  | "street"
  | "snowpole"
  | "fence"
  | "landmark"
  | "scarecrow"
  | "town-car"
  | "tractor"
  | "field"
  | "water"
  | "park";
export interface GroundsThing {
  key: string;
  kind: GroundsThingKind;
  x: number;
  z: number;
}
let things: GroundsThing[] | null = null;
/** Every generated thing but the trees (they're per chunk: treesIn, treeKey), with its key. */
export function groundsThings(): GroundsThing[] {
  if (things) return things;
  const mid = (r: { x0: number; z0: number; x1: number; z1: number }) => ({
    x: (r.x0 + r.x1) / 2,
    z: (r.z0 + r.z1) / 2,
  });
  const t = (key: string, kind: GroundsThingKind, p: { x: number; z: number }): GroundsThing => ({
    key,
    kind,
    x: p.x,
    z: p.z,
  });
  things = [
    ...WAYS.map((w) => t(`way:${w.key}`, "way", { x: w.line[0][0], z: w.line[0][1] })),
    ...BUILDINGS.map((b) => t(`building:${b.key}`, "building", mid(b))),
    ...LAMPS.map((l) => t(l.key, "lamp", l)),
    ...STREET.map((s) => t(s.key, "street", s)),
    ...SNOW_POLES.map((p) => t(p.key, "snowpole", p)),
    t("fence:company", "fence", { x: GATE.x, z: GATE.z }),
    t("landmark:tower", "landmark", TOWER),
    t("landmark:statue", "landmark", STATUE),
    t("landmark:bench", "landmark", BENCH),
    ...SCARECROWS.map((c, i) => t(`scarecrow:${i}`, "scarecrow", c)),
    ...TOWN_CARS.map((c, i) => t(`town-car:${i}`, "town-car", c)),
    t("tractor", "tractor", TRACTOR),
    t("field:corn", "field", mid(CORN)),
    t("water:pond", "water", { x: POND.cx, z: POND.cz }),
    t("water:river", "water", { x: RIVER.line[0][0], z: RIVER.line[0][1] }),
    t("water:ravine", "water", { x: RAVINE.line[0][0], z: RAVINE.line[0][1] }),
    ...(KART_LAND ? [t("park:kart", "park", KART_PARK)] : []),
  ];
  return things;
}
/** What other features hang on, and why (key → why). God mode can't move or remove these. */
export const ANCHORED: Readonly<Record<string, string>> = {
  "building:hq": "The HQ: its floors are the stored map, its lifts and stairs, everyone's arrival",
  "building:east": "The east block: its ground floor is the stored map's",
  "building:south": "The south block: its ground floor is the stored map's",
  "building:gatehouse": "The gatehouse: its locker gives the first revolver; the night guard keeps it",
  "building:gas": "The gas station: its pumps and forecourt",
  "building:motors": "Motors, the car dealer: its forecourt, the collection bay",
  "building:hall": "The town hall: a town car's home",
  "building:hotel": "The hotel: a town car's home",
  "way:driveway": "The driveway: the shuttle's and the visitors' way in, the lot's mouth",
  "way:road": "The county road: the shuttle's and the visitors' way",
  "way:main": "Main Street: the shuttle's stop in town",
  "way:kart-road": "The Kart Park's road in",
  "fence:company": "The company's fence: the guard walks it, the gate is on it",
  tractor: "The farm's tractor: driven, its home by the barn",
  "park:kart": "The Kart Park: its circuits, paddock and bowl (the track changer's)",
  "water:pond": "Water stays as it is for now (plan 53, open question 4)",
  "water:river": "Water stays as it is for now (plan 53, open question 4)",
  "water:ravine": "Water stays as it is for now (plan 53, open question 4)",
  ...Object.fromEntries(TOWN_CARS.map((_, i) => [`town-car:${i}`, "A town car: someone's, kept at its home"])),
};
/** Where the land stays as generated: no sculpting, painting or building there. */
export const ANCHORED_AREAS: readonly { key: string; why: string; x0: number; z0: number; x1: number; z1: number }[] = [
  { key: "area:campus", why: "The campus: the HQ, its blocks and the parking lot", ...SITE },
  ...(KART_LAND ? [{ key: "area:kart", why: "The Kart Park and its road in", ...KART_GROUND }] : []),
  ...BUILDINGS.filter((b) => ANCHORED[`building:${b.key}`]).map((b) => ({
    key: `area:${b.key}`,
    why: ANCHORED[`building:${b.key}`],
    x0: b.x0 - 2,
    z0: b.z0 - 2,
    x1: b.x1 + 2,
    z1: b.z1 + 2,
  })),
  { key: "area:forecourt", why: "Motors' forecourt", ...MOTORS.yard },
];
/** The anchored area at (x, z), or null; past the world's edge counts as one. */
export function anchoredAt(x: number, z: number): { key: string; why: string } | null {
  if (beyond(x, z) > 0) return { key: "area:edge", why: "Past the world's edge: scenery" };
  return ANCHORED_AREAS.find((a) => x >= a.x0 && x < a.x1 && z >= a.z0 && z < a.z1) ?? null;
}

// ── laying god mode's edits (docs/plan/53-the-god-mode.md § B) ──────────────
/** How many times edits were laid here: what's made from the Grounds once and kept (the solids'
 *  buckets, the GPS's graph) makes itself again when this moves. */
export let editsVersion = 0;
/** The edits laid now. */
export function editsNow(): GroundsEdits {
  return EDITS;
}
type Rect = { x0: number; z0: number; x1: number; z1: number };
/** What's on the Grounds now, each thing's look as a string and the ground it reaches. */
function sigs(): Map<string, { sig: string; r: Rect }> {
  const out = new Map<string, { sig: string; r: Rect }>();
  const around = (x: number, z: number, pad: number): Rect => ({ x0: x - pad, z0: z - pad, x1: x + pad, z1: z + pad });
  for (const w of WAYS) {
    const xs = w.line.map((p) => p[0]);
    const zs = w.line.map((p) => p[1]);
    // (30 round: its verges eased in, the trees and lamps cleared, a way joined to it levelled)
    out.set(`way:${w.key}`, {
      sig: JSON.stringify([w.kind, w.w, w.pave, w.pts, w.closed, w.lamps]),
      r: { x0: Math.min(...xs) - 30, z0: Math.min(...zs) - 30, x1: Math.max(...xs) + 30, z1: Math.max(...zs) + 30 },
    });
  }
  // (12 round: its pad eased in, the trees cleared, its door's street things)
  for (const b of BUILDINGS)
    out.set(`building:${b.key}`, {
      sig: JSON.stringify(b),
      r: { x0: b.x0 - 12, z0: b.z0 - 12, x1: b.x1 + 12, z1: b.z1 + 12 },
    });
  for (const l of LAMPS) out.set(l.key, { sig: `${l.kind} ${l.x} ${l.z} ${l.ry}`, r: around(l.x, l.z, 3) });
  for (const t of STREET) {
    const sig = `${t.kind} ${t.x} ${t.z} ${t.ry} ${t.s ?? ""} ${t.text ?? ""} ${t.pts ? JSON.stringify(t.pts) : ""}`;
    const r = t.pts
      ? {
          x0: Math.min(...t.pts.map((p) => p[0])) - 3,
          z0: Math.min(...t.pts.map((p) => p[1])) - 3,
          x1: Math.max(...t.pts.map((p) => p[0])) + 3,
          z1: Math.max(...t.pts.map((p) => p[1])) + 3,
        }
      : around(t.x, t.z, 3 * (t.s ?? 1));
    out.set(t.key, { sig, r });
  }
  for (const p of SNOW_POLES) out.set(p.key, { sig: `${p.x} ${p.z} ${p.ry}`, r: around(p.x, p.z, 1) });
  return out;
}
function decode<T>(into: Map<number, T>, grids: Record<string, string> | undefined, f: (s: string) => T | null) {
  into.clear();
  for (const [k, s] of Object.entries(grids ?? {})) {
    const [cx, cz] = k.split(",").map(Number);
    const g = Number.isInteger(cx) && Number.isInteger(cz) ? f(s) : null;
    if (g) into.set(chunkKey(cx, cz), g);
  }
}
/** Lay these edits over the generated Grounds (in place of the ones laid before) and give back
 *  the chunks that changed: they're dropped here, to be made again when next asked. The same on
 *  the server and every client, so they agree. */
export function applyEdits(next: GroundsEdits): [number, number][] {
  const before = sigs();
  const was = EDITS;
  EDITS = next;
  decode(lifts, next.height, (s) => decodeHeights(s, LIFT_N * LIFT_N));
  decode(paints, next.paint, (s) => decodeBytes(s, CHUNK * CHUNK));
  decode(treeMasks, next.trees, (s) => decodeBytes(s, 100));
  layWays();
  layBuildings();
  layIndex();
  layLevels();
  layLamps();
  layStreet();
  laySnowPoles();
  layThings();
  layDecks();
  layInsides();
  things = null;
  // what changed: a thing whose look did, where it was and where it is
  const after = sigs();
  const dirty = new Map<number, [number, number]>();
  const add = (cs: [number, number][]) => {
    for (const c of cs) dirty.set(chunkKey(c[0], c[1]), c);
  };
  for (const [k, a] of after) {
    const b = before.get(k);
    if (b?.sig === a.sig) continue;
    add(chunksOver(a.r, 0));
    if (b) add(chunksOver(b.r, 0));
  }
  for (const [k, b] of before) if (!after.has(k)) add(chunksOver(b.r, 0));
  // a grid that changed: its chunk and those round it (its slopes reach them; a tree cell's
  // chunk can be the next one's)
  for (const f of ["height", "paint", "trees"] as const) {
    const o = was[f] ?? {};
    const n = next[f] ?? {};
    for (const k of new Set([...Object.keys(o), ...Object.keys(n)]))
      if (o[k] !== n[k]) {
        const [cx, cz] = k.split(",").map(Number);
        if (Number.isInteger(cx) && Number.isInteger(cz))
          add(
            chunksOver(
              { x0: cx * CHUNK, z0: cz * CHUNK, x1: cx * CHUNK + CHUNK - 1, z1: cz * CHUNK + CHUNK - 1 },
              CHUNK,
            ),
          );
      }
  }
  const list = [...dirty.values()];
  drop(list);
  layoutVersion++;
  editsVersion++;
  for (const f of changed) f(list, "edits");
  return list;
}

// ── the rule book (docs/plan/53-the-god-mode.md § A): what edits may do ─────
/** The building kinds god mode puts down, and how big each may be (m a side). */
export const PREFABS: Partial<Record<BuildingKind, { min: number; max: number; floors: number }>> = {
  house: { min: 8, max: 20, floors: 3 },
  shop: { min: 8, max: 24, floors: 3 },
  bar: { min: 10, max: 24, floors: 2 },
  diner: { min: 10, max: 24, floors: 1 },
  hotel: { min: 14, max: 30, floors: 5 },
  church: { min: 14, max: 30, floors: 1 },
  barn: { min: 14, max: 32, floors: 2 },
  farmhouse: { min: 10, max: 20, floors: 2 },
  silo: { min: 6, max: 10, floors: 5 },
  shed: { min: 6, max: 16, floors: 1 },
  gas: { min: 14, max: 28, floors: 1 },
  boathouse: { min: 8, max: 18, floors: 1 },
};
/** A boulder's or a planter's size, times its own; a sign's words; a fence's longest run (m). */
export const THING_SIZE = { min: 0.5, max: 2 };
export const SIGN_TEXT = 40;
export const FENCE_RUN = 60;
/** A fence's line: a sample every metre along its runs (straight). */
export function fenceLine(pts: P[]): P[] {
  const out: P[] = [];
  for (let i = 1; i < pts.length; i++) {
    const [ax, az] = pts[i - 1];
    const [bx, bz] = pts[i];
    const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az)));
    for (let k = i === 1 ? 0 : 1; k <= n; k++) out.push([ax + ((bx - ax) * k) / n, az + ((bz - az) * k) / n]);
  }
  return out;
}
export const EDIT_LIMITS = {
  bytes: 6_000_000,
  ways: 400,
  buildings: 300,
  things: 20_000,
  lift: 30,
  wayPts: 64,
} as const;
const WAY_KINDS: WayKind[] = ["driveway", "road", "street", "trail", "walk"];
const THING_KINDS = new Set<string>([
  "lamp-cobra",
  "lamp-town",
  "lamp-lone",
  "lamp-porch",
  "hydrant",
  "bin",
  "newsbox",
  "pole",
  "bench",
  "stop",
  "streetsign",
  "postbox",
  "snowpole",
  "boulder",
  "planter",
  "sign",
  "fence",
]);
/** What's wrong with a set of edits (none: it may be laid), each a line an admin can read. The
 *  world server's say before a publish; the god mode ghost's, as they edit. */
export function checkEdits(e: GroundsEdits): string[] {
  const out: string[] = [];
  const no = (s: string) => out.length < 50 && out.push(s);
  const inWorld = (x: number, z: number) => Number.isFinite(x) && Number.isFinite(z) && beyond(x, z) === 0;
  const anchoredHere = (x: number, z: number) => {
    const a = anchoredAt(x, z);
    return a && a.key !== "area:edge" ? a : null;
  };
  if (JSON.stringify(e).length > EDIT_LIMITS.bytes) no(`Too big: at most ${EDIT_LIMITS.bytes / 1e6} MB`);
  // the grids: a chunk that's there, the right size, nothing on anchored ground
  const grid = (
    name: "height" | "paint" | "trees",
    n: number,
    per: number,
    ok: (v: number) => boolean,
    decode: (s: string) => ArrayLike<number> | null,
  ) => {
    for (const [k, s] of Object.entries(e[name] ?? {})) {
      const [cx, cz] = k.split(",").map(Number);
      if (
        !Number.isInteger(cx) ||
        !Number.isInteger(cz) ||
        cx * CHUNK < GROUNDS.x0 ||
        cx * CHUNK >= GROUNDS.x1 ||
        cz * CHUNK < GROUNDS.z0 ||
        cz * CHUNK >= GROUNDS.z1
      ) {
        no(`${name} ${k}: not a chunk of the Grounds`);
        continue;
      }
      const g = typeof s === "string" ? decode(s) : null;
      if (!g || g.length !== n) {
        no(`${name} ${k}: not ${n} values`);
        continue;
      }
      const side = Math.round(Math.sqrt(n));
      for (let i = 0; i < n; i++) {
        if (!g[i]) continue;
        if (!ok(g[i])) {
          no(`${name} ${k}: ${g[i]} is out of bounds`);
          break;
        }
        const x = cx * CHUNK + ((i % side) + 0.5) * per;
        const z = cz * CHUNK + (Math.floor(i / side) + 0.5) * per;
        const a = anchoredHere(x, z) ?? (inWorld(x, z) ? null : { why: "Past the world's edge" });
        if (a) {
          no(`${name} ${k}: on ground that stays as it is (${a.why})`);
          break;
        }
      }
    }
  };
  grid(
    "height",
    LIFT_N * LIFT_N,
    0.5,
    (v) => Math.abs(v) <= EDIT_LIMITS.lift * 100,
    (s) => decodeHeights(s, LIFT_N * LIFT_N),
  );
  grid(
    "paint",
    CHUNK * CHUNK,
    1,
    (v) => v >= 1 && v <= SURFACES.length,
    (s) => decodeBytes(s, CHUNK * CHUNK),
  );
  grid(
    "trees",
    100,
    TREE_CELL,
    (v) => v >= 1 && v <= TREE_MASK.bare,
    (s) => decodeBytes(s, 100),
  );
  // what's anchored: not moved, not taken away (the shuttle's ways: wider, lit, no more)
  const touched = (prefix: string, s: Section<{ key: string }> | undefined, may: string[] = []) => {
    for (const k of s?.remove ?? [])
      if (ANCHORED[`${prefix}${k}`]) no(`Can't take away ${k}: ${ANCHORED[`${prefix}${k}`]}`);
    for (const [k, c] of Object.entries(s?.change ?? {}))
      if (ANCHORED[`${prefix}${k}`] && Object.keys(c ?? {}).some((f) => !may.includes(f)))
        no(`Can't move ${k}: ${ANCHORED[`${prefix}${k}`]}`);
  };
  touched("way:", e.ways, ["w", "pave", "lamps"]);
  touched("building:", e.buildings);
  touched("", e.things);
  // new keys: god mode's own (never one the generator makes), each once
  const fresh = (key: unknown, _prefix: string, seen: Set<string>) => {
    if (typeof key !== "string" || !/^god-[a-z0-9-]{1,40}$/.test(key)) {
      no(`A new key "${String(key)}": "god-" and letters, digits, dashes`);
      return false;
    }
    if (seen.has(key)) {
      no(`${key}: twice`);
      return false;
    }
    seen.add(key);
    return true;
  };
  // ways
  const wk = new Set<string>();
  const ways = [...(e.ways?.add ?? []).map((d) => ({ ...d, ...e.ways?.change?.[d.key] }))];
  if (ways.length > EDIT_LIMITS.ways) no(`At most ${EDIT_LIMITS.ways} new ways`);
  for (const d of ways) {
    if (!fresh(d.key, "way:", wk)) continue;
    if (!WAY_KINDS.includes(d.kind)) no(`${d.key}: not a kind of way`);
    if (!(d.w >= 2 && d.w <= 16)) no(`${d.key}: 2–16 m wide`);
    if (!Array.isArray(d.pts) || d.pts.length < 2 || d.pts.length > EDIT_LIMITS.wayPts) {
      no(`${d.key}: 2–${EDIT_LIMITS.wayPts} points`);
      continue;
    }
    const line = dense(d.pts as P[], !!d.closed, 2);
    const bad = line.find(([x, z]) => !inWorld(x, z) || anchoredHere(x, z));
    if (bad)
      no(
        `${d.key}: through ground that stays as it is (${anchoredHere(bad[0], bad[1])?.why ?? "past the world's edge"})`,
      );
  }
  // a generated way moved (its points): not onto what's anchored either
  for (const [k, c] of Object.entries(e.ways?.change ?? {})) {
    const base = BASE_WAYS.find((w) => w.key === k);
    if (!base || !c?.pts) continue;
    if (!Array.isArray(c.pts) || c.pts.length < 2 || c.pts.length > EDIT_LIMITS.wayPts) {
      no(`${k}: 2–${EDIT_LIMITS.wayPts} points`);
      continue;
    }
    const bad = dense(c.pts as P[], !!base.closed, 2).find(([x, z]) => !inWorld(x, z) || anchoredHere(x, z));
    if (bad)
      no(`${k}: through ground that stays as it is (${anchoredHere(bad[0], bad[1])?.why ?? "past the world's edge"})`);
  }
  // buildings
  const bk = new Set<string>();
  const adds = (e.buildings?.add ?? []).map((d) => ({ ...d, ...e.buildings?.change?.[d.key] }));
  if (adds.length > EDIT_LIMITS.buildings) no(`At most ${EDIT_LIMITS.buildings} new buildings`);
  const plots: Rect[] = BASE_BUILDINGS.filter((b) => !e.buildings?.remove?.includes(b.key)).map((b) => ({
    ...b,
    ...e.buildings?.change?.[b.key],
  }));
  for (const d of adds) {
    if (!fresh(d.key, "building:", bk)) continue;
    const p = PREFABS[d.kind];
    if (!p) {
      no(`${d.key}: not a kind god mode builds`);
      continue;
    }
    const w = d.x1 - d.x0;
    const h = d.z1 - d.z0;
    if (![d.x0, d.z0, d.x1, d.z1].every(Number.isInteger)) no(`${d.key}: its corners on whole metres`);
    if (!(w >= p.min && w <= p.max && h >= p.min && h <= p.max))
      no(`${d.key}: a ${d.kind} is ${p.min}–${p.max} m a side`);
    if (!(d.floors >= 1 && d.floors <= p.floors)) no(`${d.key}: a ${d.kind} has 1–${p.floors} floors`);
    if (!["n", "s", "e", "w"].includes(d.face)) no(`${d.key}: its door's side`);
    else if (d.enter && !NATIVE_FACES[d.kind]?.includes(d.face))
      no(`${d.key}: one you walk into has its door ${NATIVE_FACES[d.kind]?.join(" or ")} (its inside's)`);
    if (d.tint !== undefined && !(WALL_TINTS as readonly string[]).includes(d.tint))
      no(`${d.key}: not one of the walls' colours`);
    if (typeof d.name !== "string" || !d.name.trim() || d.name.length > 40) no(`${d.key}: a name, 40 at most`);
    if (d.sign !== undefined && (typeof d.sign !== "string" || d.sign.length > 24))
      no(`${d.key}: its sign, 24 at most`);
    for (const [x, z] of [
      [d.x0, d.z0],
      [d.x1, d.z0],
      [d.x0, d.z1],
      [d.x1, d.z1],
      [(d.x0 + d.x1) / 2, (d.z0 + d.z1) / 2],
    ]) {
      const a = anchoredHere(x, z);
      if (a || !inWorld(x, z)) {
        no(`${d.key}: on ground that stays as it is (${a?.why ?? "past the world's edge"})`);
        break;
      }
    }
    const over = plots.find((b) => b.x0 < d.x1 && d.x0 < b.x1 && b.z0 < d.z1 && d.z0 < b.z1);
    if (over) no(`${d.key}: on top of ${(over as Building).name ?? "another building"}`);
    const across = wayOver(d);
    if (across) no(`${d.key}: on ${across}`);
    plots.push(d);
  }
  // a generator's building moved: not onto what's anchored, nor onto another
  for (const [k, c] of Object.entries(e.buildings?.change ?? {})) {
    const base = BASE_BUILDINGS.find((b) => b.key === k);
    if (!base || !c || !["x0", "z0", "x1", "z1"].some((f) => f in c)) continue;
    const d = { ...base, ...c };
    if ([d.x0, d.z0, d.x1, d.z1].some((v) => !Number.isInteger(v))) no(`${k}: its corners on whole metres`);
    const hit = [
      [d.x0, d.z0],
      [d.x1, d.z1],
      [(d.x0 + d.x1) / 2, (d.z0 + d.z1) / 2],
    ].find(([x, z]) => anchoredHere(x, z) || !inWorld(x, z));
    if (hit) no(`${k}: moved onto ground that stays as it is`);
    const over = plots.find(
      (b) => b !== d && (b as Building).key !== k && b.x0 < d.x1 && d.x0 < b.x1 && b.z0 < d.z1 && d.z0 < b.z1,
    );
    if (over) no(`${k}: on top of ${(over as Building).name ?? "another building"}`);
  }
  // things
  const tk = new Set<string>();
  const things = (e.things?.add ?? []).map((d) => ({ ...d, ...e.things?.change?.[d.key] }));
  if (things.length > EDIT_LIMITS.things) no(`At most ${EDIT_LIMITS.things} new things`);
  for (const d of things) {
    if (!fresh(d.key, "", tk)) continue;
    if (!THING_KINDS.has(d.kind)) no(`${d.key}: not a kind of thing`);
    if (!inWorld(d.x, d.z) || anchoredHere(d.x, d.z)) no(`${d.key}: on ground that stays as it is`);
    if (![d.x, d.z, d.ry].every(Number.isFinite)) no(`${d.key}: where it is, which way`);
    if (d.s !== undefined && !(d.kind === "boulder" || d.kind === "planter"))
      no(`${d.key}: only a boulder or a planter is sized`);
    if (d.s !== undefined && !(d.s >= THING_SIZE.min && d.s <= THING_SIZE.max))
      no(`${d.key}: ${THING_SIZE.min}–${THING_SIZE.max} times its size`);
    if (d.text !== undefined && (d.kind !== "sign" || typeof d.text !== "string" || d.text.length > SIGN_TEXT))
      no(`${d.key}: a sign's words, ${SIGN_TEXT} at most`);
    if (d.kind === "fence") {
      const ok =
        Array.isArray(d.pts) &&
        d.pts.length >= 2 &&
        d.pts.length <= EDIT_LIMITS.wayPts &&
        d.pts.every((p, i, all) => i === 0 || Math.hypot(p[0] - all[i - 1][0], p[1] - all[i - 1][1]) <= FENCE_RUN);
      if (!ok) no(`${d.key}: a fence's line: 2–${EDIT_LIMITS.wayPts} points, each run ${FENCE_RUN} m at most`);
      else if (fenceLine(d.pts as P[]).some(([x, z]) => !inWorld(x, z) || anchoredHere(x, z)))
        no(`${d.key}: through ground that stays as it is`);
    } else if (d.pts !== undefined) no(`${d.key}: only a fence has a line`);
  }
  // a generator's thing moved: not onto what's anchored either
  for (const [k, c] of Object.entries(e.things?.change ?? {}))
    if (!e.things?.add?.some((d) => d.key === k) && c && (c.x !== undefined || c.z !== undefined)) {
      const x = c.x ?? 0;
      const z = c.z ?? 0;
      if (!inWorld(x, z) || anchoredHere(x, z)) no(`${k}: moved onto ground that stays as it is`);
    }
  return out;
}
