import { entry, footprint, isFloor, type MapDef, tileAt, type WorldObjectDef } from "@yutopia/shared";
import { Graphics, type GraphicsContext } from "pixi.js";
import { piece, STUB_H, WALL_H } from "./furniture";
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

import { C, hash2, mix, shade } from "./palette";

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
  if (!illustrated(o.kind)) return null;
  const rot = entry(o.kind).wall ? 0 : (o.rot ?? 0);
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

// ── walls ──────────────────────────────────────────────────────────────────
export function wallParts(map: MapDef): Part[] {
  const parts: Part[] = [];
  const floor = (x: number, y: number) => isFloor(tileAt(map, x, y));
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      if (tileAt(map, x, y) !== "#") continue;
      const faceS = floor(x, y + 1);
      const faceE = floor(x + 1, y);
      const tall = faceS || faceE || (floor(x + 1, y + 1) && !floor(x - 1, y) && !floor(x, y - 1));
      const key = `wall|${tall ? 1 : 0}|${faceS ? 1 : 0}|${faceE ? 1 : 0}|${(x * 7 + y * 3) % 5}`;
      const ctx = cached(key, (g) => {
        if (!tall) {
          drawBox(g, { x: 0, y: 0, w: 1, d: 1, z: 0, h: STUB_H, color: C.walnut, top: C.walnutLight });
          return;
        }
        const panel = 30;
        const sFace = faceS ? C.walnut : C.walnutDark;
        const eFace = faceE ? shade(C.walnut, 0.85) : C.walnutDark;
        drawBox(g, {
          x: 0,
          y: 0,
          w: 1,
          d: 1,
          z: 0,
          h: panel,
          color: C.walnut,
          faces: { s: sFace, e: eFace },
          outline: false,
        });
        drawBox(g, {
          x: 0,
          y: 0,
          w: 1,
          d: 1,
          z: panel,
          h: WALL_H - panel,
          color: C.cream,
          faces: { s: faceS ? C.cream : C.creamDark, e: faceE ? shade(C.cream, 0.88) : C.creamDark },
          outline: false,
        });
        // dado rail + pinstripes
        if (faceS) {
          drawBox(g, { x: 0, y: 0.98, w: 1, d: 0.04, z: panel - 1, h: 3, color: C.walnutDark, outline: false });
          for (const sx of [0.25, 0.75])
            drawBox(g, {
              x: sx,
              y: 0.995,
              w: 0.015,
              d: 0.01,
              z: panel + 4,
              h: WALL_H - panel - 10,
              color: C.creamDark,
              outline: false,
            });
        }
        if (faceE) {
          drawBox(g, { x: 0.98, y: 0, w: 0.04, d: 1, z: panel - 1, h: 3, color: C.walnutDark, outline: false });
          for (const sy of [0.25, 0.75])
            drawBox(g, {
              x: 0.995,
              y: sy,
              w: 0.01,
              d: 0.015,
              z: panel + 4,
              h: WALL_H - panel - 10,
              color: shade(C.creamDark, 0.9),
              outline: false,
            });
        }
        drawBox(g, { x: -0.02, y: -0.02, w: 1.04, d: 1.04, z: WALL_H, h: 3, color: C.walnutDark, top: C.walnut });
      });
      const [sx, sy] = P(x, y);
      parts.push({ ctx, x: sx, y: sy, key: x + y + 1 - 0.02, tall, wx: x, wy: y });
    }
  }
  return parts;
}

// ── furniture ──────────────────────────────────────────────────────────────
export function objectParts(o: WorldObjectDef): Part[] {
  const e = entry(o.kind);
  if (piece(o.kind, o.props ?? {}, o.id).flat) return [];
  // doors along y use the mirrored turn so their panel faces the camera (+x side)
  const rot = e.wall ? 0 : o.kind === "door" && (o.rot ?? 0) % 2 === 1 ? 3 : (o.rot ?? 0);
  const { w, h } = footprint(o.kind, rot);
  const p = piece(o.kind, o.props ?? {}, o.id);
  const boxes = rotateBoxes(p.boxes, e.w, e.h, rot);
  // Slice along the long axis so every slice is at most 1 tile longer than wide.
  const slices: Clip[] = [];
  if (w - h >= 2) for (let i = 0; i < w; i++) slices.push({ x0: i, x1: i + 1, y0: -1, y1: h + 1 });
  else if (h - w >= 2) for (let i = 0; i < h; i++) slices.push({ x0: -1, x1: w + 1, y0: i, y1: i + 1 });
  else slices.push({ x0: -1, x1: w + 1, y0: -1, y1: h + 1 });
  const out: Part[] = [];
  const propsKey = JSON.stringify(o.props ?? {});
  slices.forEach((clip, i) => {
    const groups: [number, Box[]][] = p.seat ? seatGroups(boxes, w, h) : [[0, boxes]];
    for (const [bias, list] of groups) {
      const cx = Math.max(0, clip.x0);
      const cy = Math.max(0, clip.y0);
      const key = `${o.kind}|${rot}|${i}|${bias}|${o.id.startsWith("b-") ? "" : o.id}|${propsKey}`;
      const ctx = cached(key, (g) => {
        const [ox, oy] = P(cx, cy);
        for (const b of list) drawBox(g, b, slices.length > 1 ? clip : null, ox, oy);
        // organic extras (leaves, poles) — only 1×1 pieces have them, so no offset
        if (p.custom && i === 0 && bias <= 0) p.custom(g);
      });
      const sw = slices.length > 1 ? Math.min(1, w) : w;
      const sh = slices.length > 1 ? Math.min(1, h) : h;
      const wx = o.x + cx;
      const wy = o.y + cy;
      const centerKey = wx + Math.min(sw, w - cx) / 2 + wy + Math.min(sh, h - cy) / 2;
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
      // wall items sort per tile, just in front of the wall tile behind them
      out.push({ ctx, x: sx, y: sy, key: (e.wall ? wx + o.y + 0.02 : centerKey) + bias, wx, wy, objectId: o.id, art });
    }
  });
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
