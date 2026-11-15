import assert from "node:assert/strict";
import { test } from "node:test";
import { cleanGraphics, graphicsFor, isPreset, presetOf, ratioOf, tierRatio } from "./graphics";

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
  assert.deepEqual([lw.res, lw.aa, lw.lamps, lw.weather, lw.districts], [37.5, false, 2, "low", 700]);
  const p = presetOf("potato", dpr, 16);
  assert.deepEqual([p.res, p.aa, p.lamps, p.land, p.districts, p.horizon], [25, false, 0, 330, 600, "lowest"]);
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
