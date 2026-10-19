import assert from "node:assert/strict";
import { test } from "node:test";
import { canPlace, hungOnEdge } from "./build.ts";
import type { WorldObjectDef } from "./catalog.ts";
import { Grid, lockedEdge, mayLockDoor } from "./grid.ts";
import { hangFits } from "./hang.ts";
import { hWall, setEdge, vWall } from "./map.ts";
import { addRoom, blankMap, edgeBlocker, paintBlocker, setRoomWalls } from "./map-edit.ts";
import { studio } from "./maps/studio.ts";
import {
  doorBlocksLight,
  doorLeaves,
  doorShut,
  doorSlides,
  doorStartState,
  isDoorKind,
  isWindowKind,
  openingBlocker,
  openingCut,
  openingEdges,
  openingNear,
  openingsIntoWalls,
  wallCuts,
} from "./openings.ts";
import { findPath } from "./path.ts";

// A 32×24 studio with Ana's office (4..8 × 4..7, owner 7), walls round it and
// its door in the bottom wall at (6, 8).
function office() {
  const res = addRoom(blankMap("t", "T", 32, 24), [], [], {
    key: "room-ana",
    name: "Ana's office",
    kind: "private",
    x: 4,
    y: 4,
    w: 5,
    h: 4,
    ownerId: 7,
    ownerName: "Ana",
    walls: true,
  });
  assert.ok(typeof res !== "string", String(res));
  return res as Exclude<typeof res, string>;
}
const door = (props: Record<string, unknown> = {}): WorldObjectDef => ({
  id: "d",
  kind: "door",
  x: 6,
  y: 8,
  rot: 0,
  props: { state: "open", roomKey: "room-ana", ...props },
});

test("doors go in a wall (it stays), with floor both sides; never in the open, a half wall or the map's edge", () => {
  const { map } = office();
  assert.equal(hWall(map, 6, 8), "p");
  assert.ok(canPlace(map, [], door()));
  assert.match(openingBlocker(map, [], { ...door(), x: 15, y: 15 }) ?? "", /wall/, "not in the open");
  assert.match(openingBlocker(map, [], { ...door(), x: 10, y: 0 }) ?? "", /floor on both sides/, "outer wall");
  const half = { ...map, hWalls: [...map.hWalls] };
  setEdge(half, { dir: "h", x: 6, y: 8 }, "h");
  assert.match(openingBlocker(half, [], door()) ?? "", /half wall/);
  const glass = { ...map, hWalls: [...map.hWalls] };
  setEdge(glass, { dir: "h", x: 6, y: 8 }, "g");
  assert.ok(canPlace(glass, [], door()), "a glass wall takes a door");
  assert.ok(!canPlace(glass, [], { ...door(), kind: "window", id: "w" }), "but not a window");
  // west walls: rot 1
  assert.ok(canPlace(map, [], { ...door(), x: 4, y: 5, rot: 1 }));
  // one per edge
  assert.match(openingBlocker(map, [door()], { ...door(), id: "d2" }) ?? "", /door is there/);
});

test("windows: in any full wall (outer ones too), wide ones across two edges with no wall meeting between", () => {
  const { map } = office();
  const win = (o: Partial<WorldObjectDef>): WorldObjectDef => ({ id: "w", kind: "window", x: 10, y: 0, rot: 0, ...o });
  assert.ok(canPlace(map, [], win({})), "the outer wall");
  assert.ok(canPlace(map, [], win({ x: 5, y: 4 })), "between rooms");
  const wide = win({ kind: "window_wide", x: 5, y: 4 });
  assert.deepEqual(
    openingEdges(wide).map((e) => [e.x, e.y]),
    [
      [5, 4],
      [6, 4],
    ],
  );
  assert.ok(canPlace(map, [], wide));
  // a partition meeting the outer wall at x = 10: a wide window across it, no
  const parted = { ...map, vWalls: [...map.vWalls] };
  setEdge(parted, { dir: "v", x: 10, y: 0 }, "p");
  assert.match(openingBlocker(parted, [], win({ kind: "window_wide", x: 9, y: 0 })) ?? "", /wall meets/);
  assert.ok(canPlace(parted, [], win({ kind: "window_wide", x: 10, y: 0 })), "beside it is fine");
  assert.ok(!canPlace(map, [], win({ x: 15, y: 15 })), "not in the open");
  // they don't let anyone through
  const g = Grid.from(map, [win({ x: 6, y: 8 })]);
  assert.ok(!g.step(6, 8, 6, 7));
});

