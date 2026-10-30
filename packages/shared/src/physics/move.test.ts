import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { Grid } from "../grid.ts";
import {
  type Body,
  MOVE,
  type MoveEnv,
  type MoveInput,
  NO_INPUT,
  newBody,
  probeVault,
  STEP_DT,
  type StepEvents,
  stepBody,
} from "../move/index.ts";
import { box3, type Solid3 } from "../shapes/index.ts";
import { CharacterMover, type Frame, JoltCollider } from "./body.ts";
import { loadJolt } from "./load.ts";
import { BODY, PhysicsWorld, sizesFor } from "./world.ts";

// The move on Jolt (docs/plan/50-the-volume.md, phase 3): move.test.ts's numbers, carried over —
// the same body (shared/move), moved by Jolt's character and asking Jolt's world where it fits
// and what's under it. A pad's tiles as solids: a slab under it all, each blocked tile a box to
// its top (a wall's: 4 m).

const worlds: PhysicsWorld[] = [];
afterEach(() => {
  for (const w of worlds.splice(0)) w.destroy();
});

const FRAME: Frame = { ox: 0, oy: 0, elev: 0 };
/** A w × h pad on Jolt, `blocks` [x, y, top] solid tiles; the move's env on it. */
async function pad(w = 40, h = 12, blocks: [number, number, number][] = [], extra: Solid3[] = []) {
  const world = await PhysicsWorld.create(loadJolt, sizesFor({ statics: 64 }));
  worlds.push(world);
  world.setStatic("slab", [box3(0, 0, w, h, -0.2, 0)], "floor");
  const solids = blocks.map(([x, y, t]) => box3(x, y, x + 1, y + 1, 0, Math.min(4, t)));
  if (solids.length || extra.length) world.setStatic("blocks", [...solids, ...extra]);
  world.settle();
  const grid = new Grid(w, h);
  grid.walk.fill(1);
  grid.top.fill(0);
  const collider = new JoltCollider(world, grid, FRAME);
  const mover = new CharacterMover(world, () => FRAME);
  const env: MoveEnv = { grid: collider, mover, footing: () => "floor" };
  return { world, env, collider, mover };
}
const go = (o: Partial<MoveInput> = {}): MoveInput => ({ ...NO_INPUT, x: 1, ...o });

function run(b: Body, env: MoveEnv, secs: number, inp: (t: number) => MoveInput) {
  const out: { t: number; b: Body; ev: StepEvents }[] = [];
  const n = Math.round(secs / STEP_DT);
  for (let i = 0; i < n; i++) {
    const t = i * STEP_DT;
    const ev = stepBody(b, inp(t), env);
    out.push({ t: t + STEP_DT, b: { ...b, verb: b.verb ? { ...b.verb } : null }, ev });
  }
  return out;
}

test("from a standstill to a jog in about 0.15 s, and stopped in a step", async () => {
  const { env } = await pad();
  const b = newBody(3, 6);
  const steps = run(b, env, 0.5, () => go());
  const at = steps.find((s) => Math.hypot(s.b.vx, s.b.vy) >= MOVE.jog * 0.95);
  assert.ok(at && at.t > 0.1 && at.t < 0.2, `jog at ${at?.t.toFixed(3)} s`);
  assert.ok(Math.abs(b.z) < 0.01 && !b.up, `on the floor: z ${b.z.toFixed(3)}`);
  const x = b.x;
  run(b, env, 0.4, () => NO_INPUT);
  assert.ok(b.x - x < 0.3, `stopped within ${(b.x - x).toFixed(2)}`);
});

