import { campusLot } from "../building.ts";
import {
  BENCH,
  BUILDINGS,
  CHUNK,
  carBlockedTile,
  deckAt,
  fbm,
  GROUNDS,
  heightAt,
  LAMPS,
  lotBanks,
  surfaceTileAt,
  TOWN_CARS,
  treesIn,
} from "../grounds.ts";
import type { Ground } from "./grip.ts";
import type { CarWorld, Solid } from "./sim.ts";

// Where the cars drive (docs/plan/28-the-car.md, M7–M8): the Grounds as the
// sim sees them — their heights, what each spot is (with the roads' slush and
// black ice), and the solids round a point: trunks, lamp posts, buildings, the
// fence and the edge of the world, the parked cars in town. Plus a test pad
// (the sandbox's and the tests'): a strip of every surface, a skid pan, a hill.

/** A road's patches (on asphalt): slush in places; black ice on the bridges and, colder,
 *  in the shaded hollows. The same everywhere — both views paint them from this. */
export function patchAt(x: number, z: number, cold = 0.5): "slush" | "blackice" | null {
  const n = fbm(x / 11, z / 11, 2, 77);
  if (deckAt(x, z) !== null && cold > 0.35) return fbm(x / 6, z / 6, 1, 78) > -0.2 ? "blackice" : null;
  if (cold > 0.6 && fbm(x / 23, z / 23, 2, 79) > 0.55) return "blackice";
  if (n > 0.42) return "slush";
  return null;
}

/** The Grounds' surface for a car: its surface, the roads' patches. */
export function groundAt(x: number, z: number, cold = 0.5): Ground {
  const s = surfaceTileAt(Math.floor(x), Math.floor(z));
  if (s === "asphalt") return patchAt(x, z, cold) ?? "asphalt";
  return s;
}

// the static solids, a chunk at a time
const chunks = new Map<number, Solid[]>();
const key = (cx: number, cz: number) => (cx + 4096) * 8192 + (cz + 4096);
let lotLamps: { x: number; z: number }[] | null = null;
function chunkSolids(cx: number, cz: number): Solid[] {
  const k = key(cx, cz);
  const hit = chunks.get(k);
  if (hit) return hit;
  const out: Solid[] = [];
  const x0 = cx * CHUNK;
  const z0 = cz * CHUNK;
  const x1 = x0 + CHUNK;
  const z1 = z0 + CHUNK;
  // trunks
  for (const t of treesIn(cx, cz))
    out.push({ kind: "circle", x: t.x, z: t.z, r: (t.kind === "pine" ? 0.26 : 0.17) * t.s, what: "tree" });
  // lamp posts (the Grounds', the lot's)
  for (const l of LAMPS)
    if (l.x >= x0 && l.x < x1 && l.z >= z0 && l.z < z1)
      out.push({ kind: "circle", x: l.x, z: l.z, r: 0.14, what: "post" });
  lotLamps ??= campusLot(36).lamps;
  for (const l of lotLamps)
    if (l.x >= x0 && l.x < x1 && l.z >= z0 && l.z < z1)
      out.push({ kind: "circle", x: l.x, z: l.z, r: 0.15, what: "post" });
  // the buildings: whole footprints (no car goes in)
  for (const b of BUILDINGS)
    if (b.x1 > x0 && b.x0 < x1 && b.z1 > z0 && b.z0 < z1) {
      const bx0 = Math.max(b.x0, x0);
      const bx1 = Math.min(b.x1, x1);
      const bz0 = Math.max(b.z0, z0);
      const bz1 = Math.min(b.z1, z1);
      out.push({
        kind: "box",
        x: (bx0 + bx1) / 2,
        z: (bz0 + bz1) / 2,
        hx: (bx1 - bx0) / 2,
        hz: (bz1 - bz0) / 2,
        what: "wall",
      });
    }
  // the plough's banks round the lot: soft, the car ploughs into them and stops
  for (const k of lotBanks())
    if (k.x >= x0 && k.x < x1 && k.z >= z0 && k.z < z1)
      out.push({ kind: "circle", x: k.x, z: k.z, r: Math.min(k.s, k.sz) * 0.85, soft: true, what: "bank" });
  // the town's parked cars
  for (const c of TOWN_CARS)
    if (c.x >= x0 && c.x < x1 && c.z >= z0 && c.z < z1)
      out.push({ kind: "box", x: c.x, z: c.z, hx: 2.45, hz: 1.0, a: c.tilt, what: "car" });
  // the bench in the clearing
  if (BENCH.x + 1 >= x0 && BENCH.x + 1 < x1 && BENCH.z >= z0 && BENCH.z < z1)
    out.push({ kind: "box", x: BENCH.x + 1, z: BENCH.z + 0.5, hx: 1, hz: 0.35, what: "wall" });
  // what a car can't go into (the fence, the tower, the statue, the world's edge): runs along
  // each row, merged down into rectangles (no seams between rows for a car to catch on)
  const open = new Map<string, { a: number; b: number; z: number }>();
  for (let z = z0; z <= z1; z++) {
    const runs = new Set<string>();
    if (z < z1) {
      let run = -1;
      for (let x = x0; x <= x1; x++) {
        const solid = x < x1 && carBlockedTile(x, z) && !inAny(x + 0.5, z + 0.5);
        if (solid && run < 0) run = x;
        if (!solid && run >= 0) {
          const k = `${run},${x}`;
          runs.add(k);
          if (!open.has(k)) open.set(k, { a: run, b: x, z });
          run = -1;
        }
      }
    }
    for (const [k, r] of open)
      if (!runs.has(k)) {
        out.push({
          kind: "box",
          x: (r.a + r.b) / 2,
          z: (r.z + z) / 2,
          hx: (r.b - r.a) / 2,
          hz: (z - r.z) / 2,
          what: "fence",
        });
        open.delete(k);
      }
  }
  chunks.set(k, out);
  return out;
}
function inAny(x: number, z: number): boolean {
  for (const b of BUILDINGS) if (x >= b.x0 && x < b.x1 && z >= b.z0 && z < b.z1) return true;
  return false;
}

