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
  | "lamp";

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
}

export const CATALOG = {
  desk: { label: "Desk", w: 2, h: 1, solid: true, buildable: true },
  chair: { label: "Chair", w: 1, h: 1, solid: false, seat: true, buildable: true },
  board_wall: { label: "Board wall", w: 3, h: 1, solid: false, wall: true, interact: "board", buildable: true },
  screen_wall: { label: "Big screen", w: 4, h: 1, solid: false, wall: true, interact: "screen", buildable: true },
  whiteboard: { label: "Whiteboard", w: 2, h: 1, solid: false, wall: true, interact: "whiteboard", buildable: true },
  notice_board: { label: "Notice board", w: 2, h: 1, solid: false, wall: true, interact: "notice", buildable: true },
  acoustic_panel: { label: "Acoustic panel", w: 1, h: 1, solid: false, wall: true, buildable: true },
  poster: { label: "Poster", w: 1, h: 1, solid: false, wall: true, buildable: true },
  meeting_table: { label: "Meeting table", w: 6, h: 2, solid: true, interact: "poker", buildable: true },
  coffee_table: { label: "Coffee table", w: 2, h: 1, solid: true, buildable: true },
  sofa: { label: "Sofa", w: 3, h: 1, solid: true, buildable: true },
  armchair: { label: "Armchair", w: 1, h: 1, solid: false, seat: true, buildable: true },
  bench: { label: "Bench", w: 3, h: 1, solid: false, seat: true, buildable: true },
  plant: { label: "Plant", w: 1, h: 1, solid: true, buildable: true },
  lamp: {
    label: "Floor lamp",
    w: 1,
    h: 1,
    solid: true,
    interact: "lamp",
    light: { color: 0xffb35c, radius: 4.5, intensity: 0.55 },
    buildable: true,
  },
  rug: { label: "Rug", w: 4, h: 3, solid: false, buildable: true },
  arcade: { label: "Arcade cabinet", w: 1, h: 1, solid: true, interact: "arcade", buildable: true },
  radio: {
    label: "Lo-fi radio",
    w: 1,
    h: 1,
    solid: true,
    interact: "radio",
    light: { color: 0xffa630, radius: 2, intensity: 0.35 },
    buildable: true,
  },
  tape_shelf: { label: "Tape shelf", w: 2, h: 1, solid: true, buildable: true },
  coffee_machine: { label: "Coffee machine", w: 1, h: 1, solid: true, interact: "coffee", buildable: true },
  reception: { label: "Reception desk", w: 3, h: 1, solid: true, buildable: true },
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
  column: { label: "Column", w: 1, h: 1, solid: true, buildable: true },
  server_rack: {
    label: "Server rack",
    w: 1,
    h: 1,
    solid: true,
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
} satisfies Record<string, CatalogEntry>;

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
