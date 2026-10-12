import { Container, type Graphics, Sprite, Texture, TilingSprite } from "pixi.js";
import type { Daylight } from "../daylight";
import { canvas, css, keyed, outerEdges, rng, type ThemeView } from "./common";

// Snow: a severe modernist office campus in winter (Severance-style, no
// branding). An overcast sky that follows the clock, a dark tree line, bare
// trees and a long low annex on a snowfield, snow falling. Below the floor, the
// building's mirrored glass curtain wall, snow on every ledge; a few offices
// lit cold white at night.

// hour, sky top, sky horizon, land tint
const SKY: [number, string, string, string][] = [
  [0, "#141a28", "#2a3346", "#4a5670"],
  [5, "#18202f", "#303a4e", "#55607a"],
  [7, "#6e7486", "#b9b1b4", "#b9bccb"],
  [9, "#aeb8c4", "#e3e7ea", "#f4f6f8"],
  [16, "#a9b4c1", "#e1e5e8", "#ffffff"],
  [17.5, "#8d93a6", "#d8c6c0", "#e8dfe0"],
  [19, "#4d5470", "#9d8f98", "#8f93ac"],
  [20.5, "#1a2132", "#323c52", "#55607c"],
  [24, "#141a28", "#2a3346", "#4a5670"],
];

const W_LAYER = 1600;

// A bare winter tree: a trunk and forking branches.
function tree(g: CanvasRenderingContext2D, x: number, y: number, h: number, r: () => number, color: string) {
  g.strokeStyle = color;
  g.lineCap = "round";
  const branch = (x0: number, y0: number, len: number, a: number, w: number, depth: number) => {
    const x1 = x0 + Math.cos(a) * len;
    const y1 = y0 + Math.sin(a) * len;
    g.lineWidth = w;
    g.beginPath();
    g.moveTo(x0, y0);
    g.lineTo(x1, y1);
    g.stroke();
    if (depth <= 0 || len < 3) return;
    const n = 2 + (r() < 0.3 ? 1 : 0);
    for (let i = 0; i < n; i++)
      branch(x1, y1, len * (0.62 + r() * 0.12), a + (r() - 0.5) * 1.1, Math.max(0.6, w * 0.65), depth - 1);
  };
  branch(x, y, h * 0.42, -Math.PI / 2 + (r() - 0.5) * 0.1, Math.max(1.2, h / 22), 5);
}

// Far woods: a band of dark tree tops along the horizon.
function woods(): { c: HTMLCanvasElement; h: number } {
  const H = 90;
  const { c, g } = canvas(W_LAYER, H);
  const r = rng(13);
  g.fillStyle = "#5f6a78";
  g.beginPath();
  g.moveTo(0, H);
  for (let x = 0; x <= W_LAYER; x += 4) g.lineTo(x, H - 24 - r() * 22 - Math.sin(x / 140) * 8);
  g.lineTo(W_LAYER, H);
  g.fill();
  for (let i = 0; i < 160; i++) tree(g, r() * W_LAYER, H - 18, 34 + r() * 30, r, "rgba(70,80,92,0.7)");
  return { c, h: H };
}

// Mid layer: a long low annex (white, a ribbon window) and scattered bare trees.
function campus(): { body: HTMLCanvasElement; lights: HTMLCanvasElement; h: number } {
  const H = 140;
  const b = canvas(W_LAYER, H);
  const l = canvas(W_LAYER, H);
  const r = rng(29);
  const g = b.g;
  // the annex
  const ax = 380;
  const aw = 760;
  g.fillStyle = "#e9e6df";
  g.fillRect(ax, H - 56, aw, 50);
  g.fillStyle = "#cfcac0";
  g.fillRect(ax, H - 56, aw, 4);
  g.fillStyle = "#2c3a40";
  g.fillRect(ax + 6, H - 44, aw - 12, 14);
  g.fillStyle = "rgba(255,255,255,0.25)";
  for (let x = ax + 6; x < ax + aw - 6; x += 18) g.fillRect(x, H - 44, 1, 14);
  g.fillStyle = "#ffffff";
  g.fillRect(ax - 4, H - 60, aw + 8, 5); // snow on the roof
  for (let x = ax + 10; x < ax + aw - 20; x += 18)
    if (r() < 0.35) {
      l.g.fillStyle = "#e8f0ff";
      l.g.fillRect(x + 2, H - 43, 14, 12);
    }
  // trees
  for (let i = 0; i < 26; i++) {
    const x = r() * W_LAYER;
    if (x > ax - 20 && x < ax + aw + 20 && r() < 0.8) continue;
    tree(g, x, H - 6, 50 + r() * 60, r, "#4a525c");
  }
  return { body: b.c, lights: l.c, h: H };
}

