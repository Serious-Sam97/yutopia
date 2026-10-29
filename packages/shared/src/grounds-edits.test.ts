import assert from "node:assert/strict";
import { test } from "node:test";
import * as G from "./grounds.ts";
import {
  applyEdits,
  BUILDINGS,
  CHUNK,
  editsVersion,
  forgetGrounds,
  groundSurfaceAt,
  groundsThings,
  heightAt,
  INSIDES,
  LAMPS,
  surfaceTileAt,
  terrainAt,
  treeKey,
  treesIn,
  WAYS,
  walkableTile,
} from "./grounds.ts";
import { encodeBytes, encodeHeights, type GroundsEdits, NO_EDITS, TREE_MASK } from "./grounds-edits.ts";
import { groundsHash } from "./grounds-hash.ts";
import { routeOver } from "./route.ts";
import { groundSolidsIn } from "./shapes/grounds.ts";

// God mode's edits laid over the Grounds (docs/plan/53-the-god-mode.md § B): with none, the world
// is exactly today's (its fingerprint, every chunk); laid, each kind of edit changes what it says
// and only round it; taken off, today's again.

/** Today's Grounds (2026-10-29, before god mode): change these only when the generator is meant to
 *  change, and say why in the commit. */
const TODAY = {
  land: "c6e49333",
  walk: "80ace7be",
  trees: "0940af8b",
  surfaces: "0cbae68d",
  solids: "2fbfd9b7",
  things: "ac236950",
};

// the farm's open field south of the farmhouse: chunk (13, −8)
const HILL = { cx: 13, cz: -8 };
function hill(top: number): string {
  const n = CHUNK * 2 + 1;
  const a = new Int16Array(n * n);
  for (let j = 0; j < n; j++)
    for (let i = 0; i < n; i++) {
      const d = Math.hypot(i - (n - 1) / 2, j - (n - 1) / 2) / ((n - 1) / 2);
      a[j * n + i] = Math.round(Math.max(0, 1 - d) * top * 100);
    }
  return encodeHeights(a);
}
const MID = { x: HILL.cx * CHUNK + 16, z: HILL.cz * CHUNK + 16 };

const EDITS: GroundsEdits = {
  rev: 1,
  height: { [`${HILL.cx},${HILL.cz}`]: hill(4) },
  // a path painted across the next chunk east, row 10
  paint: {
    [`${HILL.cx + 1},${HILL.cz}`]: encodeBytes(
      Uint8Array.from({ length: CHUNK * CHUNK }, (_, i) => (Math.floor(i / CHUNK) === 10 ? 3 : 0)),
    ),
  },
  // the woods west of the HQ, chunk (−5, −4): every cell cleared but the first, planted a birch
  trees: {
    "-5,-4": encodeBytes(Uint8Array.from({ length: 100 }, (_, i) => (i === 0 ? TREE_MASK.birch : TREE_MASK.none))),
  },
  ways: {
    add: [
      {
        key: "god-1",
        kind: "road",
        name: "Pond Road",
        w: 7,
        pts: [
          [-150, -150],
          [-125, -135],
          [-100, -120],
        ],
        lamps: true,
      },
    ],
    remove: ["farm-lane"],
  },
  buildings: {
    add: [
      {
        key: "pine-house",
        kind: "house",
        name: "Pine House",
        x0: -140,
        z0: -100,
        x1: -128,
        z1: -90,
        floors: 2,
        face: "s",
        enter: true,
      },
    ],
    remove: ["books"],
  },
  things: {
    remove: ["lamp:clearing"],
    change: { "street:stop": { x: 426 } },
    add: [{ key: "god-lamp-1", kind: "lamp-town", x: -110, z: -110, ry: 0 }],
  },
};

test("no edits: the Grounds are today's, every chunk", () => {
  assert.deepEqual(groundsHash(), TODAY);
});

