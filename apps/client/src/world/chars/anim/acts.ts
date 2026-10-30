import { ANKLE, body, type Ch, clamp01, HIP_H, type Key, SHIN, sample, smoother, steady, THIGH } from "../moves";
import { HANDS, type HandShape, handPose, type Pose } from "../rig";

// (a pulse: the sine's upper half, squared — it starts and ends at rest, no corner where it sets off:
// plan 58 10, the census's pops)
const bump = (x: number) => {
  const s = Math.sin(x);
  return s > 0 ? s * s : 0;
};

// Plan 58 phase 6 (docs/plan/58-the-animation.md): the everyday — sitting down, sat, typing, getting
// up; what the hands hold (a mug, a sip, the phone's every way); busy at things; together (the
// hands meeting where the two of them meet); the emotes. Alan Wake 2's weight for the living, KH3's
// snap for the games and the emotes. Loaded with the hero's (`loadHero`), a chunk of its own.
// Each gives a pose (only the joints it moves, laid over the stand or the gait), and where its hands
// go in the body's own space (x its left, y up from its feet, z ahead) for the model to reach last.

/** The bundle's mark (tools/budget.mjs finds it by this). */
export const ACTS_CHUNK = "yutopia-acts";

export interface Hand {
  at: [number, number, number];
  w: number;
  pole?: [number, number, number];
}
export type Hands = { L?: Hand; R?: Hand };
export interface Act {
  pose: Pose;
  lift?: [number, number, number];
  hands?: Hands | null;
  blink?: number;
  talk?: number;
  /** sitting: how far down onto the seat (0 standing … 1 sat) */
  settle?: number;
  /** the right hand up at the mouth (0..1): the body's own reach takes it there */
  sip?: number;
}

const TAU = Math.PI * 2;
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const win = (u: number, a: number, b: number, e = 0.08) => smoother((u - a) / e) * (1 - smoother((u - b) / e));
// a seeded number in 0..1 for the n-th of something
const hash = (n: number, s: number) => {
  const x = Math.sin(n * 127.1 + s * 311.7) * 43758.5453;
  return x - Math.floor(x);
};
// a cheap smooth wobble
const wob = (t: number, s: number) => (Math.sin(t * 0.73 + s * 5.1) + 0.6 * Math.sin(t * 1.37 + s * 2.3)) / 1.6;
const shape = (side: 1 | -1, h: HandShape) => handPose(side, h);
const mixH = (a: HandShape, b: HandShape, u: number): HandShape => ({
  fingers: lerp(a.fingers, b.fingers, u),
  index: lerp(a.index, b.index, u),
  thumb: lerp(a.thumb, b.thumb, u),
});
// (the joints above the hips: a pose laid over the legs a stand or a gait has)
const UP_JOINTS = ["spine", "chest", "neck", "head", "shoulderL", "shoulderR", "elbowL", "elbowR", "wristL", "wristR"];
function upper(c: Ch): Pose {
  const m = body(steady(c));
  const p: Pose = {};
  for (const j of UP_JOINTS) if (m.pose[j as keyof Pose]) p[j as keyof Pose] = m.pose[j as keyof Pose];
  for (const k of Object.keys(m.pose))
    if (/^(fingers|index|thumb)/.test(k)) p[k as keyof Pose] = m.pose[k as keyof Pose];
  return p;
}
const ELBOW_DOWN: [number, number, number] = [-0.6, -1, -0.45];
const ELBOW_OUT: [number, number, number] = [-1, -0.4, -0.2];

// ── sitting (6a): the legs solved so the feet stay planted while the hips go down onto the seat and
// back (the view lowers the hips by `settle` times the seat's drop: `drop` here, the same, m)
/** A leg's thigh and knee (rad) from the hip's joint to the ankle, `dz` ahead and `dy` up (m). */
function leg(dz: number, dy: number): [number, number] {
  const d = Math.min(THIGH + SHIN - 1e-4, Math.max(0.12, Math.hypot(dz, dy)));
  const phi = Math.atan2(dz, -dy);
  const a = Math.acos(clamp01((THIGH * THIGH + d * d - SHIN * SHIN) / (2 * THIGH * d)));
  const k = Math.PI - Math.acos(Math.max(-1, Math.min(1, (THIGH * THIGH + SHIN * SHIN - d * d) / (2 * THIGH * SHIN))));
  return [-(phi + a), k];
}
// where each foot is sat (ahead, out): both flat, one out ahead, the ankles crossed
const FEET: [number, number, number, number][] = [
  [0.4, 0.11, 0.4, 0.11],
  [0.52, 0.12, 0.38, 0.1],
  [0.56, -0.03, 0.56, 0.04],
  [0.36, 0.13, 0.48, 0.13],
];
/** Sitting: `u` 0→1 down onto the seat (or 1→0 getting up, `rising`), then sat `t` s (its life: the
 *  breath, the weight, the feet moved now and then, the hands on the lap or typing). */
