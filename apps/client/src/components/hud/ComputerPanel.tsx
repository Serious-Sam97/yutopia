"use client";

import { BOOT_FALLBACK_MS, isEra, isPhase } from "@yutopia/shared/computer";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { useLang } from "@/lib/i18n";
import { hud } from "@/world/store";
import { useWorld } from "./ctx";

// A computer in the studio, up close (docs/plan/19-vortexos.md): the real
// VortexOS — the live one at vortex.serious-sam.dev — inside a drawn 1987
// monitor. The OS tells us what it shows over postMessage (vortexos:*) and we
// pass it on to the room, so everyone sees it on the glass; an OS that says
// nothing (an older VortexOS) gets a timeline of our own. Standing up asks it
// to save first (yutopia:bye → vortexos:bye), then the monitor goes off.

const DEFAULT_OS = process.env.NEXT_PUBLIC_VORTEXOS_URL ?? "https://vortex.serious-sam.dev";
function osUrl(): string {
  // (dev: another VortexOS, e.g. a local one, per browser)
  try {
    const own = localStorage.getItem("yutopia:vortexos");
    if (own && /^https?:\/\//.test(own)) return own.replace(/\/$/, "");
  } catch {}
  return DEFAULT_OS.replace(/\/$/, "");
}

const T = {
  title: ["Computer", "Computador"],
  standUp: ["Stand up", "Levantar"],
  full: ["Full screen", "Tela cheia"],
  saving: ["Saving…", "Salvando…"],
  noSignal: ["NO SIGNAL", "SEM SINAL"],
  retry: ["Try again", "Tentar de novo"],
  noSignalHint: ["VortexOS didn't answer.", "O VortexOS não respondeu."],
} as const;
type Word = keyof typeof T;

export function ComputerPanel({ objectId }: { objectId: string }) {
  const w = useWorld();
  const pt = useLang() === "pt";
  const t = (k: Word) => T[k][pt ? 1 : 0];
  const frame = useRef<HTMLIFrameElement>(null);
  const screen = useRef<HTMLDivElement>(null);
  const [base] = useState(osUrl);
  const origin = new URL(base).origin;
  const [loaded, setLoaded] = useState(false);
  // (the NO SIGNAL timer reads this: state in its closure would be the first render's)
  const loadedRef = useRef(false);
  const [failed, setFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const bridged = useRef(false);
  const state = useRef<{ phase: string; era?: string; app?: string; user?: string }>({ phase: "boot" });
  const closing = useRef(false);

  const report = useCallback(
    (next: Partial<{ phase: string; era: string; app: string; user: string }>) => {
      const s = { ...state.current, ...next };
      const cur = state.current;
      if (s.phase === cur.phase && s.era === cur.era && s.app === cur.app && s.user === cur.user) return;
      state.current = s;
      w?.send("computer:phase", { id: objectId, phase: s.phase, era: s.era, app: s.app, user: s.user });
    },
    [w, objectId],
  );

  const close = useCallback(() => hud.set({ panel: { kind: null } }), []);

  // standing up: let the OS save (a moment at most), then the monitor goes off
  const standUp = useCallback(() => {
    if (closing.current) return;
    closing.current = true;
    if (!bridged.current || !frame.current?.contentWindow) return close();
    setSaving(true);
    report({ phase: "shutdown" });
    frame.current.contentWindow.postMessage({ type: "yutopia:bye" }, origin);
    setTimeout(close, 1800);
  }, [close, origin, report]);

  // the OS talking to us
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (e.origin !== origin || e.source !== frame.current?.contentWindow) return;
      const d = e.data as Record<string, unknown> | null;
      if (!d || typeof d !== "object" || typeof d.type !== "string") return;
      switch (d.type) {
        case "vortexos:hello": {
          bridged.current = true;
          setFailed(false);
          const name = w?.myName() ?? "";
          frame.current?.contentWindow?.postMessage({ type: "yutopia:hello", name, lang: pt ? "pt" : "en" }, origin);
          // not signed in: Yutopia vouches for us (a one-time code VortexOS trades for its own session)
          if (d.signedIn === false)
            api<{ code: string }>("/api/vortexos/handoff", { method: "POST" })
              .then((r) => frame.current?.contentWindow?.postMessage({ type: "yutopia:auth", code: r.code }, origin))
              .catch(() => {});
          if (isEra(d.era)) report({ era: d.era });
          break;
        }
        case "vortexos:phase":
          if (d.phase === "shutdown") {
            // Start ▸ Shut down inside the OS
            report({ phase: "shutdown" });
            closing.current = true;
            setTimeout(close, 1200);
          } else if (isPhase(d.phase)) report({ phase: d.phase, ...(isEra(d.era) ? { era: d.era } : {}) });
          break;
        case "vortexos:user":
          report({
            user: typeof d.username === "string" ? d.username : "",
            ...(isEra(d.era) ? { era: d.era } : {}),
          });
          break;
        case "vortexos:app":
          report({ app: typeof d.name === "string" ? d.name : "" });
          break;
        case "vortexos:bye":
          close();
          break;
      }
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [origin, w, pt, report, close]);

  // an OS that never says hello: the picture moves on by itself; no page at all: NO SIGNAL
  // biome-ignore lint/correctness/useExhaustiveDependencies: restarts on each attempt
  useEffect(() => {
    const fallback = setTimeout(() => {
      if (!bridged.current) report({ phase: "desktop" });
    }, BOOT_FALLBACK_MS);
    const dead = setTimeout(() => {
      if (!bridged.current && !loadedRef.current) setFailed(true);
    }, 12_000);
    return () => {
      clearTimeout(fallback);
      clearTimeout(dead);
    };
  }, [attempt, report]);

  // Esc on our side (focus outside the OS) stands you up; inside, Esc is the OS's
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") standUp();
    };
    window.addEventListener("keydown", onKey);
    // keys go to the OS from the start
    const focus = setTimeout(() => frame.current?.focus(), 400);
    return () => {
      window.removeEventListener("keydown", onKey);
      clearTimeout(focus);
    };
  }, [standUp]);

  const full = () => {
    const el = screen.current;
    if (!el) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void el.requestFullscreen?.().catch(() => {});
  };

  const led = saving ? "#f4a52a" : loaded ? "#7fe07a" : "#f4a52a";
  return (
    <div
      className="pointer-events-auto absolute inset-0 flex items-center justify-center bg-[#0d0906d0] sm:p-3"
      onPointerDown={(e) => e.target === e.currentTarget && standUp()}
    >
      <style>{CSS}</style>
      <section
        role="dialog"
        aria-modal="true"
        aria-label={t("title")}
        className="vx-monitor rise relative flex flex-col w-full h-full sm:w-auto sm:h-auto"
      >
        <div className="vx-bezel">
          <div ref={screen} className="vx-screen">
            <iframe
              key={attempt}
              ref={frame}
              title="VortexOS"
              src={`${base}/?host=yutopia`}
              className="absolute inset-0 h-full w-full border-0"
              style={{ background: "#000" }}
              allow="autoplay; fullscreen; gamepad; clipboard-read; clipboard-write; microphone; camera"
              onLoad={() => {
                loadedRef.current = true;
                setLoaded(true);
                setFailed(false);
              }}
            />
            {failed && (
              <div className="vx-nosignal">
                <span className="vx-nosignal-tag">{t("noSignal")}</span>
                <span>{t("noSignalHint")}</span>
                <button
                  type="button"
                  className="vx-key"
                  onClick={() => {
                    setFailed(false);
                    setLoaded(false);
                    loadedRef.current = false;
                    bridged.current = false;
                    state.current = { phase: "boot" };
                    report({ phase: "boot" });
                    setAttempt((a) => a + 1);
                  }}
                >
                  {t("retry")}
                </button>
              </div>
            )}
            <div className="vx-glass" aria-hidden />
          </div>
        </div>
        <div className="vx-chin">
          <span className="vx-badge">
            VORTEX <i>MultiSync 1489</i>
          </span>
          <span className="vx-floppy" aria-hidden />
          <span className="vx-spacer" />
          <button type="button" className="vx-key" onClick={full}>
            ⛶ <span className="hidden sm:inline">{t("full")}</span>
          </button>
          <button type="button" className="vx-key vx-power" onClick={standUp} disabled={saving}>
            <span className="vx-led" style={{ background: led, boxShadow: `0 0 6px ${led}` }} />
            {saving ? t("saving") : t("standUp")}
          </button>
        </div>
      </section>
    </div>
  );
}

