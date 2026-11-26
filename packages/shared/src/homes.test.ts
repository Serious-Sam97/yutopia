import assert from "node:assert/strict";
import { test } from "node:test";
import {
  BASE_HOME_LOTS,
  claimOps,
  claimSetOps,
  GROUND_TOP,
  lotFault,
  lotFloors,
  lotGround,
  lotOf,
  lotRole,
  lotsFix,
  lotWhy,
  releaseOps,
  riseTop,
  storeyAddOps,
  storeyRemoveOps,
} from "./homes.ts";
import { SPACE_BASE } from "./levels.ts";
import { applyOps } from "./structure/ops.ts";
import type { Structure } from "./structure/types.ts";
import { SLAB } from "./units.ts";

// Plan 130 phase 1: home lots — claimed, built on by their owner and roommates, storeys up and down, given back.

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
const lot = BASE_HOME_LOTS[0];
const bia = { uid: 7, name: "Bia Demo" };

test("a lot claimed: its ground storey over the lot, its ground slab, its owner", () => {
  const st = applyOps(empty(), claimOps(empty(), lot, bia, 1.25) ?? []);
  const g = lotGround(st, lot.key);
  assert.ok(g);
  assert.equal(g.index, SPACE_BASE);
  assert.equal(g.z, 1.25);
  assert.deepEqual(g.grid, { x0: lot.x0, y0: lot.z0, w: lot.x1 - lot.x0, h: lot.z1 - lot.z0 });
  assert.equal(g.claim?.owner, 7);
  const slab = st.slabs.find((s) => s.floor === g.index);
  assert.equal(slab?.top, GROUND_TOP);
  assert.equal(lotOf(st, 7), lot.key);
  // (claimed: not again)
  assert.equal(claimOps(st, lot, { uid: 8, name: "Cai" }, 1.25), null);
});

test("who builds on a lot: its owner, its roommates, admins", () => {
  let st = applyOps(empty(), claimOps(empty(), lot, bia, 0) ?? []);
  const g = lotGround(st, lot.key)?.index ?? -1;
  assert.equal(lotWhy(st, g, { uid: 7 }), null);
  assert.match(lotWhy(st, g, { uid: 8 }) ?? "", /Bia's lot/);
  assert.equal(lotWhy(st, g, { uid: 8, admin: true }), null);
  st = applyOps(
    st,
    claimSetOps(st, lot.key, { owner: 7, ownerName: "Bia Demo", mates: [{ uid: 8, name: "Cai" }] }) ?? [],
  );
  assert.equal(lotRole(st, lot.key, 8), "mate");
  assert.equal(lotWhy(st, g, { uid: 8 }), null);
  // (the HQ's floors: not a lot's)
  assert.equal(lotWhy(st, 0, { uid: 8 }), null);
});

test("storeys up and basements down, each its height; at most so many", () => {
  let st = applyOps(empty(), claimOps(empty(), lot, bia, 0) ?? []);
  const up = storeyAddOps(st, lot, "up", "tall");
  assert.ok(Array.isArray(up));
  st = applyOps(st, up);
  const g = lotGround(st, lot.key);
  assert.ok(g);
  const s1 = lotFloors(st, lot.key).find((f) => f.storey === 1);
  assert.equal(s1?.z, riseTop(g));
  assert.equal(s1?.ceil, +(4.5 - SLAB).toFixed(3));
  const s2 = storeyAddOps(st, lot, "up", "short");
  assert.ok(Array.isArray(s2));
  st = applyOps(st, s2);
  const s2f = lotFloors(st, lot.key).find((f) => f.storey === 2);
  assert.ok(s1 && s2f);
  assert.ok(Math.abs(s2f.z - s1.z - 4.5) < 1e-6, "the storey over a tall one: 4.5 m up");
  for (const _ of [0, 1]) {
    const d = storeyAddOps(st, lot, "down", "normal");
    assert.ok(Array.isArray(d));
    st = applyOps(st, d);
  }
  assert.equal(typeof storeyAddOps(st, lot, "down"), "string", "two basements at most");
  const b2 = lotFloors(st, lot.key).find((f) => f.storey === -2);
  assert.equal(b2?.z, -7);
  // (only the top storey or the lowest basement goes; never the ground)
  assert.equal(typeof storeyRemoveOps(st, lot.key, s1.index), "string");
  assert.equal(typeof storeyRemoveOps(st, lot.key, g.index), "string");
  const r = storeyRemoveOps(st, lot.key, s2f.index);
  assert.ok(Array.isArray(r));
  st = applyOps(st, r);
  assert.equal(lotFloors(st, lot.key).length, 4);
});

test("a lot given back: its storeys gone with what's on them", () => {
  let st = applyOps(empty(), claimOps(empty(), lot, bia, 0) ?? []);
  const g = lotGround(st, lot.key)?.index ?? -1;
  st = applyOps(st, [
    {
      op: "walls",
      remove: [],
      add: [{ id: "w1", floor: g, a: [95, -50], b: [100, -50], base: 0, height: 3, front: "p" }],
    },
  ]);
  st = applyOps(st, releaseOps(st, lot.key));
  assert.equal(lotFloors(st, lot.key).length, 0);
  assert.equal(st.walls.length, 0);
  assert.equal(st.slabs.length, 0);
  assert.equal(lotOf(st, 7), null);
});

test("lots kept with God mode's: out of the world while their lot's gone, back when it's back", () => {
  let st = applyOps(empty(), claimOps(empty(), lot, bia, 0) ?? []);
  st = applyOps(st, lotsFix(st, []));
  assert.equal(lotGround(st, lot.key)?.away, true);
  assert.deepEqual(lotsFix(st, []), []);
  st = applyOps(st, lotsFix(st, BASE_HOME_LOTS));
  assert.equal(lotGround(st, lot.key)?.away, undefined);
});

test("a lot's size and place: 12–48 m a side, on nothing else", () => {
  assert.equal(lotFault(lot, BASE_HOME_LOTS), null);
  assert.match(lotFault({ ...lot, key: "x", x1: lot.x0 + 8 }, []) ?? "", /12 m/);
  assert.match(lotFault({ ...lot, key: "x", x1: lot.x0 + 60 }, []) ?? "", /48 m/);
  assert.match(lotFault({ ...lot, key: "x" }, BASE_HOME_LOTS) ?? "", /another lot/);
});
