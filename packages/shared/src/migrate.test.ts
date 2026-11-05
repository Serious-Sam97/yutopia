import assert from "node:assert/strict";
import { test } from "node:test";
import { entry } from "./catalog.ts";
import { isV3, LAYOUT_VERSION, type SavedWorld, worldToV3 } from "./migrate.ts";

// Plan 72 phase 5: a saved world into metres, once.
test("a world saved in the art's px comes up to metres once; a height already in metres stays", () => {
  const old = {
    layout: { version: 2, width: 16, height: 16 },
    objects: [
      { id: "mug", kind: "tabletop", x: 3, y: 3, rot: 2, props: { d: "mug", z: 28.999 } }, // a desk's top, in px
      { id: "tv", kind: "tv_portable", x: 4, y: 3, props: { z: 0.74 } }, // set on its host in metres already
      { id: "desk", kind: "desk", x: 3, y: 3 },
      { id: "rug", kind: "rug", x: 0, y: 0, props: { z: 0 } },
    ],
  };
  const { world, changed } = worldToV3(old);
  assert.equal(changed, 1);
  assert.equal(world.objects?.[0].props?.z, 0.74, "a desk's 29 px is its 0.74 m");
  assert.equal((world.objects?.[0] as { yaw?: number }).yaw, Math.PI, "a half turn");
  assert.ok(!("rot" in (world.objects?.[0] ?? {})));
  assert.equal(world.objects?.[1].props?.z, 0.74);
  assert.equal(world.objects?.[2], old.objects[2], "untouched things are the same objects");
  assert.equal(world.objects?.[3].props?.z, 0);
  assert.equal((world.layout as { version: number }).version, LAYOUT_VERSION);
  assert.ok(isV3(world) && !isV3(old));
  assert.equal(worldToV3(world).changed, 0, "a second run changes nothing");
  assert.equal(worldToV3(world).world, world);
  // (a world with no layout of its own is marked on itself)
  const bare = worldToV3<SavedWorld>({ objects: [{ props: { z: 25 } }] });
  assert.ok(isV3(bare.world) && bare.world.format === LAYOUT_VERSION);
  assert.ok(Math.abs((entry("desk").surface ?? 0) - 0.74) < 1e-9);
});
