import { BackSide, MeshBasicMaterial, Vector2 } from "three";

// Ligne claire's one even line: the person drawn again from the back, every
// vertex pushed out along its normal in screen space, so the line keeps the
// same width in pixels near and far — round every part, and where one part
// crosses another (an arm over the chest, the chin over the neck) its edge
// draws a line there too. Each vertex carries its line weight (`inkK`: 1 a
// part's outline, 0.5 a crease drawn by a hair-thin ring, 0 none).
export const INK = { res: { value: new Vector2(1600, 900) }, px: { value: 2.2 } };

/** Tell the line how big the canvas is (CSS px), so its width stays in px. */
export function inkResolution(w: number, h: number) {
  INK.res.value.set(Math.max(1, w), Math.max(1, h));
}

const mats = new Map<string, MeshBasicMaterial>();
/** The line's material (one per colour and opacity, shared by everyone). */
export function inkMaterial(color = "#151515", opacity = 1): MeshBasicMaterial {
  const key = `${color}|${opacity}`;
  const have = mats.get(key);
  if (have) return have;
  const m = new MeshBasicMaterial({ color, side: BackSide, transparent: opacity < 1, opacity });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.inkRes = INK.res;
    sh.uniforms.inkPx = INK.px;
    sh.vertexShader = sh.vertexShader
      .replace(
        "#include <common>",
        "#include <common>\nuniform vec2 inkRes;\nuniform float inkPx;\nattribute float inkK;",
      )
      .replace(
        "#include <project_vertex>",
        `#include <project_vertex>
        #ifdef USE_SKINNING
          // (three flips it for a back-faced material: we want the outward one)
          vec3 inkN = normalize( transformedNormal );
          #ifdef FLIP_SIDED
            inkN = -inkN;
          #endif
        #else
          vec3 inkN = normalize( normalMatrix * normal );
        #endif
        vec2 inkDir = ( projectionMatrix * vec4( inkN, 0.0 ) ).xy;
        inkDir = length( inkDir ) > 1e-5 ? normalize( inkDir ) : vec2( 0.0 );
        gl_Position.xy += inkDir * inkPx * inkK * 2.0 / inkRes * gl_Position.w;`,
      );
  };
  m.customProgramCacheKey = () => "chars-ink";
  mats.set(key, m);
  return m;
}
