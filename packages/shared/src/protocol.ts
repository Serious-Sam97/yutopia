// Messages between client and world-server (Colyseus room "world": the one world).

import type { Social } from "./actions.ts";
import type { AvatarLayers } from "./avatar";
import type { CarWire } from "./car/net.ts";
import type { LootItem } from "./dark/loot.ts";
import type { Inventory } from "./inventory.ts";
import type { JumpKind } from "./jump.ts";
import type { KartWire } from "./kart/net.ts";
import type { MediaItem } from "./media.ts";
import type { VerbKind } from "./move/verbs.ts";
import type { Command, Move, Needs, Species, Toy, Trick } from "./pets.ts";
import type { CallEnd, CallInfo, GpsFriend } from "./phone.ts";

export const ROOM_NAME = "world";
export const TICK_HZ = 20;
export const HEARING_HZ = 4;

export type Status = "online" | "away" | "dnd";
export const ANIM = { idle: 0, walk: 1, sit: 2 } as const;
export type Anim = (typeof ANIM)[keyof typeof ANIM];

export const EMOTES = ["wave", "heart", "laugh", "clap", "fire", "question", "coffee", "tape"] as const;
export type Emote = (typeof EMOTES)[number];
// what a pet wants, over its head (shared/mind.ts WANT_ICON; "no": a refusal)
export const WANTS = ["bone", "drop", "zzz", "ball", "look", "house", "paws", "no"] as const;
export type Want = (typeof WANTS)[number];

export interface JoinOptions {
  token: string;
}

// A player's performance over a window of play (docs/plan/39-the-telemetry.md). Frame times
// in ms; percentiles over the window's frames; stage averages per frame drawn.
export interface PerfReport {
  session: string; // one page load
  client: { version: string; commit: string }; // the build it runs (docs/plan/40-the-version.md)
  secs: number; // the window's length
  hidden: number; // share of it the tab was hidden (0…1)
  frames: {
    fps: number;
    med: number;
    p95: number;
    worst: number;
    gapP95: number;
    gapWorst: number;
    over33: number;
    over50: number;
  };
  long: { n: number; worst: number }; // long tasks (>50 ms)
  stages: Record<string, number>; // stage → average ms a frame
  draws: number | null; // 3D draw calls in a sampled frame (null in iso)
  culled: number | null; // things left out of that frame (3D)
  where: {
    level: number;
    area: string;
    x: number;
    y: number;
    view: string;
    quality: string;
    qualityPref: string;
    maxFps: number;
    hour: number;
    near: number;
    inCar: boolean;
  };
  machine: {
    browser: string;
    os: string;
    gpu: string;
    screen: [number, number];
    canvas: [number, number];
    dpr: number;
    cores: number;
    memory: number | null;
    // the 3D view's pixel ratio now, what it started with (and the screen's then), how
    // often it was put right since (null in iso) — docs/plan/38-the-lag.md, round 3
    ratio: number | null;
    ratioAtStart: number | null;
    dprAtStart: number | null;
    ratioFixes: number | null;
  };
  net: { pingMed: number | null; pingP95: number | null; reconnects: number };
}

