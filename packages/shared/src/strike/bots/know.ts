// A map, understood (docs/plan/117-bot-brains.md, phase 1, F2a): what the bots know of a Strike map before
// anyone's in it — worked out from the map itself (its walk grid, its walls, its callouts), the CS bot's nav
// knowledge (Booth, GDC 2004: places, hiding and sniper spots) and Killzone's scored positions:
//  - areas: every walkable node belongs to a named place (the radar's callouts, spread over the grid);
//  - what sees what: each pair of areas, the share of eye-to-chest lines between them that are clear;
//  - routes: two or three distinct ways from each side's spawn to each objective (not one shortest path);
//  - entrances: where each route comes onto its objective;
//  - spots: where a side holds an entrance from (cover at its back, a view of the door, off the lane);
//  - lineups: a smoke, flash, fire or HE thrown from a place on a lane that lands where it's wanted —
//    found by throwing it (the match's own grenade flight), not guessed;
//  - when each side can first be in each area (its spawn's walking time).
// Worked out in steps (`knowSteps`) so the server can spread it over its ticks; `knowOf` runs it to the end.

import { CELL, distances, edges, type Grid, gridOf, nodeAt, nodeNear, nodePos } from "../grid.ts";
import { inRect, type P, type Rect, type StrikeMap, shotThrough, type Team } from "../map.ts";
import { NADE, stepNade, throwNade } from "../nades.ts";

export const EYE = 1.62;
export const CHEST = 1.25;
/** what the bots plan routes to: a bomb site, the hostages' room, the rescue zone */
export type Goal = "A" | "B" | "H" | "R";

export interface Area {
  id: number;
  name: string;
  /** its callout's rectangle (or the nodes' bounds) */
  r: Rect;
  /** a node near its middle */
  mid: number;
  x: number;
  y: number;
  z: number;
  nodes: number;
}
export interface Route {
  team: Team;
  /** from the side's spawn, or from the hostages (their way out) */
  from: "spawn" | "H";
  to: Goal;
  nodes: number[];
  /** m */
  len: number;
  /** the areas it passes, in order */
  areas: number[];
  /** what it's called: the place only it goes through ("Catwalk") */
  via: string;
  /** m before its entrance where a group can wait unseen by the objective's holders (its stage), the nearest */
  safe: number;
  /** per metre back from its entrance (0…70): seen by one of the objective's holders' spots (1) or not (0) */
  seen: Uint8Array;
}
export interface Entrance {
  to: Goal;
  /** the side that comes in through it */
  team: Team;
  node: number;
  x: number;
  y: number;
  z: number;
  area: number;
  /** the routes through it */
  routes: number[];
  /** the way in (unit) */
  dx: number;
  dz: number;
}
export interface Spot {
  node: number;
  x: number;
  y: number;
  z: number;
  /** the side that stands here */
  team: Team;
  to: Goal;
  /** the entrance it holds (an index of `entrances`) */
  door: number;
  /** what it watches: the entrance's middle */
  wx: number;
  wy: number;
  wz: number;
  /** m to what it watches */
  d: number;
  kind: "hold" | "sniper" | "post" | "info";
  area: number;
  score: number;
}
export interface Lineup {
  kind: "smoke" | "flash" | "molotov" | "he";
  /** the side that throws it, at which entrance */
  team: Team;
  door: number;
  /** where it's thrown from (a node), and how */
  node: number;
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  short: boolean;
  /** where it lands (or bursts) */
  lx: number;
  lz: number;
  /** m from where it was wanted */
  err: number;
}
/** A place the other side may be in: a spot of theirs, a doorway, an area's middle — what a bot checks. */
export interface Danger {
  x: number;
  y: number;
  z: number;
  area: number;
}
export interface Know {
  map: StrikeMap;
  g: Grid;
  areaOf: Int16Array;
  areas: Area[];
  /** the areas next to each */
  adj: number[][];
  /** [a * n + b]: the share of clear lines from a's nodes to b's (0…1) */
  sees: Float32Array;
  routes: Route[];
  entrances: Entrance[];
  spots: Spot[];
  lineups: Lineup[];
  /** what each side checks as it goes: the other side's places */
  dangers: Record<Team, Danger[]>;
  /** s for each side to first reach each area from its spawn at a run */
  eta: Record<Team, Float32Array>;
  /** each objective's middle and rectangle */
  goals: Partial<Record<Goal, { r: Rect; node: number; x: number; y: number; z: number }>>;
  /** the side that defends each objective */
  holds: Partial<Record<Goal, Team>>;
  /** ms it took to work out */
  ms: number;
}

const other = (t: Team): Team => (t === "r" ? "w" : "r");
const RUN = 5.7;

/** Whether an eye at a sees a chest at b over the map (walls, crates: anything solid). */
export function clear(map: StrikeMap, a: [number, number, number], b: [number, number, number]): boolean {
  return shotThrough(map, a, b).walls === 0;
}

