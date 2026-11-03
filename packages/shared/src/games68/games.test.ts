import assert from "node:assert/strict";
import { test } from "node:test";
import { CLAW_REACH, clawDrop, prizesOf } from "./claw.ts";
import { dartScore, RINGS } from "./darts.ts";
import { FOOS, menOf, newFoos, stepFoos } from "./foosball.ts";
import { HOCKEY, newHockey, placeMallet, stepHockey } from "./hockey.ts";

// Plan 68 phases 21–25: the small games' rules.
test("darts: a real board's scores", () => {
  assert.equal(dartScore(0, 0).points, 50);
  assert.equal(dartScore(0.01, 0).points, 25);
  assert.equal(dartScore(0, 0.103).points, 60, "treble twenty, straight up");
  assert.equal(dartScore(0, 0.166).points, 40, "double twenty");
  assert.equal(dartScore(0.13, 0).points, 6, "six, to the right");
  assert.equal(dartScore(0, -0.13).points, 3, "three, straight down");
  assert.equal(dartScore(0, RINGS.doubleOut + 0.01).ring, "miss");
});

test("claw: the same prizes for everyone; it grips under the claw, or not", () => {
  const a = prizesOf("claw-1");
  assert.equal(a.length, 9);
  assert.deepEqual(prizesOf("claw-1"), a);
  assert.equal(clawDrop(a, a[3].x, a[3].z, 0), 3, "dead over one: gripped");
  assert.equal(clawDrop(a, a[3].x, a[3].z, 0.99), -1, "unless it slips");
  assert.equal(clawDrop(a, a[3].x + CLAW_REACH * 2.5, -1, 0), -1, "nothing under it");
});

test("air hockey: rails, a swing hits the puck, into the goal", () => {
  const h = newHockey();
  h.puck = { x: 0.1, y: 0.9, vx: -2, vy: 0 };
  stepHockey(h, 0.1, h.mallets);
  assert.ok(h.puck.vx > 0, "off the rail");
  // a mallet swung through the puck sends it up the table
  const g = newHockey();
  g.puck = { x: HOCKEY.W / 2, y: 0.4, vx: 0, vy: 0 };
  const was = structuredClone(g.mallets);
  placeMallet(g, 0, HOCKEY.W / 2, 0.36);
  was[0] = { x: HOCKEY.W / 2, y: 0.2 };
  stepHockey(g, 1 / 30, was);
  assert.ok(g.puck.vy > 1, `hit: ${g.puck.vy.toFixed(2)}`);
  // straight into player 1's goal: player 0 scores
  const s = newHockey();
  s.puck = { x: HOCKEY.W / 2, y: HOCKEY.L - 0.05, vx: 0, vy: 3 };
  let who = -1;
  for (let i = 0; i < 10 && who < 0; i++) who = stepHockey(s, 1 / 30, s.mallets);
  assert.equal(who, 0);
  assert.deepEqual(s.score, [1, 0]);
});

test("foosball: the men block, a kick sends it up the table, a goal", () => {
  const f = newFoos();
  assert.equal(menOf(f, 0).length, 11);
  // a man kicking
  const [mx, my] = menOf(f, 0)[3];
  f.ball = { x: mx, y: my + 0.03, vx: 0, vy: -0.5 };
  f.kick[0] = 0;
  stepFoos(f, 1 / 60);
  assert.ok(f.ball.vy > 2, `kicked: ${f.ball.vy.toFixed(2)}`);
  // into side 1's goal
  const g = newFoos();
  g.ball = { x: FOOS.W / 2, y: FOOS.L - 0.04, vx: 0, vy: 3 };
  g.slide = [1, 1];
  let who = -1;
  for (let i = 0; i < 20 && who < 0; i++) who = stepFoos(g, 1 / 60);
  assert.equal(who, 0);
});
