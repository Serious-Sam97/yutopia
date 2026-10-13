"use client";

import {
  cleanState,
  clock,
  type MediaItem,
  type MediaState,
  mediaOf,
  parseYouTube,
  positionAt,
  ytThumb,
} from "@yutopia/shared/media";
import { useEffect, useMemo, useState } from "react";
import { useLang } from "@/lib/i18n";
import { serverNow } from "@/world/media/clock";
import { hud, toast, useHud } from "@/world/store";
import { useWorld } from "./ctx";
import { Panel } from "./Panel";

// The remote (docs/plan/10-media.md): what's on a TV (or the radio's YouTube),
// its controls, adding things from YouTube or Jellyfin, the queue. Anyone may
// use it; a locked one only builders. Words live here (EN / PT-BR), not in
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
  locked: ["Locked: only builders change it.", "Travada: só builders mudam."],
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
  added: ["Added {n}.", "{n} adicionado(s)."],
  radioHint: [
    "Everyone near the radio hears it, in sync. While you're near, a small player shows the video (YouTube's rule).",
    "Todo mundo perto do rádio ouve, sincronizado. Perto dele, um player pequeno mostra o vídeo (regra do YouTube).",
  ],
  tvHint: [
    "Everyone in the space sees it on this TV; whoever's near hears it.",
    "Todo mundo no espaço vê nesta TV; quem está perto ouve.",
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
  useHud((s) => s.radio);
  const canBuild = useHud((s) => s.canBuild);
  const [, tick] = useState(0);
  const radio = id === "radio";
  // the media chunk keeps the clock in step (and plays it)
  useEffect(() => {
    void w?.ensureScreens();
    const iv = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(iv);
  }, [w]);
  const m: MediaState | null = radio
    ? (() => {
        const raw = w?.room?.state.radio.media;
        return raw ? cleanState(JSON.parse(raw)) : null;
      })()
    : mediaOf(w?.engine?.getObject(id));
  const send = (op: string, extra: Record<string, unknown> = {}) =>
    w?.send("media:ctl", { id, op: op as never, ...extra });
  const play = (items: MediaItem[], mode: "now" | "next" | "end") => {
    if (!items.length) return;
    w?.send("media:play", { id, items, mode });
    if (mode !== "now") toast(t("added", { n: items.length }));
  };
  const locked = !!m?.lock && !canBuild;
  const jfOn = !!w?.mediaKey?.jf && !radio;
  const [tab, setTab] = useState<"yt" | "jf">("yt");

  return (
    <div className="flex flex-col gap-3">
      <NowPlaying t={t} m={m} radio={radio} locked={locked} canBuild={canBuild} send={send} id={id} />
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
  canBuild,
  send,
  id,
}: {
  t: TFn;
  m: MediaState | null;
  radio: boolean;
  locked: boolean;
  canBuild: boolean;
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
        {canBuild && m && (
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
function YouTube({ t, play }: { t: TFn; play: (items: MediaItem[], mode: "now" | "next" | "end") => void }) {
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
    play(items, mode);
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
