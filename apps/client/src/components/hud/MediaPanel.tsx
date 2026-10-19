"use client";

import {
  cleanPlaylists,
  clock,
  isMine,
  isRadio,
  type MediaItem,
  type MediaState,
  mediaAt,
  mediaOf,
  parseYouTube,
  positionAt,
  type SavedPlaylist,
  tvVolume,
  ytThumb,
} from "@yutopia/shared/media";
import { useEffect, useMemo, useState } from "react";
import { useLang } from "@/lib/i18n";
import { serverNow } from "@/world/media/clock";
import { hud, toast, useHud } from "@/world/store";
import { useWorld } from "./ctx";
import { Panel } from "./Panel";

// The remote (docs/plan/10-media.md): what's on a TV (or a radio's YouTube),
// its controls, adding things from YouTube or Jellyfin, the queue. Anyone may
// use it; a locked one only admins. Words live here (EN / PT-BR), not in
// i18n.ts: the world page's budget.
const T = {
  remote: ["TV", "TV"],
  nothing: ["Nothing on", "Nada passando"],
  nothingHint: [
    "Put something on: it keeps playing for everyone who passes by.",
    "Coloque algo: fica passando pra todo mundo que passar.",
  ],
  by: ["put on by {name}", "colocado por {name}"],
  play: ["Play", "Tocar"],
  pause: ["Pause", "Pausar"],
  skip: ["Next", "Próximo"],
  stop: ["Turn off", "Desligar"],
  repeat: ["Repeat", "Repetir"],
  lock: ["Lock", "Travar"],
  locked: ["Locked: only admins change it.", "Travada: só admins mudam."],
  watch: ["Watch", "Assistir"],
  yt: ["YouTube", "YouTube"],
  jf: ["Jellyfin", "Jellyfin"],
  link: ["Paste a YouTube link (video or playlist)", "Cole um link do YouTube (vídeo ou playlist)"],
  now: ["Play now", "Tocar agora"],
  next: ["Play next", "Tocar depois"],
  end: ["Add to queue", "Pôr na fila"],
  badLink: ["That isn't a YouTube link.", "Isso não é um link do YouTube."],
  search: ["Search", "Buscar"],
  searchYt: ["Search YouTube", "Buscar no YouTube"],
  searchJf: ["Search the library", "Buscar na biblioteca"],
  libraries: ["Libraries", "Bibliotecas"],
  back: ["Back", "Voltar"],
  more: ["More", "Mais"],
  queue: ["Up next", "A seguir"],
  empty: ["The queue is empty.", "A fila está vazia."],
  clear: ["Clear", "Limpar"],
  up: ["Move up", "Subir"],
  remove: ["Remove", "Tirar"],
  loading: ["Loading…", "Carregando…"],
  failed: ["The media server didn't answer.", "O servidor de mídia não respondeu."],
  listing: ["Reading the playlist…", "Lendo a playlist…"],
  saved: ["Playlists played here", "Playlists já usadas aqui"],
  savedShort: ["Or a playlist played here:", "Ou uma playlist já usada:"],
  videos: ["{n} videos", "{n} vídeos"],
  forget: ["Take off the list", "Tirar da lista"],
  all: ["All {n}", "Todas ({n})"],
  fewer: ["Fewer", "Menos"],
  allLists: ["All", "Todas"],
  mine: ["Mine", "Minhas"],
  mineEmpty: ["Star a playlist (☆) to keep it here.", "Marque uma playlist com ☆ para guardar aqui."],
  star: ["Add to Mine", "Pôr em Minhas"],
  unstar: ["Take out of Mine", "Tirar de Minhas"],
  options: ["Rename, pin, remove", "Renomear, fixar, tirar"],
  rename: ["Rename", "Renomear"],
  pin: ["Pin for everyone", "Fixar para todos"],
  unpin: ["Unpin", "Desafixar"],
  pinned: ["Pinned", "Fixada"],
  added: ["Added {n}.", "{n} adicionado(s)."],
  radioHint: [
    "Everyone near this radio hears it, in sync; other radios play their own. While you're near, a small player shows the video (YouTube's rule).",
    "Todo mundo perto deste rádio ouve, sincronizado; os outros rádios tocam o deles. Perto dele, um player pequeno mostra o vídeo (regra do YouTube).",
  ],
  tvHint: [
    "Everyone in the space sees it on this TV; whoever's near hears it. Every TV plays its own.",
    "Todo mundo no espaço vê nesta TV; quem está perto ouve. Cada TV toca a sua.",
  ],
} as const;
type K = keyof typeof T;
type TFn = (k: K, v?: Record<string, string | number>) => string;

