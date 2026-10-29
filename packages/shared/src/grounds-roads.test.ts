import assert from "node:assert/strict";
import { test } from "node:test";
import * as G from "./grounds.ts";
import { applyEdits, checkEdits, LAMPS, WAYS } from "./grounds.ts";
import { NO_EDITS } from "./grounds-edits.ts";
import {
  addWay,
  changeWay,
  insertAt,
  newWayKey,
  removeWay,
  snapEnd,
  WAY_DEFAULTS,
  wayBlocked,
  wayDefOf,
  wayLocked,
} from "./grounds-roads.ts";
import { route, routeOver } from "./route.ts";

// God mode's roads (docs/plan/53-the-god-mode.md, phase 7): a way drawn joins the one it ends on
// (the same height there), crosses the river on a bridge of its own, is lit along, is driven on
// by the GPS; a generator's way moved, or taken away; the shuttle's not; never over what's
// anchored.

routeOver(G);
const way = (key: string, pts: [number, number][]) => ({
  key,
  kind: "road" as const,
  name: key,
  ...WAY_DEFAULTS.road,
  pave: 0,
  pts,
});

test("a road drawn to the county road: joined at its height, lit along, by the rules, driven on", () => {
  applyEdits(NO_EDITS);
  // from the field south of the county road up to its middle (x 140, z −400)
  const end = snapEnd([140, -401.5]);
  assert.equal(end.to, "road");
  const key = newWayKey(NO_EDITS);
  const e = addWay(NO_EDITS, way(key, [[150, -300], [146, -350], end.p]));
  assert.deepEqual(checkEdits(e), []);
  applyEdits(e);
  const w = WAYS.find((u) => u.key === key);
  assert.ok(w, "laid");
  const road = WAYS.find((u) => u.key === "road") as (typeof WAYS)[number];
  const at = road.line.findIndex((p) => p[0] === end.p[0] && p[1] === end.p[1]);
  assert.ok(Math.abs(w.h[w.h.length - 1] - road.h[at]) < 0.05, `joined: ${w.h[w.h.length - 1]} | ${road.h[at]}`);
  assert.ok(
    LAMPS.some((l) => l.key.startsWith(`lamp:${key}:`)),
    "lit along",
  );
  // the GPS by car from its foot to the county road: along it
  const r = route([150, -300], [60, -408], "car");
  assert.ok(r?.ways.includes(WAYS.indexOf(w)), "the route takes it");
  applyEdits(NO_EDITS);
});

test("over the river: a bridge of its own", () => {
  applyEdits(NO_EDITS);
  const e = addWay(
    NO_EDITS,
    way("god-way-1", [
      [200, -150],
      [320, -150],
    ]),
  );
  applyEdits(e);
  const w = WAYS.find((u) => u.key === "god-way-1");
  assert.ok(w?.bridged.some(Boolean), "bridged where it crosses");
  assert.ok(!w?.bridged[0] && !w?.bridged[w.bridged.length - 1], "not at its ends");
  applyEdits(NO_EDITS);
});

test("the generator's: a trail moved, another taken away; the shuttle's widened, not moved; none over what's anchored", () => {
  applyEdits(NO_EDITS);
  const trail = wayDefOf("farm-lane");
  assert.ok(trail);
  const moved = trail.pts.map(([x, z]) => [x + 3, z] as [number, number]);
  let e = changeWay(NO_EDITS, "farm-lane", { pts: moved });
  e = removeWay(e, "south-woods");
  e = changeWay(e, "road", { w: 9, lamps: true });
  assert.deepEqual(checkEdits(e), []);
  applyEdits(e);
  assert.deepEqual(WAYS.find((u) => u.key === "farm-lane")?.pts, moved);
  assert.ok(!WAYS.some((u) => u.key === "south-woods"));
  assert.equal(WAYS.find((u) => u.key === "road")?.w, 9);
  // the shuttle's moved or taken away: refused
  assert.ok(wayLocked("road"));
  assert.ok(
    checkEdits(
      changeWay(NO_EDITS, "road", {
        pts: [
          [0, -400],
          [300, -400],
        ],
      }),
    ).some((p) => /Can't move road/.test(p)),
  );
  assert.ok(checkEdits(removeWay(NO_EDITS, "main")).some((p) => /Can't take away main/.test(p)));
  // into the campus: refused, said before it's drawn
  assert.ok(
    wayBlocked([
      [-100, 0],
      [0, 0],
    ]),
  );
  assert.ok(
    checkEdits(
      addWay(
        NO_EDITS,
        way("god-way-2", [
          [-100, 0],
          [0, 0],
        ]),
      ),
    ).some((p) => /stays as it is/.test(p)),
  );
  assert.ok(
    checkEdits(
      changeWay(NO_EDITS, "farm-lane", {
        pts: [
          [-100, 0],
          [0, 0],
        ],
      }),
    ).some((p) => /stays as it is/.test(p)),
  );
  // a new one taken away: as if never drawn
  const drawn = addWay(
    NO_EDITS,
    way("god-way-3", [
      [150, -300],
      [200, -300],
    ]),
  );
  assert.deepEqual(removeWay(drawn, "god-way-3").ways?.add, []);
  applyEdits(NO_EDITS);
});

test("a point put in where it's least out of the way", () => {
  const pts: [number, number][] = [
    [0, 0],
    [10, 0],
    [20, 10],
  ];
  assert.equal(insertAt(pts, [5, 1]), 0);
  assert.equal(insertAt(pts, [16, 4]), 1);
});
