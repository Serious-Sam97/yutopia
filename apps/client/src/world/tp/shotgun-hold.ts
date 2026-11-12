// Plan 81 — the double-barrel held as a person holds one (docs/plan/81-the-shotgun.md), on plan 80's
// machinery (tp/revolver-hold.ts, chars/model.ts gripTo): the gun the anchor, placed by its butt in the right
// shoulder's pocket — at the low ready (F1a: the muzzle ~35° down) or aimed (F2a: the butt's heel up at the
// top of the shoulder, the comb to the cheek); the right hand on the stock's wrist by a frame of its own (the
// gun held fixed in the fist, never turned in it); the left palm up under the fore-end, its fingers round its
// side, as far out as the arm reaches. The numbers the phase 0 mocks' (tools/art/guns/mock81.py, signed off
// 2026-11-12) — in the gun's own frame here (x along the barrels, y its top, z its right; m).
import { Matrix4, type Quaternion, Vector3 } from "three";
import type { HandFrame } from "../chars/props";
import { type BodyFrame, bodyDir, gunQuat } from "./revolver-hold";

/** The right hand on the stock's wrist: its palm's middle (its skin on the wrist's right side), the fingers'
 *  way (forward and down round the wrist's front), its index side (forward and up) */
export const SG_WRIST = {
  palm: new Vector3(-0.046, -0.022, 0.012),
  // (the knuckles nearly along the gun, ~22° down: a shotgun's wrist is shallow — the mocks' 40°, a pistol
  // grip's, left the wrist bent 80° sideways)
  along: new Vector3(0.92, -0.38, -0.1).normalize(),
  index: new Vector3(0.3, 1, 0).normalize(),
};
/** …what its fingers close round: the stock's wrist, round, its axis across the fingers' way (back and down,
 *  ~50°) */
export const SG_WRIST_SHAPE = {
  at: new Vector3(-0.045, -0.02, 0),
  axis: new Vector3(0.55, 0.83, 0).normalize(),
  shape: { round: true as const, r: 0.019, y0: 0, hy: 0.035 },
};
/** The left hand palm up under the fore-end (its palm's middle 9 mm inside its underside — its skin on it, the
 *  knuckles at its right edge — the fingers round its right side, the thumb ahead along its left: `x` along
 *  the gun, from the fore-end's back end (`FORE_X[0]`, by the hinge) out to `FORE_X[1]` — as far out as the
 *  arm reaches */
export const SG_FORE = {
  y: 0.035,
  along: new Vector3(0.45, 0, 0.85).normalize(),
  index: new Vector3(1, 0, 0),
};
export const FORE_X: [number, number] = [0.16, 0.33];
/** …what its fingers close round: the fore-end, a box along the barrels (its own y; its x down, its z across
 *  — turned so by Y onto the gun's X), 3.4 cm tall and 5.4 wide, its middle this high (round, its middle
 *  that high, the palm under it was inside it) */
export const SG_FORE_SHAPE = {
  y: 0.043,
  shape: { round: false as const, half: [0.017, 0.07, 0.027] as [number, number, number], cz: 0 },
};
/** The butt pad's middle (its frame) */
export const SG_BUTT = new Vector3(-0.392, -0.035, 0);
/** The barrels' hinge (their group's pivot — the fore-end's on them, it drops with them) */
export const SG_HINGE = new Vector3(0.144, 0.033, 0);
/** The low ready (F1a): the muzzle this far down (rad), a little left; the butt this far under the pocket */
export const SG_READY = { down: 0.6, left: 0.08, drop: 0 };
/** Aimed (F2a): the butt's heel at the top of the shoulder — the pocket this far up (m, the mocks' man's) */
export const SG_AIM = { up: 0.05 };
/** Her trunk turned this far right of the gun's way (rad, the mocks': square, her left arm couldn't reach the
 *  fore-end — 16 cm short) */
export const SG_BLADE = 0.5;

/** The gun's turn (the world's) and its grip point, for its butt in the right shoulder's pocket: the pocket
 *  in from the shoulder's joint, ahead of it, a little under (`up` higher) */
export function longHold(
  B: BodyFrame,
  shoulderR: Vector3,
  s: { aiming: boolean; pitch: number; run: number },
  out: { grip: Vector3; f: Vector3; u: Vector3; q: Quaternion },
): void {
  const { up, ahead, left } = B;
  if (s.aiming) {
    const c = Math.cos(s.pitch);
    const sn = Math.sin(s.pitch);
    out.f.copy(ahead).multiplyScalar(c).addScaledVector(up, sn);
    out.u.copy(up).multiplyScalar(c).addScaledVector(ahead, -sn);
  } else {
    // (the low ready; running, steeper)
    const d = SG_READY.down + 0.2 * s.run;
    bodyDir(B, [SG_READY.left, -Math.sin(d), Math.cos(d)], out.f);
    out.u.copy(up).addScaledVector(out.f, -up.dot(out.f)).normalize();
  }
  gunQuat(out.f, out.u, out.q);
  const lift = s.aiming ? SG_AIM.up : -SG_READY.drop;
  const pocket = _p
    .copy(shoulderR)
    .addScaledVector(left, 0.06 * B.k)
    .addScaledVector(ahead, 0.07 * B.k)
    .addScaledVector(up, (lift - 0.025) * B.k);
  // (the grip point: the pocket less the butt's place in the gun)
  out.grip.copy(pocket).sub(_b.copy(SG_BUTT).multiplyScalar(B.k).applyQuaternion(out.q));
}

/** The gun's frame under the right wrist (its wrist's space): held so the hand's own frame meets the
 *  stock's wrist socket — into q, p */
export function longInHand(F: HandFrame, q: Quaternion, p: Vector3) {
  const a = _a.copy(F.along).normalize();
  const b = _c.copy(F.across).addScaledVector(a, -F.across.dot(a)).normalize();
  _m1.makeBasis(a, b, _d.crossVectors(a, b));
  const ga = _a2.copy(SG_WRIST.along);
  const gb = _c2.copy(SG_WRIST.index).addScaledVector(ga, -SG_WRIST.index.dot(ga)).normalize();
  _m2.makeBasis(ga, gb, _d2.crossVectors(ga, gb));
  q.setFromRotationMatrix(_m1.multiply(_m2.transpose()));
  // (the palm's middle — 0.55 of the way to the middle knuckle, 2.2 cm out of the palm — on the socket)
  const palm = _p.copy(F.mid).multiplyScalar(0.55).addScaledVector(_d.copy(F.n).normalize(), 0.022);
  p.copy(palm).sub(_b.copy(SG_WRIST.palm).applyQuaternion(q));
}

const _p = new Vector3();
const _b = new Vector3();
const _a = new Vector3();
const _c = new Vector3();
const _d = new Vector3();
const _a2 = new Vector3();
const _c2 = new Vector3();
const _d2 = new Vector3();
const _m1 = new Matrix4();
const _m2 = new Matrix4();
