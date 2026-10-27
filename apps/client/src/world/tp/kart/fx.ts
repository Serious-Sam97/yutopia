import {
  AdditiveBlending,
  CanvasTexture,
  Color,
  DynamicDrawUsage,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  Mesh,
  NormalBlending,
  PlaneGeometry,
  ShaderMaterial,
  SRGBColorSpace,
  type Texture,
} from "three";

// The karts' effects (docs/plan/46-the-karts.md, the quality pass): one particle system — a pool
// of camera-facing quads drawn in one call, each with its own place, velocity, size, colour and
// life; stretched along its velocity when it's a streak (a spark). Two looks: glowing (added
// light: sparks, flame, flashes) and soft (puffs: smoke, snow, dust). Every effect is a preset
// emitting into one or the other: the drift's sparks, the boost's flame, the exhaust's smoke, the
// snow thrown up, a wall's scrape, a blast, a smash's confetti, a snowball's trail.

let glowTex: Texture | null = null;
let puffTex: Texture | null = null;
let chipTex: Texture | null = null;
function tex(kind: "glow" | "puff" | "chip"): Texture {
  const make = (draw: (g: CanvasRenderingContext2D, n: number) => void) => {
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    draw(c.getContext("2d") as CanvasRenderingContext2D, 64);
    const t = new CanvasTexture(c);
    t.colorSpace = SRGBColorSpace;
    return t;
  };
  if (kind === "glow")
    glowTex ??= make((g, n) => {
      const r = g.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2);
      r.addColorStop(0, "rgba(255,255,255,1)");
      r.addColorStop(0.25, "rgba(255,255,255,0.75)");
      r.addColorStop(0.6, "rgba(255,255,255,0.18)");
      r.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = r;
      g.fillRect(0, 0, n, n);
    });
  if (kind === "puff")
    puffTex ??= make((g, n) => {
      // a soft lumpy cloud: a few overlapping soft discs
      for (const [x, y, r, a] of [
        [32, 34, 24, 0.55],
        [22, 30, 15, 0.4],
        [42, 28, 14, 0.4],
        [30, 22, 13, 0.35],
        [38, 40, 13, 0.35],
      ]) {
        const rg = g.createRadialGradient(x, y, 0, x, y, r);
        rg.addColorStop(0, `rgba(255,255,255,${a})`);
        rg.addColorStop(1, "rgba(255,255,255,0)");
        g.fillStyle = rg;
        g.fillRect(0, 0, n, n);
      }
    });
  if (kind === "chip")
    chipTex ??= make((g, n) => {
      g.fillStyle = "#ffffff";
      g.fillRect(n * 0.2, n * 0.3, n * 0.6, n * 0.4);
    });
  return (kind === "glow" ? glowTex : kind === "puff" ? puffTex : chipTex) as Texture;
}

export interface Emit {
  x: number;
  y: number;
  z: number;
  vx?: number;
  vy?: number;
  vz?: number;
  /** seconds */
  life: number;
  /** size at birth, at death (m) */
  size: number;
  size1?: number;
  /** colour at birth, at death; opacity at birth (fades to 0) */
  col: string | Color;
  col1?: string | Color;
  alpha?: number;
  /** slowing (1/s), gravity (m/s²; − rises) */
  drag?: number;
  grav?: number;
  /** a streak: drawn this many seconds of its velocity long */
  stretch?: number;
}

const VERT = /* glsl */ `
attribute vec3 iPos;
attribute vec3 iVel;
attribute vec4 iCol;
attribute vec2 iSize; // size, stretch (s)
varying vec2 vUv;
varying vec4 vCol;
void main() {
  vUv = uv;
  vCol = iCol;
  vec4 c = modelViewMatrix * vec4(iPos, 1.0);
  vec2 corner = position.xy;
  float size = iSize.x;
  if (iSize.y > 0.0) {
    // a streak: along its velocity as seen
    vec3 v = (modelViewMatrix * vec4(iVel, 0.0)).xyz;
    vec2 d = length(v.xy) > 1e-4 ? normalize(v.xy) : vec2(1.0, 0.0);
    vec2 n = vec2(-d.y, d.x);
    float len = size + length(v.xy) * iSize.y;
    c.xy += d * corner.x * len + n * corner.y * size;
  } else {
    c.xy += corner * size;
  }
  gl_Position = projectionMatrix * c;
}`;
const FRAG = /* glsl */ `
uniform sampler2D map;
varying vec2 vUv;
varying vec4 vCol;
void main() {
  vec4 t = texture2D(map, vUv);
  gl_FragColor = vec4(vCol.rgb * t.rgb, vCol.a * t.a);
  if (gl_FragColor.a < 0.004) discard;
  #include <colorspace_fragment>
}`;

