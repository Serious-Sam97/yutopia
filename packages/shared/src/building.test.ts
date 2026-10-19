import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CAMPUS_HOME,
  CORE,
  campusBuilding,
  clearCoreFronts,
  GROUND_OFFSET,
  STAIRS_AT,
  upgradeCore,
} from "./building.ts";
import { entry, type WorldObjectDef } from "./catalog.ts";
import { Grid, moveStep, WALK_SPEED } from "./grid.ts";
import { hearingGain } from "./hearing.ts";
import { type Height, stepHeight } from "./jump.ts";
import { across, floorsOf, levelMap, objLevel, STOREY } from "./levels.ts";
import { liftFront, liftMotion } from "./lift.ts";
import { areaAt, type MapDef } from "./map.ts";
import { blankMap, layoutFromMap, mapFromLayout, validLayout } from "./map-edit.ts";
import { studio } from "./maps/studio.ts";
import { openingsIntoWalls } from "./openings.ts";
import { findPath } from "./path.ts";
import { floorChange } from "./stairs.ts";
import { splitAll } from "./tops.ts";

// the studio as the world-server loads it (doors and windows in the walls)
function world() {
  const into = openingsIntoWalls(studio, splitAll(studio.objects).objects);
  const b = campusBuilding(into.map, into.objects);
  assert.ok(b, "a studio with no floors gets the building");
  const moved = new Map(b.moved.map((o) => [o.id, o]));
  const objects = [...into.objects.map((o) => moved.get(o.id) ?? o), ...b.add];
  return { map: b.map, objects };
}

test("the building: five floors, the studio on top, things on their floors", () => {
  const { map, objects } = world();
  assert.deepEqual(floorsOf(map), [0, 1, 2, 3, 4]);
  assert.equal(map.floor, CAMPUS_HOME);
  // a second time: nothing (it has floors)
  assert.equal(campusBuilding(map, objects), null);
  // the studio's things stay on the studio (no level); the new ones say their floor
  const lamp = objects.find((o) => o.id === "lobby-lamp") as WorldObjectDef;
  assert.equal(objLevel(lamp, map), CAMPUS_HOME);
  assert.ok(!(lamp.x >= CORE.x && lamp.x < CORE.x + CORE.w && lamp.y >= CORE.y), "the lamp in the core's way moved");
  const cars = objects.filter((o) => o.kind === "car");
  assert.ok(cars.length >= 12, `cars on the lot (${cars.length})`);
  assert.ok(cars.every((c) => objLevel(c, map) === 0));
  // two elevator stops on every floor, stairs on every floor but the top
  for (const f of floorsOf(map)) {
    assert.equal(objects.filter((o) => o.kind === "elevator" && objLevel(o, map) === f).length, 2, `floor ${f}`);
    assert.equal(objects.filter((o) => o.kind === "stairs" && objLevel(o, map) === f).length, f === 4 ? 0 : 1);
  }
});

test("the ground floor: in through the glass doors, out to the lot", () => {
  const { map, objects } = world();
  const g = levelMap(map, 0) as MapDef;
  const grid = Grid.from(g, objects);
  const lobby = g.spawn;
  assert.ok(grid.fits(lobby.x, lobby.y), "the ground floor's arrival point is open floor");
  // a spot in the lot's aisle, west of the building
  const aisle = across(map, CAMPUS_HOME, 0, { x: -21, y: 4.5 });
  assert.ok(grid.fits(aisle.x, aisle.y), "the aisle is open asphalt");
  assert.ok(findPath(grid, lobby, aisle, 40000)?.length, "a way from the lobby to the lot");
  assert.equal(areaAt(g, lobby.x, lobby.y)?.name, "Lobby", "the lobby is the lobby");
  assert.equal(areaAt(g, aisle.x, aisle.y)?.name, "Parking lot");
  // a car is solid
  const car = objects.find((o) => o.kind === "car" && objLevel(o, map) === 0) as WorldObjectDef;
  assert.ok(!grid.fits(car.x + 2.5, car.y + 1), "cars are solid");
});

