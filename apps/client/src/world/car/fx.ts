import { lotLayout } from "@yutopia/shared";
import { GRIP, type Ground, type Ruts } from "@yutopia/shared/car";
import type * as GroundsModule from "@yutopia/shared/grounds";
import { patchAt } from "@yutopia/shared/grounds";
import {
  AdditiveBlending,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  DoubleSide,
  DynamicDrawUsage,
  Float32BufferAttribute,
  type Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  type MeshLambertMaterial,
  MeshStandardMaterial,
  MultiplyBlending,
  NormalBlending,
  Object3D,
  PerspectiveCamera,
  PlaneGeometry,
  PointLight,
  Points,
  PointsMaterial,
  Quaternion,
  type Scene,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  type Texture,
  Vector3,
  type WebGLRenderer,
  WebGLRenderTarget,
} from "three";
import { litMaterial } from "../look/lit";
import type { Sedan } from "../tp/car/model";
import { windscreenRain, windscreenSnow } from "../tp/car/screen-tex";
import { patchGrounds } from "../tp/light3d";
import { baySnow } from "../tp/lot3d";
import { wx, wxNow } from "../tp/wx3d";

// What the cars leave and throw (docs/plan/28-the-car.md, phase 5) and what
// their cabins show (phase 4): tyre tracks in the snow that fill back in over
// minutes, snow and slush thrown up by the wheels, the exhaust's breath, the
// roads' slush and black ice (shared car/world.ts patchAt) laid on the
// asphalt, snow on the windscreen and the wipers' fans, the street lamps
// sweeping over the cabin at night, the rear-view mirror's real view. All in
// the Grounds' coords (the building's), in the cars' group.

const trackCol: Partial<Record<Ground, number>> = {
  snow: 0x8a98ab,
  deep: 0x6f7f96,
  path: 0xb6c0cb,
  ice: 0x55687e,
  slush: 0x6e665c,
};
const SNOW_BACK = new Color(0xf1f4f7);

/** (plan 93 S6) A tyre's tread pressed in the snow: the blocks' chevrons across it, its two walls a shade darker
 *  (grey on white: × the track's colour). */
function treadTexture(): CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 32;
  c.height = 64;
  const g = c.getContext("2d") as CanvasRenderingContext2D;
  g.fillStyle = "#e6e6e6";
  g.fillRect(0, 0, 32, 64);
  // (the chevrons: a block a 8 px, pointing the way it rolled)
  g.strokeStyle = "#b4b4b4";
  g.lineWidth = 2.6;
  for (let y = -8; y < 72; y += 8) {
    g.beginPath();
    g.moveTo(3, y + 5);
    g.lineTo(16, y);
    g.lineTo(29, y + 5);
    g.stroke();
  }
  // (the walls: the snow pushed up each side, its shadow inside)
  const w = g.createLinearGradient(0, 0, 32, 0);
  w.addColorStop(0, "rgba(120,120,120,0.55)");
  w.addColorStop(0.14, "rgba(120,120,120,0)");
  w.addColorStop(0.86, "rgba(120,120,120,0)");
  w.addColorStop(1, "rgba(120,120,120,0.55)");
  g.fillStyle = w;
  g.fillRect(0, 0, 32, 64);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

/** Tyre tracks: a quad a wheel's step, laid along the land's slope; they fill back in as the snow falls (plan 93
 *  S6: over the hour when it isn't snowing, in a few minutes in a heavy fall — as the ruts do, `ruts`), the deep
 *  snow's pressed into ruts the next car follows. */
