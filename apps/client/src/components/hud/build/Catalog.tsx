"use client";

import { CLOTH_COLORS, DECOR, entry, SEAT_SPEC, SURFACE, TEMPLATES, TEXT_DEFAULT } from "@yutopia/shared";
import { GAME_ROOM_SETUP } from "@yutopia/shared/library";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { yutopia } from "@/lib/api";
import { addStrings, type Key, useTr } from "@/lib/i18n";
import { hud, useHud } from "@/world/store";
import { useWorld } from "../ctx";
import { Icon } from "../icons";
import { ask } from "./Dialogs";
import { OpeningOptions } from "./OpeningOptions";
import {
  type BuildPart,
  buildShelf,
  bw,
  FUNCS,
  type Item,
  labelOf,
  NEW_KEYS,
  priceOf,
  ROOMS,
  type Room,
  roomSubs,
  SHOP,
  type ShopItem,
  shopShelf,
  swName,
} from "./shop";
import { ItemThumb, loadPictures } from "./thumbs";

// Build mode's catalog, The Sims 3's Buy mode (docs/plan/124-the-build-view.md, phase 5): along the bottom strip — the
// categories By Room or By Function in its left column, the subcategories and the pictures in the middle (two rows that
// page sideways), the object card on the right. The Build tab's doors, windows and stairs are the same grid.

export { labelOf } from "./shop";

addStrings(
  {
    bvByRoom: ["By room", "Por cômodo"],
    bvByFunc: ["By function", "Por função"],
    bvAll: ["All", "Tudo"],
    bvRecent: ["Recent", "Recentes"],
    bvThings: ["{n} things", "{n} itens"],
    bvPage: ["{a} of {b}", "{a} de {b}"],
    bvPickTitle: ["Pick something", "Escolha algo"],
    bvPickHint: [
      "Click a picture, then click in the room to put it down. Click a thing in the room to lift only it — a plate off its table too.",
      "Clique numa imagem e depois no cômodo para colocar. Clique numa coisa no cômodo para levantar só ela — um prato da mesa também.",
    ],
    bvFits: ["Fits", "Cabe"],
    bvBlocked: ["Doesn't fit here", "Não cabe aqui"],
    bvFacing: ["facing {d}", "virado para {d}"],
    bvMoving: ["Moving {n}", "Movendo {n}"],
    bvMove: ["Move", "Mover"],
    bvDesign: ["Design", "Design"],
    bvSell: ["Sell", "Vender"],
    bvPutDown: ["Put down", "Colocar"],
    bvTurn: ["Turn", "Girar"],
    bvDropToSell: ["Drop it here to sell it", "Solte aqui para vender"],
    bvUnder: ["what's under", "o que está embaixo"],
  },
  "yutopia-build",
);

// which way a thing faces at each quarter turn (seats face their desk): −y north, +x east
const FACING = ["S", "W", "N", "E"];
const LOOK_IX = [0, 1, 2, 3, 4, 5, 6, 7];
const RECENT_KEY = "yutopia:build:recent";

// "2×1", or "wall 3" for things that hang on a wall ("" for things on a
// surface: they take quarter tiles, not tiles).
export function sizeLabel(kind: string): string {
  const e = entry(kind);
  if (e.onSurface) return "";
  return e.wall || e.opening ? `wall ${e.w}` : `${e.w}×${e.h}`;
}

function readRecent(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((k) => typeof k === "string") : [];
  } catch {
    return [];
  }
}
function pushRecent(key: string) {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify([key, ...readRecent().filter((k) => k !== key)].slice(0, 16)));
  } catch {}
}

// Start placing an item (it follows the pointer, like picking it off the shelf).
function choose(i: Item) {
  pushRecent(i.key);
  hud.set((s) => ({
    build: { ...s.build, mode: "place", kind: i.kind, props: i.props ?? null, rot: 0, styling: false },
  }));
}

// the picture under the pointer in the grid: the card shows it (module state: the card is another column)
let hovered: ShopItem | null = null;
const hoverSubs = new Set<() => void>();
function setHovered(i: ShopItem | null) {
  if (hovered === i) return;
  hovered = i;
  for (const s of hoverSubs) s();
}
function useHovered(): ShopItem | null {
  return useSyncExternalStore(
    (cb) => {
      hoverSubs.add(cb);
      return () => hoverSubs.delete(cb);
    },
    () => hovered,
    () => null,
  );
}
/** What's being placed from the catalog, if anything. */
function useCurrent(): ShopItem | null {
  const b = useHud((s) => s.build);
  if (b.mode !== "place") return null;
  return SHOP.find((i) => i.kind === b.kind && (i.props?.d ?? null) === ((b.props?.d as string) ?? null)) ?? null;
}

// ── the left column: By Room · By Function ───────────────────────────────────

