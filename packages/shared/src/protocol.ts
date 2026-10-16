// Messages between client and world-server (Colyseus room "space").

import type { Social } from "./actions.ts";
import type { AvatarLayers } from "./avatar";
import type { MediaItem } from "./media.ts";
import type { Command, Move, Needs, Species, Toy, Trick } from "./pets.ts";

export const ROOM_NAME = "space";
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

export type ChatScope = "nearby" | "area" | "space";

export interface JoinOptions {
  spaceId: number;
  token: string;
}

// client → server
export interface ClientMessages {
  pos: { x: number; y: number; d: number; a: number; seq: number };
  emote: { e: Emote };
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
  "game:pad": { id: string; bits: number };
  "game:live": { id: string; live: boolean };
  "game:input": { tv: string; console: string };
  "game:continue": { id: string };
  "game:tv": { id: string };
  // with someone near (shared/actions.ts): a wave, a high five, handing over a drink…
  social: { to: string; act: Social };
  // heads down at my own desk: headphones on, the room's chatter turned down
  focus: { on: boolean };
  avatar: { avatar: AvatarLayers }; // after saving it in Yondra: everyone sees the new look now
  chat: { text: string; scope: ChatScope };
  "chat:react": { id: string; e: Emote }; // toggles my reaction on a message I received
  status: { status: Status };
  media: { mic: boolean; cam: boolean; screen: boolean; tracks?: string[] };
  speaking: { on: boolean };
  knock: { area: string };
  admit: { userId: number; area: string };
  follow: { userId: number | null };
  teleport: { to: "desk" | "spawn" | { userId: number } | { x: number; y: number } };
  // where I arrive in this space (a tile I can walk to); null: the space's arrival point
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
  "mod:kick": { userId: number };
  "mod:lock": { area: string; locked: boolean };
  // map editing (builders)
  "map:paint": { cells: { x: number; y: number; ch: string }[] }; // floors (tiles)
  // walls (tile edges); `side` (a material on a wall that's there): paint only that face
  "map:walls": { edges: { x: number; y: number; dir: "h" | "v"; ch: string; side?: 1 | -1 }[] };
  // paint wall faces (panels: one face of one edge) — never builds or removes a wall
  "map:faces": { faces: { x: number; y: number; dir: "h" | "v"; side: 1 | -1 }[]; mat: string };
  "map:resize": { width: number; height: number };
  "map:theme": { theme: string }; // clouds | city | snow
  "map:new": { width: number; height: number };
  "map:spawn": { x: number; y: number };
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
  };
  "map:room:walls": { key: string; wall: string }; // repaint a room's walls
  "map:room:update": {
    key: string;
    name?: string;
    kind?: string;
    ownerId?: number | null;
    ownerName?: string | null;
    dressing?: string | null; // tidy | lived | busy | null (bare)
  };
  "map:room:remove": { key: string };
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
  // `list`: the YouTube playlist they came from (remembered for the space's quick list)
  "media:play": { id: string; items: MediaItem[]; mode: "now" | "next" | "end"; list?: string };
  "playlist:forget": { list: string }; // off the space's quick list
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
  "poker:open": { cardId: number; boardId: number; title: string };
  "poker:close": Record<string, never>;
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
}

// server → client
export interface ServerMessages {
  snap: { x: number; y: number };
  // my own arrival point here (on join and after I change it); null: the space's
  "spawn:mine": { at: { x: number; y: number } | null };
  // whom I may listen to (session ids) and who may listen to me (user ids)
  hear: { ids: string[]; heardBy: string[] };
  chat: { id: string; from: string; fromName: string; text: string; scope: ChatScope; at: number };
  knock: { from: string; fromName: string; area: string };
  admitted: { area: string };
  toast: { text: string; tone?: "info" | "warn" | "vortex" };
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
  // a message's reactions: emote → the user ids who reacted (to whoever received it)
  "chat:react": { id: string; reactions: Partial<Record<Emote, number[]>> };
  // to whoever streams a console: its TV's LiveKit token; another player's
  // pad; who may see the picture and who may hear it (user ids)
  "game:tv": { id: string; token: string; identity: string };
  "game:pad": { id: string; port: number; bits: number };
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

export const MAX_CHAT = 500;
export const STATION_COUNT = 3;
export const LIVEKIT_IDENTITY = (userId: number | string) => String(userId);
