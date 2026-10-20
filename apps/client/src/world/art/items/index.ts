import type { DressKind } from "@yutopia/shared";
import { doorShut, entry, variantOf as lookOf } from "@yutopia/shared";
import { boardWall } from "./board";
import { car, elevator, lampPost, stairs } from "./building";
import { chair } from "./chair";
import { dressing } from "./clutter";
import { computer } from "./computer";
import { desk } from "./desk";
import { rug, standupMat } from "./door";
import { doorItem } from "./doors";
import {
  cartShelf,
  console2600,
  consoleGb,
  consoleMd,
  consoleNes,
  consolePs1,
  consolePs1Slim,
  consoleSnes,
  crtTv,
  discRack,
} from "./games";
import { pingpongTable, poolTable } from "./gametables";
import { beanbag, bookcase, clock, counter, lightSwitch, neon, partition } from "./home";
import { type Clip, type Group, type ItemArt, Sketch, seedOf } from "./kit";
import { lamp } from "./lamp";
import { micStand, mixingDesk, radio, sideTable, speakerCab, tapeShelf } from "./music";
import { petBed, petBowl, petHouse, scratchPost, waterBowl } from "./pets";
import { PLANT_VARIANTS, plant } from "./plant";
import { piano, turntable, vending, waterCooler } from "./play";
import { cinemaScreen, projector, projectorScreen, tvConsole, tvGiant, tvHd, tvPortable, tvWall } from "./screens";
import { armchair, bench } from "./seating";
import { slotTrack } from "./slotcar";
import { sofa } from "./sofa";
import { coffeeTable, meetingTable, reception } from "./tables";
import { arcade, coffeeMachine, crtTerminal, cupboard, serverRack } from "./tech";
import { acousticPanel, noticeBoard, poster, screenWall, whiteboard } from "./wall";
import { column, post, WALL_HALF_T, type WallPart, wall } from "./walls";
import { windowItem } from "./window";

type Props = Record<string, unknown>;

// The third-person view (world/tp) draws walls, doors and the rooms' clutter
// from this chunk too (one copy of the drawings for both views).
export { dressing, post, WALL_HALF_T, wall };

// Marks this chunk for `pnpm budget` (it loads lazily, outside the page's files).
export const ITEM_ART_CHUNK = "yutopia-item-art";

// Illustrated items. `variants`: how many seeded looks an item has (the seed
// picks one, so equal items share textures); `key`: the props that change the
// drawing.
export interface ItemGen {
  draw: (s: Sketch, props: Props) => void;
  variants: number;
  key?: (props: Props) => string;
}

const occupied = (p: Props) => (p.occupied ? "sit" : "");
// fabric / paint (props.color)
const painted = (p: Props) => (typeof p.color === "string" ? p.color : "");
const sitPaint = (p: Props) => `${occupied(p)}|${painted(p)}`;
// a console's cartridge (its label colour)
const cart = (p: Props) => (p.cart ? String(p.cartColor ?? "c") : "");
// a disc console: its disc, the lid, the memory card, the LED
const disc = (p: Props) => `${cart(p)}${p.lid === "open" ? "o" : ""}${p.card ? "m" : ""}${p.on ? "1" : ""}`;

