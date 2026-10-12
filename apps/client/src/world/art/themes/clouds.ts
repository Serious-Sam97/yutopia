import { Container, type Graphics, Sprite, Texture } from "pixi.js";
import type { Daylight } from "../daylight";
import { canvas, css, keyed, outerEdges, rng, type ThemeView } from "./common";

// hour, sky top, sky middle, sky bottom, cloud tint
const SKY: [number, string, string, string, string][] = [
  [0, "#0b1430", "#14214a", "#22305e", "#3a4466"],
  [5, "#0e1838", "#1a2754", "#2c3a6a", "#454f74"],
  [6.5, "#4a5e9a", "#9a90b8", "#f2b49a", "#f6d6cc"],
  [8, "#3d8fd6", "#6fb7ea", "#b4e0f8", "#ffffff"],
  [16.5, "#3d8fd6", "#6fb7ea", "#b4e0f8", "#ffffff"],
  [18, "#4f78c0", "#e0a07a", "#ffc98a", "#ffe6cc"],
  [19.3, "#2c2f6a", "#7a5a8e", "#e08a6e", "#c9a6b8"],
  [20.5, "#0e1736", "#1a2550", "#2a3660", "#4a5070"],
  [24, "#0b1430", "#14214a", "#22305e", "#3a4466"],
];

function starsCanvas(): HTMLCanvasElement {
  const { c, g } = canvas(1024, 768);
  const r = rng(17);
  for (let i = 0; i < 260; i++) {
    g.fillStyle = `rgba(255,250,235,${0.35 + r() * 0.65})`;
    const s = r() < 0.07 ? 2 : 1;
    g.fillRect(Math.floor(r() * 1024), Math.floor(r() * 768), s, s);
  }
  return c;
}

// The outside, Habbo-style: the studio floats in a bright blue sky with fluffy
// clouds drifting past, all around it (above and below). Clouds sit at a few
// depths: far ones are small, pale and slow, near ones bigger and faster, and
// they move a little with the camera (parallax). Still under reduced motion.

// A fluffy cartoon cloud: a row of round puffs on a flat-ish base, white on
// top, a soft blue shade underneath, a light outline.
function cloudCanvas(seed: number): HTMLCanvasElement {
  const r = rng(seed);
  const W = 420;
  const H = 180;
  const { c, g } = canvas(W, H);
  const n = 4 + Math.floor(r() * 4);
  const puffs: [number, number, number][] = [];
  const base = H * 0.72;
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    const x = 50 + t * (W - 100) + (r() - 0.5) * 20;
    const big = Math.sin(t * Math.PI); // biggest in the middle
    const rad = 26 + big * 46 + r() * 14;
    puffs.push([x, base - rad * 0.55, rad]);
  }
  const shape = (pad: number) => {
    g.beginPath();
    for (const [x, y, rad] of puffs) {
      g.moveTo(x + rad + pad, y);
      g.arc(x, y, rad + pad, 0, Math.PI * 2);
    }
    // the flat base
    g.rect(puffs[0][0], base - 30 - pad, puffs[n - 1][0] - puffs[0][0], 30 + pad * 2);
  };
  // outline glow
  g.fillStyle = "#e9f6ff";
  shape(3);
  g.fill();
  // body: white on top, sky-blue shade at the bottom
  const grd = g.createLinearGradient(0, base - 110, 0, base + 4);
  grd.addColorStop(0, "#ffffff");
  grd.addColorStop(0.6, "#ffffff");
  grd.addColorStop(1, "#cfe7f8");
  g.fillStyle = grd;
  shape(0);
  g.fill();
  // a light rim on the upper-left of each puff
  g.globalCompositeOperation = "source-atop";
  for (const [x, y, rad] of puffs) {
    const h = g.createRadialGradient(x - rad * 0.35, y - rad * 0.4, 0, x - rad * 0.35, y - rad * 0.4, rad * 0.9);
    h.addColorStop(0, "rgba(255,255,255,0.9)");
    h.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = h;
    g.fillRect(x - rad * 1.4, y - rad * 1.4, rad * 2.8, rad * 2.8);
  }
  g.globalCompositeOperation = "source-over";
  return c;
}

interface Cloud {
  sprite: Sprite;
  x: number; // 0..1 across the wrap width
  y: number; // 0..1 down the screen
  depth: number; // 0 far … 1 near
  speed: number; // screen widths per minute
}

