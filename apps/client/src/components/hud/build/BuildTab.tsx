"use client";

import { ROOF_PITCHES, WALL_THICKS, workingHeights } from "@yutopia/shared/structure";
import { type Key, useTr } from "@/lib/i18n";
import { type BuildPartKey, hud, useHud } from "@/world/store";
import { useWorld } from "../ctx";
import { Icon, type IconName } from "../icons";
import type { Member } from "./BuildMode";
import { ItemCard, PartItems } from "./Catalog";
import { RoomsPanel } from "./RoomsPanel";
import { BUILD_PARTS, bw, swName } from "./shop";
import { partPatch } from "./tabs";
import { ItemThumb } from "./thumbs";
import {
  DECKS,
  FLOOR_SWATCHES,
  FloorTile,
  HEIGHTS,
  MODE_HINT,
  MODES,
  OPENINGS,
  PAINTS,
  SNAP_ANGLES,
  SNAP_GRIDS,
  WALL_HINT,
  WALL_SWATCHES,
  WallChip,
} from "./WallsPanel";

// Build mode's Build tab (docs/plan/124-the-build-view.md, F3a — The Sims 3's Build mode): the structure's parts in the
// strip's left column (walls, floors, paint, roof, rooms; doors, windows, stairs from the catalog), what each draws
// with in the middle, its settings in the card.

type B = ReturnType<typeof hud.get>["build"];
const set = (patch: Partial<B>) => hud.set((s) => ({ build: { ...s.build, ...patch } }));

const PARTS: { key: BuildPartKey; icon?: IconName; face?: string; label: Key | string }[] = [
  { key: "walls", icon: "wall", label: "buildWalls" },
  { key: "floors", icon: "floor", label: "wallModeFloors" },
  { key: "paint", icon: "roller", label: "wallModePaint" },
  { key: "roof", icon: "roof", label: "wallModeRoof" },
  { key: "rooms", icon: "room", label: "buildRooms" },
  ...BUILD_PARTS.map((p) => ({ key: p.key, face: p.face, label: `bv_build_${p.key}` })),
];

export function BuildColumn({ part }: { part: BuildPartKey }) {
  const t = useTr();
  const w = useWorld();
  const label = (l: string) => (l.startsWith("bv_") ? bw(l) : t(l as Key));
  const here = PARTS.find((p) => p.key === part) ?? PARTS[0];
  return (
    <div className="flex flex-col gap-2.5 p-3 min-w-0" style={{ borderRight: "1px solid var(--glass-hair)" }}>
      <span className="gl-lab">{t("buildMode")}</span>
      <div className="grid grid-cols-4 gap-1.5">
        {PARTS.map((p) => (
          <button
            key={p.key}
            type="button"
            className="gl-tile h-[44px]"
            aria-pressed={p.key === part}
            title={label(p.label)}
            aria-label={label(p.label)}
            data-testid={`build-part-${p.key}`}
            onClick={() => {
              w?.clearRoomGhost();
              hud.set((s) => ({ build: { ...s.build, ...partPatch(s.build, p.key) } }));
            }}
          >
            {p.icon ? (
              <Icon name={p.icon} size={24} />
            ) : (
              <span className="w-[34px] h-[34px] flex items-center justify-center">
                <ItemThumb kind={p.face ?? "door"} />
              </span>
            )}
          </button>
        ))}
      </div>
      <span className="gl-title !text-[16px] mt-auto truncate">{label(here.label)}</span>
    </div>
  );
}

/** The middle of the strip for a Build part. */
export function BuildMain({ part, members }: { part: BuildPartKey; members: Member[] }) {
  if (part === "doors" || part === "windows" || part === "stairs") return <PartItems part={part} />;
  if (part === "rooms")
    return (
      <div className="flex flex-col min-h-0 min-w-0 py-1">
        <RoomsPanel members={members} />
      </div>
    );
  return <WallsMain />;
}

