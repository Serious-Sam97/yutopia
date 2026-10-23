import { footprint } from "../catalog.ts";
import { CAR_BODY, carKindOf } from "./body.ts";

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

/** A parked car's body: the box round it (the floor's coords), its half length along its
 *  heading and half width across — each model its own size (body.ts). */
export function parkedBody(o: ParkedObj): {
  x: number;
  y: number;
  hx: number;
  hy: number;
  a: number;
  h: number | null;
} {
  const pose = parkedPose(o);
  const b = CAR_BODY[carKindOf(o.props?.model)];
  const off = (b.ahead - b.behind) / 2;
  return {
    x: pose.x + Math.cos(pose.a) * off,
    y: pose.y + Math.sin(pose.a) * off,
    hx: (b.ahead + b.behind) / 2,
    hy: b.width / 2,
    a: pose.a,
    h: pose.h,
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

/** A car left near a bay of the lot (`bays`: the lot's, building coords; `x, z` its middle there,
 *  `a` its heading): the bay it's in — nosed in or backed in, square enough and close enough to
 *  its middle — to be put square in it. Else null. */
export function bayFor(
  bays: { x: number; z: number; dir: number }[],
  x: number,
  z: number,
  a: number,
): { i: number; a: number } | null {
  for (let i = 0; i < bays.length; i++) {
    const b = bays[i];
    if (Math.abs(x - b.x) > 1.6 || Math.abs(z - b.z) > 0.9) continue;
    // (its two ways in: nose first, or backed in)
    for (const h of [b.dir > 0 ? Math.PI : 0, b.dir > 0 ? 0 : Math.PI]) {
      const d = Math.atan2(Math.sin(a - h), Math.cos(a - h));
      if (Math.abs(d) < 0.35) return { i, a: h };
    }
  }
  return null;
}
