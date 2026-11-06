import assert from "node:assert/strict";
import { test } from "node:test";
import {
  applyEdits,
  checkEdits,
  groundSurfaceAt,
  heightAt,
  iceAt,
  terrainAt,
  treeDensity,
  WAYS,
  walkableCell,
  waterAt,
} from "./grounds.ts";
import { type GroundsEdits, type GrowDef, NO_EDITS } from "./grounds-edits.ts";
import { chunkHash } from "./grounds-hash.ts";
import { GROW_BIOMES } from "./grow.ts";
import { landRegions } from "./land.ts";

// God mode grows the land (docs/plan/69-the-long-road.md, phase 10): a piece added south of the
// town, past where the ridges rose — walked into, by its biome, the rules, and taken away again.

/** South of the town: over the core's south edge (z 172) and on out 470 m. */
const SOUTH = { x0: -96, z0: 128, x1: 160, z1: 640 };
const piece = (biome: GrowDef["biome"], over: Partial<GrowDef> = {}): GrowDef => ({
  key: `god-${biome}`,
  biome,
  ...SOUTH,
  ...over,
});
const edits = (rev: number, ...land: GrowDef[]): GroundsEdits => ({ rev, land: { add: land } });
const MID = { x: 32, z: 420 };

test("none grown: the land's as it was; a piece laid is land you walk into, and taken away again", () => {
  applyEdits(NO_EDITS);
  const regions = landRegions().length;
  const was = { walk: walkableCell(MID.x, MID.z), h: terrainAt(MID.x, MID.z), chunk: chunkHash(1, 13) };
  assert.equal(was.walk, false, "past the edge: scenery");
  applyEdits(edits(1, piece("forest")));
  assert.equal(landRegions().length, regions + 1);
  assert.ok(walkableCell(MID.x, MID.z) || treeDensity(MID.x + 0.5, MID.z + 0.5) > 0.3, "walked (a tree's tile aside)");
  // (no ridge: its land down to the town's, not 40 m up)
  assert.ok(Math.abs(terrainAt(MID.x, MID.z) - terrainAt(32, 150)) < 20, `${terrainAt(MID.x, MID.z)}`);
  assert.ok(treeDensity(MID.x, MID.z) > 0.5 || treeDensity(MID.x + 40, MID.z) > 0.5, "a forest");
  // (the town north of it as it was)
  const town = terrainAt(32, 0);
  applyEdits(NO_EDITS);
  assert.equal(terrainAt(32, 0), town);
  applyEdits(edits(2, piece("forest")));
  applyEdits(NO_EDITS);
  assert.equal(landRegions().length, regions);
  assert.equal(walkableCell(MID.x, MID.z), false);
  assert.equal(terrainAt(MID.x, MID.z), was.h);
  assert.equal(chunkHash(1, 13), was.chunk, "its chunks back as they were");
});

test("every biome: its land joined smoothly at the town's edge, its own ground", () => {
  for (const b of GROW_BIOMES) {
    applyEdits(edits(3, piece(b)));
    // (no step at the join: the land along the core's edge within a metre a metre)
    for (let x = -60; x < 140; x += 20) {
      const a = heightAt(x, 171);
      const c = heightAt(x, 172);
      assert.ok(Number.isFinite(a) && Math.abs(a - c) < 1, `${b}: a step at ${x}`);
    }
    for (let z = 200; z < 620; z += 40) assert.ok(Number.isFinite(terrainAt(MID.x, z)), `${b} at ${z}`);
  }
  // the desert's and the beach's sand
  applyEdits(edits(4, piece("desert")));
  let sand = 0;
  for (let z = 300; z < 600; z += 30) if (groundSurfaceAt(MID.x, z, true) === "sand") sand++;
  assert.ok(sand >= 6, `${sand} of 10 sand`);
  // the lake: water, iced in the winter, open as it thaws
  applyEdits(edits(5, piece("lake")));
  const lake = waterAt(32, 384);
  assert.ok(lake && lake.kind === "lake" && lake.depth > 4, JSON.stringify(lake));
  assert.ok(iceAt(32, 384, 1), "iced over");
  assert.equal(iceAt(32, 384, 0), null);
  // the beach: down to the sea at its far side, never frozen
  applyEdits(edits(6, piece("beach")));
  const sea = waterAt(MID.x, 540);
  assert.ok(sea && sea.kind === "sea", JSON.stringify(sea));
  assert.equal(iceAt(MID.x, 540, 1), null);
  // the mountains: high in the middle, the hills less
  applyEdits(edits(7, piece("mountains", { x0: -480, x1: 512, z1: 1504 })));
  const top = Math.max(...[0, 1, 2, 3, 4].map((k) => terrainAt(-200 + k * 120, 900)));
  assert.ok(top > 120, `the mountains' ${top}`);
  applyEdits(NO_EDITS);
});

