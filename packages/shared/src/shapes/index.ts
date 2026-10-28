// Shapes in metres (docs/plan/50-the-volume.md, A): every solid thing as the boxes and cylinders
// the physics world (phase 2) builds — the catalog's kinds, the building's walls, openings and
// floors here, the Grounds' solids in ./grounds.ts. A tile is a metre; y is up from the floor
// the thing stands on. Not on the page: the 3D view and the server import it, nothing else.
//
// A kind's parts are in its own frame at rot 0 — u across its footprint (0..w), v down it
// (0..h) — and turned with it the way the art and the stairs turn things (stairs.ts
// `stairsPoint`): rot 1 puts its v = 0 side on the east, 2 south, 3 west.
import { entry, footprint, type ObjectKind, rotOf, standHeight, type WorldObjectDef } from "../catalog.ts";
import { hangOf } from "../hang.ts";
import { STOREY } from "../levels.ts";
import { type Edge, HALF_WALL, isWallEdge } from "../map.ts";
import { openingCut } from "../openings.ts";
import { topCentre } from "../tops.ts";

/** Iso px of height a metre (the art's ZPX: 45.25 · cos 30°). */
export const PX_PER_M = 39.19;
export const m = (px: number): number => +(px / PX_PER_M).toFixed(3);

export const WALL_H = m(128); // 3.266
export const WALL_T = 0.2; // as grid.ts WALL_T: centred on its edge
export const HALF_WALL_H = m(34);
/** The slab under each storey's floor: what's left of a storey over its walls. */
export const SLAB = +(STOREY - WALL_H).toFixed(3);

/** A box, axis-aligned in its thing's frame: u, v across and down the footprint, y up. */
export interface BoxPart {
  t: "box";
  u0: number;
  v0: number;
  u1: number;
  v1: number;
  y0: number;
  y1: number;
}
/** An upright cylinder: its axis at (u, v), radius r, from y0 to y1. */
export interface CylPart {
  t: "cyl";
  u: number;
  v: number;
  r: number;
  y0: number;
  y1: number;
}
export type Part = BoxPart | CylPart;

/** What a body does with it: walks into it (solid), sits on it (seat: walked onto, then sat),
 *  or nothing (it's under foot, on a wall, on a table: reach and the view only). */
export type Blocks = "solid" | "seat" | "none";

export interface KindShape {
  parts: Part[];
  /** something's odd about it (the review page lists these): why */
  odd?: string;
}

/** The catalog says: solid things stop you, seats take you in, the rest (and wall items) don't. */
export function blocksOf(kind: string): Blocks {
  const e = entry(kind);
  return e.solid && !e.wall ? "solid" : e.seat ? "seat" : "none";
}

// ── part makers (metres; from the footprint's corner) ──
export const box = (u0: number, v0: number, u1: number, v1: number, y0: number, y1: number): BoxPart => ({
  t: "box",
  u0,
  v0,
  u1,
  v1,
  y0,
  y1,
});
export const cyl = (u: number, v: number, r: number, y0: number, y1: number): CylPart => ({
  t: "cyl",
  u,
  v,
  r,
  y0,
  y1,
});

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
export function turnPoint(o: { x: number; y: number; rot?: number }, w: number, h: number, u: number, v: number) {
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
  const y0 = m(cut.z0);
  const y1 = Math.min(top, m(cut.z1));
  const solids = [...(y0 > 0 ? [at(0, y0)] : []), ...(y1 < top ? [at(y1, top)] : [])];
  return entry(cut.kind).opening === "window" ? { solids, pane: at(y0, y1) } : { solids };
}

