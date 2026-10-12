"use client";

import { prefs, subscribePrefs } from "@/lib/prefs";

// One AudioContext + mixer: master ← voices / ambience / music / effects.
// Voices get per-person gain + stereo pan from the world (spatial audio).
class Mixer {
  ctx: AudioContext | null = null;
  master!: GainNode;
  buses!: Record<"voices" | "ambience" | "music" | "effects", GainNode>;

  ensure(): AudioContext {
    if (this.ctx) return this.ctx;
    const ctx = new AudioContext({ latencyHint: "interactive" });
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.connect(ctx.destination);
    this.buses = {
      voices: ctx.createGain(),
      ambience: ctx.createGain(),
      music: ctx.createGain(),
      effects: ctx.createGain(),
    };
    for (const b of Object.values(this.buses)) b.connect(this.master);
    this.apply();
    subscribePrefs(() => this.apply());
    return ctx;
  }

  private listeners = new Set<() => void>();

  onChange(cb: () => void) {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  }

  voiceLevel(): number {
    const v = prefs().vol;
    return v.master * v.voices;
  }

  apply() {
    for (const l of this.listeners) l();
    if (!this.ctx) return;
    const v = prefs().vol;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(v.master, t, 0.05);
    this.buses.voices.gain.setTargetAtTime(v.voices, t, 0.05);
    this.buses.ambience.gain.setTargetAtTime(v.ambience, t, 0.05);
    this.buses.music.gain.setTargetAtTime(v.music, t, 0.05);
    this.buses.effects.gain.setTargetAtTime(v.effects, t, 0.05);
  }

  async resume() {
    const ctx = this.ensure();
    if (ctx.state !== "running") await ctx.resume().catch(() => {});
  }

  // Tiny synthesized UI sounds (no asset files): knock, pop, tape-stop.
  blip(kind: "knock" | "pop" | "join" | "leave" | "tape" | "click") {
    if (!this.ctx || this.ctx.state !== "running") return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g);
    g.connect(this.buses.effects);
    const env = (a: number, d: number, peak = 0.25) => {
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(peak, t + a);
      g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
    };
    switch (kind) {
      case "knock":
        o.type = "triangle";
        o.frequency.setValueAtTime(180, t);
        env(0.005, 0.12, 0.5);
        o.start(t);
        o.stop(t + 0.15);
        {
          const o2 = ctx.createOscillator();
          const g2 = ctx.createGain();
          o2.type = "triangle";
          o2.frequency.setValueAtTime(170, t + 0.18);
          g2.gain.setValueAtTime(0.0001, t + 0.18);
          g2.gain.exponentialRampToValueAtTime(0.5, t + 0.185);
          g2.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
          o2.connect(g2);
          g2.connect(this.buses.effects);
          o2.start(t + 0.18);
          o2.stop(t + 0.32);
        }
        break;
      case "click":
        // a lamp's pull chain: a short dry tick
        o.type = "square";
        o.frequency.setValueAtTime(2400, t);
        o.frequency.exponentialRampToValueAtTime(900, t + 0.02);
        env(0.001, 0.03, 0.08);
        o.start(t);
        o.stop(t + 0.05);
        break;
      case "pop":
        o.type = "sine";
        o.frequency.setValueAtTime(660, t);
        o.frequency.exponentialRampToValueAtTime(990, t + 0.06);
        env(0.005, 0.09, 0.15);
        o.start(t);
        o.stop(t + 0.12);
        break;
      case "join":
        o.type = "sine";
        o.frequency.setValueAtTime(440, t);
        o.frequency.setValueAtTime(660, t + 0.08);
        env(0.01, 0.22, 0.12);
        o.start(t);
        o.stop(t + 0.26);
        break;
      case "leave":
        o.type = "sine";
        o.frequency.setValueAtTime(660, t);
        o.frequency.setValueAtTime(440, t + 0.08);
        env(0.01, 0.22, 0.1);
        o.start(t);
        o.stop(t + 0.26);
        break;
      case "tape":
        o.type = "sawtooth";
        o.frequency.setValueAtTime(320, t);
        o.frequency.exponentialRampToValueAtTime(40, t + 0.35);
        env(0.005, 0.35, 0.08);
        o.start(t);
        o.stop(t + 0.4);
        break;
    }
  }
}

export const mixer = new Mixer();
