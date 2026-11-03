"use client";

import { CLOTH_COLORS, entry, FAM_KINDS, SEAT_SPEC, SURFACE, TEMPLATES, TEXT_DEFAULT } from "@yutopia/shared";
import { GAME_ROOM_SETUP } from "@yutopia/shared/library";
import { useEffect, useMemo, useRef, useState } from "react";
import { yutopia } from "@/lib/api";
import { type Key, trMaybe, useTr } from "@/lib/i18n";
import { hud, useHud } from "@/world/store";
import { useWorld } from "../ctx";
import { Icon, type IconName } from "../icons";
import { ItemThumb, loadPictures } from "./thumbs";

// A catalog entry: a kind, and for decor what it is (props.d).
interface Item {
  key: string;
  kind: string;
  props?: Record<string, unknown>;
}
const it = (kind: string): Item => ({ key: kind, kind });
const decor = (kind: "decor" | "tabletop" | "frame", d: string): Item => ({
  key: `${kind}:${d}`,
  kind,
  props: { d, seed: 0.37 },
});
// (plan 68's families, in their own order: shared fam/)
const fam = (...names: string[]): Item[] => names.flatMap((n) => FAM_KINDS[n] ?? []).map(it);

const CATS: { key: string; label: Key; icon: IconName; items: Item[] }[] = [
  {
    key: "seating",
    label: "catSeating",
    icon: "sofa",
    items: [...["chair", "armchair", "sofa", "loveseat", "beanbag", "bench", "bar_stool"].map(it), ...fam("seating2")],
  },
  {
    key: "surfaces",
    label: "catSurfaces",
    icon: "desk",
    items: [
      "desk",
      "standing_desk",
      "meeting_table",
      "coffee_table",
      "side_table",
      "high_table",
      "reception",
      "counter",
    ]
      .map(it)
      .concat(fam("tables2")),
  },
  {
    // (plan 67: what holds things, and the office's own pieces)
    key: "storage",
    label: "catStorage",
    icon: "board",
    items: [
      "cupboard",
      "bookcase",
      "shelving",
      "tape_shelf",
      "filing_cabinet",
      "locker", // (a kit a day: docs/plan/30-the-dark.md)
      "coat_rack",
      "wall_shelf",
    ]
      .map(it)
      .concat(fam("storage2")),
  },
  {
    key: "office",
    label: "catOffice",
    icon: "hammer",
    items: ["printer", "phone_booth", "partition", "water_cooler", "vending"]
      .map(it)
      .concat(fam("office2").filter((i) => i.kind !== "drinks_fridge")),
  },
  {
    // what goes on them: as many as fit, a quarter tile at a time
    key: "tops",
    label: "catTops",
    icon: "mug",
    items: [
      it("computer"),
      ...(["keyboard", "desklamp", "phone"] as const).map((d) => decor("tabletop", d)),
      it("radio"),
      it("turntable"),
      ...(["mug", "papers", "book", "binder", "tapes", "vinyl", "photo", "succulent", "cards", "bell"] as const).map(
        (d) => decor("tabletop", d),
      ),
      ...fam("desktop2"),
    ],
  },
  {
    // YouTube / Jellyfin on them for everyone nearby (docs/plan/10-media.md)
    key: "screens",
    label: "catScreens",
    icon: "tv",
    items: [
      "tv_wall",
      "tv_hd",
      "tv_giant",
      "projector_screen",
      "cinema_screen",
      "projector",
      "tv_console",
      "tv_portable",
      "computer",
    ]
      .map(it)
      .concat(fam("screens2")),
  },
  {
    key: "games",
    label: "catGames",
    icon: "gamepad",
    items: [
      "crt_tv",
      "console_2600",
      "console_nes",
      "console_snes",
      "console_md",
      "console_gb",
      "console_ps1",
      "console_ps1_slim",
      "cart_shelf",
      "disc_rack",
    ]
      .map(it)
      .concat(fam("gameroom")),
  },
  {
    key: "tech",
    label: "catTech",
    icon: "radio",
    items: ["arcade", "slot_track", "pool_table", "pingpong_table", "piano", "mixing_desk", "speaker_cab", "mic_stand"]
      .map(it)
      .concat(fam("music")),
  },
  {
    key: "lights",
    label: "catLights",
    icon: "globe",
    items: [
      it("lamp"),
      it("pendant_light"),
      it("panel_light"),
      it("lava_lamp"),
      decor("tabletop", "desklamp"),
      ...fam("lights2"),
    ],
  },
  {
    key: "walls",
    label: "catWalls",
    icon: "frame",
    items: [
      ...[
        "board_wall",
        "screen_wall",
        "whiteboard",
        "notice_board",
        "clock",
        "neon",
        "light_switch",
        "acoustic_panel",
        "poster",
        "marquee_sign",
        "vfd_ticker",
        "split_flap",
      ].map(it),
      decor("frame", "frame"),
      ...fam("walls2"),
    ],
  },
  {
    // set into a wall (shared openings.ts): the wall keeps its material
    key: "doors",
    label: "catDoors",
    icon: "door",
    items: [
      // (shown shut in the catalog; they go in open)
      { key: "door", kind: "door", props: { state: "closed" } },
      { key: "door:glass", kind: "door", props: { glass: true, state: "closed" } },
      { key: "door_double", kind: "door_double", props: { state: "closed" } },
      { key: "door_studio", kind: "door_studio", props: { state: "closed" } },
      { key: "door_barn", kind: "door_barn", props: { state: "closed" } },
      { key: "door_saloon", kind: "door_saloon", props: { state: "closed" } },
      ...["door_auto", "door_revolving", "door_garage"].map((k) => ({ key: k, kind: k, props: { state: "closed" } })),
      it("archway"),
    ],
  },
  {
    // windows, set into a wall the same way
    key: "windows",
    label: "catWindows",
    icon: "window",
    items: [
      it("window"),
      it("window_wide"),
      it("window_tall"),
      it("window_round"),
      it("window_arched"),
      it("window_high"),
      it("window_stained"),
      it("window_blinds"),
      it("window_studio"),
      ...fam("doors2"),
    ],
  },
  {
    key: "decor",
    label: "catDecor",
    icon: "leaf",
    items: [
      it("plant"),
      decor("decor", "plant"),
      it("fireplace"),
      it("column"),
      decor("decor", "boxes"),
      decor("decor", "bin"),
      decor("decor", "cable"),
      ...fam("decor2"),
    ],
  },
  { key: "floor", label: "catFloor", icon: "marquee", items: ["rug", "standup_mat"].map(it).concat(fam("floor2")) },
  {
    // the building (docs/plan/25): stairs up to the floor above, an elevator's
    // stop (it joins the shaft of the ones above or below), and outside
    key: "building",
    label: "catBuilding",
    icon: "stairs",
    items: ["stairs", "elevator", "car", "lamp_post"].map(it),
  },
  {
    key: "pets",
    label: "catPets",
    icon: "paw",
    items: ["pet_bed", "pet_bowl", "water_bowl", "scratch_post", "pet_house", "toy_box"].map(it).concat(fam("pets2")),
  },
  {
    // out of doors only (shared catalog `outdoor`): Flowmotion's, off indoors
    key: "parkour",
    label: "catParkour",
    icon: "walk",
    items: ["pk_rail", "pk_rail_long", "pk_wall", "pk_wall_tall", "pk_pole", "pk_pole_tall"]
      .map(it)
      .concat(fam("parkour2")),
  },
  {
    // (plan 68 phase 2: Christmas, the first of the seasons)
    key: "seasonal",
    label: "catSeasonal",
    icon: "gift",
    items: [
      "xmas_tree",
      "xmas_tree_small",
      "present",
      "stocking",
      "wreath",
      "garland",
      "mistletoe",
      "advent_calendar",
      "poinsettia",
      "nutcracker",
      "candle_arch",
      "gingerbread_house",
      "xmas_village",
      "cocoa_station",
      "wrapping_table",
    ]
      .map(it)
      .concat(fam("seasons")),
  },
  {
    // out of doors only (shared catalog `outdoor`)
    key: "outdoors",
    label: "catOutdoors",
    icon: "land",
    items: ["candy_cane", "reindeer", "sleigh", "inflatable_snowman", "snow_globe"].map(it).concat(fam("outdoors")),
  },
  {
    // (plan 68 phase 19: the kitchen and the café, with the office's fridge, microwave and coffee)
    key: "kitchen",
    label: "catKitchen",
    icon: "mug",
    items: [...fam("kitchen"), ...["fridge", "drinks_fridge", "microwave", "coffee_machine"].map(it)],
  },
];
const ALL = CATS.flatMap((c) => c.items);
const LOOK_IX = [0, 1, 2, 3, 4, 5, 6, 7];
// (plan 67's new pieces, badged NEW in the panel)
const NEW = new Set([
  "standing_desk",
  "filing_cabinet",
  "printer",
  "shelving",
  "fridge",
  "microwave",
  "bar_stool",
  "high_table",
  "phone_booth",
  "coat_rack",
  "wall_shelf",
  "pendant_light",
  "panel_light",
  "toy_box",
  // (plan 68's)
  "loveseat",
  "fireplace",
  "lava_lamp",
  ...["xmas_tree", "xmas_tree_small", "present", "stocking", "wreath", "garland", "mistletoe"],
  ...["advent_calendar", "poinsettia", "nutcracker", "candle_arch", "gingerbread_house", "xmas_village"],
  ...["cocoa_station", "wrapping_table", "candy_cane", "reindeer", "sleigh", "inflatable_snowman", "snow_globe"],
  "marquee_sign",
  "vfd_ticker",
  "split_flap",
  "door_auto",
  "door_revolving",
  "door_garage",
  ...Object.values(FAM_KINDS).flat(),
]);
const RECENT_KEY = "yutopia:build:recent";