export class Tracks {
  readonly mesh: InstancedMesh;
  private fill: Float32Array;
  private base: Color[] = [];
  private n = 0;
  private last = new Map<string, { x: number; y: number; z: number }>();
  private pending = new Map<string, [number, number, number, number]>();
  private fadeAt = 0;
  private m4 = new Matrix4();
  private q = new Quaternion();
  private q2 = new Quaternion();
  private s = new Vector3();
  private p = new Vector3();
  private c = new Color();
  constructor(
    root: Group,
    private max = 5000,
    private ruts: Ruts | null = null,
  ) {
    const geo = new PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    const mat = new MeshBasicMaterial({
      color: 0xffffff,
      map: treadTexture(),
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
    });
    mat.polygonOffset = true;
    mat.polygonOffsetFactor = -3;
    this.mesh = new InstancedMesh(geo, mat, max);
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1;
    this.fill = new Float32Array(max);
    for (let i = 0; i < max; i++) this.base.push(new Color());
    root.add(this.mesh);
  }
  /** A wheel at (x, z) on `g` (`id`: which car's which wheel), `y` the ground. */
  mark(id: string, x: number, y: number, z: number, g: Ground, _now: number, sliding: boolean) {
    const tr = GRIP[g].trace;
    const prev = this.last.get(id);
    if (tr === "none" || tr === "spray") {
      this.last.delete(id);
      return;
    }
    if (!prev) {
      this.last.set(id, { x, y, z });
      return;
    }
    const d = Math.hypot(x - prev.x, z - prev.z);
    if (d < 0.35) return;
    if (d > 3) {
      this.last.set(id, { x, y, z });
      return;
    }
    // (the rut a step behind the wheel that pressed it: not under the wheel itself — the next one's, the back
    // wheels', another car's)
    const was = this.pending.get(id);
    if (was) this.ruts?.lay(was[0], was[1], was[2], was[3]);
    if (tr === "ruts") this.pending.set(id, [prev.x, prev.z, x, z]);
    else this.pending.delete(id);
    const i = this.n % this.max;
    this.n++;
    const w = tr === "ruts" ? 0.24 : tr === "scratch" ? 0.18 : 0.2;
    this.p.set((x + prev.x) / 2, (y + prev.y) / 2 + 0.035, (z + prev.z) / 2);
    // (turned the way it went, tipped up or down the slope it climbed)
    this.q.setFromAxisAngle(UP, -Math.atan2(z - prev.z, x - prev.x) + Math.PI / 2);
    this.q2.setFromAxisAngle(ACROSS, -Math.atan2(y - prev.y, d));
    this.q.multiply(this.q2);
    this.s.set(w, 1, Math.hypot(d, y - prev.y) + 0.04);
    this.m4.compose(this.p, this.q, this.s);
    this.mesh.setMatrixAt(i, this.m4);
    this.base[i].setHex(trackCol[g] ?? 0x9aa6b6);
    if (sliding && g === "ice") this.base[i].multiplyScalar(0.85);
    this.fill[i] = 0;
    this.mesh.setColorAt(i, this.base[i]);
    this.mesh.count = Math.min(this.max, this.n);
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    this.last.set(id, { x, y, z });
  }
  /** (plan 94 G4) A rut someone pressed before I came: its mark drawn from (x0, y0, z0) to (x1, y1, z1) (not laid
   *  in the ruts: the caller's). */
  stamp(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, g: Ground) {
    const id = `stamp:${this.n}`;
    const r = this.ruts;
    this.ruts = null;
    this.mark(id, x0, y0, z0, g, 0, false);
    this.mark(id, x1, y1, z1, g, 0, false);
    this.ruts = r;
    this.last.delete(id);
    this.pending.delete(id);
  }
  /** The snow falling fills them back in (a second at a time). */
  fade(now: number, night: number) {
    if (now - this.fadeAt < 1) return;
    const dt = Math.min(5, now - this.fadeAt);
    this.fadeAt = now;
    // (in snow only: none on a green road — its snow the weather's, docs/plan/65)
    const lie = Math.min(1, Math.max(0, (wx.wxSnow.value - 0.15) / 0.35));
    (this.mesh.material as MeshBasicMaterial).opacity = 0.55 * lie;
    this.mesh.visible = lie > 0.01;
    // (an hour when nothing falls; five minutes in a heavy fall; gone as the snow goes)
    const by = dt * (1 / 3600 + Math.max(0, wxNow.snowing) / 300);
    this.ruts?.fill(lie < 0.01 ? 1 : by);
    const n = Math.min(this.max, this.n);
    const bg = SNOW_BACK.clone().multiplyScalar(1 - 0.75 * night);
    for (let i = 0; i < n; i++) {
      this.fill[i] = Math.min(1, this.fill[i] + by);
      const k = this.fill[i];
      this.c
        .copy(this.base[i])
        .multiplyScalar(1 - 0.6 * night)
        .lerp(bg, k);
      this.mesh.setColorAt(i, this.c);
    }
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
  dispose() {
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    const m = this.mesh.material as MeshBasicMaterial;
    m.map?.dispose();
    m.dispose();
  }
}
const UP = new Vector3(0, 1, 0);
const ACROSS = new Vector3(1, 0, 0);

/** Snow and slush thrown up by the wheels, the exhaust's breath: a few hundred grains, a few puffs. */
export class Spray {
  private pts: Points;
  private pos: Float32Array;
  private vel: Float32Array;
  private life: Float32Array;
  private i = 0;
  private puffs: { s: Sprite; v: Vector3; life: number; max: number }[] = [];
  private pi = 0;
  private mat: PointsMaterial;
  constructor(
    private root: Group,
    private max = 900,
  ) {
    const g = new BufferGeometry();
    this.pos = new Float32Array(max * 3).fill(-9999);
    this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    g.setAttribute("position", new BufferAttribute(this.pos, 3).setUsage(DynamicDrawUsage));
    this.mat = new PointsMaterial({
      size: 0.07,
      map: soft(),
      transparent: true,
      depthWrite: false,
      color: 0xf4f7fa,
      opacity: 0.9,
    });
    this.pts = new Points(g, this.mat);
    this.pts.frustumCulled = false;
    root.add(this.pts);
    for (let k = 0; k < 40; k++) {
      const s = new Sprite(new SpriteMaterial({ map: soft(), transparent: true, depthWrite: false, opacity: 0 }));
      s.visible = false;
      root.add(s);
      this.puffs.push({ s, v: new Vector3(), life: 0, max: 1 });
    }
  }
  /** Grains from a wheel at (x, y, z), flung back along (bx, bz) — how many by `k`. */
  throw(x: number, y: number, z: number, bx: number, bz: number, k: number, slush: boolean) {
    const n = Math.min(12, Math.floor(k * 10 + Math.random()));
    for (let j = 0; j < n; j++) {
      const i = this.i++ % this.max;
      this.pos[i * 3] = x + (Math.random() - 0.5) * 0.2;
      this.pos[i * 3 + 1] = y + 0.05;
      this.pos[i * 3 + 2] = z + (Math.random() - 0.5) * 0.2;
      const sp = 1.5 + Math.random() * 3.5 * k;
      const side = (Math.random() - 0.5) * 1.6;
      this.vel[i * 3] = bx * sp - bz * side;
      this.vel[i * 3 + 1] = 1.2 + Math.random() * 2.2 * k * (slush ? 0.6 : 1);
      this.vel[i * 3 + 2] = bz * sp + bx * side;
      this.life[i] = 0.6 + Math.random() * 0.7;
    }
    if (k > 0.5 && Math.random() < k * 0.3)
      this.puff(x, y + 0.2, z, bx * 1.5, 0.5, bz * 1.5, 0.6 + k, 1.0, slush ? 0x9a948a : 0xf2f5f8, 0.22);
  }
  /** A soft puff: the exhaust, powder off a wheel, snow off the roof. */
  puff(
    x: number,
    y: number,
    z: number,
    vx: number,
    vy: number,
    vz: number,
    size: number,
    life: number,
    col: number,
    op: number,
  ) {
    const p = this.puffs[this.pi++ % this.puffs.length];
    p.s.position.set(x, y, z);
    p.v.set(vx, vy, vz);
    p.life = 0;
    p.max = life;
    p.s.scale.setScalar(size * 0.4);
    const m = p.s.material as SpriteMaterial;
    m.color.setHex(col);
    m.opacity = op;
    m.userData.op = op;
    m.userData.size = size;
    p.s.visible = true;
  }
  step(dt: number, night: number) {
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        this.pos[i * 3 + 1] = -9999;
        continue;
      }
      this.vel[i * 3 + 1] -= 9.8 * dt;
      this.vel[i * 3] *= 1 - 1.2 * dt;
      this.vel[i * 3 + 2] *= 1 - 1.2 * dt;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
    }
    (this.pts.geometry.getAttribute("position") as BufferAttribute).needsUpdate = true;
    this.mat.color.setHex(0xf4f7fa).lerp(new Color(0x7d8aa0), night * 0.85);
    for (const p of this.puffs) {
      if (!p.s.visible) continue;
      p.life += dt;
      const k = p.life / p.max;
      if (k >= 1) {
        p.s.visible = false;
        continue;
      }
      p.s.position.addScaledVector(p.v, dt);
      p.v.multiplyScalar(1 - dt * 1.5);
      const m = p.s.material as SpriteMaterial;
      p.s.scale.setScalar((m.userData.size as number) * (0.4 + k * 1.6));
      m.opacity = (m.userData.op as number) * (1 - k) * (1 - k);
    }
  }
  dispose() {
    this.pts.removeFromParent();
    this.pts.geometry.dispose();
    this.mat.dispose();
    for (const p of this.puffs) {
      p.s.removeFromParent();
      (p.s.material as SpriteMaterial).dispose();
    }
    void this.root;
  }
}

/** The roads' slush and black ice, laid on the asphalt where shared patchAt says (rebuilt as it gets colder).
 *  Soft, lumpy blobs scattered over the patch (no grid). The slush darkens what's under it (multiplied:
 *  wet, and lit as the asphalt is — the floor's light map, the lamps' pools, the night); the ice is
 *  lit as the land is (light3d patchGrounds). Only while the snow lies, as the footing has them (shared
 *  roadFooting: none under 0.15 of it, black ice only freezing — docs/plan/65); the blobs made again as
 *  it gets colder, the two materials kept (made again, their shaders were freed and compiled anew: a
 *  60 ms frame each time a storm ended). */
