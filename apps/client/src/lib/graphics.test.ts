import assert from "node:assert/strict";
import { test } from "node:test";
import { cleanGraphics, graphicsFor, isPreset, presetOf, ratioOf, reachOf, tierRatio } from "./graphics";

// The graphics settings (docs/plan/91-the-big-map.md phase 9): each tier's preset is what it always drew.

test("each tier's preset: what the tier drew (the pixels, antialiasing, the lamps, the shadows, the post)", () => {
  const dpr = 2;
  const h = presetOf("high", dpr, 16);
  assert.equal(h.res, 100, "High: the screen's own (2 of 2)");
  assert.deepEqual(
    [h.aa, h.lamps, h.shadows, h.lightShadows, h.finish, h.bloom, h.ao, h.grain],
    [true, 10, 2048, true, true, true, true, true],
  );
  const m = presetOf("medium", dpr, 16);
  assert.equal(m.res, 75);
  assert.deepEqual(
    [m.lamps, m.shadows, m.finish, m.bloom, m.ao, m.grain, m.mirror],
    [6, 1024, true, false, false, false, "low"],
  );
  const l = presetOf("low", dpr, 16);
  assert.deepEqual([l.res, l.lamps, l.shadows, l.finish, l.people, l.mirror], [50, 3, 0, false, "low", "off"]);
  const lw = presetOf("lowest", dpr, 16);
  assert.deepEqual([lw.res, lw.aa, lw.lamps, lw.weather, lw.view], [37.5, false, 2, "low", 700]);
  const p = presetOf("potato", dpr, 16);
  assert.deepEqual([p.res, p.aa, p.lamps, p.view, p.horizon], [25, false, 0, 600, "lowest"]);
  assert.equal(h.view, 900);
  assert.equal(presetOf("high", dpr, 4).view, 700, "4 GB: no further than Lowest's");
  // (the pixel ratio a preset draws at is the tier's, any screen)
  for (const d of [1, 1.5, 2, 3])
    for (const q of ["high", "medium", "low", "lowest", "potato"] as const)
      assert.equal(ratioOf(presetOf(q, d, 16).res, d), tierRatio(q, d), `${q} at ${d}`);
});

test("a setting set by hand over the preset; what's kept of a stored one; Custom only when it differs", () => {
  const over = cleanGraphics({ shadows: 4096, res: 999, lamps: 4, nonsense: 1, horizon: "far" });
  assert.deepEqual(over, { shadows: 4096, lamps: 4 });
  assert.equal(graphicsFor("high", over).shadows, 4096);
  assert.equal(graphicsFor("high", over).bloom, true, "the rest the preset's");
  assert.ok(!isPreset("high", over));
  assert.ok(isPreset("high", { shadows: 2048 }), "the preset's own value: not custom");
  assert.ok(isPreset("high", null));
  assert.equal(cleanGraphics(null), null);
  assert.equal(cleanGraphics({}), null);
});

test("the view distance's reach: each tier's exactly, the land between", () => {
  assert.deepEqual(reachOf(900), { land: 440, districts: 900 });
  assert.deepEqual(reachOf(700), { land: 440, districts: 700 });
  assert.deepEqual(reachOf(600), { land: 330, districts: 600 });
  assert.deepEqual(reachOf(1500), { land: 660, districts: 1500 });
  assert.equal(reachOf(650).land, 385);
  assert.equal(reachOf(99999).districts, 1500, "kept in range");
});
