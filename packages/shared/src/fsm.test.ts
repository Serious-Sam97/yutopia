import assert from "node:assert/strict";
import { test } from "node:test";
import { newShade, type Prey, SHADE, type Shade, type ShadeAct, type ShadeSense, think } from "./dark/fsm.ts";

// a little world: the shade walks where it wants at the speed it asks; the prey stands
const DT = 0.05;
function rng(seed = 1) {
  let x = seed;
  return () => {
    x = (x * 16807) % 2147483647;
    return x / 2147483647;
  };
}
interface World {
  t: number;
  s: Shade;
  prey: Prey[];
  night: number;
  dawn: boolean;
  burn: number;
  lit: boolean;
  light: { x: number; y: number } | null;
  wall: boolean;
  acts: ShadeAct[];
}
function world(sx: number, sy: number, prey: Partial<Prey> = {}): World {
  return {
    t: 0,
    s: newShade(sx, sy, 0, rng(3)),
    prey: [{ id: "ana", x: 0, y: 0, crouch: false, sprinting: false, hidden: false, ...prey }],
    night: 1,
    dawn: false,
    burn: 0,
    lit: false,
    light: null,
    wall: false,
    acts: [],
  };
}
function step(w: World, secs: number, until?: (a: ShadeAct) => boolean): ShadeAct | null {
  const r = rng(7);
  for (let k = 0; k < secs / DT; k++) {
    w.t += DT;
    const sense: ShadeSense = {
      t: w.t,
      night: w.night,
      dawn: w.dawn,
      burn: w.burn,
      lit: w.lit,
      light: w.light,
      prey: w.prey,
      sees: () => !w.wall,
    };
    const a = think(w.s, sense, DT, r);
    w.acts.push(a);
    if (a.goal) {
      const dx = a.goal.x - w.s.x;
      const dy = a.goal.y - w.s.y;
      const d = Math.hypot(dx, dy);
      const m = Math.min(d, a.speed * DT);
      if (d > 1e-6) {
        w.s.x += (dx / d) * m;
        w.s.y += (dy / d) * m;
      }
    }
    if (until?.(a)) return a;
    if (a.gone) return a;
  }
  return null;
}
const dist = (w: World) => Math.hypot(w.s.x - w.prey[0].x, w.s.y - w.prey[0].y);

test("it emerges for 1.2 s, closes to its circle, circles, then rushes in, winds up and strikes", () => {
  const w = world(15, 0);
  step(w, 1.15);
  assert.equal(w.s.state, "emerge");
  assert.equal(w.s.x, 15, "it stands while it gathers");
  step(w, 0.1);
  assert.equal(w.s.state, "stalk");
  // on the circle before its first rush
  step(w, 2.5);
  const d = dist(w);
  assert.ok(d >= SHADE.circle[0] - 0.5 && d <= SHADE.circle[1] + 1.5, `circling at ${d}`);
  const wind = step(w, 10, (a) => a.became === "windup");
  assert.ok(wind, "it winds up");
  assert.ok(dist(w) <= SHADE.closeIn + 0.01);
  const t0 = w.t;
  const strike = step(w, 2, (a) => !!a.strike);
  assert.equal(strike?.strike, "ana");
  assert.ok(Math.abs(w.t - t0 - SHADE.windup) < 0.06, `the windup is ${w.t - t0}`);
  step(w, SHADE.strike + SHADE.recover + 0.1);
  assert.equal(w.s.state, "stalk", "it backs off and stalks again");
});

test("a focused beam burns the shield and slows it; gone, it's exposed a good while, then grows back slowly", () => {
  const w = world(15, 0);
  step(w, 1.3);
  w.burn = 1;
  step(w, 0.5);
  assert.equal(w.s.state, "burning");
  assert.ok(Math.abs(w.s.shield - (100 - SHADE.burn * 0.5)) < 3, `${w.s.shield}`);
  const speeds = w.acts.slice(-5).map((a) => a.speed);
  assert.ok(
    speeds.every((v) => v <= SHADE.speed.rush * SHADE.burnSlow + 1e-9),
    `half speed: ${speeds}`,
  );
  step(w, 2, (a) => a.became === "exposed");
  assert.equal(w.s.state, "exposed");
  assert.equal(w.s.shield, 0);
  const d0 = dist(w);
  w.burn = 0;
  step(w, 2);
  assert.ok(dist(w) > d0, "it backs off, exposed");
  assert.equal(w.s.state, "exposed");
  step(w, SHADE.exposed - 2 + 0.1);
  assert.equal(w.s.state, "stalk", "the shield grows back");
  // slowly: about 6 a second, so a few seconds on it's still well short of whole
  step(w, 3);
  assert.ok(w.s.shield > 5 && w.s.shield < 30, `${w.s.shield}`);
});

