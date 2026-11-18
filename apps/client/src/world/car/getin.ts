import { Vector3 } from "three";
import type { Opening } from "../tp/car/model";

// Plan 100 (docs/plan/100-the-get-in-act.md), over plan 98 phases 1–3: getting into a car and out of it the way the big
// games' motion-captured people do (and people are taught to), planned in the car body's own frame (x toward its tail,
// y up from the ground, z to its left) from what the car measures — the door's opening, its belt, the seat, the
// footwell, the sill — so it fits every body and every car. The body is posed from it (acts.ts carStep): the hips on
// their path, each foot planted, stepped or swung over the sill, each knee turned the way its foot goes, the head
// ducked as far as the roof needs.
//
// In (ENTER_S; ENTER_FAST_S hurried — the same act, quicker):
//   align  — the walk's end onto the spot behind the handle, turned to it;
//   open   — the outside hand grips the handle and pulls, the body stepping back with the door; let go, it swings on;
//            the hand moves to the door's back edge, at the chest;
//   sit    — turned into the gap, front and a little out (the back half to the seat): the inside foot over the sill
//            into the footwell while the hips go down and in onto the seat's edge — the weight on the outside foot,
//            planted by the sill —, the inside hand on the wheel (a passenger's: the seat), the head under the roof;
//   legs   — sat on the edge: the outside knee up, its foot over the sill and in, turned to the front, back in the seat;
//   close  — leant out, the outside hand on the door's pull, the door drawn shut.
// Out (EXIT_S): the pull, the door pushed open; turned to it, the outside foot out onto the ground by the sill; a hand
// on the door's edge, the other pushing off the wheel; up over the planted foot, ducked; the inside foot out; stood in
// the gap; a step back behind the door, pushed shut by its edge; a step to where the walker goes on.

export const ENTER_S = 2.4;
/** (plan 100 F3c) getting in hurried — ran up, hit a moment ago: the same act, quicker */
export const ENTER_FAST_S = 1.6;
export const EXIT_S = 2.2;

/** What a hand holds in the act: the door's outside handle, its inside pull, its back edge (each a mark on the door,
 *  swung with it), the roof's grab handle over the opening (a tall cab's), the wheel's rim, the seat's back. (`top`:
 *  the door frame's top, plan 98's — kept for the marks, not held any more.) */
export type Grip = "handle" | "pull" | "edge" | "top" | "roof" | "wheel" | "seat" | "saddle" | "thigh";

export interface ActPose {
  /** the hips' joint (the body's frame, m) */
  hips: Vector3;
  /** which way they face: the person root's rotation.y in the body's frame */
  yaw: number;
  /** each sole's place (the body's frame): L, R */
  feet: [Vector3, Vector3];
  /** each foot's toes pointed down (rad), lifted */
  toe: [number, number];
  /** (plan 100) each foot's heading — the way its toes point, a yaw in the body's frame (planted: as it landed) */
  heading: [number, number];
  /** (plan 100) the way each knee goes (a direction in the body's frame): along its foot, up as it's lifted */
  knee: [Vector3, Vector3];
  /** ducked under the roof (0..1): bent at the hips, the back and the neck */
  duck: number;
  /** the trunk bent toward the car (rad: + toward it) */
  lean: number;
  /** (plan 100) the trunk turned ahead of the hips (rad, + to her left), and the head's turn on it (rad, + left) */
  twist: number;
  look: number;
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
  /** (plan 100) the door's belt — its glass's foot (y; else halfway up the opening) */
  belt?: number;
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
export const OPEN = 0.68;
const ease = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
const seg = (t: number, a: number, b: number) => ease((t - a) / (b - a));
/** (eased out: a thing let go, slowing) */
const segOut = (t: number, a: number, b: number) => {
  const x = Math.max(0, Math.min(1, (t - a) / (b - a)));
  return 1 - (1 - x) ** 3;
};
/** (eased in: a thing pushed, gathering speed — a door slammed) */
const segIn = (t: number, a: number, b: number) => {
  const x = Math.max(0, Math.min(1, (t - a) / (b - a)));
  return x * x * (0.6 + 0.4 * x);
};
/** a window: in over [a, a+f], out over [b, b+f] */
const win = (t: number, a: number, b: number, f = 0.12) => seg(t, a, a + f) * (1 - seg(t, b, b + f));
const lerpA = (a: number, b: number, k: number) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * k;
const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));
const DEG = Math.PI / 180;

/** The yaw (root rotation.y in the body's frame) facing along (dx, dz). */
export const yawOf = (dx: number, dz: number) => Math.atan2(dx, dz);

/** (plan 100) Her legs and trunk, in her own size (m, × the root's scale): the thigh and the shin (chars/moves), the
 *  hips' joints off the middle, the ankle over the sole, the hips' joint to the head's top, the shoulders over the hips
 *  and off the middle, the arm (the shoulder to the wrist). */
export const BODY = {
  thigh: 0.4012,
  shin: 0.4012,
  hipW: 0.078,
  ankle: 0.061,
  head: 0.84,
  shoulderUp: 0.52,
  shoulderW: 0.18,
  arm: 0.6,
};

/** Where someone stands at a door, facing it, to start getting in (the body's frame): the walk ends here. */
export function doorStance(d: Doorway, out = new Vector3()): Vector3 {
  return out.set(d.op.x1 + 0.16, 0, d.s * (d.op.out + 0.36));
}

/** (plan 100) What a foot stands on getting in by the door: the footwell's floor — or a tall cab's, its deck at the door's
 *  foot (the seat's own floor measured lower, inside it: the tractor's 0.54 m under its door). */
export function deckOf(d: Doorway): number {
  return d.op.y0 > d.floor + 0.15 && d.op.y0 > 0.8 ? d.op.y0 : d.floor;
}
/** (plan 100) A tall cab's steps up to its deck: the top one's height (two, each half of it), 0 a car's. */
export function stepsOf(d: Doorway): number {
  const up = deckOf(d) - 0.45;
  return up > 0.15 ? Math.min(1.0, up) : 0;
}

/** (plan 100) The act's shared measures for a doorway (the body's frame, lateral as `w` — out from the car's middle on
 *  the door's side; the body's z = s·w). */
function measures(d: Doorway) {
  const { op } = d;
  const o = op.out;
  // (the sill as a foot crosses it: over the door's foot and the floor's edge, and a margin over that)
  const deck = deckOf(d);
  const sill = Math.max(op.y0 + 0.12, deck + 0.14);
  // (a tall cab — the plough truck's, the snowcat's, the tractor's: its floor over a knee's height —: stood on its step
  // in the gap, up from the ground and down to it again)
  const base = stepsOf(d);
  const cross = sill;
  return {
    o,
    x0: op.x0,
    x1: op.x1,
    xh: d.hip.x,
    wh: Math.abs(d.hip.z),
    sill,
    clear: cross + 0.1,
    base,
    stand: d.stand - 0.02,
    // (sat on the seat's edge, its outer bolster: a little higher than sat in it)
    edgeY: d.satHip + 0.04,
    edgeW: Math.abs(d.hip.z) + 0.18,
    roof: op.y1,
  };
}

/** φ: turned from facing the door (0) toward the car's front (+90°) and on to facing out (180°) → the yaw. */
const yawAt = (d: Doorway, phi: number) => yawOf(0, -d.s) + d.s * phi;
/** …and back: a yaw as φ (−180°…180°). */
const phiOf = (d: Doorway, yaw: number) => {
  const a = (yaw - yawOf(0, -d.s)) * d.s;
  return Math.atan2(Math.sin(a), Math.cos(a));
};

/**
 * The act at `t` seconds of its walking length (ENTER_S / EXIT_S — hurried, the caller runs `t` faster): in (`leaving`
 * false) or out. `from`: where they stood when it began (in) — the walk's end, eased onto the door's stance over its
 * first beat; `to`: where they go on from (out) — the walker's place, the last step taken to it if it's near.
 */
