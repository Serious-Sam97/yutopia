import assert from "node:assert/strict";
import { test } from "node:test";
import { parkAt, parkedBody, SPECS } from "./car/index.ts";
import { BODY_R, Grid, moveStep, setOutdoors } from "./grid.ts";
import { BENCH, outdoorsAt } from "./grounds.ts";
import type { MapDef } from "./map.ts";
import { FLOW_MOVES } from "./move/flow-moves.ts";
import {
  Allowance,
  type Body,
  byteToYaw,
  dodging,
  type FlowWorld,
  type Footing,
  KH_FEEL,
  KH_MOVE,
  MOVE,
  MoveClock,
  type MoveEnv,
  type MoveInput,
  type MoveSpec,
  NO_INPUT,
  newBody,
  packMv,
  probeVault,
  STEP_DT,
  type StepEvents,
  speedCap,
  speedOf,
  stepBody,
  unpackMv,
  yawToByte,
} from "./move/index.ts";

// The numbers docs/plan/29-the-move.md's phase 1 must hit.

/** An open pad, w × h tiles of floor; `blocks`: [x, y, top] solid tiles you can stand on. */
function pad(w = 40, h = 12, blocks: [number, number, number][] = []): Grid {
  const g = new Grid(w, h);
  g.walk.fill(1);
  g.top.fill(0);
  for (const [x, y, t] of blocks) g.block(x, y, t);
  return g;
}
const on = (grid: Grid, f: Footing = "floor"): MoveEnv => ({ grid, footing: () => f });
const go = (o: Partial<MoveInput> = {}): MoveInput => ({ ...NO_INPUT, x: 1, ...o });

/** Steps `b` for `secs` under `inp(t)` (t: s since the start); every step's events. */
function run(b: Body, env: MoveEnv, secs: number, inp: (t: number) => MoveInput, spec: MoveSpec = MOVE) {
  const out: { t: number; b: Body; ev: StepEvents }[] = [];
  const n = Math.round(secs / STEP_DT);
  for (let i = 0; i < n; i++) {
    const t = i * STEP_DT;
    const ev = stepBody(b, inp(t), env, spec);
    out.push({ t: t + STEP_DT, b: { ...b, verb: b.verb ? { ...b.verb } : null }, ev });
  }
  return out;
}

test("from a standstill to a jog in about 0.15 s on a floor; a stick's tilt is a walk", () => {
  const b = newBody(2, 6);
  const tr = run(b, on(pad()), 1, () => go());
  const at = tr.find((s) => speedOf(s.b) >= 0.95 * MOVE.jog);
  assert.ok(at && at.t >= 0.1 && at.t <= 0.18, `reached a jog at ${at?.t}`);
  assert.ok(Math.abs(speedOf(b) - MOVE.jog) < 1e-6);
  assert.equal(b.gait, "jog");
  const w = newBody(2, 6);
  run(w, on(pad()), 1, () => go({ x: 0.5 }));
  assert.ok(Math.abs(speedOf(w) - MOVE.walk) < 1e-6);
  assert.equal(w.gait, "walk");
});

test("a jog stops in a step on a floor, and skates on for metres on ice", () => {
  for (const [f, lo, hi] of [
    ["floor", 0, 0.3],
    ["ice", 2.5, 4.5],
  ] as const) {
    const b = newBody(2, 6);
    const env = on(pad(60), f);
    run(b, env, 3, () => go());
    assert.ok(Math.abs(speedOf(b) - MOVE.jog) < 1e-3, `${f}: up to a jog`);
    const x0 = b.x;
    run(b, env, 4, () => NO_INPUT);
    assert.ok(speedOf(b) < 1e-6);
    const d = b.x - x0;
    assert.ok(d >= lo && d <= hi, `${f}: stopped in ${d.toFixed(2)} tiles`);
  }
});

test("a sprint only goes roughly ahead, and the deep snow's speed caps it", () => {
  const b = newBody(2, 6);
  run(b, on(pad(60)), 1.5, () => go({ sprint: true }));
  assert.ok(Math.abs(speedOf(b) - MOVE.sprint) < 1e-3);
  assert.equal(b.gait, "sprint");
  // straight back the other way: a jog until the body has turned round
  const tr = run(b, on(pad(60)), 0.05, () => go({ x: -1, sprint: true }));
  assert.equal(tr[0].b.gait, "jog");
});

test("the feet leave the ground 40 ms after the press; a tap goes ~0.55, held 0.8", () => {
  for (const [hold, apex] of [
    [false, MOVE.hopTap],
    [true, MOVE.hop],
  ] as const) {
    const b = newBody(5, 6);
    const tr = run(b, on(pad()), 1.2, (t) => ({
      ...NO_INPUT,
      jumpPressed: t < STEP_DT / 2,
      jump: hold || t < STEP_DT / 2,
    }));
    const off = tr.find((s) => s.ev.jumped);
    assert.ok(off, "jumped");
    assert.ok(Math.abs(off.t - MOVE.takeoff) <= STEP_DT + 1e-9, `off the ground at ${off.t}`);
    const top = Math.max(...tr.map((s) => s.b.z));
    assert.ok(Math.abs(top - apex) < 0.04, `${hold ? "held" : "tapped"}: up to ${top.toFixed(3)}`);
    assert.ok(tr.some((s) => s.ev.landed !== undefined));
  }
});

test("a sprinting jump is a flip, higher", () => {
  const b = newBody(2, 6);
  run(b, on(pad(60)), 1, () => go({ sprint: true }));
  const tr = run(b, on(pad(60)), 1, (t) => go({ sprint: true, jump: true, jumpPressed: t < STEP_DT / 2 }));
  assert.equal(tr.find((s) => s.ev.jumped)?.ev.jumped, "flip");
  assert.ok(Math.abs(Math.max(...tr.map((s) => s.b.z)) - MOVE.flip) < 0.05);
});

