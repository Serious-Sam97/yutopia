import { type Ch, clamp01, HIP_H, type Key, type Moved, sample, smoother } from "../moves";
import { HANDS, handPose, type Pose } from "../rig";

// Plan 66 phase 4 (docs/plan/66-the-water.md, S2): the swim body — treading water (an upright
// eggbeater, the hands sculling wide at the waterline), the breaststroke on the surface (head up), the
// crawl (the sprint: rolling, breathing to the left), under (the breaststroke under, a long glide), the
// duck dive (C: the hips up, the trunk down), the dive in (a running jump into deep water, as it flies
// and enters), and wading (a layer over the walk: high steps knee-deep, dragged and leaning waist-deep,
// the hands lifted over the water). Made from phase 0's key poses (design/screens/water/poses). Loaded
// with the hero's (`loadHero`), a chunk of its own. Poses on the joints (the rig's conventions,
// moves.ts); hands as targets in the body's own space (x its left, y up from its root, z ahead) for the
// model to reach last. A swimmer's root is where the move core keeps it: its feet ride `SEA` under
// the surface (shared/move/swim.ts SWIM.ride).

/** The bundle's mark (tools/budget.mjs finds it by this). */
export const SWIM_CHUNK = "yutopia-swim";

export interface Hand {
  at: [number, number, number];
  w: number;
  pole?: [number, number, number];
}
export type Hands = { L?: Hand; R?: Hand };
export interface Swum {
  m: Moved;
  hands: Hands;
}
export type SwimMode = "tread" | "breast" | "crawl" | "under" | "duck" | "dive";

/** The surface over a swimmer's root (m): the core's SWIM.ride. */
export const SEA = 1.25;
/** A cycle's length: the breaststroke's, the crawl's (both arms) and under's by the water covered (m),
 *  treading's by time (s); the duck dive's and the way out of a dive's crossfade (s). */
export const STRIDE = { breast: 1.5, crawl: 2.4, under: 2.2 };
export const TREAD_PERIOD = 1.4;
export const DUCK_LEN = 1.0;
const DIVE_OUT = 0.5;
/** Under: the hips over the root (m). */
const UNDER_Y = 1.1;

const TAU = Math.PI * 2;
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
// (a pulse over [a, b]: sin², at rest at both ends)
const win = (x: number, a: number, b: number) => (x <= a || x >= b ? 0 : Math.sin((Math.PI * (x - a)) / (b - a)) ** 2);
const mod1 = (x: number) => ((x % 1) + 1) % 1;

// ── channels → the joints ───────────────────────────────────────────────────
// The trunk: hx/hy/hz the hips (pitch forward, a turn — a roll round the long axis when flat — and a
// lean), s… the spine, c… the chest, n… the neck, d… the head; Y the hips' height over the root, X/F
// to its left / ahead. Each side (L/R): t thigh (forward < 0), a its spread, r its turn out, k knee,
// f the ankle (toes down > 0, from the shin), g the toes; s shoulder (forward < 0), o out, e elbow
// (< 0 bends), w wrist, h the hand (−1 open, 1 a fist); ix/iy/iz/iw the hand's target and weight.
const DEF: Ch = { oL: 0.13, oR: 0.13, eL: -0.16, eR: -0.16, sL: 0.04, sR: 0.04, aL: 0.03, aR: 0.03, hL: -1, hR: -1 };
const SIDE = new Set(["hy", "hz", "sy", "sz", "cy", "cz", "ny", "dy", "dz", "X", "R"]);
const g = (c: Ch, n: string) => c[n] ?? DEF[n] ?? 0;

function handOf(h: number) {
  const [a, b, u] = h >= 0 ? [HANDS.relaxed, HANDS.fist, Math.min(1, h)] : [HANDS.relaxed, HANDS.open, Math.min(1, -h)];
  return {
    fingers: lerp(a.fingers, b.fingers, u),
    index: lerp(a.index, b.index, u),
    thumb: lerp(a.thumb, b.thumb, u),
  };
}

/** A thigh's joint: turned on its own length first (`r`), then spread (`a`), then swung forward (`t`) —
 *  as the rig's XYZ turns (a turn after the spread would swing a spread thigh round the body). */
