// Plan 104 F4a — the skater's clips (public/life/skate/anim.json, tools/art/skate-anim) as the client plays them: every
// trick has one, the feet the clips put on the board are on it, a flip ends with the board level, the player's blends
// and one-shots come out whole, the mirror's its own inverse, the legs' IK lands the ankle where it's asked.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { type SkateLook, TRICK_IDS } from "@yutopia/shared/skate";
import { Euler, Quaternion, Vector3 } from "three";
import type { Pose } from "../chars/rig";
import {
  type AnimDoc,
  clipFor,
  Frame,
  kneeWay,
  legTo,
  mapPoint,
  mirrorFrame,
  poseOf,
  SkaterPlayer,
  sampleClip,
  setClips,
} from "./pose";

const doc = JSON.parse(
  readFileSync(new URL("../../../public/life/skate/anim.json", import.meta.url), "utf8"),
) as AnimDoc;
setClips(doc);
// (the man's file, as the clips were solved on: his thigh joints under his hips)
const THIGH_OFF = [new Vector3(0.1074, 0.0026, 0.0604), new Vector3(-0.1074, 0.0026, 0.0604)];
const rh = doc.rig.restHips;
const LB = {
  restHips: rh,
  thigh: THIGH_OFF as [Vector3, Vector3],
  drop: doc.rig.HIP_H - (rh[1] + 0.0026),
  thighLen: doc.rig.THIGH,
  shinLen: doc.rig.THIGH,
  ankle: doc.rig.ANKLE,
};
const q = (e: [number, number, number] | undefined) =>
  new Quaternion().setFromEuler(new Euler(...(e ?? [0, 0, 0]), "XYZ"));
/** The rig's ankle for leg s of a pose (her space). */
function ankleOf(pose: Pose, lift: Vector3, s: 0 | 1): Vector3 {
  const S = s === 0 ? "L" : "R";
  const hq = q(pose.hips);
  const H = THIGH_OFF[s]
    .clone()
    .applyQuaternion(hq)
    .add(new Vector3(rh[0] + lift.x, rh[1] + lift.y, rh[2] + lift.z));
  H.y += LB.drop;
  const tq = hq.clone().multiply(q(pose[`thigh${S}`]));
  const K = H.clone().add(new Vector3(0, -LB.thighLen, 0).applyQuaternion(tq));
  const kq = tq.multiply(q(pose[`knee${S}`]));
  return K.add(new Vector3(0, -LB.shinLen, 0).applyQuaternion(kq));
}
function boardPoint(f: Frame, p: Vector3): Vector3 {
  const o = new Vector3(0, doc.board.deckY, 0).applyQuaternion(f.bq).negate().add(f.bc);
  return p.clone().applyQuaternion(f.bq).add(o);
}
const look = (o: Partial<SkateLook> = {}): SkateLook => ({
  mode: "roll",
  trick: null,
  fakie: false,
  stance: 1,
  variant: "street-pop",
  double: false,
  crouch: false,
  push: false,
  lean: 0,
  cess: false,
  lit: false,
  ...o,
});

test("every trick plays a clip (its own, or its kind's)", () => {
  const missing = TRICK_IDS.filter((id) => !clipFor(doc, id));
  assert.deepEqual(missing, []);
  // (the ones that should be their own)
  for (const id of ["kickflip", "varialheel", "madonna", "benihana", "overcrook", "stiffy", "mctwist", "christair"])
    assert.equal(clipFor(doc, id), id);
  assert.equal(clipFor(doc, "kickflip", true), "kickflip.x2");
});

test("the feet a clip has on the board are on it (within 2 cm), every sample", () => {
  const f = new Frame();
  let worst = 0;
  let where = "";
  for (const [id, c] of Object.entries(doc.clips)) {
    for (const t of c.t) {
      sampleClip(c, t, f);
      const pose = poseOf(f, {});
      for (const s of [0, 1] as const) {
        const ft = f.foot[s];
        if (ft.lk < 0.999) continue;
        const up = new Vector3(0, ft.p.y < 0.0825 ? -1 : 1, 0).applyQuaternion(f.bq);
        const want = boardPoint(f, ft.p).addScaledVector(up, doc.rig.ANKLE);
        const d = ankleOf(pose, f.lift, s).distanceTo(want);
        if (d > 0.01 && process.env.SKATE_WORST) console.log(id, t, s, d.toFixed(3));
        if (d > worst) {
          worst = d;
          where = `${id} @${t} foot ${s}`;
        }
      }
    }
  }
  assert.ok(worst < 0.02, `worst ${worst.toFixed(3)} m at ${where}`);
});

