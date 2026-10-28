import assert from "node:assert/strict";
import { test } from "node:test";
import { parkAt, parkedBody, SPECS } from "./car/index.ts";
import { BODY_R, Grid, moveStep, setOutdoors } from "./grid.ts";
import { BENCH, outdoorsAt } from "./grounds.ts";
import type { MapDef } from "./map.ts";
import {
  Allowance,
  type Body,
  byteToYaw,
  dodging,
  type Footing,
  MOVE,
  MoveClock,
  type MoveEnv,
  type MoveInput,
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
