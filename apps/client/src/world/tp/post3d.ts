import { type Camera, type Scene, Vector2, type WebGLRenderer } from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";

// High quality's finish, as the iso view's (world/post.ts): screens, lamps and
// neon bloom at night, then a gentle warm grade, a soft vignette and a whisper
// of film grain. Medium and Low draw straight to the screen.
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
      c.rgb *= vec3(1.0, 0.97, 0.93); // warm, no dimming
      // vignette: clear in the middle, a warm dark at the corners
      float d = distance(vUv, vec2(0.5)) / 0.7071;
      float v = smoothstep(0.33, 1.0, d) * 0.32;
      c.rgb = mix(c.rgb, vec3(0.102, 0.063, 0.039), v);
      // grain, a new pattern each frame
      float n = hash(floor(vUv * res) + frame) - 0.5;
      c.rgb += n * grain;
      gl_FragColor = c;
    }`,
};

export class Post3 {
  private composer: EffectComposer;
  private bloom: UnrealBloomPass;
  private finish: ShaderPass;
  private frame = 0;
  private over: RenderPass | null = null; // first person's hands, over the room (its depth cleared)

  constructor(renderer: WebGLRenderer, scene: Scene, camera: Camera) {
    this.composer = new EffectComposer(renderer);
    this.composer.addPass(new RenderPass(scene, camera));
    this.bloom = new UnrealBloomPass(new Vector2(256, 256), 0, 0.62, 0.72);
    this.composer.addPass(this.bloom);
    this.finish = new ShaderPass(FINISH);
    this.composer.addPass(this.finish);
  }

  setSize(w: number, h: number, ratio: number) {
    this.composer.setPixelRatio(ratio);
    this.composer.setSize(w, h);
    // bloom at half size is plenty (and cheap)
    this.bloom.resolution.set((w * ratio) / 2, (h * ratio) / 2);
    this.finish.uniforms.res.value.set(w * ratio, h * ratio);
  }

  // 0 by day … 1 at night: how much glows
  setNight(n: number) {
    this.bloom.strength = 1.2 * n; // (iso's High halo round lamps, screens and light strips)
    this.bloom.enabled = n > 0.05;
  }

  render(moving: boolean, over?: { scene: Scene; camera: Camera } | null) {
    if (over && !this.over) {
      this.over = new RenderPass(over.scene, over.camera);
      this.over.clear = false;
      this.over.clearDepth = true;
      this.composer.insertPass(this.over, 1);
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
    this.over?.dispose();
    this.composer.dispose();
    this.bloom.dispose();
  }
}
