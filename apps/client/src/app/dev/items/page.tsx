"use client";

import { entry, footprint } from "@yutopia/shared";
import { notFound } from "next/navigation";
import { useEffect, useState } from "react";
import { piece, WALL_H } from "@/world/art/furniture";
import { rotateBoxes } from "@/world/art/iso";
import { type ItemRef, itemArt, itemShadow } from "@/world/art/items";
import { type ItemArt, pts, Sketch, sh } from "@/world/art/items/kit";
import { shade } from "@/world/art/palette";

// Dev-only review sheet for the illustrated items (image-first gate, V1+):
// every item × facing × state on wood / carpet / tile, day and night, next to
// the old box art.
type Floor = "wood" | "carpet" | "tile";
const FLOORS: Floor[] = ["wood", "carpet", "tile", "wood"];
const P = Sketch.proj;
const src = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
const hx = (n: number) => `#${n.toString(16).padStart(6, "0")}`;
// the engine's night multiply at level 0.85 (engine.drawDarkness)
const NIGHT = (() => {
  const c = Math.round(255 * (1 - 0.85 * 0.36));
  return `rgb(${Math.round(c * 0.92)},${Math.round(c * 0.88)},${c})`;
})();

interface Row {
  label: string;
  kind: string;
  props?: Record<string, unknown>;
  id?: string;
  rots?: number[];
  cells?: { rot: number; props?: Record<string, unknown>; id?: string }[]; // explicit cells instead of facings
}
const ROWS: Row[] = [
  { label: "Desk", kind: "desk", id: "d1" },
  { label: "Desk · other seeds", kind: "desk", id: "d7", rots: [0, 2] },
  { label: "Chair", kind: "chair", id: "c1" },
  { label: "Chair · other seeds", kind: "chair", id: "c2", rots: [0, 2] },
  { label: "Sofa", kind: "sofa", id: "s1" },
  { label: "Floor lamp · on", kind: "lamp", id: "l1" },
  { label: "Floor lamp · off", kind: "lamp", id: "l1", props: { on: false }, rots: [0] },
  { label: "Board wall", kind: "board_wall", id: "b1", rots: [0] },
  {
    label: "Plants · monstera, snake plant, fern, rubber tree, cactus",
    kind: "plant",
    cells: [0, 1, 2, 3, 4].map((v) => ({ rot: 0, id: `p${v}`, props: { variant: v } })),
  },
  {
    label: "Chair · occupied (seat sinks, back leans)",
    kind: "chair",
    id: "c1",
    props: { occupied: true },
    rots: [0, 2],
  },
  { label: "Armchair", kind: "armchair", id: "a1" },
  { label: "Armchair · other seed, occupied", kind: "armchair", id: "a4", props: { occupied: true }, rots: [0, 2] },
  { label: "Bench", kind: "bench", id: "b1" },
  { label: "Meeting table", kind: "meeting_table", id: "m1", rots: [0, 1] },
  { label: "Slot-car track (autorama)", kind: "slot_track", id: "st1", rots: [0, 1] },
  {
    label: "Pool table · green / blue / wine",
    kind: "pool_table",
    cells: [0, 1, 2].map((v) => ({ rot: v === 1 ? 1 : 0, props: { variant: v }, id: `pt${v}` })),
  },
  {
    label: "Ping-pong table · blue / green / grey",
    kind: "pingpong_table",
    cells: [0, 1, 2].map((v) => ({ rot: v === 1 ? 1 : 0, props: { variant: v }, id: `pp${v}` })),
  },
  { label: "Computer · putty (VortexOS)", kind: "computer", id: "pc1", props: { variant: 0, seed: 0.8 } },
  { label: "Computer · graphite", kind: "computer", id: "pc2", props: { variant: 1, seed: 0.2 } },
  { label: "CRT TV · woodgrain", kind: "crt_tv", id: "tv1", props: { variant: 0 } },
  { label: "CRT TV · silver", kind: "crt_tv", id: "tv2", props: { variant: 1 }, rots: [0, 1] },
  { label: "Wall TV · black", kind: "tv_wall", id: "tw1", props: { variant: 0 }, rots: [0] },
  { label: "Wall TV · cream", kind: "tv_wall", id: "tw2", props: { variant: 1 }, rots: [0] },
  { label: "Big HD TV", kind: "tv_hd", id: "hd1", rots: [0] },
  { label: "Projector screen", kind: "projector_screen", id: "ps1", rots: [0] },
  { label: "Giant TV", kind: "tv_giant", id: "gt1", rots: [0] },
  { label: "Cinema screen · red / blue velvet", kind: "cinema_screen", id: "cs1", props: { variant: 0 }, rots: [0] },
  { label: "Cinema screen · blue velvet", kind: "cinema_screen", id: "cs2", props: { variant: 1 }, rots: [0] },
  {
    label: "Film projector · off / on",
    kind: "projector",
    id: "pj1",
    cells: [{ rot: 0 }, { rot: 0, props: { on: true } }, { rot: 1 }, { rot: 2, props: { on: true } }],
  },
  { label: "Console TV · walnut", kind: "tv_console", id: "tc1", props: { variant: 0 } },
  { label: "Console TV · teak", kind: "tv_console", id: "tc2", props: { variant: 1 }, rots: [0, 1] },
  {
    label: "Portable TV · silver / cream",
    kind: "tv_portable",
    id: "tp1",
    cells: [{ rot: 0, props: { variant: 0 } }, { rot: 0, props: { variant: 1 } }, { rot: 1 }, { rot: 3 }],
  },
  {
    label: "Woodgrain console · cartridge in",
    kind: "console_2600",
    id: "c1",
    props: { cart: 1, cartColor: "#c4402b" },
  },
  { label: "8-bit console · front-loader", kind: "console_nes", id: "c2", props: { variant: 0, cart: 1 } },
  {
    label: "8-bit console · top-loader, cartridge in",
    kind: "console_nes",
    id: "c3",
    props: { variant: 1, cart: 1, cartColor: "#4f86c6" },
  },
  { label: "16-bit console · cartridge in", kind: "console_snes", id: "c4", props: { cart: 1, cartColor: "#f0a12c" } },
  {
    label: "16-bit console (black) · cartridge in",
    kind: "console_md",
    id: "c5",
    props: { cart: 1, cartColor: "#7fa34a" },
  },
  { label: "Handheld TV dock · cartridge in", kind: "console_gb", id: "c6", props: { cart: 1, cartColor: "#7a5c8a" } },
  { label: "Cartridge shelf", kind: "cart_shelf", id: "cs1" },
  // the disc console (docs/plan/23-disc-console.md P1)
  { label: "32-bit disc console · grey", kind: "console_ps1", id: "p1" },
  {
    label: "32-bit disc console · grey: lid open with a disc, memory card in, on",
    kind: "console_ps1",
    id: "p2",
    props: { lid: "open", cart: 1, cartColor: "#c4402b", card: 1, on: true },
  },
  { label: "32-bit disc console · slim white", kind: "console_ps1_slim", id: "p3", props: { variant: 0 } },
  {
    label: "32-bit disc console · slim white: lid open with a disc, memory card in",
    kind: "console_ps1_slim",
    id: "p4",
    props: { variant: 0, lid: "open", cart: 1, cartColor: "#4f86c6", card: 1 },
    rots: [0, 1],
  },
  {
    label: "32-bit disc console · slim white with its screen up, on",
    kind: "console_ps1_slim",
    id: "p5",
    props: { variant: 1, on: true },
  },
  { label: "Disc rack · black", kind: "disc_rack", id: "dr1", props: { variant: 0 } },
  { label: "Disc rack · walnut", kind: "disc_rack", id: "dr2", props: { variant: 1 }, rots: [0, 1] },
  { label: "Coffee table", kind: "coffee_table", id: "ct1" },
  { label: "Reception", kind: "reception", id: "r1" },
  {
    label: "Radio",
    kind: "radio",
    id: "ra",
    cells: [{ rot: 0, props: { on: true } }, { rot: 1, props: { on: true } }, { rot: 2 }, { rot: 3 }],
  },
  { label: "Tape shelf", kind: "tape_shelf", id: "t1" },
  { label: "Mic stand", kind: "mic_stand", id: "mi" },
  { label: "Mixing desk", kind: "mixing_desk", id: "mx" },
  { label: "Speaker cabinet", kind: "speaker_cab", id: "sp" },
  { label: "Arcade · attract screen", kind: "arcade", id: "ar" },
  { label: "Server rack", kind: "server_rack", id: "sr" },
  { label: "Terminal", kind: "crt_terminal", id: "te" },
  { label: "Coffee machine", kind: "coffee_machine", id: "cm" },
  { label: "Big screen", kind: "screen_wall", id: "sw", rots: [0] },
  { label: "Whiteboard", kind: "whiteboard", id: "wb", rots: [0] },
  { label: "Notice board", kind: "notice_board", id: "nb", rots: [0] },
  { label: "Acoustic panel", kind: "acoustic_panel", id: "ap", rots: [0] },
  {
    label: "Posters · tape, vu, yondra",
    kind: "poster",
    cells: ["tape", "vu", "yondra"].map((art) => ({ rot: 0, props: { art } })),
  },
  {
    label: "Door · closed, locked, open, passing (along x) · closed, open (along y)",
    kind: "door",
    cells: [
      { rot: 0, props: { state: "closed" } },
      { rot: 0, props: { state: "locked" } },
      { rot: 0, props: { state: "open" } },
      { rot: 0, props: { state: "locked", passing: true } },
      { rot: 3, props: { state: "closed" } },
      { rot: 3, props: { state: "open" } },
    ],
  },
  ...(["door_double", "door_studio", "door_barn", "door_saloon"] as const).map((kind) => ({
    label: `${kind} · closed, open, locked, open the other way (along x) · closed, open (along y)`,
    kind,
    cells: [
      { rot: 0, props: { state: "closed" } },
      { rot: 0, props: { state: "open" } },
      { rot: 0, props: { state: "locked" } },
      { rot: 0, props: { state: "open", swing: -1 } },
      { rot: 3, props: { state: "closed" } },
      { rot: 3, props: { state: "open" } },
    ],
  })),
  { label: "Archway", kind: "archway", id: "ar", rots: [0, 3] },
  { label: "Window (in a wall)", kind: "window", id: "wn", rots: [0, 3] },
  { label: "Wide window (in a wall)", kind: "window_wide", id: "ww", rots: [0, 3] },
  { label: "Tall window (in a wall)", kind: "window_tall", id: "wt", rots: [0, 3] },
  ...(
    ["window_round", "window_arched", "window_high", "window_stained", "window_blinds", "window_studio"] as const
  ).map((kind) => ({ label: `${kind} (in a wall)`, kind, id: kind, rots: [0, 3] })),
  { label: "Rug", kind: "rug", id: "rg", rots: [0, 1] },
  { label: "Standup ring", kind: "standup_mat", id: "su", rots: [0] },
];

