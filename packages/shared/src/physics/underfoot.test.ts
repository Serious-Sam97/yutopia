import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { kindFooting } from "../footing.ts";
import { Grid, ZPX_TILE } from "../grid.ts";
import { onLevel } from "../levels.ts";
import { tileAt } from "../map.ts";
import { box3 } from "../shapes/index.ts";
import { type Frame, JoltCollider } from "./body.ts";
import { loadJolt } from "./load.ts";
import { PhysicsWorld, sizesFor } from "./world.ts";

// What the feet stand on, as Jolt has it (docs/plan/63-the-steps.md, phase 1): the top under them
// and what it is — the floor's slab, a desk, a car's roof, the land — at the feet's own height.

const worlds: PhysicsWorld[] = [];
afterEach(() => {
  for (const w of worlds.splice(0)) w.destroy();
});
const FRAME: Frame = { ox: 0, oy: 0, elev: 0 };

async function pad() {
  const world = await PhysicsWorld.create(loadJolt, sizesFor({ statics: 16 }));
  worlds.push(world);
  world.setStatic("slab:0:0,0", [box3(0, 0, 20, 10, -0.2, 0)], "floor");
  world.setStatic("thing:d1", [box3(2, 2, 4, 3, 0, 0.64)]);
  world.setVehicle("car:c1", box3(10, 2, 14.4, 3.8, 0, 1.43));
  world.settle();
  const grid = new Grid(20, 10);
  grid.walk.fill(1);
  grid.top.fill(0);
  return { world, at: new JoltCollider(world, grid, FRAME) };
}

test("the floor, a desk's top, a parked car's roof: each named, at the feet's height", async () => {
  const { at } = await pad();
  assert.deepEqual(at.underfoot(1, 1, 0), { g: at.underfoot(1, 1, 0).g, on: "slab:0:0,0" });
  assert.ok(Math.abs(at.underfoot(1, 1, 0).g) < 0.01, "the floor at 0");
  const desk = at.underfoot(3, 2.5, 0.64);
  assert.equal(desk.on, "thing:d1", "up on the desk");
  assert.ok(Math.abs(desk.g - 0.64) < 0.01, `its top: ${desk.g}`);
  assert.equal(at.underfoot(3, 4.5, 0).on, "slab:0:0,0", "beside it, the floor");
  const car = at.underfoot(12, 2.9, 1.43);
  assert.equal(car.on, "car:c1", "on the car's roof");
  // (the groundAt of the move: the same top)
  assert.ok(Math.abs(at.groundAt(12, 2.9, 1.43) - car.g) < 1e-6);
});

test("a key gone with its body: removed, the floor under it again; a car moved, still its own", async () => {
  const { world, at } = await pad();
  world.remove("thing:d1");
  world.settle();
  assert.equal(at.underfoot(3, 2.5, 0.64).on, "slab:0:0,0");
  world.setVehicle("car:c1", box3(15, 5, 19.4, 6.8, 0, 1.43));
  assert.equal(at.underfoot(17, 6, 1.43).on, "car:c1");
  world.removeVehicle("car:c1");
  assert.equal(at.underfoot(17, 6, 1.43).on, "slab:0:0,0");
});

test("the land, where it's over the floor: the land", async () => {
  const { world, at } = await pad();
  const n = 41;
  world.setLand("land:0,0", { x0: 0, z0: 0, n, step: 0.5, h: new Float32Array(n * n).fill(0.3) });
  world.settle();
  const u = at.underfoot(6, 6, 0.3);
  assert.equal(u.on, "land");
  assert.ok(Math.abs(u.g - 0.3) < 0.01);
  assert.equal(at.underfoot(3, 2.5, 0.64).on, "thing:d1", "the desk's still over it");
});

test("the HQ: a desk stood on is the desk; the floor beside it its tile", async () => {
  const { campusBuilding } = await import("../building.ts");
  const { studio } = await import("../maps/studio.ts");
  const { openingsIntoWalls } = await import("../openings.ts");
  const { splitAll } = await import("../tops.ts");
  const { elevOf, levelMap, offsetOf } = await import("../levels.ts");
  const { standHeight } = await import("../catalog.ts");
  const { buildingSolids, WorldBuilder } = await import("./build.ts");
  const into = openingsIntoWalls(studio, splitAll(studio.objects).objects);
  const cb = campusBuilding(into.map, into.objects);
  assert.ok(cb);
  const map = cb.map;
  const moved = new Map(cb.moved.map((o) => [o.id, o]));
  const objects = [...into.objects.map((o) => moved.get(o.id) ?? o), ...cb.add];
  const b = buildingSolids(map, objects);
  const world = await PhysicsWorld.create(loadJolt, sizesFor({ statics: b.statics.size }));
  worlds.push(world);
  new WorldBuilder(world).building(b);
  world.settle();
  const lm = levelMap(map, 0) ?? map;
  const desk = onLevel(objects, lm).find((o) => o.kind === "desk");
  assert.ok(desk, "a desk on the ground floor");
  const o = offsetOf(map, 0);
  const at = new JoltCollider(world, Grid.from(lm, objects), { ox: o.x, oy: o.y, elev: elevOf(0) });
  const top = (standHeight("desk") ?? 0) / ZPX_TILE;
  // (its footprint's middle: a desk is 2 × 1, turned by rot)
  const [w, h] = (desk.rot ?? 0) % 2 ? [1, 2] : [2, 1];
  const on = at.underfoot(desk.x + w / 2, desk.y + h / 2, top);
  assert.equal(on.on, `thing:${desk.id}`);
  assert.equal(kindFooting("desk"), "wood");
  // a floor tile with nothing on it, near
  let floor: { x: number; y: number } | null = null;
  for (let r = 1; r < 6 && !floor; r++)
    for (const [dx, dy] of [
      [-r, 0],
      [r + w - 1, 0],
      [0, -r],
      [0, r + h - 1],
    ])
      if (
        ".,_:x".includes(tileAt(lm, desk.x + dx, desk.y + dy)) &&
        at.underfoot(desk.x + dx + 0.5, desk.y + dy + 0.5, 0).on.startsWith("slab:")
      ) {
        floor = { x: desk.x + dx, y: desk.y + dy };
        break;
      }
  assert.ok(floor, "the floor beside it is its slab (the caller reads the tile)");
});
