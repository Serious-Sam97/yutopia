"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useLang, useTr } from "@/lib/i18n";
import { hud } from "@/world/store";
import type { PoolInfo } from "@/world/tables/pool";
import { useWorld } from "./ctx";
import { usePadFrame } from "./usePad";

// The pool table's console: the camera leans in over the table (iso) or takes
// a game camera (3D), and this sits under it. In the lobby: two seats, Vortex
// at a level in the other one, the shot clock, the guideline, the table's
// chalkboard. Playing: both players' plates with their seven balls (lit while
// on the table), whose turn, the spin disc (where the tip hits the cue ball),
// the power meter, and the aim — the pointer on the table: move to aim, press
// and pull back to shoot, Shift for fine aim, the wheel or ←/→ to nudge, drag
// the cue ball when it's in hand, click a pocket to call the 8.

const T = {
  pool: ["Pool", "Sinuca"],
  take: ["Take seat", "Sentar"],
  leave: ["Leave", "Sair"],
  free: ["empty", "livre"],
  vortex: ["Play Vortex", "Jogar com o Vortex"],
  noVortex: ["Vortex out", "Tirar o Vortex"],
  start: ["Break!", "Quebrar!"],
  again: ["Play again", "Jogar de novo"],
  clock: ["Shot clock", "Relógio"],
  off: ["off", "sem"],
  guide: ["Guideline", "Linha de mira"],
  long: ["long", "longa"],
  short: ["short", "curta"],
  pro: ["pro", "pro"],
  yourTurn: ["Your shot", "Sua vez"],
  theirTurn: ["'s shot", " joga"],
  thinking: ["Vortex is lining it up…", "O Vortex está mirando…"],
  rolling: ["…", "…"],
  open: ["Open table", "Mesa aberta"],
  solids: ["Solids", "Lisas"],
  stripes: ["Stripes", "Listradas"],
  onEight: ["On the 8 — call a pocket", "Na 8 — escolha a caçapa"],
  inHand: ["Ball in hand — drag the cue ball", "Bola na mão — arraste a branca"],
  placing: [
    "Ball in hand — put the cue ball anywhere on the table, click to set it down",
    "Bola na mão — coloque a branca onde quiser na mesa e clique para soltar",
  ],
  kitchen: ["Ball in hand behind the line", "Bola na mão atrás da linha"],
  spin: ["Spin", "Efeito"],
  power: ["Power", "Força"],
  shoot: ["Shoot", "Tacar"],
  cam: ["Camera", "Câmera"],
  top: ["Top", "Cima"],
  cue: ["Cue", "Taco"],
  concede: ["Give up", "Desistir"],
  wins: ["wins!", "venceu!"],
  far: ["Walk up to the table to play", "Chegue perto da mesa para jogar"],
  pick: ["Take a seat — two players, or play Vortex", "Sente-se — dois jogadores, ou jogue com o Vortex"],
  need: ["Waiting for a second player", "Esperando o segundo jogador"],
  record: ["The chalkboard", "O quadro"],
  hint: [
    "Move to aim · hold Space to build power, let go to shoot (or press and pull back) · Shift: fine aim · wheel / ←→ nudge",
    "Mova para mirar · segure Espaço para dar força, solte para tacar (ou aperte e puxe) · Shift: mira fina · roda / ←→ ajuste",
  ],
  // call-outs
  scratch: ["SCRATCH!", "BRANCA NA CAÇAPA!"],
  noHit: ["MISSED!", "NÃO TOCOU!"],
  wrongFirst: ["WRONG BALL", "BOLA ERRADA"],
  eightFirst: ["FOUL — THE 8", "FALTA — A 8"],
  noRail: ["NO RAIL", "SEM TABELA"],
  badBreak: ["WEAK BREAK", "QUEBRA FRACA"],
  clockOut: ["TIME!", "TEMPO!"],
  bih: ["ball in hand", "bola na mão"],
  eightEarly: ["8 TOO EARLY", "8 CEDO DEMAIS"],
  eightWrongPocket: ["WRONG POCKET", "CAÇAPA ERRADA"],
  eightScratch: ["8 + SCRATCH", "8 E BRANCA"],
  eightFoul: ["FOUL ON THE 8", "FALTA NA 8"],
  left: ["LEFT THE TABLE", "SAIU DA MESA"],
  conceded: ["GAVE UP", "DESISTIU"],
  miscue: ["MISCUE!", "ESPIRRO!"],
  eightBack: ["8 back on the spot", "8 volta ao ponto"],
  // out of a game: a ball off the table to throw at people, the cue a gun that fires them
  loose: ["No game on:", "Sem jogo:"],
  takeBall: ["Take a ball", "Pegar uma bola"],
  takeCue: ["Take the cue", "Pegar o taco"],
  putBack: ["Put it back (B)", "Devolver (B)"],
} as const;
type K = keyof typeof T;
const LEVELS = [
  ["easy", "Easy", "Fácil"],
  ["medium", "Medium", "Médio"],
  ["hard", "Hard", "Difícil"],
  ["turbo", "Turbo", "Turbo"],
] as const;
const BALL: Record<number, string> = {
  1: "#f2b21c",
  2: "#1f4ea8",
  3: "#c8322b",
  4: "#56307f",
  5: "#e8691b",
  6: "#1d7748",
  7: "#7b2331",
  8: "#141414",
};
const CALL_CSS = `@keyframes pool-call{0%{transform:translate(-50%,8px) scale(.6);opacity:0}18%{transform:translate(-50%,0) scale(1.12);opacity:1}30%{transform:translate(-50%,0) scale(1)}85%{opacity:1}100%{opacity:0}}
.pool-call{animation:pool-call 2.4s ease-out both}
@media (prefers-reduced-motion:reduce){.pool-call{animation:none}}`;

