"use client";

import Link from "next/link";
import { Brand } from "@/components/Brand";
import { YONDRA_APP } from "@/lib/api";
import { useTr } from "@/lib/i18n";
import { useHud } from "@/world/store";
import { useWorld } from "./ctx";

export function TopBar() {
  const t = useTr();
  const spaceName = useHud((s) => s.spaceName);
  const area = useHud((s) => s.me?.areaName ?? "");
  const count = useHud((s) => s.people.filter((p) => !p.bot).length + (s.me ? 1 : 0));
  const projectId = useHud((s) => s.projectId);
  const fps = useHud((s) => s.fps);
  const quality = useHud((s) => (s.media.offline ? "lost" : s.media.quality));
  const areaKey = useHud((s) => s.me?.area ?? "");
  const lockedBy = useHud((s) => s.locks[s.me?.area ?? ""]);
  const canBuild = useHud((s) => s.canBuild);
  const w = useWorld();
  const lockable =
    canBuild && ["war-room", "booth-1", "booth-2", "booth-3", "standup", "server-room"].includes(areaKey);

  return (
    <header className="pointer-events-auto absolute top-3 left-3 right-3 flex items-start justify-between gap-3">
      <div className="cabinet px-3 py-2 flex items-center gap-3 min-w-0">
        <Link href="/" aria-label={t("back")} className="shrink-0">
          <Brand small compact />
        </Link>
        <div className="vfd-window px-3 py-1 min-w-0">
          <p className="lcd text-xl leading-none truncate">{spaceName.toUpperCase() || "…"}</p>
          <p
            className="mono text-[11px] leading-tight truncate"
            style={{ color: "var(--cream-dim)" }}
            aria-live="polite"
          >
            {area || "—"}
          </p>
        </div>
      </div>
      <div className="cabinet px-2 py-2 flex items-center gap-2">
        {lockable && (
          <button
            type="button"
            className="ghost-btn"
            onClick={() => w?.send("mod:lock", { area: areaKey, locked: !lockedBy })}
          >
            {lockedBy ? `🔓 ${t("unlockRoom")}` : `🔒 ${t("lockRoom")}`}
          </button>
        )}
        <span
          className="mono text-xs"
          title={`voice: ${quality}`}
          role="img"
          aria-label={`voice connection ${quality}`}
          style={{
            color:
              quality === "excellent" || quality === "good"
                ? "#8aa04a"
                : quality === "poor"
                  ? "var(--amber)"
                  : quality === "lost"
                    ? "var(--rust)"
                    : "var(--muted)",
          }}
        >
          {quality === "excellent"
            ? "▂▄▆"
            : quality === "good"
              ? "▂▄_"
              : quality === "poor"
                ? "▂__"
                : quality === "lost"
                  ? "✕"
                  : "···"}
        </span>
        <span className="mono text-xs px-1 whitespace-nowrap" style={{ color: "var(--vfd)" }} title={`${fps} fps`}>
          ● {count} {t("online")}
        </span>
        {projectId && (
          <a
            className="ghost-btn hidden sm:inline-block"
            href={`${YONDRA_APP}/projects/${projectId}`}
            target="_blank"
            rel="noreferrer"
          >
            {t("openInYondra")} ↗
          </a>
        )}
        <Link href="/" className="ghost-btn">
          {t("leave")}
        </Link>
      </div>
    </header>
  );
}
