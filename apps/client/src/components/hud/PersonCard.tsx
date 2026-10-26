"use client";

import { parseAvatar } from "@yutopia/shared";
import { AvatarCanvas } from "@/components/AvatarCanvas";
import { useTr } from "@/lib/i18n";
import { emoteUrl } from "@/world/art/emotes";
import { hud, useHud } from "@/world/store";
import { useWorld } from "./ctx";
import { Icon } from "./icons";

// Click someone in the world → who they are, where, and what you can do with them.
export function PersonCard() {
  const t = useTr();
  const w = useWorld();
  const uid = useHud((s) => s.inspect);
  const p = useHud((s) => s.people.find((x) => x.uid === s.inspect));
  const following = useHud((s) => s.following);
  const canModerate = useHud((s) => s.isAdmin);
  const myCar = useHud((s) => s.myCar);
  if (!uid || !p) return null;
  const avatar = parseAvatar(w?.personByUid(uid)?.avatar);
  const close = () => hud.set({ inspect: null });
  return (
    <aside
      className="pointer-events-auto cabinet absolute right-3 top-24 w-[min(300px,calc(100vw-24px))] p-3 rise"
      aria-label={p.name}
    >
      <div className="flex gap-3">
        <div className="vfd-window shrink-0">
          <AvatarCanvas avatar={avatar} size={88} spin={false} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h2 className="lcd text-2xl leading-none truncate">{p.name}</h2>
            <button type="button" className="ghost-btn" onClick={close} aria-label={t("close")}>
              ✕
            </button>
          </div>
          <p className="mono text-xs mt-1" style={{ color: "var(--cream-dim)" }}>
            {p.areaName || "—"} ·{" "}
            {p.status === "dnd" ? t("focus") : p.status === "away" ? t("away") : t("status_online")}
          </p>
          <p className="text-xs mt-1">
            {p.mic ? "🎙 " : ""}
            {p.cam ? "📷 " : ""}
            {p.hearing ? `· ${t("nearby")}` : ""}
          </p>
        </div>
      </div>
      <div className="flex gap-2 mt-3">
        <button
          type="button"
          className="deck-btn flex-1"
          style={{ height: 36 }}
          onClick={() => w?.walkTo({ x: p.x, y: p.y + 1 })}
        >
          {t("goTo")}
        </button>
        <button
          type="button"
          className="deck-btn flex-1"
          style={{ height: 36 }}
          aria-pressed={following === uid}
          onClick={() => hud.set({ following: following === uid ? null : uid })}
        >
          {following === uid ? t("unfollow") : t("follow")}
        </button>
        <button type="button" className="deck-btn" style={{ height: 36 }} onClick={() => w?.emote(0)} title="wave">
          {/* biome-ignore lint/performance/noImgElement: inline SVG data URL */}
          <img alt="" src={emoteUrl("wave")} className="w-6 h-6" draggable={false} />
        </button>
      </div>
      {myCar && (
        <div className="mt-2 pt-2" style={{ borderTop: "1px solid var(--edge)" }}>
          <button
            type="button"
            className="deck-btn w-full flex items-center justify-center gap-2"
            style={{ height: 36 }}
            data-keys
            onClick={() => w?.send("car:lend", { to: myCar.lentTo === uid ? null : uid })}
          >
            <Icon name="key" size={16} />
            {t(myCar.lentTo === uid ? "keysBack" : "keysLend")}
          </button>
          <p className="mono text-[11px] mt-1.5" style={{ color: "var(--muted)" }}>
            {myCar.plate}
            {myCar.lentTo && myCar.lentTo !== uid
              ? ` · ${t("keysWith").replace("{who}", myCar.lentName.split(" ")[0])}`
              : ""}
          </p>
        </div>
      )}
      {canModerate && (
        <div className="flex gap-2 mt-2 pt-2" style={{ borderTop: "1px solid var(--edge)" }}>
          <button
            type="button"
            className="ghost-btn flex-1"
            onClick={() => w?.send("mod:mute", { userId: uid, muted: !p.muted })}
          >
            {p.muted ? t("unmute") : t("mute")}
          </button>
          <button
            type="button"
            className="ghost-btn flex-1"
            style={{ color: "var(--alert)" }}
            onClick={() => {
              if (window.confirm(`${t("remove")} ${p.name}?`)) {
                w?.send("mod:kick", { userId: uid });
                close();
              }
            }}
          >
            {t("remove")}
          </button>
        </div>
      )}
    </aside>
  );
}
