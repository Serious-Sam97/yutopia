"use client";

import { homeKeyOf, isHomeSpace, lotWhy, STOREY_RISES, type StoreyRise, spaceFloor } from "@yutopia/shared";
import { coverOf, WALL_STYLES, WALL_TRIMS, wallLength, workingHeights } from "@yutopia/shared/structure";
import { useEffect, useRef, useState } from "react";
import { yutopia } from "@/lib/api";
import { addStrings, type Key, tr, trMaybe, useTr } from "@/lib/i18n";
import { hud, toast, useHud, type WallView } from "@/world/store";
import { useWorld } from "../ctx";
import { floorLabel } from "../FloorChip";
import { Icon, type IconName } from "../icons";
import { BuildCard, BuildColumn, BuildMain } from "./BuildTab";
import { BuyColumn, BuyMain, ItemCard } from "./Catalog";
import { ask, ConfirmDialog, DeskDialog } from "./Dialogs";
import { DesignHeld, DesignMain, LotCard, LotColumn, LotMain } from "./LotTab";
import { type Tab, tabPatch, viewOf } from "./tabs";
import { matLabel, WALL_SWATCHES } from "./WallsPanel";

export type Member = { id: number; name: string };

// Build mode, The Sims 3's Build/Buy (docs/plan/124-the-build-view.md; look C, glass — the user's pick): the place and
// what's saved top left, the view (floors, walls up / cut / down, top-down, the grid, the turn, undo, Done) top right,
// Buy · Build · Lot bottom left, the catalog strip along the bottom (categories · pictures · the object card), the
// hand's tools on its top edge. The body stands idle; the camera is build mode's own (world/build/camera.ts).

addStrings(
  {
    bvTab_buy: ["Buy", "Comprar"],
    bvTab_build: ["Build", "Construir"],
    bvTab_lot: ["Lot", "Terreno"],
    bvDesignTab: ["Design", "Design"],
    bvHand: ["Hand", "Mão"],
    bvEyedrop: ["Eyedropper", "Conta-gotas"],
    bvSledge: ["Sledgehammer", "Marreta"],
    bvDesignTool: ["Design tool", "Ferramenta de design"],
    bvHint_hand: ["click a thing to lift only it", "clique numa coisa para levantar só ela"],
    bvHint_place: ["click to put it down · R turns", "clique para colocar · R gira"],
    bvHint_eyedrop: ["click a thing to place copies of it", "clique numa coisa para colocar cópias"],
    bvHint_sledge: ["click a thing to sell it", "clique numa coisa para vender"],
    bvHint_design: ["click anything to restyle it", "clique em qualquer coisa para mudar o estilo"],
    bvKeysPan: ["pan", "mover"],
    bvKeysTurn: ["turn", "girar"],
    bvKeysZoom: ["zoom", "zoom"],
    bvKeysOrbit: ["orbit", "orbitar"],
    bvKeysTop: ["top-down", "de cima"],
    bvWheel: ["Wheel", "Roda"],
    bvRightDrag: ["Right drag", "Arrastar direito"],
    bvTopDown: ["Look straight down (T)", "Olhar de cima (T)"],
    bvGrid: ["The grid (G)", "A grade (G)"],
    bvRoofs: ["Roofs: shown or hidden", "Telhados: mostrar ou esconder"],
    bvTurnL: ["Turn left (Q)", "Girar à esquerda (Q)"],
    bvTurnR: ["Turn right (E)", "Girar à direita (E)"],
    bvFloorUp: ["Up a floor (PgUp)", "Subir um andar (PgUp)"],
    bvFloorDown: ["Down a floor (PgDn)", "Descer um andar (PgDn)"],
    bvFloorMore: ["Floors", "Andares"],
    // (plan 130) a wall's trims
    bvTrims: ["Trims", "Acabamentos"],
    bvTrim_base: ["Skirting", "Rodapé"],
    bvTrim_chair: ["Chair rail", "Meia-parede"],
    bvTrim_crown: ["Crown", "Sanca"],
    bvTrim_frieze: ["Frieze", "Friso"],
    // (plan 130) a home lot's storeys
    bvStoreyUp: ["A storey on top", "Um andar em cima"],
    bvStoreyAdd: ["Add a storey on top (normal height)", "Adicionar um andar em cima (altura normal)"],
    bvBasement: ["Dig a basement", "Cavar um porão"],
    bvStoreyRemove: ["Take this storey away", "Remover este andar"],
    bvStoreyRemoveAsk: ["Take this storey away, and everything on it?", "Remover este andar, e tudo nele?"],
  },
  "yutopia-build",
);
const bv = (k: string) => trMaybe(k) ?? k;
const MOD = typeof navigator !== "undefined" && /Mac|iP/.test(navigator.platform) ? "⌘" : "Ctrl+";