export function actAt(
  d: Doorway,
  t: number,
  leaving: boolean,
  from: { x: number; z: number; yaw: number } | null,
  to: { x: number; z: number } | null,
  out: ActPose,
): ActPose {
  const { s } = d;
  const M = measures(d);
  // (plan 100) a tall cab's: climbed into, facing it, up its steps
  if (M.base > 0.1) return climbAt(d, t, leaving, from, to, out);
  const { o, xh, wh, base, stand, clear } = M;
  const fw = 0.11 * d.k; // half the stance
  // (each foot sat, in w)
  const sat = d.satFeet.map((f) => [f.x, f.y, f.z * s]);
  // which leg's which: A the inside one (the car's middle side once sat — the first in, the last out), B the outside
  const A = s > 0 ? 1 : 0;
  const B = 1 - A;
  const aS: "L" | "R" = A === 1 ? "R" : "L";
  const bS: "L" | "R" = A === 1 ? "L" : "R";
  const tall = base > 0.1;
  const floorIn = d.floor;
  const deck = deckOf(d);
  // (a seat behind the opening — a two-door's back seat, a cab's bench —: in by the opening, sat on its edge there,
  // then along to the seat; its door too far to pull shut: let go, it shuts by itself)
  const behind = xh > M.x1 - 0.05;
  // (the door shut by itself once she's in — a seat behind the opening, a tall cab's long door far from its seat)
  const selfShut = behind || tall;
  const xe = entryX(d);
  // (the gap, the spot behind the handle, pulled back with the door, the footwell by the door)
  // (past the open door's end: a back door's short — its gap behind it narrow)
  const doorEnd = M.x0 + (M.x1 - M.x0) * Math.cos(OPEN * 1.05);
  const G = {
    x: Math.max(Math.min(xe + 0.08, M.x1 - 0.05), Math.min(M.x1 - 0.02, doorEnd + 0.12)),
    w: o + (tall ? 0.24 : 0.3),
  };
  const S0 = { x: Math.min(M.x1 + 0.16, G.x + 0.42), w: o + 0.36 };
  const S1 = { x: S0.x + 0.08, w: o + 0.56 };
  const well = { x: xe - 0.36, w: wh + 0.1 };
  // (by the sill: the outside foot planted here while she sits — her weight on it —, and out onto it again; a tall
  // cab's: on its top step)
  const byS = clearOfDoor(d, { x: xe - 0.06, w: o + (tall ? 0.16 : 0.24) }, 0.3);
  const gapB = clearOfDoor(d, { x: xe - 0.02, w: o + 0.4 }, 0.34);
  // (a tall cab's first step: half its height, out from the second; its floor just in by the door — both feet up
  // there before she sits, as people climb into a truck —, and stood in its doorway, ducked)
  const st1 = { x: xe - 0.04, y: base * 0.5, w: o + 0.32 };
  const cabB = { x: xe - 0.14, w: o - 0.1 };
  const door2 = { x: xe + 0.04, y: deck + stand * 0.92, w: o - 0.06 };
  const edgeW = M.edgeW;
  // (sat in: along the seat from its edge — far along for a seat behind the opening)
  const tSat = behind ? 2.12 : 2.2;

  let hips: number[];
  let fA: number[];
  let fB: number[];
  let phi: number;
  let duck: number;
  let lean: number;
  let twist = 0;
  let door: number;
  let satK: number;
  const hands: ActPose["hands"] = [];
  // look: where the head turns to, weighted (the body's frame points)
  const looks: { at: [number, number, number]; w: number }[] = [];
  const P = (x: number, y: number, w: number): [number, number, number] => [x, y, s * w];
  if (!leaving) {
    // ── in ──
    const f0 = from ?? { x: S0.x, z: s * S0.w, yaw: yawAt(d, 15 * DEG) };
    const w0 = f0.z * s;
    const phi0 = phiOf(d, f0.yaw);
    // the feet where the walk left them: each off the middle of its stance by her own left
    const lx = Math.cos(f0.yaw);
    const lz = -Math.sin(f0.yaw);
    const startFoot = (i: number) => {
      const sg = i === 0 ? 1 : -1;
      return [f0.x + sg * lx * fw, 0, w0 + sg * lz * s * fw, 0, phi0];
    };
    hips = track(
      [
        { t: 0, v: [f0.x, stand, w0], stop: true },
        { t: 0.28, v: [S0.x, stand, S0.w], stop: true },
        { t: 0.62, v: [S1.x, stand - 0.01, S1.w], stop: true },
        { t: 0.8, v: [(S1.x + G.x) / 2, stand - 0.01, (S1.w + G.w) / 2 + 0.04] },
        ...(tall
          ? [
              // (up the cab's steps: the first, then the top one, both feet on it)
              { t: 0.92, v: [G.x + 0.04, stand - 0.03 + base * 0.5, o + 0.36] },
              { t: 1.02, v: [G.x + 0.03, stand - 0.03 + base * 0.5, o + 0.32], stop: true },
              { t: 1.18, v: [G.x, stand - 0.03 + base, G.w], stop: true },
              // (up into its doorway, ducked under its roof)
              { t: 1.42, v: [door2.x, door2.y, door2.w], stop: true },
            ]
          : [
              { t: 1.0, v: [G.x, stand - 0.03, G.w] },
              // (a dip and a lean into it before she sits: the anticipation)
              { t: 1.12, v: [G.x, stand - 0.07, G.w - 0.03] },
              { t: 1.32, v: [xe + 0.07, (stand + M.edgeY) / 2, o + 0.05] },
            ]),
        { t: tall ? 1.62 : 1.5, v: [xe + 0.05, M.edgeY, edgeW], stop: true },
        // (landed: the cushion gives a little)
        { t: tall ? 1.72 : 1.6, v: [xe + 0.05, M.edgeY - 0.015, edgeW - 0.01] },
        // (leant out to the door's pull, the hips a little after it)
        ...(behind ? [] : [{ t: 2.1, v: [xh, d.satHip, wh + 0.1] }]),
        { t: behind ? tSat : 2.3, v: [xh, d.satHip, wh], stop: true },
      ],
      t,
      [0, 0, 0],
    );
    const a0 = startFoot(A);
    const b0 = startFoot(B);
    // [x, y, w, toe, φ]
    fA = track(
      [
        { t: 0, v: a0, stop: true },
        { t: 0.1, v: a0, stop: true },
        { t: 0.26, v: [S0.x + fw, 0, S0.w + 0.02, 0, 15 * DEG], stop: true },
        { t: 0.38, v: [S0.x + fw, 0, S0.w + 0.02, 0, 15 * DEG], stop: true },
        { t: 0.46, v: [(S0.x + S1.x) / 2 + fw, 0.06, (S0.w + S1.w) / 2 + 0.03, 0.12, 20 * DEG] },
        { t: 0.54, v: [S1.x + fw + 0.02, 0, S1.w + 0.05, 0, 25 * DEG], stop: true },
        { t: 0.84, v: [S1.x + fw + 0.02, 0, S1.w + 0.05, 0, 25 * DEG], stop: true },
        { t: 0.92, v: [(S1.x + xe) / 2 + 0.1, 0.07 + base * 0.6, (S1.w + o) / 2 + 0.05, 0.15, 65 * DEG] },
        { t: 1.0, v: [xe + 0.16, base, o + 0.14, 0, 95 * DEG], stop: true },
        { t: 1.04, v: [xe + 0.16, base, o + 0.14, 0, 95 * DEG], stop: true },
        // (over the sill, the toes down, onto the footwell's floor by the door)
        { t: 1.14, v: [xe - 0.08, Math.max(clear, base + 0.08), o - 0.04, 0.5, 95 * DEG] },
        { t: 1.28, v: [well.x, floorIn, well.w, 0, 90 * DEG], stop: true },
        { t: 1.62, v: [well.x, floorIn, well.w, 0, 90 * DEG], stop: true },
        { t: behind ? tSat : 2.28, v: [sat[A][0], sat[A][1], sat[A][2], 0, 90 * DEG], stop: true },
      ],
      t,
      [0, 0, 0, 0, 0],
    );
    fB = track(
      [
        { t: 0, v: b0, stop: true },
        { t: 0.14, v: b0, stop: true },
        { t: 0.3, v: [S0.x - fw, 0, S0.w, 0, 15 * DEG], stop: true },
        { t: 0.5, v: [S0.x - fw, 0, S0.w, 0, 15 * DEG], stop: true },
        { t: 0.58, v: [(S0.x + S1.x) / 2 - fw, 0.06, (S0.w + S1.w) / 2, 0.12, 22 * DEG] },
        { t: 0.66, v: [S1.x - fw + 0.02, 0, S1.w - 0.03, 0, 30 * DEG], stop: true },
        { t: 0.72, v: [S1.x - fw + 0.02, 0, S1.w - 0.03, 0, 30 * DEG], stop: true },
        { t: 0.81, v: [(S1.x + xe) / 2 - 0.05, 0.08 + base * 0.4, (S1.w + o) / 2 + 0.14, 0.15, 70 * DEG] },
        ...(tall
          ? [
              // (onto the first step, then the top one beside the other foot)
              { t: 0.9, v: [st1.x, st1.y, st1.w, 0, 100 * DEG], stop: true },
              { t: 1.02, v: [st1.x, st1.y, st1.w, 0, 100 * DEG], stop: true },
              { t: 1.08, v: [(st1.x + byS.x) / 2, base + 0.06, (st1.w + byS.w) / 2, 0.15, 105 * DEG] },
              { t: 1.14, v: [byS.x, base, byS.w, 0, 110 * DEG], stop: true },
              { t: 1.28, v: [byS.x, base, byS.w, 0, 110 * DEG], stop: true },
              { t: 1.36, v: [(byS.x + cabB.x) / 2, Math.max(clear, base + 0.1), (byS.w + cabB.w) / 2, 0.4, 100 * DEG] },
              { t: 1.44, v: [cabB.x, deck, cabB.w, 0, 92 * DEG], stop: true },
              { t: 1.9, v: [cabB.x, deck, cabB.w, 0, 92 * DEG], stop: true },
            ]
          : [
              { t: 0.9, v: [gapB.x, 0, gapB.w, 0, 100 * DEG], stop: true },
              { t: 1.22, v: [gapB.x, 0, gapB.w, 0, 100 * DEG], stop: true },
              // (a shuffle in to the sill as she lowers: her weight's over it)
              { t: 1.3, v: [(gapB.x + byS.x) / 2, 0.05, (gapB.w + byS.w) / 2, 0.1, 105 * DEG] },
              { t: 1.38, v: [byS.x, 0, byS.w, 0, 110 * DEG], stop: true },
            ]),
        ...(tall
          ? []
          : [
              { t: 1.58, v: [byS.x, 0, byS.w, 0, 110 * DEG], stop: true },
              // (the knee up, the foot over the sill and in)
              { t: 1.7, v: [xe - 0.16, clear + 0.06, o + 0.06, 0.5, 98 * DEG] },
              { t: 1.84, v: [xe - 0.34, floorIn + 0.08, wh + 0.3, 0.3, 90 * DEG] },
            ]),
        { t: tSat, v: [sat[B][0], sat[B][1], sat[B][2], 0, 90 * DEG], stop: true },
      ],
      t,
      [0, 0, 0, 0, 0],
    );
    phi = track(
      [
        { t: 0, v: [phi0], stop: true },
        { t: 0.28, v: [15 * DEG], stop: true },
        { t: 0.62, v: [25 * DEG] },
        { t: 0.78, v: [50 * DEG] },
        { t: 1.0, v: [100 * DEG] },
        { t: 1.3, v: [118 * DEG] },
        { t: 1.5, v: [120 * DEG], stop: true },
        { t: 1.62, v: [118 * DEG] },
        { t: 1.95, v: [90 * DEG], stop: true },
      ],
      t,
      [0],
    )[0];
    // (the shoulders lead the hips round: turned ahead into the gap, toward the front as the legs come in; leant out to
    // the pull at the end)
    const reachOut = selfShut ? 0 : win(t, 1.92, 2.26, 0.14);
    twist = s * (0.22 * win(t, 0.66, 1.0, 0.16) + 0.16 * win(t, 1.52, 1.86, 0.16)) + s * 0.4 * reachOut;
    duck = 0.22 * win(t, 0.95, 1.55, 0.22);
    lean = 0.1 * win(t, 1.0, 1.5, 0.2) - 0.36 * reachOut;
    // the door: pulled open by its handle (the body stepping back with it), let go to swing on; drawn shut by its pull
    door =
      t < 0.36
        ? 0
        : t < 0.62
          ? 0.42 * seg(t, 0.36, 0.62)
          : t < 2.08 || selfShut
            ? 0.42 + (OPEN - 0.42) * segOut(t, 0.62, 0.92)
            : OPEN * (1 - segIn(t, 2.08, 2.34));
    // (let go once she's in: it shuts by itself)
    if (selfShut && t > 2.2) door = -1;
    // the outside hand: the handle, then the door's back edge at the chest, let go as she sits; the pull at the end
    hands.push({ S: bS, at: "handle", w: win(t, 0.16, 0.6, 0.16) });
    if (!tall) hands.push({ S: bS, at: "edge", w: win(t, 0.58, 1.24, 0.14) });
    // (let go of the door as she sits: the hand onto her thigh, till it reaches out for the pull)
    hands.push({ S: bS, at: "thigh", w: win(t, tall ? 1.3 : 1.22, selfShut ? 2.3 : 1.9, 0.16) });
    if (!selfShut) hands.push({ S: bS, at: "pull", w: win(t, 1.94, 2.32, 0.14) });
    // the inside hand: a tall cab's grab handle as she steps up; the wheel's rim (a passenger's: the seat's back) to
    // lower herself onto — the driver's kept there, sat
    if (tall) hands.push({ S: aS, at: "roof", w: win(t, 0.92, 1.3, 0.14) });
    hands.push({ S: aS, at: d.driver ? "wheel" : "seat", w: d.driver ? seg(t, 1.12, 1.34) : win(t, 1.24, 1.85, 0.2) });
    satK = seg(t, 2.1, ENTER_S);
    // looked at: the handle, into the car as she goes in, the front
    looks.push({ at: P(M.x1 - 0.1, (d.op.y0 + d.op.y1) / 2, o), w: win(t, 0.05, 0.6, 0.2) });
    looks.push({ at: P(xh - 0.3, d.hip.y + 0.3, wh - 0.2), w: win(t, 0.75, 1.45, 0.2) });
    looks.push({ at: P(M.x1 - 0.42 + (M.x0 - M.x1) * 0.25, (d.op.y0 + d.op.y1) / 2, o + 0.45), w: reachOut });
  } else {
    // ── out ──
    const back = { x: xe + 0.4, w: o + 0.62 };
    // (the walker's place: the last step taken to it if it's within one)
    const tw = to ? to.z * s : back.w;
    // (a step to it only on this side, clear of the car: never back into it)
    const near = to ? tw > o + 0.3 && Math.hypot(to.x - back.x, tw - back.w) < 1.4 : false;
    const end = near && to ? { x: to.x, w: tw } : back;
    const phiBack = 38 * DEG;
    const phiEnd =
      near && to && Math.hypot(end.x - back.x, end.w - back.w) > 0.15
        ? phiOf(d, yawOf(end.x - back.x, s * (end.w - back.w)))
        : phiBack;
    hips = track(
      [
        { t: 0, v: [xh, d.satHip, wh], stop: true },
        { t: behind ? 0.05 : 0.3, v: [xh, d.satHip, wh], stop: true },
        { t: 0.62, v: [xe + 0.04, M.edgeY, edgeW - 0.02] },
        { t: 0.8, v: [xe + 0.05, M.edgeY + 0.01, edgeW], stop: true },
        // (leant forward over the planted foot: the anticipation of getting up)
        { t: 0.98, v: [xe + 0.06, M.edgeY - 0.01, edgeW + 0.06] },
        ...(tall
          ? [
              // (stood in its doorway, ducked; down onto the top step)
              { t: 1.16, v: [door2.x, door2.y, door2.w], stop: true },
              { t: 1.36, v: [G.x, stand - 0.03 + base, G.w] },
            ]
          : [
              { t: 1.18, v: [xe + 0.07, (stand + M.edgeY) / 2, o + 0.08] },
              { t: 1.36, v: [G.x, stand - 0.03, G.w] },
            ]),
        ...(tall ? [] : [{ t: 1.5, v: [G.x + 0.04, stand - 0.01, G.w + 0.06], stop: true }]),
        // (a tall cab's: down its steps)
        ...(tall
          ? [
              { t: 1.48, v: [G.x + 0.05, stand - 0.02 + base * 0.5, o + 0.36], stop: true },
              { t: 1.6, v: [G.x + 0.06, stand - 0.02 + base * 0.5, o + 0.38], stop: true },
            ]
          : []),
        { t: 1.72, v: [back.x, stand - 0.01, back.w], stop: true },
        { t: 2.2, v: [end.x, stand, end.w], stop: true },
      ],
      t,
      [0, 0, 0],
    );
    fB = track(
      [
        { t: 0, v: [sat[B][0], sat[B][1], sat[B][2], 0, 90 * DEG], stop: true },
        { t: 0.4, v: [sat[B][0], sat[B][1], sat[B][2], 0, 90 * DEG], stop: true },
        ...(tall
          ? [
              { t: 0.62, v: [cabB.x, deck, cabB.w, 0, 100 * DEG], stop: true },
              { t: 1.2, v: [cabB.x, deck, cabB.w, 0, 100 * DEG], stop: true },
              { t: 1.28, v: [(cabB.x + byS.x) / 2, Math.max(clear, base + 0.1), (cabB.w + byS.w) / 2, 0.3, 105 * DEG] },
              { t: 1.36, v: [byS.x, base, byS.w, 0, 110 * DEG], stop: true },
            ]
          : [
              { t: 0.53, v: [xe - 0.16, clear + 0.06, o + 0.06, 0.45, 100 * DEG] },
              { t: 0.66, v: [byS.x, base, byS.w, 0, 110 * DEG], stop: true },
            ]),
        { t: 1.42, v: [byS.x, base, byS.w, 0, 110 * DEG], stop: true },
        ...(tall
          ? [
              { t: 1.5, v: [st1.x, st1.y, st1.w, 0, 100 * DEG], stop: true },
              { t: 1.56, v: [st1.x, st1.y, st1.w, 0, 100 * DEG], stop: true },
            ]
          : [
              {
                t: 1.52,
                v: [(byS.x + back.x) / 2 - fw, 0.07, (byS.w + back.w) / 2 + 0.04, 0.15, 70 * DEG],
              },
            ]),
        { t: 1.62, v: [back.x - fw, 0, back.w + 0.02, 0, phiBack], stop: true },
        { t: 1.98, v: [back.x - fw, 0, back.w + 0.02, 0, phiBack], stop: true },
        { t: 2.08, v: [(back.x + end.x) / 2 - fw, 0.06, (back.w + end.w) / 2, 0.15, phiEnd] },
        { t: 2.18, v: [end.x - fw, 0, end.w, 0, phiEnd], stop: true },
      ],
      t,
      [0, 0, 0, 0, 0],
    );
    fA = track(
      [
        { t: 0, v: [sat[A][0], sat[A][1], sat[A][2], 0, 90 * DEG], stop: true },
        // (off the pedal and back by the door as she slides to the seat's edge)
        { t: 0.12, v: [sat[A][0], sat[A][1], sat[A][2], 0, 90 * DEG], stop: true },
        { t: 0.5, v: [well.x, floorIn, well.w, 0, 92 * DEG], stop: true },
        { t: 1.04, v: [well.x, floorIn, well.w, 0, 92 * DEG], stop: true },
        { t: 1.17, v: [xe - 0.08, Math.max(clear, base + 0.08), o - 0.04, 0.45, 98 * DEG] },
        { t: 1.3, v: [xe + 0.16, base, o + 0.16, 0, 100 * DEG], stop: true },
        { t: 1.54, v: [xe + 0.16, base, o + 0.16, 0, 100 * DEG], stop: true },
        { t: 1.64, v: [(xe + back.x) / 2 + fw, 0.07 + base * 0.5, (o + back.w) / 2, 0.15, 60 * DEG] },
        { t: 1.74, v: [back.x + fw, 0, back.w - 0.02, 0, phiBack], stop: true },
        { t: 1.96, v: [back.x + fw, 0, back.w - 0.02, 0, phiBack], stop: true },
        { t: 2.06, v: [(back.x + end.x) / 2 + fw, 0.06, (back.w + end.w) / 2, 0.15, phiEnd] },
        { t: 2.16, v: [end.x + fw, 0, end.w, 0, phiEnd], stop: true },
      ],
      t,
      [0, 0, 0, 0, 0],
    );
    phi = track(
      [
        { t: 0, v: [90 * DEG], stop: true },
        { t: 0.32, v: [92 * DEG] },
        { t: 0.75, v: [120 * DEG], stop: true },
        { t: 1.2, v: [112 * DEG] },
        { t: 1.5, v: [100 * DEG] },
        { t: 1.72, v: [phiBack], stop: true },
        { t: 1.96, v: [phiBack], stop: true },
        { t: 2.2, v: [phiEnd], stop: true },
      ],
      t,
      [0],
    )[0];
    twist = s * 0.24 * win(t, 0.02, 0.36, 0.14) - s * 0.18 * win(t, 1.4, 1.75, 0.14);
    duck = 0.24 * win(t, 0.86, 1.42, 0.2);
    lean = -0.16 * win(t, 0.02, 0.36, 0.14) + 0.08 * win(t, 0.9, 1.3, 0.2);
    // the door: pushed open by its pull, let go to swing on; pushed shut by its edge from behind it
    door =
      t < 0.1
        ? 0
        : t < 0.34
          ? 0.36 * seg(t, 0.1, 0.34)
          : t < 1.52
            ? 0.36 + (OPEN - 0.36) * segOut(t, 0.34, 0.66)
            : tall
              ? -1
              : OPEN * (1 - segIn(t, 1.52, 1.82));
    if (!selfShut) hands.push({ S: bS, at: "pull", w: win(t, 0.0, 0.3, 0.1) });
    // (the door's edge once she's up out of the seat — held, then pushed shut by it; a tall cab's: let go, it shuts)
    if (!tall) hands.push({ S: bS, at: "edge", w: win(t, 1.28, 1.72, 0.12) });
    hands.push({ S: bS, at: "thigh", w: win(t, selfShut ? 0.0 : 0.26, tall ? 1.0 : 1.2, 0.14) });
    // (pushed up off the wheel — a passenger's seat —; a tall cab's grab handle as she steps down)
    hands.push({
      S: aS,
      at: d.driver ? "wheel" : "seat",
      w: (d.driver ? 1 - seg(t, 0.86, 1.1) : 1) * win(t, behind ? 0.62 : 0.0, 1.06, 0.16),
    });
    if (tall) hands.push({ S: aS, at: "roof", w: win(t, 1.0, 1.5, 0.14) });
    satK = 1 - seg(t, 0, 0.35);
    looks.push({ at: P(M.x1 - 0.42, (d.op.y0 + d.op.y1) / 2, o), w: win(t, 0.0, 0.42, 0.14) });
    looks.push({ at: P(xh - 0.2, 0, o + 0.5), w: win(t, 0.42, 1.2, 0.2) });
    looks.push({ at: P(M.x1 - 0.04, 1.1, o + 0.5), w: win(t, 1.45, 1.85, 0.14) });
  }
  out.hips.set(hips[0], hips[1], s * hips[2]);
  out.yaw = yawAt(d, phi);
  const fs = [fA, fB];
  for (const [j, i] of [
    [0, A],
    [1, B],
  ] as const) {
    const f = fs[j];
    out.feet[i].set(f[0], f[1], s * f[2]);
    out.toe[i] = f[3];
    out.heading[i] = yawAt(d, f[4]);
  }
  // (plan 100) the hips kept within reach of each foot on the ground or the floor: never a planted foot hung in the air
  keepReach(d, out, base);
  // each knee the way its foot goes, up as it's lifted
  for (const i of [0, 1]) {
    const f = out.feet[i];
    // (over what's under it: the footwell's floor inside the car's side, the ground — a cab's step — out of it)
    const ground = Math.abs(f.z) < d.op.out ? deckOf(d) : base;
    const lift = clamp((f.y - ground) / 0.3, 0, 1);
    const on = f.y <= base + 0.02 || Math.abs(f.y - deckOf(d)) < 0.02;
    const up = on ? 0.15 : 0.4 + 1.1 * lift;
    out.knee[i].set(Math.sin(out.heading[i]), up, Math.cos(out.heading[i])).normalize();
  }
  // the head ducked as far as the roof needs as it passes under it — and a little more for the look of it
  out.duck = Math.max(duck, roofDuck(d, out.hips, M.roof));
  out.lean = lean;
  out.twist = twist;
  // the head's turn: toward what's looked at, on the trunk's turn, within a neck's reach
  let lw = 0;
  let la = 0;
  for (const l of looks) {
    if (l.w <= 0.001) continue;
    const dx = l.at[0] - out.hips.x;
    const dz = l.at[2] - out.hips.z;
    const fwd = Math.sin(out.yaw) * dx + Math.cos(out.yaw) * dz;
    const left = Math.cos(out.yaw) * dx - Math.sin(out.yaw) * dz;
    la += Math.atan2(left, fwd) * l.w;
    lw += l.w;
  }
  out.look = lw > 0 ? clamp((la / lw) * Math.min(1, lw) - twist, -0.9, 0.9) * 0.8 : 0;
  out.hands = hands.filter((h) => h.w > 0.001);
  out.door = door;
  out.sat = satK;
  return out;
}

