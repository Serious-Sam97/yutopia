// Every placeable thing in the world. Footprints are in tiles at rot 0; rot 1/3
// swap width and height. `wall` objects hang on the back wall behind their tile
// and never block. `seat` tiles are walkable and make the avatar sit.

export type Interaction =
  | "board"
  | "whiteboard"
  | "radio"
  | "arcade"
  | "poker"
  | "standup"
  | "screen"
  | "notice"
  | "terminal"
  | "coffee"
  | "door"
  | "lamp"
  | "water"
  | "vending"
  | "piano";

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
}

export const CATALOG = {
  desk: { label: "Desk", w: 2, h: 1, solid: true, buildable: true, variants: 4, look: 0, surface: 25 },
  chair: { label: "Chair", w: 1, h: 1, solid: false, seat: true, buildable: true, variants: 4, paint: true },
  board_wall: { label: "Board wall", w: 3, h: 1, solid: false, wall: true, interact: "board", buildable: true },
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
  meeting_table: {
    label: "Meeting table",
    w: 6,
    h: 2,
    solid: true,
    interact: "poker",
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
  sofa: { label: "Sofa", w: 3, h: 1, solid: true, buildable: true, variants: 3, paint: true },
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
  arcade: { label: "Arcade cabinet", w: 1, h: 1, solid: true, interact: "arcade", buildable: true },
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
  // Sits in a gap between two walls. props.state: "open" | "closed" | "locked".
  door: { label: "Door", w: 1, h: 1, solid: false, interact: "door", buildable: true },
  speaker_cab: { label: "Speaker cabinet", w: 1, h: 1, solid: true, buildable: true },
  column: { label: "Column", w: 1, h: 1, solid: true, buildable: true, variants: 2 },
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
} satisfies Record<string, CatalogEntry>;

// What decor pieces can be (props.d), by kind.
export const DECOR = {
  decor: ["plant", "boxes", "bin", "cable"],
  tabletop: [
    "monitor",
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
  return isKind(kind) ? CATALOG[kind] : { label: kind, w: 1, h: 1, solid: true };
}

export function footprint(kind: string, rot = 0): { w: number; h: number } {
  const e = entry(kind);
  return rot % 2 === 1 ? { w: e.h, h: e.w } : { w: e.w, h: e.h };
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
