import assert from "node:assert/strict";
import { test } from "node:test";
import { LapCounter } from "./kart/lap.ts";
import { GO_MS, gridRevs, kartStart, LIGHT_MS } from "./kart/net.ts";
import { kartTrack, trackAt } from "./kart/park.ts";
import {
  createKart,
  KART,
  KART_STEP,
  type KartInput,
  type KartState,
  type KartWorld,
  kartInWake,
  kartSpeed,
  NO_INPUT,
  spinOut,
  stepKart,
} from "./kart/sim.ts";
import { kartTrackWorld } from "./kart/world.ts";

// The kart's feel in numbers (docs/plan/46-the-karts.md, phase 1's table): off the line, its top
// speed, a boost, the mini-turbo's tiers, deep snow, the jump, the walls, a lap of the real
// circuit by a simple driver, and the same inputs giving the same bits.

const flat = (ground: "asphalt" | "deep" | "ice" = "asphalt"): KartWorld => ({
  under: () => ({ y: 0, ground }),
  wall: () => null,
});
const run = (k: KartState, w: KartWorld, secs: number, i: KartInput | ((k: KartState) => KartInput)) => {
  for (let n = 0; n < Math.round(secs / KART_STEP); n++) stepKart(k, typeof i === "function" ? i(k) : i, w);
};
const GO: KartInput = { throttle: 1, brake: 0, steer: 0, hop: false };

test("off the line: 95 % of top speed in ~2.5 s, the top where it should be", () => {
  const k = createKart(0, 0, 0, 0);
  let t95 = 0;
  for (let n = 0; n < 600; n++) {
    stepKart(k, GO, flat());
    if (!t95 && kartSpeed(k) >= KART.vmax * 0.95) t95 = (n + 1) * KART_STEP;
  }
  assert.ok(t95 > 2.1 && t95 < 2.9, `95 % in ${t95} s`);
  assert.ok(Math.abs(kartSpeed(k) - KART.vmax) < 0.3, `top ${kartSpeed(k)}`);
});

test("the start, as Mario Kart's: a rocket start on the fourth or fifth light, flooded before, ahead off the line", () => {
  // (the lights: one a second, out a second after the fifth — the fourth 2 s before, the fifth 1 s)
  assert.equal(GO_MS, 5 * LIGHT_MS);
  assert.equal(kartStart(-1), "go");
  assert.equal(kartStart(3), "flooded", "down on the third light");
  assert.equal(kartStart(2), "rocket", "on the fourth");
  assert.equal(kartStart(1), "rocket", "on the fifth");
  assert.equal(kartStart(0.5), "good", "after the fifth");
  assert.equal(kartStart(0.1), "go", "as they go out");
  // the revs where it stands: up near the limiter in ~0.6 s, flooded (minus) held too long
  assert.equal(gridRevs(-1, 0), 0);
  assert.ok(gridRevs(0, 0) < 0.4 && gridRevs(0.7, 0) > 0.85, `${gridRevs(0, 0)} → ${gridRevs(0.7, 0)}`);
  for (let t = 0; t < 1; t += 0.05) assert.ok(gridRevs(2.5, t) < -0.8, "flooded");
  // off the line: the rocket's boost (the amber turbo's) a car's length or more ahead after 2 s
  const plain = createKart(0, 0, 0, 0);
  const rocket = createKart(0, 0, 0, 0);
  rocket.boost = KART.turbo[1];
  run(plain, flat(), 2, GO);
  run(rocket, flat(), 2, GO);
  assert.ok(rocket.x - plain.x > 4, `ahead by ${(rocket.x - plain.x).toFixed(1)} m`);
});

test("a boost: up to its top for its time, then back down", () => {
  const k = createKart(0, 0, 0, 0);
  run(k, flat(), 4, GO);
  k.boost = 1.6;
  run(k, flat(), 1.4, GO);
  assert.ok(kartSpeed(k) > KART.vmax * KART.boostTop * 0.92, `boosted ${kartSpeed(k)}`);
  run(k, flat(), 2, GO);
  assert.ok(kartSpeed(k) < KART.vmax * 1.03, `after ${kartSpeed(k)}`);
});

test("the drift: a hop with a way held, sparks blue → amber → purple, the turbo on letting go", () => {
  const k = createKart(0, 0, 0, 0);
  run(k, flat(), 3, GO);
  const hold: KartInput = { throttle: 1, brake: 0, steer: 1, hop: true };
  for (let n = 0; n < 60 && k.drift === 0; n++) stepKart(k, hold, flat());
  assert.equal(k.drift, 1);
  const tierAt: number[] = [];
  for (let n = 1; n <= 360; n++) {
    stepKart(k, { ...hold, steer: 0 }, flat());
    if (k.tier > tierAt.length) tierAt.push(n * KART_STEP);
  }
  // (at the neutral rate: about the tiers' own times after the hop's landing)
  assert.equal(tierAt.length, 3);
  for (const [i, at] of tierAt.entries()) assert.ok(Math.abs(at - KART.tiers[i]) < 0.05, `tier ${i + 1} at ${at}`);
  // the speed holds up in a drift (a turbo's worth of point)
  assert.ok(kartSpeed(k) > KART.vmax * 0.8, `drifting at ${kartSpeed(k)}`);
  stepKart(k, { throttle: 1, brake: 0, steer: 0, hop: false }, flat());
  assert.equal(k.fired, 3);
  assert.equal(k.drift, 0);
  assert.ok(Math.abs(k.boost - KART.turbo[2]) < 0.02);
});

