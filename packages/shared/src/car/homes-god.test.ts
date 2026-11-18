// God mode's vehicles (docs/plan/102-god-mode-vehicles.md): the homes with its edits over the code's, the checks.
import assert from "node:assert/strict";
import { test } from "node:test";
import { editsCount, mergeEdits, sectionEffects } from "../grounds-draft.ts";
import type { GroundsEdits } from "../grounds-edits.ts";
import {
  addVehicle,
  changeVehicle,
  checkVehicles,
  defOfHome,
  HOME_CARS,
  homeProps,
  homesOf,
  movedProps,
  newVehicleKey,
  removeVehicle,
  vehicleSteps,
} from "./homes.ts";
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

test("God mode's steps: a placed one's own entry changed, taken away as if never; the town's by its key", () => {
  const h = HOME_CARS[0];
  let e: GroundsEdits = { rev: 0 };
  const key = newVehicleKey(e);
  e = addVehicle(e, { key, model: "bike_bmx", x: 1, z: 2, a: 0 });
  e = changeVehicle(e, key, { x: 5 });
  assert.equal(e.vehicles?.add?.[0].x, 5);
  assert.equal(e.vehicles?.change?.[key], undefined, "a placed one: its own entry");
  e = changeVehicle(e, h.id, { a: 1 });
  e = changeVehicle(e, h.id, { x: h.x + 2 });
  assert.deepEqual(e.vehicles?.change?.[h.id], { a: 1, x: h.x + 2 });
  e = removeVehicle(e, key);
  assert.equal(e.vehicles?.add?.length, 0, "as if never placed");
  e = removeVehicle(e, h.id);
  e = removeVehicle(e, h.id);
  assert.deepEqual(e.vehicles?.remove, [h.id]);
});

test("what laying edits does to the vehicles: homes made, changed, gone; others once; nothing the second time", () => {
  const [a, b] = HOME_CARS;
  const was: GroundsEdits = { rev: 1, vehicles: { change: { "car-3": { x: 10, z: 10 } } } };
  const now: GroundsEdits = {
    rev: 2,
    vehicles: {
      add: [{ key: "god-car-1", model: "hatch", x: 1, z: 2, a: 0 }],
      change: { [a.id]: { x: a.x + 3 }, "car-3": { x: 10, z: 10 }, "car-4": { a: 1 } },
      remove: [b.id, "car-5"],
    },
  };
  const steps = vehicleSteps(was, now, sectionEffects);
  const by = new Map(steps.map((s) => [s.id, s]));
  assert.ok("home" in (by.get(a.id) ?? {}) && (by.get(a.id) as { home: { x: number } }).home.x === a.x + 3);
  assert.ok("home" in (by.get("god-car-1") ?? {}), "placed: a home");
  assert.ok("gone" in (by.get(b.id) ?? {}));
  assert.deepEqual(by.get("car-4"), { id: "car-4", once: { a: 1 } });
  assert.deepEqual(by.get("car-5"), { id: "car-5", once: null });
  assert.equal(by.has("car-3"), false, "moved before: not again");
  assert.deepEqual(vehicleSteps(now, now, sectionEffects), [], "the same: nothing");
  // (rolled back: the town's as the code has them, the placed one gone)
  const back = new Map(vehicleSteps(now, { rev: 3 }, sectionEffects).map((s) => [s.id, s]));
  assert.deepEqual((back.get(a.id) as { home: unknown }).home, a);
  assert.ok("home" in (back.get(b.id) ?? {}), "taken away, back");
  assert.ok("gone" in (back.get("god-car-1") ?? {}));
});

test("a home's props: what it says, its alone; another moved: someone's own keeps its look", () => {
  const h = { ...HOME_CARS[0], look: { variant: "hatch-gl", colour: 0x123456 }, plate: "GOD 1" };
  const p = homeProps(h, { role: "taxi", look: { variant: "x" }, plate: "OLD", down: 1, lie: [0, 0, 0, 1], fuel: 0.4 });
  assert.equal(p.role, h.role);
  assert.deepEqual(p.look, { extras: [], wheels: "steel", variant: "hatch-gl", colour: 0x123456 });
  assert.equal(p.plate, "GOD 1");
  assert.equal(p.down, undefined, "set down standing");
  assert.equal(p.fuel, 0.4, "the rest kept");
  const own = movedProps(
    { ownerId: 7, look: { variant: "a" } },
    { look: { variant: "b", colour: 1 }, role: "taxi" },
    5,
  );
  assert.deepEqual([own.look, own.role, own.parkedAt], [{ variant: "a" }, undefined, 5]);
  const lot = movedProps({ role: "taxi" }, { role: "" }, 5);
  assert.equal(lot.role, undefined);
});
