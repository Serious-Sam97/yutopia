"use client";

import { areaAt, CLOTH_COLORS, DECOR, edgeAt, entry, faceMat, footprint, isOpening, panelTile } from "@yutopia/shared";
import { useEffect, useRef, useState } from "react";
import { yutopia } from "@/lib/api";
import { type Key, trMaybe, useTr } from "@/lib/i18n";
import { type BuildTool, hud, toast, useHud } from "@/world/store";
import { Brand } from "../../Brand";
import { useWorld } from "../ctx";
import { Icon, type IconName } from "../icons";
import { floorLabel } from "../LiftPanel";
import { Catalog, sizeLabel } from "./Catalog";
import { DesksPanel } from "./DesksPanel";
import { DeskDialog, RoomDialog } from "./Dialogs";
import { MapPanel } from "./MapPanel";
import { RoomsPanel } from "./RoomsPanel";
import { ItemThumb } from "./thumbs";
import { MODE_HINT, matLabel, WALL_HINT, WALL_SWATCHES, WallsPanel } from "./WallsPanel";

export type Member = { id: number; name: string };

const TOOLS: { key: BuildTool; label: Key; icon: IconName }[] = [
  { key: "furniture", label: "buildFurnish", icon: "chair" },
  { key: "walls", label: "buildWalls", icon: "wall" },
  { key: "rooms", label: "buildRooms", icon: "room" },
  { key: "desks", label: "buildDesks", icon: "tag" },
  { key: "map", label: "buildMap", icon: "map" },
];
// which way an item faces at each rotation (seats face their desk)
const FACING = ["SW", "SE", "NE", "NW"];
const MOD = typeof navigator !== "undefined" && /Mac|iP/.test(navigator.platform) ? "Cmd+" : "Ctrl+";

