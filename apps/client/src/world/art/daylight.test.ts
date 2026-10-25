import assert from "node:assert/strict";
import { test } from "node:test";
import { DARK_LEFT, darkK, daylight, outAmbient } from "./daylight";

// The pitch dark (docs/plan/44-the-night.md): all of the night out under the sky, none
// of the day; indoors keeps the hour's ambient as it was.

test("pitch dark from 21:30 to 5:00, none by day", () => {
  for (const h of [21.5, 22.5, 0, 3, 4.99]) assert.equal(daylight(h).dark, 1, `${h}h`);
  for (const h of [7, 9, 12, 16, 18.99]) assert.equal(daylight(h).dark, 0, `${h}h`);
});

test("it comes down over dusk and lifts over dawn, never back", () => {
  let last = 0;
  for (let h = 19; h <= 21.5; h += 0.25) {
    const d = daylight(h).dark;
    assert.ok(d >= last, `dusk ${h}h`);
    last = d;
  }
  last = 1;
  for (let h = 5; h <= 7; h += 0.25) {
    const d = daylight(h).dark;
    assert.ok(d <= last, `dawn ${h}h`);
    last = d;
  }
});

test("indoors keeps the hour's ambient: day and midnight as before", () => {
  assert.deepEqual(daylight(10).ambient, [1, 1, 1]);
  assert.deepEqual(daylight(0).ambient, [0.44, 0.46, 0.66]);
});

test("the sky's light outside goes evenly to what's left of it", () => {
  assert.equal(darkK(0, DARK_LEFT.land3), 1);
  assert.ok(Math.abs(darkK(1, DARK_LEFT.land3) - DARK_LEFT.land3) < 1e-12);
  assert.ok(Math.abs(darkK(0.5, 0.04) - 0.2) < 1e-12);
  // the lot by day as the rooms; at midnight next to nothing
  assert.deepEqual(outAmbient(daylight(12)), daylight(12).ambient);
  for (const v of outAmbient(daylight(0))) assert.ok(v < 0.02);
});