// The snowfield: white with soft blue drifts and a couple of faint paths.
function field(): HTMLCanvasElement {
  const { c, g } = canvas(W_LAYER, 600);
  g.fillStyle = "#f3f5f7";
  g.fillRect(0, 0, W_LAYER, 600);
  const r = rng(41);
  for (let i = 0; i < 70; i++) {
    const x = r() * W_LAYER;
    const y = 10 + r() * 580;
    const w = 80 + r() * 260;
    const grd = g.createRadialGradient(x, y, 0, x, y, w);
    grd.addColorStop(0, "rgba(186,204,222,0.35)");
    grd.addColorStop(1, "rgba(186,204,222,0)");
    g.fillStyle = grd;
    g.beginPath();
    g.ellipse(x, y, w, w * 0.12, 0, 0, Math.PI * 2);
    g.fill();
  }
  g.strokeStyle = "rgba(160,176,196,0.45)";
  g.lineWidth = 2;
  for (const y0 of [120, 128]) {
    g.beginPath();
    g.moveTo(0, y0);
    for (let x = 0; x <= W_LAYER; x += 20) g.lineTo(x, y0 + Math.sin(x / 210) * 14);
    g.stroke();
  }
  return c;
}

function flakeCanvas(): HTMLCanvasElement {
  const { c, g } = canvas(16, 16);
  const grd = g.createRadialGradient(8, 8, 0, 8, 8, 8);
  grd.addColorStop(0, "rgba(255,255,255,1)");
  grd.addColorStop(0.5, "rgba(255,255,255,0.8)");
  grd.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grd;
  g.fillRect(0, 0, 16, 16);
  return c;
}

interface Flake {
  s: Sprite;
  x: number;
  y: number;
  depth: number;
  phase: number;
}

export class SnowTheme implements ThemeView {
  readonly root = new Container();
  private skyCanvas = canvas(2, 256);
  private sky: Sprite;
  private woods: TilingSprite;
  private campusBody: TilingSprite;
  private campusLights: TilingSprite;
  private field: TilingSprite;
  private snow = new Container();
  private flakes: Flake[] = [];
  private t = 0;

  constructor(
    private animate: boolean,
    flakes = 260,
  ) {
    this.sky = new Sprite(Texture.from(this.skyCanvas.c));
    const w = woods();
    this.woods = new TilingSprite({ texture: Texture.from(w.c), width: 100, height: w.h });
    const cp = campus();
    this.campusBody = new TilingSprite({ texture: Texture.from(cp.body), width: 100, height: cp.h });
    this.campusLights = new TilingSprite({ texture: Texture.from(cp.lights), width: 100, height: cp.h });
    this.campusLights.blendMode = "add";
    this.field = new TilingSprite({ texture: Texture.from(field()), width: 100, height: 600 });
    this.root.addChild(this.sky, this.woods, this.field, this.campusBody, this.campusLights, this.snow);
    const tex = Texture.from(flakeCanvas());
    const r = rng(91);
    for (let i = 0; i < flakes; i++) {
      const s = new Sprite(tex);
      s.anchor.set(0.5);
      const depth = r();
      s.scale.set(0.15 + depth * 0.35);
      s.alpha = 0.45 + depth * 0.5;
      this.snow.addChild(s);
      this.flakes.push({ s, x: r(), y: r(), depth, phase: r() * Math.PI * 2 });
    }
  }

  setAnimate(on: boolean) {
    this.animate = on;
  }

  setDay(d: Daylight) {
    const [top, horizon, land] = keyed(SKY, d.hour);
    const { g } = this.skyCanvas;
    const grd = g.createLinearGradient(0, 0, 0, 256);
    grd.addColorStop(0, css(top));
    grd.addColorStop(1, css(horizon));
    g.fillStyle = grd;
    g.fillRect(0, 0, 2, 256);
    this.sky.texture.source.update();
    for (const s of [this.woods, this.field, this.campusBody]) s.tint = land;
    this.campusLights.alpha = Math.min(1, d.night * 1.2);
    this.campusLights.visible = d.night > 0.05;
    this.snow.tint = land;
  }

