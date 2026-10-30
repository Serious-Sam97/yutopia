"use client";

import type { BuildingKind, WayKind } from "@yutopia/shared/grounds";
import type { LandMode, Paint, TreePick } from "@yutopia/shared/grounds-brush";
import type { ThingKind } from "@yutopia/shared/grounds-edits";
import type { BattleEvent, Needs, PetLook, PetOutfit, Species } from "@yutopia/shared/pets";
import { useRef, useSyncExternalStore } from "react";
import type { Setup } from "@/lib/api";

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

export type SideTab = "people" | "room";

// The phone (world/phone, docs/plan/21-cellphone.md) as the rest of the HUD
// sees it; the phone's own screens keep their state in its chunk (phone/store.ts).
export interface PhoneHud {
  open: boolean; // out of the pocket, its screen up
  loaded: boolean; // its chunk is in
  badge: number; // unread texts + missed calls
  ringing: boolean; // a call coming in
  onCall: boolean; // a call going on
  camera: boolean; // the viewfinder is up (the HUD steps aside)
}

export type PanelKind =
  | "whiteboard"
  | "radio"
  | "standup"
  | "screen"
  | "notice"
  | "coffee"
  | "piano"
  | "slotcar"
  | "pool"
  | "pong"
  | "console"
  | "tv"
  | "games"
  | "media"
  | "settings"
  | "pads"
  | "avatar"
  | "pets"
  | "emotes" // the emote wheel, held (docs/plan/56-the-controls.md phase 6)
  | "computer"
  | "motors" // the car dealer's (car/cars.ts registers it: docs/plan/43-the-spot.md)
  | "admin" // Run the place: admins only (docs/plan/48-the-admin.md)
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
  subtitle?: string; // a desk's owner, someone's status…
  items: { act: string; ok: boolean }[]; // ok false: shown, greyed out
  /** the one chosen on the keys or a pad (docs/plan/56-the-controls.md C): none, opened by a tap */
  sel?: number;
}
/** What's in front of me I could act on, best first (docs/plan/56-the-controls.md C): the prompt's
 *  stack; `at` the focus. */
export interface FocusHud {
  items: { key: string; kind: string; label: string; act: string; objectId?: string }[];
  at: number;
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
  ports: { name: string; me: boolean; analog?: boolean }[]; // one per pad (analog: its sticks on)
  myPort: number; // 0 when I hold none
  near: boolean;
  // a TV: the consoles plugged into it and which one it shows
  inputs?: { id: string; label: string; title: string; on: boolean }[];
  input?: string;
  // the host's disc on its way down (bytes), before the console can start
  loading?: [number, number] | null;
}

