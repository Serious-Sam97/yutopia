// Plan 73 — the life look's tone curve: the shoulder of Khronos PBR Neutral (three's NeutralToneMapping)
// without its toe. The toe takes 0.04 off every dark tone — the night's faint moonlit asphalt and a torch's
// beam on the snow went out with it (phase 0a; again in 2.7, on Low, where three's own curve was used).
// One curve for both ways a frame reaches the screen: the life finish (post3d.ts, High and Medium) and
// the renderer's own tone mapping (Low and Lowest, with no post; and any render straight to the screen).
import { CustomToneMapping, ShaderChunk, type WebGLRenderer } from "three";

/** GLSL: `vec3 <name>(vec3 color)` — linear in, linear out, highlights eased in under 1. (Named by the
 *  caller: the finish draws to the screen, so three puts the renderer's tone-mapping chunk — this
 *  curve again — in its prefix too.) */
export const lifeShoulder = (name: string) => `
    vec3 ${name}(vec3 color) {
      const float start = 0.76;
      const float desat = 0.15;
      float peak = max(color.r, max(color.g, color.b));
      if (peak < start) return color;
      float d = 1.0 - start;
      float newPeak = 1.0 - d * d / (peak + d - start);
      color *= newPeak / peak;
      float g = 1.0 - 1.0 / (desat * (peak - newPeak) + 1.0);
      return mix(color, vec3(newPeak), g);
    }`;

const STOCK = "vec3 CustomToneMapping( vec3 color ) { return color; }";
let done = false;

/** The renderer's tone mapping set to the life shoulder (three's CustomToneMapping, its chunk replaced
 *  once, before anything compiles). */
export function setLifeTone(renderer: WebGLRenderer) {
  if (!done) {
    done = true;
    const pars = ShaderChunk.tonemapping_pars_fragment;
    if (!pars.includes(STOCK)) throw new Error("life tone: no stock CustomToneMapping (three changed?)");
    ShaderChunk.tonemapping_pars_fragment = pars.replace(
      STOCK,
      `${lifeShoulder("lifeToneShoulder")}\nvec3 CustomToneMapping( vec3 color ) { return lifeToneShoulder( toneMappingExposure * color ); }`,
    );
  }
  renderer.toneMapping = CustomToneMapping;
}