export class RoadPatches {
  private mesh: Object3D | null = null;
  private slush: Mesh | null = null;
  private ice: Mesh | null = null;
  private cold = -1;
  private mats: { slush: MeshBasicMaterial; ice: MeshStandardMaterial } | null = null;
  constructor(
    private root: Group,
    private G: typeof GroundsModule,
  ) {}
  update(cold: number) {
    const u = this.G.underfoot();
    const lies = u.snow >= 0.15;
    // (built the first time there's snow to lie in them: none on a green day, nor its 100 ms at load)
    const band = cold > 0.6 ? 2 : cold > 0.35 ? 1 : 0;
    if (lies && band !== this.cold) {
      this.cold = band;
      this.build(band);
    }
    if (this.slush) this.slush.visible = lies;
    if (this.ice) this.ice.visible = lies && u.freezing;
  }
  private materials() {
    if (this.mats) return this.mats;
    // dst × mix(1, colour, alpha): darker where it lies, never brighter (premultiplied: three's MultiplyBlending)
    const slush = Object.assign(
      new MeshBasicMaterial({
        color: 0x8f8a84,
        map: slushTex(),
        transparent: true,
        premultipliedAlpha: true,
        blending: MultiplyBlending,
        depthWrite: false,
        toneMapped: false,
        polygonOffset: true,
        polygonOffsetFactor: -2,
      }),
      // (fogged to white: gone in it, never darker — fog3d.ts)
      { defines: { MF_WHITE: "" } },
    );
    const ice = new MeshStandardMaterial({
      color: 0x1b2128,
      roughness: 0.06,
      metalness: 0.3,
      alphaMap: slushTex(),
      transparent: true,
      opacity: 0.6,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
    });
    patchGrounds(ice);
    this.mats = { slush, ice };
    return this.mats;
  }
  private build(band: number) {
    this.clear();
    const slush: number[][] = [[], []];
    const ice: number[][] = [[], []];
    // a blob about (x, z): jittered, its size, shape and turn its own (the same every build)
    const blob = (out: number[][], x: number, z: number, s: number, a: number) => {
      const h = (k: number) => {
        const v = Math.sin(x * 127.1 + z * 311.7 + k * 74.7) * 43758.5453;
        return v - Math.floor(v);
      };
      x += (h(1) - 0.5) * 1.2;
      z += (h(2) - 0.5) * 1.2;
      a += h(3) * Math.PI * 2;
      const su = s * (0.8 + h(4) * 0.6);
      const sv = su * (0.55 + h(5) * 0.4);
      // (the land's own height where it's made; else worked out — asking for it made the land along all
      // of every road, the long road's 14 km too: ~7 s behind the loading screen, docs/plan/69)
      const y = (this.G.landReady(x, z) ? this.G.heightAt(x, z) : this.G.terrainAt(x, z)) + 0.025;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      const P = (u: number, v: number) => [x + ca * u * su - sa * v * sv, y, z + sa * u * su + ca * v * sv];
      // (one of the texture's four blobs, flipped or not)
      const q = Math.floor(h(6) * 4);
      const u0 = (q % 2) * 0.5;
      const v0 = Math.floor(q / 2) * 0.5;
      const f = h(7) < 0.5;
      const U = (u: number) => u0 + (f ? 1 - u : u) * 0.5;
      out[0].push(...P(-1, -1), ...P(1, 1), ...P(1, -1), ...P(-1, -1), ...P(-1, 1), ...P(1, 1));
      out[1].push(U(0), v0, U(1), v0 + 0.5, U(1), v0, U(0), v0, U(0), v0 + 0.5, U(1), v0 + 0.5);
    };
    const c = [0.4, 0.62, 0.85][band];
    for (const w of this.G.WAYS) {
      if (w.kind !== "driveway" && w.kind !== "road" && w.kind !== "street") continue;
      for (let i = 0; i < w.line.length - 1; i += 2) {
        const [x, z] = w.line[i];
        const [x2, z2] = w.line[i + 1];
        const a = Math.atan2(z2 - z, x2 - x);
        for (const off of [-w.w / 3, 0, w.w / 3]) {
          const px = x - Math.sin(a) * off;
          const pz = z + Math.cos(a) * off;
          const p = patchAt(px, pz, c);
          if (p === "slush") blob(slush, px, pz, 1.5, a);
          else if (p === "blackice") blob(ice, px, pz, 1.6, a);
        }
      }
    }
    // the lot's asphalt too
    const L = this.G.LOT;
    for (let x = L.x0 + 1; x < L.x1 - 1; x += 2)
      for (let z = L.z0 + 1; z < L.z1 - 1; z += 2) if (patchAt(x, z, c) === "slush") blob(slush, x, z, 1.5, 0);
    const g = new Object3D();
    const add = (pos: number[][], mat: MeshBasicMaterial | MeshStandardMaterial) => {
      if (!pos[0].length) return null;
      const geo = new BufferGeometry();
      geo.setAttribute("position", new Float32BufferAttribute(pos[0], 3));
      geo.setAttribute("uv", new Float32BufferAttribute(pos[1], 2));
      geo.computeVertexNormals();
      const m = new Mesh(geo, mat);
      m.receiveShadow = true;
      m.renderOrder = 1;
      g.add(m);
      return m;
    };
    const M = this.materials();
    this.slush = add(slush, M.slush);
    this.ice = add(ice, M.ice);
    this.mesh = g;
    this.root.add(g);
  }
  // the blobs gone (their materials kept)
  private clear() {
    if (!this.mesh) return;
    this.mesh.removeFromParent();
    this.mesh.traverse((m) => {
      if ((m as Mesh).isMesh) (m as Mesh).geometry.dispose();
    });
    this.mesh = this.slush = this.ice = null;
  }
  dispose() {
    this.clear();
    if (!this.mats) return;
    // (their picture's shared and cached: slushTex)
    this.mats.slush.dispose();
    this.mats.ice.dispose();
    this.mats = null;
  }
}

/** The windscreen's snow: three amounts, with and without the wipers' fans — each painted the
 *  first time it's wanted, one a frame (a few milliseconds each), kept. */
export class ScreenSnow {
  private tex = new Map<string, Texture>();
  amount = 0;
  constructor(private model: Sedan) {}
  private get(fans: boolean, k: number, rain = false): Texture | null {
    const key = `${rain ? "rain" : "snow"}|${fans}|${k}`;
    const hit = this.tex.get(key);
    if (hit) return hit;
    if (this.paintedAt === this.frame) return null; // (one a frame)
    this.paintedAt = this.frame;
    const s = this.model.screen;
    const w = fans
      ? this.model.wipers.map((x) => {
          // (its fan from its park to its sweep, the lower angle first)
          const f = x.fan ?? { park: x.park, sweep: x.sweep };
          return {
            z: x.pivot,
            arm: x.len,
            blade: x.blade,
            a0: Math.min(f.park, f.sweep),
            a1: Math.max(f.park, f.sweep),
          };
        })
      : [];
    const t = rain
      ? windscreenRain(s.hw0, s.len, [0.35, 0.7, 1][k], w, (fans ? 50 : 40) + k, 512)
      : windscreenSnow(s.hw0, s.len, [0.35, 0.7, 1][k], w, (fans ? 30 : 20) + k, 512);
    this.tex.set(key, t);
    return t;
  }
  private frame = 0;
  private paintedAt = -1;
  /** the rain on it (W7): beads, gathering as it rains, wiped to a few by the wipers, drying when it
   *  stops; shown while there's more of it than of snow */
  wet = 0;
  step(dt: number, snowing: number, speed: number, wipers: number, parked: boolean, raining = 0) {
    this.frame++;
    if (wipers > 0) this.wet += (raining * 0.3 - this.wet) * Math.min(1, dt * (0.8 + wipers));
    else if (raining > 0.01) this.wet = Math.min(1, this.wet + dt * raining * (0.03 + Math.min(speed, 25) * 0.002));
    else this.wet = Math.max(0, this.wet - dt / 240);
    if (wipers > 0) this.amount += (snowing * 0.25 - this.amount) * Math.min(1, dt * (0.6 + wipers));
    else
      this.amount = Math.min(
        1,
        this.amount + dt * snowing * (0.012 + Math.min(speed, 25) * 0.0015) * (parked ? 0.4 : 1),
      );
    // (one of them on it: whichever there's more of — the snow's eased fall is never quite 0)
    const rain = this.wet > this.amount;
    const on = rain ? this.wet : this.amount;
    if (on < 0.03) {
      this.model.setScreenSnow(null);
      return;
    }
    const k = on < 0.4 ? 0 : on < 0.75 ? 1 : 2;
    const t = this.get(wipers > 0, k, rain);
    if (t) this.model.setScreenSnow(t);
  }
  dispose() {
    for (const t of this.tex.values()) t.dispose();
    this.tex.clear();
    this.model.setScreenSnow(null);
  }
}

/** At night the street lamps sweep over the cabin as it passes under them (a light in the cabin, by how near one is). */
export class CabinLight {
  readonly light = new PointLight(0xffd9a0, 0, 2.6, 1.6);
  private lamps: { x: number; z: number }[];
  constructor(G: typeof GroundsModule) {
    this.lamps = [...G.LAMPS.map((l) => ({ x: l.x, z: l.z })), ...lotLayout().lamps];
  }
  /** (plan 98 phase 7: `dome` its own dome lamp, 0..1 — on while a door's open, fading after) */
  step(model: Sedan, night: number, dome = 0) {
    model.root.updateMatrixWorld();
    const p = model.root.position;
    let k = 0;
    if (night > 0.2)
      for (const l of this.lamps) {
        const d2 = (l.x - p.x) ** 2 + (l.z - p.z) ** 2;
        if (d2 < 100) k += Math.exp(-d2 / 16);
      }
    this.light.intensity = Math.max(Math.min(1.4, k) * night * 0.9, dome * (0.25 + 0.75 * night) * 1.1);
    if (this.light.parent !== model.body) model.body.add(this.light);
    this.light.position.set(0.1, 1.42, 0);
  }
  /** Out of the car: dark, kept in the scene (`home`) — a light leaving it recompiles every material. */
  park(home: Object3D) {
    this.light.intensity = 0;
    if (this.light.parent !== home) home.add(this.light);
    this.light.position.set(0, -500, 0);
  }
  dispose() {
    this.light.removeFromParent();
  }
}

