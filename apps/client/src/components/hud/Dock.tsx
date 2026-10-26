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

// (its menus over the dark's quick slots, z 40, which sit just above the dock on a phone)
// The deck, in groups: talk (mic with a live meter, camera, screen) · social
// (emotes, the phone, people) · me (status) · make (build, pets, settings); each
// key named under it (docs/plan/45-the-ui.md).
export function Dock() {
  const t = useTr();
  const w = useWorld();
  const media = useHud((s) => s.media);
  const status = useHud((s) => s.me?.status ?? "online");
  const side = useHud((s) => s.side);
  const phone = useHud((s) => s.phone);
  const canBuild = useHud((s) => s.canBuild);
  const [menu, setMenu] = useState<"emotes" | "status" | "more" | null>(null);
  const toggleSide = (tab: SideTab) => hud.set((s) => ({ side: s.side === tab ? null : tab }));
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
      className="pointer-events-auto absolute bottom-3 left-3 right-3 sm:right-auto sm:left-1/2 sm:-translate-x-1/2 sm:max-w-[calc(100vw-24px)]"
    >
      {menu === "emotes" && (
        <div
          className="cabinet relative z-[41] p-1.5 mb-2 flex gap-0.5 justify-center rise"
          role="menu"
          aria-label={t("emote")}
        >
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
      {(menu === "status" || menu === "more") && (
        <div
          className="cabinet relative z-[41] p-1.5 mb-2 ml-auto w-56 rise"
          role="menu"
          aria-label={menu === "more" ? t("more") : t("status")}
        >
          {STATUSES.map((s) => (
            <button
              key={s}
              type="button"
              role="menuitemradio"
              aria-checked={status === s}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-left hover:bg-white/10"
              style={status === s ? { background: "var(--lamp-tint)", color: "var(--vfd)" } : undefined}
              onClick={() => {
                w?.setStatus(s);
                setMenu(null);
              }}
            >
              <i className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: STATUS_COLOR[s] }} />
              {t(`status_${s}`)}
            </button>
          ))}
          {/* on a phone, "more": the status, then the keys the dock has no room for */}
          {menu === "more" && (
            <>
              <div className="my-1 h-px" style={{ background: "var(--edge)" }} aria-hidden />
              {(
                [
                  ["pets", "paw"],
                  ["settings", "gear"],
                ] as const
              ).map(([kind, icon]) => (
                <button
                  key={kind}
                  type="button"
                  role="menuitem"
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-left hover:bg-white/10"
                  onClick={() => {
                    setMenu(null);
                    hud.set(kind === "pets" ? { panel: { kind }, petFocus: null } : { panel: { kind } });
                  }}
                >
                  <Icon name={icon} size={16} />
                  {t(kind)}
                </button>
              ))}
            </>
          )}
        </div>
      )}
      <div className="cabinet px-2 pt-2 pb-1.5 flex items-start justify-between sm:justify-start gap-1 overflow-x-auto scroll-thin">
        <Key label={media.mic ? t("mic") : t("muted")} on={media.mic}>
          <button
            type="button"
            className={`deck-btn ${media.mic ? "" : "danger"}`}
            aria-pressed={media.mic}
            onClick={() => void w?.toggleMic()}
            title={media.asleep ? `${t("mic")} (M) — ${t("voiceAsleep")}` : `${t("mic")} (M)`}
            aria-label={t("mic")}
            disabled={!ready}
            data-voice-asleep={media.asleep || undefined}
          >
            <Icon name={media.mic ? "mic" : "micOff"} size={20} />
            {media.mic && <MicMeter />}
            {media.asleep && (
              <span
                className="absolute -top-1.5 -right-1.5 h-5 px-1 rounded-full text-[10px] font-semibold flex items-center"
                style={{
                  background: "var(--panel-raised)",
                  color: "var(--cream-dim)",
                  border: "1px solid var(--edge)",
                }}
                aria-hidden
              >
                zz
              </span>
            )}
          </button>
        </Key>
        <Key label={t("cam")} on={media.cam}>
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
        </Key>
        <Key label={t("screenShort")} on={media.screen} className="hidden sm:flex">
          <button
            type="button"
            className="deck-btn"
            aria-pressed={media.screen}
            onClick={() => void w?.toggleScreen()}
            title={t("screen")}
            aria-label={t("screen")}
            disabled={!media.ready}
          >
            <Icon name="screen" size={20} />
          </button>
        </Key>
        <Rule />
        <Key label={t("emote")} on={menu === "emotes"}>
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
        </Key>
        <Key label={t("phone")} on={phone.open || phone.ringing}>
          <button
            type="button"
            className={`deck-btn ${phone.open || phone.ringing ? "lit" : ""} ${phone.ringing ? "ringing" : ""}`}
            aria-pressed={phone.open}
            onClick={() => void w?.togglePhone()}
            title={`${t("phone")} (P)`}
            aria-label={t("phone")}
            data-phone-key
          >
            <Icon name="phone" size={20} />
            {phone.badge > 0 && (
              <span
                className="absolute -top-1.5 -right-1.5 min-w-5 h-5 px-1 rounded-full text-[11px] font-semibold flex items-center justify-center"
                style={{ background: "var(--rust)", color: "var(--cream)", border: "2px solid var(--panel)" }}
              >
                {phone.badge > 9 ? "9+" : phone.badge}
              </span>
            )}
          </button>
        </Key>
        <Key label={t("people")} on={side === "people"}>
          <button
            type="button"
            className="deck-btn"
            aria-pressed={side === "people"}
            onClick={() => toggleSide("people")}
            title={t("people")}
            aria-label={t("people")}
          >
            <Icon name="people" size={20} />
          </button>
        </Key>
        <Rule />
        <Key label={t("status")} on={menu === "status"} className="hidden sm:flex">
          <button
            type="button"
            className="deck-btn shrink-0 gap-2"
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
        </Key>
        <Rule />
        {canBuild && (
          <Key label={t("build")} className="hidden sm:flex">
            <button
              type="button"
              className="deck-btn"
              onClick={() => hud.set((s) => ({ build: { ...s.build, on: true, mode: "hand" } }))}
              title={t("build")}
              aria-label={t("build")}
            >
              <Icon name="hammer" size={20} />
            </button>
          </Key>
        )}
        <Key label={t("pets")} className="hidden sm:flex">
          <button
            type="button"
            className="deck-btn"
            onClick={() => hud.set({ panel: { kind: "pets" }, petFocus: null })}
            title={t("pets")}
            aria-label={t("pets")}
          >
            <Icon name="paw" size={20} />
          </button>
        </Key>
        <Key label={t("settings")} className="hidden sm:flex">
          <button
            type="button"
            className="deck-btn"
            onClick={() => hud.set({ panel: { kind: "settings" } })}
            title={t("settings")}
            aria-label={t("settings")}
          >
            <Icon name="gear" size={20} />
          </button>
        </Key>
        <Key label={t("more")} on={menu === "more"} className="flex sm:hidden">
          <button
            type="button"
            className="deck-btn text-lg"
            aria-haspopup="menu"
            aria-expanded={menu === "more"}
            onClick={() => setMenu((m) => (m === "more" ? null : "more"))}
            aria-label={t("more")}
          >
            ⋯
          </button>
        </Key>
      </div>
    </nav>
  );
}

