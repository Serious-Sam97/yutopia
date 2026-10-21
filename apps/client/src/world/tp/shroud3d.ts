import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  type Camera,
  CanvasTexture,
  Color,
  Mesh,
  NormalBlending,
  PlaneGeometry,
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
// Shot down (killed: SHADE.dying long), its death: a white-hot flash through
// it and a ring of light rolling out over the snow; a burst of sparks; then,
// as it goes down and burns away (tp/person3d.ts), the shroud torn off it
// upwards in a column and embers peeling off it, cooling as they rise.

const PER = 56; // puffs a shadowed
const EMBERS = 48;
const BEAM_EMBERS = 24; // (a beam's burn uses these; a death all of them)
const MAX = 40;
const RINGS = 4; // deaths at once with their ring of light
const RING_R = 4.5; // tiles, as far as it rolls

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
  /** how tall it is now, if not the standing height (asleep, squatting: docs/plan/31-the-day.md) */
  h?: number;
  /** 0..1: coming into range, going out of it (world/dark/shades.ts) */
  fade?: number;
  /** shot down: its dissolve is its death */
  killed?: boolean;
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

const smooth = (x: number, a: number, b: number) => {
  const k = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return k * k * (3 - 2 * k);
};
const SPARK = [new Color(1, 0.97, 0.88), new Color(1, 0.74, 0.34), new Color(0.95, 0.28, 0.08)];
const sparkTint = new Color();
// white → gold → red over 0..1 of a spark's life
function cooling(k: number): Color {
  return k < 0.5
    ? sparkTint.copy(SPARK[0]).lerp(SPARK[1], k * 2)
    : sparkTint.copy(SPARK[1]).lerp(SPARK[2], (k - 0.5) * 2);
}

// a death's ring of light on the snow: a flat square, the ring drawn in it (r 0..1 of RING_R)
function ring(): Mesh {
  const m = new Mesh(
    new PlaneGeometry(RING_R * 2, RING_R * 2),
    new ShaderMaterial({
      uniforms: { r: { value: 0 }, a: { value: 0 }, col: { value: new Color(1, 0.86, 0.6) } },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: `
        uniform float r;
        uniform float a;
        uniform vec3 col;
        varying vec2 vUv;
        void main() {
          float d = length(vUv * 2.0 - 1.0);
          float w = 0.03 + 0.07 * r;
          float edge = smoothstep(r - w, r, d) * (1.0 - smoothstep(r, r + 0.015, d));
          float pool = (1.0 - smoothstep(0.0, max(r, 0.01), d)) * 0.12 * (1.0 - r);
          float k = (edge + pool) * a;
          if (k < 0.004) discard;
          gl_FragColor = vec4(col * k, k);
        }`,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
    }),
  );
  m.rotation.x = -Math.PI / 2;
  m.renderOrder = 6;
  m.frustumCulled = false;
  m.visible = false;
  return m;
}

export class Shroud3 {
  private tex = soft();
  readonly smoke = cloud(MAX * PER, false, this.tex);
  readonly embers = cloud(MAX * EMBERS, true, this.tex);
  private slots: (Slot | null)[] = Array.from({ length: MAX }, () => null);
  private rings = Array.from({ length: RINGS }, ring);
  private time = 0;

  constructor(scene: Scene) {
    scene.add(this.smoke, this.embers, ...this.rings);
  }

  dispose(): void {
    this.smoke.removeFromParent();
    this.embers.removeFromParent();
    for (const r of this.rings) {
      r.removeFromParent();
      r.geometry.dispose();
      (r.material as ShaderMaterial).dispose();
    }
    this.smoke.geometry.dispose();
    this.embers.geometry.dispose();
    (this.smoke.material as ShaderMaterial).dispose();
    (this.embers.material as ShaderMaterial).dispose();
    this.tex.dispose();
  }

