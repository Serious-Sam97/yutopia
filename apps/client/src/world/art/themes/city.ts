import { Container, Graphics, Sprite, Texture, TilingSprite } from "pixi.js";
import type { Daylight } from "../daylight";
import { canvas, css, keyed, lerpHex, outerEdges, rng, type ThemeView } from "./common";

// City: the studio is a floor high up in an 80s tower. Around it a skyline
// (three parallax layers whose windows light up at night), a sky that follows
// the local clock (sun or moon, stars, slow clouds); below the floor the
// tower's stone facade drops away. Warm palette, no neon.

// hour, sky top, sky horizon, city tint
const SKY: [number, string, string, string][] = [
  [0, "#0c0f26", "#272444", "#3a3d62"],
  [5, "#121530", "#2f2a4c", "#3e4066"],
  [6.5, "#3d3d6c", "#f0a07c", "#9a8aa2"],
  [8, "#7aa2c4", "#f2dcbc", "#e2dbd8"],
  [10, "#7fa9c8", "#efe0c4", "#ffffff"],
  [16, "#7ea4c2", "#f1dcb8", "#fff8f0"],
  [17.5, "#6a7ca8", "#ffb35c", "#ffd9b0"],
  [19, "#3b305c", "#e2774e", "#b88a98"],
  [20.5, "#16152e", "#3c2c4a", "#4a4a72"],
  [24, "#0c0f26", "#272444", "#3a3d62"],
];

const LAYER_W = 1600;
interface LayerSpec {
  seed: number;
  base: string;
  hi: string;
  min: number;
  max: number;
  depth: number;
  windows: number;
  scale: number;
}
const LAYERS: LayerSpec[] = [
  { seed: 11, base: "#b7b0c4", hi: "#c9c2d2", min: 40, max: 150, depth: 260, windows: 0.25, scale: 0.7 },
  { seed: 23, base: "#8d8496", hi: "#a39aaa", min: 60, max: 210, depth: 420, windows: 0.32, scale: 0.85 },
  { seed: 37, base: "#5f5666", hi: "#776d7e", min: 90, max: 280, depth: 700, windows: 0.4, scale: 1 },
];

function skyline(L: LayerSpec): { body: HTMLCanvasElement; lights: HTMLCanvasElement; height: number } {
  const H = L.max + 60 + L.depth;
  const top = L.max + 60;
  const body = canvas(LAYER_W, H);
  const lights = canvas(LAYER_W, H);
  const r = rng(L.seed);
  body.g.fillStyle = L.base;
  body.g.fillRect(0, top - 8, LAYER_W, H - top + 8);
  let x = -20;
  while (x < LAYER_W) {
    const w = Math.round(28 + r() * 70 * L.scale);
    const h = Math.round(L.min + r() ** 1.6 * (L.max - L.min));
    const y = top - h;
    const g = body.g;
    g.fillStyle = L.base;
    if (r() < 0.3) {
      g.fillRect(x, y + 14, w, h);
      g.fillRect(x + w * 0.2, y, w * 0.6, 16);
    } else g.fillRect(x, y, w, h);
    g.fillStyle = L.hi;
    g.fillRect(x, y + 4, Math.max(3, w * 0.18), h);
    const d = r();
    g.fillStyle = L.base;
    if (d < 0.18) g.fillRect(x + w * 0.6, y - 26, 2, 26);
    else if (d < 0.3) {
      g.fillRect(x + w * 0.25, y - 14, 12, 10);
      g.fillRect(x + w * 0.25 + 2, y - 4, 2, 4);
      g.fillRect(x + w * 0.25 + 8, y - 4, 2, 4);
    } else if (d < 0.36) g.fillRect(x + w * 0.15, y - 10, w * 0.5, 7);
    if (r() < 0.4) {
      g.fillStyle = "rgba(0,0,0,0.06)";
      for (let k = y + 10; k < top; k += 9) g.fillRect(x, k, w, 1);
    }
    const ww = Math.max(2, Math.round(3 * L.scale));
    const wh = Math.max(2, Math.round(4 * L.scale));
    for (let wy = y + 8; wy < top - 4; wy += wh + 4)
      for (let wx = x + 4; wx < x + w - ww - 2; wx += ww + 3) {
        const p = r();
        if (p < L.windows) {
          lights.g.fillStyle = p < L.windows * 0.25 ? "#fff1cf" : p < L.windows * 0.6 ? "#ffb35c" : "#e8a33d";
          lights.g.fillRect(wx, wy, ww, wh);
        } else if (p < L.windows + 0.25) {
          g.fillStyle = "rgba(255,255,255,0.09)";
          g.fillRect(wx, wy, ww, wh);
        }
      }
    x += w + Math.round(r() * 8);
  }
  return { body: body.c, lights: lights.c, height: H };
}

