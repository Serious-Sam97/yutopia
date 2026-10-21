import { verbPath } from "@yutopia/shared/move";
import type { Euler3, Pose } from "./rig";

// The move (docs/plan/29-the-move.md, M6): the body's new poses — the jog, the
// run and the sprint, crouching and sneaking, side-steps and backing up, a
// landing, aiming the torch (and a gun), and the verbs (vault, mantle, roll,
// slide). The rig's conventions are motion.ts's: the person faces +z, L is
// their left (+x); thigh/shoulder x < 0 swings forward, knee x > 0 bends,
// elbow x < 0 bends, spine x > 0 leans in, head x > 0 looks down; hips x > 0
// pitches the whole body forward, hips y > 0 turns it to their left. `lift`
// moves the hips: [side, up, ahead].
//
// Made the way an animator would: key poses (contact, down, passing, push,
// flight…) on named channels, eased between with time-aware Hermite splines;
// a cycle's second step is its first mirrored. The feet are planted by
// solving the leg chain (the build's own lengths), so nothing floats or sinks.

const TAU = Math.PI * 2;
const clamp01 = (t: number) => Math.max(0, Math.min(1, t));
const smoother = (t: number) => {
  const x = clamp01(t);
  return x * x * x * (x * (x * 6 - 15) + 10);
};

export interface Moved {
  pose: Pose;
  lift: Euler3;
}

// ── the leg, as built (build/body.ts, build/shoes.ts at the base proportions) ─
const THIGH = 0.306;
const SHIN = 0.306;
const ANKLE = 0.061; // the ankle over the sole
const TOE = 0.19; // the shoe ahead of the ankle
const HEEL = 0.082; // and behind it
const KNEE_CAP = 0.04;
/** The hip joint over the ground, standing. */
export const HIP_H = THIGH + SHIN + ANKLE;

/** How far below the hip joint a leg reaches: the lowest of its sole's toe and heel, or its
 *  knee when kneeling. `t` thigh, `k` knee, `f` the foot's pitch (toes down > 0), `ab` the
 *  thigh's spread out to the side. */
function legReach(t: number, k: number, f: number, ab = 0): number {
  const ankle = (THIGH * Math.cos(t) + SHIN * Math.cos(t + k)) * Math.cos(ab);
  const toe = ANKLE * Math.cos(f) + TOE * Math.sin(f);
  const heel = ANKLE * Math.cos(f) - HEEL * Math.sin(f);
  const knee = (THIGH * Math.cos(t) + KNEE_CAP) * Math.cos(ab);
  return Math.max(ankle + Math.max(toe, heel), knee);
}

// ── channels and keys ───────────────────────────────────────────────────────
// t/k/f thigh, knee, foot pitch · a thigh out to the side · s/e/o shoulder (fore/aft),
// elbow, shoulder out · w wrist · hx/hy/hz the hips · sx/sy/sz the spine · nx/ny the
// neck · dx/dy/dz the head · x a sway to the side · up the hips up (verbs; cycles plant)
// · air the hips off the ground (a run's flight)
type Ch = Record<string, number>;
interface Key {
  at: number;
  c: Ch;
}
const PAIRS: [string, string][] = [
  ["tL", "tR"],
  ["kL", "kR"],
  ["fL", "fR"],
  ["aL", "aR"],
  ["sL", "sR"],
  ["eL", "eR"],
  ["oL", "oR"],
  ["wL", "wR"],
];
const SIDEWAYS = ["hy", "hz", "sy", "sz", "ny", "dy", "dz", "x"];

/** The same pose on the other foot. */
function mirror(c: Ch): Ch {
  const m: Ch = { ...c };
  for (const [l, r] of PAIRS) {
    if (l in c || r in c) {
      m[l] = c[r] ?? 0;
      m[r] = c[l] ?? 0;
    }
  }
  for (const s of SIDEWAYS) if (s in c) m[s] = -c[s];
  return m;
}

/** A whole cycle from its first step (keys in [0, 0.5)): the second is the first mirrored. */
function cycle(half: Key[]): Key[] {
  return [...half, ...half.map((k) => ({ at: k.at + 0.5, c: mirror(k.c) }))];
}

/** The channels at `t` along keys: Hermite between keys with slopes from the neighbours (so
 *  it moves through each key rather than stopping on it); `loop`: the keys wrap at 1, else a
 *  verb that eases out of its first key and into its last. */
function sample(keys: Key[], t: number, loop: boolean): Ch {
  const n = keys.length;
  let x = loop ? ((t % 1) + 1) % 1 : Math.max(keys[0].at, Math.min(keys[n - 1].at, t));
  let i = n - 1;
  for (let j = 0; j < n; j++) {
    if (keys[j].at > x) {
      i = j - 1;
      break;
    }
  }
  if (i < 0) i = loop ? n - 1 : 0;
  if (!loop) i = Math.min(i, n - 2);
  // the key j along, with its time unwrapped around the loop
  const at = (j: number) => {
    if (!loop) {
      const w = Math.max(0, Math.min(n - 1, j));
      return { k: keys[w], t: keys[w].at };
    }
    const w = ((j % n) + n) % n;
    return { k: keys[w], t: keys[w].at + Math.floor(j / n) };
  };
  const k1 = at(i);
  const k2 = at(i + 1);
  const t1 = k1.t;
  const t2 = Math.max(k2.t, t1 + 1e-6);
  if (loop && x < t1) x += 1;
  const k0 = at(i - 1);
  const k3 = at(i + 2);
  const t0 = k0.t < t1 ? k0.t : t1 - (t2 - t1);
  const t3 = k3.t > t2 ? k3.t : t2 + (t2 - t1);
  const u = clamp01((x - t1) / (t2 - t1));
  const h00 = 2 * u ** 3 - 3 * u ** 2 + 1;
  const h10 = u ** 3 - 2 * u ** 2 + u;
  const h01 = -2 * u ** 3 + 3 * u ** 2;
  const h11 = u ** 3 - u ** 2;
  const d = t2 - t1;
  const out: Ch = {};
  for (const c of new Set([...Object.keys(k1.k.c), ...Object.keys(k2.k.c)])) {
    const p1 = k1.k.c[c] ?? 0;
    const p2 = k2.k.c[c] ?? 0;
    const p0 = k0.k.c[c] ?? p1;
    const p3 = k3.k.c[c] ?? p2;
    const m1 = !loop && i === 0 ? 0 : (p2 - p0) / (t2 - t0);
    const m2 = !loop && i + 1 === n - 1 ? 0 : (p3 - p1) / (t3 - t1);
    out[c] = h00 * p1 + h10 * d * m1 + h01 * p2 + h11 * d * m2;
  }
  return out;
}