function labelOf(i: Item): string {
  if (i.props?.d) return trMaybe(`decor_${String(i.props.d)}`) ?? entry(i.kind).label;
  if (i.kind === "door" && i.props?.glass) return "Glass door";
  return entry(i.kind).label;
}

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
    localStorage.setItem(RECENT_KEY, JSON.stringify([key, ...readRecent().filter((k) => k !== key)].slice(0, 6)));
  } catch {}
}

// Start placing an item (it follows the pointer, like picking it off the shelf).
function choose(i: Item) {
  pushRecent(i.key);
  hud.set((s) => ({ build: { ...s.build, mode: "place", kind: i.kind, props: i.props ?? null, rot: 0 } }));
}

export function Catalog() {
  const t = useTr();
  const w = useWorld();
  // (the tab is kept in the HUD: the Walls panel opens Doors & windows)
  const cat = useHud((s) => s.build.catalogTab);
  const setCat = (k: string) => hud.set((s) => ({ build: { ...s.build, catalogTab: k } }));
  const [q, setQ] = useState("");
  const [hover, setHover] = useState<Item | null>(null);
  const [recent, setRecent] = useState<string[]>([]);
  const search = useRef<HTMLInputElement>(null);
  const b = useHud((s) => s.build);

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

  // Drag a card straight into the room: let go over the world to put it down.
  useEffect(() => {
    const up = (e: PointerEvent) => {
      if (!dragging.current) return;
      dragging.current = false;
      if (e.target instanceof HTMLCanvasElement) w?.build?.commit();
    };
    window.addEventListener("pointerup", up);
    return () => window.removeEventListener("pointerup", up);
  }, [w]);
  const dragging = useRef(false);

  const found = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? ALL.filter((i) => labelOf(i).toLowerCase().includes(s) || i.kind.includes(s)) : null;
  }, [q]);
  const shown = found ?? CATS.find((c) => c.key === cat)?.items ?? [];
  const recentItems = recent.map((k) => ALL.find((i) => i.key === k)).filter((i): i is Item => !!i);
  const current = ALL.find((i) => i.kind === b.kind && (i.props?.d ?? null) === ((b.props?.d as string) ?? null));
  const details = hover ?? (b.mode === "place" ? current : null) ?? null;

  const card = (i: Item, small = false) => {
    const on = b.mode === "place" && current?.key === i.key;
    return (
      <button
        key={i.key}
        type="button"
        className={`tile-card text-left ${small ? "h-[74px]" : "h-[112px]"}`}
        aria-pressed={on}
        title={labelOf(i)}
        aria-label={labelOf(i)}
        onPointerEnter={() => setHover(i)}
        onPointerLeave={() => setHover((h) => (h?.key === i.key ? null : h))}
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          dragging.current = true;
          choose(i);
          setRecent(readRecent());
        }}
      >
        <span
          className={`absolute inset-x-2 top-2 flex items-center justify-center drop-shadow-[0_4px_4px_rgba(0,0,0,0.35)] ${small ? "h-[50px]" : "h-[68px]"}`}
        >
          <ItemThumb kind={i.kind} props={i.props} />
        </span>
        {!small && sizeLabel(i.kind) && (
          <span
            className="absolute top-1.5 right-1.5 mono text-[10px] px-1.5 rounded"
            style={{ background: "rgba(0,0,0,.35)", color: "var(--muted)" }}
          >
            {sizeLabel(i.kind)}
          </span>
        )}
        {on ? (
          <span
            className="absolute top-1.5 left-1.5 mono text-[9px] px-1.5 rounded"
            style={{ background: "var(--vfd)", color: "var(--ink)" }}
          >
            {t("buildPlacing").toUpperCase()}
          </span>
        ) : (
          !small &&
          NEW.has(i.kind) && (
            <span
              className="absolute top-1.5 left-1.5 mono text-[9px] px-1.5 rounded"
              style={{ background: "var(--rust)", color: "var(--cream)" }}
            >
              {t("buildNew").toUpperCase()}
            </span>
          )
        )}
        {!small && (entry(i.kind).variants ?? 1) > 1 && (
          // its looks, as dots (plan 67's panel)
          <span className="absolute left-2 bottom-[22px] flex gap-[3px]" aria-hidden>
            {LOOK_IX.slice(0, entry(i.kind).variants ?? 1).map((k) => (
              <i
                key={k}
                className="block w-[5px] h-[5px] rounded-full"
                style={{ background: k === (entry(i.kind).look ?? 0) ? "var(--amber)" : "var(--edge-strong)" }}
              />
            ))}
          </span>
        )}
        {!small && (
          <span className="absolute left-2 right-2 bottom-1.5 text-[11.5px] font-medium truncate">{labelOf(i)}</span>
        )}
      </button>
    );
  };

  return (
    <>
      <header className="flex items-baseline justify-between px-4 pt-3 pb-2">
        <h2 className="lcd text-2xl leading-none">{t("buildFurniture").toUpperCase()}</h2>
        <span className="mono text-[11px] uppercase" style={{ color: "var(--muted)" }}>
          {ALL.length} {t("buildItems")}
        </span>
      </header>
      <label
        className="mx-3 flex items-center gap-2 rounded-[9px] px-2.5 h-9 focus-within:border-[var(--amber)]"
        style={{ background: "var(--field)", border: "1px solid var(--edge)", color: "var(--muted)" }}
      >
        <Icon name="search" size={16} />
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
          className="flex-1 min-w-0 bg-transparent outline-none text-sm"
          style={{ color: "var(--cream)" }}
        />
        <span className="keycap" style={{ color: "var(--muted)" }}>
          /
        </span>
      </label>
      {!found && (
        // the categories as labelled chips with their counts, one row that scrolls (plan 67's panel)
        <div
          className="flex gap-1.5 px-3 pt-2.5 pb-0.5 overflow-x-auto scroll-thin"
          role="tablist"
          aria-label={t("buildFurniture")}
        >
          {[
            ...CATS.map((c) => ({ key: c.key, label: t(c.label), icon: c.icon, n: c.items.length as number | null })),
            { key: "layouts", label: t("buildLayouts"), icon: "room" as IconName, n: null },
            { key: "setups", label: t("buildSetups"), icon: "pin" as IconName, n: null },
          ].map((c) => (
            <button
              key={c.key}
              type="button"
              role="tab"
              aria-selected={cat === c.key}
              className="cat-chip shrink-0 flex items-center gap-1.5 h-8 px-2.5 rounded-full text-[12px] whitespace-nowrap"
              style={{
                background: cat === c.key ? "var(--amber)" : "var(--field)",
                color: cat === c.key ? "var(--ink)" : "var(--cream-dim)",
                border: `1px solid ${cat === c.key ? "var(--amber)" : "var(--edge)"}`,
              }}
              onClick={() => setCat(c.key)}
            >
              <Icon name={c.icon} size={14} />
              {c.label}
              {c.n !== null && <em className="mono not-italic text-[10px] opacity-70">{c.n}</em>}
            </button>
          ))}
        </div>
      )}
      <div className="flex-1 min-h-0 overflow-y-auto scroll-thin px-3 pt-2 pb-3 space-y-3">
        {!found && recentItems.length > 0 && cat !== "layouts" && cat !== "setups" && (
          <section className="space-y-1.5">
            <h3 className="grp flex items-center gap-1.5">
              <Icon name="clock" size={12} />
              {t("buildRecent")}
            </h3>
            <div className="grid grid-cols-6 gap-[5px]">{recentItems.map((i) => card(i, true))}</div>
          </section>
        )}
        {cat === "layouts" && !found ? (
          <Layouts />
        ) : cat === "setups" && !found ? (
          <Setups />
        ) : shown.length ? (
          <section className="space-y-1.5">
            <h3 className="grp">
              {found ? t("buildSearch") : t(CATS.find((c) => c.key === cat)?.label ?? "catSeating")}
            </h3>
            <div className="grid grid-cols-3 gap-[7px]">{shown.map((i) => card(i))}</div>
          </section>
        ) : (
          <p className="text-sm py-6 text-center" style={{ color: "var(--muted)" }}>
            {t("buildNoResults").replace("{q}", q.trim())}
          </p>
        )}
      </div>
      {b.held.length > 0 ? (
        <SellBin />
      ) : b.mode === "place" && current && !hover ? (
        <HeldCard item={current} />
      ) : details ? (
        <Details item={details} />
      ) : null}
    </>
  );
}

