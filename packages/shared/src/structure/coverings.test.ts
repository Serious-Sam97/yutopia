import assert from "node:assert/strict";
import { test } from "node:test";
import { COVER, coverKey, coverOf, FLOOR_COVERINGS, WALL_COVERINGS } from "./coverings.ts";
import { wallsPaint } from "./paint.ts";
import type { Structure, Wall } from "./types.ts";

// plan 130 phase 9: coverings — a library material and its tint, on a wall's face or a floor's tile

test("the counts the plan promised, each id once", () => {
  assert.ok(WALL_COVERINGS.length >= 60, `${WALL_COVERINGS.length} walls`);
  assert.ok(FLOOR_COVERINGS.length >= 50, `${FLOOR_COVERINGS.length} floors`);
  for (const list of [WALL_COVERINGS, FLOOR_COVERINGS]) assert.equal(new Set(list.map((q) => q.id)).size, list.length);
});

test("a key: its covering, its own tint or the covering's; not one", () => {
  const k = coverKey("brick-red");
  assert.equal(k, `${COVER}brick-red`);
  assert.equal(coverOf(k, "wall")?.tint, "#ffffff");
  assert.equal(coverOf(coverKey("brick-red", "#AA3322"), "wall")?.tint, "#aa3322");
  assert.equal(coverOf("cov:brick-red#zz", "wall"), null);
  assert.equal(coverOf(k, "floor"), null, "a wall's isn't a floor's");
  assert.equal(coverOf("b", "wall"), null);
});

test("a face covered by the stretch, the other kept; a paint takes it off", () => {
  const w: Wall = { id: "w", floor: 1, a: [0, 0], b: [4, 0], front: "p", base: 0, height: 3 } as Wall;
  const s = {
    walls: [w],
    floors: [{ index: 1, z: 0, grid: { x0: 0.5, y0: 0.5, w: 10, h: 10 } }],
  } as unknown as Structure;
  let n = 0;
  const r = wallsPaint(s, 1, [{ id: "w", side: 1, from: 0, to: 4, mat: coverKey("stripe-sage") }], () => `n${n++}`);
  assert.ok("op" in r && r.op.op === "walls");
  const covered = r.op.add[0];
  assert.equal(covered.coverF, coverKey("stripe-sage"));
  assert.equal(covered.front, "p");
  const s2 = { ...s, walls: [covered] } as Structure;
  const r2 = wallsPaint(
    s2,
    1,
    [{ id: covered.id, side: -1, from: 0, to: 4, mat: coverKey("brick-white") }],
    () => `m${n++}`,
  );
  assert.ok("op" in r2 && r2.op.op === "walls");
  assert.deepEqual([r2.op.add[0].coverF, r2.op.add[0].coverB], [coverKey("stripe-sage"), coverKey("brick-white")]);
  const r3 = wallsPaint(
    { ...s, walls: [r2.op.add[0]] } as Structure,
    1,
    [{ id: r2.op.add[0].id, side: 1, from: 0, to: 4, mat: "b" }],
    () => `k${n++}`,
  );
  assert.ok("op" in r3 && r3.op.op === "walls");
  assert.deepEqual(
    [r3.op.add[0].front, r3.op.add[0].coverF, r3.op.add[0].coverB],
    ["b", undefined, coverKey("brick-white")],
  );
});