export function BuildMode() {
  const w = useWorld();
  const b = useHud((s) => s.build);
  const canBuild = useHud((s) => s.canBuild);
  const [members, setMembers] = useState<Member[]>([]);

  // build mode's code loads on first use (its own chunk)
  useEffect(() => {
    if (b.on && canBuild) void w?.loadBuild();
  }, [b.on, canBuild, w]);
  // (a town building's inside: admins build there — plan 112, F1a; a member's build mode closes, told why)
  const floor = useHud((s) => s.floor);
  const isAdmin = useHud((s) => s.isAdmin);
  useEffect(() => {
    const sp = spaceFloor(floor);
    if (!b.on || isAdmin || !sp) return;
    // (plan 130: a home lot's — its owner's and their roommates')
    if (isHomeSpace(sp.space)) {
      const why = w?.structure ? lotWhy(w.structure, floor, { uid: w.myUid(), admin: false }) : null;
      if (!why) return;
      hud.set((s) => ({ build: { ...s.build, on: false } }));
      toast(`${why[0].toUpperCase()}${why.slice(1)}.`, "warn");
      return;
    }
    hud.set((s) => ({ build: { ...s.build, on: false } }));
    toast(tr("spaceAdminsOnly"), "warn");
  }, [b.on, floor, isAdmin, w]);
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
    b.grid,
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
  const v = viewOf(b);
  // (the design tool restyles in any tab the furniture tool works in: Buy, Build's doors / windows / stairs, Lot's
  // layouts and setups — review)
  const design = b.tool === "furniture" && b.mode === "design";
  // (plan 124 follow-up) what's on the pointer from the catalog, customized before it goes down
  const styling = b.tool === "furniture" && b.mode === "place" && b.styling;
  const middle = (own: React.ReactNode) => (styling ? <DesignHeld /> : design ? <DesignMain /> : own);
  const furniture = b.tool === "furniture";
  return (
    <div className="gl">
      <PlaceChip tab={v.tab} design={design} />
      <ViewCluster />
      <ModeTabs tab={v.tab} />
      {furniture && <ToolsBar />}
      <KeysChip />
      <section
        aria-label={`${tr("buildMode")}: ${bv(`bvTab_${v.tab}`)}`}
        data-testid="build-strip"
        className="gl-panel pointer-events-auto absolute left-[132px] right-4 bottom-4 h-[268px] grid grid-cols-[196px_minmax(0,1fr)_316px] gl-pop"
      >
        {v.tab === "buy" && (
          <>
            <BuyColumn />
            {middle(<BuyMain />)}
            <div className="min-w-0 min-h-0 flex flex-col" style={{ borderLeft: "1px solid var(--glass-hair)" }}>
              <ItemCard />
            </div>
          </>
        )}
        {v.tab === "build" && (
          <>
            <BuildColumn part={v.part} />
            {middle(<BuildMain part={v.part} members={members} />)}
            <div className="min-w-0 min-h-0 flex flex-col" style={{ borderLeft: "1px solid var(--glass-hair)" }}>
              <BuildCard part={v.part} />
            </div>
          </>
        )}
        {v.tab === "lot" && (
          <>
            <LotColumn lot={v.lot} />
            {middle(<LotMain lot={v.lot} members={members} />)}
            <div className="min-w-0 min-h-0 flex flex-col" style={{ borderLeft: "1px solid var(--glass-hair)" }}>
              <LotCard lot={v.lot} />
            </div>
          </>
        )}
      </section>
      {furniture && <HoverTag />}
      {b.tool === "walls" && <WallTagChip />}
      {b.foundRoom && <FoundRoom roomKey={b.foundRoom} />}
      {b.tool === "walls" && b.wallMode === "select" && b.freeSel && <FreeWallInspector />}
      {furniture && b.mode === "hand" && b.selected.length > 0 && b.carrying === 0 && <ItemToolbar />}
      {b.deskDraft && <DeskDialog seatId={b.deskDraft} members={members} />}
      <ConfirmDialog />
    </div>
  );
}

// top left: what I'm doing, where, and whether it's saved
function PlaceChip({ tab, design }: { tab: Tab; design: boolean }) {
  const w = useWorld();
  const floor = useHud((s) => s.floor);
  const area = useHud((s) => s.me?.areaName ?? "");
  useHud((s) => s.mapVersion);
  const fl = w?.floorName(floor) ?? "";
  // (a town building's floor is named "Diner · ground floor": its area's name isn't said twice)
  const where = [fl, area && !fl.toLowerCase().includes(area.toLowerCase()) ? area : ""].filter(Boolean).join(" · ");
  return (
    <div
      className="gl-panel pointer-events-auto absolute left-4 top-4 h-[60px] flex items-center gap-3 pl-4 pr-5 max-w-[40vw]"
      data-testid="build-place"
    >
      <span
        className="w-[11px] h-[11px] rounded-full shrink-0"
        style={{ background: "var(--glass-acc)", boxShadow: "0 0 10px var(--glass-glow)" }}
        aria-hidden
      />
      <h2 className="gl-title !text-[22px] shrink-0">{design ? bv("bvDesignTab") : bv(`bvTab_${tab}`)}</h2>
      <div className="min-w-0 flex flex-col gap-1">
        <span className="text-[13px] font-bold truncate" style={{ color: "var(--glass-dim)" }}>
          {where}
        </span>
        <SaveState />
      </div>
    </div>
  );
}

