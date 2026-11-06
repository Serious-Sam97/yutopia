// The saved world's form (docs/plan/72-the-3d-core.md, phase 5). Version 3: metres and radians — a
// thing's `props.z` (how high it stands on what it's on) was the old item art's px, and its turn a
// quarter count `rot` where it's now `yaw`. The database is moved by the API's migrations
// (apps/api/database/migrations/2026_11_05_*, the same rules); this moves the worlds kept as files
// (a saved world for the offline world-server, the e2e suite's fixtures).
import { quarterYaw } from "./catalog.ts";

export const LAYOUT_VERSION = 3;

interface SavedObject {
  props?: Record<string, unknown> | null;
  yaw?: number;
}
/** A world as a file keeps it: the API's /internal/world (WorldInfo) or a WorldSnapshot. */
export interface SavedWorld {
  layout?: unknown;
  objects?: SavedObject[];
  /** (a world with no layout of its own marks its form here) */
  format?: number;
}

/** The old item art's px a metre up (45.25 · cos 30°: its iso camera looked down 30° and a tile's
 *  edge was 45.25 px) — only old saves still measure in it. */
const OLD_PX = 45.25 * Math.cos(Math.PI / 6);
/** The old art's px → metres, to 0.1 mm. */
const m = (px: number): number => Math.round((px / OLD_PX) * 1e4) / 1e4;

/** One thing in version 3's form (a copy when it changes; the same object when not): its `rot` as
 *  `yaw`, and its height on what it's on in metres — only a height that is plainly px (over 3: a px
 *  height starts at ~11, a surface in metres is under 3), as the API's migration: the world-server
 *  may have set a thing on its host in metres already. */
export function objectToV3<T extends SavedObject>(o: T): T {
  let out = o;
  if ("rot" in o) {
    const { rot, ...rest } = o as T & { rot?: unknown };
    out = { ...rest, yaw: quarterYaw(Number(rot) || 0) } as T;
  }
  const z = out.props?.z;
  if (typeof z === "number" && Number.isFinite(z) && z > 3) out = { ...out, props: { ...out.props, z: m(z) } };
  return out;
}

const versionOf = (l: unknown): number =>
  l && typeof l === "object" ? Number((l as { version?: unknown }).version) || 0 : 0;
export const isV3 = (w: SavedWorld): boolean => (w.layout ? versionOf(w.layout) : (w.format ?? 0)) >= 3;

/** A saved world moved to version 3, once (a world already there comes back as it is). */
export function worldToV3<T extends SavedWorld>(w: T): { world: T; changed: number } {
  if (isV3(w)) return { world: w, changed: 0 };
  let changed = 0;
  const objects = w.objects?.map((o) => {
    const n = objectToV3(o);
    if (n !== o) changed++;
    return n;
  });
  const layout = w.layout && typeof w.layout === "object" ? { ...w.layout, version: LAYOUT_VERSION } : w.layout;
  return { world: { ...w, layout, objects, format: LAYOUT_VERSION }, changed };
}
