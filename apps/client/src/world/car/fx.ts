import { campusLot } from "@yutopia/shared";
import { GRIP, type Ground, patchAt } from "@yutopia/shared/car";
import type * as GroundsModule from "@yutopia/shared/grounds";
import {
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  DynamicDrawUsage,
  Float32BufferAttribute,
  type Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  MultiplyBlending,
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
import type { Sedan } from "../tp/car/sedan";
import { windscreenSnow } from "../tp/car/textures";
import { patchGrounds } from "../tp/light3d";

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

/** Tyre tracks: a quad a wheel's step, fading back into the snow over minutes. */
export class Tracks {
  readonly mesh: InstancedMesh;
  private born: Float32Array;
  private base: Color[] = [];
  private n = 0;
  private last = new Map<string, { x: number; z: number }>();
  private fadeAt = 0;
  private m4 = new Matrix4();
  private q = new Quaternion();
  private s = new Vector3();
  private p = new Vector3();
  private c = new Color();
  constructor(
    root: Group,
    private max = 5000,
  ) {
    const geo = new PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    const mat = new MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, depthWrite: false });
    mat.polygonOffset = true;
    mat.polygonOffsetFactor = -3;
    this.mesh = new InstancedMesh(geo, mat, max);
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1;
    this.born = new Float32Array(max);
    for (let i = 0; i < max; i++) this.base.push(new Color());
    root.add(this.mesh);
  }
  /** A wheel at (x, z) on `g` (`id`: which car's which wheel), `y` the ground. */
  mark(id: string, x: number, y: number, z: number, g: Ground, now: number, sliding: boolean) {
    const tr = GRIP[g].trace;
    const prev = this.last.get(id);
    if (tr === "none" || tr === "spray") {
      this.last.delete(id);
      return;
    }
    if (!prev) {
      this.last.set(id, { x, z });
      return;
    }
    const d = Math.hypot(x - prev.x, z - prev.z);
    if (d < 0.35) return;
    if (d > 3) {
      this.last.set(id, { x, z });
      return;
    }
    const i = this.n % this.max;
    this.n++;
    const w = tr === "ruts" ? 0.24 : tr === "scratch" ? 0.18 : 0.2;
    this.p.set((x + prev.x) / 2, y + 0.035, (z + prev.z) / 2);
    this.q.setFromAxisAngle(new Vector3(0, 1, 0), -Math.atan2(z - prev.z, x - prev.x) + Math.PI / 2);
    this.s.set(w, 1, d + 0.04);
    this.m4.compose(this.p, this.q, this.s);
    this.mesh.setMatrixAt(i, this.m4);
    this.base[i].setHex(trackCol[g] ?? 0x9aa6b6);
    if (sliding && g === "ice") this.base[i].multiplyScalar(0.85);
    this.born[i] = now;
    this.mesh.setColorAt(i, this.base[i]);
    this.mesh.count = Math.min(this.max, this.n);
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    this.last.set(id, { x, z });
  }
  /** The old ones fill back in (a second at a time: they fade over four minutes). */
  fade(now: number, night: number) {
    if (now - this.fadeAt < 1) return;
    this.fadeAt = now;
    const n = Math.min(this.max, this.n);
    const bg = SNOW_BACK.clone().multiplyScalar(1 - 0.75 * night);
    for (let i = 0; i < n; i++) {
      const k = Math.min(1, (now - this.born[i]) / 240);
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
    (this.mesh.material as MeshBasicMaterial).dispose();
  }
}

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
 *  lit as the land is (light3d patchGrounds). */