test("coyote time: a jump just after stepping off a ledge still goes; later, it waits for the ground", () => {
  // a platform 0.5 up from x 0 to 6
  const blocks: [number, number, number][] = [];
  for (let x = 0; x < 6; x++) for (let y = 4; y < 8; y++) blocks.push([x, y, 0.5]);
  const env = on(pad(40, 12, blocks));
  for (const [late, coyote] of [
    [0.08, true],
    [0.16, false],
  ] as const) {
    const b = newBody(4, 6, 0.5);
    let offAt = -1;
    let jumpedAt = -1;
    let jumpedZ = 0;
    for (let i = 0; i < 240; i++) {
      const t = i * STEP_DT;
      const press = offAt >= 0 && t >= offAt + late && t < offAt + late + STEP_DT;
      const ev = stepBody(b, go({ jump: true, jumpPressed: press }), env);
      if (offAt < 0 && b.up) offAt = t;
      if (ev.jumped && jumpedAt < 0) {
        jumpedAt = t;
        jumpedZ = b.z;
      }
    }
    assert.ok(offAt > 0, "stepped off");
    if (coyote) assert.ok(jumpedZ > 0.3, `jumped from the air at z ${jumpedZ.toFixed(2)}`);
    // too late for coyote time: kept (falling) and jumped on landing, from the floor
    else assert.ok(jumpedAt > 0 && jumpedZ < 0.1, `jumped on landing at z ${jumpedZ.toFixed(2)}`);
  }
});

test("a press just before landing jumps again on landing; too early, it doesn't", () => {
  for (const [before, again] of [
    [0.12, true],
    [0.32, false],
  ] as const) {
    const b = newBody(5, 6);
    const env = on(pad());
    // the first jump, held: its air time
    const air = 2 * Math.sqrt((2 * MOVE.hop) / MOVE.g);
    const pressAt = MOVE.takeoff + air - before;
    let jumps = 0;
    for (let i = 0; i < 300; i++) {
      const t = i * STEP_DT;
      const ev = stepBody(
        b,
        {
          ...NO_INPUT,
          jump: true,
          jumpPressed: t < STEP_DT / 2 || (t >= pressAt && t < pressAt + STEP_DT),
        },
        env,
      );
      if (ev.jumped) jumps++;
    }
    assert.equal(jumps, again ? 2 : 1, `pressed ${before} s before landing`);
  }
});

test("over a hip-high top a vault, up a chest-high one a mantle; too high, a jump", () => {
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
    const g = pad(20, 12, blocks);
    const p = probeVault(g, 5.2, 6, 0, 1, 0);
    assert.equal(p?.kind ?? null, want, `top ${h}`);
    if (p) assert.ok(Math.abs(p.h - h) < 1e-6);
  }
  // nothing ahead, or going away: nothing
  assert.equal(probeVault(pad(), 5, 6, 0, 1, 0), null);
});

test("outdoors, the bench on the land is vaulted, a parked car's roof climbed onto", () => {
  for (const [top, want] of [
    [0.45, "vault"],
    [1.43, "mantle"],
  ] as const) {
    // land everywhere; a row of tiles at x 6 you can't walk, with something on them
    const g = new Grid(20, 12);
    g.land.fill(1);
    for (let y = 0; y < 12; y++) for (let x = 0; x < 20; x++) g.walk[y * 20 + x] = x === 6 && y > 2 && y < 9 ? 0 : 1;
    g.outside = {
      walkable: () => true,
      height: () => 0,
      top: (tx, ty) => (tx === 6 && ty > 2 && ty < 9 ? top : Number.NaN),
    };
    const p = probeVault(g, 5.2, 6, 0, 1, 0);
    assert.equal(p?.kind ?? null, want, `top ${top}`);
    // walking into it (no jump): it stops you
    const b = newBody(4, 6);
    run(b, on(g), 1, () => go());
    assert.ok(b.x < 6 && b.z === 0);
  }
});

test("on the real Grounds: the clearing's bench is got over with a jump from either side, and stops a walk", () => {
  // (a one-tile grid at the building's corner: everything else is the land round it)
  const g = new Grid(1, 1);
  g.outside = outdoorsAt(0, 0);
  const env: MoveEnv = { grid: g, footing: () => "snow" };
  // (its middle: it's drawn a metre each side of BENCH.x)
  const x = BENCH.x + 0.5;
  const row = Math.floor(BENCH.z);
  // its seat: ~0.5 over the lower ground north of it, ~0.35 over the slope south of it — a
  // vault, or (no landing as low beyond it) up onto it
  for (const [y, dir] of [
    [row - 0.6, 1],
    [row + 1.25, -1],
  ] as const) {
    const p = probeVault(g, x, y, g.groundAt(x, y, 50), 0, dir);
    assert.ok(p && p.h > 0.28 && p.h < 0.6, `from ${dir > 0 ? "the north" : "the south"}: its seat ${p?.h}`);
  }
  // walked into without a jump: it stops you
  const b = newBody(x, row + 2.5, g.groundAt(x, row + 2.5, 50));
  for (let i = 0; i < 240; i++) stepBody(b, go({ x: 0, y: -1 }), env);
  assert.ok(b.y > row + 1, "stopped at it");
});

test("a vault carries the body over the top and down beyond it; a mantle leaves it standing on top", () => {
  for (const [h, kind] of [
    [0.6, "vault"],
    [1.1, "mantle"],
  ] as const) {
    const blocks: [number, number, number][] = [];
    for (let y = 3; y < 9; y++) for (let x = 6; x < (kind === "mantle" ? 9 : 7); x++) blocks.push([x, y, h]);
    const env = on(pad(20, 12, blocks));
    const b = newBody(4.6, 6);
    let began: string | undefined;
    let ended: string | undefined;
    for (let i = 0; i < 200; i++) {
      const ev = stepBody(b, go({ jump: true, jumpPressed: i === 30 }), env);
      began ??= ev.verb;
      ended ??= ev.ended;
      if (ended) break;
    }
    assert.equal(began, kind);
    assert.equal(ended, kind);
    if (kind === "vault") {
      assert.ok(b.x > 7.2, `landed beyond it at ${b.x.toFixed(2)}`);
      assert.ok(Math.abs(b.z) < 1e-6);
    } else {
      assert.ok(b.x > 6.2 && Math.abs(b.z - h) < 1e-6, `stood on top at ${b.x.toFixed(2)}, ${b.z}`);
    }
    assert.equal(b.up, false);
  }
});

