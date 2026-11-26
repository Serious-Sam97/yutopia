import assert from "node:assert/strict";
import { test } from "node:test";
import {
  animalPlacesOf,
  CELL,
  checkAnimalPlace,
  FARM_PENS,
  habitatAt,
  landGroups,
  likes,
  placedGroups,
} from "./habitat.ts";
import { type Ctx, fed, fleeAt, freshNeeds, isFriend, type Seen, stepNeeds, think, WARN_S } from "./mind.ts";
import { addStack, count, craft, emptyInventory } from "../inventory.ts";
import { ANIMAL_KINDS, ANIMALS, activeAt, type AnimalKind, befriendable, dangerAt, HABITATS, hunts, takes } from "./species.ts";

// The animals (docs/plan/126-animal-life.md): the cast's sheet, where they live, what they do.

test("the cast: every species is whole and sane", () => {
  assert.ok(ANIMAL_KINDS.length >= 20, "the large cast (F2c)");
  for (const k of ANIMAL_KINDS) {
    const d = ANIMALS[k];
    assert.equal(d.key, k);
    assert.ok(d.len > 0 && d.height > 0 && d.hp > 0, `${k} size`);
    assert.ok(d.run >= d.walk && d.walk > 0, `${k} speeds`);
    assert.ok(d.pack[0] >= 1 && d.pack[1] >= d.pack[0], `${k} pack`);
    for (const h of Object.keys(d.habitat)) assert.ok((HABITATS as readonly string[]).includes(h), `${k} habitat ${h}`);
    for (const p of d.prey ?? []) assert.ok(ANIMAL_KINDS.includes(p as AnimalKind), `${k} prey ${p}`);
    if (d.group !== "farm") assert.ok(d.density > 0, `${k} lives somewhere`);
    if (d.danger) assert.ok(d.danger.charge < d.danger.warn && d.danger.fire > 0, `${k} danger`);
  }
  // F5c: predators by territory
  for (const k of ["wolf", "bear", "lynx"] as const) assert.ok((ANIMALS[k].danger?.territory ?? 0) > 0, k);
  // F7c: everything can be befriended — the big and the dangerous only young
  assert.ok(befriendable("wolf", true) && !befriendable("wolf", false));
  assert.ok(befriendable("bear", true) && !befriendable("bear", false));
  assert.ok(befriendable("fox", false));
  assert.ok(hunts("wolf", "deer") && !hunts("deer", "wolf"));
  assert.ok(takes("duck", "bread") && !takes("duck", "meat"));
  // the farm: eggs, milk, wool, a horse to ride
  assert.equal(ANIMALS.chicken.gives, "egg");
  assert.equal(ANIMALS.cow.gives, "milk");
  assert.equal(ANIMALS.sheep.gives, "wool");
  assert.ok(ANIMALS.horse.ride);
});

test("the hours: the owl by night, the deer at dusk, the crow by day", () => {
  assert.equal(activeAt(ANIMALS.owl.hours, 2), 1);
  assert.equal(activeAt(ANIMALS.owl.hours, 13), 0);
  assert.equal(activeAt(ANIMALS.deer.hours, 19), 1);
  assert.ok(activeAt(ANIMALS.deer.hours, 13) < 0.5);
  assert.equal(activeAt(ANIMALS.crow.hours, 12), 1);
  assert.equal(activeAt(ANIMALS.crow.hours, 1), 0);
  // the dark makes the wolves bolder
  const d = ANIMALS.wolf.danger;
  assert.ok(d);
  assert.ok(dangerAt(d, 1).charge > dangerAt(d, 0).charge);
});

test("habitats: the pond is water, its banks shore, the town town, the farm farm", () => {
  assert.equal(habitatAt(-240, -60).water, 1);
  const bank = habitatAt(-240 + 48 + 3, -60);
  assert.equal(bank.shore, 1);
  assert.equal(habitatAt(420, -380).town, 1);
  assert.equal(habitatAt(470, -230).farm, 1);
  // ducks like the pond, deer don't
  assert.ok(likes("duck", habitatAt(-240, -60)) > 0.9);
  assert.equal(likes("deer", habitatAt(-240, -60)), 0);
});

