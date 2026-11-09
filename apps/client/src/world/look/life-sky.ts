// Plan 73 phase 2.2 — the sky's light in the life look: an environment made from the dome as it's
// drawn now (its top, middle and horizon colours, by the hour, the weather and the fog — tp/sky.ts
// domeColours()), for the life materials' soft sheen and fill. Lessons from phase 0a's probe:
//
//   - on the life materials only (look/lit.ts lifeMaterials), never the scene's environment: that one
//     reached the unlit materials too, and their see-through parts went dark
//   - its strength follows what's left of the sky out under it (sky-left.ts) and the night, or the lot
//     and its cars shone at midnight
//   - made before the first material is drawn (the view makes it with the renderer), so no material
//     compiles twice for gaining one
//
// Made again only when the dome's colours have moved, at most twice a second: a few small renders.
import {
  BackSide,
  Color,
  Mesh,
  PMREMGenerator,
  Scene,
  ShaderMaterial,
  SphereGeometry,
  type WebGLRenderer,
  type WebGLRenderTarget,
} from "three";
import { skyLeft } from "../tp/sky-left";
import { setLifeEnv } from "./lit";

/** How strong the sky's light is on the life materials, out under a full sky by day. */
const SKY_K = 0.35;

export class LifeSky {
  private pm: PMREMGenerator;
  private scene = new Scene();
  private mat: ShaderMaterial;
  private rt: WebGLRenderTarget | null = null;
  private last = new Float32Array(9).fill(-1);
  private lastAt = -1e9;
  private k = -1;

  constructor(renderer: WebGLRenderer) {
    this.pm = new PMREMGenerator(renderer);
    this.mat = new ShaderMaterial({
      side: BackSide,
      depthWrite: false,
      uniforms: {
        top: { value: new Color(0.6, 0.66, 0.74) },
        mid: { value: new Color(0.7, 0.72, 0.75) },
        bot: { value: new Color(0.35, 0.33, 0.3) },
      },
      vertexShader:
        "varying vec3 vD; void main() { vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
      fragmentShader: `uniform vec3 top; uniform vec3 mid; uniform vec3 bot; varying vec3 vD;
        void main() {
          float t = vD.y;
          vec3 c = t > 0.0 ? mix(mid, top, smoothstep(0.0, 0.7, t)) : mix(mid, bot * 0.6, smoothstep(0.0, 0.35, -t));
          gl_FragColor = vec4(c, 1.0);
        }`,
    });
    this.scene.add(new Mesh(new SphereGeometry(10, 32, 16), this.mat));
    // (one now, from a neutral sky: every life material made from here on has an environment)
    this.make();
  }

  /** The dome as it is now, and the night (0 … 1): made again if its colours moved; the strength set
   *  every frame (cheap: a number on each life material, only when it changed). */
  update(dome: { top: Color; mid: Color; bot: Color }, night: number, now = performance.now()) {
    const cs = [dome.top, dome.mid, dome.bot];
    let moved = 0;
    for (let i = 0; i < 3; i++) {
      const c = cs[i];
      moved = Math.max(
        moved,
        Math.abs(c.r - this.last[i * 3]),
        Math.abs(c.g - this.last[i * 3 + 1]),
        Math.abs(c.b - this.last[i * 3 + 2]),
      );
    }
    if (moved > 0.01 && now - this.lastAt > 500) {
      const u = this.mat.uniforms;
      (u.top.value as Color).copy(dome.top);
      (u.mid.value as Color).copy(dome.mid);
      (u.bot.value as Color).copy(dome.bot);
      for (let i = 0; i < 3; i++) {
        this.last[i * 3] = cs[i].r;
        this.last[i * 3 + 1] = cs[i].g;
        this.last[i * 3 + 2] = cs[i].b;
      }
      this.lastAt = now;
      this.make();
    }
    const k = SKY_K * skyLeft.value * (1 - 0.9 * night);
    if (Math.abs(k - this.k) > 0.004) {
      this.k = k;
      setLifeEnv(this.rt?.texture ?? null, k);
    }
  }

  private make() {
    const was = this.rt;
    this.rt = this.pm.fromScene(this.scene, 0.02);
    setLifeEnv(this.rt.texture, this.k < 0 ? SKY_K : this.k);
    was?.dispose();
  }

  dispose() {
    this.rt?.dispose();
    this.pm.dispose();
    this.mat.dispose();
  }
}
