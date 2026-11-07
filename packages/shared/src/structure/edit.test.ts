import assert from "node:assert/strict";
import { test } from "node:test";
import { getMap } from "../index.ts";
import { WALL_H } from "../units.ts";
import { uncovered, wallsEdit, wallWhy } from "./edit.ts";
import { finishWorld } from "./finish.ts";
import { structureFromMap } from "./from-map.ts";
import { applyOps, invertOps } from "./ops.ts";
import { edgeFront } from "./query.ts";
import { snapPoint } from "./snap.ts";
import type { Wall } from "./types.ts";
import { viewOf } from "./view.ts";

// Phase 11 (docs/plan/72): walls drawn free — what the tool may put down, the operation it makes, and
// where the pointer snaps.

const studio = getMap("studio");
const s = structureFromMap(finishWorld(studio, studio.objects, { fresh: true, building: true }).map);

test("a wall at 45° on floor 3: it fits, it's an operation, and undone it's gone", () => {
  const d = { a: [14, 8] as [number, number], b: [18, 12] as [number, number], front: "p" };
  assert.equal(wallWhy(s, 3, d), null);
  let n = 0;
  const r = wallsEdit(s, 3, [d], [], () => `t${n++}`);
  assert.ok("op" in r);
  const after = applyOps(s, [r.op]);
  const w = after.walls.find((q) => q.id === "t0");
  assert.ok(w, "it's in");
  assert.deepEqual([w.a, w.b, w.floor, w.height], [[14, 8], [18, 12], 3, Math.round(WALL_H * 1000) / 1000]);
  assert.equal(w.base, s.floors.find((f) => f.index === 3)?.z, "on its floor's height");
  const back = applyOps(after, invertOps(s, [r.op]));
  assert.equal(back.walls.length, s.walls.length);
  assert.ok(!back.walls.some((q) => q.id === "t0"), "undone");
});

test("what it won't take: too short, off the floor, no such material, too high, no such wall", () => {
  const ok = { a: [14, 8] as [number, number], b: [18, 8] as [number, number], front: "p" };
  assert.equal(wallWhy(s, 3, { ...ok, b: [14.1, 8] }), "too short");
  assert.equal(wallWhy(s, 3, { ...ok, b: [400, 8] }), "too long");
  assert.equal(wallWhy(s, 3, { ...ok, a: [-30, 8] }), "off the floor");
  assert.equal(wallWhy(s, 3, { ...ok, front: "z" }), "not a wall's material");
  assert.equal(wallWhy(s, 3, { ...ok, height: 9 }), "not a wall's height");
  assert.equal(wallWhy(s, 42, ok), "no such floor");
  const r = wallsEdit(s, 3, [], ["nope"], () => "x");
  assert.deepEqual(r, { why: "no such wall" });
});

test("the snaps: an end, a middle, 15° steps, square off a wall, its line carried on, the grid", () => {
  const w = (id: string, a: [number, number], b: [number, number]): Wall => ({
    id,
    floor: 3,
    a,
    b,
    base: 0,
    height: 3,
    front: "p",
  });
  const walls = [w("x", [10, 10], [20, 10])];
  const o = { grid: 0.5, angle: 15, walls: true };
  // near an end, near the middle
  assert.deepEqual(snapPoint([19.8, 10.2], [16, 16], walls, o), { p: [20, 10], kind: "end", wall: "x" });
  assert.deepEqual(snapPoint([15.1, 9.8], [16, 16], walls, o), { p: [15, 10], kind: "middle", wall: "x" });
  // from a free corner: the angle in 15° steps, the length in 0.5 m
  const a = snapPoint([3 + 4.02, 3 + 2.4], [3, 3], walls, o);
  assert.equal(a.kind, "angle");
  const ang = (Math.atan2(a.p[1] - 3, a.p[0] - 3) * 180) / Math.PI;
  assert.ok(Math.abs(ang - 30) < 0.02, `30°: ${ang}`); // (to the mm)
  assert.ok(Math.abs(Math.hypot(a.p[0] - 3, a.p[1] - 3) - 4.5) < 1e-3, "4.5 m");
  // from the middle of the wall, straight off it: square
  const sq = snapPoint([15.2, 13.1], [15, 10], walls, o);
  assert.equal(sq.kind, "square");
  assert.ok(Math.abs(sq.p[0] - 15) < 1e-9 && Math.abs(sq.p[1] - 13) < 1e-9, `${sq.p}`);
  // along y from (25, 4), coming down past the wall's line carried on (y 10, x 25 past its end at 20)
  const line = snapPoint([25.05, 10.2], [25, 4], walls, o);
  assert.equal(line.kind, "line");
  assert.ok(Math.abs(line.p[1] - 10) < 1e-9 && Math.abs(line.p[0] - 25) < 1e-9, `${line.p}`);
  // no corner yet, nothing near: the grid; Shift (nothing on): where it is
  assert.deepEqual(snapPoint([3.3, 7.8], null, walls, o), { p: [3.5, 8], kind: "grid" });
  assert.deepEqual(snapPoint([3.3, 7.8], null, walls, { grid: 0, angle: 0, walls: false }), {
    p: [3.3, 7.8],
    kind: "free",
  });
});

