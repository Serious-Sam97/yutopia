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

export const ROOF_KINDS = [
  "flat",
  "gable",
  "hip",
  "shed",
  "halfhip",
  "mansard",
  "gambrel",
  "dutch",
  "round",
  "dormer",
  "chimney",
] as const;
/** (plan 130 phase 7) What a roof's slopes are covered with: each a tint of the slates (the client's library). */
export const ROOF_MATS: Record<string, number> = {
  slate: 0xffffff,
  clay: 0xd27a55,
  cedar: 0xb8865a,
  moss: 0x8aa877,
  metal: 0xb7c4d1,
  thatch: 0xe0c07a,
  tar: 0x6a6a6a,
  copper: 0x7fb5a1,
  // (plan 130 phase 9: the twelve)
  blue: 0x8fa3bd,
  red: 0xb2574a,
  black: 0x4a4a4e,
  sand: 0xe2c79a,
};
/** The kinds that need a rectangle (any way turned). */
const RECT_ONLY = new Set(["gable", "shed", "halfhip", "mansard", "gambrel", "dutch", "round", "dormer", "chimney"]);
export const ROOF_PITCHES = [20, 30, 45] as const;
export const ROOF_OVERHANG = 0.3; // past the walls (m), pitched roofs
export const ROOF_THICK = 0.2; // a flat roof's lid

export type XYZ = [number, number, number];
/** A face of a roof as drawn: its corners (world: x, y over the ground, z up) and what it is. */
export interface RoofFace {
  pts: XYZ[];
  part: "slope" | "gable" | "flat" | "edge" | "glass" | "chimney";
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
  /** (plan 130) its overhang, its covering, its eaves' height (none: the walls' top), a chimney's top */
  over?: number;
  mat?: string;
  z?: number;
  top?: number;
}

/** Why this roof can't go on floor `floor` (null: it can). */
export function roofWhy(s: Pick<Structure, "floors">, floor: number, d: RoofDraft): string | null {
  if (!s.floors.some((f) => f.index === floor)) return "no such floor";
  const o = d.outline;
  if (!Array.isArray(o) || o.length < 3 || o.length > 256) return "not a roof's shape";
  if (!o.every((p) => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]))) return "not a place";
  if (selfCrosses(o)) return "its edges cross";
  if (Math.abs(area2(o)) / 2 < (d.kind === "chimney" ? 0.2 : 1)) return "too small";
  if (!(ROOF_KINDS as readonly string[]).includes(d.kind)) return "not a roof";
  if (d.kind !== "flat") {
    const p = d.pitch ?? 30;
    if (!Number.isFinite(p) || p < 10 || p > 60) return "not a roof's pitch";
    if (RECT_ONLY.has(d.kind) && !rectOf(o)) return `a ${d.kind === "halfhip" ? "half-hip" : d.kind} needs a rectangle`;
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
      z: r3(d.z !== undefined && Number.isFinite(d.z) ? d.z : (eavesOf(s, floor, outline) ?? f.z + WALL_H)),
      kind: d.kind,
      pitch: d.kind === "flat" || d.kind === "chimney" ? 0 : Math.round(d.pitch ?? 30),
      ...(d.ridge === 1 && d.kind !== "hip" ? { ridge: 1 as const } : {}),
      ...(d.over !== undefined && Number.isFinite(d.over) ? { over: Math.max(0, Math.min(1.5, r3(d.over))) } : {}),
      ...(d.mat && d.mat in ROOF_MATS ? { mat: d.mat } : {}),
      ...(d.top !== undefined && Number.isFinite(d.top) ? { top: r3(d.top) } : {}),
    });
  }
  return {
    op: { op: "roofs", floor, roofs: reseat([...mine.filter((r) => !remove.includes(r.id)), ...added]) },
    added,
  };
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
    if (r.kind === "dormer") [c, hu, hv, ang] = frontFrame(r.outline, c);
    else if (r.kind !== "hip" && r.ridge === 1) [hu, hv, ang] = [hv, hu, ang + Math.PI / 2];
    const [ux, uy, vx, vy] = [Math.cos(ang), Math.sin(ang), -Math.sin(ang), Math.cos(ang)];
    const at = (u: number, v: number, h: number): XYZ => [c[0] + ux * u + vx * v, c[1] + uy * u + vy * v, h];
    const o = r.over ?? ROOF_OVERHANG;
    // (plan 130 phase 7: the other kinds, each in this frame — u along the long side, v across)
    const more = moreFaces(r.kind, z, t, hu, hv, o, at, r.top);
    if (more) return more;
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