test("the stairs: walked step by step from the ground floor to floor 1, and back down", () => {
  const { map, objects } = world();
  const floors = floorsOf(map);
  const grids = new Map(floors.map((f) => [f, Grid.from(levelMap(map, f) as MapDef, objects)]));
  // the stairs in floor 0's coords; walk to points given in the building's coords
  let level = 0;
  let pos = across(map, CAMPUS_HOME, 0, { x: STAIRS_AT.x + 3, y: STAIRS_AT.y + 1.5 });
  const h: Height = { z: 0, vz: 0, up: false };
  let highest = 0;
  const walk = (bx: number, by: number) => {
    for (let i = 0; i < 400; i++) {
      const t = across(map, CAMPUS_HOME, level, { x: bx, y: by });
      const dx = t.x - pos.x;
      const dy = t.y - pos.y;
      const d = Math.hypot(dx, dy);
      if (d < 0.05) return;
      const grid = grids.get(level) as Grid;
      const step = Math.min(d, WALK_SPEED / 60);
      const next = moveStep(grid, pos, { x: dx / d, y: dy / d }, step * 60, 1 / 60, h.z);
      assert.ok(
        next.x !== pos.x || next.y !== pos.y,
        `stuck at ${pos.x.toFixed(2)},${pos.y.toFixed(2)} z ${h.z.toFixed(2)} on ${level}`,
      );
      pos = next;
      stepHeight(grid, pos.x, pos.y, h, 1 / 60);
      const ch = floorChange(h.z, level, floors);
      if (ch) {
        pos = across(map, level, ch.level, pos);
        level = ch.level;
        h.z += ch.dz;
      }
      highest = Math.max(highest, level * STOREY + h.z);
    }
    assert.fail(`didn't get to ${bx},${by}`);
  };
  // up flight A (the east half, away from the door), across the half landing,
  // up flight B (the west half) to the door one floor up
  walk(STAIRS_AT.x + 3, STAIRS_AT.y + 5.2);
  walk(STAIRS_AT.x + 1, STAIRS_AT.y + 6);
  walk(STAIRS_AT.x + 1, STAIRS_AT.y + 2.2);
  walk(STAIRS_AT.x + 1, STAIRS_AT.y + 1.2);
  assert.equal(level, 1, "on floor 1");
  assert.ok(Math.abs(h.z) < 0.05, `on its floor (z ${h.z})`);
  assert.ok(highest > STOREY - 0.2, "climbed a whole storey");
  // and back down the way we came
  walk(STAIRS_AT.x + 1, STAIRS_AT.y + 5.2);
  walk(STAIRS_AT.x + 3, STAIRS_AT.y + 6);
  walk(STAIRS_AT.x + 3, STAIRS_AT.y + 1.5);
  assert.equal(level, 0, "back on the ground floor");
  assert.ok(Math.abs(h.z) < 0.05);
});

test("the stairs: no walking off the landing into the well, nor up a flight from its side", () => {
  const { map, objects } = world();
  const g0 = Grid.from(levelMap(map, 0) as MapDef, objects);
  const at = (bx: number, by: number) => across(map, CAMPUS_HOME, 0, { x: bx, y: by });
  // by the door (floor level) the top of flight B is a storey up: no way in
  const door = at(STAIRS_AT.x + 1, STAIRS_AT.y + 1.5);
  assert.ok(g0.fitsAt(door.x, door.y, 0));
  const bTop = at(STAIRS_AT.x + 1, STAIRS_AT.y + 2.6);
  assert.ok(!g0.fitsAt(bTop.x, bTop.y, 0), "flight B's top isn't a step from the floor");
  // the top floor (nothing going up): a rail where the next flight would be
  const top = Grid.from(levelMap(map, CAMPUS_HOME) as MapDef, objects);
  assert.ok(top.hWallAt(STAIRS_AT.x + 2, STAIRS_AT.y + 2), "a rail over the flight below");
});

