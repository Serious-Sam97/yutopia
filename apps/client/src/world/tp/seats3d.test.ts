import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_AVATAR, SEAT_NEXT } from "@yutopia/shared";
import { sit2 } from "../chars/anim/acts";
import { CharFactory, PersonModel } from "../chars/model";
import { ANKLE_M, legOf, SEATS, seatFit } from "./seats3d";

// Plan 62 phase 1 (docs/plan/62-the-touch.md): sat on every seat, whoever she is, her feet are on
// the floor (not under it, not off it), her hips on the cushion (not sunk into it), her knees no
// further than its front, and a seat with a back has her back to it.

test("sat on each seat: the feet on the floor, the hips on the cushion, the knees at its front", () => {
  const f = new CharFactory();
  for (const body of ["slim", "regular", "broad"] as const) {
    const a = { ...DEFAULT_AVATAR, body };
    const m = new PersonModel(f, a, 2);
    m.update();
    f.pump(1000);
    assert.ok(m.update());
    // (and the redrawn ones awaiting sign-off: plan 67's SEAT_NEXT, sat on with ?furn=new)
    const next = Object.entries(SEAT_NEXT).map(([k, v]) => [`${k} (next)`, v] as const);
    for (const [kind, s] of [...Object.entries(SEATS), ...next]) {
      const { along, recline } = seatFit(s, legOf((j) => m.bone(j)).thigh);
      const drop = m.sitDrop(s.top);
      const fit = {
        drop,
        stand: legOf((j) => m.bone(j)).hipY,
        floor: s.rest ?? 0,
        recline,
        ahead: s.solid ? s.front - along + 0.06 : 0,
        arms: s.arms ?? null,
      };
      for (const t of [0, 3, 8, 15, 22]) {
        const act = sit2(1, false, t, false, fit, 0.3);
        const l = act.lift ?? [0, 0, 0];
        m.setPose(act.pose, [l[0], l[1] + drop, l[2]]);
        const at = `${body} on the ${kind} at ${t} s`;
        // (never under the floor; one's lifted a moment as she moves her feet now and then)
        let low = 9;
        for (const S of ["L", "R"] as const) {
          const ankle = m.jointPosition(`ankle${S}`);
          low = Math.min(low, ankle.y);
          assert.ok(ankle.y > (s.rest ?? 0) + ANKLE_M - 0.015, `${at}: the ${S} ankle ${ankle.y.toFixed(3)} m up`);
          const knee = m.jointPosition(`knee${S}`);
          assert.ok(
            s.rear !== undefined || knee.z + along < s.front + 0.08,
            `${at}: the ${S} knee ${(knee.z + along).toFixed(2)} past its front`,
          );
          // (the shins clear of a seat solid to the floor)
          if (s.solid) assert.ok(ankle.z + along > s.front, `${at}: the ${S} foot under its front`);
        }
        // (on the floor, or a bar stool's footrest)
        assert.ok(low < (s.rest ?? 0) + ANKLE_M + 0.015, `${at}: both feet off the floor (${low.toFixed(3)})`);
        const hip = m.jointPosition("thighL");
        const under = hip.y - (m.sitDrop(0) + legOf((j) => m.bone(j)).hipY);
        assert.ok(
          Math.abs(under - s.top) < 0.02,
          `${at}: the thighs' underside ${under.toFixed(3)} on a ${s.top.toFixed(3)} seat`,
        );
        if (s.back !== null) {
          const chest = m.jointPosition("chest");
          const behind = chest.z + along - s.back;
          assert.ok(behind > 0.04 && behind < 0.22, `${at}: the chest's joint ${behind.toFixed(2)} m off its back`);
        }
      }
    }
    m.dispose();
  }
  f.dispose();
});
