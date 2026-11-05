// The world's structure (docs/plan/72-the-3d-core.md, phase 6): what the building is made of, in
// one frame — world metres, x/y the ground plane (the land's own coords), z up — instead of a tile
// map per floor placed by its corner. Walls are segments with two faces, floors are slabs (polygons
// with holes, at a height), rooms are polygons. Saved as the world's layout version 4.
//
// Today every piece still lies on whole metres and walls run along x or y (the tile build tool
// makes them); phase 11's tool frees them. `Floor.grid` and the edge chars are what the adapter
// (to-map.ts) needs to give the not-yet-ported code its tile maps back; phase 11 deletes both.

/** A point on the ground plane (world metres). */
export type XY = [number, number];
/** A closed polygon (its last point joins its first). An outline and its holes wind opposite ways
 *  (rings.ts); read by even-odd, the way doesn't matter. */
export type Ring = XY[];

export const STRUCTURE_VERSION = 4;

export interface Floor {
  /** the old floor number: a working height for the build tool and the HUD's label */
  index: number;
  name: string;
  /** its floor's height (m, world): the slab tops */
  z: number;
  /** open sky (the parking lot): no ceiling, snow falls */
  outdoor?: boolean;
  /** where someone arriving on this floor stands (world) */
  spawn?: XY;
  /** (adapter only — phase 11 deletes it) the tile grid this floor was drawn on: its corner (world)
   *  and size in tiles */
  grid: { x0: number; y0: number; w: number; h: number };
}

/** A floor surface: one material, an outline with holes, at its floor's height. */
export interface Slab {
  id: string;
  floor: number;
  z: number;
  /** its top (the old floor char: "." wood, "," carpet, "_" tile, …) */
  top: string;
  outline: Ring;
  holes: Ring[];
}

/** A wall: a segment from `a` to `b` standing on `base` (m), `height` tall, centred on its line. */
export interface Wall {
  id: string;
  floor: number;
  a: XY;
  b: XY;
  base: number;
  height: number;
  /** what it's made of, as the old edge char: a material ("p" plaster, "w" walnut, "f" foam, "b"
   *  brick, "k" cork, "g" glass), upper case with a painted window, "h" a half wall — the face
   *  on its +y side (a wall along x) or +x side (along y) */
  front: string;
  /** the other face's material, when it isn't the front's (opaque faced walls only) */
  back?: string;
}

/** A room: an outline on a floor, with everything the old area kept (name, kind, owner, lock…). */
export interface Room {
  key: string;
  floor: number;
  /** the room: the face its walls close round (faces.ts), or its rectangle where they don't */
  outline: Ring;
  /** (adapter only — phase 11 deletes it) the old area's rectangle, world: x0, y0, x1, y1 */
  rect: [number, number, number, number];
  /** the rest of the old area, as it was (name, kind, priority, owner, dressing…) */
  props: Record<string, unknown>;
}

export interface Structure {
  version: typeof STRUCTURE_VERSION;
  key: string;
  name: string;
  /** the home floor (the studio): the old map's own */
  home: number;
  /** the world's arrival point (world) */
  spawn: XY;
  /** where the building's core stands (its stairs and elevators), world */
  core?: XY;
  floors: Floor[];
  slabs: Slab[];
  walls: Wall[];
  rooms: Room[];
}
