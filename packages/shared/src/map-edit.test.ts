import assert from "node:assert/strict";
import { test } from "node:test";
import { canPlace } from "./build.ts";
import { doorOwner, doorRot, Grid } from "./grid.ts";
import { areaAt, tileAt } from "./map.ts";
import {
  addRoom,
  applyPaint,
  blankMap,
  layoutFromMap,
  mapFromLayout,
  paintBlocker,
  resizeMap,
  validLayout,
} from "./map-edit.ts";
import { studio } from "./maps/studio.ts";
import { findPath } from "./path.ts";

test("painting: floors anywhere, walls never over furniture, people, the spawn or a hung board", () => {
  assert.equal(paintBlocker(studio, studio.objects, [], 10, 3, "#"), null);
  assert.equal(paintBlocker(studio, studio.objects, [], 3, 6, ","), null, "carpet under a desk is fine");
  assert.match(paintBlocker(studio, studio.objects, [], 3, 6, "#") ?? "", /Desk/);
  assert.match(paintBlocker(studio, studio.objects, [{ x: 10.5, y: 3.5 }], 10, 3, "#") ?? "", /standing/);
  assert.match(paintBlocker(studio, studio.objects, [], 6, 28, "#") ?? "", /arrive/);
  assert.equal(paintBlocker(studio, studio.objects, [], 11, 0, "."), null, "opening a plain wall is fine…");
  assert.match(
    paintBlocker(studio, studio.objects, [], 4, 0, ".") ?? "",
    /hangs/,
    "…but not the wall a board hangs on",
  );
  assert.match(paintBlocker(studio, studio.objects, [], 4, 0, " ") ?? "", /hangs/);
  assert.match(paintBlocker(studio, studio.objects, [], 99, 1, "#") ?? "", /outside/);
  const m = applyPaint(studio, [{ x: 10, y: 3, ch: "#" }]);
  assert.equal(tileAt(m, 10, 3), "#");
  assert.equal(tileAt(studio, 10, 3), ".", "original untouched");
});

test("layouts round-trip and are validated", () => {
  const l = layoutFromMap(studio);
  assert.ok(validLayout(l));
  assert.ok(!validLayout({ ...l, width: 500 }));
  assert.ok(!validLayout({ ...l, tiles: l.tiles.map((r, i) => (i === 3 ? `${r.slice(0, -1)}Z` : r)) }));
  assert.ok(!validLayout({ ...l, spawn: { x: 0.5, y: 0.5 } }), "spawn must be floor");
  assert.deepEqual(mapFromLayout("x", "X", l).tiles, studio.tiles);
});

test("resize keeps content top-left, clips rooms, keeps the spawn on floor", () => {
  const big = resizeMap(studio, 64, 48);
  assert.equal(big.width, 64);
  assert.equal(big.tiles[0].length, 64);
  assert.equal(tileAt(big, 60, 40), " ");
  assert.equal(tileAt(big, 10, 3), tileAt(studio, 10, 3));
  const small = resizeMap(studio, 20, 16);
  assert.equal(small.height, 16);
  assert.ok(small.areas.every((a) => a.x + a.w <= 20 && a.y + a.h <= 16));
  assert.ok(!small.areas.some((a) => a.key === "lobby"), "lobby fully cut");
  assert.ok(validLayout(layoutFromMap(small)), "spawn moved onto floor");
  assert.equal(resizeMap(studio, 5, 500).width, 16, "clamped");
});

test("blank map: walls around, floor inside, valid", () => {
  const m = blankMap("b", "B", 32, 24);
  assert.ok(validLayout(layoutFromMap(m)));
  assert.equal(tileAt(m, 0, 0), "#");
  assert.equal(tileAt(m, 5, 5), ".");
  assert.equal(areaAt(m, 5, 5)?.key, "main");
});

test("rooms: walls with a doorway, an owner, and a locked door only the owner passes", () => {
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
  assert.equal(tileAt(map, 3, 3), "#");
  assert.equal(tileAt(map, 9, 8), "#");
  assert.equal(tileAt(map, 5, 5), ",");
  assert.deepEqual(door, { x: 6, y: 8, rot: 0 });
  assert.equal(doorRot(map, 6, 8), 0);
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
  // overlapping walls with furniture is refused
  const desk = { id: "k", kind: "desk", x: 14, y: 10, rot: 0 };
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
});
