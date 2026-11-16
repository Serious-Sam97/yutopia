import { ShaderChunk } from "three";
import { compileExtras } from "./fog3d";

// The lights that are off cost nothing (docs/plan/89-the-weight.md, phase 1). The view keeps a fixed set of lights
// in the scene — the lamps' pool, the ground's, the flashlights (a spot each, mine casting a shadow on High) — so a
// lamp or a torch coming on never changes a program (no recompile, no hitch). Off, a light is there at intensity 0,
// and three's loop still worked it out for every lit pixel: its falloff, its shadow map's PCF taps, its BRDF — all
// times a colour of 0. On this machine, High at 2×, those 9–17 lights were a third of the frame.
//
// Here each point and spot light's turn in the loop is skipped when its colour (three's colour × intensity) is 0: the
// same branch for every pixel of a draw (a uniform), so the GPU passes over it whole. What a light at 0 adds is
// exactly nothing — dotNL × 0 in every model (Physical's, Lambert's, Phong's, Toon's, the life lamps' diffuse) — so
// the picture is the same: e2e/weight.mts proves it frame by frame, the old loop against this one.
//
// Made in the one hook every material's compile goes through (fog3d.ts), after the material's own: the chunk as it
// is then (the life look's lamps already in it). `setLightsOffSkip(false)` works every light out again, as three does
// (the tests' A/B: a uniform, so the very same programs).

const LOOPS = [
  {
    head: "#if ( NUM_POINT_LIGHTS > 0 ) && defined( RE_Direct )",
    first: "pointLight = pointLights[ i ];",
    c: "pointLight",
  },
  {
    head: "#if ( NUM_SPOT_LIGHTS > 0 ) && defined( RE_Direct )",
    first: "spotLight = spotLights[ i ];",
    c: "spotLight",
  },
];

/** three's light loop with each point and spot light's turn inside `if ( loAll || its colour != 0 )` (`loAll`: the
 *  tests' switch, a uniform — false in the game); null if it isn't as expected (three changed): then left as it is. */
export function skipOffLights(src: string): string | null {
  let out = src;
  for (const { head, first, c } of LOOPS) {
    const h = out.indexOf(head);
    if (h < 0) return null;
    const a = out.indexOf(first, h);
    const end = out.indexOf("#pragma unroll_loop_end", h);
    if (a < 0 || end < 0 || a > end) return null;
    // the loop's own closing brace: the last before its end
    const close = out.lastIndexOf("}", end);
    const at = a + first.length;
    if (close < at) return null;
    out = `${out.slice(0, at)}\n\t\tif ( loAll || ${c}.color != vec3( 0.0 ) ) {${out.slice(at, close)}\t}\n\t${out.slice(close)}`;
  }
  return out;
}

// the tests' switch: a uniform, the same in every shader — so the A/B is one program drawn twice in a frame, nothing
// recompiled (a recompile isn't neutral here: materials that make their uniforms in their own hook lose them)
const loAll = { value: false };
let warned = false;
const INCLUDE = "#include <lights_fragment_begin>";
const GUARD = "if ( loAll || pointLight.color != vec3( 0.0 ) ) {";

compileExtras.push({
  inject(shader) {
    let src = shader.fragmentShader;
    // the chunk in place (most lit materials have it in already, their own changes made to it: the light map's in
    // light3d.ts, the vehicles' sky in car/model.ts — the loop's found in the source either way)
    if (src.includes(INCLUDE)) src = src.replace(INCLUDE, ShaderChunk.lights_fragment_begin);
    if (!src.includes(LOOPS[0].head) && !src.includes(LOOPS[1].head)) return;
    if (src.includes(GUARD)) return;
    const out = skipOffLights(src);
    if (!out) {
      if (!warned) {
        warned = true;
        console.warn("lights-off: three's light loop isn't as expected — left as it is");
      }
      return;
    }
    shader.fragmentShader = `uniform bool loAll;\n${out}`;
    shader.uniforms.loAll = loAll;
  },
  key: () => "",
});

/** (tests) The lights at 0 skipped (on, the game's) or worked out as three does — the same programs, a uniform. */
export function setLightsOffSkip(on: boolean) {
  loAll.value = !on;
}
