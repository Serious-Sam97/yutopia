import {
  blocksLight,
  CATALOG,
  doorEdge,
  entry,
  hWall,
  isFloor,
  isWindow,
  type MapDef,
  tileAt,
  vWall,
  type WorldObjectDef,
} from "@yutopia/shared";
import type { RGB } from "./daylight";

// Baked light: every light source is ray-marched across the tile grid (walls
// and shut doors block it), with a soft falloff, into an RGB buffer in plan
// space (PX per tile). The engine adds the ambient light of the hour and
// multiplies the floor by it, and tints walls, items and people with the same
// values at their position — so light lands on things instead of floating.

export const PX = 8; // light samples per tile
const HEIGHT = 0.35; // lights sit a little above the floor (no hot pinpoint)

export interface LightSource {
  x: number; // tiles
  y: number;
  color: number;
  radius: number;
  intensity: number;
}

const rgbOf = (c: number): RGB => [((c >> 16) & 255) / 255, ((c >> 8) & 255) / 255, (c & 255) / 255];

// local rot-0 point → world, same turn as the item art (90° clockwise steps)
function place(o: WorldObjectDef, lx: number, ly: number): [number, number] {
  const e = entry(o.kind);
  let x = lx;
  let y = ly;
  let W = e.w;
  let H = e.h;
  const rot = e.wall ? 0 : (o.rot ?? 0) & 3;
  for (let i = 0; i < rot; i++) {
    [x, y] = [H - y, x];
    [W, H] = [H, W];
  }
  return [o.x + x, o.y + y];
}

// Light-giving things beyond the catalog's lamps: screens and displays glow a little.
const SCREENS: Record<string, { at: [number, number][]; color: number; radius: number; intensity: number }> = {
  desk: {
    at: [
      [0.48, 0.1],
      [1.52, 0.1],
    ],
    color: 0xa8b98a,
    radius: 1.7,
    intensity: 0.2,
  },
  board_wall: {
    at: [
      [0.7, 0.6],
      [1.5, 0.6],
      [2.3, 0.6],
    ],
    color: 0xffa630,
    radius: 1.9,
    intensity: 0.14,
  },
  screen_wall: {
    at: [
      [1, 0.6],
      [2, 0.6],
      [3, 0.6],
    ],
    color: 0xd8c8a8,
    radius: 2.2,
    intensity: 0.12,
  },
  arcade: { at: [[0.5, 1.1]], color: 0xffa630, radius: 1.8, intensity: 0.3 },
  meeting_table: {
    at: [
      [1.6, 1],
      [3, 1],
      [4.4, 1],
    ],
    color: 0xffa630,
    radius: 1.6,
    intensity: 0.14,
  },
  standup_mat: { at: [[2, 2]], color: 0xffb35c, radius: 2.4, intensity: 0.12 },
};

export function lightSources(objects: WorldObjectDef[]): LightSource[] {
  const out: LightSource[] = [];
  for (const o of objects) {
    const c = (CATALOG as Record<string, { light?: { color: number; radius: number; intensity: number } }>)[o.kind]
      ?.light;
    if (c) {
      if (o.kind === "lamp" && o.props?.on === false) continue;
      if (o.kind === "radio" && !o.props?.on) continue;
      const e = entry(o.kind);
      const [x, y] = place(o, e.w / 2, e.h / 2 + (e.wall ? 0.6 : 0));
      out.push({ x, y, color: c.color, radius: c.radius, intensity: c.intensity });
    }
    const s = SCREENS[o.kind];
    if (s)
      for (const [lx, ly] of s.at) {
        const [x, y] = place(o, lx, ly);
        out.push({ x, y, color: s.color, radius: s.radius, intensity: s.intensity });
      }
  }
  return out;
}

export class LightMap {
  readonly w: number; // samples
  readonly h: number;
  readonly light: Float32Array; // r, g, b per sample (lights only, no ambient)
  // daylight through windows, as a single strength per sample: coloured by the
  // hour (sun / moon) when composited, so the time of day never needs a re-bake
  readonly win: Float32Array;
  private block: Uint8Array; // per tile: 1 = blocks light (no floor)
  private hBlk: Uint8Array; // walls on north edges that block light (glass and half walls don't)
  private vBlk: Uint8Array; // … on west edges

