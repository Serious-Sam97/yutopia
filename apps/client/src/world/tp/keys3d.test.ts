import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_AVATAR, HANDS_AT, PIANO_STOOL } from "@yutopia/shared";
import { busy2, sit2 } from "../chars/anim/acts";
import { CharFactory, PersonModel } from "../chars/model";
import { levelHands } from "./level3d";
import { legOf, SEATS, seatFit } from "./seats3d";

// Plan 62 phase 2 (docs/plan/62-the-touch.md): at a desk, the hands are on the keyboard she faces —
// sat at it or stood — wherever on the desk it is within reach: the knuckles just over its keys, over
// the keyboard itself (not in the air in front of the desk).

const KEYS_TOP = 0.684;
const KNEE_R = 0.05; // m: the knee's front before its joint // m: a keyboard's top on a desk (a desk 25 iso px, the keyboard 1.8 more)

test("typing: the hands on the keys, sat at a desk or stood at it", () => {
  const f = new CharFactory();
  for (const body of ["slim", "regular", "broad"] as const) {
    const m = new PersonModel(f, { ...DEFAULT_AVATAR, body }, 2);
    m.update();
    f.pump(1000);
    assert.ok(m.update());
    const s = SEATS.chair;
    const drop = m.sitDrop(s.top);
    const fit = { drop, stand: legOf((j) => m.bone(j)).hipY, floor: 0, recline: 0 };
    // (the keys from the hips: near the desk's edge, mid-desk, and to one side)
    for (const keys of [
      [0, KEYS_TOP, 0.4],
      [0, KEYS_TOP, 0.5],
      [0.12, KEYS_TOP, 0.45],
      // (a reception desk's: 29 iso px)
      [0, 0.786, 0.42],
    ] as [number, number, number][]) {
      for (const [how, act, lift] of [
        ["sat", sit2(1, false, 2.2, true, fit, 0.3, keys), drop],
        // (stood just clear of the desk's edge: the keys as far ahead as sat)
        ["stood", busy2("computer", 2.2, 0.3, keys), 0],
      ] as const) {
        const l = act.lift ?? [0, 0, 0];
        m.setPose(act.pose, [l[0], l[1] + lift, l[2]]);
        m.handsTo(act.hands ?? null);
        levelHands((j) => m.bone(j), act.hands ?? null);
        const kz = keys[2];
        for (const S of ["L", "R"] as const) {
          const k = m.jointPosition(`fingers${S}`);
          const w = m.jointPosition(`wrist${S}`);
          const at = `${body} ${how}, keys ${keys.join(" ")}: the ${S} knuckles`;
          if (process.env.KEYS_LOG)
            console.log(
              at,
              k.toArray().map((v) => v.toFixed(3)),
              w.toArray().map((v) => v.toFixed(3)),
            );
          assert.ok(k.y - keys[1] > 0 && k.y - keys[1] < 0.035, `${at} ${(k.y - keys[1]).toFixed(3)} m over the keys`);
          assert.ok(Math.abs(k.z - kz) < 0.12, `${at} ${(k.z - kz).toFixed(3)} m off them ahead`);
          assert.ok(Math.abs(k.x - keys[0]) < 0.24, `${at} ${(k.x - keys[0]).toFixed(3)} m off them aside`);
        }
      }
    }
    m.dispose();
  }
  f.dispose();
});

test("the piano: sat on its stool, the hands on its keys, the knees clear of its key ledge", () => {
  const f = new CharFactory();
  for (const body of ["slim", "regular", "broad"] as const) {
    const m = new PersonModel(f, { ...DEFAULT_AVATAR, body }, 2);
    m.update();
    f.pump(1000);
    assert.ok(m.update());
    const leg = legOf((j) => m.bone(j));
    const s = SEATS.stool;
    const { along } = seatFit(s, leg.thigh);
    const drop = m.sitDrop(s.top);
    // (from the stool's middle to the keys and to the keybed's front edge, tiles: shared PIANO_STOOL
    // and furniture.ts HANDS_AT, as the kit draws them — plan 67)
    const [, kz, kh] = HANDS_AT.piano.keys;
    const [, front, under] = HANDS_AT.piano.ledge;
    const toKeys = PIANO_STOOL[1] - kz - along;
    const ledge = PIANO_STOOL[1] - front - along;
    const keys: [number, number, number, number] = [0, kh, toKeys, 0.2];
    const act = sit2(1, false, 2.2, true, { drop, stand: leg.hipY, floor: 0 }, 0.3, keys);
    const l = act.lift ?? [0, 0, 0];
    m.setPose(act.pose, [l[0], l[1] + drop, l[2]]);
    m.handsTo(act.hands ?? null);
    levelHands((j) => m.bone(j), act.hands ?? null);
    for (const S of ["L", "R"] as const) {
      const k = m.jointPosition(`fingers${S}`);
      assert.ok(
        k.y - keys[1] > 0 && k.y - keys[1] < 0.045,
        `${body}: the ${S} knuckles ${(k.y - keys[1]).toFixed(3)} over the keys`,
      );
      assert.ok(
        Math.abs(k.z - toKeys) < 0.12,
        `${body}: the ${S} knuckles ${(k.z - toKeys).toFixed(3)} off them ahead`,
      );
      const knee = m.jointPosition(`knee${S}`);
      assert.ok(
        knee.z + KNEE_R < ledge || knee.y < under - 0.06,
        `${body}: the ${S} knee into the ledge (${knee.z.toFixed(2)} of ${ledge.toFixed(2)}, ${knee.y.toFixed(2)} up)`,
      );
    }
    m.dispose();
  }
  f.dispose();
});
