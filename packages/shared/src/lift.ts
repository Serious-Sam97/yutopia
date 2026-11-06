import { footprint, quarterOf } from "./catalog.ts";
import type { Point } from "./iso.ts";
import { objLevel } from "./levels.ts";
import type { Edge } from "./map.ts";
import type { Solid3 } from "./shapes/index.ts";
import { STOREY } from "./units.ts";

// An elevator's stop on a floor (the catalog's `elevator`, 2 × 2): a box with
// its doors on one side — north at rot 0, then east, south, west (as Sketch.rp
// turns the drawing). Its other three sides are always wall. Where the car is
// (props.at, set by the world-server's lifts) its inside is floor and the
// doors are a way in while they're open; on a floor it isn't at, it's the
// empty shaft: no floor at all, so nobody ends up standing in it.

type Stop = { kind?: string; x: number; y: number; yaw?: number; props?: Record<string, unknown> | null };

const SIDES = ["n", "e", "s", "w"] as const;
type Side = (typeof SIDES)[number];

function sideEdges(o: Stop, side: Side): Edge[] {
  const { w, h } = footprint("elevator", quarterOf(o));
  const out: Edge[] = [];
  if (side === "n" || side === "s") {
    const y = side === "n" ? o.y : o.y + h;
    for (let x = o.x; x < o.x + w; x++) out.push({ dir: "h", x, y });
  } else {
    const x = side === "w" ? o.x : o.x + w;
    for (let y = o.y; y < o.y + h; y++) out.push({ dir: "v", x, y });
  }
  return out;
}

const doorSide = (o: Stop): Side => SIDES[(quarterOf(o) & 3) as 0 | 1 | 2 | 3];

/** The edges its doors are on. */
export const liftDoorEdges = (o: Stop): Edge[] => sideEdges(o, doorSide(o));

/** Its three other sides (always wall). */
export const liftWallEdges = (o: Stop): Edge[] =>
  SIDES.filter((s) => s !== doorSide(o)).flatMap((s) => sideEdges(o, s));

/** Where to stand to call it: `d` tiles out from the middle of its doors. */
export function liftFront(o: Stop, d = 0.7): Point {
  const { w, h } = footprint("elevator", quarterOf(o));
  const cx = o.x + w / 2;
  const cy = o.y + h / 2;
  switch (doorSide(o)) {
    case "n":
      return { x: cx, y: o.y - d };
    case "e":
      return { x: o.x + w + d, y: cy };
    case "s":
      return { x: cx, y: o.y + h + d };
    default:
      return { x: o.x - d, y: cy };
  }
}

/** Is a point inside its car's footprint? */
export function inLift(o: Stop, p: Point): boolean {
  const { w, h } = footprint("elevator", quarterOf(o));
  return p.x >= o.x && p.x < o.x + w && p.y >= o.y && p.y < o.y + h;
}

// ── stations (plan 72 phase 11: lifts stopping at mezzanines) ──
// A stop stands on its floor or up on one of its mezzanines (props.deck: how high over the floor,
// m). Where a car is, and where it's sent, is a station: the stop's floor and its height over it in
// storeys (a mezzanine 2.5 m up the ground floor: 0.714). On whole floors, as it always was.

/** How high over its floor a stop stands (a mezzanine's, m; 0 on the floor). */
export const stopOver = (o: { props?: Record<string, unknown> | null }): number => {
  const v = Number(o.props?.deck);
  return Number.isFinite(v) && v > 0 && v < STOREY ? v : 0;
};
/** A stop's station: its floor, and up its height over it in storeys. */
export const stationOf = (o: Stop, m: { floor?: number; home?: number }): number =>
  Math.round((objLevel(o, m) + stopOver(o) / STOREY) * 1e4) / 1e4;
/** The same station (a car's `at` against a stop's). */
export const sameStation = (a: number, b: number): boolean => Math.abs(a - b) < 1e-3;

/** Is the car at this stop (its inside floor)? Before the server has said where
 *  it is, every stop counts as having it (the doors are shut anyway). */
export function liftHere(o: Stop, m: { floor?: number; home?: number }): boolean {
  const at = o.props?.at;
  return typeof at !== "number" || sameStation(at, stationOf(o, m));
}