test("the edits laid: each changes what it says", () => {
  const was = { h: terrainAt(MID.x, MID.z), lamp: walkableTile(122, -252), v: editsVersion };
  const stopWas = groundsThings().find((t) => t.key === "street:stop");
  const dirty = applyEdits(EDITS);
  assert.ok(G.editsVersion > was.v, "laid: the version moves");
  // the hill: 4 m at its middle, on the land and underfoot
  assert.ok(Math.abs(terrainAt(MID.x, MID.z) - was.h - 4) < 0.01, "the hill's top");
  assert.ok(Math.abs(heightAt(MID.x, MID.z) - terrainAt(MID.x, MID.z)) < 0.01, "the chunk made again with it");
  // the path painted
  const px = (HILL.cx + 1) * CHUNK + 5;
  const pz = HILL.cz * CHUNK + 10;
  assert.equal(surfaceTileAt(px, pz), "path");
  assert.equal(groundSurfaceAt(px + 0.5, pz + 0.5), "path");
  // the trees: one birch left in the chunk, in its first cell
  const trees = treesIn(-5, -4);
  assert.equal(trees.length, 1);
  assert.equal(trees[0].kind, "birch");
  assert.equal(treeKey(trees[0]), "tree:-50,-40");
  // the road: there, asphalt, lamps along it, the trail gone
  assert.ok(WAYS.some((w) => w.key === "god-1"));
  assert.ok(!WAYS.some((w) => w.key === "farm-lane"));
  assert.equal(groundSurfaceAt(-125, -135), "asphalt");
  assert.ok(
    LAMPS.some((l) => l.key.startsWith("lamp:god-1:")),
    "lamps along the new road",
  );
  // the house: its plot a floor, its walls solid, its inside; the bookshop gone, and its solids
  assert.ok(BUILDINGS.some((b) => b.key === "pine-house"));
  assert.ok(!BUILDINGS.some((b) => b.key === "books"));
  assert.equal(groundSurfaceAt(-134, -95), "floor");
  assert.ok(INSIDES.some((i) => i.b.key === "pine-house"));
  assert.ok(
    groundSolidsIn(Math.floor(-134 / CHUNK), Math.floor(-95 / CHUNK)).some(
      (s) => s.what !== "tree_pine" && s.what !== "tree_birch" && s.what !== "tree_bare" && s.what !== "edge",
    ),
  );
  // the things: the clearing's lamp gone (its tile walked), the stop sign moved, a lamp put down
  assert.ok(!LAMPS.some((l) => l.key === "lamp:clearing"));
  assert.ok(!was.lamp && walkableTile(122, -252), "the lamp's tile walkable");
  assert.equal(groundsThings().find((t) => t.key === "street:stop")?.x, 426);
  assert.notEqual(stopWas?.x, 426);
  assert.ok(LAMPS.some((l) => l.key === "god-lamp-1" && l.kind === "town"));
  // only round what changed: not the whole world
  const all = Math.ceil((G.GROUNDS.x1 - G.GROUNDS.x0) / CHUNK) * Math.ceil((G.GROUNDS.z1 - G.GROUNDS.z0) / CHUNK);
  assert.ok(dirty.length > 0 && dirty.length < all / 4, `${dirty.length} of ${all} chunks`);
  for (const c of [
    [HILL.cx, HILL.cz],
    [HILL.cx + 1, HILL.cz],
    [-5, -4],
    [Math.floor(-125 / CHUNK), Math.floor(-135 / CHUNK)],
  ])
    assert.ok(
      dirty.some(([x, z]) => x === c[0] && z === c[1]),
      `chunk ${c} dirty`,
    );
  // the GPS's graph follows: the new road's on it
  routeOver(G);
  const places = G.WAYS.map((w) => w.key);
  assert.ok(places.includes("god-1"));
});

test("a small edit: only the chunks round it", () => {
  applyEdits(NO_EDITS);
  const dirty = applyEdits({ rev: 2, things: { remove: ["lamp:gate"] } });
  assert.ok(dirty.length >= 1 && dirty.length <= 4, `${dirty.length} chunks for one lamp`);
  assert.ok(dirty.some(([x, z]) => x === Math.floor(-36 / CHUNK) && z === Math.floor(-370 / CHUNK)));
});

test("whoever keeps what's made of the Grounds is told which chunks changed, and why", () => {
  applyEdits(NO_EDITS);
  const told: { cs: [number, number][]; why: string }[] = [];
  const off = G.onGroundsChanged((cs, why) => told.push({ cs, why }));
  const dirty = applyEdits({ rev: 3, things: { remove: ["lamp:gate"] } });
  assert.deepEqual(told, [{ cs: dirty, why: "edits" }]);
  if (G.KART_LAND) {
    G.setParkLayout("oval", false);
    assert.equal(told[1]?.why, "park");
    assert.ok(told[1].cs.length > 0);
    G.setParkLayout("eight", false);
  }
  off();
  applyEdits(NO_EDITS);
  assert.equal(told.length, G.KART_LAND ? 3 : 1, "not told once it's off");
});

test("what it says changed is all that did: what's kept is what's made from nothing", () => {
  applyEdits(NO_EDITS);
  groundsHash(); // (every chunk made, without the edits)
  applyEdits(EDITS);
  const kept = groundsHash();
  forgetGrounds();
  assert.deepEqual(kept, groundsHash());
  assert.notDeepEqual(kept, TODAY);
});

test("taken off again: today's Grounds", () => {
  applyEdits(EDITS);
  applyEdits(NO_EDITS);
  assert.deepEqual(groundsHash(), TODAY);
});
