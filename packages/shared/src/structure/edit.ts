// Walls drawn free (docs/plan/72-the-3d-core.md, phase 11): what the build tool asks for — a wall from
// one point to another on a floor, its material, its height — checked the same in the browser (the
// ghost's green or red) and on the server (what it takes), and turned into the structure's operation.
import { WALL_H, WALL_T } from "../units.ts";
import { isArc, wallPoints } from "./arc.ts";
import type { StructOp } from "./ops.ts";
import { workingHeights } from "./slab-edit.ts";
import type { Structure, Wall, XY } from "./types.ts";

/** What a wall can be made of (Wall.front): plaster, walnut, foam, brick, cork, glass; "h" a half
 *  wall. */
export const WALL_MATERIALS = ["p", "w", "f", "b", "k", "g", "h"] as const;
/** The heights a wall is drawn at (m): up to the ceiling, a rail, low. */
export const WALL_HEIGHTS = { ceiling: WALL_H, rail: 1.1, low: 0.6 } as const;
/** The heights a wall can be (m): from a low one to the ceiling. */
export const WALL_LOWEST = 0.5;
/** How thick a wall can be (m; the user's call, 2026-11-05: three): a partition, the usual, an outer. */
export const WALL_THICKS = [0.1, 0.2, 0.3] as const;

export const WALL_MIN = 0.25; // shorter than this is a slip of the hand, not a wall (m)
export const WALL_MAX = 120;
export const WALLS_AT_ONCE = 64; // the most one edit puts in or takes away

/** A wall as the tool draws it (world metres): its ends, what it's made of, how high. */
export interface WallDraft {
  a: XY;
  b: XY;
  front: string;
  height?: number;
  /** an arc: how far its middle stands off the line a–b, to its left (arc.ts) */
  bow?: number;
  /** how thick (m; WALL_THICKS; none: WALL_T) */
  thick?: number;
  /** stood on a mezzanine: its height over the floor (m; phase 11.7; none: on the floor) */
  over?: number;
}

/** A change to a wall that's there (phase 11.4): its height, its thickness. */
export interface WallSet {
  id: string;
  height?: number;
  thick?: number;
  /** a face painted (phase 11.11): its front's material (its left, a to b), its back's */
  front?: string;
  back?: string;
}
/** What a wall's face can be painted (Paint's swatches: plaster, walnut, foam, brick, cork). */
export const FACE_PAINTS = ["p", "w", "f", "b", "k"] as const;

const heightWhy = (h: number): string | null =>
  !Number.isFinite(h) || h < WALL_LOWEST - 1e-6 || h > WALL_H + 1e-6 ? "not a wall's height" : null;
const thickWhy = (t: number | undefined): string | null =>
  t === undefined || WALL_THICKS.some((q) => Math.abs(q - t) < 1e-6) ? null : "not a wall's thickness";

const near = (p: XY, q: XY) => Math.hypot(p[0] - q[0], p[1] - q[1]) < 0.01;
const finite = (p: unknown): p is XY =>
  Array.isArray(p) && p.length === 2 && Number.isFinite(p[0]) && Number.isFinite(p[1]);

/** Why this wall can't go on floor `floor` (null: it can) — on the floor's ground, long enough, of a
 *  material there is, as high as a storey at most. */
export function wallWhy(s: Structure, floor: number, d: WallDraft): string | null {
  const f = s.floors.find((q) => q.index === floor);
  if (!f) return "no such floor";
  if (!finite(d.a) || !finite(d.b)) return "not a place";
  const len = Math.hypot(d.b[0] - d.a[0], d.b[1] - d.a[1]);
  if (len < WALL_MIN) return "too short";
  if (len > WALL_MAX) return "too long";
  if (d.bow !== undefined && (!Number.isFinite(d.bow) || Math.abs(d.bow) > len / 2 + 1e-3)) return "bows too far";
  if (!(WALL_MATERIALS as readonly string[]).includes(d.front)) return "not a wall's material";
  const hw = heightWhy(d.height ?? WALL_H) ?? thickWhy(d.thick);
  if (hw) return hw;
  // (on a mezzanine of this floor, its top under the ceiling)
  const over = d.over ?? 0;
  if (over !== 0) {
    if (!workingHeights(s, floor).some((q) => Math.abs(q - over) < 1e-3)) return "no floor up there";
    if (over + (d.height ?? WALL_H) > WALL_H + 1e-3) return "too high up there";
  }
  // (on the floor's ground: its grid — the building's footprint — a little past it for its outer walls)
  const { x0, y0, w, h: gh } = f.grid;
  const inside = (p: XY) => p[0] >= x0 - 0.01 && p[1] >= y0 - 0.01 && p[0] <= x0 + w + 0.01 && p[1] <= y0 + gh + 0.01;
  if (!wallPoints(d).every(inside)) return "off the floor";
  return null;
}

/** The parts of the line a–b no wall in `walls` stands along already (on its line, overlapping it):
 *  a wall drawn over one that's there goes in only where there's none (bits under 2 cm dropped). */
