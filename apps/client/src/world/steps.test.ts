import assert from "node:assert/strict";
import { test } from "node:test";
import { AVATAR_OPTIONS } from "@yutopia/shared";
import { flowCode, KH_FEEL, VERBS } from "@yutopia/shared/move";
import { ABOUT_DOWN, ABOUT_LEN, AboutTurn } from "./chars/anim/about";
import { Locomotion, loadHero } from "./chars/locomotion";
import { type Ears, FLOW_CODES, Footfalls, levelOf, type StepPlayer, shoeOf, VERB_KINDS, type Walker } from "./steps";

// The steps (docs/plan/63-the-steps.md, phases 2–4): a step heard as each foot is put down — the body's
// own (FootLock's), at its stride's pace, the feet in turn — with the shoe's family and the surface's
// level.

test("every shoe has its family: boots and loafers hard, trainers and flats soft, sandals", () => {
  const want: Record<string, string> = {
    sneakers: "soft",
    hightops: "soft",
    boots: "hard",
    loafers: "hard",
    sandals: "sandals",
    snowboots: "hard",
    runners: "soft",
    chelsea: "hard",
    flats: "soft",
    slipons: "soft",
    laceboots: "hard",
  };
  for (const s of AVATAR_OPTIONS.shoes) assert.equal(shoeOf(s), want[s], s);
  assert.equal(shoeOf(undefined), "soft");
});

test("a surface's recordings brought to one level: a quiet one up, a loud one down, kept in reason", () => {
  const buf = (amp: number) =>
    ({
      sampleRate: 1000,
      duration: 1,
      getChannelData: () => Float32Array.from({ length: 1000 }, (_, i) => amp * Math.sin(i)),
    }) as unknown as AudioBuffer;
  const t = 10 ** (-22 / 20);
  // (a sine's RMS is its amplitude / √2)
  assert.ok(Math.abs(levelOf([buf(t * Math.SQRT2)]) - 1) < 0.05, "at the target: as it is");
  assert.ok(levelOf([buf(t * Math.SQRT2 * 0.5)]) > 1.8, "6 dB under: about twice");
  assert.equal(levelOf([buf(0.0001)]), 3, "silence isn't blown up past ×3");
  assert.equal(levelOf([buf(1)]), 0.5, "a loud one down no more than ×0.5");
});

test("the foot lock: a step for each foot put down after it was lifted, in turn, as it lands", async () => {
  const H = await loadHero();
  const lock = new H.FootLock();
  const v = 5;
  const dt = 1 / 120;
  const stride = H.run2Stride(0);
  const heard: { side: string; ph: number }[] = [];
  const frames = 600; // (5 s: ~10 strides)
  for (let i = 0; i < frames; i++) {
    const ph = ((v * i * dt) / stride) % 1;
    const base = H.run2Pose(ph, 0, 0);
    const feet = { L: H.footOf(base, "L"), R: H.footOf(base, "R") };
    const m = { pose: { ...base.pose }, lift: base.lift };
    lock.apply(m, dt, { ahead: v * dt, left: 0, yaw: 0 }, false, feet);
    for (const S of lock.down) heard.push({ side: S, ph });
  }
  const cycles = (v * frames * dt) / stride;
  assert.ok(Math.abs(heard.length - 2 * cycles) <= 2, `${heard.length} steps in ${cycles.toFixed(1)} strides`);
  for (let i = 1; i < heard.length; i++)
    assert.notEqual(heard[i].side, heard[i - 1].side, `step ${i}: the feet in turn`);
  // (the right foot lands at the cycle's 0, the left half a cycle on: each heard near its own)
  for (const h of heard) {
    const at = h.side === "R" ? 0 : 0.5;
    const d = Math.abs(((h.ph - at + 1.5) % 1) - 0.5);
    assert.ok(d < 0.12, `${h.side} heard at phase ${h.ph.toFixed(2)}`);
  }
  // let go (in the air): nothing heard, nor the first foot down after it (the landing's own sound)
  const before = heard.length;
  for (let i = 0; i < 60; i++) {
    const base = H.run2Pose(((v * i * dt) / stride) % 1, 0, 0);
    lock.apply({ pose: { ...base.pose }, lift: base.lift }, dt, { ahead: v * dt, left: 0, yaw: 0 }, true, null);
    assert.equal(lock.down.length, 0);
  }
  const stand = H.run2Pose(0, 0, 0);
  const f = { L: H.footOf(stand, "L"), R: H.footOf(stand, "R") };
  lock.apply({ pose: { ...stand.pose }, lift: stand.lift }, dt, { ahead: 0, left: 0, yaw: 0 }, false, f);
  assert.equal(lock.down.length, 0, "the foot down out of the air isn't a step");
  assert.equal(heard.length, before);
});

