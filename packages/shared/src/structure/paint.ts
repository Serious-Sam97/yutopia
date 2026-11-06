// Painting walls (docs/plan/72-the-3d-core.md, phase 11: the tile tools retired — their Paint's
// panels, drags and rooms, on the structure's walls). A stretch of one face painted: the wall split
// where the stretch starts and ends (its pieces as it was, the middle one painted), whole when the
// stretch is all of it. A room's faces: the stretches of its walls along its outline, the side that
// looks into it. Glass and half walls have no sides to paint; an arc is painted whole.
import { isArc } from "./arc.ts";
import { FACE_PAINTS } from "./edit.ts";
import type { StructOp } from "./ops.ts";
import { frontNormal, onTiles } from "./query.ts";
import type { Structure, Wall, XY } from "./types.ts";

/** One face's stretch to paint: along wall `id` from `from` to `to` (m from its `a`), `side` +1 its
 *  front (its left, a to b), −1 its back. */
export interface PaintStretch {
  id: string;
  side: 1 | -1;
  from: number;
  to: number;
  mat: string;
}

const EPS = 0.01;
const r3 = (v: number) => Math.round(v * 1000) / 1000;
const len = (w: Wall) => Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]);
const lerp = (w: Wall, t: number): XY => {
  const L = len(w) || 1;
  return [r3(w.a[0] + ((w.b[0] - w.a[0]) * t) / L), r3(w.a[1] + ((w.b[1] - w.a[1]) * t) / L)];
};

/** A wall's piece from `t0` to `t1` (m), as it was otherwise; a new id unless it's all of it. */
function piece(w: Wall, t0: number, t1: number, id: string): Wall {
  return { ...w, id, a: lerp(w, t0), b: lerp(w, t1) };
}

/** A face painted: its front or back `mat` (a back like the front isn't kept). */
function painted(w: Wall, side: 1 | -1, mat: string): Wall {
  const front = side > 0 ? mat : w.front;
  const back = side < 0 ? mat : (w.back ?? w.front);
  const { back: _b, ...rest } = w;
  return { ...rest, front, ...(back !== front ? { back } : {}) };
}

/** Where wall `id`'s pieces went: [old id, its pieces with where each starts along it (m)]. */
export type PaintMoves = Map<string, { id: string; from: number; to: number }[]>;

/** Stretches painted, as the structure's operation (null: nothing changes), and where each split
 *  wall's pieces start (what's on it — a door, a picture — goes onto the piece it's on). */
export function wallsPaint(
  s: Structure,
  floor: number,
  stretches: readonly PaintStretch[],
  newId: () => string,
): { op: StructOp; moves: PaintMoves } | { why: string } {
  const byWall = new Map<string, PaintStretch[]>();
  for (const p of stretches) {
    if (!(FACE_PAINTS as readonly string[]).includes(p.mat)) return { why: "not a wall's paint" };
    byWall.set(p.id, [...(byWall.get(p.id) ?? []), p]);
  }
  const remove: string[] = [];
  const add: Wall[] = [];
  const moves: PaintMoves = new Map();
  for (const [id, list] of byWall) {
    const w = s.walls.find((q) => q.id === id && q.floor === floor);
    if (!w) return { why: "no such wall" };
    if (!(FACE_PAINTS as readonly string[]).includes(w.front)) continue;
    const L = len(w);
    // (an arc: all of it; a wall on the cells' edges at whole metres — its pieces stay on them, drawn
    // as it was)
    const f = s.floors.find((q) => q.index === floor) ?? null;
    const whole = (t: number) => (f && onTiles(w, f) ? Math.round(t) : t);
    const spans = list.map((p) =>
      isArc(w)
        ? { ...p, from: 0, to: L }
        : {
            ...p,
            from: whole(Math.max(0, Math.min(p.from, p.to))),
            to: whole(Math.min(L, Math.max(p.from, p.to))),
          },
    );
    // its pieces: cut where a stretch starts or ends (not at its own ends)
    const cuts = [0, L];
    for (const p of spans)
      for (const t of [p.from, p.to])
        if (t > EPS && t < L - EPS && !cuts.some((c) => Math.abs(c - t) < EPS)) cuts.push(t);
    cuts.sort((a, b) => a - b);
    const all = cuts.length === 2;
    const pieces: { id: string; from: number; to: number; wall: Wall }[] = [];
    for (let i = 1; i < cuts.length; i++) {
      const [t0, t1] = [cuts[i - 1], cuts[i]];
      let q = all ? w : piece(w, t0, t1, newId());
      const mid = (t0 + t1) / 2;
      for (const p of spans) if (mid > p.from && mid < p.to && p.to - p.from > EPS) q = painted(q, p.side, p.mat);
      pieces.push({ id: q.id, from: t0, to: t1, wall: q });
    }
    const same = all && pieces[0].wall.front === w.front && (pieces[0].wall.back ?? w.front) === (w.back ?? w.front);
    if (same) continue;
    remove.push(w.id);
    add.push(...pieces.map((p) => p.wall));
    if (!all)
      moves.set(
        w.id,
        pieces.map(({ id: pid, from, to }) => ({ id: pid, from, to })),
      );
  }
  if (!add.length) return { why: "as it is" };
  return { op: { op: "walls", remove, add }, moves };
}

