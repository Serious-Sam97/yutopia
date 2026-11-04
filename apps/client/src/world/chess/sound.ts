import { mixer } from "../audio";
import { noiseBuffer } from "../foley";

// The living chessmen's sounds (docs/plan/70-the-chess.md, phase 6), synthesized like the rest of
// Yutopia's (the pool table's: world/tables/sound.ts): a man's step on the board, stone or wood by the
// set (a pawn's hop, a king's tread, a queen's stride), the rook grinding along, the bishop's glide,
// the knight's hooves landing, the blow's clank, a man cracking and crumbling with his chips falling, a
// promotion's shimmer, the crown ringing as it's dropped and bounces, the little clink of a man picked.
// `gain` already carries the distance (heard from where the table is). A recorded CC0 set can stand in
// for any of them later, as the steps' did (plan 63).

export type ChessSound =
  | "step"
  | "tread"
  | "grind"
  | "glide"
  | "rear"
  | "land"
  | "windup"
  | "hit"
  | "crumble"
  | "sweep"
  | "morph"
  | "crown"
  | "pick"
  | "guard";

const ready = (): AudioContext | null => {
  const ctx = mixer.ctx;
  return ctx && ctx.state === "running" ? ctx : null;
};
function out(ctx: AudioContext, gain: number, pan: number): AudioNode {
  const g = ctx.createGain();
  g.gain.value = gain;
  const p = ctx.createStereoPanner();
  p.pan.value = Math.max(-1, Math.min(1, pan));
  g.connect(p).connect(mixer.buses.effects);
  return g;
}
function ping(
  ctx: AudioContext,
  dest: AudioNode,
  f: number,
  decay: number,
  level: number,
  at = 0,
  type: OscillatorType = "sine",
) {
  const t = ctx.currentTime + at;
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f, t);
  o.frequency.exponentialRampToValueAtTime(f * 0.94, t + decay);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(level, t + 0.002);
  g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
  o.connect(g).connect(dest);
  o.start(t);
  o.stop(t + decay + 0.02);
}
function noise(
  ctx: AudioContext,
  dest: AudioNode,
  f: number,
  q: number,
  len: number,
  level: number,
  at = 0,
  type: BiquadFilterType = "bandpass",
  attack = 0.002,
) {
  const t = ctx.currentTime + at;
  const s = ctx.createBufferSource();
  s.buffer = noiseBuffer(ctx);
  const bp = ctx.createBiquadFilter();
  bp.type = type;
  bp.frequency.value = f;
  bp.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(level, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + len);
  s.connect(bp).connect(g).connect(dest);
  s.start(t, Math.random() * 1.5);
  s.stop(t + len + 0.02);
}

/** A sound of the men: `wood` the walnut set (warmer, lower), `len` how long (a grind's, s). */
export function chessSound(kind: ChessSound, gain: number, pan = 0, o: { wood?: boolean; len?: number } = {}) {
  const ctx = ready();
  if (!ctx || gain < 0.01) return;
  const d = out(ctx, gain, pan);
  const w = o.wood ? 0.62 : 1;
  const r = () => 0.9 + Math.random() * 0.2;
  switch (kind) {
    case "step":
      // a plinth set down on the board: a short tock
      ping(ctx, d, 1500 * w * r(), 0.04, 0.12);
      noise(ctx, d, 2600 * w, 1.6, 0.025, 0.1);
      return;
    case "tread":
      // heavier: the king's, the queen's
      ping(ctx, d, 900 * w * r(), 0.06, 0.16);
      noise(ctx, d, 1400 * w, 1.2, 0.04, 0.12);
      return;
    case "grind": {
      // stone dragged over the board: low, rough, as long as it goes
      const len = o.len ?? 1;
      noise(ctx, d, 260 * w, 0.9, len, 0.16, 0, "bandpass", 0.08);
      noise(ctx, d, 900 * w, 2.5, len * 0.9, 0.05, 0.05, "bandpass", 0.1);
      return;
    }
    case "glide":
      noise(ctx, d, 3200 * w, 0.8, o.len ?? 0.8, 0.035, 0, "bandpass", 0.12);
      return;
    case "rear":
      // a horse's snort of stone: a breathy rise
      noise(ctx, d, 1100, 3, 0.25, 0.07, 0, "bandpass", 0.06);
      return;
    case "land":
      // the hooves: two thumps close together
      ping(ctx, d, 180 * w, 0.09, 0.3);
      noise(ctx, d, 700 * w, 1, 0.06, 0.16);
      ping(ctx, d, 210 * w, 0.08, 0.22, 0.05);
      noise(ctx, d, 800 * w, 1, 0.05, 0.12, 0.05);
      return;
    case "windup":
      noise(ctx, d, 2400, 1.2, 0.18, 0.05, 0, "highpass", 0.1);
      return;
    case "hit":
      // the blow: metal on stone — a clank (inharmonic) over a thump
      ping(ctx, d, 2150 * r(), 0.18, 0.18, 0, "triangle");
      ping(ctx, d, 3370 * r(), 0.12, 0.1, 0, "triangle");
      ping(ctx, d, 130 * w, 0.12, 0.35);
      noise(ctx, d, 1800 * w, 1, 0.05, 0.25);
      return;
    case "crumble":
      // the crack, the crumble, the chips coming down after
      noise(ctx, d, 1200 * w, 0.7, 0.35, 0.3);
      noise(ctx, d, 380 * w, 0.8, 0.5, 0.22, 0.02, "lowpass");
      for (let i = 0; i < 9; i++)
        ping(ctx, d, (1800 + Math.random() * 2400) * w, 0.03, 0.03 + Math.random() * 0.05, 0.25 + Math.random() * 0.55);
      return;
    case "sweep":
      noise(ctx, d, 1600 * w, 0.8, 0.6, 0.05, 0, "bandpass", 0.2);
      return;
    case "morph": {
      // a rising shimmer
      const t = ctx.currentTime;
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.setValueAtTime(600, t);
      osc.frequency.exponentialRampToValueAtTime(1800, t + 0.5);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.08, t + 0.15);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
      osc.connect(g).connect(d);
      osc.start(t);
      osc.stop(t + 0.62);
      for (let i = 0; i < 6; i++) ping(ctx, d, 2500 + Math.random() * 3000, 0.08, 0.03, Math.random() * 0.5);
      return;
    }
    case "crown":
      // gold falling on the board: it rings, and bounces twice
      for (const [at, k] of [
        [0, 1],
        [0.22, 0.55],
        [0.36, 0.3],
      ] as const) {
        ping(ctx, d, 1760 * r(), 0.7 * k, 0.12 * k, at, "triangle");
        ping(ctx, d, 2640 * r(), 0.5 * k, 0.06 * k, at, "triangle");
        noise(ctx, d, 3000, 1.5, 0.03, 0.08 * k, at);
      }
      return;
    case "pick":
      ping(ctx, d, 2600 * r(), 0.06, 0.05, 0, "triangle");
      return;
    case "guard":
      // a sword drawn up: a short scrape and ring
      noise(ctx, d, 4200, 2, 0.15, 0.05, 0, "bandpass", 0.04);
      ping(ctx, d, 2900, 0.25, 0.05, 0.08, "triangle");
      return;
  }
}