function floorSvg(floor: Floor, x0: number, y0: number, x1: number, y1: number): string {
  let g = "";
  for (let y = y0; y < y1; y++)
    for (let x = x0; x < x1; x++) {
      const d = pts([P(x, y, 0), P(x + 1, y, 0), P(x + 1, y + 1, 0), P(x, y + 1, 0)]);
      const n = ((x * 7 + y * 13) % 5) / 5;
      if (floor === "wood") {
        g += `<polygon points="${d}" fill="${sh("#9a6a40", 0.86 + n * 0.12)}"/>`;
        g += `<path d="M${pts([P(x, y + 0.5, 0), P(x + 1, y + 0.5, 0)])}" stroke="#5e3b22" stroke-opacity=".35"/>`;
        g += `<path d="M${pts([P(x, y, 0), P(x + 1, y, 0)])}" stroke="#5e3b22" stroke-opacity=".45"/>`;
      } else if (floor === "carpet") g += `<polygon points="${d}" fill="${sh("#6b6a3a", 1 + n * 0.08)}"/>`;
      else
        g += `<polygon points="${d}" fill="${(x + y) % 2 ? "#e6dcc4" : "#cfc3a5"}" stroke="#b8ab8c" stroke-opacity=".5"/>`;
    }
  return g;
}

