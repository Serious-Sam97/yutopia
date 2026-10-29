// The Grounds' solids in metres (docs/plan/50-the-volume.md, A): everything out on the land a body
// walks into or flies over, as the boxes and cylinders the physics world (phase 2) merges into one
// compound per 32 m chunk. World coords (x, z as grounds.ts: the building's, z = map y), y absolute
// (the land's height at the thing included). Heights as the 3D view draws them (tp/grounds3d.ts,
// tp/town3d.ts, tp/spot3d.ts, tp/karts3d.ts, tp/kart/park3d.ts, tp/roads3d.ts); footprints as
// grounds.ts `walkable()` and kart/park.ts `kartWalkBlocked` block today, unless the drawing
// clearly differs (GROUND_WHATS says where). Imports grounds.ts: lazy on the client, never the page.
//
// Not here: the land itself (a heightfield in phase 2 from `groundsChunk`'s heights, 2 samples a
// metre, the bridges' decks over it as solids here); the HQ and the east and south blocks (stored
// floors: phase 6, one building); the parking lot's islands and posts (the stored ground floor's,
// lot.ts); every vehicle (the town's parked cars, the tractor, MOTORS' show: car/homes.ts boxes).

import {
  BENCH,
  BUILDINGS,
  type Building,
  CHUNK,
  editsVersion,
  FENCE,
  FENCE_H,
  GATE,
  groundAt,
  INSIDES,
  type Inside,
  KART_BOWL,
  KART_DESK,
  KART_FENCE,
  KART_GATE,
  KART_LAND,
  KART_RACK,
  KART_SHED,
  KART_SIGN,
  KART_STANDS,
  KART_THINGS,
  KART_TOWER,
  KART_TURN,
  kartBridged,
  kartFloods,
  kartSignWings,
  kartTrackNow,
  LAMPS,
  layoutVersion,
  MOTORS,
  PINE_H,
  pineVariant,
  quarter,
  SCARECROWS,
  SNOW_POLES,
  STATUE,
  STREET,
  standRoof,
  steepleOf,
  TOWER,
  terrainAt,
  treesIn,
  turnOf,
  WAYS,
  wallEdgeAt,
  worldRects,
} from "../grounds.ts";
import { KART_FENCE_H } from "../kart/land.ts";
import { DECK_HALF } from "../kart/park.ts";
import { type Blocks, type Solid3, type SolidBox3, WALL_T } from "./index.ts";

export type GroundWhat =
  | "fence"
  | "tree_pine"
  | "tree_birch"
  | "tree_bare"
  | "lamp_cobra"
  | "lamp_town"
  | "lamp_porch"
  | "tower"
  | "tower_fence"
  | "statue"
  | "scarecrow"
  | "bench"
  | "street"
  | "snow_pole"
  | "building"
  | "roof"
  | "building_wall"
  | "fit"
  | "bridge_deck"
  | "bridge_rail"
  | "motors"
  | "forecourt"
  | "kart_fence"
  | "kart_gate"
  | "kart_tower"
  | "kart_desk"
  | "kart_thing"
  | "kart_rack"
  | "kart_shed"
  | "kart_stand"
  | "kart_bowl"
  | "kart_bridge"
  | "kart_flood"
  | "kart_sign"
  | "kart_island"
  | "edge";

export interface GroundSolid {
  what: GroundWhat;
  s: Solid3;
  /** what a body does with it (none given: walks into it) — the benches and the insides' chairs are seats */
  blocks?: Blocks;
}

/** The land isn't solids: a heightfield per chunk (grounds.ts `groundsChunk`, LAT samples a metre). */
export const LAND = { samplesPerTile: 2, note: "the land is the heightfield from groundsChunk (phase 2), not here" };

// ── making boxes ──
// `a`: the box turned about y as three.js turns things (rotation.y: its +x goes to (cos a, −sin a)):
// what tp/ `place(…, ry)` does, so a thing's `ry` is its `a`.
function turned(
  ox: number,
  oz: number,
  a: number,
  lx0: number,
  lz0: number,
  lx1: number,
  lz1: number,
  y0: number,
  y1: number,
): SolidBox3 {
  const lx = (lx0 + lx1) / 2;
  const lz = (lz0 + lz1) / 2;
  const c = Math.cos(a);
  const s = Math.sin(a);
  return {
    t: "box",
    x: ox + lx * c + lz * s,
    y: (y0 + y1) / 2,
    z: oz - lx * s + lz * c,
    hx: Math.abs(lx1 - lx0) / 2,
    hy: Math.abs(y1 - y0) / 2,
    hz: Math.abs(lz1 - lz0) / 2,
    a,
  };
}
const flat = (x0: number, z0: number, x1: number, z1: number, y0: number, y1: number): SolidBox3 => ({
  t: "box",
  x: (x0 + x1) / 2,
  y: (y0 + y1) / 2,
  z: (z0 + z1) / 2,
  hx: Math.abs(x1 - x0) / 2,
  hy: Math.abs(y1 - y0) / 2,
  hz: Math.abs(z1 - z0) / 2,
  a: 0,
});
const cyl = (x: number, z: number, r: number, y0: number, y1: number): Solid3 => ({ t: "cyl", x, z, r, y0, y1 });
/** A wall `t` thick from (ax, az) to (bx, bz), its foot `y0`, `h` tall. */
function along(ax: number, az: number, bx: number, bz: number, t: number, y0: number, y1: number): SolidBox3 {
  const L = Math.hypot(bx - ax, bz - az) || 1e-3;
  return turned((ax + bx) / 2, (az + bz) / 2, Math.atan2(-(bz - az), bx - ax), -L / 2, -t / 2, L / 2, t / 2, y0, y1);
}
/** A run cut into pieces `step` long (each in one chunk), a wall each, its height over the land. */
function run(
  out: GroundSolid[],
  what: GroundWhat,
  ax: number,
  az: number,
  bx: number,
  bz: number,
  step: number,
  t: number,
  h: number,
  skip?: (x: number, z: number) => boolean,
) {
  const L = Math.hypot(bx - ax, bz - az);
  const n = Math.max(1, Math.ceil(L / step));
  for (let i = 0; i < n; i++) {
    const p = [ax + ((bx - ax) * i) / n, az + ((bz - az) * i) / n];
    const q = [ax + ((bx - ax) * (i + 1)) / n, az + ((bz - az) * (i + 1)) / n];
    if (skip?.((p[0] + q[0]) / 2, (p[1] + q[1]) / 2)) continue;
    const g0 = terrainAt(p[0], p[1]);
    const g1 = terrainAt(q[0], q[1]);
    out.push({ what, s: along(p[0], p[1], q[0], q[1], t, Math.min(g0, g1) - 0.2, Math.max(g0, g1) + h) });
  }
}
/** A pitched roof over a rectangle as three boxes stepping in to the ridge (ridge along x if `alongX`). */
function pitched(
  out: GroundSolid[],
  x0: number,
  z0: number,
  x1: number,
  z1: number,
  y: number,
  rise: number,
  alongX: boolean,
) {
  for (let k = 0; k < 3; k++) {
    const i = ((alongX ? z1 - z0 : x1 - x0) / 2) * (k / 3);
    const [a, b, c, d] = alongX ? [x0, z0 + i, x1, z1 - i] : [x0 + i, z0, x1 - i, z1];
    out.push({ what: "roof", s: flat(a, b, c, d, y + (rise * k) / 3, y + (rise * (k + 1)) / 3) });
  }
}

