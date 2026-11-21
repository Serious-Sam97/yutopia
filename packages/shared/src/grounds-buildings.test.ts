import assert from "node:assert/strict";
import { test } from "node:test";
import { layoutOf } from "./building-styles.ts";
import {
  applyEdits,
  atPump,
  BUILDINGS,
  CHUNK,
  checkEdits,
  groundSurfaceAt,
  insideOf,
  steepleOf,
  WAYS,
  walkableCell,
} from "./grounds.ts";
import {
  addBuilding,
  buildingAt,
  buildingBlocked,
  changeBuilding,
  plotAt,
  removeBuilding,
} from "./grounds-buildings.ts";
import { type BuildingDef, NO_EDITS } from "./grounds-edits.ts";
import { groundSolidsIn } from "./shapes/grounds.ts";

// God mode's buildings (docs/plan/53-the-god-mode.md, phase 9): a house put down in the farm's
// field stands there, solid on its plot; turned to a side its builder doesn't draw, its solids
// turn with it; a gas station put down has its own forecourt (the town's pumps stay the town's);
// a church turned has its steeple on its new front; what the rule book and the pad refuse.

const FIELD = { x: 446.5, z: -238.5 };
const house = (p: Partial<BuildingDef> = {}): BuildingDef => ({
  key: "god-building-1",
  kind: "house",
  name: "Pine House",
  ...plotAt(FIELD.x, FIELD.z, 12, 10),
  floors: 2,
  face: "e",
  ...p,
});
const solidsOver = (b: { x0: number; z0: number; x1: number; z1: number }) => {
  const out = [];
  for (let cz = Math.floor((b.z0 - 4) / CHUNK); cz <= Math.floor((b.z1 + 4) / CHUNK); cz++)
    for (let cx = Math.floor((b.x0 - 4) / CHUNK); cx <= Math.floor((b.x1 + 4) / CHUNK); cx++)
      out.push(
        ...groundSolidsIn(cx, cz).filter(
          (g) =>
            (g.what === "building" || g.what === "roof" || g.what === "forecourt") &&
            g.s.x > b.x0 - 4 &&
            g.s.x < b.x1 + 4 &&
            g.s.z > b.z0 - 4 &&
            g.s.z < b.z1 + 4,
        ),
      );
  return out;
};

test("a house in the field: by the rules, on its plot, walked into (plan 111): walls round it, its floor a slab", () => {
  applyEdits(NO_EDITS);
  const e = addBuilding(NO_EDITS, house());
  assert.deepEqual(checkEdits(e), []);
  assert.equal(buildingBlocked(e, "god-building-1"), null);
  applyEdits(e);
  assert.equal(buildingAt(FIELD.x, FIELD.z), "god-building-1");
  assert.equal(groundSurfaceAt(FIELD.x, FIELD.z), "floor");
  // (empty inside, walked about in: its walls round it, its door open, its floor raised to the sill)
  assert.equal(walkableCell(Math.floor(FIELD.x), Math.floor(FIELD.z)), true);
  // (the one laid: its inside found by the building itself)
  const laid = BUILDINGS.find((u) => u.key === "god-building-1");
  assert.ok(laid);
  const inside = insideOf(laid);
  assert.ok(inside && inside.fy > 0.1 && inside.fits.length === 0, "empty inside, its floor at its sill");
  // (no solid mass over its plot: walls round it)
  assert.ok(!solidsOver(laid).some((g) => g.what === "building" && g.s.t === "box" && g.s.hx > 3 && g.s.hz > 3));
  // taken away: the field again
  applyEdits(removeBuilding(e, "god-building-1"));
  assert.equal(buildingAt(FIELD.x, FIELD.z), null);
  applyEdits(NO_EDITS);
});

test("any side (plan 110): a house's door north is laid facing north, its solids square on its plot", () => {
  applyEdits(addBuilding(NO_EDITS, house({ face: "n" })));
  const walls = solidsOver(house()).filter((g) => g.what === "building");
  assert.ok(walls.length);
  for (const g of walls) {
    assert.equal(g.s.t, "box");
    if (g.s.t === "box") assert.ok(Math.abs(Math.sin(g.s.a)) < 1e-9, "square to the axes");
  }
  const L = layoutOf(BUILDINGS.find((b) => b.key === "god-building-1") as never);
  assert.ok(L && L.door.oz === -1 && Math.abs(L.door.z - house().z0) < 0.01, "its door on its north face");
  applyEdits(NO_EDITS);
});