function thighOf(t: number, a: number, r: number): [number, number, number] {
  const [ct, st] = [Math.cos(t), Math.sin(t)];
  const [ca, sa] = [Math.cos(a), Math.sin(a)];
  const [cr, sr] = [Math.cos(r), Math.sin(r)];
  // Rx(t)·Rz(a)·Ry(r), rows
  const m11 = ca * cr;
  const m12 = -sa;
  const m13 = ca * sr;
  const m23 = ct * sa * sr - st * cr;
  const m33 = st * sa * sr + ct * cr;
  const y = Math.asin(Math.max(-1, Math.min(1, m13)));
  return Math.abs(m13) < 0.9999999 ? [Math.atan2(-m23, m33), y, Math.atan2(-m12, m11)] : [t, y, 0];
}

function posed(c: Ch, pole: Hand["pole"]): Swum {
  const p: Pose = {};
  const hands: Hands = {};
  for (const [S, out] of [
    ["L", 1],
    ["R", -1],
  ] as const) {
    p[`thigh${S}`] = thighOf(g(c, `t${S}`), out * g(c, `a${S}`), out * g(c, `r${S}`));
    p[`knee${S}`] = [g(c, `k${S}`), 0, 0];
    p[`ankle${S}`] = [g(c, `f${S}`), 0, -out * g(c, `a${S}`) * 0.5];
    p[`toe${S}`] = [g(c, `g${S}`), 0, 0];
    p[`shoulder${S}`] = [g(c, `s${S}`), 0, out * g(c, `o${S}`)];
    p[`elbow${S}`] = [g(c, `e${S}`), 0, 0];
    p[`wrist${S}`] = [g(c, `w${S}`), 0, -out * 0.05];
    Object.assign(p, handPose(out, handOf(g(c, `h${S}`))));
    const w = g(c, `iw${S}`);
    if (w > 1e-3) hands[S] = { at: [g(c, `ix${S}`), g(c, `iy${S}`), g(c, `iz${S}`)], w: Math.min(1, w), pole };
  }
  p.hips = [g(c, "hx"), g(c, "hy"), g(c, "hz")];
  p.spine = [g(c, "sx"), g(c, "sy"), g(c, "sz")];
  p.chest = [g(c, "cx"), g(c, "cy"), g(c, "cz")];
  p.neck = [g(c, "nx"), g(c, "ny"), 0];
  p.head = [g(c, "dx"), g(c, "dy"), g(c, "dz")];
  return { m: { pose: p, lift: [g(c, "X"), (c.Y ?? HIP_H) - HIP_H, g(c, "F")] }, hands };
}

/** The same channels on the other side. */
function mirror(c: Ch): Ch {
  const m: Ch = {};
  for (const [n, v] of Object.entries(c)) {
    const s = n.match(/^(.+)([LR])$/);
    if (s) m[`${s[1]}${s[2] === "L" ? "R" : "L"}`] = s[1] === "ix" ? -v : v;
    else m[n] = SIDE.has(n) ? -v : v;
  }
  return m;
}
/** Every key naming every channel any of them does (sample's missing ones are 0, not the rest's). */
function norm(keys: Key[]): Key[] {
  const all = new Set(keys.flatMap((k) => Object.keys(k.c)));
  return keys.map((k) => {
    const c: Ch = { ...k.c };
    for (const n of all) if (!(n in c)) c[n] = n === "Y" ? HIP_H : (DEF[n] ?? 0);
    return { ...k, c };
  });
}
/** A cycle from its first half (keys in [0, 0.5)), the second the first mirrored. */
const cycle2 = (half: Key[]): Key[] => norm([...half, ...half.map((k) => ({ at: k.at + 0.5, c: mirror(k.c) }))]);
/** Both hands' targets at once: ±x. */
const both = (x: number, y: number, z: number): Ch => ({
  ixL: x,
  iyL: y,
  izL: z,
  iwL: 1,
  ixR: -x,
  iyR: y,
  izR: z,
  iwR: 1,
});
/** The face's pitch held at `look` (rad down from level) whatever the trunk's: the neck and the head share it. */
function face(c: Ch, look: number) {
  const nd = look - (g(c, "hx") + g(c, "sx") + g(c, "cx"));
  c.nx = 0.58 * nd;
  c.dx = 0.42 * nd;
}
/** A point in the body's space turned with its pitch round the hips (δ > 0: head down). */
function pitchAt(at: [number, number, number], Y: number, d: number): [number, number, number] {
  const y = at[1] - Y;
  return [at[0], Y + y * Math.cos(d) - at[2] * Math.sin(d), y * Math.sin(d) + at[2] * Math.cos(d)];
}

