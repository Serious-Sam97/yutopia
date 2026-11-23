// A map's walk grid (docs/plan/114-the-strike-park.md, S-M6 and S-M7): where a person can stand and how
// they get from one place to another, from the map's solids alone. The map checks time routes on it;
// the bots find their way on it. A cell is CELL m a side; a cell can have several floors (the pad and
// a balcony over it), each a node.
//
// A person stands at height h on a cell when something's top is at h (or the pad, 0) and nothing is
// in the way from just over h to a head's height. From one node to a neighbour's: up a step
// (≤ STEP), down any drop (≤ DROP), or up a jump (≤ JUMP: a crate) at a cost.

import { boxBounds, inBox, type MapBox, mapBoxes, type P, type StrikeMap } from "./map.ts";

export const CELL = 0.5;
export const HEAD = 1.75;
export const STEP = 0.55;
export const JUMP = 1.15;
export const DROP = 4.5;
/** a jump's cost in metres of running (the time it takes, ~0.45 s at a run) */
const JUMP_COST = 2.6;

export interface Grid {
  map: StrikeMap;
  nx: number;
  nz: number;
  x0: number;
  z0: number;
  /** per cell: its nodes' heights (start index `first[c]`, `count[c]` of them, in `hs`) */
  first: Int32Array;
  count: Uint8Array;
  hs: Float32Array;
  /** node → cell */
  cellOf: Int32Array;
}

/** The map's grid, made once per map. */
export function gridOf(map: StrikeMap): Grid {
  const g = cache.get(map);
  if (g) return g;
  const made = build(map);
  cache.set(map, made);
  return made;
}
const cache = new WeakMap<StrikeMap, Grid>();

function build(map: StrikeMap): Grid {
  const S = map.size;
  const nx = Math.ceil((S.x1 - S.x0) / CELL);
  const nz = Math.ceil((S.z1 - S.z0) / CELL);
  const per: MapBox[][] = Array.from({ length: nx * nz }, () => []);
  for (const b of mapBoxes(map)) {
    const r = boxBounds(b);
    const i0 = Math.max(0, Math.floor((r.x0 - S.x0) / CELL));
    const i1 = Math.min(nx - 1, Math.floor((r.x1 - S.x0) / CELL));
    const j0 = Math.max(0, Math.floor((r.z0 - S.z0) / CELL));
    const j1 = Math.min(nz - 1, Math.floor((r.z1 - S.z0) / CELL));
    for (let j = j0; j <= j1; j++)
      for (let i = i0; i <= i1; i++) {
        const x = S.x0 + (i + 0.5) * CELL;
        const z = S.z0 + (j + 0.5) * CELL;
        // (a cell is taken by a box over its middle, or one that covers most of it: thin walls too)
        if (inBox(b, x, z, CELL * 0.35)) per[j * nx + i].push(b);
      }
  }
  const first = new Int32Array(nx * nz);
  const count = new Uint8Array(nx * nz);
  const hs: number[] = [];
  const cellOf: number[] = [];
  for (let c = 0; c < nx * nz; c++) {
    const bs = per[c];
    const tops = [0, ...bs.map((b) => b.y + b.hy)].sort((a, b) => a - b);
    first[c] = hs.length;
    let last = -1;
    for (const h of tops) {
      if (h - last < 0.05) continue;
      // nothing in the way from just over h to the head
      const clear = bs.every((b) => b.y + b.hy <= h + 0.05 || b.y - b.hy >= h + HEAD);
      // (and on the pad, nothing standing in it from the ground)
      if (!clear) continue;
      hs.push(h);
      cellOf.push(c);
      last = h;
      count[c]++;
    }
  }
  return { map, nx, nz, x0: S.x0, z0: S.z0, first, count, hs: Float32Array.from(hs), cellOf: Int32Array.from(cellOf) };
}