export function BuyColumn() {
  const t = useTr();
  const by = useHud((s) => s.build.shopBy);
  const cat = useHud((s) => s.build.shopCat);
  const set = (patch: Partial<ReturnType<typeof hud.get>["build"]>) =>
    hud.set((s) => ({ build: { ...s.build, ...patch } }));
  const list: { key: string; face: string }[] = by === "room" ? ROOMS : FUNCS;
  const here = list.find((c) => c.key === cat) ?? list[0];
  const n = by === "room" ? shopShelf("room", here.key).length : shopShelf("func", here.key).length;
  return (
    <div className="flex flex-col gap-2.5 p-3 min-w-0" style={{ borderRight: "1px solid var(--glass-hair)" }}>
      <div className="gl-seg" role="tablist" aria-label={t("buildFurniture")}>
        {(
          [
            ["room", "bvByRoom", ROOMS[0].key],
            ["func", "bvByFunc", FUNCS[0].key],
          ] as const
        ).map(([k, label, first]) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={by === k}
            className="gl-btn flex-1 gl-sm !px-1.5 !text-[11.5px]"
            onClick={() => by !== k && set({ shopBy: k, shopCat: first, shopSub: "" })}
          >
            {bw(label)}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-4 gap-1.5">
        {list.map((c) => (
          <button
            key={c.key}
            type="button"
            className="gl-tile h-[42px]"
            aria-pressed={c.key === here.key}
            title={bw(`bv_${by === "room" ? "room" : "func"}_${c.key}`)}
            aria-label={bw(`bv_${by === "room" ? "room" : "func"}_${c.key}`)}
            onClick={() => set({ shopCat: c.key, shopSub: "" })}
          >
            <span className="w-[36px] h-[34px] flex items-center justify-center">
              <ItemThumb kind={c.face} />
            </span>
          </button>
        ))}
      </div>
      <div className="mt-auto flex items-baseline justify-between gap-2">
        <span className="gl-title !text-[16px] truncate">
          {bw(`bv_${by === "room" ? "room" : "func"}_${here.key}`)}
        </span>
        <span className="gl-lab shrink-0">{n}</span>
      </div>
    </div>
  );
}

// ── the middle: subcategories, search, the pictures ─────────────────────────

export function BuyMain() {
  const t = useTr();
  const b = useHud((s) => s.build);
  const [q, setQ] = useState("");
  const [recent, setRecent] = useState<string[]>([]);
  const search = useRef<HTMLInputElement>(null);
  useEffect(() => setRecent(readRecent()), []);
  // "/" jumps to the search box
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (e.key !== "/" || tag === "INPUT" || tag === "TEXTAREA") return;
      e.preventDefault();
      search.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const room = b.shopBy === "room";
  const cats: readonly string[] = room ? ROOMS.map((r) => r.key) : FUNCS.map((f) => f.key);
  const cat = cats.includes(b.shopCat) ? b.shopCat : cats[0];
  const subs: string[] = room ? roomSubs(cat as Room) : (FUNCS.find((f) => f.key === cat)?.subs ?? []);
  const sub = b.shopSub === "recent" || subs.includes(b.shopSub) ? b.shopSub : "";
  const found = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? SHOP.filter((i) => labelOf(i).toLowerCase().includes(s) || i.kind.includes(s)) : null;
  }, [q]);
  const items: ShopItem[] =
    found ??
    (sub === "recent"
      ? recent.map((k) => SHOP.find((i) => i.key === k)).filter((i): i is ShopItem => !!i && !!i.func)
      : room
        ? shopShelf("room", cat).filter((i) => !sub || i.func === sub)
        : shopShelf("func", cat, sub));
  const setSub = (s: string) => hud.set((h) => ({ build: { ...h.build, shopSub: s } }));
  const subLabel = (s: string) => bw(room ? `bv_func_${s}` : `bv_sub_${s}`);
  return (
    <div className="flex flex-col gap-2 py-2.5 px-3.5 min-w-0">
      <div className="flex items-center gap-1.5 min-w-0">
        <div className="flex gap-1.5 overflow-x-auto gl-scroll min-w-0 pb-0.5">
          {!found &&
            ["", ...subs, ...(recent.length ? ["recent"] : [])].map((s) => (
              <button
                key={s || "all"}
                type="button"
                className="gl-btn gl-sm shrink-0"
                aria-pressed={sub === s}
                onClick={() => {
                  setSub(s);
                  if (s === "recent") setRecent(readRecent());
                }}
              >
                {s === "recent" && <Icon name="clock" size={13} />}
                {s === "" ? bw("bvAll") : s === "recent" ? bw("bvRecent") : subLabel(s)}
              </button>
            ))}
          {found && <span className="gl-lab self-center">{bw("bvThings").replace("{n}", String(found.length))}</span>}
        </div>
        <label className="gl-field ml-auto shrink-0 w-[170px] flex items-center gap-1.5 !px-2.5" style={{ height: 30 }}>
          <Icon name="search" size={15} />
          <input
            ref={search}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setQ("");
                (e.target as HTMLInputElement).blur();
              }
              if (e.key === "Enter" && found?.[0]) {
                choose(found[0]);
                (e.target as HTMLInputElement).blur();
              }
            }}
            placeholder={t("buildSearch")}
            aria-label={t("buildSearch")}
            className="flex-1 min-w-0 bg-transparent outline-none text-[12.5px] font-bold"
          />
          <span className="gl-kk">/</span>
        </label>
      </div>
      <ItemsGrid items={items} onPicked={() => setRecent(readRecent())} empty={found ? q.trim() : null} />
    </div>
  );
}