/** The rear-view mirror: what's behind, rendered small and flipped, a few times a second. */
export class Mirror {
  private rt = new WebGLRenderTarget(384, 84);
  private cam = new PerspectiveCamera(22, 384 / 84, 0.1, 400);
  private mat: MeshBasicMaterial;
  private at = 0;
  private was: unknown = null;
  constructor(private model: Sedan) {
    this.rt.texture.repeat.x = -1;
    this.rt.texture.offset.x = 1;
    this.rt.texture.colorSpace = SRGBColorSpace;
    this.mat = new MeshBasicMaterial({ map: this.rt.texture, color: 0xc9ced4 });
  }
  render(renderer: WebGLRenderer, scene: Scene, now: number, fps: number) {
    if (fps <= 0 || now - this.at < 1 / fps) return;
    this.at = now;
    const m = this.model;
    if (m.rearView.material !== this.mat) {
      this.was = m.rearView.material;
      m.rearView.material = this.mat;
    }
    m.root.updateMatrixWorld(true);
    m.rearView.getWorldPosition(this.cam.position);
    const back = new Vector3(1, -0.03, 0).transformDirection(m.body.matrixWorld);
    this.cam.position.addScaledVector(back, 0.05);
    this.cam.lookAt(this.cam.position.clone().addScaledVector(back, 10));
    m.rearView.visible = false;
    const prev = renderer.getRenderTarget();
    renderer.setRenderTarget(this.rt);
    renderer.render(scene, this.cam);
    renderer.setRenderTarget(prev);
    m.rearView.visible = true;
  }
  dispose() {
    if (this.was) this.model.rearView.material = this.was as MeshBasicMaterial;
    this.rt.dispose();
    this.mat.dispose();
  }
}

let softTex: CanvasTexture | null = null;
function soft(): CanvasTexture {
  if (softTex) return softTex;
  const cv = document.createElement("canvas");
  cv.width = cv.height = 64;
  const g = cv.getContext("2d") as CanvasRenderingContext2D;
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, "rgba(255,255,255,1)");
  grd.addColorStop(0.5, "rgba(255,255,255,0.5)");
  grd.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  softTex = new CanvasTexture(cv);
  return softTex;
}

// four lumpy blobs, one a quarter, white with a soft alpha: a few discs, a ragged edge
let slushT: CanvasTexture | null = null;
function slushTex(): CanvasTexture {
  if (slushT) return slushT;
  const S = 256;
  const Q = S / 2;
  const cv = document.createElement("canvas");
  cv.width = cv.height = S;
  const g = cv.getContext("2d") as CanvasRenderingContext2D;
  let seed = 11;
  const r = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  for (let q = 0; q < 4; q++) {
    const ox = (q % 2) * Q;
    const oy = Math.floor(q / 2) * Q;
    g.save();
    g.beginPath();
    g.rect(ox, oy, Q, Q);
    g.clip();
    for (let i = 0; i < 9; i++) {
      // (towards the middle, smaller further out: nothing reaches the quarter's edge)
      const d = r() * 0.24 * Q;
      const t = r() * Math.PI * 2;
      const x = ox + Q / 2 + Math.cos(t) * d;
      const y = oy + Q / 2 + Math.sin(t) * d;
      const w = (0.16 + r() * 0.12) * Q;
      const grd = g.createRadialGradient(x, y, 0, x, y, w);
      grd.addColorStop(0, "rgba(255,255,255,0.42)");
      grd.addColorStop(0.55, "rgba(255,255,255,0.3)");
      grd.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = grd;
      g.beginPath();
      g.arc(x, y, w, 0, Math.PI * 2);
      g.fill();
    }
    // the ragged edge: flecks scattered round it
    for (let i = 0; i < 70; i++) {
      const d = (0.18 + r() * 0.2) * Q;
      const t = r() * Math.PI * 2;
      g.fillStyle = `rgba(255,255,255,${0.08 + r() * 0.18})`;
      g.beginPath();
      g.arc(ox + Q / 2 + Math.cos(t) * d, oy + Q / 2 + Math.sin(t) * d, 1.5 + r() * 4, 0, Math.PI * 2);
      g.fill();
    }
    g.restore();
  }
  slushT = new CanvasTexture(cv);
  return slushT;
}

/** The snow the plough left in the lot's empty bays (docs/plan/42-the-lot.md, tp/lot3d.ts): made
 *  again only when a car takes a bay or leaves one. */
export class BaySnow {
  readonly mesh: Mesh;
  private key = "";
  private lot = lotLayout();
  constructor() {
    const m = litMaterial({ vertexColors: true });
    patchGrounds(m);
    // (a geometry from the first: an empty one, no position, is a GL error every draw)
    this.mesh = new Mesh(baySnow(this.lot, []), m);
    this.mesh.receiveShadow = true;
  }
  /** `cars`: where the parked ones stand (the building's coords). */
  set(cars: { x: number; z: number }[]) {
    const key = this.lot.bays
      .map((b) => (cars.some((c) => Math.abs(c.x - b.x) < 1.6 && Math.abs(c.z - b.z) < 1.2) ? 1 : 0))
      .join("");
    if (key === this.key) return;
    this.key = key;
    this.mesh.geometry.dispose();
    this.mesh.geometry = baySnow(this.lot, cars);
  }
  dispose() {
    this.mesh.geometry.dispose();
    (this.mesh.material as MeshLambertMaterial).dispose();
  }
}

// ── docs/plan/92 phase 9: smoke, steam, sparks and what falls off ─────────────────────────────────────

/** Points of their own size and alpha (a PointsMaterial patched, so the world's fog and light still
 *  reach them): one draw for every puff. */
function sizedPoints(max: number, opts: { additive?: boolean; map: Texture; base: number }) {
  const g = new BufferGeometry();
  const pos = new Float32Array(max * 3).fill(-9999);
  const size = new Float32Array(max);
  const alpha = new Float32Array(max);
  const col = new Float32Array(max * 3).fill(1);
  g.setAttribute("position", new BufferAttribute(pos, 3).setUsage(DynamicDrawUsage));
  g.setAttribute("aSize", new BufferAttribute(size, 1).setUsage(DynamicDrawUsage));
  g.setAttribute("aAlpha", new BufferAttribute(alpha, 1).setUsage(DynamicDrawUsage));
  g.setAttribute("color", new BufferAttribute(col, 3).setUsage(DynamicDrawUsage));
  const mat = new PointsMaterial({
    size: opts.base,
    map: opts.map,
    transparent: true,
    depthWrite: false,
    vertexColors: true,
    sizeAttenuation: true,
    blending: opts.additive ? AdditiveBlending : NormalBlending,
    toneMapped: !opts.additive,
  });
  const key = opts.additive ? "car-sparks" : "car-smoke";
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace(
        "#include <common>",
        "#include <common>\nattribute float aSize; attribute float aAlpha; varying float vA;",
      )
      // (a puff right at the camera fades: a chase camera inside a burnout's cloud sees through it)
      .replace("gl_PointSize = size;", "gl_PointSize = size * aSize; vA = aAlpha;")
      .replace("#include <fog_vertex>", "#include <fog_vertex>\nvA *= smoothstep(0.8, 4.0, -mvPosition.z);");
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying float vA;")
      .replace("#include <alphatest_fragment>", "diffuseColor.a *= vA;\n#include <alphatest_fragment>");
  };
  mat.customProgramCacheKey = () => key;
  const pts = new Points(g, mat);
  pts.frustumCulled = false;
  pts.renderOrder = 3;
  return { pts, pos, size, alpha, col, g, mat };
}

/** Tyre smoke on the asphalt (burnouts, drifts), powder off a spinning wheel in the snow, the steam from
 *  a smashed front: soft, slow, many — one draw. */
