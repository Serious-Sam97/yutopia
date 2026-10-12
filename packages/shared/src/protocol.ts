// Messages between client and world-server (Colyseus room "space").

import type { AvatarLayers } from "./avatar";

export const ROOM_NAME = "space";
export const TICK_HZ = 20;
export const HEARING_HZ = 4;

export type Status = "online" | "away" | "dnd";
export const ANIM = { idle: 0, walk: 1, sit: 2 } as const;
export type Anim = (typeof ANIM)[keyof typeof ANIM];

export const EMOTES = ["wave", "heart", "laugh", "clap", "fire", "question", "coffee", "tape"] as const;
export type Emote = (typeof EMOTES)[number];

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
  "map:walls": { edges: { x: number; y: number; dir: "h" | "v"; ch: string }[] }; // walls (tile edges)
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
  "lamp:set": { id: string; on: boolean }; // anyone standing near it
  "radio:set": { playing: boolean; station?: number };
  "standup:start": Record<string, never>;
  "standup:next": Record<string, never>;
  "standup:stop": Record<string, never>;
  "poker:open": { cardId: number; boardId: number; title: string };
  "poker:close": Record<string, never>;
  "wb:get": { objectId: string };
  "wb:op": { objectId: string; op: WbOp };
  "arcade:score": { score: number };
  "vortex:poke": Record<string, never>;
}

// server → client
export interface ServerMessages {
  snap: { x: number; y: number };
  // whom I may listen to (session ids) and who may listen to me (user ids)
  hear: { ids: string[]; heardBy: string[] };
  chat: { id: string; from: string; fromName: string; text: string; scope: ChatScope; at: number };
  knock: { from: string; fromName: string; area: string };
  admitted: { area: string };
  toast: { text: string; tone?: "info" | "warn" | "vortex" };
  "wb:scene": { objectId: string; items: WbItem[] };
  "wb:op": { objectId: string; op: WbOp; by: string };
  "arcade:scores": { scores: { name: string; score: number }[] };
  "vortex:say": { text: string; to?: string; mood?: string };
  kicked: { reason: string };
  // builders: what Undo/Redo would do, and whether the last change reached Yondra
  "build:history": { undo: number; redo: number; undoLabel: string | null; redoLabel: string | null };
  "build:saved": { ok: boolean; at: number };
  // a message's reactions: emote → the user ids who reacted (to whoever received it)
  "chat:react": { id: string; reactions: Partial<Record<Emote, number[]>> };
  // someone played a note (where they are, so it sounds from there)
  "piano:note": { sid: string; x: number; y: number; n: number };
}

// Things you can be busy with (shown on the body: hands on the controls…).
export const USES = ["coffee", "water", "vending", "arcade", "piano", "whiteboard"] as const;
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
