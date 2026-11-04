import assert from "node:assert/strict";
import { test } from "node:test";
import { Quaternion, Vector3 } from "three";
import { CarPlayback, type PlaybackSample } from "./playback";

// 2026-11-04: riding with a driver at 9–13 fps (frames to half a second, their line's ping to 1.3 s),
// the passenger was pulled back again and again. A synthetic ride: the driver's frames and their sim's
// 0.25 s cap (cars.ts), sends at most 20 a second, a line that holds states back and lets them go in
// a burst, the server's 20 Hz patches (only the newest state in each), the passenger at 60 fps.

const SPEED = 20; // m/s
// the road: straight down +x, or round a bend of 60 m (a whole circle in ~19 s)
const R = 60;
let bend = false;
const truthAt = (st: number) => {
  if (!bend) return new Vector3((st / 1000) * SPEED, 0.6, 0);
  const a = ((st / 1000) * SPEED) / R;
  return new Vector3(R * Math.sin(a), 0.6, R * (1 - Math.cos(a)));
};
const velAt = (st: number) => {
  if (!bend) return new Vector3(SPEED, 0, 0);
  const a = ((st / 1000) * SPEED) / R;
  return new Vector3(SPEED * Math.cos(a), 0, SPEED * Math.sin(a));
};
/** How far along the road a point is (m). */
let lap = 0;
let lastA = 0;
const along = (p: Vector3) => {
  if (!bend) return p.x;
  const a = Math.atan2(p.x, R - p.z);
  if (a - lastA < -Math.PI) lap++;
  if (a - lastA > Math.PI) lap--;
  lastA = a;
  return (a + lap * 2 * Math.PI) * R;
};
const onRoad = (b: boolean) => {
  bend = b;
  lap = 0;
  lastA = 0;
};

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

interface Arrival {
  at: number; // when the passenger has it (a patch)
  s: PlaybackSample;
}

/** The driver's states as the passenger gets them, over `ms`. */
function ride(o: { ms: number; seed: number; slow: boolean; badLine: boolean; stZero?: boolean }): Arrival[] {
  const r = rng(o.seed);
  const sent: { at: number; s: PlaybackSample }[] = [];
  let now = 0;
  let st = 1;
  let sentAt = -Infinity;
  while (now < o.ms) {
    // a frame: ~100 ms (9–13 fps), one in eight a hitch of 300–500 ms; a smooth driver 16 ms
    const frame = o.slow ? (r() < 0.125 ? 300 + r() * 200 : 75 + r() * 35) : 16.7;
    now += frame;
    st += Math.min(frame, 250); // (the sim's cap: a long frame moves it only a quarter of a second)
    if (now - sentAt >= 50) {
      sentAt = now;
      const p = truthAt(st);
      sent.push({
        at: now,
        s: { st: o.stZero ? 0 : Math.round(st), p, q: new Quaternion(), v: velAt(st) },
      });
    }
  }
  // the line: in order (a WebSocket), 30 ms plus jitter; a bad one also holds things up now and then
  let last = 0;
  let holdUntil = -1;
  const got = sent.map(({ at, s }) => {
    if (o.badLine && r() < 0.02) holdUntil = at + 400 + r() * 900;
    let a = at + 30 + (o.badLine ? r() * 250 : r() * 10);
    if (a < holdUntil) a = holdUntil;
    last = Math.max(last, a);
    return { at: last, s };
  });
  // the server's patches: every 50 ms, the newest state that's come
  const out: Arrival[] = [];
  let i = 0;
  for (let tick = 50; tick < o.ms + 3000; tick += 50) {
    let newest: Arrival | null = null;
    while (i < got.length && got[i].at <= tick) newest = { at: tick, s: got[i++].s };
    if (newest) out.push(newest);
  }
  return out;
}