/** (plan 100) A tall cab's — the plough truck's, the snowcat's, the tractor's —: climbed into as people climb into a
 *  truck, facing it. In: the door pulled open from the ground; the inside hand on the grab handle by the door, up its
 *  two steps onto its threshold, stood ducked in its doorway; turned and sat, the outside leg in; the door let go — it
 *  shuts by itself (long, and far from the seat). Out: the door pushed open; to the seat's edge, up in the doorway;
 *  turned to face the cab, down its steps a foot at a time; a step back, away. */
function climbAt(
  d: Doorway,
  t: number,
  leaving: boolean,
  from: { x: number; z: number; yaw: number } | null,
  to: { x: number; z: number } | null,
  out: ActPose,
): ActPose {
  const { s } = d;
  const M = measures(d);
  const { o, xh, wh, stand } = M;
  const top = M.base;
  const s1 = top * 0.5;
  const deck = deckOf(d);
  const fw = 0.11 * d.k;
  const A = s > 0 ? 1 : 0;
  const B = 1 - A;
  const aS: "L" | "R" = A === 1 ? "R" : "L";
  const bS: "L" | "R" = A === 1 ? "L" : "R";
  const sat = d.satFeet.map((f) => [f.x, f.y, f.z * s]);
  const xe = entryX(d);
  // (the steps under the door, the lower one out further; the threshold; stood on it, ducked)
  const st1 = { x: xe + 0.06, w: o + 0.38 };
  // (behind the handle, near the steps — a long door's handle is far back from its seat)
  const S0 = { x: Math.min(M.x1 + 0.16, st1.x + 0.36), w: o + 0.38 };
  const S1 = { x: S0.x + 0.08, w: o + 0.58 };
  const st2 = { x: xe - 0.1, w: o + 0.2 };
  const thr = { x: xe, w: o - 0.08 };
  const well = { x: xe - 0.3, w: wh + 0.12 };
  const hipOn = (y: number) => y + stand - 0.05;
  // (stood in its doorway — as tall as it lets her, ducked: the snowcat's is a metre high)
  const inDoor = {
    x: xe + 0.04,
    y: clamp(M.roof + 0.3 - BODY.head * d.k, deck + 0.3, deck + stand * 0.9),
    w: o - 0.02,
  };
  // (inside the threshold, over it: a foot in or out of the cab lifted over it first)
  const over = { w: o - 0.3, y: deck + 0.07 };
  let hips: number[];
  let fA: number[];
  let fB: number[];
  let phi: number;
  let door: number;
  let satK: number;
  const hands: ActPose["hands"] = [];
  if (!leaving) {
    const f0 = from ?? { x: S0.x, z: s * S0.w, yaw: yawAt(d, 15 * DEG) };
    const w0 = f0.z * s;
    const phi0 = phiOf(d, f0.yaw);
    const lx = Math.cos(f0.yaw);
    const lz = -Math.sin(f0.yaw);
    const startFoot = (i: number) => {
      const sg = i === 0 ? 1 : -1;
      return [f0.x + sg * lx * fw, 0, w0 + sg * lz * s * fw, 0, phi0];
    };
    hips = track(
      [
        { t: 0, v: [f0.x, stand, w0], stop: true },
        { t: 0.28, v: [S0.x, stand, S0.w], stop: true },
        { t: 0.62, v: [S1.x, stand - 0.01, S1.w], stop: true },
        { t: 0.8, v: [(S1.x + st1.x) / 2, stand - 0.02, o + 0.5] },
        // (up onto the first step, the second, the threshold — her weight over each foot in turn, the hips up only as the
        // lower foot leaves)
        { t: 1.0, v: [st1.x + 0.02, stand - 0.06, st1.w + 0.14], stop: true },
        { t: 1.12, v: [st1.x - 0.02, hipOn(s1) - 0.04, st1.w + 0.08] },
        { t: 1.3, v: [st2.x + 0.04, hipOn(top) - 0.04, st2.w + 0.06] },
        { t: 1.44, v: [inDoor.x, inDoor.y, inDoor.w], stop: true },
        // (turned and down onto the seat's edge)
        { t: 1.62, v: [xe + 0.05, M.edgeY, M.edgeW], stop: true },
        { t: 1.72, v: [xe + 0.05, M.edgeY - 0.015, M.edgeW - 0.01] },
        { t: 2.2, v: [xh, d.satHip, wh], stop: true },
      ],
      t,
      [0, 0, 0],
    );
    fA = track(
      [
        { t: 0, v: startFoot(A), stop: true },
        { t: 0.1, v: startFoot(A), stop: true },
        { t: 0.26, v: [S0.x + fw, 0, S0.w + 0.02, 0, 15 * DEG], stop: true },
        { t: 0.38, v: [S0.x + fw, 0, S0.w + 0.02, 0, 15 * DEG], stop: true },
        { t: 0.54, v: [S1.x + fw, 0, S1.w + 0.04, 0, 25 * DEG], stop: true },
        { t: 0.76, v: [S1.x + fw, 0, S1.w + 0.04, 0, 25 * DEG], stop: true },
        { t: 0.84, v: [(S1.x + st1.x) / 2 + 0.05, s1 + 0.1, (S1.w + st1.w) / 2, 0.2, 25 * DEG] },
        { t: 0.92, v: [st1.x + 0.06, s1, st1.w, 0, 25 * DEG], stop: true },
        { t: 1.14, v: [st1.x + 0.06, s1, st1.w, 0, 25 * DEG], stop: true },
        { t: 1.24, v: [thr.x + 0.06, deck + 0.1, o + 0.08, 0.25, 40 * DEG] },
        { t: 1.32, v: [thr.x + 0.06, deck, thr.w, 0, 60 * DEG], stop: true },
        { t: 1.42, v: [thr.x + 0.06, deck, thr.w, 0, 60 * DEG], stop: true },
        // (in over it and down onto the cab's floor as she turns to sit)
        { t: 1.48, v: [thr.x - 0.05, over.y, over.w, 0.2, 80 * DEG] },
        { t: 1.56, v: [well.x, d.floor, well.w, 0, 90 * DEG], stop: true },
        { t: 1.9, v: [well.x, d.floor, well.w, 0, 90 * DEG], stop: true },
        { t: 2.2, v: [sat[A][0], sat[A][1], sat[A][2], 0, 90 * DEG], stop: true },
      ],
      t,
      [0, 0, 0, 0, 0],
    );
    fB = track(
      [
        { t: 0, v: startFoot(B), stop: true },
        { t: 0.14, v: startFoot(B), stop: true },
        { t: 0.3, v: [S0.x - fw, 0, S0.w, 0, 15 * DEG], stop: true },
        { t: 0.5, v: [S0.x - fw, 0, S0.w, 0, 15 * DEG], stop: true },
        { t: 0.66, v: [S1.x - fw, 0, S1.w - 0.03, 0, 30 * DEG], stop: true },
        { t: 0.98, v: [S1.x - fw, 0, S1.w - 0.03, 0, 30 * DEG], stop: true },
        { t: 1.06, v: [(S1.x + st2.x) / 2, s1 + 0.1, (S1.w + st2.w) / 2, 0.2, 30 * DEG] },
        { t: 1.14, v: [st2.x, top, st2.w, 0, 30 * DEG], stop: true },
        { t: 1.3, v: [st2.x, top, st2.w, 0, 30 * DEG], stop: true },
        { t: 1.38, v: [thr.x - 0.12, deck + 0.1, o + 0.08, 0.2, 50 * DEG] },
        { t: 1.46, v: [thr.x - 0.12, deck, thr.w, 0, 80 * DEG], stop: true },
        { t: 1.86, v: [thr.x - 0.12, deck, thr.w, 0, 100 * DEG], stop: true },
        { t: 1.96, v: [thr.x - 0.2, over.y, over.w, 0.2, 95 * DEG] },
        { t: 2.2, v: [sat[B][0], sat[B][1], sat[B][2], 0, 90 * DEG], stop: true },
      ],
      t,
      [0, 0, 0, 0, 0],
    );
    phi = track(
      [
        { t: 0, v: [phi0], stop: true },
        { t: 0.28, v: [15 * DEG], stop: true },
        { t: 0.62, v: [25 * DEG] },
        { t: 0.8, v: [25 * DEG], stop: true },
        { t: 1.24, v: [35 * DEG], stop: true },
        { t: 1.6, v: [115 * DEG], stop: true },
        { t: 2.2, v: [90 * DEG], stop: true },
      ],
      t,
      [0],
    )[0];
    door =
      t < 0.36 ? 0 : t < 0.62 ? 0.42 * seg(t, 0.36, 0.62) : t < 2.2 ? 0.42 + (OPEN - 0.42) * segOut(t, 0.62, 0.92) : -1;
    hands.push({ S: bS, at: "handle", w: win(t, 0.16, 0.6, 0.16) });
    hands.push({ S: aS, at: "roof", w: win(t, 1.1, 1.28, 0.12) });
    hands.push({ S: bS, at: "thigh", w: win(t, 1.5, 2.3, 0.16) });
    hands.push({ S: aS, at: d.driver ? "wheel" : "seat", w: d.driver ? seg(t, 1.48, 1.7) : win(t, 1.48, 2.0, 0.16) });
    satK = seg(t, 2.1, ENTER_S);
  } else {
    const back = { x: xe + 0.4, w: o + 0.72 };
    const tw = to ? to.z * s : back.w;
    const near = to ? tw > o + 0.3 && Math.hypot(to.x - back.x, tw - back.w) < 1.4 : false;
    const end = near && to ? { x: to.x, w: tw } : back;
    const phiEnd =
      near && to && Math.hypot(end.x - back.x, end.w - back.w) > 0.15
        ? phiOf(d, yawOf(end.x - back.x, s * (end.w - back.w)))
        : 38 * DEG;
    hips = track(
      [
        { t: 0, v: [xh, d.satHip, wh], stop: true },
        { t: 0.42, v: [xe + 0.05, M.edgeY, M.edgeW], stop: true },
        // (up in the doorway, ducked; turned to face the cab and down its steps)
        { t: 0.82, v: [inDoor.x, inDoor.y, inDoor.w], stop: true },
        { t: 1.0, v: [inDoor.x, inDoor.y, inDoor.w], stop: true },
        { t: 1.18, v: [st2.x + 0.04, hipOn(top) - 0.04, st2.w + 0.06] },
        { t: 1.36, v: [st1.x - 0.02, hipOn(s1) - 0.04, st1.w + 0.1] },
        { t: 1.56, v: [S1.x - 0.05, stand - 0.02, S1.w - 0.06], stop: true },
        { t: 1.82, v: [back.x, stand - 0.01, back.w], stop: true },
        { t: 2.2, v: [end.x, stand, end.w], stop: true },
      ],
      t,
      [0, 0, 0],
    );
    fB = track(
      [
        { t: 0, v: [sat[B][0], sat[B][1], sat[B][2], 0, 90 * DEG], stop: true },
        { t: 0.3, v: [sat[B][0], sat[B][1], sat[B][2], 0, 90 * DEG], stop: true },
        { t: 0.48, v: [thr.x - 0.2, over.y, over.w, 0.2, 100 * DEG] },
        { t: 0.6, v: [thr.x - 0.12, deck, thr.w, 0, 100 * DEG], stop: true },
        { t: 1.04, v: [thr.x - 0.12, deck, thr.w, 0, 40 * DEG], stop: true },
        { t: 1.12, v: [thr.x - 0.1, deck + 0.06, o + 0.1, 0.2, 30 * DEG] },
        { t: 1.2, v: [st2.x, top, st2.w, 0, 30 * DEG], stop: true },
        { t: 1.4, v: [st2.x, top, st2.w, 0, 30 * DEG], stop: true },
        { t: 1.5, v: [(st2.x + S1.x) / 2 - fw, s1, (st2.w + S1.w) / 2, 0.2, 30 * DEG] },
        { t: 1.6, v: [S1.x - fw, 0, S1.w - 0.06, 0, 35 * DEG], stop: true },
        { t: 1.74, v: [S1.x - fw, 0, S1.w - 0.06, 0, 35 * DEG], stop: true },
        { t: 1.86, v: [back.x - fw, 0, back.w + 0.02, 0, 38 * DEG], stop: true },
        { t: 2.06, v: [back.x - fw, 0, back.w + 0.02, 0, 38 * DEG], stop: true },
        { t: 2.18, v: [end.x - fw, 0, end.w, 0, phiEnd], stop: true },
      ],
      t,
      [0, 0, 0, 0, 0],
    );
    fA = track(
      [
        { t: 0, v: [sat[A][0], sat[A][1], sat[A][2], 0, 90 * DEG], stop: true },
        { t: 0.12, v: [sat[A][0], sat[A][1], sat[A][2], 0, 90 * DEG], stop: true },
        { t: 0.42, v: [well.x, d.floor, well.w, 0, 92 * DEG], stop: true },
        { t: 0.62, v: [well.x, d.floor, well.w, 0, 92 * DEG], stop: true },
        { t: 0.7, v: [thr.x, over.y, over.w, 0.2, 75 * DEG] },
        { t: 0.78, v: [thr.x + 0.06, deck, thr.w, 0, 60 * DEG], stop: true },
        { t: 1.2, v: [thr.x + 0.06, deck, thr.w, 0, 30 * DEG], stop: true },
        { t: 1.27, v: [thr.x + 0.14, deck + 0.05, o + 0.1, 0.2, 25 * DEG] },
        { t: 1.38, v: [st1.x + 0.06, s1, st1.w, 0, 25 * DEG], stop: true },
        { t: 1.56, v: [st1.x + 0.06, s1, st1.w, 0, 25 * DEG], stop: true },
        { t: 1.66, v: [(st1.x + back.x) / 2 + fw, 0.08, (st1.w + back.w) / 2, 0.2, 35 * DEG] },
        { t: 1.76, v: [back.x + fw, 0, back.w - 0.02, 0, 38 * DEG], stop: true },
        { t: 2.04, v: [back.x + fw, 0, back.w - 0.02, 0, 38 * DEG], stop: true },
        { t: 2.16, v: [end.x + fw, 0, end.w, 0, phiEnd], stop: true },
      ],
      t,
      [0, 0, 0, 0, 0],
    );
    phi = track(
      [
        { t: 0, v: [90 * DEG], stop: true },
        { t: 0.45, v: [115 * DEG], stop: true },
        { t: 0.82, v: [100 * DEG] },
        { t: 1.06, v: [30 * DEG], stop: true },
        { t: 1.6, v: [30 * DEG], stop: true },
        { t: 1.84, v: [38 * DEG], stop: true },
        { t: 2.2, v: [phiEnd], stop: true },
      ],
      t,
      [0],
    )[0];
    door = t < 0.1 ? 0 : t < 1.9 ? OPEN * segOut(t, 0.1, 0.5) : -1;
    hands.push({ S: aS, at: d.driver ? "wheel" : "seat", w: win(t, 0.0, 0.5, 0.14) });
    hands.push({ S: aS, at: "roof", w: win(t, 1.0, 1.34, 0.14) });
    hands.push({ S: bS, at: "thigh", w: win(t, 0.0, 0.6, 0.14) });
    satK = 1 - seg(t, 0, 0.35);
  }
  out.hips.set(hips[0], hips[1], s * hips[2]);
  out.yaw = yawAt(d, phi);
  const fs = [fA, fB];
  for (const [j, i] of [
    [0, A],
    [1, B],
  ] as const) {
    const f = fs[j];
    out.feet[i].set(f[0], f[1], s * f[2]);
    out.toe[i] = f[3];
    out.heading[i] = yawAt(d, f[4]);
  }
  keepReach(d, out, top);
  for (const i of [0, 1]) {
    const f = out.feet[i];
    const on = f.y <= 0.02 || Math.abs(f.y - s1) < 0.02 || Math.abs(f.y - top) < 0.02 || Math.abs(f.y - deck) < 0.02;
    const up = on ? 0.15 : 1.0;
    out.knee[i].set(Math.sin(out.heading[i]), up, Math.cos(out.heading[i])).normalize();
  }
  out.duck = roofDuck(d, out.hips, M.roof);
  out.lean = 0;
  out.twist = 0;
  out.look = 0;
  out.hands = hands.filter((h) => h.w > 0.001);
  out.door = door;
  out.sat = satK;
  return out;
}

