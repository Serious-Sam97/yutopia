// Media on TVs and the radio (docs/plan/10-media.md): what plays, the shared
// timeline everyone keeps to, the queue, where each TV's glass is, and the
// checks on what people send. Shared by the client (players, panels), the
// world-server (rules, the queue's clock) and the tests.

import { entry, footprint, type WorldObjectDef } from "./catalog.ts";
import { TV_SCREEN, turnLocal } from "./games.ts";
import { topCentre } from "./tops.ts";

export type MediaSrc = "yt" | "jf";

// One thing to play: a YouTube video or a Jellyfin item.
export interface MediaItem {
  src: MediaSrc;
  ref: string; // YouTube video id / Jellyfin item id
  title: string;
  sub?: string; // the channel, or "Show · S1E2"
  dur: number; // s (0 = not known yet: the first player that loads it says)
}

// What a TV (props.media) or the radio (its yt source) is doing. Playback is
// time-based: position = (server now − at) / 1000 while playing, `pos` while
// paused. The world-server moves the queue on when an item's time is up.
export interface MediaState {
  item: MediaItem | null;
  at: number; // server ms when the item's position 0 played
  paused: boolean;
  pos: number; // s, while paused
  loop: boolean; // repeat: what finished goes to the back of the queue
  queue: MediaItem[];
  by: string; // who put the current item on
  lock: boolean; // only builders change it
}

export const MAX_QUEUE = 50;
export const MAX_TITLE = 120;
export const MAX_DUR = 12 * 3600;
// Jellyfin TVs playing at once per space (each is one transcode on the server).
export const MAX_JF_TVS = 3;
export const YT_ID = /^[A-Za-z0-9_-]{11}$/;
export const YT_LIST = /^[A-Za-z0-9_-]{10,64}$/;
export const JF_ID = /^[0-9a-f]{32}$/;

export function emptyMedia(): MediaState {
  return { item: null, at: 0, paused: false, pos: 0, loop: true, queue: [], by: "", lock: false };
}

// ── links ────────────────────────────────────────────────────────────────────
// youtube.com/watch?v=…, youtu.be/…, music.youtube.com, /shorts/…, /embed/…,
// /live/…, and playlists (list=…). A bare 11-character id works too.
export function parseYouTube(input: string): { video?: string; list?: string } | null {
  const s = input.trim();
  if (YT_ID.test(s)) return { video: s };
  let u: URL;
  try {
    u = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`);
  } catch {
    return null;
  }
  const host = u.hostname.toLowerCase().replace(/^(www|m|music)\./, "");
  let video: string | undefined;
  if (host === "youtu.be") video = u.pathname.slice(1).split("/")[0];
  else if (host === "youtube.com" || host === "youtube-nocookie.com") {
    const v = u.searchParams.get("v");
    if (v) video = v;
    else {
      const m = u.pathname.match(/^\/(?:shorts|embed|live|v)\/([^/?#]+)/);
      if (m) video = m[1];
    }
  } else return null;
  const list = u.searchParams.get("list") ?? undefined;
  const out: { video?: string; list?: string } = {};
  if (video && YT_ID.test(video)) out.video = video;
  if (list && YT_LIST.test(list)) out.list = list;
  return out.video || out.list ? out : null;
}

export function ytThumb(id: string, size: "mq" | "hq" = "mq"): string {
  return `https://i.ytimg.com/vi/${id}/${size}default.jpg`;
}

// ── checks ───────────────────────────────────────────────────────────────────
const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

export function cleanItem(v: unknown): MediaItem | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const src = o.src === "yt" || o.src === "jf" ? o.src : null;
  const ref = typeof o.ref === "string" ? o.ref : "";
  if (!src || !(src === "yt" ? YT_ID : JF_ID).test(ref)) return null;
  const dur = Number(o.dur);
  const item: MediaItem = {
    src,
    ref,
    title: str(o.title, MAX_TITLE) || (src === "yt" ? "YouTube" : "Jellyfin"),
    dur: Number.isFinite(dur) && dur > 0 ? Math.min(MAX_DUR, dur) : 0,
  };
  const sub = str(o.sub, MAX_TITLE);
  if (sub) item.sub = sub;
  return item;
}

