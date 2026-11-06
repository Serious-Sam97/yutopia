// Floors drawn free (docs/plan/72-the-3d-core.md, phase 11.7; the mocks' 07–08): a slab is a polygon
// of one material at a height — its floor's (what you walk on) or one of its own between that floor
// and the next (a mezzanine: it belongs to the floor under it, and walls drawn on it stand on it).
// Slabs may overlap: a floor is the union of its slabs (each its outline less its own holes), the
// last drawn on top where their materials differ. Checked the same in the browser and on the server,
// and turned into the structure's operation (a floor's slabs whole: `slabs`).
import { isFloor } from "../map.ts";
import { STOREY } from "../units.ts";
import type { StructOp } from "./ops.ts";
import { area2 } from "./rings.ts";
import type { Ring, Slab, Structure, XY } from "./types.ts";

export const SLAB_MIN_AREA = 0.25; // m²: less is a slip of the hand
export const SLAB_MAX_POINTS = 256;
export const SLABS_AT_ONCE = 32;
/** A mezzanine's height over its floor (m): room to stand under it and over it. */
export const DECK_LOW = 1.0;
export const DECK_HIGH = STOREY - 1.0;

/** A floor as the tool draws it: its outline (world), its material, and how far over its floor's own
 *  height it is (0, or a mezzanine's). */
export interface SlabDraft {
  outline: XY[];
  /** rings left out of it (a room's face filled: the rooms inside it) */
  holes?: XY[][];
  top: string;
  over?: number;
}

// do segments p1–p2 and q1–q2 cross (not at a shared end)?
function cross(p1: XY, p2: XY, q1: XY, q2: XY): boolean {
  const d = (a: XY, b: XY, c: XY) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const d1 = d(q1, q2, p1);
  const d2 = d(q1, q2, p2);
  const d3 = d(p1, p2, q1);
  const d4 = d(p1, p2, q2);
  return (
    ((d1 > 1e-9 && d2 < -1e-9) || (d1 < -1e-9 && d2 > 1e-9)) && ((d3 > 1e-9 && d4 < -1e-9) || (d3 < -1e-9 && d4 > 1e-9))
  );
}

/** Whether a ring's edges cross each other (it isn't a simple polygon). */
export function selfCrosses(r: Ring): boolean {
  const n = r.length;
  for (let i = 0; i < n; i++)
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue;
      if (cross(r[i], r[(i + 1) % n], r[j], r[(j + 1) % n])) return true;
    }
  return false;
}

/** Why this floor can't go on floor `floor` (null: it can). */
export function slabWhy(s: Structure, floor: number, d: SlabDraft): string | null {
  const f = s.floors.find((q) => q.index === floor);
  if (!f) return "no such floor";
  const o = d.outline;
  if (!Array.isArray(o) || o.length < 3 || o.length > SLAB_MAX_POINTS) return "not a floor's shape";
  if (!o.every((p) => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]))) return "not a place";
  if (selfCrosses(o)) return "its edges cross";
  if (Math.abs(area2(o)) / 2 < SLAB_MIN_AREA) return "too small";
  if (!isFloor(d.top)) return "not a floor's material";
  const over = d.over ?? 0;
  if (!Number.isFinite(over) || (over !== 0 && (over < DECK_LOW - 1e-6 || over > DECK_HIGH + 1e-6)))
    return "not a floor's height";
  const { x0, y0, w, h } = f.grid;
  const inside = (p: XY) => p[0] >= x0 - 0.01 && p[1] >= y0 - 0.01 && p[0] <= x0 + w + 0.01 && p[1] <= y0 + h + 0.01;
  if (!o.every(inside)) return "off the floor";
  for (const h of d.holes ?? [])
    if (
      !Array.isArray(h) ||
      h.length < 3 ||
      !h.every((p) => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]))
    )
      return "not a floor's shape";
  return null;
}

/** The operation that puts these floors on floor `floor` and takes those slabs away (each new one
 *  an id from `newId`), or why not. */
export function slabsEdit(
  s: Structure,
  floor: number,
  add: readonly SlabDraft[],
  remove: readonly string[],
  newId: () => string,
): { op: StructOp; added: Slab[] } | { why: string } {
  if (add.length + remove.length > SLABS_AT_ONCE) return { why: "too many at once" };
  if (!add.length && !remove.length) return { why: "nothing to change" };
  const f = s.floors.find((q) => q.index === floor);
  if (!f) return { why: "no such floor" };
  const mine = s.slabs.filter((x) => x.floor === floor);
  for (const id of remove) if (!mine.some((x) => x.id === id)) return { why: "no such floor there" };
  const r = (v: number) => Math.round(v * 1000) / 1000;
  const added: Slab[] = [];
  for (const d of add) {
    const why = slabWhy(s, floor, d);
    if (why) return { why };
    // (wound one way, as the traced ones are: rings.ts reads either)
    const outline = d.outline.map(([x, y]): XY => [r(x), r(y)]);
    const holes = (d.holes ?? []).slice(0, 64).map((h) => h.map(([x, y]): XY => [r(x), r(y)]));
    added.push({ id: newId(), floor, z: r(f.z + (d.over ?? 0)), top: d.top, outline, holes });
  }
  return { op: { op: "slabs", floor, slabs: [...mine.filter((x) => !remove.includes(x.id)), ...added] }, added };
}

/** A mezzanine: a slab over its floor's own height. */
export const isDeck = (s: Pick<Structure, "floors">, slab: Slab): boolean => {
  const f = s.floors.find((q) => q.index === slab.floor);
  return !!f && Math.abs(slab.z - f.z) > 1e-3;
};

/** The heights a floor's things can be drawn at: the floor's own (0) and its mezzanines' (m over it),
 *  low to high. */
export function workingHeights(s: Pick<Structure, "floors" | "slabs">, floor: number): number[] {
  const f = s.floors.find((q) => q.index === floor);
  if (!f) return [0];
  const out = new Set<number>([0]);
  for (const x of s.slabs)
    if (x.floor === floor && Math.abs(x.z - f.z) > 1e-3) out.add(Math.round((x.z - f.z) * 1000) / 1000);
  return [...out].sort((a, b) => a - b);
}

/** Why a lift's stop can't stand `over` m up floor `floor` (null: it can) — plan 72 phase 11: lifts
 *  stopping at mezzanines: all of its footprint ([x0, y0, x1, y1]) on one at that height. */
export function stopOnDeckWhy(
  s: Pick<Structure, "floors" | "slabs">,
  floor: number,
  r: [number, number, number, number],
  over: number,
): string | null {
  if (!(over > 0)) return null;
  const d = 0.05;
  const corners: XY[] = [
    [r[0] + d, r[1] + d],
    [r[2] - d, r[1] + d],
    [r[2] - d, r[3] - d],
    [r[0] + d, r[3] - d],
  ];
  return corners.every((p) => slabAt(s, floor, p, over)) ? null : "not all of it on the mezzanine";
}

/** The slab at a point at a height over floor `floor` (the last drawn on top), if any. */
export function slabAt(s: Pick<Structure, "floors" | "slabs">, floor: number, p: XY, over = 0): Slab | null {
  const f = s.floors.find((q) => q.index === floor);
  if (!f) return null;
  const inR = (r: Ring) => {
    let n = false;
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      const [xi, yi] = r[i];
      const [xj, yj] = r[j];
      if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) n = !n;
    }
    return n;
  };
  const here = s.slabs.filter(
    (x) => x.floor === floor && Math.abs(x.z - (f.z + over)) < 1e-3 && inR(x.outline) && !x.holes.some(inR),
  );
  return here.at(-1) ?? null;
}