// client → server
export interface ClientMessages {
  // `l`: the floor (changes only on the stairs; elevators are the server's)
  // `mv` the gait (shared/move packMv), `yaw` the facing and `pitch` the look (a byte each),
  // `mt` the sender's own clock (ms) — docs/plan/29-the-move.md M7
  pos: {
    x: number;
    y: number;
    z?: number;
    l?: number;
    d: number;
    a: number;
    seq: number;
    mv?: number;
    yaw?: number;
    pitch?: number;
    mt?: number;
  };
  emote: { e: Emote };
  // a jump (shared/jump.ts): a hop, or a flip on the run
  // or a verb (shared/move verbs.ts: vault, mantle, roll, slide), with the top it goes over (h)
  jump: { k: JumpKind | VerbKind; h?: number };
  // take something to carry from a thing that hands it out (a mug from the coffee machine)
  "item:take": { id: string };
  "item:drop": Record<string, never>;
  // what I'm busy with (using the arcade, playing the piano…), "" when done: others see it
  use: { what: string };
  // a note on the piano I'm at (n: semitones from middle C)
  "piano:note": { id: string; n: number };
  // the slot-car track (slotcar.ts): take a lane (0..3) / give it back, start
  // a race (racers; laps and difficulty), my car as I drive it (racers, while
  // racing), and the track laid on the table (anyone by it, between races)
  "slot:join": { id: string; lane: number };
  "slot:leave": { id: string };
  "slot:start": { id: string; laps: number; diff?: string };
  "slot:car": { id: string; s: number; v: number; off: number; ov: number };
  "slot:track": { id: string; track: string };
  // the pool table (pool.ts / pool-game.ts): take a seat (0 / 1) or give it
  // back, put Vortex in the other seat (his level; null takes him out), start
  // (both seats filled; the shot clock and the guideline), the cue as I aim, the
  // cue ball placed (ball in hand), the shot (the pocket called for the 8), give up
  "pool:sit": { id: string; seat: number };
  "pool:leave": { id: string };
  "pool:vortex": { id: string; level: string | null };
  "pool:start": { id: string; clock?: number; guide?: string };
  "pool:aim": { id: string; a: number; p: number; sx: number; sy: number; cx?: number; cy?: number; drag?: boolean };
  "pool:place": { id: string; x: number; y: number };
  "pool:shot": { id: string; angle: number; power: number; spinX: number; spinY: number; called: number };
  "pool:concede": { id: string };
  // pool balls out of a game (shared/pool-throw.ts): a ball or the cue off a table not being
  // played; a ball off the floor; thrown (yaw, pitch: its way out); the cue fired from its tip;
  // the ball in the hand put back on its table, the cue put back (arms:draw -1 too)
  "pball:take": { id: string; what: "ball" | "cue" };
  "pball:pick": { key: string };
  "pball:throw": { yaw: number; pitch: number };
  "pball:fire": { ox: number; oy: number; oz: number; yaw: number; pitch: number };
  "pball:back": Record<string, never>;
  // the ping-pong table (pong.ts): seats (0: the −x end, 1: the +x end), Vortex
  // at the other end, start (points to win, best of), my racket as it moves
  // (t: server ms), the toss (serving), a hit I made (on flight `seq`, at `t`,
  // the ball as it left my racket), give up
  "pong:sit": { id: string; seat: number };
  "pong:leave": { id: string };
  "pong:vortex": { id: string; level: string | null };
  "pong:start": { id: string; to?: number; bestOf?: number };
  "pong:racket": { id: string; r: number[] };
  "pong:toss": { id: string; t: number; y: number };
  "pong:hit": { id: string; seq: number; t: number; b: number[] };
  "pong:concede": { id: string };
  // the game room (games.ts): plug a console into a TV (null unplugs), put a
  // cartridge in (null ejects), power, take a pad (port 0 = put it down), a
  // pad's buttons (a bitmask of PAD_BUTTONS, for whoever streams it), the
  // stream going out or not, a TV's input, carry on a paused game, the TV's token
  "game:plug": { id: string; tv: string | null };
  "game:cart": { id: string; game: string | null };
  "game:power": { id: string; on: boolean; resume?: boolean }; // resume: from the last save state
  "game:port": { id: string; port: number };
  "game:pad": { id: string; bits: number; sticks?: number[] }; // sticks: [lx, ly, rx, ry] −127…127
  "game:analog": { id: string; on: boolean }; // my pad's analog mode (its LED, for everyone)
  "game:live": { id: string; live: boolean };
  "game:input": { tv: string; console: string };
  "game:continue": { id: string };
  "game:tv": { id: string };
  // with someone near (shared/actions.ts): a wave, a high five, handing over a drink…
  social: { to: string; act: Social };
  // heads down at my own desk: headphones on, the room's chatter turned down
  focus: { on: boolean };
  avatar: { avatar: AvatarLayers }; // after saving it in Yondra: everyone sees the new look now
  status: { status: Status };
  media: { mic: boolean; cam: boolean; screen: boolean; tracks?: string[] };
  speaking: { on: boolean };
  knock: { area: string };
  admit: { userId: number; area: string };
  follow: { userId: number | null };
  // { x, y, level }: a spot on that floor (build mode's "Go there"; level: the floor shown)
  // ("bay": my own bay of the lot, docs/plan/43-the-spot.md)
  teleport: { to: "desk" | "spawn" | "bay" | { userId: number } | { x: number; y: number; level?: number } };
  // where I arrive (a tile I can walk to); null: the world's arrival point
  "spawn:mine": { at: { x: number; y: number } | null };
  "obj:put": {
    id?: string;
    kind: string;
    x: number;
    y: number;
    rot: number;
    refId?: number | null;
    props?: Record<string, unknown>;
  };
  "obj:remove": { id: string };
  // several at once, all or nothing: moves of existing ids, or new copies (no id)
  "obj:batch": {
    items: { id?: string; kind: string; x: number; y: number; rot: number; props?: Record<string, unknown> }[];
  };
  "obj:removeMany": { ids: string[] };
  // what I have in my hand right now (others can't grab it); [] puts it all down
  "obj:hold": { ids: string[] };
  // a generated dressing piece becomes a real object (id takenId(piece)) / goes away
  "dress:take": { id: string };
  "dress:hide": { id: string };
  "build:template": { template: string };
  "build:undo": Record<string, never>; // your own last build step (history.ts)
  "build:redo": Record<string, never>;
  "mod:mute": { userId: number; muted: boolean };
  // the weather (shared weather.ts): a storm called up (1) or sent off (0), or
  // back to the schedule (null); `now`: at once, not over a minute
  "mod:storm": { storm: number | null; now?: boolean };
  // the world's hour (shared clock.ts): set one (0–24; it runs on from there), or null: São Paulo's again
  "mod:hour": { h: number | null };
  // removed for `minutes` (shared admin.ts REMOVE_MINUTES; none: 10), or let back in early
  "mod:kick": { userId: number; minutes?: number };
  "mod:unremove": { userId: number };
  "mod:lock": { area: string; locked: boolean };
  // ── an admin's own (docs/plan/48-the-admin.md): every one refused to anyone else ──
  // a power on myself (shared admin.ts POWERS) switched on or off
  "mod:power": { power: string; on: boolean };
  // health, breath and battery full, up if down: mine (no userId) or someone's
  "mod:heal": { userId?: number };
  // someone brought beside me, sent to the arrival point, out of their car, held still
  "mod:bring": { userId: number };
  "mod:home": { userId: number };
  "mod:unseat": { userId: number };
  "mod:freeze": { userId: number; minutes: number }; // 0: free again
  // a line to everyone in (a toast)
  "mod:notice": { text: string; tone?: "info" | "warn" };
  // something in a hand (shared held.ts) or the pockets (shared inventory.ts): mine or someone's;
  // `drop`: on the ground where I stand, for anyone
  "mod:give": { item: string; n?: number; userId?: number; drop?: boolean };
  // a vehicle in front of me (shared car CarKind); `clear`: everything I spawned this stay, gone
  "mod:spawn-car": { model: string; colour: number; plate?: string };
  "mod:clear": Record<string, never>;
  // any door's lock, from anywhere (an owned room's too)
  "mod:door": { id: string; locked: boolean };
  // map editing (builders); `level`: which floor of the building (levels.ts;
  // none: the home floor)
  "map:paint": { cells: { x: number; y: number; ch: string }[]; level?: number }; // floors (tiles)
  // walls (tile edges); `side` (a material on a wall that's there): paint only that face
  "map:walls": { edges: { x: number; y: number; dir: "h" | "v"; ch: string; side?: 1 | -1 }[]; level?: number };
  // paint wall faces (panels: one face of one edge) — never builds or removes a wall
  "map:faces": { faces: { x: number; y: number; dir: "h" | "v"; side: 1 | -1 }[]; mat: string; level?: number };
  "map:resize": { width: number; height: number };
  "map:new": { width: number; height: number };
  "map:spawn": { x: number; y: number };
  // floors: a blank one on top of the building (its footprint and core), the top one gone
  "level:add": Record<string, never>;
  "level:remove": { level: number };
  // elevators (features/lifts.ts): call the car to my floor (the stop's id),
  // send it to a floor from inside it
  "lift:call": { id: string };
  "lift:go": { id: string; level: number };
  "lift:close": { id: string }; // in the car: shut its doors now
  "map:room": {
    name: string;
    kind: string;
    x: number;
    y: number;
    w: number;
    h: number;
    ownerId: number | null;
    ownerName: string | null;
    walls: boolean;
    floor?: string;
    wall?: string; // wall material (p, w, f, b, k, g)
    level?: number;
  };
  "map:room:walls": { key: string; wall: string; level?: number }; // repaint a room's walls
  "map:room:update": {
    key: string;
    level?: number;
    name?: string;
    kind?: string;
    ownerId?: number | null;
    ownerName?: string | null;
    dressing?: string | null; // tidy | lived | busy | null (bare)
  };
  "map:room:remove": { key: string; level?: number };
  "desk:assign": { id: string; ownerId: number | null; ownerName: string | null };
  // doors: anyone opens/closes; the room's owner (or a builder) locks
  "door:set": { id: string; state: "open" | "closed" | "locked" };
  "lamp:set": { id: string; on: boolean }; // anyone standing near it (floor lamps, desk lamps)
  "lights:room": { id: string; on: boolean }; // a light switch: every lamp in its room
  "radio:set": { id: string; playing: boolean; station?: number }; // a radio / record player, each its own
  "radio:volume": { id: string; volume: number }; // its knob, 0..1
  "media:volume": { id: string; volume: number }; // a TV's knob, 0..1
  // a computer (shared/computer.ts): sit down at it, what its OS shows now, stand up
  "computer:use": { id: string };
  "computer:phase": { id: string; phase: string; era?: string; app?: string; user?: string };
  "computer:leave": { id: string };
  // media on a TV or a radio (its object id), shared/media.ts:
  // play now / next / at the end of the queue (several: a playlist), the
  // controls, and a length a player found out (YouTube items arrive without one)
  // `list`: the YouTube playlist they came from (remembered for the world's quick list)
  "media:play": { id: string; items: MediaItem[]; mode: "now" | "next" | "end"; list?: string };
  "playlist:forget": { list: string }; // off the world's quick list
  "playlist:edit": { list: string; title?: string; pinned?: boolean; star?: boolean }; // rename, pin, my star
  "media:ctl": {
    id: string;
    op: "pause" | "resume" | "seek" | "skip" | "stop" | "loop" | "lock" | "remove" | "move" | "clear";
    pos?: number; // seek (s)
    on?: boolean; // loop / lock
    index?: number; // remove / move (in the queue)
    to?: number; // move
  };
  "media:dur": { id: string; ref: string; dur: number };
  "standup:start": Record<string, never>;
  "standup:next": Record<string, never>;
  "standup:stop": Record<string, never>;
  "wb:get": { objectId: string };
  "wb:op": { objectId: string; op: WbOp };
  "arcade:score": { score: number };
  "vortex:poke": Record<string, never>;
  // pets (shared/pets.ts): adopt one, let it go, its name / look / clothes, a
  // command, care by hand, a toy, a lesson, a bowl filled, a battle (the
  // challenge, the answer, a move each round)
  "pet:adopt": { species: Species; name: string; look?: unknown };
  "pet:release": { id: string };
  "pet:edit": { id: string; name?: string; look?: unknown; outfit?: unknown };
  "pet:cmd": { id: string; cmd: Command; trick?: Trick };
  "pet:care": { id: string; what: "pet" | "snack" | "water" };
  "pet:play": { id: string; toy: Toy };
  "pet:teach": { id: string; trick: Trick };
  "pet:bowl": { id: string }; // the bowl's object id
  "pet:test": { id: string; needs?: Partial<Needs>; bonds?: Record<string, number>; ago?: number }; // offline tests only
  // toys (shared/pets.ts): take one (from a toy box by `id`, or with a pet of
  // yours), throw it where you point, pick one up off the floor, point the laser
  "toy:take": { toy: Toy; id?: string };
  "toy:throw": { x: number; y: number };
  "toy:pick": { id: string };
  "laser:point": { x: number; y: number };
  "pet:challenge": { id: string; mine: string }; // their pet, my pet
  "pet:answer": { battle: string; accept: boolean };
  "pet:move": { battle: string; move: Move };
  // the phone (shared/phone.ts): what it's doing in my hand (text, photo,
  // selfie, "" put away; call/video while on a call), my case and ringtone,
  // a photo taken (the flash others see)
  "phone:state": { state: string };
  "phone:prefs": { case: string; ringtone: string };
  "phone:torch": { on: boolean };
  // the shuttle (docs/plan/27, phase 6): on at a stop, off at a stop
  "ride:board": Record<string, never>;
  "ride:leave": Record<string, never>;
  // the car (docs/plan/28-the-car.md): into a seat (0 the driver's, 1 beside, 2 · 3 behind) of
  // a parked car (its object's id) or a live one (its vehicle's id); its driver's state; out
  // someone's own bay of the lot (docs/plan/43-the-spot.md): claimed standing in it, given up
  "spot:claim": { bay: string };
  "spot:free": { bay: string };
  "car:enter": { id: string; seat: number };
  // your own, from the dealer (docs/plan/43-the-spot.md): car/own.ts BUYABLE, a CAR_COLOURS index
  "car:buy": { model: string; colour: number; plate: string };
  // the owner lends their own's keys to someone (their uid), or takes them back (null)
  "car:lend": { to: number | null };
  "car:leave": Record<string, never>;
  "car:state": CarWire;
  // the Kart Park (docs/plan/46-the-karts.md): take a kart at the desk (its colour), give it back;
  // the next race's setup (anyone in a kart, between races); ready; start; my kart's state; an item
  "kart:take": { colour?: number };
  // the Kart Park's seats (shared kart/park.ts kartSeats): sit on one in reach, get up
  "park:sit": { i: number };
  "park:stand": { walk?: boolean };
  "kart:leave": Record<string, never>;
  "kart:setup": { mode?: "gp" | "battle"; laps?: number; fill?: boolean; level?: "easy" | "medium" | "hard" };
  // the track changer (docs/plan/47-the-track-changer.md): a layout of KART_LAYOUTS, either way round
  "kart:layout": { layout: string; reverse?: boolean };
  "kart:ready": { on: boolean };
  "kart:colour": { colour: number };
  // an admin's: an item in my kart now (testing the items)
  "mod:kart-item": { item: string };
  "kart:start": Record<string, never>;
  "kart:state": KartWire;
  "kart:use": { back?: boolean; lag?: number }; // (lag: half my ping, ms: hits judged where I saw them)
  // a parked car I knocked, come to rest: where it ended up (the Grounds' coords, its middle)
  "car:shove": { id: string; x: number; z: number; a: number };
  // my car's dirt (0..1) and dents (front, rear, left, right: 0..1), as my sim has counted them
  "car:wear": { grime: number; dmg: number[] };
  // at a pump, stopped: filling it (on), or not
  "car:fill": { on: boolean };
  // my car hit someone at speed (their session): knocked down
  "car:knock": { sid: string };
  // a passenger's radio button (the driver's client changes the station)
  "car:radio": Record<string, never>;
  // my car stuck (stopped): pulled out to the nearest clear spot (features/cars.ts; shared freeSpot)
  "car:unstick": Record<string, never>;
  "mod:shuttle": Record<string, never>; // an admin: the shuttle to the headquarters' stop
  "mod:cars": Record<string, never>; // an admin: every car back in its bay in the lot
  "phone:shot": Record<string, never>;
  "phone:pose": { pose: string }; // a pose for the photo (shared PHOTO_POSES)
  "phone:rec": { on: boolean }; // recording a video (a red light on the phone)
  // calls (features/phone.ts): call people (user ids; anywhere in Yutopia),
  // answer, decline, hang up, add someone, the camera on or off
  "call:start": { to: number[]; video: boolean };
  "call:answer": { id: string };
  "call:decline": { id: string };
  "call:end": { id: string };
  "call:add": { id: string; uid: number };
  "call:video": { id: string; on: boolean };
  // the GPS (docs/plan/37-the-gps.md § 6): my contacts may see where I am (or not);
  // where the contacts sharing with me are
  "gps:share": { on: boolean };
  "gps:friends": Record<string, never>;
  // the dark (docs/plan/30-the-dark.md, phase 2): the client's chunk is listening (send my
  // pockets); search a spot (shared dark/loot.ts LOOT id, or "locker"); pick up something
  // dropped; use a pocket (first aid, a battery); drop a pocket (0–5) or a weapon (6–7)
  "dark:hello": Record<string, never>;
  "dark:loot": { spot: string };
  "dark:pick": { id: string; slot?: number }; // (slot: into that pocket first: the inventory's drag)
  "dark:move": { from: number; to: number }; // a drag in the inventory (shared inventory.ts moveSlot)
  "dark:use": { slot: number };
  "dark:drop": { slot: number };
  // an admin's own vitals full again (health, stamina, warmth, the battery): for trying things out
  "mod:refill": { kit?: boolean; hp?: number; wm?: number };
  // the shadowed (features/dark.ts), admins: off ("peaceful") or on ("normal"); `spawn`: that
  // many out of the dark near me, to try the fight
  "mod:dark": { mode?: "peaceful" | "normal" | "called"; spawn?: number };
  // guns and flares (D6, features/arms.ts): a weapon in the hand (0, 1: the weapon slots;
  // -1: none), a reload, a shot — from the muzzle, along the aim, the line's lag as I measured
  // it (ms) and the pellets' seed — and a flare thrown along the aim
  "arms:draw": { slot: number };
  "arms:reload": Record<string, never>;
  "arms:fire": { ox: number; oy: number; oz: number; yaw: number; pitch: number; lag: number; seed: number };
  "arms:flare": { yaw: number; pitch: number };
  // the line's round trip, measured (its lag goes with a shot)
  "arms:ping": { t: number };
  // how the game runs for this player (docs/plan/39-the-telemetry.md): a 30 s window, every
  // ~30 s; the server adds who and its own snap count, and stores it for the admins
  "perf:report": PerfReport;
  // a round trip to the world-server, timed by the client (the report's ping)
  "perf:ping": { t: number };
  // down and up (D7): holding to get someone up (their session id; on: started, off: let go),
  // holding my own first aid while I'm down; admins: down at once (to try it)
  "dark:revive": { sid: string; on: boolean };
  "dark:selfaid": { on: boolean };
  "mod:down": Record<string, never>;
}

