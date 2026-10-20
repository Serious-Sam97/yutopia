// Every placeable thing in the world. Footprints are in tiles at rot 0; rot 1/3
// swap width and height. `wall` objects hang on a wall face, anywhere along and
// up it (hang.ts), and never block. `seat` tiles are walkable and make the avatar sit.

// (board walls, the meeting table and the arcade cabinet had Yondra's boards,
// planning poker and arcade behind them; they're decor until the per-office
// Yondra integration, docs/plan/24-standalone.md §9)
export type Interaction =
  | "whiteboard"
  | "radio"
  | "standup"
  | "screen"
  | "notice"
  | "terminal"
  | "coffee"
  | "door"
  | "lamp"
  | "water"
  | "vending"
  | "piano"
  | "slotcar"
  | "pool"
  | "pong"
  | "tv"
  | "console"
  | "games"
  | "media"
  | "switch"
  | "petbowl"
  | "waterbowl"
  | "toybox"
  | "computer"
  | "lift";

export interface CatalogEntry {
  label: string;
  w: number;
  h: number;
  solid: boolean;
  wall?: boolean;
  seat?: boolean;
  interact?: Interaction;
  light?: { color: number; radius: number; intensity: number };
  buildable?: boolean;
  // how many looks it's drawn in (props.variant picks one; seeded by id when
  // unset, or `look` when a room should match: every desk walnut until changed)
  variants?: number;
  look?: number;
  // its fabric or paint can be chosen (props.color, a hex): sofas, rugs, lamps…
  paint?: boolean;
  // tabletops (mugs, monitors, the radio…) sit on items with a surface this
  // many px up; `top`: the part of it they can stand on, in quarter-tile cells
  // of the rot-0 footprint [x0, y0, x1, y1] (default: all of it)
  surface?: number;
  top?: [number, number, number, number];
  onSurface?: boolean;
  // doors and windows (openings.ts): set into a wall on tile edges, `w` of
  // them along it, cutting their own hole; the wall keeps its material
  opening?: "door" | "window";
}

