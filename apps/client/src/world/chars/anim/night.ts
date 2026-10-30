import { body, type Ch, type Moved, smoother, steady } from "../moves";
import { HANDS, handPose, type JointName, type Pose } from "../rig";

// Plan 58 phase 7 (docs/plan/58-the-animation.md): the dark, after Alan Wake 2 — the torch held out
// along the look, shaking with the fear; the gun's stance breathing, kicked by each shot, the reload's
// hands going to the pocket and back; struck from each side (the body thrown from the blow, the arms
// up to guard, a stagger) and startled; down on hands and knees crawling, the hands and knees set on
// the ground and held there; kneeling by someone down, a hand on their back; the fear's hunch. Loaded
// with the hero's (`loadHero`), a chunk of its own. Hands as targets in her own space (x her left, y
// up from her feet, z ahead) for the model to reach last.

/** The bundle's mark (tools/budget.mjs finds it by this). */
export const NIGHT_CHUNK = "yutopia-night";

export interface Hand {
  at: [number, number, number];
  w: number;
  pole?: [number, number, number];
}
export type Hands = { L?: Hand; R?: Hand };

const TAU = Math.PI * 2;
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
// a shake: three sines that never line up, ~6–11 Hz (a hand that can't hold still)
const shake = (t: number, s: number) =>
  (Math.sin(t * 37.1 + s) + 0.7 * Math.sin(t * 53.3 + s * 2.1) + 0.5 * Math.sin(t * 71.9 + s * 3.7)) / 2.2;
const ELBOW_DOWN: [number, number, number] = [-0.6, -1, -0.45];

/** Fear's share (0..1) from the mood: nothing by day, all of it in the dark. */
export const fearOf = (tension: number) => smoother((tension - 0.35) / 0.6);

/** The torch held out (not aiming): in the left fist at the chest, out along the look — `yaw` + to her
 *  left, `pitch` + up (rad, off her facing) — swaying with the breath, shaking with the `fear`. */
export function torch2(
  yaw: number,
  pitch: number,
  t: number,
  fear: number,
  breath: number,
): { pose: Pose; hands: Hands } {
  const y = Math.max(-1.1, Math.min(1.1, yaw));
  const p = Math.max(-0.7, Math.min(0.6, pitch - 0.18));
  const d = 0.4 + 0.06 * Math.cos(y);
  const sh = 0.012 * fear;
  const at: [number, number, number] = [
    0.09 + Math.sin(y) * Math.cos(p) * d + sh * shake(t, 1),
    1.2 + Math.sin(p) * d + 0.006 * Math.sin(TAU * breath) + sh * shake(t, 4),
    0.04 + Math.cos(y) * Math.cos(p) * d,
  ];
  // (the chest and the head turned after it: the beam leads, the body follows a little; hunched in
  // the fear, the other arm in close)
  const c: Ch = {
    sy: 0.25 * y,
    cx: 0.08 * fear,
    sx: 0.05 * fear,
    sR: 0.05,
    oR: 0.06 - 0.04 * fear,
    eR: -0.35 - 0.35 * fear,
  };
  const m = body(steady(c));
  const pose: Pose = {};
  for (const j of ["spine", "chest", "shoulderR", "elbowR"] as JointName[]) if (m.pose[j]) pose[j] = m.pose[j];
  Object.assign(pose, handPose(1, HANDS.grip), handPose(-1, fear > 0.5 ? HANDS.fist : HANDS.relaxed));
  pose.wristL = [0.1 - 0.3 * p, 0, -0.05];
  return { pose, hands: { L: { at, w: 1, pole: ELBOW_DOWN } } };
}

/** The aim's own life over the stance (moves.ts aimPose): the breath in the arms, the fear's shake,
 *  and a shot's `kick` (0..1, as it goes off and fades): the arms thrown up, the trunk rocked back.
 *  Added to the pose. */