test("the rules: on the grid, joined to the land, not over another, sized; a road into it, only with it", () => {
  applyEdits(NO_EDITS);
  assert.deepEqual(checkEdits(edits(1, piece("meadow"))), []);
  const no = (e: GroundsEdits, what: RegExp) => {
    const out = checkEdits(e);
    assert.ok(
      out.some((s) => what.test(s)),
      `${what}: ${out.join("; ") || "allowed"}`,
    );
  };
  no(edits(1, piece("meadow", { x0: -95 })), /grid/);
  no(edits(1, piece("meadow", { z0: 1600, z1: 1920 })), /not joined/);
  no(edits(1, piece("meadow", { x1: -64 })), /64–4096/);
  no(edits(1, piece("meadow"), piece("hills", { key: "god-b", x0: 0 })), /over god-meadow/);
  no(edits(1, piece("meadow", { biome: "swamp" as GrowDef["biome"] })), /not a kind of land/);
  no(edits(1, piece("meadow", { x0: 40_000, x1: 40_128 })), /km out/);
  no({ rev: 1, land: { remove: ["core"] } }, /only land god mode grew/);
  // (a piece joined only through another: allowed)
  assert.deepEqual(checkEdits(edits(1, piece("meadow"), piece("lake", { key: "god-b", z0: 640, z1: 960 }))), []);
  // a road out into the new land: with it, allowed; without, past the world's edge
  const road: GroundsEdits["ways"] = {
    add: [
      {
        key: "god-south",
        kind: "road",
        name: "South Road",
        w: 7,
        pts: [
          [32, 150],
          [32, 300],
          [40, 500],
        ],
      },
    ],
  };
  assert.deepEqual(checkEdits({ ...edits(1, piece("meadow")), ways: road }), []);
  no({ rev: 1, ways: road }, /past the world's edge/);
  // (and its land taken away from under it: refused)
  no({ rev: 1, ways: road, land: { add: [piece("meadow")], remove: ["god-meadow"] } }, /past the world's edge/);
  // laid: the road on the new land, walked and asphalt
  applyEdits({ ...edits(8, piece("meadow")), ways: road });
  assert.ok(WAYS.some((w) => w.key === "god-south"));
  assert.equal(groundSurfaceAt(36, 400), "asphalt");
  assert.ok(walkableCell(36, 400));
  applyEdits(NO_EDITS);
});

test("a lake's water is held by its shore, lifted or not; its bowl kept clear of the town; a piece moved by one beside it made again", () => {
  // (joined to the town through a meadow; the lake 100 m clear of it)
  const meadow = piece("meadow", { x0: -480, x1: 512, z0: 160, z1: 256 });
  for (const lift of [0, 40]) {
    const lake = piece("lake", { key: "god-l", x0: -480, x1: 512, z0: 256, z1: 1280, lift });
    assert.deepEqual(checkEdits(edits(1, meadow, lake)), []);
    applyEdits(edits(9 + lift, meadow, lake));
    let wet = 0;
    for (let x = -480; x < 512; x += 8)
      for (let z = 256; z < 1280; z += 8) {
        const w = waterAt(x, z);
        if (!w) continue;
        wet++;
        // (beside the water: more water, or land at its level or over it)
        for (const [dx, dz] of [
          [8, 0],
          [-8, 0],
          [0, 8],
          [0, -8],
        ])
          if (!waterAt(x + dx, z + dz))
            assert.ok(terrainAt(x + dx, z + dz) > w.level - 0.3, `lift ${lift}: spilt at ${x + dx},${z + dz}`);
      }
    assert.ok(wet > 1000, `lift ${lift}: ${wet}`);
  }
  // (by the town: its shore would be eased into the town's land, under its water)
  assert.ok(
    checkEdits(edits(1, piece("lake", { z0: 160, z1: 1024 }))).some((s) => /clear of the town/.test(s)),
    "refused",
  );
  // a piece's start height from the land it meets: another laid beside it moves it, its chunks too
  const A = piece("hills", { key: "god-a", x0: -1024, x1: -384, z0: -512, z1: 0 });
  const B = piece("hills", { key: "god-b", x0: -1664, x1: -1024, z0: -512, z1: 0 });
  applyEdits(edits(20, A));
  const [cx, cz] = [Math.floor(-704 / 32), Math.floor(-256 / 32)];
  heightAt(cx * 32, cz * 32);
  applyEdits(edits(21, A, B));
  assert.ok(Math.abs(heightAt(cx * 32, cz * 32) - terrainAt(cx * 32, cz * 32)) < 0.05, "A's chunk made again");
  applyEdits(NO_EDITS);
});