const v = (c: Ch, n: string, d = 0) => c[n] ?? d;

/** The pose for a set of channels; the hips planted on the lowest foot unless `up` is given
 *  (then the hips are that far up), plus any `air`. */
function body(c: Ch): Moved {
  const p: Pose = {};
  for (const S of ["L", "R"] as const) {
    const out = S === "L" ? 1 : -1;
    const t = v(c, `t${S}`);
    const k = v(c, `k${S}`);
    const f = v(c, `f${S}`);
    const a = v(c, `a${S}`, 0.03);
    p[`thigh${S}`] = [t, 0, out * a];
    p[`knee${S}`] = [k, 0, 0];
    // the foot's pitch is the leg's sum; it stays flat across
    p[`ankle${S}`] = [f - t - k, 0, -out * a * 0.8];
    p[`shoulder${S}`] = [v(c, `s${S}`, 0.04), 0, out * v(c, `o${S}`, 0.13)];
    p[`elbow${S}`] = [v(c, `e${S}`, -0.16), 0, 0];
    p[`wrist${S}`] = [v(c, `w${S}`), 0, -out * 0.05];
  }
  p.hips = [v(c, "hx"), v(c, "hy"), v(c, "hz")];
  p.spine = [v(c, "sx"), v(c, "sy"), v(c, "sz")];
  p.neck = [v(c, "nx"), v(c, "ny"), 0];
  p.head = [v(c, "dx"), v(c, "dy"), v(c, "dz")];
  const up = "up" in c ? c.up : plantUp(c);
  return { pose: p, lift: [v(c, "x"), up + v(c, "air"), v(c, "fw")] };
}

/** The hips' height that puts the lowest foot on the ground. */
function plantUp(c: Ch): number {
  const reach = Math.max(
    legReach(v(c, "tL"), v(c, "kL"), v(c, "fL"), v(c, "aL", 0.03)),
    legReach(v(c, "tR"), v(c, "kR"), v(c, "fR"), v(c, "aR", 0.03)),
  );
  return reach - HIP_H;
}

// A cycle's hips, planted step by step, have corners where the lowest point of the feet passes
// from a heel to a toe or from one foot to the other: played at a jog's five steps a second
// they read as a shiver. So each cycle's height is worked out once round the loop, smoothed
// round it, calmed, and read back.
const LIFT_N = 96;
const lifts = new Map<string, Float32Array>();
function cycleLift(key: string, at: (phase: number) => Ch, phase: number, calm = 0.6): number {
  let t = lifts.get(key);
  if (!t) {
    let a = new Float32Array(LIFT_N);
    for (let i = 0; i < LIFT_N; i++) {
      const c = at(i / LIFT_N);
      a[i] = plantUp(c) + v(c, "air");
    }
    // three passes of a box round the loop: close to a gaussian, ~a seventh of the cycle wide
    for (let pass = 0; pass < 3; pass++) {
      const b = new Float32Array(LIFT_N);
      const r = 6;
      for (let i = 0; i < LIFT_N; i++) {
        let sum = 0;
        for (let j = -r; j <= r; j++) sum += a[(i + j + LIFT_N) % LIFT_N];
        b[i] = sum / (2 * r + 1);
      }
      a = b;
    }
    // and a calmer bob than the legs alone give (their short legs make it big, and quick)
    const mean = a.reduce((m, y) => m + y, 0) / LIFT_N;
    for (let i = 0; i < LIFT_N; i++) a[i] = mean + (a[i] - mean) * calm;
    t = a;
    lifts.set(key, t);
  }
  const x = (((phase % 1) + 1) % 1) * LIFT_N;
  const i = Math.floor(x);
  const f = x - i;
  return t[i % LIFT_N] * (1 - f) + t[(i + 1) % LIFT_N] * f;
}

/** The head kept level and looking ahead over whatever the trunk does (`look` down > 0). */
function steady(c: Ch, look = 0): Ch {
  const lean = v(c, "sx") + v(c, "hx");
  c.nx = v(c, "nx") - lean * 0.45;
  c.dx = v(c, "dx") - lean * 0.4 + look;
  c.dy = v(c, "dy") - (v(c, "sy") + v(c, "hy")) * 0.75;
  c.dz = v(c, "dz") - (v(c, "sz") + v(c, "hz")) * 0.6;
  return c;
}

