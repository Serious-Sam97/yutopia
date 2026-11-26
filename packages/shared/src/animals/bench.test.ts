import assert from "node:assert/strict";
import { test } from "node:test";
import { simDay } from "./sim.ts";
import type { AnimalKind } from "./species.ts";

// The animals' day, on its own (docs/plan/128-animal-minds.md, F10a): before plan 128 a deer was on the move 12% of
// its day and never 30 m from home, the same at noon as at dusk. These are the numbers its day must keep now.

test("the big game: out in its range, busy at dusk and dawn, bedded by day", () => {
  for (const k of ["deer", "elk", "moose", "boar", "fox", "lynx"] as AnimalKind[]) {
    const s = simDay(k);
    assert.ok(s.moving > 0.15 && s.moving < 0.45, `${k} on the move ${(s.moving * 100).toFixed(0)}% of its day`);
    assert.ok(s.reach > 0.6, `${k} gets ${(s.reach * 100).toFixed(0)}% out into its range`);
    assert.ok(s.reach < 1.15, `${k} stays in its range (${(s.reach * 100).toFixed(0)}%)`);
    assert.ok(s.twilight > s.day * 3 && s.twilight > s.night, `${k}: dusk and dawn its busiest`);
    assert.ok(s.visited.bed >= 2 && s.visited.feed >= 2, `${k} goes between its bed and its feeding grounds`);
    assert.ok((s.doings.graze ?? 0) > 0.08, `${k} feeds`);
  }
});

test("those about at any hour lie up at noon; night ones sleep by day; birds roost at night", () => {
  for (const k of ["wolf", "bear"] as AnimalKind[]) {
    const s = simDay(k);
    assert.ok(s.moving > 0.25 && s.moving < 0.6, `${k} on the move ${(s.moving * 100).toFixed(0)}%`);
    assert.ok(s.day < s.twilight, `${k}: easier by day`);
  }
  for (const k of ["owl", "bat", "raccoon"] as AnimalKind[]) {
    const s = simDay(k);
    assert.ok(s.day < 0.05 && s.night > 0.2, `${k}: by night, not by day (${(s.day * 100).toFixed(0)}% / ${(s.night * 100).toFixed(0)}%)`);
  }
  for (const k of ["crow", "songbird", "squirrel"] as AnimalKind[]) {
    const s = simDay(k);
    assert.ok(s.night < 0.02 && s.day > 0.08, `${k}: by day (${(s.day * 100).toFixed(0)}%), not by night`);
    assert.ok(s.reach < 1.2, `${k} stays round its range (${(s.reach * 100).toFixed(0)}%)`);
  }
});

test("a group keeps together: the herd round its lead, the pack behind it", () => {
  for (const k of ["deer", "wolf"] as AnimalKind[]) {
    const s = simDay(k, { n: 4 });
    assert.ok(s.spread < 25, `${k}: the others ${s.spread.toFixed(0)} m from the lead on average`);
    assert.ok(s.reach > 0.6, `${k}'s group goes out in its range`);
  }
});

// ── the minds' parts (plan 128) ─────────────────────────────────────────────────────────────────────────────────────
import { type Ctx, freshNeeds, type Seen, think } from "./mind.ts";
import { benchPlaces } from "./sim.ts";
import { callsNow, noiseOf, traitsOf } from "./traits.ts";

const at = (kind: AnimalKind, o: Partial<Ctx> = {}): Ctx => ({
  kind,
  young: false,
  hour: 19,
  night: 0.5,
  storm: 0,
  x: 0,
  z: 0,
  home: { x: 0, z: 0 },
  territory: 0,
  hurt: false,
  youngNear: false,
  inWater: false,
  seen: [],
  needs: freshNeeds(),
  doing: "graze",
  for: 100,
  roll: 0.5,
  places: benchPlaces(kind),
  ...o,
});
const seen = (s: Partial<Seen> & { kind: Seen["kind"]; x: number }): Seen => ({ id: "x", z: 0, v: 0, ...s });

test("an alarm passed on (F6a): a deer warned by another's snort, not having seen the threat", () => {
  assert.equal(think(at("deer", { seen: [seen({ kind: "alarm", x: 10 })] })).doing, "flee");
  assert.ok(["alert", "graze", "wander", "travel", "rest", "idle", "sniff", "groom"].includes(think(at("deer", { seen: [seen({ kind: "alarm", x: 60 })] })).doing));
  // (a wolf isn't warned off by a deer's alarm: the server doesn't pass it them — and noise by gait)
  assert.ok(noiseOf(5, false) > noiseOf(1.3, false) && noiseOf(1, true) < noiseOf(1.3, false) && noiseOf(0, false) === 0);
});

