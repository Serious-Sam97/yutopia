import assert from "node:assert/strict";
import { test } from "node:test";
import { doorRoom } from "../doors.ts";
import { hearingGain } from "../hearing.ts";
import { type AreaDef, areaAt, inArea, type TileMap } from "../map.ts";
import { applyEdges, blankMap } from "../map-edit.ts";
import { structureFromMap } from "./from-map.ts";
import { viewOf } from "./view.ts";

// Rooms as polygons (docs/plan/72-the-3d-core.md, phase 10): a room is the face its walls close round,
// not the rectangle it was drawn as — what's in it (areaAt), its doors' edges (whose they are), who
// hears whom in it, all by its outline.

// An L of walls, its rectangle only the top arm (x 2–10, y 2–5); the arm down (x 2–5, y 5–10) is the
// same room by its walls. A door in the arm down's west wall.
function lRoom(): TileMap {
  let m = blankMap("l", "L", 20, 16);
  const W = "p";
  const edges: { dir: "h" | "v"; x: number; y: number; ch: string }[] = [];
  for (let x = 2; x < 10; x++) edges.push({ dir: "h", x, y: 2, ch: W }); // top
  for (let x = 5; x < 10; x++) edges.push({ dir: "h", x, y: 5, ch: W }); // the top arm's underside
  for (let x = 2; x < 5; x++) edges.push({ dir: "h", x, y: 10, ch: W }); // the arm down's bottom
  for (let y = 2; y < 10; y++) edges.push({ dir: "v", x: 2, y, ch: W }); // west, all the way down
  for (let y = 2; y < 5; y++) edges.push({ dir: "v", x: 10, y, ch: W }); // the top arm's east end
  for (let y = 5; y < 10; y++) edges.push({ dir: "v", x: 5, y, ch: W }); // the arm down's east side
  m = applyEdges(m, edges);
  const office: AreaDef = { key: "office", name: "Office", kind: "private", x: 2, y: 2, w: 8, h: 3, priority: 1 };
  return { ...m, areas: [...m.areas, office] };
}

test("an L-shaped room: the face its walls close round, its arm down in it though its rectangle isn't", () => {
  const s = structureFromMap(lRoom());
  const room = s.rooms.find((r) => r.key === "office");
  assert.ok(room);
  assert.equal(room.outline.length, 6, "six corners: the L");
  const map = viewOf(s);
  const a = map.areas.find((q) => q.key === "office");
  assert.ok(a?.outline, "its area carries the outline");
  assert.deepEqual([a.x, a.y, a.w, a.h], [2, 2, 8, 3], "its rectangle kept as drawn");
  // the arm down: the office now (it was the floor's main room by the rectangle)
  assert.equal(areaAt(map, 3.5, 8.5)?.key, "office");
  assert.equal(areaAt(map, 7.5, 3.5)?.key, "office", "the top arm, as before");
  // past the L's inner corner, outside its walls (in the rectangle's box): not the office
  assert.ok(!inArea(a, 7.5, 7.5));
  assert.notEqual(areaAt(map, 7.5, 7.5)?.key, "office");
});

test("its door's edge is the office's, and in it a private room's walls hold the voices", () => {
  const map = viewOf(structureFromMap(lRoom()));
  // a door on the arm down's west wall (the edge x 2, y 7): the office's
  const door = { kind: "door", x: 2, y: 7, yaw: Math.PI / 2 } as Parameters<typeof doorRoom>[1];
  assert.equal(doorRoom(map, door)?.key, "office");
  // two in it, one in each arm: they hear each other; one outside doesn't hear in (it's private)
  const top = { x: 8.5, y: 3.5 };
  const down = { x: 3.5, y: 8.5 };
  assert.ok(hearingGain(map, top, down) > 0, "the same room");
  assert.equal(hearingGain(map, { x: 7.5, y: 7.5 }, down), 0, "outside its walls");
});
