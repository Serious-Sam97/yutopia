// The Grounds' walking against their solids (docs/plan/50-the-volume.md, phase 4): every outdoor
// tile, the grid's word (walkableTile: iso, paths, the folk, where a teleport lands) against Jolt's
// (a body fits standing on the ground in the middle of it: the 3D walker, the server's check). Where
// they disagree, by what's there. For CI (`pnpm physics`) and by hand:
//   node --import tsx audit.ts [--json] [--open]   (--open: the water open, its deep walled off —
//   docs/plan/66-the-water.md phase 1; else frozen, walked)

import { STEP } from "../grid.ts";
import {
  BUILDINGS,
  CHUNK,
  heightAt,
  iceAt,
  pavedAt,
  SHELF,
  setUnderfoot,
  slopeAt,
  treesIn,
  walkableTile,
  waterAt,
  worldRects,
} from "../grounds.ts";
import { BASE_LAND, landChunks, type Region } from "../land.ts";
import { type GroundWhat, groundSolidsIn } from "../shapes/grounds.ts";
import type { Solid3, SolidBox3 } from "../shapes/index.ts";
import { WorldBuilder } from "./build.ts";
import { loadJolt } from "./load.ts";
import { BODY, PhysicsWorld, sizesFor } from "./world.ts";

const R = 0.22; // the grid's body (grid.ts BODY_R)

export interface Audit {
  tiles: number;
  /** the grid keeps you off it, Jolt lets you stand there — by what's in the tile */
  blockedFree: Record<string, { n: number; at: [number, number] }>;
  /** the grid lets you walk it, Jolt doesn't — by what's in the way */
  openSolid: Record<string, { n: number; at: [number, number] }>;
  ms: number;
}

// the tiles a solid's footprint covers (a turned box: the square round it)
function tilesOf(s: Solid3): [number, number, number, number] {
  if (s.t === "cyl")
    return [Math.floor(s.x - s.r), Math.floor(s.z - s.r), Math.floor(s.x + s.r), Math.floor(s.z + s.r)];
  const c = Math.abs(Math.cos(s.a));
  const n = Math.abs(Math.sin(s.a));
  const ex = s.hx * c + s.hz * n;
  const ez = s.hx * n + s.hz * c;
  return [Math.floor(s.x - ex), Math.floor(s.z - ez), Math.floor(s.x + ex), Math.floor(s.z + ez)];
}

/** `of`: the regions audited (today's town by default; the long road's band — docs/plan/69 — its own). */
export async function audit(water: "frozen" | "open" = "frozen", of: readonly Region[] = BASE_LAND): Promise<Audit> {
  const t0 = performance.now();
  const open = water === "open";
  setUnderfoot({ ice: open ? 0 : 1 });
  const L = of.reduce(
    (b, r) => ({
      x0: Math.min(b.x0, r.drawn.x0),
      z0: Math.min(b.z0, r.drawn.z0),
      x1: Math.max(b.x1, r.drawn.x1),
      z1: Math.max(b.z1, r.drawn.z1),
    }),
    { x0: Number.POSITIVE_INFINITY, z0: Number.POSITIVE_INFINITY, x1: -Infinity, z1: -Infinity },
  );
  const chunks = landChunks(CHUNK, of);
  const world = await PhysicsWorld.create(loadJolt, sizesFor({ statics: 2 * chunks.length }));
  const build = new WorldBuilder(world);
  // what's in each tile (its solids' footprints), for saying why
  const what = new Map<number, Set<GroundWhat | "tree">>();
  // the porches' decks and steps (and the civic fronts' and the church door's): stood on, gone up
  // by their steps
  const porches: SolidBox3[] = [];
  const onPorch = (x: number, z: number) => {
    let top = Number.NEGATIVE_INFINITY;
    for (const s of porches) {
      const dx = x - s.x;
      const dz = z - s.z;
      const lx = dx * Math.cos(s.a) - dz * Math.sin(s.a);
      const lz = dx * Math.sin(s.a) + dz * Math.cos(s.a);
      if (Math.abs(lx) <= s.hx && Math.abs(lz) <= s.hz) top = Math.max(top, s.y + s.hy);
    }
    return top;
  };
  const key = (x: number, z: number) => (x - L.x0) * 4096 + (z - L.z0);
  const mark = (x: number, z: number, w: GroundWhat | "tree") => {
    const k = key(x, z);
    const s = what.get(k);
    if (s) s.add(w);
    else what.set(k, new Set([w]));
  };
  for (const [cx, cz] of chunks) {
    build.groundChunk(cx, cz);
    for (const g of groundSolidsIn(cx, cz)) {
      if (g.what === "porch" && g.s.t === "box") porches.push(g.s);
      const [x0, z0, x1, z1] = tilesOf(g.s);
      for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) mark(x, z, g.what);
    }
    for (const t of treesIn(cx, cz)) mark(Math.floor(t.x), Math.floor(t.z), "tree");
  }
  // the water open: its deep kept off by the grid (the paths), swum in by a body (plan 66) — by design
  build.ice(open ? 0 : 1);
  world.settle();
  // (the stored blocks — the HQ and the courtyard's — are the building's: not the Grounds')
  const stored = BUILDINGS.filter((b) => b.kind === "hq" || b.stored);
  // (past the world's edge — its wall, `edge` — nobody gets: not counted)
  const rects = worldRects();
  const inWorld = (x: number, z: number) => rects.some((r) => x >= r.x0 && x < r.x1 && z >= r.z0 && z < r.z1);
  const out: Audit = { tiles: 0, blockedFree: {}, openSolid: {}, ms: 0 };
  const count = (into: Audit["blockedFree"], why: string, x: number, z: number) => {
    const c = into[why];
    if (c) c.n++;
    else into[why] = { n: 1, at: [x, z] };
  };
  for (let z = L.z0 + 2; z < L.z1 - 2; z++)
    for (let x = L.x0 + 2; x < L.x1 - 2; x++) {
      const mx = x + 0.5;
      const mz = z + 0.5;
      if (stored.some((b) => mx >= b.x0 - 1 && mx < b.x1 + 1 && mz >= b.z0 - 1 && mz < b.z1 + 1)) continue;
      if (!inWorld(mx, mz)) continue;
      out.tiles++;
      // (on a pavement, stood on its slabs: grounds.ts pavedAt)
      const g = Math.max(heightAt(mx, mz) + pavedAt(mx, mz), onPorch(mx, mz));
      const fits = world.fits(mx, g + STEP, mz, R, BODY.h - STEP, "tops");
      const walk = walkableTile(x, z);
      if (walk === fits) continue;
      const here = what.get(key(x, z));
      if (!walk) {
        // (steep: the grid's own rule, Jolt's slope limit its own)
        // (open water's deep — all of it open, or the fast water that doesn't freeze: swum, not walked)
        const deep = !iceAt(mx, mz) && (waterAt(mx, mz)?.depth ?? 0) >= SHELF;
        const why = here?.size
          ? [...here].sort().join("+")
          : deep
            ? "deep water"
            : slopeAt(mx, mz) > 0.9
              ? "steep"
              : "nothing";
        count(out.blockedFree, why, x, z);
      } else count(out.openSolid, here?.size ? [...here].sort().join("+") : "unknown", x, z);
    }
  world.destroy();
  setUnderfoot({ ice: 1 });
  out.ms = Math.round(performance.now() - t0);
  return out;
}

