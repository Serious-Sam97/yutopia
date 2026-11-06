// Roofs (docs/plan/72-the-3d-core.md, phase 11.7; the user's call 2026-11-05: pitched roofs now, with
// the flat ones): a roof over a closed set of walls — the face they close round — at the top of
// those walls. Flat: a lid on them. Gable: two slopes up to a ridge, the walls under its ends
// carried up as gables. Hip: slopes on every side up to a ridge (a square: a point). A gable needs
// the face to be a rectangle (any way turned); a hip over any other face that's convex rises to a
// point over its middle. The shapes here are the drawing's and Jolt's (a lid at the eaves: you don't
// fall in, and over it is out of doors).
import { WALL_H } from "../units.ts";
import type { StructOp } from "./ops.ts";
import { area2 } from "./rings.ts";
import { selfCrosses } from "./slab-edit.ts";
import type { Roof, Structure, XY } from "./types.ts";

export const ROOF_KINDS = ["flat", "gable", "hip"] as const;
export const ROOF_PITCHES = [20, 30, 45] as const;
export const ROOF_OVERHANG = 0.3; // past the walls (m), pitched roofs
export const ROOF_THICK = 0.2; // a flat roof's lid

export type XYZ = [number, number, number];
/** A face of a roof as drawn: its corners (world: x, y over the ground, z up) and what it is. */
export interface RoofFace {
  pts: XYZ[];
  part: "slope" | "gable" | "flat" | "edge";
}

/** The rectangle a face is (near enough: 97% of it), any way turned: its middle, half-sizes along
 *  its long side (`hu`) and across (`hv`), and the long side's heading; null when it isn't one. */
export function rectOf(outline: readonly XY[]): { c: XY; hu: number; hv: number; ang: number } | null {
  const area = Math.abs(area2([...outline])) / 2;
  let best: { c: XY; hu: number; hv: number; ang: number; a: number } | null = null;
  for (let i = 0; i < outline.length; i++) {
    const [p, q] = [outline[i], outline[(i + 1) % outline.length]];
    const ang = Math.atan2(q[1] - p[1], q[0] - p[0]);
    const [ux, uy, vx, vy] = [Math.cos(ang), Math.sin(ang), -Math.sin(ang), Math.cos(ang)];
    let [u0, u1, v0, v1] = [Infinity, -Infinity, Infinity, -Infinity];
    for (const [x, y] of outline) {
      const u = x * ux + y * uy;
      const v = x * vx + y * vy;
      u0 = Math.min(u0, u);
      u1 = Math.max(u1, u);
      v0 = Math.min(v0, v);
      v1 = Math.max(v1, v);
    }
    const a = (u1 - u0) * (v1 - v0);
    if (best && a >= best.a) continue;
    const [cu, cv] = [(u0 + u1) / 2, (v0 + v1) / 2];
    const c: XY = [cu * ux + cv * vx, cu * uy + cv * vy];
    const [hu, hv] = [(u1 - u0) / 2, (v1 - v0) / 2];
    best = hu >= hv ? { c, hu, hv, ang, a } : { c, hu: hv, hv: hu, ang: ang + Math.PI / 2, a };
  }
  if (!best || area / best.a < 0.97) return null;
  return { c: best.c, hu: best.hu, hv: best.hv, ang: best.ang };
}

const convex = (o: readonly XY[]): boolean => {
  let sign = 0;
  for (let i = 0; i < o.length; i++) {
    const [a, b, c] = [o[i], o[(i + 1) % o.length], o[(i + 2) % o.length]];
    const z = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
    if (Math.abs(z) < 1e-9) continue;
    if (sign && Math.sign(z) !== sign) return false;
    sign = Math.sign(z);
  }
  return true;
};

/** A roof as the tool asks for it. */
export interface RoofDraft {
  outline: XY[];
  kind: Roof["kind"];
  pitch?: number;
  ridge?: 0 | 1;
}

