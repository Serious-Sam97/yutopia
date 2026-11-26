// Stairs built with one tool (docs/plan/130-the-house-build.md, phase 6 — F6a, The Sims 4's modular stairs): a stair
// is its foot (its middle, the plan's), the way its first run climbs, its shape — straight, an L (a landing, then a
// quarter round to the left or the right), a U (a landing across, then back), a spiral round a pole, a ship's ladder
// — its width, how high it climbs, and its look (treads, rail, sides). Its treads and landings, its strings and
// rails are worked out here, the same for the drawing (the client's) and for Jolt (physics/build.ts). Kept as a
// floor's "flights" layer; up to the storey over it, the floor there gets a hole over it (railed round, but where
// it comes up) — the server lays those with it.

import type { StructOp } from "./ops.ts";
import type { Structure, Wall, XY } from "./types.ts";

export type FlightShape = "straight" | "l" | "u" | "spiral" | "ladder";
export const FLIGHT_SHAPES: readonly FlightShape[] = ["straight", "l", "u", "spiral", "ladder"];
export const FLIGHT_WIDTHS = [0.8, 1.0, 1.3] as const;
export const FLIGHT_STYLES = ["oak", "white", "iron", "glass", "rustic", "concrete"] as const;
export const FLIGHT_RAILS = ["balusters", "glass", "iron", "none"] as const;
export const FLIGHTS = "flights";

export interface Flight {
  id: string;
  /** its foot's middle (world) */
  x: number;
  y: number;
  /** the way its first run climbs (radians, the plan's: +x at 0, +y at π/2) */
  dir: number;
  shape: FlightShape;
  /** an L or a U: its turn to the left (+1, towards (−sin, cos)) or the right (−1) */
  turn: 1 | -1;
  width: number;
  /** how high it climbs (m) */
  rise: number;
  style: string;
  rail: string;
  /** its sides closed (boards under the treads) */
  closed?: boolean;
}

/** A tread, a landing, a riser, a string as a box in the plan: its middle, half-sizes along its own u (the way it's
 *  turned) and v, its heading, from y0 to y1 over the foot. */
export interface FlightBox {
  x: number;
  y: number;
  hu: number;
  hv: number;
  a: number;
  y0: number;
  y1: number;
  part: "tread" | "landing" | "riser" | "string" | "post" | "rail" | "pole";
}

const RISER = 0.18;
const TREAD = 0.28;
/** How many risers a climb takes (a ship's ladder's are higher, its treads shallower). */
export const stepsOf = (f: Pick<Flight, "rise" | "shape">): number =>
  Math.max(2, Math.round(f.rise / (f.shape === "ladder" ? 0.25 : RISER)));

