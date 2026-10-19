"use client";

import { useTr } from "@/lib/i18n";
import { hud, useHud } from "@/world/store";
import { useWorld } from "./ctx";
import { Panel } from "./Panel";

export function StandupPanel() {
  const t = useTr();
  const w = useWorld();
  const st = useHud((s) => s.standup);
  const me = useHud((s) => s.me);
  const inRing = me?.area === "standup";
  return (
    <Panel title={t("standup")}>
      <p className="text-sm" style={{ color: "var(--cream-dim)" }}>
        Everyone standing in the ring gets a turn, in random order, with a timer. The ring is a private room: only
        people inside hear it.
      </p>
      {!inRing && (
        <p className="mono text-xs mt-3" style={{ color: "var(--vfd)" }}>
          Step into the ring first.
        </p>
      )}
      <div className="flex gap-2 mt-4">
        {!st.active ? (
          <button
            type="button"
            className="deck-btn flex-1"
            disabled={!inRing}
            onClick={() => {
              w?.send("standup:start", {});
              hud.set({ panel: { kind: null } });
            }}
          >
            ▶ {t("standupStart")}
          </button>
        ) : (
          <>
            <button
              type="button"
              className="deck-btn flex-1"
              disabled={!inRing}
              onClick={() => w?.send("standup:next", {})}
            >
              ⏭ {t("standupNext")}
            </button>
            <button
              type="button"
              className="deck-btn danger"
              aria-pressed={false}
              disabled={!inRing}
              onClick={() => w?.send("standup:stop", {})}
            >
              ■ {t("standupStop")}
            </button>
          </>
        )}
      </div>
    </Panel>
  );
}
