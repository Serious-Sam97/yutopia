// Plan 80 — the revolver held as a person holds one (docs/plan/80-the-revolver.md). The gun is the anchor:
// placed in front of her by what she's doing (RE4 Remake's low ready, the isosceles aim, AW2's Harries with
// the torch), the right hand turned so it holds the gun there, the left put on the gun at a place on it with
// its own turn (chars/model.ts gripTo, wristFor) — the numbers the phase 0 mocks' (tools/art/guns/mock80.py,
// signed off 2026-11-12), in her frame: from her shoulders' middle, x her left, y up, z ahead, in the mocks'
// man's metres (scaled by her arms' length against his: 0.501 m shoulder to wrist).
import { Matrix4, type Quaternion, Vector3 } from "three";

/** Her frame (the world's): the shoulders' middle; her left, up and ahead (unit); her size against the
 *  mocks' man */
export interface BodyFrame {
  mid: Vector3;
  left: Vector3;
  up: Vector3;
  ahead: Vector3;
  k: number;
}

/** How far ahead of the shoulders the aimed gun's grip is (m, the mocks' man's): the mocks had 0.48 for the
 *  palm's middle; the game's grip sits further out in the hand (at the fingers' roots), so further — the
 *  elbows a little soft, not folded (at 0.48 they bent 66° and the wrists turned past their reach) */
export const AIM_REACH = 0.55;
/** The aimed grip over the shoulders (m, the mocks' man's): about level with them — the arms out level, the
 *  bore a hand over them, the head down to it (the mocks' 6 cm over had the forearms rising to wrists bent
 *  50° down to the grip) */
export const AIM_HIGH = -0.01;
/** Aimed, the right wrist this much of the arm's reach from the shoulder: nearly straight, the elbow soft (~25°:
 *  at 0.94 it bent 42°) */
export const AIM_ARM = 0.985;
/** The low ready (RE4 Remake's): the isosceles lowered this much (rad) — the muzzle at the ground ~2 m ahead */
export const READY_PITCH = -0.8;
/** …the elbows a little softer than aimed */
export const READY_ARM = 0.93;
/** The mocks' man's arm, shoulder to wrist (m) */
export const MOCK_ARM = 0.501;

/** Where the gun goes (its grip point — the model's origin — the barrel's way, its top's: the world's), and
 *  the left hand: on the gun in the support grip, or holding the torch (its wrist's place, the world's). */
export interface RevolverHold {
  grip: Vector3;
  f: Vector3;
  u: Vector3;
  left: "support" | "torch";
  torchAt: Vector3;
  /** the gun moved along its way till the right wrist is this much of the arm's reach from the shoulder (0:
   *  where it's put) */
  reach: number;
  /** the elbows' poles (the right arm's terms: chars/model.ts reachTo mirrors the left's) */
  poleR: [number, number, number];
  poleL: [number, number, number];
}

/** (in the gun's own frame: x along the barrel, y its top, z its right; m) The support hand on the grip's
 *  left panel over the right's fingers: its palm's middle, the fingers' way (forward and down, round the
 *  grip's front), its index side (forward and up: the thumb along the frame). The mocks' support_hand. */
export const SUPPORT = {
  // (4 cm further back than the mocks': the game's right hand sits further back on the grip — its fingers'
  // roots on it, not its palm's middle — and the support hand fills what it leaves of the panel; 4 cm out
  // to its left, over the right's fingertips wrapped round to that side)
  palm: new Vector3(-0.042, -0.034, -0.04),
  // (the mocks' had the fingers 51° down: with the forearms level the wrist bent 57° sideways — 36° here)
  along: new Vector3(0.78, -0.57, 0.12).normalize(),
  index: new Vector3(0.57, 0.78, 0).normalize(),
};
/** (the gun's frame) Where the support thumb's pad goes: along the frame's left side under the cylinder's
 *  front — thumbs forward */
export const SUPPORT_THUMB = new Vector3(0.06, 0.036, -0.027);
/** (plan 80 phase 3) Harries, aimed with the torch: the left fist under the right wrist (its palm's middle this
 *  far under the wrist, m), the back of the hand up against it, the torch held ice-pick — its lens out of the
 *  little finger's side, ahead along the barrel */
export const HARRIES = { under: 0.072, ahead: 0.0, right: 0.01 };
/** A shot's kick on the hold: the muzzle up (rad), the gun back and up (m) — the wrists giving */
export const KICK = { flip: 0.32, back: 0.03, up: 0.012 };
/** The trigger finger: straight along the frame at the ready, in the guard on the trigger aimed (and how much
 *  further a pull curls it) — the library's curls */
export const INDEX = { ready: 0.12, aim: 0.62, pull: 0.3 };
/** (the gun's frame) What the support hand's fingers close round: the right fist on the grip — a round
 *  thing along the grip's rake, a little ahead of the grip's own middle (the right fingers round its front) */
export const FIST = { at: new Vector3(-0.004, -0.024, 0), r: 0.037, hy: 0.045 };

const _v = new Vector3();
const _a = new Vector3();
const _u = new Vector3();
const _m = new Matrix4();
const at = (B: BodyFrame, x: number, y: number, z: number, out: Vector3) =>
  out
    .copy(B.mid)
    .addScaledVector(B.left, x * B.k)
    .addScaledVector(B.up, y * B.k)
    .addScaledVector(B.ahead, z * B.k);

