// The view model (docs/plan/116-first-person-guns.md, F1a): my arms and gun in first person, posed by my body's own
// clips (plans 79–84, third person untouched), then moved as one — rigidly, so the hands keep their hold — till the
// gun sits where the eye wants it: low right at the hip (F3a, CS's), its real sights on the screen's middle aiming
// (F4a). Reloading, drawing, sprinting, the move is frozen as it was and the clip's own motion plays through it,
// eased back into the frame when its work would leave it (F5a).
//
// All in the hands' rig's space: the camera's (x right, y up, looking down −z).

import { Matrix4, type Object3D, Quaternion, Vector3 } from "three";

/** Per gun: where the rear sight sits at the hip, which way the barrel points and how it's canted; how far from the
 *  eye the rear sight is aimed (the front then lines up on the middle by itself); the lens narrowed aiming. */
export interface VmGun {
  /** at the hip: where the grip (the right fist) sits, the barrel's way, its cant (+: the top to the left, its right
   *  side to the eye — CS's) */
  hip: { at: [number, number, number]; dir: [number, number, number]; roll: number };
  /** aiming: the rear sight's distance in front of the eye (m) */
  eye: number;
  /** aiming: the eye this far over the model's sight line (its points sit mid-blade; the eye looks over the notch) */
  up: number;
  /** aiming: the world's lens narrowed by (0.15 = 15 %) */
  zoom: number;
  /** the reload's camera: how far it dips (rad) and rolls (rad) over the reload */
  dip: number;
  roll: number;
  /** the reload: how far the arms are tipped up about the eyes (rad) to bring the clip's work into view, and moved
   *  (m: right, up, forward −) */
  tip: number;
  rel?: [number, number, number];
  /** (the fingers' last mm) each finger bent this much more (rad; − opens) after the hold, the left hand's and the
   *  right's, thumb to little — solved on the bench against the gun's own surface (e2e/zz-fpbench.mts SOLVE) */
  fingers?: { L: number[]; R: number[] };
}

export const VM: Record<string, VmGun> = {
  revolver: {
    hip: { at: [0.13, -0.17, -0.42], dir: [-0.12, 0.05, -1], roll: 0.3 },
    eye: 0.42,
    up: 0.004,
    zoom: 0.15,
    dip: 0.2,
    roll: 0.06,
    tip: 0.05,
    rel: [0.06, -0.34, -0.5],
    fingers: { L: [0.2, 0.2, 0.6, 0.1, -0.7], R: [-0.5, -0.1, -0.3, -0.4, 0] },
  },
  shotgun: {
    hip: { at: [0.17, -0.21, -0.42], dir: [-0.15, 0.05, -1], roll: 0.4 },
    eye: 0.3,
    up: 0.006,
    zoom: 0.15,
    dip: 0.2,
    roll: -0.05,
    tip: 0.05,
    rel: [0.06, -0.34, -0.5],
    fingers: { L: [-0.1, -0.1, -0.5, -0.7, -0.7], R: [-0.7, 1.2, -0.3, 0, 0.7] },
  },
  ak47: {
    hip: { at: [0.17, -0.21, -0.44], dir: [-0.15, 0.05, -1], roll: 0.4 },
    eye: 0.48,
    up: 0.016,
    zoom: 0.2,
    dip: 0.2,
    roll: 0.08,
    tip: 0.05,
    rel: [0.06, -0.34, -0.5],
    fingers: { L: [-0.2, -0.4, 0.1, -0.6, -0.1], R: [-0.7, 0.2, 0.2, 0.2, -0.7] },
  },
  sniper: {
    hip: { at: [0.17, -0.21, -0.42], dir: [-0.14, 0.05, -1], roll: 0.35 },
    eye: 0.14,
    up: 0,
    zoom: 0.25,
    dip: 0.2,
    roll: 0.05,
    tip: 0.05,
    rel: [0.06, -0.34, -0.5],
    fingers: { L: [0.1, 0.1, 0.3, 0.2, -0.3], R: [-0.7, 1.2, 0, 0, 0.4] },
  },
  daybreak: {
    hip: { at: [0.21, -0.23, -0.56], dir: [-0.18, 0.05, -1], roll: 0.3 },
    eye: 0.34,
    up: 0.01,
    zoom: 0.15,
    dip: 0.2,
    roll: -0.06,
    tip: 0.05,
    rel: [0.06, -0.34, -0.5],
    fingers: { L: [-0.7, -0.6, 0.2, 0.2, 0.2], R: [0.4, -0.7, -0.5, -0.7, -0.5] },
  },
};
export const vmOf = (gun: string): VmGun => {
  const g = VM[gun] ?? VM.revolver;
  // (the bench's live tuning: window.__vmTune[gun] merged over — dev only)
  const t = (globalThis as { __vmTune?: Record<string, Partial<VmGun>> }).__vmTune?.[gun];
  return t ? { ...g, ...t, hip: { ...g.hip, ...(t.hip ?? {}) } } : g;
};

/** The view's place (F7a: the settings' presets) — moved on the hip hold: classic, close (bigger, nearer the middle),
 *  couch (lower and further right). */
export const VM_PLACES = {
  classic: [0, 0, 0],
  close: [-0.025, 0.02, 0.05],
  couch: [0.03, -0.035, -0.02],
} as const;
export type VmPlace = keyof typeof VM_PLACES;

