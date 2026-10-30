import { type HeldKind, heldState, type JumpNow } from "@yutopia/shared";
import { Euler, Quaternion } from "three";
import type { Hands } from "./anim/acts";
import { actsNow, heroNow, type LocoIn, Locomotion, loadHero } from "./locomotion";
import type { Reach } from "./model";
import { LEG_K } from "./moves";
import { type Euler3, HANDS, handPose, JOINTS, type JointName, type Pose, REST } from "./rig";

// How a 3D person moves (docs/plan/22-people-3d.md, P3): the same layers, in
// the same order and with the same timings, as the 2D people's `Motion`
// (art/avatar-motion.ts) — still pose, idle life, the walk, something held,
// busy at something, the phone, sitting down, the face, a social act, an
// emote — but posed as joint rotations on the 3D rig (rig.ts): the person
// faces +z, L is their left (+x); thigh/shoulder x < 0 swings forward, knee
// x > 0 bends, elbow x < 0 bends, head x > 0 looks down, head y > 0 turns to
// their left. Layers blend by quaternion slerp per joint.

export interface MotionIn {
  dist: number; // tiles moved this frame
  walking: boolean;
  speed: number; // tiles / s while walking
  sit: boolean;
  typing: boolean; // seated at a desk
  speaking: boolean;
  emote: string; // the current emote ("" for none)
  reduced: boolean; // reduced motion: no idle life, short gestures
  held?: { kind: HeldKind; since: number } | null; // carrying something, `since` ms
  busy?: string; // using something (shared USES)
  act?: { what: string; t: number; len: number; with?: [number, number] } | null; // with someone (shared SOCIAL, or "take"); (plan 58 6d) where they are in my own space: x my left, z ahead
  /** (plan 58 6a) how far the hips go down onto the seat (m, − down: the view's `sitDrop`) */
  seatDrop?: number;
  phone?: { state: string; pose: string; ringing: boolean } | null;
  jump?: JumpNow | null; // jumping (shared/jump.ts): its stage
  /** how they move (docs/plan/29-the-move.md M6): the gaits, crouching, aiming, the jump's arc
   *  and landings come from Locomotion (the old walk and jump layers otherwise) */
  loco?: Omit<LocoIn, "dist" | "speed" | "jump" | "reduced">;
}

export interface MotionOut {
  pose: Pose;
  /** the hips moved from where they stand: a bob, a hop, a settle */
  lift: Euler3;
  blink: number;
  talk: number;
  /** plan 58 G.D: where the eyes look (−1..1: x to the left, y up), when they're the gaze's */
  eyes?: [number, number];
  /** 0 → 1 over a sit-down or get-up (the view lowers the hips onto the seat with it) */
  settle: number;
  /** the right hand is up at the mouth (a sip): what it holds tips */
  sip: number;
  /** hands put on the body (IK: the phone at the ear, the mug at the mouth…) */
  reach: Reach;
  /** (plan 58 phase 6) hands put on things — the keys, the knees, the pad, the other one's hand — in
   *  the body's own space (x its left, y up from its feet, z ahead): `PersonModel.handsTo` */
  hands?: import("./anim/acts").Hands | null;
}

const TAU = Math.PI * 2;
export const ease = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
const clamp01 = (t: number) => Math.max(0, Math.min(1, t));
// tiles per walk cycle (two steps) at walking speed: with the thigh swinging
// ±27° the planted foot stays put
export const STRIDE = 1.2 * LEG_K;
const SWING = 0.48;

/** The right side's version of a left-side rotation (mirrored across the body). */
const mirror = (r: Euler3): Euler3 => [r[0], -r[1], -r[2]];
/** A pose with both arms (or legs) given as the left one. */
function both(
  p: Pose,
  j: "shoulder" | "elbow" | "wrist" | "thigh" | "knee" | "ankle",
  L: Euler3,
  R: Euler3 = mirror(L),
): Pose {
  p[`${j}L` as JointName] = L;
  p[`${j}R` as JointName] = R;
  return p;
}

// ── quaternion blending ─────────────────────────────────────────────────────
const qa = new Quaternion();
const qb = new Quaternion();
const eu = new Euler();
function toQ(r: Euler3 | undefined, q: Quaternion) {
  return r ? q.setFromEuler(eu.set(r[0], r[1], r[2])) : q.identity();
}
/** `base` with `over` laid on it at weight w (joints `over` doesn't name stay as they were). */
export function blend(base: Pose, over: Pose, w: number): Pose {
  if (w <= 0) return base;
  const out: Pose = { ...base };
  for (const j of Object.keys(over) as JointName[]) {
    toQ(base[j], qa);
    toQ(over[j], qb);
    qa.slerp(qb, Math.min(1, w));
    eu.setFromQuaternion(qa);
    out[j] = [eu.x, eu.y, eu.z];
  }
  return out;
}
/** Add small turns on top (breathing, a glance). */
function add(p: Pose, j: JointName, dx: number, dy = 0, dz = 0) {
  const r = p[j] ?? [0, 0, 0];
  p[j] = [r[0] + dx, r[1] + dy, r[2] + dz];
}

// ── still poses ─────────────────────────────────────────────────────────────
export function standPose(): Pose {
  return { ...REST };
}
export function seatedPose(typing: boolean): Pose {
  const p: Pose = { spine: [typing ? 0.1 : 0.05, 0, 0], head: [typing ? 0.12 : 0, 0, 0] };
  both(p, "thigh", [-1.48, 0, 0.04]);
  both(p, "knee", [1.42, 0, 0]);
  both(p, "ankle", [0.06, 0, 0]);
  // hands on the lap, or forward on the keys
  both(p, "shoulder", typing ? [-0.78, 0, 0.06] : [-0.42, 0, 0.1]);
  both(p, "elbow", typing ? [-0.95, 0, 0] : [-0.9, 0, 0]);
  both(p, "wrist", typing ? [0.15, 0, 0] : [0.05, 0, 0]);
  return p;
}

