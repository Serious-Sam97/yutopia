// 2:1 dimetric projection. World coordinates are tile units (floats); screen is
// pixels relative to the map origin. +x runs down-right, +y runs down-left.
export const TILE_W = 64;
export const TILE_H = 32;

export interface Point {
  x: number;
  y: number;
}

export function toScreen(x: number, y: number): Point {
  return { x: ((x - y) * TILE_W) / 2, y: ((x + y) * TILE_H) / 2 };
}

export function toWorld(sx: number, sy: number): Point {
  const a = sx / (TILE_W / 2);
  const b = sy / (TILE_H / 2);
  return { x: (a + b) / 2, y: (b - a) / 2 };
}

// Painter's order: things further down-screen draw later.
export function depthOf(x: number, y: number): number {
  return x + y;
}

// 8 facings, clockwise from screen-down (south): S, SW, W, NW, N, NE, E, SE.
export const DIRS = ["S", "SW", "W", "NW", "N", "NE", "E", "SE"] as const;
export type Dir = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;

// Facing from a world-space delta, judged by how it looks on screen.
export function dirFromDelta(dx: number, dy: number, fallback: Dir = 0): Dir {
  const s = toScreen(dx, dy);
  if (Math.abs(s.x) < 1e-6 && Math.abs(s.y) < 1e-6) return fallback;
  // angle 0 = screen-down, growing clockwise (towards screen-left)
  const ang = Math.atan2(-s.x, s.y);
  const idx = Math.round(ang / (Math.PI / 4));
  return (((idx % 8) + 8) % 8) as Dir;
}

// Screen-relative input (W = up on screen) to a normalized world delta.
export function screenInputToWorld(ix: number, iy: number): Point {
  if (ix === 0 && iy === 0) return { x: 0, y: 0 };
  // screen right = (+1,-1) world, screen down = (+1,+1) world
  const wx = ix + iy;
  const wy = iy - ix;
  const len = Math.hypot(wx, wy);
  return { x: wx / len, y: wy / len };
}