/** The Build tab's doors, windows or stairs: the same pictures. */
export function PartItems({ part }: { part: BuildPart }) {
  return (
    <div className="flex flex-col gap-2 py-2.5 px-3.5 min-w-0">
      <div className="flex items-center gap-2">
        <span className="gl-title !text-[17px]">{bw(`bv_build_${part}`)}</span>
        <span className="gl-lab">{bw("bvThings").replace("{n}", String(buildShelf(part).length))}</span>
      </div>
      <ItemsGrid items={buildShelf(part)} />
    </div>
  );
}

// two rows of pictures that page sideways (The Sims 3's grid)
function ItemsGrid({ items, onPicked, empty }: { items: ShopItem[]; onPicked?: () => void; empty?: string | null }) {
  const t = useTr();
  const w = useWorld();
  const current = useCurrent();
  const box = useRef<HTMLDivElement>(null);
  const [page, setPage] = useState({ at: 0, of: 1 });
  const dragging = useRef(false);
  // drag a picture straight into the room: let go over the world to put it down
  useEffect(() => {
    const up = (e: PointerEvent) => {
      if (!dragging.current) return;
      dragging.current = false;
      if (e.target instanceof HTMLCanvasElement) w?.build?.commit();
    };
    window.addEventListener("pointerup", up);
    return () => window.removeEventListener("pointerup", up);
  }, [w]);
  const measure = () => {
    const el = box.current;
    if (!el) return;
    const of = Math.max(1, Math.ceil(el.scrollWidth / Math.max(1, el.clientWidth) - 0.02));
    const at = Math.min(of - 1, Math.round(el.scrollLeft / Math.max(1, el.clientWidth)));
    setPage((p) => (p.at === at && p.of === of ? p : { at, of }));
  };
  // biome-ignore lint/correctness/useExhaustiveDependencies: a new shelf starts at its first page
  useEffect(() => {
    box.current?.scrollTo({ left: 0 });
    requestAnimationFrame(measure);
    // (the picture under the pointer may be gone: the card forgets it — review)
    setHovered(null);
  }, [items]);
  // (and when the grid goes: build mode closed, another tab — the card's hover isn't left behind)
  useEffect(() => () => setHovered(null), []);
  const turn = (d: number) => {
    const el = box.current;
    if (el) el.scrollBy({ left: d * el.clientWidth, behavior: "smooth" });
  };
  if (!items.length)
    return (
      <p className="flex-1 grid place-items-center text-[13px] font-bold" style={{ color: "var(--glass-dim)" }}>
        {empty ? t("buildNoResults").replace("{q}", empty) : "—"}
      </p>
    );
  return (
    <div className="flex-1 min-h-0 flex flex-col gap-1">
      <div
        ref={box}
        onScroll={measure}
        className="flex-1 min-h-0 grid grid-flow-col grid-rows-2 auto-cols-[minmax(88px,1fr)] gap-2 overflow-x-auto gl-scroll snap-x snap-mandatory"
        style={{ gridAutoColumns: "calc((100% - 7 * 8px) / 8)" }}
      >
        {items.map((i) => {
          const price = priceOf(i);
          return (
            <button
              key={i.key}
              type="button"
              className="gl-tile snap-start min-h-0"
              aria-pressed={current?.key === i.key}
              title={labelOf(i)}
              aria-label={labelOf(i)}
              onPointerEnter={() => setHovered(i)}
              onPointerLeave={() => hovered?.key === i.key && setHovered(null)}
              onPointerDown={(e) => {
                if (e.button !== 0) return;
                dragging.current = true;
                choose(i);
                onPicked?.();
              }}
            >
              <span className="absolute inset-x-2 top-1.5 bottom-[20px] flex items-center justify-center drop-shadow-[0_4px_4px_rgba(0,0,0,0.28)]">
                <ItemThumb kind={i.kind} props={i.props} />
              </span>
              {NEW_KEYS.has(i.key) && (
                <span
                  className="absolute top-1 left-1 text-[9px] font-black px-1.5 py-0.5 rounded-md"
                  style={{ background: "var(--glass-acc)", color: "var(--glass-hi)" }}
                >
                  {t("buildNew").toUpperCase()}
                </span>
              )}
              {price !== null && <span className="absolute top-1 right-1.5 text-[10.5px] font-black">§{price}</span>}
              <span
                className="absolute inset-x-1.5 bottom-1 text-[10.5px] font-bold truncate text-center"
                style={{ color: current?.key === i.key ? "var(--glass-ink)" : "var(--glass-dim)" }}
              >
                {labelOf(i)}
              </span>
            </button>
          );
        })}
      </div>
      {page.of > 1 && (
        <div className="flex items-center justify-end gap-1.5 gl-lab">
          {bw("bvPage")
            .replace("{a}", String(page.at + 1))
            .replace("{b}", String(page.of))}
          <button
            type="button"
            className="gl-btn gl-sm !h-[22px] !min-w-[22px] !p-0"
            onClick={() => turn(-1)}
            aria-label="‹"
          >
            <Icon name="chev" size={13} className="rotate-90" />
          </button>
          <button
            type="button"
            className="gl-btn gl-sm !h-[22px] !min-w-[22px] !p-0"
            onClick={() => turn(1)}
            aria-label="›"
          >
            <Icon name="chev" size={13} className="-rotate-90" />
          </button>
        </div>
      )}
    </div>
  );
}

