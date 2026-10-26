"use client";

import { type GameSystem, hasSticks, SYSTEMS } from "@yutopia/shared/games";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useLang } from "@/lib/i18n";
import {
  axisName,
  type Binding,
  bind,
  bindingOf,
  bit,
  buttonName,
  type Control,
  controlName,
  controlsOf,
  isStickDir,
  keyName,
  layoutOf,
  myGamepad,
  onPadPrefs,
  padFamily,
  padPrefs,
  pressed,
  readPad,
  resetBinding,
  setPadPrefs,
  unbind,
} from "@/world/games/input";
import { realGamepads } from "@/world/games/vpad";
import { Panel } from "./Panel";

// Controllers (docs/plan/23-disc-console.md P4): which gamepad is yours, and
// what each key, button and stick does on each console — click one, then press
// what you want for it. Kept on this device (a gamepad is this computer's).
// Words live here (EN / PT-BR), not in i18n.ts: the world page's budget.
const T = {
  title: ["Controllers", "Controles"],
  yourPad: ["Your pad", "Seu controle"],
  noPad: [
    "No gamepad yet: plug one in and press any of its buttons (browsers only show a pad once it's pressed).",
    "Nenhum controle ainda: conecte um e aperte qualquer botão (o navegador só mostra o controle depois de apertar).",
  ],
  pickHint: ["Press any button on the pad you want to use.", "Aperte qualquer botão no controle que você quer usar."],
  first: ["Whichever is pressed", "O que for apertado"],
  console: ["Console", "Console"],
  control: ["On the console", "No console"],
  key: ["Key", "Tecla"],
  pad: ["Pad", "Controle"],
  press: ["Press a key…", "Aperte uma tecla…"],
  pressPad: ["Press a button or push a stick…", "Aperte um botão ou mova um analógico…"],
  none: ["—", "—"],
  clearHint: ["Delete clears it · Esc cancels", "Delete limpa · Esc cancela"],
  deadzone: ["Stick dead zone", "Zona morta do analógico"],
  dpadStick: [
    "The stick moves the d-pad (consoles without sticks)",
    "O analógico move o direcional (consoles sem analógico)",
  ],
  reset: ["Reset this console", "Voltar ao padrão deste console"],
  back: ["Back to the console", "Voltar ao console"],
  raw: ["Held now", "Apertado agora"],
  sticksRaw: ["axes", "eixos"],
  mapping: ["mapping", "mapeamento"],
  reading: ["pad", "controle"],
  live: ["input arriving", "chegando entrada"],
  stale: ["no input from the browser for 3 s (press something)", "nenhuma entrada do navegador há 3 s (aperte algo)"],
} as const;
type K = keyof typeof T;
const CONSOLES = Object.keys(SYSTEMS) as GameSystem[];

// what your pad holds now (a binding waits for something new)
const snap = () => {
  const g = myGamepad();
  return { buttons: g?.buttons.map(pressed) ?? [], axes: [...(g?.axes ?? [])] };
};

type Listening = {
  control: Control;
  kind: "keys" | "pad";
  since: number;
  base: { buttons: boolean[]; axes: number[] };
};

