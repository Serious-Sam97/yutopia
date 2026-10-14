"use client";

import { HELD, heldState, isHeld } from "@yutopia/shared";
import { useEffect, useRef, useState } from "react";
import { type Key, useTr } from "@/lib/i18n";
import { HELD_BOX, heldSvg, MUG_COLORS } from "@/world/art/held";
import { PERSON } from "@/world/art/iso";
import { svgDoc } from "@/world/art/svgdoc";
import { useHud } from "@/world/store";
import { ItemThumb } from "./build/thumbs";
import { useWorld } from "./ctx";

// What's in reach: the thing's picture, its name, and how to use it.
export function Prompt() {
  const t = useTr();
  const w = useWorld();
  const prompt = useHud((s) => s.prompt);
  const panel = useHud((s) => s.panel.kind);
  const building = useHud((s) => s.build.on);
  const touch = typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches;
  if (!prompt || panel || building) return null;
  const o = w?.engine?.getObject(prompt.objectId);
  const opens = prompt.kind === "board" || prompt.kind === "notice" || prompt.kind === "screen";
  return (
    <button
      type="button"
      onClick={() => w?.interact()}
      className="pointer-events-auto absolute left-1/2 -translate-x-1/2 bottom-[88px] cabinet rounded-full pl-1.5 pr-4 py-1.5 flex items-center gap-2.5 rise max-w-[calc(100vw-24px)]"
    >
      <span
        className="w-9 h-9 rounded-full grid place-items-center shrink-0 p-1"
        style={{ background: "radial-gradient(#4a3324,#241912)", border: "1px solid var(--edge)" }}
        aria-hidden
      >
        {o && <ItemThumb kind={o.kind} props={o.props} />}
      </span>
      {!touch && (
        <kbd className="keycap" style={{ color: "var(--cream)", opacity: 1, height: 20, minWidth: 20, fontSize: 11 }}>
          X
        </kbd>
      )}
      <span className="text-sm truncate">{prompt.label}</span>
      <span className="mono text-[11px] whitespace-nowrap" style={{ color: "var(--muted)" }}>
        · {touch ? t("tapToUse") : opens ? t("pressToOpen") : t("pressToUse")}
      </span>
    </button>
  );
}

