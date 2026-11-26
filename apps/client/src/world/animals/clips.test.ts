import assert from "node:assert/strict";
import { test } from "node:test";
import { clipOf, onTheMove } from "./clips";

// An animal coming at you runs on its legs (a bear, a wolf chasing someone who flees): its attack only as it strikes,
// or stood in reach — never slid along the ground in a clip made standing still.

const at = (doing: Parameters<typeof clipOf>[0], pace: Parameters<typeof clipOf>[1], o: Partial<Parameters<typeof onTheMove>[1]> = {}) =>
  onTheMove(clipOf(doing, pace, false, 0), { walking: false, striking: false, aloft: false, h: 0, ...o });

test("attacking: runs while it comes at you, its attack as it strikes and when it stands in reach", () => {
  assert.equal(at("attack", "run", { walking: true }), "run", "chasing: its legs go");
  assert.equal(at("attack", "run", { walking: true, striking: true }), "attack", "it strikes as it runs");
  assert.equal(at("attack", "still"), "attack", "stood in reach");
});

test("any still clip while it really goes somewhere: its gait", () => {
  for (const d of ["graze", "eat", "warn", "alert", "alarm", "sniff", "drink", "groom", "play", "call", "perch"] as const)
    assert.equal(at(d, "walk", { walking: true }), "run", `${d}, moving`);
  assert.equal(at("graze", "still"), "eat", "grazing in place: eating");
});

test("not on its legs: lying, dead, flying, up a tree, swimming — as they are", () => {
  assert.equal(at("sleep", "still", { walking: true }), "lie");
  assert.equal(at("dead", "still", { walking: true }), "die");
  assert.equal(onTheMove(clipOf("perch", "still", true, 3), { walking: true, striking: false, aloft: true, h: 3 }), "idle", "perched up high: as it was");
  assert.equal(onTheMove("idle" as string, { walking: true, striking: false, aloft: false, h: 2 }), "idle", "up a tree");
  assert.equal(at("swim", "swim", { walking: true }), "swim");
});