export function sit2(u: number, rising: boolean, t: number, typing: boolean, drop: number, seed: number): Act {
  // (down: the trunk forward over the feet as the hips go back and down, then back upright and a
  // settle; up: forward again, the hands pushing on the knees, up through the legs)
  const s = rising ? smoother(clamp01((1 - u) / 0.75)) : smoother(clamp01((u - 0.12) / 0.7));
  const lean = rising ? 0.62 * win(1 - u, 0.05, 0.75, 0.2) : 0.5 * win(u, 0.1, 0.62, 0.22);
  const sat = clamp01(rising ? 0 : (u - 0.85) / 0.15);
  // the feet: from under the hips out to where they sit (one foot then the other), or back in
  const n = Math.floor(t / 7 + hash(1, seed) * 3);
  const f0 = FEET[n % FEET.length];
  const f1 = FEET[(n + 1) % FEET.length];
  const sw = sat * smoother((((t / 7 + hash(1, seed) * 3) % 1) - 0.85) / 0.15);
  const F = f0.map((x, i) => lerp(x, f1[i], sw));
  const out = rising ? 1 - smoother(clamp01((1 - u - 0.45) / 0.45)) : smoother(clamp01((u - 0.05) / 0.5));
  const fz = [F[0] * out, F[2] * out];
  const fx = [lerp(0.09, F[1], out), lerp(0.09, F[3], out)];
  // (each foot lifted as it moves: on the way in and out, and moving between the ways it sits)
  const step = (k: number) => 0.035 * Math.sin(Math.PI * clamp01(k));
  const lifts = [
    step(rising ? (0.55 - u) / 0.4 : (u - 0.05) / 0.25) + step(sw * 2),
    step(rising ? (0.75 - u) / 0.4 : (u - 0.25) / 0.25) + step(sw * 2 - 1),
  ];
  const hip = HIP_H + drop * s;
  const hx = 0.12 * lean;
  const c: Ch = { hx, sx: lean * 0.8 + 0.06 * sat, up: 0 };
  (["L", "R"] as const).forEach((S, i) => {
    const [th, k] = leg(fz[i], ANKLE + lifts[i] - hip);
    c[`t${S}`] = th - hx;
    c[`k${S}`] = k;
    c[`f${S}`] = -hx;
    // (out to where the foot is: the hip's joint 7.8 cm out)
    c[`a${S}`] = Math.atan2(fx[i] - 0.078, 0.5) * 0.6;
  });
  // the life: the breath, the weight from side to side, a glance
  const br = Math.sin(t * 2.0);
  c.sx += 0.015 * br * sat;
  c.hz = 0.03 * wob(t * 0.4, seed) * sat;
  c.dy = 0.25 * wob(t * 0.31, seed + 2) * sat * (typing ? 0.3 : 1);
  c.dx = (typing ? 0.22 : 0.05) * sat;
  // the arms: out a little going down (for the balance), the hands on the knees getting up
  c.sL = c.sR = -0.35 - 0.4 * lean;
  c.eL = c.eR = -0.5 - 0.4 * lean;
  c.oL = c.oR = 0.15;
  const m = body(c);
  const p = m.pose;
  // the hands: on the thighs sat, on the keys typing, on the knees pushing up
  const knee = (S: 1 | -1, i: number) => {
    const [th] = leg(fz[i], ANKLE - hip);
    const a = th + hx;
    return [S * 0.1, hip - THIGH * Math.cos(a) + 0.06, -THIGH * Math.sin(a) - 0.04] as [number, number, number];
  };
  let hands: Hands | null = null;
  const push = rising ? win(u, 0.3, 0.95, 0.12) : win(u, 0.35, 0.85, 0.12);
  if (push > 0.01)
    hands = { L: { at: knee(1, 0), w: push, pole: ELBOW_OUT }, R: { at: knee(-1, 1), w: push, pole: ELBOW_OUT } };
  else if (sat > 0) {
    const lap = (S: 1 | -1, i: number): [number, number, number] => {
      const k = knee(S, i);
      return [S * 0.13, hip + 0.13, k[2] * 0.55];
    };
    if (typing) {
      // (in bursts, a pause to read; the fingers going)
      const on = Math.sin(t * 0.9 + seed) > -0.3 ? 1 : 0;
      const key = (S: 1 | -1, ph: number): [number, number, number] => [
        S * 0.13 + 0.012 * Math.sin(t * 7 + ph) * on,
        hip + 0.31 + 0.01 * bump(t * 17 + ph) * on,
        0.44 + 0.015 * Math.sin(t * 3.1 + ph) * on,
      ];
      hands = { L: { at: key(1, 0), w: sat, pole: ELBOW_DOWN }, R: { at: key(-1, 1.7), w: sat, pole: ELBOW_DOWN } };
      for (const [S, side, ph] of [
        ["L", 1, 0],
        ["R", -1, 1.7],
      ] as const) {
        const tap = on * bump(t * 19 + ph);
        Object.assign(
          p,
          shape(side, {
            fingers: 0.55 + 0.35 * tap,
            index: 0.4 + 0.5 * bump(t * 23 + ph * 2) * on,
            thumb: 0.3,
          }),
        );
        p[`wrist${S}`] = [0.12, 0, 0];
      }
    } else {
      hands = { L: { at: lap(1, 0), w: sat, pole: ELBOW_DOWN }, R: { at: lap(-1, 1), w: sat, pole: ELBOW_DOWN } };
      Object.assign(p, shape(1, HANDS.relaxed), shape(-1, HANDS.relaxed));
      p.wristL = [0.35, 0, 0];
      p.wristR = [0.35, 0, 0];
    }
  }
  return { pose: p, lift: m.lift, hands, settle: s };
}