/** The card of the strip for a Build part. */
export function BuildCard({ part }: { part: BuildPartKey }) {
  if (part === "doors" || part === "windows" || part === "stairs") return <ItemCard />;
  return <WallsCard part={part} />;
}

function Seg<T extends string | number>({
  label,
  opts,
  on,
  pick,
  name,
  testid,
}: {
  label: string;
  opts: readonly T[];
  on: (v: T) => boolean;
  pick: (v: T) => void;
  name: (v: T) => string;
  testid?: string;
}) {
  return (
    <div className="flex items-center gap-2 min-w-0">
      <span className="gl-lab w-[64px] shrink-0">{label}</span>
      <fieldset className="gl-seg min-w-0 border-0 m-0 min-w-0" aria-label={label} data-testid={testid}>
        {opts.map((v) => (
          <button key={String(v)} type="button" className="gl-btn gl-sm" aria-pressed={on(v)} onClick={() => pick(v)}>
            {name(v)}
          </button>
        ))}
      </fieldset>
    </div>
  );
}

function WallsMain() {
  const t = useTr();
  const w = useWorld();
  const b = useHud((s) => s.build);
  useHud((s) => s.mapVersion);
  const mode = b.wallMode;
  const have = w?.structure ? workingHeights(w.structure, w.level) : [0];
  const heights = [...new Set([...have, ...(mode === "floors" ? DECKS : [])])].sort((p, q) => p - q);
  const modes = MODES.filter(([m]) => (mode === "floors" ? m !== "arc" && m !== "adjust" : m !== "fill"));
  const tile = (key: string, on: boolean, label: string, onClick: () => void, child: React.ReactNode) => (
    <button
      key={key}
      type="button"
      className="gl-tile flex-col gap-1 !justify-end pb-1.5 min-h-0"
      aria-pressed={on}
      title={label}
      onClick={onClick}
    >
      <span className="flex-1 min-h-0 flex items-center justify-center px-1.5">{child}</span>
      <span className="text-[10.5px] font-bold" style={{ color: on ? "var(--glass-ink)" : "var(--glass-dim)" }}>
        {label}
      </span>
    </button>
  );
  return (
    <div className="flex flex-col gap-2 py-2.5 px-3.5 min-w-0">
      <div className="flex items-center gap-1.5 flex-wrap">
        {(mode === "build" || mode === "select" || mode === "floors") && (
          <fieldset className="gl-seg border-0 m-0 min-w-0" aria-label={t("buildWalls")} data-testid="walls-modes">
            {modes.map(([m, label]) => (
              <button
                key={m}
                type="button"
                className="gl-btn gl-sm"
                aria-pressed={mode !== "select" && b.paintMode === m}
                onClick={() =>
                  set({ paintMode: m, ...(mode === "select" ? { wallMode: "build", freeSel: null } : {}) })
                }
              >
                {t(label)}
              </button>
            ))}
            {mode !== "floors" && (
              <button
                type="button"
                className="gl-btn gl-sm"
                aria-pressed={mode === "select"}
                onClick={() => set({ wallMode: mode === "select" ? "build" : "select", freeSel: null })}
              >
                {t("wallModeSelect")}
              </button>
            )}
          </fieldset>
        )}
        {(mode === "build" || mode === "floors") && heights.length > 1 && (
          <Seg
            label={t("workingHeight")}
            opts={heights}
            on={(v) => Math.abs((b.over ?? 0) - v) < 1e-3}
            pick={(v) => set({ over: v })}
            name={(v) => (v ? `+${v} m` : t("workingFloor"))}
            testid="walls-over"
          />
        )}
        {mode === "roof" && (
          <>
            <Seg
              label={t("roofKind")}
              opts={["flat", "gable", "hip"] as const}
              on={(v) => b.roofKind === v}
              pick={(v) => set({ roofKind: v })}
              name={(v) => t(v === "flat" ? "roofFlat" : v === "gable" ? "roofGable" : "roofHip")}
              testid="roof-kind"
            />
            {b.roofKind !== "flat" && (
              <Seg
                label={t("roofPitch")}
                opts={ROOF_PITCHES}
                on={(v) => b.roofPitch === v}
                pick={(v) => set({ roofPitch: v })}
                name={(v) => `${v}°`}
                testid="roof-pitch"
              />
            )}
          </>
        )}
      </div>
      <div
        className="flex-1 min-h-0 grid grid-rows-1 gap-2"
        style={{ gridTemplateColumns: "repeat(8, minmax(0, 1fr))" }}
      >
        {(mode === "build" || mode === "select") &&
          [...WALL_SWATCHES, ...OPENINGS].map((s) =>
            tile(s.ch, b.brush === s.ch, swName(s.label), () => set({ brush: s.ch }), <WallChip ch={s.ch} />),
          )}
        {mode === "paint" &&
          PAINTS.map((s) =>
            tile(s.ch, b.paint === s.ch.slice(2), s.label, () => set({ paint: s.ch.slice(2) }), <WallChip ch={s.ch} />),
          )}
        {mode === "floors" &&
          FLOOR_SWATCHES.map((f) =>
            tile(
              f.ch,
              b.brush === f.ch,
              swName(f.label),
              () => set({ brush: f.ch }),
              <FloorTile fill={f.fill} line={f.line} none={f.ch === " "} />,
            ),
          )}
        {mode === "roof" &&
          (["flat", "gable", "hip"] as const).map((k) =>
            tile(
              k,
              b.roofKind === k,
              t(k === "flat" ? "roofFlat" : k === "gable" ? "roofGable" : "roofHip"),
              () => set({ roofKind: k }),
              <Icon name={k === "flat" ? "wDown" : "roof"} size={38} />,
            ),
          )}
      </div>
    </div>
  );
}