/** In a car (docs/plan/28-the-car.md): reclined against the seat's back, the legs out to the
 *  pedals; a driver's hands go on the rim afterwards (PersonModel.reachTo), a passenger's
 *  rest on the lap. */
export function carPose(driver: boolean): Pose {
  const p: Pose = { spine: [driver ? -0.16 : -0.24, 0, 0], neck: [0.1, 0, 0], head: [0.08, 0, 0] };
  both(p, "thigh", [-1.6, 0, driver ? 0.05 : 0.08]);
  both(p, "knee", driver ? [1.1, 0, 0] : [1.35, 0, 0]);
  both(p, "ankle", [driver ? -0.25 : -0.05, 0, 0]);
  both(p, "shoulder", driver ? [-0.95, 0, 0.14] : [-0.5, 0, 0.12]);
  both(p, "elbow", driver ? [-0.6, 0, 0] : [-1.05, 0, 0]);
  both(p, "wrist", [0.05, 0, 0]);
  return p;
}

/** The walk at `phase` (0..1, distance-driven); `k` scales the swing (running). */
export function walkPose(phase: number, k = 1): { pose: Pose; lift: Euler3 } {
  const s = Math.sin(TAU * phase);
  const c = Math.cos(TAU * phase);
  const A = SWING * k;
  const p: Pose = {};
  // legs: the swinging one bends at the knee as it passes under the hips
  p.thighL = [-A * s, 0, 0.02];
  p.thighR = [A * s, 0, -0.02];
  p.kneeL = [0.15 + 0.85 * k * Math.max(0, c) ** 2, 0, 0];
  p.kneeR = [0.15 + 0.85 * k * Math.max(0, -c) ** 2, 0, 0];
  p.ankleL = [-0.25 * Math.max(0, c) + 0.15 * Math.max(0, -s), 0, 0];
  p.ankleR = [-0.25 * Math.max(0, -c) + 0.15 * Math.max(0, s), 0, 0];
  // arms swing against the legs
  p.shoulderL = [0.42 * k * s, 0, 0.1];
  p.shoulderR = [-0.42 * k * s, 0, -0.1];
  p.elbowL = [-0.28 - 0.2 * Math.max(0, -s) * k, 0, 0];
  p.elbowR = [-0.28 - 0.2 * Math.max(0, s) * k, 0, 0];
  // the hips turn with the stride, the chest against them; the weight sways over the planted foot
  p.hips = [0, 0.08 * s * k, 0.035 * c];
  p.spine = [0.04 * k, -0.11 * s * k, -0.035 * c];
  p.head = [0, 0.04 * s, 0.02 * c];
  // lowest when the legs are furthest apart
  return { pose: p, lift: [0, -0.028 * k * s * s, 0] };
}

// ── what the hands do ───────────────────────────────────────────────────────
export function holdPose(): Pose {
  // a mug at the waist in the right hand
  return { shoulderR: [-0.3, 0, -0.12], elbowR: [-1.45, 0.25, 0], wristR: [0.1, 0, 0], ...handPose(-1, HANDS.grip) };
}
export function sipPose(): Pose {
  // up at the mouth
  return {
    shoulderR: [-1.05, 0, -0.3],
    elbowR: [-2.25, 0.45, 0],
    wristR: [-0.3, 0, 0],
    head: [-0.16, 0, 0],
    ...handPose(-1, HANDS.grip),
  };
}
export const sipEnv = (s: number) => (s < 0 ? 0 : ease(s / 0.28) * (1 - ease((s - 0.72) / 0.28)));

