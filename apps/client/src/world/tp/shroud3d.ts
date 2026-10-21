import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  type Camera,
  CanvasTexture,
  NormalBlending,
  Points,
  type Scene,
  ShaderMaterial,
} from "three";

// The shadowed's shroud (docs/plan/30-the-dark.md D5, the mocks' 01-woods-burn):
// dark smoke on the body, streaming off it and up, thinning as the shield goes;
// gathering into a shape as one comes out of the dark; embers and a hot edge
// where a focused beam burns it; a burst of light when one is killed, the smoke
// going out over the snow when one just leaves. Drawn a little towards the eye
// (the body would swallow puffs inside it). Two point clouds for all of them:
// the smoke (it darkens what's behind), the embers (they add light).

const PER = 56; // puffs a shadowed
const EMBERS = 24;
const MAX = 40;

export interface ShroudIn {
  id: string;
  x: number;
  y: number;
  z: number; // feet
  /** 0 bare … 1 the full shroud (the shield) */
  dark: number;
  state: string;
  /** s into its state */
  t: number;
  /** a focused beam on it now: from where (to throw the embers off the lit side) */
  burn: { x: number; y: number } | null;
}

interface Slot {
  id: string;
  seed: number;
  seen: number;
}

function soft(): CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d") as CanvasRenderingContext2D;
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, "rgba(255,255,255,1)");
  r.addColorStop(0.5, "rgba(255,255,255,0.45)");
  r.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = r;
  g.fillRect(0, 0, 64, 64);
  return new CanvasTexture(c);
}

function cloud(n: number, additive: boolean, tex: CanvasTexture) {
  const geo = new BufferGeometry();
  geo.setAttribute("position", new BufferAttribute(new Float32Array(n * 3), 3));
  geo.setAttribute("tint", new BufferAttribute(new Float32Array(n * 4), 4));
  geo.setAttribute("size", new BufferAttribute(new Float32Array(n), 1));
  const mat = new ShaderMaterial({
    uniforms: { map: { value: tex }, scale: { value: 400 } },
    vertexShader: `
      attribute vec4 tint;
      attribute float size;
      uniform float scale;
      varying vec4 vTint;
      void main() {
        vTint = tint;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = size * scale / max(0.5, -mv.z);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform sampler2D map;
      varying vec4 vTint;
      void main() {
        float a = texture2D(map, gl_PointCoord).a * vTint.a;
        if (a < 0.01) discard;
        gl_FragColor = vec4(vTint.rgb, a);
      }`,
    transparent: true,
    depthWrite: false,
    blending: additive ? AdditiveBlending : NormalBlending,
  });
  const pts = new Points(geo, mat);
  pts.frustumCulled = false;
  pts.renderOrder = additive ? 6 : 5;
  return pts;
}

// a fixed random per puff (the same every frame: no flicker)
function h(i: number, k: number): number {
  const x = Math.sin(i * 127.1 + k * 311.7) * 43758.5453;
  return x - Math.floor(x);
}

export class Shroud3 {
  private tex = soft();
  readonly smoke = cloud(MAX * PER, false, this.tex);
  readonly embers = cloud(MAX * EMBERS, true, this.tex);
  private slots: (Slot | null)[] = Array.from({ length: MAX }, () => null);
  private time = 0;

  constructor(scene: Scene) {
    scene.add(this.smoke, this.embers);
  }

  dispose(): void {
    this.smoke.removeFromParent();
    this.embers.removeFromParent();
    this.smoke.geometry.dispose();
    this.embers.geometry.dispose();
    (this.smoke.material as ShaderMaterial).dispose();
    (this.embers.material as ShaderMaterial).dispose();
    this.tex.dispose();
  }

