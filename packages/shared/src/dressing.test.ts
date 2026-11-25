import assert from "node:assert/strict";
import { test } from "node:test";
import { canPlace } from "./build.ts";
import { entry, footprint, quarterOf, quarterYaw } from "./catalog.ts";
import { dressItems, dressItemsOf } from "./dressing.ts";
import { getMap } from "./index.ts";
import { levelMap, onLevel } from "./levels.ts";
import type { MapDef } from "./map.ts";
import { areaAt } from "./map.ts";
import { studio } from "./maps/studio.ts";
import { testWorld } from "./physics/testing.ts";
import { wallsEdit } from "./structure/edit.ts";
import { finishWorld } from "./structure/finish.ts";
import { foldMap } from "./structure/fold.ts";
import { structureFromMap } from "./structure/from-map.ts";
import { applyOps } from "./structure/ops.ts";
import type { Structure } from "./structure/types.ts";

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
    const { w, h } = footprint(o.kind, quarterOf(o));
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

test("dressing never cuts anyone off, and furniture wins over it", async () => {
  const items = dressItems(studio, studio.objects);
  const w = await testWorld(studio, studio.objects);
  const g = w.place();
  const nav = (await w.nav()).floor(0);
  const plant = items.find((d) => d.kind === "plant" && d.tile);
  assert.ok(plant?.tile);
  assert.ok(!g.ok(plant.tile[0], plant.tile[1]), "a corner plant blocks walking");
  for (const a of studio.areas)
    assert.ok(nav?.path(studio.spawn, { x: a.x + a.w / 2, y: a.y + a.h / 2 }), `reach ${a.key}`);
  // placing a piece of furniture where a plant stands is fine, and the plant moves out
  const lamp = { id: "x-lamp", kind: "lamp", x: plant.tile[0], y: plant.tile[1], yaw: quarterYaw(0) };
  w.dispose();
  assert.ok(canPlace(studio, studio.objects, lamp), "furniture can go there");
  const after = dressItems(studio, [...studio.objects, lamp]);
  assert.ok(!after.some((d) => d.tile && d.tile[0] === lamp.x && d.tile[1] === lamp.y), "the plant made room");
});

// The dressing kept between edits (dressItemsOf — the physics and the floors drawn ask it of every
// floor at every edit): the same as laid afresh, always; a floor's kept while its own of the
// structure, its rooms and its things are as they were — a wall built on another floor keeps it.
test("the dressing kept: as laid afresh; a wall built keeps the other floors'", () => {
  const made = foldMap(finishWorld(getMap("studio"), getMap("studio").objects, { fresh: true, building: true }).map);
  const st = structureFromMap(made);
  const all = made.objects;
  const floorsOf = (s: Structure) => s.floors.map((f) => f.index);
  const lmOf = (s: Structure, f: number) => levelMap({ ...made, st: s }, f) as MapDef;
  const before = new Map<number, ReturnType<typeof dressItemsOf>>();
  let dressed: { f: number; a: { x: number; y: number; w: number; h: number } } | null = null;
  for (const f of floorsOf(st)) {
    const lm = lmOf(st, f);
    const here = onLevel(all, lm);
    const kept = dressItemsOf(lm, here);
    assert.deepEqual(kept, dressItems(lm, here), `floor ${f}: as laid afresh`);
    assert.equal(dressItemsOf(lm, onLevel(all, lm)), kept, `floor ${f}: asked again, the same list`);
    before.set(f, kept);
    const a = lm.areas.find((q) => q.dressing && q.w >= 3 && q.h >= 3);
    if (!dressed && a && kept.length) dressed = { f, a };
  }
  assert.ok(dressed, "a dressed room to build in");
  // a wall across that room, on whole metres
  const { f, a } = dressed;
  const y = a.y + Math.floor(a.h / 2);
  let n = 0;
  const r = wallsEdit(st, f, [{ a: [a.x, y], b: [a.x + a.w, y], front: "p" }], [], () => `dz${++n}`);
  assert.ok(!("why" in r), JSON.stringify(r));
  const st2 = applyOps(st, [r.op]);
  for (const g of floorsOf(st2)) {
    const lm = lmOf(st2, g);
    const here = onLevel(all, lm);
    const kept = dressItemsOf(lm, here);
    assert.deepEqual(kept, dressItems(lm, here), `floor ${g} after the wall: as laid afresh`);
    if (g !== f) assert.equal(kept, before.get(g), `floor ${g}: kept through a wall built on floor ${f}`);
  }
  // a thing moved: noticed (on a floor with furniture)
  const furniture = (q: { kind: string }) => !/door|window|stairs|elevator/.test(q.kind);
  const g = floorsOf(st2).find((h) => onLevel(all, lmOf(st2, h)).some(furniture) && (before.get(h)?.length ?? 0) > 0);
  assert.ok(g !== undefined, "a furnished, dressed floor");
  const lm = lmOf(st2, g);
  const here = onLevel(all, lm);
  const o = here.find(furniture);
  assert.ok(o);
  assert.equal(dressItemsOf(lm, here), before.get(g) ?? dressItemsOf(lm, here));
  const moved = here.map((q) => (q === o ? { ...q, x: q.x + 1 } : q));
  assert.deepEqual(dressItemsOf(lm, moved), dressItems(lm, moved), "a thing moved: as laid afresh");
  // its rooms changed (dressed otherwise): noticed
  const redressed = { ...lm, areas: lm.areas.map((q) => (q.dressing ? { ...q, dressing: "busy" as const } : q)) };
  assert.deepEqual(dressItemsOf(redressed, moved), dressItems(redressed, moved), "the rooms redressed: as laid afresh");
});