export type BuildTool = "furniture" | "walls" | "rooms" | "desks" | "map";
export type PaintMode = "line" | "box" | "fill" | "erase";
/** God mode's tools (the bottom bar): Select, then each kind of edit (phases 6–9 of plan 53). */
export const GOD_TOOLS = ["select", "land", "paint", "roads", "nature", "things", "buildings"] as const;
export type GodTool = (typeof GOD_TOOLS)[number];
/** The tools built so far (the rest: phases 7–9 of plan 53). */
export const GOD_READY: ReadonlySet<GodTool> = new Set<GodTool>([
  "select",
  "land",
  "paint",
  "roads",
  "nature",
  "things",
  "buildings",
]);
/** One of my drafts, as the list has it (the API's row: no data). */
export interface GodDraftRow {
  id: number;
  name: string;
  baseRev: number;
  size: number;
  changes: number;
  createdAt: string;
  updatedAt: string;
}
export interface GodHud {
  on: boolean;
  /** on foot in the draft (Walk it) */
  walking: boolean;
  /** the camera's metres over the ground, and the way it looks (radians: east 0, south π/2) */
  up: number;
  yaw: number;
  /** the place under the camera */
  place: string;
  tool: GodTool;
  /** what the Select tool has picked: a thing, a building or a way (its tool's `sel` says which) */
  picked: "thing" | "building" | "way" | null;
  /** the grid the tools snap to (m; 0: off) */
  snap: 0 | 1 | 4;
  /** the land under the pointer (the Grounds' coords, its height, what's on it; what they were
   *  published, where the draft changed them) */
  pointer: { x: number; z: number; h: number; surface: string; was: number | null; wasSurface: string | null } | null;
  /** the land brush (phase 6): what it does, how big (m across), how strong (1–100) */
  land: { mode: LandMode; size: number; strength: number };
  /** the paint brush: what it puts down ("generated": as made), how big */
  paint: { surface: Paint; size: number };
  /** what the draft does to what stands on the land (a plot tipped, a way made steep) */
  issues: string[];
  /** the roads tool (phase 7): drawing a new way, moving a way's points, taking one away; a new
   *  way's kind, width, pavements and lamps (or the picked way's) */
  roads: {
    mode: "draw" | "edit" | "remove";
    kind: WayKind;
    w: number;
    pave: boolean;
    lamps: boolean;
    /** the way being drawn: its points so far, how long, what's in its way, what it joins */
    drawing: { n: number; m: number; blocked: string | null; joins: string | null } | null;
    /** the way picked (Edit points), its name, why it can't be moved (the shuttle's) */
    sel: { key: string; name: string; locked: string | null } | null;
  };
  /** the nature tool (phase 8): the forest brush (plant, clear, as made), one tree, one rock */
  nature: { mode: "plant" | "clear" | "generated" | "tree" | "rock"; pick: TreePick; thick: number; size: number };
  /** the things tool (phase 8): putting one down (or a fence along a line), the kind, how it's
   *  turned (°), sized, what a sign says; the thing picked, what's in the way, a fence drawn */
  things: {
    mode: "place" | "line";
    kind: ThingKind;
    ry: number;
    s: number;
    text: string;
    sel: { key: string; kind: ThingKind; locked: string | null } | null;
    blocked: string | null;
    drawing: { n: number; m: number } | null;
  };
  /** the buildings tool (phase 9): the prefab to put down (or the picked one's): its kind, size
   *  (m), floors, door's side, walls' colour (null: its kind's), whether you walk in, its sign */
  buildings: {
    kind: BuildingKind;
    w: number;
    d: number;
    floors: number;
    face: "n" | "e" | "s" | "w";
    tint: string | null;
    enter: boolean;
    name: string;
    sign: string;
    sel: { key: string; locked: string | null } | null;
    blocked: string | null;
  };
  /** the draft open (docs/plan/55-the-drafts.md): its id (null: none yet — the first change asks
   *  its name) and name */
  draft: { id: number | null; name: string };
  /** a new draft's name asked (the dialog): the first change's, or the list's New draft */
  naming: { name: string; why: "first" | "new" } | null;
  /** my drafts: the list shown or not, the rows (null: not fetched), how many I may keep */
  drafts: { open: boolean; list: GodDraftRow[] | null; max: number; failed: boolean };
  /** what the draft changes against what's published */
  changes: number;
  save: "idle" | "saving" | "saved" | "failed";
  undo: number;
  redo: number;
  /** the revision published (and the draft made on it) */
  rev: number;
  /** the draft fetched */
  loaded: boolean;
  /** the publish dialog: open, sending, or refused with why */
  publish: { state: "open" | "sending" | "refused"; reason?: string; problems?: string[] } | null;
}

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

/** Where a car is (the building's coords, the GPS's) and what the place is called (the phone's GPS). */
export interface CarAt {
  id: string;
  x: number;
  z: number;
  where: string;
}
export interface HudState {
  phase: "loading" | "connecting" | "ready" | "reconnecting" | "failed" | "kicked" | "removed";
  error: string;
  // the world being built behind the loading screen (docs/plan/35-the-loading.md): on
  // entering, and on every change between iso and 3D; progress 0..1
  loading: { on: boolean; progress: number; why: "enter" | "view" };
  worldName: string; // the one world's name (the API's YUTOPIA_WORLD_NAME)
  canBuild: boolean; // everyone, with a real account
  isAdmin: boolean; // mutes, kicks, locks
  removed: { uid: number; name: string; until: number }[]; // (admins) removed for a while
  me: Person | null;
  people: Person[];
  side: SideTab | null; // the right-hand panel and its tab
  phone: PhoneHud;
  heardBy: number[]; // user ids who can hear me right now
  prompt: { objectId: string; kind: string; label: string } | null;
  targets: FocusHud | null;
  /** the Kart Park's lobby or circuits are up (their buttons want the pointer: docs/plan/56 A) */
  kartUi: boolean;
  /** locked on to (docs/plan/56-the-controls.md E): who or what */
  lockOn: { label: string } | null;
  /** a pad's what I last touched (the prompts show its buttons) */
  padLive: boolean;
  held: { kind: string; at: number } | null; // what I carry (a mug, a ball…) and since when (server ms)
  throwArm: boolean; // the next floor click throws what I hold (or points the laser)
  cable: { consoleId: string } | null; // a console's cable in my hands, on the way to a TV
  menu: ActionMenu | null;
  queue: QueuedAct[];
  focus: boolean; // heads down at my desk
  torch: boolean; // my phone's flashlight on
  mySpawn: { x: number; y: number } | null; // where I arrive (null: the world's arrival point)
  pickArrival: boolean; // choosing it on the map: the next floor click sets it
  panel: { kind: PanelKind; objectId?: string };
  knocks: { from: string; fromName: string; area: string; at: number }[];
  toasts: { id: number; text: string; tone: "info" | "warn" | "vortex" }[];
  media: {
    ready: boolean;
    offline: boolean;
    asleep: boolean; // the voice line closed after a quiet spell (wakes on demand)
    mic: boolean;
    cam: boolean;
    screen: boolean;
    micError: string;
    camError: string;
    quality: string;
  };
  videos: Record<string, HTMLVideoElement>; // uid → camera video
  screens: Record<string, HTMLVideoElement>; // uid → screen share video
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
    brush: string; // "w:" + an edge char (walls) or a floor char (tiles)
    catalogTab: string; // the catalog's tab (the Walls panel sends you to Doors or Windows)
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
    // the last change: still on its way (saving) or what the API said
    save: { state: "idle" | "saving" | "saved" | "failed" | "rejected"; at: number };
    setups: Setup[] | null; // my saved setups (null until loaded)
  };
  /** God mode (docs/plan/53-the-god-mode.md): an admin building the open world (world/god) */
  god: GodHud;
  mapVersion: number;
  // the building (shared levels.ts): the floor I'm on, and every floor there is
  floor: number;
  floors: number[];
  // in an elevator's car with its doors open (features/lifts.ts): its stop on
  // my floor, the floors it goes to (and their names), where it is
  // in an elevator's car: its floors, and what it's doing (the panel's status)
  lift: {
    id: string;
    floors: { level: number; name: string }[];
    at: number;
    to: number;
    phase: string;
  } | null;
  objectsVersion: number; // bumps when furniture arrives, moves or goes
  following: number | null;
  /** my own bay of the lot (docs/plan/43-the-spot.md), its label ("D-05"), or null */
  myBay: string | null;
  /** my own car (docs/plan/43-the-spot.md): its object, plate, model, who holds its keys */
  myCar: (CarAt & { plate: string; model: string; lentTo: number; lentName: string }) | null;
  /** someone's car keys I hold today: whose, its plate, where it is */
  keys: (CarAt & { from: string; plate: string }) | null;
  inspect: number | null;
  locks: Record<string, string>;
  vortex: { x: number; y: number; say: string; sayAt: number; mood: string } | null;
  pets: PetInfo[]; // every pet in the room (mine first)
  myPetsAt: { x: number; y: number }[]; // where my pets are (the minimap: one off exploring)
  myCarAt: { x: number; y: number } | null; // the car I last drove (the minimap; world/car/cars.ts)
  petFocus: string | null; // the pet the panel shows (null: my first)
  battle: BattleView | null; // the battle one of my pets is in
  challenge: { battle: string; fromName: string; pet: string; mine: string } | null; // a battle proposed to me
  fps: number;
  look: boolean; // mouse look (3D): the pointer locked, the mouse turns the camera
}

