// The building's own solids from its structure (docs/plan/72-the-3d-core.md, phase 7): walls as
// boxes along their segments — any angle, cut where their doors and windows are — and each
// floor's slab as boxes across its polygons, not the tile maps walked edge by edge and tile by
// tile. World metres, Jolt's y up (a floor's height its z).
import { entry, type WorldObjectDef } from "../catalog.ts";
import { CHUNK } from "../grounds.ts";
import { openingCut } from "../openings.ts";
import { box3, type Solid3, type SolidBox3, slabSolid, WALL_T } from "../shapes/index.ts";
import { attachOf, onOf } from "../structure/attach.ts";
import type { Ring, Structure, Wall } from "../structure/types.ts";
import { STOREY, WALL_H } from "../units.ts";

/** A hole in a wall: from `u0` to `u1` along it (m from its `a`), `z0`–`z1` over its base; a
 *  window's has its pane. */
export interface WallCut {
  u0: number;
  u1: number;
  z0: number;
  z1: number;
  pane: boolean;
}

/** The holes things cut in each wall of a floor (by wall id): its doors and windows, where they're
 *  fixed (`props.on`; one not fixed yet found on the spot — structure/attach.ts). */
export function cutsOf(s: Pick<Structure, "walls">, things: Iterable<WorldObjectDef>, floor: number) {
  const out = new Map<string, WallCut[]>();
  for (const o of things) {
    const op = entry(o.kind).opening;
    if (!op) continue;
    const on = onOf(o) ?? attachOf(s, o, floor);
    if (!on) continue;
    const n = Math.max(1, entry(o.kind).w);
    const [z0, z1] = openingCut(o.kind);
    const list = out.get(on.wall) ?? [];
    list.push({ u0: on.at - n / 2, u1: on.at + n / 2, z0, z1, pane: op === "window" });
    out.set(on.wall, list);
  }
  return out;
}

/** A box along a wall from `u0` to `u1` (m from `a`), `y0`–`y1` up (the world's). Along x or y: square
 *  to the world (exactly as the tile maps' were); else turned to the wall's heading. */
export function alongWall(w: Wall, u0: number, u1: number, y0: number, y1: number): SolidBox3 {
  const dx = w.b[0] - w.a[0];
  const dz = w.b[1] - w.a[1];
  const len = Math.hypot(dx, dz) || 1;
  const ux = dx / len;
  const uz = dz / len;
  const t = WALL_T / 2;
  const p = (u: number): [number, number] => [w.a[0] + ux * u, w.a[1] + uz * u];
  const [x0, z0] = p(u0);
  const [x1, z1] = p(u1);
  if (Math.abs(uz) < 1e-9) return box3(Math.min(x0, x1), z0 - t, Math.max(x0, x1), z0 + t, y0, y1);
  if (Math.abs(ux) < 1e-9) return box3(x0 - t, Math.min(z0, z1), x0 + t, Math.max(z0, z1), y0, y1);
  // (a box's `a` turns it as three.js turns things: −heading — as a parked car's, build.ts)
  return {
    t: "box",
    x: (x0 + x1) / 2,
    y: (y0 + y1) / 2,
    z: (z0 + z1) / 2,
    hx: Math.abs(u1 - u0) / 2,
    hy: (y1 - y0) / 2,
    hz: t,
    a: -Math.atan2(uz, ux),
  };
}

/** A wall's solids: its pieces between and round its holes, and the windows' panes. `outside`
 *  (m along it → whether either side of it is out of doors there): the pieces out of doors also
 *  as Flowmotion's runs up a storey (`flow`). */
