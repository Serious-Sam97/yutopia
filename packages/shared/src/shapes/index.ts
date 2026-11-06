// Shapes in metres (docs/plan/50-the-volume.md, A): every solid thing as the boxes and cylinders
// the physics world (phase 2) builds — the catalog's kinds, the building's walls, openings and
// floors here, the Grounds' solids in ./grounds.ts. A tile is a metre; y is up from the floor
// the thing stands on. Not on the page: the 3D view and the server import it, nothing else.
//
// A kind's parts are in its own frame at rot 0 — u across its footprint (0..w), v down it
// (0..h) — and turned with it the way the art and the stairs turn things (stairs.ts
// `stairsPoint`): rot 1 puts its v = 0 side on the east, 2 south, 3 west.
import {
  entry,
  footprint,
  type ObjectKind,
  PIANO_STOOL,
  quarterOf,
  rotOf,
  standHeight,
  type WorldObjectDef,
} from "../catalog.ts";
import { SEAT_SPEC } from "../furniture.ts";
import { hangOf } from "../hang.ts";
import { type Edge, HALF_WALL, isWallEdge } from "../map.ts";
import { openingCut } from "../openings.ts";
import { topCentre } from "../tops.ts";
import { HALF_WALL_H, SLAB, STOREY, WALL_H, WALL_T } from "../units.ts";

// (the building's measures: units.ts)
export { HALF_WALL_H, SLAB, WALL_H, WALL_T };

export type { BoxPart, CylPart, KindShape, Part } from "../fam/units.ts";

import type { KindShape, Part } from "../fam/units.ts";
import { FLIGHT_RISE, flightParts, flightRise } from "../flight.ts";
import { isFreeThing } from "../free-things.ts";

/** What a body does with it: walks into it (solid), sits on it (seat: walked onto, then sat),
 *  or nothing (it's under foot, on a wall, on a table: reach and the view only). */
export type Blocks = "solid" | "seat" | "none";

/** The catalog says: solid things stop you, seats take you in, the rest (and wall items) don't. */
export function blocksOf(kind: string): Blocks {
  const e = entry(kind);
  return e.solid && !e.wall ? "solid" : e.seat ? "seat" : "none";
}

export { box, cyl } from "../fam/units.ts";

import { FAM_SHAPES } from "../fam/index.ts";
import { box, cyl, one } from "../fam/units.ts";

/** The top of a kind's parts (m): what the review compares with its stand height. */
export function topOf(parts: Part[]): number {
  return parts.reduce((t, p) => Math.max(t, p.y1), 0);
}

// ── in the world ──────────────────────────────────────────────────────────────
// What the physics world is handed: boxes by their middle and half sizes, turned `a` radians
// about y as three.js's rotation.y turns things (0: hx along x; its local +x goes to
// (cos a, −sin a): a Grounds thing's `ry` is its `a`; the catalog's quarter turns stay
// axis-aligned), and upright cylinders.
// x, z in the floor's tile coords (z = map y), y up from the floor's datum.
export interface SolidBox3 {
  t: "box";
  x: number;
  y: number;
  z: number;
  hx: number;
  hy: number;
  hz: number;
  a: number;
}
export interface SolidCyl3 {
  t: "cyl";
  x: number;
  z: number;
  r: number;
  y0: number;
  y1: number;
}
export type Solid3 = SolidBox3 | SolidCyl3;

export const box3 = (x0: number, z0: number, x1: number, z1: number, y0: number, y1: number, a = 0): SolidBox3 => ({
  t: "box",
  x: (x0 + x1) / 2,
  y: (y0 + y1) / 2,
  z: (z0 + z1) / 2,
  hx: Math.abs(x1 - x0) / 2,
  hy: Math.abs(y1 - y0) / 2,
  hz: Math.abs(z1 - z0) / 2,
  a,
});

/** A point of a footprint (u, v) at rot 0 → the floor's tile coords, turned (as stairs.ts). */
export function turnPoint(o: { x: number; y: number; rot: number }, w: number, h: number, u: number, v: number) {
  let X = u;
  let Y = v;
  let W = w;
  let H = h;
  for (let i = 0; i < ((o.rot ?? 0) & 3); i++) {
    [X, Y] = [H - Y, X];
    [W, H] = [H, W];
  }
  return { x: o.x + X, z: o.y + Y };
}