// The back wall a wall item hangs on.
function wallSvg(w: number): string {
  const a = P(0, 0, 0);
  const b = P(w + 1, 0, 0);
  const at = P(0, 0, WALL_H);
  const bt = P(w + 1, 0, WALL_H);
  const ad = P(0, 0, 30);
  const bd = P(w + 1, 0, 30);
  return `<polygon points="${pts([a, b, bd, ad])}" fill="#5b3a26"/><polygon points="${pts([ad, bd, bt, at])}" fill="#efe4cc"/><path d="M${pts([ad, bd])}" stroke="#3e2718" stroke-width="3"/>`;
}

// A full-tile wall block (like scene.ts wallParts), for context around doors.
function wallTile(x: number, y: number): string {
  const box = (z0: number, z1: number, top: string, left: string, right: string) =>
    `<polygon points="${pts([P(x, y + 1, z0), P(x + 1, y + 1, z0), P(x + 1, y + 1, z1), P(x, y + 1, z1)])}" fill="${left}"/><polygon points="${pts([P(x + 1, y + 1, z0), P(x + 1, y, z0), P(x + 1, y, z1), P(x + 1, y + 1, z1)])}" fill="${right}"/><polygon points="${pts([P(x, y, z1), P(x + 1, y, z1), P(x + 1, y + 1, z1), P(x, y + 1, z1)])}" fill="${top}"/>`;
  return (
    box(0, 30, "#5b3a26", "#5b3a26", "#4d311f") +
    box(30, 84, "#efe4cc", "#efe4cc", "#d2c8b4") +
    box(84, 87, "#5b3a26", "#3e2718", "#3e2718")
  );
}