// ── a typed heap for the grid's searches ──
class Heap {
  n = new Int32Array(1024);
  k = new Float64Array(1024);
  size = 0;
  push(node: number, key: number) {
    if (this.size === this.n.length) {
      const n2 = new Int32Array(this.size * 2);
      n2.set(this.n);
      this.n = n2;
      const k2 = new Float64Array(this.size * 2);
      k2.set(this.k);
      this.k = k2;
    }
    let i = this.size++;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.k[p] <= key) break;
      this.n[i] = this.n[p];
      this.k[i] = this.k[p];
      i = p;
    }
    this.n[i] = node;
    this.k[i] = key;
  }
  /** the least node (its key in `top`) */
  top = 0;
  pop(): number {
    const node = this.n[0];
    this.top = this.k[0];
    const ln = this.n[--this.size];
    const lk = this.k[this.size];
    let i = 0;
    for (;;) {
      const l = i * 2 + 1;
      if (l >= this.size) break;
      const r = l + 1;
      const m = r < this.size && this.k[r] < this.k[l] ? r : l;
      if (this.k[m] >= lk) break;
      this.n[i] = this.n[m];
      this.k[i] = this.k[m];
      i = m;
    }
    this.n[i] = ln;
    this.k[i] = lk;
    return node;
  }
}

/** A* from a to b, each step's cost × (1 + pen at the node it steps onto). */
export function pathPen(g: Grid, a: number, b: number, pen: Float32Array | null): number[] | null {
  if (a < 0 || b < 0) return null;
  const N = g.hs.length;
  const dist = new Float64Array(N).fill(Number.POSITIVE_INFINITY);
  const prev = new Int32Array(N).fill(-1);
  const [bx, , bz] = nodePos(g, b);
  const h = (n: number) => {
    const c = g.cellOf[n];
    const i = c % g.nx;
    const j = (c - i) / g.nx;
    return Math.hypot(g.x0 + (i + 0.5) * CELL - bx, g.z0 + (j + 0.5) * CELL - bz);
  };
  const heap = new Heap();
  dist[a] = 0;
  heap.push(a, h(a));
  const es: [number, number][] = [];
  while (heap.size) {
    const n = heap.pop();
    if (n === b) break;
    const d = dist[n];
    if (heap.top - h(n) > d + 1e-6) continue;
    for (const [m, w] of edges(g, n, es)) {
      const nd = d + w * (pen ? 1 + pen[m] : 1);
      if (nd < dist[m]) {
        dist[m] = nd;
        prev[m] = n;
        heap.push(m, nd + h(m));
      }
    }
  }
  if (!Number.isFinite(dist[b])) return null;
  const out = [b];
  for (let n = prev[b]; n >= 0; n = prev[n]) out.push(n);
  return out.reverse();
}

/** The walking length of a path (m). */
export function pathLen(g: Grid, p: number[]): number {
  let L = 0;
  for (let i = 1; i < p.length; i++) {
    const a = nodePos(g, p[i - 1]);
    const b = nodePos(g, p[i]);
    L += Math.hypot(b[0] - a[0], b[2] - a[2]);
  }
  return L;
}

/** Marks the nodes within r m of a path's nodes (from its m0-th metre to m1 short of its end). */
function markNear(g: Grid, p: number[], r: number, out: Uint8Array, m0 = 0, m1 = 0) {
  const L = pathLen(g, p);
  let at = 0;
  const k = Math.ceil(r / CELL);
  for (let i = 0; i < p.length; i++) {
    if (i) {
      const a = nodePos(g, p[i - 1]);
      const b = nodePos(g, p[i]);
      at += Math.hypot(b[0] - a[0], b[2] - a[2]);
    }
    if (at < m0 || at > L - m1) continue;
    const c = g.cellOf[p[i]];
    const ci = c % g.nx;
    const cj = (c - ci) / g.nx;
    for (let dj = -k; dj <= k; dj++)
      for (let di = -k; di <= k; di++) {
        if ((di * di + dj * dj) * CELL * CELL > r * r) continue;
        const ii = ci + di;
        const jj = cj + dj;
        if (ii < 0 || jj < 0 || ii >= g.nx || jj >= g.nz) continue;
        const cc = jj * g.nx + ii;
        for (let q = 0; q < g.count[cc]; q++) out[g.first[cc] + q] = 1;
      }
  }
}

const cache = new WeakMap<StrikeMap, Know>();
const jobs = new WeakMap<StrikeMap, { it: Generator<void, Know>; spent: number }>();

/** The map's knowledge, worked out now if it isn't yet (the lab, the tests, the dev page). */
export function knowOf(map: StrikeMap): Know {
  const had = cache.get(map);
  if (had) return had;
  const job = jobs.get(map)?.it ?? knowSteps(map);
  for (;;) {
    const r = job.next();
    if (r.done) {
      cache.set(map, r.value);
      jobs.delete(map);
      return r.value;
    }
  }
}
/** The map's knowledge if it's done; else a little more of it worked out (about `ms`), and null. */
export function knowPump(map: StrikeMap, ms: number): Know | null {
  const had = cache.get(map);
  if (had) return had;
  let job = jobs.get(map);
  if (!job) {
    job = { it: knowSteps(map), spent: 0 };
    jobs.set(map, job);
  }
  const t0 = performance.now();
  while (performance.now() - t0 < ms) {
    const r = job.it.next();
    if (r.done) {
      cache.set(map, r.value);
      jobs.delete(map);
      return r.value;
    }
  }
  return null;
}
export const knowReady = (map: StrikeMap) => cache.has(map);

