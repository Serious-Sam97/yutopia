import {
  type DressItem,
  doorLeaves,
  doorShut,
  doorSlides,
  dressItems,
  edgeKey,
  entry,
  footprint,
  HALF_WALL,
  hangOf,
  hWall,
  isDoorKind,
  isFloor,
  isOpening,
  isWallEdge,
  type MapDef,
  openingCut,
  rotOf,
  tileAt,
  topCentre,
  vWall,
  type WallCut,
  type WorldObjectDef,
} from "@yutopia/shared";
import { Graphics, type GraphicsContext } from "pixi.js";
import { type Piece, piece, WALL_H } from "./furniture";
import { type Box, type Clip, diamond, drawBox, P, rotateBoxes } from "./iso";
import type { Group, ItemArt } from "./items/kit";

// The item drawings load in their own chunk; box art shows until they arrive.
type ItemsModule = typeof import("./items");
let items: ItemsModule | null = null;
let loadingItems: Promise<ItemsModule> | null = null;
export function loadItemArt(): Promise<unknown> {
  loadingItems ??= import("./items").then((m) => {
    items = m;
    return m;
  });
  return loadingItems;
}

import { C, hash2, mix } from "./palette";

// One drawable slice of the world, sorted by `key` against avatars (x + y).
export interface Part {
  ctx: GraphicsContext;
  x: number; // screen position of the slice origin
  y: number;
  key: number;
  tall?: boolean; // tall wall: may fade when you're behind it
  wx: number; // world tile of the slice (for cut-away tests)
  wy: number;
  objectId?: string;
  // the wall edge this part is (or hangs on): it fades with that wall when the
  // wall stands between you and the camera ("wall-down")
  edge?: { dir: "h" | "v"; x: number; y: number; high: boolean };
  at?: [number, number]; // where its light is sampled (world tiles)
  // walls: the upper layer, drawn in the same part but faded on its own (wall-down)
  high?: { ctx: GraphicsContext; art?: Part["art"] };
  // the illustrated drawing of this slice (null while the item has none):
  // `ox/oy` = this part's origin relative to the object's origin, px
  art?: { key: string; get: () => ItemArt | null; ox: number; oy: number };
}

// Generated drawings, memoized per texture key (the SVG string + its frame).
const artCache = new Map<string, ItemArt | null>();
function memo(key: string, make: () => ItemArt | null): () => ItemArt | null {
  return () => {
    if (!artCache.has(key)) artCache.set(key, make());
    return artCache.get(key) ?? null;
  };
}

// Debug / A-B switch: localStorage["yutopia:boxart"] = "1" draws the old box art only.
const boxOnly = (() => {
  try {
    return typeof localStorage !== "undefined" && localStorage.getItem("yutopia:boxart") === "1";
  } catch {
    return false;
  }
})();
export function itemArtLoaded(): string | null {
  return items?.ITEM_ART_CHUNK ?? null;
}

function illustrated(kind: string): boolean {
  return !boxOnly && !!items?.hasItemArt(kind);
}

// Rugs and rings as one illustrated floor sprite (they never sort with people).
export function objectFlat(o: WorldObjectDef): { key: string; get: () => ItemArt | null } | null {
  const m = items;
  if (!m || !illustrated(o.kind) || !m.isFlatArt(o.kind)) return null;
  const ref = { kind: o.kind, id: o.id, rot: o.rot ?? 0, props: o.props };
  const key = m.itemKey(ref, "flat", "all", artRes);
  return { key, get: memo(key, () => m.itemArt(ref, null, "all", artRes)) };
}

// Texture scale for illustrated items (set by the engine from quality + DPR).
let artRes = 2;
export function setArtRes(r: number) {
  artRes = r;
}