// ── treading water: upright, the chin at the surface; an upright eggbeater (each shin circling out in
// turn under the body, the knees a little apart and forward — not sat as on a chair) and the hands
// sculling wide and low, just under the surface
const TREAD_POLE: Hand["pole"] = [-1, 0.15, -0.45];
export function tread2(phase: number, sea = SEA): Swum {
  const u = mod1(phase);
  const scull = (1 - Math.cos(2 * TAU * u)) / 2; // 0 out, 1 in — twice a cycle
  const c: Ch = {
    Y: sea - 0.66 + 0.012 * Math.cos(2 * TAU * u),
    hx: -0.06,
    sx: 0.08,
    cx: 0.05,
    nx: -0.1,
    dx: -0.06,
    ...both(lerp(0.52, 0.34, scull), sea - 0.3 - 0.03 * scull, lerp(0.16, 0.34, scull)),
    hL: -0.85,
    hR: -0.85,
    wL: 0.25,
    wR: 0.25,
  };
  for (const [S, off] of [
    ["L", 0],
    ["R", Math.PI],
  ] as const) {
    const th = TAU * u + off;
    c[`t${S}`] = -0.45 + 0.06 * Math.cos(th);
    c[`a${S}`] = 0.28 + 0.05 * Math.sin(th);
    c[`r${S}`] = -0.3 - 0.12 * Math.sin(th);
    c[`k${S}`] = 1.15 + 0.15 * Math.cos(th);
    c[`f${S}`] = 0.1 + 0.25 * Math.sin(th);
  }
  return posed(c, TREAD_POLE);
}

// ── the breaststroke, head up, the body ~20° off flat: the glide, the arms sweeping out, the pull in
// (the chest up, a breath), the recovery (the hands together under the chin, the heels drawn up with the
// knees wide — not under the hips), the whip of the kick, the legs closing
const BREAST_POLE: Hand["pole"] = [-1, 0, -0.8];
const legs = (t: number, a: number, r: number, k: number, f: number): Ch => ({
  tL: t,
  tR: t,
  aL: a,
  aR: a,
  rL: r,
  rR: r,
  kL: k,
  kR: k,
  fL: f,
  fR: f,
});
const BREAST: Key[] = norm([
  {
    at: 0,
    c: { hx: 1.32, Y: -0.3, sx: -0.1, cx: -0.1, ...both(0.15, -0.14, 1.0), ...legs(0.03, 0.06, 0, 0.06, 1.35) },
  },
  {
    at: 0.28,
    c: { hx: 1.3, Y: -0.29, sx: -0.1, cx: -0.1, ...both(0.55, -0.14, 0.86), ...legs(0.03, 0.06, 0, 0.1, 1.3) },
  },
  {
    at: 0.48,
    c: { hx: 1.14, Y: -0.25, sx: -0.16, cx: -0.14, ...both(0.32, -0.28, 0.68), ...legs(-0.02, 0.3, -0.3, 1.1, 0.5) },
  },
  {
    at: 0.64,
    c: { hx: 1.3, Y: -0.25, sx: -0.12, cx: -0.1, ...both(0.08, -0.22, 0.74), ...legs(0.05, 0.85, -0.85, 2.4, -0.45) },
  },
  {
    at: 0.78,
    c: { hx: 1.34, Y: -0.28, sx: -0.1, cx: -0.1, ...both(0.1, -0.16, 0.93), ...legs(0.02, 0.65, -0.45, 0.8, -0.2) },
  },
  {
    at: 0.9,
    c: { hx: 1.33, Y: -0.3, sx: -0.1, cx: -0.1, ...both(0.14, -0.14, 0.99), ...legs(0.03, 0.15, -0.1, 0.15, 1.0) },
  },
]);
export function breast2(phase: number, sea = SEA): Swum {
  const c = sample(BREAST, mod1(phase), true);
  c.Y += sea;
  c.iyL += sea;
  c.iyR += sea;
  face(c, 0.25);
  return posed(c, BREAST_POLE);
}

