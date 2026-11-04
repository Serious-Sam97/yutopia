import assert from "node:assert/strict";
import { test } from "node:test";
import { FOOTINGS, keyFooting, kindFooting, MATS, TILE_FOOTING } from "./footing.ts";
import {
  BUILDINGS,
  CHUNK,
  deckAt,
  footingAt,
  inBuilt,
  POND,
  placeShift,
  roadFooting,
  setUnderfoot,
  speedOn,
  WAYS,
  weatheredFooting,
  whatFooting,
} from "./grounds.ts";
import { townBounds } from "./land.ts";
import { FLOORS } from "./map.ts";
import { type GroundWhat, groundSolidAt, groundSolidsIn } from "./shapes/grounds.ts";

// (the land's box: land.ts, docs/plan/69)
const GROUNDS = townBounds(); // (today's town: the long road's land is its own tests')

// What the feet are on (docs/plan/63-the-steps.md, phase 1): every place a body stands, at its
// height, gives one of the steps' surfaces.

const way = (): "asphalt" => "asphalt";

test("every floor tile has its footing; a rug and the standup mat are carpet over it", () => {
  for (const ch of Object.keys(FLOORS)) assert.ok(FOOTINGS.includes(TILE_FOOTING[ch]), `tile ${ch}`);
  assert.equal(TILE_FOOTING["~"], "hollow", "the stage's boards");
  assert.equal(TILE_FOOTING[":"], "carpet", "the booths' felt");
  assert.equal(MATS.rug, "carpet");
  assert.equal(kindFooting("standup_mat"), "carpet");
});

test("what's stood on in the building, by Jolt's key", () => {
  const kinds: Record<string, string> = { d1: "desk", a1: "arcade", p1: "pool_table", s1: "stairs", v1: "vending" };
  const at = (on: string) =>
    keyFooting(
      on,
      (id) => kinds[id],
      (what) => whatFooting(what, way),
    );
  assert.equal(at("thing:d1"), "wood", "a desk's top");
  assert.equal(at("thing:a1"), "sheet", "an arcade cabinet");
  assert.equal(at("thing:p1"), "felt", "the pool table");
  assert.equal(at("thing:s1"), "concrete", "the stairs' treads");
  assert.equal(at("thing:v1"), "sheet", "the vending machine");
  assert.equal(at("thing:gone"), "wood", "a thing not known (yet): wood");
  assert.equal(at("car:c9"), "sheet", "a parked car's roof");
  assert.equal(at("lift:l1"), "tile", "the lift car's stone floor");
  assert.equal(at("roof:2:0,0"), "concrete", "the HQ's roof");
  assert.equal(at("clutter:0:1,1"), "wood");
  assert.equal(at("slab:0:0,0"), null, "a floor's slab: the floor's tile, the caller's");
  assert.equal(at("land"), null, "the land: the caller's");
  assert.equal(at("grounds:porch"), "hollow");
});

test("the Grounds' things stood on: roofs under their snow, porches, stands, the bridges by their way", () => {
  assert.equal(whatFooting("roof", way), "snow");
  assert.equal(whatFooting("porch", way), "hollow");
  assert.equal(whatFooting("kart_stand", way), "hollow");
  assert.equal(whatFooting("kart_bowl", way), "asphalt");
  assert.equal(whatFooting("bench", way), "wood");
  assert.equal(whatFooting("lamp_cobra", way), "sheet");
  assert.equal(
    whatFooting("bridge_deck", () => "packed"),
    "hollow",
    "the trail's timber footbridge",
  );
  assert.equal(
    whatFooting("bridge_deck", () => "asphalt"),
    "sheet",
    "the road's steel bridge",
  );
  assert.equal(
    whatFooting("bridge_deck", () => "blackice"),
    "blackice",
    "its black ice",
  );
});

// a bridged way's middle sample
function bridgeOf(kinds: string[]): [number, number] {
  const w = WAYS.find((w) => kinds.includes(w.kind) && w.bridged.some(Boolean));
  assert.ok(w, `a bridged ${kinds.join("/")}`);
  const a = w.bridged.indexOf(true);
  const b = w.bridged.lastIndexOf(true);
  return w.line[Math.floor((a + b) / 2)];
}
// what's at (x, z) at `top`, in its chunk or one round it (a thing's in the chunk of its middle)
function solidAt(x: number, z: number, top: number): GroundWhat | null {
  const cx = Math.floor(x / CHUNK);
  const cz = Math.floor(z / CHUNK);
  for (let dz = -1; dz <= 1; dz++)
    for (let dx = -1; dx <= 1; dx++) {
      const w = groundSolidAt(cx + dx, cz + dz, x, z, top);
      if (w) return w;
    }
  return null;
}

