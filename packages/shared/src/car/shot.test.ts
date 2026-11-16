import assert from "node:assert/strict";
import { test } from "node:test";
import { noDamage, PART } from "./damage.ts";
import { addHole, carAlong, levelCar, parseHoles, shotDamage, wireCar } from "./shot.ts";
import { SEDAN } from "./specs.ts";

// a saloon at the origin heading +x (its right: +y), level ground at 0
const car = levelCar(0, 0, 0, 0, SEDAN);
const from = (x: number, y: number, z: number, tx: number, ty: number, tz: number) => {
  const d = { x: tx - x, y: ty - y, z: tz - z };
  const n = Math.hypot(d.x, d.y, d.z);
  return { o: { x, y, z }, d: { x: d.x / n, y: d.y / n, z: d.z / n } };
};

test("a shot from its right side: the windows let it through, the door stops a pellet, not a rifle's round", () => {
  const glass = from(0, 10, 1.2, -0.3, 0, 1.2);
  const g = carAlong(glass.o, glass.d, car, 50, "revolver");
  assert.equal(g?.struck, "glass");
  assert.equal(g?.face, 3);
  assert.ok(g?.through);
  const door = from(-0.4, 10, 0.6, -0.4, 0, 0.6);
  assert.equal(carAlong(door.o, door.d, car, 50, "shotgun")?.struck, "panel");
  assert.equal(carAlong(door.o, door.d, car, 50, "shotgun")?.through, false);
  assert.equal(carAlong(door.o, door.d, car, 50, "ak")?.through, true);
  assert.equal(carAlong(door.o, door.d, car, 50, "revolver")?.through, true);
});

test("its front is cover: the engine block stops a rifle's round; a tyre struck goes flat", () => {
  const nose = from(10, 0, 0.6, 0, 0, 0.6);
  const e = carAlong(nose.o, nose.d, car, 50, "sniper");
  assert.equal(e?.struck, "engine");
  assert.equal(e?.through, false);
  const fl = from(SEDAN.front, -10, SEDAN.wheel.r, SEDAN.front, 0, SEDAN.wheel.r);
  const t = carAlong(fl.o, fl.d, car, 50, "ak");
  assert.equal(t?.struck, "tyre");
  assert.equal(t?.which, 0);
  const dm = noDamage();
  if (t) shotDamage(dm, t);
  assert.ok(dm.parts & PART.flatFL);
});

test("the front struck again and again: steam, then the engine dies", () => {
  const nose = from(10, 0.2, 0.55, 0, 0.2, 0.55);
  const dm = noDamage();
  let shots = 0;
  while (!(dm.parts & PART.engineDead) && shots < 40) {
    const h = carAlong(nose.o, nose.d, car, 50, "revolver");
    if (h) shotDamage(dm, h);
    shots++;
  }
  assert.ok(dm.parts & PART.engineDead, "dead");
  assert.ok(shots >= 10 && shots <= 20, `${shots} shots`);
});

test("a miss, a shot from inside, the wire's pose; the holes kept", () => {
  const over = from(0, 10, 3, 0, -10, 3);
  assert.equal(carAlong(over.o, over.d, car, 50, "ak"), null);
  const inside = from(0, 0, 1, 0, 10, 1);
  assert.equal(carAlong(inside.o, inside.d, car, 50, "ak"), null);
  // (identity in the view's frame: x forward, z its right → the server's x, y)
  const w = wireCar(0, SEDAN.cog, 0, [0, 0, 0, 1], SEDAN);
  assert.deepEqual(w.fwd, [1, 0, 0]);
  assert.deepEqual(w.right, [0, 1, 0]);
  assert.deepEqual(w.up, [0, 0, 1]);
  const glass = from(0, 10, 1.2, -0.3, 0, 1.2);
  const g = carAlong(glass.o, glass.d, car, 50, "ak");
  let s = "";
  for (let i = 0; i < 40 && g; i++) s = addHole(s, g);
  assert.equal(parseHoles(s).length, 32);
});
