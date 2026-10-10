"use client";

import { useTr } from "@/lib/i18n";
import { hud, type Person, useHud } from "@/world/store";
import { useWorld } from "./ctx";

export function PeoplePanel() {
  const t = useTr();
  const w = useWorld();
  const open = useHud((s) => s.peopleOpen);
  const me = useHud((s) => s.me);
  const people = useHud((s) => s.people);
  const status = useHud((s) => s.status);
  const following = useHud((s) => s.following);
  if (!open) return null;
  const rows = people.filter((p) => !p.bot);
  const bots = people.length - rows.length;

  const row = (p: Person, mine = false) => {
    const doing = status[p.uid] ?? [];
    return (
      <li
        key={p.sid}
        className="rounded-lg p-2"
        style={{ background: p.hearing ? "rgba(255,166,48,0.08)" : "transparent" }}
      >
        <div className="flex items-center gap-2">
          <span
            className="h-2.5 w-2.5 rounded-full shrink-0"
            style={{
              background: p.status === "dnd" ? "var(--rust)" : p.status === "away" ? "var(--muted)" : "#8aa04a",
              boxShadow: p.speaking ? "0 0 0 3px #ffa63088" : "none",
            }}
          />
          <span className="font-medium truncate">
            {p.name}
            {mine && <span style={{ color: "var(--muted)" }}> ({t("you")})</span>}
          </span>
          <span className="ml-auto text-xs" aria-hidden>
            {p.mic ? "🎙" : ""}
            {p.cam ? "📷" : ""}
            {p.screen ? "🖥" : ""}
          </span>
        </div>
        <p className="mono text-[11px] mt-0.5" style={{ color: "var(--cream-dim)" }}>
          {p.areaName || "—"}
          {p.status !== "online" && ` · ${p.status === "dnd" ? t("focus") : t("away")}`}
        </p>
        {doing.length > 0 ? (
          <ul className="mt-1 space-y-0.5">
            {doing.slice(0, 2).map((c) => (
              <li key={c.id} className="text-xs truncate" style={{ color: c.blocked ? "#ff8a66" : "var(--vfd)" }}>
                ▸ <span className="mono">{c.ticket}</span> {c.name}
              </li>
            ))}
          </ul>
        ) : null}
        {!mine && (
          <div className="flex gap-1.5 mt-1.5">
            <button type="button" className="ghost-btn" onClick={() => w?.teleport({ userId: p.uid })}>
              {t("goTo")}
            </button>
            <button
              type="button"
              className="ghost-btn"
              onClick={() => hud.set({ following: following === p.uid ? null : p.uid })}
            >
              {following === p.uid ? t("unfollow") : t("follow")}
            </button>
          </div>
        )}
      </li>
    );
  };

  return (
    <aside
      aria-label={t("people")}
      className="pointer-events-auto cabinet absolute left-3 top-24 bottom-24 w-[min(300px,calc(100vw-24px))] flex flex-col rise"
    >
      <div className="flex items-center justify-between px-3 pt-3">
        <h2 className="mono text-xs uppercase tracking-widest" style={{ color: "var(--cream-dim)" }}>
          {t("people")} · {rows.length + 1}
        </h2>
        <button
          type="button"
          className="ghost-btn"
          onClick={() => hud.set({ peopleOpen: false })}
          aria-label={t("close")}
        >
          ✕
        </button>
      </div>
      <div className="px-3 pt-2 flex gap-2">
        <button type="button" className="ghost-btn" onClick={() => w?.teleport("desk")}>
          🪑 {t("myDesk")}
        </button>
      </div>
      <ul className="flex-1 overflow-y-auto scroll-thin p-2 space-y-1">
        {me && row(me, true)}
        {rows.map((p) => row(p))}
        {bots > 0 && (
          <li className="mono text-[11px] px-2" style={{ color: "var(--muted)" }}>
            + {bots} bots
          </li>
        )}
      </ul>
    </aside>
  );
}