export class CloudsTheme implements ThemeView {
  readonly root = new Container();
  private skyCanvas = canvas(2, 512);
  private sky: Sprite;
  private stars: Sprite;
  private clouds: Cloud[] = [];
  private animate: boolean;

  constructor(animate: boolean) {
    this.animate = animate;
    this.sky = new Sprite(Texture.from(this.skyCanvas.c));
    this.stars = new Sprite(Texture.from(starsCanvas()));
    this.root.addChild(this.sky, this.stars);
    const textures = [3, 7, 11, 19, 23, 31].map((s) => Texture.from(cloudCanvas(s)));
    const r = rng(42);
    const list: Cloud[] = [];
    for (let i = 0; i < 16; i++) {
      const depth = r();
      const sprite = new Sprite(textures[i % textures.length]);
      sprite.anchor.set(0.5);
      list.push({ sprite, x: r(), y: 0.04 + r() * 0.92, depth, speed: 0.08 + depth * 0.12 });
    }
    // far clouds first
    list.sort((a, b) => a.depth - b.depth);
    for (const c of list) {
      const s = 0.35 + c.depth * 0.75;
      c.sprite.scale.set(s * (0.9 + (c.x % 0.2)));
      c.sprite.alpha = 0.55 + c.depth * 0.45;
      this.root.addChild(c.sprite);
      this.clouds.push(c);
    }
  }

  // a blue sky by day; warm at golden hour, dusky, then night with stars
  setDay(d: Daylight) {
    const [top, mid, bottom, cloud] = keyed(SKY, d.hour);
    const { g } = this.skyCanvas;
    const grd = g.createLinearGradient(0, 0, 0, 512);
    grd.addColorStop(0, css(top));
    grd.addColorStop(0.55, css(mid));
    grd.addColorStop(1, css(bottom));
    g.fillStyle = grd;
    g.fillRect(0, 0, 2, 512);
    this.sky.texture.source.update();
    this.stars.alpha = Math.max(0, d.night - 0.35) * 1.4;
    this.stars.visible = this.stars.alpha > 0.02;
    for (const c of this.clouds) {
      c.sprite.tint = cloud;
      c.sprite.alpha = (0.55 + c.depth * 0.45) * (1 - d.night * 0.45);
    }
  }

  setAnimate(on: boolean) {
    this.animate = on;
  }

  // Lay the sky out for the screen and camera (world px of the view centre).
  update(dt: number, W: number, H: number, camX: number, camY: number, zoom: number) {
    this.sky.width = W;
    this.sky.height = H;
    this.stars.width = Math.max(W, 1024);
    this.stars.height = Math.max(H, 768);
    const wrap = W + 600; // clouds leave on the right and come back on the left
    for (const c of this.clouds) {
      if (this.animate) c.x = (c.x + (c.speed * dt) / 60) % 1;
      const par = 0.03 + c.depth * 0.09; // nearer clouds move more with the camera
      let x = c.x * wrap - camX * par * zoom;
      x = (((x % wrap) + wrap) % wrap) - 300;
      let y = c.y * (H + 300) - camY * par * zoom;
      y = (((y % (H + 300)) + (H + 300)) % (H + 300)) - 150;
      c.sprite.position.set(x, y);
    }
  }

  destroy() {
    this.root.destroy({ children: true, texture: true });
  }

  // The studio's floor floats in the sky: its outer edges show a thick walnut
  // slab (like a Habbo room's floor) with a cream lip.
  drawShell(
    body: Graphics,
    lights: Graphics,
    floorAt: (x: number, y: number) => boolean,
    width: number,
    height: number,
  ) {
    body.clear();
    lights.clear();
    const SLAB = 14;
    outerEdges(floorAt, width, height, (a, b, side) => {
      body
        .poly([a[0], a[1], b[0], b[1], b[0], b[1] + SLAB, a[0], a[1] + SLAB])
        .fill(side === "s" ? 0x5b3a26 : 0x3e2718);
      body.poly([a[0], a[1], b[0], b[1], b[0], b[1] + 2, a[0], a[1] + 2]).fill(0xd9cba9);
      body
        .moveTo(a[0], a[1] + SLAB)
        .lineTo(b[0], b[1] + SLAB)
        .stroke({ width: 1.3, color: 0x2a1a12 });
    });
  }
}
