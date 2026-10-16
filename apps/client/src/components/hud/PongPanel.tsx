"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useLang, useTr } from "@/lib/i18n";
import { prefs, setPrefs } from "@/lib/prefs";
import { hud } from "@/world/store";
import type { PongInfo } from "@/world/tables/pong";
import { useWorld } from "./ctx";

// The ping-pong table's console: the camera leans in (iso) or stands behind
// your end (3D), and this sits under it — the flip-card scoreboard (points,
// games, who serves), the last hit's speed on the LED meter, Assisted / Pro.
// The racket is your pointer over your end of the table: swing through the
// ball (faster swing, harder hit); hold the left button to brush up (topspin),
// the right one to chop (backspin). Serving: click to toss, then swing.

const T = {
  pong: ["Ping-pong", "Pingue-pongue"],
  take: ["Take this end", "Pegar este lado"],
  leave: ["Leave", "Sair"],
  free: ["empty", "livre"],
  vortex: ["Play Vortex", "Jogar com o Vortex"],
  noVortex: ["Vortex out", "Tirar o Vortex"],
  start: ["Start match", "Começar"],
  again: ["Play again", "Jogar de novo"],
  points: ["Points", "Pontos"],
  bestOf: ["Best of", "Melhor de"],
  assist: ["Assisted", "Assistido"],
  pro: ["Pro", "Pro"],
  serve: ["Your serve — click (or Space)", "Seu saque — clique (ou Espaço)"],
  theirServe: ["'s serve", " saca"],
  play: ["Get to the marker — the racket does the rest", "Vá até o marcador — a raquete faz o resto"],
  concede: ["Give up", "Desistir"],
  wins: ["wins!", "venceu!"],
  pick: ["Take an end — two players, or play Vortex", "Pegue um lado — dois jogadores, ou jogue com o Vortex"],
  need: ["Waiting for someone at the other end", "Esperando alguém do outro lado"],
  hint: [
    "Move left / right to the marker (mouse, or A D ← →) — the racket hits as the ball arrives · hold left: smash · right: chop · the edge of the racket sends it wide",
    "Mova para o marcador (mouse, ou A D ← →) — a raquete rebate quando a bola chega · segure o esquerdo: cortada · direito: corte · a ponta da raquete abre o ângulo",
  ],
  reach: ["IN REACH", "NO ALCANCE"],
  moveL: ["◀ MOVE LEFT", "◀ VÁ PRA ESQUERDA"],
  moveR: ["MOVE RIGHT ▶", "VÁ PRA DIREITA ▶"],
  drive: ["DRIVE", "DRIVE"],
  smash: ["SMASH", "CORTADA"],
  chop: ["CHOP", "CORTE"],
  tip3d: ["Ping-pong plays best in 3D — press T", "Pingue-pongue fica melhor em 3D — aperte T"],
  speed: ["km/h", "km/h"],
  game: ["GAME", "GAME"],
  match: ["MATCH", "PARTIDA"],
  let: ["LET", "LET"],
  net: ["NET", "REDE"],
  out: ["OUT", "FORA"],
  double: ["DOUBLE BOUNCE", "DOIS QUIQUES"],
  volley: ["VOLLEY", "VOLEIO"],
  miss: ["MISSED", "PASSOU"],
  serveF: ["FAULT", "FALTA"],
  own: ["OWN SIDE", "MESMO LADO"],
  left: ["LEFT THE TABLE", "SAIU DA MESA"],
  conceded: ["GAVE UP", "DESISTIU"],
  point: ["point", "ponto"],
  gamePoint: ["GAME POINT", "GAME POINT"],
} as const;
type K = keyof typeof T;
const LEVELS = [
  ["easy", "Easy", "Fácil"],
  ["medium", "Medium", "Médio"],
  ["hard", "Hard", "Difícil"],
  ["turbo", "Turbo", "Turbo"],
] as const;
const WHY: Record<string, K> = {
  let: "let",
  net: "net",
  out: "out",
  double: "double",
  volley: "volley",
  miss: "miss",
  serve: "serveF",
  own: "own",
  left: "left",
  conceded: "conceded",
};
const CALL_CSS = `@keyframes pong-call{0%{transform:translate(-50%,8px) scale(.6);opacity:0}18%{transform:translate(-50%,0) scale(1.12);opacity:1}30%{transform:translate(-50%,0) scale(1)}85%{opacity:1}100%{opacity:0}}
.pong-call{animation:pong-call 1.8s ease-out both}
@keyframes flip{0%{transform:rotateX(0)}50%{transform:rotateX(-90deg)}100%{transform:rotateX(0)}}
.flip{animation:flip .35s ease-in-out}
@media (prefers-reduced-motion:reduce){.pong-call,.flip{animation:none}}`;

