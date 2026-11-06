// The world's structure (docs/plan/72-the-3d-core.md, phase 6): what the building is made of, in
// one frame — world metres, x/y the ground plane (the land's own coords), z up — instead of a tile
// map per floor placed by its corner. Walls are segments with two faces, floors are slabs (polygons
// with holes, at a height), rooms are polygons. Saved as the world's layout version 4.
//
// Walls drawn at any angle, arcs, floors as any polygons, roofs (phase 11's free build tool); what
// was drawn in tiles — the generators', an old save's — on whole metres. Every reader asks the
// structure (query.ts): the floor under a point, a wall on the cells' edges, a floor's extent.

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
  /** the floor's extent: the cells it was laid out on, its corner (world) and size in cells — a
   *  raster's bounds (the light's, the floor's bake) */
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
  /** an arc (phase 11): how far its middle stands off the straight line a–b (m), to that line's left
   *  (+: towards (−dy, dx)); half the chord at most, a half circle. None: straight (arc.ts) */
  bow?: number;
  /** how thick (m; phase 11.4: 0.1 a partition, 0.2, 0.3 an outer wall). None: WALL_T */
  thick?: number;
}

/** A room: an outline on a floor, with everything the old area kept (name, kind, owner, lock…). */
export interface Room {
  key: string;
  floor: number;
  /** the room: the face its walls close round (faces.ts), or its rectangle where they don't */
  outline: Ring;
  /** the room's rectangle as drawn (its outline's box; an area's x, y, w, h), world: x0, y0, x1, y1 */
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
  /** roofs over closed sets of walls (phase 11.7; none in older structures) */
  roofs?: Roof[];
}

/** A roof over a closed set of walls (phase 11.7; the user's call: flat and pitched — gable, hip —
 *  now): its outline (world), the height of its eaves (m, world), its kind, how steep (degrees), and
 *  which way a gable's ridge runs (0: along the outline's long side, 1: across). */
export interface Roof {
  id: string;
  floor: number;
  outline: XY[];
  z: number;
  kind: "flat" | "gable" | "hip";
  pitch: number;
  ridge?: 0 | 1;
}
