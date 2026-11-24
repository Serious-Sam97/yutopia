"use client";

import { useEffect, useRef, useState } from "react";
import { asset } from "@/lib/asset";
import { trMaybe, useTr } from "@/lib/i18n";
import { routeTo } from "@/world/lamp-route";
import { STATIONS } from "@/world/sound";
import { hud, useHud } from "@/world/store";
import { useWorld } from "../ctx";
import { LampPrompt } from "./LampPrompt";
import { LampWheel } from "./LampWheel";

// The new UI's play HUD (docs/plan/125-the-new-ui.md phase 2, look F — design/ui-life/r2/f-play.png): GTA's places
// — the help box top-left, the tilted map bottom-left with the body's four bars under it, the clock and what's in
// hand top-right, the place's name bottom-right, subtitles low in the middle, the feed over the map — in the town's
// dark and the lamp's gold, a film over it all. The desktop's (F12c); build mode keeps its own screen.

export function LampHud() {
  const building = useHud((s) => s.build.on);
  const inMatch = useHud((s) => !!s.strike?.me);
  const god = useHud((s) => s.god.on && !s.god.walking);
  const off = building || god;
  return (
    <div className="lamp pointer-events-none absolute inset-0" data-lamp="">
      <div className="lamp-film" />
      {!off && !inMatch && (
        <>
          <LampPrompt />
          <Radar />
          <TopRight />
          <Place />
          <Subtitle />
          <Feed />
          <RadioName />
          <BigMessage />
          <LampWheel />
        </>
      )}
    </div>
  );
}

// ── the map: the world from above, the way you face up (GTA), tilted ──
const R_W = 310;
const R_H = 250;
const PX_M = 2.4; // px a metre
export const BLIP: Record<string, { col: string; ink: string; d: string }> = {
  diner: {
    col: "#f2c230",
    ink: "#15181b",
    d: "M3 4v5M3 9c0 1 .8 1.5 1.5 1.5M21 4v16M12 6a7 7 0 1 0 0 14 7 7 0 0 0 0-14",
  },
  bar: { col: "#d9534f", ink: "#fff", d: "M6 3h12l-6 9zM12 12v8M8 21h8" },
  shop: { col: "#4a90d9", ink: "#fff", d: "M3 4h2l2.5 11h11L21 7H6.5M9 19h.01M17 19h.01" },
  cornershop: { col: "#4a90d9", ink: "#fff", d: "M3 4h2l2.5 11h11L21 7H6.5M9 19h.01M17 19h.01" },
  gas: { col: "#4caf50", ink: "#fff", d: "M4 16V12l2-5h12l2 5v4zM4 12h16M8 16.5h.01M16 16.5h.01" },
  garage: { col: "#4caf50", ink: "#fff", d: "M4 16V12l2-5h12l2 5v4zM4 12h16M8 16.5h.01M16 16.5h.01" },
  hotel: { col: "#4a90d9", ink: "#fff", d: "M3 19V6M3 15h18v4M3 11h6a3 3 0 0 1 3 3v1M12 11h6a3 3 0 0 1 3 3v1" },
  church: { col: "#e8e8e8", ink: "#15181b", d: "M12 2v5M10 4h4M6 21V12l6-5 6 5v9zM10 21v-4h4v4" },
  police: { col: "#2f6ea8", ink: "#fff", d: "M12 3l7 3v6c0 4-3 7-7 9-4-2-7-5-7-9V6z" },
  clinic: { col: "#e8e8e8", ink: "#c0392b", d: "M12 6v12M6 12h12" },
  library: { col: "#9b6dd6", ink: "#fff", d: "M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2zM4 19V5" },
  farmhouse: { col: "#4caf50", ink: "#fff", d: "M3 11l9-7 9 7M5 10v10h14V10" },
  warehouse: { col: "#d9534f", ink: "#fff", d: "M4 15c2-1 14-1 16 0M7 15l-1 3M17 15l1 3" },
};