function useT(): TFn {
  const pt = useLang() === "pt";
  return (k, v = {}) =>
    Object.entries(v).reduce<string>((s, [a, b]) => s.replace(`{${a}}`, String(b)), T[k][pt ? 1 : 0]);
}

// A TV's own panel (the new screens).
export function MediaPanel({ objectId }: { objectId: string }) {
  const t = useT();
  const w = useWorld();
  const label = w?.engine?.getObject(objectId)?.kind;
  return (
    <Panel title={label ? `${t("remote")} · ${labelOf(label)}` : t("remote")}>
      <MediaRemote id={objectId} />
    </Panel>
  );
}

const LABELS: Record<string, string> = {
  tv_wall: "Wall TV",
  tv_hd: "Big HD TV",
  projector_screen: "Projector",
  tv_giant: "Giant TV",
  cinema_screen: "Cinema screen",
  tv_console: "Console TV",
  tv_portable: "Portable TV",
  crt_tv: "CRT TV",
  screen_wall: "Big screen",
};
const labelOf = (kind: string) => LABELS[kind] ?? kind;

// The remote itself (also inside the radio's, the big screen's and the CRT's panels).
export function MediaRemote({ id }: { id: string }) {
  const t = useT();
  const w = useWorld();
  useHud((s) => s.objectsVersion);
  const canLock = useHud((s) => s.isAdmin);
  const [, tick] = useState(0);
  const obj = w?.engine?.getObject(id);
  const radio = isRadio(obj?.kind ?? "");
  // the media chunk keeps the clock in step (and plays it)
  useEffect(() => {
    void w?.ensureScreens();
    const iv = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(iv);
  }, [w]);
  // this TV's, or this radio's YouTube: every one its own
  const m: MediaState | null = mediaAt(obj);
  const send = (op: string, extra: Record<string, unknown> = {}) =>
    w?.send("media:ctl", { id, op: op as never, ...extra });
  const play = (items: MediaItem[], mode: "now" | "next" | "end", list?: string) => {
    if (!items.length) return;
    w?.send("media:play", list ? { id, items, mode, list } : { id, items, mode });
    if (mode !== "now") toast(t("added", { n: items.length }));
  };
  const locked = !!m?.lock && !canLock;
  const jfOn = !!w?.mediaKey?.jf && !radio;
  const [tab, setTab] = useState<"yt" | "jf">("yt");

  return (
    <div className="flex flex-col gap-3">
      {!radio && <TvVolume id={id} />}
      <NowPlaying t={t} m={m} radio={radio} locked={locked} canLock={canLock} send={send} id={id} />
      {!locked && (
        <section className="vfd-window p-3 flex flex-col gap-2">
          {jfOn && (
            <div className="flex gap-2">
              {(["yt", "jf"] as const).map((k) => (
                <button key={k} type="button" className="chip" aria-pressed={tab === k} onClick={() => setTab(k)}>
                  {t(k)}
                </button>
              ))}
            </div>
          )}
          {tab === "jf" && jfOn ? <Jellyfin t={t} play={play} /> : <YouTube t={t} play={play} />}
        </section>
      )}
      <Queue t={t} m={m} locked={locked} send={send} />
      <p className="text-xs" style={{ color: "var(--muted)" }}>
        {t(radio ? "radioHint" : "tvHint")}
      </p>
    </div>
  );
}

