"use client";

import { MAP_MAX, MAP_MIN, MAP_SIZES } from "@yutopia/shared";
import { useEffect, useState } from "react";
import { type Key, useTr } from "@/lib/i18n";
import { hud, useHud } from "@/world/store";
import { useWorld } from "../ctx";
import { Icon } from "../icons";

// Little pictures of what's around the studio.
const THEMES: { key: string; label: Key; sky: string; art: React.ReactNode }[] = [
  {
    key: "clouds",
    label: "buildClouds",
    sky: "linear-gradient(#8fb3cf,#e8d9b8)",
    art: (
      <>
        <ellipse cx="30" cy="22" rx="16" ry="6" fill="#fff9" />
        <ellipse cx="70" cy="34" rx="20" ry="7" fill="#fffa" />
      </>
    ),
  },
  {
    key: "city",
    label: "buildCity",
    sky: "linear-gradient(#2a2f4a,#7a5a6a)",
    art: (
      <>
        <path d="M0 62V40h10V26h12v20h8V30h14v32zM52 62V24h10v10h10V18h12v44z" fill="#1a1622" />
        <g fill="#ffb35c">
          <rect x="14" y="30" width="2" height="2" />
          <rect x="36" y="36" width="2" height="2" />
          <rect x="76" y="24" width="2" height="2" />
          <rect x="56" y="30" width="2" height="2" />
        </g>
      </>
    ),
  },
  {
    key: "snow",
    label: "buildSnow",
    sky: "linear-gradient(#c9d6df,#f4f1ea)",
    art: (
      <>
        <path d="M0 62 22 30l14 16 20-28 22 30 22-14v28z" fill="#fff" />
        <g fill="#fff">
          <circle cx="12" cy="10" r="1.3" />
          <circle cx="44" cy="8" r="1.3" />
          <circle cx="80" cy="14" r="1.3" />
          <circle cx="64" cy="22" r="1.3" />
        </g>
      </>
    ),
  },
];

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
  const theme = w?.map.theme ?? "clouds";
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
        <h3 className="grp">{t("buildAround")}</h3>
        <div className="grid grid-cols-3 gap-[7px]">
          {THEMES.map((th) => (
            <button
              key={th.key}
              type="button"
              aria-pressed={theme === th.key}
              className="rounded-[10px] overflow-hidden text-center"
              style={{
                background: "#1a120c",
                border: theme === th.key ? "2px solid var(--vfd)" : "1px solid var(--edge)",
              }}
              onClick={() => w?.send("map:theme", { theme: th.key })}
            >
              <svg
                viewBox="0 0 100 62"
                className="block w-full h-[58px]"
                style={{ background: th.sky }}
                aria-hidden="true"
              >
                {th.art}
              </svg>
              <span
                className="block mono text-[10px] uppercase py-1"
                style={{ color: theme === th.key ? "var(--vfd)" : "var(--cream-dim)" }}
              >
                {t(th.label)}
              </span>
            </button>
          ))}
        </div>

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
