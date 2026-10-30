import assert from "node:assert/strict";
import { test } from "node:test";
import { KH_FEEL } from "@yutopia/shared/move";
import { Euler, Quaternion, Vector3 } from "three";
import { Locomotion, loadHero } from "./locomotion";
import { ANKLE, BALL, HEEL, HIP_H } from "./moves";

// Plan 58 G (the feel): what the body does as it's driven, checked on its pose. The floor's y is
// south, so a turn's rate is + to the right — the lean into it and the look round it read it so.

const move = (o: Partial<Parameters<Locomotion["update"]>[1]> = {}) => ({
  dist: 0,
  speed: 0,
  ahead: 0,
  left: 0,
  crouch: false,
  aim: false,
  pitch: 0,
  yaw: 0,
  turn: 0,
  accel: 0,
  up: false,
  jump: null,
  verb: null,
  reduced: false,
  ...o,
});
const running = (turn: number) => {
  const l = new Locomotion(KH_FEEL);
  l.v2 = true;
  let p = l.update(1 / 60, move());
  for (let i = 0; i < 40; i++) p = l.update(1 / 60, move({ dist: 6 / 60, speed: 6, ahead: 6, turn }));
  return p.pose;
};

test("the feel: running round to the right she leans right and looks right; to the left, left", async () => {
  await loadHero();
  const right = running(2.5);
  assert.ok((right.hips?.[2] ?? 0) > 0.05, `leant right: hips roll ${right.hips?.[2]}`);
  assert.ok((right.head?.[1] ?? 0) < -0.05, `looking right: head ${right.head?.[1]}`);
  const left = running(-2.5);
  assert.ok((left.hips?.[2] ?? 0) < -0.05, `leant left: hips roll ${left.hips?.[2]}`);
  assert.ok((left.head?.[1] ?? 0) > 0.05, `looking left: head ${left.head?.[1]}`);
});

test("the feel: braking hard from a sprint, a skid; driving up from still, short quick steps", async () => {
  await loadHero();
  const l = new Locomotion(KH_FEEL);
  l.v2 = true;
  for (let i = 0; i < 60; i++) l.update(1 / 60, move({ dist: 8.2 / 60, speed: 8.2, ahead: 8.2 }));
  let v = 8.2;
  for (let i = 0; i < 12; i++) {
    v -= 28 / 60;
    l.update(1 / 60, move({ dist: v / 60, speed: v, ahead: v, accel: -28 }));
  }
  assert.ok((l as unknown as { skidW: number }).skidW > 0.5, "skidding");
  const s = new Locomotion(KH_FEEL);
  s.v2 = true;
  s.update(1 / 60, move());
  for (let i = 0; i < 6; i++) s.update(1 / 60, move({ dist: 2 / 60, speed: 2, ahead: 2, accel: 28 }));
  assert.ok((s as unknown as { driveW: number }).driveW > 0.5, "driving");
});

test("the feet on the ground: a step up under one foot bends that knee just enough; a step down drops the hips", async () => {
  const H = await loadHero();
  const T = 0.306;
  const S = 0.306;
  // (the ankle's height under the hips, from a leg's thigh and knee)
  const ankle = (t: number, k: number) => -T * Math.cos(t) - S * Math.cos(t + k);
  const stand = () => H.idle2Pose(0, 0, 0, true);
  // the left foot's ground 10 cm up: the left ankle 10 cm higher, its knee bent more; the hips stay
  const a = stand();
  const before = ankle(a.pose.thighL?.[0] ?? 0, a.pose.kneeL?.[0] ?? 0);
  const k0 = a.pose.kneeL?.[0] ?? 0;
  const lift0 = a.lift[1];
  H.footPlant(a, { under: [0.1, 0], sole: [0, 0], slope: [0, 0] });
  const after = ankle(a.pose.thighL?.[0] ?? 0, a.pose.kneeL?.[0] ?? 0);
  assert.ok(Math.abs(after - before - 0.1) < 0.005, `the ankle up ${(after - before).toFixed(3)}`);
  assert.ok((a.pose.kneeL?.[0] ?? 0) > k0 + 0.1, "the knee bent more");
  assert.equal(a.lift[1], lift0, "the hips where they were");
  // the right foot's ground 10 cm down: the hips 10 cm lower, the left leg taking it up again
  const b = stand();
  const bLift = b.lift[1];
  const bL = ankle(b.pose.thighL?.[0] ?? 0, b.pose.kneeL?.[0] ?? 0);
  H.footPlant(b, { under: [0, -0.1], sole: [0, 0], slope: [0, 0] });
  assert.ok(Math.abs(b.lift[1] - (bLift - 0.1)) < 1e-9, "the hips down 10 cm");
  const aL = ankle(b.pose.thighL?.[0] ?? 0, b.pose.kneeL?.[0] ?? 0);
  assert.ok(Math.abs(aL - bL - 0.1) < 0.005, `the left ankle 10 cm up under the lowered hips: ${(aL - bL).toFixed(3)}`);
  // on the flat, a foot the pose has a little up (coming down to land, up on its toes) stays up: the
  // hips aren't dropped to pull it down (the jog's shake: 4–5 cm a frame at every landing)
  const c = H.run2Pose(0.9, 0, 0);
  const cLift = c.lift[1];
  const cR = ankle(c.pose.thighR?.[0] ?? 0, c.pose.kneeR?.[0] ?? 0);
  H.footPlant(c, { under: [0, 0], sole: [0, 0.04], slope: [0, 0] });
  assert.equal(c.lift[1], cLift, "the hips where they were");
  assert.ok(Math.abs(ankle(c.pose.thighR?.[0] ?? 0, c.pose.kneeR?.[0] ?? 0) - cR) < 1e-9, "the landing foot as it was");
});

