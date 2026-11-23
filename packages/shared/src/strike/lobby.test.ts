// (plan 118, F10a) The lobby's jobs: each building's spot inside its room, the drills' out in the yard; a briefing
// for every map with its stops on the map.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BUILDINGS } from "../grounds.ts";
import { briefStops } from "./brief.ts";
import { STRIKE_SPOTS, STRIKE_YARD } from "./land.ts";
import { inRect } from "./map.ts";
import { STRIKE_MAPS } from "./maps/index.ts";

describe("the Strike Park's lobby (plan 118)", () => {
  const inside = (key: string, x: number, z: number, m = 0) => {
    const b = BUILDINGS.find((q) => q.key === key);
    assert.ok(b, key);
    return x > b.x0 + m && x < b.x1 - m && z > b.z0 + m && z < b.z1 - m;
  };
  it("each building's spot is inside its room, a step in from its walls", () => {
    for (const [k, key] of [
      ["armory", "strike-armory"],
      ["briefing", "strike-hall"],
      ["trophies", "strike-trophies"],
      ["war", "strike-war"],
    ] as const) {
      const sp = STRIKE_SPOTS[k];
      assert.ok(inside(key, sp.x, sp.z, 0.8), `${k} in ${key}`);
    }
  });
  it("the drills are in the open yard, in no building", () => {
    for (const k of ["range", "pad"] as const) {
      const sp = STRIKE_SPOTS[k];
      assert.ok(sp.x > STRIKE_YARD.x0 && sp.x < STRIKE_YARD.x1 && sp.z > STRIKE_YARD.z0 && sp.z < STRIKE_YARD.z1, k);
      for (const b of BUILDINGS)
        assert.ok(
          !(sp.x > b.x0 - 0.5 && sp.x < b.x1 + 0.5 && sp.z > b.z0 - 0.5 && sp.z < b.z1 + 0.5),
          `${k} in ${b.key}`,
        );
    }
  });
  it("every map's briefing: the whole of it first, then its places, all on the map", () => {
    for (const map of STRIKE_MAPS) {
      const st = briefStops(map);
      assert.ok(st.length >= 3, map.key);
      assert.equal(st[0].name, map.name);
      for (const s of st) {
        assert.ok(inRect(map.size, s.at[0], s.at[1], 1), `${map.key}: ${s.name}`);
        assert.ok(s.say.length > 10 && s.far > 5);
      }
      if (map.sites?.B)
        assert.ok(
          st.some((s) => s.name.startsWith("Site B")),
          map.key,
        );
    }
  });
});
