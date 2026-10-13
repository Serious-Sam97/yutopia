import assert from "node:assert/strict";
import { test } from "node:test";
import {
  type CarState,
  laneOffset,
  newCar,
  plausibleCar,
  SLOT_GRIP,
  SLOT_HALF_WIDTH,
  SLOT_LANES,
  SLOT_LAP,
  SLOT_OFF_TIME,
  SLOT_VMAX,
  slotCurve,
  slotPath,
  slotPoint,
  slotTurn,
  stepCar,
} from "./slotcar.ts";

// A careful driver: lifts early enough to make every corner (it looks ahead as
// far as it needs to slow down).
function careful(c: CarState): number {
  let lim = SLOT_VMAX;
  for (let a = 0; a <= 1.2; a += 0.01) {
    const k = slotCurve(c.s + a);
    if (k) lim = Math.min(lim, Math.sqrt(SLOT_GRIP / k) * 0.9 + a * 3);
  }
  return c.v < lim ? 1 : 0;
}

test("the track is a closed loop that stays on its 4 × 3 table", () => {
  const a = slotPoint(0);
  const b = slotPoint(SLOT_LAP - 1e-9);
  assert.ok(Math.hypot(a.x - b.x, a.y - b.y) < 1e-6, "it closes");
  for (const off of [-SLOT_HALF_WIDTH, SLOT_HALF_WIDTH])
    for (const [x, y] of slotPath(off, 0.01)) assert.ok(x > 0.1 && x < 3.9 && y > 0.1 && y < 2.9, `${x},${y}`);
  // lanes side by side, the same gap apart, lane 0 outside
  assert.equal(laneOffset(0), -laneOffset(SLOT_LANES - 1));
  assert.ok(laneOffset(0) < 0);
  // turned tables: rot 1 puts the 3-tile side along x
  assert.deepEqual(slotTurn(0, 0, 1), [3, 0]);
  assert.deepEqual(slotTurn(4, 3, 2), [0, 0]);
});

test("flat out flies off at the first corner; a careful driver gets round", () => {
  const c = newCar();
  let flew = false;
  for (let t = 0; t < 3 && !flew; t += 1 / 60) flew = stepCar(c, 1, 1 / 60);
  assert.ok(flew, "flew off");
  assert.ok(c.s > 1.8 && c.s < 2.6, `in the first corner (${c.s})`);
  // it slides, then sits back in its slot where it left, standing still
  const at = c.s;
  stepCar(c, 1, SLOT_OFF_TIME / 2);
  assert.ok(c.off > 0);
  assert.equal(c.s, at);
  for (let t = 0; t < SLOT_OFF_TIME; t += 0.1) stepCar(c, 0, 0.1);
  assert.equal(c.off, 0);
  assert.equal(c.v, 0);

  const d = newCar();
  let time = 0;
  while (d.s < SLOT_LAP * 3 && time < 60) {
    assert.equal(stepCar(d, careful(d), 1 / 60), false, `stayed on at ${d.s.toFixed(2)}`);
    time += 1 / 60;
  }
  assert.ok(time > 9 && time < 25, `3 laps in ${time.toFixed(1)} s`);
});

test("the server only takes reports a real car could make", () => {
  const prev = { s: 1, v: 2, off: 0, ov: 0 };
  assert.ok(plausibleCar(prev, { s: 1.1, v: 2.1, off: 0, ov: 0 }, 0.05));
  assert.ok(!plausibleCar(prev, { s: 3, v: 2, off: 0, ov: 0 }, 0.05), "teleport");
  assert.ok(!plausibleCar(prev, { s: 0.5, v: 2, off: 0, ov: 0 }, 0.05), "backwards");
  assert.ok(!plausibleCar(prev, { s: 1.1, v: 9, off: 0, ov: 0 }, 0.05), "too fast");
  assert.ok(!plausibleCar(prev, { s: Number.NaN, v: 1, off: 0, ov: 0 }, 0.05));
  // through a corner flat out without flying off
  const corner = 2.3;
  assert.ok(slotCurve(corner) > 0);
  assert.ok(!plausibleCar({ s: 2.2, v: 3.9, off: 0, ov: 0 }, { s: corner, v: 3.9, off: 0, ov: 0 }, 0.05));
  assert.ok(plausibleCar({ s: 2.2, v: 3.9, off: 0, ov: 0 }, { s: 2.2, v: 0, off: 0.05, ov: 3.9 }, 0.05));
});

test("medium: a little too fast into a corner slides — lift and it's saved, hold on and it's off", () => {
  const into = () => ({ s: 1.9, v: Math.sqrt(1.25 * SLOT_GRIP * 0.55), off: 0, ov: 0, slide: 0 });
  // holding the speed through the corner
  const held = into();
  let off = false;
  for (let t = 0; t < 1 && !off; t += 1 / 60) off = stepCar(held, held.v / SLOT_VMAX + 0.05, 1 / 60);
  assert.ok(off, "held on: off it goes");
  // lifting a moment after the tail steps out
  const saved = into();
  off = false;
  for (let t = 0; t < 1 && !off; t += 1 / 60)
    off = stepCar(saved, (saved.slide ?? 0) > 0.18 ? 0 : saved.v / SLOT_VMAX + 0.05, 1 / 60);
  assert.ok(!off, "lifted: saved");
});
