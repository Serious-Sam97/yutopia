"use client";

import { useRef, useSyncExternalStore } from "react";
import type { BoardSummary, MemberStatus } from "@/lib/api";

// One small external store for everything the HUD shows. The world loop writes,
// React reads with useHud(selector).

export interface Person {
  sid: string;
  uid: number;
  name: string;
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
}

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
  | "settings"
  | null;

export type BuildTool = "furniture" | "walls" | "rooms" | "desks" | "map";

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
  chatOpen: boolean;
  chatUnread: number;
  peopleOpen: boolean;
  prompt: { objectId: string; kind: string; label: string } | null;
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
  radio: { playing: boolean; station: number; startedAt: number; by: string };
  standup: { active: boolean; order: number[]; turn: number; turnStartedAt: number; turnSeconds: number };
  poker: { open: boolean; cardId: number; boardId: number; title: string; by: string };
  build: {
    on: boolean;
    tool: BuildTool;
    kind: string;
    rot: number;
    holding: string | null;
    brush: string; // a tile char, or "door"
    roomDraft: { x: number; y: number; w: number; h: number } | null;
    deskDraft: string | null;
    pickSpawn: boolean;
  };
  mapVersion: number;
  following: number | null;
  inspect: number | null;
  locks: Record<string, string>;
  vortex: { x: number; y: number; say: string; sayAt: number; mood: string } | null;
  fps: number;
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
  chatOpen: false,
  chatUnread: 0,
  peopleOpen: false,
  prompt: null,
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
  radio: { playing: false, station: 0, startedAt: 0, by: "" },
  standup: { active: false, order: [], turn: 0, turnStartedAt: 0, turnSeconds: 90 },
  poker: { open: false, cardId: 0, boardId: 0, title: "", by: "" },
  build: {
    on: false,
    tool: "furniture",
    kind: "plant",
    rot: 0,
    holding: null,
    brush: "#",
    roomDraft: null,
    deskDraft: null,
    pickSpawn: false,
  },
  mapVersion: 0,
  following: null,
  inspect: null,
  locks: {},
  vortex: null,
  fps: 0,
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
