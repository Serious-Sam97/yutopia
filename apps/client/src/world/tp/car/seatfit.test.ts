import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_AVATAR } from "@yutopia/shared";
import { Matrix4, Vector3 } from "three";
import { car3 } from "../../chars/anim/acts";
import { CharFactory, PersonModel } from "../../chars/model";
import { carFit } from "./seatfit";

// Plan 62 phase 5 (docs/plan/62-the-touch.md): in the sedan at full size, the driver's right foot is
// on the throttle and the left on the floor, nothing under the floor, the head under the roof, the
// back to the seat's reclined back, the hands on the wheel's rim; the passenger's feet on the
// footwell's floor. The sedan's own numbers (tp/car/sedan.ts), its driver's hip point at x 0: the
// nose toward −x, its left +z.

const U = (u: number) => u - 2.68; // (the profile's u, from the front seats' hip point)
const HIP = new Vector3(0, 0.47, 0.42);
const PEDALS = [0.57, 0.43, 0.29].map((z, i) => new Vector3(U(1.84), i === 2 ? 0.435 : 0.435, z));
const FLOOR = 0.318;
const ROOF = 1.53 - 0.05; // (its headliner under the roof's skin)
// the wheel's rim at `phi` from 12 o'clock toward the driver's right (sedan.ts `rim`)
const hub = new Vector3(U(2.44), 0.935, 0.425);
const axis = new Vector3(0.2, 0.085, 0).normalize();
const upW = new Vector3(-axis.y, axis.x, 0);
const rightW = new Vector3().crossVectors(upW, axis);
const col = new Matrix4().makeBasis(rightW, upW, axis).setPosition(hub);
const rim = (phi: number) => new Vector3(Math.sin(phi) * 0.19, Math.cos(phi) * 0.19, 0).applyMatrix4(col);

test("in the sedan, full size: the feet on the pedals and the floor, the back to the seat, the hands on the wheel", () => {
  const f = new CharFactory();
  for (const body of ["slim", "regular", "broad"] as const)
    for (const driver of [true, false]) {
      const m = new PersonModel(f, { ...DEFAULT_AVATAR, body }, 2);
      m.update();
      f.pump(1000);
      assert.ok(m.update());
      const hip = driver ? HIP : new Vector3(0, 0.47, -0.42);
      m.root.position.set(hip.x, 0, hip.z);
      m.root.rotation.y = -Math.PI / 2;
      const fit = carFit(m, { hip, front: true }, driver, { pedals: PEDALS, floor: FLOOR }, 1, -1);
      const act = car3(fit, 0, 0);
      const l = act.lift ?? [0, 0, 0];
      m.setPose(act.pose, [l[0], l[1] + fit.drop, l[2]]);
      if (driver)
        for (const [S, phi] of [
          ["L", -1],
          ["R", 1],
        ] as const) {
          m.root.updateMatrixWorld(true);
          m.reachTo(S, rim(phi), 1, [-0.75, -1, -0.35]);
        }
      else m.handsTo(act.hands ?? null);
      m.root.updateMatrixWorld(true);
      const at = (j: Parameters<typeof m.bone>[0]) =>
        (m.bone(j) as NonNullable<ReturnType<typeof m.bone>>).getWorldPosition(new Vector3());
      const who = `${body} ${driver ? "driving" : "beside"}`;
      for (const S of ["L", "R"] as const) {
        const a = at(`ankle${S}`);
        assert.ok(a.y > FLOOR + 0.04, `${who}: the ${S} ankle ${a.y.toFixed(3)} at the floor ${FLOOR}`);
        assert.ok(a.x > U(1.66) + 0.05, `${who}: the ${S} foot through the firewall (${a.x.toFixed(2)})`);
      }
      if (driver) {
        // (the right foot's ball on the throttle: its ankle a hand's width behind and a little under its face)
        const r = at("ankleR");
        assert.ok(
          Math.abs(r.x - (PEDALS[2].x + 0.12)) < 0.06,
          `${who}: the right ankle ${r.x.toFixed(2)} off the throttle`,
        );
        for (const [S, phi] of [
          ["L", -1],
          ["R", 1],
        ] as const)
          assert.ok(at(`wrist${S}`).distanceTo(rim(phi)) < 0.03, `${who}: the ${S} hand off the wheel`);
      } else assert.ok(at("ankleL").y < FLOOR + 0.1, `${who}: the feet off the floor`);
      const head = at("head").y + m.crown;
      if (process.env.CAR_LOG)
        console.log(
          who,
          "head",
          head.toFixed(2),
          "ankles",
          at("ankleL")
            .toArray()
            .map((v) => v.toFixed(2))
            .join(" "),
          "/",
          at("ankleR")
            .toArray()
            .map((v) => v.toFixed(2))
            .join(" "),
          "chest",
          at("chest")
            .toArray()
            .map((v) => v.toFixed(2))
            .join(" "),
          "throttle@",
          (PEDALS[2].x + 0.12).toFixed(2),
        );
      assert.ok(head < ROOF, `${who}: the head's top ${head.toFixed(2)} through the roof ${ROOF}`);
      // (the chest's joint over the seat's back as it leans, not sat up off it: the back's face 0.08
      // behind the hip point at the cushion, 20° back)
      const ch = at("chest");
      const face = 0.08 + (ch.y - 0.43) * Math.tan(0.35);
      assert.ok(face - ch.x < 0.2, `${who}: the back ${(face - ch.x).toFixed(2)} off the seat's`);
      m.dispose();
    }
  f.dispose();
});

test("in a kart, full size: the feet on its pedals, the hips on its seat", () => {
  const f = new CharFactory();
  for (const body of ["slim", "regular", "broad"] as const) {
    const m = new PersonModel(f, { ...DEFAULT_AVATAR, body }, 2);
    m.update();
    f.pump(1000);
    assert.ok(m.update());
    // (tp/kart/kart3d.ts: its hip point, its pedals — the brake her left, the throttle her right —; the nose +x)
    const hip = new Vector3(-0.2, 0.2, 0);
    const pedals = [new Vector3(0.7, 0.16, -0.1), new Vector3(0.7, 0.16, 0.1)];
    m.root.position.set(hip.x, 0, hip.z);
    m.root.rotation.y = Math.PI / 2;
    const fit = carFit(m, { hip, front: true }, true, { pedals }, 1, 1, true);
    const act = car3(fit, 0, 0);
    const l = act.lift ?? [0, 0, 0];
    m.setPose(act.pose, [l[0], l[1] + fit.drop, l[2]]);
    m.root.updateMatrixWorld(true);
    for (const [S, p] of [
      ["L", pedals[0]],
      ["R", pedals[1]],
    ] as const) {
      const a = (m.bone(`ankle${S}`) as NonNullable<ReturnType<typeof m.bone>>).getWorldPosition(new Vector3());
      const want = new Vector3(p.x - 0.12, p.y - 0.04 + 0.061, p.z);
      assert.ok(a.distanceTo(want) < 0.08, `${body}: the ${S} ankle ${a.distanceTo(want).toFixed(3)} m off its pedal`);
      assert.ok(a.y > 0.05, `${body}: the ${S} foot under the kart's floor`);
    }
    m.dispose();
  }
  f.dispose();
});
