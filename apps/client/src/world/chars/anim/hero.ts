import {
  ANKLE,
  BALL,
  body,
  type Ch,
  clamp01,
  cycle,
  HEEL,
  HIP_H,
  type Key,
  LEG_K,
  type Moved,
  mirror,
  SHIN,
  sample,
  smoother,
  steady,
  TAU,
  THIGH,
  v,
} from "../moves";
import type { Euler3 } from "../rig";

// Plan 58's animations (docs/plan/58-the-animation.md): standing, the walk, the run, the skid, the
// jumps and the slide keyed again — loaded on their own (the 3D people's chunk was full), the first
// time a body asks for them (`loadHero` in locomotion.ts). The keys' machinery is moves.ts's.

// (2026-10-30: the legs 15% longer — moves.ts LEG_K. Every gait was keyed on 0.612 m legs: its
// strides, where a foot lands and its keys by where the foot's to be scale by it, its hips' heights
// over the ankle's)
const K = LEG_K;
const hipAt = (h: number) => ANKLE + (h - ANKLE) * K;

/** The bundle's mark (tools/budget.mjs finds it by this). */
export const ANIM_CHUNK = "yutopia-anim";

// ── plan 58, phase 0: the hero animations keyed again (docs/plan/58-the-animation.md) ─────────
// Kingdom Hearts 3 where you play, Alan Wake 2 where you live; `tension` (0..1: the mood — night,
// the dark) moves them toward Alan Wake 2. Beside the old ones until they're signed off
// (`Motion3.v2`, `Locomotion.v2`); then they're the only ones.

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const lerpCh = (a: Ch, b: Ch, t: number): Ch => {
  const out: Ch = { ...a };
  for (const k of Object.keys(b)) out[k] = lerp(v(a, k), b[k], t);
  return out;
};
// a cheap smooth wobble, the same for a seed: three sines that never line up (a living body's
// never-quite-still)
const wob = (t: number, s: number) =>
  (Math.sin(t * 0.73 + s * 5.1) + 0.6 * Math.sin(t * 1.37 + s * 2.3) + 0.35 * Math.sin(t * 2.91 + s * 7.7)) / 1.95;
// a seeded number in 0..1 for the n-th of something
const hash = (n: number, s: number) => {
  const x = Math.sin(n * 127.1 + s * 311.7) * 43758.5453;
  return x - Math.floor(x);
};

// The trunk's lean shared down it (plan 58): some at the hips (the thighs turned back by as much, so
// the legs keep their way), the rest bending the spine and the chest — a back that curves, not a
// plank on a hinge. (Phase 0 took all but 0.05 at the hips: the waist was two rigid pieces then,
// and a bent spine opened them. Phase 2's chest and skin weights closed it.)
const LEAN = { hips: 0.4, spine: 0.35, chest: 0.25 };
function leanAtHips(c: Ch): Ch {
  const sx = v(c, "sx");
  if (!sx) return c;
  const hips = sx * LEAN.hips;
  c.sx = sx * LEAN.spine;
  c.cx = v(c, "cx") + sx * LEAN.chest;
  c.hx = v(c, "hx") + hips;
  c.tL = v(c, "tL") - hips;
  c.tR = v(c, "tR") - hips;
  return c;
}

// ── standing: weight on one leg, the other easy; breathing in the chest; never quite still;
// glances that turn the eyes, the head, the neck and a little of the chest. By day (KH) light and
// open; in the dark (AW) knees soft, shoulders in, hands up a little, looking round — and now and
// then over the shoulder.

/** The idle at `t` s (pure: a seed gives each person their own rhythm). */
/** Where the idle's glance is at `t` (rad, + to the left: the head's way) — the gaze's target when
 *  there's one (plan 58 G.D: the eyes lead it, the head follows). */
export function idleGlance(t: number, tension = 0, seed = 0): number {
  const T = clamp01(tension);
  const G = lerp(5.5, 2.6, T) + 2 * hash(2, seed);
  const gi = Math.floor(t / G);
  const gu = (t - gi * G) / G;
  const gTo = hash(gi + 40, seed) < lerp(0.45, 0.8, T) ? (hash(gi + 80, seed) - 0.5) * lerp(0.9, 1.5, T) : 0;
  const glance = gTo * smoother(gu / 0.08) * (1 - smoother((gu - 0.55) / 0.12));
  const back =
    T > 0.5 && hash(gi + 120, seed) < (T - 0.5) * 0.9
      ? (hash(gi + 160, seed) < 0.5 ? 1 : -1) * (0.5 - 0.5 * Math.cos(2 * Math.PI * clamp01((gu - 0.15) / 0.5))) * 1.1
      : 0;
  return glance + back + idleVariant(t, T, seed).look;
}

// ── the idle's variants (plan 58 G.E): now and then, never on a beat — a stretch, a neck rolled, a
// foot shuffled, a look round, the shirt tugged straight; in the dark, a look round, hands rubbed
// for the cold, a shuffle
type Variant = "stretch" | "neck" | "shuffle" | "round" | "tug" | "hands" | "stamp";
const DAY: Variant[] = ["stretch", "neck", "shuffle", "round", "tug"];
const DARK: Variant[] = ["round", "hands", "stamp", "round", "shuffle"];
const VARIANT_LEN = 2.6;
function idleVariant(t: number, T: number, seed: number): { c: Ch; w: number; look: number } {
  const V = lerp(17, 11, T) + 7 * hash(5, seed);
  const vi = Math.floor(t / V);
  const at = t - vi * V - 2.5 * hash(vi + 300, seed);
  if (at < 0 || at > VARIANT_LEN || hash(vi + 200, seed) > 0.8) return { c: {}, w: 0, look: 0 };
  const list = T > 0.5 ? DARK : DAY;
  const kind = list[Math.floor(hash(vi + 250, seed) * list.length) % list.length];
  const u = at / VARIANT_LEN;
  const w = smoother(at / 0.45) * (1 - smoother((at - (VARIANT_LEN - 0.55)) / 0.55));
  const hump = Math.sin(Math.PI * u);
  switch (kind) {
    case "stretch":
      // up on the toes, arms up over the head, the trunk leant back a little (at the hips)
      return {
        c: {
          sL: -2.8,
          sR: -2.8,
          oL: 0.35,
          oR: 0.35,
          eL: -0.2,
          eR: -0.2,
          fL: 0.45 * hump,
          fR: 0.45 * hump,
          sx: -0.12,
          dx: -0.2,
          // (the hands open, the fingers out)
          hL: -1,
          hR: -1,
        },
        w,
        look: 0,
      };
    case "neck":
      // the head rolled to one side and the other, the shoulders easing
      return {
        c: { dz: 0.28 * Math.sin(2 * Math.PI * u), nx: 0.12 * hump, sL: 0.12 * hump, sR: 0.12 * hump },
        w,
        look: 0,
      };
    case "shuffle": {
      // a small step: the back foot lifted, set down a little on, back where it was (the feet are
      // placed: `idle2Pose`)
      // (up first, then on, and down where it's set: it doesn't slide)
      const up = 0.5 - 0.5 * Math.cos(2 * Math.PI * clamp01((u - 0.2) / 0.6));
      const on = smoother(clamp01((u - 0.27) / 0.18)) - smoother(clamp01((u - 0.47) / 0.18));
      return { c: { stepUp: 0.045 * up, stepOn: 0.05 * on }, w, look: 0 };
    }
    case "round":
      // a look round, one way then the other
      return { c: {}, w: 0, look: 0.85 * Math.sin(2 * Math.PI * u) * w };
    case "tug":
      // the shirt's hem tugged straight: both hands down in front
      return {
        c: {
          sL: -0.35,
          sR: -0.35,
          oL: 0.02,
          oR: 0.02,
          eL: -0.75,
          eR: -0.75,
          wL: 0.4,
          wR: 0.4,
          nx: 0.15,
          dx: 0.15,
          // (the hem in a grip)
          hL: 0.75,
          hR: 0.75,
        },
        w,
        look: 0,
      };
    case "hands": {
      // hands rubbed together in front for the cold
      const rub = Math.sin(t * 2 * Math.PI * 4) * 0.12;
      return {
        c: {
          sL: -0.62,
          sR: -0.62,
          eL: -1.65 + rub,
          eR: -1.65 - rub,
          oL: -0.12,
          oR: -0.12,
          wL: 0.3,
          wR: 0.3,
          nx: 0.1,
          hL: -0.7,
          hR: -0.7,
        },
        w,
        look: 0,
      };
    }
    case "stamp": {
      // the cold: the front foot stamped twice, the arms in close, the shoulders up
      const beat = clamp01((u - 0.15) / 0.7) * 2;
      const lift = Math.max(0, Math.sin(Math.PI * beat)) ** 2;
      return {
        c: { stampUp: 0.06 * lift, sL: -0.15, sR: -0.15, oL: 0.04, oR: 0.04, eL: -0.9, eR: -0.9, nx: 0.12 },
        w,
        look: 0,
      };
    }
  }
}

/** The breath's place in its cycle (0..1) and how winded (0..1): kept by `Locomotion` as it goes
 *  (`life()`), so a quickening breath doesn't jump; without them, the breath's by `t`. */
export interface Life {
  breath?: number;
  puff?: number;
  /** 4e: how they stand (their walk's style) */
  gait?: string;
}
export function idle2Pose(t: number, tension = 0, seed = 0, gazed = false, life?: Life): Moved {
  const T = clamp01(tension);
  const puff = clamp01(life?.puff ?? 0);
  const st = styleOf(life?.gait);
  // weight from leg to leg: held a while, moved over in ~1.1 s (fidgety in the dark; by the style)
  const P = (lerp(6.5, 3.8, T) + 2.5 * hash(1, seed)) * st.shift;
  const n = Math.floor(t / P);
  const into = (t - n * P) / 1.1;
  const sideOf = (i: number) => (hash(i, seed) < 0.5 ? 1 : -1);
  const w = lerp(sideOf(n - 1), sideOf(n), smoother(into)); // 1: on the left leg
  // the shift's own small dip, the free foot easing as the weight leaves it
  // (a hump that starts and ends at rest: a half-sine kinked the knees at each end)
  const moving = into > 0 && into < 1 ? 0.5 - 0.5 * Math.cos(2 * Math.PI * into) : 0;
  const L = Math.max(0, w);
  const R = Math.max(0, -w);
  // breath (3b): in the chest — slow and deep by day, quicker and shallower in the dark, fast and big
  // when winded; `A` its size
  const br = Math.sin(2 * Math.PI * (life?.breath ?? t / lerp(4.2, 2.6, T)) + seed);
  const A = 1 + 2.4 * puff;
  // a glance: held, then back; bigger and more often in the dark; over the shoulder now and then
  const G = lerp(5.5, 2.6, T) + 2 * hash(2, seed);
  const gi = Math.floor(t / G);
  const gu = (t - gi * G) / G;
  const gTo = hash(gi + 40, seed) < lerp(0.45, 0.8, T) ? (hash(gi + 80, seed) - 0.5) * lerp(0.9, 1.5, T) : 0;
  const glance = gTo * smoother(gu / 0.08) * (1 - smoother((gu - 0.55) / 0.12));
  const back =
    T > 0.5 && hash(gi + 120, seed) < (T - 0.5) * 0.9
      ? (hash(gi + 160, seed) < 0.5 ? 1 : -1) * (0.5 - 0.5 * Math.cos(2 * Math.PI * clamp01((gu - 0.15) / 0.5))) * 1.1
      : 0;
  // (gazed: the head's turned by the gaze, the eyes leading — not here)
  const look = gazed ? 0 : glance + back + idleVariant(t, T, seed).look;
  const c: Ch = {
    // (the legs: started near where they'll be — the feet are placed and the legs solved to them,
    // below; the feet flat, unless a stretch tips them)
    // (the free foot's heel a little up, easy on its ball)
    tL: 0.02 - 0.13 * R,
    kL: 0.03 + 0.34 * R + 0.14 * T,
    fL: 0.04 * R,
    aL: 0.05,
    tR: 0.02 - 0.13 * L,
    kR: 0.03 + 0.34 * L + 0.14 * T,
    fR: 0.04 * L,
    aR: 0.05,
    // the hips over the standing leg, its side up (the free hip drops), the chest leaning back
    // over it the other way
    // (the counter-roll mostly in the neck and head: the waist's two pieces open at a bend; the
    // hips' roll is taken back out of the legs below — they're the root, else the whole body
    // leant over with them)
    x: 0.012 * w,
    // (the hips tipped down to the free leg: less than 0.07 — that dropped its hip so far the knee
    // bent 35–40° and she stood half sitting)
    hz: 0.045 * w,
    sz: -0.035 * w,
    dz: 0.07 * w,
    // the trunk: up by day, down and in in the dark; breath lifting the chest
    hx: 0.03 * T,
    // (winded: bent forward a little over the knees, getting it back)
    sx: lerp(-0.025, 0.1, T) - 0.008 * A * br + 0.01 * wob(t, seed + 1) + 0.3 * puff,
    // the arms hanging easy (by day a little out), in and up in the dark
    sL: lerp(0.03, -0.04, T) - 0.012 * A * br + 0.025 * wob(t * 0.8, seed + 2) - 0.1 * puff,
    sR: lerp(0.03, -0.02, T) - 0.012 * A * br + 0.025 * wob(t * 0.8, seed + 3) - 0.1 * puff,
    eL: lerp(-0.2, -0.45, T),
    eR: lerp(-0.24, -0.4, T),
    // (out as far as the chest leans over the standing leg: else the far arm sinks into the body)
    // (|w| softened: it kinked as the weight passed the middle)
    oL: lerp(0.14, 0.24, T) + 0.1 * (Math.hypot(w, 0.25) - 0.25) + 0.01 * br,
    oR: lerp(0.14, 0.24, T) + 0.1 * (Math.hypot(w, 0.25) - 0.25) + 0.01 * br,
    wL: 0.08,
    wR: 0.08,
    // the look: eyes and head most, the neck and chest after; the chest's own slow wander (not the
    // hips': they'd turn the feet)
    dy: look * 0.6,
    ny: look * 0.25,
    sy: look * 0.15 + 0.025 * wob(t * 0.6, seed),
    dx: 0.02 * wob(t * 1.3, seed + 4) + 0.05 * T - 0.12 * puff,
    // the chest rising and opening as it breathes in (its own joint: it heaves when winded)
    cx: -0.022 * A * br,
    nx: lerp(-0.02, 0.06, T),
    // (a little under standing tall: the standing leg reaches with its hip rolled up, knees soft in
    // the dark; a dip as the weight goes over)
    // (the standing leg near straight, the free knee easy — 2 cm lower stood her in a half-squat,
    // both knees at 37°, and the legs read short; softer in the dark, a little)
    // (the standing leg at its full reach, its foot on the floor — a hair higher and it hung short)
    up: -0.007 - 0.014 * T - 0.03 * puff - 0.008 * moving + 0.0015 * A * br,
  };
  // winded (3b): hands on the hips, leant on them, the chest heaving — eased in as it gets hard
  const hips = smoother(clamp01((puff - 0.35) / 0.3));
  if (hips > 0) {
    for (const [S, k] of [
      ["L", 0],
      ["R", 1],
    ] as const) {
      c[`s${S}`] = lerp(v(c, `s${S}`), 0.25, hips);
      c[`o${S}`] = lerp(v(c, `o${S}`), 0.62, hips);
      c[`e${S}`] = lerp(v(c, `e${S}`), -1.75, hips);
      c[`w${S}`] = lerp(v(c, `w${S}`), 0.35 + 0.02 * k, hips);
    }
    c.hL = 0.4 * hips;
    c.hR = 0.4 * hips;
  }
  // (4e: the style's stoop, head and arms; its knees soft, never higher than standing)
  if (st !== CALM) {
    c.sx = v(c, "sx") + st.lean;
    c.dx = v(c, "dx") + st.head;
    c.oL = v(c, "oL") + st.out;
    c.oR = v(c, "oR") + st.out;
    c.up = v(c, "up") + Math.min(0, st.hips);
  }
  // (the variants wait while she gets it back)
  const vr = puff > 0.3 ? { c: {}, w: 0, look: 0 } : idleVariant(t, T, seed);
  if (vr.w > 0) for (const k of Object.keys(vr.c)) c[k] = lerp(v(c, k), vr.c[k] + (k === "sx" ? v(c, k) : 0), vr.w);
  // up on the balls of the feet (a stretch): the hips go up as far as the heels (both feet: the free
  // foot's own heel up doesn't)
  const tip = Math.max(Math.min(v(c, "fL"), v(c, "fR")), 0);
  c.up = v(c, "up") + BALL * Math.sin(tip);
  const m = upright(body(leanAtHips(c)));
  // the feet placed (3a: they stay put — the weight shifts and the hips roll over them; the free knee
  // bends because its hip's come down, as a body's does): a relaxed stance, one foot a little ahead
  const ahead = hash(9, seed) < 0.5 ? 1 : -1;
  for (const [S, side] of [
    ["L", 1],
    ["R", -1],
  ] as const) {
    const front = side === ahead;
    const f = Math.max(0, v(c, `f${S}`));
    const at: V3 = [
      side * (0.088 + st.wide + (front ? 0.012 : 0)),
      ANKLE * Math.cos(f) + BALL * Math.sin(f),
      front ? 0.035 : -0.012,
    ];
    // (the back foot's the one that shuffles; the front one stamps)
    if (!front) {
      at[1] += v(c, "stepUp");
      at[2] += v(c, "stepOn");
    } else at[1] += v(c, "stampUp");
    reachTo(m, S, at, 1);
  }
  return m;
}