/** The old way (cars.ts poseRemote before 2026-11-04): stamped when they come, drawn 110 ms back. */
function oldWay(arrivals: Arrival[], ms: number): number[] {
  const buf: { t: number; p: Vector3; v: Vector3 }[] = [];
  const xs: number[] = [];
  let i = 0;
  for (let now = 0; now < ms; now += 1000 / 60) {
    while (i < arrivals.length && arrivals[i].at <= now) {
      buf.push({ t: now, p: arrivals[i].s.p, v: arrivals[i].s.v });
      if (buf.length > 12) buf.shift();
      i++;
    }
    if (!buf.length) continue;
    const at = now - 110;
    let s0 = buf[0];
    let s1 = buf[buf.length - 1];
    for (let k = 0; k < buf.length - 1; k++)
      if (buf[k].t <= at && buf[k + 1].t >= at) {
        s0 = buf[k];
        s1 = buf[k + 1];
        break;
      }
    let x: number;
    if (at >= s1.t) x = s1.p.x + s1.v.x * Math.min(0.25, (at - s1.t) / 1000);
    else if (at <= s0.t || s0 === s1) x = s0.p.x;
    else {
      const T = (s1.t - s0.t) / 1000;
      const u = (at - s0.t) / (s1.t - s0.t);
      x =
        (2 * u ** 3 - 3 * u ** 2 + 1) * s0.p.x +
        (u ** 3 - 2 * u ** 2 + u) * T * s0.v.x +
        (-2 * u ** 3 + 3 * u ** 2) * s1.p.x +
        (u ** 3 - u ** 2) * T * s1.v.x;
    }
    xs.push(x);
  }
  return xs;
}

function newWay(arrivals: Arrival[], ms: number, pb = new CarPlayback<PlaybackSample>()) {
  const xs: number[] = [];
  const errs: number[] = [];
  let i = 0;
  const dt = 1 / 60;
  for (let now = 0; now < ms; now += dt * 1000) {
    while (i < arrivals.length && arrivals[i].at <= now) {
      pb.push(arrivals[i].s, now, 0);
      i++;
    }
    if (!pb.buf.length) continue;
    const { pose } = pb.pose(now, dt);
    xs.push(along(pose.p));
    // how far from where the driver's car really was at that moment of its clock
    errs.push(pose.p.distanceTo(truthAt(pb.rt)));
  }
  return { xs, errs, pb };
}

/** Backward steps (m) bigger than a centimetre, and the biggest. */
function backs(xs: number[]) {
  let n = 0;
  let worst = 0;
  for (let k = 1; k < xs.length; k++) {
    const d = xs[k] - xs[k - 1];
    if (d < -0.01) {
      n++;
      worst = Math.max(worst, -d);
    }
  }
  return { n, worst };
}

/** The biggest step forward (m) in a frame. */
const leap = (xs: number[]) => xs.slice(1).reduce((m, x, k) => Math.max(m, x - xs[k]), 0);

test("a slow driver on a bad line: the old way pulls the passenger back; played on the driver's clock, never", () => {
  const ms = 60_000;
  onRoad(false);
  for (const seed of [1, 2, 3]) {
    const arr = ride({ ms, seed, slow: true, badLine: true });
    const old = backs(oldWay(arr, ms));
    assert.ok(
      old.n > 20 && old.worst > 0.5,
      `the old way's pulls back (seed ${seed}): ${old.n}, worst ${old.worst.toFixed(2)} m`,
    );
    const { xs, errs, pb } = newWay(arr, ms);
    const now = backs(xs);
    assert.equal(now.n, 0, `pulled back ${now.n} times (seed ${seed}), worst ${now.worst.toFixed(3)} m`);
    // no lurch forward either: a late state caught up to at no more than twice its pace
    assert.ok(leap(xs) < ((2 * SPEED + 2.5) / 60) * 1.05, `a leap of ${leap(xs).toFixed(2)} m`);
    // where the driver had it at that moment of their clock (after the first seconds): mostly
    // right there, and within a few metres while a line held up for a second is caught up with
    const e = errs.slice(300).sort((a, b) => a - b);
    const pc = (k: number) => e[Math.floor(e.length * k)];
    assert.ok(pc(0.5) < 0.1 && pc(0.95) < 3, `p50 ${pc(0.5).toFixed(2)} m, p95 ${pc(0.95).toFixed(2)} m`);
    assert.ok(pb.delay <= 600);
  }
});

