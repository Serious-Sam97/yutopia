"use client";

import { EMOTES } from "@yutopia/shared";
import { useState } from "react";
import { useTr } from "@/lib/i18n";
import { hud, useHud } from "@/world/store";
import { useWorld } from "./ctx";

const EMOJI: Record<string, string> = {
  wave: "👋",
  heart: "❤️",
  laugh: "😂",
  clap: "👏",
  fire: "🔥",
  question: "❓",
  coffee: "☕",
  tape: "📼",
};

export function Dock() {
  const t = useTr();
  const w = useWorld();
  const media = useHud((s) => s.media);
  const status = useHud((s) => s.me?.status ?? "online");
  const chatOpen = useHud((s) => s.chatOpen);
  const unread = useHud((s) => s.chatUnread);
  const peopleOpen = useHud((s) => s.peopleOpen);
  const canBuild = useHud((s) => s.canBuild);
  const building = useHud((s) => s.build.on);
  const [emotes, setEmotes] = useState(false);

  const cycleStatus = () => w?.setStatus(status === "online" ? "dnd" : status === "dnd" ? "away" : "online");

  return (
    <nav
      aria-label={t("controls")}
      className="pointer-events-auto absolute bottom-3 left-1/2 -translate-x-1/2 max-w-[calc(100vw-24px)]"
    >
      {emotes && (
        <div className="cabinet p-2 mb-2 flex gap-1 justify-center rise" role="menu">
          {EMOTES.map((e, i) => (
            <button
              key={e}
              type="button"
              role="menuitem"
              className="h-10 w-10 rounded-lg text-xl hover:bg-white/10"
              title={`${i + 1}`}
              onClick={() => {
                w?.emote(i);
                setEmotes(false);
              }}
            >
              {EMOJI[e]}
            </button>
          ))}
        </div>
      )}
      <div className="cabinet p-2 flex items-center gap-1.5 overflow-x-auto scroll-thin">
        <button
          type="button"
          className="deck-btn danger"
          aria-pressed={media.mic}
          onClick={() => void w?.toggleMic()}
          title={`${t("mic")} (M)`}
          disabled={!media.ready && !media.offline}
        >
          <span className="led" />
          {media.mic ? "🎙" : "🔇"}
          <span className="hidden sm:inline">{t("mic")}</span>
        </button>
        <button
          type="button"
          className="deck-btn"
          aria-pressed={media.cam}
          onClick={() => void w?.toggleCam()}
          title={`${t("cam")} (V)`}
          disabled={!media.ready && !media.offline}
        >
          <span className="led" />📷<span className="hidden sm:inline">{t("cam")}</span>
        </button>
        <button
          type="button"
          className="deck-btn hidden sm:inline-flex"
          aria-pressed={media.screen}
          onClick={() => void w?.toggleScreen()}
          title={t("screen")}
          disabled={!media.ready}
        >
          <span className="led" />🖥
        </button>
        <span className="w-px h-8 mx-1" style={{ background: "var(--edge)" }} aria-hidden />
        <button
          type="button"
          className="deck-btn"
          aria-pressed={emotes}
          onClick={() => setEmotes((x) => !x)}
          title={t("emote")}
        >
          😀
        </button>
        <button
          type="button"
          className="deck-btn"
          aria-pressed={chatOpen}
          onClick={() => hud.set({ chatOpen: !chatOpen, chatUnread: 0 })}
          title={`${t("chat")} (Enter)`}
        >
          💬
          {unread > 0 && (
            <span
              className="absolute -top-1 -right-1 min-w-5 h-5 px-1 rounded-full text-[11px] flex items-center justify-center"
              style={{ background: "var(--rust)", color: "var(--cream)" }}
            >
              {unread}
            </span>
          )}
        </button>
        <button
          type="button"
          className="deck-btn"
          aria-pressed={peopleOpen}
          onClick={() => hud.set({ peopleOpen: !peopleOpen })}
          title={t("people")}
        >
          👥
        </button>
        <button
          type="button"
          className="deck-btn"
          onClick={cycleStatus}
          title={t(`status_${status}` as "status_online")}
        >
          <span
            className="inline-block h-2.5 w-2.5 rounded-full"
            style={{ background: status === "dnd" ? "var(--rust)" : status === "away" ? "var(--muted)" : "#8aa04a" }}
          />
          <span className="hidden md:inline">{t(`status_${status}` as "status_online").split(" ")[0]}</span>
        </button>
        {canBuild && (
          <button
            type="button"
            className="deck-btn"
            aria-pressed={building}
            onClick={() => hud.set((s) => ({ build: { ...s.build, on: !s.build.on, holding: null } }))}
            title={t("build")}
          >
            🛠
          </button>
        )}
        <button
          type="button"
          className="deck-btn"
          onClick={() => hud.set({ panel: { kind: "settings" } })}
          title={t("settings")}
        >
          ⚙
        </button>
      </div>
    </nav>
  );
}
