import assert from "node:assert/strict";
import { test } from "node:test";
import { ADAPT_S, eyesOf, glareOf, nearLift, SEEN, stepEyes, unseen } from "./eyes";

// The eyes (docs/plan/44-the-night.md N3): ~40 s to adjust in the dark, half a second to lose it.

const run = (t: number, s: number, glare: number, dark = 1) => {
  for (let i = 0; i < s * 60; i++) t = stepEyes(t, 1 / 60, glare, dark);
  return t;
};

test("in the dark they adjust over ~40 s, slowly at first", () => {
  assert.ok(eyesOf(run(0, 5, 0)) < 0.1, "5 s: barely");
  assert.ok(eyesOf(run(0, 20, 0)) > 0.4, "20 s: halfway");
  assert.ok(eyesOf(run(0, ADAPT_S, 0)) > 0.99, "40 s: all");
});

test("a lamp's pool puts them out in under a second", () => {
  const t = run(0, ADAPT_S, 0);
  assert.ok(eyesOf(run(t, 0.55, glareOf(0.6))) < 0.01);
});

test("a faint light doesn't: the snow lit by your own torch beside you, the eyes' own fill", () => {
  const t = run(0, ADAPT_S, 0);
  assert.equal(glareOf(0.08), 0);
  assert.ok(eyesOf(run(t, 5, glareOf(0.08))) > 0.99);
});

test("by day there's nothing to adjust to", () => {
  assert.equal(run(30, 1, 0, 0), 0);
});

test("seen and unseen: out of every light and off, no name; lit or near, seen; by day all", () => {
  assert.equal(unseen(0.01, 9, 1), true, "dark, nine steps off");
  assert.equal(unseen(0.3, 9, 1), false, "in a beam");
  assert.equal(unseen(0.01, 2, 1), false, "a step away");
  assert.equal(unseen(0.01, 9, 0), false, "by day");
});

test("what's right round you is faintly seen, nothing past it", () => {
  assert.ok(nearLift(0, 1) > 0.05, "yourself");
  assert.equal(nearLift(SEEN.near, 1), 0);
  assert.equal(nearLift(0, 0), 0, "by day nothing to lift");
});
