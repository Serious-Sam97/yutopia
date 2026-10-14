import {
  entry,
  hWall,
  isFloor,
  isWindow,
  type MapDef,
  TILE_H,
  TILE_W,
  tileAt,
  toScreen,
  vWall,
  type WorldObjectDef,
} from "@yutopia/shared";
import { Container, Graphics, Matrix, Sprite, Texture } from "pixi.js";

// Ambient life: small motions that make the studio a place. Monitors flicker,
// reels spin and meters dance on the mixing desk while the radio plays, the
// coffee machine steams, server LEDs blink, plants sway when someone walks by,
// dust motes drift in window light, a ceiling fan's shadow turns in lived-in
// rooms. All off on Low quality and under reduced motion.

const HW = TILE_W / 2;
const HH = TILE_H / 2;

// rot-0 local → world, the same turn as the item art
function place(o: WorldObjectDef, lx: number, ly: number): [number, number] {
  const e = entry(o.kind);
  let x = lx;
  let y = ly;
  let W = e.w;
  let H = e.h;
  for (let i = 0; i < ((o.rot ?? 0) & 3); i++) {
    [x, y] = [H - y, x];
    [W, H] = [H, W];
  }
  return [o.x + x, o.y + y];
}
const at = (x: number, y: number, z = 0) => {
  const p = toScreen(x, y);
  return [p.x, p.y - z] as const;
};

// noise without allocation
const n1 = (t: number, s: number) => Math.sin(t * 1.7 + s * 12.9) * 0.5 + Math.sin(t * 3.1 + s * 7.3) * 0.5;

let softTex: Texture | null = null;
function soft(): Texture {
  if (softTex) return softTex;
  const c = document.createElement("canvas");
  c.width = c.height = 32;
  const g = c.getContext("2d") as CanvasRenderingContext2D;
  const grd = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  grd.addColorStop(0, "rgba(255,255,255,1)");
  grd.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grd;
  g.fillRect(0, 0, 32, 32);
  softTex = Texture.from(c);
  return softTex;
}

export interface Swayable {
  root: Container; // the part
  x: number; // world point of its base
  y: number;
  kick: number; // current sway energy
  base?: { x: number; y: number }; // root position before pivoting
}

interface Overlay {
  g: Graphics;
  o: WorldObjectDef;
  seed: number;
}

export interface LifeInput {
  dt: number;
  time: number;
  people: { x: number; y: number }[];
  radio: boolean; // the radio is playing
  night: number;
  emits: { sprite: Container; base: number; kind: string; seed: number }[]; // emissive layers by object kind
}

export class Life {
  readonly front = new Container(); // overlays sorted with the scene go in sortLayer; this is for motes
  private overlays: Overlay[] = [];
  private overlayAt = -1;
  private steam: { s: Sprite; o: WorldObjectDef; t: number }[] = [];
  private motes: { s: Sprite; x: number; y: number; z: number; ph: number }[] = [];
  private fans: { c: Container; blades: Graphics; speed: number }[] = [];
  private sways: Swayable[] = [];
  enabled = true;

  constructor(
    private sortLayer: Container,
    private shadowLayer: Container,
  ) {
    this.front.blendMode = "add";
  }

