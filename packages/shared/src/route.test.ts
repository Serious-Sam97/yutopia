import assert from "node:assert/strict";
import { test } from "node:test";
import * as grounds from "./grounds.ts";
import { BUILDINGS, WAYS } from "./grounds.ts";
import { MOVE } from "./move/spec.ts";
import { doorOf, gpsPlaces, JOG, landmarks, offRoute, pointAt, route, routeOver } from "./route.ts";

routeOver(grounds);

test("the route's jog is the body's", () => assert.equal(JOG, MOVE.jog));

const bd = (key: string) => {
  const b = BUILDINGS.find((x) => x.key === key);
  assert.ok(b, key);
  return b;
};
const wayNames = (r: NonNullable<ReturnType<typeof route>>) => [
  ...new Set(r.ways.filter((w) => w >= 0).map((w) => WAYS[w].name)),
];

test("on foot: from the headquarters to the diner, by the driveway, the road and Main Street", () => {
  const r = route(doorOf(bd("hq")), doorOf(bd("diner")), "foot");
  assert.ok(r);
  const names = wayNames(r);
  for (const n of ["Driveway", "County road", "Main Street"]) assert.ok(names.includes(n), `${n} in ${names}`);
  // a sane length: longer than a straight line, not absurdly so
  const end = r.pts[r.pts.length - 1];
  const straight = Math.hypot(r.pts[0][0] - end[0], r.pts[0][1] - end[1]);
  assert.ok(r.dist > straight && r.dist < straight * 2.2, `${r.dist} vs ${straight}`);
  assert.ok(r.secs > 0);
  // the steps: a start, turns onto each way in order, an arrival
  assert.equal(r.steps[0].kind, "start");
  assert.equal(r.steps.at(-1)?.kind, "arrive");
  const onto = r.steps.filter((s) => s.kind === "turn").map((s) => s.way);
  assert.ok(onto.includes("Main Street"), `turns: ${onto}`);
  assert.ok(onto.indexOf("County road") < onto.indexOf("Main Street"));
  // steps in order along the route
  for (let i = 1; i < r.steps.length; i++) assert.ok(r.steps[i].at >= r.steps[i - 1].at);
});

test("by car: only the driveway, the road and the streets, never a trail", () => {
  const r = route(doorOf(bd("hq")), doorOf(bd("farmhouse")), "car");
  assert.ok(r);
  for (const w of r.ways) if (w >= 0) assert.ok(["driveway", "road", "street"].includes(WAYS[w].kind), WAYS[w].name);
  // on foot the same trip may take the farm lane (a trail)
  const f = route(doorOf(bd("hq")), doorOf(bd("farmhouse")), "foot");
  assert.ok(f);
  assert.ok(f.secs > 0);
});

test("near by: straight over the snow, no detour", () => {
  const from: [number, number] = [-40, -20];
  const to: [number, number] = [-55, -30];
  const r = route(from, to, "foot");
  assert.ok(r);
  assert.ok(r.dist < 25, `${r.dist}`);
});

test("the arrival says which side: the diner (on Main Street's south side, doors to the street), driving east", () => {
  const diner = bd("diner");
  // from the west end of Main Street, east along it
  const r = route([300, -405], doorOf(diner), "car");
  assert.ok(r);
  const arrive = r.steps.at(-1);
  assert.equal(arrive?.kind, "arrive");
  // south (+z) of an eastbound street is on the right
  assert.equal(arrive?.dir, "right");
  // and from the east end, driving west: on the left
  const back = route([530, -405], doorOf(diner), "car");
  assert.equal(back?.steps.at(-1)?.dir, "left");
});

test("off the route, and points along it", () => {
  const r = route(doorOf(bd("hq")), doorOf(bd("gatehouse")), "foot");
  assert.ok(r);
  const mid = pointAt(r, r.dist / 2);
  assert.ok(offRoute(r, mid).d < 0.5);
  assert.ok(Math.abs(offRoute(r, mid).at - r.dist / 2) < 2);
  assert.ok(offRoute(r, [mid[0] + 40, mid[1]]).d > 20);
});

test("places: the buildings (one of each name), the ways, the landmarks given", () => {
  const ps = gpsPlaces([...landmarks(), { key: "x", name: "The pond", p: [-200, -100] }]);
  assert.ok(gpsPlaces().some((p) => p.name === "The square" && p.kind === "landmark"));
  assert.ok(ps.some((p) => p.name === "Diner" && p.kind === "building"));
  assert.ok(ps.some((p) => p.name === "Main Street" && p.kind === "way"));
  assert.ok(ps.some((p) => p.name === "The pond" && p.kind === "landmark"));
  assert.equal(ps.filter((p) => p.name === "Townhouse").length, 0, "no rows of the same house");
  assert.equal(new Set(ps.map((p) => p.key)).size, ps.length);
});

test("on foot, everywhere the GPS lists is reachable from the headquarters (no way left on its own)", () => {
  const from = doorOf(bd("hq"));
  for (const p of gpsPlaces()) {
    const r = route(from, p.p, "foot");
    assert.ok(r, p.name);
    // over the snow only to get on and off the ways
    const legs = r.steps.length;
    assert.ok(legs >= 2, p.name);
    assert.ok(r.along[1] < 100 && r.dist - r.along[r.along.length - 2] < 100, `${p.name}: long legs off the ways`);
  }
});
