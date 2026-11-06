import assert from "node:assert/strict";
import { test } from "node:test";
import { getMap } from "../index.ts";
import { arcCircle, bowThrough, chordsOf, nearOnWall, wallLength, wallPoint, wallPoints } from "./arc.ts";
import { wallsEdit, wallWhy } from "./edit.ts";
import { floorFaces } from "./faces.ts";
import { finishWorld } from "./finish.ts";
import { structureFromMap } from "./from-map.ts";
import { applyOps, invertOps } from "./ops.ts";
import { edgeFront } from "./query.ts";
import { area2 } from "./rings.ts";
import { snapPoint } from "./snap.ts";
import type { Wall, XY } from "./types.ts";
import { viewOf } from "./view.ts";

// Phase 11.3 (docs/plan/72): walls that bow — an arc through its two ends and its middle.

const close = (p: XY, q: XY, eps = 1e-6) => Math.hypot(p[0] - q[0], p[1] - q[1]) < eps;
const w = (id: string, a: XY, b: XY, bow?: number): Wall => ({
  id,
  floor: 3,
  a,
  b,
  base: 0,
  height: 3,
  front: "p",
  ...(bow ? { bow } : {}),
});

test("an arc: its circle, its middle where the bow says, its length, its points on it", () => {
  // a half circle from (0,0) to (4,0) bowed 2 m to the left of +x: (−dy, dx) = (0, 1), so +y
  const half = w("h", [0, 0], [4, 0], 2);
  const k = arcCircle(half);
  assert.ok(k);
  assert.ok(close(k.c, [2, 0]) && Math.abs(k.r - 2) < 1e-9, `${JSON.stringify(k)}`);
  assert.ok(close(wallPoint(half, 0.5), [2, 2]), "its middle 2 m off, to the left");
  assert.ok(Math.abs(wallLength(half) - 2 * Math.PI) < 1e-9, "π r");
  const pts = wallPoints(half);
  assert.ok(close(pts[0], [0, 0]) && close(pts.at(-1) as XY, [4, 0]));
  for (const p of pts) assert.ok(Math.abs(Math.hypot(p[0] - 2, p[1]) - 2) < 1e-9, "each on the circle");
  // chords: short and few degrees each, their own ids, no bow
  const ch = chordsOf(half);
  assert.equal(ch.length, pts.length - 1);
  assert.ok(
    ch.every(
      (c, i) => c.id === `h~${i}` && c.bow === undefined && Math.hypot(c.b[0] - c.a[0], c.b[1] - c.a[1]) <= 0.5 + 1e-9,
    ),
  );
  // the other way: to the right
  assert.ok(close(wallPoint(w("r", [0, 0], [4, 0], -1), 0.5), [2, -1]));
  // straight: itself
  assert.deepEqual(
    chordsOf(w("s", [0, 0], [4, 0])).map((c) => c.id),
    ["s"],
  );
  // nearest point on it
  const n = nearOnWall(half, [2, 3]);
  assert.ok(n.d > 0.99 && n.d < 1.01 && Math.abs(n.t - 0.5) < 0.05, JSON.stringify(n));
});

test("the bow from the pointer: 0.25 m steps, a half circle at most (and snapped to one near it)", () => {
  assert.equal(bowThrough([0, 0], [4, 0], [1, 0.6], 0.25), 0.5);
  assert.equal(bowThrough([0, 0], [4, 0], [1, -0.6], 0.25), -0.5);
  assert.equal(bowThrough([0, 0], [4, 0], [2, 9], 0.25), 2, "no more than a half circle");
  assert.equal(bowThrough([0, 0], [5, 0], [2, 2.4], 0.25), 2.5, "a half circle when within a step of one");
  assert.equal(bowThrough([0, 0], [4, 0], [1, 0.33], 0), 0.33);
});

const studio = getMap("studio");
const s = structureFromMap(finishWorld(studio, studio.objects, { fresh: true, building: true }).map);