  update(dt: number, W: number, H: number, camX: number, camY: number, zoom: number) {
    if (this.animate) this.t += dt;
    const horizon = Math.round(H * 0.34 - camY * 0.04 * zoom);
    this.sky.width = W;
    this.sky.height = Math.max(1, horizon + 4);
    const lay = (s: TilingSprite, y: number, par: number) => {
      s.width = W;
      s.position.set(0, y);
      s.tilePosition.x = -camX * par * zoom;
    };
    lay(this.woods, horizon - this.woods.height + 6, 0.02);
    lay(this.field, horizon, 0.06);
    this.field.height = Math.max(1, H - horizon);
    lay(this.campusBody, horizon - this.campusBody.height + 30, 0.05);
    lay(this.campusLights, horizon - this.campusLights.height + 30, 0.05);
    // snowfall: drifting down, swaying; nearer flakes are bigger and faster
    const h = H + 40;
    for (const f of this.flakes) {
      if (this.animate) {
        f.y = (f.y + (dt * (18 + f.depth * 46)) / h) % 1;
        f.x = (f.x + (dt * (4 + f.depth * 6)) / W) % 1;
      }
      const sway = Math.sin(this.t * (0.6 + f.depth) + f.phase) * (6 + f.depth * 10);
      const par = 0.02 + f.depth * 0.08;
      let x = f.x * W + sway - camX * par * zoom;
      x = ((x % W) + W) % W;
      let y = f.y * h - 20 - camY * par * zoom;
      y = (((y % h) + h) % h) - 20;
      f.s.position.set(x, y);
    }
  }

  // The building below the floor: a thin white roof slab with snow on it, then
  // a mirrored glass curtain wall in a strict grid (spandrels, mullions), snow
  // caught on each ledge; some offices lit cold white at night. Fades out.
  drawShell(
    body: Graphics,
    lights: Graphics,
    floorAt: (x: number, y: number) => boolean,
    width: number,
    height: number,
  ) {
    body.clear();
    lights.clear();
    const r = rng(53);
    const FACADE = 560;
    const STOREY = 56;
    outerEdges(floorAt, width, height, ([x0, y0], [x1, y1], side) => {
      const glass = side === "s" ? 0x3d4c55 : 0x2e3a42;
      const glassHi = side === "s" ? 0x5d7280 : 0x46586a;
      const panel = side === "s" ? 0xe9e6df : 0xcfcac0;
      const quad = (t0: number, t1: number, color: number, alpha = 1) =>
        body.poly([x0, y0 + t0, x1, y1 + t0, x1, y1 + t1, x0, y0 + t1]).fill({ color, alpha });
      quad(0, 3, 0xffffff); // snow on the edge
      quad(3, 12, panel);
      for (let k = 0; k * STOREY + 12 < FACADE; k++) {
        const z = 12 + k * STOREY;
        const fade = Math.max(0, 1 - (z + STOREY) / FACADE) ** 0.7;
        if (fade <= 0.02) break;
        quad(z, z + 40, glass, fade);
        // the sky reflected in the upper part of each pane
        quad(z, z + 12, glassHi, fade * 0.7);
        quad(z + 40, z + STOREY, panel, fade);
        quad(z + 40, z + 42, 0xffffff, fade); // snow on the ledge
        for (const t of [0.25, 0.5, 0.75])
          body.rect(x0 + (x1 - x0) * t - 0.6, y0 + (y1 - y0) * t + z, 1.2, 40).fill({ color: 0xbcc4ca, alpha: fade });
        for (const [t0, t1] of [
          [0.02, 0.24],
          [0.26, 0.49],
          [0.51, 0.74],
          [0.76, 0.98],
        ]) {
          if (r() > 0.22) continue;
          const ax = x0 + (x1 - x0) * t0;
          const ay = y0 + (y1 - y0) * t0;
          const bx = x0 + (x1 - x0) * t1;
          const by = y0 + (y1 - y0) * t1;
          lights
            .poly([ax, ay + z + 2, bx, by + z + 2, bx, by + z + 38, ax, ay + z + 38])
            .fill({ color: r() < 0.5 ? 0xe8f0ff : 0xd4e2f0, alpha: fade * 0.8 });
        }
      }
    });
  }

  destroy() {
    this.root.destroy({ children: true, texture: true });
  }
}
