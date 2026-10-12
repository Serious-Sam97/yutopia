import { TILE_H, TILE_W } from "@yutopia/shared";
import type { Graphics } from "pixi.js";
import { shade } from "./palette";

// A furniture piece is a list of axis-aligned boxes in object-local tile units
// (x, y footprint; z/h in pixels). Boxes are rotated with the object and clipped
// into depth slices, so long things (sofas, tables) sort correctly with avatars.
export interface Box {
  x: number;
  y: number;
  w: number;
  d: number;
  z: number;
  h: number;
  color: number;
  // Face colours by world side (s = +y, e = +x, n = -y, w = -x). They rotate
  // with the object; only s (down-left) and e (down-right) are ever visible.
  faces?: Partial<Record<"n" | "s" | "e" | "w", number>>;
  top?: number;
  glow?: boolean; // emissive: not darkened at night (screens, VFDs)
  outline?: boolean;
  bias?: number; // depth nudge for parts that must draw in front/behind a sitter
}

// The world is drawn this much larger than the people standing in it: the camera
// zooms in by WORLD_SCALE and people (+ Vortex) are scaled by PERSON, so a person
// keeps the same size on screen while rooms and furniture get roomier around them.
export const WORLD_SCALE = 1.3;
export const PERSON = 1 / WORLD_SCALE;

const HW = TILE_W / 2;
const HH = TILE_H / 2;

export function P(x: number, y: number, z = 0): [number, number] {
  return [(x - y) * HW, (x + y) * HH - z];
}

export function rotateBoxes(boxes: Box[], w: number, h: number, rot: number): Box[] {
  let out = boxes;
  let W = w;
  let H = h;
  for (let i = 0; i < (rot & 3); i++) {
    // 90° clockwise in world space: (x, y) → (H - y, x)
    out = out.map((b) => ({
      ...b,
      x: H - (b.y + b.d),
      y: b.x,
      w: b.d,
      d: b.w,
      faces: b.faces && { s: b.faces.e, w: b.faces.s, n: b.faces.w, e: b.faces.n },
    }));
    [W, H] = [H, W];
  }
  return out;
}

export interface Clip {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

const EPS = 0.02;

// Draws the visible faces of a box (top, +y face, +x face), clipped to a slice.
// Faces on a cut edge are skipped so slices join seamlessly.
export function drawBox(g: Graphics, b: Box, clip: Clip | null = null, ox = 0, oy = 0, outline = 0x1a120c) {
  let x0 = b.x;
  let x1 = b.x + b.w;
  let y0 = b.y;
  let y1 = b.y + b.d;
  if (clip) {
    x0 = Math.max(x0, clip.x0 - EPS);
    x1 = Math.min(x1, clip.x1 + EPS);
    y0 = Math.max(y0, clip.y0 - EPS);
    y1 = Math.min(y1, clip.y1 + EPS);
    if (x1 <= x0 || y1 <= y0) return;
  }
  const trueRight = !clip || b.x + b.w <= clip.x1 + EPS;
  const trueLeft = !clip || b.y + b.d <= clip.y1 + EPS;
  const z0 = b.z;
  const z1 = b.z + b.h;
  const top = b.top ?? b.color;
  const left = b.faces?.s ?? shade(b.color, 0.8);
  const right = b.faces?.e ?? shade(b.color, 0.64);
  const pt = (x: number, y: number, z: number) => {
    const [sx, sy] = P(x, y, z);
    return [sx - ox, sy - oy] as [number, number];
  };
  if (b.h > 0 && trueLeft) {
    const a = pt(x0, y1, z0);
    const c = pt(x1, y1, z0);
    const d = pt(x1, y1, z1);
    const e = pt(x0, y1, z1);
    g.poly([...a, ...c, ...d, ...e]).fill(left);
  }
  if (b.h > 0 && trueRight) {
    const a = pt(x1, y1, z0);
    const c = pt(x1, y0, z0);
    const d = pt(x1, y0, z1);
    const e = pt(x1, y1, z1);
    g.poly([...a, ...c, ...d, ...e]).fill(right);
  }
  const n = pt(x0, y0, z1);
  const e = pt(x1, y0, z1);
  const s = pt(x1, y1, z1);
  const w = pt(x0, y1, z1);
  g.poly([...n, ...e, ...s, ...w]).fill(top);
  if (b.outline !== false) {
    // ink edges only on true outer edges
    const stroke = { width: 1, color: outline, alpha: 0.28 };
    if (trueLeft) {
      g.moveTo(...w)
        .lineTo(...s)
        .stroke(stroke);
      if (b.h > 0)
        g.moveTo(...pt(x0, y1, z0))
          .lineTo(...pt(x1, y1, z0))
          .stroke(stroke);
    }
    if (trueRight) {
      g.moveTo(...s)
        .lineTo(...e)
        .stroke(stroke);
      if (b.h > 0)
        g.moveTo(...pt(x1, y1, z0))
          .lineTo(...pt(x1, y0, z0))
          .stroke(stroke);
    }
    if (trueLeft && trueRight && b.h > 0)
      g.moveTo(...s)
        .lineTo(...pt(x1, y1, z0))
        .stroke(stroke);
  }
}

export function diamond(g: Graphics, x: number, y: number, w: number, d: number, z: number, color: number, alpha = 1) {
  g.poly([...P(x, y, z), ...P(x + w, y, z), ...P(x + w, y + d, z), ...P(x, y + d, z)]).fill({ color, alpha });
}
