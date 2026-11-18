// (plan 99 phase 5, F4a) The cars' reflection probe's own look: the world drawn into its cube with one plain material —
// each thing's own colour, lit by the sky's light and its own glow, the sky's gradient for what has no colour (the sky
// dome, the water, a shader's own things) — so the probe compiles a handful of small programs once, ahead, and never the
// world's every material again for its target (no tone mapping: a program set of its own — the 2.3 s freeze of plan 98).
import {
  Bone,
  BoxGeometry,
  Color,
  DoubleSide,
  Float32BufferAttribute,
  InstancedMesh,
  type Material,
  Mesh,
  type Object3D,
  Points,
  Scene,
  ShaderMaterial,
  Skeleton,
  SkinnedMesh,
  Uint16BufferAttribute,
} from "three";

const VERT = /* glsl */ `
#include <common>
#include <color_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
varying vec3 vN;
varying vec3 vW;
void main() {
  #include <color_vertex>
  #include <beginnormal_vertex>
  #include <morphnormal_vertex>
  #include <skinbase_vertex>
  #include <skinnormal_vertex>
  #include <defaultnormal_vertex>
  #include <begin_vertex>
  #include <morphtarget_vertex>
  #include <skinning_vertex>
  #include <project_vertex>
  vN = inverseTransformDirection(transformedNormal, viewMatrix);
  vec4 wp = vec4(transformed, 1.0);
  #ifdef USE_INSTANCING
  wp = instanceMatrix * wp;
  #endif
  vW = (modelMatrix * wp).xyz;
  gl_PointSize = 2.0;
}`;

const FRAG = /* glsl */ `
uniform vec3 col;
uniform vec3 glow;
uniform float alpha;
uniform float sky;
uniform float day;
uniform vec3 top;
uniform vec3 hor;
uniform vec3 low;
#include <common>
#include <color_pars_fragment>
varying vec3 vN;
varying vec3 vW;
void main() {
  vec4 diffuseColor = vec4(col, alpha);
  #include <color_fragment>
  vec3 c;
  if (sky > 0.5) {
    vec3 d = normalize(vW - cameraPosition);
    c = d.y > 0.0 ? mix(hor, top, smoothstep(0.0, 0.5, d.y)) : mix(hor, low, smoothstep(0.0, 0.15, -d.y));
  } else {
    // (a line's or a point's: no normal — lit from above)
    vec3 n = dot(vN, vN) > 1e-8 ? normalize(vN) : vec3(0.0, 1.0, 0.0);
    float l = 0.42 + 0.4 * max(n.y, 0.0) + 0.18 * max(dot(n, vec3(0.53, 0.6, 0.6)), 0.0);
    c = diffuseColor.rgb * l * day + glow;
  }
  // (never a NaN or a blinding texel into the cars' paint)
  c = clamp(c, 0.0, 32.0);
  gl_FragColor = vec4(c, diffuseColor.a);
  #include <colorspace_fragment>
}`;

type Lit = { color?: Color; emissive?: Color; emissiveIntensity?: number; opacity: number; transparent: boolean };

/** The probe's one material (put on as the scene's override for its faces); `look.set(n, dark, sky)` before them. */
export function probeLook(): ShaderMaterial & { set(day: number, top: Color, hor: Color, low: Color): void } {
  const u = {
    col: { value: new Color() },
    glow: { value: new Color() },
    alpha: { value: 1 },
    sky: { value: 0 },
    day: { value: 1 },
    top: { value: new Color() },
    hor: { value: new Color() },
    low: { value: new Color() },
  };
  const m = new ShaderMaterial({
    uniforms: u,
    vertexShader: VERT,
    fragmentShader: FRAG,
    side: DoubleSide,
    transparent: true,
  }) as ShaderMaterial & { set(day: number, top: Color, hor: Color, low: Color): void };
  // (both faces in one pass: a transparent double-sided one is drawn twice, its program checked again each time)
  m.forceSinglePass = true;
  // each thing's own colour, glow and opacity, read off its own material as it's drawn (the uniforms sent again)
  m.onBeforeRender = (_r, _s, _c, _g, object: Object3D, group) => {
    const own = (object as Mesh).material as Material | Material[] | undefined;
    const mat = (
      Array.isArray(own) ? own[(group as unknown as { materialIndex?: number } | null)?.materialIndex ?? 0] : own
    ) as (Material & Lit) | undefined;
    const unlit = !!(mat as { isMeshBasicMaterial?: boolean } | undefined)?.isMeshBasicMaterial;
    if (!mat?.color || (mat as { isShaderMaterial?: boolean }).isShaderMaterial) {
      u.sky.value = 1;
      u.alpha.value = 1;
    } else {
      u.sky.value = 0;
      // (unlit — a lamp's bulb, a glow, a screen —: its colour is its light)
      if (unlit) {
        u.col.value.setRGB(0, 0, 0);
        u.glow.value.copy(mat.color);
      } else {
        u.col.value.copy(mat.color);
        if (mat.emissive) u.glow.value.copy(mat.emissive).multiplyScalar(mat.emissiveIntensity ?? 1);
        else u.glow.value.setRGB(0, 0, 0);
      }
      u.alpha.value = mat.transparent ? mat.opacity : 1;
    }
    m.uniformsNeedUpdate = true;
  };
  m.set = (day, top, hor, low) => {
    u.day.value = day;
    u.top.value.copy(top);
    u.hor.value.copy(hor);
    u.low.value.copy(low);
  };
  return m;
}