// The soft contact shadow under an illustrated item (floor layer).
export function objectShadow(o: WorldObjectDef): { key: string; get: () => ItemArt | null } | null {
  // things on a surface cast on the surface (in their drawing), not the floor
  if (!illustrated(o.kind) || entry(o.kind).onSurface) return null;
  const rot = rotOf(o);
  const m = items as ItemsModule;
  const ref = { kind: o.kind, id: o.id, rot, props: o.props };
  const key = m.itemKey(ref, "shadow", "all", 1);
  return { key, get: memo(key, () => m.itemShadow(ref)) };
}

const ctxCache = new Map<string, GraphicsContext>();

function cached(key: string, build: (g: Graphics) => void): GraphicsContext {
  let c = ctxCache.get(key);
  if (!c) {
    const g = new Graphics();
    build(g);
    c = g.context;
    ctxCache.set(key, c);
  }
  return c;
}

// ── floors ─────────────────────────────────────────────────────────────────
export function drawFloors(g: Graphics, map: MapDef) {
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      const ch = tileAt(map, x, y);
      if (!isFloor(ch)) continue;
      const n = hash2(x, y);
      switch (ch) {
        case ".": {
          // planks run along x; each plank row gets its own tone
          const plank = hash2(Math.floor((x + (y % 2) * 0.5) / 2), y, 3);
          diamond(g, x, y, 1, 1, 0, mix(0x9a6a40, 0x80542f, plank));
          g.moveTo(...P(x, y + 0.5))
            .lineTo(...P(x + 1, y + 0.5))
            .stroke({ width: 1, color: 0x5e3b22, alpha: 0.35 });
          if (n > 0.5)
            g.moveTo(...P(x + n, y))
              .lineTo(...P(x + n, y + 0.5))
              .stroke({ width: 1, color: 0x5e3b22, alpha: 0.3 });
          g.moveTo(...P(x, y))
            .lineTo(...P(x + 1, y))
            .stroke({ width: 1, color: 0x5e3b22, alpha: 0.45 });
          break;
        }
        case ",":
          diamond(g, x, y, 1, 1, 0, mix(C.carpet, C.carpetLight, n * 0.6));
          for (let i = 0; i < 3; i++) {
            const px = x + hash2(x, y, i + 9);
            const py = y + hash2(y, x, i + 4);
            g.circle(...P(px, py), 0.9).fill({ color: 0x4f5228, alpha: 0.45 });
          }
          break;
        case "_":
          diamond(g, x, y, 1, 1, 0, (x + y) % 2 ? C.tile : C.tileDark);
          g.poly([...P(x, y), ...P(x + 1, y), ...P(x + 1, y + 1), ...P(x, y + 1)]).stroke({
            width: 1,
            color: 0xb8ab8c,
            alpha: 0.5,
          });
          break;
        case ":":
          diamond(g, x, y, 1, 1, 0, mix(C.felt, C.feltLight, n * 0.5));
          g.moveTo(...P(x + 0.5, y))
            .lineTo(...P(x + 0.5, y + 1))
            .stroke({ width: 1, color: 0x5e2a20, alpha: 0.25 });
          break;
        case "~":
          diamond(g, x, y, 1, 1, 0, mix(C.stage, C.stageLight, hash2(x, Math.floor(y / 1), 5)));
          g.moveTo(...P(x, y))
            .lineTo(...P(x + 1, y))
            .stroke({ width: 1, color: 0x15100c, alpha: 0.6 });
          break;
        case "x":
          diamond(g, x, y, 1, 1, 0, mix(C.grate, C.grateLight, n * 0.4));
          for (let i = 1; i < 4; i++)
            g.moveTo(...P(x + i / 4, y))
              .lineTo(...P(x + i / 4, y + 1))
              .stroke({ width: 1, color: 0x2a2824, alpha: 0.5 });
          break;
      }
    }
  }
  // the stage edge
  const stage = map.areas.find((a) => a.kind === "stage");
  if (stage) {
    g.moveTo(...P(stage.x, stage.y + stage.h))
      .lineTo(...P(stage.x + stage.w, stage.y + stage.h))
      .stroke({ width: 3, color: C.amber, alpha: 0.75 });
  }
}

