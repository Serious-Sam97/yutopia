"use client";

import { areaAt } from "@yutopia/shared";
import { useEffect, useState } from "react";
import { setToken, yutopia } from "@/lib/api";
import { useTr } from "@/lib/i18n";
import { STATIONS } from "@/world/sound";
import { hud, useHud } from "@/world/store";
import { useWorld } from "./ctx";
import { Face } from "./Face";
import { FloorChip } from "./FloorChip";
import { Icon } from "./icons";

const LOCKABLE = ["war-room", "booth-1", "booth-2", "booth-3", "standup", "server-room"];

// Top left: where I am (the room's name as the title; the world, the floor, who's
// here under it) and what's on (the clock, the radio). Top right: who's in, the
// connection, and me — a menu: my look, settings, signing out (docs/plan/45-the-ui.md).
export function TopBar() {
  return (
    <>
      <WhereBar />
      <PresenceBar />
    </>
  );
}

// a street lamp: the look's mark
function LampMark() {
  return (
    <svg
      viewBox="0 0 46 46"
      width="34"
      height="34"
      aria-hidden="true"
      className="shrink-0"
      style={{ color: "var(--amber)" }}
    >
      <path d="M23 6 V40" stroke="currentColor" strokeWidth="1.8" />
      <path d="M23 9 H33 L35 13 H25" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="M27 13 L22 30 H44 L37 13" fill="currentColor" fillOpacity=".16" />
    </svg>
  );
}

function WhereBar() {
  const t = useTr();
  const worldName = useHud((s) => s.worldName);
  const area = useHud((s) => s.me?.area ?? "");
  const areaName = useHud((s) => s.me?.areaName ?? "");
  const here = useHud((s) => (s.me ? 1 : 0) + s.people.filter((p) => !p.bot && p.area === area && area).length);
  return (
    <header className="pointer-events-auto cabinet absolute top-3 left-3 flex items-center gap-3 pl-2.5 pr-4 py-2 max-w-[calc(100vw-148px)] sm:max-w-[calc(100vw-480px)]">
      <LampMark />
      <div className="min-w-0">
        <p className="title text-[22px] truncate" aria-live="polite">
          {areaName || t("hallway")}
        </p>
        <p className="text-[12.5px] leading-tight truncate mt-0.5" style={{ color: "var(--cream-dim)" }}>
          {worldName || "…"}
          <FloorChip />
          {area && ` · ${t("hereCount").replace("{n}", String(here))}`}
        </p>
      </div>
      <NowOn />
    </header>
  );
}

// The clock, and the radio while it plays (and where).
function NowOn() {
  const t = useTr();
  const w = useWorld();
  const radio = useHud((s) => s.radio);
  useHud((s) => s.objectsVersion);
  // set after mount: the server's clock isn't the visitor's (hydration)
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 15_000);
    return () => clearInterval(id);
  }, []);
  // where it's playing: the radio (or record player) I hear — each plays its own
  const box = radio.id ? w?.model?.getObject(radio.id) : undefined;
  const room = box && w ? areaAt(w.map, box.x + 0.5, box.y + 0.5)?.name : null;
  return (
    <div
      className="hidden md:flex items-center gap-3 pl-3 shrink-0 self-stretch"
      style={{ borderLeft: "1px solid var(--edge)" }}
    >
      <span className="lcd text-[22px] leading-none">
        {now ? now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false }) : "--:--"}
      </span>
      {radio.playing && (
        <>
          <span className="eq" aria-hidden>
            <i />
            <i />
            <i />
            <i />
          </span>
          <span className="text-[12px] leading-tight whitespace-nowrap" style={{ color: "var(--cream-dim)" }}>
            <span className="block max-w-[220px] truncate" style={{ color: "var(--cream)" }}>
              {radio.source === "yt"
                ? radio.title || "YouTube"
                : (STATIONS[radio.station % STATIONS.length]?.name ?? t("radio"))}
            </span>
            {room ? t("radioIn").replace("{room}", room) : radio.source === "yt" ? "YouTube" : t("radio")}
          </span>
        </>
      )}
    </div>
  );
}

