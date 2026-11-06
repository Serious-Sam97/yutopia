// Rooms found from the walls (docs/plan/72-the-3d-core.md, phase 6): a floor's walls as a planar
// graph — split where they cross or one ends on another — and its enclosed faces, each a polygon
// a room can be. Any segments, at any angle (phase 11's free walls), not only the tile tool's.
//
// The faces are walked with the region on the walker's left, y down (rings.ts's outlines: a
// negative shoelace sum); a face with walls standing inside it (a wall poking in, a pillar's
// box) keeps them as holes only when they close round something.
import { chordsOf } from "./arc.ts";
import { area2, inRing } from "./rings.ts";
import type { Ring, Room, Structure, Wall, XY } from "./types.ts";

const EPS = 1e-6;
const key = (p: XY) => `${Math.round(p[0] * 1e4)},${Math.round(p[1] * 1e4)}`;

/** Where a crosses b (as fractions along each), or null; touching counts. */
function cross(a0: XY, a1: XY, b0: XY, b1: XY): [number, number] | null {
  const dax = a1[0] - a0[0];
  const day = a1[1] - a0[1];
  const dbx = b1[0] - b0[0];
  const dby = b1[1] - b0[1];
  const den = dax * dby - day * dbx;
  if (Math.abs(den) < EPS) return null; // (parallel: overlaps are split at their ends below)
  const ex = b0[0] - a0[0];
  const ey = b0[1] - a0[1];
  const t = (ex * dby - ey * dbx) / den;
  const u = (ex * day - ey * dax) / den;
  if (t < -EPS || t > 1 + EPS || u < -EPS || u > 1 + EPS) return null;
  return [Math.min(1, Math.max(0, t)), Math.min(1, Math.max(0, u))];
}

/** Where p lies along a→b (a fraction), when it's on the segment. */
function along(a: XY, b: XY, p: XY): number | null {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  if (len2 < EPS) return null;
  const t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2;
  if (t < -EPS || t > 1 + EPS) return null;
  const qx = a[0] + dx * t - p[0];
  const qy = a[1] + dy * t - p[1];
  return qx * qx + qy * qy < 1e-8 ? t : null;
}

/** The enclosed faces of these segments: each an outline (region on the walker's left) and the
 *  rings of walls closed round something inside it. */