// ── the run: jog (effort 0) → run → sprint (1) ──────────────────────────────
// the first step, the right foot down; tuned at a run (effort ½)
const RUN: Key[] = cycle([
  // contact: the right heel strikes ahead, the left folding up behind
  {
    at: 0,
    c: { tR: -0.55, kR: 0.22, fR: -0.14, tL: 0.48, kL: 1.3, fL: 1.2, sR: 0.55, eR: -1.1, sL: -0.72, eL: -1.65 },
  },
  // down: the knee takes the weight, the left heel up under the seat
  {
    at: 0.09,
    c: { tR: -0.3, kR: 0.75, fR: 0, tL: 0.08, kL: 2.1, fL: 1.35, sR: 0.36, eR: -1.3, sL: -0.48, eL: -1.55 },
  },
  // passing: the left knee comes through
  {
    at: 0.2,
    c: { tR: 0.08, kR: 0.55, fR: 0.1, tL: -0.55, kL: 2.0, fL: 0.85, sR: -0.06, eR: -1.5, sL: 0.06, eL: -1.5 },
  },
  // push: off the right toes, the left knee driven high
  {
    at: 0.31,
    c: { tR: 0.5, kR: 0.2, fR: 0.8, tL: -0.98, kL: 1.45, fL: 0.35, sR: -0.62, eR: -1.65, sL: 0.52, eL: -1.18 },
  },
  // flight: both off the ground, the left shin swinging out to land
  {
    at: 0.41,
    c: { tR: 0.6, kR: 0.85, fR: 1.1, tL: -0.86, kL: 0.52, fL: 0.05, sR: -0.72, eR: -1.62, sL: 0.58, eL: -1.12 },
  },
]);
// the trunk through the same step: the hips turn with the leg ahead, the chest against them,
// the hip of the swinging leg drops; down a little in the knee's give, up in the flight
const RUN_TRUNK: Key[] = cycle([
  { at: 0, c: { hy: 0.12, sy: -0.2, hz: 0.02, sx: 0, air: 0 } },
  { at: 0.09, c: { hy: 0.07, sy: -0.12, hz: 0.05, sx: 0.04, air: 0 } },
  { at: 0.2, c: { hy: 0, sy: 0, hz: 0.03, sx: 0.02, air: 0 } },
  { at: 0.31, c: { hy: -0.08, sy: 0.14, hz: 0, sx: 0, air: 0.025 } },
  { at: 0.41, c: { hy: -0.12, sy: 0.2, hz: -0.01, sx: 0, air: 0.06 } },
]);

/** Tiles per run cycle (two steps), by effort. */
export const runStride = (effort: number) => 1.7 + 0.65 * clamp01(effort);

/** The run at `phase` (0..1, distance-driven): `effort` 0 a jog (light, upright, low knees),
 *  ½ a run, 1 a sprint (long, driving, leaning into it). */
export function runPose(phase: number, effort = 0.5): Moved {
  const e = clamp01(effort);
  const c = runChannels(phase, e);
  // (the height by effort: worked out at five efforts, between them in a line)
  const k = e * 4;
  const i = Math.min(3, Math.floor(k));
  // (a jog bobs least: quick little steps; a sprint's longer strides, more)
  const lo = cycleLift(`run${i}`, (p) => runChannels(p, i / 4), phase, 0.35 + (0.25 * i) / 4);
  const hi = cycleLift(`run${i + 1}`, (p) => runChannels(p, (i + 1) / 4), phase, 0.35 + (0.25 * (i + 1)) / 4);
  c.up = lo + (hi - lo) * (k - i);
  c.air = 0;
  return body(steady(c));
}

function runChannels(phase: number, e: number): Ch {
  const c = { ...sample(RUN, phase, true), ...sample(RUN_TRUNK, phase, true) };
  const leg = 0.74 + 0.48 * e;
  const fold = 0.82 + 0.3 * e;
  const arm = 0.72 + 0.5 * e;
  for (const S of ["L", "R"]) {
    c[`t${S}`] = -0.1 + (c[`t${S}`] + 0.1) * leg;
    // the swinging knee folds tighter the harder you go; the planted one barely changes
    const k = c[`k${S}`];
    c[`k${S}`] = k > 0.9 ? 0.9 + (k - 0.9) * fold : k;
    c[`s${S}`] = -0.08 + (c[`s${S}`] + 0.08) * arm;
    c[`e${S}`] -= 0.12 * (1 - e);
    // the arm swings a little across the body going forward
    c[`o${S}`] = 0.16 + 0.08 * c[`s${S}`];
    c[`w${S}`] = 0.15;
  }
  c.hy *= 0.8 + 0.4 * e;
  c.sy *= 0.8 + 0.4 * e;
  c.sx += 0.06 + 0.36 * e;
  c.hx = 0.04 + 0.1 * e;
  c.air *= 0.5 + 0.9 * e;
  return c;
}

// ── crouching ───────────────────────────────────────────────────────────────
// the left foot flat ahead, the right knee down behind on its toes; the back low and round,
// the head up; the hands loose in front, ready
const CROUCH: Ch = {
  tL: -1.15,
  kL: 1.8,
  fL: 0,
  aL: 0.16,
  tR: -0.28,
  kR: 1.9,
  fR: 0.62,
  aR: 0.08,
  hx: 0.06,
  hy: 0.14,
  sx: 0.48,
  sy: -0.08,
  sL: -0.62,
  eL: -1.3,
  oL: 0.24,
  wL: 0.25,
  sR: -0.42,
  eR: -1.1,
  oR: 0.2,
  wR: 0.3,
};

/** Crouched, still (`breath` 0..1 through a breath, for a little life). */
export function crouchPose(breath = 0): Moved {
  const c = { ...CROUCH };
  c.sx += 0.02 * Math.sin(TAU * breath);
  return body(steady(c, -0.05));
}

// sneaking: low, heel to toe, the weight kept over the feet, the hands out a little
const SNEAK: Key[] = cycle([
  {
    at: 0,
    c: { tR: -1.32, kR: 1.6, fR: -0.12, tL: -0.48, kL: 1.95, fL: 0.75, sR: -0.48, sL: -0.68, hy: 0.06, sy: -0.07 },
  },
  {
    at: 0.16,
    c: { tR: -1.12, kR: 1.75, fR: 0, tL: -0.78, kL: 2.25, fL: 0.6, sR: -0.52, sL: -0.62, hy: 0.03, sy: -0.03 },
  },
  {
    at: 0.3,
    c: { tR: -0.92, kR: 1.82, fR: 0.05, tL: -1.12, kL: 2.2, fL: 0.25, sR: -0.58, sL: -0.56, hy: 0, sy: 0 },
  },
  {
    at: 0.42,
    c: { tR: -0.66, kR: 1.92, fR: 0.4, tL: -1.32, kL: 1.7, fL: -0.08, sR: -0.64, sL: -0.5, hy: -0.04, sy: 0.05 },
  },
]);