test("a flip ends with the board level and under her", () => {
  const f = new Frame();
  for (const [id, c] of Object.entries(doc.clips)) {
    if (c.kind !== "flip") continue;
    sampleClip(c, c.dur, f);
    // (level: at rest, or turned 180° about its up — a shove-it's, the same board to the eye)
    const turned = f.bq.clone().multiply(new Quaternion(0, 1, 0, 0));
    const ang = 2 * Math.acos(Math.min(1, Math.max(Math.abs(f.bq.w), Math.abs(turned.w))));
    assert.ok(ang < 0.05, `${id}: the board ${ang.toFixed(3)} rad off level at the end`);
    assert.ok(Math.abs(f.bc.x) < 0.02 && Math.abs(f.bc.z) < 0.02, `${id}: the board off her`);
  }
});

test("the legs' IK lands the ankle where it's asked", () => {
  const f = sampleClip(doc.clips.stance, 0, new Frame());
  const pose = poseOf(f, {});
  for (const s of [0, 1] as const) {
    const want = ankleOf(pose, f.lift, s).add(new Vector3(0.04, 0.05, -0.03));
    const pole = kneeWay(pose, s, new Vector3());
    legTo(LB, pose, f.lift, s, want, pole, new Quaternion(), 1);
    assert.ok(ankleOf(pose, f.lift, s).distanceTo(want) < 0.002);
  }
});

test("the mirror twice is the clip again", () => {
  const f = sampleClip(doc.clips.indy, 0.4, new Frame());
  const m = mirrorFrame(mirrorFrame(f, new Frame()), new Frame());
  for (let i = 0; i < 25; i++) assert.ok(Math.abs(f.q[i].dot(m.q[i])) > 0.9999);
  assert.ok(Math.abs(f.bq.dot(m.bq)) > 0.9999);
  assert.ok(f.bc.distanceTo(m.bc) < 1e-6 && f.foot[0].p.distanceTo(m.foot[0].p) < 1e-6);
});

test("a ride through the player: whole, the shots end, the grab let go plays out", () => {
  const P = new SkaterPlayer();
  const dt = 1 / 60;
  const seq: [number, Partial<SkateLook> & { t?: number }][] = [
    [0.6, { mode: "roll", push: true }],
    [0.4, { mode: "roll", crouch: true, lean: 0.6 }],
    [0.2, { mode: "air" }],
    [0.45, { mode: "air", trick: "kickflip" }],
    [0.6, { mode: "air", trick: "indy" }],
    [0.3, { mode: "air" }],
    [0.5, { mode: "roll" }],
    [0.8, { mode: "grind", trick: "smith", bal: 0.7 } as Partial<SkateLook>],
    [0.5, { mode: "manual", trick: "manual", bal: -0.8 } as Partial<SkateLook>],
    [0.5, { mode: "roll", cess: true }],
  ];
  let first = true;
  for (const [len, l] of seq) {
    let t = 0;
    while (t < len) {
      const f = P.update({ look: { ...look(l), ...(l as object) }, t, dt, first });
      first = false;
      assert.ok(f);
      for (const qq of f.q) assert.ok(Number.isFinite(qq.w) && Math.abs(qq.length() - 1) < 1e-4);
      assert.ok(Number.isFinite(f.lift.y) && Number.isFinite(f.bc.y));
      t += dt;
    }
  }
});

test("a spot on the street board maps onto its own measures as itself (the tail's too: plan 106)", () => {
  const man = JSON.parse(readFileSync(new URL("../../../public/life/skate/manifest.json", import.meta.url), "utf8"));
  const v = man["street-pop"] ?? man.boards?.["street-pop"];
  const m = {
    length: v.dims.length,
    width: v.dims.width,
    deckY: v.dims.height,
    wheelbase: v.wheelbase,
    wheelR: 0.025,
    truck: 0.198,
    points: v.points,
  };
  for (const p of [
    [-0.25, 0.0957, -0.03],
    [-0.33, 0.12, 0.02],
    [0.17, 0.0885, -0.035],
    [0.3, 0.11, 0.05],
    [0.0, 0.0885, 0.1],
  ]) {
    const out = mapPoint(new Vector3(...(p as [number, number, number])), m, new Vector3());
    assert.ok(out.distanceTo(new Vector3(...(p as [number, number, number]))) < 0.005, `${p} → ${out.toArray()}`);
  }
});