test("a jump: the feet leave the ground 40 ms after the press; a tap ~0.55 high, held 0.8", async () => {
  const { env } = await pad();
  for (const [held, want] of [
    [false, MOVE.hopTap],
    [true, MOVE.hop],
  ] as const) {
    const b = newBody(3, 6);
    run(b, env, 0.2, () => NO_INPUT);
    const steps = run(b, env, 1.2, (t) => ({ ...NO_INPUT, jump: held || t < STEP_DT, jumpPressed: t < STEP_DT }));
    const off = steps.find((s) => s.ev.jumped);
    assert.ok(off && Math.abs(off.t - MOVE.takeoff) < 2 * STEP_DT, `off at ${off?.t}`);
    const top = Math.max(...steps.map((s) => s.b.z));
    assert.ok(Math.abs(top - want) < 0.05, `${held ? "held" : "tap"}: up ${top.toFixed(3)} (want ${want})`);
    const land = steps.find((s) => s.ev.landed !== undefined);
    assert.ok(land, "and lands");
    assert.ok(Math.abs(b.z) < 0.01 && !b.up, "back on the floor");
  }
});

test("coyote time: a jump just after stepping off a ledge still goes", async () => {
  // (a ledge 1 m up: the body walks off its east end)
  const blocks: [number, number, number][] = [];
  for (let x = 0; x < 8; x++) for (let y = 0; y < 12; y++) blocks.push([x, y, 1]);
  const { env } = await pad(20, 12, blocks);
  const b = newBody(6, 6, 1);
  let offAt = -1;
  let jumped = false;
  for (let i = 0; i < 240; i++) {
    const press = offAt >= 0 && i === offAt + Math.round(0.06 / STEP_DT);
    const ev = stepBody(b, go({ jump: press, jumpPressed: press }), env);
    if (b.up && offAt < 0) offAt = i;
    if (ev.jumped) jumped = true;
  }
  assert.ok(offAt >= 0, "walked off");
  assert.ok(jumped, "the late press still jumped");
});

test("over a hip-high top a vault, up a chest-high one a mantle; too high, a jump", async () => {
  const ladder: [number, string | null][] = [
    [0.3, "vault"],
    [0.5, "vault"],
    [0.7, "vault"],
    [0.9, "mantle"],
    [1.2, "mantle"],
    [1.6, null],
  ];
  for (const [h, want] of ladder) {
    const blocks: [number, number, number][] = [];
    for (let y = 3; y < 9; y++) blocks.push([6, y, h]);
    const { collider } = await pad(20, 12, blocks);
    const p = probeVault(collider, 5.2, 6, 0, 1, 0);
    assert.equal(p?.kind ?? null, want, `top ${h}`);
    if (p) assert.ok(Math.abs(p.h - h) < 0.03, `top ${h}: found ${p.h.toFixed(3)}`);
  }
});

test("a vault carries the body over the top and down beyond it; a mantle leaves it on top", async () => {
  for (const [h, kind] of [
    [0.5, "vault"],
    [1.2, "mantle"],
  ] as const) {
    const blocks: [number, number, number][] = [];
    for (let y = 3; y < 9; y++)
      blocks.push([6, y, h], ...(kind === "mantle" ? [[7, y, h] as [number, number, number]] : []));
    const { env } = await pad(20, 12, blocks);
    const b = newBody(4.6, 6);
    let started = false;
    run(b, env, 2, (t) => {
      const press = t >= 0.2 && t < 0.2 + STEP_DT;
      return go({ jump: press, jumpPressed: press, x: t < 1.2 ? 1 : 0 });
    }).forEach((s) => {
      started ||= s.ev.verb === kind;
    });
    assert.ok(started, `${kind} started`);
    if (kind === "vault")
      assert.ok(b.x > 7.2 && Math.abs(b.z) < 0.05, `over and down at ${b.x.toFixed(2)}, ${b.z.toFixed(2)}`);
    else assert.ok(Math.abs(b.z - h) < 0.05 && b.x > 6, `on top: ${b.x.toFixed(2)}, ${b.z.toFixed(2)}`);
  }
});

