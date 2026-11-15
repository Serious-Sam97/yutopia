import assert from "node:assert/strict";
import { test } from "node:test";
import { deviceQuality } from "@/lib/prefs";
import { HOLD_MS, QualityWatch, ROOM_S, SLOW_S, startTier } from "./quality";

// Auto's tier (docs/plan/89-the-weight.md phase 6, F2c): Medium first on a device Auto would give High, up to High
// when there's room, down when there isn't — and remembered.

const watch = () => new QualityWatch({} as never);
const DAY = 24 * 3600 * 1000;

test("it starts on Medium on a device Auto would give High; on what it held last; never above the device", () => {
  if (deviceQuality() !== "high") return; // (this machine: a desktop — the case worth checking)
  const now = 1_000_000_000_000;
  assert.equal(startTier(null, now), "medium");
  assert.equal(startTier({ tier: "high", at: now - 300 * DAY }, now), "high", "High held: for good");
  assert.equal(startTier({ tier: "low", at: now - DAY }, now), "low", "a step down: for a week");
  assert.equal(startTier({ tier: "low", at: now - 8 * DAY }, now), "medium", "…then tried again");
});

test("from Medium, the frame rate asked for kept a while while playing: High tried", () => {
  if (deviceQuality() !== "high") return;
  const w = watch();
  w.autoTier = "medium";
  let got = null;
  for (let s = 0; s < ROOM_S - 1; s++) got = w.decide(59, 60, 60, s * 1000);
  assert.equal(got, null, "not yet");
  assert.equal(w.decide(59, 60, 60, ROOM_S * 1000), "high");
  assert.ok(w.trialAt > 0);
});

test("idle (the 30 cap) or short of what's asked says nothing of room", () => {
  const w = watch();
  w.autoTier = "medium";
  for (let s = 0; s < 30; s++) assert.equal(w.decide(30, 30, 60, s * 1000), null, "idle");
  for (let s = 0; s < 30; s++) assert.equal(w.decide(52, 60, 60, s * 1000), null, "at 52 of 60");
});

test("High too much: back down, and no trying again this session; High kept a minute: held", () => {
  if (deviceQuality() !== "high") return;
  const w = watch();
  w.autoTier = "medium";
  for (let s = 0; s <= ROOM_S; s++) w.decide(60, 60, 60, s * 1000);
  w.autoTier = "high";
  let got = null;
  for (let s = 0; s < SLOW_S; s++) got = w.decide(28, 60, 60, 20_000 + s * 1000);
  assert.equal(got, "medium");
  assert.ok(w.noUp);
  w.autoTier = "medium";
  for (let s = 0; s < 60; s++) assert.equal(w.decide(60, 60, 60, 40_000 + s * 1000), null, "not again");
  // (another session: High holds)
  const v = watch();
  v.autoTier = "medium";
  for (let s = 0; s <= ROOM_S; s++) v.decide(60, 60, 60, s * 1000);
  v.autoTier = "high";
  v.decide(58, 60, 60, ROOM_S * 1000 + HOLD_MS);
  assert.equal(v.trialAt, 0, "held");
});

test("down a tier at a time when slow, as before; never under Lowest", () => {
  const w = watch();
  w.autoTier = "low";
  let got = null;
  for (let s = 0; s < SLOW_S; s++) got = w.decide(20, 60, 60, s * 1000);
  assert.equal(got, "lowest");
  w.autoTier = "lowest";
  for (let s = 0; s < 20; s++) assert.equal(w.decide(10, 60, 60, s * 1000), null);
});
