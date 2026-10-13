"use client";

import { SLOT_COLORS, SLOT_LANES, SLOT_LAPS } from "@yutopia/shared/slotcar";
import { useCallback, useEffect, useRef, useState } from "react";
import { useLang, useTr } from "@/lib/i18n";
import { hud, type SlotLane, useHud } from "@/world/store";
import { useWorld } from "./ctx";

// The slot-car track's controls: the camera leans in over the table and this
// console sits under it (not a modal: the race stays in view). Take a lane,
// start the race (3 / 5 / 10 laps), then hold the trigger — Space, ↑ or W, the
// pad (higher is faster) or a gamepad's right trigger. Closing gives the lane back.
const fmt = (s: number) => (s ? `${s.toFixed(2)}s` : "—");

// The console's words (EN, PT-BR) live here, in the panel's own chunk: the
// world page has a size budget.
const T = {
  slotcar: ["Slot cars", "Autorama"],
  slotTake: ["Take lane", "Pegar pista"],
  slotLeave: ["Leave lane", "Sair da pista"],
  slotStart: ["Start race", "Largar"],
  slotLaps: ["Laps", "Voltas"],
  slotPick: ["Take a lane — up to four racers", "Pegue uma pista — até quatro pilotos"],
  slotFar: ["Walk up to the table to race", "Chegue perto da mesa para correr"],
  slotReady: ["Lights…", "Luzes…"],
  slotGo: ["GO!", "VAI!"],
  slotOff: ["OFF!", "SAIU!"],
  slotLap: ["Lap", "Volta"],
  slotBest: ["best", "melhor"],
  slotOffs: ["offs", "saídas"],
  slotFree: ["free", "livre"],
  slotWins: ["wins!", "venceu!"],
  slotWaiting: ["Waiting for the start", "Esperando a largada"],
  slotThrottle: ["Throttle", "Acelerador"],
  slotHint: [
    "Hold Space (or press the trigger: higher is faster) — ease off before the corners or you'll fly off.",
    "Segure Espaço (ou o gatilho: mais alto, mais rápido) — alivie antes das curvas ou o carro sai da pista.",
  ],
} as const;
type K = keyof typeof T;
const RAMP = 3.2; // the keyboard trigger squeezes in this fast (per second)
// the call-outs punch in and settle (still when motion is reduced)
const CALL_CSS = `@keyframes slot-call{0%{transform:translate(-50%,8px) scale(.6);opacity:0}18%{transform:translate(-50%,0) scale(1.12);opacity:1}30%{transform:translate(-50%,0) scale(1)}85%{opacity:1}100%{opacity:0}}
.slot-call{animation:slot-call 1.1s ease-out both}
@media (prefers-reduced-motion:reduce){.slot-call{animation:none}}`;

