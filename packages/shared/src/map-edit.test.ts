import assert from "node:assert/strict";
import { test } from "node:test";
import { canPlace } from "./build.ts";
import { doorFits, doorOwner, Grid } from "./grid.ts";
import { areaAt, hWall, tileAt, vWall } from "./map.ts";
import {
  addRoom,
  applyEdges,
  applyPaint,
  blankMap,
  edgeBlocker,
  layoutFromMap,
  mapFromLayout,
  paintBlocker,
  resizeMap,
  setRoomWalls,
  validLayout,
} from "./map-edit.ts";
import { studio, studioV1 } from "./maps/studio.ts";
import { findPath } from "./path.ts";

test("painting floors: anywhere, but no floor taken from under furniture, people, the spawn or a board", () => {
  assert.equal(paintBlocker(studio, studio.objects, [], 10, 3, ","), null);
  assert.equal(paintBlocker(studio, studio.objects, [], 3, 6, ","), null, "carpet under a desk is fine");
  assert.equal(paintBlocker(studio, studio.objects, [], 10, 3, " "), null, "taking an empty floor away is fine");
  assert.match(paintBlocker(studio, studio.objects, [], 3, 6, " ") ?? "", /Desk/);
  assert.match(paintBlocker(studio, studio.objects, [{ x: 10.5, y: 3.5 }], 10, 3, " ") ?? "", /standing/);
  assert.match(paintBlocker(studio, studio.objects, [], 6, 28, " ") ?? "", /arrive/);
  assert.match(paintBlocker(studio, studio.objects, [], 4, 0, " ") ?? "", /Board wall/);
  assert.match(paintBlocker(studio, studio.objects, [], 10, 3, "#") ?? "", /unknown/, "walls aren't tiles any more");
  assert.match(paintBlocker(studio, studio.objects, [], 99, 1, ".") ?? "", /outside/);
  const m = applyPaint(studio, [{ x: 10, y: 3, ch: "," }]);
  assert.equal(tileAt(m, 10, 3), ",");
  assert.equal(tileAt(studio, 10, 3), ".", "original untouched");
});

test("painting walls on edges: never through furniture, over a door, or away from a board; windows outside only", () => {
  assert.equal(edgeBlocker(studio, studio.objects, { x: 10, y: 5, dir: "h" }, "p"), null);
  // desks at (3,6) and (3,7) span x 3..4: an edge between their two tiles cuts through
  assert.match(edgeBlocker(studio, studio.objects, { x: 4, y: 6, dir: "v" }, "p") ?? "", /Desk/);
  assert.match(edgeBlocker(studio, studio.objects, { x: 4, y: 0, dir: "h" }, ".") ?? "", /hangs/);
  assert.equal(edgeBlocker(studio, studio.objects, { x: 4, y: 0, dir: "h" }, "w"), null, "another material is fine");
  assert.match(edgeBlocker(studio, studio.objects, { x: 10, y: 5, dir: "h" }, "P") ?? "", /outer/);
  assert.equal(edgeBlocker(studio, studio.objects, { x: 11, y: 0, dir: "h" }, "P"), null);
  assert.match(edgeBlocker(studio, studio.objects, { x: 99, y: 0, dir: "h" }, "p") ?? "", /outside/);
  const m = applyEdges(studio, [{ x: 10, y: 5, dir: "h", ch: "b" }]);
  assert.equal(hWall(m, 10, 5), "b");
  assert.equal(hWall(studio, 10, 5), ".", "original untouched");
  // a wall across the floor now blocks walking across it
  const g = Grid.from(m, []);
  assert.ok(!g.step(10, 4, 10, 5));
  assert.ok(g.step(11, 4, 11, 5));
});

test("layouts round-trip and are validated (v2, and v1 still reads)", () => {
  const l = layoutFromMap(studio);
  assert.equal(l.version, 2);
  assert.ok(validLayout(l));
  assert.ok(!validLayout({ ...l, width: 500 }));
  assert.ok(!validLayout({ ...l, tiles: l.tiles.map((r, i) => (i === 3 ? `${r.slice(0, -1)}Z` : r)) }));
  assert.ok(
    !validLayout({ ...l, tiles: l.tiles.map((r, i) => (i === 3 ? `${r.slice(0, -1)}#` : r)) }),
    "no wall tiles in v2",
  );
  assert.ok(!validLayout({ ...l, hWalls: l.hWalls?.slice(1) }), "edge rows");
  assert.ok(!validLayout({ ...l, vWalls: l.vWalls?.map((r) => `${r.slice(0, -1)}Z`) }), "edge chars");
  assert.ok(
    !validLayout({ ...l, spawn: { x: 47.5, y: 0.5 }, tiles: l.tiles.map((r) => r.replace(/./g, " ")) }),
    "spawn on floor",
  );
  const m = mapFromLayout("x", "X", l);
  assert.deepEqual(m.tiles, studio.tiles);
  assert.deepEqual(m.hWalls, studio.hWalls);
  assert.deepEqual(m.vWalls, studio.vWalls);
  const { hWalls: _h, vWalls: _v, version: _x, ...v1 } = layoutFromMap(studioV1);
  assert.ok(validLayout(v1), "a v1 layout (walls as tiles) still validates, to be converted");
});

