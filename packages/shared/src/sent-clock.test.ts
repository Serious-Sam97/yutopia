import assert from "node:assert/strict";
import { test } from "node:test";
import { Allowance, SentClock, speedCap } from "./move/allow.ts";

// docs/plan/41-the-snap.md: a move counts the time on the client's clock, never ahead of ours.

const FAST = speedCap(null); // tiles / s
const JOG = 4.2;

// a jog sent every 50 ms by the client; `arrive(i)` when message i reaches the server (ms)
function run(arrive: (i: number) => number, opts: { n?: number; clock?: (i: number) => number } = {}) {
  const clock = new SentClock();
  const allow = new Allowance();
  let lastAt = arrive(0);
  let refused = 0;
  for (let i = 0; i < (opts.n ?? 60); i++) {
    const at = arrive(i);
    const dt = clock.step(opts.clock ? opts.clock(i) : 1000 + i * 50, (at - lastAt) / 1000);
    lastAt = at;
    allow.grow(dt, FAST);
    if (!allow.spend(JOG * 0.05)) refused++;
  }
  return refused;
}

test("steady: every move allowed", () => {
  assert.equal(
    run((i) => i * 50),
    0,
  );
});

test("a hiccup holds messages back and hands them over at once: still allowed", () => {
  // messages 10…(10 + hold/50) arrive together, `hold` ms late
  for (const hold of [300, 1000, 2500])
    assert.equal(
      run((i) => (i >= 10 && i * 50 < 500 + hold ? 500 + hold : i * 50)),
      0,
      `${hold} ms`,
    );
});

test("arrival time alone (the old way) refused the same hiccup", () => {
  const allow = new Allowance();
  let refused = 0;
  const arrive = (i: number) => (i >= 10 && i * 50 < 800 ? 800 : i * 50);
  for (let i = 1; i < 60; i++) {
    allow.grow((arrive(i) - arrive(i - 1)) / 1000, FAST);
    if (!allow.spend(JOG * 0.05)) refused++;
  }
  assert.ok(refused > 0);
});

test("a clock run fast gains no more than `ahead`", () => {
  const clock = new SentClock();
  let counted = 0;
  // the client claims 100 ms between messages sent 50 ms apart, for 10 s
  for (let i = 1; i <= 200; i++) counted += clock.step(1000 + i * 100, 0.05);
  assert.ok(counted <= 200 * 0.05 + 0.25 + 1e-9, `${counted}`);
});

test("held back longer than `behind`: what's over is let go", () => {
  const clock = new SentClock(0.25, 3);
  clock.step(0, 0);
  // 10 s with no message reaching us, then 200 at once covering those 10 s
  let counted = clock.step(50, 10);
  for (let i = 2; i <= 200; i++) counted += clock.step(i * 50, 0);
  assert.ok(counted <= 3 + 0.25 + 0.05 + 1e-9, `${counted}`);
});

test("no stamp (an older client): the server's time", () => {
  const clock = new SentClock();
  assert.equal(clock.step(undefined, 0.3), 0.3);
  assert.equal(clock.step(Number.NaN, 0.2), 0.2);
});

test("the stamp wraps (uint32 ms) and goes on; one older than the last counts nothing", () => {
  const clock = new SentClock();
  clock.step(0xffffffff - 20, 0);
  assert.ok(Math.abs(clock.step(29, 0.05) - 0.05) < 1e-9);
  assert.equal(clock.step(10, 0.05), 0);
});
