import { Matrix4, type Quaternion, Vector3 } from "three";

// Two-bone IK for an arm: where the shoulder must turn and how far the elbow
// must bend so the wrist reaches `target` (both in the shoulder's parent's
// space — the spine — measured from the shoulder joint), the elbow pointing
// towards `pole`. The rig's arms hang down their bone's −y at rest and the
// elbow bends about its own x (negative = the forearm comes forward), so the
// answer is a quaternion for the shoulder and an angle for the elbow.

const u = new Vector3();
const f = new Vector3();
const t = new Vector3();
const p = new Vector3();
const bx = new Vector3();
const by = new Vector3();
const bz = new Vector3();
const m = new Matrix4();

export function solveArm(
  target: Vector3,
  upper: number,
  fore: number,
  pole: Vector3,
  out: { shoulder: Quaternion; elbow: number },
): { shoulder: Quaternion; elbow: number } {
  const reach = upper + fore;
  const d = Math.max(Math.abs(upper - fore) + 1e-4, Math.min(reach - 1e-4, target.length()));
  t.copy(target).normalize();
  // the elbow's inside angle, and the upper arm's angle off the line to the target
  const inner = Math.acos(Math.max(-1, Math.min(1, (upper * upper + fore * fore - d * d) / (2 * upper * fore))));
  const alpha = Math.acos(Math.max(-1, Math.min(1, (upper * upper + d * d - fore * fore) / (2 * upper * d))));
  // the bend's plane: the target line and the pole
  p.copy(pole).addScaledVector(t, -pole.dot(t));
  if (p.lengthSq() < 1e-8) p.set(0, 0, -1).addScaledVector(t, t.z);
  p.normalize();
  u.copy(t).multiplyScalar(Math.cos(alpha)).addScaledVector(p, Math.sin(alpha)).normalize();
  // the forearm, from the elbow to the wrist
  f.copy(t).multiplyScalar(d).addScaledVector(u, -upper).normalize();
  // the shoulder's frame: its −y down the upper arm, its +z towards the forearm's side
  by.copy(u).negate();
  bz.copy(f).addScaledVector(u, -f.dot(u));
  if (bz.lengthSq() < 1e-8) bz.copy(p).negate();
  bz.normalize();
  bx.crossVectors(by, bz).normalize();
  m.makeBasis(bx, by, bz);
  out.shoulder.setFromRotationMatrix(m);
  out.elbow = -(Math.PI - inner);
  return out;
}
