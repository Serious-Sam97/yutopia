import type { Material, MeshPhysicalMaterial, MeshStandardMaterial, Texture, WebGLRenderer } from "three";
import { PLAIN_ROUGH } from "../furn/life-mats";
import { libMaterial } from "../look/life-matlib";
import { LIBRARY, type MatId } from "../look/life-matlib-list";
import { adoptLife, litMaterial } from "../look/lit";
import type { Piece } from "../look/yulit";

// Plan 73 phase 6 — the kit's materials in the life look (furn/life-mats.ts KIT_MATS): a library
// material (its textures; the parts' colours multiplied through it) or a plain finish of its own
// roughness. A floor (tp/build.ts) makes one of each it draws, lit by its room's light as the rest.

let renderer: WebGLRenderer | null = null;
/** The renderer the library's textures load through (the view's, at start in the life look). */
export function setKitRenderer(r: WebGLRenderer | null): void {
  renderer = r;
}

/** (plan 73 phase 7) A floor's material: the library's (its UVs in metres, `uv`), its colour `tint`, the
 *  floor's bake (its shading, thresholds and strips: art/floors.ts) multiplied over it by `bakeUv` —
 *  lit by the room's light as the floor is (World3's `light`, the bake its `base`). */
export function floorMaterial(id: MatId, bake: Texture, tint: number): Material {
  if (!renderer) return litMaterial({ map: bake });
  const m = libMaterial(id, renderer, { color: tint });
  adoptLife(m as MeshStandardMaterial);
  m.userData.lib = true;
  m.userData.base = bakePiece(bake);
  return m;
}
const bakePiece = (bake: Texture): Piece => ({
  key: "floor-bake",
  patch(sh) {
    sh.uniforms.bakeMap = { value: bake };
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nattribute vec2 bakeUv;\nvarying vec2 vBakeUv;")
      .replace("#include <uv_vertex>", "#include <uv_vertex>\nvBakeUv = bakeUv;");
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform sampler2D bakeMap;\nvarying vec2 vBakeUv;")
      .replace(
        "#include <map_fragment>",
        "#include <map_fragment>\ndiffuseColor.rgb *= texture2D(bakeMap, vBakeUv).rgb;",
      );
  },
});

/** (plan 73 phase 7) The library material's relief and roughness laid on a material of its own painting
 *  (the campus's clad wall: its canvas kept, its joints, its band, the snow's mask) — `repeat` how many
 *  of the library's repeats its UVs span. The library's maps are shared: clones, their own repeat. */
export function libRelief(m: MeshStandardMaterial, id: MatId, repeat: [number, number]): void {
  if (!renderer || !("roughness" in m)) return;
  const lib = libMaterial(id, renderer);
  const def = LIBRARY[id];
  void (lib.userData.loaded as Promise<unknown>).then(() => {
    const own = (t: Texture | null) => {
      if (!t) return null;
      const c = t.clone();
      c.repeat.set(repeat[0], repeat[1]);
      return c;
    };
    m.normalMap = own(lib.normalMap);
    m.normalScale.set(def.normal, def.normal);
    m.roughnessMap = own(lib.roughnessMap);
    m.roughness = def.roughness;
    m.needsUpdate = true;
  });
  m.addEventListener("dispose", () => lib.dispose());
}

/** A kit material by its name: its vertex colours through it. */
export function kitMaterial(name: string): Material {
  if (name in LIBRARY && renderer) {
    const m = libMaterial(name as MatId, renderer, { color: 0xffffff });
    m.vertexColors = true;
    // (a weave's sheen: its colour can't follow the parts' — vertex colours don't reach it — so a soft
    // grey one, weaker than the library's own on a tinted cloth: white washed a dark sofa out)
    const ph = m as MeshPhysicalMaterial;
    if (ph.isMeshPhysicalMaterial && ph.sheen > 0) {
      ph.sheen = Math.min(ph.sheen, 0.3);
      ph.sheenColor.setScalar(0.28);
    }
    // (a metal of the kit's: part metal (0.4), so its colour — brass, chrome's grey — shows in a room's dim
    // sky, not only what it reflects: all metal, a brass lamp's pole went black)
    const st = m as MeshStandardMaterial;
    if (st.metalness > 0.5) st.metalness = 0.4;
    adoptLife(st);
    m.userData.kitMat = name;
    return m;
  }
  const m = litMaterial({ vertexColors: true, roughness: PLAIN_ROUGH[name] ?? 0.6 });
  m.userData.kitMat = name;
  return m;
}