export const CATALOG = {
  desk: { label: "Desk", w: 2, h: 1, solid: true, buildable: true, variants: 4, look: 0, surface: 25 },
  chair: { label: "Chair", w: 1, h: 1, solid: false, seat: true, buildable: true, variants: 4, paint: true },
  board_wall: { label: "Board wall", w: 3, h: 1, solid: false, wall: true, buildable: true },
  screen_wall: { label: "Big screen", w: 4, h: 1, solid: false, wall: true, interact: "screen", buildable: true },
  whiteboard: { label: "Whiteboard", w: 2, h: 1, solid: false, wall: true, interact: "whiteboard", buildable: true },
  notice_board: {
    label: "Notice board",
    w: 2,
    h: 1,
    solid: false,
    wall: true,
    interact: "notice",
    buildable: true,
    variants: 3,
  },
  acoustic_panel: { label: "Acoustic panel", w: 1, h: 1, solid: false, wall: true, buildable: true },
  clock: { label: "Wall clock", w: 1, h: 1, solid: false, wall: true, buildable: true },
  neon: {
    label: "Neon sign",
    w: 2,
    h: 1,
    solid: false,
    wall: true,
    buildable: true,
    variants: 3,
    light: { color: 0xff8a5c, radius: 2.6, intensity: 0.32 },
  },
  poster: { label: "Poster", w: 1, h: 1, solid: false, wall: true, buildable: true },
  // turns every lamp in its room on or off (props.on: how it was last flipped)
  light_switch: { label: "Light switch", w: 1, h: 1, solid: false, wall: true, interact: "switch", buildable: true },
  meeting_table: {
    label: "Meeting table",
    w: 6,
    h: 2,
    solid: true,
    buildable: true,
    surface: 25,
  },
  coffee_table: { label: "Coffee table", w: 2, h: 1, solid: true, buildable: true, surface: 13 },
  side_table: { label: "Side table", w: 1, h: 1, solid: true, buildable: true, surface: 14 },
  bookcase: {
    label: "Bookcase",
    w: 2,
    h: 1,
    solid: true,
    buildable: true,
    variants: 3,
    surface: 62,
    top: [0, 1, 8, 3],
  },
  partition: { label: "Room divider", w: 2, h: 1, solid: true, buildable: true, variants: 3, paint: true },
  counter: {
    label: "Kitchen counter",
    w: 2,
    h: 1,
    solid: true,
    buildable: true,
    variants: 2,
    surface: 26,
    top: [0, 0, 4, 4], // the sink takes the right half
    paint: true,
  },
  cupboard: { label: "Cupboard", w: 1, h: 1, solid: true, buildable: true, surface: 26 },
  sofa: { label: "Sofa", w: 3, h: 1, solid: false, seat: true, buildable: true, variants: 3, paint: true },
  armchair: { label: "Armchair", w: 1, h: 1, solid: false, seat: true, buildable: true, variants: 2, paint: true },
  beanbag: { label: "Bean bag", w: 1, h: 1, solid: false, seat: true, buildable: true, paint: true },
  bench: { label: "Bench", w: 3, h: 1, solid: false, seat: true, buildable: true },
  plant: { label: "Plant", w: 1, h: 1, solid: true, buildable: true, variants: 5 },
  lamp: {
    label: "Floor lamp",
    w: 1,
    h: 1,
    solid: true,
    interact: "lamp",
    light: { color: 0xffb35c, radius: 4.5, intensity: 0.55 },
    buildable: true,
    variants: 3,
    look: 0,
    paint: true,
  },
  rug: { label: "Rug", w: 4, h: 3, solid: false, buildable: true, variants: 3, look: 0, paint: true },
  arcade: { label: "Arcade cabinet", w: 1, h: 1, solid: true, buildable: true },
  radio: {
    label: "Lo-fi radio",
    w: 1,
    h: 1,
    solid: false,
    onSurface: true,
    interact: "radio",
    light: { color: 0xffa630, radius: 2, intensity: 0.35 },
    buildable: true,
  },
  tape_shelf: {
    label: "Tape shelf",
    w: 2,
    h: 1,
    solid: true,
    buildable: true,
    variants: 3,
    surface: 46,
    top: [0, 1, 8, 3],
  },
  water_cooler: { label: "Water cooler", w: 1, h: 1, solid: true, interact: "water", buildable: true },
  vending: {
    label: "Vending machine",
    w: 1,
    h: 1,
    solid: true,
    interact: "vending",
    buildable: true,
    variants: 2,
    light: { color: 0xffe2a8, radius: 2.4, intensity: 0.35 },
  },
  piano: { label: "Upright piano", w: 2, h: 1, solid: true, interact: "piano", buildable: true, variants: 2 },
  // the game room (shared/games.ts): a CRT TV on its stand, consoles you plug
  // into it with a cable (props.tv), a cartridge in them (props.cart), the
  // shelf of cartridges (the library)
  crt_tv: { label: "CRT TV", w: 2, h: 1, solid: true, interact: "tv", buildable: true, variants: 2 },
  // more screens (shared/media.ts): YouTube or Jellyfin on them, for everyone
  // nearby (props.media); the projector lights the screen it faces
  tv_wall: { label: "Wall TV", w: 1, h: 1, solid: false, wall: true, interact: "media", buildable: true, variants: 2 },
  tv_hd: { label: "Big HD TV", w: 3, h: 1, solid: false, wall: true, interact: "media", buildable: true },
  projector_screen: {
    label: "Projector screen",
    w: 3,
    h: 1,
    solid: false,
    wall: true,
    interact: "media",
    buildable: true,
  },
  // for the tall walls: a giant panel and a cinema screen between velvet curtains
  tv_giant: { label: "Giant TV", w: 5, h: 1, solid: false, wall: true, interact: "media", buildable: true },
  cinema_screen: {
    label: "Cinema screen",
    w: 6,
    h: 1,
    solid: false,
    wall: true,
    interact: "media",
    buildable: true,
    variants: 2,
  },
  projector: { label: "Projector", w: 1, h: 1, solid: false, onSurface: true, buildable: true },
  tv_console: { label: "Console TV", w: 2, h: 1, solid: true, interact: "media", buildable: true, variants: 2 },
  // runs VortexOS (shared/computer.ts): sit down, press X
  computer: {
    label: "Computer",
    w: 1,
    h: 1,
    solid: false,
    onSurface: true,
    interact: "computer",
    buildable: true,
    variants: 2,
    look: 0,
  },
  tv_portable: {
    label: "Portable TV",
    w: 1,
    h: 1,
    solid: false,
    onSurface: true,
    interact: "media",
    buildable: true,
    variants: 2,
  },
  console_2600: { label: "Woodgrain console", w: 1, h: 1, solid: false, interact: "console", buildable: true },
  console_nes: { label: "8-bit console", w: 1, h: 1, solid: false, interact: "console", buildable: true, variants: 2 },
  console_snes: { label: "16-bit console", w: 1, h: 1, solid: false, interact: "console", buildable: true },
  console_md: { label: "16-bit console (black)", w: 1, h: 1, solid: false, interact: "console", buildable: true },
  console_gb: { label: "Handheld TV dock", w: 1, h: 1, solid: false, interact: "console", buildable: true },
  cart_shelf: { label: "Cartridge shelf", w: 2, h: 1, solid: true, interact: "games", buildable: true },
  // the disc console (docs/plan/23-disc-console.md): a disc in it (props.cart,
  // the lid opening while it goes in or out: props.lid), the team's BIOS; the
  // rack is the discs' library (and where the BIOS is brought)
  console_ps1: { label: "32-bit disc console", w: 1, h: 1, solid: false, interact: "console", buildable: true },
  console_ps1_slim: {
    label: "32-bit disc console (slim)",
    w: 1,
    h: 1,
    solid: false,
    interact: "console",
    buildable: true,
    variants: 2,
  },
  disc_rack: { label: "Disc rack", w: 1, h: 1, solid: true, interact: "games", buildable: true, variants: 2 },
  // an autorama for up to four (shared/slotcar.ts): the track on a table, the
  // cars race live for everyone in the room
  slot_track: {
    label: "Slot-car track",
    w: 4,
    h: 3,
    solid: true,
    interact: "slotcar",
    buildable: true,
    light: { color: 0xffe2a8, radius: 2.4, intensity: 0.22 },
  },
  // the game tables (Fita 13, shared/tables.ts): 8-ball pool and ping-pong,
  // played in the world for everyone to see
  pool_table: {
    label: "Pool table",
    w: 4,
    h: 2,
    solid: true,
    interact: "pool",
    buildable: true,
    variants: 3,
    light: { color: 0xffd9a0, radius: 2.6, intensity: 0.3 },
  },
  pingpong_table: { label: "Ping-pong table", w: 4, h: 2, solid: true, interact: "pong", buildable: true, variants: 3 },
  turntable: {
    label: "Record player",
    w: 1,
    h: 1,
    solid: false,
    onSurface: true,
    interact: "radio", // it plays the room's music, like the radio
    buildable: true,
    light: { color: 0xffa630, radius: 1.6, intensity: 0.25 },
  },
  coffee_machine: {
    label: "Coffee machine",
    w: 1,
    h: 1,
    solid: false,
    onSurface: true,
    interact: "coffee",
    buildable: true,
  },
  reception: { label: "Reception desk", w: 3, h: 1, solid: true, buildable: true, surface: 29 },
  mic_stand: { label: "Mic stand", w: 1, h: 1, solid: true, buildable: true },
  mixing_desk: {
    label: "Mixing desk",
    w: 3,
    h: 1,
    solid: true,
    light: { color: 0xffa630, radius: 2.5, intensity: 0.4 },
    buildable: true,
  },
  standup_mat: { label: "Standup ring", w: 4, h: 4, solid: false, interact: "standup", buildable: true },
  // Set into a wall (openings.ts). props.state: "open" | "closed" | "locked";
  // props.glass: glazed; props.swing −1: opens to the other side (a barn door:
  // slides the other way); props.color: the leaf's paint.
  door: { label: "Door", w: 1, h: 1, solid: false, interact: "door", buildable: true, opening: "door", paint: true },
  door_double: {
    label: "Double door",
    w: 2,
    h: 1,
    solid: false,
    interact: "door",
    buildable: true,
    opening: "door",
    paint: true,
  },
  door_studio: {
    label: "Studio door",
    w: 1,
    h: 1,
    solid: false,
    interact: "door",
    buildable: true,
    opening: "door",
    paint: true,
  },
  door_barn: {
    label: "Barn door",
    w: 1,
    h: 1,
    solid: false,
    interact: "door",
    buildable: true,
    opening: "door",
    paint: true,
  },
  door_saloon: {
    label: "Saloon doors",
    w: 1,
    h: 1,
    solid: false,
    interact: "door",
    buildable: true,
    opening: "door",
    paint: true,
  },
  // a doorway with no door: always open
  archway: { label: "Archway", w: 1, h: 1, solid: false, buildable: true, opening: "door" },
  window: { label: "Window", w: 1, h: 1, solid: false, buildable: true, opening: "window" },
  window_wide: { label: "Wide window", w: 2, h: 1, solid: false, buildable: true, opening: "window" },
  window_tall: { label: "Tall window", w: 1, h: 1, solid: false, buildable: true, opening: "window" },
  window_round: { label: "Round window", w: 1, h: 1, solid: false, buildable: true, opening: "window" },
  window_arched: { label: "Arched window", w: 1, h: 1, solid: false, buildable: true, opening: "window" },
  window_high: { label: "High window", w: 2, h: 1, solid: false, buildable: true, opening: "window" },
  window_stained: { label: "Stained glass", w: 1, h: 1, solid: false, buildable: true, opening: "window" },
  window_blinds: { label: "Window with blinds", w: 1, h: 1, solid: false, buildable: true, opening: "window" },
  window_studio: { label: "Studio glass", w: 2, h: 1, solid: false, buildable: true, opening: "window" },
  speaker_cab: { label: "Speaker cabinet", w: 1, h: 1, solid: true, buildable: true },
  column: { label: "Column", w: 1, h: 1, solid: true, buildable: true, variants: 2 },
  // the building (docs/plan/25-building-floors.md): stairs up to the floor above
  // (stairs.ts), an elevator's car where it stops on each floor (props.shaft
  // names the shaft; the world-server runs the car), and outside the lot's cars
  // and lamp posts
  stairs: { label: "Staircase", w: 4, h: 7, solid: false, buildable: true },
  elevator: { label: "Elevator", w: 2, h: 2, solid: false, interact: "lift", buildable: true },
  car: { label: "Car", w: 5, h: 2, solid: true, buildable: true, variants: 9, paint: true },
  lamp_post: {
    label: "Lamp post",
    w: 1,
    h: 1,
    solid: true,
    buildable: true,
    light: { color: 0xdfe8ff, radius: 9, intensity: 0.7 },
  },
  server_rack: {
    label: "Server rack",
    w: 1,
    h: 1,
    solid: true,
    variants: 3,
    light: { color: 0xc4402b, radius: 2, intensity: 0.45 },
  },
  crt_terminal: {
    label: "Terminal",
    w: 1,
    h: 1,
    solid: true,
    interact: "terminal",
    light: { color: 0xffa630, radius: 2.5, intensity: 0.5 },
  },
  // the rooms' clutter as real things you place and move (art from dressing.ts):
  // props.d is what it is, props.seed picks its look
  decor: { label: "Decor", w: 1, h: 1, solid: true, buildable: true },
  tabletop: { label: "On a desk", w: 1, h: 1, solid: false, buildable: true, onSurface: true },
  frame: { label: "Picture frame", w: 1, h: 1, solid: false, wall: true, buildable: true },
  // for pets (shared/pets.ts): a bed it sleeps in, bowls it eats and drinks
  // from (props.portions left; anyone fills them), a post, a house
  pet_bed: { label: "Pet bed", w: 1, h: 1, solid: false, buildable: true, variants: 2, paint: true },
  pet_bowl: { label: "Food bowl", w: 1, h: 1, solid: false, interact: "petbowl", buildable: true, paint: true },
  water_bowl: { label: "Water bowl", w: 1, h: 1, solid: false, interact: "waterbowl", buildable: true, paint: true },
  scratch_post: { label: "Scratching post", w: 1, h: 1, solid: true, buildable: true },
  pet_house: { label: "Pet house", w: 1, h: 1, solid: true, buildable: true, variants: 2, paint: true },
  toy_box: { label: "Toy box", w: 1, h: 1, solid: true, interact: "toybox", buildable: true, paint: true },
} satisfies Record<string, CatalogEntry>;

