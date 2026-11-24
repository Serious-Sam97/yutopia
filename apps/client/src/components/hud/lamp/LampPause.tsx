"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { setToken, yutopia } from "@/lib/api";
import { useTr } from "@/lib/i18n";
import { routeTo } from "@/world/lamp-route";
import { hud, type LampHud, useHud } from "@/world/store";
import { useWorld } from "../ctx";
import { Face } from "../Face";
import { CameraPage, ControlsPage, GraphicsPage, MePage, SoundPage, ViewPage } from "../SettingsPanel";
import { BLIP } from "./LampHud";

// The pause menu (docs/plan/125-the-new-ui.md phase 6, design/ui-life/r2/f-pause.png): GTA V's — the map is the
// screen, drawn from the world's own data (the ways, the buildings, the river, the trees), the tabs and me laid
// over it, a legend of the places, a waypoint where you click (F7a: the radar's gold line follows). Esc, as GTA's;
// the world doesn't stop (other people are in it).

type Tab = LampHud["tab"];
const TABS: { id: Tab; key: string; en: string; pt: string }[] = [
  { id: "map", key: "map", en: "Map", pt: "Mapa" },
  { id: "pack", key: "pack", en: "Pack", pt: "Mochila" },
  { id: "pets", key: "pets", en: "Pets", pt: "Pets" },
  { id: "build", key: "build", en: "Build", pt: "Construir" },
  { id: "voice", key: "voice", en: "Voice & video", pt: "Voz e vídeo" },
  { id: "settings", key: "settings", en: "Settings", pt: "Ajustes" },
  // (admins only: Run the place — docs/plan/48-the-admin.md; the old top bar's face menu had it)
  { id: "admin", key: "admin", en: "Admin", pt: "Admin" },
  { id: "credits", key: "credits", en: "Credits", pt: "Créditos" },
  { id: "leave", key: "leave", en: "Leave", pt: "Sair" },
];
const tabsFor = (admin: boolean) => TABS.filter((x) => x.id !== "admin" || admin);
// the legend's groups, a road atlas's
const GROUPS: { en: string; pt: string; kinds: string[] }[] = [
  { en: "Food & drink", pt: "Comer e beber", kinds: ["diner", "bar"] },
  { en: "Shops", pt: "Lojas", kinds: ["shop", "cornershop", "gas", "garage"] },
  { en: "Town", pt: "Cidade", kinds: ["hotel", "church", "police", "clinic", "library", "school", "office", "fire"] },
  { en: "Out of town", pt: "Fora da cidade", kinds: ["farmhouse", "warehouse"] },
];

