"use client";

import { parseAvatar } from "@yutopia/shared";
import { AvatarCanvas } from "@/components/AvatarCanvas";
import { useTr } from "@/lib/i18n";
import { hud, useHud } from "@/world/store";
import { useWorld } from "./ctx";

// Click someone in the world → who they are and what they're doing in Yondra.
export function PersonCard() {
  const t = useTr();
  const w = useWorld();
  const uid = useHud((s) => s.inspect);
  const p = useHud((s) => s.people.find((x) => x.uid === s.inspect));
  const doing = useHud((s) => (s.inspect ? (s.status[s.inspect] ?? []) : []));
  const following = useHud((s) => s.following);
  const canModerate = useHud((s) => s.canBuild);
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
      <h3 className="mono text-[11px] uppercase tracking-widest mt-3 mb-1" style={{ color: "var(--vfd)" }}>
        {t("doing")}
      </h3>
      {doing.length ? (
        <ul className="space-y-1">
          {doing.map((c) => (
            <li
              key={c.id}
              className="text-sm rounded px-2 py-1"
              style={{ background: "#120d09", color: c.blocked ? "#ff8a66" : "var(--cream)" }}
            >
              <span className="mono text-xs" style={{ color: "var(--vfd)" }}>
                {c.ticket}
              </span>{" "}
              {c.name}
              <span className="block mono text-[10px]" style={{ color: "var(--muted)" }}>
                {c.boardName} · {c.section}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          {t("nothingDoing")}
        </p>
      )}
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
          👋
        </button>
      </div>
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
            style={{ color: "#ff8a66" }}
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