// top right: the view — floors, walls, top-down, grid, turn — then undo, redo, Done
function ViewCluster() {
  const t = useTr();
  const w = useWorld();
  const b = useHud((s) => s.build);
  const h = b.history;
  const mic = useHud((s) => s.media.mic);
  const micReady = useHud((s) => s.media.ready || s.media.offline);
  const views: [WallView, IconName, Key][] = [
    ["up", "wUp", "wallViewUp"],
    ["cut", "wCut", "wallViewCut"],
    ["down", "wDown", "wallViewDown"],
  ];
  // (the roofs while building: shown, or hidden by the button; not building, the view's own — hidden over me)
  useEffect(() => {
    const tp = w?.tp;
    if (!tp) return;
    tp.buildRoofs = b.on ? b.roofs : null;
    return () => {
      tp.buildRoofs = null;
    };
  }, [w, b.on, b.roofs]);
  const btn = (icon: IconName, title: string, onClick: () => void, pressed?: boolean, disabled?: boolean) => (
    <button
      type="button"
      className="gl-btn gl-round"
      title={title}
      aria-label={title}
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onClick}
    >
      <Icon name={icon} size={19} />
    </button>
  );
  return (
    <div
      className="gl-panel pointer-events-auto absolute right-4 top-4 h-[60px] flex items-center gap-1.5 px-2.5"
      data-testid="build-view"
    >
      <FloorStepper />
      <span className="gl-sep" aria-hidden />
      <fieldset className="gl-seg border-0 m-0 min-w-0" aria-label={t("wallView")}>
        {views.map(([v, icon, label]) => (
          <button
            key={v}
            type="button"
            className="gl-btn gl-round !h-[34px] !w-[38px] !min-w-[38px]"
            aria-pressed={b.wallView === v}
            title={`${t("wallView")}: ${t(label)} ([ ])`}
            aria-label={t(label)}
            onClick={() => w?.build?.setWallView(v)}
          >
            <Icon name={icon} size={19} />
          </button>
        ))}
      </fieldset>
      <span className="gl-sep" aria-hidden />
      {btn("top", bv("bvTopDown"), () => w?.build?.topDown(), b.topDown)}
      {btn("grid", bv("bvGrid"), () => w?.buildKey("g"), b.grid)}
      {btn("roof", bv("bvRoofs"), () => hud.set((s) => ({ build: { ...s.build, roofs: !s.build.roofs } })), b.roofs)}
      {btn("turnL", bv("bvTurnL"), () => w?.build?.turnCam(-1))}
      {btn("turnR", bv("bvTurnR"), () => w?.build?.turnCam(1))}
      <span className="gl-sep" aria-hidden />
      {btn(mic ? "mic" : "micOff", `${t("mic")} (M)`, () => void w?.toggleMic(), mic, !micReady)}
      {btn(
        "undo",
        `${t("buildUndo")}${h.undoLabel ? `: ${h.undoLabel}` : ""} (${MOD}Z)`,
        () => w?.undo(),
        undefined,
        !h.undo,
      )}
      {btn(
        "redo",
        `${t("buildRedo")}${h.redoLabel ? `: ${h.redoLabel}` : ""} (Shift+${MOD}Z)`,
        () => w?.redo(),
        undefined,
        !h.redo,
      )}
      <button
        type="button"
        className="gl-btn gl-go !px-4"
        data-testid="build-done"
        onClick={() => hud.set((s) => ({ build: { ...s.build, on: false, mode: "hand", props: null } }))}
      >
        <Icon name="check" size={17} />
        {t("buildDone")}
      </button>
    </div>
  );
}

