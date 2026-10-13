import { footprint, TILE_H, TILE_W, toScreen, type WorldObjectDef } from "@yutopia/shared";
import {
  type CarState,
  laneOffset,
  newCar,
  SLOT_COLORS,
  SLOT_GANTRY,
  SLOT_LANES,
  SLOT_LAP,
  SLOT_REACH,
  SLOT_SLIDE,
  SLOT_TOP,
  SLOT_VMAX,
  slotBend,
  slotCrash,
  slotLamps,
  slotPoint,
  slotSlip,
  slotTurn,
  stepCar,
} from "@yutopia/shared/slotcar";
import { Graphics } from "pixi.js";
import { mixer } from "./audio";
import type { WorldEngine } from "./engine";
import { fanfare } from "./foley";
import { hud, type SlotLane, type SlotView } from "./store";

// The slot-car tracks, live (its own lazy chunk, loaded once a space has a
// track): the cars drawn on every track for everyone, my own car driven here
// (my trigger, the shared physics, no wait for the server) and reported 20 times
// a second, everyone else's smoothed from what the server relays, the motors'
// whine and the start beeps from where you stand.

// Marks this chunk for `pnpm budget`.
export const SLOTS_CHUNK = "yutopia-slots";

// biome-ignore lint/suspicious/noExplicitAny: colyseus schema instances
type S = any;
type Send = (type: string, msg: Record<string, unknown>) => void;

const DELAY = 110; // ms behind the newest report: others' cars ride between two
const SEND_MS = 50;
const HEAR = 12; // tiles: how far the motors carry
const GRID_BACK = 0.12; // cars are drawn this far behind their progress (nose on the line)
const INK = 0x2a1a12;
const COLORS = SLOT_COLORS.map((c) => Number.parseInt(c.slice(1), 16));

interface Sample {
  t: number;
  s: number;
  v: number;
  off: number;
  ov: number;
}

interface TrackView {
  def: WorldObjectDef;
  slices: Graphics[]; // one per slice of the table's drawing, sorted with it
  glows: Graphics[]; // over each slice, untouched by the room's light (lamps, sparks)
  lanes: Sample[][]; // others' cars: recent reports
  seen: string[]; // the last report per lane (to spot new ones)
  phase: string;
  lights: number;
  wasOff: boolean[];
  goAt: number; // when the lights went out (the lamps flash)
  sparks: Spark[]; // off the braids under fast cars
}

interface Spark {
  x: number; // world tiles
  y: number;
  vx: number;
  vy: number;
  life: number; // s left
}

interface Voice {
  osc: OscillatorNode;
  gain: GainNode;
  pan: StereoPannerNode;
}

export class SlotTracks {
  private tracks = new Map<string, TrackView>();
  private car: CarState = newCar();
  private carTrack = ""; // the track my car is on
  private throttle = 0;
  private sentAt = 0;
  private raceAt = 0; // when the lights went out here
  private finished = false;
  private cheered = false;
  private voices = new Map<string, Voice>(); // track|lane → its motor
  private viewSig = "";

  constructor(
    private engine: WorldEngine,
    private room: { state: S; sessionId: string },
    private send: Send,
  ) {}

  // The tracks in the room changed (placed, moved, removed).
  refresh() {
    const defs = this.engine.allObjects().filter((o) => o.kind === "slot_track");
    const keep = new Set<string>();
    for (const def of defs) {
      keep.add(def.id);
      const old = this.tracks.get(def.id);
      if (old && old.def.x === def.x && old.def.y === def.y && (old.def.rot ?? 0) === (def.rot ?? 0)) {
        old.def = def;
        continue;
      }
      if (old) this.drop(def.id);
      // the table's drawing is cut along its 4-tile side (columns at rot 0/2,
      // rows at 1/3); each slice sorts at its first tile's middle (scene.ts)
      const slices: Graphics[] = [];
      const glows: Graphics[] = [];
      for (let i = 0; i < 4; i++) {
        const g = new Graphics();
        g.zIndex = def.x + def.y + i + 1 + 0.004; // just above the table's slice
        const glow = new Graphics();
        glow.zIndex = g.zIndex + 0.0005;
        this.engine.mountLive(g);
        this.engine.mountLive(glow);
        slices.push(g);
        glows.push(glow);
      }
      this.tracks.set(def.id, {
        def,
        slices,
        glows,
        lanes: Array.from({ length: SLOT_LANES }, () => []),
        seen: Array(SLOT_LANES).fill(""),
        phase: "lobby",
        lights: 0,
        wasOff: Array(SLOT_LANES).fill(false),
        goAt: 0,
        sparks: [],
      });
    }
    for (const id of [...this.tracks.keys()]) if (!keep.has(id)) this.drop(id);
  }

