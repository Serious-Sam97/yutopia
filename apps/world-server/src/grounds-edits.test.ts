import assert from "node:assert/strict";
import { after, test } from "node:test";
import { setTimeout as sleep } from "node:timers/promises";
import { CHUNK, groundSurfaceAt, hasChunk, landAt, terrainAt, WAYS } from "@yutopia/shared/grounds";
import { encodeHeights, type GroundsEdits, NO_EDITS } from "@yutopia/shared/grounds-edits";
import { loadJolt, PhysicsWorld, sizesFor, WorldBuilder } from "@yutopia/shared/physics";
import { landEdits, onLandChanged, prefetch, stopLand } from "./land.ts";

// God mode's edits on the world server (docs/plan/53-the-god-mode.md, phase 2): a hand-written
// set — a hill, a road, a house — laid through land.ts: the land worker makes its chunks with
// them, whoever keeps what's made of the Grounds is told which changed, and the physics world
// stands on the hill and walks into the house.

after(() => stopLand());

// the farm's open field south of the farmhouse, chunk (13, −8); the woods west of the HQ
const HILL = { cx: 13, cz: -8, x: 13 * CHUNK + 16, z: -8 * CHUNK + 16 };
const HOUSE = { x0: -140, z0: -100, x1: -128, z1: -90 };
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
const EDITS: GroundsEdits = {
  rev: 1,
  height: { [`${HILL.cx},${HILL.cz}`]: hill(4) },
  ways: {
    add: [
      {
        key: "pond-road",
        kind: "road",
        name: "Pond Road",
        w: 7,
        pts: [
          [-150, -150],
          [-125, -135],
          [-100, -120],
        ],
      },
    ],
  },
  buildings: {
    add: [{ key: "pine-house", kind: "house", name: "Pine House", ...HOUSE, floors: 2, face: "s" }],
  },
};

async function made(cx: number, cz: number) {
  const t = Date.now();
  while (!hasChunk(cx, cz)) {
    prefetch(cx * CHUNK + 16, cz * CHUNK + 16, 0);
    if (Date.now() - t > 20_000) throw new Error(`chunk ${cx},${cz} not made`);
    await sleep(20);
  }
}

test("laid through land.ts: the worker's chunks carry them; the listeners told which changed", async () => {
  // (the hill's chunk made by the worker without the edits first)
  await made(HILL.cx, HILL.cz);
  const flat = landAt(HILL.x, HILL.z);
  let told: [number, number][] = [];
  const off = onLandChanged((cs) => {
    told = cs;
  });
  const dirty = landEdits(EDITS);
  off();
  assert.deepEqual(told, dirty);
  assert.ok(
    dirty.some(([x, z]) => x === HILL.cx && z === HILL.cz),
    "the hill's chunk changed",
  );
  assert.ok(!hasChunk(HILL.cx, HILL.cz), "dropped, to be made again");
  // made again in the worker, with the hill
  await made(HILL.cx, HILL.cz);
  assert.ok(Math.abs(landAt(HILL.x, HILL.z) - flat - 4) < 0.02, `the hill: ${landAt(HILL.x, HILL.z) - flat} m`);
  assert.ok(Math.abs(landAt(HILL.x, HILL.z) - terrainAt(HILL.x, HILL.z)) < 0.01, "the worker's chunk is this thread's");
  // the road and the house
  assert.ok(WAYS.some((w) => w.key === "pond-road"));
  assert.equal(groundSurfaceAt(-125, -135), "asphalt");
  assert.equal(groundSurfaceAt(-134, -95), "floor");
});

test("the physics world on them: standing on the hill, the house's walls in the way", async () => {
  const world = await PhysicsWorld.create(loadJolt, sizesFor({ statics: 64 }));
  const build = new WorldBuilder(world);
  await made(HILL.cx, HILL.cz);
  const hc = [Math.floor(-134 / CHUNK), Math.floor(-95 / CHUNK)] as const;
  await made(hc[0], hc[1]);
  build.groundChunk(HILL.cx, HILL.cz);
  build.groundChunk(hc[0], hc[1]);
  world.settle();
  // the hill's top underfoot
  const top = world.groundUnder(HILL.x, 60, HILL.z, 0.2, 120, "all");
  assert.ok(top !== null && Math.abs(top - terrainAt(HILL.x, HILL.z)) < 0.1, `the hill's top: ${top}`);
  // walking east into the house's west wall from 2 m off it, a metre up
  const y = terrainAt(HOUSE.x0 - 2, -95) + 1;
  const hit = world.rayHit(HOUSE.x0 - 2, y, -95, 1, 0, 0, 4, "all");
  assert.ok(hit !== null && hit > 1.5 && hit < 2.5, `the house's wall ${hit} m on`);
  world.destroy();
});

test("taken off: the hill gone again, the road and the house too", async () => {
  landEdits(NO_EDITS);
  await made(HILL.cx, HILL.cz);
  assert.ok(Math.abs(landAt(HILL.x, HILL.z) - terrainAt(HILL.x, HILL.z)) < 0.01);
  assert.ok(!WAYS.some((w) => w.key === "pond-road"));
  assert.notEqual(groundSurfaceAt(-134, -95), "floor");
});
