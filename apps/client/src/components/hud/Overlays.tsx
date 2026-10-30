"use client";

import { HELD, heldState, isHeld, isToyHeld } from "@yutopia/shared";
import { useEffect, useRef, useState } from "react";
import { type Key, trMaybe, useTr } from "@/lib/i18n";
import { HELD_BOX, heldSvg, MUG_COLORS } from "@/world/art/held";
import { PERSON } from "@/world/art/iso";
import { svgDoc } from "@/world/art/svgdoc";
import { useHud } from "@/world/store";
import { ItemThumb } from "./build/thumbs";
import { useWorld } from "./ctx";

// What's in reach (docs/plan/56-the-controls.md C): the focus at the bottom — its picture, its
// name, the button and what it does, "hold: more" when it has a menu — and the others in reach
// above it, smaller ([ ] or the pad's ↑ ↓ make one the focus). A car's door or the shuttle: on
// its own, as before.
export function Prompt() {
  const t = useTr();
  const w = useWorld();
  const prompt = useHud((s) => s.prompt);
  const targets = useHud((s) => s.targets);
  const pad = useHud((s) => s.padLive);
  const panel = useHud((s) => s.panel.kind);
  const menu = useHud((s) => s.menu);
  const building = useHud((s) => s.build.on);
  const touch = typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches;
  if (panel || building || menu) return null;
  const glyph = (
    <kbd
      className="keycap"
      style={{
        color: "var(--amber)",
        opacity: 1,
        height: 26,
        minWidth: 26,
        fontSize: 12,
        borderRadius: pad ? 13 : 5,
      }}
    >
      {pad ? "Y" : "E"}
    </kbd>
  );
  const own = prompt && /^(car|ride|plug)/.test(prompt.kind);
  if (!targets?.items.length || own) {
    if (!prompt) return null;
    const o = w?.model?.getObject(prompt.objectId);
    const opens = prompt.kind === "notice" || prompt.kind === "screen";
    return (
      <button
        type="button"
        onClick={() => w?.interact()}
        className="pointer-events-auto absolute left-1/2 -translate-x-1/2 bottom-[176px] sm:bottom-[112px] cabinet rounded-full pl-1.5 pr-4 py-1.5 flex items-center gap-2.5 rise max-w-[calc(100vw-24px)]"
      >
        <Thumb objectId={o ? prompt.objectId : undefined} />
        {!touch && glyph}
        <span className="text-sm truncate">{prompt.label}</span>
        {prompt.kind !== "plug" && (
          <span className="mono text-[11px] whitespace-nowrap" style={{ color: "var(--muted)" }}>
            · {touch ? t("tapToUse") : opens ? t("pressToOpen") : t("pressToUse")}
          </span>
        )}
      </button>
    );
  }
  const items = targets.items;
  const focus = items[targets.at] ?? items[0];
  const verb = (it: (typeof items)[number]) =>
    it.kind === "object" && it.act === "use"
      ? t(prompt?.kind === "notice" || prompt?.kind === "screen" ? "pressToOpen" : "pressToUse")
      : (trMaybe(`act_${it.act}`) ?? it.act);
  return (
    <div className="pointer-events-none absolute left-1/2 -translate-x-1/2 bottom-[176px] sm:bottom-[112px] flex flex-col items-center gap-1.5 max-w-[calc(100vw-24px)]">
      {items
        .filter((it) => it !== focus)
        .map((it) => (
          <div
            key={it.key}
            className="cabinet rounded-full pl-1 pr-3 py-1 flex items-center gap-2"
            style={{ transform: "scale(.86)", opacity: 0.72 }}
          >
            <Thumb objectId={it.objectId} kind={it.kind} />
            <span className="text-[13px] truncate">{it.label}</span>
            <span className="mono text-[11px] whitespace-nowrap" style={{ color: "var(--muted)" }}>
              · {verb(it)}
            </span>
          </div>
        ))}
      <button
        type="button"
        onClick={() => w?.interact()}
        className="pointer-events-auto cabinet rounded-full pl-1.5 pr-4 py-1.5 flex items-center gap-2.5 rise"
        data-focus={focus.key}
      >
        <Thumb objectId={focus.objectId} kind={focus.kind} />
        <span className="text-sm truncate">{focus.label}</span>
        {!touch && glyph}
        <span className="text-sm whitespace-nowrap" style={{ color: "var(--amber)" }}>
          {verb(focus)}
        </span>
        {!touch && focus.kind !== "toy" && focus.kind !== "npc" && (
          <span className="mono text-[11px] whitespace-nowrap" style={{ color: "var(--muted)" }}>
            · {t("holdMore")}
          </span>
        )}
      </button>
    </div>
  );
}