/** The node nearest (x, z) at about height y (the lowest when y isn't given), or −1. */
export function nodeAt(g: Grid, x: number, z: number, y?: number): number {
  const i = Math.floor((x - g.x0) / CELL);
  const j = Math.floor((z - g.z0) / CELL);
  if (i < 0 || j < 0 || i >= g.nx || j >= g.nz) return -1;
  const c = j * g.nx + i;
  if (!g.count[c]) return -1;
  let best = g.first[c];
  if (y !== undefined)
    for (let k = 0; k < g.count[c]; k++) {
      const n = g.first[c] + k;
      if (Math.abs(g.hs[n] - y) < Math.abs(g.hs[best] - y)) best = n;
    }
  return best;
}
/** The node nearest (x, z) on the floor under a person standing about there: tries the cell, then
 *  the cells round it (a spawn by a wall). */
export function nodeNear(g: Grid, x: number, z: number, y?: number): number {
  for (let r = 0; r <= 4; r++)
    for (let dj = -r; dj <= r; dj++)
      for (let di = -r; di <= r; di++) {
        if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
        const n = nodeAt(g, x + di * CELL, z + dj * CELL, y);
        if (n >= 0) return n;
      }
  return -1;
}
/** A node's middle in local metres [x, y, z]. */
export function nodePos(g: Grid, n: number): [number, number, number] {
  const c = g.cellOf[n];
  const i = c % g.nx;
  const j = (c - i) / g.nx;
  return [g.x0 + (i + 0.5) * CELL, g.hs[n], g.z0 + (j + 0.5) * CELL];
}

const NB: [number, number, number][] = [
  [1, 0, 1],
  [-1, 0, 1],
  [0, 1, 1],
  [0, -1, 1],
  [1, 1, Math.SQRT2],
  [1, -1, Math.SQRT2],
  [-1, 1, Math.SQRT2],
  [-1, -1, Math.SQRT2],
];

/** The ways out of node n: [neighbour, cost in metres]. `blocked` cells are left out. */
export function edges(g: Grid, n: number, out: [number, number][], blocked?: Uint8Array): [number, number][] {
  out.length = 0;
  const c = g.cellOf[n];
  const i = c % g.nx;
  const j = (c - i) / g.nx;
  const h = g.hs[n];
  for (const [di, dj, w] of NB) {
    const ii = i + di;
    const jj = j + dj;
    if (ii < 0 || jj < 0 || ii >= g.nx || jj >= g.nz) continue;
    const cc = jj * g.nx + ii;
    if (blocked?.[cc]) continue;
    // (a diagonal only when both its sides can be stood on at about this height: no corner cutting)
    if (di && dj && (!near(g, j * g.nx + ii, h) || !near(g, jj * g.nx + i, h))) continue;
    for (let k = 0; k < g.count[cc]; k++) {
      const m = g.first[cc] + k;
      const d = g.hs[m] - h;
      // (a drop lands on the first thing under you: never through a floor to the one below it — a node of
      // that cell's between where you'd land and where you stand is what you'd stand on instead)
      if (d < -STEP && blockedDrop(g, cc, g.hs[m], h)) continue;
      if (d <= STEP && d >= -DROP) out.push([m, w * CELL]);
      else if (d > STEP && d <= JUMP && !di !== !dj) out.push([m, w * CELL + JUMP_COST]);
    }
  }
  return out;
}
function blockedDrop(g: Grid, c: number, to: number, from: number): boolean {
  for (let k = 0; k < g.count[c]; k++) {
    const y = g.hs[g.first[c] + k];
    if (y > to + 0.05 && y <= from + STEP) return true;
  }
  return false;
}
function near(g: Grid, c: number, h: number): boolean {
  for (let k = 0; k < g.count[c]; k++) {
    const d = g.hs[g.first[c] + k] - h;
    if (d <= JUMP && d >= -DROP) return true;
  }
  return false;
}