/** The legs kept upright under hips that roll (they're the root): the thighs turned back by the
 *  roll, the feet flat on the floor again. */
function upright(m: Moved): Moved {
  const p = m.pose;
  const hz = p.hips?.[2] ?? 0;
  for (const S of ["L", "R"] as const) {
    const th = p[`thigh${S}`];
    const an = p[`ankle${S}`];
    if (!th || !an) continue;
    th[2] -= hz;
    // (the foot: flat, whatever the leg's own spread — the hips' roll and the thigh's taken out)
    an[2] = -(hz + th[2]);
  }
  return m;
}

// ── the walk (AW: weight down through a heel strike, a roll onto the flat foot and a push off the
// toes; the pelvis turning and dropping with each step, the chest against it, the arms swinging
// from the shoulder with the elbows trailing). The first step, the right heel down.
const WALK2: Key[] = cycle([
  {
    at: 0,
    c: {
      tR: -0.46,
      kR: 0.04,
      fR: -0.28,
      tL: 0.4,
      kL: 0.24,
      fL: 0.45,
      sL: -0.34,
      eL: -0.44,
      sR: 0.3,
      eR: -0.18,
      hy: 0.1,
      sy: -0.13,
      hz: 0,
      x: 0,
    },
  },
  // loading: the right knee gives, the foot flat; the left off its toes
  {
    at: 0.11,
    c: {
      tR: -0.33,
      kR: 0.27,
      fR: 0,
      tL: 0.5,
      kL: 0.64,
      fL: 0.98,
      sL: -0.27,
      eL: -0.4,
      sR: 0.25,
      eR: -0.2,
      hy: 0.06,
      sy: -0.09,
      hz: -0.045,
      x: -0.012,
    },
  },
  // passing: the left knee through, the foot clear; up over the right
  {
    at: 0.25,
    c: {
      tR: -0.02,
      kR: 0.08,
      fR: 0.02,
      tL: -0.14,
      kL: 1.12,
      fL: 0.35,
      sL: -0.02,
      eL: -0.32,
      sR: 0.0,
      eR: -0.27,
      hy: 0,
      sy: 0,
      hz: -0.03,
      x: -0.016,
    },
  },
  // up: the right heel lifting, the left leg reaching out for its step
  {
    at: 0.38,
    c: {
      tR: 0.24,
      kR: 0.06,
      fR: 0.2,
      tL: -0.42,
      kL: 0.34,
      fL: -0.14,
      sL: 0.22,
      eL: -0.2,
      sR: -0.27,
      eR: -0.38,
      hy: -0.06,
      sy: 0.08,
      hz: -0.01,
      x: -0.008,
    },
  },
]);
// ── 4e: how someone walks (decisions 5 and 6): yours chosen in the look's editor — calm, bouncy,
// heavy — and the folk's by who they are — brisk, tired, old. Each shapes the walk from its feet (the
// stride, the hips' height and bob, the heel strike and the push-off, the swing's knee) and over
// them (the arms, the twist, the lean, the head), and how they stand (the stance, the weight's shifts).
interface Style {
  stride: number;
  hips: number;
  bob: number;
  landF: number;
  offF: number;
  knee: number;
  arms: number;
  twist: number;
  lean: number;
  head: number;
  out: number;
  elbow: number;
  wide: number;
  shift: number;
}
const CALM: Style = {
  stride: 1,
  hips: 0,
  bob: 1,
  landF: 0,
  offF: 0,
  knee: 0,
  arms: 1,
  twist: 1,
  lean: 0,
  head: 0,
  out: 0,
  elbow: 0,
  wide: 0,
  shift: 1,
};
const STYLES: Record<string, Partial<Style>> = {
  // up on the toes, springing off them: the hips higher and bobbing, quick short steps, the arms
  // swinging loose and wide, the chest up
  bouncy: {
    stride: 0.88,
    hips: 0.01,
    bob: 3.4,
    landF: 0.16,
    offF: 0.22,
    knee: 0.25,
    arms: 1.6,
    twist: 1.5,
    lean: -0.04,
    head: -0.04,
    out: 0.03,
    elbow: -0.3,
    shift: 0.6,
  },
  // the weight dropped into each step: low, flat-footed, long steps, the shoulders rolling, arms out
  heavy: {
    stride: 1.05,
    hips: -0.025,
    bob: 2.2,
    landF: -0.1,
    offF: -0.15,
    knee: 0.05,
    arms: 0.8,
    twist: 1.6,
    lean: 0.1,
    head: 0.05,
    out: 0.12,
    elbow: -0.15,
    wide: 0.025,
    shift: 1.3,
  },
  // somewhere to be: long steps, the arms working bent, a little forward
  brisk: {
    stride: 1.06,
    hips: 0.004,
    landF: -0.05,
    offF: 0.08,
    knee: 0.08,
    arms: 1.5,
    twist: 1.1,
    lean: 0.04,
    elbow: -0.7,
    shift: 0.8,
  },
  // done in: the head down, the arms hanging, short flat steps, little push
  tired: {
    stride: 0.88,
    hips: -0.02,
    bob: 0.6,
    landF: 0.14,
    offF: -0.2,
    knee: 0.1,
    arms: 0.3,
    twist: 0.6,
    lean: 0.2,
    head: 0.28,
    elbow: 0.2,
    shift: 1.4,
  },
  // stooped, the knees soft, short careful steps landing flat, the arms hardly swinging
  old: {
    stride: 0.82,
    hips: -0.03,
    bob: 0.5,
    landF: 0.12,
    offF: -0.22,
    knee: 0.15,
    arms: 0.4,
    twist: 0.6,
    lean: 0.28,
    head: -0.06,
    out: 0.04,
    elbow: -0.25,
    wide: 0.025,
    shift: 1.6,
  },
};
const styleOf = (gait?: string): Style => ({ ...CALM, ...(STYLES[gait ?? ""] ?? {}) });
/** The walks there are (the editor offers the first three). */
export const GAIT_STYLES = ["calm", "bouncy", "heavy", "brisk", "tired", "old"] as const;
const walkGaits = new Map<string, Gait>();
/** The walk's gait in a style (its hips' turn the style's own: the legs reach from where it puts the
 *  hip joints). */
function walkGait(gait?: string): Gait {
  const k = gait && STYLES[gait] ? gait : "calm";
  let w = walkGaits.get(k);
  if (w) return w;
  if (k === "calm") w = WALK;
  else {
    const st = styleOf(k);
    w = {
      ...WALK,
      stride: (T) => WALK.stride(T) * st.stride,
      landF: WALK.landF + st.landF,
      offF: WALK.offF + st.offF,
      hips: (ph, T) => hipAt(0.649) + st.hips * K + 0.016 * K * st.bob * Math.cos(2 * TAU * (ph - 0.29)) - 0.03 * T,
      turn: (ph, T) => {
        const c = walk2Channels(ph, T, st);
        return [v(c, "hx"), v(c, "hy"), v(c, "hz") + walkDrop(ph, T)];
      },
      swing: WALK.swing.map((q) => (q.foot ? q : { ...q, k: q.k + st.knee })),
    };
  }
  walkGaits.set(k, w);
  return w;
}
/** Tiles a walk cycle covers (two steps), by the mood: shorter in the dark. (At 1.5 m/s: 1.6 a
 *  second, a real walk's for her legs — at 2.2 it couldn't be one: they'd no reach.) */
export const walk2Stride = (tension = 0, gait?: string) => walkGait(gait).stride(clamp01(tension));

function walk2Channels(phase: number, T: number, st: Style = CALM): Ch {
  const c = sample(WALK2, phase, true);
  // the arms a beat behind the legs (they're carried, not driven)
  const arms = sample(WALK2, phase - 0.03, true);
  for (const S of ["L", "R"]) {
    c[`t${S}`] = v(c, `t${S}`) * (1 - 0.22 * T);
    c[`k${S}`] = v(c, `k${S}`) + 0.2 * T;
    c[`t${S}`] -= 0.1 * T;
    c[`s${S}`] = v(arms, `s${S}`) * (1 - 0.5 * T) - 0.12 * T;
    c[`e${S}`] = v(arms, `e${S}`) - 0.35 * T;
    c[`o${S}`] = 0.11 + 0.03 * T;
    c[`w${S}`] = 0.1;
  }
  c.hy = v(c, "hy") * (1 - 0.3 * T);
  c.sx = 0.03 + 0.2 * T;
  c.hx = 0.02 + 0.1 * T;
  c.nx = 0.08 * T;
  // (4e: the style's arms, twist, lean and head)
  if (st !== CALM) {
    for (const S of ["L", "R"]) {
      c[`s${S}`] = v(c, `s${S}`) * st.arms;
      c[`e${S}`] = v(c, `e${S}`) + st.elbow;
      c[`o${S}`] = v(c, `o${S}`) + st.out;
    }
    c.hy = v(c, "hy") * st.twist;
    c.sx = v(c, "sx") + st.lean;
    c.dx = v(c, "dx") + st.head;
  }
  return leanAtHips(c);
}

// ── the walk from its feet (plan 58 phase 4a): a heel strike, down off the heel onto the flat foot,
// over it, up onto the toes and off; one foot always down (58% of the cycle each, both a little at
// each change). The hips go over the planted foot like a pendulum — highest over it, lowest as the
// weight changes feet (a run's the other way) — and the hip over the swinging leg drops a little,
// the chest back over it.
/** The walk's hip over the swinging leg dropping at mid-stance (the right foot's at 0.29). */
const walkDrop = (ph: number, T: number) => -(0.05 + 0.02 * T) * Math.cos(TAU * (ph - 0.29));
const WALK: Gait = {
  stride: (T) => 0.94 * K * (1 - 0.15 * T),
  on: 0.58,
  landX: 0.25 * K,
  landF: -0.3,
  fMid: 0,
  offF: 0.55,
  heel: 0.17,
  rollAt: 0.6,
  // (the pendulum: up 1.6 cm over the planted foot, down as much as the feet change; lower in the dark)
  hips: (ph, T) => hipAt(0.649) + 0.016 * K * Math.cos(2 * TAU * (ph - 0.29)) - 0.03 * T,
  turn: (ph, T) => {
    const c = walk2Channels(ph, T);
    return [v(c, "hx"), v(c, "hy"), v(c, "hz") + walkDrop(ph, T)];
  },
  swing: [
    // the knee bending as the toes leave, the thigh coming through
    { at: 0.68, t: 0.14, k: 0.85, f: 0.45 },
    // passing under the hips, the foot clear of the ground
    { at: 0.8, t: -0.25, k: 0.85, f: 0.15 },
    // the shin swinging out, the toes coming up for the heel to strike: the heel 2 cm clear, just
    // short of where it lands
    { at: 0.92, t: 0, k: 0, f: -0.22, foot: { x: 0.23 * K, a: 0.098 } },
  ],
  letGo: 0.15,
  bend: 0.35,
};

/** 4d: how she walks — winded (`puff` 0…1, from Locomotion's breath: `breath` its place), hurt
 *  (`hurt` 0…1: a limp on the right leg). */
export interface Walking {
  puff?: number;
  breath?: number;
  hurt?: number;
  /** 4e: the style (`GAIT_STYLES`; else calm) */
  gait?: string;
}
// the hurt leg's walk (the right): on it a shorter while — off it quick — the knee kept stiff
// through the swing, swung from the hip hiked up instead
const HURT_LEG: Gait = {
  ...WALK,
  on: 0.47,
  offF: 0.3,
  rollAt: 0.55,
  // (the knee kept straighter: swung through clear of the floor by the hip hiked over it; keyed as
  // the walk's are, joints then the foot, so the two blend key by key)
  swing: [
    { at: 0.62, t: 0.12, k: 0.75, f: 0.15 },
    { at: 0.76, t: -0.22, k: 0.6, f: -0.05 },
    { at: 0.9, t: 0, k: 0, f: -0.15, foot: { x: 0.21 * K, a: 0.098 } },
  ],
};
/** The hurt leg's hip hiked to swing it through (its swing: 0.47 to 1). */
const hurtHike = (ph: number, h: number) =>
  -0.13 * h * (0.5 - 0.5 * Math.cos(TAU * clamp01(((((ph % 1) + 1) % 1) - 0.47) / 0.53)));
/** The walk at `phase` (0..1, by the ground covered) in a mood; `way` turned aside (rad, + to the
 *  left), winded or hurt. */
export function walk2Pose(phase: number, tension = 0, way = 0, life: Walking = {}): Moved {
  const T = clamp01(tension);
  const puff = clamp01(life.puff ?? 0);
  const h = clamp01(life.hurt ?? 0);
  const G = walkGait(life.gait);
  const c = walk2Channels(phase, T, styleOf(life.gait));
  const drop = walkDrop(phase, T);
  c.hz = v(c, "hz") + drop;
  c.sz = v(c, "sz") - 0.6 * drop;
  c.up = G.hips(phase, T) - HIP_H;
  // winded (4d): bent over, the head down, the arms hanging and hardly swinging, the chest heaving
  if (puff > 0) {
    const br = Math.sin(TAU * (life.breath ?? 0));
    c.sx = v(c, "sx") + 0.22 * puff;
    c.dx = v(c, "dx") + 0.12 * puff;
    c.cx = v(c, "cx") - 0.035 * (1 + 2 * puff) * br;
    for (const S of ["L", "R"]) {
      c[`s${S}`] = v(c, `s${S}`) * (1 - 0.6 * puff) + 0.05 * puff;
      c[`e${S}`] = v(c, `e${S}`) * (1 - 0.5 * puff);
    }
  }
  // hurt (4d): the weight off the right leg as soon as it can — the trunk lurching over it while it's
  // down, its hip hiked to swing it through; the right arm held in against the side
  if (h > 0) {
    const onR = 0.5 - 0.5 * Math.cos(TAU * clamp01(phase / 0.47));
    c.sz = v(c, "sz") - 0.14 * h * onR;
    c.hz = v(c, "hz") + hurtHike(phase, h);
    c.dz = v(c, "dz") + 0.06 * h * onR;
    c.sx = v(c, "sx") + 0.08 * h;
    const held = smoother(clamp01((h - 0.3) / 0.4));
    c.sR = lerp(v(c, "sR"), -0.3, held);
    c.eR = lerp(v(c, "eR"), -1.7, held);
    c.oR = lerp(v(c, "oR"), 0.02, held);
    c.wR = lerp(v(c, "wR"), 0.3, held);
  }
  const m = upright(body(steady(c)));
  wayTurn(m, way);
  // (the hips' hike in the gait's own turn: the legs reach from where it puts the hip joints)
  const turn: Gait["turn"] = (ph, T2, e) => {
    const t = G.turn(ph, T2, e);
    return [t[0], t[1], t[2] + hurtHike(ph, h)];
  };
  const bad = h > 0 ? lerpGait(G, { ...G, ...HURT_LEG, hips: G.hips, stride: G.stride }, h, turn) : G;
  gaitPlant(bad, m, phase, T, 0, 1, { way, L: h > 0 ? { ...G, turn } : G, offL: 0.5 - 0.05 * h });
  return m;
}