/** The knowledge, a step at a time (each a few tens of ms at most on the biggest map). */
export function* knowSteps(map: StrikeMap): Generator<void, Know> {
  const t0 = performance.now();
  const paused = 0;
  const g = gridOf(map);
  const N = g.hs.length;
  const pos = (n: number) => nodePos(g, n);
  yield;

  // ── areas: a node in a callout's rectangle is that place (the smaller rectangle wins), the rest the place
  // nearest it on foot ──
  const calls = map.calls.map((c, i) => ({ c, i, s: (c.r.x1 - c.r.x0) * (c.r.z1 - c.r.z0) })).sort((a, b) => a.s - b.s);
  const areaOf = new Int16Array(N).fill(-1);
  const heap = new Heap();
  const dist = new Float64Array(N).fill(Number.POSITIVE_INFINITY);
  for (let n = 0; n < N; n++) {
    const [x, , z] = pos(n);
    for (const { c, i } of calls)
      if (inRect(c.r, x, z)) {
        areaOf[n] = i;
        dist[n] = 0;
        heap.push(n, 0);
        break;
      }
  }
  yield;
  const es: [number, number][] = [];
  while (heap.size) {
    const n = heap.pop();
    const d = heap.top;
    if (d > dist[n]) continue;
    for (const [m, w] of edges(g, n, es)) {
      if (d + w < dist[m]) {
        dist[m] = d + w;
        areaOf[m] = areaOf[n];
        heap.push(m, d + w);
      }
    }
  }
  yield;
  const A = map.calls.length;
  const lists: number[][] = Array.from({ length: A }, () => []);
  for (let n = 0; n < N; n++) if (areaOf[n] >= 0) lists[areaOf[n]].push(n);
  const areas: Area[] = map.calls.map((c, i) => {
    const ns = lists[i];
    const cx = (c.r.x0 + c.r.x1) / 2;
    const cz = (c.r.z0 + c.r.z1) / 2;
    let mid = ns[0] ?? -1;
    let best = Number.POSITIVE_INFINITY;
    for (const n of ns) {
      const [x, , z] = pos(n);
      const d = (x - cx) ** 2 + (z - cz) ** 2;
      if (d < best) {
        best = d;
        mid = n;
      }
    }
    const [x, y, z] = mid >= 0 ? pos(mid) : [cx, 0, cz];
    return { id: i, name: c.name, r: c.r, mid, x, y, z, nodes: ns.length };
  });
  const adjS = Array.from({ length: A }, () => new Set<number>());
  for (let n = 0; n < N; n++) {
    const a = areaOf[n];
    if (a < 0) continue;
    for (const [m] of edges(g, n, es)) {
      const b = areaOf[m];
      if (b >= 0 && b !== a) adjS[a].add(b);
    }
  }
  const adj = adjS.map((s) => [...s]);
  yield;

  // ── what sees what: eight nodes of each area spread through it, eye to chest ──
  const samples = lists.map((ns) => {
    const out: number[] = [];
    if (!ns.length) return out;
    const k = Math.min(8, ns.length);
    for (let i = 0; i < k; i++) out.push(ns[Math.floor(((i + 0.5) * ns.length) / k)]);
    return out;
  });
  const sees = new Float32Array(A * A);
  for (let a = 0; a < A; a++) {
    sees[a * A + a] = 1;
    for (let b = a + 1; b < A; b++) {
      const pa = areas[a];
      const pb = areas[b];
      if (Math.hypot(pa.x - pb.x, pa.z - pb.z) > 130) continue;
      let ok = 0;
      let all = 0;
      for (const na of samples[a])
        for (const nb of samples[b]) {
          const [ax, ay, az] = pos(na);
          const [bx, by, bz] = pos(nb);
          all++;
          if (clear(map, [ax, ay + EYE, az], [bx, by + CHEST, bz])) ok++;
        }
      const v = all ? ok / all : 0;
      sees[a * A + b] = v;
      sees[b * A + a] = v;
      if (b % 3 === 0) yield;
    }
    yield;
  }

  // ── the objectives, and who defends them ──
  const goals: Know["goals"] = {};
  const holds: Know["holds"] = {};
  // (an objective's floor: the height most of its nodes stand at — or its hostages' — not the lowest under its
  // middle: Glass Tower's hostages are on the 3rd floor over the atrium)
  const floorOf = (r: Rect, points?: P[]): number => {
    const hist = new Map<number, number>();
    const add = (h: number) => hist.set(Math.round(h * 2) / 2, (hist.get(Math.round(h * 2) / 2) ?? 0) + 1);
    if (points?.length)
      for (const [x, z] of points) {
        const n = nodeAt(g, x, z);
        if (n >= 0) add(g.hs[n]);
      }
    else
      for (let x = r.x0 + 0.25; x < r.x1; x += 0.5)
        for (let z = r.z0 + 0.25; z < r.z1; z += 0.5) {
          const n = nodeAt(g, x, z);
          if (n >= 0) add(g.hs[n]);
        }
    let best = 0;
    let bn = -1;
    for (const [h, n] of hist)
      if (n > bn) {
        bn = n;
        best = h;
      }
    return best;
  };
  const goalOf = (r: Rect, points?: P[]) => {
    const cx = (r.x0 + r.x1) / 2;
    const cz = (r.z0 + r.z1) / 2;
    const fy = floorOf(r, points);
    let node = nodeNear(g, cx, cz, fy);
    // (no floor at that height at its middle: the nearest node at it within the rectangle)
    if (node < 0 || Math.abs(g.hs[node] - fy) > 1) {
      let bd = Number.POSITIVE_INFINITY;
      for (let x = r.x0 + 0.25; x < r.x1; x += 0.5)
        for (let z = r.z0 + 0.25; z < r.z1; z += 0.5) {
          const n = nodeAt(g, x, z, fy);
          if (n < 0 || Math.abs(g.hs[n] - fy) > 0.6) continue;
          const d = Math.hypot(x - cx, z - cz);
          if (d < bd) {
            bd = d;
            node = n;
          }
        }
    }
    const [x, y, z] = node >= 0 ? pos(node) : [cx, fy, cz];
    return { r, node, x, y, z };
  };
  if (map.sites) {
    goals.A = goalOf(map.sites.A);
    holds.A = "w";
    if (map.sites.B) {
      goals.B = goalOf(map.sites.B);
      holds.B = "w";
    }
  }
  if (map.hostages?.length) {
    let r: Rect = { x0: Infinity, z0: Infinity, x1: -Infinity, z1: -Infinity };
    for (const [x, z] of map.hostages)
      r = {
        x0: Math.min(r.x0, x - 4),
        z0: Math.min(r.z0, z - 4),
        x1: Math.max(r.x1, x + 4),
        z1: Math.max(r.z1, z + 4),
      };
    goals.H = goalOf(r, map.hostages);
    holds.H = "r";
    if (map.rescue) goals.R = goalOf(map.rescue);
  }
  const spawnNode = (t: Team) => {
    const ps = map.spawns[t];
    const x = ps.reduce((s, p) => s + p[0], 0) / ps.length;
    const z = ps.reduce((s, p) => s + p[1], 0) / ps.length;
    const n = nodeNear(g, x, z);
    return n >= 0 ? n : nodeNear(g, ps[0][0], ps[0][1]);
  };
  const spawns: Record<Team, number> = { r: spawnNode("r"), w: spawnNode("w") };

  // ── when each side can first be in each area ──
  const eta = { r: new Float32Array(A).fill(999), w: new Float32Array(A).fill(999) };
  for (const t of ["r", "w"] as Team[]) {
    const d = new Float64Array(N).fill(Number.POSITIVE_INFINITY);
    const h = new Heap();
    for (const [x, z] of map.spawns[t]) {
      const n = nodeNear(g, x, z);
      if (n >= 0) {
        d[n] = 0;
        h.push(n, 0);
      }
    }
    while (h.size) {
      const n = h.pop();
      const dd = h.top;
      if (dd > d[n]) continue;
      for (const [m, w] of edges(g, n, es))
        if (dd + w < d[m]) {
          d[m] = dd + w;
          h.push(m, dd + w);
        }
    }
    for (let n = 0; n < N; n++) {
      const a = areaOf[n];
      if (a >= 0 && Number.isFinite(d[n])) eta[t][a] = Math.min(eta[t][a], d[n] / RUN);
    }
    yield;
  }

  // ── routes: the shortest, then others kept off it (its middle made dear), each kept if it's mostly its own ──
  const routes: Route[] = [];
  const routeSet = (team: Team, from: "spawn" | "H", to: Goal, a: number, b: number) => {
    const base = pathPen(g, a, b, null);
    if (!base) return;
    const L0 = pathLen(g, base);
    const got: number[][] = [base];
    for (let k = 0; k < 2; k++) {
      const near = new Uint8Array(N);
      for (const p of got) markNear(g, p, 3, near, 14, 8);
      const pen = new Float32Array(N);
      for (let n = 0; n < N; n++) if (near[n]) pen[n] = 5;
      const p = pathPen(g, a, b, pen);
      if (!p) break;
      const L = pathLen(g, p);
      if (L > L0 * 1.75) break;
      // (its own: under half of its middle along the others')
      let shared = 0;
      let all = 0;
      let at = 0;
      for (let i = 1; i < p.length; i++) {
        const q0 = pos(p[i - 1]);
        const q1 = pos(p[i]);
        at += Math.hypot(q1[0] - q0[0], q1[2] - q0[2]);
        if (at < 14 || at > L - 8) continue;
        all++;
        if (near[p[i]]) shared++;
      }
      if (all && shared / all < 0.5) got.push(p);
      else break;
    }
    for (const p of got) {
      const seq: number[] = [];
      for (const n of p) {
        const a2 = areaOf[n];
        if (a2 >= 0 && seq[seq.length - 1] !== a2) seq.push(a2);
      }
      routes.push({
        team,
        from,
        to,
        nodes: p,
        len: pathLen(g, p),
        areas: seq,
        via: "",
        safe: 20,
        seen: new Uint8Array(71),
      });
    }
  };
  for (const to of ["A", "B", "H"] as Goal[]) {
    const goal = goals[to];
    if (!goal || goal.node < 0) continue;
    for (const t of ["r", "w"] as Team[]) {
      routeSet(t, "spawn", to, spawns[t], goal.node);
      yield;
    }
  }
  if (goals.H && goals.R && goals.H.node >= 0 && goals.R.node >= 0) {
    routeSet("w", "H", "R", goals.H.node, goals.R.node);
    yield;
  }
  // (each named by the place only it goes through — or, failing that, the most of it)
  const named = new Map<string, Set<string>>();
  for (const r of routes) {
    const sibs = routes.filter((q) => q !== r && q.team === r.team && q.to === r.to && q.from === r.from);
    const key = `${r.team}${r.from}${r.to}`;
    const used = named.get(key) ?? new Set<string>();
    named.set(key, used);
    const counts = new Map<number, number>();
    for (const n of r.nodes) {
      const a = areaOf[n];
      if (a >= 0) counts.set(a, (counts.get(a) ?? 0) + 1);
    }
    const ends = new Set([areaOf[r.nodes[0]], areaOf[r.nodes[r.nodes.length - 1]]]);
    const ranked = [...counts].filter(([a]) => !ends.has(a)).sort((x, y) => y[1] - x[1]);
    const own = ranked.find(([a]) => !sibs.some((q) => q.areas.includes(a)));
    const pick = own ?? ranked.find(([a]) => !used.has(areas[a].name)) ?? ranked[0];
    r.via = pick ? areas[pick[0]].name : (areas[areaOf[r.nodes[r.nodes.length - 1]]]?.name ?? "");
    used.add(r.via);
  }

  // ── entrances: where each route comes onto its objective (6 m out of its rectangle), the near ones one ──
  const entrances: Entrance[] = [];
  routes.forEach((r, ri) => {
    if (r.from !== "spawn") return;
    const goal = goals[r.to];
    if (!goal) return;
    let k = -1;
    for (let i = 0; i < r.nodes.length; i++) {
      const [x, , z] = pos(r.nodes[i]);
      if (inRect(goal.r, x, z, 6)) {
        k = i;
        break;
      }
    }
    if (k < 0) return;
    const n = r.nodes[k];
    const [x, y, z] = pos(n);
    const [bx, , bz] = pos(r.nodes[Math.max(0, k - 8)]);
    const dl = Math.hypot(x - bx, z - bz) || 1;
    const had = entrances.find((e) => e.to === r.to && e.team === r.team && Math.hypot(e.x - x, e.z - z) < 7);
    if (had) {
      had.routes.push(ri);
      return;
    }
    entrances.push({
      to: r.to,
      team: r.team,
      node: n,
      x,
      y,
      z,
      area: areaOf[n],
      routes: [ri],
      dx: (x - bx) / dl,
      dz: (z - bz) / dl,
    });
  });
  yield;

  // ── spots: for each objective a side holds, places to hold each of the other side's entrances from ──
  const spots: Spot[] = [];
  const gets: Record<Team, Float64Array> = { r: distances(g, [spawns.r]), w: new Float64Array(0) };
  yield;
  gets.w = distances(g, [spawns.w]);
  yield;
  const spotFor = function* (to: Goal, holder: Team, kind: "hold" | "post", reach: number): Generator<void> {
    const goal = goals[to];
    if (!goal) return;
    const doors = entrances.map((e, i) => ({ e, i })).filter(({ e }) => e.to === to && e.team === other(holder));
    if (!doors.length) return;
    // (the lanes the others come down, where a holder mustn't stand)
    const lane = new Uint8Array(N);
    for (const { e } of doors) for (const ri of e.routes) markNear(g, routes[ri].nodes, 2, lane, 0, 0);
    // (what the others see as they come: their routes' last 30 m, every 4 m)
    const theirs: [number, number, number][] = [];
    for (const { e } of doors)
      for (const ri of e.routes) {
        const ns = routes[ri].nodes;
        const k = ns.indexOf(e.node);
        for (let i = Math.max(0, k - 60); i < k; i += 8) {
          const [x, y, z] = pos(ns[i]);
          theirs.push([x, y + EYE, z]);
        }
      }
    const r = goal.r;
    const found: Spot[] = [];
    const seen = new Set<number>();
    let tried = 0;
    const cellNodes = (x: number, z: number): number[] => {
      const i = Math.floor((x - g.x0) / CELL);
      const j = Math.floor((z - g.z0) / CELL);
      if (i < 0 || j < 0 || i >= g.nx || j >= g.nz) return [];
      const c = j * g.nx + i;
      const out: number[] = [];
      for (let q = 0; q < g.count[c]; q++) out.push(g.first[c] + q);
      return out;
    };
    for (let x = r.x0 - reach; x <= r.x1 + reach; x += 2)
      for (let z = r.z0 - reach; z <= r.z1 + reach; z += 2)
        for (const n of cellNodes(x, z)) {
          if (++tried % 60 === 0) yield;
          if (seen.has(n)) continue;
          seen.add(n);
          if (lane[n]) continue;
          // (somewhere its holders can get to: not the top of a boat on its trestle)
          if (!(gets[holder][n] < Number.POSITIVE_INFINITY)) continue;
          const [nx, ny, nz] = pos(n);
          // (on its objective's storey: a holder of the 3rd floor isn't on the ground under it)
          if (Math.abs(ny - goal.y) > 3.2) continue;
          const eye: [number, number, number] = [nx, ny + EYE, nz];
          for (const { e, i } of doors) {
            const d = Math.hypot(e.x - nx, e.z - nz);
            if (d < 6 || d > 42) continue;
            if (!clear(map, eye, [e.x, e.y + CHEST, e.z])) continue;
            let closed = 0;
            for (let k = 0; k < 8; k++) {
              const a = (k / 8) * Math.PI * 2;
              if (
                shotThrough(map, [nx, ny + 1, nz], [nx + Math.cos(a) * 1.3, ny + 1, nz + Math.sin(a) * 1.3]).walls > 0
              )
                closed++;
            }
            let expo = 0;
            for (const t of theirs)
              if (Math.hypot(t[0] - nx, t[2] - nz) < 45 && clear(map, t, [nx, ny + CHEST, nz])) expo++;
            const near = d < 10 ? (d - 6) * 0.4 : d <= 26 ? 2 : Math.max(0, 2 - (d - 26) * 0.15);
            const score = Math.min(closed, 5) * 0.8 - expo * 0.6 + near;
            found.push({
              node: n,
              x: nx,
              y: ny,
              z: nz,
              team: holder,
              to,
              door: i,
              wx: e.x,
              wy: e.y,
              wz: e.z,
              d,
              kind: kind === "post" ? "post" : d >= 24 ? "sniper" : "hold",
              area: areaOf[n],
              score,
            });
          }
        }
    // (each entrance its best few, apart; a sniper's spot of the long ones)
    for (const { i } of doors) {
      const mine = found.filter((s) => s.door === i).sort((a, b) => b.score - a.score);
      let took = 0;
      for (const s of mine) {
        if (took >= 3) break;
        if (spots.some((q) => q.to === to && q.team === holder && Math.hypot(q.x - s.x, q.z - s.z) < 4)) continue;
        spots.push(s);
        took++;
      }
    }
  };
  for (const to of ["A", "B", "H"] as Goal[]) {
    const holder = holds[to];
    if (!holder) continue;
    yield* spotFor(to, holder, "hold", 14);
    // (after the plant, the Raiders hold the site against the Wardens' ways back in)
    if (to !== "H") {
      yield* spotFor(to, other(holder), "post", 10);
    }
  }

  // ── info spots: where the defenders of two objectives can be first (3 s before the attackers), in some cover, and
  // watch the most of the attackers' lanes' middles — the rotator's: the call comes early, the rotation in time ──
  for (const holder of ["w", "r"] as Team[]) {
    const mine = (["A", "B", "H"] as Goal[]).filter((q) => holds[q] === holder && goals[q]);
    if (mine.length < 2) continue;
    const them = other(holder);
    const lanes = routes.filter((r) => r.team === them && r.from === "spawn" && mine.includes(r.to));
    const mids: [number, number, number][] = [];
    for (const r of lanes)
      for (let i = Math.floor(r.nodes.length * 0.35); i < r.nodes.length * 0.75; i += 12) {
        const [x, y, z] = pos(r.nodes[i]);
        mids.push([x, y + CHEST, z]);
      }
    // (their lanes themselves: an info spot sees them come without standing where they walk — Freight's Switchyard
    // took its rotator nearly every round)
    const inLane = new Uint8Array(N);
    for (const r of lanes) markNear(g, r.nodes, 4, inLane, 0, 0);
    const cands: Spot[] = [];
    let tried = 0;
    for (let x = map.size.x0 + 2; x < map.size.x1; x += 3)
      for (let z = map.size.z0 + 2; z < map.size.z1; z += 3) {
        if (++tried % 80 === 0) yield;
        const n = nodeAt(g, x, z);
        if (n < 0) continue;
        const a = areaOf[n];
        if (a < 0 || eta[holder][a] > eta[them][a] - 3) continue;
        if (!(gets[holder][n] < Number.POSITIVE_INFINITY)) continue;
        const [nx, ny, nz] = pos(n);
        const eye: [number, number, number] = [nx, ny + EYE, nz];
        let seen = 0;
        let sx = 0;
        let sy = 0;
        let sz = 0;
        for (const q of mids) {
          if (Math.hypot(q[0] - nx, q[2] - nz) > 55) continue;
          if (!clear(map, eye, q)) continue;
          seen++;
          sx += q[0];
          sy += q[1];
          sz += q[2];
        }
        if (seen < 2) continue;
        let closed = 0;
        for (let kk = 0; kk < 8; kk++) {
          const an = (kk / 8) * Math.PI * 2;
          if (shotThrough(map, [nx, ny + 1, nz], [nx + Math.cos(an) * 1.3, ny + 1, nz + Math.sin(an) * 1.3]).walls > 0)
            closed++;
        }
        if (closed < 2) continue;
        cands.push({
          node: n,
          x: nx,
          y: ny,
          z: nz,
          team: holder,
          to: mine[0],
          door: -1,
          wx: sx / seen,
          wy: sy / seen - 1.3,
          wz: sz / seen,
          d: 0,
          kind: "info",
          area: a,
          score: (seen + closed * 0.3) * (inLane[n] ? 0.75 : 1),
        });
      }
    cands.sort((p, q) => q.score - p.score);
    let took = 0;
    for (const c0 of cands) {
      if (took >= 2) break;
      if (spots.some((q) => q.kind === "info" && Math.hypot(q.x - c0.x, q.z - c0.z) < 12)) continue;
      c0.d = Math.hypot(c0.wx - c0.x, c0.wz - c0.z);
      spots.push(c0);
      took++;
    }
  }

  // ── each route's stage: back along it from its entrance till none of the objective's holders' spots sees it ──
  for (let ri = 0; ri < routes.length; ri++) {
    const r = routes[ri];
    if (r.from !== "spawn") continue;
    const e = entrances.find((q) => q.routes.includes(ri));
    if (!e) continue;
    const eyes = spots
      .filter((q) => q.to === r.to && q.team !== r.team && (q.kind === "hold" || q.kind === "sniper"))
      .map((q) => [q.x, q.y + EYE, q.z] as [number, number, number]);
    const k0 = r.nodes.indexOf(e.node);
    let L = 0;
    let safe = -1;
    let lastM = -1;
    for (let i = k0; i > 0 && L <= 70; i--) {
      const a = pos(r.nodes[i]);
      const b = pos(r.nodes[i - 1]);
      L += Math.hypot(a[0] - b[0], a[2] - b[2]);
      const mi = Math.floor(L);
      if (mi === lastM || mi > 70) continue;
      lastM = mi;
      const seenBy = eyes.some(
        (q) => Math.hypot(q[0] - b[0], q[2] - b[2]) < 60 && clear(map, q, [b[0], b[1] + CHEST, b[2]]),
      );
      r.seen[mi] = seenBy ? 1 : 0;
      if (!seenBy && safe < 0 && L >= 8) safe = L;
    }
    // (the metres it didn't reach: as the last it did)
    for (let mi = lastM + 1; mi <= 70; mi++) r.seen[mi] = lastM >= 0 ? r.seen[lastM] : 0;
    r.safe = safe < 0 ? 20 : safe;
    yield;
  }

  // ── lineups: thrown to land where it's wanted, from the lane (the attackers) or a spot (the holders) ──
  const lineups: Lineup[] = [];
  const t1 = performance.now();
  const simulate = (
    kind: Lineup["kind"],
    from: [number, number, number],
    yaw: number,
    pitch: number,
    short: boolean,
  ): [number, number] | null => {
    const n = throwNade(0, kind === "molotov" ? "molotov" : kind, "", from, yaw, pitch, short);
    const dt = 1 / 30;
    for (let t = 0; t < 4; t += dt) {
      const r = stepNade(map, n, dt);
      if ((kind === "flash" || kind === "he") && n.t >= NADE.flash.fuse) return [n.x, n.z];
      if (kind === "molotov" && r.hitFloor) return [n.x, n.z];
      if (kind === "smoke" && n.rest) return [n.x, n.z];
    }
    return kind === "smoke" ? null : [n.x, n.z];
  };
  const lineupFor = function* (
    kind: Lineup["kind"],
    team: Team,
    door: number,
    target: [number, number],
    froms: number[],
  ): Generator<void> {
    let best: Lineup | null = null;
    for (const fn of froms) {
      yield;
      const [fx, fy, fz] = pos(fn);
      const yaw = Math.atan2(target[1] - fz, target[0] - fx);
      const eye: [number, number, number] = [fx, fy + 1.55, fz];
      for (const short of [false, true])
        for (let pitch = -0.1; pitch <= 1.1; pitch += 0.075) {
          const land = simulate(kind, eye, yaw, pitch, short);
          if (!land) continue;
          const err = Math.hypot(land[0] - target[0], land[1] - target[1]);
          if (!best || err < best.err)
            best = {
              kind,
              team,
              door,
              node: fn,
              x: fx,
              y: fy,
              z: fz,
              yaw,
              pitch,
              short,
              lx: land[0],
              lz: land[1],
              err,
            };
        }
    }
    const ok = kind === "smoke" ? 2.5 : kind === "flash" ? 4 : 3;
    if (best && best.err <= ok) lineups.push(best);
  };
  for (let di = 0; di < entrances.length; di++) {
    const e = entrances[di];
    const goal = goals[e.to];
    if (!goal || e.to === "R") continue;
    const holders = spots.filter((s) => s.door === di && s.kind !== "post");
    const hx = holders.length ? holders.reduce((s, q) => s + q.x, 0) / holders.length : goal.x;
    const hz = holders.length ? holders.reduce((s, q) => s + q.z, 0) / holders.length : goal.z;
    const hl = Math.hypot(hx - e.x, hz - e.z) || 1;
    // (the smoke between the door and its holders; the flash over the door, into the site)
    const smokeAt: [number, number] = [
      e.x + ((hx - e.x) / hl) * Math.min(5, hl * 0.4),
      e.z + ((hz - e.z) / hl) * Math.min(5, hl * 0.4),
    ];
    const flashAt: [number, number] = [e.x + e.dx * 6, e.z + e.dz * 6];
    // (thrown from the lane, 10–26 m before the door)
    const froms: number[] = [];
    for (const ri of e.routes) {
      const ns = routes[ri].nodes;
      const k = ns.indexOf(e.node);
      for (let back = 20; back <= 52 && k - back >= 0; back += 8) froms.push(ns[k - back]);
    }
    yield* lineupFor("smoke", e.team, di, smokeAt, froms);
    yield* lineupFor("flash", e.team, di, flashAt, froms);
    // (the holders: fire on the door from their spot, a flash over it)
    // (each holder's own: from its spot — a smoke on the door, fire on it, an HE just out of it)
    for (const h of holders.slice(0, 3)) {
      yield* lineupFor("smoke", other(e.team), di, [e.x - e.dx * 2, e.z - e.dz * 2], [h.node]);
      yield* lineupFor("molotov", other(e.team), di, [e.x, e.z], [h.node]);
      yield* lineupFor("he", other(e.team), di, [e.x - e.dx * 3, e.z - e.dz * 3], [h.node]);
    }
    yield;
  }
  void t1;

  // ── the dangers each side checks: the other side's spots, the doors, every area's middle ──
  const dangers: Record<Team, Danger[]> = { r: [], w: [] };
  for (const t of ["r", "w"] as Team[]) {
    for (const s of spots) if (s.team !== t) dangers[t].push({ x: s.x, y: s.y, z: s.z, area: s.area });
    for (const e of entrances) if (e.team !== t) dangers[t].push({ x: e.x, y: e.y, z: e.z, area: e.area });
    for (const a of areas) if (a.mid >= 0) dangers[t].push({ x: a.x, y: a.y, z: a.z, area: a.id });
  }

  return {
    map,
    g,
    areaOf,
    areas,
    adj,
    sees,
    routes,
    entrances,
    spots,
    lineups,
    dangers,
    eta,
    goals,
    holds,
    ms: performance.now() - t0 - paused,
  };
}