// ── the looks both views pick (world/grounds-look.ts, the client's: the same seeds, kept in step by
// hand — a townhouse's kind sets its walls and roof, a shop's false front) ──
function rngOf(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function houseKind(b: Building): 0 | 1 | 2 {
  return Math.floor(rngOf(b.z0 * 17 + b.x0 * 3 + 11)() * 3) as 0 | 1 | 2;
}
function falseFront(b: Building): boolean {
  const civic = b.key === "hall" || b.key === "post";
  const diner = b.kind === "diner";
  const brick = !civic && !diner && rngOf(b.x0 * 7919 + b.z0 * 31 + 7)() < 0.6;
  return !civic && !diner && (!brick || b.floors === 1);
}

// ── the buildings ──
/** How tall its walls are outside and what's over them. */
function shell(b: Building): { H: number; roof: (out: GroundSolid[], y0: number) => void } {
  const { x0, z0, x1, z1 } = b;
  switch (b.kind) {
    case "gatehouse":
      return {
        H: 2.6,
        roof: (o, y) => o.push({ what: "roof", s: flat(x0 - 0.6, z0 - 0.6, x1 + 0.6, z1 + 0.6, y + 2.6, y + 2.95) }),
      };
    case "boathouse":
      return { H: 3.2, roof: (o, y) => pitched(o, x0, z0, x1, z1, y + 3.2, 2.4, true) };
    case "shed":
      return {
        H: 4,
        roof: (o, y) => o.push({ what: "roof", s: flat(x0 - 0.4, z0 - 0.4, x1 + 0.4, z1 + 0.4, y + 3.95, y + 4.15) }),
      };
    case "house": {
      const k = houseKind(b);
      const H = k === 2 ? 4.2 : 6.4;
      const rise = k === 2 ? 4.4 : k === 1 ? 3.6 : 2.6;
      return { H, roof: (o, y) => pitched(o, x0, z0, x1, z1, y + H, rise, k === 1) };
    }
    case "church":
      return { H: 6, roof: (o, y) => pitched(o, x0, z0, x1, z1, y + 6, 6, false) };
    case "barn":
      // (a gambrel: 2.8 up at the knees 3.2 in, the ridge 4.2 over the eaves)
      return { H: 5.2, roof: (o, y) => pitched(o, x0, z0, x1, z1, y + 5.2, 4.2, true) };
    case "farmhouse":
      return { H: 6.2, roof: (o, y) => pitched(o, x0, z0, x1, z1, y + 6.2, 3, true) };
    default: {
      // the shops (the diner, the bar, the hotel too): 3.8 a floor and a parapet's 0.8
      const H = b.floors * 3.8 + 0.8;
      return { H, roof: (o, y) => o.push({ what: "roof", s: flat(x0, z0, x1, z1, y + H - 0.3, y + H) }) };
    }
  }
}

function building(out: GroundSolid[], b: Building) {
  // (turned: made as its builder draws it, then turned about its plot's middle — grounds.ts turnOf)
  const t = turnOf(b);
  if (t.k) {
    const mine: GroundSolid[] = [];
    building(mine, t.b);
    const cx = (b.x0 + b.x1) / 2;
    const cz = (b.z0 + b.z1) / 2;
    for (const g of mine) {
      const [x, z] = quarter(g.s.x, g.s.z, cx, cz, t.k);
      out.push({ ...g, s: g.s.t === "box" ? { ...g.s, x, z, a: g.s.a + (t.k * Math.PI) / 2 } : { ...g.s, x, z } });
    }
    return;
  }
  const { x0, z0, x1, z1 } = b;
  const y0 = groundAt((x0 + x1) / 2, (z0 + z1) / 2);
  const inside = INSIDES.find((i) => i.b === b);
  if (b.kind === "shelter") {
    // the bus shelter: open to the street (south), glass back and sides, a roof on posts
    out.push({ what: "building", s: flat(x0, z0 - 0.05, x1, z0 + 0.05, y0, y0 + 2.5) });
    for (const x of [x0, x1]) out.push({ what: "building", s: flat(x - 0.05, z0, x + 0.05, z1 - 1, y0, y0 + 2.5) });
    out.push({ what: "roof", s: flat(x0 - 0.3, z0 - 0.3, x1 + 0.3, z1 + 0.3, y0 + 2.5, y0 + 2.7) });
    return;
  }
  if (b.kind === "silo") {
    const R = Math.min(x1 - x0, z1 - z0) / 2 - 0.2;
    out.push({ what: "building", s: cyl((x0 + x1) / 2, (z0 + z1) / 2, R + 0.45, y0, y0 + 13 + R * 0.5) });
    return;
  }
  if (b.kind === "gas") {
    // the kiosk at the back; its forecourt: the islands, the pumps, the canopy on four posts
    // (any gas station's: its own islands and posts, where they're drawn — the town's are these)
    out.push({ what: "building", s: flat(x0 + 2, z1 - 6, x0 + 12, z1, y0, y0 + 3.2) });
    for (const x of [x0 + 7, x1 - 7])
      out.push({ what: "forecourt", s: flat(x - 0.6, z0 + 3.2, x + 0.6, z0 + 6.8, y0, y0 + 0.3) });
    for (const x of [x0 + 7, x1 - 7])
      for (const z of [z0 + 4.5, z0 + 5.5])
        out.push({ what: "forecourt", s: flat(x - 0.37, z - 0.32, x + 0.37, z + 0.32, y0, y0 + 1.92) });
    for (const x of [x0 + 3, x1 - 3])
      for (const z of [z0 + 2, z0 + 8])
        out.push({ what: "forecourt", s: flat(x - 0.25, z - 0.25, x + 0.25, z + 0.25, y0, y0 + 4.6) });
    out.push({ what: "roof", s: flat(x0 + 1, z0, x1 - 1, z0 + 10, y0 + 4.6, y0 + 5.4) });
    return;
  }
  const { H, roof } = shell(b);
  if (inside) insideWalls(out, inside, y0, H);
  else out.push({ what: "building", s: flat(x0, z0, x1, z1, y0, y0 + H) });
  roof(out, y0);
  if (b.kind === "church") {
    // the steeple, south of the nave (out past its plot: grounds.ts steepleOf, walking's too): the
    // tower, its belfry and roof, the spire
    const t = steepleOf(b);
    out.push({ what: "building", s: flat(t.x0, t.z0, t.x1, t.z1, y0, y0 + 13.4) });
    out.push({ what: "building", s: cyl((t.x0 + t.x1) / 2, z1 + 0.75, 0.9, y0 + 13.4, y0 + 21.6) });
  }
  if (["shop", "bar", "diner", "hotel"].includes(b.kind) && falseFront(b)) {
    // the false front: its face's wall standing 1.4 over the roof
    const fz = b.face === "n" ? z0 : z1;
    out.push({ what: "building", s: flat(x0, fz - 0.15, x1, fz + 0.15, y0 + H, y0 + H + 1.4) });
  }
  if (inside) for (const f of inside.fits) fit(out, f, y0);
}

/** One you walk into: a wall on each of its wall edges (grounds.ts `wallEdgeAt`) as tall as its
 *  walls outside, the doorway open to its head, over it the rest. */
function insideWalls(out: GroundSolid[], i: Inside, y0: number, H: number) {
  const { b, door } = i;
  const doorH = b.kind === "barn" ? 2.8 : 2.4;
  const t = WALL_T / 2;
  const wall = (dir: "h" | "v", x: number, z: number, lo: number) =>
    out.push({
      what: "building_wall",
      s: dir === "h" ? flat(x, z - t, x + 1, z + t, y0 + lo, y0 + H) : flat(x - t, z, x + t, z + 1, y0 + lo, y0 + H),
    });
  for (let x = b.x0; x < b.x1; x++)
    for (const z of [b.z0, b.z1]) {
      if (wallEdgeAt("h", x, z)) wall("h", x, z, 0);
      else if (door.dir === "h" && door.at === z) wall("h", x, z, doorH);
    }
  for (let z = b.z0; z < b.z1; z++)
    for (const x of [b.x0, b.x1]) {
      if (wallEdgeAt("v", x, z)) wall("v", x, z, 0);
      else if (door.dir === "v" && door.at === x) wall("v", x, z, doorH);
    }
}

function fit(out: GroundSolid[], f: Inside["fits"][number], y0: number) {
  if (f.kind === "rug" || f.kind === "screens") return; // (underfoot; the gatehouse's screens are on its desk)
  const seat = f.kind === "chair" || f.kind === "stool";
  out.push({
    what: "fit",
    s: flat(f.x, f.z, f.x + f.w, f.z + f.d, y0, y0 + f.h),
    ...(seat ? { blocks: "seat" as const } : {}),
  });
  // (the fireplace's chimney breast to the ceiling)
  if (f.kind === "fireplace")
    out.push({ what: "fit", s: flat(f.x + 0.6, f.z + 0.15, f.x + f.w - 0.6, f.z + f.d, y0 + f.h, y0 + 3) });
}

// ── the bridges over the river and the ravine (WAYS' bridged samples) ──
function bridges(out: GroundSolid[]) {
  for (const w of WAYS) {
    const idx = w.line.map((_, i) => i).filter((i) => w.bridged[i]);
    if (idx.length < 2) continue;
    const a = idx[0];
    const b = idx[idx.length - 1];
    const L = w.line;
    const timber = w.kind === "trail";
    // the deck: a slab a sample long, 0.3 deep, to its edges (w/2 + 0.3), at its middle's height
    // (on a slope a piece's ends are a hair off the road, never a step)
    for (let i = a; i < b; i++) {
      const [ax, az] = L[i];
      const [bx, bz] = L[i + 1];
      const y = (w.h[i] + w.h[i + 1]) / 2 + 0.05;
      const len = Math.hypot(bx - ax, bz - az);
      const o = w.w / 2 + 0.3;
      out.push({
        what: "bridge_deck",
        s: turned((ax + bx) / 2, (az + bz) / 2, Math.atan2(-(bz - az), bx - ax), -len / 2, -o, len / 2, o, y - 0.3, y),
      });
    }
    // the sides: the footbridge's railing (1.05, its posts 1.13), the road's truss (5.2), 3 samples each
    const off = timber ? w.w / 2 + 0.2 : w.w / 2 + 0.7;
    const h = timber ? 1.13 : 5.2;
    for (let i = a; i < b; i += 3) {
      const j = Math.min(b, i + 3);
      for (const s of [1, -1]) {
        const n = (k: number) => {
          const [px, pz] = L[Math.max(a, k - 1)];
          const [qx, qz] = L[Math.min(b, k + 1)];
          const l = Math.hypot(qx - px, qz - pz) || 1;
          return [L[k][0] - ((qz - pz) / l) * s * off, L[k][1] + ((qx - px) / l) * s * off];
        };
        const [px, pz] = n(i);
        const [qx, qz] = n(j);
        const y = Math.min(w.h[i], w.h[j]) + 0.05;
        out.push({
          what: "bridge_rail",
          s: along(px, pz, qx, qz, timber ? 0.12 : 0.36, y, Math.max(w.h[i], w.h[j]) + 0.05 + h),
        });
      }
    }
  }
}

// ── the Kart Park (docs/plan/46-the-karts.md; its own sizes: shared kart/park.ts) ──
function kartPark(out: GroundSolid[]) {
  const F = KART_FENCE;
  const G = KART_GATE;
  // the fence: posts every 3 m, two rails — a wall to its posts' tops; the gate open
  const inGate = (x: number, z: number) => Math.abs(z - G.z) < 1 && Math.abs(x - G.x) < G.w / 2;
  const corners: [number, number][] = [
    [F.x0, F.z0],
    [F.x1, F.z0],
    [F.x1, F.z1],
    [F.x0, F.z1],
  ];
  for (let i = 0; i < 4; i++) {
    const [ax, az] = corners[i];
    const [bx, bz] = corners[(i + 1) % 4];
    run(out, "kart_fence", ax, az, bx, bz, 3, 0.14, KART_FENCE_H, inGate);
  }
  // the gate: two pillars 6.2, the beam with the park's name across at 4.8–6.4
  const gy = terrainAt(G.x, G.z);
  for (const s of [1, -1])
    out.push({
      what: "kart_gate",
      s: flat(G.x + (s * G.w) / 2 - 0.3, G.z - 0.3, G.x + (s * G.w) / 2 + 0.3, G.z + 0.3, gy, gy + 6.2),
    });
  out.push({
    what: "kart_gate",
    s: flat(G.x - G.w / 2 - 0.6, G.z - 0.25, G.x + G.w / 2 + 0.6, G.z + 0.25, gy + 4.8, gy + 6.4),
  });
  // the tower: four legs 7.5, the board 3.2 × 0.5 from 7.3 to 11.5
  {
    const { x, z } = KART_TOWER;
    const y = terrainAt(x, z);
    for (const dx of [-1.2, 1.2])
      for (const dz of [-0.6, 0.6])
        out.push({
          what: "kart_tower",
          s: flat(x + dx - 0.09, z + dz - 0.09, x + dx + 0.09, z + dz + 0.09, y, y + 7.5),
        });
    out.push({ what: "kart_tower", s: flat(x - 1.6, z - 0.25, x + 1.6, z + 0.25, y + 7.3, y + 11.5) });
  }
  // the lobby's desk: a counter 1.2 × 3.6, 1.13 high
  {
    const y = terrainAt(KART_DESK.x, KART_DESK.z);
    out.push({
      what: "kart_desk",
      s: flat(KART_DESK.x - 0.6, KART_DESK.z - 1.8, KART_DESK.x + 0.6, KART_DESK.z + 1.8, y, y + 1.13),
    });
  }
  // what stands about the paddock: its footprint (KART_THINGS), its height as drawn
  const TALL: Record<string, number> = {
    hut: 2.8,
    board: 2.7,
    circuits: 2.6,
    fire: 1.05,
    stand: 1.1,
    tools: 1.05,
    tyres: 0.8,
    podium: 1.0,
    cocoa: 1.3,
    bench: 0.3,
  };
  for (const t of KART_THINGS) {
    const y = terrainAt(t.x, t.z);
    out.push({
      what: "kart_thing",
      s: flat(t.x - t.hx, t.z - t.hz, t.x + t.hx, t.z + t.hz, y, y + (TALL[t.kind] ?? 1)),
      ...(t.kind === "bench" ? { blocks: "seat" as const } : {}),
    });
    // (the podium's backdrop: a board on posts behind its steps, to 3.8)
    if (t.kind === "podium")
      out.push({ what: "kart_thing", s: flat(t.x - t.hx, t.z - t.hz, t.x + t.hx, t.z - t.hz + 0.3, y, y + 3.8) });
  }
  // the rack's karts (0.7 high) and its shed: the back wall (2.9), a post every two bays (3.5), the roof
  {
    const R = KART_RACK;
    const S = KART_SHED;
    for (let i = 0; i < R.n; i++) {
      const z = R.z0 + i * R.dz;
      const y = terrainAt(R.x, z);
      out.push({ what: "kart_rack", s: flat(R.x - 1.1, z - 0.75, R.x + 1.1, z + 0.75, y, y + 0.7) });
    }
    const y = terrainAt((S.x0 + S.x1) / 2, (S.z0 + S.z1) / 2);
    for (let z = S.z0; z < S.z1; z += 8) {
      const z1 = Math.min(S.z1, z + 8);
      out.push({ what: "kart_shed", s: flat(S.x0 - 0.04, z, S.x0 + 0.2, z1, y, y + 2.9) });
      out.push({ what: "kart_shed", s: flat(S.x0, z, S.x1 + 0.6, z1, y + 2.9, y + 3.62) });
    }
    for (let z = S.z0; z <= S.z1 + 1e-6; z += 2 * R.dz)
      out.push({ what: "kart_shed", s: flat(S.x1 - 0.1, z - 0.1, S.x1 + 0.1, z + 0.1, y, y + 3.5) });
  }
  // the stands: a step a row (1.2 deep, 0.45 up), the front wall (1.06), the side walls a rail over
  // the rows, the back wall to the roof, the roof (a slab rising 0.6 to the front) — in ≤ 8 m pieces
  for (const st of KART_STANDS) {
    const xa = Math.min(st.x0, st.x1);
    const xb = Math.max(st.x0, st.x1);
    const y = terrainAt((xa + xb) / 2, st.z);
    const R = standRoof(st);
    const D = st.rows * 1.2;
    for (let x = xa; x < xb - 1e-6; x += 8) {
      const x1 = Math.min(xb, x + 8);
      for (let r = 0; r < st.rows; r++)
        out.push({ what: "kart_stand", s: flat(x, st.z + r * 1.2, x1, st.z + (r + 1) * 1.2, y, y + 0.45 * (r + 1)) });
      out.push({ what: "kart_stand", s: flat(x, st.z - 0.05, x1, st.z + 0.25, y, y + 1.06) });
      out.push({ what: "kart_stand", s: flat(x, st.z + D, x1, st.z + D + 0.3, y, y + R.back) });
      out.push({ what: "kart_stand", s: flat(x, R.zFront, x1, R.zBack, y + R.back, y + R.front + 0.1) });
    }
    for (const x of [xa, xb])
      for (let r = 0; r < st.rows; r++)
        out.push({
          what: "kart_stand",
          s: flat(x - 0.08, st.z + r * 1.2, x + 0.08, st.z + (r + 1) * 1.2, y, y + 0.45 * (r + 1) + 1.06),
        });
  }
  // the bowl: its banks a quarter-pipe from the floor (r 20) up to the rim (3.2 at r 27), the
  // terrace 3 on top, the outside down to the land 3.5 further — in steps, 24 round
  {
    const B = KART_BOWL;
    const y = terrainAt(B.x, B.z);
    const bands: [number, number, number][] = [
      [B.floor, B.floor + 3.5, 0.6],
      [B.floor + 3.5, B.r, 1.8],
      [B.r, B.r + B.rim, B.wall],
      [B.r + B.rim, B.r + B.rim + 3.5, B.wall / 2],
    ];
    const n = 24;
    for (let k = 0; k < n; k++) {
      const a = ((k + 0.5) / n) * Math.PI * 2;
      for (const [r0, r1, h] of bands) {
        const half = Math.tan(Math.PI / n) * r1;
        const rm = (r0 + r1) / 2;
        // (a box tangent to the ring: its local x out from the middle)
        out.push({
          what: "kart_bowl",
          s: turned(
            B.x + Math.cos(a) * rm,
            B.z + Math.sin(a) * rm,
            -a,
            -(r1 - r0) / 2,
            -half,
            (r1 - r0) / 2,
            half,
            y,
            y + h,
          ),
        });
      }
    }
  }
  // the floodlight masts: 13 m, their lamps' heads at the top facing the track
  for (const f of kartFloods()) {
    const y = terrainAt(f.x, f.z);
    out.push({ what: "kart_flood", s: cyl(f.x, f.z, 0.22, y, y + 13) });
    out.push({ what: "kart_flood", s: turned(f.x, f.z, f.ry, -0.05, -0.75, 0.45, 0.75, y + 12.4, y + 13.65) });
  }
  // the billboard on the county road: each wing's face (3–6.4 up) on two posts; the fingerpost
  for (const w of kartSignWings()) {
    const yg = Math.min(terrainAt(w.x0, w.z0), terrainAt(w.x1, w.z1));
    out.push({ what: "kart_sign", s: along(w.x0, w.z0, w.x1, w.z1, 0.3, yg + 2.9, yg + 6.5) });
    for (const t of [0.2, 0.8]) {
      const x = w.x0 + (w.x1 - w.x0) * t - w.nx * 0.25;
      const z = w.z0 + (w.z1 - w.z0) * t - w.nz * 0.25;
      out.push({ what: "kart_sign", s: cyl(x, z, 0.2, terrainAt(x, z), yg + 6.4) });
    }
  }
  {
    const y = terrainAt(KART_SIGN.fx, KART_SIGN.fz);
    out.push({
      what: "kart_sign",
      s: flat(KART_SIGN.fx - 0.07, KART_SIGN.fz - 0.07, KART_SIGN.fx + 0.07, KART_SIGN.fz + 0.07, y, y + 2.7),
    });
  }
  {
    const x = KART_TURN.x;
    const z = KART_TURN.z;
    const y = terrainAt(x, z);
    out.push({ what: "kart_island", s: cyl(x, z, KART_TURN.island, y, y + 0.27) });
    out.push({ what: "kart_island", s: flat(x - 1.4, z - 0.9, x + 1.4, z + 0.9, y, y + 1.6) });
  }
}

/** The park's bridge (for the layouts that go over it: docs/plan/47-the-track-changer.md): its deck
 *  (0.8 deep) and the parapets (0.35, 0.9 over the road) along its raised stretch, 3 samples a piece. */
function kartBridge(out: GroundSolid[]) {
  if (!kartBridged()) return;
  const pts = kartTrackNow().pts;
  const H = DECK_HALF;
  // (a piece a track point long, at its middle's height: up the ramps, a lip never a step)
  for (let i = 0; i + 1 < pts.length; i++) {
    const p = pts[i];
    const q = pts[i + 1];
    if (p.y <= 0.3 && q.y <= 0.3) continue;
    const yp = terrainAt(p.x, p.z);
    const yq = terrainAt(q.x, q.z);
    const top = (yp + p.y + yq + q.y) / 2 + 0.05;
    const bot = Math.min(yp + p.y, yq + q.y) - 0.75;
    const len = Math.hypot(q.x - p.x, q.z - p.z);
    const a = Math.atan2(-(q.z - p.z), q.x - p.x);
    const mx = (p.x + q.x) / 2;
    const mz = (p.z + q.z) / 2;
    out.push({ what: "kart_bridge", s: turned(mx, mz, a, -len / 2, -H, len / 2, H, bot, top) });
    for (const s of [1, -1])
      out.push({
        what: "kart_bridge",
        s: turned(mx, mz, a, -len / 2, s * H, len / 2, s * (H + 0.35), bot, top + 0.85),
      });
  }
}

// ── everything else on the land ──
function things(out: GroundSolid[]) {
  // the company's fence: chain-link on posts every 3 m, to FENCE_H, 0.12 thick; open at the gate
  // (as drawn: x −45 to −28, the gatehouse's stretch too)
  for (let i = 0; i < FENCE.length; i++) {
    const [ax, az] = FENCE[i];
    const [bx, bz] = FENCE[(i + 1) % FENCE.length];
    run(
      out,
      "fence",
      ax,
      az,
      bx,
      bz,
      3,
      0.12,
      FENCE_H,
      (x, z) => Math.abs(z - GATE.z) < 1 && x > GATE.x - 5 && x < GATE.x + 12,
    );
  }
  // the lamps
  for (const l of LAMPS) {
    const y = groundAt(l.x, l.z);
    if (l.kind === "cobra") {
      out.push({ what: "lamp_cobra", s: cyl(l.x, l.z, 0.26, y, y + 0.5) });
      out.push({ what: "lamp_cobra", s: cyl(l.x, l.z, 0.13, y, y + 9) });
      // (its arm and head over the road: 2.5 out along ry)
      out.push({ what: "lamp_cobra", s: turned(l.x, l.z, l.ry, -0.1, -0.21, 2.5, 0.21, y + 8.78, y + 9.1) });
    } else if (l.kind === "porch")
      out.push({ what: "lamp_porch", s: flat(l.x - 0.13, l.z - 0.13, l.x + 0.13, l.z + 0.13, y + 2.22, y + 2.58) });
    else if (l.kind !== "flood") {
      out.push({ what: "lamp_town", s: cyl(l.x, l.z, 0.3, y, y + 0.6) });
      out.push({ what: "lamp_town", s: cyl(l.x, l.z, 0.14, y, y + 4.25) });
      out.push({ what: "lamp_town", s: cyl(l.x, l.z, 0.34, y + 4.25, y + 5.4) });
    }
  }
  // the water tower: its riser (0.9 thick, 24.5), four legs splayed out to under the tank (each in
  // four upright pieces following its lean), the tank (6.6 round, its bowl from 24.3 to 33.3), the
  // walkway round it with its rail (7.6, 26.8–28.0), the roof's cone (as a drum, to 36.9), the vent
  {
    const { x, z } = TOWER;
    const y = terrainAt(x, z);
    out.push({ what: "tower", s: cyl(x, z, 0.45, y, y + 24.5) });
    for (let k = 0; k < 4; k++) {
      const a = Math.PI / 4 + (k * Math.PI) / 2;
      for (let j = 0; j < 4; j++) {
        const r = 2.3 + ((j + 0.5) / 4) * 2.6;
        out.push({
          what: "tower",
          s: cyl(x + Math.cos(a) * r, z + Math.sin(a) * r, 0.5, y + j * 6.05, y + (j + 1) * 6.05),
        });
      }
    }
    out.push({ what: "tower", s: cyl(x, z, 6.6, y + 24.3, y + 33.3) });
    out.push({ what: "tower", s: cyl(x, z, 7.6, y + 26.8, y + 28.0) });
    out.push({ what: "tower", s: cyl(x, z, 3.6, y + 33.3, y + 36.9) });
    out.push({ what: "tower", s: cyl(x, z, 0.35, y + 36.9, y + 38.4) });
    // its fence: chain-link 2.0 on a ring of 9, the gap to the south (x within 1.6)
    const n = 24;
    for (let i = 0; i < n; i++) {
      const p = [x + Math.cos((i * 2 * Math.PI) / n) * 9, z + Math.sin((i * 2 * Math.PI) / n) * 9];
      const q = [x + Math.cos(((i + 1) * 2 * Math.PI) / n) * 9, z + Math.sin(((i + 1) * 2 * Math.PI) / n) * 9];
      if ((p[1] > z && Math.abs(p[0] - x) < 1.6) || (q[1] > z && Math.abs(q[0] - x) < 1.6)) continue;
      const gp = terrainAt(p[0], p[1]);
      const gq = terrainAt(q[0], q[1]);
      out.push({
        what: "tower_fence",
        s: along(p[0], p[1], q[0], q[1], 0.1, Math.min(gp, gq) - 0.2, Math.max(gp, gq) + 2),
      });
    }
  }
  // the statue on Main Street's plaza: its pedestal's steps (4.8 to 0.3, 4.0 to 0.6, 2.8 to 2.9,
  // its cap 3.2 to 3.2) and the figure on it (a coat 0.62 round, its hat to 7.4)
  {
    const { x, z } = STATUE;
    const y = groundAt(x, z);
    out.push({ what: "statue", s: flat(x - 2.4, z - 2.4, x + 2.4, z + 2.4, y, y + 0.3) });
    out.push({ what: "statue", s: flat(x - 2, z - 2, x + 2, z + 2, y + 0.3, y + 0.6) });
    out.push({ what: "statue", s: flat(x - 1.4, z - 1.4, x + 1.4, z + 1.4, y + 0.6, y + 2.9) });
    out.push({ what: "statue", s: flat(x - 1.6, z - 1.6, x + 1.6, z + 1.6, y + 2.9, y + 3.2) });
    out.push({ what: "statue", s: cyl(x, z, 0.62, y + 3.2, y + 7.4) });
  }
  // the farm's scarecrows: a post to 2.6, a body round it, the arms out 1.55
  for (const c of SCARECROWS) {
    const y = terrainAt(c.x, c.z);
    out.push({ what: "scarecrow", s: cyl(c.x, c.z, 0.36, y, y + 2.6) });
    out.push({ what: "scarecrow", s: turned(c.x, c.z, c.ry, -0.78, -0.13, 0.78, 0.13, y + 1.77, y + 2.03) });
  }
  // the clearing's bench: a seat 2 × 0.66 (0.62 up), its back to 1.0
  {
    const y = groundAt(BENCH.x, BENCH.z);
    out.push({
      what: "bench",
      s: flat(BENCH.x - 1, BENCH.z - 0.06, BENCH.x + 1, BENCH.z + 0.6, y, y + 1.0),
      blocks: "seat",
    });
  }
  // the town's street furniture (tp/town3d.ts): at (x, z), turned ry; a bench's middle (x + 1, z + 0.5)
  for (const t of STREET) {
    const y = groundAt(t.x, t.z);
    const b = (lx0: number, lz0: number, lx1: number, lz1: number, y0: number, y1: number) =>
      out.push({ what: "street", s: turned(t.x, t.z, t.ry, lx0, lz0, lx1, lz1, y + y0, y + y1) });
    switch (t.kind) {
      case "hydrant":
        out.push({ what: "street", s: cyl(t.x, t.z, 0.17, y, y + 0.84) });
        break;
      case "bin":
        out.push({ what: "street", s: cyl(t.x, t.z, 0.3, y, y + 0.96) });
        break;
      case "newsbox":
        b(-0.25, -0.22, 0.25, 0.22, 0, 1.18);
        break;
      case "postbox":
        b(-0.26, -0.25, 0.26, 0.25, 0, 1.31);
        break;
      case "pole":
        out.push({ what: "street", s: cyl(t.x, t.z, 0.16, y, y + 8.6) });
        b(-0.07, -1.2, 0.07, 1.2, 7.53, 7.76); // (its crossarm, across the street)
        break;
      case "stop":
        out.push({ what: "street", s: cyl(t.x, t.z, 0.05, y, y + 2.66) });
        b(-0.38, 0.03, 0.38, 0.1, 1.87, 2.63);
        break;
      case "streetsign":
        out.push({ what: "street", s: cyl(t.x, t.z, 0.05, y, y + 3.06) });
        b(-0.2, -0.03, 1.1, 0.03, 2.43, 2.67);
        b(-0.03, -0.2, 0.03, 1.1, 2.7, 2.94);
        break;
      case "bench":
        out.push({
          what: "street",
          s: turned(t.x + 1, t.z + 0.5, t.ry, -1, -0.27, 1, 0.27, y, y + 0.92),
          blocks: "seat",
        });
        break;
      // god mode's own (docs/plan/53-the-god-mode.md, phase 8: tp/town3d.ts draws them)
      case "boulder": {
        const k = t.s ?? 1;
        // (the drawn rock's middle: its points reach 0.85 out, its faces less)
        out.push({ what: "street", s: cyl(t.x, t.z, 0.72 * k, y, y + 1.05 * k) });
        break;
      }
      case "planter": {
        const k = t.s ?? 1;
        b(-0.6 * k, -0.6 * k, 0.6 * k, 0.6 * k, 0, 0.55 * k);
        out.push({ what: "street", s: cyl(t.x, t.z, 0.1 * k, y, y + 2.3 * k) });
        break;
      }
      case "sign":
        out.push({ what: "street", s: cyl(t.x, t.z, 0.06, y, y + 2.05) });
        b(-0.8, -0.04, 0.8, 0.04, 1.3, 2.0);
        break;
      case "fence": {
        // its runs: rails 1.1 high, a box a run (8 m at most a box: the land rolls under it)
        const pts = t.pts ?? [];
        for (let i = 1; i < pts.length; i++) {
          const [ax, az] = pts[i - 1];
          const [bx, bz] = pts[i];
          const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 8));
          for (let k = 0; k < n; k++) {
            const p0 = [ax + ((bx - ax) * k) / n, az + ((bz - az) * k) / n];
            const p1 = [ax + ((bx - ax) * (k + 1)) / n, az + ((bz - az) * (k + 1)) / n];
            const y0 = Math.min(groundAt(p0[0], p0[1]), groundAt(p1[0], p1[1]));
            const y1 = Math.max(groundAt(p0[0], p0[1]), groundAt(p1[0], p1[1]));
            out.push({ what: "street", s: along(p0[0], p0[1], p1[0], p1[1], 0.12, y0, y1 + 1.1) });
          }
        }
        break;
      }
    }
  }
  // the snow poles: orange stakes 1.74 by the roads (thin: in the walking today)
  for (const p of SNOW_POLES) {
    const y = groundAt(p.x, p.z);
    out.push({ what: "snow_pole", s: cyl(p.x, p.z, 0.04, y, y + 1.74) });
  }
  // the car dealer's forecourt (tp/spot3d.ts): the pole sign (posts 4.6, its board 4.55–6.3), the
  // flood poles (5.6, their heads), the collection sign, the low rail (0.75) along the back and east
  {
    const y = groundAt(512, -389);
    for (const [x, z] of MOTORS.signPosts)
      out.push({ what: "motors", s: flat(x - 0.09, z - 0.09, x + 0.09, z + 0.09, y, y + 4.6) });
    const S = MOTORS.sign;
    out.push({ what: "motors", s: flat(S.x - 2.24, S.z - 0.2, S.x + 2.24, S.z + 0.2, y + 4.55, y + 6.29) });
    for (const [x, z] of MOTORS.floods)
      out.push({ what: "motors", s: flat(x - 0.07, z - 0.07, x + 0.07, z + 0.07, y, y + 5.7) });
    const C = MOTORS.collectSign;
    out.push({ what: "motors", s: flat(C.x - 0.04, C.z - 0.04, C.x + 0.04, C.z + 0.04, y, y + 1.5) });
    for (const [x0, z0, x1, z1] of MOTORS.rails) {
      const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, z1 - z0) / 8));
      for (let i = 0; i < n; i++) {
        const a = [x0 + ((x1 - x0) * i) / n, z0 + ((z1 - z0) * i) / n];
        const c = [x0 + ((x1 - x0) * (i + 1)) / n, z0 + ((z1 - z0) * (i + 1)) / n];
        out.push({ what: "motors", s: along(a[0], a[1], c[0], c[1], 0.1, y, y + 0.75) });
      }
    }
  }
  for (const b of BUILDINGS) if (b.kind !== "hq" && !b.stored) building(out, b);
  bridges(out);
  if (KART_LAND) kartPark(out);
}