export function LampPause() {
  const t = useTr();
  const w = useWorld();
  const tab = useHud((s) => s.lamp.tab);
  const me = useHud((s) => s.me);
  const isAdmin = useHud((s) => s.isAdmin);
  const world = useHud((s) => s.worldName);
  const media = useHud((s) => s.media);
  const pt = t("hallway") === "Corredor";
  const close = useCallback(() => hud.set({ panel: { kind: null } }), []);
  const go = useCallback((id: Tab) => {
    hud.set((s) => ({ lamp: { ...s.lamp, tab: id } }));
    // the tabs that are other screens today open them (they move in, restyled, in phases 5 and 8)
    if (id === "pack") hud.set({ panel: { kind: "case" } });
    else if (id === "pets") hud.set({ panel: { kind: "pets" }, petFocus: null });
    else if (id === "build") hud.set((s) => ({ panel: { kind: null }, build: { ...s.build, on: true, mode: "hand" } }));
    else if (id === "admin") hud.set({ panel: { kind: "admin" } });
  }, []);
  useEffect(() => {
    document.exitPointerLock?.();
    const on = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        close();
        return;
      }
      if (e.code === "KeyQ" || e.code === "KeyE") {
        const tabs = tabsFor(hud.get().isAdmin);
        const i = tabs.findIndex((x) => x.id === hud.get().lamp.tab);
        const n = (i + (e.code === "KeyE" ? 1 : -1) + tabs.length) % tabs.length;
        hud.set((s) => ({ lamp: { ...s.lamp, tab: tabs[n].id } }));
      }
    };
    window.addEventListener("keydown", on, true);
    return () => window.removeEventListener("keydown", on, true);
  }, [close]);
  const now = new Date();
  const day = now.toLocaleDateString(pt ? "pt-BR" : "en-GB", { weekday: "long" }).toUpperCase();
  const time = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
  const btn = (on: boolean, label: string, onClick: () => void, red = false) => (
    <button
      key={label}
      type="button"
      onClick={onClick}
      className="l-row"
      style={{
        height: 30,
        padding: "0 10px",
        fontSize: 12,
        letterSpacing: ".1em",
        textTransform: "uppercase",
        background: on ? "#f2f2f2" : "rgba(0,0,0,.6)",
        color: on ? "#111" : red ? "#ff8a7a" : "#fff",
        cursor: "pointer",
      }}
    >
      {label}
    </button>
  );
  return (
    <div className="lamp pointer-events-auto absolute inset-0" data-lamp-pause={tab} style={{ zIndex: 60 }}>
      {tab === "map" ? <TownMap /> : <div className="absolute inset-0" style={{ background: "rgba(8,9,10,.9)" }} />}
      <div className="lamp-film" />
      <div
        className="absolute"
        style={{
          left: 0,
          top: 0,
          right: 0,
          height: 196,
          background: "linear-gradient(180deg,rgba(6,8,10,.95) 0,rgba(6,8,10,.8) 62%,transparent)",
          pointerEvents: "none",
        }}
      />
      <div
        className="absolute l-glow"
        style={{
          left: 70,
          top: 38,
          font: "italic 900 56px/1 var(--f-sans)",
          letterSpacing: "-.02em",
          textTransform: "uppercase",
        }}
      >
        {world || "Yutopia"}
      </div>
      {/* me: who, when, my voice and camera (the Dock's, now here), my status */}
      <div
        className="absolute l-sh"
        style={{ right: 70, top: 28, display: "flex", gap: 14, alignItems: "center", textAlign: "right" }}
      >
        <div>
          <div style={{ font: "800 21px/1.1 var(--f-sans)" }}>{me?.name}</div>
          <div style={{ font: "600 13.5px/1.6 var(--f-sans)", color: "var(--l-soft)" }}>
            {day} {time}
          </div>
          <div style={{ display: "flex", gap: 4, justifyContent: "flex-end", marginTop: 4 }}>
            {btn(media.mic, media.mic ? t("mic") : t("muted"), () => void w?.toggleMic(), !media.mic)}
            {btn(media.cam, t("cam"), () => void w?.toggleCam())}
            {btn(media.screen, t("screen"), () => void w?.toggleScreen())}
            {(
              [
                ["online", pt ? "Livre" : "Free"],
                ["away", pt ? "Ausente" : "Away"],
                ["dnd", pt ? "Foco" : "Focus"],
              ] as const
            ).map(([st, label]) => btn(me?.status === st, label, () => w?.setStatus(st)))}
          </div>
        </div>
        {me && (
          // (my face: my look — the old top bar's face menu had it)
          <button
            type="button"
            title={t("myLook")}
            aria-label={t("myLook")}
            onClick={() => hud.set({ panel: { kind: "avatar" } })}
            style={{
              all: "unset",
              cursor: "pointer",
              display: "block",
              boxShadow: "0 0 0 2px #fff, 0 4px 10px rgba(0,0,0,.6)",
            }}
          >
            <Face avatar={me.avatar} name={me.name} size={66} />
          </button>
        )}
      </div>
      <div className="absolute l-tabs l-sh" style={{ left: 70, right: 70, top: 122 }}>
        {tabsFor(isAdmin).map((x) => (
          <button type="button" key={x.id} className={x.id === tab ? "on" : ""} onClick={() => go(x.id)}>
            {pt ? x.pt : x.en}
          </button>
        ))}
      </div>
      {tab === "map" && <Legend />}
      {(tab === "settings" || tab === "voice") && <SettingsTab voice={tab === "voice"} pt={pt} />}
      {tab === "credits" && (
        <div className="absolute" style={{ left: 70, top: 206, width: 620 }}>
          <div className="l-head">{pt ? "CRÉDITOS" : "CREDITS"}</div>
          <a className="l-row on" href="/credits" target="_blank" rel="noreferrer" style={{ textDecoration: "none" }}>
            {pt ? "As obras de outros que o jogo usa" : "The works by others the game uses"}
            <span>↗</span>
          </a>
        </div>
      )}
      {tab === "leave" && (
        <div className="absolute" style={{ left: 70, top: 206, width: 620 }}>
          <div className="l-head">{pt ? "SAIR" : "LEAVE"}</div>
          <button
            type="button"
            className="l-row on"
            style={{ width: "100%", cursor: "pointer" }}
            onClick={async () => {
              await yutopia.logout();
              setToken(null);
              location.href = "/login";
            }}
          >
            {t("signOut")}
            <span>⏎</span>
          </button>
          <button type="button" className="l-row" style={{ width: "100%", cursor: "pointer" }} onClick={close}>
            {pt ? "Voltar para a cidade" : "Back to town"}
            <span className="l-key sm">Esc</span>
          </button>
        </div>
      )}
      <div className="absolute l-keys l-sh" style={{ right: 44, bottom: 34 }}>
        {tab === "map" && (
          <>
            <span>
              <span className="l-key">Click</span>
              {pt ? "Marcar destino" : "Set a waypoint"}
            </span>
            <span>
              <span className="l-key">Drag</span>
              {pt ? "Mover" : "Move"}
            </span>
            <span>
              <span className="l-key">Scroll</span>
              Zoom
            </span>
          </>
        )}
        <span>
          <span className="l-key">Q / E</span>
          {pt ? "Abas" : "Tabs"}
        </span>
        <span>
          <span className="l-key">Esc</span>
          {pt ? "Voltar" : "Back to town"}
        </span>
      </div>
    </div>
  );
}