const GENS: Record<string, ItemGen> = {
  desk: { draw: desk, variants: 4 },
  chair: { draw: chair, variants: 4, key: sitPaint },
  armchair: { draw: armchair, variants: 2, key: sitPaint },
  beanbag: { draw: beanbag, variants: 1, key: sitPaint },
  bookcase: { draw: bookcase, variants: 3 },
  partition: { draw: partition, variants: 3, key: painted },
  counter: { draw: counter, variants: 2, key: painted },
  clock: { draw: clock, variants: 1, key: (p) => (p._thumb ? "t" : "") },
  neon: { draw: neon, variants: 3 },
  light_switch: { draw: lightSwitch, variants: 1, key: (p) => (p.on === false ? "off" : "on") },
  water_cooler: { draw: waterCooler, variants: 1 },
  vending: { draw: vending, variants: 2 },
  piano: { draw: piano, variants: 2 },
  slot_track: { draw: slotTrack, variants: 1, key: (p) => String(p.track ?? "") },
  pool_table: { draw: poolTable, variants: 3 },
  pingpong_table: { draw: pingpongTable, variants: 3 },
  crt_tv: { draw: crtTv, variants: 2 },
  tv_wall: { draw: tvWall, variants: 2 },
  tv_hd: { draw: tvHd, variants: 1 },
  projector_screen: { draw: projectorScreen, variants: 1 },
  tv_giant: { draw: tvGiant, variants: 1 },
  cinema_screen: { draw: cinemaScreen, variants: 2 },
  projector: { draw: projector, variants: 1, key: (p) => (p.on ? "on" : "off") },
  tv_console: { draw: tvConsole, variants: 2 },
  tv_portable: { draw: tvPortable, variants: 2 },
  computer: { draw: computer, variants: 2, key: (p) => (Number(p.seed) > 0.5 ? "n" : "") },
  console_2600: { draw: console2600, variants: 1, key: cart },
  console_nes: { draw: consoleNes, variants: 2, key: cart },
  console_snes: { draw: consoleSnes, variants: 1, key: cart },
  console_md: { draw: consoleMd, variants: 1, key: cart },
  console_gb: { draw: consoleGb, variants: 1, key: cart },
  cart_shelf: { draw: cartShelf, variants: 1 },
  console_ps1: { draw: consolePs1, variants: 1, key: disc },
  console_ps1_slim: { draw: consolePs1Slim, variants: 2, key: disc },
  disc_rack: { draw: discRack, variants: 2 },
  turntable: { draw: turntable, variants: 1, key: (p) => (p.on ? "on" : "off") },
  bench: { draw: bench, variants: 1 },
  meeting_table: { draw: meetingTable, variants: 1 },
  coffee_table: { draw: coffeeTable, variants: 1 },
  reception: { draw: reception, variants: 1 },
  radio: { draw: radio, variants: 1, key: (p) => (p.on ? "on" : "off") },
  tape_shelf: { draw: tapeShelf, variants: 3 },
  mic_stand: { draw: micStand, variants: 1 },
  mixing_desk: { draw: mixingDesk, variants: 1 },
  speaker_cab: { draw: speakerCab, variants: 1 },
  arcade: { draw: arcade, variants: 1 },
  server_rack: { draw: serverRack, variants: 3 },
  crt_terminal: { draw: crtTerminal, variants: 1 },
  coffee_machine: { draw: coffeeMachine, variants: 1 },
  side_table: { draw: sideTable, variants: 1 },
  cupboard: { draw: cupboard, variants: 1 },
  screen_wall: { draw: screenWall, variants: 1 },
  whiteboard: { draw: whiteboard, variants: 1 },
  notice_board: { draw: noticeBoard, variants: 3 },
  acoustic_panel: { draw: acousticPanel, variants: 1 },
  poster: { draw: poster, variants: 1, key: (p) => String(p.art ?? "tape") },
  // doors set into a wall (shared openings.ts; art/items/doors.ts)
  ...Object.fromEntries(
    ["door", "door_double", "door_studio", "door_barn", "door_saloon", "archway"].map((k) => [
      k,
      { draw: (s: Sketch, p: Props) => doorItem(s, k, p), variants: 1, key: doorKey(k) } satisfies ItemGen,
    ]),
  ),
  // windows set into a wall (shared openings.ts)
  ...Object.fromEntries(
    [
      "window",
      "window_wide",
      "window_tall",
      "window_round",
      "window_arched",
      "window_high",
      "window_stained",
      "window_blinds",
      "window_studio",
    ].map((k) => [k, { draw: (s: Sketch) => windowItem(s, k, entry(k).w), variants: 1 } satisfies ItemGen]),
  ),
  rug: { draw: rug, variants: 3, key: painted },
  standup_mat: { draw: standupMat, variants: 1 },
  column: { draw: column, variants: 2 },
  // the building (docs/plan/25): the elevator shows its doors and indicator,
  // a car its colour, body, snow and where in its bay it stands
  stairs: { draw: stairs, variants: 1 },
  elevator: { draw: elevator, variants: 1, key: (p) => `${p.door === "open" ? "o" : "c"}|${p.dir ?? 0}` },
  car: {
    draw: car,
    variants: 9,
    key: (p) => `${p.variant ?? ""}|${p.wagon ? "w" : ""}${p.snowy ? "s" : ""}|${p.dx ?? 0}|${p.dz ?? 0}|${painted(p)}`,
  },
  lamp_post: { draw: lampPost, variants: 1 },
  sofa: { draw: sofa, variants: 3, key: painted },
  lamp: { draw: lamp, variants: 3, key: (p) => `${p.on === false ? "off" : "on"}|${painted(p)}` },
  plant: { draw: plant, variants: PLANT_VARIANTS, key: (p) => (typeof p.variant === "number" ? `v${p.variant}` : "") },
  board_wall: { draw: boardWall, variants: 1 },
  // the rooms' clutter as real objects: what it is (props.d) and its seeded look
  // (tabletops are drawn standing on z 0; the engine lifts them to their surface)
  decor: { draw: (s, p) => dressing(s, decorKind(p, "plant"), 0, decorSeed(p)), variants: 1, key: decorKey },
  tabletop: {
    draw: (s, p) => dressing(s, decorKind(p, "mug"), 0, decorSeed(p), p.on === false),
    variants: 1,
    key: (p) => `${decorKey(p)}|${p.on === false ? "off" : ""}`,
  },
  frame: { draw: (s, p) => dressing(s, "frame", 0, decorSeed(p)), variants: 1, key: decorKey },
  // for pets (shared/pets.ts)
  pet_bed: { draw: petBed, variants: 2, key: painted },
  pet_bowl: { draw: petBowl, variants: 1, key: (p) => `${painted(p)}|${Number(p.portions ?? 0)}` },
  water_bowl: { draw: waterBowl, variants: 1, key: (p) => `${painted(p)}|${Number(p.portions ?? 0)}` },
  scratch_post: { draw: scratchPost, variants: 1 },
  pet_house: { draw: petHouse, variants: 2, key: painted },
};