test("steps up to knee-high are walked up and down, no jump; a higher one stops you", async () => {
  for (const rise of [0.12, 0.25]) {
    const blocks: [number, number, number][] = [];
    for (let i = 0; i < 4; i++) for (let y = 3; y < 9; y++) blocks.push([6 + i, y, rise * (i + 1)]);
    for (let i = 0; i < 3; i++) for (let y = 3; y < 9; y++) blocks.push([10 + i, y, rise * (3 - i)]);
    const { env } = await pad(20, 12, blocks);
    const b = newBody(4, 6);
    let top = 0;
    let flew = false;
    for (let i = 0; i < 600 && b.x < 14.5; i++) {
      stepBody(b, go(), env);
      top = Math.max(top, b.z);
      flew ||= b.up;
    }
    assert.ok(Math.abs(top - rise * 4) < 0.03, `${rise}: up to ${top.toFixed(3)}`);
    assert.ok(b.x >= 14.5 && Math.abs(b.z) < 0.03, `${rise}: over and down at ${b.x.toFixed(2)}, ${b.z.toFixed(3)}`);
    assert.equal(flew, false, `${rise}: never left the ground`);
  }
  const wall: [number, number, number][] = [];
  for (let y = 0; y < 12; y++) wall.push([6, y, 0.4]);
  const { env } = await pad(20, 12, wall);
  const b = newBody(4, 6);
  run(b, env, 2, () => go());
  assert.ok(b.x < 6 && Math.abs(b.z) < 0.01, `stopped at ${b.x.toFixed(2)}`);
});

test("off a ledge higher than a step (indoors): a fall, not glued down it", async () => {
  const blocks: [number, number, number][] = [];
  for (let x = 0; x < 8; x++) for (let y = 0; y < 12; y++) blocks.push([x, y, 0.5]);
  const { env } = await pad(20, 12, blocks);
  const b = newBody(6, 6, 0.5);
  let fell = false;
  for (let i = 0; i < 240; i++) {
    stepBody(b, go(), env);
    fell ||= b.up;
  }
  assert.ok(fell && Math.abs(b.z) < 0.01, `fell off it and landed: ${b.z.toFixed(3)}`);
});

test("into a wall at an angle the body slides along it", async () => {
  const blocks: [number, number, number][] = [];
  for (let y = 0; y < 12; y++) blocks.push([8, y, Number.POSITIVE_INFINITY]);
  const { env } = await pad(20, 12, blocks);
  const b = newBody(6, 2);
  run(b, env, 2, () => go({ x: 0.8, y: 0.6 }));
  assert.ok(b.x < 8 - 0.2, `kept out of the wall: ${b.x.toFixed(2)}`);
  assert.ok(b.y > 6, `slid along it to y ${b.y.toFixed(2)}`);
});

test("a roll goes through a one-tile gap in a wall", async () => {
  const blocks: [number, number, number][] = [];
  for (let y = 0; y < 12; y++) if (y !== 6) blocks.push([8, y, Number.POSITIVE_INFINITY]);
  const { env } = await pad(20, 12, blocks);
  const b = newBody(6.5, 6.5);
  run(b, env, 1, (t) => go({ dodgePressed: t < STEP_DT }));
  assert.ok(b.x > 9, `through to ${b.x.toFixed(2)}`);
});

test("a jump under a low ceiling: the head stops on it", async () => {
  const { env } = await pad(20, 12, [], [box3(0, 0, 20, 12, 2.2, 2.4)]);
  const b = newBody(5, 6);
  run(b, env, 0.1, () => NO_INPUT);
  const steps = run(b, env, 1, (t) => ({ ...NO_INPUT, jump: true, jumpPressed: t < STEP_DT }));
  const top = Math.max(...steps.map((s) => s.b.z));
  // (1.75 tall: its head at 2.2 when its feet are at 0.45)
  assert.ok(top < 0.5 && top > 0.3, `the feet no higher than ${top.toFixed(3)}`);
  assert.ok(!b.up && Math.abs(b.z) < 0.01, "and down again");
});

test("plan 50's first ask: a 1.2 m fence stops a walker; a flier at 2 m goes over it", async () => {
  const { env, mover } = await pad(30, 12, [], [box3(10, 0, 10.12, 12, 0, 1.2)]);
  const walker = newBody(6, 6);
  run(walker, env, 3, () => go());
  assert.ok(walker.x < 10, `the walker stopped at ${walker.x.toFixed(2)}`);
  const flier = newBody(6, 3, 2);
  flier.up = true;
  for (let i = 0; i < 360; i++) {
    flier.vx = 4;
    flier.vy = 0;
    flier.vz = 0;
    mover.step(flier, STEP_DT, 0, undefined, true);
  }
  assert.ok(
    flier.x > 14 && Math.abs(flier.z - 2) < 0.05,
    `the flier over it to ${flier.x.toFixed(2)}, ${flier.z.toFixed(2)}`,
  );
});

