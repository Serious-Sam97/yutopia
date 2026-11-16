import type { CarKind } from "@yutopia/shared/car";
import { asset } from "@/lib/asset";
import { sample } from "../sfx";

// The cars' recorded sounds (docs/plan/92 phase 11): which recording each sound is, read at run time from the
// listening bench's own files, so changing a pick is a paste, not a code change.
//   public/sfx/cars/chosen.json   {"slots": <the bench's "copy picks">, "engines": <the engines tab's "copy picks">}
//   public/sfx/cars/manifest.json each slot's candidates and their takes (tools/sfx-weather.mjs)
//   public/sfx/cars/engines.json  each engine voice's sets and their loops (tools/sfx-cars-engines.mjs)
// A slot's pick is a candidate (its takes gone round in turn) or [candidate, take] (that take alone); missing,
// it's 0 — "a", my pick. Only what a car needs is fetched, when it's first heard; nothing is in the chunk.

export type EngineVoice = "four" | "revvy" | "v8" | "diesel-light" | "diesel" | "two";
export type Mic = "ex" | "bay" | "cabin" | "far";
export type Load = "on" | "off";

interface Chosen {
  slots?: Record<string, number | [number, number]>;
  engines?: Record<string, number>;
  /** the sounds the game makes itself (nothing recorded fitted): take a name out to hear its pick */
  synth?: string[];
}
type Manifest = Record<string, { files: string[] }[]>;
interface EnginePoint {
  file: string;
  load: Load;
  mic: Mic;
  rpm: number;
}
interface EngineSet {
  name: string;
  points: EnginePoint[];
  start?: string;
}
type Engines = Record<string, { rpm: number[]; sets: EngineSet[] }>;

interface Bank {
  chosen: Chosen;
  manifest: Manifest;
  engines: Engines;
}
let bankP: Promise<Bank | null> | null = null;
const json = <T>(f: string): Promise<T | null> =>
  fetch(asset(`/sfx/cars/${f}`))
    .then((r) => (r.ok ? (r.json() as Promise<T>) : null))
    .catch(() => null);
/** The three files, once. Null when the manifests can't be had (the synth stays). */
export function bank(): Promise<Bank | null> {
  bankP ??= Promise.all([
    json<Chosen>("chosen.json"),
    json<Manifest>("manifest.json"),
    json<Engines>("engines.json"),
  ]).then(([chosen, manifest, engines]) => (manifest && engines ? { chosen: chosen ?? {}, manifest, engines } : null));
  return bankP;
}

/** A slot's picked files (under sfx/cars/), in the order the game goes round them. */
export function slotFiles(b: Bank, slot: string): string[] {
  const cands = b.manifest[slot];
  if (!cands?.length) return [];
  const p = b.chosen.slots?.[slot] ?? 0;
  const [c, t] = Array.isArray(p) ? p : [p, -1];
  const cand = cands[c] ?? cands[0];
  if (t >= 0 && cand.files[t]) return [cand.files[t]];
  return cand.files;
}

const slotCache = new Map<string, Promise<AudioBuffer[]>>();
/** A slot's picked takes, decoded (none if it can't be had). */
export function slotBuffers(ctx: BaseAudioContext, slot: string): Promise<AudioBuffer[]> {
  let p = slotCache.get(slot);
  if (!p) {
    p = bank().then(async (b) => {
      if (!b) return [];
      const bs = await Promise.all(slotFiles(b, slot).map((f) => sample(ctx, `cars/${f}`)));
      return bs.filter((x): x is AudioBuffer => !!x);
    });
    slotCache.set(slot, p);
  }
  return p;
}