// ── the building: walls, their openings, the floors' slabs ──
/** A wall on an edge (map.ts: `ch` its char) with what's cut into it (openings.ts `wallCuts`:
 *  z0..z1 iso px). A door's hole is open; a window's holds its glass, which stops a body as the
 *  wall does — so it's the wall's sill, head and pane, the pane its own part (light and sight
 *  go through it: phase 5). */
export function wallSolids(
  e: Edge,
  ch: string,
  cut?: { kind: string; z0: number; z1: number },
): { solids: SolidBox3[]; pane?: SolidBox3 } {
  if (!isWallEdge(ch)) return { solids: [] };
  const top = ch === HALF_WALL ? HALF_WALL_H : WALL_H;
  const t = WALL_T / 2;
  const at = (y0: number, y1: number) =>
    e.dir === "h" ? box3(e.x, e.y - t, e.x + 1, e.y + t, y0, y1) : box3(e.x - t, e.y, e.x + t, e.y + 1, y0, y1);
  if (!cut) return { solids: [at(0, top)] };
  const y0 = cut.z0;
  const y1 = Math.min(top, cut.z1);
  const solids = [...(y0 > 0 ? [at(0, y0)] : []), ...(y1 < top ? [at(y1, top)] : [])];
  return entry(cut.kind).opening === "window" ? { solids, pane: at(y0, y1) } : { solids };
}

/** An opening's hole (m up from its floor): a door's way through, a window's glass. */
export function openingHole(kind: string): [number, number] {
  return openingCut(kind);
}

/** A floor's slab: its tiles' tops at `elev`, SLAB thick under them. */
export const slabSolid = (x0: number, z0: number, x1: number, z1: number, elev: number): SolidBox3 =>
  box3(x0, z0, x1, z1, elev - SLAB, elev);

// ── the catalog's kinds ───────────────────────────────────────────────────────
// Read off their 3D models (tp/model-bounds.ts measures them; shapes.test.ts in the client checks
// they still agree), simplified to what a body meets: a desk's top and legs one box, a sofa its
// seat, back and arms. Wall items in the frame of the wall they hang on (v out from its line,
// y at the lowest they hang: hang.ts lifts them); things on a surface in a 1 × 1 frame round the
// spot they're on (tops.ts), y from that surface.
const flat = (u0: number, v0: number, u1: number, v1: number, y1: number) => one(box(u0, v0, u1, v1, 0, y1));
const DOOR = "the hole's frame and leaf (art/items/walls.ts); walking through it is the wall's cut (wallSolids)";
const WINDOW = "set in a wall: the wall's sill and head and the pane between (wallSolids)";