// Using something (shared USES), standing.
export function busyPose(what: string, t: number): { pose: Pose; lift: Euler3 } {
  const p: Pose = {};
  let lift: Euler3 = [0, 0, 0];
  const burst = Math.sin(t * 0.9) > -0.2 ? 1 : 0;
  switch (what) {
    case "coffee":
    case "water":
    case "vending":
      // reaching out to press its button
      p.shoulderR = [-1.22 + 0.06 * Math.sin(t * 3), 0, -0.1];
      p.elbowR = [-0.4, 0, 0];
      p.wristR = [0.35, 0, 0];
      p.spine = [0.07, 0, 0];
      p.head = [0.18, 0, 0];
      break;
    case "throw":
      // the follow-through: the arm out and up, the body leaning in
      p.shoulderR = [-2.45, 0, -0.25];
      p.elbowR = [-0.15, 0, 0];
      p.spine = [0.22, -0.15, 0];
      p.thighL = [-0.38, 0, 0];
      p.kneeL = [0.25, 0, 0];
      p.thighR = [0.22, 0, 0];
      p.head = [-0.06, 0, 0];
      break;
    case "arcade": {
      // both hands on the controls, mashing
      const m = 0.12 * Math.sin(t * 22);
      both(p, "shoulder", [-0.95, 0, 0.04]);
      p.elbowL = [-0.78 + m, 0, 0];
      p.elbowR = [-0.78 - m, 0, 0];
      both(p, "wrist", [0.2, 0, 0]);
      p.spine = [0.12, 0.05 * Math.sin(t * 1.3), 0];
      p.head = [0.22, 0, 0];
      break;
    }
    case "piano": {
      // hands along the keys, swaying with it
      const sw = Math.sin(t * 1.1);
      p.shoulderL = [-0.92, 0, 0.12 + 0.12 * Math.sin(t * 1.7)];
      p.shoulderR = [-0.92, 0, -0.12 - 0.12 * Math.sin(t * 1.7 + 1.3)];
      both(p, "elbow", [-0.95, 0, 0]);
      p.wristL = [0.25 + 0.15 * Math.max(0, Math.sin(t * 9)), 0, 0];
      p.wristR = [0.25 + 0.15 * Math.max(0, Math.sin(t * 9 + 2)), 0, 0];
      p.spine = [0.1, 0, 0.06 * sw];
      p.head = [0.18, 0, 0.08 * sw];
      break;
    }
    case "slotcar":
    case "gamepad": {
      // the controller held in front, leaning into the corners
      p.shoulderL = [-0.55, 0, -0.12];
      p.shoulderR = [-0.55, 0, 0.12];
      both(p, "elbow", [-1.55, 0, 0]);
      p.wristR = [0.1 + 0.12 * Math.max(0, Math.sin(t * 5)), 0, 0];
      p.wristL = [0.1, 0, 0];
      p.spine = [0.08, 0, 0.1 * Math.sin(t * 0.8)];
      p.head = [0.25, 0, 0.05 * Math.sin(t * 0.8)];
      break;
    }
    case "pool":
      // bent low over the cue: the bridge hand out in front, the back hand at the hip
      p.spine = [0.68, 0, 0];
      p.head = [-0.52, 0, 0];
      p.shoulderL = [-1.45, 0, 0.12];
      p.elbowL = [-0.12, 0, 0];
      p.wristL = [-0.3, 0, 0];
      p.shoulderR = [-0.12 + 0.07 * Math.sin(t * 1.2), 0, -0.28];
      p.elbowR = [-1.3, 0, 0];
      p.thighL = [-0.38, 0, 0];
      p.kneeL = [0.38, 0, 0];
      p.thighR = [0.16, 0, 0];
      lift = [0, -0.03, 0];
      break;
    case "pong":
      // ready: the racket hand up in front, knees soft, bouncing on the toes
      p.shoulderR = [-0.85, 0, -0.28];
      p.elbowR = [-1.4, 0, 0];
      p.shoulderL = [-0.42, 0, 0.22];
      p.elbowL = [-1.2, 0, 0];
      both(p, "thigh", [-0.38, 0, 0.05]);
      both(p, "knee", [0.62, 0, 0]);
      both(p, "ankle", [-0.22, 0, 0]);
      p.spine = [0.25, 0, 0];
      p.head = [-0.18, 0, 0];
      lift = [0, -0.06 + 0.018 * Math.abs(Math.sin(t * 6)), 0];
      break;
    case "computer":
      // standing at a keyboard, typing in bursts
      both(p, "shoulder", [-0.78, 0, 0.05]);
      p.elbowL = [-1.15 + 0.06 * burst * Math.sin(t * 19 + 1.7), 0, 0];
      p.elbowR = [-1.15 + 0.06 * burst * Math.sin(t * 19), 0, 0];
      both(p, "wrist", [0.2, 0, 0]);
      p.spine = [0.08, 0, 0];
      p.head = [0.14, 0.04 * Math.sin(t * 0.7), 0];
      break;
    case "whiteboard":
      // a hand up at the board, writing
      p.shoulderR = [-2.2 + 0.07 * Math.sin(t * 3), 0, -0.32 + 0.1 * Math.sin(t * 4.3)];
      p.elbowR = [-0.18, 0, 0];
      p.wristR = [-0.35, 0, 0];
      p.spine = [-0.03, 0, 0];
      p.head = [-0.16, -0.1, 0];
      break;
  }
  return { pose: p, lift };
}

// The phone in the hand (shared/phone.ts PHONE_STATES), a pose for a photo with the free hand.
// (the phone held in the right hand, the thumb free over its screen)
const PHONE_HAND = { fingers: 1.05, index: 0.95, thumb: 0.2 };
export function phonePose(state: string, pose: string, t: number, talking: boolean): Pose {
  const p: Pose = { ...handPose(-1, PHONE_HAND) };
  switch (state) {
    case "text": {
      // both hands low in front, thumbs going, head down over it
      const th = 0.08 * Math.sin(t * 13);
      p.shoulderL = [-0.42, 0, -0.14];
      p.shoulderR = [-0.42, 0, 0.14];
      both(p, "elbow", [-1.55, 0, 0]);
      p.wristL = [-0.15 + th, 0, 0];
      p.wristR = [-0.15 - th, 0, 0];
      p.head = [0.45, 0, 0];
      p.spine = [0.05, 0, 0];
      break;
    }
    case "call":
      // at the ear; the free hand talks along
      // (the upper arm out to the side, the forearm folded up in that plane to the head)
      p.shoulderR = [-0.28, 0, -1.02];
      p.elbowR = [-0.35, 0, -2.45];
      p.wristR = [0, 0.3, 0];
      p.head = [0.04, 0, -0.14];
      if (talking) {
        p.shoulderL = [-0.55 + 0.12 * Math.sin(t * 2.3), 0, 0.22];
        p.elbowL = [-1.35 + 0.15 * Math.sin(t * 3.1), 0, 0];
        p.wristL = [0, -0.6, 0];
      }
      break;
    case "video":
      // held up in front of the face, talking to it
      p.shoulderR = [-1.3, 0, -0.1];
      p.elbowR = [-1.2, 0, 0];
      p.wristR = [-0.2, 0, 0];
      p.head = [-0.05, 0, 0];
      break;
    case "photo":
      // raised in both hands, aiming
      p.shoulderL = [-1.38, 0, -0.2];
      p.shoulderR = [-1.38, 0, 0.2];
      both(p, "elbow", [-1.15, 0, 0]);
      p.head = [-0.02, 0, 0];
      break;
    case "selfie":
      // the arm out and up, the screen looking back at them
      p.shoulderR = [-1.65, 0.3, -0.7];
      p.elbowR = [-0.25, 0, 0];
      p.wristR = [-0.4, 0, 0];
      p.head = [-0.12, -0.28, 0.08];
      break;
  }
  if (state === "selfie" || state === "photo") {
    // the free hand poses for it
    // (the hand's own shape: plan 58 phase 2c — the index out, the thumb up; peace is the index and
    // the rest half open, as near as one hinge for the other fingers gets)
    if (pose === "peace") {
      p.shoulderL = [-1.05, 0, 0.42];
      p.elbowL = [-2.1, 0, 0];
      p.wristL = [0, 0, 0.3];
      Object.assign(p, handPose(1, { fingers: 0.6, index: 0, thumb: 0.9 }));
    } else if (pose === "point") {
      p.shoulderL = [-1.45, 0, 0.1];
      p.elbowL = [-0.06, 0, 0];
      Object.assign(p, handPose(1, HANDS.point));
    } else if (pose === "thumbs") {
      p.shoulderL = [-0.8, 0, 0.25];
      p.elbowL = [-1.2, 0, 0];
      p.wristL = [0, 0, -1.25];
      Object.assign(p, handPose(1, HANDS.thumbsUp));
    }
  }
  return p;
}