// What the hovered (or chosen) item is: its size and what it does.
function Details({ item }: { item: Item }) {
  const t = useTr();
  const e = entry(item.kind);
  const chips: string[] = [];
  if (e.seat) chips.push(t("buildInfoSeat"));
  if (e.light) chips.push(t("buildInfoLight"));
  if (e.interact) chips.push(t("buildInfoUse"));
  if (e.surface !== undefined) chips.push(t("buildInfoSurface"));
  if (e.wall) chips.push(t("buildInfoWall"));
  if (e.opening) chips.push(t("buildInfoOpening"));
  if (e.onSurface) chips.push(t("buildInfoOnSurface"));
  if (e.outdoor) chips.push(t("buildInfoOutdoor"));
  if ((e.variants ?? 1) > 1) chips.push(t("buildInfoLooks").replace("{n}", String(e.variants)));
  return (
    <footer className="flex items-center gap-3 px-3 py-2.5" style={{ borderTop: "1px solid var(--edge)" }}>
      <span
        className="w-[64px] h-[52px] rounded-lg flex items-center justify-center p-1 shrink-0"
        style={{
          background: "radial-gradient(90% 70% at 50% 62%,var(--tile-hi),var(--panel) 72%)",
          border: "1px solid var(--edge)",
        }}
      >
        <ItemThumb kind={item.kind} props={item.props} />
      </span>
      <span className="min-w-0">
        <span className="lcd text-xl leading-none block truncate">{labelOf(item).toUpperCase()}</span>
        <span className="mono text-[10.5px] uppercase block" style={{ color: "var(--muted)" }}>
          {[sizeLabel(item.kind), ...chips].filter(Boolean).join(" · ")}
        </span>
      </span>
    </footer>
  );
}

