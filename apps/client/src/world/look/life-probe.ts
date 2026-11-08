// Plan 73, phase 0a — the life look's light alone, on today's models (dev only, never in a build:
// WorldView loads it behind NODE_ENV). What it does to the running view, all undone by `off`:
//
//   materials  every Lambert of the scene, and the people's bodies, as Standard ones (a little sheen,
//              the sky's light in them) — their own hooks kept, chained (light map, fade, fog, snow)
//   cel        the cool shadow band and the warm rim of the people and the redrawn things taken out
//   ink        the world's ink pass and the people's line off
//   sky        an environment from the hour's sky and ground colours (the hemisphere's), for the sheen
//              and a soft fill — on the probe's materials only
//   shadows    the sun's softened (PCF's radius)
//   ao         ground-truth ambient occlusion over the frame, before the finish (GTAO)
//   finish     a tone curve (Khronos PBR Neutral) and a gentle S instead of today's straight sRGB
//
// The probe swaps what's in the scene when it's called: a thing streamed in after keeps today's look
// until it's called again (the stills script calls it before every frame).
import {
  BackSide,
  Color,
  type HemisphereLight,
  type Material,
  type Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  MeshStandardMaterial,
  type Object3D,
  type PerspectiveCamera,
  PMREMGenerator,
  Scene,
  ShaderMaterial,
  SphereGeometry,
  type Texture,
  Mesh as ThreeMesh,
  type WebGLRenderer,
  type WebGLRenderTarget,
} from "three";
import { GTAOPass } from "three/addons/postprocessing/GTAOPass.js";
import { litBalance } from "../tp/light3d";

/** What of the view the probe reaches into (its fields are private to the view: read as a shape). */
interface ViewLike {
  scene: Scene;
  camera: PerspectiveCamera;
  renderer: WebGLRenderer;
  hemi: HemisphereLight;
  sun: { shadow: { radius: number; blurSamples: number; needsUpdate: boolean } };
  charMats: Record<string, unknown> | null;
  post: PostLike | null;
  nightLevel: number;
}
interface PostLike {
  composer: { passes: unknown[]; insertPass(p: unknown, i: number): void; removePass(p: unknown): void };
  ink: { enabled: boolean };
  bloom: { enabled: boolean; strength: number; threshold: number; radius: number };
  finish: { material: ShaderMaterial; uniforms: Record<string, { value: unknown }> };
  lite: boolean;
  setNight(n: number): void;
  setSize(w: number, h: number, r: number): void;
}

export interface LifeOpts {
  materials?: boolean;
  cel?: boolean; // true: today's cel kept
  ink?: boolean; // true: today's ink kept
  sky?: number; // the environment's strength (0 none)
  shadowRadius?: number;
  ao?: number; // GTAO's blend (0 none)
  aoRadius?: number;
  exposure?: number;
  bloom?: number; // by day (night: today's)
  sat?: number;
  contrast?: number;
  roughness?: number;
  finish?: boolean; // false: today's finish kept
  aoDebug?: number; // GTAOPass.OUTPUT (4: the AO alone)
}
const DEFAULTS: Required<LifeOpts> = {
  materials: true,
  cel: false,
  ink: false,
  sky: 0.3,
  shadowRadius: 5,
  ao: 1,
  aoRadius: 1.4,
  exposure: 1.0,
  bloom: 0,
  sat: 1.12,
  contrast: 0.22,
  roughness: 0.78,
  finish: true,
  aoDebug: 0,
};

interface Kept {
  swapped: Map<Material, Material>; // today's → the probe's
  meshes: Map<Mesh, Material | Material[]>;
  inkMats: Material[];
  finFrag: string;
  setNight: (n: number) => void;
  shadowRadius: number;
  env: WebGLRenderTarget | null;
  ao: GTAOPass | null;
}
let kept: Kept | null = null;

const isInk = (m: Material) =>
  m instanceof MeshBasicMaterial && m.side === BackSide && String(m.onBeforeCompile).includes("inkPx");

/** Take the cel band and rim out of a fragment shader (chars/model.ts celShade, look/yulit.ts CEL —
 *  both cel.ts celBands). */
function noCel(f: string): string {
  return f.replaceAll(/vec3\(0\.6, 0\.64, 0\.86\)/g, "vec3(1.0)").replaceAll(/rim \* [0-9.]+ \*/g, "rim * 0.0 *");
}