/** Is a body (radius r) in its doorway — across the door line, or touching it? */
export function inLiftDoorway(o: Stop, p: Point, r: number): boolean {
  const { w, h } = footprint("elevator", quarterOf(o));
  const pad = r + 0.12;
  switch (doorSide(o)) {
    case "n":
      return p.x > o.x - r && p.x < o.x + w + r && Math.abs(p.y - o.y) < pad;
    case "s":
      return p.x > o.x - r && p.x < o.x + w + r && Math.abs(p.y - (o.y + h)) < pad;
    case "e":
      return p.y > o.y - r && p.y < o.y + h + r && Math.abs(p.x - (o.x + w)) < pad;
    default:
      return p.y > o.y - r && p.y < o.y + h + r && Math.abs(p.x - o.x) < pad;
  }
}

// ── motion (docs/plan/26-floor-transitions.md) ─────────────────────────────
// The server tells each stop the car's phase (props.ph), how long it lasts in
// ms (props.len: the doors opening or closing, a ride) and where it's going
// (props.to); the clients move things from the moment they heard of it, so
// everyone sees the doors slide and the car travel together.

/** The doors over a cycle: a moment as the motor takes, then eased. */
export function doorEase(t: number): number {
  const k = Math.max(0, Math.min(1, t));
  const s = Math.max(0, (k - 0.06) / 0.94);
  return s * s * (3 - 2 * s);
}

/** A ride's height between two floors over time (floors): an S-curve — it
 *  speeds up, cruises, slows — and the slightest settle as it stops. */
export function rideAt(from: number, to: number, t: number, len: number): number {
  const k = Math.max(0, Math.min(1, t / len));
  const s = k * k * k * (k * (k * 6 - 15) + 10);
  const after = t - len;
  const settle = after > 0 && after < 0.35 ? Math.sin((after / 0.35) * Math.PI) * 0.004 * Math.sign(from - to) : 0;
  return from + (to - from) * s + settle;
}

export interface LiftMotion {
  doors: number; // 0 shut … 1 open, on this stop
  car: number; // where the car is (a floor; between two while it travels)
  here: boolean; // the car at this stop's floor (its inside is there)
  dir: -1 | 0 | 1; // which way it's going
  to: number; // where to
  phase: string;
}

/** What a stop shows, `since` seconds after its props' phase began. */
export function liftMotion(o: { props?: Record<string, unknown> | null }, level: number, since: number): LiftMotion {
  const p = o.props ?? {};
  const phase = typeof p.ph === "string" ? p.ph : p.door === "open" ? "open" : "shut";
  const len = Math.max(0.001, (Number(p.len) || 0) / 1000);
  const at = typeof p.at === "number" ? p.at : level;
  const to = typeof p.to === "number" ? p.to : at;
  const k = since / len;
  let doors = 0;
  const here = sameStation(at, level);
  if (here) {
    if (phase === "open") doors = 1;
    else if (phase === "opening") doors = doorEase(k);
    else if (phase === "closing") doors = 1 - doorEase(k);
  }
  const car = phase === "moving" ? rideAt(at, to, since, len) : at;
  const dir = (to === at ? 0 : Math.sign(to - at)) as -1 | 0 | 1;
  return { doors, car, here, dir, to, phase };
}

/** A station's short name on a display: G for the ground, else its number; a mezzanine's its
 *  floor's and M (GM, 1M). */
export const liftFloorName = (level: number): string => {
  const f = Math.floor(level + 1e-3);
  const name = f === 0 ? "G" : String(f);
  return level - f > 1e-3 ? `${name}M` : name;
};

// ── the shaft (docs/plan/72-the-3d-core.md, phase 8: lifts as moving platforms) ─────────────────
// A shaft is open from its lowest stop to its highest: every floor's slab between has a hole its
// size (the floor below shows through, as at the stairs), its walls go the whole storey, each
// landing's doors shut unless the car's there with them open (physics/build.ts). The car is a
// moving body in Jolt (its floor, its ceiling: physics/build.ts liftCarBody) where liftMotion
// says it is; who stands on it goes with it.

type ShaftStop = Stop & { id: string };

/** A stop's shaft (its props.shaft; a lone stop is its own). */
export const shaftOf = (o: ShaftStop): string => String(o.props?.shaft ?? o.id);

/** The building's shafts (a world map's things: world x, y): each one's stops by station (`level`),
 *  lowest first. */