test("wall items and openings: never over one, either face; above a door is fine", () => {
  const { map } = office();
  const d = door();
  const poster = (props: Record<string, unknown>): WorldObjectDef => ({
    id: "p",
    kind: "poster",
    x: 6,
    y: 8,
    rot: 0,
    props: { wu: 0, wz: 0, ...props },
  });
  assert.ok(hangFits(map, [], poster({})), "on the bare wall");
  assert.ok(!hangFits(map, [d], poster({})), "over the door: no");
  assert.ok(!hangFits(map, [d], { ...poster({}), y: 7, rot: 2 }), "nor on its other face");
  // a clock high up over the door's lintel (lowest 43 + 5 steps × 9.8 = 92 > 88)
  assert.ok(hangFits(map, [d], { id: "c", kind: "clock", x: 6, y: 8, rot: 0, props: { wu: 1, wz: 5 } }));
  assert.match(openingBlocker(map, [poster({})], d, hungOnEdge([poster({})])) ?? "", /Poster hangs there/);
  assert.ok(!canPlace(map, [poster({})], d));
});

test("the walls round a door or window stay: no taking them away, no window paint, repaint them freely", () => {
  const { map } = office();
  const objs = [door(), { id: "w", kind: "window", x: 5, y: 4, rot: 0 }];
  assert.match(edgeBlocker(map, objs, { dir: "h", x: 6, y: 8 }, ".") ?? "", /door is in that wall/);
  assert.match(edgeBlocker(map, objs, { dir: "h", x: 6, y: 8 }, "h") ?? "", /door/);
  assert.equal(edgeBlocker(map, objs, { dir: "h", x: 6, y: 8 }, "b"), null, "brick is fine");
  assert.match(edgeBlocker(map, objs, { dir: "h", x: 5, y: 4 }, "g") ?? "", /window is in that wall/);
  // a room's walls in glass: the window keeps its wall
  const glass = setRoomWalls(map, "room-ana", "g", objs);
  assert.equal(hWall(glass, 5, 4), "p");
  assert.equal(hWall(glass, 7, 4), "g");
  assert.equal(hWall(glass, 6, 8), "g", "a glass door in glass is fine");
  // no taking the floor from in front of a door
  assert.match(paintBlocker(map, objs, [], 6, 7, " ") ?? "", /door opens onto it/);
  assert.equal(wallCuts(objs).get("h6,8")?.z0, 0);
});

test("in hand: an opening snaps its middle to the pointer along the wall", () => {
  const w: WorldObjectDef = { id: "w", kind: "window_wide", x: 0, y: 0, rot: 0 };
  assert.deepEqual(openingNear(w, { dir: "h", line: 4 }, 6.2), { ...w, x: 5, y: 4, rot: 0 });
  assert.deepEqual(openingNear(door(), { dir: "v", line: 4 }, 5.7), { ...door(), x: 4, y: 5, rot: 1 });
});

test("older saves: doors in a gap get their wall, painted-on windows become windows (once)", () => {
  const { map } = office();
  const gap = { ...map, hWalls: [...map.hWalls], vWalls: [...map.vWalls] };
  setEdge(gap, { dir: "h", x: 6, y: 8 }, "."); // the old doorway
  setEdge(gap, { dir: "h", x: 6, y: 8 + 0 }, ".");
  setEdge(gap, { dir: "h", x: 5, y: 8 }, "b"); // brick beside it
  setEdge(gap, { dir: "h", x: 12, y: 0 }, "P"); // a window in the outer wall
  setEdge(gap, { dir: "v", x: 0, y: 6 }, "P");
  const r = openingsIntoWalls(gap, [door()]);
  assert.ok(r.mapChanged);
  assert.equal(hWall(r.map, 6, 8), "b", "the wall beside it");
  assert.equal(hWall(r.map, 12, 0), "p");
  assert.equal(vWall(r.map, 0, 6), "p");
  assert.deepEqual(
    r.added.map((o) => [o.id, o.kind, o.x, o.y, o.rot]),
    [
      ["win-h12-0", "window", 12, 0, 0],
      ["win-v0-6", "window", 0, 6, 1],
    ],
  );
  assert.equal(hWall(gap, 12, 0), "P", "original untouched");
  const again = openingsIntoWalls(r.map, r.objects);
  assert.ok(!again.mapChanged && again.added.length === 0, "nothing the second time");
  // the built-in Studio converts whole, and everyone still gets about
  const s = openingsIntoWalls(studio, studio.objects);
  assert.ok(s.added.length > 0);
  for (const o of s.objects)
    if (o.kind === "door" || o.kind.startsWith("window")) assert.ok(canPlace(s.map, [], o), o.id);
});

