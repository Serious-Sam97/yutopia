// Home lots (docs/plan/130-the-house-build.md, phase 1 — F1a, F2a): a lot of land a member claims and builds a house
// on. Admins lay lots out in God mode (GroundsEdits.homeLots, over the generator's own: Pine Meadow); the land under
// each is flat and clear of trees (grounds.ts). A member claims a free one — one each — and its house is floors of the
// one structure, as a town building's inside is (plan 112): numbered from SPACE_BASE, tagged with the lot's space
// ("home:<key>"), its ground storey's grid the lot. Who owns it and who else builds there (roommates) is kept on that
// ground storey's floor, so it's saved and sent with the structure. The ground storey has a slab over the whole lot at
// the land's height ("g": the ground, not drawn — the land is): on the lot is on its ground storey, as in a building
// is, so build mode, things and walls are the lot's. Storeys go up (4 at most) and down (2 basements, F3b); each its
// height, short, normal or tall (F5a).
// (Not "lot": the parking lot's grounds.ts LOT and lot.ts are older.)

import { SPACE_BASE, SPACE_TOP } from "./levels.ts";
import { FLIGHTS, flightHole, flightsOf } from "./structure/flights.ts";
import { applyOps, type StructOp } from "./structure/ops.ts";
import { inRing } from "./structure/rings.ts";
import type { Floor, Room, Slab, Structure } from "./structure/types.ts";
import { SLAB, STOREY } from "./units.ts";

/** A lot as God mode has it: its rectangle on the land (world x, z), its name and where it is. */
export interface HomeLotDef {
  key: string;
  name: string;
  /** the neighbourhood it's in ("Pine Meadow") */
  area?: string;
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  /** where its For Sale sign stands (world x, z; none: its front's corner) — God mode's to place */
  sign?: [number, number];
}
/** How far past its lot a sign may stand (m). */
export const SIGN_REACH = 3;

/** The generator's lots: three in the meadow east of the HQ, past the clearing trail (it runs south-west of them). */
export const BASE_HOME_LOTS: readonly HomeLotDef[] = [
  { key: "pine-1", name: "Lot 1", area: "Pine Meadow", x0: 119, z0: -53, x1: 141, z1: -25 },
  { key: "pine-2", name: "Lot 2", area: "Pine Meadow", x0: 147, z0: -53, x1: 169, z1: -25 },
  { key: "pine-3", name: "Lot 3", area: "Pine Meadow", x0: 119, z0: -19, x1: 141, z1: 9 },
];

/** How big a lot may be (m a side). */
export const LOT_MIN = 12;
export const LOT_MAX = 48;
/** Storeys a house may have over the ground, and basements under it (F3b). */
export const LOT_STOREYS = 4;
export const LOT_BASEMENTS = 2;
/** A storey's rise, floor to floor (F5a): short, normal, tall. */
export const STOREY_RISES = { short: 3.0, normal: STOREY, tall: 4.5 } as const;
export type StoreyRise = keyof typeof STOREY_RISES;
/** The ground storey's floor (a slab over the lot, the land's own: not drawn). */
export const GROUND_TOP = "g";

export const HOME_SPACE = "home:";
export const homeSpace = (key: string): string => `${HOME_SPACE}${key}`;
export const isHomeSpace = (space: string | undefined): space is string => !!space?.startsWith(HOME_SPACE);
export const homeKeyOf = (space: string): string => space.slice(HOME_SPACE.length);

/** Someone a lot's owner lets build there. */
export interface LotMate {
  uid: number;
  name: string;
}
/** What a lot's ground storey keeps of who it's whose. */
export interface LotClaim {
  owner: number;
  ownerName: string;
  mates?: LotMate[];
}

