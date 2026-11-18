import { Vector3 } from "three";
import type { Opening } from "../tp/car/model";

// Plan 98 phases 1–3 (docs/plan/98-the-car-perfected.md): getting into a car and out of it, beat by beat, planned in
// the car body's own frame (x toward its tail, y up from the ground, z to its left) from what the car measures — the
// door's opening, the seat, its footwell — so it fits every body. The body is posed from it with each foot planted
// (or swung over the sill) and the hips on their path (acts.ts carStep): no seated pose slid through the door.
//
// In (ENTER_S): at the door facing it, the near hand to the handle; the door pulled open a half step back; let go,
// turned and stepped into the gap, a hand on the roof's edge and the other on the door's frame; the inside foot over
// the sill onto the footwell's floor, ducked under the roof; the hips down and in onto the seat; the outside leg
// swung in; the door's pull reached and the door shut; settled into the seat.
// Out (EXIT_S): the pull, the door pushed open; the outside foot out onto the ground; a hand on the roof's edge, the
// other on the door's frame; up and out, ducked; the inside foot out; stood; a step back out of the gap, the door
// pushed shut by its frame; a step to where the walker goes on.

export const ENTER_S = 2.8;
export const EXIT_S = 2.5;

/** What a hand holds in the act: the door's outside handle, its inside pull, its frame's top at the back (each a
 *  mark on the door, swung with it), the roof's edge over the opening (the body's). */
export type Grip = "handle" | "pull" | "top" | "roof" | "wheel" | "seat" | "saddle";

export interface ActPose {
  /** the hips' joint (the body's frame, m) */
  hips: Vector3;
  /** which way they face: the person root's rotation.y in the body's frame */
  yaw: number;
  /** each sole's place (the body's frame): L, R */
  feet: [Vector3, Vector3];
  /** each foot's toes pointed down (rad), lifted */
  toe: [number, number];
  /** ducked under the roof (0..1): bent at the hips, the back and the neck */
  duck: number;
  /** the trunk bent toward the car (rad: + toward it) */
  lean: number;
  hands: { S: "L" | "R"; at: Grip; w: number }[];
  /** how far its door is held open (rad), −1: let go (it goes on by its own) */
  door: number;
  /** blended into the seat's own sat pose (0..1) */
  sat: number;
}

/** The car's measures for one seat and the door it's got in by. */
export interface Doorway {
  /** the side: +1 the body's +z (its left), −1 */
  s: number;
  op: Opening;
  /** the seat's hip point (the body's frame) */
  hip: Vector3;
  /** its footwell's floor (y) */
  floor: number;
  /** the hips' joint stood and sat (m over the ground): the person's legs, the seat's height */
  stand: number;
  satHip: number;
  /** each foot sat (the body's frame): L, R */
  satFeet: [Vector3, Vector3];
  /** the person's size (their root's scale) */
  k: number;
  /** the wheel's seat: the inside hand takes the rim (else the seat's back) */
  driver: boolean;
}

// ── tracks: keys through time, Hermite with the neighbours' slopes (moved through), a key marked `stop` arrived at
// and left from rest (a foot planted, a pose held)
type K = { t: number; v: number[]; stop?: boolean };
function track(keys: K[], t: number, out: number[]): number[] {
  const n = keys.length;
  if (t <= keys[0].t) return copy(keys[0].v, out);
  if (t >= keys[n - 1].t) return copy(keys[n - 1].v, out);
  let i = 0;
  while (i < n - 2 && keys[i + 1].t <= t) i++;
  const a = keys[i];
  const b = keys[i + 1];
  const h = Math.max(1e-6, b.t - a.t);
  const u = (t - a.t) / h;
  const slope = (j: number, d: number) => {
    const k = keys[j];
    if (k.stop || j === 0 || j === n - 1) return 0;
    const p = keys[j - 1];
    const q = keys[j + 1];
    return ((q.v[d] - p.v[d]) / Math.max(1e-6, q.t - p.t)) * h;
  };
  const u2 = u * u;
  const u3 = u2 * u;
  const h00 = 2 * u3 - 3 * u2 + 1;
  const h10 = u3 - 2 * u2 + u;
  const h01 = -2 * u3 + 3 * u2;
  const h11 = u3 - u2;
  for (let d = 0; d < a.v.length; d++) out[d] = h00 * a.v[d] + h10 * slope(i, d) + h01 * b.v[d] + h11 * slope(i + 1, d);
  return out;
}
function copy(v: number[], out: number[]) {
  for (let d = 0; d < v.length; d++) out[d] = v[d];
  return out;
}
/** how far a door's opened for getting in and out (of its full 1.05 rad): ~41°, as people do */
const OPEN = 0.68;
const ease = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
const seg = (t: number, a: number, b: number) => ease((t - a) / (b - a));
/** a window: in over [a, a+f], out over [b, b+f] */
const win = (t: number, a: number, b: number, f = 0.12) => seg(t, a, a + f) * (1 - seg(t, b, b + f));
const lerpA = (a: number, b: number, k: number) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * k;


