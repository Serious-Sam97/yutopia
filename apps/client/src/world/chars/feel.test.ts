import assert from "node:assert/strict";
import { test } from "node:test";
import { KH_FEEL } from "@yutopia/shared/move";
import { Euler, Quaternion, Vector3 } from "three";
import { Locomotion, loadHero } from "./locomotion";
import { ANKLE, BALL, HEEL, HIP_H, SHIN, THIGH } from "./moves";

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

// 4f: the feet on the ground under each (Locomotion's last pass, the ground in the body's own space)
test("the feet on the ground: a step up under one foot raises just it; a step down drops the hips; the flat changes nothing", async () => {
  const H = await loadHero();
  // standing a second over ground `g` (x to the left): the last pose
  const stand = (g?: (x: number, z: number) => number) => {
    const l = new Locomotion(KH_FEEL);
    l.v2 = true;
    let out = l.update(1 / 60, move({ ground: g }), H.idle2Pose(0, 0, 0, true));
    for (let i = 0; i < 60; i++) out = l.update(1 / 60, move({ ground: g }), H.idle2Pose(i / 60, 0, 0, true));
    return out;
  };
  const flat = stand();
  const same = stand(() => 0);
  for (const S of ["L", "R"] as const)
    assert.ok(
      Math.hypot(...H.footOf(same, S).ankle.map((x, i) => x - H.footOf(flat, S).ankle[i])) < 1e-6,
      "the flat: as it was",
    );
  // the left foot's ground 10 cm up: its ankle 10 cm higher, the hips where they were
  const up = stand((x) => (x > 0 ? 0.1 : 0));
  const dl = H.footOf(up, "L").ankle[1] - H.footOf(flat, "L").ankle[1];
  assert.ok(Math.abs(dl - 0.1) < 0.006, `the left ankle up ${dl.toFixed(3)}`);
  assert.ok(Math.abs(up.lift[1] - flat.lift[1]) < 1e-3, "the hips where they were");
  // the right foot's ground 10 cm down: the hips down 10 cm, the right foot on it, the left as it was
  const down = stand((x) => (x < 0 ? -0.1 : 0));
  assert.ok(
    Math.abs(down.lift[1] - flat.lift[1] + 0.1) < 0.006,
    `the hips down ${(flat.lift[1] - down.lift[1]).toFixed(3)}`,
  );
  const dr = H.footOf(down, "R").ankle[1] - H.footOf(flat, "R").ankle[1];
  assert.ok(Math.abs(dr + 0.1) < 0.006, `the right ankle down ${dr.toFixed(3)}`);
  assert.ok(
    Math.abs(H.footOf(down, "L").ankle[1] - H.footOf(flat, "L").ankle[1]) < 0.006,
    "the left foot where it was",
  );
});