/** Dijkstra from `from` (nodes) over the grid: each node's distance in metres (∞ unreached). */
export function distances(g: Grid, from: number[], blocked?: Uint8Array): Float64Array {
  const N = g.hs.length;
  const dist = new Float64Array(N).fill(Number.POSITIVE_INFINITY);
  const heap = new Heap();
  for (const f of from)
    if (f >= 0) {
      dist[f] = 0;
      heap.push(f, 0);
    }
  const es: [number, number][] = [];
  while (heap.size) {
    const [n, d] = heap.pop();
    if (d > dist[n]) continue;
    for (const [m, w] of edges(g, n, es, blocked)) {
      const nd = d + w;
      if (nd < dist[m]) {
        dist[m] = nd;
        heap.push(m, nd);
      }
    }
  }
  return dist;
}

/** The way from `a` to `b` (nodes): the nodes along it, or null. A* on the grid. */
export function pathOf(g: Grid, a: number, b: number, blocked?: Uint8Array): number[] | null {
  if (a < 0 || b < 0) return null;
  const N = g.hs.length;
  const dist = new Float64Array(N).fill(Number.POSITIVE_INFINITY);
  const prev = new Int32Array(N).fill(-1);
  const [bx, , bz] = nodePos(g, b);
  const hOf = (n: number) => {
    const [x, , z] = nodePos(g, n);
    return Math.hypot(x - bx, z - bz);
  };
  const heap = new Heap();
  dist[a] = 0;
  heap.push(a, hOf(a));
  const es: [number, number][] = [];
  while (heap.size) {
    const [n] = heap.pop();
    if (n === b) break;
    const d = dist[n];
    for (const [m, w] of edges(g, n, es, blocked)) {
      const nd = d + w;
      if (nd < dist[m]) {
        dist[m] = nd;
        prev[m] = n;
        heap.push(m, nd + hOf(m));
      }
    }
  }
  if (!Number.isFinite(dist[b])) return null;
  const out = [b];
  for (let n = prev[b]; n >= 0; n = prev[n]) out.push(n);
  return out.reverse();
}

/** The shortest of `ds` over a rectangle's nodes (a site, a zone). */
export function bestIn(g: Grid, ds: Float64Array, r: { x0: number; z0: number; x1: number; z1: number }): number {
  let best = Number.POSITIVE_INFINITY;
  const i0 = Math.max(0, Math.floor((r.x0 - g.x0) / CELL));
  const i1 = Math.min(g.nx - 1, Math.floor((r.x1 - g.x0) / CELL));
  const j0 = Math.max(0, Math.floor((r.z0 - g.z0) / CELL));
  const j1 = Math.min(g.nz - 1, Math.floor((r.z1 - g.z0) / CELL));
  for (let j = j0; j <= j1; j++)
    for (let i = i0; i <= i1; i++) {
      const c = j * g.nx + i;
      for (let k = 0; k < g.count[c]; k++) best = Math.min(best, ds[g.first[c] + k]);
    }
  return best;
}

/** The nodes at points (spawns). */
export const nodesAt = (g: Grid, ps: P[]) => ps.map(([x, z]) => nodeNear(g, x, z));

/** A binary heap of (node, key). */
class Heap {
  private n: number[] = [];
  private k: number[] = [];
  get size() {
    return this.n.length;
  }
  push(n: number, k: number) {
    this.n.push(n);
    this.k.push(k);
    let i = this.n.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.k[p] <= this.k[i]) break;
      this.swap(i, p);
      i = p;
    }
  }
  pop(): [number, number] {
    const top: [number, number] = [this.n[0], this.k[0]];
    const ln = this.n.pop() as number;
    const lk = this.k.pop() as number;
    if (this.n.length) {
      this.n[0] = ln;
      this.k[0] = lk;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < this.n.length && this.k[l] < this.k[m]) m = l;
        if (r < this.n.length && this.k[r] < this.k[m]) m = r;
        if (m === i) break;
        this.swap(i, m);
        i = m;
      }
    }
    return top;
  }
  private swap(a: number, b: number) {
    [this.n[a], this.n[b]] = [this.n[b], this.n[a]];
    [this.k[a], this.k[b]] = [this.k[b], this.k[a]];
  }
}
