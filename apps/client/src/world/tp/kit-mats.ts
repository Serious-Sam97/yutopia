import {
  Color,
  type Material,
  type MeshPhysicalMaterial,
  type MeshStandardMaterial,
  type Texture,
  type WebGLRenderer,
} from "three";
import { PLAIN_ROUGH } from "../furn/life-mats";
import { libMaterial } from "../look/life-matlib";
import { LIBRARY, type MatId } from "../look/life-matlib-list";
import { adoptLife, litMaterial } from "../look/lit";
import { isLifeBuild, isLifeOut } from "../look/look-mode";
import type { Piece } from "../look/yulit";
import { lifeDress } from "./life-dress";
import { wx } from "./wx3d";

// Plan 73 phase 6 — the kit's materials in the life look (furn/life-mats.ts KIT_MATS): a library
// material (its textures; the parts' colours multiplied through it) or a plain finish of its own
// roughness. A floor (tp/build.ts) makes one of each it draws, lit by its room's light as the rest.

let renderer: WebGLRenderer | null = null;
/** The renderer the library's textures load through (the view's, at start in the life look). */
export function setKitRenderer(r: WebGLRenderer | null): void {
  renderer = r;
  // (plan 73 phase 8: the land's green, its detail the library's grass — the snow's layer, wx3d.ts)
  if (r && isLifeOut()) {
    const grass = libMaterial("grass", r);
    void (grass.userData.loaded as Promise<unknown>).then(() => {
      wx.wxGrass.value = grass.map;
      wx.wxGrassMean.value = GRASS_MEAN;
    });
  }
}
// (the library's grass's mean brightness as the layer reads it: its albedo's, linear — measured)
const GRASS_MEAN = 0.12;

/** (plan 73 phase 8) A ground's material (its painting kept: a road's verges and tracks, a pavement's
 *  joints) with the library's `id` relief and roughness on its up-facing faces, by where they are — its
 *  own UVs a quad each. Through the Grounds' hook (`userData.grounds`, light3d.ts patchGrounds and the
 *  floor's light), after what it had. */
export function groundRelief(m: Material, id: MatId): void {
  if (!renderer || !("roughness" in m)) return;
  const lib = libMaterial(id, renderer);
  const def = LIBRARY[id];
  const nmap = { value: lib.normalMap };
  const orm = { value: lib.roughnessMap };
  void (lib.userData.loaded as Promise<unknown>).then(() => {
    nmap.value = lib.normalMap;
    orm.value = lib.roughnessMap;
  });
  m.addEventListener("dispose", () => lib.dispose());
  const prev = m.userData.grounds as { patch: (sh: Shader) => void; key: string } | undefined;
  const at = `vec2 lrUv = ((vec4(-vViewPosition, 0.0) * viewMatrix).xyz + cameraPosition).xz / ${def.metres.toFixed(3)};
  float lrUp = smoothstep(0.7, 0.95, (vec4(nonPerturbedNormal, 0.0) * viewMatrix).y);`;
  m.userData.grounds = {
    key: `${prev?.key ?? ""}-lr-${id}`,
    patch(sh: Shader) {
      prev?.patch(sh);
      sh.uniforms.lrNormal = nmap;
      sh.uniforms.lrOrm = orm;
      sh.fragmentShader = sh.fragmentShader
        .replace("#include <common>", "#include <common>\nuniform sampler2D lrNormal;\nuniform sampler2D lrOrm;")
        .replace(
          "#include <normal_fragment_maps>",
          `#include <normal_fragment_maps>
{
  ${at}
  vec3 tn = texture2D(lrNormal, lrUv).xyz * 2.0 - 1.0;
  vec3 wn = normalize(vec3(tn.x * ${def.normal.toFixed(3)}, tn.z, tn.y * ${def.normal.toFixed(3)}));
  normal = normalize(mix(normal, normalize((viewMatrix * vec4(wn, 0.0)).xyz), lrUp));
  roughnessFactor = mix(roughnessFactor, texture2D(lrOrm, lrUv).g * ${(def.roughness / 0.8).toFixed(3)}, lrUp);
}`,
        );
    },
  };
  m.needsUpdate = true;
}
type Shader = { uniforms: Record<string, unknown>; fragmentShader: string };

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
/** (plan 73 phase 7) A plain surface of the library's (UVs in metres, `uv`), its colour `tint` — a
 *  ceiling's plaster; lit by the room's light as the rest (World3's `light`). */
export function surfaceMaterial(id: MatId, tint: number): Material {
  if (!renderer) return litMaterial({ color: tint });
  const m = libMaterial(id, renderer, { color: tint });
  adoptLife(m as MeshStandardMaterial);
  m.userData.lib = true;
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

/** (plan 73 phase 7.3) The mean colour of a self-coloured library material's albedo (sRGB, measured from
 *  tools/art/life/materials.mts): a colour over it divided by this keeps its tone. */
export const LIB_MEAN: Partial<Record<MatId, number>> = {
  concrete: 0xa39f9a,
  brick: 0x9e664f,
  "roof-slate": 0x53585f,
  pine: 0xd4ad74,
};
/** `hex` as a tint over the library material `id`: its colour against the material's own mean. */
export function tintOver(id: MatId, hex: number): Color {
  const c = new Color(hex);
  const m = new Color(LIB_MEAN[id] ?? 0xffffff);
  return c.setRGB(c.r / m.r, c.g / m.g, c.b / m.b);
}
/** (plan 73 phase 7.3) A plain-coloured material dressed in the library's `id` — its albedo, relief and
 *  roughness — its colour kept as the tone (`tintOver`; or `o.tint`'s, a painting's own colour it
 *  replaces); its UVs `o.k` metres a unit (1: in metres). */
export function libDress(m: MeshStandardMaterial, id: MatId, o: { tint?: number; k?: number } = {}): void {
  if (!renderer || !("roughness" in m)) return;
  const lib = libMaterial(id, renderer);
  const def = LIBRARY[id];
  const r = (o.k ?? 1) / def.metres;
  m.color.copy(tintOver(id, o.tint ?? m.color.getHex()));
  void (lib.userData.loaded as Promise<unknown>).then(() => {
    const own = (t: Texture | null) => {
      if (!t) return null;
      const c = t.clone();
      c.repeat.set(r, r);
      return c;
    };
    m.map = own(lib.map);
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

// (plan 73 phase 7) the campus, the stairwell and the Grounds' buildings dressed through these
// (tp/life-dress.ts: they don't import this module)
lifeDress.on = isLifeBuild();
lifeDress.relief = (m, id, k) => {
  const [a, b] = typeof k === "number" ? [k, k] : k;
  const metres = LIBRARY[id as MatId].metres;
  libRelief(m as MeshStandardMaterial, id as MatId, [a / metres, b / metres]);
};
lifeDress.surface = (id, tint) => surfaceMaterial(id as MatId, tint);
lifeDress.out = isLifeOut();
lifeDress.ground = (m, id) => groundRelief(m, id as MatId);
lifeDress.dress = (m, id, o) => libDress(m as MeshStandardMaterial, id as MatId, o);
lifeDress.tintOver = (id, hex) => tintOver(id as MatId, hex);
lifeDress.material = kitMaterial;