test("the jog (no Shift): a foot on the ground stays where it landed, on the ground — the pelvis's twist and all; the cadence calm", async () => {
  const H = await loadHero();
  const T = THIGH;
  const S = SHIN;
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
    const feet = { L: H.footOf(base, "L"), R: H.footOf(base, "R") };
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
  const T = THIGH;
  const S = SHIN;
  const stride = H.walk2Stride(0);
  const q = (e?: number[]) => new Quaternion().setFromEuler(new Euler(e?.[0] ?? 0, e?.[1] ?? 0, e?.[2] ?? 0));
  // (a point on the right foot's sole, `at` along it from the ankle: −HEEL the heel, BALL the ball)
  const solePoint = (ph: number, at: number) => {
    const m = H.walk2Pose(ph, 0);
    const qh = q(m.pose.hips);
    const hip = new Vector3(-0.078, 0.061, 0)
      .applyQuaternion(qh)
      .add(new Vector3(0, HIP_H - 0.061 + m.lift[1], ph * stride));
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
  assert.ok(
    heel.slip < 0.008 && heel.off < 0.006,
    `the heel: slid ${heel.slip.toFixed(4)}, off the ground ${heel.off.toFixed(4)}`,
  );
  assert.ok(
    ball.slip < 0.008 && ball.off < 0.006,
    `the ball: slid ${ball.slip.toFixed(4)}, off the ground ${ball.off.toFixed(4)}`,
  );
  // never into the floor, in any mood (the dark's lower hips once put the landing heel 3 cm through)
  for (const T of [0, 0.5, 1]) {
    for (let ph = 0; ph < 1; ph += 0.01) {
      const m = H.walk2Pose(ph, T);
      const qh = q(m.pose.hips);
      const hip = new Vector3(-0.078, 0.061, 0).applyQuaternion(qh).add(new Vector3(0, HIP_H - 0.061 + m.lift[1], 0));
      const qt = qh.clone().multiply(q(m.pose.thighR));
      const qs = qt.clone().multiply(q(m.pose.kneeR));
      const ankle = hip
        .add(new Vector3(0, -THIGH, 0).applyQuaternion(qt))
        .add(new Vector3(0, -THIGH, 0).applyQuaternion(qs));
      const qa = qs.clone().multiply(q(m.pose.ankleR));
      for (const z of [-HEEL, BALL]) {
        const y = ankle.clone().add(new Vector3(0, -ANKLE, z).applyQuaternion(qa)).y;
        assert.ok(y > -0.005, `mood ${T}, ${ph.toFixed(2)}: the sole ${(y * 100).toFixed(1)} cm into the floor`);
      }
    }
  }
  // (1.6 strides a second at 1.5 m/s, a walk's cadence for her legs)
  assert.ok(KH_FEEL.walk / stride < 1.7, `${(KH_FEEL.walk / stride).toFixed(2)} strides a second`);
});

test("the run and the sprint: on the ball and held there, at any speed (a gait between the jog's and the sprint's)", async () => {
  const H = await loadHero();
  const q = (e?: number[]) => new Quaternion().setFromEuler(new Euler(e?.[0] ?? 0, e?.[1] ?? 0, e?.[2] ?? 0));
  for (const e of [0.5, 1]) {
    const stride = H.run2Stride(e);
    const ballAt = (ph: number) => {
      const m = H.run2Pose(ph, e, 0);
      const qh = q(m.pose.hips);
      const hip = new Vector3(-0.078, 0.061, 0)
        .applyQuaternion(qh)
        .add(new Vector3(0, HIP_H - 0.061 + m.lift[1], ph * stride));
      const qt = qh.clone().multiply(q(m.pose.thighR));
      const knee = hip.clone().add(new Vector3(0, -THIGH, 0).applyQuaternion(qt));
      const qs = qt.clone().multiply(q(m.pose.kneeR));
      const ankle = knee.add(new Vector3(0, -THIGH, 0).applyQuaternion(qs));
      return ankle.add(new Vector3(0, -ANKLE, BALL).applyQuaternion(qs.clone().multiply(q(m.pose.ankleR))));
    };
    // (on the ground from landing to its toes leaving: 0.2 of the cycle at a jog, 0.15 at a sprint)
    const on = 0.2 + (0.15 - 0.2) * e;
    const b0 = ballAt(0);
    let slip = 0;
    let off = 0;
    for (let ph = 0; ph <= on - 0.005; ph += 0.005) {
      const b = ballAt(ph);
      slip = Math.max(slip, Math.hypot(b.x - b0.x, b.z - b0.z));
      off = Math.max(off, Math.abs(b.y));
    }
    assert.ok(slip < 0.008, `effort ${e}: the ball slid ${slip.toFixed(4)}`);
    assert.ok(off < 0.006, `effort ${e}: the ball off the ground ${off.toFixed(4)}`);
  }
  // (a sprint at three strides a second, not three and a half)
  assert.ok(
    KH_FEEL.sprint / H.run2Stride(1) < 3.1,
    `${(KH_FEEL.sprint / H.run2Stride(1)).toFixed(2)} strides a second`,
  );
});

// 4c: setting off, stopping and turning back are steps (hero.ts `Stepper`), driven by the move core
// itself on /dev/anim's clips — a foot on the ground stays where it's put, and none goes into it
test("starts, stops, turning back; crouched, aside, backing up, hurt — a planted foot stays put, none in the floor", async () => {
  const C = await import("./index");
  const { clipList, tabulate, RATE } = await import("../../app/dev/anim/clips");
  await loadHero();
  const H = C.heroNow();
  assert.ok(H);
  const q = (e?: number[]) => new Quaternion().setFromEuler(new Euler(e?.[0] ?? 0, e?.[1] ?? 0, e?.[2] ?? 0));
  // (each foot's heel and ball in the world: the bench's own reading)
  const feet = (f: {
    pose: Record<string, number[] | undefined>;
    lift: number[];
    root: { x: number; y: number; z: number; yaw: number };
  }) => {
    const qr = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), f.root.yaw);
    const root = new Vector3(f.root.x, f.root.y, f.root.z);
    return (["L", "R"] as const).map((S) => {
      const qh = q(f.pose.hips);
      const hip = new Vector3(S === "L" ? 0.078 : -0.078, 0.061, 0)
        .applyQuaternion(qh)
        .add(new Vector3(f.lift[0], HIP_H - 0.061 + f.lift[1], f.lift[2]));
      const qt = qh.clone().multiply(q(f.pose[`thigh${S}`]));
      const qs = qt.clone().multiply(q(f.pose[`knee${S}`]));
      const ankle = hip
        .clone()
        .add(new Vector3(0, -THIGH, 0).applyQuaternion(qt))
        .add(new Vector3(0, -THIGH, 0).applyQuaternion(qs));
      const ball = ankle
        .clone()
        .add(new Vector3(0, -ANKLE, BALL).applyQuaternion(qs.clone().multiply(q(f.pose[`ankle${S}`]))));
      return { heel: ankle.applyQuaternion(qr).add(root), ball: ball.applyQuaternion(qr).add(root) };
    });
  };
  for (const [name, most] of [
    ["start, walk, stop", 1],
    ["start, jog, stop", 6],
    ["walk, turn back", 4],
    // 4d: crouched, aiming round a square (facing on), backing up, a limp
    ["crouch: start, sneak, stop", 1],
    ["aim: round a square", 16],
    ["back up, walk", 7],
    ["walk hurt", 2],
  ] as const) {
    const clip = clipList().find((c) => c.name === name);
    assert.ok(clip);
    const fr = tabulate({ C, H, T: 0 }, clip, "after", true);
    assert.ok(fr);
    let slips = 0;
    let sunk = 0;
    const was: ({ k: string; x: number; z: number } | null)[] = [null, null];
    for (const f of fr) {
      feet(f).forEach((a, k) => {
        sunk = Math.max(sunk, ANKLE - a.heel.y, -a.ball.y);
        const on = a.heel.y < ANKLE + 0.005 ? "h" : a.ball.y < 0.005 ? "b" : "-";
        const at = on === "h" ? a.heel : a.ball;
        const w = was[k];
        if (w && w.k === on && on !== "-" && Math.hypot(at.x - w.x, at.z - w.z) * RATE > 0.3) slips++;
        was[k] = on === "-" ? null : { k: on, x: at.x, z: at.z };
      });
    }
    // (a frame or so at a touchdown: a landing foot's still braking from its swing)
    assert.ok(slips <= most, `${name}: ${slips} frames a planted foot slid over 0.3 m/s`);
    assert.ok(sunk < 0.01, `${name}: a foot ${(sunk * 100).toFixed(1)} cm into the floor`);
  }
});