test("through a vault or a mantle the body is never inside what it goes over (the server checks)", () => {
  for (const [deep, h] of [
    [1, 0.6],
    [2, 0.64],
    [3, 1.1],
  ] as const) {
    const blocks: [number, number, number][] = [];
    for (let y = 3; y < 9; y++) for (let x = 6; x < 6 + deep; x++) blocks.push([x, y, h]);
    const g = pad(20, 12, blocks);
    const b = newBody(4.6, 6);
    let kind: string | undefined;
    let inside = 0;
    for (let i = 0; i < 260; i++) {
      const ev = stepBody(b, go({ jump: true, jumpPressed: i === 30 }), on(g));
      kind ??= ev.verb;
      // (the server's own check: a point, the feet's height)
      if (!g.fitsAt(b.x, b.y, b.z, 0.05)) inside++;
      if (ev.ended) break;
    }
    assert.ok(kind, `${deep} deep, ${h} up: got over it`);
    assert.equal(inside, 0, `${deep} deep, ${h} up (${kind}): inside it for ${inside} steps`);
  }
});

test("a jump pressed early at a chest-high wall catches its edge and climbs up", () => {
  const blocks: [number, number, number][] = [];
  for (let y = 3; y < 9; y++) for (let x = 8; x < 11; x++) blocks.push([x, y, 1.1]);
  const env = on(pad(20, 12, blocks));
  const b = newBody(5, 6);
  let verb: string | undefined;
  let z0 = -1;
  let pressed = false;
  for (let i = 0; i < 300; i++) {
    // the press 1.6 tiles out: a hop, then the edge caught on the way
    const press: boolean = !pressed && b.x >= 6.2;
    pressed ||= press;
    const ev = stepBody(b, go({ jump: true, jumpPressed: press }), env);
    if (ev.verb && !verb) {
      verb = ev.verb;
      z0 = b.z;
    }
    if (ev.ended) break;
  }
  assert.equal(verb, "mantle");
  assert.ok(z0 > 0, "caught in the air");
  assert.ok(Math.abs(b.z - 1.1) < 1e-6 && b.x > 8.2, `on top at ${b.x.toFixed(2)}, ${b.z}`);
});

test("a roll bursts about three tiles, dodging for a moment in the middle", () => {
  const b = newBody(3, 6);
  const tr = run(b, on(pad()), 0.6, (t) => ({ ...NO_INPUT, x: 1, dodgePressed: t < STEP_DT / 2 }));
  assert.equal(tr[0].ev.verb, "roll");
  const ended = tr.findIndex((s) => s.ev.ended === "roll");
  assert.ok(ended > 0);
  const d = tr[ended].b.x - 3;
  assert.ok(d > 2.5 && d < 3.3, `rolled ${d.toFixed(2)}`);
  const dodge = tr.filter((s) => dodging(s.b)).map((s) => s.t);
  assert.ok(dodge.length > 0 && dodge[0] >= MOVE.roll.iframes[0] && (dodge.at(-1) ?? 1) <= MOVE.roll.iframes[1] + 1e-9);
});

test("a roll goes through a one-tile gap in a wall, and the server takes every step of it", () => {
  // a wall across the way, open only at y 6–7; rolled at from straight on and a little off
  const blocks: [number, number, number][] = [];
  for (let y = 0; y < 12; y++) if (y !== 6) blocks.push([6, y, Number.POSITIVE_INFINITY]);
  const g = pad(20, 12, blocks);
  // (as far as the same roll goes in the open)
  const rolled = run(newBody(4.6, 6.5), on(pad(20, 12)), 0.6, (t) => ({
    ...NO_INPUT,
    x: 1,
    dodgePressed: t < STEP_DT / 2,
  }));
  const open = rolled[rolled.findIndex((s) => s.ev.ended === "roll")].b;
  for (const y0 of [6.5, 6.4, 6.6]) {
    const b = newBody(4.6, y0);
    const allow = new Allowance();
    let from = { x: b.x, y: b.y };
    let refused = 0;
    let inside = 0;
    let ended = false;
    for (let i = 0; i < 120 && !ended; i++) {
      const ev = stepBody(b, { ...NO_INPUT, x: 1, dodgePressed: i === 0 }, on(g));
      ended = ev.ended === "roll";
      if (!g.fitsAt(b.x, b.y, b.z, 0.05)) inside++;
      // (as the server sees it: a message every 50 ms, the way clear, within the roll's allowance)
      if (i % 6 === 5 || ended) {
        allow.grow(6 * STEP_DT, speedCap("roll"));
        if (!g.clear(from, b, 0.05, b.z) || !allow.spend(Math.hypot(b.x - from.x, b.y - from.y))) refused++;
        from = { x: b.x, y: b.y };
      }
    }
    assert.ok(
      ended && b.x > 7.3 && b.x > open.x - 0.1,
      `from y ${y0}: through to x ${b.x.toFixed(2)} (${open.x.toFixed(2)})`,
    );
    assert.equal(inside, 0, `from y ${y0}: in the wall for ${inside} steps`);
    assert.equal(refused, 0, `from y ${y0}: the server refused ${refused} messages`);
  }
});

test("crouching from a sprint slides — further on ice than on a floor", () => {
  const dist: Record<string, number> = {};
  for (const f of ["floor", "ice"] as const) {
    const b = newBody(2, 6);
    const env = on(pad(80), f);
    run(b, env, 3, () => go({ sprint: true }));
    const x0 = b.x;
    const tr = run(b, env, 2, (t) => go({ crouch: true, crouchPressed: t < STEP_DT / 2 }));
    assert.equal(tr[0].ev.verb, "slide");
    const end = tr.findIndex((s) => s.ev.ended === "slide");
    assert.ok(end > 0);
    dist[f] = tr[end].b.x - x0;
  }
  assert.ok(dist.floor > 2.5 && dist.floor < 6, `floor ${dist.floor}`);
  assert.ok(dist.ice > dist.floor * 1.4, `ice ${dist.ice}`);
});