// ── the run (KH: up on the balls of the feet, the knee driven high, the heel to the seat, the
// arms pumping bent from the shoulder, the chest proud and leaning into the speed; the arms and
// the head a beat behind). Effort 0 a jog, 1 a sprint; in the dark tighter and lower.
const RUN2: Key[] = cycle([
  // contact: the right foot down under the knee, not out ahead; the left folding up behind
  {
    at: 0,
    c: { tR: -0.5, kR: 0.34, fR: -0.04, tL: 0.55, kL: 1.55, fL: 1.2, sR: 0.85, eR: -1.25, sL: -1.1, eL: -1.6 },
  },
  // down: the knee takes it, the left heel up under the seat
  {
    at: 0.08,
    c: { tR: -0.22, kR: 0.82, fR: 0.04, tL: 0.04, kL: 2.25, fL: 1.3, sR: 0.42, eR: -1.35, sL: -0.6, eL: -1.5 },
  },
  // passing: the left knee coming through, high
  {
    at: 0.19,
    c: { tR: 0.16, kR: 0.48, fR: 0.22, tL: -0.88, kL: 2.2, fL: 0.7, sR: -0.05, eR: -1.55, sL: 0.05, eL: -1.5 },
  },
  // push: off the right toes, the left knee driven to the hip's height
  {
    at: 0.3,
    c: { tR: 0.64, kR: 0.12, fR: 1.05, tL: -1.28, kL: 1.55, fL: 0.25, sR: -1.1, eR: -1.6, sL: 0.85, eL: -1.2 },
  },
  // flight: both off the ground, the left shin swinging out to land under the knee
  {
    at: 0.41,
    c: { tR: 0.7, kR: 0.98, fR: 1.05, tL: -1.0, kL: 0.6, fL: 0.02, sR: -1.1, eR: -1.55, sL: 0.85, eL: -1.25 },
  },
]);
const RUN2_TRUNK: Key[] = cycle([
  // (calm: at a sprint's three and a half strides a second a big bob or roll reads as shaking)
  { at: 0, c: { hy: 0.12, sy: -0.2, hz: 0.012, air: 0, dx: 0.01 } },
  { at: 0.08, c: { hy: 0.07, sy: -0.12, hz: 0.028, air: 0, dx: 0.02 } },
  { at: 0.19, c: { hy: 0, sy: 0, hz: 0.015, air: 0, dx: 0.01 } },
  { at: 0.3, c: { hy: -0.08, sy: 0.13, hz: 0, air: 0.03, dx: -0.01 } },
  { at: 0.41, c: { hy: -0.12, sy: 0.2, hz: -0.008, air: 0.06, dx: -0.015 } },
]);

function run2Channels(phase: number, e: number, T: number): Ch {
  const c = { ...sample(RUN2, phase, true), ...sample(RUN2_TRUNK, phase, true) };
  // the arms and the head a beat behind the legs
  const late = sample(RUN2, phase - 0.035, true);
  const lateHead = sample(RUN2_TRUNK, phase - 0.06, true);
  const leg = 0.72 + 0.5 * e;
  const fold = 0.8 + 0.32 * e;
  // (the jog's arms easier: swinging from the shoulder, less far forward, so the hands ride low by
  // the waist — the elbows still bent near a right angle: opened to lower the hands, they hung
  // straight, a toy soldier's)
  const arm = (0.5 + 0.7 * e) * (1 - 0.3 * T);
  const armAt = lerp(0.16, -0.06, e);
  const elbow = lerp(0.95, 1, e);
  for (const S of ["L", "R"]) {
    c[`t${S}`] = -0.1 + (v(c, `t${S}`) + 0.1) * leg * (1 - 0.12 * T);
    const k = v(c, `k${S}`);
    c[`k${S}`] = (k > 0.9 ? 0.9 + (k - 0.9) * fold : k) + 0.06 * T;
    c[`s${S}`] = armAt + (v(late, `s${S}`) + 0.06) * arm;
    c[`e${S}`] = v(late, `e${S}`) * elbow - 0.15 * T;
    // the hands swing a little across the body going forward, out going back
    c[`o${S}`] = lerp(0.15, 0.22, e) + 0.06 * v(late, `s${S}`) - 0.03 * T;
    c[`w${S}`] = 0.2;
  }
  // (the hands loose at a jog, closing to fists at a sprint)
  c.hL = 0.35 + 0.65 * e;
  c.hR = 0.35 + 0.65 * e;
  // the pelvis turning with the leg going forward, the chest against it (the waist's skinned now: it
  // shows no seam — a jog's twist is as big as a sprint's, the trunk working with every step)
  c.hy = v(c, "hy") * (1 + 0.2 * e);
  c.sy = v(c, "sy") * (1 - 0.1 * e);
  // leaning into it: more the harder; the head up and looking ahead, nodding late
  // (a sprint leant ~24°, not 40: bent that far over she ran with her legs streaming out behind her —
  // a sprinter at speed is near upright; KH's a touch more)
  c.sx = 0.22 + 0.1 * e + 0.08 * T;
  c.hx = 0.07 + 0.06 * e;
  c.dx = v(lateHead, "dx") - 0.04 * e;
  c.air = v(c, "air") * (0.55 + 0.9 * e) * (1 - 0.4 * T);
  return leanAtHips(c);
}

// ── the jog's trunk (2026-10-30: "only the legs and the arms move"): with each step the hip over the
// swinging leg drops at mid-stance and the chest leans back over it; the back gives a little as the
// foot takes the weight and straightens in the air — on the jog's steps (the right foot down at 0,
// mid-stance 0.1; the left half a cycle on). The head's held level against it (`steady`).
/** The jog's trunk at `phase`, laid over the run's channels by `w`: the hips' roll and the back's give. */
function jogTrunk(phase: number, T: number): { hz: number; give: number } {
  const step = 2 * TAU * (phase - JOG_ON / 2);
  return {
    // (the left hip down at the right foot's mid-stance: the hips rolled, its side — +x — lower)
    hz: -(0.06 + 0.02 * T) * Math.sin(TAU * (phase + 0.15)),
    give: 0.05 * Math.cos(step),
  };
}

/** The run at `phase` (0..1, distance-driven): `effort` 0 a jog … 1 a sprint, in a mood; `legs` the
 *  legs' own effort (the speed's), if the rest's pumped harder. */
export function run2Pose(phase: number, effort = 0.5, tension = 0, legs = effort, way = 0): Moved {
  const e = clamp01(effort);
  const T = clamp01(tension);
  const l = clamp01(legs);
  const c = run2Channels(phase, e, T);
  // the legs from the feet at any speed: a gait between the jog's and the sprint's by the legs' own
  // effort (the speed's: driving up to it pumps the arms and leans in, it doesn't change the legs)
  const jog = 1 - l;
  const g = lerpGait(JOG, SPRINT, l, (ph, T2, e2) => jogHipsTurn(ph, e2, T2, jog));
  c.up = g.hips(phase, T) - HIP_H;
  c.air = 0;
  // the trunk working with the steps: the hips' drop, the chest back over it, the back's give (the
  // jog's most: the sprint's driven, held)
  const tr = jogTrunk(phase, T);
  c.hz = v(c, "hz") + tr.hz * jog;
  c.sz = v(c, "sz") - 0.7 * tr.hz * jog;
  c.sx = v(c, "sx") + 0.6 * tr.give * jog;
  c.cx = v(c, "cx") + 0.4 * tr.give * jog;
  const m = upright(body(steady(c)));
  wayTurn(m, way);
  gaitPlant(g, m, phase, T, e, 1, { way });
  return m;
}

// ── the jog (2026-10-30: the run without Shift). The foot on the ground keyed by where it is: it
// stays where it landed, on the ground (keyed legs under a calmed lift floated 7 cm and slid 9 cm a
// step — a shiver), the leg solved to reach it. The swing keyed by the joints, on a real jog's
// curves: the thigh 35–40° forward at most, the knee folding to ~105° as it passes under, the heel
// flicked up behind (a first try keyed by the foot's path read as a high-knee march in a crouch:
// 69° and 126°, the hips 5 cm down). A light KH bound: a step 40% on the ground and 60% in the air,
// the hips up near standing — a centimetre's give on the foot, as much rise in the air.
/** Tiles a jog cycle covers (two steps), and the sprint's: the cadence calmer than the sprint's. */
const JOG_STRIDE = 2.0 * K;
/** The run's stride by its effort (0 the jog … 1 a sprint). */
export const run2Stride = (effort: number) => lerp(JOG_STRIDE, SPRINT_STRIDE, clamp01(effort));
/** The cycle's share one foot's on the ground: from landing (0) to its toes leaving. */
const JOG_ON = 0.2;
/** Landing: the ankle this far ahead of the hip (under the knee, not out in front). */
const JOG_LAND_X = 0.15 * K;
/** The foot's tilt as its toes leave the ground. */
const JOG_OFF_F = 0.4;
/** The jog's hips over the ground (to the hip joints): lowest as a foot takes it, highest in the
 *  air between — 2.6 cm (cut to 1 once, blamed for a shake that was the feet's snaps: with it the
 *  trunk rode the legs dead level); lower in the dark. */
const jogHips = (ph: number, T: number) => hipAt(0.645) - 0.013 * K * Math.cos(2 * TAU * (ph - JOG_ON / 2)) - 0.03 * T;
/** A leg's thigh and knee (world pitch, + back) reaching an ankle `x` ahead of the hip, `d` below. */
function reachLeg(x: number, d: number): { t: number; k: number } {
  // (a leg near straight eases into it, not stopped dead at the limit: a hard stop kinked the knee)
  const L = THIGH + SHIN;
  const r0 = Math.hypot(x, d);
  // (from 99.2%, to its whole length: a walking leg's near straight over its foot, a standing one
  // straight)
  const r = r0 < 0.992 * L ? r0 : 0.992 * L + 0.008 * L * Math.tanh((r0 - 0.992 * L) / (0.008 * L));
  const k = 2 * Math.acos(r / (THIGH + SHIN));
  return { t: Math.atan2(-x, d) - k / 2, k };
}
interface JogLeg {
  t: number;
  k: number;
  f: number;
}
// ── the pelvis's own turn under the legs: the hips twist and roll with each step, and a thigh hangs
// from them — so a planted leg is turned back against them (its world way kept), and its foot
// reached from where the twist has put its hip joint. Quaternions here, small, as three's (x, y, z,
// w; Euler XYZ) — the chunk keeps off three.
type Quat = [number, number, number, number];
function quat(x: number, y: number, z: number): Quat {
  const [c1, c2, c3] = [Math.cos(x / 2), Math.cos(y / 2), Math.cos(z / 2)];
  const [s1, s2, s3] = [Math.sin(x / 2), Math.sin(y / 2), Math.sin(z / 2)];
  return [
    s1 * c2 * c3 + c1 * s2 * s3,
    c1 * s2 * c3 - s1 * c2 * s3,
    c1 * c2 * s3 + s1 * s2 * c3,
    c1 * c2 * c3 - s1 * s2 * s3,
  ];
}
const qmul = (a: Quat, b: Quat): Quat => [
  a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
  a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
  a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
  a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
];
const qinv = (a: Quat): Quat => [-a[0], -a[1], -a[2], a[3]];
function euler(q: Quat): Euler3 {
  const [x, y, z, w] = q;
  const m13 = 2 * (x * z + w * y);
  const m23 = 2 * (y * z - w * x);
  const m33 = 1 - 2 * (x * x + y * y);
  const m12 = 2 * (x * y - w * z);
  const m11 = 1 - 2 * (y * y + z * z);
  return [Math.atan2(-m23, m33), Math.asin(Math.max(-1, Math.min(1, m13))), Math.atan2(-m12, m11)];
}
function turn(q: Quat, v: [number, number, number]): [number, number, number] {
  const [x, y, z, w] = q;
  const ix = w * v[0] + y * v[2] - z * v[1];
  const iy = w * v[1] + z * v[0] - x * v[2];
  const iz = w * v[2] + x * v[1] - y * v[0];
  const iw = -x * v[0] - y * v[1] - z * v[2];
  return [
    ix * w + iw * -x + iy * -z - iz * -y,
    iy * w + iw * -y + iz * -x - ix * -z,
    iz * w + iw * -z + ix * -y - iy * -x,
  ];
}
// (where a hip joint sits off the hips' own, a grown-up's: across, and up)
const HIP_X = 0.078;
const HIP_UP = 0.061;
/** How far the hips' turn `h` has moved a hip joint (side 1 left): ahead (+z), up. */
function hipShift(h: Euler3, side: number): { ahead: number; up: number } {
  const p = turn(quat(h[0], h[1], h[2]), [side * HIP_X, HIP_UP, 0]);
  return { ahead: p[2], up: p[1] - HIP_UP };
}
/** The jog's hips' turn at `phase`, as run2Channels makes it at effort `e` (their twist and roll,
 *  their pitch with the lean taken at them). */
function jogHipsTurn(phase: number, e: number, T: number, w = 1): Euler3 {
  const k = sample(RUN2_TRUNK, phase, true);
  const sx = 0.22 + 0.1 * e + 0.08 * T;
  return [0.07 + 0.06 * e + sx * LEAN.hips, v(k, "hy") * (1 + 0.2 * e), v(k, "hz") + jogTrunk(phase, T).hz * w];
}
// ── a gait from its feet (plan 58 phase 4a: the jog's way, for the walk too): the foot on the ground
// keyed by where it is — landing (on its heel, if the gait strikes with it), flat, up onto its toes —
// the leg solved to reach it from where the hips' turn has put the hip joint; the leg in the air
// keyed by its joints, joined to the ground's by where, how fast and how that's changing.
interface Gait {
  /** tiles a cycle covers (two steps), by the mood */
  stride: (T: number) => number;
  /** the share of the cycle one foot's on the ground, landing (0) to its toes leaving */
  on: number;
  /** landing: the ankle this far ahead of the hip */
  landX: number;
  /** the foot's tilt landing (toes down +: a heel strike's −; a sprinter's on the ball, +), settled
   *  at mid-stance, and leaving */
  landF: number;
  fMid: number;
  offF: number;
  /** the share of the stance settling from the landing's tilt, and where up onto the toes begins */
  heel: number;
  rollAt: number;
  /** the hips (to the hip joints) over the ground at a leg's phase */
  hips: (ph: number, T: number) => number;
  /** the hips' turn at the body's phase (`e` the effort) */
  turn: (ph: number, T: number, e: number) => Euler3;
  /** the leg in the air (world pitch: thigh + back, knee, foot toes down); or where its foot's to be
   *  (`foot`: its ankle `x` ahead of the hip, `a` off the ground — solved from wherever the hips are:
   *  the dark lowers them, and a key by the joints put the landing heel through the floor) */
  swing: (JogLeg & { at: number; foot?: { x: number; a: number } })[];
  /** the share of the cycle the toes take to straighten after leaving */
  letGo: number;
  /** the swinging knee folded more in the dark, by this at its fullest (the hips are lower there:
   *  the same swing dragged the foot through the floor) */
  bend: number;
  /** 1 forward (the foot on the ground goes back under the hips), −1 backing up (it comes forward:
   *  `landX` is then behind) */
  dir?: number;
}
/** The foot's tilt on the ground at `p` (0..on): down off the heel, flat, up onto the toes. */
function gaitTilt(g: Gait, p: number): number {
  const heel = g.heel * g.on;
  if (heel > 0 && p < heel) return lerp(g.landF, g.fMid, smoother(p / heel));
  // (up onto the toes faster and faster to the end: the heel's rise bends the knee into the swing —
  // eased out, the knee went on straightening past the toes leaving, near locked, then had to fold)
  // (a cube: eased in even of its change — a square started with a jolt, at a sprint's pace a pop)
  const u = clamp01((p / g.on - g.rollAt) / (1 - g.rollAt));
  return g.fMid + (g.offF - g.fMid) * u * u * u;
}
/** A gait between two (the swing's keys key by key): the run between the jog and the sprint — planted
 *  at any speed, as each is (blending two poses each planted by its own stride slid the feet). */