function NowPlaying({
  t,
  m,
  radio,
  locked,
  canLock,
  send,
  id,
}: {
  t: TFn;
  m: MediaState | null;
  radio: boolean;
  locked: boolean;
  canLock: boolean;
  send: (op: string, extra?: Record<string, unknown>) => void;
  id: string;
}) {
  const w = useWorld();
  const item = m?.item;
  const [drag, setDrag] = useState<number | null>(null);
  const pos = drag ?? (m ? positionAt(m, serverNow()) : 0);
  const dur = item?.dur ?? 0;
  // seek once, where the slider is let go (not on every step of a drag)
  const commit = () => {
    if (drag === null) return;
    send("seek", { pos: drag });
    setDrag(null);
  };
  return (
    <section className="vfd-window p-3 flex flex-col gap-2" aria-live="polite">
      <div className="flex gap-3 items-center min-w-0">
        {item && (
          // biome-ignore lint/performance/noImgElement: a remote thumbnail, not a page asset
          <img
            src={thumbOf(item, w?.worldHttp ?? "", w?.mediaKey?.key ?? "")}
            alt=""
            width={96}
            height={54}
            className="rounded shrink-0 object-cover"
            style={{ width: 96, height: 54, background: "#000" }}
          />
        )}
        <div className="min-w-0 flex-1">
          <p className="lcd text-lg leading-tight truncate">{item ? item.title : t("nothing")}</p>
          <p className="mono text-xs truncate" style={{ color: "var(--cream-dim)" }}>
            {item ? [item.sub, m?.by ? t("by", { name: m.by }) : ""].filter(Boolean).join(" · ") : t("nothingHint")}
          </p>
        </div>
      </div>
      {item && dur > 0 && (
        <>
          <input
            type="range"
            aria-label="Position"
            min={0}
            max={Math.max(1, Math.round(dur))}
            value={Math.round(pos)}
            disabled={locked}
            onChange={(e) => setDrag(Number(e.target.value))}
            onPointerUp={commit}
            onKeyUp={commit}
            onBlur={commit}
            className="w-full accent-[var(--amber)]"
          />
          <p className="mono text-xs flex justify-between" style={{ color: "var(--cream-dim)" }}>
            <span>{clock(pos)}</span>
            <span>{dur ? clock(dur) : "--:--"}</span>
          </p>
        </>
      )}
      <div className="flex flex-wrap gap-2">
        {item && (
          <button
            type="button"
            className="deck-btn"
            aria-pressed={false}
            disabled={locked}
            onClick={() => send(m?.paused ? "resume" : "pause")}
          >
            {m?.paused ? `▶ ${t("play")}` : `❚❚ ${t("pause")}`}
          </button>
        )}
        {item && (
          <button
            type="button"
            className="deck-btn"
            aria-pressed={false}
            disabled={locked}
            onClick={() => send("skip")}
          >
            ⏭ {t("skip")}
          </button>
        )}
        <button
          type="button"
          className="deck-btn"
          aria-pressed={!!m?.loop || !m}
          disabled={locked || !m}
          onClick={() => send("loop", { on: !m?.loop })}
        >
          <span className="led" />
          {t("repeat")}
        </button>
        {canLock && m && (
          <button
            type="button"
            className="deck-btn"
            aria-pressed={!!m.lock}
            onClick={() => send("lock", { on: !m.lock })}
          >
            <span className="led" />
            {t("lock")}
          </button>
        )}
        {item && !radio && (
          <button
            type="button"
            className="deck-btn"
            aria-pressed={false}
            onClick={() => {
              void w?.ensureScreens().then(() => w?.screens?.watch(id));
              hud.set({ panel: { kind: null } });
            }}
          >
            ⤢ {t("watch")}
          </button>
        )}
        {item && (
          <button
            type="button"
            className="deck-btn danger"
            aria-pressed={false}
            disabled={locked}
            onClick={() => send("stop")}
          >
            ■ {t("stop")}
          </button>
        )}
      </div>
      {locked && (
        <p className="text-xs" style={{ color: "var(--amber)" }}>
          {t("locked")}
        </p>
      )}
    </section>
  );
}

function thumbOf(item: MediaItem, http: string, key: string): string {
  return item.src === "yt"
    ? ytThumb(item.ref, "mq")
    : `${http}/media/jf/img/${encodeURIComponent(key)}/${item.ref}?w=200`;
}

function Buttons({ t, onPick }: { t: TFn; onPick: (mode: "now" | "next" | "end") => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      <button type="button" className="deck-btn" aria-pressed={false} onClick={() => onPick("now")}>
        ▶ {t("now")}
      </button>
      <button type="button" className="ghost-btn" onClick={() => onPick("next")}>
        {t("next")}
      </button>
      <button type="button" className="ghost-btn" onClick={() => onPick("end")}>
        + {t("end")}
      </button>
    </div>
  );
}

