import { SP_OFFSET_H } from "../clock.ts";
import { HQ_DOORS, onPathAt } from "../danger.ts";
import {
  BENCH,
  BUILDINGS,
  CORN,
  FARM,
  groundsRng,
  POND,
  RAVINE,
  SCARECROWS,
  TOWER,
  TOWN,
  TRACTOR,
  treeDensity,
  wayClearance,
} from "../grounds.ts";
import type { StackId } from "../inventory.ts";

// The day's shadowed (docs/plan/31-the-day.md): nobody comes out of the dark
// by day — they're already out there, asleep in nests, a new layout each day
// (the same for everyone: seeded by the day). Mostly scattered through the deep
// woods; some at the farm, in the ravine, by the pond, inside the water tower's
// fence, behind the shed, on the river's ice by the bridge, and a few round the
// town's edges. Never on a path (nor 6 tiles from one), never near the HQ.
// Each may keep a cache — what one of them carried — lying in the snow among
// them. Building coords (tiles); pure.

export type NestZone =
  | "woods"
  | "farm"
  | "ravine"
  | "pond"
  | "tower"
  | "shed"
  | "bridge"
  | "town"
  | "clearing"
  | "river"
  | "gate";
export type CacheKind = "briefcase" | "lunchbox" | "toolbox" | "hunting" | "flares" | "torch";
export interface Cache {
  id: string;
  kind: CacheKind;
  x: number;
  z: number;
  /** what's in it */
  items: { id: StackId; n: number }[];
}
export interface Nest {
  id: string;
  zone: NestZone;
  x: number;
  z: number;
  /** how many sleep there */
  n: number;
  cache: Cache | null;
}

export const NESTS = {
  /** a day's: the base and, for each person who went out that day, more (up to `max` nests) */
  base: 50,
  perPerson: 4,
  max: 80,
  /** shadowed in all, at most */
  cap: 140,
  /** apart (the named spots: closer) */
  apart: 30,
  apartNamed: 18,
  /** clear of the paths, and of the HQ's doors */
  path: 6,
  hq: 60,
  /** one killed by day comes back this long after (somewhere else round its nest), if nobody's near */
  respawnMs: 10 * 60_000,
  respawnClear: 40,
  /** the day: from the dawn's end to the dusk's start (the world's hour) */
  from: 7.5,
  to: 17.5,
  /** how many sleep in one: 1 (most), 2, 3, 4 */
  sizes: [0.4, 0.3, 0.2, 0.1] as const,
  /** a nest keeps a cache this often */
  cache: 0.6,
} as const;

/** The land you can reach (the ridges past it). */
const LAND = { x0: -390, z0: -570, x1: 518, z1: 162 };

/** The day's number (São Paulo's), for its layout. */
export function dayOf(ms: number): number {
  return Math.floor((ms + SP_OFFSET_H * 3_600_000) / 86_400_000);
}
/** The hour's the day's (nests out), not the dusk, the night, the dawn. */
export const isDay = (hour: number) => hour >= NESTS.from && hour < NESTS.to;