/** (plan 100) The hips pulled in toward a foot that's down (on the ground, a cab's step, the footwell's floor) if its
 *  leg can't reach it — the foot stays where it's planted. */
function keepReach(d: Doorway, p: ActPose, base: number) {
  const reach = (BODY.thigh + BODY.shin) * d.k * 0.995;
  for (let pass = 0; pass < 2; pass++)
    for (const i of [0, 1]) {
      const f = p.feet[i];
      const down =
        (f.y <= 0.015 ||
          Math.abs(f.y - base) < 0.015 ||
          Math.abs(f.y - base * 0.5) < 0.015 ||
          Math.abs(f.y - deckOf(d)) < 0.015 ||
          Math.abs(f.y - d.floor) < 0.015) &&
        p.toe[i] < 0.05;
      if (!down) continue;
      const hj = hipJoint(p, i, d.k, _hj);
      const dx = f.x - hj.x;
      const dy = f.y + BODY.ankle * d.k - hj.y;
      const dz = f.z - hj.z;
      const dist = Math.hypot(dx, dy, dz);
      if (dist <= reach) continue;
      const h = Math.hypot(dx, dz);
      if (h < 1e-4) continue;
      // (only along the ground: the hips' height as the act has it)
      const want = Math.sqrt(Math.max(0, reach * reach - dy * dy));
      const move = Math.max(0, h - want);
      p.hips.x += (dx / h) * move;
      p.hips.z += (dz / h) * move;
    }
}
const _hj = new Vector3();
/** A leg's hip joint (the body's frame): off the hips' middle by her left (L) or right (R). */
export function hipJoint(p: ActPose, i: number, k: number, out = new Vector3()): Vector3 {
  const sg = i === 0 ? 1 : -1;
  return out.set(
    p.hips.x + Math.cos(p.yaw) * BODY.hipW * k * sg,
    p.hips.y,
    p.hips.z - Math.sin(p.yaw) * BODY.hipW * k * sg,
  );
}

