import { ticksToSec } from "@yutopia/shared/media";
import { config } from "../config.ts";

// Jellyfin for Yutopia's TVs (docs/plan/10-media.md). The key never leaves
// this process: browsing, pictures and streams all come through here.
//
// Streams: one Jellyfin session per TV (its own DeviceId), shared by everyone
// watching it. We ask PlaybackInfo for HLS (Jellyfin copies what a browser
// plays and transcodes the rest), serve its playlists with the key taken out,
// and keep its segments in a cache — so Jellyfin works once per TV however
// many people watch, and whoever arrives later gets the segments already made.

const jf = config.jellyfin;
export const jellyfinOn = () => !!(jf.url && jf.key);

const authFor = (device: string) =>
  `MediaBrowser Client="Yutopia", Device="${device}", DeviceId="${device}", Version="1", Token="${jf.key}"`;

async function call(path: string, init: RequestInit & { device?: string } = {}): Promise<Response> {
  const { device = "yutopia", ...rest } = init;
  const res = await fetch(jf.url + path, {
    ...rest,
    headers: { Authorization: authFor(device), Accept: "application/json", ...(rest.headers ?? {}) },
    signal: rest.signal ?? AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`Jellyfin ${path.split("?")[0]} → ${res.status}`);
  return res;
}
const json = async <T>(path: string, init?: RequestInit & { device?: string }) =>
  (await (await call(path, init)).json()) as T;

// ── who we browse as ───────────────────────────────────────────────────────
let userId: Promise<string> | null = null;
function user(): Promise<string> {
  userId ??= json<{ Id: string; Name: string; Policy?: { IsAdministrator?: boolean } }[]>("/Users")
    .then((users) => {
      const want = jf.user.toLowerCase();
      const u = want ? users.find((x) => x.Name.toLowerCase() === want) : users.find((x) => x.Policy?.IsAdministrator);
      if (!u) throw new Error(`Jellyfin user ${jf.user || "(an administrator)"} not found`);
      return u.Id;
    })
    .catch((e) => {
      userId = null;
      throw e;
    });
  return userId;
}

// ── browsing ───────────────────────────────────────────────────────────────
export interface JfEntry {
  id: string;
  name: string;
  type: string; // CollectionFolder, Series, Season, Episode, Movie, Folder…
  folder: boolean;
  sub?: string; // "Show · S1E2", a year
  dur?: number; // s
  image: boolean;
}

interface RawItem {
  Id: string;
  Name: string;
  Type: string;
  IsFolder?: boolean;
  CollectionType?: string;
  SeriesName?: string;
  ParentIndexNumber?: number;
  IndexNumber?: number;
  ProductionYear?: number;
  RunTimeTicks?: number;
  ImageTags?: Record<string, string>;
  BackdropImageTags?: string[];
  ParentThumbItemId?: string;
}

const PLAYABLE = ["Movie", "Episode", "Video", "MusicVideo"];

function entryOf(i: RawItem): JfEntry {
  const ep =
    i.Type === "Episode"
      ? [
          i.SeriesName,
          i.ParentIndexNumber != null && i.IndexNumber != null ? `S${i.ParentIndexNumber}E${i.IndexNumber}` : "",
        ]
          .filter(Boolean)
          .join(" · ")
      : i.ProductionYear
        ? String(i.ProductionYear)
        : "";
  const e: JfEntry = {
    id: i.Id,
    name: i.Name,
    type: i.Type,
    folder: !!i.IsFolder && !PLAYABLE.includes(i.Type),
    image: !!(i.ImageTags?.Primary || i.ImageTags?.Thumb || i.BackdropImageTags?.length),
  };
  if (ep) e.sub = ep;
  const d = ticksToSec(i.RunTimeTicks);
  if (d > 0) e.dur = d;
  return e;
}

const FIELDS = "Fields=PrimaryImageAspectRatio,ProductionYear&EnableImageTypes=Primary,Thumb,Backdrop&ImageTypeLimit=1";

export async function libraries(): Promise<JfEntry[]> {
  const u = await user();
  const r = await json<{ Items: RawItem[] }>(`/Users/${u}/Views`);
  return r.Items.filter((i) =>
    ["movies", "tvshows", "musicvideos", "homevideos", "mixed", undefined].includes(i.CollectionType),
  ).map((i) => ({ ...entryOf(i), folder: true }));
}

export async function browse(o: {
  parent?: string;
  q?: string;
  start?: number;
}): Promise<{ items: JfEntry[]; total: number }> {
  const u = await user();
  const p = new URLSearchParams();
  const q = (o.q ?? "").trim().slice(0, 80);
  if (q) {
    p.set("SearchTerm", q);
    p.set("Recursive", "true");
    p.set("IncludeItemTypes", "Movie,Series,Episode,Video,MusicVideo");
  } else if (o.parent) {
    p.set("ParentId", o.parent);
    p.set("SortBy", "ParentIndexNumber,IndexNumber,SortName");
  } else return { items: await libraries(), total: 0 };
  if (q && o.parent) p.set("ParentId", o.parent);
  p.set("Limit", "60");
  p.set("StartIndex", String(Math.max(0, Math.floor(o.start ?? 0))));
  const r = await json<{ Items: RawItem[]; TotalRecordCount: number }>(`/Users/${u}/Items?${p}&${FIELDS}`);
  return { items: r.Items.map(entryOf), total: r.TotalRecordCount };
}

// A playable item: its title, a line under it and its length (what goes in
// the queue), or null when it's not something to play / not visible to us.
export async function playable(id: string): Promise<{ title: string; sub?: string; dur: number } | null> {
  try {
    const u = await user();
    const i = await json<RawItem>(`/Users/${u}/Items/${id}`);
    if (!PLAYABLE.includes(i.Type)) return null;
    const e = entryOf(i);
    return { title: i.Name, sub: e.sub, dur: e.dur ?? 0 };
  } catch {
    return null;
  }
}

// The item's picture (an episode's own still, a film's poster…), as bytes.
export async function image(id: string, width: number): Promise<{ body: ArrayBuffer; type: string } | null> {
  const w = Math.max(64, Math.min(960, Math.round(width)));
  for (const kind of ["Primary", "Thumb", "Backdrop"]) {
    try {
      const r = await call(`/Items/${id}/Images/${kind}?fillWidth=${w}&quality=80`, { headers: { Accept: "image/*" } });
      return { body: await r.arrayBuffer(), type: r.headers.get("content-type") ?? "image/jpeg" };
    } catch {
      // try the next kind
    }
  }
  return null;
}

// ── streams ────────────────────────────────────────────────────────────────
const PROFILE = {
  MaxStreamingBitrate: jf.bitrate,
  DirectPlayProfiles: [],
  TranscodingProfiles: [
    {
      Container: "ts",
      Type: "Video",
      VideoCodec: "h264",
      // AAC only: MP3 inside HLS (mp4a.40.34) isn't something browsers' players take
      AudioCodec: "aac",
      Protocol: "hls",
      Context: "Streaming",
      MaxAudioChannels: "2",
      BreakOnNonKeyFrames: true,
      MinSegments: 1,
    },
  ],
  ContainerProfiles: [],
  CodecProfiles: [],
  SubtitleProfiles: [{ Format: "vtt", Method: "Hls" }],
};

interface Session {
  key: string; // "<space>:<tv>:<item>"
  device: string;
  item: string;
  base: string; // /videos/<item>/
  master: string; // its master playlist (path + query, the key taken out)
  playSession: string;
  ready: Promise<void>;
  lastUsed: number;
}

const sessions = new Map<string, Session>();
// what each TV plays now (the media feature keeps this up to date)
const playing = new Map<string, string>(); // "<space>:<tv>" → item id

// (stops at a quote: subtitle URIs sit inside URI="…" attributes)
const stripKey = (s: string) => s.replace(/([?&])(ApiKey|api_key)=[^&\s"]*(&?)/gi, (_m, a, _k, b) => (b ? a : ""));

export function setPlaying(spaceId: number, tv: string, item: string | null) {
  const k = `${spaceId}:${tv}`;
  const was = playing.get(k);
  if (was === item) return;
  if (item) playing.set(k, item);
  else playing.delete(k);
  if (was) void close(`${k}:${was}`);
}
export function isPlaying(spaceId: number, tv: string, item: string): boolean {
  return playing.get(`${spaceId}:${tv}`) === item;
}

function open(spaceId: number, tv: string, item: string): Session {
  const key = `${spaceId}:${tv}:${item}`;
  const had = sessions.get(key);
  if (had) {
    had.lastUsed = Date.now();
    return had;
  }
  const s: Session = {
    key,
    device: `yutopia-${spaceId}-${tv}`.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 80),
    item,
    base: `/videos/${item}/`,
    master: "",
    playSession: "",
    ready: Promise.resolve(),
    lastUsed: Date.now(),
  };
  s.ready = (async () => {
    const u = await user();
    const pi = await json<{ PlaySessionId: string; MediaSources: { TranscodingUrl?: string }[] }>(
      `/Items/${item}/PlaybackInfo?UserId=${u}&AutoOpenLiveStream=true`,
      {
        method: "POST",
        device: s.device,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ DeviceProfile: PROFILE, MaxStreamingBitrate: jf.bitrate }),
      },
    );
    const url = pi.MediaSources[0]?.TranscodingUrl;
    if (!url) throw new Error("Jellyfin offered no stream");
    s.playSession = pi.PlaySessionId;
    const base = url.slice(0, url.indexOf("?")).replace(/[^/]*$/, "");
    s.base = base;
    s.master = stripKey(url.slice(base.length));
  })();
  s.ready.catch(() => sessions.delete(key));
  sessions.set(key, s);
  return s;
}