// Two people at it: the right arm reaches out; the hands meet at CONTACT
// (0.45 of the way) — a slap, a bump, a clink — with a little push forward.
export const CONTACT = 0.45;
export function togetherPose(what: string, k: number): Pose {
  const r = ease(k / CONTACT);
  const push = Math.max(0, 1 - Math.abs(k - CONTACT) / 0.12);
  const p: Pose = { spine: [0.06 * push, 0, 0] };
  switch (what) {
    case "highfive":
      p.shoulderR = [-2.6 * r - 0.12 * push, 0, -0.25 * r];
      p.elbowR = [-0.25, 0, 0];
      p.wristR = [0.3, 0, 0];
      break;
    case "fistbump":
      p.shoulderR = [-1.35 * r - 0.1 * push, 0, -0.1];
      p.elbowR = [-0.5 * r, 0, 0];
      break;
    case "cheers":
      // the drink raised out towards them
      p.shoulderR = [-1.75 * r - 0.08 * push, 0, -0.15];
      p.elbowR = [-0.5, 0, 0];
      break;
    default:
      // give, take: arm out, hand open
      p.shoulderR = [-1.25 * r, 0, -0.05];
      p.elbowR = [-0.35, 0, 0];
      p.wristR = [0, 1.2 * r, 0];
  }
  return p;
}

// One emote's gesture (shared EMOTES), t seconds in.
export function emotePose(
  emote: string,
  t: number,
): { pose: Pose; lift: Euler3; blink?: number; talk?: number; reach?: Reach } {
  const p: Pose = {};
  let lift: Euler3 = [0, 0, 0];
  switch (emote) {
    case "wave":
      // the arm up at the side, the forearm waving
      p.shoulderR = [-0.25, 0, -2.55];
      p.elbowR = [0, 0, -0.35 + 0.45 * Math.sin(t * 9)];
      p.head = [0, 0, 0.08];
      Object.assign(p, handPose(-1, HANDS.open));
      break;
    case "clap": {
      // hands together in front of the chest, clapping
      const c = Math.max(0, Math.sin(t * 10)); // apart … together
      return {
        pose: p,
        lift,
        reach: {
          L: { at: "chest", w: 1, dx: -0.04 - 0.07 * (1 - c), dz: 0.1 },
          R: { at: "chest", w: 1, dx: -0.04 - 0.07 * (1 - c), dz: 0.1 },
        },
      };
    }
    case "laugh":
      // shaking with it, head back, a hand on the belly
      p.spine = [-0.18 + 0.05 * Math.sin(t * 12), 0, 0];
      p.head = [-0.22, 0, 0.05 * Math.sin(t * 6)];
      p.shoulderR = [-0.48, 0, 0.18];
      p.elbowR = [-1.6, 0, 0];
      lift = [0, 0.006 * Math.sin(t * 14), 0];
      return {
        pose: p,
        lift,
        talk: Math.sin(t * 16) > 0 ? 1 : 0.3,
        blink: Math.sin(t * 16) > 0 ? 0 : 1,
        reach: { R: { at: "belly", w: 1 } },
      };
    case "heart":
      // both hands at the chest, eyes closed
      p.shoulderL = [-0.75, 0, -0.36];
      p.shoulderR = [-0.75, 0, 0.36];
      both(p, "elbow", [-1.78, 0, 0]);
      both(p, "wrist", [0.4, 0, 0]);
      p.head = [0.05, 0, 0.14];
      return {
        pose: p,
        lift,
        blink: 1,
        reach: { L: { at: "chest", w: 1, dx: 0.0 }, R: { at: "chest", w: 1, dx: 0.0 } },
      };
    case "question":
      // a hand to the chin, head on one side
      p.shoulderR = [-0.88, 0, 0.16];
      p.elbowR = [-2.45, 0, 0];
      p.head = [0.04, 0, 0.24];
      return { pose: p, lift, reach: { R: { at: "chin", w: 1 } } };
    case "fire": {
      // a fist pump with a hop
      const pump = Math.max(0, Math.sin(t * 7));
      p.shoulderR = [-2.85 + 0.25 * pump, 0, -0.15];
      p.elbowR = [-0.65 * pump, 0, 0];
      both(p, "knee", [0.35 * (1 - pump), 0, 0]);
      lift = [0, 0.06 * pump, 0];
      break;
    }
    case "coffee":
      return { pose: sipPose(), lift, blink: 1, reach: { R: { at: "mouth", w: 1 } } };
    case "tape": {
      // a little dance: hips side to side, a bounce, feet and arms taking turns
      const s = Math.sin(t * 4.2);
      p.hips = [0, 0, 0.12 * s];
      p.spine = [0, 0.1 * s, -0.08 * s];
      p.thighL = [-0.5 * Math.max(0, s), 0, 0];
      p.kneeL = [0.9 * Math.max(0, s), 0, 0];
      p.thighR = [-0.5 * Math.max(0, -s), 0, 0];
      p.kneeR = [0.9 * Math.max(0, -s), 0, 0];
      p.shoulderL = [-0.3, 0, 0.5 + 0.5 * Math.max(0, s)];
      p.shoulderR = [-0.3, 0, -0.5 - 0.5 * Math.max(0, -s)];
      both(p, "elbow", [-1.25, 0, 0]);
      p.head = [0.08 * Math.sin(t * 8.4), 0, 0.1 * s];
      lift = [0, 0.022 * Math.abs(Math.sin(t * 8.4)), 0];
      break;
    }
  }
  return { pose: p, lift };
}