// the floor I'm building, ▼ ▲ (PgDn / PgUp; the Walls tool steps through a floor's mezzanines first), and a menu with
// every floor, a blank one added on top, the top one taken away (never the home floor; a town building's are its own)
function FloorStepper() {
  const t = useTr();
  const w = useWorld();
  const floor = useHud((s) => s.floor);
  const floors = useHud((s) => s.floors);
  const [open, setOpen] = useState(false);
  const [rise, setRise] = useState<StoreyRise>("normal");
  // (a storey asked for: once it's there, up onto it — the ▲ on a lot's top floor, or the menu's)
  const goUp = useRef<readonly number[] | null>(null);
  useEffect(() => {
    const was = goUp.current;
    if (was === null || !w) return;
    // (the floor that wasn't there: the new storey — the house's highest)
    const fresh = floors.filter((f) => !was.includes(f));
    if (!fresh.length) return;
    goUp.current = null;
    const top = fresh.sort((a, b) => (spaceFloor(b)?.storey ?? 0) - (spaceFloor(a)?.storey ?? 0))[0];
    hud.set((s) => ({ build: { ...s.build, over: 0 } }));
    // (once its floor's solid here — the physics catches up a frame after the view —: else I'm taken up onto nothing)
    let tries = 0;
    const go = () => {
      if (w.tp?.body.physics?.floorReady(top) || ++tries > 40) w.goToFloor(top);
      else setTimeout(go, 100);
    };
    go();
  }, [floors, w]);
  const addStorey = (key: string, r: StoreyRise) => {
    if (!w) return;
    const was = [...floors];
    goUp.current = was;
    w.send("lot:storey", { key, dir: "up", rise: r });
    // (refused — the most storeys a house has —: not waiting on a storey someone else puts on later)
    setTimeout(() => {
      if (goUp.current === was) goUp.current = null;
    }, 10_000);
  };
  const step = (up: boolean) => {
    const i = floors.indexOf(floor) + (up ? 1 : -1);
    if (i < 0 || i >= floors.length) return;
    hud.set((s) => ({ build: { ...s.build, over: 0 } }));
    w?.goToFloor(floors[i]);
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key !== "PageUp" && e.key !== "PageDown") return;
      const up = e.key === "PageUp";
      const b = hud.get().build;
      if (w?.structure && b.on && b.tool === "walls") {
        const hs = workingHeights(w.structure, w.level);
        const j = hs.findIndex((v) => Math.abs(v - (b.over ?? 0)) < 1e-3) + (up ? 1 : -1);
        if (j >= 0 && j < hs.length) {
          e.preventDefault();
          hud.set((s) => ({ build: { ...s.build, over: hs[j] } }));
          w.refreshGhost();
          return;
        }
      }
      e.preventDefault();
      step(up);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
  if (!w) return null;
  const i = floors.indexOf(floor);
  const top = floors[floors.length - 1];
  const home = w.building ? (w.building.floor ?? 0) : 0;
  const inSpace = !!spaceFloor(floor);
  // (plan 130: a home lot's storeys — one on top, a basement under, the top or the lowest taken away)
  const sp = spaceFloor(floor);
  const lotKey = sp && isHomeSpace(sp.space) ? homeKeyOf(sp.space) : null;
  const name = w.floorName(floor);
  return (
    <div className="relative flex items-center gap-1.5">
      <button
        type="button"
        className="gl-btn gl-round"
        title={bv("bvFloorDown")}
        aria-label={bv("bvFloorDown")}
        disabled={i <= 0}
        onClick={() => step(false)}
      >
        <Icon name="chev" size={18} />
      </button>
      <button
        type="button"
        className="flex flex-col items-center gap-0.5 min-w-[78px] max-w-[130px] px-1 rounded-xl hover:bg-white/50"
        aria-haspopup="menu"
        aria-expanded={open}
        title={bv("bvFloorMore")}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="gl-lab !text-[10.5px]">{t("floor")}</span>
        <b className="text-[15px] font-black leading-none truncate max-w-full" data-testid="build-floor">
          {floorShort(name) || floorLabel(floor)}
        </b>
      </button>
      {lotKey && i >= floors.length - 1 ? (
        // (a house's top floor: ▲ puts a storey on top and goes up — no menu to find, 2026-11-26)
        <button
          type="button"
          className="gl-btn gl-round"
          title={bv("bvStoreyAdd")}
          aria-label={bv("bvStoreyAdd")}
          data-testid="floor-up-add"
          onClick={() => addStorey(lotKey, "normal")}
        >
          <Icon name="plus" size={18} />
        </button>
      ) : (
        <button
          type="button"
          className="gl-btn gl-round"
          title={bv("bvFloorUp")}
          aria-label={bv("bvFloorUp")}
          disabled={i >= floors.length - 1}
          onClick={() => step(true)}
        >
          <Icon name="chevUp" size={18} />
        </button>
      )}
      {open && (
        <div
          className="gl-panel gl-pop absolute top-[52px] left-1/2 -translate-x-1/2 p-2 flex flex-col gap-1 min-w-[200px] z-20"
          role="menu"
        >
          {[...floors].reverse().map((f) => (
            <button
              key={f}
              type="button"
              role="menuitemradio"
              aria-checked={f === floor}
              className={`gl-btn gl-sm !justify-start ${f === floor ? "gl-on" : ""}`}
              data-floor={f}
              onClick={() => {
                setOpen(false);
                w.goToFloor(f);
              }}
            >
              <span className="w-[22px] text-center">{floorLabel(f)}</span>
              <span className="truncate">{w.floorName(f)}</span>
            </button>
          ))}
          {lotKey && (
            <>
              <fieldset className="flex gap-1 px-1 pt-1 border-0 m-0" aria-label="storey height">
                {(["short", "normal", "tall"] as const).map((r) => (
                  <button
                    key={r}
                    type="button"
                    className={`gl-btn gl-sm flex-1 ${rise === r ? "gl-on" : ""}`}
                    onClick={() => setRise(r)}
                  >
                    {STOREY_RISES[r].toFixed(1)} m
                  </button>
                ))}
              </fieldset>
              <button
                type="button"
                className="gl-btn gl-sm !justify-start"
                data-testid="lot-storey-up"
                onClick={() => {
                  setOpen(false);
                  addStorey(lotKey, rise);
                }}
              >
                <Icon name="plus" size={14} /> {bv("bvStoreyUp")}
              </button>
              <button
                type="button"
                className="gl-btn gl-sm !justify-start"
                data-testid="lot-storey-down"
                onClick={() => {
                  setOpen(false);
                  w.send("lot:storey", { key: lotKey, dir: "down", rise });
                }}
              >
                <Icon name="plus" size={14} /> {bv("bvBasement")}
              </button>
              {(floor === top || floor === floors[0]) && spaceFloor(floor)?.storey !== 0 && (
                <button
                  type="button"
                  className="gl-btn gl-sm gl-bad !justify-start"
                  onClick={() => {
                    setOpen(false);
                    void ask(bv("bvStoreyRemoveAsk"), true).then(
                      (ok) => ok && w.send("lot:storey:remove", { key: lotKey, level: floor }),
                    );
                  }}
                >
                  <Icon name="bin" size={14} /> {bv("bvStoreyRemove")}
                </button>
              )}
            </>
          )}
          {!inSpace && (
            <button
              type="button"
              className="gl-btn gl-sm !justify-start"
              onClick={() => {
                setOpen(false);
                w.send("level:add", {});
              }}
            >
              <Icon name="plus" size={14} /> {t("floorAdd")}
            </button>
          )}
          {!inSpace && top !== home && (
            <button
              type="button"
              className="gl-btn gl-sm gl-bad !justify-start"
              onClick={() => {
                setOpen(false);
                void ask(t("floorRemoveConfirm").replace("{n}", floorLabel(top)), true).then(
                  (ok) => ok && w.send("level:remove", { level: top }),
                );
              }}
            >
              <Icon name="bin" size={14} /> {t("floorRemove")}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
// a floor's short name for the stepper: "Diner · ground floor" → "Ground floor"
function floorShort(name: string): string {
  const last = name.split(" · ").at(-1) ?? "";
  return last ? last[0].toUpperCase() + last.slice(1) : "";
}

// bottom left: Buy · Build · Lot
function ModeTabs({ tab }: { tab: Tab }) {
  const w = useWorld();
  const tabs: [Tab, IconName][] = [
    ["buy", "sofa"],
    ["build", "home"],
    ["lot", "map"],
  ];
  return (
    <div
      className="gl-panel pointer-events-auto absolute left-4 bottom-4 w-[104px] h-[268px] flex flex-col items-center justify-center gap-2.5 py-3"
      role="tablist"
      aria-label={tr("buildMode")}
    >
      {tabs.map(([k, icon]) => (
        <button
          key={k}
          type="button"
          role="tab"
          aria-selected={tab === k}
          data-testid={`build-tab-${k}`}
          className="flex flex-col items-center gap-1 text-[13px] font-extrabold"
          style={{ color: tab === k ? "var(--glass-ink)" : "var(--glass-dim)" }}
          onClick={() => {
            w?.clearRoomGhost();
            hud.set((s) => ({ build: { ...s.build, ...tabPatch(s.build, k) } }));
            w?.build?.refresh();
          }}
        >
          <span className={`gl-btn gl-round !w-[56px] !h-[56px] ${tab === k ? "gl-on" : ""}`} aria-hidden>
            <Icon name={icon} size={28} />
          </span>
          {bv(`bvTab_${k}`)}
        </button>
      ))}
    </div>
  );
}

// over the mode tabs, left: the hand's tools (H · I · K · Design) — out of the scene's middle, where the clicks go
const TOOLS: ["hand" | "eyedrop" | "sledge" | "design", IconName, string, string][] = [
  ["hand", "hand", "bvHand", "H"],
  ["eyedrop", "eyedrop", "bvEyedrop", "I"],
  ["sledge", "sledge", "bvSledge", "K"],
  ["design", "brush", "bvDesignTool", ""],
];
function ToolsBar() {
  const w = useWorld();
  const mode = useHud((s) => s.build.mode);
  return (
    <div
      className="gl-panel pointer-events-auto absolute left-4 bottom-[296px] w-[104px] grid grid-cols-2 gap-2 p-2.5 justify-items-center"
      data-testid="build-tools"
      role="toolbar"
      aria-label={bv("bvHand")}
    >
      {TOOLS.map(([m, icon, label, k]) => (
        <button
          key={m}
          type="button"
          className={`gl-btn gl-round ${m === "sledge" ? "gl-bad" : ""}`}
          aria-pressed={mode === m}
          title={k ? `${bv(label)} (${k})` : bv(label)}
          aria-label={bv(label)}
          onClick={() => w?.build?.setMode(mode === m && m !== "hand" ? "hand" : m)}
        >
          <Icon name={icon} size={20} />
        </button>
      ))}
    </div>
  );
}

// over the strip, right: what the tool in hand does, and the camera's keys (it takes no clicks)
function KeysChip() {
  const b = useHud((s) => s.build);
  const tool = b.tool === "furniture" ? (b.carrying && b.mode !== "place" ? "place" : b.mode) : null;
  return (
    <div
      className="gl-panel pointer-events-none absolute right-4 bottom-[298px] h-[36px] hidden lg:flex items-center gap-3 px-3.5 text-[12px] font-bold whitespace-nowrap"
      style={{ color: "var(--glass-dim)" }}
      data-testid="build-keys"
    >
      {tool && (
        <span className="pr-1.5" style={{ borderRight: "1px solid var(--glass-hair2)" }}>
          <b style={{ color: "var(--glass-ink)" }}>{bv(TOOLS.find((x) => x[0] === tool)?.[2] ?? "bvHand")}</b> ·{" "}
          {bv(`bvHint_${tool}`)} <span className="gl-kk">Esc</span>
        </span>
      )}
      <span>
        <b style={{ color: "var(--glass-ink)" }}>WASD</b> {bv("bvKeysPan")}
      </span>
      <span>
        <b style={{ color: "var(--glass-ink)" }}>Q E</b> {bv("bvKeysTurn")}
      </span>
      <span>
        <b style={{ color: "var(--glass-ink)" }}>{bv("bvWheel")}</b> {bv("bvKeysZoom")}
      </span>
      <span>
        <b style={{ color: "var(--glass-ink)" }}>{bv("bvRightDrag")}</b> {bv("bvKeysOrbit")}
      </span>
      <span>
        <b style={{ color: "var(--glass-ink)" }}>T</b> {bv("bvKeysTop")}
      </span>
    </div>
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
        ? [t("buildSaveFailed"), "var(--error)"]
        : save.state === "rejected"
          ? [t("buildSaveRejected"), "var(--error)"]
          : save.state === "saved"
            ? [
                `${t("buildSaved")} · ${mins < 1 ? t("buildJustNow") : t("buildMinAgo").replace("{n}", String(mins))}`,
                "var(--good)",
              ]
            : [t("buildAutoSave"), "var(--muted)"];
  return (
    <span
      className="flex items-center gap-1.5 text-[11px] font-bold whitespace-nowrap"
      style={{ color: "var(--glass-dim)" }}
      aria-live="polite"
    >
      <i className="w-[7px] h-[7px] rounded-full" style={{ background: color }} />
      {text}
    </span>
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
      const at = w.model?.pointerAt;
      const node = el.current;
      if (!at || !node) return;
      const t = `translate(${Math.round(at.x + 16)}px, ${Math.round(at.y + 18)}px)`;
      if (node.style.transform !== t) node.style.transform = t;
    });
  }, [w]);
  if (!hover || carrying) return null;
  return (
    <div
      ref={el}
      className="gl gl-panel gl-tag pointer-events-none fixed left-0 top-0 z-10 whitespace-nowrap"
      style={hover.by ? { borderColor: "var(--glass-bad)" } : undefined}
    >
      {hover.label}
      {hover.by && (
        <span style={{ color: "var(--danger-text)" }}> · {t("buildHeldTag").replace("{name}", hover.by)}</span>
      )}
      {hover.of && hover.of.n > 1 && (
        <span style={{ color: "var(--muted)" }}>
          {" "}
          · {hover.of.i + 1}/{hover.of.n} <kbd className="keycap">Tab</kbd>
        </span>
      )}
    </div>
  );
}

// A room the walls just closed round (plan 72 phase 11.5; the mocks' 05): named here, or later in
// Rooms (Esc, or anything else, leaves it "New room"). It doesn't take the keys: a run may go on
// (a length typed) — a click in it to name it.
function FoundRoom({ roomKey }: { roomKey: string }) {
  const t = useTr();
  const w = useWorld();
  const [name, setName] = useState("");
  const close = () => hud.set((s) => ({ build: { ...s.build, foundRoom: null } }));
  const save = () => {
    const n = name.trim();
    if (n) w?.send("map:room:update", { key: roomKey, name: n });
    close();
  };
  return (
    <div
      data-testid="found-room"
      // (under the Build chip, top left: centred, it covered the floor menu — 2026-11-26)
      className="gl gl-panel pointer-events-auto fixed left-4 top-[88px] z-30 px-3 py-2.5 flex items-center gap-2 gl-pop"
    >
      <span className="mono text-[11px] uppercase tracking-wide" style={{ color: "var(--vfd)" }}>
        {t("roomFound")}
      </span>
      <button
        type="button"
        className="ghost-btn mono text-[11px] px-2 h-7"
        onClick={close}
        aria-label={t("buildDismiss")}
      >
        ✕
      </button>
      <input
        className="gl-field"
        style={{ width: 190 }}
        placeholder={t("roomNameIt")}
        value={name}
        maxLength={40}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Enter") save();
          if (e.key === "Escape") close();
        }}
        onBlur={() => name.trim() && save()}
      />
    </div>
  );
}

// The Walls tool's chip by the pointer: the face it's on — the room it looks into, its material now → the brush's — or a run
// being drawn (how many walls, how many skipped and why).
function WallTagChip() {
  const t = useTr();
  const w = useWorld();
  const tag = useHud((s) => s.build.wallTag);
  const el = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!w) return;
    return w.onFrame(() => {
      const at = w.model?.pointerAt;
      const node = el.current;
      if (!at || !node) return;
      const tr = `translate(${Math.round(at.x + 18)}px, ${Math.round(at.y + 20)}px)`;
      if (node.style.transform !== tr) node.style.transform = tr;
    });
  }, [w]);
  if (!tag) return null;
  const bad = !!tag.why && (tag.kind === "face" ? !tag.to : tag.kind === "draw" ? true : tag.n === 0);
  const SNAP_KEYS: Record<string, Key> = {
    end: "snapEnd",
    middle: "snapMiddle",
    line: "snapLine",
    square: "snapSquare",
  };
  const swatch = (m: string | null) => {
    const c = WALL_SWATCHES.find((s) => s.ch === `w:${m}`)?.face ?? coverOf(m, "wall")?.tint;
    return c ? (
      <span className="inline-block w-2.5 h-2.5 rounded-sm align-[-1px] mr-1" style={{ background: c }} />
    ) : null;
  };
  return (
    <div
      ref={el}
      data-testid="wall-tag"
      className="gl gl-panel gl-tag pointer-events-none fixed left-0 top-0 z-10 whitespace-nowrap"
      style={bad ? { borderColor: "var(--glass-bad)" } : undefined}
    >
      {tag.kind === "draw" ? (
        tag.remove ? (
          <span style={{ color: "var(--danger-text)" }}>{t("wallTakeAway")}</span>
        ) : (
          <>
            <span style={{ color: "var(--vfd)" }}>
              {tag.typed !== null ? `${tag.typed || "…"} m` : `${tag.len.toFixed(2)} m`}
            </span>
            {tag.len > 0 && tag.bow == null && tag.height === undefined && ` · ${Math.round(tag.ang)}°`}
            {tag.height !== undefined && (
              <span style={{ color: "var(--cream)" }}>
                {" · "}
                {t("wallHigh").replace("{h}", tag.height.toFixed(2))}
                {tag.thick !== undefined && ` · ${t("wallThickTag").replace("{t}", String(tag.thick))}`}
              </span>
            )}
            {tag.bow != null && (
              <span style={{ color: "var(--cream)" }}>
                {" · "}
                {tag.half ? t("arcHalf") : t("arcBow").replace("{m}", Math.abs(tag.bow).toFixed(2))}
              </span>
            )}
            {SNAP_KEYS[tag.snap] && <span style={{ color: "var(--muted)" }}> · {t(SNAP_KEYS[tag.snap])}</span>}
            {tag.n > 0 && (
              <span style={{ color: "var(--muted)" }}> · {t("wallDrawn").replace("{n}", String(tag.n))}</span>
            )}
          </>
        )
      ) : tag.kind === "face" ? (
        <>
          <span style={{ color: "var(--vfd)" }}>{t("wallThisSide")}</span>
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
          <span style={{ color: tag.remove ? "var(--danger-text)" : "var(--vfd)" }}>
            {t(tag.remove ? "wallRunRemove" : "wallRun").replace("{n}", String(tag.n))}
          </span>
          {tag.skipped > 0 && (
            <span style={{ color: "var(--muted)" }}> · {t("wallSkipped").replace("{n}", String(tag.skipped))}</span>
          )}
        </>
      )}
      {tag.why && (
        <div style={{ color: bad ? "var(--danger-text)" : "var(--muted)" }} className="mt-0.5">
          {tag.why}
        </div>
      )}
    </div>
  );
}

