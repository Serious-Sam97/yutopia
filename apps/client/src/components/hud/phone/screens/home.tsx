"use client";

import { type Key, useTr } from "@/lib/i18n";
import type { AppId } from "@/world/phone/store";
import { usePhone } from "@/world/phone/store";
import { useHud } from "@/world/store";
import { useWorld } from "../../ctx";
import s from "../phone.module.css";
import { cx, hhmm, Ic, type IconName, useNow, vortexUrl, Wallpaper } from "../ui";

// The boot (once a session) and the home screen: a clock and where you are,
// the 3×3 grid (GTA's), the badges.

export function Boot() {
  const t = useTr();
  return (
    <div className={s.boot} data-phone-boot>
      <div className={s.orb} />
      <div className={cx(s.wm, s.holoText)}>VORTEX</div>
      <div className={s.ed}>{t("phEdition")}</div>
      <div className={s.bootBar}>
        <i />
      </div>
      <div className={s.by}>M. VEX SYSTEMS · 1989 / 20XX</div>
    </div>
  );
}

const APPS: { id: AppId; icon: IconName | "vortex" }[] = [
  { id: "phone", icon: "phone" },
  { id: "messages", icon: "messages" },
  { id: "camera", icon: "camera" },
  { id: "gallery", icon: "gallery" },
  { id: "contacts", icon: "contacts" },
  { id: "vortex", icon: "vortex" },
  { id: "store", icon: "store" },
  { id: "maps", icon: "maps" },
  { id: "settings", icon: "settings" },
];

export function Home() {
  const t = useTr();
  const w = useWorld();
  const now = useNow();
  const wp = usePhone((p) => p.settings.wallpaper);
  const unread = usePhone((p) => p.threads.reduce((n, x) => n + (x.muted || x.kind === "vortex" ? 0 : x.unread), 0));
  const vortexUnread = usePhone((p) => p.threads.find((x) => x.kind === "vortex")?.unread ?? 0);
  const missed = usePhone(
    (p) => p.threads.filter((x) => x.unread > 0 && x.last?.kind === "call" && x.last.from !== p.me.uid).length,
  );
  const room = useHud((h) => h.me?.areaName || h.worldName);
  const near = useHud((h) => h.heardBy.length);
  const torch = useHud((h) => h.torch);
  const ph = w?.phone;
  if (!ph) return null;
  const badge: Partial<Record<AppId, number>> = { messages: unread, phone: missed, vortex: vortexUnread };
  const date = now.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });
  return (
    <>
      <Wallpaper id={wp} />
      <div className={s.content}>
        <div className={cx(s.widget, s.glass)}>
          <div className={s.t}>{hhmm(now)}</div>
          <div className={s.d}>{date}</div>
          <div className={s.w}>
            <span style={{ color: "var(--cya)" }}>
              <Ic n="maps" size={14} />
            </span>
            {(near ? t("phNearby").replace("{n}", String(near)) : t("phNearbyNone")).replace("{room}", room)}
          </div>
          {/* the flashlight (the Grounds at night: a beam everyone sees) */}
          <button
            type="button"
            className={cx(s.torch, torch && s.on)}
            data-nav
            data-torch
            aria-pressed={torch}
            onClick={() => w?.toggleTorch()}
          >
            <Ic n="torch" size={14} />
            {t("phTorch")}
          </button>
        </div>
        <div className={s.grid} data-cols="3">
          {APPS.map((a) => (
            <button
              key={a.id}
              type="button"
              className={s.app}
              data-nav
              data-app={a.id}
              onClick={() => (a.id === "camera" ? ph.camera.open() : ph.open(a.id))}
            >
              <span className={cx(s.tile, s[`t_${a.id}`])}>
                {a.icon === "vortex" ? (
                  // biome-ignore lint/performance/noImgElement: inline SVG data URL
                  <img alt="" src={vortexUrl("smug")} draggable={false} />
                ) : (
                  <Ic n={a.icon} size={30} />
                )}
              </span>
              {t(`app_${a.id}` as Key)}
              {(badge[a.id] ?? 0) > 0 && <span className={s.badge}>{badge[a.id]}</span>}
            </button>
          ))}
        </div>
        <div className={s.dots}>
          <i className={s.on} />
          <i />
        </div>
      </div>
    </>
  );
}