  private drop(id: string) {
    const v = this.tracks.get(id);
    if (!v) return;
    for (const g of [...v.slices, ...v.glows]) g.destroy();
    this.tracks.delete(id);
    for (const [k, voice] of this.voices) if (k.startsWith(`${id}|`)) this.stopVoice(k, voice);
  }

  // ── what the panel does ──────────────────────────────────────────────────
  join(id: string, lane: number) {
    void mixer.resume();
    this.send("slot:join", { id, lane });
  }
  leave(id: string) {
    this.send("slot:leave", { id });
  }
  start(id: string, laps: number) {
    this.send("slot:start", { id, laps });
  }
  setThrottle(u: number) {
    this.throttle = Math.max(0, Math.min(1, u));
  }
  // for the panel's gauges (read every frame, no React)
  live(): { speed: number; slip: number; clock: number; throttle: number } {
    const racing = this.carTrack && this.race(this.carTrack)?.phase === "race";
    return {
      speed: this.car.v / SLOT_VMAX,
      slip: this.car.off ? 1 : slotSlip(this.car),
      clock: racing && this.raceAt ? (performance.now() - this.raceAt) / 1000 : 0,
      throttle: this.throttle,
    };
  }
  myLane(id: string): number {
    const race = this.race(id);
    if (!race) return -1;
    for (const [lane, c] of race.cars as Map<string, S>) if (c.sid === this.room.sessionId) return Number(lane);
    return -1;
  }
  racing(): boolean {
    return !!this.carTrack && this.race(this.carTrack)?.phase === "race" && !this.finished;
  }

  private race(id: string): S | undefined {
    return this.room.state.slots?.get(id);
  }

  // At a track's controls with a lane (shown holding the controller).
  atControls(): boolean {
    return !!this.focus && this.myLane(this.focus) >= 0;
  }

  // ── every frame ──────────────────────────────────────────────────────────
  // `me`: where I stand
  private dt = 1 / 60;
  frame(dt: number, me: { x: number; y: number }) {
    const now = performance.now();
    this.dt = Math.min(0.1, dt);
    const pk = hud.get().panel;
    this.lean(pk.kind === "slotcar" && pk.objectId && this.tracks.has(pk.objectId) ? pk.objectId : null);
    this.drive(dt, now);
    for (const [id, v] of this.tracks) this.drawTrack(id, v, now, me);
    this.publish(this.focus, me);
  }

  // The controls of a track open (or close): the camera leans in over the
  // table, so it fills the view above the console; people standing in front
  // of it turn see-through. Closing gives the lane back and the camera returns.
  private focus: string | null = null;
  private zoomBack = 0;
  private lean(focus: string | null) {
    if (focus === this.focus) return;
    const engine = this.engine;
    if (this.focus && this.myLane(this.focus) >= 0) this.leave(this.focus);
    if (focus) {
      const o = this.tracks.get(focus)?.def as WorldObjectDef;
      const { w, h } = footprint(o.kind, o.rot ?? 0);
      if (!this.focus) this.zoomBack = engine.getZoom();
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const panel = Math.min(260, vh * 0.42);
      const zoom = Math.min(
        ((vw - 32) * 0.86) / ((w + h) * (TILE_W / 2)),
        ((vh - panel) * 0.8) / ((w + h) * (TILE_H / 2) + 50),
      );
      engine.pinCamera({
        x: o.x + w / 2,
        y: o.y + h / 2,
        z: SLOT_TOP - panel / 2 / Math.max(0.5, zoom),
        zoom,
        ease: true,
      });
      engine.seeThrough = { x: o.x, y: o.y, w, h };
    } else {
      engine.pinCamera(null);
      engine.seeThrough = null;
      if (this.zoomBack) engine.setZoom(this.zoomBack);
    }
    this.focus = focus;
  }

  // My car: the shared physics with my trigger, reported to the server.
  private drive(dt: number, now: number) {
    let mine = "";
    for (const id of this.tracks.keys()) if (this.myLane(id) >= 0) mine = id;
    if (mine !== this.carTrack) {
      this.carTrack = mine;
      this.car = newCar();
      this.finished = false;
    }
    if (!mine) return;
    const race = this.race(mine);
    const v = this.tracks.get(mine);
    if (!race || !v) return;
    if (race.phase !== "race") {
      if (v.phase === "race" || this.car.s) this.car = newCar();
      this.finished = false;
      this.cheered = false;
      return;
    }
    const placed = race.cars.get(String(this.myLane(mine)))?.place ?? 0;
    if (placed && !this.cheered) {
      this.cheered = true;
      fanfare(placed === 1 ? 1 : 0.5);
    }
    if (this.finished) return;
    const flew = stepCar(this.car, this.throttle, dt);
    if (flew) this.crashSound(v.def, 1);
    const goal = race.laps * SLOT_LAP;
    if (this.car.s >= goal) {
      this.car.s = goal;
      this.car.v = 0;
      this.finished = true;
    }
    if (now - this.sentAt >= SEND_MS || this.finished) {
      this.sentAt = now;
      this.send("slot:car", { id: mine, s: this.car.s, v: this.car.v, off: this.car.off, ov: this.car.ov });
    }
  }

