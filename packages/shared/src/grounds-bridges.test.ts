import assert from "node:assert/strict";
import { test } from "node:test";
import {
  applyEdits,
  BRIDGES,
  bridgeAt,
  bridgePiers,
  CHUNK,
  checkEdits,
  deckAt,
  groundAt,
  onBridgeRail,
  terrainAt,
  WAYS,
  wayAlong,
} from "./grounds.ts";
import {
  addBridge,
  alongAt,
  bridgeDefOf,
  bridgeOf,
  changeBridge,
  fitSpan,
  newBridgeKey,
  pointAlong,
  removeBridge,
} from "./grounds-bridges.ts";
import { editsCount, mergeEdits } from "./grounds-draft.ts";
import { type GroundsEdits, NO_EDITS } from "./grounds-edits.ts";
import { groundSolidsIn } from "./shapes/grounds.ts";

// The bridges in God mode (docs/plan/109-bridges.md): the generator's keyed and in their styles, changed or taken
// away; new ones on any way; the rules.

const decksNear = (x: number, z: number) => {
  const cx = Math.floor(x / CHUNK);
  const cz = Math.floor(z / CHUNK);
  const out = [];
  for (let i = -1; i <= 1; i++)
    for (let j = -1; j <= 1; j++)
      out.push(...groundSolidsIn(cx + i, cz + j).filter((g) => g.what.startsWith("bridge")));
  return out;
};
const mid = (key: string) => {
  const b = bridgeOf(key);
  assert.ok(b, key);
  return b.w.line[(b.a + b.b) >> 1];
};

test("the generator's four: keyed by their way, in the styles they've always been drawn in", () => {
  applyEdits(NO_EDITS);
  assert.deepEqual(
    BRIDGES.map((b) => [b.key, b.style, b.rails, b.piers, b.made]),
    [
      ["road~0", "steel", "truss", true, true],
      ["ravine~0", "timber", "railing", false, true],
      ["long-road~0", "timber", "railing", false, true],
      ["long-road~1", "concrete", "parapet", true, true],
    ],
  );
  const [x, z] = mid("road~0");
  assert.equal(bridgeAt(x, z)?.key, "road~0", "picked on its deck");
  assert.equal(bridgeAt(x + 200, z), null);
  const high = bridgeOf("long-road~1");
  assert.ok(high && bridgePiers(high).length >= 2, "the high bridge on its piers");
});

test("the river bridge taken away: the road on the land there (filled to it, a causeway), no deck nor truss; back again", () => {
  applyEdits(NO_EDITS);
  const [x, z] = mid("road~0");
  const deck = deckAt(x, z);
  assert.ok(deck !== null);
  const e = removeBridge(NO_EDITS, "road~0");
  assert.deepEqual(e.bridges, { change: {}, remove: ["road~0"] });
  assert.deepEqual(checkEdits(e), []);
  const dirty = applyEdits(e);
  assert.ok(dirty.length > 0, "its chunks made again");
  assert.equal(bridgeOf("road~0"), null);
  assert.ok(!WAYS.find((w) => w.key === "road")?.bridged.some(Boolean), "none of the road's samples a bridge");
  assert.equal(deckAt(x, z), null);
  assert.ok(Math.abs(terrainAt(x, z) - deck) < 0.05, "the land filled to the road across the river, as any way's");
  assert.equal(decksNear(x, z).length, 0, "no deck, no truss");
  applyEdits(NO_EDITS);
  assert.equal(deckAt(x, z), deck);
});

test("a bridge added on a road: its deck and its sides solid along it, its ends flush; its style's look", () => {
  applyEdits(NO_EDITS);
  const w = WAYS.find((u) => u.key === "road");
  assert.ok(w);
  const s = wayAlong(w);
  const span = fitSpan(w, s[120], s[190]);
  assert.ok(span);
  const key = newBridgeKey(NO_EDITS);
  assert.equal(key, "god-bridge-1");
  const e = addBridge(NO_EDITS, { key, way: "road", s0: span[0], s1: span[1], style: "concrete" });
  assert.deepEqual(checkEdits(e), []);
  applyEdits(e);
  const b = bridgeOf(key);
  assert.ok(b && !b.made);
  const w2 = b.w;
  assert.deepEqual([b.style, b.rails, b.piers], ["concrete", "parapet", true]);
  assert.ok(b.b - b.a >= 60);
  for (let i = b.a; i <= b.b; i++) assert.ok(w2.bridged[i]);
  const [x, z] = w2.line[(b.a + b.b) >> 1];
  const near = decksNear(x, z);
  assert.ok(near.some((g) => g.what === "bridge_deck"));
  assert.ok(
    near.some((g) => g.what === "bridge_rail"),
    "its parapets",
  );
  assert.equal(
    bridgePiers(b).length,
    1,
    "a pier between its two spans (solid only where the land's far enough under it)",
  );
  assert.ok(deckAt(x, z) !== null);
  // (over its edge: its parapet's strip, not walked)
  const [ax, az] = w2.line[b.a + 5];
  const [bx, bz] = w2.line[b.a + 6];
  const l = Math.hypot(bx - ax, bz - az);
  const off = w.w / 2 + 1;
  assert.ok(onBridgeRail(ax - ((bz - az) / l) * off, az + ((bx - ax) / l) * off));
  // its own steps: open sides, then taken away as if never
  const open = changeBridge(e, key, { rails: "none" });
  assert.equal(open.bridges?.add?.[0].rails, "none");
  applyEdits(open);
  assert.ok(!onBridgeRail(ax - ((bz - az) / l) * off, az + ((bx - ax) / l) * off), "no sides: off it you go");
  assert.ok(!decksNear(x, z).some((g) => g.what === "bridge_rail"));
  assert.deepEqual(removeBridge(open, key).bridges, { add: [], change: {} });
  // (not over another on its way: cut back to the gap, or none where there's none)
  const w3 = bridgeOf(key)?.w;
  assert.ok(w3);
  assert.equal(fitSpan(w3, s[130], s[140]), null);
  const cut = fitSpan(w3, s[100], s[130]);
  assert.ok(cut && cut[1] < s[b.a]);
  applyEdits(NO_EDITS);
});