/** In a car, sat behind the wheel or beside it: reclined, the legs out to the pedals; the breath, a
 *  glance out of the side now and then (the driver's hands go on the rim afterwards: reachTo). */
export function car2(driver: boolean, t: number, seed: number): Act {
  const c: Ch = {
    hx: -0.18,
    sx: driver ? 0.02 : -0.06,
    tL: -1.45,
    kL: driver ? 1.05 : 1.3,
    fL: driver ? -0.1 : 0.1,
    tR: -1.45,
    kR: driver ? 1.0 : 1.3,
    fR: driver ? -0.2 : 0.1,
    sL: driver ? -0.95 : -0.45,
    sR: driver ? -0.95 : -0.45,
    eL: driver ? -0.6 : -1.05,
    eR: driver ? -0.6 : -1.05,
    up: 0,
  };
  c.sx += 0.012 * Math.sin(t * 1.9);
  c.dy = (driver ? 0.35 : 0.6) * Math.max(0, wob(t * 0.25, seed)) ** 2 * Math.sign(wob(t * 0.13, seed + 1));
  const m = body(c);
  return { pose: m.pose, lift: m.lift };
}

// ── what the hands hold (6b): a mug at the waist, a sip — up to the mouth, the head back, the eyes
// shut a moment — and the phone, every way it's used
/** A mug held, `sip` 0..1 up at the mouth (shared heldState's envelope). */
export function hold2(sip: number, t: number): Act {
  const c: Ch = {
    sR: lerp(-0.25, -1.0, sip),
    oR: lerp(0.12, 0.35, sip),
    eR: lerp(-1.4, -2.2, sip),
    wR: lerp(0.15, -0.35, sip),
    dx: -0.18 * sip,
    nx: -0.06 * sip,
    sx: -0.04 * sip,
    hR: 1,
    // (the free hand easy, a little sway in it)
    sL: 0.05 + 0.03 * Math.sin(t * 1.1),
    eL: -0.25,
    oL: 0.12,
  };
  const p = upper(c);
  Object.assign(p, shape(-1, HANDS.grip));
  // (at the waist the hand's own, a little out ahead; at the mouth the body's: `reach`)
  const w = 1 - sip;
  return {
    pose: p,
    hands: w > 0.02 ? { R: { at: [-0.16, 0.98, 0.24], w: w * 0.8, pole: ELBOW_DOWN } } : null,
    blink: sip > 0.5 ? 1 : 0,
    sip,
  };
}

const PHONE_GRIP: HandShape = { fingers: 1.05, index: 0.95, thumb: 0.2 };
/** The phone (shared/phone.ts PHONE_STATES), `t` s on: texting, a call, a video, a photo, a selfie
 *  with its pose (the free hand's). */