test("no drift too slow, nor without a way held", () => {
  const k = createKart(0, 0, 0, 0);
  run(k, flat(), 0.18, GO);
  run(k, flat(), 0.6, { throttle: 0, brake: 0, steer: 1, hop: true });
  assert.equal(k.drift, 0);
  run(k, flat(), 3, GO);
  run(k, flat(), 0.6, { throttle: 1, brake: 0, steer: 0, hop: true });
  assert.equal(k.drift, 0);
});

test("off into deep snow: down to ~40 % in about a second", () => {
  const k = createKart(0, 0, 0, 0);
  run(k, flat(), 4, GO);
  run(k, flat("deep"), 1, GO);
  const r = kartSpeed(k) / KART.vmax;
  assert.ok(r > 0.36 && r < 0.52, `${r}`);
});

test("on ice it slides: the heading turns, the velocity lags behind it", () => {
  const ice = createKart(0, 0, 0, 0);
  const road = createKart(0, 0, 0, 0);
  for (const [k, w] of [
    [ice, flat("ice")],
    [road, flat()],
  ] as const) {
    run(k, flat(), 3, GO);
    run(k, w, 0.6, { ...GO, steer: 1 });
  }
  const slip = (k: KartState) => Math.abs(Math.atan2(k.vz, k.vx) - k.a);
  assert.ok(slip(ice) > slip(road) * 3, `ice ${slip(ice)} road ${slip(road)}`);
});

test("standing still stays still; a spin-out bleeds the speed and gives the wheel back", () => {
  const k = createKart(0, 0, 0, 0.3);
  run(k, flat(), 10, NO_INPUT);
  assert.ok(Math.hypot(k.vx, k.vz) < 1e-6 && Math.abs(k.a - 0.3) < 1e-9);
  run(k, flat(), 4, GO);
  spinOut(k);
  run(k, flat(), KART.spinFor + 0.02, GO);
  assert.equal(k.spin, 0);
  assert.ok(Math.hypot(k.vx, k.vz) < KART.vmax * 0.35);
});

// ── on the real circuit ──
const world = kartTrackWorld();
const t = kartTrack();
/** A simple driver (pure pursuit): steers its path (where it's going, not where it points: a
 *  drift points in) through a point a little way down the lap, lifts and brakes for what's coming,
 *  and when asked, drifts every bend that turns one way for a while. */
function driver(drifts: boolean) {
  return (k: KartState): KartInput => {
    const here = world.locate(k.x, k.z, k.y);
    const s = here ? here.s : 0;
    const v = Math.max(1, kartSpeed(k));
    const look = 5 + v * 0.45;
    const q = trackAt(t, s + look);
    const path = v > 3 ? Math.atan2(k.vz, k.vx) : k.a;
    let d = Math.atan2(q.z - k.z, q.x - k.x) - path;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    const yawWant = (v * 2 * Math.sin(d)) / look;
    const bend = (from: number, to: number) => {
      let sum = 0;
      for (let a = from; a <= to; a += 2) sum += trackAt(t, s + a).k;
      return sum / ((to - from) / 2 + 1);
    };
    const clamp = (x: number) => Math.max(-1, Math.min(1, x));
    if (drifts && v > KART.driftMin + 2) {
      const ahead = bend(6, 30);
      if (k.drift === 0 && Math.abs(ahead) > 1 / 90 && (!k.air || k.hopping))
        return { throttle: 1, brake: 0, steer: Math.sign(ahead), hop: true };
      if (k.drift !== 0) {
        const near = bend(2, 14);
        const keep = Math.sign(near) === k.drift && Math.abs(near) > 1 / 140 && k.tier < 3; // (purple: let go, drift again)
        const f = Math.min(1, v / 8);
        const steer = clamp(((yawWant / f) * k.drift - KART.driftYaw) / KART.driftSteer) * k.drift;
        return { throttle: 1, brake: 0, steer, hop: keep };
      }
    }
    let kmax = 0;
    for (let a = 4; a < 34; a += 2) kmax = Math.max(kmax, Math.abs(trackAt(t, s + a).k));
    const allowed = KART.yaw / (kmax + (KART.yaw * KART.yawFade) / KART.vmax);
    const f = Math.min(1, v / 7) * (1 - KART.yawFade * Math.min(1, v / KART.vmax));
    const steer = clamp(yawWant / (KART.yaw * f));
    return { throttle: v > allowed + 1.5 ? 0 : 1, brake: v > allowed + 4 ? 1 : 0, steer, hop: false };
  };
}
function lapRun(drifts: boolean, laps = 2) {
  const g = t.grid[0];
  const k = createKart(g.x, world.under(g.x, g.z, 10).y, g.z, g.a);
  const lc = new LapCounter(t);
  const drive = driver(drifts);
  let walls = 0;
  let worst = 0;
  let turbos = 0;
  let maxY = 0;
  let air = 0;
  for (let n = 0; n < 240 * 120 && lc.lap < laps; n++) {
    stepKart(k, drive(k), world);
    if (k.hit > 2) walls++;
    worst = Math.max(worst, k.hit);
    if (k.fired === 3) turbos++;
    if (k.air && !k.hopping) air += KART_STEP;
    maxY = Math.max(maxY, k.y);
    const on = world.locate(k.x, k.z, k.y);
    if (on) lc.update(on.s, k.t);
  }
  return { k, lc, walls, worst, turbos, maxY, air };
}

