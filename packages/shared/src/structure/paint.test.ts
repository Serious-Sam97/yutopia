import assert from "node:assert/strict";
import { test } from "node:test";
import { WALL_H } from "../units.ts";
import { applyOps } from "./ops.ts";
import { movedOn, roomStretches, stretchAt, wallsPaint } from "./paint.ts";
import type { Structure, Wall } from "./types.ts";

// Plan 72 phase 11 (the tile tools retired): painting a stretch of a face, a room's faces.

const W = (id: string, a: [number, number], b: [number, number], front = "p"): Wall => ({
  id,
  floor: 0,
  a,
  b,
  base: 0,
  height: WALL_H,
  front,
});
// a long wall along y = 0 from 0 to 12, two rooms south of it (x 0–6, 6–12), split by a wall at x 6
const s: Structure = {
  version: 4,
  key: "t",
  name: "T",
  home: 0,
  spawn: [1, 1],
  floors: [{ index: 0, name: "G", z: 0, grid: { x0: 0, y0: 0, w: 12, h: 6 } }],
  slabs: [],
  walls: [W("long", [0, 0], [12, 0]), W("mid", [6, 0], [6, 6]), W("south", [0, 6], [12, 6]), W("west", [0, 0], [0, 6])],
  rooms: [
    {
      key: "a",
      floor: 0,
      outline: [
        [0, 0],
        [6, 0],
        [6, 6],
        [0, 6],
      ],
      rect: [0, 0, 6, 6],
      props: { name: "A" },
    },
  ],
};
let n = 0;
const id = () => `p${++n}`;

test("a click paints the stretch between the walls meeting it; a drag, from where it started", () => {
  const long = s.walls[0];
  assert.deepEqual(stretchAt(s, long, 2), { from: 0, to: 6 }, "up to the wall at x 6");
  assert.deepEqual(stretchAt(s, long, 9), { from: 6, to: 12 });
  const r = wallsPaint(s, 0, [{ id: "long", side: 1, from: 0, to: 6, mat: "w" }], id);
  assert.ok("op" in r);
  const after = applyOps(s, [r.op]);
  const pieces = after.walls.filter((w) => w.a[1] === 0 && w.b[1] === 0);
  assert.equal(pieces.length, 2, "split at x 6");
  const west = pieces.find((w) => w.a[0] === 0);
  const east = pieces.find((w) => w.a[0] === 6);
  assert.deepEqual([west?.front, west?.back], ["w", "p"], "its front walnut, its back as it was");
  assert.deepEqual([east?.front, east?.back], ["p", undefined], "the rest as it was");
  // a door on it at 8 m goes onto the east piece, 2 m along it
  const moved = movedOn(r.moves, { wall: "long", at: 8 });
  assert.deepEqual(moved, { wall: east?.id, at: 2 });
});

test("a stretch ending in a door: cut at the door's nearer edge, the door kept in one piece", () => {
  // (a free wall — off the cells' edges: its ends aren't rounded — 9 m long, a door from 2.5 to 3.5
  // along it; painted 0–3.2: the cut moves to 3.5, the door's nearer edge)
  const f = { ...s, walls: [W("f", [0.5, 0.5], [9.5, 0.5])] };
  const door = () => [[2.5, 3.5]] as const;
  const r = wallsPaint(f, 0, [{ id: "f", side: 1, from: 0, to: 3.2, mat: "w" }], id, door);
  assert.ok("op" in r);
  const ps = r.moves.get("f") ?? [];
  assert.deepEqual(
    ps.map((p) => [p.from, p.to]),
    [
      [0, 3.5],
      [3.5, 9],
    ],
  );
  assert.deepEqual(movedOn(r.moves, { wall: "f", at: 3 }), { wall: ps[0].id, at: 3 }, "the door on the first piece");
  // (from 2.7: nearer its start, the cut at 2.5)
  const r2 = wallsPaint(f, 0, [{ id: "f", side: 1, from: 2.7, to: 9, mat: "w" }], id, door);
  assert.ok("op" in r2);
  assert.deepEqual(
    (r2.moves.get("f") ?? []).map((p) => [p.from, p.to]),
    [
      [0, 2.5],
      [2.5, 9],
    ],
  );
});

test("all of a face: the wall kept whole; painted as it is: nothing; glass: no sides", () => {
  const r = wallsPaint(s, 0, [{ id: "west", side: -1, from: 0, to: 6, mat: "k" }], id);
  assert.ok("op" in r);
  assert.deepEqual(
    (r.op as { add: Wall[] }).add.map((w) => [w.id, w.front, w.back]),
    [["west", "p", "k"]],
  );
  assert.deepEqual(wallsPaint(s, 0, [{ id: "west", side: 1, from: 0, to: 6, mat: "p" }], id), { why: "as it is" });
  const g = { ...s, walls: [W("g", [0, 0], [4, 0], "g")] };
  assert.deepEqual(wallsPaint(g, 0, [{ id: "g", side: 1, from: 0, to: 4, mat: "w" }], id), { why: "as it is" });
});

test("a room's faces: its walls along its outline, each on the side that looks into it", () => {
  const st = roomStretches(s, "a", "b");
  const by = (wid: string) => st.filter((q) => q.id === wid);
  // the long wall's front (+y, south) looks into it, from 0 to 6
  assert.deepEqual(
    by("long").map((q) => [q.side, q.from, q.to]),
    [[1, 0, 6]],
  );
  // the wall at x 6: its west face; (+x is its front: the room's on its back)
  assert.deepEqual(
    by("mid").map((q) => q.side),
    [-1],
  );
  assert.deepEqual(
    by("south").map((q) => [q.side, q.from, q.to]),
    [[-1, 0, 6]],
  );
  assert.deepEqual(
    by("west").map((q) => q.side),
    [1],
  );
  const r = wallsPaint(s, 0, st, id);
  assert.ok("op" in r);
  const after = applyOps(s, [r.op]);
  const inside = after.walls.filter((w) => w.a[1] === 0 && w.a[0] === 0 && w.b[0] === 6)[0];
  assert.equal(inside?.front, "b");
});
