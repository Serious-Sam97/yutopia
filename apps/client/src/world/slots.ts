import type { WorldObjectDef } from "@yutopia/shared";
import {
  type CarState,
  laneOffset,
  newCar,
  SLOT_COLORS,
  SLOT_LANES,
  SLOT_REACH,
  SLOT_SLIDE,
  SLOT_TOP,
  SLOT_VMAX,
  type SlotSetup,
  type SlotTrackId,
  slotBend,
  slotCrash,
  slotDiffOf,
  slotLap,
  slotPoint,
  slotSlip,
  slotTrackOf,
  slotTurn,
  stepCar,
} from "@yutopia/shared/slotcar";
import { mixer } from "./audio";
import { fanfare } from "./foley";
import type { WorldModel } from "./model";
import { hud, type SlotLane, type SlotView } from "./store";

// The slot-car tracks, live (its own lazy chunk, loaded once a space has a
// track): the cars on every track for everyone (the 3D view's `cars()`), my own car driven here
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
const GRID_BACK = 0.12; // cars sit this far behind their progress (nose on the line)
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
  lanes: Sample[][]; // others' cars: recent reports
  seen: string[]; // the last report per lane (to spot new ones)
  phase: string;
  lights: number;
  wasOff: boolean[];
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
    private model: WorldModel,
    private room: { state: S; sessionId: string },
    private send: Send,
  ) {}

  // The tracks in the room changed (placed, moved, removed).
  refresh() {
    const defs = this.model.allObjects().filter((o) => o.kind === "slot_track");
    const keep = new Set<string>();
    for (const def of defs) {
      keep.add(def.id);
      const old = this.tracks.get(def.id);
      if (old && old.def.x === def.x && old.def.y === def.y && (old.def.rot ?? 0) === (def.rot ?? 0)) {
        old.def = def;
        continue;
      }
      if (old) this.drop(def.id);
      this.tracks.set(def.id, {
        def,
        lanes: Array.from({ length: SLOT_LANES }, () => []),
        seen: Array(SLOT_LANES).fill(""),
        phase: "lobby",
        lights: 0,
        wasOff: Array(SLOT_LANES).fill(false),
      });
    }
    for (const id of [...this.tracks.keys()]) if (!keep.has(id)) this.drop(id);
  }

  private drop(id: string) {
    const v = this.tracks.get(id);
    if (!v) return;
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
  start(id: string, laps: number, diff: string) {
    this.send("slot:start", { id, laps, diff });
  }
  // the track laid on the table (anyone by it, between races)
  setTrack(id: string, track: SlotTrackId) {
    this.send("slot:track", { id, track });
  }
  // what a race on a table runs on: its track (the table's props) and the
  // race's difficulty
  private setupOf(id: string): SlotSetup {
    return { track: slotTrackOf(this.tracks.get(id)?.def.props), diff: slotDiffOf(this.race(id)?.diff) };
  }
  setThrottle(u: number) {
    this.throttle = Math.max(0, Math.min(1, u));
  }
  // for the panel's gauges (read every frame, no React)
  live(): { speed: number; slip: number; clock: number; throttle: number } {
    const racing = this.carTrack && this.race(this.carTrack)?.phase === "race";
    return {
      speed: this.car.v / SLOT_VMAX,
      slip: this.car.off ? 1 : slotSlip(this.car, this.setupOf(this.carTrack)),
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
  frame(dt: number, me: { x: number; y: number }) {
    const now = performance.now();
    const pk = hud.get().panel;
    this.setFocus(pk.kind === "slotcar" && pk.objectId && this.tracks.has(pk.objectId) ? pk.objectId : null);
    this.drive(dt, now);
    this.poses = [];
    for (const [id, v] of this.tracks) this.stepTrack(id, v, now, me);
    this.publish(this.focus, me);
  }

  // The track whose controls are open; closing them gives the lane back.
  private focus: string | null = null;

  // For the 3D view: where every car is this frame (world tiles, height in px,
  // heading in world radians, its lane's colour).
  private poses: { x: number; y: number; z: number; h: number; color: number; tilt: number }[] = [];
  cars() {
    return this.poses;
  }
  private setFocus(focus: string | null) {
    if (focus === this.focus) return;
    if (this.focus && this.myLane(this.focus) >= 0) this.leave(this.focus);
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
    const setup = this.setupOf(mine);
    const flew = stepCar(this.car, this.throttle, dt, setup);
    if (flew) this.crashSound(v.def, 1);
    const goal = race.laps * slotLap(setup.track);
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

  private stepTrack(id: string, v: TrackView, now: number, me: { x: number; y: number }) {
    const race = this.race(id);
    const phase: string = race?.phase ?? "lobby";
    const lights: number = race?.lights ?? 0;
    const o = v.def;
    const dist = this.distanceTo(o, me);
    // phase changes: the start beeps, the motors, my finish
    if (phase !== v.phase) {
      if (phase === "race") {
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
    const setup = this.setupOf(id);
    const tr = setup.track;
    const local = (x: number, y: number): [number, number] => {
      const [X, Y] = slotTurn(x, y, rot);
      return [o.x + X, o.y + Y];
    };

    // the cars: everyone's lane, parked on the grid when nobody drives it
    const mineLane = this.myLane(id);
    const cars = (race?.cars ?? new Map()) as Map<string, S>;
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
        const p = slotPoint(st.s, laneOffset(lane), tr);
        const [wx, wy] = local(p.x, p.y);
        this.model.puff(wx, wy, "spark", SLOT_TOP + 2);
        if (dist < HEAR) this.crashSound(o, Math.max(0, 1 - dist / HEAR));
      } else if (off && !v.wasOff[lane] && lane === mineLane) {
        const p = slotPoint(st.s, laneOffset(lane), tr);
        const [wx, wy] = local(p.x, p.y);
        this.model.puff(wx, wy, "spark", SLOT_TOP + 2);
      }
      v.wasOff[lane] = off;
      this.carPose(lane, st, local, setup);
      this.motor(id, lane, phase === "race" && !!c ? st.v : 0, o, me, dist);
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

  // A car where it is on the table: on its lane (the tail stepping out in a fast
  // corner, the body leaning), or flying off it.
  private carPose(lane: number, st: CarState, local: (x: number, y: number) => [number, number], setup: SlotSetup) {
    const off = laneOffset(lane);
    let x: number;
    let y: number;
    let h: number;
    let lift = 0;
    let tilt = 0;
    if (st.off > 0) {
      const c = slotCrash(st, lane, setup.track);
      x = c.x;
      y = c.y;
      h = c.h + (this.model.stillMotion() ? 0 : c.spin);
      lift = Math.sin(Math.min(1, st.off / 0.5) * Math.PI) * 5 * c.out;
    } else {
      const p = slotPoint(st.s - GRID_BACK, off, setup.track);
      x = p.x;
      y = p.y;
      // the tail steps out in a fast corner, the body leans
      const pull = slotSlip(st, setup);
      const yaw = Math.max(0, Math.min(1.4, (pull - SLOT_SLIDE) / (1 - SLOT_SLIDE)));
      const bend = Math.sign(slotBend(st.s, setup.track));
      h = p.h + bend * yaw * 0.32;
      tilt = bend * Math.min(1, pull) * 0.5;
    }
    const [cx, cy] = local(x, y);
    const [hx, hy] = local(x + Math.cos(h), y + Math.sin(h));
    const z = SLOT_TOP + 0.3 + lift;
    this.poses.push({ x: cx, y: cy, z, h: Math.atan2(hy - cy, hx - cx), color: COLORS[lane], tilt });
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
      diff: slotDiffOf(race?.diff),
      track: slotTrackOf(o?.props),
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
    this.setFocus(null);
    for (const id of [...this.tracks.keys()]) this.drop(id);
    for (const [k, voice] of this.voices) this.stopVoice(k, voice);
  }
}
