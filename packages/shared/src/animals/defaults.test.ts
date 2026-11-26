import assert from "node:assert/strict";
import { test } from "node:test";
import { onPathAt } from "../danger.ts";
import {
  dayNests,
  dayNestsIn,
  dayOf,
  fixedNests,
  inCampus,
  keptClear,
  NEST_CELL,
  type NestPlaceDef,
  checkNestPlace,
  nestPlacesOf,
} from "../dark/nests.ts";
import { walkableCell, waterAt } from "../grounds.ts";
import type { GroundsEdits } from "../grounds-edits.ts";
import {
  ANIMAL_SEED,
  CELL,
  canBeAt,
  cellGroups,
  changedDefaults,
  checkDefaultChange,
  generatedCell,
  isGeneratedKey,
  landGroups,
  placeKindOf,
} from "./habitat.ts";

// The land's own places under God mode (docs/plan/127-default-nests.md): its groups by stable keys, taken away,
// moved, changed; the dark's day nests past the campus, God mode's own and its places kept clear.

/** A cell near the campus the land makes a few groups in. */
function aCell(): { cx: number; cz: number } {
  for (let cz = -3; cz <= 0; cz++)
    for (let cx = -2; cx <= 3; cx++) if (landGroups(cx, cz, ANIMAL_SEED, canBeAt).length >= 3) return { cx, cz };
  throw new Error("no cell with groups");
}

test("the land's groups: stable keys, its cell read back from them, a kind each", () => {
  const { cx, cz } = aCell();
  const a = landGroups(cx, cz, ANIMAL_SEED, canBeAt);
  const b = landGroups(cx, cz, ANIMAL_SEED, canBeAt);
  assert.deepEqual(a, b);
  for (const g of a) {
    assert.ok(isGeneratedKey(g.id), g.id);
    assert.deepEqual(generatedCell(g.id), [cx, cz]);
  }
  assert.equal(placeKindOf("wolf"), "den");
  assert.equal(placeKindOf("crow"), "nest");
  assert.equal(placeKindOf("deer"), "herd");
  assert.ok(!isGeneratedKey("an:abc") && !isGeneratedKey("pen:paddock"));
  // (by the species' name: a species added to the list doesn't re-key the others)
  for (const g of a) assert.ok(g.id.includes(`_${g.species}_`), g.id);
});

test("an empty place takes the land's groups in it away without moving the cell's others (F2a)", () => {
  const { cx, cz } = aCell();
  const all = landGroups(cx, cz, ANIMAL_SEED, canBeAt);
  const first = all[0];
  const kept = landGroups(cx, cz, ANIMAL_SEED, canBeAt, [{ key: "e", kind: "empty", x: first.x, z: first.z, r: 0.5 }]);
  assert.ok(!kept.some((g) => g.id === first.id));
  for (const g of kept) assert.deepEqual(g, all.find((h) => h.id === g.id));
});

test("taken away, moved, changed (F5a): by key — a moved one in the cell it's moved to, its id kept", () => {
  const { cx, cz } = aCell();
  const all = landGroups(cx, cz, ANIMAL_SEED, canBeAt);
  const [gone, moved, changed] = all;
  // somewhere a deer can be, a cell over
  const to = { x: (cx + 1.5) * CELL, z: (cz + 0.5) * CELL };
  let spot: { x: number; z: number } | null = null;
  for (let k = 0; k < 400 && !spot; k++) {
    const x = to.x + ((k % 20) - 10) * 4;
    const z = to.z + (Math.floor(k / 20) - 10) * 4;
    if (canBeAt(moved.species, x, z)) spot = { x, z };
  }
  assert.ok(spot, "a spot to move to");
  const e: GroundsEdits = {
    rev: 1,
    animals: {
      remove: [gone.id],
      change: {
        [moved.id]: { species: moved.species, x: spot.x, z: spot.z, n: moved.n, young: moved.young },
        [changed.id]: { species: "boar", n: 3 },
      },
    },
  };
  const here = cellGroups(e, cx, cz);
  assert.ok(!here.some((g) => g.id === gone.id), "taken away");
  assert.ok(!here.some((g) => g.id === moved.id), "moved out");
  const ch = here.find((g) => g.id === changed.id);
  assert.equal(ch?.species, "boar");
  assert.equal(ch?.n, 3);
  assert.equal(ch?.x, changed.x);
  const there = cellGroups(e, cx + 1, cz);
  const m = there.find((g) => g.id === moved.id);
  assert.ok(m, "moved in");
  assert.equal(m.x, spot.x);
  // (the same edits object: the changed ones made once)
  assert.equal(changedDefaults(e), changedDefaults(e));
});

