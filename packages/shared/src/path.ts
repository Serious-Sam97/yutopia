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
  const W = grid.width;
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
  const start = sy * W + sx;
  const goal = ty * W + tx;
  const N = grid.width * grid.height;
  const g = new Float64Array(N).fill(Number.POSITIVE_INFINITY);
  const f = new Float64Array(N).fill(Number.POSITIVE_INFINITY);
  const came = new Int32Array(N).fill(-1);
  const closed = new Uint8Array(N);
  const h = (n: number) => {
    const dx = Math.abs((n % W) - tx);
    const dy = Math.abs(Math.floor(n / W) - ty);
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
    const cx = cur % W;
    const cy = Math.floor(cur / W);
    for (const [dx, dy, cost] of NEIGH) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (!grid.step(cx, cy, nx, ny)) continue;
      const n = ny * W + nx;
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
  for (let n = goal; n !== -1 && n !== start; n = came[n]) cells.push({ x: (n % W) + 0.5, y: Math.floor(n / W) + 0.5 });
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