// Build mode (project owners) takes over the screen: its own top bar with
// undo/redo and save state, a tool rail, the tool's panel, and a bar at the
// bottom for what you're doing right now. Everything persists to the API.
export function BuildMode() {
  const t = useTr();
  const w = useWorld();
  const b = useHud((s) => s.build);
  const canBuild = useHud((s) => s.canBuild);
  const [members, setMembers] = useState<Member[]>([]);
  const [keys, setKeys] = useState(false);

  // build mode's code loads on first use (its own chunk)
  useEffect(() => {
    if (b.on && canBuild) void w?.loadBuild();
  }, [b.on, canBuild, w]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: redraw the ghost when the tool changes
  useEffect(() => {
    w?.refreshGhost();
  }, [
    b.on,
    b.tool,
    b.kind,
    b.rot,
    b.mode,
    b.brush,
    b.paintMode,
    b.props,
    b.pickSpawn,
    b.wallMode,
    b.paint,
    b.wallView,
    w,
  ]);

  useEffect(() => {
    if (b.on && canBuild)
      yutopia
        .members()
        .then((r) => setMembers(r.members))
        .catch(() => {});
  }, [b.on, canBuild]);

  if (!b.on || !canBuild) return null;
  return (
    <>
      <BuildTopBar />
      <ToolRail keys={keys} onKeys={() => setKeys((k) => !k)} />
      <section
        aria-label={`${t("buildMode")}: ${t(TOOLS.find((x) => x.key === b.tool)?.label ?? "buildFurnish")}`}
        className="pointer-events-auto cabinet absolute flex flex-col overflow-hidden rise left-3 right-3 bottom-[84px] h-[42vh] sm:h-auto sm:right-auto sm:left-[100px] sm:top-[76px] sm:bottom-3 sm:w-[352px]"
      >
        {b.tool === "furniture" && <Catalog />}
        {b.tool === "walls" && <WallsPanel />}
        {b.tool === "rooms" && <RoomsPanel members={members} />}
        {b.tool === "desks" && <DesksPanel members={members} />}
        {b.tool === "map" && <MapPanel />}
      </section>
      {keys && <KeysCard onClose={() => setKeys(false)} />}
      {b.tool === "furniture" && <HoverTag />}
      {b.tool === "walls" && <WallTagChip />}
      {b.tool === "walls" && b.wallMode === "select" && b.wallSel.length > 0 && <WallInspector />}
      {b.tool === "furniture" && b.selected.length > 0 && b.carrying === 0 && <ItemToolbar />}
      <ActionBar />
      {b.roomDraft && <RoomDialog draft={b.roomDraft} members={members} />}
      {b.deskDraft && <DeskDialog seatId={b.deskDraft} members={members} />}
    </>
  );
}

function BuildTopBar() {
  const t = useTr();
  const w = useWorld();
  const worldName = useHud((s) => s.worldName);
  const area = useHud((s) => s.me?.areaName ?? "");
  const h = useHud((s) => s.build.history);
  const mic = useHud((s) => s.media.mic);
  const micReady = useHud((s) => s.media.ready || s.media.offline);
  const off = { opacity: 0.4, cursor: "not-allowed" };
  return (
    <header
      className="pointer-events-auto cabinet absolute top-3 left-3 right-3 h-[52px] flex items-center gap-2 sm:gap-2.5 pl-3 pr-2 overflow-hidden"
      style={{ borderColor: "rgba(255,166,48,.55)" }}
    >
      <span className="hazard absolute inset-x-0 bottom-0 h-[3px] opacity-80" aria-hidden />
      <span className="hidden sm:block">
        <Brand small compact />
      </span>
      <span className="hidden sm:block w-px h-6" style={{ background: "var(--edge)" }} aria-hidden />
      <div className="vfd-window flex items-center gap-2.5 px-3 py-1.5 min-w-0">
        <span
          className="w-[9px] h-[9px] rounded-full shrink-0"
          style={{ background: "#ff5a2a", boxShadow: "0 0 8px #ff7a3a" }}
          aria-hidden
        />
        <h2 className="lcd text-lg sm:text-[22px] leading-none whitespace-nowrap truncate">
          {t("buildMode").toUpperCase()}
        </h2>
        <span className="mono text-xs truncate hidden lg:inline" style={{ color: "var(--cream-dim)" }}>
          {[worldName, area].filter(Boolean).join(" · ")}
        </span>
      </div>
      <FloorPicker />
      <div className="flex-1" />
      <button
        type="button"
        className="ghost-btn flex items-center gap-1.5 h-[34px]"
        aria-pressed={mic}
        disabled={!micReady}
        onClick={() => void w?.toggleMic()}
        title={`${t("mic")} (M)`}
        style={mic ? { color: "var(--vfd)", borderColor: "#7a5636" } : undefined}
      >
        <Icon name={mic ? "mic" : "micOff"} size={15} />
      </button>
      <button
        type="button"
        className="ghost-btn flex items-center gap-1.5 h-[34px]"
        disabled={!h.undo}
        style={h.undo ? undefined : off}
        title={`${t("buildUndo")}${h.undoLabel ? `: ${h.undoLabel}` : ""} (${MOD}Z)`}
        onClick={() => w?.undo()}
      >
        <Icon name="undo" size={15} />
        <span className="hidden md:inline">{t("buildUndo")}</span>
      </button>
      <button
        type="button"
        className="ghost-btn flex items-center gap-1.5 h-[34px]"
        disabled={!h.redo}
        style={h.redo ? undefined : off}
        title={`${t("buildRedo")}${h.redoLabel ? `: ${h.redoLabel}` : ""} (Shift+${MOD}Z)`}
        onClick={() => w?.redo()}
      >
        <Icon name="redo" size={15} />
        <span className="hidden md:inline">{t("buildRedo")}</span>
      </button>
      <SaveState />
      <button
        type="button"
        className="deck-btn"
        style={{ height: 38, background: "linear-gradient(180deg,#ffc274,#e8952d)", boxShadow: "0 3px 0 #9a5c17" }}
        onClick={() => hud.set((s) => ({ build: { ...s.build, on: false, mode: "hand", props: null } }))}
      >
        <Icon name="check" size={16} />
        {t("buildDone")}
      </button>
    </header>
  );
}

function SaveState() {
  const t = useTr();
  const save = useHud((s) => s.build.save);
  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 20_000);
    return () => clearInterval(id);
  }, []);
  const mins = Math.floor((Date.now() - save.at) / 60_000);
  const [text, color] =
    save.state === "saving"
      ? [t("buildSaving"), "var(--vfd)"]
      : save.state === "failed"
        ? [t("buildSaveFailed"), "#e79a7c"]
        : save.state === "rejected"
          ? [t("buildSaveRejected"), "#e79a7c"]
          : save.state === "saved"
            ? [
                `${t("buildSaved")} · ${mins < 1 ? t("buildJustNow") : t("buildMinAgo").replace("{n}", String(mins))}`,
                "#8aa04a",
              ]
            : [t("buildAutoSave"), "var(--muted)"];
  return (
    <span
      className="hidden xl:flex items-center gap-1.5 mono text-xs mx-1.5 whitespace-nowrap"
      style={{ color: "var(--cream-dim)" }}
      aria-live="polite"
    >
      <i className="w-[7px] h-[7px] rounded-full" style={{ background: color }} />
      {text}
    </span>
  );
}

