import { TILE_H, TILE_W, topCentre, toScreen, type WorldObjectDef } from "@yutopia/shared";
import {
  type ComputerView,
  computerFacing,
  computerGlass,
  DEFAULT_ERA,
  type Era,
  isComputer,
  isEra,
  isPhase,
} from "@yutopia/shared/computer";
import { Container, Matrix, Sprite, Texture } from "pixi.js";
import { glowSprite, placeGlow } from "../art/glow";
import { mixer } from "../audio";
import type { WorldController } from "../controller";
import { glowColor, OS_H, OS_W, paintOs, paintTube } from "./screen";

// Marks this chunk for `pnpm budget` (it loads lazily, outside the page's files).
export const OS_CHUNK = "yutopia-os";

// The studio's computers while someone uses them (docs/plan/19-vortexos.md):
// each one in the room's `computers` gets a canvas drawn from what its OS
// reports (world/os/screen.ts), mapped onto its glass in the iso view and
// handed to the 3D view. A CRT warms up when it comes on and collapses to a
// dot when it goes off; at night its light falls on the desk. Near you, it
// clicks on and hums.

const ON_MS = 520;
const OFF_MS = 420;
const NEAR = 14; // tiles: further away a picture is redrawn once a second
const HEAR = 4.5; // tiles: its fan, its click

interface Screen {
  def: WorldObjectDef;
  sig: string;
  canvas: HTMLCanvasElement;
  g: CanvasRenderingContext2D;
  tex: Texture;
  root: Container | null;
  glow: Sprite;
  view: ComputerView | null; // what it shows (null: switched off, collapsing)
  onAt: number;
  offAt: number;
  drawnAt: number;
  ver: number; // counts its paints (the 3D view uploads it only when this moves)
}

const FRONT: [number, number][] = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
];

export class OsRoom {
  private screens = new Map<string, Screen>();
  private hum: { osc: OscillatorNode; gain: GainNode } | null = null;

  constructor(private w: WorldController) {}

  private get engine() {
    return this.w.engine;
  }

  // What the room says about each computer someone's at.
  private views(): Map<string, ComputerView> {
    const out = new Map<string, ComputerView>();
    const state = this.w.room?.state?.computers as Map<string, Record<string, unknown>> | undefined;
    if (!state) return out;
    for (const [id, c] of state) {
      out.set(id, {
        sid: String(c.sid ?? ""),
        uid: Number(c.uid ?? 0),
        name: String(c.name ?? ""),
        phase: isPhase(c.phase) ? c.phase : "boot",
        era: isEra(c.era) ? (c.era as Era) : DEFAULT_ERA,
        app: String(c.app ?? ""),
        user: String(c.user ?? ""),
        since: Number(c.since ?? 0),
      });
    }
    return out;
  }

  private make(def: WorldObjectDef): Screen {
    const canvas = document.createElement("canvas");
    canvas.width = OS_W;
    canvas.height = OS_H;
    const g = canvas.getContext("2d") as CanvasRenderingContext2D;
    const glow = glowSprite();
    glow.zIndex = -0.4;
    this.engine?.mountLive(glow);
    return {
      def,
      sig: "",
      canvas,
      g,
      tex: Texture.from(canvas),
      root: null,
      glow,
      view: null,
      onAt: 0,
      offAt: 0,
      drawnAt: 0,
      ver: 0,
    };
  }

  private drop(id: string, s: Screen) {
    s.root?.destroy({ children: true });
    s.glow.destroy();
    s.tex.destroy(true);
    this.screens.delete(id);
  }

  // onto its glass (again, when it was moved, turned or lifted)
  private mount(s: Screen) {
    const engine = this.engine;
    if (!engine) return;
    const o = s.def;
    const sig = `${o.x}|${o.y}|${o.rot ?? 0}|${o.props?.z ?? 0}|${JSON.stringify(o.props?.c ?? null)}`;
    if (sig === s.sig && s.root) return;
    s.root?.destroy({ children: true });
    s.sig = sig;
    const c = computerGlass(o);
    if (!c) return;
    const tl = toScreen(c.tl[0], c.tl[1]);
    const tr = toScreen(c.tr[0], c.tr[1]);
    const root = new Container();
    const sp = new Sprite(s.tex);
    sp.width = OS_W;
    sp.height = OS_H;
    root.addChild(sp);
    root.setFromMatrix(
      new Matrix((tr.x - tl.x) / OS_W, (tr.y - tl.y) / OS_W, 0, (c.zTop - c.zBot) / OS_H, tl.x, tl.y - c.zTop),
    );
    engine.mountLive(root);
    s.root = root;
  }

