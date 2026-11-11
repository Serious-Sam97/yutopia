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
  /** (plan 62) the hand turned at the wrist to point this far from level (rad, − down) */
  level?: number;
  /** (plan 78 phase 7) which way its palm faces, and its fingers point (the body's own space): a life hand
   *  turned so, within a wrist's reach (PersonModel.handsTo) */
  palm?: [number, number, number];
  point?: [number, number, number];
  /** (plan 78 phase 7) where its thumb's pad aims (the body's space): a hand heart's point */
  thumb?: [number, number, number];
}
export type Hands = { L?: Hand; R?: Hand };
/** (plan 78 phase 7) each wrist off the middle at a clap: the palms just meet */
const CLAP_MEET = 0.03;
/** (plan 78 phase 7) each wrist off the middle making a heart */
const HEART_W = 0.092;
/** (…the heart's middle: its height off the feet, how far ahead) */
const HEART_Y = 1.3;
const HEART_Z = 0.22;
/** (…the elbows low and in, the forearms rising to the hands: the wrists no further over than a real one's) */
const HEART_ELBOW: [number, number, number] = [-0.35, -1, -0.5];
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
const ELBOW_ARM: [number, number, number] = [-0.5, -1, -0.9];

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
// where each foot is sat (ahead, out): both flat, one out ahead, the ankles crossed, one tucked
// (plan 62: ahead as the thigh's length — plan 59's legs are 14% longer)
// (plan 77: nearer — on a real body's legs 1.14–1.59 thighs out had the knees at 25–50°, the feet 20–30
// cm past the knees, the legs slid out down the seat; a person sat easy has the feet under the knees or
// a little past, the knees ~80–100°)
const FEET: [number, number, number, number][] = [
  [1.0, 0.11, 1.0, 0.11],
  [1.3, 0.12, 0.95, 0.1],
  [1.42, -0.03, 1.42, 0.04],
  [0.92, 0.13, 1.2, 0.13],
];

/** Where she sits (plan 62, docs/plan/62-the-touch.md), in the body's own space (m): the hips' drop
 *  from standing onto the seat (the view's `sitDrop`), how high they stand (the model's own hips, for
 *  the legs to meet the floor to the mm), the floor under the feet (0 a room's; a step below on the
 *  stands), how far the trunk leans back to meet the seat's back (rad), the least the feet go ahead
 *  (a seat solid down to the floor in front: the shins clear of it), an armrest's top. */
export interface SitFit {
  drop: number;
  stand?: number;
  /** (plan 77) her thigh's length (m): where the feet go sat is reckoned in it (else the rig's) */
  thigh?: number;
  floor?: number;
  recline?: number;
  ahead?: number;
  arms?: number | null;
}
// ── at the keys (plan 62): the hands on them from wherever they are, leant in to reach
/** The keys in her own space (x her left, y up, z ahead), and how wide the hands go along them. */
export type Keys4 = [number, number, number, number?];
const SAT_SHOULDER = 0.47; // m: the shoulders over the hips' joint, sat upright
const STOOD_SHOULDER = 0.58; // m: … over the hips, stood
const KEY_OVER = 0.02; // m: the wrist over the keys' top (the hand level, the fingers curl down onto them)
const KEYS_PITCH = -0.12; // rad: the hand over the keys, a touch down from level
const REACH = 0.52; // m: the shoulder to the wrist, the arm all but straight
/** How far forward (rad) to lean so the keys `z` ahead come within the forearms' comfort. */
function leanTo(z: number, up: number): number {
  return Math.asin(Math.max(0, Math.min(0.8, (z - 0.36) / up)));
}
/** The keys `k` (her own space), brought within reach of shoulders `sy` high leant `lean` in: past
 *  it, the hands rest on the desk toward them. */
