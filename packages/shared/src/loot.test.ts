import assert from "node:assert/strict";
import { test } from "node:test";
import { LOCKER, LOOT, nightBudget, nightOf, type Place, REFILL_MIN, rollLoot } from "./dark/loot.ts";
import { groundsRng, walkableTile } from "./grounds.ts";

test("every spot stands on walkable ground, ids unique, every place has some", () => {
  assert.equal(new Set(LOOT.map((s) => s.id)).size, LOOT.length);
  for (const s of LOOT) assert.ok(walkableTile(Math.floor(s.x), Math.floor(s.z)), `${s.id} at ${s.x}, ${s.z}`);
  const places = new Set(LOOT.map((s) => s.place));
  for (const p of Object.keys(REFILL_MIN)) assert.ok(places.has(p as Place), p);
  assert.equal(LOOT.filter((s) => s.place === "house").length, 14);
  assert.ok(LOOT.filter((s) => s.place === "glovebox").length > 10);
  assert.ok(walkableTile(Math.floor(LOCKER.x), Math.floor(LOCKER.z)), `the locker ${LOCKER.x}, ${LOCKER.z}`);
});

test("the ammo budget holds: no more rounds or shells than the night has", () => {
  const r = groundsRng(7);
  const b = nightBudget(2);
  const start = { ...b };
  let r38 = 0;
  let shell = 0;
  let other = 0;
  for (let i = 0; i < 2000; i++)
    for (const it of rollLoot(LOOT[i % LOOT.length].place, r, b)) {
      if (it.id === "r38") r38 += it.n;
      else if (it.id === "shell") shell += it.n;
      else if (it.id === "shotgun") shell += it.loaded ?? 0;
      else other += it.n;
    }
  assert.equal(r38, start.r38);
  assert.equal(shell, start.shell);
  assert.deepEqual(b, { r38: 0, shell: 0 });
  assert.ok(other > 1000, "with the ammo gone, the rest still turns up");
});

test("a night runs 18:00 to 18:00 in São Paulo", () => {
  const at = (d: number, h: number) => Date.UTC(2026, 9, d, h + 3); // São Paulo's hour h
  assert.equal(nightOf(at(20, 18)), nightOf(at(21, 5)));
  assert.equal(nightOf(at(20, 18)), nightOf(at(21, 17.9)));
  assert.equal(nightOf(at(20, 17.9)) + 1, nightOf(at(20, 18)));
});
