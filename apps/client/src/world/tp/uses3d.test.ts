import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_AVATAR } from "@yutopia/shared";
import { Vector3 } from "three";
import { busy2 } from "../chars/anim/acts";
import { CharFactory, PersonModel } from "../chars/model";
import { levelHands } from "./level3d";

// Plan 62 phase 3 (docs/plan/62-the-touch.md): what's used stood, the hands on its parts — a
// machine's button pressed and then its drink taken, a tap held under a cup, the piano's keys, the
// whiteboard's face, a pool cue's bridge and grip — not at heights of their own in the air.

type P = [number, number, number];
// (her own space: x her left, y up, z ahead — where the view puts them, stood where the menu has her)
const CASES: { what: string; parts: P[]; at: { t: number; hand: "L" | "R"; on: number; off?: P }[] }[] = [
  {
    what: "coffee",
    parts: [
      [-0.05, 1.02, 0.42],
      [-0.03, 0.69, 0.5],
    ],
    at: [
      { t: 0.25, hand: "R", on: 0, off: [0, 0.01, -0.06] },
      { t: 1.6, hand: "R", on: 1, off: [0, 0.04, -0.06] },
    ],
  },
  {
    what: "water",
    parts: [
      [-0.05, 0.59, 0.42],
      [0.22, 0.66, 0.35],
    ],
    at: [
      { t: 0.33, hand: "L", on: 1 },
      { t: 0.95, hand: "R", on: 0, off: [-0.04, 0.01, -0.05] },
    ],
  },
  {
    what: "vending",
    parts: [
      [-0.12, 0.92, 0.42],
      [0.06, 0.2, 0.42],
    ],
    at: [
      { t: 0.3, hand: "R", on: 0, off: [0, 0, -0.06] },
      { t: 1.5, hand: "R", on: 1, off: [0, 0.06, -0.08] },
    ],
  },
  // (1.5 s in: the second line's start — 0.2 to her left, the marker's tip on the board)
  { what: "whiteboard", parts: [[0, 1.35, 0.45]], at: [{ t: 1.5, hand: "R", on: 0, off: [0.2, 0, -0.1] }] },
  {
    what: "pool",
    parts: [
      [0.15, 0.78, 0.87],
      [-0.15, 0.95, -0.13],
    ],
    at: [
      { t: 1, hand: "L", on: 0, off: [0, 0.03, 0] },
      { t: 1, hand: "R", on: 1 },
    ],
  },
];

test("used stood: the hands on the thing's own parts", () => {
  const f = new CharFactory();
  const m = new PersonModel(f, DEFAULT_AVATAR, 2);
  m.update();
  f.pump(1000);
  assert.ok(m.update());
  for (const c of CASES)
    for (const a of c.at) {
      const act = busy2(c.what, a.t, 0.3, undefined, c.parts);
      m.setPose(act.pose, act.lift ?? [0, 0, 0]);
      m.handsTo(act.hands ?? null);
      levelHands((j) => m.bone(j), act.hands ?? null);
      const w = m.jointPosition(`wrist${a.hand}`);
      const p = c.parts[a.on];
      const o = a.off ?? [0, 0, 0];
      const want = new Vector3(p[0] + o[0], p[1] + o[1], p[2] + o[2]);
      const d = w.distanceTo(want);
      if (process.env.USES_LOG)
        console.log(
          c.what,
          a.t,
          a.hand,
          d.toFixed(3),
          w.toArray().map((v) => v.toFixed(2)),
        );
      assert.ok(d < 0.09, `${c.what} at ${a.t} s: the ${a.hand} hand ${d.toFixed(3)} m off its part`);
    }
  m.dispose();
  f.dispose();
});
