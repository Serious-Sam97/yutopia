import { dangerAt, inLampPool, nightness } from "@yutopia/shared/dark";
import type { WorldController } from "../controller";
import type { Walker } from "../input/walker";
import type { Shades } from "./shades";

// The dark's sound (docs/plan/30-the-dark.md D9, design/screens/dark/sounds.md):
// the shortlist made here (dark/synth.ts), each rendered once when the chunk is
// idle, played on the mixer's buses. Under the Grounds' wind: a drone that turns
// from calm to hunted with the danger and how near one is; whispers round you
// from the nearest stalking; a sting when one comes out of the dark; the focus's
// hum, the burn's sizzle, the shield breaking, the burst when one's put down; a
// heartbeat under 30 health; the guns, the flares, a strike landing. All of it
// only outside: indoors is always safe, so silent.

const AMB = 0.55; // the drone and whispers under the wind
const FX = 0.9;

// the sounds (dark/synth.ts SOUNDS, made in its worker: not imported here, it's the worker's)
const NAMES = [
  "drone-calm",
  "drone-hunted",
  "whispers",
  "emerge-sting",
  "focus-on",
  "focus-hum",
  "burn-sizzle",
  "shield-break",
  "dissolve",
  "heartbeat-70",
  "heartbeat-120",
  // (the guns' own: recorded since plan 79 phase 9 — GUN_LEVEL, public/sfx/guns)
  "hit-tick",
  "hit-head",
  "hit-kill",
  "flare-strike",
  "flare-burn",
  "strike",
] as const;
type Name = (typeof NAMES)[number];

// The guns' recorded sounds (docs/plan/79-the-guns.md phase 9: CC0 recordings the user picked by ear on
// /dev/gun-sound — public/sfx/guns, its manifest), each slot's level beside the others (every take is cut
// to −3 dB peak: the handling sits well under a shot), and whether it's a shot (its takes at random,
// each a touch different) or a moment of handling (its takes in turn).
const GUN_LEVEL = {
  "revolver-near": 1,
  "revolver-in": 0.95,
  "revolver-far": 0.85,
  "shotgun-near": 1,
  "shotgun-in": 0.95,
  "shotgun-far": 0.85,
  "ak-near": 0.82,
  "ak-in": 0.8,
  "ak-far": 0.75,
  "sniper-near": 1,
  "sniper-in": 0.95,
  "sniper-far": 0.9,
  "daybreak-charge": 0.7,
  "daybreak-fire": 0.85,
  "daybreak-ball": 0.45,
  "daybreak-burst": 1,
  "daybreak-burst-far": 0.85,
  "revolver-cock": 0.4,
  "revolver-dry": 0.45,
  "revolver-open": 0.5,
  "revolver-eject": 0.5,
  "revolver-speedloader": 0.5,
  "revolver-close": 0.5,
  "shotgun-dry": 0.45,
  "shotgun-break": 0.55,
  "shotgun-eject": 0.5,
  "shotgun-shell": 0.45,
  "shotgun-close": 0.55,
  "ak-mag-out": 0.5,
  "ak-mag-in": 0.55,
  "ak-rack": 0.55,
  "sniper-bolt-open": 0.5,
  "sniper-bolt-close": 0.5,
  "sniper-round": 0.4,
  "daybreak-cell-out": 0.5,
  "daybreak-cell-in": 0.5,
  draw: 0.4,
  holster: 0.4,
  "rifle-dry": 0.45,
  "case-snow": 0.25,
  "case-floor": 0.3,
  "shell-snow": 0.3,
  "shell-floor": 0.35,
} as const;
export type GunSound = keyof typeof GUN_LEVEL;
const isShotSound = (s: GunSound) => /-(near|in|far|fire|burst|burst-far)$/.test(s);
/** A shot heard out to this far (tiles); past the near reach, the far recording, dulling on. */
export const SHOT_REACH = { near: 22, far: 90 };

interface Loop {
  src: AudioBufferSourceNode;
  gain: GainNode;
  pan: StereoPannerNode;
}

type Mixer = { ctx: AudioContext | null; buses: Record<"voices" | "ambience" | "music" | "effects", GainNode> };