/** Tiles per sneaking cycle. */
export const SNEAK_STRIDE = 1.0;
/** Sneaking along crouched (`phase` distance-driven). */
export function crouchWalkPose(phase: number): Moved {
  const c = sneakChannels(phase);
  c.up = cycleLift("sneak", sneakChannels, phase);
  return body(steady(c, -0.05));
}
function sneakChannels(phase: number): Ch {
  const c = sample(SNEAK, phase, true);
  Object.assign(c, { hx: 0.06, sx: 0.46, aL: 0.14, aR: 0.14, eL: -1.25, eR: -1.25, oL: 0.26, oR: 0.26 });
  c.wL = 0.25;
  c.wR = 0.25;
  return c;
}

// ── side-steps and backing up ───────────────────────────────────────────────
// to their left: the left foot steps out, the right closes to it; the weight follows
const STRAFE: Key[] = [
  { at: 0, c: { aL: 0.07, aR: 0.07, tL: -0.12, kL: 0.28, tR: -0.05, kR: 0.26, x: -0.01, hz: 0 } },
  { at: 0.18, c: { aL: 0.26, aR: 0.04, tL: -0.36, kL: 0.75, fL: 0.08, tR: -0.04, kR: 0.32, fR: 0.12, x: 0, hz: 0.04 } },
  { at: 0.4, c: { aL: 0.34, aR: 0.2, tL: -0.14, kL: 0.4, tR: -0.04, kR: 0.32, fR: 0.06, x: 0.035, hz: 0.06 } },
  { at: 0.6, c: { aL: 0.28, aR: 0.08, tL: -0.1, kL: 0.36, tR: -0.3, kR: 0.72, fR: 0.12, x: 0.045, hz: 0.04 } },
  { at: 0.8, c: { aL: 0.14, aR: 0.06, tL: -0.12, kL: 0.3, tR: -0.12, kR: 0.4, fR: 0.04, x: 0.02, hz: 0.02 } },
];

/** Tiles per side-step cycle. */
export const STRAFE_STRIDE = 1.1;
/** A side-step (`side` +1: to their left, −1: to their right). */
export function strafePose(phase: number, side: 1 | -1): Moved {
  let c = strafeChannels(phase);
  c.up = cycleLift("strafe", strafeChannels, phase);
  if (side < 0) c = mirror(c);
  return body(steady(c));
}
function strafeChannels(phase: number): Ch {
  const c = sample(STRAFE, phase, true);
  Object.assign(c, { sx: 0.1, sz: -0.05, hx: 0.04, sL: -0.15, sR: -0.15, eL: -0.6, eR: -0.6, oL: 0.22, oR: 0.22 });
  return c;
}

// backing up: toes first, short steps, the weight a little back, the arms out to balance
const BACK: Key[] = cycle([
  {
    at: 0,
    c: {
      tR: 0.36,
      kR: 0.14,
      fR: 0.24,
      tL: -0.34,
      kL: 0.36,
      fL: -0.04,
      sR: -0.22,
      eR: -0.55,
      sL: 0.18,
      eL: -0.45,
      hy: -0.06,
    },
  },
  { at: 0.15, c: { tR: 0.22, kR: 0.32, fR: 0, tL: -0.2, kL: 0.8, fL: 0.35, sR: -0.12, sL: 0.1, hy: -0.03 } },
  { at: 0.3, c: { tR: 0.02, kR: 0.3, fR: 0, tL: 0.06, kL: 1.0, fL: 0.5, sR: 0.02, sL: -0.02, hy: 0 } },
  { at: 0.42, c: { tR: -0.2, kR: 0.24, fR: -0.04, tL: 0.32, kL: 0.42, fL: 0.42, sR: 0.14, sL: -0.15, hy: 0.04 } },
]);

/** Tiles per backing-up cycle. */
export const BACK_STRIDE = 1.0;
/** Backing up (`phase` distance-driven). */
export function backpedalPose(phase: number): Moved {
  const c = backChannels(phase);
  c.up = cycleLift("back", backChannels, phase);
  return body(steady(c, 0.06));
}
function backChannels(phase: number): Ch {
  const c = sample(BACK, phase, true);
  Object.assign(c, { sx: -0.06, oL: 0.26, oR: 0.26 });
  c.eL = c.eL ?? -0.5;
  c.eR = c.eR ?? -0.5;
  return c;
}

// ── landing and aiming ──────────────────────────────────────────────────────
/** Coming down (`impact` 0..1, by how fast): the knees take it, the arms out for balance; a
 *  hard one drops a hand towards the ground. */
export function landPose(impact: number): Moved {
  const i = clamp01(impact);
  const hard = smoother((i - 0.6) / 0.4);
  const c: Ch = {
    tL: -1.05 * i,
    kL: 1.75 * i,
    fL: 0,
    aL: 0.06 + 0.1 * i,
    tR: -0.85 * i,
    kR: 1.55 * i + 0.15 * hard,
    fR: 0.25 * hard,
    aR: 0.06 + 0.08 * i,
    hx: 0.05 * i,
    sx: 0.36 * i + 0.12 * hard,
    sL: -0.5 * i,
    eL: -0.35 - 0.3 * i,
    oL: 0.15 + 0.5 * i,
    sR: -0.5 * i - 0.7 * hard,
    eR: -0.35 - 0.3 * i + 0.25 * hard,
    oR: 0.15 + 0.5 * i - 0.4 * hard,
  };
  return body(steady(c));
}