// the old box composition, flat-shaded (for comparison only; no organic extras)
function boxArt(kind: string, rot: number): string {
  const e = entry(kind);
  let g = "";
  for (const b of rotateBoxes(piece(kind, {}, "x").boxes, e.w, e.h, rot)) {
    const [x0, x1, y0, y1, z0, z1] = [b.x, b.x + b.w, b.y, b.y + b.d, b.z, b.z + b.h];
    const top = b.top ?? b.color;
    const left = b.faces?.s ?? shade(b.color, 0.8);
    const right = b.faces?.e ?? shade(b.color, 0.64);
    if (b.h > 0) {
      g += `<polygon points="${pts([P(x0, y1, z0), P(x1, y1, z0), P(x1, y1, z1), P(x0, y1, z1)])}" fill="${hx(left)}"/>`;
      g += `<polygon points="${pts([P(x1, y1, z0), P(x1, y0, z0), P(x1, y0, z1), P(x1, y1, z1)])}" fill="${hx(right)}"/>`;
    }
    g += `<polygon points="${pts([P(x0, y0, z1), P(x1, y0, z1), P(x1, y1, z1), P(x0, y1, z1)])}" fill="${hx(top)}"/>`;
  }
  return g;
}

// fake VU content on the board's glass, where the engine mounts the live one
function vuSvg(): string {
  let g = "";
  const bars = [0.8, 0.45, 0.6, 0.25, 0.9, 0.5];
  bars.forEach((v, i) => {
    const u0 = 0.2 + i * 0.44;
    for (let k = 0; k < 9; k++) {
      const z = 30 + k * 3.9;
      const on = k / 9 < v;
      const col = k >= 8 ? "#b5562f" : k >= 7 ? "#ffa630" : "#ffb35c";
      g += `<polygon points="${pts([P(u0, 0.06, z + 3), P(u0 + 0.34, 0.06, z + 3), P(u0 + 0.34, 0.06, z), P(u0, 0.06, z)])}" fill="${on ? col : "#3a2c1f"}"/>`;
    }
  });
  return g;
}

interface CellProps {
  row: Row;
  rot: number;
  floor: Floor | null;
  night: boolean;
  z: number;
  before?: boolean;
}

