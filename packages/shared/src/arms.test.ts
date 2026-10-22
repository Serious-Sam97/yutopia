import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ARMS,
  atHead,
  BODY,
  bloomCalm,
  bloomShot,
  damageAt,
  FLARE,
  falloff,
  flareFlight,
  HEAD,
  inFlare,
  pastAt,
  pellets,
  pvpDamage,
  rayMeets,
  spreadOf,
} from "./dark/arms.ts";
import { newShade, SHADE, wound } from "./dark/fsm.ts";

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

test("only an exposed one is hurt; five revolver rounds put it down (four at the head)", () => {
  const s = newShade(0, 0, 0);
  assert.equal(wound(s, ARMS.revolver.damage, 1), "spark");
  assert.equal(s.hp, SHADE.hp);
  s.state = "exposed";
  for (let i = 0; i < 4; i++) assert.equal(wound(s, ARMS.revolver.damage, 1 + i * 0.5), "hurt");
  assert.equal(wound(s, ARMS.revolver.damage, 3.2), "killed");
  const h = newShade(0, 0, 0);
  h.state = "exposed";
  for (let i = 0; i < 3; i++) assert.equal(wound(h, damageAt("revolver", ARMS.revolver.damage, 8, true), 1), "hurt");
  assert.equal(wound(h, damageAt("revolver", ARMS.revolver.damage, 8, true), 1), "killed");
  assert.equal(s.state, "dissolve");
  assert.equal(s.killed, true);
});

test("one of us shot: half the shadowed's; a crouched body is shorter; where one was a moment ago", () => {
  assert.equal(pvpDamage("revolver"), 25);
  assert.equal(pvpDamage("shotgun"), 9);
  const r = { x: 0, y: 0, z: 1.5, yaw: 0, pitch: 0 };
  assert.ok(rayMeets(r, 5, 0, 0, 40) !== null, "standing: at the chest");
  assert.equal(rayMeets(r, 5, 0, 0, 40, 0, 1.25), null, "crouched: over its head");
  const hist = [
    { t: 0, x: 0, y: 0, z: 0 },
    { t: 100, x: 1, y: 0, z: 0 },
    { t: 200, x: 1, y: 2, z: 0.5 },
  ];
  assert.deepEqual(pastAt(hist, 50)?.x, 0.5);
  assert.equal(pastAt(hist, 150)?.y, 1);
  assert.equal(pastAt(hist, -10)?.x, 0, "before: the first");
  assert.equal(pastAt(hist, 900)?.y, 2, "after: the last");
  assert.equal(pastAt([], 0), null);
  // a flare's light is its floor's
  assert.ok(inFlare({ x: 0, y: 0 }, 1, 1));
  assert.ok(!inFlare({ x: 0, y: 0, level: 4 }, 1, 1), "upstairs: not the snow's");
  assert.ok(inFlare({ x: 0, y: 0, level: 4 }, 1, 1, 4));
});

// ── the feel's rules (docs/plan/32-the-arms.md) ──────────────────────────────
test("falloff: the double-barrel full to 5 tiles, 40% at its 14; the revolver flat", () => {
  assert.equal(falloff("shotgun", 3), 1);
  assert.equal(falloff("shotgun", 5), 1);
  assert.ok(Math.abs(falloff("shotgun", 9.5) - 0.7) < 1e-9);
  assert.ok(Math.abs(falloff("shotgun", 14) - 0.4) < 1e-9);
  assert.equal(falloff("revolver", 39), 1);
  assert.equal(damageAt("shotgun", ARMS.shotgun.damage, 14, false), Math.round(18 * 0.4));
});

test("the head: the top of a body takes half again", () => {
  const ray = (z: number, pitch = 0) => ({ x: 0, y: 0, z, yaw: 0, pitch });
  const t = rayMeets(ray(1.7), 10, 0, 0, 40) ?? -1;
  assert.ok(atHead(ray(1.7), t, 0), "level at 1.7 on a 1.8 body: the head");
  assert.ok(!atHead(ray(1.0), t, 0), "at the chest: not");
  assert.ok(atHead(ray(1.1), t, 0, 1.25), "one crouched, at 1.1: the head");
  assert.equal(damageAt("revolver", 50, 10, true), 75);
  assert.equal(damageAt("revolver", pvpDamage("revolver"), 10, true), Math.round(25 * HEAD.mult));
  assert.equal(BODY.h * (1 - HEAD.share), 1.5);
});

test("the spread: its own still and aimed; more moving, from the hip, winded; less crouched", () => {
  const still = { speed: 0, crouch: false, aim: true, winded: false };
  assert.equal(spreadOf("revolver", 0, still), ARMS.revolver.spread);
  assert.ok(spreadOf("revolver", 0, { ...still, speed: 1.4 }) > ARMS.revolver.spread);
  assert.ok(spreadOf("revolver", 0, { ...still, speed: 6 }) > spreadOf("revolver", 0, { ...still, speed: 4 }) + 0.02);
  assert.ok(spreadOf("revolver", 0, { ...still, crouch: true }) < ARMS.revolver.spread);
  assert.ok(spreadOf("revolver", 0, { ...still, aim: false }) > ARMS.revolver.spread);
  assert.ok(spreadOf("revolver", 0, { ...still, winded: true }) > ARMS.revolver.spread);
  assert.ok(spreadOf("revolver", 0.02, still) > ARMS.revolver.spread + 0.019);
});

test("the bloom: each shot adds, to a cap; it calms", () => {
  let b = 0;
  for (let i = 0; i < 10; i++) b = bloomShot("revolver", bloomCalm("revolver", b, 0.1));
  assert.ok(Math.abs(b - ARMS.revolver.bloomMax) < 1e-9, "capped");
  assert.ok(bloomCalm("revolver", b, 1) < b * 0.2, "a second later, mostly gone");
  assert.equal(bloomCalm("revolver", b, 0), b);
});

test("pellets: the spread given, not the gun's own", () => {
  for (const p of pellets("shotgun", 0, 0, 5, 0.2)) assert.ok(Math.hypot(p.yaw, p.pitch) <= 0.2 + 1e-9);
  const wide = pellets("shotgun", 0, 0, 5, 0.2).some((p) => Math.hypot(p.yaw, p.pitch) > ARMS.shotgun.spread);
  assert.ok(wide, "some go wider than its own 0.09");
});