/** The flight's pieces (world plan, heights over its foot). */
export function flightBoxes(f: Flight): FlightBox[] {
  const n = stepsOf(f);
  const h = f.rise / n;
  const W = f.width;
  const out: FlightBox[] = [];
  const [c, s] = [Math.cos(f.dir), Math.sin(f.dir)];
  // (local: u across the first run to its left, v up it; the foot's middle at 0, 0)
  // (local u to the left of the way it climbs — the world's (−sin, cos) of its dir —, v up it)
  const P = (u: number, v: number): XY => [f.x + v * c - u * s, f.y + v * s + u * c];
  const box = (
    u: number,
    v: number,
    hu: number,
    hv: number,
    a: number,
    y0: number,
    y1: number,
    part: FlightBox["part"],
  ) => {
    const [x, y] = P(u, v);
    out.push({ x, y, hu, hv, a: f.dir + a, y0, y1, part });
  };
  const tread = f.shape === "ladder" ? 0.14 : TREAD;
  // a run of k treads from (u0, v0) climbing along `ang` (local: 0 up v, π/2 across to the left — the world's heading
  // its dir + ang), its first at `from` risers up
  const run = (u0: number, v0: number, ang: number, k: number, from: number) => {
    const [du, dv] = [Math.sin(ang), Math.cos(ang)];
    for (let i = 0; i < k; i++) {
      const along = (i + 0.5) * tread;
      const top = (from + i + 1) * h;
      box(u0 + du * along, v0 + dv * along, W / 2, tread / 2, ang, top - 0.05, top, "tread");
      if (!f.closed && f.shape !== "ladder")
        box(u0 + du * i * tread, v0 + dv * i * tread, W / 2 - 0.02, 0.012, ang, top - h, top - 0.05, "riser");
    }
    // its strings: either side, up its slope (a box from its foot to its top, as high as a tread)
    if (f.closed || f.shape === "ladder") {
      for (const side of [-1, 1]) {
        const off = side * (W / 2 + 0.02);
        const su = u0 + du * ((k * tread) / 2) + Math.cos(ang) * off;
        const sv = v0 + dv * ((k * tread) / 2) - Math.sin(ang) * off;
        box(su, sv, 0.025, (k * tread) / 2, ang, from * h, (from + k) * h, "string");
      }
    }
    return { u: u0 + du * k * tread, v: v0 + dv * k * tread };
  };
  if (f.shape === "straight" || f.shape === "ladder") run(0, 0, 0, n, 0);
  else if (f.shape === "l") {
    const n1 = Math.floor(n / 2);
    const end = run(0, 0, 0, n1, 0);
    // (the landing: a square at its top, then a quarter round)
    box(end.u, end.v + W / 2, W / 2, W / 2, 0, n1 * h - 0.12, n1 * h, "landing");
    run(end.u + (f.turn * W) / 2, end.v + W / 2, (f.turn * Math.PI) / 2, n - n1, n1);
  } else if (f.shape === "u") {
    const n1 = Math.floor(n / 2);
    const end = run(0, 0, 0, n1, 0);
    // (the landing across both runs, then back down the way it came, beside the first)
    const gap = 0.1;
    box(end.u + (f.turn * (W + gap)) / 2, end.v + W / 2, W + gap / 2, W / 2, 0, n1 * h - 0.12, n1 * h, "landing");
    run(end.u + f.turn * (W + gap), end.v, Math.PI, n - n1, n1);
  } else {
    // a spiral: wedges round a pole, a turn and a quarter at most
    const R = Math.max(0.8, W);
    const sweep = Math.min(Math.PI * 2.5, n * 0.42);
    const step = sweep / n;
    for (let i = 0; i < n; i++) {
      const ang = f.turn * i * step;
      const top = (i + 1) * h;
      // (each wedge as a box half out from the pole, as wide as the wedge there)
      const r = R / 2 + 0.1;
      const [u, v] = [Math.sin(ang) * r, Math.cos(ang) * r];
      box(u, v, Math.max(0.12, (step * (R + 0.2)) / 2), R / 2 - 0.05, ang, top - 0.05, top, "tread");
    }
    box(0, 0, 0.07, 0.07, 0, 0, f.rise + 1, "pole");
  }
  // the rails: along each run's open side, a handrail at 0.9 over the treads (balusters drawn by the client)
  return out;
}

/** The plan's footprint of a flight: its boxes' corners' hull as a polygon (a straight's, an L's and a U's are boxes
 *  joined — given back as its treads' and landings' rectangle-union's bounding rectangles, one each). */
export function flightRects(f: Flight): XY[][] {
  return flightBoxes(f)
    .filter((b) => b.part === "tread" || b.part === "landing" || b.part === "pole")
    .map((b) => {
      const [c, s] = [Math.cos(b.a), Math.sin(b.a)];
      // (its u across, v along its heading)
      return [
        [-b.hu, -b.hv],
        [b.hu, -b.hv],
        [b.hu, b.hv],
        [-b.hu, b.hv],
      ].map(([u, v]): XY => [b.x + v * c - u * s, b.y + v * s + u * c]);
    });
}
/** A flight's bounding box on the plan. */
export function flightBounds(f: Flight): { x0: number; y0: number; x1: number; y1: number } {
  const pts = flightRects(f).flat();
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
}
/** Where a flight comes out at its top (the plan's), and the way it's going. */
export function flightTop(f: Flight): { at: XY; dir: number } {
  const treads = flightBoxes(f).filter((b) => b.part === "tread");
  const last = treads[treads.length - 1];
  if (!last) return { at: [f.x, f.y], dir: f.dir };
  const [c, s] = [Math.cos(last.a), Math.sin(last.a)];
  return { at: [last.x + c * last.hv, last.y + s * last.hv], dir: last.a };
}

export const flightsOf = (s: Structure, floor: number): Flight[] =>
  (s.layers?.[FLIGHTS]?.[String(floor)] as Flight[] | undefined) ?? [];

const r3 = (v: number) => Math.round(v * 1000) / 1000;
/** Why a flight can't go (null: it can): on the floor's grid, a shape and a look there are, as high as up to a
 *  floor at most. */