test("the land's groups: the same each time, on their ground, in their numbers", () => {
  const everywhere = () => true;
  let total = 0;
  for (let cx = -3; cx <= 2; cx++)
    for (let cz = -4; cz <= 0; cz++) {
      const a = landGroups(cx, cz, 7, everywhere);
      const b = landGroups(cx, cz, 7, everywhere);
      assert.deepEqual(
        a.map((g) => [g.id, g.species, g.n]),
        b.map((g) => [g.id, g.species, g.n]),
      );
      for (const g of a) {
        assert.ok(Math.floor(g.x / CELL) === cx && Math.floor(g.z / CELL) === cz, `${g.id} in its cell`);
        const d = ANIMALS[g.species];
        assert.ok(g.n >= d.pack[0] && g.n <= d.pack[1], `${g.id} size`);
        assert.ok(likes(g.species, habitatAt(g.x, g.z)) > 0.15, `${g.id} likes its home`);
        assert.notEqual(d.group, "farm");
      }
      total += a.length;
    }
  assert.ok(total > 10, `the core keeps life (${total} groups)`);
  // a place kept empty keeps them out
  const g = landGroups(-2, -2, 7, everywhere);
  if (g.length) {
    const kept = landGroups(-2, -2, 7, everywhere, [{ key: "e", kind: "empty", x: g[0].x, z: g[0].z, r: 400 }]);
    assert.equal(kept.length, 0);
  }
  // where nothing can be, nothing is
  assert.equal(landGroups(-2, -2, 7, () => false).length, 0);
});

test("God mode's places: the farm's pens by default, changed, taken away, added", () => {
  const base = animalPlacesOf({ rev: 0 });
  assert.equal(base.length, FARM_PENS.length);
  for (const p of base) assert.equal(checkAnimalPlace(p), null);
  const e = animalPlacesOf({
    rev: 1,
    animals: {
      add: [{ key: "a1", kind: "den", species: "bear", x: 10, z: 20, young: 2 }],
      change: { "pen:sty": { x: 400 } },
      remove: ["pen:coop"],
    },
  });
  assert.ok(!e.some((p) => p.key === "pen:coop"));
  assert.equal(e.find((p) => p.key === "pen:sty")?.x, 400);
  const den = e.find((p) => p.key === "a1");
  assert.ok(den);
  const gs = placedGroups(e);
  const bear = gs.find((g) => g.id === "a1");
  assert.equal(bear?.young, 2);
  assert.equal(bear?.territory, ANIMALS.bear.danger?.territory);
  assert.ok(gs.some((g) => g.species === "horse" && g.pen));
  assert.notEqual(checkAnimalPlace({ key: "x", kind: "herd", x: 0, z: 0 }), null);
  assert.notEqual(checkAnimalPlace({ key: "x", kind: "pen", x: 0, z: 0, x1: 1, z1: 1, keeps: [] }), null);
  // (a species off the prototype, a key the wire and the API can't keep)
  assert.notEqual(checkAnimalPlace({ key: "x", kind: "herd", species: "toString" as AnimalKind, x: 0, z: 0 }), null);
  assert.notEqual(checkAnimalPlace({ key: "x".repeat(300), kind: "herd", species: "deer", x: 0, z: 0 }), null);
  assert.notEqual(checkAnimalPlace({ key: "a b", kind: "herd", species: "deer", x: 0, z: 0 }), null);
  assert.notEqual(
    checkAnimalPlace({ key: "x", kind: "pen", x: 0, z: 0, x1: 9, z1: 9, keeps: [{ species: "constructor" as AnimalKind, n: 1 }] }),
    null,
  );
  assert.equal(checkAnimalPlace({ key: "an:k3x9", kind: "herd", species: "deer", x: 0, z: 0, n: 3 }), null);
});

