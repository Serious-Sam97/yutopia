import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ANCHORED,
  ANCHORED_AREAS,
  anchoredAt,
  BUILDINGS,
  CHUNK,
  GROUNDS,
  groundsThings,
  LAMPS,
  SNOW_POLES,
  STREET,
  treeKey,
  treesIn,
  WAYS,
} from "./grounds.ts";

// God mode's keys and anchors (docs/plan/53-the-god-mode.md, phase 1): every generated thing on
// the Grounds a key of its own, and what other features hang on anchored.

test("every generated thing has a key of its own", () => {
  const keys = groundsThings().map((t) => t.key);
  const seen = new Set<string>();
  for (const k of keys) {
    assert.ok(k && !k.includes(" "), `a key with no spaces: "${k}"`);
    assert.ok(!seen.has(k), `${k} twice`);
    seen.add(k);
  }
  for (const w of WAYS) assert.ok(seen.has(`way:${w.key}`), w.key);
  for (const b of BUILDINGS) assert.ok(seen.has(`building:${b.key}`), b.key);
  for (const l of LAMPS) assert.ok(seen.has(l.key), l.key);
  for (const s of STREET) assert.ok(seen.has(s.key), s.key);
  for (const p of SNOW_POLES) assert.ok(seen.has(p.key), p.key);
});

test("a lamp's key is its way and its place along it, or its name", () => {
  const keys = new Set(LAMPS.map((l) => l.key));
  for (const k of [
    "lamp:gate",
    "lamp:clearing",
    "lamp:boathouse",
    "lamp:shelter",
    "lamp:driveway:70",
    "lamp:main:6l",
    "lamp:main:6r",
  ])
    assert.ok(keys.has(k), k);
  // (Main Street's lamps both sides, the driveway's one side: every key names a way that's there)
  const ways = new Set(WAYS.map((w) => w.key));
  for (const l of LAMPS) {
    const [, way, at] = l.key.split(":");
    if (at && /^\d+[lr]?$/.test(at) && !way.startsWith("kart-")) assert.ok(ways.has(way), l.key);
  }
});

test("a tree's key is its cell: one tree a cell", () => {
  const keys = new Set<string>();
  for (const [cx, cz] of [
    [-6, -4],
    [-5, -4],
    [3, -10],
    [10, -9],
  ])
    for (const t of treesIn(cx, cz)) {
      const k = treeKey(t);
      assert.ok(!keys.has(k), `${k} twice`);
      keys.add(k);
      // (its cell is inside the chunk it was made in)
      const [i, j] = k.slice(5).split(",").map(Number);
      assert.ok(i * 3.2 >= cx * CHUNK - 3.2 && i * 3.2 < (cx + 1) * CHUNK, k);
      assert.ok(j * 3.2 >= cz * CHUNK - 3.2 && j * 3.2 < (cz + 1) * CHUNK, k);
    }
  assert.ok(keys.size > 100, `trees in the woods (${keys.size})`);
});

test("every anchored key is a thing that's there, with why", () => {
  const keys = new Set(groundsThings().map((t) => t.key));
  for (const [k, why] of Object.entries(ANCHORED)) {
    assert.ok(keys.has(k), `${k} is anchored but isn't on the Grounds`);
    assert.ok(why.length > 10, `${k}: why`);
  }
  for (const a of ANCHORED_AREAS) assert.ok(a.x0 < a.x1 && a.z0 < a.z1 && a.why, a.key);
});

test("what features read by key is anchored", () => {
  // the shuttle and the visitors (grounds.ts SHUTTLE, visitorRoute); the car homes (car/homes.ts);
  // the dealer (MOTORS); the pumps (PUMPS, FORECOURT); the stored floors (building.ts)
  for (const k of [
    "way:driveway",
    "way:road",
    "way:main",
    "building:hall",
    "building:hotel",
    "building:motors",
    "building:gas",
    "building:hq",
    "building:east",
    "building:south",
    "building:gatehouse",
  ])
    assert.ok(ANCHORED[k], `${k} anchored`);
});

test("the anchored areas: the campus, the park, past the edge; the woods aren't", () => {
  assert.equal(anchoredAt(20, 20)?.key, "area:campus"); // the HQ
  assert.equal(anchoredAt(-30, 30)?.key, "area:campus"); // the lot
  assert.equal(anchoredAt(54, -760)?.key, "area:kart");
  assert.equal(anchoredAt(-31, -364)?.key, "area:gatehouse");
  assert.equal(anchoredAt(GROUNDS.x0 + 1, GROUNDS.z1 - 1)?.key, "area:edge");
  assert.equal(anchoredAt(-150, -150), null); // the woods
  assert.equal(anchoredAt(460, -250), null); // the farm's field, south of the farmhouse
});
