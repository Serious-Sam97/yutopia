import assert from "node:assert/strict";
import { test } from "node:test";
import {
  afterBattle,
  battleWinner,
  cleanLook,
  cleanName,
  cleanOutfit,
  DECAY,
  type Fighter,
  FULL_NEEDS,
  feelingOf,
  hpFor,
  isDead,
  learned,
  lessonGain,
  levelFor,
  levelProgress,
  newPet,
  OFFLINE_RATE,
  playFun,
  resolveRound,
  SPECIES,
  settleNeeds,
  statsOf,
  tricksFor,
  xpForLevel,
} from "./pets.ts";

test("needs drop with time, slower away from the owner, and sleep brings energy back", () => {
  const h1 = settleNeeds(FULL_NEEDS, 1, { asleep: false, online: true });
  assert.equal(h1.food, 100 - DECAY.food);
  assert.equal(h1.water, 100 - DECAY.water);
  assert.equal(h1.energy, 100 - DECAY.energy);
  assert.equal(h1.health, 100); // fed and watered: nothing to heal, nothing hurts
  const away = settleNeeds(FULL_NEEDS, 1, { asleep: false, online: false });
  assert.equal(away.food, 100 - DECAY.food * OFFLINE_RATE);
  const asleep = settleNeeds({ ...FULL_NEEDS, energy: 10 }, 1, { asleep: true, online: true });
  assert.equal(asleep.energy, 10 + DECAY.sleepGain);
  // a weekend away (60 h) doesn't empty the bowl
  const weekend = settleNeeds(FULL_NEEDS, 60, { asleep: true, online: false });
  assert.ok(weekend.food > 30 && weekend.water > 0);
});

test("an empty bowl hurts, a full one heals, and health at zero is death", () => {
  const starving = settleNeeds({ ...FULL_NEEDS, food: 0, water: 0 }, 1, { asleep: false, online: true });
  assert.equal(starving.health, 100 - DECAY.hurt * 2);
  const hurt = { ...FULL_NEEDS, health: 50 };
  assert.equal(settleNeeds(hurt, 1, { asleep: false, online: true }).health, 50 + DECAY.heal);
  const gone = settleNeeds({ ...FULL_NEEDS, food: 0, water: 0, health: 3 }, 1, { asleep: false, online: true });
  assert.ok(isDead(gone));
  // the dead stay as they were
  assert.deepEqual(settleNeeds(gone, 5, { asleep: false, online: true }), gone);
  assert.equal(feelingOf({ ...FULL_NEEDS, water: 10 }), "thirsty");
  assert.equal(feelingOf(FULL_NEEDS), "happy");
});

test("levels follow xp and stats grow by species", () => {
  assert.equal(levelFor(0), 1);
  assert.equal(levelFor(49), 1);
  assert.equal(levelFor(50), 2);
  assert.equal(levelFor(150), 3);
  assert.equal(xpForLevel(3), 150);
  assert.deepEqual(levelProgress(60), { level: 2, into: 10, need: 100 });
  assert.equal(levelFor(1e9), 30);
  const l1 = statsOf("capybara", 1);
  const l10 = statsOf("capybara", 10);
  assert.ok(l10.heart > l1.heart && l10.heart > statsOf("parrot", 10).heart);
  for (const s of SPECIES) assert.equal(tricksFor(s).length, 9);
  assert.ok(lessonGain(4) < lessonGain(9));
  assert.ok(learned({ sit: 100 }, "sit") && !learned({ sit: 99 }, "sit"));
  assert.equal(playFun("dog", "ball"), 2 * playFun("dog", "rope"));
});

test("a record is cleaned on the way in", () => {
  const p = newPet(1, "platypus", "  Perry\u0000 ", { color: "nope", mark: "stripes" }, 1000);
  assert.equal(p.name, "Perry");
  assert.equal(p.look.color, "#5b3a26"); // the species' first colour
  assert.equal(p.look.mark, "none"); // a platypus has no stripes
  assert.equal(cleanName("", "Dog"), "Dog");
  assert.equal(cleanLook("cat", { color: "#E8A33D", mark: "stripes", markColor: "#2a2420" }).mark, "stripes");
  assert.equal(cleanLook("cat", { breed: "persian" }).breed, "persian");
  assert.equal(cleanLook("cat", { breed: "shiba" }).breed, "tabby");
  assert.equal(cleanLook("dog", { breed: "corgi" }).breed, "corgi");
  // parts and eyes: only hex colours of known parts get through
  const perry = cleanLook("platypus", {
    color: "#1fb2a6",
    parts: { bill: "#f0a040", feet: "#f0a040", tail: "#e8a33d", nose: "#ff0000", belly: "nope" },
    eyeColor: "#2a2420",
  });
  assert.deepEqual(perry.parts, { bill: "#f0a040", feet: "#f0a040", tail: "#e8a33d" });
  assert.equal(perry.eyeColor, "#2a2420");
  assert.equal(cleanLook("dog", { eyeColor: "blue" }).eyeColor, undefined);
  assert.equal(cleanLook("dog", {}).parts, undefined);
  const o = cleanOutfit({ hat: "crown", hatColor: "#ffffff", coat: "cape", collar: "tiara" });
  assert.equal(o.hat, "crown");
  assert.equal(o.hatColor, "#ffffff");
  assert.equal(o.collar, "none");
});

