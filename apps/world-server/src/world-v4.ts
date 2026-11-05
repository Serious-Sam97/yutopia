// The world into a structure (docs/plan/72-the-3d-core.md, phase 6): once, offline, with the world
// held shut. Reads the world from the API, keeps a copy of it, runs the old boot's conversions a last
// time (shared structure/finish.ts — whatever they still change is stored), turns its tile layout
// into walls, slabs and rooms in world metres — every place in the world's frame, the other floors'
// things moved by their floor's corner (structure/fold.ts) —, checks they read back as the same
// map, fixes doors, windows and hung things to their walls (structure/attach.ts) and stores the
// structure (layout version 4). The world-server refuses a world without one. (The API's migration
// `places_in_the_world_frame` moves the other places kept — last spots, arrivals, pets, loot.)
//
//   pnpm --filter @yutopia/world-server world-v4 [--dry]     (the API's env: YUTOPIA_API_INTERNAL, …)
import { readFileSync, writeFileSync } from "node:fs";
import { getMap, LAYOUT_VERSION, mapFromLayout, objLevel, validLayout, worldToV3 } from "@yutopia/shared";
import { attachAll, attachable, onOf, roundTrip, structureFromMap } from "@yutopia/shared/structure";
import { finishWorld } from "@yutopia/shared/structure/finish";
import { api } from "./api.ts";
import { config } from "./config.ts";

const dry = process.argv.includes("--dry");
// `--file a.json [b.json…]`: snapshot files (the e2e fixtures, a kept copy) brought up in place —
// the same conversion, written into each file (its version 3, the structure with it)
const fi = process.argv.indexOf("--file");
if (fi >= 0) {
  for (const file of process.argv.slice(fi + 1)) {
    const snap = JSON.parse(readFileSync(file, "utf8"));
    if (snap.structure) {
      console.log(`[v4] ${file}: has its structure already`);
      continue;
    }
    const w = worldToV3(snap).world;
    const base = getMap(w.mapKey ?? "studio");
    const layout = w.layout;
    if (!validLayout(layout)) throw new Error(`${file}: no layout`);
    const done = finishWorld(mapFromLayout(base.key, base.name, layout), w.objects ?? [], {
      fresh: false,
      building: config.building,
    });
    const diff = roundTrip(done.map);
    if (diff.length) throw new Error(`${file}: doesn't read back (${diff.slice(0, 3).join(" | ")})`);
    const structure = structureFromMap(done.map);
    const fixed = attachAll(structure, done.objects, (o) => objLevel(o, done.map));
    const out = {
      ...w,
      version: Math.max(3, Number(w.version) || 0),
      layout: { ...layout, version: LAYOUT_VERSION },
      structure,
      objects: fixed.objects,
    };
    delete (out as { format?: number }).format;
    if (!dry) writeFileSync(file, `${JSON.stringify(out, null, 2)}\n`);
    console.log(
      `[v4] ${file}: ${done.log.join(" | ") || "nothing to convert"}; ${out.structure.walls.length} walls; ${fixed.changed.length} things fixed to walls${dry ? " (dry)" : ""}`,
    );
  }
  process.exit(0);
}
const info = await api.world();
const copy = `world-before-v4-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
writeFileSync(copy, JSON.stringify(info));
console.log(`[v4] the world kept as it was: ${copy} (${info.objects.length} things)`);
if (info.structure) {
  console.log("[v4] it has its structure already: nothing to do");
  process.exit(0);
}
if (!info.seeded || !info.layout) {
  console.log("[v4] a world not made yet: the world-server makes it with its structure");
  process.exit(0);
}
const world = worldToV3(info).world;
const layout = world.layout;
if (!validLayout(layout) || (layout.version ?? 2) < LAYOUT_VERSION) {
  console.error(`[v4] its layout isn't version ${LAYOUT_VERSION}: run the API's migrations first`);
  process.exit(1);
}
const base = getMap(info.mapKey ?? "studio");
const done = finishWorld(mapFromLayout(base.key, base.name, layout), world.objects ?? [], {
  fresh: false,
  building: config.building,
});
for (const l of done.log) console.log(`[v4] ${l}`);
const diff = roundTrip(done.map);
if (diff.length) {
  console.error(`[v4] the structure doesn't read back as the map (${diff.length}): ${diff.slice(0, 5).join(" | ")}`);
  process.exit(1);
}
const structure = structureFromMap(done.map);
console.log(
  `[v4] ${structure.floors.length} floors: ${structure.slabs.length} slabs, ${structure.walls.length} walls, ${structure.rooms.length} rooms — the same map read back`,
);
// doors, windows and hung things fixed to their walls (structure/attach.ts)
const fixed = attachAll(structure, done.objects, (o) => objLevel(o, done.map));
for (const o of fixed.changed) done.changed.set(o.id, o);
const loose = fixed.objects.filter((o) => attachable(o.kind) && !onOf(o));
console.log(
  `[v4] ${fixed.changed.length} things fixed to their walls${loose.length ? `; on no wall: ${loose.map((o) => `${o.kind} ${o.id}`).join(", ")}` : ""}`,
);
if (dry) {
  console.log(`[v4] dry: ${done.changed.size} things and the structure not stored`);
  process.exit(0);
}
for (const o of done.changed.values()) await api.putObject(o);
await api.putStructure(structure);
console.log(`[v4] stored: the structure, ${done.changed.size} things`);
