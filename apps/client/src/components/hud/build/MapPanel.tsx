"use client";

import { MAP_MAX, MAP_MIN, MAP_SIZES } from "@yutopia/shared";
import { useEffect, useState } from "react";
import { useTr } from "@/lib/i18n";
import { hud, useHud } from "@/world/store";
import { useWorld } from "../ctx";
import { Icon } from "../icons";

export function MapPanel() {
  const t = useTr();
  const w = useWorld();
  useHud((s) => s.mapVersion);
  const pickSpawn = useHud((s) => s.build.pickSpawn);
  const cur = { width: w?.map.width ?? 48, height: w?.map.height ?? 36 };
  const [size, setSize] = useState(cur);
  // follow resizes made by someone else (or an undo)
  // biome-ignore lint/correctness/useExhaustiveDependencies: only when the studio's size changes
  useEffect(() => setSize(cur), [cur.width, cur.height]);
  const largest = MAP_SIZES[MAP_SIZES.length - 1];
  const sizeText = `${size.width}×${size.height}`;
  const changed = size.width !== cur.width || size.height !== cur.height;

  return (
    <>
      <header className="flex items-baseline justify-between px-4 pt-3 pb-2">
        <h2 className="lcd text-2xl leading-none">{t("buildMap").toUpperCase()}</h2>
        <span className="mono text-[11px] uppercase" style={{ color: "var(--muted)" }}>
          {t("buildNow")} {cur.width}×{cur.height}
        </span>
      </header>
      <div className="flex-1 min-h-0 overflow-y-auto scroll-thin px-3 pb-3 flex flex-col gap-2.5">
        <h3 className="grp">{t("buildSize")}</h3>
        {/* the sizes drawn to scale, nested from the corner */}
        <div className="vfd-window relative h-[170px] shrink-0">
          {[...MAP_SIZES].reverse().map((s) => {
            const isCur = s.width === cur.width && s.height === cur.height;
            const picked = s.width === size.width && s.height === size.height;
            return (
              <button
                key={s.key}
                type="button"
                aria-pressed={picked}
                aria-label={`${s.key} ${s.width}×${s.height}`}
                onClick={() => setSize({ width: s.width, height: s.height })}
                className="absolute left-3 bottom-3 rounded-[3px] text-right"
                style={{
                  width: `calc((100% - 24px) * ${s.width / largest.width})`,
                  height: `calc((100% - 24px) * ${s.height / largest.height})`,
                  border: picked ? "2px solid var(--vfd)" : "1px dashed rgba(203,189,156,.35)",
                  background: isCur ? "rgba(255,166,48,.10)" : "transparent",
                }}
              >
                <span
                  className="absolute right-1 top-0.5 mono text-[10px]"
                  style={{ color: picked ? "var(--vfd)" : "var(--muted)" }}
                >
                  {s.key}
                  {s.key !== "S" && ` ${s.width}×${s.height}`}
                  {isCur && ` · ${t("buildNow")}`}
                </span>
              </button>
            );
          })}
        </div>
        <div className="flex gap-2">
          {(["width", "height"] as const).map((k) => (
            <label
              key={k}
              className="flex-1 flex items-center justify-between rounded-[9px] px-2.5 h-10"
              style={{ background: "#140e0a", border: "1px solid var(--edge)" }}
            >
              <span className="mono text-[10px] uppercase" style={{ color: "var(--muted)" }}>
                {t(k === "width" ? "buildWidth" : "buildHeight")}
              </span>
              <input
                type="number"
                min={MAP_MIN}
                max={MAP_MAX}
                value={size[k]}
                onChange={(e) =>
                  setSize((s) => ({
                    ...s,
                    [k]: Math.max(MAP_MIN, Math.min(MAP_MAX, Number(e.target.value) || MAP_MIN)),
                  }))
                }
                className="lcd text-xl w-14 text-right bg-transparent outline-none"
                style={{ color: "var(--cream)", textShadow: "none" }}
              />
            </label>
          ))}
        </div>
        <button
          type="button"
          className="deck-btn w-full"
          disabled={!changed}
          onClick={() => {
            const shrink = size.width < cur.width || size.height < cur.height;
            if (!shrink || window.confirm(t("buildShrinkConfirm"))) w?.send("map:resize", size);
          }}
        >
          {t("buildResizeTo").replace("{size}", sizeText)}
        </button>
        <button
          type="button"
          className="ghost-btn w-full flex items-center justify-center gap-2"
          style={{ height: 40 }}
          aria-pressed={pickSpawn}
          onClick={() => hud.set((s) => ({ build: { ...s.build, pickSpawn: !s.build.pickSpawn } }))}
        >
          <Icon name="pin" size={16} />
          {pickSpawn ? t("buildArrivalPick") : t("buildArrival")}
        </button>
        <div className="flex-1" />
        <h3 className="grp" style={{ color: "#e79a7c" }}>
          {t("buildDanger")}
        </h3>
        <button
          type="button"
          className="ghost-btn w-full"
          style={{ height: 40, borderStyle: "dashed", borderColor: "#9e4a2e", color: "#e79a7c" }}
          onClick={() => {
            if (window.confirm(t("buildBlankConfirm").replace("{size}", sizeText))) w?.send("map:new", size);
          }}
        >
          {t("buildStartBlank")}
        </button>
      </div>
    </>
  );
}
