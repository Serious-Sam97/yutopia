"use client";

import { type Key, useTr } from "@/lib/i18n";
import { hud, type PaintMode, useHud } from "@/world/store";

// Walls paint tile edges ("w:" + an edge char); floors paint tiles; doors are
// placed on a gap in a wall line.
export const WALL_SWATCHES = [
  { ch: "w:p", label: "Plaster", face: "#efe4cc", side: "#c9bb9b" },
  { ch: "w:w", label: "Walnut", face: "#6b4430", side: "#4a2f20", grain: true },
  { ch: "w:f", label: "Foam", face: "#9e4a36", side: "#743427", checker: true },
  { ch: "w:b", label: "Brick", face: "#9a4a30", side: "#713520", brick: true },
  { ch: "w:k", label: "Cork", face: "#c49a6c", side: "#9a754f", dots: true },
  { ch: "w:g", label: "Glass", face: "rgba(150,190,200,.55)", side: "rgba(110,150,160,.55)" },
] as const;
const OPENINGS = [
  { ch: "w:h", label: "Half wall" },
  { ch: "w:window", label: "Window" },
  { ch: "door", label: "Door" },
  { ch: "door:glass", label: "Glass door" },
] as const;
export const FLOOR_SWATCHES = [
  { ch: ".", label: "Wood", fill: "#8f6038", line: "#6f4527" },
  { ch: ",", label: "Carpet", fill: "#6b6a3a", line: "#5a592f" },
  { ch: "_", label: "Tile", fill: "#e6dcc4", line: "#bfb294" },
  { ch: ":", label: "Felt", fill: "#7a3b2e", line: "#5e2c22" },
  { ch: "~", label: "Stage", fill: "#2f2620", line: "#1e1814" },
  { ch: "x", label: "Grate", fill: "#4a4740", line: "#2a2824" },
  { ch: " ", label: "No floor", fill: "transparent", line: "#5c4330" },
] as const;
// what a room repaint can use (Rooms panel)
export const WALL_MATERIALS = WALL_SWATCHES.map((w) => ({ key: w.ch.slice(2), label: w.label, color: w.face }));

const MODES: [PaintMode, Key][] = [
  ["line", "buildLine"],
  ["box", "buildBox"],
  ["fill", "buildFill"],
  ["erase", "buildErase"],
];
export const MODE_HINT: Record<PaintMode, Key> = {
  line: "buildHintLine",
  box: "buildHintBox",
  fill: "buildHintFill",
  erase: "buildHintErase",
};

// A short wall seen from the room's camera: front face lit, side in shade.
function WallChip({ ch }: { ch: string }) {
  const w = WALL_SWATCHES.find((s) => s.ch === ch);
  const face = w?.face ?? "#efe4cc";
  const side = w?.side ?? "#c9bb9b";
  const front = "6,34 6,12 46,2 46,24";
  const right = "46,24 46,2 66,12 66,34";
  return (
    <svg viewBox="0 0 72 46" className="w-full max-w-[72px] h-auto" aria-hidden="true">
      <polygon points="6,34 46,24 66,34 26,44" fill="rgba(0,0,0,.28)" />
      {ch === "w:h" ? (
        <>
          <polygon points="6,34 6,24 46,14 46,24" fill="#efe4cc" stroke="#2a1a12" strokeWidth="1.2" />
          <polygon points="46,24 46,14 66,24 66,34" fill="#c9bb9b" stroke="#2a1a12" strokeWidth="1.2" />
          <polygon points="6,24 46,14 49,15.5 9,25.5" fill="#5b3a26" />
        </>
      ) : (
        <>
          <polygon points={front} fill={face} stroke="#2a1a12" strokeWidth="1.2" />
          <polygon points={right} fill={side} stroke="#2a1a12" strokeWidth="1.2" />
          {w && "grain" in w && (
            <path d="M14 30.5V10.5M22 28.5V8.5M30 26.5V6.5M38 24.5V4.5" stroke="#3e2718" strokeWidth="1" opacity=".6" />
          )}
          {w && "checker" in w && (
            <path d="M6 23 46 13M6 28.5 46 18.5M6 17.5 46 7.5" stroke="#743427" strokeWidth="2" opacity=".7" />
          )}
          {w && "brick" in w && (
            <path
              d="M6 28.5 46 18.5M6 23 46 13M6 17.5 46 7.5M16 31.5v-5.5M32 27.5V22M24 24v-5.5M12 21v-5.5M36 15.5V10"
              stroke="#e3d6b8"
              strokeWidth=".9"
              opacity=".8"
            />
          )}
          {w && "dots" in w && (
            <g fill="#8a6440" opacity=".7">
              <circle cx="14" cy="24" r="1" />
              <circle cx="24" cy="17" r="1" />
              <circle cx="34" cy="22" r="1" />
              <circle cx="38" cy="12" r="1" />
              <circle cx="18" cy="15" r="1" />
            </g>
          )}
          {ch === "w:window" && (
            <polygon points="14,26 14,14 38,8 38,20" fill="#9fb6c8" stroke="#5b3a26" strokeWidth="2" />
          )}
          {ch.startsWith("door") && (
            <>
              <polygon
                points="20,32 20,13 32,10 32,29"
                fill={ch === "door:glass" ? "#7d9aa6" : "#5b3a26"}
                stroke="#2a1a12"
                strokeWidth="1.2"
              />
              <circle cx="29.5" cy="21" r="1" fill="#c39a4a" />
            </>
          )}
          <polygon points="6,12 46,2 50,4 10,14" fill="#3e2718" />
        </>
      )}
    </svg>
  );
}

