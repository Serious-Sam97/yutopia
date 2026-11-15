import assert from "node:assert/strict";
import { test } from "node:test";
import { REACH, reachFor } from "./reach";

// How far things are made (docs/plan/91-the-big-map.md phase 6): High, Medium and Low as they were.

test("High, Medium and Low reach as before plan 91; Lowest and Potato nearer", () => {
  for (const q of ["high", "medium", "low"] as const) assert.deepEqual(reachFor(q, 16), { land: 440, districts: 900 });
  assert.ok(REACH.lowest.districts < 900);
  assert.ok(REACH.potato.land < 440 && REACH.potato.districts < REACH.lowest.districts);
});

test("4 GB or less: the districts no further than Lowest's", () => {
  assert.equal(reachFor("high", 4).districts, REACH.lowest.districts);
  assert.equal(reachFor("high", 4).land, 440);
  assert.equal(reachFor("potato", 2).districts, REACH.potato.districts);
});