function lerpGait(a: Gait, b: Gait, u: number, turn: Gait["turn"]): Gait {
  const l = (x: number, y: number) => x + (y - x) * u;
  return {
    stride: (T) => l(a.stride(T), b.stride(T)),
    on: l(a.on, b.on),
    landX: l(a.landX, b.landX),
    landF: l(a.landF, b.landF),
    fMid: l(a.fMid, b.fMid),
    offF: l(a.offF, b.offF),
    heel: l(a.heel, b.heel),
    rollAt: l(a.rollAt, b.rollAt),
    hips: (ph, T) => l(a.hips(ph, T), b.hips(ph, T)),
    turn,
    swing: a.swing.map((k, i) => {
      const q = b.swing[i];
      const foot = k.foot && q.foot ? { x: l(k.foot.x, q.foot.x), a: l(k.foot.a, q.foot.a) } : undefined;
      return { at: l(k.at, q.at), t: l(k.t, q.t), k: l(k.k, q.k), f: l(k.f, q.f), foot };
    }),
    letGo: l(a.letGo, b.letGo),
    bend: l(a.bend, b.bend),
    dir: a.dir,
  };
}
/** The leg on the ground at `p` (0..on): its foot going back under the hips as fast as the ground
 *  goes by, rocking off the heel and onto the ball (the ankle round them); reached from where its hip
 *  joint is (`side`: the pelvis's turn moves it; `body` its phase). */
function gaitPlanted(g: Gait, p: number, T: number, side: number, body: number, e: number): JogLeg {
  const f = gaitTilt(g, p);
  // (rocking round the heel or the ball, which stays put: the ankle above it swings with the tilt)
  const dir = g.dir ?? 1;
  const x = dir * (g.landX - g.stride(T) * p) + ANKLE * Math.sin(f) + (f < 0 ? -HEEL : BALL) * (1 - Math.cos(f));
  const a = f < 0 ? ANKLE * Math.cos(f) - HEEL * Math.sin(f) : ANKLE * Math.cos(f) + BALL * Math.sin(f);
  const hip = hipShift(g.turn(body, T, e), side);
  // (the hips' height the body's, at its phase: a limp's legs aren't half a cycle apart)
  return { ...reachLeg(x - hip.ahead, g.hips(body, T) + hip.up - a), f };
}
/** One leg at its own phase `ph` (0 landing; `off` from the body's), in the world's pitch. */
function gaitLeg(g: Gait, ph: number, off: number, T: number, side: number, e: number): JogLeg {
  const p = ((ph % 1) + 1) % 1;
  // (the foot's own phase round the loop: landing is at 1 as at 0; the hips' turn at the body's)
  const planted = (q: number) => gaitPlanted(g, q >= 1 ? q - 1 : q, T, side, q - off, e);
  if (p < g.on) return planted(p);
  // the ends the ground's: leaving it and landing on it as it moves — where it is, how fast and how
  // that's changing (a join that kept only the speed hitched at each step: the bench's pops)
  const d = 1e-3;
  const [l0, l1, l2] = [planted(g.on - 2 * d), planted(g.on - d), planted(g.on)];
  const [g0, g1, g2] = [planted(1), planted(1 + d), planted(1 + 2 * d)];
  const swing = g.swing.map((q) => {
    if (!q.foot) return { at: q.at, t: q.t, k: q.k + g.bend * T, f: q.f };
    const hip = hipShift(g.turn(q.at - off, T, e), side);
    return { at: q.at, f: q.f, ...reachLeg(q.foot.x - hip.ahead, g.hips(q.at - off, T) + hip.up - q.foot.a) };
  });
  const K = [{ at: g.on, ...l2 }, ...swing, { at: 1, ...g0 }];
  const CH = ["t", "k", "f"] as const;
  const of = (fn: (c: (typeof CH)[number]) => number): JogLeg => ({ t: fn("t"), k: fn("k"), f: fn("f") });
  // (each key's speed: the ends' as on the ground, else through its neighbours)
  const vel = (n: number): JogLeg => {
    if (n === 0) return of((c) => (l2[c] - l1[c]) / d);
    if (n === K.length - 1) return of((c) => (g1[c] - g0[c]) / d);
    const w = K[n + 1].at - K[n - 1].at;
    return of((c) => (K[n + 1][c] - K[n - 1][c]) / w);
  };
  // (…and its speed's change: the ends' as on the ground, else from the speeds round it)
  const acc = (n: number): JogLeg => {
    if (n === 0) return of((c) => (l2[c] - 2 * l1[c] + l0[c]) / (d * d));
    if (n === K.length - 1) return of((c) => (g2[c] - 2 * g1[c] + g0[c]) / (d * d));
    const a = vel(n - 1);
    const b = vel(n + 1);
    const w = K[n + 1].at - K[n - 1].at;
    return of((c) => (b[c] - a[c]) / w);
  };
  let i = 0;
  while (i < K.length - 2 && p >= K[i + 1].at) i++;
  const k0 = K[i];
  const k1 = K[i + 1];
  const dt = k1.at - k0.at;
  const v0 = vel(i);
  const v1 = vel(i + 1);
  const a0 = acc(i);
  const a1 = acc(i + 1);
  const u = (p - k0.at) / dt;
  const u2 = u * u;
  const u3 = u2 * u;
  const u4 = u3 * u;
  const u5 = u4 * u;
  // (quintic Hermite: where, how fast and its change, at both ends)
  const h = (c: (typeof CH)[number]) =>
    (1 - 10 * u3 + 15 * u4 - 6 * u5) * k0[c] +
    (u - 6 * u3 + 8 * u4 - 3 * u5) * dt * v0[c] +
    (0.5 * u2 - 1.5 * u3 + 1.5 * u4 - 0.5 * u5) * dt * dt * a0[c] +
    (0.5 * u3 - u4 + 0.5 * u5) * dt * dt * a1[c] +
    (-4 * u3 + 7 * u4 - 3 * u5) * dt * v1[c] +
    (10 * u3 - 15 * u4 + 6 * u5) * k1[c];
  return of(h);
}
/** The toes just after the foot leaves the ground: from flat (bent up as far as the foot's tipped)
 *  back to straight — going on at first as they were bending, how fast and how that was changing
 *  (a quintic: nothing kinks). */
function gaitToeLetGo(g: Gait, q: number): number {
  // (left heel last, toes up — backing up — they're straight already)
  if (g.offF <= 0) return 0;
  const d = g.letGo;
  const u = clamp01((q - g.on) / d);
  // (the push-off's tilt: fMid + (offF − fMid)·w³, w over the stance's roll — its speed and its change
  // as it leaves)
  const span = (1 - g.rollAt) * g.on;
  const v0 = (-3 * (g.offF - g.fMid)) / span;
  const a0 = (-6 * (g.offF - g.fMid)) / (span * span);
  const [u2, u3, u4, u5] = [u * u, u ** 3, u ** 4, u ** 5];
  return (
    (1 - 10 * u3 + 15 * u4 - 6 * u5) * -g.offF +
    (u - 6 * u3 + 8 * u4 - 3 * u5) * d * v0 +
    (0.5 * u2 - 1.5 * u3 + 1.5 * u4 - 0.5 * u5) * d * d * a0
  );
}
// the jog's leg in the air
const JOG_SWING: (JogLeg & { at: number })[] = [
  // the heel flicked up behind
  { at: 0.34, t: 0.26, k: 1.25, f: 0.75 },
  // folded as it passes under the hips
  { at: 0.48, t: -0.12, k: 1.85, f: 0.6 },
  // the knee through, ahead
  { at: 0.64, t: -0.62, k: 1.5, f: 0.3 },
  // the shin swinging out to land under the knee
  { at: 0.82, t: -0.66, k: 0.8, f: 0.05 },
];
const JOG: Gait = {
  stride: () => JOG_STRIDE,
  on: JOG_ON,
  landX: JOG_LAND_X,
  landF: 0,
  fMid: 0,
  offF: JOG_OFF_F,
  heel: 0,
  rollAt: 0.4,
  hips: (ph, T) => jogHips(ph, T),
  turn: (ph, T, e) => jogHipsTurn(ph, e, T),
  swing: JOG_SWING,
  letGo: 0.2,
  bend: 0.25,
};
// ── the sprint from its feet (plan 58 phase 4b): landing on the ball under the hip, never the heel,
// settling a little and driving off the toes; 30% of each step on the ground, the rest in the air;
// the heel kicked up to the seat, the knee driven high, the foot clawing back to land. The hips
// lowest as the foot takes them, a bigger bound than the jog's.
const SPRINT_STRIDE = 2.7 * K;
const SPRINT: Gait = {
  stride: () => SPRINT_STRIDE,
  on: 0.15,
  landX: 0.17 * K,
  landF: 0.25,
  fMid: 0.12,
  offF: 0.6,
  heel: 0.4,
  rollAt: 0.55,
  // (the hips a centimetre higher: the knee on the ground bent to 54° — a sprinter's ~45°)
  hips: (ph, T) => hipAt(0.658) - 0.02 * K * Math.cos(2 * TAU * (ph - 0.075)) - 0.03 * T,
  turn: (ph, T, e) => jogHipsTurn(ph, e, T, 0),
  swing: [
    // the heel kicked up behind (not the leg flung out there: 29° back, a sprinter's 10–20°)
    { at: 0.28, t: 0.3, k: 1.6, f: 0.85 },
    // to the seat as it passes under
    { at: 0.42, t: -0.1, k: 2.3, f: 0.75 },
    // the knee driven high (~70°)
    { at: 0.6, t: -1.2, k: 1.95, f: 0.4 },
    // the shin out, the foot clawing back to land under the hip
    { at: 0.8, t: -0.9, k: 0.85, f: 0.3 },
  ],
  letGo: 0.15,
  bend: 0.25,
};
// ── looking at people (plan 58 phase 3e): someone near and in front — the nearer, the more in front,
// and whoever's moving, first — held a little while, then a look away before the next; never anyone
// out of sight (the world's sight ray, `sees`). The gaze takes the target (eyes, then the head).
/** Someone (or something) that could be looked at: where (the floor's x, y; z up), and how fast. */
export interface Seen {
  id: string;
  x: number;
  y: number;
  z: number;
  speed: number;
}
export class LookAt {
  private on: string | null = null;
  private held = 0;
  private hold = 0;
  private rest = 0;
  private hidden = 0;
  private n = 0;
  constructor(private seed = 0) {}
  /** This frame's look (yaw + to the left of the facing, pitch up), or none: `me` at (x, y) facing
   *  `yaw` (atan2 on the floor), its eyes `eye` up; `sees(a, b)` the world's line of sight. */
  update(
    dt: number,
    me: { x: number; y: number; yaw: number; eye: number },
    others: Seen[],
    sees: (o: Seen) => boolean,
  ): { yaw: number; pitch: number } | null {
    const rel = (o: Seen) => {
      const yaw = Math.atan2(o.y - me.y, o.x - me.x) - me.yaw;
      const r = -Math.atan2(Math.sin(yaw), Math.cos(yaw));
      const d = Math.hypot(o.x - me.x, o.y - me.y);
      return { yaw: r, pitch: Math.atan2(o.z - me.eye, Math.max(0.3, d)), d };
    };
    const ok = (o: Seen) => {
      const r = rel(o);
      return r.d < 7 && r.d > 0.4 && Math.abs(r.yaw) < 1.9;
    };
    let cur = this.on ? others.find((o) => o.id === this.on) : undefined;
    if (cur) {
      this.held += dt;
      // (out of sight a moment, or gone round behind, or looked at long enough: away)
      this.hidden = sees(cur) ? 0 : this.hidden + dt;
      if (!ok(cur) || this.hidden > 0.2 || this.held > this.hold) {
        this.on = null;
        cur = undefined;
        this.rest = 1.5 + 3 * hash(++this.n, this.seed);
      }
    } else this.on = null;
    if (!cur) {
      this.rest -= dt;
      if (this.rest > 0) return null;
      let best: Seen | undefined;
      let score = 0;
      for (const o of others) {
        if (!ok(o)) continue;
        const r = rel(o);
        const s = ((Math.cos(r.yaw) * 0.5 + 0.6) * (1 + Math.min(1.5, o.speed))) / (1 + r.d);
        if (s > score && sees(o)) {
          score = s;
          best = o;
        }
      }
      if (!best) {
        this.rest = 0.5;
        return null;
      }
      cur = best;
      this.on = best.id;
      this.held = 0;
      this.hidden = 0;
      this.hold = 1.2 + 2.8 * hash(++this.n + 50, this.seed);
    }
    const r = rel(cur);
    return { yaw: r.yaw, pitch: r.pitch };
  }
}

// ── the foot lock (plan 58 phase 2e): the last layer. A foot the pose has on the ground stays where it
// landed — held in the ground's frame, carried back as the body goes on and turns — and its leg is
// solved again, through the hips' real turn, to reach it; the pose's height kept (a heel, a roll onto
// the toes). It lets go as the pose lifts the foot, eased out. Whatever the layers above did (the
// trunk's lean springs on the hips, a start's short strides, an arc, a wander), a planted foot can't
// slide: the bench found them sliding up to 7 m/s, the keys' own feet planted.
type V3 = [number, number, number];
const add3 = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub3 = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const len3 = (a: V3) => Math.hypot(a[0], a[1], a[2]);
/** The turn taking unit `a` onto unit `b`. */
function between(a: V3, b: V3): Quat {
  const d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  if (d < -0.999999) return [1, 0, 0, 0];
  const c: V3 = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const q: Quat = [c[0], c[1], c[2], 1 + d];
  const n = Math.hypot(...q);
  return [q[0] / n, q[1] / n, q[2] / n, q[3] / n];
}
// (the hips' joint at rest, over the ground: the hip joints are HIP_UP above it)
const HIPS_Y = HIP_H - HIP_UP;
/** Where a posed leg's ankle is (the model's space: x its left, y up, z ahead; the ground at 0). */
export function ankleOf(m: Moved, S: "L" | "R"): { at: V3; hip: V3; hq: Quat } {
  const p = m.pose;
  const hq = quat(...((p.hips ?? [0, 0, 0]) as Euler3));
  const side = S === "L" ? 1 : -1;
  const hip = add3([m.lift[0], HIPS_Y + m.lift[1], m.lift[2]], turn(hq, [side * HIP_X, HIP_UP, 0]));
  const tq = qmul(hq, quat(...((p[`thigh${S}`] ?? [0, 0, 0]) as Euler3)));
  const knee = add3(hip, turn(tq, [0, -THIGH, 0]));
  const sq = qmul(tq, quat(...((p[`knee${S}`] ?? [0, 0, 0]) as Euler3)));
  return { at: add3(knee, turn(sq, [0, -SHIN, 0])), hip, hq };
}
/** Where `S`'s foot is (the model's space): the ankle, and the two spots it stands on — the heel's
 *  and the ball's, on the ground at rest. */
