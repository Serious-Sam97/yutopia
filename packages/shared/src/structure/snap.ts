// Where the pointer snaps while a wall is drawn (docs/plan/72-the-3d-core.md, phase 11; the mocks'
// 02-snaps and the user's call: snaps on, Shift free): to another wall's end or middle, onto its line
// carried on past its end; else from the corner it's drawn from, in angle steps (counted from the wall
// that corner is on) and grid lengths; with no corner yet, to the grid.
import { isArc, nearOnWall, wallPoint } from "./arc.ts";
import type { Wall, XY } from "./types.ts";

/** Which way a wall runs at a point on it (an arc: its tangent there). */
function headingAt(w: Wall, p: XY): number {
  if (!isArc(w)) return Math.atan2(w.b[1] - w.a[1], w.b[0] - w.a[0]);
  const { t } = nearOnWall(w, p);
  const [q0, q1] = [wallPoint(w, Math.max(0, t - 0.01)), wallPoint(w, Math.min(1, t + 0.01))];
  return Math.atan2(q1[1] - q0[1], q1[0] - q0[0]);
}

export interface SnapOpts {
  /** the grid (m; 0: none) */
  grid: number;
  /** the angle steps (degrees; 0: none) */
  angle: number;
  /** to other walls: their ends, middles and lines */
  walls: boolean;
  /** how near counts (m) */
  near?: number;
}

export type SnapKind = "end" | "middle" | "line" | "square" | "angle" | "grid" | "free";

export interface Snapped {
  p: XY;
  kind: SnapKind;
  /** the wall it snapped to (an end, a middle, a line) */
  wall?: string;
}

// (to the mm, as walls are kept: a quarter turn lands on its line, not 1e-16 off it)
const mm = (v: number) => Math.round(v * 1000) / 1000 + 0;
const dist = (a: XY, b: XY) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/** The foot of p on the segment a–b (its fraction along, clamped) and how far p is from it. */
function onSeg(p: XY, a: XY, b: XY): { t: number; q: XY; d: number } {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const L2 = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2));
  const q: XY = [a[0] + dx * t, a[1] + dy * t];
  return { t, q, d: dist(p, q) };
}

/** The wall a point lies on (within `eps`), if any. */
export function wallAt(walls: readonly Wall[], p: XY, eps = 0.05): Wall | null {
  let best: Wall | null = null;
  let bd = eps;
  for (const w of walls) {
    const { d } = isArc(w) ? nearOnWall(w, p) : onSeg(p, w.a, w.b);
    if (d <= bd) {
      bd = d;
      best = w;
    }
  }
  return best;
}

/** Where `p` snaps (`from`: the corner the wall's drawn from; `walls`: those on the floor). */
export function snapPoint(p: XY, from: XY | null, walls: readonly Wall[], o: SnapOpts): Snapped {
  const near = o.near ?? 0.35;
  if (o.walls) {
    // another wall's end, then its middle
    let best: Snapped | null = null;
    let bd = near;
    for (const w of walls)
      for (const e of [w.a, w.b]) {
        const d = dist(p, e);
        if (d < bd) {
          bd = d;
          best = { p: [e[0], e[1]], kind: "end", wall: w.id };
        }
      }
    if (best) return best;
    for (const w of walls) {
      const m: XY = wallPoint(w, 0.5); // (an arc's: the top of its bow)
      const d = dist(p, m);
      if (d < bd) {
        bd = d;
        best = { p: m, kind: "middle", wall: w.id };
      }
    }
    if (best) return best;
  }
  if (from) {
    // from the corner: square off the wall it's on, else in angle steps from it (or from x)
    const dx = p[0] - from[0];
    const dy = p[1] - from[1];
    let len = Math.hypot(dx, dy);
    let ang = Math.atan2(dy, dx);
    let kind: SnapKind = "free";
    const on = o.walls ? wallAt(walls, from) : null;
    const base = on ? headingAt(on, from) : 0;
    if (o.angle > 0) {
      const step = (o.angle * Math.PI) / 180;
      const k = Math.round((ang - base) / step);
      ang = base + k * step;
      kind = "angle";
      // (a quarter turn off the wall it starts on: square to it)
      if (on && Math.abs(Math.abs(((((ang - base) / (Math.PI / 2)) % 2) + 2) % 2) - 1) < 1e-6) kind = "square";
    }
    if (o.grid > 0) len = Math.round(len / o.grid) * o.grid;
    const q: XY = [mm(from[0] + Math.cos(ang) * len), mm(from[1] + Math.sin(ang) * len)];
    // carried on: onto another wall's line, past its end, near where it's going
    if (o.walls)
      for (const w of walls) {
        if (isArc(w)) continue;
        const wx = w.b[0] - w.a[0];
        const wy = w.b[1] - w.a[1];
        const L = Math.hypot(wx, wy) || 1;
        const [ux, uy] = [wx / L, wy / L];
        const off = (q[0] - w.a[0]) * -uy + (q[1] - w.a[1]) * ux;
        const along = (q[0] - w.a[0]) * ux + (q[1] - w.a[1]) * uy;
        if (Math.abs(off) < near && (along < -0.05 || along > L + 0.05)) {
          // where the drawn line meets that line (along its own direction, so its angle is kept)
          const cx = Math.cos(ang);
          const cy = Math.sin(ang);
          const den = cx * -uy + cy * ux;
          if (Math.abs(den) > 1e-6) {
            const s = -((from[0] - w.a[0]) * -uy + (from[1] - w.a[1]) * ux) / den;
            if (s > 0) return { p: [mm(from[0] + cx * s), mm(from[1] + cy * s)], kind: "line", wall: w.id };
          }
        }
      }
    return { p: q, kind };
  }
  if (o.grid > 0) return { p: [Math.round(p[0] / o.grid) * o.grid, Math.round(p[1] / o.grid) * o.grid], kind: "grid" };
  return { p, kind: "free" };
}