/** A lot's storeys in the structure (out of the world too, `away`), bottom up. */
export function lotFloors(st: Structure, key: string): Floor[] {
  const s = homeSpace(key);
  return st.floors.filter((f) => f.space === s).sort((a, b) => (a.storey ?? 0) - (b.storey ?? 0));
}
/** A claimed lot's ground storey (storey 0), or null: free. */
export function lotGround(st: Structure, key: string): Floor | null {
  return lotFloors(st, key).find((f) => (f.storey ?? 0) === 0) ?? null;
}
/** The lot `uid` has, or null. */
export function lotOf(st: Structure, uid: number): string | null {
  return lotsOf(st, uid)[0] ?? null;
}
/** Every lot `uid` owns (their keys): as many as they've claimed — no limit (decided 2026-11-26). */
export function lotsOf(st: Structure, uid: number): string[] {
  const out: string[] = [];
  for (const f of st.floors)
    if (isHomeSpace(f.space) && f.claim?.owner === uid && !out.includes(homeKeyOf(f.space)))
      out.push(homeKeyOf(f.space));
  return out;
}
/** The lot a floor is of (its key), or null: not a lot's. */
export const lotOfFloor = (st: Structure, level: number): string | null => {
  const f = st.floors.find((q) => q.index === level);
  return f && isHomeSpace(f.space) ? homeKeyOf(f.space) : null;
};
/** Who `p` is on a lot: its owner, a roommate, or neither. */
export function lotRole(st: Structure, key: string, uid: number): "owner" | "mate" | null {
  const c = lotGround(st, key)?.claim;
  if (!c) return null;
  if (c.owner === uid) return "owner";
  return c.mates?.some((m) => m.uid === uid) ? "mate" : null;
}
/** Why `p` can't build on floor `level` of a lot (null: they can — its owner, a roommate, an admin). */
export function lotWhy(st: Structure, level: number, p: { uid: number; admin?: boolean } | undefined): string | null {
  const key = lotOfFloor(st, level);
  if (!key) return null;
  if (p?.admin) return null;
  if (p && lotRole(st, key, p.uid)) return null;
  const c = lotGround(st, key)?.claim;
  return c ? `that's ${c.ownerName.split(" ")[0]}'s lot` : "that lot's nobody's yet";
}

/** Floor numbers not taken in `st` (from SPACE_BASE), `n` of them, or null. */
export function freeFloors(st: Structure, n: number): number[] | null {
  const taken = new Set(st.floors.map((f) => f.index));
  const out: number[] = [];
  for (let i = SPACE_BASE; i < SPACE_TOP && out.length < n; i++) if (!taken.has(i)) out.push(i);
  return out.length === n ? out : null;
}

const r3 = (v: number) => Math.round(v * 1000) / 1000;
const ceilOf = (rise: number) => r3(rise - SLAB);
const groundSlab = (lot: HomeLotDef, index: number, z: number): Slab => ({
  id: `home-${lot.key}-ground`,
  floor: index,
  z,
  top: GROUND_TOP,
  outline: [
    [lot.x0, lot.z0],
    [lot.x1, lot.z0],
    [lot.x1, lot.z1],
    [lot.x0, lot.z1],
  ],
  holes: [],
});

/** A lot claimed: its ground storey (at the land's height `z`, its rise normal), its slab of ground — the operations
 *  (null: no floor number free, or it's not free). */
export function claimOps(st: Structure, lot: HomeLotDef, who: LotMate, z: number): StructOp[] | null {
  if (lotFloors(st, lot.key).some((f) => !f.away)) return null;
  const [index] = freeFloors(st, 1) ?? [];
  if (index === undefined) return null;
  const floor: Floor = {
    index,
    name: `${lot.name} · ground`,
    z: r3(z),
    grid: { x0: lot.x0, y0: lot.z0, w: lot.x1 - lot.x0, h: lot.z1 - lot.z0 },
    space: homeSpace(lot.key),
    storey: 0,
    ceil: ceilOf(STOREY),
    claim: { owner: who.uid, ownerName: who.name, mates: [] },
  };
  // (an old claim's floors kept out of the world: gone for good with the new one)
  const old = new Set(lotFloors(st, lot.key).map((f) => f.index));
  const floors = [...st.floors.filter((f) => !old.has(f.index)), floor].sort((a, b) => a.index - b.index);
  // (a floor gone takes what stood on it: applyOps)
  return [
    { op: "floors", floors },
    { op: "slabs", floor: index, slabs: [groundSlab(lot, index, floor.z)] },
  ];
}

/** A storey added over the top (`up`) or a basement under the lowest (`down`), its rise — the floors' operation, or
 *  why not. */