// ── the crawl, flat: each arm enters ahead, pulls under the chest, leaves the water at the hip and comes
// over with its elbow high; the body rolls to the arm coming over (more at the chest than the hips),
// the face turned to breathe on the left; a flutter kick, six beats a cycle
const CRAWL_POLE: Hand["pole"] = [-0.5, 0, -1];
const CRAWL: Key[] = cycle2([
  {
    at: 0,
    c: { R: 0, ixR: -0.16, iyR: -0.08, izR: 1.0, iwR: 1, ixL: 0.26, iyL: -0.02, izL: 0.02, iwL: 1 },
  },
  {
    at: 0.25,
    c: { R: 0.9, ixR: -0.12, iyR: -0.55, izR: 0.42, iwR: 1, ixL: 0.42, iyL: 0.14, izL: 0.6, iwL: 1 },
  },
]);
export function crawl2(phase: number, sea = SEA): Swum {
  const u = mod1(phase);
  const c = sample(CRAWL, u, true);
  c.Y = sea - 0.12;
  c.iyL += sea;
  c.iyR += sea;
  c.hx = 1.47;
  // (the roll: the chest more than the hips; the legs stay nearer flat)
  c.hy = 0.55 * c.R;
  c.sy = 0.2 * c.R;
  c.cy = 0.2 * c.R;
  c.nx = -0.1;
  // (a breath to the left as the left arm comes over: the face turned out of the water)
  const b = win(u, 0.06, 0.46);
  c.ny = 0.35 * b - 0.15 * c.R * (1 - b);
  c.dy = 0.4 * b - 0.15 * c.R * (1 - b);
  for (const [S, off] of [
    ["L", 0],
    ["R", Math.PI],
  ] as const) {
    const th = 3 * TAU * u + off;
    c[`t${S}`] = 0.13 * Math.sin(th);
    c[`k${S}`] = 0.22 + 0.15 * Math.sin(th + 1.0);
    c[`f${S}`] = 1.3;
    c[`a${S}`] = 0.04;
  }
  return posed(c, CRAWL_POLE);
}

// ── under: the breaststroke under the water — a long glide, the arms swept wide and pulled through to
// the thighs, slid back up under the body, a kick as they go ahead; pitched by `pitch` (+ up)
const UNDER_POLE: Hand["pole"] = [-1, 0.1, -0.3];
const UNDER: Key[] = norm([
  { at: 0, c: { nx: 0.05, ...both(0.07, UNDER_Y + 0.02, 1.02), ...legs(0.03, 0.05, 0, 0.05, 1.35) } },
  { at: 0.3, c: { nx: 0.05, ...both(0.36, UNDER_Y - 0.15, 0.85), ...legs(0.03, 0.05, 0, 0.05, 1.35) } },
  { at: 0.5, c: { nx: 0.15, ...both(0.22, UNDER_Y - 0.1, -0.02), ...legs(0.03, 0.05, 0, 0.08, 1.3) } },
  { at: 0.68, c: { nx: 0.1, ...both(0.1, UNDER_Y - 0.24, 0.45), ...legs(0.05, 0.7, -0.7, 2.2, -0.4) } },
  { at: 0.8, c: { nx: 0.05, ...both(0.08, UNDER_Y - 0.08, 0.86), ...legs(0, 0.5, -0.3, 0.7, -0.2) } },
  { at: 0.92, c: { nx: 0.05, ...both(0.07, UNDER_Y, 1.0), ...legs(0.03, 0.1, -0.05, 0.1, 1.2) } },
]);
export function under2(phase: number, pitch = 0): Swum {
  const c = sample(UNDER, mod1(phase), true);
  c.Y = UNDER_Y;
  c.hx = Math.PI / 2 - pitch;
  const out = posed(c, UNDER_POLE);
  for (const S of ["L", "R"] as const) {
    const h = out.hands[S];
    if (h) h.at = pitchAt(h.at, UNDER_Y, -pitch);
  }
  return out;
}

