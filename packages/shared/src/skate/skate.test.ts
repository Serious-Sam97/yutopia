// The board's step (docs/plan/104-the-skate-again.md), in Node with exact time, against Tony Hawk's numbers: the push
// and the auto-kick, the powerslide, the 0.5 s flat ollie, the vert air (up, turned back in, back in forwards; a 360,
// fakie), break vert over a spine, flips and grabs (their upgrades), the specials and the meter, grinds that speed you
// up, the manual's pendulum, the revert (Shift), lips, the snow, walls, the wire — and on every step of every ride,
// the board's direction: it rolls along its own length.
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
/** The worst angle (deg) between the board's nose and the way it rolled, on the ground (powerslides and slides across
 *  a rail apart), over every ride of the suite. */
let worstOff = 0;
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
    const s = b.skate;
    if (s && (s.mode === "roll" || s.mode === "manual") && !s.cess) {
      const v = Math.hypot(b.vx, b.vy);
      if (v > 1) {
        const c = Math.abs(b.vx * Math.cos(b.yaw) + b.vy * Math.sin(b.yaw)) / v;
        worstOff = Math.max(worstOff, (Math.acos(Math.min(1, c)) * 180) / Math.PI);
      }
    }
    if (stop?.(b)) break;
  }
  return evs;
}
const on = (variant: BoardVariant = "street-pop", x = 0, y = 0, yaw = 0, s = 0) => {
  const b = newBody(x, y, 0, yaw);
  b.vx = Math.cos(yaw) * s;
  b.vy = Math.sin(yaw) * s;
  const k = startSkate(b, variant, 1);
  k.s = s;
  return b;
};
const at = (t: number, when: number) => Math.abs(t - when) < STEP_DT / 2;

test("W pushes to ~11 m/s; let alone at a crawl it kicks along by itself (never stalls); S at speed powerslides", () => {
  const env = world();
  const b = on();
  ride(b, env, { up: true }, 5);
  const s = b.skate?.s ?? 0;
  assert.ok(s > SKATE.push * 0.92 && s < SKATE.push * 1.05, `pushed to ${s.toFixed(2)}`);
  const slow = on();
  ride(slow, env, {}, 4);
  assert.ok((slow.skate?.s ?? 0) > 1.2, `auto-kick: ${slow.skate?.s.toFixed(2)}`);
  const evs = ride(b, env, { down: true }, 2.5);
  assert.ok(
    evs.some((e) => e.cess),
    "a powerslide",
  );
  assert.ok(Math.abs(b.skate?.s ?? 9) < 3.5, `slowed: ${b.skate?.s}`);
});

test("getting on from a sideways walk rolls along the way she faces, forward — not across it, not fakie", () => {
  const b = newBody(0, 0, 0, 0);
  b.vx = 1.2;
  b.vy = 3;
  const k = startSkate(b, "street-pop", 1);
  assert.ok(k.s >= 0, "forward");
  assert.ok(Math.abs(b.vy) < 1e-9 && Math.abs(b.vx - k.s) < 1e-9, "its velocity along the nose");
});

test("the ollie: Tony Hawk's punch — a tap ~0.5 m, a full crouch ~0.95 m, about half a second in the air", () => {
  for (const [hold, lo, hi, tLo, tHi] of [
    [0.02, 0.4, 0.62, 0.3, 0.5],
    [0.4, 0.82, 1.08, 0.45, 0.65],
  ] as const) {
    const env = world();
    const b = on("street-pop", 0, 0, 0, 6);
    let top = 0;
    let up = 0;
    ride(
      b,
      env,
      (t) => ({ ollie: t < hold }),
      2,
      (bb) => {
        top = Math.max(top, bb.z);
        if (bb.skate?.mode === "air") up += STEP_DT;
        return false;
      },
    );
    assert.ok(top > lo && top < hi, `held ${hold}: up ${top.toFixed(2)} m`);
    assert.ok(up > tLo && up < tHi, `held ${hold}: ${up.toFixed(2)} s up`);
    assert.equal(b.skate?.mode, "roll", "back down on its wheels");
  }
});

