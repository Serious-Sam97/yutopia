import assert from "node:assert/strict";
import { test } from "node:test";
import { editsVersion } from "@yutopia/shared/grounds";
import type { BlockAsk, BlockData } from "./land-block";
import { DEATHS, LandPool, STUCK_MS } from "./land-pool";

// The land's workers can't lock the land up (docs/plan/91-the-big-map.md phase 1): a slow placer, a silent
// worker, a dying one — the land all in. Fake workers: they answer when told to.

class Fake {
  onmessage: ((e: MessageEvent<BlockData>) => void) | null = null;
  onerror: ((e: ErrorEvent) => void) | null = null;
  onmessageerror: (() => void) | null = null;
  asks: BlockAsk[] = [];
  gone = false;
  postMessage(m: BlockAsk & { warm?: boolean }) {
    if (!m.warm) this.asks.push(m);
  }
  terminate() {
    this.gone = true;
  }
  /** its oldest ask answered */
  answer() {
    const a = this.asks.shift();
    if (!a || this.gone) return;
    this.onmessage?.({ data: { key: a.key, v: editsVersion } as BlockData } as MessageEvent<BlockData>);
  }
  answerAll() {
    while (this.asks.length) this.answer();
  }
  die() {
    this.onerror?.({ message: "boom" } as ErrorEvent);
  }
}

const blocks = (n: number): BlockAsk[] =>
  Array.from({ length: n }, (_, i) => ({ key: `2:${i * 32}:0`, x0: i * 32, z0: 0, size: 32, step: 1, near: true }));

function pool(n: number) {
  const fakes: Fake[] = [];
  let t = 0;
  const p = new LandPool(n, {
    make: () => {
      const f = new Fake();
      fakes.push(f);
      return f as unknown as Worker;
    },
    now: () => t,
  });
  return {
    p,
    fakes,
    live: () => fakes.filter((f) => !f.gone),
    tick: (ms: number) => {
      t += ms;
    },
  };
}

test("a slow placer: a block made and waiting isn't asked for again (Rafael's road)", () => {
  const { p, live, tick } = pool(2);
  const want = blocks(12);
  const placed = new Set<string>();
  let posted = 0;
  // a frame: the missing asked, the workers answer, but the stream places only one in three frames
  for (let frame = 0; frame < 120; frame++) {
    tick(16);
    const before = live().reduce((n, f) => n + f.asks.length, 0);
    p.ask(
      want.filter((b) => !placed.has(b.key)),
      2,
    );
    posted += live().reduce((n, f) => n + f.asks.length, 0) - before;
    for (const f of live()) f.answerAll();
    if (frame % 3 === 0) {
      const d = p.made.shift();
      if (d) placed.add(d.key);
    }
  }
  assert.equal(posted, 12, "twelve blocks, twelve asks");
  assert.equal(placed.size, 12, "all placed");
});

test("each block asked once while it's made and waiting", () => {
  const { p, fakes, tick } = pool(2);
  const want = blocks(6);
  let posted = 0;
  for (let frame = 0; frame < 30; frame++) {
    tick(16);
    const before = fakes.reduce((a, f) => a + f.asks.length, 0);
    p.ask(want, 2);
    posted += fakes.reduce((a, f) => a + f.asks.length, 0) - before;
    for (const f of fakes) f.answerAll();
    // (nothing placed at all)
  }
  assert.equal(posted, 6, "six blocks, six asks");
  assert.equal(p.made.length, 6);
});

test("a silent worker: replaced after STUCK_MS, its blocks asked of the others, the land all in", () => {
  const { p, fakes, live, tick } = pool(2);
  const want = blocks(4);
  p.ask(want, 2);
  const silent = fakes[0];
  // the other answers; the first never does
  for (let s = 0; s * 100 <= STUCK_MS + 200; s++) {
    tick(100);
    p.ask(
      want.filter((b) => !p.made.some((d) => d.key === b.key)),
      2,
    );
    for (const f of live()) if (f !== silent) f.answerAll();
  }
  assert.ok(silent.gone, "the silent one terminated");
  assert.equal(live().length, 2, "another in its place");
  assert.deepEqual(p.made.map((d) => d.key).sort(), want.map((b) => b.key).sort(), "every block in");
  assert.ok(!p.dead);
});

test("a held-up main thread isn't the workers' fault", () => {
  const { p, fakes, tick } = pool(1);
  p.ask(blocks(2), 2);
  tick(16);
  p.ask(blocks(2), 2);
  tick(STUCK_MS + 2000); // (a long frame: their answers in the queue behind it)
  p.ask(blocks(2), 2);
  assert.ok(!fakes[0].gone);
});

test("a dying worker: replaced, its blocks asked again; only DEATHS of them end the pool", () => {
  const { p, fakes, live, tick } = pool(2);
  const want = blocks(4);
  p.ask(want, 2);
  fakes[0].die();
  assert.equal(live().length, 2);
  assert.ok(!p.dead);
  tick(16);
  p.ask(want, 2);
  for (const f of live()) f.answerAll();
  assert.equal(p.made.length, 4, "all in after one died");
  for (let i = 1; i < DEATHS; i++) live()[0]?.die();
  assert.ok(p.dead, "the main thread makes the land from now on");
  assert.equal(live().length, 0);
});
