import assert from "node:assert/strict";
import { test } from "node:test";
import { CHUNK } from "../grounds.ts";
import {
  flowCode,
  flowOfCode,
  isFlowCode,
  KH_MOVE,
  type MoveEnv,
  NO_INPUT,
  newBody,
  openFloor,
  SPIN_LEN,
  stepBody,
} from "../move/index.ts";
import { type GroundSolid, groundSolidsIn } from "../shapes/grounds.ts";
import { box3 } from "../shapes/index.ts";
import { flowParts, GroundsFlow } from "./flow.ts";

// Flowmotion out on the Grounds (physics/flow.ts): what each solid is, as the move core asks it

const at0 = () => ({ elev: 0 });
const only = (s: GroundSolid[]) => (cx: number, cz: number) => (cx === 0 && cz === 0 ? s : []);

test("GroundsFlow: lamp posts and trunks are poles; fences rails; buildings walls to run, low walls none", () => {
  const solids: GroundSolid[] = [
    { what: "lamp_town", s: { t: "cyl", x: 5, z: 5, r: 0.1, y0: 0, y1: 4 } },
    { what: "tree_pine", s: { t: "cyl", x: 9, z: 5, r: 1.2, y0: 0, y1: 8 } }, // (too fat)
    { what: "fence", s: box3(10, 9.95, 16, 10.05, 0, 1.2) },
    { what: "building", s: box3(20, 0, 30, 10, 0, 6) },
    { what: "fit", s: box3(0, 20, 4, 24, 0, 1) }, // (too low)
    { what: "bench", s: box3(0, 28, 2, 29, 0, 0.5), blocks: "seat" },
  ];
  const p = flowParts(solids);
  assert.equal(p.poles.length, 1);
  assert.equal(p.rails.length, 1);
  assert.equal(p.walls.length, 1);
  assert.equal(p.walls[0].run, true);

  const f = new GroundsFlow(at0, only(solids));
  assert.deepEqual(f.pole(5.5, 5, 0, 0.5), { x: 5, y: 5, r: 0.1, top: 4 });
  assert.equal(f.pole(7, 5, 0, 0.5), null);
  // the fence's top, along x, the point under me
  const r = f.rail(12, 10.1, 1.1, 0.32);
  assert.ok(r && Math.abs(r.z - 1.2) < 1e-9 && Math.abs(Math.abs(r.ux) - 1) < 1e-9 && Math.abs(r.x - 12) < 1e-9);
  assert.ok(r && Math.abs(r.back + r.ahead - 6) < 1e-9);
  // the building's west face from the west: its normal −x, a wall to run (6 m over my feet)
  const w = f.wall(19.6, 5, 0, 1, 0, 0.55);
  assert.ok(w && Math.abs(w.nx + 1) < 1e-9 && Math.abs(w.ny) < 1e-9 && w.run && w.top === 6);
  assert.ok(w && Math.abs(w.d - 0.15) < 1e-9);
  // up on its roof's level, nothing beside me
  assert.equal(f.wall(19.6, 5, 6.2, 1, 0, 0.55), null);
});

test("GroundsFlow: a roof's first step flush on a building's wall is the same wall, to its top", () => {
  const solids: GroundSolid[] = [
    { what: "building", s: box3(20, 0, 30, 10, 0, 4.2) },
    { what: "roof", s: box3(20, 0, 30, 10, 4.2, 5.7) },
    { what: "roof", s: box3(21.7, 0, 28.3, 10, 5.7, 7.2) }, // (set back: not the face's)
  ];
  const f = new GroundsFlow(at0, only(solids));
  const w = f.wall(19.6, 5, 0, 1, 0, 0.55);
  assert.ok(w && Math.abs(w.top - 5.7) < 1e-9 && w.run, `to the roof's first step: ${w?.top}`);
  // up past the wall's own top, the roof's step is still the face beside me
  assert.ok(f.wall(19.6, 5, 4.5, 1, 0, 0.55)?.top === 5.7);
});

test("GroundsFlow: a turned rail and wall, and a floor's frame", () => {
  const a = Math.PI / 4;
  // a rail 6 long turned 45° (its local +x on the floor: (cos a, −sin a))
  const rail: GroundSolid = {
    what: "bridge_rail",
    s: { t: "box", x: 10, y: 0.55, z: 10, hx: 3, hy: 0.55, hz: 0.04, a },
  };
  const wall: GroundSolid = { what: "tower", s: { t: "box", x: 20, y: 4, z: 20, hx: 2, hy: 4, hz: 2, a } };
  const f = new GroundsFlow(() => ({ elev: 2 }), only([rail, wall]));
  // (the floor's x, y the world's; its heights over its own height)
  const r = f.rail(10, 10, 1.1 - 2, 0.3);
  assert.ok(r, "on the rail's middle");
  assert.ok(Math.abs(r.ux - Math.cos(a)) < 1e-9 && Math.abs(r.uy + Math.sin(a)) < 1e-9, "along its turn");
  assert.ok(Math.abs(r.z - (1.1 - 2)) < 1e-9);
  // the tower's corner faces turned too: from straight out along its local +x, the normal is that
  const out = 2 + 0.25 + 0.1;
  const w = f.wall(20 + Math.cos(a) * out, 20 - Math.sin(a) * out, 0 - 2, -1, 0, 0.55);
  assert.ok(w && Math.abs(w.nx - Math.cos(a)) < 1e-9 && Math.abs(w.ny + Math.sin(a)) < 1e-9);
  assert.ok(w && Math.abs(w.d - 0.1) < 1e-9 && w.top === 8 - 2);
});

