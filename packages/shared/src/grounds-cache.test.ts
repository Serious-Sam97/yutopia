import assert from "node:assert/strict";
import test from "node:test";
import {
  applyEdits,
  CHUNK,
  chunkCount,
  groundsChunk,
  hasChunk,
  heightAt,
  remakeDroppedAfter,
  setChunkCap,
  surfaceCellAt,
} from "./grounds.ts";
import { encodeHeights, NO_EDITS } from "./grounds-edits.ts";

// docs/plan/69-the-long-road.md, L2: the chunks kept are bounded — the least lately used go, and one
// asked for again is made again, the same as it was.

test("past the cap the least lately used chunks go; one asked for again is the same", () => {
  try {
    setChunkCap(64);
    const first = groundsChunk(0, 0);
    const h = Array.from(first.h);
    const walk = Array.from(first.walk);
    const trees = first.trees.map((t) => [t.x, t.z, t.y, t.kind, t.s]);
    const surf = surfaceCellAt(3, 5);
    // (a hundred others made; the first kept warm by asking now and then for a while)
    for (let i = 0; i < 100; i++) {
      groundsChunk(-10 + (i % 10), -12 + Math.floor(i / 10));
      if (i < 30 && i % 8 === 0) heightAt(1, 1);
      assert.ok(chunkCount() <= 64, `${chunkCount()} kept`);
    }
    // (not asked for in the last seventy: gone)
    assert.ok(!hasChunk(0, 0));
    assert.ok(hasChunk(-1, -3), "the latest kept");
    const again = groundsChunk(0, 0);
    assert.notEqual(again, first);
    assert.deepEqual(Array.from(again.h), h);
    assert.deepEqual(Array.from(again.walk), walk);
    assert.deepEqual(
      again.trees.map((t) => [t.x, t.z, t.y, t.kind, t.s]),
      trees,
    );
    assert.equal(surfaceCellAt(3, 5), surf);
  } finally {
    setChunkCap(4000);
  }
});

// docs/plan/122: the client's — a chunk an edit drops is handed out as it was till it's made again, a few rows a step
// after the frames; then it's the one made at once.
test("a dropped chunk handed out as it was till it's made again a step at a time", () => {
  const steps: (() => boolean)[] = [];
  try {
    applyEdits(NO_EDITS);
    remakeDroppedAfter((s) => steps.push(s));
    const cx = 13;
    const cz = -8;
    const before = groundsChunk(cx, cz);
    const mid = { x: cx * CHUNK + 16, z: cz * CHUNK + 16 };
    const was = heightAt(mid.x, mid.z);
    applyEdits({ rev: 1, height: { [`${cx},${cz}`]: hill(4) } });
    assert.ok(!hasChunk(cx, cz));
    // (as it was, asked: its making queued)
    assert.equal(groundsChunk(cx, cz), before);
    assert.equal(heightAt(mid.x, mid.z), was);
    assert.equal(steps.length, 1);
    let n = 0;
    while (!steps[0]()) assert.ok(++n < 1000);
    assert.ok(n > 4, `${n} steps`);
    assert.ok(hasChunk(cx, cz));
    const made = groundsChunk(cx, cz);
    assert.notEqual(made, before);
    assert.ok(heightAt(mid.x, mid.z) > was + 3, "the hill");
    // (the same as made at once)
    remakeDroppedAfter(null);
    applyEdits(NO_EDITS);
    applyEdits({ rev: 1, height: { [`${cx},${cz}`]: hill(4) } });
    assert.notEqual(groundsChunk(cx, cz), made);
    assert.deepEqual(Array.from(groundsChunk(cx, cz).h), Array.from(made.h));
    assert.deepEqual(Array.from(groundsChunk(cx, cz).walk), Array.from(made.walk));
  } finally {
    remakeDroppedAfter(null);
    applyEdits(NO_EDITS);
  }
});
function hill(top: number): string {
  const n = CHUNK * 2 + 1;
  const a = new Int16Array(n * n);
  for (let j = 0; j < n; j++)
    for (let i = 0; i < n; i++) {
      const d = Math.hypot(i - (n - 1) / 2, j - (n - 1) / 2) / ((n - 1) / 2);
      a[j * n + i] = Math.round(Math.max(0, 1 - d) * top * 100);
    }
  return encodeHeights(a);
}
