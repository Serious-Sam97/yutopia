import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_AVATAR, parseAvatar } from "../avatar.ts";
import { KART_FOLK } from "../kart/park.ts";
import { STRIKE_FOLK, STRIKE_LINES } from "../strike/folk.ts";
import {
  biIn,
  biOf,
  linesFor,
  NPC_LIMITS,
  newNpcKey,
  npcLabel,
  paceOf,
  packLook,
  parseCast,
  parseNpc,
} from "./cast.ts";
import { townCast } from "./town.ts";

test("cast: the town's people, each key once, each as it cleans", () => {
  const cast = townCast();
  assert.equal(new Set(cast.map((d) => d.key)).size, cast.length);
  // the guard, Vortex, the Kart Park's 7, the Strike Park's 11
  assert.equal(cast.length, 2 + KART_FOLK.length + STRIKE_FOLK.length);
  for (const d of cast) {
    assert.ok(d.town, d.key);
    assert.deepEqual(parseNpc(d, { town: true, type: d.behaviour.type }), d, d.key);
    assert.deepEqual(parseNpc(JSON.parse(JSON.stringify(d))), d, `${d.key} through JSON`);
  }
  assert.deepEqual(parseCast(cast), cast);
});

test("cast: the town's as the world drew them — names, looks, lines, pace", () => {
  const cast = new Map(townCast().map((d) => [d.key, d]));
  for (const f of KART_FOLK) {
    const d = cast.get(`folk-${f.id}`);
    assert.ok(d);
    assert.equal(d.name, f.name);
    assert.deepEqual(d.look, parseAvatar(f.look));
    assert.equal(d.behaviour.type, `kart-${f.role}`);
    // (the pace by their gait, as park-life's PACE)
    assert.equal(paceOf(d), { old: 0.7, tired: 0.85, brisk: 1.15, bouncy: 1.05, heavy: 0.95 }[f.look.gait ?? ""] ?? 1);
  }
  for (const f of STRIKE_FOLK) {
    const d = cast.get(`strike-${f.id}`);
    assert.ok(d);
    assert.deepEqual(d.look, parseAvatar(f.look));
    assert.deepEqual(linesFor(d), STRIKE_LINES[f.role]);
  }
  // the labels over their heads, as the client said them
  const rosa = cast.get("folk-rosa");
  assert.ok(rosa);
  assert.equal(npcLabel(rosa.name, biIn(biOf(rosa.role), true)), "Rosa · Direção de prova");
  const maya = cast.get("folk-maya");
  assert.ok(maya);
  assert.equal(npcLabel(maya.name, biIn(biOf(maya.role), false)), "Maya");
  const guard = cast.get("guard");
  assert.ok(guard);
  assert.equal(npcLabel(guard.name, biIn(biOf(guard.role), true)), "Vigia");
  // Vortex: his mascot's look, his name
  const vx = cast.get("vortex");
  assert.ok(vx);
  assert.equal(vx.look, null);
  assert.equal(vx.name, "VORTEX");
});

test("cast: both languages in one string, PT falling back to EN", () => {
  assert.equal(biOf({ en: "Hi", pt: "" }), "Hi");
  assert.equal(biOf({ en: "Hi", pt: "Hi" }), "Hi");
  const s = biOf({ en: "Hi", pt: "Oi" });
  assert.equal(biIn(s, false), "Hi");
  assert.equal(biIn(s, true), "Oi");
  assert.equal(biIn("Hi", true), "Hi");
});

test("cast: a look packed is the look back", () => {
  for (const d of townCast()) {
    if (!d.look) continue;
    assert.deepEqual(parseAvatar(packLook(d.look)), d.look, d.key);
  }
  assert.equal(packLook(DEFAULT_AVATAR), "{}");
  assert.equal(packLook(null), "");
});

