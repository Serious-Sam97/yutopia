"use client";

import { entry, TEMPLATES } from "@yutopia/shared";
import { GAME_ROOM_SETUP } from "@yutopia/shared/library";
import { useEffect, useMemo, useRef, useState } from "react";
import { yutopia } from "@/lib/api";
import { type Key, trMaybe, useTr } from "@/lib/i18n";
import { hud, useHud } from "@/world/store";
import { useWorld } from "../ctx";
import { Icon, type IconName } from "../icons";
import { ItemThumb } from "./thumbs";

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

const CATS: { key: string; label: Key; icon: IconName; items: Item[] }[] = [
  {
    key: "seating",
    label: "catSeating",
    icon: "sofa",
    items: ["chair", "armchair", "sofa", "beanbag", "bench"].map(it),
  },
  {
    key: "surfaces",
    label: "catSurfaces",
    icon: "desk",
    items: [
      "desk",
      "meeting_table",
      "coffee_table",
      "side_table",
      "cupboard",
      "counter",
      "bookcase",
      "reception",
      "tape_shelf",
    ].map(it),
  },
  {
    // what goes on them: as many as fit, a quarter tile at a time
    key: "tops",
    label: "catTops",
    icon: "mug",
    items: [
      ...(["monitor", "keyboard", "desklamp", "phone"] as const).map((d) => decor("tabletop", d)),
      it("radio"),
      it("turntable"),
      it("coffee_machine"),
      ...(["mug", "papers", "book", "binder", "tapes", "vinyl", "photo", "succulent", "cards", "bell"] as const).map(
        (d) => decor("tabletop", d),
      ),
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
    ].map(it),
  },
  {
    key: "games",
    label: "catGames",
    icon: "gamepad",
    items: ["crt_tv", "console_2600", "console_nes", "console_snes", "console_md", "console_gb", "cart_shelf"].map(it),
  },
  {
    key: "tech",
    label: "catTech",
    icon: "radio",
    items: [
      "lamp",
      "arcade",
      "slot_track",
      "piano",
      "vending",
      "water_cooler",
      "mixing_desk",
      "speaker_cab",
      "mic_stand",
    ].map(it),
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
      ].map(it),
      decor("frame", "frame"),
    ],
  },
  {
    key: "decor",
    label: "catDecor",
    icon: "leaf",
    items: [
      it("plant"),
      it("partition"),
      it("column"),
      decor("decor", "boxes"),
      decor("decor", "bin"),
      decor("decor", "cable"),
    ],
  },
  { key: "floor", label: "catFloor", icon: "marquee", items: ["rug", "standup_mat"].map(it) },
];
const ALL = CATS.flatMap((c) => c.items);
const RECENT_KEY = "yutopia:build:recent";

function labelOf(i: Item): string {
  if (i.props?.d) return trMaybe(`decor_${String(i.props.d)}`) ?? entry(i.kind).label;
  return entry(i.kind).label;
}

// "2×1", or "wall 3" for things that hang on a wall ("" for things on a
// surface: they take quarter tiles, not tiles).
export function sizeLabel(kind: string): string {
  const e = entry(kind);
  if (e.onSurface) return "";
  return e.wall ? `wall ${e.w}` : `${e.w}×${e.h}`;
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
  const [cat, setCat] = useState<string>("seating");
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
        {on && (
          <span
            className="absolute top-1.5 left-1.5 mono text-[9px] px-1.5 rounded"
            style={{ background: "var(--vfd)", color: "var(--ink)" }}
          >
            {t("buildPlacing").toUpperCase()}
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
        style={{ background: "#140e0a", border: "1px solid var(--edge)", color: "var(--muted)" }}
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
        <div className="grid grid-cols-9 gap-1 px-3 pt-2.5" role="tablist" aria-label={t("buildFurniture")}>
          {CATS.map((c) => (
            <button
              key={c.key}
              type="button"
              role="tab"
              aria-selected={cat === c.key}
              title={t(c.label)}
              aria-label={t(c.label)}
              className="rail-btn flex h-10 w-full min-w-0"
              onClick={() => setCat(c.key)}
            >
              <Icon name={c.icon} size={19} />
            </button>
          ))}
          <button
            type="button"
            role="tab"
            aria-selected={cat === "layouts"}
            title={t("buildLayouts")}
            aria-label={t("buildLayouts")}
            className="rail-btn flex h-10 w-full min-w-0"
            onClick={() => setCat("layouts")}
          >
            <Icon name="room" size={19} />
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={cat === "setups"}
            title={t("buildSetups")}
            aria-label={t("buildSetups")}
            className="rail-btn flex h-10 w-full min-w-0"
            onClick={() => setCat("setups")}
          >
            <Icon name="pin" size={19} />
          </button>
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
      {b.held.length > 0 ? <SellBin /> : details ? <Details item={details} /> : null}
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
  if (e.onSurface) chips.push(t("buildInfoOnSurface"));
  if ((e.variants ?? 1) > 1) chips.push(t("buildInfoLooks").replace("{n}", String(e.variants)));
  return (
    <footer className="flex items-center gap-3 px-3 py-2.5" style={{ borderTop: "1px solid var(--edge)" }}>
      <span
        className="w-[64px] h-[52px] rounded-lg flex items-center justify-center p-1 shrink-0"
        style={{
          background: "radial-gradient(90% 70% at 50% 62%,#4a3324,#241912 72%)",
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

// While carrying placed things: drop them here to remove them (the Sims bin).
function SellBin() {
  const t = useTr();
  const w = useWorld();
  const [over, setOver] = useState(false);
  // it unmounts as soon as the hand is empty, maybe under the pointer
  useEffect(() => () => w?.build?.setOverBin(false), [w]);
  return (
    <footer
      data-build-bin
      className="m-3 mt-0 rounded-xl flex items-center justify-center gap-2 h-[60px] transition-colors"
      style={{
        border: `2px dashed ${over ? "#e7714f" : "#7a5636"}`,
        background: over ? "rgba(199,69,45,.22)" : "rgba(0,0,0,.18)",
        color: over ? "#ffb39a" : "var(--cream-dim)",
      }}
      onPointerEnter={() => {
        setOver(true);
        w?.build?.setOverBin(true);
      }}
      onPointerLeave={() => {
        setOver(false);
        w?.build?.setOverBin(false);
      }}
      onPointerUp={() => {
        setOver(false);
        w?.build?.setOverBin(false);
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

function Layouts() {
  const t = useTr();
  const w = useWorld();
  const room = w?.map.areas.find((a) => a.key === "tracking")?.name ?? "Tracking Room";
  return (
    <section className="space-y-1.5">
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