// ── the legend: the town's places, grouped; a click sets the waypoint there ──
function Legend() {
  const w = useWorld();
  const t = useTr();
  const wp = useHud((s) => s.lamp.waypoint);
  const pt = t("hallway") === "Corredor";
  const me = w?.meAt();
  // (the nearest first: by where I am to the nearest 10 m, so it doesn't sort again every step)
  const mx = me ? Math.round(me.x / 10) * 10 : null;
  const my = me ? Math.round(me.y / 10) * 10 : null;
  const places = useMemo(() => {
    const B = w?.G?.BUILDINGS ?? [];
    return GROUPS.map((g) => ({
      g,
      rows: B.filter((b) => g.kinds.includes(b.kind) && b.name)
        .map((b) => ({
          b,
          x: (b.x0 + b.x1) / 2,
          y: (b.z0 + b.z1) / 2,
          d: mx !== null && my !== null ? Math.hypot((b.x0 + b.x1) / 2 - mx, (b.z0 + b.z1) / 2 - my) : 0,
        }))
        .sort((a, b) => a.d - b.d)
        .slice(0, 6),
    })).filter((x) => x.rows.length);
  }, [w, mx, my]);
  const dist = (d: number) => (d < 1000 ? `${Math.round(d / 10) * 10} m` : `${(d / 1000).toFixed(1)} km`);
  return (
    <div
      className="absolute"
      style={{
        right: 70,
        top: 206,
        width: 300,
        boxShadow: "0 8px 20px rgba(0,0,0,.35)",
        maxHeight: 560,
        overflow: "auto",
      }}
    >
      <div className="l-head">
        {pt ? "LEGENDA" : "LEGEND"}
        <span style={{ color: "#9aa", fontWeight: 600, letterSpacing: ".06em" }}>
          {pt ? "PERTO PRIMEIRO" : "NEAREST FIRST"}
        </span>
      </div>
      {places.map(({ g, rows }) => (
        <div key={g.en}>
          <div
            style={{
              background: "rgba(0,0,0,.82)",
              padding: "8px 14px 5px",
              font: "700 10.5px/1 var(--f-sans)",
              letterSpacing: ".18em",
              textTransform: "uppercase",
              color: "var(--l-gold)",
            }}
          >
            {pt ? g.pt : g.en}
          </div>
          {rows.map(({ b, x, y, d }) => {
            const on = wp?.name === b.name;
            const k = BLIP[b.kind];
            return (
              <button
                type="button"
                key={b.key}
                className={`l-row${on ? " on" : ""}`}
                style={{
                  width: "100%",
                  height: 34,
                  fontSize: 13.5,
                  cursor: "pointer",
                  gap: 10,
                  justifyContent: "flex-start",
                }}
                onClick={() => hud.set((s) => ({ lamp: { ...s.lamp, waypoint: on ? null : { x, y, name: b.name } } }))}
              >
                {k && (
                  <svg width="20" height="20" viewBox="-12 -12 24 24" aria-hidden="true">
                    <circle r="10.5" fill={k.col} stroke="#15181b" strokeWidth="1.6" />
                    <g transform="translate(-6.5,-6.5) scale(.54)">
                      <path
                        d={k.d}
                        fill="none"
                        stroke={k.ink}
                        strokeWidth="2.6"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </g>
                  </svg>
                )}
                {b.name}
                <span style={{ marginLeft: "auto", fontSize: 12, opacity: 0.72 }}>
                  {on ? (pt ? "destino · " : "waypoint · ") : ""}
                  {dist(d)}
                </span>
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}

// ── the map itself: drawn from the Grounds, redrawn when it moves ──
type Grounds = typeof import("@yutopia/shared/grounds");
const LAND = "#dde4e9";
/** the zooms the land is drawn at (screen px a metre); a view uses the first at least as sharp as it */
const LEVELS = [0.5, 1, 2, 4, 8];
const TILE = 512; // px a tile
const TILE_PPM_MAX = 8; // (no sharper than 8 px a metre: past it, scaled up)
const TILE_KEEP = 56; // tiles kept (~1 MB each)
const TILE_BUDGET_MS = 9; // tiles made a frame, at most this long
/** the ways with their boxes (made again when they're laid anew: an edit) */
let boxedOf: unknown = null;
let boxed: { way: Grounds["WAYS"][number]; bx0: number; bx1: number; bz0: number; bz1: number }[] = [];
function waysBoxed(G: Grounds) {
  if (boxedOf === G.WAYS[0] && boxed.length === G.WAYS.length) return boxed;
  boxedOf = G.WAYS[0];
  boxed = G.WAYS.map((way) => {
    let bx0 = Infinity;
    let bx1 = -Infinity;
    let bz0 = Infinity;
    let bz1 = -Infinity;
    for (const [x, z] of way.line) {
      bx0 = Math.min(bx0, x);
      bx1 = Math.max(bx1, x);
      bz0 = Math.min(bz0, z);
      bz1 = Math.max(bz1, z);
    }
    const pad = way.w + 2;
    return { way, bx0: bx0 - pad, bx1: bx1 + pad, bz0: bz0 - pad, bz1: bz1 + pad };
  });
  return boxed;
}
/** One tile of the land: `tm` m square from (wx, wz), at `ppm` px a metre — the water, the woods (each tree close
 *  in; far out, their density as shade), the ways, the buildings. */
function makeTile(G: Grounds, ppm: number, wx: number, wz: number, tm: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = TILE;
  c.height = TILE;
  const g = c.getContext("2d");
  if (!g) return c;
  g.fillStyle = LAND;
  g.fillRect(0, 0, TILE, TILE);
  g.scale(ppm, ppm);
  g.translate(-wx, -wz);
  const tx1 = wx + tm;
  const tz1 = wz + tm;
  // the pond, the river: ice at their banks, the water
  g.fillStyle = "#cfdbe3";
  g.beginPath();
  g.ellipse(G.POND.cx, G.POND.cz, G.POND.rx + 3, G.POND.rz + 3, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = "#6c9fc4";
  g.beginPath();
  g.ellipse(G.POND.cx, G.POND.cz, G.POND.rx, G.POND.rz, 0, 0, Math.PI * 2);
  g.fill();
  const RIVER = G.RIVER as unknown as { line: [number, number][]; w: number };
  if (RIVER?.line) {
    g.lineJoin = "round";
    g.lineCap = "round";
    for (const [col, extra] of [
      ["#cfdbe3", 6],
      ["#5f92b8", 0],
    ] as const) {
      g.strokeStyle = col;
      g.lineWidth = RIVER.w + extra;
      g.beginPath();
      for (const [i, [x, z]] of RIVER.line.entries()) i ? g.lineTo(x, z) : g.moveTo(x, z);
      g.stroke();
    }
  }
  if (ppm >= 2) {
    // the trees, as crowns from above (the snow on them close in)
    const CH = G.CHUNK;
    const detail = ppm >= 2.8;
    for (let cx = Math.floor((wx - 4) / CH); cx <= Math.floor((tx1 + 4) / CH); cx++)
      for (let cz = Math.floor((wz - 4) / CH); cz <= Math.floor((tz1 + 4) / CH); cz++)
        for (const tr of G.treesIn(cx, cz)) {
          const r = detail ? 2.2 * tr.s : 1.8;
          g.fillStyle = "rgba(40,55,70,.25)";
          g.beginPath();
          g.arc(tr.x + r * 0.6, tr.z + r * 0.8, r, 0, Math.PI * 2);
          g.fill();
          g.fillStyle = tr.kind === "pine" ? "#33533e" : tr.kind === "birch" ? "#7c8a5a" : "#6b5a48";
          g.beginPath();
          g.arc(tr.x, tr.z, r, 0, Math.PI * 2);
          g.fill();
          if (detail) {
            g.fillStyle = "rgba(244,249,252,.6)";
            g.beginPath();
            g.ellipse(tr.x - r * 0.32, tr.z - r * 0.3, r * 0.32, r * 0.2, -0.4, 0, Math.PI * 2);
            g.fill();
          }
        }
  } else {
    // far out: the woods as shade — the generator's density sampled on a small grid into a tiny picture, scaled up
    // smooth (soft edges, few samples: a tile made in a few ms)
    const n = 64;
    const step = tm / n;
    const small = document.createElement("canvas");
    small.width = n;
    small.height = n;
    const sg = small.getContext("2d");
    if (sg) {
      const img = sg.createImageData(n, n);
      for (let j = 0; j < n; j++)
        for (let i = 0; i < n; i++) {
          const d = G.treeDensity(wx + (i + 0.5) * step, wz + (j + 0.5) * step);
          const o = (j * n + i) * 4;
          img.data[o] = 51;
          img.data[o + 1] = 83;
          img.data[o + 2] = 62;
          img.data[o + 3] = d < 0.06 ? 0 : Math.round((0.12 + Math.min(1, d) * 0.5) * 255);
        }
      sg.putImageData(img, 0, 0);
      g.imageSmoothingEnabled = true;
      g.imageSmoothingQuality = "high";
      g.drawImage(small, wx, wz, tm, tm);
    }
  }
  // the ways: a dark edge, white on it; a yellow line down Main Street's kind
  g.lineCap = "round";
  g.lineJoin = "round";
  const ways = waysBoxed(G).filter((b) => b.bx1 >= wx && b.bx0 <= tx1 && b.bz1 >= wz && b.bz0 <= tz1);
  for (const pass of [0, 1, 2]) {
    for (const { way } of ways) {
      if (pass === 2 && way.kind !== "street") continue;
      g.strokeStyle = pass === 0 ? "#5d666f" : pass === 1 ? "#f7f7f4" : "#e3be3f";
      g.lineWidth = pass === 0 ? way.w + 1.4 : pass === 1 ? way.w : 0.35;
      g.beginPath();
      for (const [i, [x, z]] of way.line.entries()) i ? g.lineTo(x, z) : g.moveTo(x, z);
      g.stroke();
    }
  }
  // the buildings: a drop to the south-east, a roof (pitched for houses and barns)
  for (const b of G.BUILDINGS) {
    if (b.x1 < wx - 2 || b.x0 > tx1 || b.z1 < wz - 2 || b.z0 > tz1) continue;
    const bw = b.x1 - b.x0;
    const bh = b.z1 - b.z0;
    g.fillStyle = "rgba(50,60,70,.35)";
    g.fillRect(b.x0 + 1.2, b.z0 + 1.4, bw, bh);
    const pitched = b.kind === "house" || b.kind === "barn" || b.kind === "farmhouse" || b.kind === "church";
    if (pitched) {
      const lit = b.kind === "barn" ? "#b0574a" : "#9b6a55";
      const dark = b.kind === "barn" ? "#7e3a30" : "#6e4436";
      const along = bw >= bh;
      g.fillStyle = lit;
      g.fillRect(b.x0, b.z0, along ? bw : bw / 2, along ? bh / 2 : bh);
      g.fillStyle = dark;
      if (along) g.fillRect(b.x0, b.z0 + bh / 2, bw, bh / 2);
      else g.fillRect(b.x0 + bw / 2, b.z0, bw / 2, bh);
      g.fillStyle = "rgba(250,252,253,.55)";
      g.fillRect(b.x0, b.z0, along ? bw : bw / 2, along ? bh / 2 : bh);
    } else {
      g.fillStyle = "#c3c9cf";
      g.fillRect(b.x0, b.z0, bw, bh);
      g.fillStyle = "rgba(250,252,253,.7)";
      g.fillRect(b.x0 + 0.3, b.z0 + 0.3, bw - 0.6, Math.min(2, bh / 4));
    }
    g.strokeStyle = "#7d868f";
    g.lineWidth = 0.35;
    g.strokeRect(b.x0, b.z0, bw, bh);
  }
  return c;
}
function TownMap() {
  const w = useWorld();
  const ref = useRef<HTMLCanvasElement>(null);
  const wp = useHud((s) => s.lamp.waypoint);
  const view = useRef<{ cx: number; cy: number; s: number } | null>(null);
  const [hover, setHover] = useState<{ x: number; y: number; name: string; kind: string; d: number } | null>(null);
  // (the land — water, woods, ways, buildings — drawn once into tiles at a few zooms, then only moved and scaled as you
  // drag and scroll; what's on top — the route, the blips, the names, the pin, me — each frame, one a frame at most.
  // Every tree drawn on every move, zoomed out, was thousands of the generator's chunks at once: it stalled, then died)
  const tiles = useRef(new Map<string, HTMLCanvasElement>());
  const tilesOf = useRef<unknown>(null);
  const routeMemo = useRef<{ key: string; pts: [number, number][] } | null>(null);
  const raf = useRef(0);
  const paintRef = useRef<() => void>(() => {});
  const draw = useCallback(() => {
    if (raf.current) return;
    raf.current = requestAnimationFrame(() => {
      raf.current = 0;
      paintRef.current();
    });
  }, []);
  const paint = useCallback(() => {
    const c = ref.current;
    const G = w?.G;
    if (!c || !G || !w) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = c.clientWidth;
    const H = c.clientHeight;
    if (c.width !== Math.round(W * dpr) || c.height !== Math.round(H * dpr)) {
      c.width = Math.round(W * dpr);
      c.height = Math.round(H * dpr);
    }
    const me = w.meAt();
    view.current ??= { cx: me.x, cy: me.y, s: 3 };
    const v = view.current;
    const g = c.getContext("2d");
    if (!g) return;
    // (God mode's edits lay the ways anew — WAYS refilled in place: the tiles drawn again)
    if (tilesOf.current !== G.WAYS[0]) {
      tiles.current.clear();
      tilesOf.current = G.WAYS[0];
    }
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = LAND;
    g.fillRect(0, 0, W, H);
    const toS = (x: number, y: number) => [(x - v.cx) * v.s + W / 2, (y - v.cy) * v.s + H / 2] as const;
    const x0 = v.cx - W / 2 / v.s;
    const x1 = v.cx + W / 2 / v.s;
    const z0 = v.cy - H / 2 / v.s;
    const z1 = v.cy + H / 2 / v.s;
    // the tiles: this zoom's (the finest at least as sharp as the screen), made a few a frame; one not made yet — a
    // coarser one in its place meanwhile
    const ppmOf = (lvl: number) => Math.min(TILE_PPM_MAX, lvl * dpr);
    const lvl = LEVELS.find((l) => l >= v.s) ?? LEVELS[LEVELS.length - 1];
    const ppm = ppmOf(lvl);
    const tm = TILE / ppm;
    const t0 = performance.now();
    const want: { key: string; tx: number; tz: number }[] = [];
    for (let tx = Math.floor(x0 / tm); tx <= Math.floor(x1 / tm); tx++)
      for (let tz = Math.floor(z0 / tm); tz <= Math.floor(z1 / tm); tz++)
        want.push({ key: `${ppm}|${tx}|${tz}`, tx, tz });
    let missing = false;
    const fell = new Set<string>();
    for (const t of want) {
      if (tiles.current.has(t.key)) continue;
      if (performance.now() - t0 < TILE_BUDGET_MS) {
        tiles.current.set(t.key, makeTile(G, ppm, t.tx * tm, t.tz * tm, tm));
        continue;
      }
      missing = true;
      // (meanwhile: the coarser tile over it, if there is one)
      for (const l of [...LEVELS].reverse()) {
        const p2 = ppmOf(l);
        if (p2 >= ppm) continue;
        const tm2 = TILE / p2;
        const k2 = `${p2}|${Math.floor((t.tx * tm) / tm2)}|${Math.floor((t.tz * tm) / tm2)}`;
        const t2 = tiles.current.get(k2);
        if (!t2) continue;
        if (!fell.has(k2)) {
          fell.add(k2);
          const [sx, sy] = toS(Math.floor((t.tx * tm) / tm2) * tm2, Math.floor((t.tz * tm) / tm2) * tm2);
          g.drawImage(t2, sx, sy, tm2 * v.s + 0.6, tm2 * v.s + 0.6);
        }
        break;
      }
    }
    for (const t of want) {
      const tile = tiles.current.get(t.key);
      if (!tile) continue;
      // (used now: last to go)
      tiles.current.delete(t.key);
      tiles.current.set(t.key, tile);
      const [sx, sy] = toS(t.tx * tm, t.tz * tm);
      g.drawImage(tile, sx, sy, tm * v.s + 0.6, tm * v.s + 0.6);
    }
    while (tiles.current.size > TILE_KEEP) {
      const first = tiles.current.keys().next().value;
      if (first === undefined) break;
      tiles.current.delete(first);
    }
    // the waypoint's line along the ways (F7a): searched again only when I've moved or it has
    if (wp) {
      const key = `${wp.x}|${wp.y}|${Math.round(me.x / 4)}|${Math.round(me.y / 4)}`;
      if (routeMemo.current?.key !== key) routeMemo.current = { key, pts: routeTo(G, me, wp) };
      const pts = routeMemo.current.pts.map(([x, z]) => toS(x, z));
      g.strokeStyle = "rgba(21,24,27,.55)";
      g.lineWidth = 10;
      g.lineCap = "round";
      g.lineJoin = "round";
      g.beginPath();
      for (const [i, [x, y]] of pts.entries()) i ? g.lineTo(x, y) : g.moveTo(x, y);
      g.stroke();
      g.strokeStyle = "#f3d27a";
      g.lineWidth = 6;
      g.stroke();
    }
    // the blips (smaller far out; their shadow a dark disc — a blur each was dear)
    const br = v.s < 1 ? 10 : 14;
    for (const b of G.BUILDINGS) {
      const k = BLIP[b.kind];
      if (!k) continue;
      const [x, y] = toS((b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2);
      if (x < -20 || y < -20 || x > W + 20 || y > H + 20) continue;
      g.save();
      g.translate(x, y);
      g.beginPath();
      g.arc(1, 2, br + 1, 0, Math.PI * 2);
      g.fillStyle = "rgba(0,0,0,.35)";
      g.fill();
      g.beginPath();
      g.arc(0, 0, br, 0, Math.PI * 2);
      g.fillStyle = k.col;
      g.fill();
      g.lineWidth = 2.2;
      g.strokeStyle = "#15181b";
      g.stroke();
      g.scale(br / 19.4, br / 19.4);
      g.translate(-12, -12);
      g.strokeStyle = k.ink;
      g.lineWidth = 2.4;
      g.lineCap = "round";
      g.lineJoin = "round";
      g.stroke(new Path2D(k.d));
      g.restore();
    }
    // the ways' names, along their longest straight stretch, when close enough to read
    if (v.s >= 1.6) {
      g.font = "800 12px Inter Tight, sans-serif";
      g.textAlign = "center";
      g.textBaseline = "middle";
      const seen = new Set<string>();
      for (const { way, bx0, bx1, bz0, bz1 } of waysBoxed(G)) {
        if (bx1 < x0 || bx0 > x1 || bz1 < z0 || bz0 > z1) continue;
        if (!way.name || seen.has(way.name) || way.line.length < 6) continue;
        seen.add(way.name);
        const mid = Math.floor(way.line.length / 2);
        const [ax, az] = way.line[Math.max(0, mid - 2)];
        const [bx, bz] = way.line[Math.min(way.line.length - 1, mid + 2)];
        const [sx, sy] = toS((ax + bx) / 2, (az + bz) / 2);
        if (sx < 0 || sy < 0 || sx > W || sy > H) continue;
        let a = Math.atan2(bz - az, bx - ax);
        if (a > Math.PI / 2) a -= Math.PI;
        if (a < -Math.PI / 2) a += Math.PI;
        g.save();
        g.translate(sx, sy);
        g.rotate(a);
        g.lineWidth = 3.5;
        g.strokeStyle = "#f7f7f4";
        g.fillStyle = "#4a535c";
        const name = way.name.toUpperCase().split("").join(String.fromCharCode(8202));
        g.strokeText(name, 0, 0);
        g.fillText(name, 0, 0);
        g.restore();
      }
    }
    if (wp) {
      const [x, y] = toS(wp.x, wp.y);
      g.save();
      g.translate(x, y - 22);
      g.fillStyle = "#f3d27a";
      g.strokeStyle = "#15181b";
      g.lineWidth = 2.4;
      g.beginPath();
      g.moveTo(0, 22);
      g.lineTo(-12, 4);
      g.arc(0, -4, 14, Math.PI * 0.82, Math.PI * 0.18);
      g.closePath();
      g.fill();
      g.stroke();
      g.fillStyle = "#15181b";
      g.beginPath();
      g.arc(0, -4, 5, 0, Math.PI * 2);
      g.fill();
      g.restore();
    }
    {
      const [x, y] = toS(me.x, me.y);
      const yaw = w.tp?.yaw ?? 0;
      g.save();
      g.translate(x, y);
      g.rotate(yaw + Math.PI / 2);
      g.beginPath();
      g.moveTo(0, -17);
      g.lineTo(13, 13);
      g.lineTo(0, 7);
      g.lineTo(-13, 13);
      g.closePath();
      g.fillStyle = "#fff";
      g.strokeStyle = "#15181b";
      g.lineWidth = 2.6;
      g.shadowColor = "rgba(0,0,0,.6)";
      g.shadowBlur = 4;
      g.fill();
      g.shadowBlur = 0;
      g.stroke();
      g.restore();
    }
    // (tiles still to make: the next frame goes on with them)
    if (missing) draw();
  }, [w, wp, draw]);
  paintRef.current = paint;
  // biome-ignore lint/correctness/useExhaustiveDependencies: drawn again when what it paints changes (the waypoint)
  useEffect(() => {
    draw();
    const on = () => draw();
    window.addEventListener("resize", on);
    return () => {
      window.removeEventListener("resize", on);
      if (raf.current) cancelAnimationFrame(raf.current);
      raf.current = 0;
    };
  }, [draw, paint]);
  // drag to move, scroll to zoom, click to set the waypoint; hover names the building
  const drag = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const worldAt = (cx: number, cy: number) => {
    const c = ref.current;
    const v = view.current;
    if (!c || !v) return null;
    const r = c.getBoundingClientRect();
    return { x: (cx - r.left - r.width / 2) / v.s + v.cx, y: (cy - r.top - r.height / 2) / v.s + v.cy };
  };
  const buildingAt = (x: number, y: number) =>
    w?.G?.BUILDINGS.find((b) => x >= b.x0 - 1 && x <= b.x1 + 1 && y >= b.z0 - 1 && y <= b.z1 + 1) ?? null;
  const me = w?.meAt();
  return (
    <>
      <canvas
        ref={ref}
        className="absolute inset-0"
        style={{ width: "100%", height: "100%", cursor: drag.current?.moved ? "grabbing" : "crosshair" }}
        onPointerDown={(e) => {
          drag.current = { x: e.clientX, y: e.clientY, moved: false };
          (e.target as HTMLElement).setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          const v = view.current;
          if (d && v) {
            const dx = e.clientX - d.x;
            const dy = e.clientY - d.y;
            if (Math.abs(dx) + Math.abs(dy) > 3) d.moved = true;
            if (d.moved) {
              v.cx -= dx / v.s;
              v.cy -= dy / v.s;
              d.x = e.clientX;
              d.y = e.clientY;
              draw();
              return;
            }
          }
          const p = worldAt(e.clientX, e.clientY);
          const b = p && buildingAt(p.x, p.y);
          // (a new state only when it's another building, or the card has to follow the mouse)
          if (!b?.name && !hover) return;
          setHover(
            b?.name && me
              ? {
                  x: e.clientX,
                  y: e.clientY,
                  name: b.name,
                  kind: b.kind,
                  d: Math.hypot((b.x0 + b.x1) / 2 - me.x, (b.z0 + b.z1) / 2 - me.y),
                }
              : null,
          );
        }}
        onPointerUp={(e) => {
          const d = drag.current;
          drag.current = null;
          if (d?.moved) return;
          const p = worldAt(e.clientX, e.clientY);
          if (!p) return;
          // (a click on the pin itself: unmarked)
          const v = view.current;
          if (wp && v) {
            const r = ref.current?.getBoundingClientRect();
            const px = r ? (wp.x - v.cx) * v.s + r.width / 2 + r.left : 0;
            const py = r ? (wp.y - v.cy) * v.s + r.height / 2 + r.top - 26 : 0;
            if (Math.hypot(e.clientX - px, e.clientY - py) < 22) {
              hud.set((s) => ({ lamp: { ...s.lamp, waypoint: null } }));
              return;
            }
          }
          const b = buildingAt(p.x, p.y);
          hud.set((s) => ({
            lamp: {
              ...s.lamp,
              waypoint: b
                ? { x: (b.x0 + b.x1) / 2, y: (b.z0 + b.z1) / 2, name: b.name || b.kind }
                : { x: p.x, y: p.y, name: "" },
            },
          }));
        }}
        onWheel={(e) => {
          const v = view.current;
          if (!v) return;
          v.s = Math.max(0.5, Math.min(7, v.s * (e.deltaY > 0 ? 0.88 : 1.14)));
          draw();
        }}
      />
      {hover && (
        <div
          className="absolute"
          style={{
            left: hover.x + 26,
            top: hover.y + 18,
            width: 250,
            background: "rgba(8,9,10,.9)",
            borderTop: "3px solid var(--l-gold)",
            padding: "10px 12px",
            pointerEvents: "none",
            boxShadow: "0 10px 22px rgba(0,0,0,.45)",
          }}
        >
          <div style={{ font: "400 26px/1 var(--f-num)", letterSpacing: ".04em" }}>{hover.name}</div>
          <div className="l-cap" style={{ marginTop: 6, color: "var(--l-gold)" }}>
            {Math.round(hover.d / 10) * 10} m
          </div>
        </div>
      )}
    </>
  );
}

// ── Settings and Voice & video (phase 8): the game's own settings pages, GTA's list round them; the frame's cost ──
const SET_PAGES = [
  { id: "graphics", en: "Picture", pt: "Imagem" },
  { id: "view", en: "Camera & view", pt: "Câmera e visão" },
  { id: "controls", en: "Controls", pt: "Controles" },
  { id: "me", en: "Me", pt: "Eu" },
] as const;
function SettingsTab({ voice, pt }: { voice: boolean; pt: boolean }) {
  const [page, setPage] = useState<(typeof SET_PAGES)[number]["id"]>("graphics");
  const fps = useHud((s) => s.fps);
  return (
    <>
      {!voice && (
        <div className="absolute" style={{ left: 70, top: 206, width: 280 }}>
          {SET_PAGES.map((p) => (
            <button
              type="button"
              key={p.id}
              className={`l-row${page === p.id ? " on" : ""}`}
              style={{ width: "100%", height: 42, cursor: "pointer", marginBottom: 2 }}
              onClick={() => setPage(p.id)}
            >
              {pt ? p.pt : p.en}
              <span style={{ opacity: 0.5 }}>›</span>
            </button>
          ))}
        </div>
      )}
      <div
        className="absolute"
        style={{
          left: voice ? 70 : 366,
          top: 206,
          width: voice ? 900 : 640,
          bottom: 90,
          overflowY: "auto",
          background: "rgba(0,0,0,.55)",
          padding: "14px 18px",
        }}
      >
        <div className="l-head" style={{ margin: "-14px -18px 14px", background: "rgba(0,0,0,.9)" }}>
          {voice
            ? pt
              ? "VOZ E VÍDEO"
              : "VOICE & VIDEO"
            : (pt ? SET_PAGES.find((p) => p.id === page)?.pt : SET_PAGES.find((p) => p.id === page)?.en)?.toUpperCase()}
        </div>
        <div className="space-y-3">
          {voice ? (
            <>
              <SoundPage />
              <CameraPage />
            </>
          ) : page === "graphics" ? (
            <GraphicsPage />
          ) : page === "view" ? (
            <ViewPage />
          ) : page === "controls" ? (
            <ControlsPage />
          ) : (
            <MePage />
          )}
        </div>
      </div>
      {!voice && page === "graphics" && (
        <div
          className="absolute"
          style={{ right: 70, top: 206, width: 330, background: "rgba(0,0,0,.8)", padding: "14px 16px" }}
        >
          <div style={{ font: "800 13px/1 var(--f-sans)", letterSpacing: ".14em" }}>
            {pt ? "ESTE COMPUTADOR" : "THIS MACHINE"}
          </div>
          <div
            style={{ display: "flex", justifyContent: "space-between", font: "400 26px/1 var(--f-num)", marginTop: 14 }}
          >
            <span>{pt ? "Quadros" : "Frames"}</span>
            <span style={{ color: "var(--l-gold)" }}>{fps ? `${fps} fps` : "—"}</span>
          </div>
          <div style={{ height: 10, marginTop: 8, background: "rgba(255,255,255,.12)" }}>
            <i
              style={{
                display: "block",
                height: "100%",
                width: `${Math.min(100, (fps / 60) * 100)}%`,
                background: fps >= 55 ? "#5fbf4a" : fps >= 35 ? "#e9c046" : "#e0553c",
              }}
            />
          </div>
          <div style={{ font: "500 13px/1.5 var(--f-sans)", color: "var(--l-dim)", marginTop: 10 }}>
            {pt
              ? "Medido agora, enquanto você muda as coisas. Sombras e distância são as que mais custam."
              : "Measured now, as you change things. Shadows and distance cost the most."}
          </div>
        </div>
      )}
    </>
  );
}