interface P {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  age: number;
  life: number;
  s0: number;
  s1: number;
  c0: Color;
  c1: Color;
  a: number;
  drag: number;
  grav: number;
  stretch: number;
}

export class Particles {
  readonly mesh: Mesh;
  private ps: P[] = [];
  private pos: InstancedBufferAttribute;
  private vel: InstancedBufferAttribute;
  private col: InstancedBufferAttribute;
  private size: InstancedBufferAttribute;
  private geo: InstancedBufferGeometry;
  private c = new Color();

  constructor(
    private max: number,
    look: "glow" | "puff" | "chip",
  ) {
    const base = new PlaneGeometry(1, 1);
    const geo = new InstancedBufferGeometry();
    geo.index = base.index;
    geo.setAttribute("position", base.attributes.position);
    geo.setAttribute("uv", base.attributes.uv);
    const mk = (n: number) => {
      const a = new InstancedBufferAttribute(new Float32Array(max * n), n);
      a.setUsage(DynamicDrawUsage);
      return a;
    };
    this.pos = mk(3);
    this.vel = mk(3);
    this.col = mk(4);
    this.size = mk(2);
    geo.setAttribute("iPos", this.pos);
    geo.setAttribute("iVel", this.vel);
    geo.setAttribute("iCol", this.col);
    geo.setAttribute("iSize", this.size);
    geo.instanceCount = 0;
    this.geo = geo;
    const glow = look === "glow";
    this.mesh = new Mesh(
      geo,
      new ShaderMaterial({
        uniforms: { map: { value: tex(look) } },
        vertexShader: VERT,
        fragmentShader: FRAG,
        transparent: true,
        depthWrite: false,
        blending: glow ? AdditiveBlending : NormalBlending,
        toneMapped: !glow,
      }),
    );
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = glow ? 3 : 2;
  }

  get live(): number {
    return this.ps.length;
  }

  emit(e: Emit) {
    if (this.ps.length >= this.max) this.ps.shift();
    this.ps.push({
      x: e.x,
      y: e.y,
      z: e.z,
      vx: e.vx ?? 0,
      vy: e.vy ?? 0,
      vz: e.vz ?? 0,
      age: 0,
      life: e.life,
      s0: e.size,
      s1: e.size1 ?? e.size,
      c0: new Color(e.col),
      c1: new Color(e.col1 ?? e.col),
      a: e.alpha ?? 1,
      drag: e.drag ?? 0,
      grav: e.grav ?? 0,
      stretch: e.stretch ?? 0,
    });
  }

  update(dt: number) {
    const keep: P[] = [];
    for (const p of this.ps) {
      p.age += dt;
      if (p.age >= p.life) continue;
      const k = Math.exp(-p.drag * dt);
      p.vx *= k;
      p.vy = p.vy * k - p.grav * dt;
      p.vz *= k;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      keep.push(p);
    }
    this.ps = keep;
    const n = keep.length;
    for (let i = 0; i < n; i++) {
      const p = keep[i];
      const u = p.age / p.life;
      this.pos.setXYZ(i, p.x, p.y, p.z);
      this.vel.setXYZ(i, p.vx, p.vy, p.vz);
      this.c.copy(p.c0).lerp(p.c1, u);
      // (fades in fast, out over its last half)
      const a = p.a * Math.min(1, u * 12) * (u < 0.5 ? 1 : 1 - (u - 0.5) * 2);
      this.col.setXYZW(i, this.c.r, this.c.g, this.c.b, a);
      this.size.setXY(i, p.s0 + (p.s1 - p.s0) * u, p.stretch);
    }
    this.geo.instanceCount = n;
    for (const a of [this.pos, this.vel, this.col, this.size]) {
      a.needsUpdate = true;
      a.clearUpdateRanges();
      a.addUpdateRange(0, n * a.itemSize);
    }
  }