test("walking: the body's steps come at its stride's pace — two a stride, the feet in turn", async () => {
  const H = await loadHero();
  const l = new Locomotion(KH_FEEL);
  l.v2 = true;
  const base = {
    pitch: 0,
    yaw: 0,
    turn: 0,
    accel: 0,
    up: false,
    jump: null,
    verb: null,
    reduced: false,
    crouch: false,
    aim: false,
    left: 0,
  };
  const dt = 1 / 60;
  const v = KH_FEEL.walk;
  l.update(dt, { ...base, dist: 0, speed: 0, ahead: 0 });
  const heard: { side: string; t: number }[] = [];
  const secs = 6;
  for (let i = 0; i < secs * 60; i++) {
    l.update(dt, { ...base, dist: v * dt, speed: v, ahead: v, goal: v });
    for (const S of l.lock?.down ?? []) heard.push({ side: S, t: i * dt });
    if (l.lock) l.lock.down.length = 0;
  }
  // (the steady walk: after its first second, setting off)
  const steady = heard.filter((h) => h.t > 1);
  const rate = steady.length / (secs - 1);
  const want = (2 * v) / H.walk2Stride(0);
  assert.ok(Math.abs(rate - want) / want < 0.2, `${rate.toFixed(2)} steps/s, the stride's ${want.toFixed(2)}`);
  let turns = 0;
  for (let i = 1; i < steady.length; i++) if (steady[i].side !== steady[i - 1].side) turns++;
  assert.ok(turns >= steady.length - 2, `the feet in turn: ${turns} of ${steady.length - 1}`);
});

// ── everyone else's (phase 3) ──
function heard(footing: (w: Walker) => string = () => "wood") {
  const steps: { gait: string; shoe: string; gain: number; pan?: number; f: string }[] = [];
  const paws: { f: string; gain: number; claws?: boolean }[] = [];
  const player = {
    step: (f: string, o: { gait: string; shoe: string; gain?: number; pan?: number }) =>
      steps.push({ f, gait: o.gait, shoe: o.shoe, gain: o.gain ?? 1, pan: o.pan }),
    paw: (f: string, o: { gain: number; claws?: boolean }) => paws.push({ f, gain: o.gain, claws: o.claws }),
  } as unknown as StepPlayer;
  const ears: Ears = {
    me: "me",
    level: 0,
    gain: (w) => Math.max(0, 1 - Math.hypot(w.x, w.y) / 7),
    pan: (w) => Math.sign(w.x) * 0.5,
    footing: (w) => footing(w) as never,
  };
  return { ff: new Footfalls(player), ears, steps, paws };
}
const me: Walker = { id: "me", x: 0, y: 0, level: 0 };
// `w` walked along x at `v` tiles/s for `secs` (60 frames a second), from x0
function walk(ff: Footfalls, ears: Ears, w: Omit<Walker, "x">, x0: number, v: number, secs: number, t0 = 0) {
  for (let i = 0; i <= secs * 60; i++)
    ff.frame([me, { ...w, x: x0 + (v * i) / 60 } as Walker], ears, 1 / 60, t0 + (i * 1000) / 60);
}

test("someone walking by, off screen: a step each half stride they go, as loud and where the voices have them", () => {
  const { ff, ears, steps } = heard();
  walk(ff, ears, { id: "bia", y: 2, a: 1, mv: 1, avatar: { shoes: "boots" }, level: 0 }, -3, 1.5, 4);
  // (6 tiles walked: ~9–10 half strides)
  assert.ok(steps.length >= 8 && steps.length <= 11, `${steps.length} steps over 6 tiles`);
  assert.ok(steps.every((s) => s.gait === "walk" && s.shoe === "hard"));
  assert.ok(steps[0].pan !== undefined && steps[0].pan < 0 && (steps.at(-1)?.pan ?? 0) > 0, "left to right");
  const { ff: f2, ears: e2, steps: s2 } = heard();
  walk(f2, e2, { id: "cai", y: 1, a: 1, mv: 2, level: 0 }, -3, 4.2, 1.5);
  assert.ok(s2.length > 0 && s2.every((s) => s.gait === "jog"), "a jog by its gait's byte");
  assert.ok(s2.length <= Math.ceil((4.2 * 1.5) / 1.31) + 1, `jogging: ${s2.length} steps, half a jog's stride apart`);
});