// The piece being put down (plan 67's panel): on a slow turntable (drag it round), what it is, its
// looks as pictures and its fabrics or paints by name — what's picked goes down with it.
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
const FABRICS: [string, string][] = CLOTH_COLORS.map((c, i) => [c, FABRIC_NAMES[i] ?? c]);
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
  if (e.wall) chips.push(t("buildInfoWall"));
  const v = typeof props.variant === "number" ? props.variant : (e.look ?? 0);
  return (
    <footer className="px-3 pt-2.5 pb-3 space-y-2" style={{ borderTop: "1px solid var(--edge)" }}>
      <div className="flex items-center gap-3">
        <span
          className="relative w-[120px] h-[96px] rounded-lg shrink-0 overflow-hidden touch-none"
          style={{
            background: "radial-gradient(90% 70% at 50% 62%,var(--tile-hi),var(--panel) 72%)",
            border: "1px solid var(--edge)",
            cursor: spins ? "grab" : undefined,
          }}
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
            <canvas ref={stage} width={240} height={192} className="w-full h-full" />
          ) : (
            <span className="absolute inset-1 flex items-center justify-center">
              <ItemThumb kind={item.kind} props={props} />
            </span>
          )}
          {spins && (
            <span
              className="absolute bottom-0.5 inset-x-0 text-center mono text-[9px]"
              style={{ color: "var(--muted)" }}
            >
              {t("buildHeldTurn")}
            </span>
          )}
        </span>
        <span className="min-w-0">
          <span className="lcd text-xl leading-none block truncate">{labelOf(item).toUpperCase()}</span>
          <span className="mono text-[10.5px] uppercase block" style={{ color: "var(--muted)" }}>
            {chips.filter(Boolean).join(" · ")}
          </span>
          {(e.variants ?? 1) > 1 && (
            <span className="mono text-[10px] block mt-1" style={{ color: "var(--muted)" }}>
              <span className="keycap">L</span> {t("buildHeldNextLook")}
            </span>
          )}
        </span>
      </div>
      {(e.text ?? 0) > 0 && (
        <label className="flex flex-col gap-1">
          <span className="grp">{t("buildWords")}</span>
          <input
            defaultValue={String(props.text ?? TEXT_DEFAULT[item.kind] ?? "")}
            maxLength={e.text}
            aria-label={t("buildWords")}
            className="h-8 rounded-md px-2 mono text-sm uppercase bg-transparent"
            style={{ border: "1px solid var(--edge)", color: "var(--cream)" }}
            onKeyDown={(ev) => {
              ev.stopPropagation();
              if (ev.key === "Enter") (ev.target as HTMLInputElement).blur();
            }}
            onBlur={(ev) => w?.build?.placeLook({ text: ev.target.value })}
          />
        </label>
      )}
      {(e.variants ?? 1) > 1 && (
        <fieldset className="space-y-1" aria-label={t("buildHeldLook")}>
          <legend className="grp">{t("buildHeldLook")}</legend>
          <div className="flex gap-1.5 overflow-x-auto scroll-thin">
            {LOOK_IX.slice(0, e.variants ?? 1).map((k) => (
              <button
                key={k}
                type="button"
                className="tile-card shrink-0 w-[68px] h-[76px]"
                aria-pressed={v === k}
                title={looks[k] ?? `${t("buildLook")} ${k + 1}`}
                onClick={() => w?.build?.placeLook({ variant: k })}
              >
                <span className="absolute inset-x-1 top-1 h-[50px] flex items-center justify-center">
                  <ItemThumb kind={item.kind} props={{ ...props, variant: k }} />
                </span>
                <span className="absolute inset-x-1 bottom-1 text-[9.5px] leading-tight truncate text-center">
                  {looks[k] ?? k + 1}
                </span>
              </button>
            ))}
          </div>
        </fieldset>
      )}
      {e.paint && (
        <fieldset className="space-y-1" aria-label={t("buildHeldFabric")}>
          <legend className="grp">
            {t("buildHeldFabric")} · {FABRICS.find(([c]) => c === props.color)?.[1] ?? t("buildColourDefault")}
          </legend>
          <div className="flex gap-1 flex-wrap items-center">
            <button
              type="button"
              className="w-6 h-6 rounded-full border-2 grid place-items-center text-[11px]"
              style={{ borderColor: props.color ? "#0006" : "var(--amber)", color: "var(--cream-dim)" }}
              title={t("buildColourDefault")}
              aria-label={t("buildColourDefault")}
              aria-pressed={!props.color}
              onClick={() => w?.build?.placeLook({ color: "" })}
            >
              ×
            </button>
            {FABRICS.map(([c, name]) => (
              <button
                key={c}
                type="button"
                className="w-6 h-6 rounded-full border-2"
                style={{ background: c, borderColor: props.color === c ? "var(--amber)" : "#0006" }}
                title={name}
                aria-label={name}
                aria-pressed={props.color === c}
                onClick={() => w?.build?.placeLook({ color: c })}
              />
            ))}
          </div>
        </fieldset>
      )}
    </footer>
  );
}

