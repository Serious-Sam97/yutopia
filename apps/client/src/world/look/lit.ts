// Plan 73 phase 2.1 — the one way the world makes a lit material: `litMaterial(params)`. In the classic
// look it is exactly today's MeshLambertMaterial (the same class, the same parameters: nothing drawn
// differently); in the life look a MeshStandardMaterial with them — rough and not metal by default (the
// painted look's soft sheen), glass smooth — that the sky's light and the life finish then work on
// (phase 2.2–2.3). Every `new MeshLambertMaterial(` in the world's code goes through here.
import {
  type Material,
  MeshLambertMaterial,
  type MeshLambertMaterialParameters,
  MeshPhysicalMaterial,
  type MeshPhysicalMaterialParameters,
  MeshStandardMaterial,
  type MeshStandardMaterialParameters,
  type Texture,
} from "three";
import { isLife, isLifeOut } from "./look-mode";

/** What a lit material may say beyond Lambert's: how rough or metallic it is in the life look (ignored in
 *  the classic one). */
export interface LitParameters extends MeshLambertMaterialParameters {
  roughness?: number;
  metalness?: number;
}

/** Every life material made, for what's set on them all later (the sky's light: phase 2.2). */
export const lifeMaterials = new Set<MeshStandardMaterial>();

/** The sky's light on the life materials (look/life-sky.ts): its environment and how strong it is now —
 *  given to each as it's made, and to all of them when it changes. */
const env: { texture: Texture | null; k: number } = { texture: null, k: 0.35 };
export function setLifeEnv(texture: Texture | null, k: number) {
  env.texture = texture;
  env.k = k;
  for (const m of lifeMaterials) {
    // (gaining or losing one is another program; another texture of the same kind isn't)
    const had = m.envMap !== null;
    m.envMap = texture;
    m.envMapIntensity = k;
    if (had !== (texture !== null)) m.needsUpdate = true;
  }
}

/** A lit material of the world: today's Lambert, or in the life look a Standard one. Typed as Lambert so
 *  every caller reads it as before (color, map, emissive… both have them). */
/** (plan 73 phase 8.3) A vehicle's paint: in the life look's outdoors a clearcoat over a satin base (the
 *  sky in it), its colours the vertices' or `color`; else today's lit material. */
export function paintMaterial(params: LitParameters = {}): MeshLambertMaterial {
  if (!isLifeOut()) return litMaterial(params);
  const {
    roughness: _r,
    metalness: _m,
    flatShading: _f,
    ...rest
  } = params as LitParameters & {
    flatShading?: boolean;
  };
  const m = new MeshPhysicalMaterial({
    ...(rest as MeshPhysicalMaterialParameters),
    roughness: 0.42,
    metalness: 0.08,
    clearcoat: 0.6,
    clearcoatRoughness: 0.18,
    envMap: env.texture,
    envMapIntensity: env.k,
  });
  lifeMaterials.add(m);
  m.addEventListener("dispose", () => lifeMaterials.delete(m));
  return m as unknown as MeshLambertMaterial;
}
export function litMaterial(params: LitParameters = {}): MeshLambertMaterial {
  const { roughness, metalness, ...lambert } = params;
  if (!isLife()) return new MeshLambertMaterial(lambert);
  // (Lambert-only parameters dropped: Standard has no reflectivity, combine, refraction, specular map)
  const {
    reflectivity: _r,
    combine: _c,
    refractionRatio: _rr,
    specularMap: _s,
    flatShading,
    ...rest
  } = lambert as MeshLambertMaterialParameters & { [k: string]: unknown };
  const glass = rest.transparent === true && (rest.opacity ?? 1) < 0.9;
  const m = new MeshStandardMaterial({
    ...(rest as MeshStandardMaterialParameters),
    flatShading,
    roughness: roughness ?? (glass ? 0.12 : 0.8),
    metalness: metalness ?? 0,
    envMap: env.texture,
    envMapIntensity: env.k,
  });
  lifeMaterials.add(m);
  m.addEventListener("dispose", () => lifeMaterials.delete(m));
  // (read as a Lambert by its callers: the properties they touch are shared)
  return m as unknown as MeshLambertMaterial;
}

/** Whether `m` is one of the world's lit materials (Lambert, or a life Standard one). */
export function isLit(m: Material): boolean {
  return (m as MeshLambertMaterial).isMeshLambertMaterial === true || lifeMaterials.has(m as MeshStandardMaterial);
}

/** (plan 73 phase 10) A life material drawn by another renderer (a picture's): its own sky, or none —
 *  the game's is that renderer's, not this one's — and not the game's sky's to change. */
export function ownSky(m: MeshStandardMaterial, texture: Texture | null, k = env.k): void {
  lifeMaterials.delete(m);
  const had = m.envMap !== null;
  m.envMap = texture;
  m.envMapIntensity = k;
  if (had !== (texture !== null)) m.needsUpdate = true;
}

/** A life material made elsewhere (the library's: look/life-matlib.ts) given the sky's light as the
 *  world's own are, now and when it changes (plan 73 phase 6: the kit's materials). */
export function adoptLife(m: MeshStandardMaterial): void {
  m.envMap = env.texture;
  m.envMapIntensity = env.k;
  lifeMaterials.add(m);
  m.addEventListener("dispose", () => lifeMaterials.delete(m));
}