/** (plan 130 phase 7) The new kinds' faces over a rectangle: u along its long side, v across; `at` into the world. */
function moreFaces(
  kind: Roof["kind"],
  z: number,
  t: number,
  hu: number,
  hv: number,
  o: number,
  at: (u: number, v: number, h: number) => XYZ,
  top?: number,
): RoofFace[] | null {
  const eave = z - o * t;
  const [U, V] = [hu + o, hv + o];
  const box = (
    u0: number,
    u1: number,
    v0: number,
    v1: number,
    z0: number,
    z1: number,
    part: RoofFace["part"],
  ): RoofFace[] => [
    { pts: [at(u0, v0, z0), at(u1, v0, z0), at(u1, v0, z1), at(u0, v0, z1)], part },
    { pts: [at(u1, v1, z0), at(u0, v1, z0), at(u0, v1, z1), at(u1, v1, z1)], part },
    { pts: [at(u0, v1, z0), at(u0, v0, z0), at(u0, v0, z1), at(u0, v1, z1)], part },
    { pts: [at(u1, v0, z0), at(u1, v1, z0), at(u1, v1, z1), at(u1, v0, z1)], part },
    { pts: [at(u0, v0, z1), at(u1, v0, z1), at(u1, v1, z1), at(u0, v1, z1)], part },
  ];
  if (kind === "shed") {
    // one slope across: low at −v, high at +v; the high side's wall and the two ends carried up
    const hi = z + 2 * hv * t;
    return [
      { pts: [at(-U, -V, eave), at(U, -V, eave), at(U, V, hi + o * t), at(-U, V, hi + o * t)], part: "slope" },
      { pts: [at(-hu, hv, z), at(hu, hv, z), at(hu, hv, hi), at(-hu, hv, hi)], part: "gable" },
      { pts: [at(-hu, -hv, z), at(-hu, hv, z), at(-hu, hv, hi)], part: "gable" },
      { pts: [at(hu, hv, z), at(hu, -hv, z), at(hu, hv, hi)], part: "gable" },
    ];
  }
  if (kind === "gambrel") {
    // a barn's: a steep lower slope to a knee, a shallow one on to the ridge; its ends' walls the shape of both
    const k = 0.45 * hv;
    const steep = Math.tan((62 * Math.PI) / 180);
    const hk = z + (hv - k) * steep;
    const hr = hk + k * t;
    const ek = z - o * steep;
    const out: RoofFace[] = [];
    for (const s of [-1, 1]) {
      out.push({ pts: [at(-U, s * V, ek), at(U, s * V, ek), at(U, s * k, hk), at(-U, s * k, hk)], part: "slope" });
      out.push({ pts: [at(-U, s * k, hk), at(U, s * k, hk), at(U, 0, hr), at(-U, 0, hr)], part: "slope" });
    }
    for (const s of [-1, 1])
      out.push({
        pts: [at(s * hu, -hv, z), at(s * hu, -k, hk), at(s * hu, 0, hr), at(s * hu, k, hk), at(s * hu, hv, z)],
        part: "gable",
      });
    return out;
  }
  if (kind === "mansard") {
    // steep sides all round to a low flat top
    const k = Math.min(hu, hv) * 0.32;
    const steep = Math.tan((70 * Math.PI) / 180);
    const hm = z + k * steep;
    const em = z - o * steep;
    const [iu, iv] = [hu - k, hv - k];
    return [
      { pts: [at(-U, -V, em), at(U, -V, em), at(iu, -iv, hm), at(-iu, -iv, hm)], part: "slope" },
      { pts: [at(U, V, em), at(-U, V, em), at(-iu, iv, hm), at(iu, iv, hm)], part: "slope" },
      { pts: [at(U, -V, em), at(U, V, em), at(iu, iv, hm), at(iu, -iv, hm)], part: "slope" },
      { pts: [at(-U, V, em), at(-U, -V, em), at(-iu, -iv, hm), at(-iu, iv, hm)], part: "slope" },
      { pts: [at(-iu, -iv, hm), at(iu, -iv, hm), at(iu, iv, hm), at(-iu, iv, hm)], part: "flat" },
    ];
  }
  if (kind === "halfhip") {
    // a gable with its tops clipped: a little hip at each end over a wall cut short
    const k = 0.35 * hv;
    const top = z + hv * t;
    const hc = z + (hv - k) * t;
    const out: RoofFace[] = [];
    for (const s of [-1, 1])
      out.push({
        pts: [
          at(-hu, s * V, eave),
          at(hu, s * V, eave),
          at(hu, s * k, hc),
          at(hu - k, 0, top),
          at(-(hu - k), 0, top),
          at(-hu, s * k, hc),
        ],
        part: "slope",
      });
    for (const e of [-1, 1]) {
      out.push({ pts: [at(e * hu, -k, hc), at(e * hu, k, hc), at(e * (hu - k), 0, top)], part: "slope" });
      out.push({ pts: [at(e * hu, -hv, z), at(e * hu, hv, z), at(e * hu, k, hc), at(e * hu, -k, hc)], part: "gable" });
    }
    return out;
  }
  if (kind === "dutch") {
    // a hip up to a ledge, a little gable on top
    const k = 0.55 * hv;
    const hd = z + k * t;
    const [iu, iv] = [hu - k, hv - k];
    const top = hd + iv * t;
    return [
      { pts: [at(-U, -V, eave), at(U, -V, eave), at(iu, -iv, hd), at(-iu, -iv, hd)], part: "slope" },
      { pts: [at(U, V, eave), at(-U, V, eave), at(-iu, iv, hd), at(iu, iv, hd)], part: "slope" },
      { pts: [at(U, -V, eave), at(U, V, eave), at(iu, iv, hd), at(iu, -iv, hd)], part: "slope" },
      { pts: [at(-U, V, eave), at(-U, -V, eave), at(-iu, -iv, hd), at(-iu, iv, hd)], part: "slope" },
      {
        pts: [
          at(-iu - 0.15, -iv - 0.15, hd),
          at(iu + 0.15, -iv - 0.15, hd),
          at(iu + 0.15, 0, top),
          at(-iu - 0.15, 0, top),
        ],
        part: "slope",
      },
      {
        pts: [
          at(iu + 0.15, iv + 0.15, hd),
          at(-iu - 0.15, iv + 0.15, hd),
          at(-iu - 0.15, 0, top),
          at(iu + 0.15, 0, top),
        ],
        part: "slope",
      },
      { pts: [at(-iu, -iv, hd), at(-iu, iv, hd), at(-iu, 0, top)], part: "gable" },
      { pts: [at(iu, iv, hd), at(iu, -iv, hd), at(iu, 0, top)], part: "gable" },
    ];
  }
  if (kind === "round") {
    // a barrel vault along u: an arc across, 12 facets; its ends' walls the arc's shape
    const n = 12;
    const rise = hv * 0.7;
    const arc = (i: number): [number, number] => {
      const a = Math.PI - (i / n) * Math.PI;
      return [Math.cos(a) * V, z + Math.sin(a) * rise - (o > 0 ? o * 0.3 : 0) * (1 - Math.sin(a))];
    };
    const out: RoofFace[] = [];
    for (let i = 0; i < n; i++) {
      const [v0, h0] = arc(i);
      const [v1, h1] = arc(i + 1);
      out.push({ pts: [at(-U, v0, h0), at(U, v0, h0), at(U, v1, h1), at(-U, v1, h1)], part: "slope" });
    }
    for (const e of [-1, 1]) {
      const pts: XYZ[] = [];
      for (let i = 0; i <= n; i++) {
        const a = Math.PI - (i / n) * Math.PI;
        pts.push(at(e * hu, Math.cos(a) * hv, z + Math.sin(a) * rise * (hv / V)));
      }
      out.push({ pts, part: "gable" });
    }
    return out;
  }
  if (kind === "dormer") {
    // a little box out of a slope, its front at −v: its walls, its gable roof along v, a window in its front
    const H = 1.3;
    const rt = z + H + hu * t;
    return [
      { pts: [at(-hu, -hv, z), at(hu, -hv, z), at(hu, -hv, z + H), at(-hu, -hv, z + H)], part: "gable" },
      {
        pts: [
          at(-hu * 0.62, -hv - 0.01, z + 0.25),
          at(hu * 0.62, -hv - 0.01, z + 0.25),
          at(hu * 0.62, -hv - 0.01, z + H - 0.18),
          at(-hu * 0.62, -hv - 0.01, z + H - 0.18),
        ],
        part: "glass",
      },
      { pts: [at(-hu, -hv, z + H), at(hu, -hv, z + H), at(0, -hv, rt)], part: "gable" },
      { pts: [at(-hu, -hv, z), at(-hu, hv, z), at(-hu, hv, z + H), at(-hu, -hv, z + H)], part: "gable" },
      { pts: [at(hu, hv, z), at(hu, -hv, z), at(hu, -hv, z + H), at(hu, hv, z + H)], part: "gable" },
      {
        pts: [
          at(-hu - 0.15, -hv - 0.2, z + H - 0.15 * t),
          at(0, -hv - 0.2, rt),
          at(0, hv, rt),
          at(-hu - 0.15, hv, z + H - 0.15 * t),
        ],
        part: "slope",
      },
      {
        pts: [
          at(0, -hv - 0.2, rt),
          at(hu + 0.15, -hv - 0.2, z + H - 0.15 * t),
          at(hu + 0.15, hv, z + H - 0.15 * t),
          at(0, hv, rt),
        ],
        part: "slope",
      },
    ];
  }
  if (kind === "chimney") {
    const z1 = top ?? z + 1.5;
    return [
      ...box(-hu, hu, -hv, hv, z, z1, "chimney"),
      ...box(-hu - 0.06, hu + 0.06, -hv - 0.06, hv + 0.06, z1, z1 + 0.12, "flat"),
    ];
  }
  return null;
}

