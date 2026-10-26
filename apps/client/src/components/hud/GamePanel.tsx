"use client";

import {
  DISC_SYSTEMS,
  discFits,
  type GameSystem,
  hasSticks,
  isDiscSystem,
  type PadButton,
  romFits,
  SYSTEMS,
} from "@yutopia/shared/games";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useLang, useTr } from "@/lib/i18n";
import {
  type BiosInfo,
  bringBios,
  bringGame,
  type Cartridge,
  library,
  listBios,
  removeBios,
  removeGame,
  saveInfo,
  upload,
} from "@/world/games/api";
import { bit, keyHints, onPadPrefs, padPrefs } from "@/world/games/input";
import { hud, toast, useHud } from "@/world/store";
import { ControllersPanel } from "./ControllersPanel";
import { useWorld } from "./ctx";
import { MediaRemote, TvVolume } from "./MediaPanel";

// The game room's panel (docs/plan/09-game-room.md), for a console, a TV or the
// cartridge shelf. Not a modal: the camera leans in over the TV and this sits
// in front of it — the picture big in a CRT frame, the console's controls under
// it. Words live here (EN / PT-BR), not in i18n.ts: the world page's budget.
const T = {
  plugged: ["Plugged into the TV", "Ligado na TV"],
  unplugged: ["Not plugged into a TV", "Não está ligado numa TV"],
  plug: ["Take the cable", "Pegar o cabo"],
  plugHow: ["Then walk to a TV and press X there.", "Depois vá até uma TV e aperte X lá."],
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
  // the disc console (docs/plan/23-disc-console.md)
  rack: ["Disc rack", "Rack de discos"],
  bringDisc: ["Bring your disc", "Traga seu disco"],
  discHint: [
    "Only discs you own. A .chd (one file, smaller) is best; a .cue with its .bin tracks works too — pick them all together. Big discs take a while: you can pause and carry on later (pick the same files again).",
    "Só discos que você tem. Um .chd (um arquivo, menor) é o melhor; um .cue com as faixas .bin também serve — escolha todos juntos. Discos grandes demoram: dá pra pausar e continuar depois (escolha os mesmos arquivos de novo).",
  ],
  discFiles: ["The disc's files", "Os arquivos do disco"],
  addDisc: ["Put it in the rack", "Colocar no rack"],
  addedDisc: ["In the rack.", "No rack."],
  pause: ["Pause", "Pausar"],
  carryOnUp: ["Carry on", "Continuar"],
  upPaused: ["Paused — pick the same files to carry on.", "Pausado — escolha os mesmos arquivos pra continuar."],
  sending: ["Sending… {done} of {total}", "Enviando… {done} de {total}"],
  finishing: ["Putting it together…", "Montando…"],
  bios: ["BIOS", "BIOS"],
  needsBios: [
    "This console needs its BIOS: bring a dump of a console you own (512 KB, e.g. SCPH-5501). Everyone in the space can play then.",
    "Este console precisa da BIOS: traga um dump de um console que você tem (512 KB, ex. SCPH-5501). Aí todo mundo no espaço pode jogar.",
  ],
  bringBios: ["Bring the BIOS", "Trazer a BIOS"],
  bringMoreBios: ["Bring another BIOS", "Trazer outra BIOS"],
  biosLogo: ["BIOS · start-up logo", "BIOS · logo de abertura"],
  biosRegions: [
    "The PlayStation logo plays before every USA and Japan disc with any of these BIOS (USA: SCPH-1001, 5501, 7001, 101; Japan: 5500). A European disc needs the European one (5502) for it; without it, the game starts straight away.",
    "O logo do PlayStation aparece antes de todo disco dos EUA e do Japão com qualquer uma dessas BIOS (EUA: SCPH-1001, 5501, 7001, 101; Japão: 5500). Um disco europeu precisa da europeia (5502); sem ela, o jogo começa direto.",
  ],
  biosAdded: ["{model} BIOS: in.", "BIOS {model}: pronta."],
  biosWho: ["brought by you", "trazida por você"],
  disc: ["Disc", "Disco"],
  noDisc: ["No disc in", "Sem disco"],
  changeDisc: ["Change disc", "Trocar disco"],
  insertDisc: ["Insert a disc", "Colocar um disco"],
  pickDisc: ["Pick a disc", "Escolha um disco"],
  reading: ["Reading the disc… {done} of {total}", "Lendo o disco… {done} de {total}"],
  analog: ["Analog", "Analógico"],
  controllers: ["Controllers", "Controles"],
} as const;
type K = keyof typeof T;
const LABELS = ["#c4402b", "#f0a12c", "#7fa34a", "#4f86c6", "#7a5c8a", "#efe4cc", "#3d4a5c", "#b5562f"];
const SHORT: Record<GameSystem, string> = {
  "2600": "2600",
  nes: "8-bit",
  snes: "16-bit",
  md: "16-bit (black)",
  gb: "Handheld",
  ps1: "32-bit disc",
};
const mb = (n: number) => `${(n / 1024 / 1024).toFixed(n < 100 * 1024 * 1024 ? 1 : 0)} MB`;

