import assert from "node:assert/strict";
import { test } from "node:test";
import { campusBuilding, entranceZOf, upgradeGround, upgradeLot } from "./building.ts";
import { parkedPose } from "./car/park.ts";
import type { WorldObjectDef } from "./catalog.ts";
import { LOT, lotLayout } from "./lot.ts";
import type { LevelDef, MapDef } from "./map.ts";
import { studio } from "./maps/studio.ts";
import { openingsIntoWalls } from "./openings.ts";
import { splitAll } from "./tops.ts";

// The lot made today's in a stored world (docs/plan/42-the-lot.md): a world built before plan 42
// has the old lot's tiles (no pavement, 48 or 60 deep), its lamps in the bays' mouths, its cars
// wherever they were left. upgradeLot stamps the new one once, puts each seeded car in its own
// bay, re-parks the others on it, and leaves alone what's driven or off the lot.

/** A world as the server has it today: the building, the courtyard's blocks in its ground floor. */
function world() {
  const into = openingsIntoWalls(studio, splitAll(studio.objects).objects);
  const b = campusBuilding(into.map, into.objects);
  assert.ok(b);
  const moved = new Map(b.moved.map((o) => [o.id, o]));
  const objects = [...into.objects.map((o) => moved.get(o.id) ?? o), ...b.add];
  const map = upgradeGround(b.map) ?? b.map;
  return { map, objects };
}
const ground = (map: MapDef) => map.levels?.find((l) => l.index === 0) as LevelDef;
// the building's coords → the ground floor's, and a car's middle back
const F = (l0: LevelDef, x: number, z: number) => ({ x: Math.floor(x - l0.ox), y: Math.floor(z - l0.oy) });
const mid = (l0: LevelDef, o: WorldObjectDef) => {
  const p = parkedPose(o);
  return { x: p.x + l0.ox, z: p.y + l0.oy };
};

/** The same world as it was before plan 42: the old lot, `deep` far south, things on it. */
function before(deep: 48 | 60) {
  const { map, objects } = world();
  const l0 = ground(map);
  const rows = l0.tiles.map((r) => [...r]);
  for (let z = LOT.z0; z < LOT.z1; z++)
    for (let x = LOT.x0; x < LOT.x1; x++) rows[z - l0.oy][x - l0.ox] = z < deep ? "a" : " ";
  const level: LevelDef = {
    ...l0,
    tiles: rows.map((r) => r.join("")),
    areas: l0.areas.map((a) => (a.key === "lot" ? { ...a, h: deep + 8 } : a)),
  };
  const old = { ...map, levels: (map.levels ?? []).map((x) => (x.index === 0 ? level : x)) };
  // the old lamps (in the bays' mouths), the seeded cars where the old lot had them (anywhere on
  // it here, some left at an angle), a car built there, one being driven, one left on the land
  const oldLamps = [
    [-35.3, 1],
    [-35.3, 15],
    [-35.3, 29],
    [-53, 1],
    [-53, 15],
    [-53, 29],
    [-11, -4],
    [-11, 44],
  ];
  const things = objects.map((o): WorldObjectDef => {
    const lamp = /^lamp-post-(\d)$/.exec(o.id);
    if (lamp) return { ...o, ...F(l0, oldLamps[Number(lamp[1])][0], oldLamps[Number(lamp[1])][1]), rot: 0 };
    const car = /^car-(\d+)$/.exec(o.id);
    if (!car) return o;
    const i = Number(car[1]);
    if (i === 7) return { ...o, ...F(l0, -58, 70), props: { ...o.props, a: 0.4 } };
    const at = F(l0, -50 + (i % 4) * 9, -2 + Math.floor(i / 4) * 11);
    return { ...o, ...at, rot: i % 2 ? 0 : 2, props: { ...o.props, ...(i % 3 ? {} : { a: 0.3 + i * 0.01 }) } };
  });
  const builder: WorldObjectDef = {
    id: "b-car-test",
    kind: "car",
    ...F(l0, -31, 46),
    rot: 0,
    props: { level: 0, variant: 2 },
  };
  const driven = things.find((o) => o.id === "car-5") as WorldObjectDef;
  const drivenNow = { ...driven, props: { ...driven.props, driven: "sid-1" } };
  return {
    map: old,
    objects: [...things.map((o) => (o.id === "car-5" ? drivenNow : o)), builder],
  };
}

for (const deep of [48, 60] as const)
  test(`the lot made today's in a world built before it (its old lot ${deep} deep)`, () => {
    const was = before(deep);
    const up = upgradeLot(was.map, was.objects);
    assert.ok(up, "an old lot is made today's");
    const l0 = ground(up.map);
    const fresh = ground(world().map);
    // its tiles: the asphalt and the pavement as a new world has them, down to z 60
    for (let z = LOT.z0; z < LOT.z1; z++)
      assert.equal(
        l0.tiles[z - l0.oy].slice(LOT.x0 - l0.ox, LOT.x1 - l0.ox),
        fresh.tiles[z - fresh.oy].slice(LOT.x0 - fresh.ox, LOT.x1 - fresh.ox),
        `row z ${z}`,
      );
    assert.equal(l0.areas.find((a) => a.key === "lot")?.h, LOT.z1 - LOT.z0);
    // once only
    assert.equal(upgradeLot(up.map, up.objects), null, "a second time: nothing");

    const l = lotLayout(entranceZOf(up.map));
    const by = new Map(up.objects.map((o) => [o.id, o]));
    // the lamps: on the islands, reaching over the aisles
    for (const [i, m] of l.lamps.entries()) {
      const o = by.get(`lamp-post-${i}`) as WorldObjectDef;
      assert.deepEqual({ x: o.x, y: o.y, rot: o.rot }, { ...F(l0, m.x, m.z), rot: m.rot }, `lamp ${i}`);
    }
    // each seeded car on the lot in its own bay, square (no angle left)
    for (const [i, c] of l.cars.entries()) {
      if (i === 5 || i === 7) continue;
      const o = by.get(`car-${i}`) as WorldObjectDef;
      const at = mid(l0, o);
      assert.ok(Math.hypot(at.x - c.x, at.z - c.z) < 0.02, `car-${i} in its bay (${at.x}, ${at.z})`);
      assert.equal(o.rot, c.dir > 0 ? 0 : 2);
      assert.equal(o.props?.a, undefined);
    }
    // the one being driven and the one on the land: as they were
    for (const id of ["car-5", "car-7"])
      assert.deepEqual(
        by.get(id),
        was.objects.find((o) => o.id === id),
        `${id} left be`,
      );
    // the builder's car: in a plain bay, no seeded car's, square
    const b = mid(l0, by.get("b-car-test") as WorldObjectDef);
    const bay = l.bays.findIndex((q) => Math.hypot(q.x - b.x, q.z - b.z) < 0.02);
    assert.ok(bay >= 0, "the builder's car in a bay");
    assert.equal(l.bays[bay].kind, "plain");
    assert.ok(!l.cars.some((c) => c.x === l.bays[bay].x && Math.abs(c.z - l.bays[bay].z) < 1), "not a seeded car's");
    assert.ok(Math.hypot(b.x + 31, b.z - 46) < 8, "the bay nearest where it was");
    // nothing else moved
    const moved = new Set(up.moved.map((o) => o.id));
    for (const o of was.objects)
      if (!/^(car-\d+|lamp-post-\d|b-car-test)$/.test(o.id)) assert.ok(!moved.has(o.id), `${o.id} not moved`);
  });

test("a new world has today's lot already (nothing to make)", () => {
  const { map, objects } = world();
  assert.equal(upgradeLot(map, objects), null);
});