// What I carry (a mug from the coffee machine): its picture, how much is
// left, and a button to put it down.
export function HeldChip() {
  const t = useTr();
  const w = useWorld();
  const held = useHud((s) => s.held);
  const me = useHud((s) => s.me);
  const [, tick] = useState(0);
  useEffect(() => {
    if (!held) return;
    const i = setInterval(() => tick((n) => n + 1), 500);
    return () => clearInterval(i);
  }, [held]);
  if (!held || !isHeld(held.kind)) return null;
  const st = heldState(held.kind, Date.now() - held.at);
  const level = Math.round(st.level * 4);
  // the same mug the world draws in my hand
  let h = 2166136261;
  for (const ch of me?.name ?? "") h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  const color = MUG_COLORS[Math.floor(((h >>> 0) / 4294967296) * MUG_COLORS.length)];
  const src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgDoc(heldSvg(held.kind, color, level), HELD_BOX, 3))}`;
  const label: Key = held.kind === "cup" ? "heldCup" : held.kind === "soda" ? "heldSoda" : "heldMug";
  return (
    <div className="pointer-events-auto absolute left-1/2 -translate-x-1/2 bottom-[136px] cabinet rounded-full pl-1.5 pr-1.5 py-1 flex items-center gap-2.5 rise">
      <span
        className="w-8 h-8 rounded-full grid place-items-center shrink-0"
        style={{ background: "radial-gradient(#4a3324,#241912)", border: "1px solid var(--edge)" }}
        aria-hidden
      >
        {/* biome-ignore lint/performance/noImgElement: generated SVG data URI */}
        <img src={src} alt="" width={22} height={25} />
      </span>
      <span className="text-sm">{t(label)}</span>
      <span className="flex gap-[3px]" role="img" aria-label={`${level}/4`}>
        {[0, 1, 2, 3].map((i) => (
          <span
            key={i}
            className="w-[7px] h-3 rounded-[2px]"
            style={{
              background: i < level ? "var(--vfd)" : "#3a2c1f",
              boxShadow: i < level ? "0 0 6px rgba(255,179,92,.5)" : "none",
            }}
          />
        ))}
      </span>
      {level === 0 && (
        <span className="mono text-[11px]" style={{ color: "var(--muted)" }}>
          {t("heldEmpty")}
        </span>
      )}
      <button type="button" className="deck-btn" style={{ height: 28, fontSize: 12 }} onClick={() => w?.putDown()}>
        {t("heldPutDown")}
      </button>
      <span className="sr-only">{HELD[held.kind].label}</span>
    </div>
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
          // over their head, in whichever view is showing (iso or third person)
          const p = w.clientAt(x, y, 116 * PERSON);
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
    // a bubble only while their camera is on (a muted camera is still a black track)
    if (v && p.hearing && p.cam)
      entries.push({ key: p.sid, x: p.x, y: p.y, video: v, name: p.name, speaking: p.speaking });
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

// The studio from above: rooms labelled, the one you're in outlined, people as
// dots (amber: you can hear them), you in red. Click to walk there; ± zooms the
// world camera. Bottom left (bottom right while building: the catalog is left).
export function Minimap() {
  const t = useTr();
  const w = useWorld();
  const canvas = useRef<HTMLCanvasElement>(null);
  const people = useHud((s) => s.people);
  const me = useHud((s) => s.me);
  const vortex = useHud((s) => s.vortex);
  const phase = useHud((s) => s.phase);
  const mapVersion = useHud((s) => s.mapVersion);
  const building = useHud((s) => s.build.on);

  // biome-ignore lint/correctness/useExhaustiveDependencies: phase/mapVersion re-draw when the world is ready or the map changes
  useEffect(() => {
    const c = canvas.current;
    const map = w?.map;
    if (!c || !map) return;
    const S = 6; // canvas px per tile (drawn at 2× for crisp labels)
    c.width = map.width * S;
    c.height = map.height * S;
    const x = c.getContext("2d") as CanvasRenderingContext2D;
    x.clearRect(0, 0, c.width, c.height);
    for (let yy = 0; yy < map.height; yy++)
      for (let xx = 0; xx < map.width; xx++) {
        const ch = map.tiles[yy][xx];
        if (ch === " ") continue;
        x.fillStyle =
          ch === "~"
            ? "#3c3129"
            : ch === ":"
              ? "#7a3b2e"
              : ch === ","
                ? "#6b6a3a"
                : ch === "x"
                  ? "#4a4740"
                  : ch === "_"
                    ? "#b9ad92"
                    : "#a07a52";
        x.fillRect(xx * S, yy * S, S, S);
      }
    // walls
    x.fillStyle = "#2a1c13";
    for (let yy = 0; yy <= map.height; yy++)
      for (let xx = 0; xx < map.width; xx++)
        if ((map.hWalls[yy]?.[xx] ?? ".") !== ".") x.fillRect(xx * S, yy * S - 1, S, 2);
    for (let yy = 0; yy < map.height; yy++)
      for (let xx = 0; xx <= map.width; xx++)
        if ((map.vWalls[yy]?.[xx] ?? ".") !== ".") x.fillRect(xx * S - 1, yy * S, 2, S);
    // room labels, where they fit
    x.font = "600 13px 'Share Tech Mono', ui-monospace, monospace";
    x.textBaseline = "top";
    for (const a of map.areas) {
      if ((a.priority ?? 0) > 1) continue;
      const label = a.name.toUpperCase();
      if (x.measureText(label).width > a.w * S - 8 || a.h * S < 22) continue;
      x.fillStyle = "rgba(26,18,12,.55)";
      x.fillRect(a.x * S + 3, a.y * S + 3, x.measureText(label).width + 6, 16);
      x.fillStyle = "#efe4cc";
      x.fillText(label, a.x * S + 6, a.y * S + 5);
    }
    // the room you're in
    const mine = map.areas.find((a) => a.key === me?.area);
    if (mine) {
      x.strokeStyle = "#ffb35c";
      x.lineWidth = 3;
      x.strokeRect(mine.x * S + 1.5, mine.y * S + 1.5, mine.w * S - 3, mine.h * S - 3);
    }
    for (const p of people) {
      x.fillStyle = p.bot ? "#a39d8c" : p.hearing ? "#ffa630" : "#efe4cc";
      x.beginPath();
      x.arc(p.x * S, p.y * S, 4, 0, Math.PI * 2);
      x.fill();
    }
    if (vortex) {
      x.fillStyle = "#ff2d95";
      x.beginPath();
      x.arc(vortex.x * S, vortex.y * S, 4, 0, Math.PI * 2);
      x.fill();
    }
    if (me) {
      x.fillStyle = "rgba(255,90,42,.25)";
      x.beginPath();
      x.arc(me.x * S, me.y * S, 14, 0, Math.PI * 2);
      x.fill();
      x.fillStyle = "#ff5a2a";
      x.strokeStyle = "#1a120c";
      x.lineWidth = 2;
      x.beginPath();
      x.arc(me.x * S, me.y * S, 6, 0, Math.PI * 2);
      x.fill();
      x.stroke();
    }
  }, [w, people, me, vortex, phase, mapVersion]);

  const zoom = (f: number) => w?.engine?.setZoom((w.engine?.getZoom() ?? 1) * f);
  return (
    <div
      className={`pointer-events-auto absolute bottom-3 cabinet p-2 hidden lg:block w-[208px] ${building ? "right-3" : "left-3"}`}
    >
      <button
        type="button"
        className="block w-full rounded-lg overflow-hidden"
        style={{ background: "#1a120c" }}
        aria-label={t("minimap")}
        onClick={(e) => {
          const r = (e.currentTarget.firstChild as HTMLCanvasElement).getBoundingClientRect();
          const map = w?.map;
          if (!map) return;
          const tx = ((e.clientX - r.left) / r.width) * map.width;
          const ty = ((e.clientY - r.top) / r.height) * map.height;
          w?.walkTo({ x: tx, y: ty });
        }}
      >
        <canvas ref={canvas} className="block w-full max-h-[150px] object-contain" />
      </button>
      <div className="flex items-center justify-between gap-2 pt-1.5 px-0.5">
        <span className="lcd text-base leading-none truncate">{(me?.areaName || t("hallway")).toUpperCase()}</span>
        <span className="flex gap-1 shrink-0">
          {(
            [
              ["−", 1 / 1.15, "minimapZoomOut"],
              ["+", 1.15, "minimapZoomIn"],
            ] as const
          ).map(([l, f, k]) => (
            <button
              key={l}
              type="button"
              className="w-6 h-6 rounded-md grid place-items-center mono text-sm hover:bg-white/5"
              style={{ border: "1px solid var(--edge)", color: "var(--cream-dim)" }}
              onClick={() => zoom(f)}
              aria-label={t(k)}
              title={t(k)}
            >
              {l}
            </button>
          ))}
        </span>
      </div>
    </div>
  );
}