export function storeyAddOps(
  st: Structure,
  lot: HomeLotDef,
  dir: "up" | "down",
  rise: StoreyRise = "normal",
): StructOp[] | string {
  const list = lotFloors(st, lot.key).filter((f) => !f.away);
  const ground = list.find((f) => (f.storey ?? 0) === 0);
  if (!ground) return "that lot's nobody's yet";
  const up = list.filter((f) => (f.storey ?? 0) > 0).length;
  const down = list.filter((f) => (f.storey ?? 0) < 0).length;
  if (dir === "up" && up >= LOT_STOREYS) return `a house goes ${LOT_STOREYS + 1} storeys at most`;
  if (dir === "down" && down >= LOT_BASEMENTS) return `${LOT_BASEMENTS} basements at most`;
  const [index] = freeFloors(st, 1) ?? [];
  if (index === undefined) return "no room for another storey in the world";
  const h = STOREY_RISES[rise];
  const top = list[list.length - 1];
  const bottom = list[0];
  const storey = dir === "up" ? (top.storey ?? 0) + 1 : (bottom.storey ?? 0) - 1;
  // (up: over the top storey's walls and its floor's slab, the foundation's height under the ground's; down: a
  // storey's rise under the lowest)
  const z = dir === "up" ? riseTop(top) : r3(bottom.z - h);
  const floor: Floor = {
    index,
    name: `${ground.name.split(" · ")[0]} · ${storeyLabel(storey)}`,
    z,
    grid: { ...ground.grid },
    space: ground.space,
    storey,
    ceil: ceilOf(h),
  };
  const ops: StructOp[] = [{ op: "floors", floors: [...st.floors, floor].sort((a, b) => a.index - b.index) }];
  // (a storey put on a house: a floor over every room of the storey under it — The Sims 4's, a room's top is floor up
  // there —, holes kept for the stairs coming up: something to stand on and build on, the rooms under their ceiling;
  // 2026-11-26, the new storey had no floor and build mode couldn't go up onto it)
  if (dir === "up") {
    // (stairs built up from the top storey before there was one over it climb its walls' height, a slab short: made to
    // reach this floor)
    const reach = flightsOf(st, top.index).map((fl) =>
      Math.abs(top.z + (fl.base ?? 0) + fl.rise - (z - SLAB)) < 0.15
        ? { ...fl, rise: r3(z - top.z - (fl.base ?? 0)) }
        : fl,
    );
    if (reach.some((fl, i) => fl !== flightsOf(st, top.index)[i]))
      ops.push({ op: "layer", name: FLIGHTS, floor: top.index, data: reach });
    const holes = reach.filter((fl) => Math.abs(top.z + (fl.base ?? 0) + fl.rise - z) < 0.15).map(flightHole);
    const slabs: Slab[] = st.rooms
      .filter((r) => r.floor === top.index && r.outline.length > 2)
      .map((r) => ({
        id: `up${index}-${r.key}`,
        floor: index,
        z,
        top: ".",
        outline: r.outline.map(([x, y]) => [x, y]),
        holes: holes.filter((h) => inRing(r.outline, (h[0][0] + h[2][0]) / 2, (h[0][1] + h[2][1]) / 2)),
      }));
    if (slabs.length) ops.push({ op: "slabs", floor: index, slabs });
  }
  return ops;
}
/** The holes for the stairs on floor `from` that come up to height `z` (a whole storey's flight — not a short one up
 *  to a mezzanine): where a floor laid up there is left open. */
function upTo(st: Structure, from: number, z: number): ReturnType<typeof flightHole>[] {
  const fz = st.floors.find((q) => q.index === from)?.z ?? 0;
  return flightsOf(st, from)
    .filter((fl) => Math.abs(fz + (fl.base ?? 0) + fl.rise - z) < 0.15)
    .map(flightHole);
}
/** (2026-11-26) Rooms just closed on a house's upper storey (`st` with them in it): their floor laid by itself and the
 *  roof under them lifted onto their walls — autoFloorOps then roofsUpOps; every way walls close a room asks it. */
