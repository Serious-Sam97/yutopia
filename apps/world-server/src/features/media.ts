import type { ClientMessages, WorldObjectDef } from "@yutopia/shared";
import {
  advance,
  cleanItem,
  cleanState,
  emptyMedia,
  isDisplay,
  MAX_DUR,
  MAX_JF_TVS,
  MAX_QUEUE,
  type MediaItem,
  type MediaState,
  pause,
  resume,
  seek,
  skip,
  startItem,
} from "@yutopia/shared/media";
import { config } from "../config.ts";
import { jellyfinOn, playable, setPlaying } from "../media/jellyfin.ts";
import { mediaKey } from "../media/key.ts";
import { ytSearchOn, ytTitle, ytVideos } from "../media/youtube.ts";
import { fromSchema, type SpaceClient, type SpaceRoom, toSchema } from "../SpaceRoom.ts";
import { yondra } from "../yondra.ts";
import { registerFeature } from "./index.ts";

// Media on TVs and the radio (docs/plan/10-media.md). Nobody hosts it: the
// state is a timeline (shared/media.ts) everyone's player keeps to, and this
// moves the queue on by the clock — so whatever someone left playing keeps
// playing, watched or not, and survives restarts (a TV's state is its
// props.media, stored with the object; the radio's goes to Yondra).
// Anyone in the space may change it; a locked one only builders.
const RADIO = "radio";
const OPS_PER_5S = 12;

