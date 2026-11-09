// Plan 73, phase 4.3 — the life look's person on PersonModel's bones (chars/life.ts), on a made-up base:
// the arms turned straight down for our rig, the bind putting them back as the file has them; what
// reaches and seats read off the body.
import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_AVATAR } from "@yutopia/shared";
import { Color, Quaternion, Vector3 } from "three";
import * as M from "../look/life-people";
import { buildPerson } from "./build";
import { LifeLook } from "./life";
import { JOINTS, type JointName, PARENT } from "./rig";

// a base whose joints are today's person's, its arms hanging ARM_OUT out from straight down, as the file's
function fakeBase(): M.LifeBase {
  const k = buildPerson(DEFAULT_AVATAR, 2);
  const at = {} as Record<M.BoneName, Vector3>;
  const place = (j: JointName) => {
    const v = new Vector3();
    for (let a: JointName | null = j; a; a = PARENT[a]) v.add(new Vector3(...k.rest[a]));
    return v;
  };
  for (const j of JOINTS) at[j] = place(j);
  const out = { L: new Quaternion(), R: new Quaternion() };
  out.L.setFromAxisAngle(new Vector3(0, 0, 1), M.ARM_OUT);
  out.R.setFromAxisAngle(new Vector3(0, 0, 1), -M.ARM_OUT);
  for (const j of JOINTS) {
    for (let p = PARENT[j]; p; p = PARENT[p])
      if (p === "shoulderL" || p === "shoulderR") {
        const s = at[p];
        at[j]
          .sub(s)
          .applyQuaternion(p === "shoulderL" ? out.L : out.R)
          .add(s);
        break;
      }
  }
  at.eyeL = at.head.clone().add(new Vector3(0.032, 0.07, 0.08));
  at.eyeR = at.head.clone().add(new Vector3(-0.032, 0.07, 0.08));
  return {
    gender: "man",
    at,
    bodies: {},
    skinMean: new Color(0.72, 0.72, 0.72),
    hairRgb: new Color(0.2, 0.1, 0.05),
    browRgb: new Color(0.2, 0.1, 0.05),
    parts: [],
    height: k.p.height,
    wear: {},
    wearLm: {},
    outfits: new Map(),
  };
}

const host = { renderer: null as never, lit: () => {} };

test("life person: the arms at rest hang straight down, bound back out as the file has them", () => {
  const base = fakeBase();
  const look = new LifeLook(M, base, DEFAULT_AVATAR, "all", host);
  for (const s of ["L", "R"] as const) {
    const e = look.rest[`elbow${s}`];
    // straight down from the shoulder (the file's had them 9° out)
    assert.ok(Math.abs(e[0]) < 1e-6, `elbow${s} x ${e[0]}`);
    assert.ok(e[1] < 0);
    const fileOut = base.at[`elbow${s}`].clone().sub(base.at[`shoulder${s}`]);
    assert.ok(Math.abs(fileOut.x) > 0.02, "the made-up file's arm is out");
    // the bind's turn takes the rest arm back to the file's
    const back = new Vector3(...e).applyQuaternion(look.bindTurn[`shoulder${s}`] as Quaternion);
    assert.ok(back.distanceTo(fileOut) < 1e-6, `bound back ${back.toArray()} vs ${fileOut.toArray()}`);
  }
  // the arm's two lengths kept (the IK's)
  assert.ok(Math.abs(look.arm[0] - base.at.elbowL.distanceTo(base.at.shoulderL)) < 1e-9);
});

test("life person: seats, eyes and reaches off the body", () => {
  const base = fakeBase();
  const look = new LifeLook(M, base, DEFAULT_AVATAR, "all", host);
  assert.equal(look.hipY, (base.at.thighL.y + base.at.thighR.y) / 2);
  // the eyes between the two, in the head's space
  assert.ok(Math.abs(look.eye[0]) < 1e-9 && Math.abs(look.eye[1] - 0.07) < 1e-9);
  // the hand to the mouth goes near the face, in front of the head
  const m = new Vector3(...look.anchors.mouth);
  assert.ok(m.distanceTo(base.at.head) < 0.35, `mouth anchor ${m.toArray()}`);
  assert.ok(m.z > base.at.head.z);
  assert.ok(look.crown > 0);
});