function fighter(species: Fighter["species"], level = 5, special = true): Fighter {
  const stats = statsOf(species, level);
  return { species, stats, hp: hpFor(stats), max: hpFor(stats), poison: 0, guard: false, special };
}

test("a round: attacks land in speed order, guards halve and reflect, rest heals", () => {
  const seq = [0.3, 0.3, 0.9, 0.3, 0.3, 0.9, 0.3];
  const rnd = () => seq.shift() ?? 0.3;
  const dog = fighter("dog");
  const cat = fighter("cat");
  const r = resolveRound(dog, cat, "attack", "attack", rnd);
  assert.equal(r.log[0].who, "b"); // the cat is faster
  assert.ok(r.a.hp < dog.hp && r.b.hp < cat.hp);
  const g = resolveRound(fighter("dog"), fighter("cat"), "attack", "defend", () => 0.9);
  const plain = resolveRound(fighter("dog"), fighter("cat"), "attack", "rest", () => 0.9);
  const hitGuarded = g.log.find((e) => e.who === "a")?.dmg ?? 0;
  const hitPlain = plain.log.find((e) => e.who === "a")?.dmg ?? 0;
  assert.ok(hitGuarded <= Math.ceil(hitPlain / 2));
  assert.ok(g.a.hp < hpFor(statsOf("dog", 5))); // the reflected bit
  const hurt = { ...fighter("dog"), hp: 10 };
  const rest = resolveRound(hurt, fighter("cat"), "rest", "defend", () => 0.9);
  assert.equal(rest.a.hp, 10 + Math.round(hurt.max * 0.18));
});

test("specials: venom ticks, a cat's pounce ignores the guard, a capybara chills", () => {
  const venom = resolveRound(fighter("platypus"), fighter("dog"), "special", "defend", () => 0.1);
  assert.ok(venom.log.some((e) => e.who === "a" && e.poison));
  assert.equal(venom.b.poison, 2); // one round ticked already
  assert.ok(venom.log.some((e) => e.who === "b" && e.poison && e.dmg));
  const pounce = resolveRound(fighter("cat"), fighter("dog"), "special", "defend", () => 0.1);
  const bite = resolveRound(fighter("cat"), fighter("dog"), "attack", "defend", () => 0.1);
  const pd = pounce.log.find((e) => e.who === "a")?.dmg ?? 0;
  const bd = bite.log.find((e) => e.who === "a")?.dmg ?? 0;
  assert.ok(pd > bd && !pounce.log.find((e) => e.who === "a")?.reflect);
  const tired = { ...fighter("capybara"), hp: 20 };
  const chill = resolveRound(tired, fighter("dog"), "special", "rest", () => 0.1);
  assert.equal(
    chill.a.hp - 20 + (chill.log.find((e) => e.who === "b" && e.dmg)?.dmg ?? 0),
    Math.round(tired.max * 0.3),
  );
  // without the trick learned a special is just an attack (no venom)
  const plain = resolveRound(fighter("platypus", 5, false), fighter("dog"), "special", "rest", () => 0.1);
  assert.ok(!plain.log.some((e) => e.poison));
  // a hop goes first whatever the speed
  const hop = resolveRound(fighter("rabbit", 1), fighter("cat", 20), "special", "attack", () => 0.1);
  assert.equal(hop.log[0].who, "a");
});

test("the end of a battle", () => {
  const a = fighter("dog");
  const b = fighter("cat");
  assert.equal(battleWinner(a, b, 3), null);
  assert.equal(battleWinner({ ...a, hp: 0 }, b, 3), "b");
  assert.equal(battleWinner({ ...a, hp: 0 }, { ...b, hp: 0 }, 3), "draw");
  assert.equal(battleWinner({ ...a, hp: a.max }, { ...b, hp: 1 }, 12), "a");
  const after = afterBattle(FULL_NEEDS, false);
  assert.equal(after.energy, 70);
  assert.equal(after.fun, 90);
});