// 4e: how someone walks — every style's feet held where they're put and none in the floor, at any mood
test("the walks' styles (calm, bouncy, heavy, brisk, tired, old): planted feet held, none in the floor", async () => {
  await loadHero();
  const H = (await import("./index")).heroNow();
  assert.ok(H);
  for (const gait of H.GAIT_STYLES)
    for (const T of [0, 1]) {
      const stride = H.walk2Stride(T, gait);
      const N = 200;
      let sunk = 0;
      let slid = 0;
      const was: ({ x: number; z: number; k: string } | null)[] = [null, null];
      for (let i = 0; i <= 2 * N; i++) {
        const ph = (i / N) % 1;
        const m = H.walk2Pose(ph, T, 0, { gait });
        const ahead = (i / N) * stride;
        (["L", "R"] as const).forEach((S, k) => {
          const f = H.footOf(m, S);
          sunk = Math.max(sunk, -f.heel[1], -f.ball[1]);
          const on = f.heel[1] < 0.003 ? "h" : f.ball[1] < 0.003 ? "b" : "-";
          const at = on === "h" ? f.heel : f.ball;
          const w = was[k];
          // (from one contact to the same, mid-stance: the touchdown's first frame is still braking)
          if (w && w.k === on && on !== "-") slid = Math.max(slid, Math.hypot(at[0] - w.x, at[2] + ahead - w.z));
          was[k] = on === "-" ? null : { x: at[0], z: at[2] + ahead, k: on };
        });
      }
      assert.ok(sunk < 0.004, `${gait} T${T}: a foot ${(sunk * 100).toFixed(1)} cm in the floor`);
      // (a step per ~1/200 of a cycle: no planted spot moving more than 1.5 cm in one)
      assert.ok(slid < 0.015, `${gait} T${T}: a planted foot moved ${(slid * 100).toFixed(1)} cm in a step`);
    }
});