function Radar() {
  const w = useWorld();
  const t = useTr();
  const ref = useRef<HTMLCanvasElement>(null);
  const vitals = useHud((s) => s.lamp.vitals);
  const mic = useHud((s) => s.media.mic);
  const ready = useHud((s) => s.media.ready);
  useEffect(() => {
    const c = ref.current;
    if (!c || !w) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = R_W * dpr;
    c.height = R_H * dpr;
    const g = c.getContext("2d");
    if (!g) return;
    // each way's box, once: only those near me are drawn
    let boxesOf: unknown = null;
    let boxes: { w: import("@yutopia/shared/grounds").Way; x0: number; z0: number; x1: number; z1: number }[] | null =
      null;
    let raf = 0;
    let last = 0;
    // (F7a) the waypoint's route along the ways, searched again every second and a half
    let route: { key: string; at: number; pts: [number, number][] } | null = null;
    const paint = (now: number) => {
      raf = requestAnimationFrame(paint);
      if (now - last < 66) return; // ~15 a second is plenty for a map
      last = now;
      const G = w.G;
      const me = w.meAt();
      const yaw = w.tp?.yaw ?? 0;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, R_W, R_H);
      g.fillStyle = "rgba(10,12,14,.78)";
      g.fillRect(0, 0, R_W, R_H);
      if (!G) return;
      // (made again after an edit: WAYS laid anew in place — lamp-route.ts)
      if (boxes && (boxesOf !== G.WAYS[0] || boxes.length !== G.WAYS.length)) boxes = null;
      boxesOf = G.WAYS[0];
      boxes ??= G.WAYS.map((way) => {
        let x0 = Infinity;
        let z0 = Infinity;
        let x1 = -Infinity;
        let z1 = -Infinity;
        for (const [x, z] of way.line) {
          x0 = Math.min(x0, x);
          z0 = Math.min(z0, z);
          x1 = Math.max(x1, x);
          z1 = Math.max(z1, z);
        }
        return { w: way, x0, z0, x1, z1 };
      });
      const reach = 160;
      const cx = R_W / 2;
      const cy = R_H * 0.64;
      g.save();
      g.translate(cx, cy);
      // the way I face, up
      g.rotate(-Math.PI / 2 - yaw);
      g.scale(PX_M, PX_M);
      g.translate(-me.x, -me.y);
      // the river
      const RIVER = G.RIVER as unknown as { line: [number, number][]; w: number };
      if (RIVER?.line) {
        g.lineJoin = "round";
        g.lineCap = "round";
        g.strokeStyle = "rgba(90,140,180,.55)";
        g.lineWidth = RIVER.w;
        g.beginPath();
        for (const [i, [x, z]] of RIVER.line.entries()) i ? g.lineTo(x, z) : g.moveTo(x, z);
        g.stroke();
      }
      // the ways: a dark edge, then the road
      const near = boxes.filter(
        (b) => b.x1 > me.x - reach && b.x0 < me.x + reach && b.z1 > me.y - reach && b.z0 < me.y + reach,
      );
      g.lineCap = "round";
      g.lineJoin = "round";
      for (const pass of [0, 1]) {
        for (const b of near) {
          const way = b.w;
          g.strokeStyle = pass ? "rgba(214,218,222,.62)" : "rgba(0,0,0,.55)";
          g.lineWidth = Math.max(2.2, way.w) + (pass ? 0 : 1.6);
          g.beginPath();
          for (const [i, [x, z]] of way.line.entries()) i ? g.lineTo(x, z) : g.moveTo(x, z);
          g.stroke();
        }
      }
      // the buildings
      for (const b of G.BUILDINGS) {
        if (b.x1 < me.x - reach || b.x0 > me.x + reach || b.z1 < me.y - reach || b.z0 > me.y + reach) continue;
        g.fillStyle = "rgba(239,233,220,.16)";
        g.strokeStyle = "rgba(239,233,220,.32)";
        g.lineWidth = 0.5;
        g.fillRect(b.x0, b.z0, b.x1 - b.x0, b.z1 - b.z0);
        g.strokeRect(b.x0, b.z0, b.x1 - b.x0, b.z1 - b.z0);
      }
      // (F7a) the waypoint: a gold line along the ways from me to it; there (a building's middle: in it, or at its door),
      // it's unmarked
      let wp = hud.get().lamp.waypoint;
      if (wp && Math.hypot(wp.x - me.x, wp.y - me.y) < ARRIVED_M) {
        hud.set((s) => ({ lamp: { ...s.lamp, waypoint: null } }));
        wp = null;
      }
      if (wp) {
        const key = `${wp.x}|${wp.y}`;
        if (!route || route.key !== key || now - route.at > 1500) route = { key, at: now, pts: routeTo(G, me, wp) };
        g.strokeStyle = "rgba(21,24,27,.6)";
        g.lineWidth = 7 / PX_M;
        g.lineJoin = "round";
        g.beginPath();
        g.moveTo(me.x, me.y);
        for (const [x, z] of route.pts.slice(1)) g.lineTo(x, z);
        g.stroke();
        g.strokeStyle = "#f3d27a";
        g.lineWidth = 4 / PX_M;
        g.stroke();
      }
      // where each blip falls on the map, upright
      const blips: { x: number; y: number; k: string }[] = [];
      const m = g.getTransform();
      for (const b of G.BUILDINGS) {
        if (!BLIP[b.kind]) continue;
        const bx = (b.x0 + b.x1) / 2;
        const bz = (b.z0 + b.z1) / 2;
        if (Math.hypot(bx - me.x, bz - me.y) > reach) continue;
        const p = new DOMPoint(bx, bz).matrixTransform(m);
        blips.push({ x: p.x / dpr, y: p.y / dpr, k: b.kind });
      }
      const wpAt = wp ? new DOMPoint(wp.x, wp.y).matrixTransform(m) : null;
      g.restore();
      // the waypoint's pin (held at the map's edge when it's off it), and its name and distance at the top
      if (wp && wpAt) {
        const px = Math.max(12, Math.min(R_W - 12, wpAt.x / dpr));
        const py = Math.max(36, Math.min(R_H - 12, wpAt.y / dpr));
        g.save();
        g.translate(px, py);
        g.fillStyle = "#f3d27a";
        g.strokeStyle = "#15181b";
        g.lineWidth = 2;
        g.beginPath();
        g.arc(0, -8, 8, 0, Math.PI * 2);
        g.fill();
        g.stroke();
        g.restore();
        const d = Math.hypot(wp.x - me.x, wp.y - me.y);
        g.font = "400 15px var(--font-bebas), Impact, sans-serif";
        g.fillStyle = "#f3d27a";
        g.textAlign = "left";
        g.fillText(
          `${(wp.name || "WAYPOINT").toUpperCase()} · ${d < 1000 ? `${Math.round(d / 10) * 10} M` : `${(d / 1000).toFixed(1)} KM`}`,
          10,
          64,
        );
      }
      for (const b of blips) {
        const k = BLIP[b.k];
        g.save();
        g.translate(b.x, b.y);
        g.beginPath();
        g.arc(0, 0, 10, 0, Math.PI * 2);
        g.fillStyle = k.col;
        g.fill();
        g.lineWidth = 1.8;
        g.strokeStyle = "#15181b";
        g.stroke();
        g.scale(0.55, 0.55);
        g.translate(-12, -12);
        g.strokeStyle = k.ink;
        g.lineWidth = 2.6;
        g.lineCap = "round";
        g.lineJoin = "round";
        g.stroke(new Path2D(k.d));
        g.restore();
      }
      // me: the arrow, the way I'm facing as the camera sees it
      g.save();
      g.translate(cx, cy);
      g.beginPath();
      g.moveTo(0, -12);
      g.lineTo(9, 9);
      g.lineTo(0, 4.5);
      g.lineTo(-9, 9);
      g.closePath();
      g.shadowColor = "rgba(243,215,140,.9)";
      g.shadowBlur = 8;
      g.fillStyle = "#f3d27a";
      g.fill();
      g.restore();
    };
    raf = requestAnimationFrame(paint);
    return () => cancelAnimationFrame(raf);
  }, [w]);
  const bars: [string, number, string][] = [
    [trMaybe("lamp_health") ?? "health", vitals.hp, "var(--l-health)"],
    [trMaybe("lamp_stamina") ?? "stamina", vitals.st, "var(--l-stamina)"],
    [trMaybe("lamp_warmth") ?? "warmth", vitals.wm, "var(--l-warmth)"],
    [trMaybe("lamp_battery") ?? "battery", vitals.bat, "var(--l-battery)"],
  ];
  return (
    <>
      {ready && !mic && (
        <div
          className="absolute l-sh"
          style={{ left: 36, bottom: 282, background: "rgba(0,0,0,.7)", padding: "5px 8px", borderRadius: 3 }}
        >
          <span className="l-cap" style={{ color: "var(--l-red)" }}>
            {t("muted")}
          </span>
          <span className="l-key sm" style={{ marginLeft: 8 }}>
            M
          </span>
        </div>
      )}
      <div className="absolute" style={{ left: 36, bottom: 36, width: R_W }} data-lamp-radar="">
        <div
          style={{
            width: R_W,
            height: 196,
            perspective: 520,
            overflow: "hidden",
            borderRadius: 6,
            boxShadow: "0 0 0 2px rgba(0,0,0,.6),0 0 0 3px rgba(243,215,140,.25)",
          }}
        >
          <canvas
            ref={ref}
            style={{
              width: R_W,
              height: R_H,
              marginTop: -36,
              transform: "rotateX(30deg)",
              transformOrigin: "50% 70%",
              display: "block",
            }}
          />
        </div>
        <div className="l-bars">
          {bars.map(([k, v, c]) => (
            <div key={k} className={v < 25 ? "low" : ""}>
              <i>
                <b style={{ width: `${Math.max(0, Math.min(100, v))}%`, background: c, boxShadow: `0 0 8px ${c}` }} />
              </i>
              <span>{k}</span>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

/** how near the waypoint counts as there (m): its building's middle — in it, or at its door */
const ARRIVED_M = 14;

// ── top-right: the clock, what's in hand (its white picture, its rounds), the torch's cells ──
function TopRight() {
  const lamp = useHud((s) => s.lamp);
  const skating = useHud((s) => s.skating);
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 15_000);
    return () => clearInterval(id);
  }, []);
  const { gun, hand, vitals } = lamp;
  const cells = (pct: number) => {
    const n = Math.ceil((Math.max(0, pct) / 100) * 4);
    return (
      <div className="l-cells" style={{ marginTop: 8 }}>
        {[0, 1, 2, 3].map((j) => (
          <b key={j} className={j < n ? "" : "o"} />
        ))}
      </div>
    );
  };
  const pic = (id: string, w: number) => (
    // a white picture made from the real item's (public/life/items: rendered from its model)
    // biome-ignore lint/performance/noImgElement: a static picture, no optimizer for it
    <img
      src={asset(`/life/items/${id}.webp`)}
      alt=""
      style={{
        width: w,
        height: w / 3,
        objectFit: "contain",
        filter: "brightness(0) invert(1) drop-shadow(0 2px 3px rgba(0,0,0,.8))",
      }}
    />
  );
  const torch = hand.id === "torch";
  return (
    <div className="absolute l-glow" style={{ right: 44, top: 30, textAlign: "right" }} data-lamp-topright="">
      <div className="l-clock">
        {now ? now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false }) : "--:--"}
      </div>
      {!skating && gun && (
        <>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 14, marginTop: 10 }}>
            <div className="l-ammo">
              {gun.loaded} <small>| {gun.spare}</small>
            </div>
            {pic(gun.id, gun.id === "revolver" ? 120 : 170)}
          </div>
          {gun.mag <= 6 && (
            <div style={{ display: "flex", gap: 5, justifyContent: "flex-end", marginTop: 6 }}>
              {Array.from({ length: gun.mag }, (_, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: shells are only a count
                <span key={i} className={`l-shell${i < gun.loaded ? "" : " o"}`} />
              ))}
            </div>
          )}
        </>
      )}
      {!skating && !gun && hand.id && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 14, marginTop: 10 }}>
          <div className="l-ammo">
            {torch ? (
              <>
                {vitals.bat}
                <small>%</small>
              </>
            ) : hand.burn ? (
              <>
                {hand.burn}
                <small>s</small>
              </>
            ) : hand.n > 1 ? (
              `×${hand.n}`
            ) : (
              ""
            )}
          </div>
          {pic(hand.id, 140)}
        </div>
      )}
      {!skating && (torch || (gun && hand.lit)) && (
        <div style={{ display: "flex", gap: 10, alignItems: "center", justifyContent: "flex-end", marginTop: 6 }}>
          {gun && <span className="l-cap">torch</span>}
          {cells(vitals.bat)}
        </div>
      )}
    </div>
  );
}