  /** Every frame: the shadowed in view (their feet, their shroud), the camera, the night (0..1). */
  update(list: ShroudIn[], cam: Camera, dt: number, night: number, height: number, px: number): void {
    this.time += dt;
    (this.smoke.material as ShaderMaterial).uniforms.scale.value = px;
    (this.embers.material as ShaderMaterial).uniforms.scale.value = px;
    const t = this.time;
    const seen = new Set(list.map((s) => s.id));
    for (let i = 0; i < MAX; i++) if (this.slots[i] && !seen.has((this.slots[i] as Slot).id)) this.slots[i] = null;
    const sp = this.smoke.geometry.attributes.position.array as Float32Array;
    const st = this.smoke.geometry.attributes.tint.array as Float32Array;
    const ss = this.smoke.geometry.attributes.size.array as Float32Array;
    const ep = this.embers.geometry.attributes.position.array as Float32Array;
    const et = this.embers.geometry.attributes.tint.array as Float32Array;
    const es = this.embers.geometry.attributes.size.array as Float32Array;
    st.fill(0);
    et.fill(0);
    // (smoke is near black; a touch lighter by day, or it reads as holes)
    const shade = 0.03 + 0.08 * (1 - night);
    for (const s of list) {
      let k = this.slots.findIndex((x) => x?.id === s.id);
      if (k < 0) {
        k = this.slots.indexOf(null);
        if (k < 0) continue;
        this.slots[k] = { id: s.id, seed: Math.random() * 1000, seen: t };
      }
      const slot = this.slots[k] as Slot;
      // towards the eye a little, so the body doesn't swallow its own smoke
      const cx = cam.position.x - s.x;
      const cz = cam.position.z - s.y;
      const cd = Math.hypot(cx, cz) || 1;
      const ex = (cx / cd) * 0.22;
      const ez = (cz / cd) * 0.22;
      const emerging = s.state === "emerge" ? Math.min(1, s.t / 1.2) : 1;
      const going = s.state === "dissolve" ? Math.min(1, s.t / 1) : 0;
      for (let j = 0; j < PER; j++) {
        const i = k * PER + j;
        const life = 1.6 + h(i, 1) * 1.4;
        const age = ((t + h(i, 2) * life + slot.seed) % life) / life; // 0..1 through its rise
        const a0 = h(i, 3) * Math.PI * 2 + age * 1.3;
        // gathering in from wide as it emerges; blown out as it goes
        const spread = (0.28 + 0.22 * h(i, 4) + age * 0.35) * (1 + 3 * (1 - emerging)) * (1 + 4 * going);
        const up = age * (height + 0.5) * (0.6 + 0.4 * h(i, 5));
        sp[i * 3] = s.x + Math.cos(a0) * spread + ex;
        sp[i * 3 + 1] = s.z + 0.1 + up + going * 0.3;
        sp[i * 3 + 2] = s.y + Math.sin(a0) * spread + ez;
        // thinner as the shield goes; in and out over its rise
        const live = j / PER < s.dark ? 1 : 0;
        const fade = Math.sin(age * Math.PI) * live * (0.35 + 0.65 * emerging) * (1 - going);
        st[i * 4] = shade;
        st[i * 4 + 1] = shade;
        st[i * 4 + 2] = shade * 1.25;
        st[i * 4 + 3] = 0.55 * fade;
        ss[i] = 0.35 + 0.45 * h(i, 6) + age * 0.4;
      }
      // embers: where a beam burns it (off the lit side), and a burst of light when killed
      const burning = s.burn && s.dark > 0 ? 1 : 0;
      const burst = s.state === "dissolve" && s.t < 0.6 ? 1 - s.t / 0.6 : 0;
      const lx = s.burn ? s.burn.x - s.x : 0;
      const lz = s.burn ? s.burn.y - s.y : 0;
      const ld = Math.hypot(lx, lz) || 1;
      for (let j = 0; j < EMBERS; j++) {
        const i = k * EMBERS + j;
        const life = 0.5 + h(i, 7) * 0.6;
        const age = ((t + h(i, 8) * life) % life) / life;
        const side = burning ? 0.3 : 0;
        const a0 = h(i, 9) * Math.PI * 2;
        const r = burst ? 0.3 + 2.2 * (1 - burst) * h(i, 10) : 0.2 + 0.25 * h(i, 10);
        ep[i * 3] = s.x + (lx / ld) * side + Math.cos(a0) * r;
        ep[i * 3 + 1] = s.z + 0.3 + h(i, 11) * height + age * (burst ? 1.5 : 0.6);
        ep[i * 3 + 2] = s.y + (lz / ld) * side + Math.sin(a0) * r;
        const on = Math.max(burning, burst) * Math.sin(age * Math.PI);
        et[i * 4] = 1;
        et[i * 4 + 1] = burst ? 0.95 : 0.55 + 0.3 * h(i, 12);
        et[i * 4 + 2] = burst ? 0.8 : 0.2;
        et[i * 4 + 3] = on;
        es[i] = burst ? 0.12 : 0.03 + 0.03 * h(i, 13);
      }
    }
    for (const g of [this.smoke.geometry, this.embers.geometry]) {
      g.attributes.position.needsUpdate = true;
      g.attributes.tint.needsUpdate = true;
      g.attributes.size.needsUpdate = true;
    }
  }
}