test("elevators: shut doors are a wall (inside, you still move); open, a way in; without the car, the shaft", () => {
  const { map, objects } = world();
  const g = levelMap(map, 2) as MapDef;
  const lift = objects.find((o) => o.kind === "elevator" && objLevel(o, map) === 2) as WorldObjectDef;
  const front = liftFront(lift);
  const inside = { x: lift.x + 1, y: lift.y + 1 };
  const as = (props: Record<string, unknown>) =>
    Grid.from(
      g,
      objects.map((o) => (o.id === lift.id ? { ...o, props: { ...o.props, ...props } } : o)),
    );
  const shut = as({ door: "closed", at: 2 });
  assert.ok(shut.fits(inside.x, inside.y), "the car's floor is there");
  assert.ok(!shut.clear(front, inside), "but its doors are shut");
  assert.ok(shut.clear(inside, { x: lift.x + 0.5, y: lift.y + 1.5 }), "inside, you can move about");
  const open = as({ door: "open", at: 2 });
  assert.ok(open.clear(front, inside), "open: in");
  assert.ok(!open.clear(inside, { x: lift.x + 1, y: lift.y + 2.6 }), "never out the back");
  const away = as({ door: "closed", at: 4 });
  assert.ok(!away.fits(inside.x, inside.y), "the car on another floor: nowhere to stand");
});

test("the core's doors: nothing stands in front of them", () => {
  const { map, objects } = world();
  const c = map.core as { x: number; y: number };
  const front = objects.filter(
    (o) => objLevel(o, map) === CAMPUS_HOME && o.y === c.y - 1 && o.x >= c.x && o.x < c.x + 6 && !entry(o.kind).wall,
  );
  assert.deepEqual(front, []);
  // a world built before that: its lamp moved aside on load
  const lamp: WorldObjectDef = { id: "lamp-x", kind: "lamp", x: c.x + 3, y: c.y - 1, rot: 0 };
  const moved = clearCoreFronts(map, [...objects, lamp]);
  assert.equal(moved.length, 1);
  assert.ok(moved[0].y !== c.y - 1 || moved[0].x >= c.x + 6, "out of the doors' way");
});

test("hearing: other floors are silent, but for the stairwell", () => {
  const { map } = world();
  const a = { x: 20, y: 20, level: 2 };
  assert.ok(hearingGain(map, a, { x: 20.5, y: 20, level: 2 }) > 0, "same floor, close by");
  assert.equal(hearingGain(map, a, { x: 20.5, y: 20, level: 3 }), 0, "the floor above, right over you");
  const s = { x: STAIRS_AT.x + 1, y: STAIRS_AT.y + 3, stairs: true };
  assert.ok(hearingGain(map, { ...s, level: 2 }, { ...s, level: 3 }) > 0, "up the stairwell, faintly");
  assert.equal(hearingGain(map, { ...s, level: 1 }, { ...s, level: 3 }), 0, "two floors: no");
  // the ground floor's coords are offset: the same spot of the building
  const g = across(map, CAMPUS_HOME, 0, { x: 20, y: 20 });
  assert.ok(hearingGain(map, { ...g, level: 0 }, { ...g, level: 0 }) > 0);
  void GROUND_OFFSET;
});

test("the building is saved and loaded whole (the layout carries its floors)", () => {
  const { map } = world();
  const l = layoutFromMap(map);
  assert.ok(validLayout(l), "a valid layout");
  assert.ok(validLayout(JSON.parse(JSON.stringify(l))), "through JSON too");
  const back = mapFromLayout(map.key, map.name, l);
  assert.equal(back.floor, CAMPUS_HOME);
  assert.deepEqual(floorsOf(back), [0, 1, 2, 3, 4]);
  assert.deepEqual(levelMap(back, 0)?.tiles, levelMap(map, 0)?.tiles);
  // a floor with a bad row, or two floors with one number: not stored
  const bad = JSON.parse(JSON.stringify(l));
  bad.levels[1].tiles[3] = "x";
  assert.ok(!validLayout(bad));
  const twice = JSON.parse(JSON.stringify(l));
  twice.levels[1].index = 0;
  assert.ok(!validLayout(twice));
});

