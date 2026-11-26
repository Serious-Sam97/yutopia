import assert from "node:assert/strict";
import { test } from "node:test";
import { blueprintBuild, blueprintOf } from "./blueprints.ts";
import type { WorldObjectDef } from "./catalog.ts";
import { BASE_HOME_LOTS, claimOps, lotFloors, storeyAddOps } from "./homes.ts";
import { applyOps } from "./structure/ops.ts";
import type { Structure, XY } from "./structure/types.ts";

// Plan 130 phase 12: a house saved as a blueprint on one lot, built again on another — its storeys, its walls where
// they stood on the lot, its foundation, its stairs' rails and its doors following their walls.

const empty = (): Structure => ({
  version: 4,
  key: "t",
  name: "t",
  home: 0,
  spawn: [0, 0],
  floors: [{ index: 0, name: "G", z: 0, grid: { x0: 0, y0: 0, w: 10, h: 10 } }],
  slabs: [],
  walls: [],
  rooms: [],
});
const [A, B] = BASE_HOME_LOTS;
const bia = { uid: 7, name: "Bia Demo" };

test("a house saved on one lot is built again on another, where it stood on the lot", () => {
  let s = empty();
  s = applyOps(s, claimOps(s, A, bia, 2) ?? []);
  s = applyOps(s, claimOps(s, B, { uid: 8, name: "Ana" }, 3) ?? []);
  const up = storeyAddOps(s, A, "up", "tall");
  assert.ok(Array.isArray(up));
  s = applyOps(s, up);
  const [g, u] = lotFloors(s, A.key);
  const box: XY[] = [
    [A.x0 + 2, A.z0 + 2],
    [A.x0 + 8, A.z0 + 2],
    [A.x0 + 8, A.z0 + 6],
    [A.x0 + 2, A.z0 + 6],
  ];
  s = applyOps(s, [
    {
      op: "walls",
      remove: [],
      add: box.map((a, i) => ({
        id: `w${i}`,
        floor: g.index,
        a,
        b: box[(i + 1) % 4],
        base: g.z,
        height: 3,
        front: "p",
      })),
    },
    { op: "slabs", floor: u.index, slabs: [{ id: "s1", floor: u.index, z: u.z, top: ".", outline: box, holes: [] }] },
    { op: "layer", name: "tiles", floor: g.index, data: { [`${A.x0 + 3},${A.z0 + 3}`]: "cov:oak-honey" } },
  ]);
  const door: WorldObjectDef = {
    id: "d1",
    kind: "door",
    x: A.x0 + 4,
    y: A.z0 + 2,
    yaw: 0,
    props: { level: g.index, free: true, on: { wall: "w0", at: 2.5 } },
  };
  const bp = blueprintOf(s, A, [door]);
  assert.ok(typeof bp !== "string");
  assert.equal(bp.storeys.length, 2);
  assert.equal(bp.storeys.find((q) => q.storey === 1)?.rise, "tall");
  assert.deepEqual(bp.storeys.find((q) => q.storey === 0)?.walls[0].a, [2, 2]);
  // (on B: built where it stood on A, a storey up the same height, the door on its wall's new id)
  let n = 0;
  const r = blueprintBuild(s, B, bp, [], (k) => `${k}${n++}`);
  assert.ok(typeof r !== "string", String(r));
  const s2 = applyOps(s, r.ops);
  const [g2, u2] = lotFloors(s2, B.key);
  assert.ok(u2 && Math.abs(u2.z - g2.z - (u.z - g.z)) < 1e-6, "its storey over as high");
  const walls2 = s2.walls.filter((w) => w.floor === g2.index);
  assert.equal(walls2.length, 4);
  assert.ok(walls2.some((w) => w.a[0] === B.x0 + 2 && w.a[1] === B.z0 + 2));
  assert.ok(Math.abs(walls2[0].base - g2.z) < 1e-6);
  assert.equal(
    (s2.layers?.tiles?.[String(g2.index)] as Record<string, unknown>)?.[`${B.x0 + 3},${B.z0 + 3}`],
    "cov:oak-honey",
  );
  assert.equal(r.things.length, 1);
  const on = r.things[0].props?.on as { wall: string };
  assert.ok(
    walls2.some((w) => w.id === on.wall),
    "the door on its wall's new id",
  );
  // (not again: the lot's not empty now)
  assert.equal(typeof blueprintBuild(s2, B, bp, r.things, (k) => `${k}${n++}`), "string");
});