/** (plan 130 phase 7) Auto Roof: a floor's rooms' union cut into rectangles (as few, as big as fit: overlapping where
 *  the outline turns — an L two crossing roofs, the valleys where they meet), each roofed `kind` at `pitch`, their eaves
 *  the walls' top. Axis-aligned outlines, a half metre at a time. */
export function autoRoofRects(s: Structure, floor: number): XY[][] {
  const rooms = s.rooms.filter((r) => r.floor === floor);
  if (!rooms.length) return [];
  const xs = rooms.flatMap((r) => r.outline.map((p) => p[0]));
  const ys = rooms.flatMap((r) => r.outline.map((p) => p[1]));
  const S = 0.5;
  const [x0, y0] = [Math.floor(Math.min(...xs) / S) * S, Math.floor(Math.min(...ys) / S) * S];
  const W = Math.ceil((Math.max(...xs) - x0) / S);
  const H = Math.ceil((Math.max(...ys) - y0) / S);
  if (W * H > 200_000) return [];
  const inside = (x: number, y: number) => rooms.some((r) => pointIn(r.outline, x, y));
  const cell = new Uint8Array(W * H);
  for (let j = 0; j < H; j++)
    for (let i = 0; i < W; i++) cell[j * W + i] = inside(x0 + (i + 0.5) * S, y0 + (j + 0.5) * S) ? 1 : 0;
  const covered = new Uint8Array(W * H);
  const out: XY[][] = [];
  for (;;) {
    let start = -1;
    for (let k = 0; k < W * H; k++)
      if (cell[k] && !covered[k]) {
        start = k;
        break;
      }
    if (start < 0) break;
    const [si, sj] = [start % W, Math.floor(start / W)];
    // (the biggest rectangle in the outline holding the start cell: grown right then down, and down then right)
    const grow = (wide: boolean) => {
      let [i0, i1, j0, j1] = [si, si, sj, sj];
      const full = (a: number, b: number, c: number, d: number) => {
        for (let j = c; j <= d; j++) for (let i = a; i <= b; i++) if (!cell[j * W + i]) return false;
        return true;
      };
      for (let pass = 0; pass < 2; pass++) {
        const horiz = (pass === 0) === wide;
        if (horiz) {
          while (i0 > 0 && full(i0 - 1, i0 - 1, j0, j1)) i0--;
          while (i1 < W - 1 && full(i1 + 1, i1 + 1, j0, j1)) i1++;
        } else {
          while (j0 > 0 && full(i0, i1, j0 - 1, j0 - 1)) j0--;
          while (j1 < H - 1 && full(i0, i1, j1 + 1, j1 + 1)) j1++;
        }
      }
      return [i0, i1, j0, j1];
    };
    const a = grow(true);
    const b = grow(false);
    const area = (q: number[]) => (q[1] - q[0] + 1) * (q[3] - q[2] + 1);
    const [i0, i1, j0, j1] = area(a) >= area(b) ? a : b;
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) covered[j * W + i] = 1;
    const [ax, ay, bx, by] = [x0 + i0 * S, y0 + j0 * S, x0 + (i1 + 1) * S, y0 + (j1 + 1) * S];
    out.push([
      [ax, ay],
      [bx, ay],
      [bx, by],
      [ax, by],
    ]);
    if (out.length > 24) break;
  }
  return out;
}
function pointIn(r: readonly XY[], x: number, y: number): boolean {
  let k = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, yi] = r[i];
    const [xj, yj] = r[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) k = !k;
  }
  return k;
}

