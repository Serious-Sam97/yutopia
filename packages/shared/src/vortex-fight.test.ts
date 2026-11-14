import assert from "node:assert/strict";
import { test } from "node:test";
import { actOf, hurtBy, shooters, VORTEX_FIGHT } from "./vortex-fight.ts";

test("the acts by health left, never back up within a fight", () => {
  assert.equal(actOf(1), 1);
  assert.equal(actOf(0.71), 1);
  assert.equal(actOf(0.7), 2);
  assert.equal(actOf(0.36), 2);
  assert.equal(actOf(0.35), 3);
  assert.equal(actOf(0), 3);
  assert.equal(actOf(0.9, 2), 2, "healed a little mid-fight: still act II");
});

test("his health scales with who's shooting him: the same damage takes less with more of them", () => {
  const now = 100_000;
  assert.equal(shooters([], now), 1);
  assert.equal(shooters([now - 1000, now - 29_000, now - 31_000], now), 2, "the last 30 s");
  const one = hurtBy(1, 150, 1);
  const three = hurtBy(1, 150, 3);
  assert.ok(Math.abs(1 - one - 150 / VORTEX_FIGHT.perShooter) < 1e-9);
  assert.ok(three > one, "three shooting: a bigger pool");
  assert.equal(hurtBy(0.01, 1e6, 1), 0);
});