test("a smaller studio: the core goes where it fits (and the map keeps where)", () => {
  const small = blankMap("lab", "Lab", 32, 24);
  const b = campusBuilding(small, []);
  assert.ok(b?.map.core, "a core");
  const c = b.map.core as { x: number; y: number };
  assert.ok(c.x >= 0 && c.y >= 0 && c.x + CORE.w <= 32 && c.y + CORE.h <= 24, `inside the map (${c.x},${c.y})`);
  for (const o of b.add.filter((o) => o.kind === "elevator" || o.kind === "stairs")) {
    const at = across(b.map, objLevel(o, b.map), CAMPUS_HOME, o);
    assert.ok(at.x >= c.x && at.x < c.x + CORE.w && at.y >= c.y && at.y < c.y + CORE.h, `${o.id} in the core`);
  }
  assert.deepEqual(mapFromLayout("lab", "Lab", layoutFromMap(b.map)).core, c);
});

test("an elevator's motion: the doors slide over their phase, the car rides between floors", () => {
  const stop = (props: Record<string, unknown>) => ({ props: { level: 2, ...props } });
  // opening on its floor: shut at first, open by the end, eased between
  const opening = stop({ ph: "opening", len: 1000, at: 2, to: 2 });
  assert.equal(liftMotion(opening, 2, 0).doors, 0);
  assert.ok(liftMotion(opening, 2, 0.5).doors > 0.3 && liftMotion(opening, 2, 0.5).doors < 0.7);
  assert.equal(liftMotion(opening, 2, 1.2).doors, 1);
  // another floor's stop: its doors stay shut, the car isn't there
  assert.equal(liftMotion(opening, 3, 0.8).doors, 0);
  assert.equal(liftMotion(opening, 3, 0.8).here, false);
  // a ride from 4 to 0 in 4 s: going down, halfway at the middle, there at the end
  const ride = stop({ ph: "moving", len: 4000, at: 4, to: 0 });
  assert.equal(liftMotion(ride, 4, 0).dir, -1);
  assert.ok(Math.abs(liftMotion(ride, 4, 2).car - 2) < 0.01);
  assert.ok(Math.abs(liftMotion(ride, 4, 4).car - 0) < 0.01);
  // a stop from before the motion was published: its door as it was
  assert.equal(liftMotion({ props: { door: "open", at: 2 } }, 2, 0).doors, 1);
});

test("a building with the first core (6 deep) is brought up to today's: a row north, 7 deep", () => {
  const { map, objects } = world();
  const c = map.core as { x: number; y: number };
  // as it was made before: the core a row south and 6 deep, its stops and stairs with it
  const was: MapDef = {
    ...map,
    core: { x: c.x, y: c.y + 1 },
    areas: map.areas.map((a) => (a.key.startsWith("core-") ? { ...a, y: a.y + 1, h: 6 } : a)),
  };
  const before = objects.map((o) => (o.kind === "elevator" || o.kind === "stairs" ? { ...o, y: o.y + 1 } : o));
  const up = upgradeCore(was, before);
  assert.ok(up, "upgraded");
  assert.deepEqual(up.map.core, c);
  assert.equal(up.map.areas.find((a) => a.key.startsWith("core-"))?.h, CORE.h);
  for (const o of up.objects.filter((x) => x.kind === "elevator" || x.kind === "stairs")) {
    const now = objects.find((x) => x.id === o.id) as WorldObjectDef;
    assert.equal(o.y, now.y, `${o.id} back where today's core has it`);
  }
  // today's needs nothing
  assert.equal(upgradeCore(map, objects), null);
});