export function phone2(state: string, pose: string, t: number, talking: boolean, seed: number): Act {
  const c: Ch = {};
  let hands: Hands | null = null;
  let talk: number | undefined;
  const nod = 0.04 * Math.sin(t * 3.3);
  switch (state) {
    case "text": {
      // held low in both hands, the thumbs going (bursts, a pause to read), the head down over it,
      // the weight easing from foot to foot
      const on = Math.sin(t * 0.8 + seed) > -0.35 ? 1 : 0;
      Object.assign(c, { dx: 0.42, nx: 0.18, sx: 0.06, cx: 0.04, sz: 0.03 * wob(t * 0.3, seed) });
      const y = 1.06 + 0.01 * Math.sin(t * 0.7);
      hands = {
        L: { at: [0.05, y, 0.3], w: 1, pole: ELBOW_DOWN },
        R: { at: [-0.05, y, 0.3], w: 1, pole: ELBOW_DOWN },
      };
      const p = upper(c);
      for (const [side, ph] of [
        [1, 0],
        [-1, 1.9],
      ] as const)
        Object.assign(p, shape(side, { ...PHONE_GRIP, thumb: 0.15 + 0.55 * on * bump(t * 11 + ph) }));
      p.wristL = [-0.25, 0, 0.3];
      p.wristR = [-0.25, 0, -0.3];
      return { pose: p, hands };
    }
    case "call": {
      // at the ear (the body's: reach), the head leant to it; talking, the free hand talks along;
      // listening, it holds the other elbow
      Object.assign(c, { dz: 0.12, dx: 0.04 + nod * (talking ? 1 : 0.3), sz: 0.04 });
      if (talking) {
        const g = Math.sin(t * 2.4);
        Object.assign(c, { sL: -0.55 + 0.15 * g, oL: 0.25, eL: -1.35 + 0.2 * Math.sin(t * 3.1), wL: 0.1 });
        talk = 1;
      } else Object.assign(c, { sL: -0.35, oL: -0.05, eL: -1.85, wL: 0.2 });
      const p = upper(c);
      Object.assign(p, shape(-1, PHONE_GRIP), shape(1, talking ? HANDS.open : HANDS.relaxed));
      p.wristL = [0, talking ? -0.6 : 0, 0];
      return { pose: p, talk };
    }
    case "video": {
      // held out at the face, talking to it: the head moving with what's said
      Object.assign(c, { dx: -0.04 + nod, dy: 0.06 * Math.sin(t * 1.3), sx: -0.02 });
      hands = { R: { at: [-0.06, 1.5, 0.4], w: 1, pole: ELBOW_DOWN } };
      const p = upper(c);
      Object.assign(p, shape(-1, PHONE_GRIP));
      p.wristR = [-0.3, 0, 0];
      return { pose: p, hands, talk: talking ? 1 : undefined };
    }
    case "photo": {
      // up in both hands at the eyes, aiming, a press of the shutter now and then
      Object.assign(c, { dx: 0.02, sx: -0.03 });
      const click = bump(t * 1.6) ** 8;
      hands = {
        L: { at: [0.08, 1.48, 0.33], w: 1, pole: ELBOW_OUT },
        R: { at: [-0.08, 1.48, 0.33], w: 1, pole: ELBOW_OUT },
      };
      const p = upper(c);
      Object.assign(p, shape(1, PHONE_GRIP), shape(-1, { ...PHONE_GRIP, index: 0.6 + 0.6 * click }));
      p.wristL = [-0.6, 0, 0];
      p.wristR = [-0.6, 0, 0];
      return { pose: p, hands };
    }
    case "selfie": {
      // the arm out and up, the head tipped to it and leant in; the free hand's pose
      Object.assign(c, { dz: -0.16, dy: -0.25, dx: -0.1, sz: -0.05 });
      hands = { R: { at: [-0.38, 1.72, 0.42], w: 1, pole: [-0.8, -0.6, 0] } };
      if (pose === "peace") {
        Object.assign(c, { sL: -1.05, oL: 0.45, eL: -2.1, wL: 0 });
      } else if (pose === "point") Object.assign(c, { sL: -1.45, oL: 0.1, eL: -0.06 });
      else if (pose === "thumbs") Object.assign(c, { sL: -0.8, oL: 0.25, eL: -1.2 });
      const p = upper(c);
      Object.assign(p, shape(-1, PHONE_GRIP));
      if (pose === "peace") Object.assign(p, shape(1, { fingers: 0.6, index: 0, thumb: 0.9 }));
      if (pose === "point") Object.assign(p, shape(1, HANDS.point));
      if (pose === "thumbs") {
        Object.assign(p, shape(1, HANDS.thumbsUp));
        p.wristL = [0, 0, -1.25];
      }
      p.wristR = [-0.4, 0, 0];
      return { pose: p, hands };
    }
  }
  return { pose: {} };
}