export interface GroundsWorldOpts {
  /** how cold it is (night, a storm): more black ice, 0..1 */
  cold?: () => number;
  /** fresh snow on the roads, 0..1 */
  cover?: () => number;
  /** what moves or is placed: the lot's parked cars, the other cars, people */
  extra?: (x: number, z: number, r: number, out: Solid[]) => void;
}

/** The Grounds for the car's sim (building coords). */
export function groundsWorld(o: GroundsWorldOpts = {}): CarWorld {
  const w: CarWorld = {
    height: (x, z) => (x < GROUNDS.x0 || x > GROUNDS.x1 || z < GROUNDS.z0 || z > GROUNDS.z1 ? 0 : heightAt(x, z)),
    ground: (x, z) => groundAt(x, z, o.cold?.() ?? 0.5),
    solids: (x, z, r, out) => {
      const ca = Math.floor((x - r) / CHUNK);
      const cb = Math.floor((x + r) / CHUNK);
      const da = Math.floor((z - r) / CHUNK);
      const db = Math.floor((z + r) / CHUNK);
      for (let cx = ca; cx <= cb; cx++)
        for (let cz = da; cz <= db; cz++)
          for (const s of chunkSolids(cx, cz)) {
            const ext = s.kind === "circle" ? (s.r ?? 0) : Math.hypot(s.hx ?? 0, s.hz ?? 0);
            if (Math.abs(s.x - x) < r + ext && Math.abs(s.z - z) < r + ext) out.push(s);
          }
      o.extra?.(x, z, r, out);
    },
  };
  Object.defineProperty(w, "cover", { get: () => o.cover?.() ?? 0 });
  return w;
}

// ── the test pad ─────────────────────────────────────────────────────────────
// A runway of asphalt down the middle (x −20..20, z −400..400); west of it,
// 120-tile bands of each surface; east, an ice skid pan (r 70) ringed by packed
// snow; at the north end a 15 % hill, at the south rolling bumps; posts and a
// wall to hit.
export const PAD = {
  runway: { x0: -20, x1: 20, z0: -400, z1: 400 },
  bands: [
    ["path", -400],
    ["snow", -280],
    ["deep", -160],
    ["ice", -40],
    ["slush", 80],
    ["blackice", 200],
    ["walk", 320],
  ] as [Ground, number][],
  pan: { x: 130, z: 0, r: 70 },
  hill: { z0: -400, z1: -330 }, // the runway climbs 15 % from z −330 north to −400
  bumps: { z0: 300, z1: 400 },
};

export function padGround(x: number, z: number): Ground {
  if (x >= PAD.runway.x0 && x <= PAD.runway.x1) return "asphalt";
  if (x < PAD.runway.x0) {
    let g: Ground = "path";
    for (const [s, z0] of PAD.bands) if (z >= z0) g = s;
    return x < -200 ? "snow" : g;
  }
  const d = Math.hypot(x - PAD.pan.x, z - PAD.pan.z);
  return d < PAD.pan.r ? "ice" : "path";
}
export function padHeight(x: number, z: number): number {
  let h = 0;
  if (x >= PAD.runway.x0 - 6 && x <= PAD.runway.x1 + 6) {
    if (z < PAD.hill.z1) h = (PAD.hill.z1 - z) * 0.15;
    if (z > PAD.bumps.z0)
      h =
        0.18 * Math.sin((z - PAD.bumps.z0) * 0.9) * Math.sin(x * 0.7 + 1) + 0.12 * Math.sin((z - PAD.bumps.z0) * 0.37);
  }
  return h;
}
const PAD_SOLIDS: Solid[] = [
  // a line of posts beside the runway, a wall across its south end
  ...Array.from({ length: 12 }, (_, i): Solid => ({ kind: "circle", x: 24, z: -200 + i * 12, r: 0.14, what: "post" })),
  { kind: "box", x: 0, z: 402, hx: 30, hz: 1, what: "wall" },
  { kind: "box", x: 0, z: -472, hx: 30, hz: 1, what: "wall" },
  // a few trunks on the snow band
  ...Array.from(
    { length: 10 },
    (_, i): Solid => ({ kind: "circle", x: -60 - i * 9, z: -250 + (i % 3) * 7, r: 0.3, what: "tree" }),
  ),
];
export function padWorld(extra?: Solid[]): CarWorld {
  return {
    height: padHeight,
    ground: padGround,
    solids: (x, z, r, out) => {
      for (const s of PAD_SOLIDS) {
        const ext = s.kind === "circle" ? (s.r ?? 0) : Math.hypot(s.hx ?? 0, s.hz ?? 0);
        if (Math.abs(s.x - x) < r + ext && Math.abs(s.z - z) < r + ext) out.push(s);
      }
      if (extra) for (const s of extra) out.push(s);
    },
  };
}

/** A flat world of one surface (the tests). */
export function flatWorld(g: Ground, slope = 0): CarWorld {
  return { height: (_x, z) => -z * slope, ground: () => g, solids: () => {} };
}
