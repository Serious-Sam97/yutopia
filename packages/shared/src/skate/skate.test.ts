// The board's step (docs/plan/103-the-skate.md, phases 2–4), in Node with exact time: the push, the carve, the
// ollie, the vert half-pipe's air and the way back in, flips and grabs landed or bailed, a grind along a rail and
// off its end, the manual's balance, the revert, the snow and the ice, walls, the wire's code.
import assert from "node:assert/strict";
import { test } from "node:test";
import { openFloor } from "../move/floor.ts";
import { STEP_DT } from "../move/spec.ts";
import { type Body, type MoveEnv, NO_INPUT, newBody, stepBody } from "../move/step.ts";
import type { Footing } from "../move/surface.ts";
import { PIECES, type PiecePlace, SkatePark } from "./pieces.ts";
import { type BoardVariant, SKATE } from "./spec.ts";
import { NO_KEYS, type SkateEvents, type SkateKeys, skateCode, skateEnv, skateOfCode, startSkate } from "./step.ts";

function world(pieces: PiecePlace[] = [], foot: Footing | ((x: number, y: number) => Footing) = "asphalt"): MoveEnv {
  return {
    grid: openFloor(),
    footing: typeof foot === "function" ? foot : () => foot,
    skate: skateEnv(new SkatePark(pieces)),
  };
}

type Keys = Partial<SkateKeys>;
/** Steps the body for `secs` under `keys` (a function of the time: presses for one step), gathering events. */
function ride(
  b: Body,
  env: MoveEnv,
  keys: Keys | ((t: number, b: Body) => Keys),
  secs: number,
  stop?: (b: Body) => boolean,
) {
  const evs: SkateEvents[] = [];
  const n = Math.round(secs / STEP_DT);
  for (let i = 0; i < n; i++) {
    const k = typeof keys === "function" ? keys(i * STEP_DT, b) : keys;
    const ev = stepBody(b, { ...NO_INPUT, skate: { ...NO_KEYS, ...k } }, env);
    if (ev.skate) evs.push(ev.skate);
    if (stop?.(b)) break;
  }
  return evs;
}
const speed = (b: Body) => Math.hypot(b.vx, b.vy, b.vz);
const on = (variant: BoardVariant = "street-pop", x = 0, y = 0, yaw = 0, s = 0) => {
  const b = newBody(x, y, 0, yaw);
  b.vx = Math.cos(yaw) * s;
  b.vy = Math.sin(yaw) * s;
  startSkate(b, variant, 1);
  return b;
};

test("pushing gets to the push's speed in a few seconds, and S stops it", () => {
  const env = world();
  const b = on();
  ride(b, env, { up: true }, 4);
  const s = b.skate?.s ?? 0;
  assert.ok(s > SKATE.push * 0.9 && s < SKATE.push * 1.05, `pushed to ${s.toFixed(2)}`);
  assert.ok(b.x > 12, `went ${b.x.toFixed(1)} m`);
  ride(b, env, { down: true }, 1.6);
  assert.ok(Math.abs(b.skate?.s ?? 9) < 0.2, `stopped: ${b.skate?.s}`);
});

test("a carve at speed is a tight arc (about the board's radius), the speed kept", () => {
  const env = world();
  const b = on("street-pop", 0, 0, 0, 6);
  if (b.skate) b.skate.s = 6;
  const y0 = b.yaw;
  ride(b, env, { right: true }, 0.5);
  const turned = b.yaw - y0;
  assert.ok(turned > 1, `turned ${turned.toFixed(2)} rad in half a second`);
  assert.ok((b.skate?.s ?? 0) > 5.5);
});

test("the ollie: a tap and a full crouch, Tony Hawk's heights", () => {
  for (const [hold, lo, hi] of [
    [0.02, 0.6, 0.95],
    [0.4, 1.3, 1.75],
  ] as const) {
    const env = world();
    const b = on("street-pop", 0, 0, 0, 5);
    if (b.skate) b.skate.s = 5;
    let top = 0;
    ride(
      b,
      env,
      (t) => ({ ollie: t < hold }),
      2,
      (bb) => {
        top = Math.max(top, bb.z);
        return false;
      },
    );
    assert.ok(top > lo && top < hi, `held ${hold}: up ${top.toFixed(2)} m`);
    assert.equal(b.skate?.mode, "roll", "back down on its wheels");
  }
});