// ── by chunk ──
const key = (cx: number, cz: number) => `${cx},${cz}`;
const chunkOf = (s: Solid3) => key(Math.floor(s.x / CHUNK), Math.floor(s.z / CHUNK));
// ── the world's edge: an invisible wall round where anyone may be (grounds.ts worldRects, the same
// line walkable() keeps you inside) — from deep under the land to over the highest flier ──
function edge(out: GroundSolid[]) {
  const rects = worldRects();
  const inside = (x: number, z: number, not: number) =>
    rects.some((r, i) => i !== not && x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1);
  const T = 0.2;
  const PIECE = 8;
  for (const [i, r] of rects.entries())
    for (const [ax, az, bx, bz, nx, nz] of [
      [r.x0, r.z0, r.x1, r.z0, 0, -1],
      [r.x0, r.z1, r.x1, r.z1, 0, 1],
      [r.x0, r.z0, r.x0, r.z1, -1, 0],
      [r.x1, r.z0, r.x1, r.z1, 1, 0],
    ]) {
      const len = Math.hypot(bx - ax, bz - az);
      for (let t = 0; t < len; t += PIECE) {
        const u = Math.min(len, t + PIECE);
        const [x0, z0] = [ax + ((bx - ax) * t) / len, az + ((bz - az) * t) / len];
        const [x1, z1] = [ax + ((bx - ax) * u) / len, az + ((bz - az) * u) / len];
        // (none where it's inside the other rectangle: the line between the two is open)
        if (inside((x0 + x1) / 2 + nx * 0.5, (z0 + z1) / 2 + nz * 0.5, i)) continue;
        // (just outside the line: the last tile in is walked whole)
        const ox = nx * (T / 2);
        const oz = nz * (T / 2);
        out.push({
          what: "edge",
          s: flat(
            Math.min(x0, x1) + ox - (nx ? T / 2 : 0),
            Math.min(z0, z1) + oz - (nz ? T / 2 : 0),
            Math.max(x0, x1) + ox + (nx ? T / 2 : 0),
            Math.max(z0, z1) + oz + (nz ? T / 2 : 0),
            -100,
            200,
          ),
        });
      }
    }
}

