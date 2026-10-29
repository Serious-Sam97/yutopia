import { elevOf, offsetOf } from "@yutopia/shared";
import { CHUNK, GROUNDS, hasChunk, KART_FENCE, layoutVersion } from "@yutopia/shared/grounds";
import {
  type BuildingSolids,
  buildingSolids,
  JoltCollider,
  loadJolt,
  PhysicsWorld,
  passKeys,
  sizesFor,
  staticCount,
  WorldBuilder,
} from "@yutopia/shared/physics";
import { config } from "../config.ts";
import { onLandChanged, prefetch } from "../land.ts";
import { metrics } from "../metrics.ts";
import { fromSchema, type WorldRoom } from "../WorldRoom.ts";
import { registerFeature } from "./index.ts";

// The physics world on the server (docs/plan/50-the-volume.md, phase 2): Jolt loaded once at
// start, the building built from the stored world and kept matching it (the grid's rebuilt on
// every edit: the building's diffed then, only what changed made again), the Grounds' chunks
// built as the land worker makes them (land.ts: off the tick), the park's again when its layout
// changes. Every move's check asks it (phase 3: WorldRoom.moveAsk — a body fits where it says it
// is, its way there is clear, what's under its feet), each person through their own locked doors;
// the same world as the browser's, its counts on /metrics.

const SLICE_MS = 3; // the Grounds' chunks built a tick, at most this long
const CHUNKS = Math.ceil((GROUNDS.x1 - GROUNDS.x0) / CHUNK) * Math.ceil((GROUNDS.z1 - GROUNDS.z0) / CHUNK);

const worlds = new WeakMap<WorldRoom, PhysicsWorld>();
/** The room's physics world, once it's built (null before, or with YUTOPIA_PHYSICS=0). */
export const physicsOf = (room: WorldRoom): PhysicsWorld | null => worlds.get(room) ?? null;

// (one world a process: Jolt's heap is a fixed 128 MB, the whole world ~34 MB of it — the game has
// one room; tests that make more get it in the first, while it lives)
let current: { room: WorldRoom; world: PhysicsWorld; ready: () => number } | null = null;
let owner: WorldRoom | null = null;
metrics.gauge("physics_bodies", () => current?.world.counts().bodies ?? 0);
metrics.gauge("physics_max_bodies", () => current?.world.counts().maxBodies ?? 0);
metrics.gauge("physics_statics", () => current?.world.counts().statics ?? 0);
metrics.gauge("physics_vehicles", () => current?.world.counts().vehicles ?? 0);
metrics.gauge("physics_refused", () => current?.world.counts().refused ?? 0);
metrics.gauge("physics_heap_bytes", () => current?.world.counts().heap ?? 0);
metrics.gauge("physics_ground_chunks", () => current?.ready() ?? 0);

registerFeature((room) => {
  if (!config.physics) return {};
  if (owner) return {};
  owner = room;
  let world: PhysicsWorld | null = null;
  let build: WorldBuilder | null = null;
  let gone = false;
  let grid: unknown = null;
  let layout = layoutVersion;
  let solids: BuildingSolids | null = null;
  // the Grounds' chunks still to build, and the ones built
  const todo: [number, number][] = [];
  for (let cz = Math.floor(GROUNDS.z0 / CHUNK); cz * CHUNK < GROUNDS.z1; cz++)
    for (let cx = Math.floor(GROUNDS.x0 / CHUNK); cx * CHUNK < GROUNDS.x1; cx++) todo.push([cx, cz]);
  let built = 0;

  const objects = () => [...room.state.objects.values()].map(fromSchema);
  // god mode's edits laid (docs/plan/53-the-god-mode.md): the chunks they changed, again
  const offLand = onLandChanged((cs) => {
    for (const [cx, cz] of cs)
      if (!todo.some(([x, z]) => x === cx && z === cz)) {
        todo.push([cx, cz]);
        built--;
      }
  });
  void (async () => {
    const t0 = performance.now();
    const b = buildingSolids(room.map, objects());
    // (sizes for the whole world: every chunk's land and things, the building, 500 things, the cars)
    const sizes = sizesFor({ statics: staticCount(b, CHUNKS), things: 500, vehicles: b.cars.size + 64 });
    const w = await PhysicsWorld.create(loadJolt, sizes, (m) => console.warn(m));
    if (gone) return w.destroy();
    world = w;
    build = new WorldBuilder(w);
    build.building(b);
    solids = b;
    // (sight for reach: docs/plan/50 E — a hand to what it reaches for, no wall between)
    room.sight = (level, a, b) => {
      if (!world) return true;
      const o = offsetOf(room.map, level);
      const e = elevOf(level);
      return world.sees(o.x + a.x, e + a.z, o.y + a.y, o.x + b.x, e + b.z, o.y + b.y);
    };
    room.colliderFor = (uid, level, clip) => {
      if (!world || !solids) return null;
      const off = offsetOf(room.map, level);
      return new JoltCollider(
        world,
        room.gridFor(uid, level),
        { ox: off.x, oy: off.y, elev: elevOf(level) },
        { mask: clip ? "clip" : "all", pass: world.pass(passKeys(solids, uid)) },
      );
    };
    grid = room.grid;
    worlds.set(room, w);
    current = { room, world: w, ready: () => built };
    console.log(
      `[physics] the building: ${b.statics.size} statics, ${b.cars.size} cars in ${Math.round(performance.now() - t0)} ms (room for ${sizes.maxBodies} bodies)`,
    );
  })().catch((e) => console.error("[physics] couldn't start:", e));

  return {
    tick() {
      if (!world || !build) return;
      // the building edited (a new grid every time): made again where it changed
      if (room.grid !== grid) {
        grid = room.grid;
        const t0 = performance.now();
        solids = buildingSolids(room.map, objects());
        build.building(solids);
        metrics.time("physics_build", performance.now() - t0);
      }
      // the park's layout changed: its chunks again once the worker's made them anew
      if (layout !== layoutVersion) {
        layout = layoutVersion;
        const F = KART_FENCE;
        for (let cz = Math.floor((F.z0 - 4) / CHUNK); cz <= Math.floor((F.z1 + 4) / CHUNK); cz++)
          for (let cx = Math.floor((F.x0 - 4) / CHUNK); cx <= Math.floor((F.x1 + 4) / CHUNK); cx++) {
            todo.push([cx, cz]);
            built--;
          }
      }
      // the Grounds, a few chunks a tick as their land's made
      if (!todo.length) return;
      const t0 = performance.now();
      for (let i = 0; i < todo.length && performance.now() - t0 < SLICE_MS; ) {
        const [cx, cz] = todo[i];
        if (!hasChunk(cx, cz)) {
          prefetch(cx * CHUNK + CHUNK / 2, cz * CHUNK + CHUNK / 2, 0);
          i++;
          continue;
        }
        build.groundChunk(cx, cz, true);
        todo.splice(i, 1);
        built++;
        if (!todo.length) {
          world.settle();
          console.log(`[physics] the Grounds: ${built} chunks; ${world.counts().bodies} bodies`);
        }
      }
    },
    dispose() {
      gone = true;
      offLand();
      room.colliderFor = null;
      room.sight = null;
      owner = null;
      if (current?.room === room) current = null;
      world?.destroy();
      world = null;
    },
  };
});
