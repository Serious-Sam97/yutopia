import assert from "node:assert/strict";
import { test } from "node:test";
import { parseNpc } from "./cast.ts";
import { lineFor } from "./lines.ts";
import {
  ACTIVITIES,
  actOutcome,
  actsFor,
  bondAfter,
  bondFaded,
  bondLevel,
  chatDelta,
  choose,
  fullNeeds,
  getOn,
  metBy,
  moodOf,
  moodValue,
  type NpcNeeds,
  soldBy,
  stepNeeds,
  topWant,
  traitsOf,
  wants,
} from "./mind.ts";

// An NPC's mind (docs/plan/123-npcs-alive.md): their needs fall and are met, they choose what to do, their mood, how
// they take what's done with them, how they get on with each other.
const mid = traitsOf("npc-x", { outgoing: 0.5, active: 0.5, neat: 0.5, cheerful: 0.5 });
const seq = (...v: number[]) => {
  let i = 0;
  return () => v[i++ % v.length];
};

test("mind: traits as given in tenths, else the same from the key every time", () => {
  assert.deepEqual(traitsOf("a", { outgoing: 0.83, active: 2, neat: -1 }), {
    outgoing: 0.8,
    active: 1,
    neat: 0,
    cheerful: traitsOf("a").cheerful,
  });
  assert.deepEqual(traitsOf("npc-rosa"), traitsOf("npc-rosa"));
  assert.notDeepEqual(traitsOf("npc-rosa"), traitsOf("npc-joao"));
  // (the cast keeps them on the behaviour; none given: null — from the key)
  const d = parseNpc({ key: "npc-t", name: "T", behaviour: { traits: { cheerful: 0.9 } } });
  assert.deepEqual(d?.behaviour.traits, { outgoing: 0.5, active: 0.5, neat: 0.5, cheerful: 0.9 });
  assert.equal(parseNpc({ key: "npc-u", name: "U" })?.behaviour.traits, null);
});

test("mind: needs fall by the minute — thirst first, energy over hours — and what they're at fills its own", () => {
  let n = fullNeeds();
  n = stepNeeds(n, mid, 40, null);
  assert.ok(n.thirst < n.hunger && n.hunger < n.energy, JSON.stringify(n));
  assert.ok(n.energy > 90);
  const dry = stepNeeds({ ...n, thirst: 20 }, mid, 3, "coffee");
  assert.ok(dry.thirst > 90, `${dry.thirst}`);
  // (an outgoing one wants company sooner, an active one fun)
  const out = traitsOf("o", { outgoing: 1, active: 1, neat: 0.5, cheerful: 0.5 });
  const shy = traitsOf("s", { outgoing: 0, active: 0, neat: 0.5, cheerful: 0.5 });
  assert.ok(stepNeeds(fullNeeds(), out, 30, null).social < stepNeeds(fullNeeds(), shy, 30, null).social);
  assert.ok(stepNeeds(fullNeeds(), out, 30, null).fun < stepNeeds(fullNeeds(), shy, 30, null).fun);
  // (never under 0, never over 100)
  const z = stepNeeds(fullNeeds(), mid, 100_000, null);
  assert.ok(Object.values(z).every((v) => v === 0));
});

test("mind: what they choose — work in their shift, sleep at night, coffee when thirsty, a stroll when nothing presses", () => {
  const now = 1_000_000;
  const offers = [
    { kind: "coffee" as const, at: "npc-barista", dist: 40 },
    { kind: "meal" as const, at: "npc-cook", dist: 60 },
    { kind: "bench" as const, at: "bench:1", dist: 10 },
    { kind: "chat" as const, at: "npc-friend", dist: 8 },
  ];
  const ctx = { night: 0, onShift: false, home: true, offers };
  assert.equal(choose(fullNeeds(), mid, { ...ctx, onShift: true }, now, seq(0.5)).kind, "work");
  assert.equal(choose({ ...fullNeeds(), energy: 50 }, mid, { ...ctx, night: 1 }, now, seq(0.5)).kind, "sleep");
  const thirsty: NpcNeeds = { ...fullNeeds(), thirst: 15 };
  const p = choose(thirsty, mid, ctx, now, seq(0.5));
  assert.deepEqual([p.kind, p.at], ["coffee", "npc-barista"]);
  assert.ok(p.until > now + 2 * 60_000 && p.until <= now + 4 * 60_000);
  assert.equal(choose({ ...fullNeeds(), hunger: 10 }, mid, ctx, now, seq(0.5)).kind, "meal");
  assert.equal(choose({ ...fullNeeds(), social: 10 }, mid, ctx, now, seq(0.5)).kind, "chat");
  assert.equal(choose(fullNeeds(), mid, ctx, now, seq(0.5)).kind, "stroll");
  // (no barista about: hungry for a drink, they eat at home)
  assert.equal(choose(thirsty, mid, { ...ctx, offers: [] }, now, seq(0.5)).kind, "eat-home");
  // (done early once it's met)
  assert.ok(metBy({ ...fullNeeds(), thirst: 99 }, "coffee"));
  assert.ok(!metBy({ ...fullNeeds(), thirst: 60 }, "coffee"));
  assert.equal(topWant(thirsty, mid), "thirst");
  assert.equal(topWant(fullNeeds(), mid), null);
  assert.ok(wants(thirsty, mid).thirst > 90);
});