function ToolRail({ keys, onKeys }: { keys: boolean; onKeys: () => void }) {
  const t = useTr();
  const w = useWorld();
  const tool = useHud((s) => s.build.tool);
  return (
    <div
      aria-label={t("buildMode")}
      className="pointer-events-auto cabinet absolute flex gap-1 p-1.5 left-3 right-3 top-[72px] h-[60px] sm:right-auto sm:top-[76px] sm:bottom-3 sm:h-auto sm:w-[76px] sm:flex-col"
      role="tablist"
    >
      {TOOLS.map((x) => (
        <button
          key={x.key}
          type="button"
          role="tab"
          aria-selected={tool === x.key}
          className="rail-btn flex flex-1 sm:flex-none sm:h-[62px]"
          onClick={() => {
            w?.clearRoomGhost();
            hud.set((s) => ({
              build: { ...s.build, tool: x.key, roomDraft: null, deskDraft: null, pickSpawn: false },
            }));
          }}
        >
          <Icon name={x.icon} size={22} />
          {t(x.label)}
        </button>
      ))}
      <div className="hidden sm:block flex-1" />
      <button
        type="button"
        className="rail-btn hidden sm:flex h-[46px]"
        aria-pressed={keys}
        onClick={onKeys}
        title={t("buildShortcuts")}
      >
        <span className="mono text-base leading-none">?</span>
        {t("buildKeys")}
      </button>
    </div>
  );
}

// (the Walls tool has keys of its own)
const WALL_KEYS: [string, Key][] = [
  ["Drag", "kWallRun"],
  [`${MOD}Drag`, "kWallRemove"],
  ["Shift+Click", "kWallRoom"],
  ["Tab", "kWallFlip"],
  ["E", "kWallSample"],
  ["[  ]", "kWallView"],
  ["Esc", "kDrop"],
  [`${MOD}Z`, "kUndo"],
];