export function flightWhy(s: Structure, floor: number, f: Flight): string | null {
  const fl = s.floors.find((q) => q.index === floor);
  if (!fl) return "no such floor";
  if (!FLIGHT_SHAPES.includes(f.shape)) return "not a kind of stairs";
  if (!(f.width >= 0.6 && f.width <= 2)) return "0.6–2 m wide";
  if (!(f.rise >= 0.3 && f.rise <= 5)) return "0.3–5 m up";
  if (![f.x, f.y, f.dir].every(Number.isFinite)) return "not a place";
  const b = flightBounds(f);
  const g = fl.grid;
  if (b.x0 < g.x0 - 0.01 || b.y0 < g.y0 - 0.01 || b.x1 > g.x0 + g.w + 0.01 || b.y1 > g.y0 + g.h + 0.01)
    return "off the floor";
  return null;
}

/** A flight put on floor `floor` — up to the floor over it (`above`, when it climbs a storey: its hole there, railed
 *  round but where it comes up) — the operations. */
export function flightAddOps(s: Structure, floor: number, f: Flight, above: number | null): StructOp[] {
  const ops: StructOp[] = [{ op: "layer", name: FLIGHTS, floor, data: [...flightsOf(s, floor), f] }];
  if (above === null) return ops;
  const fa = s.floors.find((q) => q.index === above);
  if (!fa) return ops;
  const b = flightBounds(f);
  const pad = 0.05;
  const ring: XY[] = [
    [r3(b.x0 - pad), r3(b.y0 - pad)],
    [r3(b.x1 + pad), r3(b.y0 - pad)],
    [r3(b.x1 + pad), r3(b.y1 + pad)],
    [r3(b.x0 - pad), r3(b.y1 + pad)],
  ];
  // (the hole in every slab of the floor over it the stairs come up through)
  const slabs = s.slabs
    .filter((x) => x.floor === above)
    .map((x) => (x.top === "g" || Math.abs(x.z - fa.z) > 1e-3 ? x : { ...x, holes: [...x.holes, ring] }));
  ops.push({ op: "slabs", floor: above, slabs });
  // (rails round it up there, but the side it comes up at)
  const top = flightTop(f);
  const sides: [XY, XY][] = ring.map((p, i) => [p, ring[(i + 1) % 4]]);
  const out = [Math.cos(top.dir), Math.sin(top.dir)];
  const rails: Wall[] = sides
    .filter(([p, q]) => {
      const m = [(p[0] + q[0]) / 2 - top.at[0], (p[1] + q[1]) / 2 - top.at[1]];
      const L = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1;
      const nrm = [-(q[1] - p[1]) / L, (q[0] - p[0]) / L];
      // (the side across its way out, nearest the top: open)
      const facing = Math.abs(nrm[0] * out[0] + nrm[1] * out[1]) > 0.7;
      return !(facing && Math.hypot(m[0], m[1]) < f.width + 0.6);
    })
    .map(([p, q], i) => ({
      id: `rail-${f.id}-${i}`,
      floor: above,
      a: p,
      b: q,
      base: fa.z,
      height: 0.95,
      front: "p",
      thick: 0.1,
      style: "rail",
    }));
  if (rails.length) ops.push({ op: "walls", remove: [], add: rails });
  return ops;
}

/** A flight taken away (its hole and rails up there with it). */
export function flightRemoveOps(s: Structure, floor: number, id: string, above: number | null): StructOp[] | string {
  const list = flightsOf(s, floor);
  const f = list.find((q) => q.id === id);
  if (!f) return "no such stairs";
  const rest = list.filter((q) => q.id !== id);
  const ops: StructOp[] = [{ op: "layer", name: FLIGHTS, floor, data: rest.length ? rest : null }];
  if (above !== null) {
    const b = flightBounds(f);
    const near = (r: XY[]) => Math.abs(r[0][0] - (b.x0 - 0.05)) < 0.01 && Math.abs(r[0][1] - (b.y0 - 0.05)) < 0.01;
    ops.push({
      op: "slabs",
      floor: above,
      slabs: s.slabs.filter((x) => x.floor === above).map((x) => ({ ...x, holes: x.holes.filter((h) => !near(h)) })),
    });
    const rails = s.walls.filter((w) => w.id.startsWith(`rail-${id}-`)).map((w) => w.id);
    if (rails.length) ops.push({ op: "walls", remove: rails, add: [] });
  }
  return ops;
}