// Rugs, the standup ring and other flat things live on their own floor layer.
export function drawFlat(g: Graphics, o: WorldObjectDef) {
  const { w, h } = footprint(o.kind, o.rot ?? 0);
  if (o.kind === "standup_mat") {
    const [cx, cy] = P(o.x + w / 2, o.y + h / 2);
    const rx = (w / 2) * 32 * 1.41;
    const ry = rx / 2;
    g.ellipse(cx, cy, rx, ry).fill({ color: C.walnutDark, alpha: 0.35 });
    g.ellipse(cx, cy, rx, ry).stroke({ width: 3, color: C.amber, alpha: 0.85 });
    g.ellipse(cx, cy, rx * 0.72, ry * 0.72).stroke({ width: 1.5, color: C.amber, alpha: 0.45 });
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      g.circle(cx + Math.cos(a) * rx * 0.86, cy + Math.sin(a) * ry * 0.86, 2).fill({ color: C.vfd, alpha: 0.8 });
    }
    return;
  }
  const p = piece(o.kind, o.props ?? {}, o.id);
  for (const b of rotateBoxes(p.boxes, entry(o.kind).w, entry(o.kind).h, o.rot ?? 0)) {
    drawBox(g, { ...b, x: b.x + o.x, y: b.y + o.y }, null);
  }
}

// ── walls (map v2: on tile edges) ──────────────────────────────────────────
// Each wall edge is four slices along its length (so people on either side of a
// thin wall sort right against it) × a low part (skirting, always there) and a
// high part (fades for "wall-down"); posts fill the joints. Sort keys: the
// slice's centre (x + y), like everything else.
const WT = 0.1; // half thickness
const LOW = 14;
const HALF = 34;

// Box art for a wall slice, until the drawings load (`cut`: a door's or a
// window's hole through it).
function wallBoxes(dir: "h" | "v", ch: string, high: boolean, cut: readonly [number, number] | null): Box[] {
  const top = ch === HALF_WALL ? HALF : WALL_H;
  const along = (z: number, h: number, color: number, t?: number): Box[] => {
    const box = (z0: number, z1: number): Box =>
      dir === "h"
        ? { x: 0, y: -WT, w: 1, d: 2 * WT, z: z0, h: z1 - z0, color, top: t, outline: false }
        : { x: -WT, y: 0, w: 2 * WT, d: 1, z: z0, h: z1 - z0, color, top: t, outline: false };
    if (!cut) return [box(z, z + h)];
    return [
      [z, Math.min(z + h, cut[0])],
      [Math.max(z, cut[1]), z + h],
    ]
      .filter(([a, b]) => b > a)
      .map(([a, b]) => box(a, b));
  };
  if (!high) return along(0, LOW, C.walnut);
  return [
    ...along(LOW, 30 - LOW, C.walnut),
    ...along(30, top - 33, C.cream),
    ...along(top - 3, 3, C.walnutDark, C.walnut),
  ];
}