function KeysCard({ onClose }: { onClose: () => void }) {
  const t = useTr();
  const walls = useHud((s) => s.build.tool === "walls");
  const rows: [string, Key][] = walls
    ? WALL_KEYS
    : [
        ["Click", "kMove"],
        ["Shift+Click", "kSelect"],
        ["Drag", "kBox"],
        ["R / Scroll", "kRotate"],
        ["Drag ↔", "kTurnDrag"],
        ["Shift+Click", "kPlaceMore"],
        ["Arrows", "kNudge"],
        ["E", "kEyedrop"],
        ["H", "kHand"],
        ["C", "kCopy"],
        [`${MOD}D`, "kDuplicate"],
        ["Del", "kRemove"],
        ["Esc", "kDrop"],
        [`${MOD}Z`, "kUndo"],
        [`Shift+${MOD}Z`, "kRedo"],
        ["/", "kSearch"],
        ["WASD", "kWalk"],
      ];
  return (
    <div
      className="pointer-events-auto cabinet absolute left-[100px] bottom-3 w-[260px] p-3 rise hidden sm:block"
      role="dialog"
      aria-label={t("buildShortcuts")}
      style={{ zIndex: 2 }}
    >
      <div className="flex items-center justify-between mb-2">
        <h2 className="lcd text-xl leading-none">{t("buildShortcuts").toUpperCase()}</h2>
        <button
          type="button"
          className="ghost-btn"
          style={{ padding: "2px 6px" }}
          onClick={onClose}
          aria-label={t("close")}
        >
          <Icon name="close" size={14} />
        </button>
      </div>
      <ul className="space-y-1.5">
        {rows.map(([k, label]) => (
          <li key={label} className="flex items-center justify-between gap-2 text-[13px]">
            <span style={{ color: "var(--cream-dim)" }}>{t(label)}</span>
            <span className="keycap" style={{ color: "var(--cream)", opacity: 0.85 }}>
              {k}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// The bottom bar. Furniture: the hand's modes when idle, what you carry while
// carrying, the group's actions with a selection. Other tools: what they do.
function ActionBar() {
  const t = useTr();
  const w = useWorld();
  const b = useHud((s) => s.build);
  // naming the selection to save it as a setup (null: not naming)
  const [naming, setNaming] = useState<string | null>(null);
  useEffect(() => {
    if (!b.selected.length) setNaming(null);
  }, [b.selected.length]);
  const saveSetup = async () => {
    const items = w?.build?.setupOfSelection();
    const name = (naming ?? "").trim();
    if (!items?.length || !name) return;
    if (items.some((i) => i.dx > 16 || i.dy > 16) || items.length > 40) return toast(t("buildSetupTooBig"), "warn");
    try {
      const { setup } = await yutopia.saveSetup(name, items);
      hud.set((s) => ({ build: { ...s.build, setups: [setup, ...(s.build.setups ?? [])] } }));
      toast(t("buildSetupSaved").replace("{name}", setup.name));
      setNaming(null);
    } catch {
      toast(t("buildSetupFailed"), "warn");
    }
  };
  useHud((s) => s.objectsVersion);
  // Esc on a keyboard; a tap target everywhere (phones have no Esc)
  const esc = (label: Key) => (
    <button
      type="button"
      className="flex items-center gap-1.5 mono text-[11px] px-2 h-11 whitespace-nowrap rounded-lg hover:bg-white/5"
      style={{ color: "var(--muted)" }}
      onClick={() => w?.buildKey("escape")}
    >
      <span className="hidden sm:inline">
        <span className="keycap">Esc</span>
      </span>
      <span className="sm:hidden">
        <Icon name="close" size={16} />
      </span>
      {t(label)}
    </button>
  );
  const key = (k: string) => (
    <span className="hidden sm:inline">
      <span className="keycap">{k}</span>
    </span>
  );
  const sep = <span className="w-px h-8 mx-0.5 shrink-0" style={{ background: "var(--edge)" }} aria-hidden />;
  const act = (icon: IconName, label: Key, k: string, onClick: () => void, danger = false) => (
    <button
      type="button"
      className={`deck-btn whitespace-nowrap ${danger ? "danger" : ""}`}
      onClick={onClick}
      title={k ? `${t(label)} (${k})` : t(label)}
      aria-label={t(label)}
    >
      <Icon name={icon} size={18} />
      <span className="hidden md:inline">{t(label)}</span>
      {k && key(k)}
    </button>
  );

  let body: React.ReactNode;
  if (b.tool === "furniture") {
    const info = b.carrying ? w?.build?.handInfo() : null;
    if (info) {
      const fp = footprint(info.kind, info.rot);
      body = (
        <>
          <span className="flex items-center gap-2.5 pl-1 pr-2 min-w-0">
            <span
              className="w-[58px] h-[46px] rounded-lg hidden sm:flex items-center justify-center p-1 shrink-0"
              style={{
                background: "radial-gradient(90% 70% at 50% 62%,#4a3324,#241912 72%)",
                border: "1px solid var(--edge)",
              }}
            >
              <ItemThumb kind={info.kind} props={info.props} />
            </span>
            <span className="min-w-0">
              <span className="lcd text-[22px] leading-none block truncate">
                {info.count > 1
                  ? t("buildCarrying").replace("{n}", String(info.count)).toUpperCase()
                  : (
                      (info.props?.d ? trMaybe(`decor_${String(info.props.d)}`) : null) ?? entry(info.kind).label
                    ).toUpperCase()}
              </span>
              <span
                className="mono text-[11px] uppercase whitespace-nowrap"
                style={{ color: b.fits ? "#a9c25a" : "#e79a7c" }}
              >
                ● {t(b.fits ? "buildFits" : "buildBlocked")}
                <span className="hidden sm:inline">
                  {" "}
                  ·{" "}
                  {entry(info.kind).onSurface
                    ? t("buildOnTop")
                    : entry(info.kind).wall || isOpening(info.kind)
                      ? sizeLabel(info.kind)
                      : `${fp.w}×${fp.h}`}
                  {!isOpening(info.kind) && (
                    <>
                      {" "}
                      · {t("buildFacing")} {FACING[info.rot % 4]}
                    </>
                  )}
                </span>
              </span>
            </span>
          </span>
          {sep}
          {act("rotate", "buildRotate", "R", () => w?.buildKey("r"))}
          {act("check", "buildPutDown", "↵", () => w?.buildKey("enter"))}
          {sep}
          <span
            className="hidden 2xl:block text-[12px] max-w-[300px] leading-snug px-1"
            style={{ color: "var(--muted)" }}
          >
            {t(isOpening(info.kind) ? "buildDoorHint" : "buildCarryHint")}
          </span>
          {esc(b.held.length ? "buildCancel" : "buildExit")}
        </>
      );
    } else if (b.selected.length && naming !== null) {
      body = (
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void saveSetup();
          }}
        >
          <Icon name="pin" size={18} />
          <input
            // biome-ignore lint/a11y/noAutofocus: the field the button just opened
            autoFocus
            value={naming}
            maxLength={40}
            onChange={(e) => setNaming(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setNaming(null);
            }}
            placeholder={t("buildSetupName")}
            aria-label={t("buildSetupName")}
            className="h-9 w-[min(240px,40vw)] rounded-lg px-2.5 text-sm outline-none"
            style={{ background: "#140e0a", border: "1px solid var(--edge)", color: "var(--cream)" }}
          />
          <button type="submit" className="deck-btn" disabled={!naming.trim()}>
            <Icon name="check" size={18} />
            <span className="hidden md:inline">{t("buildSetupSave")}</span>
          </button>
          <button type="button" className="ghost-btn h-9" onClick={() => setNaming(null)}>
            {t("actCancel")}
          </button>
        </form>
      );
    } else if (b.selected.length) {
      body = (
        <>
          <span className="lcd text-[22px] leading-none px-2 whitespace-nowrap">
            {t("buildSelected").replace("{n}", String(b.selected.length)).toUpperCase()}
          </span>
          {sep}
          {act("move", "buildMove", "M", () => w?.build?.pickSelection())}
          {act("rotate", "buildRotate", "R", () => w?.buildKey("r"))}
          {act("copy", "buildDuplicate", `${MOD}D`, () => w?.build?.duplicate())}
          {act("pin", "buildSaveSetup", "", () => setNaming(""))}
          {act("bin", "kRemove", "Del", () => w?.buildKey("delete"), true)}
          {sep}
          {esc("buildDeselect")}
        </>
      );
    } else {
      body = (
        <>
          <span className="flex rounded-lg overflow-hidden shrink-0">
            {(
              [
                ["hand", "hand", "buildHand", "H"],
                ["eyedrop", "eyedrop", "buildEyedrop", "E"],
              ] as const
            ).map(([mode, icon, label, k]) => (
              <button
                key={mode}
                type="button"
                aria-pressed={b.mode === mode}
                className="deck-btn rounded-none"
                onClick={() => w?.build?.setMode(mode)}
                title={`${t(label)} (${k})`}
              >
                <Icon name={icon} size={18} />
                <span className="hidden md:inline">{t(label)}</span>
                {key(k)}
              </button>
            ))}
          </span>
          {sep}
          <span className="text-[12.5px] px-1.5 max-w-[420px] leading-snug" style={{ color: "var(--cream-dim)" }}>
            {t(b.mode === "eyedrop" ? "buildEyedropHint" : "buildHandHint")}
          </span>
          {sep}
          {esc("buildExit")}
        </>
      );
    }
  } else {
    const hint: Key =
      b.tool === "walls"
        ? b.wallMode !== "build" && b.wallMode !== "floors"
          ? WALL_HINT[b.wallMode]
          : b.wallMode === "build" && b.paintMode === "line"
            ? WALL_HINT.build
            : MODE_HINT[b.paintMode]
        : b.tool === "rooms"
          ? "buildDrawRoomHint"
          : b.tool === "desks"
            ? "buildDeskBar"
            : b.pickSpawn
              ? "buildArrivalPick"
              : "buildMapHint";
    body = (
      <>
        <span className="text-[13px] px-2 py-1.5" style={{ color: "var(--cream-dim)" }}>
          {t(hint)}
        </span>
        {sep}
        {esc("buildExit")}
      </>
    );
  }
  return (
    <div className="pointer-events-none absolute bottom-3 left-3 right-3 sm:left-[464px] lg:right-[184px] flex justify-center">
      <div className="pointer-events-auto cabinet flex items-center gap-1.5 p-2 max-w-full overflow-x-auto scroll-thin">
        {body}
      </div>
    </div>
  );
}

// The name of the thing under the pointer, by the pointer (and who holds it).
function HoverTag() {
  const t = useTr();
  const w = useWorld();
  const hover = useHud((s) => s.build.hover);
  const carrying = useHud((s) => s.build.carrying);
  const el = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!w) return;
    return w.onFrame(() => {
      const e = w.engine;
      const node = el.current;
      if (!e || !node) return;
      const r = e.app.canvas.getBoundingClientRect();
      const t = `translate(${Math.round(r.left + e.pointerAt.gx + 16)}px, ${Math.round(r.top + e.pointerAt.gy + 18)}px)`;
      if (node.style.transform !== t) node.style.transform = t;
    });
  }, [w]);
  if (!hover || carrying) return null;
  return (
    <div
      ref={el}
      className="pointer-events-none fixed left-0 top-0 z-10 rounded-md px-2 py-1 mono text-[11px] whitespace-nowrap"
      style={{
        background: "rgba(30,23,18,.92)",
        border: `1px solid ${hover.by ? "#c7452d" : "#7a5636"}`,
        color: "var(--cream)",
      }}
    >
      {hover.label}
      {hover.by && <span style={{ color: "#ff9a7a" }}> · {t("buildHeldTag").replace("{name}", hover.by)}</span>}
      {hover.of && hover.of.n > 1 && (
        <span style={{ color: "var(--muted)" }}>
          {" "}
          · {hover.of.i + 1}/{hover.of.n} <kbd className="keycap">Tab</kbd>
        </span>
      )}
    </div>
  );
}

