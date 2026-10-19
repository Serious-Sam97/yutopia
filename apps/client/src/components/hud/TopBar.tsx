"use client";

import { areaAt } from "@yutopia/shared";
import { useEffect, useState } from "react";
import { Brand } from "@/components/Brand";
import { setToken, yutopia } from "@/lib/api";
import { useTr } from "@/lib/i18n";
import { STATIONS } from "@/world/sound";
import { hud, useHud } from "@/world/store";
import { useWorld } from "./ctx";
import { Face } from "./Face";
import { Icon } from "./icons";

const LOCKABLE = ["war-room", "booth-1", "booth-2", "booth-3", "standup", "server-room"];

// Top left: where you are (the world, the room, who's here) and what's on (the
// studio's clock, the radio). Top right: who's in, the connection, signing out.
export function TopBar() {
  return (
    <>
      <WhereBar />
      <PresenceBar />
    </>
  );
}

function WhereBar() {
  const t = useTr();
  const worldName = useHud((s) => s.worldName);
  const area = useHud((s) => s.me?.area ?? "");
  const areaName = useHud((s) => s.me?.areaName ?? "");
  const here = useHud((s) => (s.me ? 1 : 0) + s.people.filter((p) => !p.bot && p.area === area && area).length);
  return (
    <header className="pointer-events-auto cabinet absolute top-3 left-3 h-[54px] flex items-center gap-2.5 pl-3 pr-2 max-w-[calc(100vw-196px)] sm:max-w-[calc(100vw-480px)]">
      <span className="shrink-0">
        <Brand small compact />
      </span>
      <span className="hidden sm:block w-px h-6 shrink-0" style={{ background: "var(--edge)" }} aria-hidden />
      <div className="vfd-window px-3 h-10 flex flex-col justify-center min-w-0">
        <p className="lcd text-[22px] leading-none truncate">{worldName.toUpperCase() || "…"}</p>
        <p className="mono text-[11px] leading-tight truncate" style={{ color: "var(--cream-dim)" }} aria-live="polite">
          ▸ {areaName || "—"}
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
  const box = radio.id ? w?.engine?.getObject(radio.id) : undefined;
  const room = box && w ? areaAt(w.map, box.x + 0.5, box.y + 0.5)?.name : null;
  return (
    <div className="vfd-window hidden md:flex items-center gap-2.5 px-3 h-10 shrink-0">
      <span className="lcd text-2xl leading-none">
        {now ? now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false }) : "--:--"}
      </span>
      {radio.playing && (
        <>
          <span className="w-px h-5" style={{ background: "#3a2a1c" }} aria-hidden />
          <span className="eq" aria-hidden>
            <i />
            <i />
            <i />
            <i />
          </span>
          <span className="mono text-[11px] leading-tight whitespace-nowrap" style={{ color: "var(--cream-dim)" }}>
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
  const shown = everyone.slice(0, 4);
  const bars = quality === "excellent" ? 3 : quality === "good" ? 2 : quality === "poor" ? 1 : 0;
  const barColor = quality === "poor" ? "var(--amber)" : quality === "lost" ? "var(--rust)" : "#8aa04a";

  return (
    <header className="pointer-events-auto cabinet absolute top-3 right-3 h-[54px] flex items-center gap-2 sm:gap-2.5 pl-3 pr-2">
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
        {everyone.length > shown.length && (
          <span
            className="relative -ml-2 w-[30px] h-[30px] rounded-full grid place-items-center mono text-[10px]"
            style={{ background: "#3b281b", border: "2px solid #2a1c13", color: "var(--cream-dim)" }}
          >
            +{everyone.length - shown.length}
          </span>
        )}
      </button>
      <span className="mono text-xs whitespace-nowrap" style={{ color: "var(--cream-dim)" }}>
        <span className="sm:hidden" style={{ color: "#8aa04a" }}>
          ●{" "}
        </span>
        {everyone.length} {t("online")}
      </span>
      <span className="w-px h-6" style={{ background: "var(--edge)" }} aria-hidden />
      <span
        className="flex items-end gap-[2px] h-[14px]"
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
              style={{ height: h, background: i < bars ? barColor : "#4a3527" }}
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
      <button
        type="button"
        className="ghost-btn flex items-center gap-1.5 h-[34px]"
        style={{ borderColor: "#7a3a22", color: "#f0b49a" }}
        onClick={async () => {
          await yutopia.logout();
          setToken(null);
          location.href = "/login";
        }}
      >
        <Icon name="leave" size={15} />
        <span className="hidden sm:inline">{t("signOut")}</span>
      </button>
    </header>
  );
}