  /** Every frame: the shadowed in view (their feet, their shroud), the camera, the night (0..1). */
  update(list: ShroudIn[], cam: Camera, dt: number, night: number, tall: number, px: number): void {
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
    let rung = 0;
    for (const s of list) {
      const height = s.h ?? tall;
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
      const dying = s.killed && s.state === "dissolve" ? s.t : -1;
      const going = s.state === "dissolve" && dying < 0 ? Math.min(1, s.t / 1) : 0;
      const there = s.fade ?? 1;
      // dying: the body going down (tp/person3d.ts deathPose), the shroud gasping in at the shot
      const sunk = dying >= 0 ? 1 - 0.55 * smooth(dying, 0.4, 1.6) : 1;
      const gasp = dying >= 0 ? 1 - 0.45 * Math.sin(Math.PI * Math.min(1, dying / 0.16)) : 1;
      for (let j = 0; j < PER; j++) {
        const i = k * PER + j;
        const life = 1.6 + h(i, 1) * 1.4;
        const age = ((t + h(i, 2) * life + slot.seed) % life) / life; // 0..1 through its rise
        const a0 = h(i, 3) * Math.PI * 2 + age * 1.3;
        // gathering in from wide as it emerges; blown out as it goes
        const spread =
          (0.28 + 0.22 * h(i, 4) + age * 0.35) *
          (1 + 3 * (1 - emerging)) *
          (1 + 4 * going) *
          (1 + 1.5 * (1 - there)) *
          gasp;
        const up = age * (height * sunk + 0.5) * (0.6 + 0.4 * h(i, 5));
        // thinner as the shield goes; in and out over its rise
        const live = j / PER < s.dark || dying >= 0 ? 1 : 0;
        let fade = Math.sin(age * Math.PI) * live * (0.35 + 0.65 * emerging) * (1 - going) * there;
        let x = s.x + Math.cos(a0) * spread + ex;
        let y = s.z + 0.1 + up + going * 0.3;
        let z = s.y + Math.sin(a0) * spread + ez;
        let size = 0.35 + 0.45 * h(i, 6) + age * 0.4;
        let grey = shade;
        if (dying >= 0) {
          // torn off it, one puff after another, up in a column, curling, greying as it burns
          const off = 0.12 + h(i, 14) * 1.3;
          const u = dying - off;
          if (u > 0) {
            const turn = a0 + u * (1.4 + h(i, 15));
            const r = spread * (0.8 + u * 0.3);
            x = s.x + Math.cos(turn) * r + ex;
            z = s.y + Math.sin(turn) * r + ez;
            y += u * (1.3 + 1.2 * h(i, 16)) - u * u * 0.12;
            size *= 1 + u * 0.35;
            fade = (0.6 + 0.25 * Math.sin(age * Math.PI)) * Math.max(0, 1 - u / (0.8 + 0.5 * h(i, 17)));
          }
          grey = shade + 0.08 * smooth(dying, 0.5, 1.5);
          fade *= there;
        }
        sp[i * 3] = x;
        sp[i * 3 + 1] = y;
        sp[i * 3 + 2] = z;
        st[i * 4] = grey;
        st[i * 4 + 1] = grey;
        st[i * 4 + 2] = grey * 1.25;
        st[i * 4 + 3] = 0.55 * fade;
        ss[i] = size;
      }
      // its death's light: the flash, sparks, embers off it; a ring of light over the snow
      if (dying >= 0) {
        this.death(k, s, dying, height, sunk, there, ep, et, es);
        if (rung < RINGS && dying < 1.1) {
          const m = this.rings[rung++];
          const u = m.material as ShaderMaterial;
          m.visible = true;
          m.position.set(s.x, s.z + 0.06, s.y);
          u.uniforms.r.value = 0.04 + 0.96 * (1 - (1 - Math.min(1, dying / 0.9)) ** 3);
          u.uniforms.a.value = 0.75 * (1 - smooth(dying, 0.05, 1.05)) * there;
        }
        continue;
      }
      // embers: where a beam burns it (off the lit side), and a burst of light as it goes
      const burning = s.burn && s.dark > 0 ? 1 : 0;
      const burst = s.state === "dissolve" && s.t < 0.6 ? 1 - s.t / 0.6 : 0;
      const lx = s.burn ? s.burn.x - s.x : 0;
      const lz = s.burn ? s.burn.y - s.y : 0;
      const ld = Math.hypot(lx, lz) || 1;
      for (let j = 0; j < BEAM_EMBERS; j++) {
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
        et[i * 4 + 3] = on * there;
        es[i] = burst ? 0.12 : 0.03 + 0.03 * h(i, 13);
      }
    }
    for (let r = rung; r < RINGS; r++) this.rings[r].visible = false;
    for (const g of [this.smoke.geometry, this.embers.geometry]) {
      g.attributes.position.needsUpdate = true;
      g.attributes.tint.needsUpdate = true;
      g.attributes.size.needsUpdate = true;
    }
  }