test("GroundsFlow: a grind runs on from one fence stretch onto the next past its post", () => {
  const solids: GroundSolid[] = [
    { what: "fence", s: box3(2, 9.95, 5, 10.05, 0, 1.2) },
    { what: "fence", s: box3(5, 9.95, 8, 10.05, 0, 1.2) },
  ];
  // (a floor with nothing to stand on over it: only the flow's runs hold the body up)
  const env: MoveEnv = {
    grid: openFloor(() => Number.POSITIVE_INFINITY),
    footing: () => "floor",
    flow: new GroundsFlow(at0, only(solids)),
  };
  const b = newBody(2.5, 10.1, 1.5);
  b.up = true;
  b.vz = -1;
  b.vx = 3;
  const kinds: string[] = [];
  let ends = 0;
  for (let i = 0; i < 120 * 0.8; i++) {
    const ev = stepBody(b, { ...NO_INPUT }, env, KH_MOVE);
    if (ev.flow) kinds.push(ev.flow);
    if (ev.flowEnd) ends++;
  }
  assert.deepEqual(kinds, ["grind"], "one grind");
  assert.equal(ends, 1, "off the far end only");
  assert.ok(b.x > 8);
});

test("GroundsFlow: the real Grounds — every lamp a pole, its fences rails", () => {
  // (the first chunk with a lamp post in it, and one with a fence)
  let lamp: { x: number; z: number } | null = null;
  let fence = false;
  for (let cx = -4; cx <= 4 && !(lamp && fence); cx++)
    for (let cz = -4; cz <= 4 && !(lamp && fence); cz++) {
      const s = groundSolidsIn(cx, cz);
      const l = s.find((g) => g.what.startsWith("lamp_") && g.s.t === "cyl");
      if (l && l.s.t === "cyl" && !lamp) lamp = { x: l.s.x, z: l.s.z };
      if (flowParts(s).rails.length) fence = true;
    }
  assert.ok(lamp, "a lamp somewhere near the middle");
  assert.ok(fence, "a fence somewhere near the middle");
  const f = new GroundsFlow(at0);
  const lp = lamp as { x: number; z: number };
  const base = groundSolidsIn(Math.floor(lp.x / CHUNK), Math.floor(lp.z / CHUNK)).find(
    (g) => g.s.t === "cyl" && g.s.x === lp.x && g.s.z === lp.z,
  );
  const y0 = base && base.s.t === "cyl" ? base.s.y0 : 0;
  assert.ok(f.pole(lp.x + 0.5, lp.z, y0, 0.6), "the lamp, from beside it");
});

test("Flowmotion on the wire: a move's byte and back (its side), nonsense refused, a spin or a climb that's over is none", () => {
  for (const kind of ["wallrun", "wallside", "swing", "grind", "hang", "climb", "spin"] as const)
    for (const side of [1, -1]) {
      const back = flowOfCode(flowCode({ kind, side }), 0.1, KH_MOVE);
      assert.equal(back?.kind, kind);
      assert.equal(back?.side, side);
    }
  assert.equal(flowCode(null), 0);
  assert.equal(flowOfCode(0, 0, KH_MOVE), null);
  for (const bad of [99, -1, 1.5, "grind", 8, 32]) assert.equal(isFlowCode(bad), false, String(bad));
  assert.equal(isFlowCode(4 + 16), true);
  assert.equal(flowOfCode(flowCode({ kind: "spin", side: 1 }), SPIN_LEN + 0.1, KH_MOVE), null);
  assert.equal(flowOfCode(flowCode({ kind: "climb", side: 1 }), 1, KH_MOVE), null);
});

