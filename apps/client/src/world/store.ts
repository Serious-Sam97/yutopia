"use client";

import type { Emote } from "@yutopia/shared";
import type { BattleEvent, Needs, PetLook, PetOutfit, Species } from "@yutopia/shared/pets";
import { useRef, useSyncExternalStore } from "react";
import type { BoardSummary, MemberStatus, Setup } from "@/lib/api";

// One small external store for everything the HUD shows. The world loop writes,
// React reads with useHud(selector).

export interface Person {
  sid: string;
  uid: number;
  name: string;
  avatar: string; // the avatar seed (parseAvatar)
  area: string;
  areaName: string;
  status: string;
  mic: boolean;
  cam: boolean;
  screen: boolean;
  speaking: boolean;
  bot: boolean;
  muted: boolean;
  hearing: boolean;
  x: number;
  y: number;
}

export interface ChatMsg {
  id: string;
  from: string;
  fromName: string;
  text: string;
  scope: "nearby" | "area" | "space";
  at: number;
  mine: boolean;
  vortex?: boolean;
  reactions?: Partial<Record<Emote, number[]>>; // emote → who reacted (user ids)
}

export type SideTab = "chat" | "people" | "room";

export type PanelKind =
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
  | "piano"
  | "slotcar"
  | "console"
  | "tv"
  | "games"
  | "media"
  | "settings"
  | "avatar"
  | "pets"
  | "computer"
  | null;

// A pet in the room (shared/pets.ts), as the panel and the menus see it.
export interface PetInfo {
  id: string;
  uid: number;
  owner: string;
  mine: boolean;
  name: string;
  species: Species;
  look: PetLook;
  outfit: PetOutfit;
  needs: Needs;
  xp: number;
  level: number;
  tricks: Record<string, number>;
  alive: boolean;
  wins: number;
  losses: number;
  mode: string;
  act: string;
  battle: string;
  near: boolean; // close enough to care for it
  want: string; // what's on its mind (shared WANTS), "" for nothing
  traits: Record<string, number>; // shared/mind.ts Traits (0..1)
  bonds: Record<string, number>; // uid → 0..100
}
// A battle I'm in (or watching): both sides, whose move is pending.
export interface BattleView {
  id: string;
  a: string; // pet ids
  b: string;
  mine: "a" | "b" | null;
  hpA: number;
  hpB: number;
  maxA: number;
  maxB: number;
  moveA: string;
  moveB: string;
  round: number;
  phase: string;
  until: number;
  log: BattleEvent[];
  winner: string;
}

// The action menu (click a thing or a person) and the queue of what you picked.
export type ActTarget =
  | { type: "object"; id: string }
  | { type: "person"; sid: string }
  | { type: "pet"; id: string }
  | { type: "self" };
export interface ActionMenu {
  x: number; // where it opens (client px)
  y: number;
  target: ActTarget;
  title: string;
  subtitle?: string; // a desk's owner and their card, someone's status…
  items: { act: string; ok: boolean }[]; // ok false: shown, greyed out
}
export interface QueuedAct {
  key: number;
  act: string;
  title: string;
  target: ActTarget;
  running: boolean;
}

// The slot-car track whose controls are open (world/slots.ts): its race, lane by lane.
export interface SlotLane {
  name: string;
  uid: number;
  mine: boolean;
  lap: number;
  best: number; // s, 0 for none yet
  last: number;
  place: number; // 1.. once finished
  time: number; // race time at the flag (s)
  offs: number; // times it flew off
  pos: number; // where it is in the race right now (1..), 0 outside a race
}
export interface SlotView {
  id: string;
  phase: "lobby" | "countdown" | "race" | "done";
  lights: number; // 1..5 during the countdown
  laps: number;
  diff: string; // the race's difficulty (shared/slotcar.ts SlotDiff)
  track: string; // the track on the table (SlotTrackId)
  by: string;
  lanes: (SlotLane | null)[];
  mine: number; // my lane, −1 for none
  near: boolean; // close enough to take a lane
}

// The game room panel's view of a console (world/games/room.ts), or of a TV.
export interface GameView {
  id: string; // the console (or the TV, for kind "tv")
  kind: string;
  system: string;
  tv: string | null; // the TV it's plugged into
  tvs: string[]; // TVs its cable reaches, nearest first: "<id>|<tiles away>"
  cart: { id: string; title: string; color: string } | null;
  on: boolean;
  host: string; // who runs it ("" while paused)
  hostMe: boolean;
  live: boolean;
  ports: { name: string; me: boolean }[]; // one per pad
  myPort: number; // 0 when I hold none
  near: boolean;
  // a TV: the consoles plugged into it and which one it shows
  inputs?: { id: string; label: string; title: string; on: boolean }[];
  input?: string;
}

