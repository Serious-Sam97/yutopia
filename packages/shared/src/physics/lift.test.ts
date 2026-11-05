import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import type { WorldObjectDef } from "../catalog.ts";
import { getMap } from "../index.ts";
import { elevOf, floorOf, levelMap } from "../levels.ts";
import { carElev, liftCarBody, liftRect, liftShafts, rideAt, shaftAt } from "../lift.ts";
import { floorAt, wellsOf } from "../stairs.ts";
import { finishWorld } from "../structure/finish.ts";
import { STOREY } from "../units.ts";
import { slabsOf } from "./place.ts";
import { type TestWorld, testWorld } from "./testing.ts";

// Lifts as moving platforms (docs/plan/72-the-3d-core.md, phase 8): the shaft open through every
// floor it goes through, its walls the storey's height and its landings' doors shut but where the
// car stands open; the car a body in Jolt where it is, and whoever stands on it carried by it —
// not held at its height.

const made: TestWorld[] = [];
afterEach(() => {
  for (const w of made.splice(0)) w.dispose();
});

// the campus, its car A at the ground floor with its doors shut
function campus(at = 0, door = "closed") {
  const studio = getMap("studio");
  const done = finishWorld(studio, studio.objects, { fresh: true, building: true });
  const objects: WorldObjectDef[] = done.objects.map((o) =>
    o.kind === "elevator" ? { ...o, props: { ...(o.props ?? {}), at, door } } : o,
  );
  const shafts = liftShafts(objects, done.map);
  const a = shafts.get("A");
  assert.ok(a && a.length >= 3, "car A stops on three floors or more");
  return { map: done.map, objects, shafts, a };
}

test("the shaft: open through the floors it goes through, the car's floor and ceiling its own", async () => {
  const { map, objects, shafts, a } = campus();
  const t = await testWorld(map, objects);
  made.push(t);
  const [x0, y0, x1, y1] = liftRect(a[0].o);
  const mid = { x: (x0 + x1) / 2, y: (y0 + y1) / 2 };
  const top = a[a.length - 1].level;
  // (no car in it yet: nothing under you in it on a floor above the lowest — the floor below is
  // a storey down)
  for (const { level } of a.slice(1)) {
    const g = t.world.groundUnder(mid.x, elevOf(level) + 0.3, mid.y, 0.05, 0.9, "all");
    assert.equal(g, null, `floor ${level}: open over the shaft`);
  }
  // the lowest floor's slab is there (it goes no further down)
  const g0 = t.world.groundUnder(mid.x, elevOf(a[0].level) + 0.3, mid.y, 0.05, 0.9, "all");
  assert.ok(g0 !== null && Math.abs(g0 - elevOf(a[0].level)) < 0.01, "the lowest floor's slab under it");
  // the car in: its floor where it is, named
  const car = liftCarBody(a[0].o, carElev(2));
  assert.ok(t.world.setCarrier(car.key, car.solids, ...car.at));
  const g2 = t.world.groundUnder(mid.x, elevOf(2) + 0.3, mid.y, 0.05, 0.9, "all");
  assert.ok(g2 !== null && Math.abs(g2 - elevOf(2)) < 0.01, `its floor at floor 2: ${g2}`);
  assert.equal(t.world.underKey(), "liftcar:A");
  // what's floor in a shaft: every floor it goes through, wherever the car is (riding, the floor
  // it's passing — never "out of the building")
  const slab = slabsOf(t.world, () => false, shaftAt(shafts));
  for (let l = a[0].level; l <= top; l++) assert.ok(slab(l, mid), `floor ${l} has a floor in the shaft`);
  // the drawing's holes: the floors above the lowest have none over the shaft; the ceilings below
  // the top none under it
  const key = `${Math.floor(mid.x)},${Math.floor(mid.y)}`;
  for (const { level } of a) {
    const lm = levelMap(map, level);
    assert.ok(lm);
    assert.equal(wellsOf(lm, objects).has(key), level > a[0].level, `floor ${level}'s floor`);
    assert.equal(wellsOf(lm, objects, "ceiling").has(key), level < top, `floor ${level}'s ceiling`);
  }
});