// One flip card: white digits on a dark card with the split across the middle.
function Card({ n, lit }: { n: number; lit?: boolean }) {
  return (
    <span
      key={n}
      className="flip relative inline-flex items-center justify-center rounded-md lcd tabular-nums"
      style={{
        width: 44,
        height: 52,
        fontSize: 34,
        background: "linear-gradient(#2a2420 0 49%, #15120f 49% 51%, #221d19 51%)",
        color: lit ? "#ffb35c" : "#f4ecd8",
        boxShadow: "inset 0 1px 0 rgba(255,255,255,.08), 0 2px 0 #0d0906",
        border: "1px solid #0d0906",
      }}
    >
      {n}
    </span>
  );
}

export function PongPanel({ objectId }: { objectId: string }) {
  const tr = useTr();
  const pt = useLang() === "pt";
  const t = useCallback((k: K) => T[k][pt ? 1 : 0], [pt]);
  const w = useWorld();
  const [info, setInfo] = useState<PongInfo | null>(null);
  const [level, setLevel] = useState("medium");
  const [to, setTo] = useState(11);
  const [bestOf, setBestOf] = useState(1);
  const [call, setCall] = useState<{ key: number; text: string; tone: "foul" | "good" | "win" } | null>(null);
  const sig = useRef("");
  const lastNo = useRef(-1);
  const close = () => hud.set({ panel: { kind: null } });
  const pong = w?.tables?.pong;

  useEffect(() => {
    if (!w) return;
    return w.onFrame(() => {
      const i = w.tables?.pong.info(objectId) ?? null;
      const s = JSON.stringify(i);
      if (s !== sig.current) {
        sig.current = s;
        setInfo(i);
      }
    });
  }, [w, objectId]);

  // call-outs on each point
  useEffect(() => {
    const p = info?.point;
    if (!p || p.no === lastNo.current) return;
    const first = lastNo.current < 0;
    lastNo.current = p.no;
    if (first) return;
    const who = p.winner >= 0 ? (info?.seats[p.winner]?.name ?? "") : "";
    let text = WHY[p.why] ? t(WHY[p.why]) : "";
    let tone: "foul" | "good" | "win" = p.winner === info?.mySeat ? "good" : "foul";
    if (p.match) {
      text = `${who} ${t("wins")}`;
      tone = "win";
    } else if (p.game) text = `${t("game")} · ${who}`;
    else if (p.why !== "let" && who) text = `${text} · ${t("point")} ${who}`;
    setCall({ key: p.no, text, tone });
  }, [info, t]);

  useEffect(() => {
    // keys: A / D or ← / → move, Space serves, T the view, Esc out
    const dir = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      return k === "a" || k === "arrowleft" ? "left" : k === "d" || k === "arrowright" ? "right" : null;
    };
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key === "Escape") return close();
      const d = dir(e);
      if (d) {
        e.preventDefault();
        w?.tables?.pong.key(d, true);
      } else if (e.key === " ") {
        e.preventDefault();
        if (!e.repeat) w?.tables?.pong.key("serve", true);
      } else if (e.key.toLowerCase() === "t" && !e.repeat)
        setPrefs({ view: prefs().view === "iso" ? prefs().last3d : "iso" });
    };
    const onUp = (e: KeyboardEvent) => {
      const d = dir(e);
      if (d) w?.tables?.pong.key(d, false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onUp);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onUp);
    };
  });

  const phase = info?.phase ?? "lobby";
  const me = info?.mySeat ?? -1;
  const playing = phase === "play";
  const vortexSeat = info?.seats.findIndex((s) => s?.vortex) ?? -1;
  const score = info?.score;
  const threeD = !!w?.tp;
  // a match of mine starts in iso: over to the 3D view (behind my end), and
  // back to how it was when I'm done here
  const fromIso = useRef(false);
  useEffect(() => {
    // (the latency e2e keeps two pages in the light iso view: window.__pongStayIso)
    const stay = typeof window !== "undefined" && (window as unknown as { __pongStayIso?: boolean }).__pongStayIso;
    if (playing && me >= 0 && prefs().view === "iso" && !fromIso.current && !stay) {
      fromIso.current = true;
      setPrefs({ view: prefs().last3d });
    }
  }, [playing, me]);
  useEffect(
    () => () => {
      if (fromIso.current) setPrefs({ view: "iso" });
    },
    [],
  );
  const status = (() => {
    if (!info) return t("pick");
    if (phase === "done") {
      const win = score && score.winner >= 0 ? info.seats[score.winner]?.name : "";
      return win ? `${win} ${t("wins")}` : "—";
    }
    if (!playing) return me < 0 ? t("pick") : info.seats[1 - me] ? "" : t("need");
    if (info.canServe) return t("serve");
    if (score && info.rally === "over" && score.server !== me)
      return `${info.seats[score.server]?.name ?? ""}${t("theirServe")}`;
    return t("play");
  })();
  const gamePoint =
    playing &&
    score &&
    (score.points[0] >= score.to - 1 || score.points[1] >= score.to - 1) &&
    score.points[0] !== score.points[1];

  const side = (seat: number) => {
    const s = info?.seats[seat];
    const serving = playing && score?.server === seat;
    return (
      <div className="flex flex-col items-center gap-1 min-w-0 flex-1">
        <div className="flex items-center gap-1.5 min-w-0">
          <span
            className="inline-block rounded-full shrink-0"
            style={{
              width: 8,
              height: 8,
              background: serving ? "#ffb35c" : "#3a2c1f",
              boxShadow: serving ? "0 0 8px #ffa630" : undefined,
            }}
            title="serve"
          />
          <span className="text-xs font-semibold truncate" style={{ color: s ? "var(--cream)" : "var(--muted)" }}>
            {s
              ? s.vortex
                ? `Vortex · ${LEVELS.find((l) => l[0] === s.vortex)?.[pt ? 2 : 1] ?? ""}`
                : s.name
              : t("free")}
          </span>
        </div>
        {playing || phase === "done" ? (
          <div className="flex items-end gap-1">
            <Card n={score?.points[seat] ?? 0} lit={serving} />
            {(score?.bestOf ?? 1) > 1 ? (
              <span className="lcd text-base px-1.5 rounded" style={{ background: "#0d0906", color: "#d4e4a6" }}>
                {score?.games[seat] ?? 0}
              </span>
            ) : null}
          </div>
        ) : s ? (
          s.me ? (
            <button type="button" className="ghost-btn text-xs" onClick={() => pong?.leave(objectId)}>
              {t("leave")}
            </button>
          ) : null
        ) : (
          <button
            type="button"
            className="deck-btn w-full"
            style={{ height: 26, fontSize: 11 }}
            onClick={() => pong?.sit(objectId, seat)}
          >
            {t("take")}
          </button>
        )}
      </div>
    );
  };

  return (
    <>
      {/* the racket: the pointer over my end, while I play */}
      {playing && me >= 0 ? (
        <div
          role="application"
          aria-label={t("hint")}
          className="fixed inset-0 pointer-events-auto touch-none"
          style={{ cursor: "crosshair" }}
          onPointerMove={(e) => pong?.pointer("move", e.clientX, e.clientY, { buttons: e.buttons, shift: e.shiftKey })}
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            pong?.pointer("down", e.clientX, e.clientY, { button: e.button, buttons: e.buttons, shift: e.shiftKey });
          }}
          onPointerUp={(e) => pong?.pointer("up", e.clientX, e.clientY, { buttons: e.buttons, shift: e.shiftKey })}
          onContextMenu={(e) => e.preventDefault()}
        />
      ) : null}
      <section
        role="dialog"
        aria-label={t("pong")}
        className="pointer-events-auto absolute inset-x-0 bottom-0 mx-auto w-full max-w-3xl p-2 sm:p-3"
      >
        <style>{CALL_CSS}</style>
        {playing && me >= 0 ? (
          <div
            className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 flex gap-2 pointer-events-none"
            aria-live="polite"
          >
            {info?.coming ? (
              <span
                className="lcd px-3 py-1 rounded-md text-lg"
                style={{
                  background: "rgba(13,9,6,.82)",
                  color: info.coming === "reach" ? "#a8e07a" : "#ffb35c",
                  border: `1px solid ${info.coming === "reach" ? "#a8e07a" : "#ffb35c"}`,
                  textShadow: `0 0 10px ${info.coming === "reach" ? "#a8e07a" : "#ffa630"}`,
                }}
              >
                {t(info.coming === "reach" ? "reach" : info.coming === "left" ? "moveL" : "moveR")}
              </span>
            ) : null}
            <span
              className="lcd px-2 py-1 rounded-md text-sm self-center"
              style={{
                background: "rgba(13,9,6,.82)",
                color: info?.shot === "smash" ? "#ff5a36" : info?.shot === "chop" ? "#6fb3ff" : "#ffb35c",
                border: "1px solid #3a2c1f",
              }}
            >
              {t(info?.shot ?? "drive")}
            </span>
          </div>
        ) : null}
        {call ? (
          <div
            key={call.key}
            aria-live="assertive"
            className="pong-call lcd absolute left-1/2 -translate-x-1/2 bottom-full mb-16 pointer-events-none whitespace-nowrap"
            style={{
              fontSize: call.tone === "win" ? 48 : 38,
              color: call.tone === "foul" ? "#ff6a3a" : call.tone === "good" ? "#d4e4a6" : "#ffb35c",
              textShadow: `0 0 18px ${call.tone === "foul" ? "#ff4a2a" : call.tone === "good" ? "#a8b98a" : "#ffa630"}, 0 3px 0 #15120f`,
            }}
          >
            {call.text}
          </div>
        ) : null}
        <div className="cabinet rise px-3 pt-2 pb-3">
          <header className="flex items-center gap-3">
            <div className="vfd-window px-3 py-1 shrink-0">
              <h2 className="lcd text-lg">{t("pong").toUpperCase()}</h2>
            </div>
            <p
              className="text-sm font-semibold truncate flex-1 min-w-0"
              style={{ color: "var(--cream)" }}
              aria-live="polite"
            >
              {gamePoint ? `${t("gamePoint")} · ` : ""}
              {status}
            </p>
            {me >= 0 ? (
              <fieldset className="flex gap-1" aria-label={t("assist")}>
                {([true, false] as const).map((on) => (
                  <button
                    key={String(on)}
                    type="button"
                    className="deck-btn"
                    style={{ height: 24, fontSize: 10, padding: "0 8px" }}
                    aria-pressed={info?.assist === on}
                    onClick={() => pong?.setAssist(on)}
                  >
                    {on ? t("assist") : t("pro")}
                  </button>
                ))}
              </fieldset>
            ) : null}
            <button type="button" className="ghost-btn" onClick={close} aria-label={tr("close")}>
              ✕ <span className="hidden sm:inline">Esc</span>
            </button>
          </header>

          <div className="mt-2 flex items-center gap-3">
            {side(0)}
            <div className="flex flex-col items-center shrink-0">
              <span className="mono text-[10px]" style={{ color: "var(--muted)" }}>
                {playing
                  ? `${t("points")} ${score?.to ?? 11}${(score?.bestOf ?? 1) > 1 ? ` · ${t("bestOf")} ${score?.bestOf}` : ""}`
                  : ""}
              </span>
              <span className="lcd text-xl tabular-nums" style={{ color: "#ffb35c" }}>
                {info?.speed ? `${info.speed}` : "--"}
                <span className="text-[10px] ml-1" style={{ color: "var(--muted)" }}>
                  {t("speed")}
                </span>
              </span>
              {/* the speed on an LED bar */}
              <div className="flex gap-px mt-0.5" aria-hidden="true">
                {Array.from({ length: 14 }, (_, i) => {
                  const on = (info?.speed ?? 0) / 10 > i;
                  const col = i > 10 ? "#ff5a36" : i > 7 ? "#ffb35c" : "#d4e4a6";
                  return (
                    <span
                      // biome-ignore lint/suspicious/noArrayIndexKey: fixed LEDs
                      key={i}
                      className="inline-block rounded-[1px]"
                      style={{
                        width: 5,
                        height: 9,
                        background: on ? col : "#1e1712",
                        boxShadow: on ? `0 0 4px ${col}` : undefined,
                      }}
                    />
                  );
                })}
              </div>
            </div>
            {side(1)}
          </div>

          {!playing && me >= 0 ? (
            <div className="mt-2 grid sm:grid-cols-[1fr_auto] gap-2">
              <div className="flex flex-col gap-1">
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
                        if (vortexSeat >= 0) pong?.vortex(objectId, l);
                      }}
                    >
                      {pt ? ptl : en}
                    </button>
                  ))}
                </fieldset>
                <div className="flex gap-1">
                  <span className="mono text-[10px] w-14 shrink-0 self-center" style={{ color: "var(--muted)" }}>
                    {t("points")}
                  </span>
                  {[11, 21].map((n) => (
                    <button
                      key={n}
                      type="button"
                      className="deck-btn flex-1"
                      style={{ height: 22, fontSize: 10 }}
                      aria-pressed={to === n}
                      onClick={() => setTo(n)}
                    >
                      {n}
                    </button>
                  ))}
                  <span
                    className="mono text-[10px] w-14 shrink-0 self-center text-right pr-1"
                    style={{ color: "var(--muted)" }}
                  >
                    {t("bestOf")}
                  </span>
                  {[1, 3, 5].map((n) => (
                    <button
                      key={n}
                      type="button"
                      className="deck-btn flex-1"
                      style={{ height: 22, fontSize: 10 }}
                      aria-pressed={bestOf === n}
                      onClick={() => setBestOf(n)}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex sm:flex-col gap-1 sm:w-[150px]">
                <button
                  type="button"
                  className="deck-btn flex-1"
                  style={{ height: 26, fontSize: 11 }}
                  disabled={!!info?.seats[1 - me] && vortexSeat < 0}
                  onClick={() => pong?.vortex(objectId, vortexSeat >= 0 ? null : level)}
                >
                  {vortexSeat >= 0 ? t("noVortex") : t("vortex")}
                </button>
                <button
                  type="button"
                  className="deck-btn flex-1"
                  style={{ height: 30, fontSize: 12 }}
                  disabled={!info?.seats[0] || !info?.seats[1]}
                  onClick={() => pong?.start(objectId, to, bestOf)}
                >
                  {phase === "done" ? t("again") : t("start")}
                </button>
              </div>
            </div>
          ) : null}

          {!playing && info?.record?.last?.length ? (
            <div className="mt-2 rounded-md px-2 py-1.5" style={{ background: "#1e2a22", border: "1px solid #3a2c1f" }}>
              <p className="mono text-[10px]" style={{ color: "#c9d6c0" }}>
                {Object.entries(info.record.wins)
                  .sort((a, b) => b[1] - a[1])
                  .slice(0, 4)
                  .map(([n, c]) => `${n} ${c}`)
                  .join(" · ")}
              </p>
            </div>
          ) : null}

          <div className="flex items-center gap-2 mt-1">
            <p className="text-[11px] flex-1" style={{ color: "var(--muted)" }}>
              {playing ? t("hint") : t("pick")}
            </p>
            {playing && me >= 0 ? (
              <button type="button" className="ghost-btn text-xs" onClick={() => pong?.concede(objectId)}>
                {t("concede")}
              </button>
            ) : null}
          </div>
          {!threeD && prefs().view === "iso" && me >= 0 ? (
            <p className="mono text-[10px] mt-0.5" style={{ color: "#ffb35c" }}>
              {t("tip3d")}
            </p>
          ) : null}
        </div>
      </section>
    </>
  );
}
