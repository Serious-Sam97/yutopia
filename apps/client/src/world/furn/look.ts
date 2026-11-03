import type { Material } from "three";
import { celBands } from "../cel";

// The redrawn furniture's look in the world (docs/plan/67-the-furniture.md, decision 3: cel, as the
// people): its vertices go into World3's shared lit buffers like every other thing's, marked by their
// colour's alpha (CEL_ALPHA: an opaque material shows none of it, a faded copy a thousandth less), and
// the lit material shades what's marked with the people's bands. One material, one merge, as before.

/** A redrawn thing's vertex alpha. */
export const CEL_ALPHA = 0.999;

/** Shade the marked vertices on `m` (chained after what's patched on it already: the room's light). */
export function celLit(m: Material): void {
  const was = m.onBeforeCompile;
  const key = m.customProgramCacheKey;
  m.onBeforeCompile = (sh, r) => {
    was.call(m, sh, r);
    sh.fragmentShader = sh.fragmentShader.replace(
      "#include <normal_fragment_maps>",
      `#include <normal_fragment_maps>
#ifdef USE_COLOR_ALPHA
if (vColor.a < ${(CEL_ALPHA + 1) / 2}) {
${celBands("normal")}
}
#endif`,
    );
  };
  m.customProgramCacheKey = () => `${key.call(m)}|cel`;
  m.needsUpdate = true;
}