// What decor pieces can be (props.d), by kind.
export const DECOR = {
  decor: ["plant", "boxes", "bin", "cable"],
  tabletop: [
    "keyboard",
    "desklamp",
    "phone",
    "mug",
    "papers",
    "book",
    "binder",
    "tapes",
    "vinyl",
    "photo",
    "succulent",
    "cards",
    "bell",
  ],
  frame: ["frame"],
} as const;

// The look an item is drawn in: props.variant when valid, else a seeded pick.
export function variantOf(o: { kind: string; id: string; props?: Record<string, unknown> }, seed: number): number {
  const e = entry(o.kind);
  const n = e.variants ?? 1;
  const v = o.props?.variant;
  if (typeof v === "number" && Number.isInteger(v) && v >= 0 && v < n) return v;
  return e.look ?? Math.floor(seed * n);
}

export type ObjectKind = keyof typeof CATALOG;

export function isKind(k: string): k is ObjectKind {
  return Object.hasOwn(CATALOG, k);
}

export function entry(kind: string): CatalogEntry {
  return isKind(kind) ? CATALOG[kind] : (extra.get(kind) ?? { label: kind, w: 1, h: 1, solid: true });
}
// Kinds a client adds at run time: the Grounds' things (docs/plan/27), drawn
// in the iso view as items — never built, never stored.
const extra = new Map<string, CatalogEntry>();
export function registerKinds(kinds: Record<string, CatalogEntry>): void {
  for (const [k, e] of Object.entries(kinds)) extra.set(k, e);
}

