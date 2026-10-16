import assert from "node:assert/strict";
import { test } from "node:test";
import {
  bondDecay,
  bondOf,
  bondUp,
  choose,
  cleanBonds,
  cleanMemory,
  cleanTraits,
  compatible,
  drift,
  drives,
  emptyMemory,
  favouriteSpot,
  favouriteToy,
  hasGrudge,
  holdGrudge,
  type MindCtx,
  nightOf,
  obeyChance,
  rememberBowl,
  rememberSpot,
  rememberToy,
  rollTraits,
  TRAIT_NAMES,
  traitWords,
} from "./mind.ts";
import { FULL_NEEDS } from "./pets.ts";

const NOW = 1_760_000_000_000;
const quiet = (over: Partial<MindCtx> = {}): MindCtx => ({
  now: NOW,
  night: 0,
  noise: 0,
  lastPlay: NOW,
  lastPetted: NOW,
  lastNear: NOW,
  lastLooked: NOW,
  newThings: 0,
  pets: 0,
  ...over,
});

test("traits roll the same from a seed, inside the species' band, leaning with the breed", () => {
  const a = rollTraits("dog", "shiba", 7);
  const b = rollTraits("dog", "shiba", 7);
  assert.deepEqual(a, b);
  for (const k of TRAIT_NAMES) assert.ok(a[k] >= 0 && a[k] <= 1);
  // a dog is more obedient than a cat, a husky less than a golden (over many seeds)
  const avg = (sp: "dog" | "cat", br: string, k: (typeof TRAIT_NAMES)[number]) => {
    let s = 0;
    for (let i = 0; i < 40; i++) s += rollTraits(sp, br, i)[k];
    return s / 40;
  };
  assert.ok(avg("dog", "shiba", "obedience") > avg("cat", "tabby", "obedience"));
  assert.ok(avg("dog", "golden", "obedience") > avg("dog", "husky", "obedience"));
  // bad traits re-roll; good ones are clamped
  assert.deepEqual(cleanTraits({ energy: "no" }, "dog", "shiba", 7), a);
  assert.equal(cleanTraits({ ...a, courage: 4 }, "dog", "shiba", 7).courage, 1);
  // three words, the strongest leanings first
  const words = traitWords({ ...a, energy: 0.05, affection: 0.95, courage: 0.5 });
  assert.equal(words.length, 3);
  assert.ok(words.includes("lazy") && words.includes("loving"));
});

test("drives: a hungry greedy dog wants the bowl before the ball; a petted pet wants no attention", () => {
  const t = rollTraits("dog", "beagle", 3);
  const n = { ...FULL_NEEDS, food: 30, fun: 40 };
  const d = drives(n, { ...t, greed: 0.9 }, quiet({ lastPlay: NOW - 10 * 60_000 }));
  assert.ok(d.hunger > d.play, `${d.hunger} > ${d.play}`);
  assert.equal(d.attention, 0);
  assert.equal(d.company, 0); // nobody about
  const alone = drives(FULL_NEEDS, { ...t, affection: 1, independence: 0 }, quiet({ lastPetted: NOW - 30 * 60_000 }));
  assert.ok(alone.attention > 80);
  // noise scares the timid, not the brave
  const loud = quiet({ noise: 1 });
  assert.ok(
    drives(FULL_NEEDS, { ...t, courage: 0.1 }, loud).comfort > drives(FULL_NEEDS, { ...t, courage: 0.9 }, loud).comfort,
  );
  // too tired to play
  const tired = drives({ ...FULL_NEEDS, energy: 10, fun: 0 }, t, quiet());
  assert.ok(tired.play < tired.rest);
  // night makes rest press harder
  assert.ok(
    drives({ ...FULL_NEEDS, energy: 50 }, t, quiet({ night: 1 })).rest >
      drives({ ...FULL_NEEDS, energy: 50 }, t, quiet()).rest,
  );
});

