import assert from "node:assert/strict";
import { test } from "node:test";
import { editsCount } from "../grounds-draft.ts";
import type { GroundsEdits } from "../grounds-edits.ts";
import { defaultBehaviour, type NpcDef, parseNpc } from "./cast.ts";
import { checkNpcPlaces, inShift, jobFor, onDuty, placedType, placeOf, placesOf } from "./places.ts";
import { townCast } from "./town.ts";

// NPCs on the map (docs/plan/121-npcs-on-the-map.md): the draft's `npcs` section — placed, changed, taken away; checked.
const dora = parseNpc({ key: "npc-dora", name: "Dora", behaviour: { type: "counter" } }) as NpcDef;
const cast = new Map<string, NpcDef>([...townCast().map((d) => [d.key, d] as const), [dora.key, dora]]);
const ok = {
  npc: (k: string) => cast.get(k),
  home: (k: string) => k === "bakery",
  level: (l: number) => l === 0 || l === 32,
};

test("places: the section's entries, changed, taken away", () => {
  const e: GroundsEdits = {
    rev: 0,
    npcs: {
      add: [
        { key: "npc-dora", x: 1, z: 2, a: 0, level: 0 },
        { key: "folk-rosa", x: 5, z: 5, a: 1, level: 0, type: "wander", r: 6 },
        { key: "guard", x: 9, z: 9, a: 0, level: 0 },
      ],
      change: { "npc-dora": { x: 3, home: "bakery" } },
      remove: ["guard"],
    },
  };
  assert.deepEqual(
    placesOf(e).map((p) => [p.key, p.x, p.home]),
    [
      ["npc-dora", 3, "bakery"],
      ["folk-rosa", 5, undefined],
    ],
  );
  assert.equal(placeOf(e, "guard"), undefined);
  assert.deepEqual(placesOf({ rev: 0 }), []);
  // the publish dialog's count
  assert.equal(editsCount({ rev: 0 }, e).npcs.add, 2);
});

test("places: what they do — the placement's, else the cast's; a town NPC's own way set aside", () => {
  const rosa = cast.get("folk-rosa") as NpcDef;
  assert.equal(placedType(dora), "counter");
  assert.equal(placedType(dora, { type: "sit" }), "sit");
  assert.equal(placedType(rosa), "stand");
  assert.equal(placedType(rosa, { type: "route" }), "route");
  assert.equal(placedType({ behaviour: defaultBehaviour("wander") }), "wander");
});

test("places: checked — cast NPCs only, never Vortex, numbers, bounds, floors, homes", () => {
  const bad: GroundsEdits = {
    rev: 0,
    npcs: {
      add: [
        { key: "vortex", x: 0, z: 0, a: 0, level: 0 },
        { key: "npc-gone", x: 0, z: 0, a: 0, level: 0 },
        { key: "npc-dora", x: Number.NaN, z: 0, a: 0, level: 7, r: 99, pause: -1, home: "moon" },
        {
          key: "folk-lia",
          x: 0,
          z: 0,
          a: 0,
          level: 0,
          type: "fly" as "stand",
          route: [{ x: 1, z: Number.POSITIVE_INFINITY, level: 0 }],
        },
      ],
    },
  };
  const got = checkNpcPlaces(bad, ok).join("\n");
  for (const m of [
    "Vortex isn't placed",
    "npc-gone: not in the cast",
    "Dora: their place isn't a number",
    "Dora: no such floor (7)",
    "Dora: a wander's circle",
    "Dora: a pause",
    "Dora: their home isn't a town building (moon)",
    "Lia: no such thing to do (fly)",
    "Lia: a route's stop isn't a place",
  ])
    assert.ok(got.includes(m), m);
  const good: GroundsEdits = {
    rev: 0,
    npcs: {
      add: [
        { key: "npc-dora", x: 1, z: 2, a: 0, level: 32, home: "bakery" },
        {
          key: "folk-joe",
          x: 1,
          z: 2,
          a: 0,
          level: 0,
          type: "route",
          route: [{ x: 4, z: 4, level: 0 }],
          loop: true,
          pause: 5,
        },
      ],
    },
  };
  assert.deepEqual(checkNpcPlaces(good, ok), []);
});

test("places: on duty — always, by day, by night, a shift (past midnight too)", () => {
  const b = (hours: "always" | "day" | "night" | "shift", from = 8, to = 18) => ({ hours, from, to });
  assert.ok(onDuty(b("always"), 3, 1));
  assert.ok(onDuty(b("day"), 12, 0) && !onDuty(b("day"), 23, 1));
  assert.ok(onDuty(b("night"), 23, 1) && !onDuty(b("night"), 12, 0));
  assert.ok(onDuty(b("shift"), 9) && !onDuty(b("shift"), 18) && !onDuty(b("shift"), 7.5));
  assert.ok(onDuty(b("shift", 22, 6), 23) && onDuty(b("shift", 22, 6), 2) && !onDuty(b("shift", 22, 6), 12));
});

test("places: a workplace — a town building's storey, a job, a spot, a shift; checked; in the shift or not", () => {
  const work = { building: "bakery", job: "cashier" as const, spot: "till" as const, x: 1, z: 2, a: 0, level: 32 };
  const e = (w: unknown): GroundsEdits => ({
    rev: 0,
    npcs: { add: [{ key: "npc-dora", x: 1, z: 2, a: 0, level: 0, work: w as never }] },
  });
  const okW = { ...ok, storeyOf: (b: string, l: number) => b === "bakery" && l === 32 };
  assert.deepEqual(checkNpcPlaces(e({ ...work, from: 8, to: 17 }), okW), []);
  const got = [
    { ...work, building: "moon", from: 8, to: 17 },
    { ...work, job: "astronaut", from: 8, to: 17 },
    { ...work, spot: "roof", from: 8, to: 17 },
    { ...work, level: 33, from: 8, to: 17 },
    { ...work, from: 8, to: 8 },
    { ...work, x: Number.NaN, from: 8, to: 17 },
  ].map((w) => checkNpcPlaces(e(w), okW).join(""));
  for (const [i, m] of [
    "isn't in a town building",
    "no such job",
    "no such spot",
    "work's floor",
    "a shift is",
    "isn't a number",
  ].entries())
    assert.ok(got[i].includes(m), `${m}: ${got[i]}`);
  assert.ok(inShift({ from: 8, to: 17 }, 9) && !inShift({ from: 8, to: 17 }, 17));
  assert.ok(inShift({ from: 22, to: 6 }, 2) && !inShift({ from: 22, to: 6 }, 12));
  assert.deepEqual(jobFor("bar"), { job: "bartender", spot: "counter" });
  assert.deepEqual(jobFor("library"), { job: "librarian", spot: "desk" });
  assert.deepEqual(jobFor("shop"), { job: "cashier", spot: "till" });
});