// A stored state (props.media, the radio's) back into shape: whatever went
// missing (Yondra turns "" into null) gets its default.
export function cleanState(v: unknown): MediaState {
  const e = emptyMedia();
  if (!v || typeof v !== "object") return e;
  const o = v as Record<string, unknown>;
  const num = (x: unknown, d: number) => (Number.isFinite(Number(x)) && x !== null ? Number(x) : d);
  return {
    item: cleanItem(o.item),
    at: num(o.at, 0),
    paused: o.paused === true,
    pos: Math.max(0, num(o.pos, 0)),
    loop: o.loop !== false,
    queue: Array.isArray(o.queue)
      ? o.queue
          .map(cleanItem)
          .filter((x): x is MediaItem => !!x)
          .slice(0, MAX_QUEUE)
      : [],
    by: str(o.by, 60),
    lock: o.lock === true,
  };
}

// ── the timeline ─────────────────────────────────────────────────────────────
// Where the current item is (s), clamped to its length when known.
export function positionAt(m: MediaState, now: number): number {
  if (!m.item) return 0;
  if (m.paused) return m.pos;
  const p = Math.max(0, (now - m.at) / 1000);
  return m.item.dur > 0 ? Math.min(p, m.item.dur) : p;
}

// Start playing `item` now (at position `from`).
export function startItem(m: MediaState, item: MediaItem, now: number, by: string, from = 0): MediaState {
  return { ...m, item, at: now - from * 1000, paused: false, pos: from, by };
}

// Move on past whatever has finished by `now`: the next in the queue starts
// where the last one ended (so a TV nobody watched is where it would be), the
// finished one goes to the back when repeating. A lone item on repeat starts
// over. Returns the same object when nothing changed.
export function advance(m: MediaState, now: number): MediaState {
  let s = m;
  // on repeat with every length known, whole rounds of the queue change
  // nothing: skip them at once (a TV left on for a week)
  if (s.loop && s.item && !s.paused && s.item.dur > 0 && s.queue.every((q) => q.dur > 0)) {
    const round = (s.item.dur + s.queue.reduce((t, q) => t + q.dur, 0)) * 1000;
    const rounds = Math.floor((now - s.at) / round);
    if (rounds > 0) s = { ...s, at: s.at + rounds * round };
  }
  // bounded: a long-forgotten playlist of short items catches up in steps
  for (let i = 0; i < 500; i++) {
    const it = s.item;
    if (!it || s.paused || it.dur <= 0) return s;
    const end = s.at + it.dur * 1000;
    if (now < end) return s;
    const queue = [...s.queue];
    if (s.loop) queue.push(it);
    const next = queue.shift() ?? null;
    if (!next) return { ...s, item: null, queue, at: 0, pos: 0 };
    s = { ...s, item: next, queue, at: end, pos: 0 };
    // an item of unknown length stops the catch-up: it starts now instead
    if (next.dur <= 0) return { ...s, at: Math.max(end, now - 1000) };
  }
  return { ...s, at: now };
}

export function pause(m: MediaState, now: number): MediaState {
  if (!m.item || m.paused) return m;
  return { ...m, paused: true, pos: positionAt(m, now) };
}
export function resume(m: MediaState, now: number): MediaState {
  if (!m.item || !m.paused) return m;
  return { ...m, paused: false, at: now - m.pos * 1000 };
}
export function seek(m: MediaState, pos: number, now: number): MediaState {
  if (!m.item) return m;
  const max = m.item.dur > 0 ? m.item.dur : MAX_DUR;
  const p = Math.max(0, Math.min(max, pos));
  return m.paused ? { ...m, pos: p } : { ...m, at: now - p * 1000 };
}
export function skip(m: MediaState, now: number, by: string): MediaState {
  const queue = [...m.queue];
  if (m.loop && m.item) queue.push(m.item);
  const next = queue.shift() ?? null;
  if (!next) return { ...m, item: null, queue, at: 0, pos: 0, paused: false };
  return { ...startItem({ ...m, queue }, next, now, by) };
}

// ── where the picture goes ───────────────────────────────────────────────────
// The glass of each display, in rot-0 local tiles (x along the front, y the
// plane it's on, z px up): the art draws the set around it, the client maps
// the picture onto it. `wall`: hangs on a north wall (always rot 0).
export interface Glass {
  x0: number;
  x1: number;
  y: number;
  z0: number;
  z1: number;
  aspect: number; // the picture's shape (w / h)
  look: "crt" | "hd" | "screen"; // scanlines + bulge, a flat panel, a matte screen
  wall?: boolean;
  top?: boolean; // stands on a surface (1 × 1 local frame round its middle, lifted by props.z)
}