// ── YouTube: a link (video or playlist), or a search with an API key ─────────
type PlayFn = (items: MediaItem[], mode: "now" | "next" | "end", list?: string) => void;

function YouTube({ t, play }: { t: TFn; play: PlayFn }) {
  const w = useWorld();
  const [link, setLink] = useState("");
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<MediaItem[] | null>(null);
  const search = !!w?.mediaKey?.ytSearch;
  const base = `${w?.worldHttp}/media/yt/api/${encodeURIComponent(w?.mediaKey?.key ?? "")}`;

  const fromLink = async (mode: "now" | "next" | "end") => {
    const p = parseYouTube(link);
    if (!p) return toast(t("badLink"), "warn");
    let items: MediaItem[] = [];
    if (p.list) {
      setBusy(true);
      try {
        items = search
          ? ((await (await fetch(`${base}/list?id=${p.list}`)).json()).items as MediaItem[])
          : (await listIds(p.list)).map((ref) => ({ src: "yt", ref, title: "YouTube", dur: 0 }));
      } catch {
        toast(t("failed"), "warn");
      }
      setBusy(false);
      // the linked video first, if there was one
      if (p.video)
        items = [{ src: "yt", ref: p.video, title: "YouTube", dur: 0 }, ...items.filter((x) => x.ref !== p.video)];
    } else if (p.video) items = [{ src: "yt", ref: p.video, title: "YouTube", dur: 0 }];
    play(items, mode, p.list);
    setLink("");
  };

  const find = async () => {
    if (!q.trim()) return;
    setResults(null);
    setBusy(true);
    try {
      setResults(
        ((await (await fetch(`${base}/search?q=${encodeURIComponent(q)}`)).json()).items as MediaItem[]) ?? [],
      );
    } catch {
      toast(t("failed"), "warn");
      setResults([]);
    }
    setBusy(false);
  };

  return (
    <div className="flex flex-col gap-2">
      <SavedPlaylists t={t} play={play} />
      <input
        className="field"
        value={link}
        onChange={(e) => setLink(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && void fromLink("now")}
        placeholder={t("link")}
        aria-label={t("link")}
        inputMode="url"
      />
      {busy && <p className="text-xs">{t("listing")}</p>}
      {link.trim() && <Buttons t={t} onPick={(mode) => void fromLink(mode)} />}
      {search && (
        <>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void find();
            }}
          >
            <input
              className="field flex-1"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t("searchYt")}
              aria-label={t("searchYt")}
            />
            <button type="submit" className="ghost-btn">
              {t("search")}
            </button>
          </form>
          {results && <ItemList t={t} items={results} play={play} />}
        </>
      )}
    </div>
  );
}

// A playlist's videos without an API key: a player (shown, as YouTube wants)
// cued on the list tells us its ids.
async function listIds(list: string): Promise<string[]> {
  const { loadYouTubeApi } = await import("@/world/media/youtube");
  const YT = await loadYouTubeApi();
  const box = document.createElement("div");
  Object.assign(box.style, {
    position: "fixed",
    right: "16px",
    top: "72px",
    width: "320px",
    height: "180px",
    zIndex: "70",
  });
  const el = document.createElement("div");
  box.append(el);
  document.body.append(box);
  try {
    return await new Promise<string[]>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("timeout")), 12_000);
      const p = new YT.Player(el, {
        width: "100%",
        height: "100%",
        videoId: "",
        playerVars: { listType: "playlist", list, autoplay: 0 },
        events: {
          onReady: () => {
            // the list arrives a moment after the player is ready
            let n = 0;
            const look = setInterval(() => {
              const ids = (p as unknown as { getPlaylist(): string[] | null }).getPlaylist?.() ?? null;
              if (ids?.length || ++n > 40) {
                clearInterval(look);
                clearTimeout(timer);
                resolve(ids ?? []);
              }
            }, 250);
          },
        },
      });
    });
  } finally {
    box.remove();
  }
}