test("phase 5b–5c: over things, onto them, the roll, the slide, Flowmotion — no NaN, the hands placed", async () => {
  const H = await loadHero();
  const C = await import("./index");
  const { clipList, tabulate } = await import("@/app/dev/anim/clips");
  const x = { C, H, T: 0 } as never;
  const finite = (v: number[] | undefined) => !v || v.every(Number.isFinite);
  const hands: Record<string, number> = {
    "jog, vault a 0.7 m wall": 0,
    "jog, climb onto 1.2 m": 0,
    "jog, jump, catch a 2.2 m ledge": 0,
    "jog, roll": 0,
    "sprint, slide": 0,
    hang: 0,
    "hang, climb up": 0,
    "swing round a pole": 0,
  };
  for (const name of [
    ...Object.keys(hands),
    "sprint, vault a 0.5 m wall",
    "run up a wall",
    "run along a wall",
    "grind a rail",
  ]) {
    const clip = clipList().find((c) => c.name === name);
    assert.ok(clip, name);
    for (const f of tabulate(x, clip, "after", true) ?? []) {
      for (const [j, r] of Object.entries(f.pose)) assert.ok(finite(r as number[]), `${name}: ${j} ${r}`);
      assert.ok(finite(f.lift), `${name}: lift`);
      for (const h of Object.values(f.hands ?? {})) {
        assert.ok(h && finite(h.at) && h.w >= 0 && h.w <= 1, `${name}: a hand ${JSON.stringify(h)}`);
        if (name in hands && h.w > 0.8) hands[name]++;
      }
    }
  }
  // (each puts a hand down for a while: a tenth of a second at least)
  for (const [name, n] of Object.entries(hands)) assert.ok(n >= 12, `${name}: a hand down ${n} frames`);
});

test("phase 5d: the get-ups end standing, from the back and the front", async () => {
  await loadHero();
  const A = (await import("./index")).airNow();
  assert.ok(A);
  for (const back of [true, false]) {
    const start = A.getUp2Pose(0, back).m;
    const end = A.getUp2Pose(1, back).m;
    assert.ok(start.lift[1] < -0.55, `lying: hips ${start.lift[1]}`);
    assert.ok(Math.abs(end.lift[1]) < 0.02, `stood: hips ${end.lift[1]}`);
    for (let u = 0; u <= 1; u += 0.01)
      for (const r of Object.values(A.getUp2Pose(u, back).m.pose)) assert.ok((r as number[]).every(Number.isFinite));
  }
});

test("phase 6: the everyday — no NaN; sat down she's down, up she's stood; a high five's hands meet", async () => {
  const H = await loadHero();
  const C = await import("./index");
  const { clipList, tabulate } = await import("@/app/dev/anim/clips");
  const x = { C, H, T: 0 } as never;
  for (const clip of clipList().filter((c) => c.motion))
    for (const f of tabulate(x, clip, "after", true) ?? []) {
      for (const [j, r] of Object.entries(f.pose))
        assert.ok((r as number[]).every(Number.isFinite), `${clip.name}: ${j}`);
      for (const h of Object.values(f.hands ?? {})) assert.ok(h?.at.every(Number.isFinite), `${clip.name}: a hand`);
    }
  // (sitting down and getting up: the hips down by the seat's drop sat, back up after)
  const sit = clipList().find((c) => c.name === "sit down, sit, get up");
  assert.ok(sit);
  const fr = tabulate(x, sit, "after", true) ?? [];
  assert.ok(fr[Math.round(4 * 120)].lift[1] < -0.3, `sat: hips ${fr[Math.round(4 * 120)].lift[1]}`);
  assert.ok(Math.abs(fr[fr.length - 1].lift[1]) < 0.03, `stood: hips ${fr[fr.length - 1].lift[1]}`);
  // (a high five at its contact: her hand and theirs where they meet — in the world, a palm apart)
  const A = C.actsNow();
  assert.ok(A);
  const me = A.together2("highfive", 0.45, 0.45, [0, 1.2]).hands?.R;
  const them = A.together2("highfive", 0.45, 0.45, [0, 1.2]).hands?.R;
  assert.ok(me && them && me.w > 0.9);
  // (they face her 1.2 m ahead: their space turned round)
  const gap = Math.hypot(me.at[0] - -them.at[0], me.at[1] - them.at[1], me.at[2] - (1.2 - them.at[2]));
  assert.ok(gap < 0.08, `the hands ${gap.toFixed(2)} m apart`);
});