// A key and its name under it (the name from sm up: on a phone the keys alone).
function Key({
  label,
  on = false,
  className = "flex",
  children,
}: {
  label: string;
  on?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`${className} flex-col items-center gap-1 shrink-0`}>
      {children}
      <span
        className="hidden sm:block mono text-[10.5px] leading-none whitespace-nowrap"
        style={{ color: on ? "var(--cream)" : "var(--cream-dim)" }}
        aria-hidden
      >
        {label}
      </span>
    </div>
  );
}

// The line between the dock's groups.
function Rule() {
  return (
    <span className="hidden sm:block w-px h-9 mx-1.5 mt-1 shrink-0" style={{ background: "var(--edge)" }} aria-hidden />
  );
}

// Five bars that follow my voice, drawn straight into the DOM every frame.
function MicMeter() {
  const w = useWorld();
  const bars = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!w) return;
    let level = 0;
    let lit = -1;
    return w.onFrame(() => {
      const el = bars.current;
      if (!el) return;
      level = Math.max(w.media.micLevel(), level * 0.82);
      const n = Math.min(5, Math.floor(level * 5 + 0.5));
      if (n === lit) return;
      lit = n;
      Array.from(el.children).forEach((b, i) => {
        (b as HTMLElement).style.background = i < n ? "var(--meter-lit)" : "var(--cream-dim)";
      });
    });
  }, [w]);
  return (
    <span ref={bars} className="flex items-end gap-[2px] h-[18px]" aria-hidden>
      {[5, 8, 11, 14, 17].map((h) => (
        <span key={h} className="w-[3px] rounded-[1px]" style={{ height: h, background: "var(--cream-dim)" }} />
      ))}
    </span>
  );
}