/** An engine voice's picked set: its loops by mic and load (sorted by revs), its start. */
export interface EngineRec {
  voice: EngineVoice;
  /** the revs the voice runs between (its lowest and highest points) */
  lo: number;
  hi: number;
  /** by mic, by load: [the buffer (a seamless loop), the revs it runs at] — a load the set lacks borrows the other's */
  loops: Partial<Record<Mic, Record<Load, [AudioBuffer, number][]>>>;
  start: AudioBuffer | null;
}
const engCache = new Map<EngineVoice, Promise<EngineRec | null>>();
const engReady = new Map<EngineVoice, EngineRec>();
/** The voice's set fetched and decoded, once. Null if the set can't be had: the synth stays. */
export function engineRec(ctx: BaseAudioContext, voice: EngineVoice): Promise<EngineRec | null> {
  let p = engCache.get(voice);
  if (!p) {
    p = bank().then(async (b) => {
      const v = b?.engines[voice];
      if (!b || !v?.sets.length) return null;
      const set = v.sets[b.chosen.engines?.[voice] ?? 0] ?? v.sets[0];
      const pts = set.points.filter((q) => q.rpm > 0);
      const bufs = await Promise.all(pts.map((q) => sample(ctx, `cars/engines/${q.file}`)));
      const start = set.start ? await sample(ctx, `cars/engines/${set.start}`) : null;
      const loops: EngineRec["loops"] = {};
      pts.forEach((q, i) => {
        const buf = bufs[i];
        if (!buf) return;
        let m = loops[q.mic];
        if (!m) {
          m = { on: [], off: [] };
          loops[q.mic] = m;
        }
        m[q.load].push([loopable(ctx, buf), q.rpm]);
      });
      for (const m of Object.values(loops)) {
        if (!m) continue;
        m.on.sort((a, c) => a[1] - c[1]);
        m.off.sort((a, c) => a[1] - c[1]);
        if (!m.on.length) m.on = m.off;
        if (!m.off.length) m.off = m.on;
      }
      if (!Object.keys(loops).length) return null;
      const all = pts.map((q) => q.rpm);
      const rec: EngineRec = { voice, lo: Math.min(...all), hi: Math.max(...all), loops, start };
      engReady.set(voice, rec);
      return rec;
    });
    engCache.set(voice, p);
  }
  return p;
}
/** The voice's set if it's in already (else null, and the synth plays). */
export const engineNow = (voice: EngineVoice): EngineRec | null => engReady.get(voice) ?? null;

/** A loop with no seam: its tail crossfaded into its head (and the MP3's padding off both ends). */
export function loopable(ctx: BaseAudioContext, b: AudioBuffer, skip = 0.03, xf = 0.12): AudioBuffer {
  const sr = b.sampleRate;
  const s0 = Math.round(skip * sr);
  const x = Math.round(Math.min(xf, b.duration / 4) * sr);
  const len = b.length - 2 * s0 - x;
  if (len <= x) return b;
  const src = b.getChannelData(0);
  const out = ctx.createBuffer(1, len, sr);
  const d = out.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = src[s0 + i];
  for (let i = 0; i < x; i++) {
    const k = ((i / x) * Math.PI) / 2;
    d[i] = src[s0 + i] * Math.sin(k) + src[s0 + len + i] * Math.cos(k);
  }
  return out;
}

// ── who sounds like what ─────────────────────────────────────────────────────────────────────────

/** A vehicle's engine: by its kind, and for a few its variant (the work van and the expedition 4x4 are
 *  diesels). Null: none (the toboggan). */
export function voiceOf(kind: CarKind, variant?: string): EngineVoice | null {
  switch (kind) {
    case "sedan":
    case "estate":
      return "four";
    case "hatch":
      return "revvy";
    case "offroad":
      return variant === "4x4-expedition" ? "diesel-light" : "four";
    case "van":
      return variant === "van-panel" ? "diesel-light" : "four";
    case "pickup":
      return "v8";
    case "snowmobile":
      return "two";
    case "snowcat":
    case "ploughtruck":
    case "tractor":
      return "diesel";
    default:
      return null;
  }
}
/** The starter's slot for a voice. */
export const startSlot = (v: EngineVoice): string =>
  v === "v8"
    ? "start-v8"
    : v === "two"
      ? "start-two"
      : v === "diesel" || v === "diesel-light"
        ? "start-diesel"
        : "start-four";
/** The horn's slot for a kind. */
export const hornSlot = (kind: CarKind): string =>
  kind === "hatch" || kind === "snowmobile"
    ? "horn-small"
    : kind === "pickup" || kind === "van" || kind === "ploughtruck" || kind === "tractor" || kind === "snowcat"
      ? "horn-truck"
      : "horn-saloon";
/** A door's slots, opening and shutting, by kind (a van's slides; a truck's tin). */
export const doorSlots = (kind: CarKind): [string, string] =>
  kind === "van"
    ? ["door-van", "door-van"]
    : kind === "pickup" || kind === "ploughtruck" || kind === "tractor" || kind === "snowcat"
      ? ["door-open", "door-truck"]
      : ["door-open", "door-shut"];
/** Its own beds by kind: the snowcat's tracks, skis and runners on snow, the plough's blade. */
export const kindBeds = (kind: CarKind): string[] =>
  kind === "snowcat"
    ? ["tracks"]
    : kind === "snowmobile" || kind === "toboggan"
      ? ["runners"]
      : kind === "ploughtruck"
        ? ["plough", "reverse-beep"]
        : [];