test("steps up to knee-high are walked up and down, no jump", () => {
  for (const rise of [0.12, 0.25]) {
    // a flight of four risers going east, then down the far side
    const blocks: [number, number, number][] = [];
    for (let i = 0; i < 4; i++) for (let y = 3; y < 9; y++) blocks.push([6 + i, y, rise * (i + 1)]);
    for (let i = 0; i < 3; i++) for (let y = 3; y < 9; y++) blocks.push([10 + i, y, rise * (3 - i)]);
    const b = newBody(4, 6);
    let top = 0;
    let flew = false;
    for (let i = 0; i < 480 && b.x < 14.5; i++) {
      stepBody(b, go(), on(pad(20, 12, blocks)));
      top = Math.max(top, b.z);
      flew ||= b.up;
    }
    assert.ok(Math.abs(top - rise * 4) < 1e-4, `${rise}: up to ${top.toFixed(3)}`);
    assert.ok(b.x >= 14.5 && Math.abs(b.z) < 1e-6, `${rise}: over and down at ${b.x.toFixed(2)}, ${b.z}`);
    assert.equal(flew, false, `${rise}: never left the ground`);
  }
  // a wall higher than a step still stops you
  const b = newBody(4, 6);
  const wall: [number, number, number][] = [];
  for (let y = 0; y < 12; y++) wall.push([6, y, 0.4]);
  run(b, on(pad(20, 12, wall)), 2, () => go());
  assert.ok(b.x < 6 && b.z === 0);
});

test("into a wall at an angle the body slides along it", () => {
  const blocks: [number, number, number][] = [];
  for (let y = 0; y < 12; y++) blocks.push([8, y, Number.POSITIVE_INFINITY]);
  const b = newBody(6, 2);
  run(b, on(pad(20, 12, blocks)), 2, () => go({ x: 0.8, y: 0.6 }));
  assert.ok(b.x < 8 - 0.2 + 1e-6, "kept out of the wall");
  assert.ok(b.y > 6, `slid along it to y ${b.y.toFixed(2)}`);
});

test("the same input gives the same bits at any frame rate", () => {
  const ends: Body[] = [];
  for (const fps of [30, 60, 144]) {
    const b = newBody(3, 6);
    const env = on(pad(60));
    const clock = new MoveClock();
    // the input by the body's own time: the same every step whatever the frames
    const at = (t: number): MoveInput => ({
      ...NO_INPUT,
      x: t < 1 ? 1 : 0.4,
      y: t > 0.6 ? 0.5 : 0,
      sprint: t > 0.3 && t < 0.9,
      jump: t > 0.5 && t < 0.62,
      jumpPressed: t > 0.5 && t < 0.5 + STEP_DT,
    });
    for (let f = 0; f < fps * 2; f++) clock.advance(1 / fps, () => stepBody(b, at(b.t), env));
    ends.push(b);
  }
  const key = (b: Body) => [b.x, b.y, b.z, b.vx, b.vy, b.yaw].join(",");
  // (2 s is a whole number of steps at each rate, give or take the last)
  assert.ok(Math.abs(ends[0].t - ends[2].t) < STEP_DT * 1.01);
  const b30 = ends[0];
  const b144 = ends[2];
  if (Math.abs(b30.t - b144.t) < 1e-9) assert.equal(key(b30), key(b144));
  assert.equal(key(ends[0]), key(ends[1]));
});

test("the gait and the facing pack into a byte each", () => {
  for (const g of ["still", "walk", "jog", "sprint", "crouch", "aim"] as const) {
    const u = unpackMv(packMv(g, true, false));
    assert.equal(u.gait, g);
    assert.equal(u.crouch, true);
    assert.equal(u.aim, false);
  }
  for (const a of [0, 1, -2, 3.1, -3.1]) {
    const back = byteToYaw(yawToByte(a));
    assert.ok(Math.abs(Math.atan2(Math.sin(back - a), Math.cos(back - a))) < (Math.PI * 2) / 256);
  }
});

test("first person faces the look; a car in the way stops you", () => {
  const b = newBody(5, 6, 0, 0);
  run(b, on(pad()), 0.5, () => go({ x: 0, y: 1, faceLook: true, look: 0 }));
  assert.ok(Math.abs(b.yaw) < 1e-6 && b.y > 6.5, "stepped aside facing ahead");
  const c = newBody(5, 6);
  run(c, { ...on(pad()), blocked: (x) => x > 6 }, 1, () => go());
  assert.ok(c.x <= 6 && speedOf(c) === 0);
});

test("the server's allowance lets an honest sprint by and stops a fast one", () => {
  const cap = speedCap(null);
  for (const [speed, ok] of [
    [MOVE.sprint, true],
    [MOVE.sprint * 1.6, false],
  ] as const) {
    const a = new Allowance();
    let fine = true;
    for (let i = 0; i < 100; i++) {
      a.grow(0.05, cap);
      if (!a.spend(speed * 0.05)) fine = false;
    }
    assert.equal(fine, ok, `at ${speed}`);
  }
  // a burst (a roll) has its own ceiling
  assert.ok(speedCap("roll") > cap);
});