function FloorTile({ fill, line, none }: { fill: string; line: string; none?: boolean }) {
  return (
    <svg width="56" height="30" viewBox="0 0 56 30" aria-hidden="true">
      <polygon
        points="28,2 54,15 28,28 2,15"
        fill={fill}
        stroke={none ? line : "#2a1a12"}
        strokeWidth="1.2"
        strokeDasharray={none ? "3 3" : undefined}
      />
      {!none && <path d="M15 8.5 41 21.5M28 2 2 15" stroke={line} strokeWidth="1" opacity=".7" />}
    </svg>
  );
}

function Swatch({
  on,
  label,
  onClick,
  children,
}: {
  on: boolean;
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className="rounded-[9px] px-1 py-1.5 flex flex-col items-center gap-1"
      style={{
        background: on ? "rgba(255,166,48,0.10)" : "#1a120c",
        border: on ? "2px solid var(--vfd)" : "1px solid var(--edge)",
      }}
    >
      {children}
      <span
        className="mono text-[10px] uppercase tracking-wide"
        style={{ color: on ? "var(--vfd)" : "var(--cream-dim)" }}
      >
        {label}
      </span>
    </button>
  );
}

export function WallsPanel() {
  const t = useTr();
  const b = useHud((s) => s.build);
  const set = (patch: Partial<typeof b>) => hud.set((s) => ({ build: { ...s.build, ...patch } }));
  const door = b.brush.startsWith("door");
  return (
    <>
      <header className="flex items-baseline justify-between px-4 pt-3 pb-2">
        <h2 className="lcd text-2xl leading-none">{t("buildWallsFloors").toUpperCase()}</h2>
      </header>
      <div className="flex-1 min-h-0 overflow-y-auto scroll-thin px-3 pb-3 space-y-2.5">
        <fieldset className="seg min-w-0" aria-label="Paint mode">
          {MODES.map(([m, label]) => (
            <button
              key={m}
              type="button"
              aria-pressed={!door && b.paintMode === m}
              disabled={door}
              onClick={() => set({ paintMode: m })}
            >
              {t(label)}
            </button>
          ))}
        </fieldset>
        <h3 className="grp">{t("buildWalls")}</h3>
        <div className="grid grid-cols-3 gap-[7px]">
          {WALL_SWATCHES.map((w) => (
            <Swatch key={w.ch} on={b.brush === w.ch} label={w.label} onClick={() => set({ brush: w.ch })}>
              <WallChip ch={w.ch} />
            </Swatch>
          ))}
        </div>
        <h3 className="grp">{t("buildOpenings")}</h3>
        <div className="grid grid-cols-4 gap-[6px]">
          {OPENINGS.map((o) => (
            <Swatch key={o.ch} on={b.brush === o.ch} label={o.label} onClick={() => set({ brush: o.ch })}>
              <WallChip ch={o.ch} />
            </Swatch>
          ))}
        </div>
        <h3 className="grp">{t("buildFloors")}</h3>
        <div className="grid grid-cols-4 gap-[6px]">
          {FLOOR_SWATCHES.map((f) => (
            <Swatch key={f.ch} on={b.brush === f.ch} label={f.label} onClick={() => set({ brush: f.ch })}>
              <FloorTile fill={f.fill} line={f.line} none={f.ch === " "} />
            </Swatch>
          ))}
        </div>
        <p className="text-xs leading-relaxed" style={{ color: "var(--muted)" }}>
          {t(door ? "buildHintDoor" : MODE_HINT[b.paintMode])} {b.brush === "w:window" ? t("buildWindowsOuter") : ""}
        </p>
      </div>
    </>
  );
}
