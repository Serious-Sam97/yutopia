import type { ClientMessages, WorldObjectDef } from "@yutopia/shared";
import {
  advance,
  cleanItem,
  cleanPlaylists,
  cleanState,
  editPlaylist,
  emptyMedia,
  isDisplay,
  isRadio,
  MAX_DUR,
  MAX_QUEUE,
  type MediaItem,
  type MediaState,
  pause,
  radioOf,
  rememberPlaylist,
  resume,
  seek,
  skip,
  startItem,
  tvVolume,
  YT_LIST,
} from "@yutopia/shared/media";
import { config } from "../config.ts";
import { jellyfinOn, playable, setPlaying } from "../media/jellyfin.ts";
import { mediaKey } from "../media/key.ts";
import { ytPlaylistTitle, ytSearchOn, ytTitle, ytVideos } from "../media/youtube.ts";
import { fromSchema, type WorldClient, type WorldRoom, toSchema } from "../WorldRoom.ts";
import { api } from "../api.ts";
import { registerFeature } from "./index.ts";

// Media on TVs and the radio (docs/plan/10-media.md). Nobody hosts it: the
// state is a timeline (shared/media.ts) everyone's player keeps to, and this
// moves the queue on by the clock — so whatever someone left playing keeps
// playing, watched or not, and survives restarts: each TV's state is its
// props.media, each radio's YouTube its props.radio (features/radio.ts), saved
// with the object — every one its own. Anyone may change it; a locked one only
// admins.
const OPS_PER_5S = 12;