/** The torch on, not aiming (docs/plan/30-the-dark.md): the flashlight in the left fist, the
 *  forearm out ahead and a little down, lighting the way — the left arm only, swaying with the
 *  breath (0..1); the rest of the body as it goes. */
export function torchPose(breath = 0): Pose {
  const b = 0.015 * Math.sin(TAU * breath);
  return { shoulderL: [-0.42 + b, 0, 0.12], elbowL: [-1.05, 0, 0], wristL: [0.08, 0, -0.05] };
}

/** Aiming (plan 29 M4, plan 30 D4): bladed, the left foot ahead, knees soft, leaning in; the
 *  torch out in the left hand along the look, the right ready by the hip — or out beside it,
 *  both arms locked, with a gun (`gun`). `pitch` (radians, up > 0) and `yaw` (the look off the
 *  body's facing, left > 0) go to the arms and the spine, the head the rest. `breath` 0..1. */
export function aimPose(pitch = 0, yaw = 0, gun = false, breath = 0): Moved {
  const up = Math.max(-0.9, Math.min(0.9, pitch));
  const b = 0.012 * Math.sin(TAU * breath);
  const c: Ch = {
    tL: -0.32,
    kL: 0.42,
    fL: 0,
    aL: 0.1,
    tR: 0.26,
    kR: 0.34,
    fR: 0.22,
    aR: 0.1,
    hx: 0.06,
    hy: -0.22 + yaw * 0.15,
    sx: 0.14 - up * 0.3 + b,
    sy: 0.2 + yaw * 0.5,
    sL: -1.42 - up * 0.75,
    eL: -0.2,
    oL: -0.16,
    wL: 0.06 + up * 0.1,
  };
  if (gun) Object.assign(c, { sR: -1.36 - up * 0.75, eR: -0.3, oR: -0.24, wR: -0.04 });
  else Object.assign(c, { sR: -0.36, eR: -1.15, oR: 0.1, wR: 0.22 });
  steady(c, -up * 0.25);
  c.dy += yaw * 0.25;
  c.ny = yaw * 0.25;
  return body(c);
}

// ── the verbs: keys along t (0..1); `up` is the hips over where the feet are (verbRoot) ──
export type Verb = "vault" | "mantle" | "roll" | "slide";

// over something hip-high: a step onto it and off, the arms out wide for balance (our people's
// arms are too short to put a hand on the top while the feet are on it)
const VAULT: Key[] = [
  {
    at: 0,
    c: {
      tR: -0.5,
      kR: 0.3,
      fR: -0.1,
      tL: 0.45,
      kL: 1.3,
      fL: 1.1,
      sR: 0.4,
      eR: -1.2,
      sL: -0.6,
      eL: -1.5,
      sx: 0.2,
      up: 0,
    },
  },
  {
    at: 0.2,
    c: {
      tR: 0.3,
      kR: 0.3,
      fR: 0.5,
      tL: -1.1,
      kL: 1.6,
      fL: 0.3,
      sR: -1.0,
      eR: -0.9,
      sL: 0.5,
      eL: -0.8,
      oL: 0.3,
      sx: 0.25,
      up: 0.05,
    },
  },
  {
    at: 0.36,
    c: {
      tL: -1.45,
      kL: 1.55,
      fL: 0,
      tR: 0.55,
      kR: 0.25,
      fR: 0.9,
      sR: -0.6,
      eR: -0.4,
      oR: 0.9,
      sL: -0.3,
      eL: -0.4,
      oL: 0.9,
      sx: 0.3,
      up: -0.3,
    },
  },
  {
    at: 0.52,
    c: {
      tL: -0.35,
      kL: 0.5,
      fL: 0.2,
      tR: -1.3,
      kR: 1.9,
      fR: 0.2,
      sR: -0.9,
      eR: -0.5,
      oR: 1.1,
      sL: -0.2,
      eL: -0.5,
      oL: 1.1,
      sx: 0.15,
      hy: 0.12,
      up: 0,
    },
  },
  {
    at: 0.7,
    c: {
      tR: -0.75,
      kR: 0.35,
      fR: -0.1,
      tL: 0.45,
      kL: 1.3,
      fL: 1.0,
      sR: 0.3,
      eR: -0.6,
      oR: 0.6,
      sL: -0.8,
      eL: -0.5,
      oL: 0.6,
      sx: 0.15,
      up: 0,
    },
  },
  {
    at: 0.86,
    c: {
      tR: -0.35,
      kR: 0.95,
      fR: 0,
      tL: 0.2,
      kL: 1.6,
      fL: 0.9,
      sR: 0.2,
      eR: -0.9,
      oR: 0.35,
      sL: -0.5,
      eL: -1.0,
      oL: 0.35,
      sx: 0.35,
      up: -0.08,
    },
  },
  {
    at: 1,
    c: {
      tL: -0.5,
      kL: 0.3,
      fL: -0.1,
      tR: 0.45,
      kR: 1.3,
      fR: 1.1,
      sL: 0.4,
      eL: -1.2,
      sR: -0.6,
      eR: -1.5,
      sx: 0.2,
      up: 0,
    },
  },
];