test("cast: what anyone sends is cleaned", () => {
  // no key, a bad key, neither a name nor a role: not one
  assert.equal(parseNpc({ name: "A" }), null);
  assert.equal(parseNpc({ key: "Bad Key", name: "A" }), null);
  assert.equal(parseNpc({ key: "npc-a", name: "  " }), null);
  const d = parseNpc({
    key: "npc-a",
    name: `${"x".repeat(80)}\n`,
    role: { pt: "Padeira" },
    look: { skin: "not a colour", hair: "<script>" },
    lines: [
      { en: "Hello", pt: "Olá", when: "greet" },
      { en: "", pt: "Só em português" },
      { en: "", pt: "" },
      { en: "x", when: "hit" },
      ...Array.from({ length: 200 }, (_, i) => ({ en: `l${i}` })),
    ],
    behaviour: {
      type: "guard-rounds",
      hours: "shift",
      from: 22.3,
      to: 30,
      pace: 9,
      talk: "often",
      greet: true,
      shots: "run",
    },
    town: true,
  });
  assert.ok(d);
  assert.equal(d.name.length, NPC_LIMITS.name);
  // (PT alone is said to everyone)
  assert.deepEqual(d.role, { en: "Padeira", pt: "" });
  assert.equal(d.look?.skin, DEFAULT_AVATAR.skin);
  assert.equal(d.look?.hair, DEFAULT_AVATAR.hair);
  assert.equal(d.lines.length, NPC_LIMITS.lines);
  assert.deepEqual(d.lines[0], { when: "greet", en: "Hello", pt: "Olá" });
  assert.deepEqual(d.lines[1], { when: "ambient", en: "Só em português", pt: "" });
  // (a Vortex moment isn't anyone's)
  assert.equal(d.lines[2].when, "ambient");
  // a town NPC is what's kept says, never what was sent: no town type for anyone else
  assert.equal(d.town, true);
  const kept = parseNpc({ key: "npc-a", name: "A", behaviour: { type: "guard-rounds" }, town: true }, { town: false });
  assert.equal(kept?.town, false);
  assert.equal(kept?.behaviour.type, "stand");
  // a town NPC's type stays theirs
  const rosa = parseNpc(
    { key: "folk-rosa", name: "R", behaviour: { type: "wander" } },
    { town: true, type: "kart-control" },
  );
  assert.equal(rosa?.behaviour.type, "kart-control");
  const b = parseNpc({
    key: "npc-b",
    name: "B",
    behaviour: { hours: "shift", from: 22.3, to: 30, pace: 9, shots: "run" },
  });
  assert.deepEqual(
    {
      hours: b?.behaviour.hours,
      from: b?.behaviour.from,
      to: b?.behaviour.to,
      pace: b?.behaviour.pace,
      shots: b?.behaviour.shots,
    },
    { hours: "shift", from: 22.5, to: 24, pace: 1.5, shots: "ignore" },
  );
  // a cast: each key once
  assert.equal(parseCast([{ key: "a", name: "A" }, { key: "a", name: "B" }, null]).length, 1);
});

test("cast: cleaned as the API cleans — by characters, hours only from numbers", () => {
  const face = "😀";
  const d = parseNpc({ key: "npc-e", name: face.repeat(60), behaviour: { from: null, to: true } });
  assert.ok(d);
  // (40 characters, each whole — not 40 UTF-16 units, a face cut in half)
  assert.equal(Array.from(d.name).length, NPC_LIMITS.name);
  assert.equal(d.name, face.repeat(NPC_LIMITS.name));
  assert.deepEqual([d.behaviour.from, d.behaviour.to], [8, 18]);
  const e = parseNpc({ key: "npc-f", name: "F", behaviour: { from: "6.5", to: "" } });
  assert.deepEqual([e?.behaviour.from, e?.behaviour.to], [6.5, 18]);
});

test("cast: new keys are keys", () => {
  const k = newNpcKey();
  assert.match(k, /^npc-[a-z0-9]{8}$/);
  assert.ok(parseNpc({ key: k, name: "A" }));
});
