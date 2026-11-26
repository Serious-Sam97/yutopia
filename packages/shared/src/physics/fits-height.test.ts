import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { blankMap } from "../map-edit.ts";
import { box3 } from "../shapes/index.ts";
import { loadJolt } from "./load.ts";
import { Place } from "./place.ts";
import { PhysicsWorld, sizesFor } from "./world.ts";

// A body's height in `fits` (plan 129): a person's by default; an animal's own — a cat goes under a bench's seat, a
// deer (or a person) doesn't; a wall stops them all.

const worlds: PhysicsWorld[] = [];
afterEach(() => {
  for (const w of worlds.splice(0)) w.destroy();
});

test("fits: a cat under a bench's seat, not a person or a deer; a wall stops all", async () => {
  const world = await PhysicsWorld.create(loadJolt, sizesFor({ statics: 16 }));
  worlds.push(world);
  world.setStatic("slab", [box3(0, 0, 12, 12, -0.2, 0)], "floor");
  // a bench's seat 0.42–0.48 m up over (4..6, 4..5), a wall at x 9
  // and a low rail 0.13–0.2 m up over (2..3, 8..9)
  world.setStatic("things", [box3(4, 4, 6, 5, 0.42, 0.48), box3(9, 0, 9.2, 12, 0, 2.5), box3(2, 8, 3, 9, 0.13, 0.2)]);
  world.settle();
  const place = new Place(world, blankMap("pad", "pad", 12, 12), []);
  assert.equal(place.fits(5, 4.5, 0.15), false, "a person: under the seat is too low");
  assert.equal(place.fits(5, 4.5, 0.15, 0.36), true, "a cat (0.3 m back) goes under it");
  assert.equal(place.fits(5, 4.5, 0.3, 1.2), false, "a deer doesn't");
  assert.equal(place.fits(2, 2, 0.15, 0.36), true, "out in the open");
  assert.equal(place.fits(9.1, 6, 0.15, 0.36), false, "a wall stops a cat too");
  // (a small body's box is its own height, not lifted a person's step off the ground over it)
  assert.equal(place.fits(2.5, 8.5, 0.05, 0.1), true, "a frog (0.1 m) under a low rail");
  assert.equal(place.fits(2.5, 8.5, 0.15, 0.36), false, "a cat not");
  assert.equal(place.fits(9.1, 6, 0.05, 0.1), false, "a wall stops a frog");
});
