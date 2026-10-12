import assert from "node:assert/strict";
import { test } from "node:test";
import { canPlace } from "./build.ts";
import { entry, footprint } from "./catalog.ts";
import { dressItems } from "./dressing.ts";
import { Grid } from "./grid.ts";
import { areaAt } from "./map.ts";
import { studio } from "./maps/studio.ts";
import { findPath } from "./path.ts";

test("dressing is the same everywhere and only uses free spots", () => {
  const a = dressItems(studio, studio.objects);
  const b = dressItems(studio, studio.objects);
  assert.deepEqual(a, b, "deterministic");
  assert.ok(a.length > 12, `a lived-in studio: ${a.length} items`);
  const kinds = new Set(a.map((d) => d.kind));
  for (const k of ["plant", "frame"]) assert.ok(kinds.has(k as never), `has ${k}`);
  const occupied = new Set<string>();
  for (const o of studio.objects) {
    const e = entry(o.kind);
    if (e.wall || o.kind === "door") continue;
    const { w, h } = footprint(o.kind, o.rot ?? 0);
    for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) occupied.add(`${o.x + dx},${o.y + dy}`);
  }
  for (const d of a) {
    if (d.tile) assert.ok(!occupied.has(`${d.tile[0]},${d.tile[1]}`), `${d.id} on furniture`);
    // only in rooms that asked for it
    const room = areaAt(studio, d.x, d.tile ? d.y : d.y + 0.5);
    assert.ok(room?.dressing, `${d.id} in a dressed room (${room?.key})`);
  }
  // booths and the server room stay bare
  assert.ok(!a.some((d) => ["booth-1", "server-room"].includes(areaAt(studio, d.x, d.y + 0.01)?.key ?? "")));
});

test("dressing never cuts anyone off, and furniture wins over it", () => {
  const items = dressItems(studio, studio.objects);
  const g = Grid.from(studio, studio.objects);
  const plant = items.find((d) => d.kind === "plant" && d.tile);
  assert.ok(plant?.tile);
  assert.ok(!g.ok(plant.tile[0], plant.tile[1]), "a corner plant blocks walking");
  for (const a of studio.areas)
    assert.ok(findPath(g, studio.spawn, { x: a.x + a.w / 2, y: a.y + a.h / 2 }), `reach ${a.key}`);
  // placing a piece of furniture where a plant stands is fine, and the plant moves out
  const lamp = { id: "x-lamp", kind: "lamp", x: plant.tile[0], y: plant.tile[1], rot: 0 };
  assert.ok(canPlace(studio, studio.objects, lamp), "furniture can go there");
  const after = dressItems(studio, [...studio.objects, lamp]);
  assert.ok(!after.some((d) => d.tile && d.tile[0] === lamp.x && d.tile[1] === lamp.y), "the plant made room");
});