test("out on the Grounds: the pond's ice, a road, a trail, the woods, a storm's snow on the road", () => {
  assert.equal(footingAt(POND.cx, POND.cz), "ice");
  const road = WAYS.find((w) => w.kind === "road" && !w.bridged.some(Boolean)) ?? WAYS.find((w) => w.kind === "road");
  assert.ok(road);
  const [rx, rz] = road.line[Math.floor(road.line.length / 2)];
  assert.ok(["asphalt", "slush", "blackice"].includes(footingAt(rx, rz)), "a road: asphalt (or its patches)");
  assert.equal(footingAt(rx, rz, 0.5, 0.6), "snow", "a road under a storm's snow");
  const trail = WAYS.find((w) => w.kind === "trail");
  assert.ok(trail);
  const [tx, tz] = trail.line[2];
  assert.equal(footingAt(tx, tz), "packed", "a trail's packed snow");
  // the woods: deep snow somewhere off the ways
  let deep = false;
  for (let x = -380; x < 200 && !deep; x += 7)
    for (let z = -340; z < 160 && !deep; z += 7) deep = footingAt(x, z) === "deep";
  assert.ok(deep, "deep snow in the woods");
});

test("a bridge: its deck over the river by its way; on the ice under it, the ice", () => {
  const [x, z] = bridgeOf(["road", "street", "driveway"]);
  assert.ok(["asphalt", "slush", "blackice"].includes(footingAt(x, z)), "on the road's deck: the road");
  assert.equal(footingAt(x, z, 0.5, 0, true), "ice", "on the river under it: ice, not the road over it");
  const deck = deckAt(x, z);
  assert.ok(deck !== null);
  assert.equal(solidAt(x, z, deck), "bridge_deck", "Jolt's hit there is the deck");
  assert.equal(
    whatFooting("bridge_deck", () => footingAt(x, z, 0.5)),
    "sheet",
    "the road's steel",
  );
  const [fx, fz] = bridgeOf(["trail"]);
  assert.equal(
    whatFooting("bridge_deck", () => footingAt(fx, fz)),
    "hollow",
    "the trail's footbridge",
  );
  assert.notEqual(footingAt(fx, fz, 0.5, 0, true), "packed", "the ravine under it isn't the trail");
});

test("in the town's buildings, each its own floor", () => {
  const want: Record<string, string> = {
    barn: "earth",
    bar: "wood",
    diner: "tile",
    hotel: "carpet",
    gatehouse: "rock",
  };
  for (const [kind, f] of Object.entries(want)) {
    const b = BUILDINGS.find((b) => b.kind === kind);
    assert.ok(b, kind);
    const x = (b.x0 + b.x1) / 2;
    const z = (b.z0 + b.z1) / 2;
    assert.ok(inBuilt(b, x, z), `${kind}: its middle is built`);
    assert.equal(footingAt(x, z), f, kind);
  }
});

test("a town roof stood on is the roof (under its snow), not the floor under it", () => {
  const b = BUILDINGS.find((b) => b.kind === "bar");
  assert.ok(b);
  const cx = Math.floor((b.x0 + b.x1) / 2 / CHUNK);
  const cz = Math.floor((b.z0 + b.z1) / 2 / CHUNK);
  // (its topmost: a roof under it is the same snow, its walls' tops too)
  let roof: { x: number; z: number; top: number } | null = null;
  for (let dz = -1; dz <= 1; dz++)
    for (let dx = -1; dx <= 1; dx++)
      for (const g of groundSolidsIn(cx + dx, cz + dz))
        if (g.what === "roof" && g.s.t === "box" && g.s.a === 0 && (!roof || g.s.y + g.s.hy > roof.top))
          roof = { x: g.s.x, z: g.s.z, top: g.s.y + g.s.hy };
  assert.ok(roof, "a roof near the bar");
  const what = solidAt(roof.x, roof.z, roof.top);
  assert.ok(what === "roof" || what === "building", `on the roof: ${what}`);
  assert.equal(whatFooting(what, way), "snow");
  assert.equal(solidAt(roof.x, roof.z, roof.top + 1.5), null, "1.5 m over it: nothing stood on");
});