// What changes a door's drawing: shut or not (and how), its part and leaf, glass, which way, its paint.
function doorKey(kind: string) {
  return (p: Props) => {
    const shut = p._thumb ? "thumb" : doorShut({ kind, props: p }) ? `shut-${p.state ?? ""}` : "open";
    return `${kind}|${shut}|${p._part ?? "edge"}|${p._leaf ?? ""}|${p.glass ? "g" : ""}|${Number(p.swing) < 0 ? "-" : ""}|${painted(p)}`;
  };
}

function decorKind(p: Props, fallback: DressKind): DressKind {
  return (typeof p.d === "string" ? p.d : fallback) as DressKind;
}
function decorSeed(p: Props): number {
  const s = Number(p.seed);
  return Number.isFinite(s) ? s : 0.5;
}
function decorKey(p: Props): string {
  return `${p.d ?? ""}|${decorSeed(p).toFixed(3)}`;
}

export function hasItemArt(kind: string): boolean {
  return Object.hasOwn(GENS, kind);
}
/** Drawings added at run time (the Grounds' things: art/grounds-items.ts). */
export function registerItems(gens: Record<string, ItemGen>): void {
  Object.assign(GENS, gens);
}

// The look: props.variant (chosen in build mode's Design tool), else seeded by id.
function variantOf(o: ItemRef): number {
  return lookOf(o, seedOf(o.id));
}
function variantsOf(kind: string): number {
  return entry(kind).variants ?? GENS[kind].variants;
}

export interface ItemRef {
  kind: string;
  id: string;
  rot: number;
  props?: Props;
}