test("a gas station put down: its own forecourt, its kiosk built; the town's pumps stay the town's", () => {
  const g: BuildingDef = {
    ...house(),
    kind: "gas",
    name: "Field Gas",
    ...plotAt(FIELD.x, FIELD.z, 20, 16),
    floors: 1,
    face: "n",
  };
  const e = addBuilding(NO_EDITS, g);
  assert.deepEqual(checkEdits(e), []);
  applyEdits(e);
  const laid = BUILDINGS.find((b) => b.key === g.key);
  assert.ok(laid?.built, "its kiosk");
  const fc = solidsOver(g).filter((s) => s.what === "forecourt");
  assert.ok(fc.length >= 8);
  assert.ok(
    fc.every((s) => s.s.x > g.x0 && s.s.x < g.x1 && s.s.z > g.z0 && s.s.z < g.z1),
    "on its own plot",
  );
  // its forecourt walked, its islands not
  assert.equal(walkableCell(Math.floor(g.x0 + 10), Math.floor(g.z0 + 1)), true);
  assert.equal(walkableCell(Math.floor(g.x0 + 7), Math.floor(g.z0 + 5)), false);
  assert.equal(atPump(g.x0 + 9, g.z0 + 5), false, "no fuel here");
  applyEdits(NO_EDITS);
});

test("a meetinghouse church facing north: its steeple out past its north end", () => {
  const c: BuildingDef = {
    ...house(),
    kind: "church",
    name: "Field Chapel",
    ...plotAt(FIELD.x, FIELD.z, 14, 20),
    floors: 1,
    face: "n",
    style: "meetinghouse",
  };
  const s = steepleOf(c as never);
  assert.ok(s && s.z0 < c.z0 && s.z1 <= c.z0 + 1e-6, `the steeple north: ${JSON.stringify(s)}`);
  assert.deepEqual(checkEdits(addBuilding(NO_EDITS, c)), []);
});

test("refused: a style not its kind's, a colour not its style's, a silo walked into, on a road, on another", () => {
  const no = (d: BuildingDef) => checkEdits(addBuilding(NO_EDITS, d));
  // (plan 110: walked into on any side; its style, its colours its style's)
  assert.deepEqual(no(house({ face: "n", enter: true })), []);
  assert.ok(no(house({ style: "gambrel" })).some((p) => /style/.test(p)));
  assert.deepEqual(no(house({ style: "cape", colours: { walls: "#8a7a66" } })), []);
  assert.ok(no(house({ style: "cape", colours: { walls: "#123456" } })).some((p) => /colours/.test(p)));
  assert.ok(
    no({ ...house(), kind: "silo", ...plotAt(FIELD.x, FIELD.z, 8, 8), floors: 3, enter: true }).some((p) =>
      /walked into/.test(p),
    ),
  );
  assert.ok(no(house({ tint: "#123456" })).some((p) => /colours/.test(p)));
  assert.deepEqual(no(house({ tint: "#9fb5a2" })), []);
  const road = WAYS.find((w) => w.key === "farm-lane") as (typeof WAYS)[number];
  const [rx, rz] = road.line[2];
  const onRoad = house({ ...plotAt(rx, rz, 10, 10) });
  assert.ok(buildingBlocked(addBuilding(NO_EDITS, onRoad), onRoad.key));
  const farm = BUILDINGS.find((b) => b.kind === "farmhouse") as (typeof BUILDINGS)[number];
  const over = house({ ...plotAt((farm.x0 + farm.x1) / 2, (farm.z0 + farm.z1) / 2, 10, 10) });
  assert.match(buildingBlocked(addBuilding(NO_EDITS, over), over.key) ?? "", /on top of/);
  // the generator's moved onto the campus: refused; renamed: fine
  const shed = BUILDINGS.find((b) => b.kind === "shed") as (typeof BUILDINGS)[number];
  assert.ok(
    checkEdits(changeBuilding(NO_EDITS, shed.key, { x0: -10, z0: 0, x1: 2, z1: 10 })).some((p) =>
      /stays as it is/.test(p),
    ),
  );
  assert.deepEqual(checkEdits(changeBuilding(NO_EDITS, shed.key, { name: "The plough shed" })), []);
});

// Plan 111: every building that can be walked into is — its doorway under the door its style drew (the tiles under
// its width), its floor at that door's sill.
test("every walked-into building's doorway is under its drawn door, its floor at the sill", () => {
  applyEdits(NO_EDITS);
  let n = 0;
  for (const b of BUILDINGS) {
    const i = insideOf(b);
    const L = layoutOf(b);
    if (!i || !L) continue;
    n++;
    const d = L.door;
    const on = d.x >= b.x0 - 0.5 && d.x <= b.x1 + 0.5 && d.z >= b.z0 - 0.5 && d.z <= b.z1 + 0.5;
    if (!on) continue; // (a meetinghouse's: its door in its tower, out of the plot — its nave's front open behind)
    const c = i.door.dir === "h" ? d.x : d.z;
    assert.ok(
      c > i.door.from && c < i.door.to,
      `${b.key}: its doorway ${i.door.from}–${i.door.to} under its door at ${c}`,
    );
    assert.equal(i.fy, Math.max(0, d.y), `${b.key}: its floor at its sill`);
  }
  assert.ok(n > 30, `walked into: ${n}`);
});