// `cuts`: the holes doors and windows make in walls (shared wallCuts).
export function wallParts(map: MapDef, cuts: Map<string, WallCut> = new Map()): Part[] {
  const parts: Part[] = [];
  const m = items && !boxOnly ? items : null;
  const add = (dir: "h" | "v", x: number, y: number, ch: string) => {
    const c = cuts.get(edgeKey({ dir, x, y }));
    const cut = c ? ([c.z0, c.z1] as const) : null;
    const ck = cut ? cut.join("-") : "";
    for (let q = 0; q < 4; q++) {
      const clip: Clip =
        dir === "h" ? { x0: q / 4, x1: (q + 1) / 4, y0: -1, y1: 1 } : { x0: -1, x1: 1, y0: q / 4, y1: (q + 1) / 4 };
      const layer = (high: boolean) => {
        const ctx = cached(`wall|${dir}|${ch}|${q}|${high}|${ck}`, (g) => {
          for (const b of wallBoxes(dir, ch, high, cut)) drawBox(g, b, clip);
        });
        const part = high ? "high" : "low";
        const akey = m?.wallKey(dir, ch, q, part, artRes, cut);
        const art =
          m && akey
            ? { key: akey, get: memo(akey, () => m.wallArt(dir, ch, q, part, artRes, cut)), ox: 0, oy: 0 }
            : undefined;
        return { ctx, art };
      };
      const low = layer(false);
      const [sx, sy] = P(x, y);
      const c = (q + 0.5) / 4;
      parts.push({
        ctx: low.ctx,
        art: low.art,
        high: layer(true),
        x: sx,
        y: sy,
        key: dir === "h" ? x + c + y : x + y + c,
        wx: x,
        wy: y,
        edge: { dir, x, y, high: true },
        // lit from the floor in front of its face (or behind, on the outside)
        at:
          dir === "h"
            ? [x + c, isFloor(tileAt(map, x, y)) ? y + 0.15 : y - 0.15]
            : [isFloor(tileAt(map, x, y)) ? x + 0.15 : x - 0.15, y + c],
      });
    }
  };
  for (let y = 0; y <= map.height; y++)
    for (let x = 0; x < map.width; x++) {
      const ch = hWall(map, x, y);
      if (isWallEdge(ch)) add("h", x, y, ch);
    }
  for (let y = 0; y < map.height; y++)
    for (let x = 0; x <= map.width; x++) {
      const ch = vWall(map, x, y);
      if (isWallEdge(ch)) add("v", x, y, ch);
    }
  // posts where walls turn, meet or end (a straight run needs none)
  for (let Y = 0; Y <= map.height; Y++)
    for (let X = 0; X <= map.width; X++) {
      const w = hWall(map, X - 1, Y);
      const e = hWall(map, X, Y);
      const n = vWall(map, X, Y - 1);
      const s = vWall(map, X, Y);
      const touching = [w, e, n, s].filter(isWallEdge);
      if (!touching.length) continue;
      const half = (c: string) => c === HALF_WALL;
      const straight =
        (isWallEdge(w) && isWallEdge(e) && !isWallEdge(n) && !isWallEdge(s) && half(w) === half(e)) ||
        (isWallEdge(n) && isWallEdge(s) && !isWallEdge(w) && !isWallEdge(e) && half(n) === half(s));
      if (straight) continue;
      const height = touching.every(half) ? HALF : WALL_H;
      const pch = touching.find((c) => !half(c)) ?? touching[0];
      const layer = (high: boolean) => {
        const ctx = cached(`post|${height}|${high}`, (g) => {
          const b = (z: number, h: number, color: number, top?: number): Box => ({
            x: -WT,
            y: -WT,
            w: 2 * WT,
            d: 2 * WT,
            z,
            h,
            color,
            top,
            outline: false,
          });
          if (!high) drawBox(g, b(0, LOW, C.walnut));
          else {
            drawBox(g, b(LOW, 30 - LOW, C.walnut));
            drawBox(g, b(30, height - 33, C.cream));
            drawBox(g, b(height - 3, 3, C.walnutDark, C.walnut));
          }
        });
        const part = high ? "high" : "low";
        const akey = m ? `post|${height}|${part}|${pch}|${artRes}` : undefined;
        const art =
          m && akey
            ? { key: akey, get: memo(akey, () => m.postArt(height, part, pch, artRes)), ox: 0, oy: 0 }
            : undefined;
        return { ctx, art };
      };
      const low = layer(false);
      const [sx, sy] = P(X, Y);
      // the post fades with the wall it belongs to most (h first)
      const dir = isWallEdge(hWall(map, X, Y)) || isWallEdge(hWall(map, X - 1, Y)) ? "h" : "v";
      parts.push({
        ctx: low.ctx,
        art: low.art,
        high: layer(true),
        x: sx,
        y: sy,
        key: X + Y,
        wx: X,
        wy: Y,
        edge: {
          dir,
          x: dir === "h" ? Math.max(0, X - (isWallEdge(hWall(map, X, Y)) ? 0 : 1)) : X,
          y: dir === "v" ? Math.max(0, Y - (isWallEdge(vWall(map, X, Y)) ? 0 : 1)) : Y,
          high: true,
        },
        at: [X + 0.15, Y + 0.15],
      });
    }
  return parts;
}

