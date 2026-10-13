"use client";

import { type GameSystem, type PadButton, romFits, SYSTEMS } from "@yutopia/shared";
import { useEffect, useMemo, useRef, useState } from "react";
import { useLang, useTr } from "@/lib/i18n";
import { type Cartridge, library, removeGame, saveInfo, upload } from "@/world/games/api";
import { bit, KEY_HINTS } from "@/world/games/input";
import { hud, toast, useHud } from "@/world/store";
import { useWorld } from "./ctx";

// The game room's panel (docs/plan/09-game-room.md), for a console, a TV or the
// cartridge shelf. Not a modal: the camera leans in over the TV and this sits
// in front of it — the picture big in a CRT frame, the console's controls under
// it. Words live here (EN / PT-BR), not in i18n.ts: the world page's budget.
const T = {
  plugged: ["Plugged into the TV", "Ligado na TV"],
  unplugged: ["Not plugged into a TV", "Não está ligado numa TV"],
  plug: ["Connect to the TV", "Ligar na TV"],
  plugN: ["…or the TV {d} tiles away", "…ou na TV a {d} tiles"],
  unplug: ["Unplug", "Desligar o cabo"],
  noTv: [
    "No TV close enough: put this by one (a cable reaches 4 tiles).",
    "Nenhuma TV perto: coloque perto de uma (o cabo alcança 4 tiles).",
  ],
  cart: ["Cartridge", "Cartucho"],
  noCart: ["No cartridge in", "Sem cartucho"],
  change: ["Change cartridge", "Trocar cartucho"],
  insert: ["Insert a cartridge", "Colocar um cartucho"],
  eject: ["Eject", "Tirar"],
  on: ["Turn on", "Ligar"],
  off: ["Turn off", "Desligar"],
  pad: ["Pad {n}", "Controle {n}"],
  take: ["Take pad {n}", "Pegar controle {n}"],
  putDown: ["Put down", "Largar"],
  free: ["free", "livre"],
  you: ["you", "você"],
  carryOn: ["Carry on (from the last save)", "Continuar (do último save)"],
  resume: ["Turn on where it was left", "Ligar de onde parou"],
  paused: ["{name} left — paused.", "{name} saiu — pausado."],
  noSignal: ["NO SIGNAL", "SEM SINAL"],
  starting: ["Warming up…", "Esquentando…"],
  save: ["Save now", "Salvar agora"],
  saved: ["Saved — whoever carries on starts here.", "Salvo — quem continuar começa daqui."],
  streaming: ["On the TV for everyone", "Na TV pra todo mundo"],
  local: ["Only you see it (no video link)", "Só você vê (sem vídeo)"],
  runs: ["{name} is running it", "{name} está rodando"],
  keys: ["Keys", "Teclas"],
  gamepad: ["or a gamepad", "ou um gamepad"],
  watch: ["Watch", "Assistir"],
  inputs: ["Input", "Entrada"],
  tvOff: ["Nothing on: turn a console on", "Nada passando: ligue um console"],
  shelf: ["Cartridge shelf", "Estante de cartuchos"],
  builtIn: ["Comes with Yutopia", "Vem com o Yutopia"],
  ours: ["The team's", "Do time"],
  bring: ["Bring your cartridge", "Traga seu cartucho"],
  bringHint: [
    "Only cartridges you own. They stay in this space: only who turns a console on downloads one; everyone else sees the TV.",
    "Só cartuchos que você tem. Ficam neste espaço: só quem liga o console baixa; o resto vê a TV.",
  ],
  console: ["Console", "Console"],
  title: ["Title", "Título"],
  color: ["Label", "Etiqueta"],
  players: ["Players", "Jogadores"],
  file: ["File", "Arquivo"],
  add: ["Put it on the shelf", "Colocar na estante"],
  remove: ["Take it away", "Tirar da estante"],
  wrongFile: [
    "That file isn't a cartridge for this console (or it's too big).",
    "Esse arquivo não é cartucho desse console (ou é grande demais).",
  ],
  added: ["On the shelf.", "Na estante."],
  credits: ["by {author} · {license}", "por {author} · {license}"],
  close: ["Close", "Fechar"],
  pick: ["Pick a cartridge", "Escolha um cartucho"],
  pPlayers: ["{n} players", "{n} jogadores"],
} as const;
type K = keyof typeof T;
const LABELS = ["#c4402b", "#f0a12c", "#7fa34a", "#4f86c6", "#7a5c8a", "#efe4cc", "#3d4a5c", "#b5562f"];
const SHORT: Record<GameSystem, string> = {
  "2600": "2600",
  nes: "8-bit",
  snes: "16-bit",
  md: "16-bit ⚫",
  gb: "Handheld",
};