// ── busy (6c): at something, each its own loop — the button pressed and the wait; the throw's wind-up,
// release and follow-through on the feet; the arcade's stick and buttons; the piano's hands along the
// keys; the pad's thumbs; the pool cue's strokes and the strike; pong's ready and the swing; typing
// at a computer; writing on the whiteboard and a step back to look
const loop = (t: number, len: number) => (t % len) / len;
/** Using something (shared USES), `t` s in: the whole body, and its hands. */
export function busy2(what: string, t: number, seed: number): Act & { legs: boolean } {
  let c: Ch = {};
  let hands: Hands | null = null;
  let legs = false;
  const hs: [HandShape, HandShape] = [HANDS.relaxed, HANDS.relaxed];
  switch (what) {
    case "coffee":
    case "water":
    case "vending": {
      // a button pressed (a lean in), then the wait: weight shifting, a glance up at it, a tap of the foot
      const u = loop(t, 5);
      const press = win(u, 0.04, 0.34, 0.07);
      Object.assign(c, {
        sx: 0.12 * press,
        dx: 0.2 - 0.25 * win(u, 0.45, 0.6, 0.08),
        dy: 0.25 * win(u, 0.65, 0.85, 0.1),
      });
      hands = {
        R: { at: [-0.12, 1.18, 0.4 + 0.05 * bump(u * TAU * 12) * press], w: press, pole: ELBOW_DOWN },
      };
      Object.assign(c, { sL: 0.08, eL: -0.3, sR: lerp(0.05, -1.1, press), eR: lerp(-0.3, -0.5, press) });
      hs[1] = mixH(HANDS.relaxed, HANDS.point, press);
      break;
    }
    case "throw": {
      // a step into it: the arm back, the weight back; through over the front foot, the follow-through
      legs = true;
      const u = loop(t, 2.4);
      const k: Key[] = [
        { at: 0, c: { tL: -0.15, kL: 0.15, tR: 0.12, kR: 0.15, sR: 0.2, eR: -0.4, sL: 0.1, eL: -0.3 } },
        {
          at: 0.3,
          c: {
            tL: -0.45,
            kL: 0.3,
            fL: 0,
            tR: 0.3,
            kR: 0.4,
            fR: 0.5,
            hy: -0.4,
            sy: -0.35,
            sx: -0.1,
            sR: -1.9,
            oR: 0.6,
            eR: -1.6,
            sL: -1.2,
            oL: 0.3,
            eL: -0.3,
            hR: 1,
          },
        },
        {
          at: 0.45,
          c: {
            tL: -0.5,
            kL: 0.4,
            fL: 0,
            tR: 0.45,
            kR: 0.5,
            fR: 1.0,
            hy: 0.35,
            sy: 0.3,
            sx: 0.4,
            sR: -1.4,
            oR: 0.2,
            eR: -0.1,
            sL: 0.3,
            oL: 0.4,
            eL: -0.6,
            hR: -0.8,
          },
        },
        {
          at: 0.65,
          c: {
            tL: -0.35,
            kL: 0.35,
            tR: 0.3,
            kR: 0.4,
            fR: 0.8,
            hy: 0.3,
            sy: 0.2,
            sx: 0.3,
            sR: 0.2,
            oR: 0.1,
            eR: -0.4,
            sL: 0.2,
            eL: -0.6,
          },
        },
        { at: 1, c: { tL: -0.15, kL: 0.15, tR: 0.12, kR: 0.15, sR: 0.2, eR: -0.4, sL: 0.1, eL: -0.3 } },
      ];
      c = sample(k, u, false);
      break;
    }
    case "arcade": {
      // the left on the stick going round, the right on the buttons, leant in, the head bobbing
      const st = t * 5;
      hands = {
        L: { at: [0.16 + 0.03 * Math.cos(st), 1.02, 0.38 + 0.03 * Math.sin(st)], w: 1, pole: ELBOW_OUT },
        R: { at: [-0.14, 1.02 + 0.015 * bump(t * 21), 0.38], w: 1, pole: ELBOW_OUT },
      };
      Object.assign(c, { sx: 0.14, dx: 0.18 + 0.03 * Math.sin(t * 7), sz: 0.04 * Math.sin(t * 1.3) });
      hs[0] = HANDS.grip;
      hs[1] = mixH(HANDS.loose, HANDS.point, 0.5 + 0.5 * Math.sin(t * 21));
      break;
    }
    case "piano": {
      // the hands along the keys (apart, together), the fingers pressing, the body swaying with it
      const a = 0.15 + 0.07 * Math.sin(t * 0.9 + seed);
      const sway = Math.sin(t * 1.1);
      hands = {
        L: {
          at: [a + 0.03 * Math.sin(t * 2.3), 1.0 + 0.012 * bump(t * 9), 0.33],
          w: 1,
          pole: ELBOW_OUT,
        },
        R: {
          at: [-a + 0.03 * Math.sin(t * 1.9), 1.0 + 0.012 * bump(t * 9 + 2), 0.33],
          w: 1,
          pole: ELBOW_OUT,
        },
      };
      Object.assign(c, { sx: 0.1, sz: 0.06 * sway, dz: 0.08 * sway, dx: 0.2 });
      hs[0] = {
        fingers: 0.5 + 0.4 * bump(t * 11),
        index: 0.4 + 0.5 * bump(t * 13 + 1),
        thumb: 0.3,
      };
      hs[1] = {
        fingers: 0.5 + 0.4 * bump(t * 12 + 2),
        index: 0.4 + 0.5 * bump(t * 10 + 3),
        thumb: 0.3,
      };
      break;
    }
    case "slotcar":
    case "gamepad": {
      // the pad held in front in both, the thumbs going, leant into the corners
      const lean = Math.sin(t * 0.8 + seed);
      hands = {
        L: { at: [0.07, 1.08, 0.3], w: 1, pole: ELBOW_DOWN },
        R: { at: [-0.07, 1.08, 0.3], w: 1, pole: ELBOW_DOWN },
      };
      Object.assign(c, { sx: 0.08, sz: 0.1 * lean, dz: 0.06 * lean, dx: 0.28 });
      hs[0] = { ...HANDS.grip, thumb: 0.2 + 0.4 * bump(t * 6) };
      hs[1] = { ...HANDS.grip, thumb: 0.2 + 0.4 * bump(t * 9 + 1) };
      break;
    }
    case "pool": {
      // down over the cue: the bridge hand on the cloth ahead, the cue hand drawing back and forth,
      // then through for the strike; up to watch it
      legs = true;
      const u = loop(t, 4);
      const up = win(u, 0.78, 1.02, 0.08);
      const stroke = u < 0.6 ? Math.sin(u * TAU * 3) * 0.08 : u < 0.7 ? -0.12 + 0.34 * smoother((u - 0.6) / 0.1) : 0.22;
      Object.assign(c, {
        sx: lerp(0.95, 0.35, up),
        dx: lerp(-0.7, -0.25, up),
        nx: lerp(-0.2, 0, up),
        tL: -0.4,
        kL: 0.4,
        fL: 0,
        tR: 0.25,
        kR: 0.1,
        fR: 0.2,
        hy: -0.25,
        sy: 0.2,
      });
      hands = {
        L: { at: [0.06, lerp(0.88, 1.0, up), 0.62], w: 1 - up, pole: ELBOW_OUT },
        R: { at: [-0.16, 0.95, 0.02 + stroke], w: 1, pole: [-0.2, 1, -0.3] },
      };
      hs[0] = { fingers: 0.3, index: 0.05, thumb: 0.8 };
      hs[1] = HANDS.grip;
      break;
    }
    case "pong": {
      // ready on the toes, then a forehand: a turn back, through, and ready again
      legs = true;
      const u = loop(t, 1.8);
      const sw = Math.sin(Math.PI * clamp01((u - 0.4) / 0.35));
      const back = win(u, 0.2, 0.45, 0.1);
      Object.assign(c, {
        tL: -0.4,
        kL: 0.65,
        fL: 0,
        tR: -0.35,
        kR: 0.6,
        fR: 0,
        aL: 0.1,
        aR: 0.1,
        sx: 0.28,
        dx: -0.15,
        hy: 0.3 * back - 0.25 * sw,
        sy: 0.3 * back - 0.35 * sw,
        sR: lerp(-0.8, 0.1, back) - 0.9 * sw,
        oR: 0.3 + 0.3 * back,
        eR: -1.3 + 0.5 * sw,
        sL: -0.45,
        oL: 0.25,
        eL: -1.2,
        up: -0.07 + 0.02 * Math.sin(t * 6) ** 2,
      });
      hs[1] = HANDS.grip;
      break;
    }
    case "computer": {
      // stood at a keyboard, typing in bursts, the head reading
      const on = Math.sin(t * 0.9 + seed) > -0.25 ? 1 : 0;
      hands = {
        L: {
          at: [0.13 + 0.01 * Math.sin(t * 6), 1.0 + 0.01 * on * bump(t * 17), 0.36],
          w: 1,
          pole: ELBOW_DOWN,
        },
        R: {
          at: [-0.13 + 0.01 * Math.sin(t * 5), 1.0 + 0.01 * on * bump(t * 19 + 1), 0.36],
          w: 1,
          pole: ELBOW_DOWN,
        },
      };
      Object.assign(c, { sx: 0.08, dx: 0.12, dy: 0.06 * Math.sin(t * 0.7) });
      hs[0] = {
        fingers: 0.55 + 0.3 * on * bump(t * 19),
        index: 0.4 + 0.5 * on * bump(t * 23),
        thumb: 0.3,
      };
      hs[1] = {
        fingers: 0.55 + 0.3 * on * bump(t * 17 + 2),
        index: 0.4 + 0.5 * on * bump(t * 21 + 1),
        thumb: 0.3,
      };
      break;
    }
    case "whiteboard": {
      // writing along a line at the board, a new line lower; a step back to look at it now and then
      const u = loop(t, 6);
      const look = win(u, 0.8, 1.02, 0.06);
      const line = Math.floor(u * 4) % 3;
      const along = (u * 4) % 1;
      hands = {
        R: {
          at: [0.06 - 0.42 * along, 1.5 - 0.12 * line + 0.025 * Math.sin(along * 60), 0.48],
          w: 1 - look,
          pole: ELBOW_DOWN,
        },
      };
      Object.assign(c, {
        dx: -0.1 - 0.08 * line,
        dy: 0.25 * (0.5 - along) * (1 - look),
        sx: -0.03 * look,
        sL: 0.05,
        eL: -0.3,
      });
      hs[1] = HANDS.grip;
      break;
    }
  }
  const m = body(steady(c));
  const p: Pose = legs ? { ...m.pose } : upper(c);
  Object.assign(p, shape(1, hs[0]), shape(-1, hs[1]));
  return { pose: p, lift: legs ? m.lift : undefined, hands, legs };
}