const initial: HudState = {
  phase: "loading",
  error: "",
  loading: { on: true, progress: 0, why: "enter" },
  worldName: "",
  canBuild: false,
  isAdmin: false,
  removed: [],
  me: null,
  people: [],
  side: null,
  phone: { open: false, loaded: false, badge: 0, ringing: false, onCall: false, camera: false },
  heardBy: [],
  prompt: null,
  targets: null,
  lockOn: null,
  kartUi: false,
  padLive: false,
  held: null,
  throwArm: false,
  cable: null,
  menu: null,
  queue: [],
  focus: false,
  torch: false,
  mySpawn: null,
  pickArrival: false,
  panel: { kind: null },
  knocks: [],
  toasts: [],
  media: {
    ready: false,
    offline: false,
    asleep: false,
    mic: false,
    cam: false,
    screen: false,
    micError: "",
    camError: "",
    quality: "unknown",
  },
  videos: {},
  screens: {},
  radio: { id: "", playing: false, station: 0, startedAt: 0, by: "", source: "lofi", title: "" },
  standup: { active: false, order: [], turn: 0, turnStartedAt: 0, turnSeconds: 90 },
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
    catalogTab: "seating",
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
  god: {
    on: false,
    walking: false,
    up: 80,
    yaw: 0,
    place: "",
    tool: "select",
    picked: null,
    snap: 4,
    pointer: null,
    land: { mode: "raise", size: 24, strength: 40 },
    paint: { surface: "path", size: 4 },
    issues: [],
    roads: { mode: "draw", kind: "road", w: 7, pave: false, lamps: true, drawing: null, sel: null },
    nature: { mode: "plant", pick: "mix", thick: 55, size: 24 },
    things: { mode: "place", kind: "bench", ry: 0, s: 1, text: "", sel: null, blocked: null, drawing: null },
    buildings: {
      kind: "house",
      w: 12,
      d: 10,
      floors: 2,
      face: "e",
      tint: null,
      enter: false,
      name: "",
      sign: "",
      sel: null,
      blocked: null,
    },
    draft: { id: null, name: "" },
    naming: null,
    drafts: { open: false, list: null, max: 20, failed: false },
    changes: 0,
    save: "idle",
    undo: 0,
    redo: 0,
    rev: 0,
    loaded: false,
    publish: null,
  },
  mapVersion: 0,
  floor: 0,
  floors: [0],
  lift: null,
  objectsVersion: 0,
  following: null,
  myBay: null,
  myCar: null,
  keys: null,
  inspect: null,
  locks: {},
  vortex: null,
  pets: [],
  myPetsAt: [],
  myCarAt: null,
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
