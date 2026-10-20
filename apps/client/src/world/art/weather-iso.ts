import { isFloor, type MapDef, tileAt, toWorld } from "@yutopia/shared";
import { Container, Graphics, Sprite, Texture } from "pixi.js";

// The weather over the Grounds in iso (docs/plan/27-the-grounds.md, the mood):
// snow falling across the screen, a few flakes on a calm day, a blizzard's
// worth driven sideways by the wind in a storm, and the white of it closing
// in (a haze over the land). Screen space, over the world; flakes over a
// floor (a roof) aren't drawn. The storm comes from the server (shared
// weather.ts), eased by the controller.

const MAX = 1400;

export class IsoWeather {
  readonly root = new Container();
  private haze = new Graphics();
  private flakes: Sprite[] = [];
  private at = new Float32Array(MAX * 4); // x, y (screen, 0..1 of the view), speed, size
  private tex: Texture;

  constructor() {
    this.root.label = "weather";
    this.root.eventMode = "none";
    const c = document.createElement("canvas");
    c.width = 16;
    c.height = 16;
    const g = c.getContext("2d") as CanvasRenderingContext2D;
    const grd = g.createRadialGradient(8, 8, 0, 8, 8, 8);
    grd.addColorStop(0, "rgba(255,255,255,1)");
    grd.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grd;
    g.fillRect(0, 0, 16, 16);
    this.tex = Texture.from(c);
    this.root.addChild(this.haze);
    let seed = 7;
    const r = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    for (let i = 0; i < MAX; i++) {
      this.at[i * 4] = r();
      this.at[i * 4 + 1] = r();
      this.at[i * 4 + 2] = 0.6 + r() * 0.8;
      this.at[i * 4 + 3] = 0.5 + r() * r() * 1.4;
      const s = new Sprite(this.tex);
      s.anchor.set(0.5);
      s.visible = false;
      this.root.addChild(s);
      this.flakes.push(s);
    }
  }

  /** A frame: `storm` 0…1, `wind` where it blows from (radians, the floor's x/y);
   *  `w`, `h` the view; `zoom` the world's scale; `roofed` (screen px → is there
   *  a roof there); `on` the Grounds are shown; `light` the hour's (0xRRGGBB). */
  update(
    dt: number,
    storm: number,
    wind: number,
    w: number,
    h: number,
    zoom: number,
    animate: boolean,
    roofed: (sx: number, sy: number) => boolean,
    on: boolean,
    light: number,
  ) {
    this.root.visible = on;
    if (!on) return;
    // the wind across the screen (the floor's x/y as iso shows them)
    const wx = Math.cos(wind) - Math.sin(wind);
    const n = Math.round(160 + storm * (MAX - 160));
    const fall = (0.1 + storm * 0.25) * dt;
    const side = wx * (0.02 + storm * 0.32) * dt;
    const k = Math.max(0.6, Math.min(1.6, zoom));
    for (let i = 0; i < MAX; i++) {
      const s = this.flakes[i];
      if (i >= n) {
        s.visible = false;
        continue;
      }
      const a = this.at;
      if (animate) {
        a[i * 4 + 1] += fall * a[i * 4 + 2];
        a[i * 4] += side * a[i * 4 + 2] + Math.sin(a[i * 4 + 1] * 9 + i) * dt * 0.006;
        a[i * 4] -= Math.floor(a[i * 4]);
        a[i * 4 + 1] -= Math.floor(a[i * 4 + 1]);
      }
      const x = a[i * 4] * w;
      const y = a[i * 4 + 1] * h;
      if (roofed(x, y)) {
        s.visible = false;
        continue;
      }
      s.visible = true;
      s.position.set(x, y);
      const size = a[i * 4 + 3] * k * (0.28 + storm * 0.12);
      // (in a storm the flakes streak with the wind)
      s.scale.set(size * (1 + storm * 1.6 * Math.abs(wx)), size);
      s.rotation = storm > 0.2 ? Math.atan2(fall, side) - Math.PI / 2 : 0;
      s.alpha = 0.55 + storm * 0.3;
      s.tint = light;
    }
    // the white closing in
    this.haze.clear();
    if (storm > 0.02) {
      const c = (sh: number) => Math.round((((light >> sh) & 255) * [0xe6, 0xec, 0xf2][2 - sh / 8]) / 255) << sh;
      this.haze.rect(0, 0, w, h).fill({ color: c(16) | c(8) | c(0), alpha: storm * 0.42 });
    }
  }

  /** A frame of the engine's: the layer undoes the world's transform (the
   *  camera `cam` at `zoom`), no snow over a roof (a floor's tiles but the lot's
   *  open asphalt and concrete), tinted by the land's light `amb`. */
  frame(
    dt: number,
    storm: number,
    wind: number,
    W: number,
    H: number,
    zoom: number,
    cam: { x: number; y: number },
    animate: boolean,
    map: MapDef,
    on: boolean,
    amb: [number, number, number],
  ) {
    const wx = Math.round(W / 2 - cam.x * zoom);
    const wy = Math.round(H / 2 - cam.y * zoom);
    this.root.position.set(-wx / zoom, -wy / zoom);
    this.root.scale.set(1 / zoom);
    const c = (v: number) => Math.round(Math.min(1, v * 1.3) * 255);
    this.update(
      dt,
      storm,
      wind,
      W,
      H,
      zoom,
      animate,
      (sx, sy) => {
        const p = toWorld((sx - wx) / zoom, (sy - wy) / zoom);
        if (p.x < 0 || p.y < 0 || p.x >= map.width || p.y >= map.height) return false;
        const ch = tileAt(map, Math.floor(p.x), Math.floor(p.y));
        return isFloor(ch) && ch !== "a" && ch !== "c";
      },
      on,
      (c(amb[0]) << 16) | (c(amb[1]) << 8) | c(amb[2]),
    );
  }

  destroy() {
    this.root.destroy({ children: true });
    this.tex.destroy(true);
  }
}