// ── dressing (the rooms' clutter) ───────────────────────────────────────────
// One part per piece (no box fallback: dressing appears with the drawings).
export function dressParts(
  map: MapDef,
  objects: WorldObjectDef[],
): { part: Part; item: DressItem; shadow: { key: string; get: () => ItemArt | null } | null }[] {
  const m = items && !boxOnly ? items : null;
  if (!m) return [];
  const empty = cached("dress|empty", () => {});
  const out: { part: Part; item: DressItem; shadow: { key: string; get: () => ItemArt | null } | null }[] = [];
  for (const d of dressItems(map, objects)) {
    const wall = d.kind === "frame";
    // the sketch is centred on (0.5, 0.5); frames hang on the edge at y
    const ox = d.x - 0.5;
    const oy = wall ? d.y : d.y - 0.5;
    const [sx, sy] = P(ox, oy);
    const key = wall ? d.x + d.y + 0.01 : d.x + d.y;
    const akey = m.dressKey(d.kind, d.z, d.seed, artRes);
    const skey = `${akey}|sh`;
    out.push({
      item: d,
      part: {
        ctx: empty,
        x: sx,
        y: sy,
        key,
        wx: Math.floor(d.x),
        wy: Math.floor(d.y),
        at: [d.x, wall ? d.y + 0.25 : d.y],
        edge: wall ? { dir: "h", x: Math.floor(d.x), y: d.y, high: true } : undefined,
        art: { key: akey, get: memo(akey, () => m.dressArt(d.kind, d.z, d.seed, artRes)), ox: 0, oy: 0 },
      },
      shadow: d.z === 0 && !wall ? { key: skey, get: memo(skey, () => m.dressShadow(d.kind, d.z, d.seed)) } : null,
    });
  }
  return out;
}

// ── furniture ──────────────────────────────────────────────────────────────
// Long things are cut per tile along their length; things on a wall are cut in
// quarters like the wall itself, so they sort against people the same way.
const WALL_FACE = 0.1; // wall items hang on the face of the thin wall