export class DarkSound {
  private buffers = new Map<string, AudioBuffer | null>();
  private loops = new Map<string, Loop>();
  private prev = new Map<string, string>(); // a shadowed's last state, by id
  private wasFocus = false;
  private whisperAt = 0;
  private sleepAt = 0;
  private worker: Worker | null = null;
  private struckUntil = 0;

  // (the mixer by way of the Grounds' sound, which has it: not imported here)
  private get mixer(): Mixer | null {
    return (this.ctl as unknown as { life?: { sound?: { mixer?: Mixer } } }).life?.sound?.mixer ?? null;
  }

  constructor(
    private readonly ctl: WorldController,
    private readonly walker: Walker,
    private readonly shades: Shades,
  ) {
    // made in a worker (some take longer than a frame), the drones first (they play first)
    const names = NAMES; // (the drones first)
    this.worker = new Worker(new URL("./synth.worker.ts", import.meta.url), { type: "module" });
    this.worker.onmessage = (e: MessageEvent<{ name: string; ch: Float32Array[]; sr: number }>) => {
      this.sr = e.data.sr;
      this.made.set(e.data.name, e.data.ch);
      this.ready();
    };
    for (const n of names) this.worker.postMessage(n);
  }

  // the guns' recordings, decoded once there's sound; the next take of each, for the handling
  private recorded = new Map<string, AudioBuffer[]>();
  private recordedAsked = false;
  private takeAt = new Map<string, number>();
  private loadRecorded(ctx: AudioContext) {
    if (this.recordedAsked) return;
    this.recordedAsked = true;
    void fetch("/sfx/guns/manifest.json")
      .then((r) => (r.ok ? r.json() : {}))
      // (every slot at once: ~0.7 MB — a gun out, they're wanted in a moment)
      .then((man: Record<string, { files: string[] }[]>) =>
        Promise.all(
          Object.entries(man).map(async ([slot, list]) => {
            const bufs = await Promise.all(
              (list[0]?.files ?? []).map((f) =>
                fetch(`/sfx/guns/${f}`)
                  .then((r) => r.arrayBuffer())
                  .then((b) => ctx.decodeAudioData(b))
                  .catch(() => null),
              ),
            );
            const got = bufs.filter((b): b is AudioBuffer => !!b);
            if (got.length) this.recorded.set(slot, got);
          }),
        ),
      )
      .catch(() => undefined);
  }

  /** A gun in a hand: its recordings fetched and decoded now, before the first shot wants them. */
  warmGuns(): void {
    const ctx = this.ctx();
    if (ctx) this.loadRecorded(ctx);
  }

  /** A gun's recorded sound (plan 79 phase 9), from (x, y) or here: a shot's take at random, a handling
   *  moment's next in turn, each a touch different; `range` tiles heard (a far shot dulling on past the
   *  near reach); `volume` on its level. */
  gun(slot: GunSound, at?: { x: number; y: number }, range = 40, volume = 1): void {
    const ctx = this.ctx();
    if (!ctx) return;
    this.loadRecorded(ctx);
    const takes = this.recorded.get(slot);
    if (!takes?.length) return;
    let gain = 1;
    let pan = 0;
    if (at) {
      const pl = this.place(at.x, at.y, range);
      pan = pl.pan;
      // (a far shot: its recording is already far — heard on, gently, to the far reach)
      const d = Math.hypot(at.x - this.walker.where().x, at.y - this.walker.where().y);
      gain = /-far$/.test(slot) ? (d > range ? 0 : 0.6 / (1 + Math.max(0, d - SHOT_REACH.near) / 35)) : pl.gain;
    }
    if (gain <= 0.01) return;
    const shot = isShotSound(slot);
    const n = this.takeAt.get(slot) ?? 0;
    const b = shot ? takes[Math.floor(Math.random() * takes.length)] : takes[n % takes.length];
    this.takeAt.set(slot, n + 1);
    const src = ctx.createBufferSource();
    src.buffer = b;
    // (each a touch different: a held trigger's rounds aren't one sample over and over)
    src.playbackRate.value = 1 + (Math.random() * 2 - 1) * (shot ? 0.035 : 0.05);
    const g = ctx.createGain();
    g.gain.value = gain * volume * GUN_LEVEL[slot] * (0.92 + Math.random() * 0.16) * FX;
    const p = ctx.createStereoPanner();
    p.pan.value = pan;
    src
      .connect(g)
      .connect(p)
      .connect((this.mixer as Mixer).buses.effects);
    src.start();
  }