// ── bottom-right: where I am — big as I come in, then quiet ──
function Place() {
  const t = useTr();
  const name = useHud((s) => s.me?.areaName ?? "");
  const world = useHud((s) => s.worldName);
  const [big, setBig] = useState(true);
  // biome-ignore lint/correctness/useExhaustiveDependencies: big again on each new place
  useEffect(() => {
    setBig(true);
    const id = setTimeout(() => setBig(false), 6000);
    return () => clearTimeout(id);
  }, [name]);
  const shown = name || t("hallway");
  return (
    <div className="absolute l-glow" style={{ right: 44, bottom: 40, textAlign: "right" }} data-lamp-place="">
      {big && <div className="l-rule" style={{ width: 380, marginLeft: "auto", marginBottom: 12 }} />}
      <div
        className="l-place"
        style={{
          fontSize: big ? 54 : 22,
          transition: "font-size .5s ease",
        }}
      >
        {shown}
      </div>
      <div className="l-cap" style={{ marginTop: 10, color: "#e6dfcf" }}>
        {world || "…"}
      </div>
    </div>
  );
}

// ── GTA's radio: the station's name at the top as it comes on or changes (a car's, a room's) ──
function RadioName() {
  const radio = useHud((s) => s.radio);
  const name =
    radio.source === "yt" ? radio.title || "YouTube" : (STATIONS[radio.station % STATIONS.length]?.name ?? "");
  const key = radio.playing ? `${radio.id}|${radio.station}|${radio.title}` : "";
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (!key) return setShown(false);
    setShown(true);
    const id = setTimeout(() => setShown(false), 5000);
    return () => clearTimeout(id);
  }, [key]);
  if (!shown || !name) return null;
  return (
    <div
      className="absolute l-sh"
      style={{ left: "50%", top: 34, transform: "translateX(-50%)", textAlign: "center" }}
      data-lamp-radio=""
    >
      <div style={{ font: "400 34px/1 var(--f-num)", letterSpacing: ".06em" }}>{name}</div>
      {radio.source === "yt" ? null : radio.title ? (
        <div style={{ font: "600 14px/1.4 var(--f-sans)", color: "#e6dfcf" }}>{radio.title}</div>
      ) : null}
    </div>
  );
}