test("the river bridge restyled: stone on piers, its colour; its stretch dragged; in the draft's count and merge", () => {
  applyEdits(NO_EDITS);
  const river = bridgeOf("road~0");
  assert.ok(river);
  const was = bridgeDefOf(river);
  let e: GroundsEdits = changeBridge(NO_EDITS, "road~0", { style: "stone" });
  assert.deepEqual(e.bridges?.change?.["road~0"], { style: "stone", colour: 0x8a8174, rails: "parapet", piers: true });
  e = changeBridge(e, "road~0", { colour: 0x6d5f52, s0: was.s0 - 3, s1: was.s1 + 3 });
  assert.deepEqual(checkEdits(e), []);
  applyEdits(e);
  const b = bridgeOf("road~0");
  assert.ok(b);
  assert.deepEqual([b.style, b.colour, b.rails, b.piers], ["stone", 0x6d5f52, "parapet", true]);
  const now = bridgeDefOf(b);
  assert.ok(Math.abs(now.s0 - (was.s0 - 3)) < 1 && Math.abs(now.s1 - (was.s1 + 3)) < 1, "longer by 3 m each end");
  assert.ok(bridgePiers(b).length >= 1, "an arch either side of a pier");
  assert.ok(decksNear(...b.w.line[bridgePiers(b)[0]]).some((g) => g.what === "bridge_pier"));
  assert.deepEqual(editsCount(NO_EDITS, e).bridges, { add: 0, change: 1, remove: 0 });
  // (someone else took the ravine's away meanwhile: both kept)
  const theirs = { ...removeBridge(NO_EDITS, "ravine~0"), rev: 2 };
  const m = mergeEdits(NO_EDITS, e, theirs);
  assert.deepEqual(m.overlaps, []);
  assert.deepEqual(m.edits.bridges?.remove, ["ravine~0"]);
  assert.equal(m.edits.bridges?.change?.["road~0"]?.style, "stone");
  applyEdits(NO_EDITS);
});

test("the rules: on a way there is, 4–400 m, a style and sides there are, a colour; the generator's stay on theirs", () => {
  applyEdits(NO_EDITS);
  const ok = { key: "god-bridge-1", way: "road", s0: 100, s1: 130, style: "steel" as const };
  assert.deepEqual(checkEdits(addBridge(NO_EDITS, ok)), []);
  const bad = (d: object) => checkEdits(addBridge(NO_EDITS, { ...ok, ...d } as typeof ok));
  assert.deepEqual(bad({ way: "nowhere" }), ["god-bridge-1: on no way there is"]);
  assert.deepEqual(bad({ s1: 102 }), ["god-bridge-1: 4–400 m long"]);
  assert.deepEqual(bad({ s1: 600 }), ["god-bridge-1: 4–400 m long"]);
  assert.deepEqual(bad({ style: "rope" }), ["god-bridge-1: not a kind of bridge"]);
  assert.deepEqual(bad({ rails: "glass" }), ["god-bridge-1: not a bridge's sides"]);
  assert.deepEqual(bad({ colour: -1 }), ["god-bridge-1: not a colour"]);
  assert.deepEqual(bad({ key: "bridge-1" }), ['A new key "bridge-1": "god-" and letters, digits, dashes']);
  assert.deepEqual(checkEdits({ rev: 0, bridges: { change: { "road~0": { way: "ravine" } as never } } }), [
    "road~0: stays on its way",
  ]);
  // (on a way the draft took away: none)
  assert.deepEqual(
    checkEdits({ ...addBridge(NO_EDITS, { ...ok, way: "south-woods" }), ways: { remove: ["south-woods"] } }),
    ["god-bridge-1: on no way there is"],
  );
});

test("along a way: a point's distance and back", () => {
  applyEdits(NO_EDITS);
  const w = WAYS.find((u) => u.key === "road");
  assert.ok(w);
  const [x, z] = pointAlong(w, 123.4);
  assert.ok(Math.abs(alongAt(w, x, z) - 123.4) < 0.05);
});

// docs/plan/122: groundAt measures the ways' samples only by a bridged one — on a deck it's the deck still, its ends
// too; away from every bridge it's the land's own.
test("groundAt: a bridge's deck on it, the land away from them", () => {
  applyEdits(NO_EDITS);
  assert.ok(BRIDGES.length > 0);
  let on = 0;
  for (const br of BRIDGES)
    for (let i = br.a + 1; i < br.b; i++) {
      const [x, z] = br.w.line[i];
      assert.equal(groundAt(x, z), br.w.h[i], `${br.key} sample ${i}`);
      on++;
    }
  assert.ok(on > 20, `${on} on decks`);
  let off = 0;
  for (let x = -400; x < 700; x += 37)
    for (let z = -1000; z < 300; z += 41) {
      const near = BRIDGES.some((br) =>
        br.w.line.slice(br.a, br.b + 1).some(([bx, bz]) => Math.hypot(bx - x, bz - z) < 90),
      );
      if (near) continue;
      assert.equal(groundAt(x, z), terrainAt(x, z));
      off++;
    }
  assert.ok(off > 500, `${off} off`);
});