function reachKeys(k: Keys4, sy: number, lean: number): [number, number, number] {
  const sz = Math.sin(lean) * (sy - k[1] > 0 ? 0.47 : 0);
  const dz = k[2] - sz;
  const dy = sy - k[1];
  const d = Math.hypot(dz, dy);
  if (d <= REACH) return [k[0], k[1], k[2]];
  // (along the desk's top toward them, as far as the arm goes)
  const flat = Math.sqrt(Math.max(0, REACH * REACH - dy * dy));
  return [k[0], k[1], sz + Math.min(dz, flat)];
}
/** Stood, bowed `bow` from the hips: the shoulders to the keys `k` (her own space). */
function shoulderTo(k: Keys4, bow: number): number {
  const sy = HIP_H + STOOD_SHOULDER * Math.cos(bow);
  const sz = STOOD_SHOULDER * Math.sin(bow);
  return Math.hypot(k[2] - 0.03 - sz, sy - k[1] - KEY_OVER);
}
/** Bowed `bow` from the hips, the legs straight under her and the feet flat, the head up. */
function bowed(bow: number): Ch {
  const hx = bow * 0.8;
  return {
    hx,
    sx: bow * 0.2,
    tL: -hx,
    tR: -hx,
    kL: 0.06,
    kR: 0.06,
    fL: -hx,
    fR: -hx,
    up: 0,
    nx: -0.25 * bow,
    dx: 0.1 - 0.25 * bow,
  };
}
const MARKER = 0.1; // m: the marker's tip ahead of the hand's joint
// (plan 62) How long each machine takes (world/controller.ts's), s
const MACHINE_S: Record<string, number> = {
  coffee: 1.6,
  water: 1.4,
  vending: 1.5,
  cocoa: 1.6,
  tea: 1.6,
  icecream: 1.4,
};
/** At a machine, `t` s since it began, its button `a` and where the drink comes out `b` (her own
 *  space): the press you see, the wait, the drink taken — the cup in the hand then (shared/held). */
