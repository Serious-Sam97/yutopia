import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_AVATAR, EMOTES, SOCIAL, USES } from "@yutopia/shared";
import { Quaternion, Vector3 } from "three";
import { solveArm } from "./ik";
import { CharFactory, PersonModel } from "./model";
import { Motion3, type MotionIn } from "./motion";
import { JOINTS } from "./rig";

// The 3D people's motion (docs/plan/22-people-3d.md, P3): every state the 2D
// people can be in poses the rig without blowing up, the walk follows the
// distance, and hands put on the body (IK) land where they're sent.

const idle: MotionIn = {
  dist: 0,
  walking: false,
  speed: 0,
  sit: false,
  typing: false,
  speaking: false,
  emote: "",
  reduced: false,
};

function run(m: Partial<MotionIn>, seconds = 3) {
  const mo = new Motion3(0.42);
  let out = mo.update(1 / 60, { ...idle, ...m });
  for (let i = 1; i < seconds * 60; i++) {
    out = mo.update(1 / 60, { ...idle, ...m, dist: m.walking ? (m.speed ?? 3.6) / 60 : 0 });
    for (const j of JOINTS) {
      const r = out.pose[j];
      if (!r) continue;
      for (const v of r) assert.ok(Number.isFinite(v) && Math.abs(v) < 4, `${JSON.stringify(m)} ${j}: ${r}`);
    }
    for (const v of out.lift) assert.ok(Number.isFinite(v) && Math.abs(v) < 0.2);
    assert.ok(out.blink >= 0 && out.blink <= 1 && out.talk >= 0 && out.talk <= 1);
  }
  return out;
}

test("every state poses the rig: finite, within a joint's range", () => {
  run({});
  run({ walking: true, speed: 3.6 });
  run({ walking: true, speed: 7 });
  run({ sit: true });
  run({ sit: true, typing: true });
  run({ speaking: true });
  run({ held: { kind: "mug", since: 900 } });
  for (const busy of USES) run({ busy });
  for (const state of ["text", "call", "video", "photo", "selfie"])
    for (const pose of ["", "peace", "point", "thumbs"]) run({ phone: { state, pose, ringing: false } }, 1);
  run({ phone: { state: "", pose: "", ringing: true } });
  for (const what of [...SOCIAL, "take"]) run({ act: { what, t: 0.7, len: 1.5 } }, 1);
  for (const emote of EMOTES) run({ emote });
  run({ emote: "tape", reduced: true });
});

test("the walk: the stride follows the distance, and settles when they stop", () => {
  const mo = new Motion3(0.1);
  const thigh = () => mo.update(1 / 60, { ...idle, walking: true, speed: 3.6, dist: 3.6 / 60 }).pose.thighL?.[0] ?? 0;
  const seen = new Set<number>();
  for (let i = 0; i < 120; i++) seen.add(Math.sign(Math.round(thigh() * 100)));
  assert.ok(seen.has(1) && seen.has(-1), "the leg swings both ways");
  let last = mo.update(1 / 60, idle);
  for (let i = 0; i < 30; i++) last = mo.update(1 / 60, idle);
  assert.ok(Math.abs(last.pose.thighL?.[0] ?? 0) < 0.15, "standing again");
});

test("blinks now and then; the mouth moves while speaking", () => {
  const mo = new Motion3(0.3);
  let blinked = false;
  let talked = false;
  for (let i = 0; i < 60 * 10; i++) {
    const o = mo.update(1 / 60, { ...idle, speaking: i > 300 });
    if (o.blink > 0) blinked = true;
    if (o.talk > 0) talked = true;
  }
  assert.ok(blinked && talked);
});

test("two-bone IK reaches any point in range", () => {
  const out = { shoulder: new Quaternion(), elbow: 0 };
  const upper = 0.28;
  const fore = 0.24;
  for (let i = 0; i < 200; i++) {
    const dir = new Vector3(Math.sin(i * 1.3), Math.cos(i * 0.7), Math.sin(i * 2.1)).normalize();
    const target = dir.multiplyScalar(0.08 + ((i * 0.37) % 1) * 0.42);
    solveArm(target, upper, fore, new Vector3(-0.6, -1, -0.45), out);
    // forward kinematics: the upper arm hangs down its −y; the elbow bends about its x
    const elbow = new Vector3(0, -upper, 0).applyQuaternion(out.shoulder);
    const foreDir = new Vector3(0, -1, 0).applyAxisAngle(new Vector3(1, 0, 0), out.elbow).applyQuaternion(out.shoulder);
    const wrist = elbow.addScaledVector(foreDir, fore);
    assert.ok(wrist.distanceTo(target) < 1e-3, `target ${target.toArray()} reached ${wrist.toArray()}`);
  }
});

test("a hand sent to the ear, the mouth, the chin gets there on the model", () => {
  const f = new CharFactory();
  const m = new PersonModel(f, DEFAULT_AVATAR, 2);
  m.update(); // (asks for the model)
  f.pump(1000);
  assert.ok(m.update());
  const b = (f.get(DEFAULT_AVATAR, 2) as NonNullable<ReturnType<CharFactory["get"]>>).anchors;
  for (const at of ["ear", "mouth", "chin", "chest", "belly"] as const) {
    m.setPose({}, [0, 0, 0], { R: { at, w: 1 } });
    const wrist = m.jointPosition("wristR");
    assert.ok(wrist.distanceTo(new Vector3(...b[at])) < 0.02, `${at}: ${wrist.toArray()} vs ${b[at]}`);
  }
  m.dispose();
  f.dispose();
});
