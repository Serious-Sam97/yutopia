"use client";

import { emptyEdges, type MapDef, setEdge, type WorldObjectDef } from "@yutopia/shared";
import { notFound } from "next/navigation";
import { useEffect, useState } from "react";
import { FloorBake } from "@/world/art/floors";
import { postArt, wallArt } from "@/world/art/items";
import type { ItemArt } from "@/world/art/items/kit";

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

// row 0 and column 0 are outside; thin walls run along y = 1 and x = 1, with a
// doorway at x = 3
function testRoom(ch: string): { map: MapDef; objects: WorldObjectDef[] } {
  const nb = NEXT[ch];
  const tiles = [" ".repeat(W)];
  for (let y = 1; y < H; y++) tiles.push(` ${ch.repeat(4)}${nb.repeat(2)}`);
  const map: MapDef = {
    key: "t",
    name: "t",
    width: W,
    height: H,
    tiles,
    ...emptyEdges(W, H),
    spawn: { x: 2.5, y: 2.5 },
    areas: [],
    objects: [],
  };
  for (let x = 1; x < W; x++) if (x !== 3) setEdge(map, { x, y: 1, dir: "h" }, "p");
  for (let y = 1; y < H; y++) setEdge(map, { x: 1, y, dir: "v" }, "p");
  const objects: WorldObjectDef[] = [
    { id: "door", kind: "door", x: 3, y: 1, rot: 0, props: { state: "closed" } },
    { id: "desk", kind: "desk", x: 2, y: 3, rot: 0 },
    { id: "plant", kind: "plant", x: 5, y: 2, rot: 0 },
  ];
  if (ch === "~") map.areas.push({ key: "s", name: "Stage", kind: "stage", x: 2, y: 2, w: 5, h: 3 });
  return { map, objects };
}

const P = (x: number, y: number, z = 0) => [(x - y) * HW, (x + y) * HH - z] as const;
const pts = (p: (readonly [number, number])[]) => p.map(([x, y]) => `${x},${y}`).join(" ");

// the thin back walls (along y = 1 and x = 1) + footprints of the furniture, for context
function overlay(): string {
  let g = "";
  const t = 0.1;
  const box = (x0: number, x1: number, y0: number, y1: number, z1: number) =>
    `<polygon points="${pts([P(x0, y1, 0), P(x1, y1, 0), P(x1, y1, z1), P(x0, y1, z1)])}" fill="#efe4cc"/><polygon points="${pts([P(x1, y1, 0), P(x1, y0, 0), P(x1, y0, z1), P(x1, y1, z1)])}" fill="#d2c8b4"/><polygon points="${pts([P(x0, y0, z1), P(x1, y0, z1), P(x1, y1, z1), P(x0, y1, z1)])}" fill="#3e2718"/>`;
  for (let x = 1; x < W; x++) if (x !== 3) g += box(x, x + 1, 1 - t, 1 + t, 50);
  for (let y = 1; y < H; y++) g += box(1 - t, 1 + t, y, y + 1, 50);
  for (const [x, y, w, h] of [
    [2, 3, 2, 1],
    [5, 2, 1, 1],
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
      if (c === " ") continue;
      g += `<polygon points="${pts([P(x, y), P(x + 1, y), P(x + 1, y + 1), P(x, y + 1)])}" fill="${OLD[c]}" stroke="rgba(0,0,0,.25)" stroke-width=".6"/>`;
    }
  return g;
}

// ── walls: each material as a corner (a wall along x, a wall along y, a post)
const WALLS: [string, string][] = [
  ["p", "Plaster + dado"],
  ["P", "Plaster · window"],
  ["w", "Walnut panelling"],
  ["W", "Walnut · window"],
  ["f", "Acoustic foam"],
  ["b", "Brick"],
  ["B", "Brick · window"],
  ["k", "Cork"],
  ["g", "Smoked glass"],
  ["h", "Half wall"],
];

function WallCorner({ ch, z }: { ch: string; z: number }) {
  const N = 3;
  const ox = N * HW + 20;
  const oy = 110;
  const cw = N * 2 * HW + 40;
  const ch2 = N * 2 * HH + 130;
  const pieces: { art: ItemArt; at: [number, number]; key: number }[] = [];
  for (let i = 0; i < N; i++)
    for (let q = 0; q < 4; q++)
      for (const part of ["low", "high"] as const) {
        const c = (q + 0.5) / 4;
        const h = wallArt("h", ch, q, part, 2);
        if (h) pieces.push({ art: h, at: [i, 0], key: i + c + (part === "high" ? 1e-4 : 0) });
        const v = wallArt("v", ch, q, part, 2);
        if (v) pieces.push({ art: v, at: [0, i], key: i + c + (part === "high" ? 1e-4 : 0) });
      }
  // posts at the corner and at both free ends, like the game
  for (const at of [
    [0, 0],
    [N, 0],
    [0, N],
  ] as [number, number][])
    for (const part of ["low", "high"] as const) {
      const p = postArt(ch === "h" ? 34 : 84, part, ch, 2);
      if (p) pieces.push({ art: p, at, key: at[0] + at[1] + (part === "high" ? 1e-4 : 0) });
    }
  pieces.sort((a, b) => a.key - b.key);
  const floor = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-ox} ${-oy} ${cw} ${ch2}" width="${cw * z}" height="${ch2 * z}">${Array.from(
    { length: N * N },
    (_, k) => {
      const x = k % N;
      const y = Math.floor(k / N);
      return `<polygon points="${pts([P(x, y), P(x + 1, y), P(x + 1, y + 1), P(x, y + 1)])}" fill="${(x + y) % 2 ? "#946640" : "#8a5c37"}"/>`;
    },
  ).join("")}</svg>`;
  return (
    <div style={{ position: "relative", width: cw * z, height: ch2 * z }}>
      {/* biome-ignore lint/performance/noImgElement: dev sheet */}
      <img
        alt=""
        src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(floor)}`}
        style={{ position: "absolute", inset: 0 }}
      />
      {pieces.map((p, i) => {
        const [sx, sy] = P(p.at[0], p.at[1]);
        return (
          // biome-ignore lint/performance/noImgElement: dev sheet
          <img
            // biome-ignore lint/suspicious/noArrayIndexKey: static sheet
            key={i}
            alt=""
            src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(p.art.svg)}`}
            style={{
              position: "absolute",
              left: (ox + sx + p.art.x) * z,
              top: (oy + sy + p.art.y) * z,
              width: p.art.w * z,
              height: p.art.h * z,
            }}
          />
        );
      })}
    </div>
  );
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
      <section style={{ background: "#3b281b", borderRadius: 8, padding: 6, marginBottom: 8 }} data-row="walls">
        <div style={{ font: "13px ui-monospace", color: "#ffb35c", margin: "2px 4px 6px" }}>
          Walls on tile edges · each material as a corner (wall along x, wall along y, the post where they meet)
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {WALLS.map(([ch, label]) => (
            <div key={ch} style={{ background: "#2a1c13", borderRadius: 6 }}>
              <WallCorner
                ch={ch}
                z={Number(
                  typeof location !== "undefined" ? (new URLSearchParams(location.search).get("wz") ?? 1.5) : 1.5,
                )}
              />
              <div style={{ font: "11px ui-monospace", color: "#e8d9b8", padding: "0 6px 4px" }}>{label}</div>
            </div>
          ))}
        </div>
      </section>
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