/** (plan 100) How far the head must duck to pass under the roof's edge: her head's top as stood over the hips, against
 *  the opening's top, eased in as the hips come under it (0..0.9). */
function roofDuck(d: Doorway, hips: Vector3, roof: number): number {
  const w = Math.abs(hips.z);
  const under = clamp((d.op.out + 0.5 - w) / 0.3, 0, 1);
  if (under <= 0) return 0;
  const top = hips.y + BODY.head * d.k;
  const need = top + 0.05 - roof;
  // (ducked fully, the head's ~0.5 m lower — the hips, the back and the neck bent: carStep)
  return clamp(need / (0.5 * d.k), 0, 0.9) * under;
}

/** (plan 100) A two-bone leg's knee (the body's frame): from the hip's joint to the ankle, bent toward `pole`. */
export function kneeOf(hip: Vector3, ankle: Vector3, pole: Vector3, a: number, b: number, out = new Vector3()) {
  const D = _kd.copy(ankle).sub(hip);
  const d = Math.min(a + b - 1e-4, Math.max(1e-3, D.length()));
  const u = D.normalize();
  const v = _kv.copy(pole).addScaledVector(u, -pole.dot(u));
  if (v.lengthSq() < 1e-8) v.set(0, 1, 0).addScaledVector(u, -u.y);
  v.normalize();
  const ca = clamp((a * a + d * d - b * b) / (2 * a * d), -1, 1);
  const sa = Math.sqrt(1 - ca * ca);
  return out
    .copy(hip)
    .addScaledVector(u, a * ca)
    .addScaledVector(v, a * sa);
}
const _kd = new Vector3();
const _kv = new Vector3();

