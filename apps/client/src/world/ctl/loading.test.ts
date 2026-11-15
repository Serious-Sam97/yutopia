import assert from "node:assert/strict";
import { test } from "node:test";
import { hud } from "../store";
import { Loading } from "./loading";

// The loading screen (docs/plan/90-the-friends-machines.md): not cut at a fixed time — up while things keep coming,
// down once all's in and steady; or stuck (nothing for 15 s, the view up), built but never steady (6 s), 90 s.

interface Fake {
  done: number;
  of: number;
  drawn: number;
  tp: boolean;
  steps: number;
}
function rig(f: Fake) {
  const host = {
    G: {},
    life: {},
    cars: {},
    framePerf: { reset() {} },
    get tp() {
      return f.tp
        ? { warmup: { readiness: () => ({ done: f.done, of: f.of }), qualityTo: null, warming: true, drawn: f.drawn } }
        : null;
    },
    quality: {
      // (three tiers to step down, then the bottom)
      stepDownNow: () => {
        if (f.steps >= 3) return false;
        f.steps++;
        return true;
      },
    },
  };
  const l = new Loading(host as never);
  l.holdLoading("enter");
  return l;
}
// frames every `gap` ms from `from` for `ms`; returns when it lifted (or null)
function run(l: Loading, from: number, ms: number, gap: number, each?: (t: number) => void): number | null {
  for (let t = from; t <= from + ms; t += gap) {
    each?.(t);
    l.watchLoading(t);
    if (!hud.get().loading.on) return t;
  }
  return null;
}

test("things still coming past 15 s: up till they're in, then down once steady", () => {
  const f: Fake = { done: 0, of: 10, drawn: 10, tp: true, steps: 0 };
  const l = rig(f);
  const t0 = l.loadFrom;
  // (a part every 2 s: all in at 20 s)
  const down = run(l, t0, 40_000, 16, (t) => {
    f.done = Math.min(10, Math.floor((t - t0) / 2000));
  });
  assert.ok(
    down !== null && down - t0 >= 20_000 && down - t0 < 21_000,
    `down at ${down === null ? "never" : down - t0}`,
  );
});

test("stuck — nothing more for 15 s, the view up and drawing —: down", () => {
  const f: Fake = { done: 6, of: 10, drawn: 10, tp: true, steps: 0 };
  const l = rig(f);
  const t0 = l.loadFrom;
  const down = run(l, t0, 30_000, 16);
  assert.ok(down !== null && Math.abs(down - t0 - 15_000) < 100, `down at ${down === null ? "never" : down - t0}`);
});

test("before the view's up (its code still coming): only the 90 s ceiling", () => {
  const f: Fake = { done: 0, of: 10, drawn: 0, tp: false, steps: 0 };
  const l = rig(f);
  const t0 = l.loadFrom;
  assert.equal(run(l, t0, 60_000, 50), null);
  assert.ok((run(l, t0 + 60_000, 40_000, 50) ?? 0) - t0 >= 90_000);
});

test("all built but never steady: a tier down each second (the GPU test), and down after 6 s", () => {
  const f: Fake = { done: 10, of: 10, drawn: 10, tp: true, steps: 0 };
  const l = rig(f);
  const t0 = l.loadFrom;
  const down = run(l, t0, 20_000, 60);
  // (three steps a second or so apart, then 6 s from the last)
  assert.equal(f.steps, 3);
  assert.ok(down !== null && down - t0 >= 9000 && down - t0 < 11_000, `down at ${down === null ? "never" : down - t0}`);
});