export class RoadPatches {
  private mesh: Object3D | null = null;
  private cold = -1;
  constructor(
    private root: Group,
    private G: typeof GroundsModule,
  ) {}
  update(cold: number) {
    const band = cold > 0.6 ? 2 : cold > 0.35 ? 1 : 0;
    if (band === this.cold) return;
    this.cold = band;
    this.dispose();
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
      const y = this.G.heightAt(x, z) + 0.025;
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
      if (!pos[0].length) return;
      const geo = new BufferGeometry();
      geo.setAttribute("position", new Float32BufferAttribute(pos[0], 3));
      geo.setAttribute("uv", new Float32BufferAttribute(pos[1], 2));
      geo.computeVertexNormals();
      const m = new Mesh(geo, mat);
      m.receiveShadow = true;
      m.renderOrder = 1;
      g.add(m);
    };
    // dst × mix(1, colour, alpha): darker where it lies, never brighter (premultiplied: three's MultiplyBlending)
    add(
      slush,
      new MeshBasicMaterial({
        color: 0x8f8a84,
        map: slushTex(),
        transparent: true,
        premultipliedAlpha: true,
        blending: MultiplyBlending,
        depthWrite: false,
        toneMapped: false,
        fog: false,
        polygonOffset: true,
        polygonOffsetFactor: -2,
      }),
    );
    const iceMat = new MeshStandardMaterial({
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
    patchGrounds(iceMat);
    add(ice, iceMat);
    this.mesh = g;
    this.root.add(g);
  }
  dispose() {
    if (!this.mesh) return;
    this.mesh.removeFromParent();
    this.mesh.traverse((m) => {
      const mm = m as Mesh;
      if (mm.isMesh) {
        mm.geometry.dispose();
        (mm.material as MeshStandardMaterial).dispose();
      }
    });
    this.mesh = null;
  }
}

/** The windscreen's snow: three amounts, with and without the wipers' fans — each painted the
 *  first time it's wanted, one a frame (a few milliseconds each), kept. */
export class ScreenSnow {
  private tex = new Map<string, Texture>();
  amount = 0;
  constructor(private model: Sedan) {}
  private get(fans: boolean, k: number): Texture | null {
    const key = `${fans}|${k}`;
    const hit = this.tex.get(key);
    if (hit) return hit;
    if (this.paintedAt === this.frame) return null; // (one a frame)
    this.paintedAt = this.frame;
    const s = this.model.screen;
    const w = fans
      ? this.model.wipers.map((x) => ({ z: x.pivot, arm: x.len, blade: x.blade, a0: x.sweep, a1: x.park }))
      : [];
    const t = windscreenSnow(s.hw0, s.len, [0.35, 0.7, 1][k], w, (fans ? 30 : 20) + k, 512);
    this.tex.set(key, t);
    return t;
  }
  private frame = 0;
  private paintedAt = -1;
  step(dt: number, snowing: number, speed: number, wipers: number, parked: boolean) {
    this.frame++;
    if (wipers > 0) this.amount += (snowing * 0.25 - this.amount) * Math.min(1, dt * (0.6 + wipers));
    else
      this.amount = Math.min(
        1,
        this.amount + dt * snowing * (0.012 + Math.min(speed, 25) * 0.0015) * (parked ? 0.4 : 1),
      );
    if (this.amount < 0.03) {
      this.model.setScreenSnow(null);
      return;
    }
    const k = this.amount < 0.4 ? 0 : this.amount < 0.75 ? 1 : 2;
    const t = this.get(wipers > 0, k);
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
    this.lamps = [...G.LAMPS.map((l) => ({ x: l.x, z: l.z })), ...campusLot(36).lamps];
  }
  step(model: Sedan, night: number) {
    model.root.updateMatrixWorld();
    const p = model.root.position;
    let k = 0;
    if (night > 0.2)
      for (const l of this.lamps) {
        const d2 = (l.x - p.x) ** 2 + (l.z - p.z) ** 2;
        if (d2 < 100) k += Math.exp(-d2 / 16);
      }
    this.light.intensity = Math.min(1.4, k) * night * 0.9;
    if (this.light.parent !== model.body) model.body.add(this.light);
    this.light.position.set(0.1, 1.42, 0);
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
