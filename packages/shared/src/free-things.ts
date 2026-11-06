// Things placed free (docs/plan/72-the-3d-core.md, phase 11.9; the user's call: things free with
// snap, 15° on R): a thing that stands on the floor — not one on a surface, on a wall, in one, nor
// the building's own (stairs, flights, lifts, cars) — anywhere and turned any way. Kept with
// `props.free`: its x, y the middle of its footprint, its yaw how it's turned (its long side along
// (cos yaw, sin yaw), as the quarter turns turn things). A thing put on whole tiles at a quarter turn
// is kept as things always were (no `free`). Checked against the floor (it stands on its slabs),
// the walls (none through it) and the solid things round it (their footprints don't overlap).
import { entry, footprint, quarterOf, quarterYaw, type WorldObjectDef } from "./catalog.ts";
import type { Structure, XY } from "./structure/types.ts";

const BUILDING = new Set(["stairs", "flight", "elevator", "car"]);

/** Whether a kind can stand free (on the floor, not the building's own). */
export const canBeFree = (kind: string): boolean => {
  const e = entry(kind);
  return !!e.buildable && !e.wall && !e.onSurface && !e.opening && !BUILDING.has(kind);
};

/** A thing placed free. */
export const isFreeThing = (o: { kind: string; props?: Record<string, unknown> | null }): boolean =>
  o.props?.free === true && canBeFree(o.kind);

/** A thing put with its middle at (cx, cy) turned `yaw`: kept as a tile thing when that's on whole
 *  tiles at a quarter turn (its corner x, y), else free. */
export function placeFree(def: WorldObjectDef, cx: number, cy: number, yaw: number): WorldObjectDef {
  const turn = ((yaw % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  const q = Math.round(turn / (Math.PI / 2));
  const quarter = Math.abs(turn - q * (Math.PI / 2)) < 1e-6;
  if (quarter) {
    const { w, h } = footprint(def.kind, q & 3);
    const [x, y] = [cx - w / 2, cy - h / 2];
    if (Math.abs(x - Math.round(x)) < 1e-6 && Math.abs(y - Math.round(y)) < 1e-6) {
      const { free: _f, ...props } = def.props ?? {};
      return { ...def, x: Math.round(x), y: Math.round(y), yaw: quarterYaw(q), props: { ...props, free: false } };
    }
  }
  const r = (v: number) => Math.round(v * 1000) / 1000;
  return { ...def, x: r(cx), y: r(cy), yaw: Math.round(turn * 1e5) / 1e5, props: { ...(def.props ?? {}), free: true } };
}

/** A thing's middle (world): a free one's x, y; a tile one's footprint's middle. */
export function thingMiddle(o: WorldObjectDef): XY {
  if (isFreeThing(o)) return [o.x, o.y];
  const { w, h } = footprint(o.kind, quarterOf(o));
  return [o.x + w / 2, o.y + h / 2];
}

/** A thing's footprint's corners (world), shrunk by `inset` (m) all round. */
export function thingCorners(o: WorldObjectDef, inset = 0): XY[] {
  const e = entry(o.kind);
  if (isFreeThing(o)) {
    const [hw, hh] = [Math.max(0.01, e.w / 2 - inset), Math.max(0.01, e.h / 2 - inset)];
    const [c, s] = [Math.cos(o.yaw ?? 0), Math.sin(o.yaw ?? 0)];
    return [
      [-hw, -hh],
      [hw, -hh],
      [hw, hh],
      [-hw, hh],
    ].map(([u, v]): XY => [o.x + u * c - v * s, o.y + u * s + v * c]);
  }
  const { w, h } = footprint(o.kind, quarterOf(o));
  return [
    [o.x + inset, o.y + inset],
    [o.x + w - inset, o.y + inset],
    [o.x + w - inset, o.y + h - inset],
    [o.x + inset, o.y + h - inset],
  ];
}

// separating axes of two convex polygons (their edges' normals): none separates them → they overlap
function overlap(a: readonly XY[], b: readonly XY[]): boolean {
  for (const poly of [a, b])
    for (let i = 0; i < poly.length; i++) {
      const [p, q] = [poly[i], poly[(i + 1) % poly.length]];
      const [nx, ny] = [-(q[1] - p[1]), q[0] - p[0]];
      let [a0, a1, b0, b1] = [Infinity, -Infinity, Infinity, -Infinity];
      for (const [x, y] of a) {
        const d = x * nx + y * ny;
        a0 = Math.min(a0, d);
        a1 = Math.max(a1, d);
      }
      for (const [x, y] of b) {
        const d = x * nx + y * ny;
        b0 = Math.min(b0, d);
        b1 = Math.max(b1, d);
      }
      if (a1 <= b0 + 1e-9 || b1 <= a0 + 1e-9) return false;
    }
  return true;
}

const inRing = (r: readonly XY[], x: number, y: number): boolean => {
  let k = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, yi] = r[i];
    const [xj, yj] = r[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) k = !k;
  }
  return k;
};

/** Why a free thing can't stand there (null: it can): off the floor, a wall through it, or another
 *  solid thing where it is. `others`: the things of its floor (itself left out). */
export function freeFits(
  o: WorldObjectDef,
  others: readonly WorldObjectDef[],
  s: Pick<Structure, "floors" | "slabs" | "walls">,
  floor: number,
): string | null {
  const f = s.floors.find((q) => q.index === floor);
  if (!f) return "no such floor";
  const box = thingCorners(o, 0.05);
  // (on the floor: every corner on one of its slabs at its height)
  const slabs = s.slabs.filter((x) => x.floor === floor && Math.abs(x.z - f.z) < 1e-3);
  const onFloor = (p: XY) =>
    slabs.some((x) => inRing(x.outline, p[0], p[1]) && !x.holes.some((h) => inRing(h, p[0], p[1])));
  if (!box.every(onFloor)) return "off the floor";
  for (const w of s.walls) {
    if (w.floor !== floor || w.base > f.z + 0.5) continue;
    if (overlap(box, [w.a, w.b])) return "a wall's in the way";
  }
  if (entry(o.kind).solid)
    for (const q of others) {
      if (q.id === o.id || !entry(q.kind).solid || entry(q.kind).onSurface || entry(q.kind).wall) continue;
      if (overlap(box, thingCorners(q, 0.05))) return "something's there";
    }
  return null;
}