export interface Foot {
  ankle: V3;
  heel: V3;
  ball: V3;
}
export function footOf(m: Moved, S: "L" | "R"): Foot {
  const p = m.pose;
  const { at, hq } = ankleOf(m, S);
  const fq = qmul(
    qmul(
      qmul(hq, quat(...((p[`thigh${S}`] ?? [0, 0, 0]) as Euler3))),
      quat(...((p[`knee${S}`] ?? [0, 0, 0]) as Euler3)),
    ),
    quat(...((p[`ankle${S}`] ?? [0, 0, 0]) as Euler3)),
  );
  return { ankle: at, heel: add3(at, turn(fq, [0, -ANKLE, -HEEL])), ball: add3(at, turn(fq, [0, -ANKLE, BALL])) };
}
/** Bend `S`'s leg so its ankle's at `target` (the model's space): the knee by the reach, the thigh
 *  swung the least way onto it, the foot kept as it was in the hips' frame. */
function reachTo(m: Moved, S: "L" | "R", target: V3, w: number): void {
  const p = m.pose;
  const { hip, hq } = ankleOf(m, S);
  const want = turn(qinv(hq), sub3(target, hip));
  const L = THIGH + SHIN;
  // (eased into straight, not stopped dead at it: a standing leg near straight kinked its knee)
  const r0 = len3(want);
  const r = r0 < 0.96 * L ? r0 : 0.96 * L + 0.039 * L * Math.tanh((r0 - 0.96 * L) / (0.039 * L));
  const k0 = p[`knee${S}`] ?? [0, 0, 0];
  const t0 = p[`thigh${S}`] ?? [0, 0, 0];
  const a0 = p[`ankle${S}`] ?? [0, 0, 0];
  const cos = (r * r - THIGH * THIGH - SHIN * SHIN) / (2 * THIGH * SHIN);
  const k = Math.acos(Math.max(-1, Math.min(1, cos)));
  const tq0 = quat(...(t0 as Euler3));
  const kq = quat(k, 0, 0);
  // the ankle with the new knee, in the hips' frame, before the thigh's swung
  const shin = add3([0, -THIGH, 0], turn(kq, [0, -SHIN, 0]));
  const now = turn(tq0, shin);
  const n0 = len3(now);
  const nw = len3(want);
  if (n0 < 1e-6 || nw < 1e-6) return;
  const swing = between([now[0] / n0, now[1] / n0, now[2] / n0], [want[0] / nw, want[1] / nw, want[2] / nw]);
  const tq = qmul(swing, tq0);
  // (the foot's turn in the hips' frame as it was: thigh · knee · ankle kept)
  const foot = qmul(qmul(tq0, quat(...(k0 as Euler3))), quat(...(a0 as Euler3)));
  const aq = qmul(qinv(qmul(tq, kq)), foot);
  const T = euler(tq);
  const A = euler(aq);
  p[`thigh${S}`] = [lerp(t0[0], T[0], w), lerp(t0[1], T[1], w), lerp(t0[2], T[2], w)];
  p[`knee${S}`] = [lerp(k0[0], k, w), k0[1] * (1 - w), k0[2] * (1 - w)];
  p[`ankle${S}`] = [lerp(a0[0], A[0], w), lerp(a0[1], A[1], w), lerp(a0[2], A[2], w)];
}
interface Planted {
  /** the spot on the ground it stands on (carried in the model's space) */
  at: V3 | null;
  /** which: its heel or its ball */
  on: "heel" | "ball";
  w: number;
  was: number;
  /** letting go: eased out before it's put down again */
  going: boolean;
  /** in the air, how far it's drawn to the base's foot (eased from a release, never jumped) */
  air: number;
}
export class FootLock {
  private feet: Record<"L" | "R", Planted> = {
    L: { at: null, on: "heel", w: 0, was: 0, going: false, air: 0 },
    R: { at: null, on: "heel", w: 0, was: 0, going: false, air: 0 },
  };
  /** Pin the planted feet of `m` (posed, the model's space) — the body gone `ahead` and `left` (m),
   *  turned `yaw` (rad, + to its left) since the last frame. `base`: where the feet were before the
   *  layers leant and twisted the body (on the ground or not is told by it, and they're held there);
   *  else as `m` has them. `off`: let go of everything.
   *  (4c: what's held is the spot the foot stands on — its heel, then its ball as it rolls up onto
   *  it — and the ankle goes round it as the base's does: an ankle held still dragged the ball back
   *  at every push-off) */
  apply(
    m: Moved,
    dt: number,
    move: { ahead: number; left: number; yaw: number },
    off = false,
    base: Record<"L" | "R", Foot> | null = null,
  ): Moved {
    const c = Math.cos(-move.yaw);
    const sn = Math.sin(-move.yaw);
    for (const S of ["L", "R"] as const) {
      const f = this.feet[S];
      if (off) {
        f.at = null;
        f.w = 0;
        f.going = false;
        f.air = 0;
        continue;
      }
      // (a spot on the ground carried into this frame: back by what the body went, turned against its
      // turn)
      const carry = (q: V3): V3 => {
        const x = q[0] - move.left;
        const z = q[2] - move.ahead;
        return [c * x + sn * z, q[1], -sn * x + c * z];
      };
      if (f.at) f.at = carry(f.at);
      const foot = base?.[S] ?? footOf(m, S);
      const pose = foot.ankle;
      // (the lower of the two spots it stands on: how high the foot is off the ground)
      const low = Math.min(foot.heel[1], foot.ball[1]);
      const vy = dt > 0 ? (low - f.was) / dt : 0;
      f.was = low;
      // put down: on the ground and not rising or falling (a landing foot's still above it till it's
      // down; a pose's foot that slides on the ground — a start's short strides — is pinned all the
      // same: that's what it's for); lifted: off the ground (the roll onto the toes isn't: the ball's
      // still down), or rising fast
      const lands = low < 0.012 && Math.abs(vy) < 0.3;
      const lifted = low > 0.035 || vy > 0.9;
      // (which spot it stands on: the heel till the ball's the lower by 3 mm, and back the same)
      const on =
        f.on === "heel"
          ? foot.ball[1] < foot.heel[1] - 0.003
            ? "ball"
            : "heel"
          : foot.heel[1] < foot.ball[1] - 0.003
            ? "heel"
            : "ball";
      const spot = (o: "heel" | "ball") => (o === "heel" ? foot.heel : foot.ball);
      // taken when it's put down; let go when it's lifted, or the pose has gone too far from it (a step
      // round on the spot, a start's short strides) — always eased, so it's never put down again with
      // a jump: only once it's let go
      if (!f.at && lands) {
        const q = spot(on);
        f.at = [q[0], q[1], q[2]];
        f.on = on;
        f.going = false;
      }
      if (!f.at) {
        f.on = on;
        // (in the air: where the base has it, the layers' lean on it taken off as it nears the ground —
        // just let go, from all of it, eased down: a jump from the pin's full reach popped the knee)
        const near = smoother(clamp01((0.08 - low) / 0.08));
        f.air = near >= f.air ? near : Math.max(near, f.air - dt / 0.15);
        if (base) reachTo(m, S, pose, smoother(f.air));
        continue;
      }
      // (rolled from the heel onto the ball, or back: the ball's held from where it is now, the held
      // heel and the base's foot between them)
      if (on !== f.on) {
        const was = spot(f.on);
        const now = spot(on);
        f.at = [f.at[0] + now[0] - was[0], f.at[1], f.at[2] + now[2] - was[2]];
        f.on = on;
      }
      const held = spot(f.on);
      f.air = 1;
      if (lifted || Math.hypot(f.at[0] - held[0], f.at[2] - held[2]) > 0.22) f.going = true;
      f.w = f.going ? Math.max(0, f.w - dt / 0.1) : Math.min(1, f.w + dt / 0.025);
      if (f.going && f.w <= 0) {
        f.at = null;
        continue;
      }
      // the pose's own height (a heel, the roll onto the toes), the held spot across the ground with
      // the ankle where the base has it from that spot — taken and let go along the ground between the
      // two, not by the leg's angles (between a leg stretched back to the pin and the pose's folded one
      // the foot scraped the ground)
      const k = smoother(f.w);
      const to: V3 = [f.at[0] + pose[0] - held[0], pose[1], f.at[2] + pose[2] - held[2]];
      reachTo(m, S, [lerp(pose[0], to[0], k), pose[1], lerp(pose[2], to[2], k)], 1);
    }
    return m;
  }
}

// ── 4c: steps that aren't a cycle (docs/plan/58-the-animation.md, phase 4) — setting off,
// stopping, turning round: each foot put down where it's to go on the ground and kept there, the
// hips carried over them, the legs solved to them. A cycle can't do these: a jog never has both feet
// down, and a pose blended into another by its angles drags its feet along the floor.
type Side = "L" | "R";
const SIDES: Side[] = ["L", "R"];
/** Where the standing pose has the feet (its ankles, flat; the model's space), and their turn. */
export function idleFeet(seed: number, gait?: string): Record<Side, { at: V3; yaw: number }> {
  const ahead = hash(9, seed) < 0.5 ? 1 : -1;
  const wide = styleOf(gait).wide;
  const m = idle2Pose(0, 0, seed, true);
  const out = {} as Record<Side, { at: V3; yaw: number }>;
  for (const [S, side] of [
    ["L", 1],
    ["R", -1],
  ] as const) {
    const f = footOf(m, S);
    out[S] = {
      at: [side * (0.088 + wide + (side === ahead ? 0.012 : 0)), ANKLE, side === ahead ? 0.035 : -0.012],
      yaw: Math.atan2(f.ball[0] - f.heel[0], f.ball[2] - f.heel[2]),
    };
  }
  return out;
}
/** A foot's pitch (+: the heel up, onto the ball) and turn (+: to the left), from where it is. */
export function footAngles(f: Foot): { pitch: number; yaw: number } {
  const d = sub3(f.ball, f.heel);
  return { pitch: Math.atan2(-d[1], Math.hypot(d[0], d[2])), yaw: Math.atan2(d[0], d[2]) };
}
/** Turn `S`'s foot to `pitch` and `yaw` (the model's space), whatever the leg above it is doing. */
function footTo(m: Moved, S: Side, pitch: number, yaw: number, roll = 0): void {
  const p = m.pose;
  const leg = qmul(
    qmul(quat(...((p.hips ?? [0, 0, 0]) as Euler3)), quat(...((p[`thigh${S}`] ?? [0, 0, 0]) as Euler3))),
    quat(...((p[`knee${S}`] ?? [0, 0, 0]) as Euler3)),
  );
  p[`ankle${S}`] = euler(qmul(qinv(leg), qmul(qmul(quat(0, yaw, 0), quat(pitch, 0, 0)), quat(0, 0, roll))));
  p[`toe${S}`] = [-Math.max(0, pitch), 0, 0];
}
/** `m` (`a` and `b` mixed by their angles) with its legs solved again to where the feet are between
 *  theirs — mixed by where they are, not how the legs bend (by the angles, the feet sank as the hips
 *  dropped into a crouch). */
export function blendLegs(m: Moved, a: Moved, b: Moved, wt: number | [number, number], across = true): Moved {
  // (`wt`: one for both, or each foot's — L, R; `across` false: the feet where `a` has them across the
  // ground, only their height between)
  for (const S of SIDES) {
    // (at 0 or 1 too: `m`'s legs are mixed by their angles — solved to `a`'s feet, or `b`'s)
    const w = Math.max(0, Math.min(1, typeof wt === "number" ? wt : wt[S === "L" ? 0 : 1]));
    const u = across ? w : 0;
    const fa = footOf(a, S);
    const fb = footOf(b, S);
    const pa = footAngles(fa);
    const pb = footAngles(fb);
    reachTo(
      m,
      S,
      [lerp(fa.ankle[0], fb.ankle[0], u), lerp(fa.ankle[1], fb.ankle[1], w), lerp(fa.ankle[2], fb.ankle[2], u)],
      1,
    );
    const dy = Math.atan2(Math.sin(pb.yaw - pa.yaw), Math.cos(pb.yaw - pa.yaw));
    footTo(m, S, lerp(pa.pitch, pb.pitch, w), pa.yaw + dy * w);
  }
  return m;
}
/** 4f: `S`'s leg solved for its ankle at `ankle` (the model's space) and its foot tipped `pitch`
 *  more (+: toes down) and rolled `roll` (+: its left edge up) — on the ground under it. */
export function groundLeg(m: Moved, S: Side, ankle: V3, pitch: number, roll: number): void {
  const was = footAngles(footOf(m, S));
  reachTo(m, S, ankle, 1);
  footTo(m, S, was.pitch + pitch, was.yaw, roll);
}
/** Where the ankle is with the foot flat at `at`, rolled `pitch` onto its ball (it goes round the
 *  ball, which stays), turned `yaw`. */
function rolled(at: V3, pitch: number, yaw: number): V3 {
  // (heel up: round the ball; toes up: round the heel)
  const f = pitch;
  const fwd = ANKLE * Math.sin(f) + (f < 0 ? -HEEL : BALL) * (1 - Math.cos(f));
  const up = ANKLE * Math.cos(f) + (f < 0 ? -HEEL : BALL) * Math.sin(f);
  return [at[0] + Math.sin(yaw) * fwd, at[1] - ANKLE + up, at[2] + Math.cos(yaw) * fwd];
}
interface Swing {
  p0: V3;
  v0: V3;
  p1: V3;
  pitch0: number;
  yaw0: number;
  yaw1: number;
  t: number;
  dur: number;
  h: number;
  /** put down where it was first aimed (a brake): not aimed again */
  fixed?: boolean;
  /** its pitch as it's put down (0: flat) */
  pitch1?: number;
}
interface SFoot {
  /** the ankle's spot with the foot flat (on the ground when it's planted; the model's space, carried) */
  at: V3;
  pitch: number;
  yaw: number;
  swing: Swing | null;
  /** held at this pitch while the skid lasts (a braced heel, the other foot's ball) */
  hold?: number;
}
/** Where each foot's to go: its spot (the ankle's, flat) and turn — `left`, the seconds till it'd
 *  land, for a spot ahead of where the body will be. */