// Texture cache key: equal drawings share one texture.
export function itemKey(o: ItemRef, slice: string, group: Group, res: number): string {
  const g = GENS[o.kind];
  return `it|${o.kind}|${o.rot}|${slice}|${group}|${variantOf(o)}|${g.key?.(o.props ?? {}) ?? ""}|${res}`;
}

// Wall items hang on the face of the thin wall along their tile's north edge.
export const WALL_FACE = 0.1;

// How an item's sketch is set up, and drawing it into one: the third-person
// view (world/tp) draws the same items into its own 3D sketch.
export function itemSketchOpts(o: ItemRef): {
  rot: number;
  w: number;
  h: number;
  seed: number;
  offset?: [number, number];
} {
  const e = entry(o.kind);
  return {
    rot: o.rot,
    w: e.w,
    h: e.h,
    seed: (variantOf(o) + 0.5) / variantsOf(o.kind),
    offset: e.wall ? [0, WALL_FACE] : undefined,
  };
}
export function drawItem(s: Sketch, o: ItemRef) {
  GENS[o.kind].draw(s, o.props ?? {});
}

function sketch(o: ItemRef, clip: Clip | null, group: Group): Sketch {
  const s = new Sketch({ ...itemSketchOpts(o), clip, group });
  drawItem(s, o);
  return s;
}

export function itemArt(o: ItemRef, clip: Clip | null, group: Group, res: number): ItemArt | null {
  return sketch(o, clip, group).finish(res);
}

export function itemShadow(o: ItemRef): ItemArt | null {
  return sketch(o, null, "all").finishShadow(1);
}

// Flat items live on the floor layer (no depth slices).
export function isFlatArt(kind: string): boolean {
  return kind === "rug" || kind === "standup_mat";
}

// ── walls (map v2) ───────────────────────────────────────────────────────────
// One quarter `q` (0..3) of a wall on an edge, low or high part. Edge-local:
// "h" runs along x from (0, 0), "v" along y.
// `cut`: the hole a door or window in it makes (shared openings.ts).
type Cut = readonly [number, number] | null | undefined;
export function wallKey(dir: "h" | "v", ch: string, q: number, part: WallPart, res: number, cut?: Cut): string {
  return `wl|${dir}|${ch}|${q}|${part}|${res}|${cut ? cut.join("-") : ""}`;
}
export function wallArt(dir: "h" | "v", ch: string, q: number, part: WallPart, res: number, cut?: Cut): ItemArt | null {
  const clip =
    dir === "h" ? { x0: q / 4, x1: (q + 1) / 4, y0: -1, y1: 1 } : { x0: -1, x1: 1, y0: q / 4, y1: (q + 1) / 4 };
  const s = new Sketch({ w: 1, h: 1, clip, seed: 0.37 });
  wall(s, dir, ch, part, undefined, cut);
  return s.finish(res);
}
export function postArt(height: number, part: WallPart, ch: string, res: number): ItemArt | null {
  const s = new Sketch({ w: 1, h: 1 });
  post(s, height, part, ch);
  return s.finish(res);
}

// ── dressing (the rooms' clutter) ───────────────────────────────────────────
// Seeds are bucketed so look-alike pieces share a texture.
const bucket = (seed: number) => (Math.floor(seed * 12) + 0.5) / 12;
export function dressKey(kind: DressKind, z: number, seed: number, res: number): string {
  return `dr|${kind}|${z}|${bucket(seed).toFixed(3)}|${res}`;
}
export function dressArt(kind: DressKind, z: number, seed: number, res: number): ItemArt | null {
  const s = new Sketch({ w: 1, h: 1, seed: bucket(seed) });
  dressing(s, kind, z, bucket(seed));
  return s.finish(res);
}
export function dressShadow(kind: DressKind, z: number, seed: number): ItemArt | null {
  if (z > 0 || kind === "frame") return null;
  const s = new Sketch({ w: 1, h: 1, seed: bucket(seed) });
  dressing(s, kind, z, bucket(seed));
  return s.finishShadow(1);
}