test("resize keeps content top-left, clips rooms and walls, keeps the spawn on floor", () => {
  const big = resizeMap(studio, 64, 48);
  assert.equal(big.width, 64);
  assert.equal(big.tiles[0].length, 64);
  assert.equal(big.hWalls.length, 49);
  assert.equal(big.vWalls[0].length, 65);
  assert.equal(tileAt(big, 60, 40), " ");
  assert.equal(tileAt(big, 10, 3), tileAt(studio, 10, 3));
  assert.equal(vWall(big, 29, 3), vWall(studio, 29, 3));
  const small = resizeMap(studio, 20, 16);
  assert.equal(small.height, 16);
  assert.ok(small.areas.every((a) => a.x + a.w <= 20 && a.y + a.h <= 16));
  assert.ok(!small.areas.some((a) => a.key === "lobby"), "lobby fully cut");
  assert.ok(validLayout(layoutFromMap(small)), "spawn moved onto floor");
  assert.equal(resizeMap(studio, 5, 500).width, 16, "clamped");
});

test("blank map: walls along the border, floor everywhere, valid", () => {
  const m = blankMap("b", "B", 32, 24);
  assert.ok(validLayout(layoutFromMap(m)));
  assert.equal(tileAt(m, 0, 0), ".");
  assert.equal(hWall(m, 5, 0), "p");
  assert.equal(hWall(m, 5, 24), "p");
  assert.equal(vWall(m, 0, 5), "p");
  assert.equal(vWall(m, 32, 5), "p");
  assert.equal(hWall(m, 5, 5), ".");
  assert.equal(areaAt(m, 5, 5)?.key, "main");
});

test("rooms: walls on their edges, a doorway, an owner, and a locked door only the owner passes", () => {
  const base = blankMap("b", "B", 32, 24);
  const res = addRoom(base, [], [], {
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
    floor: ",",
  });
  assert.ok(typeof res !== "string", String(res));
  const { map, door } = res as Exclude<typeof res, string>;
  assert.equal(hWall(map, 4, 4), "p", "top");
  assert.equal(hWall(map, 5, 8), "p", "bottom");
  assert.equal(vWall(map, 4, 5), "p", "left");
  assert.equal(vWall(map, 9, 5), "p", "right");
  assert.equal(tileAt(map, 5, 5), ",");
  assert.equal(tileAt(map, 3, 3), ".", "no tile lost to walls");
  assert.deepEqual(door, { x: 6, y: 8, rot: 0 });
  assert.equal(hWall(map, 6, 8), ".", "the doorway");
  assert.ok(doorFits(map, { x: 6, y: 8, dir: "h" }));
  assert.equal(areaAt(map, 5, 5)?.ownerId, 7);
  const d = { id: "d", kind: "door", x: 6, y: 8, rot: 0, props: { state: "locked" } };
  assert.ok(canPlace(map, [], d), "door fits the doorway");
  assert.ok(!canPlace(map, [], { ...d, x: 15, y: 15 }), "not in the open");
  assert.equal(doorOwner(map, d), 7);
  const outside = { x: 6.5, y: 12.5 };
  const inside = { x: 6.5, y: 5.5 };
  assert.equal(findPath(Grid.from(map, [d], { uid: 8 }), outside, inside)?.length ?? 0, 0, "others can't get in");
  assert.ok(findPath(Grid.from(map, [d], { uid: 7 }), outside, inside), "the owner can");
  assert.equal(findPath(Grid.from(map, [d]), outside, inside)?.length ?? 0, 0, "no identity: blocked");
  const closed = { ...d, props: { state: "closed" } };
  assert.ok(findPath(Grid.from(map, [closed], { uid: 8 }), outside, inside), "closed (unlocked) doors open for anyone");
  // a wall can't cut through furniture
  const desk = { id: "k", kind: "desk", x: 14, y: 12, rot: 0 };
  const bad = addRoom(base, [desk], [], {
    key: "room-x",
    name: "X",
    kind: "private",
    x: 15,
    y: 11,
    w: 4,
    h: 4,
    ownerId: null,
    ownerName: null,
    walls: true,
  });
  assert.equal(typeof bad, "string");
  // booths get foam; materials can be changed per room
  const booth = addRoom(base, [], [], {
    key: "b1",
    name: "B",
    kind: "booth",
    x: 20,
    y: 4,
    w: 3,
    h: 3,
    ownerId: null,
    ownerName: null,
    walls: true,
  });
  assert.ok(typeof booth !== "string");
  const bm = (booth as Exclude<typeof booth, string>).map;
  assert.equal(hWall(bm, 20, 4), "f");
  assert.equal(hWall(setRoomWalls(bm, "b1", "k"), 20, 4), "k");
});