test("the server's questions: a body doesn't fit in a wall, does beside it; the ground's a top's", async () => {
  const { collider } = await pad(20, 12, [
    [8, 6, Number.POSITIVE_INFINITY],
    [5, 6, 0.64],
  ]);
  assert.equal(collider.fitsAt(8.5, 6.5, 0, 0.05), false, "in the wall");
  assert.equal(collider.fitsAt(7.5, 6.5, 0, 0.05), true, "beside it");
  assert.ok(Math.abs(collider.groundAt(5.5, 6.5, 0.7) - 0.64) < 0.01, "on the desk-high top");
  assert.ok(Math.abs(collider.groundAt(2.5, 6.5, 0)) < 0.01, "the floor");
  assert.equal(collider.clear({ x: 7.5, y: 6.5 }, { x: 9.5, y: 6.5 }, 0.05, 0), false, "not through the wall");
  assert.equal(collider.clear({ x: 7.5, y: 3.5 }, { x: 9.5, y: 3.5 }, 0.05, 0), true, "past it");
  // (off the pad: nothing under it — not a place to be)
  assert.equal(collider.fitsAt(25, 6, 0, 0.05), false, "off the world's edge");
});

// The HQ as the world-server loads it, on Jolt; each floor's frame.
async function hq() {
  const { campusBuilding } = await import("../building.ts");
  const { studio } = await import("../maps/studio.ts");
  const { openingsIntoWalls } = await import("../openings.ts");
  const { splitAll } = await import("../tops.ts");
  const { elevOf, offsetOf } = await import("../levels.ts");
  const { buildingSolids, WorldBuilder } = await import("./build.ts");
  const into = openingsIntoWalls(studio, splitAll(studio.objects).objects);
  const cb = campusBuilding(into.map, into.objects);
  assert.ok(cb);
  const map = cb.map;
  const moved = new Map(cb.moved.map((o) => [o.id, o]));
  const objects = [...into.objects.map((o) => moved.get(o.id) ?? o), ...cb.add];
  const b0 = buildingSolids(map, objects);
  const world = await PhysicsWorld.create(loadJolt, sizesFor({ statics: b0.statics.size }));
  worlds.push(world);
  new WorldBuilder(world).building(b0);
  world.settle();
  const frame = (l: number): Frame => {
    const o = offsetOf(map, l);
    return { ox: o.x, oy: o.y, elev: elevOf(l) };
  };
  return { map, objects, world, frame };
}