  private drawTrack(id: string, v: TrackView, now: number, me: { x: number; y: number }) {
    const race = this.race(id);
    const phase: string = race?.phase ?? "lobby";
    const lights: number = race?.lights ?? 0;
    const o = v.def;
    const dist = this.distanceTo(o, me);
    // phase changes: the start beeps, the motors, my finish
    if (phase !== v.phase) {
      if (phase === "race") {
        v.goAt = now;
        if (dist < HEAR) this.beep(1046, 0.38, dist);
        if (this.myLane(id) >= 0) this.raceAt = now;
        for (const l of v.lanes) l.length = 0;
      }
      if (v.phase === "race")
        for (const [k, voice] of this.voices) if (k.startsWith(`${id}|`)) this.stopVoice(k, voice);
      v.phase = phase;
    }
    if (phase === "countdown" && lights > v.lights && dist < HEAR) this.beep(523, 0.14, dist);
    v.lights = lights;

    const rot = o.rot ?? 0;
    const local = (x: number, y: number): [number, number] => {
      const [X, Y] = slotTurn(x, y, rot);
      return [o.x + X, o.y + Y];
    };
    const cols = rot % 2 === 0;
    const sliceOf = (wx: number, wy: number) => Math.max(0, Math.min(3, Math.floor(cols ? wx - o.x : wy - o.y)));
    for (const g of [...v.slices, ...v.glows]) g.clear();

    // the cars: everyone's lane, parked on the grid when nobody drives it
    const mineLane = this.myLane(id);
    const cars = (race?.cars ?? new Map()) as Map<string, S>;
    const ops: Op[] = [];
    for (let lane = 0; lane < SLOT_LANES; lane++) {
      const c = cars.get(String(lane));
      let st: CarState;
      if (lane === mineLane && this.carTrack === id && phase === "race") st = this.car;
      else if (c && phase === "race") st = this.others(v, lane, c, now);
      else if (c && phase === "done") st = { s: c.s, v: 0, off: 0, ov: 0 };
      else st = newCar();
      // a car that flies off: sparks and a clack where it leaves
      const off = st.off > 0;
      if (off && !v.wasOff[lane] && lane !== mineLane) {
        const p = slotPoint(st.s, laneOffset(lane));
        const [wx, wy] = local(p.x, p.y);
        this.engine.puff(wx, wy, "spark", SLOT_TOP + 2);
        if (dist < HEAR) this.crashSound(o, Math.max(0, 1 - dist / HEAR));
      } else if (off && !v.wasOff[lane] && lane === mineLane) {
        const p = slotPoint(st.s, laneOffset(lane));
        const [wx, wy] = local(p.x, p.y);
        this.engine.puff(wx, wy, "spark", SLOT_TOP + 2);
      }
      v.wasOff[lane] = off;
      ops.push(this.carOp(lane, st, local));
      // sparks off the braids under a fast car (the guide's at its nose)
      if (!off && st.v > 1.6 && this.engine.animated() && Math.random() < (st.v / SLOT_VMAX) * 0.55) {
        const p = slotPoint(st.s - GRID_BACK + 0.11, laneOffset(lane));
        const [wx, wy] = local(p.x, p.y);
        const [bx, by] = local(p.x - Math.cos(p.h) * 0.3, p.y - Math.sin(p.h) * 0.3);
        const k = 0.6 + Math.random() * 0.8;
        v.sparks.push({
          x: wx,
          y: wy,
          vx: (bx - wx) * k + (Math.random() - 0.5) * 0.25,
          vy: (by - wy) * k + (Math.random() - 0.5) * 0.25,
          life: 0.16 + Math.random() * 0.12,
        });
      }
      this.motor(id, lane, phase === "race" && !!c ? st.v : 0, o, me, dist);
    }
    const flash = phase === "race" && now - v.goAt < 900;
    const flag = phase === "done" || (phase === "race" && [...cars.values()].some((c) => c.place));
    ops.push(...this.gantryOps(phase === "countdown" ? lights : flash ? -1 : 0, flag, local, now));
    const dt = this.dt;
    for (const sp of v.sparks) sp.life -= dt;
    v.sparks = v.sparks.filter((sp) => sp.life > 0);
    for (const sp of v.sparks) {
      sp.x += sp.vx * dt;
      sp.y += sp.vy * dt;
      ops.push({
        x: sp.x,
        y: sp.y,
        depth: sp.x + sp.y,
        draw: (_g, glow) => {
          const a = toScreen(sp.x, sp.y);
          const b = toScreen(sp.x - sp.vx * 0.03, sp.y - sp.vy * 0.03);
          const z = SLOT_TOP + 0.5;
          glow
            .moveTo(a.x, a.y - z)
            .lineTo(b.x, b.y - z)
            .stroke({ width: 0.7, color: sp.life > 0.12 ? 0xffe2a8 : 0xffa630, alpha: Math.min(1, sp.life * 6) });
        },
      });
    }
    // back to front (each piece is small, so its middle sorts it)
    ops.sort((a, b) => a.depth - b.depth);
    for (const op of ops) {
      const i = sliceOf(op.x, op.y);
      op.draw(v.slices[i], v.glows[i]);
    }
    // the light where the table stands (night: lamps, windows)
    for (let i = 0; i < v.slices.length; i++) {
      const [wx, wy] = cols ? [o.x + i + 0.5, o.y + 1.5] : [o.x + 1.5, o.y + i + 0.5];
      v.slices[i].tint = this.engine.liveTint(wx, wy);
    }
  }