test("a ride: standing in the car, carried up the shaft by its floor — floor after floor, onto floor 2", async () => {
  const { map, objects, shafts, a } = campus();
  const t = await testWorld(map, objects);
  made.push(t);
  const w = t.world;
  const [x0, y0, x1, y1] = liftRect(a[0].o);
  const mid = { x: (x0 + x1) / 2, y: (y0 + y1) / 2 };
  const slab = slabsOf(w, () => false, shaftAt(shafts));
  const put = (car: number) => {
    const b = liftCarBody(a[0].o, carElev(car));
    assert.ok(w.setCarrier(b.key, b.solids, ...b.at));
  };
  put(0);
  const id = w.addCharacter(mid.x, 0.02, mid.y);
  assert.ok(id !== null);
  const p: [number, number, number] = [0, 0, 0];
  // settled on its floor
  for (let i = 0; i < 10; i++) w.moveCharacter(id, 0, 0, 0, 1 / 60, true);
  w.characterAt(id, p);
  assert.ok(Math.abs(p[1]) < 0.02, `on the car's floor at the ground: ${p[1]}`);
  // up two floors as the server's ride goes (an S-curve), sixty frames a second: the body's own
  // move asked to stand still each frame — the car carries it
  let level = floorOf(map);
  const len = 3.1;
  const seen = new Set<number>();
  let worst = 0;
  for (let k = 1; k <= Math.ceil(len * 60) + 30; k++) {
    const car = rideAt(0, 2, k / 60, len);
    put(car);
    w.moveCharacter(id, 0, 0, 0, 1 / 60, true);
    w.characterAt(id, p);
    worst = Math.max(worst, Math.abs(p[1] - carElev(car)));
    // its floor from its height (as the walker asks: stairs.ts floorAt)
    const ch = floorAt(map, level, { x: p[0], y: p[2] }, p[1] - elevOf(level), slab);
    if (ch) level = ch.level;
    seen.add(level);
  }
  assert.ok(worst < 1e-4, `on the car's floor all the way (worst ${worst.toFixed(5)} m off it)`);
  assert.ok(Math.abs(p[1] - 2 * STOREY) < 0.02, `up at floor 2's height: ${p[1]}`);
  assert.equal(level, 2, "on floor 2");
  assert.deepEqual([...seen].sort(), [0, 1, 2], "through floor 1 on the way");
  assert.ok(Math.hypot(p[0] - mid.x, p[2] - mid.y) < 0.01, "where it stood in the car");
  // a tab that slept while the car went on up two floors (no frames meanwhile): with it, at once
  put(4);
  w.moveCharacter(id, 0, 0, 0, 1 / 60, true);
  w.characterAt(id, p);
  assert.ok(Math.abs(p[1] - 4 * STOREY) < 0.02, `up at floor 4's height with it: ${p[1]}`);
  put(2);
  w.moveCharacter(id, 0, 0, 0, 1 / 60, true);
  // and down again to the ground
  for (let k = 1; k <= Math.ceil(len * 60) + 30; k++) {
    put(rideAt(2, 0, k / 60, len));
    w.moveCharacter(id, 0, 0, 0, 1 / 60, true);
  }
  w.characterAt(id, p);
  assert.ok(Math.abs(p[1]) < 0.02, `back down on the ground floor's height: ${p[1]}`);
});

test("the landing: its doors shut, a wall the storey's height; open where the car stands open", async () => {
  const shut = campus(0, "closed");
  const t = await testWorld(shut.map, shut.objects);
  made.push(t);
  const stop1 = shut.a.find((s) => s.level === 1);
  assert.ok(stop1);
  const [x0, y0, x1, y1] = liftRect(stop1.o);
  // (at the doors' middle, a body's height over floor 1: in the wall — the car's on the ground)
  const fitsAt = (w: TestWorld, l: number, z: number) => {
    const doors = [
      { x: (x0 + x1) / 2, y: y0 },
      { x: x1, y: (y0 + y1) / 2 },
      { x: (x0 + x1) / 2, y: y1 },
      { x: x0, y: (y0 + y1) / 2 },
    ];
    return doors.map((d) => w.world.fits(d.x, elevOf(l) + z, d.y, 0.05, 0.1));
  };
  // every side shut on floor 1, up to the next floor (nothing slips out between them)
  assert.deepEqual(fitsAt(t, 1, 1), [false, false, false, false], "floor 1: walls and shut doors");
  assert.deepEqual(fitsAt(t, 1, STOREY - 0.35), [false, false, false, false], "and on up to floor 2's slab");
  // the car at floor 1, its doors open: one side's a way in there (to 2.3 m)
  const open = campus(1, "open");
  const t2 = await testWorld(open.map, open.objects);
  made.push(t2);
  const sides = fitsAt(t2, 1, 1);
  assert.equal(sides.filter((f) => f).length, 1, `one way in: ${sides}`);
  assert.deepEqual(fitsAt(t2, 1, 2.6), [false, false, false, false], "over the doors, the wall");
  assert.deepEqual(fitsAt(t2, 0, 1), [false, false, false, false], "on the ground floor (the car's not there): shut");
});
