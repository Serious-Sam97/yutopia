import { KART_GROUND } from "./kart/land.ts";

// The land as data (docs/plan/69-the-long-road.md, L1): what there is of the world is a list of
// regions, not a box written out by hand. Each has the ground people may reach (`reach`) and the
// ground drawn round it (`drawn`: the ridges past the reach, scenery). Everything else follows:
//   - how far a spot is beyond what anyone can reach (`beyondLand`: the ridges rise from it, the
//     walking and the edits stop by it);
//   - the box round all of it (`landBounds`, what GROUNDS was) and its chunks (`landChunks`);
//   - the rectangles the physics world walls in (`reachRects`).
// Today's world is two rects, the core and the Kart Park's ground (plan 46), and with them every
// chunk is what it was (grounds-edits.test's hashes). Ribbons (a polyline and a half-width) are
// for the long road's band (phase 3).
// Building coords (metres; x east, z south). Kept free of grounds.ts: it reads this.

export interface Rect {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
}
export type Biome =
  | "town"
  | "field"
  | "forest"
  | "gorge"
  | "alpine"
  | "lake"
  // (god mode's grown land: grounds-edits.ts GrowBiome)
  | "meadow"
  | "hills"
  | "mountains"
  | "farmland"
  | "beach"
  | "desert";
export type Reach = ({ kind: "rect" } & Rect) | { kind: "ribbon"; line: [number, number][]; half: number };
export interface Region {
  key: string;
  biome: Biome;
  reach: Reach;
  /** the ground drawn: its reach and the scenery round it (chunks are made over this) */
  drawn: Rect;
}

/** The Kart Park's land is on (plan 46: in the game since 2026-10-26). */
export const KART_LAND = true;
/** How far past its reach the land rises into scenery before anyone's stopped (walkable's 24). */
export const REACH_MARGIN = 24;

/** Today's world: the core (the campus, the woods, the town) and the Kart Park's ground north of
 *  where the land ended (z −580). Their drawn boxes tile what GROUNDS was. */
export const BASE_LAND: readonly Region[] = [
  {
    key: "core",
    biome: "town",
    reach: { kind: "rect", x0: -400, z0: -580, x1: 528, z1: 172 },
    drawn: { x0: -480, z0: -624, x1: 544, z1: 208 },
  },
  ...(KART_LAND
    ? [
        {
          key: "kart",
          biome: "forest" as const,
          reach: { kind: "rect" as const, ...KART_GROUND },
          drawn: { x0: -480, z0: -960, x1: 544, z1: -624 },
        },
      ]
    : []),
];

let regions: readonly Region[] = BASE_LAND;
let bounds = boundsOf(regions);
/** Bumped whenever the land's regions change: whatever's derived from them is made again. */
export let landVersion = 0;

/** The land's regions now. */
export function landRegions(): readonly Region[] {
  return regions;
}
/** Sets the land's regions (the base and what's added to it). */
export function setLand(next: readonly Region[]) {
  regions = next;
  bounds = boundsOf(next);
  landVersion++;
}

function boundsOf(rs: readonly Region[]): Rect {
  const b = { x0: Number.POSITIVE_INFINITY, z0: Number.POSITIVE_INFINITY, x1: -Infinity, z1: -Infinity };
  for (const r of rs) {
    b.x0 = Math.min(b.x0, r.drawn.x0);
    b.z0 = Math.min(b.z0, r.drawn.z0);
    b.x1 = Math.max(b.x1, r.drawn.x1);
    b.z1 = Math.max(b.z1, r.drawn.z1);
  }
  return b;
}
/** Today's box (what GROUNDS was, before the long road: BASE_LAND's): the tests over the town. */
export function townBounds(): Readonly<Rect> {
  return boundsOf(BASE_LAND);
}
/** The box round all the land drawn. */
export function landBounds(): Readonly<Rect> {
  return bounds;
}
/** Whether (x, z) is inside the land's box (edges in). */
export function inLandBounds(x: number, z: number, margin = 0): boolean {
  return x >= bounds.x0 + margin && x <= bounds.x1 - margin && z >= bounds.z0 + margin && z <= bounds.z1 - margin;
}