function machine(
  what: string,
  t: number,
  a: [number, number, number],
  b: [number, number, number],
): { c: Ch; hands: Hands; hs: [HandShape, HandShape]; legs: boolean } {
  const len = MACHINE_S[what] ?? 1.5;
  const u = Math.min(1, t / len);
  const c: Ch = { sL: 0.08, eL: -0.3 };
  const hs: [HandShape, HandShape] = [HANDS.relaxed, HANDS.relaxed];
  let hands: Hands = {};
  let legs = false;
  // (each reach in and back out: there by `in0`, gone by `out1`)
  const reach = (in0: number, out1: number) => win(u, in0, out1, 0.12);
  // (down to a low part as people go: the knees bent as far as it's low, the hips back to keep the
  // head off the machine, the back leant over — not folded stiff-legged)
  const lowTo = (q: [number, number, number], w: number) => {
    const low = Math.max(0, Math.min(1, (HIP_H + STOOD_SHOULDER - REACH * 0.8 - q[1]) / 0.6)) * w;
    const lean = Math.max(0, Math.min(0.45, (q[2] - 0.3) * 1.2)) * w;
    if (low + lean < 0.01) return;
    legs = true;
    // (right down near the floor — a vending machine's flap —: over further still)
    const deep = Math.max(0, Math.min(1, (0.45 - q[1]) / 0.25)) * w;
    const hx = 0.35 * low + 0.5 * lean + 0.3 * deep;
    Object.assign(c, {
      hx,
      sx: 0.3 * low + 0.2 * lean + 0.3 * deep,
      tL: -1.5 * low - hx * (1 - low),
      tR: -1.3 * low - hx * (1 - low),
      kL: 2.2 * low,
      kR: 2.0 * low,
      fL: -hx,
      fR: -hx,
      aL: 0.15 * low,
      aR: 0.15 * low,
      fw: -0.12 * low - 0.22 * deep,
    });
    // (the free hand on the left thigh, down low)
    if (deep > 0.01) hands.L = { at: [0.14, 0.42, 0.2], w: deep, pole: ELBOW_OUT };
  };
  if (what === "vending") {
    // the keypad keyed in, then down to the flap for the can
    const key = reach(0.02, 0.45);
    const flap = smoother((u - 0.5) / 0.2);
    const tap = 0.012 * bump(u * TAU * 7) * key;
    hands = {
      R: {
        at: flap > 0 ? [b[0], b[1] + 0.06, b[2] - 0.08] : [a[0], a[1], a[2] - 0.06 + tap],
        w: Math.max(key, flap),
        pole: ELBOW_DOWN,
      },
    };
    hs[1] = flap > 0 ? mixH(HANDS.relaxed, HANDS.grip, flap) : mixH(HANDS.relaxed, HANDS.point, key);
    lowTo(flap > 0 ? b : a, Math.max(key, flap));
  } else if (what === "water") {
    // a paper cup from its holder, under the tap, the tap held
    const cup = smoother(u / 0.25);
    const under = smoother((u - 0.25) / 0.2);
    const tapW = win(u, 0.4, 0.95, 0.1);
    const L: [number, number, number] = [
      lerp(b[0], a[0] + 0.02, under),
      lerp(b[1], a[1] - 0.09, under),
      lerp(b[2], a[2] - 0.03, under),
    ];
    hands = {
      L: { at: L, w: cup, pole: ELBOW_DOWN },
      R: { at: [a[0] - 0.04, a[1] + 0.01, a[2] - 0.05], w: tapW, pole: ELBOW_DOWN },
    };
    hs[0] = HANDS.grip;
    hs[1] = mixH(HANDS.relaxed, HANDS.point, tapW);
    lowTo(cup > 0.5 && under < 0.5 ? b : a, Math.max(cup, tapW));
  } else {
    // the button pressed, the wait (a glance, the weight shifting), the cup from under the spout
    const press = reach(0.02, 0.35);
    const take = smoother((u - 0.72) / 0.2);
    const tap = 0.015 * bump(Math.min(1, u / 0.3) * Math.PI) * press;
    hands = {
      R: {
        at: take > 0 ? [b[0], b[1] + 0.04, b[2] - 0.06] : [a[0], a[1] + 0.01, a[2] - 0.06 + tap],
        w: Math.max(press, take),
        pole: ELBOW_DOWN,
      },
    };
    hs[1] = take > 0 ? mixH(HANDS.relaxed, HANDS.grip, take) : mixH(HANDS.relaxed, HANDS.point, press);
    lowTo(take > 0 ? b : a, Math.max(press, take));
    c.dy = 0.25 * win(u, 0.4, 0.65, 0.1);
  }
  c.dx = (c.dx ?? 0) + 0.25;
  return { c, hands, hs, legs };
}
/** A hand on the keys: the fingers curved down onto them, tapping in bursts, the wrist level. */
function typingHand(p: Pose, S: "L" | "R", side: 1 | -1, t: number, ph: number, on: number) {
  const tap = on * bump(t * 19 + ph);
  Object.assign(
    p,
    shape(side, {
      fingers: 0.3 + 0.25 * tap,
      index: 0.25 + 0.4 * bump(t * 23 + ph * 2) * on,
      thumb: 0.15,
    }),
  );
  p[`wrist${S}`] = [-0.05, 0, 0];
}

/** A chair's, before the seats had their own (the bench's, the grounds' stills). */
export const SIT_ANY: SitFit = { drop: -0.34 };

/** Sitting: `u` 0→1 down onto the seat (or 1→0 getting up, `rising`), then sat `t` s (its life: the
 *  breath, the weight, the feet moved now and then, the hands on the lap, on the arms, or typing). */