function standardOf(old: MeshLambertMaterial | MeshBasicMaterial, o: Required<LifeOpts>): MeshStandardMaterial {
  const s = new MeshStandardMaterial();
  // (what both have, as it is)
  for (const k of [
    "name",
    "color",
    "map",
    "alphaMap",
    "aoMap",
    "aoMapIntensity",
    "lightMap",
    "lightMapIntensity",
    "vertexColors",
    "transparent",
    "opacity",
    "alphaTest",
    "side",
    "shadowSide",
    "depthWrite",
    "depthTest",
    "blending",
    "fog",
    "visible",
    "wireframe",
    "polygonOffset",
    "polygonOffsetFactor",
    "polygonOffsetUnits",
    "clippingPlanes",
    "clipIntersection",
    "clipShadows",
    "colorWrite",
    "alphaToCoverage",
    "premultipliedAlpha",
    "toneMapped",
    "stencilWrite",
    "stencilRef",
    "stencilFunc",
    "stencilZPass",
    "flatShading",
  ] as const) {
    // biome-ignore lint/suspicious/noExplicitAny: copying like-named fields between material classes
    const v = (old as any)[k];
    if (v === undefined) continue;
    // biome-ignore lint/suspicious/noExplicitAny: as above
    (s as any)[k] = v?.isColor ? v.clone() : v;
  }
  if (old instanceof MeshLambertMaterial) {
    s.emissive.copy(old.emissive);
    s.emissiveMap = old.emissiveMap;
    s.emissiveIntensity = old.emissiveIntensity;
  }
  s.userData = old.userData;
  // glass catches a sharp sky, the rest a soft sheen
  s.roughness = old.transparent && old.opacity < 0.9 ? 0.12 : o.roughness;
  s.metalness = 0;
  s.envMapIntensity = o.sky;
  const hook = old.onBeforeCompile; // (fog3d's wrapped one: its fog again on ours is the same uniforms)
  const key = old.customProgramCacheKey;
  const cel = o.cel;
  s.onBeforeCompile = (sh, r) => {
    hook.call(old, sh, r);
    if (!cel) sh.fragmentShader = noCel(sh.fragmentShader);
  };
  s.customProgramCacheKey = () => `${key.call(old)}|life${cel ? "c" : ""}`;
  return s;
}

/** The hour's sky as an environment: the hemisphere's colours, the sky a gradient over the ground. */
function skyEnv(r: WebGLRenderer, hemi: HemisphereLight): WebGLRenderTarget {
  const top = hemi.color.clone().multiplyScalar(hemi.intensity * 0.5);
  const ground = hemi.groundColor.clone().multiplyScalar(hemi.intensity * 0.35);
  const horizon = top.clone().lerp(new Color(1, 1, 1).multiplyScalar(hemi.intensity * 0.5), 0.4);
  const m = new ShaderMaterial({
    side: BackSide,
    uniforms: { top: { value: top }, horizon: { value: horizon }, ground: { value: ground } },
    vertexShader:
      "varying vec3 vD; void main() { vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
    fragmentShader: `uniform vec3 top; uniform vec3 horizon; uniform vec3 ground; varying vec3 vD;
      void main() { float y = vD.y; vec3 c = y > 0.0 ? mix(horizon, top, pow(y, 0.6)) : mix(horizon, ground, pow(-y, 0.35));
      gl_FragColor = vec4(c, 1.0); }`,
  });
  const s = new Scene();
  const g = new SphereGeometry(10, 32, 16);
  s.add(new ThreeMesh(g, m));
  const pm = new PMREMGenerator(r);
  const rt = pm.fromScene(s, 0.02);
  pm.dispose();
  g.dispose();
  m.dispose();
  return rt;
}

