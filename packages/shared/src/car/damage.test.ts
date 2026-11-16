import assert from "node:assert/strict";
import { test } from "node:test";
import { damageString, headK, knock, mergeDamage, noDamage, PART, parseDamage, steamOf, steerPull } from "./damage.ts";

test("damage: the old four-zone string still reads; written back the same", () => {
  const d = parseDamage("0.2,0,0,0.5");
  assert.deepEqual(d.zones, [0.2, 0, 0, 0.5, 0]);
  assert.equal(d.parts, 0);
  assert.equal(damageString(d), "0.2,0,0,0.5");
  assert.equal(damageString(noDamage()), "");
  assert.deepEqual(parseDamage("junk").zones, [0, 0, 0, 0, 0]);
});

test("damage: the roof and the parts round-trip; merged only ever more", () => {
  const d = parseDamage("0.3,0,0,0,0.4|18");
  assert.equal(d.parts, 18);
  assert.equal(damageString(d), "0.3,0,0,0,0.4|18");
  const m = mergeDamage(d, { zones: [0.1, 0.9, 0, 0, 0], parts: 4 });
  assert.deepEqual(m.zones, [0.3, 0.5, 0, 0, 0.4], "never less; no more than half at once");
  assert.equal(m.parts, 18 | 4 | PART.bumperHang, "gone is past hanging");
});

test("damage: knocks break what they reach — the bumper, a lamp on its side, the glass", () => {
  const d = noDamage();
  assert.equal(knock(d, 0, 0.2, -0.6), 0, "a light knock dents only");
  const broke = knock(d, 0, 0.2, -0.6);
  assert.ok(broke & PART.bumperHang, "the bumper hangs");
  assert.ok(broke & PART.headL, "the lamp on the side struck");
  assert.ok(!(broke & PART.headR));
  knock(d, 0, 0.3, 0);
  assert.ok(d.parts & PART.bumperGone, "a hard front: the bumper's gone");
  assert.ok(d.parts & PART.screen, "…and the windscreen cracked");
  assert.equal(headK(d, "l"), 0);
  assert.ok(steerPull(d) !== 0, "a bad front pulls the steering");
  assert.ok(steamOf(d) === 0 || d.zones[0] > 0.8);
  knock(d, 0, 0.35, 0);
  assert.ok(steamOf(d) > 0, "steam past 0.8");
  const s = noDamage();
  knock(s, 2, 0.2, 0.5);
  assert.ok(s.parts & PART.mirrorL, "a side scrape folds its mirror");
  knock(s, 2, 0.45, 0);
  assert.ok(s.parts & PART.sideL, "a hard side shatters its windows");
  const r = noDamage();
  knock(r, 4, 0.35, 0);
  assert.ok(r.parts & PART.screen, "on its roof: the windscreen gives");
});