test("calls (F8a): a wolf howls when its call's due, at night; a deer doesn't call", () => {
  assert.equal(think(at("wolf", { hour: 23, night: 1, callDue: true })).doing, "call");
  assert.ok(callsNow("wolf", 23) && !callsNow("wolf", 12));
  assert.ok(callsNow("songbird", 6) && !callsNow("songbird", 14));
  assert.equal(traitsOf("deer").calls, undefined);
});

test("the young by their mother; a pack's hunt round its prey; a scavenger to a kill (F8a)", () => {
  const fawn = think(at("deer", { young: true, mother: { x: 20, z: 0, doing: "travel" } }));
  assert.equal(fawn.doing, "follow");
  assert.equal(think(at("deer", { young: true, mother: { x: 2, z: 0, doing: "flee" } })).doing, "flee");
  const wolf = think(at("wolf", { index: 2, lead: { x: 5, z: 0, doing: "chase", target: "deer#0" } }));
  assert.equal(wolf.doing, "chase");
  assert.equal(wolf.target, "deer#0");
  assert.equal(wolf.flank, 2);
  const crow = think(at("crow", { hour: 12, needs: { ...freshNeeds(), hunger: 0.6 }, seen: [seen({ kind: "carcass", id: "deer#1", x: 80 })] }));
  assert.equal(crow.why, "carrion");
  // (a wolf at it: the fox waits its turn, near)
  const fox = think(at("fox", { hour: 19, needs: { ...freshNeeds(), hunger: 0.6 }, seen: [seen({ kind: "carcass", id: "deer#1", x: 10, guarded: true })] }));
  assert.ok(fox.doing === "alert" && fox.why === "carrion");
});

test("it remembers (F7a): no feeding ground where it was shot at; a herd keeps a lookout", () => {
  const p = benchPlaces("deer");
  const hungry = { ...freshNeeds(), hunger: 0.9 };
  const it = think(at("deer", { x: p.bed.x, z: p.bed.z, doing: "rest", for: 999, needs: hungry, avoid: p.feed.map((f) => ({ ...f, r: 60 })) }));
  for (const f of p.feed) assert.ok(!it.to || Math.hypot(it.to.x - f.x, it.to.z - f.z) > 50, "not to a feeding ground it was shot at");
  const f0 = p.feed[0];
  const look = think(at("deer", { index: 2, lookout: true, lead: { x: f0.x + 3, z: f0.z, doing: "graze" }, doing: "graze", for: 10, x: f0.x, z: f0.z }));
  assert.equal(look.doing, "alert");
});

test("the double check's (plan 128): a bird's flight held to where it's going; its friend always known; no play for a fledgling; a herd's own spot round its place", () => {
  const goal = { x: 150, z: 20 };
  const crow = think(at("crow", { hour: 12, doing: "fly", for: 1, goal, arrived: false, needs: { ...freshNeeds(), hunger: 0.7 } }));
  assert.equal(crow.doing, "fly");
  assert.deepEqual(crow.to, goal);
  const fox = think(at("fox", { friend: "me", seen: [seen({ kind: "person", id: "me", x: 20, aware: 0 })] }));
  assert.equal(fox.doing, "follow");
  for (let i = 0; i < 20; i++) assert.notEqual(think(at("duck", { young: true, hour: 12, roll: i / 20, doing: "idle", for: 99 })).doing, "play");
  const p = benchPlaces("deer");
  const a = think(at("deer", { index: 2, lead: { x: p.bed.x + 2, z: p.bed.z, doing: "rest" }, x: p.bed.x + 8, z: p.bed.z, hour: 12, doing: "idle", for: 99 }));
  if (a.doing === "travel" && a.to) assert.ok(Math.hypot(a.to.x - p.bed.x, a.to.z - p.bed.z) > 1, "its own spot, not the lead's");
});

test("a bolt is a run all the way (not a few strides and back to grazing); the dog kind trots", () => {
  const goal = { x: -40, z: 0 };
  // (bolting, frightened, where it's going still ahead: on, at a run — though what it's from is no nearer)
  const on = think(at("fox", { doing: "flee", for: 1, goal, arrived: false, needs: { ...freshNeeds(), fear: 0.75 }, seen: [seen({ kind: "person", x: 15, aware: 1 })] }));
  assert.equal(on.doing, "flee");
  assert.equal(on.pace, "run");
  assert.deepEqual(on.to, goal);
  // (there: it stops — and isn't sent off again by its own fright)
  assert.notEqual(think(at("fox", { doing: "flee", for: 5, goal, arrived: true, needs: { ...freshNeeds(), fear: 0.7 } })).doing, "flee");
  // a wolf goes about at a trot, a deer a long way at a trot
  const wolf = think(at("wolf", { hour: 20, doing: "idle", for: 99, needs: { ...freshNeeds(), hunger: 0.8 } }));
  if (wolf.doing === "travel") assert.equal(wolf.pace, "trot");
});
