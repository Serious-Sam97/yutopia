import { addStrings } from "@/lib/i18n";
import { PET_STRINGS } from "@/lib/i18n-pets";
import { mixer } from "../audio";
import { noiseBuffer, ready } from "../foley";
import { petRenderer } from "./pets-render";
import { PetModel, rigOf } from "./pets3d";

// The pets chunk (docs/plan/14-pets-v2.md): the 3D models and their rig
// (pets3d.ts), the renderer that turns them into iso sprites, turntables and
// portraits (pets-render.ts), the pets' sounds, their interface strings, and
// the rules the world's controller needs once there's a pet about.
export const PETS_CHUNK = "yutopia-pets";
addStrings(PET_STRINGS, PETS_CHUNK); // their interface text comes with this chunk
// a hook for the dev pages and e2e: draw any pet anywhere
if (typeof window !== "undefined") (window as unknown as { __pets: unknown }).__pets = { petRenderer, PetModel, rigOf };

export { feelingOf, isTrick, learned, petNoise, SPECIES_DEFS, tricksFor } from "@yutopia/shared/pets";
export { dirAngle, type PetSprite, petRenderer, type ToySprite, toySpriteOf } from "./pets-render";
export {
  type Face3,
  PetModel,
  type PoseKind,
  petMaterial,
  plainMat,
  type RigIn,
  rigOf,
  rimPatch,
  toyMesh,
} from "./pets3d";

// A pet's voice (shared/pets.ts SPECIES_DEFS.sound), in a mood: a bark, a
// meow, a rabbit's thump, a platypus' growl, a capybara's squeak, a squawk.
export function petSound(sound: string, mood: string, gain = 1) {
  const ctx = ready();
  if (!ctx || gain <= 0.02) return;
  const out = mixer.buses.effects;
  const t0 = ctx.currentTime;
  const happy = mood === "happy";
  const sad = mood === "sad";
  const angry = mood === "angry";
  const tone = (
    f0: number,
    f1: number,
    len: number,
    peak: number,
    at: number,
    type: OscillatorType = "triangle",
    q = 0,
  ) => {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t0 + at);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + at + len);
    g.gain.setValueAtTime(0.0001, t0 + at);
    g.gain.exponentialRampToValueAtTime(peak * gain, t0 + at + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + at + len);
    let node: AudioNode = o;
    if (q) {
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = (f0 + f1) / 2;
      bp.Q.value = q;
      o.connect(bp);
      node = bp;
    }
    node.connect(g).connect(out);
    o.start(t0 + at);
    o.stop(t0 + at + len + 0.05);
  };
  const burst = (f: number, q: number, len: number, peak: number, at: number) => {
    const s = ctx.createBufferSource();
    s.buffer = noiseBuffer(ctx);
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = f;
    bp.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(peak * gain, t0 + at);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + at + len);
    s.connect(bp).connect(g).connect(out);
    s.start(t0 + at);
    s.stop(t0 + at + len + 0.02);
  };
  switch (sound) {
    case "bark": {
      const n = happy ? 2 : 1;
      for (let i = 0; i < n; i++) {
        tone(angry ? 180 : 320, angry ? 120 : 190, 0.14, 0.22, i * 0.2, "sawtooth", 1.2);
        burst(900, 1.5, 0.06, 0.12, i * 0.2);
      }
      if (sad) tone(420, 560, 0.5, 0.08, 0, "sine");
      break;
    }
    case "meow":
      if (angry) burst(2600, 0.8, 0.35, 0.18, 0);
      else if (happy)
        tone(140, 150, 0.6, 0.06, 0, "sawtooth", 2.5); // a purr
      else tone(520, sad ? 420 : 700, 0.42, 0.12, 0, "triangle", 2);
      break;
    case "thump":
      burst(140, 1, 0.09, 0.3, 0);
      if (angry || happy) burst(140, 1, 0.09, 0.3, 0.16);
      break;
    case "growl":
      tone(110, angry ? 80 : 95, happy ? 0.3 : 0.45, 0.14, 0, "sawtooth", 1.5);
      if (happy) tone(130, 110, 0.25, 0.1, 0.32, "sawtooth", 1.5);
      break;
    case "squeak":
      if (angry) {
        tone(300, 200, 0.12, 0.18, 0, "sawtooth", 1.5);
        break;
      }
      tone(1800, sad ? 1500 : 2300, 0.12, 0.09, 0, "sine");
      if (happy) tone(1900, 2400, 0.1, 0.08, 0.15, "sine");
      break;
    case "squawk":
      tone(900, angry ? 500 : 1200, 0.18, 0.16, 0, "square", 3);
      burst(3200, 1.2, 0.1, 0.1, 0);
      if (happy) tone(1100, 1400, 0.14, 0.12, 0.22, "square", 3);
      break;
    default:
      tone(400, 300, 0.2, 0.1, 0);
  }
}
