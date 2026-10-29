import assert from "node:assert/strict";
import { test } from "node:test";
import { editsCount, mergeEdits } from "./grounds-draft.ts";
import type { GroundsEdits } from "./grounds-edits.ts";

// A draft against what's published, and brought up to date (docs/plan/53-the-god-mode.md, phase 5).

const road = (key: string, w = 7) => ({
  key,
  kind: "road" as const,
  name: key,
  w,
  pts: [
    [0, 0],
    [10, 0],
  ] as [number, number][],
});

test("counted against what's published: each kind, and back to it is nothing", () => {
  const live: GroundsEdits = { rev: 3, height: { "1,1": "a" }, ways: { add: [road("god-a")] } };
  const draft: GroundsEdits = {
    rev: 3,
    height: { "1,1": "b", "2,2": "c" },
    paint: { "0,0": "p" },
    ways: { add: [road("god-a", 9), road("god-b")], remove: ["trail-west"] },
    things: { remove: ["lamp:gate"] },
  };
  const n = editsCount(live, draft);
  assert.equal(n.height, 2);
  assert.equal(n.paint, 1);
  assert.deepEqual(n.ways, { add: 1, change: 1, remove: 1 });
  assert.deepEqual(n.things, { add: 0, change: 0, remove: 1 });
  assert.equal(n.total, 7);
  assert.equal(editsCount(live, { ...live, ways: { add: [{ ...road("god-a") }] } }).total, 0);
  // (a road published, gone from the draft: one taken away)
  assert.deepEqual(editsCount(live, { rev: 3, height: live.height }).ways, { add: 0, change: 0, remove: 1 });
});

test("brought up to date: each side's own changes kept, both changed: the draft's, said", () => {
  const base: GroundsEdits = { rev: 2, height: { "0,0": "h0" }, ways: { add: [road("god-a")] } };
  // mine: raised another chunk, widened god-a, painted 1,1
  const mine: GroundsEdits = {
    rev: 2,
    height: { "0,0": "h0", "5,5": "mine" },
    paint: { "1,1": "pm" },
    ways: { add: [road("god-a", 12)] },
  };
  // theirs (published since): changed 0,0, painted 1,1 too, added god-b, took away a lamp
  const theirs: GroundsEdits = {
    rev: 3,
    height: { "0,0": "h1" },
    paint: { "1,1": "pt" },
    ways: { add: [road("god-a"), road("god-b")] },
    things: { remove: ["lamp:gate"] },
  };
  const { edits, overlaps } = mergeEdits(base, mine, theirs);
  assert.equal(edits.rev, 3);
  assert.deepEqual(edits.height, { "0,0": "h1", "5,5": "mine" });
  assert.deepEqual(edits.paint, { "1,1": "pm" });
  assert.deepEqual(
    edits.ways?.add?.map((w) => [w.key, w.w]),
    [
      ["god-a", 12],
      ["god-b", 7],
    ],
  );
  assert.deepEqual(edits.things, { remove: ["lamp:gate"] });
  assert.deepEqual(overlaps, [{ kind: "paint", key: "1,1" }]);
  // nothing drafted: what's live, exactly
  assert.equal(editsCount(theirs, mergeEdits(base, base, theirs).edits).total, 0);
});