export const SHAPES: Record<ObjectKind, KindShape> = {
  // (plan 67: seating, desks, tables and storage as the kit draws them, true scale — world/furn)
  desk: flat(0.03, 0.06, 1.97, 0.94, 0.74),
  chair: one(box(0.17, 0.17, 0.83, 0.83, 0, 0.48), box(0.2, 0.11, 0.8, 0.33, 0.48, 1.41)),
  // (plan 67 phase 7: on the wall's face, from the kit's models — world/furn/walls.ts)
  board_wall: one(box(0.06, 0.1, 2.94, 0.2, 0.48, 1.92)),
  screen_wall: one(box(0.06, 0.1, 3.94, 0.21, 0.24, 2.19)),
  whiteboard: one(box(0.08, 0.1, 1.92, 0.2, 0.55, 1.63)),
  notice_board: one(box(0.08, 0.1, 1.92, 0.16, 0.71, 1.58)),
  acoustic_panel: one(box(0.14, 0.1, 0.86, 0.18, 0.56, 1.74)),
  clock: one(box(0.32, 0.1, 0.68, 0.14, 1.14, 1.51)),
  neon: one(box(0.2, 0.1, 1.8, 0.16, 0.92, 1.63)),
  poster: one(box(0.12, 0.1, 0.88, 0.13, 0.77, 1.71)),
  light_switch: one(box(0.43, 0.1, 0.57, 0.13, 0.82, 1.15)),
  meeting_table: flat(0.04, 0.06, 5.96, 1.94, 0.74),
  coffee_table: flat(0.04, 0.04, 1.96, 0.96, 0.42),
  side_table: flat(0.09, 0.09, 0.91, 0.91, 0.55),
  bookcase: flat(0.04, 0.31, 1.96, 0.67, 1.8),
  // (plan 67 phase 8, world/furn/decor.ts: its sled feet, the thin screen on them 1.25 m up)
  partition: one(
    box(0.17, 0.33, 0.29, 0.67, 0, 0.06),
    box(1.71, 0.33, 1.83, 0.67, 0, 0.06),
    box(0.06, 0.45, 1.94, 0.55, 0, 1.27),
  ),
  // (the sink's tap stands over the right half's back)
  counter: one(box(0.02, 0.03, 2, 0.97, 0, 0.9), box(1.47, 0.13, 1.53, 0.4, 0.9, 1.2)),
  cupboard: flat(0.04, 0.1, 0.96, 0.9, 0.85),
  locker: flat(0.1, 0.24, 0.9, 0.79, 1.85),
  sofa: one(box(0.25, 0.05, 2.75, 0.95, 0, 0.46), box(0.25, 0.05, 2.75, 0.36, 0.46, 0.89)),
  armchair: one(box(0.05, 0.02, 0.95, 0.93, 0, 0.6), box(0.05, 0.02, 0.95, 0.35, 0.6, 0.86)),
  beanbag: flat(0.08, 0.08, 0.92, 0.92, 0.45),
  bench: flat(0.08, 0.28, 2.92, 0.72, 0.45),
  plant: { parts: [box(0.19, 0.19, 0.81, 0.81, 0, 0.57)], odd: "the pot only: its leaves are walked through" },
  lamp: {
    parts: [cyl(0.5, 0.5, 0.22, 0, 1.69)],
    odd: "its foot and pole: the arc lamp's head, 1.6–2 m up over the next tile, is walked under or past (one shape a kind: a box there stood beside every drum lamp too)",
  },
  rug: flat(-0.12, 0, 4.12, 3, 0.04),
  // (plan 67 phase 6: at true scale, from the kit's models — world/furn/play.ts)
  arcade: flat(0.14, 0.08, 0.86, 0.93, 1.8),
  radio: one(box(0.29, 0.41, 0.71, 0.59, 0, 0.24), box(0.24, 0.36, 0.33, 0.44, 0.24, 0.53)),
  tape_shelf: flat(0.04, 0.31, 1.96, 0.67, 1.12),
  water_cooler: flat(0.32, 0.32, 0.76, 0.75, 1.43),
  vending: flat(0.07, 0.12, 0.93, 0.92, 1.8),
  // (and its stool out in front: catalog PIANO_STOOL, 0.62 × 0.3, the stool's seat — docs/plan/62)
  piano: one(
    // (the case to its top, the keybed in front of it at the keys' height: furniture.ts HANDS_AT)
    box(0.17, 0.07, 1.83, 0.46, 0, 1.27),
    box(0.17, 0.46, 1.83, 0.81, 0, 0.76),
    box(
      PIANO_STOOL[0] - 0.31,
      PIANO_STOOL[1] - 0.15,
      PIANO_STOOL[0] + 0.31,
      PIANO_STOOL[1] + 0.15,
      0,
      SEAT_SPEC.stool.top,
    ),
  ),
  // (the cabinet first — its top is where one stands — then the stand under it, wider and low, the
  // tube's neck behind; its rabbit ears aren't solid: stood among, a body slid off their tips)
  crt_tv: {
    parts: [
      box(0.41, 0.42, 1.53, 0.8, 0.42, 1.13),
      box(0.3, 0.24, 1.7, 0.8, 0, 0.42),
      box(0.52, 0.23, 1.28, 0.42, 0.42, 1.07),
    ],
    odd: "its rabbit ears (to 1.49 m) brushed past",
  },
  tv_wall: one(box(0.17, 0.1, 0.79, 0.44, 1.31, 1.94)),
  tv_hd: one(box(0.18, 0.1, 2.82, 0.17, 0.68, 2.01)),
  projector_screen: one(box(0.02, 0.1, 2.98, 0.21, 0.44, 2.18)),
  tv_giant: one(box(0.33, 0.1, 4.67, 0.17, 0.68, 2.95)),
  cinema_screen: flat(0.05, 0.04, 5.95, 0.18, 3.2),
  projector: flat(0.34, 0.36, 0.66, 0.68, 0.11),
  tv_console: flat(0.07, 0.25, 1.93, 0.89, 1.17),
  computer: flat(0.28, 0.29, 0.72, 0.73, 0.5),
  tv_portable: one(box(0.25, 0.42, 0.75, 0.71, 0, 0.44), box(0.68, 0.4, 0.82, 0.52, 0.44, 0.62)),
  console_2600: flat(0.26, 0.44, 0.74, 0.74, 0.09),
  console_nes: flat(0.27, 0.42, 0.73, 0.74, 0.09),
  console_snes: flat(0.29, 0.44, 0.71, 0.74, 0.09),
  console_md: flat(0.29, 0.44, 0.71, 0.74, 0.1),
  console_gb: flat(0.27, 0.57, 0.73, 0.74, 0.18),
  cart_shelf: flat(0.06, 0.26, 1.94, 0.74, 0.8),
  console_ps1: flat(0.27, 0.38, 0.73, 0.74, 0.12),
  console_ps1_slim: flat(0.28, 0.31, 0.73, 0.73, 0.45),
  disc_rack: flat(0.27, 0.35, 0.73, 0.68, 1.38),
  slot_track: {
    parts: [
      box(0, 0, 4, 3, 0, 0.77),
      box(0.76, 0, 3.14, 0.2, 0.77, 1.15),
      box(3.4, 0.06, 3.84, 0.26, 0.77, 1.33),
      cyl(0.42, 0.08, 0.03, 0.77, 1.51),
    ],
    odd: "the board, and on it along the back the grandstand, the lap tower and the floodlight's mast",
  },
  pool_table: flat(0.23, 0, 3.93, 2, 0.86),
  pingpong_table: one(box(0.27, 0, 3.73, 2, 0, 0.76), box(1.97, -0.17, 2.03, 2.17, 0.76, 0.95)),
  turntable: flat(0.27, 0.32, 0.73, 0.68, 0.13),
  coffee_machine: flat(0.34, 0.33, 0.66, 0.76, 0.47),
  reception: one(box(0.02, 0.05, 2.98, 0.68, 0, 0.74), box(0.02, 0.68, 2.98, 1, 0, 1.05)),
  mic_stand: one(cyl(0.5, 0.5, 0.28, 0, 0.3), cyl(0.5, 0.5, 0.05, 0.3, 1.3), box(0.43, 0.25, 0.57, 0.99, 1.12, 1.56)),
  mixing_desk: one(box(0, 0.16, 3, 0.97, 0, 0.84), box(0, 0.16, 3, 0.42, 0.84, 1.18)),
  standup_mat: flat(0.15, 0.15, 3.85, 3.85, 0.03),
  door: { parts: [], odd: DOOR },
  door_double: { parts: [], odd: DOOR },
  door_studio: { parts: [], odd: `${DOOR}; its ON AIR lamp over it to 2.73 m` },
  door_barn: { parts: [], odd: `${DOOR}; the leaf rolls along the wall's face` },
  door_saloon: { parts: [], odd: `${DOOR}; the leaves swing as people pass (never shut to anyone)` },
  archway: { parts: [], odd: "a doorway with no door: the wall's cut, always open" },
  door_auto: { parts: [], odd: DOOR },
  door_revolving: { parts: [], odd: DOOR },
  door_garage: { parts: [], odd: DOOR },
  window: { parts: [], odd: WINDOW },
  window_wide: { parts: [], odd: WINDOW },
  window_tall: { parts: [], odd: WINDOW },
  window_round: { parts: [], odd: `${WINDOW}; round, its hole the square round it` },
  window_arched: { parts: [], odd: `${WINDOW}; its arch's hole the square round it` },
  window_high: { parts: [], odd: WINDOW },
  window_stained: { parts: [], odd: WINDOW },
  window_blinds: { parts: [], odd: WINDOW },
  window_studio: { parts: [], odd: WINDOW },
  speaker_cab: flat(0.17, 0.17, 0.83, 0.83, 1.17),
  column: flat(0.2, 0.2, 0.8, 0.8, 2.14),
  // (9 steps a flight as stairs3d.ts draws them: treads two risers thick — the flight below walks
  // under the next floor's — the half landing, flight B's treads, the spine between the flights)
  stairs: {
    parts: [
      ...Array.from({ length: 9 }, (_, i) =>
        box(2.05, 2 + i / 3, 3.95, 2 + (i + 1) / 3, Math.max(0, ((i - 1) * STOREY) / 18), ((i + 1) * STOREY) / 18),
      ),
      box(0, 5, 4, 7, STOREY / 2 - 0.22, STOREY / 2),
      ...Array.from({ length: 9 }, (_, i) =>
        box(
          0.05,
          5 - (i + 1) / 3,
          1.95,
          5 - i / 3,
          STOREY / 2 + (i * STOREY) / 18,
          STOREY / 2 + ((i + 1) * STOREY) / 18,
        ),
      ),
      box(1.95, 2, 2.05, 5, 0, STOREY / 2 + 0.95),
    ],
    odd: "drawn by Stairs3 (canvases), not measured; the well's walls are edges (stairs.ts); phase 6 decides",
  },
  flight: {
    parts: flightParts(FLIGHT_RISE),
    odd: "its rise is its own (props.rise, a mezzanine's height — plan 72 phase 11.8): kindSolids makes its treads from it",
  },
  elevator: {
    parts: [box(0.06, 0, 1.94, 1.94, 0, 0.1)],
    odd: "a moving platform (lift3d, the server's car): its floor here; the shaft's walls are edges (lift.ts); phase 6",
  },
  car: {
    parts: [box(0, 0.06, 5, 1.94, 0, 0.85), box(1.75, 0.3, 3.75, 1.7, 0.85, 1.48)],
    odd: "the lot's cars are vehicles now (car/park.ts boxes, kinematic in phase 2): this is the stored kind",
  },
  bayboard: one(box(0.46, 0.46, 0.55, 0.55, 0, 1.2), box(0.46, -0.06, 0.59, 1.06, 1.2, 1.95)),
  lamp_post: {
    parts: [cyl(0.5, 0.5, 0.16, 0, 8.9), box(0.44, 0.34, 2.56, 0.66, 8.57, 8.9)],
    odd: "its arm reaches 2 m past its tile, 8.5 m up",
  },
  server_rack: flat(0.1, 0.12, 0.91, 0.91, 1.98),
  // (the terminal first — a body jumped up stands on it, the cart's free edge too narrow — its cart)
  crt_terminal: one(box(0.23, 0.17, 0.77, 0.66, 0, 1.16), box(0.04, 0.15, 0.96, 0.91, 0, 0.72)),
  decor: {
    parts: [box(0.25, 0.26, 0.75, 0.75, 0, 0.57)],
    odd: "a plant's pot; boxes, a bin and a cable each their own (DECOR_PARTS, by props.d)",
  },
  tabletop: {
    parts: [box(0.455, 0.455, 0.58, 0.545, 0, 0.1)],
    odd: "one box for all it can be (a mug… a book): the mug's (plan 67's, its handle)",
  },
  frame: one(box(0.28, 0.1, 0.72, 0.14, 1.02, 1.53)),
  pet_bed: flat(0.04, 0.04, 0.96, 0.96, 0.21),
  pet_bowl: flat(0.365, 0.365, 0.635, 0.635, 0.08),
  water_bowl: flat(0.365, 0.365, 0.635, 0.635, 0.08),
  scratch_post: one(
    box(0.2, 0.2, 0.8, 0.8, 0, 0.05),
    cyl(0.5, 0.5, 0.07, 0.05, 0.85),
    box(0.28, 0.28, 0.72, 0.72, 0.85, 0.9),
  ),
  // (the roof's ridge first — a body jumped up stands on it — its walls to the eaves, the mat)
  pet_house: one(
    box(0.3, 0.06, 0.7, 0.9, 0, 0.72),
    box(0.1, 0.1, 0.9, 0.86, 0, 0.46),
    box(0.32, 0.86, 0.68, 0.98, 0, 0.01),
  ),
  toy_box: flat(0.14, 0.24, 0.86, 0.76, 0.5),
  // parkour (art/items/parkour.ts): a rail one thin box to its top (ground along: physics/flow.ts
  // takes a rail ≤ 0.13 m half thick), a wall a slab, a pole a rod
  // the office staples (plan 67 phase 8b, world/furn/staples.ts: from the models)
  standing_desk: flat(0.05, 0.07, 1.95, 0.93, 1.05),
  filing_cabinet: flat(0.26, 0.14, 0.74, 0.98, 1.32), // (a drawer always left out)
  printer: one(box(0.19, 0.21, 0.81, 0.81, 0, 1.0), box(0.6, 0.66, 0.84, 0.86, 1.0, 1.12)),
  shelving: flat(0.05, 0.3, 1.95, 0.7, 1.2),
  fridge: flat(0.17, 0.14, 0.83, 0.85, 1.82),
  microwave: flat(0.26, 0.32, 0.74, 0.7, 0.28),
  bar_stool: one(cyl(0.5, 0.5, 0.2, 0, 0.76)),
  high_table: one(cyl(0.5, 0.5, 0.24, 0, 0.04), cyl(0.5, 0.5, 0.04, 0.04, 1.02), cyl(0.5, 0.5, 0.38, 1.02, 1.05)),
  phone_booth: {
    parts: [
      box(0, 0, 1, 0.06, 0, 2.24),
      box(0, 0, 0.06, 1, 0, 2.24),
      box(0.94, 0, 1, 1, 0, 2.24),
      box(0.1, 0.06, 0.9, 0.56, 0, 0.46),
    ],
    odd: "a seat: its walls on three sides and the bench inside, the front left open",
  },
  coat_rack: {
    parts: [cyl(0.5, 0.5, 0.19, 0, 0.3), cyl(0.5, 0.5, 0.12, 0.3, 1.85)],
    odd: "its feet and post: the coat and scarf on its hooks are brushed past",
  },
  wall_shelf: one(box(0.2, 0.1, 1.8, 0.34, 1.26, 1.71)),
  pendant_light: { parts: [box(0.3, 0.3, 0.7, 0.7, 2.3, 3.27)], odd: "hung from the ceiling, over heads" },
  panel_light: { parts: [box(0.19, 0.19, 0.81, 0.81, 3.24, 3.27)], odd: "set in the ceiling" },
  // plan 68's heroes (world/furn: seating.ts, decor.ts, desktop.ts)
  loveseat: one(box(0.18, 0.08, 1.82, 0.92, 0, 0.455), box(0.18, 0.08, 1.82, 0.32, 0.455, 0.91)),
  // (the mantel and the firebox's front first — its shelf is where things stand — then the chimney
  // breast up the wall behind, the hearth's slab)
  fireplace: one(
    box(0.1, 0.46, 1.9, 0.68, 0, 1.15),
    box(0.15, 0.1, 1.85, 0.46, 0, 2.0),
    box(0.03, 0.68, 1.9, 0.92, 0, 0.06),
  ),
  lava_lamp: one(box(0.415, 0.415, 0.585, 0.585, 0, 0.45)),
  marquee_sign: one(box(0.1, 0.1, 2.9, 0.2, 1.52, 2.23)),
  vfd_ticker: one(box(0.15, 0.1, 1.85, 0.18, 1.94, 2.16)),
  split_flap: one(box(0.1, 0.1, 2.9, 0.19, 1.44, 2.12)),
  // plan 68 phase 2: Christmas (world/furn/xmas.ts)
  xmas_tree: {
    parts: [cyl(1, 1, 0.85, 0, 1.0), cyl(1, 1, 0.5, 1.0, 2.38)],
    odd: "its lower tiers, then the top: you go round a tree",
  },
  xmas_tree_small: one(box(0.34, 0.34, 0.66, 0.66, 0, 0.5)),
  present: {
    parts: [box(0.2, 0.28, 0.82, 0.86, 0, 0.28)],
    odd: "set down as its seed has them: the boxes they all cover",
  },
  stocking: one(box(0.37, 0.1, 0.7, 0.19, 0.66, 1.32)),
  wreath: one(box(0.11, 0.1, 0.9, 0.32, 1.16, 2.0)),
  garland: one(box(0.03, 0.08, 2.97, 0.32, 1.9, 2.33)),
  mistletoe: { parts: [box(0.4, 0.4, 0.6, 0.6, 2.25, 3.27)], odd: "hung from the ceiling, over heads" },
  cocoa_station: one(box(0.02, 0.09, 1.98, 0.91, 0, 0.9), box(0.28, 0.31, 0.56, 0.59, 0.9, 1.37)),
  gingerbread_house: one(box(0.34, 0.37, 0.66, 0.63, 0, 0.22)),
  xmas_village: one(box(0.2, 0.25, 0.8, 0.75, 0, 0.23)),
  nutcracker: one(cyl(0.5, 0.5, 0.19, 0, 1.3)),
  candle_arch: one(box(0.28, 0.47, 0.72, 0.53, 0, 0.27)),
  poinsettia: { parts: [cyl(0.5, 0.5, 0.15, 0, 0.24)], odd: "its pot only: the leaves brushed past" },
  advent_calendar: {
    parts: [box(0.05, 0.1, 0.95, 0.19, 1.15, 1.96)],
    odd: "its board: in December the doors up to today swing open a hand out",
  },
  wrapping_table: one(box(0.05, 0.09, 1.95, 0.9, 0, 0.9), box(0.04, 0.1, 1.96, 0.19, 0.9, 1.48)),
  candy_cane: { parts: [cyl(0.5, 0.5, 0.06, 0, 1.05)], odd: "the cane: its hook and its drift of snow brushed past" },
  reindeer: one(box(0.27, 0.35, 1.91, 0.65, 0, 1.8)),
  sleigh: one(
    box(0.14, 0.1, 2.93, 0.9, 0, 0.62),
    box(0.22, 0.19, 0.6, 0.81, 0.62, 1.17),
    box(2.45, 0.19, 2.78, 0.81, 0.62, 1.18),
  ),
  inflatable_snowman: one(box(0.02, 0.12, 0.98, 0.94, 0, 1.93)),
  snow_globe: one(cyl(1, 1, 0.86, 0, 2.16)),
  pk_rail: one(box(0, 0.45, 4, 0.55, 0, 0.9)),
  pk_rail_long: one(box(0, 0.45, 8, 0.55, 0, 0.9)),
  pk_wall: one(box(0, 0.35, 4, 0.65, 0, 3.2)),
  pk_wall_tall: one(box(0, 0.35, 4, 0.65, 0, 6)),
  pk_pole: one(box(0.3, 0.3, 0.7, 0.7, 0, 0.04), cyl(0.5, 0.5, 0.08, 0.04, 3)),
  pk_pole_tall: one(box(0.3, 0.3, 0.7, 0.7, 0, 0.04), cyl(0.5, 0.5, 0.08, 0.04, 5.5)),
  // (plan 68's families: fam/*.ts)
  ...FAM_SHAPES,
};