test("the jog (no Shift): a foot on the ground stays where it landed, on the ground — the pelvis's twist and all; the cadence calm", async () => {
  const H = await loadHero();
  const T = 0.306;
  const S = 0.306;
  const stride = H.run2Stride(0);
  // (2.5 strides a second at the jog's 5 m/s: five steps, not the seven that shivered)
  assert.ok(KH_FEEL.jog / stride <= 2.6, `${(KH_FEEL.jog / stride).toFixed(2)} strides a second`);
  // the skeleton's own sums (three's): the hips' turn, the hip joint off them, the thigh and shin
  const q = (e?: number[]) => new Quaternion().setFromEuler(new Euler(e?.[0] ?? 0, e?.[1] ?? 0, e?.[2] ?? 0));
  const ankleAt = (ph: number) => {
    const m = H.run2Pose(ph, 0, 0);
    const qh = q(m.pose.hips);
    const hipsY = HIP_H - 0.061 + m.lift[1];
    const hip = new Vector3(-0.078, 0.061, 0).applyQuaternion(qh).add(new Vector3(0, hipsY, ph * stride));
    const qt = qh.clone().multiply(q(m.pose.thighR));
    const knee = hip.clone().add(new Vector3(0, -T, 0).applyQuaternion(qt));
    const qs = qt.clone().multiply(q(m.pose.kneeR));
    const ankle = knee.add(new Vector3(0, -S, 0).applyQuaternion(qs));
    // (the ball of the foot, on the sole: what stays put as it rolls up onto its toes)
    const qa = qs.clone().multiply(q(m.pose.ankleR));
    return ankle.add(new Vector3(0, -ANKLE, BALL).applyQuaternion(qa));
  };
  // the right foot, from landing (0) to its toes leaving (0.2), over the ground
  const at0 = ankleAt(0);
  let slip = 0;
  let low = Number.POSITIVE_INFINITY;
  let high = Number.NEGATIVE_INFINITY;
  for (let i = 0; i <= 20; i++) {
    const a = ankleAt(i / 100);
    slip = Math.max(slip, Math.hypot(a.x - at0.x, a.z - at0.z));
    // (on the ground the whole stance: flat, then up onto the toes over it)
    low = Math.min(low, a.y);
    high = Math.max(high, a.y);
  }
  assert.ok(slip < 0.006, `slid ${slip.toFixed(4)}`);
  assert.ok(Math.abs(low) < 0.004 && Math.abs(high) < 0.004, `the ball ${low.toFixed(3)}..${high.toFixed(3)}`);
});

test("the foot lock: whatever the layers lean and twist, a foot on the ground stays where it landed", async () => {
  const H = await loadHero();
  const lock = new H.FootLock();
  const v = 5;
  const dt = 1 / 120;
  const stride = H.run2Stride(0);
  let x0: number | null = null;
  let z0 = 0;
  let travelled = 0;
  let slip = 0;
  let low = Number.POSITIVE_INFINITY;
  let high = Number.NEGATIVE_INFINITY;
  for (let i = 0; i < 96; i++) {
    const ph = ((v * i * dt) / stride) % 1;
    const base = H.run2Pose(ph, 0, 0);
    const feet = { L: H.ankleOf(base, "L").at, R: H.ankleOf(base, "R").at };
    // a layer's lean and twist over it, swinging (the hips rolled, pitched and turned; the thighs not
    // turned back: the lock's to keep the feet)
    const m = { pose: { ...base.pose }, lift: base.lift };
    const h = m.pose.hips ?? [0, 0, 0];
    m.pose.hips = [h[0] + 0.15 * Math.sin(i * 0.2), h[1] + 0.2 * Math.sin(i * 0.13), h[2] + 0.22 * Math.sin(i * 0.17)];
    lock.apply(m, dt, { ahead: v * dt, left: 0, yaw: 0 }, false, feet);
    travelled += v * dt;
    // the right foot over its second stance (landing at 1, its toes leaving at 1.2)
    if (ph >= 0.02 && ph <= 0.15 && i > 40) {
      const a = H.ankleOf(m, "R").at;
      if (x0 === null) {
        x0 = a[0];
        z0 = a[2] + travelled;
      }
      slip = Math.max(slip, Math.hypot(a[0] - x0, a[2] + travelled - z0));
      // (flat on the ground before the roll onto the toes: the base's own height after)
      if (ph <= 0.07) {
        low = Math.min(low, a[1]);
        high = Math.max(high, a[1]);
      }
    }
  }
  assert.ok(x0 !== null, "a stance seen");
  assert.ok(slip < 0.01, `slid ${slip.toFixed(4)}`);
  assert.ok(
    Math.abs(low - ANKLE) < 0.006 && Math.abs(high - ANKLE) < 0.006,
    `ankle ${low.toFixed(3)}..${high.toFixed(3)}`,
  );
});