  /** My own shot: the world's bed ducked a moment under it (plan 79 phase 9: mine sits over the world,
   *  not drowning it for long). */
  duck(depth = 0.55): void {
    const ctx = this.ctx();
    const bus = this.mixer?.buses.ambience;
    if (!ctx || !bus) return;
    const t = ctx.currentTime;
    const g = bus.gain;
    const was = g.value;
    g.cancelScheduledValues(t);
    g.setValueAtTime(was, t);
    g.linearRampToValueAtTime(was * depth, t + 0.02);
    g.setTargetAtTime(was, t + 0.12, 0.35);
  }

  /** The Daybreak's ball flying (plan 79 phase 9): its loop where the nearest is (null: let it go). */
  ballAt(at: { x: number; y: number } | null): void {
    if (!at && !this.loops.has("daybreak-ball")) return;
    const ctx = this.ctx();
    if (ctx) this.loadRecorded(ctx);
    const { pan, gain } = at ? this.place(at.x, at.y, 60) : { pan: 0, gain: 0 };
    this.loop("daybreak-ball", gain * GUN_LEVEL["daybreak-ball"] * FX, pan);
  }

  dispose(): void {
    this.worker?.terminate();
    for (const l of this.loops.values()) {
      l.src.stop();
      l.gain.disconnect();
    }
    this.loops.clear();
  }

  // the channels as the worker sent them; buffers made of them once there's sound
  private made = new Map<string, Float32Array[]>();
  private sr = 22050;
  private ready() {
    const ctx = this.mixer?.ctx;
    if (!ctx) return;
    for (const [name, ch] of this.made) {
      const b = ctx.createBuffer(ch.length, ch[0].length, this.sr);
      ch.forEach((c, i) => {
        b.copyToChannel(c as Float32Array<ArrayBuffer>, i);
      });
      this.buffers.set(name, b);
    }
    this.made.clear();
  }

  private ctx(): AudioContext | null {
    const c = this.mixer?.ctx;
    return c && c.state === "running" ? c : null;
  }

  // where a sound is to my ears: left or right of where I look, and how loud for how far
  private place(x: number, y: number, range: number): { pan: number; gain: number } {
    const me = this.walker.where();
    const dx = x - me.x;
    const dy = y - me.y;
    const d = Math.hypot(dx, dy);
    if (d > range) return { pan: 0, gain: 0 };
    const yaw = this.listenerYaw();
    // (the right of where I face: −sin, cos)
    const pan = d < 0.5 ? 0 : (dx * -Math.sin(yaw) + dy * Math.cos(yaw)) / d;
    return { pan: Math.max(-1, Math.min(1, pan)), gain: 1 / (1 + d / 7) };
  }
  private listenerYaw(): number {
    const e = this.ctl.tp?.camera.matrixWorld.elements;
    // (where the camera looks; before there's one, the camera's starting yaw)
    return e ? Math.atan2(-e[10], -e[8]) : -Math.PI * 0.75;
  }