/** (plan 130 phase 7) A roof changed where it is: its kind, pitch, overhang, covering, eaves' height, ridge — the
 *  operation (its id kept), or why not. */
export function roofSetOps(
  s: Structure,
  floor: number,
  id: string,
  c: Partial<Pick<Roof, "kind" | "pitch" | "over" | "mat" | "z" | "ridge" | "top">>,
): StructOp | string {
  const mine = (s.roofs ?? []).filter((r) => r.floor === floor);
  const r = mine.find((q) => q.id === id);
  if (!r) return "no such roof";
  const next: Roof = { ...r, ...Object.fromEntries(Object.entries(c).filter(([, v]) => v !== undefined)) } as Roof;
  if (!(ROOF_KINDS as readonly string[]).includes(next.kind)) return "not a roof";
  if (RECT_ONLY.has(next.kind) && !rectOf(next.outline)) return "that kind needs a rectangle";
  if (next.kind !== "flat" && next.kind !== "chimney" && !(next.pitch >= 10 && next.pitch <= 60)) return "10–60°";
  if (next.over !== undefined && !(next.over >= 0 && next.over <= 1.5)) return "0–1.5 m past the walls";
  if (next.mat !== undefined && !(next.mat in ROOF_MATS)) return "not a roof's covering";
  if (!Number.isFinite(next.z)) return "not a height";
  return { op: "roofs", floor, roofs: reseat(mine.map((q) => (q.id === id ? next : q))) };
}