// ── the right: the object card ───────────────────────────────────────────────

/** The card: what's carried (and the bin), what's being placed (its turntable, looks, fabric, words), what the
 *  pointer is on in the grid, what's selected in the room — or how to start. */
export function ItemCard() {
  const t = useTr();
  const w = useWorld();
  const b = useHud((s) => s.build);
  useHud((s) => s.objectsVersion);
  const hover = useHovered();
  const current = useCurrent();
  if (b.held.length > 0) return <Moving />;
  if (hover) return <Details item={hover} />;
  if (current) return <HeldCard item={current} />;
  const sel = b.selected.length === 1 ? w?.model?.getObject(b.selected[0]) : null;
  if (sel) {
    const item: Item = { key: sel.id, kind: sel.kind, props: sel.props ?? undefined };
    return (
      <Details item={item}>
        {/* (plan 130 phase 8) a door's or window's own size, look, shutters, curtains — in a wall drawn free */}
        {entry(sel.kind).opening && sel.props?.free === true && (
          <OpeningOptions kind={sel.kind} props={sel.props ?? {}} apply={(p) => w?.build?.setLook(p)} />
        )}
        <div className="flex gap-1.5 mt-auto">
          <button type="button" className="gl-btn gl-sm" onClick={() => w?.build?.pickSelection()}>
            <Icon name="move" size={15} />
            {bw("bvMove")}
          </button>
          <button type="button" className="gl-btn gl-sm" onClick={() => w?.build?.setMode("design")}>
            <Icon name="brush" size={15} />
            {bw("bvDesign")}
          </button>
          <button type="button" className="gl-btn gl-sm gl-bad" onClick={() => w?.buildKey("delete")}>
            <Icon name="sledge" size={15} />
            {bw("bvSell")}
          </button>
        </div>
      </Details>
    );
  }
  return (
    <div className="flex flex-col gap-2 p-3.5">
      <span className="gl-title">{bw("bvPickTitle")}</span>
      <p className="text-[12.5px] font-semibold leading-snug" style={{ color: "var(--glass-dim)" }}>
        {bw("bvPickHint")}
      </p>
      <p className="text-[12px] font-bold mt-auto flex flex-wrap gap-x-2 gap-y-1" style={{ color: "var(--glass-dim)" }}>
        <span>
          <span className="gl-kk">R</span> {t("buildRotate")}
        </span>
        <span>
          <span className="gl-kk">Tab</span> {bw("bvUnder")}
        </span>
        <span>
          <span className="gl-kk">I</span> {t("buildEyedrop")}
        </span>
        <span>
          <span className="gl-kk">K</span> {bw("bvSell")}
        </span>
      </p>
    </div>
  );
}

/** Fits or not, which way it faces — while something's on the pointer. */
function FitLine() {
  const w = useWorld();
  const b = useHud((s) => s.build);
  const info = b.carrying ? w?.build?.handInfo() : null;
  if (!info) return null;
  return (
    <div className="flex items-center gap-2 text-[12px] font-extrabold">
      <span style={{ color: b.fits ? "var(--glass-good)" : "var(--glass-bad)" }}>
        ● {bw(b.fits ? "bvFits" : "bvBlocked")}
      </span>
      {!entry(info.kind).opening && (
        <span style={{ color: "var(--glass-dim)" }}>{bw("bvFacing").replace("{d}", FACING[info.rot % 4])}</span>
      )}
    </div>
  );
}

