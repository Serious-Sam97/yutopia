import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_AVATAR, EMOTES, SOCIAL, USES } from "@yutopia/shared";
import { type IsoIn, type IsoMem, isoPose, isoState } from "./iso";
import { JOINTS } from "./rig";

// The iso sprites (docs/plan/22-people-3d.md, P6): whatever someone's doing
// boils down to a few drawable frames, and every one of them poses the rig.

const base: IsoIn = { avatar: DEFAULT_AVATAR, dir: 0, a: 0, dist: 0, dt: 1 / 60 };

function finite(s: ReturnType<typeof isoState>) {
  const p = isoPose(s);
  for (const j of JOINTS)
    for (const v of p.pose[j] ?? [0, 0, 0]) assert.ok(Number.isFinite(v) && Math.abs(v) < 4, `${s.upper} ${j}`);
  for (const v of p.lift) assert.ok(Number.isFinite(v) && Math.abs(v) < 0.2);
  return p;
}

test("every state is a few frames, and each poses the rig", () => {
  const seen = new Set<string>();
  const run = (p: Partial<IsoIn>, seconds = 3) => {
    const m: IsoMem = {};
    for (let i = 0; i < seconds * 60; i++) {
      const s = isoState(m, { ...base, ...p, dist: p.a === 1 ? 3.6 / 60 : 0 }, 1000 + i * (1000 / 60));
      seen.add(`${s.base}${s.bf}|${s.upper}${s.uf}`);
      finite(s);
    }
  };
  run({});
  run({ a: 1 });
  run({ a: 2 });
  run({ a: 2, typing: true });
  run({ held: "mug", heldAt: Date.now() - 2400 });
  for (const busy of USES) run({ busy }, 1);
  for (const phone of ["text", "call", "video", "photo", "selfie"]) run({ phone }, 1);
  for (const what of [...SOCIAL, "take"]) run({ act: { what, t: 0.7, len: 1.5 } }, 1);
  for (const emote of EMOTES) run({ emote });
  // a walk cycle is 8 frames, not one per frame
  const walk = [...seen].filter((k) => k.startsWith("walk"));
  assert.ok(walk.length <= 8 && walk.length >= 6, `walk frames: ${walk.length}`);
  assert.ok(seen.size < 600, `${seen.size} distinct frames`);
});

test("a sip tips the drink to the mouth; a call puts the hand at the ear", () => {
  const sip = isoPose({ base: "stand", bf: 0, upper: "sip", uf: 3, face: 1, held: "mug||4", phone: "" });
  assert.ok(sip.sip > 0.5 && (sip.reach.R?.w ?? 0) > 0.5 && sip.reach.R?.at === "mouth");
  const call = isoPose({ base: "walk", bf: 2, upper: "phone:call:", uf: 0, face: 0, held: "", phone: "#000|0" });
  assert.equal(call.reach.R?.at, "ear");
});
