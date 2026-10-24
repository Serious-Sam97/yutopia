import type { WorldObjectDef } from "./catalog.ts";
import { type BayBoard, bayById, bayId, boardOf, claimable, type LotBay, type LotLayout } from "./lot.ts";

// Someone's own bay (docs/plan/43-the-spot.md): a claimed bay of the lot has a board at its head
// with their name, a world object of its own (kind `bayboard`, id `bay-<bay id>`) on the ground
// floor, saved like any other. Its tile is the post's; the post's exact spot in it is `ox`/`oy`
// (the lot's numbers don't fall on tiles). One bay each, plain bays only (lot.ts `claimable`).
//
// `off`: the ground floor's corner in the building's coords (shared GROUND_OFFSET, the map's
// ox/oy); the lot is laid out in the building's.

export const BOARD_KIND = "bayboard";
export const boardId = (bay: string) => `bay-${bay}`;

/** The board object for `b`, claimed by `owner`. */
export function boardObject(
  l: LotLayout,
  b: LotBay,
  owner: { id: number; name: string },
  off: { x: number; y: number },
): WorldObjectDef {
  const w: BayBoard = boardOf(l, b);
  const mx = w.x - off.x;
  const my = w.z - off.y;
  const r3 = (v: number) => Math.round(v * 1000) / 1000;
  return {
    id: boardId(bayId(b)),
    kind: BOARD_KIND,
    x: Math.floor(mx),
    y: Math.floor(my),
    rot: 0,
    props: {
      level: 0,
      bay: bayId(b),
      ownerId: owner.id,
      ownerName: owner.name,
      // where in its tile the post stands, which way its face looks along x (into the bay)
      ox: r3(mx - Math.floor(mx)),
      oy: r3(my - Math.floor(my)),
      face: Math.sin(w.ry) > 0 ? 1 : -1,
      // (the pair: half a post each, so one alone still has one and two don't overlap; row D:
      // a plank on the pavement's side too)
      ...(w.shared ? { half: 1 } : {}),
      ...(b.row === "e" ? { back: 1 } : {}),
    },
  };
}

/** The bay a point (the building's coords) is in, if any. */
export function bayAt(l: LotLayout, x: number, z: number, margin = 0): LotBay | null {
  for (const b of l.bays)
    if (Math.abs(x - b.x) < l.bayL / 2 - margin && Math.abs(z - b.z) < l.bayW / 2 - margin) return b;
  return null;
}

/** The claimed bays: bay id → its board. */
export function boardsOf(objects: Iterable<WorldObjectDef>): Map<string, WorldObjectDef> {
  const out = new Map<string, WorldObjectDef>();
  for (const o of objects) if (o.kind === BOARD_KIND && typeof o.props?.bay === "string") out.set(o.props.bay, o);
  return out;
}

/** Someone's board, if they have one. */
export function boardOfOwner(objects: Iterable<WorldObjectDef>, uid: number): WorldObjectDef | null {
  for (const o of objects) if (o.kind === BOARD_KIND && Number(o.props?.ownerId) === uid) return o;
  return null;
}

/** Where a board's post stands, in the building's coords. */
export function postOf(o: WorldObjectDef, off: { x: number; y: number }): { x: number; z: number } {
  return {
    x: o.x + (Number(o.props?.ox) || 0) + off.x,
    z: o.y + (Number(o.props?.oy) || 0) + off.y,
  };
}

/** Why `uid` (standing at x, z: the building's coords) can't claim `bay`, or null: they can. */
export function cantClaim(
  l: LotLayout,
  objects: Iterable<WorldObjectDef>,
  bay: string,
  uid: number,
  x: number,
  z: number,
): "gone" | "kind" | "far" | "taken" | "yours" | null {
  const b = bayById(l, bay);
  if (!b) return "gone";
  if (!claimable(b)) return "kind";
  // (in it, a little slack at its lines; along it a step out of its ends: a bay with a car in it
  // is claimed from its open end)
  if (Math.abs(x - b.x) > l.bayL / 2 + 1.4 || Math.abs(z - b.z) > l.bayW / 2 + 0.3) return "far";
  const o = boardsOf(objects).get(bay);
  if (o) return Number(o.props?.ownerId) === uid ? "yours" : "taken";
  return null;
}
