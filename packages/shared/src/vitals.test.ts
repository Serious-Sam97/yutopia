import assert from "node:assert/strict";
import { test } from "node:test";
import { drain, fill } from "./needs.ts";
import {
  canFocus,
  FULL_VITALS,
  freshClock,
  hurt,
  spendRoll,
  stepVitals,
  VITALS,
  type Vitals,
  type VitalsIn,
} from "./vitals.ts";

const OUT: VitalsIn = { sprinting: false, outside: true, night: 0, storm: 0, warm: false, focus: false };
const DT = 1 / 20;
const run = (v: Vitals, c: ReturnType<typeof freshClock>, i: VitalsIn, s: number) => {
  for (let t = 0; t < s - 1e-9; t += DT) stepVitals(v, c, i, DT);
};
const near = (a: number, b: number, e = 1e-6) => Math.abs(a - b) < e;

test("needs: drain and fill stay in 0..100; fill never pulls one down", () => {
  assert.equal(drain(10, 4, 5), 0);
  assert.equal(fill(90, 4, 5), 100);
  assert.equal(fill(50, 1, 20, 60), 60);
  assert.equal(fill(80, 1, 20, 60), 80);
});

test("a sprint outside empties stamina in 6.25 s; then winded until 25", () => {
  const v = { ...FULL_VITALS };
  const c = freshClock();
  run(v, c, { ...OUT, sprinting: true }, 6.2);
  assert.ok(v.st > 0 && v.st < 2 && !c.winded, `${v.st}`);
  run(v, c, { ...OUT, sprinting: true }, 0.1);
  assert.equal(v.st, 0);
  assert.ok(c.winded);
  // still holding sprint: nothing drains while winded, and it comes back after 0.7 s
  run(v, c, { ...OUT, sprinting: true }, 0.65);
  assert.equal(v.st, 0);
  run(v, c, { ...OUT, sprinting: true }, 0.35);
  // (the step that reaches 0.7 s already counts: 0.30–0.35 s of it)
  assert.ok(v.st >= VITALS.st.regen * 0.3 - 1e-6 && v.st <= VITALS.st.regen * 0.35 + 1e-6, `${v.st}`);
  assert.ok(c.winded);
  run(v, c, OUT, 0.8);
  assert.ok(v.st >= 25 && !c.winded, `${v.st}`);
  run(v, c, OUT, 4);
  assert.equal(v.st, 100);
});

test("stamina drains only outside", () => {
  const v = { ...FULL_VITALS };
  const c = freshClock();
  run(v, c, { ...OUT, outside: false, sprinting: true }, 10);
  assert.equal(v.st, 100);
});

test("a roll: 22 outside, free indoors, refused winded", () => {
  const v = { ...FULL_VITALS };
  const c = freshClock();
  assert.ok(spendRoll(v, c, false));
  assert.equal(v.st, 100);
  assert.ok(spendRoll(v, c, true));
  assert.equal(v.st, 78);
  v.st = 10;
  assert.ok(spendRoll(v, c, true));
  assert.equal(v.st, 0);
  assert.ok(c.winded);
  assert.equal(spendRoll(v, c, true), false);
});

test("warmth: 0.6 a minute at night, twice in a blizzard, back somewhere warm; frozen halves the regen", () => {
  const v = { ...FULL_VITALS };
  const c = freshClock();
  run(v, c, { ...OUT, night: 1 }, 60);
  assert.ok(near(v.wm, 99.4, 1e-3), `${v.wm}`);
  run(v, c, { ...OUT, night: 1, storm: 1 }, 60);
  assert.ok(near(v.wm, 98.2, 1e-3), `${v.wm}`);
  run(v, c, { ...OUT, night: 0 }, 60); // by day: nothing
  assert.ok(near(v.wm, 98.2, 1e-3));
  run(v, c, { ...OUT, warm: true }, 6);
  assert.equal(v.wm, 100);
  // frozen: stamina back at half speed — never dead of it
  const f = { ...FULL_VITALS, wm: 0, st: 0 };
  const fc = freshClock();
  run(f, fc, OUT, 1.7);
  assert.ok(near(f.st, (VITALS.st.regen / 2) * 1.7, 1e-6), `${f.st}`); // (nothing drained lately: at once)
  assert.equal(f.hp, 100);
});

test("health comes back to 60 after 8 s unhurt; the battery to 40 at 4 a second", () => {
  const v = { ...FULL_VITALS, bat: 10 };
  const c = freshClock();
  hurt(v, c, 75);
  assert.equal(v.hp, 25);
  run(v, c, OUT, 5);
  assert.ok(near(v.bat, 10 + VITALS.bat.regen * 5, 0.1), `${v.bat}`);
  run(v, c, OUT, 2.9);
  assert.equal(v.hp, 25);
  run(v, c, OUT, 60);
  assert.equal(v.hp, 60);
  assert.equal(v.bat, 40);
  run(v, c, { ...OUT, focus: true }, 1);
  assert.ok(near(v.bat, 28, 1e-6));
});

test("run out focusing: no focus until it's back to 25% (no on and off at 0)", () => {
  const v = { ...FULL_VITALS, bat: 6 };
  const c = freshClock();
  // focus as the walker and the server do: only while it can
  const focusFor = (secs: number) => {
    for (let t = 0; t < secs - 1e-9; t += DT) stepVitals(v, c, { ...OUT, focus: canFocus(v, c) }, DT);
  };
  focusFor(0.5);
  assert.equal(v.bat, 0);
  assert.equal(c.drained, true);
  // still aiming: it recharges, the focus stays off the whole way up to 25
  let flicker = 0;
  for (let t = 0; t < 8; t += DT) {
    if (canFocus(v, c)) flicker++;
    stepVitals(v, c, { ...OUT, focus: canFocus(v, c) }, DT);
    if (v.bat >= VITALS.bat.back) break;
  }
  assert.equal(flicker, 0, "never back on below 25%");
  assert.ok(v.bat >= VITALS.bat.back && v.bat < VITALS.bat.back + 1);
  assert.equal(canFocus(v, c), true);
  // 25% in ~6 s from empty
  assert.ok(VITALS.bat.back / VITALS.bat.regen <= 6.5);
  // a battery used (to 100) clears it at once
  const v2 = { ...FULL_VITALS, bat: 0 };
  const c2 = { ...freshClock(), drained: true };
  v2.bat = 100;
  stepVitals(v2, c2, OUT, DT);
  assert.equal(canFocus(v2, c2), true);
});