/** A kind's shape (a run-time kind with none: its footprint, 1 m, flagged). */
export function shapeOf(kind: string): KindShape {
  if (kind in SHAPES) return SHAPES[kind as ObjectKind];
  const { w, h } = footprint(kind);
  return { parts: [box(0, 0, w, h, 0, 1)], odd: "no shape of its own: its footprint, 1 m" };
}

/** Where a placed thing's parts are drawn from: its frame's corner, turn, size and lift (m). */
export function frameOf(o: WorldObjectDef): { x: number; y: number; rot: number; w: number; h: number; lift: number } {
  const e = entry(o.kind);
  if (e.wall) {
    const h = hangOf(o);
    return { x: h.ax, y: h.ay, rot: h.rot, w: e.w, h: e.h, lift: h.lift };
  }
  if (e.onSurface) {
    const c = topCentre(o);
    return { x: c.x - 0.5, y: c.y - 0.5, rot: rotOf(o), w: 1, h: 1, lift: Number(o.props?.z) || 0 };
  }
  return { x: o.x, y: o.y, rot: quarterOf(o), w: e.w, h: e.h, lift: 0 };
}

/** A placed thing's solids in its floor's coords, `elev` m up (its storey). Doors and windows
 *  have none: they're their walls' cuts (wallSolids). */