test("drawn over walls that are there: only where there's none; all of it there: refused", () => {
  const w = (id: string, a: [number, number], b: [number, number]): Wall => ({
    id,
    floor: 3,
    a,
    b,
    base: 0,
    height: 3,
    front: "p",
  });
  const there = [w("x", [10, 10], [14, 10]), w("y", [16, 10], [17, 10])];
  assert.deepEqual(uncovered(there, [8, 10], [20, 10]), [
    [
      [8, 10],
      [10, 10],
    ],
    [
      [14, 10],
      [16, 10],
    ],
    [
      [17, 10],
      [20, 10],
    ],
  ]);
  assert.deepEqual(uncovered(there, [12, 10], [11, 10]), [], "inside one");
  assert.deepEqual(
    uncovered(there, [10, 11], [14, 11]),
    [
      [
        [10, 11],
        [14, 11],
      ],
    ],
    "a line off",
  );
  // the studio's floor 3: a run along a wall that's there, then one past its end
  const f3 = s.walls.find((q) => q.id === "w3-h29-12") as Wall; // (12, 29)–(14, 29)
  let n = 0;
  assert.deepEqual(
    wallsEdit(s, 3, [{ a: f3.a, b: f3.b, front: "b" }], [], () => `n${n++}`),
    { why: "there already" },
  );
  const r = wallsEdit(s, 3, [{ a: f3.a, b: [f3.b[0] + 2, f3.b[1]], front: "b" }], [], () => `n${n++}`);
  assert.ok("op" in r);
  assert.equal(r.added.length, 1);
  assert.deepEqual([r.added[0].a, r.added[0].b], [f3.b, [f3.b[0] + 2, f3.b[1]]]);
});

