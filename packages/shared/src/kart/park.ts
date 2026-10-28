// The Kart Park (docs/plan/46-the-karts.md): in a clearing in the woods north of the county road,
// between the gatehouse and the river (land.ts: where, and the ground opened for it). A figure-eight
// circuit of ploughed asphalt that crosses itself over a bridge, the battle bowl walled in its
// west infield, the stands along the start straight, the tower, the gate, the paddock with the
// rack of karts, a car park outside. Pure data, in the Grounds' building coords (metres; x east,
// z south); the land under it is grounds.ts's (its clearing and the park's pad: `KART_LAND`).

import { KART_FENCE, KART_PARK, type P } from "./land.ts";

export * from "./land.ts";

// ── the circuit ─────────────────────────────────────────────────────────────
// Drawn in its own frame (u east, v south, 0 at the crossing) and scaled. Through the crossing
// heading north-east (out of the start straight) it climbs over the bridge; heading north-west
// (out of the east lobe) it runs under it.
const S = 0.9;
/** Drawn west → east, laid east → west: the paddock and the gate end up by the road in. */
const M = -1;
/** A point of the park's own frame on the land. */
const L = (u: number, v: number): P => [KART_PARK.x + M * u * S, KART_PARK.z + v * S];
/** The Figure Eight: the first circuit, the bridge's own (its over-road and its under-road). */
const EIGHT: P[] = [
  [0, 0],
  [-40, -40],
  [-90, -60],
  [-135, -50],
  [-156, -6],
  [-146, 38],
  [-122, 58],
  [-40, 60], // the start straight: west → east along the stands
  [-18, 36],
  [0, 0], // (the crossing again, over the bridge)
  [40, -40],
  [86, -62], // the north straight: the jump
  [134, -56],
  [158, -12],
  [150, 34], // the far hairpin
  [112, 60],
  [62, 56],
  [30, 30],
];

/** The track's width (8 karts side by side on the grid, two by two). */
export const TRACK_W = 12;
/** How high the bridge's road is over the road under it (the deck's top). */
export const BRIDGE_H = 5.6;
/** How long each ramp up to the bridge is (arc length). */
const RAMP = 60;

export interface TrackPoint {
  x: number;
  z: number;
  /** the road's height over the pad */
  y: number;
  /** heading, atan2(dz, dx) */
  a: number;
  /** distance along the lap from the start line */
  s: number;
  /** curvature (1/m, + turning left: to −z of the heading's right…) */
  k: number;
}
export interface Track {
  /** which layout, which way round (docs/plan/47-the-track-changer.md) */
  key: KartLayoutKey;
  reverse: boolean;
  pts: TrackPoint[];
  len: number;
  /** where the track crosses itself: the two distances along the lap, over first */
  cross: { x: number; z: number; over: number; under: number };
  /** the jump: a snow kicker across the track (the first of `jumps`) */
  ramp: { s: number; len: number; h: number };
  /** every jump on the lap */
  jumps: { s: number; len: number; h: number }[];
  /** item box rows: each a distance along the lap (four boxes across) */
  boxes: number[];
  /** boost pads: a distance along the lap and which side (−1 left, 0 middle, 1 right) */
  pads: { s: number; side: number }[];
  /** the grid: eight slots behind the line, two by two */
  grid: { x: number; z: number; a: number }[];
  /** checkpoints, in order (a lap counts when every one is passed) */
  checks: number[];
}

// ── the layouts (docs/plan/47-the-track-changer.md) ─────────────────────────
// Every one down the same start straight (the stands, the tower, the gantry and the grid stay put),
// inside the fence, clear of the bowl, the stands and the paddock. The bridge is there only for a
// layout that goes over it (`both`: over and under, on the Figure Eight's own two roads there; its
// ramps a wall across the park's middle, from the start straight's east end to the north); for the
// rest (`none`) it's ploughed away, the land flat where it stood. Points in the park's
// own frame (u east, v south, as `EIGHT`); the jumps, the item rows and the pads found on the lap by
// place.