test("up a flight of the HQ's stairs to the floor above, the floor changed on the way as the game does", async () => {
  const { across, floorsOf, levelMap, objLevel } = await import("../levels.ts");
  const { floorAt, stairsPoint } = await import("../stairs.ts");
  const { map, objects, world, frame } = await hq();
  const floors = floorsOf(map);
  const stairs = objects.find((o) => o.kind === "stairs" && floors.includes(objLevel(o, map) + 1));
  assert.ok(stairs, "a flight with a floor above it");
  let level = objLevel(stairs, map);
  const start = level;
  const grids = new Map<number, Grid>();
  const gridOf = (l: number) => {
    let g = grids.get(l);
    if (!g) {
      g = Grid.from(levelMap(map, l) ?? map, objects);
      grids.set(l, g);
    }
    return g;
  };
  const mover = new CharacterMover(world, () => frame(level));
  // the way up, in the stairs' own frame: flight A (u 3), the half landing, flight B (u 1) back
  let way = [
    [3, 6],
    [1, 6],
    [1, 0.6],
  ].map(([u, v]) => stairsPoint(stairs, u, v));
  const s = stairsPoint(stairs, 3, 1);
  const b = newBody(s.x, s.y, 0);
  let airborne = 0;
  for (let i = 0; i < 20 / STEP_DT && way.length; i++) {
    const g = gridOf(level);
    const env: MoveEnv = { grid: new JoltCollider(world, g, frame(level)), mover, footing: () => "floor" };
    const [w] = way;
    const d = Math.hypot(w.x - b.x, w.y - b.y);
    if (d < 0.3) {
      way.shift();
      continue;
    }
    stepBody(b, go({ x: (w.x - b.x) / d, y: (w.y - b.y) / d }), env);
    if (b.up) airborne++;
    // past a storey's band: the next floor's frame (the controller's floorAt)
    const ch = floorAt(map, level, b, b.z);
    if (ch) {
      way = way.map((p) => across(map, level, ch.level, p));
      b.x = ch.at.x;
      b.y = ch.at.y;
      b.z += ch.dz;
      level = ch.level;
    }
  }
  assert.equal(way.length, 0, `walked the whole way (left: ${way.length}, at ${b.x.toFixed(2)}, ${b.y.toFixed(2)})`);
  assert.equal(level, start + 1, "on the floor above");
  assert.ok(Math.abs(b.z) < 0.05, `on its floor: z ${b.z.toFixed(3)}`);
  assert.ok(airborne < 0.2 / STEP_DT, `walked, not hopped: ${(airborne * STEP_DT).toFixed(2)} s off the treads`);
});

test("one building: a flier stops at the ceiling; through walls, up through it onto the floors above; the roof over the top", async () => {
  const { STOREY, elevOf, floorsOf } = await import("../levels.ts");
  const { floorAt } = await import("../stairs.ts");
  const { FLY } = await import("../admin.ts");
  const { WALL_H } = await import("../shapes/index.ts");
  const { map, world, frame } = await hq();
  const floors = floorsOf(map);
  const top = Math.max(...floors);
  // a tile of floor 1 with its ceiling right over it (nothing between: no stairwell, no lift)
  const f1 = frame(1);
  let spot: { x: number; y: number } | null = null;
  for (let y = 4; y < 32 && !spot; y++)
    for (let x = 4; x < 44 && !spot; x++) {
      const X = f1.ox + x + 0.5;
      const Z = f1.oy + y + 0.5;
      const up = world.rayHit(X, f1.elev + 0.5, Z, 0, 1, 0, 6);
      if (up !== null && Math.abs(up - (WALL_H - 0.5)) < 0.01 && world.fits(X, f1.elev + 0.1, Z, 0.3, 1.7))
        spot = { x: x + 0.5, y: y + 0.5 };
    }
  assert.ok(spot, "an open tile on floor 1");
  // rising for 3 s as a flier does, the floor taken from the height as the controller does
  const rise = (level: number, ghost: boolean) => {
    const mover = new CharacterMover(
      world,
      () => frame(level),
      () => ({ mask: ghost ? "ghost" : "all", pass: null }),
    );
    const b = newBody((spot as { x: number }).x, (spot as { y: number }).y, 0);
    const seen = new Set([level]);
    for (let i = 0; i < 3 / STEP_DT; i++) {
      b.vx = 0;
      b.vy = 0;
      b.vz = FLY.rise;
      mover.step(b, STEP_DT, 0.35, undefined, true);
      const ch = floorAt(map, level, b, b.z);
      if (ch) {
        b.x = ch.at.x;
        b.y = ch.at.y;
        b.z += ch.dz;
        level = ch.level;
        seen.add(level);
      }
    }
    mover.dispose();
    return { level, z: b.z, seen };
  };
  const shut = rise(1, false);
  assert.equal(shut.level, 1, "the ceiling stops a flier");
  assert.ok(shut.z < WALL_H - BODY.h + 0.05, `under it: z ${shut.z.toFixed(2)}`);
  // (3 s at FLY.rise: up through every floor and out through the roof, outdoors over it)
  const ghost = rise(1, true);
  assert.deepEqual(
    [...ghost.seen].sort(),
    floors
      .filter((l) => l >= 1)
      .concat([0])
      .sort(),
    "through walls: up through each ceiling, a floor at a time",
  );
  assert.equal(ghost.level, 0, "over the roof: outdoors");
  assert.ok(ghost.z > elevOf(top) + STOREY, `over it: z ${ghost.z.toFixed(2)}`);
  // the top floor: a roof over it, where a next floor's slab would be
  const roof = rise(top, false);
  assert.equal(roof.level, top);
  assert.ok(roof.z < WALL_H - BODY.h + 0.05, `the roof stops a flier: z ${roof.z.toFixed(2)}`);
  // over the roof, or beside the building, a height is just a height: no floor of the building
  assert.equal(floorAt(map, 0, { x: -40, y: -5 }, 8), null, "beside the building");
  const g = { x: spot.x - frame(0).ox, y: spot.y - frame(0).oy };
  assert.equal(floorAt(map, 0, g, elevOf(top) + STOREY + 1), null, "on the roof");
  assert.equal(floorAt(map, 2, { x: -3, y: 10 }, 0.5)?.level, 0, "out through a wall up a floor: outdoors");
  assert.equal(floorAt(map, 0, g, elevOf(2) + 0.3)?.level, 2, "up in the building: that floor");
});

