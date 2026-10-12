import assert from "node:assert/strict";
import { test } from "node:test";
import { HELD, heldState, SIP_MS } from "./held.ts";

test("a mug is drunk sip by sip on a shared schedule, then put away", () => {
  const d = HELD.mug;
  // before the first sip: full, not sipping
  assert.deepEqual(heldState("mug", 0), { used: 0, level: 1, sip: -1, done: false });
  // in the middle of the first sip: it's going down
  const mid = heldState("mug", d.first + SIP_MS * 0.6);
  assert.equal(mid.used, 1);
  assert.ok(mid.sip > 0.5 && mid.sip < 0.7);
  assert.equal(mid.level, 1 - 1 / d.uses);
  // between sips
  const between = heldState("mug", d.first + d.every * 0.5);
  assert.equal(between.sip, -1);
  assert.equal(between.level, 1 - 1 / d.uses);
  // after the last sip: empty, lingering, then done
  const last = d.first + (d.uses - 1) * d.every + SIP_MS;
  assert.equal(heldState("mug", last + 100).level, 0);
  assert.equal(heldState("mug", last + 100).done, false);
  assert.equal(heldState("mug", last + d.linger + 100).done, true);
});