export class Smoke {
  private p: ReturnType<typeof sizedPoints>;
  private vel: Float32Array;
  private life: Float32Array;
  private max: Float32Array;
  private grow: Float32Array;
  private op: Float32Array;
  private base: Float32Array;
  private i = 0;
  private live = 0;
  constructor(
    private root: Group,
    private n = 260,
  ) {
    this.p = sizedPoints(n, { map: soft(), base: 1 });
    this.base = new Float32Array(n);
    this.vel = new Float32Array(n * 3);
    this.life = new Float32Array(n);
    this.max = new Float32Array(n);
    this.grow = new Float32Array(n);
    this.op = new Float32Array(n);
    root.add(this.p.pts);
  }
  /** A puff at (x, y, z) drifting (vx, vy, vz): `size` m across at first, growing `grow` times over its
   *  `life` s; its colour, its opacity. */
  emit(
    x: number,
    y: number,
    z: number,
    vx: number,
    vy: number,
    vz: number,
    size: number,
    grow: number,
    life: number,
    col: number,
    op: number,
  ) {
    const i = this.i++ % this.n;
    const p = this.p;
    p.pos[i * 3] = x;
    p.pos[i * 3 + 1] = y;
    p.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx;
    this.vel[i * 3 + 1] = vy;
    this.vel[i * 3 + 2] = vz;
    this.life[i] = 0;
    this.max[i] = life;
    this.grow[i] = grow;
    this.op[i] = op;
    this.base[i] = size;
    p.size[i] = size;
    p.alpha[i] = 0;
    c0.setHex(col);
    p.col[i * 3] = c0.r;
    p.col[i * 3 + 1] = c0.g;
    p.col[i * 3 + 2] = c0.b;
    this.live = this.n;
  }
  step(dt: number, night: number) {
    if (!this.live) return;
    const p = this.p;
    let any = 0;
    for (let i = 0; i < this.n; i++) {
      if (this.max[i] <= 0) continue;
      this.life[i] += dt;
      const k = this.life[i] / this.max[i];
      if (k >= 1) {
        this.max[i] = 0;
        p.alpha[i] = 0;
        p.pos[i * 3 + 1] = -9999;
        continue;
      }
      any++;
      const d = 1 - Math.min(1, dt * 1.4);
      this.vel[i * 3] *= d;
      this.vel[i * 3 + 2] *= d;
      this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * d + 0.35 * dt; // (warm: it rises a little)
      p.pos[i * 3] += this.vel[i * 3] * dt;
      p.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      p.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      // (its size: as it grows; its alpha in fast, out slow)
      p.size[i] = this.base[i] * (1 + (this.grow[i] - 1) * k);
      p.alpha[i] = this.op[i] * Math.min(1, k * 8) * (1 - k) * (1 - k * 0.5);
    }
    this.live = any;
    this.p.mat.color.setScalar(1 - 0.72 * night);
    for (const a of ["position", "aSize", "aAlpha", "color"])
      (this.p.g.getAttribute(a) as BufferAttribute).needsUpdate = true;
  }
  dispose() {
    this.p.pts.removeFromParent();
    this.p.g.dispose();
    this.p.mat.dispose();
    void this.root;
  }
}

/** Sparks from metal scraping a wall, a post, the road (a car on its roof): bright, quick, falling. */
export class Sparks {
  private p: ReturnType<typeof sizedPoints>;
  private vel: Float32Array;
  private life: Float32Array;
  private i = 0;
  private live = 0;
  constructor(
    private root: Group,
    private n = 240,
  ) {
    this.p = sizedPoints(n, { map: spark(), base: 0.12, additive: true });
    this.vel = new Float32Array(n * 3);
    this.life = new Float32Array(n);
    root.add(this.p.pts);
  }
  /** `k` 0..1 of a scrape at (x, y, z), the car going (vx, vz): sparks flung back along it and out `nx, nz`. */
  burst(x: number, y: number, z: number, vx: number, vz: number, nx: number, nz: number, k: number) {
    const n = Math.min(16, Math.floor(k * 14 + Math.random() * 2));
    const p = this.p;
    for (let j = 0; j < n; j++) {
      const i = this.i++ % this.n;
      p.pos[i * 3] = x + (Math.random() - 0.5) * 0.3;
      p.pos[i * 3 + 1] = y + Math.random() * 0.15;
      p.pos[i * 3 + 2] = z + (Math.random() - 0.5) * 0.3;
      const out = 0.5 + Math.random() * 2.5;
      this.vel[i * 3] = vx * (0.3 + Math.random() * 0.5) + nx * out + (Math.random() - 0.5) * 2;
      this.vel[i * 3 + 1] = 0.5 + Math.random() * 2.8;
      this.vel[i * 3 + 2] = vz * (0.3 + Math.random() * 0.5) + nz * out + (Math.random() - 0.5) * 2;
      this.life[i] = 0.25 + Math.random() * 0.45;
      p.size[i] = 0.6 + Math.random() * 0.8;
      p.alpha[i] = 1;
      // (white-hot to orange)
      const h = Math.random();
      p.col[i * 3] = 1;
      p.col[i * 3 + 1] = 0.55 + 0.4 * h;
      p.col[i * 3 + 2] = 0.15 + 0.5 * h * h;
    }
    this.live = this.n;
  }
  step(dt: number) {
    if (!this.live) return;
    const p = this.p;
    let any = 0;
    for (let i = 0; i < this.n; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        p.alpha[i] = 0;
        p.pos[i * 3 + 1] = -9999;
        continue;
      }
      any++;
      this.vel[i * 3 + 1] -= 9.8 * dt;
      p.pos[i * 3] += this.vel[i * 3] * dt;
      p.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      p.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      p.alpha[i] = Math.min(1, this.life[i] * 4);
      p.col[i * 3 + 2] *= 1 - dt * 3; // (cooling: orange, then red)
      p.col[i * 3 + 1] *= 1 - dt * 1.2;
    }
    this.live = any;
    for (const a of ["position", "aAlpha", "color", "aSize"])
      (this.p.g.getAttribute(a) as BufferAttribute).needsUpdate = true;
  }
  dispose() {
    this.p.pts.removeFromParent();
    this.p.g.dispose();
    this.p.mat.dispose();
    void this.root;
  }
}

/** (plan 94 P1) Cars on fire — flames out of their engine bays (tongues of many small soft blobs, normal blending:
 *  no blown-out glow) — and their blasts (a fireball of hot puffs going to smoke at its edge and rising). Sprites
 *  from a pool; what isn't burning this frame put away. */
