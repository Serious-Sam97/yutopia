"use client";

import { useEffect } from "react";
import { compareGraphics, KEEP_S, keepGraphics, revertGraphics, useGfxSwitch } from "@/lib/gfx-switch";
import { useTr } from "@/lib/i18n";

// "Keep these settings?" (docs/plan/91-the-big-map.md phase 10): after a graphics switch, as a game's display
// settings — the fps before and after, a countdown, hold to compare with the photograph of before (the button, or
// C held); not kept, put back by the same switch.
export function GfxConfirm() {
  const t = useTr();
  const s = useGfxSwitch();
  useEffect(() => {
    if (s.phase !== "confirm") return;
    const down = (e: KeyboardEvent) => {
      if (e.code === "KeyC" && !e.repeat) compareGraphics(true);
      else if (e.code === "Enter") keepGraphics();
      else if (e.code === "Escape") void revertGraphics();
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === "KeyC") compareGraphics(false);
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [s.phase]);
  if (s.phase !== "confirm") return null;
  return (
    <div className="fixed inset-x-0 top-20 z-[60] flex justify-center pointer-events-none">
      <div
        className="cabinet pointer-events-auto px-5 py-4 w-[min(420px,calc(100vw-32px))]"
        role="dialog"
        aria-live="polite"
      >
        <p className="mono text-[11.5px] uppercase tracking-[.06em] mb-1.5" style={{ color: "var(--amber)" }}>
          {t("gKeepTitle")}
        </p>
        <p className="text-[14px] mb-1">
          {t("gFps")}{" "}
          <span className="mono">
            {s.before} → {s.after ?? "…"}
          </span>
        </p>
        <div className="h-[3px] rounded my-2.5" style={{ background: "var(--well-edge)" }}>
          <div
            className="h-full rounded"
            style={{ width: `${(s.left / KEEP_S) * 100}%`, background: "var(--amber)", transition: "width 1s linear" }}
          />
        </div>
        <p className="text-[12.5px] mb-3" style={{ color: "var(--cream-dim)" }}>
          {t("gKeepBack").replace("{s}", String(s.left))}
        </p>
        <div className="grid grid-cols-3 gap-2">
          <button
            type="button"
            className="deck-btn"
            style={{ height: 38, fontSize: 12 }}
            aria-pressed={s.comparing}
            onPointerDown={() => compareGraphics(true)}
            onPointerUp={() => compareGraphics(false)}
            onPointerLeave={() => compareGraphics(false)}
          >
            {t("gCompare")}
          </button>
          <button
            type="button"
            className="deck-btn"
            style={{ height: 38, fontSize: 12 }}
            onClick={() => void revertGraphics()}
          >
            {t("gRevert")}
          </button>
          <button
            type="button"
            className="deck-btn"
            aria-pressed
            style={{ height: 38, fontSize: 13 }}
            onClick={() => keepGraphics()}
          >
            {t("gKeep")}
          </button>
        </div>
      </div>
    </div>
  );
}