test("a vert half-pipe: up the wall, 2.5–6 m of air hanging 1.2–2.5 s, turned back in — forwards; a 360, fakie", () => {
  for (const spin of [0, 2 * Math.PI]) {
    const env = world([{ kind: "half", x: 0, y: 0, z: 0, yaw: 0 }]);
    const b = on("vert-classic", 0, 0, 0, 13);
    let top = 0;
    let hang = 0;
    let wentUp = false;
    const evs = ride(
      b,
      env,
      (_t, bb) => ({ spinR: !!spin && bb.skate?.mode === "air" && (bb.skate.air?.spun ?? 0) < spin - 0.05 }),
      6,
      (bb) => {
        top = Math.max(top, bb.z);
        if (bb.skate?.mode === "air") {
          wentUp = true;
          hang += STEP_DT;
        }
        return wentUp && bb.skate?.mode === "roll";
      },
    );
    const lip = PIECES.half.height;
    assert.ok(wentUp, "it took off from the lip");
    assert.ok(top - lip > 2.5 && top - lip < 6, `up ${(top - lip).toFixed(1)} m over the coping`);
    assert.ok(hang > 1.2 && hang < 2.5, `${hang.toFixed(2)} s in the air`);
    assert.ok(!evs.some((e) => e.bail), `landed: ${JSON.stringify(evs.find((e) => e.bail))}`);
    const k = b.skate;
    assert.ok(k?.on, "back on the ramp");
    if (spin) assert.ok(k.s < -3, `a 360: fakie ${k.s.toFixed(1)}`);
    else assert.ok(k.s > 3, `no spin: auto-turned, forwards ${k.s.toFixed(1)}`);
  }
});

test("break vert (Shift held) at a spine: over its top onto the far face, a Spine Transfer", () => {
  const env = world([{ kind: "spine", x: 0, y: 0, z: 0, yaw: 0 }]);
  // (the spine's near face rises toward +x from x ≈ −lip: ridden at it from the west)
  const b = on("vert-classic", -4.5, 0, 0, 9);
  const evs = ride(b, env, { brk: true }, 4);
  assert.ok(!evs.some((e) => e.bail), JSON.stringify(evs.find((e) => e.bail)));
  const banked = evs.find((e) => e.combo)?.combo;
  assert.match(
    banked?.name ?? "",
    /Spine Transfer/,
    JSON.stringify(evs.filter((e) => Object.keys(e).length).slice(0, 8)),
  );
  assert.ok(b.x > 0, "on the far side");
});

test("a kickflip finished lands and counts 100; started too late, a bail", () => {
  const go = (late: boolean) => {
    const env = world();
    const b = on("street-pop", 0, 0, 0, 6);
    let upAt = -1;
    const evs = ride(
      b,
      env,
      (t, bb) => {
        if (upAt < 0 && bb.skate?.mode === "air") upAt = t;
        // (on time: just after the pop; late: a moment before coming down)
        const when = upAt < 0 ? -1 : upAt + (late ? 0.42 : 0.02);
        return { ollie: t < 0.32, flipPressed: when > 0 && at(t, when) };
      },
      3,
    );
    return { b, evs };
  };
  const ok = go(false);
  assert.ok(!ok.evs.some((e) => e.bail), "landed it");
  assert.deepEqual(ok.evs.find((e) => e.combo)?.combo, { name: "Kickflip", score: 100, count: 1 });
  const late = go(true);
  assert.equal(late.evs.find((e) => e.bail)?.bail, "trick");
});

test("spins multiply (score.cpp): a 360 kickflip on vert is 100 × 2", () => {
  const env = world([{ kind: "half", x: 0, y: 0, z: 0, yaw: 0 }]);
  const b = on("vert-classic", 0, 0, 0, 13);
  let upAt = -1;
  const evs = ride(
    b,
    env,
    (t, bb) => {
      if (upAt < 0 && bb.skate?.mode === "air") upAt = t;
      const k = bb.skate;
      return {
        flipPressed: upAt > 0 && at(t, upAt + 0.05),
        spinR: k?.mode === "air" && (k.air?.spun ?? 0) < 2 * Math.PI - 0.1,
      };
    },
    5,
    (bb) => !!bb.skate && upAt > 0 && bb.skate.mode === "roll" && bb.skate.combo.count === 0 && bb.skate.since > 0.3,
  );
  const banked = evs.find((e) => e.combo)?.combo;
  assert.equal(banked?.name, "360 Kickflip", JSON.stringify(evs.find((e) => e.bail)));
  assert.equal(banked?.score, 200);
});

test("a grab's upgrade: L again during a Melon — a Method; held longer, worth more", () => {
  const score = (hold: number, again: boolean) => {
    const env = world([{ kind: "half", x: 0, y: 0, z: 0, yaw: 0 }]);
    const b = on("vert-classic", 0, 0, 0, 13);
    let upAt = -1;
    const evs = ride(
      b,
      env,
      (t, bb) => {
        if (upAt < 0 && bb.skate?.mode === "air") upAt = t;
        const k = bb.skate;
        const g0 = upAt + 0.03;
        void k;
        return {
          left: upAt > 0 && t < g0 + 0.05,
          grabPressed: upAt > 0 && (at(t, g0) || (again && at(t, g0 + 0.08))),
          grab: upAt > 0 && t > g0 && t < g0 + hold,
        };
      },
      5,
      (bb) => !!bb.skate && upAt > 0 && bb.skate.mode === "roll" && bb.skate.combo.count === 0 && bb.skate.since > 0.3,
    );
    assert.ok(!evs.some((e) => e.bail), JSON.stringify(evs.find((e) => e.bail)));
    return evs.find((e) => e.combo)?.combo;
  };
  const melon = score(0.2, false);
  assert.equal(melon?.name, "Melon");
  const method = score(0.2, true);
  assert.equal(method?.name, "Method");
  const longer = score(0.55, false);
  assert.ok((longer?.score ?? 0) > (melon?.score ?? 0) + 60, `${melon?.score} → ${longer?.score}`);
});