async function close(key: string) {
  const s = sessions.get(key);
  sessions.delete(key);
  playlists.delete(key);
  for (const [k, v] of cache)
    if (k.startsWith(`${key}|`)) {
      cache.delete(k);
      if (v instanceof Buffer) cached -= v.length;
    }
  if (!s?.playSession) return;
  await call(`/Videos/ActiveEncodings?DeviceId=${s.device}&PlaySessionId=${s.playSession}`, {
    method: "DELETE",
    device: s.device,
  }).catch(() => {});
}

// Segments: a shared cache (LRU by bytes), in-flight fetches shared too.
const CACHE_BYTES = 320 * 1024 * 1024;
let cached = 0;
const cache = new Map<string, Promise<Buffer> | Buffer>();
let fetches = 0; // to Jellyfin, for the tests and metrics

function remember(k: string, b: Buffer) {
  cache.delete(k);
  cache.set(k, b);
  cached += b.length;
  for (const [old, v] of cache) {
    if (cached <= CACHE_BYTES) break;
    if (old === k || !(v instanceof Buffer)) continue;
    cache.delete(old);
    cached -= v.length;
  }
}

async function upstream(s: Session, rest: string): Promise<Response> {
  fetches++;
  const sep = rest.includes("?") ? "&" : "?";
  return call(`${s.base}${rest}${sep}ApiKey=${encodeURIComponent(jf.key)}`, {
    device: s.device,
    headers: { Accept: "*/*" },
    signal: AbortSignal.timeout(60_000),
  });
}