/** What `decor` is by props.d (plan 67, world/furn/decor.ts): a plant's pot (the kind's own shape),
 *  a stack of boxes, a round bin, a cable coiled on the floor (stepped over). */
const DECOR_PARTS: Record<string, Part[]> = {
  boxes: [box(0.18, 0.2, 0.78, 0.75, 0, 0.62)],
  bin: [cyl(0.5, 0.5, 0.19, 0, 0.38)],
  cable: [box(0.34, 0.33, 0.86, 0.68, 0, 0.03)],
};
export function kindSolids(o: WorldObjectDef, elev = 0): Solid3[] {
  const f = frameOf(o);
  const parts =
    (o.kind === "decor" && DECOR_PARTS[String(o.props?.d)]) ||
    (o.kind === "flight" && flightParts(flightRise(o))) ||
    shapeOf(o.kind).parts;
  // (placed free — plan 72 phase 11.9: its parts laid out from its middle and turned by its yaw)
  if (isFreeThing(o)) {
    const e = entry(o.kind);
    const [c, s] = [Math.cos(o.yaw ?? 0), Math.sin(o.yaw ?? 0)];
    const at = (u: number, v: number) => {
      const [du, dv] = [u - e.w / 2, v - e.h / 2];
      return { x: o.x + du * c - dv * s, z: o.y + du * s + dv * c };
    };
    return parts.map((p): Solid3 => {
      if (p.t === "cyl") {
        const q = at(p.u, p.v);
        return { t: "cyl", x: q.x, z: q.z, r: p.r, y0: elev + p.y0, y1: elev + p.y1 };
      }
      const q = at((p.u0 + p.u1) / 2, (p.v0 + p.v1) / 2);
      return {
        t: "box",
        x: q.x,
        y: elev + (p.y0 + p.y1) / 2,
        z: q.z,
        hx: Math.abs(p.u1 - p.u0) / 2,
        hy: (p.y1 - p.y0) / 2,
        hz: Math.abs(p.v1 - p.v0) / 2,
        a: -(o.yaw ?? 0),
      };
    });
  }
  return parts.map((p) => {
    if (p.t === "cyl") {
      const c = turnPoint(f, f.w, f.h, p.u, p.v);
      return { t: "cyl", x: c.x, z: c.z, r: p.r, y0: elev + f.lift + p.y0, y1: elev + f.lift + p.y1 };
    }
    const a = turnPoint(f, f.w, f.h, p.u0, p.v0);
    const b = turnPoint(f, f.w, f.h, p.u1, p.v1);
    const y0 = elev + f.lift;
    return box3(Math.min(a.x, b.x), Math.min(a.z, b.z), Math.max(a.x, b.x), Math.max(a.z, b.z), y0 + p.y0, y0 + p.y1);
  });
}

