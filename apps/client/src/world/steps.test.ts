import assert from "node:assert/strict";
import { test } from "node:test";
import { AVATAR_OPTIONS } from "@yutopia/shared";
import { KH_FEEL } from "@yutopia/shared/move";
import { Locomotion, loadHero } from "./chars/locomotion";
import { type Ears, Footfalls, levelOf, type StepPlayer, shoeOf, type Walker } from "./steps";

// The steps (docs/plan/63-the-steps.md, phase 2): a step heard as each foot is put down — the body's
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