export function SlotPanel({ objectId }: { objectId: string }) {
  const tr = useTr();
  const pt = useLang() === "pt";
  const t = useCallback((k: K) => T[k][pt ? 1 : 0], [pt]);
  const w = useWorld();
  const view = useHud((s) => s.slot);
  const [laps, setLaps] = useState(5);
  const close = () => hud.set({ panel: { kind: null } });
  const mine = view?.id === objectId ? view.mine : -1;
  const phase = view?.phase ?? "lobby";

  // the trigger: keys squeeze it in, the pad sets it by height, a gamepad's RT
  const pad = useRef<HTMLDivElement>(null);
  const padDown = useRef<number | null>(null); // the pad's value while pressed
  const keyDown = useRef(false);
  const squeeze = useRef(0);
  const gauge = useRef<HTMLDivElement>(null);
  const slip = useRef<HTMLSpanElement>(null);
  const clock = useRef<HTMLSpanElement>(null);
  const trig = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const isGas = (e: KeyboardEvent) => e.key === " " || e.key === "ArrowUp" || e.key.toLowerCase() === "w";
    const onDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") return hud.set({ panel: { kind: null } });
      if (!isGas(e)) return;
      e.preventDefault();
      keyDown.current = true;
    };
    const onUp = (e: KeyboardEvent) => {
      if (isGas(e)) keyDown.current = false;
    };
    const onBlur = () => {
      keyDown.current = false;
      padDown.current = null;
    };
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    window.addEventListener("blur", onBlur);
    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      squeeze.current = keyDown.current ? Math.min(1, squeeze.current + dt * RAMP) : 0;
      let u = Math.max(squeeze.current, padDown.current ?? 0);
      const gp = navigator.getGamepads?.().find((g) => g?.connected);
      if (gp) u = Math.max(u, gp.buttons[7]?.value ?? 0, gp.buttons[0]?.pressed ? 1 : 0);
      w?.slots?.setThrottle(u);
      const live = w?.slots?.live();
      if (live) {
        if (gauge.current) gauge.current.style.width = `${Math.round(live.speed * 100)}%`;
        if (trig.current) trig.current.style.height = `${Math.round(u * 100)}%`;
        if (slip.current)
          slip.current.style.opacity = live.slip > 0.72 ? String(Math.min(1, 0.4 + live.slip * 0.6)) : "0.12";
        if (clock.current) clock.current.textContent = live.clock ? live.clock.toFixed(1) : "0.0";
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
      window.removeEventListener("blur", onBlur);
      w?.slots?.setThrottle(0);
    };
  }, [w]);

  const padAt = (e: React.PointerEvent) => {
    const r = pad.current?.getBoundingClientRect();
    if (!r) return;
    // a press near the bottom still moves it a little; the top is flat out
    padDown.current = Math.max(0.2, Math.min(1, 1 - (e.clientY - r.top) / r.height + 0.08));
  };

  const lanes = view?.id === objectId ? view.lanes : Array<SlotLane | null>(SLOT_LANES).fill(null);
  const winner = lanes.find((l) => l?.place === 1);
  const me = mine >= 0 ? lanes[mine] : null;

  // the big call-outs over the track: GO!, OFF!, your place at the flag
  const [call, setCall] = useState<{ text: string; tone: "go" | "off" | "flag"; key: number } | null>(null);
  const seen = useRef({ phase, offs: me?.offs ?? 0, place: me?.place ?? 0 });
  useEffect(() => {
    const s = seen.current;
    let next: { text: string; tone: "go" | "off" | "flag" } | null = null;
    if (phase === "race" && s.phase !== "race") next = { text: t("slotGo"), tone: "go" };
    else if (me && me.offs > s.offs) next = { text: t("slotOff"), tone: "off" };
    else if (me?.place && !s.place) next = { text: `P${me.place} · ${me.time.toFixed(2)}s`, tone: "flag" };
    seen.current = { phase, offs: me?.offs ?? 0, place: me?.place ?? 0 };
    if (!next) return;
    const key = Date.now();
    setCall({ ...next, key });
    const ms = next.tone === "flag" ? 3500 : 1100;
    const timer = setTimeout(() => setCall((c) => (c?.key === key ? null : c)), ms);
    return () => clearTimeout(timer);
  }, [phase, me, t]);
  const status =
    phase === "countdown"
      ? t("slotReady")
      : phase === "race"
        ? t("slotGo")
        : phase === "done"
          ? winner
            ? `${winner.name} ${t("slotWins")}`
            : "—"
          : view?.near === false && mine < 0
            ? t("slotFar")
            : mine >= 0
              ? t("slotWaiting")
              : t("slotPick");

  return (
    <section
      role="dialog"
      aria-label={t("slotcar")}
      className="pointer-events-auto absolute inset-x-0 bottom-0 mx-auto w-full max-w-4xl p-2 sm:p-3"
    >
      <style>{CALL_CSS}</style>
      {call ? (
        <div
          key={call.key}
          aria-live="assertive"
          className="slot-call lcd absolute left-1/2 -translate-x-1/2 bottom-full mb-6 pointer-events-none whitespace-nowrap"
          style={{
            fontSize: call.tone === "flag" ? 40 : 64,
            animationDuration: call.tone === "flag" ? "3.5s" : undefined,
            color: call.tone === "off" ? "#ff6a3a" : call.tone === "go" ? "#d4e4a6" : "#ffb35c",
            textShadow: `0 0 18px ${call.tone === "off" ? "#ff4a2a" : call.tone === "go" ? "#a8b98a" : "#ffa630"}, 0 3px 0 #15120f`,
          }}
        >
          {call.text}
        </div>
      ) : null}
      <div className="cabinet rise px-3 pt-2 pb-3">
        <header className="flex items-center gap-3">
          <div className="vfd-window px-3 py-1 shrink-0">
            <h2 className="lcd text-lg">{t("slotcar").toUpperCase()}</h2>
          </div>
          {/* the start lights */}
          <div className="flex gap-1.5" aria-hidden="true">
            {[0, 1, 2, 3, 4].map((i) => {
              const on = phase === "countdown" && i < (view?.lights ?? 0);
              return (
                <span
                  key={i}
                  className="inline-block rounded-full"
                  style={{
                    width: 14,
                    height: 14,
                    background: on ? "#ff5a36" : "#3a1712",
                    boxShadow: on ? "0 0 10px #ff5a36" : "inset 0 1px 2px #000",
                    border: "1px solid #15120f",
                  }}
                />
              );
            })}
          </div>
          <p
            className="text-sm font-semibold truncate flex-1 min-w-0"
            style={{ color: "var(--cream)" }}
            aria-live="polite"
          >
            {status}
          </p>
          <span className="lcd text-base tabular-nums">
            <span ref={clock}>0.0</span>s
          </span>
          <button type="button" className="ghost-btn" onClick={close} aria-label={tr("close")}>
            ✕ <span className="hidden sm:inline">Esc</span>
          </button>
        </header>

        <div className="mt-2 flex flex-col sm:flex-row gap-2 sm:gap-3 items-stretch">
          <ol className="grid grid-cols-2 sm:grid-cols-4 gap-2 flex-1 min-w-0">
            {lanes.map((l, lane) => (
              <li
                // biome-ignore lint/suspicious/noArrayIndexKey: lanes are fixed slots
                key={lane}
                className="rounded-md px-2 py-1.5 min-w-0"
                style={{
                  background: "#1a1410",
                  border: `1px solid ${l?.mine ? SLOT_COLORS[lane] : "#3a2c1f"}`,
                  boxShadow: l?.mine ? `0 0 0 1px ${SLOT_COLORS[lane]}` : undefined,
                }}
              >
                <div className="flex items-center gap-1.5 min-w-0">
                  <span
                    className="inline-block rounded-sm shrink-0"
                    style={{ width: 16, height: 8, background: SLOT_COLORS[lane], border: "1px solid #000" }}
                  />
                  <span
                    className="text-xs font-semibold truncate"
                    style={{ color: l ? "var(--cream)" : "var(--muted)" }}
                  >
                    {l ? l.name : t("slotFree")}
                  </span>
                  {l?.pos ? (
                    <span
                      className="lcd text-sm ml-auto"
                      style={{ color: l.place ? "#ffb35c" : l.pos === 1 ? "#d4e4a6" : undefined }}
                    >
                      {l.place ? "🏁 " : ""}P{l.pos}
                    </span>
                  ) : null}
                </div>
                {l ? (
                  <p className="mono text-[11px] mt-1 leading-tight" style={{ color: "var(--cream-dim)" }}>
                    {t("slotLap")} {Math.min(l.lap + (phase === "race" && !l.place ? 1 : 0), view?.laps ?? 5)}/
                    {view?.laps ?? 5} · {t("slotBest")} {fmt(l.best)}
                    {l.offs ? ` · ${l.offs} ${t("slotOffs")}` : ""}
                    {l.place && l.time ? ` · ${l.time.toFixed(2)}s` : ""}
                  </p>
                ) : (
                  <button
                    type="button"
                    className="deck-btn mt-1 w-full"
                    style={{ height: 26, fontSize: 11 }}
                    disabled={phase === "countdown" || phase === "race" || view?.near === false}
                    onClick={() => w?.slots?.join(objectId, lane)}
                  >
                    {t("slotTake")}
                  </button>
                )}
              </li>
            ))}
          </ol>

          {mine >= 0 ? (
            <div className="flex gap-2 shrink-0">
              <div className="flex flex-col justify-between gap-1.5 flex-1 sm:flex-none sm:w-[132px]">
                {phase === "lobby" || phase === "done" ? (
                  <>
                    <fieldset className="flex gap-1" aria-label={t("slotLaps")}>
                      {SLOT_LAPS.map((n) => (
                        <button
                          key={n}
                          type="button"
                          className="deck-btn flex-1"
                          style={{ height: 26, fontSize: 11 }}
                          aria-pressed={laps === n}
                          onClick={() => setLaps(n)}
                        >
                          {n}
                        </button>
                      ))}
                    </fieldset>
                    <button
                      type="button"
                      className="deck-btn"
                      style={{ height: 30, fontSize: 12 }}
                      onClick={() => w?.slots?.start(objectId, laps)}
                    >
                      {t("slotStart")}
                    </button>
                  </>
                ) : (
                  <div>
                    <p className="mono text-[10px]" style={{ color: "var(--muted)" }}>
                      {t("slotThrottle")}
                    </p>
                    <div className="h-2 rounded-full overflow-hidden mt-1" style={{ background: "#0d0906" }}>
                      <div ref={gauge} className="h-full" style={{ width: 0, background: SLOT_COLORS[mine] }} />
                    </div>
                    <span
                      ref={slip}
                      className="mono text-[10px] font-bold mt-1 inline-block"
                      style={{ color: "#ff6a3a", opacity: 0.12 }}
                    >
                      ◆ SLIDE
                    </span>
                  </div>
                )}
                <button
                  type="button"
                  className="ghost-btn text-xs"
                  onClick={() => w?.slots?.leave(objectId)}
                  disabled={phase === "countdown"}
                >
                  {t("slotLeave")}
                </button>
              </div>
              {/* the trigger: press and hold; higher on the pad is faster */}
              <div
                ref={pad}
                role="slider"
                aria-label={t("slotThrottle")}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={0}
                tabIndex={0}
                className="relative rounded-lg select-none touch-none overflow-hidden"
                style={{ width: 72, minHeight: 104, background: "#0d0906", border: "1px solid #3a2c1f" }}
                onPointerDown={(e) => {
                  e.currentTarget.setPointerCapture(e.pointerId);
                  padAt(e);
                }}
                onPointerMove={(e) => padDown.current !== null && padAt(e)}
                onPointerUp={() => {
                  padDown.current = null;
                }}
                onPointerCancel={() => {
                  padDown.current = null;
                }}
              >
                <div
                  ref={trig}
                  className="absolute inset-x-0 bottom-0"
                  style={{ height: 0, background: `linear-gradient(${SLOT_COLORS[mine]}, #3a1712)` }}
                />
                <span
                  className="absolute inset-x-0 bottom-1 text-center mono text-[10px]"
                  style={{ color: "var(--cream-dim)" }}
                >
                  ▲
                </span>
              </div>
            </div>
          ) : null}
        </div>
        <p className="text-[11px] mt-2" style={{ color: "var(--muted)" }}>
          {t("slotHint")}
        </p>
      </div>
    </section>
  );
}