export class Fires {
  private tex: { a: Texture; b: Texture; hot: Texture; warm: Texture; smoke: Texture } | null = null;
  private burning = new Map<
    string,
    { s: Sprite[]; at: Vector3; off: [number, number, number][]; ph: number[]; seen: boolean; k: number }
  >();
  private balls: { s: Sprite; v: Vector3; t: number; life: number; k0: number; k1: number; smoke: boolean }[] = [];
  private spare: Sprite[] = [];
  private flashes: { x: number; y: number; z: number; t: number }[] = [];
  constructor(private root: Group) {}
  private textures() {
    if (this.tex) return this.tex;
    const flame = (core: string, mid: string) => {
      const cv = document.createElement("canvas");
      cv.width = 64;
      cv.height = 128;
      const g = cv.getContext("2d") as CanvasRenderingContext2D;
      g.globalCompositeOperation = "lighter";
      for (let i = 0; i < 90; i++) {
        const t = Math.random();
        const y = 124 - t * 116;
        const x = 32 + Math.sin(t * 7 + Math.random()) * 10 * t + (Math.random() - 0.5) * 18 * (1 - t * 0.6);
        const r = (1 - t) * 16 + 4;
        const gr = g.createRadialGradient(x, y, 0, x, y, r);
        gr.addColorStop(0, t < 0.35 ? core : mid);
        gr.addColorStop(1, "rgba(120,20,0,0)");
        g.globalAlpha = 0.18 + (1 - t) * 0.25;
        g.fillStyle = gr;
        g.fillRect(x - r, y - r, r * 2, r * 2);
      }
      const t = new CanvasTexture(cv);
      t.colorSpace = SRGBColorSpace;
      return t;
    };
    const cloud = (inner: string, outer: string) => {
      const cv = document.createElement("canvas");
      cv.width = cv.height = 128;
      const g = cv.getContext("2d") as CanvasRenderingContext2D;
      for (let i = 0; i < 40; i++) {
        const a = Math.random() * Math.PI * 2;
        const d = Math.random() * 34;
        const x = 64 + Math.cos(a) * d;
        const y = 64 + Math.sin(a) * d;
        const r = 14 + Math.random() * 22;
        const gr = g.createRadialGradient(x, y, 0, x, y, r);
        gr.addColorStop(0, inner);
        gr.addColorStop(0.6, outer);
        gr.addColorStop(1, "rgba(0,0,0,0)");
        g.globalAlpha = 0.35;
        g.fillStyle = gr;
        g.fillRect(x - r, y - r, r * 2, r * 2);
      }
      const t = new CanvasTexture(cv);
      t.colorSpace = SRGBColorSpace;
      return t;
    };
    this.tex = {
      a: flame("rgba(255,236,170,1)", "rgba(255,140,30,0.9)"),
      b: flame("rgba(255,200,90,0.95)", "rgba(230,80,10,0.8)"),
      hot: cloud("rgba(255,240,190,1)", "rgba(255,120,20,0.8)"),
      warm: cloud("rgba(255,150,40,1)", "rgba(140,40,10,0.8)"),
      smoke: cloud("rgba(60,52,46,1)", "rgba(25,22,20,0.8)"),
    };
    return this.tex;
  }
  private sprite(map: Texture): Sprite {
    const s = this.spare.pop() ?? new Sprite(new SpriteMaterial({ transparent: true, depthWrite: false }));
    const m = s.material as SpriteMaterial;
    m.map = map;
    m.opacity = 1;
    m.rotation = (Math.random() - 0.5) * 0.3;
    s.visible = true;
    s.renderOrder = 2;
    this.root.add(s);
    return s;
  }
  private putAway(s: Sprite) {
    s.visible = false;
    s.removeFromParent();
    if (this.spare.length < 200) this.spare.push(s);
    else (s.material as SpriteMaterial).dispose();
  }
  /** (plan 94 phase 9) A flame and a puff of the blast's, shown till `done` — for their shaders made before a car
   *  first burns (the first fire near was a 200–400 ms frame), and their textures drawn. */
  warm(): { objs: Sprite[]; done(): void } {
    const T = this.textures();
    const objs = [T.a, T.hot, T.smoke].map((t) => {
      const s = this.sprite(t);
      s.position.set(0, -500, 0);
      return s;
    });
    return { objs, done: () => objs.forEach((s) => this.putAway(s)) };
  }
  /** This frame: `id` burning, its engine bay's middle at (x, y, z) (the cars' coords), `k` how fiercely (0..1). */
  burn(id: string, x: number, y: number, z: number, k: number) {
    let b = this.burning.get(id);
    if (!b) {
      const T = this.textures();
      const s: Sprite[] = [];
      const off: [number, number, number][] = [];
      const ph: number[] = [];
      for (let i = 0; i < 16; i++) {
        s.push(this.sprite(i % 3 ? T.b : T.a));
        off.push([(Math.random() - 0.5) * 1.0, Math.random() * 0.2, (Math.random() - 0.5) * 1.0]);
        ph.push(Math.random());
      }
      b = { s, at: new Vector3(), off, ph, seen: true, k };
      this.burning.set(id, b);
    }
    b.at.set(x, y, z);
    b.k = k;
    b.seen = true;
  }
  /** A blast at (x, y, z) (the cars' coords): the fireball. */
  blast(x: number, y: number, z: number) {
    const T = this.textures();
    this.flashes.push({ x, y: y + 1.2, z, t: 0 });
    for (let i = 0; i < 46; i++) {
      const r = Math.random();
      const smoke = r > 0.62;
      const s = this.sprite(r < 0.28 ? T.hot : smoke ? T.smoke : T.warm);
      (s.material as SpriteMaterial).rotation = Math.random() * 6;
      s.renderOrder = smoke ? 1 : r < 0.28 ? 3 : 2;
      s.position.set(x, y + 0.3, z);
      const a = Math.random() * Math.PI * 2;
      const out = smoke ? 3 + Math.random() * 3 : 2 + Math.random() * 4;
      const up = smoke ? 2.5 + Math.random() * 3 : 1 + Math.random() * 4;
      this.balls.push({
        s,
        v: new Vector3(Math.cos(a) * out, up, Math.sin(a) * out),
        t: 0,
        life: smoke ? 3.5 + Math.random() * 2 : 0.7 + Math.random() * 0.6,
        k0: 0.4,
        k1: smoke ? 3.2 + Math.random() * 1.6 : 1.6 + Math.random() * 1.3,
        smoke,
      });
    }
  }
  step(dt: number, time: number) {
    for (const f of this.flashes) f.t += dt;
    this.flashes = this.flashes.filter((f) => f.t < 2.5);
    for (const [id, b] of this.burning) {
      if (!b.seen) {
        for (const s of b.s) this.putAway(s);
        this.burning.delete(id);
        continue;
      }
      b.seen = false;
      // (each tongue rising and thinning over its cycle, flickering, then again from the bay)
      b.s.forEach((s, i) => {
        b.ph[i] = (b.ph[i] + dt * (1.3 + (i % 5) * 0.12)) % 1;
        const p = b.ph[i];
        const o = b.off[i];
        const w = (0.28 + 0.3 * ((i * 0.37) % 1)) * (1 - p * 0.55) * (0.6 + 0.4 * b.k);
        const fl = 0.85 + 0.15 * Math.sin(time * 19 + i * 3.1);
        s.scale.set(w * fl, w * 2.2 * fl, 1);
        s.position.set(
          b.at.x + o[0] * (1 - p * 0.4),
          b.at.y + o[1] + p * 0.75 * (0.6 + 0.4 * b.k) + w * 0.55,
          b.at.z + o[2] * (1 - p * 0.4),
        );
        (s.material as SpriteMaterial).opacity = 0.95 * Math.sin(Math.PI * p) ** 0.6;
      });
    }
    for (let i = this.balls.length - 1; i >= 0; i--) {
      const b = this.balls[i];
      b.t += dt;
      const u = b.t / b.life;
      if (u >= 1) {
        this.putAway(b.s);
        this.balls.splice(i, 1);
        continue;
      }
      // (out fast, slowing; the smoke on up)
      const drag = b.smoke ? 1.4 : 3.2;
      b.v.multiplyScalar(Math.max(0, 1 - drag * dt));
      if (b.smoke) b.v.y += 0.6 * dt;
      b.s.position.addScaledVector(b.v, dt);
      const k = b.k0 + (b.k1 - b.k0) * (1 - (1 - u) ** 3);
      b.s.scale.set(k, k, 1);
      (b.s.material as SpriteMaterial).opacity = b.smoke ? 0.9 * Math.min(1, u * 5) * (1 - u) : 0.95 * (1 - u) ** 1.5;
    }
  }
  /** The blasts' flashes now (the cars' coords; `k`: 5 at the moment, gone over two seconds) — for the light. */
  flash(): { x: number; y: number; z: number; k: number }[] {
    return this.flashes.map((f) => ({ x: f.x, y: f.y, z: f.z, k: 5 * Math.exp(-f.t * 2.2) }));
  }
  dispose() {
    for (const b of this.burning.values()) for (const s of b.s) this.putAway(s);
    for (const b of this.balls) this.putAway(b.s);
    for (const s of this.spare) (s.material as SpriteMaterial).dispose();
    this.spare.length = 0;
    if (this.tex) for (const t of Object.values(this.tex)) t.dispose();
  }
}

/** (plan 94 P3) Glass out of a pane: little bits of it tumbling down, glinting, lying a while where they fell,
 *  then gone. One instanced mesh for every car's. */