export function wallPieces(
  w: Wall,
  cuts: readonly WallCut[],
  outside?: (u: number) => boolean,
): { solids: SolidBox3[]; panes: SolidBox3[]; flow: SolidBox3[] } {
  const len = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]);
  const top = w.height;
  const y = (z: number) => w.base + z;
  const solids: SolidBox3[] = [];
  const panes: SolidBox3[] = [];
  const flow: SolidBox3[] = [];
  // where the wall's spans change: its ends, each hole's, and (for Flowmotion) each metre
  const marks = new Set<number>([0, len]);
  for (const c of cuts) {
    marks.add(Math.max(0, Math.min(len, c.u0)));
    marks.add(Math.max(0, Math.min(len, c.u1)));
  }
  if (outside) for (let u = 1; u < len; u++) marks.add(u);
  const us = [...marks].sort((p, q) => p - q);
  for (let i = 1; i < us.length; i++) {
    const [u0, u1] = [us[i - 1], us[i]];
    if (u1 - u0 < 1e-6) continue;
    const mid = (u0 + u1) / 2;
    const cut = cuts.find((c) => c.u0 <= mid && mid <= c.u1);
    const spans: [number, number][] = cut
      ? [
          ...(cut.z0 > 0 ? ([[0, cut.z0]] as [number, number][]) : []),
          ...(Math.min(top, cut.z1) < top ? ([[Math.min(top, cut.z1), top]] as [number, number][]) : []),
        ]
      : [[0, top]];
    const out = outside?.(mid) ?? false;
    for (const [z0, z1] of spans) {
      solids.push(alongWall(w, u0, u1, y(z0), y(z1)));
      // (a piece to the wall's top goes on up to the next storey's floor: the same face outside)
      if (out) flow.push(alongWall(w, u0, u1, y(z0), y(Math.abs(z1 - WALL_H) < 0.01 ? STOREY : z1)));
    }
    if (cut?.pane) panes.push(alongWall(w, u0, u1, y(cut.z0), y(Math.min(top, cut.z1))));
  }
  return merge(solids, panes, flow);
}

// (pieces of one height side by side along a wall merged back into one box: as few bodies as the
// tile maps' runs had)
function merge(solids: SolidBox3[], panes: SolidBox3[], flow: SolidBox3[]) {
  const join = (list: SolidBox3[]) => {
    const out: SolidBox3[] = [];
    for (const b of list) {
      const p = out.find(
        (q) =>
          q.a === b.a &&
          q.a === 0 &&
          Math.abs(q.y - b.y) < 1e-9 &&
          Math.abs(q.hy - b.hy) < 1e-9 &&
          ((Math.abs(q.z - b.z) < 1e-9 && Math.abs(q.hz - b.hz) < 1e-9 && Math.abs(q.x + q.hx - (b.x - b.hx)) < 1e-9) ||
            (Math.abs(q.x - b.x) < 1e-9 && Math.abs(q.hx - b.hx) < 1e-9 && Math.abs(q.z + q.hz - (b.z - b.hz)) < 1e-9)),
      );
      if (!p) {
        out.push({ ...b });
        continue;
      }
      if (Math.abs(p.z - b.z) < 1e-9 && Math.abs(p.hz - b.hz) < 1e-9 && Math.abs(p.x + p.hx - (b.x - b.hx)) < 1e-9) {
        const x0 = p.x - p.hx;
        const x1 = b.x + b.hx;
        p.x = (x0 + x1) / 2;
        p.hx = (x1 - x0) / 2;
      } else {
        const z0 = p.z - p.hz;
        const z1 = b.z + b.hz;
        p.z = (z0 + z1) / 2;
        p.hz = (z1 - z0) / 2;
      }
    }
    return out;
  };
  return { solids: join(solids), panes: join(panes), flow: join(flow) };
}

/** Where a point is inside rings read even-odd (a floor's slabs: outlines and holes). */
export function crossings(rings: readonly Ring[], y: number): number[] {
  const xs: number[] = [];
  for (const r of rings)
    for (let i = 0; i < r.length; i++) {
      const [x0, y0] = r[i];
      const [x1, y1] = r[(i + 1) % r.length];
      if (y0 > y === y1 > y) continue;
      xs.push(x0 + ((y - y0) * (x1 - x0)) / (y1 - y0));
    }
  return xs.sort((a, b) => a - b);
}