// The Walls tool's chip by the pointer: the face it's on — this side or the
// far one, the room it looks into, its material now → the brush's — or a run
// being drawn (how many walls, how many skipped and why).
function WallTagChip() {
  const t = useTr();
  const w = useWorld();
  const tag = useHud((s) => s.build.wallTag);
  const el = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!w) return;
    return w.onFrame(() => {
      const e = w.engine;
      const node = el.current;
      if (!e || !node) return;
      const r = e.app.canvas.getBoundingClientRect();
      const tr = `translate(${Math.round(r.left + e.pointerAt.gx + 18)}px, ${Math.round(r.top + e.pointerAt.gy + 20)}px)`;
      if (node.style.transform !== tr) node.style.transform = tr;
    });
  }, [w]);
  if (!tag) return null;
  const bad = !!tag.why && (tag.kind === "face" ? !tag.to : tag.n === 0);
  const swatch = (m: string | null) => {
    const c = WALL_SWATCHES.find((s) => s.ch === `w:${m}`)?.face;
    return c ? (
      <span className="inline-block w-2.5 h-2.5 rounded-sm align-[-1px] mr-1" style={{ background: c }} />
    ) : null;
  };
  return (
    <div
      ref={el}
      data-testid="wall-tag"
      className="pointer-events-none fixed left-0 top-0 z-10 rounded-md px-2 py-1 mono text-[11px] whitespace-nowrap"
      style={{
        background: "rgba(30,23,18,.94)",
        border: `1px solid ${bad ? "#c7452d" : "#7a5636"}`,
        color: "var(--cream)",
      }}
    >
      {tag.kind === "face" ? (
        <>
          <span style={{ color: tag.far ? "#ffcf8a" : "var(--vfd)" }}>
            {t(tag.far ? "wallFarSide" : "wallThisSide")}
          </span>
          {" · "}
          {tag.room ?? t("wallOpenFloor")}
          {" · "}
          {swatch(tag.from)}
          {matLabel(tag.from)}
          {tag.to && tag.to !== tag.from && (
            <>
              {" → "}
              {swatch(tag.to)}
              {matLabel(tag.to)}
            </>
          )}
          {tag.n > 1 && (
            <span style={{ color: "var(--muted)" }}> · {t("wallFaces").replace("{n}", String(tag.n))}</span>
          )}
          {!tag.why && (
            <span style={{ color: "var(--muted)" }}>
              {" "}
              <kbd className="keycap">Tab</kbd>
            </span>
          )}
        </>
      ) : (
        <>
          {tag.w && tag.h ? `${tag.w} × ${tag.h} · ` : ""}
          <span style={{ color: tag.remove ? "#ff9a7a" : "var(--vfd)" }}>
            {t(tag.remove ? "wallRunRemove" : "wallRun").replace("{n}", String(tag.n))}
          </span>
          {tag.skipped > 0 && (
            <span style={{ color: "var(--muted)" }}> · {t("wallSkipped").replace("{n}", String(tag.skipped))}</span>
          )}
        </>
      )}
      {tag.why && (
        <div style={{ color: bad ? "#ff9a7a" : "var(--muted)" }} className="mt-0.5">
          {tag.why}
        </div>
      )}
    </div>
  );
}