export class Shards {
  private mesh: InstancedMesh;
  private geo: BufferGeometry;
  private mat: MeshLambertMaterial;
  private p: Float32Array;
  private v: Float32Array;
  private q: Quaternion[];
  private spin: Quaternion[];
  private size: Float32Array;
  private life: Float32Array;
  private lying: Uint8Array;
  private i = 0;
  private live = 0;
  private m = new Matrix4();
  private s = new Vector3();
  private t = new Vector3();
  constructor(
    root: Group,
    private ground: (x: number, z: number) => number,
    private n = 320,
  ) {
    // (a sliver of a triangle, 1 unit across: scaled each)
    this.geo = new BufferGeometry();
    this.geo.setAttribute("position", new Float32BufferAttribute([0, 0, 0.5, 0.45, 0, -0.3, -0.4, 0, -0.25], 3));
    this.geo.setAttribute("normal", new Float32BufferAttribute([0, 1, 0, 0, 1, 0, 0, 1, 0], 3));
    this.mat = litMaterial({
      color: 0xd9e8ee,
      roughness: 0.08,
      metalness: 0.55,
      transparent: true,
      opacity: 0.8,
      side: DoubleSide,
      depthWrite: false,
    });
    this.mesh = new InstancedMesh(this.geo, this.mat, n);
    this.mesh.frustumCulled = false;
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.mesh.visible = false;
    this.p = new Float32Array(n * 3);
    this.v = new Float32Array(n * 3);
    this.q = Array.from({ length: n }, () => new Quaternion());
    this.spin = Array.from({ length: n }, () => new Quaternion());
    this.size = new Float32Array(n);
    this.life = new Float32Array(n);
    this.lying = new Uint8Array(n);
    this.m.makeScale(0, 0, 0);
    for (let i = 0; i < n; i++) this.mesh.setMatrixAt(i, this.m);
    root.add(this.mesh);
  }
  /** (plan 94 phase 9) its mesh, to be made ready before it's first wanted */
  get warmMesh(): InstancedMesh {
    return this.mesh;
  }
  /** `count` bits from round (x, y, z) — a pane's middle —, out along (nx, nz) a little, with the car's own
   *  (vx, vz): most fall straight down out of the frame. */
  burst(x: number, y: number, z: number, count: number, vx: number, vz: number, nx = 0, nz = 0) {
    for (let k = 0; k < count; k++) {
      const i = this.i++ % this.n;
      this.p[i * 3] = x + (Math.random() - 0.5) * 0.6;
      this.p[i * 3 + 1] = y + (Math.random() - 0.5) * 0.35;
      this.p[i * 3 + 2] = z + (Math.random() - 0.5) * 0.6;
      const out = 0.3 + Math.random() * 1.6;
      this.v[i * 3] = vx * 0.6 + nx * out + (Math.random() - 0.5) * 1.2;
      this.v[i * 3 + 1] = Math.random() * 1.4;
      this.v[i * 3 + 2] = vz * 0.6 + nz * out + (Math.random() - 0.5) * 1.2;
      this.q[i].setFromAxisAngle(this.t.set(Math.random(), Math.random(), Math.random()).normalize(), Math.random() * 6);
      // (its tumble: a turn a step, made from the turn a second)
      this.spin[i].setFromAxisAngle(this.t.set(Math.random() - 0.5, Math.random(), Math.random() - 0.5).normalize(), 0.25);
      this.size[i] = 0.025 + Math.random() * 0.05;
      this.life[i] = 7 + Math.random() * 5;
      this.lying[i] = 0;
    }
    this.live = this.n;
    this.mesh.visible = true;
  }
  step(dt: number) {
    if (!this.live) return;
    let any = 0;
    for (let i = 0; i < this.n; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        this.m.makeScale(0, 0, 0);
        this.mesh.setMatrixAt(i, this.m);
        continue;
      }
      any++;
      if (!this.lying[i]) {
        this.v[i * 3 + 1] -= 9.8 * dt;
        this.p[i * 3] += this.v[i * 3] * dt;
        this.p[i * 3 + 1] += this.v[i * 3 + 1] * dt;
        this.p[i * 3 + 2] += this.v[i * 3 + 2] * dt;
        this.q[i].multiply(this.spin[i]);
        const g = this.ground(this.p[i * 3], this.p[i * 3 + 2]) + 0.006;
        if (this.p[i * 3 + 1] <= g) {
          // (landed: flat on the ground, turned any way)
          this.p[i * 3 + 1] = g;
          this.lying[i] = 1;
          this.q[i].setFromAxisAngle(this.t.set(0, 1, 0), Math.random() * 6.28);
        }
      }
      // (going: smaller over its last second)
      const k = this.size[i] * Math.min(1, this.life[i]);
      this.s.set(k, k, k);
      this.t.set(this.p[i * 3], this.p[i * 3 + 1], this.p[i * 3 + 2]);
      this.m.compose(this.t, this.q[i], this.s);
      this.mesh.setMatrixAt(i, this.m);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    this.live = any;
    if (!any) this.mesh.visible = false;
  }
  dispose() {
    this.mesh.removeFromParent();
    this.mesh.dispose();
    this.geo.dispose();
    this.mat.dispose();
  }
}

/** What falls off a car (a bumper): a crate on Jolt where there's a world (its position; it tumbles as it
 *  goes), or a fall of its own onto the land; left a while, then gone. */