test("a lap of the real circuit by a careful driver: ~35–48 s, over the bridge, off the jump", () => {
  const r = lapRun(false);
  assert.equal(r.lc.lap, 2, "laps done");
  const best = r.lc.best ?? 0;
  assert.ok(best > 33 && best < 48, `best lap ${best}`);
  assert.ok(r.maxY > 2 + 5, `over the bridge (${r.maxY})`);
  assert.ok(r.air > 0.4, `air off the jump: ${r.air} s`);
  assert.ok(r.worst < 12, `hardest knock ${r.worst}`);
});

test("drifting the corners fires purple turbos and isn't slower", () => {
  const grip = lapRun(false);
  const drift = lapRun(true);
  assert.equal(drift.lc.lap, 2);
  assert.ok(drift.turbos >= 3, `purple turbos ${drift.turbos}`);
  assert.ok((drift.lc.best ?? 99) < (grip.lc.best ?? 0) + 1, `drift ${drift.lc.best} grip ${grip.lc.best}`);
});

test("the slipstream: in a wake for ~1.1 s near the top pays a boost; out of line, nothing", () => {
  const ahead = { x: 8, z: 0, a: 0 };
  const k = createKart(0, 0, 0, 0);
  k.vx = KART.vmax * 0.9;
  assert.equal(kartInWake(k, [ahead]), true);
  assert.equal(kartInWake(k, [{ x: 8, z: 4, a: 0 }]), false, "off to the side");
  assert.equal(kartInWake(k, [{ x: 8, z: 0, a: Math.PI }]), false, "coming the other way");
  assert.equal(kartInWake(k, [{ x: 30, z: 0, a: 0 }]), false, "too far");
  let paid = 0;
  for (let n = 0; n < Math.round(1.3 / KART_STEP); n++) {
    stepKart(k, { ...GO, draft: true }, flat());
    if (k.drafted) paid = (n + 1) * KART_STEP;
  }
  assert.ok(paid > 1 && paid < 1.2, `paid at ${paid} s`);
  assert.ok(k.boost > 0, "boosting");
  const slow = createKart(0, 0, 0, 0);
  run(slow, flat(), 1.5, { ...GO, draft: true });
  assert.equal(slow.boost, 0, "nothing off the line: it counts only once it's quick");
});

test("the same inputs give the same bits", () => {
  const a = lapRun(true, 1).k;
  const b = lapRun(true, 1).k;
  assert.deepEqual(a, b);
});

test("Vortex's levels: Easy slower than a careful driver, Hard faster than a drifting one; seven cost little", async () => {
  const { vortexRacer } = await import("./kart/vortex.ts");
  const lapOf = (level: "easy" | "medium" | "hard") => {
    const g = t.grid[0];
    const k = createKart(g.x, world.under(g.x, g.z, 10).y, g.z, g.a);
    const lc = new LapCounter(t);
    const d = vortexRacer(world, level, 1);
    for (let n = 0; n < 200 * 120 && lc.lap < 2; n++) {
      stepKart(k, d(k), world);
      const on = world.locate(k.x, k.z, k.y);
      if (on) lc.update(on.s, k.t);
    }
    return lc.best ?? 99;
  };
  const careful = lapRun(false).lc.best ?? 0;
  const drifting = lapRun(true).lc.best ?? 0;
  const easy = lapOf("easy");
  const medium = lapOf("medium");
  const hard = lapOf("hard");
  assert.ok(easy > careful + 3, `Easy ${easy} vs careful ${careful}`);
  assert.ok(medium < easy && hard < medium, `levels in order: ${easy} ${medium} ${hard}`);
  assert.ok(hard < drifting, `Hard ${hard} vs drifting ${drifting}`);
  // the server's cost: seven Vortex karts, a 20 Hz tick's six steps each
  const ks = t.grid
    .slice(0, 7)
    .map((g, i) => ({ k: createKart(g.x, world.under(g.x, g.z, 10).y, g.z, g.a), d: vortexRacer(world, "hard", i) }));
  for (let i = 0; i < 600; i++) for (const x of ks) stepKart(x.k, x.d(x.k), world);
  const t0 = performance.now();
  for (let i = 0; i < 200; i++) for (const x of ks) for (let j = 0; j < 6; j++) stepKart(x.k, x.d(x.k), world);
  const ms = (performance.now() - t0) / 200;
  assert.ok(ms < 2, `${ms.toFixed(2)} ms a tick`);
});