test("their body's feet, when it's stepping on screen, and the way gone doesn't step as well", () => {
  const { ff, ears, steps } = heard();
  const w = { id: "bia", y: 2, a: 1, mv: 1, level: 0 };
  for (let i = 0; i <= 120; i++) {
    const t = (i * 1000) / 60;
    ff.frame([me, { ...w, x: -2 + (1.5 * i) / 60 }], ears, 1 / 60, t);
    if (i % 25 === 0) ff.body("bia", i % 50 === 0 ? "R" : "L", t);
  }
  assert.equal(steps.length, 5, `the body's 5 steps (none by the way gone): ${steps.length}`);
});

test("nobody heard sat, in the air, on another floor or too far off; and only the 12 nearest", () => {
  const { ff, ears, steps } = heard();
  walk(ff, ears, { id: "sat", y: 1, a: 2, level: 0 }, 0, 1.5, 1);
  walk(ff, ears, { id: "up", y: 1, a: 1, z: 1, ground: 0, level: 0 }, 0, 1.5, 1);
  walk(ff, ears, { id: "above", y: 1, a: 1, level: 1 }, 0, 1.5, 1);
  walk(ff, ears, { id: "far", y: 10, a: 1, level: 0 }, 0, 1.5, 1);
  assert.equal(steps.length, 0);
  // twenty walking side by side, 0.4 tiles apart: the 12 nearest heard
  const many = heard();
  const ids = new Set<number>();
  const play = many.ff as unknown as { play(h: { w: Walker }): void };
  const was = play.play.bind(many.ff);
  play.play = (h) => {
    ids.add(Number(h.w.id));
    was(h);
  };
  for (let i = 0; i <= 120; i++)
    many.ff.frame(
      [
        me,
        ...Array.from({ length: 20 }, (_, k) => ({
          id: String(k),
          x: (1.5 * i) / 60,
          y: 0.5 + k * 0.4,
          a: 1,
          level: 0,
        })),
      ],
      many.ears,
      1 / 60,
      (i * 1000) / 60,
    );
  assert.ok(ids.size > 0 && ids.size <= 12, `${ids.size} heard`);
  assert.ok(Math.max(...ids) < 12, `the nearest: ${[...ids].sort((a, b) => a - b).join(" ")}`);
});

test("pets: a dog's paws, its claws on a hard floor; a cat barely heard, but in the snow", () => {
  const wood = heard(() => "wood");
  walk(wood.ff, wood.ears, { id: "pet:rex", y: 1, a: 1, level: 0, pet: { species: "dog" } }, -1, 2, 1);
  assert.ok(wood.paws.length >= 7, `${wood.paws.length} paws over 2 tiles`);
  assert.ok(wood.paws.every((p) => p.claws));
  const cat = heard(() => "wood");
  walk(cat.ff, cat.ears, { id: "pet:tom", y: 1, a: 1, level: 0, pet: { species: "cat" } }, -1, 2, 1);
  const snow = heard(() => "snow");
  walk(snow.ff, snow.ears, { id: "pet:tom", y: 1, a: 1, level: 0, pet: { species: "cat" } }, -1, 2, 1);
  const avg = (p: { gain: number }[]) => p.reduce((n, q) => n + q.gain, 0) / Math.max(1, p.length);
  assert.ok(
    avg(snow.paws) > 4 * avg(cat.paws),
    `a cat on snow ${avg(snow.paws).toFixed(3)}, indoors ${avg(cat.paws).toFixed(3)}`,
  );
});