export function aim2(pose: Pose, t: number, fear: number, kick: number, breath: number): Pose {
  const out: Pose = { ...pose };
  const add = (j: JointName, dx: number, dy = 0, dz = 0) => {
    const r = out[j] ?? [0, 0, 0];
    out[j] = [r[0] + dx, r[1] + dy, r[2] + dz];
  };
  const b = 0.01 * Math.sin(TAU * breath);
  const s = 0.012 * fear;
  for (const S of ["L", "R"] as const) {
    add(`shoulder${S}`, b - 0.32 * kick + s * shake(t, S === "L" ? 1 : 2), s * shake(t, 5));
    add(`elbow${S}`, -0.22 * kick);
  }
  add("wristR", -0.35 * kick);
  add("spine", -0.06 * kick);
  add("chest", -0.05 * kick);
  add("head", -0.05 * kick);
  return out;
}

/** Reloading (not aiming), `t` s into it: the gun up before the chest tipped open, the head down at
 *  it, the left hand to the pocket at the hip for rounds and back to the gun, again and again. */
export function reload2(t: number, fear: number): { pose: Pose; hands: Hands } {
  const u = (t % 0.95) / 0.95;
  // (at the gun 0–0.25, down to the pocket by 0.5, in it, back up by 0.9)
  const away = smoother((u - 0.2) / 0.25) * (1 - smoother((u - 0.65) / 0.25));
  const gun: [number, number, number] = [-0.04, 1.12, 0.3];
  const pocket: [number, number, number] = [0.19, 0.92, 0.04];
  const at: [number, number, number] = [
    lerp(gun[0] + 0.06, pocket[0], away),
    lerp(gun[1] + 0.02, pocket[1], away),
    lerp(gun[2], pocket[2], away),
  ];
  const c: Ch = { dx: 0.35 - 0.15 * away, nx: 0.12, sx: 0.06 + 0.04 * fear, dy: 0.25 * away * (u > 0.4 ? 1 : 0) };
  const m = body(steady(c));
  const pose: Pose = {};
  for (const j of ["spine", "chest", "neck", "head"] as JointName[]) if (m.pose[j]) pose[j] = m.pose[j];
  Object.assign(pose, handPose(1, away > 0.6 ? HANDS.loose : HANDS.grip), handPose(-1, HANDS.grip));
  pose.wristR = [0.5, 0, 0.2];
  return {
    pose,
    hands: { R: { at: gun, w: 1, pole: ELBOW_DOWN }, L: { at, w: 1, pole: ELBOW_DOWN } },
  };
}

/** Struck (or startled: a small `k`) from `from` (rad off her facing: 0 ahead, + her left), `t` s
 *  after: turns added to the pose — thrown from the blow (back from ahead, forward from behind,
 *  bent and twisted away from a side), the knees giving — the arms up to guard over it (`guard`,
 *  its weight), and the hips shoved away. */
export function hit2(
  from: number,
  t: number,
  k: number,
): {
  add: Partial<Record<JointName, [number, number, number]>>;
  guard: Pose;
  w: number;
  lift: [number, number, number];
} {
  // (the blow in a few hundredths, held a moment, back over half a second)
  const w = k * smoother(t / 0.06) * (1 - smoother((t - 0.12) / 0.55));
  // (back from ahead in full; forward from behind less — a shove, not a bow)
  const fb = Math.cos(from) * (Math.cos(from) < 0 ? 0.5 : 1);
  const lr = Math.sin(from);
  // (a little after it, the body catches itself: a lag on the trunk, the head snapped further)
  const lag = k * smoother((t - 0.03) / 0.08) * (1 - smoother((t - 0.18) / 0.55));
  const add: Partial<Record<JointName, [number, number, number]>> = {
    hips: [-0.06 * fb * w, 0.12 * lr * w, -0.05 * lr * w],
    spine: [-0.22 * fb * lag, 0.2 * lr * lag, -0.12 * lr * lag],
    chest: [-0.18 * fb * lag, 0.15 * lr * lag, -0.1 * lr * lag],
    neck: [-0.15 * fb * lag, 0, 0],
    // (the head snapped back on its neck, whichever way the body goes)
    head: [-0.2 * Math.abs(Math.cos(from)) * lag, 0.25 * lr * lag, 0.12 * lr * lag],
    thighL: [-0.12 * w, 0, 0],
    thighR: [-0.12 * w, 0, 0],
    kneeL: [0.3 * w, 0, 0],
    kneeR: [0.3 * w, 0, 0],
  };
  // (the arms up before the face and the chest, the side it came from higher, the hands open)
  const g: Ch = {
    sL: -1.25 - 0.3 * Math.max(0, lr),
    oL: 0.15,
    eL: -1.9,
    sR: -1.25 - 0.3 * Math.max(0, -lr),
    oR: 0.15,
    eR: -1.9,
    wL: 0.4,
    wR: 0.4,
  };
  const m = body(g);
  const guard: Pose = {};
  for (const j of ["shoulderL", "shoulderR", "elbowL", "elbowR", "wristL", "wristR"] as JointName[])
    guard[j] = m.pose[j];
  Object.assign(guard, handPose(1, HANDS.open), handPose(-1, HANDS.open));
  const gw = k * smoother((t - 0.02) / 0.1) * (1 - smoother((t - 0.3) / 0.5));
  return { add, guard, w: Math.min(1, gw), lift: [-0.07 * lr * w, -0.05 * w, -0.08 * fb * w] };
}