// ── GTA's big message: a name across the middle, a line under it ──
function BigMessage() {
  const big = useHud((s) => s.lamp.big);
  if (!big) return null;
  return (
    <div className="absolute" style={{ left: 0, right: 0, top: "33%", textAlign: "center" }} data-lamp-big="">
      <div
        style={{
          display: "inline-block",
          padding: "16px 140px 18px",
          background: "linear-gradient(90deg,transparent,rgba(0,0,0,.62) 18%,rgba(0,0,0,.62) 82%,transparent)",
        }}
      >
        <div
          style={{
            font: "400 74px/1 var(--f-name)",
            textTransform: "uppercase",
            color: "var(--l-gold)",
            textShadow: "0 3px 0 rgba(0,0,0,.5),0 0 30px rgba(243,215,140,.35)",
          }}
        >
          {big.title}
        </div>
        <div
          style={{
            font: "700 15px/1 var(--f-sans)",
            letterSpacing: ".24em",
            marginTop: 10,
            textTransform: "uppercase",
          }}
        >
          {big.sub}
        </div>
      </div>
    </div>
  );
}

// ── subtitles (F8a): what an NPC said ──
function Subtitle() {
  const sub = useHud((s) => s.lamp.sub);
  if (!sub) return null;
  return (
    <div
      className="absolute l-sub l-sh"
      style={{ left: "50%", bottom: 132, transform: "translateX(-50%)", width: 820 }}
      data-lamp-sub=""
    >
      <span>
        {sub.who && <b>{sub.who}: </b>}
        {sub.text}
      </span>
    </div>
  );
}

