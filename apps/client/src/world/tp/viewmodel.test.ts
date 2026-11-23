// Plan 116: the view model's move — aimed, the gun's sights on the eye's line (the rear `eye` m out, the barrel
// straight ahead, upright); at the hip, its grip where the hip hold has it, the barrel its way. Whatever the gun's
// pose was before the move (a random turn and place: the body's clip's).
import assert from "node:assert/strict";
import { test } from "node:test";
import { Quaternion, Vector3 } from "three";
import { VM, vmMove } from "./viewmodel";

const rnd = (k: number) => {
  let s = k * 9301 + 49297;
  return () => {
    s = (s * 233280 + 49297) % 233280;
    return s / 233280;
  };
};

for (const [key, g] of Object.entries(VM))
  test(`the view model's move puts the ${key} where it's wanted`, () => {
    const r = rnd(key.length);
    for (let i = 0; i < 20; i++) {
      // a gun somewhere, turned anyhow: its rear sight, its barrel's way, its up, its grip
      const q = new Quaternion().setFromAxisAngle(new Vector3(r() - 0.5, r() - 0.5, r() - 0.5).normalize(), r() * 6);
      const at = new Vector3(r() - 0.5, r() - 0.8, -r());
      const rear = new Vector3(0, 0.03, 0).applyQuaternion(q).add(at);
      const dir = new Vector3(0, 0, -1).applyQuaternion(q);
      const up = new Vector3(0, 1, 0).applyQuaternion(q);
      const grip = new Vector3(0, -0.06, 0.12).applyQuaternion(q).add(at);
      const mq = new Quaternion();
      const mp = new Vector3();
      // aimed
      vmMove(g, 1, [0, 0, 0], rear, dir, up, grip, mq, mp);
      const rear1 = rear.clone().applyQuaternion(mq).add(mp);
      const dir1 = dir.clone().applyQuaternion(mq);
      const up1 = up.clone().applyQuaternion(mq);
      assert.ok(
        rear1.distanceTo(new Vector3(0, -g.up, -g.eye)) < 1e-6,
        `${key}: the rear sight on the eye's line (${rear1.toArray()})`,
      );
      assert.ok(dir1.distanceTo(new Vector3(0, 0, -1)) < 1e-6, `${key}: the barrel straight ahead`);
      assert.ok(up1.distanceTo(new Vector3(0, 1, 0)) < 1e-6, `${key}: upright`);
      // at the hip
      vmMove(g, 0, [0, 0, 0], rear, dir, up, grip, mq, mp);
      const grip0 = grip.clone().applyQuaternion(mq).add(mp);
      const dir0 = dir.clone().applyQuaternion(mq);
      assert.ok(grip0.distanceTo(new Vector3(...g.hip.at)) < 1e-6, `${key}: the grip at the hip's place`);
      assert.ok(dir0.distanceTo(new Vector3(...g.hip.dir).normalize()) < 1e-6, `${key}: the barrel the hip's way`);
    }
  });