export function roomsClosedOps(
  st: Structure,
  floor: number,
  found: readonly string[],
  newId: () => string,
): StructOp[] {
  if (!found.length) return [];
  const rooms = st.rooms.filter((q) => found.includes(q.key));
  const floored = autoFloorOps(st, floor, rooms, newId);
  const lifted = roofsUpOps(floored ? applyOps(st, [floored]) : st, floor, rooms);
  // (and the storey over them, if there's one: their floor up there too — their ceiling)
  const f = st.floors.find((q) => q.index === floor);
  const up = f && st.floors.find((q) => q.space === f.space && (q.storey ?? 0) === (f.storey ?? 0) + 1);
  const after = applyOps(st, [...(floored ? [floored] : []), ...lifted]);
  const over = up
    ? autoFloorOps(
        after,
        up.index,
        rooms.map((r) => ({ ...r, floor: up.index })),
        newId,
      )
    : null;
  return [...(floored ? [floored] : []), ...lifted, ...(over ? [over] : [])];
}
/** (asked 2026-11-26, The Sims 4's) The floor a room closed on an upper storey of a house gets by itself: an oak slab
 *  in its outline where there's no floor yet — holes kept for the stairs coming up from the storey under it. It's what
 *  the room under it has as its ceiling. Null: nothing to lay (not a house's upper storey, or floored already). */
export function autoFloorOps(
  st: Structure,
  floor: number,
  rooms: readonly Room[],
  newId: () => string,
  top = ".",
): StructOp | null {
  const f = st.floors.find((q) => q.index === floor);
  if (!f || !isHomeSpace(f.space) || (f.storey ?? 0) <= 0) return null;
  const mine = st.slabs.filter((x) => x.floor === floor);
  const own = mine.filter((x) => Math.abs(x.z - f.z) < 1e-3 && x.top !== GROUND_TOP);
  const under = (x: number, y: number) =>
    own.some((q) => inRing(q.outline, x, y) && !q.holes.some((h) => inRing(h, x, y)));
  // (the stairs up from the storey under it: the storeys of the same house, its next one down)
  const below = st.floors
    .filter((q) => q.space === f.space && (q.storey ?? 0) === (f.storey ?? 0) - 1)
    .map((q) => q.index)[0];
  const holes = below === undefined ? [] : upTo(st, below, f.z);
  const add: Slab[] = [];
  for (const r of rooms) {
    if (r.floor !== floor || r.outline.length < 3) continue;
    // (floored already: its middle — a point in it — on a slab)
    const xs = r.outline.map((p) => p[0]);
    const ys = r.outline.map((p) => p[1]);
    const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
    const cross = r.outline
      .map((p, i) => [p, r.outline[(i + 1) % r.outline.length]] as const)
      .filter(([a, b]) => a[1] <= cy !== b[1] <= cy)
      .map(([a, b]) => a[0] + ((cy - a[1]) / (b[1] - a[1])) * (b[0] - a[0]))
      .sort((p, q) => p - q);
    const cx = cross.length >= 2 ? (cross[0] + cross[1]) / 2 : (Math.min(...xs) + Math.max(...xs)) / 2;
    if (under(cx, cy)) continue;
    const inHere = holes.filter((h) => {
      const mx = (h[0][0] + h[2][0]) / 2;
      const my = (h[0][1] + h[2][1]) / 2;
      return inRing(r.outline, mx, my);
    });
    add.push({ id: newId(), floor, z: f.z, top, outline: r.outline.map(([x, y]) => [x, y]), holes: inHere });
  }
  return add.length ? { op: "slabs", floor, slabs: [...mine, ...add] } : null;
}

/** How much of a roof's plan (its overhang in it) the rooms up there must stand under for it to go up onto them. */
export const ROOF_UP_COVER = 0.6;
/** (2026-11-26) A room closed on a house's upper storey under a roof of the storey beneath: that roof (its dormers and
 *  chimneys with it) goes up onto the new walls, as high over their top as it stood over the old ones' — a roof rests
 *  on the house's top walls. (Moved when the storey was put on, it floated over a storey with no walls yet.) */