test("a grind: caught in the air (K held), sped up by the rail, off its end, banked × 2 with a flip before", () => {
  const env = world([{ kind: "rail", x: 3, y: 0, z: 0, yaw: 0 }]);
  const b = on("street-pop", 0, 0, 0, 7);
  let atGrind = 0;
  let before = 0;
  const evs = ride(
    b,
    env,
    (t, bb) => {
      if (bb.skate?.mode === "air" && !before) before = Math.hypot(bb.vx, bb.vy);
      if (bb.skate?.mode === "grind" && !atGrind) atGrind = Math.abs(bb.skate.s);
      return { ollie: t < 0.12, flipPressed: at(t, 0.15), grind: bb.skate?.mode === "air" };
    },
    3,
  );
  assert.ok(atGrind > before, `sped up: ${before.toFixed(1)} → ${atGrind.toFixed(1)}`);
  const banked = evs.find((e) => e.combo)?.combo;
  assert.ok(banked && banked.count === 2, `combo ${JSON.stringify(banked)} ${JSON.stringify(evs.find((e) => e.bail))}`);
  assert.match(banked.name, /Kickflip \+ 50-50/);
});

test("the manual: W then S, held by a hand on the needle; let alone, the pendulum tips it off", () => {
  const env = world();
  const held = on("street-pop", 0, 0, 0, 8);
  ride(
    held,
    env,
    (t, bb) => {
      const m = bb.skate?.manual;
      return {
        upPressed: at(t, 0.1),
        downPressed: at(t, 0.2),
        up: !!m && m.bal + m.v * 0.25 > 0,
        down: !!m && m.bal + m.v * 0.25 < 0,
      };
    },
    1.4,
  );
  assert.equal(held.skate?.mode, "manual");
  const alone = on("street-pop", 0, 0, 0, 8);
  const e2 = ride(alone, env, (t) => ({ upPressed: at(t, 0.1), downPressed: at(t, 0.2) }), 5);
  assert.equal(e2.find((e) => e.bail)?.bail, "balance");
});

test("the revert: down the vert fakie (a 360), Shift — round on its wheels, the combo going on", () => {
  const env = world([{ kind: "half", x: 0, y: 0, z: 0, yaw: 0 }]);
  const b = on("vert-classic", 0, 0, 0, 13);
  let landedAt = -1;
  const evs = ride(
    b,
    env,
    (t, bb) => {
      const k = bb.skate;
      if (landedAt < 0 && k?.mode === "roll" && k.air === null && k.since < 0.01 && t > 0.5) landedAt = t;
      return {
        spinR: k?.mode === "air" && (k.air?.spun ?? 0) < 2 * Math.PI - 0.05,
        breakPressed: landedAt > 0 && at(t, landedAt + 0.05),
      };
    },
    5,
    (bb) => !!bb.skate && bb.skate.combo.count === 0 && landedAt > 0 && bb.skate.since > 0.5,
  );
  assert.ok(
    evs.some((e) => e.revert),
    "reverted",
  );
  assert.match(evs.find((e) => e.combo)?.combo?.name ?? "", /360 Air \+ Revert/);
});