  frame(_dt: number, me: { x: number; y: number }) {
    const engine = this.engine;
    if (!engine) return;
    const views = this.views();
    const now = Date.now();
    const t = performance.now();
    const still = engine.stillMotion();
    const night = engine.nightLevel();
    let hum = 0;
    // computers now in use (new ones warm up)
    for (const [id, v] of views) {
      const def = engine.getObject(id);
      if (!def || !isComputer(def.kind)) continue;
      let s = this.screens.get(id);
      if (!s) {
        s = this.make(def);
        this.screens.set(id, s);
      }
      s.def = def;
      if (!s.view) {
        s.onAt = still ? 0 : t;
        s.offAt = 0;
        const c = topCentre(def);
        const d = Math.hypot(c.x - me.x, c.y - me.y);
        if (d < HEAR) powerOn(1 - d / HEAR);
      }
      s.view = v;
    }
    for (const [id, s] of this.screens) {
      const v = views.get(id);
      const def = engine.getObject(id);
      if (!def) {
        this.drop(id, s);
        continue;
      }
      s.def = def;
      if (!v && s.view) {
        // switched off: the tube collapses
        s.view = null;
        s.offAt = still ? 0 : t;
      }
      const facing = computerFacing(def) || engine.seesAllSides;
      const alpha = engine.partAlpha(id);
      const off = !s.view && (!s.offAt || t - s.offAt > OFF_MS);
      if (off) {
        this.drop(id, s);
        continue;
      }
      this.mount(s);
      const front = engine.frontKey(id);
      if (s.root) {
        s.root.visible = facing && alpha > 0;
        s.root.alpha = alpha;
        if (front != null) s.root.zIndex = front + 0.004;
      }
      const c = topCentre(def);
      const dist = Math.hypot(c.x - me.x, c.y - me.y);
      if (s.view && dist < HEAR) hum = Math.max(hum, 1 - dist / HEAR);
      // the picture: every ~80 ms near, once a second far away
      const warm = s.onAt && t - s.onAt < ON_MS ? (t - s.onAt) / ON_MS : null;
      if (warm === null) s.onAt = 0;
      const collapsing = !s.view && s.offAt ? (t - s.offAt) / OFF_MS : null;
      const every = warm !== null || collapsing !== null ? 0 : dist < NEAR ? 80 : 1000;
      if (t - s.drawnAt >= every) {
        s.drawnAt = t;
        if (collapsing !== null) paintTube(s.g, collapsing, false);
        else if (warm !== null) paintTube(s.g, warm, true);
        else if (s.view) paintOs(s.g, s.view, now);
        s.tex.source.update();
        s.ver++;
      }
      // its light on the desk in front of it, at night
      if (s.view && night > 0.05 && facing) {
        const [fx, fy] = FRONT[(def.rot ?? 0) & 3];
        const p = toScreen(c.x + fx * 0.55, c.y + fy * 0.55);
        const z = Number(def.props?.z) || 0;
        placeGlow(s.glow, p.x, p.y - z, TILE_W * 1.4, TILE_H * 1.4, glowColor(s.view), 0.28 * night * alpha);
      } else s.glow.visible = false;
    }
    this.setHum(hum);
  }

  // For the third-person view: each lit glass and where it is.
  pictures() {
    const out: {
      def: WorldObjectDef;
      canvas: HTMLCanvasElement;
      at: { tl: [number, number]; tr: [number, number]; zTop: number; zBot: number };
      version: number;
    }[] = [];
    for (const s of this.screens.values()) {
      const at = computerGlass(s.def);
      if (at) out.push({ def: s.def, canvas: s.canvas, at, version: s.ver });
    }
    return out;
  }

  // a computer's fan + the tube's faint whine, from the nearest one that's on
  private setHum(level: number) {
    const ctx = mixer.ctx;
    if (!ctx || ctx.state !== "running") return;
    if (!this.hum && level > 0) {
      const osc = ctx.createOscillator();
      osc.type = "triangle";
      osc.frequency.value = 118;
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 260;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      osc.connect(lp).connect(gain).connect(mixer.buses.effects);
      osc.start();
      this.hum = { osc, gain };
    }
    if (this.hum) this.hum.gain.gain.setTargetAtTime(0.012 * level, ctx.currentTime, 0.3);
  }

  dispose() {
    for (const [id, s] of this.screens) this.drop(id, s);
    if (this.hum) {
      try {
        this.hum.osc.stop();
      } catch {}
      this.hum = null;
    }
  }
}

// The power switch: a click, the tube's thunk, the degauss hum dying away.
function powerOn(gain: number) {
  const ctx = mixer.ctx;
  if (!ctx || ctx.state !== "running" || gain <= 0.02) return;
  const out = mixer.buses.effects;
  const t = ctx.currentTime;
  const env = (g: GainNode, at: number, peak: number, len: number) => {
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak * gain), at + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, at + len);
  };
  const click = ctx.createOscillator();
  const cg = ctx.createGain();
  click.type = "square";
  click.frequency.setValueAtTime(2200, t);
  env(cg, t, 0.05, 0.03);
  click.connect(cg).connect(out);
  click.start(t);
  click.stop(t + 0.05);
  const thunk = ctx.createOscillator();
  const tg = ctx.createGain();
  thunk.frequency.setValueAtTime(110, t + 0.05);
  thunk.frequency.exponentialRampToValueAtTime(48, t + 0.2);
  env(tg, t + 0.05, 0.3, 0.25);
  thunk.connect(tg).connect(out);
  thunk.start(t + 0.05);
  thunk.stop(t + 0.35);
  const degauss = ctx.createOscillator();
  const dg = ctx.createGain();
  degauss.type = "sawtooth";
  degauss.frequency.value = 60;
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 400;
  env(dg, t + 0.08, 0.06, 0.9);
  degauss.connect(lp).connect(dg).connect(out);
  degauss.start(t + 0.08);
  degauss.stop(t + 1);
}
