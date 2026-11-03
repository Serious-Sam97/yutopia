// The plan 68 families' shared leaf (docs/plan/68-more-furniture.md): the iso px a metre and the
// shape-part makers, apart from furniture.ts and shapes/index.ts so a family's own tables (fam/*.ts)
// can use them and still be spread into those (no import cycle).

/** Iso px a metre of height (the art's ZPX: 45.25 · cos 30°): today's numbers were measured in it. */
export const ISO_PX = 45.25 * Math.cos(Math.PI / 6);
/** Metres → the iso px the catalog keeps (to a thousandth: today's numbers come back exact). */
export const isoPx = (m: number): number => Math.round(m * ISO_PX * 1000) / 1000;

/** An axis-aligned box in a kind's own frame (rot 0), metres: across u0..u1, down v0..v1, up y0..y1. */
export interface BoxPart {
  t: "box";
  u0: number;
  v0: number;
  u1: number;
  v1: number;
  y0: number;
  y1: number;
}
/** An upright cylinder: its axis at (u, v), radius r, from y0 to y1. */
export interface CylPart {
  t: "cyl";
  u: number;
  v: number;
  r: number;
  y0: number;
  y1: number;
}
export type Part = BoxPart | CylPart;

export interface KindShape {
  parts: Part[];
  /** something's odd about it (the review page lists these): why */
  odd?: string;
}

// ── part makers (metres; from the footprint's corner) ──
export const box = (u0: number, v0: number, u1: number, v1: number, y0: number, y1: number): BoxPart => ({
  t: "box",
  u0,
  v0,
  u1,
  v1,
  y0,
  y1,
});
export const cyl = (u: number, v: number, r: number, y0: number, y1: number): CylPart => ({
  t: "cyl",
  u,
  v,
  r,
  y0,
  y1,
});
export const one = (...parts: Part[]): KindShape => ({ parts });
