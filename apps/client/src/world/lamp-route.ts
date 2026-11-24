// The waypoint's route along the ways (docs/plan/125-the-new-ui.md F7a): GTA's gold line, on the roads. The Grounds'
// ways (shared grounds.ts WAYS) as a graph — their samples every few metres joined along each way, and to the
// nearest samples of other ways where they meet — and A* from the sample nearest me to the one nearest the
// waypoint. Made once (the ways don't move while you play), searched as you go.

type G = typeof import("@yutopia/shared/grounds");
interface Graph {
  x: Float32Array;
  z: Float32Array;
  adj: number[][];
  cell: Map<string, number[]>;
}
const STEP = 6; // m between the graph's points along a way
const JOIN = 7; // two ways' points this near: a crossing
const CELL = 24;
let graph: Graph | null = null;
// (what it was made from: WAYS is laid again in place after an edit — fresh ways in the same array — so its first
// way and its count say whether it's still the same)
let graphOf: unknown = null;
let graphN = -1;

function build(g: G): Graph {
  const xs: number[] = [];
  const zs: number[] = [];
  const adj: number[][] = [];
  const cell = new Map<string, number[]>();
  const key = (x: number, z: number) => `${Math.floor(x / CELL)},${Math.floor(z / CELL)}`;
  const add = (x: number, z: number) => {
    const i = xs.length;
    xs.push(x);
    zs.push(z);
    adj.push([]);
    const k = key(x, z);
    const c = cell.get(k);
    if (c) c.push(i);
    else cell.set(k, [i]);
    return i;
  };
  const wayOf: number[] = [];
  for (const [wi, way] of g.WAYS.entries()) {
    let prev = -1;
    let acc = STEP;
    let last: [number, number] | null = null;
    for (const [j, p] of way.line.entries()) {
      if (last) acc += Math.hypot(p[0] - last[0], p[1] - last[1]);
      last = p;
      if (acc < STEP && j !== way.line.length - 1) continue;
      acc = 0;
      const i = add(p[0], p[1]);
      wayOf[i] = wi;
      if (prev >= 0) {
        adj[prev].push(i);
        adj[i].push(prev);
      }
      prev = i;
    }
  }
  // the crossings: points of different ways near each other
  for (let i = 0; i < xs.length; i++) {
    const cx = Math.floor(xs[i] / CELL);
    const cz = Math.floor(zs[i] / CELL);
    for (let dx = -1; dx <= 1; dx++)
      for (let dz = -1; dz <= 1; dz++)
        for (const j of cell.get(`${cx + dx},${cz + dz}`) ?? []) {
          if (j <= i || wayOf[j] === wayOf[i]) continue;
          if (Math.hypot(xs[i] - xs[j], zs[i] - zs[j]) <= JOIN) {
            adj[i].push(j);
            adj[j].push(i);
          }
        }
  }
  return { x: Float32Array.from(xs), z: Float32Array.from(zs), adj, cell };
}

function nearest(gr: Graph, x: number, z: number): number {
  let best = -1;
  let bd = Infinity;
  for (let r = 1; r <= 64 && best < 0; r *= 2) {
    const cx = Math.floor(x / CELL);
    const cz = Math.floor(z / CELL);
    for (let dx = -r; dx <= r; dx++)
      for (let dz = -r; dz <= r; dz++)
        for (const i of gr.cell.get(`${cx + dx},${cz + dz}`) ?? []) {
          const d = Math.hypot(gr.x[i] - x, gr.z[i] - z);
          if (d < bd) {
            bd = d;
            best = i;
          }
        }
  }
  return best;
}

/** The way from (x, z) to the waypoint along the ways: points [x, z] from me to it (straight if there's no way). */
export function routeTo(g: G, from: { x: number; y: number }, to: { x: number; y: number }): [number, number][] {
  if (graphOf !== g.WAYS[0] || graphN !== g.WAYS.length) {
    graph = build(g);
    graphOf = g.WAYS[0];
    graphN = g.WAYS.length;
  }
  const gr = graph as Graph;
  const straight: [number, number][] = [
    [from.x, from.y],
    [to.x, to.y],
  ];
  if (!gr.x.length) return straight;
  const a = nearest(gr, from.x, from.y);
  const b = nearest(gr, to.x, to.y);
  if (a < 0 || b < 0 || a === b) return straight;
  // A* (a binary heap on the f scores)
  const n = gr.x.length;
  const gs = new Float64Array(n).fill(Infinity);
  const came = new Int32Array(n).fill(-1);
  const heap: [number, number][] = [];
  const push = (f: number, i: number) => {
    heap.push([f, i]);
    let k = heap.length - 1;
    while (k > 0) {
      const p = (k - 1) >> 1;
      if (heap[p][0] <= heap[k][0]) break;
      [heap[p], heap[k]] = [heap[k], heap[p]];
      k = p;
    }
  };
  const pop = (): number => {
    const top = heap[0][1];
    const last = heap.pop() as [number, number];
    if (heap.length) {
      heap[0] = last;
      let k = 0;
      for (;;) {
        const l = 2 * k + 1;
        const r = l + 1;
        let m = k;
        if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
        if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
        if (m === k) break;
        [heap[m], heap[k]] = [heap[k], heap[m]];
        k = m;
      }
    }
    return top;
  };
  const h = (i: number) => Math.hypot(gr.x[i] - gr.x[b], gr.z[i] - gr.z[b]);
  gs[a] = 0;
  push(h(a), a);
  let seen = 0;
  while (heap.length && seen++ < 200_000) {
    const i = pop();
    if (i === b) break;
    for (const j of gr.adj[i]) {
      const ng = gs[i] + Math.hypot(gr.x[i] - gr.x[j], gr.z[i] - gr.z[j]);
      if (ng < gs[j]) {
        gs[j] = ng;
        came[j] = i;
        push(ng + h(j), j);
      }
    }
  }
  if (came[b] < 0) return straight;
  const path: [number, number][] = [[to.x, to.y]];
  for (let i = b; i >= 0; i = came[i]) path.push([gr.x[i], gr.z[i]]);
  path.push([from.x, from.y]);
  return path.reverse();
}