function Moving() {
  const w = useWorld();
  const b = useHud((s) => s.build);
  const info = w?.build?.handInfo();
  return (
    <div className="flex flex-col gap-2 p-3.5 min-h-0">
      <div className="flex items-center gap-3">
        {info && (
          <span className="gl-tile w-[64px] h-[56px] shrink-0">
            <span className="absolute inset-1.5 flex items-center justify-center">
              <ItemThumb kind={info.kind} props={info.props} />
            </span>
          </span>
        )}
        <div className="min-w-0">
          <div className="gl-title !text-[18px] truncate">
            {bw("bvMoving").replace("{n}", String(b.held.length > 1 ? b.held.length : 1))}
          </div>
          <FitLine />
        </div>
      </div>
      <div className="flex gap-1.5">
        <button type="button" className="gl-btn gl-sm" onClick={() => w?.buildKey("r")}>
          <Icon name="rotate" size={15} /> {bw("bvTurn")} <span className="gl-kk">R</span>
        </button>
        <button type="button" className="gl-btn gl-sm gl-go" onClick={() => w?.buildKey("enter")}>
          <Icon name="check" size={15} /> {bw("bvPutDown")}
        </button>
      </div>
      <SellBin />
    </div>
  );
}

// What the hovered (or selected) item is: its picture, size and what it does.
function Details({ item, children }: { item: Item; children?: React.ReactNode }) {
  const t = useTr();
  const e = entry(item.kind);
  const chips: string[] = [];
  const size = sizeLabel(item.kind);
  if (size) chips.push(size);
  if (e.seat) chips.push(t("buildInfoSeat"));
  if (e.light) chips.push(t("buildInfoLight"));
  if (e.interact) chips.push(t("buildInfoUse"));
  if (e.surface !== undefined) chips.push(t("buildInfoSurface"));
  if (e.wall) chips.push(t("buildInfoWall"));
  if (e.opening) chips.push(t("buildInfoOpening"));
  if (e.onSurface) chips.push(t("buildInfoOnSurface"));
  if (e.outdoor) chips.push(t("buildInfoOutdoor"));
  if ((e.variants ?? 1) > 1) chips.push(t("buildInfoLooks").replace("{n}", String(e.variants)));
  const price = priceOf(item);
  return (
    <div className="flex flex-col gap-2 p-3.5 min-h-0">
      <div className="flex gap-3">
        <span className="gl-tile w-[104px] h-[96px] shrink-0">
          <span className="absolute inset-2 flex items-center justify-center">
            <ItemThumb kind={item.kind} props={item.props} />
          </span>
        </span>
        <div className="min-w-0 flex flex-col gap-1.5">
          <span className="gl-title">{labelOf(item)}</span>
          <span className="flex flex-wrap gap-1">
            {chips.map((c) => (
              <span key={c} className="gl-chip">
                {c}
              </span>
            ))}
          </span>
        </div>
      </div>
      {price !== null && <span className="gl-title !text-[18px] self-end">§ {price}</span>}
      {children}
    </div>
  );
}

// The piece being put down: on a slow turntable (drag it round), what it is, its looks as pictures, its fabric, its
// words — what's picked goes down with it.
// (the shared palette's paints — avatar.ts CLOTH_COLORS, what the server accepts — by name)
const FABRIC_NAMES = [
  "Rust",
  "Olive",
  "Amber",
  "Cream",
  "Walnut",
  "Slate",
  "Charcoal",
  "Oxblood",
  "Oat",
  "Sage",
  "Plum",
  "Terracotta",
];
export const FABRICS: [string, string][] = CLOTH_COLORS.map((c, i) => [c, swName(FABRIC_NAMES[i] ?? c)]);

