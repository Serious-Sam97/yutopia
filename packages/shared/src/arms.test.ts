import assert from "node:assert/strict";
import { test } from "node:test";
import { ARMS, BODY, FLARE, flareFlight, pellets, rayMeets } from "./dark/arms.ts";
import { newShade, wound } from "./dark/fsm.ts";

const at = (yaw: number, pitch = 0) => ({ x: 0, y: 0, z: 1.3, yaw, pitch });

test("a ray meets a body ahead, not one beside it, behind it, past the range or over its head", () => {
  assert.ok(Math.abs((rayMeets(at(0), 10, 0, 0, 40) ?? -1) - (10 - BODY.r)) < 1e-6);
  assert.equal(rayMeets(at(0), 10, 1, 0, 40), null, "a tile aside");
  assert.ok(rayMeets(at(0), 10, 0.3, 0, 40) !== null, "its edge");
  assert.equal(rayMeets(at(Math.PI), 10, 0, 0, 40), null, "behind");
  assert.equal(rayMeets(at(0), 50, 0, 0, 40), null, "past the range");
  assert.equal(rayMeets(at(0, 0.5), 10, 0, 0, 40), null, "over its head");
  assert.ok(rayMeets(at(0, -0.12), 8, 0, 0, 40) !== null, "aimed down at it");
  assert.ok(rayMeets(at(0), 10, 0.6, 0, 40, 0.3) !== null, "with some slack");
});

test("pellets: the revolver's one on the aim, the shotgun's eight spread, the same from the same seed", () => {
  const r = pellets("revolver", 1, 0, 42);
  assert.equal(r.length, 1);
  assert.ok(Math.abs(r[0].yaw - 1) <= ARMS.revolver.spread);
  const s = pellets("shotgun", 1, 0.1, 42);
  assert.equal(s.length, 8);
  for (const p of s) assert.ok(Math.hypot(p.yaw - 1, p.pitch - 0.1) <= ARMS.shotgun.spread + 1e-9);
  assert.deepEqual(pellets("shotgun", 1, 0.1, 42), s);
  assert.notDeepEqual(pellets("shotgun", 1, 0.1, 43), s);
});

test("a flare thrown lands some tiles ahead on the ground, or drops at a wall", () => {
  const flat = flareFlight(
    0,
    0,
    FLARE.hand,
    0,
    0,
    () => 0,
    () => false,
  );
  assert.ok(flat.x > 4 && flat.x < 9 && Math.abs(flat.y) < 1e-9, `${flat.x}`);
  assert.ok(flat.secs > 0.4 && flat.secs < FLARE.max);
  const up = flareFlight(
    0,
    0,
    FLARE.hand,
    0,
    0.4,
    () => 0,
    () => false,
  );
  assert.ok(up.x > flat.x, "thrown higher, further");
  const wall = flareFlight(
    0,
    0,
    FLARE.hand,
    0,
    0,
    () => 0,
    (x) => x > 3,
  );
  assert.ok(wall.x <= 3 && wall.x > 2.5, `${wall.x}`);
});

test("only an exposed one is hurt; two revolver rounds put it down", () => {
  const s = newShade(0, 0, 0);
  assert.equal(wound(s, ARMS.revolver.damage, 1), "spark");
  assert.equal(s.hp, 100);
  s.state = "exposed";
  assert.equal(wound(s, ARMS.revolver.damage, 1), "hurt");
  assert.equal(wound(s, ARMS.revolver.damage, 1.2), "killed");
  assert.equal(s.state, "dissolve");
  assert.equal(s.killed, true);
});