/** The yaw (root rotation.y in the body's frame) facing along (dx, dz). */
export const yawOf = (dx: number, dz: number) => Math.atan2(dx, dz);

/** Where someone stands at a door, facing it, to start getting in (the body's frame): the walk ends here. */
export function doorStance(d: Doorway, out = new Vector3()): Vector3 {
  return out.set(d.op.x1 + 0.2, 0, d.s * (d.op.out + 0.42));
}

/**
 * The act at `t` seconds: in (`leaving` false) or out. `from`: where they stood when it began (in) — the walk's end,
 * eased onto the door's stance over its first beat; `to`: where they go on from (out) — the walker's place, the last
 * step taken to it if it's near.
 */
export function actAt(
  d: Doorway,
  t: number,
  leaving: boolean,
  from: { x: number; z: number; yaw: number } | null,
  to: { x: number; z: number } | null,
  out: ActPose,
): ActPose {
  const { s, op } = d;
  // (the lateral as out from the car's middle: w; the body's z = s·w)
  const o = op.out;
  const xh = d.hip.x;
  const wh = Math.abs(d.hip.z);
  const xr = op.x1;
  // (the sill as the feet cross it: over the door's foot and the floor's edge, a little to spare)
  const sill = Math.max(op.y0 + 0.14, d.floor + 0.16);
  const stand = d.stand - 0.02;
  // (each foot sat, in w)
  const sat = d.satFeet.map((f) => [f.x, f.y, f.z * s]);
  // which leg's which: A the one nearer the car once facing its front — the back one facing the door —, B the other
  const A = s > 0 ? 1 : 0;
  const B = 1 - A;
  const aS: "L" | "R" = A === 1 ? "R" : "L";
  const bS: "L" | "R" = A === 1 ? "L" : "R";
  // (facing: the door (−w), the car's front a little out (in the gap), the car's front (sat))
  const faceDoor = yawOf(0, -s);
  const faceGap = yawOf(-Math.cos(0.42), s * Math.sin(0.42));
  const faceFront = yawOf(-1, 0);
  const faceBack = yawOf(-0.62, -0.78 * s); // stepped back out of the gap, facing the door's frame to push it

  const gap = { x: xh + 0.12, w: o + 0.3 };
  // (a tall cab — the plough truck's, the snowcat's, the tractor's: its floor over a knee's height —: stood on its step
  // in the gap, up from the ground and down to it again)
  const base = Math.max(0, Math.min(0.75, d.floor - 0.42));
  const st0 = { x: xr + 0.2, w: o + 0.42 };
  const st1 = { x: xr + 0.24, w: o + 0.5 };
  const footW = 0.11; // half the stance

  let hips: number[];
  let fA: number[];
  let fB: number[];
  let yaw: number;
  let duck: number;
  let lean: number;
  let door: number;
  let satK: number;
  const hands: ActPose["hands"] = [];
  if (!leaving) {
    // ── in ──
    const f0 = from ?? { x: st0.x, z: s * st0.w, yaw: faceDoor };
    const w0 = f0.z * s;
    hips = [
      ...track(
        [
          { t: 0, v: [f0.x, stand, w0], stop: true },
          { t: 0.3, v: [st0.x, stand, st0.w], stop: true },
          { t: 0.55, v: [st0.x + 0.03, stand - 0.01, st0.w + 0.04] },
          { t: 0.85, v: [st1.x, stand - 0.02, st1.w], stop: true },
          { t: 1.1, v: [(st1.x + gap.x) / 2, stand - 0.01 + base * 0.5, (st1.w + gap.w) / 2 + 0.02] },
          { t: 1.35, v: [gap.x, stand - 0.03 + base, gap.w], stop: true },
          { t: 1.6, v: [gap.x - 0.02, stand - 0.07 + base, gap.w - 0.08] },
          { t: 1.85, v: [gap.x - 0.05, d.satHip + 0.22, o + 0.05] },
          { t: 2.05, v: [xh + 0.03, d.satHip + 0.1, o - 0.12] },
          { t: 2.3, v: [xh, d.satHip, wh], stop: true },
        ],
        t,
        [0, 0, 0],
      ),
    ];
    // the feet: planted, stepped, over the sill
    const a0 = [f0.x + footW, 0, w0, 0];
    const b0 = [f0.x - footW, 0, w0, 0];
    fA = [
      ...track(
        [
          { t: 0, v: a0, stop: true },
          { t: 0.12, v: a0, stop: true },
          { t: 0.3, v: [st0.x + footW, 0, st0.w, 0], stop: true },
          { t: 0.42, v: [st0.x + footW, 0, st0.w, 0], stop: true },
          { t: 0.53, v: [st1.x + footW + 0.06, 0.07, st1.w - 0.02, 0.15] },
          { t: 0.64, v: [st1.x + footW, 0, st1.w, 0], stop: true },
          { t: 1.08, v: [st1.x + footW, 0, st1.w, 0], stop: true },
          { t: 1.2, v: [(st1.x + gap.x) / 2 + 0.15, 0.09 + base, gap.w - 0.02, 0.2] },
          { t: 1.33, v: [gap.x + 0.2, base, gap.w - 0.12, 0], stop: true },
          { t: 1.45, v: [gap.x + 0.2, base, gap.w - 0.12, 0], stop: true },
          { t: 1.58, v: [gap.x - 0.1, sill + 0.1, o + 0.12, 0.55] },
          { t: 1.7, v: [xh - 0.28, sill + 0.08, o - 0.18, 0.45] },
          { t: 1.85, v: [xh - 0.42, d.floor, wh - 0.1, 0], stop: true },
          { t: 2.25, v: [xh - 0.42, d.floor, wh - 0.1, 0], stop: true },
          { t: 2.5, v: [sat[A][0], sat[A][1], sat[A][2], 0], stop: true },
        ],
        t,
        [0, 0, 0, 0],
      ),
    ];
    fB = [
      ...track(
        [
          { t: 0, v: b0, stop: true },
          { t: 0.04, v: b0, stop: true },
          { t: 0.24, v: [st0.x - footW, 0, st0.w, 0], stop: true },
          { t: 0.64, v: [st0.x - footW, 0, st0.w, 0], stop: true },
          { t: 0.74, v: [st1.x - footW + 0.03, 0.06, st1.w + 0.02, 0.12] },
          { t: 0.84, v: [st1.x - footW, 0, st1.w, 0], stop: true },
          { t: 0.92, v: [st1.x - footW, 0, st1.w, 0], stop: true },
          { t: 1.04, v: [(st1.x + gap.x) / 2 - 0.1, 0.09 + base, (st1.w + gap.w) / 2 + 0.12, 0.2] },
          { t: 1.18, v: [gap.x - 0.08, base, gap.w + 0.14, 0], stop: true },
          { t: 1.98, v: [gap.x - 0.1, base, gap.w + 0.12, 0], stop: true },
          { t: 2.14, v: [xh - 0.08, sill + 0.24, o + 0.12, 0.6] },
          { t: 2.3, v: [xh - 0.3, sill + 0.14, o - 0.22, 0.5] },
          { t: 2.5, v: [sat[B][0], sat[B][1], sat[B][2], 0], stop: true },
        ],
        t,
        [0, 0, 0, 0],
      ),
    ];
    // facing: the door, then round into the gap, then the car's front
    const y0 = f0.yaw;
    yaw =
      t < 0.3
        ? lerpA(y0, faceDoor, seg(t, 0, 0.3))
        : t < 0.9
          ? faceDoor
          : t < 1.8
            ? lerpA(faceDoor, faceGap, seg(t, 0.9, 1.35))
            : lerpA(faceGap, faceFront, seg(t, 1.8, 2.35));
    duck = win(t, 1.45, 2.1, 0.35) * 0.72;
    lean = win(t, 1.4, 2.1, 0.3) * 0.22;
    // the door: pulled open by its handle, let go to swing on, held by its frame; shut by its pull
    door =
      t < 0.3 ? 0 : t < 0.78 ? 0.42 * seg(t, 0.3, 0.78) : t < 1.15 ? 0.42 + (OPEN - 0.42) * seg(t, 0.78, 1.15) : OPEN;
    if (t >= 2.48) door = OPEN * (1 - seg(t, 2.48, 2.72));
    hands.push({ S: aS, at: "handle", w: win(t, 0.02, 0.8, 0.22) });
    // (the inside hand on the roof's edge as the foot goes in, then down onto the wheel (the seat's back) to lower
    // herself; the outside hand on the door's frame till she's down, then to its pull)
    hands.push({ S: aS, at: "roof", w: win(t, 1.25, 1.62, 0.2) });
    hands.push({ S: aS, at: d.driver ? "wheel" : "seat", w: win(t, 1.66, 2.3, 0.2) });
    hands.push({ S: bS, at: "top", w: win(t, 0.95, 1.86, 0.22) });
    hands.push({ S: bS, at: "pull", w: win(t, 2.28, 2.66, 0.18) });
    satK = seg(t, 2.45, ENTER_S);
  } else {
    // ── out ──
    const back = { x: xh + 0.48, w: o + 0.56 };
    // (the walker's place: the last step taken to it if it's within one)
    const tw = to ? to.z * s : back.w;
    // (a step to it only on this side, clear of the car: never back into it)
    const near = to ? tw > o + 0.3 && Math.hypot(to.x - back.x, tw - back.w) < 1.4 : false;
    const end = near && to ? { x: to.x, w: tw } : back;
    hips = [
      ...track(
        [
          { t: 0, v: [xh, d.satHip, wh], stop: true },
          { t: 0.75, v: [xh, d.satHip, wh], stop: true },
          { t: 1.0, v: [xh + 0.03, d.satHip + 0.12, o - 0.1] },
          { t: 1.2, v: [gap.x - 0.04, d.satHip + 0.26, o + 0.08] },
          { t: 1.45, v: [gap.x, stand - 0.05 + base, gap.w - 0.04] },
          { t: 1.6, v: [gap.x, stand - 0.02 + base, gap.w], stop: true },
          { t: 1.95, v: [back.x, stand - 0.02, back.w], stop: true },
          { t: 2.5, v: [end.x, stand, end.w], stop: true },
        ],
        t,
        [0, 0, 0],
      ),
    ];
    fB = [
      ...track(
        [
          { t: 0, v: [sat[B][0], sat[B][1], sat[B][2], 0], stop: true },
          { t: 0.35, v: [sat[B][0], sat[B][1], sat[B][2], 0], stop: true },
          { t: 0.52, v: [xh - 0.3, sill + 0.16, o - 0.18, 0.5] },
          { t: 0.66, v: [xh - 0.1, sill + 0.2, o + 0.14, 0.55] },
          { t: 0.8, v: [gap.x - 0.1, base, gap.w + 0.12, 0], stop: true },
          { t: 1.7, v: [gap.x - 0.1, base, gap.w + 0.12, 0], stop: true },
          { t: 1.82, v: [back.x - 0.12, 0.08 + base * 0.5, back.w + 0.05, 0.2] },
          { t: 1.95, v: [back.x - footW, 0, back.w + 0.04, 0], stop: true },
          { t: 2.2, v: [back.x - footW, 0, back.w + 0.04, 0], stop: true },
          { t: 2.32, v: [(back.x + end.x) / 2 - footW, 0.06, (back.w + end.w) / 2, 0.15] },
          { t: 2.46, v: [end.x - footW, 0, end.w, 0], stop: true },
        ],
        t,
        [0, 0, 0, 0],
      ),
    ];
    fA = [
      ...track(
        [
          { t: 0, v: [sat[A][0], sat[A][1], sat[A][2], 0], stop: true },
          { t: 0.6, v: [sat[A][0], sat[A][1], sat[A][2], 0], stop: true },
          { t: 0.85, v: [xh - 0.4, d.floor, wh - 0.08, 0], stop: true },
          { t: 1.08, v: [xh - 0.4, d.floor, wh - 0.08, 0], stop: true },
          { t: 1.22, v: [xh - 0.18, sill + 0.12, o - 0.14, 0.5] },
          { t: 1.34, v: [gap.x - 0.02, sill + 0.06, o + 0.1, 0.4] },
          { t: 1.48, v: [gap.x + 0.22, base, gap.w - 0.1, 0], stop: true },
          { t: 1.62, v: [gap.x + 0.22, base, gap.w - 0.1, 0], stop: true },
          { t: 1.74, v: [back.x + 0.1, 0.08 + base * 0.5, back.w - 0.06, 0.2] },
          { t: 1.86, v: [back.x + footW, 0, back.w - 0.04, 0], stop: true },
          { t: 2.08, v: [back.x + footW, 0, back.w - 0.04, 0], stop: true },
          { t: 2.22, v: [(back.x + end.x) / 2 + footW, 0.06, (back.w + end.w) / 2, 0.15] },
          { t: 2.36, v: [end.x + footW, 0, end.w, 0], stop: true },
        ],
        t,
        [0, 0, 0, 0],
      ),
    ];
    // (out toward its front a little, then stood in the gap, then back facing the door's frame; on, the way out)
    const away = near && to ? yawOf(end.x - back.x, s * (end.w - back.w)) : faceBack;
    const goAway = Math.hypot(end.x - back.x, end.w - back.w) > 0.15;
    yaw =
      t < 1.5
        ? lerpA(faceFront, faceGap, seg(t, 0.3, 0.85))
        : t < 2.15
          ? lerpA(faceGap, faceBack, seg(t, 1.5, 1.95))
          : lerpA(faceBack, goAway ? away : faceBack, seg(t, 2.15, 2.45));
    duck = win(t, 0.82, 1.42, 0.3) * 0.8;
    lean = -win(t, 0.8, 1.4, 0.3) * 0.12;
    // the door: pushed open by its pull, on by itself, held by its frame; pushed shut by it stepping back
    door =
      t < 0.18
        ? 0
        : t < 0.55
          ? 0.6 * seg(t, 0.18, 0.55)
          : t < 1.75
            ? 0.6 + (OPEN - 0.6) * seg(t, 0.55, 0.85)
            : t < 2.05
              ? OPEN - (OPEN - 0.15) * seg(t, 1.75, 2.05)
              : 0.15 * (1 - seg(t, 2.05, 2.18));
    hands.push({ S: bS, at: "pull", w: win(t, 0.02, 0.5, 0.18) });
    // (pushed up off the wheel (the seat's back), then the roof's edge as she comes up; the door's frame held out,
    // and pushed shut by it)
    hands.push({ S: aS, at: d.driver ? "wheel" : "seat", w: win(t, 0.45, 1.02, 0.2) });
    hands.push({ S: aS, at: "roof", w: win(t, 1.12, 1.5, 0.2) });
    hands.push({ S: bS, at: "top", w: win(t, 0.62, 2.02, 0.2) });
    satK = 1 - seg(t, 0, 0.4);
  }
  out.hips.set(hips[0], hips[1], s * hips[2]);
  out.feet[A].set(fA[0], fA[1], s * fA[2]);
  out.feet[B].set(fB[0], fB[1], s * fB[2]);
  out.toe[A] = fA[3];
  out.toe[B] = fB[3];
  out.yaw = yaw;
  out.duck = duck;
  out.lean = lean;
  out.hands = hands.filter((h) => h.w > 0.001);
  out.door = door;
  out.sat = satK;
  return out;
}

