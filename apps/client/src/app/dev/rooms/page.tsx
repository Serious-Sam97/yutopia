"use client";

import type { MapDef, WorldObjectDef } from "@yutopia/shared";
import { notFound } from "next/navigation";
import { useEffect, useState } from "react";
import { FloorBake } from "@/world/art/floors";

// Dev-only review sheet for floors (V3): each material in a small test room —
// back walls (wall-base AO + corner), a door sill, a desk and a plant (AO under
// furniture), and a strip of the next material (transition) — old flat floor vs
// the baked one, day and night.
const MATS: [string, string][] = [
  [".", "Wood planks"],
  [",", "Carpet tiles"],
  ["_", "Checker tile"],
  [":", "Felt (booths)"],
  ["~", "Stage boards"],
  ["x", "Metal grate"],
];
const NEXT: Record<string, string> = { ".": ",", ",": ".", _: ".", ":": "_", "~": ".", x: "." };
const OLD: Record<string, string> = {
  ".": "#8d5f38",
  ",": "#6b6a3a",
  _: "#e6dcc4",
  ":": "#7a3b2e",
  "~": "#2f2620",
  x: "#4a4740",
};
const W = 7;
const H = 6;
const HW = 32;
const HH = 16;
const NIGHT = "rgb(163,156,177)";

function testRoom(ch: string): { map: MapDef; objects: WorldObjectDef[] } {
  const nb = NEXT[ch];
  const tiles = [`###${ch}###`];
  for (let y = 1; y < H; y++) tiles.push(`#${ch.repeat(4)}${nb.repeat(2)}`);
  const map: MapDef = {
    key: "t",
    name: "t",
    width: W,
    height: H,
    tiles,
    spawn: { x: 2, y: 2 },
    areas: [],
    objects: [],
  };
  const objects: WorldObjectDef[] = [
    { id: "door", kind: "door", x: 3, y: 0, rot: 0, props: { state: "closed" } },
    { id: "desk", kind: "desk", x: 1, y: 3, rot: 0 },
    { id: "plant", kind: "plant", x: 4, y: 1, rot: 0 },
  ];
  if (ch === "~") map.areas.push({ key: "s", name: "Stage", kind: "stage", x: 1, y: 1, w: 5, h: 3 });
  return { map, objects };
}

const P = (x: number, y: number, z = 0) => [(x - y) * HW, (x + y) * HH - z] as const;
const pts = (p: (readonly [number, number])[]) => p.map(([x, y]) => `${x},${y}`).join(" ");

// back walls (row 0 and column 0) + footprints of the furniture, flat-shaded, for context
function overlay(): string {
  let g = "";
  const wall = (x: number, y: number) => {
    const box = (z0: number, z1: number, top: string, left: string, right: string) =>
      `<polygon points="${pts([P(x, y + 1, z0), P(x + 1, y + 1, z0), P(x + 1, y + 1, z1), P(x, y + 1, z1)])}" fill="${left}"/><polygon points="${pts([P(x + 1, y + 1, z0), P(x + 1, y, z0), P(x + 1, y, z1), P(x + 1, y + 1, z1)])}" fill="${right}"/><polygon points="${pts([P(x, y, z1), P(x + 1, y, z1), P(x + 1, y + 1, z1), P(x, y + 1, z1)])}" fill="${top}"/>`;
    g += box(0, 30, "#5b3a26", "#5b3a26", "#4d311f") + box(30, 50, "#efe4cc", "#efe4cc", "#d2c8b4");
  };
  for (let x = 0; x < W; x++) if (x !== 3) wall(x, 0);
  for (let y = 1; y < H; y++) wall(0, y);
  // where the furniture stands (outline only, so the AO shows)
  for (const [x, y, w, h] of [
    [1, 3, 2, 1],
    [4, 1, 1, 1],
  ])
    g += `<polygon points="${pts([P(x, y, 0), P(x + w, y, 0), P(x + w, y + h, 0), P(x, y + h, 0)])}" fill="none" stroke="#ffb35c" stroke-dasharray="3 3" stroke-width="1"/>`;
  return g;
}

function oldFloor(ch: string): string {
  const { map } = testRoom(ch);
  let g = "";
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const c = map.tiles[y][x];
      if (c === "#") continue;
      g += `<polygon points="${pts([P(x, y), P(x + 1, y), P(x + 1, y + 1), P(x, y + 1)])}" fill="${OLD[c]}" stroke="rgba(0,0,0,.25)" stroke-width=".6"/>`;
    }
  return g;
}

export default function Rooms() {
  if (process.env.NODE_ENV === "production") notFound();
  const [baked, setBaked] = useState<Record<string, string>>({});
  useEffect(() => {
    const out: Record<string, string> = {};
    for (const [ch] of MATS) {
      const { map, objects } = testRoom(ch);
      const bake = new FloorBake(map, objects, 2, 4096);
      out[ch] = bake.draw(0).toDataURL();
    }
    setBaked(out);
  }, []);
  const z = 1.6;
  const vbX = -H * HW;
  const vw = (W + H) * HW;
  const vh = (W + H) * HH + 60;
  const vb = `${vbX} -60 ${vw} ${vh}`;
  const cell = (ch: string, kind: "old" | "day" | "night") => (
    <div style={{ position: "relative", width: vw * z, height: vh * z, borderRadius: 6, overflow: "hidden" }}>
      {kind === "old" ? (
        // biome-ignore lint/performance/noImgElement: dev sheet
        <img
          alt=""
          style={{ position: "absolute", inset: 0 }}
          src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" width="${vw * z}" height="${vh * z}">${oldFloor(ch)}</svg>`)}`}
        />
      ) : (
        baked[ch] && (
          // biome-ignore lint/performance/noImgElement: dev sheet
          <img
            alt=""
            src={baked[ch]}
            style={{ position: "absolute", left: 0, top: 60 * z, width: vw * z, height: (W + H) * HH * z }}
          />
        )
      )}
      {/* biome-ignore lint/performance/noImgElement: dev sheet */}
      <img
        alt=""
        style={{ position: "absolute", inset: 0 }}
        src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" width="${vw * z}" height="${vh * z}">${overlay()}</svg>`)}`}
      />
      {kind === "night" && (
        <div style={{ position: "absolute", inset: 0, background: NIGHT, mixBlendMode: "multiply" }} />
      )}
      <span
        style={{ position: "absolute", left: 6, top: 4, font: "11px ui-monospace", color: "#e8d9b8", opacity: 0.75 }}
      >
        {kind === "old" ? "before" : kind}
      </span>
    </div>
  );
  return (
    <main style={{ background: "#2a1c13", minHeight: "100%", overflow: "auto", padding: 16, height: "100vh" }}>
      <h1 className="lcd text-2xl mb-2">YUTOPIA · FLOOR SHEET</h1>
      <p style={{ font: "12px ui-monospace", color: "#d9cba9", margin: "0 0 10px" }}>
        Wall-base AO + corner (back walls) · door sill (gap in the back wall) · AO under a desk and a plant (dashed
        footprints) · transition strip to the next material (right two columns).
      </p>
      {MATS.map(([ch, label]) => (
        <section key={ch} style={{ background: "#3b281b", borderRadius: 8, padding: 6, marginBottom: 8 }}>
          <div style={{ font: "13px ui-monospace", color: "#ffb35c", margin: "2px 4px 6px" }}>{label}</div>
          <div style={{ display: "flex", gap: 4 }}>
            {cell(ch, "old")}
            {cell(ch, "day")}
            {cell(ch, "night")}
          </div>
        </section>
      ))}
    </main>
  );
}