/** What makes a thing's program its own in the probe's look: instanced (coloured, morphing), skinned, its morph targets'
 *  count and what they move. */
function kindOf(o: Object3D): string | null {
  const m = o as Mesh & {
    isInstancedMesh?: boolean;
    isSkinnedMesh?: boolean;
    instanceColor?: unknown;
    morphTexture?: unknown;
  };
  if (
    !(
      m.isMesh ||
      (o as Points).isPoints ||
      (o as { isLine?: boolean }).isLine ||
      (o as { isSprite?: boolean }).isSprite
    )
  )
    return null;
  const g = m.geometry;
  const mp = g?.morphAttributes?.position?.length ?? 0;
  const mn = g?.morphAttributes?.normal ? 1 : 0;
  const mc = g?.morphAttributes?.color ? 1 : 0;
  const morph = m.morphTargetInfluences?.length ? Math.max(mp, g?.morphAttributes?.normal?.length ?? 0) : 0;
  return `${m.isInstancedMesh ? 1 : 0}${m.instanceColor ? 1 : 0}${m.isInstancedMesh && m.morphTexture ? 1 : 0}${m.isSkinnedMesh ? 1 : 0}|${morph}|${morph ? mp : 0}${morph ? mn : 0}${morph ? mc : 0}`;
}

/** The probe's programs made ahead: every kind of thing in `world` not made yet (`known`) as a little stand-in in the
 *  probe's material, in a scene to compile for its target — or null, nothing new. */
export function probeWarm(
  look: ShaderMaterial,
  world: Object3D,
  known: Set<string>,
): { scene: Scene; dispose(): void } | null {
  const want = new Map<string, Object3D>();
  world.traverseVisible((o) => {
    const k = kindOf(o);
    if (k !== null && !known.has(k) && !want.has(k)) want.set(k, o);
  });
  if (!want.size) return null;
  const scene = new Scene();
  const made: { dispose(): void }[] = [];
  for (const [k, o] of want) {
    known.add(k);
    const src = o as Mesh & {
      isInstancedMesh?: boolean;
      isSkinnedMesh?: boolean;
      instanceColor?: unknown;
      morphTexture?: unknown;
    };
    const g = new BoxGeometry(0.1, 0.1, 0.1);
    made.push(g);
    const sm = src.geometry?.morphAttributes;
    const nMorph = src.morphTargetInfluences?.length ?? 0;
    if (nMorph) {
      const n = Math.max(sm?.position?.length ?? 0, sm?.normal?.length ?? 0, nMorph);
      if (sm?.position) g.morphAttributes.position = Array.from({ length: n }, () => g.attributes.position.clone());
      if (sm?.normal) g.morphAttributes.normal = Array.from({ length: n }, () => g.attributes.normal.clone());
      if (sm?.color)
        g.morphAttributes.color = Array.from(
          { length: n },
          () => new Float32BufferAttribute(new Float32Array(g.attributes.position.count * 3), 3),
        );
    }
    let d: Mesh;
    if (src.isSkinnedMesh) {
      const c = g.attributes.position.count;
      g.setAttribute("skinIndex", new Uint16BufferAttribute(new Uint16Array(c * 4), 4));
      g.setAttribute("skinWeight", new Float32BufferAttribute(new Float32Array(c * 4).fill(0.25), 4));
      const bone = new Bone();
      const sk = new SkinnedMesh(g, look);
      sk.add(bone);
      sk.bind(new Skeleton([bone]));
      made.push(sk.skeleton);
      d = sk;
    } else if (src.isInstancedMesh) {
      const im = new InstancedMesh(g, look, 1);
      if (src.instanceColor) im.setColorAt(0, new Color(1, 1, 1));
      if (src.morphTexture && nMorph) {
        im.updateMorphTargets();
        im.setMorphAt(0, im as unknown as Mesh);
      }
      made.push(im);
      d = im;
    } else if ((src as unknown as Points).isPoints) d = new Points(g, look) as unknown as Mesh;
    else d = new Mesh(g, look);
    if (nMorph) d.updateMorphTargets();
    d.position.set(0, 0, -1);
    d.frustumCulled = false;
    scene.add(d);
  }
  return {
    scene,
    dispose() {
      for (const x of made) x.dispose();
    },
  };
}