/** What CI holds the Grounds to (measured 2026-10-28, a little headroom): nowhere Jolt stops you
 *  with nothing there; the fences thin on both; the rest of the drift — the grid's tiles against
 *  round and thin things, a bridge's guard strips — no more than it is. The trees (the grid blocks a
 *  trunk's whole tile, the trunk's round) and steep tiles (the grid's own rule) are by design. */
export function failures(a: Audit): string[] {
  const out: string[] = [];
  const sum = (m: Audit["blockedFree"], skip: (k: string) => boolean) =>
    Object.entries(m)
      .filter(([k]) => !skip(k))
      .reduce((n, [, v]) => n + v.n, 0);
  const tree = (k: string) => k.split("+").every((w) => w.startsWith("tree") || w === "edge");
  // (the water open: its deep, swum, not walked — by design, plan 66)
  const water = (k: string) => k === "deep water";
  if (a.openSolid.unknown) out.push(`Jolt stops you with nothing there: ${a.openSolid.unknown.n} tiles`);
  for (const f of ["fence", "kart_fence"])
    if ((a.blockedFree[f]?.n ?? 0) > 30) out.push(`${f}: ${a.blockedFree[f].n} tiles`);
  const kept = sum(a.blockedFree, (k) => tree(k) || k === "steep" || water(k));
  if (kept > 1000) out.push(`the grid keeps you off ${kept} tiles Jolt doesn't (want ≤ 1000)`);
  // (450 since 2026-11-01: the town's details made solid — porch posts, mailboxes, the porches'
  // edges — thin things in tiles the grid walks, as the statue's and the snow poles'; 407 then)
  const open = sum(a.openSolid, (k) => tree(k) || water(k));
  if (open > 450) out.push(`the grid walks ${open} tiles Jolt blocks (want ≤ 450)`);
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const a = await audit(process.argv.includes("--open") ? "open" : "frozen");
  if (process.argv.includes("--check")) {
    const f = failures(a);
    console.log(JSON.stringify({ tiles: a.tiles, ms: a.ms, failures: f }));
    process.exit(f.length ? 1 : 0);
  }
  if (process.argv.includes("--json")) console.log(JSON.stringify(a));
  else {
    console.log(`${a.tiles} tiles in ${a.ms} ms`);
    const show = (t: string, m: Audit["blockedFree"]) => {
      console.log(t);
      for (const [k, v] of Object.entries(m).sort((p, q) => q[1].n - p[1].n))
        console.log(`  ${String(v.n).padStart(7)}  ${k.padEnd(40)} e.g. ${v.at.join(", ")}`);
    };
    show("the grid keeps you off, Jolt lets you stand:", a.blockedFree);
    show("the grid lets you walk, Jolt doesn't:", a.openSolid);
  }
}
