import { SP_OFFSET_H } from "../clock.ts";
import { BUILDINGS, type Building, INSIDES, TOWN_CARS, TRACTOR } from "../grounds.ts";
import type { ItemId, StackId } from "../inventory.ts";

// Where things are found on the Grounds (docs/plan/30-the-dark.md, D3): spots by
// place — the townhouses' doors, the boathouse's and the shed's, the parked
// cars' glove boxes, a counter in the diner, the market and the bar — each full
// or empty, refilled on a timer; what's in one is rolled when it's searched.
// Rounds and shells come out of a budget per night. The gatehouse's locker is
// apart: a revolver for whoever carries none; so are the supply lockers, a kit a day.
// Places are the building's coords.

export type Place =
  | "house"
  | "boathouse"
  | "shed"
  | "glovebox"
  | "diner"
  | "market"
  | "bar"
  | "barn"
  | "farmhouse"
  | "tractor";
export interface LootSpot {
  id: string;
  place: Place;
  x: number;
  z: number;
}

/** How close you search from, tiles; how long a search takes (the ring), ms. */
export const LOOT_REACH = 1.6;
export const SEARCH_MS = 800;
/** A refill, minutes (±25%). */
export const REFILL_MIN: Record<Place, number> = {
  house: 20,
  boathouse: 15,
  shed: 15,
  glovebox: 30,
  diner: 20,
  market: 20,
  bar: 20,
  barn: 20,
  farmhouse: 20,
  tractor: 25,
};
/** What's dropped lies on the snow this long. */
export const DROP_MS = 2 * 60 * 60_000;

// a step out of a building's door
function atDoor(b: Building): { x: number; z: number } {
  const xm = (b.x0 + b.x1) / 2;
  const zm = (b.z0 + b.z1) / 2;
  if (b.face === "n") return { x: xm, z: b.z0 - 1 };
  if (b.face === "s") return { x: xm, z: b.z1 + 1 };
  if (b.face === "e") return { x: b.x1 + 1, z: zm };
  return { x: b.x0 - 1, z: zm };
}

export const LOOT: LootSpot[] = (() => {
  const out: LootSpot[] = [];
  for (const b of BUILDINGS) {
    if (b.kind === "house") out.push({ id: b.key, place: "house", ...atDoor(b) });
    if (b.kind === "boathouse" || b.kind === "shed") out.push({ id: b.key, place: b.kind, ...atDoor(b) });
  }
  // the driver's door: on the street's side (they're parked kerbside, the
  // road's middle at z −405), a little ahead of the middle
  for (const [i, c] of TOWN_CARS.entries())
    out.push({ id: `car-${i}`, place: "glovebox", x: c.x + c.dir * 0.4, z: c.z + (c.z < -405 ? 1.6 : -1.6) });
  // a counter inside: in front of it, the side away from the wall
  for (const ins of INSIDES) {
    const place: Place | null =
      ins.b.kind === "diner"
        ? "diner"
        : ins.b.sign === "BAR"
          ? "bar"
          : ins.b.sign === "MARKET"
            ? "market"
            : ins.b.kind === "barn"
              ? "barn"
              : ins.b.kind === "farmhouse"
                ? "farmhouse"
                : null;
    if (!place) continue;
    const f = ins.fits.find((f) => f.kind === (place === "market" ? "till" : place === "barn" ? "bench" : "counter"));
    if (!f) continue;
    // (the farmhouse's counter runs along its east wall: in front of it is to the west)
    if (place === "farmhouse") {
      out.push({ id: ins.b.key, place, x: f.x - 0.7, z: f.z + f.d / 2 });
      continue;
    }
    const front = place === "market" || place === "barn" ? f.z + f.d + 0.7 : f.z - 0.7;
    out.push({ id: ins.b.key, place, x: f.x + f.w / 2, z: front });
  }
  // the tractor's toolbox: by its side, on the south (the side away from the farmhouse's yard wall)
  out.push({
    id: "tractor",
    place: "tractor",
    x: TRACTOR.x - Math.sin(TRACTOR.ry) * 1.9,
    z: TRACTOR.z + Math.cos(TRACTOR.ry) * 1.9,
  });
  return out;
})();
const byId = new Map(LOOT.map((s) => [s.id, s]));
export const lootSpot = (id: string) => byId.get(id);

/** The gatehouse's locker (a fit of its own, shared/grounds.ts): where you open it from. */
export const LOCKER = (() => {
  const g = INSIDES.find((i) => i.b.kind === "gatehouse");
  const f = g?.fits.find((f) => f.kind === "locker");
  return f ? { x: f.x + f.w / 2, z: f.z + f.d + 0.6 } : { x: 0, z: 0 };
})();