export function wallFaces(segs: readonly { a: XY; b: XY }[]): { outline: Ring; holes: Ring[] }[] {
  // split every segment where another crosses it or ends on it
  const pieces: [XY, XY][] = [];
  for (let i = 0; i < segs.length; i++) {
    const { a, b } = segs[i];
    const ts = [0, 1];
    for (let j = 0; j < segs.length; j++) {
      if (i === j) continue;
      const s = segs[j];
      const c = cross(a, b, s.a, s.b);
      if (c) ts.push(c[0]);
      for (const p of [s.a, s.b]) {
        const t = along(a, b, p);
        if (t !== null) ts.push(t);
      }
    }
    ts.sort((x, y) => x - y);
    for (let k = 1; k < ts.length; k++) {
      if (ts[k] - ts[k - 1] < EPS) continue;
      const p = (t: number): XY => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
      pieces.push([p(ts[k - 1]), p(ts[k])]);
    }
  }
  // the graph: each point's ways out, by angle
  const pts = new Map<string, XY>();
  const out = new Map<string, string[]>();
  const link = (p: XY, q: XY) => {
    const kp = key(p);
    const kq = key(q);
    if (kp === kq) return;
    pts.set(kp, p);
    pts.set(kq, q);
    const l = out.get(kp) ?? [];
    if (!l.includes(kq)) l.push(kq);
    out.set(kp, l);
  };
  for (const [p, q] of pieces) {
    link(p, q);
    link(q, p);
  }
  const ang = (from: string, to: string) => {
    const a = pts.get(from) as XY;
    const b = pts.get(to) as XY;
    return Math.atan2(b[1] - a[1], b[0] - a[0]);
  };
  // walls that end in the open (a wall poking into a room) bound nothing: pruned, end by end
  for (let pruned = true; pruned; ) {
    pruned = false;
    for (const [k, l] of out)
      if (l.length < 2) {
        for (const n of l) {
          const back = out.get(n) as string[];
          back.splice(back.indexOf(k), 1);
        }
        out.delete(k);
        pruned = true;
      }
  }
  for (const [k, l] of out) l.sort((x, y) => ang(k, x) - ang(k, y));
  // walk each half-edge once: at each point, the next way round from the one you came in by
  // (the faces come out with their region on one side; the bounded ones kept, the outer dropped)
  const seen = new Set<string>();
  const rings: Ring[] = [];
  for (const [k0, l0] of out)
    for (const n0 of l0) {
      if (seen.has(`${k0}>${n0}`)) continue;
      const ring: XY[] = [];
      let from = k0;
      let to = n0;
      let guard = 0;
      while (!seen.has(`${from}>${to}`) && guard++ < 100000) {
        seen.add(`${from}>${to}`);
        ring.push(pts.get(from) as XY);
        const l = out.get(to) as string[];
        const i = l.indexOf(from);
        // the way just after the one back, by angle (y down: the region on the walker's left)
        const next = l[(i + 1) % l.length];
        from = to;
        to = next;
      }
      const r = simplify(ring);
      if (r.length >= 3 && area2(r) < -EPS) rings.push(r);
    }
  // a ring inside another: the other's hole (only the nearest one holds it)
  const faces = rings.map((r) => ({ outline: r, holes: [] as Ring[], a: Math.abs(area2(r)) }));
  faces.sort((x, y) => x.a - y.a);
  const outer = (r: Ring) => r.map((p) => p);
  for (let i = 0; i < faces.length; i++) {
    const f = faces[i];
    const [px, py] = inside(f.outline);
    const host = faces.slice(i + 1).find((g) => inRing(g.outline, px, py));
    if (host) host.holes.push(outer(f.outline).reverse());
  }
  return faces.map(({ outline, holes }) => ({ outline, holes }));
}

/** Collinear corners and repeated points dropped (a straight wall split at a T is one side). */
function simplify(r: XY[]): Ring {
  let pts = r;
  for (let changed = true; changed && pts.length > 2; ) {
    changed = false;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[(i - 1 + pts.length) % pts.length];
      const b = pts[i];
      const c = pts[(i + 1) % pts.length];
      const cr = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
      const back = (b[0] - a[0]) * (c[0] - b[0]) + (b[1] - a[1]) * (c[1] - b[1]) < 0;
      if (Math.abs(cr) < EPS && !back) {
        pts = [...pts.slice(0, i), ...pts.slice(i + 1)];
        changed = true;
        break;
      }
    }
  }
  return pts;
}

/** A point just inside a ring (its region on the walker's left). */
function inside(r: Ring): XY {
  for (let i = 0; i < r.length; i++) {
    const a = r[i];
    const b = r[(i + 1) % r.length];
    const mx = (a[0] + b[0]) / 2;
    const my = (a[1] + b[1]) / 2;
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    // left of a→b, y down: (dy, -dx)
    const p: XY = [mx + ((b[1] - a[1]) / len) * 1e-3, my - ((b[0] - a[0]) / len) * 1e-3];
    if (inRing(r, p[0], p[1])) return p;
  }
  return r[0];
}

/** A doorway: the widest gap between two walls in line that still closes a room (an open door's
 *  way through — wider is an open side, the room not closed there). */
export const DOORWAY = 2;

/** The gaps between walls in line no wider than a doorway, each as a segment across it (what
 *  closes a room at its open doors, as a plan's room-separation line does). */