export function ControllersPanel({ start, onClose }: { start?: GameSystem; onClose?: () => void }) {
  const pt = useLang() === "pt";
  const t = (k: K) => T[k][pt ? 1 : 0];
  const prefs = useSyncExternalStore(onPadPrefs, padPrefs, padPrefs);
  const [system, setSystem] = useState<GameSystem>(start ?? "ps1");
  const [listening, setListening] = useState<Listening | null>(null);
  const [pads, setPads] = useState<{ id: string; index: number; standard: boolean }[]>([]);
  // what your pad sends right now, raw (button numbers held, stick values, and
  // whether the browser's updating it at all) — for a pad that seems dead
  const [raw, setRaw] = useState<{
    held: number[];
    axes: number[];
    fresh: boolean;
    mapping: string;
    index: number;
    of: number;
  } | null>(null);
  const seenAt = useRef<{ t: number; at: number }>({ t: -1, at: 0 });
  const [lit, setLit] = useState(0); // what's held now, on this console
  const [sticks, setSticks] = useState<number[]>([0, 0, 0, 0]);
  const keys = useRef(new Set<string>());
  const binding: Binding = bindingOf(system);
  const gp = myGamepad();
  const family = padFamily(gp?.id ?? "");
  const layout = layoutOf(gp);
  void prefs; // (re-rendered when the prefs change)

  // the pads plugged in, what's held, a press that picks a pad or lands a binding
  const listenRef = useRef(listening);
  listenRef.current = listening;
  useEffect(() => {
    const was = new Map<number, boolean[]>(); // (by index: one pad can be listed twice under one name)
    const tick = setInterval(() => {
      const all = realGamepads().filter((g): g is Gamepad => !!g?.connected);
      setPads(all.map((g) => ({ id: g.id, index: g.index, standard: g.mapping === "standard" })));
      const mine = myGamepad();
      if (mine) {
        const now = performance.now();
        if (mine.timestamp !== seenAt.current.t) seenAt.current = { t: mine.timestamp, at: now };
        setRaw({
          held: mine.buttons.flatMap((b, i) => (pressed(b) ? [i] : [])),
          axes: mine.axes.map((v) => Math.round(v * 100) / 100),
          fresh: now - seenAt.current.at < 3000,
          mapping: mine.mapping || "none",
          index: mine.index,
          of: all.length,
        });
      } else setRaw(null);
      // a pad pressed for the first time: it's the one in your hands
      for (const g of all) {
        const now = g.buttons.map(pressed);
        const before = was.get(g.index);
        if (before && now.some((p, i) => p && !before[i]) && padPrefs().device !== g.id && !listenRef.current)
          setPadPrefs({ device: g.id });
        was.set(g.index, now);
      }
      const l = listenRef.current;
      if (l?.kind === "pad") {
        const s = snap();
        const b = s.buttons.findIndex((p, i) => p && !l.base.buttons[i]);
        const a = s.axes.findIndex((v, i) => Math.abs(v) > 0.6 && Math.abs(l.base.axes[i] ?? 0) < 0.3);
        if (b >= 0) {
          bind(system, "buttons", String(b), l.control);
          setListening(null);
        } else if (a >= 0) {
          bind(system, "axes", `${a}${s.axes[a] < 0 ? "-" : "+"}`, l.control);
          setListening(null);
        } else if (performance.now() - l.since > 8000) setListening(null);
      }
      const r = readPad(system, keys.current);
      setLit(r.bits);
      setSticks(r.sticks);
    }, 60);
    return () => clearInterval(tick);
  }, [system]);

  // keys: what's held (to light it), and the one a binding waits for
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const l = listenRef.current;
      if (l?.kind === "keys" || (l && (e.code === "Escape" || e.code === "Delete" || e.code === "Backspace"))) {
        e.preventDefault();
        e.stopImmediatePropagation();
        if (e.code === "Escape") setListening(null);
        else if (e.code === "Delete" || e.code === "Backspace") {
          unbind(system, l.kind === "keys" ? "keys" : "buttons", l.control);
          if (l.kind === "pad") unbind(system, "axes", l.control);
          setListening(null);
        } else {
          bind(system, "keys", e.code, l.control);
          setListening(null);
        }
        return;
      }
      keys.current.add(e.code);
    };
    const up = (e: KeyboardEvent) => keys.current.delete(e.code);
    window.addEventListener("keydown", down, true);
    window.addEventListener("keyup", up, true);
    return () => {
      window.removeEventListener("keydown", down, true);
      window.removeEventListener("keyup", up, true);
    };
  }, [system]);

  const listen = (control: Control, kind: "keys" | "pad") =>
    setListening({ control, kind, since: performance.now(), base: snap() });
  const keyOf = (c: Control) =>
    Object.entries(binding.keys)
      .filter(([, x]) => x === c)
      .map(([k]) => keyName(k));
  const padOf = (c: Control) => [
    ...Object.entries(binding.buttons)
      .filter(([, x]) => x === c)
      .map(([i]) => buttonName(family, Number(i), layout)),
    ...Object.entries(binding.axes)
      .filter(([, x]) => x === c)
      .map(([a]) => axisName(family, a)),
  ];
  const on = (c: Control) => {
    if (isStickDir(c)) {
      const v = sticks[["lx", "ly", "rx", "ry"].indexOf(c.slice(0, 2))];
      return c[2] === "-" ? v < -40 : v > 40;
    }
    return !!(lit & bit(c));
  };

  return (
    <Panel title={t("title")} wide onClose={onClose}>
      <div className="flex flex-col gap-4 text-sm" data-testid="controllers">
        {onClose ? (
          <button type="button" className="ghost-btn text-xs self-start" onClick={onClose}>
            ← {t("back")}
          </button>
        ) : null}
        {/* your pad */}
        <section className="flex flex-col gap-1.5">
          <h3 className="mono text-xs uppercase tracking-widest" style={{ color: "var(--vfd)" }}>
            {t("yourPad")}
          </h3>
          {pads.length ? (
            <>
              <p className="text-xs" style={{ color: "var(--muted)" }}>
                {t("pickHint")}
              </p>
              {raw ? (
                <p className="mono text-[11px]" style={{ color: "var(--cream-dim)" }} data-testid="pad-raw">
                  {t("raw")}: {raw.held.length ? raw.held.map((i) => `#${i}`).join(" ") : "—"} · {t("sticksRaw")}{" "}
                  {raw.axes.map((v) => v.toFixed(2)).join(" ")} · {t("mapping")} {raw.mapping} · {t("reading")}{" "}
                  {raw.index + 1}/{raw.of} ·{" "}
                  <span style={{ color: raw.fresh ? "var(--good)" : "var(--error)" }}>
                    {raw.fresh ? t("live") : t("stale")}
                  </span>
                </p>
              ) : null}
              <div className="flex flex-col gap-1">
                {pads.map((p) => (
                  <button
                    key={p.index}
                    type="button"
                    className="deck-btn justify-start text-left"
                    style={{ height: "auto", minHeight: 32, padding: "6px 10px", fontSize: 12 }}
                    aria-pressed={gp?.id === p.id}
                    onClick={() => setPadPrefs({ device: p.id })}
                  >
                    <span className="led" /> {p.id.replace(/\s*\(.*\)\s*$/, "") || `Gamepad ${p.index + 1}`}
                    <span className="ml-2 text-[10px]" style={{ color: "var(--muted)" }}>
                      {padFamily(p.id)}
                      {p.standard ? "" : " · non-standard (bind its buttons below)"}
                    </span>
                  </button>
                ))}
              </div>
            </>
          ) : (
            <p className="text-xs" style={{ color: "var(--muted)" }}>
              {t("noPad")}
            </p>
          )}
        </section>

        {/* the consoles */}
        <section className="flex flex-col gap-2">
          <div className="flex gap-1 flex-wrap" role="tablist" aria-label={t("console")}>
            {CONSOLES.map((s) => (
              <button
                key={s}
                type="button"
                role="tab"
                aria-selected={s === system}
                className="deck-btn"
                style={{ height: 28, fontSize: 11 }}
                onClick={() => {
                  setSystem(s);
                  setListening(null);
                }}
              >
                {SYSTEMS[s].label}
              </button>
            ))}
          </div>
          <table className="w-full text-xs" style={{ borderCollapse: "separate", borderSpacing: "0 3px" }}>
            <thead>
              <tr style={{ color: "var(--muted)" }}>
                <th className="text-left font-normal">{t("control")}</th>
                <th className="text-left font-normal">{t("key")}</th>
                <th className="text-left font-normal">{t("pad")}</th>
              </tr>
            </thead>
            <tbody>
              {controlsOf(system).map((c) => {
                const k = keyOf(c);
                const p = padOf(c);
                const wait = (kind: "keys" | "pad") => listening?.control === c && listening.kind === kind;
                return (
                  <tr key={c} data-control={c}>
                    <td className="pr-2">
                      <span
                        className="mono inline-block rounded px-1.5 py-0.5"
                        style={{
                          background: on(c) ? "var(--amber)" : "var(--well)",
                          color: on(c) ? "var(--on-amber)" : "var(--cream)",
                          border: "1px solid var(--well-edge)",
                          minWidth: 46,
                        }}
                      >
                        {controlName(system, c)}
                      </span>
                    </td>
                    <td className="pr-2">
                      <button
                        type="button"
                        className="ghost-btn text-xs"
                        data-bind="key"
                        aria-pressed={wait("keys")}
                        onClick={() => listen(c, "keys")}
                      >
                        {wait("keys") ? t("press") : k.join(" / ") || t("none")}
                      </button>
                    </td>
                    <td>
                      <button
                        type="button"
                        className="ghost-btn text-xs"
                        data-bind="pad"
                        aria-pressed={wait("pad")}
                        onClick={() => listen(c, "pad")}
                      >
                        {wait("pad") ? t("pressPad") : p.join(" / ") || t("none")}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {listening ? (
            <p className="text-[11px]" style={{ color: "var(--muted)" }}>
              {t("clearHint")}
            </p>
          ) : null}
        </section>

        {/* sticks */}
        <section className="flex flex-col gap-2">
          <label className="flex items-center gap-3 text-xs">
            <span className="shrink-0">{t("deadzone")}</span>
            <input
              type="range"
              min={5}
              max={60}
              value={Math.round(padPrefs().deadzone * 100)}
              onChange={(e) => setPadPrefs({ deadzone: Number(e.target.value) / 100 })}
              className="flex-1"
            />
            <span className="mono w-10 text-right">{Math.round(padPrefs().deadzone * 100)}%</span>
          </label>
          {!hasSticks(system) ? (
            <label className="flex items-center justify-between gap-3 text-xs">
              <span>{t("dpadStick")}</span>
              <button
                type="button"
                className="deck-btn"
                style={{ height: 28, minWidth: 64 }}
                aria-pressed={padPrefs().dpadStick}
                onClick={() => setPadPrefs({ dpadStick: !padPrefs().dpadStick })}
              >
                <span className="led" /> {padPrefs().dpadStick ? "ON" : "OFF"}
              </button>
            </label>
          ) : null}
          <button type="button" className="ghost-btn text-xs self-start" onClick={() => resetBinding(system)}>
            {t("reset")}
          </button>
        </section>
      </div>
    </Panel>
  );
}