function wispCanvas(seed: number): HTMLCanvasElement {
  const { c, g } = canvas(1200, 160);
  const r = rng(seed);
  for (let i = 0; i < 6; i++) {
    const cx = 100 + r() * 1000;
    const cy = 70 + r() * 40;
    for (let k = 0; k < 5 + Math.floor(r() * 5); k++) {
      const x = cx + (r() - 0.5) * 160;
      const y = cy + (r() - 0.5) * 22;
      const rx = 30 + r() * 50;
      const grd = g.createRadialGradient(x, y, 0, x, y, rx);
      grd.addColorStop(0, "rgba(255,255,255,0.55)");
      grd.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = grd;
      g.beginPath();
      g.ellipse(x, y, rx, rx * 0.42, 0, 0, Math.PI * 2);
      g.fill();
    }
  }
  return c;
}

function starsCanvas(): HTMLCanvasElement {
  const { c, g } = canvas(1024, 512);
  const r = rng(5);
  for (let i = 0; i < 220; i++) {
    g.fillStyle = `rgba(255,248,230,${0.3 + r() * 0.7})`;
    const s = r() < 0.08 ? 2 : 1;
    g.fillRect(Math.floor(r() * 1024), Math.floor(r() * 512), s, s);
  }
  return c;
}

export function discCanvas(): HTMLCanvasElement {
  const { c, g } = canvas(256, 256);
  const grd = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  grd.addColorStop(0, "rgba(255,255,255,1)");
  grd.addColorStop(0.22, "rgba(255,255,255,1)");
  grd.addColorStop(0.26, "rgba(255,255,255,0.5)");
  grd.addColorStop(0.5, "rgba(255,255,255,0.12)");
  grd.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grd;
  g.fillRect(0, 0, 256, 256);
  return c;
}

export class CityTheme implements ThemeView {
  readonly root = new Container();
  private skyCanvas = canvas(2, 256);
  private sky: Sprite;
  private stars: TilingSprite;
  private disc: Sprite;
  private moonShade = new Graphics();
  private wisps: TilingSprite[] = [];
  private layers: { body: TilingSprite; lights: TilingSprite; height: number; parallax: number; depth: number }[] = [];
  private ground = new Graphics();
  private day: Daylight | null = null;
  private drift = 0;
  private skyTop = 0;

  constructor(private animate: boolean) {
    this.sky = new Sprite(Texture.from(this.skyCanvas.c));
    this.stars = new TilingSprite({ texture: Texture.from(starsCanvas()), width: 100, height: 100 });
    this.disc = new Sprite(Texture.from(discCanvas()));
    this.disc.anchor.set(0.5);
    this.root.addChild(this.sky, this.stars, this.disc, this.moonShade);
    for (const seed of [3, 9]) {
      const c = new TilingSprite({ texture: Texture.from(wispCanvas(seed)), width: 100, height: 160 });
      this.wisps.push(c);
      this.root.addChild(c);
    }
    LAYERS.forEach((L, i) => {
      const s = skyline(L);
      const body = new TilingSprite({ texture: Texture.from(s.body), width: 100, height: s.height });
      const lights = new TilingSprite({ texture: Texture.from(s.lights), width: 100, height: s.height });
      lights.blendMode = "add";
      this.root.addChild(body, lights);
      this.layers.push({ body, lights, height: s.height, parallax: 0.03 + i * 0.035, depth: L.depth });
    });
    this.root.addChild(this.ground);
  }

  setAnimate(on: boolean) {
    this.animate = on;
  }

  setDay(d: Daylight) {
    this.day = d;
    const [top, horizon, city] = keyed(SKY, d.hour);
    this.skyTop = top;
    const { g } = this.skyCanvas;
    const grd = g.createLinearGradient(0, 0, 0, 256);
    grd.addColorStop(0, css(top));
    grd.addColorStop(0.75, css(horizon));
    grd.addColorStop(1, css(horizon));
    g.fillStyle = grd;
    g.fillRect(0, 0, 2, 256);
    this.sky.texture.source.update();
    for (const l of this.layers) {
      l.body.tint = city;
      l.lights.alpha = Math.min(1, d.night * 1.15);
      l.lights.visible = d.night > 0.05;
    }
    this.ground.tint = city;
    const n = d.night;
    this.stars.alpha = n * n * 0.9;
    this.stars.visible = n > 0.3;
    for (const w of this.wisps) {
      w.tint = lerpHex(css(horizon), "#ffffff", 0.5 - n * 0.4);
      w.alpha = 0.75 - n * 0.45;
    }
  }

