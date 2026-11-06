import assert from "node:assert/strict";
import { test } from "node:test";
import { FLIGHT_RISE, flightParts, flightRise } from "./flight.ts";
import { getMap } from "./index.ts";
import { kindSolids } from "./shapes/index.ts";
import { connectorsOf } from "./structure/connectors.ts";
import { finishWorld } from "./structure/finish.ts";

// Phase 11.8 (docs/plan/72): a flight of steps up to a mezzanine, as high as it's said to rise.

test("a flight's steps: under 0.2 m each, its top at its rise, at its far end", () => {
  for (const rise of [1.25, 1.75, 2.25]) {
    const parts = flightParts(rise);
    const top = parts.at(-1);
    assert.ok(top && Math.abs(top.y1 - rise) < 1e-9 && Math.abs(top.v1 - 3) < 1e-9);
    assert.ok(parts.every((p, i) => i === 0 || p.y1 - parts[i - 1].y1 <= 0.2 + 1e-9));
  }
  assert.equal(flightRise({ props: { rise: 9 } }), FLIGHT_RISE, "in reason");
  assert.equal(flightRise({ props: { rise: 2.25 } }), 2.25);
  // Jolt's: a flight turned a quarter, its top block at its rise over its floor
  const o = { id: "f", kind: "flight", x: 10, y: 10, yaw: Math.PI / 2, props: { rise: 1.75 } };
  const top = Math.max(...kindSolids(o, 3.5).map((q) => (q.t === "box" ? q.y + q.hy : 0)));
  assert.ok(Math.abs(top - (3.5 + 1.75)) < 1e-9, `${top}`);
});

test("a flight joins its floor and the mezzanine over it: one connector, its floor's both stops", () => {
  const studio = getMap("studio");
  const done = finishWorld(studio, studio.objects, { fresh: true, building: true });
  const f = { id: "fl", kind: "flight", x: 20, y: 10, yaw: 0, props: { rise: 1.75, level: 3 } };
  const c = connectorsOf(done.map, [f]).find((q) => q.id === "fl");
  assert.ok(c);
  assert.equal(c.kind, "flight");
  assert.deepEqual(
    c.stops.map((s) => s.floor),
    [3, 3],
  );
  assert.ok(Math.abs(c.stops[1].z - c.stops[0].z - 1.75) < 1e-9);
});
