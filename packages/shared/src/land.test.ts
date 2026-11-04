import assert from "node:assert/strict";
import test from "node:test";
import { KART_GROUND } from "./kart/land.ts";
import {
  BASE_LAND,
  beyondLand,
  beyondReach,
  inLandBounds,
  inLandDrawn,
  isLandChunk,
  landBounds,
  landChunks,
  landVersion,
  overlapsLand,
  reachRects,
  setLand,
} from "./land.ts";

// docs/plan/69-the-long-road.md, phase 1: the land as data — with today's regions, everything the
// hand-written box and rectangle gave is what they give (the chunks' hashes: grounds-edits.test).

// what it was (grounds.ts before plan 69)
const OLD = { x0: -480, z0: -960, x1: 544, z1: 208 };
function oldBeyond(x: number, z: number): number {
  const o = Math.max(-400 - x, z - 172, -580 - z, x - 528, 0);
  if (o === 0) return o;
  const F = KART_GROUND;
  return Math.min(o, Math.max(F.x0 - x, x - F.x1, F.z0 - z, z - F.z1, 0));
}
function oldWorldRects() {
  const m = (r: { x0: number; z0: number; x1: number; z1: number }) => ({
    x0: Math.max(OLD.x0 + 2, r.x0 - 24),
    z0: Math.max(OLD.z0 + 2, r.z0 - 24),
    x1: Math.min(OLD.x1 - 2, r.x1 + 24),
    z1: Math.min(OLD.z1 - 2, r.z1 + 24),
  });
  return [m({ x0: -400, z0: -580, x1: 528, z1: 172 }), m(KART_GROUND)];
}

test("today's land: its box is what GROUNDS was", () => {
  assert.deepEqual({ ...landBounds() }, OLD);
});

test("today's land: how far beyond it, everywhere, as it was", () => {
  // (every 1.7 m over the box and 300 m past it: off the grid's lines too)
  let n = 0;
  for (let z = OLD.z0 - 300; z < OLD.z1 + 300; z += 1.7)
    for (let x = OLD.x0 - 300; x < OLD.x1 + 300; x += 1.7) {
      assert.equal(beyondLand(x, z), oldBeyond(x, z), `${x},${z}`);
      n++;
    }
  assert.ok(n > 500_000);
});

test("today's land: its chunks are the box's, in the box's order", () => {
  const old: [number, number][] = [];
  for (let cz = Math.floor(OLD.z0 / 32); cz * 32 < OLD.z1; cz++)
    for (let cx = Math.floor(OLD.x0 / 32); cx * 32 < OLD.x1; cx++) old.push([cx, cz]);
  assert.equal(old.length, 1184);
  assert.deepEqual(landChunks(32), old);
  for (const [cx, cz] of old) assert.ok(isLandChunk(cx, cz, 32));
  assert.ok(!isLandChunk(Math.floor(OLD.x0 / 32) - 1, 0, 32));
  assert.ok(!isLandChunk(17, 0, 32));
  assert.ok(!isLandChunk(0, 7, 32));
  // (the stream's 128 m blocks: every one over the box is on the land)
  for (let z0 = Math.floor(OLD.z0 / 128) * 128; z0 < OLD.z1; z0 += 128)
    for (let x0 = Math.floor(OLD.x0 / 128) * 128; x0 < OLD.x1; x0 += 128)
      assert.ok(overlapsLand(x0, z0, x0 + 128, z0 + 128));
});

test("today's land: the walls' rectangles and the box's edges, as they were", () => {
  assert.deepEqual(reachRects(), oldWorldRects());
  for (const [x, z] of [
    [OLD.x0, OLD.z0],
    [OLD.x1, OLD.z1],
    [OLD.x0 - 0.01, 0],
    [0, OLD.z1 + 0.01],
    [100, -400],
  ] as const) {
    assert.equal(inLandBounds(x, z), x >= OLD.x0 && x <= OLD.x1 && z >= OLD.z0 && z <= OLD.z1, `${x},${z}`);
    assert.equal(inLandDrawn(x, z), x >= OLD.x0 && x < OLD.x1 && z >= OLD.z0 && z < OLD.z1, `${x},${z}`);
  }
});

test("a ribbon: beyond it by the distance off its line past its half-width", () => {
  const r = {
    kind: "ribbon" as const,
    line: [
      [0, 0],
      [100, 0],
      [100, 100],
    ] as [number, number][],
    half: 10,
  };
  assert.equal(beyondReach(r, 50, 0), 0);
  assert.equal(beyondReach(r, 50, 9), 0);
  assert.equal(beyondReach(r, 50, 25), 15);
  assert.equal(beyondReach(r, -20, 0), 10);
  assert.equal(beyondReach(r, 130, 50), 20);
  assert.ok(Math.abs(beyondReach(r, 130, 140) - (50 - 10)) < 1e-9);
});

test("the land changed: its box, beyond and chunks follow; put back, as it was", () => {
  const v = landVersion;
  const band = {
    key: "test-band",
    biome: "forest" as const,
    reach: {
      kind: "ribbon" as const,
      line: [
        [536, -405],
        [2536, -405],
      ] as [number, number][],
      half: 300,
    },
    drawn: { x0: 544, z0: -800, x1: 2600, z1: -20 },
  };
  try {
    setLand([...BASE_LAND, band]);
    assert.ok(landVersion > v);
    assert.deepEqual({ ...landBounds() }, { x0: -480, z0: -960, x1: 2600, z1: 208 });
    assert.equal(beyondLand(1500, -405), 0);
    assert.equal(beyondLand(1500, -405 + 350), 50);
    assert.ok(isLandChunk(40, -12, 32));
    assert.ok(!isLandChunk(40, 3, 32));
    // (the corners of the new box that no region draws aren't land)
    assert.ok(!inLandDrawn(2000, 100));
    assert.equal(landChunks(32).length, 1184 + 65 * 25 - 0);
  } finally {
    setLand(BASE_LAND);
  }
  assert.deepEqual({ ...landBounds() }, OLD);
  assert.equal(landChunks(32).length, 1184);
});