function HeldCard({ item }: { item: Item }) {
  const t = useTr();
  const w = useWorld();
  const b = useHud((s) => s.build);
  const e = entry(item.kind);
  const props = { ...(item.props ?? {}), ...(b.props ?? {}) };
  const stage = useRef<HTMLCanvasElement>(null);
  const [looks, setLooks] = useState<readonly string[]>([]);
  const [spins, setSpins] = useState(true);
  const turn = useRef(0.55);
  const drag = useRef<number | null>(null);
  const key = JSON.stringify(props);
  // its turntable: through the panel's picture renderer, a frame at a time while it shows
  // biome-ignore lint/correctness/useExhaustiveDependencies: props are in the key
  useEffect(() => {
    let alive = true;
    let raf = 0;
    let last = performance.now();
    void loadPictures().then((p) => {
      if (!alive) return;
      setLooks(p.looksOf(item.kind));
      if (!p.drawsKind(item.kind)) return setSpins(false);
      setSpins(true);
      let drawn = 0;
      const tick = (now: number) => {
        if (!alive) return;
        if (drag.current === null) turn.current += ((now - last) / 1000) * 0.5;
        last = now;
        const c = stage.current;
        // (20 a second is turntable enough: the world's own frame comes first)
        if (c && now - drawn > 50) {
          drawn = now;
          try {
            p.turntable(c, item.kind, props, turn.current);
          } catch {
            return setSpins(false);
          }
        }
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    });
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
    };
  }, [item.kind, key]);
  const chips: string[] = [sizeLabel(item.kind)];
  const seat = SEAT_SPEC[item.kind];
  if (seat) chips.push(t("buildInfoSeatAt").replace("{m}", seat.top.toFixed(2)));
  const top = SURFACE[item.kind];
  if (top !== undefined) chips.push(t("buildInfoTopAt").replace("{m}", top.toFixed(2)));
  if (e.light) chips.push(t("buildInfoLight"));
  if (e.interact) chips.push(t("buildInfoUse"));
  const v = typeof props.variant === "number" ? props.variant : (e.look ?? 0);
  const price = priceOf(item);
  // (plan 124 follow-up) anything to choose before it goes down: the design panel for it in the strip's middle
  const canStyle = (e.variants ?? 1) > 1 || item.kind in DECOR || !!e.paint || (e.text ?? 0) > 0;
  return (
    <div className="flex flex-col gap-2 p-3.5 min-h-0 overflow-y-auto gl-scroll">
      <div className="flex gap-3">
        <span
          className="gl-tile w-[104px] h-[96px] shrink-0 touch-none"
          style={{ cursor: spins ? "grab" : undefined }}
          onPointerDown={(ev) => {
            drag.current = ev.clientX;
            (ev.currentTarget as HTMLElement).setPointerCapture(ev.pointerId);
          }}
          onPointerMove={(ev) => {
            if (drag.current === null) return;
            turn.current += (ev.clientX - drag.current) * 0.02;
            drag.current = ev.clientX;
          }}
          onPointerUp={() => {
            drag.current = null;
          }}
        >
          {spins ? (
            <canvas ref={stage} width={208} height={192} className="w-full h-full" />
          ) : (
            <span className="absolute inset-2 flex items-center justify-center">
              <ItemThumb kind={item.kind} props={props} />
            </span>
          )}
          {spins && (
            <span
              className="absolute bottom-0.5 inset-x-0 text-center text-[9px] font-bold"
              style={{ color: "var(--glass-dim)" }}
            >
              ◂ {t("buildHeldTurn")} ▸
            </span>
          )}
        </span>
        <div className="min-w-0 flex flex-col gap-1.5">
          <span className="gl-title">{labelOf(item)}</span>
          <span className="flex flex-wrap gap-1">
            {chips.filter(Boolean).map((c) => (
              <span key={c} className="gl-chip">
                {c}
              </span>
            ))}
          </span>
          <FitLine />
          {canStyle && (
            <button
              type="button"
              className="gl-btn gl-sm gl-on self-start"
              data-testid="held-customize"
              onClick={() => hud.set((s) => ({ build: { ...s.build, styling: !s.build.styling } }))}
            >
              <Icon name="brush" size={14} />
              {bw("bvCustomize")}
            </button>
          )}
        </div>
      </div>
      {(e.variants ?? 1) > 1 && !b.styling && (
        <fieldset className="flex items-center gap-1.5 border-0 m-0 min-w-0" aria-label={t("buildHeldLook")}>
          <span className="gl-lab w-[44px] shrink-0">{t("buildHeldLook")}</span>
          <div className="flex gap-1 overflow-x-auto gl-scroll">
            {LOOK_IX.slice(0, e.variants ?? 1).map((k) => (
              <button
                key={k}
                type="button"
                className="gl-tile shrink-0 w-[38px] h-[34px]"
                aria-pressed={v === k}
                title={looks[k] ?? `${t("buildLook")} ${k + 1}`}
                onClick={() => w?.build?.placeLook({ variant: k })}
              >
                <span className="absolute inset-0.5 flex items-center justify-center">
                  <ItemThumb kind={item.kind} props={{ ...props, variant: k }} />
                </span>
              </button>
            ))}
          </div>
        </fieldset>
      )}
      {e.paint && !b.styling && (
        <fieldset className="flex items-center gap-1.5 border-0 m-0 min-w-0" aria-label={t("buildHeldFabric")}>
          <span className="gl-lab w-[44px] shrink-0">{t("buildHeldFabric")}</span>
          <div className="flex gap-1 flex-wrap">
            {FABRICS.map(([c, name]) => (
              <button
                key={c}
                type="button"
                className="w-[20px] h-[20px] rounded-full"
                style={{
                  background: c,
                  boxShadow:
                    props.color === c
                      ? "0 0 0 2px var(--glass-hi), 0 0 0 4px var(--glass-acc)"
                      : "0 1px 3px rgba(0,0,0,.35)",
                }}
                title={name}
                aria-label={name}
                aria-pressed={props.color === c}
                onClick={() => w?.build?.placeLook({ color: props.color === c ? "" : c })}
              />
            ))}
          </div>
        </fieldset>
      )}
      {e.opening && !b.styling && (
        <OpeningOptions kind={item.kind} props={props} apply={(p) => w?.build?.placeLook(p)} />
      )}
      {(e.text ?? 0) > 0 && !b.styling && (
        <input
          defaultValue={String(props.text ?? TEXT_DEFAULT[item.kind] ?? "")}
          maxLength={e.text}
          aria-label={t("buildWords")}
          className="gl-field uppercase"
          onKeyDown={(ev) => {
            ev.stopPropagation();
            if (ev.key === "Enter") (ev.target as HTMLInputElement).blur();
          }}
          onBlur={(ev) => w?.build?.placeLook({ text: ev.target.value })}
        />
      )}
      {price !== null && <span className="gl-title !text-[18px] self-end mt-auto">§ {price}</span>}
    </div>
  );
}