/** A dormer's frame: u along its outline's first edge (its front, its window), the front at −v. */
function frontFrame(o: readonly XY[], c: XY): [XY, number, number, number] {
  const [a, b, d] = [o[0], o[1], o[2]];
  let ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
  const hu = Math.hypot(b[0] - a[0], b[1] - a[1]) / 2;
  const hv = Math.hypot(d[0] - b[0], d[1] - b[1]) / 2;
  const v = (p: XY) => -(p[0] - c[0]) * Math.sin(ang) + (p[1] - c[1]) * Math.cos(ang);
  if (v([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]) > 0) ang += Math.PI;
  return [c, hu, hv, ang];
}

/** (plan 130 phase 7) How high a roof's top is over (x, y) (world m; null: not over it) — its slopes' and flats'. */
export function roofHeightAt(r: Roof, x: number, y: number): number | null {
  let best: number | null = null;
  for (const f of roofFaces(r)) {
    if (f.part !== "slope" && f.part !== "flat") continue;
    const p = f.pts;
    for (let i = 1; i + 1 < p.length; i++) {
      const [a, b, c] = [p[0], p[i], p[i + 1]];
      const d = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1]);
      if (Math.abs(d) < 1e-9) continue;
      const l1 = ((b[1] - c[1]) * (x - c[0]) + (c[0] - b[0]) * (y - c[1])) / d;
      const l2 = ((c[1] - a[1]) * (x - c[0]) + (a[0] - c[0]) * (y - c[1])) / d;
      const l3 = 1 - l1 - l2;
      if (l1 < -1e-6 || l2 < -1e-6 || l3 < -1e-6) continue;
      const h = l1 * a[2] + l2 * b[2] + l3 * c[2];
      best = best === null ? h : Math.max(best, h);
    }
  }
  return best;
}