test("a slow driver (9–13 fps, half-second frames) on a good line, round a bend: smooth, where they had it", () => {
  const ms = 40_000;
  for (const b of [false, true]) {
    onRoad(b);
    for (const seed of [4, 5]) {
      const arr = ride({ ms, seed, slow: true, badLine: false });
      const { xs, errs, pb } = newWay(arr, ms);
      assert.equal(backs(xs).n, 0, `pulled back (bend ${b}, seed ${seed})`);
      assert.ok(leap(xs) < ((2 * SPEED + 2.5) / 60) * 1.05, `a leap of ${leap(xs).toFixed(2)} m`);
      const e = errs.slice(300).sort((a, b) => a - b);
      assert.ok(e[Math.floor(e.length * 0.99)] < 0.5, `99% within 50 cm: ${e[Math.floor(e.length * 0.99)].toFixed(2)}`);
      assert.ok(pb.delay < 500, `delay ${pb.delay}`);
    }
  }
  onRoad(false);
});

test("a smooth driver on a good line: drawn 110 ms back, as close to them as before", () => {
  const ms = 20_000;
  const arr = ride({ ms, seed: 7, slow: false, badLine: false });
  const { xs, errs, pb } = newWay(arr, ms);
  assert.equal(backs(xs).n, 0);
  assert.ok(pb.delay < 160, `delay ${pb.delay}`);
  const e = errs.slice(120).sort((a, b) => a - b);
  assert.ok(e[Math.floor(e.length * 0.99)] < 0.1, `99% within 10 cm: ${e[Math.floor(e.length * 0.99)]}`);
});

test("a driver's client from before the clock (st 0): played on arrival, as before", () => {
  const ms = 10_000;
  const arr = ride({ ms, seed: 9, slow: false, badLine: false, stZero: true });
  const { xs } = newWay(arr, ms);
  assert.ok(xs.length > 500);
  assert.ok(xs[xs.length - 1] > SPEED * 9, `got to ${xs[xs.length - 1]}`);
  assert.equal(backs(xs).n, 0);
});

test("a jump (pulled out, a new driver): drawn there at once, its clock started again", () => {
  const pb = new CarPlayback<PlaybackSample>();
  const at = (st: number, x: number): PlaybackSample => ({
    st,
    p: new Vector3(x, 0, 0),
    q: new Quaternion(),
    v: new Vector3(),
  });
  let now = 0;
  for (let k = 1; k <= 20; k++) {
    now += 50;
    pb.push(at(k * 50, 0), now, 3);
    pb.pose(now, 0.05);
  }
  // the server put it 40 m off (and the new driver's clock is back near 0)
  now += 50;
  pb.push(at(30, 40), now, 4);
  const { pose } = pb.pose(now, 1 / 60);
  assert.equal(pose.p.x, 40);
  // a new driver's clock from 0, the same jump count: started again all the same
  now += 50;
  pb.push(at(5, 80), now, 4);
  assert.equal(pb.pose(now, 1 / 60).pose.p.x, 80);
});

test("a tab back from the background (3 s of nothing): caught up at once, not raced to", () => {
  const ms = 12_000;
  const arr = ride({ ms, seed: 11, slow: false, badLine: false });
  const pb = new CarPlayback<PlaybackSample>();
  let i = 0;
  const step = (now: number, dt: number) => {
    while (i < arr.length && arr[i].at <= now) pb.push(arr[i++].s, now, 0);
    return pb.pose(now, dt).pose.p.x;
  };
  for (let now = 0; now < 4000; now += 1000 / 60) step(now, 1 / 60);
  // nothing drawn for 3 s, then one frame
  const x = step(7000, 3);
  assert.ok(Math.abs(x - truthAt(pb.rt).x) < 1, "where the driver had it");
  assert.ok(Math.abs(7000 - 30 - pb.delay - pb.rt) < 400, `the clock caught up: rt ${pb.rt}`);
});