// server → client
export interface ServerMessages {
  snap: { x: number; y: number; z?: number; level?: number };
  // my car put back where the server has it (a state it couldn't believe)
  "car:snap": CarWire & { id: string };
  "car:no": { why: string; who?: string }; // (who: whose it is, "owned")
  // the Kart Park: my kart put where the server has it (a grid slot, a spawn, a state it couldn't
  // believe); I was hit (spun out, or smashed in a battle); a coffee or the plough's boost is mine
  "kart:snap": { x: number; y: number; z: number; a: number; still?: boolean };
  "kart:hit": { by: string; item: string; smash: boolean };
  "kart:boost": { secs: number; top?: number };
  "kart:no": { why: string };
  "spot:no": { why: string };
  "car:bought": { id: string };
  // someone's car keys lent to me, or back with them (why: "taken", "home", "day")
  "car:keys": { from: string; plate: string; lent: boolean; why?: string };
  // (to the driver) a passenger changed the radio's station
  "car:radio": Record<string, never>;
  // my own arrival point here (on join and after I change it); null: the world's
  "spawn:mine": { at: { x: number; y: number } | null };
  // whom I may listen to (session ids) and who may listen to me (user ids)
  hear: { ids: string[]; heardBy: string[] };
  knock: { from: string; fromName: string; area: string };
  admitted: { area: string };
  toast: { text: string; tone?: "info" | "warn" | "vortex" };
  // (to admins) who's removed for a while, and till when (docs/plan/48-the-admin.md)
  "admin:removed": { list: { uid: number; name: string; until: number }[] };
  // ping-pong: the hit I reported wasn't taken (which flight, why) — my ball goes back to its real path
  "pong:no": { id: string; seq: number; why: "seq" | "turn" | "late" | "early" | "check" | "over" };
  "wb:scene": { objectId: string; items: WbItem[] };
  "wb:op": { objectId: string; op: WbOp; by: string };
  "arcade:scores": { scores: { name: string; score: number }[] };
  "vortex:say": { text: string; to?: string; mood?: string };
  kicked: { reason: string };
  // builders: what Undo/Redo would do, and whether the last change reached Yondra
  "build:history": { undo: number; redo: number; undoLabel: string | null; redoLabel: string | null };
  // rejected: Yondra answered and refused the map (vs. couldn't be reached)
  "build:saved": { ok: boolean; at: number; rejected?: boolean };
  // to whoever streams a console: its TV's LiveKit token; another player's
  // pad; who may see the picture and who may hear it (user ids)
  "game:tv": { id: string; token: string; identity: string };
  "game:pad": { id: string; port: number; bits: number; sticks?: number[] };
  "game:audience": { id: string; video: string[]; audio: string[] };
  // someone played a note (where they are, so it sounds from there)
  "piano:note": { sid: string; x: number; y: number; n: number };
  // on joining: the key for the world-server's media routes (Jellyfin browsing,
  // streams, pictures; YouTube search) and what's set up
  "media:key": { key: string; jf: boolean; ytSearch: boolean };
  // a pet battle proposed to me: whose pet against mine
  "pet:challenge": { battle: string; from: string; fromName: string; pet: string; mine: string };
  // what happened with a pet of mine (the client words it): levelUp, learned,
  // died, ignored, won, lost, draw, full (no more pets)
  "pet:event": { id: string; kind: string; n?: number; trick?: string };
  // the computer is mine now (open its panel), or no longer (it went off under me)
  "computer:ok": { id: string };
  "computer:off": { id: string };
  // calls: one ringing for me, how a call I'm in stands (ringing, live, ended
  // and why), and the line itself once I'm in (its own LiveKit room)
  "call:ring": CallInfo;
  // a phone event from the API, relayed (a text, read, typing, react, thread): the
  // same shape the phone got from Yondra's private channel
  "phone:live": { event: Record<string, unknown> };
  "call:update": CallInfo & { phase: "ringing" | "live" | "ended"; end?: CallEnd };
  "call:join": { id: string; url: string; token: string; room: string };
  "gps:friends": { friends: GpsFriend[] };
  // the dark: what I carry and the torch's battery (only mine, on asking and on every
  // change); what a search or a pick-up gave (full: my pockets couldn't take it all; gone:
  // someone had already emptied it)
  "dark:pockets": { inv: Inventory; bat: number };
  "dark:found": { spot: string; got: LootItem[]; full: boolean; gone?: boolean; later?: boolean }; // (later: the lobby's kit, taken today)
  // one of the shadowed struck me (how much health it took); I went down to nothing and woke
  // at the office (docs/plan/30-the-dark.md D7: phase 6 puts the others' 30 s before it)
  "dark:hit": { id: string; n: number; shot?: boolean }; // (shot: one of us shot them — id, their sid)
  "dark:awake": Record<string, never>;
  // what my shot did (per one hit: a spark off a shield, a wound, one put down); someone's
  // shot near me (their tracer, their flash: the same pellets from the seed); a flare thrown
  // (person, downed: one of us — id, their sid — hurt, or put down by it)
  // (head: it went in at the head — docs/plan/32-the-arms.md)
  "arms:hit": {
    id: string;
    kind: "spark" | "hurt" | "killed" | "person" | "downed";
    x: number;
    y: number;
    z: number;
    head?: boolean;
  };
  "arms:shot": {
    sid: string;
    gun: string;
    ox: number;
    oy: number;
    oz: number;
    yaw: number;
    pitch: number;
    seed: number;
    /** rad: the spread the server shot it with (the same pellets from the seed) */
    spread: number;
  };
  "arms:throw": { sid: string; x0: number; y0: number; z0: number; x: number; y: number; z: number; secs: number };
  "arms:pong": { t: number };
  "perf:pong": { t: number };
}

// Things you can be busy with (shown on the body: hands on the controls…).
export const USES = [
  "coffee",
  "water",
  "vending",
  "arcade",
  "piano",
  "whiteboard",
  "slotcar",
  "pool",
  "pong",
  "gamepad",
  "throw",
  "computer",
] as const;
export type Use = (typeof USES)[number];
export const PIANO_RANGE = [-12, 24] as const; // semitones from middle C

// Whiteboard: coordinates in a 1000 × 600 board space.
export type WbItem =
  | { id: string; k: "stroke"; c: string; w: number; p: number[] }
  | { id: string; k: "note"; c: string; x: number; y: number; text: string }
  | { id: string; k: "text"; c: string; x: number; y: number; text: string };
export type WbOp = { t: "add"; item: WbItem } | { t: "del"; id: string } | { t: "clear" };
export const WB_W = 1000;
export const WB_H = 600;
export const WB_MAX_ITEMS = 1500;
export const WB_MAX_POINTS = 600;

export const STATION_COUNT = 3;
export const LIVEKIT_IDENTITY = (userId: number | string) => String(userId);
