"use client";

import { EMOTES } from "@yutopia/shared";
import { useEffect, useRef, useState } from "react";
import { useTr } from "@/lib/i18n";
import { emoteUrl } from "@/world/art/emotes";
import { hud, type SideTab, useHud } from "@/world/store";
import { useWorld } from "./ctx";
import { STATUS_COLOR } from "./Face";
import { Icon } from "./icons";

const STATUSES = ["online", "dnd", "away"] as const;

// The deck: media (mic with a live meter, camera, screen) · social (emotes,
// chat, people) · me (status) · tools (build, settings).
export function Dock() {
  const t = useTr();
  const w = useWorld();
  const media = useHud((s) => s.media);
  const status = useHud((s) => s.me?.status ?? "online");
  const side = useHud((s) => s.side);
  const unread = useHud((s) => s.chatUnread);
  const canBuild = useHud((s) => s.canBuild);
  const [menu, setMenu] = useState<"emotes" | "status" | null>(null);
  const toggleSide = (tab: SideTab) =>
    hud.set((s) => ({ side: s.side === tab ? null : tab, ...(tab === "chat" ? { chatUnread: 0 } : {}) }));
  const ready = media.ready || media.offline;

  // menus close on Escape or a click elsewhere
  useEffect(() => {
    if (!menu) return;
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent && e.key !== "Escape") return;
      if (e instanceof PointerEvent && (e.target as HTMLElement).closest("[data-dock]")) return;
      setMenu(null);
    };
    window.addEventListener("keydown", close);
    window.addEventListener("pointerdown", close);
    return () => {
      window.removeEventListener("keydown", close);
      window.removeEventListener("pointerdown", close);
    };
  }, [menu]);

  return (
    <nav
      aria-label={t("controls")}
      data-dock
      className="pointer-events-auto absolute bottom-3 left-1/2 -translate-x-1/2 max-w-[calc(100vw-24px)]"
    >
      {menu === "emotes" && (
        <div className="cabinet p-1.5 mb-2 flex gap-0.5 justify-center rise" role="menu" aria-label={t("emote")}>
          {EMOTES.map((e, i) => (
            <button
              key={e}
              type="button"
              role="menuitem"
              className="h-12 w-12 rounded-lg p-1 hover:bg-white/10 transition-transform hover:-translate-y-0.5"
              title={`${e} (${i + 1})`}
              aria-label={e}
              onClick={() => {
                w?.emote(i);
                setMenu(null);
              }}
            >
              {/* biome-ignore lint/performance/noImgElement: inline SVG data URL */}
              <img alt="" src={emoteUrl(e)} className="w-full h-full" draggable={false} />
            </button>
          ))}
        </div>
      )}
      {menu === "status" && (
        <div className="cabinet p-1.5 mb-2 ml-auto w-56 rise" role="menu" aria-label={t("status")}>
          {STATUSES.map((s) => (
            <button
              key={s}
              type="button"
              role="menuitemradio"
              aria-checked={status === s}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-left hover:bg-white/10"
              style={status === s ? { background: "rgba(255,179,92,.12)", color: "var(--vfd)" } : undefined}
              onClick={() => {
                w?.setStatus(s);
                setMenu(null);
              }}
            >
              <i className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: STATUS_COLOR[s] }} />
              {t(`status_${s}`)}
            </button>
          ))}
        </div>
      )}
      <div className="cabinet p-2 flex items-center gap-1.5 overflow-x-auto scroll-thin">
        <button
          type="button"
          className={`deck-btn ${media.mic ? "" : "danger"}`}
          aria-pressed={media.mic}
          onClick={() => void w?.toggleMic()}
          title={`${t("mic")} (M)`}
          aria-label={t("mic")}
          disabled={!ready}
        >
          <Icon name={media.mic ? "mic" : "micOff"} size={20} />
          {media.mic && <MicMeter />}
        </button>
        <button
          type="button"
          className="deck-btn"
          aria-pressed={media.cam}
          onClick={() => void w?.toggleCam()}
          title={`${t("cam")} (V)`}
          aria-label={t("cam")}
          disabled={!ready}
        >
          <Icon name={media.cam ? "cam" : "camOff"} size={20} />
        </button>
        <button
          type="button"
          className="deck-btn hidden sm:inline-flex"
          aria-pressed={media.screen}
          onClick={() => void w?.toggleScreen()}
          title={t("screen")}
          aria-label={t("screen")}
          disabled={!media.ready}
        >
          <Icon name="screen" size={20} />
        </button>
        <span className="hidden sm:block w-px h-8 mx-1 shrink-0" style={{ background: "var(--edge)" }} aria-hidden />
        <button
          type="button"
          className="deck-btn"
          aria-pressed={menu === "emotes"}
          onClick={() => setMenu((m) => (m === "emotes" ? null : "emotes"))}
          title={`${t("emote")} (1–8)`}
          aria-label={t("emote")}
        >
          {/* biome-ignore lint/performance/noImgElement: inline SVG data URL */}
          <img alt="" src={emoteUrl("laugh")} className="w-7 h-7" draggable={false} />
        </button>
        <button
          type="button"
          className="deck-btn"
          aria-pressed={side === "chat"}
          onClick={() => toggleSide("chat")}
          title={`${t("chat")} (Enter)`}
          aria-label={t("chat")}
        >
          <Icon name="chat" size={20} />
          {unread > 0 && (
            <span
              className="absolute -top-1.5 -right-1.5 min-w-5 h-5 px-1 rounded-full text-[11px] font-semibold flex items-center justify-center"
              style={{ background: "var(--rust)", color: "var(--cream)", border: "2px solid #2a1c13" }}
            >
              {unread}
            </span>
          )}
        </button>
        <button
          type="button"
          className="deck-btn hidden sm:inline-flex"
          aria-pressed={side === "people"}
          onClick={() => toggleSide("people")}
          title={t("people")}
          aria-label={t("people")}
        >
          <Icon name="people" size={20} />
        </button>
        <span className="hidden sm:block w-px h-8 mx-1 shrink-0" style={{ background: "var(--edge)" }} aria-hidden />
        <button
          type="button"
          className="h-11 rounded-[10px] px-3 flex items-center gap-2 mono text-xs uppercase tracking-wide shrink-0"
          style={{ background: "rgba(0,0,0,.25)", border: "1px solid var(--edge)", color: "var(--cream)" }}
          aria-haspopup="menu"
          aria-expanded={menu === "status"}
          onClick={() => setMenu((m) => (m === "status" ? null : "status"))}
          title={t("status")}
        >
          <i
            className="w-2.5 h-2.5 rounded-full"
            style={{ background: STATUS_COLOR[status], boxShadow: `0 0 6px ${STATUS_COLOR[status]}` }}
          />
          <span className="hidden md:inline">{t(`status_${status}` as "status_online").split(" ")[0]}</span>
          <Icon name="chev" size={14} />
        </button>
        <span className="hidden sm:block w-px h-8 mx-1 shrink-0" style={{ background: "var(--edge)" }} aria-hidden />
        {canBuild && (
          <button
            type="button"
            className="deck-btn hidden sm:inline-flex"
            onClick={() => hud.set((s) => ({ build: { ...s.build, on: true, holding: null } }))}
            title={t("build")}
            aria-label={t("build")}
          >
            <Icon name="hammer" size={20} />
          </button>
        )}
        <button
          type="button"
          className="deck-btn"
          onClick={() => hud.set({ panel: { kind: "settings" } })}
          title={t("settings")}
          aria-label={t("settings")}
        >
          <Icon name="gear" size={20} />
        </button>
      </div>
    </nav>
  );
}

// Five bars that follow my voice, drawn straight into the DOM every frame.
function MicMeter() {
  const w = useWorld();
  const bars = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    let raf = 0;
    let level = 0;
    const tick = () => {
      const el = bars.current;
      if (el && w) {
        level = Math.max(w.media.micLevel(), level * 0.82);
        Array.from(el.children).forEach((b, i) => {
          (b as HTMLElement).style.background = level > (i + 0.5) / 5 ? "#6b3b10" : "#d9cba9";
        });
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [w]);
  return (
    <span ref={bars} className="flex items-end gap-[2px] h-[18px]" aria-hidden>
      {[5, 8, 11, 14, 17].map((h) => (
        <span key={h} className="w-[3px] rounded-[1px]" style={{ height: h, background: "#d9cba9" }} />
      ))}
    </span>
  );
}