function Cell({ row, rot, floor, night, z, before }: CellProps) {
  const e = entry(row.kind);
  const fp = footprint(row.kind, rot);
  const W = fp.w;
  const H = fp.h;
  const ox = H * 32 + 36;
  const oy = 112;
  const cw = (W + H) * 32 + 72;
  const ch = (W + H) * 16 + 140;
  const ref: ItemRef = { kind: row.kind, id: row.id ?? "x", rot, props: row.props };
  const art = before ? null : itemArt(ref, null, "all", 2);
  const shadow = before ? null : itemShadow(ref);
  const vb = `${-ox} ${-oy} ${cw} ${ch}`;
  const ground =
    floor &&
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" width="${cw * z}" height="${ch * z}">${floorSvg(floor, -1, e.wall ? 0 : -1, W + 1, H + 1)}${e.wall ? wallSvg(W) : ""}${row.kind === "door" ? (rot % 2 ? wallTile(0, -1) : wallTile(-1, 0)) : ""}${before ? boxArt(row.kind, rot) : ""}</svg>`;
  const layer = (a: ItemArt | null, svg: string | null, style: React.CSSProperties = {}) =>
    a &&
    svg && (
      // biome-ignore lint/performance/noImgElement: dev sheet
      <img
        alt=""
        src={src(svg)}
        style={{
          position: "absolute",
          left: (ox + a.x) * z,
          top: (oy + a.y) * z,
          width: a.w * z,
          height: a.h * z,
          ...style,
        }}
      />
    );
  return (
    <div style={{ position: "relative", width: cw * z, height: ch * z, borderRadius: 6, overflow: "hidden" }}>
      {/* biome-ignore lint/performance/noImgElement: dev sheet */}
      {ground && <img alt="" src={src(ground)} style={{ position: "absolute", inset: 0 }} />}
      {layer(shadow, shadow?.svg ?? null)}
      {layer(art, art?.svg ?? null)}
      {row.kind === "door" && (
        // biome-ignore lint/performance/noImgElement: dev sheet
        <img
          alt=""
          src={src(
            `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" width="${cw * z}" height="${ch * z}">${rot % 2 ? wallTile(0, 1) : wallTile(1, 0)}</svg>`,
          )}
          style={{ position: "absolute", inset: 0 }}
        />
      )}
      {row.kind === "board_wall" && !before && (
        // biome-ignore lint/performance/noImgElement: dev sheet
        <img
          alt=""
          src={src(
            `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" width="${cw * z}" height="${ch * z}">${vuSvg()}</svg>`,
          )}
          style={{ position: "absolute", inset: 0 }}
        />
      )}
      {night && <div style={{ position: "absolute", inset: 0, background: NIGHT, mixBlendMode: "multiply" }} />}
      {night && layer(art, art?.emit ?? null, { mixBlendMode: "plus-lighter", opacity: 0.6 })}
      <span
        style={{ position: "absolute", left: 6, top: 4, font: "11px ui-monospace", color: "#e8d9b8", opacity: 0.7 }}
      >
        {before ? "before" : `rot ${rot} · ${floor}${night ? " · night" : ""}`}
      </span>
    </div>
  );
}

export default function Items() {
  // review tool only: not served in production builds
  if (process.env.NODE_ENV === "production") notFound();
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  if (!ready) return null;
  const q = new URLSearchParams(location.search);
  const z = Number(q.get("z") ?? 1);
  const only = q.get("only");
  const rows = only ? ROWS.filter((r) => only.split(",").includes(r.kind)) : ROWS;
  return (
    <main style={{ background: "#2a1c13", minHeight: "100%", overflow: "auto", padding: 16, height: "100vh" }}>
      <h1 className="lcd text-2xl mb-2">YUTOPIA · ITEM SHEET</h1>
      {rows.map((row) => {
        const cells = row.cells
          ? row.cells.map((c) => ({ rot: c.rot, row: { ...row, id: c.id ?? row.id, props: c.props } }))
          : (row.rots ?? [0, 1, 2, 3]).map((rot) => ({ rot, row }));
        return (
          <section
            key={`${row.label}`}
            style={{ background: "#3b281b", borderRadius: 8, padding: 6, marginBottom: 8 }}
            data-row={row.kind}
          >
            <div style={{ font: "13px ui-monospace", color: "#ffb35c", margin: "2px 4px 6px" }}>{row.label}</div>
            <div style={{ display: "flex", gap: 4, alignItems: "flex-end" }}>
              {!row.label.includes("·") && row.kind !== "plant" && (
                <Cell row={row} rot={0} floor="wood" night={false} z={z} before />
              )}
              {cells.map((c, i) => (
                <Cell key={`d${c.row.id}${c.rot}`} row={c.row} rot={c.rot} floor={FLOORS[i % 4]} night={false} z={z} />
              ))}
            </div>
            <div style={{ display: "flex", gap: 4, alignItems: "flex-end", marginTop: 4 }}>
              {!row.label.includes("·") && row.kind !== "plant" && (
                <div style={{ width: (footprint(row.kind, 0).w + footprint(row.kind, 0).h) * 32 * z + 72 * z }} />
              )}
              {cells.map((c, i) => (
                <Cell key={`n${c.row.id}${c.rot}`} row={c.row} rot={c.rot} floor={FLOORS[i % 4]} night z={z} />
              ))}
            </div>
          </section>
        );
      })}
    </main>
  );
}