test("the census: every one of the steps' surfaces is under someone's feet somewhere", () => {
  const seen = new Map<string, string>();
  const saw = (f: string, where: string) => {
    if (!seen.has(f)) seen.set(f, where);
  };
  // the building: its tiles, the rugs, what's stood on
  for (const ch of Object.keys(FLOORS)) saw(TILE_FOOTING[ch], `tile ${ch}`);
  for (const k of ["rug", "desk", "pool_table", "arcade", "stairs", "piano"]) saw(kindFooting(k), k);
  saw(
    keyFooting(
      "car:c",
      () => undefined,
      (w) => whatFooting(w, way),
    ) ?? "",
    "a car's roof",
  );
  saw(
    keyFooting(
      "lift:l",
      () => undefined,
      (w) => whatFooting(w, way),
    ) ?? "",
    "the lift car",
  );
  // the Grounds, every 6 m, on a cold night and in a storm's snow
  for (let x = GROUNDS.x0; x < GROUNDS.x1; x += 6)
    for (let z = GROUNDS.z0; z < GROUNDS.z1; z += 6) {
      saw(footingAt(x, z), `${x},${z}`);
      saw(footingAt(x, z, 0.95), `${x},${z} cold`);
      saw(footingAt(x, z, 0.5, 0.6), `${x},${z} in a storm`);
    }
  // …and under the weather (docs/plan/65, W5): a green day, a soaked one, every 12 m
  for (const u of [
    { snow: 0, wet: 0, freezing: false },
    { snow: 0, wet: 1, freezing: false },
  ]) {
    setUnderfoot(u);
    for (let x = GROUNDS.x0; x < GROUNDS.x1; x += 12)
      for (let z = GROUNDS.z0; z < GROUNDS.z1; z += 12) saw(footingAt(x, z), `${x},${z} ${u.wet ? "soaked" : "green"}`);
  }
  setUnderfoot({ snow: 1, wet: 0, freezing: true });
  // the things stood on out there (their tops), the bridges by their way
  for (let cx = Math.floor(GROUNDS.x0 / CHUNK); cx * CHUNK < GROUNDS.x1; cx++)
    for (let cz = Math.floor(GROUNDS.z0 / CHUNK); cz * CHUNK < GROUNDS.z1; cz++)
      for (const g of groundSolidsIn(cx, cz))
        saw(
          whatFooting(g.what, () => footingAt(g.s.x, g.s.z)),
          g.what,
        );
  const missing = FOOTINGS.filter((f) => !seen.has(f));
  assert.deepEqual(missing, [], `never under anyone's feet: ${missing.join(", ")}`);
  console.log(`[census] ${[...seen].map(([f, w]) => `${f} (${w})`).join(", ")}`);
});

test("the weather underfoot (docs/plan/65, W5): grass, earth and mud with no snow lying, snow over them as it lies; the roads' slush and black ice only in winter; wet in the rain", () => {
  const at = <T>(u: { snow: number; wet: number; freezing: boolean }, f: () => T): T => {
    setUnderfoot(u);
    try {
      return f();
    } finally {
      setUnderfoot({ snow: 1, wet: 0, freezing: true });
    }
  };
  const green = { snow: 0, wet: 0, freezing: false };
  const soaked = { snow: 0, wet: 1, freezing: false };
  const white = { snow: 1, wet: 0, freezing: true };
  // (the land's own: open ground, the woods' floor, a trail, a pavement)
  for (const [s, bare, wet, under] of [
    ["snow", "grass", "mud", "snow"],
    ["deep", "earth", "mud", "deep"],
    ["path", "earth", "mud", "packed"],
    ["walk", "concrete", "concrete", "snow"],
  ] as const) {
    assert.equal(
      at(green, () => weatheredFooting(s, 10, 10)),
      bare,
      s,
    );
    assert.equal(
      at(soaked, () => weatheredFooting(s, 10, 10)),
      wet,
      s,
    );
    assert.equal(
      at(white, () => weatheredFooting(s, 10, 10)),
      under,
      s,
    );
  }
  // (the place's own share: a little before or after the rest, never more than 0.1)
  for (let x = -300; x < 300; x += 37) assert.ok(Math.abs(placeShift(x, x * 0.7)) <= 0.1 + 1e-9);
  // the roads: on a green day plain asphalt, wet in the rain; their patches only with snow about,
  // black ice only freezing
  let slush = 0;
  let black = 0;
  for (let x = 0; x < 400; x += 3) {
    assert.equal(
      at(green, () => roadFooting(x, 50, 0.95)),
      null,
    );
    const w = at({ snow: 0.6, wet: 0.5, freezing: false }, () => roadFooting(x, 50, 0.95));
    assert.notEqual(w, "blackice", "no black ice above freezing");
    const c = at({ snow: 0.6, wet: 0.5, freezing: true }, () => roadFooting(x, 50, 0.95));
    if (c === "slush") slush++;
    if (c === "blackice") black++;
  }
  assert.ok(slush + black > 0, "a winter road has its patches");
  // the pace: deep snow as slow as ever with it lying, the woods' floor bare as a floor without
  assert.equal(
    at(white, () => speedOn("deep")),
    0.6,
  );
  assert.equal(
    at(green, () => speedOn("deep")),
    1,
  );
  assert.ok(at(soaked, () => speedOn("snow")) < 1);
  // the tops of things: snow on a roof when it lies, its sheet when it doesn't
  assert.equal(
    at(white, () => whatFooting("roof", way)),
    "snow",
  );
  assert.equal(
    at(green, () => whatFooting("roof", way)),
    "sheet",
  );
});
