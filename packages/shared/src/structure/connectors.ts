// Stairs and lifts as connectors (docs/plan/72-the-3d-core.md, phase 6): what joins one height to
// another, in the world's terms — its footprint on the ground plane, where you get on and off at
// each height it reaches, and (stairs) the treads' surfaces at their real heights. Phase 7 makes
// them Jolt's shapes and the navmesh's links (a lift a moving platform by height), phase 11's tool
// places them; the things stay the truth (a staircase is a thing on its floor, a lift a stop on
// each floor sharing a shaft) and these are read from them.
import type { WorldObjectDef } from "../catalog.ts";
import { footprint, quarterOf } from "../catalog.ts";
import { flightRise } from "../flight.ts";
import { elevOf, floorsOf, objLevel } from "../levels.ts";
import { liftFront } from "../lift.ts";
import type { MapDef } from "../map.ts";
import { type Ramp, STAIRS_D, STAIRS_W, stairsDoor, stairsPoint, stairsRamps, stairsWayUp } from "../stairs.ts";
import type { Ring, XY } from "./types.ts";

export interface ConnectorStop {
  /** the floor (a working height's number) and its height (m, world) */
  floor: number;
  z: number;
  /** the thing that stops there (a lift's stop on that floor; a staircase's own) */
  thing: string;
  /** where you get on or off (world): a staircase's door below, its landing above; a lift's front */
  at: XY;
}

export interface Connector {
  /** a staircase: its thing's id; a lift: `lift:{shaft}` */
  id: string;
  kind: "stairs" | "lift" | "flight";
  /** its footprint (world) */
  outline: Ring;
  /** the heights it joins, bottom up */
  stops: ConnectorStop[];
  /** stairs: the treads and the half landing, their heights the world's */
  ramps?: Ramp[];
}

const xy = (p: { x: number; y: number }): XY => [p.x, p.y];

/** The building's stairs and lifts as connectors (a world map's things: world metres). Stairs with
 *  no floor above them and lifts that stop at one floor join nothing: left out. */
export function connectorsOf(map: MapDef, objects: Iterable<WorldObjectDef>): Connector[] {
  const floors = new Set(floorsOf(map));
  const out: Connector[] = [];
  const shafts = new Map<string, WorldObjectDef[]>();
  for (const o of objects) {
    const level = objLevel(o, map);
    if (o.kind === "stairs") {
      if (!floors.has(level + 1)) continue;
      const corners: XY[] = [
        [0, 0],
        [0, STAIRS_D],
        [STAIRS_W, STAIRS_D],
        [STAIRS_W, 0],
      ].map(([u, v]) => xy(stairsPoint(o, u, v)));
      const way = stairsWayUp(o);
      out.push({
        id: o.id,
        kind: "stairs",
        outline: corners,
        stops: [
          { floor: level, z: elevOf(level), thing: o.id, at: xy(stairsDoor(o)) },
          { floor: level + 1, z: elevOf(level + 1), thing: o.id, at: xy(way[way.length - 1]) },
        ],
        ramps: stairsRamps(o, elevOf(level)),
      });
    } else if (o.kind === "flight") {
      // a flight of steps up to a mezzanine (phase 11.8): its floor and the mezzanine over it
      const at = (u: number, v: number): XY => {
        let [X, Y, W, H] = [u, v, 1, 3];
        for (let i = 0; i < (quarterOf(o) & 3); i++) [X, Y, W, H] = [H - Y, X, H, W];
        return [o.x + X, o.y + Y];
      };
      const rise = flightRise(o);
      out.push({
        id: o.id,
        kind: "flight",
        outline: [at(0, 0), at(0, 3), at(1, 3), at(1, 0)],
        stops: [
          { floor: level, z: elevOf(level), thing: o.id, at: at(0.5, -0.4) },
          { floor: level, z: elevOf(level) + rise, thing: o.id, at: at(0.5, 3.4) },
        ],
      });
    } else if (o.kind === "elevator") {
      const k = String(o.props?.shaft ?? o.id);
      const list = shafts.get(k) ?? [];
      list.push(o);
      shafts.set(k, list);
    }
  }
  for (const [shaft, stops] of shafts) {
    if (stops.length < 2) continue;
    stops.sort((a, b) => objLevel(a, map) - objLevel(b, map));
    const o = stops[0];
    const { w, h } = footprint(o.kind, quarterOf(o));
    out.push({
      id: `lift:${shaft}`,
      kind: "lift",
      outline: [
        [o.x, o.y],
        [o.x, o.y + h],
        [o.x + w, o.y + h],
        [o.x + w, o.y],
      ],
      stops: stops.map((s) => {
        const level = objLevel(s, map);
        return { floor: level, z: elevOf(level), thing: s.id, at: xy(liftFront(s)) };
      }),
    });
  }
  return out;
}