export function uncovered(walls: readonly Wall[], a: XY, b: XY): [XY, XY][] {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const L = Math.hypot(dx, dy);
  if (L < 1e-9) return [];
  const [ux, uy] = [dx / L, dy / L];
  const off = (p: XY) => (p[0] - a[0]) * -uy + (p[1] - a[1]) * ux;
  const along = (p: XY) => (p[0] - a[0]) * ux + (p[1] - a[1]) * uy;
  const cuts: [number, number][] = [];
  for (const w of walls) {
    if (isArc(w) || Math.abs(off(w.a)) > 0.01 || Math.abs(off(w.b)) > 0.01) continue;
    const [t0, t1] = [along(w.a), along(w.b)];
    cuts.push([Math.min(t0, t1), Math.max(t0, t1)]);
  }
  cuts.sort((p, q) => p[0] - q[0]);
  const at = (t: number): XY => [a[0] + ux * t, a[1] + uy * t];
  const out: [XY, XY][] = [];
  let t = 0;
  for (const [c0, c1] of cuts) {
    if (c1 <= t) continue;
    if (c0 >= L) break;
    if (c0 - t >= 0.02) out.push([at(t), at(c0)]);
    t = Math.max(t, c1);
  }
  if (L - t >= 0.02) out.push([t === 0 ? a : at(t), b]);
  return out;
}

/** The operation that puts these walls on floor `floor` and takes those ids away (each new one given
 *  an id by `newId`), or why not: the first wall that can't, or an id that isn't a wall of that floor. */
export function wallsEdit(
  s: Structure,
  floor: number,
  add: readonly WallDraft[],
  remove: readonly string[],
  newId: () => string,
): { op: StructOp; added: Wall[] } | { why: string } {
  if (add.length + remove.length > WALLS_AT_ONCE) return { why: "too many at once" };
  const f = s.floors.find((q) => q.index === floor);
  if (!f) return { why: "no such floor" };
  for (const id of remove) if (!s.walls.some((w) => w.id === id && w.floor === floor)) return { why: "no such wall" };
  const added: Wall[] = [];
  // (what stands once those go: a wall drawn over one goes in only where there's none)
  const standing = s.walls.filter((w) => w.floor === floor && !remove.includes(w.id));
  const r = (v: number) => Math.round(v * 1000) / 1000;
  for (const d of add) {
    const why = wallWhy(s, floor, d);
    if (why) return { why };
    // (an arc: in whole, unless the same arc stands there)
    const bow =
      d.bow && Math.abs(d.bow) > 1e-3
        ? Math.min(Math.abs(d.bow), Math.hypot(d.b[0] - d.a[0], d.b[1] - d.a[1]) / 2) * Math.sign(d.bow)
        : 0;
    const same = (w: Wall) =>
      isArc(w) &&
      ((near(w.a, d.a) && near(w.b, d.b) && Math.abs((w.bow ?? 0) - bow) < 0.01) ||
        (near(w.a, d.b) && near(w.b, d.a) && Math.abs((w.bow ?? 0) + bow) < 0.01));
    const parts: [XY, XY][] = bow ? (standing.some(same) ? [] : [[d.a, d.b]]) : uncovered(standing, d.a, d.b);
    for (const [a, b] of parts) {
      const w: Wall = {
        id: newId(),
        floor,
        a: [r(a[0]), r(a[1])],
        b: [r(b[0]), r(b[1])],
        base: r(f.z + (d.over ?? 0)),
        height: r(d.height ?? WALL_H),
        front: d.front,
        ...(bow ? { bow: r(bow) } : {}),
        ...(d.thick !== undefined && Math.abs(d.thick - WALL_T) > 1e-6 ? { thick: d.thick } : {}),
      };
      added.push(w);
      standing.push(w);
    }
  }
  if (!added.length && !remove.length) return { why: "there already" };
  return { op: { op: "walls", remove: [...remove], add: added }, added };
}

/** The operation that changes walls that are there (their height, their thickness; each keeps its
 *  id, so what hangs on it stays), or why not. */
export function wallsSet(s: Structure, floor: number, set: readonly WallSet[]): { op: StructOp } | { why: string } {
  if (!set.length) return { why: "nothing to change" };
  if (set.length > WALLS_AT_ONCE) return { why: "too many at once" };
  const r = (v: number) => Math.round(v * 1000) / 1000;
  const remove: string[] = [];
  const add: Wall[] = [];
  for (const c of set) {
    const w = s.walls.find((q) => q.id === c.id && q.floor === floor);
    if (!w || remove.includes(w.id)) return { why: "no such wall" };
    const height = c.height === undefined ? w.height : r(c.height);
    const why = heightWhy(height) ?? thickWhy(c.thick);
    if (why) return { why };
    // (a face painted: glass and half walls have no sides to; painting one face keeps the other's)
    const paint = (m: string | undefined) => m === undefined || (FACE_PAINTS as readonly string[]).includes(m);
    if (!paint(c.front) || !paint(c.back)) return { why: "not a wall's paint" };
    if ((c.front !== undefined || c.back !== undefined) && !(FACE_PAINTS as readonly string[]).includes(w.front))
      return { why: "no sides to paint" };
    const front = c.front ?? w.front;
    const back = c.back ?? w.back ?? w.front;
    const { thick: _t, back: _b, ...rest } = w;
    const thick = c.thick === undefined ? w.thick : c.thick;
    const next: Wall = {
      ...rest,
      front,
      height,
      ...(thick !== undefined && Math.abs(thick - WALL_T) > 1e-6 ? { thick } : {}),
      ...(back !== front ? { back } : {}),
    };
    const same =
      next.height === w.height &&
      (next.thick ?? WALL_T) === (w.thick ?? WALL_T) &&
      next.front === w.front &&
      (next.back ?? next.front) === (w.back ?? w.front);
    if (same) continue;
    remove.push(w.id);
    add.push(next);
  }
  if (!add.length) return { why: "as it is" };
  return { op: { op: "walls", remove, add } };
}