  private stepAt = new Map<string, { x: number; y: number }>();
  private crunchBuf: AudioBuffer | null = null;
  // a step in the snow at (x, y): a burst of noise, banded as the snow crunches (sound.ts step)
  private crunch(x: number, y: number) {
    const ctx = this.ctx();
    if (!ctx) return;
    const { pan, gain } = this.place(x, y, 22);
    if (gain <= 0.02) return;
    if (!this.crunchBuf) {
      const n = Math.round(ctx.sampleRate * 0.12);
      this.crunchBuf = ctx.createBuffer(1, n, ctx.sampleRate);
      const d = this.crunchBuf.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n) ** 2;
    }
    const src = ctx.createBufferSource();
    src.buffer = this.crunchBuf;
    src.playbackRate.value = 0.85 + Math.random() * 0.3;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 1500 + Math.random() * 500;
    bp.Q.value = 1.2;
    const g = ctx.createGain();
    g.gain.value = gain * 0.35 * FX;
    const p = ctx.createStereoPanner();
    p.pan.value = pan;
    src
      .connect(bp)
      .connect(g)
      .connect(p)
      .connect((this.mixer as Mixer).buses.effects);
    src.start();
  }

  /** A one-shot, from (x, y) (or here), `range` tiles heard. */
  play(name: Name, at?: { x: number; y: number }, range = 40, volume = 1, rate = 1): void {
    const ctx = this.ctx();
    const b = this.buffers.get(name);
    if (!ctx || !b) return;
    const { pan, gain } = at ? this.place(at.x, at.y, range) : { pan: 0, gain: 1 };
    if (gain <= 0.01) return;
    const src = ctx.createBufferSource();
    src.buffer = b;
    src.playbackRate.value = rate;
    const g = ctx.createGain();
    g.gain.value = gain * volume * FX;
    const p = ctx.createStereoPanner();
    p.pan.value = pan;
    src
      .connect(g)
      .connect(p)
      .connect((this.mixer as Mixer).buses.effects);
    src.start();
  }

  // a loop's level (0: let it fade, and stop it once it's quiet)
  private loop(name: Name | GunSound, level: number, pan = 0, bus: "ambience" | "effects" = "effects", rate = 1) {
    const ctx = this.ctx();
    if (!ctx) return;
    let l = this.loops.get(name);
    if (!l && level > 0.005) {
      const b = this.buffers.get(name) ?? this.recorded.get(name)?.[0];
      if (!b) return;
      const src = ctx.createBufferSource();
      src.buffer = b;
      src.loop = true;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      const p = ctx.createStereoPanner();
      src
        .connect(gain)
        .connect(p)
        .connect((this.mixer as Mixer).buses[bus]);
      src.start(0, Math.random() * b.duration);
      l = { src, gain, pan: p };
      this.loops.set(name, l);
    }
    if (!l) return;
    const t = ctx.currentTime;
    l.gain.gain.setTargetAtTime(level, t, 0.25);
    l.pan.pan.setTargetAtTime(pan, t, 0.1);
    l.src.playbackRate.setTargetAtTime(rate, t, 0.2);
    if (level <= 0.005 && l.gain.gain.value < 0.003) {
      l.src.stop();
      l.gain.disconnect();
      this.loops.delete(name);
    }
  }

  /** A strike landed on me: its blow, and the heart racing a while. */
  struck(): void {
    this.play("strike");
    this.struckUntil = performance.now() + 3000;
  }

  /** Every frame. */
  frame(): void {
    const ctl = this.ctl;
    const room = ctl.room;
    if (this.made.size) this.ready(); // (the sound came on after they were made)
    if (!this.ctx() || !room) return;
    const out = this.walker.outside;
    const me = this.walker.where();
    const lp = room.state.players.get(room.sessionId);
    const hour = room.state.hour as number;
    const night = nightness(hour);
    const list = out ? this.shades.list() : [];

    // the drone: the danger here, turned towards hunted by how near the nearest is
    let near = Number.POSITIVE_INFINITY;
    let nearest: (typeof list)[number] | null = null;
    // (the nearest asleep in a day's nest, for its breath: docs/plan/31-the-day.md)
    let sleeper: (typeof list)[number] | null = null;
    let sd = Number.POSITIVE_INFINITY;
    for (const s of list)
      if (s.state === "lurk") {
        const d = Math.hypot(s.x - me.x, s.y - me.y);
        if (d < sd) {
          sd = d;
          sleeper = s;
        }
      }
    for (const s of list)
      if (s.state !== "dissolve" && s.state !== "lurk") {
        const d = Math.hypot(s.x - me.x, s.y - me.y);
        if (d < near) {
          near = d;
          nearest = s;
        }
      }
    const danger = out
      ? dangerAt({
          hour,
          storm: room.state.storm,
          x: me.x,
          z: me.y,
          lit: night > 0.3 && inLampPool(me.x, me.y),
          inHQ: false,
        })
      : 0;
    const hunt = Math.max(0, Math.min(1, 1 - (near - 6) / 24));
    const drone = out ? Math.min(1, 0.15 + danger) * AMB : 0;
    this.loop("drone-calm", drone * (1 - hunt * 0.85), 0, "ambience");
    this.loop("drone-hunted", drone * hunt, 0, "ambience");
    // whispers: one stalking within 15 tiles, from where it is (never words)
    const now = performance.now();
    if (nearest && near < 15 && (nearest.state === "stalk" || nearest.state === "burning") && now > this.whisperAt) {
      this.whisperAt = now + 6500 + Math.random() * 3000;
      this.play("whispers", nearest, 15, 0.7);
    }

    // one asleep near: a breath of whisper now and then, low (you hear a nest before you see it)
    if (sleeper && sd < 12 && now > this.sleepAt) {
      this.sleepAt = now + 9000 + Math.random() * 4000;
      this.play("whispers", sleeper, 12, 0.3, 0.8);
    }
    // what they did: out of the dark, the shield gone, put down
    const seen = new Set<string>();
    for (const s of list) {
      seen.add(s.id);
      const was = this.prev.get(s.id);
      if (was !== s.state) {
        if (s.state === "emerge" && Math.hypot(s.x - me.x, s.y - me.y) < 30) this.play("emerge-sting", s, 30, 0.8);
        if (s.state === "exposed") this.play("shield-break", s, 40);
        if (s.state === "dissolve" && s.killed) this.play("dissolve", s, 40);
        this.prev.set(s.id, s.state);
      }
    }
    for (const id of [...this.prev.keys()]) if (!seen.has(id)) this.prev.delete(id);
    // their steps in the snow, from where they are: in the dark you hear them before you see them
    // (docs/plan/44-the-night.md N4)
    for (const s of list) {
      const last = this.stepAt.get(s.id);
      if (!last || s.state === "lurk" || s.state === "dissolve") {
        this.stepAt.set(s.id, { x: s.x, y: s.y });
        continue;
      }
      if (Math.hypot(s.x - last.x, s.y - last.y) < 0.75) continue;
      this.stepAt.set(s.id, { x: s.x, y: s.y });
      this.crunch(s.x, s.y);
    }
    for (const id of [...this.stepAt.keys()]) if (!seen.has(id)) this.stepAt.delete(id);
    // the burn: any near burning, louder the nearer
    let burn = 0;
    for (const s of list)
      if (s.state === "burning") burn = Math.max(burn, 1 / (1 + Math.hypot(s.x - me.x, s.y - me.y) / 6));
    this.loop("burn-sizzle", burn * 0.8);

    // my torch focused: on, and its hum (sagging as the battery runs out)
    const focus = this.walker.focus;
    if (focus && !this.wasFocus) this.play("focus-on", undefined, 0, 0.6);
    this.wasFocus = focus;
    const bat = this.walker.vitals.bat;
    this.loop("focus-hum", focus ? 0.35 : 0, 0, "effects", bat < 20 ? 0.85 + bat / 133 : 1);

    // flares burning on my floor: the nearest's sputter
    let flare: { x: number; y: number } | null = null;
    let fd = Number.POSITIVE_INFINITY;
    room.state.flares?.forEach((f: { x: number; y: number; level?: number }) => {
      if ((f.level ?? 0) !== this.ctl.level) return;
      const d = Math.hypot(f.x - me.x, f.y - me.y);
      if (d < fd) {
        fd = d;
        flare = f;
      }
    });
    const fp = flare ? this.place((flare as { x: number }).x, (flare as { y: number }).y, 30) : { pan: 0, gain: 0 };
    this.loop("flare-burn", fp.gain * 0.7, fp.pan);

    // the heart: under 30 health; racing under 15, or just struck
    const hp = (lp?.hp as number) ?? 100;
    const down = !!lp?.downAt;
    const racing = (hp < 15 && hp > 0) || down || now < this.struckUntil;
    this.loop("heartbeat-70", out && hp < 30 && !racing ? 0.8 : 0);
    this.loop("heartbeat-120", out && racing && hp < 30 ? 0.9 : 0);
  }
}