// ── a jump (shared/jump.ts) ─────────────────────────────────────────────────
// Keyframes along the arc, eased one into the next. A hop: load up low with
// the arms back, whip them up and stretch off the toes, at the top a fist
// punched up and a knee driven high, legs reaching down for the floor, a
// squash as it lands. Running, a front flip: up off the toes into a tight tuck, a
// whole turn about the hips, opening out arms high to stick the landing.
type Key = { pose: Pose; lift: number };
function key(
  spine: number,
  head: number,
  shoulder: Euler3,
  elbow: number,
  thigh: number,
  knee: number,
  ankle: number,
  lift = 0,
  // the right leg, when it isn't the left's mirror
  right?: [number, number, number],
): Key {
  const p: Pose = { hips: [0, 0, 0], spine: [spine, 0, 0], neck: [0, 0, 0], head: [head, 0, 0] };
  both(p, "shoulder", shoulder);
  both(p, "elbow", [elbow, 0, 0]);
  both(p, "wrist", [0, 0, 0]);
  both(p, "thigh", [thigh, 0, 0.04], right ? [right[0], 0, -0.04] : undefined);
  both(p, "knee", [knee, 0, 0], right ? [right[1], 0, 0] : undefined);
  both(p, "ankle", [ankle, 0, 0], right ? [right[2], 0, 0] : undefined);
  return { pose: p, lift };
}
/** `k` with the right arm its own: [shoulder, elbow]. */
function rightArm(k: Key, shoulder: Euler3, elbow: number): Key {
  return { pose: { ...k.pose, shoulderR: shoulder, elbowR: [elbow, 0, 0] }, lift: k.lift };
}
const HOP = {
  crouch: key(0.38, -0.3, [0.75, 0, 0.18], -0.25, -0.85, 1.55, -0.7, -0.2),
  launch: key(-0.06, -0.12, [-2.75, 0, 0.22], -0.12, 0.08, 0.1, 0.55),
  // the top: a fist punched up, the other arm out; one knee driven high, the other heel kicked back
  tuck: rightArm(
    key(0.1, -0.12, [-0.35, 0, 1.1], -0.3, -1.65, 2.1, 0.3, 0.06, [0.25, 1.9, 0.5]),
    [-2.85, 0, -0.15],
    -0.5,
  ),
  reach: key(0.1, -0.05, [-1.05, 0, 0.55], -0.3, -0.45, 0.55, -0.1),
  impact: key(0.3, -0.2, [-0.9, 0, 0.45], -0.4, -0.75, 1.35, -0.6, -0.17),
};
const FLIP = {
  crouch: key(0.5, -0.2, [0.9, 0, 0.12], -0.2, -0.8, 1.45, -0.65, -0.19),
  launch: key(-0.15, -0.25, [-2.9, 0, 0.15], -0.1, 0.12, 0.05, 0.5),
  // balled up: knees to the chest, hands on the shins
  tuck: key(0.75, 0.5, [-0.7, 0, 0.1], -1.9, -2.4, 2.6, 0.4, 0.12),
  open: key(0.05, -0.1, [-1.6, 0, 0.9], -0.2, -0.6, 0.7, 0),
  impact: key(0.35, -0.15, [-1.3, 0, 0.75], -0.3, -0.9, 1.6, -0.7, -0.22),
};
// [from k, key] along the air time: each eases into the next
const HOP_AIR: [number, Key][] = [
  [0, HOP.crouch],
  [0.2, HOP.launch],
  [0.5, HOP.tuck],
  [0.62, HOP.tuck],
  [0.9, HOP.reach],
];
const FLIP_AIR: [number, Key][] = [
  [0, FLIP.crouch],
  [0.14, FLIP.launch],
  [0.32, FLIP.tuck],
  [0.68, FLIP.tuck],
  [0.88, FLIP.open],
];
function along(track: [number, Key][], k: number): { pose: Pose; lift: number } {
  let i = 0;
  while (i < track.length - 1 && k >= track[i + 1][0]) i++;
  const [k0, a] = track[i];
  const next = track[i + 1];
  if (!next) return { pose: a.pose, lift: a.lift };
  const w = ease((k - k0) / (next[0] - k0));
  return { pose: blend(a.pose, next[1].pose, w), lift: a.lift + (next[1].lift - a.lift) * w };
}
const smoother = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * t * (t * (t * 6 - 15) + 10));