// the named spots, by zone: where, and how far round it a nest may sit
type Spot = { x: number; z: number; r: number };
const RAVINE_FLOOR: Spot[] = RAVINE.pts.slice(1, -1).map(([x, z]) => ({ x, z, r: 3 }));
const NAMED: Record<Exclude<NestZone, "woods">, Spot[]> = {
  farm: [
    { x: (CORN.x0 + CORN.x1) / 2 - 15, z: CORN.z0 + 22, r: 10 }, // the cornfield's rows
    { x: (CORN.x0 + CORN.x1) / 2 + 10, z: CORN.z1 - 25, r: 10 },
    { x: CORN.x0 + 12, z: (CORN.z0 + CORN.z1) / 2, r: 6 },
    { x: 470, z: -298, r: 3 }, // between the barn and the silo, round the back
    { x: 452, z: -244, r: 3 }, // behind the farmhouse
    { x: TRACTOR.x + 5, z: TRACTOR.z + 6, r: 3 },
    { x: 492, z: -222, r: 6 }, // the farm's far edge
    { x: 482, z: -322, r: 3 }, // behind the silo
    { x: 432, z: -330, r: 4 }, // the farm's north edge, by the trees
    { x: 500, z: -262, r: 4 }, // its east edge
    { x: CORN.x0 + 30, z: CORN.z0 + 60, r: 8 }, // more of the rows
    { x: CORN.x1 - 8, z: CORN.z0 + 8, r: 5 },
    { x: 452, z: -296, r: 2 }, // round the barn's back
  ],
  ravine: RAVINE_FLOOR,
  pond: [
    { x: -268, z: -104, r: 2 }, // by the boathouse, its west side
    { x: POND.cx - POND.rx + 4, z: POND.cz, r: 4 }, // the reeds on the far bank
    { x: POND.cx, z: POND.cz + POND.rz - 4, r: 4 },
  ],
  tower: [{ x: TOWER.x + 4, z: TOWER.z + 4, r: 1.5 }], // inside its fence
  shed: [{ x: -155, z: 127, r: 3 }], // behind the grounds shed
  bridge: [
    { x: 262, z: -389, r: 1.5 }, // on the river's ice beside the road's bridge
    { x: 262, z: -412, r: 1.5 },
  ],
  town: [
    { x: 330, z: -375, r: 2 }, // behind the gas station and the diner
    { x: 366, z: -376, r: 2 }, // behind the market
    { x: 458, z: -376, r: 2 }, // behind the bar
    { x: 494, z: -376, r: 2 }, // behind the shut shop
    { x: 346, z: -438, r: 2 }, // behind the post office
    { x: 466, z: -438, r: 2 }, // behind the bakery
    { x: 420, z: -562, r: 3 }, // behind the church
    { x: 302, z: -470, r: 5 }, // the woods at the town's west edge
    { x: 398, z: -468, r: 2 }, // the townhouses' back yards up Church Street
    { x: 442, z: -478, r: 2 },
    { x: 398, z: -500, r: 2 },
    { x: 442, z: -508, r: 2 },
  ],
  clearing: [0, 1, 2, 3].map((k) => ({
    // round the clearing's edge, where the trees start
    x: BENCH.x + Math.cos((k * Math.PI) / 2 + 0.4) * 19,
    z: BENCH.z + Math.sin((k * Math.PI) / 2 + 0.4) * 19,
    r: 3,
  })),
  river: [
    // out on the river's ice, up and down it
    { x: 256, z: -540, r: 3 },
    { x: 266, z: -460, r: 3 },
    { x: 252, z: -320, r: 3 },
    { x: 262, z: -220, r: 3 },
    { x: 250, z: -100, r: 3 },
    { x: 258, z: 40, r: 3 },
  ],
  gate: [
    // the woods by the gatehouse and the bus shelter
    { x: -14, z: -382, r: 4 },
    { x: -72, z: -386, r: 4 },
    { x: -62, z: -340, r: 4 },
  ],
};
/** How many nests a day each named place gets (the rest: the woods). */
const SHARE: [Exclude<NestZone, "woods">, number][] = [
  ["farm", 8],
  ["town", 6],
  ["ravine", 4],
  ["pond", 3],
  ["river", 4],
  ["clearing", 2],
  ["gate", 2],
  ["tower", 1],
  ["shed", 1],
  ["bridge", 2],
];

const inBuilding = (x: number, z: number, m = 1) =>
  BUILDINGS.some((b) => x > b.x0 - m && x < b.x1 + m && z > b.z0 - m && z < b.z1 + m);
/** Clear of every path by `r`. */
const offPaths = (x: number, z: number, r: number) => !onPathAt(x, z) && wayClearance(x, z) >= r;
/** Somewhere a nest may sit (named spots: closer to a path or a building is allowed). */
export function nestAllowed(x: number, z: number, named = false): boolean {
  if (x < LAND.x0 || x > LAND.x1 || z < LAND.z0 || z > LAND.z1) return false;
  if (Math.hypot(x - HQ_DOORS.x, z - HQ_DOORS.z) < NESTS.hq) return false;
  if (inBuilding(x, z, named ? 0.5 : 3)) return false;
  if (SCARECROWS.some((c) => Math.hypot(c.x - x, c.z - z) < 1.5)) return false;
  if (Math.hypot(x - TRACTOR.x, z - TRACTOR.z) < 3) return false;
  return offPaths(x, z, named ? 2.5 : NESTS.path);
}

// the deep woods' candidates (every 8 tiles: thick enough, off the paths, out of the farm and town)
let deep: { x: number; z: number }[] | null = null;
function woods(): { x: number; z: number }[] {
  if (deep) return deep;
  deep = [];
  for (let z = LAND.z0 + 4; z < LAND.z1; z += 8)
    for (let x = LAND.x0 + 4; x < LAND.x1; x += 8) {
      if (treeDensity(x, z) < 0.6) continue;
      if (x > FARM.x0 - 10 && x < FARM.x1 + 10 && z > FARM.z0 - 10 && z < FARM.z1 + 10) continue;
      if (x > TOWN.x0 && x < TOWN.x1 && z > TOWN.z0 && z < TOWN.z1) continue;
      if (nestAllowed(x, z)) deep.push({ x, z });
    }
  return deep;
}