export function newActPose(): ActPose {
  return {
    hips: new Vector3(),
    yaw: 0,
    feet: [new Vector3(), new Vector3()],
    toe: [0, 0],
    duck: 0,
    lean: 0,
    hands: [],
    door: -1,
    sat: 0,
  };
}

/** The seat's back by the door, its top's inside corner: a passenger's hand on it getting in and out. */
export function seatGrip(d: Doorway, out = new Vector3()): Vector3 {
  return out.set(d.hip.x + 0.24, d.hip.y + 0.48, d.hip.z - d.s * 0.12);
}
/** The roof's edge over a door's opening, where a hand grips it (the body's frame). */
export function roofGrip(d: Doorway, out = new Vector3()): Vector3 {
  return out.set(d.hip.x - 0.2, d.op.glass + 0.03, d.s * (d.op.out - 0.1));
}

/** (plan 98 phase 4) A seat with no door — the snowmobile's, the toboggan's —: straddled. Stood beside it facing its
 *  front (`d.s` the side), the near leg swung up and over the seat onto the far footrest, down onto the seat, the other
 *  foot onto its own; out the same backwards. `d.op` is unused but its `out`: how far out to stand. In 1.9 s, out 1.7 s;
 *  sat after. */
export function straddleAt(
  d: Doorway,
  t: number,
  leaving: boolean,
  from: { x: number; z: number; yaw: number } | null,
  out: ActPose,
): ActPose {
  const s = d.s;
  const xh = d.hip.x;
  const wh = d.hip.z * s;
  const w0 = d.op.out + 0.32;
  const stand = d.stand - 0.02;
  const over = d.hip.y + 0.32;
  const A = s > 0 ? 1 : 0;
  const B = 1 - A;
  const aS: "L" | "R" = A === 1 ? "R" : "L";
  const sat = d.satFeet.map((f) => [f.x, f.y, f.z * s]);
  const face = yawOf(-1, 0);
  const tt = leaving ? 1.9 - t * (1.9 / 1.7) : t;
  const f0 = !leaving && from ? { x: from.x, w: from.z * s } : { x: xh + 0.05, w: w0 };
  const hips = track(
    [
      { t: 0, v: [f0.x, stand, f0.w], stop: true },
      { t: 0.3, v: [xh + 0.05, stand, w0], stop: true },
      { t: 0.6, v: [xh + 0.06, stand - 0.06, w0 - 0.06] },
      { t: 1.0, v: [xh + 0.02, Math.max(d.satHip + 0.12, stand - 0.18), (w0 + wh) / 2] },
      { t: 1.3, v: [xh, d.satHip + 0.03, wh] },
      { t: 1.5, v: [xh, d.satHip, wh], stop: true },
    ],
    tt,
    [0, 0, 0],
  );
  const fA = track(
    [
      { t: 0, v: [f0.x + 0.1, 0, f0.w - 0.1, 0], stop: true },
      { t: 0.3, v: [xh + 0.12, 0, w0 - 0.1, 0], stop: true },
      { t: 0.55, v: [xh + 0.12, 0, w0 - 0.1, 0], stop: true },
      { t: 0.8, v: [xh + 0.1, over, wh + 0.05, 0.5] },
      { t: 1.05, v: [sat[A][0], Math.max(sat[A][1], 0) + 0.06, sat[A][2], 0.2] },
      { t: 1.2, v: [sat[A][0], sat[A][1], sat[A][2], 0], stop: true },
    ],
    tt,
    [0, 0, 0, 0],
  );
  const fB = track(
    [
      { t: 0, v: [f0.x - 0.1, 0, f0.w + 0.1, 0], stop: true },
      { t: 0.3, v: [xh - 0.08, 0, w0 + 0.1, 0], stop: true },
      { t: 1.25, v: [xh - 0.08, 0, w0 + 0.06, 0], stop: true },
      { t: 1.42, v: [(xh + sat[B][0]) / 2, Math.max(sat[B][1], 0) + 0.12, (w0 + sat[B][2]) / 2, 0.3] },
      { t: 1.6, v: [sat[B][0], sat[B][1], sat[B][2], 0], stop: true },
    ],
    tt,
    [0, 0, 0, 0],
  );
  out.hips.set(hips[0], hips[1], s * hips[2]);
  out.feet[A].set(fA[0], fA[1], s * fA[2]);
  out.feet[B].set(fB[0], fB[1], s * fB[2]);
  out.toe[A] = fA[3];
  out.toe[B] = fB[3];
  out.yaw = !leaving && from && tt < 0.3 ? lerpA(from.yaw, face, seg(tt, 0, 0.3)) : face;
  out.duck = win(tt, 0.5, 1.3, 0.3) * 0.3;
  out.lean = win(tt, 0.55, 1.3, 0.25) * 0.15;
  out.hands = [{ S: aS, at: "saddle" as Grip, w: win(tt, 0.4, 1.3, 0.2) }].filter((h) => h.w > 0.001);
  out.door = -1;
  out.sat = seg(tt, 1.45, 1.9);
  return out;
}