/** The body at a jump's stage, and how much of it to lay over the rest (w). `spin`: false keeps a flip upright (reduced motion). */
export function jumpPose(a: JumpNow, spin = true): { pose: Pose; lift: Euler3; w: number } {
  const kind = a.kind;
  const K = kind === "flip" ? FLIP : HOP;
  let pose: Pose;
  let lift = 0;
  let w = 1;
  if (a.stage === "crouch") {
    pose = K.crouch.pose;
    lift = K.crouch.lift;
    w = ease(a.k * 1.4);
  } else if (a.stage === "air") {
    const at = along(kind === "flip" ? FLIP_AIR : HOP_AIR, a.k);
    pose = { ...at.pose };
    lift = at.lift;
    // a whole turn forward about the hips, fastest in the tuck
    if (kind === "flip" && spin) pose.hips = [TAU * smoother((a.k - 0.12) / 0.74), 0, 0];
  } else if (a.stage === "land") {
    const last = kind === "flip" ? FLIP.open : HOP.reach;
    const hit = ease(a.k / 0.3);
    pose = blend(last.pose, K.impact.pose, hit);
    lift = last.lift + (K.impact.lift - last.lift) * hit;
    w = 1 - ease((a.k - 0.3) / 0.7);
  } else return { pose: {}, lift: [0, 0, 0], w: 0 };
  return { pose, lift: [0, lift, 0], w };
}

// making a point while talking: the forearm up, the hand open
function explainPose(t: number): Pose {
  return { shoulderR: [-0.5, 0, -0.22], elbowR: [-1.45 + 0.12 * Math.sin(t * 5), 0, 0], wristR: [0, -0.7, 0] };
}

function rnd(seed: number) {
  let a = Math.floor(seed * 2 ** 31) >>> 0 || 1;
  return () => {
    a = (a * 1103515245 + 12345) >>> 0;
    return ((a >>> 8) & 0xffff) / 0x10000;
  };
}

export class Motion3 {
  private t = 0;
  private phase = 0;
  private walkW = 0;
  private r: () => number;
  private blinkAt: number;
  private blinkUntil = 0;
  private shift = 0;
  private shiftTo = 0;
  private shiftAt: number;
  private look = 0;
  private lookTo = 0;
  private lookAt: number;
  private mouthAt = 0;
  private mouthOpen = false;
  private gestureAt = 0;
  private gestureUntil = 0;
  private emote = "";
  private emoteT = 0;
  private busyW = 0;
  private busyWhat = "";
  private phoneW = 0;
  private phoneWhat = "";
  private seated: boolean | null = null;
  private settleT = 1;
  private loco: Locomotion | null = null;
  /** plan 58's animations (phase 0: beside the old till signed off), the mood (0 day … 1 dark) */
  v2 = false;
  tension = 0;
  /** plan 58 4e: how they walk (their look's) */
  gait = "calm";
  private seed: number;

  constructor(seed: number) {
    this.seed = seed;
    this.r = rnd(seed);
    this.t = this.r() * 10;
    this.blinkAt = this.t + 1 + this.r() * 3;
    this.shiftAt = this.t + 2 + this.r() * 5;
    this.lookAt = this.t + 3 + this.r() * 5;
  }

