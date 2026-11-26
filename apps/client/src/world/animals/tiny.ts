// The tiny life (docs/plan/126-animal-life.md, phase 5, F4b follow-up): what each client draws on its own, seeded by
// place and time so everyone sees much the same — butterflies over the open ground on warm days, fireflies at the
// woods' edge and the water on warm nights, fish under the water's skin (one leaping now and then), and flocks far
// up crossing the sky by day. No server, a few instanced meshes, moved on the CPU (a couple of hundred at most).
import { habitatAt } from "@yutopia/shared/animals/habitat";
import { heightAt, waterAt } from "@yutopia/shared/grounds";
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  Object3D,
  Points,
  PointsMaterial,
  Quaternion,
  Vector3,
} from "three";

export interface TinyWorld {
  hour: number;
  /** the air (°C), snow lying (0..1), rain/sleet falling (0..1) */
  temp: number;
  snow: number;
  fall: number;
}

const CELL = 24; // m: a cell's handful
const R = 3; // cells round the camera each way
const MAX_BUTTERFLIES = 60;
const MAX_FIREFLIES = 160;
const MAX_FISH = 90;
const MAX_FLOCK = 48;

function hash(a: number, b: number, k: number): number {
  let h = Math.imul(a, 374761393) ^ Math.imul(b, 668265263) ^ Math.imul(k, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

interface Cell {
  open: number;
  edge: number;
  water: { level: number } | null;
  wx: number;
  wz: number;
  /** its fireflies' ground (m), each at its own spot in the cell: worked out once */
  flyH: Float32Array | null;
}

/** A wing: a quad hinged at x = 0, out to +x. */
function wing(w: number, l: number): BufferGeometry {
  const g = new BufferGeometry();
  g.setAttribute("position", new Float32BufferAttribute([0, 0, -l / 2, w, 0, -l / 3, w * 0.8, 0, l / 2, 0, 0, l / 3], 3));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  return g;
}
/** A fish: a slim diamond, tail at -x. */
function fishGeo(): BufferGeometry {
  const g = new BufferGeometry();
  // body (two triangles each side, flat-ish), a tail fin
  const p = [0.16, 0, 0, 0, 0.035, 0, -0.1, 0, 0, 0, -0.03, 0, 0, 0, 0.022, 0, 0, -0.022, -0.1, 0, 0, -0.17, 0.05, 0, -0.17, -0.05, 0];
  g.setAttribute("position", new Float32BufferAttribute(p, 3));
  g.setIndex([0, 1, 4, 0, 4, 3, 0, 5, 1, 0, 3, 5, 2, 4, 1, 2, 3, 4, 2, 1, 5, 2, 5, 3, 6, 7, 8]);
  g.computeVertexNormals();
  return g;
}

export class TinyLife {
  readonly root = new Group();
  private cells = new Map<string, Cell>();
  private bfL: InstancedMesh;
  private bfR: InstancedMesh;
  private fish: InstancedMesh;
  private flockL: InstancedMesh;
  private flockR: InstancedMesh;
  private flies: Points;
  private flyPos: Float32Array;
  private flyCol: Float32Array;
  private m = new Matrix4();
  private q = new Quaternion();
  private o = new Object3D();
  private v = new Vector3();
  // (scratch for wingAt: nothing made a frame)
  private q2 = new Quaternion();
  private turn = new Quaternion();
  private one = new Vector3(1, 1, 1);
  private static readonly UP = new Vector3(0, 1, 0);
  private static readonly ALONG = new Vector3(0, 0, 1);
  private instanced: InstancedMesh[];

  constructor() {
    const colours = [0xf2c14e, 0xffffff, 0xe0703a, 0x86b6e8, 0xf4e8a0];
    const bmat = new MeshBasicMaterial({ color: 0xffffff, side: DoubleSide });
    this.bfL = new InstancedMesh(wing(0.04, 0.05), bmat, MAX_BUTTERFLIES);
    this.bfR = new InstancedMesh(wing(0.04, 0.05), bmat, MAX_BUTTERFLIES);
    for (let i = 0; i < MAX_BUTTERFLIES; i++) {
      const c = new Color(colours[i % colours.length]);
      this.bfL.setColorAt(i, c);
      this.bfR.setColorAt(i, c);
    }
    this.fish = new InstancedMesh(fishGeo(), new MeshBasicMaterial({ color: 0x55636e }), MAX_FISH);
    const fmat = new MeshBasicMaterial({ color: 0x1c1d22, side: DoubleSide });
    this.flockL = new InstancedMesh(wing(0.5, 0.25), fmat, MAX_FLOCK);
    this.flockR = new InstancedMesh(wing(0.5, 0.25), fmat, MAX_FLOCK);
    this.flyPos = new Float32Array(MAX_FIREFLIES * 3);
    this.flyCol = new Float32Array(MAX_FIREFLIES * 3);
    const pg = new BufferGeometry();
    pg.setAttribute("position", new BufferAttribute(this.flyPos, 3));
    pg.setAttribute("color", new BufferAttribute(this.flyCol, 3));
    this.flies = new Points(
      pg,
      new PointsMaterial({ size: 0.09, vertexColors: true, transparent: true, depthWrite: false, blending: AdditiveBlending }),
    );
    this.instanced = [this.bfL, this.bfR, this.fish, this.flockL, this.flockR];
    for (const x of [...this.instanced, this.flies]) {
      x.frustumCulled = false;
      this.root.add(x);
    }
  }

  dispose() {
    this.root.removeFromParent();
    const mats = new Set<{ dispose(): void }>();
    for (const x of this.instanced) {
      x.geometry.dispose();
      mats.add(x.material as MeshBasicMaterial);
      x.dispose();
    }
    this.flies.geometry.dispose();
    mats.add(this.flies.material as PointsMaterial);
    for (const m of mats) m.dispose();
  }

  private cell(cx: number, cz: number): Cell {
    const k = `${cx},${cz}`;
    let c = this.cells.get(k);
    if (!c) {
      const x = (cx + 0.5) * CELL;
      const z = (cz + 0.5) * CELL;
      const h = habitatAt(x, z);
      const w = waterAt(x, z);
      c = {
        open: (h.field ?? 0) + (h.meadow ?? 0) + (h.farm ?? 0) * 0.6,
        edge: Math.min(1, (h.forest ?? 0) * (1 - (h.deepwoods ?? 0)) + (h.shore ?? 0)),
        water: w && w.depth > 0.6 ? { level: w.level } : null,
        wx: x,
        wz: z,
        flyH: null,
      };
      this.cells.set(k, c);
      if (this.cells.size > 4000) this.cells.clear();
    }
    return c;
  }

  /** Every frame: round the camera (x, z), at `t` s (the world's clock), in this weather. */
  frame(cam: { x: number; z: number }, t: number, w: TinyWorld) {
    const day = w.hour >= 7 && w.hour < 19;
    const night = w.hour >= 21 || w.hour < 4.5;
    const warm = w.temp > 9 && w.snow < 0.2 && w.fall < 0.3;
    const ccx = Math.floor(cam.x / CELL);
    const ccz = Math.floor(cam.z / CELL);
    let nb = 0;
    let nf = 0;
    let nfi = 0;
    for (let j = -R; j <= R; j++)
      for (let i = -R; i <= R; i++) {
        const cx = ccx + i;
        const cz = ccz + j;
        const c = this.cell(cx, cz);
        // butterflies over the open ground, warm days
        if (warm && day && c.open > 0.4)
          for (let k = 0; k < 2 && nb < MAX_BUTTERFLIES; k++) {
            if (hash(cx, cz, k) > c.open * 0.5) continue;
            const s = hash(cx, cz, k + 9) * 100;
            const x = c.wx + Math.sin(t * 0.31 + s) * 8 + Math.sin(t * 0.83 + s * 2) * 2;
            const z = c.wz + Math.cos(t * 0.27 + s) * 8 + Math.cos(t * 0.71 + s * 3) * 2;
            const y = heightAt(x, z) + 0.5 + Math.abs(Math.sin(t * 1.3 + s)) * 0.7;
            // (heading along its path: d/dt of x and z above, as the floor's atan2(z, x) wingAt takes)
            const yaw = Math.atan2(-Math.sin(t * 0.27 + s) * 0.27 * 8, Math.cos(t * 0.31 + s) * 0.31 * 8);
            const flap = Math.sin(t * 22 + s) * 1.1;
            this.wingAt(this.bfL, this.bfR, nb, x, y, z, yaw, flap, 1);
            nb++;
          }
        // fireflies by the woods' edge and the water, warm nights
        if (warm && night && c.edge > 0.3)
          for (let k = 0; k < 8 && nfi < MAX_FIREFLIES; k++) {
            if (hash(cx, cz, k + 40) > c.edge * 0.8) continue;
            const s = hash(cx, cz, k + 50) * 100;
            const bx = c.wx + (hash(cx, cz, k + 60) - 0.5) * CELL;
            const bz = c.wz + (hash(cx, cz, k + 70) - 0.5) * CELL;
            // (the ground at its spot, once: it drifts a metre or so round it)
            if (!c.flyH) {
              c.flyH = new Float32Array(8);
              c.flyH.fill(Number.NaN);
            }
            if (Number.isNaN(c.flyH[k])) c.flyH[k] = heightAt(bx, bz);
            const x = bx + Math.sin(t * 0.4 + s) * 1.5;
            const z = bz + Math.cos(t * 0.37 + s) * 1.5;
            const y = c.flyH[k] + 0.4 + Math.sin(t * 0.6 + s) * 0.3 + 0.4;
            const glow = Math.max(0, Math.sin(t * 2.1 + s * 7)) ** 3;
            const o = nfi * 3;
            this.flyPos[o] = x;
            this.flyPos[o + 1] = y;
            this.flyPos[o + 2] = z;
            this.flyCol[o] = glow * 0.9;
            this.flyCol[o + 1] = glow;
            this.flyCol[o + 2] = glow * 0.35;
            nfi++;
          }
        // fish under the water's skin, a shoal circling; one leaping now and then
        if (c.water && w.snow < 0.9)
          for (let k = 0; k < 6 && nf < MAX_FISH; k++) {
            const s = hash(cx, cz, k + 80) * 100;
            const r = 2 + hash(cx, cz, k + 90) * 3;
            const a = t * (0.35 + hash(cx, cz, k) * 0.2) + s;
            const x = c.wx + Math.cos(a) * r;
            const z = c.wz + Math.sin(a) * r;
            const here = waterAt(x, z);
            if (!here || here.depth < 0.6) continue;
            let y = here.level - 0.35 - hash(cx, cz, k + 3) * 0.4;
            let pitch = 0;
            // (a leap: every so often, an arc out of the water)
            const leap = ((t + s * 3) % 23) / 23;
            if (k === 0 && leap > 0.96) {
              const u = (leap - 0.96) / 0.04;
              y = here.level + Math.sin(u * Math.PI) * 0.5;
              pitch = Math.cos(u * Math.PI) * 0.9;
            }
            this.o.position.set(x, y, z);
            this.o.rotation.set(0, -(a + Math.PI / 2), pitch);
            this.o.scale.setScalar(1 + hash(cx, cz, k + 7));
            this.o.updateMatrix();
            this.fish.setMatrixAt(nf++, this.o.matrix);
          }
      }
    // flocks far up, crossing the sky by day (a V, its own path round the camera)
    let nk = 0;
    if (day && w.fall < 0.6) {
      const per = 70; // s a crossing
      const n = Math.floor(t / per);
      const u = (t % per) / per;
      const ang = hash(n, 1, 7) * Math.PI * 2;
      const dx = Math.cos(ang);
      const dz = Math.sin(ang);
      const side = (hash(n, 2, 7) - 0.5) * 120;
      const cx = cam.x - dx * 260 + dx * 520 * u - dz * side;
      const cz = cam.z - dz * 260 + dz * 520 * u + dx * side;
      const alt = heightAt(cam.x, cam.z) + 55 + hash(n, 3, 7) * 40;
      const birds = 9 + Math.floor(hash(n, 4, 7) * 14);
      for (let b = 0; b < birds && nk < MAX_FLOCK; b++) {
        const row = Math.ceil(b / 2);
        const sgn = b % 2 ? 1 : -1;
        const x = cx - dx * row * 3 + -dz * sgn * row * 2.6;
        const z = cz - dz * row * 3 + dx * sgn * row * 2.6;
        const flap = Math.sin(t * 7 + b) * 0.6;
        this.wingAt(this.flockL, this.flockR, nk, x, alt + Math.sin(t + b) * 0.5, z, Math.atan2(dz, dx), flap, 1);
        nk++;
      }
    }
    this.bfL.count = this.bfR.count = nb;
    this.flockL.count = this.flockR.count = nk;
    this.fish.count = nf;
    for (const x of this.instanced) x.instanceMatrix.needsUpdate = true;
    this.flies.geometry.setDrawRange(0, nfi);
    (this.flies.geometry.getAttribute("position") as BufferAttribute).needsUpdate = true;
    (this.flies.geometry.getAttribute("color") as BufferAttribute).needsUpdate = true;
  }

  /** A pair of wings at (x, y, z) heading `yaw`, opened `flap` rad about the body's line. */
  private wingAt(l: InstancedMesh, r: InstancedMesh, i: number, x: number, y: number, z: number, yaw: number, flap: number, k: number) {
    this.v.set(x, y, z);
    this.one.setScalar(k);
    // (the body's line along +z after the yaw; each wing turned up/down about it)
    this.q.setFromAxisAngle(TinyLife.UP, -yaw + Math.PI / 2);
    this.turn.setFromAxisAngle(TinyLife.ALONG, flap);
    this.m.compose(this.v, this.q2.copy(this.q).multiply(this.turn), this.one);
    l.setMatrixAt(i, this.m);
    this.turn.setFromAxisAngle(TinyLife.ALONG, Math.PI - flap);
    this.m.compose(this.v, this.q2.copy(this.q).multiply(this.turn), this.one);
    r.setMatrixAt(i, this.m);
  }
}
