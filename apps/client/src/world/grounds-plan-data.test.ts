import assert from "node:assert/strict";
import test from "node:test";
import { planData } from "./grounds-plan-data";

// docs/plan/69-the-long-road.md, L2: the GPS draws the site plan in tiles — side by side, they're
// the plan as it was drawn whole: every pixel of the land the same, every tree on it.

test("the plan's tiles side by side are the plan drawn whole", () => {
  const R = { x0: -256, z0: -512, x1: 256, z1: 0 };
  const whole = planData(R);
  const W = R.x1 - R.x0;
  const T = 256;
  const trees = new Set<string>();
  for (let z0 = R.z0; z0 < R.z1; z0 += T)
    for (let x0 = R.x0; x0 < R.x1; x0 += T) {
      const t = planData({ x0, z0, x1: x0 + T, z1: z0 + T });
      for (let j = 0; j < T; j++)
        for (let i = 0; i < T; i++)
          for (let c = 0; c < 4; c++) {
            const a = t.land[(j * T + i) * 4 + c];
            const b = whole.land[((z0 - R.z0 + j) * W + (x0 - R.x0 + i)) * 4 + c];
            if (a !== b) assert.fail(`(${x0 + i}, ${z0 + j}) channel ${c}: ${a} ≠ ${b}`);
          }
      for (let n = 0; n < t.trees.length; n += 4) trees.add(`${t.trees[n]},${t.trees[n + 1]}`);
    }
  // (each tree of the whole in a tile: the tiles take a few metres round them too)
  for (let n = 0; n < whole.trees.length; n += 4)
    assert.ok(trees.has(`${whole.trees[n]},${whole.trees[n + 1]}`), "a tree on the plan in a tile");
  assert.ok(whole.trees.length / 4 > 1000);
});

test("zoomed out: a sample every 4 m, the same land", () => {
  const R = { x0: 0, z0: -512, x1: 512, z1: 0 };
  const far = planData(R, 4);
  assert.equal(far.land.length, (512 / 4) * (512 / 4) * 4);
  // (its colours the land's palette, shaded: not blank)
  let lit = 0;
  for (let k = 0; k < far.land.length; k += 4) if (far.land[k + 3] === 255 && far.land[k] > 0) lit++;
  assert.equal(lit, (512 / 4) ** 2);
});
