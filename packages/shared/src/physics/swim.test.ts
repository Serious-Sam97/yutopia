import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { blankMap } from "../map-edit.ts";
import {
  type Body,
  KH_FEEL,
  type MoveEnv,
  type MoveInput,
  NO_INPUT,
  newBody,
  STEP_DT,
  type StepEvents,
  SWIM,
  stepBody,
  type WaterHere,
} from "../move/index.ts";
import { box3 } from "../shapes/index.ts";
import { CharacterMover, type Frame } from "./body.ts";
import { loadJolt } from "./load.ts";
import { Place } from "./place.ts";
import { PhysicsWorld, sizesFor } from "./world.ts";

// The swimming (docs/plan/66-the-water.md, phase 2) on Jolt: a pool in a pad — the land at 0, the
// water's level 0.2 under it; from x 10 a shelf 0.9 deep to x 16, the deep (3 m) to x 30, where the
// land's edge stands straight up out of it (the dock's way out).

const worlds: PhysicsWorld[] = [];
afterEach(() => {
  for (const w of worlds.splice(0)) w.destroy();
});

const LEVEL = -0.2;
const FRAME: Frame = { elev: 0 };
async function pool(current = 0) {
  const world = await PhysicsWorld.create(loadJolt, sizesFor({ statics: 64 }));
  worlds.push(world);
  world.setStatic(
    "slab",
    [
      box3(0, 0, 10, 12, -0.2, 0),
      box3(10, 0, 16, 12, LEVEL - 1.2, LEVEL - 0.9),
      box3(16, 0, 30, 12, -3.4, LEVEL - 3),
      box3(30, 0, 40, 12, -0.2, 0),
      box3(30, 0, 40, 12, -3.4, 0),
    ],
    "floor",
  );
  world.settle();
  const collider = new Place(world, blankMap("pad", "pad", 40, 12), []);
  const mover = new CharacterMover(world, () => FRAME);
  const water = (x: number): WaterHere | null =>
    x >= 10 && x < 30
      ? { level: LEVEL, bed: x < 16 ? LEVEL - 0.9 : LEVEL - 3, vx: x >= 16 ? current : 0, vy: 0 }
      : null;
  const env: MoveEnv = { grid: collider, mover, footing: () => "floor", water };
  return { world, env };
}
const go = (o: Partial<MoveInput> = {}): MoveInput => ({ ...NO_INPUT, x: 1, ...o });
function run(b: Body, env: MoveEnv, secs: number, inp: (t: number) => MoveInput) {
  const evs: StepEvents[] = [];
  for (let i = 0; i < Math.round(secs / STEP_DT); i++) evs.push(stepBody(b, inp(i * STEP_DT), env, KH_FEEL));
  return evs;
}
const speedOver = (b: Body, env: MoveEnv, secs: number, inp: MoveInput) => {
  const x0 = b.x;
  run(b, env, secs, () => inp);
  return (b.x - x0) / secs;
};

test("into the water: waded on the shelf, slower; afloat past it, the head out, at a swim and a crawl", async () => {
  const { env } = await pool();
  const land = newBody(4, 6, 0);
  const onLand = speedOver(land, env, 1, go());
  const b = newBody(6, 6, 0);
  for (let i = 0; i < 600 && b.x < 11.5; i++) stepBody(b, go(), env, KH_FEEL);
  assert.ok(b.x > 10 && b.x < 16, `on the shelf: ${b.x}`);
  assert.ok(!b.swim, "wading, not swimming");
  const wading = speedOver(b, env, 0.5, go());
  assert.ok(wading < onLand * 0.8, `slower wading: ${wading} against ${onLand}`);
  run(b, env, 3, () => go());
  const afloat = (b as Body).swim;
  assert.ok(afloat && !afloat.under, "afloat past the shelf");
  assert.ok(Math.abs(b.z - (LEVEL - SWIM.ride)) < 0.1, `the head out: feet at ${b.z}`);
  assert.equal(b.up, false, "not in the air");
  const swim = speedOver(b, env, 1, go());
  assert.ok(Math.abs(swim - SWIM.speed) < 0.2, `a swim: ${swim}`);
  const crawl = speedOver(b, env, 1.5, go({ sprint: true }));
  assert.ok(crawl > SWIM.speed + 0.5, `a crawl: ${crawl}`);
});

test("back to the shore: swum to the shelf, stepped up onto it and wading", async () => {
  const { env } = await pool();
  const b = newBody(20, 6, LEVEL - SWIM.ride);
  run(b, env, 0.5, () => NO_INPUT);
  run(b, env, 6, () => go({ x: -1 }));
  assert.ok(!b.swim, "out of the swim");
  assert.ok(b.x < 16 && Math.abs(b.z - (LEVEL - 0.9)) < 0.05, `stood on the shelf: ${b.x}, ${b.z}`);
});