export type Want = (S: Side, left: number) => { at: V3; yaw: number };
export class Stepper {
  feet: Record<Side, SFoot> = {
    L: { at: [0.09, ANKLE, 0], pitch: 0, yaw: 0, swing: null },
    R: { at: [-0.09, ANKLE, 0], pitch: 0, yaw: 0, swing: null },
  };
  /** the foot turned on this frame (a pivot), if one is */
  pivot: Side | null = null;
  /** skidding: how much of the body's way a planted foot slides on with (0: it grips) */
  slip = 0;
  // the hips over the feet: their height and their weight across, each a spring
  private hy = 0;
  private hyv = 0;
  private hx = 0;
  private hxv = 0;
  // (where a pose had the feet last frame, carried: how fast they go, to take them on the move)
  private seen: Record<Side, Foot> | null = null;
  private vel: Record<Side, V3> = { L: [0, 0, 0], R: [0, 0, 0] };
  /** how long till `S` is down (0: it is) */
  left(S: Side): number {
    const sw = this.feet[S].swing;
    return sw ? Math.max(0, sw.dur - sw.t) : 0;
  }
  /** stepping */
  get busy(): boolean {
    return !!(this.feet.L.swing || this.feet.R.swing);
  }
  private carry(q: V3, mv: { ahead: number; left: number; yaw: number }): V3 {
    const c = Math.cos(-mv.yaw);
    const sn = Math.sin(-mv.yaw);
    const x = q[0] - mv.left;
    const z = q[2] - mv.ahead;
    return [c * x + sn * z, q[1], -sn * x + c * z];
  }
  /** Keep up with where a pose has the feet (the cycle's, the idle's) while something else has them. */
  watch(feet: Record<Side, Foot>, mv: { ahead: number; left: number; yaw: number }, dt: number): void {
    for (const S of SIDES) {
      const was = this.seen?.[S];
      if (was && dt > 0) {
        const q = this.carry(was.ankle, mv);
        const v = sub3(feet[S].ankle, q).map((x) => x / dt) as V3;
        this.vel[S] = [
          lerp(this.vel[S][0], v[0], 0.5),
          lerp(this.vel[S][1], v[1], 0.5),
          lerp(this.vel[S][2], v[2], 0.5),
        ];
      }
    }
    this.seen = feet;
  }
  /** Take the feet from where the pose watched last has them, as they go: a foot on the ground planted
   *  there, one in the air stepping on from its way and speed. */
  take(lift: [number, number, number]): void {
    if (!this.seen) return;
    const seen = this.seen;
    const lowOf = (S: Side) => Math.min(seen[S].heel[1], seen[S].ball[1]);
    // (both up — a run's flight: the lower comes down first, where it was going, a brake; the other
    // after it, to where it's wanted)
    // (of those in the air, the lower: one foot up, it's the brake)
    const up = SIDES.filter((S) => lowOf(S) >= 0.012);
    const first: Side = up.length === 1 ? up[0] : lowOf("L") <= lowOf("R") ? "L" : "R";
    let firstDur = 0;
    for (const S of [first, first === "L" ? "R" : "L"] as Side[]) {
      const f = seen[S];
      const { pitch, yaw } = footAngles(f);
      const low = lowOf(S);
      const ft = this.feet[S];
      ft.pitch = pitch;
      ft.yaw = yaw;
      if (low < 0.012) {
        // (flat where it stands: what it stands on held, its pitch kept)
        const fwd = ANKLE * Math.sin(pitch) + (pitch < 0 ? -HEEL : BALL) * (1 - Math.cos(pitch));
        ft.at = [f.ankle[0] - Math.sin(yaw) * fwd, ANKLE, f.ankle[2] - Math.cos(yaw) * fwd];
        ft.swing = null;
        continue;
      }
      const at: V3 = [f.ankle[0], f.ankle[1], f.ankle[2]];
      const v0 = this.vel[S];
      const brake = S === first;
      const dur = brake ? clamp01(0.05 + 0.8 * low) * 0.14 + 0.04 : Math.max(0.16, firstDur + 0.1);
      if (brake) firstDur = dur;
      ft.at = at;
      ft.swing = {
        p0: [...at],
        v0: [...v0],
        // (the brake: down where it was going — its way over half the time left, on the ground)
        p1: [at[0] + 0.5 * v0[0] * dur, ANKLE, at[2] + 0.5 * v0[2] * dur],
        pitch0: pitch,
        yaw0: yaw,
        yaw1: yaw,
        t: 0,
        dur,
        h: brake ? 0 : 0.05,
        fixed: brake,
      };
    }
    this.hy = lift[1];
    this.hyv = 0;
    this.hx = lift[0];
    this.hxv = 0;
  }
  /** A skid (from a sprint): `S` out ahead on its heel, toes up, braced; the other under, back on its
   *  ball — both sliding on with the body by `slip` till it lets go (`brace(null)`). */
  brace(S: Side | null, slip = 0.85): void {
    if (!S) {
      this.slip = 0;
      for (const F of SIDES) this.feet[F].hold = undefined;
      return;
    }
    this.slip = slip;
    for (const [F, z, pitch, dur] of [
      [S, 0.3, -0.35, 0.09],
      [S === "L" ? "R" : "L", -0.16, 0.45, 0.12],
    ] as [Side, number, number, number][]) {
      const ft = this.feet[F];
      ft.hold = pitch;
      const x = (F === "L" ? 1 : -1) * 0.1;
      const from = ft.swing ? ft.at : rolled(ft.at, ft.pitch, ft.yaw);
      ft.swing = {
        p0: [...from],
        v0: ft.swing ? [...ft.swing.v0] : [0, 0, 0],
        p1: [x, ANKLE, z],
        pitch0: ft.pitch,
        yaw0: ft.yaw,
        yaw1: 0,
        t: 0,
        dur,
        h: 0.03,
        fixed: true,
        pitch1: pitch,
      };
    }
  }
  /** Take `S`'s step under way as the first step out: aimed again where it's wanted (a brake isn't),
   *  given the first step's time `dur` if it's only just begun. */
  adopt(S: Side, dur: number): void {
    const sw = this.feet[S].swing;
    if (!sw) return;
    sw.fixed = false;
    // (its time from now: no shorter than it's been going, so its place along it never jumps back)
    if (sw.t < 0.06) sw.dur = Math.max(sw.t + 0.05, dur);
  }
  /** Step `S` now: to where `want` has it, landing in `dur` s, its foot `h` up at the most. */
  step(S: Side, want: Want, dur: number, h: number): void {
    const ft = this.feet[S];
    const to = want(S, dur);
    ft.swing = {
      p0: rolled(ft.at, ft.pitch, ft.yaw),
      v0: [0, 0, 0],
      p1: to.at,
      pitch0: ft.pitch,
      yaw0: ft.yaw,
      yaw1: to.yaw,
      t: 0,
      dur,
      h,
    };
  }
  /** This frame: the feet carried with the body, a foot stepped when it's too far from where it's
   *  wanted (one at a time; the farther), the steps gone on with, a planted foot turned on its ball
   *  as the body turns quickly over it. `quick` (0…1): how hurried the steps are. Which foot came
   *  down, if one did. */
  update(
    dt: number,
    mv: { ahead: number; left: number; yaw: number },
    want: Want,
    o: { quick: number; turn: number; free?: boolean },
  ): Side | null {
    let landed: Side | null = null;
    const c = Math.cos(-mv.yaw);
    const sn = Math.sin(-mv.yaw);
    for (const S of SIDES) {
      const ft = this.feet[S];
      ft.at = this.carry(ft.at, mv);
      // (skidding: a planted foot goes on with the body, most of the way)
      if (!ft.swing && this.slip > 0)
        ft.at = [ft.at[0] + this.slip * mv.left, ft.at[1], ft.at[2] + this.slip * mv.ahead];
      ft.yaw -= mv.yaw;
      const sw = ft.swing;
      if (sw) {
        sw.p0 = this.carry(sw.p0, mv);
        sw.p1 = this.carry(sw.p1, mv);
        sw.v0 = [c * sw.v0[0] + sn * sw.v0[2], sw.v0[1], -sn * sw.v0[0] + c * sw.v0[2]];
        sw.yaw0 -= mv.yaw;
        sw.yaw1 -= mv.yaw;
        sw.t += dt;
        // (aimed again while it's early: where the body will be by the time it's down)
        const u0 = sw.t / sw.dur;
        if (u0 < 0.7 && !sw.fixed) {
          const to = want(S, Math.max(0, sw.dur - sw.t));
          sw.p1 = to.at;
          sw.yaw1 = to.yaw;
        }
        const u = clamp01(u0);
        // a Hermite from where it was and how fast, to its spot at rest; the lift over it
        const D = sw.dur;
        const h00 = 2 * u ** 3 - 3 * u ** 2 + 1;
        const h10 = u ** 3 - 2 * u ** 2 + u;
        const h01 = -2 * u ** 3 + 3 * u ** 2;
        const bump = 16 * u * u * (1 - u) * (1 - u);
        ft.at = [
          h00 * sw.p0[0] + h10 * D * sw.v0[0] + h01 * sw.p1[0],
          // (never through the floor: a foot taken coming down fast curved under it)
          Math.max(ANKLE, h00 * sw.p0[1] + h10 * D * sw.v0[1] + h01 * sw.p1[1] + sw.h * bump),
          h00 * sw.p0[2] + h10 * D * sw.v0[2] + h01 * sw.p1[2],
        ];
        const e = smoother(u);
        ft.yaw = lerp(sw.yaw0, sw.yaw1, e);
        // (peeled off the ground on its ball, flat again as it comes down — the toes a little up)
        ft.pitch =
          sw.pitch0 * (1 - smoother(clamp01(u / 0.5))) -
          0.12 * Math.sin(Math.PI * u) * u +
          (sw.pitch1 ?? 0) * smoother(u);
        if (u >= 1) {
          ft.at = [sw.p1[0], ANKLE, sw.p1[2]];
          ft.pitch = sw.pitch1 ?? 0;
          ft.swing = null;
          landed = S;
        }
      }
    }
    // turning round fast (a pivot: half a turn in a fifth of a second): the planted foot under the
    // body is turned on its ball with it, the other swung round to its place the new way; with no foot
    // under the body, a little hop round on both
    const fast = Math.abs(o.turn) > 6;
    this.pivot = null;
    if (fast && !o.free && this.slip === 0) {
      const near = (S: Side) => Math.hypot(this.feet[S].at[0], this.feet[S].at[2]);
      const under = SIDES.filter((S) => !this.feet[S].swing && near(S) < 0.2).sort((a, b) => near(a) - near(b))[0];
      const round = Math.min(0.25, Math.max(0.12, (Math.PI / Math.abs(o.turn)) * 0.8));
      if (under) {
        this.pivot = under;
        const other = under === "L" ? "R" : "L";
        if (!this.feet[other].swing) this.step(other, want, round, 0.05);
      } else for (const S of SIDES) if (!this.feet[S].swing) this.step(S, want, round, 0.03);
    }
    // a planted foot: up onto its ball as the body leaves it behind (a push-off), else down flat; the
    // pivot's turned on its ball with the body
    for (const S of SIDES) {
      const ft = this.feet[S];
      if (ft.swing) continue;
      const to = want(S, 0);
      let pitchTo = ft.hold ?? clamp01((-ft.at[2] - 0.12) / 0.25) * 0.7;
      if (this.pivot === S) {
        const dy = Math.atan2(Math.sin(to.yaw - ft.yaw), Math.cos(to.yaw - ft.yaw));
        const step = Math.sign(dy) * Math.min(Math.abs(dy), Math.abs(o.turn) * dt);
        // (round the ball: the ankle's spot swung about it — and the ball drawn in under the body,
        // which turns about itself, not the foot: else half a turn crossed the legs)
        const ball: V3 = [ft.at[0] + Math.sin(ft.yaw) * BALL, ANKLE, ft.at[2] + Math.cos(ft.yaw) * BALL];
        const k = 1 - Math.exp(-18 * dt);
        ball[0] += (0 - ball[0]) * k;
        ball[2] += (0.04 - ball[2]) * k;
        ft.yaw += step;
        ft.at = [ball[0] - Math.sin(ft.yaw) * BALL, ANKLE, ball[2] - Math.cos(ft.yaw) * BALL];
        pitchTo = Math.max(pitchTo, 0.3);
      }
      ft.pitch += (pitchTo - ft.pitch) * (1 - Math.exp(-(this.pivot === S ? 40 : 14) * dt));
    }
    // a step when a foot's too far from where it's wanted — one at a time, the farther first
    if (!o.free && !this.busy && !fast && this.slip === 0) {
      let worst: Side | null = null;
      let most = 0;
      for (const S of SIDES) {
        const ft = this.feet[S];
        const to = want(S, 0.2);
        const off = Math.hypot(ft.at[0] - to.at[0], ft.at[2] - to.at[2]);
        const turned = Math.abs(Math.atan2(Math.sin(to.yaw - ft.yaw), Math.cos(to.yaw - ft.yaw)));
        const need = Math.max(off / 0.07, turned / 0.4);
        if (need > 1 && need > most) {
          most = need;
          worst = S;
        }
      }
      if (worst) {
        const to = want(worst, 0.2);
        const off = Math.hypot(this.feet[worst].at[0] - to.at[0], this.feet[worst].at[2] - to.at[2]);
        const dur = lerp(0.2 + 0.3 * off, 0.14 + 0.15 * off, o.quick);
        this.step(worst, want, Math.min(0.32, dur), lerp(0.05, 0.07, o.quick));
      }
    }
    return landed;
  }
  /** Lay the legs on `m` by `w` (taken between its own feet and these, along the ground), the hips
   *  over them: a little down while a foot's up, never so high a planted leg can't reach its foot. */
  lay(m: Moved, w: number, dt: number): void {
    if (w <= 0) return;
    const lift = m.lift;
    const one = this.feet.L.swing ? this.feet.R : this.feet.R.swing ? this.feet.L : null;
    // the height: the pose's, a little down while stepping, and within the planted legs' reach
    let y = lift[1] - (one ? 0.012 : 0);
    const L = (THIGH + SHIN) * 0.995;
    for (const S of SIDES) {
      const ft = this.feet[S];
      if (ft.swing) continue;
      const a = rolled(ft.at, ft.pitch, ft.yaw);
      const hip: V3 = [this.hx + (S === "L" ? HIP_X : -HIP_X), 0, lift[2]];
      const flat = Math.hypot(a[0] - hip[0], a[2] - hip[2]);
      if (flat < L) y = Math.min(y, a[1] + Math.sqrt(L * L - flat * flat) - HIP_H);
    }
    const x = lift[0] + (one ? 0.35 * one.at[0] : 0);
    const k = 22;
    this.hyv += (k * k * (y - this.hy) - 2 * k * this.hyv) * dt;
    this.hy += this.hyv * dt;
    this.hxv += (k * k * (x - this.hx) - 2 * k * this.hxv) * dt;
    this.hx += this.hxv * dt;
    m.lift = [lerp(lift[0], this.hx, w), lerp(lift[1], this.hy, w), lift[2]];
    for (const S of SIDES) {
      const ft = this.feet[S];
      const own = footOf(m, S);
      const was = footAngles(own);
      const a = rolled(ft.at, ft.pitch, ft.yaw);
      reachTo(m, S, [lerp(own.ankle[0], a[0], w), lerp(own.ankle[1], a[1], w), lerp(own.ankle[2], a[2], w)], 1);
      const dy = Math.atan2(Math.sin(ft.yaw - was.yaw), Math.cos(ft.yaw - was.yaw));
      footTo(m, S, lerp(was.pitch, ft.pitch, w), was.yaw + dy * w);
    }
  }
}

/** A gait's legs laid on a posed body by `w`: each leg's world way turned into its thigh's own
 *  through the hips' turn (so the pelvis's twist doesn't swing a planted foot), the foot kept flat
 *  across, the toes flat on the ground as it rolls up onto them and let go just after it leaves. */
function gaitPlant(
  g: Gait,
  m: Moved,
  phase: number,
  T: number,
  e: number,
  w: number,
  o: { way?: number; L?: Gait; offL?: number } = {},
): void {
  const p = m.pose;
  const hq = qinv(quat(...(p.hips ?? [0, 0, 0])));
  // (4d: the legs' plane turned the way the body goes — aside, or backing up aslant — with the hips)
  const way = quat(0, o.way ?? 0, 0);
  for (const [S, off, side, gl] of [
    ["R", 0, -1, g],
    ["L", o.offL ?? 0.5, 1, o.L ?? g],
  ] as const) {
    const leg = gaitLeg(gl, phase + off, off, T, side, e);
    const spread = side * 0.03;
    const th = euler(qmul(hq, qmul(way, quat(leg.t, 0, spread))));
    const was = p[`thigh${S}`] ?? [0, 0, 0];
    const kn = p[`knee${S}`] ?? [0, 0, 0];
    const an = p[`ankle${S}`] ?? [0, 0, 0];
    p[`thigh${S}`] = [lerp(was[0], th[0], w), lerp(was[1], th[1], w), lerp(was[2], th[2], w)];
    p[`knee${S}`] = [lerp(kn[0], leg.k, w), kn[1], kn[2]];
    p[`ankle${S}`] = [lerp(an[0], leg.f - leg.t - leg.k, w), an[1] * (1 - w), lerp(an[2], -spread, w)];
    const q = (((phase + off) % 1) + 1) % 1;
    const toe = q < gl.on ? -Math.max(0, leg.f) : gaitToeLetGo(gl, q);
    const tw = p[`toe${S}`] ?? [0, 0, 0];
    p[`toe${S}`] = [lerp(tw[0], toe, w), 0, 0];
  }
}
/** 4d: the hips and legs turned `way` (rad, + to the left) to go aside or aslant, the trunk twisted
 *  back so the chest, then the head, still face ahead. */
