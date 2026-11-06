import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import {
  CHUNK,
  DOCK,
  heightAt,
  ICE_TOP,
  POND,
  POND_LEVEL,
  POND_SHELF,
  RIVER,
  riverWater,
  setUnderfoot,
  terrainAt,
  walkableCell,
  waterAt,
} from "../grounds.ts";
import { blankMap } from "../map-edit.ts";
import { KH_FEEL, type MoveEnv, NO_INPUT, newBody, STEP_DT, SWIM, stepBody } from "../move/index.ts";
import { CharacterMover } from "./body.ts";
import { ICE_WALK, WorldBuilder } from "./build.ts";
import { loadJolt } from "./load.ts";
import { Place } from "./place.ts";
import { PhysicsWorld, sizesFor } from "./world.ts";

// The water (docs/plan/65-the-weather.md, W6; docs/plan/66-the-water.md, phases 1–2): it has depth — a
// shelf waded from the shore, then the deep, swum; frozen, its ice is walked at its level over the
// carved bed; the river runs downhill.

const worlds: PhysicsWorld[] = [];
afterEach(() => {
  for (const w of worlds.splice(0)) w.destroy();
  setUnderfoot({ ice: 1 });
});

async function pond(open: boolean) {
  setUnderfoot({ ice: open ? 0 : 1 });
  const w = await PhysicsWorld.create(loadJolt, sizesFor({ statics: 128, things: 16 }));
  worlds.push(w);
  const b = new WorldBuilder(w);
  for (let cz = Math.floor((POND.cz - POND.rz - 12) / CHUNK); cz * CHUNK < POND.cz + POND.rz + 12; cz++)
    for (let cx = Math.floor((POND.cx - POND.rx - 12) / CHUNK); cx * CHUNK < POND.cx + POND.rx + 12; cx++)
      b.groundChunk(cx, cz);
  b.ice(open ? 0 : 1);
  w.settle();
  return w;
}
// walk from (x, z) towards the pond's middle for six seconds, raw on Jolt's character: how far in
// (its ellipse's measure: 1 its edge, 0 its middle) and how high
function walk(w: PhysicsWorld, x: number, z: number): { r: number; y: number } {
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
  return { r: Math.hypot((p[0] - POND.cx) / POND.rx, (p[2] - POND.cz) / POND.rz), y: p[1] };
}

test("the pond open: a body walks in from its north shore, wades its shelf and swims out over the deep", async () => {
  const w = await pond(true);
  // (the move's own body on Jolt, the Grounds' coords as the floor's: z the land's)
  const frame = { elev: 0 };
  const env: MoveEnv = {
    grid: new Place(w, blankMap("pond", "pond", 8, 8), []),
    mover: new CharacterMover(w, () => frame),
    footing: () => "snow",
    water: (x, y) => {
      const h = waterAt(x, y);
      return h ? { level: h.level, bed: h.bed, vx: h.flow[0], vy: h.flow[1] } : null;
    },
  };
  const z0 = POND.cz - POND.rz - 6;
  const b = newBody(POND.cx, z0, heightAt(POND.cx, z0));
  let waded = false;
  for (let i = 0; i < Math.round(14 / STEP_DT); i++) {
    stepBody(b, { ...NO_INPUT, y: 1 }, env, KH_FEEL);
    const r = Math.hypot((b.x - POND.cx) / POND.rx, (b.y - POND.cz) / POND.rz);
    if (r < 0.97 && r > POND_SHELF && !b.swim) waded = true;
  }
  assert.ok(waded, "waded its shelf");
  const r = Math.hypot((b.x - POND.cx) / POND.rx, (b.y - POND.cz) / POND.rz);
  assert.ok(b.swim && r < POND_SHELF - 0.2, `afloat over the deep: ${r}`);
  assert.ok(Math.abs(b.z - (POND_LEVEL - SWIM.ride)) < 0.12, `the head out: ${b.z}`);
});

test("the pond open: swum to the dock's end, Space climbs out onto its planks", async () => {
  const w = await pond(true);
  const frame = { elev: 0 };
  const env: MoveEnv = {
    grid: new Place(w, blankMap("pond", "pond", 8, 8), []),
    mover: new CharacterMover(w, () => frame),
    footing: () => "snow",
    water: (x, y) => {
      const h = waterAt(x, y);
      return h ? { level: h.level, bed: h.bed, vx: h.flow[0], vy: h.flow[1] } : null;
    },
  };
  // (afloat off its end, facing it: north)
  const b = newBody(-252, -83.2, POND_LEVEL - SWIM.ride, -Math.PI / 2);
  b.swim = { under: false };
  for (let i = 0; i < 60; i++) stepBody(b, { ...NO_INPUT, y: -1 }, env, KH_FEEL);
  const ev = stepBody(b, { ...NO_INPUT, y: -1, jump: true, jumpPressed: true }, env, KH_FEEL);
  assert.equal(ev.verb, "mantle", "climbing out");
  for (let i = 0; i < Math.round(1.2 / STEP_DT); i++) stepBody(b, NO_INPUT, env, KH_FEEL);
  assert.ok(!b.swim && !b.verb, "out");
  assert.ok(Math.abs(b.z - DOCK.top) < 0.05 && b.y < -84.4, `on its planks: ${b.y}, ${b.z}`);
});