/** An opening's hole (m up from its floor): a door's way through, a window's glass. */
export function openingHole(kind: string): [number, number] {
  const [z0, z1] = openingCut(kind);
  return [m(z0), m(z1)];
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
const one = (...parts: Part[]) => ({ parts });
const flat = (u0: number, v0: number, u1: number, v1: number, y1: number) => one(box(u0, v0, u1, v1, 0, y1));
const DOOR = "the hole's frame and leaf (art/items/walls.ts); walking through it is the wall's cut (wallSolids)";
const WINDOW = "set in a wall: the wall's sill and head and the pane between (wallSolids)";

export const SHAPES: Record<ObjectKind, KindShape> = {
  desk: flat(0, 0.06, 2, 0.94, 0.64),
  chair: one(box(0.18, 0.1, 0.82, 0.82, 0, 0.5), box(0.18, 0.03, 0.82, 0.22, 0.5, 0.94)),
  board_wall: one(box(0.06, 0.04, 3, 0.24, 0.48, 1.93)),
  screen_wall: one(box(0.06, 0.04, 4, 0.18, 0.26, 2.19)),
  whiteboard: one(box(0.08, 0.04, 1.98, 0.24, 0.54, 1.63)),
  notice_board: one(box(0.08, 0.04, 1.98, 0.16, 0.64, 1.58)),
  acoustic_panel: one(box(0.14, 0.04, 0.92, 0.15, 0.48, 1.74)),
  clock: one(box(0.3, 0.1, 0.7, 0.14, 1.11, 1.55)),
  neon: one(box(0.2, 0.08, 1.8, 0.13, 0.92, 1.63)),
  poster: one(box(0.12, 0.04, 0.94, 0.15, 0.69, 1.72)),
  light_switch: one(box(0.43, 0.07, 0.57, 0.11, 0.82, 1.15)),
  meeting_table: flat(0, 0, 6, 2, 0.65),
  coffee_table: flat(0.04, 0.1, 1.96, 0.9, 0.33),
  side_table: flat(0.18, 0.18, 0.82, 0.82, 0.36),
  bookcase: flat(0.04, 0.22, 1.96, 0.81, 1.58),
  partition: flat(0.06, 0.36, 1.94, 0.64, 1.14),
  // (the sink's tap stands over the right half's back)
  counter: one(box(0, 0.06, 2, 0.94, 0, 0.67), box(1.45, 0.15, 1.55, 0.34, 0.67, 0.87)),
  cupboard: flat(0.04, 0.1, 0.96, 0.9, 0.66),
  locker: flat(0.1, 0.2, 0.9, 0.8, 1.53),
  sofa: one(
    box(0.04, 0.1, 3, 0.92, 0, 0.45),
    box(0.04, 0.1, 3, 0.4, 0.45, 0.84),
    box(0.04, 0.4, 0.3, 0.92, 0.45, 0.6),
    box(2.74, 0.4, 3, 0.92, 0.45, 0.6),
  ),
  armchair: one(box(0.08, 0.1, 0.92, 0.92, 0, 0.52), box(0.08, 0.1, 0.92, 0.3, 0.52, 0.79)),
  beanbag: flat(0.1, 0.12, 0.9, 0.92, 0.39),
  bench: flat(0.04, 0.26, 2.96, 0.74, 0.3),
  plant: { parts: [box(0.19, 0.19, 0.81, 0.81, 0, 0.57)], odd: "the pot only: its leaves are free-hand cards" },
  lamp: {
    parts: [cyl(0.5, 0.5, 0.22, 0, 1.82), box(-0.17, 0.3, 0.12, 0.7, 1.3, 1.62)],
    odd: "the arc lamp's head reaches 0.17 m past its tile",
  },
  rug: flat(-0.12, 0, 4.12, 3, 0.04),
  arcade: flat(0.14, 0.18, 0.86, 0.94, 1.43),
  radio: flat(0.12, 0.3, 0.88, 0.71, 0.48),
  tape_shelf: flat(0, 0.2, 2, 0.81, 1.17),
  water_cooler: flat(0.26, 0.28, 0.84, 0.73, 1.3),
  vending: flat(0.1, 0.16, 0.9, 0.87, 1.58),
  piano: flat(0.06, 0.08, 1.94, 0.84, 1.12),
  crt_tv: flat(0.06, 0.1, 1.94, 0.91, 1.25),
  tv_wall: one(box(0.16, 0.06, 0.86, 0.43, 0.15, 1.99)),
  tv_hd: one(box(0.12, 0.05, 2.94, 0.18, 0.43, 2.07)),
  projector_screen: one(box(0.08, 0.05, 2.92, 0.17, 0.43, 2.19)),
  tv_giant: one(box(0.04, 0.05, 4.96, 0.21, 0.43, 3.01)),
  cinema_screen: one(box(0.01, 0.05, 5.98, 0.24, 0.15, 3.16)),
  projector: flat(0.3, 0.34, 0.81, 0.66, 0.28),
  tv_console: flat(0.06, 0.14, 1.94, 0.87, 1.31),
  computer: flat(0.28, 0.29, 0.72, 0.76, 0.59),
  tv_portable: flat(0.24, 0.36, 0.76, 0.69, 0.38),
  console_2600: flat(0.2, 0.3, 0.8, 0.72, 0.12),
  console_nes: flat(0.18, 0.28, 0.82, 0.77, 0.15),
  console_snes: flat(0.17, 0.27, 0.83, 0.77, 0.13),
  console_md: flat(0.16, 0.28, 0.84, 0.74, 0.15),
  console_gb: flat(0.24, 0.34, 0.76, 0.7, 0.4),
  cart_shelf: flat(0.06, 0.24, 1.94, 0.79, 0.88),
  console_ps1: flat(0.17, 0.28, 0.83, 0.75, 0.13),
  console_ps1_slim: flat(0.22, 0.3, 0.78, 0.73, 0.47),
  disc_rack: flat(0.26, 0.35, 0.74, 0.67, 1.41),
  slot_track: {
    parts: [box(-0.02, -0.02, 4.02, 3.02, 0, 0.6), box(0.05, -0.02, 3.95, 0.2, 0.6, 1.35)],
    odd: "the lap board and its mast along the back as one strip to 1.35 m",
  },
  pool_table: flat(0.23, 0, 3.93, 2, 0.76),
  pingpong_table: one(box(0.27, 0, 3.73, 2, 0, 0.62), box(1.97, -0.17, 2.03, 2.17, 0.62, 0.82)),
  turntable: flat(0.15, 0.18, 0.86, 0.83, 0.18),
  coffee_machine: flat(0.22, 0.18, 0.78, 0.75, 0.51),
  reception: flat(-0.04, 0.16, 3.04, 0.98, 0.74),
  mic_stand: one(cyl(0.5, 0.5, 0.05, 0, 1.05)),
  mixing_desk: one(box(0, 0.15, 3, 0.95, 0, 0.47), box(0, 0.15, 3, 0.41, 0.47, 0.82)),
  standup_mat: flat(0.15, 0.15, 3.85, 3.85, 0.03),
  door: { parts: [], odd: DOOR },
  door_double: { parts: [], odd: DOOR },
  door_studio: { parts: [], odd: `${DOOR}; its ON AIR lamp over it to 2.73 m` },
  door_barn: { parts: [], odd: `${DOOR}; the leaf rolls along the wall's face` },
  door_saloon: { parts: [], odd: `${DOOR}; the leaves swing as people pass (never shut to anyone)` },
  archway: { parts: [], odd: "a doorway with no door: the wall's cut, always open" },
  window: { parts: [], odd: WINDOW },
  window_wide: { parts: [], odd: WINDOW },
  window_tall: { parts: [], odd: WINDOW },
  window_round: { parts: [], odd: `${WINDOW}; round, its hole the square round it` },
  window_arched: { parts: [], odd: `${WINDOW}; its arch's hole the square round it` },
  window_high: { parts: [], odd: WINDOW },
  window_stained: { parts: [], odd: WINDOW },
  window_blinds: { parts: [], odd: WINDOW },
  window_studio: { parts: [], odd: WINDOW },
  speaker_cab: flat(0.1, 0.2, 0.9, 0.83, 1.17),
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
    parts: [cyl(0.5, 0.5, 0.14, 0, 8.88), box(0.44, 0.36, 2.55, 0.64, 8.55, 8.88)],
    odd: "its arm reaches 2 m past its tile, 8.5 m up",
  },
  server_rack: flat(0.1, 0.12, 0.91, 0.89, 1.68),
  crt_terminal: one(box(0.05, 0.15, 0.95, 0.9, 0, 0.51), box(0.2, 0.2, 0.8, 0.7, 0.51, 1.22)),
  decor: {
    parts: [box(0.25, 0.26, 0.75, 0.75, 0, 0.57)],
    odd: "one box for all it can be (a plant, boxes, a bin, a cable)",
  },
  tabletop: {
    parts: [box(0.45, 0.45, 0.55, 0.55, 0, 0.16)],
    odd: "one box for all it can be (a mug… a book): the mug's",
  },
  frame: one(box(0.28, 0.18, 0.72, 0.22, 1.02, 1.53)),
  pet_bed: flat(0.04, 0.04, 0.96, 0.96, 0.31),
  pet_bowl: flat(0.25, 0.25, 0.75, 0.75, 0.16),
  water_bowl: flat(0.25, 0.25, 0.75, 0.75, 0.16),
  scratch_post: one(box(0.15, 0.15, 0.85, 0.85, 0, 0.08), cyl(0.5, 0.5, 0.24, 0.08, 1.02)),
  pet_house: flat(0.02, 0.04, 0.98, 0.99, 0.77),
  toy_box: flat(0.2, 0.2, 0.8, 0.8, 0.41),
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
    return { x: h.ax, y: h.ay, rot: h.rot, w: e.w, h: e.h, lift: m(h.lift) };
  }
  if (e.onSurface) {
    const c = topCentre(o);
    return { x: c.x - 0.5, y: c.y - 0.5, rot: rotOf(o), w: 1, h: 1, lift: m(Number(o.props?.z) || 0) };
  }
  return { x: o.x, y: o.y, rot: o.rot ?? 0, w: e.w, h: e.h, lift: 0 };
}

/** A placed thing's solids in its floor's coords, `elev` m up (its storey). Doors and windows
 *  have none: they're their walls' cuts (wallSolids). */
export function kindSolids(o: WorldObjectDef, elev = 0): Solid3[] {
  const f = frameOf(o);
  return shapeOf(o.kind).parts.map((p) => {
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
  const d = top - m(st);
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