test("phase 7: the dark — no NaN; struck she's thrown from the blow and guards; the crawl's hands held", async () => {
  const H = await loadHero();
  const C = await import("./index");
  const { clipList, tabulate } = await import("@/app/dev/anim/clips");
  const x = { C, H, T: 0 } as never;
  for (const clip of clipList().filter((c) => c.group === "the dark"))
    for (const f of tabulate(x, clip, "after", !clip.raw) ?? []) {
      for (const [j, r] of Object.entries(f.pose))
        assert.ok((r as number[]).every(Number.isFinite), `${clip.name}: ${j}`);
      for (const h of Object.values(f.hands ?? {})) assert.ok(h?.at.every(Number.isFinite), `${clip.name}: a hand`);
    }
  const N = C.nightNow();
  assert.ok(N);
  // (from ahead the trunk goes back, from behind forward; the arms up to guard either way)
  const ahead = N.hit2(0, 0.15, 1);
  const behind = N.hit2(Math.PI, 0.15, 1);
  assert.ok((ahead.add.spine?.[0] ?? 0) < -0.1 && (behind.add.spine?.[0] ?? 0) > 0.05);
  assert.ok(ahead.w > 0.8 && (ahead.guard.shoulderL?.[0] ?? 0) < -1);
  // (crawling: a hand down stays put on the ground as the body goes over it — 0.6 m/s)
  const v = 0.6;
  let worst = 0;
  let was: number | null = null;
  for (let i = 0; i < 100; i++) {
    const t = i / 120;
    const h = N.crawl2(((t * v) / 0.42) % 1, t, true).hands.R;
    assert.ok(h);
    const world = h.at[2] + t * v;
    if (h.at[1] < 0.04 && was !== null) worst = Math.max(worst, Math.abs(world - was) * 120);
    was = h.at[1] < 0.04 ? world : null;
  }
  assert.ok(worst < 0.05, `a planted hand slides ${worst.toFixed(2)} m/s`);
});

test("phase 8: the shadowed — no NaN; their time catches and goes on; a beam turns them from it", async () => {
  const H = await loadHero();
  const C = await import("./index");
  const { clipList, tabulate } = await import("@/app/dev/anim/clips");
  const x = { C, H, T: 0 } as never;
  for (const clip of clipList().filter((c) => c.group === "the shadowed"))
    for (const f of tabulate(x, clip, "after", false) ?? [])
      for (const [j, r] of Object.entries(f.pose))
        assert.ok((r as number[]).every(Number.isFinite), `${clip.name}: ${j}`);
  const N = C.nightNow();
  assert.ok(N);
  // (held a beat now and then — less than a fifth of the time — and never running backwards)
  let held = 0;
  let was = -1;
  for (let i = 0; i < 1200; i++) {
    const g = N.glitch(i / 120, 5);
    assert.ok(g >= was - 1e-9 && g <= i / 120 + 1e-9);
    if (g !== i / 120) held++;
    was = g;
  }
  assert.ok(held > 30 && held < 240, `held ${held} of 1200`);
  // (a beam from its left: the left arm over the face, the body turned to the right, away)
  const l = N.shade2("recoil", 0.5, 3, false, 1.2).m.pose;
  const r = N.shade2("recoil", 0.5, 3, false, -1.2).m.pose;
  assert.ok((l.shoulderL?.[0] ?? 0) < -1.5 && (r.shoulderR?.[0] ?? 0) < -1.5);
  assert.ok((l.spine?.[1] ?? 0) < 0 && (r.spine?.[1] ?? 0) > 0);
});