// ── the duck dive (k 0..1 over DUCK_LEN): from the glide on the surface, bent at the waist — the trunk
// and the arms going down, the hips up at the surface — the legs lifted up over it to drive it under,
// into the glide under, head down. Heights by the surface (`sea`: the root sinks as it goes)
const DUCK: Key[] = norm([
  {
    at: 0,
    c: { hx: 1.32, Y: -0.3, nx: -0.4, dx: -0.3, ...both(0.15, -0.14, 1.0), ...legs(0.03, 0.06, 0, 0.06, 1.35) },
  },
  {
    at: 0.35,
    c: { hx: Math.PI / 2 + 0.95, Y: 0, nx: 0.1, ...both(0.12, -1.0, 0.55), ...legs(-0.95, 0.05, 0, 0.15, 1.2) },
  },
  {
    at: 0.7,
    c: { hx: Math.PI / 2 + 1.3, Y: -0.3, nx: 0.1, ...both(0.1, -1.55, 0.25), ...legs(-0.2, 0.05, 0, 0.1, 1.3) },
  },
]);
export function duck2(k: number, sea = SEA): Swum {
  const kk = clamp01(k);
  const c = sample(DUCK, Math.min(0.7, kk), false);
  c.Y += sea;
  c.iyL += sea;
  c.iyR += sea;
  const a = posed(c, UNDER_POLE);
  return mixSwum(a, under2(0, -0.6), smoother((kk - 0.6) / 0.4));
}

// ── the dive in (k 0..1 along its flight: 0 off the edge, 1 the hands at the water): leaning out with
// the arms swung ahead and the back foot's push, stretched level, then head down through the hands
const DIVE: Key[] = norm([
  {
    at: 0,
    c: {
      hx: 0.85,
      sx: 0.1,
      nx: -0.25,
      sL: -2.4,
      sR: -2.4,
      oL: 0.12,
      oR: 0.12,
      eL: -0.15,
      eR: -0.15,
      tR: -0.15,
      kR: 0.05,
      fR: 0.7,
      tL: -1.4,
      kL: 1.2,
      fL: 0.5,
    },
  },
  {
    at: 0.45,
    c: {
      hx: 1.6,
      nx: 0.05,
      sL: -3.05,
      sR: -3.05,
      oL: 0.06,
      oR: 0.06,
      eL: -0.05,
      eR: -0.05,
      ...legs(0.05, 0.03, 0, 0.05, 1.3),
    },
  },
  {
    at: 1,
    c: {
      hx: Math.PI / 2 + 0.65,
      nx: 0.15,
      sL: -3.1,
      sR: -3.1,
      oL: 0.04,
      oR: 0.04,
      eL: -0.03,
      eR: -0.03,
      ...legs(-0.05, 0.03, 0, 0.03, 1.35),
    },
  },
]);
export function dive2(k: number): Swum {
  const c = sample(DIVE, clamp01(k), false);
  c.Y = 0.95;
  return posed(c, undefined);
}

/** One of the modes at a phase (a cycle's 0..1; the duck dive's and the dive's k), pure. `sea`: the
 *  surface over the root (m); `pitch`: under, + up (rad). */
export function swim2(mode: SwimMode, phase: number, sea = SEA, pitch = 0): Swum {
  switch (mode) {
    case "tread":
      return tread2(phase, sea);
    case "breast":
      return breast2(phase, sea);
    case "crawl":
      return crawl2(phase, sea);
    case "under":
      return under2(phase, pitch);
    case "duck":
      return duck2(phase, sea);
    case "dive":
      return dive2(phase);
  }
}

// ── blending (Euler by Euler: the swim's poses are near each other) ────────────
export function mixSwum(a: Swum, b: Swum, u: number): Swum {
  if (u <= 0) return a;
  if (u >= 1) return b;
  const pose: Pose = { ...a.m.pose };
  for (const j of Object.keys(b.m.pose) as (keyof Pose)[]) {
    const x = a.m.pose[j] ?? [0, 0, 0];
    const y = b.m.pose[j] ?? [0, 0, 0];
    pose[j] = [lerp(x[0], y[0], u), lerp(x[1], y[1], u), lerp(x[2], y[2], u)];
  }
  const L = a.m.lift;
  const M = b.m.lift;
  const hands: Hands = {};
  for (const S of ["L", "R"] as const) {
    const p = a.hands[S];
    const q = b.hands[S];
    if (p && q)
      hands[S] = {
        at: [lerp(p.at[0], q.at[0], u), lerp(p.at[1], q.at[1], u), lerp(p.at[2], q.at[2], u)],
        w: lerp(p.w, q.w, u),
        pole: u < 0.5 ? p.pole : q.pole,
      };
    else if (p) hands[S] = { ...p, w: p.w * (1 - u) };
    else if (q) hands[S] = { ...q, w: q.w * u };
  }
  return { m: { pose, lift: [lerp(L[0], M[0], u), lerp(L[1], M[1], u), lerp(L[2], M[2], u)] }, hands };
}

