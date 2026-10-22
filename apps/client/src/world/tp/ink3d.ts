import {
  Color,
  type PerspectiveCamera,
  ShaderMaterial,
  type Texture,
  Vector2,
  type WebGLRenderer,
  type WebGLRenderTarget,
} from "three";
import { FullScreenQuad, Pass } from "three/addons/postprocessing/Pass.js";

// The world's ink (docs/plan/33-the-look.md): the people are drawn ligne
// claire, an ink line round them; the rooms and the Grounds get one too, where
// a silhouette or a crease breaks the surface. Read from the depth the frame
// already has — no second render of the scene: 1/depth runs linear across the
// screen over any plane, so a floor seen at a grazing angle stays clean and only
// edges (a jump) and creases (a kink) ink. Fades with distance (the far woods
// would be a scribble) and is softer after dark.

const INK = {
  uniforms: {
    tColor: { value: null as Texture | null },
    tDepth: { value: null as Texture | null },
    res: { value: new Vector2(1, 1) },
    near: { value: 0.1 },
    far: { value: 1000 },
    ink: { value: new Color("#1b2230").convertSRGBToLinear() },
    strength: { value: 0.8 },
    fade: { value: new Vector2(18, 90) },
  },
  vertexShader: "varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }",
  fragmentShader: `
    uniform sampler2D tColor; uniform sampler2D tDepth; uniform vec2 res; uniform float near; uniform float far;
    uniform vec3 ink; uniform float strength; uniform vec2 fade; varying vec2 vUv;
    // 1 / the view distance: linear across the screen over a plane
    float inv(vec2 uv) { float z = texture2D(tDepth, uv).x; return (far - z * (far - near)) / (near * far); }
    void main() {
      vec4 c = texture2D(tColor, vUv);
      float zc = texture2D(tDepth, vUv).x;
      if (zc >= 1.0) { gl_FragColor = c; return; } // the sky
      vec2 px = 1.0 / res;
      float i0 = inv(vUv);
      float il = inv(vUv - vec2(px.x, 0.0)), ir = inv(vUv + vec2(px.x, 0.0));
      float iu = inv(vUv + vec2(0.0, px.y)), id = inv(vUv - vec2(0.0, px.y));
      float ia = inv(vUv + px), ib = inv(vUv - px), ic = inv(vUv + vec2(px.x, -px.y)), ie = inv(vUv + vec2(-px.x, px.y));
      // how far from flat, as a share of the distance itself (near and far alike)
      float k = (abs(il + ir - 2.0 * i0) + abs(iu + id - 2.0 * i0) + 0.5 * (abs(ia + ib - 2.0 * i0) + abs(ic + ie - 2.0 * i0))) / i0;
      float e = smoothstep(0.012, 0.05, k);
      float d = 1.0 / i0;
      float w = 1.0 - smoothstep(fade.x, fade.y, d);
      // (multiplied in: a line on the snow is ink, on a dark wall it barely shows)
      gl_FragColor = vec4(mix(c.rgb, c.rgb * ink * 2.2, e * w * strength), c.a);
    }`,
};

export class InkPass extends Pass {
  private quad: FullScreenQuad;
  private mat: ShaderMaterial;

  constructor(private camera: PerspectiveCamera) {
    super();
    this.mat = new ShaderMaterial({ ...INK, uniforms: INK.uniforms, depthTest: false, depthWrite: false });
    this.quad = new FullScreenQuad(this.mat);
  }

  /** 0 by day … 1 at night: fainter in the dark (the lamps' pools stay clean) */
  setNight(n: number) {
    this.mat.uniforms.strength.value = 0.8 - 0.4 * n;
  }

  setSize(w: number, h: number) {
    this.mat.uniforms.res.value.set(w, h);
  }

  render(renderer: WebGLRenderer, writeBuffer: WebGLRenderTarget, readBuffer: WebGLRenderTarget) {
    const u = this.mat.uniforms;
    u.tColor.value = readBuffer.texture;
    u.tDepth.value = readBuffer.depthTexture;
    u.near.value = this.camera.near;
    u.far.value = this.camera.far;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.quad.render(renderer);
  }

  dispose() {
    this.mat.dispose();
    this.quad.dispose();
  }
}
