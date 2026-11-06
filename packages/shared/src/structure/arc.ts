// Walls that bow (docs/plan/72-the-3d-core.md, phase 11; the user's call: arcs in v1): a wall from
// `a` to `b` whose middle stands `bow` metres off the straight line between them, to its left — a
// circle's arc through the three. Everything that reads walls as straight lines reads an arc as its
// chords, short enough (half a metre, a few degrees each) that the bend reads round: the solids, the
// rooms, the snaps. The drawing walks the same points as one wall (posts only at its two ends).
import type { Wall, XY } from "./types.ts";

const CHORD = 0.5; // the longest chord an arc is drawn and held as (m)
const TURN = (7.5 * Math.PI) / 180; // the most a chord turns from the last

/** Whether a wall bows. */
export const isArc = (w: { bow?: number }): boolean => !!w.bow && Math.abs(w.bow) > 1e-6;

/** An arc's circle: its centre and radius, where it starts (angle) and how far it sweeps (signed). */
export function arcCircle(w: { a: XY; b: XY; bow?: number }): { c: XY; r: number; t0: number; sweep: number } | null {
  if (!isArc(w)) return null;
  const s = w.bow as number;
  const dx = w.b[0] - w.a[0];
  const dy = w.b[1] - w.a[1];
  const L = Math.hypot(dx, dy);
  if (L < 1e-9) return null;
  const [nx, ny] = [-dy / L, dx / L];
  const mid: XY = [(w.a[0] + w.b[0]) / 2, (w.a[1] + w.b[1]) / 2];
  const apex: XY = [mid[0] + nx * s, mid[1] + ny * s];
  const r = (s * s + (L / 2) ** 2) / (2 * Math.abs(s));
  const sg = Math.sign(s);
  const c: XY = [apex[0] - nx * sg * r, apex[1] - ny * sg * r];
  const t0 = Math.atan2(w.a[1] - c[1], w.a[0] - c[0]);
  const tm = Math.atan2(apex[1] - c[1], apex[0] - c[0]);
  let half = tm - t0;
  while (half > Math.PI) half -= 2 * Math.PI;
  while (half <= -Math.PI) half += 2 * Math.PI;
  return { c, r, t0, sweep: 2 * half };
}

/** The point `t` (0–1) of the way along a wall (an arc's along its curve). */
export function wallPoint(w: { a: XY; b: XY; bow?: number }, t: number): XY {
  const k = arcCircle(w);
  if (!k) return [w.a[0] + (w.b[0] - w.a[0]) * t, w.a[1] + (w.b[1] - w.a[1]) * t];
  const ang = k.t0 + k.sweep * t;
  return [k.c[0] + Math.cos(ang) * k.r, k.c[1] + Math.sin(ang) * k.r];
}

/** A wall's length (an arc's along its curve). */
export function wallLength(w: { a: XY; b: XY; bow?: number }): number {
  const k = arcCircle(w);
  return k ? Math.abs(k.sweep) * k.r : Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]);
}

/** The points a wall is held and drawn by: its ends, and an arc's corners between (exactly on it). */
export function wallPoints(w: { a: XY; b: XY; bow?: number }): XY[] {
  const k = arcCircle(w);
  if (!k) return [w.a, w.b];
  const n = Math.max(2, Math.ceil((Math.abs(k.sweep) * k.r) / CHORD), Math.ceil(Math.abs(k.sweep) / TURN));
  const out: XY[] = [w.a];
  for (let i = 1; i < n; i++) out.push(wallPoint(w, i / n));
  out.push(w.b);
  return out;
}

/** A wall as straight walls: itself, or an arc's chords (each its own id: `<id>~<n>`). */
export function chordsOf(w: Wall): Wall[] {
  if (!isArc(w)) return [w];
  const pts = wallPoints(w);
  const out: Wall[] = [];
  for (let i = 1; i < pts.length; i++) {
    const { bow: _b, ...rest } = w;
    out.push({ ...rest, id: `${w.id}~${i - 1}`, a: pts[i - 1], b: pts[i] });
  }
  return out;
}

/** Where on a wall a point is nearest: that point, how far, and how far along (0–1). */
export function nearOnWall(w: { a: XY; b: XY; bow?: number }, p: XY): { q: XY; d: number; t: number } {
  const pts = wallPoints(w);
  let best = { q: pts[0], d: Number.POSITIVE_INFINITY, t: 0 };
  const n = pts.length - 1;
  for (let i = 0; i < n; i++) {
    const [a, b] = [pts[i], pts[i + 1]];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const L2 = dx * dx + dy * dy || 1;
    const u = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2));
    const q: XY = [a[0] + dx * u, a[1] + dy * u];
    const d = Math.hypot(p[0] - q[0], p[1] - q[1]);
    if (d < best.d) best = { q, d, t: (i + u) / n };
  }
  return best;
}

/** The bow that puts an arc's middle at `p` (its distance off the line a–b, to the left), rounded to
 *  `step` (0: as it is) and no more than a half circle; a half circle when within `step` of one. */
export function bowThrough(a: XY, b: XY, p: XY, step = 0): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const L = Math.hypot(dx, dy);
  if (L < 1e-9) return 0;
  const off = ((p[0] - a[0]) * -dy + (p[1] - a[1]) * dx) / L;
  const half = L / 2;
  let s = Math.max(-half, Math.min(half, off));
  if (step > 0) s = Math.abs(Math.abs(s) - half) < step / 2 ? Math.sign(s) * half : Math.round(s / step) * step;
  return Math.round(s * 1000) / 1000 + 0;
}