// up onto something chest-high: a jump to the edge, hanging, a push-up over it, a knee onto
// the top, standing (`up` here is over the root's own rise, verbRoot)
const MANTLE: Key[] = [
  {
    at: 0,
    c: {
      tL: -0.6,
      kL: 1.05,
      fL: 0,
      tR: -0.6,
      kR: 1.05,
      fR: 0,
      sL: 0.6,
      sR: 0.6,
      eL: -0.3,
      eR: -0.3,
      sx: 0.35,
      up: -0.14,
    },
  },
  {
    at: 0.14,
    c: {
      tL: 0.08,
      kL: 0.1,
      fL: 0.45,
      tR: 0.12,
      kR: 0.12,
      fR: 0.5,
      sL: -2.9,
      sR: -2.9,
      eL: -0.1,
      eR: -0.1,
      oL: 0.15,
      oR: 0.15,
      sx: -0.05,
      up: 0.05,
    },
  },
  {
    at: 0.32,
    c: {
      tL: -0.45,
      kL: 0.95,
      fL: 0.4,
      tR: -0.2,
      kR: 0.7,
      fR: 0.5,
      sL: -2.45,
      sR: -2.45,
      eL: -1.55,
      eR: -1.55,
      oL: 0.2,
      oR: 0.2,
      sx: 0.12,
      up: 0.02,
    },
  },
  {
    at: 0.5,
    c: {
      tL: -0.15,
      kL: 0.45,
      fL: 0.4,
      tR: -0.3,
      kR: 0.6,
      fR: 0.4,
      sL: -0.55,
      sR: -0.55,
      eL: -0.08,
      eR: -0.08,
      wL: 0.9,
      wR: 0.9,
      oL: 0.2,
      oR: 0.2,
      sx: 0.62,
      up: 0,
    },
  },
  {
    at: 0.68,
    c: {
      tR: -1.85,
      kR: 2.3,
      fR: 0.6,
      tL: 0.15,
      kL: 0.8,
      fL: 0.6,
      sL: -0.3,
      sR: -0.3,
      eL: -0.35,
      eR: -0.35,
      wL: 0.8,
      wR: 0.8,
      oL: 0.3,
      oR: 0.3,
      sx: 0.72,
      up: -0.1,
    },
  },
  {
    at: 0.85,
    c: {
      tR: -1.1,
      kR: 1.8,
      fR: 0,
      tL: -0.4,
      kL: 1.9,
      fL: 0.65,
      sL: -0.5,
      sR: -0.5,
      eL: -1.1,
      eR: -1.1,
      oL: 0.22,
      oR: 0.22,
      sx: 0.45,
      up: -0.22,
    },
  },
  { at: 1, c: { tL: 0, kL: 0, fL: 0, tR: 0, kR: 0, fR: 0, sx: 0.04, up: 0 } },
];

// a dive into a tuck over the right shoulder, once round, and up onto the feet
const TUCK: Ch = {
  tL: -2.0,
  kL: 2.45,
  fL: 0.3,
  tR: -1.9,
  kR: 2.4,
  fR: 0.3,
  sL: -0.9,
  sR: -0.75,
  eL: -1.7,
  eR: -1.5,
  oL: 0.2,
  oR: 0.35,
  sx: 0.8,
  nx: 0.45,
  dx: 0.45,
  hy: -0.3,
  sy: -0.2,
  up: -0.42,
};
const ROLL: Key[] = [
  {
    at: 0,
    c: {
      tL: -0.95,
      kL: 1.35,
      fL: 0,
      tR: -0.95,
      kR: 1.35,
      fR: 0,
      sL: -1.35,
      sR: -1.35,
      eL: -0.35,
      eR: -0.35,
      oL: 0.22,
      oR: 0.22,
      sx: 0.55,
      dx: -0.1,
      up: -0.24,
    },
  },
  { at: 0.16, c: TUCK },
  { at: 0.78, c: TUCK },
  {
    at: 0.92,
    c: {
      tL: -1.15,
      kL: 1.75,
      fL: 0,
      tR: -0.6,
      kR: 1.9,
      fR: 0.6,
      sL: -0.7,
      sR: -0.7,
      eL: -0.9,
      eR: -0.9,
      oL: 0.3,
      oR: 0.3,
      sx: 0.45,
      dx: -0.1,
      up: -0.32,
    },
  },
  {
    at: 1,
    c: {
      tL: -0.5,
      kL: 0.8,
      fL: 0,
      tR: -0.2,
      kR: 0.7,
      fR: 0.2,
      sL: -0.2,
      sR: -0.2,
      eL: -0.8,
      eR: -0.8,
      sx: 0.18,
      dx: -0.05,
      up: -0.1,
    },
  },
];

// down onto the snow from a sprint: the left leg out ahead, heel first, the right folded under,
// leaning back, a hand trailing; back up onto the feet at the end
const SLIDE_DOWN: Ch = {
  tL: -1.42,
  kL: 0.2,
  fL: -0.35,
  tR: -0.15,
  kR: 2.4,
  fR: 0.9,
  aR: 0.12,
  sx: -0.78,
  nx: 0.38,
  dx: 0.36,
  hy: 0.15,
  sL: -1.0,
  eL: -0.6,
  oL: 0.45,
  sR: 0.55,
  eR: -0.2,
  oR: 0.35,
  wR: -0.6,
  up: -0.45,
};
const SLIDE: Key[] = [
  {
    at: 0,
    c: {
      tR: -0.6,
      kR: 0.4,
      fR: -0.1,
      tL: 0.5,
      kL: 1.4,
      fL: 1.1,
      sR: 0.5,
      eR: -1.4,
      sL: -0.7,
      eL: -1.6,
      sx: 0.32,
      up: -0.04,
    },
  },
  { at: 0.18, c: { ...SLIDE_DOWN, sx: -0.15, up: -0.36 } },
  { at: 0.3, c: SLIDE_DOWN },
  { at: 0.75, c: { ...SLIDE_DOWN, sx: -0.5, dx: 0.3 } },
  {
    at: 0.9,
    c: {
      tL: -1.0,
      kL: 1.5,
      fL: 0,
      tR: -0.3,
      kR: 1.9,
      fR: 0.7,
      sL: -0.6,
      eL: -1.0,
      sR: -0.3,
      eR: -1.2,
      sx: 0.45,
      up: -0.26,
    },
  },
  {
    at: 1,
    c: {
      tL: -0.5,
      kL: 0.35,
      fL: -0.1,
      tR: 0.45,
      kR: 1.3,
      fR: 1.1,
      sL: 0.5,
      eL: -1.4,
      sR: -0.7,
      eR: -1.6,
      sx: 0.32,
      up: -0.04,
    },
  },
];

