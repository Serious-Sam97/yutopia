import {
  type Camera,
  CustomBlending,
  DepthTexture,
  HalfFloatType,
  Mesh,
  OneFactor,
  type PerspectiveCamera,
  PlaneGeometry,
  Scene,
  Vector2,
  type WebGLRenderer,
  WebGLRenderTarget,
  ZeroFactor,
} from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { litCap } from "../art/daylight";
import { lifeShoulder } from "../look/life-tone";
import { isLife } from "../look/look-mode";
import { InkPass } from "./ink3d";

// High quality's finish: screens, lamps and
// neon bloom at night, then the grade (docs/plan/33-the-look.md: blue in the
// shade, warm in the light), a soft vignette and a whisper of film grain. The
// world's ink line (ink3d.ts) first. Medium: the ink and the grade, no bloom or
// grain. Low draws straight to the screen.
//
// One pass does what three's OutputPass does (linear → the screen's sRGB) and
// the finish together: a full-screen pass fewer per frame (they're 3200×2000
// pixels on a Retina screen).

const FINISH = {
  uniforms: {
    tDiffuse: { value: null },
    frame: { value: 0 },
    grain: { value: 0.014 },
    res: { value: new Vector2(1, 1) },
  },
  vertexShader:
    "varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
  fragmentShader: `
    // (sRGBTransferOETF comes with every fragment shader's prefix in three)
    uniform sampler2D tDiffuse; uniform float frame; uniform float grain; uniform vec2 res; varying vec2 vUv;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      // the scene is rendered linear (half float); to the screen's colours first
      vec4 c = sRGBTransferOETF(texture2D(tDiffuse, vUv));
      // the grade: the shade a little blue, the light a little warm, a touch more colour
      float l = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
      c.rgb *= mix(vec3(0.84, 0.91, 1.06), vec3(1.01, 1.0, 0.97), smoothstep(0.12, 0.8, l));
      c.rgb = mix(vec3(dot(c.rgb, vec3(0.2126, 0.7152, 0.0722))), c.rgb, 1.1);
      // vignette: clear in the middle, a warm dark at the corners
      float d = distance(vUv, vec2(0.5)) / 0.7071;
      float v = smoothstep(0.33, 1.0, d) * 0.32;
      c.rgb = mix(c.rgb, vec3(0.102, 0.063, 0.039), v);
      // (where a glass is a hole — alpha under 1, a player under the canvas: live.ts —
      // the dark goes over what shows through it too: as cover, its alpha raised with it)
      c.a = mix(c.a, 1.0, v);
      // grain, a new pattern each frame
      float n = hash(floor(vUv * res) + frame) - 0.5;
      c.rgb += n * grain * c.a;
      gl_FragColor = c;
    }`,
};

