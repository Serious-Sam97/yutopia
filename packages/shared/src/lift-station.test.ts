import assert from "node:assert/strict";
import { test } from "node:test";
import { liftFloorName, liftHere, liftMotion, liftShafts, shaftHoles, stationOf, stopOver } from "./lift.ts";
import { STOREY } from "./units.ts";

// Plan 72 phase 11: lifts stopping at mezzanines — a stop's station its floor and its height up it.

const m = { floor: 0 };
const stop = (id: string, level: number, deck?: number, at?: number) => ({
  id,
  kind: "elevator",
  x: 4,
  y: 4,
  yaw: 0,
  props: { shaft: "S", level, ...(deck && { deck }), ...(at !== undefined && { at }) },
});

test("a stop's station: its floor, and a mezzanine's height up it in storeys; named GM, 1M", () => {
  assert.equal(stationOf(stop("a", 0), m), 0);
  assert.equal(stationOf(stop("b", 0, 2.5), m), Math.round((2.5 / STOREY) * 1e4) / 1e4);
  assert.equal(stopOver(stop("c", 1, 9)), 0, "never past the storey");
  assert.deepEqual([0, 1, 2.5 / STOREY, 1 + 1 / STOREY].map(liftFloorName), ["G", "1", "GM", "1M"]);
  // the car at the mezzanine: there, not on the floor under it
  const up = stationOf(stop("b", 0, 2.5), m);
  assert.ok(liftHere(stop("b", 0, 2.5, up), m));
  assert.ok(!liftHere(stop("a", 0, undefined, up), m));
  assert.ok(liftMotion(stop("b", 0, 2.5, up), up, 0).here);
});

test("the shaft from the floor to a mezzanine opens the floor over it where its car reaches up", () => {
  const shafts = liftShafts([stop("a", 0), stop("b", 0, 2.5)], m);
  const list = shafts.get("S") ?? [];
  assert.deepEqual(
    list.map((s) => s.o.id),
    ["a", "b"],
    "lowest first",
  );
  // the car at 2.5 m is 2.5 m tall: through floor 1's slab (3.5 m up) — open there, and not floor 2's
  assert.equal(shaftHoles(shafts, 1).length, 1);
  assert.equal(shaftHoles(shafts, 2).length, 0);
  assert.equal(shaftHoles(shafts, 0).length, 0, "nothing under its lowest stop");
  // whole floors as before: 0 to 2 opens 1 and 2
  const whole = liftShafts([stop("a", 0), stop("c", 2)], m);
  assert.deepEqual(
    [0, 1, 2, 3].map((l) => shaftHoles(whole, l).length),
    [0, 1, 1, 0],
  );
});
