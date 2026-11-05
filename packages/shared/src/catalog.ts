import { FAM_CATALOG } from "./fam/index.ts";
import { STAND, SURFACE } from "./furniture.ts";

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
  | "lift"
  // (plan 68: a present opened by who it's for, a hot cocoa poured, a held thing wrapped)
  | "present"
  | "cocoa"
  | "wrap"
  // (plan 68 phase 19: the kettle's tea, the freezer's ice cream)
  | "tea"
  | "icecream"
  // (plan 68 phases 21–25: the small games)
  | "chess"
  | "darts"
  | "claw"
  | "hockey"
  | "foosball";

export interface CatalogEntry {
  label: string;
  w: number;
  h: number;
  solid: boolean;
  wall?: boolean;
  seat?: boolean;
  interact?: Interaction;
  light?: { color: number; radius: number; intensity: number; h?: number }; // (h: m up, a ceiling light's)
  buildable?: boolean;
  // how many looks it's drawn in (props.variant picks one; seeded by id when
  // unset, or `look` when a room should match: every desk walnut until changed)
  variants?: number;
  look?: number;
  // its fabric or paint can be chosen (props.color, a hex): sofas, rugs, lamps…
  paint?: boolean;
  // tabletops (mugs, monitors, the radio…) sit on items with a surface this
  // many metres up; `top`: the part of it they can stand on, in quarter-tile cells
  // of the rot-0 footprint [x0, y0, x1, y1] (default: all of it)
  surface?: number;
  top?: [number, number, number, number];
  onSurface?: boolean;
  // doors and windows (openings.ts): set into a wall on tile edges, `w` of
  // them along it, cutting their own hole; the wall keeps its material
  opening?: "door" | "window";
  // words on it (plan 68: shared glyphs.ts): `props.text`, at most this many letters
  text?: number;
  // only out of doors, on the land round the ground floor: the parkour pieces
  // (Flowmotion's off indoors — physics/flow.ts)
  outdoor?: boolean;
}

/** (docs/plan/62) The piano's stool, drawn with it out in front of its keys: its middle in the
 *  piano's own tiles (rot 0, the keys toward +y) — played sat on it. (Plan 67: 0.2 m from the
 *  keys' front at true scale, the knees under the keybed: 1.27 → 1.1.) */
export const PIANO_STOOL: [number, number] = [1, 1.1];

