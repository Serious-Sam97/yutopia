import {
  blocksLight,
  CATALOG,
  doorBlocksLight,
  type Edge,
  entry,
  hangOf,
  hWall,
  isFloor,
  isOpening,
  isWindow,
  isWindowKind,
  type MapDef,
  openingEdges,
  rotOf,
  tileAt,
  topCentre,
  variantOf,
  vWall,
  type WorldObjectDef,
} from "@yutopia/shared";
import type { RGB } from "./daylight";
import { seedOf } from "./items/kit";

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
  h?: number; // how high it hangs (tiles; the 3D view's lamps), when it's not a room lamp
}

const rgbOf = (c: number): RGB => [((c >> 16) & 255) / 255, ((c >> 8) & 255) / 255, (c & 255) / 255];

// local rot-0 point → world, same turn as the item art (90° clockwise steps)
function place(o: WorldObjectDef, lx: number, ly: number): [number, number] {
  const e = entry(o.kind);
  let x = lx;
  let y = ly;
  let W = e.w;
  let H = e.h;
  const rot = rotOf(o) & 3;
  for (let i = 0; i < rot; i++) {
    [x, y] = [H - y, x];
    [W, H] = [H, W];
  }
  // (wall items: where their drawing is along the wall)
  if (e.wall) {
    const h = hangOf(o);
    return [h.ax + x, h.ay + y];
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

// A neon sign's tubes (items/home.ts NEON), as light.
const NEON_LIGHT = [0xffb35c, 0xff5fa8, 0x5ff0ff];
// On a desk: a desk lamp's warm pool (switched like a lamp), a monitor's glow.
const TOPS: Record<string, { color: number; radius: number; intensity: number; switched?: boolean }> = {
  desklamp: { color: 0xffc070, radius: 2.2, intensity: 0.42, switched: true },
  monitor: { color: 0xb8c9d8, radius: 1.5, intensity: 0.2 },
};

// The colour a lamp gives: its shade's paint (props.color) over a warm bulb.
function shadeLight(props: Record<string, unknown> | undefined, bulb: number): number {
  const c = props?.color;
  if (typeof c !== "string" || !/^#[0-9a-f]{6}$/i.test(c)) return bulb;
  const p = Number.parseInt(c.slice(1), 16);
  const mix = (sh: number) => {
    const a = (bulb >> sh) & 255;
    const b = (p >> sh) & 255;
    // a bright, tinted light: mostly the bulb, coloured by the shade
    return Math.min(255, Math.round(a * 0.55 + b * 0.45 + 30));
  };
  return (mix(16) << 16) | (mix(8) << 8) | mix(0);
}

export function lightSources(objects: WorldObjectDef[]): LightSource[] {
  const out: LightSource[] = [];
  for (const o of objects) {
    const c = (CATALOG as Record<string, { light?: { color: number; radius: number; intensity: number } }>)[o.kind]
      ?.light;
    if (c) {
      if (o.kind === "lamp" && o.props?.on === false) continue;
      if (o.kind === "radio" && !o.props?.on) continue;
      const e = entry(o.kind);
      // (a lamp post's light falls from its head, out at the end of its arm)
      const [x, y] = o.kind === "lamp_post" ? place(o, 2.25, 0.5) : place(o, e.w / 2, e.h / 2 + (e.wall ? 0.6 : 0));
      const color =
        o.kind === "neon"
          ? NEON_LIGHT[variantOf(o, seedOf(o.id))]
          : o.kind === "lamp"
            ? shadeLight(o.props, c.color)
            : c.color;
      // (a lot's lamp post: well up its pole, over the cars and people it lights
      // — its head, at ~8.8, is too high for a point light to reach them)
      const h = o.kind === "lamp_post" ? 3.3 : undefined;
      out.push({ x, y, color, radius: c.radius, intensity: c.intensity, ...(h ? { h } : {}) });
    }
    const t = o.kind === "tabletop" ? TOPS[String(o.props?.d ?? "")] : undefined;
    if (t && !(t.switched && o.props?.on === false)) {
      const at = topCentre(o);
      out.push({ x: at.x, y: at.y + 0.3, color: t.color, radius: t.radius, intensity: t.intensity });
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

/** A car's headlights: where they shine from (the middle of its nose) and which
 *  way, for the 3D view's beams on the ground at night. */
export function headlights(objects: WorldObjectDef[]): { x: number; y: number; dx: number; dy: number }[] {
  const out: { x: number; y: number; dx: number; dy: number }[] = [];
  for (const o of objects) {
    if (o.kind !== "car") continue;
    // (as the drawing: its nose to −x at rot 0, nudged in its bay by dx / dz)
    const ox = Math.max(-0.4, Math.min(0.4, Number(o.props?.dx) || 0));
    const oy = Math.max(-0.4, Math.min(0.4, Number(o.props?.dz) || 0));
    const [x, y] = place(o, ox, 1 + oy);
    const [bx, by] = place(o, 1 + ox, 1 + oy);
    out.push({ x, y, dx: x - bx, dy: y - by });
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
  // per sample: under the open sky (the lot's asphalt and concrete), which takes
  // the outside's ambient (in the dark: next to none) rather than the rooms'
  readonly open: Uint8Array;
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
    this.open = new Uint8Array(this.w * this.h);
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const ch = tileAt(map, x, y);
        if (ch !== "a" && ch !== "c") continue;
        for (let sy = 0; sy < PX; sy++)
          this.open.fill(1, (y * PX + sy) * this.w + x * PX, (y * PX + sy) * this.w + x * PX + PX);
      }
    this.block = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (!isFloor(tileAt(map, x, y))) this.block[y * W + x] = 1;
    this.hBlk = new Uint8Array((H + 1) * W);
    this.vBlk = new Uint8Array(H * (W + 1));
    for (let y = 0; y <= H; y++)
      for (let x = 0; x < W; x++) if (blocksLight(hWall(map, x, y))) this.hBlk[y * W + x] = 1;
    for (let y = 0; y < H; y++)
      for (let x = 0; x <= W; x++) if (blocksLight(vWall(map, x, y))) this.vBlk[y * (W + 1) + x] = 1;
    // doors and windows in walls (shared openings.ts): an open door and a
    // window's glass let light through, a shut door doesn't
    const floor = (x: number, y: number) => isFloor(tileAt(map, x, y));
    const glazed: Edge[] = [];
    for (const o of objects) {
      if (!isOpening(o.kind)) continue;
      const shut = doorBlocksLight(o);
      for (const e of openingEdges(o)) {
        if (e.dir === "h") this.hBlk[e.y * W + e.x] = shut ? 1 : 0;
        else this.vBlk[e.y * (W + 1) + e.x] = shut ? 1 : 0;
        if (isWindowKind(o.kind)) glazed.push(e);
      }
    }
    for (const s of lightSources(objects)) this.add(s);
    // windows to the outside: a soft pool of light just inside each pane
    for (const e of glazed) {
      const [a, b] = e.dir === "h" ? [floor(e.x, e.y - 1), floor(e.x, e.y)] : [floor(e.x - 1, e.y), floor(e.x, e.y)];
      if (a === b) continue; // between two rooms: no daylight of its own
      const inn = b ? 0.45 : -0.45;
      const at = e.dir === "h" ? { x: e.x + 0.5, y: e.y + inn } : { x: e.x + inn, y: e.y + 0.5 };
      this.add({ ...at, color: 0xffffff, radius: 4.2, intensity: 0.9 }, this.win);
    }
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

  /** Does a light reach (x, y) — no wall or shut door in the way? (the 3D view's lamps) */
  reaches(s: LightSource, x: number, y: number): boolean {
    if (this.blocked(x, y)) return false;
    return this.visible(s, x, y);
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

  // ambient + light, clamped to 1, as a canvas (plan space, PX per tile); `out`:
  // the ambient under the open sky (the rooms' when not given)
  composite(ambient: RGB, win: RGB, into?: HTMLCanvasElement, out: RGB = ambient): HTMLCanvasElement {
    const c = into ?? document.createElement("canvas");
    c.width = this.w;
    c.height = this.h;
    const g = c.getContext("2d") as CanvasRenderingContext2D;
    const img = g.createImageData(this.w, this.h);
    const L = this.light;
    const Wn = this.win;
    const O = this.open;
    for (let i = 0, j = 0, k = 0; i < L.length; i += 3, j += 4, k++) {
      const w = Math.min(1, Wn[k]);
      const a = O[k] ? out : ambient;
      img.data[j] = Math.min(255, (a[0] + L[i] + win[0] * w) * 255);
      img.data[j + 1] = Math.min(255, (a[1] + L[i + 1] + win[1] * w) * 255);
      img.data[j + 2] = Math.min(255, (a[2] + L[i + 2] + win[2] * w) * 255);
      img.data[j + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    return c;
  }

  // Light at a world point (bilinear), ambient included (`out` under the open sky), as a 0xRRGGBB tint.
  tintAt(x: number, y: number, ambient: RGB, win: RGB = [0, 0, 0], out: RGB = ambient): number {
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
    const o = this.open[Math.round(fy) * this.w + Math.round(fx)]; // (the nearest sample's)
    let rgb = 0;
    for (let k = 0; k < 3; k++) {
      const v =
        at(ix, iy, k) * (1 - tx) * (1 - ty) +
        at(ix + 1, iy, k) * tx * (1 - ty) +
        at(ix, iy + 1, k) * (1 - tx) * ty +
        at(ix + 1, iy + 1, k) * tx * ty;
      rgb = (rgb << 8) | Math.round(Math.min(1, (o ? out : ambient)[k] + v + win[k] * w) * 255);
    }
    return rgb;
  }
}

// What changes the light map: walls (the map), light-giving things, doors.
export function affectsLight(o: WorldObjectDef): boolean {
  return (
    isOpening(o.kind) ||
    o.kind in SCREENS ||
    (o.kind === "tabletop" && String(o.props?.d) in TOPS) ||
    !!(CATALOG as Record<string, { light?: unknown }>)[o.kind]?.light
  );
}

// ── kept per floor ──────────────────────────────────────────────────────────
// A floor's bake, kept (a few): going back to a floor, or the other view
// lighting the same one, doesn't ray-march it again. Keyed by everything that
// lights it or stands in the light's way.
const baked = new Map<string, LightMap>();
export function lightSig(map: MapDef, objects: WorldObjectDef[]): string {
  const doors = objects
    .filter((o) => isOpening(o.kind))
    .map((o) => `${o.kind},${o.x},${o.y},${o.rot ?? 0},${o.props?.state ?? ""}`)
    .join(";");
  return `${map.key}|${map.floor ?? ""}|${map.width}x${map.height}|${map.tiles.join("")}|${map.hWalls.join("")}|${map.vWalls.join("")}|${JSON.stringify(lightSources(objects))}|${doors}`;
}
export function lightMapFor(map: MapDef, objects: WorldObjectDef[], sig = lightSig(map, objects)): LightMap {
  let lm = baked.get(sig);
  if (lm) {
    baked.delete(sig);
    baked.set(sig, lm);
    return lm;
  }
  lm = new LightMap(map, objects);
  baked.set(sig, lm);
  if (baked.size > 8) baked.delete(baked.keys().next().value as string);
  return lm;
}
