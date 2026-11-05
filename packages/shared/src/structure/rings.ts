// Polygons from whole cells and back (docs/plan/72-the-3d-core.md, phase 6): a region of a tile
// grid traced into outlines with holes, and a polygon's cells read back by their middles. Every
// corner of a traced ring lies on whole metres, so the cells come back exactly.
import type { Ring, XY } from "./types.ts";

/** Twice the signed area (the shoelace sum; with y down the map, an outline traced here is negative). */
export function area2(r: Ring): number {
  let s = 0;
  for (let i = 0; i < r.length; i++) {
    const [x0, y0] = r[i];
    const [x1, y1] = r[(i + 1) % r.length];
    s += x0 * y1 - x1 * y0;
  }
  return s;
}

/** Is (x, y) inside the ring (even-odd; a point on an edge counts by which side it's on)? */
export function inRing(r: Ring, x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, yi] = r[i];
    const [xj, yj] = r[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** A polygon with holes: is (x, y) on it? */
export const inShape = (outline: Ring, holes: Ring[], x: number, y: number): boolean =>
  inRing(outline, x, y) && !holes.some((h) => inRing(h, x, y));

const key = (x: number, y: number) => `${x},${y}`;

/** The rings round a region of cells (`has(x, y)`, cells within w × h, the grid's corner at
 *  (ox, oy)): each outline walked with the region on its left, each hole the other way round,
 *  collinear points dropped, each hole given to the outline it lies in. */
export function traceRegion(
  w: number,
  h: number,
  has: (x: number, y: number) => boolean,
  ox = 0,
  oy = 0,
): { outline: Ring; holes: Ring[] }[] {
  // the region's boundary as directed unit edges, the region on their left as one walks them
  // (y down: a cell's top edge walked west, its left edge south, its bottom east, its right north)
  const out = new Map<string, XY[]>();
  const add = (a: XY, b: XY) => {
    const k = key(a[0], a[1]);
    const l = out.get(k);
    if (l) l.push(b);
    else out.set(k, [b]);
  };
  let edges = 0;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (!has(x, y)) continue;
      if (y === 0 || !has(x, y - 1)) {
        add([x + 1, y], [x, y]);
        edges++;
      }
      if (x === 0 || !has(x - 1, y)) {
        add([x, y], [x, y + 1]);
        edges++;
      }
      if (y === h - 1 || !has(x, y + 1)) {
        add([x, y + 1], [x + 1, y + 1]);
        edges++;
      }
      if (x === w - 1 || !has(x + 1, y)) {
        add([x + 1, y + 1], [x + 1, y]);
        edges++;
      }
    }
  // linked into loops; where two loops touch at a corner (two edges leave it) the walk turns left
  // first, keeping each cell's corner with its own loop
  const rings: Ring[] = [];
  while (edges > 0) {
    let start: string | undefined;
    for (const [k, l] of out)
      if (l.length) {
        start = k;
        break;
      }
    if (start === undefined) break;
    const [sx, sy] = start.split(",").map(Number);
    const ring: Ring = [[sx, sy]];
    let [cx, cy] = [sx, sy];
    let dir: XY | null = null;
    for (;;) {
      const l = out.get(key(cx, cy)) as XY[];
      let pick = 0;
      if (l.length > 1 && dir) {
        // turn left first: the candidate with the greatest left turn from the way we came
        let best = Number.NEGATIVE_INFINITY;
        for (let i = 0; i < l.length; i++) {
          const nd: XY = [l[i][0] - cx, l[i][1] - cy];
          const cross = dir[0] * nd[1] - dir[1] * nd[0]; // (y down: negative is a left turn)
          const score = -cross * 2 + (dir[0] * nd[0] + dir[1] * nd[1]);
          if (score > best) {
            best = score;
            pick = i;
          }
        }
      }
      const [nx, ny] = l.splice(pick, 1)[0];
      edges--;
      dir = [nx - cx, ny - cy];
      [cx, cy] = [nx, ny];
      if (cx === sx && cy === sy) break;
      ring.push([cx, cy]);
    }
    rings.push(simplify(ring).map(([x, y]) => [x + ox, y + oy] as XY));
  }
  // outlines (the region on the left, y down: a negative shoelace sum) and holes
  const outlines = rings.filter((r) => area2(r) < 0);
  const holes = rings.filter((r) => area2(r) > 0);
  const shapes = outlines.map((outline) => ({ outline, holes: [] as Ring[] }));
  for (const hole of holes) {
    // a point just inside the hole (off its first edge, on the hole's side), in the smallest
    // outline holding it
    const p = insidePoint(hole);
    let best: (typeof shapes)[number] | null = null;
    for (const s of shapes)
      if (inRing(s.outline, p[0], p[1]) && (!best || Math.abs(area2(s.outline)) < Math.abs(area2(best.outline))))
        best = s;
    if (best) best.holes.push(hole);
  }
  return shapes;
}

/** Drop points in the middle of a straight run. */
function simplify(r: Ring): Ring {
  const out: Ring = [];
  for (let i = 0; i < r.length; i++) {
    const p = r[(i - 1 + r.length) % r.length];
    const c = r[i];
    const n = r[(i + 1) % r.length];
    const cross = (c[0] - p[0]) * (n[1] - c[1]) - (c[1] - p[1]) * (n[0] - c[0]);
    if (cross !== 0) out.push(c);
  }
  return out;
}

/** A point a hair inside a hole (the region is on the walker's left, so the hole's on the right). */
function insidePoint(r: Ring): XY {
  const [ax, ay] = r[0];
  const [bx, by] = r[1];
  const mx = (ax + bx) / 2;
  const my = (ay + by) / 2;
  const dx = Math.sign(bx - ax);
  const dy = Math.sign(by - ay);
  // the right of (dx, dy) with y down is (−dy, dx)
  return [mx - dy * 0.25, my + dx * 0.25];
}

/** The cells of a w × h grid (its corner at ox, oy) whose middles a shape covers. */
export function cellsOf(
  outline: Ring,
  holes: Ring[],
  w: number,
  h: number,
  ox: number,
  oy: number,
  set: (x: number, y: number) => void,
): void {
  let x0 = Number.POSITIVE_INFINITY;
  let y0 = Number.POSITIVE_INFINITY;
  let x1 = Number.NEGATIVE_INFINITY;
  let y1 = Number.NEGATIVE_INFINITY;
  for (const [x, y] of outline) {
    x0 = Math.min(x0, x);
    y0 = Math.min(y0, y);
    x1 = Math.max(x1, x);
    y1 = Math.max(y1, y);
  }
  for (let y = Math.max(0, Math.floor(y0 - oy)); y < Math.min(h, Math.ceil(y1 - oy)); y++)
    for (let x = Math.max(0, Math.floor(x0 - ox)); x < Math.min(w, Math.ceil(x1 - ox)); x++)
      if (inShape(outline, holes, x + ox + 0.5, y + oy + 0.5)) set(x, y);
}
