import { quarterOf, quarterYaw, type WorldObjectDef } from "./catalog.ts";
import type { Point } from "./iso.ts";
import { type AreaDef, type Edge, edgeAt, isFloor, type MapDef, tileAt } from "./map.ts";
import { doorLockable, openingCentre, ringOf, wallTakes } from "./openings.ts";

// ── doors ──────────────────────────────────────────────────────────────────
// A door sits on a tile edge: rot even = the north edge of its tile (in a wall
// along x), rot odd = the west edge (a wall along y).
export function doorEdge(o: { x: number; y: number; yaw?: number }): Edge {
  return quarterOf(o) % 2 === 0 ? { x: o.x, y: o.y, dir: "h" } : { x: o.x, y: o.y, dir: "v" };
}

// The middle of a door (tile coords; a double door spans two edges).
export function doorCentre(o: { kind?: string; x: number; y: number; yaw?: number }): Point {
  return openingCentre({ kind: o.kind ?? "door", x: o.x, y: o.y, yaw: quarterYaw(quarterOf(o)) });
}

// Can a door go on this edge? In a wall that takes one (openings.ts), with
// floor on both sides. (Where exactly, with what's around: openingBlocker.)
export function doorFits(map: MapDef, e: Edge): boolean {
  const floor = (x: number, y: number) => isFloor(tileAt(map, x, y));
  if (!wallTakes("door", edgeAt(map, e))) return false;
  return e.dir === "h" ? floor(e.x, e.y - 1) && floor(e.x, e.y) : floor(e.x - 1, e.y) && floor(e.x, e.y);
}

// The room a door belongs to: its roomKey, or a room whose border the door's
// edge lies on (owned rooms first).
export function doorRoom(
  map: MapDef,
  door: { x: number; y: number; yaw?: number; props?: Record<string, unknown> },
): AreaDef | null {
  const key = door.props?.roomKey;
  if (typeof key === "string") {
    const a = map.areas.find((x) => x.key === key);
    if (a) return a;
  }
  const e = doorEdge(door);
  const rings = map.areas.filter((a) =>
    e.dir === "h"
      ? (e.y === a.y || e.y === a.y + a.h) && e.x >= a.x && e.x < a.x + a.w
      : (e.x === a.x || e.x === a.x + a.w) && e.y >= a.y && e.y < a.y + a.h,
  );
  return rings.find((a) => a.ownerId) ?? rings[0] ?? null;
}

export function doorOwner(
  map: MapDef,
  door: { x: number; y: number; yaw?: number; props?: Record<string, unknown> },
): number | null {
  return doorRoom(map, door)?.ownerId ?? null;
}

// Who may lock or unlock it: the owner of its room, and nobody else (not even
// an admin: an owner's lock is theirs); a door to a room with no owner, the
// admins.
export function mayLockDoor(
  map: MapDef,
  door: { x: number; y: number; yaw?: number; props?: Record<string, unknown> },
  who: { uid: number | null; admin?: boolean },
): boolean {
  if (!doorLockable((door as { kind?: string }).kind ?? "door")) return false;
  const owner = doorOwner(map, door);
  return owner != null ? who.uid === owner : !!who.admin;
}

// Owned rooms with a door locked right now, and who holds the key: their
// walls, doors and windows (and the room itself) are the owner's to change.
export function lockedRooms(map: MapDef, objects: Iterable<WorldObjectDef>): { area: AreaDef; ownerId: number }[] {
  const out = new Map<string, { area: AreaDef; ownerId: number }>();
  for (const o of objects) {
    if (!doorLockable(o.kind) || o.props?.state !== "locked") continue;
    const a = doorRoom(map, o);
    if (a?.ownerId) out.set(a.key, { area: a, ownerId: a.ownerId });
  }
  return [...out.values()];
}

// Why `uid` can't change an edge (a wall, or a door or window in it): it's on
// the border of someone else's locked room. null = they can.
export function lockedEdge(map: MapDef, objects: Iterable<WorldObjectDef>, e: Edge, uid: number | null): string | null {
  for (const { area, ownerId } of lockedRooms(map, objects)) {
    if (ownerId === uid) continue;
    if (ringOf(area).some((r) => r.dir === e.dir && r.x === e.x && r.y === e.y))
      return `${area.ownerName ?? "Its owner"} locked ${area.name}`;
  }
  return null;
}