test("a parked car is solid to the skin of its body: either model, any angle, on the floor or out past it", () => {
  // a 6 × 6 floor with flat land all round it
  const map: MapDef = {
    key: "t",
    name: "t",
    width: 6,
    height: 6,
    tiles: Array.from({ length: 6 }, () => ".".repeat(6)),
    hWalls: Array.from({ length: 7 }, () => ".".repeat(6)),
    vWalls: Array.from({ length: 6 }, () => ".".repeat(7)),
    spawn: { x: 1, y: 1 },
    areas: [],
    objects: [],
  };
  setOutdoors(() => ({ walkable: () => true, height: () => 0 }));
  try {
    for (const model of ["sedan", "offroad"] as const)
      for (const [x, y] of [
        [3, 3], // on the floor (the lot)
        [40, 30], // out past it (driven off and left there)
      ])
        for (const car of [
          { id: "c", kind: "car", ...parkAt(x, y, 0.6, 0, { model }) },
          { id: "c", kind: "car", x: x - 1, y: y - 2.5, rot: 1, props: { model, dx: 0.37, dz: -0.21 } },
        ]) {
          const g = Grid.from(map, [car], undefined, { dressing: false });
          const b = parkedBody(car);
          const spec = SPECS[model].body;
          assert.ok(Math.abs(b.hx - (spec.ahead + spec.behind) / 2) < 1e-9 && Math.abs(b.hy - spec.width / 2) < 1e-9);
          const ca = Math.cos(b.a);
          const sa = Math.sin(b.a);
          // along it (u) and across it (v) from its middle
          const at = (u: number, v: number) => ({ x: b.x + ca * u - sa * v, y: b.y + sa * u + ca * v });
          const where = `${model} at ${x}, ${y}, ${car.rot === undefined ? "angled" : "square"}`;
          for (const [u, v] of [
            [0, 1],
            [0, -1],
            [1, 0],
            [-1, 0],
            [0.7, 0.7],
          ]) {
            const skin = (d: number) => at(u * (b.hx + d), v * (b.hy + d));
            const into = skin(BODY_R - 0.05);
            const clear = skin(BODY_R + 0.05);
            assert.ok(!g.fits(into.x, into.y), `${where}: a body's into it at ${u}, ${v}`);
            if (u === 0 || v === 0) assert.ok(g.fits(clear.x, clear.y), `${where}: room beside it at ${u}, ${v}`);
          }
          // walked into from beside it: stopped at its side
          const p = at(0, b.hy + 2);
          let pos = { x: p.x, y: p.y };
          for (let i = 0; i < 120; i++) pos = moveStepTo(g, pos, { x: sa, y: -ca });
          const gap = -(pos.x - b.x) * sa + (pos.y - b.y) * ca - b.hy;
          assert.ok(gap >= BODY_R - 1e-6 && gap < BODY_R + 0.1, `${where}: stopped ${gap} from its side`);
          // its roof: something to stand on
          const roof = g.groundAt(b.x, b.y, 2);
          assert.ok(roof > 1.3 && roof < 1.5 && g.fitsAt(b.x, b.y, roof), `${where}: its roof ${roof}`);
          // driven off: nothing there
          const gone = Grid.from(map, [{ ...car, props: { ...car.props, driven: 1 } }], undefined, { dressing: false });
          assert.ok(gone.fits(b.x, b.y), `${where}: driven off`);
        }
  } finally {
    setOutdoors(null);
  }
});

/** A walk's 1/60 s step in direction d (as the walker's moveStep takes it). */
function moveStepTo(g: Grid, pos: { x: number; y: number }, d: { x: number; y: number }) {
  return moveStep(g, pos, d, 4.2, 1 / 60);
}

// ── the KH feel (docs/plan/56-the-controls.md B), tried in /dev/move ──────────

// a press on one step only (the input's own way: afterFirstStep)
const pressAt = (t: number, at: number) => t >= at && t < at + STEP_DT;

test("KH: a run in under a tenth of a second, stopped as quick", () => {
  const b = newBody(2, 6);
  const tr = run(b, on(pad()), 0.5, () => go(), KH_MOVE);
  const at = tr.find((s) => speedOf(s.b) >= 0.95 * KH_MOVE.jog);
  assert.ok(at && at.t <= 0.1, `reached a run at ${at?.t}`);
  const stop = run(b, on(pad()), 0.3, () => ({ ...NO_INPUT }), KH_MOVE);
  const still = stop.find((s) => speedOf(s.b) < 0.1);
  assert.ok(still && still.t <= 0.1, `stopped at ${still?.t}`);
});

test("KH: up quick, a hang at the top, down quicker, never faster than the cap", () => {
  const b = newBody(2, 6);
  const tr = run(b, on(pad()), 2, (t) => ({ ...NO_INPUT, jump: t < 0.6, jumpPressed: pressAt(t, 0) }), KH_MOVE);
  const top = tr.reduce((m, s) => (s.b.z > m.b.z ? s : m));
  const off = tr.find((s) => s.b.up) as (typeof tr)[number];
  const down = tr.find((s) => s.t > top.t && !s.b.up) as (typeof tr)[number];
  assert.ok(top.b.z > 1.4 && top.b.z < 1.9, `a held jump peaks at ${top.b.z}`);
  assert.ok(down.t - top.t < top.t - off.t, `down in ${down.t - top.t} s, up in ${top.t - off.t} s`);
  // off a tall top, the fall is capped
  const h = newBody(2, 6, 30);
  h.up = true;
  const fall = run(h, on(pad()), 1.5, () => ({ ...NO_INPUT }), KH_MOVE);
  assert.ok(Math.min(...fall.map((s) => s.b.vz)) >= -(KH_MOVE.fallCap ?? 0) - 0.5, "the fall is capped");
});

test("KH: a second jump in the air goes higher than one; there's no third", () => {
  const once = newBody(2, 6);
  const one = run(once, on(pad()), 2, (t) => ({ ...NO_INPUT, jump: true, jumpPressed: pressAt(t, 0) }), KH_MOVE);
  const twice = newBody(2, 6);
  const two = run(
    twice,
    on(pad()),
    2.5,
    (t) => ({ ...NO_INPUT, jump: true, jumpPressed: pressAt(t, 0) || pressAt(t, 0.35) || pressAt(t, 0.6) }),
    KH_MOVE,
  );
  const peak = (tr: typeof one) => Math.max(...tr.map((s) => s.b.z));
  assert.ok(peak(two) > peak(one) + 0.6, `one ${peak(one)}, two ${peak(two)}`);
  assert.equal(two.filter((s) => s.ev.airJump).length, 1, "one jump in the air");
  // today's body: none
  const plain = newBody(2, 6);
  const p = run(plain, on(pad()), 2, (t) => ({
    ...NO_INPUT,
    jump: true,
    jumpPressed: pressAt(t, 0) || pressAt(t, 0.3),
  }));
  assert.equal(p.filter((s) => s.ev.airJump).length, 0);
});

