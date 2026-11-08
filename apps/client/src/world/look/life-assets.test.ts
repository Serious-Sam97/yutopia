import assert from "node:assert/strict";
import { test } from "node:test";
import { AssetQueue } from "./life-assets";

// A fake loader: each load waits until resolved by hand, so the order is the test's.
function rig(opts: { concurrency?: number; budget?: number } = {}) {
  const pending = new Map<string, (v: { url: string; size: number }) => void>();
  const started: string[] = [];
  const freed: string[] = [];
  const q = new AssetQueue<{ url: string; size: number }>({
    load: (url) =>
      new Promise((ok) => {
        started.push(url);
        pending.set(url, ok);
      }),
    size: (t) => t.size,
    free: (t) => freed.push(t.url),
    ...opts,
  });
  const finish = async (url: string, size = 10) => {
    pending.get(url)?.({ url, size });
    pending.delete(url);
    await new Promise((r) => setTimeout(r, 0));
  };
  return { q, started, freed, finish };
}

test("loads the most urgent first, a few at a time", async () => {
  const { q, started, finish } = rig({ concurrency: 1 });
  void q.get("far", 30);
  void q.get("near", 5);
  void q.get("mid", 10);
  // (the first asked starts at once: nothing else was waiting then)
  assert.deepEqual(started, ["far"]);
  await finish("far");
  assert.deepEqual(started, ["far", "near"]);
  await finish("near");
  assert.deepEqual(started, ["far", "near", "mid"]);
});

test("each url loads once, every asker gets it", async () => {
  const { q, started, finish } = rig();
  const a = q.get("man", 1);
  const b = q.get("man", 1);
  assert.equal(started.length, 1);
  await finish("man");
  assert.equal(await a, await b);
  // (asked again once loaded: straight from the cache)
  const c = await q.get("man", 1);
  assert.equal(c, await a);
  assert.equal(started.length, 1);
});

test("asked again more urgently, it moves up", async () => {
  const { q, started, finish } = rig({ concurrency: 1 });
  void q.get("busy", 0);
  void q.get("a", 20);
  void q.get("b", 10);
  void q.get("a", 1);
  await finish("busy");
  assert.deepEqual(started, ["busy", "a"]);
});

test("unheld things are freed oldest first, only past the budget", async () => {
  const { q, freed, finish } = rig({ concurrency: 4, budget: 25 });
  for (const u of ["a", "b", "c"]) void q.get(u, 0);
  for (const u of ["a", "b", "c"]) await finish(u, 10);
  assert.deepEqual(freed, []);
  q.release("b");
  q.release("a");
  // 30 cached, budget 25: the first let go (b) goes
  assert.deepEqual(freed, ["b"]);
  assert.equal(q.stats().bytes, 20);
  q.release("c");
  assert.deepEqual(freed, ["b"]);
});

test("let go of before it ever started: never loaded", async () => {
  const { q, started, finish } = rig({ concurrency: 1 });
  void q.get("first", 0);
  void q.get("gone", 1);
  q.release("gone");
  await finish("first");
  assert.deepEqual(started, ["first"]);
  assert.equal(q.stats().queued, 0);
});

test("a failed load rejects its askers and can be asked again", async () => {
  let fail = true;
  const q = new AssetQueue<string>({
    load: (url) => (fail ? Promise.reject(new Error(`no ${url}`)) : Promise.resolve(url)),
    size: () => 1,
    free: () => {},
  });
  await assert.rejects(q.get("x"), /no x/);
  fail = false;
  assert.equal(await q.get("x"), "x");
});