  // Someone else's car, a moment behind their reports (smooth at any frame rate).
  private others(v: TrackView, lane: number, c: S, now: number): CarState {
    const buf = v.lanes[lane];
    const sig = `${c.s}|${c.off}`;
    if (sig !== v.seen[lane]) {
      v.seen[lane] = sig;
      buf.push({ t: now, s: c.s, v: c.v, off: c.off, ov: c.ov });
      if (buf.length > 12) buf.shift();
    }
    if (!buf.length) return { s: c.s, v: c.v, off: c.off, ov: c.ov };
    const t = now - DELAY;
    let i = buf.length - 1;
    while (i > 0 && buf[i - 1].t > t) i--;
    const b = buf[i];
    const a = buf[i - 1];
    if (!a || t >= b.t) {
      // past the newest: run on a little at its speed (a late report)
      const ahead = Math.min(0.12, Math.max(0, (t - b.t) / 1000));
      return { s: b.s + (b.off ? 0 : b.v * ahead), v: b.v, off: b.off ? b.off + ahead : 0, ov: b.ov };
    }
    const k = Math.max(0, Math.min(1, (t - a.t) / Math.max(1, b.t - a.t)));
    if (a.off && b.off) return { s: b.s, v: 0, off: a.off + (b.off - a.off) * k, ov: b.ov };
    if (a.off !== 0 || b.off !== 0) return k < 0.5 ? { ...a } : { ...b };
    return { s: a.s + (b.s - a.s) * k, v: a.v + (b.v - a.v) * k, off: 0, ov: 0 };
  }