test("looking at people: someone near and in front, never through a wall, let go when they're hidden", async () => {
  const H = await loadHero();
  const look = new H.LookAt(1);
  const me = { x: 0, y: 0, yaw: 0, eye: 1.35 };
  // (facing +x: a, ahead and near; b, behind her; c, ahead past a wall)
  const a = { id: "a", x: 3, y: 1, z: 1.5, speed: 0 };
  const b = { id: "b", x: -2, y: 0, z: 1.5, speed: 0 };
  const c = { id: "c", x: 2, y: -1, z: 1.5, speed: 0.8 };
  let wall = true;
  const sees = (o: { id: string }) => o.id !== "c" || !wall;
  let got = look.update(1 / 60, me, [a, b, c], sees);
  assert.ok(got, "someone looked at");
  // (a's to her left: the floor's y south, so + y is to her right — a's +1 is to the right)
  assert.ok(got && got.yaw < 0 && got.pitch > 0, `at a, to the right and up a little: ${JSON.stringify(got)}`);
  // a gone behind a wall: let go within a moment, and not looked at again through it
  const behind = (o: { id: string }) => o.id !== "a" && sees(o);
  for (let i = 0; i < 30; i++) got = look.update(1 / 60, me, [a, b, c], behind);
  assert.equal(got, null, "a out of sight: looked away");
  // nobody behind her is looked at, and c only once the wall's gone
  for (let i = 0; i < 600; i++) {
    got = look.update(1 / 60, me, [b, c], sees);
    assert.equal(got, null, "b's behind her, c's behind the wall");
  }
  wall = false;
  for (let i = 0; i < 600 && !got; i++) got = look.update(1 / 60, me, [b, c], sees);
  assert.ok(got && got.yaw > 0, "c, once it can be seen");
});

test("the walk: the heel strikes and stays, then the ball, on the ground — one foot always down", async () => {
  const H = await loadHero();
  const T = 0.306;
  const S = 0.306;
  const stride = H.walk2Stride(0);
  const q = (e?: number[]) => new Quaternion().setFromEuler(new Euler(e?.[0] ?? 0, e?.[1] ?? 0, e?.[2] ?? 0));
  // (a point on the right foot's sole, `at` along it from the ankle: −HEEL the heel, BALL the ball)
  const solePoint = (ph: number, at: number) => {
    const m = H.walk2Pose(ph, 0);
    const qh = q(m.pose.hips);
    const hip = new Vector3(-0.078, 0.061, 0).applyQuaternion(qh).add(new Vector3(0, HIP_H - 0.061 + m.lift[1], ph * stride));
    const qt = qh.clone().multiply(q(m.pose.thighR));
    const knee = hip.clone().add(new Vector3(0, -T, 0).applyQuaternion(qt));
    const qs = qt.clone().multiply(q(m.pose.kneeR));
    const ankle = knee.add(new Vector3(0, -S, 0).applyQuaternion(qs));
    return ankle.add(new Vector3(0, -ANKLE, at).applyQuaternion(qs.clone().multiply(q(m.pose.ankleR))));
  };
  const held = (from: number, to: number, at: number) => {
    const p0 = solePoint(from, at);
    let slip = 0;
    let off = 0;
    for (let ph = from; ph <= to + 1e-9; ph += 0.01) {
      const p = solePoint(ph, at);
      slip = Math.max(slip, Math.hypot(p.x - p0.x, p.z - p0.z));
      off = Math.max(off, Math.abs(p.y));
    }
    return { slip, off };
  };
  // the heel from its strike till the foot's flat; the ball from then till the toes leave
  const heel = held(0, 0.09, -HEEL);
  const ball = held(0.1, 0.57, BALL);
  assert.ok(heel.slip < 0.008 && heel.off < 0.006, `the heel: slid ${heel.slip.toFixed(4)}, off the ground ${heel.off.toFixed(4)}`);
  assert.ok(ball.slip < 0.008 && ball.off < 0.006, `the ball: slid ${ball.slip.toFixed(4)}, off the ground ${ball.off.toFixed(4)}`);
  // (1.6 strides a second at 1.5 m/s, a walk's cadence for her legs)
  assert.ok(KH_FEEL.walk / stride < 1.7, `${(KH_FEEL.walk / stride).toFixed(2)} strides a second`);
});
