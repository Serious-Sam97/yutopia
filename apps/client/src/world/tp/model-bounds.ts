import { CATALOG, entry, type ObjectKind, type WorldObjectDef } from "@yutopia/shared";
import { World3 } from "./build";
import type { Out } from "./kit3d";

// What a thing's 3D model takes up (docs/plan/50-the-volume.md, A): drawn on its own as the
// 3D view draws it (World3.drawObject, no renderer), measured in tiles (metres). For the
// model-bounds test and /dev/shapes: the shapes table (shared/shapes) mustn't drift from it.

export interface Bounds3 {
  x0: number;
  y0: number;
  z0: number;
  x1: number;
  y1: number;
  z1: number;
}
type Items = typeof import("../art/items");

/** The box round what's drawn (solid and glass; not the free-hand cards: a plant's leaves). */
export function outBounds(o: Out): Bounds3 | null {
  const b = { x0: 1e9, y0: 1e9, z0: 1e9, x1: -1e9, y1: -1e9, z1: -1e9 };
  for (const g of [o.lit, o.glow, o.clear])
    for (let i = 0; i < g.pos.length; i += 3) {
      b.x0 = Math.min(b.x0, g.pos[i]);
      b.x1 = Math.max(b.x1, g.pos[i]);
      b.y0 = Math.min(b.y0, g.pos[i + 1]);
      b.y1 = Math.max(b.y1, g.pos[i + 1]);
      b.z0 = Math.min(b.z0, g.pos[i + 2]);
      b.z1 = Math.max(b.z1, g.pos[i + 2]);
    }
  return b.x0 > b.x1 ? null : b;
}

/** One thing's model as the 3D view draws it, measured. */
export function modelBounds(items: Items, o: WorldObjectDef): Bounds3 | null {
  const draw = World3.prototype.drawObject.call({ items, posts: new Set<string>() } as unknown as World3, o);
  return outBounds(draw.out);
}

/** Every look of a catalog kind at rot 0 at the origin: the box round all of them. */
export function kindBounds(items: Items, kind: ObjectKind, props: Record<string, unknown> = {}): Bounds3 | null {
  let all: Bounds3 | null = null;
  for (let v = 0; v < (entry(kind).variants ?? 1); v++) {
    const b = modelBounds(items, { id: `${kind}-${v}`, kind, x: 0, y: 0, rot: 0, props: { variant: v, ...props } });
    if (!b) continue;
    all = all
      ? {
          x0: Math.min(all.x0, b.x0),
          y0: Math.min(all.y0, b.y0),
          z0: Math.min(all.z0, b.z0),
          x1: Math.max(all.x1, b.x1),
          y1: Math.max(all.y1, b.y1),
          z1: Math.max(all.z1, b.z1),
        }
      : b;
  }
  return all;
}

export const KINDS = Object.keys(CATALOG) as ObjectKind[];