  // A little 1:32 car, an 80s formula car: wedge nose and front wing, sidepods
  // in the lane's colour, the driver's helmet in the cockpit, the airbox, the
  // rear wing on its struts, four fat tyres. Built from small shaded prisms in
  // the car's own frame (x forward, y left, in half-lengths / half-widths),
  // turned to its heading at any angle.
  private carOp(lane: number, st: CarState, local: (x: number, y: number) => [number, number]): Op {
    const off = laneOffset(lane);
    let x: number;
    let y: number;
    let h: number;
    let lift = 0;
    let tilt = 0;
    if (st.off > 0) {
      const c = slotCrash(st, lane);
      x = c.x;
      y = c.y;
      h = c.h + (this.engine.stillMotion() ? 0 : c.spin);
      lift = Math.sin(Math.min(1, st.off / 0.5) * Math.PI) * 5 * c.out;
    } else {
      const p = slotPoint(st.s - GRID_BACK, off);
      x = p.x;
      y = p.y;
      // the tail steps out in a fast corner, the body leans
      const pull = slotSlip(st);
      const yaw = Math.max(0, Math.min(1.4, (pull - SLOT_SLIDE) / (1 - SLOT_SLIDE)));
      const bend = Math.sign(slotBend(st.s));
      h = p.h + bend * yaw * 0.32;
      tilt = bend * Math.min(1, pull) * 0.5;
    }
    const L = 0.15;
    const W = 0.06;
    const fx = Math.cos(h);
    const fy = Math.sin(h);
    const nx = Math.sin(h);
    const ny = -Math.cos(h);
    const pt = (a: number, b: number): [number, number] =>
      local(x + fx * L * a + nx * W * b, y + fy * L * a + ny * W * b);
    const [cx, cy] = local(x, y);
    const z0 = SLOT_TOP + 0.3 + lift;
    const color = COLORS[lane];
    const dark = shade(color, 0.55);
    return {
      x: cx,
      y: cy,
      depth: cx + cy,
      draw: (g, glow) => {
        // the shadow, a little to the lower right (light from the upper left)
        const sc = toScreen(cx + 0.015, cy + 0.015);
        g.ellipse(sc.x, sc.y - SLOT_TOP - 0.15, L * 32 * 1.15, L * 16 * 1.0).fill({ color: INK, alpha: 0.26 });
        const poly = (pts: [number, number][]) => pts.map(([a, b]) => pt(a, b));
        const parts: { pts: [number, number][]; z0: number; h: number; color: number; top?: number; on?: boolean }[] =
          [];
        // tyres (rear ones fatter), the body and what's on it
        const tyre = (x0: number, x1: number, side: number, h2: number) =>
          parts.push({
            pts: poly([
              [x1, side * 0.62],
              [x0, side * 0.62],
              [x0, side * 1.0],
              [x1, side * 1.0],
            ]),
            z0,
            h: h2,
            color: 0x24221f,
            top: 0x3a3733,
          });
        const lean = (b: number) => b * tilt; // the outside of a corner sits a touch lower
        tyre(0.5, 0.82, 1, 2.1);
        tyre(0.5, 0.82, -1, 2.1);
        tyre(-0.92, -0.5, 1, 2.6);
        tyre(-0.92, -0.5, -1, 2.6);
        const under = parts.length;
        parts.push({
          pts: poly([
            [1.08, 0.95],
            [0.9, 0.95],
            [0.9, -0.95],
            [1.08, -0.95],
          ]),
          z0: z0 + 0.4,
          h: 0.6,
          color: dark,
        }); // front wing
        parts.push({
          pts: poly([
            [1.05, 0.22],
            [0.3, 0.5],
            [0.3, -0.5],
            [1.05, -0.22],
          ]),
          z0: z0 + 0.6,
          h: 1.4 + lean(0),
          color,
        }); // the nose
        parts.push({
          pts: poly([
            [0.35, 0.5],
            [-0.85, 0.55],
            [-0.95, 0.4],
            [-0.95, -0.4],
            [-0.85, -0.55],
            [0.35, -0.5],
          ]),
          z0: z0 + 0.6,
          h: 2.2,
          color,
        }); // the tub
        parts.push({
          pts: poly([
            [0.15, 0.78],
            [-0.55, 0.8],
            [-0.62, 0.55],
            [0.2, 0.52],
          ]),
          z0: z0 + 0.6,
          h: 1.5 - lean(1) * 0.6,
          color: shade(color, 0.9),
        }); // sidepods
        parts.push({
          pts: poly([
            [0.15, -0.52],
            [-0.62, -0.55],
            [-0.55, -0.8],
            [0.2, -0.78],
          ]),
          z0: z0 + 0.6,
          h: 1.5 + lean(1) * 0.6,
          color: shade(color, 0.9),
        });
        parts.push({
          pts: poly([
            [-0.05, 0.22],
            [-0.55, 0.26],
            [-0.55, -0.26],
            [-0.05, -0.22],
          ]),
          z0: z0 + 2.8,
          h: 1.3,
          color: dark,
        }); // airbox
        parts.push({
          pts: poly([
            [-0.92, 1.0],
            [-1.1, 1.0],
            [-1.1, -1.0],
            [-0.92, -1.0],
          ]),
          z0: z0 + 3.9,
          h: 0.6,
          color: dark,
        }); // rear wing
        // body first (tyres behind it before, those in front after), then what's on top
        const body = parts.slice(under);
        const tyres = parts.slice(0, under);
        const mid = cx + cy;
        const depthOf = (q: { pts: [number, number][] }) =>
          q.pts.reduce((s2, p2) => s2 + p2[0] + p2[1], 0) / q.pts.length;
        const part = (q: (typeof parts)[number]) =>
          prism(g, q.pts, q.z0, q.h, q.color, q.top ?? shade(q.color, 1.18), 0.5);
        for (const q of tyres) if (depthOf(q) < mid) part(q);
        for (const q of body.slice(0, 5)) part(q);
        // a white stripe down the nose, the cockpit and the driver's helmet
        g.poly(
          flat(
            poly([
              [1.0, 0.07],
              [0.38, 0.1],
              [0.38, -0.1],
              [1.0, -0.07],
            ]),
            z0 + 2.05,
          ),
        ).fill({ color: 0xf2e8d2, alpha: 0.95 });
        g.poly(
          flat(
            poly([
              [0.32, 0.3],
              [-0.06, 0.3],
              [-0.06, -0.3],
              [0.32, -0.3],
            ]),
            z0 + 2.85,
          ),
        ).fill(0x1d1a17);
        const hp = toScreen(...pt(0.12, 0));
        g.circle(hp.x, hp.y - z0 - 3.9, 1.05)
          .fill(0xf2e8d2)
          .stroke({ width: 0.3, color: INK, alpha: 0.7 });
        g.ellipse(hp.x + fx * 0.35, hp.y - z0 - 3.95, 0.7, 0.35).fill(0x2b2a26);
        // a gloss streak along the tub
        g.poly(
          flat(
            poly([
              [-0.1, 0.3],
              [-0.8, 0.34],
              [-0.8, 0.44],
              [-0.1, 0.4],
            ]),
            z0 + 2.82,
          ),
        ).fill({ color: 0xffffff, alpha: 0.35 });
        for (const q of body.slice(5)) part(q);
        // the wing's struts
        for (const b of [0.35, -0.35]) {
          const s0 = toScreen(...pt(-0.98, b));
          g.moveTo(s0.x, s0.y - z0 - 2.6)
            .lineTo(s0.x, s0.y - z0 - 3.9)
            .stroke({ width: 0.4, color: INK, alpha: 0.8 });
        }
        for (const q of tyres) if (depthOf(q) >= mid) part(q);
        // the tail light, when the back's towards us
        const [rx, ry] = pt(-1.04, 0);
        if (rx + ry > mid) {
          const r = toScreen(rx, ry);
          glow.circle(r.x, r.y - z0 - 1.6, 1.4).fill({ color: 0xff4a2a, alpha: 0.3 });
          glow.circle(r.x, r.y - z0 - 1.6, 0.6).fill(0xff6a3a);
        }
      },
    };
  }