test("on land the world hasn't built yet (just teleported far): the grid's way, standing, not falling", async () => {
  const world = await PhysicsWorld.create(loadJolt, sizesFor({ statics: 8 }));
  worlds.push(world);
  // (a floor 10 a side; past it the land, 2 up, everywhere — and none of it in Jolt's world)
  const grid = new Grid(10, 10);
  grid.walk.fill(1);
  grid.top.fill(0);
  grid.outside = { walkable: () => true, height: () => 2 };
  const collider = new JoltCollider(world, grid, FRAME);
  const mover = new CharacterMover(
    world,
    () => FRAME,
    undefined,
    (x, y) => grid.onLand(x, y),
  );
  const env: MoveEnv = { grid: collider, mover, footing: () => "floor" };
  assert.equal(mover.ready(50, 5), false);
  const b = newBody(50, 5);
  b.z = 2;
  run(b, env, 1, () => NO_INPUT);
  assert.ok(Math.abs(b.z - 2) < 0.05, `stood at ${b.z}`);
  // and walked on it, at its height
  run(b, env, 0.5, () => go());
  assert.ok(b.x > 50.5 && Math.abs(b.z - 2) < 0.05, `walked to ${b.x}, ${b.z}`);
});

test("up a 30° slope: along the ground the body keeps its pace; without, the slope eats it (plan 56 H.3)", async () => {
  const end: Record<string, Body> = {};
  let pace = 0;
  for (const along of [false, true]) {
    const { world, env, mover } = await pad(40, 12);
    // a ramp of land rising east from x 4, 30°, to a 4 m top
    const n = 65;
    const h = new Float32Array(n * n);
    for (let j = 0; j < n; j++)
      for (let i = 0; i < n; i++) h[j * n + i] = Math.min(4, Math.max(0, (i * 0.5 - 4) * Math.tan(Math.PI / 6)));
    world.setLand("land:0,0", { x0: 0, z0: 0, n, step: 0.5, h });
    world.settle();
    mover.along = along;
    const b = newBody(2, 6);
    const tr = run(b, env, 2.4, () => go());
    end[String(along)] = b;
    if (along) {
      // its pace across the slope, between x 6 and x 9 (on it, past the foot's crease)
      const a = tr.find((s) => s.b.x >= 6);
      const c = tr.find((s) => s.b.x >= 9);
      assert.ok(a && c, `along: up it (to x ${b.x.toFixed(2)}, z ${b.z.toFixed(2)})`);
      pace = (c.b.x - a.b.x) / (c.t - a.t);
      assert.ok(c.b.z > 2, `up the slope: z ${c.b.z}`);
    }
  }
  assert.ok(pace > 0.95 * MOVE.jog, `along: ${pace}`);
  assert.ok(end.true.x > end.false.x + 2, `along to x ${end.true.x}, today's to ${end.false.x}`);
});
