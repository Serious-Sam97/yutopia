import { topCentre, type WorldObjectDef } from "@yutopia/shared";
import {
  type ComputerView,
  computerGlass,
  DEFAULT_ERA,
  type Era,
  isComputer,
  isEra,
  isPhase,
} from "@yutopia/shared/computer";
import { mixer } from "../audio";
import type { WorldController } from "../controller";
import { OS_H, OS_W, paintOs, paintTube } from "./screen";

// Marks this chunk for `pnpm budget` (it loads lazily, outside the page's files).
export const OS_CHUNK = "yutopia-os";

// The studio's computers while someone uses them (docs/plan/19-vortexos.md):
// each one in the room's `computers` gets a canvas drawn from what its OS
// reports (world/os/screen.ts), handed to the 3D view for its glass. A CRT
// warms up when it comes on and collapses to a dot when it goes off. Near
// you, it clicks on and hums.

const ON_MS = 520;
const OFF_MS = 420;
const NEAR = 14; // tiles: further away a picture is redrawn once a second
const HEAR = 4.5; // tiles: its fan, its click

interface Screen {
  def: WorldObjectDef;
  canvas: HTMLCanvasElement;
  g: CanvasRenderingContext2D;
  view: ComputerView | null; // what it shows (null: switched off, collapsing)
  onAt: number;
  offAt: number;
  drawnAt: number;
  ver: number; // counts its paints (the 3D view uploads it only when this moves)
}

export class OsRoom {
  private screens = new Map<string, Screen>();
  private hum: { osc: OscillatorNode; gain: GainNode } | null = null;

  constructor(private w: WorldController) {}

  private get model() {
    return this.w.model;
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
    return {
      def,
      canvas,
      g,
      view: null,
      onAt: 0,
      offAt: 0,
      drawnAt: 0,
      ver: 0,
    };
  }

  frame(_dt: number, me: { x: number; y: number }) {
    const model = this.model;
    if (!model) return;
    const views = this.views();
    const now = Date.now();
    const t = performance.now();
    const still = model.stillMotion();
    let hum = 0;
    // computers now in use (new ones warm up)
    for (const [id, v] of views) {
      const def = model.getObject(id);
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
      const def = model.getObject(id);
      if (!def) {
        this.screens.delete(id);
        continue;
      }
      s.def = def;
      if (!v && s.view) {
        // switched off: the tube collapses
        s.view = null;
        s.offAt = still ? 0 : t;
      }
      const off = !s.view && (!s.offAt || t - s.offAt > OFF_MS);
      if (off) {
        this.screens.delete(id);
        continue;
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
        s.ver++;
      }
    }
    this.setHum(hum);
  }

  // For the 3D view: each lit glass and where it is.
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
    this.screens.clear();
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
