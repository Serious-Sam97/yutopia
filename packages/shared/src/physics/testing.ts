// Tests' worlds (docs/plan/72 phase 7: the tile grid is gone — a floor's questions are Jolt's, a
// way is the navmesh's): a map and its things built into a physics world, as the server builds a
// room's, and its navmesh. Not for the game: its rooms build their own (world-server
// features/physics.ts, the browser's tp/physics3d.ts).
import type { WorldObjectDef } from "../catalog.ts";
import { outdoorsOf } from "../ground.ts";
import { floorOf, levelMap, objLevel } from "../levels.ts";
import { type MapDef, spanOf } from "../map.ts";
import { BuildingNav, loadNav } from "../nav/index.ts";
import { buildingSolids, passKeys, staticCount, WorldBuilder } from "./build.ts";
import { loadJolt } from "./load.ts";
import { Place } from "./place.ts";
import { PhysicsWorld, sizesFor } from "./world.ts";

const LAND_MARGIN = 40;

export interface TestWorld {
  world: PhysicsWorld;
  /** a floor's place for someone (their own locked doors open; nobody's: null) */
  place(level?: number, uid?: number | null): Place;
  /** the building's navmesh (made on the first ask) */
  nav(): Promise<BuildingNav>;
  dispose(): void;
}

/** `map` (a building, a lone floor) and its things in a physics world — the land round its ground
 *  floor too, `LAND_MARGIN` m past its span, and in each of `land`'s rectangles (x, z). */
export async function testWorld(
  map: MapDef,
  objects: readonly WorldObjectDef[],
  opts: { land?: { x0: number; z0: number; x1: number; z1: number }[] } = {},
): Promise<TestWorld> {
  const things = [...objects];
  const b = buildingSolids(map, things);
  const ground = levelMap(map, 0);
  const sp = ground && outdoorsOf(ground) ? spanOf(ground) : null;
  const rects = [
    ...(sp
      ? [{ x0: sp.x0 - LAND_MARGIN, z0: sp.y0 - LAND_MARGIN, x1: sp.x1 + LAND_MARGIN, z1: sp.y1 + LAND_MARGIN }]
      : []),
    ...(opts.land ?? []),
  ];
  const chunks = rects.reduce(
    (n, r) => n + (Math.ceil((r.x1 - r.x0) / 32) + 1) * (Math.ceil((r.z1 - r.z0) / 32) + 1),
    0,
  );
  const world = await PhysicsWorld.create(
    loadJolt,
    sizesFor({ statics: staticCount(b, chunks), things: 64, vehicles: b.cars.size + 4 }),
  );
  const build = new WorldBuilder(world);
  build.building(b);
  for (const r of rects) build.groundRect(r.x0, r.z0, r.x1, r.z1);
  world.settle();
  let nav: BuildingNav | null = null;
  return {
    world,
    place: (level = floorOf(map), uid = null) =>
      new Place(world, levelMap(map, level) ?? map, things, { mask: "all", pass: world.pass(passKeys(b, uid)) }),
    nav: async () => {
      if (nav) return nav;
      await loadNav();
      nav = new BuildingNav(0);
      const floorOfThing = (id: string) => {
        const o = things.find((q) => q.id === id);
        return o ? objLevel(o, map) : null;
      };
      await nav.sync(b, floorOfThing, sp ? { x0: sp.x0, z0: sp.y0, x1: sp.x1, z1: sp.y1 } : undefined);
      return nav;
    },
    dispose: () => {
      nav?.dispose();
      world.destroy();
    },
  };
}

/** The locked doors `uid` passes in `map` with its things (their navmesh keys: a way's `open`). */
export function doorsOf(map: MapDef, objects: readonly WorldObjectDef[], uid: number | null): string[] {
  return passKeys(buildingSolids(map, [...objects]), uid);
}

/** The way `uid` (null: nobody's) walks from `from` to `to` on `map`'s floor with its things — the
 *  navmesh's, through their own locked doors; null: none. */
export async function wayOn(
  map: MapDef,
  objects: readonly WorldObjectDef[],
  uid: number | null,
  from: { x: number; y: number },
  to: { x: number; y: number },
): Promise<{ x: number; y: number }[] | null> {
  const w = await testWorld(map, objects);
  try {
    return (await w.nav()).path(floorOf(map), from, to, { open: doorsOf(map, objects, uid) }) ?? null;
  } finally {
    w.dispose();
  }
}
