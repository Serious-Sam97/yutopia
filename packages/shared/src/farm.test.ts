import assert from "node:assert/strict";
import { test } from "node:test";
import { lootSpot } from "./dark/loot.ts";
import {
  BUILDINGS,
  CORN,
  FARM,
  groundSurfaceAt,
  heightAt,
  insideOf,
  placeAt,
  SCARECROWS,
  TRACTOR,
  treeDensity,
  treesIn,
  walkableTile,
  wallEdgeAt,
} from "./grounds.ts";

// The farm (docs/plan/31-the-day.md, phase 1): across the river, south of Main
// Street — a lane down from the square to the barn's doors and the farmhouse,
// the barn walked into, the cornfield walked through, the tractor in the way.

const walk = (x: number, z: number) => walkableTile(Math.floor(x), Math.floor(z));

test("the farm: cleared, flat, the lane from the square to the barn and the farmhouse", () => {
  // no trees anywhere on it
  for (let cx = Math.floor(FARM.x0 / 32); cx <= Math.floor(FARM.x1 / 32); cx++)
    for (let cz = Math.floor(FARM.z0 / 32); cz <= Math.floor(FARM.z1 / 32); cz++)
      for (const t of treesIn(cx, cz))
        assert.ok(
          t.x < FARM.x0 - 3 || t.x > FARM.x1 + 3 || t.z < FARM.z0 - 3 || t.z > FARM.z1 + 3,
          `a tree at ${t.x}, ${t.z}`,
        );
  assert.equal(treeDensity(380, -260), 0);
  // flat as the town (the snow's own bumps aside)
  const h0 = heightAt(420, -300);
  for (const [x, z] of [
    [350, -320],
    [500, -210],
    [440, -330],
  ])
    assert.ok(Math.abs(heightAt(x, z) - h0) < 1, `${x}, ${z}: ${heightAt(x, z)} vs ${h0}`);
  // the lane: a path from the square's edge down to the barn's doors and on to the farmhouse
  assert.equal(groundSurfaceAt(420.5, -368.5), "path");
  assert.equal(groundSurfaceAt(434.5, -311.5), "path");
  assert.equal(placeAt(380, -260).name, "The cornfield");
  assert.equal(placeAt(470, -240).name, "The farm");
});

test("the barn: walked into by its doors (west), round its stalls and hay; the silo shut", () => {
  const barn = BUILDINGS.find((b) => b.kind === "barn");
  assert.ok(barn);
  assert.ok(insideOf(barn), "you walk in");
  assert.ok(walk(barn.x0 - 1, -311) && walk(barn.x0 + 1, -311), "through the doors");
  assert.ok(wallEdgeAt("v", barn.x0, -316), "the wall beside them");
  assert.ok(!wallEdgeAt("v", barn.x0, -311), "the doorway");
  const silo = BUILDINGS.find((x) => x.kind === "silo");
  assert.ok(silo && !insideOf(silo));
  assert.ok(!walk((silo.x0 + silo.x1) / 2, (silo.z0 + silo.z1) / 2), "the silo is solid");
});

test("the farmhouse: in by its front door (north), its rooms furnished — round the sofa, the bed, the stove", () => {
  const h = BUILDINGS.find((b) => b.kind === "farmhouse");
  assert.ok(h);
  const ins = insideOf(h);
  assert.ok(ins, "you walk in");
  const xm = Math.round((h.x0 + h.x1) / 2);
  assert.ok(!wallEdgeAt("h", xm, h.z0), "the doorway");
  assert.ok(wallEdgeAt("h", h.x0 + 2, h.z0), "the wall beside it");
  assert.ok(walk(xm, h.z0 - 1) && walk(xm, h.z0 + 1), "through the door");
  const kinds = new Set(ins.fits.map((f) => f.kind));
  for (const k of [
    "sofa",
    "armchair",
    "fireplace",
    "bookshelf",
    "stove",
    "fridge",
    "counter",
    "table",
    "bed",
    "wardrobe",
    "rug",
  ])
    assert.ok(kinds.has(k as never), `a ${k}`);
  // the furniture's in the way (the rug isn't), and the room between it is walked
  const sofa = ins.fits.find((f) => f.kind === "sofa") as (typeof ins.fits)[number];
  assert.ok(!walk(sofa.x + 0.5, sofa.z + 1));
  const rug = ins.fits.find((f) => f.kind === "rug") as (typeof ins.fits)[number];
  assert.ok(walk(rug.x + 3.2, rug.z + 0.5), "the rug's walked on");
  assert.ok(walk(xm, (h.z0 + h.z1) / 2), "the middle of the room");
});

test("the cornfield is walked through; the scarecrows are in the way (the tractor's a vehicle now: parked, the grid's)", () => {
  for (let x = CORN.x0 + 1; x < CORN.x1 - 1; x += 7)
    for (let z = CORN.z0 + 1; z < CORN.z1 - 1; z += 9) {
      if (SCARECROWS.some((c) => Math.abs(c.x - x) < 1 && Math.abs(c.z - z) < 1)) continue;
      assert.ok(walk(x, z), `the field at ${x}, ${z}`);
    }
  assert.ok(walk(TRACTOR.x, TRACTOR.z), "where the tractor parks: the land itself");
  for (const c of SCARECROWS) assert.ok(!walk(c.x, c.z), "a scarecrow");
});

test("the farm's loot: the barn's workbench, the farmhouse's kitchen counter, the tractor's toolbox — all reached", () => {
  for (const id of ["barn", "farmhouse", "tractor"]) {
    const s = lootSpot(id);
    assert.ok(s, id);
    assert.ok(walk(s.x, s.z), `${id} at ${s.x.toFixed(1)}, ${s.z.toFixed(1)}`);
  }
});
