import assert from "node:assert/strict";
import { test } from "node:test";
import { spDay } from "./clock.ts";
import {
  FOG_KINDS,
  fogAt,
  fogCurve,
  fogLift,
  fogOf,
  fogOn,
  fogToday,
  NO_FOG,
  rimeAt,
  STORM_WINDOW_MS,
  stormAt,
  stormIn,
} from "./weather.ts";

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

test("the morning fog: most mornings, the thick one rarest; the same day the same fog", () => {
  const n: Record<string, number> = { clear: 0, mist: 0, fog: 0, thick: 0 };
  for (let d = 0; d < 10_000; d++) {
    const m = fogOn(d);
    n[m?.kind ?? "clear"]++;
    if (m) assert.ok(m.k >= 0.7 && m.k <= 1, `day ${d}: ${m.k}`);
    assert.deepEqual(fogOn(d), m);
  }
  const share = (k: string) => n[k] / 10_000;
  assert.ok(Math.abs(share("clear") - 0.3) < 0.03, JSON.stringify(n));
  assert.ok(Math.abs(share("mist") - 0.3) < 0.03, JSON.stringify(n));
  assert.ok(Math.abs(share("fog") - 0.25) < 0.03, JSON.stringify(n));
  assert.ok(Math.abs(share("thick") - 0.15) < 0.03, JSON.stringify(n));
  // (not one kind for days on end: tomorrow's isn't today's more than by chance)
  let same = 0;
  for (let d = 0; d < 10_000; d++) if ((fogOn(d)?.kind ?? "") === (fogOn(d + 1)?.kind ?? "")) same++;
  assert.ok(same < 3500, `${same} days like the one before`);
});

test("the morning fog by the hour: none in the night or the day, thickest round sunrise, the thicker the later it goes", () => {
  for (const k of FOG_KINDS) {
    for (const h of [0, 2, 3.9, 11, 12, 15, 20, 23.9]) assert.equal(fogCurve(k, h), 0, `${k} at ${h}`);
    for (const h of [6, 6.5, 7, 7.5]) assert.equal(fogCurve(k, h), 1, `${k} at ${h}`);
    assert.ok(fogCurve(k, 5) > 0 && fogCurve(k, 5) < 1);
    // never a jump from one minute to the next
    for (let h = 0; h < 24; h += 1 / 60)
      assert.ok(Math.abs(fogCurve(k, h + 1 / 60) - fogCurve(k, h)) < 0.03, `${k} ${h}`);
  }
  // burnt off by 10:00 a mist; a fog thin by then; a thick one still there
  assert.equal(fogCurve("mist", 10), 0);
  assert.ok(fogCurve("fog", 10) > 0 && fogCurve("fog", 10) < 0.2);
  assert.ok(fogCurve("thick", 10) > 0.2 && fogCurve("thick", 10) < 0.4);
  assert.ok(fogCurve("mist", 9) < fogCurve("fog", 9) && fogCurve("fog", 9) < fogCurve("thick", 9));
});

test("the fog drawn: a mist a thin haze, a fog all of it, a thick one the wall too", () => {
  assert.deepEqual(fogOf(null), NO_FOG);
  assert.deepEqual(fogOf("mist"), { haze: 0.45, wall: 0, lift: 0 });
  assert.deepEqual(fogOf("fog"), { haze: 1, wall: 0, lift: 0 });
  assert.deepEqual(fogOf("thick"), { haze: 1, wall: 1, lift: 0 });
  let seen = 0;
  for (let d = 0; d < 400; d++) {
    const m = fogOn(d);
    assert.deepEqual(fogAt(d, 14), NO_FOG, `day ${d} at 14:00`);
    const f = fogAt(d, 7);
    if (!m) assert.deepEqual(f, NO_FOG);
    else {
      seen++;
      assert.ok(Math.abs(f.haze - fogOf(m.kind).haze * m.k) < 1e-9);
      assert.equal(f.wall > 0, m.kind === "thick");
    }
  }
  assert.ok(seen > 200);
});

test("this morning: São Paulo's day, so the morning doesn't change at midnight UTC", () => {
  // 23:00 and 01:00 UTC on one night are 20:00 and 22:00 the same day in São Paulo
  assert.deepEqual(fogToday(Date.UTC(2026, 10, 1, 23)), fogToday(Date.UTC(2026, 10, 2, 1)));
  assert.deepEqual(fogToday(Date.UTC(2026, 10, 2, 1)), fogOn(spDay(Date.UTC(2026, 10, 2, 1))));
  assert.equal(spDay(Date.UTC(2026, 10, 2, 2, 59)) + 1, spDay(Date.UTC(2026, 10, 2, 3)));
});

test("the fog lifts as it burns off: on the ground till then, its floor up as it goes", () => {
  for (const k of FOG_KINDS) {
    for (const h of [0, 4, 5, 6, 7, 7.4]) assert.equal(fogLift(k, h), 0, `${k} at ${h}`);
    assert.equal(fogLift(k, 12), 1);
    for (let h = 4; h < 12; h += 1 / 60)
      assert.ok(fogLift(k, h + 1 / 60) >= fogLift(k, h), `${k} ${h}: never back down`);
  }
  // lifting while there's still some of it: the ground clear first
  assert.ok(fogLift("fog", 9) > 0.3 && fogCurve("fog", 9) > 0.3);
  // the day's: none when the fog's gone, its lift with it while it's there
  for (let d = 0; d < 400; d++) {
    const m = fogOn(d);
    assert.equal(fogAt(d, 14).lift, 0);
    if (m) assert.equal(fogAt(d, 9).lift, fogCurve(m.kind, 9) > 0 ? fogLift(m.kind, 9) : 0);
  }
});

test("the rime on the trees: built through a foggy morning, there till noon, gone by 13:30", () => {
  for (let d = 0; d < 400; d++) {
    const m = fogOn(d);
    for (const h of [0, 3, 4.9, 13.5, 15, 22]) assert.equal(rimeAt(d, h), 0, `day ${d} at ${h}`);
    if (!m) {
      assert.equal(rimeAt(d, 10), 0);
      continue;
    }
    // all of it from 8:30 to noon, whatever the fog's done meanwhile
    assert.equal(rimeAt(d, 9), rimeAt(d, 11.9));
    assert.ok(rimeAt(d, 6) < rimeAt(d, 9));
    assert.ok(rimeAt(d, 12.75) < rimeAt(d, 12) && rimeAt(d, 12.75) > 0);
    if (m.kind === "thick") assert.ok(rimeAt(d, 10) >= 0.7);
    if (m.kind === "mist") assert.ok(rimeAt(d, 10) <= 0.35);
  }
});