// ── wading: over the walk (or the idle) as Locomotion composed it, `over` m of water over the feet
// (0.3 → 1.25 the core's wade): knee-deep the stepping leg lifted high, out of the water's way; deeper,
// the legs dragged through, leaning into it, the arms out and the hands lifted over the surface. The
// planted leg and the hips are left as they were (the feet stay where the walk put them).
const WADE_POLE: Hand["pole"] = [-1, -0.6, -0.2];
export function wade2(walk: Moved, over: number): Swum {
  const p: Pose = { ...walk.pose };
  const k = smoother((over - 0.3) / 0.95);
  if (k <= 0) return { m: walk, hands: {} };
  // (the high step's share: from a shin deep to the thighs; then it's dragged)
  const high = smoother((over - 0.2) / 0.3) * (1 - smoother((over - 0.75) / 0.4));
  const drag = smoother((over - 0.6) / 0.5);
  const add = (j: keyof Pose, dx: number, dy = 0, dz = 0) => {
    const r = p[j] ?? [0, 0, 0];
    p[j] = [r[0] + dx, r[1] + dy, r[2] + dz];
  };
  const knees = { L: p.kneeL?.[0] ?? 0, R: p.kneeR?.[0] ?? 0 };
  for (const S of ["L", "R"] as const) {
    // (only the leg that's swinging — its knee more bent than the other's, and past where the walk's
    // toes leave the ground — eased in from nothing: no corner, and the toes never dragged)
    // (lifted straight up off its toes — the knee bending twice what the thigh swings — then on up)
    const mine = knees[S] - 0.45;
    const swing = smoother((knees[S] - knees[S === "L" ? "R" : "L"]) / 0.35);
    const extra = mine > 0 ? (swing * mine ** 3) / (mine + 0.1) ** 2 : 0;
    add(`thigh${S}`, -extra * (1.5 * high + 0.4 * drag));
    add(`knee${S}`, extra * (2.0 * high - 0.2 * drag));
    add(`ankle${S}`, -extra * 0.4 * high);
    const out = S === "L" ? 1 : -1;
    add(`shoulder${S}`, -0.1 * k, 0, out * (0.25 + 0.2 * drag) * k);
    add(`elbow${S}`, -0.45 * k);
  }
  add("spine", 0.1 * drag);
  add("chest", 0.06 * drag);
  add("neck", -0.1 * drag);
  // (the hands over the water once it's up to them)
  const hw = smoother((over - 0.8) / 0.3);
  const hands: Hands = {};
  if (hw > 0) {
    // (no higher than the chest: deeper, it's swimming)
    const top = Math.min(over, 1.1);
    hands.L = { at: [0.42, top + 0.14, 0.32], w: hw, pole: WADE_POLE };
    hands.R = { at: [-0.44, top + 0.12, 0.2], w: hw, pole: WADE_POLE };
  }
  return { m: { pose: p, lift: walk.lift }, hands };
}

// ── the driver: what the world feeds it each frame, what it lays over the land's pose ──
export interface SwimIn {
  /** the walker's swim (2 afloat on the surface, 3 under; anything else: out of it, the swim let go) */
  swim: number;
  /** across the water (m/s: the body's own, the current taken off if it can be) */
  speed: number;
  /** crawling (the sprint gait) */
  fast: boolean;
  /** the surface over the root (m: the water's level − the body's z) */
  sea: number;
  /** under: the swim's pitch (rad, + up) */
  pitch?: number;
  /** in the air diving into deep water: 0 off the edge … 1 the hands at the water; else null */
  dive?: number | null;
}
export interface SwimOut extends Swum {
  /** how much of it over the land's pose (0..1: in and out of the water eased) */
  w: number;
}
/** A weight eased to where it's going: two critically damped springs, one after the other (its speed
 *  and its push both start from nothing — no pop where it sets off or arrives). */
