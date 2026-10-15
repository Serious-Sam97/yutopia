import assert from "node:assert/strict";
import { test } from "node:test";
import { cornerNear, joinedFaces, otherFace, panelAt, panelKey, panelTile, runBetween } from "./faces.ts";
import { applyEdges, blankMap } from "./map-edit.ts";

// A 20 × 16 studio with a 4 × 3 room in it (walls round x 4..8, y 4..7) and a door in its south wall.
function studio() {
  const m = blankMap("t", "T", 20, 16);
  const edges = [];
  for (let x = 4; x < 8; x++)
    edges.push({ dir: "h" as const, x, y: 4, ch: "p" }, { dir: "h" as const, x, y: 7, ch: "p" });
  for (let y = 4; y < 7; y++)
    edges.push({ dir: "v" as const, x: 4, y, ch: "p" }, { dir: "v" as const, x: 8, y, ch: "p" });
  return applyEdges(m, edges);
}

test("panels: one face of one edge, the tile it looks into, the other face", () => {
  const p = { dir: "h" as const, x: 5, y: 7, side: -1 as const };
  assert.deepEqual(panelTile(p), [5, 6], "the south wall's −y face looks into the room");
  assert.deepEqual(panelTile(otherFace(p)), [5, 7]);
  assert.equal(panelKey(p), "h5,7-");
});

test("the panel under the pointer: the face the ray meets, else the floor's side of the nearest wall", () => {
  const m = studio();
  // iso ray from the south-east, onto the room's north wall inside (its +y face)
  const hit = panelAt(m, { o: { x: 7.5, y: 6.5, z: 180 }, d: { x: -1, y: -1, z: -50 } }, null);
  assert.deepEqual(hit, { dir: "h", x: 5, y: 4, side: 1 });
  // no ray: on the floor just inside the south wall → its inner (−y) face
  assert.deepEqual(panelAt(m, null, { x: 6.4, y: 6.8 }), { dir: "h", x: 6, y: 7, side: -1 });
  // …just outside → its outer face
  assert.deepEqual(panelAt(m, null, { x: 6.4, y: 7.2 }), { dir: "h", x: 6, y: 7, side: 1 });
  // the middle of the floor, no wall near
  assert.equal(panelAt(m, null, { x: 14.5, y: 10.5 }), null);
});

test("joined faces: every wall face round the space a face looks into (doors close it)", () => {
  const m = studio();
  const inside = joinedFaces(m, [], { dir: "h", x: 6, y: 7, side: -1 });
  assert.equal(inside.length, 4 + 4 + 3 + 3, "the room's 14 inner faces");
  assert.ok(
    inside.every((p) => {
      const [x, y] = panelTile(p);
      return x >= 4 && x < 8 && y >= 4 && y < 7;
    }),
  );
  // a gap in the south wall: the room joins the studio round it — closed again by a door there
  const open = applyEdges(m, [{ dir: "h", x: 6, y: 7, ch: "." }]);
  assert.ok(joinedFaces(open, [], { dir: "h", x: 5, y: 7, side: -1 }).length > 20);
  const door = { id: "d", kind: "door", x: 6, y: 7, rot: 0 };
  assert.equal(joinedFaces(open, [door], { dir: "h", x: 5, y: 7, side: -1 }).length, 13);
});

test("runs: straight between corners, along the way the pointer went further", () => {
  assert.deepEqual(cornerNear(3.4, 6.6), { x: 3, y: 7 });
  const r = runBetween({ x: 2, y: 5 }, { x: 6, y: 6 });
  assert.equal(r.dir, "h");
  assert.deepEqual(r.end, { x: 6, y: 5 }, "brought onto the start's line");
  assert.deepEqual(
    r.edges.map((e) => e.x),
    [2, 3, 4, 5],
  );
  const back = runBetween({ x: 9, y: 9 }, { x: 9, y: 6 });
  assert.equal(back.dir, "v");
  assert.deepEqual(
    back.edges.map((e) => e.y),
    [6, 7, 8],
  );
  assert.equal(runBetween({ x: 3, y: 3 }, { x: 3, y: 3 }).edges.length, 0);
});
