import { verbPath } from "@yutopia/shared/move";
import { body, type Ch, clamp01, HIP_H, handAt, type Key, type Moved, sample, smoother, steady, TAU } from "../moves";
import { handPose } from "../rig";

// Plan 58 phase 5 (docs/plan/58-the-animation.md): getting over things and onto them, the roll and
// the slide with the hands put where they go — on a top, an edge, the ground — and held there while
// the body goes on past them. Loaded with the hero's (`loadHero`), its own chunk: the hero's was full.
// The hands come out as targets in the body's own space (x its left, y up from its feet, z ahead) for
// the model to reach after everything else (`PersonModel.handsTo`): its arms are its own length.

/** The bundle's mark (tools/budget.mjs finds it by this). */
export const AIR_CHUNK = "yutopia-air";

export interface Hand {
  /** where: the body's own space, from its feet (x its left, y up, z ahead), m */
  at: [number, number, number];
  /** how much (0..1) */
  w: number;
  /** where its elbow points (the chest's space, as for the right arm; the left mirrors x) */
  pole?: [number, number, number];
}
export type Hands = { L?: Hand; R?: Hand };

/** A verb as it's going: how far through (0..1), and what it's over (the core's probe). */
export interface VerbAt {
  kind: string;
  t: number;
  /** the top over the feet; where the body met it and where it ends, ahead of the start; how far
   *  it carries (m) */
  h?: number;
  near?: number;
  far?: number;
  dist?: number;
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
// (the move core's body's radius: shared/grid.ts BODY_R — its probe measures from it)
const BODY_R = 0.22;
// (a time along the verb's own keys, by how far along the ground it's got: its marks — taking off,
// over the edge, pushing off, down — wherever the top is, near or far, thin or deep)
function along(at: number, marks: number[], keys: number[]): number {
  if (at <= marks[0]) return keys[0];
  for (let i = 1; i < marks.length; i++)
    if (at <= marks[i])
      return lerp(keys[i - 1], keys[i], (at - marks[i - 1]) / Math.max(1e-3, marks[i] - marks[i - 1]));
  return keys[keys.length - 1];
}
const on = (u: number, a: number, b: number, inn = 0.06, out = 0.06) =>
  smoother((u - a) / inn) * (1 - smoother((u - b) / out));
// (an elbow back and out, for a hand pushed down on something ahead)
const PUSH: [number, number, number] = [-0.5, 0.2, -1];

// ── the vault (KH3's speed vault): the right hand planted on the top, the body over it with the legs
// swung by to the left, the hand pushing off, down on the right foot running on
const VAULT2: Key[] = [
  {
    at: 0,
    c: {
      tL: -0.5,
      kL: 0.3,
      fL: 0,
      tR: 0.45,
      kR: 1.2,
      fR: 1.0,
      sR: -0.5,
      eR: -0.6,
      sL: 0.4,
      eL: -1.2,
      sx: 0.25,
      hL: -0.3,
    },
  },
  {
    at: 0.22,
    c: {
      tL: 0.25,
      kL: 0.25,
      fL: 0.75,
      tR: -1.25,
      kR: 1.5,
      fR: 0.3,
      sR: -1.2,
      eR: -0.3,
      oR: 0.1,
      wR: 0.6,
      sL: -0.2,
      oL: 0.6,
      eL: -0.7,
      sx: 0.65,
      hR: -1,
    },
  },
  {
    at: 0.46,
    c: {
      hy: 0.95,
      tL: -1.45,
      kL: 1.25,
      fL: 0.3,
      tR: -1.5,
      kR: 0.8,
      fR: 0.2,
      sR: -0.7,
      eR: -0.1,
      wR: 0.9,
      sL: -0.5,
      oL: 1.25,
      eL: -0.5,
      sx: 0.85,
      sz: -0.45,
      sy: -0.5,
      hR: -1,
      hL: -0.6,
    },
    ease: 0.4,
  },
  {
    at: 0.56,
    c: {
      hy: 0.3,
      tL: -0.35,
      kL: 1.0,
      fL: 0.2,
      tR: -1.05,
      kR: 1.4,
      fR: 0.3,
      sR: 0.1,
      eR: -0.4,
      wR: 0.6,
      sL: -0.6,
      oL: 0.8,
      eL: -0.6,
      sx: 0.3,
      sy: -0.15,
      hR: -0.6,
    },
  },
  {
    at: 0.74,
    c: {
      tL: 0.35,
      kL: 0.25,
      fL: 0.65,
      tR: -1.1,
      kR: 1.0,
      fR: 0.1,
      sR: 0.5,
      eR: -1.0,
      sL: -0.7,
      oL: 0.4,
      eL: -1.0,
      sx: 0.3,
    },
  },
  {
    at: 1,
    c: { tR: -0.5, kR: 0.35, fR: 0, tL: 0.45, kL: 1.3, fL: 1.1, sR: 0.5, eR: -1.3, sL: -0.7, eL: -1.5, sx: 0.3 },
  },
];

// ── the mantle (KH3's quick climb): both hands catch the edge, a foot on the face, pulled up, the
// right knee onto the top, pushed over on straight arms, up on that foot and standing
const MANTLE2: Key[] = [
  {
    at: 0,
    c: {
      tL: -0.6,
      kL: 1.0,
      fL: 0,
      tR: -0.5,
      kR: 1.0,
      fR: 0,
      sL: -1.6,
      sR: -1.6,
      eL: -0.6,
      eR: -0.6,
      sx: 0.3,
      hL: -1,
      hR: -1,
    },
  },
  {
    at: 0.18,
    c: {
      tL: 0.15,
      kL: 0.5,
      fL: 0.6,
      tR: -0.75,
      kR: 1.5,
      fR: 0.1,
      sL: -2.7,
      sR: -2.7,
      eL: -0.3,
      eR: -0.3,
      oL: 0.2,
      oR: 0.2,
      sx: 0.05,
      nx: -0.2,
      hL: 0.6,
      hR: 0.6,
    },
  },
  {
    at: 0.42,
    c: {
      tL: 0.25,
      kL: 1.0,
      fL: 0.6,
      tR: -1.45,
      kR: 2.1,
      fR: 0.4,
      sL: -1.1,
      sR: -1.1,
      eL: -2.1,
      eR: -2.1,
      oL: 0.35,
      oR: 0.35,
      sx: 0.45,
      hL: 0.6,
      hR: 0.6,
    },
  },
  {
    at: 0.62,
    c: {
      tL: 0.15,
      kL: 1.2,
      fL: 0.7,
      tR: -1.95,
      kR: 2.35,
      fR: 0.5,
      sL: 0.35,
      sR: 0.35,
      eL: -0.25,
      eR: -0.25,
      oL: 0.25,
      oR: 0.25,
      wL: 0.9,
      wR: 0.9,
      sx: 0.85,
      hL: -1,
      hR: -1,
    },
  },
  {
    at: 0.84,
    c: { tR: -0.95, kR: 1.4, fR: 0, tL: 0.35, kL: 0.9, fL: 0.7, sL: -0.2, sR: 0.1, eL: -0.7, eR: -0.6, sx: 0.4 },
  },
  {
    at: 1,
    c: { tR: -0.15, kR: 0.25, fR: 0, tL: 0.05, kL: 0.2, fL: 0, sL: 0.05, sR: 0.05, eL: -0.3, eR: -0.3, sx: 0.08 },
  },
];

// ── the roll (the dodge): a dive, both hands to the ground ahead, tucked over the right shoulder
// once round, and up onto the feet running
const TUCK: Ch = {
  tL: -2.05,
  kL: 2.45,
  fL: 0.4,
  tR: -1.95,
  kR: 2.4,
  fR: 0.4,
  sL: -1.0,
  sR: -0.85,
  eL: -1.6,
  eR: -1.5,
  oL: 0.25,
  oR: 0.35,
  sx: 0.75,
  nx: 0.5,
  dx: 0.45,
  hy: -0.25,
  sy: -0.2,
  hL: 1,
  hR: 1,
};
const ROLL2: Key[] = [
  {
    at: 0,
    c: {
      tL: -0.9,
      kL: 1.3,
      fL: 0,
      tR: -0.3,
      kR: 1.4,
      fR: 0.6,
      sL: -1.3,
      sR: -1.3,
      eL: -0.3,
      eR: -0.3,
      sx: 0.6,
      hL: -1,
      hR: -1,
    },
  },
  {
    at: 0.14,
    c: {
      tL: -1.3,
      kL: 1.9,
      fL: 0.2,
      tR: -0.6,
      kR: 2.0,
      fR: 0.8,
      sL: -1.2,
      sR: -1.2,
      eL: -0.4,
      eR: -0.4,
      oL: 0.3,
      oR: 0.3,
      wL: 0.9,
      wR: 0.9,
      sx: 1.0,
      nx: 0.45,
      dx: 0.3,
      hL: -1,
      hR: -1,
    },
  },
  { at: 0.3, c: TUCK },
  { at: 0.74, c: TUCK },
  {
    at: 0.9,
    c: {
      tL: -1.2,
      kL: 1.8,
      fL: 0,
      tR: -0.5,
      kR: 1.9,
      fR: 0.7,
      sL: -0.6,
      sR: -0.7,
      eL: -1.0,
      eR: -0.9,
      sx: 0.5,
      dx: -0.1,
    },
  },
  {
    at: 1,
    c: { tL: -0.5, kL: 0.5, fL: 0, tR: 0.4, kR: 1.2, fR: 1.0, sL: 0.5, eL: -1.3, sR: -0.6, eR: -1.4, sx: 0.3 },
  },
];

/** A verb's body (plan 58 phase 5b) and where its hands go: the vault, the mantle and the roll keyed
 *  by where the body's got to along the core's own path; the slide's hand skimming the ground. */
export function verb2Pose(V: VerbAt, slide: (t: number) => Moved): { m: Moved; hands: Hands | null } {
  const u = clamp01(V.t);
  if (V.kind === "vault") {
    const h = V.h ?? 0.6;
    const near = V.near ?? 0.5;
    const far = V.far ?? near + BODY_R + 0.4;
    const dist = V.dist ?? 1.6;
    const p = verbPath("vault", u, h, dist, undefined, V.near, V.far);
    const top = near + BODY_R;
    // (off the ground as it rises, over its edge, pushing off as it clears the far side, down)
    // (…and a deep top: a step on it after the hand's pushed off, then off its far edge)
    const off = Math.max(top + 0.5, far + BODY_R - 0.2);
    const k = along(p.ahead, [0, near - 0.45, top + 0.1, top + 0.42, off, dist], [0, 0.22, 0.46, 0.56, 0.74, 1]);
    const m = body(steady(sample(VAULT2, k, false)));
    const w = on(k, 0.27, 0.52, 0.08, 0.05);
    return { m, hands: w > 0 ? { R: { at: [-0.12, h - p.up, top + 0.12 - p.ahead], w, pole: PUSH } } : null };
  }
  if (V.kind === "mantle") {
    const h = V.h ?? 1.2;
    const near = V.near ?? 0.3;
    const p = verbPath("mantle", u, h, V.dist, undefined, V.near);
    const c = sample(MANTLE2, u, false);
    // (the hips by the hands, not the feet: hung from the edge, pulled up to it, over it)
    const m = body(steady(c));
    const w = on(u, 0.12, 0.7, 0.05, 0.08);
    const edge = near + BODY_R + 0.05 - p.ahead;
    const y = h - p.up;
    return {
      m,
      hands:
        w > 0
          ? {
              L: { at: [0.19, y, edge], w, pole: u > 0.5 ? PUSH : [-0.6, -0.4, -0.6] },
              R: { at: [-0.19, y, edge], w, pole: u > 0.5 ? PUSH : [-0.6, -0.4, -0.6] },
            }
          : null,
    };
  }
  if (V.kind === "roll") {
    const c = sample(ROLL2, u, false);
    const m = body(steady(c));
    // (round the hips once, about them; the curled back down, the hips ride higher — the head and
    // shoulders further from them than the tucked feet)
    const turn = TAU * smoother((u - 0.16) / 0.62);
    const hp = m.pose.hips ?? [0, 0, 0];
    m.pose.hips = [hp[0] + turn, hp[1], hp[2]];
    const into = Math.min(1, turn / 0.6, (TAU - turn) / 0.6);
    m.lift = [m.lift[0], m.lift[1] + 0.42 * (1 - Math.cos(turn + 1.4)) * 0.5 * Math.max(0, into), m.lift[2]];
    // (the hands down on the ground ahead as it dives, held there as the body goes over them)
    const p = verbPath("roll", u);
    const w = on(u, 0.08, 0.3, 0.05, 0.06);
    const z = 0.62 - p.ahead;
    return {
      m,
      hands: w > 0 ? { L: { at: [0.17, 0.03, z], w, pole: PUSH }, R: { at: [-0.17, 0.03, z], w, pole: PUSH } } : null,
    };
  }
  if (V.kind === "slide") {
    const m = slide(u);
    // (the trailing hand on the ground beside the hips as it reclines, skimming along with her)
    const w = on(u, 0.22, 0.78, 0.08, 0.1);
    return { m, hands: w > 0 ? { L: { at: [0.32, 0.04, -0.18], w: w * 0.9, pole: [-0.7, 0, -0.7] } } : null };
  }
  return { m: slide(u), hands: null };
}

/** A heavy landing's hand on the ground (5a's, its weight `w`): beside the right foot, ahead. */
export const landHands = (w: number): Hands | null =>
  w > 0.02 ? { R: { at: [-0.2, 0.03, 0.42], w, pole: [-0.6, 0, -0.8] } } : null;

// ── 5c: Flowmotion on the new body (plan 56's moves, moves.ts `flowPose`): the hands taking hold —
// round the pole, over the ledge's edge, held there as the body climbs past them — the fingers shut
// on it; the toes bent as a foot drives off a wall's face
const HANG_H = 1.45; // the core's hang: the feet this far under the top (flow-moves.ts)
const CLIMB_FWD = 0.6; // …and its climb's way onto it
const shut = (m: Moved, S: "L" | "R", k: number) => Object.assign(m.pose, handPose(S === "L" ? 1 : -1, handAt(k)));

/** Flowmotion's body (`f` the move's: its kind, `t`, its side) with the hands placed and holding, the
 *  toes driving: `m` the move's own pose, changed in place. */
export function flow2(m: Moved, f: { kind: string; t: number; side: number }): Hands | null {
  if (f.kind === "wallrun" || f.kind === "wallside") {
    // (a foot up on its toes on the face — its pitch past flat — has them bent back as it drives off)
    for (const S of ["L", "R"] as const) {
      const p = (m.pose[`thigh${S}`]?.[0] ?? 0) + (m.pose[`knee${S}`]?.[0] ?? 0) + (m.pose[`ankle${S}`]?.[0] ?? 0);
      m.pose[`toe${S}`] = [-0.9 * smoother((p - 0.3) / 0.5), 0, 0];
    }
    return null;
  }
  if (f.kind === "swing") {
    // (round the pole on the hand by it, shut on it at a reach over the head — the pole's upright, so
    // anywhere up it — the body out from it)
    const S = f.side > 0 ? "L" : "R";
    shut(m, S, 1);
    shut(m, S === "L" ? "R" : "L", -0.6);
    // (flung out further: tipped over toward it, the head came to the pole — out by an arm's length)
    m.lift = [m.lift[0] - f.side * 0.18, m.lift[1], m.lift[2]];
    const hp = m.pose.hips ?? [0, 0, 0];
    m.pose.hips = [hp[0], hp[1], hp[2] + f.side * 0.25];
    return { [S]: { at: [f.side * 0.42, 1.95, 0.02], w: smoother(f.t / 0.08), pole: [-0.2, -1, -0.6] } };
  }
  if (f.kind === "hang" || f.kind === "climb") {
    // (both hands over the edge — up, then held where they took it as the climb goes on past)
    const u = f.kind === "climb" ? clamp01(f.t) : 0;
    const up = smoother(Math.min(1, u / 0.65));
    const over = smoother(Math.max(0, (u - 0.35) / 0.65));
    const y = HANG_H * (1 - up);
    const z = 0.12 - CLIMB_FWD * over;
    const w = 1 - smoother((u - 0.62) / 0.2);
    const grip = u > 0.4 ? -1 : 0.75;
    shut(m, "L", grip);
    shut(m, "R", grip);
    // (pulling up, the elbows back; pushed over, behind)
    const pole: [number, number, number] = u > 0.4 ? PUSH : [-0.6, -0.3, -0.6];
    return w > 0.01 ? { L: { at: [0.2, y, z], w, pole }, R: { at: [-0.2, y, z], w, pole } } : null;
  }
  return null;
}

// ── 5d: up again after the ragdoll — from on its back: sat up, the knees drawn in, onto a foot and
// a knee, up; from on its front: pushed up on the hands, the knees under, a foot forward, up. `up`
// the hips' height over standing (m)
const LIE = 0.11 - HIP_H;
const KNEEL: Ch = {
  hx: 0.3,
  tR: -1.55,
  kR: 1.6,
  fR: 0,
  tL: 0.15,
  kL: 1.65,
  fL: 1.2,
  sx: 0.25,
  sR: -0.5,
  eR: -1.0,
  sL: 0.1,
  eL: -0.4,
  up: 0.5 - HIP_H,
};
const RISING: Ch = {
  hx: 0.15,
  tR: -0.85,
  kR: 1.0,
  fR: 0,
  tL: 0.25,
  kL: 0.95,
  fL: 0.6,
  sx: 0.25,
  sR: -0.2,
  eR: -0.7,
  sL: 0.1,
  eL: -0.4,
  up: -0.14,
};
const STOOD: Ch = {
  tL: 0.02,
  kL: 0.05,
  fL: 0,
  tR: 0,
  kR: 0.05,
  fR: 0,
  sx: 0.03,
  sL: 0.04,
  sR: 0.04,
  eL: -0.2,
  eR: -0.2,
  up: -0.005,
};
const UP_FROM_BACK: Key[] = [
  {
    at: 0,
    c: {
      hx: -1.5,
      tL: 0,
      tR: 0,
      kL: 0.05,
      kR: 0.05,
      fL: 0.3,
      fR: 0.3,
      sL: 0.1,
      sR: 0.1,
      oL: 0.25,
      oR: 0.25,
      eL: -0.3,
      eR: -0.3,
      up: LIE,
    },
  },
  {
    at: 0.22,
    c: {
      hx: -0.4,
      tL: -1.15,
      tR: -1.15,
      kL: 0.15,
      kR: 0.15,
      fL: 0.2,
      fR: 0.2,
      sL: 0.6,
      sR: 0.6,
      oL: 0.3,
      oR: 0.3,
      eL: -0.15,
      eR: -0.15,
      sx: 0.25,
      up: 0.13 - HIP_H,
    },
  },
  {
    at: 0.42,
    c: {
      hx: 0.2,
      tR: -2.45,
      kR: 2.4,
      fR: 0,
      tL: -1.5,
      kL: 0.7,
      fL: 0.3,
      sx: 0.4,
      sL: -0.8,
      eL: -0.6,
      sR: 0.5,
      eR: -0.2,
      oR: 0.3,
      up: 0.16 - HIP_H,
    },
  },
  { at: 0.62, c: KNEEL },
  { at: 0.82, c: RISING },
  { at: 1, c: STOOD },
];
const UP_FROM_FRONT: Key[] = [
  {
    at: 0,
    c: {
      hx: 1.5,
      tL: 0,
      tR: 0,
      kL: 0.05,
      kR: 0.05,
      fL: 0.7,
      fR: 0.7,
      sL: -0.5,
      sR: -0.5,
      oL: 0.6,
      oR: 0.6,
      eL: -1.6,
      eR: -1.6,
      dx: -0.4,
      up: 0.12 - HIP_H,
    },
  },
  {
    at: 0.2,
    c: {
      hx: 1.25,
      tL: 0.05,
      tR: 0.05,
      kL: 0.3,
      kR: 0.3,
      fL: 0.7,
      fR: 0.7,
      sL: -1.45,
      sR: -1.45,
      oL: 0.25,
      oR: 0.25,
      eL: -0.15,
      eR: -0.15,
      dx: -0.4,
      up: 0.3 - HIP_H,
    },
  },
  {
    at: 0.42,
    c: {
      hx: 0.9,
      tL: -0.9,
      tR: -0.9,
      kL: 1.65,
      kR: 1.65,
      fL: 1.2,
      fR: 1.2,
      sL: -0.95,
      sR: -0.95,
      oL: 0.2,
      oR: 0.2,
      eL: -0.15,
      eR: -0.15,
      dx: -0.3,
      up: 0.5 - HIP_H,
    },
  },
  { at: 0.62, c: KNEEL },
  { at: 0.82, c: RISING },
  { at: 1, c: STOOD },
];
/** The get-up's length, s. */
export const GETUP_LEN = 1.5;

/** Getting up, `u` (0..1) through it, from on its back (`back`) or its front: the body and where its
 *  hands go down on the ground. */
export function getUp2Pose(u: number, back: boolean): { m: Moved; hands: Hands | null } {
  const m = body(steady(sample(back ? UP_FROM_BACK : UP_FROM_FRONT, clamp01(u), false)));
  if (back) {
    // (sitting up, the hand behind takes the weight)
    const w = on(u, 0.12, 0.46, 0.08, 0.08);
    return { m, hands: w > 0 ? { R: { at: [-0.24, 0.03, -0.22], w, pole: [-0.6, 0, 0.6] } } : null };
  }
  // (pushed up on both, under the shoulders, then the body back over the knees off them)
  const w = on(u, 0.06, 0.5, 0.08, 0.08);
  const z = 0.5 - 0.15 * smoother(u / 0.45);
  return {
    m,
    hands: w > 0 ? { L: { at: [0.2, 0.03, z], w, pole: PUSH }, R: { at: [-0.2, 0.03, z], w, pole: PUSH } } : null,
  };
}

export { ABOUT_DOWN, ABOUT_LEN, AboutTurn } from "./about";
export { Downed, RagdollRig } from "./rag";