test("an arc drawn on floor 3: checked whole, an operation, off the tile map, undone", () => {
  const d = { a: [20, 10] as XY, b: [26, 10] as XY, front: "b", bow: 2 };
  assert.equal(wallWhy(s, 3, d), null);
  assert.equal(wallWhy(s, 3, { ...d, bow: 3.5 }), "bows too far");
  // (its bow off the floor though its ends are on it)
  assert.equal(wallWhy(s, 3, { a: [20, 1], b: [26, 1], front: "p", bow: -2 }), "off the floor");
  let n = 0;
  const r = wallsEdit(s, 3, [d], [], () => `a${n++}`);
  assert.ok("op" in r);
  assert.equal(r.added[0].bow, 2);
  const after = applyOps(s, [r.op]);
  // the tile map doesn't hold it (not even a straight edge where its ends lie on a line)
  const g3 = s.floors.find((f) => f.index === 3)?.grid ?? { x0: 0, y0: 0 };
  const [gx, gy] = [g3.x0, g3.y0];
  const row = (st: typeof s) =>
    [20, 21, 22, 23, 24, 25].map((x) => edgeFront(st, 3, { dir: "h", x: x + gx, y: 10 + gy })).join("");
  assert.equal(row(after), row(s));
  // the same arc again: there already; reversed it's the same arc
  assert.deepEqual(
    wallsEdit(after, 3, [d], [], () => "x"),
    { why: "there already" },
  );
  assert.deepEqual(
    wallsEdit(after, 3, [{ ...d, a: d.b, b: d.a, bow: -2 }], [], () => "x"),
    { why: "there already" },
  );
  // a straight wall along its chord isn't covered by it
  const st = wallsEdit(after, 3, [{ a: d.a, b: d.b, front: "p" }], [], () => "y");
  assert.ok("op" in st && st.added.length === 1);
  const back = applyOps(after, invertOps(s, [r.op]));
  assert.ok(!back.walls.some((q) => q.id === "a0"));
});

test("a room closed by an arc: the face runs round its bow", () => {
  // a 4 × 4 box whose north side bows 2 m out (north is −y: to the left of west→east is −y… so −2)
  const walls: Wall[] = [
    w("n", [0, 0], [4, 0], -2),
    w("e", [4, 0], [4, 4]),
    w("s", [4, 4], [0, 4]),
    w("w", [0, 4], [0, 0]),
  ];
  const faces = floorFaces({ walls }, 3);
  assert.equal(faces.length, 1);
  const a = Math.abs(area2(faces[0].outline)) / 2;
  // the box (16) and the half disc (2π), less what its chords cut off
  assert.ok(a > 16 + 2 * Math.PI - 0.15 && a < 16 + 2 * Math.PI + 1e-6, `${a}`);
});

test("snaps on an arc: its ends, the top of its bow; square off it from a point on it", () => {
  const arc = w("a", [0, 0], [4, 0], 2);
  const o = { grid: 0.5, angle: 15, walls: true };
  assert.deepEqual(snapPoint([2.1, 2.2], [9, 9], [arc], o), { p: [2, 2], kind: "middle", wall: "a" });
  // from its top, the tangent there runs along x: square is straight up (+y)
  const sq = snapPoint([2.05, 5.1], [2, 2], [arc], o);
  assert.equal(sq.kind, "square");
  assert.ok(close(sq.p, [2, 5], 1e-6), `${sq.p}`);
});

test("Jolt holds an arc along its bow: wall boxes round its top, none along its chord", async () => {
  const { buildingSolids } = await import("../physics/build.ts");
  let n = 0;
  const r = wallsEdit(s, 3, [{ a: [20, 10], b: [26, 10], front: "b", bow: 2 }], [], () => `j${n++}`);
  assert.ok("op" in r);
  const after = applyOps(s, [r.op]);
  const b = buildingSolids(viewOf(after), [], after);
  const boxes = [...b.statics.entries()]
    .filter(([k]) => k.startsWith("wall:3:"))
    .flatMap(([, v]) => v.solids)
    .filter((q) => q.t === "box");
  const near = (x: number, y: number) => boxes.some((q) => q.t === "box" && Math.hypot(q.x - x, q.z - y) < 0.35);
  // the bow 2 m to the left of +x: towards +y — its top at (23, 12)
  assert.ok(near(23, 12), "a box at the top of its bow");
  assert.ok(!near(23, 10), "none along its chord");
});