/** Whether the box x0…x1, z0…z1 (far edges out) meets any region's drawn land. */
export function overlapsLand(x0: number, z0: number, x1: number, z1: number): boolean {
  for (const r of regions) {
    const d = r.drawn;
    if (x0 < d.x1 && x1 > d.x0 && z0 < d.z1 && z1 > d.z0) return true;
  }
  return false;
}
/** Whether (x, z) is on the land drawn: in a region's drawn box (its far edges out). */
export function inLandDrawn(x: number, z: number): boolean {
  for (const r of regions) {
    const d = r.drawn;
    if (x >= d.x0 && x < d.x1 && z >= d.z0 && z < d.z1) return true;
  }
  return false;
}

/** How far (x, z) is beyond a region's reach: by the larger axis for a rect (the ridges' square
 *  corners, as they were), straight out for a ribbon. */
export function beyondReach(r: Reach, x: number, z: number): number {
  if (r.kind === "rect") return Math.max(r.x0 - x, x - r.x1, r.z0 - z, z - r.z1, 0);
  const L = r.line;
  let best = Number.POSITIVE_INFINITY;
  for (let i = 0; i + 1 < L.length; i++) {
    const [ax, az] = L[i];
    const [bx, bz] = L[i + 1];
    const dx = bx - ax;
    const dz = bz - az;
    const l2 = dx * dx + dz * dz;
    const t = l2 > 0 ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2)) : 0;
    best = Math.min(best, Math.hypot(x - ax - dx * t, z - az - dz * t));
  }
  return Math.max(0, best - r.half);
}
/** How far (x, z) is beyond the land anyone can reach: 0 on it; the ridges rise from it. */
export function beyondLand(x: number, z: number): number {
  return beyondOf(regions, x, z);
}
/** …beyond these regions' reach. */
export function beyondOf(rs: readonly Region[], x: number, z: number): number {
  let o = Number.POSITIVE_INFINITY;
  for (const r of rs) {
    o = Math.min(o, beyondReach(r.reach, x, z));
    if (o === 0) return 0;
  }
  return o;
}

/** The chunks the land is made of: those whose corner is in a region's drawn box, once each, row
 *  by row (z, then x) as the box's loops went (`of`: these regions' — today's, BASE_LAND). */
export function landChunks(size: number, of: readonly Region[] = regions): [number, number][] {
  const seen = new Set<number>();
  const out: [number, number][] = [];
  for (const r of of) {
    const d = r.drawn;
    for (let cz = Math.floor(d.z0 / size); cz * size < d.z1; cz++)
      for (let cx = Math.floor(d.x0 / size); cx * size < d.x1; cx++) {
        const k = (cx + 32768) * 65536 + (cz + 32768);
        if (seen.has(k)) continue;
        seen.add(k);
        out.push([cx, cz]);
      }
  }
  return out.sort((a, b) => a[1] - b[1] || a[0] - b[0]);
}
/** Whether a chunk is part of the land (its corner in a region's drawn box). */
export function isLandChunk(cx: number, cz: number, size: number): boolean {
  const x = cx * size;
  const z = cz * size;
  for (const r of regions) {
    const d = r.drawn;
    if (x >= Math.floor(d.x0 / size) * size && x < d.x1 && z >= Math.floor(d.z0 / size) * size && z < d.z1) return true;
  }
  return false;
}

/** Where anyone may be (docs/plan/50-the-volume.md): each rect region's reach and the margin past
 *  it, inside the land's box by 2 (walkable()'s `beyond`; the physics world's invisible wall). */
export function reachRects(): Rect[] {
  const out: Rect[] = [];
  for (const r of regions) {
    const R = r.reach;
    if (R.kind !== "rect") continue;
    out.push({
      x0: Math.max(bounds.x0 + 2, R.x0 - REACH_MARGIN),
      z0: Math.max(bounds.z0 + 2, R.z0 - REACH_MARGIN),
      x1: Math.min(bounds.x1 - 2, R.x1 + REACH_MARGIN),
      z1: Math.min(bounds.z1 - 2, R.z1 + REACH_MARGIN),
    });
  }
  return out;
}
