import assert from "node:assert/strict";
import { test } from "node:test";
import { deviceQuality, gpuKindOf, type Quality } from "@/lib/prefs";
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

test("down a tier at a time when slow; to potato under lowest (plan 90), never under it", () => {
  const w = watch();
  w.autoTier = "low";
  let got = null;
  for (let s = 0; s < SLOW_S; s++) got = w.decide(25, 60, 60, s * 1000);
  assert.equal(got, "lowest");
  w.autoTier = "lowest";
  w.slowFor = 0;
  got = null;
  for (let s = 0; s < SLOW_S && !got; s++) got = w.decide(25, 60, 60, s * 1000);
  assert.equal(got, "potato");
  w.autoTier = "potato";
  for (let s = 0; s < 20; s++) assert.equal(w.decide(5, 60, 60, s * 1000), null);
});

test("far under (under 20 fps): down in 2 s, not 6", () => {
  const w = watch();
  w.autoTier = "medium";
  const at: (Quality | null)[] = [];
  for (let s = 0; s < 3; s++) at.push(w.decide(8, 60, 60, s * 1000));
  assert.deepEqual(at, [null, "low", null]);
});

test("a GPU by its name: integrated Intel and AMD weak, software said so, the rest ok", () => {
  for (const n of [
    "ANGLE (Intel, Intel(R) UHD Graphics (0x00009B41) Direct3D11 vs_5_0 ps_5_0, D3D11)",
    "ANGLE (AMD, AMD Radeon(TM) Graphics (0x00001636) Direct3D11 vs_5_0 ps_5_0, D3D11)",
    "ANGLE (AMD, AMD Radeon Graphics (renoir, LLVM 15.0.7, DRM 3.54, 6.5.0), OpenGL ES 3.2)",
  ])
    assert.equal(gpuKindOf(n), "weak", n);
  for (const n of ["ANGLE (Microsoft, Microsoft Basic Render Driver (0x0000008C) Direct3D11)", "Google SwiftShader"])
    assert.equal(gpuKindOf(n), "software", n);
  for (const n of [
    "ANGLE (Apple, ANGLE Metal Renderer: Apple M1, Unspecified Version)",
    "ANGLE (NVIDIA, NVIDIA GeForce GTX 1060 6GB (0x00001C03) Direct3D11 vs_5_0 ps_5_0, D3D11)",
    "ANGLE (AMD, AMD Radeon RX 6650 XT (0x000073EF) Direct3D11 vs_5_0 ps_5_0, D3D11)",
    "ANGLE (Intel, Intel(R) Iris(R) Xe Graphics (0x00009A49) Direct3D11 vs_5_0 ps_5_0, D3D11)",
    "Apple M1, or similar",
  ])
    assert.equal(gpuKindOf(n), "ok", n);
});