  constructor(
    readonly map: MapDef,
    objects: WorldObjectDef[],
  ) {
    const W = map.width;
    const H = map.height;
    this.w = W * PX;
    this.h = H * PX;
    this.light = new Float32Array(this.w * this.h * 3);
    this.win = new Float32Array(this.w * this.h);
    this.block = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (!isFloor(tileAt(map, x, y))) this.block[y * W + x] = 1;
    this.hBlk = new Uint8Array((H + 1) * W);
    this.vBlk = new Uint8Array(H * (W + 1));
    for (let y = 0; y <= H; y++)
      for (let x = 0; x < W; x++) if (blocksLight(hWall(map, x, y))) this.hBlk[y * W + x] = 1;
    for (let y = 0; y < H; y++)
      for (let x = 0; x <= W; x++) if (blocksLight(vWall(map, x, y))) this.vBlk[y * (W + 1) + x] = 1;
    for (const o of objects) {
      if (o.kind !== "door") continue;
      const st = String(o.props?.state ?? "open");
      if (!((st === "closed" || st === "locked") && !o.props?.passing)) continue;
      const e = doorEdge(o);
      if (e.dir === "h") this.hBlk[e.y * W + e.x] = 1;
      else this.vBlk[e.y * (W + 1) + e.x] = 1;
    }
    for (const s of lightSources(objects)) this.add(s);
    // windows: a soft pool of light just inside each pane
    const floor = (x: number, y: number) => isFloor(tileAt(map, x, y));
    for (let y = 0; y <= H; y++)
      for (let x = 0; x < W; x++)
        if (isWindow(hWall(map, x, y))) {
          const inY = floor(x, y) ? y + 0.45 : y - 0.45;
          this.add({ x: x + 0.5, y: inY, color: 0xffffff, radius: 4.2, intensity: 0.9 }, this.win);
        }
    for (let y = 0; y < H; y++)
      for (let x = 0; x <= W; x++)
        if (isWindow(vWall(map, x, y))) {
          const inX = floor(x, y) ? x + 0.45 : x - 0.45;
          this.add({ x: inX, y: y + 0.5, color: 0xffffff, radius: 4.2, intensity: 0.9 }, this.win);
        }
  }

  private blocked(x: number, y: number): boolean {
    const tx = Math.floor(x);
    const ty = Math.floor(y);
    if (tx < 0 || ty < 0 || tx >= this.map.width || ty >= this.map.height) return true;
    return this.block[ty * this.map.width + tx] === 1;
  }

  // A wall on the edge between two neighbouring tiles (diagonal steps: both ways round must be shut).
  private wallBetween(ax: number, ay: number, bx: number, by: number): boolean {
    const W = this.map.width;
    const h = (x: number, y: number) => this.hBlk[y * W + x] === 1;
    const v = (x: number, y: number) => this.vBlk[y * (W + 1) + x] === 1;
    const step = (x0: number, y0: number, x1: number, y1: number) =>
      x1 > x0 ? v(x1, y0) : x1 < x0 ? v(x0, y0) : y1 > y0 ? h(x0, y1) : y1 < y0 ? h(x0, y0) : false;
    if (ax === bx || ay === by) return step(ax, ay, bx, by);
    return (step(ax, ay, bx, ay) || step(bx, ay, bx, by)) && (step(ax, ay, ax, by) || step(ax, by, bx, by));
  }