// While carrying placed things: drop them here to remove them (the Sims bin).
function SellBin() {
  const t = useTr();
  const w = useWorld();
  const [over, setOver] = useState(false);
  return (
    <footer
      data-build-bin
      className="m-3 mt-0 rounded-xl flex items-center justify-center gap-2 h-[60px] transition-colors"
      style={{
        border: `2px dashed ${over ? "var(--danger-hot)" : "var(--edge-strong)"}`,
        background: over ? "rgba(199,69,45,.22)" : "rgba(0,0,0,.18)",
        color: over ? "var(--danger-soft)" : "var(--cream-dim)",
      }}
      onPointerEnter={() => {
        setOver(true);
      }}
      onPointerLeave={() => {
        setOver(false);
      }}
      onPointerUp={() => {
        setOver(false);
        w?.build?.remove();
      }}
    >
      <Icon name="bin" size={20} />
      <span className="mono text-xs uppercase tracking-wider">{t("buildSell")}</span>
    </footer>
  );
}

// My setups: groups of things I saved (a dressed desk…), to place again.
function Setups() {
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
              if (window.confirm(t("buildFurnishConfirm").replace("{name}", t(p.name))))
                w?.send("build:furnish", { plan: p.key });
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
            if (window.confirm(t("buildRefurnishConfirm"))) w?.send("build:refurnish", {});
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
              if (window.confirm(t("buildChristmasConfirm"))) w?.send("build:christmas", { on: true });
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

function Layouts() {
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
              if (window.confirm(t("buildLayoutConfirm").replace("{room}", room).replace("{name}", tp.name)))
                w?.send("build:template", { template: tp.key });
            }}
          >
            {t("buildLayoutUse")}
          </button>
        </div>
      ))}
    </section>
  );
}
