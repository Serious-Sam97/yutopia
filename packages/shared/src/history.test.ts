import assert from "node:assert/strict";
import { test } from "node:test";
import { applyStep, diffStep, snapshot } from "./history.ts";
import { hWall, tileAt } from "./map.ts";
import { applyEdges, applyPaint, resizeMap } from "./map-edit.ts";
import { studio } from "./maps/studio.ts";

const plant = { id: "p1", kind: "plant", x: 10, y: 3, rot: 0 };

test("undo/redo: floor paint, walls and objects go back and forth", () => {
  const before = snapshot(studio, studio.objects);
  const painted = applyEdges(applyPaint(studio, [{ x: 10, y: 3, ch: "," }]), [{ x: 10, y: 3, dir: "h", ch: "b" }]);
  const after = snapshot(painted, [...studio.objects, plant]);
  const step = diffStep(before, after, "painted floors");
  assert.ok(step);
  assert.equal(step.cells.length, 2);
  assert.deepEqual(
    step.objects.map((o) => o.id),
    ["p1"],
  );

  const back = applyStep(painted, [...studio.objects, plant], step, "back");
  assert.ok(back.map);
  assert.equal(tileAt(back.map, 10, 3), tileAt(studio, 10, 3));
  assert.equal(hWall(back.map, 10, 3), hWall(studio, 10, 3));
  assert.deepEqual(back.remove, ["p1"]);
  assert.equal(back.skipped, 0);

  const fwd = applyStep(back.map, studio.objects, step, "forward");
  assert.ok(fwd.map);
  assert.equal(tileAt(fwd.map, 10, 3), ",");
  assert.equal(hWall(fwd.map, 10, 3), "b");
  assert.deepEqual(fwd.put, [plant]);
});

test("undo skips what someone else changed since", () => {
  const before = snapshot(studio, [plant]);
  const mine = applyPaint(studio, [
    { x: 10, y: 3, ch: "," },
    { x: 11, y: 3, ch: "," },
  ]);
  const moved = { ...plant, x: 12 };
  const step = diffStep(before, snapshot(mine, [moved]), "x");
  assert.ok(step);
  // someone repaints one of my tiles and moves the plant again
  const theirs = applyPaint(mine, [{ x: 11, y: 3, ch: "_" }]);
  const back = applyStep(theirs, [{ ...plant, x: 14 }], step, "back");
  assert.ok(back.map);
  assert.equal(tileAt(back.map, 10, 3), tileAt(studio, 10, 3), "my tile goes back");
  assert.equal(tileAt(back.map, 11, 3), "_", "theirs stays");
  assert.deepEqual(back.put, [], "their move wins");
  assert.equal(back.skipped, 2);
});

test("undo: rooms come back room by room, a resize as a whole", () => {
  const room = { key: "room-a", name: "A", kind: "private" as const, x: 2, y: 2, w: 3, h: 3 };
  const withRoom = { ...studio, areas: [...studio.areas, room] };
  const step = diffStep(snapshot(withRoom, []), snapshot(studio, []), "removed a room");
  assert.ok(step?.areas);
  // meanwhile someone renamed another room
  const other = studio.areas[0];
  const now = { ...studio, areas: studio.areas.map((a) => (a.key === other.key ? { ...a, name: "Renamed" } : a)) };
  const back = applyStep(now, [], step, "back");
  assert.ok(back.map);
  assert.ok(
    back.map.areas.some((a) => a.key === "room-a"),
    "my room is back",
  );
  assert.equal(back.map.areas.find((a) => a.key === other.key)?.name, "Renamed", "their rename stays");

  const big = resizeMap(studio, studio.width + 8, studio.height);
  const rs = diffStep(snapshot(studio, []), snapshot(big, []), "resized");
  assert.ok(rs?.full);
  const undone = applyStep(big, [], rs, "back");
  assert.equal(undone.map?.width, studio.width);
  assert.equal(diffStep(snapshot(studio, []), snapshot(studio, []), "nothing"), null);
});