// While carrying placed things: drop them here to sell them (the Sims bin).
function SellBin() {
  const t = useTr();
  const w = useWorld();
  const [over, setOver] = useState(false);
  return (
    <div
      data-build-bin
      className="mt-auto rounded-2xl flex items-center justify-center gap-2 h-[56px] transition-colors font-extrabold text-[12.5px]"
      style={{
        border: `2px dashed ${over ? "var(--glass-bad)" : "var(--glass-hair2)"}`,
        background: over ? "color-mix(in srgb, var(--glass-bad) 16%, transparent)" : "rgba(255,255,255,.45)",
        color: over ? "var(--glass-bad)" : "var(--glass-dim)",
      }}
      onPointerEnter={() => setOver(true)}
      onPointerLeave={() => setOver(false)}
      onPointerUp={() => {
        setOver(false);
        w?.build?.remove();
      }}
    >
      <Icon name="sledge" size={18} />
      {bw("bvDropToSell")}
      <span className="sr-only">{t("buildSell")}</span>
    </div>
  );
}

// My setups: groups of things I saved (a dressed desk…), to place again.
export function Setups() {
  const t = useTr();
  const w = useWorld();
  const setups = useHud((s) => s.build.setups);
  useEffect(() => {
    if (setups) return;
    yutopia
      .setups()
      .then(({ setups }) => hud.set((s) => ({ build: { ...s.build, setups } })))
      .catch(() => hud.set((s) => ({ build: { ...s.build, setups: [] } })));
  }, [setups]);
  const forget = async (id: number) => {
    try {
      await yutopia.deleteSetup(id);
      hud.set((s) => ({ build: { ...s.build, setups: (s.build.setups ?? []).filter((x) => x.id !== id) } }));
    } catch {}
  };
  return (
    <section className="space-y-1.5">
      <h3 className="grp">{t("buildReadyMade")}</h3>
      <button
        type="button"
        className="tile-card w-full h-[64px] flex items-center gap-2 px-2 text-left"
        onClick={() => w?.build?.placeSetup(GAME_ROOM_SETUP)}
        aria-label={`${t("buildSetupPlace")}: ${t("buildGameRoom")}`}
      >
        <span className="flex -space-x-3 shrink-0" aria-hidden>
          {(["crt_tv", "console_nes", "cart_shelf"] as const).map((k) => (
            <span key={k} className="w-10 h-10 flex items-center justify-center">
              <ItemThumb kind={k} />
            </span>
          ))}
        </span>
        <span className="min-w-0">
          <span className="block text-[13px] font-medium truncate">{t("buildGameRoom")}</span>
          <span className="mono text-[10.5px] uppercase" style={{ color: "var(--muted)" }}>
            {t("buildSetupItems").replace("{n}", String(GAME_ROOM_SETUP.length))}
          </span>
        </span>
      </button>
      <h3 className="grp">{t("buildSetups")}</h3>
      {!setups?.length ? (
        <p className="text-xs leading-relaxed" style={{ color: "var(--muted)" }}>
          {setups ? t("buildSetupsEmpty") : "…"}
        </p>
      ) : (
        <ul className="space-y-1.5">
          {setups.map((st) => {
            // its biggest things, as pictures
            const show = st.items.filter((i) => !entry(i.kind).onSurface).slice(0, 4);
            return (
              <li key={st.id} className="flex items-center gap-1.5">
                <button
                  type="button"
                  className="tile-card flex-1 min-w-0 h-[64px] flex items-center gap-2 px-2 text-left"
                  onClick={() => w?.build?.placeSetup(st.items)}
                  aria-label={`${t("buildSetupPlace")}: ${st.name}`}
                >
                  <span className="flex -space-x-3 shrink-0" aria-hidden>
                    {show.map((i, k) => (
                      <span key={`${i.kind}${k}`} className="w-10 h-10 flex items-center justify-center">
                        <ItemThumb kind={i.kind} props={i.props ?? undefined} />
                      </span>
                    ))}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[13px] font-medium truncate">{st.name}</span>
                    <span className="mono text-[10.5px] uppercase" style={{ color: "var(--muted)" }}>
                      {t("buildSetupItems").replace("{n}", String(st.items.length))}
                    </span>
                  </span>
                </button>
                <button
                  type="button"
                  className="w-8 h-8 rounded-lg grid place-items-center hover:bg-white/10 shrink-0"
                  style={{ color: "var(--muted)" }}
                  aria-label={`${t("buildSetupDelete")}: ${st.name}`}
                  title={t("buildSetupDelete")}
                  onClick={() => void forget(st.id)}
                >
                  <Icon name="bin" size={16} />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

// (plan 67) the room I'm standing in furnished by a plan (shared office.ts), or — an admin — the
// whole floor, each room by its name; either undone with Undo
const PLANS: { key: string; name: Key }[] = [
  { key: "open_plan", name: "planOpen" },
  { key: "meeting", name: "planMeeting" },
  { key: "kitchen", name: "planKitchen" },
  { key: "lounge", name: "planLounge" },
  { key: "booths", name: "planBooths" },
  { key: "reception", name: "planReception" },
  // (plan 68)
  { key: "cafe", name: "planCafe" },
  { key: "games", name: "planGames" },
  { key: "library", name: "planLibrary" },
];
function Furnish() {
  const t = useTr();
  const w = useWorld();
  const admin = useHud((s) => s.isAdmin);
  return (
    <section className="space-y-1.5">
      <h3 className="grp">{t("buildFurnishRoom")}</h3>
      <p className="text-xs" style={{ color: "var(--muted)" }}>
        {t("buildFurnishHint")}
      </p>
      <div className="grid grid-cols-2 gap-1.5">
        {PLANS.map((p) => (
          <button
            key={p.key}
            type="button"
            className="ghost-btn justify-start"
            onClick={() => {
              void ask(t("buildFurnishConfirm").replace("{name}", t(p.name))).then(
                (ok) => ok && w?.send("build:furnish", { plan: p.key }),
              );
            }}
          >
            {t(p.name)}
          </button>
        ))}
      </div>
      {admin && (
        <button
          type="button"
          className="ghost-btn w-full"
          onClick={() => {
            void ask(t("buildRefurnishConfirm"), true).then((ok) => ok && w?.send("build:refurnish", {}));
          }}
        >
          {t("buildRefurnish")}
        </button>
      )}
      {admin && (
        // (plan 68) Christmas: every room in the building dressed, or put away
        <div className="grid grid-cols-2 gap-1.5">
          <button
            type="button"
            className="ghost-btn justify-start"
            onClick={() => {
              void ask(t("buildChristmasConfirm")).then((ok) => ok && w?.send("build:christmas", { on: true }));
            }}
          >
            🎄 {t("buildChristmasOn")}
          </button>
          <button
            type="button"
            className="ghost-btn justify-start"
            onClick={() => w?.send("build:christmas", { on: false })}
          >
            {t("buildChristmasOff")}
          </button>
        </div>
      )}
    </section>
  );
}

export function Layouts() {
  const t = useTr();
  const w = useWorld();
  const room = w?.map.areas.find((a) => a.key === "tracking")?.name ?? "Tracking Room";
  return (
    <section className="space-y-1.5">
      <Furnish />
      <h3 className="grp">{t("buildLayouts")}</h3>
      <p className="text-xs" style={{ color: "var(--muted)" }}>
        {t("buildLayoutsFor").replace("{room}", room)}
      </p>
      {TEMPLATES.map((tp) => (
        <div key={tp.key} className="well flex items-center gap-3 px-3 py-2">
          <div className="flex-1 min-w-0">
            <p className="lcd text-lg leading-none">{tp.name.toUpperCase()}</p>
            <p className="mono text-[10.5px] uppercase" style={{ color: "var(--muted)" }}>
              {t("buildPieces").replace("{n}", String(tp.objects.length))}
            </p>
          </div>
          <button
            type="button"
            className="ghost-btn"
            onClick={() => {
              void ask(t("buildLayoutConfirm").replace("{room}", room).replace("{name}", tp.name)).then(
                (ok) => ok && w?.send("build:template", { template: tp.key }),
              );
            }}
          >
            {t("buildLayoutUse")}
          </button>
        </div>
      ))}
    </section>
  );
}