// Select on a wall drawn free (plan 72 phase 11.11): a card over it — what it is, how long, high and
// thick, both its faces, and what to do (the tile walls' card's own actions, by its id).
function FreeWallInspector() {
  const t = useTr();
  const w = useWorld();
  const id = useHud((s) => s.build.freeSel);
  useHud((s) => s.mapVersion);
  const el = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!w) return;
    return w.onFrame(() => {
      const node = el.current;
      const at = w.build?.wallAnchor();
      if (!node || !at) return;
      const h = node.offsetHeight;
      const wd = node.offsetWidth;
      const x = Math.min(Math.max(at.x, wd / 2 + 8), window.innerWidth - wd / 2 - 8);
      const y = Math.min(Math.max(at.y, h + 76), window.innerHeight - 96);
      const tr = `translate(${Math.round(x)}px, ${Math.round(y)}px) translate(-50%, -100%)`;
      if (node.style.transform !== tr) node.style.transform = tr;
    });
  }, [w]);
  const wall = w?.build?.freeWall(id ?? null);
  if (!wall) return null;
  const faced = /^[pwfbk]$/.test(wall.front) && !wall.style;
  const kind = wall.style
    ? (WALL_STYLES[wall.style]?.label ?? t("wallInspect"))
    : wall.front === "g"
      ? t("wallGlass")
      : wall.front === "h"
        ? t("wallHalf")
        : t("wallInspect");
  // (plan 130: its trims, each on or off)
  const trims = wall.trim ?? [];
  const trim = (k: string) => (
    <button
      key={k}
      type="button"
      className="mono text-[11px] uppercase tracking-wide px-2 h-7 rounded-md"
      aria-pressed={trims.includes(k)}
      data-testid={`wall-trim-${k}`}
      style={{
        border: "1px solid var(--edge)",
        background: trims.includes(k) ? "var(--glass-accent, #2a84dc)" : "transparent",
        color: trims.includes(k) ? "#fff" : "var(--cream)",
      }}
      onClick={() => w?.build?.wallTrim(k)}
    >
      {bv(`bvTrim_${k}`)}
    </button>
  );
  const len = wallLength(wall);
  const face = (m: string, label: Key) => {
    const c = WALL_SWATCHES.find((s) => s.ch === `w:${m}`)?.face ?? coverOf(m, "wall")?.tint;
    return (
      <div className="flex items-center gap-2 text-[12px]">
        <span
          className="inline-block w-4 h-4 rounded"
          style={{ background: c ?? "var(--muted)", border: "1px solid var(--edge)" }}
        />
        <span className="mono uppercase text-[10px]" style={{ color: "var(--cream-dim)" }}>
          {t(label)}
        </span>
        <span>{faced ? matLabel(m) : kind}</span>
      </div>
    );
  };
  const act = (label: Key, a: "same" | "swap" | "remove", danger = false) => (
    <button
      type="button"
      className="mono text-[11px] uppercase tracking-wide px-2 h-8 rounded-md hover:bg-white/10"
      style={{ color: danger ? "var(--danger-text)" : "var(--cream)", border: "1px solid var(--edge)" }}
      onClick={() => w?.build?.freeWallAction(a)}
    >
      {t(label)}
    </button>
  );
  return (
    <div ref={el} className="pointer-events-none fixed left-0 top-0 z-10">
      <section
        aria-label={t("wallInspect")}
        data-testid="free-wall-inspector"
        className="gl gl-panel pointer-events-auto p-3 flex flex-col gap-2 gl-pop min-w-[260px]"
      >
        <h3 className="lcd text-lg leading-none">{kind}</h3>
        <div className="mono text-[11px]" style={{ color: "var(--muted)" }}>
          {`${len.toFixed(2)} m`} · {t("wallHigh").replace("{h}", wall.height.toFixed(2))} ·{" "}
          {t("wallThickTag").replace("{t}", String(wall.thick ?? 0.2))}
        </div>
        {!wall.style && face(wall.front, "wallThisSide")}
        {!wall.style && face(wall.back ?? wall.front, "wallOtherSide")}
        {!wall.style && (
          <fieldset className="flex flex-wrap gap-1 border-0 m-0 p-0 min-w-0" aria-label={bv("bvTrims")}>
            {WALL_TRIMS.map(trim)}
          </fieldset>
        )}
        <div className="flex flex-wrap gap-1.5">
          {faced && act("wallSame", "same")}
          {faced && act("wallSwap", "swap")}
          {act("wallRemove", "remove", true)}
        </div>
      </section>
    </div>
  );
}

