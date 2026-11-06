import assert from "node:assert/strict";
import { test } from "node:test";
import { applyOps } from "./ops.ts";
import { area2 } from "./rings.ts";
import { NEW_ROOM, roomsAfterWalls } from "./rooms.ts";
import type { Room, Structure, Wall, XY } from "./types.ts";

// Phase 11.5 (docs/plan/72): rooms found and split as walls go up.

const wall = (id: string, a: XY, b: XY): Wall => ({ id, floor: 0, a, b, base: 0, height: 3, front: "p" });
const box = (id: string, x0: number, y0: number, x1: number, y1: number): Wall[] => [
  wall(`${id}n`, [x0, y0], [x1, y0]),
  wall(`${id}e`, [x1, y0], [x1, y1]),
  wall(`${id}s`, [x1, y1], [x0, y1]),
  wall(`${id}w`, [x0, y1], [x0, y0]),
];
const ring = (x0: number, y0: number, x1: number, y1: number): XY[] => [
  [x0, y0],
  [x1, y0],
  [x1, y1],
  [x0, y1],
];
const room = (key: string, outline: XY[], props: Record<string, unknown> = {}): Room => ({
  key,
  floor: 0,
  outline,
  rect: [0, 0, 10, 6],
  props: { name: key, kind: "private", ...props },
});
const st = (walls: Wall[], rooms: Room[]): Structure => ({
  version: 4,
  key: "t",
  name: "t",
  home: 0,
  spawn: [1, 1],
  floors: [{ index: 0, name: "G", z: 0, grid: { x0: 0, y0: 0, w: 10, h: 6 } }],
  slabs: [],
  walls,
  rooms,
});
const area = (r: XY[]) => Math.abs(area2(r)) / 2;
let n = 0;
const key = () => `r${n++}`;
const after = (s: Structure, add: Wall[]) => ({ ...s, walls: [...s.walls, ...add] });

test("a wall across a room: the bigger part keeps it (name, owner), the smaller a new room", () => {
  const s = st(box("o", 0, 0, 10, 6), [room("Hall", ring(0, 0, 10, 6), { ownerId: 7 })]);
  const a = after(s, [wall("x", [4, 0], [4, 6])]);
  const r = roomsAfterWalls(s, a, 0, key);
  assert.ok(r);
  assert.equal(r.found.length, 1);
  const rooms = applyOps(a, [r.op]).rooms;
  const hall = rooms.find((q) => q.key === "Hall");
  assert.equal(area(hall?.outline ?? []), 36, "the 6 × 6 part");
  assert.equal(hall?.props.ownerId, 7, "its owner kept");
  const fresh = rooms.find((q) => q.key === r.found[0]);
  assert.equal(area(fresh?.outline ?? []), 24, "the 4 × 6 part");
  assert.equal(fresh?.props.name, NEW_ROOM);
  assert.equal(fresh?.props.ownerId, undefined);
  assert.deepEqual(fresh?.rect, [0, 0, 4, 6]);
});

test("a closet walled off in a room: the room keeps all of it, the closet a room inside it", () => {
  const s = st(box("o", 0, 0, 10, 6), [room("Hall", ring(0, 0, 10, 6), { priority: 2 })]);
  const a = after(s, box("c", 6, 1, 8, 3));
  const r = roomsAfterWalls(s, a, 0, key);
  assert.ok(r);
  const rooms = applyOps(a, [r.op]).rooms;
  assert.equal(area(rooms.find((q) => q.key === "Hall")?.outline ?? []), 60, "unchanged");
  const closet = rooms.find((q) => q.key === r.found[0]);
  assert.equal(area(closet?.outline ?? []), 4);
  assert.equal(closet?.props.priority, 3, "a step more specific");
});

test("a box closed in the open floor's corner: a room found there, the rest stays open floor", () => {
  const s = st(box("o", 0, 0, 10, 6), []);
  const a = after(s, [wall("p", [7, 0], [7, 2]), wall("q", [7, 2], [10, 2])]);
  const r = roomsAfterWalls(s, a, 0, key);
  assert.ok(r);
  assert.equal(r.found.length, 1);
  const rooms = applyOps(a, [r.op]).rooms;
  assert.equal(rooms.length, 1);
  assert.equal(area(rooms[0].outline), 6, "the 3 × 2 corner");
  // drawn again where nothing closes: nothing found
  assert.equal(roomsAfterWalls(s, after(s, [wall("z", [2, 2], [3, 3])]), 0, key), null);
});

test("a wall taken away between two rooms: both stay as they were", () => {
  const walls = [...box("o", 0, 0, 10, 6), wall("x", [4, 0], [4, 6])];
  const s = st(walls, [room("A", ring(0, 0, 4, 6)), room("B", ring(4, 0, 10, 6))]);
  const a = { ...s, walls: walls.filter((w) => w.id !== "x") };
  assert.equal(roomsAfterWalls(s, a, 0, key), null);
});

test("a room whose walls don't close (its rectangle): a box drawn in it is a room in it", () => {
  // the outer walls with a 3 m gap in the south: no face; the room is its rectangle
  const walls = [
    wall("n", [0, 0], [10, 0]),
    wall("e", [10, 0], [10, 6]),
    wall("w", [0, 6], [0, 0]),
    wall("s", [10, 6], [6, 6]),
  ];
  const s = st(walls, [room("Open", ring(0, 0, 10, 6))]);
  const a = after(s, box("c", 1, 1, 3, 3));
  const r = roomsAfterWalls(s, a, 0, key);
  assert.ok(r);
  const rooms = applyOps(a, [r.op]).rooms;
  assert.equal(area(rooms.find((q) => q.key === "Open")?.outline ?? []), 60);
  assert.equal(area(rooms.find((q) => q.key === r.found[0])?.outline ?? []), 4);
});
