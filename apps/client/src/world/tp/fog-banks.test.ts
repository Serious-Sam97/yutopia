import assert from "node:assert/strict";
import { test } from "node:test";
import { POND, RAVINE, RIVER } from "@yutopia/shared/grounds";
import { bankSheets, type Sheet, sheetGrid, sheetReady } from "./fog-banks";

// The banks (docs/plan/64-the-fog.md, F3).

const near = (s: Sheet, line: readonly (readonly [number, number])[], d: number) =>
  line.some(([x, z]) => Math.hypot(x - s.x, z - s.z) < d);

test("the sheets lie over the low places only: the river (not under the Kart Park), the ravine, the pond", () => {
  const flat = () => 0;
  const all = bankSheets(flat);
  assert.ok(all.length >= 18 && all.length <= 40, `a few dozen: ${all.length}`);
  for (const s of all) {
    const where = near(s, RIVER.line, 1) || near(s, RAVINE.line, 1) || Math.hypot(s.x - POND.cx, s.z - POND.cz) < 30;
    assert.ok(where, `${s.x.toFixed(0)}, ${s.z.toFixed(0)}`);
    assert.ok(s.z >= -640, "none north of the land's end");
  }
  // a sheet a stretch: along the river every 70 tiles or so, none piled up
  const river = all.filter((s) => near(s, RIVER.line, 1));
  assert.ok(river.length >= 10, `${river.length} on the river`);
  for (const a of river) for (const b of river) if (a !== b) assert.ok(Math.hypot(a.x - b.x, a.z - b.z) > 40);
  // lying along it, a little over its bed
  const bed = (x: number, _z: number) => -3 + 0.01 * x;
  for (const s of bankSheets(bed).filter((s) => near(s, RIVER.line, 1)))
    assert.ok(Math.abs(s.y - (bed(s.x, s.z) + 2.2)) < 1e-9);
});

test("a sheet thins out where the land comes up to it, and to its own edge: never a hard line", () => {
  const s: Sheet = { x: 0, z: 0, along: 100, across: 50, yaw: 0, y: 2, overLand: true };
  // a valley: the land rises across it, over the sheet towards the sides
  const valley = (_x: number, z: number) => Math.abs(z) * 0.2;
  const g = sheetGrid(s, valley);
  const N = Math.round(Math.sqrt(g.pos.length / 3));
  const alpha = (i: number, j: number) => g.col[(j * N + i) * 4 + 3];
  const mid = Math.floor(N / 2);
  assert.ok(alpha(mid, mid) > 0.9, "full over the bed, in the middle");
  assert.equal(alpha(mid, 0), 0, "none where the land's above it");
  assert.equal(alpha(0, mid), 0, "none at its own edge");
  // (and it falls off smoothly: no step bigger than a third between neighbours)
  for (let j = 0; j < N; j++)
    for (let i = 1; i < N; i++) assert.ok(Math.abs(alpha(i, j) - alpha(i - 1, j)) < 0.45, `${i}, ${j}`);
  // turned with the river: a sheet at 90° lies along z
  const t = sheetGrid({ ...s, yaw: Math.PI / 2 }, () => -10);
  const xs = t.pos.filter((_, i) => i % 3 === 0);
  const zs = t.pos.filter((_, i) => i % 3 === 2);
  assert.ok(Math.max(...zs) - Math.min(...zs) > 99 && Math.max(...xs) - Math.min(...xs) < 51);
});

test("a sheet waits for the land under it: never makes it (a chunk by the river is 30–50 ms)", () => {
  const s: Sheet = { x: 100, z: 0, along: 100, across: 50, yaw: 0, y: 2, overLand: true };
  assert.equal(
    sheetReady(s, () => true),
    true,
  );
  // the land made only round its middle: its ends not yet
  assert.equal(
    sheetReady(s, (x) => Math.abs(x - 100) < 20),
    false,
  );
  // none of it
  assert.equal(
    sheetReady(s, () => false),
    false,
  );
});
