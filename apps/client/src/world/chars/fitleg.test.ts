// Plan 73, phase 4.6 — a life leg fitted to the rig's (model.ts fitLeg): wherever the rig puts its sole,
// the life leg's sole lands there, the foot turned the same, the knee bending the rig's way.
import assert from "node:assert/strict";
import { test } from "node:test";
import { Bone, Euler, Quaternion, Vector3 } from "three";
import { fitLeg } from "./model";
import { ANKLE, BALL, HIP_H, SHIN, THIGH } from "./moves";

// a life man's leg (measured off the file: plan 73 4.6), a touch bent and in at rest as his is
const HIP_Y = 0.9381;
const ANKLE_Y = 0.0925;
const KNEE: [number, number, number] = [-0.012, -0.4155, 0.008];
const ANK: [number, number, number] = [0.006, -0.4309, -0.012];
const TOE_Z = 0.131;

function leg(hipsQ: Quaternion) {
  const root = new Bone();
  const hips = new Bone();
  root.add(hips);
  hips.position.set(0, HIP_Y, 0);
  hips.quaternion.copy(hipsQ);
  const thigh = new Bone();
  thigh.position.set(0.1, -0.02, 0);
  hips.add(thigh);
  const knee = new Bone();
  knee.position.set(...KNEE);
  thigh.add(knee);
  const ankle = new Bone();
  ankle.position.set(...ANK);
  knee.add(ankle);
  return { root, hips, thigh, knee, ankle };
}

// the rig's ball (at the sole), from its own leg on the same thigh joint (HIP_H − HIP_Y lower), in the root's space
function rigSole(hipsQ: Quaternion, t: Quaternion, k: Quaternion, a: Quaternion) {
  const tk = t.clone().multiply(k);
  const foot = tk.clone().multiply(a);
  const v = new Vector3(0, -THIGH, 0).applyQuaternion(t).add(new Vector3(0, -SHIN, 0).applyQuaternion(tk));
  v.add(new Vector3(0, -ANKLE, BALL).applyQuaternion(foot));
  v.add(new Vector3(0.1, -0.02, 0)).applyQuaternion(hipsQ);
  return { at: v.add(new Vector3(0, HIP_H, 0)), foot: hipsQ.clone().multiply(foot) };
}

const E = (x: number, y: number, z: number) => new Quaternion().setFromEuler(new Euler(x, y, z));

test("a life foot's ball lands where the rig's does, the foot turned the same", () => {
  const cases: [number, number, number, number, number][] = [
    // hips pitch, thigh x, thigh z, knee x, ankle x
    [0, 0, 0, 0, 0], // standing
    [0, -0.5, 0.05, 0.9, -0.3], // a step
    [0.3, -1.2, 0, 1.6, -0.3], // a crouch
    [0, -1.5, 0.1, 1.55, 0], // sat
    [-0.2, 0.3, -0.05, 0.4, 0.4], // behind, the toe pushing off
  ];
  for (const [hp, tx, tz, kx, ax] of cases) {
    const hq = E(hp, 0, 0);
    const L = leg(hq);
    const t = E(tx, 0, tz);
    const k = E(kx, 0, 0);
    const a = E(ax, 0, 0);
    L.thigh.quaternion.copy(t);
    L.knee.quaternion.copy(k);
    L.ankle.quaternion.copy(a);
    const want = rigSole(hq, t, k, a);
    fitLeg(L.hips, L.thigh, L.knee, L.ankle, { knee: KNEE, ankle: ANK, ball: TOE_Z }, HIP_Y, ANKLE_Y);
    L.root.updateMatrixWorld(true);
    const foot = L.ankle.getWorldQuaternion(new Quaternion());
    const sole = L.ankle.getWorldPosition(new Vector3()).add(new Vector3(0, -ANKLE_Y, TOE_Z).applyQuaternion(foot));
    const miss = sole.distanceTo(want.at);
    assert.ok(miss < 0.001, `ball ${miss.toFixed(4)} m off for ${[hp, tx, tz, kx, ax]}`);
    assert.ok(foot.angleTo(want.foot) < 0.01, `foot turned ${foot.angleTo(want.foot)} off`);
    // the knee bends forward (its cap ahead of the hip-ankle line), as the rig's
    const kneeAt = L.knee.getWorldPosition(new Vector3());
    const hip = L.thigh.getWorldPosition(new Vector3());
    const ank = L.ankle.getWorldPosition(new Vector3());
    const mid = hip.clone().lerp(ank, 0.5);
    if (kx > 0.3) assert.ok(kneeAt.z - mid.z > -0.01, `knee behind for ${[hp, tx, tz, kx, ax]}`);
  }
});
