import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { chunkHash } from "./grounds-hash.ts";
import { BASE_HOME_LOTS } from "./homes.ts";
import { STRIKE_GROUND, STRIKE_ROAD } from "./strike/land.ts";

// docs/plan/69-the-long-road.md (the guardrail): the long road came east from the barricade — today's
// town is untouched, every chunk west of x 470 as it was before (its land, walking, trees, surfaces
// and solids; the fixture written from the Grounds the day before the road, 2026-11-03).

/** Whether chunk (cx, cz) (32 m) is one the Strike Park's ground or its road in may have changed:
 *  its region and the ridges round it (they rise from its reach now: out to 140 m past it, the land's
 *  drawn edge), or within 60 m of the road's line (its levels eased into the land each side). */
/** Whether chunk (cx, cz) is by one of the generator's home lots (plan 130: their pads eased 8 m out, trees 3). */
function inLots(cx: number, cz: number): boolean {
  const [x0, z0] = [cx * 32, cz * 32];
  return BASE_HOME_LOTS.some((l) => x0 + 32 > l.x0 - 12 && x0 < l.x1 + 12 && z0 + 32 > l.z0 - 12 && z0 < l.z1 + 12);
}
function inStrikeWork(cx: number, cz: number): boolean {
  const x0 = cx * 32;
  const z0 = cz * 32;
  const G = STRIKE_GROUND;
  if (x0 + 32 > G.x0 - 140 && x0 < G.x1 + 140 && z0 + 32 > G.z0 - 140 && z0 < G.z1 + 140) return true;
  const mx = x0 + 16;
  const mz = z0 + 16;
  for (let i = 0; i + 1 < STRIKE_ROAD.length; i++) {
    const [ax, az] = STRIKE_ROAD[i];
    const [bx, bz] = STRIKE_ROAD[i + 1];
    const dx = bx - ax;
    const dz = bz - az;
    const t = Math.max(0, Math.min(1, ((mx - ax) * dx + (mz - az) * dz) / (dx * dx + dz * dz)));
    if (Math.hypot(mx - ax - dx * t, mz - az - dz * t) < 60) return true;
  }
  return false;
}

test("today's town: every chunk west of x 470 as it was before the long road", () => {
  const was = JSON.parse(readFileSync(new URL("./grounds-town.fixture.json", import.meta.url), "utf8")) as Record<
    string,
    string
  >;
  const keys = Object.keys(was);
  assert.ok(keys.length > 1000);
  const changed = keys.filter((k) => {
    const [cx, cz] = k.split(",").map(Number);
    return chunkHash(cx, cz) !== was[k];
  });
  // (2026-11-21, plan 114: the Strike Park — its ground, its clearing and the road in from the county
  // road's bend changed the chunks they're on, and only those)
  // (2026-11-26, plan 130: Pine Meadow's home lots — their pads levelled, their trees cleared, a few metres round)
  const strike = changed.filter((k) => {
    const [cx, cz] = k.split(",").map(Number) as [number, number];
    return !inStrikeWork(cx, cz) && !inLots(cx, cz);
  });
  assert.deepEqual(strike, [], `${strike.length} chunks changed outside the Strike Park's work`);
});