test("locks: only the room's owner locks and unlocks (not an admin); unowned rooms: admins", () => {
  const { map } = office();
  const d = door({ state: "locked" });
  assert.ok(mayLockDoor(map, d, { uid: 7 }));
  assert.ok(!mayLockDoor(map, d, { uid: 8 }));
  assert.ok(!mayLockDoor(map, d, { uid: 8, admin: true }), "an admin can't open an owner's lock");
  const free = { ...map, areas: map.areas.map((a) => (a.key === "room-ana" ? { ...a, ownerId: null } : a)) };
  assert.ok(mayLockDoor(free, d, { uid: 8, admin: true }));
  assert.ok(!mayLockDoor(free, d, { uid: 8 }));
  // locked: only Ana gets in
  const outside = { x: 6.5, y: 12.5 };
  const inside = { x: 6.5, y: 5.5 };
  assert.equal(findPath(Grid.from(map, [d], { uid: 8 }), outside, inside)?.length ?? 0, 0);
  assert.ok(findPath(Grid.from(map, [d], { uid: 7 }), outside, inside));
  assert.ok(findPath(Grid.from(map, [door({ state: "closed" })], { uid: 8 }), outside, inside), "closed: anyone");
  // nor round it: while it's locked the room's walls are Ana's to change
  assert.match(lockedEdge(map, [d], { dir: "v", x: 4, y: 5 }, 8) ?? "", /Ana locked Ana's office/);
  assert.equal(lockedEdge(map, [d], { dir: "v", x: 4, y: 5 }, 7), null);
  assert.equal(lockedEdge(map, [door()], { dir: "v", x: 4, y: 5 }, 8), null, "unlocked: anyone builds");
  assert.equal(lockedEdge(map, [d], { dir: "v", x: 20, y: 5 }, 8), null, "elsewhere: anyone builds");
});

test("door kinds: a double door takes two edges, saloon doors and archways don't lock, archways never shut", () => {
  const { map } = office();
  const dbl: WorldObjectDef = {
    id: "dd",
    kind: "door_double",
    x: 5,
    y: 8,
    rot: 0,
    props: { state: "locked", roomKey: "room-ana" },
  };
  assert.ok(canPlace(map, [], dbl));
  assert.deepEqual(
    openingEdges(dbl).map((e) => [e.x, e.y]),
    [
      [5, 8],
      [6, 8],
    ],
  );
  // locked: both its edges are wall for others, open for Ana
  const g8 = Grid.from(map, [dbl], { uid: 8 });
  assert.ok(!g8.step(5, 8, 5, 7) && !g8.step(6, 8, 6, 7));
  const g7 = Grid.from(map, [dbl], { uid: 7 });
  assert.ok(g7.step(5, 8, 5, 7) && g7.step(6, 8, 6, 7));
  // saloon doors: anyone through, never locked (even "locked" in a save), nobody may lock them
  const saloon: WorldObjectDef = { id: "s", kind: "door_saloon", x: 6, y: 8, rot: 0, props: { state: "locked" } };
  assert.ok(Grid.from(map, [saloon], { uid: 8 }).step(6, 8, 6, 7));
  assert.ok(!mayLockDoor(map, saloon, { uid: 7 }));
  assert.equal(doorStartState("door_saloon"), "closed");
  assert.ok(doorShut({ kind: "door_saloon", props: {} }), "saloon doors hang shut…");
  assert.ok(!doorBlocksLight({ kind: "door_saloon", props: {} }), "…and let light over them");
  // an archway: no door at all
  const arch: WorldObjectDef = { id: "a", kind: "archway", x: 6, y: 8, rot: 0, props: { state: "locked" } };
  assert.ok(!doorShut(arch) && !mayLockDoor(map, arch, { uid: 7 }) && doorLeaves("archway") === 0);
  assert.ok(Grid.from(map, [arch], { uid: 8 }).step(6, 8, 6, 7));
  assert.deepEqual(openingCut("archway"), [0, 98]);
  // a barn door slides; the rest swing
  assert.ok(doorSlides("door_barn") && !doorSlides("door"));
  assert.ok(isDoorKind("door_barn") && !isDoorKind("window") && isWindowKind("window_tall"));
});
