import assert from "node:assert/strict";
import { test } from "node:test";
import {
  applyEdits,
  atPump,
  BUILDINGS,
  CHUNK,
  checkEdits,
  groundSurfaceAt,
  steepleOf,
  turnOf,
  WAYS,
  walkableTile,
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

test("a house in the field: by the rules, on its plot, solid there, off the walking", () => {
  applyEdits(NO_EDITS);
  const e = addBuilding(NO_EDITS, house());
  assert.deepEqual(checkEdits(e), []);
  assert.equal(buildingBlocked(e, "god-building-1"), null);
  applyEdits(e);
  assert.equal(buildingAt(FIELD.x, FIELD.z), "god-building-1");
  assert.equal(groundSurfaceAt(FIELD.x, FIELD.z), "floor");
  assert.equal(walkableTile(Math.floor(FIELD.x), Math.floor(FIELD.z)), false);
  assert.ok(solidsOver(house()).some((g) => g.what === "building"));
  // taken away: the field again
  applyEdits(removeBuilding(e, "god-building-1"));
  assert.equal(buildingAt(FIELD.x, FIELD.z), null);
  applyEdits(NO_EDITS);
});

test("turned: a house's door north is its builder's east one turned a quarter, its solids too", () => {
  const t = turnOf(house({ face: "n" }) as never);
  assert.equal(t.k, 1);
  assert.equal(t.b.face, "e");
  assert.equal(t.b.x1 - t.b.x0, 10, "its sides swapped");
  applyEdits(addBuilding(NO_EDITS, house({ face: "n" })));
  const walls = solidsOver(house()).filter((g) => g.what === "building");
  assert.ok(walls.length);
  for (const g of walls) {
    assert.equal(g.s.t, "box");
    if (g.s.t === "box") assert.ok(Math.abs(Math.cos(g.s.a)) < 1e-9, "a quarter turned");
  }
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
  assert.equal(walkableTile(Math.floor(g.x0 + 10), Math.floor(g.z0 + 1)), true);
  assert.equal(walkableTile(Math.floor(g.x0 + 7), Math.floor(g.z0 + 5)), false);
  assert.equal(atPump(g.x0 + 9, g.z0 + 5), false, "no fuel here");
  applyEdits(NO_EDITS);
});

test("a church turned to face north: its steeple out past its north end", () => {
  const c: BuildingDef = {
    ...house(),
    kind: "church",
    name: "Field Chapel",
    ...plotAt(FIELD.x, FIELD.z, 14, 20),
    floors: 1,
    face: "n",
  };
  const s = steepleOf(c as never);
  assert.ok(s.z0 < c.z0 && s.z1 < c.z0 + 3, `the steeple north: ${JSON.stringify(s)}`);
  assert.deepEqual(checkEdits(addBuilding(NO_EDITS, c)), []);
});

test("refused: walked into with its door where its inside's isn't, a colour not theirs, on a road, on another", () => {
  const no = (d: BuildingDef) => checkEdits(addBuilding(NO_EDITS, d));
  assert.ok(no(house({ face: "n", enter: true })).some((p) => /walk into/.test(p)));
  assert.deepEqual(no(house({ face: "e", enter: true })), []);
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