// a prompt's picture: the thing's, else a mark for who or what it is
function Thumb({ objectId, kind }: { objectId?: string; kind?: string }) {
  const w = useWorld();
  const o = objectId ? w?.model?.getObject(objectId) : undefined;
  return (
    <span
      className="w-9 h-9 rounded-full grid place-items-center shrink-0 p-1 text-[15px]"
      style={{ background: "radial-gradient(var(--tile-hi),var(--panel))", border: "1px solid var(--edge)" }}
      aria-hidden
    >
      {o ? <ItemThumb kind={o.kind} props={o.props} /> : MARK[kind ?? ""]}
    </span>
  );
}
const MARK: Record<string, string> = { person: "☺", pet: "🐾", npc: "◉", toy: "●" };

// The mouse is the camera (docs/plan/56-the-controls.md A): as it takes the pointer, how to get it
// back (gone after a few seconds); in play without it (Esc let it go, or not yet clicked), how to
// give it again — while nothing on screen wants the pointer.
const LOOK_HINT_MS = 3000;
export function LookHint() {
  const t = useTr();
  const look = useHud((s) => s.look);
  const free = useHud(
    (s) =>
      s.phase === "ready" &&
      !s.loading.on &&
      !s.menu &&
      !s.panel.kind &&
      !s.build.on &&
      !s.pickArrival &&
      s.side === null &&
      !s.phone.open &&
      !s.god.on,
  );
  const touch = typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches;
  const [phase, setPhase] = useState<"on" | "fading" | "off">("off");
  useEffect(() => {
    if (!look) return setPhase("off");
    setPhase("on");
    const fade = setTimeout(() => setPhase("fading"), LOOK_HINT_MS);
    const gone = setTimeout(() => setPhase("off"), LOOK_HINT_MS + 400);
    return () => {
      clearTimeout(fade);
      clearTimeout(gone);
    };
  }, [look]);
  if (touch) return null;
  const ask = !look && free;
  if (!ask && phase === "off") return null;
  return (
    <div
      // (rise holds opacity 1 once in: off while fading)
      className={`absolute left-1/2 -translate-x-1/2 top-[76px] cabinet rounded-full px-3 py-1 flex items-center gap-2 pointer-events-none ${ask || phase === "on" ? "rise" : ""}`}
      style={{ opacity: !ask && phase === "fading" ? 0 : 1, transition: "opacity .4s" }}
    >
      {!ask && (
        <kbd className="keycap" style={{ color: "var(--cream)", opacity: 1, height: 20, minWidth: 20, fontSize: 11 }}>
          Esc
        </kbd>
      )}
      <span className="mono text-[11px] whitespace-nowrap" style={{ color: "var(--muted)" }}>
        {t(ask ? "lookClick" : "lookHint")}
      </span>
    </div>
  );
}