/** The pieces that sit on a roof (not roofs themselves: Auto Roof leaves them). */
export const ON_ROOF = new Set<Roof["kind"]>(["dormer", "chimney"]);
export const DORMER_W = 1.8;
export const DORMER_D = 1.6;
export const CHIMNEY_W = 0.8;
export const CHIMNEY_D = 0.6;

/** (plan 130 phase 7) A dormer or a chimney put on the roof under (x, y): its draft, or why not. A dormer faces the
 *  nearer eave, its front on the slope; a chimney stands from the slope's lowest corner to past the ridge. */
export function onRoofDraft(
  s: Pick<Structure, "roofs">,
  floor: number,
  kind: "dormer" | "chimney",
  x: number,
  y: number,
  pitch = 30,
): RoofDraft | string {
  const host = (s.roofs ?? [])
    .filter((r) => r.floor === floor && !ON_ROOF.has(r.kind) && roofHeightAt(r, x, y) !== null)
    .at(-1);
  if (!host) return "no roof there";
  const rect = rectOf(host.outline);
  let ang = rect?.ang ?? 0;
  if (rect && host.kind !== "hip" && host.ridge === 1) ang += Math.PI / 2;
  const [ux, uy, vx, vy] = [Math.cos(ang), Math.sin(ang), -Math.sin(ang), Math.cos(ang)];
  const c = rect?.c ?? [x, y];
  const vAt = (x - c[0]) * vx + (y - c[1]) * vy;
  const H = (px: number, py: number) => roofHeightAt(host, px, py);
  if (kind === "chimney") {
    const [hw, hd] = [CHIMNEY_W / 2, CHIMNEY_D / 2];
    const o: XY[] = [
      [x - ux * hw - vx * hd, y - uy * hw - vy * hd],
      [x + ux * hw - vx * hd, y + uy * hw - vy * hd],
      [x + ux * hw + vx * hd, y + uy * hw + vy * hd],
      [x - ux * hw + vx * hd, y - uy * hw + vy * hd],
    ];
    const hs = o.map((p) => H(p[0], p[1]) ?? host.z);
    const ridge = roofFaces(host).reduce((m, f) => Math.max(m, ...f.pts.map((p) => p[2])), host.z);
    return { outline: o, kind, z: Math.min(...hs) - 0.05, top: Math.max(ridge, ...hs) + 0.9 };
  }
  if (host.kind === "flat") return "a dormer goes on a slope";
  // (its front toward the eave below: −v when the pointer's on the −v side)
  const s1 = vAt < 0 ? -1 : 1;
  const [fx, fy] = [vx * s1, vy * s1]; // downhill
  const [hw, hd] = [DORMER_W / 2, DORMER_D / 2];
  const front: XY = [x + fx * hd, y + fy * hd];
  const back: XY = [x - fx * hd, y - fy * hd];
  // (front's left, front's right going along u so that the front is the first edge, then back)
  const o: XY[] = [
    [front[0] - ux * hw, front[1] - uy * hw],
    [front[0] + ux * hw, front[1] + uy * hw],
    [back[0] + ux * hw, back[1] + uy * hw],
    [back[0] - ux * hw, back[1] - uy * hw],
  ];
  const z = H(front[0], front[1]);
  const zb = H(back[0], back[1]);
  if (z === null || zb === null) return "a dormer needs room on the slope";
  // (its roof's covering: a dormer matches the roof it's on — the quality pass)
  return { outline: o, kind, z: z - 0.02, pitch, ...(host.mat ? { mat: host.mat } : {}) };
}