// ── together (6d): the right hands meet where the two of them meet — halfway between, at a height
// each act has — wound up, struck (a slap, a bump, a clink, a hand-over), followed through. `k` 0..1
// through it (the hands meet at `contact`), `with` the other one's place in her own space (x her
// left, z ahead: they face her)
const MEET_Y: Record<string, number> = { highfive: 1.78, fistbump: 1.22, cheers: 1.38, give: 1.12, take: 1.12 };
export function together2(what: string, k: number, contact: number, w: [number, number] = [0, 1.2]): Act {
  const c: Ch = {};
  const into = smoother(k / contact);
  const after = clamp01((k - contact) / (1 - contact));
  if (what === "wave") {
    // KH3's: the arm high, waving wide from the shoulder, a lean to it
    const a = Math.sin(k * TAU * 3.2);
    Object.assign(c, { sR: -0.5, oR: 2.4 + 0.2 * a, eR: -0.35 + 0.35 * a, sz: 0.06, dz: 0.08, sL: 0.05, eL: -0.3 });
    const p = upper(c);
    Object.assign(p, shape(-1, HANDS.open));
    return { pose: p };
  }
  // the meeting place: halfway between them
  const mx = w[0] / 2;
  const mz = Math.max(0.3, w[1] / 2);
  const y = MEET_Y[what] ?? 1.2;
  // (wound up first: the hand back and down; then out to the place; after it, back — a high five's
  // down past her side, a bump's fist pulled back and opened, a cheers' drink back to the mouth)
  const wind = win(k, -0.1, contact * 0.45, contact * 0.3);
  const reach = smoother((k - contact * 0.35) / (contact * 0.65)) * (1 - smoother((k - contact - 0.05) / 0.3));
  let hand: HandShape = HANDS.relaxed;
  if (what === "highfive") {
    hand = HANDS.open;
    Object.assign(c, {
      sR: 0.35 * wind - 2.3 * reach + 0.4 * after,
      oR: 0.3,
      eR: -0.7 * wind - 0.3 * reach,
      sx: 0.06 * reach,
      sz: 0.05 * reach,
    });
  } else if (what === "fistbump") {
    hand = after > 0.25 ? mixH(HANDS.fist, HANDS.open, smoother((after - 0.25) / 0.2)) : HANDS.fist;
    Object.assign(c, { sR: 0.4 * wind - 1.3 * reach, eR: -1.9 * wind - 0.5 * reach - 0.6 * after, sx: 0.08 * reach });
  } else if (what === "cheers") {
    hand = HANDS.grip;
    Object.assign(c, { sR: -0.4 + 0.15 * wind - 1.0 * reach, eR: -1.5 + 0.6 * reach, sx: 0.05 * reach });
  } else {
    hand = what === "give" && k < contact ? HANDS.grip : HANDS.loose;
    Object.assign(c, { sR: -0.2 - 0.9 * reach, eR: -1.0 + 0.5 * reach, sx: 0.08 * reach });
  }
  Object.assign(c, { sL: 0.06, oL: 0.14, eL: -0.3, dx: 0.06 * reach });
  const p = upper(c);
  Object.assign(p, shape(-1, hand));
  if (what === "highfive") p.wristR = [0.25, 0, 0];
  // (on the line between them, each hand a palm's thickness short of the middle: they touch)
  const at: [number, number, number] = [mx, y + (what === "highfive" ? 0.04 * Math.sin(into * Math.PI) : 0), mz - 0.03];
  // (a cheers after the clink: the drink back up to the mouth — the body's own reach does it)
  return {
    pose: p,
    hands: reach > 0.01 ? { R: { at, w: reach, pole: ELBOW_DOWN } } : null,
  };
}