registerFeature((room: SpaceRoom) => {
  const radio = room.state.radio;
  const spaceId = room.spaceId;

  // ── the radio as it was ──
  const saved = room.savedRadio as Record<string, unknown> | null;
  if (saved && typeof saved === "object") {
    radio.source = saved.source === "yt" ? "yt" : "lofi";
    radio.station = Number.isInteger(saved.station) ? Number(saved.station) : 0;
    radio.playing = saved.playing === true;
    radio.startedAt = Number(saved.startedAt) || Date.now();
    radio.by = typeof saved.by === "string" ? saved.by : "";
    const m = cleanState(saved.media);
    radio.media = m.item || m.queue.length ? JSON.stringify(m) : "";
  }

  const player = (c: SpaceClient) => room.state.players.get(c.sessionId);
  const warn = (c: SpaceClient, text: string) => room.send(c, "toast", { text, tone: "warn" });
  const display = (id: string): WorldObjectDef | undefined => {
    const o = room.state.objects.get(id);
    const d = o ? fromSchema(o) : undefined;
    return d && isDisplay(d.kind) ? d : undefined;
  };
  const read = (id: string): MediaState | null => {
    if (id === RADIO) return cleanState(radio.media ? JSON.parse(radio.media) : null);
    const d = display(id);
    return d ? cleanState(d.props?.media) : null;
  };
  const write = (id: string, m: MediaState) => {
    const empty = !m.item && !m.queue.length;
    if (id === RADIO) {
      radio.media = empty ? "" : JSON.stringify(m);
      radio.source = "yt";
      radio.playing = !!m.item && !m.paused;
      if (m.item) radio.by = m.by;
      return;
    }
    const d = display(id);
    if (!d) return;
    const { media: _, ...rest } = d.props ?? {};
    const next = { ...d, props: empty ? rest : { ...rest, media: m } };
    room.state.objects.set(d.id, toSchema(next));
    if (!config.offline) void yondra.putObject(spaceId, next).catch((e) => console.warn("[media] save", e.message));
    track(d.id, m);
  };

  // which TVs play Jellyfin now (the stream routes only serve those)
  const jfTvs = new Set<string>();
  const track = (id: string, m: MediaState | null) => {
    const ref = m?.item?.src === "jf" ? m.item.ref : null;
    setPlaying(spaceId, id, ref);
    if (ref) jfTvs.add(id);
    else jfTvs.delete(id);
  };
  for (const o of room.state.objects.values()) if (isDisplay(o.kind)) track(o.id, read(o.id));

  // ── who may ──
  const budget = new Map<string, number[]>();
  const may = (c: SpaceClient, m: MediaState): boolean => {
    const p = player(c);
    if (!p) return false;
    const now = Date.now();
    const recent = (budget.get(c.sessionId) ?? []).filter((t) => now - t < 5000);
    if (recent.length >= OPS_PER_5S) return false;
    recent.push(now);
    budget.set(c.sessionId, recent);
    if (m.lock && !p.builder) {
      warn(c, "Only builders change this one (it's locked).");
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

  const jfBusy = (id: string) => [...jfTvs].filter((t) => t !== id && !read(t)?.paused).length >= MAX_JF_TVS;

  room.on("media:play", async (client, msg) => {
    const id = String(msg.id ?? "");
    const m = read(id);
    if (!m || !may(client, m) || !Array.isArray(msg.items) || !msg.items.length) return;
    const items = await resolve(msg.items, id === RADIO);
    if (!items.length) return warn(client, "That can't play here (private, removed or not allowed on other sites).");
    const by = player(client)?.name ?? "";
    // re-read: others may have changed it while we looked things up
    let s = read(id) ?? emptyMedia();
    const now = Date.now();
    const mode = msg.mode === "next" || msg.mode === "end" ? msg.mode : "now";
    if (mode === "now" || !s.item) {
      if (items[0].src === "jf" && jfBusy(id))
        return warn(client, `${MAX_JF_TVS} TVs are on Jellyfin already: turn one off first.`);
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
      if (!p?.builder) return warn(client, "Only builders lock a TV.");
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
        if (m.item?.src === "jf" && jfBusy(id))
          return warn(client, `${MAX_JF_TVS} TVs are on Jellyfin already: turn one off first.`);
        s = resume(m, now);
        break;
      case "seek":
        if (!Number.isFinite(Number(msg.pos))) return;
        s = seek(m, Number(msg.pos), now);
        break;
      case "skip":
        s = skip(m, now, by);
        if (s.item?.src === "jf" && jfBusy(id)) s = { ...s, paused: true, pos: 0 };
        break;
      case "stop":
        s = { ...emptyMedia(), lock: m.lock, loop: m.loop };
        if (id === RADIO) radio.playing = false;
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

  // ── the clock moves the queues on; the radio is saved when it changes ──
  let lastTick = 0;
  let radioSaved = JSON.stringify(radioSnapshot());
  let radioDirtyAt = 0;
  function radioSnapshot() {
    return {
      source: radio.source,
      station: radio.station,
      playing: radio.playing,
      startedAt: radio.startedAt,
      by: radio.by,
      media: radio.media ? JSON.parse(radio.media) : null,
    };
  }
  const saveRadio = () => {
    const snap = radioSnapshot();
    const s = JSON.stringify(snap);
    if (s === radioSaved) return;
    radioSaved = s;
    if (!config.offline) void yondra.putRadio(spaceId, snap).catch((e) => console.warn("[media] radio", e.message));
  };

  return {
    join(client, p) {
      room.send(client, "media:key", { key: mediaKey(spaceId, p.uid), jf: jellyfinOn(), ytSearch: ytSearchOn() });
    },
    leave(client) {
      budget.delete(client.sessionId);
    },
    tick(_dt, now) {
      if (now - lastTick < 1000) return;
      lastTick = now;
      if (radio.media) {
        const m = read(RADIO) as MediaState;
        const next = advance(m, now);
        if (next !== m) {
          write(RADIO, next);
          if (!next.item) radio.playing = false;
        }
      }
      const seen = new Set<string>();
      for (const o of room.state.objects.values()) {
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
      // the radio: saved a couple of seconds after it settles
      if (JSON.stringify(radioSnapshot()) !== radioSaved) {
        if (!radioDirtyAt) radioDirtyAt = now;
        else if (now - radioDirtyAt > 2000) {
          radioDirtyAt = 0;
          saveRadio();
        }
      } else radioDirtyAt = 0;
    },
    dispose() {
      saveRadio();
      for (const id of jfTvs) setPlaying(spaceId, id, null);
    },
  };
});