// Select in the Walls tool: a card over the wall(s) picked — what it is, both
// faces (their material and the room each looks into), and what to do.
function WallInspector() {
  const t = useTr();
  const w = useWorld();
  const sel = useHud((s) => s.build.wallSel);
  useHud((s) => s.mapVersion);
  const el = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!w) return;
    return w.onFrame(() => {
      const node = el.current;
      const at = w.build?.wallAnchor();
      if (!node || !at) return;
      const r = w.engine?.app.canvas.getBoundingClientRect();
      // over the wall, but never under the top bar or off the screen (walls are tall)
      const h = node.offsetHeight;
      const wd = node.offsetWidth;
      const x = Math.min(Math.max((r?.left ?? 0) + at.x, wd / 2 + 8), window.innerWidth - wd / 2 - 8);
      const y = Math.min(Math.max((r?.top ?? 0) + at.y, h + 76), window.innerHeight - 96);
      const tr = `translate(${Math.round(x)}px, ${Math.round(y)}px) translate(-50%, -100%)`;
      if (node.style.transform !== tr) node.style.transform = tr;
    });
  }, [w]);
  const map = w?.map;
  const p = sel[0];
  if (!map || !p) return null;
  const ch = edgeAt(map, p);
  const faced = /^[pwfbkPWFBK]$/.test(ch);
  const room = (side: 1 | -1) => {
    const [x, y] = panelTile({ ...p, side });
    return areaAt(map, x + 0.5, y + 0.5)?.name ?? t("wallOpenFloor");
  };
  const kind = ch === "g" ? t("wallGlass") : ch === "h" ? t("wallHalf") : t("wallInspect");
  const face = (side: 1 | -1, label: Key) => {
    const m = faceMat(map, p, side);
    const c = WALL_SWATCHES.find((s) => s.ch === `w:${m}`)?.face;
    return (
      <div className="flex items-center gap-2 text-[12px]">
        <span
          className="inline-block w-4 h-4 rounded"
          style={{ background: c ?? "#3a4a4a", border: "1px solid #2a1a12" }}
        />
        <span
          className="mono uppercase text-[10px]"
          style={{ color: side === p.side ? "var(--vfd)" : "var(--cream-dim)" }}
        >
          {t(label)}
        </span>
        <span>{faced ? matLabel(m) : kind}</span>
        <span style={{ color: "var(--muted)" }}>· {room(side)}</span>
      </div>
    );
  };
  const act = (label: Key, a: "same" | "swap" | "remove", danger = false) => (
    <button
      type="button"
      className="mono text-[11px] uppercase tracking-wide px-2 h-8 rounded-md hover:bg-white/10"
      style={{ color: danger ? "#ff9a7a" : "var(--cream)", border: "1px solid var(--edge)" }}
      onClick={() => w?.build?.wallAction(a)}
    >
      {t(label)}
    </button>
  );
  return (
    <div ref={el} className="pointer-events-none fixed left-0 top-0 z-10">
      <section
        aria-label={t("wallInspect")}
        data-testid="wall-inspector"
        className="pointer-events-auto cabinet p-2.5 flex flex-col gap-2 rise min-w-[260px]"
      >
        <h3 className="lcd text-lg leading-none">
          {sel.length > 1 ? t("wallsSelected").replace("{n}", String(sel.length)) : kind}
        </h3>
        {face(p.side, "wallThisSide")}
        {face(p.side > 0 ? -1 : 1, "wallOtherSide")}
        <div className="flex flex-wrap gap-1.5">
          {faced && act("wallSame", "same")}
          {faced && act("wallSwap", "swap")}
          {act("wallRemove", "remove", true)}
        </div>
      </section>
    </div>
  );
}

