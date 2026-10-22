import assert from "node:assert/strict";
import { test } from "node:test";
import { aimPitch, flightAt, flyStep, heldBall, launch, PBALL, restOf, settleAt } from "./pool-throw.ts";

const flat = () => 0;
const open = () => false;

test("a throw aimed with aimPitch lands where it was aimed", () => {
  for (const [d, dz] of [
    [3, 0],
    [6, -0.5],
    [8, 0.3],
  ]) {
    const pitch = aimPitch(d, dz, PBALL.throwSpeed);
    const f = launch(0, 0, 0, 0.4, pitch, PBALL.throwSpeed);
    // when it's d out along its way: at dz
    const t = d / Math.hypot(f.vx, f.vy);
    const p = flightAt(f, t);
    assert.ok(Math.abs(Math.hypot(p.x, p.y) - d) < 1e-6);
    assert.ok(Math.abs(p.z - dz) < 1e-6, `${d}, ${dz}: ${p.z}`);
  }
  // out of reach: 45°
  assert.equal(aimPitch(100, 0, 5), Math.PI / 4);
});

test("a ball meets the first one in its way, not the thrower; a wall or the floor stops it", () => {
  const f = launch(0, 0, PBALL.hand, 0, 0, PBALL.throwSpeed);
  const people = [
    { id: "me", x: 0, y: 0, z: 0, h: 1.8 },
    { id: "far", x: 6, y: 0, z: 0, h: 1.8 },
    { id: "near", x: 3, y: 0.1, z: 0, h: 1.8 },
    { id: "aside", x: 2, y: 1.5, z: 0, h: 1.8 },
  ];
  const s = flyStep(f, 0, 2, people, flat, open, "me");
  assert.equal(s?.kind, "person");
  assert.equal(s?.id, "near");
  assert.ok((s?.t ?? 0) > 0.2 && (s?.t ?? 1) < 0.26);
  // in steps, as the server flies it: nothing in the first 0.1 s, then the same one
  assert.equal(flyStep(f, 0, 0.1, people, flat, open, "me"), null);
  assert.equal(flyStep(f, 0.1, 2, people, flat, open, "me")?.id, "near");
  // over someone's head: missed
  const high = launch(0, 0, 2.6, 0, 0.1, PBALL.throwSpeed);
  assert.notEqual(flyStep(high, 0, 0.3, [{ id: "a", x: 2, y: 0, z: 0, h: 1.8 }], flat, open)?.kind, "person");
  // a wall at x 2
  const w = flyStep(f, 0, 2, [], flat, (x) => x > 2, "me");
  assert.equal(w?.kind, "wall");
  assert.ok(Math.abs((w?.x ?? 0) - 2) < 0.15);
  // the floor
  const down = flyStep(launch(0, 0, 1, 0, -0.5, 6), 0, 2, [], flat, open);
  assert.equal(down?.kind, "ground");
  assert.ok(Math.abs((down?.z ?? 0) - PBALL.r) < 1e-9);
});

test("a stopped ball rests on the floor, never in the wall it hit", () => {
  const f = launch(0, 0, 1.35, 0, 0, 12);
  const wall = (x: number) => x > 2;
  const s = flyStep(f, 0, 2, [], flat, wall);
  assert.ok(s);
  const r = restOf(f, s, flat, wall);
  assert.ok(r.x < 2 && !wall(r.x));
  assert.equal(r.z, PBALL.r);
  // it settles there, from where it stopped
  const a = settleAt(s, r, 0);
  assert.ok(Math.abs(a.z - s.z) < 1e-9);
  const b = settleAt(s, r, 10);
  assert.ok(Math.abs(b.x - r.x) < 1e-9 && Math.abs(b.z - r.z) < 1e-9);
});

test("a ball in the hand", () => {
  assert.equal(heldBall("pball:8"), 8);
  assert.equal(heldBall("pball:15"), 15);
  assert.equal(heldBall("mug"), -1);
  assert.equal(heldBall(""), -1);
});