// A little toolbar above what's selected (The Sims' own): move, turn, copy, restyle, save as a setup, sell.
function ItemToolbar() {
  const t = useTr();
  const w = useWorld();
  const sel = useHud((s) => s.build.selected);
  useHud((s) => s.objectsVersion);
  const el = useRef<HTMLDivElement>(null);
  // naming the selection to save it as a setup (null: not naming)
  const [naming, setNaming] = useState<string | null>(null);
  useEffect(() => {
    if (!w) return;
    return w.onFrame(() => {
      const node = el.current;
      const at = sel[0] ? w.build?.anchorOf(sel[0]) : null;
      if (!node || !at) return;
      // over the item (client px), never under the top bars, over the strip or off the screen
      const h = node.offsetHeight;
      const wd = node.offsetWidth;
      const x = Math.min(Math.max(at.x, wd / 2 + 8), window.innerWidth - wd / 2 - 8);
      const y = Math.min(Math.max(at.y, h + 86), window.innerHeight - 300);
      const tr = `translate(${Math.round(x)}px, ${Math.round(y)}px) translate(-50%, -100%)`;
      if (node.style.transform !== tr) node.style.transform = tr;
    });
  }, [w, sel]);
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
  const btn = (icon: IconName, label: string, onClick: () => void, bad = false) => (
    <button
      type="button"
      className={`gl-btn gl-round !w-[36px] !h-[36px] !min-w-[36px] ${bad ? "gl-bad" : ""}`}
      title={label}
      aria-label={label}
      onClick={onClick}
    >
      <Icon name={icon} size={17} />
    </button>
  );
  return (
    <div ref={el} className="pointer-events-none fixed left-0 top-0 z-10 flex flex-col items-center gap-1.5">
      {naming !== null && (
        <form
          className="gl-panel pointer-events-auto gl-pop flex items-center gap-1.5 p-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            void saveSetup();
          }}
        >
          <input
            // biome-ignore lint/a11y/noAutofocus: the field the button just opened
            autoFocus
            value={naming}
            maxLength={40}
            onChange={(e) => setNaming(e.target.value)}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Escape") setNaming(null);
            }}
            placeholder={t("buildSetupName")}
            aria-label={t("buildSetupName")}
            className="gl-field w-[220px]"
          />
          <button type="submit" className="gl-btn gl-sm gl-go" disabled={!naming.trim()}>
            <Icon name="check" size={14} />
          </button>
        </form>
      )}
      <div className="gl-panel pointer-events-auto flex items-center gap-1 p-1.5" data-testid="item-toolbar">
        {sel.length > 1 && (
          <span className="text-[12px] font-extrabold px-1.5">
            {t("buildSelected").replace("{n}", String(sel.length))}
          </span>
        )}
        {btn("move", `${t("buildMove")} (M)`, () => w?.build?.pickSelection())}
        {btn("rotate", `${t("buildRotate")} (R)`, () => w?.buildKey("r"))}
        {btn("copy", `${t("buildDuplicate")} (${MOD}D)`, () => w?.build?.duplicate())}
        {sel.length === 1 && btn("brush", bv("bvDesignTool"), () => w?.build?.setMode("design"))}
        {btn("pin", t("buildSaveSetup"), () => setNaming(""))}
        {btn("sledge", `${t("kRemove")} (Del)`, () => w?.buildKey("delete"), true)}
      </div>
    </div>
  );
}