test("KH: the dodge in the air dashes ~3 tiles on the level, once an air time", () => {
  const b = newBody(2, 6);
  const tr = run(
    b,
    on(pad(40, 12)),
    1.6,
    (t) => ({
      ...NO_INPUT,
      x: 1,
      jump: t < 0.3,
      jumpPressed: pressAt(t, 0),
      dodgePressed: pressAt(t, 0.25) || pressAt(t, 0.4),
    }),
    KH_MOVE,
  );
  const i = tr.findIndex((s) => s.ev.airDash);
  assert.ok(i >= 0, "an air dash");
  const end = tr[i + Math.round((KH_MOVE.airDash?.len ?? 0) / STEP_DT)].b;
  const from = tr[i].b;
  assert.ok(end.x - from.x > 2.4, `dashed ${end.x - from.x}`);
  assert.ok(Math.abs(end.z - from.z) < 0.08, `level within ${end.z - from.z}`);
  assert.equal(tr.filter((s) => s.ev.airDash).length, 1, "once an air time");
  assert.ok(!b.up, "landed");
  // landed: again
  const again = run(
    b,
    on(pad(40, 12)),
    0.6,
    (t) => ({ ...NO_INPUT, x: 1, jumpPressed: pressAt(t, 0), jump: true, dodgePressed: pressAt(t, 0.2) }),
    KH_MOVE,
  );
  assert.equal(again.filter((s) => s.ev.airDash).length, 1);
});

test("KH: today's body is untouched by the KH fields", () => {
  for (const k of ["gDown", "hang", "fallCap", "airJumps", "airJump", "airDash", "grip"] as const)
    assert.equal(MOVE[k], undefined, k);
});

// ── Flowmotion (docs/plan/56-the-controls.md F: flow.ts), in a made-up world: a wall to run up
// at x 8 (its face looking west, 9 high), a pole at (8, 3), a rail along y 9 from x 2 to x 12, a
// metre up; and the pad's own ledge, a block two tiles up ──
const FLOW: FlowWorld = {
  moves: FLOW_MOVES,
  pole: (x, y, _z, reach) => (Math.hypot(x - 8, y - 3) - 0.2 < reach ? { x: 8, y: 3, r: 0.2, top: 4 } : null),
  wall: (x, y, _z, ux, _uy, reach) =>
    y > 5 && y < 7 && 8 - x < reach + 0.25 && 8 - x > 0 && ux > 0
      ? { nx: -1, ny: 0, d: 8 - x - 0.25, top: 9, run: true }
      : null,
  rail: (x, y, z, reach) =>
    Math.abs(y - 9) < reach && x > 2 && x < 12 && Math.abs(z - 1) < 0.5
      ? { x, y: 9, z: 1, ux: 1, uy: 0, back: x - 2, ahead: 12 - x }
      : null,
};
const flowEnv = (grid: Grid): MoveEnv => ({ grid, footing: () => "floor", flow: FLOW });
const dash = (o: Partial<MoveInput> = {}): MoveInput => ({ ...NO_INPUT, x: 1, sprint: true, ...o });

test("Flowmotion: a jump at a wall in the air kicks off it, up and back", () => {
  const b = newBody(7.2, 6, 1);
  b.up = true;
  b.vx = 4;
  const tr = run(b, flowEnv(pad(20, 12)), 0.1, (t) => go({ jumpPressed: pressAt(t, 0) }), KH_MOVE);
  assert.equal(tr[0].ev.flow, "kick");
  assert.ok(tr[0].b.vx < -2 && tr[0].b.vz > 5, `off it: vx ${tr[0].b.vx}, vz ${tr[0].b.vz}`);
  // today's body: no Flowmotion, whatever the world tags
  const p = newBody(7.2, 6, 1);
  p.up = true;
  p.vx = 4;
  const today = run(p, flowEnv(pad(20, 12)), 0.1, (t) => go({ jumpPressed: pressAt(t, 0) }));
  assert.ok(!today.some((s) => s.ev.flow));
});

test("Flowmotion: dashing into a wall runs up it, then kicks off it", () => {
  const b = newBody(6.2, 6);
  b.vx = 8;
  b.gait = "sprint";
  const tr = run(b, flowEnv(pad(20, 12)), 1.4, () => dash(), KH_MOVE);
  assert.equal(tr.find((s) => s.ev.flow)?.ev.flow, "wallrun");
  const top = Math.max(...tr.map((s) => s.b.z));
  assert.ok(top > 4.5, `up it to ${top}`);
  const off = tr.find((s) => s.ev.flowEnd);
  assert.equal(off?.ev.flowEnd, "kick");
  assert.ok((off?.b.vx ?? 0) < -2, "kicked back off it");
});

