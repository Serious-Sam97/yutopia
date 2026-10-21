import assert from "node:assert/strict";
import { test } from "node:test";
import { BEAM, beamAt, beamOf, beamReaches } from "./beam.ts";
import { Grid } from "./grid.ts";

const east = (focus: boolean, pitch: number | null = null) => beamOf(0, 0, 0, 0, pitch, focus);

test("a wide beam lights ahead within 10 tiles and 0.36 rad; nothing behind or beside", () => {
  const b = east(false);
  assert.ok(beamAt(b, 5, 0) > 0.4);
  assert.ok(beamAt(b, 2, 0) > beamAt(b, 8, 0), "stronger near");
  assert.ok(beamAt(b, 5, 0) > beamAt(b, 5, 1.2), "stronger on its line");
  assert.equal(beamAt(b, 11, 0), 0, "past its length");
  assert.equal(beamAt(b, -3, 0), 0, "behind");
  assert.equal(beamAt(b, 3, 3), 0, "45° off: outside the cone");
});

test("focused: narrower and further — 14 tiles, 0.2 rad", () => {
  const w = east(false);
  const f = east(true, 0);
  assert.equal(beamAt(w, 13, 0), 0);
  assert.ok(beamAt(f, 13, 0) > 0, "reaches 13");
  assert.equal(beamAt(f, 14.5, 0), 0);
  // 0.3 rad off its line: in the wide beam, not the focused one
  const p = { x: 5 * Math.cos(0.3), y: 5 * Math.sin(0.3) };
  assert.ok(beamAt(w, p.x, p.y) > 0);
  assert.equal(beamAt(f, p.x, p.y), 0);
  assert.equal(BEAM.focus.half, 0.2);
});

test("in 3D: aimed up it passes over the snow and lights a face; walking it lights the ground ahead", () => {
  const up = east(true, 0.35);
  const face = 8 * Math.tan(0.35) + up.z;
  assert.ok(beamAt(up, 8, 0, face) > 0.3, "the face it's aimed at");
  assert.equal(beamAt(up, 8, 0, 0), 0, "not the snow under it");
  const walk = east(false);
  // tilted down: where it meets the ground is lit, high over it isn't
  const ground = walk.z / Math.tan(-BEAM.tilt);
  assert.ok(ground > 6 && ground < 9, `${ground}`);
  assert.ok(beamAt(walk, ground, 0, 0) > 0);
  assert.equal(beamAt(walk, ground, 0, 6), 0);
  // round only (no height): the views' "someone standing there"
  assert.ok(beamAt(walk, ground, 0) > 0);
});

test("a beam's facing turns with yaw (not 8 ways)", () => {
  for (const yaw of [0.1, 1, 2.5, -2.9]) {
    const b = beamOf(0, 0, 0, yaw, 0, true);
    const at = { x: b.x + Math.cos(yaw) * 6, y: b.y + Math.sin(yaw) * 6 };
    assert.ok(beamAt(b, at.x, at.y, b.z) > 0.5, `${yaw}`);
    assert.equal(beamAt(b, b.x + Math.cos(yaw + 0.3) * 6, b.y + Math.sin(yaw + 0.3) * 6, b.z), 0);
  }
});

test("a wall stops it", () => {
  const g = new Grid(20, 5);
  g.walk.fill(1);
  g.top.fill(0);
  const b = beamOf(1.5, 2.5, 0, 0, null, false);
  assert.ok(beamReaches(g, b, 8.5, 2.5));
  g.block(5, 2, 3); // (a wall, over the hand)
  assert.equal(beamReaches(g, b, 8.5, 2.5), false);
});
