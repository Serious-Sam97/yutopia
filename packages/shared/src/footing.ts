// What the feet are on, as the steps hear it (docs/plan/63-the-steps.md, phase 1): one of the
// steps' surfaces, each a set of recordings (public/sfx/steps). From what's under the feet — a
// floor's tile, a rug on it, the furniture or a car stood on, the Grounds' land and the things on
// it — at the feet's own height (Jolt says what's stood on: the client's tp underfoot). The page's
// tables: the Grounds' side (their surfaces, buildings and things) is grounds.ts footingAt and
// whatFooting, loaded with them — nothing of the Grounds imports from here but its type (a module
// on the page and in their chunk splits it: docs/plan/63, phase 1).
import type { GroundWhat } from "./shapes/grounds.ts";

export const FOOTINGS = [
  "wood",
  "hollow",
  "carpet",
  "tile",
  "concrete",
  "rock",
  "asphalt",
  "grate",
  "sheet",
  "earth",
  "felt",
  "snow",
  "deep",
  "packed",
  "ice",
  "slush",
  "blackice",
  // (the green's and the rain's — docs/plan/65, W5: the grass, a trail or the woods' floor soaked,
  // a wet road)
  "grass",
  "mud",
  "wet",
] as const;
export type Footing = (typeof FOOTINGS)[number];

/** A floor's tile (map.ts FLOORS' chars): the stage hollow boards, the booths' felt a carpet's. */
export const TILE_FOOTING: Record<string, Footing> = {
  ".": "wood",
  ",": "carpet",
  _: "tile",
  "~": "hollow",
  ":": "carpet",
  x: "grate",
  a: "asphalt",
  c: "concrete",
};

/** Lying flat on a floor: what's walked on over its tile. */
export const MATS: Record<string, Footing> = { rug: "carpet", standup_mat: "carpet" };

// stood on (catalog.ts standHeight): wood unless said
const KINDS: Record<string, Footing> = {
  arcade: "sheet",
  vending: "sheet",
  server_rack: "sheet",
  crt_terminal: "sheet",
  cart_shelf: "sheet",
  car: "sheet",
  pool_table: "felt",
  column: "concrete",
  pk_wall: "concrete",
  pk_wall_tall: "concrete",
  stairs: "concrete",
  speaker_cab: "hollow",
  piano: "hollow",
};
/** A thing in the building stood on (its catalog kind). */
export const kindFooting = (kind: string): Footing => MATS[kind] ?? KINDS[kind] ?? "wood";

/** What's stood on, by what Jolt hit (the client's tp underfoot: a static's key — `grounds:` its
 *  thing's kind, `grounds` its footing: whatFooting, with the Grounds — a car's id, "land"), or null:
 *  the floor's or the land's, as the caller has it. */
export function keyFooting(
  on: string,
  thing: (id: string) => string | undefined,
  grounds: (what: GroundWhat) => Footing,
): Footing | null {
  const i = on.indexOf(":");
  const k = i < 0 ? on : on.slice(0, i);
  switch (k) {
    case "grounds":
      return grounds(on.slice(i + 1) as GroundWhat);
    case "thing": {
      const kind = thing(on.slice(i + 1));
      return kind ? kindFooting(kind) : "wood";
    }
    case "car":
      return "sheet";
    case "lift":
      return "tile";
    case "roof":
    case "wall":
      return "concrete";
    case "clutter":
    case "door":
      return "wood";
    default:
      return null;
  }
}