export function GamePanel({ objectId }: { objectId: string }) {
  const pt = useLang() === "pt";
  const tr = useTr();
  const t = (k: K, v: Record<string, string | number> = {}) =>
    Object.entries(v).reduce<string>((s, [a, b]) => s.replace(`{${a}}`, String(b)), T[k][pt ? 1 : 0]);
  const w = useWorld();
  const kind = useHud((s) => s.panel.kind);
  const view = useHud((s) => s.game);
  const spaceId = useHud((s) => s.spaceId);
  const close = () => hud.set({ panel: { kind: null } });
  const [picking, setPicking] = useState(false);
  const [games, setGames] = useState<Cartridge[] | null>(null);
  const reload = () => void library(spaceId).then(setGames);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
  // biome-ignore lint/correctness/useExhaustiveDependencies: once per space
  useEffect(() => {
    if (kind === "games" || picking) reload();
  }, [kind, picking, spaceId]);

  const v = view?.id === objectId ? view : null;
  const showing = kind === "tv" ? (v?.input ?? "") : objectId;

  return (
    <section
      role="dialog"
      aria-label={
        kind === "games" ? t("shelf") : kind === "tv" ? t("watch") : SYSTEMS[(v?.system || "nes") as GameSystem].label
      }
      className="pointer-events-auto absolute left-1/2 -translate-x-1/2 top-16 bottom-3 w-[min(760px,calc(100%-24px))] flex flex-col gap-2 overflow-y-auto scroll-thin"
    >
      {kind === "games" ? (
        <Shelf t={t} games={games} spaceId={spaceId} onChange={reload} onClose={close} closeLabel={tr("close")} />
      ) : (
        <>
          <Screen consoleId={showing} on={!!v?.on} running={!!v?.host} t={t} />
          <div className="cabinet rise px-3 py-2.5 flex flex-col gap-2">
            {kind === "tv" ? (
              <TvControls t={t} v={v} onClose={close} closeLabel={tr("close")} />
            ) : (
              <ConsoleControls
                t={t}
                v={v}
                picking={picking}
                setPicking={setPicking}
                games={games}
                onClose={close}
                closeLabel={tr("close")}
              />
            )}
          </div>
        </>
      )}
      {/* the picker floats over everything else */}
      {picking && v && kind === "console" ? (
        <Picker
          t={t}
          system={v.system as GameSystem}
          games={games}
          spaceId={spaceId}
          onPick={(id) => {
            w?.send("game:cart", { id: objectId, game: id });
            setPicking(false);
          }}
          onUploaded={reload}
          onClose={() => setPicking(false)}
        />
      ) : null}
    </section>
  );
}

type TFn = (k: K, v?: Record<string, string | number>) => string;

