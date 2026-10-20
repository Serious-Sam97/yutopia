import type { Grid } from "./grid.ts";
import type { Point } from "./iso.ts";

const SQRT2 = Math.SQRT2;
const NEIGH = [
  [1, 0, 1],
  [-1, 0, 1],
  [0, 1, 1],
  [0, -1, 1],
  [1, 1, SQRT2],
  [1, -1, SQRT2],
  [-1, 1, SQRT2],
  [-1, -1, SQRT2],
] as const;

// Binary min-heap keyed by f-score.
class Heap {
  private items: number[] = [];
  constructor(private readonly f: Float64Array) {}
  get size() {
    return this.items.length;
  }
  push(n: number) {
    const a = this.items;
    a.push(n);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.f[a[p]] <= this.f[a[i]]) break;
      [a[p], a[i]] = [a[i], a[p]];
      i = p;
    }
  }
  pop(): number {
    const a = this.items;
    const top = a[0];
    const last = a.pop() as number;
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < a.length && this.f[a[l]] < this.f[a[m]]) m = l;
        if (r < a.length && this.f[a[r]] < this.f[a[m]]) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]];
        i = m;
      }
    }
    return top;
  }
}

// A* over tiles (8-way, no corner cutting, never across a wall edge), then string-pulled into as few
// straight segments as the body can actually walk. Returns waypoints after `from`.
export function findPath(grid: Grid, from: Point, to: Point, maxNodes = 6000): Point[] | null {
  let sx = Math.floor(from.x);
  let sy = Math.floor(from.y);
  let tx = Math.floor(to.x);
  let ty = Math.floor(to.y);
  if (!grid.ok(tx, ty)) {
    const near = grid.nearestOpen(to.x, to.y, 3);
    if (!near) return null;
    tx = Math.floor(near.x);
    ty = Math.floor(near.y);
  }
  if (!grid.ok(sx, sy)) {
    // up on something (shared/jump.ts): from the floor beside it (walking off its edge)
    const near = grid.nearestOpen(from.x, from.y, 2);
    if (!near) return null;
    sx = Math.floor(near.x);
    sy = Math.floor(near.y);
  }
  // where to search: the floor; outdoors, a box round the two ends (the land
  // goes on far past the floor's tiles)
  let x0 = 0;
  let y0 = 0;
  let BW = grid.width;
  let BH = grid.height;
  if (grid.outside) {
    const m = 40;
    x0 = Math.min(sx, tx) - m;
    y0 = Math.min(sy, ty) - m;
    BW = Math.max(sx, tx) + m + 1 - x0;
    BH = Math.max(sy, ty) + m + 1 - y0;
    if (BW * BH > 640 * 640) return null; // (too far to walk to in one go)
    maxNodes = Math.max(maxNodes, 40000);
  }
  const id = (x: number, y: number) => (y - y0) * BW + (x - x0);
  const start = id(sx, sy);
  const goal = id(tx, ty);
  const N = BW * BH;
  const g = new Float64Array(N).fill(Number.POSITIVE_INFINITY);
  const f = new Float64Array(N).fill(Number.POSITIVE_INFINITY);
  const came = new Int32Array(N).fill(-1);
  const closed = new Uint8Array(N);
  const h = (n: number) => {
    const dx = Math.abs((n % BW) + x0 - tx);
    const dy = Math.abs(Math.floor(n / BW) + y0 - ty);
    return dx + dy + (SQRT2 - 2) * Math.min(dx, dy);
  };
  g[start] = 0;
  f[start] = h(start);
  const open = new Heap(f);
  open.push(start);
  let expanded = 0;
  while (open.size) {
    const cur = open.pop();
    if (cur === goal) break;
    if (closed[cur]) continue;
    closed[cur] = 1;
    if (++expanded > maxNodes) return null;
    const cx = (cur % BW) + x0;
    const cy = Math.floor(cur / BW) + y0;
    for (const [dx, dy, cost] of NEIGH) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx < x0 || ny < y0 || nx >= x0 + BW || ny >= y0 + BH) continue;
      if (!grid.step(cx, cy, nx, ny)) continue;
      const n = id(nx, ny);
      const ng = g[cur] + cost;
      if (ng < g[n]) {
        g[n] = ng;
        f[n] = ng + h(n);
        came[n] = cur;
        open.push(n);
      }
    }
  }
  if (start !== goal && came[goal] === -1) return null;
  const cells: Point[] = [];
  for (let n = goal; n !== -1 && n !== start; n = came[n])
    cells.push({ x: (n % BW) + x0 + 0.5, y: Math.floor(n / BW) + y0 + 0.5 });
  cells.reverse();
  // Exact click target when it's inside the goal tile and reachable.
  if (Math.floor(to.x) === tx && Math.floor(to.y) === ty && grid.fits(to.x, to.y)) {
    if (cells.length) cells[cells.length - 1] = { x: to.x, y: to.y };
    else cells.push({ x: to.x, y: to.y });
  }
  return smooth(grid, from, cells);
}

function smooth(grid: Grid, from: Point, pts: Point[]): Point[] {
  if (pts.length <= 1) return pts;
  const out: Point[] = [];
  let anchor = from;
  let i = 0;
  while (i < pts.length) {
    let j = pts.length - 1;
    while (j > i && !grid.clear(anchor, pts[j])) j--;
    out.push(pts[j]);
    anchor = pts[j];
    i = j + 1;
  }
  return out;
}