export function newActPose(): ActPose {
  return {
    hips: new Vector3(),
    yaw: 0,
    feet: [new Vector3(), new Vector3()],
    toe: [0, 0],
    heading: [0, 0],
    knee: [new Vector3(0, 0, 1), new Vector3(0, 0, 1)],
    duck: 0,
    lean: 0,
    twist: 0,
    look: 0,
    hands: [],
    door: -1,
    sat: 0,
  };
}

/** (plan 100) A hand resting on her own thigh (the body's frame): ahead of the hips, out to the hand's own side. */
export function thighGrip(p: ActPose, S: "L" | "R", k: number, out = new Vector3()): Vector3 {
  const sg = S === "L" ? 1 : -1;
  const f = 0.24 * k;
  const l = 0.13 * k * sg;
  return out.set(
    p.hips.x + Math.sin(p.yaw) * f + Math.cos(p.yaw) * l,
    p.hips.y + 0.06 * k,
    p.hips.z + Math.cos(p.yaw) * f - Math.sin(p.yaw) * l,
  );
}

/** The seat's back by the door, its top's inside corner: a passenger's hand on it getting in and out. (plan 100: the
 *  seat's outer bolster by the door — a hand pressed on it lowering herself, at her hip's height, not up by her head) */
export function seatGrip(d: Doorway, out = new Vector3()): Vector3 {
  return out.set(entryX(d) + 0.06, d.hip.y + 0.12, d.hip.z + d.s * 0.16);
}
/** (plan 100) Where someone sits on the seat's edge getting in by the opening: the seat's own x, or — a seat behind the
 *  opening — within it. */