  // Rebuilt when the objects or the map change.
  setScene(map: MapDef, objects: WorldObjectDef[], sways: Swayable[]) {
    this.clear();
    this.sways = sways;
    for (const s of sways) {
      // pivot at the base so the sway bends from the floor
      const b = toScreen(s.x, s.y);
      s.base = { x: s.root.position.x, y: s.root.position.y };
      s.root.pivot.set(b.x - s.base.x, b.y - s.base.y);
      s.root.position.set(b.x, b.y);
    }
    let seed = 0;
    for (const o of objects) {
      seed += 0.618;
      if (o.kind === "mixing_desk" || o.kind === "server_rack") {
        const g = new Graphics();
        g.isRenderGroup = true; // redrawn every frame: its own little draw list
        // just in front of the object's slices
        g.zIndex = o.x + o.y + entry(o.kind).w + 0.6;
        this.sortLayer.addChild(g);
        this.overlays.push({ g, o, seed: seed % 1 });
      }
      if (o.kind === "coffee_machine")
        for (let i = 0; i < 3; i++) {
          const s = new Sprite(soft());
          s.anchor.set(0.5);
          s.zIndex = o.x + o.y + 1.2;
          this.sortLayer.addChild(s);
          this.steam.push({ s, o, t: i / 3 });
        }
    }
    // dust motes in the light of windows (a few per window)
    const floor = (x: number, y: number) => isFloor(tileAt(map, x, y));
    // seeded, so the same studio always gets the same motes
    let k = 0;
    const rnd = () => {
      k++;
      const v = Math.sin(k * 12.9898 + map.width * 78.233) * 43758.5453;
      return v - Math.floor(v);
    };
    const add = (x: number, y: number) => {
      for (let i = 0; i < 5; i++) {
        const s = new Sprite(soft());
        s.anchor.set(0.5);
        s.scale.set(0.09);
        this.front.addChild(s);
        this.motes.push({
          s,
          x: x + (rnd() - 0.5) * 1.2,
          y: y + (rnd() - 0.5) * 1.2,
          z: 10 + rnd() * 50,
          ph: rnd() * 9,
        });
      }
    };
    for (let y = 0; y <= map.height; y++)
      for (let x = 0; x < map.width; x++) if (isWindow(hWall(map, x, y))) add(x + 0.5, floor(x, y) ? y + 1 : y - 1);
    for (let y = 0; y < map.height; y++)
      for (let x = 0; x <= map.width; x++) if (isWindow(vWall(map, x, y))) add(floor(x, y) ? x + 1 : x - 1, y + 0.5);
    // a ceiling fan's shadow in rooms that are lived in
    for (const a of map.areas) {
      if (a.dressing !== "lived" && a.dressing !== "busy") continue;
      if (a.w < 6 || a.h < 6) continue;
      const c = new Container();
      const p = toScreen(a.x + a.w / 2, a.y + a.h / 2);
      // the floor plane in tile units
      c.setFromMatrix(new Matrix(HW, HH, -HW, HH, p.x, p.y));
      const blades = new Graphics();
      for (let i = 0; i < 4; i++) {
        const b = new Graphics().ellipse(0.9, 0, 0.85, 0.16).fill({ color: 0x1a120c, alpha: 0.1 });
        b.rotation = (i / 4) * Math.PI * 2;
        blades.addChild(b);
      }
      blades.addChild(new Graphics().circle(0, 0, 0.18).fill({ color: 0x1a120c, alpha: 0.12 }));
      c.addChild(blades);
      this.shadowLayer.addChild(c);
      this.fans.push({ c, blades, speed: 1.4 + (a.w % 3) * 0.3 });
    }
  }

  clear() {
    for (const o of this.overlays) o.g.destroy();
    for (const s of this.steam) s.s.destroy();
    for (const m of this.motes) m.s.destroy();
    for (const f of this.fans) f.c.destroy({ children: true });
    for (const s of this.sways) {
      if (s.root.destroyed || !s.base) continue;
      s.root.pivot.set(0, 0);
      s.root.position.set(s.base.x, s.base.y);
      s.root.skew.x = 0;
    }
    this.overlays = [];
    this.steam = [];
    this.motes = [];
    this.fans = [];
    this.sways = [];
  }