function segment(s: Session, rest: string): Promise<Buffer> {
  const k = `${s.key}|${rest}`;
  const hit = cache.get(k);
  if (hit instanceof Buffer) {
    cache.delete(k);
    cache.set(k, hit);
    return Promise.resolve(hit);
  }
  if (hit) return hit as Promise<Buffer>;
  const p = upstream(s, rest)
    .then(async (r) => Buffer.from(await r.arrayBuffer()))
    .then((b) => {
      remember(k, b);
      return b;
    });
  p.catch(() => cache.delete(k));
  cache.set(k, p);
  return p;
}

// What the HTTP route asks: a playlist or a segment of a TV's stream.
export async function stream(
  spaceId: number,
  tv: string,
  item: string,
  rest: string,
): Promise<{ body: Buffer | string; type: string } | null> {
  if (!isPlaying(spaceId, tv, item)) return null;
  const s = open(spaceId, tv, item);
  await s.ready;
  s.lastUsed = Date.now();
  if (rest === "master.m3u8") {
    const r = await upstream(s, s.master);
    return { body: stripKey(await r.text()), type: "application/vnd.apple.mpegurl" };
  }
  if (/\.m3u8(\?|$)/.test(rest)) {
    const k = `${s.key}|pl|${rest}`;
    const hit = cache.get(k);
    const text = hit instanceof Buffer ? hit.toString() : stripKey(await (await upstream(s, rest)).text());
    if (!(hit instanceof Buffer)) remember(k, Buffer.from(text));
    playlists.set(s.key, text);
    return { body: text, type: "application/vnd.apple.mpegurl" };
  }
  const body = await segment(s, rest);
  ahead(s, rest);
  const name = rest.split("?")[0];
  const type = name.endsWith(".vtt")
    ? "text/vtt"
    : name.endsWith(".mp4") || name.endsWith(".m4s")
      ? "video/mp4"
      : "video/mp2t";
  return { body, type };
}

// The variant playlist each session served last: the next couple of segments
// after the one asked for are made ahead, while it plays (the playlist's lines
// sit in the same folder as the playlist, so a line is exactly what a player
// asks for).
const playlists = new Map<string, string>();
function ahead(s: Session, rest: string) {
  const lines = (playlists.get(s.key) ?? "").split("\n").filter((l) => l && !l.startsWith("#"));
  const i = lines.indexOf(rest);
  if (i < 0) return;
  for (const next of lines.slice(i + 1, i + 3)) void segment(s, next).catch(() => {});
}

// Sessions nobody asked anything of for a while: closed (Jellyfin stops its
// transcode). The TV keeps its place; the next viewer opens a new one.
setInterval(() => {
  const now = Date.now();
  for (const s of sessions.values()) if (now - s.lastUsed > 5 * 60_000) void close(s.key);
}, 60_000).unref();

export const jellyfinStats = () => ({ sessions: sessions.size, cachedBytes: cached, fetches });
