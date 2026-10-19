import { footprint } from "./catalog.ts";
import type { Point } from "./iso.ts";
import { objLevel } from "./levels.ts";
import type { Edge } from "./map.ts";

// An elevator's stop on a floor (the catalog's `elevator`, 2 × 2): a box with
// its doors on one side — north at rot 0, then east, south, west (as Sketch.rp
// turns the drawing). Its other three sides are always wall. Where the car is
// (props.at, set by the world-server's lifts) its inside is floor and the
// doors are a way in while they're open; on a floor it isn't at, it's the
// empty shaft: no floor at all, so nobody ends up standing in it.

type Stop = { kind?: string; x: number; y: number; rot?: number; props?: Record<string, unknown> | null };

const SIDES = ["n", "e", "s", "w"] as const;
type Side = (typeof SIDES)[number];

function sideEdges(o: Stop, side: Side): Edge[] {
  const { w, h } = footprint("elevator", o.rot ?? 0);
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

const doorSide = (o: Stop): Side => SIDES[((o.rot ?? 0) & 3) as 0 | 1 | 2 | 3];

/** The edges its doors are on. */
export const liftDoorEdges = (o: Stop): Edge[] => sideEdges(o, doorSide(o));

/** Its three other sides (always wall). */
export const liftWallEdges = (o: Stop): Edge[] =>
  SIDES.filter((s) => s !== doorSide(o)).flatMap((s) => sideEdges(o, s));

/** Where to stand to call it: `d` tiles out from the middle of its doors. */
export function liftFront(o: Stop, d = 0.7): Point {
  const { w, h } = footprint("elevator", o.rot ?? 0);
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
  const { w, h } = footprint("elevator", o.rot ?? 0);
  return p.x >= o.x && p.x < o.x + w && p.y >= o.y && p.y < o.y + h;
}

/** Is the car at this stop (its inside floor)? Before the server has said where
 *  it is, every stop counts as having it (the doors are shut anyway). */
export function liftHere(o: Stop, m: { floor?: number; home?: number }): boolean {
  const at = o.props?.at;
  return typeof at !== "number" || at === objLevel(o, m);
}

/** Is a body (radius r) in its doorway — across the door line, or touching it? */
export function inLiftDoorway(o: Stop, p: Point, r: number): boolean {
  const { w, h } = footprint("elevator", o.rot ?? 0);
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
  if (at === level) {
    if (phase === "open") doors = 1;
    else if (phase === "opening") doors = doorEase(k);
    else if (phase === "closing") doors = 1 - doorEase(k);
  }
  const car = phase === "moving" ? rideAt(at, to, since, len) : at;
  const dir = (to === at ? 0 : Math.sign(to - at)) as -1 | 0 | 1;
  return { doors, car, here: at === level, dir, to, phase };
}

/** A floor's short name on a display: G for the ground, else its number. */
export const liftFloorName = (level: number): string => (level === 0 ? "G" : String(level));
