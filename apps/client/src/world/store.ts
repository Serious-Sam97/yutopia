"use client";

import type { NpcAbout } from "@yutopia/shared";
import type { BuildingKind, WayKind } from "@yutopia/shared/grounds";
import type { LandMode, Paint, TreePick } from "@yutopia/shared/grounds-brush";
import type { BridgeRails, BridgeStyle, GrowBiome, ThingKind } from "@yutopia/shared/grounds-edits";
import type { BattleEvent, Needs, PetLook, PetOutfit, Species } from "@yutopia/shared/pets";
import { WALL_H } from "@yutopia/shared/units";
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
  // (plan 125 phase 6) the new UI's pause menu (Esc): GTA's tabs over the town's map
  | "pause"
  // (plan 125 phase 5) Ana's Case: the pack, RE4's
  | "case"
  | "strike"
  | "strike-buy"
  | "strike-esc"
  | "strike-board"
  | "strike-kit"
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
  | "chess" // at a chess table: the HUD strip (docs/plan/70-the-chess.md)
  | "npc" // a placed NPC's card: their needs, mood, work, how they feel about me (docs/plan/123, F8b; objectId: theirs)
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
  | { type: "npc"; id: string }
  // (plan 126) an animal out on the land
  | { type: "animal"; id: string }
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
/** (plan 115) The Strike Park as its menus see it (strike/strike.ts writes it when it changes). */
export interface StrikeMemberView {
  id: string;
  name: string;
  team: "r" | "w";
  bot: boolean;
  alive: boolean;
  hp: number;
  armor: number;
  helmet: boolean;
  kit: boolean;
  money: number;
  primary: string;
  pistol: string;
  nades: string;
  bomb: boolean;
  kills: number;
  deaths: number;
  assists: number;
  mvps: number;
  score: number;
  me: boolean;
  /** (plan 118) the match's damage dealt and headshot kills, the ping (ms), a "buy me this", this buy time's
   *  refundable buys */
  damage: number;
  heads: number;
  ping: number;
  want: string;
  refunds: string[];
}
export interface StrikeView {
  map: string;
  next: string;
  up: boolean;
  mode: string;
  phase: string;
  left: number;
  round: number;
  /** the rounds won, by side as it is now (Raiders, Wardens) */
  scoreR: number;
  scoreW: number;
  fill: boolean;
  /** (plan 119) the players the match keeps, bots filling (CS's bot_quota) — 0: the mode's full size */
  quota: number;
  level: string;
  members: StrikeMemberView[];
  me: StrikeMemberView | null;
  /** may buy here and now (the buy zone, the buy time) */
  canBuy: boolean;
  /** (plan 118) seconds of buy time left (0: over); the least money I'll have next round (a loss's bonus) */
  buyLeft: number;
  nextLeast: number;
  /** (plan 118) the rounds so far, each won by "r" or "w" and how (shared WinWhy) — the scoreboard's strip */
  history: { team: "r" | "w"; why: string }[];
  /** (plan 118, phase 17) my side's timeouts left (−1: none in this mode); a vote open */
  timeouts: number;
  call: {
    kind: string;
    team: "r" | "w";
    by: string;
    target: string;
    yes: number;
    no: number;
    need: number;
    left: number;
    mine: string;
  } | null;
  record: string;
  last: string;
  /** my card (shared strike/ranks.ts StrikeCard, JSON; "" till the server's sent it) */
  card: string;
  /** following the match from the lobby */
  following: boolean;
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
/** (plan 124) Build mode's Build tab: what it holds, The Sims 3's way. */
export type BuildPartKey = "walls" | "floors" | "paint" | "roof" | "rooms" | "doors" | "windows" | "stairs";
export type PaintMode = "line" | "arc" | "box" | "adjust" | "fill" | "erase";
/** God mode's tools (the bottom bar): Select, then each kind of edit (phases 6–9 of plan 53; Grow,
 *  plan 69's phase 10). */
export const GOD_TOOLS = [
  "select",
  "land",
  "paint",
  "roads",
  "nature",
  "things",
  "buildings",
  "vehicles",
  "grow",
  // (plan 109: last, so 1–9 stay the tools they were; B picks it)
  "bridges",
  // (plan 121: the cast's NPCs placed; N picks it)
  "npcs",
  // (plan 126: herds, dens, nests, places kept empty; J picks it)
  "animals",
] as const;
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
  "vehicles",
  "grow",
  "bridges",
  "npcs",
  "animals",
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
/** (plan 121) One of the cast as God mode's NPCs tool lists them. */
export interface GodNpcRow {
  key: string;
  name: string;
  role: string;
  town: boolean;
  /** their cast type (a town NPC's own) */
  type: string;
  /** their look (shared packLook's JSON; "" Vortex's) */
  look: string;
}
/** (plan 121) An inside God mode shows: its floor, said how, its floor's height (world m), the building cut away. */
export interface GodFloor {
  level: number;
  label: string;
  z: number;
  cut: string | null;
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
  /** what the Select tool has picked: a thing, a building, a way, a vehicle or a bridge (its tool's `sel` says which) */
  picked: "thing" | "building" | "way" | "vehicle" | "bridge" | "npc" | null;
  /** the grid the tools snap to (m; 0: none, free to the centimetre); Ctrl/⌘ held swaps it (none:
   *  1 m, a grid: none) */
  snap: 0 | 0.5 | 1 | 4;
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
  /** the bridges (docs/plan/109): adding one (a click where it starts on a way, another where it ends), its ends
   *  dragged, taken away; the next one's style; the one being laid (its way's name, how long, why it can't be); the
   *  one picked (its key, its way's name, the generator's or not, its look, how long) */
  bridges: {
    mode: "add" | "edit" | "remove";
    style: BridgeStyle;
    drawing: { name: string; m: number; blocked: string | null } | null;
    sel: {
      key: string;
      name: string;
      made: boolean;
      style: BridgeStyle;
      colour: number;
      rails: BridgeRails;
      piers: boolean;
      m: number;
    } | null;
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
    /** an outdoor wall's height (m) — plan 72 phase 11: god-mode walls with heights */
    h: number;
    /** a line's runs turned to steps of this (°; 0: any way) — and their ends onto other lines' */
    snapA: 0 | 15 | 45;
    /** a line's runs bent (an arc: from the last point to the next, bowed through a third click) */
    curve: boolean;
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
    /** (plan 110) its style (null: seeded), its colours (each its style's palette's; none set: seeded), shut */
    style: string | null;
    colours: { walls?: string; trim?: string; roof?: string; door?: string };
    vacant: boolean;
    sel: { key: string; locked: string | null } | null;
    blocked: string | null;
  };
  /** the vehicles (docs/plan/102): the kind to place and its look, role and heading (°); what's in the way of it;
   *  the vehicle picked (Select's): its key and kind, whether it's someone's own (moved only), a home (the town's or
   *  one placed), one placed in this draft, standing away from its home; its look, role and plate */
  /** (plan 121) the NPCs tool: the cast (the API's), the one held to place, the picked one, the step under way, the
   *  inside shown (a town building's storey, a studio floor) */
  /** (plan 126) the Animals tool: the kind of place to put down, its species, how many, how far round (an empty
   *  place's, a den's territory), its young; the place picked */
  animals: {
    /** (plan 127: "dnest" a dark nest of God mode's own, out every day; "dclear" a place kept clear of them) */
    kind: "herd" | "den" | "nest" | "empty" | "dnest" | "dclear";
    species: import("@yutopia/shared/animals/species").AnimalKind;
    n: number;
    r: number;
    young: number;
    sel: string | null;
    /** (plan 127) the picked one goes where the next click is */
    moving: boolean;
    /** (plan 127, F6a) the layers drawn: the animals' places, the dark's nests */
    layers: { animals: boolean; dark: boolean };
    /** what's drawn round the camera now (~500 m): the land's own, God mode's, the day's dark nests */
    inView: { land: number; placed: number; dark: number };
  };
  npcs: {
    cast: GodNpcRow[] | null;
    failed: boolean;
    q: string;
    held: string | null;
    /** the held one's facing (degrees) */
    a: number;
    sel: string | null;
    /** the picked one's: drawing their route, picking their home */
    step: "" | "route" | "home" | "work";
    floor: GodFloor | null;
    blocked: string | null;
  };
  vehicles: {
    kind: string;
    variant: string;
    colour: number;
    colour2: number | null;
    role: "" | "police" | "taxi" | "rental";
    a: number;
    blocked: string | null;
    sel: {
      key: string;
      kind: string;
      owned: boolean;
      home: boolean;
      placed: boolean;
      away: boolean;
      variant: string;
      colour: number;
      colour2: number | null;
      role: "" | "police" | "taxi" | "rental";
      plate: string;
    } | null;
  };
  /** the grow tool (docs/plan/69, phase 10): the next piece's biome and lift (m; or the picked
   *  one's, and its name), the piece picked (its key), what's in the way of the one being drawn,
   *  the rect being drawn (snapped) */
  grow: {
    biome: GrowBiome;
    lift: number;
    name: string;
    sel: string | null;
    blocked: string | null;
    drawing: { x0: number; z0: number; x1: number; z1: number } | null;
  };
  /** the overview map of the whole land (M) shown */
  map: boolean;
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
export type WallMode = "build" | "paint" | "floors" | "roof" | "select";
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
  | { kind: "run"; n: number; w?: number; h?: number; remove: boolean; skipped: number; why: string | null }
  // a wall drawn free (plan 72 phase 11): its length and angle, what it snapped to, the length typed
  | {
      kind: "draw";
      len: number;
      ang: number;
      snap: string;
      typed: string | null;
      remove: boolean;
      n: number;
      why: string | null;
      /** an arc being bowed: how far (m) and whether it's a half circle */
      bow?: number | null;
      half?: boolean;
      /** a wall's height and thickness (Adjust: the one under the pointer, as it's dragged) */
      height?: number;
      thick?: number;
    };
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
/** (plan 125) What the new UI's play HUD shows that the dark chunk knows (world/dark publishes it as it changes). */
export interface LampHud {
  // the body (shared vitals.ts, 0..100): health, stamina, warmth, the torch's battery
  vitals: { hp: number; st: number; wm: number; bat: number };
  // what's out: a gun drawn (its rounds in it, the mag, spare in the pack), or null
  gun: { id: string; loaded: number; mag: number; spare: number } | null;
  // the left hand (key 1): what's in it, the torch lit, a flare's seconds
  hand: { id: string | null; n: number; lit: boolean; burn: number };
  // the four at hand (keys 2–5) and the pack's counts by item (the wheel's kinds, phase 4)
  quick: ({ id: string; n: number; loaded?: number } | null)[];
  counts: Record<string, number>;
  // (phase 5) everything carried, as the case shows it: the slots and where each lies
  inv: {
    pockets: ({ id: string; n: number; loaded?: number } | null)[];
    quick: ({ id: string; n: number; loaded?: number } | null)[];
    hand: { id: string; n: number } | null;
    place: Record<number, [number, number, 0 | 1]>;
    // (F17a) what's at home: taken back into the case at home (your own room, or the lobby's locker)
    stash: { id: string; n: number; loaded?: number }[];
    // (F6a) the stickers earned (their keys: shared stickers.ts)
    stickers: string[];
  } | null;
  // GTA's big message, centred a moment (a first visit: "MAIN STREET · first time here")
  big: { id: number; title: string; sub: string } | null;
  hurt: boolean; // hurt with a first aid carried (H)
  // the feed's real news over the map (F8a): what came into the pack, what ran low
  feed: { id: number; item?: string; text: string; tone: "gold" | "warn" | "info"; at: number }[];
  // (F8a) a subtitle: who speaks (an NPC's name), what they said
  sub: { id: number; who: string; text: string } | null;
  // (F7a) where I'm going: set on the pause map, the radar's gold line to it
  waypoint: { x: number; y: number; name: string } | null;
  // (F4a) the quick wheel (Tab held): open, and the kind the mouse points at (0–7)
  wheel: boolean;
  wheelSel: number;
  // the pause menu's tab
  tab: "map" | "pack" | "pets" | "build" | "voice" | "settings" | "admin" | "credits" | "leave";
}

export interface HudState {
  phase: "loading" | "connecting" | "ready" | "reconnecting" | "failed" | "kicked" | "removed";
  error: string;
  // the world being built behind the loading screen (docs/plan/35-the-loading.md): on
  // entering, and on every change of view; progress 0..1
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
  // (`key`, `padKey`: a prompt pressed by another key than "use" — in a car, getting out is X: plan 94 P9)
  prompt: { objectId: string; kind: string; label: string; key?: string; padKey?: string } | null;
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
  wrap: { id: string } | null; // (plan 68) at a wrapping table: who it's for
  menu: ActionMenu | null;
  queue: QueuedAct[];
  /** (plan 123) a placed NPC as they are to me, as last asked (the menu's acts, the panel: F8b) */
  npcAbout: NpcAbout | null;
  focus: boolean; // heads down at my desk
  torch: boolean; // my phone's flashlight on
  mySpawn: { x: number; y: number } | null; // where I arrive (null: the world's arrival point)
  pickArrival: boolean; // choosing it on the map: the next floor click sets it
  panel: { kind: PanelKind; objectId?: string };
  /** (plan 70) the chess table I'm at: what the HUD strip shows (world/chess) */
  chess: import("./chess").ChessHud | null;
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
  strike: StrikeView | null;
  game: GameView | null;
  build: {
    on: boolean;
    tool: BuildTool;
    kind: string; // the catalog item to place (mode "place")
    rot: number;
    // furniture: the Sims hand (pick up / move), placing from the catalog, or
    // the eyedropper (click something to place copies of it)
    // (plan 124: the sledgehammer — a click sells it — and the design tool — a click restyles it)
    mode: "hand" | "place" | "eyedrop" | "sledge" | "design";
    /** (plan 124) The Sims 3's modes: Buy (things), Build (walls, floors, paint, roof, doors, windows, stairs, rooms),
     *  Lot (layouts, setups, desks, the map) — each sets the tool it works with. */
    tab: "buy" | "build" | "lot";
    /** Buy's catalog: By Room or By Function, which one, and its subcategory ("" all) */
    shopBy: "room" | "func";
    shopCat: string;
    shopSub: string;
    /** Build's part, Lot's part */
    part: BuildPartKey;
    lotPart: "layouts" | "setups" | "desks" | "map";
    /** the floor's grid shown while building (G) */
    grid: boolean;
    /** the build camera looks straight down (T) */
    topDown: boolean;
    /** what's on the pointer from the catalog is being customized before it goes down (the strip's middle) */
    styling: boolean;
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
    // walls drawn free snap to this grid (m) and these angle steps (°); 0: off (Shift: all off)
    snapGrid: number;
    snapAngle: number;
    // how high and thick new walls are (m; plan 72 phase 11.4)
    wallHeight: number;
    wallThick: number;
    // a room the walls just closed round (its key): to be named (plan 72 phase 11.5)
    foundRoom: string | null;
    // a wall drawn free picked in Select (its id; plan 72 phase 11.11): the inspector's
    freeSel: string | null;
    // the working height: m over the floor walls and floors are drawn at (0: the floor; a
    // mezzanine's — plan 72 phase 11.7)
    over: number;
    // the Roof tool's (plan 72 phase 11.7): what kind, how steep (°), a gable's ridge turned
    roofKind: "flat" | "gable" | "hip";
    roofPitch: number;
    roofRidge: 0 | 1;
    paint: string; // the material Paint puts on faces (p w f b k)
    wallView: WallView;
    wallTag: WallTag | null;
    props: Record<string, unknown> | null; // what new furniture copies (C)
    fits: boolean; // the ghost under the pointer fits
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
    /** the station of the stop I'm in (a mezzanine's up its floor — plan 72 phase 11) */
    here: number;
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
  // on a board (docs/plan/104-the-skate-again.md F7b): the skate HUD takes the screen — the dock and the at-hand bar
  // step aside till she's off it (set by world/skate/ride.ts)
  skating: boolean;
  /** (plan 125) the new UI's play HUD: the dark chunk's side of it */
  lamp: LampHud;
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
  wrap: null,
  menu: null,
  queue: [],
  npcAbout: null,
  focus: false,
  torch: false,
  mySpawn: null,
  pickArrival: false,
  panel: { kind: null },
  chess: null,
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
  strike: null,
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
    tab: "buy",
    shopBy: "room",
    shopCat: "living",
    shopSub: "",
    part: "walls",
    lotPart: "layouts",
    grid: true,
    topDown: false,
    styling: false,
    paintMode: "line",
    wallMode: "build",
    snapGrid: 0.5,
    snapAngle: 15,
    wallHeight: WALL_H,
    wallThick: 0.2,
    foundRoom: null,
    freeSel: null,
    over: 0,
    roofKind: "gable",
    roofPitch: 30,
    roofRidge: 0,
    paint: "b",
    wallView: "cut",
    wallTag: null,
    props: null,
    fits: true,
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
    snap: 0,
    pointer: null,
    land: { mode: "raise", size: 24, strength: 40 },
    paint: { surface: "path", size: 4 },
    issues: [],
    roads: { mode: "draw", kind: "road", w: 7, pave: false, lamps: true, drawing: null, sel: null },
    bridges: { mode: "add", style: "steel", drawing: null, sel: null },
    nature: { mode: "plant", pick: "mix", thick: 55, size: 24 },
    things: {
      mode: "place",
      kind: "bench",
      ry: 0,
      s: 1,
      text: "",
      h: 2.4,
      snapA: 15,
      curve: false,
      sel: null,
      blocked: null,
      drawing: null,
    },
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
      style: null,
      colours: {},
      vacant: false,
      sel: null,
      blocked: null,
    },
    npcs: { cast: null, failed: false, q: "", held: null, a: 0, sel: null, step: "", floor: null, blocked: null },
    animals: {
      kind: "herd",
      species: "deer",
      n: 4,
      r: 120,
      young: 1,
      sel: null,
      moving: false,
      layers: { animals: true, dark: true },
      inView: { land: 0, placed: 0, dark: 0 },
    },
    vehicles: {
      kind: "sedan",
      variant: "saloon-base",
      colour: 0x7a1f1f,
      colour2: null,
      role: "",
      a: 0,
      blocked: null,
      sel: null,
    },
    grow: { biome: "forest", lift: 0, name: "", sel: null, blocked: null, drawing: null },
    map: false,
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
  skating: false,
  lamp: {
    vitals: { hp: 100, st: 100, wm: 100, bat: 100 },
    gun: null,
    hand: { id: null, n: 0, lit: false, burn: 0 },
    quick: [],
    counts: {},
    inv: null,
    big: null,
    hurt: false,
    feed: [],
    sub: null,
    waypoint: null,
    wheel: false,
    wheelSel: 2,
    tab: "map",
  },
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

let feedId = 1;
/** (plan 125) A line in the new UI's feed for a while (four at most, the oldest let go). */
export function lampFeed(text: string, tone: "gold" | "warn" | "info" = "info", item?: string, ms = 4200) {
  const id = feedId++;
  hud.set((s) => ({ lamp: { ...s.lamp, feed: [...s.lamp.feed.slice(-3), { id, text, tone, item, at: Date.now() }] } }));
  setTimeout(() => hud.set((s) => ({ lamp: { ...s.lamp, feed: s.lamp.feed.filter((f) => f.id !== id) } })), ms);
}

let bigId = 1;
/** (plan 125) GTA's big message for a while. */
export function lampBig(title: string, sub: string, ms = 5200) {
  const id = bigId++;
  hud.set((s) => ({ lamp: { ...s.lamp, big: { id, title, sub } } }));
  setTimeout(() => hud.set((s) => (s.lamp.big?.id === id ? { lamp: { ...s.lamp, big: null } } : {})), ms);
}

let subId = 1;
/** (plan 125 F8a) What an NPC (or the town) says, as a subtitle for a while. */
export function lampSay(who: string, text: string, ms = 6000) {
  const id = subId++;
  hud.set((s) => ({ lamp: { ...s.lamp, sub: { id, who, text } } }));
  setTimeout(() => hud.set((s) => (s.lamp.sub?.id === id ? { lamp: { ...s.lamp, sub: null } } : {})), ms);
}

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
