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
  "revolver-shot",
  "revolver-load",
  "revolver-dry",
  "shotgun-shot",
  "shotgun-pump",
  "flare-strike",
  "flare-burn",
  "strike",
] as const;
type Name = (typeof NAMES)[number];

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
    // (3D: where the camera looks; iso: up the screen)
    return e ? Math.atan2(-e[10], -e[8]) : -Math.PI * 0.75;
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
  private loop(name: Name, level: number, pan = 0, bus: "ambience" | "effects" = "effects", rate = 1) {
    const ctx = this.ctx();
    if (!ctx) return;
    let l = this.loops.get(name);
    if (!l && level > 0.005) {
      const b = this.buffers.get(name);
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
    const ox = ctl.map?.ox ?? 0;
    const oy = ctl.map?.oy ?? 0;
    const list = out ? this.shades.list() : [];

    // the drone: the danger here, turned towards hunted by how near the nearest is
    let near = Number.POSITIVE_INFINITY;
    let nearest: (typeof list)[number] | null = null;
    for (const s of list)
      if (s.state !== "dissolve") {
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
          x: me.x + ox,
          z: me.y + oy,
          lit: night > 0.3 && inLampPool(me.x + ox, me.y + oy),
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

    // flares burning: the nearest's sputter
    let flare: { x: number; y: number } | null = null;
    let fd = Number.POSITIVE_INFINITY;
    room.state.flares?.forEach((f: { x: number; y: number }) => {
      const d = Math.hypot(f.x - me.x, f.y - me.y);
      if (d < fd) {
        fd = d;
        flare = f;
      }
    });
    const fp =
      flare && out ? this.place((flare as { x: number }).x, (flare as { y: number }).y, 30) : { pan: 0, gain: 0 };
    this.loop("flare-burn", fp.gain * 0.7, fp.pan);

    // the heart: under 30 health; racing under 15, or just struck
    const hp = (lp?.hp as number) ?? 100;
    const down = !!lp?.downAt;
    const racing = (hp < 15 && hp > 0) || down || now < this.struckUntil;
    this.loop("heartbeat-70", out && hp < 30 && !racing ? 0.8 : 0);
    this.loop("heartbeat-120", out && racing && hp < 30 ? 0.9 : 0);
  }
}