export function liftShafts<T extends ShaftStop>(
  objects: Iterable<T & { kind: string }>,
  m: { floor?: number; home?: number },
): Map<string, { level: number; o: T }[]> {
  const out = new Map<string, { level: number; o: T }[]>();
  for (const o of objects) {
    if (o.kind !== "elevator") continue;
    const k = shaftOf(o);
    const list = out.get(k) ?? [];
    list.push({ level: stationOf(o, m), o });
    out.set(k, list);
  }
  for (const list of out.values()) list.sort((a, b) => a.level - b.level);
  return out;
}

/** A stop's footprint, world: [x0, y0, x1, y1]. */
export function liftRect(o: Stop): [number, number, number, number] {
  const { w, h } = footprint("elevator", quarterOf(o));
  return [o.x, o.y, o.x + w, o.y + h];
}

/** Where floor `level` is open to the one below for a lift's shaft (it goes on down from there) or to
 *  the one above (`up`: it goes on up): the shafts' footprints, world. A slab is open where the car
 *  passes it: over its lowest stop and under the top of its car at its highest (a mezzanine's car
 *  reaching up through the floor over it). */
export function shaftHoles(
  shafts: Map<string, { level: number; o: Stop }[]>,
  level: number,
  up = false,
): [number, number, number, number][] {
  const out: [number, number, number, number][] = [];
  for (const list of shafts.values()) {
    const lo = list[0]?.level;
    const hi = list[list.length - 1]?.level;
    if (lo === undefined || hi === undefined) continue;
    const z = (up ? level + 1 : level) * STOREY;
    if (z > lo * STOREY + 1e-3 && z < hi * STOREY + CAR_H + 0.1) out.push(liftRect(list[0].o));
  }
  return out;
}

/** What says floor `level` has a floor under (x, y) in a shaft: anywhere from its lowest stop to its
 *  highest — the car's floor, whichever floor it's at (stairs.ts floorAt: riding, the floor it's
 *  passing; the slab's hole isn't "out of the building"). */
export function shaftAt(shafts: Map<string, { level: number; o: Stop }[]>): (level: number, p: Point) => boolean {
  const spans = [...shafts.values()]
    .filter((l) => l.length)
    .map((l) => ({ lo: Math.floor(l[0].level + 1e-3), hi: l[l.length - 1].level, r: liftRect(l[0].o) }));
  return (level, p) =>
    spans.some((s) => level >= s.lo && level <= s.hi && p.x >= s.r[0] && p.x < s.r[2] && p.y >= s.r[1] && p.y < s.r[3]);
}

/** The car's floor's height (world m) at a floor `car` (between two on the way: liftMotion's). */
export const carElev = (car: number): number => car * STOREY;

/** A car's floor's thickness, and its ceiling's height inside it (tp/lift3d.ts CAR_H) (m). */
export const CAR_FLOOR = 0.15;
const CAR_H = 2.5;

// (a box as shapes' box3 makes one: here, so the page needn't take the shapes for it)
const box = (x0: number, z0: number, x1: number, z1: number, y0: number, y1: number): Solid3 => ({
  t: "box",
  x: (x0 + x1) / 2,
  y: (y0 + y1) / 2,
  z: (z0 + z1) / 2,
  hx: Math.abs(x1 - x0) / 2,
  hy: Math.abs(y1 - y0) / 2,
  hz: Math.abs(z1 - z0) / 2,
  a: 0,
});

/** A lift's car as Jolt has it (a carrier: PhysicsWorld.setCarrier) — its floor and its ceiling,
 *  the shaft's walls round it the stops' statics (physics/build.ts): `stop` any of its stops (world
 *  x, y), `elev` its floor's height now (carElev of liftMotion's car). Its solids are its own (the
 *  body's origin its floor's corner), `at` where that is. */
export function liftCarBody(
  stop: ShaftStop,
  elev: number,
): { key: string; solids: Solid3[]; at: [number, number, number] } {
  const [x0, y0, x1, y1] = liftRect(stop);
  const [w, h] = [x1 - x0, y1 - y0];
  return {
    key: `liftcar:${shaftOf(stop)}`,
    solids: [box(0, 0, w, h, -CAR_FLOOR, 0), box(0, 0, w, h, CAR_H, CAR_H + 0.1)],
    at: [x0, elev, y0],
  };
}
