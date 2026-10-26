"use client";

import { useEffect, useState } from "react";
import { useTr } from "@/lib/i18n";
import { useHud } from "@/world/store";
import { useWorld } from "./ctx";

// Standup banner for people in the ring: whose turn and the time left.
export function Rituals() {
  const t = useTr();
  const w = useWorld();
  const st = useHud((s) => s.standup);
  const inRing = useHud((s) => s.me?.area === "standup");
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!st.active) return;
    const i = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(i);
  }, [st.active]);
  if (!st.active || !inRing) return null;
  const uid = st.order[st.turn];
  const person = w?.personByUid(uid);
  const left = Math.max(0, Math.ceil((st.turnStartedAt + st.turnSeconds * 1000 - now) / 1000));
  const mine = uid === w?.myUid();
  return (
    <section
      className="pointer-events-auto cabinet absolute left-1/2 -translate-x-1/2 top-24 w-[min(460px,calc(100vw-24px))] p-3 rise"
      aria-live="polite"
    >
      <div className="flex items-center gap-3">
        <div className="vfd-window px-3 py-1 flex-1 min-w-0">
          <p className="lcd text-2xl truncate">
            🎙 {mine ? t("standupYours") : `${person?.name ?? "…"}${t("standupTurn")}`}
          </p>
        </div>
        <span className="lcd text-3xl" style={{ color: left < 10 ? "var(--bad)" : "var(--vfd)" }}>
          {Math.floor(left / 60)}:{String(left % 60).padStart(2, "0")}
        </span>
      </div>
      <div className="flex items-center justify-between mt-2">
        <span className="mono text-[11px]" style={{ color: "var(--muted)" }}>
          {st.turn + 1}/{st.order.length}
        </span>
        <div className="flex gap-2">
          <button type="button" className="deck-btn" style={{ height: 32 }} onClick={() => w?.send("standup:next", {})}>
            ⏭ {t("standupNext")}
          </button>
          <button type="button" className="ghost-btn" onClick={() => w?.send("standup:stop", {})}>
            {t("standupStop")}
          </button>
        </div>
      </div>
    </section>
  );
}
