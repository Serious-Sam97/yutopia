import assert from "node:assert/strict";
import { test } from "node:test";
import {
  autoFloorOps,
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
  lotsOf,
  lotWhy,
  releaseOps,
  riseTop,
  roofsUpOps,
  roomsClosedOps,
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

test("one person, as many lots as they claim (no limit, 2026-11-26): each theirs, one given back leaves the rest", () => {
  const [a, b] = BASE_HOME_LOTS;
  let st = applyOps(empty(), claimOps(empty(), a, bia, 0) ?? []);
  st = applyOps(st, claimOps(st, b, bia, 0) ?? []);
  assert.deepEqual(lotsOf(st, bia.uid), [a.key, b.key]);
  assert.equal(lotRole(st, b.key, bia.uid), "owner");
  st = applyOps(st, releaseOps(st, a.key));
  assert.deepEqual(lotsOf(st, bia.uid), [b.key]);
  assert.equal(lotOf(st, bia.uid), b.key);
});

test("a roofed house: a storey on it leaves the roof; a room closed up there takes it up onto its walls (2026-11-26)", () => {
  let st = applyOps(empty(), claimOps(empty(), lot, bia, 0) ?? []);
  const g = lotGround(st, lot.key);
  assert.ok(g);
  const wallTop = g.z + (g.ceil ?? 0);
  const ring: [number, number][] = [
    [lot.x0 + 2, lot.z0 + 2],
    [lot.x0 + 8, lot.z0 + 2],
    [lot.x0 + 8, lot.z0 + 8],
    [lot.x0 + 2, lot.z0 + 8],
  ];
  const roof = (id: string, kind: string, outline: [number, number][]) =>
    ({ id, floor: g.index, kind, pitch: 30, over: 0.3, z: wallTop, outline, mat: "clay" }) as never;
  const chim: [number, number][] = [
    [lot.x0 + 3, lot.z0 + 3],
    [lot.x0 + 3.6, lot.z0 + 3],
    [lot.x0 + 3.6, lot.z0 + 3.6],
    [lot.x0 + 3, lot.z0 + 3.6],
  ];
  st = applyOps(st, [{ op: "roofs", floor: g.index, roofs: [roof("r1", "gable", ring), roof("c1", "chimney", chim)] }]);
  st = applyOps(st, storeyAddOps(st, lot, "up", "tall") as never);
  const s1 = lotFloors(st, lot.key).find((f) => f.storey === 1);
  assert.ok(s1);
  assert.equal((st.roofs ?? []).filter((r) => r.floor === g.index).length, 2, "a storey alone: the roof stays down");
  const room = { key: "u1", floor: s1.index, outline: ring, rect: [0, 0, 1, 1], props: {} } as never;
  // (a small room under the middle of it: the roof stays down)
  const small: [number, number][] = [
    [lot.x0 + 4, lot.z0 + 4],
    [lot.x0 + 6, lot.z0 + 4],
    [lot.x0 + 6, lot.z0 + 6],
    [lot.x0 + 4, lot.z0 + 6],
  ];
  const bath = { key: "u0", floor: s1.index, outline: small, rect: [0, 0, 1, 1], props: {} } as never;
  const withBath = applyOps(st, [{ op: "rooms", floor: s1.index, rooms: [bath] }]);
  assert.equal(roofsUpOps(withBath, s1.index, [bath]).length, 0, "a small room doesn't take the whole roof up");
  st = applyOps(st, [{ op: "rooms", floor: s1.index, rooms: [room] }]);
  const ops = roofsUpOps(st, s1.index, [room]);
  assert.equal(ops.length, 2);
  st = applyOps(st, ops);
  assert.equal((st.roofs ?? []).filter((r) => r.floor === g.index).length, 0, "none left downstairs");
  const up = (st.roofs ?? []).filter((q) => q.floor === s1.index);
  assert.equal(up.length, 2, "the roof and its chimney up there");
  const r = up.find((q) => q.kind === "gable");
  assert.ok(r && Math.abs(r.z - (s1.z + (s1.ceil ?? 0))) < 1e-6, "on the new walls' top");
  assert.equal(roofsUpOps(st, g.index, [room]).length, 0, "not on the ground storey");
  // (the storey taken away: its roofs back down on the walls under it, not gone)
  const rm = storeyRemoveOps(st, lot.key, s1.index);
  assert.ok(Array.isArray(rm));
  st = applyOps(st, rm);
  const back = (st.roofs ?? []).filter((q) => q.floor === g.index);
  assert.equal(back.length, 2, "the roof and its chimney back downstairs");
  assert.ok(
    Math.abs((back.find((q) => q.kind === "gable")?.z ?? 0) - wallTop) < 1e-6,
    "on the ground walls' top again",
  );
});

test("a room closed upstairs gets its floor by itself, stairs' holes kept; not downstairs, not twice (2026-11-26)", () => {
  let st = applyOps(empty(), claimOps(empty(), lot, bia, 0) ?? []);
  st = applyOps(st, storeyAddOps(st, lot, "up", "normal") as never);
  const g = lotGround(st, lot.key);
  const s1 = lotFloors(st, lot.key).find((f) => f.storey === 1);
  assert.ok(g && s1);
  const outline: [number, number][] = [
    [lot.x0 + 2, lot.z0 + 2],
    [lot.x0 + 8, lot.z0 + 2],
    [lot.x0 + 8, lot.z0 + 8],
    [lot.x0 + 2, lot.z0 + 8],
  ];
  const room = (floor: number) => ({
    key: `r${floor}`,
    floor,
    outline,
    rect: [0, 0, 1, 1] as [number, number, number, number],
    props: {},
  });
  // (a flight up from the ground storey inside it)
  st = applyOps(st, [
    {
      op: "layer",
      name: "flights",
      floor: g.index,
      data: [
        {
          id: "f1",
          x: lot.x0 + 4,
          y: lot.z0 + 3,
          dir: Math.PI / 2,
          shape: "straight",
          turn: 1,
          width: 1,
          rise: 3.5,
          style: "oak",
          rail: "none",
        },
        // (a short one, up to nothing up there: no hole for it)
        {
          id: "f2",
          x: lot.x0 + 6.5,
          y: lot.z0 + 3,
          dir: Math.PI / 2,
          shape: "straight",
          turn: 1,
          width: 1,
          rise: 1,
          style: "oak",
          rail: "none",
        },
      ],
    },
  ]);
  let n = 0;
  const id = () => `s${n++}`;
  assert.equal(autoFloorOps(st, g.index, [room(g.index) as never], id), null, "not on the ground storey");
  const op = autoFloorOps(st, s1.index, [room(s1.index) as never], id);
  assert.ok(op && op.op === "slabs");
  const slab = op.slabs.find((q) => q.outline.length === 4 && q.top === ".");
  assert.ok(slab, "an oak floor in it");
  assert.equal(slab.z, s1.z);
  assert.equal(slab.holes.length, 1, "the whole storey's stairs' hole kept, the short one's none");
  st = applyOps(st, [op]);
  assert.equal(autoFloorOps(st, s1.index, [room(s1.index) as never], id), null, "floored already");
});

test("a storey on a house: a floor over each room under it, the stairs' hole kept (2026-11-26)", () => {
  let st = applyOps(empty(), claimOps(empty(), lot, bia, 0) ?? []);
  const g = lotGround(st, lot.key);
  assert.ok(g);
  const outline: [number, number][] = [
    [lot.x0 + 2, lot.z0 + 2],
    [lot.x0 + 8, lot.z0 + 2],
    [lot.x0 + 8, lot.z0 + 8],
    [lot.x0 + 2, lot.z0 + 8],
  ];
  st = applyOps(st, [
    {
      op: "rooms",
      floor: g.index,
      rooms: [{ key: "r1", floor: g.index, outline, rect: [0, 0, 1, 1], props: {} } as never],
    },
    {
      op: "layer",
      name: "flights",
      floor: g.index,
      data: [
        {
          id: "f1",
          x: lot.x0 + 4,
          y: lot.z0 + 3,
          dir: Math.PI / 2,
          shape: "straight",
          turn: 1,
          width: 1,
          rise: 3.5,
          style: "oak",
          rail: "none",
        },
      ],
    },
  ]);
  st = applyOps(st, storeyAddOps(st, lot, "up", "normal") as never);
  const s1 = lotFloors(st, lot.key).find((f) => f.storey === 1);
  assert.ok(s1);
  const fl = st.slabs.filter((q) => q.floor === s1.index);
  assert.equal(fl.length, 1, "one floor, over the room");
  assert.equal(fl[0].z, s1.z);
  assert.equal(fl[0].holes.length, 1, "the stairs come up through it");
});

test("stairs built up from the top storey before a storey's on it: they reach it once it's put on, and it's holed (2026-11-26)", () => {
  let st = applyOps(empty(), claimOps(empty(), lot, bia, 0) ?? []);
  const g = lotGround(st, lot.key);
  assert.ok(g);
  const outline: [number, number][] = [
    [lot.x0 + 2, lot.z0 + 2],
    [lot.x0 + 8, lot.z0 + 2],
    [lot.x0 + 8, lot.z0 + 8],
    [lot.x0 + 2, lot.z0 + 8],
  ];
  st = applyOps(st, [
    {
      op: "rooms",
      floor: g.index,
      rooms: [{ key: "r1", floor: g.index, outline, rect: [0, 0, 1, 1], props: {} } as never],
    },
    {
      op: "layer",
      name: "flights",
      floor: g.index,
      // (its rise the walls' height — riseOf on a top storey —, as the stair tool gives it with nothing over it)
      data: [
        {
          id: "f1",
          x: lot.x0 + 4,
          y: lot.z0 + 3,
          dir: Math.PI / 2,
          shape: "straight",
          turn: 1,
          width: 1,
          rise: g.ceil,
          style: "oak",
          rail: "none",
        },
      ],
    },
  ]);
  st = applyOps(st, storeyAddOps(st, lot, "up", "normal") as never);
  const s1 = lotFloors(st, lot.key).find((f) => f.storey === 1);
  assert.ok(s1);
  const fl = (st.layers?.flights?.[String(g.index)] as { rise: number }[])[0];
  assert.ok(Math.abs(g.z + fl.rise - s1.z) < 1e-6, `the stairs reach the floor up there (${fl.rise})`);
  assert.equal(st.slabs.find((q) => q.floor === s1.index)?.holes.length, 1, "holed over them");
});

test("a room closed on the ground storey under a storey: its floor up there too (2026-11-26)", () => {
  let st = applyOps(empty(), claimOps(empty(), lot, bia, 0) ?? []);
  st = applyOps(st, storeyAddOps(st, lot, "up", "normal") as never);
  const g = lotGround(st, lot.key);
  const s1 = lotFloors(st, lot.key).find((f) => f.storey === 1);
  assert.ok(g && s1);
  const outline: [number, number][] = [
    [lot.x0 + 2, lot.z0 + 2],
    [lot.x0 + 8, lot.z0 + 2],
    [lot.x0 + 8, lot.z0 + 8],
    [lot.x0 + 2, lot.z0 + 8],
  ];
  st = applyOps(st, [
    {
      op: "rooms",
      floor: g.index,
      rooms: [{ key: "r1", floor: g.index, outline, rect: [0, 0, 1, 1], props: {} } as never],
    },
  ]);
  let n = 0;
  const ops = roomsClosedOps(st, g.index, ["r1"], () => `s${n++}`);
  st = applyOps(st, ops);
  const up = st.slabs.filter((q) => q.floor === s1.index);
  assert.equal(up.length, 1, "a floor over it up there");
  assert.equal(up[0].z, s1.z);
});