// A console's cable in my hands (taken from its panel): where to take it, and
// a button to let it go.
export function CableChip() {
  const t = useTr();
  const w = useWorld();
  const cable = useHud((s) => s.cable);
  const held = useHud((s) => !!s.held);
  if (!cable) return null;
  return (
    <div
      className={`pointer-events-auto absolute left-1/2 -translate-x-1/2 ${held ? "bottom-[272px] sm:bottom-[208px]" : "bottom-[224px] sm:bottom-[160px]"} cabinet rounded-full pl-1.5 pr-1.5 py-1 flex items-center gap-2.5 rise max-w-[calc(100vw-24px)]`}
    >
      <span
        className="w-8 h-8 rounded-full grid place-items-center shrink-0"
        style={{ background: "radial-gradient(var(--tile-hi),var(--panel))", border: "1px solid var(--edge)" }}
        aria-hidden
      >
        🔌
      </span>
      <span className="text-sm whitespace-nowrap">{t("cableHeld")}</span>
      <span className="mono text-[11px] truncate" style={{ color: "var(--muted)" }}>
        · {t("cableHint")}
      </span>
      <button type="button" className="deck-btn" style={{ height: 28, fontSize: 12 }} onClick={() => w?.dropCable()}>
        {t("cableLetGo")}
      </button>
    </div>
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
  const armed = useHud((s) => s.throwArm);
  if (!held || !isHeld(held.kind)) return null;
  if (isToyHeld(held.kind)) {
    const kind = held.kind;
    const throws = kind === "ball" || kind === "frisbee";
    const points = kind === "laser";
    const src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgDoc(heldSvg(kind, "", 4), HELD_BOX, 3))}`;
    return (
      <div className="pointer-events-auto absolute left-1/2 -translate-x-1/2 bottom-[224px] sm:bottom-[160px] cabinet rounded-full pl-1.5 pr-1.5 py-1 flex items-center gap-2.5 rise">
        <span
          className="w-8 h-8 rounded-full grid place-items-center shrink-0"
          style={{ background: "radial-gradient(var(--tile-hi),var(--panel))", border: "1px solid var(--edge)" }}
          aria-hidden
        >
          {/* biome-ignore lint/performance/noImgElement: generated SVG data URI */}
          <img src={src} alt="" width={22} height={25} />
        </span>
        <span className="text-sm">{trMaybe(`toy_${kind}`) ?? HELD[kind].label}</span>
        {(throws || points) && (
          <span className="mono text-[11px] hidden sm:inline" style={{ color: "var(--muted)" }}>
            · {armed ? trMaybe(throws ? "throwArmed" : "pointArmed") : trMaybe(throws ? "throwHint" : "pointHint")}
          </span>
        )}
        {(throws || points) && (
          <button
            type="button"
            className={`deck-btn ${armed ? "primary" : ""}`}
            style={{ height: 28, fontSize: 12 }}
            aria-pressed={armed}
            onClick={() => w?.armThrow(!armed)}
          >
            {trMaybe(throws ? "throwArm" : "pointArm")}
          </button>
        )}
        <button type="button" className="deck-btn" style={{ height: 28, fontSize: 12 }} onClick={() => w?.putDown()}>
          {t("heldPutDown")}
        </button>
      </div>
    );
  }
  const st = heldState(held.kind, Date.now() - held.at);
  const level = Math.round(st.level * 4);
  // the same mug the world draws in my hand
  let h = 2166136261;
  for (const ch of me?.name ?? "") h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  const color = MUG_COLORS[Math.floor(((h >>> 0) / 4294967296) * MUG_COLORS.length)];
  const src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgDoc(heldSvg(held.kind, color, level), HELD_BOX, 3))}`;
  const label: Key = held.kind === "cup" ? "heldCup" : held.kind === "soda" ? "heldSoda" : "heldMug";
  return (
    <div className="pointer-events-auto absolute left-1/2 -translate-x-1/2 bottom-[224px] sm:bottom-[160px] cabinet rounded-full pl-1.5 pr-1.5 py-1 flex items-center gap-2.5 rise">
      <span
        className="w-8 h-8 rounded-full grid place-items-center shrink-0"
        style={{ background: "radial-gradient(var(--tile-hi),var(--panel))", border: "1px solid var(--edge)" }}
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
              background: i < level ? "var(--vfd)" : "var(--well-edge)",
              boxShadow: i < level ? "0 0 6px var(--lamp-glow)" : "none",
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

// Notices: plain chips at the top, a dot in their tone (docs/plan/45-the-ui.md).
export function Toasts() {
  const toasts = useHud((s) => s.toasts);
  return (
    <div
      className="pointer-events-none absolute top-24 left-1/2 -translate-x-1/2 space-y-2 flex flex-col items-center"
      aria-live="polite"
    >
      {toasts.map((x) => (
        <div key={x.id} className="toast rise" data-tone={x.tone}>
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
    if (!w) return;
    // placed after each drawn frame (so at the world's frame rate, not the screen's)
    return w.onFrame(() => {
      const el = host.current;
      if (!el || !w.model) return;
      for (const node of Array.from(el.children) as HTMLElement[]) {
        const x = Number(node.dataset.x);
        const y = Number(node.dataset.y);
        // (first person: my own head is the camera — no bubble of me)
        const hide = node.dataset.me === "1" && w.firstPerson();
        const display = hide ? "none" : "";
        if (node.style.display !== display) node.style.display = display;
        if (hide) continue;
        // over their head, on the screen
        const p = w.clientAt(x, y, 116 * PERSON);
        const t = `translate(${Math.round(p.x - 60)}px, ${Math.round(p.y - 90)}px)`;
        if (node.style.transform !== t) node.style.transform = t;
      }
    });
  }, [w]);

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
          data-me={e.key === "me" ? "1" : undefined}
          className="absolute left-0 top-0 rounded-xl overflow-hidden"
          style={{
            width: 120,
            height: 90,
            border: `2px solid ${e.speaking ? "var(--amber)" : "var(--edge-cabinet)"}`,
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

// Connecting, then the world built behind the screen (docs/plan/35-the-loading.md):
// it stays until what's shown is all built, then fades away. Again on every change
// of view. (Over everything: the 3D view's tags stack by depth, up to the thousands.)
const LOAD_CELLS = 24;
export function ConnectionOverlay() {
  const t = useTr();
  const phase = useHud((s) => s.phase);
  const error = useHud((s) => s.error);
  const loading = useHud((s) => s.loading);
  const up = phase !== "ready" || loading.on;
  // (gone: faded out first)
  const [shown, setShown] = useState(up);
  useEffect(() => {
    if (up) return setShown(true);
    const id = setTimeout(() => setShown(false), FADE_MS);
    return () => clearTimeout(id);
  }, [up]);
  if (!up && !shown) return null;
  const building = phase === "ready";
  const msg =
    phase === "loading" || phase === "connecting"
      ? t("connecting")
      : building
        ? t(loading.why === "view" ? "changingView" : "buildingWorld")
        : phase === "reconnecting"
          ? t("reconnecting")
          : phase === "kicked"
            ? t("kicked")
            : phase === "removed"
              ? t("removed")
              : error || t("failed");
  const blocking = phase !== "reconnecting";
  // (connecting and building: nothing behind it seen until it's ready)
  const solid = phase === "loading" || phase === "connecting" || building;
  const lit = building ? Math.round(loading.progress * LOAD_CELLS) : 0;
  return (
    <div
      className={`absolute inset-0 z-[30000] flex items-center justify-center ${solid ? "bg-[color:var(--bg)]" : blocking ? "bg-[color:var(--bg-veil)]" : "pointer-events-none"}`}
      style={{ opacity: up ? 1 : 0, transition: `opacity ${FADE_MS}ms ease`, pointerEvents: up ? undefined : "none" }}
      aria-live="polite"
      aria-busy={solid}
    >
      <div className={`cabinet p-6 text-center max-w-sm ${loading.why === "view" && building ? "" : "rise"}`}>
        <div className="vfd-window px-4 py-3">
          <p className="lcd text-2xl">{msg}</p>
          {solid && (
            // (VFD cells: the lit ones over the dim ones, as far as it's got)
            <div
              className="mt-3 h-2.5 load-cells"
              role="progressbar"
              aria-valuenow={Math.round(loading.progress * 100)}
            >
              <i style={{ clipPath: `inset(0 ${100 - (lit / LOAD_CELLS) * 100}% 0 0)` }} />
            </div>
          )}
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
const FADE_MS = 300;

// The studio from above: rooms labelled, the one you're in outlined, people as
// dots (amber: you can hear them), you in red. Click to walk there; ± zooms the
// world camera. Bottom left (bottom right while building: the catalog is left).
// Only in the parking lot and inside the building, any floor (docs/plan/45-the-ui.md):
// out on the rest of the grounds it's gone.
export function Minimap() {
  const t = useTr();
  const w = useWorld();
  const canvas = useRef<HTMLCanvasElement>(null);
  const people = useHud((s) => s.people);
  const me = useHud((s) => s.me);
  const vortex = useHud((s) => s.vortex);
  const petsAt = useHud((s) => s.myPetsAt);
  const carAt = useHud((s) => s.myCarAt);
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
    // (after dark, nobody out under the sky is seen from afar — docs/plan/44-the-night.md N4)
    const dark = (w?.model?.getDaylight().dark ?? 0) > 0.5;
    // (and the map itself dimmed: its paper shouldn't glare in the pitch dark)
    c.style.filter = dark ? "brightness(.5) saturate(.8)" : "";
    for (const p of people) {
      if (dark && "ac".includes(map.tiles[Math.floor(p.y)]?.[Math.floor(p.x)] || "x")) continue;
      x.fillStyle = p.bot ? "#a39d8c" : p.hearing ? "#ffa630" : "#efe4cc";
      x.beginPath();
      x.arc(p.x * S, p.y * S, 4, 0, Math.PI * 2);
      x.fill();
    }
    // my pets: a small teal dot, ringed (one off exploring is easy to find)
    for (const p of petsAt) {
      x.fillStyle = "#3fd0b4";
      x.strokeStyle = "#1a120c";
      x.lineWidth = 1.5;
      x.beginPath();
      x.arc(p.x * S, p.y * S, 3.5, 0, Math.PI * 2);
      x.fill();
      x.stroke();
    }
    // the car I last drove: an amber car (off the map: at its edge, the way to it)
    if (carAt) {
      const cx = Math.max(6, Math.min(c.width - 6, carAt.x * S));
      const cy = Math.max(5, Math.min(c.height - 5, carAt.y * S));
      x.fillStyle = "#ffb24a";
      x.strokeStyle = "#1a120c";
      x.lineWidth = 1.5;
      x.fillRect(cx - 6, cy - 4, 12, 8);
      x.strokeRect(cx - 6, cy - 4, 12, 8);
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
  }, [w, people, me, vortex, petsAt, carAt, phase, mapVersion]);

  // (+ brings the camera in: its distance shrinks)
  const zoom = (f: number) => w?.tp?.zoomBy(1 / f);
  const shown = building || !me || me.area === "lot" || !w?.grid?.onLand(me.x, me.y);
  if (!shown) return null;
  return (
    <div
      className={`pointer-events-auto absolute bottom-3 cabinet p-2 hidden lg:block w-[208px] ${building ? "right-3" : "left-3"}`}
    >
      <button
        type="button"
        className="block w-full rounded-lg overflow-hidden"
        style={{ background: "var(--well)" }}
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
        <span
          className="mono text-[11px] uppercase tracking-[.08em] leading-none truncate"
          style={{ color: "var(--amber)" }}
        >
          {me?.areaName || t("hallway")}
        </span>
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

// Locked on (docs/plan/56-the-controls.md E): to whom or what, and how to switch.
export function LockChip() {
  const t = useTr();
  const lock = useHud((s) => s.lockOn);
  const pad = useHud((s) => s.padLive);
  if (!lock) return null;
  const cap = { color: "var(--amber)", opacity: 1, height: 20, minWidth: 20, fontSize: 11 };
  return (
    <div className="absolute left-1/2 -translate-x-1/2 top-[112px] cabinet rounded-full pl-2 pr-3.5 py-1 flex items-center gap-2 rise pointer-events-none">
      <kbd className="keycap" style={cap}>
        {pad ? "RB" : "F"}
      </kbd>
      <span className="mono text-[11px] uppercase tracking-[.06em]" style={{ color: "var(--vfd)" }}>
        {t("lockOn")}
      </span>
      <span className="text-sm whitespace-nowrap">{lock.label}</span>
      <span className="mono text-[11px] whitespace-nowrap" style={{ color: "var(--muted)" }}>
        · {t(pad ? "lockNextPad" : "lockNext")}
      </span>
    </div>
  );
}