// ── down: on hands and knees (docs/plan/30-the-dark.md D7), crawling — each hand and knee set down
// and held where it is while the body goes over it, the right hand with the left knee; the head hung
const HIPS_UP = 0.46; // the hips over the ground, on the knees
const STRIDE = 0.42; // m a cycle
/** Crawling, `phase` 0..1 a cycle (by the ground covered; still at 0), `t` s (the breath): the body
 *  and its hands on the ground. */
export function crawl2(phase: number, t: number, moving: boolean): { m: Moved; hands: Hands } {
  const hx = 1.12;
  const c: Ch = { hx, up: HIPS_UP - 0.765, sx: 0.08 + 0.02 * Math.sin(t * 3), nx: -0.35, dx: -0.4 };
  // (a limb's place along its step: on the ground back through the stance, lifted and forward in the swing)
  const along = (ph: number) => {
    const u = ((ph % 1) + 1) % 1;
    const st = 0.65;
    if (!moving) return { z: 0, up: 0 };
    // (down, it goes back by as much as the body goes on over it: held where it is)
    const L = STRIDE * st;
    if (u < st) return { z: L * (0.5 - u / st), up: 0 };
    const v = (u - st) / (1 - st);
    // (up, it eases from where it was to where it'll go on the ground — still as it lifts and lands —
    // while the body goes on under it)
    return { z: -L / 2 + STRIDE * smoother(v) - STRIDE * (1 - st) * v, up: 0.06 * Math.sin(Math.PI * v) };
  };
  // the knees: under the hips (the left with the right hand), the shins flat behind
  for (const [S, ph] of [
    ["L", phase],
    ["R", phase + 0.5],
  ] as const) {
    const a = along(ph);
    const th = Math.atan2(a.z, HIPS_UP - 0.05 - a.up);
    c[`t${S}`] = -th - hx;
    c[`k${S}`] = Math.PI / 2 + th - 0.1;
    c[`f${S}`] = Math.PI / 2 - hx - 0.25;
  }
  // (the weight from side to side over the hand and knee that are down)
  c.hz = 0.04 * Math.sin(TAU * phase) * (moving ? 1 : 0);
  c.sz = -0.05 * Math.sin(TAU * phase) * (moving ? 1 : 0);
  const m = body(c);
  const hand = (S: 1 | -1, ph: number): Hand => {
    const a = along(ph);
    return { at: [S * 0.17, 0.035 + a.up, 0.55 + a.z], w: 1, pole: [-0.4, 0.3, -1] };
  };
  Object.assign(m.pose, handPose(1, HANDS.open), handPose(-1, HANDS.open));
  m.pose.wristL = [0.9, 0, 0];
  m.pose.wristR = [0.9, 0, 0];
  return { m, hands: { R: hand(-1, phase), L: hand(1, phase + 0.5) } };
}