let fixed: { v: number; by: Map<string, GroundSolid[]> } | null = null;
let bridge: { v: number; by: Map<string, GroundSolid[]> } | null = null;
function bucket(list: GroundSolid[]): Map<string, GroundSolid[]> {
  const by = new Map<string, GroundSolid[]>();
  for (const g of list) {
    const k = chunkOf(g.s);
    const l = by.get(k);
    if (l) l.push(g);
    else by.set(k, [g]);
  }
  return by;
}

/** Every solid of the Grounds whose middle is in chunk (cx, cz) (CHUNK m a side): what the physics
 *  world makes one compound of. The trees are the chunk's own (grounds.ts `treesIn`): a trunk each,
 *  to its tip, its boughs and twigs open. The park's bridge follows its layout (`layoutVersion`):
 *  its chunks are asked again when that changes. */
export function groundSolidsIn(cx: number, cz: number): GroundSolid[] {
  // (made again when god mode's edits are laid: docs/plan/53-the-god-mode.md)
  if (fixed?.v !== editsVersion) {
    const all: GroundSolid[] = [];
    things(all);
    edge(all);
    fixed = { v: editsVersion, by: bucket(all) };
  }
  if (KART_LAND && bridge?.v !== layoutVersion) {
    const l: GroundSolid[] = [];
    kartBridge(l);
    bridge = { v: layoutVersion, by: bucket(l) };
  }
  const out = [...(fixed.by.get(key(cx, cz)) ?? []), ...(bridge?.by.get(key(cx, cz)) ?? [])];
  for (const t of treesIn(cx, cz)) {
    // (as tp/grounds-stream.ts sizes them: a pine 1.45 × its scale, a bare tree 1.7 ×, `sy` taller;
    // set 0.25 into the snow)
    const sy = 0.9 + (t.s % 0.2);
    const [what, r, h]: [GroundWhat, number, number] =
      t.kind === "pine"
        ? ["tree_pine", 0.3 * 1.45 * t.s, PINE_H[pineVariant(t)] * 1.45 * t.s * sy]
        : t.kind === "birch"
          ? ["tree_birch", 0.17 * t.s, 9 * t.s * sy]
          : ["tree_bare", 0.2 * 1.7 * t.s, 2.4 * 1.7 * t.s * sy];
    out.push({ what, s: cyl(t.x, t.z, r, t.y - 0.25, t.y - 0.25 + h) });
  }
  return out;
}