class Ease {
  x = 0;
  private v = 0;
  private y = 0;
  private u = 0;
  constructor(private w: number) {}
  to(target: number, dt: number) {
    const w = this.w * 1.6;
    this.u += (w * w * (target - this.y) - 2 * w * this.u) * dt;
    this.y += this.u * dt;
    this.v += (w * w * (this.y - this.x) - 2 * w * this.v) * dt;
    this.x += this.v * dt;
    return Math.max(0, Math.min(1, this.x));
  }
  set(x: number) {
    this.x = this.y = x;
    this.v = this.u = 0;
  }
  get now() {
    return Math.max(0, Math.min(1, this.x));
  }
}

/** One swimmer's: the cycles' phases by the water covered, the modes eased into each other, the duck
 *  dive played as it goes under from the surface, the dive's way into the swim. */
export class Swim2 {
  private t = 0;
  private ph = { breast: 0, crawl: 0, under: 0 };
  private inW = new Ease(11);
  private moveW = new Ease(9);
  private fastW = new Ease(8);
  private underW = new Ease(7);
  private duck = -1;
  private dived = -1;
  private was = 0;
  /** Straight to where `inp` would ease it (spawned afloat, a clip begun mid-swim). */
  settle(inp: SwimIn) {
    this.inW.set(inp.swim >= 2 || inp.dive != null ? 1 : 0);
    this.moveW.set(smoother(inp.speed / 0.6));
    this.fastW.set(inp.fast ? 1 : 0);
    this.underW.set(inp.swim === 3 ? 1 : 0);
    this.was = inp.swim;
  }
  /** Phases back to the top of their cycles. */
  reset() {
    this.t = 0;
    this.ph = { breast: 0, crawl: 0, under: 0 };
    this.duck = -1;
    this.dived = -1;
  }
  update(dt: number, inp: SwimIn): SwimOut | null {
    const afloat = inp.swim >= 2;
    const under = inp.swim === 3;
    const diving = inp.dive != null;
    const inW = this.inW.to(afloat || diving ? 1 : 0, dt);
    if (!afloat && !diving && inW < 0.002) {
      this.inW.set(0);
      this.was = inp.swim;
      this.duck = -1;
      this.dived = -1;
      return null;
    }
    this.t += dt;
    const d = inp.speed * dt;
    this.ph.breast += d / STRIDE.breast;
    this.ph.crawl += d / STRIDE.crawl;
    this.ph.under += d / STRIDE.under;
    const moveW = this.moveW.to(smoother(inp.speed / 0.6), dt);
    const fastW = this.fastW.to(inp.fast ? 1 : 0, dt);
    const underW = this.underW.to(under ? 1 : 0, dt);
    // (gone under from the surface: the duck dive; back up: it's over)
    if (under && this.was === 2) this.duck = 0;
    else if (!under) this.duck = -1;
    else if (this.duck >= 0) this.duck += dt / DUCK_LEN;
    if (this.duck >= 1) this.duck = -1;
    this.was = inp.swim;
    if (diving) this.dived = 0;
    else if (this.dived >= 0) this.dived += dt;
    if (this.dived > DIVE_OUT) this.dived = -1;
    const w = inW;
    if (diving) return { ...dive2(inp.dive ?? 0), w };

    const pitch = inp.pitch ?? 0;
    let s: Swum | null = null;
    if (underW < 1)
      s = mixSwum(tread2(this.t / TREAD_PERIOD), mixSwum(breast2(this.ph.breast), crawl2(this.ph.crawl), fastW), moveW);
    if (underW > 0) {
      const low = mixSwum(under2(0, pitch), under2(this.ph.under, pitch), moveW);
      s = s ? mixSwum(s, low, underW) : low;
    }
    let out = s as Swum;
    if (this.duck >= 0) {
      const k = this.duck;
      out = mixSwum(out, duck2(k, inp.sea), smoother(k / 0.1) * (1 - smoother((k - 0.8) / 0.2)));
    }
    if (this.dived >= 0) out = mixSwum(dive2(1), out, smoother(this.dived / DIVE_OUT));
    return { ...out, w };
  }
}
