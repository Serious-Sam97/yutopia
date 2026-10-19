"use client";

import { useEffect } from "react";
import { useTr } from "@/lib/i18n";
import { useHud } from "@/world/store";
import { useWorld } from "./ctx";

// A floor's short name on a button and a display: G for the ground, else its number.
export const floorLabel = (level: number) => (level === 0 ? "G" : String(level));

// In an elevator's car (docs/plan/25-building-floors.md, mock 06): its panel,
// brushed steel on the right — the floors it goes to, top down, the one I'm on
// lit; a click, or G / 1–9, sends it (everyone inside rides). Esc or a step
// out of the car and it's gone.
export function LiftPanel() {
  const t = useTr();
  const w = useWorld();
  const lift = useHud((s) => s.lift);
  const floor = useHud((s) => s.floor);
  const blank = (name: string) => /^Floor \d+$/.test(name);

  useEffect(() => {
    if (!lift || !w) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const k = e.key.toLowerCase();
      const level = k === "g" ? 0 : /^[1-9]$/.test(k) ? Number(k) : null;
      if (level === null || !lift.floors.some((f) => f.level === level)) return;
      e.preventDefault();
      e.stopPropagation();
      w.send("lift:go", { id: lift.id, level });
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [lift, w]);

  if (!lift || !w) return null;
  return (
    <aside
      className="pointer-events-auto absolute right-4 top-[96px] w-[260px] rounded-[18px] p-4"
      style={{
        background: "linear-gradient(160deg,#b9bfc3,#8d9499 55%,#767d82)",
        boxShadow: "0 0 0 1.5px rgba(0,0,0,.6), inset 0 1px 0 rgba(255,255,255,.5), 0 24px 60px rgba(0,0,0,.55)",
      }}
      aria-label={t("liftTitle")}
      data-testid="lift-panel"
    >
      <div className="vfd-window flex items-center justify-between px-3 h-14 mb-3">
        <span className="lcd text-[40px] leading-none">{floorLabel(floor)}</span>
        <span className="mono text-[11px] text-right leading-tight" style={{ color: "var(--cream-dim)" }}>
          {t("liftTitle").toUpperCase()}
          <br />
          {t("floor").toUpperCase()} {floorLabel(floor)}
        </span>
      </div>
      <div className="flex flex-col gap-1.5">
        {lift.floors.map((f) => {
          const here = f.level === floor;
          return (
            <button
              key={f.level}
              type="button"
              className="flex items-center gap-3 text-left"
              onClick={() => w.send("lift:go", { id: lift.id, level: f.level })}
              aria-current={here ? "true" : undefined}
              data-floor={f.level}
            >
              <span
                className="grid place-items-center w-10 h-10 rounded-full text-[16px] font-semibold"
                style={{
                  color: here ? "#2a1a12" : "#2a2f33",
                  background: here
                    ? "radial-gradient(circle at 40% 35%,#ffe1a8,#ffa630 70%)"
                    : "radial-gradient(circle at 40% 35%,#f4f6f7,#c4cacd 70%)",
                  boxShadow: here
                    ? "0 0 0 2px #8a5a1e, 0 3px 0 #6e4714, 0 0 16px rgba(255,166,48,.8)"
                    : "0 0 0 2px #5c6367, 0 3px 0 #4c5256",
                }}
              >
                {floorLabel(f.level)}
              </span>
              <span className="leading-tight">
                <span className="block text-[13px] font-semibold" style={{ color: "#1e2326" }}>
                  {f.level === 0 ? t("floorGround") : f.name}
                </span>
                <span className="block text-[11px]" style={{ color: "#3b4246" }}>
                  {here ? t("floorHere") : blank(f.name) ? t("floorBlank") : ""}
                </span>
              </span>
            </button>
          );
        })}
      </div>
      <p className="mono text-[10.5px] mt-3" style={{ color: "#2f3539" }}>
        {t("liftKeys")}
      </p>
    </aside>
  );
}

// Which floor I'm on, beside where I am (only in a building of more than one).
export function FloorChip() {
  const t = useTr();
  const floor = useHud((s) => s.floor);
  const many = useHud((s) => s.floors.length > 1);
  if (!many) return null;
  return (
    <div
      className="vfd-window hidden sm:flex flex-col items-center justify-center px-2.5 h-10 shrink-0"
      data-testid="floor-chip"
    >
      <span className="mono text-[9px] leading-none" style={{ color: "var(--cream-dim)" }}>
        {t("floor").toUpperCase()}
      </span>
      <span className="lcd text-[24px] leading-none">{floorLabel(floor)}</span>
    </div>
  );
}