  update(dt: number, W: number, H: number, camX: number, camY: number, zoom: number) {
    const d = this.day;
    if (!d) return;
    if (this.animate) this.drift += dt;
    const horizon = Math.round(H * 0.4 - camY * 0.04 * zoom);
    this.sky.width = W;
    this.sky.height = Math.max(1, horizon + 40);
    this.stars.width = W;
    this.stars.height = Math.max(1, horizon);
    this.stars.tilePosition.x = -camX * 0.01;
    const sunUp = d.sun.elevation > -0.05;
    const arc = sunUp ? (d.hour - 6.5) / 13 : ((d.hour + 24 - 19.5) % 24) / 11;
    const a = Math.min(1, Math.max(0, arc));
    const el = sunUp ? Math.max(-0.05, d.sun.elevation) : Math.sin(a * Math.PI) * 0.9;
    const sx = W * (0.12 + 0.76 * a) - camX * 0.02 * zoom;
    const sy = horizon - el * horizon * 0.85;
    this.disc.position.set(sx, sy);
    const size = sunUp ? 150 + (1 - Math.min(1, el)) * 70 : 110;
    this.disc.width = this.disc.height = size;
    this.disc.tint = sunUp ? lerpHex("#fff4d6", "#ffb35c", 1 - Math.min(1, el * 1.6)) : 0xf2ead8;
    this.moonShade.clear();
    if (!sunUp) {
      const r = size * 0.21;
      this.moonShade.circle(sx + r * 0.45, sy - r * 0.2, r * 0.95).fill(this.skyTop);
    }
    this.wisps.forEach((c, i) => {
      c.width = W;
      c.position.set(0, horizon * (0.18 + i * 0.3));
      c.tilePosition.x = -camX * (0.015 + i * 0.01) + this.drift * (4 + i * 3);
    });
    for (const l of this.layers) {
      const y = horizon - (l.height - l.depth) + 300 * l.parallax;
      for (const s of [l.body, l.lights]) {
        s.width = W;
        s.height = l.height;
        s.position.set(0, y);
        s.tilePosition.x = -camX * l.parallax * zoom;
      }
    }
    const near = this.layers[this.layers.length - 1];
    const bottom = near.body.position.y + near.height;
    this.ground.clear();
    if (bottom < H) this.ground.rect(0, bottom - 2, W, H - bottom + 2).fill(LAYERS[LAYERS.length - 1].base);
  }

  // The tower below the floor: a walnut slab with a cream cornice, then stone
  // storeys with window bands (some offices lit at night), fading out.
  drawShell(
    body: Graphics,
    lights: Graphics,
    floorAt: (x: number, y: number) => boolean,
    width: number,
    height: number,
  ) {
    body.clear();
    lights.clear();
    const r = rng(77);
    const FACADE = 520;
    const STOREY = 64;
    outerEdges(floorAt, width, height, ([x0, y0], [x1, y1], side) => {
      const stone = side === "s" ? 0x8a7764 : 0x6c5c4d;
      const quad = (t0: number, t1: number, color: number, alpha = 1) =>
        body.poly([x0, y0 + t0, x1, y1 + t0, x1, y1 + t1, x0, y0 + t1]).fill({ color, alpha });
      quad(0, 10, side === "s" ? 0x4a3526 : 0x3a281c);
      quad(10, 13, 0xd9cba9);
      for (let k = 0; k * STOREY + 13 < FACADE; k++) {
        const z = 13 + k * STOREY;
        const fade = Math.max(0, 1 - (z + STOREY) / FACADE) ** 0.8;
        if (fade <= 0.02) break;
        quad(z, z + STOREY, stone, fade);
        quad(z + 14, z + 50, side === "s" ? 0x2f2a33 : 0x26222a, fade);
        for (const t of [0.33, 0.66])
          body.rect(x0 + (x1 - x0) * t - 1, y0 + (y1 - y0) * t + z + 14, 2, 36).fill({ color: stone, alpha: fade });
        quad(z + 50, z + 53, 0xd9cba9, fade * 0.6);
        for (const [t0, t1] of [
          [0.04, 0.32],
          [0.35, 0.64],
          [0.67, 0.96],
        ]) {
          if (r() > 0.42) continue;
          const ax = x0 + (x1 - x0) * t0;
          const ay = y0 + (y1 - y0) * t0;
          const bx = x0 + (x1 - x0) * t1;
          const by = y0 + (y1 - y0) * t1;
          lights
            .poly([ax, ay + z + 16, bx, by + z + 16, bx, by + z + 48, ax, ay + z + 48])
            .fill({ color: r() < 0.3 ? 0xfff1cf : 0xffb35c, alpha: fade * 0.85 });
        }
      }
    });
  }

  destroy() {
    this.root.destroy({ children: true, texture: true });
  }
}