export function roofsUpOps(st: Structure, floor: number, rooms: readonly Room[]): StructOp[] {
  const f = st.floors.find((q) => q.index === floor);
  if (!f || !isHomeSpace(f.space) || (f.storey ?? 0) <= 0) return [];
  const below = st.floors.find((q) => q.space === f.space && (q.storey ?? 0) === (f.storey ?? 0) - 1);
  if (!below) return [];
  const mine = rooms.filter((r) => r.floor === floor && r.outline.length > 2);
  const mid = (o: readonly (readonly number[])[]) => [
    o.reduce((a, p) => a + p[0], 0) / o.length,
    o.reduce((a, p) => a + p[1], 0) / o.length,
  ];
  const roofs = (st.roofs ?? []).filter((r) => r.floor === below.index);
  // (the big roofs the rooms up there now stand under — most of each, by its plan, under the storey's rooms: a small
  // room under the middle of a whole house's roof doesn't take it up, it'd float over the rest)
  const upRooms = st.rooms.filter((r) => r.floor === floor && r.outline.length > 2);
  const covered = (o: readonly (readonly number[])[]) => {
    const xs = o.map((p) => p[0]);
    const ys = o.map((p) => p[1]);
    let [n, hit] = [0, 0];
    for (let x = Math.min(...xs) + 0.25; x < Math.max(...xs); x += 0.5)
      for (let y = Math.min(...ys) + 0.25; y < Math.max(...ys); y += 0.5) {
        if (!inRing(o as never, x, y)) continue;
        n++;
        if (upRooms.some((r) => inRing(r.outline, x, y))) hit++;
      }
    return n ? hit / n : 0;
  };
  const big = roofs.filter(
    (r) =>
      r.kind !== "chimney" &&
      r.kind !== "dormer" &&
      mine.some((m) => inRing(r.outline, ...(mid(m.outline) as [number, number]))) &&
      covered(r.outline) >= ROOF_UP_COVER,
  );
  if (!big.length) return [];
  // (and what stands on them: a dormer's or a chimney's middle in one of them)
  const on = roofs.filter(
    (r) => !big.includes(r) && big.some((q) => inRing(q.outline, ...(mid(r.outline) as [number, number]))),
  );
  const going = [...big, ...on];
  const dz = r3(f.z + (f.ceil ?? STOREY - SLAB) - (below.z + (below.ceil ?? STOREY - SLAB)));
  const up = going.map((r) => ({
    ...r,
    floor,
    z: r3(r.z + dz),
    ...(r.top !== undefined ? { top: r3(r.top + dz) } : {}),
  }));
  return [
    { op: "roofs", floor: below.index, roofs: roofs.filter((r) => !going.includes(r)) },
    { op: "roofs", floor, roofs: [...(st.roofs ?? []).filter((r) => r.floor === floor), ...up] },
  ];
}

/** Where the storey over `f` stands: its walls and a slab over its own height (a ground storey's on its foundation
 *  already — plan 130 phase 5: its z is the foundation's top). */
export const riseTop = (f: Floor): number => r3(f.z + (f.ceil ?? STOREY - SLAB) + SLAB);
/** The top storey (or the lowest basement) taken away, with everything on it: the floors' operation, or why not. */
export function storeyRemoveOps(st: Structure, key: string, level: number): StructOp[] | string {
  const list = lotFloors(st, key).filter((f) => !f.away);
  const f = list.find((q) => q.index === level);
  if (!f) return "not one of this lot's storeys";
  if ((f.storey ?? 0) === 0) return "the ground storey stays (give the lot back instead)";
  if (f !== list[0] && f !== list[list.length - 1]) return "only the top storey or the lowest basement goes";
  const ops: StructOp[] = [{ op: "floors", floors: st.floors.filter((q) => q.index !== level) }];
  // (the top storey taken away: its roofs — lifted onto it with its rooms — back down onto the storey under it, as high
  // over its walls' top, not gone with it: the house kept its roof — 2026-11-26)
  const below = list.find((q) => (q.storey ?? 0) === (f.storey ?? 0) - 1);
  const roofs = (st.roofs ?? []).filter((r) => r.floor === level);
  if ((f.storey ?? 0) > 0 && below && roofs.length) {
    const dz = r3(below.z + (below.ceil ?? STOREY - SLAB) - (f.z + (f.ceil ?? STOREY - SLAB)));
    const down = roofs.map((r) => ({
      ...r,
      floor: below.index,
      z: r3(r.z + dz),
      ...(r.top !== undefined ? { top: r3(r.top + dz) } : {}),
    }));
    ops.push({
      op: "roofs",
      floor: below.index,
      roofs: [...(st.roofs ?? []).filter((r) => r.floor === below.index), ...down],
    });
  }
  return ops;
}
/** A storey's name: Ground, Upstairs (first), Second…, Basement, Basement 2. */
export function storeyLabel(storey: number): string {
  if (storey === 0) return "ground";
  if (storey === 1) return "upstairs";
  if (storey > 1) return ["second", "third", "fourth", "fifth"][storey - 2] ?? `storey ${storey}`;
  return storey === -1 ? "basement" : `basement ${-storey}`;
}
/** The lot given back: its floors gone with what's on them — the operations. */
export function releaseOps(st: Structure, key: string): StructOp[] {
  const list = lotFloors(st, key);
  const on = new Set(list.map((f) => f.index));
  return [{ op: "floors", floors: st.floors.filter((f) => !on.has(f.index)) }];
}
/** The ground storey's claim changed (roommates, a new owner): the floors' operation. */
export function claimSetOps(st: Structure, key: string, claim: LotClaim): StructOp[] | null {
  const g = lotGround(st, key);
  if (!g) return null;
  return [{ op: "floors", floors: st.floors.map((f) => (f === g ? { ...f, claim } : f)) }];
}

