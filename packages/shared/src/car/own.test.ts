import assert from "node:assert/strict";
import { test } from "node:test";
import { BUYABLE, cleanPlate, keysDay, mayDrive, plateOf } from "./own.ts";
import { SPECS } from "./specs.ts";

// Your own vehicle (docs/plan/43-the-spot.md): what MOTORS sells, a plate's rules, who takes the
// wheel — the owner, and whoever holds its keys today.

test("MOTORS sells every drivable vehicle; a plate keeps 8 of A–Z 0–9 · -", () => {
  assert.deepEqual([...BUYABLE].sort(), Object.keys(SPECS).sort());
  assert.equal(cleanPlate("ana.86!"), "ANA·86");
  assert.equal(cleanPlate("Tomás-1 two"), "TOMAS-1T");
  assert.equal(plateOf("", "Bia Souza"), "BIA");
  assert.equal(plateOf("!!", ""), "YTP·1986");
});

test("the wheel: anyone's for a pool car; the owner's; the keys' holder's, today only", () => {
  const now = Date.UTC(2026, 9, 24, 15);
  assert.ok(mayDrive({}, 9, now), "a pool car");
  const own = { ownerId: 7, lentTo: 9, lentDay: keysDay(now) };
  assert.ok(mayDrive(own, 7, now), "its owner");
  assert.ok(mayDrive(own, 9, now), "lent today");
  assert.ok(!mayDrive(own, 8, now), "someone else");
  assert.ok(!mayDrive(own, 9, now + 86_400_000), "the next day: back with the owner");
  // (the day is São Paulo's: 2:59 UTC is still yesterday there)
  assert.equal(keysDay(Date.UTC(2026, 9, 25, 2, 59)), keysDay(Date.UTC(2026, 9, 24, 15)));
  assert.notEqual(keysDay(Date.UTC(2026, 9, 25, 3, 1)), keysDay(Date.UTC(2026, 9, 24, 15)));
});