test("a wall's height and thickness: drawn with them, changed later keeping its id, off the tile map", async () => {
  const { wallsSet } = await import("./edit.ts");
  const { buildingSolids } = await import("../physics/build.ts");
  let n = 0;
  // a rail, 0.1 thick, on whole metres
  const r = wallsEdit(s, 3, [{ a: [20, 10], b: [24, 10], front: "p", height: 1.1, thick: 0.1 }], [], () => `t${n++}`);
  assert.ok("op" in r);
  assert.deepEqual([r.added[0].height, r.added[0].thick], [1.1, 0.1]);
  assert.equal(wallWhy(s, 3, { a: [20, 10], b: [24, 10], front: "p", thick: 0.15 }), "not a wall's thickness");
  assert.equal(wallWhy(s, 3, { a: [20, 10], b: [24, 10], front: "p", height: 0.3 }), "not a wall's height");
  // the usual thickness isn't kept (it's WALL_T)
  const u = wallsEdit(s, 3, [{ a: [20, 12], b: [24, 12], front: "p", thick: 0.2 }], [], () => "u");
  assert.ok("op" in u && u.added[0].thick === undefined);
  const after = applyOps(s, [r.op]);
  // the tile map has no edge for it (a map edit would make it full height again)
  const g3 = s.floors.find((f) => f.index === 3)?.grid ?? { x0: 0, y0: 0 };
  const [gx, gy] = [g3.x0, g3.y0];
  const row = (st: typeof s) =>
    [20, 21, 22, 23].map((x) => edgeFront(st, 3, { dir: "h", x: x + gx, y: 10 + gy })).join("");
  assert.equal(row(after), row(s));
  // Jolt: a box 0.1 thick, 1.1 high
  const b = buildingSolids(viewOf(after), [], after);
  const box = [...b.statics.entries()]
    .filter(([k]) => k.startsWith("wall:3:"))
    .flatMap(([, v]) => v.solids)
    .find((q) => q.t === "box" && Math.abs(q.z - 10) < 1e-6 && q.x > 20 && q.x < 24);
  assert.ok(box && box.t === "box");
  assert.ok(Math.abs(box.hz - 0.05) < 1e-9 && Math.abs(box.hy * 2 - 1.1) < 1e-6, JSON.stringify(box));
  // changed: up to the ceiling, 0.3 thick — the same wall (its id), undone back
  const set = wallsSet(after, 3, [{ id: "t0", height: WALL_H, thick: 0.3 }]);
  assert.ok("op" in set);
  const up = applyOps(after, [set.op]);
  const w = up.walls.find((q) => q.id === "t0");
  assert.deepEqual([w?.height, w?.thick], [Math.round(WALL_H * 1000) / 1000, 0.3]);
  assert.deepEqual(
    applyOps(up, invertOps(after, [set.op])).walls.find((q) => q.id === "t0"),
    r.added[0],
  );
  assert.deepEqual(wallsSet(after, 3, [{ id: "t0", height: 1.1 }]), { why: "as it is" });
  assert.deepEqual(wallsSet(after, 3, [{ id: "nope", height: 2 }]), { why: "no such wall" });
  assert.deepEqual(wallsSet(after, 3, [{ id: "t0", height: 9 }]), { why: "not a wall's height" });
  // (a door in it, 2.1 m up: no lower than that — higher's fine)
  const door = (id: string) => (id === "t0" ? 2.1 : 0);
  const tall = applyOps(after, [set.op]);
  assert.deepEqual(wallsSet(tall, 3, [{ id: "t0", height: 1.1 }], door), { why: "lower than what's set in it" });
  assert.ok("op" in wallsSet(tall, 3, [{ id: "t0", height: 2.4 }], door));
  // (on a mezzanine 1.5 up: its top under the ceiling)
  const mezz = { ...after, walls: after.walls.map((q) => (q.id === "t0" ? { ...q, base: q.base + 1.5 } : q)) };
  assert.deepEqual(wallsSet(mezz, 3, [{ id: "t0", height: WALL_H }]), { why: "too high up there" });
  // (a low wall on the floor under that rail, on its line: not there already — the rail's up above)
  const under = wallsEdit(mezz, 3, [{ a: [20, 10], b: [24, 10], front: "p", height: 1.1 }], [], () => "low");
  assert.ok("op" in under && under.added.length === 1, JSON.stringify(under));
  // (and on the floor where one stands already: there already)
  assert.deepEqual(
    wallsEdit(after, 3, [{ a: [20, 10], b: [24, 10], front: "p", height: 1.1 }], [], () => "x"),
    { why: "there already" },
  );
});

test("a face painted: the back alone, then the front keeping the back; glass has no sides", async () => {
  const { wallsSet } = await import("./edit.ts");
  let n = 0;
  const r = wallsEdit(s, 3, [{ a: [20, 10], b: [24, 13], front: "p" }], [], () => `pf${n++}`);
  assert.ok("op" in r);
  const a = applyOps(s, [r.op]);
  const b1 = wallsSet(a, 3, [{ id: "pf0", back: "b" }]);
  assert.ok("op" in b1);
  const a1 = applyOps(a, [b1.op]);
  const w1 = a1.walls.find((q) => q.id === "pf0");
  assert.deepEqual([w1?.front, w1?.back], ["p", "b"]);
  const f2 = wallsSet(a1, 3, [{ id: "pf0", front: "w" }]);
  assert.ok("op" in f2);
  const w2 = applyOps(a1, [f2.op]).walls.find((q) => q.id === "pf0");
  assert.deepEqual([w2?.front, w2?.back], ["w", "b"]);
  // painting a face the colour it is: as it is
  assert.deepEqual(wallsSet(a1, 3, [{ id: "pf0", back: "b" }]), { why: "as it is" });
  const g = wallsEdit(s, 3, [{ a: [20, 15], b: [24, 15], front: "g" }], [], () => "gl");
  assert.ok("op" in g);
  assert.deepEqual(wallsSet(applyOps(s, [g.op]), 3, [{ id: "gl", front: "b" }]), { why: "no sides to paint" });
});
