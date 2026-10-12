"use client";

import { CATALOG, entry, TEMPLATES } from "@yutopia/shared";
import { useEffect, useMemo, useRef, useState } from "react";
import { type Key, useTr } from "@/lib/i18n";
import { hud, useHud } from "@/world/store";
import { useWorld } from "../ctx";
import { Icon } from "../icons";
import { ItemThumb } from "./thumbs";

type Kind = keyof typeof CATALOG;
const GROUPS: { key: "work" | "comfy" | "studio"; label: Key; kinds: Kind[] }[] = [
  {
    key: "work",
    label: "buildWork",
    kinds: ["desk", "chair", "meeting_table", "whiteboard", "board_wall", "screen_wall", "notice_board"],
  },
  {
    key: "comfy",
    label: "buildComfy",
    kinds: ["sofa", "armchair", "bench", "coffee_table", "rug", "lamp", "plant", "column"],
  },
  {
    key: "studio",
    label: "buildStudio",
    kinds: [
      "tape_shelf",
      "radio",
      "arcade",
      "coffee_machine",
      "mic_stand",
      "mixing_desk",
      "speaker_cab",
      "acoustic_panel",
      "poster",
      "reception",
      "standup_mat",
    ],
  },
];
type Filter = "all" | (typeof GROUPS)[number]["key"] | "layouts";
const ALL_KINDS = GROUPS.flatMap((g) => g.kinds);

// "2×1", or "wall 3" for things that hang on a wall.
export function sizeLabel(kind: string): string {
  const e = entry(kind);
  return e.wall ? `wall ${e.w}` : `${e.w}×${e.h}`;
}

export function Catalog() {
  const t = useTr();
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");
  const search = useRef<HTMLInputElement>(null);

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

  const found = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? ALL_KINDS.filter((k) => CATALOG[k].label.toLowerCase().includes(s)) : null;
  }, [q]);

  const chips: [Filter, Key][] = [
    ["all", "buildAll"],
    ...GROUPS.map((g) => [g.key, g.label] as [Filter, Key]),
    ["layouts", "buildLayouts"],
  ];

  return (
    <>
      <header className="flex items-baseline justify-between px-4 pt-3 pb-2">
        <h2 className="lcd text-2xl leading-none">{t("buildFurniture").toUpperCase()}</h2>
        <span className="mono text-[11px] uppercase" style={{ color: "var(--muted)" }}>
          {ALL_KINDS.length} {t("buildItems")}
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
              hud.set((s) => ({ build: { ...s.build, kind: found[0], props: null, holding: null } }));
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
        <div className="flex flex-wrap gap-1.5 px-3 pt-2.5 pb-1">
          {chips.map(([k, label]) => (
            <button key={k} type="button" className="chip" aria-pressed={filter === k} onClick={() => setFilter(k)}>
              {t(label)}
            </button>
          ))}
        </div>
      )}
      <div className="flex-1 min-h-0 overflow-y-auto scroll-thin px-3 pt-2 pb-3 space-y-3">
        {found ? (
          found.length ? (
            <Grid kinds={found} />
          ) : (
            <p className="text-sm py-6 text-center" style={{ color: "var(--muted)" }}>
              {t("buildNoResults").replace("{q}", q.trim())}
            </p>
          )
        ) : (
          <>
            {GROUPS.filter((g) => filter === "all" || filter === g.key).map((g) => (
              <section key={g.key} className="space-y-1.5">
                <h3 className="grp">{t(g.label)}</h3>
                <Grid kinds={g.kinds} />
              </section>
            ))}
            {(filter === "all" || filter === "layouts") && <Layouts />}
          </>
        )}
      </div>
    </>
  );
}

function Grid({ kinds }: { kinds: Kind[] }) {
  const t = useTr();
  const b = useHud((s) => s.build);
  return (
    <div className="grid grid-cols-3 gap-[7px]">
      {kinds.map((k) => {
        const on = !b.holding && b.kind === k;
        return (
          <button
            key={k}
            type="button"
            className="tile-card h-[112px] text-left"
            aria-pressed={on}
            title={CATALOG[k].label}
            aria-label={CATALOG[k].label}
            onClick={() => hud.set((s) => ({ build: { ...s.build, kind: k, props: null, holding: null } }))}
          >
            <span className="absolute inset-x-2 top-2 h-[68px] flex items-center justify-center drop-shadow-[0_4px_4px_rgba(0,0,0,0.35)]">
              <ItemThumb kind={k} />
            </span>
            {on && (
              <span
                className="absolute top-1.5 left-1.5 mono text-[9px] px-1.5 rounded"
                style={{ background: "var(--vfd)", color: "var(--ink)" }}
              >
                {t(b.props ? "buildCopyBadge" : "buildPlacing").toUpperCase()}
              </span>
            )}
            <span
              className="absolute top-1.5 right-1.5 mono text-[10px] px-1.5 rounded"
              style={{ background: "rgba(0,0,0,.35)", color: "var(--muted)" }}
            >
              {sizeLabel(k)}
            </span>
            <span className="absolute left-2 right-2 bottom-1.5 text-[11.5px] font-medium truncate">
              {CATALOG[k].label}
            </span>
          </button>
        );
      })}
    </div>
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
