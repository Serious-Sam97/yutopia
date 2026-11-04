import { elevOf, levelMap, offsetOf } from "@yutopia/shared";
import {
  CHUNK,
  chunkCount,
  hasChunk,
  iceHolesNow,
  isLandChunk,
  KART_FENCE,
  landChunks,
  layoutVersion,
  underfoot,
} from "@yutopia/shared/grounds";
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
// The Grounds aren't built whole (docs/plan/69-the-long-road.md, L2: the land is long): the chunks
// round each person out there and ahead of each car moving, made as the land worker makes them,
// taken out once nobody's been near them for a while.

const SLICE_MS = 3; // the Grounds' chunks built a tick, at most this long
const RING_M = 160; // m round each person out there: built
const AHEAD_S = 4; // a car moving: its way this far ahead built too
const KEEP_M = 260; // m: a chunk this near someone stays
const DROP_MS = Number(process.env.YUTOPIA_LAND_DROP_MS ?? 20_000); // nobody near this long: out
const WANT_MS = 500; // what's wanted worked out this often
// (sized for this many chunks at once — a room spread out over the long road — or the whole land if less)
const MAX_CHUNKS = 2400;

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
// (the land kept, and the process's memory: the long road's soak — docs/plan/69, L2)
metrics.gauge("grounds_chunks", () => chunkCount());
metrics.gauge("process_heap_bytes", () => process.memoryUsage().heapUsed);
metrics.gauge("process_rss_bytes", () => process.memoryUsage().rss);

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
  // the Grounds' chunks wanted and not built yet (nearest first), those built again (changed), and
  // when each was last wanted
  let todo: [number, number][] = [];
  const again = new Set<string>();
  const wantedAt = new Map<string, number>();
  let wantAt = 0;
  const built = () => build?.chunksBuilt().size ?? 0;
  /** Where the people out there are, and the cars moving, ahead (the building's coords). */
  const near = (): [number, number][] => {
    const g = levelMap(room.map, 0);
    const ox = g?.ox ?? 0;
    const oy = g?.oy ?? 0;
    const out: [number, number][] = [];
    for (const p of room.state.players.values()) if (p.level === 0) out.push([p.x + ox, p.y + oy]);
    // (a car parked needs nothing: the cars aren't on Jolt here; one carrying someone, or going, its way)
    for (const v of room.state.vehicles.values()) {
      if (Math.abs(v.v) < 1 && !v.riders) continue;
      out.push([v.x, v.z]);
      if (Math.abs(v.v) > 1) out.push([v.x + Math.cos(v.a) * v.v * AHEAD_S, v.z + Math.sin(v.a) * v.v * AHEAD_S]);
    }
    return out;
  };
  /** What's wanted now: each chunk within RING_M of someone; those not built queued, nearest first. */
  const want = (now: number) => {
    if (!build) return;
    const spots = near();
    const r = Math.ceil(RING_M / CHUNK);
    const queue = new Map<string, { c: [number, number]; d: number }>();
    for (const [x, z] of spots) {
      const cx0 = Math.floor(x / CHUNK);
      const cz0 = Math.floor(z / CHUNK);
      for (let cz = cz0 - r; cz <= cz0 + r; cz++)
        for (let cx = cx0 - r; cx <= cx0 + r; cx++) {
          const d = Math.hypot(cx * CHUNK + CHUNK / 2 - x, cz * CHUNK + CHUNK / 2 - z);
          if (d > RING_M + CHUNK || !isLandChunk(cx, cz, CHUNK)) continue;
          const k = `${cx},${cz}`;
          wantedAt.set(k, now);
          if (build.hasChunk(cx, cz) && !again.has(k)) continue;
          const q = queue.get(k);
          if (!q || d < q.d) queue.set(k, { c: [cx, cz], d });
        }
    }
    todo = [...queue.values()].sort((a, b) => a.d - b.d).map((q) => q.c);
    // nobody near for a while: out (and forgotten — a chunk wanted once and never built too)
    for (const k of build.chunksBuilt()) if (!wantedAt.has(k)) wantedAt.set(k, 0);
    for (const [k, t] of wantedAt) {
      if (now - t < DROP_MS) continue;
      const [cx, cz] = k.split(",").map(Number);
      if (build.hasChunk(cx, cz)) {
        const mx = cx * CHUNK + CHUNK / 2;
        const mz = cz * CHUNK + CHUNK / 2;
        if (spots.some(([x, z]) => Math.hypot(mx - x, mz - z) < KEEP_M)) continue;
        build.dropChunk(cx, cz);
      }
      wantedAt.delete(k);
      again.delete(k);
    }
  };

  const objects = () => [...room.state.objects.values()].map(fromSchema);
  // god mode's edits laid (docs/plan/53-the-god-mode.md): the chunks they changed and built, again
  const offLand = onLandChanged((cs) => {
    for (const [cx, cz] of cs) if (build?.hasChunk(cx, cz)) again.add(`${cx},${cz}`);
    wantAt = 0;
  });
  void (async () => {
    const t0 = performance.now();
    const b = buildingSolids(room.map, objects());
    // (sizes for the whole world: every chunk's land and things, the building, 500 things, the cars)
    const chunks = Math.min(landChunks(CHUNK).length, MAX_CHUNKS);
    const sizes = sizesFor({ statics: staticCount(b, chunks), things: 500, vehicles: b.cars.size + 64 });
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
    current = { room, world: w, ready: built };
    console.log(
      `[physics] the building: ${b.statics.size} statics, ${b.cars.size} cars in ${Math.round(performance.now() - t0)} ms (room for ${sizes.maxBodies} bodies)`,
    );
  })().catch((e) => console.error("[physics] couldn't start:", e));

  return {
    tick() {
      if (!world || !build) return;
      // the water's ice as the weather has it, and its holes (docs/plan/65 W6, 66 S4)
      build.ice(underfoot().ice, iceHolesNow());
      // the building edited (a new grid every time): made again where it changed
      if (room.grid !== grid) {
        grid = room.grid;
        const t0 = performance.now();
        solids = buildingSolids(room.map, objects());
        build.building(solids);
        metrics.time("physics_build", performance.now() - t0);
      }
      // the park's layout changed: its chunks built, again once the worker's made them anew
      if (layout !== layoutVersion) {
        layout = layoutVersion;
        const F = KART_FENCE;
        for (let cz = Math.floor((F.z0 - 4) / CHUNK); cz <= Math.floor((F.z1 + 4) / CHUNK); cz++)
          for (let cx = Math.floor((F.x0 - 4) / CHUNK); cx <= Math.floor((F.x1 + 4) / CHUNK); cx++)
            if (build.hasChunk(cx, cz)) again.add(`${cx},${cz}`);
        wantAt = 0;
      }
      // what's wanted round the people out there
      const now = Date.now();
      if (now - wantAt >= WANT_MS) {
        wantAt = now;
        want(now);
      }
      // the Grounds, a few chunks a tick as their land's made
      if (!todo.length) return;
      const t0 = performance.now();
      let made = 0;
      for (let i = 0; i < todo.length && performance.now() - t0 < SLICE_MS; ) {
        const [cx, cz] = todo[i];
        if (!hasChunk(cx, cz)) {
          prefetch(cx * CHUNK + CHUNK / 2, cz * CHUNK + CHUNK / 2, 0);
          i++;
          continue;
        }
        build.groundChunk(cx, cz, true);
        again.delete(`${cx},${cz}`);
        todo.splice(i, 1);
        made++;
      }
      if (made && !todo.length) world.settle();
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
