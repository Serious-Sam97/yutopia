import assert from "node:assert/strict";
import { test } from "node:test";
import { endMoves, movesOp, movesWhy, planPoint, pushMoves, roomMoveOps, roomPieces, roomRemoveOps } from "./move.ts";
import { applyOps } from "./ops.ts";
import type { Room, Structure, Wall, XY } from "./types.ts";

// Plan 130 phase 2: walls' ends dragged, walls pushed, rooms moved, turned, copied, knocked down.

const wall = (id: string, a: XY, b: XY): Wall => ({ id, floor: 0, a, b, base: 0, height: 3, front: "p" });
const room = (key: string, x0: number, y0: number, x1: number, y1: number): Room => ({
  key,
  floor: 0,
  outline: [
    [x0, y0],
    [x1, y0],
    [x1, y1],
    [x0, y1],
  ],
  rect: [x0, y0, x1, y1],
  props: { name: key },
});
// two rooms side by side, A (0–5) and B (5–10), the wall at x 5 between them
const st = (): Structure => ({
  version: 4,
  key: "t",
  name: "t",
  home: 0,
  spawn: [0, 0],
  floors: [{ index: 0, name: "G", z: 0, grid: { x0: 0, y0: 0, w: 20, h: 20 } }],
  slabs: [
    { id: "fa", floor: 0, z: 0, top: ".", outline: room("x", 0, 0, 5, 4).outline, holes: [] },
    { id: "fb", floor: 0, z: 0, top: ",", outline: room("x", 5, 0, 10, 4).outline, holes: [] },
  ],
  walls: [
    wall("a-n", [0, 0], [5, 0]),
    wall("a-w", [0, 0], [0, 4]),
    wall("a-s", [0, 4], [5, 4]),
    wall("mid", [5, 0], [5, 4]),
    wall("b-n", [5, 0], [10, 0]),
    wall("b-e", [10, 0], [10, 4]),
    wall("b-s", [5, 4], [10, 4]),
  ],
  rooms: [room("a", 0, 0, 5, 4), room("b", 5, 0, 10, 4)],
});

test("a wall's end dragged: the walls joined there follow", () => {
  const s = st();
  const m = endMoves(s, 0, "a-n", "a", [1, 1]);
  assert.deepEqual(m.map((q) => q.id).sort(), ["a-n", "a-w"]);
  assert.equal(movesWhy(s, 0, m), null);
  const n = applyOps(s, [movesOp(s, m)]);
  assert.deepEqual(n.walls.find((w) => w.id === "a-w")?.a, [1, 1]);
});

test("a wall pushed: its neighbours' ends with it, ids kept", () => {
  const s = st();
  // (a-w runs (0,0)→(0,4): its left is −x; −1 pushes it out to +x… so +1 is out to −x)
  const m = pushMoves(s, 0, "a-w", 1);
  const by = new Map(m.map((q) => [q.id, q]));
  assert.deepEqual(by.get("a-w")?.a, [-1, 0]);
  assert.deepEqual(by.get("a-n")?.a, [-1, 0]);
  assert.deepEqual(by.get("a-s")?.a, [-1, 4]);
  assert.equal(movesWhy(s, 0, m), "off the floor");
  const back = pushMoves(s, 0, "a-w", -1);
  assert.equal(movesWhy(s, 0, back), null);
  // (too short: what's set in a wall keeps it long enough)
  assert.equal(movesWhy(s, 0, [{ id: "a-n", a: [0, 0], b: [0.1, 0] }]), "too short");
  assert.equal(
    movesWhy(s, 0, [{ id: "a-n", a: [0, 0], b: [2, 0] }], () => 3),
    "shorter than what's set in it",
  );
});

test("a room's pieces: its own walls, the one it shares, its floor", () => {
  const p = roomPieces(st(), "a");
  assert.ok(p);
  assert.deepEqual(p.own.map((w) => w.id).sort(), ["a-n", "a-s", "a-w"]);
  assert.deepEqual(
    p.shared.map((w) => w.id),
    ["mid"],
  );
  assert.deepEqual(
    p.slabs.map((x) => x.id),
    ["fa"],
  );
});

test("a room moved: its own walls go with it, the shared one stays and is copied", () => {
  const s = st();
  let n = 0;
  const r = roomMoveOps(
    s,
    "a",
    { d: [0, 8], turn: 0, copy: false },
    (k) => `${k}${++n}`,
    () => "a2",
  );
  assert.ok(!("why" in r));
  const t = applyOps(s, r.ops);
  assert.deepEqual(t.walls.find((w) => w.id === "a-n")?.a, [0, 8]);
  assert.ok(
    t.walls.find((w) => w.id === "mid"),
    "the shared wall stays for B",
  );
  assert.equal(t.walls.length, 8, "and a copy of it went with A");
  assert.deepEqual(t.rooms.find((q) => q.key === "a")?.rect, [0, 8, 5, 12]);
  assert.deepEqual(t.slabs.find((x) => x.id === "fa")?.outline[0], [0, 8]);
});

test("a room copied and turned: a copy a quarter round, the room as it was", () => {
  const s = st();
  let n = 0;
  const r = roomMoveOps(
    s,
    "a",
    { d: [0, 10], turn: 1, copy: true },
    (k) => `${k}${++n}`,
    () => "a2",
  );
  assert.ok(!("why" in r));
  const t = applyOps(s, r.ops);
  assert.equal(t.walls.length, 11);
  assert.ok(t.rooms.find((q) => q.key === "a"));
  const c = t.rooms.find((q) => q.key === "a2");
  assert.ok(c);
  // (5 × 4 turned: 4 × 5, about its middle (2.5, 2), moved 10 down)
  assert.deepEqual(c.rect, [0.5, 9.5, 4.5, 14.5]);
  assert.deepEqual(planPoint(r.move, [0, 0]), [4.5, 9.5]);
  assert.equal(t.slabs.length, 3);
});

test("a room knocked down: its own walls, its floor, the room — the shared wall stays", () => {
  const s = st();
  const r = roomRemoveOps(s, "a");
  assert.ok(!("why" in r));
  const t = applyOps(s, r.ops);
  assert.deepEqual(t.walls.map((w) => w.id).sort(), ["b-e", "b-n", "b-s", "mid"]);
  assert.deepEqual(
    t.slabs.map((x) => x.id),
    ["fb"],
  );
  assert.deepEqual(
    t.rooms.map((q) => q.key),
    ["b"],
  );
});