test("a beam off it for a moment: the shield doesn't grow back until 2 s after", () => {
  const w = world(15, 0);
  step(w, 1.3);
  w.burn = 1;
  step(w, 0.6);
  const left = w.s.shield;
  assert.ok(left > 0 && left < 100);
  w.burn = 0;
  step(w, SHADE.regrowAfter - 0.2);
  assert.ok(Math.abs(w.s.shield - left) < 1e-6, `held at ${left}: ${w.s.shield}`);
  step(w, 1.2);
  assert.ok(w.s.shield > left, "then it comes back");
});

test("the windup is committed: a beam doesn't stop the strike (roll through it)", () => {
  const w = world(15, 0);
  step(w, 15, (a) => a.became === "windup");
  w.burn = 1;
  const strike = step(w, 1, (a) => !!a.strike);
  assert.equal(strike?.strike, "ana");
});

test("what it sees: 20 tiles at night, 10 by day, half crouched; a sprint heard at 8 without a line; nobody in a pool", () => {
  const far = world(18, 0);
  step(far, 1.3);
  assert.equal(far.s.target, "ana", "at night: 18 tiles");
  const day = world(18, 0);
  day.night = 0;
  step(day, 1.3);
  assert.equal(day.s.target, null, "by day: not at 18");
  const low = world(12, 0, { crouch: true });
  step(low, 1.3);
  assert.equal(low.s.target, null, "crouched: not at 12 (half of 20)");
  const loud = world(7, 0, { sprinting: true });
  loud.wall = true;
  step(loud, 1.3);
  assert.equal(loud.s.target, "ana", "a sprint, behind a wall, at 7");
  const safe = world(5, 0, { hidden: true });
  step(safe, 1.3);
  assert.equal(safe.s.target, null, "in a pool: nobody");
});

test("out of the dark past what it can see, it's drawn in until it does; not to someone safe in a pool", () => {
  const w = world(30, 0);
  step(w, 1.3);
  assert.equal(w.s.target, null, "30 tiles: out of sight");
  step(w, 5, () => w.s.target === "ana");
  assert.equal(w.s.target, "ana", "it came in and saw her");
  const safe = world(30, 0, { hidden: true });
  step(safe, 5);
  assert.ok(Math.abs(safe.s.x - 30) < 0.01, "nobody to be had: it stays out there");
});

test("in the light it flees out of it, burning; the dawn takes it; nobody near for 20 s and it goes", () => {
  const w = world(8, 0);
  step(w, 1.3);
  w.lit = true;
  w.light = { x: 6, y: 0 };
  step(w, 0.2);
  assert.equal(w.s.state, "flee");
  const x0 = w.s.x;
  step(w, 0.5);
  assert.ok(w.s.x > x0, "out of the light, away from its middle");
  assert.ok(w.s.shield < 100, "it burns in it");
  w.lit = false;
  step(w, 1.2);
  assert.equal(w.s.state, "stalk");

  const dawn = world(8, 0);
  step(dawn, 1.3);
  dawn.dawn = true;
  const gone = step(dawn, 6);
  assert.equal(gone?.gone, true, "dissolved at dawn");

  const alone = world(80, 0);
  const left = step(alone, 25);
  assert.equal(left?.gone, true, "nobody within 70 for 20 s");
});

test("someone safe indoors: never had, but it doesn't go — it prowls round them, watching", () => {
  const w = world(30, 0, { hidden: true, watch: true });
  const left = step(w, 40);
  assert.equal(left?.gone, undefined, "still there after 40 s");
  assert.equal(w.s.target, null, "never after her");
  assert.notEqual(w.s.state, "windup");
  // round her at the watching distance, moving
  const d = dist(w);
  assert.ok(Math.abs(d - SHADE.watch) < 2, `prowling ${d.toFixed(1)} off`);
  const at = { x: w.s.x, y: w.s.y };
  step(w, 4);
  assert.ok(Math.hypot(w.s.x - at.x, w.s.y - at.y) > 1, "it paces round");
  // gone in (past 70): it goes after 20 s as before
  w.prey[0].x = 200;
  const gone = step(w, 25);
  assert.equal(gone?.gone, true);
});