// `host`: what it stands on, for things on a surface.
export function objectParts(o: WorldObjectDef, host?: WorldObjectDef): Part[] {
  const e = entry(o.kind);
  if (isOpening(o.kind)) return openingParts(o);
  const p = piece(o.kind, o.props ?? {}, o.id);
  if (p.flat) return [];
  if (e.onSurface) return topParts(o, p, host);
  const rot = rotOf(o);
  // wall items: on any face of a wall, shifted along it and raised (hang.ts);
  // `along`: the wall runs along y (east / west faces)
  const hg = e.wall ? hangOf(o) : null;
  const along = hg?.dir === "v";
  const [ax, ay, lift] = hg ? [hg.ax, hg.ay, hg.lift] : [o.x, o.y, 0];
  const { w, h } = footprint(o.kind, rot);
  const boxes = rotateBoxes(e.wall ? p.boxes.map((b) => ({ ...b, y: b.y + WALL_FACE })) : p.boxes, e.w, e.h, rot);
  const slices: Clip[] = [];
  if (hg && along) for (let i = 0; i < h * 4; i++) slices.push({ x0: -1, x1: w + 1, y0: i / 4, y1: (i + 1) / 4 });
  else if (hg) for (let i = 0; i < w * 4; i++) slices.push({ x0: i / 4, x1: (i + 1) / 4, y0: -1, y1: h + 1 });
  else if (w > h) for (let i = 0; i < w; i++) slices.push({ x0: i, x1: i + 1, y0: -1, y1: h + 1 });
  else if (h > w) for (let i = 0; i < h; i++) slices.push({ x0: -1, x1: w + 1, y0: i, y1: i + 1 });
  else slices.push({ x0: -1, x1: w + 1, y0: -1, y1: h + 1 });
  const out: Part[] = [];
  const propsKey = JSON.stringify(o.props ?? {});
  slices.forEach((clip, i) => {
    const groups: [number, Box[]][] = p.seat ? seatGroups(boxes, w, h) : [[0, boxes]];
    for (const [bias, list] of groups) {
      const cx = Math.max(0, clip.x0);
      const cy = Math.max(0, clip.y0);
      const ckey = `${o.kind}|${rot}|${i}|${bias}|${o.id.startsWith("b-") ? "" : o.id}|${propsKey}`;
      const ctx = cached(ckey, (g) => {
        const [ox, oy] = P(cx, cy);
        for (const b of list) drawBox(g, b, slices.length > 1 ? clip : null, ox, oy);
        // organic extras (leaves, poles) — only 1×1 pieces have them, so no offset
        if (p.custom && i === 0 && bias <= 0) p.custom(g);
      });
      const sw = hg && !along ? 0.25 : slices.length > 1 ? Math.min(1, w) : w;
      const sh = hg && along ? 0.25 : slices.length > 1 ? Math.min(1, h) : h;
      const wx = ax + cx;
      const wy = ay + cy;
      const [sx, sy] = P(wx, wy);
      let art: Part["art"];
      if (illustrated(o.kind)) {
        const group: Group = bias < 0 ? "back" : bias > 0 ? "front" : "all";
        const ref = { kind: o.kind, id: o.id, rot, props: o.props };
        const clipped = slices.length > 1 ? clip : null;
        const m = items as ItemsModule;
        const akey = m.itemKey(ref, slices.length > 1 ? String(i) : "", group, artRes);
        const [ox, oy] = P(cx, cy);
        art = { key: akey, get: memo(akey, () => m.itemArt(ref, clipped, group, artRes)), ox, oy };
      }
      // wall items: just in front of the wall slice behind them (just behind it
      // on its far face), fading with that wall
      const key = hg
        ? hg.line + (along ? wy + sh / 2 : wx + sw / 2) + 0.01 * hg.side
        : wx + Math.min(sw, w - cx) / 2 + wy + Math.min(sh, h - cy) / 2 + bias;
      out.push({
        ctx,
        x: sx,
        y: sy - lift,
        key,
        wx,
        wy,
        objectId: o.id,
        art,
        edge: hg
          ? along
            ? { dir: "v", x: hg.line, y: Math.floor(wy), high: true }
            : { dir: "h", x: Math.floor(wx), y: hg.line, high: true }
          : undefined,
        at: hg
          ? along
            ? [hg.line + hg.side * 0.25, wy + sh / 2]
            : [wx + sw / 2, hg.line + hg.side * 0.25]
          : [wx + Math.min(sw, w - cx) / 2, wy + Math.min(sh, h - cy) / 2],
      });
    }
  });
  return out;
}

// Something on a surface: drawn around the middle of a tile at z 0, then moved
// to its spot on the top and raised to it, and sorted just above the slice of
// the surface under it (so a mug on the back of a meeting table isn't hidden).
function topParts(o: WorldObjectDef, p: Piece, host?: WorldObjectDef): Part[] {
  const rot = o.rot ?? 0;
  const c = topCentre(o);
  const z = Number(o.props?.z) || 0;
  const boxes = rotateBoxes(p.boxes, 1, 1, rot);
  const ctx = cached(`${o.kind}|${rot}|top|${JSON.stringify(o.props ?? {})}`, (g) => {
    for (const b of boxes) drawBox(g, b);
  });
  const [sx, sy] = P(c.x - 0.5, c.y - 0.5);
  let art: Part["art"];
  if (illustrated(o.kind)) {
    const m = items as ItemsModule;
    const ref = { kind: o.kind, id: o.id, rot, props: o.props };
    const akey = m.itemKey(ref, "", "all", artRes);
    art = { key: akey, get: memo(akey, () => m.itemArt(ref, null, "all", artRes)), ox: 0, oy: 0 };
  }
  return [
    {
      ctx,
      x: sx,
      y: sy - z,
      key: topKey(c, host),
      wx: Math.floor(c.x),
      wy: Math.floor(c.y),
      objectId: o.id,
      art,
      at: [c.x, c.y],
    },
  ];
}