/** Kneeling by someone down: on the right knee, a hand on their back (shaking them a little: "hey"),
 *  the other on her own knee; looking round over them, breathing hard in the fear. */
export function kneel2(t: number, fear: number): { m: Moved; hands: Hands } {
  const look = Math.sin(t * 0.7) * Math.sin(t * 0.31 + 1);
  const c: Ch = {
    up: -0.27,
    tL: -1.45,
    kL: 1.6,
    fL: 0.15,
    tR: 0.1,
    kR: 1.95,
    fR: 1.2,
    aL: 0.08,
    aR: 0.06,
    sx: 0.35 + 0.03 * Math.sin(t * (2 + 1.5 * fear)),
    dx: 0.15,
    dy: 0.55 * look,
    sy: 0.1 * look,
  };
  const m = body(steady(c));
  Object.assign(m.pose, handPose(1, HANDS.relaxed), handPose(-1, HANDS.open));
  const pat = 0.02 * Math.sin(t * 7) * (Math.sin(t * 0.9) > 0.3 ? 1 : 0);
  return {
    m,
    hands: {
      R: { at: [-0.08 + pat, 0.36, 0.62], w: 1, pole: ELBOW_DOWN },
      L: { at: [0.13, 0.5, 0.3], w: 0.85, pole: [-0.8, -0.5, 0] },
    },
  };
}

/** The fear's hunch on the move (added): the chest in, the head down a little, the arms in close. */
export function hunch(pose: Pose, fear: number): Pose {
  if (fear <= 0.01) return pose;
  const out: Pose = { ...pose };
  const add = (j: JointName, dx: number, dy = 0, dz = 0) => {
    const r = out[j] ?? [0, 0, 0];
    out[j] = [r[0] + dx, r[1] + dy, r[2] + dz];
  };
  add("chest", 0.08 * fear);
  add("neck", 0.06 * fear);
  add("head", -0.06 * fear);
  add("shoulderL", 0, 0, -0.05 * fear);
  add("shoulderR", 0, 0, 0.05 * fear);
  add("elbowL", -0.15 * fear);
  add("elbowR", -0.15 * fear);
  return out;
}

// ── phase 8: the shadowed, their own (docs/plan/30-the-dark.md D5) — Alan Wake 2's Taken: wrong in
// how they move. Hunched, the head lolling, the arms hung ahead clawed; a twitch now and then; and
// their time catches — the body held a beat, then on (`glitch`). The legs a heavy limp (the walk's,
// hurt) when they go; their own when they fight.
const hash = (n: number) => {
  const x = Math.sin(n * 127.1) * 43758.5453;
  return x - Math.floor(x);
};
/** Their time, caught now and then: held for a beat (~0.1 s, every 1–2 s, each its own), then on. */
export function glitch(t: number, seed: number): number {
  const per = 1.1 + 0.9 * hash(seed + 1);
  const hold = 0.08 + 0.07 * hash(seed + 2);
  const u = (t + seed * 3.7) % per;
  return u < hold ? t - u : t;
}
// (a hand clawed: the fingers hooked, the thumb out)
const CLAW = { fingers: 0.95, index: 0.75, thumb: -0.2 };
export type ShadeKind = "lurch" | "windup" | "strike" | "recoil" | "exposed" | "lurk";
/** One of the shadowed, `kind` `t` s into it (`seed` its own): its body — all of it (`legs`) when it
 *  stands to fight or reels, else the top over its walk; `from`: where a beam on it comes from (rad
 *  off its facing, + its left). */