/** (plan 130 phase 7) Auto Roof: a floor's roofs (not its dormers, chimneys) made over again over its rooms — the
 *  drafts, their eaves the walls' top in each. */
export function autoRoofDrafts(
  s: Structure,
  floor: number,
  kind: Roof["kind"],
  pitch: number,
  extra: Pick<RoofDraft, "over" | "mat"> = {},
): RoofDraft[] {
  const f = s.floors.find((q) => q.index === floor);
  if (!f) return [];
  // (each a little over the one before: crossing hips share their slopes' planes where they overlap — they flickered)
  return autoRoofRects(s, floor).map((o, i) => {
    const [x0, y0, x1, y1] = [o[0][0] - 0.05, o[0][1] - 0.05, o[2][0] + 0.05, o[2][1] + 0.05];
    const within = (p: XY) => p[0] >= x0 && p[0] <= x1 && p[1] >= y0 && p[1] <= y1;
    let top = -Infinity;
    for (const w of s.walls)
      if (w.floor === floor && !w.style && within(w.a) && within(w.b)) top = Math.max(top, w.base + w.height);
    return { outline: o, kind, pitch, z: (Number.isFinite(top) ? top : f.z + WALL_H) + 0.02 * i, ...extra };
  });
}

/** (plan 130 phase 7) A floor's dormers and chimneys sat down again on the roofs under them (a roof under one changed
 *  kind, pitch or height: the dormer's front on its slope, the chimney from its lowest corner to past its ridge). */
function reseat(roofs: Roof[]): Roof[] {
  const r3 = (v: number) => Math.round(v * 1000) / 1000;
  const hosts = roofs.filter((r) => !ON_ROOF.has(r.kind));
  return roofs.map((r) => {
    if (!ON_ROOF.has(r.kind)) return r;
    const n = r.outline.length;
    const cx = r.outline.reduce((a, p) => a + p[0], 0) / n;
    const cy = r.outline.reduce((a, p) => a + p[1], 0) / n;
    const host = hosts.filter((h) => roofHeightAt(h, cx, cy) !== null).at(-1);
    if (!host) return r;
    const H = (x: number, y: number) => roofHeightAt(host, x, y);
    if (r.kind === "dormer") {
      const [a, b] = r.outline;
      const z = H((a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
      if (z === null) return r;
      // (its roof's covering with it)
      const { mat: _m, ...rest } = r;
      return { ...rest, z: r3(z - 0.02), ...(host.mat ? { mat: host.mat } : {}) };
    }
    const hs = r.outline.map((p) => H(p[0], p[1]) ?? host.z);
    const ridge = roofFaces(host).reduce((m, f) => Math.max(m, ...f.pts.map((p) => p[2])), host.z);
    return { ...r, z: r3(Math.min(...hs) - 0.05), top: r3(Math.max(ridge, ...hs) + 0.9) };
  });
}