function ItemList({
  t,
  items,
  play,
}: {
  t: TFn;
  items: MediaItem[];
  play: (items: MediaItem[], mode: "now" | "next" | "end") => void;
}) {
  const w = useWorld();
  if (!items.length) return <p className="text-xs">—</p>;
  return (
    <ul className="flex flex-col gap-1 max-h-72 overflow-y-auto scroll-thin">
      {items.map((it) => (
        <li key={it.ref} className="flex items-center gap-2 min-w-0">
          {/* biome-ignore lint/performance/noImgElement: remote thumbnails */}
          <img
            src={thumbOf(it, w?.worldHttp ?? "", w?.mediaKey?.key ?? "")}
            alt=""
            width={64}
            height={36}
            loading="lazy"
            className="rounded shrink-0 object-cover"
            style={{ width: 64, height: 36, background: "#000" }}
          />
          <div className="min-w-0 flex-1">
            <p className="text-sm truncate">{it.title}</p>
            <p className="mono text-xs truncate" style={{ color: "var(--muted)" }}>
              {[it.sub, it.dur ? clock(it.dur) : ""].filter(Boolean).join(" · ")}
            </p>
          </div>
          <button
            type="button"
            className="ghost-btn"
            aria-label={`${t("now")}: ${it.title}`}
            onClick={() => play([it], "now")}
          >
            ▶
          </button>
          <button
            type="button"
            className="ghost-btn"
            aria-label={`${t("end")}: ${it.title}`}
            onClick={() => play([it], "end")}
          >
            +
          </button>
        </li>
      ))}
    </ul>
  );
}

// ── Jellyfin: libraries → folders / shows → seasons → episodes, or a search ──
interface JfEntry {
  id: string;
  name: string;
  type: string;
  folder: boolean;
  sub?: string;
  dur?: number;
  image: boolean;
}