export type BuildTool = "furniture" | "walls" | "rooms" | "desks" | "map";
export type PaintMode = "line" | "box" | "fill" | "erase";
// The Walls tool, Sims-style (docs/plan/11-wall-building.md): build walls and
// openings, paint wall faces, paint floors, or select walls (the inspector).
export type WallMode = "build" | "paint" | "floors" | "select";
// how walls show while building: all up, cut away round what you point at, all down
export type WallView = "up" | "cut" | "down";
// The chip by the pointer in the Walls tool: the face it's on (which side, the
// room it looks into, its material now → the brush's), or a run being drawn.
export type WallTag =
  | {
      kind: "face";
      far: boolean;
      room: string | null;
      from: string | null;
      to: string | null;
      why: string | null;
      n: number;
    }
  | { kind: "run"; n: number; w?: number; h?: number; remove: boolean; skipped: number; why: string | null };
export interface WallPanel {
  dir: "h" | "v";
  x: number;
  y: number;
  side: 1 | -1;
}

export interface HudState {
  phase: "loading" | "connecting" | "ready" | "reconnecting" | "failed" | "kicked" | "removed";
  error: string;
  spaceId: number;
  spaceName: string;
  projectId: number | null;
  canBuild: boolean;
  me: Person | null;
  people: Person[];
  chat: ChatMsg[];
  side: SideTab | null; // the right-hand panel and its tab
  chatUnread: number;
  heardBy: number[]; // user ids who can hear me right now
  prompt: { objectId: string; kind: string; label: string } | null;
  held: { kind: string; at: number } | null; // what I carry (a mug, a ball…) and since when (server ms)
  throwArm: boolean; // the next floor click throws what I hold (or points the laser)
  cable: { consoleId: string } | null; // a console's cable in my hands, on the way to a TV
  menu: ActionMenu | null;
  queue: QueuedAct[];
  focus: boolean; // heads down at my desk
  mySpawn: { x: number; y: number } | null; // where I arrive here (null: the space's arrival point)
  pickArrival: boolean; // choosing it on the map: the next floor click sets it
  panel: { kind: PanelKind; objectId?: string };
  knocks: { from: string; fromName: string; area: string; at: number }[];
  toasts: { id: number; text: string; tone: "info" | "warn" | "vortex" }[];
  media: {
    ready: boolean;
    offline: boolean;
    mic: boolean;
    cam: boolean;
    screen: boolean;
    micError: string;
    camError: string;
    quality: string;
  };
  videos: Record<string, HTMLVideoElement>; // uid → camera video
  screens: Record<string, HTMLVideoElement>; // uid → screen share video
  boards: BoardSummary[];
  status: Record<number, MemberStatus["doing"]>;
  // the radio I hear (or the nearest one playing): each radio plays its own
  radio: {
    id: string;
    playing: boolean;
    station: number;
    startedAt: number;
    by: string;
    source: "lofi" | "yt";
    title: string;
  };
  standup: { active: boolean; order: number[]; turn: number; turnStartedAt: number; turnSeconds: number };
  poker: { open: boolean; cardId: number; boardId: number; title: string; by: string };
  slot: SlotView | null;
  game: GameView | null;
  build: {
    on: boolean;
    tool: BuildTool;
    kind: string; // the catalog item to place (mode "place")
    rot: number;
    // furniture: the Sims hand (pick up / move), placing from the catalog, or
    // the eyedropper (click something to place copies of it)
    mode: "hand" | "place" | "eyedrop";
    held: string[]; // placed things in your hand right now
    carrying: number; // everything in your hand (new copies too)
    selected: string[];
    // the thing under the pointer (its name, and who's holding it), for the tag
    // (of: which of the things stacked under the pointer it is; Tab steps through them)
    hover: { label: string; by: string | null; of?: { i: number; n: number } } | null;
    brush: string; // "w:" + an edge char (walls), a floor char (tiles), or "door"
    paintMode: PaintMode;
    wallMode: WallMode;
    paint: string; // the material Paint puts on faces (p w f b k)
    wallView: WallView;
    wallTag: WallTag | null;
    wallSel: WallPanel[]; // walls selected (Select): the inspector's
    props: Record<string, unknown> | null; // what new furniture copies (C)
    fits: boolean; // the ghost under the pointer fits
    roomDraft: { x: number; y: number; w: number; h: number } | null;
    deskDraft: string | null;
    pickSpawn: boolean;
    history: { undo: number; redo: number; undoLabel: string | null; redoLabel: string | null };
    // the last change: still on its way (saving) or what Yondra said
    save: { state: "idle" | "saving" | "saved" | "failed" | "rejected"; at: number };
    setups: Setup[] | null; // my saved setups (null until loaded)
  };
  mapVersion: number;
  objectsVersion: number; // bumps when furniture arrives, moves or goes
  following: number | null;
  inspect: number | null;
  locks: Record<string, string>;
  vortex: { x: number; y: number; say: string; sayAt: number; mood: string } | null;
  pets: PetInfo[]; // every pet in the room (mine first)
  petFocus: string | null; // the pet the panel shows (null: my first)
  battle: BattleView | null; // the battle one of my pets is in
  challenge: { battle: string; fromName: string; pet: string; mine: string } | null; // a battle proposed to me
  fps: number;
  look: boolean; // mouse look (3D): the pointer locked, the mouse turns the camera
}