/** The hold for what she's doing: aiming (`pitch` up, rad) or at the low ready (`run` 0..1: tucked closer
 *  running), the torch on or not. Into `out`. */
export function revolverHold(
  B: BodyFrame,
  s: { aiming: boolean; pitch: number; torch: boolean; run: number },
  out: RevolverHold,
): RevolverHold {
  const { left, up, ahead } = B;
  const r = s.run;
  if (s.aiming || !s.torch) {
    // isosceles, thumbs forward: the grip at the shoulders' height (AIM_HIGH), ahead of them (the arms nearly
    // straight: AIM_ARM), the sights under the eyes; the whole of it turned up about the shoulders as she aims
    // up. The low ready (RE4 Remake's): the same, lowered — the arms out and down READY_PITCH, the elbows
    // softer (READY_ARM), the muzzle at the ground a couple of metres ahead; running, tucked in and steeper.
    const pitch = s.aiming ? s.pitch : READY_PITCH - 0.35 * r;
    const c = Math.cos(pitch);
    const sn = Math.sin(pitch);
    const fwd = _a.copy(ahead).multiplyScalar(c).addScaledVector(up, sn);
    const top = _u.copy(up).multiplyScalar(c).addScaledVector(ahead, -sn);
    out.grip
      .copy(B.mid)
      .addScaledVector(left, -0.03 * B.k)
      .addScaledVector(top, AIM_HIGH * B.k)
      .addScaledVector(fwd, AIM_REACH * B.k);
    out.f.copy(fwd);
    out.u.copy(top);
    out.reach = s.aiming ? AIM_ARM : READY_ARM - 0.2 * r;
    out.poleR = [-1, -0.7, -0.2];
    out.poleL = [-1, -0.7, -0.2];
    if (s.torch) {
      // (Harries: the torch hand crossed under the gun hand, the backs of the wrists pressed)
      out.left = "torch";
      out.torchAt
        .copy(out.grip)
        .addScaledVector(top, -0.1 * B.k)
        .addScaledVector(fwd, -0.11 * B.k)
        .addScaledVector(left, 0.01 * B.k);
      out.poleL = [-0.5, -1, 0.3];
    } else out.left = "support";
    return out;
  }
  // at the ready with the torch on (F3a): the gun low in the right hand alone, the muzzle down at the ground,
  // further right; the torch out ahead in the left
  const down = 0.9 + 0.25 * r;
  at(B, -0.17, -0.378 + 0.03 * r, 0.231 - 0.06 * r, out.grip);
  out.f
    .copy(ahead)
    .multiplyScalar(Math.cos(down))
    .addScaledVector(up, -Math.sin(down))
    .addScaledVector(left, -0.12)
    .normalize();
  out.u.copy(up).addScaledVector(out.f, -up.dot(out.f)).normalize();
  out.reach = 0;
  out.poleR = [-1, -0.6, -0.6];
  out.left = "torch";
  // (the torch's wrist: out ahead, at the chest's height, a little left)
  at(B, 0.12, -0.2, 0.4 - 0.08 * r, out.torchAt);
  out.poleL = [-0.8, -1, -0.3];
  return out;
}

/** (plan 80 phase 2) The revolver in its holster at her right hip: the grip up at the belt, the muzzle down
 *  (a touch forward), its left side against the hip — where the draw starts and the put-away ends. */
export function holsterHold(B: BodyFrame, out: { grip: Vector3; f: Vector3; u: Vector3 }) {
  at(B, -0.21, -0.47, -0.03, out.grip);
  out.f.copy(B.up).negate().addScaledVector(B.ahead, 0.12).normalize();
  out.u.copy(B.ahead).addScaledVector(out.f, -B.ahead.dot(out.f)).normalize();
  return out;
}
/** The draw's path (0 in the holster … 1 at the hold): straight up out of it first (DRAW_LIFT of the way, 13
 *  cm), then turned muzzle-forward and out to the hold; the support hand meets it from DRAW_MEET on */
export const DRAW_LIFT = 0.3;
export const DRAW_MEET = 0.55;

export function newHold(): RevolverHold {
  return {
    grip: new Vector3(),
    f: new Vector3(),
    u: new Vector3(),
    left: "support",
    torchAt: new Vector3(),
    reach: 0,
    poleR: [-0.8, -1, -0.6],
    poleL: [-0.8, -1, -0.6],
  };
}

/** How far a gun's top leans off upright (rad): its top against the world's up, both across the barrel */
export function cantOf(f: Vector3, u: Vector3): number {
  const want = _v.set(0, 1, 0).addScaledVector(f, -f.y);
  if (want.lengthSq() < 1e-8) return 0;
  want.normalize();
  const top = _a.copy(u).addScaledVector(f, -u.dot(f)).normalize();
  return Math.acos(Math.max(-1, Math.min(1, top.dot(want))));
}

/** The gun's turn (the world's) for its barrel along f and its top along u */
export function gunQuat(f: Vector3, u: Vector3, out: Quaternion): Quaternion {
  const x = _v.copy(f).normalize();
  const y = _a.copy(u).addScaledVector(x, -u.dot(x)).normalize();
  return out.setFromRotationMatrix(_m.makeBasis(x, y, _u.crossVectors(x, y)));
}