export interface DebrisHost {
  add(x: number, y: number, z: number, v?: [number, number, number]): number | null;
  at(id: number, out: [number, number, number]): boolean;
  remove(id: number): void;
  ground(x: number, z: number): number;
}
export class Debris {
  private bits: {
    o: Object3D;
    id: number | null;
    v: Vector3;
    spin: Vector3;
    t: number;
    last: Vector3;
    /** (plan 94 P2) how it lies once still: as it was on the car, or a door on its face */
    lie: Quaternion;
  }[] = [];
  /** how long a piece lies before it goes, s (the memory probes shorten it: e2e/car-life.ts) */
  keepS = 120;
  private dq = new Quaternion();
  private ax = new Vector3();
  private at: [number, number, number] = [0, 0, 0];
  constructor(
    private root: Group,
    private host: DebrisHost,
  ) {}
  /** `o` (in the root's coords, as it was on the car) let go, moving `v`; `flat`: turned so, it lies (a door on
   *  its face) — else as it was. (plan 94 P2: sixteen at once, two minutes each) */
  drop(o: Object3D, v: Vector3, flat: Quaternion | null = null, free = false) {
    if (this.bits.length >= 16) this.free(this.bits.shift());
    this.root.add(o);
    const p = o.position;
    const go = v
      .clone()
      .multiplyScalar(0.8)
      .add(new Vector3(0, 1.2, 0));
    // (on Jolt: going as it was let go; `free`, a fall of its own — plan 94 P1: thrown by a blast out of a parked
    // car, whose solid box it starts inside)
    const id = free ? null : this.host.add(p.x, p.y, p.z, [go.x, go.y, go.z]);
    this.bits.push({
      o,
      id,
      v: go,
      spin: new Vector3((Math.random() - 0.5) * 8, (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 8),
      t: 0,
      last: p.clone(),
      lie: flat ? flat.clone().multiply(o.quaternion) : o.quaternion.clone(),
    });
  }
  step(dt: number) {
    for (let i = this.bits.length - 1; i >= 0; i--) {
      const b = this.bits[i];
      b.t += dt;
      if (b.t > this.keepS) {
        this.free(b);
        this.bits.splice(i, 1);
        continue;
      }
      const p = b.o.position;
      if (b.id !== null && this.host.at(b.id, this.at)) {
        b.last.copy(p);
        p.set(this.at[0], this.at[1], this.at[2]);
      } else {
        // (no world: its own fall, onto the land, sliding to a stop)
        b.v.y -= 9.8 * dt;
        p.addScaledVector(b.v, dt);
        const g = this.host.ground(p.x, p.z) + 0.08;
        if (p.y < g) {
          p.y = g;
          b.v.y = Math.abs(b.v.y) * 0.2;
          b.v.x *= 1 - Math.min(1, dt * 3);
          b.v.z *= 1 - Math.min(1, dt * 3);
        }
      }
      // (it tumbles while it moves; still, it lies)
      const moving = b.id !== null ? p.distanceTo(b.last) / Math.max(dt, 1e-3) : b.v.length();
      const k = Math.min(1, moving / 3);
      const w = b.spin.length();
      if (w > 1e-6 && k > 0) {
        this.dq.setFromAxisAngle(this.ax.copy(b.spin).divideScalar(w), w * dt * k);
        b.o.quaternion.premultiply(this.dq);
      }
      // (settling: toward lying — as it was, turned on the ground the way it ended up, or a door on its face)
      if (k < 0.05) b.o.quaternion.slerp(b.lie, Math.min(1, dt * 2.5));
    }
  }
  private free(b: (typeof this.bits)[number] | undefined) {
    if (!b) return;
    if (b.id !== null) this.host.remove(b.id);
    b.o.removeFromParent();
    b.o.traverse((x) => {
      const m = x as Mesh;
      if (m.isMesh && !m.geometry.userData.shared) m.geometry.dispose();
    });
  }
  dispose() {
    for (const b of this.bits) this.free(b);
    this.bits.length = 0;
  }
}

const c0 = new Color();
let sparkTex: CanvasTexture | null = null;
function spark(): CanvasTexture {
  if (sparkTex) return sparkTex;
  const cv = document.createElement("canvas");
  cv.width = cv.height = 32;
  const g = cv.getContext("2d") as CanvasRenderingContext2D;
  const grd = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  grd.addColorStop(0, "rgba(255,255,255,1)");
  grd.addColorStop(0.25, "rgba(255,230,180,0.9)");
  grd.addColorStop(1, "rgba(255,160,60,0)");
  g.fillStyle = grd;
  g.fillRect(0, 0, 32, 32);
  sparkTex = new CanvasTexture(cv);
  return sparkTex;
}

/** (plan 93 S6) The snow on a roof sliding off in a slab — pulled away from under it, or thrown forward over the
 *  windscreen by a hard stop, or blown back off at speed: it slides along the roof a moment, goes over its edge
 *  tipping, falls and bursts into powder on the ground. A few at once at most. */
export class Slabs {
  private list: {
    o: Mesh;
    v: Vector3;
    axis: Vector3;
    spin: number;
    t: number;
    slide: number;
    along: Vector3;
    push: number;
  }[] = [];
  private mat: MeshLambertMaterial | null = null;
  constructor(
    private root: Group,
    private spray: Spray,
    private ground: (x: number, z: number) => number,
  ) {}
  /** A slab off a roof: `at` its middle (the cars' group's frame), `fwd` the car's nose, `v` its velocity, its
   *  size (m), `dir` +1 forward (braked), −1 back (pulled away, blown off). */
  shed(at: Vector3, fwd: Vector3, v: Vector3, len: number, wid: number, th: number, dir: 1 | -1) {
    if (this.list.length >= 4) return;
    this.mat ??= litMaterial({ color: 0xf2f5f8, roughness: 0.95 });
    const g = slabGeometry(len, th, wid);
    const o = new Mesh(g, this.mat);
    o.position.copy(at);
    o.rotation.y = -Math.atan2(fwd.z, fwd.x);
    o.castShadow = true;
    this.root.add(o);
    const along = fwd.clone().multiplyScalar(dir);
    // (it tips over the roof's edge it goes off: about the car's across)
    const axis = new Vector3(-fwd.z, 0, fwd.x).multiplyScalar(dir);
    this.list.push({ o, v: v.clone(), axis, spin: 0, t: 0, slide: len * 0.6, along, push: 1.6 + Math.random() * 0.8 });
  }
  step(dt: number) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const s = this.list[i];
      s.t += dt;
      if (s.slide > 0) {
        // (on the roof: sliding off it, the car going from under it)
        const d = s.push * dt;
        s.slide -= d;
        s.o.position.addScaledVector(s.along, d);
        s.o.position.addScaledVector(s.v, dt);
        if (s.slide <= 0) s.v.addScaledVector(s.along, s.push);
        continue;
      }
      // (off it: falling, tipping over its edge)
      s.v.y -= 9.81 * dt;
      s.o.position.addScaledVector(s.v, dt);
      s.spin = Math.min(5, s.spin + dt * 9);
      s.o.rotateOnWorldAxis(s.axis, s.spin * dt);
      const y = this.ground(s.o.position.x, s.o.position.z);
      if (s.o.position.y < y + 0.08 || s.t > 4) {
        const p = s.o.position;
        for (let k = 0; k < 6; k++)
          this.spray.puff(
            p.x + (Math.random() - 0.5) * 0.9,
            y + 0.15,
            p.z + (Math.random() - 0.5) * 0.9,
            s.v.x * 0.15 + (Math.random() - 0.5) * 1.2,
            0.5 + Math.random() * 0.6,
            s.v.z * 0.15 + (Math.random() - 0.5) * 1.2,
            1.1 + Math.random() * 0.6,
            1.4,
            0xf3f6f9,
            0.5,
          );
        s.o.removeFromParent();
        s.o.geometry.dispose();
        this.list.splice(i, 1);
      }
    }
  }
  dispose() {
    for (const s of this.list) {
      s.o.removeFromParent();
      s.o.geometry.dispose();
    }
    this.list = [];
    this.mat?.dispose();
  }
}

/** A slab of snow: a box worn soft — its top a little lumpy, thinning to its edges. */
function slabGeometry(len: number, th: number, wid: number): BufferGeometry {
  const g = new BoxGeometry(len, th, wid, 8, 1, 5);
  const p = g.getAttribute("position");
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i) / (len / 2);
    const z = p.getZ(i) / (wid / 2);
    const edge = Math.max(Math.abs(x), Math.abs(z));
    if (p.getY(i) > 0) {
      const lump = 0.25 * Math.sin(x * 5.1 + z * 2.3) * Math.cos(z * 4.2 - x);
      p.setY(i, (th / 2) * (1 - 0.8 * edge ** 3 + lump));
    }
  }
  g.computeVertexNormals();
  return g;
}

/** (plan 93 S7) The tow ropes between cars: each a run of short pieces from one car's back to the other's front,
 *  hanging slack between them, straight once it's pulled taut. An orange strap. */
export class Ropes {
  private mesh: InstancedMesh;
  private m4 = new Matrix4();
  private q = new Quaternion();
  private a = new Vector3();
  private b = new Vector3();
  private s = new Vector3();
  constructor(
    root: Group,
    private max = 8,
  ) {
    const g = new BoxGeometry(1, 0.012, 0.045);
    const mat = litMaterial({ color: 0xd8701a, roughness: 0.85 });
    this.mesh = new InstancedMesh(g, mat, max * ROPE_PIECES);
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = true;
    root.add(this.mesh);
  }
  /** This frame's ropes: their ends (the cars' group's frame) and their length (m). */
  draw(list: { a: Vector3; b: Vector3; len: number }[]) {
    let n = 0;
    for (const r of list.slice(0, this.max)) {
      const d = r.a.distanceTo(r.b);
      // (slack: hanging as deep as the rope that's left over allows; taut: straight)
      const sag = d < r.len ? Math.sqrt(r.len * r.len - d * d) * 0.45 : 0;
      for (let i = 0; i < ROPE_PIECES; i++) {
        const t0 = i / ROPE_PIECES;
        const t1 = (i + 1) / ROPE_PIECES;
        this.at(r, t0, sag, this.a);
        this.at(r, t1, sag, this.b);
        const len = this.a.distanceTo(this.b);
        this.s.subVectors(this.b, this.a).normalize();
        this.q.setFromUnitVectors(ROPE_X, this.s);
        this.a.add(this.b).multiplyScalar(0.5);
        this.m4.compose(this.a, this.q, this.s.set(len + 0.01, 1, 1));
        this.mesh.setMatrixAt(n++, this.m4);
      }
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
  }
  private at(r: { a: Vector3; b: Vector3 }, t: number, sag: number, out: Vector3) {
    out.lerpVectors(r.a, r.b, t);
    out.y -= sag * 4 * t * (1 - t);
    return out;
  }
  dispose() {
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    (this.mesh.material as MeshLambertMaterial).dispose();
  }
}
const ROPE_PIECES = 14;
const ROPE_X = new Vector3(1, 0, 0);