const VERBS: Record<Verb, Key[]> = { vault: VAULT, mantle: MANTLE, roll: ROLL, slide: SLIDE };
/** How long each verb takes, s. */
export const VERB_LEN: Record<Verb, number> = { vault: 0.55, mantle: 0.75, roll: 0.42, slide: 0.9 };

/** The body at `t` (0..1) through a verb. The roll turns once about the hips. */
export function verbPose(verb: Verb, t: number, reduced = false): Moved {
  const c = sample(VERBS[verb], t, false);
  if (verb !== "roll") steady(c);
  const out = body(c);
  if (verb === "roll" && !reduced) {
    const h = out.pose.hips ?? [0, 0, 0];
    const turn = TAU * smoother((t - 0.14) / 0.68);
    out.pose.hips = [h[0] + turn, h[1], h[2]];
    // turning about the hips: once the curled back faces down (the turn plus the tuck's own
    // curl, ~1.4) the head and shoulders are lowest, further from the hips than the tucked
    // feet, so the hips ride higher there
    const into = Math.min(1, turn / 0.6, (TAU - turn) / 0.6);
    out.lift[1] += 0.46 * (1 - Math.cos(turn + 1.4)) * 0.5 * into;
  }
  return out;
}

/** Where the feet go through a verb, from where it started (ahead, up; tiles): the movement
 *  core's own shape (shared/move/verbs.ts). `h`: the top's height (vault, mantle) — the keys'
 *  `up` is the hips over these feet. */
export function verbRoot(verb: Verb, t: number, h = 0.6): { ahead: number; up: number } {
  return verbPath(verb, t, h);
}

// ── the shadowed (docs/plan/30-the-dark.md D5): the upper body over their walk ──
export type ShadeKind = "lurch" | "windup" | "strike" | "recoil" | "exposed" | "lurk";
const UPPER = ["shoulderL", "shoulderR", "elbowL", "elbowR", "wristL", "wristR", "spine", "neck", "head"] as const;
const smooth01 = (x: number) => {
  const k = Math.max(0, Math.min(1, x));
  return k * k * (3 - 2 * k);
};
/** Their arms, back and head (the legs stay the walk's): slumped and twitching as they come;
 *  the arms going up overhead through the windup (`t` s into it) and down in the strike;
 *  an arm over the face, turned away, under a focused beam; hunched, exposed. `seed` keeps
 *  each one's twitches its own. */
export function shadePose(kind: ShadeKind, t: number, seed = 0): Pose {
  let c: Ch;
  if (kind === "windup") {
    const k = smooth01(t / 0.45);
    c = {
      sL: -0.4 - 2.3 * k,
      sR: -0.4 - 2.3 * k,
      eL: -0.3 - 0.6 * k,
      eR: -0.3 - 0.6 * k,
      oL: 0.13 + 0.25 * k,
      oR: 0.13 + 0.25 * k,
      sx: 0.25 - 0.4 * k,
      dx: -0.15 * k,
    };
  } else if (kind === "strike") {
    const k = smooth01(t / 0.12);
    c = {
      sL: -2.7 + 2.2 * k,
      sR: -2.7 + 2.2 * k,
      eL: -0.9 + 0.6 * k,
      eR: -0.9 + 0.6 * k,
      sx: -0.15 + 0.6 * k,
      dx: 0.2 * k,
    };
  } else if (kind === "recoil") {
    // (the arm across the face, the body twisting from the light; it shakes)
    const shake = 0.04 * Math.sin(t * 47 + seed);
    c = {
      sL: -1.95,
      eL: -2.1,
      oL: -0.15,
      wL: 0.3,
      sR: 0.45,
      eR: -0.5,
      sx: -0.22 + shake,
      sy: 0.28,
      dy: 0.55,
      dx: 0.12,
    };
  } else if (kind === "exposed") {
    c = { sL: -0.85, sR: -0.85, eL: -1.7, eR: -1.7, oL: -0.1, oR: -0.1, sx: 0.32, dx: 0.35 };
  } else if (kind === "lurk") {
    // asleep in a nest by day (docs/plan/31-the-day.md): folded over its knees, the arms wrapped
    // round them, the head down — a slow breath, and now and then a shiver
    const ph = t * 0.35 + seed * 3.1;
    const shiver = Math.max(0, Math.sin(ph * 3.3) * Math.sin(ph * 1.7) - 0.9) * 4;
    c = {
      sL: -0.75,
      sR: -0.7,
      eL: -1.9,
      eR: -1.85,
      oL: 0.35,
      oR: 0.35,
      sx: 0.62 + 0.03 * Math.sin(ph * 2),
      dx: 0.5,
      dz: 0.04 * shiver * Math.sin(t * 40),
    };
  } else {
    // the lurch: slumped forward, the arms hanging ahead, the head down; now and then a twitch
    const ph = t * 0.9 + seed * 7.13;
    const twitch = Math.max(0, Math.sin(ph * 2.7) * Math.sin(ph * 1.3) - 0.85) * 6;
    c = {
      sL: -0.35 + 0.08 * Math.sin(ph * 4),
      sR: -0.3 + 0.08 * Math.sin(ph * 4 + 2),
      eL: -0.3,
      eR: -0.25,
      sx: 0.3,
      sz: 0.08 * Math.sin(ph * 0.7),
      dx: 0.32,
      dy: twitch * (seed % 2 ? 0.5 : -0.5),
      dz: 0.25 * twitch,
    };
  }
  const p = body(c).pose;
  const out: Pose = {};
  for (const j of UPPER) out[j] = p[j];
  return out;
}