test("a vert half-pipe: up the wall, a huge air straight up, back in fakie; with a 180 back in forwards", () => {
  for (const spin of [false, true]) {
    // the pipe along x: its walls at ±(2.4 + 3.2) m
    const env = world([{ kind: "half", x: 0, y: 0, z: 0, yaw: 0 }]);
    const b = on("vert-classic", 0, 0, 0, 11);
    if (b.skate) b.skate.s = 11;
    let top = 0;
    let wentUp = false;
    const evs = ride(
      b,
      env,
      (_t, bb) => ({ right: spin && bb.skate?.mode === "air" && (bb.skate.air?.spun ?? 0) < Math.PI }),
      4,
      (bb) => {
        top = Math.max(top, bb.z);
        if (bb.skate?.mode === "air") wentUp = true;
        return wentUp && bb.skate?.mode === "roll";
      },
    );
    const lipZ = PIECES.half.height;
    assert.ok(wentUp, "it took off from the lip");
    assert.ok(top > lipZ + 3, `up ${(top - lipZ).toFixed(1)} m over the coping`);
    assert.ok(!evs.some((e) => e.bail), `landed: ${JSON.stringify(evs.filter((e) => e.bail))}`);
    const k = b.skate;
    assert.ok(k, "still on the board");
    assert.ok(k.on, "back on the ramp");
    // coming down the wall: fakie with no spin, forwards with a 180
    if (spin) assert.ok(k.s > 3, `forwards ${k.s.toFixed(1)}`);
    else assert.ok(k.s < -3, `fakie ${k.s.toFixed(1)}`);
    const combo = evs.find((e) => e.combo)?.combo;
    void combo;
  }
});

test("a kickflip finished lands and counts; started too late, a bail", () => {
  const go = (at: number) => {
    const env = world();
    const b = on("street-pop", 0, 0, 0, 6);
    if (b.skate) b.skate.s = 6;
    const evs = ride(b, env, (t) => ({ ollie: t < 0.35, flipPressed: Math.abs(t - at) < STEP_DT / 2 }), 3);
    return { b, evs };
  };
  const ok = go(0.42);
  assert.ok(!ok.evs.some((e) => e.bail), "landed it");
  const banked = ok.evs.find((e) => e.combo)?.combo;
  assert.equal(banked?.name, "Kickflip");
  assert.equal(banked?.score, 100);
  // (the air's about 1.2 s: a flip begun at its very end isn't done when the wheels come down)
  const late = go(1.4);
  assert.equal(late.evs.find((e) => e.bail)?.bail, "trick");
  assert.equal(late.b.skate, null, "off the board");
});

test("a grind: caught on a rail, along it, off its end and the combo banked (×2 with a flip before)", () => {
  // a flat rail along x from 3 to 8 m, 0.38 m up; ridden at it along it, ollied up and onto it
  const env = world([{ kind: "rail", x: 3, y: 0, z: 0, yaw: 0 }]);
  const b = on("street-pop", 0, 0, 0, 6);
  if (b.skate) b.skate.s = 6;
  const modes = new Set<string>();
  const evs = ride(
    b,
    env,
    (t, bb) => ({ ollie: t < 0.3, flipPressed: Math.abs(t - 0.32) < STEP_DT / 2, grind: bb.skate?.mode === "air" }),
    3.5,
    (bb) => {
      if (bb.skate) modes.add(bb.skate.mode);
      return false;
    },
  );
  assert.ok(modes.has("grind"), `modes ${[...modes]}`);
  assert.ok(!evs.some((e) => e.bail), `no bail: ${JSON.stringify(evs.find((e) => e.bail))}`);
  const banked = evs.find((e) => e.combo)?.combo;
  assert.ok(banked && banked.count === 2, `combo ${JSON.stringify(banked)}`);
  assert.match(banked.name, /Kickflip \+ 50-50/);
  assert.ok(b.x > 8, "off the rail's end");
});

