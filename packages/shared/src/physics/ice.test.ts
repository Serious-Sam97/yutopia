import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import {
  holesFromWire,
  holesToWire,
  ICE_HOLE,
  ICE_TOP,
  iceAt,
  iceCovers,
  POND,
  POND_LEVEL,
  setIceHoles,
  setUnderfoot,
  walkableCell,
} from "../grounds.ts";
import { KH_FEEL, type MoveEnv, NO_INPUT, newBody, SWIM, stepBody } from "../move/index.ts";
import { FULL_VITALS, freshClock, stepVitals } from "../vitals.ts";
import { waterTempAt } from "../weather.ts";
import { iceSheet } from "./build.ts";

// The water's ice (docs/plan/66-the-water.md, S3–S4): walked where it's drawn — in from the shores as
// it freezes — thin near its edge while young, broken through in holes; a swimmer it freezes round is
// put up on it; the water's cold takes your warmth.

afterEach(() => {
  setUnderfoot({ ice: 1 });
  setIceHoles([]);
});

// the pond along its east–west middle, at `f` of its radius from its middle (Grounds coords)
const across = (f: number): [number, number] => [POND.cx + POND.rx * f, POND.cz];

test("the ice is where it's drawn: in from the shore at half frozen, the middle open; all of it frozen over", () => {
  setUnderfoot({ ice: 0.5 });
  assert.ok(iceAt(...across(0.9)), "by the shore, iced");
  assert.equal(iceAt(...across(0.2)), null, "its middle, open");
  // (the shader's own rule: wx3d.ts WX_ICE)
  for (const side of [0, 0.3, 0.6, 0.9])
    for (const ice of [0, 0.3, 0.6, 0.9, 1])
      assert.equal(iceCovers(side, ice), !(1 - side > ice * 1.02 - 0.01), `${side} at ${ice}`);
  setUnderfoot({ ice: 1 });
  assert.ok(iceAt(...across(0)), "frozen over, its middle iced");
  setUnderfoot({ ice: 0 });
  assert.equal(iceAt(...across(0.9)), null, "open, none");
});

test("thin: near its edge while it's young, all of it very young; not once it's frozen hard", () => {
  setUnderfoot({ ice: 0.5 });
  // (its edge at half: 0.5 of the way across — within 2 m of it thin, further out not)
  const edge = 1 - (0.5 * 1.02 - 0.01);
  assert.equal(iceAt(...across(edge + 1 / POND.rz))?.thin, true, "a metre from its edge");
  assert.equal(iceAt(...across(0.97))?.thin, false, "by the shore");
  setUnderfoot({ ice: 0.2 });
  assert.equal(iceAt(...across(0.97))?.thin, true, "all of it, just frozen");
  setUnderfoot({ ice: 1 });
  assert.equal(iceAt(...across(0))?.thin, false, "frozen hard");
});

test("a hole: no ice in it, walked round it; its sheet has no piece there; the wire carries it", () => {
  setUnderfoot({ ice: 1 });
  const [x, z] = across(0.3);
  const h = { x, z, r: ICE_HOLE.r, at: 1_700_000_000_000 };
  setIceHoles([h]);
  assert.equal(iceAt(x, z), null, "in it, the water");
  assert.ok(iceAt(x + 2, z), "beside it, the ice");
  assert.equal(walkableCell(Math.floor(x), Math.floor(z)), false, "the paths keep out of it");
  const sheet = iceSheet(1, [h]);
  for (const s of sheet)
    if (s.t === "box")
      assert.ok(Math.hypot(s.x - x, s.z - z) > ICE_HOLE.r - 0.1, `a piece in the hole at ${s.x}, ${s.z}`);
  assert.ok(
    sheet.some((s) => s.t === "box" && Math.hypot(s.x - x, s.z - z) < ICE_HOLE.r + 1.5),
    "the ice round it",
  );
  const back = holesFromWire(holesToWire([h]));
  assert.equal(back.length, 1);
  assert.ok(Math.abs(back[0].x - x) < 0.06 && Math.abs(back[0].z - z) < 0.06 && back[0].at === h.at);
  assert.deepEqual(holesFromWire(""), []);
});

test("the sheet follows the ice: none open, a ring in from the shore at half, across it all frozen", () => {
  assert.equal(iceSheet(0).length, 0);
  const half = iceSheet(0.5);
  const full = iceSheet(1);
  // (none in the pond's open middle at half; its middle iced frozen over)
  const inMiddle = (ss: typeof half) =>
    ss.some((s) => s.t === "box" && Math.abs(s.z - POND.cz) < 1 && Math.abs(s.x - POND.cx) < s.hx - 1);
  assert.equal(inMiddle(half), false, "half: its middle open");
  assert.equal(inMiddle(full), true, "frozen: across it");
  for (const s of full) if (s.t === "box" && Math.abs(s.z - POND.cz) < 30) assert.ok(s.y + s.hy > POND_LEVEL - 10);
});

test("a swimmer it freezes round is put up on its top; a walker on it doesn't swim", () => {
  const level = POND_LEVEL;
  let iced = false;
  const env: MoveEnv = {
    grid: {
      fitsAt: () => true,
      groundAt: () => level - 3,
      clear: () => true,
      onRamp: () => false,
      onLand: () => true,
      speedAt: () => 1,
    },
    footing: () => "ice",
    water: () => ({ level, bed: level - 3, vx: 0, vy: 0, ice: iced }),
  };
  const b = newBody(0, 0, level - SWIM.ride);
  b.swim = { under: false };
  stepBody(b, NO_INPUT, env, KH_FEEL);
  assert.ok(b.swim, "afloat in open water");
  iced = true;
  stepBody(b, NO_INPUT, env, KH_FEEL);
  assert.ok(!b.swim && Math.abs(b.z - (level + ICE_TOP)) < 1e-6, `up on the ice: ${b.z}`);
});

test("the water's cold takes the warmth by how cold it is, faster at night; none in a warm one", () => {
  const run = (water: number | null, night: number) => {
    const v = { ...FULL_VITALS };
    const c = freshClock();
    for (let i = 0; i < 60 * 10; i++)
      stepVitals(v, c, { sprinting: false, outside: true, night, storm: 0, warm: false, focus: false, water }, 0.1);
    return 100 - v.wm;
  };
  const cold = run(2, 0);
  assert.ok(Math.abs(cold - 6) < 0.2, `6 a minute at 2 °C: ${cold}`);
  assert.ok(run(11, 0) < cold * 0.6, "less in a milder one");
  assert.ok(run(2, 1) > cold * 1.4, "more at night");
  assert.equal(run(22, 0), 0, "none in a warm one");
  // (out of it by day the air's own, as before)
  assert.equal(run(null, 0), 0);
});

test("the water's warmth follows the air's over a day, never under 1 °C", () => {
  const t0 = Date.UTC(2026, 10, 2, 12);
  for (let h = 0; h < 24 * 30; h += 7) {
    const t = waterTempAt(t0 + h * 3_600_000);
    assert.ok(t >= 1 && t < 30, `${t}`);
  }
  // (slow: an hour on, it's moved little)
  assert.ok(Math.abs(waterTempAt(t0) - waterTempAt(t0 + 3_600_000)) < 1);
});