const FINISH = `
  uniform sampler2D tDiffuse; uniform float frame; uniform float grain; uniform vec2 res; varying vec2 vUv;
  uniform float lifeExpo; uniform float lifeSat; uniform float lifeCon;
  // (Khronos PBR Neutral's shoulder, three's NeutralToneMapping: the darks and mids as they are, only
  // the highlights eased in — ACES's toe swallowed the night, where the game's values sit near zero)
  vec3 neutral(vec3 color) {
    const float StartCompression = 0.8 - 0.04;
    const float Desaturation = 0.15;
    color *= lifeExpo;
    // (its toe — the darkest channel taken off near black — left out: it put out the night's faint
    // moonlit asphalt, which is all the lot has)
    float peak = max(color.r, max(color.g, color.b));
    if (peak < StartCompression) return color;
    float d = 1.0 - StartCompression;
    float newPeak = 1.0 - d * d / (peak + d - StartCompression);
    color *= newPeak / peak;
    float g = 1.0 - 1.0 / (Desaturation * (peak - newPeak) + 1.0);
    return mix(color, vec3(newPeak), g);
  }
  float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
  void main() {
    vec4 s = texture2D(tDiffuse, vUv);
    vec4 c = sRGBTransferOETF(vec4(clamp(neutral(max(s.rgb, 0.0)), 0.0, 1.0), s.a));
    float l = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
    // (a touch warm in the light, a touch cool in the shade: the sun and the sky)
    c.rgb *= mix(vec3(0.97, 0.99, 1.03), vec3(1.02, 1.0, 0.97), smoothstep(0.15, 0.75, l));
    c.rgb = mix(vec3(l), c.rgb, lifeSat);
    // (a gentle S: depth without crushing)
    c.rgb = mix(c.rgb, c.rgb * c.rgb * (3.0 - 2.0 * c.rgb), lifeCon);
    float d = distance(vUv, vec2(0.5)) / 0.7071;
    float v = smoothstep(0.45, 1.0, d) * 0.16;
    c.rgb = mix(c.rgb, vec3(0.08, 0.06, 0.05), v);
    c.a = mix(c.a, 1.0, v);
    float n = hash(floor(vUv * res) + frame) - 0.5;
    c.rgb += n * grain * c.a;
    gl_FragColor = c;
  }`;

/** Put the probe on the view (again: the scene's newcomers too, the sky's colours of now), or take
 *  it off. */