/** Where a thing on a split wall goes: its piece and how far along that (null: the wall wasn't split). */
export function movedOn(moves: PaintMoves, on: { wall: string; at: number }): { wall: string; at: number } | null {
  const ps = moves.get(on.wall);
  if (!ps) return null;
  const p = ps.find((q) => on.at >= q.from - 1e-6 && on.at <= q.to + 1e-6) ?? ps[ps.length - 1];
  return { wall: p.id, at: Math.round((on.at - p.from) * 1e4) / 1e4 };
}

/** The stretch of a wall between the walls meeting it round `t` (m along it): what a click paints. */
export function stretchAt(s: Structure, w: Wall, t: number): { from: number; to: number } {
  const L = len(w);
  if (isArc(w) || L < EPS) return { from: 0, to: L };
  const [ux, uy] = [(w.b[0] - w.a[0]) / L, (w.b[1] - w.a[1]) / L];
  const cuts: number[] = [];
  for (const q of s.walls) {
    if (q === w || q.floor !== w.floor) continue;
    for (const p of [q.a, q.b]) {
      const [dx, dy] = [p[0] - w.a[0], p[1] - w.a[1]];
      const along = dx * ux + dy * uy;
      const off = Math.abs(dx * -uy + dy * ux);
      if (off < 0.2 && along > EPS && along < L - EPS) cuts.push(along);
    }
  }
  let from = 0;
  let to = L;
  for (const c of cuts) {
    if (c <= t && c > from) from = c;
    if (c > t && c < to) to = c;
  }
  return { from: r3(from), to: r3(to) };
}

/** A room's faces: every stretch of a wall along its outline, painted on the side that looks into
 *  it (its outline's inside). */
export function roomStretches(s: Structure, key: string, mat: string): PaintStretch[] {
  const room = s.rooms.find((r) => r.key === key);
  if (!room) return [];
  const f = s.floors.find((q) => q.index === room.floor) ?? null;
  const out: PaintStretch[] = [];
  const ring = room.outline;
  // (the outline's inside: by the sign of its area — a ring walked with the inside on its left or right)
  let a2 = 0;
  for (let i = 0; i < ring.length; i++) {
    const [x0, y0] = ring[i];
    const [x1, y1] = ring[(i + 1) % ring.length];
    a2 += x0 * y1 - x1 * y0;
  }
  for (let i = 0; i < ring.length; i++) {
    const p = ring[i];
    const q = ring[(i + 1) % ring.length];
    const SL = Math.hypot(q[0] - p[0], q[1] - p[1]);
    if (SL < EPS) continue;
    const [sx, sy] = [(q[0] - p[0]) / SL, (q[1] - p[1]) / SL];
    // a point just inside, off the segment's middle
    const inward: XY = a2 > 0 ? [-sy, sx] : [sy, -sx];
    for (const w of s.walls) {
      if (w.floor !== room.floor || isArc(w) || !(FACE_PAINTS as readonly string[]).includes(w.front)) continue;
      const L = len(w);
      if (L < EPS) continue;
      const [ux, uy] = [(w.b[0] - w.a[0]) / L, (w.b[1] - w.a[1]) / L];
      // along the outline's segment: parallel and on its line
      if (Math.abs(ux * sy - uy * sx) > 1e-3) continue;
      const off = Math.abs((p[0] - w.a[0]) * -uy + (p[1] - w.a[1]) * ux);
      if (off > 0.2) continue;
      const ta = (p[0] - w.a[0]) * ux + (p[1] - w.a[1]) * uy;
      const tb = (q[0] - w.a[0]) * ux + (q[1] - w.a[1]) * uy;
      const from = Math.max(0, Math.min(ta, tb));
      const to = Math.min(L, Math.max(ta, tb));
      if (to - from < EPS) continue;
      // which face looks in: its front when the inside is on its front's side (as it's drawn)
      const [nx, ny] = frontNormal(w, f);
      const side: 1 | -1 = inward[0] * nx + inward[1] * ny > 0 ? 1 : -1;
      out.push({ id: w.id, side, from: r3(from), to: r3(to), mat });
    }
  }
  return out;
}