const initial: HudState = {
  phase: "loading",
  error: "",
  spaceId: 0,
  spaceName: "",
  projectId: null,
  canBuild: false,
  me: null,
  people: [],
  chat: [],
  side: null,
  chatUnread: 0,
  heardBy: [],
  prompt: null,
  held: null,
  throwArm: false,
  cable: null,
  menu: null,
  queue: [],
  focus: false,
  mySpawn: null,
  pickArrival: false,
  panel: { kind: null },
  knocks: [],
  toasts: [],
  media: {
    ready: false,
    offline: false,
    mic: false,
    cam: false,
    screen: false,
    micError: "",
    camError: "",
    quality: "unknown",
  },
  videos: {},
  screens: {},
  boards: [],
  status: {},
  radio: { id: "", playing: false, station: 0, startedAt: 0, by: "", source: "lofi", title: "" },
  standup: { active: false, order: [], turn: 0, turnStartedAt: 0, turnSeconds: 90 },
  poker: { open: false, cardId: 0, boardId: 0, title: "", by: "" },
  slot: null,
  game: null,
  build: {
    on: false,
    tool: "furniture",
    kind: "plant",
    rot: 0,
    mode: "hand",
    held: [],
    carrying: 0,
    selected: [],
    hover: null,
    brush: "w:p",
    paintMode: "line",
    wallMode: "build",
    paint: "b",
    wallView: "cut",
    wallTag: null,
    wallSel: [],
    props: null,
    fits: true,
    roomDraft: null,
    deskDraft: null,
    pickSpawn: false,
    history: { undo: 0, redo: 0, undoLabel: null, redoLabel: null },
    save: { state: "idle", at: 0 },
    setups: null,
  },
  mapVersion: 0,
  objectsVersion: 0,
  following: null,
  inspect: null,
  locks: {},
  vortex: null,
  pets: [],
  petFocus: null,
  battle: null,
  challenge: null,
  fps: 0,
  look: false,
};

let state: HudState = initial;
const subs = new Set<() => void>();

export const hud = {
  get: () => state,
  set(patch: Partial<HudState> | ((s: HudState) => Partial<HudState>)) {
    const p = typeof patch === "function" ? patch(state) : patch;
    state = { ...state, ...p };
    for (const s of subs) s();
  },
  reset() {
    state = initial;
    for (const s of subs) s();
  },
  subscribe(cb: () => void) {
    subs.add(cb);
    return () => {
      subs.delete(cb);
    };
  },
};

let toastId = 1;
export function toast(text: string, tone: "info" | "warn" | "vortex" = "info", ms = 4500) {
  const id = toastId++;
  hud.set((s) => ({ toasts: [...s.toasts.slice(-3), { id, text, tone }] }));
  setTimeout(() => hud.set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), ms);
}

// Selectors may derive new arrays/objects (filter, `?? []`); cache the result per
// store state so useSyncExternalStore always sees a stable snapshot.
export function useHud<T>(sel: (s: HudState) => T): T {
  const cache = useRef<{ s: HudState | null; v: T; si: T | typeof UNSET }>({ s: null, v: undefined as T, si: UNSET });
  const get = () => {
    const c = cache.current;
    if (c.s !== state) {
      c.s = state;
      c.v = sel(state);
    }
    return c.v;
  };
  const getServer = () => {
    const c = cache.current;
    if (c.si === UNSET) c.si = sel(initial);
    return c.si as T;
  };
  return useSyncExternalStore(hud.subscribe, get, getServer);
}

const UNSET = Symbol("unset");
