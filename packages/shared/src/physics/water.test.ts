import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { CHUNK, heightAt, POND, setUnderfoot, walkableTile } from "../grounds.ts";
import { ICE_WALK, WorldBuilder, waterWalls } from "./build.ts";
import { loadJolt } from "./load.ts";
import { PhysicsWorld, sizesFor } from "./world.ts";

// The water (docs/plan/65-the-weather.md, W6): open, its shores stop you as walls do — from either
// side — and the paths keep off it; frozen, it's walked as the land is.

const worlds: PhysicsWorld[] = [];
afterEach(() => {
  for (const w of worlds.splice(0)) w.destroy();
  setUnderfoot({ ice: 1 });
});

async function pond(open: boolean) {
  const w = await PhysicsWorld.create(loadJolt, sizesFor({ statics: 128, things: 16 }));
  worlds.push(w);
  const b = new WorldBuilder(w);
  for (let cz = Math.floor((POND.cz - POND.rz - 12) / CHUNK); cz * CHUNK < POND.cz + POND.rz + 12; cz++)
    for (let cx = Math.floor((POND.cx - POND.rx - 12) / CHUNK); cx * CHUNK < POND.cx + POND.rx + 12; cx++)
      b.groundChunk(cx, cz);
  b.water(open);
  w.settle();
  return w;
}
// walk from (x, z) towards the pond's middle for six seconds: how far in (its ellipse's measure:
// 1 its edge, 0 its middle)
function walk(w: PhysicsWorld, x: number, z: number): number {
  const id = w.addCharacter(x, heightAt(x, z) + 0.05, z) as number;
  const dx = POND.cx - x;
  const dz = POND.cz - z;
  const l = Math.hypot(dx, dz);
  for (let t = 0; t < 360; t++) {
    w.moveCharacter(id, (dx / l) * 3, -2, (dz / l) * 3, 1 / 60, true);
    w.step();
  }
  const p: [number, number, number] = [0, 0, 0];
  w.characterAt(id, p);
  return Math.hypot((p[0] - POND.cx) / POND.rx, (p[2] - POND.cz) / POND.rz);
}

test("the pond open: its shore stops a walker from the north and from the south; frozen, both walk out on it", async () => {
  const open = await pond(true);
  const north = walk(open, POND.cx + 6, POND.cz - POND.rz - 8);
  const south = walk(open, POND.cx - 6, POND.cz + POND.rz + 8);
  assert.ok(north > 0.97, `from the north, stopped at the shore: ${north}`);
  assert.ok(south > 0.97, `from the south, stopped at the shore: ${south}`);
  const frozen = await pond(false);
  const n2 = walk(frozen, POND.cx + 6, POND.cz - POND.rz - 8);
  const s2 = walk(frozen, POND.cx - 6, POND.cz + POND.rz + 8);
  assert.ok(n2 < 0.8, `from the north, out on the ice: ${n2}`);
  assert.ok(s2 < 0.8, `from the south, out on the ice: ${s2}`);
});

// from (x, z) on the dock's land end: out along it `out` s, then `side` s to the west (−1) or east (1):
// where it ended
function onDock(w: PhysicsWorld, out: number, side: number, t2: number): [number, number, number] {
  const id = w.addCharacter(-252, heightAt(-252, -97) + 0.1, -97) as number;
  for (let t = 0; t < out * 60 + t2 * 60; t++) {
    const outward = t < out * 60;
    w.moveCharacter(id, outward ? 0 : side * 3, -2, outward ? 3 : 0, 1 / 60, true);
    w.step();
  }
  const p: [number, number, number] = [0, 0, 0];
  w.characterAt(id, p);
  return p;
}

test("the pond open: the dock's walked to its end and no further, and not off its sides", async () => {
  const open = await pond(true);
  const end = onDock(open, 8, 0, 0);
  assert.ok(end[2] > -86 && end[2] < -84, `at its end, not past it: z ${end[2]}`);
  assert.ok(end[0] > -253.7 && end[0] < -250.3, `on it: x ${end[0]}`);
  for (const side of [-1, 1]) {
    const p = onDock(open, 2.5, side, 3);
    assert.ok(p[0] > -253.75 && p[0] < -250.25, `kept on it going ${side < 0 ? "west" : "east"}: x ${p[0]}`);
    assert.ok(
      Math.hypot((p[0] - POND.cx) / POND.rx, (p[2] - POND.cz) / POND.rz) > 0.95 || p[2] > -93,
      "not in the water",
    );
  }
});

test("the water's walls: along the pond's edge and the river's bed, low; the dock's way out open", () => {
  const ws = waterWalls();
  assert.ok(ws.length > 100);
  for (const s of ws) assert.equal(s.t, "box");
  // (none across the dock's deck where it leaves the shore, short of its end's)
  for (const s of ws)
    if (s.t === "box")
      assert.ok(!(s.x > -253.4 && s.x < -250.6 && s.z > -94 && s.z < -84.5), `a wall on the dock at ${s.x}, ${s.z}`);
});

test("the paths keep off open water, and walk over it frozen", () => {
  const tx = Math.floor(POND.cx);
  const tz = Math.floor(POND.cz);
  setUnderfoot({ ice: ICE_WALK - 0.1 });
  assert.equal(walkableTile(tx, tz), false, "the pond's middle, open");
  setUnderfoot({ ice: 1 });
  assert.equal(walkableTile(tx, tz), true, "the pond's middle, frozen");
  // (the land beside it either way)
  setUnderfoot({ ice: 0 });
  assert.equal(walkableTile(tx, Math.floor(POND.cz - POND.rz - 10)), true);
});
