// The animals' sounds (docs/plan/126-animal-life.md, phase 14, F11b): CC0 recordings (public/sfx/animals, its
// index.json: each species' calls, alarms, hurts, growls; wings, splashes, a body's fall), played where the animal
// is — fainter far off, panned by where it is from the camera —: a call now and then by the hour it's about, the
// alarm or the wings as it bolts, a growl as it warns, a cry as it's hurt, a thud as it falls.
import { asset } from "@/lib/asset";
import { mixer } from "../audio";

type Bank = Record<string, string[] | Record<string, string[]>>;
type Manifest = Record<string, Bank | string[]>;

const BASE = asset("/sfx/animals/");
/** How far each is heard (m) by its kind of sound. */
const HEARD: Record<string, number> = { call: 90, alarm: 60, angry: 45, hurt: 50, wings: 40, splash: 40, thud: 30 };
/** Some carry much farther: a howl, a bugle, a goose's honk, an owl. */
const FAR: Record<string, number> = { wolf: 600, elk: 400, goose: 250, owl: 200, crow: 160, moose: 250, cow: 150, gull: 160 };

export class AnimalSound {
  private manifest: Promise<Manifest | null> | null = null;
  private got: Manifest | null = null;
  private buffers = new Map<string, Promise<AudioBuffer | null>>();
  private ready = new Map<string, AudioBuffer | null>();
  private last = new Map<string, number>();
  /** when each sound last played (performance.now ms): a flock bolting at once is one alarm, not twenty stacked */
  private playedAt = new Map<string, number>();

  /** A sound's takes: a generic's list (splash, thud), its sub's (wings: small…), a species' kind (call, alarm…). */
  private files(kind: string, what: string, sub?: string): string[] {
    const k = this.got?.[kind];
    if (!k) return [];
    if (Array.isArray(k)) return k;
    const w = k[sub ?? what];
    if (!w) return [];
    return Array.isArray(w) ? w : (Object.values(w)[0] ?? []);
  }

  private ensure() {
    this.manifest ??= fetch(`${BASE}index.json`)
      .then((r) => (r.ok ? (r.json() as Promise<Manifest>) : null))
      .then((m) => {
        this.got = m;
        return m;
      })
      .catch(() => null);
  }

  private buffer(ctx: AudioContext, name: string): AudioBuffer | null {
    if (this.ready.has(name)) return this.ready.get(name) ?? null;
    if (!this.buffers.has(name))
      this.buffers.set(
        name,
        fetch(BASE + name)
          .then((r) => (r.ok ? r.arrayBuffer() : null))
          .then((b) => (b ? ctx.decodeAudioData(b) : null))
          .then((b) => {
            this.ready.set(name, b);
            return b;
          })
          .catch(() => {
            this.ready.set(name, null);
            return null;
          }),
      );
    return null;
  }

  /** Play `kind`'s `what` (a call, an alarm…; or a generic's: wings/splash/thud, with `sub`) from (dx, dz) off the
   *  listener facing `yaw` (rad, the floor's atan2), its loudness `k` 0..1. A take not loaded yet is skipped (and
   *  loads for next time). */
  play(kind: string, what: string, dx: number, dz: number, yaw: number, k = 1, sub?: string, far?: number) {
    this.ensure();
    const ctx = mixer.ctx;
    if (!ctx || !this.got) return;
    const list = this.files(kind, what, sub);
    if (!list.length) return;
    const d = Math.hypot(dx, dz);
    // (a call the server sent from far off: heard as far as it sent it — plan 128)
    const reach = far ?? Math.max(HEARD[what || kind] ?? 50, what === "call" ? (FAR[kind] ?? 0) : 0);
    if (d > reach) return;
    const key = `${kind}:${what}:${sub ?? ""}`;
    const now = performance.now();
    if (now - (this.playedAt.get(key) ?? -1e9) < 150) return;
    let i = Math.floor(Math.random() * list.length);
    if (list.length > 1 && i === this.last.get(key)) i = (i + 1) % list.length;
    this.last.set(key, i);
    const buf = this.buffer(ctx, list[i]);
    if (!buf) return;
    this.playedAt.set(key, now);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = 1 + (Math.random() - 0.5) * 0.1;
    const g = ctx.createGain();
    // (fainter with distance: full within 4 m, an inverse fall past it, gone at its reach)
    // (a far call — a howl over the woods —: a gentler fall, the land carries it)
    const fall = far ? Math.min(1, (8 / Math.max(8, d)) ** 0.6) * (1 - d / reach) : Math.min(1, 4 / Math.max(4, d)) * (1 - d / reach);
    g.gain.value = Math.max(0, k * fall * 0.9);
    const p = ctx.createStereoPanner();
    // (where it is from where I look: right of it, the right ear)
    const rel = Math.atan2(dz, dx) - yaw;
    p.pan.value = Math.max(-1, Math.min(1, Math.sin(rel) * 0.85));
    src.connect(g).connect(p).connect(mixer.buses.effects);
    src.start();
    src.onended = () => p.disconnect();
  }

  /** Load calls and alarms ahead for these (a call heard far off is played the first time: its take loaded). */
  warmAll(kinds: readonly string[]) {
    this.ensure();
    void this.manifest?.then(() => {
      const ctx = mixer.ctx;
      if (!ctx) return;
      for (const k of kinds) for (const w of ["call", "alarm"]) for (const n of this.files(k, w).slice(0, 2)) this.buffer(ctx, n);
    });
  }

  /** Load a species' calls ahead (one near). */
  warm(kind: string) {
    this.ensure();
    const ctx = mixer.ctx;
    if (!ctx || !this.got) return;
    for (const n of this.files(kind, "call").slice(0, 2)) this.buffer(ctx, n);
  }
}
