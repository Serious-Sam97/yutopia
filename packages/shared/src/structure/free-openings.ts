// Doors and windows in walls drawn free (docs/plan/72-the-3d-core.md, phase 11.6; the mocks' 06):
// an opening slid along any wall at any angle — kept by the wall it's in and how far along it its
// middle is (`props.on`, attach.ts), marked `props.free`. Its x, y are where it starts along the wall
// and its yaw the wall's heading (a wall along x: 0, along y: π/2 — the quarter turns the tile
// tool's openings have), so its model is laid along the wall from there as theirs always was. The
// tile tool's openings (on the tile lines, by edges) stay as they are; the code that reads edges
// passes these by (openingEdges gives them none).
import { entry, type WorldObjectDef } from "../catalog.ts";
import { isDoorKind, isOpening, openingCut, wallTakes } from "../openings.ts";
import { arcCircle, isArc, nearOnWall, wallLength, wallPoint } from "./arc.ts";
import { type On, onOf } from "./attach.ts";
import type { Structure, Wall, XY } from "./types.ts";

/** An opening in a wall drawn free (by its wall and how far along it). */
export const isFreeOpening = (o: { kind: string; props?: Record<string, unknown> | null }): boolean =>
  isOpening(o.kind) && o.props?.free === true;

/** How wide an opening is along its wall (m). */
export const openingSpan = (kind: string): number => Math.max(1, entry(kind).w);

// (an arc's along its curve)
const lengthOf = (w: Wall) => wallLength(w);
/** A wall's heading (radians, 0..2π: the yaw an opening in it has). */
export const headingOf = (w: Wall): number => {
  const h = Math.atan2(w.b[1] - w.a[1], w.b[0] - w.a[0]);
  return h < 0 ? h + 2 * Math.PI : h;
};

/** Where an opening `at` along wall `w` starts (x, y) and its yaw. */
export function placeOnWall(w: Wall, at: number, kind: string): { x: number; y: number; yaw: number } {
  const L = lengthOf(w) || 1;
  const r4 = (v: number) => Math.round(v * 1e4) / 1e4;
  if (isArc(w)) {
    // (in an arc: across the curve from where it starts to where it ends — a chord, its frame
    // over the little the curve stands off it)
    const s = at - openingSpan(kind) / 2;
    const p0 = wallPoint(w, s / L);
    const p1 = wallPoint(w, (s + openingSpan(kind)) / L);
    const h = Math.atan2(p1[1] - p0[1], p1[0] - p0[0]);
    return { x: r4(p0[0]), y: r4(p0[1]), yaw: Math.round((h < 0 ? h + 2 * Math.PI : h) * 1e5) / 1e5 };
  }
  const [ux, uy] = [(w.b[0] - w.a[0]) / L, (w.b[1] - w.a[1]) / L];
  const s = at - openingSpan(kind) / 2;
  const r = (v: number) => Math.round(v * 1e4) / 1e4;
  return { x: r(w.a[0] + ux * s), y: r(w.a[1] + uy * s), yaw: headingOf(w) };
}

/** A free opening's middle (world). */
export function freeOpeningMiddle(o: { kind: string; x: number; y: number; yaw?: number }): XY {
  const n = openingSpan(o.kind) / 2;
  const yaw = o.yaw ?? 0;
  return [o.x + Math.cos(yaw) * n, o.y + Math.sin(yaw) * n];
}

/** The holes free openings cut in a wall: from `u0` to `u1` along it (m from its `a`), `z0`–`z1` up. */
export function freeCuts(
  objects: Iterable<WorldObjectDef>,
  wall: string,
): { id: string; kind: string; u0: number; u1: number; z0: number; z1: number }[] {
  const out: { id: string; kind: string; u0: number; u1: number; z0: number; z1: number }[] = [];
  for (const o of objects) {
    if (!isFreeOpening(o)) continue;
    const on = onOf(o);
    if (!on || on.wall !== wall) continue;
    const n = openingSpan(o.kind) / 2;
    const [z0, z1] = openingCut(o.kind);
    out.push({ id: o.id, kind: o.kind, u0: on.at - n, u1: on.at + n, z0, z1 });
  }
  return out.sort((a, b) => a.u0 - b.u0);
}

/** Why an opening can't go `on` this wall (null: it can): a wall of this floor, drawn free (one on
 *  the tile lines takes the tile tool's), straight, that takes this kind; the opening on it whole,
 *  under its top, clear of the others in it. */
export function freeOpeningWhy(
  s: Pick<Structure, "walls">,
  floor: number,
  kind: string,
  on: On,
  others: Iterable<WorldObjectDef>,
  self?: string,
): string | null {
  const w = s.walls.find((q) => q.id === on.wall && q.floor === floor);
  if (!w) return "no wall there";
  // (in an arc: no tighter than its frame covers — the curve no more than 12 cm off its chord)
  const k = arcCircle(w);
  if (k) {
    const h = openingSpan(kind) / 2;
    if (h >= k.r || k.r - Math.sqrt(k.r * k.r - h * h) > 0.12) return "too tight a curve";
  }
  if (!wallTakes(kind, w.front)) return isDoorKind(kind) ? "that wall takes no door" : "that wall takes no window";
  const n = openingSpan(kind);
  const L = lengthOf(w);
  if (n > L + 1e-6) return "the wall's too short";
  if (on.at < n / 2 - 1e-6 || on.at > L - n / 2 + 1e-6) return "off the end of the wall";
  if (openingCut(kind)[1] > w.height + 1e-3) return "the wall's too low";
  for (const c of freeCuts(others, w.id))
    if (c.id !== self && c.u0 < on.at + n / 2 - 1e-6 && c.u1 > on.at - n / 2 + 1e-6) return "another's there";
  return null;
}

/** The spot along a wall nearest `p` an opening can have: its middle snapped to `step` (m), kept
 *  on the wall whole. */
export function openingAlong(w: Wall, p: XY, kind: string, step = 0.25): number {
  const L = lengthOf(w) || 1;
  const t = isArc(w)
    ? nearOnWall(w, p).t * L
    : ((p[0] - w.a[0]) * (w.b[0] - w.a[0]) + (p[1] - w.a[1]) * (w.b[1] - w.a[1])) / L;
  const n = openingSpan(kind) / 2;
  const at = step > 0 ? Math.round(t / step) * step : t;
  return Math.round(Math.max(n, Math.min(L - n, at)) * 1e4) / 1e4;
}