// Wall items: the face of the wall is at y 0.1 (WALL_FACE), their own front a
// few hundredths in front of it.
export const GLASS: Record<string, Glass> = {
  crt_tv: { ...TV_SCREEN, aspect: 4 / 3, look: "crt" },
  tv_console: { x0: 0.42, x1: 1.4, y: 0.87, z0: 15, z1: 40, aspect: 4 / 3, look: "crt" },
  tv_portable: { x0: 0.3, x1: 0.62, y: 0.69, z0: 4, z1: 12.5, aspect: 4 / 3, look: "crt", top: true },
  tv_wall: { x0: 0.22, x1: 0.7, y: 0.42, z0: 55, z1: 74, aspect: 4 / 3, look: "crt", wall: true },
  tv_hd: { x0: 0.2, x1: 2.8, y: 0.17, z0: 28, z1: 78, aspect: 16 / 9, look: "hd", wall: true },
  projector_screen: { x0: 0.16, x1: 2.84, y: 0.15, z0: 24, z1: 80, aspect: 16 / 9, look: "screen", wall: true },
  screen_wall: { x0: 0.14, x1: 3.86, y: 0.16, z0: 21, z1: 73, aspect: 16 / 9, look: "hd", wall: true },
};

export const DISPLAY_KINDS = Object.keys(GLASS);
export const isDisplay = (kind: string): boolean => Object.hasOwn(GLASS, kind);

// The glass's top-left and top-right corners in world tiles, and its top and
// bottom z (px). Wall displays hang at rot 0; TVs turn with the item; a
// portable TV turns round its middle and stands on its surface (props.z).
export function glassCorners(o: WorldObjectDef): {
  tl: [number, number];
  tr: [number, number];
  zTop: number;
  zBot: number;
} | null {
  const g = GLASS[o.kind];
  if (!g) return null;
  const lift = g.top ? Number(o.props?.z) || 0 : 0;
  if (g.wall) return { tl: [o.x + g.x0, o.y + g.y], tr: [o.x + g.x1, o.y + g.y], zTop: g.z1, zBot: g.z0 };
  const rot = o.rot ?? 0;
  if (g.top) {
    const c = topCentre(o);
    const a = turnLocal(g.x0, g.y, rot, 1, 1);
    const b = turnLocal(g.x1, g.y, rot, 1, 1);
    return {
      tl: [c.x - 0.5 + a[0], c.y - 0.5 + a[1]],
      tr: [c.x - 0.5 + b[0], c.y - 0.5 + b[1]],
      zTop: g.z1 + lift,
      zBot: g.z0 + lift,
    };
  }
  const e = entry(o.kind);
  const a = turnLocal(g.x0, g.y, rot, e.w, e.h);
  const b = turnLocal(g.x1, g.y, rot, e.w, e.h);
  return { tl: [o.x + a[0], o.y + a[1]], tr: [o.x + b[0], o.y + b[1]], zTop: g.z1, zBot: g.z0 };
}

// Whether the glass faces the camera (rot 0 / 3 for things on the floor; wall
// displays always do).
export function glassFacing(o: WorldObjectDef): boolean {
  const g = GLASS[o.kind];
  if (!g) return false;
  if (g.wall) return true;
  const r = (o.rot ?? 0) & 3;
  return r === 0 || r === 3;
}

// Where its sound comes from: in front of the glass, on the floor.
export function displaySpot(o: WorldObjectDef): { x: number; y: number } {
  const g = GLASS[o.kind];
  if (g?.wall) {
    const { w } = footprint(o.kind, 0);
    return { x: o.x + w / 2, y: o.y + 0.6 };
  }
  if (g?.top) return topCentre(o);
  const { w, h } = footprint(o.kind, o.rot ?? 0);
  return { x: o.x + w / 2, y: o.y + h / 2 };
}

// A TV's media (props.media), or nothing.
export function mediaOf(o: WorldObjectDef | undefined): MediaState | null {
  if (!o || !isDisplay(o.kind) || !o.props?.media) return null;
  const m = cleanState(o.props.media);
  return m.item || m.queue.length ? m : null;
}

// The CRT TV shows media on its "TV" input (consoles are AV1 / AV2).
export const MEDIA_INPUT = "media";
export function showsMedia(o: WorldObjectDef): boolean {
  if (!isDisplay(o.kind)) return false;
  if (o.kind === "crt_tv") return o.props?.input === MEDIA_INPUT;
  // the big screen: media unless it's set to show a board or the stage
  if (o.kind === "screen_wall") return !o.props?.source;
  return true;
}

// A Jellyfin item's running time: ticks (100 ns) → s.
export const ticksToSec = (t: unknown) => (Number.isFinite(Number(t)) ? Math.round(Number(t) / 1e7) : 0);

// "1:02:03" / "4:05"
export function clock(s: number): string {
  const t = Math.max(0, Math.floor(s));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const ss = String(t % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}
