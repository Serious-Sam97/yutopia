// What a thing is fixed to (docs/plan/72-the-3d-core.md, phase 6): a door or a window set into a
// wall, a picture or a shelf hung on one of its faces — `on`: the wall (by id), how far along it
// (m from its `a`, to the thing's middle) and, hung, which face. It moves with its wall (phase 11's
// tool moves walls; the tile tool only puts them in and takes them away, so walls keep their place
// and a thing is attached again wherever a wall's id changed).
//
// Kept in the thing's props (`props.on`), world metres.

import { entry, type WorldObjectDef } from "../catalog.ts";
import { hangOf, WQ } from "../hang.ts";
import { isOpening, openingEdges } from "../openings.ts";
import { isArc } from "./arc.ts";
import type { Structure, Wall, XY } from "./types.ts";

export interface On {
  wall: string;
  /** m along the wall from its `a`, to the thing's middle */
  at: number;
  /** hung: the face it's on — 1 the wall's front (its +y side along x, +x along y: Wall.front),
   *  -1 its back */
  side?: 1 | -1;
}

/** Fixed to a wall: an opening, or a thing hung on one. */
export const attachable = (kind: string): boolean => isOpening(kind) || !!entry(kind).wall;

/** Where on a wall's line a thing's middle is, and the line's direction: a thing in world metres
 *  (its floor's corner added). */
function middleOf(o: WorldObjectDef): { p: XY; dir: "h" | "v"; side?: 1 | -1 } | null {
  if (isOpening(o.kind)) {
    const edges = openingEdges(o);
    if (!edges.length) return null;
    const first = edges[0];
    const last = edges[edges.length - 1];
    const p: XY = first.dir === "h" ? [(first.x + last.x + 1) / 2, first.y] : [first.x, (first.y + last.y + 1) / 2];
    return { p, dir: first.dir };
  }
  if (entry(o.kind).wall) {
    const h = hangOf(o);
    const u = (h.u0 + h.u1) / 2 / WQ;
    return { p: h.dir === "h" ? [u, h.line] : [h.line, u], dir: h.dir, side: h.side };
  }
  return null;
}

/** How far along a wall a point is (m from `a`), when it's on it. */
function alongWall(w: Wall, p: XY): number | null {
  const dx = w.b[0] - w.a[0];
  const dy = w.b[1] - w.a[1];
  const len = Math.hypot(dx, dy);
  if (len < 1e-9) return null;
  const t = ((p[0] - w.a[0]) * dx + (p[1] - w.a[1]) * dy) / len;
  const off = Math.abs((p[0] - w.a[0]) * dy - (p[1] - w.a[1]) * dx) / len;
  return off < 1e-6 && t > -1e-6 && t < len + 1e-6 ? t : null;
}

/** What a thing (in world metres, on `floor`) is fixed to: the wall its middle is on — null when
 *  it isn't a wall's (not attachable), or no wall is there (a door in an old gap). */
export function attachOf(s: Pick<Structure, "walls">, o: WorldObjectDef, floor: number): On | null {
  const m = middleOf(o);
  if (!m) return null;
  for (const w of s.walls) {
    if (w.floor !== floor || isArc(w)) continue; // (doors and windows in arcs: phase 11.6)
    const along = (w.a[1] === w.b[1] ? "h" : w.a[0] === w.b[0] ? "v" : "") === m.dir ? alongWall(w, m.p) : null;
    if (along === null) continue;
    return { wall: w.id, at: Math.round(along * 1e4) / 1e4, ...(m.side ? { side: m.side } : {}) };
  }
  return null;
}

/** The point on its wall an `On` says (world): where a thing's middle is put back. */
export function pointOn(s: Pick<Structure, "walls">, on: On): XY | null {
  const w = s.walls.find((x) => x.id === on.wall);
  if (!w) return null;
  const len = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]) || 1;
  const t = on.at / len;
  return [w.a[0] + (w.b[0] - w.a[0]) * t, w.a[1] + (w.b[1] - w.a[1]) * t];
}

/** A thing's `on` as stored (props.on), or null. */
export function onOf(o: { props?: Record<string, unknown> | null }): On | null {
  const v = o.props?.on as On | undefined;
  return v && typeof v.wall === "string" && Number.isFinite(v.at) ? v : null;
}

/** The thing with its `on` as it should be now (the same object when nothing changed). */
export function withOn(s: Pick<Structure, "walls">, o: WorldObjectDef, floor: number): WorldObjectDef {
  if (!attachable(o.kind)) return o;
  // (one in a wall drawn free is kept by its `on`: that's where it is)
  if (o.props?.free === true) return o;
  const on = attachOf(s, o, floor);
  const had = onOf(o);
  if (JSON.stringify(had) === JSON.stringify(on)) return o;
  const props = { ...(o.props ?? {}) };
  if (on) props.on = on;
  else delete props.on;
  return { ...o, props };
}

/** Every thing with its `on` as it should be (a world map's things: world metres, `floorOf` each
 *  one's floor), and those that changed. */
export function attachAll(
  s: Pick<Structure, "walls">,
  objects: readonly WorldObjectDef[],
  floorOf: (o: WorldObjectDef) => number,
): { objects: WorldObjectDef[]; changed: WorldObjectDef[] } {
  const changed: WorldObjectDef[] = [];
  const out = objects.map((o) => {
    const n = withOn(s, o, floorOf(o));
    if (n !== o) changed.push(n);
    return n;
  });
  return { objects: out, changed };
}