// A ball, small (the plates' LEDs): solid, stripe or the 8, dim once potted.
function Mini({ id, down, size = 18 }: { id: number; down?: boolean; size?: number }) {
  const c = BALL[id > 8 ? id - 8 : id] ?? "#f3eee0";
  const stripe = id > 8;
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" aria-hidden="true" style={{ opacity: down ? 0.22 : 1 }}>
      <title>{id}</title>
      <defs>
        <radialGradient id={`mg${id}`} cx="35%" cy="30%" r="75%">
          <stop offset="0" stopColor="#fff" stopOpacity=".7" />
          <stop offset=".35" stopColor="#fff" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity=".35" />
        </radialGradient>
        <clipPath id={`mc${id}`}>
          <circle cx="10" cy="10" r="9" />
        </clipPath>
      </defs>
      <circle cx="10" cy="10" r="9" fill={stripe ? "#f3eee0" : c} />
      {stripe ? <rect x="0" y="5.5" width="20" height="9" fill={c} clipPath={`url(#mc${id})`} /> : null}
      <circle cx="10" cy="10" r="4.2" fill="#f3eee0" />
      <text x="10" y="12.3" textAnchor="middle" fontSize="6" fontWeight="700" fill="#15120f">
        {id}
      </text>
      <circle cx="10" cy="10" r="9" fill={`url(#mg${id})`} stroke="#15120f" strokeWidth="1" />
    </svg>
  );
}