/** The area at (x, z) — of the node there, or nearest — or −1. */
export function areaAt(k: Know, x: number, z: number, y?: number): number {
  const n = nodeNear(k.g, x, z, y);
  return n >= 0 ? k.areaOf[n] : -1;
}
/** The place's name at (x, z) ("" if none). */
export function placeAt(k: Know, x: number, z: number, y?: number): string {
  const a = areaAt(k, x, z, y);
  return a >= 0 ? k.areas[a].name : "";
}
/** The routes of a side to an objective (from its spawn), shortest first. */
export function routesTo(k: Know, team: Team, to: Goal): Route[] {
  return k.routes.filter((r) => r.team === team && r.to === to && r.from === "spawn").sort((a, b) => a.len - b.len);
}

// ── kept: the knowledge saved and loaded (the server's disk cache — a restart needn't work it out again) ──

/** A fingerprint of everything the knowledge is worked out from (the map's pieces, spawns, callouts, sites, hostages);
 *  a saved one with another is stale. */
export function mapPrint(map: StrikeMap): string {
  const s = JSON.stringify([
    map.key,
    map.size,
    map.pieces,
    map.spawns,
    map.calls,
    map.sites,
    map.hostages,
    map.rescue,
    KNOW_V,
  ]);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `${map.key}-${h.toString(16)}`;
}
/** the knowledge's own version: bumped when how it's worked out changes */
export const KNOW_V = 5;