test("the building's: its walls with the outside on a side to run, up to the storey; the parkour pieces outside", async () => {
  const { blankMap } = await import("../map-edit.ts");
  const { canPlace } = await import("../build.ts");
  const { STOREY } = await import("../units.ts");
  const { buildingSolids } = await import("./build.ts");
  // a 12 × 8 studio, its east third out of doors (x 8..11) behind a wall at x 8, a wall inside at x 4
  const map = blankMap("t", "t", 12, 8);
  map.tiles = map.tiles.map((r) => `${r.slice(0, 8)}${" ".repeat(4)}`);
  map.vWalls = map.vWalls.map((r) => `${r.slice(0, 4)}p${r.slice(5, 8)}p${r.slice(9)}`);
  const pole = (id: string, x: number) => ({ id, kind: "pk_pole", x, y: 3 });
  const b = buildingSolids(map, [pole("out", 10), pole("in", 2)]);
  const walls = b.flow.filter((g) => g.what === "building_wall");
  assert.ok(walls.length > 0);
  assert.equal(walls.filter((g) => Math.abs(g.s.x - 4) < 0.2).length, 0, "the wall inside isn't Flowmotion's");
  assert.ok(walls.every((g) => g.s.t === "box" && Math.abs(g.s.y + g.s.hy - STOREY) < 1e-6));
  const poles = b.flow.filter((g) => g.what === "pk_pole" && g.s.t === "cyl");
  assert.equal(poles.length, 1, "the pole indoors isn't");
  assert.ok(Math.abs(poles[0].s.x - 10.5) < 1e-6);

  const f = new GroundsFlow(at0, () => []);
  f.building(b.flow);
  // out of doors east of the wall at x 8, against it: to run, as high as the storey
  const w = f.wall(8.4, 3.5, 0, -1, 0, 0.55);
  assert.ok(w && Math.abs(w.nx - 1) < 1e-9 && w.run && Math.abs(w.top - STOREY) < 1e-6);
  const p = poles[0].s;
  assert.ok(p.t === "cyl" && f.pole(10.8, 3.5, p.y0, 0.5));
  // never built indoors
  assert.equal(canPlace(map, [], { id: "x", kind: "pk_pole", x: 2, y: 3 }), false);
  assert.equal(canPlace(map, [], { id: "x", kind: "column", x: 2, y: 3 }), true);
});

test("god mode's parkour pieces on the Grounds: a rail to grind, walls to run, poles to swing round", async () => {
  const { applyEdits, groundAt } = await import("../grounds.ts");
  const { addThing } = await import("../grounds-things.ts");
  const { NO_EDITS } = await import("../grounds-edits.ts");
  // (the farm's field: no road, no building), 8 m apart along x
  const at = (i: number) => ({ x: 446.5 - 20 + i * 8, z: -252.5 });
  const kinds = ["pk_rail", "pk_rail_long", "pk_wall", "pk_wall_tall", "pk_pole", "pk_pole_tall"] as const;
  let e = NO_EDITS;
  for (const [i, kind] of kinds.entries()) e = addThing(e, { key: `god-thing-${i + 1}`, kind, ...at(i), ry: 0 });
  applyEdits(e);
  try {
    const f = new GroundsFlow(at0);
    const y = (i: number) => groundAt(at(i).x, at(i).z);
    for (const i of [0, 1]) {
      const r = f.rail(at(i).x + 0.5, at(i).z + 0.05, y(i) + 0.9, 0.32);
      assert.ok(r && Math.abs(r.z - y(i) - 0.9) < 1e-6, kinds[i]);
    }
    for (const [i, h] of [
      [2, 3.2],
      [3, 6],
    ]) {
      // its south face from the south, at its foot
      const w = f.wall(at(i).x, at(i).z + 0.45, y(i), 0, -1, 0.55);
      assert.ok(w?.run && Math.abs(w.ny - 1) < 1e-9 && Math.abs(w.top - y(i) - h) < 1e-6, kinds[i]);
    }
    for (const [i, h] of [
      [4, 3],
      [5, 5.5],
    ]) {
      const p = f.pole(at(i).x + 0.5, at(i).z, y(i), 0.5);
      assert.ok(p && Math.abs(p.top - y(i) - h) < 1e-6, kinds[i]);
    }
  } finally {
    applyEdits(NO_EDITS);
  }
});

test("GroundsFlow: a big building's every face, whichever chunk its middle's in (the hall, books, hotel, church)", async () => {
  const { BUILDINGS, terrainAt } = await import("../grounds.ts");
  const f = new GroundsFlow(at0);
  for (const key of ["hall", "books", "hotel", "church"]) {
    const b = BUILDINGS.find((u) => u.key === key);
    assert.ok(b, key);
    const mx = (b.x0 + b.x1) / 2;
    const mz = (b.z0 + b.z1) / 2;
    // 0.4 out from each face, a metre in from its corner: facing it
    for (const [x, z, ux, uy] of [
      [b.x0 - 0.4, b.z0 + 1, 1, 0],
      [b.x1 + 0.4, b.z1 - 1, -1, 0],
      [b.x0 + 1, b.z0 - 0.4, 0, 1],
      [b.x1 - 1, b.z1 + 0.4, 0, -1],
      [b.x0 - 0.4, mz, 1, 0],
      [mx, b.z0 - 0.4, 0, 1],
    ]) {
      // (the church's steeple stands out of its south face, its door in the middle: west and north)
      if (key === "church" && uy === -1) continue;
      const w = f.wall(x, z, terrainAt(x, z), ux, uy, 0.55);
      assert.ok(w?.run, `${key} at (${x}, ${z})`);
    }
  }
});

test("grounds.ts wallsHigh is the shapes' wall height for every building but the houses (the view's cut uses it)", async () => {
  const { BUILDINGS, wallsHigh } = await import("../grounds.ts");
  const { shellHeight } = await import("../shapes/grounds.ts");
  for (const b of BUILDINGS) if (b.kind !== "house") assert.equal(wallsHigh(b), shellHeight(b), b.key);
});