// The sort key of the host's slice under a point (as objectParts slices it), a
// hair above it; back to front among things on the same top.
function topKey(c: { x: number; y: number }, host?: WorldObjectDef): number {
  if (!host) return c.x + c.y + 0.03;
  const { w, h } = footprint(host.kind, host.rot ?? 0);
  const tx = Math.floor(c.x);
  const ty = Math.floor(c.y);
  let key: number;
  if (w > h) key = tx + 0.5 + host.y + Math.min(1, h) / 2;
  else if (h > w) key = host.x + Math.min(1, w) / 2 + ty + 0.5;
  else key = host.x + w / 2 + host.y + h / 2;
  return key + 0.03 + ((c.x % 1) + (c.y % 1)) * 0.005;
}

// A door or window in a wall (shared openings.ts): four slices per edge in the
// wall line (its frame, glass, a shut leaf) sorted and faded like the wall, and
// a door's open leaf sorted in the tile it swings into.
function openingParts(o: WorldObjectDef): Part[] {
  const door = isDoorKind(o.kind);
  const n = Math.max(1, entry(o.kind).w);
  const odd = (o.rot ?? 0) % 2 === 1;
  const rot = odd ? 3 : 0; // west edges: its +y side faces +x
  const dir = odd ? "v" : "h";
  const st = String(o.props?.state ?? "");
  const shut = doorShut(o);
  const slides = doorSlides(o.kind);
  const [z0, z1] = openingCut(o.kind);
  const jamb = (x: number): Box => ({
    x,
    y: -WT,
    w: 0.07,
    d: 2 * WT,
    z: z0,
    h: z1 - z0,
    color: C.walnut,
    outline: false,
  });
  const frame: Box[] = [
    jamb(0),
    jamb(n - 0.07),
    // the head: a door's casing over it, a window's head in it
    {
      x: 0,
      y: -WT - 0.02,
      w: n,
      d: 2 * WT + 0.04,
      z: door ? z1 : z1 - 3,
      h: door ? 5 : 3,
      color: C.walnutDark,
      outline: false,
    },
  ];
  if (!door)
    frame.push({ x: 0.07, y: -0.01, w: n - 0.14, d: 0.02, z: z0, h: z1 - z0, color: 0xa9c2d0, outline: false });
  if (shut && !slides)
    frame.push({ x: 0.08, y: -0.04, w: n - 0.16, d: 0.08, z: 0, h: z1, color: C.walnut, outline: false });
  const out: Part[] = [];
  const m = illustrated(o.kind) ? (items as ItemsModule) : null;
  const [sx, sy] = P(o.x, o.y);
  const state = door ? (shut ? st : "open") : "";
  const props = { ...(o.props ?? {}), _part: "edge" };
  for (let i = 0; i < n * 4; i++) {
    const u0 = i / 4;
    const clip: Clip = odd ? { x0: -1, x1: 1, y0: u0, y1: u0 + 0.25 } : { x0: u0, x1: u0 + 0.25, y0: -1, y1: 1 };
    const ctx = cached(`${o.kind}|${dir}|${state}|${i}`, (g) => {
      for (const b of rotateBoxes(frame, n, 1, rot)) drawBox(g, b, clip);
    });
    const ref = { kind: o.kind, id: o.id, rot, props };
    const akey = m?.itemKey(ref, `q${i}`, "all", artRes);
    const c = u0 + 0.125;
    const k = Math.floor(u0);
    const [ex, ey] = odd ? [o.x, o.y + k] : [o.x + k, o.y];
    out.push({
      ctx,
      x: sx,
      y: sy,
      key: o.x + o.y + c + 0.005,
      wx: ex,
      wy: ey,
      objectId: o.id,
      edge: { dir, x: ex, y: ey, high: true },
      at: odd ? [o.x + 0.15, o.y + c] : [o.x + c, o.y + 0.15],
      art:
        m && akey ? { key: akey, get: memo(akey, () => m.itemArt(ref, clip, "all", artRes)), ox: 0, oy: 0 } : undefined,
    });
  }
  // a tile along it (k) on one side (front: +y / +x; back: the other)
  const tileOf = (k: number, front: boolean): [number, number] =>
    odd ? [front ? o.x : o.x - 1, o.y + k] : [o.x + k, front ? o.y : o.y - 1];
  const back = Number(o.props?.swing) < 0;
  const leafPart = (i: number, tile: [number, number], key: number, box: Box, fade: boolean) => {
    const ctx = cached(`${o.kind}|${dir}|leaf|${i}|${back ? "-" : ""}|${shut ? "s" : ""}`, (g) => {
      for (const b of rotateBoxes([box], n, 1, rot)) drawBox(g, b, null);
    });
    const ref = { kind: o.kind, id: o.id, rot, props: { ...(o.props ?? {}), _part: "leaf", _leaf: i } };
    const akey = m?.itemKey(ref, `leaf${i}`, "all", artRes);
    const [tx, ty] = tile;
    out.push({
      ctx,
      x: sx,
      y: sy,
      key,
      wx: tx,
      wy: ty,
      objectId: o.id,
      ...(fade ? { edge: { dir, x: odd ? o.x : tx, y: odd ? ty : o.y, high: true } } : {}),
      at: [tx + 0.5, ty + 0.5],
      art:
        m && akey ? { key: akey, get: memo(akey, () => m.itemArt(ref, null, "all", artRes)), ox: 0, oy: 0 } : undefined,
    });
  };
  if (slides) {
    // a barn door rolls along the face (+y), aside when open: sorted just in
    // front of the stretch of wall it's on, fading with it
    const k = shut ? 0 : back ? -1 : 1;
    const box: Box = { x: k * 0.92, y: WT + 0.01, w: n, d: 0.05, z: 0, h: z1, color: C.walnut, outline: false };
    leafPart(0, tileOf(k, true), o.x + o.y + k + 0.5 + 0.012, box, true);
  } else if (door && !shut)
    // open: each leaf in the tile it swings into (props.swing −1: the one behind the wall)
    for (let i = 0; i < doorLeaves(o.kind); i++) {
      const k = n > 1 ? i : 0;
      const tile = tileOf(k, !back);
      const hinge = n > 1 ? (i === 0 ? 0.08 : 1.85) : i === 0 ? 0.08 : 0.85;
      const box: Box = {
        x: hinge,
        y: back ? -WT - 0.8 : WT,
        w: 0.07,
        d: 0.8,
        z: 0,
        h: z1,
        color: C.walnut,
        outline: false,
      };
      leafPart(i, tile, tile[0] + 0.5 + tile[1] + 0.5, box, false);
    }
  return out;
}

function seatGroups(boxes: Box[], w: number, h: number): [number, Box[]][] {
  const seat: Box[] = [];
  const front: Box[] = [];
  const behind: Box[] = [];
  const centre = w / 2 + h / 2;
  for (const b of boxes) {
    if (!b.bias) seat.push(b);
    else if (b.x + b.w / 2 + b.y + b.d / 2 > centre) front.push(b);
    else behind.push(b);
  }
  const out: [number, Box[]][] = [[-0.12, [...behind, ...seat]]];
  if (front.length) out.push([0.12, front]);
  return out;
}

export function clearArtCache() {
  for (const c of ctxCache.values()) c.destroy();
  ctxCache.clear();
  artCache.clear();
}