test("the manual: W then S, held by a hand on the needle; let alone, it tips and bails", () => {
  const env = world();
  const held = on("street-pop", 0, 0, 0, 7);
  if (held.skate) held.skate.s = 7;
  // a player watching the needle
  const evs = ride(
    held,
    env,
    (t, bb) => {
      const m = bb.skate?.manual;
      return {
        upPressed: Math.abs(t - 0.1) < STEP_DT / 2,
        downPressed: Math.abs(t - 0.2) < STEP_DT / 2,
        up: !!m && m.bal + m.v * 0.25 > 0,
        down: !!m && m.bal + m.v * 0.25 < 0,
      };
    },
    1.6,
  );
  assert.equal(held.skate?.mode, "manual", `in it: ${JSON.stringify(evs.filter((e) => e.bail))}`);
  const alone = on("street-pop", 0, 0, 0, 7);
  if (alone.skate) alone.skate.s = 7;
  const e2 = ride(
    alone,
    env,
    (t) => ({ upPressed: Math.abs(t - 0.1) < STEP_DT / 2, downPressed: Math.abs(t - 0.2) < STEP_DT / 2 }),
    5,
  );
  assert.equal(e2.find((e) => e.bail)?.bail, "balance");
});

test("the snow: deep snow throws you off at speed; on ice a push barely goes", () => {
  const deep = world([], (x) => (x > 3 ? "deep" : "asphalt"));
  const b = on("street-pop", 0, 0, 0, 6);
  if (b.skate) b.skate.s = 6;
  const evs = ride(b, deep, {}, 2);
  assert.equal(evs.find((e) => e.bail)?.bail, "snow");
  const ice = world([], "ice");
  const c = on();
  ride(c, ice, { up: true }, 2);
  const road = world();
  const d = on();
  ride(d, road, { up: true }, 2);
  assert.ok(
    (c.skate?.s ?? 0) < (d.skate?.s ?? 0) * 0.45,
    `ice ${c.skate?.s.toFixed(2)} vs road ${d.skate?.s.toFixed(2)}`,
  );
});

test("into a ledge's side: fast, a bail; slow, knocked back", () => {
  const env = world([{ kind: "ledge", x: 4, y: -2, z: 0, yaw: Math.PI / 2 }]);
  const fast = on("street-pop", 0, 0, 0, 8);
  if (fast.skate) fast.skate.s = 8;
  assert.equal(ride(fast, env, {}, 1.5).find((e) => e.bail)?.bail, "wall");
  const slow = on("street-pop", 0, 0, 0, 3);
  if (slow.skate) slow.skate.s = 3;
  ride(slow, env, {}, 1.5);
  assert.ok(slow.skate && slow.skate.s <= 0, "knocked back");
});

test("a kicker launches it forward off its top", () => {
  const env = world([{ kind: "kicker", x: 3, y: 0, z: 0, yaw: 0 }]);
  const b = on("street-pop", 0, 0, 0, 8);
  if (b.skate) b.skate.s = 8;
  let top = 0;
  let far = 0;
  const evs = ride(b, env, {}, 3, (bb) => {
    top = Math.max(top, bb.z);
    if (bb.skate?.mode === "air") far = bb.x;
    return false;
  });
  assert.ok(top > 0.9, `up ${top.toFixed(2)}`);
  assert.ok(far > 6, `flew to ${far.toFixed(1)}`);
  assert.ok(!evs.some((e) => e.bail));
});

test("landing sideways is a bail", () => {
  const env = world();
  const b = on("street-pop", 0, 0, 0, 6);
  if (b.skate) b.skate.s = 6;
  // ollie and spin a quarter turn, then let go
  const evs = ride(
    b,
    env,
    (t, bb) => ({ ollie: t < 0.3, right: bb.skate?.mode === "air" && (bb.skate.air?.spun ?? 0) < Math.PI / 2 }),
    3,
  );
  assert.equal(evs.find((e) => e.bail)?.bail, "sideways");
});

test("on the wire: the mode, the trick, fakie, goofy, the board", () => {
  const b = on("cruiser-wood");
  const k = b.skate;
  assert.ok(k);
  k.stance = -1;
  k.s = -3;
  k.mode = "grind";
  k.grind = { id: "smith", ux: 1, uy: 0, slope: 0, what: "rail", across: false, t: 0, bal: 0, v: 0 };
  const look = skateOfCode(skateCode(k));
  assert.deepEqual(
    { ...look, lean: 0 },
    {
      mode: "grind",
      trick: "smith",
      fakie: true,
      stance: -1,
      variant: "cruiser-wood",
      double: false,
      crouch: false,
      push: false,
      lean: 0,
    },
  );
  assert.equal(skateCode(null), 0);
  assert.equal(skateOfCode(0), null);
  void speed;
});

