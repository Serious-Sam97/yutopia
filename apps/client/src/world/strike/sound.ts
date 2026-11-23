// The Strike Park's own sounds (docs/plan/114-the-strike-park.md, S-M9; F11: my picks). The guns' are the world's
// (plans 79–84, untouched); everything new is made here, synthesized like the karts' (kart/sound.ts) — nothing
// fetched: the charge's beeps quickening, the keypad's ticks, the grenades' pin, bounce, blasts and hiss, the
// flash's ringing ears, the fire's crackle; the round's calls and the radio in our own words, spoken by the
// browser's voice. Placed by where they are against where I look (gain by distance, panned left/right).

export interface Ear {
  x: number;
  z: number;
  /** where I look: atan2(dz, dx) in the world's x, z */
  yaw: number;
}

/** The recordings the park plays (the repo's own CC0 library, public/sfx — credited in sfx/CREDITS.md; F8: my picks):
 *  the cars' blasts for the HE and the charge, the Daybreak's far burst under the charge's, the cars' fire for a
 *  molotov's. */
const REC = {
  he: [
    "/sfx/cars/blast-e1.mp3",
    "/sfx/cars/blast-e2.mp3",
    "/sfx/cars/blast-e3.mp3",
    "/sfx/cars/blast-e4.mp3",
    "/sfx/cars/blast-e5.mp3",
  ],
  charge: ["/sfx/cars/blast-a1.mp3", "/sfx/cars/blast-b1.mp3"],
  far: ["/sfx/guns/daybreak-burst-far-1.mp3"],
  flash: ["/sfx/cars/blast-d1.mp3", "/sfx/cars/blast-f1.mp3"],
  fireCatch: ["/sfx/cars/fire-catch-a1.mp3", "/sfx/cars/fire-catch-b1.mp3", "/sfx/cars/fire-catch-c1.mp3"],
  fire: ["/sfx/cars/fire-a.mp3", "/sfx/cars/fire-b.mp3", "/sfx/cars/fire-c.mp3", "/sfx/cars/fire-d.mp3"],
} as const;

/** (plan 118, F11a) The park's music, stingers and announcer: CC0 candidates in public/sfx/strike (manifest.json, each
 *  slot's), the picks in chosen.json — /dev/strike-sound plays them and overrides the picks on this machine. */
export type StrikeSlot = "music" | "start" | "won" | "lost" | "victory" | "defeat" | "voice";
export interface StrikeCand {
  file: string;
  title: string;
  author: string;
  page: string;
  license: string;
  about: string;
}
export const STRIKE_SFX = "/sfx/strike/";
let bankP: Promise<{ man: Record<StrikeSlot, StrikeCand[]>; chosen: Record<string, number> } | null> | null = null;
/** The candidates and the picks (this machine's bench picks over chosen.json's). */
export function strikeBank() {
  bankP ??= Promise.all([
    fetch(`${STRIKE_SFX}manifest.json`).then((r) => r.json()),
    fetch(`${STRIKE_SFX}chosen.json`).then((r) => r.json()),
  ])
    .then(([man, chosen]) => {
      let mine: Record<string, number> = {};
      try {
        mine = JSON.parse(localStorage.getItem("yutopia:strike-sound") ?? "{}");
      } catch {
        mine = {};
      }
      return { man, chosen: { ...chosen, ...mine } };
    })
    .catch(() => null);
  return bankP;
}

