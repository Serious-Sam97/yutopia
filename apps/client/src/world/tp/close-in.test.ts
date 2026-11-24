import assert from "node:assert/strict";
import { test } from "node:test";
import { CLOSE_GAP, type CloseBody, closeIn } from "./close-in";

test("a hug draws the two in to its gap, half the way each, eased in and out; a high five stays as it is", () => {
  const seen = new Map<string, number>();
  const me: CloseBody = { id: "s1", yaw: 2, x: 0, y: 0, level: 0, act: "hug", actAt: 5, actWith: "place:tom" };
  const tom: CloseBody = { id: "npc:place:tom", yaw: 0, x: 1.2, y: 0, level: 0, act: "hug", actAt: 7, actWith: "s1" };
  const other: CloseBody = { id: "s2", yaw: 0, x: 4, y: 4, level: 0, act: "highfive", actAt: 1, actWith: "s3" };
  const at0 = closeIn([me, tom, other], 10, seen);
  assert.equal(at0[0].x, 0, "not moved on its first frame");
  assert.equal(at0[2], other, "not a close act: the same object");
  const mid = closeIn([me, tom, other], 11, seen);
  const gap = mid[1].x - mid[0].x;
  assert.ok(Math.abs(gap - CLOSE_GAP.hug) < 1e-9, `drawn ${gap} apart`);
  assert.ok(Math.abs(mid[0].x - (1.2 - CLOSE_GAP.hug) / 2) < 1e-9, "each half the way");
  assert.ok(Math.abs((mid[0].actTo ?? 0) - CLOSE_GAP.hug) < 1e-9, "the arms aimed at the gap");
  assert.ok(Math.abs(mid[0].angle ?? 9) < 1e-9, "me turned to face him (+x)");
  assert.ok(Math.abs(Math.abs(mid[1].angle ?? 0) - Math.PI) < 1e-9, "him to face me (−x)");
  assert.equal(me.x, 0, "the body given is left as it was");
  const end = closeIn([me, tom, other], 12.6, seen);
  assert.ok(Math.abs(end[0].x) < 1e-9, "back where they stand at its end");
});

test("one-sided, on another floor or far apart: not drawn in; finished acts let go of", () => {
  const seen = new Map<string, number>();
  const a = { id: "a", yaw: 0, x: 0, y: 0, level: 0, act: "hug", actAt: 1, actWith: "b" };
  const b = { id: "b", yaw: 0, x: 1, y: 0, level: 0, act: "", actWith: "" };
  closeIn([a, b], 0, seen);
  assert.equal(closeIn([a, b], 1, seen)[0].x, 0);
  const b2 = { ...b, act: "hug", actWith: "a", level: 1 };
  assert.equal(closeIn([a, b2], 1, seen)[0].x, 0);
  const b3 = { ...b, act: "hug", actWith: "a", x: 9 };
  closeIn([a, b3], 2, seen);
  assert.equal(closeIn([a, b3], 3, seen)[0].x, 0);
  closeIn([{ ...a, act: "" }, b], 4, seen);
  assert.equal(seen.size, 0);
});
