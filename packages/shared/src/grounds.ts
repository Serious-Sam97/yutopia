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
}
export interface Lamp {
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

export const WAYS: Way[] = [
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
if (KART_LAND) WAYS.push(way("kart-road", "road", "Kart Park road", 9, KART_ROAD));

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

export const BUILDINGS: Building[] = [
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
  const xm = (b.x0 + b.x1) / 2;
  return { x0: xm - 2.2, z0: b.z1 - 1.2, x1: xm + 2.2, z1: b.z1 + 2.7 };
}

export const inBuilt = (bd: Building, x: number, z: number) => {
  const r = bd.built ?? bd;
  return x >= r.x0 && x < r.x1 && z >= r.z0 && z < r.z1;
};
/** On the forecourt's islands or posts (a body a little round them)? */
function onForecourt(x: number, z: number, pad = 0): boolean {
  for (const i of FORECOURT.islands) if (Math.abs(x - i.x) < i.hx + pad && Math.abs(z - i.z) < i.hz + pad) return true;
  for (const p of FORECOURT.posts) if (Math.hypot(x - p.x, z - p.z) < 0.3 + pad) return true;
  return false;
}
// two rows of the same townhouse up Church Street
for (let k = 0; k < 7; k++) {
  const z1 = -440 - k * 10;
  BUILDINGS.push(b(`house-w${k}`, "house", "Townhouse", 402, z1 - 8, 412, z1, 2, "e"));
  BUILDINGS.push(b(`house-e${k}`, "house", "Townhouse", 428, z1 - 8, 438, z1, 2, "w"));
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
{
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
  for (const bd of nearBuildings(x, z))
    if (x >= bd.x0 && x < bd.x1 && z >= bd.z0 && z < bd.z1) return inBuilt(bd, x, z) ? "floor" : "walk";
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
  // (none in the gas station's way in, x 306–328: to its corner)
  for (const l of LAMPS) if (l.kind === "town" && l.x > 305 && l.x < 329 && l.z > -399 && l.z < -394) l.x = 329.5;
  LAMPS.push({ x: BENCH.x + 2.2, z: BENCH.z - 1.4, ry: Math.PI, kind: "lone" });
  LAMPS.push({ x: -36, z: -370, ry: Math.PI, kind: "cobra" }); // the gate's
  LAMPS.push({ x: -255, z: -97.4, ry: 0, kind: "porch" }); // the boathouse's
  LAMPS.push({ x: -13, z: -412, ry: 0, kind: "porch" }); // the bus shelter's
  // the Kart Park's floodlights (docs/plan/46-the-karts.md): their light and pools as any lamp's
  if (KART_LAND) for (const f of kartFloods()) LAMPS.push({ x: f.x, z: f.z, ry: f.ry, kind: "flood" });
  // and its others: the road in's corner, the turning circle, the car park's row ends and footway,
  // the paddock's
  if (KART_LAND) {
    const C = KART_CARPARK;
    const g = KART_GATE.x;
    const z1 = KART_FENCE.z1;
    for (const [x, z, ry] of [
      [g + 5.8, -410.4, -2.36],
      [KART_TURN.x + KART_TURN.r + 2, KART_TURN.z, Math.PI],
      [C.x0 + 1.5, (C.z0 + C.aisle[0]) / 2, 0],
      [C.x0 + 1.5, (C.aisle[1] + C.z1) / 2, 0],
      [(C.x0 + C.x1) / 2, C.walk[0] + 0.4, -Math.PI / 2],
      [(C.x0 + C.x1) / 2, C.z1 + 1.2, Math.PI / 2],
    ])
      LAMPS.push({ x, z, ry, kind: "cobra" });
    // the paddock's: down its east edge by the fence, out of the walk from the gate (the user's call)
    for (const dz of [52, 38, 24, 10]) LAMPS.push({ x: g + 12.5, z: z1 - dz, ry: 0, kind: "lone" });
  }
}

/** The town's street furniture (docs/plan/33-the-look.md, phase 4): hydrants, bins, newspaper
 *  boxes along Main Street's kerbs, wooden poles carrying the wires down its north side, benches
 *  and bins round the statue, a stop sign and the street names where Church Street meets Main,
 *  the post office's box. Solid (a tile each, a bench two); `ry` turns its front (+z) to face. */
export interface StreetThing {
  kind: "hydrant" | "bin" | "newsbox" | "pole" | "bench" | "stop" | "streetsign" | "postbox";
  x: number;
  z: number;
  ry: number;
}
export const STREET: StreetThing[] = [];
{
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
      STREET.push({ kind: seq[k++ % seq.length], x, z, ry: side > 0 ? Math.PI : 0 });
    }
  // the poles down the north side, every 26 tiles or so
  for (let x = 306; x < 520; x += 26) {
    let px = x;
    while (!clear(px, -1) || lampNear(px, MZ - 8, 3.5)) px += 2;
    if (px < 524) STREET.push({ kind: "pole", x: px, z: MZ - 8, ry: 0 });
  }
  // round the statue: two benches facing it, a bin by each
  for (const bx of [STATUE.x - 7, STATUE.x + 5]) {
    STREET.push({ kind: "bench", x: bx, z: STATUE.z - 7, ry: 0 });
    STREET.push({ kind: "bin", x: bx + (bx < STATUE.x ? -1.2 : 3.2), z: STATUE.z - 6.6, ry: 0 });
  }
  // where Church Street meets Main: its stop sign, the street names
  STREET.push({ kind: "stop", x: 424.8, z: -415.6, ry: 0 });
  STREET.push({ kind: "streetsign", x: 415.2, z: -415.6, ry: 0 });
  STREET.push({ kind: "postbox", x: 349.6, z: MZ - 7.7, ry: 0 });
}
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
export const SNOW_POLES: { x: number; z: number; ry: number }[] = [];
{
  for (const key of ["driveway", "road", ...(KART_LAND ? ["kart-road"] : [])]) {
    const w = WAYS.find((u) => u.key === key) as Way;
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
        SNOW_POLES.push({ x, z, ry: Math.atan2(nx, nz) });
      }
  }
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
/** The Kart Park's layout to race (docs/plan/47-the-track-changer.md): what's asphalt there
 *  follows it, and the bridge (there for a layout over it: its deck walked, its guard strips not),
 *  so the park's chunks are dropped, to be made again. True if it changed. */
export function setParkLayout(key: string, reverse: boolean): boolean {
  if (!setKartLayout(key, reverse)) return false;
  layoutVersion++;
  const F = KART_FENCE;
  const over = (cx: number, cz: number) =>
    cx * CHUNK + CHUNK > F.x0 - 4 && cx * CHUNK < F.x1 + 4 && cz * CHUNK + CHUNK > F.z0 - 4 && cz * CHUNK < F.z1 + 4;
  for (const [k, c] of chunks) if (over(c.cx, c.cz)) chunks.delete(k);
  // (and the tiles' surfaces kept for walking)
  for (let cz = Math.floor((F.z0 - 4) / CHUNK); cz <= Math.floor((F.z1 + 4) / CHUNK); cz++)
    for (let cx = Math.floor((F.x0 - 4) / CHUNK); cx <= Math.floor((F.x1 + 4) / CHUNK); cx++)
      surfaces.delete(chunkKey(cx, cz));
  return true;
}
/** How many times the park's layout changed here (a chunk made elsewhere before: not taken). */
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
        : !onForecourt(x, z, 0.2);
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
const DECKS: Deck[] = WAYS.flatMap((w) => {
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
});
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
