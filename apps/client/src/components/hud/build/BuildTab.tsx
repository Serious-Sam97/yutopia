"use client";

import {
  coverKey,
  coverOf,
  FLOOR_COVERINGS,
  POOL_COPINGS,
  POOL_DEPTHS,
  POOL_TILES,
  ROOF_KINDS,
  ROOF_MATS,
  ROOF_PITCHES,
  type Roof,
  WALL_COVERINGS,
  WALL_STYLES,
  WALL_THICKS,
  workingHeights,
} from "@yutopia/shared/structure";
import { addStrings, type Key, trMaybe, useTr } from "@/lib/i18n";
import { type BuildPartKey, hud, useHud } from "@/world/store";
import { useWorld } from "../ctx";
import { Icon, type IconName } from "../icons";
import type { Member } from "./BuildMode";
import { ItemCard, PartItems } from "./Catalog";
import { ask } from "./Dialogs";
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

addStrings(
  {
    bvRoofEaves: ["Eaves", "Beiral"],
    bvRoofPickedHint: [
      "[ ] pitch · PgUp/PgDn eaves · , . overhang · the bar's kind and covering go on with the buttons · Esc lets go.",
      "[ ] inclinação · PgUp/PgDn beiral · , . aba · o tipo e a cobertura da barra entram pelos botões · Esc solta.",
    ],
    bvFoundPool: ["Pool", "Piscina"],
    bvPoolDepth: ["Depth", "Profundidade"],
    bvPoolCoping: ["Coping", "Borda"],
    bvPoolLadder: ["Ladder", "Escada"],
    bvPoolLights: ["Lights", "Luzes"],
    bvPoolHint: [
      "Drag a box in the yard: a pool dug there, its coping round it. Remove fills one in.",
      "Arraste uma caixa no quintal: uma piscina cavada ali, com borda. Remover aterra.",
    ],
    bvPoolTile_blue: ["Blue", "Azul"],
    bvPoolTile_teal: ["Teal", "Verde-água"],
    bvPoolTile_white: ["White", "Branca"],
    bvPoolTile_black: ["Black", "Preta"],
    bvPoolTile_mosaic: ["Mosaic", "Mosaico"],
    bvTint: ["Tint", "Tom"],
    bvTintOwn: ["Its own", "Original"],
    bvSelectHint: [
      "Click a wall to pick it — drag its ends, or drag it to push it. Click a room's floor to pick the room.",
      "Clique numa parede para escolher — arraste as pontas, ou arraste para empurrar. Clique no piso de um cômodo para escolher o cômodo.",
    ],
    bvRoom: ["Room", "Cômodo"],
    bv_found: ["Foundation", "Fundação"],
    bv_flights: ["Stairs", "Escadas"],
    bvFl_straight: ["Straight", "Reta"],
    bvFl_l: ["L", "L"],
    bvFl_u: ["U", "U"],
    bvFl_spiral: ["Spiral", "Caracol"],
    bvFl_ladder: ["Ship's ladder", "Escada de marinheiro"],
    bvFlWidth: ["Width", "Largura"],
    bvFlRail: ["Rail", "Corrimão"],
    bvFlRail_balusters: ["Balusters", "Balaústres"],
    bvFlRail_glass: ["Glass", "Vidro"],
    bvFlRail_iron: ["Iron", "Ferro"],
    bvFlRail_none: ["None", "Nenhum"],
    bvFlStyle_oak: ["Oak, open", "Carvalho, aberta"],
    bvFlStyle_white: ["White, closed", "Branca, fechada"],
    bvFlStyle_iron: ["Iron", "Ferro"],
    bvFlStyle_glass: ["Glass and oak", "Vidro e carvalho"],
    bvFlStyle_rustic: ["Rustic", "Rústica"],
    bvFlStyle_concrete: ["Concrete", "Concreto"],
    bvFoundBox: ["Lay", "Assentar"],
    bvFoundRemove: ["Take away", "Remover"],
    bvFoundSteps: ["Steps", "Degraus"],
    bvFoundDig: ["Dig a basement", "Cavar porão"],
    bvFoundHeight: ["Height", "Altura"],
    bvFoundSet: ["Set the house to it", "Pôr a casa nela"],
    bvFound_stone: ["Fieldstone", "Pedra"],
    bvFound_brick: ["Brick", "Tijolo"],
    bvFound_concrete: ["Concrete", "Concreto"],
    bvFound_stucco: ["Stucco", "Reboco"],
    bvFound_logs: ["Logs", "Toras"],
    bvFound_deck: ["Deck on posts", "Deque em pilares"],
    bvStyle_picket: ["Picket fence", "Cerca de estacas"],
    bvStyle_iron: ["Iron fence", "Grade de ferro"],
    bvStyle_ranch: ["Ranch fence", "Cerca de fazenda"],
    bvStyle_lattice: ["Lattice screen", "Treliça"],
    bvStyle_hedge: ["Hedge", "Cerca viva"],
    bvStyle_stone: ["Stone wall", "Muro de pedra"],
    bvStyle_rail: ["Porch rail", "Guarda-corpo"],
    bvStyle_glassrail: ["Glass rail", "Guarda-corpo de vidro"],
    bvStyle_ironrail: ["Iron rail", "Corrimão de ferro"],
    bvStyle_spandrel: ["Spandrel", "Lambrequim"],
    bvStyle_gate: ["Gate", "Portão"],
    bvRoomTurn: ["Turn", "Girar"],
    bvRoomCopy: ["Copy", "Copiar"],
    bvRoomRemove: ["Knock down", "Demolir"],
    bvRoomRemoveAsk: ["Knock this room down, and everything in it?", "Demolir este cômodo, e tudo nele?"],
    bvRoomHint: [
      "Drag its floor to move it · Alt drags a copy · R turns it · Delete knocks it down",
      "Arraste o piso para mover · Alt arrasta uma cópia · R gira · Delete demole",
    ],
  },
  "yutopia-build",
);
const hw = (k: string) => trMaybe(k) ?? k;