test("craft (phase 8): the hides taken, the coat given — or, no room for it, nothing taken", () => {
  const inv = emptyInventory();
  addStack(inv, "hide_leather", 3);
  addStack(inv, "hide_feathers", 2);
  assert.ok(craft(inv, "fur_coat"));
  assert.equal(count(inv, "hide_leather"), 1);
  assert.equal(count(inv, "hide_feathers"), 1);
  assert.equal(count(inv, "fur_coat"), 1);
  assert.equal(craft(inv, "fur_coat"), false, "one coat");
  // a full case: the hides' room isn't a coat's (3×3)
  const full = emptyInventory();
  addStack(full, "hide_fur", 2);
  addStack(full, "hide_wool", 1);
  addStack(full, "hide_pelt", 6 * 20);
  const was = JSON.stringify(full);
  assert.equal(craft(full, "fur_coat"), false);
  assert.equal(JSON.stringify(full), was, "nothing taken for nothing");
});

const ctx = (kind: AnimalKind, seen: Seen[] = [], o: Partial<Ctx> = {}): Ctx => ({
  kind,
  young: false,
  hour: 12,
  night: 0,
  storm: 0,
  x: 0,
  z: 0,
  home: { x: 0, z: 0 },
  territory: ANIMALS[kind].danger?.territory ?? 0,
  hurt: false,
  youngNear: false,
  inWater: false,
  seen,
  needs: freshNeeds(),
  doing: "idle",
  for: 100,
  roll: 0.5,
  ...o,
});
const person = (x: number, o: Partial<Seen> = {}): Seen => ({ id: "p", kind: "person", x, z: 0, v: 1.3, ...o });

test("fear: a deer bolts from a walker, sooner from a runner, lets a crouched one nearer", () => {
  // (by degrees, plan 128 F7a: an alarm first — a snort, a stamp — then the bolt)
  assert.equal(think(ctx("deer", [person(20)], { hour: 19 })).doing, "alarm");
  assert.equal(think(ctx("deer", [person(20)], { hour: 19, doing: "alarm", for: 1 })).doing, "flee");
  assert.equal(think(ctx("deer", [person(12)], { hour: 19 })).doing, "flee");
  assert.notEqual(think(ctx("deer", [person(40)], { hour: 19 })).doing, "flee");
  // coming on, not yet near: off at a walk; near enough to watch: it watches a while, then a glance now and then
  assert.equal(think(ctx("deer", [person(35, { closing: 1 })], { hour: 19 })).doing, "leave");
  assert.equal(think(ctx("deer", [person(45)], { hour: 19, doing: "alert", for: 1 })).doing, "alert");
  assert.notEqual(think(ctx("deer", [person(45)], { hour: 19, doing: "alert", for: 30, roll: 0.9 })).doing, "alert");
  // not noticed (behind it, quiet): nothing; used to people on a path: they may pass nearer
  assert.notEqual(think(ctx("deer", [person(20, { aware: 0.1 })], { hour: 19 })).doing, "flee");
  assert.notEqual(think(ctx("deer", [person(14)], { hour: 19, habit: 1 })).doing, "flee");
  assert.equal(think(ctx("deer", [person(40, { v: 5 })], { hour: 19 })).doing, "flee");
  assert.ok(fleeAt("deer", person(0, { low: true, v: 0.6 }), false) < fleeAt("deer", person(0), false));
  // away from them
  const i = think(ctx("deer", [person(10)], { hour: 19 }));
  assert.ok((i.to?.x ?? 0) < 0);
  // a bird flies
  assert.equal(think(ctx("crow", [person(5)])).doing, "fly");
  // a shot far off still scares them
  assert.equal(think(ctx("deer", [{ id: "s", kind: "shot", x: 50, z: 0, v: 0 }])).doing, "flee");
});