test("the revert: down the vert fakie, Q — round on its wheels, the combo going on (a 180 heelflip, A/D held, + a revert)", () => {
  const env = world([{ kind: "half", x: 0, y: 0, z: 0, yaw: 0 }]);
  const b = on("vert-classic", 0, 0, 0, 11);
  if (b.skate) b.skate.s = 11;
  let landedAt = -1;
  const evs = ride(
    b,
    env,
    (t, bb) => {
      if (landedAt < 0 && bb.skate?.air === null && bb.skate.t < 0.02 && t > 0.5) landedAt = t;
      return {
        right: bb.skate?.mode === "air" && (bb.skate.air?.spun ?? 0) < Math.PI,
        revertPressed: landedAt > 0 && Math.abs(t - landedAt - 0.05) < STEP_DT / 2,
        flipPressed:
          bb.skate?.mode === "air" && (bb.skate.air?.t ?? 0) > 0.2 && !bb.skate.air?.cur && !bb.skate.air?.done.length,
      };
    },
    5,
  );
  assert.ok(
    evs.some((e) => e.revert),
    "reverted",
  );
  const banked = evs.find((e) => e.combo)?.combo;
  assert.ok(banked, "banked");
  assert.match(banked.name, /180 Heelflip \+ Revert/, JSON.stringify(evs.filter((e) => Object.keys(e).length)));
});

test("a lip trick: up to the coping slowly, F — stalled on it, back in", () => {
  // a vert quarter facing +x; ridden up at a speed that just reaches the coping
  const env = world([{ kind: "vert", x: 2, y: 0, z: 0, yaw: 0 }]);
  const b = on("vert-classic", 0, 0, 0, 0);
  // (v² = 2 g h to the coping: a little over)
  const h = PIECES.vert.height;
  if (b.skate) b.skate.s = Math.sqrt(2 * SKATE.g * h) + 0.5;
  const modes: string[] = [];
  const evs = ride(
    b,
    env,
    (_t, bb) => ({
      grindPressed: bb.skate?.mode === "roll" && (bb.skate.on?.l ?? 0) > 5.05,
      grind: bb.skate?.mode === "lip" && bb.skate.t < 0.8,
    }),
    4,
    (bb) => {
      if (bb.skate && modes.at(-1) !== bb.skate.mode) modes.push(bb.skate.mode);
      return false;
    },
  );
  assert.ok(modes.includes("lip"), `modes ${modes}`);
  assert.ok(!evs.some((e) => e.bail), JSON.stringify(evs.find((e) => e.bail)));
  assert.match(evs.find((e) => e.combo)?.combo?.name ?? "", /Rock to Fakie/);
});

test("a grab held longer is worth more", () => {
  const score = (hold: number) => {
    const env = world();
    const b = on("street-pop", 0, 0, 0, 6);
    if (b.skate) b.skate.s = 6;
    const evs = ride(
      b,
      env,
      (t) => ({ ollie: t < 0.35, grabPressed: Math.abs(t - 0.4) < STEP_DT / 2, grab: t > 0.4 && t < 0.4 + hold }),
      3,
    );
    assert.ok(!evs.some((e) => e.bail), `held ${hold}: ${JSON.stringify(evs.find((e) => e.bail))}`);
    return evs.find((e) => e.combo)?.combo?.score ?? 0;
  };
  const short = score(0.1);
  const long = score(0.7);
  assert.ok(short >= 200 && long > short + 150, `${short} → ${long}`);
});

test("a bowl's corner: ridden round it, up its wall and back down", () => {
  const env = world([{ kind: "bowlcorner", x: 0, y: 0, z: 0, yaw: 0 }]);
  // (its flat's middle at the centre: ride out along the 45° radius, up the corner's wall)
  const b = on("vert-classic", 0.3, 0.3, Math.PI / 4, 0);
  if (b.skate) b.skate.s = 7;
  let top = 0;
  const evs = ride(b, env, {}, 3, (bb) => {
    top = Math.max(top, bb.z);
    return false;
  });
  assert.ok(top > 1.5, `up ${top.toFixed(2)}`);
  assert.ok(!evs.some((e) => e.bail), JSON.stringify(evs.find((e) => e.bail)));
});