registerFeature((room: WorldRoom) => {
  const player = (c: WorldClient) => room.state.players.get(c.sessionId);
  const warn = (c: WorldClient, text: string) => room.send(c, "toast", { text, tone: "warn" });
  // a TV or a radio
  const target = (id: string): WorldObjectDef | undefined => {
    const o = room.state.objects.get(id);
    const d = o ? fromSchema(o) : undefined;
    return d && (isDisplay(d.kind) || isRadio(d.kind)) ? d : undefined;
  };
  const read = (id: string): MediaState | null => {
    const d = target(id);
    if (!d) return null;
    if (isRadio(d.kind)) {
      const r = radioOf(d);
      return r.source === "yt" && r.media ? r.media : { ...emptyMedia(), lock: r.lock };
    }
    return cleanState(d.props?.media);
  };
  const write = (id: string, m: MediaState) => {
    const d = target(id);
    if (!d) return;
    const empty = !m.item && !m.queue.length;
    let props: Record<string, unknown>;
    if (isRadio(d.kind)) {
      const r = radioOf(d);
      // nothing queued: a lo-fi radio keeps its station (a lock), a YouTube one goes quiet
      const radio = empty
        ? { ...r, lock: m.lock, media: null, playing: r.source === "lofi" ? r.playing : false }
        : { ...r, source: "yt", lock: m.lock, media: m, playing: !!m.item && !m.paused, by: m.item ? m.by : r.by };
      props = { ...(d.props ?? {}), radio };
    } else {
      const { media: _, ...rest } = d.props ?? {};
      props = empty ? rest : { ...rest, media: m };
    }
    const next = { ...d, props };
    room.state.objects.set(d.id, toSchema(next));
    if (!config.offline) void api.putObject(next).catch((e) => console.warn("[media] save", e.message));
    if (isDisplay(d.kind)) track(d.id, m);
  };

  // which TVs play Jellyfin now (the stream routes only serve those)
  const jfTvs = new Set<string>();
  const track = (id: string, m: MediaState | null) => {
    const ref = m?.item?.src === "jf" ? m.item.ref : null;
    setPlaying(id, ref);
    if (ref) jfTvs.add(id);
    else jfTvs.delete(id);
  };
  for (const o of room.state.objects.values()) if (isDisplay(o.kind)) track(o.id, read(o.id));

  // ── who may ──
  const budget = new Map<string, number[]>();
  const may = (c: WorldClient, m: MediaState): boolean => {
    const p = player(c);
    if (!p) return false;
    const now = Date.now();
    const recent = (budget.get(c.sessionId) ?? []).filter((t) => now - t < 5000);
    if (recent.length >= OPS_PER_5S) return false;
    recent.push(now);
    budget.set(c.sessionId, recent);
    if (m.lock && !p.admin) {
      warn(c, "Only an admin changes this one (it's locked).");
      return false;
    }
    return true;
  };

  // What people send, checked and filled in: Jellyfin items from Jellyfin
  // itself (title, length), YouTube titles from oEmbed (which also says no to
  // what can't be embedded), lengths from the Data API when there's a key.
  const resolve = async (raw: unknown[], forRadio: boolean): Promise<MediaItem[]> => {
    const items = raw
      .slice(0, MAX_QUEUE)
      .map(cleanItem)
      .filter((x): x is MediaItem => !!x && (!forRadio || x.src === "yt"));
    const out = await Promise.all(
      items.map(async (it): Promise<MediaItem | null> => {
        if (it.src === "jf") {
          if (!jellyfinOn()) return null;
          const j = await playable(it.ref);
          return j ? { ...it, title: j.title.slice(0, 120), sub: j.sub, dur: j.dur } : null;
        }
        if (config.offline) return it;
        const t = await ytTitle(it.ref);
        return t ? { ...it, title: t.title, sub: t.sub ?? it.sub } : null;
      }),
    );
    const ok = out.filter((x): x is MediaItem => !!x);
    if (ytSearchOn()) {
      const unknown = ok.filter((x) => x.src === "yt" && !x.dur).map((x) => x.ref);
      if (unknown.length) {
        const lens = new Map((await ytVideos(unknown).catch(() => [])).map((v) => [v.ref, v.dur]));
        for (const x of ok) if (!x.dur && lens.get(x.ref)) x.dur = lens.get(x.ref) as number;
      }
    }
    return ok;
  };

  room.on("media:play", async (client, msg) => {
    const id = String(msg.id ?? "");
    const m = read(id);
    if (!m || !may(client, m) || !Array.isArray(msg.items) || !msg.items.length) return;
    const items = await resolve(msg.items, isRadio(target(id)?.kind ?? ""));
    if (!items.length) return warn(client, "That can't play here (private, removed or not allowed on other sites).");
    const by = player(client)?.name ?? "";
    // from a YouTube playlist: onto the world's quick list (named by YouTube the first time)
    if (typeof msg.list === "string" && YT_LIST.test(msg.list) && items.every((x) => x.src === "yt"))
      void remember(msg.list, items, by, player(client)?.uid);
    // re-read: others may have changed it while we looked things up
    let s = read(id) ?? emptyMedia();
    const now = Date.now();
    const mode = msg.mode === "next" || msg.mode === "end" ? msg.mode : "now";
    if (mode === "now" || !s.item) {
      const queue = mode === "now" ? [...items.slice(1), ...s.queue] : [...s.queue, ...items.slice(1)];
      s = startItem({ ...s, queue: queue.slice(0, MAX_QUEUE) }, items[0], now, by);
    } else if (mode === "next") s = { ...s, queue: [...items, ...s.queue].slice(0, MAX_QUEUE) };
    else s = { ...s, queue: [...s.queue, ...items].slice(0, MAX_QUEUE) };
    write(id, s);
  });

  room.on("media:ctl", (client, msg: ClientMessages["media:ctl"]) => {
    const id = String(msg.id ?? "");
    const m = read(id);
    if (!m) return;
    const p = player(client);
    if (msg.op === "lock") {
      if (!p?.admin) return warn(client, "Only admins lock it.");
      return write(id, { ...m, lock: !!msg.on });
    }
    if (!may(client, m)) return;
    const now = Date.now();
    const by = p?.name ?? "";
    const i = Number(msg.index);
    let s = m;
    switch (msg.op) {
      case "pause":
        s = pause(m, now);
        break;
      case "resume":
        s = resume(m, now);
        break;
      case "seek":
        if (!Number.isFinite(Number(msg.pos))) return;
        s = seek(m, Number(msg.pos), now);
        break;
      case "skip":
        s = skip(m, now, by);
        break;
      case "stop":
        s = { ...emptyMedia(), lock: m.lock, loop: m.loop };
        break;
      case "loop":
        s = { ...m, loop: !!msg.on };
        break;
      case "clear":
        s = { ...m, queue: [] };
        break;
      case "remove":
        if (!Number.isInteger(i) || i < 0 || i >= m.queue.length) return;
        s = { ...m, queue: m.queue.filter((_, k) => k !== i) };
        break;
      case "move": {
        const to = Number(msg.to);
        if (!Number.isInteger(i) || !Number.isInteger(to) || i < 0 || i >= m.queue.length) return;
        const q = [...m.queue];
        const [it] = q.splice(i, 1);
        q.splice(Math.max(0, Math.min(q.length, to)), 0, it);
        s = { ...m, queue: q };
        break;
      }
      default:
        return;
    }
    write(id, s);
  });

  // A TV's own volume knob (props.volume, kept when nothing's on): everyone
  // near hears it at that. Radios have theirs in features/radio.ts.
  room.on("media:volume", (client, msg) => {
    const p = player(client);
    const o = room.state.objects.get(String(msg.id ?? ""));
    const v = Number(msg.volume);
    if (!p || !o || !isDisplay(o.kind) || !Number.isFinite(v)) return;
    const d = fromSchema(o);
    if (cleanState(d.props?.media).lock && !p.admin)
      return warn(client, "Only an admin changes this one (it's locked).");
    const volume = Math.round(Math.max(0, Math.min(1, v)) * 100) / 100;
    if (volume === tvVolume(d)) return;
    const next = { ...d, props: { ...(d.props ?? {}), volume } };
    room.state.objects.set(d.id, toSchema(next));
    if (!config.offline) void api.putObject(next).catch((e) => console.warn("[media] save", e.message));
  });

  // A player found out how long something is (YouTube without an API key).
  room.on("media:dur", (_client, msg) => {
    const id = String(msg.id ?? "");
    const m = read(id);
    const dur = Number(msg.dur);
    if (!m || !Number.isFinite(dur) || dur < 1 || dur > MAX_DUR) return;
    const fill = (x: MediaItem) => (x.ref === msg.ref && !x.dur ? { ...x, dur: Math.round(dur * 10) / 10 } : x);
    const item = m.item ? fill(m.item) : null;
    const queue = m.queue.map(fill);
    if (item === m.item && queue.every((x, k) => x === m.queue[k])) return;
    write(id, { ...m, item, queue });
  });

  // ── the world's playlists ──
  const playlists = () => cleanPlaylists(JSON.parse(room.state.playlists || "[]"));
  let listsDirtyAt = 0;
  const remember = async (list: string, items: MediaItem[], by: string, byUid?: number) => {
    const known = playlists().find((p) => p.list === list);
    const name = known ? null : config.offline ? null : await ytPlaylistTitle(list);
    room.state.playlists = JSON.stringify(
      rememberPlaylist(
        playlists(),
        { list, title: known?.title ?? name?.title ?? "YouTube playlist", channel: name?.channel, items, by, byUid },
        Date.now(),
      ),
    );
    listsDirtyAt = Date.now();
  };
  const saveLists = () => {
    listsDirtyAt = 0;
    if (!config.offline)
      void api.putPlaylists(playlists()).catch((e) => console.warn("[media] playlists", e.message));
  };
  // rename it, pin it (for everyone), star it (my own "Mine")
  room.on("playlist:edit", (client, msg) => {
    const p = player(client);
    if (!p || typeof msg.list !== "string") return;
    const all = playlists();
    const next = editPlaylist(all, msg.list, {
      title: typeof msg.title === "string" ? msg.title : undefined,
      pinned: typeof msg.pinned === "boolean" ? msg.pinned : undefined,
      star: typeof msg.star === "boolean" ? { uid: p.uid, on: msg.star } : undefined,
    });
    if (next === all) return;
    room.state.playlists = JSON.stringify(next);
    listsDirtyAt = Date.now();
  });

  room.on("playlist:forget", (client, msg) => {
    const p = player(client);
    if (!p || typeof msg.list !== "string") return;
    const all = playlists();
    if (!all.some((x) => x.list === msg.list)) return;
    room.state.playlists = JSON.stringify(all.filter((x) => x.list !== msg.list));
    listsDirtyAt = Date.now();
  });

  // ── the clock moves the queues on ──
  let lastTick = 0;

  return {
    join(client, p) {
      room.send(client, "media:key", { key: mediaKey(p.uid), jf: jellyfinOn(), ytSearch: ytSearchOn() });
    },
    leave(client) {
      budget.delete(client.sessionId);
    },
    tick(_dt, now) {
      if (now - lastTick < 1000) return;
      lastTick = now;
      const seen = new Set<string>();
      for (const o of room.state.objects.values()) {
        // a radio's YouTube queue moves on like a TV's
        if (isRadio(o.kind)) {
          if (!o.props.includes('"source":"yt"')) continue;
          const m = read(o.id) as MediaState;
          const next = advance(m, now);
          if (next !== m) write(o.id, next);
          continue;
        }
        if (!isDisplay(o.kind)) continue;
        seen.add(o.id);
        if (!o.props.includes('"media"')) {
          if (jfTvs.has(o.id)) track(o.id, null);
          continue;
        }
        const m = read(o.id) as MediaState;
        const next = advance(m, now);
        if (next !== m) write(o.id, next);
        else if ((m.item?.src === "jf") !== jfTvs.has(o.id)) track(o.id, m);
      }
      for (const id of jfTvs) if (!seen.has(id)) track(id, null);
      // the playlists: saved a couple of seconds after they settle
      if (listsDirtyAt && now - listsDirtyAt > 2000) saveLists();
    },
    dispose() {
      if (listsDirtyAt) saveLists();
      for (const id of jfTvs) setPlaying(id, null);
    },
  };
});