/** One of the shadowed, shot down (`t` s into its death, SHADE.dying long): thrown back by the
 *  shot, staggering with its arms up into the light, dropping to its knees, folding over onto
 *  the snow — and lying there as it burns away. Odd `seed`s fall the other way round. */
const DEATH: Key[] = [
  { at: 0, c: { up: 0, sx: 0.3, dx: 0.32, sL: -0.35, sR: -0.3, eL: -0.3, eR: -0.25 } },
  {
    at: 0.1,
    c: {
      up: -0.01,
      hx: -0.22,
      sx: -0.3,
      sy: 0.25,
      nx: -0.25,
      dx: -0.5,
      sL: 0.55,
      sR: 0.45,
      oL: 0.75,
      oR: 0.85,
      eL: -0.4,
      eR: -0.2,
      wL: 0.4,
      wR: 0.4,
      tR: 0.35,
      kR: 0.25,
    },
  },
  {
    at: 0.42,
    c: {
      up: -0.03,
      hx: -0.12,
      sx: -0.32,
      sy: -0.1,
      nx: -0.2,
      dx: -0.6,
      sL: -2.25,
      sR: -1.95,
      oL: 0.55,
      oR: 0.6,
      eL: -0.2,
      eR: -0.35,
      wL: 0.3,
      wR: 0.2,
      tL: -0.25,
      kL: 0.5,
      tR: -0.1,
      kR: 0.6,
    },
  },
  {
    at: 0.82,
    c: {
      up: -0.33,
      hx: 0.15,
      sx: 0.25,
      sy: 0.05,
      dx: 0.5,
      sL: -0.6,
      sR: -0.45,
      oL: 0.3,
      oR: 0.3,
      eL: -0.5,
      eR: -0.4,
      tL: -0.15,
      kL: 1.65,
      fL: 1.35,
      tR: -0.15,
      kR: 1.65,
      fR: 1.35,
    },
  },
  {
    at: 1.3,
    c: {
      up: -0.34,
      hx: 0.7,
      sx: 0.55,
      dx: 0.42,
      sL: -0.2,
      sR: -0.12,
      oL: 0.22,
      oR: 0.2,
      eL: -0.25,
      eR: -0.2,
      tL: -0.75,
      kL: 1.75,
      fL: 1.3,
      tR: -0.72,
      kR: 1.75,
      fR: 1.3,
    },
  },
  {
    at: 1.9,
    c: {
      up: -0.37,
      hx: 1.15,
      sx: 0.62,
      nx: 0.2,
      dx: 0.3,
      dy: 0.35,
      sL: 0.4,
      sR: 0.3,
      oL: 0.28,
      oR: 0.22,
      eL: -0.1,
      eR: -0.15,
      tL: -1.2,
      kL: 1.9,
      fL: 1.2,
      tR: -1.15,
      kR: 1.9,
      fR: 1.2,
    },
  },
];
const DEATH_M = DEATH.map((k) => ({ at: k.at, c: mirror(k.c) }));
export function deathPose(t: number, seed = 0): Moved {
  return body(sample(Math.floor(seed) % 2 ? DEATH_M : DEATH, t, false));
}

// ── down (docs/plan/30-the-dark.md D7): on hands and knees, crawling; and the one by them,
// kneeling, a hand on their back ──
/** Crawling on hands and knees, `phase` 0..1 a cycle (distance-driven); standing still at 0. */
export function crawlPose(phase: number): Moved {
  const s = Math.sin(phase * TAU);
  const c: Ch = {
    up: -0.36,
    hx: 1.05,
    sx: 0.2,
    nx: -0.5,
    dx: -0.55,
    // the knees under the hips, a step each in turn
    tL: -1.25 + 0.25 * s,
    tR: -1.25 - 0.25 * s,
    kL: 1.95,
    kR: 1.95,
    fL: 0.9,
    fR: 0.9,
    // the hands down ahead, reaching in turn
    sL: -1.25 - 0.3 * s,
    sR: -1.25 + 0.3 * s,
    eL: -0.25,
    eR: -0.25,
    wL: 0.6,
    wR: 0.6,
  };
  return body(c);
}
/** Kneeling by someone down, a hand out on their back. */
/** Asleep in a day's nest (docs/plan/31-the-day.md): squatting low, folded over the knees, the arms
 *  round them, the head down; a slow breath, now and then a shiver (`t` s asleep, `seed` its own). */
export function lurkPose(t: number, seed = 0): Moved {
  const ph = t * 0.35 + seed * 3.1;
  const breath = 0.04 * Math.sin(ph * 2);
  const shiver = Math.max(0, Math.sin(ph * 3.3) * Math.sin(ph * 1.7) - 0.9) * 4;
  const c: Ch = {
    up: -0.5,
    tL: -1.95,
    kL: 2.35,
    fL: 0.45,
    tR: -1.85,
    kR: 2.3,
    fR: 0.5,
    aL: 0.12,
    aR: 0.12,
    sx: 0.78 + breath,
    dx: 0.5,
    dz: 0.05 * shiver * Math.sin(t * 40),
    sL: -0.95,
    sR: -0.9,
    eL: -1.7,
    eR: -1.65,
    oL: 0.3,
    oR: 0.3,
  };
  return body(c);
}
export function kneelPose(): Moved {
  const c: Ch = {
    up: -0.22,
    tL: -1.45,
    kL: 1.55,
    fL: 0.1,
    tR: 0.15,
    kR: 1.9,
    fR: 1.2,
    sx: 0.35,
    dx: 0.25,
    sR: -1.1,
    eR: -0.4,
    sL: -0.2,
    eL: -0.6,
  };
  return body(c);
}