export function doorways(walls: readonly { a: XY; b: XY }[]): { a: XY; b: XY }[] {
  const out: { a: XY; b: XY }[] = [];
  const lines = new Map<string, { u: [number, number, number]; spans: [number, number][] }>();
  for (const w of walls) {
    const dx = w.b[0] - w.a[0];
    const dy = w.b[1] - w.a[1];
    const len = Math.hypot(dx, dy);
    if (len < EPS) continue;
    // a line by its direction (either way) and its distance from the origin
    let ux = dx / len;
    let uy = dy / len;
    if (ux < -EPS || (Math.abs(ux) < EPS && uy < 0)) [ux, uy] = [-ux, -uy];
    const d = w.a[0] * -uy + w.a[1] * ux;
    const k = `${Math.round(ux * 1e4)},${Math.round(uy * 1e4)},${Math.round(d * 1e4)}`;
    const t0 = w.a[0] * ux + w.a[1] * uy;
    const t1 = w.b[0] * ux + w.b[1] * uy;
    const line = lines.get(k) ?? { u: [ux, uy, d], spans: [] };
    line.spans.push([Math.min(t0, t1), Math.max(t0, t1)]);
    lines.set(k, line);
  }
  for (const { u, spans: l } of lines.values()) {
    const [ux, uy, d] = u;
    l.sort((p, q) => p[0] - q[0]);
    let end = l[0][1];
    for (let i = 1; i < l.length; i++) {
      const [s, e] = l[i];
      const gap = s - end;
      if (gap > EPS && gap <= DOORWAY + EPS) {
        const at = (t: number): XY => [ux * t - uy * d, uy * t + ux * d];
        out.push({ a: at(end), b: at(s) });
      }
      end = Math.max(end, e);
    }
  }
  return out;
}

/** The faces a floor's walls enclose (every wall, half walls and glass too: a room is what they
 *  close round), closed across their doorways. */
export function floorFaces(s: Pick<Structure, "walls">, floor: number) {
  // (an arc as its chords)
  const walls = s.walls.filter((w: Wall) => w.floor === floor).flatMap(chordsOf);
  return wallFaces([...walls, ...doorways(walls)]);
}

/** A room's outline from the walls round it: the face its rectangle lies in, when the walls close
 *  round it and no other room's middle is in there too; else the rectangle. */
export function roomOutline(
  rect: [number, number, number, number],
  faces: { outline: Ring; holes: Ring[] }[],
  others: [number, number, number, number][],
): Ring {
  const [x0, y0, x1, y1] = rect;
  const box: Ring = [
    [x0, y0],
    [x0, y1],
    [x1, y1],
    [x1, y0],
  ];
  const mid = (r: [number, number, number, number]): XY => [(r[0] + r[2]) / 2, (r[1] + r[3]) / 2];
  const m = mid(rect);
  const inFace = (f: { outline: Ring; holes: Ring[] }, x: number, y: number) =>
    inRing(f.outline, x, y) && !f.holes.some((h) => inRing(h, x, y));
  // the smallest face holding the rectangle's middle
  const face = faces
    .filter((f) => inFace(f, m[0], m[1]))
    .sort((a, b) => Math.abs(area2(a.outline)) - Math.abs(area2(b.outline)))[0];
  if (!face || face.holes.length) return box;
  // every cell of the rectangle in it (its walls don't cut through the room)
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) if (!inFace(face, x + 0.5, y + 0.5)) return box;
  // no other room in the same face
  if (others.some((o) => o !== rect && inFace(face, ...mid(o)))) return box;
  return face.outline;
}

/** The rooms a structure's rectangles stand for, each given the outline its walls make. */
export function roomsFromWalls(s: Pick<Structure, "walls">, rooms: Room[]): Room[] {
  const byFloor = new Map<number, ReturnType<typeof floorFaces>>();
  const rects = rooms.map((r) => r.rect);
  return rooms.map((r) => {
    let faces = byFloor.get(r.floor);
    if (!faces) {
      faces = floorFaces(s, r.floor);
      byFloor.set(r.floor, faces);
    }
    const same = rects.filter((q, i) => rooms[i].floor === r.floor && q !== r.rect);
    return { ...r, outline: roomOutline(r.rect, faces, same) };
  });
}