export type KartLayoutKey = "eight" | "oval" | "switchback" | "longway";
export interface KartLayout {
  key: KartLayoutKey;
  name: string;
  /** a line about it, for the board's card */
  blurb: string;
  control: P[];
  bridge: "both" | "none";
  jumps: P[];
  boxes: P[];
  /** a pad: where, which side (−1 left, 0 middle, 1 right), metres on from there */
  pads: { at: P; side: number; on?: number }[];
}
export const KART_LAYOUTS: KartLayout[] = [
  {
    key: "eight",
    name: "The Figure Eight",
    blurb: "Over the bridge and under it, the jump on the north straight.",
    control: EIGHT,
    bridge: "both",
    jumps: [[86, -62]],
    boxes: [
      [-110, -58],
      [146, -38],
      [88, 60],
      [-152, 18],
    ],
    pads: [
      { at: [-146, 38], side: 0, on: 6 },
      { at: [150, 34], side: -1, on: 16 },
      { at: [150, 34], side: 1, on: 16 },
      { at: [30, 30], side: 0, on: -4 },
    ],
  },
  {
    key: "oval",
    name: "The Oval",
    blurb: "Flat out: two long straights round the park's edge, slipstream racing. No bridge.",
    control: [
      [-122, 58],
      [-40, 60],
      [0, 69],
      [60, 68],
      [110, 64],
      [142, 50],
      [157, 18],
      [157, -20],
      [142, -48],
      [110, -64],
      [50, -66],
      [-10, -66],
      [-70, -66],
      [-125, -62],
      [-153, -42],
      [-162, -5],
      [-155, 28],
      [-146, 46],
    ],
    bridge: "none",
    jumps: [[20, -66]],
    boxes: [
      [60, 66],
      [157, 0],
      [-40, -66],
      [-162, 0],
    ],
    pads: [
      { at: [100, 64], side: 0 },
      { at: [-90, -66], side: 0 },
    ],
  },
  {
    key: "switchback",
    name: "The Switchback",
    blurb: "An S off the line, a hairpin by the bowl, across the park's middle, two more in the woods' corner.",
    control: [
      [-122, 58],
      [-40, 60],
      [0, 68],
      [36, 66],
      [75, 72],
      [115, 71],
      [140, 71],
      [152, 68.5],
      [159.5, 61],
      [160.5, 51],
      [153.5, 43],
      [140, 41],
      [110, 43],
      [80, 45],
      [52, 40],
      [30, 28],
      [0, 0],
      [-40, -40],
      [-62, -54],
      [-92, -60],
      [-112, -60],
      [-124.7, -54.7],
      [-130, -42],
      [-124.7, -29.3],
      [-112, -24],
      [-84, -23],
      [-58, -22],
      [-44.6, -16.4],
      [-39, -3],
      [-44.6, 10.4],
      [-58, 16],
      [-80, 16],
      [-120, 12],
      [-145, 24],
      [-146, 44],
    ],
    bridge: "none",
    jumps: [[95, 43]],
    boxes: [
      [75, 72],
      [60, 42],
      [-92, -60],
      [-100, 12],
    ],
    pads: [
      { at: [115, 70], side: 0 },
      { at: [-80, -24], side: 0 },
    ],
  },
  {
    key: "longway",
    name: "The Long Way",
    blurb: "The Figure Eight let out to the fence: over the bridge and under it, two jumps.",
    control: [
      [0, 0],
      [-40, -40],
      [-90, -60],
      [-130, -64],
      [-160, -46],
      [-166, -12],
      [-158, 18],
      [-146, 38],
      [-122, 58],
      [-40, 60],
      [-18, 36],
      [0, 0],
      [40, -40],
      [86, -62],
      [134, -56],
      [158, -30],
      [160, 8],
      [154, 44],
      [134, 70],
      [100, 76],
      [62, 56],
      [30, 30],
    ],
    bridge: "both",
    jumps: [
      [86, -62],
      [-164, 0],
    ],
    boxes: [
      [-130, -64],
      [146, -45],
      [100, 76],
      [-164, -20],
    ],
    pads: [
      { at: [160, 8], side: 0 },
      { at: [-146, 38], side: 0, on: 6 },
      { at: [30, 30], side: 0, on: -4 },
    ],
  },
];
export const kartLayout = (key: KartLayoutKey): KartLayout =>
  KART_LAYOUTS.find((l) => l.key === key) ?? KART_LAYOUTS[0];