// The picture, big, in a CRT's bezel: my own game, the TV's video, or no signal.
function Screen({ consoleId, on, running, t }: { consoleId: string; on: boolean; running: boolean; t: TFn }) {
  const w = useWorld();
  const box = useRef<HTMLDivElement>(null);
  const [el, setEl] = useState<HTMLVideoElement | null>(null);
  // the picture appears once it's there (the emulator boots, the video arrives)
  useEffect(() => {
    let cur: HTMLVideoElement | null = null;
    const tick = () => {
      const next = on && consoleId ? (w?.games?.screen(consoleId) ?? null) : null;
      if (next !== cur) {
        if (cur) w?.games?.release(cur);
        cur = next;
        if (next && box.current) {
          next.className = "absolute inset-0 w-full h-full object-contain";
          next.style.imageRendering = "pixelated";
          box.current.append(next);
          void next.play().catch(() => {});
        }
        setEl(next);
      }
    };
    tick();
    const id = setInterval(tick, 300);
    return () => {
      clearInterval(id);
      if (cur) w?.games?.release(cur);
    };
  }, [consoleId, on, w]);
  return (
    <div
      className="rise relative mx-auto w-full shrink-0"
      style={{
        // the picture's as big as fits above the controls
        maxWidth: "min(720px, calc((100dvh - 330px) * 4 / 3))",
        padding: 14,
        borderRadius: 26,
        background: "linear-gradient(#3a2a1f,#24180f)",
        boxShadow: "0 18px 40px #0008, inset 0 2px 0 #ffffff14",
        border: "1px solid #15100c",
      }}
    >
      <div
        ref={box}
        className="relative w-full overflow-hidden"
        style={{ aspectRatio: "4 / 3", borderRadius: 18, background: "#0d120e", boxShadow: "inset 0 0 40px #000" }}
      >
        {!el ? (
          <div
            className="absolute inset-0 flex items-center justify-center"
            style={{ background: on ? "#1d3f8a" : "#0d120e" }}
          >
            {on ? (
              <span className="lcd text-2xl" style={{ color: "#f2e8d2" }}>
                {running ? t("starting") : t("noSignal")}
              </span>
            ) : null}
          </div>
        ) : null}
        {/* scanlines + a bulge of light over the glass */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "repeating-linear-gradient(transparent 0 2px, #00000038 2px 3px), radial-gradient(ellipse at 30% 20%, #ffffff12, transparent 45%), radial-gradient(ellipse at center, transparent 60%, #0000008a)",
          }}
        />
      </div>
    </div>
  );
}

