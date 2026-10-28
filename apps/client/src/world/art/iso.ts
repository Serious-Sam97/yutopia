import { TILE_H, TILE_W } from "@yutopia/shared";

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