  // Is the straight line from the light to (x, y) clear of walls?
  private visible(s: LightSource, x: number, y: number): boolean {
    const dx = x - s.x;
    const dy = y - s.y;
    const d = Math.hypot(dx, dy);
    const steps = Math.max(1, Math.ceil(d * 6));
    let tx = Math.floor(s.x);
    let ty = Math.floor(s.y);
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const px = s.x + dx * t;
      const py = s.y + dy * t;
      const nx = Math.floor(px);
      const ny = Math.floor(py);
      if (nx !== tx || ny !== ty) {
        if (this.wallBetween(tx, ty, nx, ny)) return false;
        // no floor in between (outside the building): blocked, except the end point
        if (i < steps && this.blocked(px, py)) return false;
        tx = nx;
        ty = ny;
      }
    }
    return true;
  }

  private add(s: LightSource, into?: Float32Array) {
    const [r, g, b] = rgbOf(s.color);
    const R = s.radius;
    const x0 = Math.max(0, Math.floor((s.x - R) * PX));
    const x1 = Math.min(this.w - 1, Math.ceil((s.x + R) * PX));
    const y0 = Math.max(0, Math.floor((s.y - R) * PX));
    const y1 = Math.min(this.h - 1, Math.ceil((s.y + R) * PX));
    for (let py = y0; py <= y1; py++)
      for (let px = x0; px <= x1; px++) {
        const x = (px + 0.5) / PX;
        const y = (py + 0.5) / PX;
        const d = Math.hypot(x - s.x, y - s.y, HEIGHT);
        if (d >= R) continue;
        if (!this.visible(s, x, y)) continue;
        const f = (1 - (d / R) ** 2) ** 2 * s.intensity;
        if (into) {
          into[py * this.w + px] += f;
          continue;
        }
        const i = (py * this.w + px) * 3;
        this.light[i] += r * f;
        this.light[i + 1] += g * f;
        this.light[i + 2] += b * f;
      }
  }

  // ambient + light, clamped to 1, as a canvas (plan space, PX per tile)
  composite(ambient: RGB, win: RGB, into?: HTMLCanvasElement): HTMLCanvasElement {
    const c = into ?? document.createElement("canvas");
    c.width = this.w;
    c.height = this.h;
    const g = c.getContext("2d") as CanvasRenderingContext2D;
    const img = g.createImageData(this.w, this.h);
    const L = this.light;
    const Wn = this.win;
    for (let i = 0, j = 0, k = 0; i < L.length; i += 3, j += 4, k++) {
      const w = Math.min(1, Wn[k]);
      img.data[j] = Math.min(255, (ambient[0] + L[i] + win[0] * w) * 255);
      img.data[j + 1] = Math.min(255, (ambient[1] + L[i + 1] + win[1] * w) * 255);
      img.data[j + 2] = Math.min(255, (ambient[2] + L[i + 2] + win[2] * w) * 255);
      img.data[j + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    return c;
  }

  // Light at a world point (bilinear), ambient included, as a 0xRRGGBB tint.
  tintAt(x: number, y: number, ambient: RGB, win: RGB = [0, 0, 0]): number {
    const fx = Math.max(0, Math.min(this.w - 1.001, x * PX - 0.5));
    const fy = Math.max(0, Math.min(this.h - 1.001, y * PX - 0.5));
    const ix = Math.floor(fx);
    const iy = Math.floor(fy);
    const tx = fx - ix;
    const ty = fy - iy;
    const L = this.light;
    const at = (xx: number, yy: number, k: number) => L[(yy * this.w + xx) * 3 + k];
    const Wn = this.win;
    const wat = (xx: number, yy: number) => Wn[yy * this.w + xx];
    const w = Math.min(
      1,
      wat(ix, iy) * (1 - tx) * (1 - ty) +
        wat(ix + 1, iy) * tx * (1 - ty) +
        wat(ix, iy + 1) * (1 - tx) * ty +
        wat(ix + 1, iy + 1) * tx * ty,
    );
    let out = 0;
    for (let k = 0; k < 3; k++) {
      const v =
        at(ix, iy, k) * (1 - tx) * (1 - ty) +
        at(ix + 1, iy, k) * tx * (1 - ty) +
        at(ix, iy + 1, k) * (1 - tx) * ty +
        at(ix + 1, iy + 1, k) * tx * ty;
      out = (out << 8) | Math.round(Math.min(1, ambient[k] + v + win[k] * w) * 255);
    }
    return out;
  }
}

// What changes the light map: walls (the map), light-giving things, doors.
export function affectsLight(o: WorldObjectDef): boolean {
  return o.kind === "door" || o.kind in SCREENS || !!(CATALOG as Record<string, { light?: unknown }>)[o.kind]?.light;
}