// (plan 130) a fence's, a rail's picture for its tile
const STYLE_ART: Record<string, string> = {
  picket:
    "M8 34V14l2-3 2 3v20M16 34V14l2-3 2 3v20M24 34V14l2-3 2 3v20M32 34V14l2-3 2 3v20M40 34V14l2-3 2 3v20M6 18h38M6 28h38",
  iron: "M8 34V8M14 34V10M20 34V10M26 34V10M32 34V10M38 34V8M6 12h34M6 30h34",
  ranch: "M8 34V10M40 34V10M6 14h36v4H6zM6 22h36v4H6zM6 30h36v3H6z",
  lattice: "M6 6h36v28H6zM6 13h36M6 20h36M6 27h36M13 6v28M20 6v28M27 6v28M34 6v28",
  hedge: "M6 34V14c4-6 8-6 12-2 4-5 8-5 12 0 4-4 8-4 12 2v20z",
  stone: "M6 34V18h36v16zM6 26h36M14 18v8M26 18v8M20 26v8M34 26v8",
  rail: "M6 16h36v3H6zM6 30h36v2H6zM10 19v11M15 19v11M20 19v11M25 19v11M30 19v11M35 19v11",
  glassrail: "M6 14h36v3H6zM8 17h32v14H8zM8 17v14M40 17v14",
  ironrail: "M6 14h36M6 30h36M10 14v16M15 14v16M20 14v16M25 14v16M30 14v16M35 14v16",
  spandrel: "M6 6h36v5H6zM6 11c0 10 36 10 36 0M12 11v5M18 11v8M24 11v9M30 11v8M36 11v5",
  gate: "M8 34V8h4v26M36 34V8h4v26M12 16c4-4 20-4 24 0v18H12zM18 16v18M24 14v20M30 16v18",
};
function StyleChip({ style }: { style: string }) {
  return (
    <svg viewBox="0 0 48 40" className="w-[64%] h-auto" aria-hidden="true">
      <path
        d={STYLE_ART[style] ?? STYLE_ART.picket}
        fill={style === "hedge" ? "#4f7a40" : style === "glassrail" ? "#dff1fb" : "#f4f3ef"}
        stroke="#123e6a"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  );
}

type B = ReturnType<typeof hud.get>["build"];
const set = (patch: Partial<B>) => hud.set((s) => ({ build: { ...s.build, ...patch } }));