const LOOKS = [0, 1, 2, 3, 4, 5, 6, 7];

// A little toolbar above what's selected (Sims-style): move, turn, copy, its
// look, delete.
function ItemToolbar() {
  const t = useTr();
  const w = useWorld();
  const sel = useHud((s) => s.build.selected);
  useHud((s) => s.objectsVersion);
  const el = useRef<HTMLDivElement>(null);
  const [look, setLook] = useState(false);
  useEffect(() => {
    if (!w) return;
    return w.onFrame(() => {
      const node = el.current;
      const at = sel[0] ? w.build?.anchorOf(sel[0]) : null;
      if (!node || !at) return;
      const r = w.engine?.app.canvas.getBoundingClientRect();
      // over the item, but never under the top bar or off the screen (its
      // look or board picker open above it, high up a tall wall)
      const h = node.offsetHeight;
      const wd = node.offsetWidth;
      const x = Math.min(Math.max((r?.left ?? 0) + at.x, wd / 2 + 8), window.innerWidth - wd / 2 - 8);
      const y = Math.max((r?.top ?? 0) + at.y, h + 76);
      const t = `translate(${Math.round(x)}px, ${Math.round(y)}px) translate(-50%, -100%)`;
      if (node.style.transform !== t) node.style.transform = t;
    });
  }, [w, sel]);
  const objs = sel.map((id) => w?.engine?.getObject(id)).filter((o): o is NonNullable<typeof o> => !!o);
  const kind = objs.every((o) => o.kind === objs[0]?.kind) ? objs[0]?.kind : null;
  const looks = kind ? (entry(kind).variants ?? 1) : 1;
  const decorOpts = kind && kind in DECOR ? (DECOR[kind as keyof typeof DECOR] as readonly string[]) : null;
  const paintable = !!kind && !!entry(kind).paint;
  const canLook = !!kind && (looks > 1 || !!decorOpts || paintable);
  // a board wall (or a screen showing boards): which board it shows
  const btn = (icon: IconName, label: Key, onClick: () => void, pressed?: boolean) => (
    <button
      type="button"
      className="w-9 h-9 rounded-lg flex items-center justify-center hover:bg-white/10"
      style={{ color: pressed ? "var(--vfd)" : "var(--cream)" }}
      aria-pressed={pressed}
      title={t(label)}
      aria-label={t(label)}
      onClick={onClick}
    >
      <Icon name={icon} size={18} />
    </button>
  );
  return (
    <div ref={el} className="pointer-events-none fixed left-0 top-0 z-10 flex flex-col items-center gap-1.5">
      {look && kind && (
        <fieldset className="pointer-events-auto cabinet p-1.5 flex flex-col gap-1.5 rise" aria-label={t("buildLook")}>
          {(looks > 1 || decorOpts) && (
            <div className="flex gap-1">
              {decorOpts
                ? decorOpts.map((d) => (
                    <button
                      key={d}
                      type="button"
                      className="tile-card w-[54px] h-[54px]"
                      aria-pressed={objs.every((o) => o.props?.d === d)}
                      title={trMaybe(`decor_${d}`) ?? d}
                      onClick={() => w?.build?.setLook({ d })}
                    >
                      <span className="absolute inset-1 flex items-center justify-center">
                        <ItemThumb kind={kind} props={{ ...(objs[0]?.props ?? {}), d }} />
                      </span>
                    </button>
                  ))
                : LOOKS.slice(0, looks).map((v) => (
                    <button
                      key={v}
                      type="button"
                      className="tile-card w-[54px] h-[54px]"
                      aria-pressed={objs.every((o) => o.props?.variant === v)}
                      title={`${t("buildLook")} ${v + 1}`}
                      onClick={() => w?.build?.setLook({ variant: v })}
                    >
                      <span className="absolute inset-1 flex items-center justify-center">
                        <ItemThumb kind={kind} props={{ ...(objs[0]?.props ?? {}), variant: v }} />
                      </span>
                    </button>
                  ))}
              {decorOpts && (
                <button
                  type="button"
                  className="w-[54px] h-[54px] rounded-lg flex items-center justify-center hover:bg-white/10"
                  title={t("buildShuffle")}
                  aria-label={t("buildShuffle")}
                  onClick={() => w?.build?.setLook("shuffle")}
                >
                  <Icon name="shuffle" size={20} />
                </button>
              )}
            </div>
          )}
          {paintable && (
            // its fabric or paint: the palette, or back to how it comes
            <fieldset className="flex gap-1 flex-wrap max-w-[330px]" aria-label={t("buildColour")}>
              <button
                type="button"
                className="w-6 h-6 rounded-full border-2 grid place-items-center text-[11px]"
                style={{ borderColor: "#0006", color: "var(--cream-dim)" }}
                title={t("buildColourDefault")}
                aria-label={t("buildColourDefault")}
                aria-pressed={objs.every((o) => !o.props?.color)}
                onClick={() => w?.build?.setLook({ color: "" })}
              >
                ×
              </button>
              {CLOTH_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  className="w-6 h-6 rounded-full border-2"
                  style={{
                    background: c,
                    borderColor: objs.every((o) => o.props?.color === c) ? "var(--amber)" : "#0006",
                  }}
                  title={c}
                  aria-label={c}
                  aria-pressed={objs.every((o) => o.props?.color === c)}
                  onClick={() => w?.build?.setLook({ color: c })}
                />
              ))}
            </fieldset>
          )}
        </fieldset>
      )}
      <div className="pointer-events-auto cabinet flex items-center gap-0.5 p-1">
        {btn("move", "buildMove", () => w?.build?.pickSelection())}
        {btn("rotate", "buildRotate", () => w?.buildKey("r"))}
        {btn("copy", "buildDuplicate", () => w?.build?.duplicate())}
        {canLook && btn("palette", "buildLook", () => setLook((v) => !v), look)}
        {btn("bin", "kRemove", () => w?.buildKey("delete"))}
      </div>
    </div>
  );
}

