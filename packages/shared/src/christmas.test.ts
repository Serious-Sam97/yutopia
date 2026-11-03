import assert from "node:assert/strict";
import { test } from "node:test";
import { canPlace } from "./build.ts";
import { entry, placedFootprint } from "./catalog.ts";
import { deckBuilding, decked } from "./christmas.ts";
import { studio as STUDIO } from "./maps/studio.ts";

// Plan 68 phase 2: the admin's Christmas — every room dressed around what's there (nothing taken
// away), each piece where it can be put down, inside its room, and all of it the switch's own.
test("Christmas put out: every room dressed, each piece where it can go, all of it the switch's", () => {
  const map = STUDIO;
  const add = deckBuilding(map, map.objects, () => [], "t");
  assert.ok(add.length >= 20, `${add.length} pieces`);
  assert.ok(add.every(decked), "all marked the switch's");
  assert.equal(new Set(add.map((o) => o.id)).size, add.length, "each its own id");
  const kinds = new Set(add.map((o) => o.kind));
  for (const k of ["xmas_tree", "present", "wreath", "mistletoe", "poinsettia"]) assert.ok(kinds.has(k), `a ${k}`);
  // (on the floor: inside a room; each where it can go among the rest)
  for (const [i, o] of add.entries()) {
    const e = entry(o.kind);
    if (!e.onSurface && !e.wall) {
      const { w, h } = placedFootprint(o);
      assert.ok(
        map.areas.some((a) => o.x >= a.x && o.y >= a.y && o.x + w <= a.x + a.w && o.y + h <= a.y + a.h),
        `${o.id} in a room`,
      );
    }
    if (!e.onSurface) assert.ok(canPlace(map, [...map.objects, ...add.slice(0, i)], o), `${o.kind} at ${o.x},${o.y}`);
  }
  // (nothing of what was there moved: only added to)
  assert.ok(!add.some((o) => map.objects.some((m) => m.id === o.id)));
});