test("Flowmotion: dashing at a wall slantwise runs along it in a low arc; a jump is off it, out", () => {
  // a long wall at x 8, its face looking west
  const LONG: FlowWorld = {
    ...FLOW,
    wall: (x, _y, _z, _ux, _uy, reach) =>
      8 - x < reach + 0.25 && 8 - x > 0 ? { nx: -1, ny: 0, d: Math.max(0, 8 - x - 0.25), top: 9, run: true } : null,
  };
  const env: MoveEnv = { grid: pad(20, 40), footing: () => "floor", flow: LONG };
  const start = () => {
    const b = newBody(7.5, 2);
    b.vx = 2;
    b.vy = 8;
    b.gait = "sprint";
    return b;
  };
  const b = start();
  const tr = run(b, env, 1.4, () => dash({ x: 0.25, y: 1 }), KH_MOVE);
  assert.equal(tr.find((s) => s.ev.flow)?.ev.flow, "wallside");
  const on = tr.filter((s) => s.b.flow?.kind === "wallside");
  assert.ok(
    on.every((s) => Math.abs(s.b.x - 7.75) < 1e-6),
    "held at the wall's face",
  );
  const top = Math.max(...on.map((s) => s.b.z));
  assert.ok(top > 0.8 && top < 1.6, `a low arc, up to ${top}`);
  assert.ok(on[on.length - 1].b.y - on[0].b.y > 7, "along it");
  assert.ok(
    tr.some((s) => s.ev.flowEnd),
    "off it in the end",
  );
  // a jump halfway: off it, out (west) and on (north)
  const c = start();
  const off = run(c, env, 0.6, (t) => dash({ x: 0.25, y: 1, jumpPressed: pressAt(t, 0.4) }), KH_MOVE).find(
    (s) => s.ev.flowEnd,
  );
  assert.equal(off?.ev.flowEnd, "jump");
  assert.ok((off?.b.vx ?? 0) < -2 && (off?.b.vy ?? 0) > 4, `out and on: ${off?.b.vx}, ${off?.b.vy}`);
});

test("Flowmotion: a pole swung round while the dash is held, flung off when it's let go", () => {
  const b = newBody(6.8, 3);
  b.vx = 8;
  b.gait = "sprint";
  const tr = run(b, flowEnv(pad(20, 12)), 1.2, (t) => dash({ sprint: t < 0.8 }), KH_MOVE);
  assert.equal(tr.find((s) => s.ev.flow)?.ev.flow, "swing");
  const round = tr.filter((s) => s.t > 0.1 && s.t < 0.7).map((s) => Math.hypot(s.b.x - 8, s.b.y - 3));
  assert.ok(Math.max(...round) - Math.min(...round) < 0.05, "round it at one radius");
  const flung = tr.find((s) => s.ev.flowEnd);
  assert.ok(flung && flung.t > 0.75 && flung.t < 0.9, `let go at ${flung?.t}`);
  assert.ok(Math.hypot(flung.b.vx, flung.b.vy) > 8 && flung.b.vz > 3, "flung on, up");
});

test("Flowmotion: landing on a rail grinds along it; a jump off it is the flow jump", () => {
  const b = newBody(4, 9.1, 1.2);
  b.up = true;
  b.vz = -1;
  b.vx = 3;
  const tr = run(
    b,
    flowEnv(pad(20, 12)),
    0.6,
    (t) => ({ ...NO_INPUT, jump: true, jumpPressed: pressAt(t, 0.5) }),
    KH_MOVE,
  );
  assert.equal(tr.find((s) => s.ev.flow)?.ev.flow, "grind");
  const mid = tr.find((s) => s.t > 0.4) as (typeof tr)[number];
  assert.ok(Math.abs(mid.b.z - 1) < 1e-6 && mid.b.x > 6, `along it: x ${mid.b.x}, z ${mid.b.z}`);
  const off = tr.find((s) => s.ev.flowEnd === "jump");
  assert.ok(off && off.b.vz > Math.sqrt(2 * KH_MOVE.g * KH_MOVE.hop) * 0.95, "higher than a jump");
  // (and off it: not caught again by the rail it rose off)
  const after = tr.filter((s) => s.t > (off?.t ?? 0));
  assert.ok(!after.some((s) => s.ev.flow === "grind"), "not caught again on the way up");
  assert.ok(Math.max(...after.map((s) => s.b.z)) > 1.8, "up off it");
  // (a tap: the whole flow jump all the same, not cut to a tap's)
  const d = newBody(4, 9.1, 1.2);
  d.up = true;
  d.vz = -1;
  d.vx = 3;
  const tap = run(
    d,
    flowEnv(pad(20, 12)),
    1.2,
    (t) => ({ ...NO_INPUT, jump: t >= 0.3 && t < 0.32, jumpPressed: pressAt(t, 0.3) }),
    KH_MOVE,
  );
  assert.ok(Math.max(...tap.map((s) => s.b.z)) > 1 + (KH_MOVE.flow?.jump ?? 0) * 0.95, "the whole arc");
  // left alone, off its end at x 12, on at its speed
  const c = newBody(10, 9.1, 1.2);
  c.up = true;
  c.vz = -1;
  c.vx = 3;
  const end = run(c, flowEnv(pad(20, 12)), 0.6, () => ({ ...NO_INPUT }), KH_MOVE).find((s) => s.ev.flowEnd);
  assert.equal(end?.ev.flowEnd, "off");
  assert.ok((end?.b.x ?? 0) >= 12);
});

test("Flowmotion: a solid rail in a vault's reach is jumped onto and ground along, not vaulted", () => {
  // (the rail as the world has it: a solid a tile wide and a metre up, under its tagged top)
  const b = newBody(5.5, 8);
  b.vy = 5;
  const tr = run(
    b,
    flowEnv(pad(20, 12, [[5, 9, 1]])),
    0.6,
    (t) => ({ ...NO_INPUT, y: 1, jump: true, jumpPressed: pressAt(t, 0) }),
    KH_MOVE,
  );
  assert.ok(!tr.some((s) => s.ev.verb === "vault" || s.ev.verb === "mantle"), "not vaulted");
  assert.equal(tr.find((s) => s.ev.flow)?.ev.flow, "grind");
});

test("Flowmotion: falling at a ledge a little too high to mantle, a hang, then up onto it", () => {
  // (a top four tiles deep: room to walk on along it after)
  const grid = pad(
    20,
    12,
    [6, 7, 8, 9].flatMap((x): [number, number, number][] => [
      [x, 5, 2],
      [x, 6, 2],
      [x, 7, 2],
    ]),
  );
  const b = newBody(5.4, 6, 0.6);
  b.up = true;
  b.vz = -0.5;
  const tr = run(b, flowEnv(grid), 0.8, () => go(), KH_MOVE);
  assert.equal(tr.find((s) => s.ev.flow)?.ev.flow, "hang");
  assert.ok(
    tr.some((s) => s.ev.flowEnd === "top"),
    "up onto it",
  );
  assert.ok(Math.abs(b.z - 2) < 1e-6 && !b.up, `on the top: z ${b.z}`);
});