// What a body can stand on once it's jumped up there (shared/jump.ts): the top
// of the thing, iso px up (as `surface`; 39.2 px a tile), by what its drawing
// shows. Surfaces (desks, tables, shelves…) are stood on at their surface;
// these are the solid things without one. Thin, tall or awkward things (lamps,
// plants, partitions, a mic stand, the water cooler's bottle) aren't.
const STAND: Partial<Record<ObjectKind, number>> = {
  arcade: 54,
  vending: 62,
  piano: 44,
  crt_tv: 47,
  tv_console: 46,
  cart_shelf: 30,
  disc_rack: 16,
  slot_track: 23,
  pool_table: 27,
  pingpong_table: 24,
  mixing_desk: 18,
  speaker_cab: 46,
  column: 84,
  car: 56,
  server_rack: 66,
  crt_terminal: 20,
  pet_house: 16,
  toy_box: 16,
};

/** How high a body stands on top of this (iso px), or undefined: it can't. */
export function standHeight(kind: string): number | undefined {
  const e = entry(kind);
  if (!e.solid || e.wall) return undefined;
  return isKind(kind) ? (STAND[kind] ?? e.surface) : undefined;
}

export function footprint(kind: string, rot = 0): { w: number; h: number } {
  const e = entry(kind);
  return rot % 2 === 1 ? { w: e.h, h: e.w } : { w: e.w, h: e.h };
}

// Older saves: wall items hung on the north wall of their tiles (rot 0) or,
// turned, on the west wall (rot 3); any other turn was the north wall. Placed
// on the free grid (props.wu set, hang.ts) any turn is a face.
export function wallRot(rot = 0): 0 | 3 {
  return rot === 3 ? 3 : 0;
}

// The turn something is laid out and drawn with (wall items: the face they
// hang on, hang.ts `hangRot`).
export function rotOf(o: { kind: string; rot?: number; props?: Record<string, unknown> }): number {
  if (!entry(o.kind).wall) return o.rot ?? 0;
  return Number.isInteger(o.props?.wu) ? (o.rot ?? 0) & 3 : wallRot(o.rot);
}

// Its footprint where it stands (wall items: the tiles along their wall, from
// the tile it's in front of; hang.ts has where exactly).
export function placedFootprint(o: { kind: string; rot?: number; props?: Record<string, unknown> }): {
  w: number;
  h: number;
} {
  return footprint(o.kind, rotOf(o));
}

export interface WorldObjectDef {
  id: string;
  kind: string;
  x: number;
  y: number;
  rot?: number;
  refId?: number | null;
  props?: Record<string, unknown>;
}