export function entryX(d: Doorway): number {
  return d.hip.x > d.op.x1 - 0.05 ? clamp(d.hip.x, d.op.x0 + 0.4, d.op.x1 - 0.2) : d.hip.x;
}
/** (plan 100) A spot on the ground (x, w) kept clear of the door open at OPEN: out of its slab, to its inside. */
function clearOfDoor(d: Doorway, p: { x: number; w: number }, margin = 0.18): { x: number; w: number } {
  const th = OPEN * 1.05;
  const dx = Math.cos(th);
  const dw = Math.sin(th);
  const r = (p.x - d.op.x0) * dx + (p.w - d.op.out) * dw;
  const n = -(p.x - d.op.x0) * dw + (p.w - d.op.out) * dx;
  if (r < 0 || r > d.op.x1 - d.op.x0 + 0.1 || n < -margin) return p;
  const k = n + margin;
  return { x: p.x + dw * k, w: p.w - dx * k };
}
/** A tall cab's grab handle (the body's frame): on the pillar behind its door's opening, at the chest of someone on
 *  its top step. */
export function roofGrip(d: Doorway, out = new Vector3()): Vector3 {
  const base = stepsOf(d);
  return out.set(d.op.x1 + 0.02, Math.min(d.op.glass - 0.05, base + 1.05 * d.k), d.s * (d.op.out - 0.04));
}

