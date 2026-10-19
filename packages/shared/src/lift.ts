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