export class StrikeSound {
  private noiseBuf: AudioBuffer;
  private bufs = new Map<string, AudioBuffer | null>();
  /** A recording, decoded once (null while it loads or if it can't). */
  private buf(url: string): AudioBuffer | null {
    if (this.bufs.has(url)) return this.bufs.get(url) ?? null;
    this.bufs.set(url, null);
    void fetch(url)
      .then((r) => r.arrayBuffer())
      .then((a) => this.ctx.decodeAudioData(a))
      .then((b) => this.bufs.set(url, b))
      .catch(() => {});
    return null;
  }
  /** One of a set of recordings played where it happens (false: none loaded yet — the synthesized stands in). */
  private rec(
    list: readonly string[],
    x: number | null,
    z: number | null,
    reach: number,
    gain: number,
    hp = 0,
    rate = 1,
  ): boolean {
    for (const u of list) this.buf(u);
    const ready = list.map((u) => this.bufs.get(u)).filter((b): b is AudioBuffer => !!b);
    if (!ready.length) return false;
    const o = this.at(x, z, reach, gain);
    if (!o) return true;
    const src = this.ctx.createBufferSource();
    src.buffer = ready[Math.floor(Math.random() * ready.length)];
    src.playbackRate.value = rate * (0.94 + Math.random() * 0.12);
    if (hp) {
      const f = this.ctx.createBiquadFilter();
      f.type = "highpass";
      f.frequency.value = hp;
      src.connect(f).connect(o);
    } else src.connect(o);
    src.start();
    return true;
  }
  /** Loads the recordings ahead (the first blast isn't a synth's). */
  warm() {
    for (const l of Object.values(REC)) for (const u of l) this.buf(u);
  }
  constructor(
    private ctx: AudioContext,
    private out: AudioNode,
    private ear: () => Ear,
    /** (plan 115 phase 91) how many of the map's walls stand between me and (x, z): each one muffles */
    private walls: (x: number, z: number) => number = () => 0,
  ) {
    void strikeBank().then((b) => {
      this.bank = b;
    });
    const n = ctx.sampleRate * 2;
    this.noiseBuf = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  }

  /** A sound's way out from (x, z): its loudness by distance (`reach` m to silence), panned. */
  private at(x: number | null, z: number | null, reach: number, gain: number): AudioNode | null {
    const g = this.ctx.createGain();
    const pan = this.ctx.createStereoPanner();
    let k = gain;
    if (x !== null && z !== null) {
      const e = this.ear();
      const dx = x - e.x;
      const dz = z - e.z;
      const d = Math.hypot(dx, dz);
      if (d > reach) return null;
      k *= (1 - d / reach) ** 1.6;
      // (left/right: the sound's bearing against where I look)
      const rel = Math.atan2(dz, dx) - e.yaw;
      pan.pan.value = Math.max(-1, Math.min(1, Math.sin(rel)));
    }
    g.gain.value = k;
    const w = x !== null && z !== null ? Math.min(3, this.walls(x, z)) : 0;
    if (w > 0) {
      // through a wall: quieter and dull (the lows carry, the highs stay behind)
      g.gain.value = k * 0.55 ** w;
      const f = this.ctx.createBiquadFilter();
      f.type = "lowpass";
      f.frequency.value = w === 1 ? 1400 : w === 2 ? 700 : 400;
      g.connect(f).connect(pan).connect(this.out);
      return g;
    }
    g.connect(pan).connect(this.out);
    return g;
  }