const b64 = (a: ArrayBufferView) => {
  const u = new Uint8Array(a.buffer, a.byteOffset, a.byteLength);
  let s = "";
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000));
  return btoa(s);
};
const unb64 = (s: string): Uint8Array => {
  const bin = atob(s);
  const u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return u;
};

/** The knowledge as text (its map and grid left out: made again from the map). */
export function knowToJSON(k: Know): string {
  return JSON.stringify({
    print: mapPrint(k.map),
    areaOf: b64(k.areaOf),
    areas: k.areas,
    adj: k.adj,
    sees: b64(k.sees),
    routes: k.routes.map((r) => ({ ...r, seen: b64(r.seen) })),
    entrances: k.entrances,
    spots: k.spots,
    lineups: k.lineups,
    dangers: k.dangers,
    eta: { r: b64(k.eta.r), w: b64(k.eta.w) },
    goals: k.goals,
    holds: k.holds,
    ms: k.ms,
  });
}
/** The knowledge from text, if it's this map's as it is now (else null); kept as the map's. */
export function knowFromJSON(map: StrikeMap, text: string): Know | null {
  try {
    const o = JSON.parse(text);
    if (o.print !== mapPrint(map)) return null;
    const f32 = (s: string) => {
      const u = unb64(s);
      return new Float32Array(u.buffer, u.byteOffset, u.byteLength / 4);
    };
    const u8 = unb64(o.areaOf);
    const k: Know = {
      map,
      g: gridOf(map),
      areaOf: new Int16Array(u8.buffer, u8.byteOffset, u8.byteLength / 2),
      areas: o.areas,
      adj: o.adj,
      sees: f32(o.sees),
      routes: o.routes.map((r: Route & { seen: string }) => ({ ...r, seen: unb64(r.seen as unknown as string) })),
      entrances: o.entrances,
      spots: o.spots,
      lineups: o.lineups,
      dangers: o.dangers,
      eta: { r: f32(o.eta.r), w: f32(o.eta.w) },
      goals: o.goals,
      holds: o.holds,
      ms: o.ms,
    };
    if (k.areaOf.length !== k.g.hs.length) return null;
    cache.set(map, k);
    jobs.delete(map);
    return k;
  } catch {
    return null;
  }
}
