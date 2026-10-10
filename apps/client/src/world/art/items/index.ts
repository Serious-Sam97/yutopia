import { entry } from "@yutopia/shared";
import { boardWall } from "./board";
import { chair } from "./chair";
import { desk } from "./desk";
import { door, rug, standupMat } from "./door";
import { type Clip, type Group, type ItemArt, Sketch, seedOf } from "./kit";
import { lamp } from "./lamp";
import { micStand, mixingDesk, radio, speakerCab, tapeShelf } from "./music";
import { PLANT_VARIANTS, plant } from "./plant";
import { armchair, bench } from "./seating";
import { sofa } from "./sofa";
import { coffeeTable, meetingTable, reception } from "./tables";
import { arcade, coffeeMachine, crtTerminal, serverRack } from "./tech";
import { acousticPanel, noticeBoard, poster, screenWall, whiteboard } from "./wall";
import { post, type WallPart, wall } from "./walls";

type Props = Record<string, unknown>;

// Marks this chunk for `pnpm budget` (it loads lazily, outside the page's files).
export const ITEM_ART_CHUNK = "yutopia-item-art";

// Illustrated items. `variants`: how many seeded looks an item has (the seed
// picks one, so equal items share textures); `key`: the props that change the
// drawing.
interface ItemGen {
  draw: (s: Sketch, props: Props) => void;
  variants: number;
  key?: (props: Props) => string;
}

const occupied = (p: Props) => (p.occupied ? "sit" : "");

const GENS: Record<string, ItemGen> = {
  desk: { draw: desk, variants: 4 },
  chair: { draw: chair, variants: 4, key: occupied },
  armchair: { draw: armchair, variants: 2, key: occupied },
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
  screen_wall: { draw: screenWall, variants: 1 },
  whiteboard: { draw: whiteboard, variants: 1 },
  notice_board: { draw: noticeBoard, variants: 3 },
  acoustic_panel: { draw: acousticPanel, variants: 1 },
  poster: { draw: poster, variants: 1, key: (p) => String(p.art ?? "tape") },
  door: {
    draw: door,
    variants: 1,
    key: (p) => {
      const st = String(p.state ?? "open");
      const shut = (st === "closed" || st === "locked") && !p.passing ? st : "open";
      return `${shut}|${p._part ?? "edge"}|${p.glass ? "g" : ""}`;
    },
  },
  rug: { draw: rug, variants: 1 },
  standup_mat: { draw: standupMat, variants: 1 },
  sofa: { draw: sofa, variants: 3 },
  lamp: { draw: lamp, variants: 1, key: (p) => (p.on === false ? "off" : "on") },
  plant: { draw: plant, variants: PLANT_VARIANTS, key: (p) => (typeof p.variant === "number" ? `v${p.variant}` : "") },
  board_wall: { draw: boardWall, variants: 1 },
};

export function hasItemArt(kind: string): boolean {
  return Object.hasOwn(GENS, kind);
}

function variantOf(kind: string, id: string): number {
  const g = GENS[kind];
  return Math.floor(seedOf(id) * g.variants);
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
  return `it|${o.kind}|${o.rot}|${slice}|${group}|${variantOf(o.kind, o.id)}|${g.key?.(o.props ?? {}) ?? ""}|${res}`;
}

// Wall items hang on the face of the thin wall along their tile's north edge.
export const WALL_FACE = 0.1;

function sketch(o: ItemRef, clip: Clip | null, group: Group): Sketch {
  const g = GENS[o.kind];
  const e = entry(o.kind);
  const s = new Sketch({
    rot: o.rot,
    w: e.w,
    h: e.h,
    clip,
    group,
    seed: (variantOf(o.kind, o.id) + 0.5) / g.variants,
    offset: e.wall ? [0, WALL_FACE] : undefined,
  });
  g.draw(s, o.props ?? {});
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
export function wallKey(dir: "h" | "v", ch: string, q: number, part: WallPart, res: number): string {
  return `wl|${dir}|${ch}|${q}|${part}|${res}`;
}
export function wallArt(dir: "h" | "v", ch: string, q: number, part: WallPart, res: number): ItemArt | null {
  const clip =
    dir === "h" ? { x0: q / 4, x1: (q + 1) / 4, y0: -1, y1: 1 } : { x0: -1, x1: 1, y0: q / 4, y1: (q + 1) / 4 };
  const s = new Sketch({ w: 1, h: 1, clip, seed: 0.37 });
  wall(s, dir, ch, part);
  return s.finish(res);
}
export function postArt(height: number, part: WallPart, res: number): ItemArt | null {
  const s = new Sketch({ w: 1, h: 1 });
  post(s, height, part);
  return s.finish(res);
}