// Which floor I'm building (shared levels.ts): a button a floor, mine lit (a
// click, or PgUp / PgDn, takes me there); a blank floor on top, the top one
// taken away (never the home floor).
function FloorPicker() {
  const t = useTr();
  const w = useWorld();
  const floor = useHud((s) => s.floor);
  const floors = useHud((s) => s.floors);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key !== "PageUp" && e.key !== "PageDown") return;
      const i = floors.indexOf(floor) + (e.key === "PageUp" ? 1 : -1);
      if (i < 0 || i >= floors.length) return;
      e.preventDefault();
      w?.goToFloor(floors[i]);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [w, floor, floors]);
  if (!w) return null;
  const top = floors[floors.length - 1];
  const home = w.building ? (w.building.floor ?? 0) : 0;
  return (
    <fieldset className="hidden md:flex items-center gap-1 shrink-0 border-0 p-0 m-0" aria-label={t("floor")}>
      <span className="mono text-[10px] mr-0.5" style={{ color: "var(--cream-dim)" }}>
        {t("floor").toUpperCase()}
      </span>
      {floors.map((f) => (
        <button
          key={f}
          type="button"
          className="w-[30px] h-[30px] rounded-[7px] lcd text-[18px] leading-none"
          aria-pressed={f === floor}
          data-floor={f}
          title={`${w.floorName(f)} (PgUp / PgDn)`}
          onClick={() => w.goToFloor(f)}
          style={
            f === floor
              ? { background: "linear-gradient(180deg,#ffc477,#ffa630)", color: "#2a1a12" }
              : { border: "1px solid var(--edge)", color: "var(--cream)" }
          }
        >
          {floorLabel(f)}
        </button>
      ))}
      <button
        type="button"
        className="ghost-btn h-[30px] px-2 mono text-[11px]"
        title={t("floorAdd")}
        onClick={() => w.send("level:add", {})}
      >
        + {t("floorAdd")}
      </button>
      {top !== home && (
        <button
          type="button"
          className="ghost-btn h-[30px] px-2 mono text-[11px]"
          title={t("floorRemove")}
          onClick={() => {
            if (window.confirm(t("floorRemoveConfirm").replace("{n}", floorLabel(top))))
              w.send("level:remove", { level: top });
          }}
        >
          − {floorLabel(top)}
        </button>
      )}
    </fieldset>
  );
}