export function sit2(
  u: number,
  rising: boolean,
  t: number,
  typing: boolean,
  seat: SitFit = SIT_ANY,
  seed = 0,
  keys?: Keys4,
): Act {
  const floor = seat.floor ?? 0;
  // (typing: upright, leant in over the keys as far as they're off)
  const recline = typing ? 0 : (seat.recline ?? 0);
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
  // (ahead in thighs; clear of a seat's solid front)
  const least = seat.ahead ?? 0;
  const th = seat.thigh ?? THIGH;
  const fz = [Math.max(F[0] * th, least) * out, Math.max(F[2] * th, least) * out];
  const fx = [lerp(0.09, F[1], out), lerp(0.09, F[3], out)];
  // (each foot lifted as it moves: on the way in and out, and moving between the ways it sits)
  const step = (k: number) => 0.035 * Math.sin(Math.PI * clamp01(k));
  const lifts = [
    step(rising ? (0.55 - u) / 0.4 : (u - 0.05) / 0.25) + step(sw * 2),
    step(rising ? (0.75 - u) / 0.4 : (u - 0.25) / 0.25) + step(sw * 2 - 1),
  ];
  const hip = (seat.stand ?? HIP_H) + seat.drop * s;
  // (leant back to the seat's back by the pelvis — the trunk with it —, the head kept level)
  const back = recline * sat;
  const hx = 0.12 * lean - back;
  const leanIn = typing && keys ? leanTo(keys[2], SAT_SHOULDER) * sat : 0;
  const c: Ch = { hx, sx: lean * 0.8 + 0.06 * sat * (1 - Math.min(1, recline * 4)) + leanIn, up: 0 };
  c.nx = 0.45 * back;
  (["L", "R"] as const).forEach((S, i) => {
    const [th, k] = leg(fz[i], ANKLE + floor + lifts[i] - hip);
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
  // (typing: the eyes on the screen — the head held up against the lean in)
  c.dx = (typing ? 0.22 : 0.05) * sat + 0.35 * back - 0.9 * leanIn;
  // the arms: out a little going down (for the balance), the hands on the knees getting up
  c.sL = c.sR = -0.35 - 0.4 * lean;
  c.eL = c.eR = -0.5 - 0.4 * lean;
  c.oL = c.oR = 0.15;
  const m = body(c);
  const p = m.pose;
  // the hands: on the thighs sat, on the keys typing, on the knees pushing up
  const knee = (S: 1 | -1, i: number) => {
    const [th] = leg(fz[i], ANKLE + floor - hip);
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
      // (in bursts, a pause to read; the fingers going — on the keys she faces (plan 62), else where
      // a desk's would be)
      const on = Math.sin(t * 0.9 + seed) > -0.3 ? 1 : 0;
      const k = keys ? reachKeys(keys, hip + SAT_SHOULDER, leanIn) : null;
      // (a piano's keys: the hands wide along them, apart and together)
      const wide = keys?.[3] ? keys[3] * (0.6 + 0.4 * Math.sin(t * 0.9 + seed)) : 0;
      const key = (S: 1 | -1, ph: number): [number, number, number] => [
        (k ? k[0] + S * (0.1 + wide) : S * 0.13) + 0.012 * Math.sin(t * 7 + ph) * on,
        (k ? k[1] + KEY_OVER : hip + 0.31) + 0.01 * bump(t * 17 + ph) * on,
        (k ? k[2] - 0.03 : 0.44) + 0.015 * Math.sin(t * 3.1 + ph) * on,
      ];
      hands = {
        L: { at: key(1, 0), w: sat, pole: ELBOW_DOWN, level: KEYS_PITCH },
        R: { at: key(-1, 1.7), w: sat, pole: ELBOW_DOWN, level: KEYS_PITCH },
      };
      for (const [S, side, ph] of [
        ["L", 1, 0],
        ["R", -1, 1.7],
      ] as const)
        typingHand(p, S, side, t, ph, on);
    } else if (seat.arms != null) {
      // (an armchair's: the forearms along its arms, the hands over their fronts)
      const arm = (S: 1 | -1): [number, number, number] => [S * 0.33, seat.arms as number, 0.24];
      hands = { L: { at: arm(1), w: sat, pole: ELBOW_ARM }, R: { at: arm(-1), w: sat, pole: ELBOW_ARM } };
      Object.assign(p, shape(1, HANDS.relaxed), shape(-1, HANDS.relaxed));
      p.wristL = [0.15, 0, 0];
      p.wristR = [0.15, 0, 0];
    } else {
      hands = { L: { at: lap(1, 0), w: sat, pole: ELBOW_DOWN }, R: { at: lap(-1, 1), w: sat, pole: ELBOW_DOWN } };
      Object.assign(p, shape(1, HANDS.relaxed), shape(-1, HANDS.relaxed));
      p.wristL = [0.35, 0, 0];
      p.wristR = [0.35, 0, 0];
    }
  }
  return { pose: p, lift: m.lift, hands, settle: s };
}

/** (plan 62) Sat in a vehicle as it is: the hips onto its seat, the trunk back against its seat's back,
 *  each foot where it goes — the pedals, the footwell's floor, out ahead on a kart's floor — in her
 *  own space (x out to its side, y up from her root, z ahead: the ankle's, m). */
export interface CarFit {
  drop: number;
  stand: number;
  recline: number;
  feet: [[number, number, number], [number, number, number]];
  /** a passenger's hands in the lap (a driver's go on the rim: the car's reachTo) */
  lap?: boolean;
}
/** In a vehicle (plan 62): the legs solved to each foot's place, the back to the seat's, the breath
 *  and a glance out now and then (car2's life). */
export function car3(f: CarFit, t: number, seed: number): Act {
  const hip = f.stand + f.drop;
  const back = f.recline;
  const c: Ch = { hx: -back, up: 0, nx: 0.4 * back, dx: 0.25 * back + 0.05 };
  (["L", "R"] as const).forEach((S, i) => {
    const [out, ahead, y] = f.feet[i];
    const [th, k] = leg(ahead, ANKLE + y - hip);
    c[`t${S}`] = th + back;
    c[`k${S}`] = k;
    c[`f${S}`] = back;
    c[`a${S}`] = Math.atan2(out - 0.078, Math.max(0.3, ahead)) * 0.8;
  });
  c.sx = 0.012 * Math.sin(t * 1.9);
  c.dy = (f.lap ? 0.6 : 0.35) * Math.max(0, wob(t * 0.25, seed)) ** 2 * Math.sign(wob(t * 0.13, seed + 1));
  c.sL = c.sR = -0.45;
  c.eL = c.eR = -1.05;
  const m = body(c);
  const lap = (S: 1 | -1): [number, number, number] => [S * 0.13, hip + 0.1, 0.24];
  return {
    pose: m.pose,
    lift: m.lift,
    hands: f.lap ? { L: { at: lap(1), w: 1, pole: ELBOW_DOWN }, R: { at: lap(-1), w: 1, pole: ELBOW_DOWN } } : null,
  };
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
        L: { at: [0.08, 1.56, 0.5], w: 1, pole: ELBOW_OUT },
        R: { at: [-0.08, 1.56, 0.5], w: 1, pole: ELBOW_OUT },
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
export function busy2(
  what: string,
  t: number,
  seed: number,
  keys?: Keys4,
  parts?: [number, number, number][],
): Act & { legs: boolean } {
  let c: Ch = {};
  let hands: Hands | null = null;
  let legs = false;
  const hs: [HandShape, HandShape] = [HANDS.relaxed, HANDS.relaxed];
  switch (what) {
    case "coffee":
    case "cocoa":
    case "tea":
    case "icecream":
    case "water":
    case "vending": {
      if (parts?.length === 2) {
        // (plan 62: on the machine itself, from when it began — `t` is since then)
        const m = machine(what, t, parts[0], parts[1]);
        c = m.c;
        hands = m.hands;
        hs[0] = m.hs[0];
        hs[1] = m.hs[1];
        legs = m.legs;
        break;
      }
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
      if (parts?.length) {
        // (plan 62: on its keys — bowed over them from the hips as far as they're low and off)
        const k = parts[0];
        let bow = 0;
        while (bow < 1.1 && shoulderTo(k, bow) > REACH * 0.95) bow += 0.05;
        const a = 0.15 + 0.07 * Math.sin(t * 0.9 + seed);
        const sw = Math.sin(t * 1.1);
        const key = (S: 1 | -1, ph: number, f: number): [number, number, number] => [
          k[0] + S * a + 0.03 * Math.sin(t * f),
          k[1] + KEY_OVER + 0.012 * bump(t * 9 + ph),
          k[2] - 0.02,
        ];
        hands = {
          L: { at: key(1, 0, 2.3), w: 1, pole: ELBOW_OUT, level: KEYS_PITCH },
          R: { at: key(-1, 2, 1.9), w: 1, pole: ELBOW_OUT, level: KEYS_PITCH },
        };
        legs = true;
        Object.assign(c, bowed(bow), { sz: 0.06 * sw, dz: 0.08 * sw });
        hs[0] = { fingers: 0.35 + 0.4 * bump(t * 11), index: 0.3 + 0.5 * bump(t * 13 + 1), thumb: 0.2 };
        hs[1] = { fingers: 0.35 + 0.4 * bump(t * 12 + 2), index: 0.3 + 0.5 * bump(t * 10 + 3), thumb: 0.2 };
        break;
      }
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
      // (plan 77: the wrists 20 cm apart, a pad's grips — 14 had the life hands over each other)
      hands = {
        L: { at: [0.1, 1.08, 0.3], w: 1, pole: ELBOW_DOWN },
        R: { at: [-0.1, 1.08, 0.3], w: 1, pole: ELBOW_DOWN },
      };
      Object.assign(c, { sx: 0.08, sz: 0.1 * lean, dz: 0.06 * lean, dx: 0.28 });
      hs[0] = { ...HANDS.grip, thumb: 0.2 + 0.4 * bump(t * 6) };
      hs[1] = { ...HANDS.grip, thumb: 0.2 + 0.4 * bump(t * 9 + 1) };
      break;
    }
    case "pool": {
      if (parts?.length === 2) {
        // (plan 62) on the shot: bowed over the cue far enough for the bridge hand to reach the
        // cloth, the left leg forward and bent, the right back; the bridge hand on the cloth, the
        // back hand on the cue where the table draws it back and through — the stroke is the cue's
        legs = true;
        const [bridge, grip] = parts;
        let bow = 0.5;
        while (bow < 1.25 && shoulderTo(bridge, bow) > REACH) bow += 0.05;
        Object.assign(c, bowed(bow));
        c.tL -= 0.3;
        c.kL = 0.4;
        c.tR += 0.15;
        c.hy = -0.2;
        c.sy = 0.15;
        c.dx = 0.05 - 0.5 * bow;
        hands = {
          L: { at: [bridge[0], bridge[1] + 0.03, bridge[2]], w: 1, pole: ELBOW_OUT },
          R: { at: grip, w: 1, pole: [-0.2, 1, -0.3] },
        };
        hs[0] = { fingers: 0.3, index: 0.05, thumb: 0.8 };
        hs[1] = HANDS.grip;
        break;
      }
      // (waiting for the turn — or another's shot — stood by, watching the table)
      Object.assign(c, { sx: 0.05, dx: 0.3, dy: 0.15 * Math.sin(t * 0.4 + seed) });
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
      if (keys) {
        // (plan 62: bowed from the hips over the desk till the keys are in reach — the legs straight
        // under her —, the fingers on them)
        let bow = 0;
        while (bow < 1 && shoulderTo(keys, bow) > REACH * 0.95) bow += 0.05;
        const key = (S: 1 | -1, ph: number): [number, number, number] => [
          keys[0] + S * 0.1 + 0.01 * Math.sin(t * 6 + ph),
          keys[1] + KEY_OVER + 0.01 * on * bump(t * 17 + ph),
          keys[2] - 0.03,
        ];
        hands = {
          L: { at: key(1, 0), w: 1, pole: ELBOW_DOWN, level: KEYS_PITCH },
          R: { at: key(-1, 1.3), w: 1, pole: ELBOW_DOWN, level: KEYS_PITCH },
        };
        Object.assign(c, bowed(bow), { dy: 0.06 * Math.sin(t * 0.7) });
        const m = body(steady(c));
        const p: Pose = { ...m.pose };
        typingHand(p, "L", 1, t, 0, on);
        typingHand(p, "R", -1, t, 1.3, on);
        return { pose: p, lift: m.lift, hands, legs: true };
      }
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
      // (plan 62: on the board's face, where she stands at it; the marker's tip a hand ahead)
      const b = parts?.[0];
      hands = {
        R: {
          at: b
            ? [b[0] + 0.2 - 0.4 * along, b[1] + 0.12 - 0.12 * line + 0.02 * Math.sin(along * 60), b[2] - MARKER]
            : [0.06 - 0.42 * along, 1.5 - 0.12 * line + 0.025 * Math.sin(along * 60), 0.48],
          w: 1 - look,
          pole: ELBOW_DOWN,
        },
      };
      // (leant in to it as far as it's off)
      if (b) c.sx = Math.max(0, Math.min(0.35, (b[2] - 0.45) * 1.2)) * (1 - look);
      Object.assign(c, {
        // (the eyes on the line being written, a little below them)
        dx: b ? 0.12 + 0.06 * line : -0.1 - 0.08 * line,
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
  // (plan 77: a fist's wrist 14 cm short — its knuckles, turned down a little, are that far on; at 3 the two met through each other)
  const at: [number, number, number] = [
    mx,
    y + (what === "highfive" ? 0.04 * Math.sin(into * Math.PI) : 0),
    mz - (what === "fistbump" ? 0.14 : 0.03),
  ];
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
      // (plan 78 phase 7: before the lower chest, as photos of a clap — at the chin it read as a prayer)
      const y = 1.17 + 0.03 * Math.sin(t * 9);
      // (plan 77: the wrists 9 cm apart as the palms meet, not 4 — a real hand's palm is thick, and the
      // life hands met through each other, the fingers interlaced)
      // (plan 78 phase 7: the palms turned to each other, the fingers up and on — a clap's — and the
      // wrists brought in till the palms just meet: they'd crossed, the palms 37° off each other)
      hands = {
        L: {
          at: [CLAP_MEET + 0.09 * (1 - cl), y, 0.3],
          w: 1,
          pole: ELBOW_DOWN,
          palm: [-1, 0, 0],
          point: [0, 0.6, 0.8],
        },
        R: {
          at: [-CLAP_MEET - 0.09 * (1 - cl), y, 0.3],
          w: 1,
          pole: ELBOW_DOWN,
          palm: [1, 0, 0],
          point: [0, 0.6, 0.8],
        },
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
      // (plan 78 phase 7: as a hand heart's made, close photos of one — each hand a C, the two facing: the
      // wrists low and out, each hand rising up and in, its back out and its palm to the chest and the other
      // hand; the fingers arched over and down till the index tips meet at the top's dip, the thumbs down
      // and in till their pads meet at the point — the hole between them the heart. Fingers straight up and
      // steepled read as a prayer.)
      hands = {
        L: {
          at: [HEART_W, HEART_Y - 0.06, HEART_Z - 0.01],
          w: 1,
          pole: HEART_ELBOW,
          palm: [-0.9, -0.2, -0.3],
          point: [-0.3, 0.8, 0.52],
          thumb: [0.013, HEART_Y - 0.07, HEART_Z],
        },
        R: {
          at: [-HEART_W, HEART_Y - 0.06, HEART_Z - 0.01],
          w: 1,
          pole: HEART_ELBOW,
          palm: [0.9, -0.2, -0.3],
          point: [0.3, 0.8, 0.52],
          thumb: [-0.013, HEART_Y - 0.07, HEART_Z],
        },
      };
      // (no lean of the chest to the side: it turned one wrist 31° over to keep its hand on the heart — a
      // real one goes ~25; the head's tilt kept)
      Object.assign(c, { dz: 0.18 + 0.04 * Math.sin(t * 2), dx: 0.05 });
      // (the index arched over to the other's, the others tucked a little tighter behind it — tighter still,
      // they bunched into a fist under it; the thumbs straight)
      hs[0] = { fingers: 1.25, index: 1.0, thumb: -0.35 };
      hs[1] = { fingers: 1.25, index: 1.0, thumb: -0.35 };
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
