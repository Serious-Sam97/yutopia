import assert from "node:assert/strict";
import { test } from "node:test";
import { STORM_WINDOW_MS, stormAt, stormIn } from "./weather.ts";

test("the storms: about every other hour, 6 to 14 minutes, coming up and dying down smoothly", () => {
  let storms = 0;
  for (let w = 0; w < 400; w++) {
    const s = stormIn(w);
    if (!s) continue;
    storms++;
    const len = (s.to - s.from) / 60_000;
    assert.ok(len >= 6 && len <= 14, `window ${w}: ${len} min`);
    assert.ok(s.from >= 0 && s.to < STORM_WINDOW_MS);
    // in the middle of it: a blizzard; before it: calm
    const t0 = w * STORM_WINDOW_MS;
    assert.equal(stormAt(t0 + (s.from + s.to) / 2 + 90_000), 1);
    assert.equal(stormAt(t0 + s.from - 1), 0);
  }
  assert.ok(storms > 140 && storms < 260, `${storms} storms in 400 hours`);
  // never a jump from one second to the next
  for (let t = 0; t < 48 * 3_600_000; t += 1000) assert.ok(Math.abs(stormAt(t + 1000) - stormAt(t)) < 0.03);
});