test("a lip trick: up to the coping slowly, K — stalled on it, back in", () => {
  const env = world([{ kind: "vert", x: 2, y: 0, z: 0, yaw: 0 }]);
  const b = on("vert-classic", 0, 0, 0, 0);
  if (b.skate) b.skate.s = Math.sqrt(2 * SKATE.gRamp * PIECES.vert.height) + 0.5;
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

test("the special: fills by what combos pay, lit at 3000; lit, → ↓ + grab is a McTwist; a bail empties it", () => {
  const env = world([{ kind: "half", x: 0, y: 0, z: 0, yaw: 0 }]);
  const b = on("vert-classic", 0, 0, 0, 13);
  const k = b.skate;
  assert.ok(k);
  k.special = SKATE.specialFull - 10;
  k.combo.add("kickflip");
  // (a combo banked: lit)
  ride(b, env, {}, 0.5);
  assert.ok(k.lit, `lit at ${k.special}`);
  let upAt = -1;
  const evs = ride(
    b,
    env,
    (t, bb) => {
      if (upAt < 0 && bb.skate?.mode === "air") upAt = t;
      return {
        rightPressed: upAt > 0 && at(t, upAt + 0.05),
        downPressed: upAt > 0 && at(t, upAt + 0.12),
        grabPressed: upAt > 0 && at(t, upAt + 0.2),
        grab: upAt > 0 && t > upAt + 0.2 && t < upAt + 1.35,
      };
    },
    5,
    (bb) => !!bb.skate && bb.skate.combo.count === 0 && upAt > 0 && bb.skate.mode === "roll" && bb.skate.since > 0.4,
  );
  assert.ok(
    evs.some((e) => e.trick === "mctwist"),
    JSON.stringify(evs.filter((e) => e.trick)),
  );
  // a bail: empty
  const c = on("street-pop", 0, 0, 0, 6);
  if (c.skate) {
    c.skate.special = 2000;
    c.skate.lit = true;
  }
  const kk = c.skate;
  ride(
    c,
    env,
    (t, bb) => ({ ollie: t < 0.2, spinR: bb.skate?.mode === "air" && (bb.skate.air?.spun ?? 0) < Math.PI / 2 }),
    2,
  );
  assert.equal(kk?.special, 0);
  assert.equal(kk?.lit, false);
});

test("the snow: deep snow throws you off at speed; on ice a push barely goes", () => {
  const deep = world([], (x) => (x > 3 ? "deep" : "asphalt"));
  const b = on("street-pop", 0, 0, 0, 6);
  assert.equal(ride(b, deep, {}, 2).find((e) => e.bail)?.bail, "snow");
  const ice = on();
  ride(ice, world([], "ice"), { up: true }, 2);
  const road = on();
  ride(road, world(), { up: true }, 2);
  assert.ok(
    (ice.skate?.s ?? 0) < (road.skate?.s ?? 0) * 0.45,
    `ice ${ice.skate?.s.toFixed(2)} vs ${road.skate?.s.toFixed(2)}`,
  );
});

test("into a ledge's side: fast, a bail; slow, knocked back", () => {
  const env = world([{ kind: "ledge", x: 4, y: -2, z: 0, yaw: Math.PI / 2 }]);
  const fast = on("street-pop", 0, 0, 0, 9);
  assert.equal(ride(fast, env, {}, 1.5).find((e) => e.bail)?.bail, "wall");
  const slow = on("street-pop", 0, 0, 0, 3);
  const evs = ride(slow, env, {}, 2.0);
  assert.ok(!evs.some((e) => e.bail), "no bail");
  assert.ok(slow.x < 3.8, `stopped at its side: ${slow.x.toFixed(2)}`);
});

test("a kicker launches it forward off its top", () => {
  const env = world([{ kind: "kicker", x: 3, y: 0, z: 0, yaw: 0 }]);
  const b = on("street-pop", 0, 0, 0, 11);
  let top = 0;
  let far = 0;
  const evs = ride(b, env, {}, 3, (bb) => {
    top = Math.max(top, bb.z);
    if (bb.skate?.mode === "air") far = bb.x;
    return false;
  });
  assert.ok(top > 0.8, `up ${top.toFixed(2)}`);
  assert.ok(far > 6, `flew to ${far.toFixed(1)}`);
  assert.ok(!evs.some((e) => e.bail));
});

test("landing sideways is a bail", () => {
  const env = world();
  const b = on("street-pop", 0, 0, 0, 6);
  const evs = ride(
    b,
    env,
    (t, bb) => ({ ollie: t < 0.3, spinR: bb.skate?.mode === "air" && (bb.skate.air?.spun ?? 0) < Math.PI / 2 }),
    3,
  );
  assert.equal(evs.find((e) => e.bail)?.bail, "sideways");
});

test("on the wire: the mode, the trick, fakie, goofy, the board, a powerslide, lit", () => {
  const b = on("cruiser-wood");
  const k = b.skate;
  assert.ok(k);
  k.stance = -1;
  k.s = -3;
  k.mode = "grind";
  k.cess = true;
  k.lit = true;
  k.grind = { id: "smith", ux: 1, uy: 0, slope: 0, what: "rail", across: false, t: 0, bal: 0, v: 0 };
  assert.deepEqual(
    { ...skateOfCode(skateCode(k)), lean: 0, bal: 0 },
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
      cess: true,
      lit: true,
      bal: 0,
    },
  );
  assert.equal(skateCode(null), 0);
  assert.equal(skateOfCode(0), null);
});

test("the board's direction: over every ride above it rolled along its own length (never 2° across)", () => {
  assert.ok(worstOff < 2, `${worstOff.toFixed(2)}° at worst`);
});