function Jellyfin({ t, play }: { t: TFn; play: (items: MediaItem[], mode: "now" | "next" | "end") => void }) {
  const w = useWorld();
  const key = w?.mediaKey?.key ?? "";
  const base = `${w?.worldHttp}/media/jf`;
  const [path, setPath] = useState<{ id: string; name: string }[]>([]);
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<JfEntry[] | null>(null);
  const [total, setTotal] = useState(0);
  const parent = path[path.length - 1]?.id;

  const load = useMemo(
    () => async (start: number) => {
      const p = new URLSearchParams();
      if (parent) p.set("parent", parent);
      if (query) p.set("q", query);
      if (start) p.set("start", String(start));
      const r = await fetch(`${base}/api/${encodeURIComponent(key)}/browse?${p}`);
      if (!r.ok) throw new Error(String(r.status));
      return (await r.json()) as { items: JfEntry[]; total: number };
    },
    [base, key, parent, query],
  );
  const failed = t("failed");
  useEffect(() => {
    let on = true;
    setItems(null);
    load(0)
      .then((r) => {
        if (!on) return;
        setItems(r.items);
        setTotal(r.total);
      })
      .catch(() => {
        if (on) setItems([]);
        toast(failed, "warn");
      });
    return () => {
      on = false;
    };
  }, [load, failed]);

  const toItem = (e: JfEntry): MediaItem => ({ src: "jf", ref: e.id, title: e.name, sub: e.sub, dur: e.dur ?? 0 });
  return (
    <div className="flex flex-col gap-2">
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setQuery(q.trim());
        }}
      >
        <input
          className="field flex-1"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t("searchJf")}
          aria-label={t("searchJf")}
        />
        <button type="submit" className="ghost-btn">
          {t("search")}
        </button>
      </form>
      <nav className="flex flex-wrap gap-1 items-center text-xs" aria-label={t("libraries")}>
        <button
          type="button"
          className="chip"
          aria-pressed={!path.length && !query}
          onClick={() => {
            setPath([]);
            setQuery("");
            setQ("");
          }}
        >
          {t("libraries")}
        </button>
        {path.map((p, i) => (
          <button
            key={p.id}
            type="button"
            className="chip"
            aria-pressed={i === path.length - 1}
            onClick={() => setPath(path.slice(0, i + 1))}
          >
            {p.name}
          </button>
        ))}
      </nav>
      {!items ? (
        <p className="text-xs">{t("loading")}</p>
      ) : (
        <ul className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-80 overflow-y-auto scroll-thin">
          {items.map((e) => (
            <li key={e.id} className="flex flex-col gap-1 min-w-0">
              <button
                type="button"
                className="relative rounded overflow-hidden text-left"
                style={{ aspectRatio: "16/9", background: "#000" }}
                aria-label={e.folder ? e.name : `${t("now")}: ${e.name}`}
                onClick={() => {
                  if (e.folder) {
                    setQuery("");
                    setPath([...path, { id: e.id, name: e.name }]);
                  } else play([toItem(e)], "now");
                }}
              >
                {e.image && (
                  // biome-ignore lint/performance/noImgElement: remote pictures through the world-server
                  <img
                    src={`${base}/img/${encodeURIComponent(key)}/${e.id}?w=240`}
                    alt=""
                    loading="lazy"
                    className="absolute inset-0 w-full h-full object-cover"
                  />
                )}
                {!e.folder && (
                  <span
                    className="absolute right-1 bottom-1 mono text-[10px] px-1 rounded"
                    style={{ background: "#000a" }}
                  >
                    ▶ {e.dur ? clock(e.dur) : ""}
                  </span>
                )}
              </button>
              <p className="text-xs truncate" title={e.name}>
                {e.name}
              </p>
              {e.sub && (
                <p className="mono text-[10px] truncate" style={{ color: "var(--muted)" }}>
                  {e.sub}
                </p>
              )}
              {!e.folder && (
                <div className="flex gap-1">
                  <button type="button" className="ghost-btn text-xs" onClick={() => play([toItem(e)], "next")}>
                    {t("next")}
                  </button>
                  <button type="button" className="ghost-btn text-xs" onClick={() => play([toItem(e)], "end")}>
                    +
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {items && total > items.length && (
        <button
          type="button"
          className="ghost-btn"
          onClick={() =>
            void load(items.length)
              .then((r) => setItems([...items, ...r.items]))
              .catch(() => toast(t("failed"), "warn"))
          }
        >
          {t("more")}
        </button>
      )}
    </div>
  );
}

// ── the queue ───────────────────────────────────────────────────────────────
function Queue({
  t,
  m,
  locked,
  send,
}: {
  t: TFn;
  m: MediaState | null;
  locked: boolean;
  send: (op: string, extra?: Record<string, unknown>) => void;
}) {
  const q = m?.queue ?? [];
  return (
    <section className="flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">{t("queue")}</h3>
        {q.length > 0 && !locked && (
          <button type="button" className="ghost-btn text-xs" onClick={() => send("clear")}>
            {t("clear")}
          </button>
        )}
      </div>
      {!q.length ? (
        <p className="text-xs" style={{ color: "var(--muted)" }}>
          {t("empty")}
        </p>
      ) : (
        <ol className="flex flex-col gap-1 max-h-48 overflow-y-auto scroll-thin">
          {q.map((it, i) => (
            <li key={`${it.ref}-${i}`} className="flex items-center gap-2 min-w-0 text-sm">
              <span className="mono text-xs w-5 text-right" style={{ color: "var(--muted)" }}>
                {i + 1}
              </span>
              <span className="truncate flex-1">{it.title}</span>
              <span className="mono text-xs" style={{ color: "var(--muted)" }}>
                {it.dur ? clock(it.dur) : ""}
              </span>
              {!locked && i > 0 && (
                <button
                  type="button"
                  className="ghost-btn text-xs"
                  aria-label={t("up")}
                  onClick={() => send("move", { index: i, to: i - 1 })}
                >
                  ↑
                </button>
              )}
              {!locked && (
                <button
                  type="button"
                  className="ghost-btn text-xs"
                  aria-label={t("remove")}
                  onClick={() => send("remove", { index: i })}
                >
                  ✕
                </button>
              )}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

// ── the space's playlists: every YouTube playlist played here (on a radio or a
// TV), named by YouTube the first time — one click plays it again ───────────
function savedOf(w: ReturnType<typeof useWorld>): SavedPlaylist[] {
  try {
    return cleanPlaylists(JSON.parse(w?.room?.state.playlists || "[]"));
  } catch {
    return [];
  }
}

function SavedPlaylists({ t, play }: { t: TFn; play: PlayFn }) {
  const w = useWorld();
  const uid = useHud((s) => s.me?.uid);
  const [all, setAll] = useState(false);
  const [mine, setMine] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [name, setName] = useState("");
  const every = savedOf(w);
  if (!every.length) return null;
  const mineN = every.filter((p) => isMine(p, uid)).length;
  const lists = mine ? every.filter((p) => isMine(p, uid)) : every;
  const shown = all ? lists : lists.slice(0, 5);
  const edit = (list: string, e: { title?: string; pinned?: boolean; star?: boolean }) =>
    w?.send("playlist:edit", { list, ...e });
  return (
    <section className="flex flex-col gap-1" aria-label={t("saved")}>
      <div className="flex items-center gap-2 flex-wrap">
        <h3 className="mono text-[11px] uppercase tracking-wider mr-auto" style={{ color: "var(--cream-dim)" }}>
          {t("saved")}
        </h3>
        <button type="button" className="chip" aria-pressed={!mine} onClick={() => setMine(false)}>
          {t("allLists")}
        </button>
        <button type="button" className="chip" aria-pressed={mine} onClick={() => setMine(true)}>
          ★ {t("mine")} ({mineN})
        </button>
      </div>
      {!lists.length && (
        <p className="text-xs" style={{ color: "var(--muted)" }}>
          {t("mineEmpty")}
        </p>
      )}
      <ul className="flex flex-col gap-1 max-h-72 overflow-y-auto scroll-thin">
        {shown.map((p) => {
          const starred = !!uid && !!p.stars?.includes(uid);
          return (
            <li key={p.list} className="flex flex-col gap-1">
              <div className="flex items-center gap-2 min-w-0">
                {/* biome-ignore lint/performance/noImgElement: remote thumbnails */}
                <img
                  src={ytThumb(p.items[0].ref, "mq")}
                  alt=""
                  width={64}
                  height={36}
                  loading="lazy"
                  className="rounded shrink-0 object-cover"
                  style={{ width: 64, height: 36, background: "#000" }}
                />
                <button
                  type="button"
                  className="min-w-0 flex-1 text-left"
                  onClick={() => play(p.items, "now", p.list)}
                  aria-label={`${t("now")}: ${p.title}`}
                >
                  <p className="text-sm truncate">
                    {p.pinned && <span title={t("pinned")}>📌 </span>}
                    {p.title}
                  </p>
                  <p className="mono text-xs truncate" style={{ color: "var(--muted)" }}>
                    {[p.channel, t("videos", { n: p.items.length }), p.by].filter(Boolean).join(" · ")}
                  </p>
                </button>
                <button
                  type="button"
                  className="ghost-btn"
                  aria-label={`${t("now")}: ${p.title}`}
                  onClick={() => play(p.items, "now", p.list)}
                >
                  ▶
                </button>
                <button
                  type="button"
                  className="ghost-btn"
                  aria-label={`${t("end")}: ${p.title}`}
                  onClick={() => play(p.items, "end", p.list)}
                >
                  +
                </button>
                <button
                  type="button"
                  className="ghost-btn"
                  aria-pressed={starred}
                  aria-label={`${t(starred ? "unstar" : "star")}: ${p.title}`}
                  title={t(starred ? "unstar" : "star")}
                  style={starred ? { color: "var(--amber)" } : undefined}
                  onClick={() => edit(p.list, { star: !starred })}
                >
                  {starred ? "★" : "☆"}
                </button>
                <button
                  type="button"
                  className="ghost-btn"
                  aria-expanded={editing === p.list}
                  aria-label={`${t("options")}: ${p.title}`}
                  onClick={() => {
                    setEditing(editing === p.list ? null : p.list);
                    setName(p.title);
                  }}
                >
                  ⋯
                </button>
              </div>
              {editing === p.list && (
                <form
                  className="flex items-center gap-2 flex-wrap pl-[72px]"
                  onSubmit={(e) => {
                    e.preventDefault();
                    edit(p.list, { title: name });
                    setEditing(null);
                  }}
                >
                  <input
                    className="field flex-1 min-w-40 py-1"
                    value={name}
                    maxLength={120}
                    onChange={(e) => setName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key !== "Escape") return;
                      e.stopPropagation();
                      setEditing(null);
                    }}
                    aria-label={t("rename")}
                    // biome-ignore lint/a11y/noAutofocus: the field the button just opened
                    autoFocus
                  />
                  <button type="submit" className="ghost-btn text-xs">
                    {t("rename")}
                  </button>
                  <button
                    type="button"
                    className="ghost-btn text-xs"
                    aria-pressed={!!p.pinned}
                    onClick={() => edit(p.list, { pinned: !p.pinned })}
                  >
                    📌 {t(p.pinned ? "unpin" : "pin")}
                  </button>
                  <button
                    type="button"
                    className="ghost-btn text-xs"
                    onClick={() => {
                      w?.send("playlist:forget", { list: p.list });
                      setEditing(null);
                    }}
                  >
                    ✕ {t("forget")}
                  </button>
                </form>
              )}
            </li>
          );
        })}
      </ul>
      {lists.length > 5 && (
        <button type="button" className="ghost-btn self-start text-xs" onClick={() => setAll(!all)}>
          {all ? t("fewer") : t("all", { n: lists.length })}
        </button>
      )}
    </section>
  );
}

// A radio's lo-fi tab: the playlists as chips (pinned, then mine, then the
// rest), one tap switches this radio to it.
export function PlaylistChips({ id }: { id: string }) {
  const t = useT();
  const w = useWorld();
  const uid = useHud((s) => s.me?.uid);
  useHud((s) => s.objectsVersion);
  const every = savedOf(w);
  const rank = (p: SavedPlaylist) => (p.pinned ? 0 : isMine(p, uid) ? 1 : 2);
  const lists = every
    .map((p, i) => ({ p, i }))
    .sort((a, b) => rank(a.p) - rank(b.p) || a.i - b.i)
    .map((x) => x.p)
    .slice(0, 8);
  if (!lists.length) return null;
  return (
    <section className="mt-4 flex flex-col gap-2">
      <p className="text-xs" style={{ color: "var(--cream-dim)" }}>
        {t("savedShort")}
      </p>
      <div className="flex flex-wrap gap-2">
        {lists.map((p) => (
          <button
            key={p.list}
            type="button"
            className="chip normal-case max-w-full truncate"
            aria-pressed={false}
            title={`${p.title} · ${t("videos", { n: p.items.length })}`}
            onClick={() => w?.send("media:play", { id, items: p.items, mode: "now", list: p.list })}
          >
            {p.pinned ? "📌" : isMine(p, uid) ? "★" : "▶"} {p.title}
          </button>
        ))}
      </div>
    </section>
  );
}

// A thing's own volume knob (a TV, a radio): everyone near hears it at this.
// It goes out when the slider is let go, not on every step of a drag.
export function VolumeKnob({
  value,
  label,
  disabled,
  onCommit,
}: {
  value: number;
  label: string;
  disabled?: boolean;
  onCommit: (v: number) => void;
}) {
  const [drag, setDrag] = useState<number | null>(null);
  const v = drag ?? value;
  const commit = () => {
    if (drag === null) return;
    onCommit(drag);
    setDrag(null);
  };
  return (
    <label className="flex items-center gap-3">
      <span className="mono text-xs uppercase w-24 shrink-0" style={{ color: "var(--cream-dim)" }}>
        {v === 0 ? "🔇" : v < 0.5 ? "🔉" : "🔊"} Volume
      </span>
      <input
        type="range"
        min={0}
        max={100}
        value={Math.round(v * 100)}
        aria-label={label}
        disabled={disabled}
        onChange={(e) => setDrag(Number(e.target.value) / 100)}
        onPointerUp={commit}
        onKeyUp={commit}
        onBlur={commit}
        className="flex-1 accent-[var(--amber)]"
      />
      <span className="mono text-xs w-10 text-right" style={{ color: "var(--cream-dim)" }}>
        {Math.round(v * 100)}%
      </span>
    </label>
  );
}

// A TV's knob (its media and, on the CRT, its consoles' sound).
export function TvVolume({ id }: { id: string }) {
  const w = useWorld();
  const pt = useLang() === "pt";
  useHud((s) => s.objectsVersion);
  const canLock = useHud((s) => s.isAdmin);
  const o = w?.engine?.getObject(id);
  const locked = !!mediaOf(o)?.lock && !canLock;
  return (
    <VolumeKnob
      value={tvVolume(o)}
      label={pt ? "Volume desta TV" : "This TV's volume"}
      disabled={locked}
      onCommit={(volume) => w?.send("media:volume", { id, volume })}
    />
  );
}
