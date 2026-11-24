// The town's furnished buildings, laid out by hand (docs/plan/113-the-furniture-by-hand.md): each one's pieces, its
// stairs and its few inside walls in the building's own frame — from its door, so a building moved, turned or
// restyled keeps its room. Measured from life (design/furniture-by-hand/refs.md). The world server lays them with a
// space (structure/spaces.ts laySpace), and the tests hold every layout to the rules (furnishings.test.ts).
//
// The frame: standing outside facing the door. `u` runs along the front wall from its left end (as you face it),
// `v` goes in from the front wall's line; W the front's length, D the depth. A piece's `u, v` is its footprint's
// middle; `face` which way its front looks: "in" (away from the door), "out" (toward the front), "left" (−u),
// "right" (+u). Stairs by their footprint's corner nearest (0, 0) and the way their own door looks.

import { layoutOf } from "../building-styles.ts";
import type { WorldObjectDef } from "../catalog.ts";
import { entry, quarterYaw } from "../catalog.ts";
import type { Building } from "../grounds.ts";
import { STAIRS_D, STAIRS_W } from "../stairs.ts";
import type { XY } from "./types.ts";

export type Face = "in" | "out" | "left" | "right";
export interface Piece {
  kind: string;
  u: number;
  v: number;
  face: Face;
  /** its look (catalog variants) */
  variant?: number;
  /** which storey (0: the ground's) */
  storey?: number;
  /** turned off its face by this many degrees (a chair pulled out askew, a rug laid at an angle) */
  skew?: number;
  /** meant to stand at a window (a sink under it, a guard's desk, a stall's back) */
  atWindow?: boolean;
  /** (plan 123) added to the layout after worlds had it laid: its round of additions (1 and up) — put into a space
   *  laid before once (structure/spaces.ts layoutAdditions), always at the end of the list (its id's by its place) */
  since?: number;
}
export interface Layout {
  /** the staircase on each storey but the top (the same spot each storey up): its corner, where its door looks */
  stairs?: { u: number; v: number; face: Face };
  pieces: Piece[];
  /** inside walls (a room's): from a to b, on a storey, as high as its ceiling */
  walls?: { storey: number; a: XY; b: XY }[];
}

/** A building's frame: its corner, its two axes (world x/y), its front's length and its depth, the quarter turns
 *  from the north-facing frame. By where its layout's door looks (a boathouse's may be its back). */
export function frameOf(b: Building): { o: XY; U: XY; V: XY; W: number; D: number; q: number } | null {
  const L = layoutOf(b);
  if (!L) return null;
  const { ox, oz } = L.door;
  const n = Math.abs(oz) >= Math.abs(ox) ? (oz < 0 ? 0 : 2) : ox > 0 ? 1 : 3;
  const W = n % 2 ? b.z1 - b.z0 : b.x1 - b.x0;
  const D = n % 2 ? b.x1 - b.x0 : b.z1 - b.z0;
  if (n === 0) return { o: [b.x0, b.z0], U: [1, 0], V: [0, 1], W, D, q: 0 };
  if (n === 1) return { o: [b.x1, b.z0], U: [0, 1], V: [-1, 0], W, D, q: 1 };
  if (n === 2) return { o: [b.x1, b.z1], U: [-1, 0], V: [0, -1], W, D, q: 2 };
  return { o: [b.x0, b.z1], U: [0, -1], V: [1, 0], W, D, q: 3 };
}

/** A point of a building's frame in the world's. */
export function toWorld(f: NonNullable<ReturnType<typeof frameOf>>, u: number, v: number): XY {
  return [f.o[0] + f.U[0] * u + f.V[0] * v, f.o[1] + f.U[1] * u + f.V[1] * v];
}

/** A face as a direction in the building's frame. */
export const FACE: Record<Face, XY> = { in: [0, 1], out: [0, -1], left: [-1, 0], right: [1, 0] };
const FACE_QUARTER: Record<Face, number> = { in: 0, left: 1, out: 2, right: 3 };

/** The yaw a piece faces `face` with (a footprint's front is its +v: facing (−sin yaw, cos yaw) in the world). */
export function yawOf(f: NonNullable<ReturnType<typeof frameOf>>, face: Face, skew = 0): number {
  const a = ((FACE_QUARTER[face] + f.q) * Math.PI) / 2 + (skew * Math.PI) / 180;
  const t = ((a % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  return Math.round(t * 1e5) / 1e5;
}

/** Where a layout's staircase stands in the world: its corner tile and quarter turn (stairs.ts: its door on its
 *  v 0 side at rot 0, which looks −y — "out" in the north-facing frame). */
export function stairsAt(b: Building, s: NonNullable<Layout["stairs"]>): { x: number; y: number; rot: number } | null {
  const f = frameOf(b);
  if (!f) return null;
  // (the stairs' door looks −v at rot 0: "out"; a quarter on, +u… — in the frame's own turns)
  const local = { out: 0, right: 1, in: 2, left: 3 }[s.face];
  const [w, h] = local % 2 ? [STAIRS_D, STAIRS_W] : [STAIRS_W, STAIRS_D];
  const cs = [toWorld(f, s.u, s.v), toWorld(f, s.u + w, s.v), toWorld(f, s.u, s.v + h), toWorld(f, s.u + w, s.v + h)];
  const x = Math.round(Math.min(...cs.map((c) => c[0])));
  const y = Math.round(Math.min(...cs.map((c) => c[1])));
  return { x, y, rot: (local + f.q) % 4 };
}

/** Kinds laid on the tiles, not free: their games read them by their corner (tables/pool.ts). */
const ON_TILES = new Set(["pool_table"]);

/** A layout's pieces as things on its storeys (`levels`: the floor of each storey, bottom up), placed free. */
export function layoutThings(b: Building, layout: Layout, levels: number[]): WorldObjectDef[] {
  const f = frameOf(b);
  if (!f) return [];
  const r3 = (v: number) => Math.round(v * 1000) / 1000;
  return layout.pieces.flatMap((p, i) => {
    const level = levels[p.storey ?? 0];
    if (level === undefined) return [];
    const [x, y] = toWorld(f, p.u, p.v);
    // (a game table its game reads by its corner tile — the pool table's balls and cue: placed on the tiles)
    if (ON_TILES.has(p.kind)) {
      const e = entry(p.kind);
      const q = Math.round(yawOf(f, p.face) / (Math.PI / 2)) & 3;
      const [w, h] = q % 2 ? [e.h, e.w] : [e.w, e.h];
      return [
        {
          id: `sp-${b.key}-p${i}`,
          kind: p.kind,
          x: Math.round(x - w / 2),
          y: Math.round(y - h / 2),
          yaw: quarterYaw(q),
          refId: null,
          props: { level, ...(p.variant !== undefined ? { variant: p.variant } : {}) },
        },
      ];
    }
    return [
      {
        id: `sp-${b.key}-p${i}`,
        kind: p.kind,
        x: r3(x),
        y: r3(y),
        yaw: yawOf(f, p.face, p.skew),
        refId: null,
        props: { level, free: true, ...(p.variant !== undefined ? { variant: p.variant } : {}) },
      },
    ];
  });
}

/** The quarter turn a layout's stairs need, as `quarterYaw` would give a thing (for callers that want a yaw). */
export const stairsYaw = (rot: number) => quarterYaw(rot);
