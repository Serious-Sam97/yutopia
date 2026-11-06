import assert from "node:assert/strict";
import { test } from "node:test";
import { getMap } from "../index.ts";
import { WALL_H } from "../units.ts";
import { wallsEdit } from "./edit.ts";
import { finishWorld } from "./finish.ts";
import { structureFromMap } from "./from-map.ts";
import { applyOps, invertOps } from "./ops.ts";
import { rectOf, roofAt, roofFaces, roofsEdit, roofWhy } from "./roof.ts";
import type { XY } from "./types.ts";
import { viewOf } from "./view.ts";

// Phase 11.7 (docs/plan/72): roofs over closed sets of walls — flat, gable, hip.

const studio = getMap("studio");
const s0 = structureFromMap(finishWorld(studio, studio.objects, { fresh: true, building: true }).map);
const box: XY[] = [
  [20, 10],
  [28, 10],
  [28, 14],
  [20, 14],
];
// its walls, rails 1.1 high on the far side: the roof sits on the highest
let n = 0;
const w = wallsEdit(
  s0,
  3,
  box.map((a, i) => ({ a, b: box[(i + 1) % 4], front: "p" })),
  [],
  () => `rw${n++}`,
);
assert.ok("op" in w);
const s = applyOps(s0, [w.op]);
const f3z = s.floors.find((f) => f.index === 3)?.z ?? 0;

test("a rectangle any way turned is one; an L isn't", () => {
  const r = rectOf(box);
  assert.ok(r);
  assert.deepEqual([r.c, r.hu, r.hv], [[24, 12], 4, 2]);
  const turned = box.map(
    ([x, y]): XY => [x * Math.cos(0.5) - y * Math.sin(0.5), x * Math.sin(0.5) + y * Math.cos(0.5)],
  );
  assert.ok(Math.abs((rectOf(turned)?.hu ?? 0) - 4) < 1e-9);
  const L: XY[] = [
    [0, 0],
    [4, 0],
    [4, 2],
    [2, 2],
    [2, 4],
    [0, 4],
  ];
  assert.equal(rectOf(L), null);
  assert.equal(roofWhy(s, 3, { outline: L, kind: "gable" }), "a gable needs a rectangle");
  assert.equal(roofWhy(s, 3, { outline: L, kind: "hip" }), "a hip needs a rectangle or a convex room");
  assert.equal(roofWhy(s, 3, { outline: L, kind: "flat" }), null);
  assert.equal(roofWhy(s, 3, { outline: box, kind: "gable", pitch: 80 }), "not a roof's pitch");
});

test("a gable on its walls: eaves at their top, the ridge along the long side, as high as the pitch says", () => {
  const r = roofsEdit(s, 3, [{ outline: box, kind: "gable", pitch: 45 }], [], () => "roof1");
  assert.ok("op" in r);
  const roof = r.added[0];
  assert.equal(roof.z, Math.round((f3z + WALL_H) * 1000) / 1000, "on the walls' top");
  const faces = roofFaces(roof);
  assert.deepEqual(
    faces.map((f) => f.part),
    ["slope", "slope", "gable", "gable"],
  );
  const top = Math.max(...faces.flatMap((f) => f.pts.map((p) => p[2])));
  assert.ok(Math.abs(top - (roof.z + 2)) < 1e-9, "half its width up at 45°");
  // the ridge along x (the long side): its ends at y 12
  const ridge = faces[0].pts.filter((p) => Math.abs(p[2] - top) < 1e-9);
  assert.ok(
    ridge.every((p) => Math.abs(p[1] - 12) < 1e-9),
    JSON.stringify(ridge),
  );
  // turned: across
  const across = roofFaces({ ...roof, ridge: 1 })[0].pts.filter((p) => Math.abs(p[2] - (roof.z + 4)) < 1e-9);
  assert.ok(across.length === 2 && across.every((p) => Math.abs(p[0] - 24) < 1e-9), JSON.stringify(across));
  // undone: gone; found under a point
  const after = applyOps(s, [r.op]);
  assert.equal(roofAt(after, 3, [24, 12])?.id, "roof1");
  assert.equal((applyOps(after, invertOps(s, [r.op])).roofs ?? []).length, 0);
});

test("a hip on a square comes to a point; a flat one is a lid; Jolt has a lid at the eaves", async () => {
  const { buildingSolids } = await import("../physics/build.ts");
  const sq: XY[] = [
    [20, 10],
    [24, 10],
    [24, 14],
    [20, 14],
  ];
  const hip = roofFaces({ id: "h", floor: 3, outline: sq, z: 10, kind: "hip", pitch: 45 });
  const tops = hip.flatMap((f) => f.pts.filter((p) => p[2] > 11.9));
  assert.ok(tops.length && tops.every((p) => Math.abs(p[0] - 22) < 1e-9 && Math.abs(p[1] - 12) < 1e-9), "one point");
  const flat = roofFaces({ id: "f", floor: 3, outline: sq, z: 10, kind: "flat", pitch: 0 });
  assert.equal(flat[0].part, "flat");
  const r = roofsEdit(s, 3, [{ outline: box, kind: "flat" }], [], () => "lid");
  assert.ok("op" in r);
  const after = applyOps(s, [r.op]);
  const b = buildingSolids(viewOf(after), [], after);
  const lid = [...b.statics.entries()].filter(([k]) => k.startsWith("roof:3:")).flatMap(([, v]) => v.solids);
  assert.ok(lid.some((q) => q.t === "box" && Math.abs(q.x - 24) <= q.hx + 1e-6 && Math.abs(q.z - 12) <= q.hz + 1e-6));
});
