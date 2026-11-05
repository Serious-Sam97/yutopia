// The plan 68 families' shared leaf (docs/plan/68-more-furniture.md): the shape-part makers, apart from furniture.ts and shapes/index.ts so a family's own tables (fam/*.ts)
// can use them and still be spread into those (no import cycle).

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
