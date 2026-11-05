// The structures' material family (docs/plan/71-the-renderer.md, phase 1; docs/plan/72-the-3d-core.md,
// phase 8 — "one material family for the structures from the start"): a lit material of the world
// is three's Lambert with our look on it, put together here in one place and one order — not hooks
// chained on hooks by whoever touched it last. Its parts:
//
//   base   what the material does on its own, first (a campus material's own hook: patchOutdoors)
//   light  the room's light (tp/light3d.ts Light3.piece: its light map, the day's balance, the lamps'
//          pools, the snow's layer where it's open to the sky) — or the open sky's (tp/light3d.ts
//          outdoorsPiece: the campus's outside); none: three's own lights alone
//   cel    the redrawn things' bands, on the vertices marked so (furn/look.ts CEL_ALPHA)
//   fade   the fade flags: a merged piece whose flag is down isn't drawn (World3.faded)
//
// and the fog over all of them (tp/fog3d.ts: every material's, on three's own fog chunk). One hook,
// the parts in that order, one program key from what's in it — so the same parts are always the
// same program, and the look is one file to write again (TSL, plan 71 phase 5).
import type { Material, Texture, WebGLRenderer } from "three";
import { celBands } from "../cel";
import { CEL_ALPHA } from "../furn/look";

export type Shader = Parameters<Material["onBeforeCompile"]>[0];

/** One part of the look: what it does to a shader, and the program's key for it (the same key, the
 *  same shader). */
export interface Piece {
  key: string;
  patch(sh: Shader, r: WebGLRenderer): void;
}

export interface YuLitParts {
  base?: Piece | null;
  light?: Piece | null;
  cel?: Piece | null;
  fade?: Piece | null;
}

/** Make `m` (a Lambert or Basic of the world's) one of the family, with these parts. Again with other
 *  parts: those instead (a floor's light swapped for the one below's — World3.setLight). */
export function yuLit(m: Material, parts: YuLitParts): void {
  const ps = [parts.base, parts.light, parts.cel, parts.fade].filter((p): p is Piece => !!p);
  m.onBeforeCompile = (sh, r) => {
    for (const p of ps) p.patch(sh, r);
  };
  const key = ["yu", ...ps.map((p) => p.key)].join("|");
  m.customProgramCacheKey = () => key;
  m.needsUpdate = true;
}

/** The redrawn things' look (docs/plan/67, decision 3): cel bands on the vertices marked by their
 *  colour's alpha — an opaque material shows none of it. */
export const CEL: Piece = {
  key: "cel",
  patch(sh) {
    sh.fragmentShader = sh.fragmentShader.replace(
      "#include <normal_fragment_maps>",
      `#include <normal_fragment_maps>
#ifdef USE_COLOR_ALPHA
if (vColor.a < ${(CEL_ALPHA + 1) / 2}) {
${celBands("normal")}
}
#endif`,
    );
  },
};

/** The fade flags (World3's: one texel a fading piece, `width` across): a merged vertex whose piece's
 *  flag is down (`aFade` its index, 0 none) is put past the far plane. */
export function fadePiece(flags: { value: Texture }, width: number): Piece {
  return {
    key: "fade",
    patch(sh) {
      sh.uniforms.fadeFlags = flags;
      sh.vertexShader = sh.vertexShader
        .replace("#include <common>", "#include <common>\nattribute float aFade;\nuniform sampler2D fadeFlags;")
        .replace(
          "#include <project_vertex>",
          `#include <project_vertex>
  if (aFade > 0.5) {
    int fi = int(aFade + 0.5);
    if (texelFetch(fadeFlags, ivec2(fi % ${width}, fi / ${width}), 0).r < 0.5) gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
  }`,
        );
    },
  };
}