function catmull(pts: P[], step: number): P[] {
  const n = pts.length;
  const at = (i: number): P => pts[(i + n) % n];
  const out: P[] = [];
  for (let i = 0; i < n; i++) {
    const [p0, p1, p2, p3] = [at(i - 1), at(i), at(i + 1), at(i + 2)];
    const len = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
    const m = Math.max(2, Math.round((len / step) * 4));
    for (let j = 0; j < m; j++) {
      const t = j / m;
      const t2 = t * t;
      const t3 = t2 * t;
      const f = (a: number, b: number, c: number, d: number) =>
        0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  return out;
}
/** A closed polyline resampled to evenly spaced points, as near `step` apart as fits the loop. */
function resample(line: P[], step: number): P[] {
  const n = line.length;
  const seg = line.map((a, i) => Math.hypot(line[(i + 1) % n][0] - a[0], line[(i + 1) % n][1] - a[1]));
  const total = seg.reduce((x, y) => x + y, 0);
  const m = Math.round(total / step);
  const d = total / m;
  const out: P[] = [];
  let i = 0;
  let at = 0; // the distance to line[i]
  for (let k = 0; k < m; k++) {
    const want = k * d;
    while (at + seg[i] < want) at += seg[i++];
    const a = line[i];
    const b = line[(i + 1) % n];
    const t = (want - at) / seg[i];
    out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
  }
  return out;
}

/** The Figure Eight's start straight, in the park's frame: a point every ~10 m from its west end
 *  (−122, 58) to its east (−40, 60). */
function eightStraight(): P[] {
  const t = kartTrack();
  const [xa] = L(-122, 58);
  const [xb] = L(-40, 60);
  const out: P[] = [];
  for (const p of [...t.pts.slice(-90), ...t.pts.slice(0, 60)]) {
    if (p.x > Math.max(xa, xb) + 0.5 || p.x < Math.min(xa, xb) - 0.5) continue;
    const last = out[out.length - 1];
    const uv: P = [(p.x - KART_PARK.x) / (M * S), (p.z - KART_PARK.z) / S];
    if (!last || Math.hypot(uv[0] - last[0], uv[1] - last[1]) >= 10) out.push(uv);
  }
  return out;
}
const memo = new Map<string, Track>();
/** A circuit, a point a metre (memoised): today's Figure Eight unless asked for another layout or
 *  the other way round. */
export function kartTrack(key: KartLayoutKey = "eight", reverse = false): Track {
  const id = `${key}${reverse ? "-r" : ""}`;
  const have = memo.get(id);
  if (have) return have;
  const lay = kartLayout(key);
  // (another layout's start straight is the Figure Eight's own: through its samples, a few metres
  // apart, in place of the straight's two ends — the line, the grid and the gantry where they are)
  // (one that takes the bridge both ways shares the Figure Eight's own points round it already)
  const control =
    lay.bridge === "both"
      ? lay.control
      : lay.control.flatMap(([u, v]) =>
          u === -122 && v === 58 ? eightStraight() : u === -40 && v === 60 ? [] : [[u, v] as P],
        );
  const world = control.map(([u, v]) => L(u, v));
  let line = resample(catmull(world, 1), 1);
  if (reverse) line = line.reverse();
  // the lap starts at the start line: on the start straight, 30 m along it
  const sl = L(-70, 60);
  let i0 = 0;
  let bd = Number.POSITIVE_INFINITY;
  line.forEach(([x, z], i) => {
    const d = Math.hypot(x - sl[0], z - sl[1]);
    if (d < bd) {
      bd = d;
      i0 = i;
    }
  });
  line = [...line.slice(i0), ...line.slice(0, i0)];
  const n = line.length;
  const head = (i: number) => {
    const a = line[(i - 2 + n) % n];
    const b = line[(i + 2) % n];
    return Math.atan2(b[1] - a[1], b[0] - a[0]);
  };
  // the crossing (a layout that takes the bridge both ways): the two samples nearest the bridge,
  // far apart along the lap; over, the one on the bridge's own road (its heading the Figure
  // Eight's over-road's, either way round) — the first out of the start straight, on today's
  let over = -1;
  let under = -1;
  if (lay.bridge === "both") {
    const near = line
      .map(([x, z], i) => ({ i, d: Math.hypot(x - KART_PARK.x, z - KART_PARK.z) }))
      .sort((a, b) => a.d - b.d);
    const c1 = near[0].i;
    const c2 = (near.find((q) => Math.min(Math.abs(q.i - c1), n - Math.abs(q.i - c1)) > 40) ?? near[1]).i;
    const deck = key === "eight" && !reverse ? null : kartTrack();
    const along = (i: number) => {
      if (!deck) return 0;
      let d = head(i) - deck.pts[deck.cross.over].a;
      while (d > Math.PI / 2) d -= Math.PI;
      while (d < -Math.PI / 2) d += Math.PI;
      return Math.abs(d);
    };
    [over, under] = deck ? (along(c1) < along(c2) ? [c1, c2] : [c2, c1]) : [Math.min(c1, c2), Math.max(c1, c2)];
  }
  const pts: TrackPoint[] = line.map(([x, z], i) => {
    // the bridge: a smooth hump either side of the crossing
    const d = over < 0 ? Number.POSITIVE_INFINITY : Math.min(Math.abs(i - over), n - Math.abs(i - over));
    const y = d < RAMP + 10 ? BRIDGE_H * (d < 10 ? 1 : 0.5 + 0.5 * Math.cos((Math.PI * (d - 10)) / RAMP)) : 0;
    const a0 = head(i);
    const a1 = head(i + 1);
    let da = a1 - a0;
    while (da > Math.PI) da -= 2 * Math.PI;
    while (da < -Math.PI) da += 2 * Math.PI;
    return { x, z, y, a: a0, s: i, k: da };
  });
  // what's found on the lap by place
  const sOf = (u: number, v: number) => {
    const [wx, wz] = L(u, v);
    let bi = 0;
    let b = Number.POSITIVE_INFINITY;
    for (const p of pts) {
      const dd = Math.hypot(p.x - wx, p.z - wz);
      if (dd < b) {
        b = dd;
        bi = p.s;
      }
    }
    return bi;
  };
  const grid: Track["grid"] = [];
  for (let g = 0; g < 8; g++) {
    const p = pts[(n - 6 - Math.floor(g / 2) * 7 - (g % 2) * 3.5) | 0];
    const side = g % 2 ? -1 : 1;
    // (the track's left: −z of a heading east, so (sin a, −cos a) … its right the other way)
    grid.push({ x: p.x + Math.sin(p.a) * side * 2.6, z: p.z - Math.cos(p.a) * side * 2.6, a: p.a });
  }
  const jumps = lay.jumps.map(([u, v]) => ({ s: sOf(u, v), len: 7, h: 1.3 }));
  const t: Track = {
    key,
    reverse,
    pts,
    len: n,
    cross:
      over < 0
        ? { x: Number.NaN, z: Number.NaN, over: -1, under: -1 }
        : { x: line[over][0], z: line[over][1], over, under },
    ramp: jumps[0],
    jumps,
    boxes: lay.boxes.map(([u, v]) => sOf(u, v)),
    // (a pad metres on from its place: along the way it's raced)
    pads: lay.pads.map((p) => ({
      s: (sOf(...p.at) + (reverse ? -1 : 1) * (p.on ?? 0) + n) % n,
      side: reverse ? -p.side : p.side,
    })),
    grid,
    checks: [0, 0.18, 0.35, 0.5, 0.68, 0.85].map((f) => Math.round(f * n)),
  };
  memo.set(id, t);
  return t;
}

/** The point `s` metres along the lap (wrapping), between samples. */
export function trackAt(t: Track, s: number): TrackPoint {
  const n = t.len;
  const u = ((s % n) + n) % n;
  const i = Math.floor(u);
  const k = u - i;
  const a = t.pts[i];
  const b = t.pts[(i + 1) % n];
  let da = b.a - a.a;
  while (da > Math.PI) da -= 2 * Math.PI;
  while (da < -Math.PI) da += 2 * Math.PI;
  return {
    x: a.x + (b.x - a.x) * k,
    z: a.z + (b.z - a.z) * k,
    y: a.y + (b.y - a.y) * k,
    a: a.a + da * k,
    s: u,
    k: a.k,
  };
}

// ── around it ───────────────────────────────────────────────────────────────
/** The battle bowl: in the east lobe's infield, a flat floor (`floor` its radius) walled round by
 *  banked snow up to a rim `wall` high at `r` (karts ride up the banks), a terrace `rim` wide on
 *  top to watch from. */
export const KART_BOWL = { x: L(88, -1)[0], z: L(88, -1)[1], r: 27, floor: 20, wall: 3.2, rim: 3 };
/** The stands: two along the start straight's south side, facing north over it. */
export const KART_STANDS = [
  { x0: L(-78, 0)[0], x1: L(-118, 0)[0], z: KART_PARK.z + 60 * S + 13, rows: 6 },
  { x0: L(-26, 0)[0], x1: L(-64, 0)[0], z: KART_PARK.z + 60 * S + 13, rows: 6 },
];
/** The stands' aisles: a stair up each third, no seats on it (their middles; `STAND_AISLE` wide). */
export const STAND_AISLE = 1.2;
export function standAisles(st: (typeof KART_STANDS)[number]): number[] {
  const L = st.x1 - st.x0;
  return [st.x0 + L / 3, st.x0 + (2 * L) / 3];
}
/** How a stand's roof sits (a slab rising to the front, held from the back): its heights over the
 *  pad at the back and front edges, those edges' z. */
export function standRoof(st: (typeof KART_STANDS)[number]) {
  const D = st.rows * 1.2;
  const back = 0.45 * st.rows + 3.2;
  return { back, front: back + 0.6, zBack: st.z + D + 0.6, zFront: st.z - 1.8 };
}
/** A stand's lights (not posts: the views' lights and the dark's pools take them, not LAMPS):
 *  `h` over the pad, how far and how hard it lights; its pool on the ground (`pz`, `pool`). */
export interface StandLight {
  x: number;
  z: number;
  h: number;
  radius: number;
  intensity: number;
  pz: number;
  pool: number;
}
/** The stands' lights: three under each roof over the rows, two floods on its front edge over
 *  the start straight (tp/kart/park3d.ts stands3d draws them). */
export function standLights(): StandLight[] {
  const out: StandLight[] = [];
  for (const st of KART_STANDS) {
    const R = standRoof(st);
    const L = st.x1 - st.x0;
    for (const f of [0.2, 0.5, 0.8]) {
      const z = st.z + st.rows * 0.6;
      out.push({ x: st.x0 + L * f, z, h: R.back - 0.4, radius: 9, intensity: 12, pz: z, pool: 6 });
    }
    for (const f of [0.25, 0.75])
      out.push({ x: st.x0 + L * f, z: R.zFront, h: R.front + 0.2, radius: 20, intensity: 40, pz: st.z - 7, pool: 10 });
  }
  return out;
}
/** The stands' front wall: its depth, from just before the first row's footwell (in the tiles
 *  walked round: the first row's feet just behind it; its boards face the track). */
export const STAND_WALL = 0.3;
/** The tower: the order on its VFD board, over the start line (south side). */
export const KART_TOWER = { x: L(-70, 0)[0], z: KART_PARK.z + 60 * S + 12 };
/** The paddock inside the gate (south-east): concrete from the gate up to the rack of karts in
 *  its shed and the lobby's desk. */
export const KART_PADDOCK = {
  x0: KART_PARK.x + 151,
  z0: KART_PARK.z + 20,
  x1: KART_PARK.x + 179,
  z1: KART_FENCE.z1 - 2,
};
/** The rack: eight karts in a row down the paddock's west side, nosed out east (`a`) into it. */
export const KART_RACK = { x: KART_PARK.x + 154, z0: KART_PARK.z + 28, dz: 4.6, n: 8, a: 0 };
/** The lobby's desk, by the rack's north end; its board faces `face` along x (+1 east). */
export const KART_DESK = { x: KART_RACK.x + 8, z: KART_RACK.z0 - 4, face: 1 as 1 | -1 };
/** The rack's shed: open to the east, a board wall at its back (west), its roof on posts every
 *  two bays. */
export const KART_SHED = {
  x0: KART_RACK.x - 2.8,
  x1: KART_RACK.x + 2.9,
  z0: KART_RACK.z0 - KART_RACK.dz / 2,
  z1: KART_RACK.z0 + (KART_RACK.n - 0.5) * KART_RACK.dz,
};
export type PaddockThing =
  | "hut"
  | "board"
  | "fire"
  | "bench"
  | "stand"
  | "tools"
  | "tyres"
  | "podium"
  | "cocoa"
  | "circuits";
/** What else stands about the paddock (walked round): its middle and half-sizes along x and z.
 *  Race control's hut behind the desk, the lap records' board, a fire barrel and its benches, a
 *  kart up on its stand with the tools and the spare tyres, the podium by the way in, the cocoa
 *  cart past the shed. */
export const KART_THINGS: { kind: PaddockThing; x: number; z: number; hx: number; hz: number }[] = [
  { kind: "hut", x: KART_DESK.x - 2.2, z: KART_DESK.z, hx: 1.6, hz: 3.4 },
  { kind: "board", x: KART_DESK.x + 4, z: KART_PADDOCK.z0 + 0.8, hx: 1.4, hz: 0.2 },
  // (the fire on a tile of its own, the only one round it you walk round; its benches the office's,
  // three tiles each, walked onto and sat on: kartSeats)
  { kind: "fire", x: KART_PARK.x + 170.5, z: KART_PARK.z + 44.5, hx: 0.45, hz: 0.45 },
  { kind: "bench", x: KART_PARK.x + 168.5, z: KART_PARK.z + 44.5, hx: 0.5, hz: 1.5 },
  { kind: "bench", x: KART_PARK.x + 170.5, z: KART_PARK.z + 42.5, hx: 1.5, hz: 0.5 },
  { kind: "bench", x: KART_PARK.x + 172.5, z: KART_PARK.z + 44.5, hx: 0.5, hz: 1.5 },
  { kind: "stand", x: KART_PARK.x + 175, z: KART_PARK.z + 29, hx: 1.1, hz: 0.7 },
  { kind: "tools", x: KART_PARK.x + 172.6, z: KART_PARK.z + 28.4, hx: 0.4, hz: 0.28 },
  { kind: "tyres", x: KART_PARK.x + 177.6, z: KART_PARK.z + 24.2, hx: 0.4, hz: 0.4 },
  { kind: "tyres", x: KART_PARK.x + 177.6, z: KART_PARK.z + 25.2, hx: 0.4, hz: 0.4 },
  { kind: "tyres", x: KART_PARK.x + 176.6, z: KART_PARK.z + 24.2, hx: 0.4, hz: 0.4 },
  { kind: "podium", x: KART_PARK.x + 173, z: KART_PARK.z + 65.4, hx: 4, hz: 1.2 },
  { kind: "cocoa", x: KART_PARK.x + 155, z: KART_PARK.z + 70, hx: 1.5, hz: 0.9 },
  // the board of the circuits (docs/plan/47-the-track-changer.md): by the rack's south end, its
  // face to the way in from the gate; X by it picks the next race's track
  { kind: "circuits", x: KART_PARK.x + 159.5, z: KART_PARK.z + 65.5, hx: 1.3, hz: 0.2 },
];
/** The sign over the gate. */
export const KART_NAME = "YUTOPIA KART PARK";

let floods: { x: number; z: number; ry: number }[] | null = null;
/** The floodlight masts: one set for every layout (docs/plan/47-the-track-changer.md — they don't
 *  move when the track does): each ~10–15 m off the nearest of the layouts' roads, clear of all of
 *  them, of the bridge's ramps, the bowl, the stands and the paddock; picked so every stretch of
 *  every layout (the bridge's deck too) has one within ~36 m, but the ramp's foot ~40 m (a mast
 *  lights ~30 m round), ≥ 30 m apart. Its lamps face the nearest road. */
export function kartFloods(): { x: number; z: number; ry: number }[] {
  if (floods) return floods;
  const roads = KART_LAYOUTS.map((l) => kartTrack(l.key));
  const deck = kartTrack().pts.filter((p) => p.y > 0.3);
  const samples = roads.flatMap((t) => t.pts.filter((_, i) => i % 10 === 0));
  const near = (x: number, z: number) => {
    let d = Number.POSITIVE_INFINITY;
    let at: TrackPoint | null = null;
    for (const t of roads)
      for (let i = 0; i < t.pts.length; i += 2) {
        const p = t.pts[i];
        const e = Math.hypot(p.x - x, p.z - z);
        if (e < d) {
          d = e;
          at = p;
        }
      }
    return { d, at };
  };
  const F = KART_FENCE;
  const cands: { x: number; z: number; ry: number }[] = [];
  for (let x = F.x0 + 4; x < F.x1 - 4; x += 6)
    for (let z = F.z0 + 4; z < F.z1 - 4; z += 6) {
      const { d, at } = near(x, z);
      if (!at || d < TRACK_W / 2 + 4 || d > TRACK_W / 2 + 9) continue;
      if (deck.some((p) => Math.hypot(p.x - x, p.z - z) < TRACK_W / 2 + 6)) continue;
      if (Math.hypot(x - KART_BOWL.x, z - KART_BOWL.z) < KART_BOWL.r + KART_BOWL.rim + 3) continue;
      if (KART_STANDS.some((st) => x > st.x0 - 6 && x < st.x1 + 6 && z > st.z - 14 && z < st.z + st.rows * 1.2 + 6))
        continue;
      if (x > KART_PADDOCK.x0 - 4 && x < KART_PADDOCK.x1 + 4 && z > KART_PADDOCK.z0 - 4) continue;
      if (Math.hypot(x - KART_TOWER.x, z - KART_TOWER.z) < 6) continue;
      cands.push({ x, z, ry: Math.atan2(at.z - z, at.x - x) });
    }
  // (cover every stretch: the mast that lights the most still dark, then the next)
  const out: { x: number; z: number; ry: number }[] = [];
  let dark = samples.slice();
  const REACH = 36;
  while (dark.length) {
    let best: (typeof cands)[number] | null = null;
    let gain = 0;
    for (const c of cands) {
      if (out.some((o) => Math.hypot(o.x - c.x, o.z - c.z) < 30)) continue;
      let n = 0;
      for (const p of dark) if (Math.hypot(p.x - c.x, p.z - c.z) < REACH) n++;
      if (n > gain) {
        gain = n;
        best = c;
      }
    }
    if (!best) break;
    out.push(best);
    const b = best;
    dark = dark.filter((p) => Math.hypot(p.x - b.x, p.z - b.z) >= REACH);
  }
  floods = out;
  return out;
}

// ── the park on the land: what's underfoot, what you walk round, what keeps cars out ───────
// (grounds.ts asks these for a tile: the walking grid, the surfaces, the cars' blocked tiles)

// ── the layout raced now (docs/plan/47-the-track-changer.md): the park's state says (the server
// sets it, everyone follows); what's asphalt underfoot follows it, and the bridge: there only for
// a layout raced over it ──
let now: { key: KartLayoutKey; reverse: boolean } = { key: "eight", reverse: false };
/** The layout raced now. */
export const kartLayoutNow = (): { key: KartLayoutKey; reverse: boolean } => now;
/** The circuit raced now. */
export const kartTrackNow = (): Track => kartTrack(now.key, now.reverse);
/** Is the bridge there (the layout raced now, or `key`, goes over it)? */
export const kartBridged = (key: KartLayoutKey = now.key): boolean => kartLayout(key).bridge === "both";
/** A layout to race (a key not known: the Figure Eight): true if it changed. The Grounds' own
 *  (grounds.ts setParkLayout) also makes the park's land again. */
export function setKartLayout(key: string, reverse: boolean): boolean {
  const k = KART_LAYOUTS.some((l) => l.key === key) ? (key as KartLayoutKey) : "eight";
  if (k === now.key && reverse === now.reverse) return false;
  now = { key: k, reverse };
  return true;
}

const indexes = new Map<string, { cells: Map<number, number[]>; span: Set<number> }>();
const CELL = 8;
const ckey = (cx: number, cz: number) => cx * 65536 + cz;
function kartIndex(t: Track = kartTrack()) {
  const id = `${t.key}${t.reverse ? "-r" : ""}`;
  const index = indexes.get(id);
  if (index) return index;
  const cells = new Map<number, number[]>();
  for (const [i, p] of t.pts.entries()) {
    const k = ckey(Math.floor(p.x / CELL), Math.floor(p.z / CELL));
    const l = cells.get(k);
    if (l) l.push(i);
    else cells.set(k, [i]);
  }
  // the bridge's span: its raised samples over the road under it (open underneath)
  const span = new Set<number>();
  for (const p of t.pts) {
    if (p.y <= 0.05) continue;
    for (const q of t.pts)
      if (
        Math.min(Math.abs(q.s - p.s), t.len - Math.abs(q.s - p.s)) > 60 &&
        Math.hypot(q.x - p.x, q.z - p.z) < TRACK_W + 3
      ) {
        span.add(p.s);
        break;
      }
  }
  const made = { cells, span };
  indexes.set(id, made);
  return made;
}
/** The circuit abreast of (x, z) (either pass at the crossing: the nearer), or null more than
 *  `reach` off its edge (the one raced now, or `t`). */
export function kartOnCircuit(
  x: number,
  z: number,
  reach = 3,
  t: Track = kartTrackNow(),
): { p: TrackPoint; lat: number } | null {
  const { cells } = kartIndex(t);
  const cx = Math.floor(x / CELL);
  const cz = Math.floor(z / CELL);
  let best: { p: TrackPoint; lat: number } | null = null;
  let bd = TRACK_W / 2 + reach;
  for (let i = -1; i <= 1; i++)
    for (let j = -1; j <= 1; j++)
      for (const n of cells.get(ckey(cx + i, cz + j)) ?? []) {
        const p = t.pts[n];
        const along = (x - p.x) * Math.cos(p.a) + (z - p.z) * Math.sin(p.a);
        if (Math.abs(along) > 0.6) continue;
        const lat = (x - p.x) * Math.sin(p.a) - (z - p.z) * Math.cos(p.a);
        if (Math.abs(lat) < bd) {
          bd = Math.abs(lat);
          best = { p, lat };
        }
      }
  return best;
}
// ── the change's show (docs/plan/47-the-track-changer.md, phase 6): Rosa's call, then the ploughs
// out, one a quarter of the new circuit each, its asphalt behind them, the old drifting over; the
// park shut till it's done ──
export const KART_SHOW = {
  /** how long, all told (ms) */
  ms: 10_000,
  /** the ploughs set off, and they're done (ms in) */
  from: 600,
  to: 9_000,
  ploughs: 4,
};
/** How far the ploughs are along their quarters (0..1), `ms` into the show. */
export const kartShowF = (ms: number): number =>
  Math.min(1, Math.max(0, (ms - KART_SHOW.from) / (KART_SHOW.to - KART_SHOW.from)));
// (the show on here: the park's state says — the client's views read it)
let showNow = -1;
/** How far the show's ploughs are (0..1), or −1: no show on. */
export const kartShowNow = (): number => showNow;
export function setKartShow(f: number): void {
  showNow = f;
}
/** Plough `k`'s place on the new circuit, its quarter `f` gone. */
export const kartPloughAt = (t: Track, k: number, f: number): TrackPoint =>
  trackAt(t, ((k + f) * t.len) / KART_SHOW.ploughs);
/** Is the circuit at `s` along it ploughed yet, the ploughs `f` along their quarters? */
export const kartPloughed = (t: Track, s: number, f: number): boolean => {
  const q = t.len / KART_SHOW.ploughs;
  return ((((s % t.len) + t.len) % t.len) % q) / q <= f;
};

// ── the bridge's deck, walked on (docs/plan/47-the-track-changer.md, phase 5: way c) ──
// The Figure Eight's raised stretch, while a layout raced over it is (kartBridged; the Long Way's
// is the same road): its ramps and its span are a road you walk up and over (not under: the land's one height a place; the karts still go under). Its edges
// a guard strip nobody walks, as the river's bridges: wide enough that whoever's on a tile of the
// deck stands on it and whoever's on a tile past the strip on the land.
/** How far off the deck's middle you stand on it (to its parapets). */
export const DECK_HALF = TRACK_W / 2 + 0.4;
/** How far off its middle its height reaches (past the deck's tiles' middles, short of the land's). */
export const DECK_REACH = DECK_HALF + 0.75;
/** The guard strip past the deck's edge (where it's up: its walls and parapets). */
export const DECK_RAIL = 1.6;
let deckBox: { x0: number; z0: number; x1: number; z1: number } | null = null;
/** The bridge's raised stretch abreast of (x, z): its road's height over the pad there and how far
 *  off its middle, or null (off it by more than `DECK_HALF + reach`, or no bridge raced now). */
export function kartDeck(x: number, z: number, reach = DECK_RAIL): { y: number; lat: number } | null {
  if (!kartBridged()) return null;
  const t = kartTrack();
  if (!deckBox) {
    const up = t.pts.filter((p) => p.y > 0.05);
    const m = DECK_HALF + DECK_RAIL + 1;
    deckBox = {
      x0: Math.min(...up.map((p) => p.x)) - m,
      x1: Math.max(...up.map((p) => p.x)) + m,
      z0: Math.min(...up.map((p) => p.z)) - m,
      z1: Math.max(...up.map((p) => p.z)) + m,
    };
  }
  const B = deckBox;
  if (x < B.x0 || x > B.x1 || z < B.z0 || z > B.z1) return null;
  const { cells } = kartIndex(t);
  const cx = Math.floor(x / CELL);
  const cz = Math.floor(z / CELL);
  let best: { p: TrackPoint; lat: number; along: number } | null = null;
  let bd = DECK_HALF + reach;
  for (let i = -1; i <= 1; i++)
    for (let j = -1; j <= 1; j++)
      for (const n of cells.get(ckey(cx + i, cz + j)) ?? []) {
        const p = t.pts[n];
        // (the raised stretch only: at the crossing, the road under it isn't the deck)
        if (p.y <= 0.05) continue;
        const along = (x - p.x) * Math.cos(p.a) + (z - p.z) * Math.sin(p.a);
        // (a sample a metre: off the middle of a bend's outside they're further apart)
        if (Math.abs(along) > 1) continue;
        const lat = (x - p.x) * Math.sin(p.a) - (z - p.z) * Math.cos(p.a);
        if (Math.abs(lat) < bd) {
          bd = Math.abs(lat);
          best = { p, lat, along };
        }
      }
  return best ? { y: trackAt(t, best.p.s + best.along).y, lat: best.lat } : null;
}
/** The deck's road's height over the pad at (x, z), or null off it. */
export function kartDeckAt(x: number, z: number): number | null {
  const d = kartDeck(x, z, DECK_REACH - DECK_HALF);
  return d && Math.abs(d.lat) < DECK_REACH ? d.y + 0.05 : null;
}

const inRect = (x: number, z: number, x0: number, z0: number, x1: number, z1: number) =>
  x >= Math.min(x0, x1) && x < Math.max(x0, x1) && z >= Math.min(z0, z1) && z < Math.max(z0, z1);
const inPark = (x: number, z: number, pad: number) =>
  x > KART_FENCE.x0 - pad && x < KART_FENCE.x1 + pad && z > KART_FENCE.z0 - pad && z < KART_FENCE.z1 + pad;
/** What people walk round in the park: the stands, the tower, the desk, the rack's karts, the bowl's
 *  banked walls, the bridge's guard strips (when it's there). (Its fence is a wall on the tiles'
 *  edges, thin as it's drawn: grounds.ts wallEdgeAt — docs/plan/50-the-volume.md.) */
export function kartWalkBlocked(x: number, z: number): boolean {
  if (!inPark(x, z, 1)) return false;
  for (const s of KART_STANDS) if (inRect(x, z, s.x0, s.z - 0.05, s.x1, s.z + s.rows * 1.2 + 0.4)) return true;
  if (Math.abs(x - KART_TOWER.x) < 1.4 && Math.abs(z - KART_TOWER.z) < 0.8) return true;
  if (Math.abs(x - KART_DESK.x) < 0.7 && Math.abs(z - KART_DESK.z) < 1.9) return true;
  for (const t of KART_THINGS)
    if (t.kind !== "bench" && Math.abs(x - t.x) < t.hx + 0.1 && Math.abs(z - t.z) < t.hz + 0.1) return true;
  // the shed's back wall, its posts
  const S = KART_SHED;
  if (z > S.z0 - 0.3 && z < S.z1 + 0.3) {
    if (Math.abs(x - S.x0) < 0.6) return true;
    const i = Math.round((z - S.z0) / (2 * KART_RACK.dz));
    if (Math.abs(x - S.x1) < 0.6 && Math.abs(z - (S.z0 + i * 2 * KART_RACK.dz)) < 0.6) return true;
  }
  if (
    Math.abs(x - KART_RACK.x) < 1.1 &&
    z > KART_RACK.z0 - 0.8 &&
    z < KART_RACK.z0 + (KART_RACK.n - 1) * KART_RACK.dz + 0.8
  ) {
    const i = Math.round((z - KART_RACK.z0) / KART_RACK.dz);
    if (Math.abs(z - (KART_RACK.z0 + i * KART_RACK.dz)) < 0.75) return true;
  }
  const bd = Math.hypot(x - KART_BOWL.x, z - KART_BOWL.z);
  if (bd > KART_BOWL.floor && bd < KART_BOWL.r + KART_BOWL.rim + 3.5) return true;
  // (the bridge's guard strip, where it's up: the deck itself is walked — kartDeckAt)
  const d = kartDeck(x, z);
  if (d && d.y > 0.3 && Math.abs(d.lat) >= DECK_HALF) return true;
  return false;
}
/** What cars don't get into: the whole park, its gate shut to them (the karts are the park's). */
export function kartCarBlocked(x: number, z: number): boolean {
  return inPark(x, z, 0.6);
}
/** What's underfoot in the park: the circuit's asphalt, the bowl's floor, the paddock's concrete. */
export function kartSurfaceAt(x: number, z: number): "asphalt" | "walk" | null {
  if (!inPark(x, z, 0)) return null;
  if (inRect(x, z, KART_PADDOCK.x0, KART_PADDOCK.z0, KART_PADDOCK.x1, KART_PADDOCK.z1)) return "walk";
  if (Math.hypot(x - KART_BOWL.x, z - KART_BOWL.z) < KART_BOWL.floor) return "asphalt";
  const d = kartDeck(x, z, 0);
  if (d && Math.abs(d.lat) < DECK_HALF) return "asphalt";
  const on = kartOnCircuit(x, z, 0);
  return on && Math.abs(on.lat) < TRACK_W / 2 ? "asphalt" : null;
}

// ── where to sit, who's about ───────────────────────────────────────────────
/** How much of the stands the painted crowd fills in the game (its seats are theirs; the rest
 *  are anyone's). */
export const KART_CROWD = 0.3;
/** A stand seat's draw for the painted crowd (0..1: taken when under the crowd's share). */
export function crowdDraw(x: number, row: number): number {
  const h = Math.sin(x * 12.9898 + row * 78.233) * 43758.5453;
  return h - Math.floor(h);
}
/** A player sat on one of the park's seats (their `busy`: the room leaves their pose alone). */
export const KART_SITTING = "ride:park";
/** How far a sitter's hips rest over the height they're drawn at (the views' chair: 14 iso px). */
export const SIT_HIP = 14 / 39.19;
/** The office's bench (catalog `bench`, art/items/seating.ts): its slats' top. */
export const BENCH_TOP = 11.6 / 39.19;
export interface KartSeat {
  x: number;
  z: number;
  /** the seat's top over the pad */
  top: number;
  /** which way a sitter faces (atan2(dz, dx)) */
  a: number;
  /** where they stand up to */
  out: P;
  /** a stand's (its index, the row) or a bench's */
  stand?: number;
  row?: number;
  /** the painted crowd's (not for anyone else) */
  crowd?: boolean;
}
let seats: KartSeat[] | null = null;
/** Every seat in the park: the stands' rows a seat every 0.75 m, facing the start straight; the
 *  fire's benches three a bench, facing the fire. */
export function kartSeats(): KartSeat[] {
  if (seats) return seats;
  const out: KartSeat[] = [];
  for (const [si, st] of KART_STANDS.entries())
    for (let r = 0; r < st.rows; r++)
      for (let x = st.x0 + 0.5; x < st.x1 - 0.4; x += 0.75) {
        if (standAisles(st).some((a) => Math.abs(x - a) < STAND_AISLE / 2 + 0.2)) continue;
        out.push({
          x,
          z: st.z + 0.75 + r * 1.2,
          top: 0.45 * (r + 1),
          a: -Math.PI / 2,
          out: [x, st.z - 0.9],
          stand: si,
          row: r,
          crowd: crowdDraw(x, r) <= KART_CROWD,
        });
      }
  const fire = KART_THINGS.find((t) => t.kind === "fire");
  for (const b of KART_THINGS) {
    if (b.kind !== "bench" || !fire) continue;
    const along = b.hz > b.hx;
    // (facing the fire: across the bench, its side towards it)
    const a = along ? (fire.x > b.x ? 0 : Math.PI) : fire.z > b.z ? Math.PI / 2 : -Math.PI / 2;
    // (a seat a tile, as the office's bench: walked onto, sat on)
    for (const k of [-1, 0, 1]) {
      const x = b.x + (along ? 0 : k);
      const z = b.z + (along ? k : 0);
      out.push({ x, z, top: BENCH_TOP, a, out: [x + Math.cos(a) * 1.1, z + Math.sin(a) * 1.1] });
    }
  }
  seats = out;
  return out;
}

export type FolkRole = "control" | "mechanic" | "cocoa" | "visitor";
/** The park's people (world-server features/park-life.ts walks them): race control at the desk,
 *  the mechanic at the kart on its stand, the cocoa cart's, and visitors who go between the
 *  cocoa, the fire's benches, the rack, the stands and the podium. */
export const KART_FOLK: { id: string; name: string; role: FolkRole; look: Record<string, string> }[] = [
  {
    id: "rosa",
    name: "Rosa",
    role: "control",
    look: {
      gender: "feminine",
      shoes: "boots",
      body: "slim",
      skin: "#a8693f",
      hair: "bun",
      hairColor: "#1c1410",
      top: "jacket",
      topColor: "#b5562f",
      bottom: "trousers",
      bottomColor: "#2a2018",
      accessory: "headphones",
      accessoryColor: "#20262c",
    },
  },
  {
    id: "joe",
    name: "Joe",
    role: "mechanic",
    look: {
      gender: "masculine",
      shoes: "boots",
      body: "broad",
      skin: "#e4b48e",
      hair: "short",
      hairColor: "#5a3a28",
      top: "shirt",
      topColor: "#3d4a5c",
      bottom: "trousers",
      bottomColor: "#3d4a5c",
      accessory: "cap",
      accessoryColor: "#a5281c",
      beard: "stubble",
    },
  },
  {
    id: "lia",
    name: "Lia",
    role: "cocoa",
    look: {
      gender: "feminine",
      shoes: "boots",
      body: "regular",
      skin: "#f3d2b3",
      hair: "long",
      hairColor: "#c25a2c",
      top: "sweater",
      topColor: "#2f4a3b",
      bottom: "skirt",
      bottomColor: "#4a3324",
      accessory: "beanie",
      accessoryColor: "#f3ead6",
      extra: "scarf",
      extraColor: "#b5562f",
    },
  },
  {
    id: "maya",
    name: "Maya",
    role: "visitor",
    look: {
      gender: "feminine",
      shoes: "boots",
      skin: "#7a4a2a",
      hair: "curly",
      hairColor: "#1c1410",
      top: "jacket",
      topColor: "#e8a33d",
      extra: "scarf",
      extraColor: "#6b2430",
    },
  },
  {
    id: "theo",
    name: "Theo",
    role: "visitor",
    look: {
      gender: "masculine",
      shoes: "boots",
      skin: "#c9a27e",
      hair: "short",
      hairColor: "#3b2a20",
      top: "jacket",
      topColor: "#4a5a73",
      accessory: "beanie",
      accessoryColor: "#b5562f",
    },
  },
  {
    id: "ines",
    name: "Inês",
    role: "visitor",
    look: {
      gender: "feminine",
      shoes: "boots",
      skin: "#e4b48e",
      hair: "bob",
      hairColor: "#2a2018",
      top: "sweater",
      topColor: "#6b2430",
      extra: "scarf",
      extraColor: "#e8a33d",
    },
  },
  {
    id: "ben",
    name: "Ben",
    role: "visitor",
    look: {
      gender: "masculine",
      shoes: "boots",
      skin: "#a8693f",
      hair: "afro",
      hairColor: "#1c1410",
      top: "jacket",
      topColor: "#2f4a3b",
      accessory: "beanie",
      accessoryColor: "#cdbf9f",
    },
  },
];