export function lifeProbe(view: unknown, on: boolean, opts: LifeOpts = {}): string {
  const v = view as ViewLike;
  const post = v.post;
  if (!post) return "no post (High or Medium only)";
  const o = { ...DEFAULTS, ...opts };
  if (!on) {
    if (!kept) return "off already";
    const k = kept;
    for (const [m, was] of k.meshes) m.material = was;
    if (v.charMats)
      for (const [key, val] of Object.entries(v.charMats))
        for (const [a, b] of k.swapped) if (val === b) v.charMats[key] = a;
    for (const m of k.inkMats) m.visible = true;
    for (const s of k.swapped.values()) s.dispose();
    post.ink.enabled = true;
    post.finish.material.fragmentShader = k.finFrag;
    post.finish.material.needsUpdate = true;
    post.setNight = k.setNight;
    v.sun.shadow.radius = k.shadowRadius;
    v.sun.shadow.needsUpdate = true;
    k.env?.dispose();
    if (k.ao) {
      post.composer.removePass(k.ao);
      k.ao.dispose();
    }
    kept = null;
    return "off";
  }
  kept ??= {
    swapped: new Map(),
    meshes: new Map(),
    inkMats: [],
    finFrag: post.finish.material.fragmentShader,
    setNight: post.setNight.bind(post),
    shadowRadius: v.sun.shadow.radius,
    env: null,
    ao: null,
  };
  const k: Kept = kept;
  // -- materials, cel and the people's ink
  const bodies = new Set<Material>();
  if (v.charMats) for (const key of ["body", "bodyAway"]) bodies.add(v.charMats[key] as Material);
  const mine = new Set<Material>(k.swapped.values());
  const swap = (m: Material): Material => {
    if (isInk(m)) {
      if (!o.ink && !k.inkMats.includes(m)) {
        m.visible = false;
        k.inkMats.push(m);
      }
      return m;
    }
    if (!o.materials) return m;
    if (mine.has(m)) return m; // (the probe's already)
    const lambert = m instanceof MeshLambertMaterial;
    if (!lambert && !bodies.has(m)) return m;
    let s = k.swapped.get(m);
    if (!s) {
      s = standardOf(m as MeshLambertMaterial | MeshBasicMaterial, o);
      k.swapped.set(m, s);
    }
    return s;
  };
  let n = 0;
  v.scene.traverse((ob: Object3D) => {
    const mesh = ob as Mesh;
    if (!mesh.isMesh || !mesh.material) return;
    const was = mesh.material;
    const now = Array.isArray(was) ? was.map(swap) : swap(was);
    if (Array.isArray(was) ? (now as Material[]).some((x, i) => x !== was[i]) : now !== was) {
      if (!k.meshes.has(mesh)) k.meshes.set(mesh, was);
      mesh.material = now;
      n++;
    }
  });
  // (the people met later: their factory's materials too)
  if (v.charMats)
    for (const key of ["body", "bodyAway"]) {
      const s = k.swapped.get(v.charMats[key] as Material);
      if (s) v.charMats[key] = s;
    }
  // -- the world's ink
  post.ink.enabled = o.ink;
  // -- the sky
  k.env?.dispose();
  k.env = o.sky > 0 ? skyEnv(v.renderer, v.hemi) : null;
  // (on the probe's materials only: as the scene's environment it reached today's unlit ones too — the
  // canopy's letters, the signs — and turned their see-through parts dark)
  // (and only as much of it as the game's own light lets through: out in the pitch dark the sun and the
  // sky's fill go with what's left of the sky — light3d.ts lmSkyLeft — and the sky's sheen with them,
  // or the lot and its cars shone at midnight)
  const envK = o.sky * litBalance.lmSkyLeft.value * (1 - 0.9 * (v.nightLevel ?? 0));
  for (const s of k.swapped.values()) {
    const sm = s as MeshStandardMaterial;
    sm.envMap = k.env ? (k.env.texture as Texture) : null;
    sm.envMapIntensity = envK;
    s.needsUpdate = true;
  }
  // -- shadows
  v.sun.shadow.radius = o.shadowRadius;
  v.sun.shadow.blurSamples = 16;
  v.sun.shadow.needsUpdate = true;
  // -- ambient occlusion, after the scene's pass (before the ink's)
  if (o.ao > 0) {
    if (!k.ao) {
      const w = v.renderer.domElement.width;
      const h = v.renderer.domElement.height;
      k.ao = new GTAOPass(v.scene, v.camera, w, h);
      // (its own depth pass drew what the frame doesn't — things the view hides around its own render —
      // as a black square in the sky: the frame's own depth instead, the one the ink reads, its normals
      // made from it)
      const ao = k.ao as unknown as {
        render(r: WebGLRenderer, w: WebGLRenderTarget, rb: WebGLRenderTarget, ...rest: unknown[]): void;
        setGBuffer(d: Texture | null | undefined): void;
        gtaoMaterial: Material;
        pdMaterial: Material;
      };
      const render = ao.render.bind(ao);
      let depth: Texture | null = null;
      ao.render = (r, w, rb, ...rest) => {
        if (rb.depthTexture && rb.depthTexture !== depth) {
          depth = rb.depthTexture;
          ao.setGBuffer(depth);
          ao.gtaoMaterial.needsUpdate = true;
          ao.pdMaterial.needsUpdate = true;
        }
        render(r, w, rb, ...rest);
      };
      post.composer.insertPass(k.ao, 1);
    }
    k.ao.blendIntensity = o.ao;
    k.ao.output = o.aoDebug;
    k.ao.updateGtaoMaterial({ radius: o.aoRadius, distanceFallOff: 1, thickness: 2, scale: 1.6, samples: 16 });
    k.ao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 10, rings: 3, samples: 16 });
  } else if (k.ao) {
    post.composer.removePass(k.ao);
    k.ao.dispose();
    k.ao = null;
  }
  // -- the finish: a filmic curve; a gentle bloom by day
  const u = post.finish.material.uniforms;
  u.lifeExpo = { value: o.exposure };
  u.lifeCon = { value: o.contrast };
  u.lifeSat = { value: o.sat };
  u.grain.value = post.lite ? 0 : 0.006;
  post.finish.material.fragmentShader = o.finish ? FINISH : k.finFrag;
  post.finish.material.needsUpdate = true;
  const night = k.setNight;
  const bloom = post.bloom;
  post.setNight = (nt: number) => {
    night(nt);
    if (post.lite) return;
    if (nt < 0.5) {
      bloom.enabled = o.bloom > 0;
      bloom.strength = Math.max(bloom.strength, o.bloom);
      bloom.threshold = Math.min(bloom.threshold, 0.78);
    }
  };
  return `on: ${n} meshes, ${k.swapped.size} materials, ${k.inkMats.length} ink`;
}