/** (plan 100) The door's marks for a hinged door at `rad` open (the body's frame): its handle, its inside pull, its back
 *  edge at the chest — as `Cars.doorMarks` puts them on the door's group. For the checks (the game reads the marks). */
export function markAt(d: Doorway, grip: "handle" | "pull" | "edge", rad: number, out = new Vector3()): Vector3 {
  const { op, s } = d;
  const mid = (op.y0 + op.y1) / 2;
  const at =
    grip === "handle"
      ? [op.x1 - 0.1, handleY(d), op.out + 0.01]
      : grip === "pull"
        ? [op.x1 - 0.42, mid + 0.02, op.out - 0.1]
        : [op.x1 - 0.03, edgeY(d), op.out - 0.02];
  // (about the hinge at the opening's front edge, on the body's side: the back edge swings out)
  const r = at[0] - op.x0;
  const w = at[2] - op.out;
  const c = Math.cos(rad);
  const sn = Math.sin(rad);
  return out.set(op.x0 + r * c - w * sn, at[1], s * (op.out + r * sn + w * c));
}
/** (plan 100) The door's outside handle's height: under its glass, halfway up the opening — or, a tall cab's, low on
 *  its door, where someone stood on the ground reaches it. */
export function handleY(d: Doorway): number {
  const mid = (d.op.y0 + d.op.y1) / 2 + 0.06;
  return Math.min(mid, Math.max(d.op.y0 + 0.2, 1.75 * d.k));
}
/** (plan 100) Where a hand holds the door's back edge: at the chest of someone stood by it — between its belt and its
 *  glass's top. */
export function edgeY(d: Doorway): number {
  const belt = d.belt ?? (d.op.y0 + d.op.glass) / 2;
  const base = stepsOf(d);
  return clamp(base + 1.15 * d.k, belt + 0.05, d.op.glass - 0.1);
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
  out.heading[0] = out.heading[1] = out.yaw;
  for (const i of [0, 1]) {
    const lifted = out.feet[i].y > 0.05;
    out.knee[i].set(Math.sin(out.yaw), lifted ? 0.9 : 0.15, Math.cos(out.yaw)).normalize();
  }
  out.duck = win(tt, 0.5, 1.3, 0.3) * 0.3;
  out.lean = win(tt, 0.55, 1.3, 0.25) * 0.15;
  out.twist = 0;
  out.look = 0;
  out.hands = [{ S: aS, at: "saddle" as Grip, w: win(tt, 0.4, 1.3, 0.2) }].filter((h) => h.w > 0.001);
  out.door = -1;
  out.sat = seg(tt, 1.45, 1.9);
  return out;
}

/** (plan 101) Onto a bicycle, the way riders (and GTA) do it — on its timeline as `straddleAt` (sat by 1.9 s, out the
 *  same backwards in 1.7): stood at its left by the top tube, both hands to the grips; weight on the near foot, the
 *  trunk over the bars, the far leg swung back and over behind the saddle, just clearing it (a step-through's stepped
 *  through its low frame instead), down on the far side; the hips onto the saddle; the near foot up to its pedal last.
 *  `step`: a step-through frame. The hands' "saddle" grip is the bike's grips (cars.ts). */
export function bikeOnAt(
  d: Doorway,
  t: number,
  leaving: boolean,
  from: { x: number; z: number; yaw: number } | null,
  out: ActPose,
  step: boolean,
): ActPose {
  const s = d.s;
  const xh = d.hip.x;
  const yh = d.hip.y;
  const wh = d.hip.z * s;
  // (stood by the top tube, a little ahead of the saddle; out from the frame by a hip's width)
  const xs = xh - 0.3;
  const w0 = 0.42;
  const stand = d.stand - 0.02;
  const A = s > 0 ? 1 : 0;
  const B = 1 - A;
  const sat = d.satFeet.map((f) => [f.x, f.y, f.z * s]);
  const face = yawOf(-1, 0);
  const tt = leaving ? 1.9 - t * (1.9 / 1.7) : t;
  const f0 = !leaving && from ? { x: from.x, w: from.z * s } : { x: xs, w: w0 };
  const hips = track(
    [
      { t: 0, v: [f0.x, stand, f0.w], stop: true },
      { t: 0.3, v: [xs, stand, w0], stop: true },
      { t: 0.55, v: [xs + 0.02, stand - 0.04, w0 - 0.03] },
      { t: 0.85, v: [xs + 0.06, stand - 0.03, w0 - 0.08] },
      { t: 1.05, v: [xh - 0.06, Math.max(d.satHip + 0.1, stand - 0.12), w0 * 0.35] },
      { t: 1.3, v: [xh, d.satHip + 0.02, wh] },
      { t: 1.5, v: [xh, d.satHip, wh], stop: true },
    ],
    tt,
    [0, 0, 0],
  );
  // the far leg: back and over behind the saddle — or through the low frame
  const swing: K[] = step
    ? [
        { t: 0.62, v: [xs - 0.08, 0.42, w0 - 0.22, 0.3] },
        { t: 0.82, v: [xs - 0.06, 0.48, -0.02, 0.3] },
        { t: 1.0, v: [(xs + sat[A][0]) / 2, Math.max(sat[A][1], 0) + 0.12, sat[A][2] * 0.7, 0.2] },
      ]
    : [
        { t: 0.62, v: [xh + 0.32, yh - 0.12, w0 - 0.06, 0.7] },
        { t: 0.8, v: [xh + 0.4, yh + 0.08, 0.02, 0.7] },
        { t: 0.98, v: [xh + 0.18, Math.max(sat[A][1], 0) + 0.3, sat[A][2] * 0.8, 0.4] },
      ];
  const fA = track(
    [
      { t: 0, v: [f0.x - 0.05, 0, f0.w - 0.12, 0], stop: true },
      { t: 0.3, v: [xs + 0.04, 0, w0 - 0.12, 0], stop: true },
      { t: 0.45, v: [xs + 0.04, 0, w0 - 0.12, 0], stop: true },
      ...swing,
      { t: 1.15, v: [sat[A][0], sat[A][1], sat[A][2], 0], stop: true },
    ],
    tt,
    [0, 0, 0, 0],
  );
  const fB = track(
    [
      { t: 0, v: [f0.x + 0.05, 0, f0.w + 0.12, 0], stop: true },
      { t: 0.3, v: [xs - 0.04, 0, w0 + 0.1, 0], stop: true },
      { t: 1.2, v: [xs - 0.02, 0, w0 + 0.06, 0], stop: true },
      { t: 1.36, v: [(xs + sat[B][0]) / 2, Math.max(sat[B][1], 0) + 0.12, (w0 + sat[B][2]) / 2, 0.3] },
      { t: 1.52, v: [sat[B][0], sat[B][1], sat[B][2], 0], stop: true },
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
  out.heading[0] = out.heading[1] = out.yaw;
  // (the knees forward and a little down — a leg swung back bends behind the knee, as one does)
  for (const i of [0, 1]) {
    const lifted = out.feet[i].y > 0.05;
    out.knee[i].set(Math.sin(out.yaw), lifted ? 0.1 : 0.15, Math.cos(out.yaw)).normalize();
  }
  // (bent over the bars as the leg goes back — less for the step-through's —, leant a touch to the bike)
  out.duck = win(tt, 0.4, 1.15, 0.25) * (step ? 0.2 : 0.42);
  out.lean = win(tt, 0.45, 1.2, 0.25) * 0.1;
  out.twist = 0;
  out.look = 0;
  const w = seg(tt, 0.15, 0.45);
  out.hands = (
    [
      { S: "L", at: "saddle" as Grip, w },
      { S: "R", at: "saddle" as Grip, w },
    ] as ActPose["hands"]
  ).filter((h) => h.w > 0.001);
  out.door = -1;
  out.sat = seg(tt, 1.45, 1.9);
  return out;
}