test("danger by territory (F5c): the wolves come for a stranger in their pass, keep off a torch", () => {
  // close in its pass: it warns first, and charges once it's warned a while and you stayed
  assert.equal(think(ctx("wolf", [person(8)], { home: { x: 10, z: 0 } })).doing, "warn");
  assert.equal(think(ctx("wolf", [person(8)], { home: { x: 10, z: 0 }, doing: "warn", for: WARN_S + 0.1 })).doing, "attack");
  // right on top of it: no warning
  assert.equal(think(ctx("wolf", [person(2)], { home: { x: 10, z: 0 } })).doing, "attack");
  assert.equal(think(ctx("wolf", [person(18)], { home: { x: 10, z: 0 } })).doing, "warn");
  // a runner gets away: every predator comes at a person slower than a run (7 m/s)
  for (const k of ANIMAL_KINDS) if (ANIMALS[k].danger) assert.ok((ANIMALS[k].danger?.chase ?? 99) < 7, `${k} chase`);
  // outside its territory, far: nothing
  const away = think(ctx("wolf", [person(60)], { home: { x: -400, z: 0 } }));
  assert.ok(away.doing !== "attack" && away.doing !== "warn");
  // a torch keeps it off
  assert.notEqual(think(ctx("wolf", [person(20, { torch: true })], { home: { x: 10, z: 0 } })).doing, "attack");
  // its friend's safe
  assert.notEqual(think(ctx("wolf", [person(5, { trust: 1 })], { home: { x: 10, z: 0 } })).doing, "attack");
  // the young never
  assert.notEqual(think(ctx("wolf", [person(5)], { young: true })).doing, "attack");
});

test("food: a duck comes to bread held out by someone still, eats it at hand", () => {
  assert.equal(think(ctx("duck", [person(6, { holds: "bread", v: 0 })])).doing, "approach");
  assert.equal(think(ctx("duck", [person(0.5, { holds: "bread", v: 0 })])).doing, "eat");
  assert.notEqual(think(ctx("duck", [person(10, { holds: "meat", v: 0 })])).doing, "approach");
});

test("predators hunt when hungry: the fox after a hare", () => {
  const hare: Seen = { id: "h", kind: "animal", species: "hare", x: 8, z: 0, v: 0 };
  const hungry = { ...freshNeeds(), hunger: 0.8 };
  const i = think(ctx("fox", [hare], { hour: 19, needs: hungry }));
  assert.ok(i.doing === "chase" || i.doing === "stalk");
  assert.equal(think(ctx("fox", [hare], { hour: 19 })).doing === "chase", false);
  // and the hare runs from the fox
  assert.equal(think(ctx("hare", [{ id: "f", kind: "animal", species: "fox", x: 8, z: 0, v: 3 }], { hour: 19 })).doing, "flee");
});

test("night and storm: the crow sleeps at night, the deer shelters in a blizzard", () => {
  assert.ok(["perch", "fly", "sleep"].includes(think(ctx("crow", [], { hour: 2, night: 1 })).doing));
  assert.equal(think(ctx("deer", [], { storm: 1, x: 50, home: { x: 0, z: 0 } })).doing, "shelter");
});

test("needs: hunger rises when about, falls grazing; fear fades", () => {
  let n = freshNeeds();
  n = stepNeeds(n, 3600, "wander", 0.5);
  assert.ok(n.hunger > 0.4);
  n = stepNeeds(n, 1800, "graze", 0.5);
  assert.ok(n.hunger < 0.4);
  n = stepNeeds({ ...n, fear: 1 }, 60, "idle", 0.5);
  assert.equal(n.fear, 0);
});

test("trust (F7c): a feed a day, its days to a friend", () => {
  let t = fed("duck", undefined, 1);
  assert.ok(!isFriend(t));
  for (let i = 0; i < 60; i++) t = fed("duck", t, 1);
  assert.ok(!isFriend(t), "twice a day counts once (a crate's free handfuls fed one after another too)");
  t = fed("duck", t, 2);
  assert.ok(isFriend(t));
  let w = fed("wolf", undefined, 1);
  for (let d = 2; d <= ANIMALS.wolf.trustDays; d++) w = fed("wolf", w, d);
  assert.ok(isFriend(w));
});