test("a change stands on its own when the land no longer makes its group (F7a)", () => {
  const e: GroundsEdits = { rev: 1, animals: { change: { l9999_9999_deer_0: { species: "deer", x: 10, z: 20, n: 2, young: 0 } } } };
  const c = changedDefaults(e);
  assert.equal(c.length, 1);
  assert.equal(c[0].species, "deer");
  // (and without enough to stand on: nothing)
  assert.equal(changedDefaults({ rev: 1, animals: { change: { l9999_9999_deer_1: { n: 2 } } } }).length, 0);
});

test("the publish's checks: a change to the land's own sound, and not moved where it can't be", () => {
  assert.equal(checkDefaultChange("l1_2_deer_4", { species: "deer", x: 1, z: 2, n: 3 }), null);
  assert.ok(checkDefaultChange("an:x", { n: 1 }));
  assert.ok(checkDefaultChange("l1_2_deer_4", { species: "dragon" as never }));
  assert.ok(checkDefaultChange("l1_2_deer_4", { n: 99 }));
  assert.ok(checkDefaultChange("l1_2_deer_4", { species: "deer", x: 0, z: 0 }, () => false), "moved where it can't be");
});

test("the dark's nests past the campus (F3b, F4a): none in the campus, random by the day, the same for everyone", () => {
  const day = dayOf(Date.UTC(2026, 10, 25, 15));
  // squares east along the long road, past the campus
  let found = 0;
  for (let cx = 4; cx < 24 && found < 4; cx++)
    for (let cz = -4; cz <= 0; cz++) {
      const a = dayNestsIn(day, cx, cz);
      assert.deepEqual(a, dayNestsIn(day, cx, cz));
      for (const n of a) {
        found++;
        assert.ok(!inCampus(n.x, n.z), `${n.id} in the campus`);
        assert.ok(walkableCell(Math.floor(n.x), Math.floor(n.z)), `${n.id} not on the land`);
        assert.ok(!waterAt(n.x, n.z), `${n.id} in the water`);
        assert.ok(!onPathAt(n.x, n.z), `${n.id} on a path`);
        assert.ok(n.n >= 1 && n.n <= 4);
        assert.ok(n.x >= cx * NEST_CELL && n.x < (cx + 1) * NEST_CELL + NEST_CELL / 6, `${n.id} out of its square`);
      }
    }
  assert.ok(found > 0, "some nests past the campus");
  // another day, others
  const sq: [number, number][] = [];
  for (let cx = 4; cx < 30; cx++) for (let cz = -4; cz <= 0; cz++) sq.push([cx, cz]);
  const at = (d: number) => sq.flatMap(([x, z]) => dayNestsIn(d, x, z).map((n) => `${n.x.toFixed(1)},${n.z.toFixed(1)}`));
  assert.notDeepEqual(at(day), at(day + 1));
  // the campus's own as they were
  assert.ok(dayNests(day).length > 0);
});

test("God mode's nests (F3b): its own out every day, places kept clear, sound", () => {
  const e: GroundsEdits = {
    rev: 1,
    nests: {
      add: [
        { key: "nk:a", kind: "nest", x: 2000, z: -300, n: 3 },
        { key: "nk:b", kind: "clear", x: 0, z: 0, r: 50 },
        { key: "nk:c", kind: "nest", x: 1, z: 1, n: 1 },
      ],
      remove: ["nk:c"],
    },
  };
  const places = nestPlacesOf(e);
  assert.deepEqual(
    places.map((p) => p.key),
    ["nk:a", "nk:b"],
  );
  const d = dayOf(Date.UTC(2026, 10, 25, 15));
  const f = fixedNests(d, places);
  assert.equal(f.length, 1);
  assert.equal(f[0].n, 3);
  assert.deepEqual(fixedNests(d, places), f);
  assert.notEqual(fixedNests(d + 1, places)[0].id, f[0].id);
  assert.ok(keptClear(places, 10, 10) && !keptClear(places, 100, 0));
  const ok: NestPlaceDef = { key: "nk:a", kind: "nest", x: 1, z: 2, n: 2 };
  assert.equal(checkNestPlace(ok), null);
  assert.ok(checkNestPlace({ ...ok, n: 9 }));
  assert.ok(checkNestPlace({ ...ok, kind: "clear", r: 0 }));
  assert.ok(checkNestPlace({ ...ok, key: "a b" }));
});
