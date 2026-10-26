"use client";

import { useEffect, useRef, useState } from "react";
import { useTr } from "@/lib/i18n";
import { useHud } from "@/world/store";
import { useWorld } from "./ctx";
import { Icon } from "./icons";

// Shared screens: mine (a preview, and a way to stop) and everyone's I can
// hear (people near me, my room, the stage), as tiles in the corner; one
// opens big. The big screens in the world show them too.
export function ScreenTray() {
  const t = useTr();
  const w = useWorld();
  const screens = useHud((s) => s.screens);
  const people = useHud((s) => s.people);
  const sharing = useHud((s) => s.media.screen);
  const side = useHud((s) => s.side);
  const [mine, setMine] = useState<HTMLVideoElement | null>(null);
  const [big, setBig] = useState<string | null>(null);

  // my own share, from the published track
  useEffect(() => {
    if (!w || !sharing) return setMine(null);
    const el = w.media.localVideo("screen");
    setMine(el);
    return () => el?.remove();
  }, [sharing, w]);

  const tiles: { key: string; name: string; video: HTMLVideoElement; me: boolean }[] = [];
  if (mine) tiles.push({ key: "me", name: t("screenYours"), video: mine, me: true });
  for (const p of people) {
    const v = screens[String(p.uid)];
    if (v && p.hearing)
      tiles.push({ key: String(p.uid), name: t("screenOf").replace("{name}", p.name), video: v, me: false });
  }
  const open = tiles.find((x) => x.key === big) ?? null;
  useEffect(() => {
    if (big && !open) setBig(null);
  }, [big, open]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setBig(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);
  if (!tiles.length) return null;

  return (
    <>
      <ul
        className={`pointer-events-auto absolute bottom-[176px] sm:bottom-[112px] flex flex-col-reverse gap-2 rise ${side ? "right-3 sm:right-[392px]" : "right-3"}`}
        aria-label={t("screensShared")}
      >
        {tiles.map((x) => (
          <li key={x.key} className="cabinet p-1.5 w-[232px]">
            <button
              type="button"
              className="block w-full rounded-lg overflow-hidden relative"
              style={{ aspectRatio: "16 / 9", background: "#000" }}
              onClick={() => setBig(x.key)}
              aria-label={`${t("screenOpen")}: ${x.name}`}
            >
              {open?.key === x.key ? (
                <span
                  className="absolute inset-0 grid place-items-center mono text-[11px]"
                  style={{ color: "var(--muted)" }}
                >
                  {t("screenOpened")}
                </span>
              ) : (
                <Stream video={x.video} />
              )}
              <span
                className="absolute top-1 left-1 mono text-[10px] px-1.5 rounded"
                style={{ background: "var(--danger-edge)", color: "#fff" }}
              >
                ● LIVE
              </span>
            </button>
            <div className="flex items-center gap-2 pt-1.5 px-0.5">
              <Icon name="screen" size={14} />
              <span className="text-[12px] truncate flex-1">{x.name}</span>
              {x.me && (
                <button
                  type="button"
                  className="deck-btn danger"
                  style={{ height: 26, fontSize: 11 }}
                  onClick={() => void w?.toggleScreen()}
                >
                  {t("screenStop")}
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
      {open && (
        <div
          className="pointer-events-auto absolute inset-0 z-40 grid place-items-center p-4"
          style={{ background: "#000c" }}
        >
          <button
            type="button"
            className="absolute inset-0 cursor-default"
            aria-label={t("close")}
            onClick={() => setBig(null)}
          />
          <section className="relative cabinet p-2 w-[min(1280px,calc(100vw-32px))] rise" aria-label={open.name}>
            <header className="flex items-center gap-2 px-1 pb-2">
              <span className="mono text-xs" style={{ color: "var(--vfd)" }}>
                ● LIVE
              </span>
              <span className="text-sm flex-1 truncate">{open.name}</span>
              {open.me && (
                <button
                  type="button"
                  className="deck-btn danger"
                  style={{ height: 30, fontSize: 12 }}
                  onClick={() => void w?.toggleScreen()}
                >
                  {t("screenStop")}
                </button>
              )}
              <button
                type="button"
                className="deck-btn"
                style={{ height: 30 }}
                onClick={() => setBig(null)}
                aria-label={t("close")}
              >
                <Icon name="close" size={16} />
              </button>
            </header>
            <div
              className="rounded-lg overflow-hidden"
              style={{ aspectRatio: "16 / 9", maxHeight: "calc(100vh - 120px)", background: "#000", margin: "0 auto" }}
            >
              <Stream video={open.video} contain />
            </div>
          </section>
        </div>
      )}
    </>
  );
}

// The stream itself, shown here: the video element LiveKit attached (it only
// sends a remote video while that element is on screen, sized to it — the
// world's big screens copy its stream). Only one place shows it at a time.
function Stream({ video, contain = false }: { video: HTMLVideoElement; contain?: boolean }) {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    video.muted = true;
    video.playsInline = true;
    video.style.cssText = `width:100%;height:100%;object-fit:${contain ? "contain" : "cover"};display:block`;
    el.appendChild(video);
    void video.play().catch(() => {});
    return () => {
      if (video.parentElement === el) el.removeChild(video);
    };
  }, [video, contain]);
  return <div ref={host} className="w-full h-full" />;
}