  // ── the beds (plan 115 phases 53, 93): what goes on all the time where I am ──
  private beds: { g: GainNode; f: BiquadFilterNode; lfo: OscillatorNode; src: AudioBufferSourceNode }[] = [];
  private bed(lp: number, hp: number, lfoHz: number) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const h = this.ctx.createBiquadFilter();
    h.type = "highpass";
    h.frequency.value = hp;
    const f = this.ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = lp;
    const g = this.ctx.createGain();
    g.gain.value = 0;
    const wob = this.ctx.createGain();
    wob.gain.value = 1;
    const lfo = this.ctx.createOscillator();
    lfo.frequency.value = lfoHz;
    const depth = this.ctx.createGain();
    depth.gain.value = 0.35;
    lfo.connect(depth).connect(wob.gain);
    src.connect(h).connect(f).connect(wob).connect(g).connect(this.out);
    src.start();
    lfo.start();
    const b = { g, f, lfo, src };
    this.beds.push(b);
    return b;
  }
  private murmur: ReturnType<StrikeSound["bed"]> | null = null;
  private wind: ReturnType<StrikeSound["bed"]> | null = null;
  private rain: ReturnType<StrikeSound["bed"]> | null = null;
  private clinkAt = 0;
  /** Each frame: the lobby's people talking (`crowd` 0–1, by how near the yard's busy middle I am), the map's wind and
   *  rain (its climate, while I'm in the arena), a glass or a cue now and then from the bar. */
  beds2(crowd: number, wind: number, rain: number, bar: { x: number; z: number } | null) {
    this.murmur ??= this.bed(900, 180, 0.23);
    this.wind ??= this.bed(520, 60, 0.11);
    this.rain ??= this.bed(7000, 1800, 0.05);
    const t = this.ctx.currentTime;
    this.murmur.g.gain.setTargetAtTime(0.05 * crowd, t, 0.4);
    this.wind.g.gain.setTargetAtTime(0.07 * wind, t, 0.8);
    this.rain.g.gain.setTargetAtTime(0.045 * rain, t, 0.8);
    if (bar && performance.now() >= this.clinkAt) {
      this.clinkAt = performance.now() + 2500 + Math.random() * 6000;
      const o = this.at(bar.x, bar.z, 28, 0.12);
      if (o) {
        if (Math.random() < 0.6) {
          this.tone(o, 2400 + Math.random() * 900, 0.25, "sine", undefined, 0.5);
          this.tone(o, 3700 + Math.random() * 600, 0.18, "sine", undefined, 0.3);
        } else this.noise(o, 0.08, 3000, 0.6, 600);
      }
    }
  }
  private bank: Awaited<ReturnType<typeof strikeBank>> = null;
  /** The picked file of a slot (its url), or null (the bank not loaded yet). */
  private picked(slot: StrikeSlot, line = ""): string | null {
    const b = this.bank;
    const c = b?.man[slot]?.[b.chosen[slot] ?? 0] ?? b?.man[slot]?.[0];
    return c ? `${STRIKE_SFX}${c.file}${line ? `${line}.mp3` : ""}` : null;
  }
  /** Not positional, through the mix: a recording played once (loaded the first time it's asked, so a stinger may be
   *  missed once — `warmPicks` loads them ahead). */
  private once(url: string | null, gain: number, out: AudioNode = this.out): boolean {
    if (!url) return false;
    const b = this.buf(url);
    if (!b) return false;
    const g = this.ctx.createGain();
    g.gain.value = gain;
    g.connect(out);
    const src = this.ctx.createBufferSource();
    src.buffer = b;
    src.connect(g);
    src.start();
    src.onended = () => g.disconnect();
    return true;
  }
  /** The picks' stingers and the announcer's lines, loaded ahead. */
  warmPicks() {
    for (const k of ["start", "won", "lost", "victory", "defeat"] as const) {
      const u = this.picked(k);
      if (u) this.buf(u);
    }
    for (const l of (this.bank?.man as unknown as { _lines?: string[] })?._lines ?? []) {
      const u = this.picked("voice", l);
      if (u) this.buf(u);
    }
  }
  /** A stinger: the round's start, won or lost, the match won or lost. */
  sting(slot: "start" | "won" | "lost" | "victory" | "defeat") {
    return this.once(this.picked(slot), slot === "start" ? 0.55 : 0.7);
  }
  /** One of the announcer's lines (recorded: Kenney's), or the browser's voice saying `fallback`. */
  call(line: string, fallback = "") {
    if (this.once(this.picked("voice", line), 0.9)) return;
    if (fallback) this.say(fallback);
  }
  private musicSrc: { g: GainNode; src: AudioBufferSourceNode; url: string } | null = null;
  /** The lobby's music, looped, at `level` (0 off) through the mix's music bus. */
  music(level: number, bus: AudioNode) {
    const url = this.picked("music");
    if (this.musicSrc && this.musicSrc.url !== url) {
      const m = this.musicSrc;
      m.g.gain.setTargetAtTime(0, this.ctx.currentTime, 0.4);
      setTimeout(() => {
        try {
          m.src.stop();
        } catch {}
        m.g.disconnect();
      }, 2000);
      this.musicSrc = null;
    }
    if (!this.musicSrc) {
      if (level <= 0.001 || !url) return;
      const b = this.buf(url);
      if (!b) return;
      const g = this.ctx.createGain();
      g.gain.value = 0;
      g.connect(bus);
      const src = this.ctx.createBufferSource();
      src.buffer = b;
      src.loop = true;
      src.connect(g);
      src.start();
      this.musicSrc = { g, src, url };
    }
    this.musicSrc.g.gain.setTargetAtTime(0.32 * level, this.ctx.currentTime, 0.8);
  }
  /** Stops the beds (leaving the park's reach). */
  hush() {
    if (this.musicSrc) {
      try {
        this.musicSrc.src.stop();
      } catch {}
      this.musicSrc.g.disconnect();
      this.musicSrc = null;
    }
    for (const b of this.beds) {
      try {
        b.src.stop();
        b.lfo.stop();
      } catch {}
      b.g.disconnect();
    }
    this.beds = [];
    this.murmur = this.wind = this.rain = null;
  }
  private tone(to: AudioNode, f: number, len: number, type: OscillatorType = "sine", f1?: number, vol = 1) {
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f, t);
    if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + len);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    o.connect(g).connect(to);
    o.start(t);
    o.stop(t + len + 0.02);
  }
  private noise(to: AudioNode, len: number, lp: number, vol = 1, hp = 0, attack = 0.002) {
    const t = this.ctx.currentTime;
    const s = this.ctx.createBufferSource();
    s.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = lp;
    let last: AudioNode = f;
    if (hp) {
      const h = this.ctx.createBiquadFilter();
      h.type = "highpass";
      h.frequency.value = hp;
      f.connect(h);
      last = h;
    }
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    s.connect(f);
    last.connect(g).connect(to);
    s.start(t, Math.random());
    s.stop(t + len + 0.05);
  }

  /** (plan 118, F7a) My round in someone: a short dull thud. */
  hitBody() {
    const o = this.at(null, null, 1, 0.42);
    if (!o) return;
    this.noise(o, 0.07, 1400, 0.9, 120);
    this.tone(o, 160, 0.06, "sine", 90, 0.5);
  }
  /** A headshot on a helmet: the "dink" — a bright ring off steel. */
  dink() {
    const o = this.at(null, null, 1, 0.5);
    if (!o) return;
    this.tone(o, 2650, 0.22, "sine", 2500, 0.55);
    this.tone(o, 3920, 0.16, "sine", 3800, 0.35);
    this.noise(o, 0.02, 9000, 0.5, 4000);
  }
  /** A headshot with no helmet: a sharp wet crack. */
  crack() {
    const o = this.at(null, null, 1, 0.5);
    if (!o) return;
    this.noise(o, 0.09, 3200, 1, 300, 0.001);
    this.tone(o, 420, 0.05, "triangle", 180, 0.4);
  }
  /** The charge's beep (where it lies), sharper as it runs out. */
  beep(urgent: number, x: number | null = null, z: number | null = null) {
    const o = this.at(x, z, 45, 0.32);
    if (o) this.tone(o, urgent ? 3600 : 3200, 0.09, "square", undefined, 0.5);
  }
  /** A keypad's key (planting, defusing). */
  key(x: number | null = null, z: number | null = null) {
    const o = this.at(x, z, 20, 0.35);
    if (o) {
      this.tone(o, 1900 + Math.random() * 500, 0.04, "square", undefined, 0.4);
      this.noise(o, 0.03, 6000, 0.3, 2000);
    }
  }
  /** The pin pulled and the spoon flying (my throw). */
  pin() {
    const o = this.at(null, null, 1, 0.5);
    if (!o) return;
    this.tone(o, 2400, 0.05, "triangle", 1800, 0.6);
    this.noise(o, 0.06, 9000, 0.4, 3000);
  }
  /** A grenade landing on something. */
  bounce(x: number, z: number) {
    const o = this.at(x, z, 30, 0.4);
    if (o) {
      this.tone(o, 220, 0.08, "sine", 120, 0.6);
      this.noise(o, 0.05, 2500, 0.3);
    }
  }
  /** The HE's blast, the charge's (big). */
  blast(x: number, z: number, big = false) {
    if (this.rec(big ? REC.charge : REC.he, x, z, big ? 260 : 160, big ? 1.5 : 1.1)) {
      if (big) this.rec(REC.far, x, z, 400, 0.8, 0, 0.8);
      return;
    }
    const o = this.at(x, z, big ? 260 : 160, big ? 1.4 : 1);
    if (!o) return;
    this.noise(o, big ? 2.6 : 1.2, big ? 900 : 1400, 1, 0, 0.004);
    this.tone(o, big ? 70 : 90, big ? 1.8 : 0.8, "sine", 30, 1);
    this.noise(o, 0.25, 7000, 0.6, 1500);
  }
  /** The flashbang's crack. */
  bang(x: number, z: number) {
    if (this.rec(REC.flash, x, z, 140, 1, 600, 1.35)) return;
    const o = this.at(x, z, 140, 1);
    if (!o) return;
    this.noise(o, 0.35, 9000, 1, 800, 0.001);
    this.tone(o, 160, 0.4, "sine", 60, 0.7);
  }
  /** Flashed: the ears ring for `secs`, the world dulled under it. */
  ring(secs: number) {
    const o = this.at(null, null, 1, 0.22);
    if (!o) return;
    this.tone(o, 3800, Math.max(0.6, secs), "sine", 3700, 0.5);
  }
  /** A smoke's first hiss (it carries on quieter: a few in a row). */
  hiss(x: number, z: number) {
    const o = this.at(x, z, 50, 0.5);
    if (!o) return;
    this.noise(o, 2.2, 5000, 0.5, 900, 0.05);
  }
  /** The fire's crackle, a burst of it (called on while it burns). */
  /** The knife's swing: a short airy whoosh (plan 119: the stab's lower and longer). */
  swing(x: number, z: number, heavy = false) {
    const o = this.at(x, z, 20, 0.5);
    if (o) this.noise(o, heavy ? 0.26 : 0.16, heavy ? 2600 : 4200, 0.6, heavy ? 400 : 700, 0.02);
  }
  /** (plan 119) The blade in someone: a wet, heavy thud. */
  slice(x: number, z: number, heavy = false) {
    const o = this.at(x, z, 18, 0.55);
    if (!o) return;
    this.noise(o, heavy ? 0.16 : 0.1, 1600, 0.9, 200, 0.004);
    this.tone(o, heavy ? 110 : 150, 0.09, "sine", 60, 0.6);
  }
  /** (plan 119) The blade on a wall: a scrape and a ring of steel. */
  scrape(x: number, z: number) {
    const o = this.at(x, z, 18, 0.45);
    if (!o) return;
    this.noise(o, 0.12, 7000, 0.6, 2500, 0.002);
    this.tone(o, 3100, 0.12, "sine", 2900, 0.25);
  }
  /** A molotov catching (its whoosh). */
  ignite(x: number, z: number) {
    this.rec(REC.fireCatch, x, z, 50, 0.9);
  }
  /** The fire burning: a stretch of the cars' fire (called every ~2 s while it burns). */
  burn(x: number, z: number) {
    if (!this.rec(REC.fire, x, z, 35, 0.5)) this.crackle(x, z);
  }
  crackle(x: number, z: number) {
    const o = this.at(x, z, 35, 0.4);
    if (!o) return;
    this.noise(o, 0.25, 3000, 0.4, 400, 0.01);
    if (Math.random() < 0.5) this.noise(o, 0.04, 8000, 0.5, 2500);
  }

  /** A line said (the round's calls, the radio): the browser's voice, our words. */
  say(text: string, radio = false) {
    const ss = typeof window !== "undefined" ? window.speechSynthesis : undefined;
    if (!ss) return;
    try {
      const u = new SpeechSynthesisUtterance(text);
      u.rate = radio ? 1.15 : 1.0;
      u.pitch = radio ? 0.9 : 0.8;
      u.volume = 0.8;
      // (the radio's crackle over it)
      if (radio) {
        const o = this.at(null, null, 1, 0.12);
        if (o) this.noise(o, 0.12, 4000, 0.6, 1200);
      }
      ss.speak(u);
    } catch {
      /* no voice here: the HUD's banner says it */
    }
  }
}

/** The radio's lines (our own words): U in the match, then 1–6. */
/** The radio menu's lines (keys 1–9, 0) — the bots of your side do as they say (plan 117 F8a). */
export const RADIO = [
  "Move in!",
  "Fall back!",
  "Hold this spot.",
  "I need help here!",
  "Contact!",
  "Copy that.",
  "Follow me!",
  "Go A!",
  "Go B!",
  "Regroup!",
];
/** The round's calls (our words). */
export const CALLS = {
  live: "Go.",
  planted: "The charge is down.",
  defused: "Charge defused.",
  exploded: "",
  winR: "Raiders take the round.",
  winW: "Wardens take the round.",
  half: "Half time. Switching sides.",
  overtime: "Overtime.",
  over: "That's the match.",
  rescued: "A hostage is out.",
} as const;