const PARTS: { key: BuildPartKey; icon?: IconName; face?: string; label: Key | string }[] = [
  { key: "found", icon: "found", label: "bv_found" },
  { key: "flights", icon: "stairs", label: "bv_flights" },
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
  if (part === "doors" || part === "windows" || part === "stairs" || part === "columns" || part === "porches")
    return <PartItems part={part} />;
  if (part === "found") return <FoundMain />;
  if (part === "flights") return <FlightMain />;
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
  if (part === "doors" || part === "windows" || part === "stairs" || part === "columns" || part === "porches")
    return <ItemCard />;
  if (part === "found") return <FoundCard />;
  if (part === "flights") return <FlightCard />;
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
  // (plan 130: the tile brush's four, the floors' alone)
  const TILE_MODES = ["tile", "half", "quarter", "tri", "hole"];
  const modes = MODES.filter(([m]) =>
    mode === "floors" ? m !== "arc" && m !== "adjust" : m !== "fill" && !TILE_MODES.includes(m),
  );
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
  // (plan 130 phase 9) a covering's tint: the one picked re-keyed with it
  const retint = (c: string | null) => {
    const pw = coverOf(b.paint, "wall");
    const pf = coverOf(b.brush, "floor");
    set({
      coverTint: c,
      ...(pw ? { paint: coverKey(pw.id, c) } : {}),
      ...(pf ? { brush: coverKey(pf.id, c) } : {}),
    });
  };
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
        {(mode === "paint" || mode === "floors") && (
          <fieldset
            className="flex items-center gap-1.5 border-0 m-0 min-w-0"
            aria-label="tint"
            data-testid="cover-tint"
          >
            <span className="gl-lab w-[44px] shrink-0">{hw("bvTint") || "Tint"}</span>
            <button
              type="button"
              className="gl-btn gl-sm !px-1.5"
              aria-pressed={!b.coverTint}
              onClick={() => retint(null)}
            >
              {hw("bvTintOwn") || "Its own"}
            </button>
            {TINTS.map((c) => (
              <button
                key={c}
                type="button"
                className="w-[18px] h-[18px] rounded-full shrink-0"
                style={{
                  background: c,
                  boxShadow:
                    b.coverTint === c
                      ? "0 0 0 2px var(--glass-hi), 0 0 0 4px var(--glass-acc)"
                      : "0 1px 3px rgba(0,0,0,.35)",
                }}
                aria-label={c}
                aria-pressed={b.coverTint === c}
                onClick={() => retint(c)}
              />
            ))}
          </fieldset>
        )}
        {mode === "roof" && (
          <>
            {b.roofKind !== "flat" && b.roofKind !== "chimney" && (
              <Seg
                label={t("roofPitch")}
                opts={ROOF_PITCHES}
                on={(v) => b.roofPitch === v}
                pick={(v) => set({ roofPitch: v })}
                name={(v) => `${v}°`}
                testid="roof-pitch"
              />
            )}
            {b.roofKind !== "flat" && b.roofKind !== "dormer" && b.roofKind !== "chimney" && (
              <Seg
                label={t("roofOverhang")}
                opts={ROOF_OVERS}
                on={(v) => Math.abs(b.roofOver - v) < 1e-3}
                pick={(v) => set({ roofOver: v })}
                name={(v) => `${v} m`}
                testid="roof-over"
              />
            )}
            <button
              type="button"
              className="gl-btn gl-sm"
              data-testid="roof-auto"
              disabled={b.roofKind === "dormer" || b.roofKind === "chimney"}
              onClick={() => w?.build?.autoRoof()}
            >
              <Icon name="roof" size={14} /> {t("roofAuto")}
            </button>
          </>
        )}
      </div>
      <div
        className={`flex-1 min-h-0 grid gap-2 ${mode === "build" || mode === "roof" || mode === "paint" || mode === "floors" ? "grid-rows-2" : "grid-rows-1"} ${mode === "paint" || mode === "floors" ? "grid-flow-col overflow-x-auto gl-scroll" : ""}`}
        style={
          mode === "paint" || mode === "floors"
            ? { gridAutoColumns: "84px" }
            : { gridTemplateColumns: `repeat(${mode === "build" ? 9 : mode === "roof" ? 12 : 8}, minmax(0, 1fr))` }
        }
      >
        {(mode === "build" || mode === "select") &&
          [...WALL_SWATCHES, ...OPENINGS].map((s) =>
            tile(s.ch, b.brush === s.ch, swName(s.label), () => set({ brush: s.ch }), <WallChip ch={s.ch} />),
          )}
        {/* (plan 130) fences, rails, a spandrel, a gate: drawn with the same Line and Box */}
        {mode === "build" &&
          Object.entries(WALL_STYLES).map(([k, st]) =>
            tile(
              `s:${k}`,
              b.brush === `s:${k}`,
              hw(`bvStyle_${k}`) || st.label,
              () => set({ brush: `s:${k}` }),
              <StyleChip style={k} />,
            ),
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
        {/* (plan 130 phase 9) the coverings: a wall's (Paint, by the stretch) and a floor's (the tile brush) */}
        {mode === "paint" &&
          WALL_COVERINGS.map((q) =>
            tile(
              `c:${q.id}`,
              coverOf(b.paint, "wall")?.id === q.id,
              q.label,
              () => set({ paint: coverKey(q.id, b.coverTint) }),
              <CoverChip mat={q.mat} tint={b.coverTint ?? q.color} />,
            ),
          )}
        {mode === "floors" &&
          FLOOR_COVERINGS.map((q) =>
            tile(
              `c:${q.id}`,
              coverOf(b.brush, "floor")?.id === q.id,
              q.label,
              () =>
                set({
                  brush: coverKey(q.id, b.coverTint),
                  // (a covering's laid tile by tile: the tile brush)
                  ...(["tile", "half", "quarter", "tri"].includes(b.paintMode) ? {} : { paintMode: "tile" as const }),
                }),
              <CoverChip mat={q.mat} tint={b.coverTint ?? q.color} />,
            ),
          )}
        {mode === "roof" &&
          ROOF_KINDS.map((k) =>
            tile(k, b.roofKind === k, t(ROOF_NAME[k]), () => set({ roofKind: k }), <RoofChip kind={k} />),
          )}
        {/* (plan 130 phase 7) what it's covered with */}
        {mode === "roof" &&
          Object.entries(ROOF_MATS).map(([k, c]) =>
            tile(
              `m:${k}`,
              b.roofMat === k,
              t(`roofMat_${k}` as Key),
              () => set({ roofMat: k }),
              <RoofSwatch mat={k} tint={c} />,
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
  if (mode === "roof" && b.roofSel) return <RoofPicked id={b.roofSel} />;
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
      {mode === "select" && b.roomSel && <RoomCard roomKey={b.roomSel} />}
      <p className="text-[12px] font-semibold leading-snug" style={{ color: "var(--glass-dim)" }}>
        {mode === "select" ? hw("bvSelectHint") : t(hint)}
      </p>
    </div>
  );
}

// (plan 130 phase 5) the Foundation part: what a drag or a click does, the pads' sides (pictures of them)
const FOUND_PIC: Record<string, string> = {
  stone: "repeating-linear-gradient(0deg,#8f897e 0 9px,#6f6a61 9px 10px),#8f897e",
  brick: "repeating-linear-gradient(0deg,#9a4a35 0 5px,#d8d2c6 5px 6px)",
  concrete: "linear-gradient(#b7b4ad,#a6a39c)",
  stucco: "linear-gradient(#e3d7bd,#d2c5a8)",
  logs: "repeating-linear-gradient(0deg,#8a5e3a 0 10px,#5e3e24 10px 12px)",
  deck: "repeating-linear-gradient(90deg,#8a6a48 0 6px,transparent 6px 16px),linear-gradient(#5e4630,#5e4630) bottom/100% 22% no-repeat",
};
function FoundMain() {
  const b = useHud((s) => s.build);
  const setB = (p: Partial<B>) => hud.set((s) => ({ build: { ...s.build, ...p } }));
  return (
    <div className="flex flex-col gap-2.5 p-3 min-h-0 min-w-0" data-testid="found-main">
      <div className="flex gap-1.5 flex-wrap">
        {(["box", "remove", "steps", "dig", "pool"] as const).map((m) => (
          <button
            key={m}
            type="button"
            className="gl-btn gl-sm"
            aria-pressed={b.foundMode === m}
            data-testid={`found-mode-${m}`}
            onClick={() => setB({ foundMode: m })}
          >
            <Icon
              name={
                m === "pool"
                  ? "pool"
                  : m === "dig"
                    ? "basement"
                    : m === "steps"
                      ? "stairs"
                      : m === "remove"
                        ? "bin"
                        : "found"
              }
              size={14}
            />
            {hw(
              m === "box"
                ? "bvFoundBox"
                : m === "remove"
                  ? "bvFoundRemove"
                  : m === "steps"
                    ? "bvFoundSteps"
                    : m === "pool"
                      ? "bvFoundPool"
                      : "bvFoundDig",
            )}
          </button>
        ))}
      </div>
      <div
        className="flex-1 min-h-0 grid grid-rows-1 gap-2"
        style={{ gridTemplateColumns: "repeat(6, minmax(0, 1fr))" }}
      >
        {b.foundMode === "pool" &&
          Object.entries(POOL_TILES).map(([k, c]) => (
            <button
              key={k}
              type="button"
              className="gl-tile flex-col gap-1 !justify-end pb-1.5 min-h-0"
              aria-pressed={b.pool.tile === k}
              data-testid={`pool-tile-${k}`}
              onClick={() => setB({ pool: { ...b.pool, tile: k } })}
            >
              <span
                className="flex-1 min-h-0 w-[70%] my-2 rounded-md"
                style={{
                  background: `repeating-linear-gradient(0deg,#0002 0 1px,transparent 1px 9px),repeating-linear-gradient(90deg,#0002 0 1px,transparent 1px 9px),#${c.toString(16).padStart(6, "0")}`,
                  boxShadow: "inset 0 0 0 1px rgba(0,0,0,.2)",
                }}
              />
              <span className="text-[10.5px] font-bold">{hw(`bvPoolTile_${k}`)}</span>
            </button>
          ))}
        {b.foundMode !== "pool" &&
          Object.keys(FOUND_PIC).map((k) => (
            <button
              key={k}
              type="button"
              className="gl-tile flex-col gap-1 !justify-end pb-1.5 min-h-0"
              aria-pressed={b.foundStyle === k}
              data-testid={`found-style-${k}`}
              onClick={() => setB({ foundStyle: k, foundMode: "box" })}
            >
              <span
                className="flex-1 min-h-0 w-[70%] my-2 rounded-md"
                style={{ background: FOUND_PIC[k], boxShadow: "inset 0 0 0 1px rgba(0,0,0,.2)" }}
              />
              <span className="text-[10.5px] font-bold">{hw(`bvFound_${k}`)}</span>
            </button>
          ))}
      </div>
    </div>
  );
}
function FoundCard() {
  const t = useTr();
  const w = useWorld();
  const b = useHud((s) => s.build);
  useHud((s) => s.mapVersion);
  const f = w?.structure?.floors.find((q) => q.index === w.level);
  const has = (f?.found ?? 0) > 0;
  const setH = (v: number) => {
    hud.set((s) => ({ build: { ...s.build, foundHeight: v } }));
    if (has && w) w.send("struct:found", { level: w.level, height: v });
  };
  const setP = (p: Partial<B["pool"]>) => hud.set((s) => ({ build: { ...s.build, pool: { ...s.build.pool, ...p } } }));
  if (b.foundMode === "pool")
    return (
      <div className="flex flex-col gap-2 p-3.5 min-h-0 overflow-y-auto gl-scroll" data-testid="pool-card">
        <Seg
          label={hw("bvPoolDepth")}
          opts={POOL_DEPTHS}
          on={(v) => b.pool.depth === v}
          pick={(v) => setP({ depth: v })}
          name={(v) => `${v} m`}
          testid="pool-depth"
        />
        <Seg
          label={hw("bvPoolCoping")}
          opts={POOL_COPINGS}
          on={(v) => b.pool.coping === v}
          pick={(v) => setP({ coping: v })}
          name={(v) => hw(`bvFound_${v === "wood" ? "deck" : v}`)}
          testid="pool-coping"
        />
        <Seg
          label={hw("bvPoolLadder")}
          opts={[-1, 0, 1, 2, 3] as const}
          on={(v) => b.pool.ladder === v}
          pick={(v) => setP({ ladder: v })}
          name={(v) => (v < 0 ? "—" : ["N", "E", "S", "W"][v])}
          testid="pool-ladder"
        />
        <Seg
          label={hw("bvPoolLights")}
          opts={["on", "off"] as const}
          on={(v) => (v === "on") === b.pool.lights}
          pick={(v) => setP({ lights: v === "on" })}
          name={(v) => (v === "on" ? "✓" : "—")}
          testid="pool-lights"
        />
        <p className="text-[12px] font-semibold leading-snug" style={{ color: "var(--glass-dim)" }}>
          {hw("bvPoolHint")}
        </p>
      </div>
    );
  return (
    <div className="flex flex-col gap-2 p-3.5 min-h-0 overflow-y-auto gl-scroll">
      <Seg
        label={hw("bvFoundHeight")}
        opts={[0.25, 0.5, 0.75, 1, 1.5] as const}
        on={(v) => Math.abs((has ? (f?.found ?? 0) : b.foundHeight) - v) < 1e-3}
        pick={setH}
        name={(v) => `${v}`}
        testid="found-height"
      />
      <p className="text-[12px] font-semibold leading-snug" style={{ color: "var(--glass-dim)" }}>
        {t("buildHintFound")}
      </p>
    </div>
  );
}

// (plan 130 phase 6) the stair tool: its shapes (pictures), its looks; width and rail in the card
const FLIGHT_ART: Record<string, string> = {
  straight: "M10 36V6h12v30zM10 30h12M10 24h12M10 18h12M10 12h12",
  l: "M6 36V18h12v18zM6 30h12M6 24h12M6 18h28V6H18v12M24 6v12M30 6v12",
  u: "M6 36V12h12v24zM6 30h12M6 24h12M6 12V4h28v8M22 36V12h12v24zM22 30h12M22 24h12",
  spiral: "M24 22a12 12 0 1 1-0.1 0zM24 22l12-6M24 22l10 8M24 22l2 12M24 22l-8 9M24 22l-12-1M24 22l-8-9M24 22l2-12",
  ladder: "M14 36V4M30 36V4M14 10h16M14 16h16M14 22h16M14 28h16M14 34h16",
};
const FLIGHT_LOOK: Record<string, string> = {
  oak: "linear-gradient(#b98a5a,#9a6a40)",
  white: "linear-gradient(#f1efe8,#d9d5cb)",
  iron: "linear-gradient(#3a3c40,#26282c)",
  glass: "linear-gradient(135deg,#e2f2fb,#b9884f)",
  rustic: "linear-gradient(#8a6a48,#5e4630)",
  concrete: "linear-gradient(#b7b4ad,#9e9b94)",
};
function FlightMain() {
  const b = useHud((s) => s.build);
  const setF = (p: Partial<B["flight"]>) =>
    hud.set((s) => ({ build: { ...s.build, flight: { ...s.build.flight, ...p } } }));
  return (
    <div className="flex flex-col gap-2 p-3 min-h-0 min-w-0" data-testid="flight-main">
      <div
        className="flex-1 min-h-0 grid grid-rows-2 gap-2"
        style={{ gridTemplateColumns: "repeat(6, minmax(0, 1fr))" }}
      >
        {Object.keys(FLIGHT_ART).map((k) => (
          <button
            key={k}
            type="button"
            className="gl-tile flex-col gap-1 !justify-end pb-1.5 min-h-0"
            aria-pressed={b.flight.shape === k}
            data-testid={`flight-shape-${k}`}
            onClick={() => setF({ shape: k as B["flight"]["shape"] })}
          >
            <svg viewBox="0 0 40 40" className="w-[56%] h-auto" aria-hidden="true">
              <path d={FLIGHT_ART[k]} fill="#cfe3f5" stroke="#123e6a" strokeWidth="1.4" strokeLinejoin="round" />
            </svg>
            <span className="text-[10.5px] font-bold">{hw(`bvFl_${k}`)}</span>
          </button>
        ))}
        {Object.keys(FLIGHT_LOOK).map((k) => (
          <button
            key={k}
            type="button"
            className="gl-tile flex-col gap-1 !justify-end pb-1.5 min-h-0"
            aria-pressed={b.flight.style === k}
            data-testid={`flight-style-${k}`}
            onClick={() => setF({ style: k })}
          >
            <span className="flex-1 min-h-0 w-[64%] my-2 rounded-md" style={{ background: FLIGHT_LOOK[k] }} />
            <span className="text-[10.5px] font-bold">{hw(`bvFlStyle_${k}`)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
function FlightCard() {
  const t = useTr();
  const b = useHud((s) => s.build);
  const setF = (p: Partial<B["flight"]>) =>
    hud.set((s) => ({ build: { ...s.build, flight: { ...s.build.flight, ...p } } }));
  return (
    <div className="flex flex-col gap-2 p-3.5 min-h-0 overflow-y-auto gl-scroll">
      <Seg
        label={hw("bvFlWidth")}
        opts={[0.8, 1, 1.3] as const}
        on={(v) => Math.abs(b.flight.width - v) < 1e-3}
        pick={(v) => setF({ width: v })}
        name={(v) => `${v} m`}
        testid="flight-width"
      />
      <Seg
        label={hw("bvFlRail")}
        opts={["balusters", "glass", "iron", "none"] as const}
        on={(v) => b.flight.rail === v}
        pick={(v) => setF({ rail: v })}
        name={(v) => hw(`bvFlRail_${v}`)}
        testid="flight-rail"
      />
      <p className="text-[12px] font-semibold leading-snug" style={{ color: "var(--glass-dim)" }}>
        {t("buildHintFlights")}
      </p>
    </div>
  );
}

// (plan 130 phase 2) the picked room: what it is, turned, copied, knocked down; moved by dragging its floor
function RoomCard({ roomKey }: { roomKey: string }) {
  const w = useWorld();
  useHud((s) => s.mapVersion);
  const r = w?.structure?.rooms.find((q) => q.key === roomKey);
  if (!w || !r) return null;
  const [x0, y0, x1, y1] = r.rect;
  const house = w.build?.house;
  return (
    <div className="flex flex-col gap-2" data-testid="room-card">
      <div className="flex items-baseline justify-between gap-2">
        <b className="gl-title !text-[17px] truncate">{String(r.props.name ?? hw("bvRoom"))}</b>
        <span className="gl-lab">
          {Math.round((x1 - x0) * 10) / 10} × {Math.round((y1 - y0) * 10) / 10} m
        </span>
      </div>
      <div className="flex gap-1.5 flex-wrap">
        <button type="button" className="gl-btn gl-sm" data-testid="room-turn" onClick={() => house?.turn()}>
          <Icon name="rotate" size={14} /> {hw("bvRoomTurn")}
        </button>
        <button type="button" className="gl-btn gl-sm" data-testid="room-copy" onClick={() => house?.copy()}>
          <Icon name="copy" size={14} /> {hw("bvRoomCopy")}
        </button>
        <button
          type="button"
          className="gl-btn gl-sm gl-bad"
          data-testid="room-remove"
          onClick={() => void ask(hw("bvRoomRemoveAsk"), true).then((ok) => ok && house?.remove())}
        >
          <Icon name="bin" size={14} /> {hw("bvRoomRemove")}
        </button>
      </div>
      <p className="text-[12px] font-semibold leading-snug" style={{ color: "var(--glass-dim)" }}>
        {hw("bvRoomHint")}
      </p>
    </div>
  );
}

// (plan 130 phase 7) the Roof part's kinds and coverings
const ROOF_OVERS = [0, 0.3, 0.6, 1] as const;
const ROOF_NAME: Record<Roof["kind"], Key> = {
  flat: "roofFlat",
  gable: "roofGable",
  hip: "roofHip",
  shed: "roofShed",
  halfhip: "roofHalfhip",
  mansard: "roofMansard",
  gambrel: "roofGambrel",
  dutch: "roofDutch",
  round: "roofRound",
  dormer: "roofDormer",
  chimney: "roofChimney",
};
// (each kind's end on, as a line: a little house's walls under it)
const ROOF_PATH: Record<Roof["kind"], string> = {
  flat: "M6 17 H34 V20 H6 Z",
  gable: "M4 20 L20 7 L36 20",
  hip: "M4 20 L13 9 H27 L36 20",
  shed: "M4 20 L36 8 V20",
  halfhip: "M4 20 L15 10 L20 7 L25 10 L36 20 M15 10 H25",
  mansard: "M5 20 L9 10 H31 L35 20",
  gambrel: "M4 20 L9 11 L20 6 L31 11 L36 20",
  dutch: "M4 20 L11 13 H29 L36 20 M14 13 L20 7 L26 13",
  round: "M4 20 Q4 6 20 6 Q36 6 36 20",
  dormer: "M2 22 L20 8 L38 22 M14 17 V12 L18 9 L22 12 V17 M16 15 H20",
  chimney: "M4 22 L20 10 L36 22 M25 16 V5 H30 V20",
};
function RoofChip({ kind }: { kind: Roof["kind"] }) {
  return (
    <svg viewBox="0 0 40 30" width="44" height="33" aria-hidden="true">
      <path d="M8 20 V28 H32 V20" fill="none" stroke="var(--glass-dim)" strokeWidth="1.6" />
      <path d={ROOF_PATH[kind]} fill="none" stroke="var(--glass-ink)" strokeWidth="2.4" strokeLinejoin="round" />
    </svg>
  );
}
function RoofSwatch({ mat, tint }: { mat: string; tint: number }) {
  const base = mat === "slate" ? 0x59616b : mat === "tar" ? 0x3c3c3c : tint;
  const c = `#${base.toString(16).padStart(6, "0")}`;
  const metal = mat === "metal" || mat === "copper";
  return (
    <svg viewBox="0 0 40 30" width="44" height="33" aria-hidden="true">
      <rect x="2" y="2" width="36" height="26" rx="4" fill={c} />
      {metal
        ? [8, 16, 24, 32].map((x) => <path key={x} d={`M${x} 2 V28`} stroke="#0003" strokeWidth="2" />)
        : [8, 14, 20, 26].map((y, i) => (
            <path
              key={y}
              d={`M2 ${y} H38 ${[...Array(6)].map((_, j) => `M${(j * 7 + (i % 2) * 3.5 + 2).toFixed(1)} ${y - 6} V${y}`).join(" ")}`}
              stroke="#0004"
              strokeWidth="1"
            />
          ))}
    </svg>
  );
}

// (plan 130 phase 9) the coverings' tints offered, and a covering's chip: its tint and a hint of its pattern
const TINTS = [
  "#f4f1ea",
  "#e8dcc4",
  "#d9c4a0",
  "#c8795a",
  "#a14a44",
  "#e3b7ad",
  "#a9b89a",
  "#5d7058",
  "#9fb6cf",
  "#2f3f5a",
  "#6e4a63",
  "#8a6448",
  "#4a4a4c",
];
function CoverChip({ mat, tint }: { mat: string; tint: string }) {
  const line = "rgba(0,0,0,.22)";
  const lines: string[] = [];
  if (mat === "brick" || mat === "tile-wall" || mat === "tile-floor" || mat === "fieldstone" || mat === "limestone") {
    const rows = mat === "brick" ? 6 : 4;
    for (let r = 1; r < rows; r++) lines.push(`M2 ${2 + (26 / rows) * r} H38`);
    for (let r = 0; r < rows; r++)
      for (let k = 1; k < (mat === "brick" ? 4 : 4); k++) {
        const x = 2 + (36 / 4) * k + (mat === "brick" && r % 2 ? 4.5 : 0);
        lines.push(`M${x.toFixed(1)} ${2 + (26 / rows) * r} V${2 + (26 / rows) * (r + 1)}`);
      }
  } else if (mat === "clapboard" || mat === "shingle-wall" || mat === "floor-oak" || mat === "floor-walnut")
    for (let r = 1; r < 6; r++) lines.push(`M2 ${2 + (26 / 6) * r} H38`);
  else if (mat === "batten" || mat === "wallpaper-stripe" || mat === "corrugated" || mat === "panel")
    for (let k = 1; k < 7; k++) lines.push(`M${2 + (36 / 7) * k} 2 V28`);
  else if (mat === "wallpaper-damask")
    for (const [x, y] of [
      [11, 9],
      [29, 9],
      [20, 17],
      [11, 25],
      [29, 25],
    ])
      lines.push(`M${x - 3} ${y} L${x} ${y - 4} L${x + 3} ${y} L${x} ${y + 4} Z`);
  else if (mat === "carpet") for (let k = 0; k < 9; k++) lines.push(`M${4 + k * 4} ${6 + (k % 3) * 8} h1`);
  return (
    <svg viewBox="0 0 40 30" width="44" height="33" aria-hidden="true">
      <rect x="2" y="2" width="36" height="26" rx="3" fill={tint} />
      <path d={lines.join(" ")} stroke={line} strokeWidth="1" fill="none" />
    </svg>
  );
}

// (plan 130's quality pass) the roof picked (Alt-click in the Roof part): its pitch, overhang and eaves' height as
// sliders, its kind and covering from the bar's picks — each change live, an undo step each
function RoofPicked({ id }: { id: string }) {
  const t = useTr();
  const w = useWorld();
  const b = useHud((s) => s.build);
  useHud((s) => s.mapVersion);
  const r = w?.structure?.roofs?.find((q) => q.id === id);
  if (!r) return null;
  const f = w?.structure?.floors.find((q) => q.index === r.floor);
  const set = (c: Parameters<NonNullable<NonNullable<typeof w>["build"]>["roofSet"]>[0]) => w?.build?.roofSet(c);
  const slider = (
    label: string,
    v: number,
    min: number,
    max: number,
    step: number,
    unit: string,
    pick: (v: number) => void,
    testid: string,
  ) => (
    <label className="flex items-center gap-2 min-w-0" data-testid={testid}>
      <span className="gl-lab w-[64px] shrink-0">{label}</span>
      <input
        type="range"
        className="flex-1 min-w-0"
        min={min}
        max={max}
        step={step}
        value={v}
        onChange={(e) => pick(Number(e.target.value))}
      />
      <span className="mono text-[11px] w-[48px] text-right">
        {Math.round(v * 100) / 100}
        {unit}
      </span>
    </label>
  );
  const onRoof = r.kind === "dormer" || r.kind === "chimney";
  return (
    <div className="flex flex-col gap-2 p-3.5 min-h-0 overflow-y-auto gl-scroll" data-testid="roof-picked">
      <div className="flex items-baseline justify-between gap-2">
        <b className="gl-title !text-[17px] truncate">{t(ROOF_NAME[r.kind])}</b>
        <button type="button" className="gl-btn gl-sm" onClick={() => hud.set((s) => ({ build: { ...s.build, roofSel: null } }))}>
          ✕
        </button>
      </div>
      {!onRoof &&
        r.kind !== "flat" &&
        slider(t("roofPitch"), r.pitch, 10, 60, 5, "°", (v) => set({ pitch: v }), "roof-pitch-slider")}
      {!onRoof &&
        slider(t("roofOverhang"), r.over ?? 0.3, 0, 1.5, 0.1, " m", (v) => set({ over: v }), "roof-over-slider")}
      {slider(
        hw("bvRoofEaves") || "Eaves",
        Math.round((r.z - (f?.z ?? 0)) * 100) / 100,
        1,
        6,
        0.05,
        " m",
        (v) => set({ z: (f?.z ?? 0) + v }),
        "roof-eaves-slider",
      )}
      <div className="flex gap-1.5 flex-wrap">
        {!onRoof && (
          <button
            type="button"
            className="gl-btn gl-sm"
            onClick={() => set({ kind: b.roofKind })}
            disabled={b.roofKind === "dormer" || b.roofKind === "chimney"}
          >
            {t(ROOF_NAME[b.roofKind])}
          </button>
        )}
        <button type="button" className="gl-btn gl-sm" onClick={() => set({ mat: b.roofMat })}>
          {t(`roofMat_${b.roofMat}` as Key)}
        </button>
      </div>
      <p className="text-[12px] font-semibold leading-snug" style={{ color: "var(--glass-dim)" }}>
        {hw("bvRoofPickedHint") ||
          "[ ] pitch · PgUp/PgDn eaves · , . overhang · the bar's kind and covering go on with the buttons · Esc lets go."}
      </p>
    </div>
  );
}