/** A supply locker (the catalog's `locker`, put anywhere in build mode): a kit a day for anyone — a
 *  revolver if they carry none (the gatehouse's rule: loaded the first time), and these. Searched
 *  as a spot, `kit:<its object's id>`: the client's target, the server's handler. */
export const KIT_SPOT = "kit:";
export const LOCKER_KIT: LootItem[] = [
  { id: "r38", n: 12 },
  { id: "aid", n: 1 },
  { id: "battery", n: 1 },
  { id: "flare", n: 2 },
];
/** Where you open a thing from (its floor's coords): its tile's middle, a little out the way its
 *  front faces (drawn on +y; turned clockwise: rot 1 −x, 2 −y, 3 +x — as a seat faces). */
export function lockerFront(o: { x: number; y: number; rot?: number }): { x: number; y: number } {
  const [dx, dy] = [
    [0, 1],
    [-1, 0],
    [0, -1],
    [1, 0],
  ][(o.rot ?? 0) & 3];
  return { x: o.x + 0.5 + dx * 0.9, y: o.y + 0.5 + dy * 0.9 };
}

// ── what's in them ───────────────────────────────────────────────────────────
type Roll = [weight: number, id: ItemId | null, lo?: number, hi?: number];
const TABLES: Record<Place, Roll[]> = {
  house: [
    [3, "aid"],
    [3, "battery"],
    [3, "r38", 3, 6],
    [2, "flare"],
    [1, "fuse"],
    [2, null],
  ],
  glovebox: [
    [3, "flare"],
    [3, "battery"],
    [2, "r38", 2, 5],
    [1, "aid"],
    [3, null],
  ],
  boathouse: [
    [3, "flare"],
    [2, "shell", 2, 4],
    [2, "fuse"],
    [1, "battery"],
    [1, "shotgun"],
  ],
  shed: [
    [3, "fuse"],
    [2, "battery"],
    [2, "shell", 2, 4],
    [2, "flare"],
    [1, "shotgun"],
  ],
  diner: [
    [2, "aid"],
    [2, "battery"],
    [1, "flare"],
    [2, null],
  ],
  market: [
    [4, "battery"],
    [2, "aid"],
    [2, "flare"],
  ],
  bar: [
    [2, "r38", 2, 4],
    [1, "aid"],
    [1, "flare"],
    [2, null],
  ],
  // the farm (docs/plan/31-the-day.md): a hunter's shells in the barn, the farmhouse's drawer
  barn: [
    [3, "shell", 2, 5],
    [2, "fuse"],
    [2, "flare"],
    [1, "shotgun"],
    [1, null],
  ],
  farmhouse: [
    [3, "aid"],
    [2, "battery"],
    [2, "r38", 3, 6],
    [2, null],
  ],
  tractor: [
    [3, "fuse"],
    [3, "battery"],
    [2, "flare"],
    [2, null],
  ],
};
/** What a search draws: one or two things. */
export const DRAWS = { two: 0.4 };

export interface Budget {
  r38: number;
  shell: number;
}
/** The night's ammo: a base and more for each person who went out that night. */
export function nightBudget(people: number): Budget {
  return { r38: 24 + 8 * people, shell: 6 + 3 * people };
}

export type LootItem = { id: ItemId; n: number; loaded?: number };

/** What's in a spot of `place` when it's searched (rounds and shells out of
 *  `budget`, which goes down; a shotgun comes loaded out of it too). */
export function rollLoot(place: Place, rng: () => number, budget: Budget): LootItem[] {
  const table = TABLES[place];
  const total = table.reduce((a, r) => a + r[0], 0);
  const out: LootItem[] = [];
  const draws = rng() < DRAWS.two ? 2 : 1;
  for (let d = 0; d < draws; d++) {
    let x = rng() * total;
    let r = table[table.length - 1];
    for (const row of table) {
      x -= row[0];
      if (x < 0) {
        r = row;
        break;
      }
    }
    const id = r[1];
    if (!id) continue;
    if (id === "shotgun") {
      const loaded = Math.min(budget.shell, Math.floor(rng() * 3));
      budget.shell -= loaded;
      out.push({ id, n: 1, loaded });
      continue;
    }
    let n = r[2] === undefined ? 1 : r[2] + Math.floor(rng() * ((r[3] ?? r[2]) - r[2] + 1));
    if (id === "r38" || id === "shell") {
      n = Math.min(n, budget[id]);
      budget[id] -= n;
    }
    if (!n) continue;
    const same = out.find((o) => o.id === id);
    if (same) same.n += n;
    else out.push({ id: id as StackId, n });
  }
  return out;
}

/** São Paulo's night that `ms` falls in: its number, a day from 18:00 to 18:00
 *  (the ammo budget's). */
export function nightOf(ms: number): number {
  return Math.floor((ms + (SP_OFFSET_H - 18) * 3_600_000) / 86_400_000);
}