export function shade2(
  kind: ShadeKind,
  t0: number,
  seed: number,
  moving: boolean,
  from = 0,
): { m: Moved; legs: boolean } {
  const t = glitch(t0, seed);
  const ph = t * 0.9 + seed * 7.13;
  // (a twitch: the head snapped round, a shoulder jerked, gone)
  const tw = Math.max(0, Math.sin(ph * 2.7) * Math.sin(ph * 1.3) - 0.8) * 5;
  const side = seed % 2 ? 1 : -1;
  let c: Ch;
  let legs = !moving;
  switch (kind) {
    case "windup": {
      // reared back, the head cocked hard over, the arms up over it clawed, shuddering; the weight back
      const k = smoother(t / 0.5);
      const sh = 0.05 * Math.sin(t * 41 + seed) * k;
      c = {
        sL: -0.4 - 2.25 * k + sh,
        sR: -0.4 - 2.25 * k - sh,
        eL: -0.3 - 0.75 * k,
        eR: -0.3 - 0.75 * k,
        oL: 0.15 + 0.35 * k,
        oR: 0.15 + 0.35 * k,
        sx: 0.35 - 0.6 * k,
        cx: -0.1 * k,
        dz: 0.5 * k * side,
        dx: -0.2 * k,
        tL: -0.35,
        kL: 0.35,
        tR: 0.35,
        kR: 0.55,
        fR: 0.5,
        aL: 0.12,
        aR: 0.12,
        up: -0.08 * k,
      };
      legs = true;
      break;
    }
    case "strike": {
      // a lunge: the front foot in, the trunk thrown over it, the arms slashing down and through
      const k = smoother(t / 0.13);
      const f = smoother((t - 0.1) / 0.25);
      c = {
        sL: -2.65 + 2.45 * k + 0.2 * f,
        sR: -2.65 + 2.6 * k + 0.25 * f,
        eL: -1.05 + 0.75 * k,
        eR: -1.05 + 0.8 * k,
        oL: 0.5 - 0.3 * k,
        oR: 0.5 - 0.35 * k,
        sx: -0.25 + 1.0 * k,
        sy: 0.25 * k * side,
        dx: 0.25 * k,
        dz: 0.5 * side * (1 - k),
        tL: -0.35 - 0.45 * k,
        kL: 0.35 + 0.35 * k,
        tR: 0.35 + 0.15 * k,
        kR: 0.55 - 0.2 * k,
        fR: 0.5 + 0.4 * k,
        aL: 0.12,
        aR: 0.12,
        up: -0.08 - 0.08 * k,
        fw: 0.12 * k,
      };
      legs = true;
      break;
    }
    case "recoil": {
      // the arm on the beam's side over the face, the body wrenched away from it, reeling back, shaking
      const s = Math.sin(from) >= 0 ? 1 : -1;
      const sh = 0.06 * Math.sin(t * 47 + seed);
      const near = s > 0 ? "L" : "R";
      const far = s > 0 ? "R" : "L";
      c = {
        [`s${near}`]: -1.95,
        [`e${near}`]: -2.1,
        [`o${near}`]: -0.1,
        [`w${near}`]: 0.3,
        [`s${far}`]: 0.5,
        [`o${far}`]: 0.45,
        [`e${far}`]: -0.6,
        sx: -0.25 + sh,
        sy: -0.35 * s,
        sz: -0.12 * s,
        dy: -0.6 * s,
        dx: 0.15,
        tL: -0.25,
        kL: 0.45,
        tR: 0.2,
        kR: 0.45,
        aL: 0.1,
        aR: 0.1,
        up: -0.06,
        fw: -0.06 - 0.03 * Math.sin(t * 5),
        x: -0.04 * s,
      };
      legs = !moving;
      break;
    }
    case "exposed": {
      // stunned, bare: swaying where it stands, the arms hung, the head lolling, the knees going
      const sw = Math.sin(t * 1.3 + seed);
      c = {
        sL: -0.15 + 0.1 * sw,
        sR: -0.2 - 0.1 * sw,
        eL: -0.35,
        eR: -0.3,
        oL: 0.05,
        oR: 0.05,
        sx: 0.4,
        cx: 0.1,
        sz: 0.1 * sw,
        dx: 0.45,
        dz: 0.35 * sw + 0.3 * tw * side,
        dy: 0.4 * tw * side,
        tL: -0.2,
        kL: 0.4 + 0.1 * sw,
        tR: -0.15,
        kR: 0.35 - 0.1 * sw,
        aL: 0.12,
        aR: 0.12,
        up: -0.06,
        x: 0.04 * sw,
      };
      legs = !moving;
      break;
    }
    case "lurk": {
      // asleep in a nest by day: folded over the knees, the arms round them, a slow breath, a shiver
      const sv = Math.max(0, Math.sin(ph * 3.3) * Math.sin(ph * 1.7) - 0.9) * 4;
      c = {
        up: -0.5,
        tL: -1.95,
        kL: 2.35,
        fL: 0.45,
        tR: -1.85,
        kR: 2.3,
        fR: 0.5,
        aL: 0.12,
        aR: 0.12,
        sx: 0.78 + 0.04 * Math.sin(ph * 2),
        dx: 0.5,
        dz: 0.05 * sv * Math.sin(t * 40),
        sL: -0.95,
        sR: -0.9,
        eL: -1.7,
        eR: -1.65,
        oL: 0.3,
        oR: 0.3,
      };
      legs = true;
      break;
    }
    default: {
      // the lurch: hunched over, the arms hung ahead swinging late, clawed; the head lolling and
      // dipping, twitching round; stood, crooked on one leg, swaying
      const sw = Math.sin(ph * 0.7);
      c = {
        sL: -0.45 + 0.12 * Math.sin(ph * 3.1),
        sR: -0.4 + 0.12 * Math.sin(ph * 3.1 + 2),
        eL: -0.35,
        eR: -0.3,
        oL: 0.12,
        oR: 0.12,
        sx: 0.42,
        cx: 0.12,
        sz: 0.08 * sw,
        dx: 0.38 + 0.1 * Math.sin(ph * 1.9),
        dz: 0.3 * sw + 0.45 * tw * side,
        dy: 0.6 * tw * side,
        tL: -0.1,
        kL: 0.15,
        tR: 0.05,
        kR: 0.45,
        fR: 0.3,
        aL: 0.12,
        aR: 0.16,
        hz: 0.05 * side,
        up: -0.04,
      };
    }
  }
  const m = body(steady(c, 0.1));
  Object.assign(
    m.pose,
    handPose(1, kind === "lurk" ? HANDS.relaxed : CLAW),
    handPose(-1, kind === "lurk" ? HANDS.relaxed : CLAW),
  );
  // (steadying keeps a living head level: theirs isn't — it lolls with the body)
  if (kind !== "lurk") {
    const h = m.pose.head ?? [0, 0, 0];
    m.pose.head = [h[0] + 0.5 * v(c, "sx"), h[1], h[2]];
  }
  return { m, legs };
}
const v = (c: Ch, k: string) => c[k] ?? 0;

