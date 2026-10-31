/* biome-ignore-all lint/suspicious/noExplicitAny: the person's build kit, read for the head's lips */
import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_AVATAR } from "@yutopia/shared";
import { MeshBasicMaterial, Vector3 } from "three";
import { hold2 } from "../chars/anim/acts";
import { buildPerson } from "../chars/build";
import { CharFactory, PersonModel } from "../chars/model";
import { buildProp, inHand, keepUpright } from "../chars/props";

// Plan 62 phase 4 (docs/plan/62-the-touch.md): mid-sip, the drink's rim is at the lips — a
// moustache's width out —, square in front of the mouth: not in the jaw or the beard, not cutting a
// cheek. Whoever's drinking, whatever from.

// where one drinks from each (its own space): the mug's rim, the cup lid's edge, the can's top
const RIM = { mug: [0.045, 0.05], cup: [0.046, 0.055], soda: [0.03, 0.06] } as const;

test("a sip: the rim at the lips, for every drink and every one", () => {
  for (const body of ["slim", "regular", "broad"] as const)
    for (const beard of ["none", "full"]) {
      const av = { ...DEFAULT_AVATAR, body, beard } as typeof DEFAULT_AVATAR;
      const f = new CharFactory();
      const m = new PersonModel(f, av, 2);
      m.update();
      f.pump(1000);
      assert.ok(m.update());
      // (the lips: the head's front at the mouth's height, from the head's joint — build/index.ts)
      const k = buildPerson(av, 2) as any;
      const lipsOff = new Vector3(0, k.p.face.mouthY * k.hh, k.head.front(0, k.p.face.mouthY * k.hh).p.z);
      for (const kind of ["mug", "cup", "soda"] as const) {
        const a = hold2(1, 0);
        m.setPose(a.pose, [0, 0, 0], { R: { at: "mouth", w: 1 } });
        const hand = m.bone("wristR");
        assert.ok(hand);
        const prop = buildProp(kind, "#fff", () => new MeshBasicMaterial());
        inHand(prop.root, kind);
        hand.add(prop.root);
        keepUpright(prop.root, kind, m.root, 1.05);
        m.root.updateMatrixWorld(true);
        const lips = lipsOff
          .clone()
          .applyMatrix4((m.bone("head") as NonNullable<ReturnType<typeof m.bone>>).matrixWorld);
        const [R, Y] = RIM[kind];
        let near: Vector3 | null = null;
        for (let i = 0; i < 64; i++) {
          const v = new Vector3(Math.cos((i / 32) * Math.PI) * R, Y, Math.sin((i / 32) * Math.PI) * R).applyMatrix4(
            prop.root.matrixWorld,
          );
          if (!near || v.distanceTo(lips) < near.distanceTo(lips)) near = v;
        }
        const n = near as Vector3;
        const at = `${body}, beard ${beard}, a ${kind}`;
        assert.ok(n.distanceTo(lips) < 0.03, `${at}: its rim ${n.distanceTo(lips).toFixed(3)} m off the lips`);
        assert.ok(n.z > lips.z, `${at}: its rim ${(lips.z - n.z).toFixed(3)} m into the face`);
        assert.ok(Math.abs(n.x - lips.x) < 0.015, `${at}: its rim ${(n.x - lips.x).toFixed(3)} m aside of the mouth`);
        hand.remove(prop.root);
        prop.dispose();
      }
      m.dispose();
      f.dispose();
    }
});
