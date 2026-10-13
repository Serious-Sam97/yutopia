import { mixer } from "../audio";

// A TV coming on near you (synthesized like the rest of Yutopia's sound): a
// tube set's thunk, the static of the tube warming and its faint whine; a flat
// panel or a projector, just a soft click.
export function tvOn(look: "crt" | "hd" | "screen", gain: number) {
  const ctx = mixer.ctx;
  if (!ctx || ctx.state !== "running" || gain <= 0.02) return;
  const out = mixer.buses.effects;
  const t = ctx.currentTime;
  const env = (g: GainNode, at: number, peak: number, len: number) => {
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak * gain), at + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, at + len);
  };
  // the click / thunk
  const o = ctx.createOscillator();
  const og = ctx.createGain();
  o.type = "sine";
  o.frequency.setValueAtTime(look === "crt" ? 120 : 900, t);
  o.frequency.exponentialRampToValueAtTime(look === "crt" ? 50 : 500, t + 0.08);
  env(og, t, look === "crt" ? 0.35 : 0.12, look === "crt" ? 0.18 : 0.05);
  o.connect(og).connect(out);
  o.start(t);
  o.stop(t + 0.25);
  if (look !== "crt") return;
  // static as the tube warms
  const b = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.5), ctx.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const s = ctx.createBufferSource();
  s.buffer = b;
  const hp = ctx.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 2500;
  const sg = ctx.createGain();
  env(sg, t + 0.04, 0.06, 0.45);
  s.connect(hp).connect(sg).connect(out);
  s.start(t + 0.04);
  // and the faint whine of the flyback
  const w = ctx.createOscillator();
  const wg = ctx.createGain();
  w.frequency.value = 7800;
  env(wg, t + 0.05, 0.012, 1.2);
  w.connect(wg).connect(out);
  w.start(t + 0.05);
  w.stop(t + 1.3);
}