export function GamePanel({ objectId }: { objectId: string }) {
  const pt = useLang() === "pt";
  const tr = useTr();
  const t = (k: K, v: Record<string, string | number> = {}) =>
    Object.entries(v).reduce<string>((s, [a, b]) => s.replace(`{${a}}`, String(b)), T[k][pt ? 1 : 0]);
  const w = useWorld();
  const kind = useHud((s) => s.panel.kind);
  const view = useHud((s) => s.game);
  const close = () => hud.set({ panel: { kind: null } });
  const [picking, setPicking] = useState(false);
  const [padsOpen, setPadsOpen] = useState(false); // Controllers, over the console
  const [games, setGames] = useState<Cartridge[] | null>(null);
  const reload = () => void library().then(setGames);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !padsOpen) close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
  // biome-ignore lint/correctness/useExhaustiveDependencies: once per space
  useEffect(() => {
    if (kind === "games" || picking) reload();
  }, [kind, picking]);

  const v = view?.id === objectId ? view : null;
  if (padsOpen)
    return (
      <ControllersPanel start={(v?.system || undefined) as GameSystem | undefined} onClose={() => setPadsOpen(false)} />
    );
  // the games panel: the disc rack (discs, the BIOS) or the cartridge shelf
  const rack = kind === "games" && w?.engine?.getObject(objectId)?.kind === "disc_rack";
  const showing = kind === "tv" ? (v?.input ?? "") : objectId;

  return (
    <section
      role="dialog"
      aria-label={
        kind === "games"
          ? t(rack ? "rack" : "shelf")
          : kind === "tv"
            ? t("watch")
            : SYSTEMS[(v?.system || "nes") as GameSystem].label
      }
      className="pointer-events-auto absolute left-1/2 -translate-x-1/2 top-16 bottom-3 w-[min(760px,calc(100%-24px))] flex flex-col gap-2 overflow-y-auto scroll-thin"
    >
      {kind === "games" ? (
        <Shelf t={t} games={games} discs={rack} onChange={reload} onClose={close} closeLabel={tr("close")} />
      ) : (
        <>
          {kind === "tv" && v?.input === "media" ? (
            // the TV input: YouTube / Jellyfin (docs/plan/10-media.md)
            <div className="cabinet rise p-3">
              <MediaRemote id={objectId} />
            </div>
          ) : (
            <Screen consoleId={showing} on={!!v?.on} running={!!v?.host} loading={v?.loading ?? null} t={t} />
          )}
          {/* the TV's volume: on its own panel, and on the console's (its TV) */}
          {kind === "tv" && v?.input !== "media" && (
            <div className="cabinet rise px-3 py-2">
              <TvVolume id={objectId} />
            </div>
          )}
          {kind === "console" && v?.tv && (
            <div className="cabinet rise px-3 py-2">
              <TvVolume id={v.tv} />
            </div>
          )}
          {kind === "console" && v?.on && v.myPort ? (
            <TouchPad system={v.system as GameSystem} analog={!!v.ports[v.myPort - 1]?.analog} />
          ) : null}
          <div className="cabinet rise px-3 py-2.5 flex flex-col gap-2">
            {kind === "tv" ? (
              <TvControls t={t} v={v} onClose={close} closeLabel={tr("close")} />
            ) : (
              <ConsoleControls
                t={t}
                v={v}
                onPads={() => setPadsOpen(true)}
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
function Screen({
  consoleId,
  on,
  running,
  loading,
  t,
}: {
  consoleId: string;
  on: boolean;
  running: boolean;
  loading: [number, number] | null; // my disc coming down
  t: TFn;
}) {
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
              <span className="lcd text-2xl text-center px-4" style={{ color: "#f2e8d2" }} data-testid="screen-status">
                {loading
                  ? t("reading", { done: mb(loading[0]), total: mb(loading[1]) })
                  : running
                    ? t("starting")
                    : t("noSignal")}
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
  onPads,
  picking,
  setPicking,
  onClose,
  closeLabel,
}: {
  t: TFn;
  v: import("@/world/store").GameView | null;
  onPads: () => void;
  picking: boolean;
  setPicking: (b: boolean) => void;
  games: Cartridge[] | null;
  onClose: () => void;
  closeLabel: string;
}) {
  const w = useWorld();
  const [savedAt, setSavedAt] = useState(0);
  // a save state for the cartridge in it: offer to carry on from there
  const [resumable, setResumable] = useState<string | null>(null);
  const cartId = v?.cart?.id ?? "";
  const isOn = !!v?.on;
  useEffect(() => {
    setResumable(null);
    if (!cartId || isOn) return;
    let live = true;
    void saveInfo(cartId).then((s) => {
      if (live && s.state) setResumable(s.updatedAt);
    });
    return () => {
      live = false;
    };
  }, [cartId, isOn]);
  // the disc console: the space's BIOS first
  const disc = isDiscSystem(v?.system ?? "");
  const [bios, setBios] = useState<number | null>(null); // how many the space has (null: asking)
  useEffect(() => {
    if (!disc) return;
    let live = true;
    const ask = () =>
      void listBios()
        .then((b) => live && setBios(b.length))
        .catch(() => live && setBios(0));
    ask();
    const again = setInterval(ask, 4000); // (someone may bring one meanwhile)
    return () => {
      live = false;
      clearInterval(again);
    };
  }, [disc]);
  if (!v) return null;
  const id = v.id;
  const system = v.system as GameSystem;
  const noBios = disc && bios === 0;
  return (
    <>
      <header className="flex items-center gap-2 flex-wrap">
        <div className="vfd-window px-3 py-1">
          <h2 className="lcd text-lg">{SYSTEMS[system].label.toUpperCase()}</h2>
        </div>
        {v.on ? (
          <span className="mono text-xs" style={{ color: v.live ? "var(--lcd-good)" : "var(--cream-dim)" }}>
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
        <div
          className="rounded-md px-2.5 py-2"
          style={{ background: "var(--well)", border: "1px solid var(--well-edge)" }}
        >
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
            // the cable into my hands: I take it to the TV I want and plug it in there
            <div className="flex flex-col gap-1 mt-1.5">
              <button
                type="button"
                className="deck-btn"
                style={{ height: 28, fontSize: 11 }}
                onClick={() => w?.grabCable(id)}
              >
                🔌 {t("plug")}
              </button>
              <p className="text-[11px]" style={{ color: "var(--muted)" }}>
                {t("plugHow")}
              </p>
            </div>
          ) : (
            <p className="text-[11px] mt-1" style={{ color: "var(--muted)" }}>
              {t("noTv")}
            </p>
          )}
        </div>
        {/* the cartridge */}
        <div
          className="rounded-md px-2.5 py-2"
          style={{ background: "var(--well)", border: "1px solid var(--well-edge)" }}
        >
          <p className="text-[11px]" style={{ color: "var(--muted)" }}>
            {t(disc ? "disc" : "cart")}
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
            <span className="truncate">{v.cart ? v.cart.title : t(disc ? "noDisc" : "noCart")}</span>
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
              {v.cart ? t(disc ? "changeDisc" : "change") : t(disc ? "insertDisc" : "insert")}
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
          style={{ background: "var(--well)", border: "1px solid var(--well-edge)" }}
        >
          <button
            type="button"
            className={`deck-btn ${v.on ? "danger" : ""}`}
            style={{ height: 34, fontSize: 12 }}
            aria-pressed={v.on}
            disabled={!v.on && (!v.tv || !v.cart || noBios || (disc && bios === null))}
            // (turning it off saves it: the host's emulator saves as it stops)
            onClick={() => w?.send("game:power", { id, on: !v.on })}
          >
            ⏻ {v.on ? t("off") : t("on")}
          </button>
          {!v.on && resumable !== null && v.tv && v.cart && !noBios ? (
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

      {/* the disc console without a BIOS: what to do */}
      {noBios && !v.on ? <Bios t={t} /> : null}
      {disc && !!bios && !v.on ? (
        <details data-testid="console-bios">
          <summary className="text-xs cursor-pointer" style={{ color: "var(--muted)" }}>
            {t("biosLogo")} ({bios})
          </summary>
          <div className="mt-1.5">
            <Bios t={t} />
          </div>
        </details>
      ) : null}

      {/* the pads */}
      {v.on ? (
        <div className="flex gap-2 flex-wrap items-center">
          {v.ports.map((p, i) => (
            <div
              // biome-ignore lint/suspicious/noArrayIndexKey: pads are fixed ports
              key={i}
              className="rounded-md px-2.5 py-1.5 flex items-center gap-2"
              style={{ background: "var(--well)", border: `1px solid ${p.me ? "#f0a12c" : "var(--well-edge)"}` }}
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
              {p.me && hasSticks(system) ? (
                // the pad's analog mode: its sticks on (its red LED)
                <button
                  type="button"
                  className="deck-btn"
                  style={{ height: 26, fontSize: 11 }}
                  aria-pressed={!!p.analog}
                  onClick={() => w?.games?.analog(id)}
                >
                  <span
                    className="led"
                    style={p.analog ? { background: "#ff3a2a", boxShadow: "0 0 6px #ff3a2a" } : {}}
                  />{" "}
                  {t("analog")}
                </button>
              ) : null}
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
          <button type="button" className="ghost-btn text-xs" onClick={onPads}>
            🎮 {t("controllers")}
          </button>
        </div>
      ) : null}
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
  // □ △ ✕ ○ where they sit (left, top, bottom, right), in their colours
  ps1: [
    ["y", "□", "#d889b8"],
    ["x", "△", "#5fae8a"],
    ["b", "✕", "#6f8fd0"],
    ["a", "○", "#d0524a"],
  ],
};
function TouchPad({ system, analog }: { system: GameSystem; analog: boolean }) {
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
  // the disc console's left stick, dragged inside its ring (while analog)
  const stick = (
    <fieldset
      aria-label="stick"
      className="rounded-full touch-none select-none relative shrink-0"
      style={{
        width: 96,
        height: 96,
        background: "#2b2a28",
        border: "2px solid #15100c",
        padding: 0,
        margin: 0,
        minWidth: 0,
      }}
      onPointerDown={(e) => e.currentTarget.setPointerCapture(e.pointerId)}
      onPointerMove={(e) => {
        if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
        const r = e.currentTarget.getBoundingClientRect();
        const x = ((e.clientX - r.left) / r.width) * 2 - 1;
        const y = ((e.clientY - r.top) / r.height) * 2 - 1;
        const k = Math.min(1, 1 / Math.max(1e-6, Math.hypot(x, y)));
        w?.games?.touch(held.current, [Math.round(x * k * 127), Math.round(y * k * 127), 0, 0]);
      }}
      onPointerUp={() => w?.games?.touch(held.current, [0, 0, 0, 0])}
      onPointerCancel={() => w?.games?.touch(held.current, [0, 0, 0, 0])}
    />
  );
  return (
    <div className="cabinet flex flex-col gap-2 px-3 py-2 shrink-0">
      {system === "ps1" ? (
        // the shoulders, over the pad as on the real one
        <div className="flex justify-between">
          <div className="flex gap-1">
            {btn("l2", "L2", "#55534d", 40)}
            {btn("l", "L1", "#55534d", 40)}
          </div>
          <div className="flex gap-1">
            {btn("r", "R1", "#55534d", 40)}
            {btn("r2", "R2", "#55534d", 40)}
          </div>
        </div>
      ) : null}
      <div className="flex items-center justify-between gap-3">
        {analog ? stick : null}
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
    </div>
  );
}

function Keys({ system, t }: { system: GameSystem; t: TFn }) {
  useSyncExternalStore(onPadPrefs, padPrefs, padPrefs); // (your bindings changed: new hints)
  return (
    <p
      className="mono text-[11px] flex-wrap gap-x-3 gap-y-0.5 ml-auto hidden [@media(pointer:fine)]:flex"
      style={{ color: "var(--cream-dim)" }}
    >
      <span style={{ color: "var(--muted)" }}>{t("keys")}:</span>
      {keyHints(system).map(([k, b]) => (
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
      <button
        type="button"
        className="deck-btn"
        style={{ height: 28, fontSize: 11 }}
        aria-pressed={v.input === "media"}
        disabled={!v.near}
        onClick={() => w?.send("game:input", { tv: v.id, console: "media" })}
      >
        TV · YouTube{w?.mediaKey?.jf ? " / Jellyfin" : ""}
      </button>
      {v.input === "media" ? null : !v.on ? (
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
  onPick,
  onUploaded,
  onClose,
}: {
  t: TFn;
  system: GameSystem;
  games: Cartridge[] | null;
  onPick: (id: string) => void;
  onUploaded: () => void;
  onClose: () => void;
}) {
  const fits = (games ?? []).filter((g) => g.system === system);
  const discs = isDiscSystem(system);
  return (
    <div className="cabinet rise px-3 py-2.5 flex flex-col gap-2">
      <header className="flex items-center gap-2">
        <h3 className="lcd text-base">{t(discs ? "pickDisc" : "pick").toUpperCase()}</h3>
        <button type="button" className="ghost-btn ml-auto text-xs" onClick={onClose}>
          ✕
        </button>
      </header>
      <CartList t={t} games={fits} onPick={onPick} />
      <Upload t={t} fixed={system} discs={discs} onDone={onUploaded} />
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
                  style={{ background: "var(--well)", border: "1px solid var(--well-edge)" }}
                >
                  {isDiscSystem(g.system) ? (
                    // a jewel case: its cover's colour, the disc showing through
                    <span
                      className="relative inline-block rounded-[2px] shrink-0"
                      style={{ width: 18, height: 18, background: g.color, border: "1px solid #000" }}
                    >
                      <span
                        className="absolute rounded-full"
                        style={{
                          inset: 3,
                          background: "radial-gradient(circle, #1a1410 0 18%, #dfe2e6 20% 60%, #9aa0a8 62%)",
                        }}
                      />
                      <span className="absolute inset-y-0 left-0" style={{ width: 3, background: "rgba(0,0,0,.35)" }} />
                    </span>
                  ) : (
                    <span
                      className="inline-block rounded-sm shrink-0"
                      style={{ width: 14, height: 18, background: g.color, border: "1px solid #000" }}
                    />
                  )}
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

// Bring your own game: a cartridge (one file) or a disc (a .chd, or a .cue and
// its tracks — big: sent in pieces, with a bar, paused and carried on), for one
// console, a title and a label colour.
function Upload({
  t,
  fixed,
  discs = false,
  onDone,
}: {
  t: TFn;
  fixed?: GameSystem;
  discs?: boolean; // the rack: discs only (else the shelf: cartridges only)
  onDone: () => void;
}) {
  const choices = (Object.keys(SYSTEMS) as GameSystem[]).filter((k) => isDiscSystem(k) === discs);
  const [files, setFiles] = useState<File[]>([]);
  const [system, setSystem] = useState<GameSystem>(fixed ?? choices[0] ?? "nes");
  const [title, setTitle] = useState("");
  const [color, setColor] = useState(LABELS[0]);
  const [players, setPlayers] = useState(1);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<[number, number] | null>(null);
  const [stopped, setStopped] = useState(false);
  const stop = useRef<AbortController | null>(null);
  const [picker, setPicker] = useState(0); // (a new file input once a game's in)
  const disc = isDiscSystem(system);
  const file = files[0] ?? null;
  const why = disc
    ? discFits(system, files).why
    : file && !romFits(system, file.name, file.size)
      ? t("wrongFile")
      : null;
  const ok = files.length > 0 && !why && title.trim().length > 0;
  const guessed = useMemo(() => file?.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ") ?? "", [file]);
  const done = () => {
    toast(t(disc ? "addedDisc" : "added"));
    setFiles([]);
    setTitle("");
    setSent(null);
    setPicker((n) => n + 1);
    onDone();
  };
  const go = () => {
    if (!ok) return;
    setBusy(true);
    setStopped(false);
    if (!disc && file) {
      void upload({ file, system, title: title.trim(), color, players })
        .then(done)
        .catch((err: Error) => toast(err.message, "warn"))
        .finally(() => setBusy(false));
      return;
    }
    const ctl = new AbortController();
    stop.current = ctl;
    void bringGame({ files, system, title: title.trim(), color, players }, (a, b) => setSent([a, b]), ctl.signal)
      .then(done)
      .catch((err: Error) => {
        if (ctl.signal.aborted) setStopped(true);
        else {
          toast(err.message, "warn");
          setSent(null);
        }
      })
      .finally(() => setBusy(false));
  };
  return (
    <details
      className="rounded-md px-2.5 py-2"
      style={{ background: "var(--pit-2)", border: "1px dashed var(--well-edge)" }}
    >
      <summary className="text-xs font-semibold cursor-pointer" style={{ color: "var(--cream)" }}>
        + {t(discs ? "bringDisc" : "bring")}
      </summary>
      <p className="text-[11px] mt-1.5" style={{ color: "var(--muted)" }}>
        {t(discs ? "discHint" : "bringHint")}
      </p>
      <form
        className="grid sm:grid-cols-2 gap-2 mt-2 text-xs"
        onSubmit={(e) => {
          e.preventDefault();
          go();
        }}
      >
        <label className="flex flex-col gap-1">
          <span style={{ color: "var(--muted)" }}>{t(disc ? "discFiles" : "file")}</span>
          <input
            key={picker}
            type="file"
            multiple={disc}
            disabled={busy}
            accept={choices.flatMap((k) => SYSTEMS[k].ext.map((x) => `.${x}`)).join(",")}
            onChange={(e) => {
              const fs = [...(e.target.files ?? [])];
              setFiles(fs);
              setSent(null);
              setStopped(false);
              const main = fs.find((f) => /\.(cue|chd|pbp|iso)$/i.test(f.name)) ?? fs[0];
              if (main && !title)
                setTitle(
                  main.name
                    .replace(/\.[^.]+$/, "")
                    .replace(/[_-]+/g, " ")
                    .slice(0, 60),
                );
            }}
          />
        </label>
        {!fixed && choices.length > 1 ? (
          <label className="flex flex-col gap-1">
            <span style={{ color: "var(--muted)" }}>{t("console")}</span>
            <select
              value={system}
              onChange={(e) => setSystem(e.target.value as GameSystem)}
              className="text-black rounded px-1 py-0.5"
            >
              {choices.map((k) => (
                <option key={k} value={k}>
                  {SYSTEMS[k].label}
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
        {disc && sent ? (
          <div className="sm:col-span-2 flex flex-col gap-1" data-testid="upload-progress">
            <div className="h-2 rounded-full overflow-hidden" style={{ background: "var(--track)" }}>
              <div
                className="h-full"
                style={{ width: `${(100 * sent[0]) / Math.max(1, sent[1])}%`, background: "var(--amber)" }}
              />
            </div>
            <span className="mono text-[11px]" style={{ color: "var(--cream-dim)" }}>
              {stopped
                ? t("upPaused")
                : sent[0] >= sent[1]
                  ? t("finishing")
                  : t("sending", { done: mb(sent[0]), total: mb(sent[1]) })}
            </span>
          </div>
        ) : null}
        <div className="sm:col-span-2 flex items-center gap-2">
          {busy && disc ? (
            <button
              type="button"
              className="deck-btn"
              style={{ height: 30, fontSize: 11 }}
              onClick={() => stop.current?.abort()}
            >
              {t("pause")}
            </button>
          ) : (
            <button type="submit" className="deck-btn" style={{ height: 30, fontSize: 11 }} disabled={!ok || busy}>
              {stopped ? t("carryOnUp") : t(disc ? "addDisc" : "add")}
            </button>
          )}
          {files.length && why ? (
            <span className="text-[11px]" style={{ color: "var(--error)" }}>
              {why}
            </span>
          ) : null}
        </div>
      </form>
    </details>
  );
}

// The disc console's BIOS in this space: which there are, bring one (a dump of
// a console you own; the API only takes known retail ones), take yours away.
function Bios({ t }: { t: TFn }) {
  const [list, setList] = useState<BiosInfo[] | null>(null);
  const [busy, setBusy] = useState(false);
  const reload = () =>
    void listBios()
      .then(setList)
      .catch(() => setList([]));
  useEffect(reload, []);
  return (
    <div
      className="rounded-md px-2.5 py-2 flex flex-col gap-1.5"
      style={{ background: "var(--pit-2)", border: "1px solid var(--well-edge)" }}
    >
      <p className="text-[11px] uppercase tracking-wide" style={{ color: "var(--muted)" }}>
        {t("bios")}
      </p>
      {list?.length ? (
        <ul className="flex flex-col gap-1" data-testid="bios-list">
          {list.map((b) => (
            <li key={b.id} className="flex items-center gap-2 text-xs" style={{ color: "var(--cream)" }}>
              <span className="mono">✓ {b.model}</span>
              <span style={{ color: "var(--muted)" }}>
                · {b.region} · v{b.version}
                {b.mine ? ` · ${t("biosWho")}` : ""}
              </span>
              {b.mine ? (
                <button
                  type="button"
                  className="ghost-btn text-xs ml-auto"
                  onClick={() => void removeBios(b.id).then(reload, (e: Error) => toast(e.message, "warn"))}
                >
                  {t("remove")}
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : list ? (
        <p className="text-[11px]" style={{ color: "var(--error)" }}>
          {t("needsBios")}
        </p>
      ) : null}
      {list?.length ? (
        <p className="text-[11px]" style={{ color: "var(--muted)" }}>
          {t("biosRegions")}
        </p>
      ) : null}
      <label className="text-xs flex items-center gap-2" style={{ color: "var(--cream)" }}>
        <span className="font-semibold">+ {t(list?.length ? "bringMoreBios" : "bringBios")}</span>
        <input
          type="file"
          accept=".bin,.BIN"
          disabled={busy}
          data-testid="bios-file"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (!f) return;
            setBusy(true);
            void bringBios(f)
              .then((b) => {
                toast(t("biosAdded", { model: b.model }));
                reload();
              })
              .catch((err: Error) => toast(err.message, "warn"))
              .finally(() => setBusy(false));
          }}
        />
      </label>
    </div>
  );
}

// The shelf: everything in the library, by console; bring one, take yours away.
function Shelf({
  t,
  games,
  discs,
  onChange,
  onClose,
  closeLabel,
}: {
  t: TFn;
  games: Cartridge[] | null;
  discs: boolean; // the disc rack (else the cartridge shelf)
  onChange: () => void;
  onClose: () => void;
  closeLabel: string;
}) {
  return (
    <div className="cabinet rise px-3 py-2.5 flex flex-col gap-2 my-auto">
      <header className="flex items-center gap-2">
        <div className="vfd-window px-3 py-1">
          <h2 className="lcd text-lg">{t(discs ? "rack" : "shelf").toUpperCase()}</h2>
        </div>
        <button type="button" className="ghost-btn ml-auto" onClick={onClose} aria-label={closeLabel}>
          ✕ <span className="hidden sm:inline">Esc</span>
        </button>
      </header>
      <CartList
        t={t}
        games={(games ?? []).filter((g) => isDiscSystem(g.system) === discs)}
        onRemove={(g) =>
          void removeGame(g.id)
            .then(onChange)
            .catch(() => toast("—", "warn"))
        }
      />
      <Upload t={t} discs={discs} fixed={discs ? DISC_SYSTEMS[0] : undefined} onDone={onChange} />
      {discs ? <Bios t={t} /> : null}
    </div>
  );
}