test("the current carries a swimmer who lets go", async () => {
  const { env } = await pool(0.4);
  const b = newBody(18, 6, LEVEL - SWIM.ride);
  run(b, env, 0.5, () => NO_INPUT);
  const drift = speedOver(b, env, 2, NO_INPUT);
  assert.ok(b.swim, "afloat");
  assert.ok(Math.abs(drift - 0.4) < 0.08, `carried at the current's speed: ${drift}`);
});

test("under: C dives, the camera's pitch steers down, let go it floats back up to the surface", async () => {
  const { env } = await pool();
  const b = newBody(18, 6, LEVEL - SWIM.ride);
  run(b, env, 0.5, () => NO_INPUT);
  stepBody(b, { ...NO_INPUT, crouch: true, crouchPressed: true }, env, KH_FEEL);
  assert.ok(b.swim?.under, "under");
  run(b, env, 1.2, () => go({ pitch: -0.7 }));
  assert.ok(b.z < LEVEL - SWIM.ride - 0.8, `down: ${b.z}`);
  assert.ok(b.z > LEVEL - 3 - 0.01, "never under the bed");
  run(b, env, 6, () => NO_INPUT);
  assert.ok(b.swim && !b.swim.under, "back on the surface");
  stepBody(b, { ...NO_INPUT, crouch: true, crouchPressed: true }, env, KH_FEEL);
  run(b, env, 0.6, () => go({ pitch: -0.7 }));
  assert.ok((b as Body).swim?.under, "under again");
  stepBody(b, { ...NO_INPUT, crouchPressed: true }, env, KH_FEEL);
  assert.ok(!(b as Body).swim?.under, "C again: coming up");
  run(b, env, 2, () => NO_INPUT);
  assert.ok(Math.abs(b.z - (LEVEL - SWIM.ride)) < 0.1, `at the surface: ${b.z}`);
});

test("out: swum to the land's edge, Space climbs out onto it", async () => {
  const { env } = await pool();
  const b = newBody(27, 6, LEVEL - SWIM.ride);
  run(b, env, 2.5, () => go());
  assert.ok(b.x > 28.5 && b.x < 30, `at the edge: ${b.x}`);
  const ev = run(b, env, 1 / 60, () => go({ jump: true, jumpPressed: true }));
  assert.equal(ev[0].verb, "mantle", "climbing out");
  run(b, env, 1.2, () => NO_INPUT);
  assert.ok(!b.swim && !b.verb, "out of it");
  assert.ok(b.x > 30 && Math.abs(b.z) < 0.05, `stood on the land: ${b.x}, ${b.z}`);
});

test("a fall into deep water: caught by it — a splash, no landing — and afloat", async () => {
  const { env } = await pool();
  const b = newBody(20, 6, 5);
  b.up = true;
  const evs = run(b, env, 1, () => NO_INPUT);
  assert.ok(
    evs.some((e) => (e.splash ?? 0) > 0.5),
    "a splash",
  );
  assert.ok(b.swim?.under, "a fall from 5 m goes under");
  evs.push(...run(b, env, 8, () => NO_INPUT));
  assert.ok(!evs.some((e) => e.landed !== undefined), "no landing");
  const s = b.swim as { under: boolean } | null | undefined;
  assert.ok(s && !s.under, "back up, afloat");
  assert.ok(Math.abs(b.z - (LEVEL - SWIM.ride)) < 0.15, `at the surface: ${b.z}`);
});

test("on land the water asks nothing: the same steps with it as without", async () => {
  const a = await pool();
  const c = await pool();
  const without: MoveEnv = { ...c.env, water: undefined };
  const b1 = newBody(9, 6, 0);
  const b2 = newBody(9, 6, 0);
  for (let i = 0; i < 240; i++) {
    const inp = go({ x: -1, sprint: i > 60, jump: i === 120, jumpPressed: i === 120, y: i > 180 ? 0.4 : 0 });
    stepBody(b1, inp, a.env, KH_FEEL);
    stepBody(b2, inp, without, KH_FEEL);
  }
  assert.ok(b1.x < 9 && !b1.swim, "kept on the land");
  assert.deepEqual([b1.x, b1.y, b1.z, b1.vx, b1.vy, b1.vz, b1.yaw], [b2.x, b2.y, b2.z, b2.vx, b2.vy, b2.vz, b2.yaw]);
});
