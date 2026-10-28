import assert from "node:assert/strict";
import { test } from "node:test";
import { BODY_H, between, REACH_UP, reachTo, spanOf } from "./reach.ts";

// Reach in three dimensions (docs/plan/50-the-volume.md E).

test("within the hands' band a thing's as far as it is across the floor, as ever", () => {
  const p = { x: 0, y: 0, z: 0 };
  assert.equal(reachTo(p, { x: 2, y: 0 }, 0, 0.6), 2, "a toy box on the floor");
  assert.equal(reachTo(p, { x: 2, y: 0 }, 1.5, 2), 2, "a shelf's top");
  // standing on a desk (0.64), the mug on the floor beside it: still in reach (bent down)
  assert.equal(reachTo({ x: 0, y: 0, z: 0.64 }, { x: 1, y: 0 }, 0, 0.16), Math.hypot(1, 0.48));
});

test("out of the band, the height's gap counts: a flier over the lot reaches nothing down there", () => {
  const flier = { x: 0, y: 0, z: 6 };
  // (a car's door at 0..1.5: 4.5 below the flier's feet)
  assert.ok(Math.abs(reachTo(flier, { x: 1, y: 0 }, 0, 1.5) - Math.hypot(1, 4.5)) < 1e-9);
  // and above the band: a lamp on a high wall (3.2) from the floor is 1.1 out of it
  assert.ok(Math.abs(reachTo({ x: 0, y: 0, z: 0 }, { x: 0, y: 0 }, REACH_UP + 1.1, 4) - 1.1) < 1e-9);
});

test("two bodies: their whole heights — a high-five over a gap misses, beside each other it lands", () => {
  const a = { x: 0, y: 0, z: 0 };
  assert.equal(between(a, { x: 1, y: 0, z: 0 }), 1);
  assert.equal(between(a, { x: 1, y: 0, z: 1 }), 1, "on a step: they overlap");
  assert.ok(Math.abs(between(a, { x: 1, y: 0, z: 6 }) - Math.hypot(1, 6 - BODY_H)) < 1e-9, "a flier over them");
});

test("a thing's height is its shapes': a desk to 0.64, a whiteboard where it hangs", () => {
  assert.deepEqual(spanOf({ id: "d", kind: "desk", x: 0, y: 0 }), [0, 0.64]);
  const [y0, y1] = spanOf({ id: "w", kind: "whiteboard", x: 0, y: 0 });
  assert.ok(y0 > 0.5 && y1 < 1.7, `a whiteboard ${y0}–${y1}`);
  // (hung higher up the wall: hang.ts props.wz)
  const [h0] = spanOf({ id: "w", kind: "whiteboard", x: 0, y: 0, props: { wu: 0, wz: 4 } });
  assert.ok(h0 > y0 + 0.3, `hung higher: ${h0}`);
});