/** Lots kept with God mode's: a claimed lot's floors out of the world while its lot's gone (kept), back in when it's
 *  back — the floors' operation (none: nothing to do). */
export function lotsFix(st: Structure, lots: readonly HomeLotDef[]): StructOp[] {
  const have = new Set(lots.map((l) => l.key));
  let changed = false;
  const floors = st.floors.map((f) => {
    if (!isHomeSpace(f.space)) return f;
    const want = have.has(homeKeyOf(f.space));
    if (want && f.away) {
      changed = true;
      const { away: _, ...rest } = f;
      return rest;
    }
    if (!want && !f.away) {
      changed = true;
      return { ...f, away: true };
    }
    return f;
  });
  return changed ? [{ op: "floors", floors }] : [];
}

/** Why a lot isn't one God mode may lay (null: fine): its size; on another's or on a building (`taken`: what's laid). */
export function lotFault(
  d: HomeLotDef,
  taken: readonly { key: string; x0: number; z0: number; x1: number; z1: number }[],
): string | null {
  const [w, h] = [d.x1 - d.x0, d.z1 - d.z0];
  if (![d.x0, d.z0, d.x1, d.z1].every(Number.isFinite)) return "its corners";
  if (w < LOT_MIN || h < LOT_MIN) return `a lot is ${LOT_MIN} m a side at least`;
  if (w > LOT_MAX || h > LOT_MAX) return `a lot is ${LOT_MAX} m a side at most`;
  for (const t of taken)
    if (t.key !== d.key && d.x0 < t.x1 + 1 && d.x1 > t.x0 - 1 && d.z0 < t.z1 + 1 && d.z1 > t.z0 - 1)
      return "on another lot or a building";
  if (d.sign !== undefined) {
    const [x, z] = d.sign;
    if (!Array.isArray(d.sign) || ![x, z].every(Number.isFinite)) return "its sign's place";
    if (!inLot(d, x, z, SIGN_REACH)) return `its sign stands on it or within ${SIGN_REACH} m of it`;
  }
  return null;
}
/** Whether a rect of a lot holds (x, z) (world). */
export const inLot = (l: HomeLotDef, x: number, z: number, pad = 0): boolean =>
  x >= l.x0 - pad && x <= l.x1 + pad && z >= l.z0 - pad && z <= l.z1 + pad;
/** Where a free lot's sign stands — God mode's place for it, else its front's corner a metre out (its front: the
 *  side with the lower z) — and its turn: its board along the lot's edge nearest it (0: along x). */
export function lotSign(l: HomeLotDef): { x: number; z: number; yaw: number } {
  if (!l.sign) return { x: l.x0 + 2.8, z: l.z0 - 0.6, yaw: 0 };
  const [x, z] = l.sign;
  const dz = Math.min(Math.abs(z - l.z0), Math.abs(z - l.z1));
  const dx = Math.min(Math.abs(x - l.x0), Math.abs(x - l.x1));
  return { x, z, yaw: dz <= dx ? 0 : Math.PI / 2 };
}