function WallsCard({ part }: { part: BuildPartKey }) {
  const t = useTr();
  const b = useHud((s) => s.build);
  const mode = b.wallMode;
  const hint: Key =
    part === "rooms"
      ? "buildDrawRoomHint"
      : mode !== "build" && mode !== "floors"
        ? WALL_HINT[mode]
        : mode === "build" && b.paintMode === "line"
          ? WALL_HINT.build
          : MODE_HINT[b.paintMode];
  return (
    <div className="flex flex-col gap-2 p-3.5 min-h-0 overflow-y-auto gl-scroll">
      {mode === "build" && part === "walls" && b.paintMode !== "erase" && (
        <>
          <Seg
            label={t("wallHeight")}
            opts={HEIGHTS.map(([v]) => v)}
            on={(v) => Math.abs(b.wallHeight - v) < 1e-3}
            pick={(v) => set({ wallHeight: v })}
            name={(v) => t(HEIGHTS.find(([h]) => h === v)?.[1] ?? "hCeiling")}
            testid="walls-height"
          />
          <Seg
            label={t("wallThick")}
            opts={WALL_THICKS}
            on={(v) => Math.abs(b.wallThick - v) < 1e-6}
            pick={(v) => set({ wallThick: v })}
            name={(v) => `${v} m`}
            testid="walls-thick"
          />
          <Seg
            label={t("snapGrid")}
            opts={SNAP_GRIDS}
            on={(v) => b.snapGrid === v}
            pick={(v) => set({ snapGrid: v })}
            name={(v) => (v ? `${v} m` : t("snapOff"))}
            testid="walls-snapGrid"
          />
          <Seg
            label={t("snapAngle")}
            opts={SNAP_ANGLES}
            on={(v) => b.snapAngle === v}
            pick={(v) => set({ snapAngle: v })}
            name={(v) => (v ? `${v}°` : t("snapOff"))}
            testid="walls-snapAngle"
          />
        </>
      )}
      <p className="text-[12px] font-semibold leading-snug" style={{ color: "var(--glass-dim)" }}>
        {t(hint)}
      </p>
    </div>
  );
}