function wayTurn(m: Moved, way: number): void {
  if (Math.abs(way) < 1e-4) return;
  const p = m.pose;
  p.hips = euler(qmul(quat(0, way, 0), quat(...((p.hips ?? [0, 0, 0]) as Euler3))));
  for (const [j, k] of [
    ["spine", 0.3],
    ["chest", 0.3],
    ["neck", 0.2],
    ["head", 0.2],
  ] as const) {
    const r = p[j] ?? [0, 0, 0];
    p[j] = [r[0], r[1] - k * way, r[2]];
  }
}

// ── 4d: backing up — a walk (toes down first behind, back onto the heel, off it last, toes up: a
// walk the other way round) and a run on the balls of the feet for the 5 m/s first person and lock-on
// allow; between them by the speed. The arms out for balance at a walk, pumping at a run; leant a
// little forward over the feet.
function back2Channels(phase: number, u: number, T: number): Ch {
  const sw = Math.cos(TAU * phase);
  const A = lerp(0.18, 0.7, u) * (1 - 0.3 * T);
  const c: Ch = {
    // (the right arm forward as the right foot goes down behind: across from the legs, as forward)
    sR: -0.05 - A * sw,
    sL: -0.05 + A * sw,
    eR: lerp(-0.5, -1.4, u) - 0.2 * T,
    eL: lerp(-0.5, -1.4, u) - 0.2 * T,
    oR: lerp(0.22, 0.17, u),
    oL: lerp(0.22, 0.17, u),
    wL: 0.15,
    wR: 0.15,
    hL: 0.2 + 0.5 * u,
    hR: 0.2 + 0.5 * u,
    hy: -lerp(0.08, 0.16, u) * sw,
    sy: lerp(0.05, 0.12, u) * sw,
    sx: lerp(0.06, 0.16, u) + 0.12 * T,
    hx: 0.03 + 0.04 * u,
  };
  return leanAtHips(c);
}
const BACK_WALK: Gait = {
  stride: (T) => 0.8 * K * (1 - 0.12 * T),
  on: 0.6,
  landX: 0.18 * K,
  landF: 0.3,
  fMid: 0,
  offF: -0.2,
  heel: 0.18,
  rollAt: 0.65,
  hips: (ph, T) => hipAt(0.646) + 0.012 * K * Math.cos(2 * TAU * (ph - 0.3)) - 0.03 * T,
  turn: (ph, T) => {
    const c = back2Channels(ph, 0, T);
    return [v(c, "hx"), v(c, "hy"), -0.04 * Math.cos(TAU * (ph - 0.3))];
  },
  swing: [
    // off in front, heel last, lifted as it's carried back (by where the foot's to be: by the joints
    // it snapped back and scraped the floor)
    { at: 0.72, t: 0, k: 0, f: 0, foot: { x: 0.2 * K, a: 0.1 } },
    { at: 0.84, t: 0, k: 0, f: 0.25, foot: { x: 0, a: 0.12 } },
    // reaching back, toes down to touch first
    { at: 0.94, t: 0, k: 0, f: 0.35, foot: { x: -0.15 * K, a: 0.115 } },
  ],
  letGo: 0.15,
  bend: 0.3,
  dir: -1,
};
const BACK_RUN: Gait = {
  stride: () => 1.8 * K,
  on: 0.28,
  landX: 0.1 * K,
  landF: 0.35,
  fMid: 0.25,
  offF: 0.35,
  heel: 0.3,
  rollAt: 0.6,
  hips: (ph, T) => hipAt(0.625) - 0.015 * K * Math.cos(2 * TAU * (ph - 0.14)) - 0.03 * T,
  turn: (ph, T) => {
    const c = back2Channels(ph, 1, T);
    return [v(c, "hx"), v(c, "hy"), -0.03 * Math.cos(TAU * (ph - 0.14))];
  },
  swing: [
    // off the ball in front, the knee folding up under
    { at: 0.45, t: 0, k: 0, f: 0.6, foot: { x: 0.3 * K, a: 0.2 } },
    // the heel high as it passes under
    { at: 0.65, t: 0, k: 0, f: 0.7, foot: { x: 0.05 * K, a: 0.28 } },
    // reaching back to come down on the ball
    { at: 0.85, t: 0, k: 0, f: 0.45, foot: { x: -0.15 * K, a: 0.14 } },
  ],
  letGo: 0.15,
  bend: 0.25,
  dir: -1,
};
const backGait = (u: number) =>
  lerpGait(BACK_WALK, BACK_RUN, clamp01(u), (ph, T) => {
    const c = back2Channels(ph, clamp01(u), T);
    return [v(c, "hx"), v(c, "hy"), -lerp(0.04, 0.03, u) * Math.cos(TAU * (ph - 0.3))];
  });
/** Tiles a backing-up cycle covers: `u` 0 a walk's … 1 a run's. */
export const back2Stride = (u: number, tension = 0) => backGait(u).stride(clamp01(tension));
/** Backing up at `phase` (0..1, by the ground covered): `u` 0 a walk … 1 a run; `way` aslant (rad,
 *  + its back turned to the left of the way it goes). */
export function back2Pose(phase: number, u = 0, tension = 0, way = 0): Moved {
  const T = clamp01(tension);
  const g = backGait(u);
  const c = back2Channels(phase, clamp01(u), T);
  c.hz = g.turn(phase, T, u)[2];
  c.up = g.hips(phase, T) - HIP_H;
  const m = upright(body(steady(c)));
  wayTurn(m, way);
  gaitPlant(g, m, phase, T, u, 1, { way });
  return m;
}

// ── 4d: crouched — a sneak at the crouch's 1.6 m/s, low, long steps heel to toe (low hips give the
// legs more reach, not less); the back low and round, the hands loose in front, ready
function crouch2Channels(phase: number, T: number): Ch {
  const sw = Math.cos(TAU * phase);
  const c: Ch = {
    hx: 0.06 + 0.04 * T,
    sx: 0.46 + 0.06 * T,
    hy: -0.07 * sw,
    sy: 0.05 * sw,
    sR: -0.6 - 0.08 * sw,
    sL: -0.6 + 0.08 * sw,
    eR: -1.25,
    eL: -1.25,
    oR: 0.26,
    oL: 0.26,
    wL: 0.25,
    wR: 0.25,
    hL: -0.1,
    hR: -0.1,
  };
  return leanAtHips(c);
}
const CROUCH_G: Gait = {
  stride: (T) => 1.0 * K * (1 - 0.1 * T),
  on: 0.62,
  landX: 0.28 * K,
  landF: -0.2,
  fMid: 0,
  offF: 0.45,
  heel: 0.15,
  rollAt: 0.6,
  hips: (ph, T) => hipAt(0.48) + 0.008 * K * Math.cos(2 * TAU * (ph - 0.31)) - 0.02 * T,
  turn: (ph, T) => {
    const c = crouch2Channels(ph, T);
    return [v(c, "hx"), v(c, "hy"), -0.03 * Math.cos(TAU * (ph - 0.31))];
  },
  swing: [
    // the heel peeled up behind, the knee folding
    { at: 0.72, t: -0.1, k: 1.75, f: 0.45 },
    // through, low, under the hips (the foot 7 cm up)
    { at: 0.84, t: 0, k: 0, f: 0.15, foot: { x: 0.05 * K, a: 0.13 } },
    // reaching out, the toes up for the heel (where the foot's to be: by the joints it went through
    // the floor)
    { at: 0.94, t: 0, k: 0, f: -0.15, foot: { x: 0.26 * K, a: 0.09 } },
  ],
  letGo: 0.15,
  bend: 0.15,
};
// (backing up crouched: the back-walk's steps — keyed by where the foot's to be, so they're right at
// any height — under the crouch's low hips)
const CROUCH_BACK: Gait = {
  ...BACK_WALK,
  stride: (T) => 0.9 * K * (1 - 0.1 * T),
  landX: 0.24 * K,
  hips: CROUCH_G.hips,
  turn: CROUCH_G.turn,
};
/** Tiles a sneaking cycle covers (`back`: backing up). */
export const crouch2Stride = (tension = 0, back = false) => (back ? CROUCH_BACK : CROUCH_G).stride(clamp01(tension));
/** Sneaking crouched at `phase` (0..1, by the ground covered); `way` aside (rad, + to the left);
 *  `back` backing up. */
export function crouch2Pose(phase: number, tension = 0, way = 0, back = false): Moved {
  const T = clamp01(tension);
  const g = back ? CROUCH_BACK : CROUCH_G;
  const c = crouch2Channels(phase, T);
  c.hz = -0.03 * Math.cos(TAU * (phase - 0.31));
  c.up = g.hips(phase, T) - HIP_H;
  const m = upright(body(steady(c, -0.05)));
  wayTurn(m, way);
  gaitPlant(g, m, phase, T, 0, 1, { way });
  return m;
}
/** Where the crouch has the feet (the model's space): the left flat ahead, the right back on its
 *  ball. */
export function crouchFeet(): Record<"L" | "R", { at: V3; yaw: number }> {
  return { L: { at: [0.11, ANKLE, 0.1 * K], yaw: 0.08 }, R: { at: [-0.11, ANKLE, -0.12 * K], yaw: -0.08 } };
}
/** Crouched, still (`t` s, for its breath): low over the feet, placed — the left flat ahead, the
 *  right back on its ball; the hands loose in front. */
export function crouch2Pose0(t: number, tension = 0): Moved {
  const T = clamp01(tension);
  const br = Math.sin(TAU * (t / lerp(4.2, 2.6, T)));
  const c = crouch2Channels(0.25, T);
  c.hy = 0.06;
  c.sy = -0.04;
  c.sx = v(c, "sx") + 0.015 * br;
  c.cx = -0.02 * br;
  c.fR = 0.55;
  c.fL = 0;
  c.up = hipAt(0.47) - HIP_H + 0.003 * br;
  const m = body(steady(c, -0.05));
  const feet = crouchFeet();
  for (const S of ["L", "R"] as const) {
    const f = v(c, `f${S}`);
    const at = feet[S].at;
    reachTo(
      m,
      S,
      [at[0], ANKLE * Math.cos(f) + BALL * Math.sin(f), at[2] + ANKLE * Math.sin(f) + BALL * (1 - Math.cos(f))],
      1,
    );
    footTo(m, S, f, feet[S].yaw);
  }
  return m;
}

// ── a skid (plan 58 G.B): slowing hard from speed — the lead foot braced out ahead on its heel,
// the other bent under, the body leant back over it (at the hips), the arms thrown out ahead
// (compact, the legs never stretched out: the front foot a short way ahead with its knee bent, the
// back one under the hips on its ball, the hips sat down between them — 0.58 m — and the feet sliding
// with her; the trunk sat back a little, the arms forward and low)
const SKID: Ch = {
  tR: -0.87,
  kR: 0.86,
  fR: -0.12,
  tL: -0.18,
  kL: 1.03,
  fL: 0.4,
  aL: 0.08,
  aR: 0.12,
  sx: -0.04,
  sL: -0.85,
  sR: -0.45,
  oL: 0.3,
  oR: 0.25,
  eL: -1,
  eR: -1.15,
  hL: 0.4,
  hR: 0.4,
};

// ── the jump (KH): a deep wind-up, arms thrown back; a stretch off the toes, arms thrown up; at
// the top, hang time — the hop with one knee high and the arms spread, the flip balled up tight;
// the legs reaching down for the ground; a squash that gives by how hard it lands.
const sym = (c: Ch): Ch => {
  const out: Ch = { ...c };
  for (const k of ["t", "k", "f", "s", "e", "o", "w", "a"]) {
    if (`${k}` in c) {
      out[`${k}L`] = c[k];
      out[`${k}R`] = c[k];
      delete out[k];
    }
  }
  return out;
};
const HOP2 = {
  crouch: sym({ t: -0.95, k: 1.75, f: 0, s: 0.9, e: -0.35, o: 0.2, sx: 0.5, dx: -0.2 }),
  launch: { ...sym({ t: 0.05, k: 0.03, f: 0.85, s: -2.7, e: -0.15, o: 0.28 }), sx: -0.12, up: 0.04 },
  // hang time: both knees up, one higher, the arms flung up and out
  apex: {
    tR: -1.65,
    kR: 2.15,
    fR: 0.45,
    tL: -0.55,
    kL: 1.95,
    fL: 0.7,
    sL: -1.25,
    oL: 1.4,
    eL: -0.3,
    sR: -1.7,
    oR: 1.15,
    eR: -0.45,
    sx: 0.2,
    dx: -0.1,
    up: 0.24,
  },
  reach: {
    tL: -0.45,
    kL: 0.45,
    fL: -0.05,
    tR: -0.12,
    kR: 0.32,
    fR: 0.12,
    ...sym({ s: -1.55, o: 1.05, e: -0.3 }),
    sx: 0.06,
    up: 0,
  },
  impact: sym({ t: -0.85, k: 1.45, f: 0, s: -0.7, o: 0.5, e: -0.5, sx: 0.38 }),
};
const FLIP2 = {
  crouch: sym({ t: -1.0, k: 1.85, f: 0, s: 1.0, e: -0.3, o: 0.18, sx: 0.6, dx: -0.15 }),
  launch: { ...sym({ t: 0.1, k: 0.02, f: 0.9, s: -2.95, e: -0.1, o: 0.18 }), sx: -0.2, up: 0.05 },
  tuck: { ...sym({ t: -2.3, k: 2.55, f: 0.5, s: -0.8, e: -1.9, o: 0.15 }), sx: 0.8, dx: 0.45, up: 0.25 },
  open: { ...sym({ t: -0.7, k: 0.8, f: 0.1, s: -1.7, o: 1.0, e: -0.25 }), sx: 0.05, up: 0.05 },
  impact: sym({ t: -0.95, k: 1.65, f: 0, s: -1.25, o: 0.8, e: -0.3, sx: 0.4 }),
};
// running's jump (a leap: KH's long stride through the air, leant into it — the flip's the jump in
// the air): off the right foot, the left knee driven, the arms the run's, pumped wide
const LEAP2 = {
  crouch: { tL: -0.6, kL: 1.2, fL: 0.3, tR: 0.3, kR: 0.6, fR: 0.6, sL: 0.6, eL: -1.2, sR: -0.8, eR: -1.4, sx: 0.3 },
  launch: {
    tL: -1.3,
    kL: 1.6,
    fL: 0.3,
    tR: 0.62,
    kR: 0.1,
    fR: 1.0,
    sR: -1.5,
    eR: -0.9,
    oR: 0.3,
    sL: 0.95,
    eL: -0.7,
    oL: 0.35,
    sx: 0.32,
    up: 0.05,
  },
  apex: {
    tL: -1.05,
    kL: 0.75,
    fL: 0.1,
    tR: 0.45,
    kR: 1.35,
    fR: 0.8,
    sR: -1.1,
    eR: -0.7,
    oR: 0.75,
    sL: 0.6,
    eL: -0.5,
    oL: 0.85,
    sx: 0.24,
    up: 0.1,
  },
  reach: {
    tL: -0.75,
    kL: 0.45,
    fL: -0.05,
    tR: -0.35,
    kR: 0.95,
    fR: 0.3,
    sR: -0.6,
    eR: -0.9,
    oR: 0.4,
    sL: 0.3,
    eL: -0.9,
    oL: 0.45,
    sx: 0.18,
    up: 0,
  },
  impact: { tL: -0.45, kL: 0.95, fL: 0, tR: 0.2, kR: 1.3, fR: 0.8, sR: -0.5, eR: -1.3, sL: 0.5, eL: -1.3, sx: 0.3 },
};
// (G.F: the tops held — hang time — the launches snapped through)
const LEAP2_AIR: Key[] = [
  { at: 0, c: LEAP2.crouch },
  { at: 0.14, c: LEAP2.launch },
  { at: 0.45, c: LEAP2.apex, ease: 0.7 },
  { at: 0.62, c: LEAP2.apex, ease: 0.7 },
  { at: 0.88, c: LEAP2.reach },
];
const HOP2_AIR: Key[] = [
  { at: 0, c: HOP2.crouch },
  { at: 0.17, c: HOP2.launch },
  { at: 0.42, c: HOP2.apex, ease: 0.9 },
  { at: 0.6, c: HOP2.apex, ease: 0.9 },
  { at: 0.88, c: HOP2.reach },
];
const FLIP2_AIR: Key[] = [
  { at: 0, c: FLIP2.crouch },
  { at: 0.13, c: FLIP2.launch },
  { at: 0.3, c: FLIP2.tuck, ease: 0.6 },
  { at: 0.66, c: FLIP2.tuck, ease: 0.6 },
  { at: 0.87, c: FLIP2.open },
];