function PresenceBar() {
  const t = useTr();
  const w = useWorld();
  const me = useHud((s) => s.me);
  const people = useHud((s) => s.people.filter((p) => !p.bot));
  const quality = useHud((s) => (s.media.offline ? "lost" : s.media.asleep ? "asleep" : s.media.quality));
  const areaKey = useHud((s) => s.me?.area ?? "");
  const lockedBy = useHud((s) => s.locks[s.me?.area ?? ""]);
  const isAdmin = useHud((s) => s.isAdmin);
  const lockable = isAdmin && LOCKABLE.includes(areaKey);
  const everyone = me ? [me, ...people] : people;
  const shown = people.slice(0, 3);
  const bars = quality === "excellent" ? 3 : quality === "good" ? 2 : quality === "poor" ? 1 : 0;
  const barColor = quality === "poor" ? "var(--amber)" : quality === "lost" ? "var(--rust)" : "var(--good)";

  return (
    <header className="pointer-events-auto cabinet absolute top-3 right-3 h-[62px] flex items-center gap-2 sm:gap-3 pl-2.5 sm:pl-3 pr-1.5">
      <button
        type="button"
        className="hidden sm:flex items-center"
        onClick={() => hud.set({ side: "people" })}
        aria-label={t("people")}
        title={everyone.map((p) => p.name).join(", ")}
      >
        {shown.map((p, i) => (
          <span key={p.sid} style={{ marginLeft: i ? -8 : 0, zIndex: 10 - i }} className="relative">
            <Face avatar={p.avatar} name={p.name} status={p.status} size={30} />
          </span>
        ))}
        {people.length > shown.length && (
          <span
            className="relative -ml-2 w-[30px] h-[30px] rounded-full grid place-items-center mono text-[10px]"
            style={{
              background: "var(--panel-top)",
              border: "2px solid var(--panel-raised)",
              color: "var(--cream-dim)",
            }}
          >
            +{people.length - shown.length}
          </span>
        )}
      </button>
      <span className="text-[13px] whitespace-nowrap" style={{ color: "var(--cream-dim)" }}>
        <span className="sm:hidden" style={{ color: "var(--good)" }}>
          ●{" "}
        </span>
        <b style={{ color: "var(--cream)", fontWeight: 600 }}>{everyone.length}</b>
        <span className="hidden sm:inline"> {t("online")}</span>
      </span>
      <span
        className="hidden sm:flex items-end gap-[2px] h-[14px]"
        role="img"
        aria-label={`${t("connection")}: ${quality}`}
        title={`${t("connection")}: ${quality}`}
      >
        {quality === "lost" ? (
          <Icon name="close" size={14} className="text-[var(--rust)]" />
        ) : (
          [5, 9, 14].map((h, i) => (
            <span
              key={h}
              className="w-1 rounded-[1px]"
              style={{ height: h, background: i < bars ? barColor : "var(--edge)" }}
            />
          ))
        )}
      </span>
      {lockable && (
        <button
          type="button"
          className="ghost-btn flex items-center gap-1.5 h-[34px]"
          onClick={() => w?.send("mod:lock", { area: areaKey, locked: !lockedBy })}
          aria-label={lockedBy ? t("unlockRoom") : t("lockRoom")}
        >
          <Icon name={lockedBy ? "unlock" : "lock"} size={15} />
          <span className="hidden lg:inline">{lockedBy ? t("unlockRoom") : t("lockRoom")}</span>
        </button>
      )}
      <MeMenu />
    </header>
  );
}

// My face, a menu: who I am and how I'm set, my look, settings, (an admin) running the
// place, signing out.
function MeMenu() {
  const t = useTr();
  const me = useHud((s) => s.me);
  const isAdmin = useHud((s) => s.isAdmin);
  const [open, setOpen] = useState(false);
  // closes on Escape or a click elsewhere
  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent && e.key !== "Escape") return;
      if (e instanceof PointerEvent && (e.target as HTMLElement).closest("[data-me-menu]")) return;
      setOpen(false);
    };
    window.addEventListener("keydown", close);
    window.addEventListener("pointerdown", close);
    return () => {
      window.removeEventListener("keydown", close);
      window.removeEventListener("pointerdown", close);
    };
  }, [open]);
  const go = (panel: "avatar" | "settings" | "admin") => {
    setOpen(false);
    hud.set({ panel: { kind: panel } });
  };
  return (
    <div className="relative" data-me-menu>
      <button
        type="button"
        className="flex items-center gap-1 rounded-full pl-1 pr-1.5 py-1 hover:bg-white/5"
        style={{ border: "1px solid var(--edge)", color: "var(--cream-dim)" }}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t("meMenu")}
        onClick={() => setOpen((o) => !o)}
      >
        {me ? <Face avatar={me.avatar} name={me.name} status={me.status} size={32} /> : <span className="w-8 h-8" />}
        <Icon name="chev" size={14} />
      </button>
      {open && (
        <div
          className="cabinet absolute right-0 top-[calc(100%+12px)] w-56 p-1.5 rise"
          role="menu"
          aria-label={t("meMenu")}
        >
          {me && (
            <div className="px-3 pt-2 pb-2.5">
              <p className="text-sm font-semibold truncate">{me.name}</p>
              <p className="text-[12px]" style={{ color: "var(--cream-dim)" }}>
                {t(`status_${me.status}` as "status_online")}
              </p>
            </div>
          )}
          {(
            [
              ["avatar", "myLook", "people"],
              ["settings", "settings", "gear"],
              ["admin", "runPlace", "key"],
            ] as const
          )
            .filter(([panel]) => panel !== "admin" || isAdmin)
            .map(([panel, label, icon]) => (
              <button
                key={panel}
                type="button"
                role="menuitem"
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded text-sm text-left hover:bg-white/5"
                onClick={() => go(panel)}
              >
                <Icon name={icon} size={16} />
                {t(label)}
              </button>
            ))}
          <div className="my-1 h-px" style={{ background: "var(--edge)" }} aria-hidden />
          <button
            type="button"
            role="menuitem"
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded text-sm text-left hover:bg-white/5"
            style={{ color: "var(--error)" }}
            onClick={async () => {
              await yutopia.logout();
              setToken(null);
              location.href = "/login";
            }}
          >
            <Icon name="leave" size={16} />
            {t("signOut")}
          </button>
        </div>
      )}
    </div>
  );
}