  clear() {
    this.ps = [];
    this.geo.instanceCount = 0;
  }
  dispose() {
    this.geo.dispose();
    (this.mesh.material as ShaderMaterial).dispose();
  }
}

/** Both looks, for one place (a scene, the game's karts' root). */
export class KartFx {
  readonly glow = new Particles(1400, "glow");
  readonly puff = new Particles(700, "puff");
  readonly chip = new Particles(500, "chip");
  constructor(parent: { add(...o: Mesh[]): unknown }) {
    parent.add(this.puff.mesh, this.chip.mesh, this.glow.mesh);
  }
  update(dt: number) {
    this.glow.update(dt);
    this.puff.update(dt);
    this.chip.update(dt);
  }
  dispose() {
    this.glow.dispose();
    this.puff.dispose();
    this.chip.dispose();
  }

  // ── the presets ──
  /** A drift's sparks off a rear tyre (`back`: the kart's backwards, unit), by tier. */
  sparks(x: number, y: number, z: number, bx: number, bz: number, tier: number, n = 2) {
    const col = ["#c8ced4", "#4fb0ff", "#ff9a1f", "#a64dff"][tier] ?? "#a64dff";
    // (a hot core of the tier's colour, cooling to it: white-hot reads as no tier at all)
    const hot = ["#ffffff", "#bfe4ff", "#ffe0a0", "#e2c2ff"][tier] ?? "#e2c2ff";
    for (let i = 0; i < n; i++) {
      const sp = 3 + Math.random() * 5;
      const sx = (Math.random() - 0.5) * 3;
      const sz = (Math.random() - 0.5) * 3;
      this.glow.emit({
        x,
        y,
        z,
        vx: bx * sp + sx,
        vy: 1.5 + Math.random() * 3,
        vz: bz * sp + sz,
        life: 0.18 + Math.random() * 0.22,
        size: 0.035,
        col: hot,
        col1: col,
        grav: 14,
        drag: 2,
        stretch: 0.045,
      });
    }
    // its glow where they come off the tyre
    this.glow.emit({ x, y: y + 0.05, z, life: 0.08, size: 0.35 + tier * 0.08, col, alpha: 0.55 });
  }
  /** A tier reached: a ring of light flicking out round the kart. */
  tierPop(x: number, y: number, z: number, tier: number) {
    const col = ["#ffffff", "#7fc4ff", "#ffb040", "#c77dff"][tier] ?? "#ffffff";
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2;
      this.glow.emit({
        x,
        y: y + 0.3,
        z,
        vx: Math.cos(a) * 5,
        vy: 0.6,
        vz: Math.sin(a) * 5,
        life: 0.3,
        size: 0.09,
        col,
        drag: 5,
        stretch: 0.04,
      });
    }
    this.glow.emit({ x, y: y + 0.3, z, life: 0.18, size: 1.4, col, alpha: 0.6 });
  }
  /** A turbo going off: a burst of flame back from the exhaust, a flash. */
  turbo(x: number, y: number, z: number, bx: number, bz: number, tier: number) {
    for (let i = 0; i < 10 + tier * 6; i++) this.flame(x, y, z, bx, bz, 1.4, 1);
    this.glow.emit({ x, y, z, life: 0.15, size: 1.0 + tier * 0.3, col: "#ffd27a", alpha: 0.8 });
  }
  /** The exhaust's flame on a boost (`k` how hard), a few licks a frame. */
  flame(x: number, y: number, z: number, bx: number, bz: number, k = 1, n = 3) {
    for (let i = 0; i < n; i++) {
      const sp = (4 + Math.random() * 4) * k;
      this.glow.emit({
        x: x + (Math.random() - 0.5) * 0.05,
        y: y + (Math.random() - 0.5) * 0.05,
        z: z + (Math.random() - 0.5) * 0.05,
        vx: bx * sp + (Math.random() - 0.5) * 0.8,
        vy: 0.4 + Math.random() * 0.6,
        vz: bz * sp + (Math.random() - 0.5) * 0.8,
        life: 0.12 + Math.random() * 0.12,
        size: 0.13 * k,
        size1: 0.04,
        col: "#fff3c4",
        col1: "#ff4a12",
        drag: 6,
      });
    }
  }
  /** A puff of the two-stroke's smoke at the exhaust (blue-grey, rising, spreading). */
  smoke(x: number, y: number, z: number, bx: number, bz: number, k = 1) {
    this.puff.emit({
      x,
      y,
      z,
      vx: bx * 1.2 + (Math.random() - 0.5) * 0.4,
      vy: 0.5,
      vz: bz * 1.2 + (Math.random() - 0.5) * 0.4,
      life: 0.9 + Math.random() * 0.5,
      size: 0.15,
      size1: 0.7 * k,
      col: "#c9ced6",
      alpha: 0.32 * k,
      drag: 1.5,
      grav: -0.3,
    });
  }
  /** Snow (or the road's grit) thrown up by a tyre: a puff and a few flakes. */
  spray(x: number, y: number, z: number, bx: number, bz: number, k = 1, col = "#f4f7fa") {
    this.puff.emit({
      x,
      y: y + 0.05,
      z,
      vx: bx * 2.5 * k + (Math.random() - 0.5),
      vy: 0.8 + Math.random() * 1.2,
      vz: bz * 2.5 * k + (Math.random() - 0.5),
      life: 0.5 + Math.random() * 0.4,
      size: 0.2,
      size1: 0.8 * k,
      col,
      alpha: 0.55,
      drag: 2.5,
      grav: 1.5,
    });
    if (Math.random() < 0.6)
      this.chip.emit({
        x,
        y: y + 0.08,
        z,
        vx: bx * 3 * k + (Math.random() - 0.5) * 2,
        vy: 1.5 + Math.random() * 2,
        vz: bz * 3 * k + (Math.random() - 0.5) * 2,
        life: 0.45,
        size: 0.045,
        col,
        grav: 9,
        drag: 0.5,
      });
  }
  /** Landing: a ring of snow-dust round it. */
  land(x: number, y: number, z: number, k = 1) {
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      this.puff.emit({
        x: x + Math.cos(a) * 0.6,
        y: y + 0.08,
        z: z + Math.sin(a) * 0.6,
        vx: Math.cos(a) * 2.5 * k,
        vy: 0.4,
        vz: Math.sin(a) * 2.5 * k,
        life: 0.6,
        size: 0.3,
        size1: 0.9,
        col: "#f2f5f8",
        alpha: 0.6,
        drag: 3,
      });
    }
  }
  /** Scraping a wall (the banks, the bridge's parapet): sparks along it, a little snow. */
  scrape(x: number, y: number, z: number, nx: number, nz: number, hard: number) {
    const n = Math.min(14, 3 + Math.round(hard));
    for (let i = 0; i < n; i++)
      this.glow.emit({
        x,
        y: y + 0.2,
        z,
        vx: nx * 3 + (Math.random() - 0.5) * 6,
        vy: 1 + Math.random() * 3,
        vz: nz * 3 + (Math.random() - 0.5) * 6,
        life: 0.25,
        size: 0.03,
        col: "#ffffff",
        col1: "#ffa040",
        grav: 12,
        stretch: 0.04,
      });
    for (let i = 0; i < 3; i++) this.spray(x, y, z, nx, nz, 0.8);
  }
  /** A blast (the fax bomb, a smash): a flash, a fireball's licks, smoke and snow, debris. */
  blast(x: number, y: number, z: number, r = 3) {
    this.glow.emit({ x, y: y + 0.6, z, life: 0.22, size: r * 2.2, col: "#fff6d8", alpha: 0.9 });
    for (let i = 0; i < 40; i++) {
      const a = Math.random() * Math.PI * 2;
      const up = Math.random();
      const sp = (3 + Math.random() * 6) * (r / 3);
      this.glow.emit({
        x,
        y: y + 0.4,
        z,
        vx: Math.cos(a) * sp * (1 - up * 0.5),
        vy: up * sp,
        vz: Math.sin(a) * sp * (1 - up * 0.5),
        life: 0.35 + Math.random() * 0.3,
        size: 0.5,
        size1: 0.15,
        col: "#ffe08a",
        col1: "#ff3a10",
        drag: 4,
      });
    }
    for (let i = 0; i < 18; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 1 + Math.random() * 3;
      this.puff.emit({
        x: x + Math.cos(a) * 0.5,
        y: y + 0.4 + Math.random(),
        z: z + Math.sin(a) * 0.5,
        vx: Math.cos(a) * sp,
        vy: 1 + Math.random() * 2,
        vz: Math.sin(a) * sp,
        life: 1.2 + Math.random() * 0.8,
        size: 0.6,
        size1: 2.2 * (r / 3),
        col: i % 3 ? "#f2f5f8" : "#6d6a68",
        alpha: 0.6,
        drag: 1.8,
        grav: -0.4,
      });
    }
    for (let i = 0; i < 24; i++)
      this.chip.emit({
        x,
        y: y + 0.5,
        z,
        vx: (Math.random() - 0.5) * 12,
        vy: 3 + Math.random() * 6,
        vz: (Math.random() - 0.5) * 12,
        life: 1.1,
        size: 0.07,
        col: "#f4f7fa",
        grav: 12,
        drag: 0.6,
      });
  }
  /** A smash: the blast, and confetti in the house's colours and the kart's. */
  confetti(x: number, y: number, z: number, colour: string) {
    const cols = ["#b5562f", "#e8a33d", "#f3ead6", "#2f4a3b", colour];
    for (let i = 0; i < 90; i++)
      this.chip.emit({
        x,
        y: y + 1,
        z,
        vx: (Math.random() - 0.5) * 8,
        vy: 4 + Math.random() * 6,
        vz: (Math.random() - 0.5) * 8,
        life: 1.6 + Math.random() * 0.8,
        size: 0.09,
        col: cols[i % cols.length],
        grav: 5,
        drag: 1.6,
      });
  }
  /** A snowball's trail: little flakes shed behind it. */
  trail(x: number, y: number, z: number) {
    this.puff.emit({
      x: x + (Math.random() - 0.5) * 0.15,
      y: y + (Math.random() - 0.5) * 0.15,
      z: z + (Math.random() - 0.5) * 0.15,
      life: 0.35,
      size: 0.18,
      size1: 0.05,
      col: "#ffffff",
      alpha: 0.7,
      grav: 2,
    });
  }
  /** A snowball's splat, a staple's ping. */
  splat(x: number, y: number, z: number) {
    for (let i = 0; i < 10; i++)
      this.chip.emit({
        x,
        y,
        z,
        vx: (Math.random() - 0.5) * 6,
        vy: 1 + Math.random() * 3,
        vz: (Math.random() - 0.5) * 6,
        life: 0.5,
        size: 0.06,
        col: "#ffffff",
        grav: 10,
      });
    this.puff.emit({ x, y, z, life: 0.45, size: 0.3, size1: 1.1, col: "#ffffff", alpha: 0.7, drag: 2 });
  }
  /** Something picked up (a crate): its shards, a twinkle. */
  shatter(x: number, y: number, z: number) {
    for (let i = 0; i < 16; i++)
      this.chip.emit({
        x,
        y,
        z,
        vx: (Math.random() - 0.5) * 6,
        vy: 1 + Math.random() * 4,
        vz: (Math.random() - 0.5) * 6,
        life: 0.6,
        size: 0.09,
        col: i % 2 ? "#e8a33d" : "#2a2018",
        grav: 10,
      });
    for (let i = 0; i < 8; i++)
      this.glow.emit({
        x: x + (Math.random() - 0.5),
        y: y + Math.random() * 0.6,
        z: z + (Math.random() - 0.5),
        vy: 1,
        life: 0.4,
        size: 0.25,
        size1: 0.02,
        col: "#ffe08a",
      });
  }
  /** Slipstreaming: wind lines streaming past either side. */
  wind(x: number, y: number, z: number, fx: number, fz: number) {
    const side = Math.random() < 0.5 ? 1 : -1;
    this.glow.emit({
      x: x + fx * 2 - fz * side * (0.7 + Math.random() * 0.4),
      y: y + 0.3 + Math.random() * 0.6,
      z: z + fz * 2 + fx * side * (0.7 + Math.random() * 0.4),
      vx: -fx * 18,
      vz: -fz * 18,
      life: 0.18,
      size: 0.02,
      col: "#dfe9f2",
      alpha: 0.5,
      stretch: 0.08,
    });
  }
}
