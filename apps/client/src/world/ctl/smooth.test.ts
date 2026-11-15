import assert from "node:assert/strict";
import { test } from "node:test";
import { MAX_DELAY, MIN_DELAY, Smooth } from "./smooth";

// A stream at 20 Hz: sent every 50 ms on their clock (`skew` ahead of mine), come in after `lag(i)` ms — in order,
// as a websocket's do (one held up holds up those after it).
function run(s: Smooth, n: number, lag: (i: number) => number, skew = 5000, from = 0) {
  let last: number | undefined;
  let came = 0;
  const out: { t: number; now: number }[] = [];
  for (let i = from; i < from + n; i++) {
    const sent = skew + i * 50;
    const now = Math.max(came, i * 50 + lag(i));
    came = now;
    last = s.time(sent, now, last);
    out.push({ t: last, now });
    s.at(now);
  }
  return { out, last };
}

test("a steady link: 110 ms behind, as it always was", () => {
  const s = new Smooth();
  // (the server's patches: up to a tick late)
  run(s, 200, (i) => 40 + ((i * 37) % 50));
  assert.equal(s.want, MIN_DELAY);
  assert.equal(s.delay, MIN_DELAY);
});

test("bursts: deeper, so the next state is here when it's needed — never past the most", () => {
  const s = new Smooth();
  // (every fourth state 150 ms late)
  const { out } = run(s, 400, (i) => 40 + (i % 4 === 0 ? 150 : 0));
  assert.ok(s.want > 150 && s.want <= MAX_DELAY, `want ${s.want}`);
  // drawn that far behind, the state after the drawn moment is always in
  const tail = out.slice(-100);
  for (let k = 1; k < tail.length; k++) {
    const drawn = tail[k].now - s.delay;
    const next = tail.find((o) => o.t >= drawn);
    assert.ok(!next || next.now <= tail[k].now, "a state needed before it came");
  }
  const s2 = new Smooth();
  // (every tenth held up 600 ms, those after it with it)
  run(s2, 400, (i) => 40 + (i % 10 === 0 ? 600 : 0));
  assert.equal(s2.want, MAX_DELAY);
});

test("the delay eased, never stepped; back down when the link steadies", () => {
  const s = new Smooth();
  const { last } = run(s, 200, (i) => 40 + (i % 4 === 0 ? 150 : 0));
  let prev = s.delay;
  let l = last;
  for (let i = 200; i < 600; i++) {
    const now = i * 50 + 40;
    l = s.time(5000 + i * 50, now, l);
    s.at(now);
    assert.ok(Math.abs(s.delay - prev) <= 50 * 0.1 + 1e-9, "stepped");
    prev = s.delay;
  }
  assert.equal(s.delay, MIN_DELAY);
});

test("a slower link: the clocks followed within seconds, not a minute", () => {
  const s = new Smooth();
  run(s, 100, () => 40);
  const off0 = s.off;
  // (the route changes: 200 ms more, for good)
  run(s, 100, () => 240, 5000, 100);
  assert.ok(Math.abs(s.off - (off0 + 200)) < 1, `off ${s.off - off0}`);
  // a faster one: at once
  run(s, 2, () => 10, 5000, 200);
  assert.ok(Math.abs(s.off - (off0 - 30)) < 1);
});

test("each state after the one before, a stop and a start not taken for lateness", () => {
  const s = new Smooth();
  let last = s.time(1000, 100);
  last = s.time(1050, 150, last);
  // (stood still 3 s, then on)
  const t = s.time(4050, 3150, last);
  assert.ok(t > last);
  assert.equal(s.want, MIN_DELAY);
});
