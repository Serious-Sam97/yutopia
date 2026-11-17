import assert from "node:assert/strict";
import { test } from "node:test";
import { DOOR_STOP, swingDoor } from "./door";

const run = (a: number, acc: { x: number; y: number; z: number }, s: number, vx = 0) => {
  let st = { a, w: 0, latched: false, hit: 0 };
  let latched = false;
  for (let i = 0; i < s * 60; i++) {
    st = swingDoor(st.a, st.w, acc, 1, 1 / 60, vx);
    if (st.latched) latched = true;
  }
  return { ...st, latched };
};

test("(plan 98) a door let go: still on a car at rest; flung open braking; slammed shut pulling away; shut by the air", () => {
  // at rest: where it was left
  assert.equal(run(0.7, { x: 0, y: 0, z: 0 }, 2).a, 0.7);
  // braking hard (the car's acceleration toward its tail): open to its stop
  assert.ok(run(0.3, { x: 6, y: 0, z: 0 }, 1.5).a > DOOR_STOP - 0.1, "to its stop");
  // pulling away: shut, latched
  const away = run(0.8, { x: -4, y: 0, z: 0 }, 2);
  assert.equal(away.a, 0);
  assert.ok(away.latched, "latched");
  // forward at 15 m/s, no acceleration: the air shuts it
  assert.ok(run(0.6, { x: 0, y: 0, z: 0 }, 3, -15).a < 0.05, "pressed shut");
});