export function PoolPanel({ objectId }: { objectId: string }) {
  const tr = useTr();
  const pt = useLang() === "pt";
  const t = useCallback((k: K) => T[k][pt ? 1 : 0], [pt]);
  const w = useWorld();
  const [info, setInfo] = useState<PoolInfo | null>(null);
  const [level, setLevel] = useState("medium");
  const [clock, setClock] = useState(0);
  const [guide, setGuide] = useState("short");
  const [call, setCall] = useState<{ key: number; text: string; tone: "foul" | "good" | "win" } | null>(null);
  const sig = useRef("");
  const lastNo = useRef(-1);
  const close = () => hud.set({ panel: { kind: null } });
  // on a pad (docs/plan/56-the-controls.md phase 6): the left stick turns the cue (gently: past a
  // half tilt, faster), A held charges and let go shoots, Y the camera, B lets the charge go or
  // leaves
  usePadFrame((f) => {
    const p = w?.tables?.pool;
    if (!p) return;
    const x = f.left.x || (f.held(15) ? 1 : f.held(14) ? -1 : 0);
    if (x) p.nudge((-x * Math.abs(x) * 0.9 * Math.PI) / 180);
    if (f.pressed(0)) p.charge(true);
    if (f.released(0)) p.charge(false);
    if (f.pressed(3)) p.setCam(p.cam === "top" ? "cue" : "top");
    if (f.pressed(1)) {
      if (p.charging) p.charge(false, true);
      else close();
    }
  });

  // the table's state, read every frame (only re-rendered when it changes)
  useEffect(() => {
    if (!w) return;
    return w.onFrame(() => {
      const i = w.tables?.pool.info(objectId) ?? null;
      const s = JSON.stringify(i && { ...i, clockLeft: Math.ceil(i.clockLeft), power: Math.round(i.power * 50) });
      if (s !== sig.current) {
        sig.current = s;
        setInfo(i);
      }
    });
  }, [w, objectId]);

  // call-outs as shots land
  useEffect(() => {
    const r = info?.result;
    if (!r || r.no === lastNo.current || info?.rolling) return;
    const first = lastNo.current < 0;
    lastNo.current = r.no;
    if (first) return;
    const who = info?.seats[r.seat]?.name ?? "";
    let text = "";
    let tone: "foul" | "good" | "win" = "foul";
    if (r.outcome === "win") {
      text = `${who} ${t("wins")}`;
      tone = "win";
    } else if (r.outcome && r.outcome in T) {
      text = t(r.outcome as K);
      if (r.winner >= 0) text += ` · ${info?.seats[r.winner]?.name ?? ""} ${t("wins")}`;
    } else if (r.miscue) text = t("miscue");
    else if (r.foul) text = `${t(r.foul === "clock" ? "clockOut" : (r.foul as K))} · ${t("bih")}`;
    else if (r.assigned) {
      text = `${who}: ${t(r.assigned as K)}`;
      tone = "good";
    }
    if (text) setCall({ key: r.no, text, tone });
  }, [info, t]);

  // keys: Esc closes (or puts a charging cue down), ←/→ nudge the aim, Space
  // held charges the power and shoots when let go, C turns the camera, T the view
  useEffect(() => {
    const onUp = (e: KeyboardEvent) => {
      if (e.key === " ") {
        e.preventDefault();
        w?.tables?.pool.charge(false);
      }
    };
    const onBlur = () => w?.tables?.pool.charge(false, true);
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      const p = w?.tables?.pool;
      if (e.key === "Escape") {
        if (p?.charging) return p.charge(false, true);
        return close();
      }
      if (!p) return;
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        e.preventDefault();
        p.nudge(((e.key === "ArrowLeft" ? 1 : -1) * (e.shiftKey ? 1 : 0.1) * Math.PI) / 180);
      } else if (e.key === " ") {
        e.preventDefault();
        if (!e.repeat) p.charge(true);
      } else if (e.key.toLowerCase() === "c") p.setCam(p.cam === "top" ? "cue" : "top");
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onUp);
      window.removeEventListener("blur", onBlur);
    };
  });

  const pool = w?.tables?.pool;
  const phase = info?.phase ?? "lobby";
  const me = info?.mySeat ?? -1;
  const playing = phase === "play";
  const vortexSeat = info?.seats.findIndex((s) => s?.vortex) ?? -1;
  const threeD = !!w?.tp;

  const status = (() => {
    if (!info) return t("pick");
    if (phase === "done") {
      const win = info.winner >= 0 ? info.seats[info.winner]?.name : "";
      return win ? `${win} ${t("wins")}` : "—";
    }
    if (!playing) return me < 0 ? t("pick") : info.seats[1 - me] ? "" : t("need");
    if (info.rolling) return t("rolling");
    if (info.vortexThinking) return t("thinking");
    if (info.myTurn) {
      if (info.placing) return t("placing");
      if (info.inHand === "kitchen") return t("kitchen");
      if (info.inHand) return t("inHand");
      if (info.onEight) return t("onEight");
      return t("yourTurn");
    }
    return `${info.seats[info.turn]?.name ?? ""}${t("theirTurn")}`;
  })();

  // the spin disc: where the tip meets the cue ball
  const spinPad = useRef<SVGSVGElement>(null);
  const spinAt = (e: React.PointerEvent) => {
    const r = spinPad.current?.getBoundingClientRect();
    if (!r) return;
    const x = ((e.clientX - r.left) / r.width) * 2 - 1;
    const y = -(((e.clientY - r.top) / r.height) * 2 - 1);
    pool?.setSpin(x / 0.82, y / 0.82);
  };
  // the power slider (for touch, or for a steady hand)
  const powerBar = useRef<HTMLDivElement>(null);
  const powerAt = (e: React.PointerEvent) => {
    const r = powerBar.current?.getBoundingClientRect();
    if (!r) return;
    pool?.setPower(1 - (e.clientY - r.top) / r.height);
  };

  const plate = (seat: number) => {
    const s = info?.seats[seat];
    const turn = playing && info?.turn === seat;
    const grp = info?.groups[seat];
    const down = info?.down[seat] ?? [];
    return (
      <div
        className="rounded-md px-2 py-1.5 min-w-0 flex-1"
        style={{
          background: "var(--well)",
          border: `1px solid ${turn ? "var(--vfd)" : "var(--well-edge)"}`,
          boxShadow: turn
            ? "0 0 0 1px var(--vfd), 0 0 14px color-mix(in srgb, var(--amber) 25%, transparent)"
            : undefined,
        }}
      >
        <div className="flex items-center gap-1.5 min-w-0">
          <span
            className="inline-block rounded-full shrink-0"
            style={{
              width: 8,
              height: 8,
              background: turn ? "var(--vfd)" : "var(--well-edge)",
              boxShadow: turn ? "0 0 8px var(--amber)" : undefined,
            }}
          />
          <span className="text-xs font-semibold truncate" style={{ color: s ? "var(--cream)" : "var(--muted)" }}>
            {s
              ? s.vortex
                ? `Vortex · ${LEVELS.find((l) => l[0] === s.vortex)?.[pt ? 2 : 1] ?? ""}`
                : s.name
              : t("free")}
          </span>
          {grp ? (
            <span className="mono text-[10px] ml-auto shrink-0" style={{ color: "var(--cream-dim)" }}>
              {t(grp as K)}
            </span>
          ) : playing ? (
            <span className="mono text-[10px] ml-auto shrink-0" style={{ color: "var(--muted)" }}>
              {t("open")}
            </span>
          ) : null}
        </div>
        {playing || phase === "done" ? (
          <div className="flex gap-0.5 mt-1 items-center">
            {down.length
              ? down.map(([id, d]) => <Mini key={id} id={id} down={!!d} />)
              : [1, 2, 3, 4, 5, 6, 7].map((n) => (
                  <span
                    key={n}
                    className="inline-block rounded-full"
                    style={{ width: 18, height: 18, background: "var(--pit)", border: "1px solid var(--well-on)" }}
                  />
                ))}
            <span className="ml-1">
              <Mini id={8} down={info?.left[seat] !== 0} size={16} />
            </span>
          </div>
        ) : s ? (
          s.me ? (
            <button type="button" className="ghost-btn text-xs mt-1" onClick={() => pool?.leave(objectId)}>
              {t("leave")}
            </button>
          ) : null
        ) : (
          <button
            type="button"
            className="deck-btn mt-1 w-full"
            style={{ height: 26, fontSize: 11 }}
            onClick={() => pool?.sit(objectId, seat)}
          >
            {t("take")}
          </button>
        )}
      </div>
    );
  };

  const record = info?.record;
  return (
    <>
      {/* the aim: the pointer on the table, while it's my shot */}
      {info?.myTurn ? (
        <div
          role="application"
          aria-label={t("hint")}
          className="fixed inset-0 pointer-events-auto touch-none"
          style={{ cursor: info.placing ? "grabbing" : info.inHand ? "grab" : "crosshair" }}
          onPointerMove={(e) => pool?.pointer("move", e.clientX, e.clientY, { shift: e.shiftKey || e.buttons === 2 })}
          onPointerDown={(e) => {
            if (e.button === 2) return;
            e.currentTarget.setPointerCapture(e.pointerId);
            pool?.pointer("down", e.clientX, e.clientY);
          }}
          onPointerUp={(e) => pool?.pointer("up", e.clientX, e.clientY)}
          onPointerCancel={(e) => pool?.pointer("cancel", e.clientX, e.clientY)}
          onContextMenu={(e) => e.preventDefault()}
          onWheel={(e) => pool?.nudge(((e.deltaY > 0 ? -1 : 1) * (e.shiftKey ? 0.5 : 0.1) * Math.PI) / 180)}
        />
      ) : null}
      <section
        role="dialog"
        aria-label={t("pool")}
        className="pointer-events-auto absolute inset-x-0 bottom-0 mx-auto w-full max-w-4xl p-2 sm:p-3"
      >
        <style>{CALL_CSS}</style>
        {call ? (
          <div
            key={call.key}
            aria-live="assertive"
            className="pool-call lcd absolute left-1/2 -translate-x-1/2 bottom-full mb-6 pointer-events-none whitespace-nowrap"
            style={{
              fontSize: call.tone === "win" ? 48 : 40,
              color: call.tone === "foul" ? "var(--bad)" : call.tone === "good" ? "var(--lcd-good)" : "var(--vfd)",
              textShadow: `0 0 18px ${call.tone === "foul" ? "var(--bad-glow)" : call.tone === "good" ? "var(--lcd-good-glow)" : "var(--amber)"}, 0 3px 0 #15120f`,
            }}
          >
            {call.text}
          </div>
        ) : null}
        <div className="cabinet rise px-3 pt-2 pb-3">
          <header className="flex items-center gap-3">
            <div className="vfd-window px-3 py-1 shrink-0">
              <h2 className="lcd text-lg">{t("pool").toUpperCase()}</h2>
            </div>
            <p
              className="text-sm font-semibold truncate flex-1 min-w-0"
              style={{ color: "var(--cream)" }}
              aria-live="polite"
            >
              {status}
            </p>
            {playing && info?.clock ? (
              <span
                className="lcd text-base tabular-nums"
                style={{ color: (info.clockLeft ?? 99) < 8 ? "var(--bad)" : undefined }}
                title={t("clock")}
              >
                {Math.ceil(info.clockLeft)}s
              </span>
            ) : null}
            {threeD && (playing || phase === "done") ? (
              <fieldset className="flex gap-1" aria-label={t("cam")}>
                {(["top", "cue"] as const).map((c) => (
                  <button
                    key={c}
                    type="button"
                    className="deck-btn"
                    style={{ height: 24, fontSize: 10, padding: "0 8px" }}
                    aria-pressed={info?.cam === c}
                    onClick={() => pool?.setCam(c)}
                    title="C"
                  >
                    {t(c)}
                  </button>
                ))}
              </fieldset>
            ) : null}
            <button type="button" className="ghost-btn" onClick={close} aria-label={tr("close")}>
              ✕ <span className="hidden sm:inline">Esc</span>
            </button>
          </header>

          {!playing ? (
            <div className="mt-2 flex gap-1.5 items-center flex-wrap">
              <span className="mono text-[10px]" style={{ color: "var(--muted)" }}>
                {t("loose")}
              </span>
              <button
                type="button"
                className="deck-btn"
                style={{ height: 26, fontSize: 11 }}
                onClick={() => {
                  w?.tables?.balls.take(objectId, "ball");
                  close();
                }}
              >
                🎱 {t("takeBall")}
              </button>
              <button
                type="button"
                className="deck-btn"
                style={{ height: 26, fontSize: 11 }}
                onClick={() => {
                  w?.tables?.balls.take(objectId, "cue");
                  close();
                }}
              >
                {t("takeCue")}
              </button>
              {info?.holding ? (
                <button type="button" className="ghost-btn text-xs" onClick={() => w?.tables?.balls.putBack()}>
                  {t("putBack")}
                </button>
              ) : null}
            </div>
          ) : null}
          <div className="mt-2 flex flex-col sm:flex-row gap-2 sm:gap-3 items-stretch">
            <div className="flex gap-2 flex-1 min-w-0">
              {plate(0)}
              {plate(1)}
            </div>

            {playing && me >= 0 ? (
              <div className="flex gap-2 shrink-0 items-stretch">
                {/* where the tip hits the cue ball */}
                <div className="flex flex-col items-center">
                  <span className="mono text-[10px]" style={{ color: "var(--muted)" }}>
                    {t("spin")}
                  </span>
                  <svg
                    ref={spinPad}
                    width={64}
                    height={64}
                    viewBox="-1 -1 2 2"
                    className="touch-none cursor-pointer"
                    aria-label={t("spin")}
                    onPointerDown={(e) => {
                      e.currentTarget.setPointerCapture(e.pointerId);
                      spinAt(e);
                    }}
                    onPointerMove={(e) => e.buttons && spinAt(e)}
                    onDoubleClick={() => pool?.setSpin(0, 0)}
                  >
                    <title>{t("spin")}</title>
                    <defs>
                      <radialGradient id="cueg" cx="38%" cy="32%" r="75%">
                        <stop offset="0" stopColor="#ffffff" />
                        <stop offset=".55" stopColor="#efe7d4" />
                        <stop offset="1" stopColor="#b8ad94" />
                      </radialGradient>
                    </defs>
                    <circle r="0.94" fill="url(#cueg)" stroke="#15120f" strokeWidth="0.05" />
                    <circle r="0.41" fill="none" stroke="#15120f" strokeOpacity=".25" strokeWidth="0.02" />
                    <line x1="-0.82" x2="0.82" y1="0" y2="0" stroke="#15120f" strokeOpacity=".2" strokeWidth="0.02" />
                    <line y1="-0.82" y2="0.82" x1="0" x2="0" stroke="#15120f" strokeOpacity=".2" strokeWidth="0.02" />
                    <circle
                      cx={(info?.spinX ?? 0) * 0.82}
                      cy={-(info?.spinY ?? 0) * 0.82}
                      r="0.14"
                      fill="#3d6fa8"
                      stroke="#15120f"
                      strokeWidth="0.04"
                    />
                  </svg>
                </div>
                {/* power: an LED meter that's also a slider */}
                <div className="flex flex-col items-center">
                  <span className="mono text-[10px]" style={{ color: "var(--muted)" }}>
                    {t("power")}
                  </span>
                  <div
                    ref={powerBar}
                    role="slider"
                    aria-label={t("power")}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={Math.round((info?.power ?? 0) * 100)}
                    tabIndex={0}
                    className="relative rounded-md touch-none cursor-ns-resize flex flex-col-reverse gap-px p-1"
                    style={{ width: 26, height: 64, background: "var(--pit)", border: "1px solid var(--well-edge)" }}
                    onPointerDown={(e) => {
                      e.currentTarget.setPointerCapture(e.pointerId);
                      powerAt(e);
                    }}
                    onPointerMove={(e) => e.buttons && powerAt(e)}
                  >
                    {Array.from({ length: 12 }, (_, i) => {
                      const on = (info?.power ?? 0) * 12 > i;
                      const col = i > 9 ? "var(--hot)" : i > 6 ? "var(--vfd)" : "var(--lcd-good)";
                      return (
                        <span
                          // biome-ignore lint/suspicious/noArrayIndexKey: fixed LEDs
                          key={i}
                          className="block rounded-[1px] flex-1"
                          style={{
                            background: on ? col : "var(--meter-off)",
                            boxShadow: on ? `0 0 5px ${col}` : undefined,
                          }}
                        />
                      );
                    })}
                  </div>
                </div>
                <div className="flex flex-col justify-between gap-1 w-[92px]">
                  <button
                    type="button"
                    className="deck-btn"
                    style={{ height: 34, fontSize: 12 }}
                    disabled={!info?.myTurn || (info?.power ?? 0) < 0.03}
                    onClick={() => pool?.shootNow()}
                    title="Space (hold to build power)"
                  >
                    {t("shoot")}
                  </button>
                  <button type="button" className="ghost-btn text-xs" onClick={() => pool?.concede(objectId)}>
                    {t("concede")}
                  </button>
                </div>
              </div>
            ) : null}

            {!playing && me >= 0 ? (
              <div className="flex flex-col gap-1.5 shrink-0 sm:w-[260px]">
                <fieldset className="grid grid-cols-4 gap-1" aria-label={t("vortex")}>
                  {LEVELS.map(([l, en, ptl]) => (
                    <button
                      key={l}
                      type="button"
                      className="deck-btn min-w-0 px-0"
                      style={{ height: 24, fontSize: 10 }}
                      aria-pressed={level === l}
                      onClick={() => {
                        setLevel(l);
                        if (vortexSeat >= 0) pool?.vortex(objectId, l);
                      }}
                    >
                      {pt ? ptl : en}
                    </button>
                  ))}
                </fieldset>
                <button
                  type="button"
                  className="deck-btn"
                  style={{ height: 26, fontSize: 11 }}
                  disabled={!!info?.seats[1 - me] && vortexSeat < 0}
                  onClick={() => pool?.vortex(objectId, vortexSeat >= 0 ? null : level)}
                >
                  {vortexSeat >= 0 ? t("noVortex") : t("vortex")}
                </button>
                <div className="flex gap-1 items-center">
                  <span className="mono text-[10px] w-16 shrink-0" style={{ color: "var(--muted)" }}>
                    {t("clock")}
                  </span>
                  {[0, 30, 60].map((c) => (
                    <button
                      key={c}
                      type="button"
                      className="deck-btn flex-1"
                      style={{ height: 22, fontSize: 10 }}
                      aria-pressed={clock === c}
                      onClick={() => setClock(c)}
                    >
                      {c ? `${c}s` : t("off")}
                    </button>
                  ))}
                </div>
                <div className="flex gap-1 items-center">
                  <span className="mono text-[10px] w-16 shrink-0" style={{ color: "var(--muted)" }}>
                    {t("guide")}
                  </span>
                  {(["long", "short", "pro"] as const).map((g) => (
                    <button
                      key={g}
                      type="button"
                      className="deck-btn flex-1"
                      style={{ height: 22, fontSize: 10 }}
                      aria-pressed={guide === g}
                      onClick={() => setGuide(g)}
                    >
                      {t(g)}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  className="deck-btn"
                  style={{ height: 32, fontSize: 12 }}
                  disabled={!info?.seats[0] || !info?.seats[1]}
                  onClick={() => pool?.start(objectId, clock, guide)}
                >
                  {phase === "done" ? t("again") : t("start")}
                </button>
              </div>
            ) : null}
          </div>

          {/* the chalkboard: the last games here, and who wins most */}
          {!playing && record?.last?.length ? (
            <div
              className="mt-2 rounded-md px-2 py-1.5"
              style={{ background: "#1e2a22", border: "1px solid var(--well-edge)" }}
            >
              <p className="mono text-[10px]" style={{ color: "#c9d6c0" }}>
                {t("record").toUpperCase()} ·{" "}
                {Object.entries(record.wins)
                  .sort((a, b) => b[1] - a[1])
                  .slice(0, 4)
                  .map(([n, c]) => `${n} ${c}`)
                  .join(" · ")}
              </p>
              <p
                className="text-[11px] mt-0.5 truncate"
                style={{ color: "#e8efe2", fontFamily: "'Comic Sans MS', 'Chalkboard SE', cursive" }}
              >
                {record.last
                  .slice(0, 4)
                  .map((g) => `${g.w} › ${g.l || "—"}`)
                  .join("   ")}
              </p>
            </div>
          ) : null}
          <p className="text-[11px] mt-1" style={{ color: "var(--muted)" }}>
            {playing ? t("hint") : t("pick")}
          </p>
        </div>
      </section>
    </>
  );
}