export const GROUND_WHATS: Record<GroundWhat, { label: string; how: string; odd?: string }> = {
  fence: {
    label: "The company's fence",
    how: "a wall 0.12 thick along the fence line in 3 m pieces, from 0.2 under the land to 1.2 over it (the chain-link, its posts and top rail; lowered from 2.45 with its barbed-wire arms, 2026-10-27, so a flier at 2 m clears it); open at the gate",
    odd: "on the grid a wall on the tiles' edges (thin as drawn), open where the drawing is: x −43…−28; cars keep the old band",
  },
  tree_pine: {
    label: "Spruce",
    how: "a trunk 0.3 × 1.45 × its scale round (~0.44), from 0.25 in the snow to its tip (10.5 × 1.45 × scale × sy, ~15 m); its boughs open",
    odd: "trunk only (the plan's recommended answer, open question: or the canopy solid too?). Walking blocks the tree's whole tile (iso, paths: the grid's coarse); the trunk is round, a hair into the tiles round it",
  },
  tree_birch: {
    label: "Birch",
    how: "a trunk 0.17 × scale round, 9 × scale × sy tall; its branches open",
    odd: "trunk only (open question); walking blocks the whole tile today",
  },
  tree_bare: {
    label: "Bare tree",
    how: "its trunk to where it first forks: 0.2 × 1.7 × scale round, 2.4 × 1.7 × scale × sy tall; the limbs open",
    odd: "trunk only (open question); walking blocks the whole tile today",
  },
  lamp_cobra: {
    label: "Street lamp (cobra)",
    how: "its foot (0.26 round, 0.5), the pole (0.13 round, 9) and its arm and head reaching 2.5 over the road (8.78–9.1)",
  },
  lamp_town: {
    label: "Town / lone lamp",
    how: "its foot (0.3, 0.6), the post (0.14, 4.25), the lantern and cap (0.34, 4.25–5.4)",
  },
  lamp_porch: {
    label: "Porch lamp",
    how: "a box 0.26 square, 2.22–2.58 up (on its wall)",
    odd: "not in the walking today (it's on a wall); a flier hits it",
  },
  tower: {
    label: "The water tower",
    how: "the riser (0.9, to 24.5), four legs splayed from r 2.3 to 4.9 (each 4 upright cylinders 0.5 round), the tank (6.6 round, 24.3–33.3), the walkway and rail (7.6, 26.8–28.0), the roof's cone as a drum (3.6, to 36.9), the vent (to 38.4)",
    odd: "walking blocks a ring of 2.6 round its middle; drawn there: only the riser (0.45) and the legs' feet at 2.3",
  },
  tower_fence: {
    label: "The tower's fence",
    how: "chain-link 2.0 on a ring of 9 m in 24 pieces, 0.1 thick; the gap to the south (x within 1.6)",
  },
  statue: {
    label: "The statue",
    how: "its pedestal's steps (4.8 square to 0.3, 4.0 to 0.6, 2.8 to 2.9, the cap 3.2 to 3.2) and the figure (0.62 round, to 7.4)",
  },
  scarecrow: {
    label: "Scarecrow",
    how: "a cylinder 0.36 round to 2.6 (post, body, head), the arms 1.55 across at 1.77–2.03",
  },
  bench: {
    label: "The clearing's bench",
    how: "a seat: 2 × 0.66, its back to 1.0",
    odd: "the grid blocks the two tiles it's drawn on (x 119–121) since phase 4",
  },
  street: {
    label: "Street furniture",
    how: "hydrant (0.17 round, 0.84), bin (0.3, 0.96), newspaper box (0.5 × 0.44, 1.18), postbox (0.52 × 0.5, 1.31), wooden pole (0.16, 8.6, its crossarm 2.4 across at 7.5), stop sign (pole 2.66, the plate 1.87–2.63), street names (pole 3.06, two blades), bench (a seat 2 × 0.54, 0.92)",
    odd: "drawn at (x, z); walking blocks the tile whose corner that is (floor(x), floor(z)) — half a tile off. The wires between the poles (7.86) aren't solids",
  },
  snow_pole: {
    label: "Snow pole",
    how: "a stake 0.04 round, 1.74",
    odd: "not in the walking today ('only to look at'); solid here, thin",
  },
  building: {
    label: "Building",
    how: "closed ones: a box over the plot to the eaves (boathouse 3.2, shed 4, townhouse 6.4 or 4.2 by its kind, church 6, barn 5.2, farmhouse 6.2, shops 3.8 a floor + 0.8); the silo a cylinder (13 + its dome); the bus shelter's glass back and sides (2.5); the gas station's kiosk (3.2); the church's steeple (to 13.4, its spire 0.9 round to 21.6); a shop's false front 1.4 over its roof",
    odd: "the HQ, east and south blocks aren't here (stored floors: phase 6). The steeple and the bus shelter (walked into, its glass walls on the tiles' edges) are as drawn on the grid too since phase 4. Roof overhangs and the hotel's extras aren't followed",
  },
  roof: {
    label: "Roof",
    how: "flat ones a slab (shops, the shed, the gatehouse's 2.6–2.95, the shelter's, the canopy 4.6–5.4); pitched ones three boxes stepping in to the ridge (boathouse +2.4, townhouses +2.6/3.6/4.4, church +6, barn +4.2, farmhouse +3)",
    odd: "a pitched roof as steps: its slope's outside corners solid a little past the drawing",
  },
  building_wall: {
    label: "Walls of the ones you walk in",
    how: "the diner, bar, market, gatehouse, barn and farmhouse: a wall 0.2 thick on each wall edge (grounds.ts wallEdgeAt) to its eaves outside, the doorway open to 2.4 (the barn's 2.8) with the wall over it",
    odd: "inside they're drawn 2.7 (barn 5.2, farmhouse 3.0) and open above; here the walls and roof are the outside's — the ceiling is the roof",
  },
  fit: {
    label: "Their furniture",
    how: "each fit (grounds.ts fitsOf) as its box, its own height (counters 1.05–1.1, shelves 1.8–2.2, booths 1.2, fridges 2.0–2.4…); chairs and stools seats; the fireplace's chimney breast to 3.0; rugs and the gatehouse's screens none",
  },
  bridge_deck: {
    label: "Bridge decks",
    how: "a slab a sample long, 0.3 deep, w/2 + 0.3 each side of the way's line, its top at the way's height + 0.05",
  },
  bridge_rail: {
    label: "Bridge sides",
    how: "the footbridge's railing (1.13, 0.12 thick, w/2 + 0.2 out), the road bridge's truss sides (5.2, 0.36, w/2 + 0.7 out), 3 samples a piece",
    odd: "the truss's bracing across the top (5.2) isn't a solid: a flier passes between its sides over the road",
  },
  motors: {
    label: "MOTORS' forecourt",
    how: "the pole sign (posts 4.6, its board 4.55–6.3), the flood poles (5.7), the collection sign's pole (1.5), the low rail (0.75) along the back and the east side",
    odd: "the cars on show are vehicles (their own boxes), not here",
  },
  forecourt: {
    label: "Gas station forecourt",
    how: "the pump islands' kerbs (1.2 × 3.6, 0.3), two pumps each (0.74 × 0.64, 1.92), the canopy's four posts (0.5, 4.6)",
  },
  kart_fence: {
    label: "Kart Park fence",
    how: "a wall 0.14 thick in 3 m pieces to 1.0 (its posts; the rails 0.45 and 0.9; lowered from 1.4, 2026-10-27); the gate open",
    odd: "the iso view still draws it 1.15 m (the rail art MOTORS' rails share; iso is being retired)",
  },
  kart_gate: {
    label: "Kart Park gate",
    how: "two pillars 0.6 square to 6.2, the beam with the name across at 4.8–6.4",
  },
  kart_tower: { label: "The park's tower", how: "four legs 0.18 to 7.5, the board 3.2 × 0.5 from 7.3 to 11.5" },
  kart_desk: { label: "The lobby's desk", how: "a counter 1.2 × 3.6, 1.13 high" },
  kart_thing: {
    label: "The paddock's things",
    how: "each KART_THINGS footprint, as tall as drawn: the hut 2.8, the boards 2.6–2.7, the fire barrel 1.05, the kart on its stand 1.1, the tools 1.05, the tyres 0.8, the podium's steps 1.0 (its backdrop to 3.8), the cocoa cart 1.3; the benches seats (0.3)",
    odd: "the tyres, the kart on its stand and the cocoa cart's umbrella approximate (not measured)",
  },
  kart_rack: { label: "The rack's karts", how: "eight boxes 2.2 × 1.5, 0.7 high (as walking blocks them)" },
  kart_shed: {
    label: "The rack's shed",
    how: "its back wall (2.9), a post every two bays at the front (3.5), the roof (2.9–3.62, to 0.6 past the front)",
  },
  kart_stand: {
    label: "The stands",
    how: "a step a row (1.2 deep, 0.45 up), the front wall (1.06), the side walls (a rail's height over the rows), the back wall up to the roof, the roof (a slab rising 0.6 to the front) — in ≤ 8 m pieces",
    odd: "the rows are steps 0.45 high: a body steps 0.35 — the folk who sit there are placed, not walked up; the aisles' stairs aren't followed",
  },
  kart_bowl: {
    label: "The battle bowl",
    how: "its banks in steps round its floor (24 round): 0.6 from r 20, 1.8 from 23.5, the rim's terrace 3.2 from 27 to 30, its outside 1.6 to 33.5",
    odd: "a curved bank (a lathe) the karts ride up: steps here; phase 2 should make it a mesh shape (or the land's)",
  },
  kart_bridge: {
    label: "The park's bridge",
    how: "for the layouts over it: the deck (0.8 deep) along its raised stretch and a parapet each side (0.35, 0.9 over the road), 3 samples a piece; it changes with the layout",
    odd: "the ramps' side walls down to the land aren't followed (under the deck is open here)",
  },
  kart_flood: {
    label: "The park's floodlights",
    how: "a mast 0.22 round, 13 m, its head of lamps (1.5 across) at 12.4–13.65 facing the track",
  },
  kart_sign: {
    label: "The billboard",
    how: "each wing's face 2.9–6.5 up (0.3 thick), on two posts (0.2 round); the fingerpost on the corner (0.14, 2.7)",
  },
  kart_island: {
    label: "The turning circle's island",
    how: "the kerb (3.4 round, 0.27), the plinth and its kart (2.8 × 1.8, 1.6)",
  },
  edge: {
    label: "The world's edge",
    how: "an invisible wall 0.2 thick round where anyone may be (grounds.ts worldRects: within 24 of the land's rectangles, as walking keeps you), from 100 under the land to 200 over it, in 8 m pieces",
  },
};
