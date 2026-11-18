// God mode's vehicles (docs/plan/102-god-mode-vehicles.md): the homes with its edits over the code's, the checks.
import assert from "node:assert/strict";
import { test } from "node:test";
import { editsCount, mergeEdits } from "../grounds-draft.ts";
import type { GroundsEdits } from "../grounds-edits.ts";
import { checkVehicles, defOfHome, HOME_CARS, homesOf, newVehicleKey } from "./homes.ts";
import { validLook } from "./look.ts";
import { isCarKind } from "./specs.ts";

const ok = { kind: isCarKind, look: (k: string, l: unknown) => !!validLook(k as never, l) };

test("no edits: the town's own, as the code has them", () => {
  assert.equal(homesOf(null), HOME_CARS);
  assert.equal(homesOf({ rev: 0, vehicles: {} }), HOME_CARS);
});

test("a town vehicle moved and repainted, one taken away, one placed", () => {
  const a = HOME_CARS[0];
  const b = HOME_CARS[1];
  const e: GroundsEdits = {
    rev: 1,
    vehicles: {
      change: { [a.id]: { x: a.x + 5, z: a.z, a: 1, look: { variant: "saloon-gl", colour: 0x22385e } } },
      remove: [b.id],
      add: [
        { key: "god-car-1", model: "bike_bmx", x: 10, z: 20, a: 0.5, look: { variant: "bmx-free", colour: 0x00a8c6 } },
      ],
    },
  };
  const hs = homesOf(e);
  assert.equal(hs.length, HOME_CARS.length);
  const a2 = hs.find((h) => h.id === a.id);
  assert.equal(a2?.x, a.x + 5);
  assert.equal(a2?.look?.variant, "saloon-gl");
  assert.equal(a2?.model, a.model, "its kind kept");
  assert.ok(!hs.some((h) => h.id === b.id), "taken away");
  const g = hs.find((h) => h.id === "god-car-1");
  assert.equal(g?.model, "bike_bmx");
  assert.deepEqual(defOfHome(g ?? a).look, { variant: "bmx-free", colour: 0x00a8c6 });
  assert.equal(newVehicleKey(e), "god-car-2");
  // (counted and merged as the other sections are)
  const n = editsCount({ rev: 0 }, e);
  assert.deepEqual(n.vehicles, { add: 1, change: 1, remove: 1 });
  const m = mergeEdits({ rev: 0 }, e, { rev: 2 });
  assert.deepEqual(m.edits.vehicles, e.vehicles);
});

test("the checks: a kind there is, a place that's a number, a look it may have", () => {
  const bad: GroundsEdits = {
    rev: 1,
    vehicles: {
      add: [
        { key: "god-car-1", model: "spaceship", x: 0, z: 0, a: 0 },
        { key: "god-car-2", model: "sedan", x: Number.NaN, z: 0, a: 0 },
        { key: "god-car-3", model: "sedan", x: 0, z: 0, a: 0, look: { variant: "bmx-free", colour: 1 } },
        { key: "god car 4", model: "sedan", x: 0, z: 0, a: 0, role: "pirate" },
      ],
    },
  };
  const p = checkVehicles(bad, ok);
  assert.ok(p.some((x) => x.includes("spaceship")));
  assert.ok(p.some((x) => x.includes("god-car-2") && x.includes("number")));
  assert.ok(p.some((x) => x.includes("god-car-3") && x.includes("look")));
  assert.ok(p.some((x) => x.includes("role")));
  assert.ok(p.some((x) => x.includes("key")));
  const good: GroundsEdits = {
    rev: 1,
    vehicles: {
      add: [
        { key: "god-car-1", model: "bike_road", x: 3, z: 4, a: 0, look: { variant: "road-race", colour: 0x8e1c1c } },
      ],
    },
  };
  assert.deepEqual(checkVehicles(good, ok), []);
});