// ── the other moments (phase 4) ──
function moments() {
  const calls: { what: string; f?: string; at?: number }[] = [];
  let stopped = 0;
  const loop = (what: string) => {
    calls.push({ what });
    return () => {
      stopped++;
    };
  };
  const player = {
    now: () => 100,
    step: (f: string, o: { at?: number; scuff?: boolean }) =>
      calls.push({ what: o.scuff ? "scuff" : "step", f, at: o.at }),
    liftCar: () => calls.push({ what: "lift" }),
    paw: () => calls.push({ what: "paw" }),
    land: (f: string) => calls.push({ what: "land", f }),
    thud: () => calls.push({ what: "thud" }),
    cloth: () => calls.push({ what: "cloth" }),
    hand: () => calls.push({ what: "hand" }),
    seat: (down: boolean) => calls.push({ what: down ? "sit" : "stand" }),
    scrape: (_f: string, _g: number, _p: number, len = 0) =>
      len ? calls.push({ what: "scrape" }) && null : loop("slide"),
    grind: () => loop("grind"),
  } as unknown as StepPlayer;
  let down: "down" | "kneel" | undefined;
  let lift = false;
  const ears: Ears = {
    me: "me",
    level: 0,
    lift: () => lift,
    gain: () => 1,
    pan: () => 0,
    footing: () => "wood",
    down: () => down,
  };
  const ff = new Footfalls(player);
  let t = 0;
  const run = (w: Partial<Walker>, secs: number, v = 0) => {
    for (let i = 0; i < secs * 60; i++) {
      t += 1000 / 60;
      const x = (w.x ?? 0) + (v * i) / 60;
      ff.frame([me, { id: "bia", y: 1, level: 0, a: 0, ...w, x } as Walker], ears, 1 / 60, t);
    }
  };
  const what = () => calls.map((c) => c.what);
  return {
    ff,
    calls,
    run,
    what,
    stopped: () => stopped,
    inLift: (l: boolean) => {
      lift = l;
    },
    setDown: (d: typeof down) => {
      down = d;
    },
  };
}

test("the verbs and Flowmotion's codes as the steps read them agree with the shared move's", () => {
  assert.deepEqual(VERB_KINDS, [...VERBS]);
  for (const k of FLOW_CODES) assert.equal(FLOW_CODES[(flowCode({ kind: k as never, side: 1 }) & 15) - 1], k);
});

test("a vault: a hand on it and the feet after; a mantle's scramble; a roll's thud", () => {
  const m = moments();
  m.run({}, 0.2);
  m.run({ verb: { kind: "vault" } }, 0.3);
  assert.deepEqual(m.what().slice(0, 2), ["hand", "land"]);
  m.calls.length = 0;
  m.run({}, 0.2);
  m.run({ verb: { kind: "mantle" } }, 0.3);
  assert.deepEqual(m.what(), ["hand", "step", "step"]);
  m.calls.length = 0;
  m.run({}, 0.2);
  m.run({ verb: { kind: "roll" } }, 0.3);
  assert.deepEqual(m.what(), ["thud", "cloth", "scrape"]);
});

test("a slide's scrape and a grind held while they last, ended with them; a wall run's steps and its kick", () => {
  const m = moments();
  m.run({}, 0.2);
  m.run({ verb: { kind: "slide" } }, 0.5);
  assert.deepEqual(m.what(), ["slide"]);
  m.run({}, 0.1);
  assert.equal(m.stopped(), 1, "the slide's sound ends with it");
  m.calls.length = 0;
  m.run({ flowCode: flowCode({ kind: "grind", side: 1 }) }, 0.5);
  m.run({}, 0.1);
  assert.deepEqual(m.what(), ["grind"]);
  assert.equal(m.stopped(), 2);
  m.calls.length = 0;
  m.run({ flow: { kind: "wallrun" } }, 1);
  const onWall = m.what().filter((w) => w === "step").length;
  assert.ok(onWall >= 5 && onWall <= 7, `${onWall} steps on the wall in 1 s`);
  m.run({}, 0.1);
  assert.equal(m.what().filter((w) => w === "step").length, onWall + 1, "and the kick off it");
});

test("off an edge: down from a fall heard as hard as how far — not a hop's height, nor a jump of its own", () => {
  const m = moments();
  m.run({ z: 0, ground: 0 }, 0.2);
  m.run({ z: 0.2, ground: 0 }, 0.1);
  m.run({ z: 0, ground: 0 }, 0.1);
  assert.deepEqual(m.what(), [], "0.2 m: nothing");
  m.run({ z: 1.2, ground: 0 }, 0.1);
  m.run({ z: 0, ground: 0 }, 0.1);
  assert.deepEqual(m.what(), ["land"]);
  m.calls.length = 0;
  m.run({ z: 3, ground: 0 }, 0.1);
  m.run({ z: 0, ground: 0 }, 0.1);
  assert.deepEqual(m.what(), ["land", "thud", "scrape"], "from 3 m: a roll");
  m.calls.length = 0;
  m.run({ z: 1.5, ground: 0, jump: { kind: "hop" } }, 0.1);
  m.run({ z: 0, ground: 0, jump: { kind: "hop" } }, 0.1);
  m.run({ z: 0, ground: 0 }, 0.1);
  assert.deepEqual(m.what(), [], "a jump's landing is the jump's own");
});