// The life look's finish (docs/plan/73, phase 2.3; tried by phase 0a's probe): a tone curve — the
// shoulder of Khronos PBR Neutral (three's NeutralToneMapping) without its toe, which put out the
// night's faint moonlit asphalt — and a gentle S for depth; the grade milder (a touch warm in the
// light, a touch cool in the shade), a little more colour, a lighter vignette, a whisper of grain.
const LIFE_FINISH = {
  uniforms: {
    tDiffuse: { value: null },
    frame: { value: 0 },
    grain: { value: 0.006 },
    res: { value: new Vector2(1, 1) },
  },
  vertexShader: FINISH.vertexShader,
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float frame; uniform float grain; uniform vec2 res; varying vec2 vUv;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    ${lifeShoulder("lifeShoulder")}
    void main() {
      vec4 s = texture2D(tDiffuse, vUv);
      vec4 c = sRGBTransferOETF(vec4(clamp(lifeShoulder(max(s.rgb, 0.0)), 0.0, 1.0), s.a));
      float l = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
      c.rgb *= mix(vec3(0.97, 0.99, 1.03), vec3(1.02, 1.0, 0.97), smoothstep(0.15, 0.75, l));
      c.rgb = mix(vec3(l), c.rgb, 1.12);
      c.rgb = mix(c.rgb, c.rgb * c.rgb * (3.0 - 2.0 * c.rgb), 0.22);
      float d = distance(vUv, vec2(0.5)) / 0.7071;
      float v = smoothstep(0.45, 1.0, d) * 0.16;
      c.rgb = mix(c.rgb, vec3(0.08, 0.06, 0.05), v);
      c.a = mix(c.a, 1.0, v);
      float n = hash(floor(vUv * res) + frame) - 0.5;
      c.rgb += n * grain * c.a;
      gl_FragColor = c;
    }`,
};

export class Post3 {
  private composer: EffectComposer;
  private bloom: UnrealBloomPass;
  private finish: ShaderPass;
  private frame = 0;
  private over: RenderPass | null = null; // first person's hands, over the room (its depth cleared)

  private ink: InkPass;
  /** the life look's ground-truth AO on High (loaded on its own: the classic look never pays for it) */
  private ao: { setSize(w: number, h: number): void; dispose(): void; enabled: boolean } | null = null;
  private readonly life = isLife();

  constructor(
    renderer: WebGLRenderer,
    scene: Scene,
    camera: PerspectiveCamera,
    readonly lite = false, // Medium: no bloom, no grain
  ) {
    // (the scene's depth kept for the ink)
    const size = renderer.getDrawingBufferSize(new Vector2());
    const rt = new WebGLRenderTarget(size.x, size.y, { type: HalfFloatType });
    rt.depthTexture = new DepthTexture(size.x, size.y);
    this.composer = new EffectComposer(renderer, rt);
    this.composer.addPass(new RenderPass(scene, camera));
    this.ink = new InkPass(camera);
    this.composer.addPass(this.ink);
    // (the life look draws no ink: docs/plan/73, F4)
    this.ink.enabled = !this.life;
    this.bloom = new UnrealBloomPass(new Vector2(256, 256), 0, 0.62, 0.72);
    // (a stray NaN pixel — a degenerate normal somewhere — blurred out by the
    // bloom blacked out the whole frame after dark: the bloom never takes one in)
    const hp = this.bloom.materialHighPassFilter;
    hp.fragmentShader = hp.fragmentShader.replace(
      "vec4 texel = texture2D( tDiffuse, vUv );",
      "vec4 texel = texture2D( tDiffuse, vUv );\n\t\t\tif ( any( isnan( texel ) ) || any( isinf( texel ) ) ) texel = vec4( 0.0 );",
    );
    hp.needsUpdate = true;
    // (added to the colour only: the frame's alpha — a glass's hole — left as it is)
    const bm = this.bloom.blendMaterial;
    bm.blending = CustomBlending;
    bm.blendSrc = OneFactor;
    bm.blendDst = OneFactor;
    bm.blendSrcAlpha = ZeroFactor;
    bm.blendDstAlpha = OneFactor;
    this.composer.addPass(this.bloom);
    this.finish = new ShaderPass(this.life ? LIFE_FINISH : FINISH);
    if (lite) this.finish.uniforms.grain.value = 0;
    this.composer.addPass(this.finish);
    if (this.life && !lite) void this.addAO(scene, camera, renderer);
  }

  /** The life look's AO (High): three's GTAO, fed the frame's own depth — the one the ink reads; its own
   *  depth pass drew what the view hides around its render, a black square in the sky (phase 0a). */
  private async addAO(scene: Scene, camera: PerspectiveCamera, renderer: WebGLRenderer) {
    const { GTAOPass } = await import("three/addons/postprocessing/GTAOPass.js");
    if (this.disposed) return;
    const size = renderer.getDrawingBufferSize(new Vector2());
    // (at half the frame's size — its shading is soft, and at full size it alone took High past 16.7 ms a
    // frame in the lobby, the town: plan 73 phase 11)
    const ao = new GTAOPass(scene, camera, size.x / 2, size.y / 2);
    // (halved however it's sized: the composer sizes every pass to the frame's own)
    const sized = ao.setSize.bind(ao);
    ao.setSize = (w: number, h: number) => sized(Math.ceil(w / 2), Math.ceil(h / 2));
    ao.blendIntensity = 1;
    // (eight samples and eight to smooth them: sixteen of each took ~1.8 ms of High's frame even at half
    // size — plan 73)
    ao.updateGtaoMaterial({ radius: 1.4, distanceFallOff: 1, thickness: 2, scale: 1.6, samples: 8 });
    ao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 8, rings: 2, samples: 8 });
    // (pointed at the frame's depth now, and its shaders compiled while it loads: no recompile and no
    // hitch on its first frame in play)
    const rt = this.composer.renderTarget1;
    if (rt.depthTexture) ao.setGBuffer(rt.depthTexture);
    const warm = new Scene();
    const quad = new PlaneGeometry(2, 2);
    for (const m of [ao.gtaoMaterial, ao.pdMaterial, ao.blendMaterial]) if (m) warm.add(new Mesh(quad, m));
    await renderer.compileAsync(warm, camera).catch(() => {});
    quad.dispose();
    if (this.disposed) {
      ao.dispose();
      return;
    }
    const render = ao.render.bind(ao);
    let depth: unknown = rt.depthTexture;
    ao.render = (r, w, rb, ...rest) => {
      // (the composer's two targets take turns frame to frame: only the depth's uniform follows them,
      // its shaders the same for either)
      if (rb.depthTexture && rb.depthTexture !== depth) {
        depth = rb.depthTexture;
        ao.setGBuffer(rb.depthTexture);
      }
      render(r, w, rb, ...rest);
    };
    // (right after the scene's pass: before the bloom and the finish)
    this.composer.insertPass(ao, 1);
    this.ao = ao;
  }
  private disposed = false;

  setSize(w: number, h: number, ratio: number) {
    this.ao?.setSize(w * ratio, h * ratio);
    this.composer.setPixelRatio(ratio);
    this.composer.setSize(w, h);
    // bloom at half size is plenty (and cheap)
    this.bloom.resolution.set((w * ratio) / 2, (h * ratio) / 2);
    this.finish.uniforms.res.value.set(w * ratio, h * ratio);
    this.ink.setSize(w * ratio, h * ratio);
  }

  // 0 by day … 1 at night: how much glows
  setNight(n: number) {
    this.bloom.strength = 1.2 * n; // (High's halo round lamps, screens and light strips)
    this.bloom.enabled = n > 0.05 && !this.lite;
    this.ink.setNight(n);
    // over what lit things can reach (light3d.ts): only what glows blooms
    this.bloom.threshold = litCap(n) + 0.02;
  }

  /** The morning fog (fog3d.ts): the ink's lines go with it. */
  setFog(a: number, wall: number, reach: number) {
    this.ink.setFog(a, wall, reach);
  }

  render(moving: boolean, over?: { scene: Scene; camera: Camera } | null) {
    if (over && !this.over) {
      this.over = new RenderPass(over.scene, over.camera);
      this.over.clear = false;
      this.over.clearDepth = true;
      // (after the ink — and the AO, in the life look: the hands get neither)
      this.composer.insertPass(this.over, this.composer.passes.indexOf(this.ink) + 1);
    }
    if (this.over) {
      this.over.enabled = !!over;
      if (over) {
        this.over.scene = over.scene;
        this.over.camera = over.camera;
      }
    }
    if (moving) this.frame = (this.frame + 1) % 997;
    this.finish.uniforms.frame.value = this.frame;
    this.composer.render();
  }

  dispose() {
    this.disposed = true;
    this.ao?.dispose();
    this.over?.dispose();
    this.composer.dispose();
    this.bloom.dispose();
    this.ink.dispose();
  }
}