// ── the emotes (6e): KH3's — big, quick, readable, the whole body in each
/** One emote (shared EMOTES), `t` s in (`len` its length): the whole body and its hands. */
export function emote2(e: string, t: number): Act & { legs: boolean } {
  const c: Ch = {};
  let hands: Hands | null = null;
  let legs = false;
  let blink: number | undefined;
  let talk: number | undefined;
  const hs: [HandShape, HandShape] = [HANDS.relaxed, HANDS.relaxed];
  switch (e) {
    case "wave": {
      // the whole arm high over the head, side to side; up on the toes, a lean
      const a = Math.sin(t * 8.5);
      Object.assign(c, {
        sR: -0.45,
        oR: 2.55 + 0.25 * a,
        eR: -0.25 + 0.3 * a,
        sz: 0.08 + 0.03 * a,
        dz: 0.1,
        sL: 0.1,
        oL: 0.2,
        eL: -0.4,
      });
      hs[1] = HANDS.open;
      break;
    }
    case "clap": {
      // the hands meeting in front of the chest, a bounce in the knees to each
      legs = true;
      const cl = bump(t * 9) ** 2;
      const y = 1.32 + 0.03 * Math.sin(t * 9);
      hands = {
        L: { at: [0.02 + 0.09 * (1 - cl), y, 0.3], w: 1, pole: ELBOW_DOWN },
        R: { at: [-0.02 - 0.09 * (1 - cl), y, 0.3], w: 1, pole: ELBOW_DOWN },
      };
      Object.assign(c, { tL: -0.12, kL: 0.2 + 0.08 * cl, tR: -0.12, kR: 0.2 + 0.08 * cl, sx: 0.05, dx: -0.05 });
      hs[0] = HANDS.open;
      hs[1] = HANDS.open;
      talk = 0.4;
      break;
    }
    case "laugh": {
      // doubled over with it, a hand slapping the thigh, the head thrown back between
      legs = true;
      const b = Math.sin(t * 2.2);
      const slap = bump(t * 6.5) ** 3;
      Object.assign(c, {
        sx: 0.45 + 0.2 * b + 0.04 * Math.sin(t * 13),
        dx: -0.5 - 0.15 * b,
        tL: -0.2,
        kL: 0.3,
        tR: -0.15,
        kR: 0.25,
        sL: -0.35,
        oL: 0.25,
        eL: -1.8,
      });
      hands = { R: { at: [-0.14, 0.62 + 0.06 * (1 - slap), 0.2], w: 1, pole: ELBOW_OUT } };
      hs[1] = HANDS.open;
      talk = Math.sin(t * 16) > 0 ? 1 : 0.3;
      blink = 1;
      break;
    }
    case "heart": {
      // the hands making a heart in front of the chest, the head on one side, the eyes shut
      hands = {
        L: { at: [0.03, 1.36, 0.3], w: 1, pole: ELBOW_OUT },
        R: { at: [-0.03, 1.36, 0.3], w: 1, pole: ELBOW_OUT },
      };
      Object.assign(c, { dz: 0.18 + 0.04 * Math.sin(t * 2), dx: 0.05, sz: 0.04 });
      hs[0] = { fingers: 1.0, index: 1.1, thumb: -0.3 };
      hs[1] = { fingers: 1.0, index: 1.1, thumb: -0.3 };
      blink = 1;
      break;
    }
    case "question": {
      // a shrug — the shoulders up, the hands out palm up, the head on one side — then a hand to the chin
      const sh = win(t, 0.1, 1.6, 0.25);
      const chin = smoother((t - 1.5) / 0.4);
      Object.assign(c, {
        cx: -0.05 * sh,
        sL: -0.3 * sh,
        oL: 0.5 * sh,
        eL: -1.4 * sh - 0.2,
        wL: -0.4 * sh,
        sR: lerp(-0.3 * sh, -0.85, chin),
        oR: lerp(0.5 * sh, 0.1, chin),
        eR: lerp(-1.4 * sh - 0.2, -2.45, chin),
        wR: -0.4 * sh,
        dz: 0.22,
        dx: 0.06,
      });
      hs[0] = HANDS.open;
      hs[1] = mixH(HANDS.open, HANDS.loose, chin);
      break;
    }
    case "fire": {
      // two fist pumps, the second off the ground, the other fist in at the side
      legs = true;
      const pump = bump(t * 6.5) ** 1.5;
      const hop = t > 0.9 && t < 1.9 ? pump : 0;
      Object.assign(c, {
        sR: -2.75 + 0.3 * pump,
        oR: 0.15,
        eR: -0.2 - 1.1 * pump,
        sL: -0.2,
        eL: -1.7,
        sx: -0.05 - 0.08 * pump,
        dx: -0.15,
        tL: -0.25 * (1 - hop),
        kL: 0.4 * (1 - pump) + 0.6 * hop,
        tR: -0.15 * (1 - hop),
        kR: 0.35 * (1 - pump) + 0.4 * hop,
        up: 0.12 * hop - 0.05 * (1 - pump),
      });
      hs[0] = HANDS.fist;
      hs[1] = HANDS.fist;
      talk = pump > 0.6 ? 1 : 0;
      break;
    }
    case "coffee": {
      const sip = win(t, 0.3, 2.6, 0.45);
      return { ...hold2(sip, t), legs: false };
    }
    case "tape": {
      // a little dance: a step side to side on the beat, the hips and the shoulders with it, the arms
      // swinging, a bounce
      legs = true;
      const s = Math.sin(t * 4.4);
      const b = Math.sin(t * 4.4) ** 2;
      Object.assign(c, {
        hz: 0.1 * s,
        sz: -0.12 * s,
        sy: 0.12 * s,
        tL: -0.45 * Math.max(0, s),
        kL: 0.15 + 0.8 * Math.max(0, s),
        tR: -0.45 * Math.max(0, -s),
        kR: 0.15 + 0.8 * Math.max(0, -s),
        sL: -0.6 - 0.4 * Math.max(0, s),
        oL: 0.4,
        eL: -1.4,
        sR: -0.6 - 0.4 * Math.max(0, -s),
        oR: 0.4,
        eR: -1.4,
        dz: 0.12 * s,
        dx: 0.06 * Math.sin(t * 8.8),
        up: -0.03 + 0.03 * b,
      });
      hs[0] = HANDS.loose;
      hs[1] = HANDS.loose;
      break;
    }
  }
  const m = body(steady(c));
  const p: Pose = legs ? { ...m.pose } : upper(c);
  Object.assign(p, shape(1, hs[0]), shape(-1, hs[1]));
  return { pose: p, lift: legs ? m.lift : undefined, hands, legs, blink, talk };
}
