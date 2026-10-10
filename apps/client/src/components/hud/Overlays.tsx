"use client";

import { useEffect, useRef } from "react";
import { useTr } from "@/lib/i18n";
import { hud, useHud } from "@/world/store";
import { useWorld } from "./ctx";

export function Prompt() {
  const t = useTr();
  const w = useWorld();
  const prompt = useHud((s) => s.prompt);
  const panel = useHud((s) => s.panel.kind);
  const building = useHud((s) => s.build.on);
  if (!prompt || panel || building) return null;
  return (
    <button
      type="button"
      onClick={() => w?.interact()}
      className="pointer-events-auto absolute left-1/2 -translate-x-1/2 bottom-24 cabinet px-3 py-2 flex items-center gap-2 rise"
    >
      <kbd className="deck-btn" style={{ height: 28, minWidth: 28, padding: "0 6px" }}>
        X
      </kbd>
      <span className="mono text-sm">
        {prompt.label} —{" "}
        {prompt.kind === "board" || prompt.kind === "notice" || prompt.kind === "screen"
          ? t("pressToOpen")
          : t("pressToUse")}
      </span>
    </button>
  );
}

export function Knocks() {
  const t = useTr();
  const w = useWorld();
  const knocks = useHud((s) => s.knocks);
  if (!knocks.length) return null;
  return (
    <div className="pointer-events-auto absolute top-24 right-3 space-y-2 w-[min(320px,calc(100vw-24px))]" role="alert">
      {knocks.map((k) => (
        <div key={k.from} className="cabinet p-3 rise">
          <p className="text-sm">
            🚪 <b>{k.fromName}</b> {t("knocking")}
          </p>
          <div className="flex gap-2 mt-2">
            <button type="button" className="deck-btn" style={{ height: 34 }} onClick={() => w?.admit(k)}>
              {t("letIn")}
            </button>
            <button type="button" className="ghost-btn" onClick={() => w?.dismissKnock(k.from)}>
              {t("ignore")}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

export function Toasts() {
  const toasts = useHud((s) => s.toasts);
  return (
    <div
      className="pointer-events-none absolute top-24 left-1/2 -translate-x-1/2 space-y-2 flex flex-col items-center"
      aria-live="polite"
    >
      {toasts.map((x) => (
        <div
          key={x.id}
          className="cabinet px-4 py-2 text-sm rise max-w-[90vw]"
          style={
            x.tone === "vortex"
              ? { borderColor: "#7a2a1e", color: "#ffb35c" }
              : x.tone === "warn"
                ? { borderColor: "#8a4a2a" }
                : {}
          }
        >
          {x.text}
        </div>
      ))}
    </div>
  );
}

// Camera bubbles float above avatars (only people you can hear send video).
export function VideoBubbles() {
  const w = useWorld();
  const videos = useHud((s) => s.videos);
  const people = useHud((s) => s.people);
  const me = useHud((s) => s.me);
  const camOn = useHud((s) => s.media.cam);
  const host = useRef<HTMLDivElement>(null);
  const localVideo = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    if (!w) return;
    localVideo.current = camOn ? w.media.localVideo("camera") : null;
    return () => {
      localVideo.current?.remove();
      localVideo.current = null;
    };
  }, [camOn, w]);

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const el = host.current;
      if (el && w?.engine) {
        for (const node of Array.from(el.children) as HTMLElement[]) {
          const x = Number(node.dataset.x);
          const y = Number(node.dataset.y);
          const p = w.engine.worldToClient(x, y, 96);
          node.style.transform = `translate(${Math.round(p.x - 60)}px, ${Math.round(p.y - 90)}px)`;
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  });

  const entries: { key: string; x: number; y: number; video: HTMLVideoElement; name: string; speaking: boolean }[] = [];
  for (const p of people) {
    const v = videos[String(p.uid)];
    if (v && p.hearing) entries.push({ key: p.sid, x: p.x, y: p.y, video: v, name: p.name, speaking: p.speaking });
  }
  if (me && camOn && localVideo.current)
    entries.push({ key: "me", x: me.x, y: me.y, video: localVideo.current, name: me.name, speaking: me.speaking });

  return (
    <div ref={host} className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      {entries.map((e) => (
        <div
          key={e.key}
          data-x={e.x}
          data-y={e.y}
          className="absolute left-0 top-0 rounded-xl overflow-hidden"
          style={{
            width: 120,
            height: 90,
            border: `2px solid ${e.speaking ? "var(--amber)" : "#5a412f"}`,
            boxShadow: "0 8px 24px #0009",
            background: "#000",
          }}
          ref={(node) => {
            if (node && e.video.parentElement !== node) {
              e.video.style.width = "100%";
              e.video.style.height = "100%";
              e.video.style.objectFit = "cover";
              if (e.key === "me") e.video.style.transform = "scaleX(-1)";
              node.prepend(e.video);
              void e.video.play().catch(() => {});
            }
          }}
        >
          <span
            className="absolute bottom-1 left-1.5 mono text-[10px] px-1 rounded"
            style={{ background: "#000a", color: "var(--cream)" }}
          >
            {e.name}
          </span>
        </div>
      ))}
    </div>
  );
}

export function ConnectionOverlay() {
  const t = useTr();
  const phase = useHud((s) => s.phase);
  const error = useHud((s) => s.error);
  if (phase === "ready") return null;
  const msg =
    phase === "loading" || phase === "connecting"
      ? t("connecting")
      : phase === "reconnecting"
        ? t("reconnecting")
        : phase === "kicked"
          ? t("kicked")
          : phase === "removed"
            ? t("removed")
            : error === "404"
              ? t("noSpaces")
              : error || t("failed");
  const blocking = phase !== "reconnecting";
  return (
    <div
      className={`absolute inset-0 flex items-center justify-center ${blocking ? "bg-[#17110dcc]" : "pointer-events-none"}`}
      aria-live="polite"
    >
      <div className="cabinet p-6 text-center rise max-w-sm">
        <div className="vfd-window px-4 py-3">
          <p className="lcd text-2xl">{msg}</p>
        </div>
        {(phase === "failed" || phase === "kicked" || phase === "removed") && (
          <div className="flex gap-2 justify-center mt-4">
            <button type="button" className="deck-btn" onClick={() => location.reload()}>
              {t("retry")}
            </button>
            <a href="/" className="ghost-btn self-center">
              {t("back")}
            </a>
          </div>
        )}
      </div>
    </div>
  );
}

export function Minimap() {
  const t = useTr();
  const w = useWorld();
  const canvas = useRef<HTMLCanvasElement>(null);
  const people = useHud((s) => s.people);
  const me = useHud((s) => s.me);
  const vortex = useHud((s) => s.vortex);
  const phase = useHud((s) => s.phase);
  const mapVersion = useHud((s) => s.mapVersion);

  // biome-ignore lint/correctness/useExhaustiveDependencies: phase/mapVersion re-draw when the world is ready or the map changes
  useEffect(() => {
    const c = canvas.current;
    const map = w?.map;
    if (!c || !map) return;
    const S = 3;
    c.width = map.width * S;
    c.height = map.height * S;
    const x = c.getContext("2d") as CanvasRenderingContext2D;
    x.clearRect(0, 0, c.width, c.height);
    for (let yy = 0; yy < map.height; yy++)
      for (let xx = 0; xx < map.width; xx++) {
        const ch = map.tiles[yy][xx];
        x.fillStyle =
          ch === "#"
            ? "#7a5236"
            : ch === " "
              ? "transparent"
              : ch === "~"
                ? "#3c3129"
                : ch === ":"
                  ? "#7a3b2e"
                  : ch === ","
                    ? "#6b6a3a"
                    : ch === "x"
                      ? "#4a4740"
                      : "#c9b28a";
        x.fillRect(xx * S, yy * S, S, S);
      }
    for (const p of people) {
      x.fillStyle = p.hearing ? "#ffa630" : "#efe4cc";
      x.fillRect(p.x * S - 2, p.y * S - 2, 4, 4);
    }
    if (vortex) {
      x.fillStyle = "#c4402b";
      x.fillRect(vortex.x * S - 2, vortex.y * S - 2, 4, 4);
    }
    if (me) {
      x.fillStyle = "#ff5a2a";
      x.beginPath();
      x.arc(me.x * S, me.y * S, 3.5, 0, Math.PI * 2);
      x.fill();
    }
  }, [w, people, me, vortex, phase, mapVersion]);

  return (
    <button
      type="button"
      className="pointer-events-auto absolute right-3 bottom-3 cabinet p-1.5 hidden md:block"
      aria-label={t("minimap")}
      onClick={(e) => {
        const r = (e.currentTarget.firstChild as HTMLCanvasElement).getBoundingClientRect();
        const map = w?.map;
        if (!map) return;
        const tx = ((e.clientX - r.left) / r.width) * map.width;
        const ty = ((e.clientY - r.top) / r.height) * map.height;
        w?.walkTo({ x: tx, y: ty });
        hud.set({});
      }}
    >
      <canvas
        ref={canvas}
        style={{ width: 144, maxHeight: 144, objectFit: "contain", imageRendering: "pixelated" }}
        className="rounded-md block"
      />
    </button>
  );
}