/** Why this roof can't go on floor `floor` (null: it can). */
export function roofWhy(s: Pick<Structure, "floors">, floor: number, d: RoofDraft): string | null {
  if (!s.floors.some((f) => f.index === floor)) return "no such floor";
  const o = d.outline;
  if (!Array.isArray(o) || o.length < 3 || o.length > 256) return "not a roof's shape";
  if (!o.every((p) => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]))) return "not a place";
  if (selfCrosses(o)) return "its edges cross";
  if (Math.abs(area2(o)) / 2 < 1) return "too small";
  if (!(ROOF_KINDS as readonly string[]).includes(d.kind)) return "not a roof";
  if (d.kind !== "flat") {
    const p = d.pitch ?? 30;
    if (!Number.isFinite(p) || p < 10 || p > 60) return "not a roof's pitch";
    if (d.kind === "gable" && !rectOf(o)) return "a gable needs a rectangle";
    if (d.kind === "hip" && !rectOf(o) && !convex(o)) return "a hip needs a rectangle or a convex room";
  }
  return null;
}

/** The roofs of floor `floor` with these added (their eaves at the top of the walls round them:
 *  the highest of the walls on their outline, else a storey's walls) and those taken away. */
export function roofsEdit(
  s: Structure,
  floor: number,
  add: readonly RoofDraft[],
  remove: readonly string[],
  newId: () => string,
): { op: StructOp; added: Roof[] } | { why: string } {
  const f = s.floors.find((q) => q.index === floor);
  if (!f) return { why: "no such floor" };
  if (!add.length && !remove.length) return { why: "nothing to change" };
  if (add.length + remove.length > 16) return { why: "too many at once" };
  const mine = (s.roofs ?? []).filter((r) => r.floor === floor);
  for (const id of remove) if (!mine.some((r) => r.id === id)) return { why: "no such roof" };
  const r3 = (v: number) => Math.round(v * 1000) / 1000;
  const added: Roof[] = [];
  for (const d of add) {
    const why = roofWhy(s, floor, d);
    if (why) return { why };
    const outline = d.outline.map(([x, y]): XY => [r3(x), r3(y)]);
    added.push({
      id: newId(),
      floor,
      outline,
      z: r3(eavesOf(s, floor, outline) ?? f.z + WALL_H),
      kind: d.kind,
      pitch: d.kind === "flat" ? 0 : Math.round(d.pitch ?? 30),
      ...(d.kind === "gable" && d.ridge === 1 ? { ridge: 1 as const } : {}),
    });
  }
  return { op: { op: "roofs", floor, roofs: [...mine.filter((r) => !remove.includes(r.id)), ...added] }, added };
}

/** The top of the walls on an outline (world: the highest), or null when none is on it. */
function eavesOf(s: Structure, floor: number, outline: readonly XY[]): number | null {
  const onEdge = (p: XY) =>
    outline.some((a, i) => {
      const b = outline[(i + 1) % outline.length];
      const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
      const L2 = dx * dx + dy * dy || 1;
      const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2));
      return Math.hypot(p[0] - (a[0] + dx * t), p[1] - (a[1] + dy * t)) < 0.05;
    });
  let top: number | null = null;
  for (const w of s.walls)
    if (w.floor === floor && onEdge(w.a) && onEdge(w.b)) top = Math.max(top ?? -Infinity, w.base + w.height);
  return top;
}