/** A jump's body at its stage (as `jumpPose`: how much of it to lay over the rest, `w`). */
export function jump2Pose(
  a: { kind: string; stage: string; k: number },
  spin = true,
): { pose: Moved["pose"]; lift: Euler3; w: number } {
  const flip = a.kind === "flip";
  const leap = a.kind === "leap";
  const K = flip ? FLIP2 : leap ? LEAP2 : HOP2;
  let c: Ch;
  let w = 1;
  if (a.stage === "crouch") {
    c = { ...K.crouch };
    w = smoother(a.k * 1.3);
  } else if (a.stage === "air") {
    c = sample(flip ? FLIP2_AIR : leap ? LEAP2_AIR : HOP2_AIR, a.k, false);
  } else if (a.stage === "land") {
    const last = flip ? FLIP2.open : leap ? LEAP2.reach : HOP2.reach;
    const hit = smoother(a.k / 0.28);
    c = lerpCh(last, K.impact, hit);
    if (hit >= 1) delete c.up;
    w = 1 - smoother((a.k - 0.3) / 0.7);
  } else return { pose: {}, lift: [0, 0, 0], w: 0 };
  if (a.stage !== "air") delete c.up;
  steady(c, a.stage === "crouch" ? -0.15 : 0);
  const out = body(leanAtHips(c));
  if (flip && spin && a.stage === "air") {
    const h = out.pose.hips ?? [0, 0, 0];
    out.pose.hips = [h[0] + TAU * smoother((a.k - 0.12) / 0.74), h[1], h[2]];
  }
  return { pose: out.pose, lift: out.lift, w };
}

// ── 5a: falling and landing by height (docs/plan/58-the-animation.md phase 5). Off an edge the
// stride goes on a moment, then the legs gather and the arms come up and out, looking down; a long
// fall the arms wheel and the legs pedal; the last of it the legs reach for the ground. Down, by how
// far it fell: an absorb (hips low, knees deep, arms out ahead); a heavy one — a knee low, a hand
// down, the head up — then up; from high at a run, a roll and on.
const FALL: Ch = {
  tL: -0.55,
  kL: 0.95,
  fL: 0.25,
  tR: -0.15,
  kR: 0.75,
  fR: 0.4,
  sL: -1.3,
  sR: -1.1,
  oL: 0.85,
  oR: 0.8,
  eL: -0.45,
  eR: -0.5,
  sx: 0.12,
  dx: 0.3,
  hL: -0.6,
  hR: -0.6,
};
const REACH: Ch = {
  tL: -0.4,
  kL: 0.35,
  fL: 0.2,
  tR: -0.15,
  kR: 0.3,
  fR: 0.25,
  sL: -0.7,
  sR: -0.6,
  oL: 0.65,
  oR: 0.6,
  eL: -0.35,
  eR: -0.35,
  sx: 0.08,
  dx: 0.2,
  hL: -0.6,
  hR: -0.6,
};
/** Falling `t` s (off an edge, or long past a jump's top), `soon` s from the ground (Infinity: not
 *  known), `long` 0…1 how far it's fallen past a long fall's. */
export function fall2Pose(t: number, soon: number, long: number): Moved {
  let c = lerpCh(FALL, REACH, smoother(1 - soon / 0.22));
  if (long > 0) {
    const w = Math.sin(t * 7);
    c = {
      ...c,
      sL: v(c, "sL") + 0.7 * long * w,
      sR: v(c, "sR") - 0.7 * long * w,
      tL: v(c, "tL") + 0.35 * long * w,
      tR: v(c, "tR") - 0.35 * long * w,
    };
  }
  c.up = 0;
  return body(steady(leanAtHips(c)));
}
const ABSORB: Ch = {
  tL: -1.15,
  kL: 1.95,
  fL: 0,
  aL: 0.14,
  tR: -0.8,
  kR: 1.75,
  fR: 0.25,
  aR: 0.12,
  sx: 0.4,
  hx: 0.12,
  sL: -0.6,
  sR: -0.55,
  oL: 0.6,
  oR: 0.55,
  eL: -0.6,
  eR: -0.6,
  dx: -0.15,
  hL: -0.4,
  hR: -0.4,
};
const HERO_LAND: Ch = {
  tL: -1.45,
  kL: 2.05,
  fL: 0,
  aL: 0.12,
  tR: -0.15,
  kR: 2.45,
  fR: 0.95,
  aR: 0.08,
  sx: 0.5,
  hx: 0.25,
  sR: -1.15,
  eR: -0.15,
  oR: 0.2,
  wR: 0.5,
  hR: -1,
  sL: 0.5,
  oL: 0.75,
  eL: -0.7,
  dx: -0.45,
  hL: 0.6,
};
const TUCK: Ch = {
  tL: -2.1,
  kL: 2.4,
  tR: -2.0,
  kR: 2.4,
  fL: 0.6,
  fR: 0.6,
  sL: -1.2,
  sR: -1.2,
  oL: 0.25,
  oR: 0.25,
  eL: -1.6,
  eR: -1.6,
  sx: 0.6,
  nx: 0.5,
  dx: 0.4,
  hL: 1,
  hR: 1,
};
/** Down from a fall `kind` ("absorb", "hard", "roll"), `t` s on: the pose and how much of it's
 *  laid on (0 when it's done). */
export function land2Pose(kind: string, t: number): { m: Moved; w: number } {
  if (kind === "roll") {
    // (round the hips over half a second, low: tucked, over, and out onto the feet running)
    const u = clamp01(t / 0.55);
    const c = { ...TUCK };
    c.up = 0.42 - HIP_H;
    const m = body(steady(c));
    const h = m.pose.hips ?? [0, 0, 0];
    m.pose.hips = [h[0] + TAU * smoother(u), h[1], h[2]];
    return { m, w: smoother(u / 0.12) * (1 - smoother((u - 0.75) / 0.25)) };
  }
  const hard = kind === "hard";
  // (the impact taken in a few hundredths, held, then up — a heavy one longer)
  const [hold, rise] = hard ? [0.3, 0.45] : [0.12, 0.3];
  const c = { ...(hard ? HERO_LAND : ABSORB) };
  const m = body(steady(leanAtHips(c)));
  return { m, w: smoother(t / 0.05) * (1 - smoother((t - hold) / rise)) };
}

// plan 58: the slide again (KH: a baseball slide) — the plant from the run, the drop with the lead
// leg kicked out, then reclined from the hips: that leg along the ground toes up, the other folded
// under, the trailing hand skimming the ground, the other arm up for balance, the head looking
// ahead; out of it a push off the folded leg, back into the run. (The trunk reclines at the hips,
// not the spine: today's waist opens at a bend.)
// (keyed with the left leg out; played mirrored — the right's the one forward as the run plants)
const SLIDING_L: Ch = {
  hx: -1.0,
  tL: -0.62,
  kL: 0.25,
  fL: -0.35,
  aL: 0.08,
  tR: -0.25,
  kR: 2.45,
  fR: 0.9,
  aR: 0.22,
  // (the head's own: the steadying already brings it level as the body reclines)
  sx: 0.05,
  nx: 0,
  dx: -0.08,
  sR: 0.75,
  oR: 0.55,
  eR: -0.15,
  wR: 0.4,
  sL: -1.5,
  oL: 0.75,
  eL: -0.5,
  up: -0.56,
};
const SLIDING = mirror(SLIDING_L);
const SLIDE2: Key[] = [
  {
    at: 0,
    c: {
      tR: -0.6,
      kR: 0.6,
      fR: 0,
      tL: 0.5,
      kL: 1.5,
      fL: 1.1,
      sR: 0.7,
      eR: -1.3,
      sL: -0.9,
      eL: -1.5,
      hx: 0.25,
      up: -0.05,
    },
  },
  {
    at: 0.16,
    c: mirror({
      tL: -1.0,
      kL: 0.5,
      fL: -0.2,
      tR: -0.3,
      kR: 2.0,
      fR: 0.7,
      hx: -0.4,
      sL: -0.9,
      oL: 0.6,
      eL: -0.6,
      sR: 0.6,
      oR: 0.45,
      eR: -0.3,
      up: -0.34,
    }),
  },
  { at: 0.3, c: SLIDING, ease: 1 },
  { at: 0.72, c: { ...SLIDING, hx: -0.92, dx: -0.02, sR: -1.4 }, ease: 1 },
  {
    at: 0.88,
    c: mirror({
      tL: -0.9,
      kL: 1.4,
      fL: 0,
      tR: -0.1,
      kR: 2.0,
      fR: 0.8,
      hx: -0.1,
      sL: -0.7,
      eL: -1.1,
      sR: 0.2,
      eR: -1.0,
      up: -0.25,
    }),
  },
  {
    at: 1,
    c: {
      tL: -0.5,
      kL: 0.4,
      fL: -0.05,
      tR: 0.45,
      kR: 1.3,
      fR: 1.1,
      sL: 0.5,
      eL: -1.4,
      sR: -0.7,
      eR: -1.5,
      hx: 0.25,
      up: -0.04,
    },
  },
];

/** The slide's body at `t` (0..1) through it (plan 58: a baseball slide). */
export function slide2Pose(t: number): Moved {
  // (the hands open: one skims the ground, the other's up for balance)
  return body(steady({ ...sample(SLIDE2, t, false), hL: -0.8, hR: -0.8 }));
}

/** The skid's body, braced as hard as it brakes (`k` 0..1), the trailing leg scrubbing at `t` s. */
export function skid2Pose(k: number, t: number, lead: "L" | "R" = "R"): Moved {
  const c: Ch = { ...SKID };
  // (harder: a little lower, sat back further, the arms further out)
  c.kR = v(c, "kR") + 0.12 * k;
  c.kL = v(c, "kL") + 0.12 * k;
  c.sx = v(c, "sx") - 0.08 * k;
  c.oL = v(c, "oL") + 0.1 * k;
  c.oR = v(c, "oR") + 0.08 * k;
  // the scrub: the back foot chattering over the ground, the arms catching the balance
  const scrub = Math.sin(t * 2 * Math.PI * 13) * 0.025 * k;
  c.kL += scrub;
  const bal = Math.sin(t * 2 * Math.PI * 2.2) * 0.08 * k;
  c.sL = v(c, "sL") + bal;
  c.sR = v(c, "sR") - bal;
  // (on whichever foot was ahead as it began)
  return upright(body(steady(leanAtHips(lead === "L" ? mirror(c) : c))));
}

// ── the gaze (plan 58 G.D): the eyes go first — almost at once, a saccade — and the head comes
// after them on a spring, the neck and a little of the chest taking their share; what the head
// hasn't covered yet, the eyes do. Between looks, small darts (more in the dark); a blink with a big
// shift. Its target, best first: someone looked at (a lock-on), else where it's going (into a
// turn), else the idle's own glance.

export interface GazeIn {
  /** a target, from the body's facing: yaw + to the left, pitch + up (rad) */
  target: { yaw: number; pitch: number } | null;
  /** the idle's glance (idleGlance), standing */
  idle: number;
  /** into a turn, on the move */
  ahead: number;
  tension: number;
}
export interface GazeOut {
  head: number;
  headPitch: number;
  neck: number;
  chest: number;
  /** the eyes' morphs: x + to the person's left, y + up, −1..1 */
  eyes: [number, number];
  blink: number;
}
const EYE_YAW = 0.5; // rad the eyes turn at most, without the head
const EYE_PITCH = 0.35;

export class Gaze {
  private t = 0;
  private eyeY = 0;
  private eyeP = 0;
  private headY = 0;
  private headYv = 0;
  private headP = 0;
  private headPv = 0;
  private dartAt = 0;
  private darts = 0;
  private dartY = 0;
  private dartP = 0;
  private aimWas = 0;
  private blinkTo = 0;
  private blinks = 0;
  private blinkAt = 1.5;
  readonly out: GazeOut = { head: 0, headPitch: 0, neck: 0, chest: 0, eyes: [0, 0], blink: 0 };
  constructor(private readonly seed = 0) {}

  update(dt: number, g: GazeIn): GazeOut {
    const T = clamp01(g.tension);
    const h = Math.min(Math.max(dt, 0), 1 / 30);
    this.t += h;
    const aimY = Math.max(-1.6, Math.min(1.6, g.target ? g.target.yaw : g.idle + g.ahead));
    const aimP = g.target ? Math.max(-0.5, Math.min(0.5, g.target.pitch)) : 0;
    // darts: the eyes' own small moves, held a moment each
    if (this.t > this.dartAt) {
      this.darts++;
      this.dartAt = this.t + lerp(1.8, 0.6, T) * (0.4 + hash(this.darts, this.seed));
      this.dartY = (hash(this.darts + 900, this.seed) - 0.5) * lerp(0.14, 0.3, T);
      this.dartP = (hash(this.darts + 1900, this.seed) - 0.5) * 0.1;
    }
    // a big shift: a blink with it; else every few seconds (now and then twice), quicker in the dark
    if (Math.abs(aimY - this.aimWas) > 0.4) this.blinkTo = this.t + 0.13;
    if (this.t > this.blinkAt) {
      this.blinks++;
      this.blinkTo = this.t + 0.11;
      const twice = hash(this.blinks + 3000, this.seed) < 0.18;
      this.blinkAt =
        this.t + (twice ? 0.26 : lerp(2.4, 1.6, T) + lerp(3.6, 2.2, T) * hash(this.blinks + 4000, this.seed));
    }
    this.aimWas = aimY;
    // the eyes: there almost at once
    const k = Math.min(1, h * 32);
    this.eyeY += (aimY + this.dartY - this.eyeY) * k;
    this.eyeP += (aimP + this.dartP - this.eyeP) * k;
    // the head: after them, a spring (taking most of the turn; the eyes keep the last of it)
    const n = 3;
    const s = h / n;
    for (let i = 0; i < n; i++) {
      this.headYv += (81 * (aimY * 0.88 - this.headY) - 2 * 0.85 * 9 * this.headYv) * s;
      this.headY += this.headYv * s;
      this.headPv += (81 * (aimP * 0.8 - this.headP) - 2 * 0.85 * 9 * this.headPv) * s;
      this.headP += this.headPv * s;
    }
    const o = this.out;
    o.head = this.headY * 0.62;
    o.neck = this.headY * 0.25;
    o.chest = this.headY * 0.13;
    o.headPitch = this.headP;
    o.eyes = [
      Math.max(-1, Math.min(1, (this.eyeY - this.headY) / EYE_YAW)),
      Math.max(-1, Math.min(1, (this.eyeP - this.headP) / EYE_PITCH)),
    ];
    o.blink = this.t < this.blinkTo ? 1 : 0;
    return o;
  }
}