/** Odd by the numbers: a top that isn't where the jump table stands you (more than 8 cm off) —
 *  its first part's (the body of it: a counter's, not its tap's). */
export function standOff(kind: ObjectKind): number | null {
  const st = standHeight(kind);
  const [body] = SHAPES[kind].parts;
  if (st === undefined || !body) return null;
  const top = body.y1;
  const d = top - st;
  return Math.abs(d) > 0.08 ? +d.toFixed(2) : null;
}

/** How high a body steps up without a jump: the bench's CharacterVirtual (tools/physics-bench,
 *  mWalkStairsStepUp); phase 3 settles it. Solid things lower than this get walked onto. */
export const STEP_UP = 0.35;

/** Everything odd about a kind, for the review: the table's note and what the numbers say. */
export function flagsOf(kind: ObjectKind): string[] {
  const out: string[] = [];
  const s = SHAPES[kind];
  if (s.odd) out.push(s.odd);
  const d = standOff(kind);
  if (d !== null) out.push(`its top is ${Math.abs(d)} m ${d > 0 ? "over" : "under"} where the jump table stands you`);
  const top = topOf(s.parts);
  if (blocksOf(kind) === "solid" && top < STEP_UP)
    out.push(`solid but ${top} m high: under the ${STEP_UP} m step, a body walks onto it`);
  return out;
}