const CACHES: Record<NestZone, CacheKind[]> = {
  woods: ["briefcase", "torch", "lunchbox", "hunting", "briefcase"],
  farm: ["toolbox", "hunting", "lunchbox"],
  ravine: ["flares", "briefcase"],
  pond: ["flares", "lunchbox"],
  tower: ["toolbox", "briefcase"],
  shed: ["toolbox"],
  bridge: ["toolbox", "flares"],
  town: ["briefcase", "lunchbox"],
  clearing: ["torch", "lunchbox", "briefcase"],
  river: ["flares", "hunting"],
  gate: ["briefcase", "toolbox"],
};
/** What a cache holds (a nest of 3–4 keeps twice as much). */
export function cacheItems(kind: CacheKind, size: number, rand: () => number): { id: StackId; n: number }[] {
  const k = size >= 3 ? 2 : 1;
  const between = (a: number, b: number) => a + Math.floor(rand() * (b - a + 1));
  switch (kind) {
    case "briefcase":
      return [{ id: "r38", n: between(6, 12) * k }];
    case "lunchbox":
      return [{ id: "aid", n: k }];
    case "toolbox":
      return rand() < 0.4
        ? [
            { id: "fuse", n: between(1, 2) },
            { id: "battery", n: 1 },
          ]
        : [{ id: "fuse", n: between(1, 2) * k }];
    case "hunting":
      return [{ id: "shell", n: between(3, 6) * k }];
    case "flares":
      return [{ id: "flare", n: Math.min(3, between(1, 2) * k) }];
    case "torch":
      return [{ id: "battery", n: k }];
  }
}

/** The day's nests, all of them that may be out (the first `count` are): the
 *  named places' share, then the woods, spread. The same day, the same nests. */
export function dayNests(day: number): Nest[] {
  const r = groundsRng(day * 7919 + 13);
  const out: Nest[] = [];
  const far = (x: number, z: number, d: number) => out.every((n) => Math.hypot(n.x - x, n.z - z) >= d);
  const size = () => {
    let q = r();
    for (let i = 0; i < NESTS.sizes.length; i++) {
      q -= NESTS.sizes[i];
      if (q < 0) return i + 1;
    }
    return 1;
  };
  const add = (zone: NestZone, x: number, z: number, n: number) => {
    const id = `${day}-${out.length}`;
    const cache: Cache | null =
      r() < NESTS.cache
        ? (() => {
            const kinds = CACHES[zone];
            const kind = kinds[Math.floor(r() * kinds.length)];
            return {
              id: `cache-${id}`,
              kind,
              x: x + (r() - 0.5) * 1.5,
              z: z + (r() - 0.5) * 1.5,
              items: cacheItems(kind, n, r),
            };
          })()
        : null;
    out.push({ id, zone, x, z, n, cache });
  };
  // the named places first (their share, each spot at most once), then the woods
  const named: { zone: NestZone; x: number; z: number }[] = [];
  for (const [zone, k] of SHARE) {
    const spots = [...NAMED[zone]];
    for (let i = spots.length - 1; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      [spots[i], spots[j]] = [spots[j], spots[i]];
    }
    let took = 0;
    for (const s of spots) {
      if (took >= k) break;
      for (let tries = 0; tries < 8; tries++) {
        const a = r() * Math.PI * 2;
        const d = Math.sqrt(r()) * s.r;
        const x = s.x + Math.cos(a) * d;
        const z = s.z + Math.sin(a) * d;
        if (!nestAllowed(x, z, true) || !far(x, z, NESTS.apartNamed)) continue;
        named.push({ zone, x, z });
        add(
          zone,
          x,
          z,
          Math.min(zone === "tower" || zone === "bridge" || zone === "town" || zone === "river" ? 2 : 4, size()),
        );
        took++;
        break;
      }
    }
  }
  const w = woods();
  for (let tries = 0; tries < 6000 && out.length < NESTS.max; tries++) {
    const c = w[Math.floor(r() * w.length)];
    const x = c.x + (r() - 0.5) * 6;
    const z = c.z + (r() - 0.5) * 6;
    if (!far(x, z, NESTS.apart) || !nestAllowed(x, z)) continue;
    add("woods", x, z, size());
  }
  // (the named places' nests spread through the list, so the first `count` has some of each)
  const named0 = out.filter((n) => n.zone !== "woods");
  const woods0 = out.filter((n) => n.zone === "woods");
  const mixed: Nest[] = [];
  const every = Math.max(1, Math.floor(woods0.length / Math.max(1, named0.length)));
  while (named0.length || woods0.length) {
    if (named0.length) mixed.push(named0.shift() as Nest);
    for (let i = 0; i < every && woods0.length; i++) mixed.push(woods0.shift() as Nest);
  }
  return mixed;
}

/** How many of the day's nests are out: the base and more for each who went out (the shadowed capped). */
export function nestCount(nests: readonly Nest[], peopleOut: number): number {
  const want = Math.min(NESTS.max, NESTS.base + NESTS.perPerson * Math.max(0, peopleOut));
  let k = 0;
  let total = 0;
  for (const n of nests) {
    if (k >= want || total + n.n > NESTS.cap) break;
    total += n.n;
    k++;
  }
  return k;
}

/** A nest's dead back: each `respawnMs` after it fell, if nobody's within `respawnClear` (who's
 *  near, the nearest's distance). Changes `alive`; how many came back. */
export function revive(alive: boolean[], deadAt: readonly number[], now: number, near: number): number {
  if (near < NESTS.respawnClear) return 0;
  let k = 0;
  for (let i = 0; i < alive.length; i++)
    if (!alive[i] && now - deadAt[i] >= NESTS.respawnMs) {
      alive[i] = true;
      k++;
    }
  return k;
}
