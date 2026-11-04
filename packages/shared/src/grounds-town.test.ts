import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { chunkHash } from "./grounds-hash.ts";

// docs/plan/69-the-long-road.md (the guardrail): the long road came east from the barricade — today's
// town is untouched, every chunk west of x 470 as it was before (its land, walking, trees, surfaces
// and solids; the fixture written from the Grounds the day before the road, 2026-11-03).

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
  assert.deepEqual(changed, [], `${changed.length} chunks changed`);
});