test("the intention commits: kept until met, switched only for something far stronger", () => {
  const base = { hunger: 0, thirst: 0, rest: 0, play: 0, attention: 0, curiosity: 0, comfort: 0, company: 0 };
  assert.equal(choose({ ...base, play: 10 }, null, NOW), null); // nothing pressing
  const i1 = choose({ ...base, play: 50 }, null, NOW);
  assert.deepEqual(i1, { drive: "play", since: NOW });
  // a bit hungrier than playful: still playing
  assert.equal(choose({ ...base, play: 50, hunger: 60 }, i1, NOW + 1), i1);
  // much hungrier: the bowl
  const i2 = choose({ ...base, play: 50, hunger: 80 }, i1, NOW + 2);
  assert.deepEqual(i2, { drive: "hunger", since: NOW + 2 });
  // met: dropped, the next strongest takes over (if pressing)
  assert.deepEqual(choose({ ...base, hunger: 10, play: 50 }, i2, NOW + 3), { drive: "play", since: NOW + 3 });
  assert.equal(choose({ ...base, hunger: 10, play: 5 }, i2, NOW + 4), null);
});

test("a will of its own: obedience, bond and mood make the chance", () => {
  const dog = {
    energy: 0.7,
    independence: 0.2,
    courage: 0.6,
    greed: 0.5,
    curiosity: 0.5,
    affection: 0.8,
    obedience: 0.95,
  };
  const cat = { ...dog, obedience: 0.1 };
  assert.ok(obeyChance(dog, 100, FULL_NEEDS, null) > 0.9);
  assert.ok(obeyChance(cat, 0, FULL_NEEDS, null) < 0.5);
  assert.ok(obeyChance(dog, 0, FULL_NEEDS, null) > 0.75);
  assert.ok(obeyChance(dog, 50, { ...FULL_NEEDS, food: 20 }, null) < obeyChance(dog, 50, FULL_NEEDS, null));
  assert.ok(obeyChance(dog, 50, FULL_NEEDS, "comfort") < 0.35);
  // drift moves a trait a hair at a time, inside 0..1
  let t = cat;
  for (let i = 0; i < 200; i++) t = drift(t, "ignored");
  assert.equal(t.independence, 1);
  assert.equal(drift(dog, "lost").courage, 0.59);
});

test("memory: toys, spots, bowls and grudges, bounded and cleaned", () => {
  let m = emptyMemory();
  m = rememberToy(rememberToy(rememberToy(m, "ball"), "frisbee"), "ball");
  assert.equal(favouriteToy(m), "ball");
  m = rememberSpot(rememberSpot(rememberSpot(rememberSpot(m, 3, 3), 3.5, 3.2), 9, 9), 1, 1);
  assert.deepEqual(favouriteSpot(m), { x: 3, y: 3 });
  assert.equal(m.spots.length, 3);
  m = rememberBowl(rememberBowl(m, 5, 5, "pet_bowl"), 5, 5, "pet_bowl");
  assert.equal(m.bowls.length, 1);
  m = holdGrudge(m, "p9", NOW);
  assert.ok(hasGrudge(m, "p9", NOW + 1000));
  assert.ok(!hasGrudge(m, "p9", NOW + 2 * 3_600_000));
  assert.deepEqual(cleanMemory(JSON.parse(JSON.stringify(m))), m);
  assert.deepEqual(cleanMemory({ toys: { ball: "x" }, spots: "no" }), emptyMemory());
});

test("bonds grow with care, fade with days, and tell friends from strangers", () => {
  let b = cleanBonds({ "7": 10, bad: 3, "8": 500 });
  assert.deepEqual(b, { "7": 10, "8": 100 });
  b = bondUp(bondUp(b, 7, "feed"), 7, "pet");
  assert.equal(bondOf(b, 7), 18);
  assert.equal(bondOf(bondDecay(b, 48), 7), 16);
  const a = rollTraits("cat", "tabby", 1);
  assert.ok(compatible(a, a));
  assert.ok(!compatible({ ...a, energy: 0.1 }, { ...a, energy: 0.9 }));
  assert.equal(nightOf(2), 1);
  assert.equal(nightOf(12), 0);
  assert.ok(nightOf(21) > 0 && nightOf(21) < 1);
});