/** Shot down, `t` s in: thrown back by the shot, the arms flung up into the light, reeling back a few
 *  steps clawing at the air — then (with a world for it) limp on the ragdoll from `LIMP` s, else the
 *  old fall (moves.ts deathPose) from there. */
export const LIMP = 0.55;
export function shadeShot(t: number, seed: number): Moved {
  const k = smoother(t / 0.1);
  const r = smoother((t - 0.1) / 0.45);
  const side = seed % 2 ? 1 : -1;
  const c: Ch = {
    sL: -2.2 * k + 0.6 * r * Math.sin(t * 13),
    sR: -2.4 * k - 0.5 * r * Math.sin(t * 11),
    oL: 0.6 * k,
    oR: 0.7 * k,
    eL: -0.5 - 0.6 * r,
    eR: -0.4 - 0.5 * r,
    sx: -0.45 * k + 0.25 * r,
    cx: -0.1 * k,
    dx: -0.6 * k + 0.3 * r,
    dz: 0.3 * side * r,
    tL: -0.1 + 0.4 * Math.sin(t * 9) * r,
    kL: 0.3 + 0.3 * r,
    tR: 0.25 - 0.4 * Math.sin(t * 9) * r,
    kR: 0.3 + 0.2 * r,
    hx: -0.2 * k + 0.15 * r,
    up: -0.04 - 0.1 * r,
    fw: -0.25 * k - 0.35 * r,
  };
  const m = body(c);
  Object.assign(m.pose, handPose(1, CLAW), handPose(-1, CLAW));
  return m;
}
