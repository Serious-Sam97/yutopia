import assert from "node:assert/strict";
import { test } from "node:test";
import { sliceOf } from "./useWheel";

// A wheel's slice by the way it's pointed (docs/plan/56-the-controls.md phase 6): clockwise from
// the top, screen x right and y down — the arrows, a stick, the pointer from the middle.

test("up is the first, right a quarter round, down half, left three quarters", () => {
  assert.equal(sliceOf(8, 0, -1), 0);
  assert.equal(sliceOf(8, 1, 0), 2);
  assert.equal(sliceOf(8, 0, 1), 4);
  assert.equal(sliceOf(8, -1, 0), 6);
  assert.equal(sliceOf(8, 1, -1), 1, "up and right: between");
  assert.equal(sliceOf(9, 0, -1), 0);
  assert.equal(sliceOf(9, -0.01, -1), 0, "just left of the top: still the first, not the last");
});