/** A floor's slab as boxes, `top` its surface (SLAB thick under it): the rings' insides (even-odd)
 *  less the `holes` (rectangles: stairwells), cut at every chunk's edge — each box in one chunk.
 *  Rectilinear rings only (the tile tool's); phase 11's free floors take convex pieces. */
export function slabBoxes(
  rings: readonly Ring[],
  holes: readonly [number, number, number, number][],
  top: number,
): SolidBox3[] {
  const ys = new Set<number>();
  let lo = Number.POSITIVE_INFINITY;
  let hi = Number.NEGATIVE_INFINITY;
  for (const r of rings)
    for (const [, y] of r) {
      ys.add(y);
      lo = Math.min(lo, y);
      hi = Math.max(hi, y);
    }
  for (const [, y0, , y1] of holes) ys.add(y0).add(y1);
  for (let c = Math.ceil(lo / CHUNK) * CHUNK; c < hi; c += CHUNK) ys.add(c);
  const bands = [...ys].filter((y) => y >= lo && y <= hi).sort((a, b) => a - b);
  const out: SolidBox3[] = [];
  for (let i = 1; i < bands.length; i++) {
    const [ya, yb] = [bands[i - 1], bands[i]];
    if (yb - ya < 1e-9) continue;
    const ym = (ya + yb) / 2;
    const xs = crossings(rings, ym);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      // the run, less the holes across this band, cut at the chunks' edges
      let runs: [number, number][] = [[xs[k], xs[k + 1]]];
      for (const [hx0, hy0, hx1, hy1] of holes) {
        if (ym < hy0 || ym > hy1) continue;
        runs = runs.flatMap(([a, b]): [number, number][] =>
          hx1 <= a || hx0 >= b
            ? [[a, b]]
            : (
                [
                  [a, Math.max(a, hx0)],
                  [Math.min(b, hx1), b],
                ] as [number, number][]
              ).filter(([p, q]) => q - p > 1e-9),
        );
      }
      for (const [a, b] of runs) {
        let x = a;
        while (b - x > 1e-9) {
          const edge = Math.min(b, (Math.floor(x / CHUNK + 1e-9) + 1) * CHUNK);
          out.push(slabSolid(x, ya, edge, yb, top));
          x = edge;
        }
      }
    }
  }
  return mergeDown(out);
}

// (boxes one over another in a chunk with the same run merged: the tile maps' runs down)
function mergeDown(list: SolidBox3[]): SolidBox3[] {
  const key = (b: SolidBox3) => `${(b.x - b.hx).toFixed(6)}|${(b.x + b.hx).toFixed(6)}|${b.y}`;
  const chunkZ = (z: number) => Math.floor(z / CHUNK + 1e-9);
  const open = new Map<string, SolidBox3>();
  const out: SolidBox3[] = [];
  for (const b of [...list].sort((p, q) => p.z - p.hz - (q.z - q.hz))) {
    const k = key(b);
    const p = open.get(k);
    if (p && Math.abs(p.z + p.hz - (b.z - b.hz)) < 1e-9 && chunkZ(p.z - p.hz + 1e-6) === chunkZ(b.z + b.hz - 1e-6)) {
      const z0 = p.z - p.hz;
      const z1 = b.z + b.hz;
      p.z = (z0 + z1) / 2;
      p.hz = (z1 - z0) / 2;
      continue;
    }
    const c = { ...b };
    open.set(k, c);
    out.push(c);
  }
  return out;
}

/** (one solid's shape as numbers: for the checks) */
export const solidKey = (s: Solid3) =>
  s.t === "box" ? `b${s.x},${s.y},${s.z},${s.hx},${s.hy},${s.hz},${s.a}` : `c${s.x},${s.z},${s.r},${s.y0},${s.y1}`;
