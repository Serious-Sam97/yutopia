import assert from "node:assert/strict";
import test from "node:test";
import { chunkCount, groundsChunk, hasChunk, heightAt, setChunkCap, surfaceTileAt } from "./grounds.ts";

// docs/plan/69-the-long-road.md, L2: the chunks kept are bounded — the least lately used go, and one
// asked for again is made again, the same as it was.

test("past the cap the least lately used chunks go; one asked for again is the same", () => {
  try {
    setChunkCap(64);
    const first = groundsChunk(0, 0);
    const h = Array.from(first.h);
    const walk = Array.from(first.walk);
    const trees = first.trees.map((t) => [t.x, t.z, t.y, t.kind, t.s]);
    const surf = surfaceTileAt(3, 5);
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
    assert.equal(surfaceTileAt(3, 5), surf);
  } finally {
    setChunkCap(4000);
  }
});