  // a death's embers (all of a slot's): the white-hot core at the shot; a burst of sparks
  // thrown out and up; then embers peeling off the body as it burns, spiralling up, cooling
  private death(
    k: number,
    s: ShroudIn,
    t: number,
    height: number,
    sunk: number,
    there: number,
    ep: Float32Array,
    et: Float32Array,
    es: Float32Array,
  ) {
    const chest = s.z + height * 0.62 * sunk;
    for (let j = 0; j < EMBERS; j++) {
      const i = k * EMBERS + j;
      let x = s.x;
      let y = chest;
      let z = s.y;
      let a = 0;
      let size = 0.08;
      let c = SPARK[0];
      if (j < 4) {
        // the core: big and white, gone in a blink (a little apart, so it isn't one disc)
        const u = t / (0.18 + 0.06 * j);
        a = u < 1 ? 0.8 * (1 - u) ** 2 : 0;
        size = 0.55 - 0.08 * j + 0.35 * u;
        x += (h(i, 20) - 0.5) * 0.2;
        y += (h(i, 21) - 0.5) * 0.3;
        z += (h(i, 22) - 0.5) * 0.2;
      } else {
        // the burst (the first half, at once) and the embers off it (the rest, as it burns)
        const burst = j < 4 + (EMBERS - 4) / 2;
        const t0 = burst ? h(i, 23) * 0.08 : 0.45 + h(i, 23) * 1.2;
        const life = burst ? 0.7 + h(i, 24) * 0.7 : 0.9 + h(i, 24) * 0.8;
        const u = t - t0;
        if (u > 0 && u < life) {
          const q = u / life;
          const a0 = h(i, 25) * Math.PI * 2;
          if (burst) {
            // out fast, slowing, then drifting up
            const out = (1.2 + 2.2 * h(i, 26)) * (1 - Math.exp(-u * 4.5));
            x += Math.cos(a0) * out;
            z += Math.sin(a0) * out;
            y += (h(i, 27) - 0.3) * 1.2 * (1 - Math.exp(-u * 5)) + u * 0.6 - u * u * 0.5;
          } else {
            // off the body as it burns, spiralling up
            const from = s.z + h(i, 27) * height * sunk;
            const turn = a0 + u * (2.2 + 1.5 * h(i, 28));
            const r = 0.15 + 0.2 * h(i, 26) + u * 0.35;
            x += Math.cos(turn) * r;
            z += Math.sin(turn) * r;
            y = from + u * (0.9 + 0.8 * h(i, 29));
          }
          const twinkle = 0.75 + 0.25 * Math.sin(this.time * (17 + 9 * h(i, 30)) + j);
          a = Math.sin(Math.min(1, q * 6) * Math.PI * 0.5) * (1 - q) * twinkle;
          size = (burst ? 0.1 : 0.07) * (1 - 0.5 * q);
          c = cooling(q);
        }
      }
      ep[i * 3] = x;
      ep[i * 3 + 1] = y;
      ep[i * 3 + 2] = z;
      et[i * 4] = c.r;
      et[i * 4 + 1] = c.g;
      et[i * 4 + 2] = c.b;
      et[i * 4 + 3] = a * there;
      es[i] = size;
    }
  }
}