// ── the feed over the map (F8a): the game's own news ──
function Feed() {
  const feed = useHud((s) => s.lamp.feed);
  const toasts = useHud((s) => s.toasts);
  const lines = [
    ...toasts.map((x) => ({
      id: `t${x.id}`,
      text: x.text,
      tone: x.tone === "warn" ? "warn" : "info",
      item: undefined,
    })),
    ...feed.map((f) => ({ id: `f${f.id}`, text: f.text, tone: f.tone, item: f.item })),
  ].slice(-4);
  if (!lines.length) return null;
  return (
    <div
      className="absolute"
      style={{ left: 36, bottom: 318, width: 310, display: "flex", flexDirection: "column", gap: 6 }}
      data-lamp-feed=""
    >
      {lines.map((l) => (
        <div key={l.id} className={`l-feed ${l.tone === "gold" ? "gold" : l.tone === "warn" ? "warn" : ""}`}>
          {l.item && (
            // biome-ignore lint/performance/noImgElement: a static picture
            <img
              src={asset(`/life/items/${l.item}.webp`)}
              alt=""
              style={{ width: 40, height: 26, objectFit: "contain", filter: "drop-shadow(0 2px 2px rgba(0,0,0,.7))" }}
            />
          )}
          <span>{l.text}</span>
        </div>
      ))}
    </div>
  );
}