  update(i: LifeInput) {
    const on = this.enabled;
    const t = i.time;
    for (const f of this.fans) {
      f.c.visible = on;
      if (on) f.blades.rotation = t * f.speed;
    }
    // monitors and screens flicker; server LEDs pulse
    for (const e of i.emits) {
      if (!on) continue;
      if (e.kind === "desk" || e.kind === "crt_terminal" || e.kind === "arcade")
        e.sprite.alpha = e.base * (0.86 + 0.14 * (0.5 + 0.5 * n1(t * 6, e.seed)));
    }
    // overlays: reels + meters on the mixing desk, LEDs on racks
    // reels, meters and LEDs: 30 redraws a second (each rebuilds its draw list)
    const redraw = on && t - this.overlayAt >= 1 / 30;
    if (redraw) this.overlayAt = t;
    for (const { g, o, seed } of this.overlays) {
      if (!on && g.visible) g.clear();
      g.visible = on;
      if (!redraw) continue;
      g.clear();
      if (o.kind === "mixing_desk") {
        // two tape reels standing on the meter bridge
        for (const lx of [0.45, 2.55]) {
          const [x, y] = place(o, lx, 0.28);
          const [sx, sy] = at(x, y, 40);
          const r = 7;
          g.circle(sx, sy, r).fill(0x2b2a26).stroke({ width: 1.2, color: 0x2a1a12 });
          g.circle(sx, sy, r - 2.2).fill(0x4a463e);
          const a = i.radio ? t * 5 : 0;
          for (let k = 0; k < 3; k++) {
            const aa = a + (k / 3) * Math.PI * 2;
            g.moveTo(sx, sy)
              .lineTo(sx + Math.cos(aa) * (r - 2.6), sy + Math.sin(aa) * (r - 2.6))
              .stroke({ width: 1.4, color: 0xb9b2a3 });
          }
          g.circle(sx, sy, 1.6).fill(0xd3cdbf);
          g.moveTo(sx, sy + r)
            .lineTo(sx, sy + r + 9)
            .stroke({ width: 1.2, color: 0x2b2a26 });
        }
        // meters that follow the music
        if (i.radio)
          for (let k = 0; k < 14; k++) {
            const lvl = Math.max(0, 0.5 + 0.5 * n1(t * (3 + (k % 4)), seed + k * 0.11)) * 6;
            const [x, y] = place(o, 0.12 + k * 0.2 + 0.05, 0.41);
            for (let s = 0; s < Math.round(lvl); s++) {
              const [sx, sy] = at(x, y, 20 + s * 1.8);
              g.rect(sx - 2.4, sy - 1.1, 4.8, 1.2).fill({
                color: s >= 5 ? 0xc4402b : s >= 4 ? 0xffa630 : 0xffb35c,
                alpha: 0.9,
              });
            }
          }
      } else {
        // racks: a few LEDs blinking on top of the drawn ones
        for (let r = 0; r < 8; r++)
          for (let k = 0; k < 4; k++) {
            if (n1(t * (5 + k), seed * 9 + r * 1.3 + k) < 0.55) continue;
            const [x, y] = place(o, 0.235 + k * 0.06, 0.88);
            const [sx, sy] = at(x, y, 6 + r * 7.2 + 2.6);
            g.rect(sx - 1.2, sy - 0.8, 2.4, 1.6).fill(k % 3 === 2 ? 0xffa630 : 0xc4402b);
          }
      }
    }
    // coffee steam: soft puffs rising and fading
    for (const st of this.steam) {
      st.s.visible = on;
      if (!on) continue;
      st.t = (st.t + i.dt * 0.35) % 1;
      const [x, y] = place(st.o, 0.5, 0.76);
      const [sx, sy] = at(x, y, 34 + st.t * 28);
      st.s.position.set(sx + Math.sin(st.t * 6 + st.o.x) * 3, sy);
      st.s.scale.set(0.25 + st.t * 0.5);
      st.s.alpha = Math.sin(st.t * Math.PI) * 0.4;
    }
    // dust motes in the light of windows, by day
    const day = Math.max(0, 1 - i.night * 1.5);
    this.front.visible = on && day > 0.05;
    if (this.front.visible)
      for (const m of this.motes) {
        const [sx, sy] = at(
          m.x + Math.sin(t * 0.3 + m.ph) * 0.3,
          m.y + Math.cos(t * 0.25 + m.ph) * 0.3,
          m.z + Math.sin(t * 0.4 + m.ph) * 6,
        );
        m.s.position.set(sx, sy);
        m.s.alpha = day * (0.25 + 0.25 * Math.sin(t * 0.8 + m.ph));
      }
    // plants sway when someone passes close
    for (const s of this.sways) {
      if (s.root.destroyed) continue;
      if (on)
        for (const p of i.people)
          if (Math.abs(p.x - s.x) < 0.9 && Math.abs(p.y - s.y) < 0.9) s.kick = Math.min(1, s.kick + i.dt * 3);
      s.kick *= Math.exp(-i.dt * 1.6);
      s.root.skew.x = on ? Math.sin(t * 7 + s.x) * 0.09 * s.kick : 0;
    }
  }
}