const tA = new Vector3();
const tB = new Vector3();
const tC = new Vector3();
const tM = new Matrix4();
const tM2 = new Matrix4();
const tQ = new Quaternion();
const mU0 = new Vector3();
const mU1 = new Vector3();
const mQ0 = new Quaternion();
const mR = new Vector3();

/** A frame from a forward (the barrel's way) and an up, as a rotation (its −z the forward, +y the up). */
function basis(fwd: Vector3, up: Vector3, out: Quaternion): Quaternion {
  const z = tA.copy(fwd).normalize().negate();
  const x = tB.crossVectors(up, z).normalize();
  const y = tC.crossVectors(z, x);
  tM.makeBasis(x, y, z);
  return out.setFromRotationMatrix(tM);
}

/** The gun's sights now in `space`'s frame: the rear, the barrel's way (rear → front), its up; its grip (where the
 *  right fist holds it). */
export function sightsIn(
  gun: {
    root: Object3D;
    sight: { rear: [number, number, number]; front: [number, number, number] };
    grip: { at: [number, number, number] };
  },
  space: Object3D,
  rear: Vector3,
  dir: Vector3,
  up: Vector3,
  grip?: Vector3,
) {
  gun.root.updateWorldMatrix(true, false);
  tM2.copy(space.matrixWorld).invert().multiply(gun.root.matrixWorld);
  rear.set(...gun.sight.rear).applyMatrix4(tM2);
  dir
    .set(...gun.sight.front)
    .applyMatrix4(tM2)
    .sub(rear)
    .normalize();
  up.set(0, 1, 0).transformDirection(tM2);
  grip?.set(...gun.grip.at).applyMatrix4(tM2);
}

/** The move (a rotation then a shift, in the rig's space) that takes the sights from where they are (`rear`, `dir`,
 *  `up`) to where they're wanted (`at`, `wantDir`, `wantUp`). */
export function moveSights(
  rear: Vector3,
  dir: Vector3,
  up: Vector3,
  at: Vector3,
  wantDir: Vector3,
  wantUp: Vector3,
  outQ: Quaternion,
  outP: Vector3,
) {
  // (the up square to the barrel, both times — no allocations: twice a frame)
  const u0 = mU0.copy(up).addScaledVector(dir, -up.dot(dir)).normalize();
  const u1 = mU1.copy(wantUp).addScaledVector(wantDir, -wantUp.dot(wantDir)).normalize();
  const q0 = basis(dir, u0, mQ0);
  const q1 = basis(wantDir, u1, tQ);
  outQ.copy(q1).multiply(q0.invert());
  outP.copy(at).sub(mR.copy(rear).applyQuaternion(outQ));
}

/** Where the sights are wanted, `ads` of the way from the hip hold (0) to aimed down them (1). */
export function wantedSights(
  g: VmGun,
  ads: number,
  place: readonly [number, number, number],
  at: Vector3,
  dir: Vector3,
  up: Vector3,
) {
  const e = ads * ads * (3 - 2 * ads);
  const hx = g.hip.at[0] + place[0];
  const hy = g.hip.at[1] + place[1];
  const hz = g.hip.at[2] + place[2];
  // (the hip-to-aim path a curve: up and in first, then back to the eye)
  const lift = Math.sin(Math.PI * e) * 0.025;
  at.set(hx * (1 - e), hy * (1 - e) + lift, hz + (-g.eye - hz) * e);
  dir
    .set(...g.hip.dir)
    .normalize()
    .multiplyScalar(1 - e)
    .add(tA.set(0, 0, -1).multiplyScalar(e))
    .normalize();
  const r = g.hip.roll * (1 - e);
  up.set(Math.sin(-r), Math.cos(r), 0);
}

const hQ = new Quaternion();
const hP = new Vector3();
const aQ = new Quaternion();
const aP = new Vector3();
const wD = new Vector3();
const wU = new Vector3();
const wAt = new Vector3();
const wT = new Vector3();
const wG = new Vector3();
/** The move for `ads` of the way from the hip (the grip put at the hip's place) to aimed (the rear sight on the eye's
 *  line, `eye` m out): each worked out, then blended — the path up and in a curve. */
export function vmMove(
  g: VmGun,
  ads: number,
  place: readonly [number, number, number],
  rear: Vector3,
  dir: Vector3,
  up: Vector3,
  grip: Vector3,
  outQ: Quaternion,
  outP: Vector3,
) {
  // the hip: its way and cant, the grip where it's wanted
  wD.set(...g.hip.dir).normalize();
  wU.set(-Math.sin(g.hip.roll), Math.cos(g.hip.roll), 0);
  moveSights(rear, dir, up, wAt.set(0, 0, 0), wD, wU, hQ, hP);
  hP.copy(wT.set(g.hip.at[0] + place[0], g.hip.at[1] + place[1], g.hip.at[2] + place[2])).sub(
    wG.copy(grip).applyQuaternion(hQ),
  );
  // aimed: level, upright, the rear sight on the line out of the eye
  moveSights(rear, dir, up, wAt.set(0, -g.up, -g.eye), wD.set(0, 0, -1), wU.set(0, 1, 0), aQ, aP);
  const e = ads * ads * (3 - 2 * ads);
  outQ.copy(hQ).slerp(aQ, e);
  outP.copy(hP).lerp(aP, e);
  outP.y += Math.sin(Math.PI * e) * 0.02;
}