test("the pond frozen: walked out on its ice at its level", async () => {
  const frozen = await pond(false);
  for (const [x, z] of [
    [POND.cx + 6, POND.cz - POND.rz - 8],
    [POND.cx - 6, POND.cz + POND.rz + 8],
  ]) {
    const { r, y } = walk(frozen, x, z);
    assert.ok(r < 0.8, `out on the ice: ${r}`);
    assert.ok(Math.abs(y - (POND_LEVEL + ICE_TOP)) < 0.05, `on its top, not the bed: ${y}`);
  }
});

// from the dock's land end: out along it `out` s, then `side` s to the west (−1) or east (1)
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

test("the pond open: the dock's planks are stood on, over the water", async () => {
  const open = await pond(true);
  const mid = onDock(open, 1.6, 0, 0);
  assert.ok(mid[2] > -94 && mid[2] < -86, `out along it: z ${mid[2]}`);
  assert.ok(mid[0] > -253.5 && mid[0] < -250.5, `on it: x ${mid[0]}`);
  assert.ok(Math.abs(mid[1] - DOCK.top) < 0.05, `on its planks: y ${mid[1]} (top ${DOCK.top})`);
});

test("the pond open: no walls in the water — the dock's end stepped off into it", async () => {
  const open = await pond(true);
  const id = open.addCharacter(-252, heightAt(-252, -97) + 0.1, -97) as number;
  for (let t = 0; t < 7 * 60; t++) {
    open.moveCharacter(id, 0, -2, 3, 1 / 60, true);
    open.step();
  }
  const p: [number, number, number] = [0, 0, 0];
  open.characterAt(id, p);
  assert.ok(p[2] > -84, `off its end, into the water: z ${p[2]}`);
});

test("the paths keep off open water past the shelf (swum, not walked), wade the shelf, and walk over it all frozen", () => {
  const tx = Math.floor(POND.cx);
  const tz = Math.floor(POND.cz);
  setUnderfoot({ ice: ICE_WALK - 0.1 });
  assert.equal(walkableCell(tx, tz), false, "the pond's middle, open");
  assert.equal(walkableCell(Math.floor(POND.cx + POND.rx * 0.95), tz), true, "its shelf, open");
  setUnderfoot({ ice: 1 });
  assert.equal(walkableCell(tx, tz), true, "the pond's middle, frozen");
  // (the land beside it either way)
  setUnderfoot({ ice: 0 });
  assert.equal(walkableCell(tx, Math.floor(POND.cz - POND.rz - 10)), true);
});

test("the river runs downhill: its level never rises southwards, and stays under its old bed", () => {
  const w = riverWater();
  assert.equal(w.level.length, RIVER.line.length);
  for (let i = 1; i < w.level.length; i++) assert.ok(w.level[i] <= w.level[i - 1] + 1e-9, `rises at ${i}`);
  for (let i = 0; i < w.level.length; i++) assert.ok(w.level[i] <= RIVER.h[i] + 1e-9, `over its old bed at ${i}`);
  // (slow on its long reach, fast on the rapid)
  const near = (z: number) =>
    RIVER.line.reduce((b, p, i) => (Math.abs(p[1] - z) < Math.abs(RIVER.line[b][1] - z) ? i : b), 0);
  assert.ok(w.speed[near(-300)] < 0.6, `the reach: ${w.speed[near(-300)]}`);
  assert.ok(w.speed[near(-590)] > 1.5, `the rapid: ${w.speed[near(-590)]}`);
});

test("the beds are carved: deep in the middle, a shelf at the shore, the land meeting the water", () => {
  setUnderfoot({ ice: 0 });
  const p = waterAt(POND.cx, POND.cz);
  assert.ok(p && Math.abs(p.depth - 3.5) < 1e-6, "the pond's middle 3.5 m deep");
  assert.ok(Math.abs(terrainAt(POND.cx, POND.cz) - (POND_LEVEL - 3.5)) < 1e-6, "its land the bed");
  assert.ok(Math.abs(terrainAt(POND.cx + POND.rx * 0.999, POND.cz) - POND_LEVEL) < 0.1, "its shore at its level");
  const w = riverWater();
  const L = RIVER.line;
  // (on the long reach, away from the bridge)
  const i = L.reduce((b, q, k) => (Math.abs(q[1] + 300) < Math.abs(L[b][1] + 300) ? k : b), 0);
  const [x, z] = L[i];
  const mid = waterAt(x, z);
  assert.ok(mid && Math.abs(mid.depth - 2.8) < 0.05, `the river's middle ~2.8 m: ${mid?.depth}`);
  assert.ok(Math.abs(terrainAt(x, z) - (w.level[i] - 2.8)) < 0.1, "its land the bed");
  assert.ok(mid && mid.flow[1] > 0, "its current southwards");
  // the open water's surface over the bed for the ear and the rain; the ice's top frozen
  assert.ok(heightAt(x, z) < w.level[i] - 2, "open: where you'd stand is the bed");
  setUnderfoot({ ice: 1 });
  assert.ok(Math.abs(heightAt(x, z) - (w.level[i] + ICE_TOP)) < 0.05, "frozen: its ice");
});
