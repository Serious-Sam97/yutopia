"use client";

import { DEFAULT_PHONE, type PhoneSettings } from "@yutopia/shared/phone";
import { useRef, useSyncExternalStore } from "react";

// The phone's own state (Vortex Mobile, docs/plan/21-cellphone.md): its
// screens, the team, threads and texts, the call, the camera, the gallery.
// The phone chunk writes, its screens read with usePhone(selector). The HUD
// only sees the summary in hud.phone (store.ts).

export type AppId =
  | "home"
  | "phone"
  | "messages"
  | "camera"
  | "gallery"
  | "contacts"
  | "settings"
  | "store"
  | "maps"
  | "vortex";

// a screen on the stack: an app and where in it (a thread, a contact, a photo…)
export interface Screen {
  app: AppId | "lock" | "boot" | "call";
  view?: string;
  arg?: string;
}

export interface Contact {
  uid: number; // 0: Vortex
  name: string;
  avatar: string; // the avatar seed (Face)
  online: boolean; // in Yutopia right now
  spaceId: number | null;
  space: string | null; // where they are (a space's name)
  area: string | null; // and the room in it
  here: boolean; // in my space
  status: string; // online · away · dnd
}

export interface PhotoRef {
  id: number;
  url: string;
  w: number;
  h: number;
  filter: string;
  where: string; // "Open office · Yutopia Demo"
  at: number; // ms
  selfie: boolean;
  sent?: boolean;
}

export interface Msg {
  id: number; // negative while it's on its way
  thread: number;
  from: number | null; // user id; null: Vortex
  kind: "text" | "photo" | "call" | "system";
  body: string;
  photo: PhotoRef | null;
  call: { end: string; secs: number; video: boolean; from: number } | null;
  reactions: Record<string, number[]>; // emote → who
  replyTo: number | null;
  at: number; // ms
  pending?: boolean;
  failed?: boolean;
}

export interface Thread {
  id: number;
  kind: "direct" | "group" | "space" | "vortex";
  name: string; // groups and the space; a direct one is named after the other person
  members: number[]; // user ids (not me)
  spaceId: number | null;
  unread: number;
  last: Msg | null;
  muted: boolean;
  readAt: Record<string, number>; // uid → the last message id they've read
}

export interface CallView {
  id: string; // the world-server's call id ("" until it answers; "vortex" for him)
  phase: "dialing" | "incoming" | "ringing" | "live" | "ended";
  outgoing: boolean;
  video: boolean;
  from: number;
  peers: { uid: number; name: string; avatar: string; space: string; state: "ringing" | "in" | "left" }[];
  startedAt: number; // client ms (live)
  end?: string; // why it ended (shared CallEnd), shown for a moment
  muted: boolean;
  speaker: boolean;
  camOn: boolean;
  level: number; // the far voice's level (the waveform), 0..1
  vortex?: { line: string; mood: string }; // a call with Vortex: what he's saying
}

export interface CameraState {
  mode: "photo" | "selfie";
  filter: string; // none · film · vhs · bw · polaroid
  pose: string; // "" · smile · peace · wink · point · thumbs · or an emote
  flash: boolean;
  timer: number; // s (0, 3, 10)
  count: number; // the self-timer counting down (0: not)
  zoom: number; // 1..3
  last: PhotoRef | null; // the last one taken (the thumbnail)
  busy: boolean; // taking / saving one
}

export interface Recent {
  id: number; // the message
  at: number;
  peers: number[]; // who was on it (not me)
  call: { end: string; secs: number; video: boolean; from: number };
}

export interface Peek {
  key: number;
  kind: "text" | "missed" | "vortex" | "info";
  title: string;
  body: string;
  avatar: string; // a face (seed) or "vortex"
  thread?: number;
  at: number;
}

export interface PhoneState {
  open: boolean;
  booted: boolean; // the boot ran this session
  stack: Screen[];
  sel: number; // the highlighted thing on screen (keyboard)
  settings: PhoneSettings;
  settingsLoaded: boolean;
  me: { uid: number; name: string; avatar: string };
  contacts: Contact[];
  contactsAt: number;
  threads: Thread[];
  threadsLoaded: boolean;
  msgs: Record<number, Msg[]>; // per thread, oldest first
  more: Record<number, boolean>; // older messages to load
  typing: Record<number, { uid: number; until: number }>;
  photos: PhotoRef[];
  photosLoaded: boolean;
  recents: Recent[];
  call: CallView | null;
  peek: Peek | null;
  camera: CameraState | null;
  vortexTyping: boolean; // he's writing back
  note: string; // a short line at the bottom of the phone ("Saved", "Couldn't send"…)
}

const initial: PhoneState = {
  open: false,
  booted: false,
  stack: [{ app: "home" }],
  sel: 0,
  settings: DEFAULT_PHONE,
  settingsLoaded: false,
  me: { uid: 0, name: "", avatar: "{}" },
  contacts: [],
  contactsAt: 0,
  threads: [],
  threadsLoaded: false,
  msgs: {},
  more: {},
  typing: {},
  photos: [],
  photosLoaded: false,
  recents: [],
  call: null,
  peek: null,
  camera: null,
  vortexTyping: false,
  note: "",
};

let state: PhoneState = initial;
const subs = new Set<() => void>();

export const phone = {
  get: () => state,
  set(patch: Partial<PhoneState> | ((s: PhoneState) => Partial<PhoneState>)) {
    const p = typeof patch === "function" ? patch(state) : patch;
    state = { ...state, ...p };
    for (const s of subs) s();
  },
  subscribe(cb: () => void) {
    subs.add(cb);
    return () => {
      subs.delete(cb);
    };
  },
  reset() {
    state = initial;
    for (const s of subs) s();
  },
};

export function usePhone<T>(sel: (s: PhoneState) => T): T {
  const cache = useRef<{ s: PhoneState | null; v: T }>({ s: null, v: undefined as T });
  const get = () => {
    const c = cache.current;
    if (c.s !== state) {
      c.s = state;
      c.v = sel(state);
    }
    return c.v;
  };
  return useSyncExternalStore(phone.subscribe, get, get);
}

export const top = (s: PhoneState): Screen => s.stack[s.stack.length - 1] ?? { app: "home" };