function ConsoleControls({
  t,
  v,
  picking,
  setPicking,
  onClose,
  closeLabel,
}: {
  t: TFn;
  v: import("@/world/store").GameView | null;
  picking: boolean;
  setPicking: (b: boolean) => void;
  games: Cartridge[] | null;
  onClose: () => void;
  closeLabel: string;
}) {
  const w = useWorld();
  const [savedAt, setSavedAt] = useState(0);
  const spaceId = useHud((s) => s.spaceId);
  // a save state for the cartridge in it: offer to carry on from there
  const [resumable, setResumable] = useState<string | null>(null);
  const cartId = v?.cart?.id ?? "";
  const isOn = !!v?.on;
  useEffect(() => {
    setResumable(null);
    if (!cartId || isOn) return;
    let live = true;
    void saveInfo(spaceId, cartId).then((s) => {
      if (live && s.state) setResumable(s.updatedAt);
    });
    return () => {
      live = false;
    };
  }, [cartId, isOn, spaceId]);
  if (!v) return null;
  const id = v.id;
  const system = v.system as GameSystem;
  return (
    <>
      <header className="flex items-center gap-2 flex-wrap">
        <div className="vfd-window px-3 py-1">
          <h2 className="lcd text-lg">{SYSTEMS[system].label.toUpperCase()}</h2>
        </div>
        {v.on ? (
          <span className="mono text-xs" style={{ color: v.live ? "#d4e4a6" : "var(--cream-dim)" }}>
            {v.host
              ? v.hostMe
                ? v.live
                  ? `● ${t("streaming")}`
                  : t("local")
                : t("runs", { name: v.host })
              : t("paused", { name: "—" })}
          </span>
        ) : null}
        <button type="button" className="ghost-btn ml-auto" onClick={onClose} aria-label={closeLabel}>
          ✕ <span className="hidden sm:inline">Esc</span>
        </button>
      </header>

      <div className="grid sm:grid-cols-3 gap-2">
        {/* the cable */}
        <div className="rounded-md px-2.5 py-2" style={{ background: "#1a1410", border: "1px solid #3a2c1f" }}>
          <p className="text-xs font-semibold" style={{ color: v.tv ? "var(--cream)" : "var(--muted)" }}>
            {v.tv ? `🔌 ${t("plugged")}` : t("unplugged")}
          </p>
          {v.tv ? (
            <button
              type="button"
              className="ghost-btn text-xs mt-1.5"
              disabled={v.on}
              onClick={() => w?.send("game:plug", { id, tv: null })}
            >
              {t("unplug")}
            </button>
          ) : v.tvs.length ? (
            <div className="flex flex-col gap-1 mt-1.5">
              {v.tvs.map((entry, i) => {
                const [tv, d] = entry.split("|");
                return (
                  <button
                    key={tv}
                    type="button"
                    className={i === 0 ? "deck-btn" : "ghost-btn text-xs"}
                    style={i === 0 ? { height: 28, fontSize: 11 } : undefined}
                    onClick={() => w?.send("game:plug", { id, tv })}
                  >
                    {i === 0 ? t("plug") : t("plugN", { d })}
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="text-[11px] mt-1" style={{ color: "var(--muted)" }}>
              {t("noTv")}
            </p>
          )}
        </div>
        {/* the cartridge */}
        <div className="rounded-md px-2.5 py-2" style={{ background: "#1a1410", border: "1px solid #3a2c1f" }}>
          <p className="text-[11px]" style={{ color: "var(--muted)" }}>
            {t("cart")}
          </p>
          <p
            className="text-sm font-semibold flex items-center gap-1.5 truncate"
            style={{ color: v.cart ? "var(--cream)" : "var(--muted)" }}
          >
            {v.cart ? (
              <span
                className="inline-block rounded-sm shrink-0"
                style={{ width: 12, height: 14, background: v.cart.color, border: "1px solid #000" }}
              />
            ) : null}
            <span className="truncate">{v.cart ? v.cart.title : t("noCart")}</span>
          </p>
          <div className="flex gap-1 mt-1.5">
            <button
              type="button"
              className="deck-btn flex-1"
              style={{ height: 28, fontSize: 11 }}
              disabled={v.on}
              aria-pressed={picking}
              onClick={() => setPicking(!picking)}
            >
              {v.cart ? t("change") : t("insert")}
            </button>
            {v.cart ? (
              <button
                type="button"
                className="ghost-btn text-xs"
                disabled={v.on}
                onClick={() => w?.send("game:cart", { id, game: null })}
              >
                {t("eject")}
              </button>
            ) : null}
          </div>
        </div>
        {/* power */}
        <div
          className="rounded-md px-2.5 py-2 flex flex-col gap-1.5"
          style={{ background: "#1a1410", border: "1px solid #3a2c1f" }}
        >
          <button
            type="button"
            className={`deck-btn ${v.on ? "danger" : ""}`}
            style={{ height: 34, fontSize: 12 }}
            aria-pressed={v.on}
            disabled={!v.on && (!v.tv || !v.cart)}
            // (turning it off saves it: the host's emulator saves as it stops)
            onClick={() => w?.send("game:power", { id, on: !v.on })}
          >
            ⏻ {v.on ? t("off") : t("on")}
          </button>
          {!v.on && resumable !== null && v.tv && v.cart ? (
            <button
              type="button"
              className="deck-btn"
              style={{ height: 28, fontSize: 11 }}
              onClick={() => w?.send("game:power", { id, on: true, resume: true })}
            >
              ↺ {t("resume")}
              {resumable ? ` · ${new Date(resumable).toLocaleDateString()}` : ""}
            </button>
          ) : null}
          {v.on && !v.host ? (
            <button
              type="button"
              className="deck-btn"
              style={{ height: 28, fontSize: 11 }}
              onClick={() => w?.send("game:continue", { id })}
            >
              {t("carryOn")}
            </button>
          ) : null}
          {v.on && v.hostMe ? (
            <button
              type="button"
              className="ghost-btn text-xs"
              onClick={() =>
                void w?.games?.saveNow().then((ok) => {
                  if (ok) {
                    setSavedAt(Date.now());
                    toast(t("saved"));
                  }
                })
              }
            >
              💾 {t("save")}
              {savedAt ? " ✓" : ""}
            </button>
          ) : null}
        </div>
      </div>

      {/* the pads */}
      {v.on ? (
        <div className="flex gap-2 flex-wrap items-center">
          {v.ports.map((p, i) => (
            <div
              // biome-ignore lint/suspicious/noArrayIndexKey: pads are fixed ports
              key={i}
              className="rounded-md px-2.5 py-1.5 flex items-center gap-2"
              style={{ background: "#1a1410", border: `1px solid ${p.me ? "#f0a12c" : "#3a2c1f"}` }}
            >
              <span className="lcd text-sm">P{i + 1}</span>
              {p.name ? (
                <span className="text-xs font-semibold" style={{ color: "var(--cream)" }}>
                  {p.me ? `${p.name} (${t("you")})` : p.name}
                </span>
              ) : (
                <button
                  type="button"
                  className="deck-btn"
                  style={{ height: 26, fontSize: 11 }}
                  disabled={v.myPort > 0 || !v.near}
                  onClick={() => w?.send("game:port", { id, port: i + 1 })}
                >
                  {t("take", { n: i + 1 })}
                </button>
              )}
              {p.me && !v.hostMe ? (
                <button
                  type="button"
                  className="ghost-btn text-xs"
                  onClick={() => w?.send("game:port", { id, port: 0 })}
                >
                  {t("putDown")}
                </button>
              ) : null}
            </div>
          ))}
          {v.myPort ? <Keys system={system} t={t} /> : null}
        </div>
      ) : null}
      {v.on && v.myPort ? <TouchPad system={system} /> : null}
    </>
  );
}

// On a touch screen: a pad under the picture (the d-pad, the console's
// buttons, Start / Select), held while pressed.
const FACE: Record<GameSystem, [PadButton, string, string][]> = {
  "2600": [["b", "FIRE", "#c4402b"]],
  nes: [
    ["b", "B", "#c4402b"],
    ["a", "A", "#c4402b"],
  ],
  snes: [
    ["y", "Y", "#7fa34a"],
    ["x", "X", "#4f86c6"],
    ["b", "B", "#f0a12c"],
    ["a", "A", "#c4402b"],
  ],
  md: [
    ["y", "A", "#3a3836"],
    ["b", "B", "#3a3836"],
    ["a", "C", "#3a3836"],
  ],
  gb: [
    ["b", "B", "#7a1f3a"],
    ["a", "A", "#7a1f3a"],
  ],
};
function TouchPad({ system }: { system: GameSystem }) {
  const w = useWorld();
  const [coarse, setCoarse] = useState(false);
  const held = useRef(0);
  useEffect(() => {
    setCoarse(window.matchMedia("(pointer: coarse)").matches);
    return () => w?.games?.touch(0);
  }, [w]);
  if (!coarse) return null;
  const btn = (b: PadButton, label: string, color: string, size = 52) => {
    const set = (down: boolean) => {
      held.current = down ? held.current | bit(b) : held.current & ~bit(b);
      w?.games?.touch(held.current);
    };
    return (
      <button
        key={b + label}
        type="button"
        aria-label={label}
        className="rounded-full select-none touch-none lcd text-sm"
        style={{
          width: size,
          height: size,
          background: color,
          color: "#f2e8d2",
          border: "2px solid #15100c",
          boxShadow: "0 3px 0 #15100c",
        }}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          set(true);
        }}
        onPointerUp={() => set(false)}
        onPointerCancel={() => set(false)}
      >
        {label}
      </button>
    );
  };
  return (
    <div className="flex items-center justify-between gap-3 px-1 py-1">
      <div className="grid grid-cols-3 gap-1" style={{ width: 150 }}>
        <span />
        {btn("up", "▲", "#2b2a28", 46)}
        <span />
        {btn("left", "◀", "#2b2a28", 46)}
        <span />
        {btn("right", "▶", "#2b2a28", 46)}
        <span />
        {btn("down", "▼", "#2b2a28", 46)}
        <span />
      </div>
      <div className="flex flex-col gap-1.5 items-center">
        {SYSTEMS[system].buttons.includes("select" as never) ? btn("select", "SEL", "#55534d", 40) : null}
        {btn("start", "START", "#55534d", 40)}
      </div>
      <div className="flex gap-2 flex-wrap justify-end" style={{ maxWidth: 130 }}>
        {FACE[system].map(([b, label, color]) => btn(b, label, color))}
      </div>
    </div>
  );
}

function Keys({ system, t }: { system: GameSystem; t: TFn }) {
  return (
    <p className="mono text-[11px] flex flex-wrap gap-x-3 gap-y-0.5 ml-auto" style={{ color: "var(--cream-dim)" }}>
      <span style={{ color: "var(--muted)" }}>{t("keys")}:</span>
      {KEY_HINTS[system].map(([k, b]) => (
        <span key={k}>
          <b style={{ color: "var(--cream)" }}>{k}</b> {b}
        </span>
      ))}
      <span style={{ color: "var(--muted)" }}>· {t("gamepad")}</span>
    </p>
  );
}

function TvControls({
  t,
  v,
  onClose,
  closeLabel,
}: {
  t: TFn;
  v: import("@/world/store").GameView | null;
  onClose: () => void;
  closeLabel: string;
}) {
  const w = useWorld();
  if (!v) return null;
  return (
    <header className="flex items-center gap-2 flex-wrap">
      <div className="vfd-window px-3 py-1">
        <h2 className="lcd text-lg">TV</h2>
      </div>
      <span className="text-xs" style={{ color: "var(--muted)" }}>
        {t("inputs")}:
      </span>
      {(v.inputs ?? []).map((i) => (
        <button
          key={i.id}
          type="button"
          className="deck-btn"
          style={{ height: 28, fontSize: 11 }}
          aria-pressed={v.input === i.id}
          disabled={!v.near}
          onClick={() => w?.send("game:input", { tv: v.id, console: i.id })}
        >
          {i.label}
          {i.title ? ` · ${i.title}` : ""}
          {i.on ? " ●" : ""}
        </button>
      ))}
      {!v.on ? (
        <span className="text-xs" style={{ color: "var(--muted)" }}>
          {t("tvOff")}
        </span>
      ) : (
        <span className="mono text-xs" style={{ color: "var(--cream-dim)" }}>
          {v.host ? t("runs", { name: v.host }) : t("noSignal")}
        </span>
      )}
      <button type="button" className="ghost-btn ml-auto" onClick={onClose} aria-label={closeLabel}>
        ✕ <span className="hidden sm:inline">Esc</span>
      </button>
    </header>
  );
}

// Pick a cartridge for this console: the ones that ship with Yutopia, the team's.
function Picker({
  t,
  system,
  games,
  spaceId,
  onPick,
  onUploaded,
  onClose,
}: {
  t: TFn;
  system: GameSystem;
  games: Cartridge[] | null;
  spaceId: number;
  onPick: (id: string) => void;
  onUploaded: () => void;
  onClose: () => void;
}) {
  const fits = (games ?? []).filter((g) => g.system === system);
  return (
    <div className="cabinet rise px-3 py-2.5 flex flex-col gap-2">
      <header className="flex items-center gap-2">
        <h3 className="lcd text-base">{t("pick").toUpperCase()}</h3>
        <button type="button" className="ghost-btn ml-auto text-xs" onClick={onClose}>
          ✕
        </button>
      </header>
      <CartList t={t} games={fits} onPick={onPick} />
      <Upload t={t} spaceId={spaceId} fixed={system} onDone={onUploaded} />
    </div>
  );
}

function CartList({
  t,
  games,
  onPick,
  onRemove,
}: {
  t: TFn;
  games: Cartridge[];
  onPick?: (id: string) => void;
  onRemove?: (g: Cartridge) => void;
}) {
  const groups: [string, Cartridge[]][] = [
    [t("builtIn"), games.filter((g) => g.builtIn)],
    [t("ours"), games.filter((g) => !g.builtIn)],
  ];
  return (
    <div className="flex flex-col gap-2">
      {groups.map(([label, list]) =>
        list.length ? (
          <div key={label}>
            <p className="text-[11px] uppercase tracking-wide mb-1" style={{ color: "var(--muted)" }}>
              {label}
            </p>
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
              {list.map((g) => (
                <li
                  key={g.id}
                  className="rounded-md px-2 py-1.5 flex items-center gap-2"
                  style={{ background: "#1a1410", border: "1px solid #3a2c1f" }}
                >
                  <span
                    className="inline-block rounded-sm shrink-0"
                    style={{ width: 14, height: 18, background: g.color, border: "1px solid #000" }}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold truncate" style={{ color: "var(--cream)" }}>
                      {g.title} <span style={{ color: "var(--muted)" }}>· {SHORT[g.system]}</span>
                    </p>
                    <p className="text-[10px] truncate" style={{ color: "var(--muted)" }}>
                      {g.players > 1 ? `${t("pPlayers", { n: g.players })} · ` : ""}
                      {g.author ? t("credits", { author: g.author, license: g.license ?? "" }) : ""}
                      {"source" in g && g.source?.startsWith("http") ? (
                        <>
                          {" · "}
                          <a href={g.source} target="_blank" rel="noopener noreferrer" className="underline">
                            source
                          </a>
                        </>
                      ) : null}
                    </p>
                  </div>
                  {onPick ? (
                    <button
                      type="button"
                      className="deck-btn"
                      style={{ height: 26, fontSize: 11 }}
                      onClick={() => onPick(g.id)}
                    >
                      ▶
                    </button>
                  ) : null}
                  {onRemove && g.mine ? (
                    <button type="button" className="ghost-btn text-xs" onClick={() => onRemove(g)}>
                      {t("remove")}
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null,
      )}
    </div>
  );
}

// Bring your own cartridge: a file you own, for one console, a title and a label colour.
function Upload({ t, spaceId, fixed, onDone }: { t: TFn; spaceId: number; fixed?: GameSystem; onDone: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [system, setSystem] = useState<GameSystem>(fixed ?? "nes");
  const [title, setTitle] = useState("");
  const [color, setColor] = useState(LABELS[0]);
  const [players, setPlayers] = useState(1);
  const [busy, setBusy] = useState(false);
  const ok = !!file && romFits(system, file.name, file.size) && title.trim().length > 0;
  const guessed = useMemo(() => file?.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ") ?? "", [file]);
  return (
    <details className="rounded-md px-2.5 py-2" style={{ background: "#120d0a", border: "1px dashed #3a2c1f" }}>
      <summary className="text-xs font-semibold cursor-pointer" style={{ color: "var(--cream)" }}>
        + {t("bring")}
      </summary>
      <p className="text-[11px] mt-1.5" style={{ color: "var(--muted)" }}>
        {t("bringHint")}
      </p>
      <form
        className="grid sm:grid-cols-2 gap-2 mt-2 text-xs"
        onSubmit={(e) => {
          e.preventDefault();
          if (!file || !ok) return;
          setBusy(true);
          void upload(spaceId, { file, system, title: title.trim(), color, players })
            .then(() => {
              toast(t("added"));
              setFile(null);
              setTitle("");
              onDone();
            })
            .catch((err: Error) => toast(err.message, "warn"))
            .finally(() => setBusy(false));
        }}
      >
        <label className="flex flex-col gap-1">
          <span style={{ color: "var(--muted)" }}>{t("file")}</span>
          <input
            type="file"
            accept={Object.values(SYSTEMS)
              .flatMap((s) => s.ext.map((x) => `.${x}`))
              .join(",")}
            onChange={(e) => {
              const f = e.target.files?.[0] ?? null;
              setFile(f);
              if (f && !title)
                setTitle(
                  f.name
                    .replace(/\.[^.]+$/, "")
                    .replace(/[_-]+/g, " ")
                    .slice(0, 60),
                );
            }}
          />
        </label>
        {!fixed ? (
          <label className="flex flex-col gap-1">
            <span style={{ color: "var(--muted)" }}>{t("console")}</span>
            <select
              value={system}
              onChange={(e) => setSystem(e.target.value as GameSystem)}
              className="text-black rounded px-1 py-0.5"
            >
              {Object.entries(SYSTEMS).map(([k, s]) => (
                <option key={k} value={k}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <label className="flex flex-col gap-1">
          <span style={{ color: "var(--muted)" }}>{t("title")}</span>
          <input
            value={title}
            maxLength={60}
            placeholder={guessed}
            onChange={(e) => setTitle(e.target.value)}
            className="text-black rounded px-1.5 py-0.5"
          />
        </label>
        <div className="flex flex-col gap-1">
          <span style={{ color: "var(--muted)" }}>{t("color")}</span>
          <div className="flex gap-1">
            {LABELS.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={c}
                aria-pressed={color === c}
                onClick={() => setColor(c)}
                className="rounded-sm"
                style={{
                  width: 18,
                  height: 18,
                  background: c,
                  border: color === c ? "2px solid #fff" : "1px solid #000",
                }}
              />
            ))}
          </div>
        </div>
        <label className="flex flex-col gap-1">
          <span style={{ color: "var(--muted)" }}>{t("players")}</span>
          <select
            value={players}
            onChange={(e) => setPlayers(Number(e.target.value))}
            className="text-black rounded px-1 py-0.5"
          >
            {Array.from({ length: SYSTEMS[system].ports }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <div className="sm:col-span-2 flex items-center gap-2">
          <button type="submit" className="deck-btn" style={{ height: 30, fontSize: 11 }} disabled={!ok || busy}>
            {t("add")}
          </button>
          {file && !romFits(system, file.name, file.size) ? (
            <span className="text-[11px]" style={{ color: "#e79a7c" }}>
              {t("wrongFile")}
            </span>
          ) : null}
        </div>
      </form>
    </details>
  );
}

// The shelf: everything in the library, by console; bring one, take yours away.
function Shelf({
  t,
  games,
  spaceId,
  onChange,
  onClose,
  closeLabel,
}: {
  t: TFn;
  games: Cartridge[] | null;
  spaceId: number;
  onChange: () => void;
  onClose: () => void;
  closeLabel: string;
}) {
  return (
    <div className="cabinet rise px-3 py-2.5 flex flex-col gap-2 my-auto">
      <header className="flex items-center gap-2">
        <div className="vfd-window px-3 py-1">
          <h2 className="lcd text-lg">{t("shelf").toUpperCase()}</h2>
        </div>
        <button type="button" className="ghost-btn ml-auto" onClick={onClose} aria-label={closeLabel}>
          ✕ <span className="hidden sm:inline">Esc</span>
        </button>
      </header>
      <CartList
        t={t}
        games={games ?? []}
        onRemove={(g) =>
          void removeGame(spaceId, g.id)
            .then(onChange)
            .catch(() => toast("—", "warn"))
        }
      />
      <Upload t={t} spaceId={spaceId} onDone={onChange} />
    </div>
  );
}