// The monitor (only while this panel is open: it isn't in the page's CSS).
// Putty plastic lit from the upper left, a deep bezel round the tube, a chin
// with the badge, a floppy slot and the keys; on a phone, just the screen.
const CSS = `
.vx-monitor{background:linear-gradient(160deg,#e8dec2 0%,#d6c9a6 45%,#bfb08a 100%);border-radius:18px 18px 14px 14px;
  padding:22px 22px 10px;box-shadow:0 30px 80px #000c,inset 2px 2px 0 #f6efdc,inset -3px -4px 0 #a7986f;}
.vx-bezel{background:linear-gradient(150deg,#b9ab85,#a89a76);border-radius:12px;padding:14px;
  box-shadow:inset 3px 3px 8px #6f6447,inset -2px -2px 0 #d9ceb0;}
.vx-screen{position:relative;width:min(1024px,calc(96vw - 72px),calc((92vh - 130px) * 4 / 3));aspect-ratio:4/3;
  background:#000;border-radius:10px / 12px;overflow:hidden;box-shadow:0 0 0 2px #1b1915,0 0 22px #0009 inset;}
.vx-screen:fullscreen{width:100vw;height:100vh;border-radius:0}
.vx-glass{position:absolute;inset:0;pointer-events:none;border-radius:inherit;
  background:radial-gradient(120% 90% at 30% 15%,#ffffff14 0%,#ffffff00 40%),radial-gradient(140% 120% at 50% 50%,#0000 62%,#0007 100%);}
.vx-chin{display:flex;align-items:center;gap:12px;padding:10px 6px 4px;color:#4a4231}
.vx-badge{font:700 13px/1 Tahoma,Verdana,sans-serif;letter-spacing:.18em;color:#5d553f;text-shadow:1px 1px 0 #efe6cc}
.vx-badge i{font-weight:400;letter-spacing:.04em;font-size:11px;margin-left:6px}
.vx-floppy{width:110px;height:7px;border-radius:2px;background:#3d372a;box-shadow:inset 0 2px 2px #000a,0 1px 0 #efe6cc}
.vx-spacer{flex:1}
.vx-key{display:inline-flex;align-items:center;gap:7px;font:600 12px/1 Tahoma,Verdana,sans-serif;color:#3b3426;
  padding:7px 12px;border-radius:6px;background:linear-gradient(#efe6cc,#d2c49e);
  box-shadow:0 2px 0 #9b8c66,inset 1px 1px 0 #fff8;cursor:pointer}
.vx-key:active{transform:translateY(1px);box-shadow:0 1px 0 #9b8c66}
.vx-key:disabled{opacity:.7;cursor:default}
.vx-led{width:8px;height:8px;border-radius:50%}
.vx-nosignal{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;
  background:#06070a;color:#c8d0e0;font:14px Tahoma,Verdana,sans-serif}
.vx-nosignal-tag{font:700 26px "Courier New",monospace;color:#fff;background:#1d2bb0;padding:6px 14px;letter-spacing:.12em}
@media (max-width:640px){
  .vx-monitor{border-radius:0;padding:0;box-shadow:none;background:#111}
  .vx-bezel{padding:0;border-radius:0;box-shadow:none;flex:1;display:flex}
  .vx-screen{width:100%;height:auto;flex:1;aspect-ratio:auto;border-radius:0}
  .vx-chin{padding:8px;background:#d6c9a6}
  .vx-badge,.vx-floppy{display:none}
}
`;
