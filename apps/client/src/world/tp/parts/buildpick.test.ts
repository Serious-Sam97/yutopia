import assert from "node:assert/strict";
import { test } from "node:test";
import { standsOn } from "./buildpick.ts";

// (plan 124, point 3) a plate on a table comes before the table under the pointer
test("a plate on a table's top stands on it; the table doesn't stand on the plate", () => {
  const table = { x0: 9.96, y0: 4.96, z0: -0.04, x1: 11.04, y1: 6.04, z1: 0.79 };
  const plate = { x0: 10.3, y0: 5.3, z0: 0.71, x1: 10.62, y1: 5.62, z1: 0.8 };
  assert.ok(standsOn(plate, table));
  assert.ok(!standsOn(table, plate));
  // a chair beside the table: not on it
  const chair = { x0: 11.1, y0: 5.0, z0: -0.04, x1: 11.6, y1: 5.5, z1: 0.95 };
  assert.ok(!standsOn(chair, table));
  // a lamp on the table, taller than it
  const lamp = { x0: 10.6, y0: 5.6, z0: 0.72, x1: 10.9, y1: 5.9, z1: 1.3 };
  assert.ok(standsOn(lamp, table));
});