test("Flowmotion: a wall run's limit — over tops to ~6.4 m from the ground, ~7.6 from a jump; higher, a kick off; low walls are climbed, not run", () => {
  const at = (top: number, jump: boolean) => {
    const W: FlowWorld = {
      ...FLOW,
      wall: (x, _y, _z, ux, _uy, reach) =>
        8 - x < reach + 0.25 && 8 - x > 0 && ux > 0 ? { nx: -1, ny: 0, d: 8 - x - 0.25, top, run: true } : null,
    };
    const grid = pad(
      20,
      12,
      [8, 9, 10].flatMap((x) => Array.from({ length: 12 }, (_, y): [number, number, number] => [x, y, top])),
    );
    const b = newBody(5.6, 6);
    b.vx = 8;
    b.gait = "sprint";
    const tr = run(
      b,
      { grid, footing: () => "floor", flow: W },
      2,
      (t) => dash({ jump: jump && t < 0.3, jumpPressed: jump && pressAt(t, 0) }),
      KH_MOVE,
    );
    return {
      ran: tr.some((s) => s.ev.flow === "wallrun"),
      end: tr.find((s) => s.ev.flowEnd === "top" || s.ev.flowEnd === "kick")?.ev.flowEnd,
    };
  };
  assert.equal(at(6.3, false).end, "top");
  assert.equal(at(6.5, false).end, "kick");
  assert.equal(at(7.5, true).end, "top");
  assert.equal(at(8, true).end, "kick");
  // (a wall a mantle or a jump gets onto isn't run up)
  assert.equal(at(1.8, false).ran, false);
  assert.equal(at(2.4, false).ran, true);
});

test("KH: a jump out of a slide is running's leap from the ground, never the air's flip", () => {
  const b = newBody(2, 6);
  b.vx = KH_MOVE.sprint;
  b.gait = "sprint";
  const env: MoveEnv = { grid: pad(60, 12), footing: () => "floor" };
  // sprinting, then into a slide
  run(b, env, 0.3, () => ({ ...NO_INPUT, x: 1, sprint: true }), KH_MOVE);
  run(b, env, 1 / 120, () => ({ ...NO_INPUT, x: 1, sprint: true, crouch: true, crouchPressed: true }), KH_MOVE);
  assert.equal(b.verb?.kind, "slide");
  run(b, env, 0.1, () => ({ ...NO_INPUT, x: 1, sprint: true, crouch: true }), KH_MOVE);
  // (as if the slide's last step read the feet a hair up)
  b.up = true;
  b.coyote = 0;
  const tr = run(
    b,
    env,
    0.3,
    (t) => ({ ...NO_INPUT, x: 1, sprint: true, jump: true, jumpPressed: pressAt(t, 0) }),
    KH_MOVE,
  );
  assert.ok(!tr.some((s) => s.ev.airJump), "not the jump in the air");
  assert.equal(b.jump, "leap");
});

test("KH_FEEL (plan 58): a run in ~0.2 s, a stop in ~0.25 s, a turn an arc, a reversal facing on till it's slow", () => {
  const env: MoveEnv = { grid: pad(80, 40), footing: () => "floor" };
  const until = (tr: { t: number; b: Body }[], f: (b: Body) => boolean) => tr.find((s) => f(s.b))?.t ?? Number.NaN;
  // from still to a run
  const a = newBody(5, 20);
  const go = run(a, env, 0.6, () => ({ ...NO_INPUT, x: 1 }), KH_FEEL);
  const reach = until(go, (b) => speedOf(b) > KH_FEEL.jog * 0.95);
  assert.ok(reach > 0.14 && reach < 0.3, `a run in ${reach} s`);
  // (KH_MOVE's: near at once)
  const k = newBody(5, 20);
  const kh = until(
    run(k, env, 0.6, () => ({ ...NO_INPUT, x: 1 }), KH_MOVE),
    (b) => speedOf(b) > KH_MOVE.jog * 0.95,
  );
  assert.ok(kh < 0.1, `today's KH body: ${kh} s`);
  // from a run to still
  const stop = until(
    run(a, env, 0.8, () => NO_INPUT, KH_FEEL),
    (b) => speedOf(b) < 0.2,
  );
  assert.ok(stop > 0.15 && stop < 0.35, `a stop in ${stop} s`);
  // a quarter turn on the run: an arc, facing where it goes all the way round
  const c = newBody(5, 20);
  run(c, env, 0.6, () => ({ ...NO_INPUT, x: 1 }), KH_FEEL);
  const turn = run(c, env, 0.6, () => ({ ...NO_INPUT, y: 1 }), KH_FEEL);
  const mid = turn.find((s) => s.t > 0.12) as (typeof turn)[number];
  const way = Math.atan2(mid.b.vy, mid.b.vx);
  assert.ok(way > 0.2 && way < 1.4, `mid-turn going between the two ways: ${way}`);
  assert.ok(Math.abs(Math.atan2(Math.sin(mid.b.yaw - way), Math.cos(mid.b.yaw - way))) < 0.35, "facing where it goes");
  // a reversal: still facing on while it slows, turned round once it's slow
  const d = newBody(5, 20);
  run(d, env, 0.6, () => ({ ...NO_INPUT, x: 1 }), KH_FEEL);
  const back = run(d, env, 0.8, () => ({ ...NO_INPUT, x: -1 }), KH_FEEL);
  const early = back.find((s) => s.t > 0.06) as (typeof back)[number];
  assert.ok(Math.cos(early.b.yaw) > 0.9, "facing on, slowing");
  assert.ok(Math.cos(d.yaw) < -0.9, "round, and away");
});