/** A roof's faces (world), as drawn. */
export function roofFaces(r: Roof): RoofFace[] {
  const z = r.z;
  if (r.kind === "flat") {
    const top = r.outline.map(([x, y]): XYZ => [x, y, z + ROOF_THICK]);
    const out: RoofFace[] = [{ pts: top, part: "flat" }];
    const n = r.outline.length;
    for (let i = 0; i < n; i++) {
      const [a, b] = [r.outline[i], r.outline[(i + 1) % n]];
      out.push({
        pts: [
          [a[0], a[1], z],
          [b[0], b[1], z],
          [b[0], b[1], z + ROOF_THICK],
          [a[0], a[1], z + ROOF_THICK],
        ],
        part: "edge",
      });
    }
    return out;
  }
  const t = Math.tan(((r.pitch || 30) * Math.PI) / 180);
  const rect = rectOf(r.outline);
  if (rect) {
    let { c, hu, hv, ang } = rect;
    if (r.kind === "gable" && r.ridge === 1) [hu, hv, ang] = [hv, hu, ang + Math.PI / 2];
    const [ux, uy, vx, vy] = [Math.cos(ang), Math.sin(ang), -Math.sin(ang), Math.cos(ang)];
    const at = (u: number, v: number, h: number): XYZ => [c[0] + ux * u + vx * v, c[1] + uy * u + vy * v, h];
    const o = ROOF_OVERHANG;
    const rise = hv * t; // the ridge over the walls' tops, at the middle
    const eave = z - o * t; // the eaves, past the walls
    if (r.kind === "gable") {
      const [U, V] = [hu + o, hv + o];
      return [
        { pts: [at(-U, -V, eave), at(U, -V, eave), at(U, 0, z + rise), at(-U, 0, z + rise)], part: "slope" },
        { pts: [at(-U, V, eave), at(-U, 0, z + rise), at(U, 0, z + rise), at(U, V, eave)], part: "slope" },
        // (the walls under its ends, carried up)
        { pts: [at(-hu, -hv, z), at(-hu, hv, z), at(-hu, 0, z + rise)], part: "gable" },
        { pts: [at(hu, hv, z), at(hu, -hv, z), at(hu, 0, z + rise)], part: "gable" },
      ];
    }
    // hip: a ridge along the long side, as long as it's longer than wide
    const [U, V] = [hu + o, hv + o];
    const ridge = Math.max(0, hu - hv);
    return [
      { pts: [at(-U, -V, eave), at(U, -V, eave), at(ridge, 0, z + rise), at(-ridge, 0, z + rise)], part: "slope" },
      { pts: [at(U, V, eave), at(-U, V, eave), at(-ridge, 0, z + rise), at(ridge, 0, z + rise)], part: "slope" },
      { pts: [at(U, -V, eave), at(U, V, eave), at(ridge, 0, z + rise)], part: "slope" },
      { pts: [at(-U, V, eave), at(-U, -V, eave), at(-ridge, 0, z + rise)], part: "slope" },
    ];
  }
  // a convex room's hip: every side up to a point over its middle, as high as its nearest side lets
  const n = r.outline.length;
  const c: XY = [r.outline.reduce((s, p) => s + p[0], 0) / n, r.outline.reduce((s, p) => s + p[1], 0) / n];
  let inner = Infinity;
  for (let i = 0; i < n; i++) {
    const [a, b] = [r.outline[i], r.outline[(i + 1) % n]];
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    inner = Math.min(inner, Math.abs((c[0] - a[0]) * (b[1] - a[1]) - (c[1] - a[1]) * (b[0] - a[0])) / L);
  }
  const apex: XYZ = [c[0], c[1], z + inner * t];
  return r.outline.map((a, i) => {
    const b = r.outline[(i + 1) % n];
    return { pts: [[a[0], a[1], z], [b[0], b[1], z], apex], part: "slope" as const };
  });
}

/** The roof (if any) of floor `floor` whose outline holds a point. */
export function roofAt(s: Pick<Structure, "roofs">, floor: number, p: XY): Roof | null {
  const inR = (r: readonly XY[]) => {
    let k = false;
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      const [xi, yi] = r[i];
      const [xj, yj] = r[j];
      if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) k = !k;
    }
    return k;
  };
  return (s.roofs ?? []).filter((r) => r.floor === floor && inR(r.outline)).at(-1) ?? null;
}
