import { footprint } from "../catalog.ts";

// A parked car as a world object (docs/plan/28-the-car.md, Together): the
// lot's cars are objects of kind `car`, 5 × 2 tiles at a quarter turn (rot 0:
// the nose to −x, each turn a quarter clockwise seen from above), placed
// exactly by props.dx / dz. Driven and left anywhere, props.a holds its exact
// heading and props.hy its height; x, y and rot stay the nearest whole tile and
// quarter turn (the iso view draws it so).

export interface ParkedObj {
  x: number;
  y: number;
  rot?: number;
  props?: Record<string, unknown> | null;
}

/** A quarter turn's heading (atan2 of the nose's z, x). */
export const rotHeading = (rot: number) => Math.PI + (((rot % 4) + 4) % 4) * (Math.PI / 2);

/** Where a parked car stands: its middle (the floor's coords), its heading, its height. */
export function parkedPose(o: ParkedObj): { x: number; y: number; a: number; h: number | null } {
  const rot = o.rot ?? 0;
  const { w, h } = footprint("car", rot);
  const p = o.props ?? {};
  const a = typeof p.a === "number" ? p.a : rotHeading(rot);
  return {
    x: o.x + w / 2 + (Number(p.dx) || 0),
    y: o.y + h / 2 + (Number(p.dz) || 0),
    a: Math.atan2(Math.sin(a), Math.cos(a)),
    h: typeof p.hy === "number" ? p.hy : null,
  };
}

/** A car left at (x, y) (the floor's coords) facing `a`: its object's place and props. */
export function parkAt(
  x: number,
  y: number,
  a: number,
  height: number,
  props: Record<string, unknown>,
): { x: number; y: number; rot: number; props: Record<string, unknown> } {
  const rot = (((Math.round((a - Math.PI) / (Math.PI / 2)) % 4) + 4) % 4) as 0 | 1 | 2 | 3;
  const { w, h } = footprint("car", rot);
  const ox = Math.round(x - w / 2);
  const oy = Math.round(y - h / 2);
  const out = { ...props };
  delete out.driven;
  out.dx = Math.round((x - w / 2 - ox) * 100) / 100;
  out.dz = Math.round((y - h / 2 - oy) * 100) / 100;
  out.a = Math.round(Math.atan2(Math.sin(a), Math.cos(a)) * 1000) / 1000;
  out.hy = Math.round(height * 100) / 100;
  return { x: ox, y: oy, rot, props: out };
}