  update(dt: number, m: MotionIn): MotionOut {
    this.t += dt;
    const t = this.t;
    const r = this.r;
    const lift: Euler3 = [0, 0, 0];
    const reach: Reach = {};
    const reaching = (r: Reach | undefined, w: number) => {
      if (!r || w <= 0) return;
      for (const side of ["L", "R"] as const) {
        const h = r[side];
        if (h) reach[side] = { ...h, w: h.w * w };
      }
    };
    const lifted = (l: Euler3, w = 1) => {
      lift[0] += l[0] * w;
      lift[1] += l[1] * w;
      lift[2] += l[2] * w;
    };
    // the walk: phase from distance, blended in and out over ~0.12 s
    const k = 1 + Math.min(0.35, Math.max(0, m.speed - 4.2) * 0.08); // running swings wider
    if (m.walking && m.dist > 0) this.phase = (this.phase + m.dist / (STRIDE * k)) % 1;
    this.walkW = clamp01(this.walkW + (m.walking && !m.sit ? dt : -dt) * 8);
    if (!m.walking && this.walkW === 0) this.phase = this.phase < 0.5 ? 0 : 0.5;

    // (plan 58 phase 6: the everyday again, once its chunk's in — sitting down and getting up its own
    // 0.9 s, the hands put on things)
    const A = this.v2 && !m.reduced ? actsNow() : null;
    let hands: Hands | null = null;
    const handed = (h: Hands | null | undefined, w: number) => {
      if (!h || w <= 0) return;
      hands ??= {};
      for (const S of ["L", "R"] as const) {
        const x = h[S];
        if (x) hands[S] = { ...x, w: x.w * w };
      }
    };
    if (this.seated !== null && this.seated !== m.sit) this.settleT = 0;
    this.seated = m.sit;
    this.settleT = Math.min(1, this.settleT + dt / (A ? 0.9 : 0.32));

    // ── standing / seated, and idle life
    let p = m.sit ? seatedPose(m.typing) : standPose();
    // plan 58: the new idle — its weight, breath, glances and mood all its own (once it's in)
    const H = this.v2 ? heroNow() : null;
    if (this.v2 && !H) void loadHero();
    const idle2 = !!H && !m.sit && !m.reduced;
    if (H && idle2) {
      // (gazed: the head's turned by the gaze, its eyes leading — Locomotion's)
      const id = H.idle2Pose(t, this.tension, this.seed * 10, !!m.loco, this.loco?.life() ?? { gait: this.gait });
      p = id.pose;
      lifted(id.lift);
    }
    if (!m.reduced && !idle2) {
      const breath = Math.sin(t * 2.1);
      add(p, "spine", 0.012 * breath);
      add(p, "head", -0.01 * breath);
      if (!m.sit) {
        add(p, "shoulderL", 0, 0, 0.012 * Math.sin(t * 1.1 + 1));
        add(p, "shoulderR", 0, 0, -0.012 * Math.sin(t * 1.1 + 2.4));
        // weight from foot to foot every few seconds
        if (t > this.shiftAt) {
          this.shiftTo = this.shiftTo === 0 ? (r() < 0.5 ? -1 : 1) : r() < 0.4 ? 0 : -this.shiftTo;
          this.shiftAt = t + 4 + r() * 6;
        }
        this.shift += (this.shiftTo - this.shift) * Math.min(1, dt * 2.2);
        add(p, "hips", 0, 0, 0.035 * this.shift);
        add(p, "spine", 0, 0, -0.03 * this.shift);
        // the free leg bends a little
        add(p, "kneeL", 0.14 * Math.max(0, this.shift));
        add(p, "kneeR", 0.14 * Math.max(0, -this.shift));
        add(p, "thighL", -0.05 * Math.max(0, this.shift));
        add(p, "thighR", -0.05 * Math.max(0, -this.shift));
      } else if (m.typing) {
        // typing in bursts, pauses to read
        if (Math.sin(t * 0.9) > -0.2) {
          add(p, "wristR", 0.1 * Math.sin(t * 19));
          add(p, "wristL", -0.1 * Math.sin(t * 19 + 1.7));
        }
        add(p, "head", 0, 0.05 * Math.sin(t * 0.7));
      }
      // a glance about now and then
      if (t > this.lookAt) {
        this.lookTo = this.lookTo === 0 ? (r() - 0.5) * 0.6 : 0;
        this.lookAt = t + (this.lookTo === 0 ? 3 + r() * 6 : 1.2 + r() * 2);
      }
      this.look += (this.lookTo - this.look) * Math.min(1, dt * 5);
      add(p, "head", 0, this.look);
    }
    // (6a: sat, sitting down, getting up — the legs solved to the floor, the hands on the knees or keys)
    const sat =
      A && (m.sit || this.settleT < 1)
        ? A.sit2(this.settleT, !m.sit, t, m.typing, m.seatDrop ?? -0.34, this.seed)
        : null;
    if (sat) {
      p = sat.pose;
      lift[0] = sat.lift?.[0] ?? 0;
      lift[1] = sat.lift?.[1] ?? 0;
      lift[2] = sat.lift?.[2] ?? 0;
      handed(sat.hands, 1);
    }
    if (m.loco && !m.sit && !sat) {
      // the move: standing (as above), walking, jogging, sprinting, crouched, aiming, in the air
      this.loco ??= new Locomotion();
      this.loco.v2 = this.v2;
      this.loco.tension = this.tension;
      this.loco.seed = this.seed * 10;
      this.loco.gait = this.gait;
      const lo = this.loco.update(
        dt,
        { ...m.loco, dist: m.dist, speed: m.speed, jump: m.jump ?? null, reduced: m.reduced },
        { pose: p, lift: [lift[0], lift[1], lift[2]] },
      );
      p = lo.pose;
      lift[0] = lo.lift[0];
      lift[1] = lo.lift[1];
      lift[2] = lo.lift[2];
    } else if (!sat) {
      // walking takes over the legs, the hips and the swing of the arms
      if (this.walkW > 0) {
        const w = walkPose(this.phase, k);
        p = blend(p, w.pose, ease(this.walkW));
        lifted(w.lift, ease(this.walkW));
      }
      // a jump takes the whole body (what's in the hands is laid back over it next)
      if (m.jump && !m.sit) {
        const j = H ? H.jump2Pose(m.jump, !m.reduced) : jumpPose(m.jump, !m.reduced);
        if (j.w > 0) {
          p = blend(p, j.pose, j.w);
          lift[1] = lift[1] * (1 - j.w) + j.lift[1] * j.w;
        }
      }
    }

    // carrying: the right hand holds it, and brings it up for each sip
    const ph = m.phone?.state ?? "";
    let sip = 0;
    let sipping = false;
    if (m.held && !ph) {
      const st = heldState(m.held.kind, m.held.since);
      sip = sipEnv(st.sip);
      if (A) {
        const h = A.hold2(sip, t);
        p = blend(p, h.pose, 1);
        handed(h.hands, 1);
      } else p = blend(p, blend(holdPose(), sipPose(), sip), 1);
      reaching({ R: { at: "mouth", w: 1 } }, sip);
      sipping = st.sip >= 0.32 && st.sip <= 0.68;
    }

    // using something, blended in and out
    if (m.busy) this.busyWhat = m.busy;
    this.busyW = clamp01(this.busyW + (m.busy && !m.sit ? dt : -dt) * 5);
    if (this.busyW > 0 && this.busyWhat) {
      const b = A ? A.busy2(this.busyWhat, t, this.seed) : busyPose(this.busyWhat, t);
      p = blend(p, b.pose, ease(this.busyW));
      if (b.lift) lifted(b.lift, ease(this.busyW));
      if ("hands" in b) handed(b.hands, ease(this.busyW));
    }

    // the phone in the hand
    if (ph) this.phoneWhat = ph;
    this.phoneW = clamp01(this.phoneW + (ph ? dt : -dt) * 5);
    let phoneTalk = 0;
    if (this.phoneW > 0 && this.phoneWhat && A) {
      const f = A.phone2(this.phoneWhat, m.phone?.pose ?? "", t, m.speaking, this.seed);
      p = blend(p, f.pose, ease(this.phoneW));
      handed(f.hands, ease(this.phoneW));
      phoneTalk = (f.talk ?? 0) * ease(this.phoneW) * (m.speaking ? 1 : 0);
      if (this.phoneWhat === "call") reaching({ R: { at: "ear", w: 1 } }, ease(this.phoneW));
    } else if (this.phoneW > 0 && this.phoneWhat) {
      p = blend(p, phonePose(this.phoneWhat, m.phone?.pose ?? "", t, m.speaking), ease(this.phoneW));
      // on a call the phone is at the ear
      if (this.phoneWhat === "call") reaching({ R: { at: "ear", w: 1 } }, ease(this.phoneW));
    }
    // ringing in the pocket: a buzz at the hip
    if (m.phone?.ringing && !ph && !m.reduced) lift[0] += 0.004 * Math.sin(t * 46) * (Math.sin(t * 2.6) > 0 ? 1 : 0);

    // lowering onto the seat (from a little higher) or rising off it (from a crouch)
    if (this.settleT < 1 && !m.reduced && !sat) {
      const s = 1 - ease(this.settleT);
      lift[1] += (m.sit ? 0.05 : -0.04) * s;
      if (!m.sit) {
        add(p, "spine", 0.25 * s);
        add(p, "thighL", -0.4 * s);
        add(p, "thighR", -0.4 * s);
        add(p, "kneeL", 0.6 * s);
        add(p, "kneeR", 0.6 * s);
      }
    }

    // ── the face: blinking, talking
    // (the gaze blinks on its own when it's on: plan 58 G.D)
    if (!m.reduced && t > this.blinkAt && !this.loco?.gazeOut) {
      this.blinkUntil = t + 0.11;
      this.blinkAt = t + (r() < 0.2 ? 0.25 : 2.2 + r() * 4);
    }
    let blink = t < this.blinkUntil || sipping ? 1 : 0;
    let talk = 0;
    if (m.speaking) {
      if (t > this.mouthAt) {
        this.mouthOpen = !this.mouthOpen;
        this.mouthAt = t + (this.mouthOpen ? 0.07 + r() * 0.1 : 0.05 + r() * 0.12);
      }
      talk = this.mouthOpen ? 1 : 0;
      if (!m.reduced) {
        add(p, "head", 0.03 * Math.sin(t * 8.1), 0.03 * Math.sin(t * 4.3));
        // a hand comes up to make a point, now and then
        if (t > this.gestureAt && !m.sit && this.walkW < 0.5 && !m.held) {
          this.gestureUntil = t + 1 + r() * 0.8;
          this.gestureAt = t + 3 + r() * 4;
        }
        const from = this.gestureUntil - 1.4;
        const g = ease((t - from) / 0.3) * (1 - ease((t - (this.gestureUntil - 0.3)) / 0.3));
        if (g > 0 && t < this.gestureUntil && !m.held && !ph) p = blend(p, explainPose(t), g);
      }
    } else this.mouthOpen = false;

    // ── with someone: a high five, a fist bump, cheers, a drink handed over
    if (m.act && !m.sit) {
      const { what, t: at, len } = m.act;
      const w = m.reduced ? 1 : ease(at / 0.3) * (1 - ease((at - (len - 0.35)) / 0.35));
      if (w > 0 && A) {
        const g = A.together2(what, at / len, CONTACT, m.act.with);
        p = blend(p, g.pose, w);
        handed(g.hands, w);
      } else if (w > 0)
        p = what === "wave" ? blend(p, emotePose("wave", at).pose, w) : blend(p, togetherPose(what, at / len), w);
    }

    // ── emotes: a short gesture for each
    if (m.emote !== this.emote) {
      this.emote = m.emote;
      this.emoteT = 0;
    }
    if (this.emote) {
      this.emoteT += dt;
      const len = m.reduced ? 1.2 : 3.2;
      const e = ease(this.emoteT / 0.28) * (1 - ease((this.emoteT - (len - 0.4)) / 0.4));
      if (e > 0 && A) {
        const em = A.emote2(this.emote, this.emoteT);
        p = blend(p, em.pose, e);
        if (em.lift) lifted(em.lift, e);
        handed(em.hands, e);
        if (em.sip) reaching({ R: { at: "mouth", w: 1 } }, em.sip * e);
        if (em.blink !== undefined) blink = Math.max(blink, em.blink * e);
        if (em.talk !== undefined) talk = Math.max(talk, em.talk * e);
      } else if (e > 0) {
        const em = emotePose(this.emote, this.emoteT);
        p = blend(p, em.pose, e);
        lifted(em.lift, e);
        reaching(em.reach, e);
        if (em.blink !== undefined) blink = Math.max(blink, em.blink * e);
        if (em.talk !== undefined) talk = Math.max(talk, em.talk * e);
      }
    }
    // (the gaze's eyes and its blinks: plan 58 G.D)
    const gz = this.loco?.gazeOut;
    if (gz) blink = Math.max(blink, gz.blink);
    talk = Math.max(talk, phoneTalk);
    return { pose: p, lift, blink, talk, settle: sat?.settle ?? ease(this.settleT), sip, reach, eyes: gz?.eyes, hands };
  }
}

/** Every joint named (for checks). */
export function fullPose(p: Pose): Required<Pose> {
  const out = {} as Required<Pose>;
  for (const j of JOINTS) out[j] = p[j] ?? [0, 0, 0];
  return out;
}