export const CATALOG = {
  desk: { label: "Desk", w: 2, h: 1, solid: true, buildable: true, variants: 4, look: 0, surface: SURFACE.desk },
  chair: { label: "Chair", w: 1, h: 1, solid: false, seat: true, buildable: true, variants: 4, look: 0, paint: true },
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
    look: 0,
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
    look: 0,
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
    surface: SURFACE.meeting_table,
  },
  coffee_table: {
    label: "Coffee table",
    w: 2,
    h: 1,
    solid: true,
    buildable: true,
    surface: SURFACE.coffee_table,
  },
  side_table: { label: "Side table", w: 1, h: 1, solid: true, buildable: true, surface: SURFACE.side_table },
  bookcase: {
    label: "Bookcase",
    w: 2,
    h: 1,
    solid: true,
    buildable: true,
    look: 0,
    variants: 3,
    surface: SURFACE.bookcase,
    top: [0, 1, 8, 3],
  },
  partition: { label: "Room divider", w: 2, h: 1, solid: true, buildable: true, variants: 3, paint: true },
  counter: {
    label: "Kitchen counter",
    w: 2,
    h: 1,
    solid: true,
    buildable: true,
    look: 0,
    variants: 2,
    surface: SURFACE.counter,
    top: [0, 0, 4, 4], // the sink takes the right half
    paint: true,
  },
  cupboard: { label: "Cupboard", w: 1, h: 1, solid: true, buildable: true, surface: SURFACE.cupboard },
  // a supply locker (docs/plan/30-the-dark.md): a kit a day for anyone, wherever it's put
  locker: { label: "Supply locker", w: 1, h: 1, solid: true, buildable: true },
  sofa: { label: "Sofa", w: 3, h: 1, solid: false, seat: true, buildable: true, variants: 3, look: 0, paint: true },
  armchair: {
    label: "Armchair",
    w: 1,
    h: 1,
    solid: false,
    seat: true,
    buildable: true,
    variants: 2,
    look: 0,
    paint: true,
  },
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
    look: 0,
    variants: 3,
    surface: SURFACE.tape_shelf,
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
    look: 0,
    light: { color: 0xffe2a8, radius: 2.4, intensity: 0.35 },
  },
  piano: { label: "Upright piano", w: 2, h: 1, solid: true, interact: "piano", buildable: true, variants: 2, look: 0 },
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
  disc_rack: { label: "Disc rack", w: 1, h: 1, solid: true, interact: "games", buildable: true, variants: 2, look: 0 },
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
  pingpong_table: {
    label: "Ping-pong table",
    w: 4,
    h: 2,
    solid: true,
    interact: "pong",
    buildable: true,
    variants: 3,
    look: 0,
  },
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
  reception: {
    label: "Reception desk",
    w: 3,
    h: 1,
    solid: true,
    buildable: true,
    surface: SURFACE.reception,
    top: [0, 0, 12, 3], // (the work surface, behind the visitors' ledge: plan 67)
  },
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
  // (plan 68 phase 13) automatic glass doors sliding apart as anyone comes near; a revolving door
  // turning as you walk through; a garage's roller door
  door_auto: { label: "Automatic doors", w: 2, h: 1, solid: false, interact: "door", buildable: true, opening: "door" },
  door_revolving: { label: "Revolving door", w: 2, h: 1, solid: false, buildable: true, opening: "door" },
  door_garage: {
    label: "Garage door",
    w: 2,
    h: 1,
    solid: false,
    interact: "door",
    buildable: true,
    opening: "door",
    paint: true,
  },
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
  // someone's own bay of the lot (docs/plan/43-the-spot.md, shared spot.ts): the board with their
  // name at its head, put up and taken down by claiming it (never built)
  bayboard: { label: "Name board", w: 1, h: 1, solid: true },
  lamp_post: {
    label: "Lamp post",
    w: 1,
    h: 1,
    solid: true,
    buildable: true,
    light: { color: 0xdfe8ff, radius: 11, intensity: 1 },
  },
  server_rack: {
    label: "Server rack",
    w: 1,
    h: 1,
    solid: true,
    variants: 3,
    look: 0,
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
  // parkour, out of doors (Flowmotion: physics/flow.ts — ground along, run up and kicked off,
  // swung round)
  // the office staples (docs/plan/67-the-furniture.md, phase 8b: world/furn/staples.ts)
  standing_desk: {
    label: "Standing desk",
    w: 2,
    h: 1,
    solid: true,
    buildable: true,
    variants: 2,
    look: 0,
    surface: SURFACE.standing_desk,
  },
  filing_cabinet: { label: "Filing cabinet", w: 1, h: 1, solid: true, buildable: true, variants: 2, look: 0 },
  printer: { label: "Copier", w: 1, h: 1, solid: true, buildable: true },
  shelving: {
    label: "Open shelving",
    w: 2,
    h: 1,
    solid: true,
    buildable: true,
    variants: 2,
    look: 0,
    surface: SURFACE.shelving,
    top: [0, 1, 8, 3], // (its shelf 0.3–0.7 m in, as a bookcase's)
  },
  fridge: { label: "Fridge", w: 1, h: 1, solid: true, buildable: true, variants: 2, look: 0 },
  microwave: { label: "Microwave", w: 1, h: 1, solid: false, buildable: true, onSurface: true },
  bar_stool: {
    label: "Bar stool",
    w: 1,
    h: 1,
    solid: false,
    seat: true,
    buildable: true,
    variants: 2,
    look: 0,
    paint: true,
  },
  high_table: {
    label: "High table",
    w: 1,
    h: 1,
    solid: true,
    buildable: true,
    surface: SURFACE.high_table,
    top: [1, 1, 3, 3], // (its round top: the cells inside it)
  },
  phone_booth: { label: "Phone booth", w: 1, h: 1, solid: false, seat: true, buildable: true, paint: true },
  coat_rack: { label: "Coat rack", w: 1, h: 1, solid: true, buildable: true },
  wall_shelf: { label: "Wall shelf", w: 2, h: 1, solid: false, wall: true, buildable: true },
  pendant_light: {
    label: "Pendant light",
    w: 1,
    h: 1,
    solid: false,
    buildable: true,
    paint: true,
    light: { color: 0xffd9a0, radius: 4, intensity: 0.5, h: 2.3 },
  },
  panel_light: {
    label: "Ceiling panel",
    w: 1,
    h: 1,
    solid: false,
    buildable: true,
    light: { color: 0xf4f8ff, radius: 5, intensity: 0.45, h: 3.2 },
  },
  // plan 68 (docs/plan/68-more-furniture.md): phase 0's heroes (signed off 2026-11-03)
  loveseat: {
    label: "Loveseat",
    w: 2,
    h: 1,
    solid: false,
    seat: true,
    buildable: true,
    variants: 3,
    look: 0,
    paint: true,
  },
  fireplace: {
    label: "Fireplace",
    w: 2,
    h: 1,
    solid: true,
    buildable: true,
    interact: "lamp",
    variants: 3,
    look: 0,
    surface: SURFACE.fireplace,
    top: [1, 2, 7, 3], // (its mantel shelf)
    light: { color: 0xff9a4a, radius: 4.5, intensity: 0.6 },
  },
  lava_lamp: {
    label: "Lava lamp",
    w: 1,
    h: 1,
    solid: false,
    onSurface: true,
    buildable: true,
    interact: "lamp",
    variants: 3,
    look: 0,
    light: { color: 0xff7a4a, radius: 1.6, intensity: 0.3 },
  },
  // plan 68 phase 1: words on things (props.text, glyphs.ts)
  marquee_sign: {
    label: "Marquee sign",
    w: 3,
    h: 1,
    solid: false,
    wall: true,
    buildable: true,
    text: 10,
    light: { color: 0xffd28a, radius: 3, intensity: 0.4 },
  },
  vfd_ticker: { label: "Ticker sign", w: 2, h: 1, solid: false, wall: true, buildable: true, text: 48 },
  split_flap: { label: "Split-flap board", w: 3, h: 1, solid: false, wall: true, buildable: true, text: 36 },
  // plan 68 phase 2: Christmas (signed off 2026-11-03)
  xmas_tree: {
    label: "Christmas tree",
    buildable: true,
    w: 2,
    h: 2,
    solid: true,
    interact: "lamp",
    variants: 3,
    look: 0,
    light: { color: 0xffc27a, radius: 4, intensity: 0.5 },
  },
  xmas_tree_small: {
    label: "Tabletop tree",
    buildable: true,
    w: 1,
    h: 1,
    solid: false,
    onSurface: true,
    interact: "lamp",
    variants: 3,
    look: 0,
    light: { color: 0xffc27a, radius: 1.6, intensity: 0.3 },
  },
  present: { label: "Presents", buildable: true, w: 1, h: 1, solid: false, variants: 3, interact: "present", text: 12 },
  stocking: { label: "Stocking", buildable: true, w: 1, h: 1, solid: false, wall: true, variants: 3, text: 8 },
  wreath: { label: "Wreath", buildable: true, w: 1, h: 1, solid: false, wall: true, variants: 3, look: 0 },
  garland: {
    label: "Garland with lights",
    buildable: true,
    w: 3,
    h: 1,
    solid: false,
    wall: true,
    interact: "lamp",
    variants: 3,
    look: 0,
    light: { color: 0xffd9a0, radius: 3, intensity: 0.35 },
  },
  mistletoe: { label: "Mistletoe", buildable: true, w: 1, h: 1, solid: false },
  cocoa_station: {
    label: "Hot cocoa station",
    buildable: true,
    w: 2,
    h: 1,
    solid: true,
    variants: 2,
    look: 0,
    interact: "cocoa",
  },
  gingerbread_house: { label: "Gingerbread house", buildable: true, w: 1, h: 1, solid: false, onSurface: true },
  xmas_village: {
    label: "Christmas village",
    buildable: true,
    w: 1,
    h: 1,
    solid: false,
    onSurface: true,
    interact: "lamp",
    light: { color: 0xffc27a, radius: 1.4, intensity: 0.25 },
  },
  nutcracker: { label: "Nutcracker", buildable: true, w: 1, h: 1, solid: true, variants: 3, look: 0 },
  candle_arch: {
    label: "Candle arch",
    buildable: true,
    w: 1,
    h: 1,
    solid: false,
    onSurface: true,
    interact: "lamp",
    variants: 2,
    look: 0,
    light: { color: 0xffc27a, radius: 1.6, intensity: 0.3 },
  },
  poinsettia: { label: "Poinsettia", buildable: true, w: 1, h: 1, solid: false, variants: 3, look: 0 },
  advent_calendar: {
    label: "Advent calendar",
    buildable: true,
    w: 1,
    h: 1,
    solid: false,
    wall: true,
    variants: 3,
    look: 0,
  },
  wrapping_table: { label: "Gift-wrapping table", buildable: true, w: 2, h: 1, solid: true, interact: "wrap" },
  candy_cane: { label: "Candy cane", buildable: true, w: 1, h: 1, solid: false, outdoor: true, variants: 3, look: 0 },
  reindeer: {
    label: "Light-up reindeer",
    buildable: true,
    w: 2,
    h: 1,
    // (1.8 m of reindeer: gone round, not through — the Jolt pass, plan 68)
    solid: true,
    outdoor: true,
    interact: "lamp",
    variants: 3,
    look: 0,
    light: { color: 0xfff1d0, radius: 3, intensity: 0.4 },
  },
  sleigh: { label: "Sleigh", buildable: true, w: 3, h: 1, solid: true, outdoor: true, variants: 3, look: 0 },
  inflatable_snowman: { label: "Inflatable snowman", buildable: true, w: 1, h: 1, solid: true, outdoor: true },
  snow_globe: {
    label: "Giant snow globe",
    buildable: true,
    w: 2,
    h: 2,
    solid: true,
    outdoor: true,
    interact: "lamp",
    light: { color: 0xffe0b0, radius: 3, intensity: 0.35 },
  },
  pk_rail: { label: "Grind rail", w: 4, h: 1, solid: true, buildable: true, outdoor: true },
  pk_rail_long: { label: "Long grind rail", w: 8, h: 1, solid: true, buildable: true, outdoor: true },
  pk_wall: { label: "Parkour wall", w: 4, h: 1, solid: true, buildable: true, outdoor: true },
  pk_wall_tall: { label: "Tall parkour wall", w: 4, h: 1, solid: true, buildable: true, outdoor: true },
  pk_pole: { label: "Swing pole", w: 1, h: 1, solid: true, buildable: true, outdoor: true },
  pk_pole_tall: { label: "Tall swing pole", w: 1, h: 1, solid: true, buildable: true, outdoor: true },
  // (plan 68's families, phases 3–20: fam/*.ts)
  ...FAM_CATALOG,
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

// What a body can stand on once it's jumped up there (shared/jump.ts): the top of the thing, metres
// up. Surfaces (desks, tables, shelves…) are stood on at their surface; the solid
// things without one at their `STAND` (furniture.ts, m).

/** How high a body stands on top of this (m), or undefined: it can't. */
export function standHeight(kind: string): number | undefined {
  const e = entry(kind);
  if (!e.solid || e.wall) return undefined;
  if (!isKind(kind)) return undefined;
  const at = STAND[kind];
  return at ?? e.surface;
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

// How a thing is turned (docs/plan/72-the-3d-core.md, phase 5): its `yaw`, radians, a quarter turn
// π/2 the way the old `rot` counted them (rot 1 = π/2). Things still turn by quarters (plan 72
// phase 11 frees them), so the code asks for the quarter.
export const QUARTER = Math.PI / 2;
/** Its turn in quarters, 0..3. */
export const quarterOf = (o: { yaw?: number }): 0 | 1 | 2 | 3 =>
  (((Math.round((o.yaw ?? 0) / QUARTER) % 4) + 4) % 4) as 0 | 1 | 2 | 3;
/** A turn in quarters as a yaw (0, π/2, π, 3π/2). */
export const quarterYaw = (q: number): number => (Number.isFinite(q) ? ((Math.round(q) % 4) + 4) % 4 : 0) * QUARTER;

// The turn something is laid out and drawn with, in quarters (wall items: the face they hang on,
// hang.ts `hangRot`).
export function rotOf(o: { kind: string; yaw?: number; props?: Record<string, unknown> }): number {
  if (!entry(o.kind).wall) return quarterOf(o);
  return Number.isInteger(o.props?.wu) ? quarterOf(o) : wallRot(quarterOf(o));
}

// Its footprint where it stands (wall items: the tiles along their wall, from
// the tile it's in front of; hang.ts has where exactly).
export function placedFootprint(o: { kind: string; yaw?: number; props?: Record<string, unknown> }): {
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
  /** how it's turned: radians, π/2 a quarter (quarterOf) */
  yaw?: number;
  refId?: number | null;
  props?: Record<string, unknown>;
}