  // The start gantry over the line: two posts on plates, a bar in five pieces
  // (so cars sort under it), a chequered banner under it, a lamp on each piece
  // — red one by one, out at GO (a quick phosphor flash) — and the chequered
  // flag waving on top once someone has finished.
  private gantryOps(lit: number, flag: boolean, local: (x: number, y: number) => [number, number], now: number): Op[] {
    const ops: Op[] = [];
    const rect = (x0: number, y0: number, x1: number, y1: number): [number, number][] => [
      local(x0, y0),
      local(x1, y0),
      local(x1, y1),
      local(x0, y1),
    ];
    const at = (wx: number, wy: number, draw: (g: Graphics, glow: Graphics) => void): Op => ({
      x: wx,
      y: wy,
      depth: wx + wy,
      draw,
    });
    const G = SLOT_TOP + SLOT_GANTRY;
    for (const side of [-1, 1]) {
      const p = slotPoint(0.02, side * GANTRY_POST);
      const [wx, wy] = local(p.x, p.y);
      ops.push(
        at(wx, wy, (g) => {
          prism(g, rect(p.x - 0.05, p.y - 0.05, p.x + 0.05, p.y + 0.05), SLOT_TOP, 0.8, 0x8d877a);
          prism(g, rect(p.x - 0.025, p.y - 0.025, p.x + 0.025, p.y + 0.025), SLOT_TOP + 0.8, SLOT_GANTRY + 2.2, ALU);
        }),
      );
    }
    const lamps = slotLamps();
    const a = slotPoint(0.02, -GANTRY_POST);
    const b = slotPoint(0.02, GANTRY_POST);
    for (let i = 0; i < 5; i++) {
      const y0 = a.y + ((b.y - a.y) * i) / 5;
      const y1 = a.y + ((b.y - a.y) * (i + 1)) / 5;
      const l = lamps[i];
      const [wx, wy] = local(a.x, (y0 + y1) / 2);
      ops.push(
        at(wx, wy, (g, glow) => {
          // the banner: a chequered strip hanging under this piece of the bar
          const lo = Math.min(y0, y1);
          const hi = Math.max(y0, y1);
          for (let c = 0; c < 4; c++)
            for (let r = 0; r < 2; r++) {
              const ya = lo + ((hi - lo) * c) / 4;
              const yb = lo + ((hi - lo) * (c + 1)) / 4;
              const za = G - 3.4 + r * 1.6;
              const q = [local(a.x, ya), local(a.x, yb)];
              g.poly([...flat(q, za), ...flat([q[1], q[0]], za + 1.6)]).fill((c + r + i) % 2 ? 0xf2e8d2 : 0x1c1a17);
            }
          prism(g, rect(a.x - 0.045, lo, a.x + 0.045, hi), G, 3, 0x2b2a26);
          // its lamp in a little hood
          const [lx, ly] = local(l.x, l.y);
          const s = toScreen(lx, ly);
          const on = lit > 0 && i < lit;
          const go = lit < 0;
          g.roundRect(s.x - 2.6, s.y - l.z - 2.2, 5.2, 3.6, 1).fill(0x15120f);
          if (on || go) {
            const c = on ? 0xff5a36 : 0xd4e4a6;
            glow.ellipse(s.x, s.y - l.z, 5, 3).fill({ color: c, alpha: 0.28 });
            glow.circle(s.x, s.y - l.z, 1.4).fill(c);
          } else g.circle(s.x, s.y - l.z, 1.3).fill(0x3a1712);
        }),
      );
    }
    if (flag) {
      // a chequered flag on a short pole over the middle of the bar, waving
      const m = slotPoint(0.02, 0);
      const [wx, wy] = local(m.x, m.y);
      const t = now / 1000;
      ops.push(
        at(wx + 0.01, wy + 0.01, (g) => {
          const base = toScreen(wx, wy);
          const top = G + 12;
          g.moveTo(base.x, base.y - G - 3)
            .lineTo(base.x, base.y - top)
            .stroke({ width: 0.8, color: ALU });
          const cols = 6;
          const rows = 4;
          const fw = 14;
          const fh = 8;
          const wave = (u: number) => Math.sin(u * 3.2 - t * 9) * 1.6 * u;
          for (let c = 0; c < cols; c++)
            for (let r = 0; r < rows; r++) {
              const u0 = c / cols;
              const u1 = (c + 1) / cols;
              const x0 = base.x + u0 * fw;
              const x1 = base.x + u1 * fw;
              const y0 = base.y - top + (r * fh) / rows;
              const y1 = y0 + fh / rows;
              g.poly([x0, y0 + wave(u0), x1, y0 + wave(u1), x1, y1 + wave(u1), x0, y1 + wave(u0)]).fill(
                (c + r) % 2 ? 0xf2e8d2 : 0x1c1a17,
              );
            }
        }),
      );
    }
    return ops;
  }

