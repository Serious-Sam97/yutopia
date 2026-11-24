import assert from "node:assert/strict";
import { test } from "node:test";
import { applyEdits, BUILDINGS, CHUNK } from "../grounds.ts";
import { encodeHeights, type GroundsEdits, NO_EDITS } from "../grounds-edits.ts";
import { fixedGroundSolids, solidsInSteps } from "./grounds.ts";

// The fixed solids' pieces kept from one edit to the next (docs/plan/122): after each edit the list as kept is the
// list made again whole — a hill under the bakery (its building, Main Street's pavements on it), a road added
// and taken away, a lamp gone, the edits gone.
const bakery = BUILDINGS.find((b) => b.key === "bakery");
assert.ok(bakery);
const at = { cx: Math.floor((bakery.x0 + bakery.x1) / 2 / CHUNK), cz: Math.floor((bakery.z0 + bakery.z1) / 2 / CHUNK) };
function hill(top: number): string {
  const n = CHUNK * 2 + 1;
  const a = new Int16Array(n * n);
  for (let j = 0; j < n; j++)
    for (let i = 0; i < n; i++) {
      const d = Math.hypot(i - (n - 1) / 2, j - (n - 1) / 2) / ((n - 1) / 2);
      a[j * n + i] = Math.round(Math.max(0, 1 - d) * top * 100);
    }
  return encodeHeights(a);
}
const road = {
  key: "god-kept-1",
  kind: "road" as const,
  name: "Kept Road",
  w: 7,
  pts: [
    [-150, -150],
    [-100, -120],
  ] as [number, number][],
};
const steps: GroundsEdits[] = [
  { rev: 1, height: { [`${at.cx},${at.cz}`]: hill(3) } },
  { rev: 2, height: { [`${at.cx},${at.cz}`]: hill(3) }, ways: { add: [road] } },
  { rev: 3, height: { [`${at.cx},${at.cz}`]: hill(1.5) }, ways: { add: [road] }, things: { remove: ["lamp:gate"] } },
  { rev: 4, things: { remove: ["lamp:gate"] } },
  NO_EDITS,
];

test("kept solids: the list after each edit is the list made again whole", () => {
  applyEdits(NO_EDITS);
  const first = JSON.stringify(fixedGroundSolids(true));
  let moved = 0;
  for (const e of steps) {
    applyEdits(e);
    const kept = JSON.stringify(fixedGroundSolids());
    const whole = JSON.stringify(fixedGroundSolids(true));
    assert.equal(kept, whole, `rev ${e.rev}`);
    if (whole !== first) moved++;
  }
  // (the edits did move them: the hill's building, the road's pavements)
  assert.ok(moved >= 3, `moved ${moved}`);
  assert.equal(JSON.stringify(fixedGroundSolids()), first);
});

test("kept solids: made a step at a time after an edit, the same as made at once — an edit laid midway too", () => {
  applyEdits(NO_EDITS);
  fixedGroundSolids(true);
  applyEdits(steps[0]);
  const step = solidsInSteps();
  let n = 0;
  while (!step()) {
    n++;
    // (another edit laid halfway: the steps begin again for it)
    if (n === 20) applyEdits(steps[1]);
    assert.ok(n < 10_000);
  }
  assert.ok(n > 20, `${n} steps`);
  const stepped = JSON.stringify(fixedGroundSolids());
  assert.equal(stepped, JSON.stringify(fixedGroundSolids(true)));
  applyEdits(NO_EDITS);
});
