import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { box3 } from "../shapes/index.ts";
import { loadJolt } from "./load.ts";
import { PhysicsWorld, sizesFor } from "./world.ts";

// A big map (docs/plan/91-the-big-map.md phase 7, F2b): Jolt in double precision — a body 150 km out kept to a
// fraction of a millimetre, as one in town (single precision kept it to 1.6 cm there: a walk's 2 cm steps came
// out in 0 or 1.6 cm jerks).

const worlds: PhysicsWorld[] = [];
afterEach(() => {
  for (const w of worlds.splice(0)) w.destroy();
});

for (const X of [20, 150_000, 1_000_000])
  test(`a character ${X / 1000} km out: placed and read back to under 0.1 mm, a walk's small steps kept`, async () => {
    const world = await PhysicsWorld.create(loadJolt, sizesFor({ statics: 8 }));
    worlds.push(world);
    world.setStatic("slab", [box3(X - 20, -20, X + 20, 20, -0.2, 0)], "floor");
    world.settle();
    const id = world.addCharacter(X + 0.123456, 0, 0.654321);
    assert.ok(id !== null);
    const at: [number, number, number] = [0, 0, 0];
    assert.ok(world.characterAt(id, at));
    assert.ok(Math.abs(at[0] - (X + 0.123456)) < 1e-4, `x ${at[0]}`);
    assert.ok(Math.abs(at[2] - 0.654321) < 1e-4, `z ${at[2]}`);
    // 2.3 cm steps (a walk at 60 Hz) placed one after another: each read back as placed
    for (let i = 1; i <= 20; i++) {
      world.placeCharacter(id, X + 0.123456 + i * 0.0233, 0, 0.654321);
      world.characterAt(id, at);
      assert.ok(Math.abs(at[0] - (X + 0.123456 + i * 0.0233)) < 1e-4, `step ${i}: ${at[0]}`);
    }
    // and the ground found under it out there
    const g = world.groundUnder(X + 1.5, 2, 1.5, 0.3, 5);
    assert.ok(g !== null && Math.abs(g) < 1e-3, `ground ${g}`);
  });