  // The HUD's view of the track whose controls are open (only when it changes).
  private publish(focus: string | null, me: { x: number; y: number }) {
    if (!focus) {
      if (this.viewSig) {
        this.viewSig = "";
        hud.set({ slot: null });
      }
      return;
    }
    const race = this.race(focus);
    const o = this.tracks.get(focus)?.def;
    const lanes: (SlotLane | null)[] = Array(SLOT_LANES).fill(null);
    // positions: the finished by place, then whoever's furthest round
    const order =
      race?.phase === "race" || race?.phase === "done"
        ? [...(race.cars as Map<string, S>).entries()]
            .sort(([, a], [, b]) => (a.place || 99) - (b.place || 99) || b.s - a.s)
            .map(([lane]) => lane)
        : [];
    if (race)
      for (const [lane, c] of race.cars as Map<string, S>)
        lanes[Number(lane)] = {
          pos: order.indexOf(lane) + 1,
          name: c.name,
          uid: c.uid,
          mine: c.sid === this.room.sessionId,
          lap: c.lap,
          best: c.best,
          last: c.last,
          place: c.place,
          time: c.time,
          offs: c.offs,
        };
    const view: SlotView = {
      id: focus,
      phase: (race?.phase ?? "lobby") as SlotView["phase"],
      lights: race?.lights ?? 0,
      laps: race?.laps ?? 5,
      by: race?.by ?? "",
      lanes,
      mine: this.myLane(focus),
      near: !!o && this.distanceTo(o, me) <= SLOT_REACH,
    };
    const sig = JSON.stringify(view);
    if (sig === this.viewSig) return;
    this.viewSig = sig;
    hud.set({ slot: view });
  }

  private distanceTo(o: WorldObjectDef, me: { x: number; y: number }) {
    const rot = o.rot ?? 0;
    const w = rot % 2 ? 3 : 4;
    const h = rot % 2 ? 4 : 3;
    const cx = Math.max(o.x, Math.min(me.x, o.x + w));
    const cy = Math.max(o.y, Math.min(me.y, o.y + h));
    return Math.hypot(me.x - cx, me.y - cy);
  }

  // ── sound ────────────────────────────────────────────────────────────────
  // Each running car whines with its speed, heard from where the track is.
  private motor(
    id: string,
    lane: number,
    speed: number,
    o: WorldObjectDef,
    me: { x: number; y: number },
    dist: number,
  ) {
    const key = `${id}|${lane}`;
    const near = Math.max(0, 1 - dist / HEAR);
    let voice = this.voices.get(key);
    if (speed <= 0.02 || near <= 0) {
      if (voice) this.stopVoice(key, voice);
      return;
    }
    const ctx = mixer.ctx;
    if (!ctx || ctx.state !== "running") return;
    if (!voice) {
      const osc = ctx.createOscillator();
      osc.type = "sawtooth";
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 1400;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      const pan = ctx.createStereoPanner();
      osc.connect(lp).connect(gain).connect(pan).connect(mixer.buses.effects);
      osc.start();
      voice = { osc, gain, pan };
      this.voices.set(key, voice);
    }
    const t = ctx.currentTime;
    const k = speed / SLOT_VMAX;
    // a little detune per lane so four cars don't merge into one note
    voice.osc.frequency.setTargetAtTime((90 + k * 340) * (1 + lane * 0.035), t, 0.04);
    voice.gain.gain.setTargetAtTime((0.012 + 0.045 * k) * near, t, 0.05);
    const rot = o.rot ?? 0;
    const cx = o.x + (rot % 2 ? 1.5 : 2);
    const cy = o.y + (rot % 2 ? 2 : 1.5);
    voice.pan.pan.setTargetAtTime(Math.max(-1, Math.min(1, (cx - cy - (me.x - me.y)) / 8)), t, 0.1);
  }