test("a seat taken and given back, the tape's side steps, a skid from a run, a crawl and a kneel", () => {
  const m = moments();
  m.run({ a: 0 }, 0.1);
  m.run({ a: 2 }, 0.1);
  m.run({ a: 0 }, 0.1);
  assert.deepEqual(m.what(), ["sit", "stand"]);
  m.calls.length = 0;
  // (the tape: a foot down each time its sway crosses the middle — 0.71 s, 1.43 s; the fist pump's
  // hop down at 1.45 s; the wave's legs aren't keyed: nothing)
  m.run({ emote: "tape" }, 1.6);
  assert.equal(m.what().filter((w) => w === "step").length, 2, "the tape's feet down at 0.71 and 1.43 s");
  m.calls.length = 0;
  m.run({ emote: "" }, 0.1);
  m.run({ emote: "fire" }, 1.4);
  assert.deepEqual(m.what(), [], "the fist pump: still up at 1.4 s");
  m.run({ emote: "fire" }, 0.2);
  assert.deepEqual(m.what(), ["land"], "down from its hop at 1.45 s");
  m.calls.length = 0;
  m.run({ emote: "" }, 0.1);
  m.run({ emote: "wave" }, 2);
  assert.deepEqual(m.what(), []);
  m.calls.length = 0;
  m.run({ emote: "" }, 0.1);
  m.run({ a: 1, mv: 3, x: 0 }, 0.5, 7);
  m.calls.length = 0;
  m.run({ a: 1, mv: 3, x: 3.5 }, 0.2, 0);
  assert.ok(m.what().includes("scrape"), `a skid: ${m.what().join(" ")}`);
  m.calls.length = 0;
  m.setDown("down");
  m.run({ a: 1, x: 0 }, 1, 1);
  const w = m.what();
  assert.equal(w[0], "thud", "down on a knee");
  assert.ok(w.filter((x) => x === "step").length >= 2, `crawling: ${w.join(" ")}`);
});

test("my own moments heard too (gain 1), but my steps left to the controller", () => {
  const m = moments();
  const mine = (w: Partial<Walker>, secs: number, v = 0) => {
    for (let i = 0; i < secs * 60; i++)
      m.ff.frame(
        [{ id: "me", x: (w.x ?? 0) + (v * i) / 60, y: 0, level: 0, a: 1, ...w } as Walker],
        { me: "me", level: 0, gain: () => 1, pan: () => 0, footing: () => "wood" },
        1 / 60,
        i * 16,
      );
  };
  mine({}, 2, 1.5);
  assert.deepEqual(m.what(), [], "walking: no steps of mine from here");
  mine({ verb: { kind: "vault" } }, 0.2);
  assert.deepEqual(m.what().slice(0, 2), ["hand", "land"]);
});

test("a body's slow steps (setting off, stopping, on the spot) scuffed; walking ones not", () => {
  const m = moments();
  m.run({ a: 1, mv: 1, x: 0 }, 0.5, 0.5);
  m.ff.body("bia", "L", 1e6);
  m.run({ a: 1, mv: 1, x: 0.25 }, 0.5, 1.5);
  m.ff.body("bia", "R", 2e6);
  assert.deepEqual(
    m.what().filter((w) => w === "step" || w === "scuff"),
    ["scuff", "step"],
  );
});

test("a fall into a lift's car: the car answers", () => {
  const m = moments();
  m.inLift(true);
  m.run({ z: 0, ground: 0 }, 0.1);
  m.run({ z: 1, ground: 0 }, 0.1);
  m.run({ z: 0, ground: 0 }, 0.1);
  assert.deepEqual(m.what(), ["land", "lift"]);
});

test("the turn round from a run: its feet down heard once, as it lands", () => {
  const ab = new AboutTurn();
  ab.start(1);
  const pose = { pose: {}, lift: [0, 0, 0] as [number, number, number] };
  const dt = 1 / 60;
  const at: number[] = [];
  for (let i = 0; i < 40; i++) {
    ab.update(pose, dt, 0, 0, 1);
    if (ab.landed) at.push(ab.u);
  }
  assert.equal(at.length, 1, "once");
  assert.ok(at[0] >= ABOUT_DOWN && at[0] < ABOUT_DOWN + dt / ABOUT_LEN + 1e-9, `at ${at[0].toFixed(3)}`);
});