test("mind: the jobs and what their places sell", () => {
  assert.deepEqual(soldBy("barista"), ["coffee"]);
  assert.deepEqual(soldBy("cook"), ["meal"]);
  assert.deepEqual(soldBy("guard"), []);
  assert.ok(ACTIVITIES.drink.sold?.includes("bartender"));
});

test("mind: mood from their needs and nature, lifted by what's just been done", () => {
  const happy = moodValue(fullNeeds(), mid);
  const low = moodValue({ ...fullNeeds(), hunger: 5, energy: 10 }, mid);
  assert.ok(happy >= 50 && low < happy);
  assert.equal(moodOf(happy, mid), "happy");
  assert.equal(moodOf(-60, traitsOf("g", { cheerful: 0.1 })), "cross");
  assert.equal(moodOf(-60, traitsOf("g", { cheerful: 0.9 })), "sad");
  assert.ok(moodValue(fullNeeds(), mid, 20) > happy || happy === 100);
});

test("mind: bonds — levels, what's offered by them, how acts land, fading", () => {
  assert.equal(bondLevel(null), "stranger");
  assert.equal(bondLevel({ v: -30, n: 5, at: 0 }), "dislike");
  assert.equal(bondLevel({ v: 5, n: 3, at: 0 }), "acquaintance");
  assert.equal(bondLevel({ v: 40, n: 9, at: 0 }), "friend");
  assert.equal(bondLevel({ v: 80, n: 20, at: 0 }), "close");
  const free = { atWork: false, serves: false, holding: false };
  assert.ok(!actsFor("stranger", "fine", free).includes("hug"));
  assert.ok(actsFor("acquaintance", "fine", free).includes("hug"));
  assert.ok(!actsFor("acquaintance", "fine", free).includes("kiss"));
  assert.ok(actsFor("friend", "happy", free).includes("kiss"));
  assert.ok(!actsFor("friend", "cross", free).includes("joke"));
  const work = { atWork: true, serves: true, holding: true };
  assert.ok(actsFor("stranger", "fine", work).includes("order") && actsFor("stranger", "fine", work).includes("give"));
  assert.ok(!actsFor("close", "happy", work).includes("hug"));
  // (a happy one takes a compliment; a hug from a stranger in a bad mood, refused)
  const yes = actOutcome("compliment", null, "happy", mid, 0.3);
  assert.ok(yes.ok && yes.dv > 0 && yes.react === "smile");
  const no = actOutcome("hug", null, "sad", mid, 0.6);
  assert.ok(!no.ok && no.dv < 0 && no.react === "refuse");
  // (the same joke again and again: less each time)
  assert.ok(actOutcome("joke", null, "happy", mid, 0.1, 3).dv < actOutcome("joke", null, "happy", mid, 0.1).dv);
  let b = bondAfter(null, 6, 0);
  b = bondAfter(b, 120, 1);
  assert.deepEqual([b.v, b.n], [100, 2]);
  assert.equal(bondFaded({ v: 60, n: 4, at: 0 }, 7 * 86_400_000).v, 30);
});

test("mind: NPCs with each other — the cheerful take to each other, two grumps sour", () => {
  const sunny = traitsOf("a", { cheerful: 0.9, outgoing: 0.8, active: 0.5, neat: 0.5 });
  const sunny2 = traitsOf("b", { cheerful: 1, outgoing: 0.6, active: 0.6, neat: 0.4 });
  const grump = traitsOf("c", { cheerful: 0.1, outgoing: 0.2, active: 0.5, neat: 0.5 });
  const grump2 = traitsOf("d", { cheerful: 0.2, outgoing: 0.1, active: 0.5, neat: 0.5 });
  assert.ok(getOn(sunny, sunny2) > 0.2, `${getOn(sunny, sunny2)}`);
  assert.ok(getOn(grump, grump2) < 0, `${getOn(grump, grump2)}`);
  assert.ok(chatDelta(sunny, sunny2, "happy", "happy", 0.5) > 0);
  assert.ok(chatDelta(grump, grump2, "uneasy", "sad", 0.5) < 0);
});

test("lines: theirs first, the defaults else, a day by their mood", () => {
  const d = { lines: [{ when: "joke", en: "Mine!", pt: "Minha!" }] };
  assert.equal(lineFor(d, "joke", seq(0)), "Mine!\u001fMinha!");
  assert.ok(lineFor(d, "compliment", seq(0)).length > 0);
  assert.ok(lineFor(d, "day", seq(0), "cross").startsWith("Don't ask."));
  assert.equal(lineFor(d, "nothing", seq(0)), "");
});