  private stopVoice(key: string, v: Voice) {
    this.voices.delete(key);
    const ctx = mixer.ctx;
    const t = ctx?.currentTime ?? 0;
    v.gain.gain.setTargetAtTime(0, t, 0.05);
    v.osc.stop(t + 0.3);
  }

  private beep(f: number, len: number, dist: number) {
    const ctx = mixer.ctx;
    if (!ctx || ctx.state !== "running") return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = "square";
    o.frequency.value = f;
    const g = ctx.createGain();
    const peak = 0.06 * Math.max(0.2, 1 - dist / HEAR);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.01);
    g.gain.setValueAtTime(peak, t + len - 0.04);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    o.connect(g).connect(mixer.buses.effects);
    o.start(t);
    o.stop(t + len + 0.02);
  }

  // A car leaving its slot: the plastic clack and a skid.
  private crashSound(_o: WorldObjectDef, gain: number) {
    const ctx = mixer.ctx;
    if (!ctx || ctx.state !== "running" || gain <= 0.02) return;
    const t = ctx.currentTime;
    const len = 0.32;
    const b = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * len), ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length) ** 2;
    const s = ctx.createBufferSource();
    s.buffer = b;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 2400;
    bp.Q.value = 1.2;
    const g = ctx.createGain();
    g.gain.value = 0.16 * gain;
    s.connect(bp).connect(g).connect(mixer.buses.effects);
    s.start(t);
  }

  dispose() {
    this.lean(null);
    for (const id of [...this.tracks.keys()]) this.drop(id);
    for (const [k, voice] of this.voices) this.stopVoice(k, voice);
  }
}

// Something to draw live, sorted back to front by its middle (world tiles).
interface Op {
  x: number;
  y: number;
  depth: number;
  draw: (g: Graphics, glow: Graphics) => void; // glow: untinted, for what gives light
}

const ALU = 0xb9b2a3;
const GANTRY_POST = 0.36;

// world tiles + height → screen px, as a flat list for Graphics.poly
function flat(pts: [number, number][], z: number): number[] {
  return pts.flatMap(([x, y]) => {
    const p = toScreen(x, y);
    return [p.x, p.y - z];
  });
}

// A small shaded prism over a convex footprint (world corners): the sides that
// face the room, each shaded by which way it faces (light from the upper left),
// the top, ink round it.
function prism(g: Graphics, base: [number, number][], z0: number, h: number, color: number, top?: number, ink = 1) {
  const cx = base.reduce((s, p) => s + p[0], 0) / base.length;
  const cy = base.reduce((s, p) => s + p[1], 0) / base.length;
  for (let i = 0; i < base.length; i++) {
    const a = base[i];
    const b = base[(i + 1) % base.length];
    let nx = b[1] - a[1];
    let ny = a[0] - b[0];
    const len = Math.hypot(nx, ny) || 1;
    nx /= len;
    ny /= len;
    if (nx * ((a[0] + b[0]) / 2 - cx) + ny * ((a[1] + b[1]) / 2 - cy) < 0) {
      nx = -nx;
      ny = -ny;
    }
    if (nx + ny <= 0.02) continue; // faces away
    g.poly([...flat([a, b], z0), ...flat([b, a], z0 + h)])
      .fill(shade(color, 0.74 + 0.1 * (ny - nx)))
      .stroke({ width: 0.45 * ink, color: INK, alpha: 0.4 + 0.3 * ink });
  }
  g.poly(flat(base, z0 + h))
    .fill(top ?? shade(color, 1.1))
    .stroke({ width: 0.55 * ink, color: INK, alpha: 0.45 + 0.4 * ink });
}

function shade(c: number, f: number): number {
  const ch = (v: number) => Math.max(0, Math.min(255, Math.round(f > 1 ? v + (255 - v) * (f - 1) : v * f)));
  return (ch((c >> 16) & 255) << 16) | (ch((c >> 8) & 255) << 8) | ch(c & 255);
}
