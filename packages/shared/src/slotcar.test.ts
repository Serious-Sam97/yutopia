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
  SLOT_PHYSICS,
  SLOT_TRACK_IDS,
  SLOT_VMAX,
  type SlotSetup,
  slotCurve,
  slotDiffOf,
  slotDistance,
  slotLap,
  slotPath,
  slotPoint,
  slotTrackOf,
  slotTurn,
  stepCar,
} from "./slotcar.ts";

// A careful driver: lifts early enough to make every corner (it looks ahead as
// far as it needs to slow down).
function careful(c: CarState, setup: SlotSetup = { track: "classic", diff: "medium" }): number {
  let lim = SLOT_VMAX;
  const grip = SLOT_PHYSICS[setup.diff].grip;
  for (let a = 0; a <= 1.2; a += 0.01) {
    const k = slotCurve(c.s + a, setup.track);
    if (k) lim = Math.min(lim, Math.sqrt(grip / k) * 0.9 + a * 3);
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

test("every track is a closed loop on the table, and a careful driver laps each one", () => {
  assert.ok(SLOT_TRACK_IDS.length >= 8, "a lot of tracks");
  for (const track of SLOT_TRACK_IDS) {
    const lap = slotLap(track);
    assert.ok(lap > 7 && lap < 15, `${track}: a lap of ${lap}`);
    const a = slotPoint(0, 0, track);
    const b = slotPoint(lap - 1e-9, 0, track);
    assert.ok(Math.hypot(a.x - b.x, a.y - b.y) < 1e-6, `${track} closes`);
    const dh = Math.abs(((b.h - a.h) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    assert.ok(Math.min(dh, 2 * Math.PI - dh) < 1e-6, `${track} closes its heading`);
    for (const off of [-SLOT_HALF_WIDTH, SLOT_HALF_WIDTH])
      for (const [x, y] of slotPath(off, 0.01, track))
        assert.ok(x > 0.1 && x < 3.9 && y > 0.18 && y < 2.9, `${track} on the table: ${x},${y}`);
    // the far edge stays clear of the grandstand, the front of the sponsor boards
    for (const [, y] of slotPath(0, 0.01, track)) assert.ok(y >= 0.5 - 1e-6 && y <= 2.56, `${track} rows: ${y}`);
    const c = newCar();
    let time = 0;
    const setup: SlotSetup = { track, diff: "medium" };
    while (c.s < lap * 2 && time < 60) {
      assert.equal(stepCar(c, careful(c, setup), 1 / 60, setup), false, `${track}: stayed on at ${c.s.toFixed(2)}`);
      time += 1 / 60;
    }
    assert.ok(time < 45, `${track}: 2 laps in ${time.toFixed(1)} s`);
  }
  // the one on a table: its props, the classic for none or nonsense
  assert.equal(slotTrackOf({ track: "clover" }), "clover");
  assert.equal(slotTrackOf({ track: "moon" }), "classic");
  assert.equal(slotTrackOf(undefined), "classic");
  // the middle of the table is free on the classic and busy on the crossings
  assert.ok(slotDistance(2, 1.5, "classic") > 0.5);
  assert.ok(slotDistance(2, 1.5, "clover") < 0.05);
});

test("free never leaves the slot, hard goes sooner than medium", () => {
  // free: flat out round and round, the tail out for show, never off
  const free: SlotSetup = { track: "classic", diff: "free" };
  const f = newCar();
  for (let t = 0; t < 20; t += 1 / 60) assert.equal(stepCar(f, 1, 1 / 60, free), false);
  assert.ok(f.s > slotLap() * 4, `${f.s} tiles flat out`);
  assert.equal(slotDiffOf("free"), "free");
  assert.equal(slotDiffOf("insane"), "medium");
  // hard: the speed medium just holds through the first corner is too much
  const corner = 2.3;
  const vMedium = Math.sqrt(SLOT_PHYSICS.medium.grip * 0.55 * 0.95);
  const into = (diff: "medium" | "hard") => {
    const c = { s: 2.0, v: vMedium, off: 0, ov: 0, slide: 0 };
    let off = false;
    for (let t = 0; t < 1 && !off; t += 1 / 60) off = stepCar(c, c.v / SLOT_VMAX, 1 / 60, { track: "classic", diff });
    return off;
  };
  assert.ok(slotCurve(corner) > 0);
  assert.equal(into("medium"), false, "medium holds it");
  assert.equal(into("hard"), true, "hard lets go");
  // the server: free takes a corner flat out, but never a car that left the slot
  assert.ok(plausibleCar({ s: 2.2, v: 3.9, off: 0, ov: 0 }, { s: corner, v: 3.9, off: 0, ov: 0 }, 0.05, free));
  assert.ok(!plausibleCar({ s: 2.2, v: 3.9, off: 0, ov: 0 }, { s: 2.2, v: 0, off: 0.05, ov: 3.9 }, 0.05, free));
  // another track: progress is checked on its own curves
  const eight: SlotSetup = { track: "figure8", diff: "medium" };
  const e = newCar();
  let time = 0;
  while (e.s < slotLap("figure8") && time < 30) {
    stepCar(e, careful(e, eight), 1 / 60, eight);
    time += 1 / 60;
  }
  assert.ok(e.s >= slotLap("figure8"), "a lap of the eight");
});
