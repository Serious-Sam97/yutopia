import assert from "node:assert/strict";
import { test } from "node:test";
import { applyEdges, blankMap, type MapDef } from "@yutopia/shared";
import { touchedWalls } from "./build";

// A wall built or taken away redraws only the wall pieces it touches (docs/plan/72-the-3d-core.md,
// phase 2; World3.relayout): the pieces holding an edge that changed or one meeting it at either
// end (its end clipped to the post there), and the posts' — in the old layout and the new. (That
// the floor drawn so is the floor built afresh is e2e/wall-hitch.mts VERIFY's: it needs a canvas.)

const room = (): MapDef => {
  const m = blankMap("t", "t", 24, 24);
  // a 4 × 3 room at (2, 2): walls round it
  const edges = [];
  for (let x = 2; x < 6; x++)
    edges.push({ dir: "h" as const, x, y: 2, ch: "p" }, { dir: "h" as const, x, y: 5, ch: "p" });
  for (let y = 2; y < 5; y++)
    edges.push({ dir: "v" as const, x: 2, y, ch: "p" }, { dir: "v" as const, x: 6, y, ch: "p" });
  return applyEdges(m, edges);
};

test("nothing changed: nothing touched", () => {
  const m = room();
  const t = touchedWalls(m, m);
  assert.equal(t.keys.size, 0);
  assert.equal(t.box, null);
});

test("a wall put on an open edge far from others: its own low part and run, and its posts' only", () => {
  const a = room();
  const b = applyEdges(a, [{ dir: "h", x: 15, y: 15, ch: "p" }]);
  const t = touchedWalls(a, b);
  // (its east end, x 16, is the next 8 m cell's: the post there is drawn in that cell)
  assert.deepEqual([...t.keys].sort(), ["low|1,1", "low|2,1", "run|h|15|3"]);
  assert.deepEqual(t.box, { x0: 15, y0: 15, x1: 16, y1: 15 });
});

test("a wall joining the room's corner: the room's walls meeting there are touched too", () => {
  const a = room();
  // on, from the room's north-east corner (6, 2) eastwards
  const b = applyEdges(a, [{ dir: "h", x: 6, y: 2, ch: "p" }]);
  const t = touchedWalls(a, b);
  // the new edge's pieces, the north wall's run its last edge (x 5) is in, the east wall's (x 6)
  for (const k of ["run|h|2|1", "run|v|6|0", "low|0,0"]) assert.ok(t.keys.has(k), k);
  // nothing of the far side of the room
  assert.ok(!t.keys.has("run|v|2|0"));
});

test("a wall taken away: the pieces it was in, from the old layout", () => {
  const a = room();
  const b = applyEdges(a, [{ dir: "v", x: 2, y: 3, ch: "." }]);
  const t = touchedWalls(a, b);
  assert.ok(t.keys.has("run|v|2|0"));
  assert.ok(t.keys.has("low|0,0"));
  assert.deepEqual(t.box, { x0: 2, y0: 3, x1: 2, y1: 4 });
});
